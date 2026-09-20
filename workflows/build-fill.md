<!-- ql:loop-host
step: build-fill
points: build:fill:pre, build:fill:post
agent-roles: ql-builder-coordinator, ql-builder-worker
produces: filled code, fill-report.md, verification.md, 波次报告
consumes: skeleton code, openapi.yaml, event-flow.md, decisions.md(若存在), skeleton-report.md
-->

<purpose>
**填充真实逻辑 —— 波次并行执行**

协调器在骨架基础上派生相同的依赖图 → 并行派发 worker 替换 mock 为真实实现 → 合并 → 自动验证。
</purpose>

<available_agent_types>
- **ql-builder-coordinator** —— 协调器
- **ql-builder-worker** —— Worker(单个端点/事件,全新上下文)
</available_agent_types>

<process>

## 步骤 1: 检查骨架就绪

```bash
test -f .planning/build/skeleton-report.md || {
  echo "错误: 骨架尚未构建。请先运行 /ql-build(不带 --fill-only)"
  exit 1
}
```

## 步骤 2: 派发协调器(填充阶段)

**先过派发决策门(同 build-skeleton 步骤 0.5):** 任务数 ≤ `inline_threshold`(默认 2)→ **内联模式**,主会话直接逐端点替换 mock 为真实实现(错误处理 + 测试 + 原子提交同 worker 标准),完成后写 `.planning/build/fill-report.md`,跳到步骤 3;否则按下方派发。

派发 `ql-builder-coordinator` 子智能体(全新上下文):

```
你的任务:协调填充阶段(波次并行)

输入:
- .planning/context/openapi.yaml
- .planning/context/event-flow.md
- .planning/context/decisions.md(若存在)—— 决策轨迹:填充涉及契约未规定的细节(错误结构、分页、幂等)时,提取相关 D-N 条目注入 worker 任务卡,按决策精神补齐而非瞎猜
- .planning/build/skeleton-report.md —— 骨架清单(所有端点已 mock,事件已连接)
- .planning/config.json

阶段:fill(替换 mock 为真实实现;若骨架阶段为 brownfield/spec-as-is 基线,则填充同样以存量实现为基线增量对齐)

派发通道:你的 Agent 工具应包含 ql-builder-worker 子代理类型;若不可用,立即返回 DISPATCH_CHANNEL_UNAVAILABLE 并停止——禁止降级到外部 CLI/子进程派发,由主会话改内联模式或换宿主

工作方式:
1. 读 skeleton-report.md,获取所有任务清单
2. 推导依赖(同骨架阶段)
3. 划分波次(同骨架阶段)
4. 对每个波次:
   a. 为每个任务创建 git worktree 与分支
   b. 并行派发 ql-builder-worker(任务描述含"替换 mock 为真实实现")
   c. 合并 worker 分支到当前分支
   d. 运行填充后的连通性验证
   e. 失败则暂停
5. 写 fill-report.md

worker 任务描述必须强调:
- 在已有骨架基础上增量修改(不重写)
- 替换 mock 为真实实现
- 添加错误处理(对照 OpenAPI 错误模型)
- 添加单元测试
- 不破坏已有骨架的连通性
```

## 步骤 3: 验证填充报告

主会话读 `.planning/build/fill-report.md`:

- [ ] 所有 mock 端点已替换为真实实现?
- [ ] 所有 mock 事件已替换为真实处理?
- [ ] 测试覆盖率合理?
- [ ] 没有遗留 mock?

## 步骤 4: 自动验证

**先过派发决策门:** 验证是**串行**流程,且步骤 5 主会话反正要亲自复核关键命令——小项目派协调器第三轮只剩冷启动开销,没有隔离收益(大 diff 的隔离收益属于填充与评审,不属于验证)。

- **内联模式**(任务数 ≤ `inline_threshold`):主会话**亲自**执行下方全部验证项,逐条记入 verification.md,然后直接进步骤 5。
- **编排模式**:按下方派发协调器。

派发 `ql-builder-coordinator` 子智能体,执行验证阶段:

```
你的任务:验证阶段

输入:
- .planning/context/openapi.yaml
- .planning/context/event-flow.md
- .planning/build/fill-report.md

验证项:
1. OpenAPI 契约符合性:每个声明端点都有实现,schema 匹配,错误响应存在
2. 流程图符合性:每个事件链路连通,状态机转换正确
3. 测试套件:全部通过
4. Lint / 类型检查:无错误
5. 构建:成功
6. 模板化残留扫描(可机检部分):对本次 diff 的文件 grep TODO/FIXME/placeholder/"临时"/示例数据字面量,命中列入 verification.md 待评审复核;行为级套路(mock 冒充实现、吞错误、契约字段未消费等)留给独立评审(S1-S8 清单)

验证纪律(fresh evidence):
- 每条命令记录一行:命令 + PASS/FAIL/PRE-EXISTING
- 已知基线失败标 PRE-EXISTING + 短标识,不算本次失败
- 不拿 worker 报告替代命令输出

产出:.planning/build/verification.md
```

## 步骤 5: 主会话亲自复核(fresh evidence)

verification.md 是协调器的"声明"。主会话在继续前**亲自**跑最关键的两条命令并读真实输出:

```bash
# 测试套件 + 构建(从项目实际目录跑)
npm test        # 或仓库实际的测试命令
npm run build   # 或仓库实际的构建命令
```

- 与摘要一致 → 继续
- 不一致 → 以亲测结果为准,验证状态改 `gaps_found`,回到修复

**验证完成前不做任何"完成"声明。**

## 步骤 5.5: 独立评审

验证通过后,执行 `@review.md`:

- 主会话直接派发 `ql-reviewer`(全新上下文,不经协调器)
- 三个独立结论:契约合规 / 正确性 / 代码库一致性
- `criticals_found` → 定向修复 → 复审(最多 2 轮),不收敛即报告僵局

**串行铁律:** 验证与评审严格串行——所有验证命令退出后才派发评审,评审期间不并行跑重型测试或长驻进程。

## 步骤 6: 更新 STATE

```yaml
---
status: verified | verification_failed | reviewed
verified_at: [timestamp]
review_verdict: approved   # 评审通过后
review_rounds: N
waves_executed: K
last_activity: fill + verification + review complete
---
```

## 步骤 7: 提示下一步

呈现:
- 填充覆盖率
- 测试统计
- 验证状态
- 评审裁定(verdict + 轮次 + 遗留 non-critical 数)
- 波次耗时
- 下一步:`/ql-deliver`(若验证与评审均通过)

</process>