/**
 * Offline visual preview for 框架笔记 (the node mind map).
 *
 * Why this exists: `render-check.cjs` proves the map is *correct* — every card placed once, no
 * card overlapping another, wires closed — but it cannot see a single pixel. "The palette is
 * muddy", "this structure reads as a staircase", "the picture is squashed" had to be argued from
 * screenshots. So this renders the real `client.js` through a minimal React stand-in, serialises
 * the element tree to HTML, injects the real CSS, and hands the file to headless Chrome: one PNG
 * per structure, one contact sheet, and a JSON of card rectangles.
 *
 * It is a development tool, not part of the shipped self-test: it needs a Chromium browser.
 *
 * Usage:
 *   node test/preview-notes.mjs [--out DIR] [--width 1440] [--height 900] [--only mind,org]
 *                               [--no-shot]
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = process.env.WORKBENCH_REPO
  || (fs.existsSync(path.join(HERE, '..', 'client.js')) ? path.resolve(HERE, '..') : process.cwd());
const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const at = args.indexOf(name);
  return at >= 0 && args[at + 1] ? args[at + 1] : fallback;
};
const OUT = path.resolve(argOf('--out', path.join(REPO, 'tmp-notes')));
const WIDTH = Number(argOf('--width', '1440'));
const HEIGHT = Number(argOf('--height', '900'));
const SHOT = !args.includes('--no-shot');
const ONLY = argOf('--only', '').split(',').filter(Boolean);
const PALETTE = argOf('--theme', 'classic');
const WIRES = argOf('--branch', 'curve');

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].find((candidate) => fs.existsSync(candidate));

//#region a minimal React stand-in that BUILDS A TREE
// (Same idea as preview-news.mjs: render-check.cjs throws its tree away into a flat list, which
// is enough to assert on but not enough to reconstruct markup.)

let slots = new Map();
let passCounts = new Map();
let cursorSlot = null;
let pendingEffects = [];
let dirty = false;

function sameDeps(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  return a.every((value, index) => Object.is(value, b[index]));
}

function enterComponent(name) {
  const ordinal = passCounts.get(name) || 0;
  passCounts.set(name, ordinal + 1);
  const key = name + '#' + ordinal;
  let slot = slots.get(key);
  if (!slot) { slot = { hooks: [] }; slots.set(key, slot) }
  slot.cursor = 0;
  return slot;
}

const React = {
  createElement(type, props) {
    const children = [];
    for (let i = 2; i < arguments.length; i += 1) {
      const value = arguments[i];
      if (value === null || value === undefined || typeof value === 'boolean') continue;
      children.push(value);
    }
    return { type, props: props || {}, children: children.flat(Infinity) };
  },
  Component: class {
    constructor(props) { this.props = props; this.state = {} }
    setState(patch) {
      const next = typeof patch === 'function' ? patch(this.state) : patch;
      if (next && typeof next === 'object') { this.state = Object.assign({}, this.state, next); dirty = true }
    }
  },
  useState(initial) {
    const slot = cursorSlot;
    const index = slot.cursor++;
    if (!(index in slot.hooks)) slot.hooks[index] = typeof initial === 'function' ? initial() : initial;
    return [slot.hooks[index], (next) => {
      const value = typeof next === 'function' ? next(slot.hooks[index]) : next;
      if (Object.is(value, slot.hooks[index])) return;
      slot.hooks[index] = value;
      dirty = true;
    }];
  },
  useRef(initial) {
    const slot = cursorSlot;
    const index = slot.cursor++;
    if (!(index in slot.hooks)) slot.hooks[index] = { current: initial };
    return slot.hooks[index];
  },
  useMemo(fn, deps) {
    const slot = cursorSlot;
    const index = slot.cursor++;
    const cell = slot.hooks[index];
    if (cell && sameDeps(cell.deps, deps)) return cell.value;
    const value = fn();
    slot.hooks[index] = { deps: deps || null, value };
    return value;
  },
  useCallback(fn, deps) {
    const slot = cursorSlot;
    const index = slot.cursor++;
    const cell = slot.hooks[index];
    if (cell && sameDeps(cell.deps, deps)) return cell.value;
    slot.hooks[index] = { deps: deps || null, value: fn };
    return fn;
  },
  useEffect(fn, deps) {
    const slot = cursorSlot;
    const index = slot.cursor++;
    const cell = slot.hooks[index];
    if (cell && sameDeps(cell.deps, deps)) return;
    slot.hooks[index] = { deps: deps || null };
    pendingEffects.push(fn);
  },
  useSyncExternalStore(subscribe, getSnapshot) { return getSnapshot() },
};
React.Component.prototype.isReactComponent = true;

function build(node) {
  if (node === null || node === undefined || typeof node === 'boolean') return null;
  if (typeof node === 'string' || typeof node === 'number') return { text: String(node) };
  if (Array.isArray(node)) return { children: node.map(build).filter(Boolean) };
  const { type, props, children } = node;
  const full = Object.assign({}, props, { children: children.length <= 1 ? children[0] : children });
  if (typeof type === 'string') {
    return { tag: type, props, children: children.map(build).filter(Boolean) };
  }
  const previous = cursorSlot;
  cursorSlot = enterComponent(type.name || 'anonymous');
  try {
    const out = (type.prototype && type.prototype.isReactComponent) ? new type(full).render() : type(full);
    return build(out);
  } finally {
    cursorSlot = previous;
  }
}

function render(component, props) {
  let guard = 0;
  let tree = null;
  do {
    dirty = false;
    passCounts = new Map();
    pendingEffects = [];
    tree = build(React.createElement(component, props || {}));
    for (const effect of pendingEffects) effect();
    guard += 1;
  } while (dirty && guard < 40);
  return tree;
}

//#endregion

//#region the module's own CSS, extracted verbatim

const source = fs.readFileSync(path.join(REPO, 'client.js'), 'utf8');
const cssMatch = /const CSS = `([\s\S]*?)`;\n/.exec(source);
if (!cssMatch) throw new Error('could not find the CSS template in client.js');
const CSS = cssMatch[1];

//#endregion

//#region pictures: a blob URL that is actually a picture, so the PNG shows real images

/**
 * The note map stores pictures in IndexedDB, which a Node preview does not have. Both halves are
 * faked here: `indexedDB` answers a read with `{ __key }`, and `createObjectURL` turns that key
 * into a small SVG data URL. The point is that the preview shows the *picture path* — a node with
 * an image really renders an <img> in the screenshot, at the height the layout reserved.
 */
