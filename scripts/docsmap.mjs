#!/usr/bin/env node
/**
 * ql-scan 文档树渲染器(端到端):从项目目录扫描产出与 ql-doc 完全一致格式的章节文档。
 *
 * 设计目标:与 chapter-render.mjs 产出**布局完全相同**,确保 ql-scan 与 ql-doc
 * 共享同一索引 `.qiling/docs/README.md`,不产生格式分裂。
 *
 * 严谨性承诺(对标 GSD map-codebase,详见 docs/CHAPTER-ARCHITECTURE.md):
 *   1. 证据锚点 —— 每条提取结果带 `文件:行号`,无一例外
 *   2. 未检出显式声明 —— 未发现的内容写"未检出(Not detected)"+ 原因,禁止留空或编造
 *   3. 不画假图 —— mermaid 图必须引用真实检测到的脚本名/入口文件,检不出就不画
 *   4. 新鲜度戳 —— frontmatter 写入 last_mapped_commit(git HEAD),由本脚本(shell)写入,
 *      不依赖 agent 自觉;索引可据此提示文档是否过期
 *   5. 密钥扫描 —— 产出文档后正则扫描,命中即报错,防止把敏感值写进文档
 *   6. 版本号单一来源 —— 一律读 package.json,禁止硬编码
 *
 * 输入:
 *   --root <dir>       —— 目标项目根目录(扫描与产出都相对它;默认 = 脚本所在仓库根)
 *   --scan-path <dir>  —— 扫描子目录(默认 = --root)
 *   --project-name <name> —— 项目名(默认从 --root/package.json 读)
 *   --chapter-id <id>  —— 章节 ID(默认自动计算)
 *   --out <file>       —— 输出章节文件路径(默认自动)
 *   --force            —— 覆盖已存在的同 slug 章节(项目结构大改后重扫)
 *   --update-index     —— 只重建索引 .qiling/docs/README.md(不生成章节)
 *   --patterns <file>  —— 自定义提取器配置(JSON 数组,补内置提取器测不到的注册风格):
 *                          [{"name": "vscode 树视图", "regex": "createTreeView\\(\\s*['\"`]([^'\"`]+)", "glob": "*.ts"}]
 *                          name=表标题;regex 的第 1 个捕获组 = 条目标识;glob 可选(默认全部代码文件)
 *
 * 输出:
 *   - .qiling/docs/chapters/chapter-NN-*.md(与 ql-doc 同 5 节结构)
 *   - .qiling/docs/README.md(索引,与 ql-doc 共享同一格式)
 *
 * 用法:
 *   node scripts/docsmap.mjs [--root <dir>] [选项]
 *   node scripts/docsmap.mjs --update-index [--root <dir>]
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, basename, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
// PLUGIN_ROOT = 器灵插件自身(版本号从这里读);--root 才是目标项目
const PLUGIN_ROOT = join(__dirname, '..');

// === 参数解析 ===
const args = process.argv.slice(2);
const opts = {};
const flags = new Set();
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--force') { flags.add('force'); continue; }
  if (args[i] === '--update-index') { flags.add('update-index'); continue; }
  if (args[i].startsWith('--')) {
    if (i + 1 >= args.length || args[i + 1].startsWith('--')) {
      console.error(`❌ 参数 ${args[i]} 缺少值`); process.exit(2);
    }
    opts[args[i].slice(2)] = args[i + 1];
    i++;
  }
}

const UPDATE_INDEX_ONLY = flags.has('update-index');
const FORCE = flags.has('force');

// ROOT:目标项目根(默认 = 插件仓库自身,兼容旧用法)
import { isAbsolute, resolve } from 'node:path';
function toAbsDir(p) { return isAbsolute(p) ? p : join(process.cwd(), p); }
const ROOT = opts.root ? toAbsDir(opts.root) : PLUGIN_ROOT;
const SCAN_PATH = opts['scan-path'] ? toAbsDir(opts['scan-path']) : ROOT;

const errors = [];
const passed = [];
function ok(msg) { passed.push(msg); }
function err(msg) { errors.push(msg); }

// === 版本号:单一来源 package.json(禁止硬编码) ===
let QL_VERSION = '0.0.0';
try {
  QL_VERSION = JSON.parse(readFileSync(join(PLUGIN_ROOT, 'package.json'), 'utf8')).version;
} catch { /* 插件 package.json 缺失时保持 0.0.0 并在断言中暴露 */ }

// === 工具:git HEAD(新鲜度戳,由脚本写入而非 agent) ===
function gitHead(dir) {
  try {
    return execSync('git rev-parse HEAD', { cwd: dir, stdio: ['pipe', 'pipe', 'pipe'] }).toString().trim();
  } catch { return null; }
}
const HEAD_COMMIT = gitHead(ROOT);

