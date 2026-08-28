---
name: ql-chapter
description: "章节留档生成——基于 openapi + 构建报告,产出 .qiling/docs/ 下的章节文档与索引(API 文档 + 开发流程留档)"
argument-hint: "[--preview | --regenerate-all]"
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
- 章节文档**只读快照**——不要让用户手改
- `/ql-chapter` 通常由 `/ql-ship` 自动调用,用户也可手动触发
- `--preview` 用于调试模板,不影响正式产出
</runtime_note>

<context>
**章节文件位置:**
- `.qiling/docs/README.md`(索引)
- `.qiling/docs/chapters/chapter-NN-*.md`(每章一个)

**章节编号 = ql 阶段编号**(从 STATE.md 读 current_phase)。

**触发:**
- 默认:`/ql-ship` 完成后自动调用
- 手动:`/ql-chapter` 独立触发,用于模板变更后重生
</context>

<objective>
基于 OpenAPI + 构建/验证报告,产出:

- **章节文件**:API 详细文档 + 本章节开发流程留档 + 与上一章节对比
- **索引文件**:所有章节的汇总(API 总览、错误码、数据模型)

**核心定位:** 章节文档既是项目开发留档,也是该阶段 API 的开发者文档。

**讨论清单(若用户主动触发 `/ql-chapter` 时):**

| 主题 | 关键问题 |
|------|----------|
| 章节粒度 | 一个 ql 循环 = 一个章节?(当前默认) |
| API 详尽程度 | 含使用示例 + 变更对比?(当前默认) |
| 索引粒度 | 单文件索引?还是分类索引? |
| 重新生成 | 模板变更后批量重生所有章节? |

**不要讨论:**
- 模板细节(模板已固化)
- 文件路径(已确定)

**产出:**
- `.qiling/docs/README.md`
- `.qiling/docs/chapters/chapter-NN-*.md`

**下一步:** 人工审阅章节文档,如有错误修改 `openapi.yaml` 后重跑 `/ql-ship`。
</objective>

<execution_context>
@../workflows/chapter.md
@../templates/chapter.md
@../templates/chapter-index.md
</execution_context>

<process>
端到端执行。
保留所有工作流门控(章节编号、API 渲染、流程汇总、对比变更、索引更新)。
</process>