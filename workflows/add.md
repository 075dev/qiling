<!-- ql:loop-host
step: add
points: add:pre, add:post
agent-roles: ql-builder-coordinator, ql-builder-worker, ql-reviewer
produces: 新功能代码, 更新后的 openapi.yaml/event-flow.md/章节文档, .planning/add/NNN-<slug>.md
consumes: openapi.yaml, event-flow.md, .qiling/docs/, 现有代码
-->

<purpose>
**加功能 —— 契约先行,落点明确,增量构建。**

往现有项目加功能最容易脱节的三处:**代码加了契约没加**(后续构建与验证失去依据)、**功能进了错误的章节**(文档体系混乱)、**全量重构**(把新功能做成大手术)。本工作流强制:先补契约 → 定位落点 → 只构建新增部分 → 章节同步。
</purpose>

<available_agent_types>
- **ql-builder-coordinator** —— 增量构建协调(仅新端点/事件)
- **ql-builder-worker** —— 单端点/事件实现(全新上下文)
- **ql-reviewer** —— 构建后的独立评审
</available_agent_types>

<process>

## 步骤 0: 前置与勘察(Orient)

```bash
test -f .planning/context/openapi.yaml || {
  echo "错误: 契约不存在。请先运行 /ql-design(新项目)或 /ql-scan(接手项目)"
  exit 1
}

# 现状盘点
cat .planning/STATE.md
ls .qiling/docs/chapters/ 2>/dev/null
```

读 openapi.yaml(paths + schemas)与章节索引,建立**资源域 → 章节映射表**:

| 资源域(路径前缀/schema) | 所在章节 | 相关事件 |
|------|----------|----------|
| /users、User | chapter-02 | user.created |
| /orders、Order | chapter-03 | order.paid |

编号:`.planning/add/` 现有最大 NNN + 1。

## 步骤 1: 提炼新功能的契约面

从功能描述提炼:新端点(方法/路径/请求/响应/错误码)、新事件(发布/订阅/payload)、新 schema、状态机变更。

**与现有域重合的实体复用既有 schema**(扩展字段而非重复定义)。

## 步骤 2: 定位落点(核心)

**优先级:`--at` 显式指定 > 自动判断 > 询问。**

### 2a. 用户指定(`--at <章节|资源>`)

- `--at chapter-NN` → 直接采用该章节
- `--at <资源名>` → 映射到该资源域所在章节;资源不存在 → 视为"新建章节",slug 取资源名

### 2b. 自动判断(留空时)

按证据强度匹配:

1. **唯一匹配** —— 新功能的资源域/实体/事件与现有某一章的契约证据(paths 前缀、schema 引用、事件订阅)明确重合 → 并入该章节,不询问
2. **多候选** —— 与多章都有重合 → `AskUserQuestion` 列出候选章节 + 各自理由,让用户选
3. **全新领域** —— 无任何契约重合 → 判断"扩展邻近域"还是"新建章节":
   - 与某现有章节的**业务主题**强相关(如给电商系统加"优惠券",归入订单章)→ 建议并入
   - 独立业务能力(如加"导出报表")→ 建议新建章节(`chapter-<max+1>`)
   - 用 `AskUserQuestion` 确认(推荐项在前)

**Never-Ask 降级:** `AskUserQuestion` 不可用/被拒时,仅对该定位决策自决——取证据最强的单一匹配;全新领域默认新建章节。在报告中说明判断依据。

**落点判定记录到 `.planning/add/NNN-<slug>.md`**(指定/自动/询问,证据是什么)。

## 步骤 3: 补契约(就地修订)

编辑 `.planning/context/openapi.yaml` 与 `event-flow.md`:

- 新端点/事件/schema 写入对应位置(与既有风格一致)
- **绝不另建第二份规范文档,绝不重写未受影响的章节**
- **决策轨迹同步追加** —— `.planning/context/decisions.md` 存在时,本次新增的非显然选择(新端点取舍、错误语义、事件边界)按模板追加新行(编号延续);**与既有 D-N 冲突时必须走"取代 D-N"流程**(旧行标 superseded、新行注明取代关系、同步修订受影响的契约段),**不允许静默推翻**——既有决策是构建与评审的事实依据,默默绕过它会让后续构建与历史依据自相矛盾
- **契约版本递增**(OpenAPI `info.version`,语义化):
  - 仅新增端点/事件/schema 字段(向后兼容)→ **minor** +1(0.3.0 → 0.4.0)
  - 修改既有语义、删除字段/端点、必填变更(破坏性)→ **major** +1,并在受影响 path 的 `description` 标注破坏点与迁移提示
  - 纯描述/示例修正 → **patch** +1
- 校验:YAML 可解析;新 schema 自洽;新事件在时序图中出现

## 步骤 4: 增量构建(波次并行)

派发 `ql-builder-coordinator`,任务描述**自包含**:

```
你的任务:增量构建——只实现新增端点/事件

输入:
- 契约:.planning/context/openapi.yaml(本次新增:N 端点,M 事件,清单如下)
- 新增任务清单:[枚举]
- 现有代码:基于当前特性分支增量实现,复用既有 schema/工具/中间件
- 阶段:skeleton → fill(两轮波次并行,同 /ql-build 机制)

约束:
- 任务范围仅限新增清单;不重构既有代码
- 依赖既有代码的任务(如复用 User schema)按依赖规则排波次
- 产出:代码 + 测试 + fill-report.md(可追加到 .planning/build/)
```

构建完成后主会话**亲自复核**关键命令(测试 + 构建,fresh evidence)。

## 步骤 5: 验证 + 独立评审

执行 `@../review.md` 工作流(与 `/ql-build` 阶段 3-4 同标准):

1. 契约符合性:新增端点/事件逐一对照(既有端点不回归——跑全量测试)
2. `ql-reviewer` 三结论评审;critical 修复后复审,最多 2 轮

## 步骤 6: 章节同步

按落点分两种:

**A. 并入现有章节:**
- 章节文件:§一 API 清单追加新端点/新 schema/新错误码;§五 变更日志追加 `[YYYY-MM-DD] add: <一句话>(add-NNN)`
- 索引 `.qiling/docs/README.md`:API 总览/数据模型/错误码表增量合并(可复用 `node scripts/docsmap.mjs --update-index`)

**B. 新建章节:**
- 按 `/ql-doc` 的章节结构生成新章节(编号 = 最大 + 1)
- 索引追加新章节行

## 步骤 7: 更新 STATE 与报告

```yaml
---
status: reviewed
last_activity: add-NNN added to <chapter/新建章节>
---
```

呈现:

```
✅ 功能已加入(add-NNN)

功能:<一句话>
落点:<chapter-NN(指定/自动判断/用户确认),判断依据>
契约:新增 N 端点、M 事件
构建:波次 K,worker J
验证:PASS(测试 N/N)+ 评审 approved(第 R 轮)
章节:<并入 chapter-NN / 新建 chapter-MM>

下一步:/ql-deliver(交付)
```

</process>
