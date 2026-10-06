#!/usr/bin/env node
/**
 * 器灵工作流插件 - 工件迁移引擎(/ql-update 的确定性层)
 *
 * 插件升级后,把用户项目 `.qiling/planning/` 工件迁移到当前插件版本的格式。
 *
 * 设计原则:
 * - 机器可判定的变化走本脚本(幂等、可测试);需要理解的差异由 /ql-update 工作流处理
 * - 契约(openapi.yaml)、事件流程(event-flow.md)、决策(decisions.md)是用户内容,永不触碰
 * - 迁移前自动备份整个 .qiling/planning/ 到 .qiling/planning-backups/.backup-<旧版本>/
 * - 重复执行安全(幂等):已迁移的项目跑一遍报告"无需迁移"
 *
 * 用法:
 *   node scripts/migrate.mjs --dry-run [--project <path>]   # 只展示迁移计划,不落盘
 *   node scripts/migrate.mjs [--project <path>]             # 执行迁移
 *   node scripts/migrate.mjs --check [--project <path>]     # 只判断是否需要迁移
 *   node scripts/migrate.mjs --self-test                    # 在 .tmp/ 临时目录端到端自测
 *
 * 发版纪律:任何工件格式变更,必须在 MIGRATIONS 登记一条迁移规则(见 docs/RELEASE-CHECKLIST.md)。
 */

import {
  readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, cpSync, readdirSync, renameSync
} from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = join(__dirname, '..');

// ─────────────────────────────────────────────
// 基础工具
// ─────────────────────────────────────────────

/** 读插件自身版本(package.json)= 迁移目标版本 */
function pluginVersion() {
  return JSON.parse(readFileSync(join(PLUGIN_ROOT, 'package.json'), 'utf8')).version;
}

/** 解析 STATE.md 的 frontmatter 为 key→value 表(无 frontmatter 返回 {}) */
function parseFrontmatter(content) {
  const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return {};
  const out = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (kv) out[kv[1]] = kv[2].trim().replace(/^['"]|['"]$/g, '');
  }
  return out;
}

/** 在 frontmatter 中 upsert 一个 key;无 frontmatter 时在顶部新建块 */
function upsertFrontmatter(content, key, value) {
  const line = `${key}: '${value}'`;
  if (/^---\r?\n[\s\S]*?\r?\n---/.test(content)) {
    if (new RegExp(`^${key}:`, 'm').test(content)) {
      return content.replace(new RegExp(`^${key}:.*$`, 'm'), line);
    }
    return content.replace(/^(---\r?\n)/, `$1${line}\n`);
  }
  return `---\n${line}\n---\n\n${content}`;
}

/** 读 JSON(失败返回 null) */
function readJsonSafe(path) {
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; }
}

/** 简单语义版本比较:a > b 返回 1,a < b 返回 -1,相等返回 0(仅比较数字段) */
function cmpVersion(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const da = pa[i] || 0, db = pb[i] || 0;
    if (da > db) return 1;
    if (da < db) return -1;
  }
  return 0;
}

// ─────────────────────────────────────────────
// 迁移规则注册表
//
// 每条规则:
//   id      — 稳定标识(报告与测试引用)
//   since   — 引入该工件格式的插件版本
//   detect  — (ctx) => true 表示需要迁移;false 表示已迁移或不适用
//   plan    — (ctx) => 人类可读的一句话(将做什么)
//   apply   — (ctx) => 实际修改;只允许改 ctx.project 下的插件工件
//   note    — 可选,apply 后追加的提示
//
// 纪律:规则必须幂等——对已迁移项目 detect 恒为 false。
// ─────────────────────────────────────────────

