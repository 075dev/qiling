# 器灵 Zcode 工作流插件(讨论驱动 · 骨架先行 · 波次并行 · 独立评审)

> 基于 GSD 阶段循环理念,精简为**三步循环**,面向 Zcode (Z.ai) 设计。
> **品牌**:器灵(`qiling`,`ql-*` 命令前缀)
> **核心**:讨论出 API 和事件流程 → AI **波次并行**构建 Walking Skeleton → 填充真实逻辑 → 自动验证 + **独立评审** → 交付。

## 安装

```bash
# 方式 1:本地安装(开发或私有使用)
zcode plugin install 075dev/qiling

# 方式 2:从 GitHub 直接安装
zcode plugin install https://github.com/075dev/qiling

# 方式 3:克隆后手动安装
git clone https://github.com/075dev/qiling
cd qiling
zcode plugin install .
```

安装后可用命令(名称直白,一眼看懂):

```bash
/ql-scan       # 扫描代码,生成文档树(项目初始化)
/ql-design     # 定方案:讨论产出 OpenAPI 契约 + Mermaid 流程图
/ql-build      # 写代码:波次并行骨架 + 填充 + 验证 + 独立评审
/ql-deliver    # 交付:推送 PR + 章节留档
/ql-doc        # 章节文档生成(独立触发)
/ql-fix        # 修 Bug:复现 → 根因 → 最小修复 → 回归测试
/ql-add        # 加功能:定位章节 → 补契约 → 增量构建 → 同步文档
/ql-next       # 下一步提示:从磁盘事实推导当前位置,推荐下一步(只读零副作用)
```

> 0.6 及更早的旧命令名(`/ql-docsmap`、`/ql-discuss`、`/ql-ship`、`/ql-chapter`)保留为别名,调用时会提示新名称。

---

## 核心理念

### 三步循环 + 两条旁路(替代 GSD 的五步)

```text
讨论(ql-design) → 构建(ql-build,波次并行) → 交付(ql-deliver)
       ↓
   (Walking Skeleton:先打通最小流程,再填充)

旁路:ql-fix(修 Bug)   —— 循环外的缺陷修复,复现优先
旁路:ql-add(加功能)   —— 往现有章节体系补功能,可指定落点或自动判断
```

每步防范一类失败:

| 步骤 | 产出 | 防范的失败 |
|-----|------|----------|
| **讨论** | OpenAPI 3.1 契约 + Mermaid 事件流程图 | 在错误假设上开发 |
| **构建** | Walking Skeleton(并行)+ 填充(并行)+ 自动验证 + 独立评审 | 串行太慢、流程未跑通就开始堆功能、**实现者自查盲区** |
| **交付** | PR、归档、循环复位 | 完成的工作未沉淀 |
| **修 Bug(旁路)** | bugfix 报告 + 回归测试 | 没复现就改、修症状不修根因、修完复发 |
| **加功能(旁路)** | 更新的契约 + 章节文档 + 增量代码 | 代码加了契约没加、功能进错章节、文档与代码脱节 |

### 三条核心原则

1. **讨论产出机器可执行** —— OpenAPI + Mermaid 是行业标准,AI 可直接消费
2. **Walking Skeleton 骨架先行** —— 先打通最小流程,再填充真实逻辑
3. **波次并行构建** —— 多个端点/事件同时进行,自动分析依赖、自动合并

---

## 并行策略(关键特性)

### 全自动波次并行

```
OpenAPI 契约
    ↓
[builder-coordinator] 分析依赖图
    ↓
划分波次(Wave 1, Wave 2, ...)
    ↓
Wave 1:无依赖的端点/事件(并行)
    ├── worker-1 (git worktree-1) 处理 GET /users
    ├── worker-2 (git worktree-2) 处理 GET /orders
    ├── worker-3 (git worktree-3) 处理 POST /events
    └── worker-N (git worktree-N) 处理 ...
    ↓
合并波次 → 运行端到端验证
    ↓
Wave 2:依赖 Wave 1 的端点(并行)
    ↓
... 直至所有完成
```

### 关键机制

| 机制 | 作用 |
|------|------|
| **依赖分析** | 从 OpenAPI schema `$ref` + 路径前缀自动推导依赖 |
| **波次划分** | Kahn 拓扑排序,同一波次内并行无冲突 |
| **Git Worktree 隔离** | 每个 worker 独立 worktree,完成后 merge;基于特性分支,绝不基于 main,禁止嵌套 |
| **原子提交** | 每个端点一个 commit,合并时按拓扑顺序 |
| **协调器精简** | 协调器只负责派发、合并、验证,~15% 上下文 |
| **Worker 全新上下文** | 每个 worker 200k token 上下文,只读必要输入 |
| **独立评审** | 验证通过后,全新上下文的 reviewer 对照规范 + diff + 验证摘要给三结论(契约合规/正确性/一致性),critical 阻断交付 |
| **Fresh evidence** | 每条验证命令记一行 PASS/FAIL/PRE-EXISTING;子代理报告只算声明,主会话亲自复核后才算通过 |
| **不自动收尾** | 交付前呈现 branch/base/head,由用户选:创建 PR / 仅推送 / 保留本地 |

### 并行粒度

- **骨架阶段:** 每个端点 + 每个事件 = 一个独立 worker
- **填充阶段:** 每个端点 + 每个事件 = 一个独立 worker(在骨架基础上增量)
- **验证阶段:** 单 worker(需要全局视图)

