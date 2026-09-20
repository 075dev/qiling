# 器灵工作流 CHANGELOG

所有对插件的显著变更都记录在此文件。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)。
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [0.16.0] - 2026-09-20

### 修复与增强:真实项目全链路反馈落地(vscode-ue-helper 走通 update → scan → next → design → build)

**背景:** 在 VSCode 插件项目(27 命令 + 9 MCP 工具,非 HTTP 服务型)上完整走通器灵链路:36/36 端点对齐契约、测试 1249→1312 全绿、评审首轮 approved。协作骨架经受住了考验(决策轨迹注入、progress 台账断点续跑、自包含任务卡、双门各抓真问题),但暴露五类问题,本版全部落实。

**P1 派发通道门控(子代理派发断裂时协调器自行降级外部 CLI,浪费约 1 小时):**

- **协调器新增步骤 0「派发通道门控」**:启动先探测 Agent 工具里 `ql-builder-worker` 类型是否真实可用;不可用 → 立即返回 `DISPATCH_CHANNEL_UNAVAILABLE` 并停止。**铁律:禁止自行降级到外部 CLI/子进程派发(`--yolo` 类无人值守通道尤其禁止)、禁止改为亲自实现**——唯一合法动作是停止 + 报告,由主会话决策(改内联/换宿主)
- **`workflows/build-skeleton.md` runtime_compatibility 重写为「宿主上下文可用性矩阵」**:主会话可派 coordinator/reviewer;协调器可派 worker **当且仅当宿主把该类型暴露给子代理上下文**(部分宿主只在主会话暴露,子代理不继承);worker/reviewer 是叶子角色
- 主会话派发协调器的任务卡(skeleton 与 fill)新增**派发通道**字段,通道约定显式写进任务;`docs/PARALLELIZATION.md` 新增「宿主上下文可用性(派发前先读)」章节

**P2 迁移引擎对残缺 `.planning/` 静默通过 + ql-next/ql-update 决策循环:**

- **`scripts/migrate.mjs` 新增核心工件完整性检查**:有 `.planning/` 但缺 STATE.md / config.json(常见:只用过 /ql-fix、/ql-add 旁路技能,主线未初始化)→ 显式警示块列出缺失项与补建指引,**不再输出裸"✅ 无需迁移"**;自测新增场景 4(仅旁路工件)与场景 5(仅缺 config),13 → 17 项断言
- **`workflows/next.md` 决策表 15 → 17 行**:新增「有 .planning/ 但无 STATE.md」(→ /ql-design 或 /ql-scan,**明确不指向 /ql-update**——迁移不代建核心工件,指过去只会空转)与「STATE.md 存在但无 config.json」(→ 从模板复制 + /ql-update 补字段)两个形态;原「无 ql_version 锚点」行限定为 STATE.md 存在的情形,消除循环;磁盘盘点纳入 config.json

**P3 非 HTTP 项目一等公民支持(全流程默认假设 HTTP 服务型):**

