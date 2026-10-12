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
 *   node tools/preview-stock.mjs [--out DIR] [--width 1407] [--height 856] [--no-shot]
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';

// Works from either place this file lives: the plugin checkout itself (`test/preview-stock.mjs`)
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
const WIDTH = Number(argOf('--width', '1280'));
const HEIGHT = Number(argOf('--height', '880'));
const SHOT = !args.includes('--no-shot');
/** Which stock view to render: board | table | markets | members (markets + a click). */
const VIEW = argOf('--view', 'markets');
const OPEN_BOARD = VIEW === 'members';

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

const DAY = 86400000;
const now = Date.now();

/** The boards the Host would answer with (mirrors STOCK_MARKETS). */
const boards = [
  { id: 'shmain', name: '沪市主板', region: 'A股', decimals: 2, scope: 'board' },
  { id: 'kc', name: '科创板', region: 'A股', decimals: 2, scope: 'board' },
  { id: 'szmain', name: '深市主板', region: 'A股', decimals: 2, scope: 'board' },
  { id: 'cyb2', name: '创业板', region: 'A股', decimals: 2, scope: 'board' },
  { id: 'bj', name: '北交所', region: 'A股', decimals: 2, scope: 'board' },
  { id: 'hk', name: '港股主板', region: '港股', decimals: 3, scope: 'rank' },
  { id: 'hkcyb', name: '港股创业板', region: '港股', decimals: 3, scope: 'rank' },
  { id: 'nasdaq', name: '纳斯达克', region: '美股', decimals: 2, scope: 'rank' },
  { id: 'nyse', name: '纽约证交所', region: '美股', decimals: 2, scope: 'rank' },
  { id: 'amex', name: '美国交易所', region: '美股', decimals: 2, scope: 'rank' },
];

/** The index quotes the board/table views show. */
const indexQuotes = [
  { id: 'sh', name: '上证指数', region: 'A股', price: 3813.79, change: 1.89, pct: 0.05, prev: 3811.9, decimals: 2, currency: 'CNY', exchange: 'Shanghai', session: 'closed', time: now - 3600000, timeText: '', spark: [3796.6, 3783.7, 3771.5, 3813.79], source: 'tencent', stale: false },
  { id: 'sz', name: '深证成指', region: 'A股', price: 12186.42, change: -23.11, pct: -0.19, prev: 12209.53, decimals: 2, currency: 'CNY', exchange: 'Shenzhen', session: 'closed', time: now - 3600000, timeText: '', spark: [12240, 12220, 12195, 12186.42], source: 'tencent', stale: false },
  { id: 'hsi', name: '恒生指数', region: '港股', price: 26418.6, change: 104.2, pct: 0.4, prev: 26314.4, decimals: 2, currency: 'HKD', exchange: 'HKSE', session: 'closed', time: now - 3600000, timeText: '', spark: [26310, 26380, 26400, 26418.6], source: 'tencent', stale: false },
  { id: 'dji', name: '道琼斯', region: '美股', price: 46802.1, change: -86.5, pct: -0.18, prev: 46888.6, decimals: 2, currency: 'USD', exchange: 'DJI', session: 'closed', time: now - 7200000, timeText: '', spark: [46920, 46900, 46830, 46802.1], source: 'yahoo', stale: false },
  { id: 'ixic', name: '纳斯达克', region: '美股', price: 22941.7, change: 92.4, pct: 0.4, prev: 22849.3, decimals: 2, currency: 'USD', exchange: 'Nasdaq', session: 'closed', time: now - 7200000, timeText: '', spark: [22860, 22890, 22920, 22941.7], source: 'yahoo', stale: false },
  { id: 'spx', name: '标普500', region: '美股', price: 6784.2, change: 12.9, pct: 0.19, prev: 6771.3, decimals: 2, currency: 'USD', exchange: 'SNP', session: 'closed', time: now - 7200000, timeText: '', spark: [6772, 6776, 6780, 6784.2], source: 'yahoo', stale: false },
];

