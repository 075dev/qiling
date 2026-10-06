---
name: ql-doc
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
- `/ql-doc` 通常由 `/ql-deliver` 自动调用,用户也可手动触发
- `--preview` 用于调试模板,不影响正式产出
</runtime_note>

<context>
**章节文件位置:**
- `.qiling/docs/README.md`(索引)
- `.qiling/docs/chapters/chapter-NN-*.md`(每章一个)

**章节编号 = ql 阶段编号**(从 STATE.md 读 current_phase)。

**触发:**
- 默认:`/ql-deliver` 完成后自动调用
- 手动:`/ql-doc` 独立触发,用于模板变更后重生
</context>

<objective>
基于 OpenAPI + 构建/验证报告,产出**教科书式**章节,追加到项目书中:

- **章节文件**:**本章导学**(学习目标/前置章节/读法)→ **正文五章**(§一 是什么 / §二 快速上手 / §三 使用说明(API 参考) / §四 配置与限制 / §五 故障排查)→ **本章小结 / 下一章**(要点回顾/学习路径)→ **附录三章**(附录 A 交付与开发留档 / 附录 B 功能演进史 / 附录 C 数据来源与验证)
- **索引文件**(全书门面):前言(讲什么/适合谁/怎么读)→ 目录(按篇分组)→ 参考汇总 → 术语表 → 关于本书

**章节制(核心语义):** **一章 = 一个功能单元**(frontmatter `feature` slug,按项目功能域划分:插件 = 技能/命令,REST = 资源域,CLI = 子命令)。交付触达某功能时**更新该章正文为最新态**(manual 块保留),并在其附录 B 功能演进史追加一行——**不再按交付追加新章**;篇章组织:`part` 按知识域归组,一篇可含多章。

**人工保护区(必须遵守):** 渲染新章节前,若旧章节存在 `<!-- manual:ID -->…<!-- /manual:ID -->` 块(syllabus / overview / quickstart / summary / next),**同 ID 块必须原样保留**到新章节——那是人工撰写的内容,覆盖即事故。

**讨论清单(若用户主动触发 `/ql-doc` 时):**

| 主题 | 关键问题 |
|------|----------|
| 章节粒度 | 一个 ql 循环 = 一章(教科书的一个知识单元)?(当前默认) |
| 篇名(part) | 本章归入哪一篇?已有相近篇就并入,否则新开一篇 |
| 学习路径 | "下一章"指向哪章?按学习依赖,不必等于交付顺序 |
| 快速上手起点 | 哪个端点作为"第一个调用"?(默认第一个 GET) |

**不要讨论:**
- 模板细节(模板已固化:templates/chapter.md)
- 文件路径(已确定)

**产出:**
- `.qiling/docs/README.md`
- `.qiling/docs/chapters/chapter-NN-*.md`

**下一步:** 人工审阅章节文档,如有错误修改 `openapi.yaml` 后重跑 `/ql-deliver`。
</objective>

<execution_context>
@../../workflows/doc.md
@../templates/chapter.md
@../templates/chapter-index.md
</execution_context>

<process>
端到端执行。
保留所有工作流门控(章节编号、API 渲染、流程汇总、对比变更、索引更新)。
</process>