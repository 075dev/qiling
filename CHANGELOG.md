# 器灵工作流 CHANGELOG

所有对插件的显著变更都记录在此文件。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)。
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

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
- `capabilities/zcode/plugin.json`:0.3.0 → 0.4.0
- `capabilities/zcode/capability.json`:0.3.0 → 0.4.0,engines.gsd:>=0.3.0 → >=0.4.0

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