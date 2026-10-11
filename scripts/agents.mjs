#!/usr/bin/env node
/**
 * AGENTS.md 管控块确定性渲染器(add-003,决策 D11)。
 *
 * 把器灵的全局管控纪律渲染进目标项目根的 AGENTS.md,让宿主每轮会话
 * 自动注入的上下文里带上"按场景选命令"的触发表——未敲 /ql- 命令的
 * 会话也知道走器灵流程,堵住管控旁路。
 *
 * 两层结构(D11):
 *   管理块  <!-- ql:managed:start --> … <!-- ql:managed:end -->
 *           —— 本脚本从工件提取事实渲染,幂等可重复,--check 可测漂移
 *   手写区  管理块之外的全部内容 —— 项目概述/构建/风格等,AI 层(/ql-init)
 *           仅在首次生成时写,本脚本在任何路径下都不触碰
 *
 * 提取源(全部缺件时显式写"未检出",禁止留空或编造——沿用 docsmap 纪律):
 *   宪法   <root>/.qiling/planning/context/constitution.md → C 原则标题清单
 *   契约   <root>/.qiling/planning/context/openapi.yaml → info.version + 端点数
 *   状态   <root>/.qiling/planning/STATE.md → status/current_phase/last_activity
 *   文档树 <root>/.qiling/docs/chapters/*.md → 章节数 + 篇目数
 *   命令   <root>/package.json → scripts 键清单
 *   插件版本 PLUGIN_ROOT/package.json(单一来源,版本号禁止硬编码)
 *
 * 触发表是器灵的领域知识,写死在本脚本;自检断言触发表引用的命令与
 * PLUGIN_ROOT/commands/ 实际清单一致(deprecated 旧别名除外),防止
 * 命令改名后 AGENTS.md 指向不存在的命令。
 *
 * 用法:
 *   node scripts/agents.mjs [--root <dir>]            渲染并落盘(内容未变不写)
 *   node scripts/agents.mjs --check [--root <dir>]    漂移检测:重渲染 vs 磁盘,漂移退出 1
 *   node scripts/agents.mjs --dry-run [--root <dir>]  预览渲染结果,不落盘
 *   node scripts/agents.mjs --out <file>              输出路径覆盖(默认 <root>/AGENTS.md)
 *   node scripts/agents.mjs --self-test               临时目录端到端自测
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname, resolve, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
// PLUGIN_ROOT = 器灵插件自身(命令清单与版本号从这里读);--root 才是目标项目
const PLUGIN_ROOT = join(__dirname, '..');

const MARK_START = '<!-- ql:managed:start -->';
const MARK_END = '<!-- ql:managed:end -->';

// 按场景选命令触发表(器灵领域知识,写死;自检保证命令存在且无遗漏)
const ROUTING_TABLE = [
  { scenario: '全新设计 / 新阶段', command: 'ql-design', rule: '讨论产出契约 + 流程图后才许写码' },
  { scenario: '按契约批量实现', command: 'ql-build', rule: '波次并行,骨架先行,验证全绿才过' },
  { scenario: '交付收尾', command: 'ql-deliver', rule: '双门:验证通过 + 独立评审 approved' },
  { scenario: '报 Bug / 异常 / 测试失败', command: 'ql-fix', rule: '先复现,根因未出禁止改代码' },
  { scenario: '加新功能(纯追加)', command: 'ql-add', rule: '契约先行 → 增量构建 → 章节同步' },
  { scenario: '替换 / 改造既有功能', command: 'ql-replace', rule: '旧端点必须过契约处置(deprecated / 移除)' },
  { scenario: '接手项目 / 生成或刷新文档树', command: 'ql-scan', rule: '从代码反推章节文档,格式与 ql-doc 一致' },
  { scenario: '交付后更新章节留档', command: 'ql-doc', rule: '按契约 + 构建报告产出功能章节' },
  { scenario: '升级器灵插件后', command: 'ql-update', rule: '工件迁移(自动备份,幂等)' },
  { scenario: 'AGENTS.md 管控块过期 / 漂移', command: 'ql-init', rule: '重渲染管理块,手写区永不触碰' },
  { scenario: '不确定下一步', command: 'ql-next', rule: '只读零副作用,从磁盘推导位置' },
];
// 旧别名不进触发表也不算漂移(仅输出改名提示,见契约 legacy-aliases)
const LEGACY_ALIASES = new Set(['ql-chapter', 'ql-discuss', 'ql-docsmap', 'ql-ship']);

function toAbsDir(p) { return isAbsolute(p) ? resolve(p) : join(process.cwd(), p); }

function readSafe(path) {
  try { return existsSync(path) ? readFileSync(path, 'utf8') : null; } catch { return null; }
}

function readJsonSafe(path) {
  const raw = readSafe(path);
  if (raw === null) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

/** STATE.md frontmatter 粗解析:单行 key: value + `>-`/`|` 折叠多行值 */
function parseStateFrontmatter(raw) {
  const fm = {};
  const FOLD_MARKERS = new Set(['>', '>-', '|', '|-', '|+']);
  const block = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!block) return fm;
  let currentKey = null;
  for (const line of block[1].split(/\r?\n/)) {
    const kv = line.match(/^([a-z_]+):\s*(.*)$/);
    if (kv) {
      currentKey = kv[1];
      fm[currentKey] = FOLD_MARKERS.has(kv[2].trim()) ? '' : kv[2].trim();
    } else if (currentKey && /^\s{2,}\S/.test(line)) {
      fm[currentKey] = (fm[currentKey] ? fm[currentKey] + ' ' : '') + line.trim();
    }
  }
  return fm;
}

