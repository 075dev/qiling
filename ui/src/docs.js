/* 器灵文档面板 —— 页面逻辑(vanilla JS,无外部依赖;mermaid 已内联)
 *
 * markdown 渲染为自写轻量渲染器(D10):只支持文档树实际用到的子集
 * (标题/段落/表格/列表/代码块/行内代码/粗斜体/引用/链接/hr/受限 details),
 * 输出全部走安全文本路径,不直通 HTML。mermaid 代码块直接渲染。
 *
 * 宿主通信与契约面板(panel.js)同款:优先 window.zcode 桥 + 资源读取
 * ql://docs/data.json,失败走 ql_docs_data 工具兜底(64KiB,可能瘦身),
 * 非宿主环境回退同目录 docs-data.json。
 */
(function () {
  'use strict';

  var zc = window.zcode || null;

  // ---------- 状态 ----------
  var state = {
    data: null,
    current: 'index',       // index | chapter 文件名(不含 chapters/ 前缀)
    search: '',
    theme: 'light',
    loading: true,
    error: null,
  };

  // ---------- 小工具 ----------
  function h(tag, attrs) {
    var el = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') el.className = attrs[k];
        else if (k === 'text') el.textContent = attrs[k];
        else if (k === 'html') el.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) el.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var c = arguments[i];
      if (c === null || c === undefined) continue;
      if (Array.isArray(c)) c.forEach(function (x) { if (x) el.appendChild(x); });
      else el.appendChild(c);
    }
    return el;
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // ---------- markdown 行内 ----------
  // 输入为原始文本,先整体 esc 再做标记替换,产物 html 字符串只含受控标签。
  function inline(md) {
    var s = esc(md);
    // 行内代码(优先,避免代码内的标记被再加工)
    s = s.replace(/`([^`]+)`/g, '<code class="inline">$1</code>');
    // 链接 [text](href) —— 章节内跳转在点击委托里处理
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function (m, t, u) {
      if (/^\.\/chapters\//.test(u)) return '<a href="#" data-chapter="' + u + '">' + t + '</a>';
      if (/^#/.test(u)) return '<a href="#" data-anchor="' + esc(u.slice(1)) + '">' + t + '</a>';
      return '<a href="' + u + '" data-ext="1" title="' + u + '">' + t + '</a>';
    });
    // 粗体 / 斜体(先粗后斜)
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
    return s;
  }

  function headingId(idx) { return 'h-' + idx; }

  // ---------- markdown 块级 ----------
  // 输出 DOM 节点数组。headingCounter 与 server 端 extractHeadings 的顺序对齐
  // (代码块外的全部标题按文档顺序编号),TOC 滚动定位依赖该一致性。
  function parseBlocks(md, opts) {
    opts = opts || {};
    var counter = opts.headingCounter !== undefined ? opts.headingCounter : { n: 0 };
    var nodes = [];
    var lines = md.split(/\r?\n/);
    var i = 0;

    function isTableSep(line) { return /^\s*\|[\s:|-]+\|\s*$/.test(line); }
    function isTableRow(line) { return /^\s*\|.*\|\s*$/.test(line); }

    while (i < lines.length) {
      var line = lines[i];

      // 空行
      if (!line.trim()) { i++; continue; }

      // 代码块
      var fence = line.match(/^\s*```\s*(\S*)\s*$/);
      if (fence) {
        var lang = fence[1] || '';
        var buf = [];
        i++;
        while (i < lines.length && !/^\s*```/.test(lines[i])) { buf.push(lines[i]); i++; }
        i++; // 闭合 fence
        var code = buf.join('\n');
        if (lang === 'mermaid' && code.trim()) {
          nodes.push(diagramCard(code));
        } else if (code.trim()) {
          var cb = h('div', { class: 'codeblock' });
          if (lang) cb.appendChild(h('span', { class: 'lang', text: lang }));
          cb.appendChild(h('pre', {}, h('code', { text: code })));
          nodes.push(cb);
        }
        continue;
      }

      // HTML 注释(单行/多行,如 <!-- manual --> 块)不渲染
      if (/^\s*<!--/.test(line)) {
        while (i < lines.length && !/-->/.test(lines[i])) i++;
        i++;
        continue;
      }

      // 受限 <details>:summary 提取为纯文本,内部按子 markdown 渲染
      if (/^\s*<details>/i.test(line)) {
        var dBuf = [];
        i++;
        while (i < lines.length && !/<\/details>/i.test(lines[i])) { dBuf.push(lines[i]); i++; }
        i++;
        var dRaw = dBuf.join('\n');
        var sm = dRaw.match(/<summary>([\s\S]*?)<\/summary>/i);
        var inner = dRaw.replace(/<summary>[\s\S]*?<\/summary>/i, '');
        var det = h('details', { class: 'manual-details' });
        det.appendChild(h('summary', { text: sm ? sm[1].replace(/<[^>]+>/g, '').trim() : '详情' }));
        parseBlocks(inner, { headingCounter: counter }).forEach(function (n) { det.appendChild(n); });
        nodes.push(det);
        continue;
      }

      // 标题
      var hm = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
      if (hm) {
        var lv = hm[1].length;
        var id = headingId(counter.n++);
        // skipFirstH1:正文首个一级标题由页面 h1 提供(h1For/idx.title),
        // 不重复渲染;编号照常前进,保持与服务端 extractHeadings 的对齐
        if (!(opts.skipFirstH1 && !opts._h1Skipped && lv === 1)) {
          nodes.push(h('h' + lv, { id: id, html: inline(hm[2]) }));
        }
        opts._h1Skipped = true;
        i++;
        continue;
      }

      // hr
      if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) { nodes.push(h('hr')); i++; continue; }

      // 表格(当前行是表行且下一行是分隔行)
      if (isTableRow(line) && i + 1 < lines.length && isTableSep(lines[i + 1])) {
        var headCells = splitRow(line);
        var thead = h('thead', {}, h('tr', {}, headCells.map(function (c) { return h('th', { html: inline(c) }); })));
        var tbody = h('tbody', {});
        i += 2;
        while (i < lines.length && isTableRow(lines[i])) {
          var cells = splitRow(lines[i]);
          var tr = h('tr', {}, cells.map(function (c, ci) {
            return h('td', { html: inline(c === '' && ci >= headCells.length ? '' : c) });
          }));
          tbody.appendChild(tr);
          i++;
        }
        nodes.push(h('table', {}, thead, tbody));
        continue;
      }

      // 引用块
      if (/^\s*>/.test(line)) {
        var qBuf = [];
        while (i < lines.length && /^\s*>/.test(lines[i])) {
          qBuf.push(lines[i].replace(/^\s*>\s?/, ''));
          i++;
        }
        var bq = h('blockquote');
        parseBlocks(qBuf.join('\n'), { headingCounter: counter }).forEach(function (n) { bq.appendChild(n); });
        nodes.push(bq);
        continue;
      }

      // 列表(两层:顶层 + 两空格缩进的子层)
      var listM = line.match(/^(\s*)([-*]|\d+\.)\s+(.*)$/);
      if (listM) {
        var ordered = /\d+\./.test(listM[2]);
        var items = [];
        while (i < lines.length) {
          var lm = lines[i].match(/^(\s*)([-*]|\d+\.)\s+(.*)$/);
          if (!lm) {
            // 列表项的续行(非空非标记行)并入上一项
            if (/\S/.test(lines[i]) && items.length && !/^\s{4,}\S/.test(lines[i])) break;
            if (/\S/.test(lines[i]) && items.length && /^\s{4,}\S/.test(lines[i])) {
              items[items.length - 1].push(lines[i].trim());
              i++;
              continue;
            }
            break;
          }
          var depth = lm[1].length >= 2 ? 1 : 0;
          items.push({ depth: depth, text: [lm[3]] });
          i++;
        }
        var list = ordered ? h('ol') : h('ul');
        var lastLi = null;
        items.forEach(function (it) {
          if (it.depth === 0) {
            lastLi = h('li', { html: inline(it.text.join(' ')) });
            list.appendChild(lastLi);
          } else {
            if (!lastLi) { lastLi = h('li'); list.appendChild(lastLi); }
            var sub = lastLi.querySelector('ul,ol');
            if (!sub) { sub = h(ordered ? 'ol' : 'ul'); lastLi.appendChild(sub); }
            sub.appendChild(h('li', { html: inline(it.text.join(' ')) }));
          }
        });
        nodes.push(list);
        continue;
      }

      // 段落(连续普通行)
      var pBuf = [];
      while (i < lines.length && lines[i].trim() && !/^\s*(#{1,6}\s|```|>|\||<!--|<details|-{3,}|\*{3,})/.test(lines[i]) && !/^(\s*)([-*]|\d+\.)\s+/.test(lines[i])) {
        pBuf.push(lines[i].trim());
        i++;
      }
      if (pBuf.length) nodes.push(h('p', { html: inline(pBuf.join(' ')) }));
      else i++; // 防御:未识别行强制前进
    }
    return nodes;
  }

  function splitRow(line) {
    var t = line.trim().replace(/^\|/, '').replace(/\|$/, '');
    return t.split('|').map(function (c) { return c.trim(); });
  }

  var mmdSeq = 0;
  function diagramCard(code) {
    var card = h('div', { class: 'diagram-card', 'data-mermaid': code });
    card.appendChild(h('div', { class: 'diagram-note', text: 'mermaid 渲染中…' }));
    return card;
  }

  // 渲染容器内全部 mermaid 卡片(已初始化时调用;失败回退源码)
  function renderDiagrams(container) {
    var cards = container.querySelectorAll('[data-mermaid]');
    Array.prototype.forEach.call(cards, function (card) {
      var code = card.getAttribute('data-mermaid');
      if (!window.mermaid || typeof window.mermaid.render !== 'function') {
        card.innerHTML = '';
        card.appendChild(h('pre', { text: code }));
        return;
      }
      var id = 'docs-mmd-' + (++mmdSeq);
      try {
        Promise.resolve(window.mermaid.render(id, code)).then(function (r) {
          card.innerHTML = '';
          var svg = r.svg;
          if (/^\s*</.test(svg)) card.innerHTML = svg; else card.textContent = svg;
        }).catch(function () {
          card.innerHTML = '';
          card.appendChild(h('pre', { text: code }));
        });
      } catch (e) {
        card.innerHTML = '';
        card.appendChild(h('pre', { text: code }));
      }
    });
  }

  // ---------- 主题与宿主桥 ----------
  function applyTheme() {
    var t = 'light';
    try { t = (zc && zc.theme) === 'dark' ? 'dark' : 'light'; } catch (e) { /* 非宿主环境 */ }
    state.theme = t;
    document.documentElement.setAttribute('data-theme', t);
    if (window.mermaid) {
      try {
        window.mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: t === 'dark' ? 'dark' : 'default' });
      } catch (e) { /* 渲染时再降级 */ }
    }
  }

  function connectBridge() {
    if (!zc) return Promise.resolve();
    try {
      if (typeof zc.ready === 'function') return Promise.resolve(zc.ready()).catch(function () {});
      if (typeof zc.subscribe === 'function') { zc.subscribe(function () { applyTheme(); renderAll(); }); return Promise.resolve(); }
    } catch (e) { /* 容忍 */ }
    return Promise.resolve();
  }

  function loadData() {
    if (zc) {
      return connectBridge().then(function () {
        try {
          return zc.readResource('ql://docs/data.json').then(function (res) {
            var c = res && res.contents && res.contents[0];
            var text = c && (c.text != null ? c.text : c.blob ? decodeURIComponent(escape(atob(c.blob))) : null);
            if (text) return JSON.parse(text);
            throw new Error('资源内容为空');
          });
        } catch (e) {
          return zc.callTool('ql_docs_data', {}).then(function (r) {
            if (r && r.structuredContent) return r.structuredContent;
            var t = r && r.content && r.content[0] && r.content[0].text;
            return t ? JSON.parse(t) : null;
          });
        }
      });
    }
    if (typeof fetch === 'function') {
      return fetch('docs-data.json', { cache: 'no-store' }).then(function (resp) {
        if (!resp.ok) throw new Error('docs-data.json 不存在');
        return resp.json();
      });
    }
    return Promise.reject(new Error('无宿主桥且无本地数据'));
  }

  // ---------- 数据访问 ----------
  function currentChapter() {
    if (!state.data || state.current === 'index') return null;
    return (state.data.chapters || []).find(function (c) {
      var f = (c.file || '').split('/').pop();
      return f === state.current || c.id === state.current;
    }) || null;
  }

  function allTocEntries() {
    // 左栏条目:前言(索引) + 各篇章节;index.parts 缺失时按章节 frontmatter part 兜底分组
    var entries = [];
    if (state.data && state.data.index && state.data.index.found) {
      entries.push({ kind: 'index', label: '前言 · 目录', file: 'index' });
      (state.data.index.parts || []).forEach(function (p) {
        p.chapters.forEach(function (c) {
          entries.push({ kind: 'chapter', part: p.name, label: c.title, file: c.file.replace(/^chapters\//, '') });
        });
      });
      return entries;
    }
    (state.data ? state.data.chapters : []).forEach(function (c) {
      entries.push({ kind: 'chapter', part: c.part || '章节', label: c.title, file: (c.file || '').split('/').pop() });
    });
    return entries;
  }

  // ---------- 渲染 ----------
  var mainEl = null;

  function renderSidebar() {
    var sb = h('div', { class: 'sidebar' });
    var search = h('input', { type: 'search', placeholder: '搜索章节标题…' });
    search.value = state.search;
    search.addEventListener('input', function () { state.search = search.value.trim().toLowerCase(); rerenderSidebar(); });
    sb.appendChild(search);
    var list = h('div', { class: 'toc-list' });
    var lastPart = null;
    allTocEntries().forEach(function (e) {
      if (state.search && e.label.toLowerCase().indexOf(state.search) < 0) return;
      if (e.kind === 'index') {
        list.appendChild(tocBtn(e, '前言 · 目录'));
        return;
      }
      if (e.part !== lastPart) {
        list.appendChild(h('div', { class: 'part-title', text: e.part }));
        lastPart = e.part;
      }
      list.appendChild(tocBtn(e, e.label));
    });
    if (!list.childNodes.length) list.appendChild(h('div', { class: 'placeholder', text: '没有匹配的章节' }));
    sb.appendChild(list);
    return sb;
  }

  function tocBtn(e, label) {
    var b = h('button', { class: 'toc-item' + (state.current === e.file ? ' active' : '') });
    b.appendChild(document.createTextNode(label));
    if (e.kind === 'chapter') {
      var ch = (state.data.chapters || []).find(function (c) { return (c.file || '').split('/').pop() === e.file; });
      if (ch && ch.status && ch.status !== 'current') b.appendChild(h('span', { class: 'st', text: ch.status }));
    }
    b.addEventListener('click', function () { switchTo(e.file); });
    return b;
  }

  function rerenderSidebar() {
    var old = document.querySelector('.sidebar');
    if (!old) return;
    old.replaceWith(renderSidebar());
    // 搜索输入重渲染后恢复焦点与光标,避免连续输入被打断
    var input = document.querySelector('.sidebar input[type="search"]');
    if (input) {
      input.focus();
      var v = input.value;
      try { input.setSelectionRange(v.length, v.length); } catch (e) { /* 类型输入框不支持时忽略 */ }
    }
  }

  function chapterMetaChips(ch) {
    var box = h('div', { class: 'chapter-meta' });
    if (ch.feature) box.appendChild(h('span', { class: 'chip accent', text: ch.feature }));
    if (ch.qlVersion) box.appendChild(h('span', { class: 'chip', text: 'v' + ch.qlVersion }));
    if (ch.status) box.appendChild(h('span', { class: 'chip', text: ch.status }));
    if (ch.stats) {
      box.appendChild(h('span', { class: 'chip', text: ch.stats.lines + ' 行' }));
      if (ch.stats.tables) box.appendChild(h('span', { class: 'chip', text: ch.stats.tables + ' 表格' }));
      if (ch.stats.mermaid) box.appendChild(h('span', { class: 'chip', text: ch.stats.mermaid + ' mermaid' }));
    }
    if (ch.frontmatter && ch.frontmatter.generated_at) {
      box.appendChild(h('span', { class: 'chip', text: String(ch.frontmatter.generated_at).slice(0, 10) }));
    }
    return box;
  }

  function renderArticle() {
    var wrap = h('div', { class: 'main' });
    var article = h('div', { class: 'article' });
    wrap.appendChild(article);
    mainEl = wrap;

    if (state.current === 'index') {
      var idx = state.data && state.data.index;
      if (!idx || !idx.found) {
        article.appendChild(h('div', { class: 'placeholder' },
          h('div', { class: 'big', text: '📖' }),
          h('h2', { text: '未找到文档索引' }),
          h('p', { class: 'muted', text: '当前工作区未发现 .qiling/docs/README.md。先运行 /ql-scan(整树)或 /ql-doc(章节留档)产出文档树,再刷新本面板。' })));
        return wrap;
      }
      var h1 = h('h1', { text: idx.title });
      article.appendChild(h1);
      parseBlocks(idx.body, { skipFirstH1: true }).forEach(function (n) { article.appendChild(n); });
      return wrap;
    }

    var ch = currentChapter();
    if (!ch) {
      article.appendChild(h('div', { class: 'placeholder' },
        h('div', { class: 'big', text: '🧭' }),
        h('h2', { text: '章节不存在' }),
        h('p', { class: 'muted', text: state.current + ' 不在文档树中;左侧选择其它章节。' })));
      return wrap;
    }
    article.appendChild(h1For(ch));
    article.appendChild(chapterMetaChips(ch));
    if (ch.truncated) {
      article.appendChild(h('p', { class: 'muted', text: '(本数据经兜底通道瘦身,正文被截断;完整内容请刷新或走资源读取)' }));
    }
    var counter = { n: 0 };
    parseBlocks(ch.body || '', { headingCounter: counter, skipFirstH1: true }).forEach(function (n) { article.appendChild(n); });
    return wrap;
  }

  function h1For(ch) { return h('h1', { text: ch.title || ch.id || '章节' }); }

  function renderOnThisPage() {
    var otp = h('div', { class: 'onthispage' });
    if (state.current === 'index') {
      var idx = state.data && state.data.index;
      otp.appendChild(h('div', { class: 'otp-title', text: '本页目录' }));
      if (idx && idx.found) {
        idx.headings.forEach(function (hd, i) {
          if (hd.level < 2 || hd.level > 3) return;
          var b = h('button', { class: 'otp-item' + (hd.level === 3 ? ' l3' : ''), text: hd.text });
          b.addEventListener('click', function () { scrollToHeading(idx.headings, i); });
          otp.appendChild(b);
        });
      }
      return otp;
    }
    var ch = currentChapter();
    otp.appendChild(h('div', { class: 'otp-title', text: '本页目录' }));
    if (ch && ch.found) {
      ch.headings.forEach(function (hd, i) {
        if (hd.level < 2 || hd.level > 3) return;
        var b = h('button', { class: 'otp-item' + (hd.level === 3 ? ' l3' : ''), text: hd.text });
        b.addEventListener('click', function () { scrollToHeading(ch.headings, i); });
        otp.appendChild(b);
      });
    }
    return otp;
  }

  // headings 序号 → DOM id(与 parseBlocks 的 headingCounter 同一顺序)
  function scrollToHeading(headings, idx) {
    var el = document.getElementById(headingId(idx));
    if (!el && mainEl) {
      // 兜底:按文本找
      var text = headings[idx].text;
      Array.prototype.some.call(mainEl.querySelectorAll('h1,h2,h3,h4,h5,h6'), function (x) {
        if (x.textContent === text) { el = x; return true; }
        return false;
      });
    }
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // 滚动监听:高亮当前节
  function bindScrollSpy() {
    if (!mainEl) return;
    var otpItems = function () { return Array.prototype.slice.call(document.querySelectorAll('.otp-item')); };
    var headings = function () { return Array.prototype.slice.call(mainEl.querySelectorAll('h1[id],h2[id],h3[id]')); };
    mainEl.addEventListener('scroll', function () {
      var hs = headings();
      var cur = null;
      for (var i = 0; i < hs.length; i++) {
        if (hs[i].getBoundingClientRect().top < 100) cur = hs[i];
        else break;
      }
      otpItems().forEach(function (b) {
        // otp 按钮顺序与 h2/h3 标题顺序一致;用文本比对定位当前项
        b.classList.toggle('current', cur ? b.textContent === cur.textContent : false);
      });
    }, { passive: true });
  }

  // 章节内链接委托(data-chapter / data-anchor / data-ext)
  function bindLinkDelegation() {
    if (!mainEl) return;
    mainEl.addEventListener('click', function (ev) {
      var a = ev.target.closest ? ev.target.closest('a') : null;
      if (!a || !mainEl.contains(a)) return;
      if (a.getAttribute('data-chapter')) {
        ev.preventDefault();
        var f = a.getAttribute('data-chapter').replace(/^\.?\/?chapters\//, '');
        switchTo(f);
      } else if (a.getAttribute('data-anchor')) {
        ev.preventDefault();
        var id = a.getAttribute('data-anchor');
        var el = document.getElementById(id) || document.getElementById('h-' + id);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else if (a.getAttribute('data-ext')) {
        ev.preventDefault();
        try { window.open(a.getAttribute('href'), '_blank'); } catch (e) { /* CSP 拦截则忽略 */ }
      }
    });
  }

  function switchTo(file) {
    state.current = file;
    try { if (zc && typeof zc.setWidgetState === 'function') zc.setWidgetState({ current: file }); } catch (e) { /* 状态非必需 */ }
    renderAll();
    if (mainEl) mainEl.scrollTop = 0;
  }

  function topbar() {
    var bar = h('div', { class: 'topbar' });
    bar.appendChild(h('h1', { text: '器灵文档面板' }));
    var subs = [];
    var d = state.data;
    if (d) {
      if (d.index && d.index.found) subs.push(d.index.title);
      subs.push((d.chapters ? d.chapters.filter(function (c) { return c.found; }).length : 0) + ' 章节');
      if (d.workspace) subs.push(d.workspace.split(/[\\/]/).pop());
    }
    bar.appendChild(h('span', { class: 'sub', text: subs.join(' · ') }));
    bar.appendChild(h('div', { class: 'spacer' }));
    if (d && d.truncated) bar.appendChild(h('span', { class: 'sub', text: '(兜底数据已瘦身)' }));
    var refresh = h('button', { class: 'btn', text: '刷新' });
    refresh.addEventListener('click', function () { boot(); });
    bar.appendChild(refresh);
    return bar;
  }

  function renderAll() {
    var app = document.getElementById('app');
    app.innerHTML = '';
    document.title = '器灵文档面板';

    if (state.loading) {
      app.appendChild(h('div', { class: 'placeholder' },
        h('div', { class: 'big', text: '⏳' }),
        h('h2', { text: '正在读取文档树…' }),
        h('p', { class: 'muted', text: '从当前工作区 .qiling/docs/ 读取 README.md 与 chapters/*.md' })));
      return;
    }
    if (state.error) {
      app.appendChild(h('div', { style: 'padding:20px' }, (function () {
        var ec = h('div', { class: 'error-card' });
        ec.appendChild(h('h2', { text: '面板数据不可用' }));
        ec.appendChild(h('p', { text: String(state.error.message || state.error) }));
        ec.appendChild(h('p', { class: 'muted', text: '正常入口是 ZCode 桌面端(侧栏「器灵文档面板」或让模型调用 ql_docs_panel 工具);浏览器直开调试请把面板数据另存为同目录 docs-data.json。' }));
        return ec;
      })()));
      return;
    }

    app.appendChild(topbar());
    var layout = h('div', { class: 'layout' });
    layout.appendChild(renderSidebar());
    layout.appendChild(renderArticle());
    layout.appendChild(renderOnThisPage());
    app.appendChild(layout);
    bindScrollSpy();
    bindLinkDelegation();
    renderDiagrams(document.querySelector('.article') || app);
  }

  // ---------- 启动 ----------
  function boot() {
    state.loading = true;
    state.error = null;
    renderAll();
    loadData().then(function (data) {
      state.data = data || { index: { found: false }, chapters: [] };
      try {
        if (zc && zc.widgetState && zc.widgetState.current) state.current = zc.widgetState.current;
      } catch (e) { /* 忽略 */ }
      state.loading = false;
      applyTheme();
      renderAll();
    }).catch(function (e) {
      state.loading = false;
      state.error = e;
      renderAll();
    });
  }

  applyTheme();
  boot();
})();
