# Walking Skeleton 方法论

> 本插件的核心构建方法。

---

## 什么是 Walking Skeleton

Walking Skeleton(骨架先行)是一个**端到端可运行的最小实现**。

概念由 Alistair Cockburn 提出,核心思想:

> 在写任何业务逻辑前,先让系统的所有组件**物理连通**。每个组件存在,每个连接真实,但内容是占位符或最简实现。

**目的:** 强制验证设计可行性,暴露早期集成问题。

---

## 在器灵中的应用

### 两阶段构建

```
阶段 1:Walking Skeleton
- 每个 API 端点返回 mock 数据
- 每个事件能传递(接收方收到占位符消息)
- 端到端跑通流程
- 不写任何业务逻辑

阶段 2:填充真实逻辑
- 替换 mock 为真实实现
- 补充边缘情况
- 添加测试
- 保持骨架结构(增量修改,不是重写)
```

### 为什么这样做

#### 反模式:一次性完整实现

```
规划 → 写 100 个文件 → 测试 → 发现端点 A 无法连通事件 B → 重构
```

**问题:** 错误在最后才发现,代价巨大。

#### Walking Skeleton 模式

```
规划 → 写 5 个 mock 文件 → 测试(连通性 OK)→ 填充 → 测试(功能性 OK)
```

**优势:** 错误在前 5 分钟发现。

---

## 骨架阶段做什么

### API 端点骨架

每个端点返回**最小有效 mock 响应**:

```typescript
// ✅ 骨架:返回 mock 数据
app.get('/api/resources/:id', (req, res) => {
  res.json({
    id: req.params.id,
    name: 'Mock Resource',
    createdAt: new Date().toISOString()
  });
});

// ❌ 骨架:不要这样(已含业务逻辑)
app.get('/api/resources/:id', async (req, res) => {
  const resource = await db.query('SELECT * FROM resources WHERE id = ?', [req.params.id]);
  if (!resource) return res.status(404).json({ error: 'Not found' });
  res.json(resource);
});
```

### 事件骨架

每个事件能**从一个组件传递到另一个组件**:

```typescript
// ✅ 骨架:消息能传递
eventBus.on('user.created', (msg) => {
  console.log('Received user.created:', msg);
});

// ❌ 骨架:不要这样(已含业务处理)
eventBus.on('user.created', async (msg) => {
  await sendEmail(msg.email, 'Welcome!');
  await updateAnalytics('user.signup', msg);
});
```

### 骨架阶段不做

- ❌ 数据库迁移或 schema 设计
- ❌ 业务规则
- ❌ 边缘情况处理
- ❌ 错误处理(除了基本的状态码)
- ❌ 真实身份验证
- ❌ 性能优化

### 骨架阶段必须做

- ✅ 每个 OpenAPI 端点都有路由
- ✅ 每个事件都有发布和订阅
- ✅ 启动服务并可访问
- ✅ curl/测试客户端调用每个端点
- ✅ 触发事件,验证接收方收到
- ✅ 写 `skeleton-report.md` 含"跑通证据"

---

## 填充阶段做什么

### 替换 mock 为真实实现

```typescript
// 之前(骨架)
app.get('/api/resources/:id', (req, res) => {
  res.json({ id: req.params.id, name: 'Mock Resource' });
});

// 之后(填充)
app.get('/api/resources/:id', async (req, res) => {
  const resource = await resourceService.findById(req.params.id);
  if (!resource) {
    return res.status(404).json({
      code: 'RESOURCE_NOT_FOUND',
      message: `Resource ${req.params.id} not found`
    });
  }
  res.json(resource);
});
```

### 补充边缘情况

- 输入验证(对照 OpenAPI 约束)
- 错误处理(对照 OpenAPI 错误模型)
- 并发安全
- 资源限制

### 添加测试

- 单元测试:业务逻辑
- 集成测试:对照 OpenAPI 契约的端到端
- 流程测试:对照 Mermaid 流程图的事件链路

---

## 验证阶段做什么

### 对照 OpenAPI 契约

对每个声明的端点:

- [ ] 存在实现?
- [ ] 请求 schema 匹配?
- [ ] 响应 schema 匹配?
- [ ] 错误响应存在(400/500 等)?

### 对照 Mermaid 流程图

对每个事件链路:

- [ ] 发布者存在?
- [ ] 订阅者存在?
- [ ] 消息 payload 匹配?
- [ ] 失败处理存在?

### 跑测试与构建

- [ ] 单元测试通过?
- [ ] 集成测试通过?
- [ ] Lint 通过?
- [ ] 类型检查通过?
- [ ] 构建成功?

---

## 关键原则总结

1. **先打通,再填充** —— 永远不要在未跑通的流程上写业务逻辑
2. **骨架阶段不写业务逻辑** —— 这是纪律,不是建议
3. **填充阶段增量修改** —— 不重写骨架,只在骨架上增量
4. **每步都有"跑通"证据** —— 没有 curl 输出或测试结果 = 没完成
5. **原子提交** —— 每个端点或事件一个提交

---

## 实践建议

### 何时可以跳过骨架

极少数情况下可以跳过骨架:
- 极小的脚本(单文件、< 100 行)
- 纯数据处理(无 API,无事件)

对于任何 API 服务或事件系统,**永远不要跳过骨架**。

### 何时可以合并骨架与填充

如果你**完全确定**设计无误,且每个组件都已在草稿阶段跑通,可以合并。

但**默认情况下**,坚持两阶段。

### 骨架阶段遇到阻塞

骨架阶段应该几乎不阻塞。若遇到:
- 组件无法连通 → 检查设计,可能需要回到讨论阶段
- 技术栈无法选择 → 让 builder 决策(默认 TS/Node)
- 环境问题 → 修复环境,不是绕过骨架

---

## 参考资料

- [Alistair Cockburn - Walking Skeleton](https://alistair.cockburn.us/walking-skeleton/)
- [GSD Core - Context Engineering](https://github.com/open-gsd/gsd-core/blob/main/docs/zh-CN/explanation/context-engineering.md)
- [TDD 与 Walking Skeleton 的关系](https://martinfowler.com/bliki/WalkingSkeleton.html)