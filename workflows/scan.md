<!-- ql:loop-host
step: docsmap
points: docsmap:pre, docsmap:post
agent-roles: orchestrator
produces: .qiling/docs/README.md, .qiling/docs/chapters/chapter-NN-*.md
consumes: 项目目录树、源码 export/routes/events、package.json
-->

<purpose>
**文档树生成** —— 通过阅读现有项目结构,产出与章节留档**完全一致**格式的文档树。

**与 `workflows/doc.md` 的关系:**
- `doc.md`:从 OpenAPI + build 报告渲染(开发流程中)
- `scan.md`:从目录树 + 源码扫描渲染(项目初始化)
- **两者产出布局相同**:`.qiling/docs/README.md` + `.qiling/docs/chapters/chapter-NN-*.md`

**核心定位:** 用于**接手项目 / 初始化 / 刷新**——无 OpenAPI 也能产出文档树。

**产品化承诺:** 文档树是插件的门面交付物,必须是"清晰、严谨、可读性优秀的产品说明书"。五条严谨性铁律(对标 GSD map-codebase,详见 `templates/chapter-index.md` 的"严谨性约定"):
1. **证据锚点** —— 每条提取结果带 `文件:行号`,无一例外
2. **未检出显式声明** —— 扫不到就写"未检出(Not detected)"+ 原因,禁止留空或编造
3. **推断必须标注** —— 目录职责/框架用途等推断内容带"(推断)"标记
4. **不画假图** —— mermaid 只引用真实检测值,检不出启动链路就不画
5. **新鲜度戳** —— `last_mapped_commit` 由脚本写入,索引据此提示过期
</purpose>

<process>

## 步骤 1: 准备目录与确定扫描范围

```bash
mkdir -p .qiling/docs/chapters
SCAN_PATH="${SCAN_PATH:-.}"
echo "扫描目录:$SCAN_PATH"
```

**范围确认(若用户未指定):** 扫描项目根(默认),跳过 node_modules/dist/build/.git/.qiling/.planning 等目录。超大项目可建议用户用 `--scan-path` 收窄到 src/。

## 步骤 2: 运行渲染脚本(端到端)

`scripts/docsmap.mjs` 一次完成扫描、提取、渲染、索引更新与断言:

```bash
# 在目标项目根执行(脚本可通过插件缓存路径调用;--root 指向目标项目)
node <插件路径>/scripts/docsmap.mjs --root .
```

脚本内部完成:
- **技术栈**:语言分布统计、框架/关键依赖推断(标注"推断")、包管理器
- **能力清单**:npm scripts 原样列出;HTTP 路由与事件发布按**接收者白名单**上下文提取(防 `cache.get()` 误报),每条带 `文件:行号` 证据
- **目录树**:树形渲染 + 顶层目录职责(标注"推断")+ 截断时显式提示(绝不静默截断)
- **启动流程**:检出 package.json 入口 + start/dev 脚本才画 mermaid(文件存在性已校验);检不出则诚实声明"未检出",**不画臆测图**
- **新代码放哪**:基于目录结构的推断指引(回答"加功能放哪")
- **新鲜度戳**:frontmatter 写入 `last_mapped_commit`(git HEAD)
- **密钥扫描**:产出文档正则扫描(sk-/ghp_/AKIA/私钥头等),命中即失败——文档不得包含敏感值

## 步骤 3: 断言门控(脚本内置 10 条)

脚本退出码非 0 时**必须修复后重跑**,不得带病交付:

| # | 断言 | 防什么 |
|---|------|--------|
| 1 | 章节文件 ≥ 1 KB | 空产出 |
| 2 | 能力清单非空 **或** 显式"未检出" | 静默空白 |
| 3 | 证据锚点数 ≥ 提取条目数 | 无证据条目 |
| 4 | 目录树截断必带提示 | 静默截断 |
| 5 | 索引含新章节链接 | 索引遗漏 |
| 6 | 5 节结构完整 | 与 ql-doc 格式分裂 |
| 7 | 无未替换占位符 | 半成品 |
| 8 | 无臆造流程图 | 假图(启动链路未检出时不得画) |
| 9 | 密钥扫描通过 | 敏感值入库 |
| 10 | 版本号来自 package.json | 版本漂移 |

