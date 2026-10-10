<!-- ql:loop-host
step: replace
points: replace:pre, replace:post
agent-roles: ql-builder-coordinator, ql-builder-worker, ql-reviewer
produces: 替换后的功能实现, 更新后的 openapi.yaml/event-flow.md/章节文档, .qiling/planning/replace/NNN-<slug>.md
consumes: openapi.yaml, event-flow.md, .qiling/docs/, 现有代码
-->

<purpose>
**替换功能 —— 置换而非追加,旧端点必须显式处置。**

功能的需求前后有差异时,"用 /ql-add 加新的、旧的留着不管"会让契约与实现双漂移:契约里有失效端点,调用方引用着不该再用的能力,文档教的是过时用法。本工作流强制:定位旧功能及其**全部调用方** → 冻结新行为与替换策略 → 契约同步处置旧端点(deprecated 过渡或显式移除)→ 构建覆盖新端点**与**旧端点处置 → 全量回归 + 评审专项防"旧痕迹残留"。

与相邻旁路的分界(评审与触发判据):
- **/ql-add** = 纯追加,端点只增不减,无退役语义
- **/ql-fix** = 实现偏离契约的缺陷,契约不变
- **/ql-replace** = 行为变化,契约有进有出(本工作流)
- 行为不变的内部重组(重构)不在此列——那是显式的重构技能(暂缓中),不要借用本工作流夹带重构
</purpose>

<available_agent_types>
- **ql-builder-coordinator** —— 增量构建协调(新端点 + 旧端点处置)
- **ql-builder-worker** —— 单端点/事件实现(全新上下文)
- **ql-reviewer** —— 构建后的独立评审(含"旧痕迹残留"专项)
</available_agent_types>

<process>

## 步骤 0: 前置与定位(Orient)

```bash
test -f .qiling/planning/context/openapi.yaml || {
  echo "错误: 契约不存在。请先运行 /ql-design(新项目)或 /ql-scan(接手项目)"
  exit 1
}

# 现状盘点
cat .qiling/planning/STATE.md
ls .qiling/docs/chapters/ 2>/dev/null
```

**定位待替换功能**(优先级:`--at` 显式指定 > 证据自动判断 > 询问),三源证据:

