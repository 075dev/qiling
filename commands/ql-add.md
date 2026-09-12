---
name: ql:add
description: 加功能——把新功能补进现有项目:定位到章节体系中的位置(可 --at 指定,或自动判断),更新契约,增量构建,同步章节文档
argument-hint: "<功能描述> [--at <章节|资源>]"
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
**把新功能加进现有章节体系**(章节循环的旁路入口)。

**前置:** `.planning/context/openapi.yaml` 已存在(否则先 `/ql-design` 或 `/ql-scan`)。

**流程:**
1. **定位** —— `--at` 指定落点;留空则按契约与章节证据自动判断,歧义时询问
2. **补契约** —— 新端点/事件就地写入 openapi.yaml + event-flow.md
3. **增量构建** —— 协调器波次并行实现新端点/事件(骨架 → 填充)
4. **验证 + 评审** —— 契约符合性 + fresh evidence + `ql-reviewer` 三结论
5. **更新章节** —— 对应章节文档与索引同步更新

**标志:**
- `--at <章节|资源>` —— 定向指定,如 `--at chapter-02` 或 `--at orders`

**产出:** 新功能代码 + 更新后的契约/章节 + `.planning/add/NNN-<slug>.md`

**下一步:** `/ql-deliver`
</objective>

<execution_context>
@../workflows/add.md
@../templates/openapi-spec.yaml
@../templates/event-flow.md
</execution_context>

<process>
端到端执行。
保留所有工作流门控(定位、契约先行、增量波次并行、验证、独立评审)。
</process>
