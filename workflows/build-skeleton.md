<!-- ql:loop-host
step: build-skeleton
points: build:skeleton:pre, build:skeleton:post
agent-roles: ql-builder-coordinator, ql-builder-worker
produces: skeleton code, skeleton-report.md, 波次报告
consumes: openapi.yaml, event-flow.md, decisions.md(若存在)
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
**子智能体派发(宿主上下文可用性矩阵):**

| 派发者上下文 | 可派发 | 说明 |
|--------------|--------|------|
| 主会话 | ql-builder-coordinator、ql-reviewer | 编排模式入口;独立评审直接从主会话派 |
| 协调器(子代理) | ql-builder-worker | **当且仅当宿主把该类型暴露给子代理上下文**——部分宿主只在主会话暴露子代理类型,子代理不继承 |
| worker / reviewer | (无) | 叶子角色,不再派发 |

- **Zcode:** 主会话用 `Agent(subagent_type="ql-builder-coordinator", ...)` 派发协调器;协调器内用 `Agent(subagent_type="ql-builder-worker", ...)` 并行派发 worker
- **派发通道门控:** 协调器启动时先探测 worker 类型是否真实可用;不可用立即返回 `DISPATCH_CHANNEL_UNAVAILABLE` 并停止(见 agents/ql-builder-coordinator.md 步骤 0)。主会话收到该信号 → 改内联模式或换宿主,**绝不默许协调器降级到外部 CLI/子进程**(`--yolo` 类无人值守通道尤其禁止)
- **并行派发:** 同波次的所有 Agent 调用必须**并行执行**(在单次消息中发起),不要串行 await
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
- [ ] **实现基线判定** —— 读 decisions.md 是否有 spec-as-is/棕地决策,并抽查契约项在存量代码中的实现情况:全部无存量实现 → `greenfield`(缺省,骨架=mock);契约项已有存量实现 → `brownfield`(骨架=对齐存量,禁止 mock 化)。判定结果写入步骤 1 的派发任务卡;棕地而无对应决策 → 提示回 `/ql-design` 补一条 spec-as-is 决策
- [ ] **上下文压力自检** —— 本会话上下文已明显很重(大量讨论历史/多轮修复)时,先把状态落盘(STATE + 本清单),提示用户开新会话跑 `/ql-build` 续做(ql-next 会从磁盘推导断点),不要在腐化上下文里启动编排

## 步骤 0.5: 派发决策门(内联 or 编排)

**派发的理由是上下文隔离与并行加速,不是流程仪式。** 子代理冷启动 = 主对话读过的契约全部重读(缓存不命中)+ 摘要有损,小活上这笔开销买不到任何东西。

```bash
TASKS=$(端点数 + 事件数)   # 从 openapi.yaml 统计
THRESHOLD=$(grep -o '"inline_threshold": *[0-9]*' .planning/config.json | grep -o '[0-9]*$' || echo 2)
```

**`TASKS <= THRESHOLD`(默认 2)→ 内联模式:** 主会话**不派协调器**,直接实现:

- 按契约逐端点/事件产出骨架(与 worker 同标准、无业务逻辑;greenfield=最小 mock,brownfield=spec-as-is 对齐存量——按步骤 0 的判定执行)
- 同样遵守工作区门控(步骤 0):特性分支 + base_sha + 原子提交(每端点一个 commit)
- 完成后**亲自** curl 每个端点 + 触发事件验证连通,按同格式写 `.planning/build/skeleton-report.md`(任务清单 + 连通性证据),再进入 `/ql-build` 填充阶段
- 内联模式的验证与后续填充同样内联(见 build-fill 步骤 2 的轻量路径)

**`TASKS > THRESHOLD` → 编排模式:** 按步骤 1 派发协调器(波次并行)。

两个模式产出的 skeleton-report.md 格式完全一致——下游(填充、评审、文档)不感知模式差异。

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
- .planning/context/decisions.md(若存在)—— 决策轨迹:提取每张任务卡**只与该任务相关的条目**注入(见协调器定义第 8 项),worker 据此理解设计意图,而非自行发明

阶段:skeleton(实现基线:[greenfield|brownfield,来自步骤 0 判定];greenfield=每个端点返回 mock、事件能传递;brownfield=spec-as-is 对齐存量实现,禁止 mock 化)

派发通道:你的 Agent 工具应包含 ql-builder-worker 子代理类型;若不可用,立即返回 DISPATCH_CHANNEL_UNAVAILABLE 并停止——禁止降级到外部 CLI/子进程派发(含 --yolo 类无人值守通道),由主会话改内联模式或换宿主

你的产出:
1. Walking Skeleton 代码
2. .planning/build/skeleton-report.md(含覆盖矩阵:每个契约端点/事件 ↔ 任务 ID)

工作方式:
1. 推导任务列表:每个 OpenAPI 端点 + 每个事件 = 一个任务
2. 推导依赖:从 schema 引用、路径前缀、事件订阅推导;再做**共享依赖面分析**——Produces 被 ≥2 个后续任务 Consumes 的共享接口,定稿前移到 Wave 1 显式产出(见协调器定义步骤 3)
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
- [ ] 没有写业务逻辑(检查提交 diff)?(brownfield 基线下改判:存量实现未被 mock 化/重写,diff 只有缺口补齐与偏差修正)
- [ ] 工作目录已清理?——**以实测为准**:协调器报告须附 `git worktree list` / `ls .git/ql/worktrees/` / `git branch --list "ql/wave-*"` 三查输出;主会话亲自复核任一项非空即未清理,退回协调器

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