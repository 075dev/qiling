# 器灵工作流 CHANGELOG

所有对插件的显著变更都记录在此文件。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)。
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [0.11.0] - 2026-09-12

### 新增:`/ql-next` 下一步提示(状态感知入口)

对应 GSD 的 `/gsd-next`(状态感知智能入口)。回答一个问题:**"我现在应该做什么?"**

**核心原则:状态从磁盘推导,不信任何文件的自述。** STATE.md 会过期、会说谎(跨会话、崩溃、手工改动);磁盘产物与 git 才是事实。技能只读零副作用——不改任何文件、不派发子代理、给建议后由用户决定是否执行。

**判定逻辑(workflows/next.md 决策表,14 条,从上到下第一条命中即返回):**

- 未初始化 → `/ql-scan`(接手项目)或 `/ql-design`(新项目)
- 台账有 FAIL/NOT_RUN → 从断点续跑 `/ql-build`
- bugfix 报告 blocked → 带已排除假设重进 `/ql-fix`
- worker worktree 遗留 → 先清理再继续
- `verified_at_commit` 落后 HEAD → 验证 STALE,重跑 `/ql-build`(验证阶段)
- 验证 gaps_found / 评审 criticals_found → 按账本修复后复审
- 验证 passed + 评审 approved/waived → `/ql-deliver`
- 方案就绪 → `/ql-build`;讨论未冻结 → `/ql-design`(读歧义评分)
- 里程碑完成 → `/ql-design` 开新阶段

**判定纪律:** 磁盘与 STATE 冲突时以磁盘为准并说明;多条命中取编号最小(最接近阻塞源的先处理);不可解析的情况展示事实交用户决定。

**新文件:** `skills/ql-next/SKILL.md`、`commands/ql-next.md`、`workflows/next.md`。

### 版本号

- `package.json` / `.zcode-plugin/{plugin,capability,marketplace}.json` / `marketplace.json`:0.10.0 → 0.11.0

## [0.10.0] - 2026-09-12

### 优化:回归血统源——对标 open-gsd/gsd-core 当前形态(1.13.0)的七项修正与补全

