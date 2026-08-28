---
name: ql:build
description: AI 波次并行构建——基于 OpenAPI + 流程图,自动派生依赖、划分波次、并行派发 worker 生成 Walking Skeleton 并填充
argument-hint: "[--skeleton-only | --fill-only]"
effort: max
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
  - Grep
  - Agent
  - TodoWrite
requires: [ql-ship]
---

<objective>
**AI 波次并行构建**——基于 `/ql-discuss` 的产出,协调器自动:

1. 推导依赖图,每个 OpenAPI 端点/事件 = 一个独立任务
2. Kahn 拓扑排序划分波次
3. 每个波次内并行派发 worker(Git Worktree 隔离,全新 200k 上下文)
4. 合并 worker 分支,运行端到端验证
5. 进入下一波次

**两阶段执行:**

### 阶段 1: Walking Skeleton(并行骨架)

每个 worker 实现一个端点(返回 mock)或一个事件(能传递)。**目标:** 端到端跑通流程。**严格禁止:** 写任何业务逻辑。

### 阶段 2: 填充真实逻辑(并行)

每个 worker 在骨架基础上替换 mock 为真实实现。**目标:** OpenAPI 契约 100% 满足。

### 阶段 3: 自动验证

对照 OpenAPI 契约 + 流程图检查,跑测试与构建。

**默认行为:** 阶段 1 → 阶段 2 → 阶段 3 全自动。

**标志:**
- `--skeleton-only` —— 仅执行阶段 1
- `--fill-only` —— 仅执行阶段 2(假设骨架已存在)

**并发控制:**
- 默认从 `config.json` 读取 `max_concurrent`(默认 5)
- 同波次任务数 > max_concurrent 时自动分裂

**产出:**
- 实际代码
- `.planning/build/skeleton-report.md`
- `.planning/build/fill-report.md`
- `.planning/build/verification.md`
- `.planning/build/waves/<wave-id>-<task>.md`(每个 worker 一份)

**下一步:** `/ql-ship`
</objective>

<execution_context>
@../workflows/build-skeleton.md
@../workflows/build-fill.md
@../docs/PARALLELIZATION.md
</execution_context>

<process>
端到端执行。
保留所有工作流门控(波次并行、骨架先行、填充、验证)。
</process>