---
name: ql-discuss
description: "讨论驱动开发——对话产出 OpenAPI 3.1 契约 + Mermaid 事件流程图,作为 AI 自动构建的输入"
argument-hint: "[--auto]"
allowed-tools:
  - Read
  - Bash
  - Write
  - Glob
  - Grep
  - AskUserQuestion
---

<runtime_note>
**Zcode:** 用 `AskUserQuestion` 多选题;自由文本对话直接输出。
</runtime_note>

<context>
**标志:**
- `--auto` —— 自动模式。生成 API 与流程的"最小可工作集",不询问细节。

**讨论阶段编号:**
- 若 `.planning/STATE.md` 已存在 → 读 `current_phase`
- 否则 → 1
</context>

<objective>
通过对话讨论,产出**机器可执行的规范**:

1. **OpenAPI 3.1 契约** —— 描述所有 API 端点
2. **Mermaid 事件流程图** —— sequenceDiagram + stateDiagram

**讨论清单:**

| 主题 | 关键问题 |
|------|----------|
| 用户旅程 | 谁会调用 API?目标是什么? |
| 核心 API | 需要哪些端点?请求/响应是什么? |
| 错误模型 | 哪些错误码?响应结构? |
| 事件流 | 哪些组件发消息?消息契约是什么? |
| 状态变化 | 哪些对象有生命周期?状态机是什么? |
| 数据模型 | 主要实体有哪些?它们的关系? |

**不要讨论:**
- 代码风格
- 测试细节
- 文件组织(由 AI 决定)

**产出:**
- `.planning/context/openapi.yaml`
- `.planning/context/event-flow.md`
- `.planning/STATE.md` 更新

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