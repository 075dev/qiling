---
name: ql:init
description: AGENTS.md 全局管控生成——把器灵工作流纪律(按场景选命令触发表、宪法铁律速览、契约与决策纪律、STATE 位置快照)渲染进项目根 AGENTS.md 的 ql:managed 管理块;确定性渲染走 scripts/agents.mjs(幂等、--check 测漂移),手写区永不触碰;宿主每轮会话自动注入,未敲 /ql- 命令的会话也按场景路由命令
argument-hint: "[--check]"
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
requires: []
---

<objective>
**AGENTS.md 全局管控生成**——堵住器灵管控的旁路:未敲 /ql- 命令的会话(用户直接说"修个 bug")
不知道路由纪律、不知道宪法红线。生成/同步项目根 AGENTS.md 后,宿主每轮会话自动注入,
全局管控生效。

**核心纪律(决策 D11,两层结构):**
1. **确定性优先** —— 管控块由 `scripts/agents.mjs` 从工件提取渲染,幂等 + `--check` 漂移门,不由 AI 即兴改写
2. **手写区不可触碰** —— 管理块(`<!-- ql:managed:start/end -->`)之外的内容,AI 与脚本都永不修改;AI 仅在首次生成时补一段简短项目概述(只写代理推不出来的东西)
3. **工件优先** —— 宪法/契约/STATE 是提取源,只读;管控块与工件冲突时以工件为准
4. **漂移可见** —— `--check` 或工作流收尾跑校验;宪法/契约演进后提示重跑

**触发场景:**
- 项目刚用器灵初始化(/ql-design 或 /ql-scan 之后)→ 生成 AGENTS.md 让管控生效
- 宪法/契约/STATE 演进后 → 重跑同步管理块(--check 报漂移时同理)
- **`--check`** —— 只做漂移检测(漂移退出非零),不修改

**产出:**
- 项目根 `AGENTS.md`(ql:managed 管理块 + 手写区)
- 会话报告(管理块行数 / 手写区处置 / 漂移门结果)

**下一步:** 完成;无固定后继——管控块随工件演进按需重跑,配合 `/ql-next` 推导开发位置
</objective>

<execution_context>
@../workflows/init.md
@../scripts/agents.mjs
</execution_context>

<process>
端到端执行。
保留所有工作流门控(环境确认、手写区智能层仅首次、确定性渲染、--check 校验)。
</process>