### 默认并行度

从 `config.json` 读取:

```json
{
  "parallelization": {
    "enabled": true,
    "max_concurrent": 5,
    "isolation": "worktree",
    "auto_merge": true
  }
}
```

`max_concurrent=5` 意味着同一波次最多同时 5 个 worker。

---

## 快速上手

```bash
/ql-next         # 不确定从哪开始?先问它(只读,推荐下一步)
/ql-design       # 定方案:对话产出 OpenAPI + Mermaid 流程图
/ql-build        # 写代码:AI 波次并行生成 Walking Skeleton、填充、验证、评审
/ql-deliver      # 交付:提交 PR,归档,推进下一阶段
/ql-fix <描述>    # 修 Bug(随时可用,循环外)
/ql-add <描述>    # 加功能(项目已初始化后,循环外)
```

---

## 目录结构

```
qiling/(器灵)
├── commands/                  # 8 个命令入口(+4 个旧名别名)
│   ├── ql-scan.md             # 扫描代码 → 文档树
│   ├── ql-design.md           # 定方案(契约 + 流程图)
│   ├── ql-build.md            # 写代码(波次并行)
│   ├── ql-deliver.md          # 交付(PR + 归档)
│   ├── ql-doc.md              # 章节文档生成
│   ├── ql-fix.md              # 修 Bug
│   ├── ql-add.md              # 加功能
│   └── ql-next.md             # 下一步提示(状态感知入口)
├── skills/                    # 嵌套式 SKILL.md(与命令同名)
│   ├── ql-scan/SKILL.md
│   ├── ql-design/SKILL.md
│   ├── ql-build/SKILL.md
│   ├── ql-deliver/SKILL.md
│   ├── ql-doc/SKILL.md
│   ├── ql-fix/SKILL.md
│   ├── ql-add/SKILL.md
│   └── ql-next/SKILL.md
├── workflows/                 # 10 个工作流实现
│   ├── scan.md                # 目录扫描 → 文档树
│   ├── design.md              # 讨论引导 → 契约
│   ├── build-skeleton.md      # 波次并行骨架
│   ├── build-fill.md          # 波次并行填充 + 自动验证
│   ├── review.md              # 独立评审(验证通过后,交付前)
│   ├── deliver.md             # 交付编排
│   ├── doc.md                 # 章节渲染
│   ├── fix.md                 # 修 Bug 指导
│   ├── add.md                 # 加功能指导(定位 → 契约 → 增量构建)
│   └── next.md                # 状态判定 → 下一步建议(决策表)
├── agents/                    # 4 个子智能体
│   ├── ql-design-coach.md         # 讨论引导
│   ├── ql-builder-coordinator.md  # 协调器(分析依赖、划分波次、派发、合并)
│   ├── ql-builder-worker.md       # Worker(单端点/事件的全新上下文执行)
│   └── ql-reviewer.md             # 独立评审者(全新上下文,三结论,只评审不修复)
├── templates/                 # 13 个工件模板
│   ├── openapi-spec.yaml
│   ├── event-flow.md
│   ├── state.md
│   ├── skeleton-plan.md
│   ├── build-report.md        # 骨架/填充报告(含旅程日志)
│   ├── wave-report.md         # 波次报告(每个 worker 一份)
│   ├── verification.md        # 验证报告(命令级证据)
│   ├── review.md              # 独立评审报告
│   ├── bugfix-report.md       # Bug 修复报告
│   ├── chapter.md / chapter-index.md
│   └── config.json / config-schema.json
├── .zcode-plugin/                # Zcode 插件市场元数据
│   ├── plugin.json              # 插件清单
│   └── capability.json          # 运行时适配
├── docs/
│   ├── ARCHITECTURE.md
│   ├── WALKING-SKELETON.md
│   └── PARALLELIZATION.md     # 并行策略详细文档
├── scripts/validate.mjs
├── scripts/rename.mjs
├── scripts/convertClaudeCommandToClaudeSkill.mjs
├── scripts/convertClaudeAgentToZcodeAgent.mjs
├── LICENSE
├── CHANGELOG.md
└── package.json
```

---

## 与 GSD Core 的差异

| 维度 | GSD Core | 本骨架 |
|-----|----------|--------|
| 核心循环 | 5 步 | **3 步 + 2 旁路 + 状态入口** |
| 命令 | 70+ | **8** |
| 子智能体 | 35+ | **4**(coach + coordinator + worker + reviewer) |
| 工作流 | 110+ | **10** |
| 适配运行时 | 17+ | **1**(Zcode) |
| 讨论产出 | 模糊决策记录 | **OpenAPI + Mermaid** |
| 构建方法 | 串行+波次并行 | **全自动波次并行 + Worktree 隔离** |
| 质量门 | 人工评审 | **契约验证 + 独立评审(全新上下文,三结论)** |
| 增量演进 | 无专门路径 | **/ql-fix(修 Bug)+ /ql-add(加功能,自动定位章节)** |
| 状态入口 | /gsd-next | **/ql-next(磁盘推导 + 决策表,只读零副作用)** |
| 上下文腐化防御 | 全新上下文子智能体 | **保留:每个 worker/reviewer 全新 200k 上下文** |

---

## 详细文档

- [架构说明](docs/ARCHITECTURE.md)
- [Walking Skeleton 方法论](docs/WALKING-SKELETON.md)
- [并行策略详细文档](docs/PARALLELIZATION.md)

---

## 许可证

MIT