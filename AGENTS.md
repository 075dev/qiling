# AGENTS.md

> 本文件是 AI 编码代理的全局说明([agents.md](https://agents.md) 标准),宿主每轮会话自动读取。
> 下方"器灵工作流管控"块由器灵插件自动维护;其余部分是你的手写区
> (项目概述、构建命令、代码风格、注意事项……),器灵不会改动。

## 项目概述(手写区)

器灵(QiLing)是面向 ZCode 的**讨论驱动开发插件**:三步循环(ql-design 定方案 → ql-build 写代码 → ql-deliver 交付)+ 三条旁路(ql-fix 修 Bug、ql-add 加功能、ql-replace 替换功能)+ 维护面(ql-scan/ql-doc/ql-update/ql-next/ql-init)。本仓库是插件自身源码,自己也跑器灵工作流(dogfooding)。

- **技术栈:** Node ≥ 20、纯 ESM、**零 npm 运行时依赖**(只用 node: 内置模块;UI 面板仅 vendored mermaid)
- **非默认约定:** 全部产出用中文(宪法 C6);改行为先改契约(契约先行);决策 append-only(D2);发版五处版本同步 + `npm run validate` 断言兜底(C7)
- **构建/自检:** 见下方管理块的"项目命令";发版前全套:`validate / verify:flow / verify:schema / chapter:render / migrate:test / docsmap / agents:test`

<!-- ql:managed:start -->

## 器灵工作流管控(QiLing Workflow v0.25.0)

> 本块由器灵从项目工件自动渲染(`<!-- ql:managed:start/end -->` 之间),请勿手改;
> 更新方式:重跑 `/ql-init` 或 `node <插件>/scripts/agents.mjs`。块外是你的手写区,器灵永不修改。
> 本块与 `.qiling/planning/context/` 下的工件冲突时,以工件为准。

### 按场景选命令(先路由,再动手)

| 场景 | 命令 | 纪律要点 |
|------|------|----------|
| 全新设计 / 新阶段 | `/ql-design` | 讨论产出契约 + 流程图后才许写码 |
| 按契约批量实现 | `/ql-build` | 波次并行,骨架先行,验证全绿才过 |
| 交付收尾 | `/ql-deliver` | 双门:验证通过 + 独立评审 approved |
| 报 Bug / 异常 / 测试失败 | `/ql-fix` | 先复现,根因未出禁止改代码 |
| 加新功能(纯追加) | `/ql-add` | 契约先行 → 增量构建 → 章节同步 |
| 替换 / 改造既有功能 | `/ql-replace` | 旧端点必须过契约处置(deprecated / 移除) |
| 接手项目 / 生成或刷新文档树 | `/ql-scan` | 从代码反推章节文档,格式与 ql-doc 一致 |
| 交付后更新章节留档 | `/ql-doc` | 按契约 + 构建报告产出功能章节 |
| 升级器灵插件后 | `/ql-update` | 工件迁移(自动备份,幂等) |
| AGENTS.md 管控块过期 / 漂移 | `/ql-init` | 重渲染管理块,手写区永不触碰 |
| 不确定下一步 | `/ql-next` | 只读零副作用,从磁盘推导位置 |

### 铁律速览(摘自项目宪法 constitution.md)

- C1 非 HTTP 契约纪律(MUST)
- C2 决策账本 append-only(MUST)
- C3 交付双门(MUST)
- C4 派发铁律(MUST)
- C5 验证完整性(MUST)
- C6 中文产出(MUST)
- C7 发版五处同步(SHOULD)
- C8 契约与决策永不触碰(MUST)
- C9 存量与兼容垫片不误伤(SHOULD)

### 契约与决策(改行为前必读)

- 契约:`.qiling/planning/context/openapi.yaml` v0.19.0(30 端点)——改端点先改契约
- 决策账本:`.qiling/planning/context/decisions.md`(append-only;推翻旧决策须走"取代 D-N"流程)

### 当前位置(快照,提取自 STATE.md)

- 状态:shipped · 阶段:1 · 最近活动:add-003 shipped(仅推送,用户确认;PR 不适用本仓直进 main 纪律;39c62c2..HEAD 推送 origin/main,hash 见 git log——STATE 被 AGENTS.md 管理块引用,不写自身提交号)
- 文档树:`.qiling/docs/`(14 章 / 5 篇)——ZCode 中说"打开文档面板"即可视化阅读
- 位置推导:`/ql-next`(只读零副作用)

### 项目命令(package.json scripts)

`npm run validate`、`npm run rename`、`npm run verify:flow`、`npm run chapter:render`、`npm run docsmap`、`npm run migrate`、`npm run migrate:test`、`npm run verify:schema`、`npm run build:ui`、`npm run verify:ui`、`npm run agents`、`npm run agents:test`

<!-- ql:managed:end -->