function pictureFor(key) {
  const palettes = {
    'pic-field': ['#5aa9ff', '#12314f', '现场照片'],
    'pic-note': ['#34d399', '#0f3a2c', '手写批注'],
    'pic-doc': ['#fbbf24', '#4a3410', '材料'],
  };
  const [accent, deep, label] = palettes[key] || ['#a78bfa', '#2a2145', '图片'];
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="360" height="200">'
    + '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">'
    + '<stop offset="0" stop-color="' + accent + '"/><stop offset="1" stop-color="' + deep + '"/>'
    + '</linearGradient></defs>'
    + '<rect width="360" height="200" fill="url(#g)"/>'
    + '<circle cx="286" cy="48" r="26" fill="' + accent + '" opacity=".55"/>'
    + '<path d="M0 150 L96 92 L176 140 L252 96 L360 152 L360 200 L0 200 Z" fill="#000" opacity=".22"/>'
    + '<text x="18" y="34" font-family="sans-serif" font-size="19" fill="#fff" opacity=".92">' + label + '</text>'
    + '</svg>';
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

//#endregion

//#region the demo map

/**
 * The demo has to exercise what the structure does: three levels, a folded branch, and two
 * pictures with different heights (a row of equal cards would hide exactly the bug this preview
 * is here to catch).
 */
const demoTree = () => ({
  id: 'n-root', title: '框架笔记 · 节点式思维导图', body: '一条树 = 一张图', collapsed: false,
  imageKey: '', imageHeight: 96, imageFit: 'cover', color: '', shape: '', ox: 0, oy: 0,
  children: [
    {
      id: 'n-layout', title: '6 种结构预设', body: '纯函数排布，保证不重叠', children: [
        { id: 'n-l1', title: '思维导图 · 逻辑图', body: '', children: [] },
        { id: 'n-l2', title: '组织结构图 · 树形图', body: '', children: [] },
        { id: 'n-l3', title: '时间轴 · 鱼骨图', body: '轴与骨是 guides，不是 edges', children: [] },
      ],
    },
    {
      id: 'n-node', title: '节点能力', body: '文字 + 图片', children: [
        {
          id: 'n-img', title: '节点里可以放图片', body: '拖动文件或直接粘贴',
          imageKey: 'pic-field', imageHeight: 112, imageFit: 'cover', children: [],
        },
        {
          id: 'n-img2', title: '裁剪填满 / 完整显示', body: '高度 56–240 可调',
          imageKey: 'pic-note', imageHeight: 84, imageFit: 'cover', children: [],
        },
      ],
    },
    {
      id: 'n-edit', title: '编辑与撤销', body: '快照式 40 步', children: [
        { id: 'n-e1', title: '双击改名 · Tab 加子节点', body: '', children: [] },
        { id: 'n-e2', title: 'Enter 加同级 · Delete 删除', body: '', children: [] },
        { id: 'n-e3', title: '拖拽卡片 · 整理一键归位', body: '', children: [] },
      ],
    },
    {
      id: 'n-fold', title: '折叠的分支', body: '画布与大纲一起收起', collapsed: true,
      children: [{ id: 'n-f1', title: '藏起来的节点', body: '', children: [] }],
    },
    {
      id: 'n-view', title: '视图按模块记住', body: '缩放 / 平移 / 侧栏开合', children: [
        { id: 'n-v1', title: '适应画布 · 1:1', body: '', children: [] },
      ],
    },
  ],
});

const LAYOUTS = ['mind', 'logic', 'org', 'tree', 'timeline', 'fish'];

//#endregion

//#region the stub window the plugin expects

function makeWindow(store) {
  const blobs = new Map();
  return {
    __ModuleLoader__: { load: (value) => { registration = value } },
    localStorage: {
      getItem: (key) => (store.has(key) ? store.get(key) : null),
      setItem: (key, value) => store.set(key, String(value)),
      removeItem: (key) => store.delete(key),
    },
    listeners: new Map(),
    addEventListener(type, fn) { this.listeners.set(type, fn) },
    removeEventListener(type) { this.listeners.delete(type) },
    timers: new Map(),
    timerSeq: 0,
    setTimeout(fn, delay) {
      const id = ++this.timerSeq;
      this.timers.set(id, { fn, at: (this.timerNow || 0) + (Number(delay) || 0) });
      return id;
    },
    clearTimeout(id) { this.timers.delete(id) },
    URL: { createObjectURL: (blob) => pictureFor(blob && blob.__key), revokeObjectURL: () => {} },
    indexedDB: {
      open() {
        const request = { result: null, error: null, onsuccess: null, onerror: null, onupgradeneeded: null };
        request.result = {
          objectStoreNames: { contains: () => true },
          close() {},
          onversionchange: null,
          onclose: null,
          transaction: (name, mode) => {
            const tx = { error: null, oncomplete: null, onerror: null, onabort: null };
            const answer = (result) => {
              const hit = { result, error: null };
              setTimeout(() => { if (hit.onsuccess) hit.onsuccess() }, 0);
              return hit;
            };
            tx.objectStore = () => ({
              get: (key) => { blobs.set(key, { __key: key }); return answer(blobs.get(key)) },
              put: (value, key) => { blobs.set(key, value); return answer(true) },
              delete: (key) => { blobs.delete(key); return answer(true) },
            });
            if (mode !== 'readonly') setTimeout(() => { if (tx.oncomplete) tx.oncomplete() }, 0);
            return tx;
          },
        };
        setTimeout(() => { if (request.onsuccess) request.onsuccess() }, 0);
        return request;
      },
    },
    open: () => {},
    document: {
      createElement: () => ({ style: {}, click() {}, setAttribute() {} }),
      body: { appendChild() {}, removeChild() {} },
    },
  };
}

let registration = null;
const store = new Map();
const windowStub = makeWindow(store);

store.set('dsh-workbench.v3', JSON.stringify({
  v: 3, newsSeeded: true, notes: {},
  modules: [{
    id: 'mod-note', kind: 'notebook', name: '框架笔记', desc: '', accent: '#5aa9ff',
    preset: 'triple', created: 1,
    noteRoot: demoTree(),
    noteStyle: { layout: 'mind', branch: 'curve', theme: 'classic' },
    noteView: { x: 0, y: 0, zoom: 1, outline: true, inspector: true, fitted: false },
  }],
}));

new Function('window', 'setTimeout', 'clearTimeout', 'navigator', 'document', source)(
  windowStub,
  (fn, delay) => windowStub.setTimeout(fn, delay),
  (id) => windowStub.clearTimeout(id),
  { language: 'zh', languages: ['zh-CN'] },
  windowStub.document,
);
if (!registration) throw new Error('client.js registered no module');

const instance = registration.factory((name) => {
  if (name === 'react') return React;
  throw new Error('unexpected require: ' + name);
});

const ctx = {
  sessions: {
    list: { getSnapshot: () => ({ ids: [], byId: {}, phase: 'empty' }), subscribe: () => () => {} },
    binding: () => undefined,
    refreshProjections: () => Promise.resolve(),
  },
  layout: { selectPanel: () => {} },
  locale: { getSnapshot: () => 'zh' },
  on: () => () => {},
  effect: (fn) => { const off = fn(); return typeof off === 'function' ? off : () => {} },
  get: () => undefined,
  slots: {
    inject: (key, callback) => { callback(); return () => {} },
    register: (options, component) => {
      if (options.name === 'main' && options.key === 'workbench') mainEntry = { options, component };
      return () => {};
    },
  },
};
let mainEntry = null;
instance.apply(ctx);
if (!mainEntry) throw new Error('the plugin registered no main entry');

//#endregion

//#region element tree -> html

// SVG geometry belongs in here: the wires carry `d` and the guides carry `x1/y1/x2/y2`, and a
// `<path>` without a `d` is invisible however correct the geometry was.
const HTML_ATTRS = ['title', 'href', 'src', 'alt', 'role', 'value', 'placeholder', 'type', 'min', 'max', 'step', 'disabled', 'aria-label', 'loading', 'target', 'rel',
  'd', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'points', 'viewBox', 'pathLength', 'fill', 'stroke', 'stroke-width'];
const SKIP_ATTRS = ['onClick', 'onChange', 'onKeyDown', 'onDoubleClick', 'onPointerDown', 'onPointerMove', 'onPointerUp', 'onPointerCancel', 'onPointerLeave', 'onBlur', 'onFocus', 'onPaste', 'onDrop', 'onDragOver', 'onDragLeave', 'onAnimationEnd', 'ref', 'children', 'sourceMap', 'draggable', 'tabIndex'];

const escapeHtml = (value) => String(value)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function styleOf(style) {
  if (!style || typeof style !== 'object') return '';
  return Object.entries(style)
    .filter(([, value]) => value !== undefined && value !== null && typeof value !== 'object')
    .map(([key, value]) => (key.startsWith('--') ? key + ':' + value : key.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase()) + ':' + value))
    .join(';');
}

