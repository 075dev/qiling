---
name: ql:ship
description: 交付——提交 PR、归档构建产物、推进下一阶段,关闭讨论→构建→交付循环
argument-hint: ""
allowed-tools:
  - Read
  - Bash
  - Grep
  - Glob
  - Write
  - AskUserQuestion
requires: [ql-discuss]
---

<objective>
将本地完成的工作交付到合并的 PR。在 `/ql-build` 通过自动验证后交付。

**关闭** 讨论 → 构建 → 交付循环。

**前置条件:**
- `.planning/build/verification.md` 状态为 `passed`
- 工作区干净(已提交或暂存)
- 不在主分支上

**自动生成 PR:**
- 标题:从 OpenAPI 提取的功能集
- 正文:OpenAPI 端点列表 + 流程图场景

**更新 STATE:**
- 标记当前阶段为已交付
- 推进到下一阶段(若有)
- 若所有阶段已交付 → 标记里程碑完成

**下一步:**
- 若有下一阶段:`/ql-discuss`
- 若所有阶段交付:提示新里程碑或项目归档
</objective>

<execution_context>
@../workflows/ship.md
</execution_context>

<process>
端到端执行。
保留所有工作流门控。
</process>