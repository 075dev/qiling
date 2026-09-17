<!-- ql:loop-host
step: review
points: build:review:pre, build:review:post
agent-roles: ql-reviewer
produces: review.md, (修复时)修复提交 + 更新的 verification.md
consumes: openapi.yaml, event-flow.md, decisions.md(若存在), verification.md, fill-report.md, base..head diff
-->

<purpose>
**独立评审 —— 交付前的最后一道质量门。**

验证(verification.md)只能证明"实现符合契约";独立评审回答"实现本身是否正确、是否配得上合并"。由全新上下文的 `ql-reviewer` 执行,与实现者无共享记忆,防实现者自查盲区。
</purpose>

<available_agent_types>
- **ql-reviewer** —— 独立评审者,全新上下文,只评审不修复
</available_agent_types>

<runtime_note>
**Zcode:** `Agent(subagent_type="ql-reviewer", ...)` 由主会话直接派发——**不经过协调器**,防止协调上下文被评审细节污染。
</runtime_note>

<process>

## 步骤 0: 前置检查

```bash
STATUS=$(grep "^status:" .planning/build/verification.md | awk '{print $2}')
test "$STATUS" = "passed" || {
  echo "错误: 验证未通过 (status=$STATUS),评审无意义。请先修复。"
  exit 1
}
```

**串行铁律:** 验证与评审严格串行。所有验证命令退出后才派发评审;评审期间不并行跑任何重型测试或长驻进程。

## 步骤 1: 确定 diff 范围

```bash
# base SHA 在骨架阶段开始前已记录到 STATE(见 build-skeleton 步骤 0)
BASE=$(grep "^base_sha:" .planning/STATE.md | awk '{print $2}')
HEAD=$(git rev-parse HEAD)
```

若 `base_sha` 缺失,以构建前最后一次主分支提交为准,并在报告中注明。

## 步骤 2: 派发 ql-reviewer(全新上下文)

提供**自包含**任务描述(不含会话历史、不含实现者叙事):

```
你的任务:独立评审完整变更(第 N 轮)

输入:
- 工作目录:[工作区绝对路径]
- 规范:.planning/context/openapi.yaml + .planning/context/event-flow.md
- 设计意图:.planning/context/decisions.md(若存在)—— 决策轨迹,用于区分"实现错了"与"契约滞后于决策"
- 验证摘要:.planning/build/verification.md(每条命令一行 PASS/FAIL/PRE-EXISTING)
- 构建报告:.planning/build/fill-report.md(当 claim 读,不当事实)
- diff 范围:git diff <BASE>..<HEAD>
- 复审轮次 ≥2 时:上一轮 .planning/build/review.md 中被标记为待复审的 critical 项

产出:.planning/build/review.md(用 templates/review.md 格式)

要求:
1. 三个独立结论:契约合规 / 正确性 / 代码库一致性
2. 对照 AI 代码套路清单(S1-S8,见 ql-reviewer 定义)扫描 diff,结果写入正确性结论
3. 每个发现附证据(文件:行号 或 你亲自跑的命令输出)
4. 验证摘要中已 PASS 的命令不重跑;缺证据用最廉价命令补
5. verdict: approved | criticals_found
6. 你不修改任何业务代码
```

## 步骤 3: 读 review.md 处理裁定

```bash
VERDICT=$(grep "^verdict:" .planning/build/review.md | awk '{print $2}')
```

**若 `approved`:**
- 更新 STATE(见步骤 5)
- 提示下一步:`/ql-deliver`

**若 `criticals_found`:** 进入修复循环(步骤 4)。

## 步骤 4: 修复循环(最多 2 轮复审)

对每个 critical 发现:

1. **定向修复** —— 小修(< 3 文件)主会话直接修;大修派发 `ql-builder-coordinator`,任务描述**只含** critical 发现清单 + 修复指引 + 相关文件边界,不含评审过程叙事。
   **续接优先于冷启动:** 修复涉及原 worker 的实现区域时,优先续接原 worker(`SendMessage` 到其 agentId,附 critical 发现)——它的上下文完好:知道任务、代码结构与自己的实现取舍,无需重读任务卡与代码,首轮修复质量最高;原 worker 会话已不可续(崩溃/压缩/跨会话)才派新 worker,并以单端点报告文件为持久记忆。连续两轮修复同一条 critical 后,**换全新 worker** 冷启动重做该任务(连续失败往往说明首轮实现思路错了,原上下文反而是包袱)。
2. **只重跑受影响的验证** —— 不全量重跑;把新命令与结果(PASS/FAIL)追加到 verification.md。
3. **再派发 ql-reviewer(第 N+1 轮)** —— 任务描述附上一轮 review.md 的待复审项;评审者只复审修复区域 + 确认未引入新 critical。
4. 每轮递增 review.md 的 `round:` 字段。

**处置账本纪律(append-only):** 所有发现的处置记入 review.md 的"处置账本"(FIXED / WAIVED / DEFERRED / REFUTED 四值枚举 + evidence + decided_by + round)。后续轮次只能**追加**或声明"取代 F2",**不得删改旧行**;行引用写 `L42@abc1234`(行号 + 文件版本),裸行号不合规——放任格式自由,两轮后必然出现两种不兼容的处置记录。

**不收敛判定:** 连续两轮复审在同一区域出现同类 critical,或修复引入了新的 critical——**停止循环**,向用户报告:

- 遗留 critical 清单(带证据)
- 已尝试的修复与失败原因
- 三个选项交用户决策(`AskUserQuestion`):

| 选项 | 行为 |
|------|------|
| 人工介入修复 | 用户自行处理后再复审 |
| **豁免交付(WAIVED)** | 用户显式接受遗留 critical:review.md 写 `verdict: waived` + `waived_by: <用户>` + `waive_reason`,被豁免项进入交付记录 |
| 回滚本阶段 | 丢弃本阶段变更 |

**评审者与实现者都无权自批 WAIVED**——豁免只能由用户做出。不强行 approved,不静默降级。

## 步骤 5: 更新 STATE

```yaml
---
status: reviewed
review_verdict: approved | waived   # waived 时交付记录必须带豁免人与理由
review_rounds: N
reviewed_range: <base>..<head>
last_activity: independent review passed
---
```

## 步骤 6: 提示下一步

呈现:

- 评审裁定与轮次
- critical 发现数(已全部解决)与 non-critical 数(遗留清单)
- non-critical 项将随 PR 正文交付,供人工评审参考
- 下一步:`/ql-deliver`

</process>
