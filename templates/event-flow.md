# 事件流程模板
#
# 用途:`.planning/context/event-flow.md`
#
# 包含两个图表:
# - sequenceDiagram:组件协作的时序
# - stateDiagram:关键对象的状态机

## 组件协作(sequenceDiagram)

```mermaid
sequenceDiagram
    autonumber
    actor U as 用户
    participant A as API 网关
    participant S as 服务
    participant DB as 数据库
    participant MQ as 消息队列

    Note over U,S: 场景 1:用户创建资源
    U->>A: POST /resources { name: "x" }
    A->>S: 创建资源
    S->>DB: INSERT
    DB-->>S: id=abc
    S->>MQ: 发布 resource.created
    S-->>A: 201 { id, name }
    A-->>U: 201 { id, name }

    Note over MQ: 订阅者处理
    MQ->>S: resource.created
    S->>DB: UPDATE 派生数据
```

## 关键状态机(stateDiagram)

```mermaid
stateDiagram-v2
    [*] --> Draft: 创建
    Draft --> Active: 激活(用户操作)
    Active --> Archived: 归档(用户操作)
    Archived --> [*]: 删除

    note right of Draft: 初始状态,可编辑
    note right of Active: 可被其他系统引用
    note right of Archived: 不可编辑,只读
```

## 事件消息契约

| 事件 | 发布时机 | Payload | 订阅者 |
|------|----------|---------|--------|
| `resource.created` | 资源创建成功后 | `{ id, name, createdAt }` | 通知服务、搜索索引 |
| `resource.updated` | 资源更新成功后 | `{ id, changes, updatedAt }` | 缓存失效、审计日志 |
| `resource.deleted` | 资源删除成功后 | `{ id, deletedAt }` | 清理派生数据 |

## 边缘场景

| 场景 | 期望行为 |
|------|----------|
| 用户快速重复创建同名资源 | 第二次返回 409 Conflict |
| 创建时数据库连接失败 | 返回 500,事务回滚,不发布事件 |
| 事件订阅者处理失败 | 重试 3 次,失败进入死信队列 |
| 状态机非法转换(如 Active → Draft) | 返回 400 Bad Request |