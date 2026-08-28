# Walking Skeleton 规划模板
#
# 用途:`.planning/build/skeleton-plan.md`(由 ql-builder 骨架阶段产出)
#
# 这是骨架阶段的**内部计划**——由 builder 智能体在执行前自我组织。
# 不是给协调器看的,而是给 builder 自己记录"我要做什么"。

---

## 骨架规划

```markdown
---
phase: skeleton
generated_at: [ISO timestamp]
inputs:
  - openapi.yaml
  - event-flow.md
---

# Walking Skeleton 规划

## 识别的端点

从 `openapi.yaml` paths 提取:

| 端点 | 方法 | Mock 响应策略 |
|------|------|---------------|
| /resources | GET | 返回 [{id: '1', name: 'Mock'}] |
| /resources/:id | GET | 返回 {id, name: 'Mock Resource'} |
| /resources | POST | 返回 201 {id: 'new'} |
| /resources/:id | PUT | 返回 200 {id, name: 'Updated'} |
| /resources/:id | DELETE | 返回 204 |

## 识别的事件连接

从 `event-flow.md` sequenceDiagram 提取:

| 事件 | 发布者 → 订阅者 | Mock 行为 |
|------|----------------|----------|
| resource.created | Service → MQ | MQ 立即 ack,接收方 console.log |

## 技术栈决策(由 builder 自主)

- **语言/运行时:** [TypeScript/Node.js]
- **框架:** [Express / Fastify / Nest]
- **存储:** [内存 / SQLite / Postgres]
- **消息:** [内存事件总线 / Redis / RabbitMQ]

## 执行步骤

1. 初始化项目(package.json、tsconfig、目录结构)
2. 创建 mock 数据存储(内存对象)
3. 实现端点 1 的 mock 路由
4. 实现端点 2 的 mock 路由
5. ... (每个端点一步)
6. 创建事件总线
8. 启动 + 用 curl 验证每个端点
9. 触发事件,验证接收方日志
10. 提交 + 写 skeleton-report.md

## 验证清单

- [ ] 所有端点可 curl 调用
- [ ] 所有事件链路连通
- [ ] 没有写业务逻辑(检查提交 diff)
- [ ] skeleton-report.md 存在并完整
```

---

<purpose>

这个文件是 builder 智能体的**内部工作笔记**——它是模板,而非产出。

骨架阶段执行时,builder 读取此模板填充自己的计划,然后**按计划执行**,最后产出 `skeleton-report.md`。

之所以有这个中间产物(而非直接产出报告),是为了:
- 让 builder 的工作可追溯(若出了问题能复盘)
- 让协调器能"窥视"builder 的思考过程
- 给未来的会话提供上下文

</purpose>