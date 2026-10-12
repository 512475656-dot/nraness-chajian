/**
 * Offline visual preview for the Workbench screens.
 *
 * Why this exists: `render-check.cjs` proves the component tree is *correct*, but it cannot see
 * a single pixel — so "the panes look too wide" or "this text is clipped" had to be argued from
 * screenshots instead of measured. This renders the real `client.js` through a minimal React
 * stand-in, serialises the resulting element tree to HTML, injects the real CSS, and hands the
 * file to headless Chrome. The result is a PNG you can look at and a JSON of element rectangles
 * you can assert on.
 *
 * It is a development tool, not part of the shipped self-test: it needs a Chromium-based browser
 * on the machine.
 *
 * Usage:
 *   node tools/preview-notebook.mjs [--out DIR] [--width 1407] [--height 856] [--no-shot]
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';

// Works from either place this file lives: the plugin checkout itself (`test/preview-notebook.mjs`)
// or a tools directory elsewhere (`WORKBENCH_REPO` overrides both).
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = process.env.WORKBENCH_REPO
  || (fs.existsSync(path.join(HERE, '..', 'client.js'))
    ? path.resolve(HERE, '..')
    : 'C:/Users/Administrator/dsh-workbench-git');
const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const at = args.indexOf(name);
  return at >= 0 && args[at + 1] ? args[at + 1] : fallback;
};
const OUT = path.resolve(argOf('--out', path.join(HERE, '..', 'tmp-preview')));
const WIDTH = Number(argOf('--width', '1400'));
const HEIGHT = Number(argOf('--height', '900'));
const SHOT = !args.includes('--no-shot');
/** Which note structure to draw: mind | logic | org | tree | timeline | fish. */
const VIEW = argOf('--view', 'mind');

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find((candidate) => fs.existsSync(candidate));

//#region a minimal React stand-in that BUILDS A TREE
// render-check.cjs renders to a flat list of elements plus a flat list of strings, which is
// enough to assert on but not enough to reconstruct markup. This variant builds nesting.

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
    const out = (type.prototype && type.prototype.isReactComponent)
      ? new type(full).render()
      : type(full);
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
const cssMatch = /^[ \t]*const CSS = `([\s\S]*?)`;[ \t]*$/m.exec(source);
if (!cssMatch) throw new Error('could not find the CSS template in client.js');
const CSS = cssMatch[1];

//#endregion

//#region the stub window / fetch the plugin expects

const store = new Map();
const windowStub = {
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
  URL: { createObjectURL: () => 'blob:preview/1', revokeObjectURL: () => {} },
  open: () => {},
  document: { createElement: () => ({ style: {}, click() {}, setAttribute() {} }), body: { appendChild() {}, removeChild() {} } },
};
let registration = null;

const now = Date.now();

/**
 * A note tree with two levels of nesting under several branches.
 *
 * Deliberately uneven: one branch goes three deep while its sibling has none, which is the shape
 * that exposed the 时间轴 / 鱼骨图 packing bug (a node with both a sibling and a child).
 */
const noteTree = {
  id: 'r', title: '笔记23', body: '', children: [
    { id: 'a', title: '实战', body: '', children: [
      { id: 'a1', title: '节点', body: '', children: [
        { id: 'a1x', title: '深一层', body: '', children: [] },
      ] },
      { id: 'a2', title: '节点', body: '', children: [] },
    ] },
    { id: 'b', title: '节点', body: '', children: [
      { id: 'b1', title: '节点', body: '', children: [] },
      { id: 'b2', title: '节点', body: '', children: [
        { id: 'b2x', title: '深一层', body: '', children: [] },
      ] },
    ] },
    { id: 'c', title: '节点', body: '', children: [] },
    { id: 'd', title: '节点', body: '', children: [] },
    { id: 'e', title: '节点', body: '', children: [] },
  ],
};

store.set('dsh-workbench.v3', JSON.stringify({
  v: 3,
  noteSeeded: true,
  notes: {},
  modules: [{
    id: 'mod-note', kind: 'notebook', name: '框架笔记', desc: '', accent: '#34d399',
    preset: 'triple', created: 1,
    noteRoot: noteTree,
    noteStyle: { layout: VIEW, branch: 'curve', theme: 'classic' },
    noteView: { x: 0, y: 0, zoom: 1, outline: true, inspector: true, fitted: true },
  }],
}));

globalThis.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) });

//#endregion


//#region frame the map for the screenshot

/**
 * The plugin's own layout functions, pulled out of the real source.
 *
 * Only for the camera seed below: the preview has to know how big the map will be *before* the
 * first render, and the honest way to find that out is to run the shipped geometry rather than to
 * hard-code a guess that drifts the moment a gap changes.
 */
