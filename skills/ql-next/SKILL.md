---
name: ql-next
description: "下一步提示——凡不确定该做什么时使用:从磁盘产物与 git 事实推导当前位置,给出一条主推荐的下一步命令。只读零副作用,不自动执行。"
argument-hint: ""
allowed-tools:
  - Read
  - Bash
  - Glob
  - Grep
  - AskUserQuestion
---

<runtime_note>
**Zcode:**
- 本技能**只读零副作用**:不改任何文件、不派发子代理、不执行构建
- 状态从磁盘推导,不信 STATE.md 的自述;磁盘与 STATE 冲突时以磁盘为准并说明
</runtime_note>

<objective>
回答一个问题:**"我现在应该做什么?"**

**判定输入(全部只读):**
- 工作流产物存在性:STATE.md / openapi.yaml / skeleton-report / fill-report / verification.md / review.md / progress.md
- 状态字段值:verification `status`、review `verdict`、ledger 中 FAIL/NOT_RUN 计数、`verified_at_commit` 是否落后 HEAD
- git 事实:当前分支、未提交变更、worktree 遗留、blocked 的 bugfix 报告

**输出:**
1. 当前位置一句话
2. 事实依据(每条证据指向具体文件/字段)
3. ✅ 主推荐的下一步命令 + 一句理由
4. 备选项(如有)与顺带发现的次要问题

**典型场景示例:**
- 项目刚装好,不知从哪开始 → 建议 `/ql-scan` 或 `/ql-design`
- 构建中断(上下文压缩/崩溃)→ 从台账断点续跑 `/ql-build`
- 验证过了但评审没做 → `/ql-build`(阶段 4 评审)
- 全部通过但没提交 → `/ql-deliver`

**下一步:** 本技能即终点——给出建议后由用户决定是否执行。
</objective>

<execution_context>
@../workflows/next.md
</execution_context>

<process>
端到端执行。
保留工作流门控(磁盘盘点 → 决策表判定 → 只读输出建议)。
</process>
