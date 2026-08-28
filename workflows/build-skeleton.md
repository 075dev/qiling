<!-- ql:loop-host
step: build-skeleton
points: build:skeleton:pre, build:skeleton:post
agent-roles: ql-builder-coordinator, ql-builder-worker
produces: skeleton code, skeleton-report.md, 波次报告
consumes: openapi.yaml, event-flow.md
-->

<purpose>
**Walking Skeleton 骨架构建 —— 波次并行执行**

协调器分析 OpenAPI 契约推导依赖 → 划分波次 → 并行派发 worker(每个端点/事件一个,Git Worktree 隔离)→ 合并 → 验证连通性。
</purpose>

<available_agent_types>
- **ql-builder-coordinator** —— 协调器,保持精简,只做依赖分析与派发
- **ql-builder-worker** —— Worker,负责单个端点/事件的实现,全新 200k 上下文
</available_agent_types>

<runtime_compatibility>
**子智能体派发:**
- **Zcode:** 用 `Agent(subagent_type="ql-builder-coordinator", ...)` 派发协调器
- 协调器内用 `Agent(subagent_type="ql-builder-worker", ...)` 并行派发多个 worker

**并行派发:** 同波次的所有 Agent 调用必须**并行执行**(在单次消息中发起),不要串行 await。
</runtime_compatibility>

<process>

## 步骤 1: 派发协调器

派发 `ql-builder-coordinator` 子智能体(全新上下文),提供:

```
你的任务:协调骨架阶段(波次并行)

输入:
- .planning/context/openapi.yaml —— API 契约
- .planning/context/event-flow.md —— 流程图
- .planning/config.json —— 工作流配置

阶段:skeleton(每个端点返回 mock,事件能传递)

你的产出:
1. Walking Skeleton 代码
2. .planning/build/skeleton-report.md

工作方式:
1. 推导任务列表:每个 OpenAPI 端点 + 每个事件 = 一个任务
2. 推导依赖:从 schema 引用、路径前缀、事件订阅推导
3. 划分波次:Kahn 拓扑排序
4. 对每个波次:
   a. 为每个任务创建 git worktree 与分支
   b. 并行派发 ql-builder-worker
   c. 合并 worker 分支到当前分支
   d. 验证连通性(curl 所有端点 + 触发事件)
   e. 失败则暂停并报告
5. 写 skeleton-report.md

返回:整体状态、波次统计、关键指标、任何阻塞。
```

## 步骤 2: 验证骨架报告

主会话读 `.planning/build/skeleton-report.md`:

- [ ] 所有 OpenAPI 端点都已实现(返回 mock)?
- [ ] 所有事件都已连接?
- [ ] 所有波次验证通过?
- [ ] 没有写业务逻辑(检查提交 diff)?
- [ ] 工作目录已清理(worktree 已删除)?

## 步骤 3: 更新 STATE

```yaml
---
status: skeleton_complete
skeleton_endpoints: N
skeleton_events: M
waves_executed: K
last_activity: skeleton built (parallel)
---
```

## 步骤 4: 提示下一步

呈现:
- 总端点数与事件数
- 波次划分(几波次、每波次几个任务)
- 总耗时(协调 + 并行执行)
- 跑通证据
- 下一步:`/ql-build`(将自动进入填充阶段)

</process>