function toHtml(node) {
  if (!node) return '';
  if (node.text !== undefined) return escapeHtml(node.text);
  if (!node.tag) return (node.children || []).map(toHtml).join('');
  const props = node.props || {};
  const attrs = [];
  if (props.className) attrs.push('class="' + escapeHtml(props.className) + '"');
  const style = styleOf(props.style);
  if (style) attrs.push('style="' + escapeHtml(style) + '"');
  for (const [key, value] of Object.entries(props)) {
    if (SKIP_ATTRS.includes(key) || key === 'className' || key === 'style') continue;
    if (HTML_ATTRS.includes(key) && value !== undefined && value !== null && value !== false) {
      attrs.push(key + '="' + escapeHtml(value === true ? '' : value) + '"');
    }
    if (key.startsWith('data-') && value !== undefined && value !== null) {
      attrs.push(key + '="' + escapeHtml(value) + '"');
    }
  }
  const open = '<' + node.tag + (attrs.length ? ' ' + attrs.join(' ') : '') + '>';
  return open + (node.children || []).map(toHtml).join('') + '</' + node.tag + '>';
}

/**
 * The host supplies its own theme tokens; a standalone page has none, so the ones this CSS reads
 * are stubbed with the shipped dark palette — otherwise every frosted pane renders transparent
 * and the screenshot is useless.
 */
