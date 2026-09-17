---
name: ql-add
description: "加功能——把新功能补进现有项目:定位到章节体系中的位置(可指定,或自动判断),更新契约,增量构建,更新对应章节文档。适合在已用器灵工作流的项目上追加功能。"
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
---

<runtime_note>
**Zcode:**
- 增量构建复用 `Agent(subagent_type="ql-builder-coordinator", ...)`,任务范围限定为新端点/事件
- 定位有歧义时用 `AskUserQuestion`;不可用时按 Never-Ask 降级(证据最强的单一匹配;全新领域默认新建章节)
</runtime_note>

<context>
**定位:** 功能补充是章节循环的**旁路入口**——在已初始化的器灵项目上追加功能,不重开讨论循环。

**前置:**
- `.planning/context/openapi.yaml` 已存在(不存在 → 提示先 `/ql-design` 或 `/ql-scan`)

**标志:**
- `--at <章节|资源>` —— 定向指定落点(如 `--at chapter-02` 或 `--at orders`);留空则自动判断
</context>

<objective>
**把新功能加进现有章节体系**,防范"加功能不走契约"和"文档与代码脱节":

1. **定位** —— 判断新功能落在哪个章节/资源域:用户 `--at` 指定优先;留空则按契约与章节证据自动判断,歧义时询问
2. **补契约** —— 新端点/事件**就地写入** openapi.yaml + event-flow.md(不另建第二份规范);新决策追加 `.planning/context/decisions.md`(冲突走"取代 D-N",不静默推翻)
3. **增量构建** —— 派发协调器,任务范围限定为新端点/事件,波次并行实现(骨架 → 填充)
4. **验证 + 评审** —— 与 `/ql-build` 同标准:契约符合性 + fresh evidence + `ql-reviewer` 三结论
5. **更新章节** —— 对应章节文档同步更新;新建章节时按 `/ql-doc` 结构生成

**产出:**
- 新功能代码 + 测试
- 更新后的 openapi.yaml / event-flow.md / 章节文档 / 索引
- `.planning/build/`(增量报告)与 `.planning/add/NNN-<slug>.md`(定位记录 + 验收清单)

**下一步:** `/ql-deliver`(交付本批功能)
</objective>

<execution_context>
@../workflows/add.md
@../templates/openapi-spec.yaml
@../templates/event-flow.md
@../templates/decisions.md
</execution_context>

<process>
端到端执行。
保留所有工作流门控(定位、契约先行、增量波次并行、验证、独立评审)。
</process>
