---
name: ql:next
description: 下一步提示——从磁盘产物与 git 事实推导当前位置,给出一条主推荐的下一步命令;只读零副作用
argument-hint: ""
allowed-tools:
  - Read
  - Bash
  - Glob
  - Grep
  - AskUserQuestion
requires: []
---

<objective>
**状态感知入口**——回答"我现在应该做什么?"。

**判定原则:** 状态从磁盘推导,不信 STATE.md 自述;磁盘与 STATE 冲突时以磁盘为准。

**盘点项:** 工作流产物存在性、verification/review/ledger 状态字段、`verified_at_commit` 是否 STALE、git 分支与未提交变更、worktree 遗留、blocked 的 bugfix。

**输出:** 当前位置一句话 + 事实依据 + ✅ 主推荐命令 + 备选项。

**典型建议:**
- 未初始化 → `/ql-scan`(接手项目)或 `/ql-design`(新项目)
- 构建中断 → 从台账断点续跑 `/ql-build`
- 验证过评审未做 → `/ql-build`(阶段 4)
- 全部通过未提交 → `/ql-deliver`
- 里程碑完成 → `/ql-design` 开新阶段

**本技能只读零副作用**——给建议后由用户决定是否执行。
</objective>

<execution_context>
@../workflows/next.md
</execution_context>

<process>
端到端执行。
保留工作流门控(磁盘盘点 → 决策表判定 → 只读输出建议)。
</process>