/** A board's constituents — enough rows to make the table read like a real board. */
const NAMES = [
  ['600519', '贵州茅台', 1280.06, 1.35, 1455657278, 0.09, 20.41, 1600179454176, 1263.0, 1284.44, 1261.0],
  ['601318', '中国平安', 58.42, -0.82, 987654321, 0.31, 9.12, 1063000000000, 58.9, 59.2, 58.3],
  ['600036', '招商银行', 42.18, 0.57, 654321098, 0.22, 6.88, 1064000000000, 41.95, 42.4, 41.8],
  ['600030', '中信证券', 27.65, 2.14, 432109876, 1.02, 17.33, 409800000000, 27.1, 27.9, 27.0],
  ['601398', '工商银行', 7.32, -0.41, 321098765, 0.07, 6.01, 2607000000000, 7.35, 7.38, 7.3],
  ['600887', '伊利股份', 28.94, 1.19, 298765432, 0.48, 18.02, 184200000000, 28.6, 29.1, 28.5],
  ['601899', '紫金矿业', 19.87, 3.28, 876543210, 0.86, 14.55, 528600000000, 19.3, 20.0, 19.2],
  ['600276', '恒瑞医药', 46.21, -1.47, 543210987, 0.34, 41.2, 294700000000, 46.9, 47.0, 46.1],
  ['600900', '长江电力', 30.55, 0.23, 234567890, 0.09, 21.4, 747600000000, 30.5, 30.7, 30.4],
  ['601088', '中国神华', 41.06, -2.11, 345678901, 0.19, 12.9, 815900000000, 41.9, 42.0, 41.0],
  ['600309', '万华化学', 82.44, 0.88, 187654321, 0.21, 16.4, 258700000000, 81.8, 82.9, 81.7],
  ['600028', '中国石化', 5.87, -0.34, 456789012, 0.05, 11.2, 709800000000, 5.89, 5.91, 5.86],
  ['601012', '隆基绿能', 18.32, 4.51, 765432109, 1.44, -8.9, 138900000000, 17.6, 18.5, 17.5],
  ['600050', '中国联通', 4.61, 0.66, 1543210, 0.12, 15.7, 146500000000, 4.58, 4.63, 4.57],
  ['601166', '兴业银行', 19.28, -0.72, 222333444, 0.19, 5.4, 400400000000, 19.4, 19.5, 19.2],
  ['600585', '海螺水泥', 24.13, 1.05, 333444555, 0.23, 13.1, 127900000000, 23.9, 24.3, 23.8],
  ['601668', '中国建筑', 5.42, 0.19, 444555666, 0.06, 4.2, 227100000000, 5.41, 5.44, 5.4],
  ['600309', '万华化学', 82.44, 0.88, 187654321, 0.21, 16.4, 258700000000, 81.8, 82.9, 81.7],
  ['601857', '中国石油', 8.94, -1.22, 555666777, 0.04, 9.8, 1636000000000, 9.05, 9.07, 8.93],
  ['600104', '上汽集团', 15.76, 2.87, 666777888, 0.52, 12.6, 182300000000, 15.3, 15.9, 15.2],
];

const memberRows = NAMES.map((row, index) => ({
  code: row[0] + (index > 15 ? String(index) : ''), name: row[1], price: row[2], decimals: 2,
  pct: row[3], change: Number((row[2] * row[3] / 100).toFixed(2)),
  volume: 100000 + index * 12345, amount: row[4], amplitude: Number((Math.abs(row[3]) * 1.6 + 0.5).toFixed(2)),
  turnover: row[5], pe: row[6], pb: 1.2 + index * 0.3, high: row[9], low: row[10], open: row[8],
  prevClose: row[8], marketCap: row[7], floatCap: row[7], board: '1',
}));
// 故意留一行缺值，用来目视核对「缺值显示破折号而不是 0」
memberRows.push({
  code: '600999', name: '招商证券', price: 18.4, decimals: 2, pct: null, change: null, volume: null,
  amount: null, amplitude: null, turnover: null, pe: null, pb: null, high: null, low: null,
  open: null, prevClose: null, marketCap: null, floatCap: null, board: '1',
});

