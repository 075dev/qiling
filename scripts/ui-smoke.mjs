#!/usr/bin/env node
/**
 * UI 面板冒烟测试(零依赖,Node >= 20)
 *
 * 直接 spawn mcp/server.mjs,走完整 stdio JSON-RPC:
 * initialize → tools/list → tools/call(ql_design_panel) → resources/list
 * → resources/read(ui://qiling/panel.html + ql://panel/data.json)
 * 对当前仓库 .qiling/planning/ 样本工件断言:端点数 > 0、流程图数 > 0、
 * 面板 HTML 含 mermaid 与 profile=mcp-app、数据 JSON 契约字段齐全。
 */

import { spawn } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const serverPath = join(ROOT, 'mcp', 'server.mjs');

const child = spawn(process.execPath, [serverPath], {
  cwd: ROOT,
  env: { ...process.env, ZCODE_WORKSPACE_ROOT: ROOT },
  stdio: ['pipe', 'pipe', 'pipe'],
});

let stderrBuf = '';
child.stderr.on('data', (d) => { stderrBuf += d; });

const pending = new Map();
let buf = '';
child.stdout.on('data', (chunk) => {
  buf += chunk;
  let idx;
  while ((idx = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, idx).trim();
    buf = buf.slice(idx + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch { continue; }
    if (msg.id !== undefined && pending.has(msg.id)) {
      const { resolve: res, reject: rej } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) rej(new Error(`${msg.error.message}(code ${msg.error.code})`));
      else res(msg.result);
    }
  }
});

let nextId = 1;
function rpc(method, params) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error(`超时: ${method}`));
      }
    }, 15000);
  });
}

const failures = [];
function check(cond, label) {
  console.log(`  ${cond ? '✅' : '❌'} ${label}`);
  if (!cond) failures.push(label);
}

try {
  // 1. 握手
  const init = await rpc('initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'qiling-ui-smoke', version: '0.0.0' },
  });
  check(init.serverInfo?.name === 'qiling-ui', `initialize → serverInfo.name=qiling-ui(${init.serverInfo?.version})`);
  check(Boolean(init.capabilities?.tools && init.capabilities?.resources), 'initialize → capabilities.tools/resources 已声明');
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');

  // 2. 工具清单与 _meta.ui
  const tools = await rpc('tools/list', {});
  const names = (tools.tools || []).map((t) => t.name);
  check(names.includes('ql_design_panel'), `tools/list 含 ql_design_panel(${names.join(', ')})`);
  const opener = tools.tools.find((t) => t.name === 'ql_design_panel');
  check(opener?._meta?.ui?.resourceUri === 'ui://qiling/panel.html', 'ql_design_panel._meta.ui.resourceUri = ui://qiling/panel.html');
  check(opener?._meta?.ui?.surface === 'design', 'ql_design_panel._meta.ui.surface = design');
  const dataTool = tools.tools.find((t) => t.name === 'ql_panel_data');
  check(JSON.stringify(dataTool?._meta?.ui?.visibility) === JSON.stringify(['model', 'app']), 'ql_panel_data visibility = [model, app]');

  // 3. 调用打开面板
  const opened = await rpc('tools/call', { name: 'ql_design_panel', arguments: {} });
  const sc = opened.structuredContent || {};
  check(typeof sc.endpoints === 'number' && sc.endpoints > 0, `ql_design_panel → 端点数 ${sc.endpoints}`);
  check(typeof sc.diagrams === 'number' && sc.diagrams > 0, `ql_design_panel → 流程图数 ${sc.diagrams}`);
  check(sc.status === 'reviewed', `ql_design_panel → STATE.status=${sc.status}`);

  // 4. 资源清单
  const resources = await rpc('resources/list', {});
  const uris = (resources.resources || []).map((r) => r.uri);
  check(uris.includes('ui://qiling/panel.html'), `resources/list 含面板页(${uris.join(', ')})`);
  check(uris.includes('ql://panel/data.json'), 'resources/list 含数据资源');

  // 5. 读面板 HTML
  const page = await rpc('resources/read', { uri: 'ui://qiling/panel.html' });
  const html = page.contents?.[0]?.text || '';
  check(page.contents?.[0]?.mimeType === 'text/html;profile=mcp-app', '面板资源 mimeType = text/html;profile=mcp-app');
  check(html.includes('globalThis["mermaid"]') || html.includes('mermaid'), '面板 HTML 内联 mermaid');
  check(html.includes('器灵契约面板'), '面板 HTML 含页面入口文本');
  check(!html.includes('__PANEL_JS__') && !html.includes('__MERMAID_JS__'), '面板 HTML 无未替换占位符');

  // 6. 读数据资源
  const dataRes = await rpc('resources/read', { uri: 'ql://panel/data.json' });
  const data = JSON.parse(dataRes.contents?.[0]?.text || '{}');
  check(data.contract?.found === true && data.contract.operations?.length > 0, `数据资源 → contract.operations=${data.contract?.operations?.length}`);
  check(data.flow?.found === true && data.flow.diagrams?.length > 0, `数据资源 → flow.diagrams=${data.flow?.diagrams?.length}`);
  check(data.contract?.components != null, '数据资源 → components.schemas 可展开');
  check(data.state?.found === true, `数据资源 → state.status=${data.state?.status}`);

  // 7. 数据工具兜底通道
  const viaTool = await rpc('tools/call', { name: 'ql_panel_data', arguments: {} });
  check(viaTool.structuredContent?.contract?.found === true, 'ql_panel_data → structuredContent.contract.found');
} catch (e) {
  failures.push(`异常: ${e.message}`);
  console.error('  ❌ 异常:', e.message);
}

child.kill();
if (stderrBuf.trim()) {
  console.log('\n—— 服务端 stderr(调试日志)——');
  console.log(stderrBuf.trim().split('\n').slice(0, 12).join('\n'));
}

console.log(failures.length ? `\n❌ 冒烟失败 ${failures.length} 项` : '\n✅ UI 面板冒烟全部通过');
process.exit(failures.length ? 1 : 0);
