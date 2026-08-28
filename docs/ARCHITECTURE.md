# Zcode 工作流插件架构(讨论驱动 · 骨架先行 · 波次并行)

> 本文档解释新设计 Zcode 工作流插件的设计理念与结构。
> 它基于对 GSD Core(1.11.0)的深入研究而设计,**精简为三步循环**,采用 **Walking Skeleton + 波次并行**。

---

## 设计理念

### 三个核心洞察

1. **AI 时代,讨论产出应该是机器可执行的规范,不是模糊决策**
   GSD 的"讨论"产出 CONTEXT.md(决策记录)对人类友好,但对 AI 不友好。
   本插件的讨论产出 **OpenAPI 3.1 契约 + Mermaid 事件流程图**——机器可执行的标准格式。

2. **AI 可以自主完成规划+执行+验证,无需拆分为多个子智能体**
   现代 AI 足够智能,但**协调器不应承担实现**——这会污染协调上下文。
   本插件拆分:**协调器(coordinator)** 负责依赖分析与派发,**worker** 负责单个端点实现。

3. **Walking Skeleton 优于一次性完整实现**
   GSD 假设一次性完整执行——但**未跑通的流程是死代码**。
   本插件强制 AI 先打通流程,验证连通后再填充真实逻辑。

4. **波次并行优于串行**
   串行处理 20+ 端点极慢,且让 AI 上下文腐化。
   本插件从 OpenAPI 自动推导依赖 → 拓扑排序 → 同波次并行(Git Worktree 隔离)。

### 三步循环

```text
讨论 → 构建(波次并行) → 交付
```

#### 讨论(`/ql-discuss`)

**输入:** 用户对话
**产出:** OpenAPI + Mermaid 流程图 + STATE 更新
**关键:**
- 引导对话,聚焦:用户旅程、核心 API、数据模型、错误模型、事件流、状态变化
- 不追求 100% 完整——主线即可
- 几分钟对话,几小时实现节省

#### 构建(`/ql-build`)—— **波次并行**

**输入:** OpenAPI + 流程图
**产出:** Walking Skeleton + 填充实现 + 验证报告
**关键:**
- 阶段 1(并行骨架):协调器派生依赖图,划分波次,并行派发 worker 实现每个端点的 mock
- 阶段 2(并行填充):协调器同样派生波次,并行派发 worker 替换 mock 为真实实现
- 阶段 3(自动验证):对照契约与流程图检查

**为什么是并行:**
- 速度:多 worker 同时工作
- 上下文质量:每个 worker 上下文保持精简
- 自动推导依赖:OpenAPI schema `$ref` + 路径前缀 + 事件订阅

#### 交付(`/ql-ship`)

**输入:** 验证通过的代码
**产出:** PR + STATE 更新
**关键:**
- 自动生成 PR(标题从 OpenAPI,正文含端点列表)
- 推进到下一阶段或标记里程碑完成

---

## 目录结构

```
qiling/(器灵 v0.3.0,目录名仍为 zcode-gsd-workflow)
├── commands/                          # 3 个核心命令入口
│   ├── ql-discuss.md
│   ├── ql-build.md                  # 波次并行
│   └── ql-ship.md
├── skills/                            # 嵌套式 SKILL.md
│   ├── ql-discuss/SKILL.md
│   ├── ql-build/SKILL.md
│   └── ql-ship/SKILL.md
├── workflows/                         # 4 个工作流实现
│   ├── discuss.md
│   ├── build-skeleton.md              # 波次并行骨架
│   ├── build-fill.md                  # 波次并行填充
│   └── ship.md
├── agents/                            # 3 个子智能体
│   ├── ql-discuss-coach.md          # 讨论引导
│   ├── ql-builder-coordinator.md    # 协调器:依赖分析、波次划分、派发、合并
│   └── ql-builder-worker.md         # Worker:单端点/事件,全新上下文,Git Worktree
├── templates/                         # 8 个工件模板
│   ├── openapi-spec.yaml
│   ├── event-flow.md
│   ├── state.md
│   ├── skeleton-plan.md
│   ├── build-report.md
│   ├── wave-report.md                 # 波次报告(协调器-worker 契约)
│   ├── verification.md
│   └── config.json
├── capabilities/zcode/                # Zcode 适配
├── docs/
│   ├── ARCHITECTURE.md                # 本文档
│   ├── WALKING-SKELETON.md            # Walking Skeleton 方法论
│   └── PARALLELIZATION.md             # 并行策略详细文档
├── scripts/validate.mjs
└── package.json
```

