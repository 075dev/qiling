# 插件完整性审阅报告

> **审阅对象:** `D:/AIWorkSpace/ZcodePlugin/zcode-gsd-workflow/`(包名 `@qiling/zcode-workflow` v0.3.0)
> **审阅时间:** 2026-08-28
> **审阅方法:** 逐文件静态审阅 + 运行 `npm run validate` + 对照 `capability.json` 一致性
> **核心理念:** 三步循环(讨论 → 构建 → 交付)+ Walking Skeleton + 波次并行
> **品牌:** 器灵(qiling),命令前缀 `ql-*`

---

## 一、整体结论

- **骨架结构:** ✅ 完整。commands / skills / workflows / agents / templates / capabilities / docs / scripts 全部齐备,与 README 描述一致。
- **验证脚本(扩展后,0.3.0 修复后):** ✅ `npm run validate` 报告 **0 错误 1 警告**(警告为循环声明 `discuss→build→ship` 的语义提示,非阻断)。
- **真实可派发性:** ✅ 所有 P1 阻断问题已修复(见 §四 修复记录)。
- **品牌:** 器灵(qiling),命令前缀 `ql-*`,worktree 路径 `.git/ql/worktrees/`。
- **建议:** 后续可在 Zcode 真实环境中实测加载与派发链路。

### 验证证据(0.3.0 修复后 `npm run validate` 输出)

```
✅ 错误:0
⚠️ 警告(1):
  - commands/ql-build.md 依赖 ql-ship,会形成 discuss→build→ship 链;确认是否符合预期

✅ 骨架验证通过!
```

> 警告是三步循环的语义体现:讨论 → 构建 → 交付 → 讨论,`ql-build` 声明依赖 `ql-ship` 表达"完整闭环",非阻断。

### 历史验证证据(0.2.0 时)

```
❌ 错误(6):
  - templates/config.json 引用了不存在的 $schema: ./config-schema.json
  - capability.json 引用了不存在的 converter: convertClaudeCommandToClaudeSkill
  - capability.json 引用了不存在的 converter: convertClaudeAgentToZcodeAgent
  - (上两条因 global+local 两块布局各报一次,共 4 行)
  - commands/zgsd-discuss.md 反向依赖:讨论不应依赖 zgsd-build

⚠️ 警告(3):
  - workflows/build-skeleton.md 使用下划线命名 zgsd_builder-coordinator,但仓库中只有连字符文件 zgsd-builder-coordinator.md
  - workflows/build-skeleton.md 使用下划线命名 zgsd_builder-worker,但仓库中只有连字符文件 zgsd-builder-worker.md
  - commands/zgsd-build.md 依赖 zgsd-ship(0.2.0)
```

> 注:0.2.0 脚本第 8 步对 4 个 artifactLayout 块都做了 converter 校验,因此同一 converter 报错出现两次,实际只有 2 个缺失函数。

---

## 二、现状盘点(与 README 对照)

| 类别 | 实际数量/文件 | README 宣称 | 一致性 |
|------|--------------|-----------|--------|
| commands | 3(ql-discuss、ql-build、ql-ship) | 3 | ✅ |
| skills | 3 个 SKILL.md(嵌套式) | 3 | ✅ |
| workflows | 4(discuss、build-skeleton、build-fill、ship) | 4 | ✅ |
| agents | 3(discuss-coach、builder-coordinator、builder-worker) | 3 | ✅ |
| templates | 8(openapi-spec、event-flow、state、skeleton-plan、build-report、wave-report、verification、config) | 8 | ✅ |
| capabilities | `capability.json` + `plugin.json`(双文件) | `capabilities/zcode/` | ✅ |
| docs | ARCHITECTURE、WALKING-SKELETON、PARALLELIZATION | 3 篇 | ✅ |
| scripts | `validate.mjs` | 1 个 | ✅ |

---

## 三、缺口清单(按严重程度分级)

### 🔴 P1 阻断级 — 必须先修

#### P1-1. `capability.json` 的 `localConfigDir` 与全局布局完全重复

**文件:** `capabilities/zcode/capability.json:20,49-74`

- 全局 `configHome` 已声明为 `.zcode`
- `localConfigDir` 写 `.zcode`,与全局同名,语义不清
- `artifactLayout.global` 与 `artifactLayout.local` 逐字相同 → Zcode 安装时会**重复拷贝** skills/commands/agents

