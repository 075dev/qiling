# 参考项目(REFERENCES)

器灵的重要参考项目。本地克隆于插件仓库外的 `D:\AIWorkSpace\ZcodePlugin\refs\`(浅克隆,不入 git)。
调研时间:2026-09-15(0.14.0 派发决策门设计时的专项调研)。

| 项目 | 定位 | 本地路径 | 器灵借鉴了什么 |
|------|------|----------|----------------|
| [obra/superpowers](https://github.com/obra/superpowers) | 完整软件开发方法论技能集(brainstorm → plan → 子代理逐任务实现 → 双层评审) | `refs/superpowers/` | 派发的理由是**上下文隔离而非并行**;串行轻步骤回撤主对话的实测记录(spec/plan 自查内联,25 分钟子代理评审环 → 30 秒内联清单,质量相同);修复轮次 1-3 **resume 原 worker**(上下文完好);worker 回话压到 15 行、细节落盘报告文件;小活合批 |
| [Fission-AI/OpenSpec](https://github.com/Fission-AI/OpenSpec) | 规格驱动开发 CLI,proposal → apply → archive,全程主对话单线程零派发 | `refs/OpenSpec/` | 磁盘工件即状态(tasks.md checkbox 从磁盘推导进度,冷启动 O(1) 恢复);delta 是最小回流单位(评审者看变化不看全量);唯一委派规则是"共享文件系统状态的步骤必须同步等待" |
| [open-gsd/gsd-core](https://github.com/open-gsd/gsd-core) | 五步阶段循环工作流框架(器灵的直接前身) | `refs/gsd-core/` | **内联阈值** `workflow.inline_plan_threshold`(默认 2:任务数 ≤ 阈值无条件主对话内联,理由明写"省 ~14K token 子代理冷启动开销 + 保 prompt cache");Pattern A/B/C 路由(自治大块 → 子代理;含人工决策 → 主对话;评审角色 → 必须子代理,"Independent agent contexts are required for the gate to be meaningful");波后合并门由 orchestrator **亲自**跑测试(不信 worker 自检);上下文压力四级表(POOR 拒绝派发);派发后禁手 |
| [code-yeongyu/oh-my-openagent](https://github.com/code-yeongyu/oh-my-openagent) | 多运行时编排插件(OpenCode/Codex/CLI 三形态),"主对话当编排器、干活全派子代理" | `refs/oh-my-openagent/` | 派发默认化但有三条**内联豁免**:trivially simple / **上下文已全部加载** / 派发开销超过任务复杂度;`task_id` 会话续接对抗冷启动(官方称省 70%+ token);证据落盘(无证据文件 = QA 没发生);给全新上下文的下游 agent 显式豁免"不需要重新探索" |
| [Yeachan-Heo/oh-my-claudecode](https://github.com/Yeachan-Heo/oh-my-claudecode) | Claude Code 多代理编排层(19 个专业 agent + 39 个 skill) | `refs/oh-my-claudecode/` | Scale 分级:"单单元直接做,**不要为一次专注执行就能完成的工作搭建协调机制**";Handoff 文档协议(阶段交接 10-20 行:Decided/Rejected/Risks/Files/Remaining,防上下文压缩丢失);固定快照防评审锚定(两个评审者互不喂结论);Final_Response_Contract(子代理最后一条消息必须是结构化交付物,禁止"done"式收尾) |

## 五个项目的共同结论(0.14.0 派发决策门的依据)

1. **"能否并行"不是派发判据。** 判据是三问:产物体积(细节会不会烧主对话上下文)?是否需要独立性(评审/验证必须派)?是否需要人工交互(必须留主对话)?
2. **小活一律内联。** superpowers 实测回撤、gsd-core 数值阈值、OmO 三豁免、OmC Scale 分级——四个项目从四个方向收敛到同一条规则。
3. **状态传递靠磁盘工件,不靠对话记忆。** 回流只带路径/结构化结论,细节按需直读文件。
4. **评审的独立上下文是功能不是成本。** 缓存"不命中"恰恰是评审公正性的来源。
5. **对冲冷启动靠续接与文件,不靠放弃派发。** resume 原 worker / task_id 续接 / 报告文件兜底。
