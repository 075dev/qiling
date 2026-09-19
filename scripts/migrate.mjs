#!/usr/bin/env node
/**
 * 器灵工作流插件 - 工件迁移引擎(/ql-update 的确定性层)
 *
 * 插件升级后,把用户项目 `.planning/` 工件迁移到当前插件版本的格式。
 *
 * 设计原则:
 * - 机器可判定的变化走本脚本(幂等、可测试);需要理解的差异由 /ql-update 工作流处理
 * - 契约(openapi.yaml)、事件流程(event-flow.md)、决策(decisions.md)是用户内容,永不触碰
 * - 迁移前自动备份整个 .planning/ 到 .planning/.backup-<旧版本>/
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
  readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, cpSync, readdirSync
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
  }
];

// ─────────────────────────────────────────────
// 引擎
// ─────────────────────────────────────────────

function buildContext(projectDir, targetVersion) {
  const p = {
    planning: join(projectDir, '.planning'),
    state: join(projectDir, '.planning', 'STATE.md'),
    config: join(projectDir, '.planning', 'config.json'),
    verification: join(projectDir, '.planning', 'build', 'verification.md'),
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
  // 备份放项目根 .planning-backups/(与 .planning 平级)——放 .planning 内部会变成"复制到自身子目录"
  const backupsRoot = join(ctx.project, '.planning-backups');
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

  if (!existsSync(join(projectDir, '.planning'))) {
    lines.push('未发现 .planning/(项目未用器灵初始化),无需迁移。');
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

  if (detected.version === targetVersion && migrations.length === 0) {
    lines.push(`✅ 项目已是最新(${targetVersion}),无需迁移。`);
    return { exitCode: 0, output: lines.join('\n') };
  }

  if (migrations.length === 0) {
    lines.push(`✅ 无需迁移(项目 ${detected.version || '(无锚点)'} → ${targetVersion},全部规则已满足)。`);
    // 顺手把缺失的锚点补上,下次精确判断
    if (detected.version === null && ctx.state !== null && !dryRun) {
      writeFileSync(ctx.paths.state, upsertFrontmatter(ctx.state.raw, 'ql_version', targetVersion), 'utf8');
      lines.push(`已补写 STATE.md 版本锚点 ql_version: '${targetVersion}'。`);
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
    lines.push(`已备份 .planning/ → ${backupPath}`);
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

  // ── 场景 1:旧版项目(config 无 inline_threshold、STATE 无锚点、verification 旧格式)──
  const proj = join(base, 'old-project');
  mkdirSync(join(proj, '.planning', 'build'), { recursive: true });
  mkdirSync(join(proj, '.qiling', 'docs'), { recursive: true });
  writeFileSync(join(proj, '.planning', 'config.json'), JSON.stringify({
    parallelization: { enabled: true, max_concurrent: 5, isolation: 'worktree', auto_merge: true }
  }, null, 2), 'utf8');
  writeFileSync(join(proj, '.planning', 'STATE.md'),
    "---\nql_state_version: '1.0'\ncurrent_phase: 1\nstatus: discussed\n---\n\n# 项目状态\n", 'utf8');
  writeFileSync(join(proj, '.planning', 'build', 'verification.md'),
    '---\nstatus: passed\n---\n\n# 验证报告\n', 'utf8');
  writeFileSync(join(proj, '.qiling', 'docs', 'README.md'), '# 索引\n\n| 器灵版本 | 0.11.0 |\n', 'utf8');

  // 1a dry-run 不落盘
  const dry = runMigration(proj, { dryRun: true });
  assert('1a dry-run 退出码 0 且含计划', dry.exitCode === 0 && dry.output.includes('dry-run'));
  assert('1b dry-run 未修改 config.json',
    !readJsonSafe(join(proj, '.planning', 'config.json')).parallelization.inline_threshold);

  // 1c 实际迁移
  const real = runMigration(proj, {});
  assert('1c 迁移退出码 0 且报告完成', real.exitCode === 0 && real.output.includes('迁移完成'));

  // 2 字段落盘
  const cfgAfter = readJsonSafe(join(proj, '.planning', 'config.json'));
  assert('2 config.json 补上 inline_threshold=2', cfgAfter?.parallelization?.inline_threshold === 2);

  // 3 锚点写入
  const stateAfter = readFileSync(join(proj, '.planning', 'STATE.md'), 'utf8');
  assert(`3 STATE.md 写入 ql_version=${targetVersion}`,
    parseFrontmatter(stateAfter).ql_version === targetVersion);

  // 4 备份存在且是旧态(备份在项目根 .planning-backups/)
  const backupsRoot = join(proj, '.planning-backups');
  const backupEntries = existsSync(backupsRoot) ? readdirSync(backupsRoot) : [];
  const backupDir = backupEntries.find(d => d.startsWith('.backup-'));
  assert('4 备份目录已创建', !!backupDir);
  if (backupDir) {
    const backupCfg = readJsonSafe(join(backupsRoot, backupDir, 'config.json'));
    assert('4a 备份中的 config.json 是旧态(无 inline_threshold)',
      backupCfg && backupCfg.parallelization.inline_threshold === undefined);
    const backupState = readFileSync(join(backupsRoot, backupDir, 'STATE.md'), 'utf8');
    assert('4b 备份中的 STATE.md 无 ql_version', parseFrontmatter(backupState).ql_version === undefined);
  }

  // 5 幂等:二次迁移无需迁移
  const again = runMigration(proj, {});
  assert('5 二次迁移报告无需迁移', again.exitCode === 0 && again.output.includes('无需迁移'));

  // 6 提示类:报告含 STALE 与重扫建议
  assert('6a 旧 verification 触发 STALE 提示', real.output.includes('STALE'));
  assert('6b 章节索引触发重扫提示', real.output.includes('/ql-scan --force'));

  // ── 场景 2:未初始化目录温和退出 ──
  const empty = join(base, 'empty-project');
  mkdirSync(empty, { recursive: true });
  const r2 = runMigration(empty, {});
  assert('7 无 .planning 温和退出(码 0 + 指引)', r2.exitCode === 0 && r2.output.includes('无需迁移'));

  // ── 场景 3:--check 只判断不执行 ──
  const proj2 = join(base, 'check-project');
  mkdirSync(join(proj2, '.planning'), { recursive: true });
  writeFileSync(join(proj2, '.planning', 'STATE.md'), '---\nstatus: discussed\n---\n\n# s\n', 'utf8');
  writeFileSync(join(proj2, '.planning', 'config.json'), '{}', 'utf8');
  const chk = runMigration(proj2, { checkOnly: true });
  const cfgUntouched = readJsonSafe(join(proj2, '.planning', 'config.json'));
  assert('8 --check 报告待迁移且不落盘', chk.exitCode === 0 && chk.output.includes('待迁移')
    && cfgUntouched && cfgUntouched.parallelization === undefined);

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
