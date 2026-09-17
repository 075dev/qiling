# 评审报告模板
#
# 用途:`.planning/build/review.md`
# 产出者:ql-reviewer 子智能体(全新上下文,独立于实现者)

---

```markdown
---
verdict: approved | criticals_found | waived
reviewed_at: [ISO timestamp]
round: 1
reviewed_range: <base-sha>..<head-sha>
waived_by:        # 仅 verdict: waived 时必填(用户)
waive_reason:     # 仅 verdict: waived 时必填(接受哪些 critical、为什么)
inputs:
  - openapi.yaml
  - event-flow.md
  - decisions.md        # 决策轨迹(若存在):区分"实现错"与"契约滞后于决策"
  - verification.md
  - fill-report.md
---

# 独立评审报告

## 裁定:`approved` / `criticals_found` / `waived`

> **waived 语义:** 用户在知晓 critical 发现的前提下显式豁免交付。豁免必须由**用户**做出
> (评审者与实现者都无权自批),且必须登记 waived_by + waive_reason。
> waived 不等于通过——被豁免的 critical 会作为已知问题进入交付记录。

## 结论一:契约合规

对照 openapi.yaml 与 event-flow.md 逐条核对验收标准。

| 验收项 | 结果 | 证据 |
|--------|------|------|
| GET /resources 返回 schema 符合契约 | ✅ | src/routes/resources.ts:5,验证摘要 `npm test` PASS |
| ... | ❌ / ⚠️ 未验证 | [文件:行号 或 缺什么证据] |

## 结论二:正确性

逻辑、边界、错误处理、回归、测试成立性。包括规范未写但 diff 暴露的问题。

**AI 代码套路扫描(S1-S8):** [已扫 8 条,命中 N 条 —— 每条命中列证据;全未命中写"未命中"。清单见 ql-reviewer 定义]

| # | 套路 | 结果 | 证据 |
|---|------|------|------|
| S1-S8 | [命中项填套路名] | ❌ / ✅ 未命中 | [文件:行号 或 命令输出] |

## 处置账本(Review Dispositions Ledger,append-only)

**每个可执行发现必须进账本**,处置格式固定,禁止自由发挥:

| # | 发现 | severity | disposition | evidence | decided_by | round |
|---|------|----------|-------------|----------|------------|-------|
| F1 | [一句话描述] | critical | FIXED | commit abc1234 / 测试名 / 文件:行 | <修复方> | 1 |
| F2 | [一句话描述] | critical | WAIVED | waived_by + 理由 | <用户> | 1 |
| F3 | [一句话描述] | minor | DEFERRED | 遗留项编号 | <主会话> | 1 |
| F4 | [一句话描述] | critical | REFUTED | [反证:文件:行 或 命令输出] | <reviewer 复核> | 2 |

**账本纪律(GSD #3806 血泪教训):**

- **append-only**:后续轮次只能追加新行或写"取代 F2",**不得删改旧行**——两轮之后自由文本处置必然失配
- **行引用带版本**:`L42@abc1234`(行号 + 所在文件最后提交),裸行号不合规——代码变了行号会漂
- **disposition 四值枚举**:FIXED(已修复)/ WAIVED(用户豁免,须 decided_by=用户)/ DEFERRED(转遗留项)/ REFUTED(有证据反驳该发现)
- severity 只允许 critical | non-critical

### Critical 发现(账本中 disposition 非 FIXED/WAIVED 的即未闭环)

| # | 问题 | 证据 | 修复指引 |
|---|------|------|----------|
| C1 | [描述] | src/xxx.ts:NN [为什么错] | [最小修复方向] |

### Non-critical 发现

| # | 问题 | 证据 |
|---|------|------|
| N1 | [命名/结构/惯例偏差] | src/xxx.ts:NN |

## 结论三:代码库一致性

- [命名/结构与周边代码一致性的整体评价,附具体位置]

## 验证摘要可信度

- 已抽查:[命令] —— 与摘要一致 / 存在偏差 [证据]
- PRE-EXISTING 项复核:[确认与本次变更无关 / 质疑原因]

## 复审记录(round ≥ 2 时)

### 上一轮 critical 处置

| # | 状态 | 说明 |
|---|------|------|
| C1 | ✅ 已解决 | commit abc1234,证据:... |
| C2 | ❌ 未解决 | [原因] |

### 收敛判定

- [若两轮仍有同类 critical:明确写"评审不收敛",列出遗留发现,交由主会话决定]
```

---

<purpose>

评审报告是**交付前的最后一道质量门**,与验证报告互补:

- **verification.md** 回答"实现是否符合契约"(机器可查的符合性)
- **review.md** 回答"实现是否正确、是否配得上合并"(需要判断力的正确性与一致性)

**问题它解决:** 验证只能查契约符合性,查不出"代码本身错了但符合自己写的契约"(契约写错了、测试复制了生产逻辑、边界处理想错了)。实现者自查有盲区——它倾向于相信自己写的代码。

**解决方案:** 全新上下文的独立评审者,只看规范 + diff + 验证摘要,不带实现者的过程叙事,给出三个独立结论。

**关键原则:**

1. **证据导向** —— 每个发现附文件:行号或亲自跑的命令输出
2. **不重复验证** —— 已 PASS 的命令不重跑,缺证据用最廉价命令补
3. **critical 才阻断** —— 一致性问题记录不阻断
4. **不收敛即上报** —— 两轮复审仍有同类 critical,停止循环交主会话决定

</purpose>
