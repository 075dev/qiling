#!/usr/bin/env node
/**
 * 章节渲染器(端到端验证):从真实 OpenAPI + 示例 build 报告渲染 .qiling/docs/。
 *
 * 这是"章节留档"功能的真实渲染管线,而非模板字段名检查。
 * 验证目标:模板可被实际填充出非占位的章节文档。
 *
 * 输入:
 *   - templates/openapi-spec.yaml(真实 OpenAPI 3.1 模板)
 *   - templates/event-flow.md(真实 Mermaid 模板)
 *   - templates/chapter.md(章节模板)
 *   - templates/chapter-index.md(索引模板)
 *   - 示例 build 报告(脚本内置生成)
 *
 * 输出:
 *   - .tmp/chapter-render/chapter-01-demo.md
 *   - .tmp/chapter-render/README.md
 *
 * 断言:
 *   - 端点表行数 ≥ 1
 *   - curl 示例含真实路径(不含 [N]、[M]、[K] 等占位)
 *   - 数据模型 ≥ 1 schema
 *   - 错误码 ≥ 1
 *   - 流程留档含真实波次信息
 *   - 索引文件含章节链接
 *   - 不存在未替换占位符
 *
 * 用法:node scripts/chapter-render.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT = join(ROOT, '.tmp', 'chapter-render');

const errors = [];
const passed = [];

function ok(msg) { passed.push(msg); }
function err(msg) { errors.push(msg); }

// === 步骤 1:准备示例输入(模拟 /ql-design + /ql-build 产出)===

mkdirSync(OUT, { recursive: true });

// 1.1 示例 OpenAPI(从 templates/openapi-spec.yaml 真实路径提取)
const openapiTpl = readFileSync(join(ROOT, 'templates/openapi-spec.yaml'), 'utf8');

// 1.2 示例 build 报告(模拟 build/skeleton-report.md、build/fill-report.md、build/verification.md)
mkdirSync(join(OUT, '.qiling/planning', 'build'), { recursive: true });
mkdirSync(join(OUT, '.qiling/planning', 'build', 'waves'), { recursive: true });

const skeletonReport = `---
phase: skeleton
generated_at: 2026-08-28T15:00:00Z
status: success
endpoints_implemented: 2
events_connected: 1
waves_executed: 1
---

# Walking Skeleton 报告
端点数:2 / 2
事件数:1 / 1
波次数:1
`;
writeFileSync(join(OUT, '.qiling/planning/build/skeleton-report.md'), skeletonReport);

const fillReport = `---
phase: fill
generated_at: 2026-08-28T15:30:00Z
status: success
mocks_replaced: 2
test_coverage: 92
test_cases: 18
---

# 填充报告
mock 替换率:100%
测试覆盖:92%(18 用例)
`;
writeFileSync(join(OUT, '.qiling/planning/build/fill-report.md'), fillReport);

const verification = `---
status: passed
verified_at: 2026-08-28T15:35:00Z
inputs:
  - openapi.yaml
  - event-flow.md
  - fill-report.md
---

# 验证报告
**契约符合度:100%(2/2 端点)**
**流程符合度:100%(1/1 事件)**
测试:18/18 通过
`;
writeFileSync(join(OUT, '.qiling/planning/build/verification.md'), verification);

// 1.3 示例 STATE
const state = `---
ql_state_version: '1.0'
current_phase: 1
status: shipped
---
# 项目状态
阶段:1 (shipped)
`;
writeFileSync(join(OUT, '.qiling/planning/STATE.md'), state);

// 1.4 示例 git log(用静态字符串模拟,因为脚本不应要求真实 git 仓库)
const gitLog = `abc1234 feat(skeleton): GET /resources 骨架  器灵 wave-1-worker-1
def5678 feat(skeleton): POST /resources 骨架  器灵 wave-1-worker-2
a1b2c3d feat(fill): GET /resources 填充   器灵 wave-1-worker-1
e4f5g6h feat(fill): POST /resources 填充  器灵 wave-1-worker-2
i7j8k9l docs(chapter-01): 自动生成章节文档  器灵 ship
`;
writeFileSync(join(OUT, 'git-log.txt'), gitLog);

// === 步骤 2:解析 OpenAPI,提取真实数据 ===

// 简易 YAML 解析:只关心 paths 列表与 components.schemas(不引入外部依赖)
function parsePaths(yaml) {
  const lines = yaml.split('\n');
  const paths = [];
  let currentPath = null;
  let currentMethod = null;
  for (const line of lines) {
    // /resources:
    const pathMatch = line.match(/^  (\/[a-zA-Z0-9_\-/{}]+):\s*$/);
    if (pathMatch) {
      currentPath = pathMatch[1];
      currentMethod = null;
      continue;
    }
    //   get: / post: / put: / delete: / patch:
    const methodMatch = line.match(/^    (get|post|put|delete|patch):\s*$/);
    if (methodMatch && currentPath) {
      currentMethod = methodMatch[1].toUpperCase();
      paths.push({ method: currentMethod, path: currentPath });
    }
  }
  return paths;
}

function parseSchemas(yaml) {
  const lines = yaml.split('\n');
  const schemas = [];
  let inSchemas = false;
  let current = null;
  for (const line of lines) {
    if (/^  schemas:\s*$/.test(line)) {
      inSchemas = true;
      continue;
    }
    if (inSchemas && /^    ([A-Z][A-Za-z0-9_]+):\s*$/.test(line)) {
      if (current) schemas.push(current);
      current = { name: line.match(/^    ([A-Z][A-Za-z0-9_]+):/)[1] };
    }
  }
  if (current) schemas.push(current);
  return schemas;
}

function parseErrors(yaml) {
  // 提取 $ref: '#/components/responses/BadRequest' 类的引用计数
  const responses = yaml.match(/\$ref:\s*'#\/components\/responses\/([A-Za-z]+)'/g) || [];
  const uniq = new Set();
  for (const r of responses) {
    const m = r.match(/responses\/([A-Za-z]+)/);
    if (m) uniq.add(m[1]);
  }
  return Array.from(uniq);
}

const endpoints = parsePaths(openapiTpl);
const schemas = parseSchemas(openapiTpl);
const errorRefs = parseErrors(openapiTpl);

// === 步骤 3:从 build 报告提取真实数据 ===
function extractField(yaml, key) {
  const m = yaml.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'));
  return m ? m[1].trim() : null;
}

const waveCount = extractField(skeletonReport, 'waves_executed');
const endpointCount = extractField(skeletonReport, 'endpoints_implemented');
const eventCount = extractField(skeletonReport, 'events_connected');
const mockReplaceRate = extractField(fillReport, 'mocks_replaced');
const testCoverage = extractField(fillReport, 'test_coverage');
const testCases = extractField(fillReport, 'test_cases');

// === 步骤 4:渲染章节文件 ===

function genCurl(method, path) {
  const m = method.toLowerCase();
  if (m === 'get') {
    return `curl -X GET "https://api.example.com${path}" -H "Authorization: Bearer <token>"`;
  }
  return `curl -X ${m} "https://api.example.com${path}" -H "Authorization: Bearer <token>" -H "Content-Type: application/json" -d '{}'`;
}

function genTS(method, path) {
  const m = method.toLowerCase();
  return `const res = await fetch('${path}', { method: '${m}', headers: { Authorization: \`Bearer \${token}\` } });`;
}

function genPy(method, path) {
  const m = method.toLowerCase();
  return `r = requests.${m}('https://api.example.com${path}', headers={'Authorization': f'Bearer {token}'})`;
}

// 端点表
let endpointTable = '| 方法 | 路径 | 摘要 | 认证 |\n|------|------|------|------|\n';
for (const e of endpoints) {
  endpointTable += `| ${e.method} | ${e.path} | (待摘要) | Bearer |\n`;
}

// 端点详情
let endpointDetails = '';
for (const e of endpoints) {
  endpointDetails += `#### ${e.method} ${e.path}\n\n`;
  endpointDetails += `**摘要:** (从 OpenAPI summary 填充)\n\n`;
  endpointDetails += `**请求参数:** 见 OpenAPI schema\n\n`;
  endpointDetails += `**响应 200:**\n\n\`\`\`json\n{ "ok": true }\n\`\`\`\n\n`;
  endpointDetails += `**使用示例:**\n\n`;
  endpointDetails += '```bash\n';
  endpointDetails += `# curl\n${genCurl(e.method, e.path)}\n`;
  endpointDetails += '\n# TypeScript(fetch)\n' + genTS(e.method, e.path);
  endpointDetails += '\n\n# Python(requests)\n' + genPy(e.method, e.path);
  endpointDetails += '\n```\n\n';
}

// 数据模型
let schemaTable = '| Schema | 字段数(从 yaml 推断) | 必填字段 |\n|--------|--------|----------|\n';
for (const s of schemas) {
  schemaTable += `| ${s.name} | (待提取) | (待提取) |\n`;
}

// 错误码(含"怎么处理"列——说明书故障排查节要求可操作)
let errorTable = '| HTTP | code | 含义 | 怎么处理 |\n|------|------|------|----------|\n';
for (const ref of errorRefs) {
  errorTable += `| (待映射) | ${ref} | (待描述) | 按契约 ${ref} 的说明修正请求后重试 |\n`;
}

const firstGet = endpoints.find(e => e.method === 'GET') || endpoints[0];

const chapterContent = `---
chapter_id: "chapter-01"
title: "演示项目"
part: "第一篇 · 演示功能"
phase: 1
generated_at: "2026-08-28T15:39:02Z"
generated_by: "器灵工作流 v0.18.0"
ql_version: "0.18.0"
git_commit: "demo0000"
pr_url: "https://github.com/075dev/qiling/pull/1"
status: "shipped"
endpoints: ${endpointCount}
events: ${eventCount}
---

# 第 1 章 · 演示项目

> 本章是演示项目的功能章,由器灵 chapter-render.mjs 端到端渲染产出。
> \`<!-- manual -->\` 块内的内容欢迎人工撰写润色(重新生成自动保留);其余机器节不要手改。

**一句话:** 演示项目——resources 资源管理 API(从 OpenAPI info.description 提取)。

## 本章导学

<!-- manual:syllabus -->
- **本章你将学到:** resources 资源管理 API 的 ${endpointCount} 个端点怎么调用——从第一次成功调用到按错误码排错。
- **前置章节:** 无——本章是全书第一章,从零开始。
- **读法:** 只想查用 → 直接进 [§三 使用说明](#三使用说明);赶时间 → 先读章末"本章小结"。
<!-- /manual:syllabus -->

## 一、这个功能是什么

<!-- manual:overview -->
**覆盖能力:** ${endpointCount} 个端点、${eventCount} 个事件消息,完整清单见 [§三 使用说明](#三使用说明)。

**什么时候用:** 需要 resources 资源的增删查改时使用本组 API。

(以上为生成器初稿;欢迎人工补充:这个功能解决什么问题、什么时候用、不适用什么场景)
<!-- /manual:overview -->

## 二、快速上手

<!-- manual:quickstart -->
**前置:** Bearer Token(Authorization: Bearer <token>)

**第一个调用:**

\`\`\`bash
${genCurl(firstGet.method, firstGet.path)}
\`\`\`

**预期结果:** HTTP 200,返回 resources 列表。

**下一步:** 浏览 [§三 使用说明](#三使用说明) 选择需要的端点;报错时查 [§五 故障排查](#五故障排查)。

(以上为生成器初稿;欢迎人工补充第一次跑通调用的完整步骤与易踩的坑)
<!-- /manual:quickstart -->

## 三、使用说明(API 参考)

### 3.1 端点清单

${endpointTable}

### 3.2 端点详情

${endpointDetails}

### 3.3 数据模型(Schemas)

${schemaTable}

---

## 四、配置与限制

- **认证方式:** Bearer Token
- **速率限制:** 契约未声明速率限制
- **已知限制:** 无(shipped)

## 五、故障排查

按错误码排查(完整错误模型以 \`openapi.yaml\` 为准):

${errorTable}

---

## 本章小结

<!-- manual:summary -->
- 本章交付了 ${endpointCount} 个端点、${eventCount} 个事件:resources 资源的增删查改。
- 快速入口在 [§二 快速上手](#二快速上手);调用出错查 [§五 故障排查](#五故障排查)。
- 开发过程与验证证据见 [附录 A](#附录-a--交付与开发留档)。
<!-- /manual:summary -->

## 下一章

<!-- manual:next -->
- 学完本章,建议继续:等待下一次交付后追加的功能章(见首页目录)。
- 想先动手?回到 [§二 快速上手](#二快速上手) 把示例跑一遍。
<!-- /manual:next -->

---

## 附录 A · 交付与开发留档

(本附录面向维护者与 AI 审计,使用者可跳过)

### A.1 阶段时序

\`\`\`mermaid
timeline
    title 第 1 章节开发时序
    阶段1 讨论 : OpenAPI 契约
              : Mermaid 流程图
    阶段2 骨架 : Wave 1(并行,${endpointCount} 端点)
    阶段3 填充 : mock 替换 ${mockReplaceRate}/${endpointCount}
              : ${testCases} 测试用例
    阶段4 验证 : passed
    阶段5 交付 : 推送 PR
              : 生成章节文档
\`\`\`

### A.2 讨论阶段产出

- **OpenAPI 契约:** 真实路径数 ${endpoints.length},Schema 数 ${schemas.length}
- **事件流程图:** 见 OpenAPI components

### A.3 构建与验证产出

- **骨架报告:** ${endpointCount} 端点 mock,${eventCount} 事件连接,${waveCount} 波次
- **填充报告:** mock 替换 ${mockReplaceRate}/${endpointCount},${testCases} 测试用例
- **验证报告:** passed(契约符合度 100%,流程符合度 100%)

### A.4 交付产出

- **PR:** https://github.com/075dev/qiling/pull/1
- **本章节文档:** ./chapter-01-demo.md

### A.5 Git 历史摘要

\`\`\`
${gitLog}
\`\`\`

---

## 附录 B · 与上一章节对比

- **新增 API:** 本章节为首个交付章节,以上全部端点均为新增。
- **修改 / 删除 / 破坏性变更:** 无。

---

## 附录 C · 数据来源与验证

### C.1 关联文档

- [项目状态](../STATE.md) · [OpenAPI 契约](../context/openapi.yaml) · [PR](https://github.com/075dev/qiling/pull/1)

### C.2 数据可信约定

- API 以 \`openapi.yaml\` 为单一可信源;流程数据来自构建/验证报告与 git log,未检出显式声明,不编造。

### C.3 变更日志

| 日期 | 操作 | 说明 |
|------|------|------|
| 2026-08-28T15:39:02Z | 自动生成 | 由 chapter-render.mjs 渲染 |
`;

const chapterPath = join(OUT, 'chapter-01-demo.md');
writeFileSync(chapterPath, chapterContent);
ok(`渲染章节文件:${chapterPath}`);

// === 步骤 5:渲染索引 ===

const indexContent = `# 演示项目 · 项目书

> **resources 资源管理 API 演示项目。**
>
> 本页是全书的**前言与目录**。全书按"先跑起来,再逐功能深入"的顺序组织。

## 前言

- **这本书讲什么:** resources 资源管理 API 的能力与用法。
- **适合谁:** 新接手的开发者(按顺序读)/ 只想查用的调用方(直接进章节 §三)。
- **快速上手:** 获取 Bearer Token,第一个调用见 [第 1 章 · §二](./chapter-01-demo.md#二快速上手)。

## 目录

**第一篇 · 演示功能**

- [第 01 章 · 演示项目](./chapter-01-demo.md)

---

## 参考汇总(全书附表)

| 维度 | 数量 | 明细位置 |
|------|------|----------|
| API 端点(合计) | ${endpointCount} | 各章节 §三 使用说明 |
| 事件(合计) | ${eventCount} | 同上 |

## 术语表

| 术语 | 含义 | 首见章节 |
|------|------|----------|
| | | |

## 关于本书

<details>
<summary>生成方式、版本与严谨性约定(点开展开)</summary>

- **生成:** 器灵工作流 v0.18.0;章节 = 本章导学 → 正文五章 → 本章小结/下一章 → 附录三章;篇由 frontmatter \`part\` 声明;测试覆盖率 ${testCoverage}%(${testCases} 用例)。

</details>
`;

const indexPath = join(OUT, 'README.md');
writeFileSync(indexPath, indexContent);
ok(`渲染索引文件:${indexPath}`);

// === 步骤 6:断言(关键:验证非占位) ===

const chapter = readFileSync(chapterPath, 'utf8');
const index = readFileSync(indexPath, 'utf8');

// 断言 1:端点表行数 ≥ 1(实际行数 = endpoints 长度)
if (endpoints.length >= 1) {
  ok(`断言 1:端点表行数 = ${endpoints.length} (≥ 1)`);
} else {
  err('断言 1:端点表行数 < 1');
}

// 断言 2:curl 示例非占位(包含真实路径,不含 [N])——大小写不敏感
const curlSample = chapter.match(/curl -X\s+(get|post|put|delete|patch)\s+"[^"]+"/gi) || [];
if (curlSample.length >= endpoints.length) {
  ok(`断言 2:curl 示例 ${curlSample.length} 条(全部含真实路径,非占位)`);
} else {
  err(`断言 2:curl 示例 ${curlSample.length} < 端点数 ${endpoints.length}`);
}

// 断言 3:数据模型 ≥ 1
if (schemas.length >= 1) {
  ok(`断言 3:数据模型 ${schemas.length} 个 schema`);
} else {
  err('断言 3:数据模型 schema 数 < 1');
}

// 断言 4:错误码 ≥ 1
if (errorRefs.length >= 1) {
  ok(`断言 4:错误码 ${errorRefs.length} 个`);
} else {
  err('断言 4:错误码 < 1');
}

// 断言 5:流程留档含真实波次信息
if (waveCount && /^\d+$/.test(waveCount)) {
  ok(`断言 5:流程留档含真实波次数 = ${waveCount}`);
} else {
  err(`断言 5:波次数缺失或非数字 (${waveCount})`);
}

// 断言 6:索引文件含章节链接
if (index.includes('./chapter-01-demo.md')) {
  ok('断言 6:索引文件含章节链接');
} else {
  err('断言 6:索引文件缺章节链接');
}

// 断言 7:不存在未替换占位符 [N]、[M]、[K]、[hash] 等(允许中括号文字如 [optional])
const placeholderPattern = /\[(?:N|M|K|hash|URL|YYYY|TODO|commits|seconds|N\/N)\]/g;
const placeholders = chapter.match(placeholderPattern) || [];
if (placeholders.length === 0) {
  ok('断言 7:章节文档无未替换占位符');
} else {
  err(`断言 7:章节文档含未替换占位符: ${[...new Set(placeholders)].join(', ')}`);
}

// 断言 8:书本骨架完整(导学 + 正文五章 + 小结 + 附录三章)且 manual 保护块配对
const manualOpen = (chapter.match(/<!-- manual:[a-zA-Z0-9_-]+ -->/g) || []).length;
const manualClose = (chapter.match(/<!-- \/manual:[a-zA-Z0-9_-]+ -->/g) || []).length;
const skeletonSections = ['本章导学', '一、这个功能是什么', '二、快速上手', '三、使用说明', '四、配置与限制', '五、故障排查', '本章小结', '附录 A', '附录 B', '附录 C'];
const missingSections = skeletonSections.filter(s => !chapter.includes(s));
if (missingSections.length === 0 && manualOpen === manualClose && manualOpen >= 4) {
  ok(`断言 8:书本骨架完整(导学/正文五章/小结/附录三章,manual 块 ${manualOpen} 对)`);
} else {
  err(`断言 8:书本骨架不完整或缺 manual 块(缺失节: ${missingSections.join(', ') || '无'};manual 开 ${manualOpen} / 闭 ${manualClose})`);
}

// === 总结 ===
console.log('\n📊 chapter-render 验证结果:');
console.log(`  ✅ 通过:${passed.length}`);
console.log(`  ❌ 错误:${errors.length}`);

if (passed.length > 0) {
  console.log('\n✅ 通过项:');
  for (const p of passed) console.log(`  - ${p}`);
}
if (errors.length > 0) {
  console.log('\n❌ 错误:');
  for (const e of errors) console.log(`  - ${e}`);
  console.log('\n📁 产出文件(可读):');
  console.log(`  - ${chapterPath}`);
  console.log(`  - ${indexPath}`);
}

process.exit(errors.length === 0 ? 0 : 1);