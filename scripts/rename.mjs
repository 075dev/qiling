#!/usr/bin/env node
/**
 * 重命名脚本:把仓库内所有文件中残留的 zgsd 标记替换为 ql。
 * 注意:本脚本只做名称替换,不做结构调整。
 *
 * 运行: node scripts/rename.mjs
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// 跳过
const SKIP_DIRS = new Set(['node_modules', '.git', '.planning']);
const SKIP_FILES = new Set(['rename.mjs', 'package-lock.json']);

// 候选后缀
const SUFFIXES = ['.md', '.json', '.yaml', '.yml', '.mjs', '.js'];

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const p = join(dir, entry);
    const s = statSync(p);
    if (s.isDirectory()) out.push(...walk(p));
    else if (SUFFIXES.some(suf => entry.endsWith(suf)) && !SKIP_FILES.has(entry)) {
      out.push(p);
    }
  }
  return out;
}

// 替换规则
const REPLACEMENTS = [
  // 命名/前缀:zgsd → ql
  { from: /zgsd_builder-/g, to: 'ql-builder-' },        // 旧下划线变体
  { from: /zgsd-discuss/g, to: 'ql-discuss' },
  { from: /zgsd-build/g, to: 'ql-build' },
  { from: /zgsd-ship/g, to: 'ql-ship' },
  // 命令名 zgsd: → ql:
  { from: /zgsd:/g, to: 'ql:' },
  // 状态机版本键
  { from: /zgsd_state_version/g, to: 'ql_state_version' },
  // 元数据描述(GSD 工作流 → 器灵工作流)
  { from: /Zcode GSD 工作流/g, to: '器灵 Zcode 工作流' },
  { from: /zgsd 工作流/g, to: '器灵工作流' },
  { from: /zgsd 循环/g, to: '器灵循环' },
  { from: /zgsd 协调器/g, to: '器灵协调器' },
  { from: /zgsd 协调/g, to: '器灵协调' },
  { from: /zgsd 验证/g, to: '器灵验证' },
  { from: /zgsd builder worker/g, to: 'ql-builder-worker' },
  { from: /zgsd builder coordinator/g, to: 'ql-builder-coordinator' },
  { from: /zgsd discuss coach/g, to: 'ql-discuss-coach' },
  // 单独出现的 zgsd(避免遗留):worktree 路径、分支前缀、capability prefix
  { from: /\.git\/zgsd\//g, to: '.git/ql/' },
  { from: /"zgsd\//g, to: '"ql/' },
  { from: /`zgsd\//g, to: '`ql/' },
  { from: /zgsd 构建协调器/g, to: '器灵构建协调器' },
  { from: /zgsd 构建 worker/g, to: '器灵构建 worker' },
  { from: /zgsd 讨论引导者/g, to: '器灵讨论引导者' },
  { from: /zgsd_builder 骨架阶段/g, to: 'ql-builder 骨架阶段' },
  { from: /在 zgsd 中的应用/g, to: '在器灵中的应用' },
  { from: /"prefix": "zgsd-"/g, to: '"prefix": "ql-"' },
];

const files = walk(ROOT);
let totalChanged = 0;
const changes = [];

for (const file of files) {
  const orig = readFileSync(file, 'utf8');
  let next = orig;
  let fileChanges = 0;
  for (const r of REPLACEMENTS) {
    const matches = next.match(r.from);
    if (matches) {
      fileChanges += matches.length;
      next = next.replace(r.from, r.to);
    }
  }
  if (fileChanges > 0 && next !== orig) {
    writeFileSync(file, next, 'utf8');
    totalChanged += fileChanges;
    changes.push({ file: relative(ROOT, file), count: fileChanges });
  }
}

console.log(`\n🔁 重命名完成:共修改 ${changes.length} 个文件,${totalChanged} 处替换\n`);
for (const c of changes) console.log(`  ${c.file}: ${c.count}`);