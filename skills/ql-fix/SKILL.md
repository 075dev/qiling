---
name: ql-fix
description: "修 Bug——凡报告缺陷、测试失败、线上异常时使用:先复现、再定位根因(未出根因结论禁止改代码)、最小修复、回归测试防复发;连续失败自动升级为设计层讨论。不推进章节阶段。"
argument-hint: "<bug 描述或报错信息> [--no-review]"
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
  - Agent
  - TodoWrite
  - AskUserQuestion
---

<runtime_note>
**Zcode:**
- 小修(< 3 文件)主会话直接修;大修派发 `ql-builder-coordinator` 定向修复
- 触及核心逻辑或多处修改时,派发 `ql-reviewer` 轻量评审(可用 `--no-review` 跳过)
- `AskUserQuestion` 不可用时按 Never-Ask 降级:仅对当前决策自决,绝不自批破坏性操作
</runtime_note>

<context>
**定位:** Bug 修复是章节循环的**旁路**——不推进 `current_phase`,修复后按需追加章节变更日志。

**标志:**
- `--no-review` —— 跳过独立评审(仅限明确的小修)
</context>

<objective>
**复现优先的缺陷修复**,防范"没找到根因就打补丁"和"修好了但会复发":

1. **根因铁律** —— 未输出根因结论之前,禁止产生任何修复 diff
2. **复现** —— 优先固化为自动化失败测试(测试立即通过 = 复现无效);无法复现不盲改
3. **最小修复** —— 回归测试先失败 → 最小修复 → 测试通过;不顺带重构
4. **回归验证** —— 全量测试 + 构建(fresh evidence);检查同类模式是否潜伏同一 bug
5. **升级机制** —— 连续失败不止是换姿势重试:三次失败提示设计层问题,升级为契约重审或重新规划
6. **留档** —— bugfix 报告 + 章节变更日志追加

**产出:**
- 修复代码 + 回归测试
- `.planning/bugfix/NNN-<slug>.md`(bugfix 报告,用 `@../templates/bugfix-report.md`)
- 章节变更日志追加(若 `.qiling/docs/` 已存在)

**下一步:** 修复完成即结束;若修复暴露设计缺陷需要新功能,转 `/ql-add`;若是契约本身错了,回 `/ql-design` 重审。
</objective>

<execution_context>
@../workflows/fix.md
@../templates/bugfix-report.md
</execution_context>

<process>
端到端执行。
保留所有工作流门控(复现优先、根因分析、最小修复、回归验证)。
</process>
