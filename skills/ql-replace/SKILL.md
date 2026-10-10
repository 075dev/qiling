---
name: ql-replace
description: "替换功能——用新实现置换既有功能:定位旧功能与调用方引用面,契约同步处置旧端点(deprecated 过渡或显式移除),增量构建,全量回归,更新章节。适合需求前后有差异、要换掉既有能力的场景;纯新增功能用 /ql-add。"
argument-hint: "<替换描述(替换哪个功能 + 新行为)> [--at <章节|资源>] [--strategy deprecated|remove]"
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
  - Agent
  - TodoWrite
  - AskUserQuestion
---

<runtime_note>
**Zcode:**
- 增量构建复用 `Agent(subagent_type="ql-builder-coordinator", ...)`,任务范围 = 新端点 + 旧端点处置 + 调用方引用改写
- 定位/策略有歧义时用 `AskUserQuestion`;不可用时按 Never-Ask 降级:取证据最强的单一匹配;策略默认 deprecated(永远不为用户默认选择 remove)
</runtime_note>

<context>
**定位:** 功能替换是章节循环的**第三条旁路**——与 /ql-add(纯追加)、/ql-fix(修缺陷)并列。触发判据:**新需求改变了既有功能的行为,旧能力要退场**。契约有进有出。

**与其他入口的分界(不要串门):**
- 纯新增(无旧能力退场)→ `/ql-add`
- 实现偏离契约的缺陷 → `/ql-fix`
- 行为不变的内部重组(重构)→ 不在本技能范围(重构技能暂缓,勿借本技能夹带重构)

**前置:**
- `.qiling/planning/context/openapi.yaml` 已存在(不存在 → 提示先 `/ql-design` 或 `/ql-scan`)
- 待替换功能可定位(契约/章节/调用方三源证据;完全无法定位 → 提示先 `/ql-doc` 或 `/ql-scan` 补档案)

**标志:**
- `--at <章节|资源>` —— 定向指定落点;留空按证据自动判断
- `--strategy deprecated|remove` —— 替换策略;缺省 deprecated 过渡(minor),remove 破坏性(major)且必须用户显式确认
</context>

<objective>
**用新实现置换既有功能**,防范"加新不留旧账"和"替换不留痕":

1. **定位** —— 契约/章节证据 + **调用方引用面清单**(workflows/skills/commands/agents/代码/测试中对旧功能的全部引用,替换特有,必做)
2. **冻结** —— 新行为契约面 + 替换策略一起过冻结门(歧义度 ≤ 0.2);策略影响契约版本(deprecated = minor,remove = major)
3. **补契约** —— 新端点/事件就地写入 openapi.yaml + event-flow.md;旧端点按策略处置(deprecated 标记 + 指向替代物,或 remove 删除定义);决策追加/取代 decisions.md
4. **增量构建** —— 新端点实现 + 旧端点处置 + 调用方引用改写**同一批次**;旧测试随替换改写,禁止新旧双跑
5. **验证 + 评审** —— 全量回归 + `ql-reviewer` 三结论;替换专项:孤儿引用/文档残留/测试残留/deprecated 指向正确性
6. **更新章节** —— 正文改写为新实现的教学内容(功能章节制:正文永远最新态),演进史附录追加;索引同步

**产出:**
- 替换后的功能实现 + 测试
- 更新后的 openapi.yaml / event-flow.md / 章节文档 / 索引
- `.qiling/planning/build/`(增量报告)与 `.qiling/planning/replace/NNN-<slug>.md`(定位记录 + 调用方清单 + 处置清单 + 验收清单)

**下一步:** `/ql-deliver`(交付本次替换)
</objective>

<execution_context>
@../../workflows/replace.md
@../templates/openapi-spec.yaml
@../templates/event-flow.md
@../templates/decisions.md
</execution_context>

<process>
端到端执行。
保留所有工作流门控(定位、冻结门、契约先行、增量波次并行、全量回归、独立评审、旧痕迹残留专项)。
</process>
