---
name: ql:update
description: 升级迁移——器灵插件更新后使用:一键把项目工作文档(.planning/ 工件)迁移到当前插件版本格式;先 dry-run 预览、自动备份、幂等可重复;契约与决策内容永不触碰
argument-hint: "[--dry-run]"
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
  - TodoWrite
  - AskUserQuestion
requires: []
---

<objective>
**插件升级后的工件迁移**,让已有项目安全跟上新版器灵。

**核心纪律:**
1. **确定性优先** —— 机器可判定的迁移走 `scripts/migrate.mjs`(幂等 + 自动备份),不由 AI 即兴改文件
2. **先看后改** —— 先 dry-run 预览迁移计划,确认后实跑
3. **用户内容不可触碰** —— openapi.yaml、event-flow.md、decisions.md 永不修改
4. **提示不代改** —— 历史报告结构差异、章节文档滞后,只转述建议,由用户决定
5. **留锚点** —— 迁移后 STATE.md 写入 ql_version,后续升级精确比较

**产出:**
- 迁移后的 `.planning/` 工件 + STATE.md 版本锚点
- 备份 `.planning-backups/.backup-<旧版本>/`(回退保险)
- 迁移报告(会话输出:修改 N 项 / 提示 M 项 / 备份路径)

**下一步:** 完成;建议跑 `/ql-next` 从磁盘重新推导当前位置
</objective>

<execution_context>
@../workflows/update.md
</execution_context>

<process>
端到端执行。
保留所有工作流门控(dry-run 预览、自动备份、用户内容不可触碰、提示不代改)。
</process>