const THEME = `
:root{
  color-scheme: dark;
  --dsw-alias-bg-base:#1b1c1e; --dsw-alias-bg-layer-1:#232427; --dsw-alias-bg-layer-2:#2a2c30;
  --dsw-alias-bg-overlay:#26282c;
  --dsw-alias-label-primary:#eceef1; --dsw-alias-label-secondary:#9aa0a8;
  --dsw-alias-border-l1:rgba(255,255,255,.09); --dsw-alias-border-l2:rgba(255,255,255,.16);
  --dsw-alias-brand-primary:#5aa9ff;
  --dsw-alias-state-success-primary:#3ddc97; --dsw-alias-state-warn-primary:#f5b544;
  --dsw-alias-state-error-primary:#ff6b6b; --dsw-alias-state-idle-primary:#8f939c;
  --dsw-font-mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
  --dsw-frame-top-clearance:0px;
  --wsb-c1:#5aa9ff; --wsb-c2:#a78bfa; --wsb-surface-2:#22252a;
  --wsb-glass-alpha:52%; --wsb-glass-blur:28px; --wsb-glass-sat:180%; --wsb-glass-bright:1;
  --wsb-glass-sheen:1; --wsb-glass-rim:1; --wsb-glass-spec:1; --wsb-glass-tint:#8fa6c8;
  --wsb-glass-hair:#242728; --wsb-spring:cubic-bezier(.2,.9,.24,1);
}
html,body{margin:0;padding:0;height:100%;background:#111213;
  font-family:-apple-system,"Segoe UI","Microsoft YaHei",system-ui,sans-serif;color:#eceef1}
.host{position:relative;height:100vh;overflow:hidden}

/* A preview is a still, not a launch. Chrome's virtual clock is being fast-forwarded while the
   screenshot is taken, so a screen caught inside its arrival animation photographs as opacity 0 —
   which shows the home screen's tiles instead of the map. The real GUI runs these animations;
   this document turns them off so two runs of the same map produce the same picture.
   The home SCREEN is hidden because the real GUI conceals it while a module is open, but the
   desktop background layer above it stays — that is what the map's frosted canvas blurs.
   (No backticks in this block: it lives inside a JS template literal.) */
.wsb-screen{animation:none !important;opacity:1 !important;transform:none !important}
.wsb-screen>.wsb-root{animation:none !important;opacity:1 !important}
.wsb-screen[data-role="home"]{display:none}
`;

