---
name: ql:discuss
description: 对话讨论,产出 OpenAPI 3.1 契约 + Mermaid 事件流程图,作为 AI 自动构建的输入
argument-hint: "[--auto]"
allowed-tools:
  - Read
  - Bash
  - Write
  - Glob
  - Grep
  - AskUserQuestion
requires: [ql-ship]
---

<objective>
通过对话讨论,产出**机器可执行的规范**:

1. **OpenAPI 3.1 契约** —— 描述所有 API 端点
2. **Mermaid 事件流程图** —— sequenceDiagram + stateDiagram

**为什么是 API + 流程,不是泛泛的"决策":**
- API 契约是机器可读、可验证、可代码生成的
- 流程图让 AI 理解组件协作与时序
- 两者结合 → AI 能自主生成 Walking Skeleton 与填充实现

**关键原则:**
- 讨论是**对话**,不是规格说明练习——几分钟对话,几小时实现节省
- **不需要 100% 完整**——先抓主线,边缘情况在执行中涌现
- **可以多轮讨论**——讨论 n 完成后,/ql-discuss n+1 进入下一阶段

**产出文件:**
- `.planning/context/openapi.yaml` —— OpenAPI 3.1 契约
- `.planning/context/event-flow.md` —— Mermaid 流程图
- `.planning/STATE.md` —— 更新状态

**下一步:** `/ql-build`
</objective>

<execution_context>
@../workflows/discuss.md
@../templates/openapi-spec.yaml
@../templates/event-flow.md
</execution_context>

<process>
端到端执行。
保留所有工作流门控。
</process>