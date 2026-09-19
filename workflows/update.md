<!-- ql:loop-host
step: update
points: update:pre, update:post
agent-roles: orchestrator
produces: 迁移后的 .planning/ 工件 + STATE.md 版本锚点(ql_version)+ 迁移报告(会话输出)
consumes: .planning/ 全部工件, 插件自身版本, scripts/migrate.mjs
-->

<purpose>
**ql-update —— 插件升级后的一键工件迁移。**

回答一个问题:**"插件升级了,我项目里的工作文档怎么跟上新版本?"**

**核心原则:确定性迁移交给脚本,判断与转述交给会话。** config/frontmatter 这类机器可判定的变化由 `scripts/migrate.mjs` 执行(幂等、有备份、可 dry-run);契约与决策内容永不触碰;脚本覆盖不了的部分(历史报告结构差异、章节文档)只提示不代改。
</purpose>

<process>

## 步骤 1: 环境确认(先看清楚再动手)

```bash
# 项目是否已用器灵初始化
test -d .planning && echo "已初始化" || echo "未初始化"

# 项目版本锚点(0.15.0 起存在;缺失 = 旧版项目)
grep "^ql_version:" .planning/STATE.md 2>/dev/null || echo "无锚点(旧版项目)"
```

- **未初始化** → 无可迁移:新项目建议 `/ql-design`,接手已有代码建议 `/ql-scan`,结束
- **已初始化** → 进步骤 2

## 步骤 2: dry-run 预览(迁移前必看)

```bash
node <插件目录>/scripts/migrate.mjs --dry-run
```

向用户展示输出:目标版本、项目当前版本、每条迁移规则([since] id + 计划一句话)、提示项。

## 步骤 3: 执行迁移

用户确认后实跑(去 `--dry-run`);`AskUserQuestion` 不可用时按 Never-Ask 降级:**迁移有自动备份且幂等,属可回退操作,直接执行并在结果中给出备份路径**。

```bash
node <插件目录>/scripts/migrate.mjs
```

引擎保证:
- 修改前自动备份 `.planning/` → `.planning-backups/.backup-<旧版本>/`
- 幂等:重复执行报"无需迁移"
- 执行后 STATE.md 写入 `ql_version: '<新版本>'` 锚点,后续升级走精确比较

## 步骤 4: 处理脚本提示(需要人的部分)

读迁移输出的**提示段**,逐条向用户转述并给建议,不代改:

| 提示 | 建议动作 |
|------|----------|
| 旧格式 verification.md(STALE) | 交付前重跑 `/ql-build` 验证阶段;不手改历史报告 |
| 章节索引版本字段滞后 | `/ql-scan --force` 重新生成文档树;产物由渲染器维护 |
| `.planning-backups/` 未忽略 | git 项目建议加入 `.gitignore` |

## 步骤 5: 汇报与收尾

```text
🔄 迁移完成(器灵 <旧版本或无锚点> → <新版本>):
- 修改 N 项:[逐条列规则 id 与一句话]
- 提示 M 项:[逐条,含建议动作]
- 备份:<路径>(回退:直接覆盖回 .planning/)

✅ 下一步:/ql-next(从磁盘重新推导当前位置;旧验证结论已按提示处理)
```

**边界纪律:**
- `context/openapi.yaml`、`event-flow.md`、`decisions.md` 是用户内容,本工作流永不触碰
- 章节文档(`.qiling/docs/`)是渲染产物,只建议重扫,不手改
- 迁移发现未知工件状态(如 config.json 损坏)→ 展示事实,停下让用户决定;不静默跳过

</process>
