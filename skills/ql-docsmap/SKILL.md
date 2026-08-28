---
name: ql-docsmap
description: "文档树生成——通过阅读项目结构,产出与章节留档完全一致格式的文档树(.qiling/docs/)"
argument-hint: "[--path <dir>] [--refresh] [--merge]"
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
  - Grep
  - AskUserQuestion
---

<runtime_note>
**Zcode:**
- 文档树产出与 `/ql-chapter` 共用同一索引 `.qiling/docs/README.md`
- 默认增量 append,不覆盖已有章节(除非 `--refresh`)
- 章节 ID 自动从现有最大值 + 1 起算
</runtime_note>

<context>
**触发场景:**
- 接手已有项目(无 `.qiling/`,无 OpenAPI)
- 初始化新项目但代码已存在
- 项目结构大改后刷新文档树

**与 `/ql-chapter` 关系:**
- `ql-docsmap` = 初始化入口(读代码 → 文档树)
- `ql-chapter` = 持续入口(读 OpenAPI → 文档树)
- 两者产出**结构完全一致**,索引合并为同一份
</context>

<objective>
扫描项目结构,产出:

- **章节文件**:`.qiling/docs/chapters/chapter-NN-<slug>.md`(与 ql-chapter 5 节结构相同)
- **索引文件**:增量更新 `.qiling/docs/README.md`

**章节内容覆盖:**
- §一 **API/能力清单**(从代码 export / routes / events 推断)
- §二 **项目结构与流程**(目录树 + 模块依赖 + 启动流程)
- §三 **与上一章节对比**(本命令为首次,显示"无")
- §四 **关联文档链接**
- §五 **变更日志**

**核心承诺:** 与 `/ql-chapter` 产出**结构完全一致**——这是用户明确决策的工作流顺畅性要求。

**讨论清单(若用户主动触发 `/ql-docsmap` 时):**

| 主题 | 关键问题 |
|------|----------|
| 扫描范围 | 全项目?还是 src/、app/、lib/? |
| 章节粒度 | 按目录?按模块?按文件? |
| 现有章节处理 | 合并/覆盖/增量? |
| 跳过目录 | node_modules、dist、build 等 |

**不要讨论:**
- 章节模板细节(与 ql-chapter 共用)
- 索引格式(与 ql-chapter 共用)

**产出:**
- `.qiling/docs/README.md`(增量更新)
- `.qiling/docs/chapters/chapter-NN-*.md`(新增或追加)

**下一步:** 进入 `/ql-discuss` 或 `/ql-build`,从代码到 API。
</objective>

<execution_context>
@../workflows/docsmap.md
@../templates/chapter.md
@../templates/chapter-index.md
@../scripts/docsmap.mjs
</execution_context>

<process>
端到端执行。
保留所有工作流门控(目录扫描、章节 ID 分配、文档树渲染、索引合并)。
</process>