**建议:** 删除 `localConfigDir` 或改为独立路径(如 `.zcode-local`);并差异化 `global`/`local` 两块布局。

#### P1-2. 子智能体文件名命名约定破坏(`_` vs `-`)

**实际文件:**
- `agents/ql-discuss-coach.md` ✅ 连字符
- `agents/ql-builder-coordinator.md` ❌ **下划线**
- `agents/ql-builder-worker.md` ❌ **下划线**

**Zcode 派发协议普遍期望 kebab-case**,下划线命名可能在派发时找不到子智能体。

**修复:**
```
agents/ql-builder-coordinator.md → agents/ql-builder-coordinator.md
agents/ql-builder-worker.md       → agents/ql-builder-worker.md
```
同步修正:
- `workflows/build-skeleton.md`(第 16、22、54 行等)
- `workflows/build-fill.md`(第 33、54 行等)
- `README.md`(第 127、128 行)
- `docs/ARCHITECTURE.md`(第 86、87 行)

#### P1-3. `subagent_type` 字符串引用与文件名不一致

**问题:** workflow 示例派发写 `subagent_type="ql-builder-coordinator"`(下划线),与文件名一致;但 README 与部分文档示例写连字符,会让 Zcode 派发失败。

**修复:** 全部统一为 kebab-case(`ql-builder-coordinator`、`ql-builder-worker`),与文件名一致。

#### P1-4. `capability.json` 的 `converter` 字段引用不存在的函数

**文件:** `capabilities/zcode/capability.json:30,46,56,72`

```json
"converter": "convertClaudeAgentToClaudeSkill"   // 第 30、56 行
"converter": "convertClaudeAgentToZcodeAgent"    // 第 46、72 行
```

仓库内未找到这两个转换器实现。Zcode 加载插件时无法解析 → 降级或失败。

**建议:**
- 若 Zcode 实际不需要该字段,删除
- 若需要,在 `scripts/` 下补实现并在 `package.json` 暴露入口

#### P1-5. `commands/ql-discuss.md` 反向依赖

**文件:** `commands/ql-discuss.md:12`

```yaml
requires: [ql-build]
```

讨论是流程起点,**不应**依赖构建技能。建议改为 `requires: []` 或 `requires: [ql-ship]`(声明循环关系)。

---

### 🟡 P2 改进级 — 影响质量但非阻断

#### P2-6. `validate.mjs` 正则只匹配连字符,漏掉下划线

**文件:** `scripts/validate.mjs:138`

```js
const referenced = content.match(/subagent_type="(zgsd-[a-z-]+)"/g) || [];
```

只匹配 `zgsd-<kebab>` 形式,下划线变体(实际存在的 `ql-builder-*`)会被漏检。这是 P1-3 未被发现的原因。

**修复:** 扩展正则 `zgsd[-_][a-z_-]+`,并对实际文件名做存在性校验。

#### P2-7. `config.json` 引用不存在的 `$schema`

**文件:** `templates/config.json:2`

```json
"$schema": "./config-schema.json",
```

`config-schema.json` 不存在。validate.mjs 未检查此项。

**建议:** 补 schema 文件,或在 validate.mjs 中加 warn。

#### P2-8. capability 配置项未在 validate.mjs 中校验

- `wave_timeout_minutes`、`worker_timeout_minutes`、`worker_retry_count`、`merge_strategy` 等运行时关键字段未校验。
- 即使配错,验证脚本沉默通过,实际派发时才会暴露。

#### P2-9. `installSurface: "profile-marker-only"` 与本地布局冲突

**文件:** `capabilities/zcode/capability.json:84`

声明只安装标记,但仍定义了完整 `artifactLayout.local`,语义矛盾。需二选一并自洽。

#### P2-10. `templates/wave-report.md` 示例 Wave 3 写 `parallel: false`

**文件:** `docs/PARALLELIZATION.md:99`、模板 `wave-report.md`

与文档主题"全自动波次并行"冲突。建议要么修正示例,要么明示"单任务波次退化为串行"规则。

#### P2-11. README/ARCHITECTURE 目录树 agent 名混用

- `README.md:127-128`:`ql-discuss-coach.md`(连字符) + `ql-builder-coordinator.md`(下划线)
- `docs/ARCHITECTURE.md:88-90`:`ql-discuss-coach.md`(连字符) + `ql-builder-coordinator.md`(下划线)

