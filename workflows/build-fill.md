<!-- ql:loop-host
step: build-fill
points: build:fill:pre, build:fill:post
agent-roles: ql-builder-coordinator, ql-builder-worker
produces: filled code, fill-report.md, verification.md, 波次报告
consumes: skeleton code, openapi.yaml, event-flow.md, skeleton-report.md
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

派发 `ql-builder-coordinator` 子智能体(全新上下文):

```
你的任务:协调填充阶段(波次并行)

输入:
- .planning/context/openapi.yaml
- .planning/context/event-flow.md
- .planning/build/skeleton-report.md —— 骨架清单(所有端点已 mock,事件已连接)
- .planning/config.json

阶段:fill(替换 mock 为真实实现)

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

## 步骤 4: 自动验证(派发协调器第三轮)

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

产出:.planning/build/verification.md
```

## 步骤 5: 读 verification.md

主会话检查验证结果:

```bash
STATUS=$(grep "^status:" .planning/build/verification.md | awk '{print $2}')
```

**若 `passed`:**
- 更新 STATE
- 提示下一步:`/ql-ship`

**若 `gaps_found`:**
- 列出差距
- 提示用户:可让 AI 生成修复 PLAN,或手动修复

## 步骤 6: 更新 STATE

```yaml
---
status: verified | verification_failed
verified_at: [timestamp]
waves_executed: K
last_activity: fill + verification complete
---
```

## 步骤 7: 提示下一步

呈现:
- 填充覆盖率
- 测试统计
- 验证状态
- 波次耗时
- 下一步:`/ql-ship`(若验证通过)

</process>