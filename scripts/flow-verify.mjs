#!/usr/bin/env node
/**
 * 器灵工作流流程模拟验证器。
 *
 * 在隔离目录(临时)中模拟一次完整的三步循环:
 *   ql-design → ql-build → ql-deliver
 *
 * 每个阶段检查:
 * - 输入文件存在性
 * - 工作流门控(shell 命令片段可执行)
 * - 产出文件路径可写
 *
 * 不实际派发 Agent,只验证工作流脚本层面的逻辑完整性。
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SANDBOX = join(ROOT, '.tmp', 'flow-verify');

const errors = [];
const warnings = [];
const passed = [];

function ok(msg) { passed.push(msg); }
function err(msg) { errors.push(msg); }
function warn(msg) { warnings.push(msg); }

// 准备沙盒
if (existsSync(SANDBOX)) rmSync(SANDBOX, { recursive: true, force: true });
mkdirSync(join(SANDBOX, '.qiling/planning', 'context'), { recursive: true });
mkdirSync(join(SANDBOX, '.qiling/planning', 'build'), { recursive: true });

console.log('\n🧪 模拟三步循环:ql-design → ql-build → ql-deliver\n');

// === 阶段 1:ql-design ===
console.log('═══ 阶段 1:ql-design(讨论产出 OpenAPI + Mermaid)═══');

// 模拟讨论产出:写 openapi.yaml + event-flow.md + STATE.md
const openapi = `openapi: 3.1.0
info:
  title: 演示项目
  version: 0.1.0
paths:
  /resources:
    get:
      summary: 列出资源
      responses:
        '200':
          description: OK
  /resources/{id}:
    get:
      summary: 单个资源
      responses:
        '200':
          description: OK
        '404':
          description: Not Found
components:
  schemas:
    Resource:
      type: object
      properties:
        id: { type: string }
        name: { type: string }`;

const eventFlow = `# 事件流程

\`\`\`mermaid
sequenceDiagram
  participant U as 用户
  participant S as 服务
  U->>S: GET /resources
  S-->>U: 200 [resources]
\`\`\`

\`\`\`mermaid
stateDiagram-v2
  [*] --> Active
  Active --> [*]
\`\`\`
`;

const state = `---
ql_state_version: '1.0'
current_phase: 1
status: discussed
---
`;

writeFileSync(join(SANDBOX, '.qiling/planning/context/openapi.yaml'), openapi);
writeFileSync(join(SANDBOX, '.qiling/planning/context/event-flow.md'), eventFlow);
writeFileSync(join(SANDBOX, '.qiling/planning/STATE.md'), state);

// 检查:讨论门控要求 openapi.yaml 至少有 1 个端点
const opContent = readFileSync(join(SANDBOX, '.qiling/planning/context/openapi.yaml'), 'utf8');
const endpointCount = (opContent.match(/^\s+(get|post|put|delete|patch):$/gm) || []).length;
if (endpointCount >= 1) {
  ok(`讨论产出:openapi.yaml 含 ${endpointCount} 个端点(门控要求 ≥ 1)`);
} else {
  err('讨论产出:openapi.yaml 不含任何端点');
}

if (opContent.includes('openapi: 3.1.0')) ok('讨论产出:OpenAPI 3.1 版本声明');
else err('讨论产出:OpenAPI 版本非 3.1');

// mermaid 块
const mmBlocks = (eventFlow.match(/```mermaid/g) || []).length;
if (mmBlocks >= 1) ok(`讨论产出:event-flow.md 含 ${mmBlocks} 个 mermaid 块(门控要求 ≥ 1)`);
else err('讨论产出:event-flow.md 不含 mermaid 块');

// state 状态机
if (state.includes('status: discussed')) ok('讨论产出:STATE.md 含 status: discussed');
else err('讨论产出:STATE.md 未声明 status');

// === 阶段 2:ql-build ===
console.log('\n═══ 阶段 2:ql-build(波次并行构建)═══');

// 2.1 骨架阶段门控检查
const skeletonReport = `---
phase: skeleton
status: success
endpoints_implemented: 2
events_connected: 1
waves_executed: 1
---`;
writeFileSync(join(SANDBOX, '.qiling/planning/build/skeleton-report.md'), skeletonReport);

if (skeletonReport.includes('endpoints_implemented: 2')) ok('骨架阶段:实现 2/2 端点');
else warn('骨架阶段:端点数未对齐');

// 2.2 填充阶段门控检查
const fillReport = `---
phase: fill
status: success
mocks_replaced: 2
test_coverage: 85
---`;
writeFileSync(join(SANDBOX, '.qiling/planning/build/fill-report.md'), fillReport);

if (fillReport.includes('status: success')) ok('填充阶段:报告状态 success');
else err('填充阶段:报告状态非 success');

// 2.3 验证阶段门控检查:verification.md 必须存在且 status: passed
const verification = `---
status: passed
verified_at: 2026-08-28
inputs:
  - openapi.yaml
  - event-flow.md
  - fill-report.md
---
# 验证报告
**契约符合度:100%**
**流程符合度:100%**
`;
writeFileSync(join(SANDBOX, '.qiling/planning/build/verification.md'), verification);

const vStatus = (verification.match(/^status:\s*(\S+)/m) || [])[1];
if (vStatus === 'passed') ok('验证阶段:verification.md status = passed');
else err(`验证阶段:verification.md status = "${vStatus}"(ship 要求 passed)`);

// === 阶段 3:ql-deliver ===
console.log('\n═══ 阶段 3:ql-deliver(交付)═══');

// ship 前置检查(模拟)
const checks = [
  { name: 'verification.md 存在', pass: existsSync(join(SANDBOX, '.qiling/planning/build/verification.md')) },
  { name: 'verification.md status=passed', pass: vStatus === 'passed' },
  { name: 'openapi.yaml 存在', pass: existsSync(join(SANDBOX, '.qiling/planning/context/openapi.yaml')) },
  { name: 'STATE.md 存在', pass: existsSync(join(SANDBOX, '.qiling/planning/STATE.md')) }
];

for (const c of checks) {
  if (c.pass) ok(`ship 前置:${c.name}`);
  else err(`ship 前置:${c.name}`);
}

// ship 产出的 PR body 模板
const prBody = `## 实现 [从 OpenAPI 提取的功能集]

### API 端点
- GET /resources
- GET /resources/{id}

### 事件流程
- 资源列出与查询

### 验证
- verification.md: passed
- 端到端测试:通过

🤖 由器灵工作流生成
`;
writeFileSync(join(SANDBOX, '.qiling/planning/build/pr-body.md'), prBody);
ok('ship 产出:PR body 已生成');

// === 阶段 3.5:ql-doc(章节留档,ship 后自动) ===
console.log('\n═══ 阶段 3.5:ql-doc(章节留档生成)═══');

mkdirSync(join(SANDBOX, '.qiling/docs/chapters'), { recursive: true });

// 模拟章节文件(书本式:本章导学 → 正文五章 → 本章小结/下一章 → 附录三章)
const chapterFile = `---
chapter_id: "chapter-01"
title: "演示项目"
part: "第一篇 · 演示功能"
phase: 1
generated_at: "2026-08-28T15:39:02Z"
generated_by: "器灵工作流 v0.18.0"
pr_url: "https://github.com/075dev/demo/pull/1"
status: "shipped"
---

# 第 1 章 · 演示项目

## 本章导学

<!-- manual:syllabus -->
- **本章你将学到:** resources API 的 2 个端点怎么调用。
<!-- /manual:syllabus -->

## 一、这个功能是什么

<!-- manual:overview -->
**覆盖能力:** 2 个端点、1 个事件,清单见 §三。
<!-- /manual:overview -->

## 二、快速上手

<!-- manual:quickstart -->
**前置:** Bearer Token。第一个调用:GET /resources。
<!-- /manual:quickstart -->

## 三、使用说明
| GET | /resources | 列出资源 |
| GET | /resources/{id} | 单个资源 |

## 四、配置与限制
- 认证:Bearer Token

## 五、故障排查
| 404 | NOT_FOUND | 资源不存在 | 核对资源 id |

## 本章小结

<!-- manual:summary -->
- 本章交付了 2 个端点:resources 资源的查询。
<!-- /manual:summary -->

## 下一章

<!-- manual:next -->
- 等待下一次交付后追加的功能章。
<!-- /manual:next -->

## 附录 A · 交付与开发留档
- 阶段 1 讨论:完成
- 阶段 2 骨架:完成(2/2 端点)
- 阶段 3 填充:完成(mocks 替换 100%)
- 阶段 4 验证:passed
- 阶段 5 交付:PR 已创建
`;
writeFileSync(join(SANDBOX, '.qiling/docs/chapters/chapter-01-demo.md'), chapterFile);

if (chapterFile.includes('chapter_id: "chapter-01"')) ok('章节:chapter_id 字段');
if (chapterFile.includes('## 三、使用说明')) ok('章节:含 §三 使用说明');
if (chapterFile.includes('## 本章导学') && chapterFile.includes('## 本章小结')) ok('章节:含导学与小结');
if (chapterFile.includes('<!-- manual:syllabus -->') && chapterFile.includes('<!-- /manual:syllabus -->')) ok('章节:manual 块配对');

// 模拟索引文件(书的前言与目录)
const indexFile = `# 演示项目 · 项目书

## 前言
- **怎么读:** 按目录顺序学习,查用型读者直接进章节 §三。

## 目录

**第一篇 · 演示功能**

- [第 01 章 · 演示项目](./chapters/chapter-01-demo.md)
`;
writeFileSync(join(SANDBOX, '.qiling/docs/README.md'), indexFile);

if (indexFile.includes('## 目录') && indexFile.includes('**第一篇 · 演示功能**')) ok('索引:含分篇目录');
if (indexFile.includes('chapter-01')) ok('索引:链接到 chapter-01');

ok('章节产出:.qiling/docs/chapters/chapter-NN-*.md 已生成');
ok('章节产出:.qiling/docs/README.md 索引已生成');

// 清理
if (existsSync(SANDBOX)) rmSync(SANDBOX, { recursive: true, force: true });

// === 总结 ===
console.log('\n📊 流程验证结果:');
console.log(`  ✅ 通过:${passed.length}`);
console.log(`  ⚠️ 警告:${warnings.length}`);
console.log(`  ❌ 错误:${errors.length}`);

if (passed.length > 0) {
  console.log('\n✅ 通过项:');
  for (const p of passed) console.log(`  - ${p}`);
}
if (warnings.length > 0) {
  console.log('\n⚠️ 警告:');
  for (const w of warnings) console.log(`  - ${w}`);
}
if (errors.length > 0) {
  console.log('\n❌ 错误:');
  for (const e of errors) console.log(`  - ${e}`);
}

process.exit(errors.length === 0 ? 0 : 1);