器灵最初基于 GSD 1.11.0 的研究精简而来。本轮回归 [open-gsd/gsd-core](https://github.com/open-gsd/gsd-core) 调研其最新演进(1.12"状态事务与认识论"、1.13"契约化与并发"),发现 GSD 用一整版修复的真实事故模式,恰是器灵 0.9.0 刚引入机制(ledger/验证/处置)的"被实战验证过的形态",逐项对齐:

#### 1. ledger 三态升级:PASS / FAIL / NOT_RUN + 证据强制(对应 GSD #3907/#3909/#3956)

progress ledger 的 `passes` 布尔升级为三态:每任务 `status: PASS | FAIL | NOT_RUN` + `evidence`(命令输出/commit 区间/测试名)。**无法执行的检查记 NOT_RUN 并写原因**(NOT_RUN 不是失败也不是通过,恢复时必须补跑);**零检查不得报绿**(一条证据都没有的 PASS 按伪造处理)。依据:GSD 用一整版修复"检查没跑成被当成通过"的静默失败事故。

#### 2. 验证结论时效锚点(对应 GSD #4155 + #2734)

verification.md frontmatter 新增 `verified_at_commit:`(验证时 HEAD SHA);**结论是会过期的数据**——落后当前 HEAD 即自动降级 STALE,引用前必须重跑。`/ql-deliver` 前置检查新增 STALE 校验(`git merge-base --is-ancestor`)。

#### 3. 评审处置账本契约化(对应 GSD #3806 Review Dispositions Ledger)

review.md 的发现表升级为**处置账本**:固定 schema(`# | 发现 | severity | disposition | evidence | decided_by | round`),disposition 四值枚举 **FIXED / WAIVED / DEFERRED / REFUTED**,行引用必须写 `L42@abc1234`(行号+文件版本,裸行号不合规),**账本 append-only**——后续轮次只能追加或声明"取代 F2",不得删改旧行。依据:GSD 实测放任自由文本处置,两轮就出现两种不兼容格式;器灵多轮 ql-fix/评审循环会遇到同样问题。

#### 4. 波后 scoped 轻量检查(对应 GSD `code_review_point: execute:wave:post`)

协调器每波合并前对**本波 diff(相对上一波)**做轻量检查:本波验收标准 + 是否破坏上一波已验证的 Interfaces。问题当场退回 worker,**波次间集成问题不带进下一波**;全量验证仍留阶段末尾。

#### 5. 同波耦合显式声明(对应 GSD #1954 + `coupling_justified`)

波次划分发现同波任务共享文件/隐式耦合时,默认 advisory(提示而非硬失败);确要同波必须显式写 `coupling_justified: <原因>` 放行——显式声明优于反复空转拆波。

#### 6. 提交实测协议(对应 GSD #3968 + #3819 + #2596 + git-integration)

合并前用 `git log`/`git diff --name-only` **实测** worker 分支的提交数与改动范围(不采信自述):越界 = BLOCKER 退回;**禁止 `git stash`**(破坏 worktree 隔离);提交绝不落在默认/受保护分支。

#### 7. 出处标签(对应 GSD [VERIFIED]/[ASSUMED]/[CITED])

worker 报告中涉及契约或上游代码的断言必须标注出处:`[VERIFIED: file:lines]`(真读过)/ `[ASSUMED]`(推断未验,显式标出);**元数据缺失不构成证据**,未标注的关键断言按 ASSUMED 从严处理。

### 已反超、明确不照搬

- **契约先行 + 冻结门 + 机器可读上游**:GSD 至今以散文 RESEARCH/CONTEXT.md 为上游,靠出处标签打补丁;器灵的 OpenAPI 契约体系在结构上领先,本轮只吸收其出处标签进 worker 纪律。
- **Walking Skeleton**:GSD 刚在 Unreleased 中完成 tracer-first 范式转向(SKELETON.md),器灵的波次并行 Walking Skeleton 原生如此,无需再学。
- **面积控制**:GSD 70+ 命令 + 6 路由 + 35 agent + 知识图谱 + 跨项目记忆,已在为其自身体量还债(namespace 路由、surface 裁剪、字节预算本质都是体量治理);器灵三步循环 + 两条受控旁路保持不变。

### 版本号

- `package.json` / `.zcode-plugin/{plugin,capability,marketplace}.json` / `marketplace.json`:0.9.0 → 0.10.0

## [0.9.0] - 2026-09-12

### 优化:对标用户指定项目 oh-my-openagent 与 oh-my-claudecode 的七项修正与补全

调研了两个用户指定项目:[code-yeongyu/oh-my-openagent](https://github.com/code-yeongyu/oh-my-openagent)(OmO,多模型编排插件,Ultrawork/DAG/对抗验证)与 [Yeachan-Heo/oh-my-claudecode](https://github.com/Yeachan-Heo/oh-my-claudecode)(OMC,29 agents/34 skills/31 hooks 的 Claude Code 多代理编排)。汲取七项机制:

#### 1. 严格度分级:LIGHT/HEAVY(借鉴 OmO LIGHT/HEAVY 永不降级规则)

协调器任务卡新增强制字段 `严格度:LIGHT | HEAVY`:新模块/安全相关/外部集成/DB schema 变更/并发处理 = HEAVY,既有层内窄改 = LIGHT。**默认 LIGHT、命中 HEAVY 事实立即升级、拿不准取 HEAVY、永不降级**。wave-report frontmatter 同步记录。

#### 2. 评审深度分级门控(借鉴 OMC verification-tiers)

`ql-reviewer` 新增三档评审规则:**LIGHT**(≤3 文件且 ≤100 行且无 HEAVY,抽查+单点证据)/ **STANDARD**(默认,完整三结论)/ **THOROUGH**(>20 文件、HEAVY 任务、触及 `auth/**`、`schema`、`.env*` 等安全架构路径——全量评审+对抗检查+宪法对照)。安全/架构路径无条件 THOROUGH;用户说 critical 强制升档、trivial 降一档(不低于 LIGHT),降档须写明理由。附"声明 ↔ 证据"对照(声明"已实现"必须有测试+构建证据)。

#### 3. 完成声明探测三键(借鉴 OmO AdversarialVerify)

reviewer 抽查"完成"类声明时必须主动探测:**stale_state**(通过的是缓存旧产物?)、**dirty_worktree**(验证时工作区干净?有无未提交魔法补丁)、**misleading_success_output**(退出码成功但核心断言没跑?0 tests run 也是 PASS)。任一命中按 criticals_found 处理。

#### 4. worker 完成协议(借鉴 OMC ralph Iron Law)

`ql-builder-worker` 新增完成协议:**IDENTIFY(说清哪条命令什么输出能证明完成)→ RUN → READ(亲读输出)**;汇报含"应该可以/probably/seems to"类红旗词一律视为未完成;**零容忍**:fix code, not tests(删测试/改断言 = 任务失败)、不缩水验收范围、不留垃圾进程。

#### 5. ledger 布尔翻转 + 风险交接(借鉴 OMC prd.json passes 字段 + OmO DoneClaim)

progress ledger 行格式升级:每任务带**可机器验证的验收标准** + `passes:true|false` 布尔 + strictness——完成 = 翻转布尔而非自由文本,断点续跑从第一个 `passes:false` 继续。worker 返回新增 **risks**(给后续波次埋下的假设与依赖)与 **Completion Notes**(给下一波次的话),由协调器注入下一波次任务卡;wave-report 新增"风险与交接"节。

#### 6. 资源清理回执(借鉴 OmO cleanup 契约)

wave-report DoD 新增清理回执行:本任务启动的服务/容器/端口/临时进程逐项关闭,不留运行中的后台进程。

#### 7. 对抗检查 + 范围保真(借鉴 OmO ultraqa 触发映射 + F4 范围保真)

verification.md 新增两节:**对抗检查**——按触发事实展开(畸形输入/取消恢复/stale 产物/超时兜底/flaky/误导性成功输出六类),适用类必须有捕获的可观察结果,跳过写理由;**范围保真**——无契约外端点、无台账外文件变更、骨架无业务逻辑混入,范围外实现 = CRITICAL 差距(功能正确也不放过)。

另:`/ql-design` 新增**契约冻结门**(借鉴 OMC deep-interview 歧义度)——目标/约束/验收三维评分计算 `ambiguity`,`> 0.2` 不冻结契约;核心实体名连续两轮稳定才允许冻结;冻结时在 STATE 留评分表与默认假设清单。`/ql-build` 工作区门控新增**环境自检**清单(worktree 可用/.planning 可写/非 main 分支/契约可解析/宪法状态)。

### 版本号

- `package.json` / `.zcode-plugin/{plugin,capability,marketplace}.json` / `marketplace.json`:0.8.0 → 0.9.0

## [0.8.0] - 2026-09-12

### 优化:对标 GitHub 同类工作流项目的九项修正与补全

调研了四个同类项目并汲取机制:[github/spec-kit](https://github.com/github/spec-kit)(规格驱动,覆盖审计/澄清协议/宪法)、[Fission-AI/OpenSpec](https://github.com/Fission-AI/OpenSpec)(轻量规格演进,delta/WAIVED/版本纪律)、[bmad-code-org/BMAD-METHOD](https://github.com/bmad-code-org/BMAD-METHOD)(分区写权限/风险门/上下文接力)、[obra/superpowers](https://github.com/obra/superpowers)(技能纪律:ledger/根因铁律/触发路由)。

#### 1. 构建前覆盖矩阵(借鉴 spec-kit /analyze)

协调器推导依赖后**必须产出覆盖矩阵**(契约端点/事件 ↔ 任务 ID):零任务覆盖 = CRITICAL,补齐后才可派发;孤儿任务 = HIGH;术语漂移以契约为准。堵住"契约有、构建漏"。

#### 2. worker 任务卡契约化(借鉴 superpowers writing-plans + BMAD 分区写权限)

任务卡新增强制字段:**Files 边界**(允许修改的精确文件,Create/Modify 分列)与 **Interfaces**(Consumes/Produces——依赖的精确签名,可从 OpenAPI 机械派生);**禁占位符**(出现"待定/适当处理/参考任务 N"即拒绝派发,任务卡必须可乱序独立阅读);任务卡为锁定契约,worker 发现卡有误只能报 failed,不得擅自改需求。wave-report 模板新增 **DoD 完成检查单**(验收满足/有测试/回归通过/File List 一致/验证命令齐)与**分区写权限表**(任务卡协调器锁定,worker 只写自己的区块)。

#### 3. 波次间上下文接力(借鉴 BMAD story 接力)

波次 ≥ 2 的 worker 任务卡由协调器注入**上一波次所有 worker 的 Completion Notes 摘要 + 新增文件清单**(接口偏差、踩坑、约定),防止全新上下文 worker 在波次间漂移。

#### 4. 进度台账(借鉴 superpowers progress ledger)

每个 worker 合并后向 `.planning/build/progress.md` 追加一行状态。构建中断后恢复时**只信台账与 git log**,从第一个无 complete 记录的任务续跑——覆盖长构建、上下文压缩、进程崩溃三种场景。

#### 5. 项目宪法(借鉴 spec-kit constitution)

新增 `templates/constitution.md`:首次 `/ql-design` 可选生成(技术栈红线、分层规则、安全底线,MUST/SHOULD 分级,违规豁免表 + 修订记录)。`/ql-build` 划分波次与声明 Files 边界前过宪法门控;每条原则必须**可判定**(能用是/否回答)。

#### 6. 澄清纪律升级(借鉴 spec-kit /clarify)

`/ql-design` 提问协议:每问带推荐选项;候选超 5 个按**影响 × 不确定性**排序取前 5,其余登记为默认假设;**每个答案立即回写产物**(端点约束写 path description / `x-ql-*` 字段,并在契约 `## Clarifications` 段留 Q/A 记录)——歧义从聊天记录变成契约的一部分。

#### 7. WAIVED 豁免语义(借鉴 OpenSpec verify + BMAD gate)

评审 verdict 扩为 `approved | criticals_found | waived`:评审僵局时用户可显式豁免交付,必须登记 `waived_by` + `waive_reason`,被豁免 critical 进入交付记录与 PR 正文。**评审者与实现者都无权自批 WAIVED**。`/ql-deliver` 前置检查同步更新。

#### 8. `/ql-fix` 根因铁律(借鉴 superpowers systematic-debugging)

**未输出根因结论之前,禁止产生任何修复 diff**;复现必须固化为自动化失败测试(测试立即通过 = 复现无效,报错非断言失败 = 复现不干净);新增**危险信号表**("先快速修一下"= 回炉;修 A 后 B 处现同症 = 没找到根因;改测试让它过 = 修错了对象);连续三次失败明确升级为设计层讨论(契约错了回 `/ql-design`,需重新规划转 `/ql-add`)。

#### 9. 契约版本演进 + 终态绑定(借鉴 OpenSpec 版本纪律)

`/ql-add` 补契约时按语义化递增 `info.version`:新增端点 = minor,破坏性变更 = major + 破坏点标注,纯描述修正 = patch。`/ql-design` 增加终态绑定:契约未经确认唯一出口是继续澄清,确认后唯一出口是 `/ql-build`。

### 版本号

- `package.json` / `.zcode-plugin/{plugin,capability,marketplace}.json` / `marketplace.json`:0.7.0 → 0.8.0

## [0.7.0] - 2026-09-12

### 新增:修 Bug 与加功能两个旁路技能;技能名称直白化

#### 1. 技能名称直白化(破坏性更名,旧名保留别名)

用户反馈原命名(docsmap/discuss/ship/chapter)不够直白。全部命令改为"从名字能看出干什么"的动词:

| 旧命令 | 新命令 | 一句话 |
|--------|--------|--------|
| `/ql-docsmap` | `/ql-scan` | 扫描代码,生成文档树(初始化) |
| `/ql-discuss` | `/ql-design` | 定方案:讨论产出契约 + 流程图 |
| `/ql-build` | `/ql-build`(不变) | 写代码:波次并行 + 验证 + 评审 |
| `/ql-ship` | `/ql-deliver` | 交付:PR + 归档 |
| `/ql-chapter` | `/ql-doc` | 生成章节文档 |
| — | `/ql-fix`(新) | 修 Bug |
| — | `/ql-add`(新) | 加功能 |

- skills/ 与 workflows/ 文件同步改名(`design.md`、`deliver.md`、`doc.md`、`scan.md`)
- 子智能体 `ql-discuss-coach` → `ql-design-coach`
- **旧命令名保留为别名文件**(`/ql-discuss` 等 4 个),调用时提示新名称,老用户平滑过渡
- 内部标识(`docsmap_init` frontmatter 字段、`ql_state_version`、`ql_state` 前缀)不变,旧项目文档兼容

#### 2. `/ql-fix` 修 Bug 指导(新技能)

Bug 修复最容易犯的两个错误:没复现就改、没找到根因就打补丁。`/ql-fix` 用门控强制顺序:

1. **勘察(Orient)** —— 报错、相关代码、近期提交(`git log -p`);契约偏差先判定修代码还是修契约
2. **复现(硬门控)** —— 失败测试或固化命令,保存失败证据;无法复现不盲改
3. **根因分析** —— 报错/日志、`git blame`、边界插桩、契约对照四来源交叉;判定标准"修复它之后,此类问题不再出现"
4. **最小修复** —— 回归测试先失败 → 最小修复 → 转绿;**两次修复失败即停**,回到根因重新推导,仍无头绪则 `status: blocked` 上报,不无限打补丁
5. **回归验证** —— 全量测试 + 构建(fresh evidence + PRE-EXISTING);`grep` 同类模式查潜伏 bug
6. **独立评审(可选)** —— 触及核心逻辑/跨多文件时派发 `ql-reviewer` 轻量评审(`--no-review` 跳过)
7. **留档** —— `.planning/bugfix/NNN-<slug>.md` + 章节变更日志追加(不推进 `current_phase`)

新文件:`skills/ql-fix/SKILL.md`、`commands/ql-fix.md`、`workflows/fix.md`、`templates/bugfix-report.md`。

#### 3. `/ql-add` 加功能指导(新技能)

往现有器灵项目追加功能,且**文档与代码不脱节**。落点定位是核心:

- **`--at <章节|资源>`** —— 定向指定(如 `--at chapter-02` 或 `--at orders`)
- **留空自动判断** —— 建"资源域 → 章节"映射,按契约证据匹配:唯一匹配直接并入;多候选或全新领域用 `AskUserQuestion` 确认(推荐项在前);Never-Ask 降级取证据最强匹配,全新领域默认新建章节
- 流程:补契约(就地修订 openapi.yaml/event-flow.md,不另建第二份规范)→ 增量构建(协调器波次并行,任务范围仅限新增项)→ 验证 + `ql-reviewer` 独立评审 → 章节同步(§一/§五 追加或新建章节)→ 定位记录存 `.planning/add/NNN-<slug>.md`

新文件:`skills/ql-add/SKILL.md`、`commands/ql-add.md`、`workflows/add.md`。

#### 4. 配套更新

- `scripts/validate.mjs`:校验清单扩至 7 命令 / 9 工作流 / 4 子智能体 / 13 模板;反向依赖规则同步新命名
- `scripts/docsmap.mjs`、`chapter-render.mjs`、`flow-verify.mjs`、`rename.mjs`:产出文案与映射表同步新命名
- README / ARCHITECTURE:循环图改为"三步循环 + 两条旁路",目录结构与差异表更新

### 版本号

- `package.json` / `.zcode-plugin/{plugin,capability,marketplace}.json` / `marketplace.json`:0.6.0 → 0.7.0

## [0.6.0] - 2026-09-12

### 新增:独立评审阶段 + 交付纪律(汲取 compose-next 技能优点)

本轮对照外部技能 compose-next(面向强模型的端到端特性开发编排)做了一次优点汲取,补齐器灵三步循环中"验证之后、交付之前"的质量断层。

#### 1. 独立评审(核心新增)

**问题:** 验证(verification.md)只能证明"实现符合契约",查不出契约本身写错、测试复制生产逻辑、边界处理想错——实现者自查有盲区。

**方案:** 新增第 4 个子智能体 `ql-reviewer`,验证通过后由主会话直接派发(不经协调器):

- **全新上下文**,与实现者零共享记忆;只看规范 + diff + 验证摘要,不含实现者叙事
- 三个独立结论:**契约合规 / 正确性 / 代码库一致性**,每个发现必须附证据(文件:行号或亲测命令输出)
- 裁定 `approved | criticals_found`;critical 阻断交付,定向修复后复审(最多 2 轮);两轮不收敛即报告僵局交用户决定,不强行通过
- 纪律:已 PASS 的重型命令不重跑;缺证据用最廉价命令补;worker 报告当 claim 不当事实

**新文件:** `agents/ql-reviewer.md`、`workflows/review.md`、`templates/review.md`。

`/ql-build` 由三阶段变四阶段:骨架 → 填充 → 验证 → **独立评审**;产出新增 `.planning/build/review.md`。

#### 2. Fresh evidence 验证纪律

- 每条验证命令记一行:命令 + PASS/FAIL/**PRE-EXISTING**(基线已知失败单独标注,不冒充本次通过)
- 状态 `passed` 前不得宣称完成;主会话须**亲自复核**关键命令(至少测试 + 构建)才采信协调器的报告
- **验证与评审严格串行**:所有验证命令退出后才派发评审,评审期间不并行跑重型测试

#### 3. Worktree 所有权门控

- worker worktree 基于**当前特性分支**,绝不基于 main/master;分支由 `/ql-build` 开始时自动创建并记录到 STATE(`work_branch` + `base_sha`,后者是评审 diff 锚点)
- 检测已处于 linked worktree(`git-dir` ≠ `git-common-dir`)时沿用当前工作区,**禁止嵌套** `git worktree add`
- 协调器派发 worker 的任务描述必须**自包含**(工作区路径/任务/验收标准/相关规范片段/验证要求),绝不传会话历史

#### 4. 交付不自动收尾(`/ql-ship` 行为变更)

- 前置检查新增:`review.md` verdict === "approved"
- 推送与创建 PR 是对外动作,改为呈现 branch/base/head/文档路径后由用户选:**创建 PR(推荐)/ 仅推送 / 保留本地**
- PR 正文新增:评审裁定、遗留 non-critical(供人工评审参考)、经验教训(旅程日志 ≤5 条)
- 补充 worktree 陷阱:merge/`gh pr merge` 须从主仓库 checkout 执行;清理只允许删 `.git/ql/worktrees/`

#### 5. 讨论先勘察 + Never-Ask 降级(`/ql-discuss`)

- **Orient:** 提问前先读 package.json/README/近期提交,技术栈、领域命名、当前方向直接采用,不问环境已能回答的问题
- **Never-Ask:** `AskUserQuestion` 不可用或被拒时,仅对该决策自决(证据支持的推荐项/最小范围项,绝不自批破坏性操作并说明理由);仅对该决策有效,后续照常提问
- 契约已存在时**就地修订** openapi.yaml/event-flow.md,不另建第二份规范

#### 6. 状态与恢复

- STATE 模板新增 `work_branch`、`base_sha` 字段,status 枚举增加 `reviewed`
- STATE 新增**恢复指令**:上下文压缩/会话恢复后必须先重新加载对应技能再续跑,不凭记忆继续
- 构建/验证模板新增"旅程日志"(≤5 条死胡同/转向/可迁移教训),随 PR 正文交付

### 版本号

- `package.json` / `.zcode-plugin/{plugin,capability}.json` / `marketplace.json`:0.5.4 → 0.6.0

## [0.5.4] - 2026-08-31

### 修复:`/ql-docsmap` 重复运行产生同名文档

**问题:** 在本项目中连跑两次 `npm run docsmap`,产生两个 slug 完全相同、仅章节 ID 不同的文档(如 `chapter-01-qiling-zcode-workflow.md` 与 `chapter-02-qiling-zcode-workflow.md`)。docsmap 是项目初始化入口,每个项目只应该有一份快照。

**根因:** 旧脚本逻辑"现有最大章节号 + 1"——无 slug 去重,所以每次都生成新 ID。

**附带 Bug:** README 中已存在的 `docsmap_init: true` 章节被错误标记为 `/ql-chapter`(index 更新只判断 ID,不读 frontmatter)。

### 新行为

| 触发 | 行为 |
|------|------|
| `npm run docsmap`(无 flag) | 若同 slug 章节已存在,**报错退出**(exit 1) |
| `npm run docsmap -- --force` | 覆盖现有同 slug 章节(保留 ID,只重写内容) |

### 错误信息

```
❌ 章节已存在: chapter-01-qiling-zcode-workflow.md
   本命令是项目初始化入口,每个项目只生成一份文档快照。
   若要重新扫描(项目结构大改后),加 --force:
     npm run docsmap -- --force
```

### 改进

- `scripts/docsmap.mjs`:
  - 新增 `--force` flag 解析
  - 按 slug 匹配已存在章节(替代纯 ID 自增)
  - 拒绝重复时给清晰指引
- README 来源判断修复:读每个章节 frontmatter 的 `docsmap_init: true`,准确标记 `/ql-docsmap` 或 `/ql-chapter`

### 验证证据

| 场景 | 结果 |
|------|------|
| `npm run docsmap`(首次) | ✅ 9/9 通过 |
| `npm run docsmap`(重复) | ❌ **拒绝**(exit 1,无新文件生成) |
| `npm run docsmap -- --force` | ✅ 9/9 通过,只覆盖 chapter-01 |
| 最终 `.qiling/docs/chapters/` | **仅 1 个文件**(chapter-01) |

### 版本号

- `package.json` / `.zcode-plugin/{plugin,capability}.json` / `marketplace.json` (根+镜像):0.5.3 → 0.5.4

## [0.5.3] - 2026-08-31

### 修复:Zcode 插件市场 manifest 缺失

**问题:** `zcode plugin install 075dev/qiling` 报错 `Marketplace manifest not found in git repo`。

**根因:** Zcode 加载 git 仓库作为插件源时,要求仓库**根目录**有 `marketplace.json`(参照 claude-plugins-official 与 zcode-plugins-official 的官方格式)。本仓库之前只有 `.zcode-plugin/{plugin,capability}.json`,缺少根级 `marketplace.json`。

### 新增

- `marketplace.json`(仓库根)—— Zcode 插件市场 manifest:
  - `name`: `qiling-marketplace`
  - `owner`: 指向 075dev
  - `plugins[]`: 1 个 plugin(`qiling`,`source: "./"`)
- `.zcode-plugin/marketplace.json`(镜像副本,部分运行时可能从隐藏目录读取)

### 改进

- `scripts/validate.mjs` 同步:新增 `marketplace.json` 存在性 + 必填字段校验(name/plugins[0].name/source)
- `package.json` / `.zcode-plugin/plugin.json` / `.zcode-plugin/capability.json` 版本号 0.5.2 → 0.5.3

### marketplace.json 关键字段

```json
{
  "name": "qiling-marketplace",
  "owner": { "name": "ZcodePlugin", "url": "..." },
  "plugins": [
    {
      "name": "qiling",
      "source": "./",   // 本地路径模式(自托管仓库)
      "version": "0.5.3",
      "category": "workflow",
      ...
    }
  ]
}
```

### 安装(修复后)

```bash
zcode plugin install 075dev/qiling
# Zcode 读取 marketplace.json → plugins[0].source = "./" → 加载整个仓库
```

### 验证证据

| 验证 | 结果 |
|------|------|
| `npm run validate` | ✅ 0 错误 |
| `npm run verify:flow` | ✅ 20/20 |
| `npm run chapter:render` | ✅ 9/9 |
| `npm run docsmap` | ✅ 9/9 |
| `npm run verify:schema` | ✅ 通过 |

## [0.5.2] - 2026-08-31

### 重大变更:重构为纯 Zcode 插件格式

**问题:** 仓库原使用 GSD Core 的 `capabilities/zcode/{plugin,capability}.json` 嵌套格式,Zcode 插件市场**无法识别**(Zcode 期望 `.zcode-plugin/plugin.json` 作为市场元数据入口)。

**修复:** 迁移至纯 Zcode 插件格式:

| 项 | 旧路径 | 新路径 |
|----|--------|--------|
| 插件清单 | `capabilities/zcode/plugin.json` | `.zcode-plugin/plugin.json` |
| 运行时配置 | `capabilities/zcode/capability.json` | `.zcode-plugin/capability.json` |
| npm main | `capabilities/zcode/plugin.json` | `.zcode-plugin/plugin.json` |
| engines | `gsd:>=0.4.0` | `ql:>=0.5.0` |

### 新增

- `.zcode-plugin/plugin.json` —— Zcode 插件市场元数据(name, version, author, license, keywords, skills, commands, agents, workflows, templates, category=workflow)
- `.zcode-plugin/capability.json` —— 运行时适配配置(id=zcode, role=runtime, artifactLayout 等)

### 改进

- `scripts/validate.mjs` 同步:`capabilities/zcode/*` → `.zcode-plugin/*`
- `package.json` main 字段同步
- `README.md` 顶部新增"安装"段(3 种安装方式 + 5 个命令清单)
- `docs/ARCHITECTURE.md` 目录树同步
- `CHANGELOG.md` 历史项标注已迁移

### 删除

- `capabilities/zcode/plugin.json`(已迁移)
- `capabilities/zcode/capability.json`(已迁移)
- `capabilities/` 目录(整个删除)

### 安装指引

```bash
zcode plugin install 075dev/qiling
# 或
zcode plugin install https://github.com/075dev/qiling
```

### 版本号

- `package.json`:0.5.0 → 0.5.2
- `.zcode-plugin/plugin.json`:0.5.0 → 0.5.2
- `.zcode-plugin/capability.json`:0.4.0 → 0.5.2

## [0.5.0] - 2026-08-28

### 新增功能:`/ql-docsmap` 文档树生成

参考 GSD `map-codebase` 设计,但**产出与 `/ql-chapter` 完全一致格式的文档树**——根据用户决策"结构一模一样才能让工作流最顺畅"。

### 核心定位

| 命令 | 触发 | 数据来源 | 文档树角色 |
|------|------|----------|----------|
| `/ql-docsmap` | 项目初始化 / 接手项目 / 文档树刷新 | **目录扫描**(package.json scripts / 路由 / 事件) | **首章节**(init) |
| `/ql-chapter` | qql-ship 完成后 | OpenAPI + 构建/验证报告 | 后续章节 |

**两者产出布局完全相同**:`.qiling/docs/README.md` + `.qiling/docs/chapters/chapter-NN-*.md`,索引**共享一份**,增量 append。

### 新增

- `commands/ql-docsmap.md` —— 文档树生成命令(支持 `--path`、`--refresh`、`--merge`)
- `skills/ql-docsmap/SKILL.md` —— 文档树技能定义
- `workflows/docsmap.md` —— 文档树工作流(与 chapter 工作流平行)
- `scripts/docsmap.mjs` —— 真实渲染器(端到端,9/9 断言通过)

### 与 GSD map-codebase 的差异

| 维度 | GSD map-codebase | ql-docsmap |
|------|-----------------|------------|
| 产出 | 7 份独立分析报告(STACK/ARCHITECTURE/CONCERNS 等) | 1 章节文档(5 节结构)+ 索引更新 |
| 索引 | 各自独立 | 与 ql-chapter 共享 `.qiling/docs/README.md` |
| 增量 | 整批重建 | 章节 ID 自动从现有最大值 + 1,append |
| 与开发流关系 | 独立产出 | 与 ql-chapter 共用同一文档树 |

### docsmap 提取项(从代码扫描)

- `package.json` 的 scripts(命令清单)
- 路由:`*.routes.*` / `*.router.*` 中的 `app.get/post/put/delete(...)`
- 事件:`*.event.*` / `*.emitter.*` 中的 `emit('user.created')` 等
- 目录树(深度 4,忽略 node_modules / dist / build / .git / .qiling / .planning)

### 7 项端到端断言

| # | 断言 | 结果 |
|---|------|------|
| 1 | 章节文件 ≥ 1 KB | ✅ 3706 字节 |
| 2 | 端点/能力表 ≥ 1 行 | ✅ 1 行 |
| 3 | 目录树图含真实路径 | ✅ |
| 4 | 索引含 chapter 链接 | ✅ |
| 5 | 5 节结构完整(与 ql-chapter 一致) | ✅ |
| 6 | 无未替换占位符 | ✅ |
| 7 | 与 templates/chapter.md 结构对齐 | ✅ 3 关键节标题一致 |

### 改进

- `scripts/validate.mjs` 同步:`expectedCommands` 增加 `ql-docsmap`、`requiredWorkflows` 增加 `docsmap.md`、新增 `scripts/docsmap.mjs` 存在性校验
- `package.json` 新增 npm script `docsmap`、版本号 0.4.1 → 0.5.0

### 验证证据

| 验证 | 结果 |
|------|------|
| `npm run validate` | ✅ 0 错误 1 警告,5 commands / 6 workflows / 11 templates |
| `npm run verify:flow` | ✅ 20/20 |
| `npm run chapter:render` | ✅ 9/9 |
| `npm run docsmap` | ✅ **9/9** |
| `npm run verify:schema` | ✅ 通过 |

## [0.4.1] - 2026-08-28

### 新增:端到端章节渲染验证

`0.4.0` 引入了章节留档模板与工作流,但仅由模板字段名检查覆盖,缺乏"OpenAPI → 章节"的真实渲染证据。本版本补上端到端渲染管线与 7 项断言,使"详细 API"与"详细开发流程"两项能力要求可证。

### 新增

- `scripts/chapter-render.mjs` —— 真实章节渲染器:
  - 读取 `templates/openapi-spec.yaml`(真实 OpenAPI)解析 paths / schemas / 错误响应
  - 模拟 `.planning/build/{skeleton,fill,verification}-report.md` 与 `STATE.md`、`git-log.txt`
  - 产出 `.tmp/chapter-render/chapter-01-demo.md`(271 行/6.2 KB)与 `.tmp/chapter-render/README.md`(31 行)
  - 自动生成 curl / TypeScript / Python 使用示例(从真实 OpenAPI 路径)
  - 端点表、数据模型、错误码表、流程留档均从真实数据填充

### 7 项断言

| # | 断言 | 真实结果 |
|---|------|----------|
| 1 | 端点表行数 ≥ 1 | 5 行(2 个 GET /resources 路径 + 3 个 /resources/{id} 方法) |
| 2 | curl 示例非占位 | 5 条全部含真实路径(`/resources`、`/resources/{id}`)|
| 3 | 数据模型 ≥ 1 | 8 个 schema(Resource / ResourceCreate / ResourceUpdate / Error / 4 错误响应) |
| 4 | 错误码 ≥ 1 | 4 个错误响应(BadRequest / NotFound / Conflict / InternalError) |
| 5 | 流程留档含真实波次 | 波次数 = 1(从 skeleton-report 提取) |
| 6 | 索引含章节链接 | `./chapter-01-demo.md` 链接存在 |
| 7 | 无未替换占位符 | `[N]` / `[M]` / `[K]` / `[hash]` 等 0 处 |

### npm scripts 接入

- `npm run chapter:render` —— 端到端章节渲染
- `npm run verify:flow` —— 三步循环模拟
- `npm run verify:schema` —— config.json schema 校验

### 改进

- `scripts/validate.mjs` 同步:新增 `scripts/{chapter-render,flow-verify,jsonschema-check}.mjs` 存在性校验 + `docs/CHAPTER-ARCHITECTURE.md` 存在性校验
- `package.json` 同步:版本号 0.4.0 → 0.4.1,新增 4 个 npm scripts

### 验证证据

| 验证 | 结果 |
|------|------|
| `npm run validate` | ✅ 0 错误 1 警告(三步循环语义提示) |
| `npm run verify:flow` | ✅ 20/20 通过 |
| `npm run chapter:render` | ✅ **9/9 通过**(端到端) |
| `npm run verify:schema` | ✅ 通过 |

### 版本号

- `package.json`:0.4.0 → 0.4.1

## [0.4.0] - 2026-08-28

### 新增功能:章节留档(`/ql-chapter`)

**核心思想:** 不以任务留档,而以章节留档。一个 ql 循环(讨论→构建→交付)= 一个章节。章节文档既是项目开发流程留档,也是该阶段 API 的开发者文档。

### 新增

- `commands/ql-chapter.md` —— 章节生成命令(支持 `--preview`、`--regenerate-all`)
- `workflows/chapter.md` —— 章节生成工作流实现
- `skills/ql-chapter/SKILL.md` —— 章节技能定义
- `templates/chapter.md` —— 章节文件模板(含 5 节结构)
- `templates/chapter-index.md` —— `.qiling/docs/README.md` 索引模板
- `docs/CHAPTER-ARCHITECTURE.md` —— 章节留档架构说明
- 章节生成跳接:`workflows/ship.md` 末尾追加"步骤 2.5 生成章节留档",自动调用 `/ql-chapter`

### 章节产出布局

```
.qiling/                                    # 章节留档根目录
├── README.md                               # 章节索引(门户型文档)
└── docs/
    └── chapters/
        ├── chapter-01-user-center.md       # 第 1 章
        ├── chapter-02-order-center.md      # 第 2 章
        └── chapter-NN-*.md                 # ...更多
```

### 章节文件结构

- §一 **API 详细文档**(端点 + schema + 错误码 + 使用示例:curl/TS/Python)
- §二 **开发流程留档**(阶段时序图 + build 报告摘要 + git 历史)
- §三 **与上一章节对比**(新增/修改/删除的 API + 迁移指南)
- §四 **关联文档链接**
- §五 **变更日志**

### 触发时机

- 默认:`/ql-ship` 完成后自动调用 `/ql-chapter`
- 手动:`/ql-chapter` 独立触发
- 模板变更后:`/ql-chapter --regenerate-all` 批量重生

### 改进

- `scripts/validate.mjs` 同步:`expectedCommands` 增加 `ql-chapter`、`requiredWorkflows` 增加 `chapter.md`、`requiredTemplates` 增加 `chapter.md` 与 `chapter-index.md`
- `scripts/flow-verify.mjs` 扩展:新增 8 项章节生成门控(章节 ID、§一/§二结构、索引链接等),从 12/12 提升至 **20/20**

### 版本号

- `package.json`:0.3.0 → 0.4.0
- `capabilities/zcode/plugin.json`(已迁移至 `.zcode-plugin/plugin.json`):0.3.0 → 0.4.0
- `capabilities/zcode/capability.json`(已迁移至 `.zcode-plugin/capability.json`):0.3.0 → 0.4.0,engines.gsd:>=0.3.0 → >=0.4.0

## [0.3.0] - 2026-08-28

### 重大变更
- **品牌重命名:** 插件从 `zcode-gsd-workflow` 改名为 **器灵**(英文 `qiling`)
- **命令前缀:** `zgsd-*` → `ql-*`(如 `/ql-discuss`、`/ql-build`、`/ql-ship`)
- **子智能体前缀:** `zgsd-discuss-coach` → `ql-discuss-coach` 等
- **worktree 路径:** `.git/zgsd/worktrees` → `.git/ql/worktrees`

### 修复(来自 P1 缺口)
- **P1-1 修复:** `capability.json` 中 `localConfigDir` 改为 `.planning`、与全局 `.zcode` 区分;`artifactLayout.local` 不再与 `global` 重复,改为本地模板/状态专用布局
- **P1-2/3 修复:** 子智能体文件名统一为连字符 `ql-*`,消除原 `_`/`-` 混用
- **P1-4 修复:** `capability.json` 引用的两个 converter 已补实现:
  - `scripts/convertClaudeCommandToClaudeSkill.mjs`
  - `scripts/convertClaudeAgentToZcodeAgent.mjs`
- **P1-5 修复:** `commands/ql-discuss.md` 的 `requires` 改为 `[ql-ship]`(循环声明,移除反向依赖)
- **P2-7 修复:** 补 `templates/config-schema.json`(Draft-07),`config.json` 的 `$schema` 引用可解析
- **P2-9 修复:** `installSurface` 改为 `declarative-full`,与完整 `artifactLayout.local` 自洽
- **P2-11 修复:** README/ARCHITECTURE 中目录树、示例统一为 `ql-*`

### 新增
- `scripts/rename.mjs` 一次性改名脚本(用于未来批次重命名)
- `scripts/convertClaudeCommandToClaudeSkill.mjs`(Claude 命令→Skill 转换器)
- `scripts/convertClaudeAgentToZcodeAgent.mjs`(Claude Agent→Zcode Agent 转换器)
- `templates/config-schema.json`(JSON Schema for config.json)
- `LICENSE`(MIT)
- `CHANGELOG.md`(本文档)
- `.gitignore`

### 改进
- `scripts/validate.mjs` 强化校验:
  - 同时识别 `ql-<kebab>` 与 `ql_<snake>` 两种命名变体
  - 校验 `parallelization.wave_timeout_minutes` / `worker_timeout_minutes` / `worker_retry_count` / `merge_strategy` 字段
  - 校验 `templates/config.json` 的 `$schema` 引用存在
  - 校验 `capability.json` 的 `converter` 引用可在 `scripts/` 下找到实现
  - 校验 `commands/zgsd-discuss.md`(现已重命名)不应依赖构建命令

## [0.2.0] - 之前

- 初次发布 `zcode-gsd-workflow` 插件骨架
- 三命令循环(讨论→构建→交付)
- 3 个子智能体(discuss-coach + builder-coordinator + builder-worker)
- 4 个工作流(discuss / build-skeleton / build-fill / ship)
- 8 个工件模板
- Walking Skeleton + 波次并行策略

---

## 命名约定(0.3.0 起固定)

- 插件名:`器灵` (英文 `qiling`,npm 包 `@qiling/zcode-workflow`)
- 命令前缀:`ql-`(如 `ql-discuss`、`ql:discuss`、`ql-builder-coordinator`)
- worktree 路径:`.git/ql/worktrees/`
- 分支命名:`ql/wave-<N>/<task-id>`
- 状态机版本键:`ql_state_version: '1.0'`

不要回退到 `zgsd-*` 前缀,以保持仓库内一致。