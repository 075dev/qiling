# STATE 模板
#
# 用途:`.planning/STATE.md`——阶段循环的状态机

---

## 文件模板

```markdown
---
ql_state_version: '1.0'
current_phase: 1
status: discussing | discussed | skeleton_complete | verified | shipped
---

# 项目状态

## 项目引用

参见:`.planning/context/openapi.yaml` 与 `.planning/context/event-flow.md`

**当前焦点:** [从 OpenAPI 推断的核心功能]

## 当前位置

**阶段:** [current_phase]
**状态:** [status]
**最后活动:** [YYYY-MM-DD] — [简述]

## 循环状态

```text
[讨论] → [构建:骨架] → [构建:填充] → [验证] → [交付]
   ↑                                          │
   └──────────────────────────────────────────┘
```

当前在 `[X]`。

## 阶段进度

| 阶段 | API 端点 | 事件 | 状态 |
|------|----------|------|------|
| 1 | [N] | [M] | [status] |

## 累积上下文

### 决策(从讨论)
- [库/框架选择,从 OpenAPI 推断]
- [状态机定义]
- [事件契约]

### 已知阻塞
- [问题列表,若无填"无"]

## 会话连续性

**上次会话:** [YYYY-MM-DD HH:MM]
**停在:** [描述]
**恢复方式:** `/ql-discuss` 或 `/ql-build`
```

---

<purpose>

STATE.md 是**新设计的轻量状态机**——比 GSD 更精简。

**问题它解决:** 跨会话需要知道"我们到哪了"。
**解决方案:** 单一文件,记录当前讨论阶段、构建阶段、整体状态。

**关键约束:** 保持在 50 行以内。比 GSD 的 STATE(100 行)更精简,因为我们只有 3 步而非 5 步。

</purpose>