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
基于 OpenAPI + 构建/验证报告,产出**说明书式**章节文档:

- **章节文件**:正文五章面向使用者(§一 是什么 / §二 快速上手 / §三 使用说明(API 参考) / §四 配置与限制 / §五 故障排查),附录三章面向维护者与审计(附录 A 交付与开发留档 / 附录 B 与上一章节对比 / 附录 C 数据来源与验证)
- **索引文件**:项目说明书首页(定位 → 快速上手 → 功能与章节地图 → 参考汇总 → 关于本文档折叠区)

**核心定位:** 章节文档是该阶段交付功能的**说明书**——先回答"是什么、怎么上手、怎么用、报错怎么办";开发流程留档降级为附录,不打扰使用者。

**人工保护区(必须遵守):** 渲染新章节前,若旧章节存在 `<!-- manual:ID -->…<!-- /manual:ID -->` 块(如 manual:overview、manual:quickstart),**同 ID 块必须原样保留**到新章节——那是人工撰写的内容,覆盖即事故。

**讨论清单(若用户主动触发 `/ql-doc` 时):**

| 主题 | 关键问题 |
|------|----------|
| 章节粒度 | 一个 ql 循环 = 一个功能分册章节?(当前默认) |
| API 详尽程度 | 端点详情含参数表 + 响应 + 示例?(当前默认) |
| 快速上手起点 | 哪个端点作为"第一个调用"?(默认第一个 GET) |
| 重新生成 | 模板变更后批量重生所有章节?(manual 块自动保留) |

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