store.set('dsh-workbench.v3', JSON.stringify({
  v: 3,
  stockSeeded: true,
  notes: {},
  modules: [{
    id: 'mod-stock', kind: 'stock', name: '股票市场', desc: '', accent: '#fbbf24', preset: 'triple', created: 1,
    stock: {
      catalog: [
        { id: 'sh', name: '上证指数', region: 'A股', fallback: true },
        { id: 'sz', name: '深证成指', region: 'A股', fallback: true },
        { id: 'hsi', name: '恒生指数', region: '港股', fallback: true },
        { id: 'dji', name: '道琼斯', region: '美股', fallback: true },
        { id: 'ixic', name: '纳斯达克', region: '美股', fallback: true },
        { id: 'spx', name: '标普500', region: '美股', fallback: true },
      ],
      markets: ['sh', 'sz', 'hsi', 'dji', 'ixic', 'spx'],
      region: 'all',
      view: VIEW,
      sort: 'catalog',
      catalogAt: now,
      lastFetchAt: now - 40000,
      last: indexQuotes,
    },
  }],
}));

globalThis.fetch = (url) => {
  const text = String(url);
  if (text.includes('op=markets')) {
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, regions: ['A股', '港股', '美股'], markets: boards, limit: 200 }) });
  }
  if (text.includes('op=members')) {
    const board = boards[0];
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        ok: true, fetchedAt: now, market: board, total: 1846, shown: memberRows.length, rows: memberRows,
        stats: { tookMs: 288, pages: 1, cached: false, hint: '' },
      }),
    });
  }
  if (text.includes('op=catalog')) {
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, regions: ['A股', '港股', '美股'], markets: JSON.parse(store.get('dsh-workbench.v3')).modules[0].stock.catalog, defaults: ['sh', 'sz', 'hsi'], limits: { min: 4, max: 34 } }) });
  }
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve({
      ok: true, fetchedAt: now, tookMs: 288, quotes: indexQuotes,
      stats: { requested: indexQuotes.length, resolved: indexQuotes.length, failed: 0, cached: false, fallback: 3, timedOut: false, tookMs: 288, errors: [], hint: '' },
    }),
  });
};

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

// Drive the requested stock view. Clicking the real control (rather than editing the tree) keeps
// the fixture honest: what is screenshotted is what that button produces.
if (VIEW !== 'board') {
  const marketsView = VIEW === 'members' ? 'markets' : VIEW;
  const find = (predicate) => flatten(tree).find(predicate);
  const viewBtn = find((node) => node.props['data-stock-view'] === marketsView);
  if (viewBtn && typeof viewBtn.props.onClick === 'function') {
    viewBtn.props.onClick({ stopPropagation() {}, preventDefault() {} });
    tree = render(mainEntry.component, {});
    await new Promise((resolve) => setTimeout(resolve, 60));
    tree = render(mainEntry.component, {});
  }
  if (VIEW === 'members') {
    const card = flatten(tree).find((node) => node.props['data-stock-market'] !== undefined);
    if (!card) throw new Error('no board card to open');
    card.props.onClick({ stopPropagation() {}, preventDefault() {} });
    tree = render(mainEntry.component, {});
    await new Promise((resolve) => setTimeout(resolve, 60));
    tree = render(mainEntry.component, {});
  }
}

//#endregion

//#region element tree -> html

const HTML_ATTRS = ['title', 'href', 'src', 'alt', 'role', 'value', 'placeholder', 'type', 'min', 'max', 'step', 'disabled', 'aria-label', 'loading', 'target', 'rel'];
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
const htmlPath = path.join(OUT, 'stock-preview.html');
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