//#endregion

//#region render one structure

/** Find the first node in the built tree with the given class. */
const flatten = (node, out = []) => {
  if (!node) return out;
  if (node.tag) out.push(node);
  for (const child of node.children || []) flatten(child, out);
  return out;
};

/**
 * Render one structure and return { html, tree }. The pictures arrive through two promise chains
 * (open the store, read the record), so the tree is rendered twice with a macrotask turn between
 * — otherwise the <img> elements would be serialised before their blob URLs exist.
 */
async function renderLayout(layout) {
  const state = JSON.parse(store.get('dsh-workbench.v3'));
  state.modules[0].noteStyle = Object.assign({}, state.modules[0].noteStyle, { layout, theme: PALETTE, branch: WIRES });
  store.set('dsh-workbench.v3', JSON.stringify(state));
  slots = new Map();

  let tree = render(mainEntry.component, {});
  const card = flatten(tree).find((node) => typeof node.props.className === 'string'
    && node.props.className.split(/\s+/).includes('wsb-card'));
  if (!card) throw new Error('no module card to open');
  card.props.onClick({ stopPropagation() {}, preventDefault() {}, currentTarget: null, target: null });

  tree = render(mainEntry.component, {});
  await new Promise((resolve) => { setTimeout(resolve, 30) });
  tree = render(mainEntry.component, {});
  return tree;
}

function pageFor(tree, layout, extraScript) {
  return [
    '<!doctype html><html lang="zh"><head><meta charset="utf-8">',
    '<title>框架笔记 · ' + layout + '</title>',
    '<style>' + THEME + '</style>',
    '<style>' + CSS + '</style>',
    '</head><body><div class="host">',
    toHtml(tree),
    extraScript || '',
    '</div></body></html>',
  ].join('\n');
}

