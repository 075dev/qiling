<!-- ql:loop-host
step: docsmap
points: docsmap:pre, docsmap:post
agent-roles: orchestrator
produces: .qiling/docs/README.md, .qiling/docs/chapters/chapter-NN-*.md
consumes: 项目目录树、源码 export/routes/events
-->

<purpose>
**文档树生成** —— 通过阅读现有项目结构,产出与章节留档**完全一致**格式的文档树。

**与 `workflows/chapter.md` 的关系:**
- `chapter.md`:从 OpenAPI + build 报告渲染(开发流程中)
- `docsmap.md`:从目录树 + 源码扫描渲染(项目初始化)
- **两者产出布局相同**:`.qiling/docs/README.md` + `.qiling/docs/chapters/chapter-NN-*.md`

**核心定位:** 用于**接手项目 / 初始化 / 刷新**——无 OpenAPI 也能产出文档树。
</purpose>

<process>

## 步骤 1: 准备目录与扫描项目

```bash
mkdir -p .qiling/docs/chapters
SCAN_PATH="${SCAN_PATH:-.}"
echo "扫描目录:$SCAN_PATH"

# 收集目录结构(排除常见忽略)
find "$SCAN_PATH" \
  -type d \( -name node_modules -o -name dist -o -name build -o -name .git -o -name .qiling -o -name .planning \) -prune -o \
  -type f -print 2>/dev/null | head -500
```

## 步骤 2: 解析项目元信息

```bash
# 项目名:从 package.json 读 name
PROJECT_NAME=$(node -e "console.log(require('./package.json').name)" 2>/dev/null || basename "$PWD")

# 项目描述:从 package.json 读 description
PROJECT_DESC=$(node -e "console.log(require('./package.json').description || '')" 2>/dev/null || echo "")

# 包管理:npm / pnpm / yarn
PKG_MANAGER=$([ -f pnpm-lock.yaml ] && echo pnpm || ([ -f yarn.lock ] && echo yarn || echo npm))

# 编程语言:从 .js / .ts / .py 等扩展名统计
LANG=$(find . -type f -not -path '*/node_modules/*' -not -path '*/.git/*' | awk -F. '{print $NF}' | sort | uniq -c | sort -rn | head -1 | awk '{print $2}')
```

## 步骤 3: 提取 API/能力清单(从代码扫描)

按文件类型扫描:

| 文件类型 | 提取目标 |
|---------|----------|
| `*.routes.*` / `*.router.*` | HTTP 路由(`app.get`、`router.post` 等) |
| `*.controller.*` | 控制器方法(`export function`) |
| `*.event.*` / `*.emitter.*` | 事件名(`emit('user.created')`) |
| `package.json` scripts | 命令清单 |
| `*.service.*` | 服务导出 |

## 步骤 4: 分配章节 ID

```bash
# 章节编号 = 现有最大 + 1(保证 append 不冲突)
NEXT_CHAPTER=$(( $(ls .qiling/docs/chapters/chapter-*.md 2>/dev/null | grep -oE '[0-9]+' | sort -rn | head -1 || echo 0) + 1 ))
CHAPTER_ID=$(printf "chapter-%02d" "$NEXT_CHAPTER")
SLUG=$(echo "$PROJECT_NAME" | tr '[:upper:] ' '[:lower:]-' | tr -cd 'a-z0-9-')
CHAPTER_FILE=".qiling/docs/chapters/${CHAPTER_ID}-${SLUG}.md"
```

## 步骤 5: 渲染章节文件(与 ql-chapter 同 5 节结构)

调用 `scripts/docsmap.mjs` 渲染(无需派发子智能体,脚本独立运行):

```bash
node scripts/docsmap.mjs \
  --scan-path "$SCAN_PATH" \
  --project-name "$PROJECT_NAME" \
  --chapter-id "$CHAPTER_ID" \
  --out "$CHAPTER_FILE"
```

脚本内部完成:
- §一 从代码提取 API/能力清单(无需 OpenAPI)
- §二 从目录树生成项目结构图
- §三 "无上一章节"(首次生成)
- §四 反向链接到现有文档
- §五 变更日志:标注 "由 /ql-docsmap 初始化生成"

## 步骤 6: 更新索引文件(增量)

读取 `templates/chapter-index.md`,追加新章节到列表:

```bash
# 扫描所有章节文件,生成新的 README.md
node scripts/docsmap.mjs --update-index
```

**关键:** 索引文件与 `ql-chapter` 完全共享,不重复创建。

## 步骤 7: 报告

```
✅ 文档树生成完成

章节文件:${CHAPTER_FILE}
索引文件:.qiling/docs/README.md(增量更新)

扫描路径:${SCAN_PATH}
项目名:${PROJECT_NAME}
编程语言:${LANG}
包管理:${PKG_MANAGER}
新章节 ID:${CHAPTER_ID}

产出文件数:
  - API/能力清单:${ENDPOINT_COUNT} 条
  - 数据模型:${SCHEMA_COUNT} 个
  - 事件:${EVENT_COUNT} 个
  - 关键路径:${PATH_COUNT} 个

下一步:审阅 .qiling/docs/ 索引,确认覆盖;之后 /ql-discuss 进入 API 契约生成。
```

</process>

---

<integration>

## 与 ql-chapter 的产出统一

| 文件 | 由谁生成 | 何时 |
|------|----------|------|
| `.qiling/docs/chapters/chapter-01-*.md` | `/ql-docsmap` | 项目初始化 |
| `.qiling/docs/chapters/chapter-NN-*.md`(N≥2) | `/ql-chapter` | ql-ship 后 |
| `.qiling/docs/README.md` | **两者共同维护**(增量更新) | 任一命令触发时 |

**索引合并策略:**
- `/ql-docsmap` 在已有 README 末尾追加新行,不覆盖
- `/ql-chapter` 在已有 README 末尾追加新行,不覆盖
- 两者共用同一脚本 `scripts/docsmap.mjs --update-index`

## 与 ql-discuss 的跳接点

`/ql-docsmap` 完成后,提示用户:
- 若已有 OpenAPI → `/ql-build` 继续
- 若无 OpenAPI → `/ql-discuss` 先生成契约

## 与 GSD map-codebase 的对比

| 维度 | GSD map-codebase | ql-docsmap |
|------|-----------------|------------|
| 产出 | 7 份分析报告 | **1 章节文档 + 索引更新** |
| 格式 | STACK.md / ARCHITECTURE.md 等 | 与 ql-chapter 完全相同的 5 节结构 |
| 与工作流关系 | 独立产出(供 GSD onboard 使用) | **融入章节留档体系** |
| 索引 | 各自独立 | **共享 README.md** |
| 增量 | 整批重建 | 增量 append 章节 |

</integration>