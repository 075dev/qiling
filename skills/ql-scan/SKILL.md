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
- 渲染走 `scripts/docsmap.mjs`(端到端:扫描→提取→渲染→索引→10 条断言),断言不全绿不得交付
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
扫描项目结构,产出:

- **章节文件**:`.qiling/docs/chapters/chapter-NN-<slug>.md`(与 ql-doc 5 节结构相同)
- **索引文件**:`.qiling/docs/README.md`(产品说明书首页:定位导读 + 角色路由 + 章节列表 + 能力总览 + 新鲜度提示)

**章节内容覆盖:**
- §一 **能力清单**(npm scripts 原样;HTTP 路由/事件按接收者白名单提取,每条带 `文件:行号` 证据)
- §二 **结构与流程**(技术栈/依赖/目录树含职责推断与截断提示/启动流程/新代码放哪)
- §三 **与上一章节对比**(本命令为首次,显示"无")
- §四 **关联文档链接**(未检出的产物显式标注)
- §五 **变更日志**(含扫描基线 commit)

**严谨性五铁律(产品说明书的生命线,违反任何一条即为缺陷):**

| # | 铁律 | 落地方式 |
|---|------|----------|
| 1 | **证据锚点** | 提取的每条路由/事件附 `文件:行号`;断言 3 校验锚点数 ≥ 条目数 |
| 2 | **未检出显式声明** | 扫不到写"未检出(Not detected)"+ 原因与建议;断言 2 校验 |
| 3 | **推断必须标注** | 目录职责/框架用途/新代码位置一律带"(推断)"标记 |
| 4 | **不画假图** | 启动流程 mermaid 只用真实检测值(入口文件存在性已校验);检不出就不画;断言 8 校验 |
| 5 | **新鲜度戳** | frontmatter `last_mapped_commit` 由脚本写入;索引给读者过期自查指引 |

另:产出后**密钥扫描**(sk-/ghp_/AKIA/私钥头),命中即失败——文档不得包含敏感值。

**讨论清单(若用户主动触发 `/ql-scan` 时):**

| 主题 | 关键问题 |
|------|----------|
| 扫描范围 | 全项目?还是 src/、app/、lib/?(超大项目建议收窄) |
| 现有章节处理 | 已有同 slug 章节时:覆盖(--force)/中止? |
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
保留所有工作流门控(目录扫描、证据锚点提取、文档树渲染、索引合并、10 条断言、密钥扫描)。
</process>
