---
name: ql:docsmap
description: 文档树生成——通过阅读项目结构,产出与章节留档完全一致格式的文档树(.qiling/docs/),用于项目初始化或文档树刷新
argument-hint: "[--path <dir>] [--refresh] [--merge]"
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
  - Grep
  - AskUserQuestion
requires: []
---

<objective>
通过阅读现有项目,**长出文档树**——与 `/ql-chapter` 的章节留档**完全一致的格式与产出位置**:

- **章节文件**:`.qiling/docs/chapters/chapter-NN-*.md`(5 节结构,与 ql-chapter 完全相同)
- **索引文件**:`.qiling/docs/README.md`(与章节共享同一索引,自动合并)

**与 `ql-chapter` 的关键差异:**

| 命令 | 触发 | 数据来源 | 章节 ID 来源 |
|------|------|----------|--------------|
| `/ql-chapter` | ql-ship 成功后 | OpenAPI + 构建/验证报告 | STATE.md `current_phase` |
| `/ql-docsmap` | 项目初始化 / 接手项目 / 文档树刷新 | **目录扫描**(agent 派发后)+ 现有 OpenAPI(若有)| 项目根目录中已有章节的最大编号 + 1 |

**为什么产出格式完全一致:**
- 用户明确决策:文档树与章节**结构一模一样**才能让工作流最顺畅
- 章节索引 = 文档树索引(同一份 `.qiling/docs/README.md`)
- 文档树节点可以作为"第 0 章"(init)或后续章节
- 进入开发阶段后,新章节直接 append,索引自动合并

**触发场景:**
1. **新接手项目** — 没有 `.qiling/`,没有 OpenAPI,从代码反推文档树
2. **初始化项目** — 已有代码但未使用器灵工作流,补建文档树作为新阶段起点
3. **文档树刷新** — 项目结构大改后,刷新章节 ID 与标题

**标志:**
- `--path <dir>` —— 指定扫描的根目录(默认当前目录)
- `--refresh` —— 覆盖现有 `.qiling/docs/` 中的章节(谨慎使用)
- `--merge` —— 与现有章节合并(默认:增量 append)

**与 GSD `map-codebase` 的差异:**
- GSD 产出 7 份**分析报告**(STACK/INTEGRATIONS/ARCHITECTURE 等)
- 器灵产出**文档树**(层级化导航,与开发流程文档同布局)
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