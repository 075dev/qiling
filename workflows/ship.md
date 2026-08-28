<!-- ql:loop-host
step: ship
points: ship:pre, ship:post
agent-roles: orchestrator
produces: PR, STATE 更新
consumes: verification.md, openapi.yaml
-->

<purpose>
将本地完成的工作交付到合并的 PR。在 `/ql-build` 通过自动验证后交付。
关闭**讨论 → 构建 → 交付**循环。
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

git status --short | grep -q . && {
  echo "错误: 工作区有未提交变更。请先提交。"
  exit 1
}
```

## 步骤 2: 推送并创建 PR

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
- AI 自动规划 + 执行 + 验证

### 验证
- verification.md: passed
- 测试:[统计]
- 构建:成功

🤖 由 器灵工作流生成
EOF
)

gh pr create --title "feat: 实现 [功能集]" --body "$PR_BODY"
```

## 步骤 3: 更新 STATE

```yaml
---
status: shipped
last_activity: shipped PR
current_phase: 1_of_N_done
---
```

## 步骤 4: 推进到下一阶段

读 `.planning/STATE.md` 中的 `total_phases`(若有)。若 < N:
- 提示:`/ql-discuss`(进入下一讨论阶段)

若所有阶段已交付:
- 提示:新里程碑或项目归档

</process>