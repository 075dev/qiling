# 器灵发版检查单

> **用途:** 每次发布新版本前照单执行。分两层:**机械层**由 `npm run validate` 自动拦截(断言即检查单);**梳理层**是需要判断的文档同步,由 AI 或人逐项确认。
>
> **背景:** 0.12→0.14 收尾时发现三处文档漂移(capability.json 版本漏 bump、README/ARCHITECTURE 模板计数错、CHANGELOG 计数错),0.15.0 起用本检查单 + validate 自描述断言防复发。

---

## 一、机械层(validate 自动拦截)

以下全部由 `npm run validate` 断言覆盖,**发版前必须 0 错误**:

| # | 断言 | 拦截的历史事故 |
|---|------|----------------|
| 1 | 五处版本号一致(package.json、marketplace.json、.zcode-plugin/{plugin,marketplace,capability}.json) | 0.14.0 收尾时 capability.json 停在 0.12.0 |
| 2 | CHANGELOG 最新条目版本 = package.json 版本 | — |
| 3 | README.md 目录树与实际目录逐一比对(templates / workflows / agents) | constitution.md 自 0.11 起漏列;workflows 加文件漏同步 |
| 4 | docs/ARCHITECTURE.md 目录树同上 | 同上 |
| 5 | 命令/技能/工作流/子智能体/模板存在性与引用一致性 | 既有断言 |

## 二、梳理层(逐项确认,不靠记忆)

发版前过一遍;涉及才动,不涉及写"不涉及":

- [ ] **CHANGELOG 新版本条目** —— 写明:新增/修改了什么、为什么、验证证据(命令 + 结果计数)
- [ ] **README 机制表** —— 新机制加一行(参考 0.13"决策轨迹/反套路评审"、0.14"派发决策门"的写法)
- [ ] **README 命令清单与快速上手** —— 新命令/参数同步;旧名别名清单核对
- [ ] **docs/ARCHITECTURE.md** —— 目录树(validate 已拦)、子智能体/工作流说明段
- [ ] **工件格式变更时:登记迁移规则** —— 在 `scripts/migrate.mjs` 的 `MIGRATIONS` 追加一条(规则纪律:幂等、`since` 标版本、机器可判定才改文件,判断类只提示);**提示类规则必须有版本门**(项目锚点 ≥ since 后不再提示),否则永不收敛
- [ ] **新命令三件套** —— commands/、skills/、workflows/ 三处齐全且口径一致;`validate.mjs` 的 `expectedCommands`/`requiredWorkflows` 同步
- [ ] **config.json 新字段** —— `templates/config.json` + `templates/config-schema.json` + 迁移规则三处同步;`npm run verify:schema` 通过
- [ ] **决策表(workflows/next.md)** —— 新工件/新状态是否需要新增判定行;行号顺延后"取编号最小"纪律仍成立
- [ ] **docs/REFERENCES.md** —— 本轮若调研了新项目,登记定位/路径/借鉴点

## 三、验证与发布

```bash
npm run validate          # 0 错误(警告需逐条确认是预期内)
npm run verify:flow       # 20/20
npm run verify:schema     # 通过
npm run chapter:render    # 9/9
npm run migrate:test      # 13/13(迁移引擎自测)
```

全部通过后:按仓库惯例提交(`feat(版本区间): 主题`),推送 GitHub。

## 四、版本号修改点(共 5 处,validate 断言 1 已兜底)

`package.json`、`marketplace.json`、`.zcode-plugin/plugin.json`、`.zcode-plugin/marketplace.json`、`.zcode-plugin/capability.json`
