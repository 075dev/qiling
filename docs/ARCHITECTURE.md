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

5. **实现者自查有盲区,验证不能替代评审**
   验证只能证明"实现符合契约",查不出"契约本身写错、测试复制生产逻辑、边界想错"。
   本插件在验证通过后派发**全新上下文的独立评审者**(ql-reviewer):只看规范 + diff + 验证摘要,
   不带实现者叙事,给出契约合规 / 正确性 / 代码库一致性三个独立结论;critical 阻断交付。

### 三步循环 + 两条旁路 + 状态入口

```text
讨论(ql-design) → 构建(ql-build,波次并行) → 交付(ql-deliver)

旁路:ql-fix —— 修 Bug(复现 → 根因 → 最小修复 → 回归),循环外
旁路:ql-add —— 加功能(定位章节 → 补契约 → 增量构建 → 同步文档),循环外
入口:ql-next —— 不确定做什么时,从磁盘事实推导当前位置并推荐下一步(只读零副作用)
```

#### 讨论(`/ql-design`)

**输入:** 用户对话
**产出:** OpenAPI + Mermaid 流程图 + STATE 更新
**关键:**
- 引导对话,聚焦:用户旅程、核心 API、数据模型、错误模型、事件流、状态变化
- 不追求 100% 完整——主线即可
- 几分钟对话,几小时实现节省

#### 构建(`/ql-build`)—— **波次并行**

**输入:** OpenAPI + 流程图
**产出:** Walking Skeleton + 填充实现 + 验证报告 + 评审报告
**关键:**
- 阶段 1(并行骨架):协调器派生依赖图,划分波次,并行派发 worker 实现每个端点的 mock
- 阶段 2(并行填充):协调器同样派生波次,并行派发 worker 替换 mock 为真实实现
- 阶段 3(自动验证):对照契约与流程图检查;每条命令记一行 PASS/FAIL/PRE-EXISTING,主会话亲自复核关键命令
- 阶段 4(独立评审):验证通过后,主会话直接派发全新上下文的 `ql-reviewer`,给三结论(契约合规/正确性/一致性);critical 定向修复后复审(最多 2 轮),不收敛即报告僵局

**为什么是并行:**
- 速度:多 worker 同时工作
- 上下文质量:每个 worker 上下文保持精简
- 自动推导依赖:OpenAPI schema `$ref` + 路径前缀 + 事件订阅

**为什么还要独立评审:**
- 验证只能证明"实现符合契约",查不出契约写错、测试复制生产逻辑、边界想错
- 实现者自查有盲区;评审者与实现者无共享上下文,只看证据

#### 交付(`/ql-deliver`)

**输入:** 验证与评审均通过的代码
**产出:** PR + STATE 更新
**关键:**
- 前置:`verification.md` passed **且** `review.md` approved
- **不自动收尾**——呈现特性分支、base/head SHA、文档路径,由用户选:创建 PR(推荐)/ 仅推送 / 保留本地
- PR 正文含端点列表、验证摘要、评审裁定、遗留 non-critical、经验教训
- 自动生成章节留档
- 推进到下一阶段或标记里程碑完成

---

## 目录结构