// === 目标项目 package.json(技术栈/依赖/入口的唯一事实来源) ===
let pkg = null;
try { pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')); } catch { /* 非 Node 项目 */ }

let PROJECT_NAME = opts['project-name'] || (pkg && pkg.name) || basename(ROOT);
const PROJECT_DESC = (pkg && pkg.description) || '';

// === 常量:忽略清单 / 目录职责词典 / 框架词典(标注推断用) ===
const IGNORE_DIRS = new Set(['node_modules', 'dist', 'build', '.git', '.qiling', '.planning', 'coverage', 'out', '.turbo', '.next', '.cache', '.tmp', 'vendor', 'target']);
const IGNORE_FILES = new Set(['.DS_Store', 'Thumbs.db', 'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock']);
const CODE_EXTS = /\.(ts|js|tsx|jsx|mjs|cjs|py|go|java|rb|rs|php)$/;
const MAX_TREE_ITEMS = 80;
const MAX_DEPTH = 4;

// 常见目录的职责词典(自动标注,带"推断"标记——不可臆造成事实)
const DIR_ROLES = {
  src: '源码主目录', lib: '库源码', app: '应用源码', api: 'API 路由/接口', routes: '路由定义',
  server: '服务端代码', client: '客户端代码', components: 'UI 组件', pages: '页面(路由级组件)',
  test: '测试', tests: '测试', __tests__: '测试', spec: '测试', e2e: '端到端测试',
  docs: '项目文档', scripts: '构建/工具脚本', config: '配置', public: '静态资源(直接对外)',
  static: '静态资源', assets: '静态资源(源)', examples: '示例代码', packages: 'monorepo 子包',
  migrations: '数据库迁移', seeds: '数据种子', middleware: '中间件', services: '业务服务层',
  models: '数据模型', controllers: '控制器', utils: '通用工具', types: '类型定义',
  '.github': 'CI/工作流配置', infrastructure: '基础设施代码', adapters: '外部适配层',
};
// 常见依赖 → 用途词典(技术栈表用,均标注"推断自 package.json")
const FRAMEWORK_DICT = {
  express: ['Web 框架', 'Node.js'], koa: ['Web 框架', 'Node.js'], fastify: ['Web 框架', 'Node.js'],
  '@nestjs/core': ['Web 框架', 'Node.js'], hapi: ['Web 框架', 'Node.js'], '@hapi/hapi': ['Web 框架', 'Node.js'],
  next: ['前端框架(SSR)', 'Node.js'], nuxt: ['前端框架(SSR)', 'Node.js'], react: ['前端框架', 'Node.js'],
  vue: ['前端框架', 'Node.js'], svelte: ['前端框架', 'Node.js'], angular: ['前端框架', 'Node.js'],
  vite: ['构建工具', 'Node.js'], webpack: ['构建工具', 'Node.js'], rollup: ['构建工具', 'Node.js'],
  esbuild: ['构建工具', 'Node.js'], typescript: ['语言/类型', 'Node.js'], tailwindcss: ['样式方案', 'Node.js'],
  prisma: ['ORM/数据库', 'Node.js'], '@prisma/client': ['ORM/数据库', 'Node.js'], typeorm: ['ORM/数据库', 'Node.js'],
  sequelize: ['ORM/数据库', 'Node.js'], mongoose: ['ORM/数据库', 'Node.js'], ioredis: ['缓存/消息', 'Node.js'],
  redis: ['缓存/消息', 'Node.js'], amqplib: ['消息队列', 'Node.js'], 'kafka-node': ['消息队列', 'Node.js'],
  axios: ['HTTP 客户端', 'Node.js'], electron: ['桌面应用', 'Node.js'], commander: ['CLI 框架', 'Node.js'],
  jest: ['测试框架', 'Node.js'], vitest: ['测试框架', 'Node.js'], mocha: ['测试框架', 'Node.js'],
  playwright: ['E2E 测试', 'Node.js'], puppeteer: ['E2E 测试', 'Node.js'], eslint: ['代码检查', 'Node.js'],
  fastapi: ['Web 框架', 'Python'], flask: ['Web 框架', 'Python'], django: ['Web 框架', 'Python'],
  sqlalchemy: ['ORM/数据库', 'Python'], pydantic: ['数据校验', 'Python'], pytest: ['测试框架', 'Python'],
};

// === 步骤 1:扫描目录树 ===
function walk(dir, base = dir, depth = 0) {
  if (depth > MAX_DEPTH) return [];
  let entries = [];
  let items;
  try { items = readdirSync(dir); } catch { return entries; }
  for (const item of items) {
    if (IGNORE_DIRS.has(item) || IGNORE_FILES.has(item)) continue;
    const p = join(dir, item);
    let s;
    try { s = statSync(p); } catch { continue; }
    const rel = relative(base, p).replace(/\\/g, '/');
    if (s.isDirectory()) {
      entries.push({ type: 'dir', path: rel, depth });
      entries.push(...walk(p, base, depth + 1));
    } else {
      entries.push({ type: 'file', path: rel, depth });
    }
  }
  return entries;
}

const tree = walk(SCAN_PATH, SCAN_PATH);

// 目录树:树形渲染 + 顶层目录职责(推断)+ 截断提示(绝不静默截断)
function renderTree(items) {
  const lines = [];
  const truncated = items.length > MAX_TREE_ITEMS;
  for (const it of items.slice(0, MAX_TREE_ITEMS)) {
    const indent = '  '.repeat(it.depth);
    if (it.type === 'dir') {
      const role = DIR_ROLES[it.path.split('/').pop()];
      lines.push(`${indent}📁 ${it.path}/${role ? `  # ${role}(推断)` : ''}`);
    } else {
      lines.push(`${indent}📄 ${it.path}`);
    }
  }
  if (truncated) {
    lines.push(`…(共 ${items.length} 项,已截断显示前 ${MAX_TREE_ITEMS} 项;完整清单请直接浏览目录或收窄 --scan-path)`);
  }
  return { text: lines.join('\n'), truncated, total: items.length, shown: Math.min(items.length, MAX_TREE_ITEMS) };
}
const treeView = renderTree(tree);

// === 步骤 2:技术栈检测(语言统计 + 框架推断 + 包管理器) ===
const langCount = {};
for (const it of tree) {
  if (it.type !== 'file') continue;
  const ext = it.path.split('.').pop();
  if (ext && ext.length <= 4) langCount[ext] = (langCount[ext] || 0) + 1;
}
const langTotal = Object.values(langCount).reduce((a, b) => a + b, 0);
const langRows = Object.entries(langCount).sort((a, b) => b[1] - a[1]).slice(0, 8)
  .map(([ext, n]) => `| .${ext} | ${n} | ${langTotal ? (n / langTotal * 100).toFixed(1) : 0}% |`);
const langTable = langRows.length
  ? `| 扩展名 | 文件数 | 占比 |\n|--------|--------|------|\n${langRows.join('\n')}`
  : '未检出代码文件(Not detected)——扫描范围内没有源码文件。若代码在其他目录,请用 `--scan-path` 指定。';

const deps = { ...(pkg && pkg.dependencies) || {}, ...(pkg && pkg.devDependencies) || {} };
const stackHits = [];
for (const [name, [use, runtime]] of Object.entries(FRAMEWORK_DICT)) {
  if (deps[name]) stackHits.push({ name, use, runtime, ver: deps[name], dev: !!(pkg && pkg.devDependencies && pkg.devDependencies[name]) });
}
const PKG_MANAGER = existsSync(join(ROOT, 'pnpm-lock.yaml')) ? 'pnpm'
  : existsSync(join(ROOT, 'yarn.lock')) ? 'yarn'
    : existsSync(join(ROOT, 'package-lock.json')) ? 'npm' : '未检出(无 lockfile)';
const stackTable = stackHits.length
  ? `| 依赖 | 用途(推断) | 版本 | 运行时 | 范围 |\n|------|--------------|------|--------|------|\n${stackHits.map(h => `| \`${h.name}\` | ${h.use} | ${h.ver} | ${h.runtime} | ${h.dev ? 'dev' : 'prod'} |`).join('\n')}`
  : '未检出已知框架(Not detected)——依赖中未匹配常见框架词典。可能是纯库项目/非 Node 项目,请以 `package.json` 为准人工确认。';

// === 步骤 3:提取 HTTP 路由(上下文限定,带行号证据,防误报) ===
// 只在"路由语境"文件中提取:文件名含 routes/router/controller/api/server/index,
// 或调用接收者是常见路由变量(app/router/r/server/api)。
function extractRoutes() {
  const routes = [];
  const seen = new Set();
  for (const f of tree) {
    if (f.type !== 'file' || !CODE_EXTS.test(f.path)) continue;
    const base = f.path.split('/').pop().toLowerCase();
    const routeishFile = /(routes?|router|controller|api|server|app)/.test(base);
    let content;
    try { content = readFileSync(join(SCAN_PATH, f.path), 'utf8'); } catch { continue; }
    const lines = content.split('\n').slice(0, 2000); // 防超大文件
    for (let ln = 0; ln < lines.length; ln++) {
      // 接收者限定:app/router/r/server/api 后跟 HTTP 动词
      const m = lines[ln].match(/\b(app|router|r|server|api)\s*\.\s*(get|post|put|delete|patch)\s*\(\s*['"`]([^'"`]+)['"`]/);
      if (!m) continue;
      // 明确接收者(app/router/server/api)+ HTTP 动词的组合歧义极小,直接采信;
      // 单字母接收者(r.)歧义大(cache.get 之类),要求文件名或邻近上下文有路由语境
      const context = lines.slice(Math.max(0, ln - 3), ln + 1).join(' ');
      if (m[1] === 'r' && !routeishFile && !/\b(router|routes?)\b/.test(context)) continue;
      const key = `${m[2].toUpperCase()} ${m[3]}`;
      if (seen.has(key)) continue; // 跨文件重复声明只记一次
      seen.add(key);
      routes.push({ method: m[2].toUpperCase(), path: m[3], file: f.path, line: ln + 1 });
    }
  }
  return routes.slice(0, 100);
}
const routes = extractRoutes();