---

## 子智能体设计

### ql-discuss-coach

**角色:** 引导对话讨论
**特点:** 由协调器自身承担(无需派发)
**职责:**
- 用 AskUserQuestion 分主题提问
- 提炼 API 端点、数据模型、事件流
- 生成 OpenAPI + Mermaid

### ql-builder-coordinator

**角色:** 构建协调器
**特点:** **保持精简上下文(~15%)**,不执行实现细节
**职责:**
1. 加载 OpenAPI + 流程图
2. 推导依赖图(从 schema `$ref`、路径前缀、事件订阅)
3. Kahn 拓扑排序划分波次
4. 对每个波次:
   - 为每个任务创建 Git Worktree
   - 并行派发多个 `ql-builder-worker`
   - 合并 worker 分支
   - 验证连通性
5. 写波次报告与最终报告

### ql-builder-worker

**角色:** 单端点/事件实现
**特点:** **全新 200k token 上下文**,Git Worktree 隔离
**职责:**
- 接收协调器分配的任务
- 在自己的 worktree 中工作
- 不与其他 worker 通信
- 不修改文件边界外的文件
- 原子提交
- 产出单端点报告

---

## 并行策略详解

详见 [PARALLELIZATION.md](PARALLELIZATION.md),核心要点:

### 数据流

```
OpenAPI + Mermaid
       ↓
协调器分析依赖图(Kahn 拓扑排序)
       ↓
Wave 1:无依赖任务(并行,Git Worktree 隔离)
   ├── worker-1 (worktree-1) GET /users
   ├── worker-2 (worktree-2) GET /products
   ├── worker-3 (worktree-3) GET /events
   └── worker-N (worktree-N) ...
       ↓
合并 → 验证连通性 → 进入 Wave 2
       ↓
Wave 2:依赖 Wave 1 的任务(并行)
       ↓
... 直至所有完成
```

### 依赖推导规则

| 关系 | 推导 |
|------|------|
| Schema 引用 | A 引用 B → A 依赖 B |
| 路径前缀 | `/orders/:id` 依赖 `/orders` |
| 事件订阅 | 订阅者依赖发布者 |
| 错误响应 | 所有端点依赖基础错误处理 |

### 并行配置

```json
{
  "parallelization": {
    "enabled": true,
    "max_concurrent": 5,
    "isolation": "worktree",
    "auto_merge": true,
    "fail_fast": false,
    "fallback_to_sequential": true
  }
}
```

---

## 与 GSD Core 的关键差异

| 维度 | GSD Core | 本插件 |
|-----|----------|--------|
| **核心循环** | 5 步 | **3 步** |
| **命令数量** | 70+ | **3** |
| **子智能体** | 35+ | **3**(coach + coordinator + worker) |
| **工作流** | 110+ | **4** |
| **适配运行时** | 17+ | **1**(Zcode) |
| **讨论产出** | 模糊决策记录 | **OpenAPI + Mermaid** |
| **构建方法** | 串行+波次并行 | **全自动波次并行 + Worktree** |
| **依赖推导** | 手工 PLAN + 复杂分析 | **自动从 OpenAPI 推导** |
| **派发粒度** | PLAN(预定义) | **端点/事件(自动)** |

---

## 详细文档

- [Walking Skeleton 方法论](WALKING-SKELETON.md)
- [并行策略详细文档](PARALLELIZATION.md)

---

## 参考资料

- [GSD Core 仓库](https://github.com/open-gsd/gsd-core)
- [Walking Skeleton(Alistair Cockburn)](https://alistair.cockburn.us/walking-skeleton/)
- [OpenAPI 3.1 规范](https://spec.openapis.org/oas/v3.1.0)
- [Mermaid 文档](https://mermaid.js.org/)
- [Git Worktree 文档](https://git-scm.com/docs/git-worktree)