```
qiling/(器灵 v0.15.0)
├── commands/                          # 9 个命令入口(+4 个旧名别名)
│   ├── ql-scan.md                     # 扫描代码 → 文档树
│   ├── ql-design.md                   # 定方案(契约 + 流程图)
│   ├── ql-build.md                    # 写代码(波次并行)
│   ├── ql-deliver.md                  # 交付
│   ├── ql-doc.md                      # 章节文档
│   ├── ql-fix.md                      # 修 Bug
│   ├── ql-add.md                      # 加功能
│   ├── ql-next.md                     # 下一步提示(状态感知入口)
│   └── ql-update.md                   # 升级迁移(插件更新后迁移项目工件)
├── skills/                            # 嵌套式 SKILL.md(与命令同名)
│   └── ql-{scan,design,build,deliver,doc,fix,add,next,update}/SKILL.md
├── workflows/                         # 11 个工作流实现
│   ├── scan.md / design.md            # 初始化与方案
│   ├── build-skeleton.md              # 波次并行骨架
│   ├── build-fill.md                  # 波次并行填充 + 自动验证
│   ├── review.md                      # 独立评审
│   ├── deliver.md / doc.md            # 交付与章节渲染
│   ├── fix.md / add.md                # 旁路:修 Bug 与加功能
│   ├── next.md                        # 状态判定 → 下一步建议
│   └── update.md                      # 升级迁移(dry-run → 备份 → 迁移 → 提示)
├── agents/                            # 4 个子智能体
│   ├── ql-design-coach.md          # 讨论引导
│   ├── ql-builder-coordinator.md    # 协调器:依赖分析、波次划分、派发、合并
│   ├── ql-builder-worker.md         # Worker:单端点/事件,全新上下文,Git Worktree
│   └── ql-reviewer.md               # 独立评审者:全新上下文,三结论,只评审不修复
├── templates/                         # 15 个工件模板
│   ├── openapi-spec.yaml
│   ├── event-flow.md
│   ├── decisions.md                   # 决策轨迹(设计选择的论证过程留痕)
│   ├── constitution.md                # 项目宪法(MUST/SHOULD 红线,可选)
│   ├── state.md
│   ├── skeleton-plan.md
│   ├── build-report.md                # 骨架/填充报告(含旅程日志)
│   ├── wave-report.md                 # 波次报告(协调器-worker 契约)
│   ├── verification.md                # 验证报告(命令级证据)
│   ├── review.md                      # 独立评审报告
│   ├── bugfix-report.md               # Bug 修复报告
│   ├── chapter.md / chapter-index.md  # 章节留档
│   └── config.json / config-schema.json
├── .zcode-plugin/                # Zcode 插件市场元数据
│   ├── plugin.json
│   └── capability.json
├── docs/
│   ├── ARCHITECTURE.md                # 本文档
│   ├── WALKING-SKELETON.md            # Walking Skeleton 方法论
│   ├── REFERENCES.md                  # 重要参考项目(superpowers/OpenSpec/gsd-core 等)
│   ├── RELEASE-CHECKLIST.md           # 发版检查单(validate 断言 + AI 梳理清单)
│   └── PARALLELIZATION.md             # 并行策略详细文档
├── scripts/validate.mjs
├── scripts/migrate.mjs                # 升级迁移引擎(ql-update 的确定性层)
└── package.json
```

---

## 子智能体设计

### ql-design-coach

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

### ql-reviewer

**角色:** 独立评审者(交付前最后一道质量门)
**特点:** **全新 200k token 上下文**,与实现者零共享记忆;由主会话直接派发(不经协调器);**只评审,不修复**
**职责:**
1. 读规范(OpenAPI + 流程图)、决策轨迹(decisions.md,若存在)、完整 diff(base..head)、验证摘要
2. 对照契约与流程图逐条核对验收标准;实现与契约不符时先查决策轨迹,区分"实现错了"与"契约滞后于决策"
3. 对照 AI 代码套路清单(S1-S8:mock 冒充实现、路由未接线、吞错误、全 200、契约字段未消费、测试只测 mock、占位残留、校验只在文档里)扫描 diff
4. 抽查验证摘要可信度(不重跑已 PASS 的重型命令)
5. 给三个独立结论:**契约合规 / 正确性(含套路扫描结果) / 代码库一致性**,每个发现附证据(文件:行号或亲测命令输出)
6. 写 `review.md`,裁定 `approved | criticals_found`
7. 修复后复审受影响区域(最多 2 轮);两轮不收敛即上报僵局,不强行通过

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
| **命令数量** | 70+ | **5** |
| **子智能体** | 35+ | **4**(coach + coordinator + worker + reviewer) |
| **工作流** | 110+ | **6** |
| **适配运行时** | 17+ | **1**(Zcode) |
| **讨论产出** | 模糊决策记录 | **OpenAPI + Mermaid** |
| **构建方法** | 串行+波次并行 | **全自动波次并行 + Worktree** |
| **依赖推导** | 手工 PLAN + 复杂分析 | **自动从 OpenAPI 推导** |
| **派发粒度** | PLAN(预定义) | **端点/事件(自动)** |
| **质量门** | 人工评审 | **契约验证 + 独立评审(全新上下文,三结论)** |

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