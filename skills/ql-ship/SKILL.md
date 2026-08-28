---
name: ql-ship
description: "交付——提交 PR、归档构建产物、推进到下一阶段"
argument-hint: ""
allowed-tools:
  - Read
  - Bash
  - Grep
  - Glob
  - Write
  - AskUserQuestion
---

<objective>
将本地完成的工作交付到合并的 PR。

**关闭** 讨论 → 构建 → 交付循环。

**前置检查:**
- `.planning/build/verification.md` 状态 === "passed"
- 工作区干净
- 不在主分支上

**自动生成 PR:**
- 标题:从 OpenAPI 提取的功能集
- 正文:OpenAPI 端点列表 + 流程图场景

**更新 STATE:**
- 标记当前阶段为已交付
- 推进到下一阶段

**下一步:**
- `/ql-discuss`(若有下一阶段)
- 新里程碑或项目归档(若所有阶段交付)
</objective>

<execution_context>
@../workflows/ship.md
</execution_context>

<process>
端到端执行。
保留所有工作流门控。
</process>