1. **契约证据** —— paths / schema / 事件中与目标功能匹配的条目
2. **章节证据** —— `.qiling/docs/chapters/` 中该功能所在章节(功能章节制:一章 = 一个功能单元,通常可直接命中)
3. **调用方引用面(替换特有,必做)** —— 全仓 grep 该功能的端点/命令/脚本名,列出**谁在用它**:
   - 其他 workflows/*.md、skills/*/SKILL.md、commands/*.md、agents/*.md 中的引用
   - 代码 import / 交叉引用
   - 测试文件

编号:`.qiling/planning/replace/` 现有最大 NNN + 1。**定位结论(含调用方清单)记入 replace/NNN 报告——后续"调用方引用改写"步骤的验收依据就是这份清单。**

## 步骤 1: 冻结新行为与替换策略(讨论门)

与用户讨论两件事,门控同 /ql-design(歧义度 ≤ 0.2 才放行):

1. **新行为** —— 新端点/事件/schema 的契约面(方法/路径/请求/响应/错误码)
2. **替换策略(二选一,默认 deprecated)**:
   - `deprecated`(默认,契约 minor +1):旧端点标 `deprecated: true`,description 指向替代物,实现可保留转发或空转提示;调用方引用**必须**改写到新端点,但外部使用者有过渡期
   - `remove`(破坏性,契约 major +1):旧端点从契约中删除;**必须用户显式确认**(呈现受影响的调用方清单后再确认,不得默认选用);受影响 path 的迁移提示写入 decisions.md

**与既有决策冲突时走"取代 D-N"流程**(decisions.md),不允许静默推翻。

## 步骤 2: 补契约(就地修订)

编辑 `.qiling/planning/context/openapi.yaml` 与 `event-flow.md`:

- 新端点/事件/schema 写入对应位置(与既有风格一致)
- **旧端点处置**:
  - `deprecated` 策略 → 加 `deprecated: true` + summary/description 标注 `[已替换] → <新端点>`
  - `remove` 策略 → 删除对应 path/事件定义
- **绝不另建第二份规范文档,绝不重写未受影响的章节**
- 决策轨迹追加(`.qiling/planning/context/decisions.md` 存在时)
- 契约版本递增:deprecated 过渡 = **minor**;remove 或必填/语义破坏 = **major**
- 校验:YAML 可解析;新旧端点关系在契约中可追溯;新事件在时序图中出现

## 步骤 3: 增量构建(波次并行)

派发 `ql-builder-coordinator`,任务描述**自包含**:

```
你的任务:增量构建——功能替换(新端点上线 + 旧端点处置)

输入:
- 契约:.qiling/planning/context/openapi.yaml(本次:新增 N 端点,处置 M 端点,清单如下)
- 新增任务清单:[枚举]
- 旧端点处置清单:[枚举,含 strategy]
- 调用方改写清单:[步骤 0 的调用方引用面清单]
- 现有代码:基于当前特性分支,复用既有 schema/工具/中间件
- 阶段:skeleton → fill(两轮波次并行,同 /ql-build 机制)

约束:
- 新端点实现 + 旧端点处置 + 调用方引用改写三者同一批次完成,不许只做一半
- 旧测试随替换改写或删除,禁止新旧实现双跑绿灯
- 不重构与本次替换无关的代码
```

构建完成后主会话**亲自复核**关键命令(测试 + 构建,fresh evidence)。

## 步骤 4: 验证 + 独立评审

执行 `@review.md` 工作流,除常规三项(契约符合性 / 正确性 / 一致性)外,**替换专项**:

1. **全量回归** —— 既有端点不回归(跑全量测试;旧实现的测试应已被改写)
2. **旧痕迹残留检查**(ql-reviewer 三结论的必查项):
   - 代码中的孤儿引用(指向已处置端点的 import/调用)
   - 文档残留(README/章节/注释仍在教旧用法)
   - 测试残留(新旧实现双跑、或旧测试删了但新行为无测试覆盖)
   - deprecated 端点的 description 是否正确指向替代物
3. critical 修复后复审,最多 2 轮

## 步骤 5: 章节同步

按落点分两种(功能章节制:**正文永远最新态**,历史进演进史):

**A. 并入现有章节:**
- 章节文件:**正文改写为新实现的教学内容**(不是追加一节"新旧对比")
- §五 变更日志(或演进史附录)追加一行 `[YYYY-MM-DD] replace: <旧> → <新>,策略 <deprecated|remove>(replace-NNN)`
- 索引 `.qiling/docs/README.md`:API 总览/数据模型/错误码表同步(可复用 `node scripts/docsmap.mjs --update-index`)

**B. 新建章节**(旧功能无章节或新功能独立成域):
- 按 `/ql-doc` 的章节结构生成新章节(编号 = 最大 + 1),演进史附录首行记录"取代 chapter-XX 的 <旧功能>"
- 索引追加新章节行;旧章节如有残留引用一并清理

## 步骤 6: 更新 STATE 与报告

STATE frontmatter:`status: reviewed`,`last_activity: replace-NNN <旧> → <新>(<章节>)`。

呈现:

```
✅ 功能已替换(replace-NNN)

替换:<旧功能> → <新功能>
策略:deprecated 过渡 / remove 立即移除(用户显式确认)
落点:<chapter-NN(指定/自动判断/用户确认)>
契约:新增 N 端点、处置 M 端点,契约版本 <a.b.c>(minor/major)
调用方改写:K 处(workflows/skills/代码/测试)
验证:PASS(全量回归 N/N)+ 评审 approved(第 R 轮,旧痕迹残留 0)
章节:<并入 chapter-NN / 新建 chapter-MM>

下一步:/ql-deliver(交付)
```
</process>