/** The measurement script: card rectangles, overlaps, and anything spilling out of the canvas. */
const MEASURE = `<script>
window.addEventListener('load', function () {
  // Mirror the app's own 适应画布. The Node-side render has no DOM, so the camera baked into the
  // HTML came from the 900x560 fallback; re-fitting against the real canvas is exactly what the
  // 适应画布 button does, and it is what makes the still show the whole map instead of a corner.
  var canvas = document.querySelector('[data-note-canvas]');
  var world = document.querySelector('[data-note-world]');
  if (canvas && world) {
    var w = parseFloat(world.style.width) || 1;
    var h = parseFloat(world.style.height) || 1;
    var cr0 = canvas.getBoundingClientRect();
    var fit = Math.min((cr0.width - 36) / w, (cr0.height - 36) / h, 1.3);
    world.style.transform = 'translate(' + ((cr0.width - w * fit) / 2) + 'px,'
      + ((cr0.height - h * fit) / 2) + 'px) scale(' + fit + ')';
  }
  function box(node) {
    var r = node.getBoundingClientRect();
    return { id: node.getAttribute('data-note-card'), left: Math.round(r.left), top: Math.round(r.top),
      right: Math.round(r.right), bottom: Math.round(r.bottom), width: Math.round(r.width), height: Math.round(r.height) };
  }
  var cards = [].slice.call(document.querySelectorAll('[data-note-card]')).map(box);
  var overlaps = 0;
  for (var i = 0; i < cards.length; i += 1) {
    for (var j = i + 1; j < cards.length; j += 1) {
      var a = cards[i]; var b = cards[j];
      if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) overlaps += 1;
    }
  }
  canvas = document.querySelector('[data-note-canvas]');
  var cr = canvas ? canvas.getBoundingClientRect() : null;
  var outside = cr ? cards.filter(function (c) {
    return c.right < cr.left + 1 || c.left > cr.right - 1 || c.bottom < cr.top + 1 || c.top > cr.bottom - 1;
  }).length : -1;
  var wires = [].slice.call(document.querySelectorAll('[data-note-wire]'));
  var report = {
    viewport: { width: window.innerWidth, height: window.innerHeight },
    layout: document.querySelector('[data-role="notes"]').getAttribute('data-note-layout-now'),
    theme: document.querySelector('[data-role="notes"]').getAttribute('data-note-theme-now'),
    cards: cards.length,
    cardBoxes: cards,
    overlaps: overlaps,
    cardsOutsideTheViewport: outside,
    wires: wires.length,
    wiresWithGeometry: wires.filter(function (n) { return (n.getAttribute('d') || '').length > 6 }).length,
    guides: document.querySelectorAll('[data-note-guide]').length,
    guidesWithGeometry: [].slice.call(document.querySelectorAll('[data-note-guide]')).filter(function (n) {
      return n.getAttribute('x2') !== null;
    }).length,
    pictures: document.querySelectorAll('[data-note-image-img]').length,
    outlineRows: document.querySelectorAll('[data-note-row]').length,
    canvas: cr ? { width: Math.round(cr.width), height: Math.round(cr.height) } : null,
    world: (function () { var n = document.querySelector('[data-note-world]'); return n ? n.style.transform : null })(),
    horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    clippedText: [].slice.call(document.querySelectorAll('.wsb-noteCardTitle')).filter(function (n) {
      return n.scrollHeight > n.clientHeight + 1;
    }).length,
  };
  var pre = document.createElement('pre');
  pre.id = 'measure';
  // Kept in the DOM for \`--dump-dom\` but out of the picture: a negative offset can end up inside
  // a full-page capture, which put a wall of JSON across the top of the screenshot.
  pre.style.cssText = 'position:fixed;left:0;top:0;opacity:0;pointer-events:none';
  pre.textContent = JSON.stringify(report);
  document.body.appendChild(pre);
  document.title = '框架笔记 ' + report.layout;
});
</script>`;

//#endregion

fs.mkdirSync(OUT, { recursive: true });
const chosen = ONLY.length ? LAYOUTS.filter((id) => ONLY.includes(id)) : LAYOUTS.slice();
const reports = [];

