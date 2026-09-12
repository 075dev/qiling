<!-- ql:loop-host
step: ship
points: ship:pre, ship:post
agent-roles: orchestrator
produces: PR(用户确认后)、STATE 更新
consumes: verification.md, review.md, openapi.yaml
-->

<purpose>
将本地完成的工作交付到合并的 PR。在 `/ql-build` 通过自动验证**与独立评审**后交付。
关闭**讨论 → 构建 → 交付**循环。

**不自动收尾:** 推送与创建 PR 是对外动作,必须经用户确认收尾方式后执行。
</purpose>

<process>

## 步骤 1: 前置检查

```bash
test -f .planning/build/verification.md || {
  echo "错误: 构建验证未完成。请先运行 /ql-build"
  exit 1
}

STATUS=$(grep "^status:" .planning/build/verification.md | awk '{print $2}')
test "$STATUS" = "passed" || {
  echo "错误: 验证未通过 (status=$STATUS)。请先修复。"
  exit 1
}

# 验证时效检查:结论是会过期的数据
V_COMMIT=$(grep "^verified_at_commit:" .planning/build/verification.md | awk '{print $2}')
HEAD_SHA=$(git rev-parse HEAD)
if [ -z "$V_COMMIT" ] || ! git merge-base --is-ancestor "$V_COMMIT" "$HEAD_SHA" 2>/dev/null; then
  echo "错误: 验证报告落后于当前 HEAD (verified_at_commit=$V_COMMIT),结论已 STALE。请重跑验证。"
  exit 1
fi

test -f .planning/build/review.md || {
  echo "错误: 独立评审未完成。请先运行 /ql-build(含阶段 4 评审)"
  exit 1
}

VERDICT=$(grep "^verdict:" .planning/build/review.md | awk '{print $2}')
case "$VERDICT" in
  approved) ;;
  waived)
    WAIVED_BY=$(grep "^waived_by:" .planning/build/review.md | cut -d' ' -f2-)
    WAIVE_REASON=$(grep "^waive_reason:" .planning/build/review.md | cut -d' ' -f2-)
    test -n "$WAIVED_BY" && test -n "$WAIVE_REASON" || {
      echo "错误: 评审为 waived 但缺少 waived_by / waive_reason。豁免必须登记完整。"
      exit 1
    }
    echo "⚠️ 评审已豁免交付(豁免人:$WAIVED_BY)。被豁免的 critical 将写入交付记录。"
    ;;
  *)
    echo "错误: 评审未通过 (verdict=$VERDICT)。请先处理 critical 发现,或由用户显式豁免。"
    exit 1
    ;;
esac

git status --short | grep -q . && {
  echo "错误: 工作区有未提交变更。请先提交。"
  exit 1
}
```

## 步骤 2: 呈现交付信息,确认收尾方式

收集并呈现:

```bash
git branch --show-current          # 特性分支
git rev-parse HEAD                 # head SHA
grep "^base_sha:" .planning/STATE.md   # base SHA
test -d .qiling/docs && echo ".qiling/docs/"   # 章节留档路径
```

用 `AskUserQuestion` 让用户选收尾动作:

| 选项 | 行为 |
|------|------|
| **创建 PR(推荐)** | push + `gh pr create` + 生成章节留档 |
| 仅推送 | 只 `git push`,不创建 PR |
| 保留本地 | 不推送,停在当前分支 |

**Worktree 陷阱:**
- PR 合并(`gh pr merge`)与本地 merge 都要**从主仓库 checkout 执行**——base 分支被其他 worktree 占用时无法切换
- 清理 worker worktree 只允许删 `.git/ql/worktrees/` 下的路径

用户选"保留本地" → 跳到步骤 4(只更新 STATE),不推送。

## 步骤 3: 推送并创建 PR(用户确认后)

```bash
git push origin $(git branch --show-current)

# 自动生成 PR 正文
PR_BODY=$(cat <<EOF
## 实现 [从 OpenAPI 提取的功能集]

### API 端点
$(grep "^  /" .planning/context/openapi.yaml | sed 's/^/  - /')

### 事件流程
[从 event-flow.md 提取关键场景]

### 构建方法
- 骨架先行(Walking Skeleton)
- AI 自动规划 + 执行 + 验证 + 独立评审

### 验证
- verification.md: passed(每条命令 PASS/FAIL/PRE-EXISTING 记录在案)
- review.md: approved(第 N 轮)
- 测试:[统计]
- 构建:成功

### 遗留事项(供人工评审参考)
[review.md 中 non-critical 发现;若 verdict 为 waived,列明被豁免的 critical + 豁免人 + 理由;无则写"无"]

### 经验教训
[构建报告旅程日志 ≤5 条;无则省略本节]

🤖 由 器灵工作流生成
EOF
)

gh pr create --title "feat: 实现 [功能集]" --body "$PR_BODY"
```

## 步骤 3.5: 生成章节留档(自动)

PR 创建成功后,自动跳转到 `workflows/doc.md`,生成:

- `.qiling/docs/chapters/chapter-NN-<slug>.md`(本章节 API + 流程文档)
- `.qiling/docs/README.md`(章节索引)

```bash
# 章节生成(由 /ql-deliver 自动触发)
echo "📝 生成章节文档..."
# 加载并执行 workflows/doc.md
```

详见 `workflows/doc.md`。

## 步骤 4: 更新 STATE

```yaml
---
status: shipped
last_activity: >-
  shipped PR + chapter generated
  (用户选择:创建 PR / 仅推送 / 保留本地)
chapter_id: chapter-NN
docs_path: .qiling/docs/
current_phase: 1_of_N_done
---
```

## 步骤 5: 推进到下一阶段

读 `.planning/STATE.md` 中的 `total_phases`(若有)。若 < N:
- 提示:`/ql-design`(进入下一讨论阶段)

若所有阶段已交付:
- 提示:新里程碑或项目归档

</process>
