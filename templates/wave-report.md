# 波次报告模板
#
# 用途:`.planning/build/waves/<wave-id>-<task-id>.md`
#
# 每个 worker 完成后产出一份。协调器不读实现细节,只读这份报告。

---

## Worker 单任务报告模板

```markdown
---
wave: [wave-id]
task: [task-id,例如 "get-users-id"]
phase: skeleton | fill
worker: ql-builder-worker
executed_at: [ISO timestamp]
duration_seconds: [N]
status: success | partial | failed
branch: ql/wave-[N]/[task-id]
---

# Worker 报告:[task-id]

## 状态:[success | partial | failed]

## 实现说明

[一段话(2-3 句)说明这次实现做了什么]

## 修改文件

- `src/routes/users.ts` —— 新增 GET /:id 路由
- `tests/routes/users.test.ts` —— 新增 3 个测试用例

**未触及文件(在文件边界外):** 列表

## 提交

```
abc1234 feat(get /users): skeleton with mock data
def5678 feat(get /users): real implementation with DB query
```

## 测试结果(填充阶段)

```bash
$ npm test -- --grep "users"
PASS tests/routes/users.test.ts
  GET /users/:id
    ✓ returns user when exists
    ✓ returns 404 when not found
    ✓ handles DB error

Tests: 3 passed, 3 total
```

## 端到端验证(骨架阶段)

```bash
$ curl -i http://localhost:3000/api/users/123
HTTP/1.1 200 OK
Content-Type: application/json

{"id":"123","name":"Mock User","email":"mock@example.com"}
```

## 关键指标

- 代码行数:+X, -Y
- 测试用例:N
- 提交数:N
- 执行时长:N 秒

## 已知问题

- [若有]

## 边界确认

确认未修改以下文件:
- [列出文件边界外的关键文件]

## 返回

- 状态:`success`
- 文件清单:`src/routes/users.ts`、`tests/routes/users.test.ts`
- 提交 hash:`abc1234`、`def5678`
- 报告路径:本文件
```

---

## 协调器波次汇总模板

```markdown
---
wave_id: 1
executed_at: [ISO timestamp]
duration_seconds: [N]
parallel: true
worker_count: 5
success_count: 4
failed_count: 1
---

# 波次 1 汇总

## 任务清单与结果

| 任务 | Worker | 状态 | 提交 | 报告 |
|------|--------|------|------|------|
| GET /users | worker-1 | ✅ success | abc1234 | wave-1-get-users.md |
| GET /products | worker-2 | ✅ success | def5678 | wave-1-get-products.md |
| GET /events | worker-3 | ✅ success | ghi9012 | wave-1-get-events.md |
| POST /orders | worker-4 | ❌ failed | - | wave-1-post-orders.md |
| event:user.created | worker-5 | ✅ success | jkl3456 | wave-1-event-user-created.md |

## 失败详情

**POST /orders:** worker 报告失败,原因[XXX]
**影响:** 波次 2 中依赖此任务的任务(TASK_GET_ORDERS_ID)将无法开始
**处理:** 标记为 blocked,等用户决策

## 波次验证

- ✅ 4/5 端点连通
- ❌ POST /orders 缺失
- ✅ 1/1 事件链路连通

**波次结果:** partial(因失败任务)

## 下一波次

Wave 2 计划(待波次 1 完成后):
- POST /users(依赖 GET /users ✅)
- GET /orders/:id(依赖 POST /orders ❌ → blocked)
- event:order.created(依赖 POST /orders ❌ → blocked)
```

---

<purpose>

波次报告是**协调器与 worker 之间的契约**:
- worker 产单端点报告,只关心自己的实现
- 协调器产波次汇总,关心整体进度与失败处理
- 主会话只读汇总报告,不读 worker 细节(除非失败)

**关键:** 协调器**绝不**读取 worker 的实现代码——只看报告。这保持协调器上下文精简。

</purpose>