/** 从目标项目工件提取渲染事实;每项缺件返回 null(渲染时写"未检出") */
function extractFacts(root) {
  const planning = join(root, '.qiling', 'planning');
  const facts = {
    pluginVersion: null,
    contractVersion: null,
    endpointCount: null,
    constitutionRules: null,
    state: null,
    chapters: null,
    parts: null,
    npmScripts: null,
  };

  facts.pluginVersion = readJsonSafe(join(PLUGIN_ROOT, 'package.json'))?.version ?? null;

  const contract = readSafe(join(planning, 'context', 'openapi.yaml'));
  if (contract !== null) {
    facts.contractVersion = contract.match(/^  version:\s*(\S+)/m)?.[1] ?? null;
    facts.endpointCount = (contract.match(/^ {2}\/\S.*:$/gm) ?? []).length;
  }

  const constitution = readSafe(join(planning, 'context', 'constitution.md'));
  if (constitution !== null) {
    facts.constitutionRules = [...constitution.matchAll(/^### (C\d+[^\n]*)$/gm)].map(m => m[1].trim());
  }

  const stateRaw = readSafe(join(planning, 'STATE.md'));
  if (stateRaw !== null) {
    const fm = parseStateFrontmatter(stateRaw);
    facts.state = {
      status: fm.status ?? null,
      phase: fm.current_phase ?? null,
      lastActivity: fm.last_activity ?? null,
    };
  }

  const chaptersDir = join(root, '.qiling', 'docs', 'chapters');
  if (existsSync(chaptersDir)) {
    const files = readdirSync(chaptersDir).filter(f => /^chapter-\d+.*\.md$/.test(f));
    facts.chapters = files.length;
    const parts = new Set();
    for (const f of files) {
      const head = readSafe(join(chaptersDir, f))?.slice(0, 400) ?? '';
      const part = head.match(/^part:\s*"?([^"\n]+)"?/m)?.[1];
      if (part) parts.add(part.trim());
    }
    facts.parts = parts.size || null;
  }

  facts.npmScripts = Object.keys(readJsonSafe(join(root, 'package.json'))?.scripts ?? {});

  return facts;
}

// 日期戳只进 stdout 报告,禁止写进管理块:块内容参与 --check 字节比对,
// 日历噪声会让漂移门跨日永久误报、幂等跨日失效(评审 C-2);QL_DATE 仅供自测注入时钟
function todayStamp() {
  return process.env.QL_DATE ?? new Date().toISOString().slice(0, 10);
}

/** 触发表自检:引用的命令必须真实存在于插件 commands/(防漂移);返回错误数组 */
function checkRoutingTable() {
  const errors = [];
  let actual = [];
  try {
    actual = readdirSync(join(PLUGIN_ROOT, 'commands'))
      .filter(f => f.endsWith('.md'))
      .map(f => f.replace(/\.md$/, ''));
  } catch { return ['插件 commands/ 目录不可读,触发表自检无法执行']; }
  for (const row of ROUTING_TABLE) {
    if (!actual.includes(row.command)) {
      errors.push(`触发表引用的命令 /${row.command} 在插件 commands/ 中不存在`);
    }
  }
  for (const name of actual) {
    if (!LEGACY_ALIASES.has(name) && !ROUTING_TABLE.some(r => r.command === name)) {
      errors.push(`插件命令 /${name} 未出现在触发表(新命令请同步 ROUTING_TABLE 或加入 LEGACY_ALIASES)`);
    }
  }
  return errors;
}

function renderManagedBlock(facts) {
  const L = [];
  L.push(MARK_START);
  L.push('');
  L.push(`## 器灵工作流管控(QiLing Workflow v${facts.pluginVersion ?? '(未检出)'})`);
  L.push('');
  L.push('> 本块由器灵从项目工件自动渲染(`<!-- ql:managed:start/end -->` 之间),请勿手改;');
  L.push('> 更新方式:重跑 `/ql-init` 或 `node <插件>/scripts/agents.mjs`。块外是你的手写区,器灵永不修改。');
  L.push('> 本块与 `.qiling/planning/context/` 下的工件冲突时,以工件为准。');
  L.push('');
  L.push('### 按场景选命令(先路由,再动手)');
  L.push('');
  L.push('| 场景 | 命令 | 纪律要点 |');
  L.push('|------|------|----------|');
  for (const row of ROUTING_TABLE) {
    L.push(`| ${row.scenario} | \`/${row.command}\` | ${row.rule} |`);
  }
  L.push('');
  L.push('### 铁律速览(摘自项目宪法 constitution.md)');
  L.push('');
  if (facts.constitutionRules && facts.constitutionRules.length > 0) {
    for (const rule of facts.constitutionRules) L.push(`- ${rule}`);
  } else {
    L.push('- 未检出(项目尚未初始化器灵宪法;跑 /ql-design 或 /ql-scan 后重试)');
  }
  L.push('');
  L.push('### 契约与决策(改行为前必读)');
  L.push('');
  if (facts.contractVersion !== null) {
    L.push(`- 契约:\`.qiling/planning/context/openapi.yaml\` v${facts.contractVersion}(${facts.endpointCount} 端点)——改端点先改契约`);
  } else {
    L.push('- 契约:未检出(无 .qiling/planning/context/openapi.yaml)——改端点前先跑 /ql-design 或 /ql-scan 补契约');
  }
  L.push('- 决策账本:`.qiling/planning/context/decisions.md`(append-only;推翻旧决策须走"取代 D-N"流程)');
  L.push('');
  L.push(`### 当前位置(快照,提取自 STATE.md)`);
  L.push('');
  if (facts.state) {
    const s = facts.state;
    L.push(`- 状态:${s.status ?? '未检出'} · 阶段:${s.phase ?? '未检出'}${s.lastActivity ? ` · 最近活动:${s.lastActivity}` : ''}`);
  } else {
    L.push('- 未检出(无 .qiling/planning/STATE.md)——新项目跑 /ql-design,接手存量代码跑 /ql-scan');
  }
  if (facts.chapters !== null) {
    L.push(`- 文档树:\`.qiling/docs/\`(${facts.chapters} 章${facts.parts ? ` / ${facts.parts} 篇` : ''})——ZCode 中说"打开文档面板"即可视化阅读`);
  } else {
    L.push('- 文档树:未检出(无 .qiling/docs/)——跑 /ql-scan 或 /ql-doc 生成');
  }
  L.push('- 位置推导:`/ql-next`(只读零副作用)');
  L.push('');
  if (facts.npmScripts && facts.npmScripts.length > 0) {
    L.push('### 项目命令(package.json scripts)');
    L.push('');
    L.push(facts.npmScripts.map(k => `\`npm run ${k}\``).join('、'));
    L.push('');
  }
  L.push(MARK_END);
  return L.join('\n');
}

const HEADER_TEMPLATE = `# AGENTS.md

> 本文件是 AI 编码代理的全局说明([agents.md](https://agents.md) 标准),宿主每轮会话自动读取。
> 下方"器灵工作流管控"块由器灵插件自动维护;其余部分是你的手写区
> (项目概述、构建命令、代码风格、注意事项……),器灵不会改动。
`;

/**
 * 渲染整个 AGENTS.md:管理块 + 既有的手写区(原样保留)。
 * 返回 null = 管理块标记损坏(有 start 无配对 end 等),由调用方显式报错,
 * 不猜测用户意图(符合"未知工件状态展示事实停下"纪律)。
 */
function renderFullDocument(existing, block) {
  if (existing === null) {
    return `${HEADER_TEMPLATE}\n${block}\n`;
  }
  const start = existing.indexOf(MARK_START);
  if (start === -1) {
    // 已有文件但无管理块:末尾追加,原内容在前
    const glue = existing.endsWith('\n') ? '\n' : '\n\n';
    return existing + glue + block + '\n';
  }
  // end 必须在 start 之后配对;手写区即使转录标记文本也不会配错对
  const end = existing.indexOf(MARK_END, start);
  if (end === -1) {
    return null;
  }
  // 替换管理块,块外(手写区)原样保留
  return existing.slice(0, start) + block + existing.slice(end + MARK_END.length);
}

function buildSummary(facts, block, outputPath, { handwrittenPreserved, drift, dryRun }) {
  return {
    managed_block: {
      lines: block.split('\n').length,
      plugin_version: facts.pluginVersion,
      contract_version: facts.contractVersion,
      endpoint_count: facts.endpointCount,
      constitution_rules: facts.constitutionRules ? facts.constitutionRules.length : null,
    },
    handwritten_preserved: handwrittenPreserved,
    drift,
    output_path: outputPath,
    ...(dryRun ? { dry_run: true } : {}),
  };
}

function run(args) {
  const opts = { root: process.cwd(), out: null };
  const flags = new Set();
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--check' || args[i] === '--dry-run' || args[i] === '--self-test') {
      flags.add(args[i].slice(2));
    } else if (args[i] === '--root' || args[i] === '--out') {
      if (i + 1 >= args.length) {
        return { exitCode: 2, output: `❌ 参数 ${args[i]} 缺少值` };
      }
      opts[args[i].slice(2)] = args[i + 1];
      i++;
    }
  }

  if (flags.has('self-test')) return selfTest();

  const root = opts.root ? toAbsDir(opts.root) : process.cwd();
  if (!existsSync(root)) {
    return { exitCode: 2, output: `❌ 目标项目根不存在:${root}` };
  }
  const outPath = opts.out ? toAbsDir(opts.out) : join(root, 'AGENTS.md');

  const routingErrors = checkRoutingTable();
  if (routingErrors.length > 0) {
    return {
      exitCode: 2,
      output: `❌ 触发表自检失败(不落盘,先修 ROUTING_TABLE):\n${routingErrors.map(e => `  - ${e}`).join('\n')}`,
    };
  }

  const facts = extractFacts(root);
  const block = renderManagedBlock(facts);

  if (flags.has('dry-run')) {
    return {
      exitCode: 0,
      output: `【dry-run】将写入 ${outPath}(未落盘;生成时间 ${todayStamp()},仅入报告不入块):\n\n${block}\n\n${JSON.stringify(buildSummary(facts, block, outPath, { handwrittenPreserved: true, drift: false, dryRun: true }), null, 2)}`,
    };
  }

  const existing = readSafe(outPath);
  const next = renderFullDocument(existing, block);

  if (flags.has('check')) {
    if (existing === null) {
      return { exitCode: 1, output: `❌ 漂移:${outPath} 不存在(无管控块)。运行 node scripts/agents.mjs 生成。` };
    }
    if (next === null) {
      return { exitCode: 2, output: `❌ ${outPath} 的管理块标记损坏(ql:managed:start 无配对的 end)——展示事实,不代改;请人工修复标记后重跑。` };
    }
    if (!existing.includes(MARK_START) || !existing.includes(MARK_END)) {
      return { exitCode: 1, output: `❌ 漂移:${outPath} 存在但没有 ql:managed 管理块。运行 node scripts/agents.mjs 追加。` };
    }
    const drifted = existing !== next;
    const summary = buildSummary(facts, block, outPath, { handwrittenPreserved: true, drift: drifted, dryRun: false });
    return {
      exitCode: drifted ? 1 : 0,
      output: drifted
        ? `❌ 漂移:磁盘上的管理块与按当前工件重渲染的不一致(工件演进后未重跑 /ql-init)。运行 node scripts/agents.mjs 同步。\n${JSON.stringify(summary, null, 2)}`
        : `✅ 无漂移(管理块与工件一致;校验时间 ${todayStamp()})。\n${JSON.stringify(summary, null, 2)}`,
    };
  }

  if (next === null) {
    return { exitCode: 2, output: `❌ ${outPath} 的管理块标记损坏(ql:managed:start 无配对的 end)——不代改,请人工修复标记后重跑。` };
  }

  if (existing === next) {
    const summary = buildSummary(facts, block, outPath, { handwrittenPreserved: true, drift: false, dryRun: false });
    return { exitCode: 0, output: `✅ 管理块已与工件一致,未改动:${outPath}\n${JSON.stringify(summary, null, 2)}` };
  }

  try {
    writeFileSync(outPath, next, 'utf8');
  } catch (e) {
    return { exitCode: 2, output: `❌ 写盘失败:${outPath}(${e.message})` };
  }
  const mode = existing === null ? 'created' : (existing.includes(MARK_START) ? 'replaced' : 'appended');
  const modeNote = mode === 'created'
    ? `首次生成(含手写区引导头;项目概述请用 /ql-init 由 AI 补写;生成时间 ${todayStamp()})`
    : mode === 'replaced' ? '管理块已更新,块外内容原样保留' : '原文件无管理块,已在末尾追加(原内容未动)';
  const summary = buildSummary(facts, block, outPath, { handwrittenPreserved: true, drift: false, dryRun: false });
  return { exitCode: 0, output: `✅ AGENTS.md ${modeNote}:${outPath}\n${JSON.stringify(summary, null, 2)}` };
}