## 步骤 4: 已有章节时的处理

- **同 slug 章节已存在** → 脚本拒绝重复生成(初始化入口,一个项目一份快照)
- **项目结构大改后刷新** → `--force` 覆盖(章节 ID 不变,内容重扫,基线 commit 更新)
- **只重建索引**(如手动改了章节文件名)→ `--update-index`

```bash
node <插件路径>/scripts/docsmap.mjs --root . --force         # 重扫覆盖
node <插件路径>/scripts/docsmap.mjs --root . --update-index  # 只重建索引
```

**漂移提示:** 生成后若代码继续演进,索引页的"新鲜度提示"会指引读者用
`git log --oneline <基线>..HEAD` 自查过期;结构大改(新顶层目录/路由文件迁移)时建议重扫。

## 步骤 5: 报告

```
✅ 文档树生成完成

章节文件:.qiling/docs/chapters/chapter-NN-<slug>.md
索引文件:.qiling/docs/README.md(增量更新,与 /ql-doc 共享)

扫描路径:$SCAN_PATH
项目名:$PROJECT_NAME
扫描基线 commit:$HEAD_COMMIT
扫描条目:$ENTRIES(目录树显示前 80,超出有截断提示)
命令(npm scripts):$SCRIPTS 条
路由(带证据):$ROUTES 条
事件(带证据):$EVENTS 条
密钥扫描:通过

下一步:审阅 .qiling/docs/ 索引(10 条断言已全绿);之后 /ql-design 进入 API 契约生成。
```

</process>

---

<integration>

## 与 ql-doc 的产出统一

| 文件 | 由谁生成 | 何时 |
|------|----------|------|
| `.qiling/docs/chapters/chapter-01-*.md`(scan 章节) | `/ql-scan` | 项目初始化 |
| `.qiling/docs/chapters/chapter-NN-*.md`(doc 章节) | `/ql-doc` | ql-deliver 后 |
| `.qiling/docs/README.md` | **两者共同维护**(增量更新) | 任一命令触发时 |

**索引合并策略:**
- 两者共用同一索引格式(`templates/chapter-index.md` 为契约,`scripts/docsmap.mjs` 为参考实现)
- 章节列表/能力总览/项目元信息/阅读路由四个节**永远存在**;`/ql-doc` 章节累积后填充路径清单/错误码/数据模型子表
- 重建索引统一走 `node scripts/docsmap.mjs --update-index`

## 与 ql-design 的跳接点

`/ql-scan` 完成后,提示用户:
- 若已有 OpenAPI → `/ql-build` 继续
- 若无 OpenAPI → `/ql-design` 先生成契约(scan 章节 §一 的路由清单可作为契约讨论的输入)

## 与同类项目的对比(调研结论,2026-09)

| 维度 | GSD map-codebase | RepoAgent / DeepWiki | ql-scan(本工作流) |
|------|-----------------|----------------------|---------------------|
| 产出 | 7 份主题分析报告 | 对象级文档 / wiki 页 | **1 章节文档 + 索引**(融入章节体系) |
| 证据锚点 | 文件路径,file:line | 源码内联 | **file:line 强制 + 断言门控** |
| 防臆造 | "Not detected" 强制 | — | **"未检出(Not detected)"+ 原因,断言 2** |
| 新鲜度 | last_mapped_commit(脚本写入) | git diff 增量 | **last_mapped_commit + 索引过期提示** |
| 假图防护 | — | — | **断言 8:未检出启动链路不得画图** |
| 密钥扫描 | 提交前硬门控 | — | **产出后扫描,命中即失败** |
| 阅读路径 | planner 按需加载路由表 | codemap 导览 | **索引"按角色 × 意图"路由表** |

</integration>
