<!-- ql:loop-host
step: init
points: init:pre, init:post
agent-roles: orchestrator
produces: 项目根 AGENTS.md(ql:managed 管理块 + 手写区)+ 会话报告
consumes: .qiling/planning/ 工件(宪法/契约/STATE/章节索引), 目标 package.json, scripts/agents.mjs
-->

<purpose>
**ql-init —— AGENTS.md 全局管控生成。**

回答一个问题:**"用户没敲 /ql- 命令的会话,怎么也知道走器灵流程?"**

器灵此前的管控都靠用户主动敲命令触发;宿主(ZCode 等)每轮会话自动注入项目根的
AGENTS.md——把"按场景选命令"的触发表、宪法铁律、契约纪律渲染进去,管控才能覆盖
全部会话,而不是只有记得敲命令的那些。

**核心原则(决策 D11,两层结构):**
- **确定性层** —— 管控块由 `scripts/agents.mjs` 从工件提取渲染(`<!-- ql:managed:start/end -->`
  之间),幂等、可重复、`--check` 可测漂移;AI 不即兴改写
- **智能层** —— 仅首次生成时,AI 分析项目补一段项目概述写进**手写区**(管理块之外);
  脚本对手写区永不触碰(活文档由人/AI 迭代,自动生成不覆盖人工策展)
</purpose>

<process>

## 步骤 1: 环境确认

```bash
# 前置:项目已用器灵初始化(无 .qiling/planning/ 时管控块大量"未检出",价值骤降)
test -d .qiling/planning && echo "已初始化" || echo "未初始化"

# AGENTS.md 现状
test -f AGENTS.md && grep -c "ql:managed" AGENTS.md || echo "无 AGENTS.md"
```

- **未初始化** → 提示先 `/ql-design`(新项目)或 `/ql-scan`(接手存量代码);用户坚持生成时
  照常执行(管控块各节显示"未检出 + 指引",仍有路由价值),报告中说明
- `--check` 报漂移 → 直接进步骤 3(无需 AI 层)

## 步骤 2: 手写区(智能层,仅首次)

AGENTS.md **不存在**、或存在但没有管理块且没有项目概述时:

1. 快速勘察项目(README/package.json/目录结构,不超过几轮工具调用)
2. 写一段**简短**的项目概述进文件顶部手写区:一句话定位 + 技术栈 + 1-2 条非默认约定
   (参考 Claude Code /init 纪律:只写代理推不出来的东西,总长控制在十几行内)
3. 已有手写内容(无论是否有管理块)→ **一个字都不动**,跳过本步

**纪律:** 手写区是活文档,用户会自己迭代;AI 只补首次的空白,不"顺手整理"用户内容。

## 步骤 3: 管控块(确定性层)

```bash
node <插件目录>/scripts/agents.mjs --root <项目根>
```

引擎保证:
- 从宪法/契约/STATE/章节索引/package.json 提取事实渲染管理块,缺件显式"未检出"
- 幂等:内容未变不落盘;重跑只替换管理块,块外原样保留
- 落盘前触发表自检:引用的命令与插件 commands/ 实际清单一致(防命令改名后指向不存在)

## 步骤 4: 校验与报告

```bash
node <插件目录>/scripts/agents.mjs --check --root <项目根>   # 应退出 0
```

汇报(参考格式):

```text
✅ AGENTS.md 已生成(器灵 vX.Y.Z):
- 管理块:N 行(触发表 11 场景 / 宪法 M 条 / 契约 K 端点 / STATE 快照)
- 手写区:首次生成已补项目概述 / 已有内容原样保留
- 漂移门:--check 通过
- 生效:宿主下轮会话起自动注入;此后宪法/契约演进后重跑 /ql-init 同步
```

**边界纪律:**
- 管理块之外的内容(用户手写的约定、其他工具的段落)永不修改、不重排、不"优化"
- 用户 AGENTS.md 里已有的器灵旧格式块(无管理块标记)→ 按"无管理块"末尾追加,
  不删用户旧内容,报告里提示可自行清理
- 契约(openapi.yaml)、决策(decisions.md)、宪法(constitution.md)是提取源,只读不写

</process>
