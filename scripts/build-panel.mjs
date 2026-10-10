#!/usr/bin/env node
/**
 * 组装面板单文件 ui/panel.html(零依赖,Node >= 20)
 *
 * 模板占位符(PANEL_CSS / MERMAID_JS / PANEL_JS,均包在注释定界符里)。
 * 内联时转义闭合标签,避免提前闭合 style/script(disk-cleaner 同款做法)。
 * 面板 HTML 随插件分发,必须提交;源码改动后重跑 npm run build:ui。
 *
 * --data <json 文件>:额外产出 .tmp/panel-dev/(panel.html + panel-data.json),
 *   供浏览器直开调试(无宿主桥时页面回退 fetch 同目录 panel-data.json)。
 */

import { mkdirSync, readFileSync, writeFileSync, copyFileSync, rmSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const escape = (text, tag) => text.replace(new RegExp(`</${tag}`, 'gi'), `<\\/${tag}`);

const template = readFileSync(join(ROOT, 'ui/panel.template.html'), 'utf8');
const css = readFileSync(join(ROOT, 'ui/src/panel.css'), 'utf8');
const panelJs = readFileSync(join(ROOT, 'ui/src/panel.js'), 'utf8');
const mermaidJs = readFileSync(join(ROOT, 'ui/src/mermaid.min.js'), 'utf8');

const html = template
  .replace('/*__PANEL_CSS__*/', () => escape(css, 'style'))
  .replace('/*__MERMAID_JS__*/', () => escape(mermaidJs, 'script'))
  .replace('/*__PANEL_JS__*/', () => escape(panelJs, 'script'));

writeFileSync(join(ROOT, 'ui/panel.html'), html);
const kib = Math.round(Buffer.byteLength(html) / 1024);
process.stdout.write(`面板已生成: ui/panel.html(${kib} KiB,宿主上限 16 MiB)\n`);

const dataIdx = process.argv.indexOf('--data');
if (dataIdx > 0 && process.argv[dataIdx + 1]) {
  const dataPath = resolve(process.argv[dataIdx + 1]);
  const devDir = join(ROOT, '.tmp/panel-dev');
  rmSync(devDir, { recursive: true, force: true });
  mkdirSync(devDir, { recursive: true });
  copyFileSync(join(ROOT, 'ui/panel.html'), join(devDir, 'panel.html'));
  copyFileSync(dataPath, join(devDir, 'panel-data.json'));
  process.stdout.write(`浏览器调试目录: .tmp/panel-dev/(直接打开 panel.html)\n`);
}
