---
name: ql-scan
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
- 文档树产出与 `/ql-doc` 共用同一索引 `.qiling/docs/README.md`
- 默认拒绝同 slug 重复章节;项目结构大改后用 `--force` 重扫覆盖
- 章节 ID 自动从现有最大值 + 1 起算
- 渲染走 `scripts/docsmap.mjs`(端到端:扫描→提取→渲染→索引→11 条断言),断言不全绿不得交付
</runtime_note>

<context>
**触发场景:**
- 接手已有项目(无 `.qiling/`,无 OpenAPI)
- 初始化新项目但代码已存在
- 项目结构大改后刷新文档树(`--force`)

**与 `/ql-doc` 关系:**
- `ql-scan` = 初始化入口(读代码 → 文档树)
- `ql-doc` = 持续入口(读 OpenAPI → 文档树)
- 两者产出**结构完全一致**,索引合并为同一份
</context>

<objective>
扫描项目结构,产出**教科书式**项目书的第一章与全书门面:

- **章节文件**:`.qiling/docs/chapters/chapter-NN-<slug>.md`(第一章 · 起步:导学 + 正文五章 + 小结/下一章 + 附录三章,与 ql-doc 同骨架)
- **索引文件**:`.qiling/docs/README.md`(全书门面:前言 → 目录(按篇分组)→ 参考汇总 → 术语表 → 关于本书)

**功能域发现与分章(0.21.0):** **一章 = 一个功能单元**。信号优先级:①项目根 `features.json` 清单声明(feature/title/part/description/include/include 排除 exclude)②源码功能目录启发式(排除 core/utils/types/i18n 等基础设施词,标注推断)。每个域生成一章(起步章之后的 chapter-NN-<feature>.md:该域能力入口带证据 + 归属文件清单 + 教科书骨架);重扫按 feature 定位既有章更新(manual 保留,块内 <!-- auto --> 数据行刷新)。提取器持久化:项目根 `patterns.json` 默认读取(与 --patterns 等效)。

**章节内容覆盖:**

教学外壳(教科书惯例):
- **本章导学**(manual:syllabus——本章你将学到什么/前置章节/读法;先读小结再读正文是合法读法)

正文五章(面向使用者):
- §一 **这个功能是什么**(manual:overview——能力一览表 + 项目形态,欢迎人工补充)
- §二 **快速上手**(manual:quickstart——环境/安装/运行/下一步,只用真实检出命令;启动链路检出才画 mermaid)
- §三 **使用说明**(npm 命令清单 / HTTP 路由 / 事件 / 命令工具注册 / 目录树;未检出的类型整节省略)
- §四 **配置与限制**(技术栈 / 包管理器 / 入口 / 依赖清单)
- §五 **故障排查**(跑不起来的排查指引 / 能力清单太少的解释 / 过期自查)

章末(教学外壳):
- **本章小结**(manual:summary——真实数据的要点回顾)
- **下一章**(manual:next——起步章指向"交付后追加功能章";人工可按学习路径改写)

附录三章(面向维护者与审计):
- 附录 A **交付与开发留档**(扫描信息 / 新代码放哪推断指引 / 下一步)
- 附录 B **与上一章节对比**(初始化章节显示"无")
- 附录 C **数据来源与验证**(关联文档 / **未检出清单** / 证据与推断约定 / 变更日志)

**篇章组织:** 起步章 frontmatter `part: "第一篇 · 认识项目"`;后续功能章由 /ql-doc 按知识域归篇,首页目录按篇分组。

**严谨性五铁律(书本的生命线,违反任何一条即为缺陷):**

| # | 铁律 | 落地方式 |
|---|------|----------|
| 1 | **证据锚点** | 提取的每条路由/事件附 `文件:行号`;断言 3 校验锚点数 ≥ 条目数 |
| 2 | **未检出显式声明** | 扫不到写"未检出(Not detected)"+ 原因与建议,**集中在附录 C 未检出清单**,正文不印验证噪音;断言 2 校验 |
| 3 | **推断必须标注** | 目录职责/框架用途/新代码位置一律带"(推断)"标记 |
| 4 | **不画假图** | 启动流程 mermaid 只用真实检测值(入口文件存在性已校验);检不出就不画;断言 8 校验 |
| 5 | **新鲜度戳** | frontmatter `last_mapped_commit` 由脚本写入;首页"关于本书"给过期自查指引 |

**人工保护区:** 章节内 `<!-- manual:ID -->…<!-- /manual:ID -->` 块(syllabus / overview / quickstart / summary / next)供人工撰写润色,`--force` 重扫时**同 ID 块原样保留**;断言 11 校验标记配对完整。

另:产出后**密钥扫描**(sk-/ghp_/AKIA/私钥头),命中即失败——文档不得包含敏感值。

**讨论清单(若用户主动触发 `/ql-scan` 时):**

| 主题 | 关键问题 |
|------|----------|
| 扫描范围 | 全项目?还是 src/、app/、lib/?(超大项目建议收窄) |
| 现有章节处理 | 已有同 slug 章节时:覆盖(--force,manual 块保留)/中止? |
| 跳过目录 | node_modules、dist、build 等已默认忽略;有无自定义忽略? |

**不要讨论:**
- 章节模板细节(与 ql-doc 共用)
- 索引格式(与 ql-doc 共用)

**产出:**
- `.qiling/docs/README.md`(增量更新)
- `.qiling/docs/chapters/chapter-NN-*.md`(新增或 --force 覆盖)

**下一步:** 进入 `/ql-design` 或 `/ql-build`,从代码到 API。
</objective>

<execution_context>
@../../workflows/scan.md
@../templates/chapter.md
@../templates/chapter-index.md
@../scripts/docsmap.mjs
</execution_context>

<process>
端到端执行。
保留所有工作流门控(目录扫描、证据锚点提取、说明书章节渲染、索引合并、11 条断言、manual 保留、密钥扫描)。
</process>
