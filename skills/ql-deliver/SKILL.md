---
name: ql-deliver
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
- `.planning/build/review.md` verdict === "approved" 或 "waived"(waived 必须带 waived_by + waive_reason,被豁免 critical 写入交付记录)
- 工作区干净
- 不在主分支上

**不自动收尾:**
- 呈现:特性分支、base/head SHA、文档路径
- `AskUserQuestion` 让用户选:创建 PR(推荐)/ 仅推送 / 保留本地
- 推送与创建 PR 是对外动作,必须确认后执行
- PR 正文含:端点列表、验证摘要、评审裁定、遗留 non-critical、经验教训(≤5 条)

**Worktree 陷阱:**
- merge / `gh pr merge` 从主仓库 checkout 执行
- 清理只允许删 `.git/ql/worktrees/` 下的路径

**更新 STATE:**
- 标记当前阶段为已交付
- 推进到下一阶段

**下一步:**
- `/ql-design`(若有下一阶段)
- 新里程碑或项目归档(若所有阶段交付)
</objective>

<execution_context>
@../workflows/deliver.md
</execution_context>

<process>
端到端执行。
保留所有工作流门控。
</process>