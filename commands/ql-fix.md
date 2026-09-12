---
name: ql:fix
description: 修 Bug——凡报告缺陷、测试失败、线上异常时使用:先复现(固化为失败测试)、再定位根因(未出根因结论禁止改代码)、最小修复、回归测试防复发;连续失败自动升级为设计层讨论
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
requires: []
---

<objective>
**复现优先的缺陷修复**,修复章节循环之外的质量问题。

**核心纪律:**
1. **先复现,后修改** —— 建立可复现路径并确认失败;无法复现不盲改
2. **根因优先** —— 从报错、diff、近期提交定位根因;只修根因不修症状
3. **最小修复** —— 回归测试先失败 → 最小修复 → 通过;不顺带重构
4. **两次即停** —— 连续两次修复失败,停止打补丁,重新推导根因
5. **回归验证** —— 全量测试 + 构建;检查同类模式

**产出:**
- 修复代码 + 回归测试
- `.planning/bugfix/NNN-<slug>.md`

**下一步:** 完成;若需新功能转 `/ql-add`
</objective>

<execution_context>
@../workflows/fix.md
@../templates/bugfix-report.md
</execution_context>

<process>
端到端执行。
保留所有工作流门控(复现优先、根因分析、最小修复、回归验证)。
</process>