function noteGeometryForCamera() {
  const source = fs.readFileSync(path.join(REPO, 'client.js'), 'utf8');
  const cut = (name) => {
    const at = source.indexOf('function ' + name + '(');
    if (at < 0) throw new Error('missing ' + name);
    let depth = 0;
    let i = source.indexOf('{', at);
    for (; i < source.length; i += 1) {
      if (source[i] === '{') depth += 1;
      else if (source[i] === '}') { depth -= 1; if (depth === 0) break }
    }
    return source.slice(at, i + 1);
  };
  const names = ['clamp', 'noteVisibleChildren', 'noteTextLines', 'noteCardFont', 'noteCardBox', 'noteSpanV', 'noteSpanH', 'noteLevels',
    'placeBranch', 'noteCentreNode', 'noteLayoutMind', 'noteLayoutLogic', 'noteLayoutTree',
    'noteLayoutOrg', 'noteAxisSubtree', 'appendAxisSubtree', 'chainWidth', 'noteLayoutTimeline',
    'noteLayoutFish', 'noteFinish', 'noteLayoutFor', 'noteWireD', 'walkNotes'];
  const consts = ['NOTE_GAP_X', 'NOTE_GAP_Y', 'NOTE_GAP_L', 'NOTE_GAP_ROW', 'NOTE_AXIS_OFF',
    'NOTE_RIB', 'NOTE_SUB_INDENT', 'NOTE_TL_GAP', 'NOTE_PAD', 'NOTE_W', 'NOTE_H',
    'NOTE_MIN_W', 'NOTE_MIN_H'];
  const constSrc = consts.map((name) => {
    const hit = new RegExp('const ' + name + ' = (-?[\\d.]+)').exec(source);
    return hit ? 'const ' + name + ' = ' + hit[1] + ';' : '';
  }).join('\n');
  const body = constSrc + '\n' + names.map(cut).join('\n\n');
  return new Function(body + '\nreturn { noteLayoutFor };')();
}

/** Same shape as the plugin's own `fitFor`, using the real layout box for this structure. */
function seedCamera(layout, vw, vh) {
  const zoom = Math.min((vw - 36) / layout.box.w, (vh - 36) / layout.box.h, 1.3);
  return { zoom, x: (vw - layout.box.w * zoom) / 2, y: (vh - layout.box.h * zoom) / 2 };
}
{
  const layout = noteGeometryForCamera().noteLayoutFor(VIEW, noteTree);
  const seeded = seedCamera(layout, 1010, 590);
  const raw = JSON.parse(store.get('dsh-workbench.v3'));
  raw.modules[0].noteView = Object.assign({}, raw.modules[0].noteView, seeded);
  store.set('dsh-workbench.v3', JSON.stringify(raw));
  console.log('camera seed: zoom=' + seeded.zoom.toFixed(3)
    + ' box=' + Math.round(layout.box.w) + 'x' + Math.round(layout.box.h));
}
//#endregion

//#region mount the plugin and grab the news screen

const injected = [];
let panellist = null;
let mainEntry = null;

new Function('window', source)(windowStub);
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
    inject: (key, callback) => { injected.push(key); callback(); return () => {} },
    register: (options, component) => {
      if (options.name === 'sidebar.panellist' && options.id === 'workbench') panellist = { options, component };
      if (options.name === 'main' && options.key === 'workbench') mainEntry = { options, component };
      return () => {};
    },
  },
};
instance.apply(ctx);
if (!mainEntry) throw new Error('the plugin registered no main entry');

// Open the news module: mount the home screen, then click the news card the way a user does.
let tree = render(mainEntry.component, {});
const flatten = (node, out = []) => {
  if (!node) return out;
  if (node.tag) out.push(node);
  for (const child of node.children || []) flatten(child, out);
  return out;
};
const clickable = flatten(tree).find((node) => typeof node.props.className === 'string'
  && node.props.className.split(/\s+/).includes('wsb-card')
  && node.props['data-add'] !== 'true');
if (!clickable) throw new Error('no module card to open');
clickable.props.onClick({ stopPropagation() {}, preventDefault() {}, currentTarget: null, target: null });

// Two passes: the click sets route state, the effects then fire the fetch, whose promise
// resolution needs a real microtask turn before the final render.
tree = render(mainEntry.component, {});
await new Promise((resolve) => setTimeout(resolve, 60));
tree = render(mainEntry.component, {});

//#endregion

//#region open the 文件 menu for the screenshot (--file)
if (args.includes('--file')) {
  const btn = flatten(tree).find((node) => node.props && node.props['data-note-file'] === '1');
  if (!btn) throw new Error('no 文件 button');
  btn.props.onClick({ stopPropagation() {}, preventDefault() {} });
  tree = render(mainEntry.component, {});
}
//#endregion

//#region element tree -> html

const HTML_ATTRS = ['x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'points', 'd', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray', 'viewBox', 'opacity', 'title', 'href', 'src', 'alt', 'role', 'value', 'placeholder', 'type', 'min', 'max', 'step', 'disabled', 'aria-label', 'loading', 'target', 'rel'];
const SKIP_ATTRS = ['onClick', 'onChange', 'onKeyDown', 'onDoubleClick', 'onPointerDown', 'onPointerMove', 'onPointerUp', 'onPointerCancel', 'onAnimationEnd', 'onBlur', 'ref', 'children', 'sourceMap'];

function escapeHtml(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

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
  const children = (node.children || []).map(toHtml).join('');
  return open + children + '</' + node.tag + '>';
}

