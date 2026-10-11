---
name: ql-init
description: "AGENTS.md 全局管控生成——把器灵工作流纪律(按场景选命令触发表、宪法铁律速览、契约与决策纪律、STATE 位置快照)渲染进项目根 AGENTS.md 的 ql:managed 管理块。确定性渲染走 scripts/agents.mjs(幂等可重复、--check 测漂移);手写区(管理块外)永不触碰,AI 仅在首次生成时补一段简短项目概述。宿主每轮会话自动注入 AGENTS.md,未敲 /ql- 命令的会话也按场景路由命令。宪法/契约/STATE 演进后重跑同步。"
argument-hint: "[--check]"
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
  - TodoWrite
---

<runtime_note>
**Zcode:**
- 生成在主会话内联执行,不派子代理(串行小活:一次脚本调用 + 至多一次手写区补写)
- 手写区已有内容时,跳过项目概述补写——一个字都不动是硬纪律,不是建议
- `--check` 报漂移时只转述漂移事实并重跑渲染器,不手工编辑管理块"顺手修"
</runtime_note>

<objective>
执行 AGENTS.md 全局管控生成(决策 D11):

1. **环境确认** —— `.qiling/planning/` 存在?AGENTS.md 现状(无/有管理块/漂移)?
2. **手写区(仅首次)** —— 文件不存在或无项目概述时,AI 勘察后写一段简短概述(只写代理推不出来的东西);已有内容一个字不动
3. **确定性渲染** —— `node <插件目录>/scripts/agents.mjs --root <项目根>`:从宪法/契约/STATE/章节索引/package.json 提取,渲染 ql:managed 管理块合并落盘(块外原样保留,内容未变不写)
4. **校验收尾** —— `--check` 应退出 0;报告管理块规模与手写区处置

边界:宪法/契约/决策是提取源只读不写;用户手写内容永不修改不重排;`--check` 模式只检测不修改。
</objective>
