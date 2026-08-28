# 章节索引模板

> **用途:** `.qiling/docs/README.md`(章节索引)
> **作用:** 用户访问项目时的"门户型文档"

---

## 文件模板

```markdown
# [项目名] · 章节文档

> 本目录是器灵工作流自动生成的**章节化开发文档**。
> 每个章节对应一个完整的 ql 循环(讨论 → 构建 → 交付),同时也是该阶段交付的 API 文档。

**快速导航:**
- 章节列表见下表
- API 文档在每个章节的 §一
- 流程留档在每个章节的 §二

---

## 章节列表

| 章节 | 标题 | 阶段 | 状态 | API 数 | 事件数 | PR | 生成时间 |
|------|------|------|------|--------|--------|-----|----------|
| [chapter-01](./chapters/chapter-01-user-center.md) | 用户中心 | 1 | ✅ shipped | 5 | 2 | [#1](#) | 2026-08-28 |
| [chapter-02](./chapters/chapter-02-order-center.md) | 订单中心 | 2 | ✅ shipped | 8 | 4 | [#5](#) | 2026-09-15 |
| [chapter-03](./chapters/chapter-03-payment.md) | 支付集成 | 3 | 🚧 shipped_with_gaps | 3 | 1 | [#12](#) | 2026-10-02 |
| [chapter-NN](./chapters/chapter-NN-*.md) | ... | NN | ... | ... | ... | [#XX](#) | ... |

---

## API 总览

> 以下为所有已交付章节的 API 端点汇总(去重)。详细规范请进入具体章节。

### 路径清单

| 方法 | 路径 | 章节 | 说明 |
|------|------|------|------|
| GET | /resources | [chapter-01](./chapters/chapter-01-user-center.md#一) | 列出资源 |
| POST | /resources | [chapter-01](./chapters/chapter-01-user-center.md#一) | 创建资源 |
| GET | /resources/{id} | [chapter-01](./chapters/chapter-01-user-center.md#一) | 单个资源 |
| ... | ... | ... | ... |

### 错误码汇总

| HTTP | code | 章节 | 含义 |
|------|------|------|------|
| 400 | INVALID_PARAMETER | [chapter-01](./chapters/chapter-01-user-center.md#14-错误码参考) | 请求参数错误 |
| 401 | AUTH_REQUIRED | [chapter-01](./chapters/chapter-01-user-center.md#14-错误码参考) | 未认证 |
| ... | ... | ... | ... |

### 数据模型汇总

| Schema | 章节 | 字段数 | 说明 |
|--------|------|--------|------|
| Resource | [chapter-01](./chapters/chapter-01-user-center.md#13-数据模型schemas) | 6 | 资源 |
| Order | [chapter-02](./chapters/chapter-02-order-center.md#13-数据模型schemas) | 12 | 订单 |
| ... | ... | ... | ... |

---

## 项目元信息

| 字段 | 值 |
|------|---|
| 项目名 | [项目名] |
| 当前阶段 | Phase N |
| 总章节数 | [K] |
| 总 API 端点数 | [N] |
| 总事件消息数 | [M] |
| OpenAPI 版本 | 3.1.0 |
| 器灵版本 | 0.4.0 |

**OpenAPI 契约(完整版):** [../.planning/context/openapi.yaml](../.planning/context/openapi.yaml)
**事件流程图(完整版):** [../.planning/context/event-flow.md](../.planning/context/event-flow.md)

---

## 如何阅读本文档

1. **作为新成员:** 先看本索引的"API 总览"和"章节列表",了解项目大致边界
2. **作为 API 使用者:** 进入具体章节的 §一,看请求/响应/示例
3. **作为维护者:** 进入具体章节的 §二,看流程留档与 Git 摘要
4. **作为升级者:** 看具体章节的 §三"与上一章节对比",了解变更与迁移

---

**生成:** 器灵工作流 v0.4.0,每次 `/ql-ship` 后增量更新
**维护原则:** 索引文件由器灵自动维护,**不要手改**
```

---

<purpose>

**索引文件**(`README.md`)是**门面文档**:
- 章节列表 + 状态总览
- API 跨章节汇总(去重)
- 数据模型与错误码索引
- 链接到所有章节的 §一、§二、§三

用户进入 `.qiling/docs/` 第一眼看到的应是这份索引,而不是某个具体章节。

</purpose>