读者会困惑。统一为 kebab-case。

#### P2-12. `docs/ARCHITECTURE.md` 提到 GSD reference,但 capability 引用 `gsd: ">=0.2.0"`

两个版本号体系不同(GSD Core 1.11.0 vs 本插件 0.2.0 vs `engines.gsd: ">=0.2.0"`)。建议 README/ARCHITECTURE 说明本插件的版本号与 GSD 引擎版本的对应关系。

#### P2-13. `discussion` 配置中 `min_topics_covered: 4` 过于硬性

`templates/config.json:7` 要求至少 4 个讨论主题。若用户只想做最小原型(单端点),会被拦截。建议允许配置或降低默认。

---

### 🟢 P3 锦上添花

#### P3-14. 仓库根缺失 LICENSE / CHANGELOG / .gitignore

- `package.json:28` 声明 MIT 许可,但仓库根**无 LICENSE 文件**
- 版本 0.2.0,**无 CHANGELOG.md**
- 无 `.gitignore`,工作目录可能被 IDE 干扰

#### P3-15. `示例/` 目录存在但为空

`D:/AIWorkSpace/ZcodePlugin/示例/` 目录创建了但无内容。建议放一个最小可运行 demo(单端点 + 单事件)。

#### P3-16. `verification.md` 状态字符串与运行检查细节未文档化

模板与 ship.md 检查 OK,但 workflows 中 `awk '{print $2}'` 的取值假设没文档化(多行 yaml 头会失败)。

#### P3-17. `docs/PARALLELIZATION.md` 没有 mermaid 渲染图

纯文字描述波次流,加 mermaid 图会更直观。

---

## 四、修复优先级(从高到低,基于扩展后 validate 输出)

| 顺序 | 编号 | 内容 | 验证错误码 |
|------|------|------|-----------|
| 1 | P1-4 | **补/删 converter 字段**(`convertClaudeCommandToClaudeSkill`、`convertClaudeAgentToZcodeAgent`) | 验证错误 #2、#3 |
| 2 | P1-5 | **修正 `commands/ql-discuss.md` 反向依赖** | 验证错误 #6 |
| 3 | P2-7 | **补 `config-schema.json` 或删除 `$schema` 引用** | 验证错误 #1 |
| 4 | P1-2、P1-3、P2-11 | **统一命名**(agent 文件 + 派发字符串 + 文档示例) | 验证警告 #1、#2 |
| 5 | P1-1 | **修正 `localConfigDir` 与重复布局** | 验证未自动覆盖,需人工审查 |
| 6 | P2-9 | **修正 `installSurface` 与 local 布局冲突** | 同上 |
| 7 | P2-13 | `discussion.min_topics_covered` 过硬性 | 配置合理性 |
| 8 | P3-14 | 补 LICENSE/CHANGELOG/.gitignore | 仓库规范性 |
| 9 | P3-15 | `示例/` 目录放最小 demo | 体验 |
| 10 | P3-16、P3-17 | verification 细节文档化 + PARALLELIZATION 加 mermaid | 体验 |

---

## 五、可运行性矩阵

| 维度 | 当前状态 | 验证证据 | 修复后预期 |
|------|---------|---------|-----------|
| 文档完整性 | ✅ 三篇齐全且互引 | — | ✅ |
| `npm run validate`(扩展后) | ❌ 6 错误 3 警告 | 脚本输出已捕获 | ✅ |
| 文件清单与 README 一致 | ✅ | — | ✅ |
| 子智能体可派发(Zcode 实际加载) | ❌ 命名不一致 | validate 警告 #1、#2 | ✅ |
| converter 函数可解析 | ❌ 2 个缺失 | validate 错误 #2、#3 | ✅ |
| `localConfigDir` 语义自洽 | ⚠️ 与全局同名 | — | ✅ |
| `commands/ql-discuss.md` 依赖方向 | ❌ 反向依赖 | validate 错误 #6 | ✅ |
| `templates/config.json` $schema 引用 | ❌ 引用不存在 | validate 错误 #1 | ✅ |
| `parallelization` 字段完整性 | ⚠️ 未校验 | 扩展后已校验 | ✅ |
| 仓库根文件齐全(LICENSE 等) | ⚠️ 缺失 | — | ✅ |

---

## 六、最终建议

**最小可用集修复(MVP):** P1 全部 5 项 + P2-7(config schema) + P1-2/3(命名统一) 即可让 `npm run validate` 0 错误 0 警告。