/**
 * The host supplies its own theme tokens. A standalone page has none, so the ones this CSS
 * actually reads are stubbed with values close to the shipped GUI's dark palette — otherwise
 * every surface renders transparent and the screenshot is useless (and the measurement wrong,
 * because a transparent box still has a size but the eye cannot check it).
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
}
html,body{margin:0;padding:0;height:100%;background:#111213;
  font-family:-apple-system,"Segoe UI","Microsoft YaHei",system-ui,sans-serif;color:#eceef1}
body{padding:0}
.host{position:relative;height:100vh;overflow:hidden}
`;

const html = [
  '<!doctype html><html lang="zh"><head><meta charset="utf-8">',
  '<title>workbench preview</title>',
  '<style>' + THEME + '</style>',
  '<style>' + CSS + '</style>',
  '</head><body><div class="host">',
  '<div class="wsb-root" data-palette="aurora" data-glass="regular" data-shape="rounded" data-form="square" data-size="regular" data-layout="desktop" style="height:100%">',
  toHtml(tree),
  '</div>',
  // Measurement script: run after layout, write the numbers into the title and into a node so
  // `--dump-dom` can read them. The title is also handy when eyeballing a screenshot.
  `<script>
window.addEventListener('load', function () {
  function rect(selector) {
    var node = document.querySelector(selector);
    if (!node) return null;
    var box = node.getBoundingClientRect();
    return { left: Math.round(box.left), right: Math.round(box.right), width: Math.round(box.width), height: Math.round(box.height) };
  }
  var panes = [].slice.call(document.querySelectorAll('[data-news-pane]')).map(function (node) {
    var box = node.getBoundingClientRect();
    return { pane: node.getAttribute('data-news-pane'), left: Math.round(box.left), right: Math.round(box.right), width: Math.round(box.width) };
  });
  var grid = rect('[data-news-grid]');
  var news = rect('.wsb-news');
  var screen = rect('[data-role="news"]');
  var overflowX = document.documentElement.scrollWidth - document.documentElement.clientWidth;
  var report = {
    viewport: { width: window.innerWidth, height: window.innerHeight },
    axis: { screenRight: screen && screen.right, gridRight: grid && grid.right, newsRight: news && news.right },
    panes: panes,
    horizontalOverflow: overflowX,
    scrollWidth: document.documentElement.scrollWidth,
    cards: document.querySelectorAll('[data-news-item]').length,
    hotCards: document.querySelectorAll('[data-hot]').length,
  };
  var pre = document.createElement('pre');
  pre.id = 'measure';
  pre.style.cssText = 'position:fixed;left:-9999px;top:0';
  pre.textContent = JSON.stringify(report);
  document.body.appendChild(pre);
  document.title = 'M ' + JSON.stringify(report);
});
</script>`,
  '</div></body></html>',
].join('\n');

fs.mkdirSync(OUT, { recursive: true });
const htmlPath = path.join(OUT, 'notebook-preview.html');
fs.writeFileSync(htmlPath, html, 'utf8');
console.log('wrote', htmlPath, '(' + html.length + ' bytes)');

//#endregion

if (!CHROME) {
  console.log('no Chromium-based browser found; skipping the render');
  process.exit(0);
}

const common = ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check',
  '--user-data-dir=' + path.join(OUT, 'chrome-profile'), '--window-size=' + WIDTH + ',' + HEIGHT];

// Measurements first: --dump-dom prints the document after load, including the injected <pre>.
const dom = execFileSync(CHROME, common.concat(['--virtual-time-budget=2500', '--dump-dom', pathToFileURL(htmlPath).href]), {
  encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'],
});
const match = /<pre id="measure"[^>]*>([\s\S]*?)<\/pre>/.exec(dom);
if (!match) {
  console.log('could not read the measurement node out of the DOM');
} else {
  const report = JSON.parse(match[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
  fs.writeFileSync(path.join(OUT, 'news-measure.json'), JSON.stringify(report, null, 2), 'utf8');
  console.log('\nmeasurements @ ' + report.viewport.width + 'x' + report.viewport.height);
  console.log('  horizontal overflow :', report.horizontalOverflow, 'px (scrollWidth ' + report.scrollWidth + ')');
  console.log('  screen right edge   :', report.axis.screenRight, '| news right:', report.axis.newsRight, '| grid right:', report.axis.gridRight);
  for (const pane of report.panes) {
    console.log('  pane ' + pane.pane.padEnd(8) + ' x ' + String(pane.left).padStart(5) + ' → ' + String(pane.right).padStart(5) + '  width ' + pane.width);
  }
  console.log('  cards rendered      :', report.cards, '| hot cards:', report.hotCards);
}

if (SHOT) {
  const shot = path.join(OUT, 'news-preview.png');
  execFileSync(CHROME, common.concat(['--virtual-time-budget=2500', '--screenshot=' + shot, pathToFileURL(htmlPath).href]), {
    stdio: ['ignore', 'ignore', 'ignore'],
  });
  console.log('\nscreenshot:', shot, '(' + fs.statSync(shot).size + ' bytes)');
}