// ─────────────────────────────────────────────
// 自测:在 .tmp/agents-self-test/ 造假项目端到端验证
// ─────────────────────────────────────────────

function selfTest() {
  const base = join(PLUGIN_ROOT, '.tmp', 'agents-self-test');
  const results = [];
  const assert = (name, cond) => results.push({ name, pass: !!cond });

  rmSync(base, { recursive: true, force: true });
  mkdirSync(base, { recursive: true });

  const invoke = (args) => run(args);
  const runWithDate = (date, args) => {
    const prev = process.env.QL_DATE;
    process.env.QL_DATE = date;
    try { return run(args); } finally { if (prev === undefined) delete process.env.QL_DATE; else process.env.QL_DATE = prev; }
  };

  // ── 场景 1:最小项目(无任何器灵工件)→ 首次生成 + 未检出显式声明 ──
  const proj = join(base, 'plain');
  mkdirSync(proj, { recursive: true });
  const r1 = invoke(['--root', proj]);
  const agentsPath = join(proj, 'AGENTS.md');
  const doc1 = readFileSync(agentsPath, 'utf8');
  assert('1a 首次生成 AGENTS.md', r1.exitCode === 0 && existsSync(agentsPath));
  assert('1b 含管理块标记与触发表', doc1.includes(MARK_START) && doc1.includes(MARK_END) && doc1.includes('/ql-fix'));
  assert('1c 缺宪法/契约/STATE 时显式"未检出"', doc1.includes('未检出') && !doc1.includes('undefined'));

  // ── 场景 2:幂等 ──
  const r2 = invoke(['--root', proj]);
  assert('2 幂等:二次运行不落盘(报告一致)', r2.exitCode === 0 && r2.output.includes('未改动'));

  // ── 场景 3:手写区保留 + 篡改的管理块被真实替换还原 ──
  // 篡改块内容(/ql-fix → /ql-hack)模拟磁盘块与工件脱节:重跑必须真实落盘替换,
  // 同时逐字保留手写区(评审 m6:原场景 3 篡改后恰好等于重渲染,走的是幂等路径,测不到替换)
  const handwritten = doc1.split(MARK_START)[0] + '\n## 我的项目\n\n用 Rust 写的,别引入 npm 依赖。\n\n';
  writeFileSync(agentsPath, handwritten + MARK_START + doc1.split(MARK_START)[1].replace('/ql-fix', '/ql-hack'), 'utf8');
  const r3 = invoke(['--root', proj]);
  const doc3 = readFileSync(agentsPath, 'utf8');
  assert('3a 篡改的管理块被替换还原(真实替换路径落盘)', r3.exitCode === 0 && r3.output.includes('管理块已更新') && doc3.includes('/ql-fix') && !doc3.includes('/ql-hack'));
  assert('3b 手写区逐字保留', doc3.includes('别引入 npm 依赖') && doc3.includes('## 我的项目'));
  assert('3c 管理块仍完整', doc3.includes(MARK_START) && doc3.includes(MARK_END));

  // ── 场景 4:已有 AGENTS.md 无管理块 → 末尾追加 ──
  const proj2 = join(base, 'legacy');
  mkdirSync(proj2, { recursive: true });
  writeFileSync(join(proj2, 'AGENTS.md'), '# 老项目说明\n\n手写内容。\n', 'utf8');
  const r4 = invoke(['--root', proj2]);
  const doc4 = readFileSync(join(proj2, 'AGENTS.md'), 'utf8');
  assert('4 无管理块时末尾追加,原内容在前', r4.exitCode === 0
    && doc4.startsWith('# 老项目说明') && doc4.includes(MARK_START) && doc4.includes('手写内容'));

  // ── 场景 5:--check 漂移检测 ──
  const r5ok = invoke(['--root', proj, '--check']);
  assert('5a 一致时 --check 退出 0', r5ok.exitCode === 0 && r5ok.output.includes('无漂移'));
  const tampered = readFileSync(agentsPath, 'utf8').replace('/ql-fix', '/ql-hack');
  writeFileSync(agentsPath, tampered, 'utf8');
  const r5bad = invoke(['--root', proj, '--check']);
  assert('5b 篡改后 --check 退出 1', r5bad.exitCode === 1 && r5bad.output.includes('漂移'));
  invoke(['--root', proj]); // 还原管理块,后续场景基于干净状态

  // ── 场景 6:--dry-run 不落盘 ──
  const proj3 = join(base, 'dry');
  mkdirSync(proj3, { recursive: true });
  const r6 = invoke(['--root', proj3, '--dry-run']);
  assert('6 dry-run 输出预览且不创建文件', r6.exitCode === 0 && r6.output.includes('dry-run') && !existsSync(join(proj3, 'AGENTS.md')));

  // ── 场景 7:器灵工件齐全 → 事实入块 ──
  const proj4 = join(base, 'full');
  mkdirSync(join(proj4, '.qiling/planning/context'), { recursive: true });
  mkdirSync(join(proj4, '.qiling/docs/chapters'), { recursive: true });
  writeFileSync(join(proj4, '.qiling/planning/context/constitution.md'),
    '# 宪法\n\n### C1 测试纪律(MUST)\n\n### C2 中文产出(SHOULD)\n', 'utf8');
  writeFileSync(join(proj4, '.qiling/planning/context/openapi.yaml'),
    'openapi: 3.1.0\ninfo:\n  title: t\n  version: 1.2.3\npaths:\n  /a:\n    get: {}\n  /b:\n    post: {}\n', 'utf8');
  writeFileSync(join(proj4, '.qiling/planning/STATE.md'),
    "---\nstatus: verified\ncurrent_phase: 2\nlast_activity: >-\n  build-3 done\n---\n\n# 状态\n", 'utf8');
  writeFileSync(join(proj4, '.qiling/docs/chapters/chapter-01-x.md'),
    '---\npart: "第一篇"\n---\n\n# 一\n', 'utf8');
  writeFileSync(join(proj4, 'package.json'), JSON.stringify({ scripts: { test: 'vitest', lint: 'eslint .' } }), 'utf8');
  const r7 = invoke(['--root', proj4]);
  const doc7 = readFileSync(join(proj4, 'AGENTS.md'), 'utf8');
  assert('7a 宪法原则逐条入块', doc7.includes('C1 测试纪律(MUST)') && doc7.includes('C2 中文产出(SHOULD)'));
  assert('7b 契约版本与端点数入块', doc7.includes('v1.2.3') && doc7.includes('2 端点'));
  assert('7c STATE 快照入块(含折叠多行 last_activity)', doc7.includes('verified') && doc7.includes('build-3 done'));
  assert('7d npm scripts 入块', doc7.includes('npm run test') && doc7.includes('npm run lint'));
  assert('7e 章节统计入块', doc7.includes('1 章'));

  // ── 场景 8:触发表与插件真实命令对齐 ──
  assert('8 触发表自检(真实插件命令清单)', checkRoutingTable().length === 0);

  // ── 场景 9:跨日不漂移(评审 C-2 回归:管理块不含日期,QL_DATE 注入时钟)──
  const before9 = readFileSync(agentsPath, 'utf8');
  const r9check = runWithDate('2030-01-01', ['--root', proj, '--check']);
  const r9rerun = runWithDate('2030-01-01', ['--root', proj]);
  const after9 = readFileSync(agentsPath, 'utf8');
  assert('9a 时钟前进后 --check 仍无漂移', r9check.exitCode === 0 && r9check.output.includes('无漂移'));
  assert('9b 时钟前进后重跑幂等(跨日不重写)', r9rerun.output.includes('未改动') && after9 === before9);
  assert('9c 管理块不含任何日期戳', !before9.match(/生成于 \d{4}-\d{2}-\d{2}/));

  // ── 场景 10:管理块标记损坏(有 start 无配对 end)→ 显式报错不代改 ──
  const proj5 = join(base, 'broken');
  mkdirSync(proj5, { recursive: true });
  writeFileSync(join(proj5, 'AGENTS.md'), `# 手写\n\n${MARK_START}\n\n残缺块...\n`, 'utf8');
  const r10 = invoke(['--root', proj5]);
  assert('10 标记损坏显式报错(退出 2,不代改不追加)', r10.exitCode === 2 && r10.output.includes('损坏')
    && readFileSync(join(proj5, 'AGENTS.md'), 'utf8').includes('残缺块'));

  // ── 清理 ──
  rmSync(base, { recursive: true, force: true });

  const failed = results.filter(r => !r.pass);
  console.log('🧪 agents.mjs 自测:\n');
  for (const r of results) console.log(`  ${r.pass ? '✅' : '❌'} ${r.name}`);
  console.log(`\n📊 断言:${results.length - failed.length}/${results.length} 通过`);
  if (failed.length > 0) process.exitCode = 1;
  return { exitCode: failed.length > 0 ? 1 : 0, output: '' };
}

const args = process.argv.slice(2);
const result = run(args);
if (result.output) console.log(result.output);
process.exit(result.exitCode);
