#!/usr/bin/env node
/**
 * 将 Claude 命令文件转换为 Claude 风格的嵌套 Skill 文件。
 *
 * 输入:Claude 命令 frontmatter(name、description、allowed-tools 等)
 * 输出:Claude Skill frontmatter(同名 + 必要字段)
 *
 * 用途:由 Zcode 加载插件时按 capability.json 的 artifactLayout
 *       引用此转换器,把 commands/<name>.md 转为 skills/<name>/SKILL.md。
 *
 * 用法:
 *   node scripts/convertClaudeCommandToClaudeSkill.mjs <commandFile>
 *
 * 当前实现:最小可用映射(透传 frontmatter + 包裹 <runtime_note> 块)。
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, basename, join, extname } from 'node:path';

const input = process.argv[2];
if (!input) {
  console.error('用法:node scripts/convertClaudeCommandToClaudeSkill.mjs <commandFile>');
  process.exit(1);
}

const raw = readFileSync(input, 'utf8');

// 提取 frontmatter
const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
if (!fmMatch) {
  console.error('输入文件缺少 YAML frontmatter:', input);
  process.exit(1);
}
const [, fm, body] = fmMatch;

// 在 frontmatter 后注入 <runtime_note>,其余原样保留
const output = `---\n${fm}\n---\n\n<runtime_note>\n由器灵工作流插件从 Claude 命令转换而来。\n</runtime_note>\n\n${body}`;

// 输出到 skills/<name>/SKILL.md 同目录布局
const baseName = basename(input, extname(input));
const outDir = join(dirname(input), '..', 'skills', baseName);
mkdirSync(outDir, { recursive: true });
const outFile = join(outDir, 'SKILL.md');
writeFileSync(outFile, output, 'utf8');
console.log(`✓ 转换完成:${input} → ${outFile}`);