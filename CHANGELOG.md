# 器灵工作流 CHANGELOG

所有对插件的显著变更都记录在此文件。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)。
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [0.5.3] - 2026-08-31

### 修复:Zcode 插件市场 manifest 缺失

**问题:** `zcode plugin install 075dev/qiling` 报错 `Marketplace manifest not found in git repo`。

**根因:** Zcode 加载 git 仓库作为插件源时,要求仓库**根目录**有 `marketplace.json`(参照 claude-plugins-official 与 zcode-plugins-official 的官方格式)。本仓库之前只有 `.zcode-plugin/{plugin,capability}.json`,缺少根级 `marketplace.json`。

### 新增

- `marketplace.json`(仓库根)—— Zcode 插件市场 manifest:
  - `name`: `qiling-marketplace`
  - `owner`: 指向 075dev
  - `plugins[]`: 1 个 plugin(`qiling`,`source: "./"`)
- `.zcode-plugin/marketplace.json`(镜像副本,部分运行时可能从隐藏目录读取)

### 改进

- `scripts/validate.mjs` 同步:新增 `marketplace.json` 存在性 + 必填字段校验(name/plugins[0].name/source)
- `package.json` / `.zcode-plugin/plugin.json` / `.zcode-plugin/capability.json` 版本号 0.5.2 → 0.5.3

### marketplace.json 关键字段

```json
{
  "name": "qiling-marketplace",
  "owner": { "name": "ZcodePlugin", "url": "..." },
  "plugins": [
    {
      "name": "qiling",
      "source": "./",   // 本地路径模式(自托管仓库)
      "version": "0.5.3",
      "category": "workflow",
      ...
    }
  ]
}
```

### 安装(修复后)

```bash
zcode plugin install 075dev/qiling
# Zcode 读取 marketplace.json → plugins[0].source = "./" → 加载整个仓库
```

### 验证证据

| 验证 | 结果 |
|------|------|
| `npm run validate` | ✅ 0 错误 |
| `npm run verify:flow` | ✅ 20/20 |
| `npm run chapter:render` | ✅ 9/9 |
| `npm run docsmap` | ✅ 9/9 |
| `npm run verify:schema` | ✅ 通过 |

## [0.5.2] - 2026-08-31

### 重大变更:重构为纯 Zcode 插件格式

**问题:** 仓库原使用 GSD Core 的 `capabilities/zcode/{plugin,capability}.json` 嵌套格式,Zcode 插件市场**无法识别**(Zcode 期望 `.zcode-plugin/plugin.json` 作为市场元数据入口)。

**修复:** 迁移至纯 Zcode 插件格式:

| 项 | 旧路径 | 新路径 |
|----|--------|--------|
| 插件清单 | `capabilities/zcode/plugin.json` | `.zcode-plugin/plugin.json` |
| 运行时配置 | `capabilities/zcode/capability.json` | `.zcode-plugin/capability.json` |
| npm main | `capabilities/zcode/plugin.json` | `.zcode-plugin/plugin.json` |
| engines | `gsd:>=0.4.0` | `ql:>=0.5.0` |

### 新增

- `.zcode-plugin/plugin.json` —— Zcode 插件市场元数据(name, version, author, license, keywords, skills, commands, agents, workflows, templates, category=workflow)
- `.zcode-plugin/capability.json` —— 运行时适配配置(id=zcode, role=runtime, artifactLayout 等)

### 改进

- `scripts/validate.mjs` 同步:`capabilities/zcode/*` → `.zcode-plugin/*`
- `package.json` main 字段同步
- `README.md` 顶部新增"安装"段(3 种安装方式 + 5 个命令清单)
- `docs/ARCHITECTURE.md` 目录树同步
- `CHANGELOG.md` 历史项标注已迁移

### 删除

- `capabilities/zcode/plugin.json`(已迁移)
- `capabilities/zcode/capability.json`(已迁移)
- `capabilities/` 目录(整个删除)

### 安装指引

```bash
zcode plugin install 075dev/qiling
# 或
zcode plugin install https://github.com/075dev/qiling
```

### 版本号

- `package.json`:0.5.0 → 0.5.2
- `.zcode-plugin/plugin.json`:0.5.0 → 0.5.2
- `.zcode-plugin/capability.json`:0.4.0 → 0.5.2

