#!/usr/bin/env node
/**
 * 将 Claude Agent 文件转换为 Zcode Agent 描述格式。
 *
 * 输入:Claude Agent frontmatter(name、description、tools、color 等)
 * 输出:Zcode Agent frontmatter(同名 + 必要字段)
 *
 * 用途:由 Zcode 加载插件时按 capability.json 的 artifactLayout
 *       引用此转换器,把 agents/<name>.md 映射为 Zcode 子智能体定义。
 *
 * 用法:
 *   node scripts/convertClaudeAgentToZcodeAgent.mjs <agentFile>
 *
 * 当前实现:最小可用映射,补充 Zcode 必填字段 <system-prompt> 包装。
 */
import { readFileSync, writeFileSync } from 'node:fs';

const input = process.argv[2];
if (!input) {
  console.error('用法:node scripts/convertClaudeAgentToZcodeAgent.mjs <agentFile>');
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

// 检查 frontmatter 必填字段(name、description、tools/color 至少其一)
const hasName = /\bname:\s*\S+/.test(fm);
const hasDesc = /\bdescription:\s*\S+/.test(fm);
const hasTools = /\btools:\s*\S+/.test(fm) || /\bcolor:\s*\S+/.test(fm);

if (!hasName || !hasDesc || !hasTools) {
  console.error(`Agent frontmatter 缺少必填字段(name=${hasName}, description=${hasDesc}, tools/color=${hasTools}):`, input);
  process.exit(1);
}

// 输出文件:在前置块后注入 <system-prompt> 块(若不存在)
let wrappedBody = body;
if (!wrappedBody.includes('<system-prompt>')) {
  wrappedBody = `<system-prompt>\n由器灵工作流插件从 Claude Agent 转换而来。\n</system-prompt>\n\n${wrappedBody}`;
}

const output = `---\n${fm}\n---\n${wrappedBody}`;
writeFileSync(input, output, 'utf8');
console.log(`✓ 转换完成:${input}`);