# 构建报告通用模板
#
# 用途:`.planning/build/skeleton-report.md` 与 `.planning/build/fill-report.md`
#
# 两个文件结构相同,内容针对不同阶段。

---

## 骨架报告模板(skeleton-report.md)

```markdown
---
phase: skeleton
generated_at: [ISO timestamp]
inputs:
  openapi: .planning/context/openapi.yaml
  event-flow: .planning/context/event-flow.md
---

# Walking Skeleton 构建报告

## 状态:成功

## 技术栈选择

- 语言:[TypeScript]
- 框架:[Fastify]
- 存储:[内存 mock]
- 事件:[内存事件总线]

## 目录结构

```
src/
  routes/
    resources.ts    # 所有 /resources 端点
    events.ts        # 事件订阅者桩
  data/
    mock-store.ts    # 内存存储
  index.ts           # 入口
```

## 已创建的端点

| 端点 | 方法 | Mock 响应 | 文件 | 提交 |
|------|------|----------|------|------|
| /resources | GET | `[{id, name}]` | src/routes/resources.ts:5 | abc1234 |
| /resources | POST | `{id, name}` (201) | src/routes/resources.ts:15 | def5678 |
| ... | ... | ... | ... | ... |

## 已连接的事件

| 事件 | 链路 | Mock 行为 | 文件 | 提交 |
|------|------|----------|------|------|
| resource.created | Service → MQ → Subscriber | console.log | src/routes/events.ts:8 | ghi9012 |

## 跑通证据

```bash
$ curl -i http://localhost:3000/resources
HTTP/1.1 200 OK
Content-Type: application/json
[{"id":"1","name":"Mock Resource"}]

$ curl -i -X POST http://localhost:3000/resources -d '{"name":"test"}'
HTTP/1.1 201 Created
{"id":"2","name":"test"}

$ npm test
... (输出)

[事件触发日志]
[INFO] Received resource.created: { id: '2', name: 'test' }
```

## 关键指标

- 端点数:5
- 事件数:1
- 创建文件:N
- 代码行数:+X, -0
- 提交数:N
- 波次数:K(并行执行)

## 已知问题

- 无业务逻辑(按预期,留给填充阶段)
- 仅内存存储(按预期,留给填充阶段)

## 下一步

填充阶段可开始:`/ql-build`
```

## 填充报告模板(fill-report.md)

```markdown
---
phase: fill
generated_at: [ISO timestamp]
inputs:
  - skeleton-report.md
  - openapi.yaml
  - event-flow.md
---

# 填充实现报告

## 状态:成功

## 已填充的端点

| 端点 | 方法 | 实现说明 | 文件 | 提交 |
|------|------|----------|------|------|
| /resources | GET | 添加数据库查询、过滤、分页 | src/routes/resources.ts:5 | abc1234 |
| /resources | POST | 添加事务、验证、事件发布 | src/routes/resources.ts:15 | def5678 |

## 已实现的事件

| 事件 | 业务逻辑 | 失败处理 | 文件 | 提交 |
|------|----------|----------|------|------|
| resource.created | 更新派生数据 | 重试 3 次 + 死信队列 | src/routes/events.ts:8 | ghi9012 |

## 测试覆盖

- 单元测试:N/N 通过(覆盖关键业务逻辑)
- 集成测试:N/N 通过(对照 OpenAPI 契约)
- 流程测试:N/N 通过(对照事件流程图)

## 数据层

- 数据库:PostgreSQL
- 迁移文件:migrations/001_initial.sql
- ORM:Prisma

## 关键指标

- 端点数:5(全部填充)
- 事件数:1(全部填充)
- 测试用例:N
- 代码行数:+X, -Y
- 波次数:K(并行执行)

## 已知遗留项

- [若有:未实现的边缘情况、暂未覆盖的测试、文档待补]

## 下一步

验证阶段可开始(自动):`/ql-build` 或 `/ql-ship`
```