## [0.5.0] - 2026-08-28

### 新增功能:`/ql-docsmap` 文档树生成

参考 GSD `map-codebase` 设计,但**产出与 `/ql-chapter` 完全一致格式的文档树**——根据用户决策"结构一模一样才能让工作流最顺畅"。

### 核心定位

| 命令 | 触发 | 数据来源 | 文档树角色 |
|------|------|----------|----------|
| `/ql-docsmap` | 项目初始化 / 接手项目 / 文档树刷新 | **目录扫描**(package.json scripts / 路由 / 事件) | **首章节**(init) |
| `/ql-chapter` | qql-ship 完成后 | OpenAPI + 构建/验证报告 | 后续章节 |

**两者产出布局完全相同**:`.qiling/docs/README.md` + `.qiling/docs/chapters/chapter-NN-*.md`,索引**共享一份**,增量 append。

### 新增

- `commands/ql-docsmap.md` —— 文档树生成命令(支持 `--path`、`--refresh`、`--merge`)
- `skills/ql-docsmap/SKILL.md` —— 文档树技能定义
- `workflows/docsmap.md` —— 文档树工作流(与 chapter 工作流平行)
- `scripts/docsmap.mjs` —— 真实渲染器(端到端,9/9 断言通过)

### 与 GSD map-codebase 的差异

| 维度 | GSD map-codebase | ql-docsmap |
|------|-----------------|------------|
| 产出 | 7 份独立分析报告(STACK/ARCHITECTURE/CONCERNS 等) | 1 章节文档(5 节结构)+ 索引更新 |
| 索引 | 各自独立 | 与 ql-chapter 共享 `.qiling/docs/README.md` |
| 增量 | 整批重建 | 章节 ID 自动从现有最大值 + 1,append |
| 与开发流关系 | 独立产出 | 与 ql-chapter 共用同一文档树 |

### docsmap 提取项(从代码扫描)

- `package.json` 的 scripts(命令清单)
- 路由:`*.routes.*` / `*.router.*` 中的 `app.get/post/put/delete(...)`
- 事件:`*.event.*` / `*.emitter.*` 中的 `emit('user.created')` 等
- 目录树(深度 4,忽略 node_modules / dist / build / .git / .qiling / .planning)

### 7 项端到端断言

| # | 断言 | 结果 |
|---|------|------|
| 1 | 章节文件 ≥ 1 KB | ✅ 3706 字节 |
| 2 | 端点/能力表 ≥ 1 行 | ✅ 1 行 |
| 3 | 目录树图含真实路径 | ✅ |
| 4 | 索引含 chapter 链接 | ✅ |
| 5 | 5 节结构完整(与 ql-chapter 一致) | ✅ |
| 6 | 无未替换占位符 | ✅ |
| 7 | 与 templates/chapter.md 结构对齐 | ✅ 3 关键节标题一致 |

### 改进

- `scripts/validate.mjs` 同步:`expectedCommands` 增加 `ql-docsmap`、`requiredWorkflows` 增加 `docsmap.md`、新增 `scripts/docsmap.mjs` 存在性校验
- `package.json` 新增 npm script `docsmap`、版本号 0.4.1 → 0.5.0

### 验证证据

| 验证 | 结果 |
|------|------|
| `npm run validate` | ✅ 0 错误 1 警告,5 commands / 6 workflows / 11 templates |
| `npm run verify:flow` | ✅ 20/20 |
| `npm run chapter:render` | ✅ 9/9 |
| `npm run docsmap` | ✅ **9/9** |
| `npm run verify:schema` | ✅ 通过 |

## [0.4.1] - 2026-08-28

### 新增:端到端章节渲染验证

`0.4.0` 引入了章节留档模板与工作流,但仅由模板字段名检查覆盖,缺乏"OpenAPI → 章节"的真实渲染证据。本版本补上端到端渲染管线与 7 项断言,使"详细 API"与"详细开发流程"两项能力要求可证。

### 新增

