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

## 步骤 0: 工作区门控 + 记录 base SHA

**绝不直接在 main/master 上构建。** 派发协调器前:

```bash
CURRENT=$(git branch --show-current)

# 已在特性分支 → 直接用
# 在 main/master 上 → 创建特性分支(命名 ql/phase-N-<slug>),不询问
# HEAD 游离或检测到 linked worktree → 用当前工作区,不再嵌套创建
git rev-parse --git-dir
git rev-parse --git-common-dir
# 两者不同 = 已在 linked worktree 中,沿用当前工作区

# 记录 base SHA(独立评审的 diff 锚点)
git rev-parse HEAD
```

将结果写入 `.planning/STATE.md`:

```yaml
---
work_branch: <branch>
base_sha: <sha>
---
```

**Worktree 隔离原则:** worker 的 worktree 基于当前特性分支(而非固定 main);若已在 linked worktree 中工作,协调器在其中继续派发,禁止嵌套 `git worktree add`。

**环境自检(任一不过先修复再继续):**

- [ ] `git worktree add` 可用(试建试删一个临时 worktree)
- [ ] `.planning/` 目录可写
- [ ] 当前分支非 main/master(或已建特性分支)
- [ ] `.planning/context/openapi.yaml` 与 `event-flow.md` 存在且 YAML 可解析
- [ ] `.planning/context/constitution.md` 状态已确认(存在则读,不存在记录"未建立")

## 步骤 1: 派发协调器

派发 `ql-builder-coordinator` 子智能体(全新上下文),提供:

```
你的任务:协调骨架阶段(波次并行)

输入:
- .planning/context/openapi.yaml —— API 契约
- .planning/context/event-flow.md —— 流程图
- .planning/config.json —— 工作流配置
- .planning/STATE.md 中的 work_branch —— worker worktree 基于该分支(绝不基于 main/master)
- .planning/context/constitution.md(若存在)—— 项目宪法,划分波次与声明 Files 边界前先过一遍:MUST 红线不得安排违反宪法的任务;SHOULD 违规在阶段报告豁免表登记

阶段:skeleton(每个端点返回 mock,事件能传递)

你的产出:
1. Walking Skeleton 代码
2. .planning/build/skeleton-report.md(含覆盖矩阵:每个契约端点/事件 ↔ 任务 ID)

工作方式:
1. 推导任务列表:每个 OpenAPI 端点 + 每个事件 = 一个任务
2. 推导依赖:从 schema 引用、路径前缀、事件订阅推导
3. **产出覆盖矩阵**:契约声明的端点/事件零任务覆盖 = CRITICAL,补齐任务后才可派发
4. 划分波次:Kahn 拓扑排序
5. 对每个波次:
   a. 为每个任务创建 git worktree 与分支
   b. 并行派发 ql-builder-worker(任务卡含 Files 边界 + Interfaces + 上一波次备注)
   c. 合并 worker 分支到当前分支,追加 progress.md 台账
   d. 验证连通性(curl 所有端点 + 触发事件)
   e. 失败则暂停并报告
6. 写 skeleton-report.md

返回:整体状态、覆盖矩阵、波次统计、关键指标、任何阻塞。
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