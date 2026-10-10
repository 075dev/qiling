---
name: ql:replace
description: 替换功能——用新实现置换既有功能:定位旧功能与调用方引用面,契约同步处置旧端点(deprecated 过渡或显式移除),增量构建,全量回归,更新章节
argument-hint: "<替换描述(替换哪个功能 + 新行为)> [--at <章节|资源>] [--strategy deprecated|remove]"
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
**用新实现置换既有功能**(章节循环的旁路入口,与 /ql-add 追加、/ql-fix 修缺陷并列)。

**前置:** `.qiling/planning/context/openapi.yaml` 已存在(否则先 `/ql-design` 或 `/ql-scan`)。

**流程:**
1. **定位** —— 待替换功能的契约/章节/调用方引用面三源证据;`--at` 可指定,歧义时询问
2. **冻结** —— 新行为 + 替换策略一起讨论,冻结门同 /ql-design(歧义度 ≤ 0.2)
3. **补契约** —— 新端点就地写入,旧端点按策略处置(deprecated 过渡 = minor;remove 显式确认 = major)
4. **增量构建** —— 新端点 + 旧端点处置 + 调用方引用改写同一批次;旧测试随替换改写
5. **验证 + 评审** —— 全量回归 + `ql-reviewer` 三结论(含"旧痕迹残留"专项)
6. **更新章节** —— 正文改写为最新态,演进史附录留痕

**标志:**
- `--at <章节|资源>` —— 定向指定落点
- `--strategy deprecated|remove` —— 替换策略(缺省 deprecated 过渡;remove 是破坏性变更,须显式确认)

**产出:** 替换后的功能实现 + 更新后的契约/章节 + `.qiling/planning/replace/NNN-<slug>.md`

**下一步:** `/ql-deliver`
</objective>

<execution_context>
@../workflows/replace.md
@../templates/openapi-spec.yaml
@../templates/event-flow.md
</execution_context>

<process>
端到端执行。
保留所有工作流门控(定位、冻结门、契约先行、增量波次并行、全量回归、独立评审、旧痕迹残留专项)。
</process>