// === 步骤 4:提取事件(上下文限定,带行号证据) ===
function extractEvents() {
  const events = [];
  const seen = new Set();
  for (const f of tree) {
    if (f.type !== 'file' || !CODE_EXTS.test(f.path)) continue;
    let content;
    try { content = readFileSync(join(SCAN_PATH, f.path), 'utf8'); } catch { continue; }
    const lines = content.split('\n').slice(0, 2000);
    for (let ln = 0; ln < lines.length; ln++) {
      // 接收者白名单(emitter/eventBus/bus/broker/io/pub 等)+ emit/publish/dispatch,
      // 组合歧义极小,直接采信;事件名限定为合法事件名形态
      const m = lines[ln].match(/\b(emitter|eventBus|event_bus|bus|broker|io|pub|publisher)\s*\.\s*(emit|publish|dispatch)\s*\(\s*['"`]([a-zA-Z0-9._:-]+)['"`]/);
      if (m) {
        if (seen.has(m[3])) continue;
        seen.add(m[3]);
        events.push({ name: m[3], verb: m[2], file: f.path, line: ln + 1 });
        continue;
      }
      // VSCode EventEmitter 惯例:事件名在接收者属性上而非 fire 参数里
      // (this._onDidX.fire(...) → 事件 onDidX)。命名惯例强(_on 前缀/*Emitter 后缀),歧义小
      const fm = lines[ln].match(/\bthis\s*\.\s*(_?(?:on[A-Z][A-Za-z0-9]*|[A-Za-z0-9]*[Ee]mitter))\s*\.\s*fire\s*\(/);
      if (fm) {
        const name = fm[1].replace(/^_/, '');
        if (seen.has(name)) continue;
        seen.add(name);
        events.push({ name, verb: 'fire', file: f.path, line: ln + 1 });
      }
    }
  }
  return events.slice(0, 100);
}
const events = extractEvents();

// === 步骤 4.5:提取命令/工具注册(插件 / MCP / CLI 等非 HTTP 项目的一等能力) ===
const COMMAND_PATTERNS = [
  // VSCode 命令注册:vscode.commands.registerCommand('ql.xxx', ...)(vscode. 前缀可省——模块内常见直接导入)
  { re: /\b(?:vscode\s*\.\s*commands\s*\.\s*)?registerCommand\s*\(\s*['"`]([^'"`]+)['"`]/, kind: 'registerCommand' },
  // MCP 工具注册:server.tool('name') / server.registerTool('name') / ctx.tool(...)
  { re: /\b(?:server|mcp|ctx)\s*\.\s*(?:registerTool|tool)\s*\(\s*['"`]([^'"`]+)['"`]/, kind: 'mcp-tool' },
  // CLI 子命令注册:program.command('name')(commander/yargs 风格)
  { re: /\b(?:program|cli|app|cmd)\s*\.\s*command\s*\(\s*['"`]([^'"`]+)['"`]/, kind: 'cli-command' },
];
function extractCommands() {
  const commands = [];
  const seen = new Set();
  for (const f of tree) {
    if (f.type !== 'file' || !CODE_EXTS.test(f.path)) continue;
    let content;
    try { content = readFileSync(join(SCAN_PATH, f.path), 'utf8'); } catch { continue; }
    const lines = content.split('\n').slice(0, 2000);
    for (let ln = 0; ln < lines.length; ln++) {
      for (const p of COMMAND_PATTERNS) {
        const m = lines[ln].match(p.re);
        if (!m) continue;
        const key = `${p.kind} ${m[1]}`;
        if (seen.has(key)) continue;
        seen.add(key);
        commands.push({ name: m[1], kind: p.kind, file: f.path, line: ln + 1 });
      }
    }
  }
  return commands.slice(0, 100);
}
const commands = extractCommands();

// === 步骤 4.6:自定义提取器(--patterns,补内置提取器测不到的注册风格) ===
let customExtractors = [];
if (opts.patterns) {
  const patternsPath = toAbsDir(opts.patterns);
  try {
    const raw = JSON.parse(readFileSync(patternsPath, 'utf8'));
    if (!Array.isArray(raw)) throw new Error('顶层必须是 JSON 数组');
    customExtractors = raw.map((item, i) => {
      if (!item || typeof item.name !== 'string' || typeof item.regex !== 'string') {
        throw new Error(`第 ${i + 1} 项缺 name 或 regex 字段`);
      }
      let re;
      try { re = new RegExp(item.regex); } catch (e) {
        throw new Error(`第 ${i + 1} 项正则无效: ${e.message}`);
      }
      return { name: item.name, re, glob: item.glob || null };
    });
  } catch (e) {
    console.error(`❌ --patterns ${opts.patterns} 加载失败: ${e.message}`);
    process.exit(2);
  }
}
function extractCustom() {
  const hits = [];
  for (const ext of customExtractors) {
    const rows = [];
    const seen = new Set();
    for (const f of tree) {
      if (f.type !== 'file' || !CODE_EXTS.test(f.path)) continue;
      if (ext.glob && !f.path.split('/').pop().includes(ext.glob.replace(/\*/g, ''))) continue;
      let content;
      try { content = readFileSync(join(SCAN_PATH, f.path), 'utf8'); } catch { continue; }
      const lines = content.split('\n').slice(0, 2000);
      for (let ln = 0; ln < lines.length; ln++) {
        const m = lines[ln].match(ext.re);
        if (!m) continue;
        const name = m[1] || m[0];
        if (seen.has(name)) continue;
        seen.add(name);
        rows.push({ name, file: f.path, line: ln + 1 });
      }
    }
    hits.push({ name: ext.name, rows: rows.slice(0, 100) });
  }
  return hits;
}
const customHits = extractCustom();
const customTotal = customHits.reduce((a, h) => a + h.rows.length, 0);

// === 步骤 5:命令与入口(启动链路只用真实检测值,检不出就不画图) ===
const scripts = pkg && pkg.scripts ? Object.entries(pkg.scripts) : [];
const entryField = (pkg && (pkg.main || (pkg.bin && (typeof pkg.bin === 'string' ? pkg.bin : Object.values(pkg.bin)[0])))) || null;
const entryExists = entryField ? existsSync(join(ROOT, entryField)) : false;
const startScripts = scripts.filter(([k]) => /^(start|dev|serve)$/.test(k));
// 启动链路检出的条件:有 start/dev 脚本 且 有存在的入口文件
const bootDetected = startScripts.length > 0 && entryExists;

const scriptsTable = scripts.length
  ? `| 命令 | 实际执行 |\n|------|----------|\n${scripts.map(([k, v]) => `| \`npm run ${k}\` | \`${String(v).replace(/\|/g, '\\|')}\` |`).join('\n')}`
  : '未检出 npm scripts(Not detected)——package.json 不存在或没有 scripts。启动方式请参考项目 README。';

const depEntries = Object.entries((pkg && pkg.dependencies) || {});
const devDepEntries = Object.entries((pkg && pkg.devDependencies) || {});
const depTable = (depEntries.length || devDepEntries.length)
  ? `| 依赖 | 版本 | 范围 |\n|------|------|------|\n${
    [...depEntries.map(([n, v]) => `| \`${n}\` | ${v} | prod |`),
    ...devDepEntries.map(([n, v]) => `| \`${n}\` | ${v} | dev |`)].join('\n')}`
  : '未检出依赖声明(Not detected)——package.json 中没有 dependencies / devDependencies。';

// === 章节目录与 ID 分配 ===
const chaptersDir = join(ROOT, '.qiling', 'docs', 'chapters');
if (!existsSync(chaptersDir)) mkdirSync(chaptersDir, { recursive: true });

const SLUG = String(PROJECT_NAME).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'project';
const existingFiles = readdirSync(chaptersDir).filter(f => /^chapter-\d+.*\.md$/.test(f));
const existingBySlug = existingFiles.find(f => f.endsWith(`-${SLUG}.md`));

let CHAPTER_ID, CHAPTER_FILE;

if (!UPDATE_INDEX_ONLY) {
  if (existingBySlug && !FORCE) {
    console.error(`❌ 章节已存在: ${existingBySlug}`);
    console.error(`   本命令是项目初始化入口,每个项目只生成一份文档快照。`);
    console.error(`   若要重新扫描(项目结构大改后),加 --force:`);
    console.error(`     node scripts/docsmap.mjs --force`);
    process.exit(1);
  }
  if (existingBySlug && FORCE) {
    CHAPTER_ID = existingBySlug.match(/^(chapter-\d+)/)[1];
    CHAPTER_FILE = join(chaptersDir, existingBySlug);
    console.log(`⚠️  --force:覆盖现有 ${existingBySlug}(章节 ID 不变,内容重扫)`);
  } else {
    let nextNum = 1;
    for (const f of existingFiles) {
      const m = f.match(/chapter-(\d+)/);
      if (m) nextNum = Math.max(nextNum, parseInt(m[1]) + 1);
    }
    CHAPTER_ID = opts['chapter-id'] || `chapter-${String(nextNum).padStart(2, '0')}`;
    CHAPTER_FILE = opts.out ? join(process.cwd(), opts.out) : join(chaptersDir, `${CHAPTER_ID}-${SLUG}.md`);
  }
}

// === 步骤 6:渲染章节文件(与 ql-doc 同 5 节结构) ===
const NOW = new Date().toISOString();

// 证据表(每行带 file:line——"Every finding needs a file path. No exceptions.")
const routeTable = routes.length
  ? `| 方法 | 路径 | 证据(文件:行) |\n|------|------|------------------|\n${routes.map(r => `| ${r.method} | \`${r.path}\` | \`${r.file}:${r.line}\` |`).join('\n')}`
  : '未检出 HTTP 路由(Not detected)——未在路由语境文件(`*routes*`/`*router*`/`*controller*` 或 `app.xxx()` 调用)中发现端点声明。若项目使用其他路由风格(如装饰器/配置式路由),请人工补充或先运行 `/ql-design` 生成 OpenAPI 契约。';
const eventTable = events.length
  ? `| 事件名 | 动作 | 证据(文件:行) |\n|--------|------|------------------|\n${events.map(e => `| \`${e.name}\` | ${e.verb} | \`${e.file}:${e.line}\` |`).join('\n')}`
  : '未检出事件发布(Not detected)——未在事件语境文件中发现 `emitter.emit()` / `bus.publish()` / `this._onX.fire()` 类调用。';
const commandTable = commands.length
  ? `| 名称 | 注册方式 | 证据(文件:行) |\n|------|----------|------------------|\n${commands.map(c => `| \`${c.name}\` | ${c.kind} | \`${c.file}:${c.line}\` |`).join('\n')}`
  : '未检出命令/工具注册(Not detected)——未发现 `registerCommand` / MCP `server.tool` / CLI `program.command` 类调用。若项目有其他注册风格,用 `--patterns` 自定义提取器补充。';
const customSection = customExtractors.length
  ? customHits.map(h => h.rows.length
    ? `**${h.name}**\n\n| 标识 | 证据(文件:行) |\n|------|------------------|\n${h.rows.map(r => `| \`${r.name}\` | \`${r.file}:${r.line}\` |`).join('\n')}`
    : `**${h.name}**:未检出(Not detected)——自定义正则无命中。`).join('\n\n')
  : '';

// 启动链路:只有真实检出才画 mermaid;否则诚实声明 + 给出建议
let bootSection;
if (bootDetected) {
  const scriptNames = startScripts.map(([k]) => k).join(' / ');
  bootSection = [
    '```mermaid',
    'flowchart LR',
    `    A["package.json<br/>main: ${entryField}"] --> B["npm run ${startScripts[0][0]}"]`,
    `    B --> C["${entryField}(入口,已确认存在)"]`,
    '    C --> D["路由 / 服务 / 模块(见 §二 目录树)"]',
    '```',
    '',
    `> 图中每个节点均为真实检测值:入口来自 \`package.json\` 的 \`main\`(文件存在性已校验),启动命令来自 \`scripts\` 中的 \`${scriptNames}\`。`,
  ].join('\n');
} else {
  const why = !pkg ? '未找到 package.json'
    : !startScripts.length ? 'package.json 无 start/dev 脚本'
      : !entryField ? 'package.json 无 main/bin 字段'
        : `main/bin 指向的文件不存在(${entryField})`;
  bootSection = `**未能自动检出启动链路(Not detected)。** 原因:${why}。\n> 本文档不输出臆测的启动图。请以项目 README 或 \`package.json\` 的 scripts 为准人工确认。`;
}

let chapterContent = '';
if (!UPDATE_INDEX_ONLY) {
chapterContent = `---
chapter_id: "${CHAPTER_ID}"
title: "${PROJECT_NAME}"
phase: init
generated_at: "${NOW}"
generated_by: "器灵工作流 v${QL_VERSION} / ql-scan"
ql_version: "${QL_VERSION}"
${HEAD_COMMIT ? `last_mapped_commit: "${HEAD_COMMIT}"\n` : ''}status: "initialized"
docsmap_init: true
scan_path: "${relative(ROOT, SCAN_PATH) || '.'}"
scanned_entries: ${tree.length}
routes_detected: ${routes.length}
events_detected: ${events.length}
commands_detected: ${commands.length}
custom_extracts: ${customTotal}
endpoints: ${routes.length}
events: ${events.length}
---

# 第 ${CHAPTER_ID.replace('chapter-', '')} 章 · ${PROJECT_NAME}(初始化)

> **本文档由 \`/ql-scan\` 生成** —— 通过阅读项目目录结构,产出与 \`/ql-doc\` 完全一致格式的初始化章节。
> 进入开发流程后,新章节由 \`/ql-doc\` 追加,本章节作为起点。
> **不要手改本文件** —— 项目结构变化后用 \`/ql-scan --force\` 重扫覆盖。

---

## 章节摘要

| 字段 | 值 |
|------|---|
| 章节 ID | ${CHAPTER_ID} |
| 来源命令 | /ql-scan |
| 扫描路径 | ${relative(ROOT, SCAN_PATH) || '.'} |
| 项目名 | ${PROJECT_NAME} |
| 扫描基线 commit | ${HEAD_COMMIT || '(非 git 仓库,无法打点)'} |
| 扫描条目数 | ${tree.length}(目录树显示 ${treeView.shown}) |
| 命令数(npm scripts) | ${scripts.length} |
| 路由数(带证据) | ${routes.length} |
| 事件数(带证据) | ${events.length} |
| 命令/工具注册数(带证据) | ${commands.length} |
| 自定义提取数(--patterns) | ${customTotal} |
| 状态 | initialized |

${PROJECT_DESC ? `**项目定位:** ${PROJECT_DESC}(来自 package.json description)\n\n` : ''}---

## 一、本章节承载的能力(从代码扫描)

> 本节所有条目均为**从代码反推的已存在能力**,每条附 \`文件:行号\` 证据。
> 与 OpenAPI 契约的对应关系待 \`/ql-design\` 后补全;在此之前,本节就是当前能力的唯一清单。

### 1.1 命令清单(package.json scripts,原样列出)

${scriptsTable}

### 1.2 HTTP 路由(证据锚点)

${routeTable}

### 1.3 事件发布(证据锚点)

${eventTable}

### 1.4 命令 / 工具注册(证据锚点)

${commandTable}
${customExtractors.length ? `
### 1.5 自定义提取(--patterns)

${customSection}
` : ''}---

## 二、项目结构与启动流程

### 2.1 技术栈

**语言分布(按文件扩展名统计,扫描范围内全部文件):**

${langTable}

**框架/关键依赖(推断自 package.json):**

${stackTable}

**包管理器:** ${PKG_MANAGER}

### 2.2 依赖清单

${depTable}

### 2.3 目录树(深度 ≤ ${MAX_DEPTH},忽略 node_modules/dist/build/.git 等)

\`\`\`
${treeView.text}
\`\`\`

> 目录职责注释(\`# xx(推断)\`)来自常见命名约定词典,**是推断而非事实**,以实际代码为准。

### 2.4 启动流程

${bootSection}

### 2.5 新代码放哪(指引)

| 要新增的内容 | 建议位置(推断) |
|--------------|------------------|
| API 端点 | ${tree.some(t => t.path.startsWith('routes/') || t.path.startsWith('api/')) ? '与现有路由文件同目录(routes/ 或 api/)' : '遵循项目现有分层;若无路由目录,建议新建 routes/ 并在入口注册'} |
| 业务逻辑 | ${tree.some(t => t.path.startsWith('services/')) ? 'services/ 下按领域建文件' : '与现有模块就近放置,保持单一入口'} |
| 测试 | ${tree.some(t => /(^|\/)(tests?|__tests__|e2e)\//.test(t.path)) ? '跟随现有测试目录,与被测文件同名' : '新建 tests/ 并与源码结构镜像'} |

> 以上为基于目录结构的推断指引;进入器灵工作流后,以 \`/ql-design\` 产出的契约为准。

---

## 三、与上一章节的对比

无(本章节为首个文档树节点)。

---

## 四、关联文档

- [文档树索引](../README.md)
- 项目状态:${existsSync(join(ROOT, '.planning', 'STATE.md')) ? '[../.planning/STATE.md](../../.planning/STATE.md)' : '未检出(尚未进入器灵工作流)'}
- OpenAPI 契约:${existsSync(join(ROOT, '.planning', 'context', 'openapi.yaml')) ? '[.planning/context/openapi.yaml](../../.planning/context/openapi.yaml)' : '未检出(运行 /ql-design 后生成)'}

---

## 五、变更日志

| 日期 | 操作 | 说明 |
|------|------|------|
| ${NOW} | 自动生成 | 由 \`/ql-scan\` 初始化${HEAD_COMMIT ? `,基线 commit \`${HEAD_COMMIT.slice(0, 8)}\`` : ''} |
`;
}

// === 密钥扫描(硬门控:命中即失败,绝不带密钥入库) ===
const SECRET_PATTERNS = [
  [/sk-[A-Za-z0-9]{20,}/, 'OpenAI 风格密钥'],
  [/ghp_[A-Za-z0-9]{30,}/, 'GitHub PAT'],
  [/github_pat_[A-Za-z0-9_]{20,}/, 'GitHub fine-grained PAT'],
  [/AKIA[0-9A-Z]{16}/, 'AWS Access Key'],
  [/-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/, '私钥文件头'],
  [/xox[baprs]-[A-Za-z0-9-]{10,}/, 'Slack token'],
];
function scanSecrets(text, where) {
  for (const [re, label] of SECRET_PATTERNS) {
    const hit = text.match(re);
    if (hit) err(`密钥扫描:${where} 命中 ${label}(\`${String(hit[0]).slice(0, 12)}…\`)——请检查扫描来源并移除,文档不得包含敏感值`);
  }
}

// === 渲染 & 写章节 ===
if (!UPDATE_INDEX_ONLY) {
  scanSecrets(chapterContent, '章节文档');
  writeFileSync(CHAPTER_FILE, chapterContent);
  ok(`章节文件已生成:${CHAPTER_FILE}`);
}

// === 步骤 7:更新索引(.qiling/docs/README.md,与 ql-doc 共享同一格式) ===
const indexPath = join(ROOT, '.qiling', 'docs', 'README.md');

const allChapters = readdirSync(chaptersDir).filter(f => /^chapter-\d+.*\.md$/.test(f)).sort();

function fm(content, key) {
  const m = content.match(new RegExp(`^${key}:\\s*"?([^"\\n]+)"?`, 'm'));
  return m ? m[1].trim() : null;
}
// 每个章节文件只读一次
const chapterMetas = allChapters.map(f => {
  const content = readFileSync(join(chaptersDir, f), 'utf8');
  return {
    id: (fm(content, 'chapter_id') || (f.match(/chapter-\d+/) || [f])[0]),
    file: f,
    title: fm(content, 'title') || '未命名',
    status: fm(content, 'status') || 'unknown',
    generated: (fm(content, 'generated_at') || '').slice(0, 10),
    endpoints: fm(content, 'endpoints'),
    events: fm(content, 'events'),
    source: /docsmap_init:\s*true/.test(content) ? '/ql-scan' : '/ql-doc',
    commit: fm(content, 'last_mapped_commit') || fm(content, 'git_commit'),
  };
});

const totalEndpoints = chapterMetas.reduce((a, c) => a + (parseInt(c.endpoints) || 0), 0);
const totalEvents = chapterMetas.reduce((a, c) => a + (parseInt(c.events) || 0), 0);
const pkgVersion = pkg && pkg.version ? pkg.version : '0.0.0';
const indexChapterRows = chapterMetas.map(c =>
  `| [${c.id}](./chapters/${c.file}) | ${c.title} | ${c.status} | ${c.source} | ${c.endpoints ?? '—'} | ${c.events ?? '—'} | ${c.generated} |`).join('\n');

const newestScan = chapterMetas.filter(c => c.source === '/ql-scan')[0];
const indexContent = `# ${PROJECT_NAME} · 文档树(产品说明书)

> 本目录由器灵工作流自动维护,是本项目的**门户型文档**。
> 章节文件 = \`/ql-scan\`(项目初始化)+ \`/ql-doc\`(构建交付后)共同产出,两者结构完全一致。
${PROJECT_DESC ? `> **项目定位:** ${PROJECT_DESC}\n\n` : ''}## 如何阅读(按角色 × 意图)

| 你想做什么 | 去哪里看 |
|------------|----------|
| 快速了解项目是什么、能做什么 | 本页"项目元信息" + 初始化章节的 §一/§二 |
| 查某个 API 怎么调用 | 章节的 §一(端点表 + 示例);初始化章节的 §一.2 路由清单 |
| 了解代码结构与启动方式 | 初始化章节的 §二(技术栈/目录树/启动流程) |
| 知道某次交付改了什么、怎么迁移 | 对应章节的 §三(与上一章节对比) |
| 给项目加新功能,代码放哪 | 初始化章节的 §二.5"新代码放哪" + \`/ql-design\` |

## 章节列表

| 章节 | 标题 | 状态 | 来源 | API 数 | 事件数 | 生成日期 |
|------|------|------|------|--------|--------|----------|
${indexChapterRows || '|(暂无章节)| | | | | |'}

---

## 能力总览(全章节汇总)

| 维度 | 数量 | 说明 |
|------|------|------|
| API 端点(合计) | ${totalEndpoints} | scan 章节按代码路由计数;doc 章节按 OpenAPI 计数 |
| 事件(合计) | ${totalEvents} | 同上 |

> 明细(请求/响应/示例/错误码)在各章节 §一;跨章节去重后的路径级清单由 \`/ql-doc\` 章节累积后在此汇总。

---

## 项目元信息

| 字段 | 值 |
|------|---|
| 项目名 | ${PROJECT_NAME} |
| 版本 | ${pkgVersion} |
| 总章节数 | ${chapterMetas.length} |
| 包管理器 | ${PKG_MANAGER} |
| 文档基线 commit | ${newestScan && newestScan.commit ? `${newestScan.commit.slice(0, 8)}(scan 章节)` : '(未打点)'} |

> **新鲜度提示:** 若当前 HEAD 已落后文档基线 commit 较多(可用 \`git log --oneline <基线>..HEAD\` 查看),说明代码已演进、文档可能过期——项目结构大改后运行 \`/ql-scan --force\` 重扫。

---

**生成:** 器灵工作流 v${QL_VERSION},任何章节文件变化时增量更新

**维护原则:** 本文件由 \`scripts/docsmap.mjs\` 自动维护,**不要手改**
`;

scanSecrets(indexContent, '索引文件');
writeFileSync(indexPath, indexContent);
ok(`索引文件已更新:${indexPath}`);

// === 步骤 8:断言(严谨性门控) ===
if (!UPDATE_INDEX_ONLY) {
  const writtenChapter = readFileSync(CHAPTER_FILE, 'utf8');

  // 断言 1:章节文件 ≥ 1 KB
  if (writtenChapter.length >= 1024) {
    ok(`断言 1:章节文件大小 ${writtenChapter.length} 字节 (≥ 1 KB)`);
  } else {
    err(`断言 1:章节文件过小 ${writtenChapter.length} 字节`);
  }

  // 断言 2:能力表非空,或显式声明"未检出"(不允许静默空白)
  const hasCapability = scripts.length > 0 || routes.length > 0 || events.length > 0 || commands.length > 0 || customTotal > 0;
  const hasNotDetected = /未检出.*(Not detected)/.test(writtenChapter);
  if (hasCapability || hasNotDetected) {
    ok(`断言 2:能力清单非空(scripts=${scripts.length}, routes=${routes.length}, events=${events.length}, commands=${commands.length}, custom=${customTotal})或已显式声明未检出`);
  } else {
    err('断言 2:能力清单为空且未声明"未检出(Not detected)"');
  }

  // 断言 3:路由/事件/命令/自定义表每行都带 file:line 证据
  const evidenceRows = (writtenChapter.match(/`[^`\n]+\.\w+:\d+`/g) || []).length;
  const needEvidence = routes.length + events.length + commands.length + customTotal;
  if (evidenceRows >= needEvidence) {
    ok(`断言 3:证据锚点 ${evidenceRows} 处 ≥ 提取条目 ${needEvidence} 条(每条带 文件:行号)`);
  } else {
    err(`断言 3:证据锚点 ${evidenceRows} < 提取条目 ${needEvidence}(存在无证据条目)`);
  }

  // 断言 4:目录树存在;若截断必须有截断提示
  if (tree.length > 0) {
    if (treeView.truncated && !writtenChapter.includes('已截断')) {
      err('断言 4:目录树被截断但未提示');
    } else {
      ok(`断言 4:目录树完整呈现(${treeView.shown}/${treeView.total} 项${treeView.truncated ? ',含截断提示' : ''})`);
    }
  } else {
    err('断言 4:目录树为空');
  }

  // 断言 5:索引含新章节链接
  const writtenIndex = readFileSync(indexPath, 'utf8');
  if (writtenIndex.includes(`./chapters/${CHAPTER_ID}`)) {
    ok(`断言 5:索引文件含 ${CHAPTER_ID} 链接`);
  } else {
    err(`断言 5:索引文件缺 ${CHAPTER_ID} 链接`);
  }

  // 断言 6:5 节结构完整
  const sections = ['一、本章节承载的能力', '二、项目结构与启动流程', '三、与上一章节的对比', '四、关联文档', '五、变更日志'];
  const missing = sections.filter(s => !writtenChapter.includes(s));
  if (missing.length === 0) {
    ok('断言 6:5 节结构完整(与 ql-doc 一致)');
  } else {
    err(`断言 6:缺失节 ${missing.join(', ')}`);
  }

  // 断言 7:无未替换占位符
  const placeholderPattern = /\[(?:N|M|K|hash|URL|YYYY|TODO|commits|XX)\]/g;
  const placeholders = writtenChapter.match(placeholderPattern) || [];
  if (placeholders.length === 0) {
    ok('断言 7:章节文档无未替换占位符');
  } else {
    err(`断言 7:章节文档含未替换占位符: ${[...new Set(placeholders)].join(', ')}`);
  }

  // 断言 8:无假图——mermaid 块若引用入口/命令,必须是真实检测值;未检出时不得有臆造流程图
  const mermaidBlocks = writtenChapter.match(/```mermaid[\s\S]*?```/g) || [];
  let fakeGraph = false;
  for (const block of mermaidBlocks) {
    if (block.includes('<name>') || block.includes('[入口文件]')) fakeGraph = true;
    if (/\b(node|节点)\b/.test(block) && !bootDetected) fakeGraph = true;
  }
  if (!bootDetected && mermaidBlocks.some(b => /flowchart|graph /.test(b))) fakeGraph = true;
  if (!fakeGraph) {
    ok(`断言 8:无臆造图(启动链路 ${bootDetected ? '已检出并使用真实值' : '未检出,已显式声明,不画图'})`);
  } else {
    err('断言 8:检测到臆造的流程图(未检出的启动链路不得画图)');
  }

  // 断言 9:密钥扫描已在上方执行(scanSecrets 直接写 errors)
  if (!errors.some(e => e.startsWith('密钥扫描'))) {
    ok('断言 9:密钥扫描通过(产出不含敏感值)');
  }

  // 断言 10:版本号来自 package.json(防硬编码漂移)
  if (QL_VERSION !== '0.0.0' && writtenChapter.includes(`ql_version: "${QL_VERSION}"`)) {
    ok(`断言 10:版本号 ${QL_VERSION} 来自 package.json(单一来源)`);
  } else {
    err('断言 10:版本号未正确从 package.json 读取');
  }
}

// === 总结 ===
console.log('\n📊 docsmap 验证结果:');
console.log(`  ✅ 通过:${passed.length}`);
console.log(`  ❌ 错误:${errors.length}`);
for (const p of passed) console.log(`  - ${p}`);
for (const e of errors) console.log(`  - ${e}`);
console.log('\n📁 产出文件:');
console.log(`  - ${indexPath}`);
if (!UPDATE_INDEX_ONLY) console.log(`  - ${CHAPTER_FILE}`);

process.exit(errors.length === 0 ? 0 : 1);