- `scripts/chapter-render.mjs` —— 真实章节渲染器:
  - 读取 `templates/openapi-spec.yaml`(真实 OpenAPI)解析 paths / schemas / 错误响应
  - 模拟 `.planning/build/{skeleton,fill,verification}-report.md` 与 `STATE.md`、`git-log.txt`
  - 产出 `.tmp/chapter-render/chapter-01-demo.md`(271 行/6.2 KB)与 `.tmp/chapter-render/README.md`(31 行)
  - 自动生成 curl / TypeScript / Python 使用示例(从真实 OpenAPI 路径)
  - 端点表、数据模型、错误码表、流程留档均从真实数据填充

### 7 项断言

| # | 断言 | 真实结果 |
|---|------|----------|
| 1 | 端点表行数 ≥ 1 | 5 行(2 个 GET /resources 路径 + 3 个 /resources/{id} 方法) |
| 2 | curl 示例非占位 | 5 条全部含真实路径(`/resources`、`/resources/{id}`)|
| 3 | 数据模型 ≥ 1 | 8 个 schema(Resource / ResourceCreate / ResourceUpdate / Error / 4 错误响应) |
| 4 | 错误码 ≥ 1 | 4 个错误响应(BadRequest / NotFound / Conflict / InternalError) |
| 5 | 流程留档含真实波次 | 波次数 = 1(从 skeleton-report 提取) |
| 6 | 索引含章节链接 | `./chapter-01-demo.md` 链接存在 |
| 7 | 无未替换占位符 | `[N]` / `[M]` / `[K]` / `[hash]` 等 0 处 |

### npm scripts 接入

- `npm run chapter:render` —— 端到端章节渲染
- `npm run verify:flow` —— 三步循环模拟
- `npm run verify:schema` —— config.json schema 校验

### 改进

- `scripts/validate.mjs` 同步:新增 `scripts/{chapter-render,flow-verify,jsonschema-check}.mjs` 存在性校验 + `docs/CHAPTER-ARCHITECTURE.md` 存在性校验
- `package.json` 同步:版本号 0.4.0 → 0.4.1,新增 4 个 npm scripts

### 验证证据

| 验证 | 结果 |
|------|------|
| `npm run validate` | ✅ 0 错误 1 警告(三步循环语义提示) |
| `npm run verify:flow` | ✅ 20/20 通过 |
| `npm run chapter:render` | ✅ **9/9 通过**(端到端) |
| `npm run verify:schema` | ✅ 通过 |

### 版本号

- `package.json`:0.4.0 → 0.4.1

## [0.4.0] - 2026-08-28

### 新增功能:章节留档(`/ql-chapter`)

**核心思想:** 不以任务留档,而以章节留档。一个 ql 循环(讨论→构建→交付)= 一个章节。章节文档既是项目开发流程留档,也是该阶段 API 的开发者文档。

### 新增

- `commands/ql-chapter.md` —— 章节生成命令(支持 `--preview`、`--regenerate-all`)
- `workflows/chapter.md` —— 章节生成工作流实现
- `skills/ql-chapter/SKILL.md` —— 章节技能定义
- `templates/chapter.md` —— 章节文件模板(含 5 节结构)
- `templates/chapter-index.md` —— `.qiling/docs/README.md` 索引模板
- `docs/CHAPTER-ARCHITECTURE.md` —— 章节留档架构说明
- 章节生成跳接:`workflows/ship.md` 末尾追加"步骤 2.5 生成章节留档",自动调用 `/ql-chapter`

### 章节产出布局

```
.qiling/                                    # 章节留档根目录
├── README.md                               # 章节索引(门户型文档)
└── docs/
    └── chapters/
        ├── chapter-01-user-center.md       # 第 1 章
        ├── chapter-02-order-center.md      # 第 2 章
        └── chapter-NN-*.md                 # ...更多
```

### 章节文件结构

- §一 **API 详细文档**(端点 + schema + 错误码 + 使用示例:curl/TS/Python)
- §二 **开发流程留档**(阶段时序图 + build 报告摘要 + git 历史)
- §三 **与上一章节对比**(新增/修改/删除的 API + 迁移指南)
- §四 **关联文档链接**
- §五 **变更日志**

### 触发时机

- 默认:`/ql-ship` 完成后自动调用 `/ql-chapter`
- 手动:`/ql-chapter` 独立触发
- 模板变更后:`/ql-chapter --regenerate-all` 批量重生

### 改进

