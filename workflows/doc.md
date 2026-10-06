<!-- ql:loop-host
step: chapter
points: chapter:pre, chapter:post
agent-roles: orchestrator
produces: .qiling/docs/README.md, .qiling/docs/chapters/chapter-NN-*.md
consumes: openapi.yaml, event-flow.md, build/skeleton-report.md, build/fill-report.md, build/verification.md, git log
-->

<purpose>
**章节留档生成(教科书式)** —— 在 `/ql-deliver` 成功推送 PR 后,自动产出到项目书:
1. **章节文件**:`.qiling/docs/chapters/chapter-NN-*.md`——本章导学(学习目标/前置/读法)→ 正文五章(是什么/快速上手/使用说明/配置与限制/故障排查)→ 本章小结/下一章(要点回顾/学习路径)→ 附录三章(交付留档/章节对比/数据来源与验证)
2. **索引文件**:`.qiling/docs/README.md`——前言(讲什么/适合谁/怎么读)→ 目录(按篇分组)→ 参考汇总 → 术语表 → 关于本书

**篇章组织:** 每章 frontmatter `part` = 篇名,按知识域归组(一篇可多章);目录按篇分组、按学习顺序排列。

**核心定位:** 项目 = 一本教科书,每次交付 = 追加一章;读者按导学循序渐进,查用型读者直接进 §三。
**触发位置:** 在 `workflows/deliver.md` 的"步骤 3 推送 PR"成功之后。
</purpose>

<process>

## 步骤 1: 准备目录与读取上下文

```bash
mkdir -p .qiling/docs/chapters
mkdir -p .qiling/docs/chapters/.diffs

# 读取上下文
test -f .qiling/planning/context/openapi.yaml || {
  echo "错误: 缺少 openapi.yaml。请先运行 /ql-design"
  exit 1
}

CURRENT_PHASE=$(grep "^current_phase:" .qiling/planning/STATE.md | awk '{print $2}')
PR_URL=$(gh pr view --json url --jq .url 2>/dev/null || echo "")
HEAD_COMMIT=$(git rev-parse HEAD)
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
```

## 步骤 2: 确定章节编号

```bash
# 章节编号 = 当前阶段号,左补零到 2 位
CHAPTER_ID=$(printf "chapter-%02d" "$CURRENT_PHASE")

# 章节标题 = OpenAPI info.title
CHAPTER_TITLE=$(yq '.info.title // "未命名项目"' .qiling/planning/context/openapi.yaml)

# 文件名 = chapter-NN-<slug>
SLUG=$(echo "$CHAPTER_TITLE" | tr '[:upper:] ' '[:lower:]-' | tr -cd 'a-z0-9-')
CHAPTER_FILE=".qiling/docs/chapters/${CHAPTER_ID}-${SLUG}.md"
```

## 步骤 3: 从 OpenAPI 渲染教科书章(教学外壳 + 正文五章)

从 `templates/chapter.md` 取模板,自动填充:

| 数据来源 | 填充位置 |
|---------|----------|
| 知识域归属(从端点语义/项目模块归纳) | frontmatter `part`(篇名;已有相近篇并入,否则新开一篇) |
| `openapi.yaml` info.description | 章节顶部"一句话" + §一 覆盖能力概述 + 导学的"本章你将学到" |
| 章节 ID 升序的前置章 | 导学"前置章节"(起步章之后默认指第一章;可按依赖人工改写) |
| `openapi.yaml` security scheme | §二 快速上手的认证前置 + §四 认证方式 |
| 第一个 GET 端点 + 示例生成 | §二 快速上手"第一个调用"(可复制 curl + 预期结果) |
| `openapi.yaml` paths | §三 端点清单表 + 端点详情(参数表/响应/示例) |
| `openapi.yaml` components.schemas | §三 数据模型表 |
| `openapi.yaml` 错误响应 | §五 故障排查(错误码 + 含义 + 怎么处理) |
| 速率限制/分页约定/known gaps | §四 配置与限制 |
| 端点/事件计数 | 本章小结(要点回顾,纯真实数据) |

**教学外壳与 §一/§二 均生成初稿**(manual:syllabus / overview / quickstart / summary / next)——语言面向学习者,禁止把生成流程细节写进正文。

## 步骤 4: 从 build 报告渲染附录 A(交付与开发留档)

从 `templates/chapter.md` 取附录 A 模板:

| 数据来源 | 填充位置 |
|---------|----------|
| `STATE.md` current_phase | 阶段编号 |
| `skeleton-report.md` | A.1 时序图 + A.3 构建产出 |
| `fill-report.md` | 同上(mock 替换/测试统计) |
| `verification.md` | A.3 验证产出 |
| `git log` | A.5 Git 历史摘要 |
| mermaid timeline(模板内嵌) | A.1 阶段时序图(只用报告真实值) |

## 步骤 5: 功能演进史追加(→ 附录 B)

**一章 = 一个功能单元(frontmatter `feature`)**:交付触达某功能时,**更新该章正文为最新态**(manual 块保留),并在其附录 B 演进史表**顶部追加一行**(版本/日期/变更/证据)——历史只增不清。

```bash
# 按功能域定位既有章节(无则按 /ql-doc 结构新建)
CHAPTER=$(grep -rl "feature: \"${FEATURE_SLUG}\"" .qiling/docs/chapters/ | head -1)
```

正文更新来源:diff OpenAPI(相对上次交付)归纳"该功能本次发生了什么",写进演进史新行;破坏性变更必须写明迁移方式。

## 步骤 6: 保留人工撰写内容,写章节文件

**人工保护区(硬性要求):** 若被覆盖的旧章节存在 `<!-- manual:ID -->…<!-- /manual:ID -->` 块,**同 ID 块必须原样写入新章节**(那是人工撰写的概述与上手说明,覆盖即事故)。`scripts/docsmap.mjs` 的 `preserveManual()` 是参考实现。

```bash
# 章节文件 = 渲染后的完整 Markdown(manual 块已保留)
cat "$RENDERED_CHAPTER" > "$CHAPTER_FILE"
echo "✓ 章节文件已生成:$CHAPTER_FILE"
```

## 步骤 7: 更新索引文件 `.qiling/docs/README.md`

读取 `templates/chapter-index.md`,然后:

1. **目录:** 扫描 `.qiling/docs/chapters/chapter-*.md`,读 frontmatter `part` 分组、按章号排序,渲染树状目录
2. **参考汇总:** 合并所有章节 §三 的端点表,去重
3. **错误码汇总:** 合并所有章节 §五 故障排查的错误码表,去重
4. **数据模型汇总 / 术语表:** 数据模型合并去重;术语表由章节累积或人工补充,机器不臆造
5. **关于本书:** 从 `STATE.md` 与最新章节 frontmatter 汇总版本/基线 commit/章节数,折叠区呈现

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

🤖 由器灵工作流 /ql-deliver 生成"

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

下一步:审阅章节文档,如有错误修改 openapi.yaml 后重跑 /ql-deliver。
```

</process>

---

<integration>

## 与 ship 的跳接点

`workflows/deliver.md` 在 PR 创建成功后,跳转到本工作流:

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
/ql-deliver     # 推送 PR + 生成章节
# 或独立触发
/ql-doc  # 仅生成章节(不推送 PR)
```

## 与 discuss 的跳接点

功能首次触达时新建章节,附录 B 演进史从该功能的首次交付记起——这是正常的首条状态。

</integration>