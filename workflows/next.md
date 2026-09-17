<!-- ql:loop-host
step: next
points: next:pre, next:post
agent-roles: orchestrator
produces: 下一步建议(状态摘要 + 推荐命令)
consumes: STATE.md, 磁盘产物(openapi.yaml / verification.md / review.md / progress.md / bugfix 报告), git 状态
-->

<purpose>
**ql-next —— 状态感知的智能入口。**

回答一个问题:"我现在应该做什么?"

**核心原则:状态从磁盘推导,不信任何文件的自述。** STATE.md 会过期、会说谎(跨会话、崩溃、手工改动后);磁盘上的产物(契约/报告/台账)与 git 才是事实。本工作流先盘点磁盘,再交叉验证 STATE,最后给出一条主推荐。
</purpose>

<process>

## 步骤 1: 磁盘盘点(一次收集全部事实)

```bash
# A. 工作流产物
S_STATE=.planning/STATE.md
S_CONTRACT=.planning/context/openapi.yaml
S_FLOW=.planning/context/event-flow.md
S_DECISIONS=.planning/context/decisions.md
S_CONST=.planning/context/constitution.md
S_SKEL=.planning/build/skeleton-report.md
S_FILL=.planning/build/fill-report.md
S_VERIF=.planning/build/verification.md
S_REVIEW=.planning/build/review.md
S_LEDGER=.planning/build/progress.md

for f in $S_STATE $S_CONTRACT $S_FLOW $S_DECISIONS $S_CONST $S_SKEL $S_FILL $S_VERIF $S_REVIEW $S_LEDGER; do
  test -f "$f" && echo "有 $f" || echo "无 $f"
done

# B. 状态字段的值(存在才读)
grep "^status:" $S_STATE 2>/dev/null
grep "^status:" $S_VERIF 2>/dev/null          # passed | gaps_found
grep "^verdict:" $S_REVIEW 2>/dev/null        # approved | criticals_found | waived
grep "^verified_at_commit:" $S_VERIF 2>/dev/null

# C. 台账断点
grep -c "status:FAIL\|status:NOT_RUN" $S_LEDGER 2>/dev/null

# D. git 事实
git rev-parse --abbrev-ref HEAD               # 当前分支(在 main 上?)
git status --short | head -5                  # 未提交变更
git log --oneline -3

# E. 遗留物
ls .git/ql/worktrees/ 2>/dev/null             # worker worktree 未清理?
ls .planning/bugfix/ 2>/dev/null              # bugfix 报告(有无 blocked)
grep -l "status: blocked" .planning/bugfix/*.md 2>/dev/null
```

## 步骤 2: 状态判定(决策表,从上到下第一条命中即返回)

| # | 磁盘事实 | 判定:你在哪 | 下一步 |
|---|----------|--------------|--------|
| 1 | 无 `.planning/` 且无 `.qiling/docs/` | 项目未初始化 | **新项目** → `/ql-design`;**接手已有代码** → `/ql-scan`(并列推荐,问一句哪种) |
| 2 | 有 `.qiling/docs/` 但无 `.planning/` | 只有文档树,未进入开发循环 | `/ql-design` |
| 3 | ledger 存在且有 `status:FAIL` / `status:NOT_RUN` | 构建中断,有未完成任务 | **断点续跑** → `/ql-build`(从第一个非 PASS 继续) |
| 4 | bugfix 报告有 `status: blocked` | 有未解决的缺陷 | 处理 blocked bug:`/ql-fix <同一 bug>`(读原报告的已排除假设) |
| 5 | `.git/ql/worktrees/` 非空 | worker worktree 遗留 | 先清理 `git worktree remove`,再进下一步 |
| 6 | verification.md 存在且 `verified_at_commit` 落后 HEAD | 验证已 STALE | 重跑验证 → `/ql-build`(验证阶段) |
| 7 | verification `status: gaps_found` | 验证未通过 | 修复差距 → `/ql-build` 或按报告修复建议 |
| 8 | review.md `verdict: criticals_found` | 评审有未闭环 critical | 按处置账本修复 → 复审(`/ql-build` 阶段 4) |
| 9 | verification `passed` + review `approved`/`waived` + 有未提交变更 | 验证评审已过,工作未提交 | 提交变更 → `/ql-deliver` |
| 10 | verification `passed` + review `approved`/`waived` + 工作区干净 | 本阶段完成 | `/ql-deliver` |
| 11 | STATE `status: skeleton_complete` | 骨架已通,待填充 | `/ql-build`(自动进入填充) |
| 12 | STATE `status: discussed` 或 契约存在且冻结门已过 | 方案就绪 | `/ql-build` |
| 13 | STATE `status: discussing` 或 契约缺失/未冻结 | 讨论未完成 | `/ql-design`(继续澄清,读 STATE 的歧义评分) |
| 14 | STATE `status: shipped` 且无更多阶段 | 里程碑完成 | 归档或新里程碑 → `/ql-design` 开新阶段 |

**判定纪律:**

- 磁盘与 STATE 冲突时,**以磁盘为准**并在输出中说明冲突(如"STATE 说 verified,但 verification.md 落后 HEAD")
- 表中多条命中时取**编号最小**(最接近阻塞源的先处理)
- 所有 UNRESOLVED 的情况(如产物损坏不可解析)→ 展示事实,列出可选项,让用户决定

## 步骤 3: 输出建议

```text
📍 当前位置:<一句话,如"阶段 1 填充完成,验证通过,评审 approved">

事实依据:
- verification.md: passed (@ abc1234,未过期)
- review.md: approved(第 1 轮,无遗留 critical)
- 台账:12/12 PASS
- 工作区:干净,分支 ql/phase-1-users(非 main)

⚠️ 顺带发现:[工作区门控自检中发现的次要问题,如 worktree 遗留;无则省略]

✅ 下一步:/ql-deliver —— 呈现交付信息并确认收尾方式(创建 PR / 仅推送 / 保留本地)

备选:[如有,如"/ql-fix(ledger 中 1 条 NOT_RUN 的测试待补)"]
```

**只建议,不自动执行**——用户确认后由对应技能接管(ql-next 本身零副作用,不改任何文件)。

</process>