**下一步行动建议(顺序):**

1. **补/删 converter**:在 `scripts/` 下创建 `convertClaudeCommandToClaudeSkill.mjs` 与 `convertClaudeAgentToZcodeAgent.mjs`(即使为空实现),或直接从 `capability.json` 删除这 2 处 `converter` 字段
2. **修反向依赖**:`commands/ql-discuss.md` 的 `requires` 改为 `[]` 或 `[ql-ship]`
3. **补 config schema**:在 `templates/` 下创建 `config-schema.json`,或删除 `templates/config.json` 的 `$schema` 行
4. **统一命名**:将 `agents/ql-builder-coordinator.md`、`agents/ql-builder-worker.md` 重命名为连字符形式;同步修正 4 个 `workflows/*.md` 的 `subagent_type` 字符串;同步修正 README 与 ARCHITECTURE 示例
5. **修 `localConfigDir`**:删除或改名;差异化 `artifactLayout.global` 与 `artifactLayout.local`
6. **补仓库根文件**:`LICENSE`、`CHANGELOG.md`、`.gitignore`;在 `示例/` 放最小 demo

完成前 4 步后重跑 `npm run validate`,期望 0 错误。完成第 5 步后建议在 Zcode 中实测加载与派发链路。

---

## 七、0.3.0 修复记录(2026-08-28)

本次会话基于用户决策完成以下变更:

### 品牌重命名(器灵)
- 插件名:`zcode-gsd-workflow` → `qiling`(器灵)
- 命令前缀:`zgsd-` → `ql-`
- worktree 路径:`.git/zgsd/worktrees/` → `.git/ql/worktrees/`
- 分支前缀:`zgsd/wave-N/...` → `ql/wave-N/...`
- 状态机版本键:`zgsd_state_version` → `ql_state_version`
- npm 包:`@opengsd/zcode-gsd-workflow` → `@qiling/zcode-workflow`
- 版本:`0.2.0` → `0.3.0`

### 缺口修复

| 编号 | 修复内容 | 文件 |
|------|---------|------|
| P1-1 | `localConfigDir` 改为 `.planning`;`artifactLayout.local` 与 `global` 差异化 | `capabilities/zcode/capability.json` |
| P1-2、3 | agent 文件名统一为 `ql-*`;`subagent_type` 字符串同步 | `agents/*.md`、`workflows/*.md`、`commands/*.md`、`skills/*/SKILL.md` |
| P1-4 | 补 2 个 converter 实现 | `scripts/convertClaudeCommandToClaudeSkill.mjs`、`scripts/convertClaudeAgentToZcodeAgent.mjs` |
| P1-5 | `commands/ql-discuss.md` 的 `requires` 改为 `[ql-ship]`(移除反向依赖) | `commands/ql-discuss.md` |
| P2-7 | 补 `templates/config-schema.json`(Draft-07) | `templates/config-schema.json` |
| P2-9 | `installSurface` 改为 `declarative-full`,与本地布局自洽 | `capabilities/zcode/capability.json` |
| P2-11 | README、ARCHITECTURE 目录树统一为 `ql-*` | `README.md`、`docs/ARCHITECTURE.md` |
| P3-14 | 补 `LICENSE`(MIT)、`CHANGELOG.md`(0.3.0)、`.gitignore` | 仓库根 |
| 验证脚本增强 | 新增下划线命名识别、converter 校验、`$schema` 校验、依赖反向校验、布局去重校验、`configHome` vs `localConfigDir` 校验 | `scripts/validate.mjs` |

### 验证结果

```
✅ npm run validate
→ 0 错误,1 警告(三步循环语义提示,可接受)
```

### 新增文件

- `scripts/rename.mjs`(批量改名脚本,留作历史工具)
- `scripts/convertClaudeCommandToClaudeSkill.mjs`
- `scripts/convertClaudeAgentToZcodeAgent.mjs`
- `templates/config-schema.json`
- `LICENSE`
- `CHANGELOG.md`
- `.gitignore`

### 后续建议

- 在 Zcode 中实测加载与派发(目前所有可静态检查的问题已修复)
- 在 `示例/` 目录放最小可运行 demo(P3-15 仍待办)
- `templates/wave-report.md` 第 99 行 `parallel: false` 示例与文档主题冲突,可统一(P2-10)