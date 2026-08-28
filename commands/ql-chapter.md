---
name: ql:chapter
description: 章节留档生成——基于 openapi + 构建报告,产出 .qiling/docs/ 下的章节文档与索引(API 文档 + 开发流程留档)
argument-hint: "[--preview | --regenerate-all]"
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
  - Grep
  - AskUserQuestion
requires: [ql-ship]
---

<objective>
基于 `/ql-discuss` 产出的 OpenAPI 与 `/ql-build` 产出的报告,**生成章节留档文档**:

- **章节文件**:`.qiling/docs/chapters/chapter-NN-<slug>.md`
  - §一:详细 API 文档(端点 + schema + 错误码 + 使用示例)
  - §二:本章节开发流程留档(阶段时序 + 报告摘要 + Git 历史)
  - §三:与上一章节的对比(新增/修改/删除的 API)
  - §四:关联文档链接
  - §五:变更日志
- **索引文件**:`.qiling/docs/README.md`
  - 章节列表
  - API 总览(去重跨章节)
  - 错误码汇总
  - 数据模型汇总
  - 项目元信息

**触发时机:**
- 默认:由 `/ql-ship` 完成后自动调用
- 手动:`/ql-chapter` 独立触发

**标志:**
- `--preview` —— 仅预览,不写文件(显示将生成的章节内容)
- `--regenerate-all` —— 重新生成所有章节(用于模板变更后批量重生)

**为什么是章节而非任务:**
- 任务粒度过细,文档碎片化,无法对外发布
- 章节与"ql 循环"对齐,既是开发流程的留档,也是 API 文档
- 对外用户只需看一章,不看 100 个任务
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