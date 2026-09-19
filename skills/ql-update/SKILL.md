---
name: ql-update
description: "升级迁移——器灵插件更新后使用:一键把项目工作文档(.planning/ 工件)迁移到当前插件版本格式。确定性迁移走 scripts/migrate.mjs(先 dry-run、自动备份到 .planning-backups/、幂等可重复);契约(openapi.yaml)与决策(decisions.md)永不触碰;脚本提示项只转述不代改。迁移完成后建议 /ql-next 重新推导当前位置。"
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
---

<runtime_note>
**Zcode:**
- 迁移在主会话内联执行,不派子代理(串行小活,产物是单次脚本输出)
- `AskUserQuestion` 不可用时按 Never-Ask 降级:迁移有自动备份且幂等,属可回退操作,直接执行并报告备份路径;但脚本提示项(如损坏工件)仍停下让用户决定
</runtime_note>

<context>
**定位:** 升级迁移是章节循环的**环境维护动作**——不推进 `current_phase`,不产生业务代码,只保证 `.planning/` 工件与插件版本一致。

**标志:**
- `--dry-run` —— 只展示迁移计划,不落盘

**触发时机:**
- 插件升级后首次进入项目(典型:`/ql-next` 提示"无版本锚点")
- 主动想确认项目工件与插件版本是否一致

**版本锚点:** 0.15.0 起 STATE.md frontmatter 记录 `ql_version`;更早的项目无锚点,由迁移规则按字段特征逐条判断,迁移完成后补写锚点。
</context>

<objective>
**插件升级后的一键工件迁移**,防范"插件升级了、项目工件停在旧格式"导致的静默漂移:

1. **环境确认** —— 无 `.planning/` 则无可迁移,指引 `/ql-design` 或 `/ql-scan`
2. **dry-run 预览** —— `node <插件目录>/scripts/migrate.mjs --dry-run`,向用户展示每条迁移规则
3. **执行迁移** —— 确认后实跑:自动备份 → 幂等应用规则 → STATE.md 写入 `ql_version` 锚点
4. **提示转述** —— 脚本提示段逐条给建议(STALE 验证 → 重跑验证;章节索引滞后 → `/ql-scan --force`),不代改
5. **汇报收尾** —— 修改 N 项 / 提示 M 项 / 备份路径 / 回退方式,建议 `/ql-next`

**产出:**
- 迁移后的 `.planning/` 工件 + STATE.md 版本锚点
- 备份 `.planning-backups/.backup-<旧版本>/`
- 迁移报告(会话输出)

**下一步:** 完成即结束;建议 `/ql-next` 从磁盘重新推导当前位置。
</objective>

<execution_context>
@../workflows/update.md
</execution_context>

<process>
端到端执行。
保留所有工作流门控(dry-run 预览、自动备份、用户内容不可触碰、提示不代改)。
</process>