const MIGRATIONS = [
  {
    id: 'M1-config-inline-threshold',
    since: '0.14.0',
    detect: (ctx) => {
      const cfg = ctx.config;
      return !!cfg && !(cfg.parallelization && cfg.parallelization.inline_threshold !== undefined);
    },
    plan: (ctx) => 'config.json 补 parallelization.inline_threshold: 2(0.14.0 派发决策门)',
    apply: (ctx) => {
      ctx.config.parallelization = ctx.config.parallelization || {};
      ctx.config.parallelization.inline_threshold = 2;
      writeFileSync(ctx.paths.config, JSON.stringify(ctx.config, null, 2) + '\n', 'utf8');
    }
  },
  {
    id: 'M2-state-version-anchor',
    since: '0.15.0',
    detect: (ctx) => ctx.state !== null && ctx.state.fm.ql_version === undefined,
    plan: (ctx) => `STATE.md frontmatter 写入 ql_version: '${ctx.targetVersion}'(版本锚点,后续迁移的检测依据)`,
    apply: (ctx) => {
      writeFileSync(ctx.paths.state, upsertFrontmatter(ctx.state.raw, 'ql_version', ctx.targetVersion), 'utf8');
    }
  },
  {
    id: 'M3-verification-stale-note',
    since: '0.10.0',
    // 提示类规则:不修改文件,只报告。verification.md 缺 verified_at_commit = 0.10 前产物
    reportOnly: true,
    detect: (ctx) => ctx.verification !== null
      && !/^verified_at_commit:/m.test(ctx.verification),
    plan: (ctx) => 'verification.md 缺 verified_at_commit(0.10.0 前格式):结论视为 STALE,交付前需重跑验证',
    apply: () => {} // 只报告,不改
  },
  {
    id: 'M4-docs-index-stale-note',
    since: '0.12.0',
    // 提示类规则:.qiling/docs/README.md 的"器灵版本"字段滞后于迁移后版本
    reportOnly: true,
    detect: (ctx) => ctx.docsIndex !== null && /器灵版本/.test(ctx.docsIndex),
    plan: (ctx) => `章节索引 .qiling/docs/README.md 的"器灵版本"字段已滞后:建议跑 /ql-scan --force 重新生成(不手改产物)`,
    apply: () => {} // 只报告,不改
  },
  {
    id: 'M5-docs-manual-restructure-note',
    since: '0.17.0',
    // 提示类规则:0.17.0 起文档树多轮结构化(0.17 说明书式、0.18 教科书式),旧结构提示重扫
    reportOnly: true,
    detect: (ctx) => ctx.docsIndex !== null
      && ((/文档树(产品说明书)/.test(ctx.docsIndex) || /^## 章节列表/m.test(ctx.docsIndex))
        || (/项目说明书/.test(ctx.docsIndex) && !/^## 目录/m.test(ctx.docsIndex))),
    plan: (ctx) => '文档树为旧版格式(目录树/章节列表/说明书首页):建议跑 /ql-scan --force 重扫为最新教科书式项目书(章节内 manual 人工块会自动保留)',
    apply: () => {} // 只报告,不改
  },
  {
    id: 'M6-planning-into-qiling',
    since: '0.19.0',
    // 结构迁移:工作数据 .planning/ 整体迁入 .qiling/planning/(与对外文档 .qiling/docs/ 统一收纳)
    // 放在规则表最后:先让 M1~M5 在旧路径完成修改,再整体移动;apply 内同步切换 ctx.paths,
    // 保证迁移后的锚点刷新写进新位置
    detect: (ctx) => existsSync(ctx.paths.planningOld) && !existsSync(ctx.paths.planningNew),
    plan: (ctx) => '.planning/ 整体迁入 .qiling/planning/(工作数据与对外文档统一收纳;旧根级 .planning-backups/ 同步迁入 .qiling/planning-backups/)',
    apply: (ctx) => {
      mkdirSync(join(ctx.project, '.qiling'), { recursive: true });
      renameSync(ctx.paths.planningOld, ctx.paths.planningNew);
      const oldBackups = join(ctx.project, '.planning-backups');
      const newBackups = join(ctx.project, '.qiling', 'planning-backups');
      if (existsSync(oldBackups)) {
        if (!existsSync(newBackups)) {
          renameSync(oldBackups, newBackups);
        } else {
          // 新备份目录已存在(本轮迁移刚写过备份)→ 旧根级备份并入为 legacy-root,不覆盖
          cpSync(oldBackups, join(newBackups, 'legacy-root'), { recursive: true });
          rmSync(oldBackups, { recursive: true, force: true });
        }
      }
      // 后续规则与锚点刷新切换到新路径
      ctx.paths.planning = ctx.paths.planningNew;
      ctx.paths.state = join(ctx.paths.planningNew, 'STATE.md');
      ctx.paths.config = join(ctx.paths.planningNew, 'config.json');
      ctx.paths.verification = join(ctx.paths.planningNew, 'build', 'verification.md');
    }
  }
];

// ─────────────────────────────────────────────
// 引擎
// ─────────────────────────────────────────────

function buildContext(projectDir, targetVersion) {
  // 双路径感知:0.19.0 起工作数据统一收纳在 .qiling/planning/(与对外文档 .qiling/docs/ 同仓);
  // 未迁移的旧项目仍读 .planning/,由 M6 规则整体迁入
  const planningNew = join(projectDir, '.qiling', 'planning');
  const planningOld = join(projectDir, '.planning');
  const planning = existsSync(planningNew) ? planningNew : planningOld;
  const p = {
    planning,
    planningNew,
    planningOld,
    state: join(planning, 'STATE.md'),
    config: join(planning, 'config.json'),
    verification: join(planning, 'build', 'verification.md'),
    docsIndex: join(projectDir, '.qiling', 'docs', 'README.md')
  };
  const stateRaw = existsSync(p.state) ? readFileSync(p.state, 'utf8') : null;
  return {
    project: projectDir,
    targetVersion,
    paths: p,
    config: readJsonSafe(p.config),
    state: stateRaw === null ? null : { raw: stateRaw, fm: parseFrontmatter(stateRaw) },
    verification: existsSync(p.verification) ? readFileSync(p.verification, 'utf8') : null,
    docsIndex: existsSync(p.docsIndex) ? readFileSync(p.docsIndex, 'utf8') : null
  };
}

/** 项目当前器灵版本:优先 STATE 锚点,其次特征推断;返回 {version, source} */
function detectProjectVersion(ctx) {
  if (ctx.state?.fm?.ql_version) {
    return { version: ctx.state.fm.ql_version, source: 'STATE.md 锚点' };
  }
  // 特征推断:没有锚点的一律视为"旧版",交给规则逐条 detect(规则本身幂等)
  return { version: null, source: '无锚点(0.15.0 前初始化的项目)' };
}

function collectActions(ctx) {
  const migrations = [];
  const skips = [];
  // 提示类规则的版本门:项目锚点已 ≥ 规则引入版本 → 视为已覆盖,不再重复提示
  const covered = (rule) => rule.reportOnly
    && typeof ctx.detectedVersion === 'string'
    && cmpVersion(ctx.detectedVersion, rule.since) >= 0;
  for (const rule of MIGRATIONS) {
    if (!covered(rule) && rule.detect(ctx)) {
      migrations.push(rule);
    } else if (!rule.reportOnly) {
      skips.push(rule);
    }
  }
  return { migrations, skips };
}

function backupPlanning(ctx, fromLabel) {
  const stamp = fromLabel || 'unknown';
  // 备份放 .qiling/planning-backups/(与 .qiling/planning 同级,统一收纳在 .qiling/ 下)
  const backupsRoot = join(ctx.project, '.qiling/planning-backups');
  mkdirSync(backupsRoot, { recursive: true });
  let dest = join(backupsRoot, `.backup-${stamp}`);
  if (existsSync(dest)) {
    dest = `${dest}-${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)}`;
  }
  cpSync(ctx.paths.planning, dest, { recursive: true });
  return dest;
}

function runMigration(projectDir, { dryRun = false, checkOnly = false } = {}) {
  const targetVersion = pluginVersion();
  const lines = [];

  // 双路径入口:新布局 .qiling/planning/ 或旧布局 .planning/ 任一存在即可进入迁移流程
  const hasNewLayout = existsSync(join(projectDir, '.qiling', 'planning'));
  const hasOldLayout = existsSync(join(projectDir, '.planning'));
  if (!hasNewLayout && !hasOldLayout) {
    lines.push('未发现 .qiling/planning/(项目未用器灵初始化),无需迁移。');
    lines.push('若要开始使用:新项目 /ql-design;接手已有代码 /ql-scan。');
    return { exitCode: 0, output: lines.join('\n') };
  }

  const ctx = buildContext(projectDir, targetVersion);
  const detected = detectProjectVersion(ctx);
  ctx.detectedVersion = detected.version;
  const { migrations, skips } = collectActions(ctx);

  lines.push(`器灵迁移引擎 —— 目标版本 ${targetVersion}`);
  lines.push(`项目版本:${detected.source}${detected.version ? `(${detected.version})` : ''}`);
  lines.push('');

  // 核心工件完整性:有 .qiling/planning/ 但缺 STATE.md / config.json = 残缺状态(常见:只用过
  // /ql-fix、/ql-add 等旁路技能,主线从未初始化)。迁移规则对这种形态全部不适用,
  // 若无此检查会静默报"✅ 无需迁移",把真问题盖在成功话术下面
  const missingCore = [];
  if (!existsSync(ctx.paths.state)) {
    missingCore.push('STATE.md(状态锚点)—— 要开始主线开发 → /ql-design(新设计)或 /ql-scan(接手存量代码),初始化时生成');
  }
  if (!existsSync(ctx.paths.config)) {
    missingCore.push('config.json(工作流配置)—— 从插件 templates/config.json 复制默认值,或跑 /ql-design 初始化时生成');
  }
  if (missingCore.length > 0) {
    lines.push('⚠️ .qiling/planning/ 存在但核心工件缺失(残缺状态,常见原因:只使用过 /ql-fix、/ql-add 等旁路技能,主线未初始化):');
    for (const item of missingCore) lines.push(`  - ${item}`);
    lines.push('  版本迁移不代建核心工件,先补齐再谈迁移(/ql-next 会给出同样指引)。');
    lines.push('');
  }

  if (detected.version === targetVersion && migrations.length === 0) {
    if (missingCore.length > 0) {
      lines.push('ℹ️ 版本已是最新,但上述核心工件缺失——迁移不代建,先补齐再 /ql-next 重新推导位置。');
    } else {
      lines.push(`✅ 项目已是最新(${targetVersion}),无需迁移。`);
    }
    return { exitCode: 0, output: lines.join('\n') };
  }

  if (migrations.length === 0) {
    if (missingCore.length > 0) {
      lines.push('ℹ️ 版本规则层面无需迁移,但上述核心工件缺失——先补齐(见指引),再 /ql-next 重新推导位置。');
      return { exitCode: 0, output: lines.join('\n') };
    }
    lines.push(`✅ 无需迁移(项目 ${detected.version || '(无锚点)'} → ${targetVersion},全部规则已满足)。`);
    // 留锚点纪律:锚点缺失或滞后(工件已达标但执行引擎版本更旧)都推进到目标版本,下次精确比较
    if (ctx.state !== null && !dryRun && parseFrontmatter(ctx.state.raw).ql_version !== targetVersion) {
      writeFileSync(ctx.paths.state, upsertFrontmatter(ctx.state.raw, 'ql_version', targetVersion), 'utf8');
      lines.push(`STATE.md 版本锚点已推进 → ql_version: '${targetVersion}'。`);
    }
    return { exitCode: 0, output: lines.join('\n') };
  }

  lines.push(dryRun ? '【dry-run】迁移计划(未落盘):' : '迁移内容:');
  for (const rule of migrations) {
    lines.push(`  [${rule.since}] ${rule.id}`);
    lines.push(`    ${rule.plan(ctx)}`);
  }
  if (skips.length > 0) {
    lines.push('跳过(已满足):');
    for (const rule of skips) {
      lines.push(`  ✓ ${rule.id}(${rule.since})`);
    }
  }
  lines.push('');

  if (checkOnly) {
    lines.push(`共 ${migrations.length} 项待迁移。执行迁移:node scripts/migrate.mjs`);
    return { exitCode: 0, output: lines.join('\n') };
  }
  if (dryRun) {
    lines.push('以上为计划预览。确认无误后执行:node scripts/migrate.mjs');
    return { exitCode: 0, output: lines.join('\n') };
  }

  // 实际迁移:先备份(有真实修改时才有意义)
  const mutating = migrations.filter(r => !r.reportOnly);
  if (mutating.length > 0) {
    const fromLabel = detected.version || 'no-anchor';
    const backupPath = backupPlanning(ctx, fromLabel);
    lines.push(`已备份 .qiling/planning/ → ${backupPath}`);
    for (const rule of mutating) {
      rule.apply(ctx);
    }
  }

  // 锚点统一刷新:只要跑过实际迁移(含仅提示的场景),都把锚点推到目标版本,保证下次精确判断
  if (ctx.state !== null) {
    const stateRaw2 = readFileSync(ctx.paths.state, 'utf8');
    const fm = parseFrontmatter(stateRaw2);
    if (fm.ql_version !== targetVersion) {
      writeFileSync(ctx.paths.state, upsertFrontmatter(stateRaw2, 'ql_version', targetVersion), 'utf8');
      lines.push(`STATE.md 版本锚点 → ql_version: '${targetVersion}'`);
    }
  }

  const notes = migrations.filter(r => r.reportOnly);
  if (notes.length > 0) {
    lines.push('提示(不自动修改,需要你决定):');
    for (const rule of notes) {
      lines.push(`  ⚠ ${rule.plan(ctx)}`);
    }
  }

  lines.push('');
  lines.push(`✅ 迁移完成:${mutating.length} 项修改,${notes.length} 项提示。`);
  return { exitCode: 0, output: lines.join('\n') };
}

// ─────────────────────────────────────────────
// 自测:在 .tmp/migrate-self-test/ 造假项目端到端验证
// ─────────────────────────────────────────────

function selfTest() {
  const targetVersion = pluginVersion();
  const base = join(PLUGIN_ROOT, '.tmp', 'migrate-self-test');
  const results = [];
  const assert = (name, cond) => results.push({ name, pass: !!cond });

  rmSync(base, { recursive: true, force: true });
  mkdirSync(base, { recursive: true });

  // ── 场景 1:旧版项目(旧布局 .planning/、config 无 inline_threshold、STATE 无锚点、verification 旧格式)──
  const proj = join(base, 'old-project');
  mkdirSync(join(proj, '.planning', 'build'), { recursive: true });
  mkdirSync(join(proj, '.qiling', 'docs'), { recursive: true });
  mkdirSync(join(proj, '.planning-backups'), { recursive: true });
  writeFileSync(join(proj, '.planning-backups', 'legacy-marker.txt'), '旧根级备份', 'utf8');
  writeFileSync(join(proj, '.planning', 'config.json'), JSON.stringify({
    parallelization: { enabled: true, max_concurrent: 5, isolation: 'worktree', auto_merge: true }
  }, null, 2), 'utf8');
  writeFileSync(join(proj, '.planning', 'STATE.md'),
    "---\nql_state_version: '1.0'\ncurrent_phase: 1\nstatus: discussed\n---\n\n# 项目状态\n", 'utf8');
  writeFileSync(join(proj, '.planning', 'build', 'verification.md'),
    '---\nstatus: passed\n---\n\n# 验证报告\n', 'utf8');
  writeFileSync(join(proj, '.qiling', 'docs', 'README.md'),
    '# 演示项目 · 文档树(产品说明书)\n\n## 章节列表\n\n| 器灵版本 | 0.11.0 |\n', 'utf8');

  // 1a dry-run 不落盘
  const dry = runMigration(proj, { dryRun: true });
  assert('1a dry-run 退出码 0 且含计划', dry.exitCode === 0 && dry.output.includes('dry-run'));
  assert('1b dry-run 未修改 config.json',
    !readJsonSafe(join(proj, '.planning', 'config.json')).parallelization.inline_threshold);
  assert('1c dry-run 未迁移目录(.planning 仍在原位)', existsSync(join(proj, '.planning', 'STATE.md')));

  // 1d 实际迁移
  const real = runMigration(proj, {});
  assert('1d 迁移退出码 0 且报告完成', real.exitCode === 0 && real.output.includes('迁移完成'));

  // 2 M6 目录迁移:工作数据整体迁入 .qiling/planning/,旧目录不再存在
  assert('2a .planning/ 已迁入 .qiling/planning/(旧目录消失)',
    !existsSync(join(proj, '.planning')) && existsSync(join(proj, '.qiling', 'planning', 'STATE.md')));
  assert('2b 旧根级 .planning-backups/ 并入 .qiling/planning-backups/legacy-root/',
    !existsSync(join(proj, '.planning-backups'))
    && readFileSync(join(proj, '.qiling', 'planning-backups', 'legacy-root', 'legacy-marker.txt'), 'utf8') === '旧根级备份');

  // 3 字段落盘(新布局)
  const cfgAfter = readJsonSafe(join(proj, '.qiling/planning', 'config.json'));
  assert('3 config.json 补上 inline_threshold=2', cfgAfter?.parallelization?.inline_threshold === 2);

  // 4 锚点写入(新布局)
  const stateAfter = readFileSync(join(proj, '.qiling/planning', 'STATE.md'), 'utf8');
  assert(`4 STATE.md 写入 ql_version=${targetVersion}`,
    parseFrontmatter(stateAfter).ql_version === targetVersion);

  // 5 备份存在且是旧态(备份在 .qiling/planning-backups/)
  const backupsRoot = join(proj, '.qiling/planning-backups');
  const backupEntries = existsSync(backupsRoot) ? readdirSync(backupsRoot) : [];
  const backupDir = backupEntries.find(d => d.startsWith('.backup-'));
  assert('5 备份目录已创建', !!backupDir);
  if (backupDir) {
    const backupCfg = readJsonSafe(join(backupsRoot, backupDir, 'config.json'));
    assert('5a 备份中的 config.json 是旧态(无 inline_threshold)',
      backupCfg && backupCfg.parallelization.inline_threshold === undefined);
    const backupState = readFileSync(join(backupsRoot, backupDir, 'STATE.md'), 'utf8');
    assert('5b 备份中的 STATE.md 无 ql_version', parseFrontmatter(backupState).ql_version === undefined);
  }

  // 6 幂等:二次迁移无需迁移
  const again = runMigration(proj, {});
  assert('6 二次迁移报告无需迁移', again.exitCode === 0 && again.output.includes('无需迁移'));

  // 7 提示类:报告含 STALE 与重扫建议
  assert('7a 旧 verification 触发 STALE 提示', real.output.includes('STALE'));
  assert('7b 章节索引触发重扫提示', real.output.includes('/ql-scan --force'));

  // ── 场景 2:未初始化目录温和退出 ──
  const empty = join(base, 'empty-project');
  mkdirSync(empty, { recursive: true });
  const r2 = runMigration(empty, {});
  assert('8 无工作数据目录温和退出(码 0 + 指引)', r2.exitCode === 0 && r2.output.includes('无需迁移'));

  // ── 场景 3:--check 只判断不执行 ──
  const proj2 = join(base, 'check-project');
  mkdirSync(join(proj2, '.qiling/planning'), { recursive: true });
  writeFileSync(join(proj2, '.qiling/planning', 'STATE.md'), '---\nstatus: discussed\n---\n\n# s\n', 'utf8');
  writeFileSync(join(proj2, '.qiling/planning', 'config.json'), '{}', 'utf8');
  const chk = runMigration(proj2, { checkOnly: true });
  const cfgUntouched = readJsonSafe(join(proj2, '.qiling/planning', 'config.json'));
  assert('8 --check 报告待迁移且不落盘', chk.exitCode === 0 && chk.output.includes('待迁移')
    && cfgUntouched && cfgUntouched.parallelization === undefined);

  // ── 场景 4:残缺 .qiling/planning/(只有旁路工件)→ 显式警示,不静默"无需迁移" ──
  const partial = join(base, 'partial-project');
  mkdirSync(join(partial, '.qiling/planning', 'bugfix'), { recursive: true });
  writeFileSync(join(partial, '.qiling/planning', 'bugfix', 'b1.md'), '---\nstatus: blocked\n---\n', 'utf8');
  const r4 = runMigration(partial, {});
  assert('9 残缺 .qiling/planning/ 输出核心工件缺失警示(非静默通过)',
    r4.exitCode === 0 && r4.output.includes('核心工件缺失'));
  assert('9a 警示列出两项缺失工件与补建指引',
    r4.output.includes('STATE.md') && r4.output.includes('config.json')
    && r4.output.includes('/ql-design') && r4.output.includes('/ql-scan'));
  assert('9b 缺核心工件时不再输出裸"✅ 无需迁移"结论',
    !r4.output.includes('✅ 无需迁移') && !r4.output.includes('✅ 项目已是最新'));

  // ── 场景 5:STATE.md 存在但 config.json 缺失 → 只警示 config 一项,不误报 STATE ──
  const half = join(base, 'half-project');
  mkdirSync(join(half, '.qiling/planning'), { recursive: true });
  writeFileSync(join(half, '.qiling/planning', 'STATE.md'),
    `---\nstatus: discussed\nql_version: '${targetVersion}'\n---\n\n# s\n`, 'utf8');
  const r5 = runMigration(half, {});
  assert('10 半残项目(缺 config.json)警示只含 config 一项',
    r5.exitCode === 0 && r5.output.includes('config.json') && !r5.output.includes('STATE.md(状态锚点)'));

  // ── 清理 ──
  rmSync(base, { recursive: true, force: true });

  // ── 报告 ──
  const failed = results.filter(r => !r.pass);
  console.log('🧪 migrate.mjs 自测:\n');
  for (const r of results) {
    console.log(`  ${r.pass ? '✅' : '❌'} ${r.name}`);
  }
  console.log(`\n📊 断言:${results.length - failed.length}/${results.length} 通过`);
  if (failed.length > 0) process.exit(1);
}

// ─────────────────────────────────────────────
// CLI
// ─────────────────────────────────────────────

const args = process.argv.slice(2);
const getOpt = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : null;
};

if (args.includes('--self-test')) {
  selfTest();
} else {
  const projectArg = getOpt('--project');
  const projectDir = resolve(projectArg || process.cwd());
  const result = runMigration(projectDir, {
    dryRun: args.includes('--dry-run'),
    checkOnly: args.includes('--check')
  });
  console.log(result.output);
  process.exit(result.exitCode);
}
