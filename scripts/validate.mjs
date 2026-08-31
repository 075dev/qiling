#!/usr/bin/env node
/**
 * Zcode 工作流插件 - 骨架验证脚本
 *
 * 验证:
 * - package.json 合法
 * - .zcode-plugin/capability.json 合法
 * - .zcode-plugin/plugin.json 合法
 * - commands/ 与 skills/ 对应
 * - workflows/ 存在
 * - agents/ 与 templates/ 存在(coordinator + worker)
 * - 子智能体引用一致性
 * - 并行配置存在
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const errors = [];
const warnings = [];

function check(condition, message) {
  if (!condition) errors.push(message);
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(join(ROOT, path), 'utf8'));
  } catch (e) {
    errors.push(`无法解析 JSON: ${path} - ${e.message}`);
    return null;
  }
}

function listFiles(dir, suffix) {
  const p = join(ROOT, dir);
  if (!existsSync(p)) return [];
  return readdirSync(p).filter(f => f.endsWith(suffix));
}

console.log('🔍 验证 Zcode 工作流插件骨架(讨论驱动 · 骨架先行 · 波次并行)...\n');

// 1. package.json
const pkg = readJson('package.json');
check(pkg !== null, 'package.json 必须存在且合法');
check(pkg?.name, 'package.json 必须有 name');
check(pkg?.version, 'package.json 必须有 version');

// 2. capability.json
const capability = readJson('.zcode-plugin/capability.json');
check(capability !== null, '.zcode-plugin/capability.json 必须存在');
check(capability?.id === 'zcode', 'capability id 必须是 zcode');

// 3. plugin.json
const plugin = readJson('.zcode-plugin/plugin.json');
check(plugin !== null, '.zcode-plugin/plugin.json 必须存在');

// 4. commands/ 与 skills/ 一致性
const expectedCommands = ['ql-discuss', 'ql-build', 'ql-ship', 'ql-chapter', 'ql-docsmap'];
const commandFiles = listFiles('commands', '.md');
console.log(`  → 发现 ${commandFiles.length} 个 commands`);

const skillDirs = existsSync(join(ROOT, 'skills'))
  ? readdirSync(join(ROOT, 'skills'))
  : [];
console.log(`  → 发现 ${skillDirs.length} 个 skills`);

for (const cmd of expectedCommands) {
  if (!commandFiles.includes(`${cmd}.md`)) {
    errors.push(`缺少核心命令: commands/${cmd}.md`);
  }
  if (!skillDirs.includes(cmd)) {
    errors.push(`缺少对应 skill: skills/${cmd}/SKILL.md`);
  }
}

// 5. workflows/ 必须存在 6 个核心文件(讨论/骨架/填充/交付/章节/docsmap)
const requiredWorkflows = [
  'discuss.md',
  'build-skeleton.md',
  'build-fill.md',
  'ship.md',
  'chapter.md',
  'docsmap.md'
];

const workflowFiles = listFiles('workflows', '.md');
console.log(`  → 发现 ${workflowFiles.length} 个 workflows`);

for (const wf of requiredWorkflows) {
  if (!workflowFiles.includes(wf)) {
    errors.push(`缺少必需工作流: workflows/${wf}`);
  }
}

// 6. agents/ 必须存在 3 个核心子智能体(讨论 + 协调 + worker)
const requiredAgents = [
  'ql-discuss-coach.md',
  'ql-builder-coordinator.md',
  'ql-builder-worker.md'
];

const agentFiles = listFiles('agents', '.md');
console.log(`  → 发现 ${agentFiles.length} 个 agents`);

for (const ag of requiredAgents) {
  if (!agentFiles.includes(ag)) {
    errors.push(`缺少必需子智能体: agents/${ag}`);
  }
}

// 7. templates/ 必须存在核心模板
const requiredTemplates = [
  'openapi-spec.yaml',
  'event-flow.md',
  'state.md',
  'skeleton-plan.md',
  'build-report.md',
  'wave-report.md',
  'verification.md',
  'config.json',
  'config-schema.json',
  'chapter.md',
  'chapter-index.md'
];

const templateFiles = listFiles('templates', '');
console.log(`  → 发现 ${templateFiles.length} 个 templates`);

for (const t of requiredTemplates) {
  if (!templateFiles.includes(t)) {
    errors.push(`缺少必需模板: templates/${t}`);
  }
}

// 8. 检查子智能体引用一致性(同时覆盖连字符与下划线变体)
for (const wf of workflowFiles) {
  const content = readFileSync(join(ROOT, 'workflows', wf), 'utf8');
  // 匹配 ql-<kebab> 与 ql_<snake> 两种命名
  const referenced = content.match(/subagent_type="(ql[-_][a-z_-]+)"/g) || [];
  for (const ref of referenced) {
    const raw = ref.match(/subagent_type="(ql[-_][a-z_-]+)"/)[1];
    // 先按原名找,失败再尝试将下划线转连字符
    let agentName = raw + '.md';
    let exists = agentFiles.includes(agentName);
    if (!exists && raw.includes('_')) {
      const kebab = raw.replace(/_/g, '-') + '.md';
      if (agentFiles.includes(kebab)) {
        warnings.push(`workflows/${wf} 使用下划线命名 ${raw},但仓库中只有连字符文件 ${kebab};派发可能失败`);
        exists = true;
      }
    }
    if (!exists) {
      errors.push(`workflows/${wf} 引用了不存在的子智能体: ${agentName}`);
    }
  }
}

// 9. config.json 必须包含 parallelization 配置
const config = readJson('templates/config.json');
if (config) {
  check(config.parallelization !== undefined, 'templates/config.json 必须定义 parallelization 配置');
  if (config.parallelization) {
    check(config.parallelization.enabled === true, '默认应启用并行');
    check(typeof config.parallelization.max_concurrent === 'number', 'max_concurrent 必须是数字');
    check(['worktree', 'branch', 'none'].includes(config.parallelization.isolation),
      'isolation 必须是 worktree | branch | none');
    check(typeof config.parallelization.wave_timeout_minutes === 'number',
      'parallelization.wave_timeout_minutes 必须是数字');
    check(typeof config.parallelization.worker_timeout_minutes === 'number',
      'parallelization.worker_timeout_minutes 必须是数字');
    check(typeof config.parallelization.worker_retry_count === 'number',
      'parallelization.worker_retry_count 必须是数字');
    check(['merge', 'rebase', 'squash'].includes(config.parallelization.merge_strategy),
      'merge_strategy 必须是 merge | rebase | squash');
  }
}

// 9a. config.json 的 $schema 引用必须存在
if (config?.$schema) {
  const schemaPath = config.$schema.replace(/^\.\//, 'templates/');
  if (!existsSync(join(ROOT, schemaPath))) {
    errors.push(`templates/config.json 引用了不存在的 $schema: ${config.$schema}`);
  }
}

// 9b. capability.json 的 converter 字段必须有对应实现
if (capability?.runtime?.artifactLayout) {
  const layouts = [
    ...(capability.runtime.artifactLayout.global || []),
    ...(capability.runtime.artifactLayout.local || [])
  ];
  // 9b-1: global 与 local 布局不应完全重复(防止安装时重复拷贝)
  const globalLayout = capability.runtime.artifactLayout.global || [];
  const localLayout = capability.runtime.artifactLayout.local || [];
  if (JSON.stringify(globalLayout) === JSON.stringify(localLayout)) {
    errors.push('capability.json 的 artifactLayout.global 与 .local 完全重复,应差异化(global 装到运行时目录,local 装到项目本地目录)');
  }

  for (const item of layouts) {
    if (item.converter) {
      const converterPath = `scripts/${item.converter}.mjs`;
      const converterPath2 = `scripts/${item.converter}.js`;
      if (!existsSync(join(ROOT, converterPath)) && !existsSync(join(ROOT, converterPath2))) {
        errors.push(`capability.json 引用了不存在的 converter: ${item.converter} (期望 ${converterPath})`);
      }
    }
  }

  // 9b-2: configHome 与 localConfigDir 语义不应相同
  const configHome = capability.runtime.configHome?.name;
  const localConfigDir = capability.runtime.localConfigDir;
  if (configHome && localConfigDir && configHome === localConfigDir) {
    errors.push(`capability.json 的 configHome (${configHome}) 与 localConfigDir (${localConfigDir}) 同名;两者应区分全局与项目本地`);
  }
}

// 9c. commands 的 requires 反向依赖:讨论不应依赖构建
for (const cmd of commandFiles) {
  const content = readFileSync(join(ROOT, 'commands', cmd), 'utf8');
  const requiresMatch = content.match(/requires:\s*\[([^\]]+)\]/);
  if (requiresMatch) {
    const requires = requiresMatch[1].split(',').map(s => s.trim());
    // discuss 不应依赖 build
    if (cmd === 'ql-discuss.md' && requires.includes('ql-build')) {
      errors.push(`commands/${cmd} 反向依赖:讨论不应依赖 ql-build`);
    }
    // build 不应依赖 ship(避免循环)
    if (cmd === 'ql-build.md' && requires.includes('ql-ship')) {
      warnings.push(`commands/${cmd} 依赖 ql-ship,会形成 discuss→build→ship 链;确认是否符合预期`);
    }
  }
}

// 10. 文档
check(existsSync(join(ROOT, 'README.md')), 'README.md 必须存在');
check(existsSync(join(ROOT, 'docs/ARCHITECTURE.md')), 'docs/ARCHITECTURE.md 必须存在');
check(existsSync(join(ROOT, 'docs/WALKING-SKELETON.md')), 'docs/WALKING-SKELETON.md 必须存在');
check(existsSync(join(ROOT, 'docs/PARALLELIZATION.md')), 'docs/PARALLELIZATION.md 必须存在');
check(existsSync(join(ROOT, 'docs/CHAPTER-ARCHITECTURE.md')), 'docs/CHAPTER-ARCHITECTURE.md 必须存在');

// 11. 验证脚本
check(existsSync(join(ROOT, 'scripts/chapter-render.mjs')), 'scripts/chapter-render.mjs 必须存在(端到端章节渲染)');
check(existsSync(join(ROOT, 'scripts/docsmap.mjs')), 'scripts/docsmap.mjs 必须存在(文档树渲染)');
check(existsSync(join(ROOT, 'scripts/flow-verify.mjs')), 'scripts/flow-verify.mjs 必须存在');
check(existsSync(join(ROOT, 'scripts/jsonschema-check.mjs')), 'scripts/jsonschema-check.mjs 必须存在');

// 总结
console.log('\n📊 验证结果:');
console.log(`  错误: ${errors.length}`);
console.log(`  警告: ${warnings.length}`);

if (errors.length > 0) {
  console.log('\n❌ 错误:');
  errors.forEach(e => console.log(`  - ${e}`));
}

if (warnings.length > 0) {
  console.log('\n⚠️ 警告:');
  warnings.forEach(w => console.log(`  - ${w}`));
}

if (errors.length === 0) {
  console.log('\n✅ 骨架验证通过!');
  console.log('\n📋 设计概览:');
  console.log(`  • 核心循环:3 步(讨论 → 构建 → 交付)`);
  console.log(`  • 命令:${commandFiles.length} 个(ql-discuss、ql-build、ql-ship)`);
  console.log(`  • 工作流:${workflowFiles.length} 个`);
  console.log(`  • 子智能体:${agentFiles.length} 个(discuss-coach + coordinator + worker)`);
  console.log(`  • 工件模板:${templateFiles.length} 个(OpenAPI + Mermaid 流程图 + 波次报告)`);
  console.log(`  • 方法:Walking Skeleton(骨架先行)`);
  console.log(`  • 并行:全自动波次并行 + Git Worktree 隔离`);
  if (config?.parallelization) {
    console.log(`  • 并行度:max_concurrent=${config.parallelization.max_concurrent}, isolation=${config.parallelization.isolation}`);
  }
  process.exit(0);
} else {
  console.log('\n❌ 骨架验证失败。');
  process.exit(1);
}