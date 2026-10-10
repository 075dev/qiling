#!/usr/bin/env node
/**
 * 器灵契约/流程图面板 —— MCP stdio 服务(零依赖,Node >= 20)
 *
 * 职责(ZCode UI Plugin,见官方 UI_PLUGIN.md):
 * - 注册 ui://qiling/panel.html 资源,返回 text/html;profile=mcp-app(单文件内联面板)
 * - 注册 ql://panel/data.json 资源:每次读取都从当前工作区磁盘现算
 *   (.qiling/planning/context/{openapi.yaml,event-flow.md} + STATE.md,兼容旧 .planning/ 布局)
 * - 工具 ql_design_panel:模型可调用,带 _meta.ui 打开交互面板并返回概要
 * - 工具 ql_panel_data:数据备用通道(资源读取不可用时兜底,注意 64KiB structuredContent 上限)
 *
 * 协议:stdio 上按行分隔的 JSON-RPC 2.0(MCP 规范)。调试日志只写 stderr。
 */

import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';
import process from 'node:process';

const require = createRequire(import.meta.url);
const yaml = require('./vendor/js-yaml.min.cjs');

const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function manifestVersion() {
  try {
    return JSON.parse(readFileSync(join(PLUGIN_ROOT, '.zcode-plugin/plugin.json'), 'utf8')).version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

const SERVER_INFO = { name: 'qiling-ui', title: '器灵契约面板', version: manifestVersion() };

// ---------- 工件定位与解析 ----------

const PLANNING_CANDIDATES = ['.qiling/planning', '.planning'];
const CONTEXT_FILES = {
  openapi: ['context/openapi.yaml', 'context/openapi.yml'],
  flow: ['context/event-flow.md'],
  state: ['STATE.md'],
};

function findWorkspaceRoot() {
  const candidates = [process.env.ZCODE_WORKSPACE_ROOT, process.cwd()].filter(Boolean);
  for (const c of candidates) {
    const abs = resolve(c);
    if (existsSync(abs)) return abs;
  }
  return process.cwd();
}

function firstExisting(planningDir, relList) {
  for (const rel of relList) {
    const abs = join(planningDir, rel);
    if (existsSync(abs)) return abs;
  }
  return null;
}

function findArtifacts(root) {
  for (const dir of PLANNING_CANDIDATES) {
    const planningDir = join(root, dir);
    if (!existsSync(planningDir)) continue;
    const out = {
      planningDir: dir,
      openapi: firstExisting(planningDir, CONTEXT_FILES.openapi),
      flow: firstExisting(planningDir, CONTEXT_FILES.flow),
      state: firstExisting(planningDir, CONTEXT_FILES.state),
    };
    if (out.openapi || out.flow || out.state) return out;
  }
  return { planningDir: null, openapi: null, flow: null, state: null };
}

function parseOpenapi(absPath) {
  const raw = readFileSync(absPath, 'utf8');
  const doc = yaml.load(raw);
  if (!doc || typeof doc !== 'object') throw new Error('openapi.yaml 解析结果为空');

  const info = doc.info && typeof doc.info === 'object' ? doc.info : {};
  const httpMethods = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace']);
  const operations = [];

  const paths = doc.paths && typeof doc.paths === 'object' ? doc.paths : {};
  for (const [path, pathItem] of Object.entries(paths)) {
    if (!pathItem || typeof pathItem !== 'object') continue;
    for (const [method, op] of Object.entries(pathItem)) {
      if (!httpMethods.has(method) || !op || typeof op !== 'object') continue;
      operations.push({
        method: method.toUpperCase(),
        path,
        operationId: op.operationId || null,
        summary: op.summary || '',
        description: op.description || '',
        tags: Array.isArray(op.tags) ? op.tags : [],
        deprecated: Boolean(op.deprecated),
        parameters: Array.isArray(op.parameters) ? op.parameters : [],
        requestBody: op.requestBody || null,
        responses: op.responses && typeof op.responses === 'object' ? op.responses : {},
      });
    }
  }

  return {
    found: true,
    path: absPath,
    openapi: doc.openapi || null,
    title: info.title || '未命名契约',
    version: info.version || '',
    description: info.description || '',
    servers: Array.isArray(doc.servers) ? doc.servers : [],
    tags: Array.isArray(doc.tags) ? doc.tags : [],
    operations,
    components: doc.components && typeof doc.components === 'object' ? doc.components : {},
  };
}

/** 提取 markdown 中的 ```mermaid 代码块,标题取其上方最近的标题行。 */
function parseFlow(absPath) {
  const raw = readFileSync(absPath, 'utf8');
  const lines = raw.split(/\r?\n/);
  const diagrams = [];
  let lastHeading = '';
  let inFence = false;
  let fenceLang = '';
  let buf = [];

  const flush = () => {
    if (!inFence) return;
    const code = buf.join('\n').trim();
    if (fenceLang === 'mermaid' && code) {
      const type = (code.split(/\s+/)[0] || '').trim();
      diagrams.push({ title: lastHeading || `图 ${diagrams.length + 1}`, type, code });
    }
    inFence = false;
    fenceLang = '';
    buf = [];
  };

  for (const line of lines) {
    const fence = line.match(/^\s*```\s*(\S*)\s*$/);
    if (fence) {
      if (inFence) flush();
      else {
        inFence = true;
        fenceLang = fence[1] || '';
        buf = [];
      }
      continue;
    }
    if (inFence) {
      buf.push(line);
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.+?)\s*$/);
    if (heading) lastHeading = heading[2].trim();
  }
  flush();

  const h1 = raw.match(/^#\s+(.+?)\s*$/m);
  return {
    found: true,
    path: absPath,
    title: h1 ? h1[1].trim() : '事件流程',
    diagrams,
  };
}

/** STATE.md YAML frontmatter 的宽容解析:只取需要的平铺 key: value。 */
function parseState(absPath) {
  const raw = readFileSync(absPath, 'utf8');
  const fm = raw.match(/^---\s*\n([\s\S]*?)\n---/);
  const state = { found: true, path: absPath };
  if (!fm) return { ...state, status: null };
  const wanted = new Set([
    'status', 'current_phase', 'ql_version', 'api_endpoints_count',
    'event_messages_count', 'work_branch', 'review_verdict',
  ]);
  for (const line of fm[1].split(/\r?\n/)) {
    const m = line.match(/^([a-z_]+)\s*:\s*(.+?)\s*$/);
    if (m && wanted.has(m[1])) state[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
  return state;
}

function buildPanelData() {
  const root = findWorkspaceRoot();
  const artifacts = findArtifacts(root);
  const data = {
    generatedAt: new Date().toISOString(),
    workspace: root,
    contract: { found: false },
    flow: { found: false },
    state: { found: false },
    errors: [],
  };
  if (artifacts.openapi) {
    try {
      data.contract = parseOpenapi(artifacts.openapi);
    } catch (e) {
      data.contract = { found: false, path: artifacts.openapi, error: String(e.message || e) };
      data.errors.push(`openapi.yaml 解析失败: ${e.message}`);
    }
  }
  if (artifacts.flow) {
    try {
      data.flow = parseFlow(artifacts.flow);
    } catch (e) {
      data.flow = { found: false, path: artifacts.flow, error: String(e.message || e) };
      data.errors.push(`event-flow.md 解析失败: ${e.message}`);
    }
  }
  if (artifacts.state) {
    try {
      data.state = parseState(artifacts.state);
    } catch (e) {
      data.state = { found: false, error: String(e.message || e) };
    }
  }
  return data;
}

function summarize(data) {
  const opCount = data.contract.found ? data.contract.operations.length : 0;
  const diagramCount = data.flow.found ? data.flow.diagrams.length : 0;
  return {
    workspace: data.workspace,
    title: data.contract.found ? data.contract.title : null,
    contractVersion: data.contract.found ? data.contract.version : null,
    endpoints: opCount,
    diagrams: diagramCount,
    status: data.state.found ? data.state.status ?? null : null,
    currentPhase: data.state.found ? data.state.current_phase ?? null : null,
    dataUri: 'ql://panel/data.json',
    errors: data.errors,
  };
}

// ---------- 资源 ----------

const UI_RESOURCE_URI = 'ui://qiling/panel.html';
const DATA_RESOURCE_URI = 'ql://panel/data.json';

function panelHtmlResource() {
  const abs = join(PLUGIN_ROOT, 'ui', 'panel.html');
  return {
    uri: UI_RESOURCE_URI,
    name: '器灵契约面板',
    title: '器灵契约/流程图交互面板',
    description: 'ql-design 产出的 OpenAPI 契约与 Mermaid 事件流程图交互面板(端点浏览、$ref 展开、流程图渲染)。',
    mimeType: 'text/html;profile=mcp-app',
    _meta: { 'zcode/csp': { unsafeEval: true } },
  };
}

function dataResource() {
  return {
    uri: DATA_RESOURCE_URI,
    name: '面板数据',
    description: '从当前工作区 .qiling/planning/ 现算的契约与流程图数据(JSON)。',
    mimeType: 'application/json',
  };
}

function readResource(uri) {
  if (uri === UI_RESOURCE_URI) {
    const text = readFileSync(join(PLUGIN_ROOT, 'ui', 'panel.html'), 'utf8');
    return { contents: [{ uri, mimeType: 'text/html;profile=mcp-app', text }] };
  }
  if (uri === DATA_RESOURCE_URI) {
    const data = buildPanelData();
    return { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(data) }] };
  }
  throw new Error(`未知资源: ${uri}`);
}

// ---------- 工具 ----------

function panelOpenText(data) {
  const s = summarize(data);
  if (!data.contract.found && !data.flow.found) {
    return [
      '未找到器灵规划工件(大约在 .qiling/planning/context/ 下找 openapi.yaml 与 event-flow.md)。',
      '面板已打开,显示引导信息;也可先运行 /ql-design 产出契约与流程图,再打开面板。',
    ].join('\n');
  }
  const parts = [`契约面板数据已就绪:${s.endpoints} 个端点 / ${s.diagrams} 张流程图`];
  if (s.title) parts.push(`契约《${s.title}》${s.contractVersion ? `v${s.contractVersion}` : ''}`.trim());
  if (s.status) parts.push(`项目状态:${s.status}${s.currentPhase != null ? `(阶段 ${s.currentPhase})` : ''}`);
  parts.push('交互面板已在宿主打开(也可在会话侧栏「器灵契约面板」手动打开)。');
  if (s.errors?.length) parts.push(`解析警告: ${s.errors.join(';')}`);
  return parts.join('\n');
}

const TOOLS = [
  {
    name: 'ql_design_panel',
    description:
      '打开器灵契约/流程图交互面板(可视化 ql-design 产出)。读取当前工作区 .qiling/planning/ 下的 ' +
      'openapi.yaml 与 event-flow.md,在宿主打开交互面板:按 tag 浏览端点、展开参数与 schema($ref 解析)、' +
      '渲染 Mermaid 流程图(sequenceDiagram/stateDiagram/flowchart)、显示 STATE.md 阶段状态。' +
      '适用时机:ql-design 冻结或修订契约后向用户展示;用户要求查看契约/流程图;ql-add 增量修订后复核。',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    _meta: { ui: { resourceUri: UI_RESOURCE_URI, surface: 'design' } },
    async run() {
      const data = buildPanelData();
      const summary = summarize(data);
      return {
        content: [{ type: 'text', text: panelOpenText(data) }],
        structuredContent: summary,
      };
    },
  },
  {
    name: 'ql_panel_data',
    description:
      '读取契约/流程图面板数据(结构化 JSON:契约端点/组件 schema/流程图代码/项目状态)。' +
      '面板页面内部使用;数据较大时优先用资源读取 ql://panel/data.json(8MiB 上限),本工具结果受 64KiB structuredContent 限制。',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    _meta: { ui: { visibility: ['model', 'app'] } },
    async run() {
      const data = buildPanelData();
      return {
        content: [{ type: 'text', text: JSON.stringify(data) }],
        structuredContent: data,
      };
    },
  },
];

// ---------- JSON-RPC 分发 ----------

function toolDefinition(t) {
  return {
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
    _meta: t._meta,
  };
}

const METHODS = {
  initialize(params) {
    return {
      protocolVersion: params?.protocolVersion || '2025-06-18',
      capabilities: { tools: { listChanged: false }, resources: { subscribe: false, listChanged: false } },
      serverInfo: SERVER_INFO,
    };
  },
  ping() {
    return {};
  },
  'tools/list'() {
    return { tools: TOOLS.map(toolDefinition) };
  },
  async 'tools/call'(params) {
    const tool = TOOLS.find((t) => t.name === params?.name);
    if (!tool) throw new Error(`未知工具: ${params?.name}`);
    const result = await tool.run(params.arguments || {});
    result.isError = false;
    return result;
  },
  'resources/list'() {
    return { resources: [panelHtmlResource(), dataResource()] };
  },
  'resources/read'(params) {
    return readResource(params?.uri);
  },
};

function reply(id, result) {
  writeLine({ jsonrpc: '2.0', id, result });
}
function replyError(id, code, message) {
  writeLine({ jsonrpc: '2.0', id, error: { code, message } });
}
function writeLine(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

function log(...args) {
  process.stderr.write(`[qiling-ui] ${args.join(' ')}\n`);
}

async function dispatch(msg) {
  const { id, method, params } = msg;
  if (method === undefined) return; // 响应帧,服务端不期待
  if (method?.startsWith('notifications/')) {
    if (method === 'notifications/initialized') log('客户端初始化完成');
    return;
  }
  const handler = METHODS[method];
  if (!handler) {
    if (id !== undefined) replyError(id, -32601, `方法不存在: ${method}`);
    return;
  }
  try {
    const result = await handler(params);
    if (id !== undefined) reply(id, result);
  } catch (e) {
    log(`处理 ${method} 失败:`, e.stack || e.message || e);
    if (id !== undefined) replyError(id, -32000, String(e.message || e));
  }
}

function main() {
  log(`启动:${SERVER_INFO.name}@${SERVER_INFO.version},插件根 ${PLUGIN_ROOT}`);
  const rl = createInterface({ input: process.stdin, terminal: false });
  rl.on('line', (line) => {
    const text = line.trim();
    if (!text) return;
    let msg;
    try {
      msg = JSON.parse(text);
    } catch (e) {
      log('无法解析的帧(忽略):', text.slice(0, 120));
      return;
    }
    void dispatch(msg);
  });
  rl.on('close', () => {
    log('stdin 关闭,退出');
    process.exit(0);
  });
  process.on('SIGINT', () => process.exit(0));
}

main();