- **`workflows/design.md` 勘察新增「项目形态判定」**:HTTP 服务型(缺省,契约直译)| 非 HTTP 型(插件/CLI/MCP 工具/库,按转译表落字段);**步骤 3 新增契约转译表**:servers→宿主与入口(vscode://<id> / bin://<cmd> / mcp://<server>)、paths→能力标识、动词→操作语义、responses→返回值与错误通道、认证→宿主权限模型、分页/速率限制不适用即省略;`info.description` 首行声明"非 HTTP 项目,契约字段按转译表理解"
- **冻结门新增「棕地检测」**:契约项在存量代码中已有实现 → 必须在 decisions.md 落 spec-as-is 决策;`templates/openapi-spec.yaml` 头部注释补转译说明
- **构建侧「实现基线」贯通**:greenfield(缺省,骨架=最小 mock)| brownfield(spec-as-is:对齐存量实现,禁止 mock 化/重写)——build-skeleton 步骤 0 判定并写进派发任务卡,协调器逐字透传,worker 按基线分流实现与验收标准(棕地 = 存量不回归 + 契约缺口补齐)
- **`scripts/docsmap.mjs` 提取器扩展**:事件新增 VSCode `EventEmitter.fire` 惯例(`this._onDidX.fire()` → 事件 `onDidX`);新增**命令/工具注册**提取(`registerCommand` / MCP `server.tool` / CLI `program.command`,章节新增 §一.4);新增 **`--patterns` 自定义提取器**(JSON 配置补项目特有注册风格,§一.5);frontmatter/摘要/断言 2/3 同步覆盖(端到端实测:events=1、commands=2、custom=1,12 断言全绿)

**P4 worker 验证清单缺 lint + 共享接口变更多 worker 各自绕行:**

- **worker 标准验证改为从 package.json scripts 自动探测**:test / typecheck / lint / build 存在即必须跑、全绿才算完成——**存在而没跑 = 未完成**(42 个 lint error 拖到验证阶段才暴露、整波回炉,是这条缺失的学费);协调器任务卡第 9 项同步
- **协调器新增「共享依赖面分析」**(波次划分后、派发前必做):Produces 被 ≥2 个后续任务 Consumes 的共享接口(dispatch 签名、公共 Envelope 类型等)→ 定稿前移 Wave 1 显式产出并声明 `shared_interface`,或拆独立"接口定稿"任务;分析结果写进阶段报告供评审核对(多 worker 各自 `as unknown as` 绕行的消解不再靠运气)

**P5 三项小修:**

- `/ql-design` 步骤 1 顺手落默认 config.json(缺失时从模板复制)——build 派发决策门从此读到真实配置而非永远走兜底默认
- **SKILL.md 相对路径修正 11 处**:`@../workflows/` → `@../../workflows/`(skills/ql-x 的上一级是 skills/ 而非插件根,原路径解析落空);顺带修正 `workflows/add.md` 的 `@../review.md` 断链与 `build-fill.md` 的绕行引用为同目录 `@review.md`
- **协调器清理改为「清理回执」**:`git worktree list` / `ls .git/ql/worktrees/` / `git branch --list "ql/wave-*"` 三查**实测输出全空**才可声明"已清理",输出附进阶段报告;主会话验证清单同步为亲自复核

**配套:** README 关键机制表 12 → 15 行(新增派发通道门控、实现基线、非 HTTP 项目支持;依赖分析/Worktree 隔离/Worker 上下文三行补新语义);版本五处同步 0.16.0。

**验证:** `npm run migrate:test` 17/17;docsmap 扩展提取器端到端 12/12 断言(临时插件项目实测 fire / registerCommand / createTreeView 自定义提取);`npm run validate`、`verify:flow`、`verify:schema`、`chapter:render` 全套通过。

## [0.15.0] - 2026-09-19

### 新增:`/ql-update` 升级迁移 + validate 自描述断言——插件升级后的工件一键迁移

**问题:** 器灵本身迭代很快(0.9→0.14 五个版本引入 ledger 三态、决策轨迹、内联阈值等工件格式变化),但用户项目里的 `.planning/` 工件是初始化时从模板复制的快照——插件升级后旧项目永远停在旧格式:config.json 没有 `inline_threshold`,构建静默走默认值;STATE.md 无版本记录,连"这个项目是不是旧的"都无法判断。0.12→0.14 收尾时发现的 capability.json 版本漏 bump、README 模板计数错,也暴露了插件自身文档的同类漂移。

**一、`/ql-update` 升级迁移(第 9 个核心命令)**

- **架构:脚本管确定性,工作流管编排。** 机器可判定的变化由新引擎 `scripts/migrate.mjs` 执行(幂等、可测试);需要理解的差异(历史报告结构、章节文档滞后)由工作流转述建议,不代改
- **迁移规则注册表(`MIGRATIONS`,当前 4 条):**
  - M1(0.14.0):config.json 补 `parallelization.inline_threshold: 2`
  - M2(0.15.0):STATE.md frontmatter 写入 `ql_version` 版本锚点——后续升级从特征推断变为精确比较
  - M3(0.10.0,提示类):旧格式 verification.md 缺 `verified_at_commit` → 结论视为 STALE,交付前重跑验证
  - M4(0.12.0,提示类):章节索引"器灵版本"字段滞后 → 建议 `/ql-scan --force`,产物不手改
- **安全网:** 迁移前自动备份 `.planning/` → 项目根 `.planning-backups/.backup-<旧版本>/`;`--dry-run` 只展示计划;`--check` 只判断;**幂等**——重复执行报"无需迁移"
- **用户内容永不触碰:** openapi.yaml、event-flow.md、decisions.md 是契约与决策留档,迁移永不修改;`.qiling/docs/` 是渲染产物,只建议重扫
- **提示类规则的版本门:** 项目锚点 ≥ 规则引入版本即视为已覆盖,不再重复提示(自测曾抓到无版本门时永不收敛的缺陷)
- **自测:** `--self-test` 在临时目录端到端验证 13 项断言(dry-run 不落盘、字段落盘、锚点写入、备份是旧态、幂等、提示触发、温和退出、check 不执行),`npm run migrate:test`

**二、版本锚点机制**

- `templates/state.md` frontmatter 新增 `ql_version` 字段(模板注释声明:ql-design 初始化写入、ql-update 维护)
- `workflows/design.md` 步骤 1 初始化 STATE 时写入当前插件版本(无法确定时省略,由 ql-update 补写)
- `workflows/next.md` 决策表新增第 6 行:有 `.planning/` 且 STATE 无 `ql_version` 锚点 → 建议 `/ql-update`(决策表 14 → 15 条)

**三、validate 自描述一致性断言(防插件自身文档漂移)**

- **五处版本号一致**(package.json、marketplace.json、.zcode-plugin/{plugin,marketplace,capability}.json)——正是 0.14 收尾时 capability.json 漏 bump 的事故模式
- **CHANGELOG 最新条目版本 = package.json 版本**
- **README / ARCHITECTURE 目录树与实际目录逐一比对**(templates / workflows / agents;commands 因旧名别名混列不比对)——正是 constitution.md 漏列、workflows 加文件漏同步的事故模式

**四、发版检查单(`docs/RELEASE-CHECKLIST.md`)**

- 机械层(validate 自动拦截)+ 梳理层(AI/人逐项确认:CHANGELOG、README 机制表、迁移规则登记、三件套同步、config 三处同步、决策表核对)分层固化
- 工件格式变更必须登记迁移规则的纪律落进检查单,ql-update 体系随版本演进自我维护

**配套:** README 命令 8 → 9(核心循环 + 2 旁路 + 1 维护)、workflows 10 → 11;ARCHITECTURE 同步;package.json 新增 `migrate` / `migrate:test` scripts。

**验证:** `npm run validate` 通过(自描述断言上线时精确抓住 README/ARCHITECTURE 漏列 update.md 两处,证明有效);`npm run verify:flow` 20 项全绿;`npm run verify:schema` 通过;`npm run chapter:render` 9/9;`npm run migrate:test` 13/13。

## [0.14.0] - 2026-09-15

### 新增:派发决策门——回答"串行任务该在主对话还是子代理执行"

**调研背景:** 提出问题"子代理冷启动有上下文重复读取成本(缓存不命中),不能并行的串行任务是否应该留在主对话执行?"后,克隆并调研了 5 个参考项目(已记录到 [docs/REFERENCES.md](docs/REFERENCES.md),本地克隆于仓库外 `refs/`):obra/superpowers、Fission-AI/OpenSpec、open-gsd/gsd-core、code-yeongyu/oh-my-openagent、Yeachan-Heo/oh-my-claudecode。

**调研结论(五项目从四个方向收敛到同一答案):**

- **"能否并行"不是派发判据**——判据是三问:产物体积(细节会不会烧主对话上下文)、独立性需求(评审/验证必须派)、交互性需求(需用户输入的留主对话)
- **小活一律内联**——superpowers 有实测回撤记录(串行 spec/plan 评审从子代理环改为内联清单,25 分钟 → 30 秒且质量相同);gsd-core 有数值阈值 `inline_plan_threshold`(默认 2,理由明写"省 ~14K token 子代理冷启动开销 + 保 prompt cache");OmO 三条内联豁免(trivially simple / **上下文已全部加载** / 派发开销超过任务复杂度);OmC:"不要为一次专注执行就能完成的工作搭建协调机制"
- **状态传递靠磁盘工件,不靠对话记忆**;评审的独立上下文是功能不是成本(缓存不命中恰是评审公正性的来源);对冲冷启动靠续接与文件,不靠放弃派发

**落地的修改:**

- **`config.json` 新增 `parallelization.inline_threshold`(默认 2)**:端点+事件总数 ≤ 阈值时构建/验证主会话内联执行,不派协调器;设 0 = 总是派发
- **`skills/ql-build` 新增阶段 0"派发决策门"**:派发前三问(产物体积/独立性/交互性)+ 内联阈值 + 反触发条款(单文件小修走 /ql-fix、单功能追加走 /ql-add,"一次专注执行就能完成"的工作不搭协调机制)
- **`workflows/build-skeleton.md` 步骤 0.5**:内联/编排双模式分流——内联模式主会话直接实现骨架(同 worker 标准:特性分支 + base_sha + 原子提交 + 逐端点连通验证),skeleton-report.md 格式与编排模式完全一致,下游不感知模式差异;另加**上下文压力自检**(会话上下文已重时先落盘、提示开新会话续跑,不在腐化上下文里启动编排)
- **`workflows/build-fill.md`**:填充阶段同门槛分流;**验证阶段改为轻量路径优先**——验证是串行流程且主会话反正要亲自复核(fresh evidence),内联模式主会话亲自跑全部验证项直接记 verification.md;编排模式维持派发(gsd-core 的波后合并门同理由 orchestrator 亲自跑,不信 worker 自检)
- **`workflows/review.md` 修复循环新增"续接优先于冷启动"**:修复涉及原 worker 实现区域时优先续接原 worker(其上下文完好:知道任务、代码与实现取舍),会话不可续才派新 worker 并以单端点报告为持久记忆;连续两轮修复同一条 critical 后换全新 worker 冷启动重做(连续失败说明首轮思路错了,原上下文是包袱)(superpowers 同款规则)
- **`agents/ql-builder-worker.md` 回话压缩契约**:回流协调器的信息限四件套结构化短回话(状态/文件与提交/一行验证摘要/报告路径+risks+Completion Notes),详尽内容只落盘报告文件——回话内容会常驻协调器上下文并被反复重读
- **`agents/ql-builder-coordinator.md` 任务卡共享前缀**:同波次任务卡共同部分(全局约束/契约路径)前置且逐字一致、差异部分后置,让并行子代理之间命中 prompt 缓存
- **新增 `docs/REFERENCES.md`**:记录 5 个参考项目(定位/本地路径/借鉴点)与五项目共同结论

**验证:** `npm run validate` 通过;`npm run verify:flow` 20 项全绿;`npm run verify:schema` 通过(含新 inline_threshold 字段)。

## [0.13.0] - 2026-09-15

### 新增:决策轨迹 + 反套路评审——对标 design-blueprint 技能的两项机制移植

调研 `design-blueprint` 技能(先出设计蓝图再动手的视觉设计工作流)后,把其中两个与器灵场景兼容的核心机制移植进来:**决策留痕(Decision Trace)** 与 **反 slop 显式清单**。其余机制(Orient 先勘察再提问、复用优先就地修订、默认假设分流、唯一停顿点)经核对在既有工作流中已有等价实现,不重复引入。

**一、决策轨迹(`.planning/context/decisions.md`,新工件)**

- **问题:** 契约只写"结论",不写"论证过程"——为什么错误模型这样设计、当时否掉了什么,只存在于当轮聊天里。三方因此是瞎子:worker(全新上下文)在契约没规定的细节上瞎猜;评审发现实现与契约不符时分不清"实现错了"还是"契约滞后于决策";/ql-add 补契约时可能静默推翻既有决策
- **新增 `templates/decisions.md`** —— 决策账本模板:每条非显然设计选择落一行(decision / reason / alternatives / tradeoff / status / 日期)。**append-only**:推翻旧决策 = 旧行标 superseded + 新行注明"取代 D-N",禁止删改(与 review.md 处置账本同一纪律)
- **质量三标准(写进模板与工作流):** reason 必须绑定本项目具体细节(不写"更优雅");alternatives 必须是真实考虑过的命名方案(不是稻草人);tradeoff 必须是真代价(不是审美托词)。用户显式指令、宪法条文、无争议实现细节**不 trace**;一轮典型 5~10 条
- **`workflows/design.md` 接入:** 澄清纪律新增"非显然决策即时落痕";契约冻结门新增**决策轨迹检查**——0 条 = 可疑信号(大概率全靠默认假设推进、没做真实权衡),回步骤 2 抽查"看似显然"的选择;结束呈现 active 条数与最关键取舍
- **下游消费全链路:**
  - 协调器(coordinator)加载 decisions.md,每张 worker 任务卡注入**只与该任务相关的 D-N 条目**(防上下文膨胀)——worker 按设计意图补齐契约未规定的细节,不再瞎猜
  - ql-reviewer 评审输入增加决策轨迹,新增裁定规则:实现与契约不符但符合某条决策 → 报"契约滞后于决策"(non-critical);决策同样违反宪法/安全底线时不是免罪牌,照常 critical
  - `/ql-add` 步骤 3:新决策追加编号延续;与既有 D-N 冲突必须走"取代"流程并同步修订契约,**不允许静默推翻**
  - `/ql-fix` 根因分析新增第五个来源"决策轨迹对照":异常行为符合某条决策的取舍 → 可能不是 bug 而是设计如此,修的是契约/文档滞后而非代码
  - `/ql-next` 磁盘盘点纳入 decisions.md 存在性

**二、反套路评审(AI 代码 slop 清单 S1-S8)**

- **问题:** AI 生成的后端代码有稳定的失败模式(不是随机 bug,是同一些套路的反复出现),既有三结论评审未把它们显式化,漏检取决于评审者当轮"想没想到"
- **ql-reviewer 新增 `<slop_patterns>` 清单**(8 条,每条带探测方式与定级):S1 mock 冒充实现 / S2 路由未接线 / S3 吞错误 / S4 全 200 综合征 / S5 契约字段未消费 / S6 测试只测 mock / S7 占位残留 / S8 校验只在文档里
- **清单纪律:** 每条命中照常要证据(清单是注意力路标,不是降级证据要求的借口);报告必须写明扫描结果(命中几条或"全未命中"),做没做可核;按评审档位分层执行(THOROUGH 全量 / STANDARD 扫高发 S1-S4 / LIGHT 抽查)
- **`workflows/build-fill.md`** 验证项新增第 6 条"模板化残留扫描"(可机检的 grep 部分:TODO/FIXME/占位/示例数据字面量);行为级套路留给独立评审
- **`templates/review.md`** 结论二新增套路扫描结果表(inputs 同步登记 decisions.md)

**其余补强:**

- design.md 澄清纪律新增"**被排除的方向不进选项**"——已被宪法/既有契约/仓库事实排除的方案不占用选项位(借鉴 design-blueprint 的"不提议你会不得不撤回的东西")
- `skills/ql-design`、`skills/ql-add`、`skills/ql-build` 描述同步;README 关键机制表新增"决策轨迹""反套路评审"两行;templates 数量 14 → 15,README / ARCHITECTURE 目录树补列 constitution.md(此前漏列)

**验证:** `npm run validate` 通过(工件模板 15 个);`npm run verify:flow` 20 项全绿;`npm run verify:schema` 通过。

## [0.12.0] - 2026-09-13

### 优化:文档树产品化——对标 GitHub 同类项目(GSD map-codebase / RepoAgent / DeepWiki / OpenWiki)的全面严谨性升级

文档树是插件的重中之重。本轮调研 GitHub 同类文档生成项目后,重写 `scripts/docsmap.mjs`(/ql-scan 渲染引擎)并对齐全部模板与工作流,把文档树从"扫描报告"升级为**清晰、严谨、可读性优秀的产品说明书**。

**调研来源与可借鉴点:**

| 项目 | 借鉴了什么 |
|------|-----------|
| GSD map-codebase(open-gsd/gsd-core 1.13.0) | 证据锚点强制(file:line)、"Not detected" 显式声明、`last_mapped_commit` 机器戳(shell 写入防"自信代理"跳过)、密钥扫描硬门控、断言门控、"Where to add new code" 指引、按角色路由 |
| RepoAgent(OpenBMB) | 增量替换思路(对应 `--force` 重扫与 `--update-index` 只重建索引) |
| DeepWiki / deepwiki-open | codemap 式导读(索引"按角色 × 意图"路由表)、Overview 先行 |
| OpenWiki(LangChain) | git 基线打点、过期自查指引 |

**修复的严谨性缺陷(docsmap.mjs 重写):**

- **删除臆造图** —— 旧版启动流程 mermaid 是与项目无关的硬编码假图(A→B→C→D→E);新版只在使用真实检测值(package.json 入口 + start/dev 脚本,文件存在性已校验)时才画图,检不出则显式声明"未检出(Not detected)"+ 原因,断言 8 阻止假图
- **修复路由/事件误报与漏报** —— 旧正则会把 `cache.get('x')`、`map.delete(k)` 误提取为 HTTP 路由;新版按接收者白名单(app/router/server/api + HTTP 动词)限定,单字母接收者额外要求路由语境;每条结果附 `文件:行号` 证据,断言 3 校验锚点数 ≥ 条目数
- **修复文档承诺但代码缺失** —— `workflows/scan.md` 声称的 `--update-index` 参数在旧脚本中不存在;新版实现(只重建索引,不生成章节)
- **新增密钥扫描硬门控** —— 产出文档后正则扫描(sk-/ghp_/AKIA/私钥头/Slack token),命中即失败(断言 9)
- **新增新鲜度机器戳** —— frontmatter 写入 `last_mapped_commit`(git HEAD,由脚本写入而非 agent 自觉);索引页给读者过期自查指引(`git log --oneline <基线>..HEAD`)
- **版本号单一来源** —— 旧脚本硬编码 0.5.0/0.7.0 混乱;新版一律读 package.json(断言 10)

**补全的可读性(产品说明书化):**

- **索引升级为说明书首页** —— 项目定位导读(package.json description)+ "按角色 × 意图"阅读路由表 + 章节列表(状态/来源/API 数/事件数/日期)+ 能力总览 + 新鲜度提示 + 严谨性约定五条
- **章节新增 §二 技术栈/依赖/新代码放哪** —— 语言分布统计表(带占比)、框架/关键依赖推断表(标注"推断")、包管理器、真实依赖清单(旧版只让用户自己跑 `npm ls`)、"新代码放哪"指引表(GSD STRUCTURE.md 的核心价值)
- **目录树不再静默截断** —— 80 项/深度 4 截断时显式提示(共 N 项,显示前 M 项);顶层目录带职责注释并标注"(推断)"
- **未检出内容显式声明** —— 每个扫描节为空时写"未检出(Not detected)"+ 原因 + 建议(如"若使用装饰器路由,请先运行 /ql-design"),不再留空

**断言门控从 7 条升级到 10 条**(新增:无假图、密钥扫描、版本号单一来源;强化:能力清单为空必须显式声明、目录树截断必须提示、证据锚点覆盖)。

**模板与工作流对齐:**

- `templates/chapter-index.md` 重写 —— 与 docsmap.mjs 产出逐节对齐(旧模板与脚本产出存在格式分裂),新增"严谨性约定"节与阅读路由
- `templates/chapter.md` —— frontmatter 新增 `endpoints`/`events` 机器可读字段(供索引汇总),purpose 新增严谨性原则
- `workflows/scan.md` 重写 —— 五条严谨性铁律、断言门控表、`--force`/`--update-index` 用法、漂移提示、同类项目对比表
- `skills/ql-scan/SKILL.md` —— 严谨性五铁律入技能定义(违反任何一条即为缺陷)
- `scripts/chapter-render.mjs` —— 演示渲染 frontmatter 同步 endpoints/events 字段

**验证:** 本项目自扫 12 断言全绿;Express 风格 fixture 验证提取器(`app.get`/`router.post` 带行号提取,`cache.get` 不误报);validate / verify:flow(20 项)/ chapter:render(9 项)/ verify:schema 全部通过。

### 版本号

- `package.json` / `.zcode-plugin/{plugin,capability,marketplace}.json` / `marketplace.json`:0.11.0 → 0.12.0

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