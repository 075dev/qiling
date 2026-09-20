---
name: ql-build
description: "AI 波次并行构建——基于 OpenAPI + 流程图,自动派生依赖、划分波次、并行派发 worker 实现 Walking Skeleton,填充,自动验证 + 独立评审"
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
- 验证通过后,主会话直接派发 `Agent(subagent_type="ql-reviewer", ...)` 独立评审
- 同波次的 Agent 调用必须**在单次消息中并行发起**,不要串行 await
</runtime_note>

<objective>
**AI 波次并行构建** —— 三阶段全自动:

### 阶段 0: 派发决策门(先决定"要不要走编排")

**派发的理由是上下文隔离与并行加速,不是"流程规定要派"。** 子代理冷启动 = 主对话读过的契约与规范全部重读(缓存不命中)+ 摘要有损回流,这个开销只有在买到别的东西时才值得。派发前三问:

1. **产物体积** —— 这步会产生大量中间细节(demo diff、几百行代码、长命令输出)吗?会 → 派发,细节隔离在子上下文,只让结论回流
2. **独立性** —— 这步需要与实现者零共享记忆吗(评审/验证)?需要 → 必须派发,独立上下文正是质量来源
3. **交互性** —— 这步需要用户输入或人工决策吗?需要 → 留在主对话

**内联阈值:** 从 `config.json` 读 `parallelization.inline_threshold`(默认 2)。端点+事件总数 ≤ 阈值时,**整个构建(骨架+填充+验证)由主会话内联执行,不派协调器**——小活编排的固定开销(派发往返+冷启动重读)超过收益。设 0 = 总是派发。

**反触发(不要走本工作流):** 单文件小修用 `/ql-fix`;单个功能追加用 `/ql-add`;"一次专注执行就能完成"的工作不搭协调机制。

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

**验证纪律(fresh evidence):**
- 每条验证命令的结果记录一行:命令 + PASS/FAIL/PRE-EXISTING
- 已知基线失败标记 `PRE-EXISTING` + 短标识,不冒充本次成果
- worker/子代理报告只算"声明",主会话在通过前**亲自复核关键命令**(至少:测试套件 + 构建),读真实输出
- 验证完成前不做任何"完成"声明

### 阶段 4: 独立评审

验证通过后,主会话**直接**派发 `ql-reviewer`(全新上下文,不经协调器):
- 输入:OpenAPI + 流程图(验收标准)、决策轨迹 decisions.md(若存在,设计意图参照)、base..head diff、验证摘要(不含实现者叙事)
- 三结论:契约合规 / 正确性(含 AI 代码套路 S1-S8 扫描) / 代码库一致性
- `criticals_found` → 定向修复 → 只重跑受影响验证 → 复审(最多 2 轮)
- 两轮不收敛 → 停止,报告僵局,交用户决定,不强行通过

**串行铁律:** 验证与评审严格串行——所有验证命令退出后才派发评审,评审期间不并行跑重型测试。

**并发控制:** 从 `config.json` 读取 `max_concurrent`(默认 5)。

**关键原则:**
- 同波次 worker 在独立 git worktree 中,无冲突
- 每个 worker 全新 200k 上下文,只读必要输入
- 协调器保持精简(~15% 上下文),只做依赖分析与派发
- 失败立即报告,不重试
- **小活内联,重活派发**——阶段 0 派发决策门是流程第一闸,先过门再编排

**产出:**
- 实际代码
- `.planning/build/skeleton-report.md`
- `.planning/build/fill-report.md`
- `.planning/build/verification.md`
- `.planning/build/review.md`
- `.planning/build/waves/<wave-id>-<task>.md`

**下一步:** `/ql-deliver`
</objective>

<execution_context>
@../../workflows/build-skeleton.md
@../../workflows/build-fill.md
@../../workflows/review.md
@../docs/PARALLELIZATION.md
</execution_context>

<process>
端到端执行。
保留所有工作流门控(波次并行、骨架先行、填充、验证、独立评审)。
</process>