for (const layout of chosen) {
  const tree = await renderLayout(layout);
  const htmlPath = path.join(OUT, 'notes-' + layout + '.html');
  fs.writeFileSync(htmlPath, pageFor(tree, layout, MEASURE), 'utf8');
  if (!CHROME) {
    console.log('no Chromium-based browser found; wrote ' + htmlPath);
    continue;
  }
  const common = ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
    '--no-default-browser-check', '--user-data-dir=' + path.join(OUT, 'chrome-profile'),
    '--window-size=' + WIDTH + ',' + HEIGHT];
  const dom = execFileSync(CHROME, common.concat(['--virtual-time-budget=2200', '--dump-dom', pathToFileURL(htmlPath).href]), {
    encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'],
  });
  const match = /<pre id="measure"[^>]*>([\s\S]*?)<\/pre>/.exec(dom);
  if (!match) {
    console.log(layout.padEnd(9) + ' could not read the measurement node');
    continue;
  }
  const report = JSON.parse(match[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
  reports.push(report);
  if (SHOT) {
    const shot = path.join(OUT, 'notes-' + layout + '.png');
    execFileSync(CHROME, common.concat(['--virtual-time-budget=2200', '--screenshot=' + shot, pathToFileURL(htmlPath).href]), {
      stdio: ['ignore', 'ignore', 'ignore'],
    });
    report.bytes = fs.statSync(shot).size;
  }
  console.log(layout.padEnd(9)
    + ' cards ' + String(report.cards).padStart(2)
    + ' · wires ' + report.wiresWithGeometry + '/' + report.wires
    + ' · guides ' + report.guidesWithGeometry + '/' + report.guides
    + ' · pictures ' + report.pictures
    + ' · outline ' + String(report.outlineRows).padStart(2)
    + ' · overlaps ' + report.overlaps
    + (report.cardsOutsideTheViewport ? ' · OFF-SCREEN ' + report.cardsOutsideTheViewport : '')
    + (report.clippedText ? ' · title clipped x' + report.clippedText : '')
    + (report.horizontalOverflow ? ' · overflow ' + report.horizontalOverflow + 'px' : '')
    + (report.bytes ? ' · ' + report.bytes + ' bytes' : ''));
  // A picture that silently failed to load would leave the preview looking fine and prove nothing.
  if (report.wiresWithGeometry !== report.wires) throw new Error(layout + ': ' + (report.wires - report.wiresWithGeometry) + ' wires have no path');
  if (report.guidesWithGeometry !== report.guides) throw new Error(layout + ': ' + (report.guides - report.guidesWithGeometry) + ' guides have no geometry');
  if (report.overlaps) throw new Error(layout + ': ' + report.overlaps + ' overlapping cards in the DOM');
  if (report.cardsOutsideTheViewport) throw new Error(layout + ': ' + report.cardsOutsideTheViewport + ' cards are outside the canvas');
  if (report.pictures !== 2) throw new Error(layout + ': expected the two demo pictures, saw ' + report.pictures);
}

fs.writeFileSync(path.join(OUT, 'notes-measure.json'), JSON.stringify(reports, null, 2), 'utf8');
console.log('\nmeasurements: ' + path.join(OUT, 'notes-measure.json'));

// A contact sheet, so all six can be judged side by side in one look. The screenshots are small
// enough to inline, which keeps the page free of file:// image restrictions.
if (SHOT && CHROME && reports.length > 1) {
  const cells = chosen.map((layout) => {
    const file = path.join(OUT, 'notes-' + layout + '.png');
    if (!fs.existsSync(file)) return '';
    const data = fs.readFileSync(file).toString('base64');
    return '<figure><img src="data:image/png;base64,' + data + '" alt="' + layout + '">'
      + '<figcaption>' + layout + '</figcaption></figure>';
  }).join('');
  const sheet = '<!doctype html><html lang="zh"><head><meta charset="utf-8">'
    + '<style>body{margin:0;padding:16px;background:#0f1012;color:#eceef1;'
    + 'font:12px/1.5 -apple-system,"Segoe UI",system-ui,sans-serif}'
    + 'h1{margin:0 0 12px;font-size:15px;font-weight:600}'
    + 'main{display:grid;grid-template-columns:repeat(2,1fr);gap:14px}'
    + 'figure{margin:0}img{width:100%;display:block;border:1px solid #2a2d31;border-radius:10px}'
    + 'figcaption{margin-top:5px;color:#9aa0a8;letter-spacing:.04em}</style></head><body>'
    + '<h1>框架笔记 · 6 种结构预设（真 client.js 渲染）</h1><main>' + cells + '</main></body></html>';
  const sheetPath = path.join(OUT, 'notes-structures.html');
  fs.writeFileSync(sheetPath, sheet, 'utf8');
  const sheetShot = path.join(OUT, 'notes-structures.png');
  execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
    '--user-data-dir=' + path.join(OUT, 'chrome-profile'), '--window-size=' + (WIDTH + 40) + ',' + Math.round(HEIGHT * 1.5),
    '--virtual-time-budget=3000', '--screenshot=' + sheetShot, pathToFileURL(sheetPath).href],
  { stdio: ['ignore', 'ignore', 'ignore'] });
  console.log('contact sheet: ' + sheetShot + ' (' + fs.statSync(sheetShot).size + ' bytes)');
}
if (!CHROME) console.log('no Chromium-based browser found; HTML written for manual inspection');
