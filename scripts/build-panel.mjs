#!/usr/bin/env node
/**
 * 组装面板单文件 ui/panel.html 与文档面板 ui/docs.html(零依赖,Node >= 20)
 *
 * 模板占位符(均包在注释定界符里;契约面板 PANEL_* / 文档面板 DOCS_*):
 *   panel: PANEL_CSS / MERMAID_JS / PANEL_JS
 *   docs:  DOCS_CSS  / MERMAID_JS / DOCS_JS
 * 内联时转义闭合标签,避免提前闭合 style/script(disk-cleaner 同款做法)。
 * 面板 HTML 随插件分发,必须提交;源码改动后重跑 npm run build:ui。
 *
 * --data <json 文件>:额外产出 .tmp/panel-dev/(panel.html + panel-data.json),
 *   供浏览器直开调试(无宿主桥时页面回退 fetch 同目录 panel-data.json)。
 * --docs-data <json 文件>:同上产出 .tmp/docs-dev/(docs.html + docs-data.json)。
 */

import { mkdirSync, readFileSync, writeFileSync, copyFileSync, rmSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const escape = (text, tag) => text.replace(new RegExp(`</${tag}`, 'gi'), `<\\/${tag}`);

function chunk(relPath, tag) {
  const text = readFileSync(join(ROOT, relPath), 'utf8');
  return escape(text, tag);
}

const targets = [
  {
    name: '面板',
    template: 'ui/panel.template.html',
    out: 'ui/panel.html',
    chunks: {
      '/*__PANEL_CSS__*/': () => chunk('ui/src/panel.css', 'style'),
      '/*__MERMAID_JS__*/': () => chunk('ui/src/mermaid.min.js', 'script'),
      '/*__PANEL_JS__*/': () => chunk('ui/src/panel.js', 'script'),
    },
    placeholder: '__PANEL_JS__',
    dataFile: 'panel-data.json',
    dataFlag: '--data',
    devDir: '.tmp/panel-dev',
  },
  {
    name: '文档面板',
    template: 'ui/docs.template.html',
    out: 'ui/docs.html',
    chunks: {
      '/*__DOCS_CSS__*/': () => chunk('ui/src/docs.css', 'style'),
      '/*__MERMAID_JS__*/': () => chunk('ui/src/mermaid.min.js', 'script'),
      '/*__DOCS_JS__*/': () => chunk('ui/src/docs.js', 'script'),
    },
    placeholder: '__DOCS_JS__',
    dataFile: 'docs-data.json',
    dataFlag: '--docs-data',
    devDir: '.tmp/docs-dev',
  },
];

for (const t of targets) {
  const template = readFileSync(join(ROOT, t.template), 'utf8');
  let html = template;
  for (const [ph, produce] of Object.entries(t.chunks)) {
    html = html.replace(ph, produce);
  }
  if (html.includes(t.placeholder) || /__(PANEL|DOCS|MERMAID)_(CSS|JS)__/.test(html)) {
    process.stderr.write(`错误: ${t.template} 存在未替换的占位符\n`);
    process.exit(1);
  }
  writeFileSync(join(ROOT, t.out), html);
  const kib = Math.round(Buffer.byteLength(html) / 1024);
  process.stdout.write(`${t.name}已生成: ${t.out}(${kib} KiB,宿主上限 16 MiB)\n`);
}

function devCopy(flag, devDir, dataFile) {
  const idx = process.argv.indexOf(flag);
  if (idx <= 0 || !process.argv[idx + 1]) return;
  const dataPath = resolve(process.argv[idx + 1]);
  const dir = join(ROOT, devDir);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const outName = devDir.includes('docs') ? 'docs.html' : 'panel.html';
  copyFileSync(join(ROOT, 'ui', outName), join(dir, outName));
  copyFileSync(dataPath, join(dir, dataFile));
  process.stdout.write(`浏览器调试目录: ${devDir}/(直接打开 ${outName})\n`);
}
devCopy('--data', '.tmp/panel-dev', 'panel-data.json');
devCopy('--docs-data', '.tmp/docs-dev', 'docs-data.json');