- `scripts/validate.mjs` 同步:`expectedCommands` 增加 `ql-chapter`、`requiredWorkflows` 增加 `chapter.md`、`requiredTemplates` 增加 `chapter.md` 与 `chapter-index.md`
- `scripts/flow-verify.mjs` 扩展:新增 8 项章节生成门控(章节 ID、§一/§二结构、索引链接等),从 12/12 提升至 **20/20**

### 版本号

- `package.json`:0.3.0 → 0.4.0
- `capabilities/zcode/plugin.json`(已迁移至 `.zcode-plugin/plugin.json`):0.3.0 → 0.4.0
- `capabilities/zcode/capability.json`(已迁移至 `.zcode-plugin/capability.json`):0.3.0 → 0.4.0,engines.gsd:>=0.3.0 → >=0.4.0

## [0.3.0] - 2026-08-28

### 重大变更
- **品牌重命名:** 插件从 `zcode-gsd-workflow` 改名为 **器灵**(英文 `qiling`)
- **命令前缀:** `zgsd-*` → `ql-*`(如 `/ql-discuss`、`/ql-build`、`/ql-ship`)
- **子智能体前缀:** `zgsd-discuss-coach` → `ql-discuss-coach` 等
- **worktree 路径:** `.git/zgsd/worktrees` → `.git/ql/worktrees`

### 修复(来自 P1 缺口)
- **P1-1 修复:** `capability.json` 中 `localConfigDir` 改为 `.planning`、与全局 `.zcode` 区分;`artifactLayout.local` 不再与 `global` 重复,改为本地模板/状态专用布局
- **P1-2/3 修复:** 子智能体文件名统一为连字符 `ql-*`,消除原 `_`/`-` 混用
- **P1-4 修复:** `capability.json` 引用的两个 converter 已补实现:
  - `scripts/convertClaudeCommandToClaudeSkill.mjs`
  - `scripts/convertClaudeAgentToZcodeAgent.mjs`
- **P1-5 修复:** `commands/ql-discuss.md` 的 `requires` 改为 `[ql-ship]`(循环声明,移除反向依赖)
- **P2-7 修复:** 补 `templates/config-schema.json`(Draft-07),`config.json` 的 `$schema` 引用可解析
- **P2-9 修复:** `installSurface` 改为 `declarative-full`,与完整 `artifactLayout.local` 自洽
- **P2-11 修复:** README/ARCHITECTURE 中目录树、示例统一为 `ql-*`

### 新增
- `scripts/rename.mjs` 一次性改名脚本(用于未来批次重命名)
- `scripts/convertClaudeCommandToClaudeSkill.mjs`(Claude 命令→Skill 转换器)
- `scripts/convertClaudeAgentToZcodeAgent.mjs`(Claude Agent→Zcode Agent 转换器)
- `templates/config-schema.json`(JSON Schema for config.json)
- `LICENSE`(MIT)
- `CHANGELOG.md`(本文档)
- `.gitignore`

### 改进
- `scripts/validate.mjs` 强化校验:
  - 同时识别 `ql-<kebab>` 与 `ql_<snake>` 两种命名变体
  - 校验 `parallelization.wave_timeout_minutes` / `worker_timeout_minutes` / `worker_retry_count` / `merge_strategy` 字段
  - 校验 `templates/config.json` 的 `$schema` 引用存在
  - 校验 `capability.json` 的 `converter` 引用可在 `scripts/` 下找到实现
  - 校验 `commands/zgsd-discuss.md`(现已重命名)不应依赖构建命令

## [0.2.0] - 之前

- 初次发布 `zcode-gsd-workflow` 插件骨架
- 三命令循环(讨论→构建→交付)
- 3 个子智能体(discuss-coach + builder-coordinator + builder-worker)
- 4 个工作流(discuss / build-skeleton / build-fill / ship)
- 8 个工件模板
- Walking Skeleton + 波次并行策略

---

## 命名约定(0.3.0 起固定)

- 插件名:`器灵` (英文 `qiling`,npm 包 `@qiling/zcode-workflow`)
- 命令前缀:`ql-`(如 `ql-discuss`、`ql:discuss`、`ql-builder-coordinator`)
- worktree 路径:`.git/ql/worktrees/`
- 分支命名:`ql/wave-<N>/<task-id>`
- 状态机版本键:`ql_state_version: '1.0'`

不要回退到 `zgsd-*` 前缀,以保持仓库内一致。