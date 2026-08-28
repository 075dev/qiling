# 器灵 Zcode 工作流插件(讨论驱动 · 骨架先行 · 波次并行)

> 基于 GSD 阶段循环理念,精简为**三步循环**,面向 Zcode (Z.ai) 设计。
> **品牌**:器灵(`qiling`,`ql-*` 命令前缀)
> **核心**:讨论出 API 和事件流程 → AI **波次并行**构建 Walking Skeleton → 填充真实逻辑 → 自动验证 → 交付。

---

## 核心理念

### 三步循环(替代 GSD 的五步)

```text
讨论 → 构建(波次并行) → 交付
       ↓
   (Walking Skeleton:先打通最小流程,再填充)
```

每步防范一类失败:

| 步骤 | 产出 | 防范的失败 |
|-----|------|----------|
| **讨论** | OpenAPI 3.1 契约 + Mermaid 事件流程图 | 在错误假设上开发 |
| **构建** | Walking Skeleton(并行)+ 填充(并行)+ 自动验证 | 串行太慢、流程未跑通就开始堆功能 |
| **交付** | PR、归档、循环复位 | 完成的工作未沉淀 |

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
| **Git Worktree 隔离** | 每个 worker 独立 worktree,完成后 merge |
| **原子提交** | 每个端点一个 commit,合并时按拓扑顺序 |
| **协调器精简** | 协调器只负责派发、合并、验证,~15% 上下文 |
| **Worker 全新上下文** | 每个 worker 200k token 上下文,只读必要输入 |

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
/ql-discuss       # 讨论:对话产出 OpenAPI + Mermaid 流程图
/ql-build         # 构建:AI 波次并行生成 Walking Skeleton 并填充
/ql-ship          # 交付:提交 PR,归档,推进下一阶段
```

---

## 目录结构

```
zcode-gsd-workflow/(器灵 qiling)
├── commands/                  # 3 个核心命令入口
│   ├── ql-discuss.md        # 讨论
│   ├── ql-build.md          # 构建(并行)
│   └── ql-ship.md           # 交付
├── skills/                    # 嵌套式 SKILL.md
│   ├── ql-discuss/SKILL.md
│   ├── ql-build/SKILL.md
│   └── ql-ship/SKILL.md
├── workflows/                 # 4 个工作流实现
│   ├── discuss.md
│   ├── build-skeleton.md      # 波次并行骨架
│   ├── build-fill.md          # 波次并行填充
│   └── ship.md
├── agents/                    # 3 个子智能体
│   ├── ql-discuss-coach.md  # 讨论引导
│   ├── ql-builder-coordinator.md  # 协调器(分析依赖、划分波次、派发、合并)
│   └── ql-builder-worker.md       # Worker(单端点/事件的全新上下文执行)
├── templates/                 # 8 个工件模板
│   ├── openapi-spec.yaml
│   ├── event-flow.md
│   ├── state.md
│   ├── skeleton-plan.md
│   ├── build-report.md
│   ├── wave-report.md         # 波次报告(每个 worker 一份)
│   ├── verification.md
│   └── config.json
├── capabilities/zcode/
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
| 核心循环 | 5 步 | **3 步** |
| 命令 | 70+ | **3** |
| 子智能体 | 35+ | **3**(coach + coordinator + worker) |
| 工作流 | 110+ | **4** |
| 适配运行时 | 17+ | **1**(Zcode) |
| 讨论产出 | 模糊决策记录 | **OpenAPI + Mermaid** |
| 构建方法 | 串行+波次并行 | **全自动波次并行 + Worktree 隔离** |
| 上下文腐化防御 | 全新上下文子智能体 | **保留:每个 worker 全新 200k 上下文** |

---

## 详细文档

- [架构说明](docs/ARCHITECTURE.md)
- [Walking Skeleton 方法论](docs/WALKING-SKELETON.md)
- [并行策略详细文档](docs/PARALLELIZATION.md)

---

## 许可证

MIT