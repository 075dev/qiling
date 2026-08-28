---
name: ql-build
description: "AI 波次并行构建——基于 OpenAPI + 流程图,自动派生依赖、划分波次、并行派发 worker 实现 Walking Skeleton 并填充"
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
---

<runtime_note>
**Zcode:** 
- `Agent(subagent_type="ql-builder-coordinator", ...)` 派发协调器
- 协调器内并行派发 `Agent(subagent_type="ql-builder-worker", ...)` 派发 worker
- 同波次的 Agent 调用必须**在单次消息中并行发起**,不要串行 await
</runtime_note>

<objective>
**AI 波次并行构建** —— 三阶段全自动:

### 阶段 1: Walking Skeleton(并行骨架)

派发协调器:
- 推导依赖图(每个端点 + 每个事件 = 一个任务)
- 拓扑排序划分波次
- 每个波次:
  - 为每个任务创建 git worktree
  - 并行派发 worker(全新上下文)
  - 合并 worker 分支
  - 验证连通性

**骨架 worker 任务:**
- API 端点:返回 mock 数据
- 事件:消息能传递
- 不写任何业务逻辑

### 阶段 2: 填充真实逻辑(并行)

派发协调器:
- 同样的依赖图、波次划分
- worker 在骨架上增量修改,替换 mock 为真实实现
- 添加错误处理、测试

### 阶段 3: 自动验证

派发协调器:
- 对照 OpenAPI 契约验证
- 对照流程图验证
- 跑测试、lint、构建

**并发控制:** 从 `config.json` 读取 `max_concurrent`(默认 5)。

**关键原则:**
- 同波次 worker 在独立 git worktree 中,无冲突
- 每个 worker 全新 200k 上下文,只读必要输入
- 协调器保持精简(~15% 上下文),只做依赖分析与派发
- 失败立即报告,不重试

**产出:**
- 实际代码
- `.planning/build/skeleton-report.md`
- `.planning/build/fill-report.md`
- `.planning/build/verification.md`
- `.planning/build/waves/<wave-id>-<task>.md`

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