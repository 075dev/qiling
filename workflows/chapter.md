<!-- ql:loop-host
step: chapter
points: chapter:pre, chapter:post
agent-roles: orchestrator
produces: .qiling/docs/README.md, .qiling/docs/chapters/chapter-NN-*.md
consumes: openapi.yaml, event-flow.md, build/skeleton-report.md, build/fill-report.md, build/verification.md, git log
-->

<purpose>
**章节留档生成** —— 在 `/ql-ship` 成功推送 PR 后,自动产出:
1. **章节文件**:`.qiling/docs/chapters/chapter-NN-*.md`(API 文档 + 开发流程留档)
2. **索引文件**:`.qiling/docs/README.md`(所有章节的汇总索引)

**核心定位:** 章节文档既是项目开发留档,也是该阶段 API 的开发者文档。
**触发位置:** 在 `workflows/ship.md` 的"步骤 3 推送 PR"成功之后。
</purpose>

<process>

## 步骤 1: 准备目录与读取上下文

```bash
mkdir -p .qiling/docs/chapters
mkdir -p .qiling/docs/chapters/.diffs

# 读取上下文
test -f .planning/context/openapi.yaml || {
  echo "错误: 缺少 openapi.yaml。请先运行 /ql-discuss"
  exit 1
}

CURRENT_PHASE=$(grep "^current_phase:" .planning/STATE.md | awk '{print $2}')
PR_URL=$(gh pr view --json url --jq .url 2>/dev/null || echo "")
HEAD_COMMIT=$(git rev-parse HEAD)
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
```

## 步骤 2: 确定章节编号

```bash
# 章节编号 = 当前阶段号,左补零到 2 位
CHAPTER_ID=$(printf "chapter-%02d" "$CURRENT_PHASE")

# 章节标题 = OpenAPI info.title
CHAPTER_TITLE=$(yq '.info.title // "未命名项目"' .planning/context/openapi.yaml)

# 文件名 = chapter-NN-<slug>
SLUG=$(echo "$CHAPTER_TITLE" | tr '[:upper:] ' '[:lower:]-' | tr -cd 'a-z0-9-')
CHAPTER_FILE=".qiling/docs/chapters/${CHAPTER_ID}-${SLUG}.md"
```

## 步骤 3: 从 OpenAPI 渲染 API 部分

从 `templates/chapter.md` 取 §一"API 详细文档"模板,自动填充:

| 数据来源 | 填充位置 |
|---------|----------|
| `openapi.yaml` paths | 端点清单表 + 端点详情 |
| `openapi.yaml` components.schemas | 数据模型表 |
| `openapi.yaml` 错误响应 | 错误码参考表 |
| 推断 | 使用示例(curl + TS + Python) |

## 步骤 4: 从 build 报告渲染流程部分

从 `templates/chapter.md` 取 §二"开发流程留档"模板:

| 数据来源 | 填充位置 |
|---------|----------|
| `STATE.md` current_phase | 阶段编号 |
| `skeleton-report.md` | 骨架阶段摘要 |
| `fill-report.md` | 填充阶段摘要 |
| `verification.md` | 验证阶段摘要 |
| `git log` | Git 历史摘要 |
| mermaid timeline(模板内嵌) | 阶段时序图 |

## 步骤 5: 与上一章节对比(变更留档)

```bash
# 查找上一章节文件
PREV_CHAPTER=$(ls -1 .qiling/docs/chapters/chapter-*.md 2>/dev/null | sort | tail -n 2 | head -n 1)

if [ -n "$PREV_CHAPTER" ]; then
  # diff OpenAPI:对比 path 增删
  # diff schema:对比 schema 字段变化
  # diff errors:对比 error 列表变化
  echo "本章节相对 ${PREV_CHAPTER} 的 API 变更"
fi
```

## 步骤 6: 写章节文件

```bash
# 章节文件 = 渲染后的完整 Markdown
# 内容来源:templates/chapter.md 模板 + 上述 3-5 步的填充结果

cat "$RENDERED_CHAPTER" > "$CHAPTER_FILE"
echo "✓ 章节文件已生成:$CHAPTER_FILE"
```

## 步骤 7: 更新索引文件 `.qiling/docs/README.md`

读取 `templates/chapter-index.md`,然后:

1. **章节列表表:** 扫描 `.qiling/docs/chapters/chapter-*.md`,按 ID 升序列出,提取 frontmatter 字段
2. **API 总览:** 合并所有章节的 §一端点表,去重
3. **错误码汇总:** 合并所有章节的 §一.4 错误码表,去重
4. **数据模型汇总:** 合并所有章节的 §一.3 数据模型表,去重
5. **项目元信息:** 从 `STATE.md` 与最新章节 frontmatter 汇总

```bash
cat "$RENDERED_INDEX" > ".qiling/docs/README.md"
echo "✓ 索引文件已更新:.qiling/docs/README.md"
```

## 步骤 8: 提交并推送(可选)

```bash
# 自动提交章节文档
git add .qiling/
git commit -m "docs(chapter-${CHAPTER_ID}): 自动生成章节文档

- 章节文件:$CHAPTER_FILE
- 索引:.qiling/docs/README.md
- API 端点:${ENDPOINT_COUNT}
- 事件消息:${EVENT_COUNT}

🤖 由器灵工作流 /ql-ship 生成"

# 推送到当前 PR
git push origin $(git branch --show-current)
```

## 步骤 9: 报告

```
✅ 章节文档已生成

章节文件:.qiling/docs/chapters/${CHAPTER_ID}-${SLUG}.md
索引文件:.qiling/docs/README.md

端点数:${ENDPOINT_COUNT}
事件数:${EVENT_COUNT}
波次数:${WAVE_COUNT}
关联 PR:${PR_URL}

下一步:审阅章节文档,如有错误修改 openapi.yaml 后重跑 /ql-ship。
```

</process>

---

<integration>

## 与 ship 的跳接点

`workflows/ship.md` 在 PR 创建成功后,跳转到本工作流:

```bash
# 在 ship 步骤 2 末尾追加:
PR_URL=$(gh pr view --json url --jq .url)
echo "✅ PR 已创建:$PR_URL"

# 跳转到 chapter 流程
echo "📝 生成章节文档..."
# 加载并执行 chapter 工作流
```

## 与 build 的跳接点

`workflows/build-fill.md` 的 verification 通过后,可手动触发:

```bash
# 用户手动调用
/ql-ship     # 推送 PR + 生成章节
# 或独立触发
/ql-chapter  # 仅生成章节(不推送 PR)
```

## 与 discuss 的跳接点

首次生成章节时,§三"与上一章节对比"会显示"无上一章节"——这是正常的首章节状态。

</integration>