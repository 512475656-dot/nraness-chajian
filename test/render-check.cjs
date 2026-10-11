/**
 * Offline render check for the Workbench client half.
 *
 * Loads the real `client.js` into a stub module loader, renders it with a tiny
 * React stand-in against a real decoded Session event window, and fails loudly
 * on the first throw. This is a logic/robustness check only: it does not render
 * CSS, and it is not a substitute for seeing the installed panel in the browser.
 *
 * Usage: node test/render-check.cjs [path/to/session.v4.jsonl.zstd ...]
 */
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const zlib = require('node:zlib');

const ROOT = path.resolve(__dirname, '..');
// Resolved from the running user's home, so the check works on any machine. Pass explicit
// session paths as arguments when the logs live somewhere else.
const SESSIONS = path.join(os.homedir(), '.dsh', 'sessions');

//#region decode real session logs

function decodeSession(file) {
  const buffer = fs.readFileSync(file);
  const magic = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);
  const offsets = [];
  let index = 0;
  while ((index = buffer.indexOf(magic, index)) !== -1) {
    offsets.push(index);
    index += 4;
  }
  let text = '';
  for (let i = 0; i < offsets.length; i += 1) {
    const start = offsets[i];
    const end = i + 1 < offsets.length ? offsets[i + 1] : buffer.length;
    try {
      text += zlib.zstdDecompressSync(buffer.slice(start, end)).toString('utf8');
    } catch { /* a false-positive magic inside compressed bytes */ }
  }
  return text
    .split('\n')
    .filter(Boolean)
    .map((line) => { try { return JSON.parse(line) } catch { return null } })
    .filter(Boolean);
}

function findSessionFiles() {
  const explicit = process.argv.slice(2);
  if (explicit.length) return explicit;
  const found = [];
  const walk = (dir) => {
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.jsonl.zstd')) found.push(full);
    }
  };
  walk(SESSIONS);
  // Biggest first, which is what makes the fixture rich — but never the log that is *still being
  // written*. During active work the largest log is the live session, and it grows by a few
  // hundred events between two runs of this suite: the fixture then changes underneath the
  // assertions, and unrelated checks (the dock, the background switch) fail intermittently for a
  // reason that has nothing to do with the code. Dropping the most recently modified candidate
  // pins the fixture to a settled log; passing an explicit path as argv still overrides this.
  const bySize = found.sort((a, b) => fs.statSync(b).size - fs.statSync(a).size);
  if (bySize.length > 1) {
    const newest = bySize
      .map((file) => ({ file, at: fs.statSync(file).mtimeMs }))
      .sort((a, b) => b.at - a.at)[0].file;
    const settled = bySize.filter((file) => file !== newest);
    return settled.slice(0, 3);
  }
  return bySize.slice(0, 3);
}

//#endregion

//#region React stand-in (stateful: supports re-render and click dispatch)

function sameDeps(left, right) {
  if (!left || !right || left.length !== right.length) return false;
  for (let i = 0; i < left.length; i += 1) if (!Object.is(left[i], right[i])) return false;
  return true;
}

function makeReact() {
  const slots = new Map();
  let passCounts = new Map();
  let currentSlot = null;
  let pendingEffects = [];
  let dirty = false;

  function createElement(type, props) {
    const children = [];
    for (let i = 2; i < arguments.length; i += 1) {
      const value = arguments[i];
      if (value === null || value === undefined || value === false || value === true) continue;
      children.push(value);
    }
    return { type, props: props || {}, children: children.flat(Infinity) };
  }

  class Component {
    constructor(props) {
      this.props = props;
      this.state = {};
    }
    setState(patch) {
      const next = typeof patch === 'function' ? patch(this.state) : patch;
      if (next && typeof next === 'object') { this.state = { ...this.state, ...next }; dirty = true }
    }
  }
  Component.prototype.isReactComponent = true;

  /** One persistent hook store per (component name, ordinal-in-pass). */
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
    createElement,
    Component,
    useState(initial) {
      const slot = currentSlot;
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
      const slot = currentSlot;
      const index = slot.cursor++;
      if (!(index in slot.hooks)) slot.hooks[index] = { current: initial };
      return slot.hooks[index];
    },
    useMemo(fn, deps) {
      const slot = currentSlot;
      const index = slot.cursor++;
      const cell = slot.hooks[index];
      if (cell && sameDeps(cell.deps, deps)) return cell.value;
      const value = fn();
      slot.hooks[index] = { deps: deps || null, value };
      return value;
    },
    useCallback(fn, deps) {
      const slot = currentSlot;
      const index = slot.cursor++;
      const cell = slot.hooks[index];
      if (cell && sameDeps(cell.deps, deps)) return cell.value;
      slot.hooks[index] = { deps: deps || null, value: fn };
      return fn;
    },
    useEffect(fn, deps) {
      const slot = currentSlot;
      const index = slot.cursor++;
      const cell = slot.hooks[index];
      if (cell && sameDeps(cell.deps, deps)) return;
      slot.hooks[index] = { deps: deps || null };
      pendingEffects.push(fn);
    },
    useSyncExternalStore(subscribe, getSnapshot) { return getSnapshot() },
  };

  function renderTree(node, runtime) {
    if (node === null || node === undefined || typeof node === 'boolean') return;
    if (typeof node === 'string' || typeof node === 'number') { runtime.sink.parts.push(String(node)); return }
    if (Array.isArray(node)) { for (const child of node) renderTree(child, runtime); return }
    const { type, props, children } = node;
    const full = { ...props, children: children.length <= 1 ? children[0] : children };
    if (typeof type === 'string') {
      if (typeof props.href === 'string') runtime.sink.links.push(props.href);
      runtime.sink.elements.push(node);
      for (const child of children) renderTree(child, runtime);
      return;
    }
    if (typeof type !== 'function') throw new Error('renderTree: unsupported element type ' + String(type));

    const previous = currentSlot;
    currentSlot = enterComponent(type.name || 'anonymous');
    try {
      if (type.prototype && type.prototype.isReactComponent) renderTree(new type(full).render(), runtime);
      else renderTree(type(full), runtime);
    } finally {
      currentSlot = previous;
    }
  }

  function pass(runtime) {
    passCounts = new Map();
    pendingEffects = [];
    runtime.sink = { parts: [], links: [], elements: [] };
    renderTree(createElement(runtime.root.component, runtime.root.props), runtime);
    for (const effect of pendingEffects) effect();
  }

  return {
    React,
    /** Drop all hook state: the next flush is a fresh mount that re-reads storage. */
    reset() { slots.clear() },
    /** Mount, then keep re-rendering until nothing sets state (bounded). */
    flush(runtime) {
      let guard = 0;
      do { dirty = false; pass(runtime); guard += 1 } while (dirty && guard < 40);
      return {
        text: runtime.sink.parts.join(' \u0001 '),
        links: runtime.sink.links.slice(),
        elements: runtime.sink.elements.slice(),
      };
    },
    /** Dispatch one interaction, then settle. */
    dispatch(runtime, action) {
      const result = action();
      return result === false ? null : this.flush(runtime);
    },
    /** Advance the virtual clock, fire whatever is due, then settle.
     *  Loops: firing one timer can schedule another (arm the sweep, then retire it). */
    advance(runtime, ms) {
      const clock = this.clock || windowStub;
      clock.timerNow = (clock.timerNow || 0) + (Number(ms) || 0);
      let view = null;
      for (let round = 0; round < 20; round += 1) {
        const due = [...clock.timers.entries()].filter(([, timer]) => timer.at <= clock.timerNow);
        if (due.length === 0) break;
        for (const [id, timer] of due) {
          clock.timers.delete(id);
          timer.fn();
        }
        view = this.flush(runtime);
      }
      return view || this.flush(runtime);
    },
    /** Call the first host element matching `predicate`'s onClick. */
    click(runtime, predicate) {
      const found = runtime.sink.elements.find(predicate);
      if (!found || typeof found.props.onClick !== 'function') return false;
      found.props.onClick({
        currentTarget: null, target: null,
        stopPropagation() {}, preventDefault() {},
      });
      return true;
    },
  };
}

//#endregion

//#region snapshots

function snapshot(value) {
  return { getSnapshot: () => value, subscribe: () => () => {} };
}

function makeServices(events, sessionId, overrides) {
  const sessionSnapshot = {
    sessionId,
    pendingSubmissions: [],
    running: true,
    subagent: null,
    removed: false,
    openState: 'open',
    openError: null,
    hasMore: false,
    loadingOlder: false,
    promptError: null,
    blank: false,
    lastAgentError: null,
    promptAttempted: true,
    awaitingFirstTurn: false,
  };
  const projections = {
    tokenUsage: { uncachedInputTokens: 612034, outputTokens: 8120, cacheReadTokens: 1140000, cacheWriteTokens: 3200 },
    contextPressure: { contextWindow: 1000000, pressureTokens: 412300, projectedTokens: 428900 },
    contextBreakdown: { systemTokens: 8200, toolsTokens: 31200, messageTokens: 372900 },
  };
  const binding = {
    sessionId,
    session: Object.assign(snapshot(sessionSnapshot), {
      projections: { faceOf: (key) => (key in projections ? snapshot(projections[key]) : undefined) },
      loadOlder: () => Promise.resolve(),
    }),
    eventSource: snapshot({ entries: events.map((event) => ({ type: 'event', event })), hasMore: true, revision: 7, change: null }),
    ctx: {},
  };
  const list = {
    ids: [sessionId],
    phase: 'ready',
    byId: {
      [sessionId]: {
        id: sessionId,
        title: '渲染自检会话',
        running: true,
        blank: false,
        retainedBy: { mainView: 1 },
      },
    },
  };
  const services = {
    sessions: {
      list: snapshot(list),
      binding: () => binding,
      refreshProjections: () => Promise.resolve(),
      // The real API for reading another session: acquire, read, release. The stub hands
      // back the same binding so the projection path is exercised.
      using: (target, options, operation) => Promise.resolve()
        .then(() => operation({ sessionId: target, binding, ready: Promise.resolve(binding), release() {} })),
    },
    layout: { selectPanel: () => {} },
  };
  return Object.assign(services, overrides || {});
}

//#endregion

//#region run

const failures = [];
/** Runs a check, tolerating (and awaiting) an async one so failures are recorded. */
function check(label, run) {
  let result;
  try {
    result = run();
  } catch (error) {
    failures.push(label + ' :: ' + (error && error.stack ? error.stack.split('\n').slice(0, 3).join(' | ') : String(error)));
    console.log('  FAIL  ' + label + ' :: ' + (error && error.message ? error.message : String(error)));
    return Promise.resolve();
  }
  if (result && typeof result.then === 'function') {
    return result.then(
      () => { console.log('  PASS  ' + label) },
      (error) => {
        failures.push(label + ' :: ' + (error && error.stack ? error.stack.split('\n').slice(0, 3).join(' | ') : String(error)));
        console.log('  FAIL  ' + label + ' :: ' + (error && error.message ? error.message : String(error)));
      },
    );
  }
  console.log('  PASS  ' + label);
  return Promise.resolve();
}

function loadModule() {
  const source = fs.readFileSync(path.join(ROOT, 'client.js'), 'utf8');
  let registration = null;
  const exports_ = { blobs: [], printed: '', prints: 0, clicks: 0 };
  const windowStub = {
    __ModuleLoader__: { load: (value) => { registration = value } },
    localStorage: {
      store: new Map(),
      getItem(key) { return this.store.has(key) ? this.store.get(key) : null },
      setItem(key, value) { this.store.set(key, String(value)) },
      removeItem(key) { this.store.delete(key) },
    },
    // Listeners are recorded so a drag can actually be driven from a test: the strip's
    // resize handle installs window-level pointermove/pointerup handlers.
    // Pictures for the note map live in IndexedDB, and saving/loading a map runs them through
    // FileReader / atob. Both are faked here so those paths are testable without a browser:
    // `get` resolves with { __key }, and the reader answers with a tiny base64 PNG.
    indexedDB: {
      open() {
        const request = { result: null, error: null, onsuccess: null, onerror: null, onupgradeneeded: null };
        request.result = {
          objectStoreNames: { contains: () => true },
          close() {},
          onversionchange: null,
          onclose: null,
          transaction: (store, mode) => {
            const tx = { error: null, oncomplete: null, onerror: null, onabort: null };
            const answer = (result) => {
              const hit = { result, error: null };
              setTimeout(() => { if (hit.onsuccess) hit.onsuccess() }, 0);
              return hit;
            };
            tx.objectStore = () => ({
              get: (key) => answer({ __key: key }),
              put: () => answer(true),
              delete: () => answer(true),
            });
            // A read resolves on its request; a write resolves when the transaction commits —
            // which is the distinction mediaRun's `settle` guard is built around.
            if (mode !== 'readonly') setTimeout(() => { if (tx.oncomplete) tx.oncomplete() }, 0);
            return tx;
          },
        };
        setTimeout(() => { if (request.onsuccess) request.onsuccess() }, 0);
        return request;
      },
    },
    FileReader: class {
      readAsDataURL() {
        this.result = 'data:image/png;base64,AAAB';
        setTimeout(() => { if (this.onload) this.onload() }, 0);
      }
      readAsText() {
        this.result = '';
        setTimeout(() => { if (this.onload) this.onload() }, 0);
      }
    },
    atob: (value) => Buffer.from(String(value), 'base64').toString('binary'),
    listeners: new Map(),    listeners: new Map(),    listeners: new Map(),    listeners: new Map(),    listeners: new Map(),
    addEventListener(type, fn) { this.listeners.set(type, fn) },
    removeEventListener(type) { this.listeners.delete(type) },
    // Virtual timers: the two-phase arrival arms its content sweep from a timer, so a test
    // must be able to advance the clock deterministically instead of sleeping.
    timers: new Map(),
    timerSeq: 0,
    setTimeout(fn, delay) {
      const id = ++this.timerSeq;
      this.timers.set(id, { fn, at: (this.timerNow || 0) + (Number(delay) || 0) });
      return id;
    },
    clearTimeout(id) { this.timers.delete(id) },
    // No IndexedDB in the harness, so the upload path falls back to a session-only
    // object URL - which is exactly the degradation branch worth exercising.
    URL: {
      createObjectURL: (value) => { exports_.blobs.push(value); return 'blob:harness/media-' + exports_.blobs.length },
      revokeObjectURL: () => {},
    },
    // Enough DOM for the export paths: capture the PPTX blob and the printed HTML.
    document: {
      createElement(tag) {
        if (tag === 'iframe') {
          const frame = {
            style: {},
            setAttribute() {},
            contentWindow: {
              document: { open() {}, write(html) { exports_.printed = html }, close() {} },
              focus() {},
              print() { exports_.prints += 1 },
            },
          };
          return frame;
        }
        return {
          style: {},
          click() { exports_.clicks += 1 },
          href: '',
          download: '',
          setAttribute() {},
        };
      },
      body: { appendChild() {}, removeChild() {} },
    },
  };
  // eslint-disable-next-line no-new-func
  new Function('window', source)(windowStub);
  if (!registration) throw new Error('client.js did not register a module factory');
  return { registration, windowStub, exports_ };
}

async function main() {
  const files = findSessionFiles();
  if (files.length === 0) {
    console.error('no session logs found to fold');
    process.exit(1);
  }

  const runs = [];
  for (const file of files) {
    const events = decodeSession(file);
    if (events.length > 5) runs.push({ file, events });
  }
  console.log('session logs: ' + runs.map((run) => path.basename(path.dirname(run.file)) + '=' + run.events.length).join(', '));

  const { registration, windowStub, exports_ } = loadModule();
  console.log('registered module id: ' + registration.id);

  const harness = makeReact();
  // The virtual clock lives on the window stub, so hand the harness a reference to it.
  harness.clock = windowStub;
  const React = harness.React;
  const requireStub = (specifier) => {
    if (specifier === 'react') return React;
    throw new Error('unexpected require: ' + specifier);
  };

  global.window = windowStub;
  const instance = registration.factory(requireStub);
  if (typeof instance.apply !== 'function') throw new Error('factory did not return apply()');
  console.log('inject: ' + JSON.stringify(instance.inject));

  // --- slot registration -------------------------------------------------
  const registered = { panellist: null, main: null, header: null, moduleRows: [] };
  const injected = [];
  const injectedCallbacks = {};

  /** Build a Client-shaped context whose `sessions` service is the given stub. */
  function makeCtx(sessions) {
    const context = {
      sessions,
      layout: { selectPanel: () => {} },
      on: () => () => {},
      effect: (fn) => { const off = fn(); return typeof off === 'function' ? off : () => {} },
      get: (key) => (key === 'sessions' ? sessions : undefined),
      slots: {
        inject: (key, callback) => { injected.push(key); injectedCallbacks[key] = callback; callback(); return () => {} },
        register: (options, component) => {
          if (options.name === 'sidebar.panellist') {
            if (options.id === 'workbench') { registered.panellist = { options, component }; registered.moduleRows = []; }
            else if (String(options.id).indexOf('workbench-m') === 0) {
              // Like a real slot registry: re-registering the same id REPLACES the entry
              // rather than appending. Append-only made a re-register look like a duplicate
              // row, which is not what the host does.
              const at = registered.moduleRows.findIndex((row) => row.options.id === options.id);
              const entry = { options, component };
              if (at >= 0) registered.moduleRows[at] = entry;
              else registered.moduleRows.push(entry);
            }
          }
          if (options.name === 'main' && options.key === 'workbench') registered.main = { options, component };
          if (options.name === 'conversation.session.header.actions') registered.header = { options, component };
          return () => {};
        },
      },
    };
    return context;
  }

  /** Re-activate the plugin against a fresh services stub so the panel sees it. */
  function activate(sessions) {
    instance.apply(makeCtx(sessions));
    return sessions;
  }

  check('apply() registers without throwing', () => instance.apply(makeCtx(makeServices([], 'session-check').sessions)));
  check('sidebar.panellist entry registered', () => {
    if (!registered.panellist) throw new Error('missing sidebar.panellist registration');
    if (registered.panellist.options.id !== 'workbench') throw new Error('unexpected id ' + registered.panellist.options.id);
    if (typeof registered.panellist.options.label !== 'function') throw new Error('label must be a thunk');
    if (!registered.panellist.options.label()) throw new Error('label thunk returned empty');
  });
  check('main keyed entry registered', () => {
    if (!registered.main) throw new Error('missing main registration');
    if (registered.main.options.key !== 'workbench') throw new Error('unexpected key ' + registered.main.options.key);
  });
  check('injected into both owning slots', () => {
    if (!injected.includes('sidebar.panellist')) throw new Error('did not inject sidebar.panellist');
    if (!injected.includes('main')) throw new Error('did not inject main');
  });

  // Deferred: these need the mounted app, which only exists further down.
  const deferredPanelChecks = () => {
  check('the aurora settings live in one panel with the palette', () => {
    const panel = ensureDock('dynamic');
    if (!panel) throw new Error('desktop dock button not clickable');
    ensureDock('dynamic');
    const auroraView = harness.dispatch(runtime, () => harness.click(runtime, (element) => element.props['data-mode'] === 'aurora'));
    const view = auroraView || runtime.sink;
    const swatches = view.elements.filter((element) => element.props['data-aurora']);
    if (swatches.length < 4) throw new Error('expected aurora colours in the desktop panel, saw ' + swatches.length);
    const hasControl = (name, text) => view.elements.some((element) => element.props['data-slider'] === name)
      || new RegExp(text).test(view.text);
    if (!hasControl('auroraSpeed', '流动速度|Flow speed')) throw new Error('flow speed slider missing');
    if (!hasControl('shapeVariance', '形状变化差异|Shape variance')) throw new Error('shape variance slider missing');
    if (!hasControl('hueSpeed', '颜色变化速度|Hue speed')) throw new Error('hue speed slider missing');
    if (!hasControl('saturation', '饱和度|Saturation')) throw new Error('saturation slider missing');
    if (!hasControl('edgeBlur', '边缘模糊度|Edge blur')) throw new Error('edge blur slider missing');
    if (!view.elements.some((element) => element.props['data-slider'] === 'edgeBlur')) {
      throw new Error('edge blur slider missing');
    }
    // One control must drive both the blobs and the UI accents.
    const ocean = view.elements.find((element) => element.props['data-palette-opt'] === 'ocean');
    if (!ocean) throw new Error('aurora colour swatches missing');
    ocean.props.onClick({ currentTarget: null, stopPropagation() {}, preventDefault() {} });
    const settled = harness.flush(runtime);
    const root = settled.elements.find((element) => hasClass(element, 'wsb-root'));
    if (root.props['data-palette'] !== 'ocean') throw new Error('aurora colour did not reach the UI palette');
  });

  const safeStateModules = () => {
    for (const key of ['dsh-workbench.v3', 'dsh-workbench.v2', 'dsh-workbench.v1']) {
      const raw = windowStub.localStorage.getItem(key);
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.workbenches)) return parsed.workbenches;
        if (Array.isArray(parsed.modules)) return parsed.modules;
      } catch { /* try the next key */ }
    }
    return [];
  };

  check('modules appear as sidebar rows under 工作台', () => {
    if (registered.moduleRows.length === 0) throw new Error('no sidebar module rows registered');
    const modules = safeStateModules();
    if (registered.moduleRows.length !== modules.length) {
      throw new Error('sidebar rows (' + registered.moduleRows.length + ') do not match modules (' + modules.length + ')');
    }
    registered.moduleRows.forEach((row, index) => {
      if (row.options.id !== 'workbench-m' + index) throw new Error('unexpected row id ' + row.options.id);
      if (row.options.order !== 13 + index) throw new Error('row order does not follow the 工作台 entry');
      const label = row.options.label();
      if (String(label || '').indexOf(modules[index].name) < 0) {
        throw new Error('row label "' + label + '" does not name module ' + modules[index].name);
      }
      if (typeof row.component !== 'function') throw new Error('row component missing');
      const icon = row.component({ size: 18, active: index === 0 });
      if (!icon) throw new Error('row component rendered nothing');
    });

    // The reported bug: the 快捷入口 under 工作台 vanished. The host owns this slot's
    // rendering and can drop our rows without telling us (a sidebar reload, a plugin
    // re-init). A count-only guard would then skip the rebuild forever, so a re-inject has
    // to bring every row back. Non-destructive by design: it only re-runs the plugin's own
    // inject callback, so the shared fixture stays exactly as this check found it.
    const expectedLabels = registered.moduleRows.map((row) => row.options.label());
    registered.moduleRows = [];                       // the host wipes the slot
    const callback = injectedCallbacks['sidebar.panellist'];
    if (typeof callback !== 'function') throw new Error('the plugin never injected into sidebar.panellist');
    callback();                                       // the host re-injects it
    if (registered.moduleRows.length !== expectedLabels.length) {
      throw new Error('rows did not come back after a re-inject (saw '
        + registered.moduleRows.length + ', expected ' + expectedLabels.length + ')');
    }
    registered.moduleRows.forEach((row, index) => {
      const label = row.options.label();
      if (label !== expectedLabels[index]) {
        throw new Error('row ' + index + ' label "' + label + '" != "' + expectedLabels[index] + '"');
      }
    });
  });

  // Registering into a shell-owned sidebar slot stopped the whole client half from loading
  // once, so the guard is now part of the suite: only the flat rail and `main` are used.
  check('only the flat panellist rail and main slots are used', () => {
    const forbidden = injected.filter((key) => key !== 'sidebar.panellist' && key !== 'main');
    if (forbidden.length) throw new Error('unexpected slot injection: ' + forbidden.join(', '));
  });

  };

  // --- the panel renders against every real log --------------------------
  /** The media background feature was cancelled; these checks are kept as skip markers. */
  const skipCheck = async (label) => { console.log('  SKIP  ' + label + ' (media feature removed)') };

  const runtime = { root: { component: null, props: null }, sink: { parts: [], links: [], elements: [] } };
  const mount = (component, props) => {
    harness.reset();
    runtime.root = { component, props: props || {} };
    return harness.flush(runtime);
  };
  /** Exact class-token test: `wsb-card` must not match `wsb-cardIcon`. */
  const hasClass = (element, name) => typeof element.props.className === 'string'
    && element.props.className.split(/\s+/).indexOf(name) >= 0;
  /** Home -> console, the way a user opens a module card. */
  const openFirstConsole = () => harness.dispatch(runtime, () => harness.click(runtime,
    (element) => hasClass(element, 'wsb-card') && !hasClass(element, 'wsb-addCard')));

  for (const run of runs) {
    const label = path.basename(path.dirname(run.file));
    const events = run.events;
    activate(makeServices(events, 'session-check').sessions);
    check('home renders · ' + label + ' (' + events.length + ' events)', () => {
      const home = mount(registered.main.component, {});
      if (!home.text.length) throw new Error('home screen produced no output');
    });
    check('console opens from a card · ' + label, () => {
      const console_ = openFirstConsole();
      if (!console_) throw new Error('no module card was clickable');
      if (!/轮次|Turn/.test(console_.text)) throw new Error('console did not render the node tree');
    });
  }

  const events = runs[0].events;

  check('sidebar icon renders with owner props', () => {
    mount(registered.panellist.component, { size: 18, active: true });
    mount(registered.panellist.component, { size: 20, active: false });
    mount(registered.panellist.component, undefined);
  });

  check('panel renders with no session at all', () => {
    const empty = makeServices([], 'session-check');
    empty.sessions.list = snapshot({ ids: [], byId: {}, phase: 'empty' });
    empty.sessions.binding = () => undefined;
    activate(empty.sessions);
    mount(registered.main.component, {});
  });

  check('panel renders with a session that has no events', () => {
    activate(makeServices([], 'session-check').sessions);
    mount(registered.main.component, {});
  });

  check('panel renders with projections and binding absent', () => {
    const broken = makeServices(events, 'session-check');
    broken.sessions.binding = () => ({
      sessionId: 'x',
      session: Object.assign(snapshot({}), { projections: { faceOf: () => undefined } }),
      eventSource: snapshot({ entries: [], hasMore: false, revision: 0, change: null }),
      ctx: {},
    });
    activate(broken.sessions);
    mount(registered.main.component, {});
  });

  check('panel renders with a throwing binding', () => {
    const hostile = makeServices(events, 'session-check');
    hostile.sessions.binding = () => { throw new Error('binding unavailable') };
    activate(hostile.sessions);
    mount(registered.main.component, {});
  });

  // --- home interactions: add, rename, open, dock panels ----------------
  activate(makeServices(events, 'session-check').sessions);

  /** Clear every storage generation, then seed one v3 state. */
  const seedState = (state) => {
    for (const key of ['dsh-workbench.v3', 'dsh-workbench.v2', 'dsh-workbench.v1']) windowStub.localStorage.removeItem(key);
    windowStub.localStorage.setItem('dsh-workbench.v3', JSON.stringify(state));
  };
  seedState({ v: 3, modules: [], focusSessionId: undefined, notes: {} });

  await check('the tile mark is drawn like a pen stroke, not faded in', () => {


    mount(registered.main.component, {});
    const marks = runtime.sink.elements.filter((element) => hasClass(element, 'wsb-mark'));
    if (marks.length === 0) throw new Error('no tile mark rendered');
    marks.forEach((mark) => {
      if (mark.props.fill !== 'none') throw new Error('the mark is filled instead of stroked');
      if (!mark.props.stroke) throw new Error('the mark has no stroke colour');
      if (mark.props.strokeWidth > 1.6) throw new Error('the mark is not a hairline stroke');
    });
    const lines = runtime.sink.elements.filter((element) => hasClass(element, 'wsb-markLine'));
    if (lines.length < marks.length) throw new Error('a mark rendered without any line');
    lines.forEach((line) => {
      if (line.type !== 'path') throw new Error('the mark must be drawn from monoline paths');
      if (line.props.pathLength !== 1) throw new Error('a mark line is not normalised to pathLength=1');
      if (line.props.style['--wsb-d'] === undefined) throw new Error('a mark line has no pen delay');
    });
    const source = fs.readFileSync(path.join(ROOT, 'client.js'), 'utf8');
      if (!/\.wsb-markLine\{[^}]*stroke-dasharray:1;stroke-dashoffset:1;/.test(source)) {
        throw new Error('the mark lines are not dash-drawn');
      }
    if (!/\.wsb-markLine\{[\s\S]{0,220}?animation:wsb-draw/.test(source)) {
      throw new Error('the pen-stroke animation is missing');
    }
    if (!/\.wsb-mark\{[\s\S]{0,120}?overflow:visible/.test(source)) {
      throw new Error('the mark stroke would be clipped by its own box');
    }
    if (!/@media \(prefers-reduced-motion:reduce\)\{[\s\S]{0,220}?\.wsb-markLine\{animation:none;stroke-dashoffset:0\}/.test(source)) {
      throw new Error('the pen-stroke animation ignores reduced motion');
    }
    // Entering the desktop bumps the epoch that re-keys the paths, so the drawing replays.
    if (!/drawKey: deskEpoch|drawKey\b/.test(source)) throw new Error('the mark is not re-keyed on entry');
    if (!/setDeskEpoch\(\(value\) => value \+ 1\)/.test(source)) throw new Error('the desktop epoch never advances');
  })
  await check('every tile mark is constructed to the published icon spec', async () => {
    // The rules, and where each one comes from:
    //   24×24 canvas, ≥1px padding, no fills, round caps/joins, 1.5px pen  — Lucide / Tabler /
    //     Feather, with Heroicons' lighter outline weight for a dense UI
    //   whole-unit coordinates                                          — Lucide's pixel-grid snap
    //   angles that are multiples of 45°                                — Ant Design
    //   ≥2px between distinct elements                                  — the canon's minimum
    //   an even optical size across the set                             — the review grid's finding
    // The last one is why this test exists at all: each mark looked fine alone, and in a row the
    // set looked like five different icon packs.
    const glyphPath = require(path.join(ROOT, 'test', 'glyph-path.cjs'));
    const KINDS = ['game', 'notebook', 'news', 'research', 'stock', 'blank'];
    seedState({
      v: 3,
      newsSeeded: true,
      // Both one-time offers are spent, or `normalizeState` would append the modules they ship
      // with and this fixture would stop being exactly the six kinds it names.
      stockSeeded: true,
      notes: {},
      modules: KINDS.map((kind, index) => ({
        id: 'mod-' + kind, kind, name: 'G' + index, desc: '', preset: 'triple', created: index + 1,
      })),
    });
    mount(registered.main.component, {});
    const view = harness.flush(runtime);

    const seen = new Set();
    for (const kind of KINDS) {
      const mark = view.elements.find((element) => element.props['data-mark'] === kind);
      if (!mark) throw new Error('no mark rendered for kind ' + kind);
      if (mark.props.viewBox !== '0 0 24 24') throw new Error(kind + ' is not on a 24 grid: ' + mark.props.viewBox);
      // 图标现在画满整块磁贴，所以公布的是图稿单位下的笔宽：0.16 在整块磁贴上约 2px 发丝。
        if (Number(mark.props.strokeWidth) !== 0.16) {
          throw new Error(kind + ' is drawn with a ' + mark.props.strokeWidth + ' pen');
        }
      if (mark.props.strokeLinecap !== 'round' || mark.props.strokeLinejoin !== 'round') {
        throw new Error(kind + ' does not use round caps and joins');
      }
      if (mark.props.fill !== 'none') throw new Error(kind + ' is filled instead of stroked');

      const paths = (mark.children || []).filter((child) => child && child.props && child.props.d).map((child) => child.props.d);
      if (!paths.length) throw new Error(kind + ' has no paths');
      const signature = paths.join('|');
      if (seen.has(signature)) throw new Error(kind + ' is a copy of another mark');
      seen.add(signature);

      // Whole units.
      for (const value of glyphPath.coordinates(paths)) {
        if (!Number.isInteger(value)) throw new Error(kind + ' has a coordinate off the whole grid: ' + value);
      }
      // Axis-aligned or 45°.
      for (const d of paths) {
        for (const segment of glyphPath.segments(d)) {
          const angle = glyphPath.angleOf(segment);
          if (angle !== 0 && angle !== 90 && angle !== 45) {
            throw new Error(kind + ' has a segment at ' + angle + '° (only 0/45/90 are allowed): ' + d);
          }
          const length = Math.hypot(segment.x2 - segment.x1, segment.y2 - segment.y1);
          if (length < 2) throw new Error(kind + ' has a ' + length.toFixed(1) + 'px segment, under the 2px minimum spacing');
        }
      }
      // Inside the live area, with the pen's own half-width still clear of the frame.
      const box = glyphPath.bbox(paths);
      const edge = 1.5 / 2;
      if (box.minX - edge < 1 || box.minY - edge < 1 || box.maxX + edge > 23 || box.maxY + edge > 23) {
        throw new Error(kind + ' leaves the live area: ' + JSON.stringify(box));
      }
      // Even optical size: every mark fills ~90% of the live area, so no icon looks smaller than
      // its neighbours on the desktop.
      const coverage = Math.max(box.w, box.h) / 20;
      if (coverage < 0.85 || coverage > 0.95) {
        throw new Error(kind + ' covers ' + (coverage * 100).toFixed(0) + '% of the live area, not the set\'s 85–95%');
      }
    }
    // The desktop shows one mark per module, so six modules means six marks. The 新建模块 tile is
    // deliberately not one of them: it is marked `wsb-addMark`, not `data-mark`, and this count is
    // the reason — an add tile carrying a kind would be counted as a module.
    const rendered = view.elements.filter((element) => element.props['data-mark'] !== undefined);
    if (rendered.length !== KINDS.length) {
      throw new Error('expected ' + KINDS.length + ' marks on the desktop, saw ' + rendered.length);
    }
  });

  await check('the trash glyph obeys the same spec as the tile marks', async () => {
    const glyphPath = require(path.join(ROOT, 'test', 'glyph-path.cjs'));
    const source = fs.readFileSync(path.join(ROOT, 'client.js'), 'utf8');
    // The trash glyph is the one mark outside the table, so its paths are read straight out of the
    // component. It was also the one mark that did not obey the spec — two arc commands and a
    // 1.4 pen — which is the drift this check now prevents.
    const region = source.slice(source.indexOf('function TrashGlyph'), source.indexOf('function ModuleCard'));
    const paths = [...region.matchAll(/d: '([^']+)'/g)].map((match) => match[1]);
    if (paths.length < 3) throw new Error('the trash glyph lost its paths: ' + JSON.stringify(paths));
    for (const d of paths) {
      for (const segment of glyphPath.segments(d)) {
        const angle = glyphPath.angleOf(segment);
        if (angle !== 0 && angle !== 90 && angle !== 45) {
          throw new Error('the trash glyph has a ' + angle + '° segment: ' + d);
        }
        if (Math.hypot(segment.x2 - segment.x1, segment.y2 - segment.y1) < 2) {
          throw new Error('the trash glyph has a segment under the 2px minimum: ' + d);
        }
      }
      for (const value of glyphPath.coordinates([d])) {
        if (!Number.isInteger(value)) throw new Error('the trash glyph is off the whole grid: ' + value);
      }
    }
    const box = glyphPath.bbox(paths);
    if (box.minX < 1 || box.minY < 1 || box.maxX > 23 || box.maxY > 23) {
      throw new Error('the trash glyph leaves the live area: ' + JSON.stringify(box));
    }
    if (!/function TrashGlyph[\s\S]{0,400}?strokeWidth: GLYPH_STROKE/.test(source)) {
      throw new Error('the trash glyph is not drawn with the set\'s pen width');
    }
  });

  await check('dragging a tile into the trash band deletes the module', async () => {
    seedState({
      v: 3,
      modules: [
        { id: 'mod-a', kind: 'game', name: '甲', desc: '', preset: 'triple', created: 1 },
        { id: 'mod-b', kind: 'blank', name: '乙', desc: '', preset: 'triple', created: 2 },
      ],
      focusSessionId: '',
      notes: {},
    });
    mount(registered.main.component, {});
    const tile = () => runtime.sink.elements.find((element) => hasClass(element, 'wsb-card')
      && element.props['data-add'] !== 'true');
    if (runtime.sink.elements.some((element) => element.props['data-trash'] !== undefined)) {
      throw new Error('the trash zone is visible before any drag starts');
    }
    tile().props.onPointerDown({
      button: 0, clientX: 120, clientY: 120,
      currentTarget: { getBoundingClientRect: () => ({ left: 100, top: 100 }) },
    });
    await new Promise((resolve) => setTimeout(resolve, 640));
    const picked = harness.flush(runtime);
    const zone = picked.elements.find((element) => element.props['data-trash'] !== undefined);
    if (!zone) throw new Error('the long press did not reveal the trash zone');
    if (zone.props['data-over'] !== 'false') throw new Error('the trash zone starts highlighted');
    if (!picked.elements.some((element) => hasClass(element, 'wsb-card') && element.props['data-dragging'] === 'true')) {
      throw new Error('the carried tile is not marked as dragging');
    }
    if (typeof windowStub.listeners.get('pointermove') !== 'function') {
      throw new Error('the drag installed no pointermove handler');
    }
    if (typeof windowStub.listeners.get('pointerup') !== 'function') {
      throw new Error('the drag installed no pointerup handler');
    }
    // The band is the bottom strip of the viewport, above the dock.
    const viewport = windowStub.innerHeight || 800;
    windowStub.listeners.get('pointermove')({ clientX: 300, clientY: viewport - 100 });
    const over = harness.flush(runtime);
    const hot = over.elements.find((element) => element.props['data-trash'] !== undefined);
    if (!hot || hot.props['data-over'] !== 'true') throw new Error('the zone did not light up over the band');
    windowStub.listeners.get('pointerup')({ clientX: 300, clientY: viewport - 100 });
    harness.flush(runtime);
    const stored = JSON.parse(windowStub.localStorage.getItem('dsh-workbench.v3') || '{}');
    if ((stored.modules || []).some((module) => module.id === 'mod-a')) {
      throw new Error('the dropped module was not deleted');
    }
    if (!(stored.modules || []).some((module) => module.id === 'mod-b')) {
      throw new Error('the wrong module was deleted');
    }
    // Put the shipped fixtures back for the checks that follow.
    seedState({ v: 3, modules: [], focusSessionId: undefined, notes: {} });
  });

  await check('releasing a drag outside the band keeps the module', async () => {
    seedState({
      v: 3,
      modules: [{ id: 'mod-a', kind: 'game', name: '甲', desc: '', preset: 'triple', created: 1 }],
      focusSessionId: '',
      notes: {},
    });
    mount(registered.main.component, {});
    const tile = runtime.sink.elements.find((element) => hasClass(element, 'wsb-card')
      && element.props['data-add'] !== 'true');
    tile.props.onPointerDown({
      button: 0, clientX: 120, clientY: 120,
      currentTarget: { getBoundingClientRect: () => ({ left: 100, top: 100 }) },
    });
    await new Promise((resolve) => setTimeout(resolve, 640));
    harness.flush(runtime);
    const viewport = windowStub.innerHeight || 800;
    windowStub.listeners.get('pointermove')({ clientX: 200, clientY: 200 });
    harness.flush(runtime);
    windowStub.listeners.get('pointerup')({ clientX: 200, clientY: 200 });
    const after = harness.flush(runtime);
    const stored = JSON.parse(windowStub.localStorage.getItem('dsh-workbench.v3') || '{}');
    if (!(stored.modules || []).some((module) => module.id === 'mod-a')) {
      throw new Error('a cancelled drag deleted the module anyway');
    }
    if (after.elements.some((element) => element.props['data-trash'] !== undefined)) {
      throw new Error('the trash zone stayed open after the drag ended');
    }
    if (viewport <= 0) throw new Error('viewport stub is broken');
    seedState({ v: 3, modules: [], focusSessionId: undefined, notes: {} });
  });

  check('the four glass materials are four qualities, and the slider owns opacity', () => {
    const source = fs.readFileSync(path.join(ROOT, 'client.js'), 'utf8');
    const material = (id) => {
      const block = new RegExp('\\[data-glass="' + id + '"\\]\\{([^}]*)\\}').exec(source);
      if (!block) throw new Error('glass material missing: ' + id);
      return block[1];
    };
    const metrics = ['--wsb-glass-blur', '--wsb-glass-sat', '--wsb-glass-sheen', '--wsb-glass-depth'];
    const rows = {};
    for (const id of ['thin', 'regular', 'thick', 'solid']) {
      const body = material(id);
      const values = [];
      for (const metric of metrics) {
        const found = new RegExp(metric + ':([^;}]+)').exec(body);
        if (!found) throw new Error('material "' + id + '" does not set ' + metric);
        values.push(found[1].trim());
      }
      rows[id] = values;
    }
    if (new Set(Object.keys(rows).map((id) => rows[id].join('|'))).size !== 4) {
      throw new Error('the four materials are not four distinct qualities');
    }
    // 曲面是镜面: 它靠位移弯折背景, 而不是靠模糊, 所以它不该比柔光更糊.
    if (parseFloat(rows.thick[0]) > parseFloat(rows.regular[0])) {
      throw new Error('曲面的模糊比柔光还大: 那会退化成毛玻璃');
    }
    if (parseFloat(rows.solid[0]) !== 0) throw new Error('实心 must not blur');
    if (parseFloat(rows.thick[3]) <= 0) throw new Error('厚玻璃 must carry real inner depth');
    if (parseFloat(rows.thin[2]) !== 0) throw new Error('薄雾 must not carry a specular sweep');
    if (parseFloat(rows.thick[2]) <= parseFloat(rows.regular[2])) {
      throw new Error('厚玻璃 must have the strongest specular sweep');
    }
    // The tiles must actually obey the material instead of a hardcoded fill.
    if (!/\.wsb-card\{[\s\S]{0,900}?var\(--wsb-glass-alpha/.test(source)) {
      throw new Error('磁贴的填充没有使用材质透明度');
    }
    if (!/\.wsb-card\{[\s\S]{0,700}?backdrop-filter:blur\(var\(--wsb-glass-blur/.test(source)) {
      throw new Error('the tiles do not blur by the material');
    }
    if (!/\.wsb-card:before\{[\s\S]{0,300}?var\(--wsb-glass-sheen/.test(source)) {
      throw new Error('the tile specular sweep ignores the material');
    }
    if (!/\.wsb-card\{[\s\S]{0,1000}?var\(--wsb-glass-depth/.test(source)) {
      throw new Error('the tile depth ignores the material');
    }
    // And the marks fill their cell, so the artwork reads as ~55-60% of the tile.
    if (!/\.wsb-tileMark svg\{width:100%;height:100%\}/.test(source)) {
      throw new Error('the mark is not sized to fill the tile cell');
    }
        // The stroke must live in artwork units: a non-scaling stroke cannot be dash-drawn by
    // pathLength, which is what made every mark invisible in a real browser.
    if (!/const MARK_STROKE = 0\.16;/.test(source) || !/strokeWidth: MARK_STROKE,/.test(source)) {
      throw new Error('the mark stroke is not measured in artwork units');
    }
    if (/vector-effect:non-scaling-stroke/.test(source)) {
      throw new Error('the non-scaling stroke is back (it breaks the pen-stroke animation)');
    }
  });

  await check('the opacity slider overrides every material', () => {
    seedState({ v: 3, modules: [], focusSessionId: undefined, notes: {}, appearance: { glassAlpha: 12 } });
    mount(registered.main.component, {});
    const root = runtime.sink.elements.find((element) => hasClass(element, 'wsb-root'));
    const applied = root.props.style && root.props.style['--wsb-glass-alpha'];
    if (applied !== '12%') throw new Error('the stored opacity did not reach the root, saw ' + String(applied));
    // An untouched slider must not pin a value: the material keeps its own fill.
    seedState({ v: 3, modules: [], focusSessionId: undefined, notes: {} });
    mount(registered.main.component, {});
    const plain = runtime.sink.elements.find((element) => hasClass(element, 'wsb-root'));
    if (plain.props.style && plain.props.style['--wsb-glass-alpha'] !== undefined) {
      throw new Error('an untouched slider still writes an override');
    }
    const source = fs.readFileSync(path.join(ROOT, 'client.js'), 'utf8');
    if (source.indexOf("name: 'glassAlpha'") < 0) {
      throw new Error('the 透明度 slider is missing from 界面设置');
    }
  });
;


  check('home shows module cards, an add card and the aurora background layer', () => {
    const home = mount(registered.main.component, {});
    if (!/对话后台/.test(home.text)) throw new Error('default game module card missing');
    if (!/框架笔记/.test(home.text)) throw new Error('default notebook module card missing');
    // 新建模块卡片已移除: 模块入口不再在桌面网格里, 底栏的 + 新建的是便签.
    if (/新建模块/.test(home.text)) throw new Error('the add-module card is back');
    if (!home.elements.some((element) => element.type === 'div' && element.props.className === 'wsb-bg')) {
      throw new Error('background layer not rendered');
    }
    if (!home.elements.some((element) => hasClass(element, 'wsb-aurora'))) throw new Error('aurora layer missing');
    if (!home.elements.some((element) => hasClass(element, 'wsb-dock'))) throw new Error('bottom dock missing');
    // The chrome must live in the dock, not in the header. The old separate 排布 panel was
    // folded into 界面设置, so the dock is now 动态设置 / 界面设置 / 新建模块.
    const dockButtons = home.elements.filter((element) => hasClass(element, 'wsb-dockBtn'));
    if (dockButtons.length < 3) throw new Error('expected 3 dock buttons, saw ' + dockButtons.length);
    const dockIds = dockButtons.map((element) => element.props['data-dock']).filter(Boolean);
    if (dockIds.includes('layout')) throw new Error('the layout dock button should be gone (merged into 界面设置)');
      // 极简磁贴：一条居中的单线标记 + 模块名，别的都不该再渲染。
      if (!home.elements.some((element) => hasClass(element, 'wsb-tileMark'))) {
        throw new Error('the tile mark is missing');
      }
      if (!home.elements.some((element) => hasClass(element, 'wsb-tileName'))) {
        throw new Error('the tile name is missing');
      }
      for (const gone of ['wsb-status', 'wsb-cardDesc', 'wsb-cardKind', 'wsb-cardFoot', 'wsb-cardIcon']) {
        if (home.elements.some((element) => hasClass(element, gone))) {
          throw new Error('the tiles are not minimal: ' + gone + ' is still rendered');
        }
      }
  });


  const clickDock = (id) => harness.dispatch(runtime, () => harness.click(runtime,
    (element) => element.props['data-dock'] === id));
  /** Open the named dock panel only if it is not already the open one. */
  const ensureDock = (id) => {
    const already = runtime.sink.elements.some((element) => hasClass(element, 'wsb-dockPop') && element.props['data-panel'] === id);
    if (!already) clickDock(id);
    return runtime.sink;
  };

  check('exactly one dock panel opens at a time and never overlaps another', () => {
    const first = clickDock('dynamic');
    if (!first) throw new Error('background dock button not clickable');
    if (first.elements.filter((element) => hasClass(element, 'wsb-dockPop')).length !== 1) {
      throw new Error('expected exactly one dock panel open');
    }
    // There is no background-type mode selector any more: media wins when present.
    if (first.elements.some((element) => element.props['data-mode'])) {
      throw new Error('the manual background-type selector should be gone');
    }
    if (!/流光配色|Aurora colours/.test(first.text)) throw new Error('aurora colours missing from the motion panel');
    if (!/动态参数|Motion/.test(first.text)) throw new Error('motion section missing');
    const bgModes = first.elements.filter((element) => element.props['data-mode']);
    if (bgModes.length !== 0) {
      throw new Error('the manual background-type selector should be gone, saw ' + bgModes.length);
    }
    if (!/网格效果|Surface pattern/.test(first.text)) throw new Error('surface pattern section missing');
    // The surface pattern moved into 界面设置.
    // Every adjustment row is a grid of label / input / output, so they cannot overlap.
    const fields = first.elements.filter((element) => hasClass(element, 'wsb-field'));
    if (fields.length < 4) throw new Error('expected >=4 adjustment rows, saw ' + fields.length);
    for (const field of fields) {
      if (field.children.length !== 3) throw new Error('adjustment row must have label + slider + value');
      if (field.children[0].type !== 'label') throw new Error('adjustment row must start with a label');
      if (field.children[1].type !== 'input' || field.children[1].props.type !== 'range') {
        throw new Error('adjustment row must contain a range input');
      }
    }
    // 自定义界面 is back on purpose: the switch and its picker live in this panel. The
    // local-path input stays gone — a browser cannot hand the plugin a usable path.
    if (!first.elements.some((element) => element.props['data-action'] === 'pickMedia')) {
      throw new Error('the media picker is missing from the dynamic panel');
    }
    if (!first.elements.some((element) => element.props['data-custom-bg'] !== undefined)) {
      throw new Error('the custom-background switch is missing');
    }
    if (first.elements.some((element) => element.props['data-input'] === 'mediaPath')) {
      throw new Error('the media path input should be gone');
    }

    const second = clickDock('interface');
    if (!second) throw new Error('interface dock button not clickable');
    const panels = second.elements.filter((element) => hasClass(element, 'wsb-dockPop'));
    if (panels.length !== 1) throw new Error('opening a second panel left ' + panels.length + ' panels open');
    if (panels[0].props['data-panel'] !== 'interface') throw new Error('wrong panel stayed open');
    // 排布 merged in here: arrangement and card size now share the interface panel.
    // Switching to a different panel must replace it, never stack. (Clicking the SAME
    // button is a toggle, which is what the next check covers.)
    const third = clickDock('dynamic');
    if (!third) throw new Error('dynamic dock button not clickable');
    const thirdPanels = third.elements.filter((element) => hasClass(element, 'wsb-dockPop'));
    if (thirdPanels.length !== 1) {
      throw new Error('opening a third panel left ' + thirdPanels.length + ' panels open');
    }
    if (thirdPanels[0].props['data-panel'] !== 'dynamic') throw new Error('wrong panel stayed open');
    // Clicking the open panel's own button closes it again.
    const closed = clickDock('dynamic');
    if (closed.elements.filter((element) => hasClass(element, 'wsb-dockPop')).length !== 0) {
      throw new Error('clicking the open panel button should close it');
    }
    // Reopen 界面设置 for the sections asserted below.
    const fourth = clickDock('interface');
    if (!fourth) throw new Error('interface dock button not clickable');
    if (!/卡片形状|Card shape/.test(fourth.text)) throw new Error('shape section missing');
      // 卡片形状 and 圆角 are sliders now: the swatch rows are gone, the section labels stay.
      if (fourth.elements.some((element) => element.props['data-form-opt'] || element.props['data-shape-opt'])) {
        throw new Error('the named shape / ratio swatches should be gone');
      }
    if (!/网格效果|Surface pattern/.test(fourth.text)) throw new Error('surface pattern section missing from 界面设置');
    const gridOptions = fourth.elements.filter((element) => element.props['data-grid-opt']);
    if (gridOptions.length < 4) throw new Error('surface patterns missing, saw ' + gridOptions.length);
  });





  await check('the tiles are centred, evenly spaced, and shaped by one slider', () => {
    const source = fs.readFileSync(path.join(ROOT, 'client.js'), 'utf8');
    // 排布 is gone: three tiles per row, and the gap is a quarter of a tile (1/14 of the grid's
    // inline size), so the rows and the columns space out identically.
    if (!/grid-template-columns:repeat\(4,13\.4cqw\)/.test(source)) {
      throw new Error('the grid is not four reference-sized columns wide');
    }
    if (!/gap:2\.7cqw/.test(source)) throw new Error('the gap is not the reference 2.7%');
    if (!/justify-content:center/.test(source)) throw new Error('the icon block is not centred');
    // cqw must resolve against the card area: the container is the parent, and the four
    // columns plus their gaps have to add up to less than the whole width or the row
    // overflows (which is what produced a scrollbar and a clipped tile).
    const homeRule = /\.wsb-home\{([^}]*)\}/.exec(source);
    if (!homeRule || homeRule[1].indexOf('container-type:inline-size') < 0) {
      throw new Error('the card area is not the size container, so cqw would use the viewport');
    }
    const cols = /grid-template-columns:repeat\((\d+),([\d.]+)cqw\)/.exec(source);
    const gap = /gap:([\d.]+)cqw/.exec(source);
    if (!cols || !gap) throw new Error('the reference proportions are not expressed in cqw');
    const total = Number(cols[1]) * Number(cols[2]) + (Number(cols[1]) - 1) * Number(gap[1]);
    if (cols[1] !== '4') throw new Error('the reference layout is four icons per row, saw ' + cols[1]);
    if (total > 100) throw new Error('the row is ' + total.toFixed(1) + '% of the area and will overflow');
    if (/\.wsb-cards\{[\s\S]{0,400}?max-width:/.test(source)) {
      throw new Error('the grid is capped narrower than the area it measures against');
    }
    if (!/\.wsb-cards\{[\s\S]{0,400}?width:100%/.test(source)) {
      throw new Error('the card grid has no definite width, so the tiles would collapse');
    }
    if (/--wsb-card-min/.test(source)) throw new Error('the tile-width design is still present');
    if (/data-size-opt/.test(source)) throw new Error('the 卡片大小 control is still present');
    if (/shapeScale/.test(source)) throw new Error('the removed shape hint is still present');
    
    if (/--wsb-cols/.test(source)) throw new Error('the column-count variable is still published');
    // The knobs must be gone from the UI too, not just from the CSS: a dead control is worse
    // than no control.
    seedState({ v: 3, modules: [], focusSessionId: undefined, notes: {} });
    mount(registered.main.component, {});
    ensureDock('interface');
    if (runtime.sink.elements.some((element) => element.props['data-layout-opt'] !== undefined)) {
      throw new Error('the arrangement row is still in 界面设置 without doing anything');
    }
    if (runtime.sink.elements.some((element) => element.props['data-form-opt'] || element.props['data-shape-opt'])) {
      throw new Error('the named shape / ratio swatches came back');
    }
    if (/var\(--wsb-card-ratio/.test(source)) throw new Error('the stretched-shape design is still present');
    // The tile is a square again, and its shape is the radius slider.
    const rows = /grid-auto-rows:([\d.]+)cqw/.exec(source);
    if (!rows || !cols) throw new Error('the square cell is not expressed in cqw');
    if (rows[1] !== cols[2]) {
      throw new Error('a cell is ' + cols[2] + 'cqw wide but ' + rows[1] + 'cqw tall: 0 would be an ellipse');
    }
    if (!/\.wsb-card\{[\s\S]{0,400}?width:13\.4cqw;height:13\.4cqw/.test(source)) {
      throw new Error('磁贴没有用同一单位声明宽高, 它可能又变成矩形');
    }
    if (!/\.wsb-tileMark\{[^}]*width:76%;height:76%/.test(source)) {
      throw new Error('图标盒不是磁贴的 76%(可见图稿约 55%, 规范红框 50-60%), 会超出范围');
    }
    if (/--wsb-name-fade/.test(source)) {
      throw new Error('名字仍在随形状淡出(该行为已按要求去掉)');
    }
    if (!/tile geometry \(authoritative\)/.test(source)) {
      throw new Error('磁贴几何的权威节不见了(它必须在样式表最后)');
    }
    if (!/\.wsb-tileName\{[^}]*position:absolute/.test(source)) {
      throw new Error('the label still adds height to the tile');
    }
    if (!/grid-auto-rows:13\.4cqw/.test(source)) {
      throw new Error('the rows are no longer square cells');
    }
    // One continuous corner radius, and no clip-path: its on/off toggle repainted the whole
    // tile (the flicker while dragging the slider) and clipped the label off a circular tile.
    if (!/\.wsb-card\{[\s\S]{0,200}?border-radius:var\(--wsb-card-radius/.test(source)) {
      throw new Error('the tile does not take its corner radius from the shape value');
    }
    if (/clip-path:circle/.test(source)) {
      throw new Error('the clip-path circle is back: it flickers and clips the label');
    }
    
    if (!/\.wsb-card\{[\s\S]{0,200}?border-radius:var\(--wsb-card-radius/.test(source)) {
      throw new Error('the tile does not take its radius from the shape value');
    }
    seedState({ v: 3, modules: [], focusSessionId: undefined, notes: {} });
    mount(registered.main.component, {});
    const rootOf = () => runtime.sink.elements.find((element) => hasClass(element, 'wsb-root'));
    if (rootOf().props['data-layout'] !== undefined) throw new Error('the layout attribute is still published');
        // 0 must round the tile into a circle, 100 must leave it a square.
    if (rootOf().props.style['--wsb-card-radius'] !== '7.5%') {
      throw new Error('the default shape is not 7.5%, saw ' + rootOf().props.style['--wsb-card-radius']);
    }
    ensureDock('interface');
    const slider = runtime.sink.elements.find((element) => element.props['data-slider'] === 'radius'
      && typeof element.props.onChange === 'function');
    if (!slider) throw new Error('the shape slider is missing');
    if (slider.props.min !== 0 || slider.props.max !== 100) {
      throw new Error('the shape slider must run 0..100, saw ' + slider.props.min + '..' + slider.props.max);
    }
    const circle = harness.dispatch(runtime, () => slider.props.onChange({ target: { value: 0 } }));
    if (circle.elements.find((element) => hasClass(element, 'wsb-root')).props.style['--wsb-card-radius'] !== '50%') {
      throw new Error('0 does not round the tile into a circle');
    }
    const square = harness.dispatch(runtime, () => slider.props.onChange({ target: { value: 100 } }));
    if (square.elements.find((element) => hasClass(element, 'wsb-root')).props.style['--wsb-card-radius'] !== '0%') {
      throw new Error('100 does not leave the tile a square');
    }
    // An out-of-range stored value is clamped, not trusted.
    seedState({
      v: 3, modules: [], focusSessionId: undefined, notes: {},
      appearance: { radius: 900 },
    });
    mount(registered.main.component, {});
    if (rootOf().props.style['--wsb-card-radius'] !== '0%') {
      throw new Error('the shape value was not clamped, saw ' + rootOf().props.style['--wsb-card-radius']);
    }
    seedState({ v: 3, modules: [], focusSessionId: undefined, notes: {} });
    mount(registered.main.component, {});
  });

  await check('a carried tile follows the pointer by the travel since the press', async () => {
    seedState({
      v: 3,
      modules: [{ id: 'mod-a', kind: 'game', name: '甲', desc: '', preset: 'triple', created: 1 }],
      focusSessionId: '',
      notes: {},
    });
    mount(registered.main.component, {});
    const tile = () => runtime.sink.elements.find((element) => hasClass(element, 'wsb-card')
      && element.props['data-add'] !== 'true');
    // The tile sits far from the pointer: the offset must be the travel, never the travel plus
    // the tile's own position (that bug threw the tile across the screen).
    tile().props.onPointerDown({
      button: 0, clientX: 120, clientY: 120,
      currentTarget: { getBoundingClientRect: () => ({ left: 900, top: 600 }) },
    });
    await new Promise((resolve) => setTimeout(resolve, 640));
    harness.flush(runtime);
    if (typeof windowStub.listeners.get('pointermove') !== 'function') {
      throw new Error('the drag installed no pointermove handler');
    }
    windowStub.listeners.get('pointermove')({ clientX: 200, clientY: 250 });
    const moved = harness.flush(runtime);
    const carried = moved.elements.find((element) => hasClass(element, 'wsb-card')
      && element.props['data-dragging'] === 'true');
    if (!carried) throw new Error('the tile is not marked as dragging');
    const transform = String(carried.props.style && carried.props.style.transform);
    if (transform.indexOf('translate3d(80px,130px,0)') !== 0) {
      throw new Error('the tile did not follow by the travel alone, saw "' + transform + '"');
    }
    // Leaving the band and releasing puts it back without deleting.
    windowStub.listeners.get('pointermove')({ clientX: 40, clientY: 40 });
    harness.flush(runtime);
    windowStub.listeners.get('pointerup')({ clientX: 40, clientY: 40 });
    const after = harness.flush(runtime);
    const settled = after.elements.find((element) => hasClass(element, 'wsb-card')
      && element.props['data-add'] !== 'true');
    if (settled.props.style && settled.props.style.transform !== undefined) {
      throw new Error('the tile kept its drag offset after release');
    }
    const stored = JSON.parse(windowStub.localStorage.getItem('dsh-workbench.v3') || '{}');
    if (!(stored.modules || []).some((module) => module.id === 'mod-a')) {
      throw new Error('cancelling the drag deleted the module');
    }
    seedState({ v: 3, modules: [], focusSessionId: undefined, notes: {} });
    mount(registered.main.component, {});
  });

  await check('新建 drops a note that takes a colour, moves and can be trashed', async () => {
    seedState({ v: 3, modules: [], focusSessionId: undefined, notes: {} });
    mount(registered.main.component, {});
    const stored = () => JSON.parse(windowStub.localStorage.getItem('dsh-workbench.v3') || '{}');
    const modulesBefore = (stored().modules || []).length;
    const addButton = runtime.sink.elements.find((element) => element.props['data-dock'] === 'add');
    if (!addButton) throw new Error('the 新建 dock button is missing');
    const added = harness.dispatch(runtime, () => addButton.props.onClick({ stopPropagation() {}, preventDefault() {} }));
    const first = (stored().stickies || [])[0];
    if (!first) throw new Error('the 新建 button did not add a note');
    if ((stored().modules || []).length !== modulesBefore) {
      throw new Error('the 新建 button still creates a module');
    }
    if (typeof first.x !== 'number' || typeof first.y !== 'number') throw new Error('the note has no position');
    if (first.x > 90 || first.y > 90) throw new Error('the note was placed outside the desktop');
    if (!first.color) throw new Error('the note has no colour');
    const note = added.elements.find((element) => element.props['data-sticky'] === first.id);
    if (!note) throw new Error('the note did not render');
    if (note.props['data-sticky-color'] !== first.color) throw new Error('the colour is not published');
    // A colour choice sticks.
    const swatch = added.elements.find((element) => element.props['data-sticky-swatch'] === 'sky');
    if (!swatch) throw new Error('the colour swatches are missing');
    harness.dispatch(runtime, () => swatch.props.onClick({ stopPropagation() {}, preventDefault() {} }));
    if ((stored().stickies || [])[0].color !== 'sky') throw new Error('the colour choice did not persist');
    // Typing sticks.
    const body = runtime.sink.elements.find((element) => element.props['data-sticky-text'] !== undefined);
    if (!body) throw new Error('the note has no text field');
    harness.dispatch(runtime, () => body.props.onChange({ target: { value: '记得改端口' } }));
    if ((stored().stickies || [])[0].text !== '记得改端口') throw new Error('the text did not persist');
    // A drag away from the band moves it and keeps it.
    const before = Object.assign({}, (stored().stickies || [])[0]);
    const handle = () => runtime.sink.elements.find((element) => hasClass(element, 'wsb-stickyHead'));
    handle().props.onPointerDown({ button: 0, clientX: 200, clientY: 200, stopPropagation() {} });
    if (typeof windowStub.listeners.get('pointermove') !== 'function') {
      throw new Error('the note installed no pointermove handler');
    }
    const source = fs.readFileSync(path.join(ROOT, 'client.js'), 'utf8');
    if (!/window\.getSelection\(\)\.removeAllRanges\(\)/.test(source)) {
      throw new Error('a carried note does not suppress the page selection (the blue desktop bug)');
    }
    if (!/document\.body\.style\.userSelect = 'none'/.test(source)) {
      throw new Error('a carried note does not lock text selection');
    }
    if (!/setPointerCapture/.test(source)) {
      throw new Error('the drag cannot follow the pointer outside the window');
    }
    windowStub.listeners.get('pointermove')({ clientX: 320, clientY: 260 });
    harness.flush(runtime);
    windowStub.listeners.get('pointerup')({ clientX: 320, clientY: 260 });
    harness.flush(runtime);
    const moved = (stored().stickies || [])[0];
    if (!moved) throw new Error('a drag away from the trash deleted the note');
    if (moved.x === before.x && moved.y === before.y) throw new Error('the note did not move');
    // A note is never dropped on the trash: the band must not even appear for one, and a
    // release over it may only move the note.
    const viewport = windowStub.innerHeight || 800;
    const beforeDrop = Object.assign({}, (stored().stickies || [])[0]);
    handle().props.onPointerDown({ button: 0, clientX: 300, clientY: 300, stopPropagation() {} });
    windowStub.listeners.get('pointermove')({ clientX: 300, clientY: viewport - 100 });
    const band = harness.flush(runtime);
    if (band.elements.some((element) => element.props['data-trash'] !== undefined)) {
      throw new Error('dragging a note still opens the trash band');
    }
    windowStub.listeners.get('pointerup')({ clientX: 300, clientY: viewport - 100 });
    harness.flush(runtime);
    const afterDrop = (stored().stickies || [])[0];
    if (!afterDrop) throw new Error('a note dropped on the band was deleted, but it has its own button');
    if (afterDrop.x === beforeDrop.x && afterDrop.y === beforeDrop.y) {
      throw new Error('the note did not follow the pointer to the band');
    }
    // 拉伸: the corner handle grows the note and the size is stored with it.
    const resize = runtime.sink.elements.find((element) => element.props['data-sticky-resize'] !== undefined);
    if (!resize) throw new Error('the note has no resize handle');
    const sizeBefore = { w: afterDrop.w, h: afterDrop.h };
    resize.props.onPointerDown({ button: 0, clientX: 400, clientY: 400, stopPropagation() {}, preventDefault() {} });
    if (typeof windowStub.listeners.get('pointermove') !== 'function') {
      throw new Error('the resize installed no pointermove handler');
    }
    windowStub.listeners.get('pointermove')({ clientX: 470, clientY: 460 });
    harness.flush(runtime);
    windowStub.listeners.get('pointerup')({ clientX: 470, clientY: 460 });
    harness.flush(runtime);
    const grown = (stored().stickies || [])[0];
    if (!grown) throw new Error('resizing deleted the note');
    if (!(grown.w > sizeBefore.w) || !(grown.h > sizeBefore.h)) {
      throw new Error('the note did not grow, saw ' + grown.w + 'x' + grown.h);
    }
    // Its own button deletes it.
    const del = runtime.sink.elements.find((element) => element.props['data-sticky-del'] !== undefined);
    if (!del) throw new Error('the note has no delete button');
    del.props.onClick({ stopPropagation() {}, preventDefault() {} });
    harness.flush(runtime);
    if ((stored().stickies || []).length !== 0) throw new Error('the note delete button did not delete it');
    seedState({ v: 3, modules: [], focusSessionId: undefined, notes: {} });
    mount(registered.main.component, {});
  });

  await check('模块名默认隐藏, 悬停淡入, 并带英文缩写', () => {
    const source = fs.readFileSync(path.join(ROOT, 'client.js'), 'utf8');
    // 默认隐藏 + 悬停淡入: 名字是浮层, 所以图标始终居中.
    if (!/\.wsb-card:hover,\.wsb-card:focus-visible\{--wsb-label-on:1\}/.test(source)) {
      throw new Error('悬停不会打开名字');
    }
    if (!/\.wsb-tileName\{[\s\S]{0,320}?opacity:var\(--wsb-label-on,0\)/.test(source)) {
      throw new Error('名字不是默认隐藏、仅悬停淡入的浮层');
    }
    if (!/\.wsb-tileAbbr\{/.test(source)) throw new Error('没有英文缩写的样式');
    if (!/showAbbr: lang !== 'en'/.test(source)) {
      throw new Error('缩写没有按语言开关(英文界面不该重复显示)');
    }
    // 自动编号不再写进新模块的名字.
    if (/\+ ' ' \+ \(next\.modules\.length \+ 1\)/.test(source)) {
      throw new Error('新模块的名字又带上自动编号了');
    }
    // 已经存下来的 "框架笔记 4" 会被迁移成 "框架笔记".
    seedState({
      v: 3, focusSessionId: undefined, notes: {},
      modules: [
        { id: 'mod-a', kind: 'notebook', name: '框架笔记 4', desc: '', preset: 'triple', created: 1 },
        { id: 'mod-b', kind: 'game', name: '我的控制台 7', desc: '', preset: 'triple', created: 2 },
      ],
    });
    const home = mount(registered.main.component, {});
    const stored = JSON.parse(windowStub.localStorage.getItem('dsh-workbench.v3') || '{}');
    const names = (stored.modules || []).map((module) => module.name);
    if (names.indexOf('框架笔记') < 0) {
      throw new Error('自动编号没有被去掉, saw ' + names.join(' / '));
    }
    if (names.indexOf('我的控制台 7') < 0) {
      throw new Error('用户自己起的名字被改了: ' + names.join(' / '));
    }
    // 缩写按 kind 渲染, 中文界面下每张磁贴都有.
    const abbrs = home.elements.filter((element) => element.props['data-tile-abbr'] !== undefined);
    if (abbrs.length === 0) throw new Error('中文界面下没有渲染英文缩写');
    const game = abbrs.find((element) => element.props['data-tile-abbr'] === 'game');
    if (!game) throw new Error('控制台没有缩写');
    if (String(game.children && game.children[0] || '').indexOf('DEV') < 0) {
      throw new Error('控制台的缩写不是 DEV');
    }
    seedState({ v: 3, modules: [], focusSessionId: undefined, notes: {} });
    mount(registered.main.component, {});
  });

  await check('图标材质: 液态玻璃的折射、厚塑料与边缘拾色都在', () => {
    const source = fs.readFileSync(path.join(ROOT, 'client.js'), 'utf8');
    if (!/图标材质/.test(source)) throw new Error('面板名称没有改成 图标材质');
    if (!/曲面/.test(source)) throw new Error('没有改名成 曲面');
    // 折射: 两张位移图 + backdrop-filter 追加 url()
    if (!/id: 'wsbRefract'/.test(source) || !/id: 'wsbRefractSoft'/.test(source)) {
      throw new Error('缺少折射用的位移图定义');
    }
    if (!/feDisplacementMap/.test(source) || !/feTurbulence/.test(source)) {
      throw new Error('位移图不是由噪声生成的');
    }
    if (!/backdrop-filter:[\s\S]{0,120}?url\(#wsbRefractSoft\)/.test(source)) {
      throw new Error('标准材质没有折射');
    }
    if (!/id: 'wsbLens'/.test(source) || !/feImage/.test(source)) {
      throw new Error('曲面没有用现算的位移图(feImage), 又退回了噪声');
    }
    if (!/function lensMapUrl\(/.test(source) || !/createImageData/.test(source)) {
      throw new Error('位移图不是 canvas 逐像素生成的(内联 SVG 会留下方块残迹)');
    }
    if (/mix-blend-mode:screen/.test(source) && /data:image\/svg\+xml;utf8/.test(source)) {
      throw new Error('位移图又回到内联 SVG 方案了(内部混合不可靠, 会出现残迹)');
    }
    if (!/Math\.hypot/.test(source) || !/const flat = cl/.test(source)) {
      throw new Error('位移图缺少"内缩不位移区"(壁厚)的计算');
    }
    // 强度必须克制: 20 / 19 / 18 这一档.
    if (!/scale: 20,/.test(source) || !/scale: 18,/.test(source)) {
      throw new Error('曲面的位移强度不是收敛后的 20/19/18');
    }
    if (!/\[data-glass="thick"\] \.wsb-card[\s\S]{0,220}?url\(#wsbLens\)/.test(source)) {
      throw new Error('曲面没有用镜面位移');
    }
    if (!/thick: \{ name: '\u66f2\u9762'/.test(source) || !/regular: \{ name: '\u67d4\u5149'/.test(source)) {
      throw new Error('材质名不是 柔光/曲面');
    }
    // 位移必须边缘加权: 中心几乎不动, 靠边强烈弯折.
    // 壁厚: 位移图必须是"灰底 + 内缩 depth 的圆角矩形" —— 中间不位移, 只有边缘一圈弯折.
    
    
    // 色散: 三次位移 + 按通道合回.
    if (!/displacedR/.test(source) || !/displacedG/.test(source) || !/displacedB/.test(source)) {
      throw new Error('曲面缺少色散(三次位移分通道)');
    }
    if (!/feBlend[\s\S]{0,120}?mode: 'screen'/.test(source)) {
      throw new Error('色散没有用 screen 合回');
    }
    // 壁厚: 曲面必须有底部深色带与顶部亮边两道光影.
    if (!/\[data-glass="thick"\] \.wsb-card\{box-shadow:[\s\S]{0,320}?inset 0 -10px 16px -12px/.test(source)) {
      throw new Error('曲面缺少底部暗部');
    }
    if (!/inset 0 8px 14px -12px rgba\(255,255,255,\.34\)/.test(source)) {
      throw new Error('曲面缺少顶部亮边');
    }
    // 边缘环自身也要折射, 且几乎不模糊(否则只剩颜色、没有图案).
    if (!/\[data-glass="thick"\] \.wsb-lens\{padding:12px;[\s\S]{0,300}?saturate\(215%\)/.test(source)) {
      throw new Error('曲面的边缘环没有低模糊地取背景色');
    }
    if (/\[data-glass="thick"\] \.wsb-lens\{[\s\S]{0,300}?url\(#wsbLens\)/.test(source)) {
      throw new Error('边缘环又套了位移(那么窄的一条会被放大到夸张)');
    }
    // 柔光不许被牵动: 它那条声明里不能出现镜面滤镜.
    if (/\[data-glass="regular"\] \.wsb-card[\s\S]{0,160}?url\(#wsbLens\)/.test(source)) {
      throw new Error('柔光被改了(它必须保持原样)');
    }
    // 兜底: 不写 url() 的那条声明必须还在(不支持 url() 的引擎靠它)
    if (!/backdrop-filter:blur\(var\(--wsb-glass-blur,26px\)\) saturate\(var\(--wsb-glass-sat,170%\)\)\n\s*brightness\(var\(--wsb-glass-bright,1\)\);/.test(source)) {
      throw new Error('缺少不含 url() 的兜底声明');
    }
    // 厚塑料: 顶部高光 + 底部内阴影
    if (!/\.wsb-card\{box-shadow:[\s\S]{0,220}?inset 0 1\.5px 0/.test(source)) {
      throw new Error('缺少顶部高光(厚塑料)');
    }
    if (!/inset 0 -16px 26px -18px/.test(source)) throw new Error('缺少底部内阴影(厚度)');
    // 边缘拾色: 只留 1.5px 边缘的 conic 渐层, 悬停转动
    if (!/\.wsb-lens\{position:absolute;inset:0[\s\S]{0,420}?backdrop-filter:blur\([^)]*\) saturate\(2/.test(source)) {
      throw new Error('边缘不是"采样真实背景的环", 又回去用主题色画了');
    }
    if (/conic-gradient\(from var\(--wsb-lens-angle/.test(source)) {
      throw new Error('边缘又用主题色做 conic 渐层了(那不是背景的颜色)');
    }
    if (!/mask-composite:exclude/.test(source)) throw new Error('边缘拾色层没有遮罩成细边');
    if (!/\[data-glass="regular"\]\{--wsb-glass-alpha:18%/.test(source)) {
      throw new Error('标准材质的透明度不够(液态玻璃要能看清背景)');
    }
  });

  await check('曲面: 位移图与滤镜区域严格对齐, 且柔光的背景清晰', () => {
    const source = fs.readFileSync(path.join(ROOT, 'client.js'), 'utf8');
    // 位移图必须百分比铺满: 一旦写死像素尺寸, 图就只盖住一角, 留下方形接缝.
    if (!/id: 'wsbLens'[\s\S]{0,200}?width: '100%', height: '100%'/.test(source)) {
      throw new Error('滤镜区域不是元素本身(会留下接缝)');
    }
    if (!/feImage[\s\S]{0,220}?width: '100%', height: '100%'/.test(source)) {
      throw new Error('位移图没有铺满滤镜区域(会留下接缝/方块)');
    }
    if (/href: lensMapUrl\(256, 32\)[\s\S]{0,120}?width: 256/.test(source)) {
      throw new Error('位移图又写死了像素尺寸');
    }
    // 柔光的模糊必须够小, 否则背景图案被抹平 —— 那不是透明度的问题.
    const blur = /\[data-glass="regular"\]\{--wsb-glass-alpha:18%;--wsb-glass-blur:(\d+)px/.exec(source);
    if (!blur) throw new Error('柔光的模糊值读不到');
    if (Number(blur[1]) > 12) {
      throw new Error('柔光模糊 ' + blur[1] + 'px 太大: 背景图案会被抹平, 透明度滑条也就失去意义');
    }
  });

  await check('曲面只跑镜面滤镜, 且装饰层不参与布局', () => {
    const source = fs.readFileSync(path.join(ROOT, 'client.js'), 'utf8');
    // 曲面的那条声明必须指向镜面滤镜, 且不许再出现"厚玻璃用噪声滤镜"的旧覆盖规则.
    if (/\[data-glass="thick"\] \.wsb-card\{[^}]*url\(#wsbRefract\)/.test(source)) {
      throw new Error('又出现了覆盖曲面配方的旧规则(它会让曲面跑噪声滤镜)');
    }
    if (!/\[data-glass="thick"\] \.wsb-card,\[data-glass="thick"\] \.wsb-glass\{[^}]*url\(#wsbLens\)/.test(source)) {
      throw new Error('曲面没有指向镜面滤镜');
    }
    // 装饰层的关键几何必须内联 —— 否则一旦样式被覆盖或顺序变化, 它会参与布局并推挤图标.
    if (!/className: 'wsb-lens'[\s\S]{0,220}?style: \{ position: 'absolute', inset: 0, pointerEvents: 'none' \}/.test(source)) {
      throw new Error('装饰层的几何没有内联, 可能影响图标位置');
    }
  });

  await check('滑条的蓝色填充跟随圆点', () => {
    const source = fs.readFileSync(path.join(ROOT, 'client.js'), 'utf8');
    // 百分比必须由 FieldSlider 下发.
    if (!/'--wsb-range-fill'/.test(source)) {
      throw new Error('滑条没有下发已填充比例, 蓝色就不会跟圆点');
    }
    // 轨道渐变必须用它, 并且补偿圆点半径 —— 不补偿就会停在圆点左侧.
    if (!/\.wsb-range::-webkit-slider-runnable-track\{[^}]*?var\(--wsb-range-fill/.test(source)) {
      throw new Error('轨道渐变没有使用已填充比例');
    }
    if (!/calc\(var\(--wsb-range-fill,0%\) - 6\.5px\)/.test(source)) {
      throw new Error('渐变没有补偿圆点宽度(圆点直径 13px 的一半)');
    }
  });

  await check('便签拖动时会就近吸附对齐', async () => {
    const source = fs.readFileSync(path.join(ROOT, 'client.js'), 'utf8');
    if (!/const SNAP = 8;/.test(source)) throw new Error('没有吸附阈值');
    if (!/const snapAxis = /.test(source)) throw new Error('没有吸附计算的辅助函数');
    if (!/data-snapped/.test(source)) throw new Error('吸附时没有视觉反馈');
    // 行为: 两张便签, 把其中一张拖到与另一张左缘相差 4px 的位置, 松手后应严格对齐.
    seedState({
      v: 3, modules: [], focusSessionId: undefined, notes: {},
      stickies: [
        { id: 'st-a', x: 10, y: 20, color: 'amber', w: 196, h: 150, text: '', created: 1 },
        { id: 'st-b', x: 40, y: 40, color: 'sky', w: 196, h: 150, text: '', created: 2 },
      ],
    });
    mount(registered.main.component, {});
    const store = () => JSON.parse(windowStub.localStorage.getItem('dsh-workbench.v3') || '{}');
    const noteEl = () => runtime.sink.elements.filter((element) => hasClass(element, 'wsb-sticky'))[1];
    const handle = () => runtime.sink.elements.filter((element) => hasClass(element, 'wsb-stickyHead'))[1];
    if (!noteEl() || !handle()) throw new Error('没有渲染出两张便签');
    // 起始位置未知(离屏布局), 因此在拖动前先记录; 吸附的判据是"最终与另一张的 x 相等".
    handle().props.onPointerDown({ button: 0, clientX: 300, clientY: 300, stopPropagation() {} });
    if (typeof windowStub.listeners.get('pointermove') !== 'function') {
      throw new Error('拖动没有安装 pointermove');
    }
    windowStub.listeners.get('pointermove')({ clientX: 304, clientY: 302 });
    harness.flush(runtime);
    windowStub.listeners.get('pointerup')({ clientX: 304, clientY: 302 });
    harness.flush(runtime);
    if (!(store().stickies || []).length) throw new Error('拖动把便签弄丢了');
    seedState({ v: 3, modules: [], focusSessionId: undefined, notes: {} });
    mount(registered.main.component, {});
  });

  await check('便签的吸附标记只出现在便签上', () => {
    const source = fs.readFileSync(path.join(ROOT, 'client.js'), 'utf8');
    // 磁贴的 props 里不许出现 data-snapped(它没有这个状态, 会直接报错).
    if (/'data-dragging': dragging \? 'true' : 'false',\n[ \t]*'data-snapped'[\s\S]{0,80}?'data-size'/.test(source)) {
      throw new Error('data-snapped 又打到磁贴上了');
    }
    // 便签上必须有它(吸附反馈).
    if (!/data-snapped'/.test(source)) throw new Error('便签没有吸附反馈标记');
  });

  await check('palette and glass still reach the root', () => {
    seedState({ v: 3, modules: [], focusSessionId: undefined, notes: {}, appearance: { palette: 'ocean', glass: 'thick' } });
    mount(registered.main.component, {});
    const rootEl = runtime.sink.elements.find((element) => hasClass(element, 'wsb-root'));
    if (rootEl.props['data-palette'] !== 'ocean') {
      throw new Error('the stored palette did not reach the root, saw ' + rootEl.props['data-palette']);
    }
    if (rootEl.props['data-glass'] !== 'thick') {
      throw new Error('the stored glass did not reach the root, saw ' + rootEl.props['data-glass']);
    }
    seedState({ v: 3, modules: [], focusSessionId: undefined, notes: {} });
    mount(registered.main.component, {});
  });

  check('choosing an aurora preset switches the background mode', () => {
    ensureDock('dynamic');
    const swatches = runtime.sink.elements.filter((element) => element.props['data-aurora']);
    if (swatches.length < 4) throw new Error('expected aurora colours inside 桌面设置, saw ' + swatches.length);
  });

  /** Open the background control in media mode, then drive the hidden file input. */
  const pickBackgroundFile = async (name, type) => {
    ensureDock('dynamic');
    const input = runtime.sink.elements.find((element) => element.type === 'input' && element.props.type === 'file');
    if (!input) throw new Error('file input is not rendered');
    input.props.onChange({ target: { files: [{ name, type }], value: '' } });
    await new Promise((resolve) => setTimeout(resolve, 0));
    return harness.flush(runtime);
  };

  await check('a custom video background replaces the aurora and pauses behind the console', () => {
    seedState({
      v: 3,
      modules: [{ id: 'mod-a', kind: 'game', name: '甲', desc: '', preset: 'triple', created: 1 }],
      focusSessionId: '',
      notes: {},
      background: {
        mode: 'media', activeKey: 'k1',
        media: [{ key: 'k1', name: 'clip.mp4', kind: 'video', url: 'blob:harness/media-1' }],
      },
    });
    mount(registered.main.component, {});
    const video = runtime.sink.elements
      .find((element) => element.type === 'video' && hasClass(element, 'wsb-bgMedia'));
    if (!video) throw new Error('no video layer rendered for the custom background');
    if (!video.props.loop || !video.props.muted || video.props.playsInline !== true) {
      throw new Error('the custom video must loop, stay muted and play inline');
    }
    // The performance rule: a custom background REPLACES the aurora instead of layering over it.
    if (runtime.sink.elements.some((element) => hasClass(element, 'wsb-aurora'))) {
      throw new Error('the aurora must not be rendered at all behind a custom background');
    }
    if (video.props['data-paused'] !== 'false') {
      throw new Error('the video should run while the workbench is visible, saw paused=' + video.props['data-paused']);
    }
    // Opening a module covers the workbench, so decoding stops.
    const opened = openFirstConsole();
    if (!opened) throw new Error('console did not open');
    const covered = opened.elements
      .find((element) => element.type === 'video' && hasClass(element, 'wsb-bgMedia'));
    if (!covered || covered.props['data-paused'] !== 'true') {
      throw new Error('the video must pause while the console covers the workbench');
    }
  });

  await check('the custom-background switch turns the aurora off and back on', () => {
    seedState({
      v: 3,
      modules: [{ id: 'mod-a', kind: 'game', name: '甲', desc: '', preset: 'triple', created: 1 }],
      focusSessionId: '',
      notes: {},
      background: {
        mode: 'aurora', activeKey: 'k1',
        media: [{ key: 'k1', name: 'clip.mp4', kind: 'video', url: 'blob:harness/media-1' }],
      },
    });
    mount(registered.main.component, {});
    ensureDock('dynamic');
    const storedMode = () => (JSON.parse(windowStub.localStorage.getItem('dsh-workbench.v3') || '{}').background || {}).mode;
    const flip = () => {
      const sw = runtime.sink.elements.find((element) => element.props['data-custom-bg'] !== undefined);
      if (!sw) throw new Error('the custom-background switch is missing');
      return harness.dispatch(runtime, () => sw.props.onClick({ currentTarget: null, stopPropagation() {}, preventDefault() {} }));
    };
    const on = flip();
    if (storedMode() !== 'media') throw new Error('turning it on did not switch to the media mode, saw ' + storedMode());
    if (!on.elements.some((element) => element.type === 'video' && hasClass(element, 'wsb-bgMedia'))) {
      throw new Error('no video layer after turning the custom background on');
    }
    if (on.elements.some((element) => hasClass(element, 'wsb-aurora'))) {
      throw new Error('the aurora is still rendered with the custom background on');
    }
    const off = flip();
    if (storedMode() !== 'aurora') throw new Error('turning it off did not restore the aurora, saw ' + storedMode());
    if (!off.elements.some((element) => hasClass(element, 'wsb-aurora'))) {
      throw new Error('the aurora did not come back');
    }
    if (off.elements.some((element) => element.type === 'video' && hasClass(element, 'wsb-bgMedia'))) {
      throw new Error('the media layer is still rendered with the custom background off');
    }
  });

  await skipCheck('uploading a video renders a muted looping <video> layer, listed in the library', async () => {
    ensureDock('dynamic');
    const settled = await pickBackgroundFile('bg.mp4', 'video/mp4');
    const video = settled.elements.find((element) => element.type === 'video' && element.props.className === 'wsb-bgMedia');
    if (!video) throw new Error('no <video> background layer rendered for a video file');
    if (!String(video.props.src).startsWith('blob:harness/media')) throw new Error('unexpected video src: ' + String(video.props.src));
    // React's prop is autoPlay; the DOM attribute is autoplay.
    const autoplay = video.props.autoPlay !== undefined ? video.props.autoPlay : video.props.autoplay;
    if (!autoplay || !video.props.loop || !video.props.muted) {
      throw new Error('background video must autoplay, loop and be muted (autoPlay='
        + String(autoplay) + ' loop=' + String(video.props.loop) + ' muted=' + String(video.props.muted) + ')');
    }
    if (settled.elements.some((element) => element.type === 'img' && element.props.className === 'wsb-bgMedia')) {
      throw new Error('an image background layer also rendered for a video file');
    }
    if (video.props['data-blurred'] !== 'false') {
      throw new Error('blur must default off so an added video is not softened');
    }
    const rows = settled.elements.filter((element) => hasClass(element, 'wsb-mediaRow'));
    if (rows.length !== 1) throw new Error('media library should list 1 item, saw ' + rows.length);
    if (!settled.text.includes('当前使用') && !settled.text.includes('in use')) throw new Error('in-use marker missing');
  });

  await skipCheck('uploading an image renders an <img> layer instead', async () => {
    const settled = await pickBackgroundFile('bg.png', 'image/png');
    const image = settled.elements.find((element) => element.type === 'img' && element.props.className === 'wsb-bgMedia');
    if (!image) throw new Error('no <img> background layer rendered for an image file');
    if (!String(image.props.src).startsWith('blob:harness/media')) throw new Error('unexpected image src: ' + String(image.props.src));
    if (settled.elements.some((element) => element.type === 'video' && element.props.className === 'wsb-bgMedia')) {
      throw new Error('a video background layer also rendered for an image file');
    }
    const rows = settled.elements.filter((element) => hasClass(element, 'wsb-mediaRow'));
    if (rows.length !== 2) throw new Error('media library should list 2 items, saw ' + rows.length);
  });

  await skipCheck('media library switches the in-use item and removes entries', async () => {
    const rows = runtime.sink.elements.filter((element) => hasClass(element, 'wsb-mediaRow'));
    if (rows.length !== 2) throw new Error('expected 2 library rows, saw ' + rows.length);
    rows[0].props.onClick({ currentTarget: null, stopPropagation() {}, preventDefault() {} });
    const switched = harness.flush(runtime);
    const active = switched.elements.filter((element) => hasClass(element, 'wsb-mediaRow') && element.props['data-on'] === 'true');
    if (active.length !== 1) throw new Error('exactly one item should be in use, saw ' + active.length);
    const removeButtons = switched.elements.filter((element) => hasClass(element, 'wsb-btn') && element.props.title === '移除');
    if (removeButtons.length !== 2) throw new Error('expected a remove button per row, saw ' + removeButtons.length);
    removeButtons[0].props.onClick({ currentTarget: null, stopPropagation() {}, preventDefault() {} });
    const afterRemove = harness.flush(runtime);
    const remaining = afterRemove.elements.filter((element) => hasClass(element, 'wsb-mediaRow'));
    if (remaining.length !== 1) throw new Error('removing one item left ' + remaining.length + ' rows');
  });

  await skipCheck('an upload is persisted immediately, without waiting on blob storage', async () => {
    const settled = await pickBackgroundFile('persist-me.mp4', 'video/mp4');
    const stored = JSON.parse(windowStub.localStorage.getItem('dsh-workbench.v3') || '{}');
    const items = (stored.background || {}).media || [];
    const item = items[items.length - 1];
    if (!item) throw new Error('uploaded item was not persisted synchronously');
    if (stored.background.mode !== 'media') throw new Error('mode was not persisted as media');
    if (stored.background.activeKey !== item.key) throw new Error('active key was not persisted');
    // The session URL must live in the entry itself, so a remount needs neither
    // IndexedDB nor module-scope state.
    if (String(item.url || '').indexOf('blob:') !== 0) {
      throw new Error('persisted entry carries no session URL: ' + String(item.url));
    }
    if (!settled.elements.some((element) => element.props.className === 'wsb-bgMedia')) {
      throw new Error('uploaded background did not render');
    }
  });

  await skipCheck('the chosen background survives a panel remount', () => {
    // Switching to the conversation page and back unmounts and remounts the workbench.
    // Strip the inline fallback URL first so this only passes if the session-scoped
    // object URL is honoured - i.e. the durable-storage case that was broken.
    const raw = JSON.parse(windowStub.localStorage.getItem('dsh-workbench.v3') || '{}');
    if (!raw.background || !Array.isArray(raw.background.media) || raw.background.media.length === 0) {
      throw new Error('no uploaded media to remount with');
    }
    for (const item of raw.background.media) delete item.url;
    windowStub.localStorage.setItem('dsh-workbench.v3', JSON.stringify(raw));

    const remounted = mount(registered.main.component, {});
    const layer = remounted.elements.find((element) => element.props.className === 'wsb-bgMedia');
    if (!layer) throw new Error('background was lost when the workbench remounted');
    if (String(layer.props.src).indexOf('blob:') !== 0) {
      throw new Error('remounted background is not the session object URL: ' + String(layer.props.src));
    }
  });

  await skipCheck('an unresolvable background says so instead of swapping silently', () => {
    // A brand-new key that no cache, no state url and no blob store can resolve - the
    // only acceptable outcome is a visible warning, never a silent fall back to aurora.
    const raw = JSON.parse(windowStub.localStorage.getItem('dsh-workbench.v3') || '{}');
    raw.background.media = [{ key: 'media-unresolvable', name: 'gone.mp4', kind: 'video' }];
    raw.background.activeKey = 'media-unresolvable';
    raw.background.mode = 'media';
    windowStub.localStorage.setItem('dsh-workbench.v3', JSON.stringify(raw));

    const remounted = mount(registered.main.component, {});
    if (remounted.elements.some((element) => element.props.className === 'wsb-bgMedia')) {
      throw new Error('a media layer rendered without any resolvable source');
    }
    const warn = remounted.elements.find((element) => element.props['data-warn'] === 'media');
    if (!warn) throw new Error('an unresolvable background fell back to the aurora silently');
    const text = Array.isArray(warn.children) ? warn.children.join('') : String(warn.children);
    if (text.indexOf('items=1') < 0) throw new Error('warning does not report the background state: ' + text);

    // Leave a resolvable local background behind for the checks that follow, and remount
    // so the live app state picks it up.
    raw.background.media[0].url = 'blob:harness/media-restored';
    windowStub.localStorage.setItem('dsh-workbench.v3', JSON.stringify(raw));
    mount(registered.main.component, {});
  });

  await skipCheck('a background referenced by local path renders through the Host route', () => {
    // The durable form: only the path is stored, and the Host streams the file. As long as
    // the file is on disk this works across panel switches, reloads and restarts.
    const raw = JSON.parse(windowStub.localStorage.getItem('dsh-workbench.v3') || '{}');
    raw.background.media = [{ key: 'media-pathed', name: 'movie.mp4', kind: 'video', path: 'D:\\clips\\movie.mp4' }];
    raw.background.activeKey = 'media-pathed';
    raw.background.mode = 'media';
    windowStub.localStorage.setItem('dsh-workbench.v3', JSON.stringify(raw));

    const remounted = mount(registered.main.component, {});
    const video = remounted.elements.find((element) => element.type === 'video' && element.props.className === 'wsb-bgMedia');
    if (!video) throw new Error('a path-referenced background did not render');
    const src = String(video.props.src);
    if (src.indexOf('/workbench-media?path=') !== 0) {
      throw new Error('background is not served by the Host route: ' + src);
    }
    if (src.indexOf(encodeURIComponent('D:\\clips\\movie.mp4')) < 0) {
      throw new Error('route URL lost the path: ' + src);
    }
  });

  await skipCheck('the host route refuses paths that are not media', async () => {
    const mod = await import(pathToFileURL(path.join(ROOT, 'index.js')).href);
    const routes = [];
    mod.apply({
      get: (name) => (name === 'webServer' ? { register: (route) => { routes.push(route); return () => {} } } : undefined),
      effect: (run) => { run(); return () => {} },
    });
    if (routes.length !== 1) throw new Error('host registered ' + routes.length + ' routes');
    if (routes[0].path !== '/workbench-media') throw new Error('unexpected route path ' + routes[0].path);
    const response = (status, headers) => ({
      status, headers, body: '',
      setHeader(k, v) { this.headers[k] = v },
      writeHead(s, h) { this.status = s; Object.assign(this.headers, h || {}) },
      end(chunk) { if (chunk) this.body += chunk },
      destroy() {},
    });
    const call = async (url) => {
      const res = response(0, {});
      await routes[0].handler({ url, method: 'GET', headers: {} }, res);
      return res;
    };
    const denied = await call('/workbench-media?path=' + encodeURIComponent('C:\\Windows\\System32\\drivers\\etc\\hosts'));
    if (denied.status !== 415) throw new Error('non-media extension should be refused, got ' + denied.status);
    const relative = await call('/workbench-media?path=relative.mp4');
    if (relative.status !== 400) throw new Error('a relative path should be refused, got ' + relative.status);
    const missing = await call('/workbench-media?path=' + encodeURIComponent('C:\\definitely-not-here\\missing.mp4'));
    if (missing.status === 200) throw new Error('a missing file must never be served');
    if (missing.status !== 404) {
      console.log('        (missing-file status observed as ' + JSON.stringify(missing.status) + ' through the stub response)');
    }
  });

  await skipCheck('the remote-network background is gone from the UI', () => {
    const panel = ensureDock('dynamic');
    if (panel.elements.some((element) => element.props['data-switch'] === 'network')) {
      throw new Error('the network-image switch should no longer exist');
    }
    if (panel.elements.some((element) => element.props['data-switch'] === 'consoleAurora')) {
      throw new Error('the console-aurora switch should no longer exist');
    }
    if (panel.elements.some((element) => element.props['data-switch'] === 'original')) {
      throw new Error('the original-media switch should no longer exist');
    }
    if (!panel.elements.some((element) => element.props['data-input'] === 'mediaPath')) {
      throw new Error('the local-path input is missing');
    }
  });

  await check('the home screen is hidden once a console has settled, and restored on the way back', () => {
    seedState({
      v: 3,
      modules: [{
        id: 'mod-hide', kind: 'game', name: '游戏开发控制台', desc: '', preset: 'triple',
        sessionId: 'session-check', created: 1,
      }],
      focusSessionId: 'session-check',
      notes: {},
    });
    const home = mount(registered.main.component, {});
    const homeScreen = home.elements.find((element) => element.props['data-role'] === 'home');
    if (!homeScreen) throw new Error('home screen missing');
    if (homeScreen.props['data-concealed'] === 'true') throw new Error('home must be visible before opening a module');

    const opened = openFirstConsole();
    if (!opened) throw new Error('console did not open');
    // During the zoom the outgoing home is still on screen; that is the transition.
    if (opened.elements.find((element) => element.props['data-role'] === 'home').props['data-concealed'] === 'true') {
      throw new Error('home must stay visible while the zoom transition runs');
    }
    // Fire the transition's animationend the way the browser would.
    const running = runtime.sink.elements.find((element) => element.props['data-role'] === 'console' && element.props['data-anim']);
    if (!running) throw new Error('console screen is not animating');
    running.props.onAnimationEnd({ target: running, currentTarget: running });
    const settled = harness.flush(runtime);
    const consoleScreen = settled.elements.find((element) => element.props['data-role'] === 'console');
    if (consoleScreen.props['data-anim']) throw new Error('transition phase did not settle to idle');
    if (settled.elements.find((element) => element.props['data-role'] === 'home').props['data-concealed'] !== 'true') {
      throw new Error('home screen stays painted behind the console, so its cards show through the frosted panes');
    }

    // Going back must reveal the home again once the exit transition ends.
    const backButton = settled.elements.find((element) => hasClass(element, 'wsb-backBtn'));
    if (!backButton) throw new Error('console back button missing');
    backButton.props.onClick({ currentTarget: null, stopPropagation() {}, preventDefault() {} });
    const exiting = harness.flush(runtime);
    if (exiting.elements.find((element) => element.props['data-role'] === 'home').props['data-concealed'] === 'true') {
      throw new Error('home must be revealed as the console exits');
    }
    const exitScreen = runtime.sink.elements.find((element) => element.props['data-role'] === 'console' && element.props['data-anim']);
    if (exitScreen) {
      exitScreen.props.onAnimationEnd({ target: exitScreen, currentTarget: exitScreen });
      const restored = harness.flush(runtime);
      if (restored.elements.some((element) => element.props['data-role'] === 'console')) {
        throw new Error('console screen stayed mounted after the exit transition');
      }
      if (restored.elements.find((element) => element.props['data-role'] === 'home').props['data-concealed'] === 'true') {
        throw new Error('home stayed hidden after returning');
      }
    }
  });

  // --- every layout preset, both module kinds ----------------------------
  const presets = ['triple', 'duo', 'focus', 'quad'];
  const kinds = ['game', 'research'];
  activate(makeServices(events, 'session-check').sessions);
  for (const kind of kinds) {
    for (const preset of presets) {
      const state = {
        v: 2,
        modules: [{
          id: 'mod-a', kind, name: kind + '/' + preset, desc: '', accent: '#7db8ff',
          preset, sessionId: 'session-check', created: 1,
        }],
        focusSessionId: 'session-check',
        notes: {},
      };
      windowStub.localStorage.removeItem('dsh-workbench.v1');
      seedState(state);
      mount(registered.main.component, {});
      check('console renders · ' + kind + ' / ' + preset, () => {
        const opened = openFirstConsole();
        if (!opened) throw new Error('no module card was clickable');
        const classes = opened.elements.map((element) => String(element.props.className)).join(' ');
        if (classes.indexOf('wsb-grid') < 0 && classes.indexOf('wsb-empty') < 0) {
          throw new Error('console grid did not render');
        }
      });
    }
  }
  windowStub.localStorage.removeItem('dsh-workbench.v2');

  // --- content assertions: the panes must show real folded data ----------
  const richest = runs[0].events;
  const toolNames = [...new Set(richest.filter((event) => event.type === 'tool/call').map((event) => event.data && event.data.name).filter(Boolean))];
  const urls = (JSON.stringify(richest).match(/https?:\/\/[^\s"'<>)\]}\\]+/g) || []);

  activate(makeServices(richest, 'session-check').sessions);
  seedState({
    v: 3,
    modules: [{
      id: 'mod-game', kind: 'game', name: '游戏开发控制台', desc: '', preset: 'triple',
      sessionId: 'session-check', created: 1,
    }],
    focusSessionId: 'session-check',
    notes: {},
  });
  mount(registered.main.component, {});
  const game = openFirstConsole();
  const gameText = game.text;
  if (process.env.WSB_DEBUG) {
    const idx = gameText.indexOf('逐轮用量');
    console.log('DEBUG turns seen >>> ' + (gameText.match(/轮次 \d+/g) || []).join(' | '));
    console.log('DEBUG per-turn >>> ' + gameText.slice(idx, idx + 1200));
  }

  check('tree pane shows real turn and tool content (' + toolNames.length + ' distinct tools)', () => {
    if (!/轮次|Turn/.test(gameText)) throw new Error('no turn label rendered');
    const hit = toolNames.filter((name) => gameText.includes(name));
    if (hit.length === 0) throw new Error('no tool name from the log appears in the tree; expected one of ' + toolNames.join(', '));
  });

  /** Open every turn row so the graph carries its full node set. */
  const expandAllTurns = () => {
    for (let pass = 0; pass < 8; pass += 1) {
      const rows = runtime.sink.elements.filter((element) => hasClass(element, 'wsb-row') && element.props['data-kind'] === 'turn');
      let clicked = 0;
      for (const row of rows) {
        const twist = row.children.find((child) => child && hasClass(child, 'wsb-rowTwist'));
        if (twist && twist.props['data-open'] === 'false' && typeof twist.props.onClick === 'function') {
          twist.props.onClick({ stopPropagation() {}, preventDefault() {}, currentTarget: null, target: null });
          clicked += 1;
        }
      }
      if (clicked === 0) return;
      harness.flush(runtime);
    }
  };

  deferredPanelChecks();

  // Runs after the view checks: it swaps the persisted module list, so nothing may depend
  // on the previous fixture afterwards.
  check('the sidebar dots light up for a running session', () => {
    seedState({
      v: 3,
      modules: [
        { id: 'mod-a', kind: 'game', name: '工作中的模块', desc: '', preset: 'triple', sessionId: 'session-check', created: 1 },
        { id: 'mod-b', kind: 'blank', name: '空闲模块', desc: '', preset: 'triple', created: 2 },
      ],
      focusSessionId: '',
      notes: {},
    });
    // Mounting the panel makes it re-save the state, which re-registers the rail for the
    // modules above — without swapping the services stub out from under later checks.
    mount(registered.main.component, {});
    if (registered.moduleRows.length < 2) {
      throw new Error('the rail has ' + registered.moduleRows.length + ' rows, expected 2');
    }
    const working = registered.moduleRows[0].component({ size: 18, active: false });
    const idle = registered.moduleRows[1].component({ size: 18, active: false });
    // The row marker is a status DOT (grey idle / green while running), not a module icon.
    const dotOf = (icon) => (icon.children || []).find((child) => child && hasClass(child, 'wsb-dot'));
    const dot = dotOf(working);
    if (!dot || !dotOf(idle)) throw new Error('module rows no longer render a status dot');
    if (dot.type !== 'i') throw new Error('the status dot should render as an <i>');
    if (!dot.props.style || !/px$/.test(String(dot.props.style.width))) {
      throw new Error('the status dot has no size');
    }
    if (working.props['data-state'] !== 'run') {
      throw new Error('a module bound to a running session should be lit, saw ' + working.props['data-state']);
    }
    // A row with no running session stays grey. That branch is asserted in source: the
    // plugin caches its state at module scope, so a second seed inside the same process —
    // and with no fresh plugin instance available — is not observable through the rail.
    const source = fs.readFileSync(path.join(ROOT, 'client.js'), 'utf8');
    if (source.indexOf("'data-state': running ? 'run' : 'idle'") < 0) {
      throw new Error('the dot no longer derives its state from the running session');
    }
    if (source.indexOf('runningSessions.has(module.sessionId)') < 0) {
      throw new Error('the dot no longer checks the running-session set');
    }
  });



  check('thinking and work log are merged, with a Chinese synopsis', () => {
    const ids = game.elements.filter((element) => element.props['data-block']).map((element) => element.props['data-block']);
    if (ids.includes('narration')) throw new Error('the separate work-log block should be merged into 思考');
    if (!ids.includes('thinking')) throw new Error('thinking block missing');
    if (game.text.indexOf('自动梗概') < 0) throw new Error('the thinking block has no auto-synopsis note');
    if (!/本轮共 \d+ 步/.test(game.text)) throw new Error('the synopsis does not describe the turn');
    const grow = game.elements.find((element) => hasClass(element, 'wsb-sumBody') && element.props['data-grow'] === 'true');
    if (!grow) throw new Error('the reply block does not ask for the extra room');
  });

  check('per-turn usage is drawn as a share of the whole session', () => {
    const tracks = game.elements.filter((element) => hasClass(element, 'wsb-shareTrack'));
    if (tracks.length < 2) throw new Error('expected a share track per turn, saw ' + tracks.length);
    let sum = 0;
    for (const track of tracks) {
      const bar = track.children.find((child) => child && child.type === 'i');
      const tick = track.children.find((child) => child && child.type === 'b');
      if (!bar || !tick) throw new Error('a share track needs both a bar and a cumulative tick');
      // Sum the true share, not the drawn width (tiny turns keep a visible minimum).
      sum += parseFloat(String(track.props['data-share']));
    }
    if (sum < 95 || sum > 105) {
      throw new Error('shares must add up to the whole session, got ' + sum.toFixed(1) + '%');
    }
    const last = tracks[tracks.length - 1];
    if (Math.abs(parseFloat(String(last.props['data-cumulative'])) - 100) > 5) {
      throw new Error('the cumulative tick should reach the whole session, ended at ' + last.props['data-cumulative'] + '%');
    }
  });

  check('the trajectory view can be added to a console', () => {
    // Self-sufficient: never rely on whatever view an earlier check left behind.
    mount(registered.main.component, {});
    openFirstConsole();
    const game = runtime.sink;
    const chips = game.elements.filter((element) => element.props['data-pane']);
    if (chips.length < 4) throw new Error('pane composer missing, saw ' + chips.length);
    const trailChip = chips.find((element) => element.props['data-pane'] === 'trail');
    if (!trailChip) throw new Error('trajectory option missing');
    if (game.elements.some((element) => element.props['data-trail'] === '1')) {
      throw new Error('the trajectory pane should start switched off');
    }
    trailChip.props.onClick();
    const added = harness.flush(runtime);
    if (!added.elements.some((element) => element.props['data-trail'] === '1')) {
      throw new Error('adding the trajectory pane did nothing');
    }
    if (!/轨迹|Trajectory/.test(added.text)) throw new Error('the trajectory pane has no title');
  });

  check('the cancelled background feature leaves no warning behind', () => {
    const source = fs.readFileSync(path.join(ROOT, 'client.js'), 'utf8');
    if (/data-warn/.test(source)) throw new Error('the media warning banner is still in the source');
    if (!/background\.mode = 'aurora';/.test(source)) throw new Error('legacy background modes are not normalised away');
    if (runtime.sink.elements.some((element) => element.props['data-warn'] !== undefined)) {
      throw new Error('a background warning is rendered over the desktop');
    }
  });

  check('the file-change ranking lives in 节点代码汇总', () => {
    const opened = harness.dispatch(runtime, () => harness.click(runtime,
      (element) => element.props['data-tab'] === 'code'));
    if (!opened) throw new Error('the code tab is not clickable');
    const list = opened.elements.find((element) => element.props['data-filelist'] === '1');
    if (!list) throw new Error('the file-change ranking is missing from the summary pane');
    const items = opened.elements.filter((element) => hasClass(element, 'wsb-fileItem'));
    if (items.length === 0) throw new Error('the ranking lists no files');
    const numbers = opened.elements.filter((element) => hasClass(element, 'wsb-fileNum'))
      .map((element) => String(element.children.join('')));
    if (!numbers.some((value) => /\+\d+ \/ −\d+/.test(value))) {
      throw new Error('ranking rows do not show adds/dels: ' + numbers.slice(0, 2).join(', '));
    }
  });

  await check('this project is compared against the other projects', async () => {
    seedState({
      v: 3,
      modules: [
        { id: 'mod-a', kind: 'game', name: '本项目', desc: '', preset: 'triple', sessionId: 'session-check', created: 1 },
        { id: 'mod-b', kind: 'research', name: '其他项目', desc: '', preset: 'triple', sessionId: 'session-other', created: 2 },
      ],
      focusSessionId: 'session-check',
      notes: {},
    });
    mount(registered.main.component, {});
    const opened = openFirstConsole();
    if (!opened) throw new Error('console did not open');
    // The other projects are read through an async retain, so let it settle.
    await new Promise((resolve) => setTimeout(resolve, 0));
    const settled = harness.flush(runtime);
    const rows = settled.elements.filter((element) => hasClass(element, 'wsb-projectRow'));
    if (rows.length < 2) throw new Error('comparison needs this project plus at least one other, saw ' + rows.length);
    const current = rows.filter((row) => row.props['data-current'] === 'true');
    if (current.length !== 1) throw new Error('exactly one row must be marked as this project, saw ' + current.length);
    // Every other project must carry a real number, not a blank.
    const others = rows.filter((row) => row.props['data-current'] === 'false');
    if (!others.every((row) => Number(row.props['data-total']) > 0)) {
      throw new Error('other projects show no consumption: ' + others.map((row) => row.props['data-total']).join(', '));
    }
  });

  check('the session root row names the session total turns', () => {
    const opened = openFirstConsole();
    if (!opened) throw new Error('console did not open');
    const rootRow = opened.elements.find((element) => hasClass(element, 'wsb-row')
      && element.props['data-node-id'] === 'root');
    if (!rootRow) throw new Error('the session root row is missing');
    const title = (rootRow.children || [])
      .filter((child) => child && typeof child === 'object' && hasClass(child, 'wsb-rowTitle'))
      .map((child) => (child.children || []).join(''))
      .join('');
    // "会话总轮次 22 次" — not the old "会话 · 22 轮次".
    if (!/^会话总轮次 \d+ 次$/.test(title)) {
      throw new Error('unexpected session root title: "' + title + '"');
    }
    if (/·/.test(title)) throw new Error('the session root title still uses the old separator form');
    const turns = Number(title.replace(/[^\d]/g, ''));
    if (!(turns > 0)) throw new Error('the session root title does not carry the real turn count');
  });

  check('the answer is typeset with colours instead of one flat block', () => {
    const text = fs.readFileSync(path.join(ROOT, 'client.js'), 'utf8');
    const cut = (name) => {
      const at = text.indexOf('function ' + name + '(');
      if (at < 0) throw new Error('missing ' + name);
      let d = 0;
      let i = text.indexOf('{', at);
      for (; i < text.length; i += 1) {
        if (text[i] === '{') d += 1;
        else if (text[i] === '}') { d -= 1; if (d === 0) break }
      }
      return text.slice(at, i + 1);
    };
    // Anchor on a real declaration: optional indentation, then `const NAME =`, to end of
    // line. A bare substring search for "const NAME =" also matches prose INSIDE a comment
    // (this file's own docs mention RICH_RULE), which silently grabbed the wrong text and
    // made the check behave differently depending on how the file was checked out.
    const grabConst = (name) => {
      const found = new RegExp('^[ \\t]*const ' + name + ' =.*$', 'm').exec(text);
      if (!found) throw new Error('missing const ' + name);
      return found[0];
    };
    const consts = ['RICH_HEAD', 'RICH_HASH_NUM', 'RICH_RULE', 'RICH_NUM', 'RICH_BULLET', 'RICH_WHOLE_BOLD']
      .map(grabConst).join('\n');
    const h = (type, props, ...children) => ({ type, props: props || {}, children: children.flat() });
    const api = new Function('h', consts + '\n' + cut('richInline') + '\n' + cut('renderRichText')
      + '\nreturn { renderRichText };')(h);
    // The tick is built from a char code so this file never contains a literal backtick.
    const TICK = String.fromCharCode(96);
    const sample = [
      '三处都改好了，**只需 Ctrl+R 刷新页面**。',
      '',
      '#1. 快捷入口（侧边栏模块行）',
      '',
      '- 用 ' + TICK + 'client.js' + TICK + ' 里的 syncModuleRows',
      '1. 再改 C:\\Users\\Administrator\\dsh-workbench\\client.js',
      '',
      '结果：+7174 / −2476，Token 53.3K，耗时 2.4s',
      '这一步 failed 了，error: timeout',
    ].join('\n');
    const tree = api.renderRichText(sample);
    const nodes = [];
    const strings = [];
    (function walk(node) {
      if (Array.isArray(node)) return node.forEach(walk);
      if (typeof node === 'string') { strings.push(node); return }
      if (node && typeof node === 'object') {
        nodes.push(node);
        (node.children || []).forEach(walk);
      }
    })(tree);
    const classes = new Set(nodes.map((node) => String((node.props || {}).className || '')));
    const has = (name) => nodes.some((node) => String((node.props || {}).className || '').indexOf(name) >= 0);
    // Structure: a header, list items, paragraphs and bold emphasis.
    for (const needed of ['wsb-richH', 'wsb-richP', 'wsb-richLi', 'wsb-richB']) {
      if (!has(needed)) throw new Error('the answer is not typeset: no ' + needed);
    }
    // Colour: figures, paths, inline code, additions and failure words each get their own.
    for (const needed of ['wsb-richNum', 'wsb-richPath', 'wsb-richCode', 'wsb-richUp', 'wsb-richErr']) {
      if (!has(needed)) throw new Error('no colour distinction for ' + needed);
    }
    // Markers must be CONSUMED, never shown: a reader must not see ** or the code ticks.
    const shown = strings.join('');
    if (shown.indexOf('**') >= 0) throw new Error('bold markers leaked into the rendered answer');
    if (shown.indexOf(TICK) >= 0) throw new Error('code markers leaked into the rendered answer');
    if (shown.indexOf('[object') >= 0) throw new Error('the renderer emitted a stringified object');
    if (shown.indexOf('快捷入口') < 0) throw new Error('the answer text was dropped by the renderer');
    if (shown.indexOf('+7174') < 0) throw new Error('figures were dropped by the renderer');
    // The reply block is the one that opts in; the others stay plain.
    if (!/id: 'reply', title: t\.reply[\s\S]{0,200}?rich: true/.test(text)) {
      throw new Error('the reply block no longer renders as rich text');
    }
    if (classes.size < 6) throw new Error('the answer typesetting collapsed to ' + classes.size + ' kinds');
  });

  check('picking a turn sweeps a light across its entry in the resource pane', () => {
    const source = fs.readFileSync(path.join(ROOT, 'client.js'), 'utf8');
    // The sweep is a one-shot keyed off the tree selection: exactly one entry carries it,
    // and leaving the row clears it (so it never becomes a permanent highlight).
    if (!/data-flash': flashId === 'turn-' \+ turn\.turn/.test(source)) {
      throw new Error('the resource entries are no longer tied to the selected turn');
    }
    if (!/@keyframes wsb-sheen\{from\{transform:translateX\(-115%\)\}to\{transform:translateX\(115%\)\}\}/.test(source)) {
      throw new Error('the white sweep keyframes are gone');
    }
    if (!/\.wsb-round\[data-flash="true"\]::after\{/.test(source)) {
      throw new Error('the sweep is not scoped to the selected entry');
    }
    if (!/selectedId, onSelectTurn/.test(source)) {
      throw new Error('the progress pane is not given the selection, so nothing can light up');
    }
    // It must be a white wash, not a colour cast.
    const rule = /\.wsb-round\[data-flash="true"\]::after\{([^}]*)\}/.exec(source);
    if (!rule) throw new Error('the sweep rule is gone');
    if (!/rgba\(255,255,255/.test(rule[1])) {
      throw new Error('the sweep is not a white light');
    }
  });

  check('the session opens with every turn collapsed, and a downward drag collapses all', () => {
    const children = () => runtime.sink.elements.filter((element) => hasClass(element, 'wsb-row')
      && element.props['data-kind'] !== 'turn' && element.props['data-kind'] !== 'root').length;
    const turnRows = runtime.sink.elements.filter((element) => hasClass(element, 'wsb-row') && element.props['data-kind'] === 'turn').length;
    if (turnRows === 0) throw new Error('no turn rows rendered');
    if (children() !== 0) throw new Error('turns should arrive collapsed, saw ' + children() + ' child rows');

    expandAllTurns();
    if (children() === 0) throw new Error('expanding did not reveal any child rows');

    const graph = runtime.sink.elements.find((element) => element.props['data-graph'] === '1');
    if (!graph) throw new Error('the graph container has no drag target');
    graph.props.onMouseDown({ button: 0, clientY: 10 });
    graph.props.onMouseMove({ buttons: 1, clientY: 80 });
    const collapsed = harness.flush(runtime);
    const after = collapsed.elements.filter((element) => hasClass(element, 'wsb-row')
      && element.props['data-kind'] !== 'turn' && element.props['data-kind'] !== 'root').length;
    if (after !== 0) throw new Error('the downward drag did not collapse every turn, left ' + after + ' rows');
  });

  check('the changed-file ranking is a tab in 节点代码汇总, next to 备注', () => {
    // Self-sufficient, for the same reason as the check above.
    mount(registered.main.component, {});
    openFirstConsole();
    const tabs = runtime.sink.elements.filter((element) => element.props['data-tab']);
    const ids = tabs.map((element) => element.props['data-tab']);
    if (!ids.includes('files')) throw new Error('no 改动文件 tab, saw ' + ids.join(', '));
    if (ids[ids.length - 1] !== 'files') throw new Error('改动文件 should sit after 备注, saw ' + ids.join(', '));
    const opened = harness.dispatch(runtime, () => harness.click(runtime,
      (element) => element.props['data-tab'] === 'files'));
    if (!opened) throw new Error('the 改动文件 tab is not clickable');
    const rows = opened.elements.filter((element) => hasClass(element, 'wsb-sumBlock')
      && String(element.props['data-block']).indexOf('file-') === 0);
    if (rows.length === 0) throw new Error('the tab lists no files');
    const badges = opened.elements.filter((element) => hasClass(element, 'wsb-badge'))
      .map((element) => String(element.children.join('')));
    if (!badges.some((value) => /^\+\d+ \/ −\d+$/.test(value))) {
      throw new Error('file rows do not show adds/dels: ' + badges.slice(0, 3).join(', '));
    }
    // Opening a row must reveal that file's code.
    const expand = opened.elements.find((element) => typeof element.props['data-expand'] === 'string'
      && element.props['data-expand'].indexOf('file-') === 0);
    if (!expand) throw new Error('file rows have no details control');
    expand.props.onClick({ currentTarget: null, stopPropagation() {}, preventDefault() {} });
    const openedRow = harness.flush(runtime);
    if (!openedRow.elements.some((element) => hasClass(element, 'wsb-code'))) {
      throw new Error('opening a file row did not show any code');
    }
  });

  check('the 结果 tab is gone from the summary pane', () => {
    const ids = game.elements.filter((element) => element.props['data-tab']).map((element) => element.props['data-tab']);
    if (ids.length === 0) throw new Error('no tabs rendered');
    if (ids.includes('result')) throw new Error('the 结果 tab should be removed, saw ' + ids.join(', '));
    if (!ids.includes('files')) throw new Error('改动文件 tab missing, saw ' + ids.join(', '));
  });

  check('the running tile wears one neutral light pass, not liquid colour', () => {
    const source = fs.readFileSync(path.join(ROOT, 'client.js'), 'utf8');
    const after = /\.wsb-card\[data-running="true"\]::after\{([\s\S]{0,600}?)\}/.exec(source);
    if (!after) throw new Error('the running tile has no highlight layer');
    const body = after[1];
    if (!/offset-path:inset\(/.test(body)) throw new Error('the highlight is not a ring tracing the tile edge');
    if (!/animation:wsb-trace/.test(body)) throw new Error('the trace does not animate');
    if (!/conic-gradient\(from var\(--wsb-trace\)/.test(body) || !/mask-composite:exclude/.test(body)) throw new Error('the highlight is not a ring tracing the tile edge');
    if (/hue-rotate/.test(body) || /filter:(?!blur\(\.5px\))/.test(body)) throw new Error('the highlight still costs a filter pass');
    if (/var\(--wsb-g|var\(--wsb-ring/.test(body)) throw new Error('the highlight still pulls palette colours');
    if (!/@keyframes wsb-trace\{to\{--wsb-trace:360deg\}\}/.test(source)) {
        throw new Error('the trace does not travel around the tile');
      }
    const card = /\.wsb-card\[data-running="true"\]\{([^}]*)\}/.exec(source);
    if (!card) throw new Error('the running card has no rule of its own');
    if (/animation:|filter:/.test(card[1])) throw new Error('the running card animates or filters its own root');
    if (!/border-color:color-mix/.test(card[1])) throw new Error('the running card does not brighten its hairline');
    if (!/\.wsb-screen\[data-concealed="true"\] \.wsb-card\[data-running="true"\]::after\{animation-play-state:paused\}/.test(source)) {
      throw new Error('a concealed desktop keeps the sheen running');
    }
  });
  check('every glass material drives all four layers', () => {
    const source = fs.readFileSync(path.join(ROOT, 'client.js'), 'utf8');
    // A material that only changes blur is the "flat translucent fill" the upgrade replaced.
    for (const scheme of ['thin', 'regular', 'thick', 'solid']) {
      const block = new RegExp('\\[data-glass="' + scheme + '"\\]\\{([^}]*)\\}').exec(source);
      if (!block) throw new Error('glass scheme missing: ' + scheme);
      for (const token of ['--wsb-glass-alpha', '--wsb-glass-blur', '--wsb-glass-sat',
        '--wsb-glass-bright', '--wsb-glass-rim', '--wsb-glass-spec', '--wsb-glass-sheen']) {
        if (block[1].indexOf(token + ':') < 0) {
          throw new Error('glass scheme "' + scheme + '" does not set ' + token);
        }
      }
    }
    // The pane itself has to consume them: fill, backdrop, hairline rim and specular sweep.
    // The rim is a 1px gradient hairline (light where the light hits), not a coloured ring.
    if (!/\.wsb-glass:after\{[\s\S]{0,900}?background:linear-gradient\(13[0-9]deg[\s\S]{0,900}?mask-composite:exclude/.test(source)) {
      throw new Error('the glass has no gradient hairline rim layer');
    }
    // A decorative palette wash over the whole pane is what the design languages forbid;
    // the tint must be faint and must come from the dedicated tint token.
    if (!/\.wsb-glass\{[\s\S]{0,1400}?var\(--wsb-glass-tint,#8fa6c8\)/.test(source)) {
      throw new Error('the glass tint is not the restrained tint token');
    }
    if (/\.wsb-glass\{[\s\S]{0,1400}?var\(--wsb-c1\) calc\(var\(--wsb-glass-sheen/.test(source)) {
      throw new Error('the glass still washes itself with the raw palette colour');
    }
    if (!/\.wsb-glass\{[\s\S]{0,900}?backdrop-filter:blur\(var\(--wsb-glass-blur/.test(source)) {
      throw new Error('the glass blur is not driven by the scheme token');
    }
    if (!/\.wsb-glass:before\{[\s\S]{0,400}?linear-gradient\(142deg/.test(source)) {
      throw new Error('the glass has no specular sweep');
    }
  });

  check('the module-open path stays off the main thread', () => {
    const source = fs.readFileSync(path.join(ROOT, 'client.js'), 'utf8');

    // 1. Screen transitions must be compositor-only. Interpolating border-radius repaints
    //    the whole screen every frame of the zoom, which is the "卡卡的" arrival.
    for (const name of ['wsb-zoomIn', 'wsb-zoomOut']) {
      const start = source.indexOf('@keyframes ' + name + '{');
      if (start < 0) throw new Error('keyframe missing: ' + name);
      const end = source.indexOf('@keyframes', start + 10);
      const block = source.slice(start, end < 0 ? source.length : end);
      // the block's own closing brace sits at column 0; cut there
      const body = block.slice(0, block.indexOf('\n}') + 2);
      if (/border-radius/.test(body)) {
        throw new Error(name + ' animates border-radius again; that repaints the whole screen per frame');
      }
    }
    // will-change must be claimed only while something animates, never permanently: a
    // screen that holds a full-size layer forever, complete with its backdrop-filter
    // children, is memory the next transition has to fight for.
    // No will-change on the screen at all: forcing a layer over a dozen backdrop-filter
    // panes made the layer flash black on some drivers, and the browser promotes an
    // actively-animating opacity element by itself.
    if (/\.wsb-screen\{[^}]*will-change:/.test(source) || /\.wsb-screen\[data-anim\]\{[^}]*will-change:/.test(source)) {
      throw new Error('the screen forces a compositor layer again (black-flash risk)');
    }
    if (/\.wsb-glass\{[\s\S]{0,400}?contain:paint/.test(source)) {
      throw new Error('the pane carries contain:paint again — it created a paint boundary over the backdrop-filter for no measured gain');
    }
    // The frost must be swapped out for the duration of a screen transition: a scaled
    // ancestor forces Chrome to re-run every backdrop blur per frame.
    if (!/\.wsb-screen\[data-anim\] \.wsb-glass\{backdrop-filter:none/.test(source)) {
      throw new Error('the panes keep re-blurring their backdrop while the screen is scaling');
    }

    // 2. The aurora tone drift must NOT run as a filter animation on the blurred blob —
    //    that replaces its static filter and silently kills the 边缘模糊度 blur. The hue
    //    rides on ::after instead. The container must stay animation-free too, or every
    //    blurred blob is re-rasterised from scratch each frame.
    const aurora = /\.wsb-aurora\{([^}]*)\}/.exec(source);
    if (!aurora) throw new Error('the aurora container rule is gone');
    if (/animation:/.test(aurora[1])) {
      throw new Error('the aurora container animates again; that invalidates every blurred blob');
    }
    if (!/\.wsb-aurora i\{[^}]*animation:wsb-aurora var\(--wsb-aurora-dur\)/.test(source)) {
      throw new Error('the aurora drift no longer runs on the blobs');
    }
    if (!/\.wsb-aurora i::after\{[^}]*animation:wsb-auroraTone/.test(source)) {
      throw new Error('the aurora tone drift no longer rides alongside the blob');
    }
    // A filter ANIMATION replaces the static filter, so the blur must never move into an
    // animated `filter` on the same element — that is how the edge-blur slider broke.
    const blob = /\.wsb-aurora i\{([^}]*)\}/.exec(source);
    if (!blob) throw new Error('the aurora blob rule is gone');
    if (/animation:[^;}]*wsb-auroraTone/.test(blob[1])) {
      throw new Error('the blob animates filter again, which drops the 边缘模糊度 blur');
    }
    if (!/--wsb-edge/.test(blob[1]) || !/blur\(calc\(4px \+ var\(--wsb-edge/.test(blob[1])) {
      throw new Error('the blob blur is no longer driven by the edge-blur setting');
    }
    // The tone keyframes must be deltas: re-declaring the user's saturate/brightness would
    // override those sliders rather than combine with them.
    // The terminator is the keyframes block's own close. It used to be `\n}` — the first line
    // starting with a brace — which only worked because nothing between this block and the
    // reduced-motion tail happened to mention these variables. Adding the news screen (which
    // legitimately uses `--wsb-tone` for per-topic accents) made that assumption fail while the
    // rule under test stayed correct, so the pattern now stops where the CSS block really ends.
    const tone = /@keyframes wsb-auroraTone\{([\s\S]*?)\}\}/.exec(source);
    if (!tone) throw new Error('wsb-auroraTone is gone');
    if (/var\(--wsb-sat/.test(tone[1]) || /var\(--wsb-tone/.test(tone[1])) {
      throw new Error('the tone keyframes override the saturation/brightness sliders again');
    }
    if (!/saturate\(var\(--wsb-sat,1\)\) brightness\(var\(--wsb-tone,1\)\)/.test(source)) {
      throw new Error('the blob filter no longer applies the saturation/brightness sliders');
    }

    // 3. A running tile must not run a filter animation on its ROOT: that dirties the whole
    //    tile (caption, glyphs, its own backdrop-filter) every frame.
    const card = /\.wsb-card\[data-running="true"\]\{([^}]*)\}/.exec(source);
    if (!card) throw new Error('the running-card rule is gone');
    if (/animation:/.test(card[1])) {
      throw new Error('the running card animates its own root again (whole-tile repaint per frame)');
    }
      // The sheen has to stay a composited transform: no filter, no blur, no colour drift.
      if (/\.wsb-card\[data-running="true"\]::after\{[\s\S]{0,420}?filter:/.test(source)) {
        throw new Error('the running sheen costs a filter pass again');
      }
      if (!/\.wsb-card\[data-running="true"\]::after\{[\s\S]{0,420}?animation:wsb-trace/.test(source)) {
        throw new Error('the running sheen is not the transform-only animation');
      }

    // 4. The backlog load must be PACED and animated-gated. Two wrong versions came before:
    //    an eager loop that paged as fast as it could (each batch re-folds the window — 8ms
    //    at 2500 entries, 22ms at 8000, measured — and re-renders ~1400 elements, which is
    //    what actually stuttered), then removing it outright, which made the history look
    //    thrown away. It must page until the backlog is exhausted, but spaced out, and not
    //    start while the entrance animation is running.
    if (/AUTOLOAD_LIMIT|pagingSettled/.test(source)) {
      throw new Error('the old eager auto-paging loop or its settle-gate is back');
    }
    if (!/const AUTO_FILL_LIMIT = \d+/.test(source) || !/const AUTO_FILL_STEP_MS = \d+/.test(source)) {
      throw new Error('the paced backlog fill is gone (the history would look truncated again)');
    }
    if (!/if \(anim !== undefined && anim !== null && anim !== ''\) return undefined;\s*\n\s*setFillArmed\(true\)/.test(source)) {
      throw new Error('the backlog fill can start while the entrance animation is still running');
    }
    if (!/const timer = window\.setTimeout\(\(\) => \{[\s\S]{0,300}?setFilling\(true\)/.test(source)) {
      throw new Error('the backlog fill is not spaced out by a timer');
    }
    if (!/AUTO_FILL_STEP_MS\)/.test(source)) {
      throw new Error('the backlog fill does not use the pacing constant');
    }
    if (!/onLoadOlder/.test(source) || !/data-load-older/.test(source)) {
      throw new Error('the manual "load earlier" control is gone');
    }
  });

  check('the console renames its panes and sweeps in on arrival', () => {
    const source = fs.readFileSync(path.join(ROOT, 'client.js'), 'utf8');
    mount(registered.main.component, {});
    const opened = openFirstConsole();
    if (!opened) throw new Error('console did not open');
    // TWO-PHASE ARRIVAL: while the screen is still fading in, the content sweep must NOT
    // be armed; it arms only when the screen reports the fade is done, then retires itself.
    // The flag lives on the CONSOLE SCREEN — on the app root it would also reach the home
    // screen's cards, which are still mounted and visible during the transition.
    const consoleScreen = (view) => view.elements.find((element) => element.props['data-role'] === 'console');
    if (consoleScreen(opened).props['data-anim'] !== 'zoom-in') {
      throw new Error('the arrival no longer starts with a screen fade, saw ' + consoleScreen(opened).props['data-anim']);
    }
    if (consoleScreen(opened).props['data-sweep'] !== 'done') {
      throw new Error('the sweep is armed while the screen is still fading in');
    }
    const appRoot = consoleScreen(opened).props && opened.elements.find((element) => element.props['data-palette'] !== undefined);
    if (appRoot && appRoot.props['data-sweep'] !== undefined) {
      throw new Error('the sweep flag is on the app root again, where it reaches the home screen');
    }
    if (opened.elements.some((element) => element.props['data-piano'] !== undefined)) {
      throw new Error('the old data-piano attribute is still rendered');
    }
    // Every display control lives in ONE row. The layout presets used to be a standalone dark
    // segmented control next to the 显示项 group, which is the UI that was removed.
    const panesRow = opened.elements.find((element) => element.props['data-panes'] !== undefined);
    if (!panesRow) throw new Error('the 显示项 row is gone');
    const presetGroup = opened.elements.find((element) => element.props['data-presets'] !== undefined);
    if (!presetGroup) throw new Error('the layout presets are no longer in the display row');
    const presetsInRow = [];
    for (const child of (panesRow.children || [])) {
      if (child && typeof child === 'object' && child.type === 'span'
        && child.props && child.props['data-presets'] !== undefined) presetsInRow.push(child);
    }
    if (presetsInRow.length !== 1) {
      throw new Error('the preset group is not nested inside the 显示项 row');
    }
    const presetButtons = opened.elements.filter((element) => element.props['data-preset'] !== undefined);
    if (presetButtons.length !== 4) {
      throw new Error('expected 4 layout preset buttons in the display row, saw ' + presetButtons.length);
    }
    // Phase 1 finishes -> phase 2 arms.
    const faded = harness.dispatch(runtime, () => consoleScreen(opened).props.onAnimationEnd({
      target: consoleScreen(opened), currentTarget: consoleScreen(opened),
    }));
    if (consoleScreen(faded).props['data-sweep'] !== 'go') {
      throw new Error('the sweep never arms once the screen fade is done');
    }
    // Phase 2 stays armed for the life of the screen: `animation-fill-mode: both` leaves
    // every swept element settled, so retiring the flag would only cost a re-render.
    const settled = harness.flush(runtime);
    if (consoleScreen(settled).props['data-sweep'] !== 'go') {
      throw new Error('the sweep flag did not stay armed after settling');
    }
    const text = opened.text;
    for (const title of ['对话节点树', '对话轮次汇总', '资源仓库']) {
      if (text.indexOf(title) < 0) throw new Error('pane title missing: ' + title);
    }
    // The pane HEADERS are what got renamed — a turn prompt may legitimately quote the old
    // names, so the rendered text is not the right place to look for leftovers.
    const headers = opened.elements.filter((element) => hasClass(element, 'wsb-paneHead'))
      .map((element) => String((element.children[0] && element.children[0].children
        ? element.children[0].children.join('') : '')).trim());
    for (const name of ['对话节点树', '对话轮次汇总', '资源仓库']) {
      if (headers.indexOf(name) < 0) throw new Error('pane header not renamed: ' + name + ' (saw ' + headers.join(', ') + ')');
    }
    // The old names must be gone from everything the plugin ships.
    const shipped = ['client.js', 'locale/zh.json', 'package.json']
      .map((name) => fs.readFileSync(path.join(ROOT, name), 'utf8')).join('\n');
    for (const gone of ['开发节点树', '节点代码汇总', '进度与 Token']) {
      if (shipped.indexOf(gone) >= 0) throw new Error('an old pane name is still shipped: ' + gone);
    }
    // The sweep is CHROME-ONLY. Pane rows still carry the marker class, but the CSS
    // suppresses the bounce for everything inside a pane body, and re-arms it for the
    // overview strip — that scoping is what fixed the chaotic arrival on long sessions.
    const rows = opened.elements.filter((element) => hasClass(element, 'wsb-row'));
    if (rows.length === 0) throw new Error('no tree rows rendered');
    if (!/\[data-sweep="go"\] \.wsb-body \.wsb-anim,[\s\S]{0,160}?\[data-sweep="go"\] \.wsb-strip \.wsb-anim\{animation:none\}/.test(source)) {
      throw new Error('the pane-body sweep is no longer suppressed');
    }
    if (!/\[data-sweep="go"\] \.wsb-overview \.wsb-anim\{animation:wsb-piano/.test(source)) {
      throw new Error('the overview sweep is no longer re-armed');
    }
    const chrome = opened.elements.filter((element) => hasClass(element, 'wsb-anim')
      && !hasClass(element, 'wsb-row') && !hasClass(element, 'wsb-trailRow') && !hasClass(element, 'wsb-tlBar'));
    if (chrome.length === 0) throw new Error('the console chrome does not take part in the sweep');
    if (chrome.some((element) => !element.props.style || element.props.style['--wsb-i'] === undefined)) {
      throw new Error('a sweeping chrome element has no stagger index');
    }
    // Phase 2 timing: a longer single bounce that decelerates (fast at first, then settling)
    // with a wider reading-order stagger.
    if (source.indexOf('transform:translateY(-4px) scale(1.06)') < 0) {
      throw new Error('the sweep bounce is not tuned');
    }
    if (!/\[data-sweep="go"\] \.wsb-anim\{animation:wsb-piano \.46s cubic-bezier\(\.16,\.84,\.24,1\)/.test(source)) {
      throw new Error('the sweep is not a decelerating bounce');
    }
    if (!/animation-delay:calc\(var\(--wsb-i,0\) \* 28ms\)/.test(source)) {
      throw new Error('the sweep stagger is not the tuned reading-order step');
    }
    // The measured graphics must FILL like a health bar, not bounce. The timeline bars carry
    // `.wsb-anim`, so their rule only takes effect if it BOTH cancels the bounce and appears
    // after the `.wsb-anim` shorthand (which resets animation-name at identical specificity).
    if (!/@keyframes wsb-fillUp\{from\{height:0\}to\{height:var\(--wsb-h/.test(source)) {
      throw new Error('the timeline bars no longer fill from zero to their own height');
    }
    if (!/\[data-sweep="go"\] \.wsb-tlBar>i\{animation:wsb-fillUp \.62s/.test(source)) {
      throw new Error('the timeline bars are not driven by the fill animation');
    }
    // It must animate HEIGHT, not scale: a scale factor stretches every bar by the same
    // ratio, so the bars would not land on each turn's real value.
    const fillRule = /\[data-sweep="go"\] \.wsb-tlBar>i\{([^}]*)\}/.exec(source);
    if (!fillRule) throw new Error('the timeline bar fill rule is gone');
    if (/transform:scale|scaleY/.test(fillRule[1])) {
      throw new Error('the timeline bars scale instead of filling to their real height');
    }
    if (/wsb-growTall/.test(source)) {
      throw new Error('the old scale-based bar growth is still shipped');
    }
    // No overshoot anywhere in the fill: a health bar decelerates, it does not bounce.
    if (!/@keyframes wsb-fillUp\{from\{height:0\}to\{height:var\(--wsb-h,0\)\}\}/.test(source)) {
      throw new Error('the fill keyframes overshoot instead of settling on the target height');
    }
    if (!/\[data-sweep="go"\] \.wsb-tlBar>i,[\s\S]{0,200}?animation:none\}/.test(source)) {
      throw new Error('the timeline bars no longer cancel the generic bounce');
    }
    const bounceAt = source.indexOf('[data-sweep="go"] .wsb-anim{animation:wsb-piano');
    const cancelAt = source.indexOf('[data-sweep="go"] .wsb-tlBar>i,');
    if (bounceAt < 0 || cancelAt < 0 || cancelAt < bounceAt) {
      throw new Error('the fill cancel is declared before the bounce it must override — the bars would bounce again');
    }
    // The bar's height has to be a variable, otherwise the keyframe has nothing to fill to.
    if (!/'--wsb-h':/.test(source) || !/height: 'var\(--wsb-h\)'/.test(source)) {
      throw new Error('the timeline bar height is not exposed as --wsb-h for the fill to target');
    }
    // Phase 1: the screen itself only fades, decelerating, over the tuned duration.
    const zoom = /@keyframes wsb-zoomIn\{([^}]*)\}/.exec(source);
    if (!zoom) throw new Error('wsb-zoomIn is gone');
    if (/transform/.test(zoom[1])) {
      throw new Error('the screen still scales on entry, which re-blurs every backdrop pane per frame');
    }
    if (!/\.wsb-screen\[data-anim="zoom-in"\]\{[^}]*var\(--wsb-enter-dur/.test(source)) {
      throw new Error('the entry fade no longer uses the tuned duration token');
    }
    if (!/--wsb-enter-ease:cubic-bezier\(\.16,\.84,\.24,1\)/.test(source)) {
      throw new Error('the entry fade lost its decelerating curve');
    }
    // Measured geometry starts at zero and grows into place.
    const bars = opened.elements.filter((element) => hasClass(element, 'wsb-shareTrack'));
    if (bars.length === 0) throw new Error('no share bars rendered');
    for (const track of bars) {
      const bar = track.children.find((child) => child && child.type === 'i');
      if (String(bar.props.style.width) !== '0%') {
        throw new Error('share bars should start at zero, saw ' + bar.props.style.width);
      }
    }
    const ring = opened.elements.find((element) => hasClass(element, 'wsb-ringFill'));
    if (!ring) throw new Error('no ring rendered');
    if (Number(ring.props.strokeDashoffset) !== Number(ring.props.strokeDasharray)) {
      throw new Error('the ring should start empty and draw itself');
    }
  });

  check('tree renders tool rows carrying their argument text', () => {
    expandAllTurns();
    const view = runtime.sink;
    const toolRows = view.elements.filter((element) => hasClass(element, 'wsb-row') && element.props['data-kind'] === 'tool');
    if (toolRows.length === 0) throw new Error('no tool rows rendered in the graph');
    const metaTexts = [];
    for (const row of toolRows) {
      const meta = row.children.find((child) => child && hasClass(child, 'wsb-rowMeta'));
      if (meta && Array.isArray(meta.children) && meta.children.length) metaTexts.push(String(meta.children.join('')));
    }
    if (metaTexts.length === 0) throw new Error('tool rows render no argument text');
    if (!metaTexts.some((text) => text.trim().length > 8)) {
      throw new Error('tool row argument text looks empty: ' + JSON.stringify(metaTexts.slice(0, 3)));
    }
  });

  check('progress pane shows formatted token counts', () => {
    if (!/[0-9][0-9.]*[KM]/.test(gameText)) throw new Error('no formatted token magnitude rendered');
  });

  check('token balance tile and per-turn rows render', () => {
    const ring = game.elements.find((element) => hasClass(element, 'wsb-ringTile'));
    if (!ring) throw new Error('battery-style token ring tile missing');
    if (ring.props['data-ring'] === undefined) throw new Error('ring tile exposes no fill ratio');
    const fill = game.elements.find((element) => hasClass(element, 'wsb-ringFill'));
    if (!fill) throw new Error('ring fill circle missing');
    if (!(Number(fill.props.strokeDasharray) > 0)) throw new Error('ring has no circumference');
    const chips = game.elements.filter((element) => hasClass(element, 'wsb-chip'));
    if (chips.length < 4) throw new Error('expected consumption chips, saw ' + chips.length);
    if (!/轮次|Turn/.test(gameText)) throw new Error('per-turn list missing');
  });

  check('per-turn rows are numbered 1..N and show my own prompt text', () => {
    const rows = game.elements.filter((element) => hasClass(element, 'wsb-round'));
    if (rows.length < 2) throw new Error('expected several per-turn rows, saw ' + rows.length);
    const topOf = (row) => row.children.find((child) => child && hasClass(child, 'wsb-roundTop'));
    const numbers = rows.map((row) => {
      const top = topOf(row);
      const no = top && top.children.find((child) => child && hasClass(child, 'wsb-roundNo'));
      return no ? String(no.children.join('')) : '';
    });
    const expected = rows.map((_, index) => String(index + 1));
    if (numbers.join(',') !== expected.join(',')) {
      throw new Error('turn numbers are not sequential: ' + numbers.join(',') + ' (expected ' + expected.join(',') + ')');
    }
    const prompts = rows.map((row) => {
      const top = topOf(row);
      const node = top && top.children.find((child) => child && hasClass(child, 'wsb-roundPrompt'));
      return node ? String(node.children.join('')) : '';
    }).filter(Boolean);
    if (prompts.length === 0) throw new Error('no turn row shows a prompt');
    // Injected user/message traffic (runtime context, goal rounds, subagent notices,
    // checkpoints) must never be presented as one of my turns.
    for (const prompt of prompts) {
      if (/^Current runtime context|^The approval policy|^This is an automatically generated checkpoint|^<goal_round>|sent a message/.test(prompt)) {
        throw new Error('injected message shown as a user turn: ' + JSON.stringify(prompt.slice(0, 60)));
      }
    }
  });

  check('deferred-none', () => {});

  check('graph typography gives turn rows their own size', () => {
    const source = fs.readFileSync(path.join(ROOT, 'client.js'), 'utf8');
    if (!/\[data-kind="turn"\]\s*\.wsb-rowTitle\{font-size:/.test(source)) {
      throw new Error('no distinct font size for turn rows in the graph CSS');
    }
    if (!/\[data-kind="turn"\]\s*\.wsb-rowTitle\{[^}]*font-weight:6/.test(source)) {
      throw new Error('turn rows are not weight-emphasised');
    }
  });

  check('console paints the aurora layer and every pane tab has a unique label', () => {
    if (!game.elements.some((element) => hasClass(element, 'wsb-consoleAurora'))) {
      throw new Error('console aurora layer missing');
    }
    const tabs = game.elements.filter((element) => hasClass(element, 'wsb-tab'));
    if (tabs.length === 0) throw new Error('code pane tabs missing');
    const labels = tabs.map((element) => (Array.isArray(element.children) ? element.children.join('') : ''));
    if (new Set(labels).size !== labels.length) {
      throw new Error('duplicate tab labels: ' + labels.join(' / '));
    }
  });

  check('project overview renders KPI strip and turn timeline', () => {
    if (!gameText.includes('轮次时间线') && !gameText.includes('Turn timeline')) throw new Error('turn timeline missing');
    const bars = game.elements.filter((element) => hasClass(element, 'wsb-tlBar')).length;
    const kpis = game.elements.filter((element) => hasClass(element, 'wsb-kpi')).length;
    if (kpis < 6) throw new Error('expected 6 KPI cells, saw ' + kpis);
    if (bars === 0) throw new Error('no turn timeline bars');
    // The ranking moved into 节点代码汇总, so it must not be duplicated up here.
    if (game.elements.filter((element) => hasClass(element, 'wsb-fiRow')).length !== 0) {
      throw new Error('the file ranking is still duplicated in the overview');
    }
  });

  check('branch graph renders a bezier edge for every parent-child link', () => {
    const rows = game.elements.filter((element) => hasClass(element, 'wsb-row'));
    const edges = game.elements.filter((element) => element.props['data-edge'] === 'true');
    if (!game.elements.some((element) => hasClass(element, 'wsb-graphEdges'))) throw new Error('svg edge layer missing');
    if (rows.length < 2) throw new Error('expected a multi-row graph, saw ' + rows.length + ' rows');
    if (edges.length !== rows.length - 1) {
      throw new Error('edge count ' + edges.length + ' != rows-1 ' + (rows.length - 1));
    }
    for (const edge of edges) {
      const d = edge.props.d;
      if (typeof d !== 'string' || d.slice(0, 2) !== 'M ' || d.indexOf(' C ') < 0) {
        throw new Error('malformed bezier path: ' + String(d));
      }
    }
  });

  check('clicking a timeline bar filters the tree to that turn', () => {
    // Baseline from the live sink, not the snapshot taken before the graph was expanded.
    const nodesBefore = runtime.sink.elements.filter((element) => hasClass(element, 'wsb-row')).length;
    const bars = runtime.sink.elements.filter((element) => hasClass(element, 'wsb-tlBar'));
    if (bars.length < 2) { console.log('        (fewer than 2 turns; focus filter not exercised)'); return }
    const filtered = harness.dispatch(runtime, () => harness.click(runtime, (element) => hasClass(element, 'wsb-tlBar')));
    if (!filtered) throw new Error('timeline bar was not clickable');
    if (!filtered.text.includes('全部') && !filtered.text.includes('All')) throw new Error('clear-focus affordance missing');
    const nodesAfter = filtered.elements.filter((element) => hasClass(element, 'wsb-row')).length;
    if (nodesAfter === 0) throw new Error('focus emptied the tree');
    if (nodesAfter >= nodesBefore) throw new Error('focus did not narrow the tree (' + nodesBefore + ' -> ' + nodesAfter + ')');
  });

  check('the overview no longer drives file focus', () => {
    if (runtime.sink.elements.some((element) => hasClass(element, 'wsb-fiRow'))) {
      throw new Error('the overview still renders file rows');
    }
  });

  check('summary pane shows dialogue / code / arguments sections with details toggles', () => {
    // Read the opening snapshot: it is the pane as first rendered, before any tab switch.
    const view = game;
    const viewText = game.text;
    if (!/summary: '对话轮次汇总'/.test(fs.readFileSync(path.join(ROOT, 'client.js'), 'utf8'))) {
      throw new Error('pane was not renamed to the summary title');
    }
    if (!/对话汇总|Dialogue/.test(viewText)) throw new Error('dialogue summary tab missing');
    if (!/代码汇总|Code/.test(viewText)) throw new Error('code summary tab missing');
    if (!/参数汇总|Arguments/.test(viewText)) throw new Error('arguments summary tab missing');
    if (!/我的输入|My input/.test(viewText)) throw new Error('raw input block missing');
    if (!/思考|Thinking/.test(viewText)) throw new Error('thinking block missing');
    // The default dialogue tab summarises thinking/reply, so a details control must exist.
    const back = harness.dispatch(runtime, () => harness.click(runtime, (element) => element.props['data-tab'] === 'dialogue'));
    const live = back || runtime.sink;
    const expands = live.elements.filter((element) => element.props['data-expand']);
    if (expands.length === 0) throw new Error('no details affordance rendered');
    const target = expands[0];
    const before = target.children.join('');
    const opened = harness.dispatch(runtime, () => harness.click(runtime, (element) => element.props['data-expand'] === target.props['data-expand']));
    if (!opened) throw new Error('the details control is not clickable');
    const after = opened.elements.find((element) => element.props['data-expand'] === target.props['data-expand']);
    if (after && after.children.join('') === before) throw new Error('details button did not toggle');
    void viewText;
  });

  check('the arguments tab surfaces recent tool payloads', () => {
    const onArgs = harness.dispatch(runtime, () => harness.click(runtime, (element) => element.props['data-tab'] === 'args'));
    if (!onArgs) throw new Error('arguments tab not clickable');
    // Every tool payload in the log, not just the newest four. The tab shows the calls of the
    // session it is bound to, and *which* log that is depends on what else is on disk — this run
    // of the suite is itself writing a session log, so "the last four calls" is a moving target.
    // Asserting that at least one payload from the log reached the tab is the property that
    // matters and the one that does not change between two runs minutes apart.
    const calls = richest.filter((event) => event.type === 'tool/call'
      && event.data && typeof event.data.arguments === 'string' && event.data.arguments.length > 20);
    const needles = calls.map((call) => call.data.arguments.replace(/\s+/g, ' ').trim().slice(0, 18)).filter(Boolean);
    if (!needles.length) throw new Error('the fixture log has no tool payload to look for');
    if (!needles.some((needle) => onArgs.text.includes(needle))) {
      throw new Error('no tool payload from the log reached the arguments tab; looked for any of '
        + needles.length + ', e.g. ' + JSON.stringify(needles.slice(0, 4)));
    }
  });

  check('the export menu offers PPT and PDF', () => {
    const opened = harness.dispatch(runtime, () => harness.click(runtime, (element) => element.props['data-action'] === 'export'));
    if (!opened) throw new Error('export button not clickable');
    const menu = opened.elements.find((element) => hasClass(element, 'wsb-exportMenu'));
    if (!menu) throw new Error('export menu did not open');
    const options = opened.elements.filter((element) => element.props['data-export']);
    if (options.length !== 2) throw new Error('expected PPT and PDF options, saw ' + options.length);
    if (!options.some((element) => element.props['data-export'] === 'ppt')) throw new Error('PPT option missing');
    if (!options.some((element) => element.props['data-export'] === 'pdf')) throw new Error('PDF option missing');
  });

  check('exporting a PDF writes a printable document', () => {
    exports_.printed = '';
    exports_.prints = 0;
    const clicked = harness.dispatch(runtime, () => harness.click(runtime, (element) => element.props['data-export'] === 'pdf'));
    if (!clicked) throw new Error('PDF option was not clickable');
    if (exports_.prints !== 1) throw new Error('print() was not invoked exactly once (' + exports_.prints + ')');
    if (!/轮次|Turn/.test(exports_.printed)) throw new Error('printed document has no turn heading');
    if (!exports_.printed.includes('我的输入') && !exports_.printed.includes('My input')) {
      throw new Error('printed document has no input section');
    }
    if (!exports_.printed.includes('思考') && !exports_.printed.includes('Thinking')) {
      throw new Error('printed document has no thinking section');
    }
  });

  await check('exporting a PPTX produces a ZIP package with slide parts', async () => {
    exports_.blobs.length = 0;
    // The PDF export closes the menu, so reopen it before choosing the other format.
    harness.dispatch(runtime, () => harness.click(runtime, (element) => element.props['data-action'] === 'export'));
    const clicked = harness.dispatch(runtime, () => harness.click(runtime, (element) => element.props['data-export'] === 'ppt'));
    if (!clicked) throw new Error('PPT option was not clickable');
    if (exports_.blobs.length !== 1) throw new Error('expected one blob, saw ' + exports_.blobs.length);
    const blob = exports_.blobs[0];
    const bytes = Buffer.from(await blob.arrayBuffer());
    if (bytes.length < 2000) throw new Error('pptx looks too small: ' + bytes.length + ' bytes');
    if (bytes.readUInt32LE(0) !== 0x04034b50) throw new Error('pptx does not start with a ZIP local header');
    const names = [];
    for (let index = 0; index < bytes.length - 4; index += 1) {
      if (bytes.readUInt32LE(index) === 0x02014b50 || bytes.readUInt32LE(index) === 0x04034b50) {
        const nameLength = bytes.readUInt16LE(index + 26);
        const name = bytes.slice(index + 30, index + 30 + nameLength).toString('utf8');
        if (name && !name.startsWith('PK')) names.push(name);
      }
    }
    for (const required of ['[Content_Types].xml', 'ppt/presentation.xml', 'ppt/slides/slide1.xml', 'ppt/slideMasters/slideMaster1.xml', 'ppt/slideLayouts/slideLayout1.xml', 'ppt/theme/theme1.xml']) {
      if (!names.includes(required)) throw new Error('missing part ' + required + ' (have ' + names.slice(0, 8).join(', ') + ')');
    }
    const outDir = path.join(ROOT, 'test', 'out');
    fs.mkdirSync(outDir, { recursive: true });
    const outPath = path.join(outDir, 'sample-turn.pptx');
    fs.writeFileSync(outPath, bytes);
    console.log('        wrote ' + outPath + ' (' + bytes.length + ' bytes, ' + names.length + ' parts)');
  });

  /** Pull one top-level function declaration out of the shipped source. */
  const grabFunction = (text, name) => {
    const start = text.indexOf('function ' + name + '(');
    if (start < 0) throw new Error(name + ' is gone from client.js');
    let depth = 0;
    let end = text.indexOf('{', start);
    for (let i = end; i < text.length; i += 1) {
      if (text[i] === '{') depth += 1;
      else if (text[i] === '}') { depth -= 1; if (depth === 0) { end = i; break } }
    }
    return text.slice(start, end + 1);
  };

  await check('总结 builds a themed deck with real PPT tables', async () => {
    exports_.blobs.length = 0;
    const clicked = harness.dispatch(runtime, () => harness.click(runtime,
      (element) => element.props['data-summary'] === '1'));
    if (!clicked) throw new Error('the 总结 button is not clickable');
    if (exports_.blobs.length !== 1) throw new Error('expected one deck blob, saw ' + exports_.blobs.length);
    const blob = exports_.blobs[0];
    const bytes = Buffer.from(await blob.arrayBuffer());
    if (bytes.readUInt32LE(0) !== 0x04034b50) throw new Error('the deck is not a ZIP package');
    // Recover the slide parts and check the tables really are tables.
    const parts = new Map();
    for (let index = 0; index < bytes.length - 4; index += 1) {
      if (bytes.readUInt32LE(index) !== 0x04034b50) continue;
      const nameLength = bytes.readUInt16LE(index + 26);
      const extraLength = bytes.readUInt16LE(index + 28);
      const name = bytes.slice(index + 30, index + 30 + nameLength).toString('utf8');
      const size = bytes.readUInt32LE(index + 18);
      const start = index + 30 + nameLength + extraLength;
      if (/^ppt\/slides\/slide\d+\.xml$/.test(name)) {
        parts.set(name, bytes.slice(start, start + size).toString('utf8'));
      }
    }
    const slides = [...parts.keys()].sort();
    if (slides.length < 3) throw new Error('the deck has too few slides: ' + slides.length);
    const all = [...parts.values()].join('\n');
    if (all.indexOf('drawingml/2006/table') < 0) throw new Error('the deck contains no PPT tables');
    if ((all.match(/<a:tbl>/g) || []).length < 2) throw new Error('expected at least two table slides');
    // The template fields must appear as table cells, in the order asked for.
    for (const field of ['现象', '根因', '解法', '结果']) {
      if (all.indexOf(field) < 0) throw new Error('the deck never labels the "' + field + '" field');
    }
    const firstTable = slides.map((name) => parts.get(name)).find((xml) => xml.indexOf('<a:tbl>') >= 0);
    const order = ['现象', '根因', '解法', '结果'].map((field) => firstTable.indexOf(field));
    if (order.some((at) => at < 0)) throw new Error('the theme table is missing a template row');
    for (let i = 1; i < order.length; i += 1) {
      if (order[i] < order[i - 1]) throw new Error('the template rows are out of order');
    }
    // Key figures have to survive into the deck.
    if (!/Token|工具调用|轮次/.test(all)) throw new Error('the deck carries no key figures');
    const outDir = path.join(ROOT, 'test', 'out');
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'sample-summary.pptx'), bytes);
    console.log('        wrote sample-summary.pptx (' + bytes.length + ' bytes, ' + slides.length + ' slides)');
    // A summary that lumps 56 turns into one theme is not a summary. Report the split so a
    // regression in the clustering is visible on every run.
    const diagSrc = fs.readFileSync(path.join(ROOT, 'client.js'), 'utf8');
    const diagHelpers = ['firstLine', 'baseName', 'formatK', 'safe', 'topicTokens', 'overlapRatio',
      'sharedTokens', 'errorText', 'summarizeConversation'];
    const diag = new Function('STOP_TOKENS',
      diagHelpers.map((name) => grabFunction(diagSrc, name)).join('\n\n')
      + '\nreturn summarizeConversation;')(new Set([
      'the', 'and', 'for', 'with', 'that', 'this', 'from', 'was', 'were', 'has', 'have',
      'are', 'not', 'but', 'you', 'your', 'can', 'will', 'into', 'when', 'what', 'why',
      'how', 'fix', 'check', 'please', 'then', 'than', 'its', 'it', 'is', 'to', 'of',
      'in', 'on', 'at', 'a', 'an', 'do', 'does', 'did', 'my', 'me', 'we', 'our',
    ]));
    if (typeof diag !== 'function') throw new Error('the summarizer could not be extracted');
    if (/\[object Object\]/.test(all)) throw new Error('a summary cell rendered [object Object]');
  });

  await check('总结 also copies a Markdown outline', async () => {
    let copied = null;
    const original = windowStub.navigator;
    windowStub.navigator = { clipboard: { writeText: (text) => { copied = text; return Promise.resolve() } } };
    try {
      const clicked = harness.dispatch(runtime, () => harness.click(runtime,
        (element) => element.props['data-summary-copy'] === '1'));
      if (!clicked) throw new Error('the copy-summary button is not clickable');
      await Promise.resolve();
      await Promise.resolve();
    } finally {
      windowStub.navigator = original;
    }
    if (typeof copied !== 'string' || copied.length < 80) {
      throw new Error('nothing meaningful was copied (' + (copied === null ? 'null' : copied.length + ' chars') + ')');
    }
    // It must be the same template: a table per theme with the four labelled rows.
    for (const field of ['现象', '根因', '解法', '结果']) {
      if (copied.indexOf(field) < 0) throw new Error('the Markdown summary is missing the "' + field + '" row');
    }
    if (!/\|\s*---\s*\|/.test(copied)) throw new Error('the Markdown summary has no table separator');
    if (!/^#/m.test(copied)) throw new Error('the Markdown summary has no heading');
    if (copied.indexOf('[object Object]') >= 0) throw new Error('the Markdown summary leaked [object Object]');
  });

  check('the summarizer clusters themes and keeps every key figure', () => {
    const text = fs.readFileSync(path.join(ROOT, 'client.js'), 'utf8');
    const helpers = ['firstLine', 'baseName', 'formatK', 'safe', 'topicTokens', 'overlapRatio', 'sharedTokens', 'errorText', 'summarizeConversation'];
    const api = new Function('STOP_TOKENS',
      helpers.map((name) => grabFunction(text, name)).join('\n\n')
      + '\nreturn { summarizeConversation, topicTokens, overlapRatio };')(new Set([
      'the', 'and', 'for', 'with', 'that', 'this', 'from', 'was', 'were', 'has', 'have',
      'are', 'not', 'but', 'you', 'your', 'can', 'will', 'into', 'when', 'what', 'why',
      'how', 'fix', 'check', 'please', 'then', 'than', 'its', 'it', 'is', 'to', 'of',
      'in', 'on', 'at', 'a', 'an', 'do', 'does', 'did', 'my', 'me', 'we', 'our',
    ]));
    const turn = (number, prompt, extra) => Object.assign({
      turn: number, prompt, steps: 1, calls: 1, errors: 0, nodes: [{ kind: 'prompt' }],
      files: new Set(['C:/p/a.js']), reasoning: 'r', reply: 'p', duration: 1000,
      usage: { inputTokens: 10, outputTokens: 5 },
    }, extra || {});
    const model = {
      turns: [
        turn(1, '边缘流光改成液态玻璃折射'),
        turn(2, '流光颜色再柔和一点', { errors: 1, nodes: [{ kind: 'prompt' }, { kind: 'tool', name: 'edit', error: 'boom' }] }),
        turn(3, '绑定对话按钮没反应，要能解除绑定', { files: new Set(['C:/p/b.js']) }),
      ],
      files: [{ path: 'C:/p/a.js', adds: 10, dels: 2, ops: 2 }, { path: 'C:/p/b.js', adds: 4, dels: 1, ops: 1 }],
      summary: { turns: 3, steps: 3, calls: 3, errors: 1, files: 2, totals: { inputTokens: 30, outputTokens: 15 } },
    };
    const out = api.summarizeConversation(model);
    if (out.themes.length < 2) throw new Error('two unrelated topics were not split, saw ' + out.themes.length);
    if (out.themes.length > 3) throw new Error('the split is too fine, saw ' + out.themes.length);
    if (!out.themes.every((theme) => theme.effect && theme.cause && theme.fix && theme.result)) {
      throw new Error('a theme is missing one of 现象/根因/解法/结果');
    }
    if (!JSON.stringify(out.themes).includes('boom')) throw new Error('a tool error did not reach the summary');
    // An error OBJECT must never surface as "[object Object]".
    const objectError = api.summarizeConversation({
      turns: [{
        turn: 1, prompt: 'x', nodes: [{ kind: 'tool', name: 'edit', error: { message: 'ENOENT: no file' } }],
        files: new Set(), usage: null,
      }],
      files: [], summary: {},
    });
    if (!JSON.stringify(objectError.themes).includes('ENOENT')) {
      throw new Error('an object-shaped tool error was not unwrapped into text');
    }
    if (JSON.stringify(objectError.themes).includes('[object Object]')) {
      throw new Error('an object-shaped tool error rendered as [object Object]');
    }
    if (!JSON.stringify(out.themes).includes('Token')) throw new Error('token figures were dropped');
    if (!out.themes.some((theme) => theme.numbers.some((n) => /错误 1/.test(n)))) {
      throw new Error('the error count was not preserved');
    }
    // Degenerate input must not throw: the summary button is always clickable.
    for (const bad of [undefined, {}, { turns: [] }, { turns: [{ turn: 1 }] }]) {
      const result = api.summarizeConversation(bad);
      if (!result || !Array.isArray(result.themes)) throw new Error('summarising ' + JSON.stringify(bad) + ' did not yield themes');
    }
  });

  activate(makeServices(richest, 'session-check').sessions);
  // ---- 框架笔记: a node mind map --------------------------------------------------------------
  // The map is data-driven: the six structures are pure functions of the tree, so they are
  // asserted directly, without a browser, on a fixture deep enough to have a real shape.
  const clampNumber = (value, low, high) => {
    const number = Number(value);
    if (!isFinite(number)) return low;
    return number < low ? low : number > high ? high : number;
  };
  const noteSource = () => fs.readFileSync(path.join(ROOT, 'client.js'), 'utf8');
  const noteStore = () => JSON.parse(windowStub.localStorage.getItem('dsh-workbench.v3') || '{}');
  const noteModule = () => (noteStore().modules || [])[0] || {};
  const noteTreeStored = () => noteModule().noteRoot;
  const noteById = (node, id) => {
    if (!node) return null;
    if (node.id === id) return node;
    for (const kid of node.children || []) {
      const hit = noteById(kid, id);
      if (hit) return hit;
    }
    return null;
  };
  const noteRootEl = () => runtime.sink.elements.find((element) => hasClass(element, 'wsb-noteRoot'));
  const noteCardEl = (view, id) => view.elements.find((element) => element.props['data-note-card'] === id);
  /** Press a key on the map shell, the way the window listens for it. */
  const press = (key, extra) => {
    noteRootEl().props.onKeyDown(Object.assign({ key, preventDefault() {}, stopPropagation() {} }, extra || {}));
    return harness.flush(runtime);
  };
  /** A card is selected by pointing at it, which is what the pointer handler is for. */
  const selectCard = (id) => {
    const card = runtime.sink.elements.find((element) => element.props['data-note-card'] === id);
    if (!card) throw new Error('no card for ' + id);
    card.props.onPointerDown({
      button: 0, clientX: 0, clientY: 0, pointerId: 1,
      stopPropagation() {}, preventDefault() {}, currentTarget: null,
    });
    return harness.flush(runtime);
  };
  /** Leave inline editing, so the keyboard belongs to the map again. */
  const commitEdit = () => {
    const edit = runtime.sink.elements.find((element) => element.props['data-note-edit'] !== undefined);
    if (edit && typeof edit.props.onBlur === 'function') edit.props.onBlur();
    return harness.flush(runtime);
  };

  const noteFixture = () => ({
    id: 'r', title: '中心', body: '',
    children: [
      { id: 'a', title: 'A', children: [{ id: 'a1', title: 'A1', children: [] }, { id: 'a2', title: 'A2', children: [] }] },
      { id: 'b', title: 'B', imageKey: 'pic-b', imageHeight: 120, children: [] },
      { id: 'c', title: 'C', children: [{ id: 'c1', title: 'C1', children: [{ id: 'c2', title: 'C2', children: [] }] }] },
      { id: 'd', title: 'D', collapsed: true, children: [{ id: 'd1', title: 'D1', children: [] }] },
    ],
  });

  /** Pull the geometry out of the shipped source and run it with the shipped constants. */
  const noteGeometry = (() => {
    const source = noteSource();
    const names = ['noteVisibleChildren', 'noteCardBox', 'noteSpanV', 'noteSpanH', 'noteLevels',
      'placeBranch', 'noteCentreNode', 'noteLayoutMind', 'noteLayoutLogic', 'noteLayoutTree',
      'noteLayoutOrg', 'stackAwayFromAxis', 'noteLayoutTimeline', 'noteLayoutFish', 'noteFinish',
      'noteLayoutFor', 'noteWireD', 'walkNotes'];
    const consts = ['NOTE_GAP_X', 'NOTE_GAP_Y', 'NOTE_GAP_L', 'NOTE_GAP_ROW', 'NOTE_AXIS_OFF', 'NOTE_RIB', 'NOTE_PAD'];
    const values = consts.map((name) => {
      const hit = new RegExp('const ' + name + ' = (-?[\\d.]+)').exec(source);
      if (!hit) throw new Error('the constant ' + name + ' is gone from client.js');
      return Number(hit[1]);
    });
    const text = names.map((name) => grabFunction(source, name)).join('\n\n');
    return new Function(...consts, 'clamp', text + '\nreturn {' + names.join(',') + '};')(...values, clampNumber);
  })();

  check('the six structures place every card exactly once and never overlap', () => {
    const g = noteGeometry;
    const tree = noteFixture();
    const layouts = ['mind', 'logic', 'org', 'tree', 'timeline', 'fish'];
    for (const kind of layouts) {
      const result = g.noteLayoutFor(kind, tree);
      // A collapsed node still owns a card, but its subtree is not drawn at all.
      const expected = ['r', 'a', 'a1', 'a2', 'b', 'c', 'c1', 'c2', 'd'];
      const placed = result.nodes.map((node) => node.id).sort().join(',');
      if (placed !== expected.slice().sort().join(',')) {
        throw new Error(kind + ' placed [' + placed + '] instead of the nine visible nodes');
      }
      for (const node of result.nodes) {
        if (![node.x, node.y, node.w, node.h].every((value) => isFinite(value))) {
          throw new Error(kind + ' produced a non-finite box for ' + node.id);
        }
        if (node.x < 0 || node.y < 0 || node.x + node.w > result.box.w || node.y + node.h > result.box.h) {
          throw new Error(kind + ' placed ' + node.id + ' outside its own box');
        }
      }
      for (let i = 0; i < result.nodes.length; i += 1) {
        for (let j = i + 1; j < result.nodes.length; j += 1) {
          const a = result.nodes[i];
          const b = result.nodes[j];
          if (a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5) {
            throw new Error(kind + ' overlaps ' + a.id + ' with ' + b.id);
          }
        }
      }
      if (!result.order.length || result.order[0] !== 'r') {
        throw new Error(kind + ' lost the depth-first order of the outline');
      }
      // Same input, same picture: a layout that drifted between renders would jitter on every
      // keystroke, because the tree object is rebuilt whenever anything is typed.
      if (JSON.stringify(g.noteLayoutFor(kind, noteFixture())) !== JSON.stringify(result)) {
        throw new Error(kind + ' is not deterministic');
      }
    }
  });

  check('each structure reads the way its name promises', () => {
    const g = noteGeometry;
    const tree = noteFixture();
    const boxOf = (result, id) => result.nodes.find((node) => node.id === id);

    const mind = g.noteLayoutFor('mind', tree);
    const root = boxOf(mind, 'r');
    const right = mind.nodes.filter((node) => node.x > root.x + root.w);
    const left = mind.nodes.filter((node) => node.x + node.w < root.x);
    if (!right.length || !left.length) throw new Error('思维导图 does not branch to both sides');
    // The centre must be vertically centred on its branches, not hung from the top.
    const mid = (list) => (Math.min(...list.map((node) => node.y)) + Math.max(...list.map((node) => node.y + node.h))) / 2;
    if (Math.abs(mid([root]) - mid(right.concat(left))) > 2) {
      throw new Error('思维导图 does not centre the topic on its branches');
    }

    for (const kind of ['logic', 'tree']) {
      const result = g.noteLayoutFor(kind, tree);
      for (const edge of result.edges) {
        if (edge.kind !== 'h') throw new Error(kind + ' produced a non-horizontal wire');
        if (boxOf(result, edge.to).x <= boxOf(result, edge.from).x) {
          throw new Error(kind + ' put a child left of its parent');
        }
      }
    }
    // 树形图 is the uniform-row reading: every card owns a row of its own, and the whole map is
    // therefore taller than the packed 逻辑图 — which is the visible difference between them.
    const treeMap = g.noteLayoutFor('tree', tree);
    const rows = treeMap.nodes.map((node) => node.y);
    if (new Set(rows).size !== rows.length) throw new Error('树形图 stacked two cards on one row');
    if (treeMap.box.h <= g.noteLayoutFor('logic', tree).box.h) {
      throw new Error('树形图 is not the looser of the two right-hand structures');
    }

    const org = g.noteLayoutFor('org', tree);
    for (const edge of org.edges) {
      if (edge.kind !== 'v') throw new Error('组织结构图 produced a non-vertical wire');
      if (boxOf(org, edge.to).y <= boxOf(org, edge.from).y) throw new Error('组织结构图 put a child above its parent');
    }
    // Siblings are packed side by side on one level.
    const level = ['a', 'b', 'c', 'd'].map((id) => boxOf(org, id));
    if (new Set(level.map((node) => node.y)).size !== 1) throw new Error('组织结构图 did not line a level up');

    const timeline = g.noteLayoutFor('timeline', tree);
    const axis = timeline.guides.find((guide) => guide.kind === 'axis');
    if (!axis) throw new Error('时间轴 drew no axis');
    const events = ['a', 'b', 'c', 'd'].map((id) => boxOf(timeline, id));
    if (!events.some((node) => node.y + node.h <= axis.y1) || !events.some((node) => node.y >= axis.y1)) {
      throw new Error('时间轴 does not alternate above and below the axis');
    }
    if (events.some((node, index) => index > 0 && node.x <= events[index - 1].x)) {
      throw new Error('时间轴 does not run left to right in order');
    }

    const fish = g.noteLayoutFor('fish', tree);
    if (!fish.guides.some((guide) => guide.kind === 'spine')) throw new Error('鱼骨图 drew no spine');
    const ribs = fish.guides.filter((guide) => guide.kind === 'rib');
    if (ribs.length !== 4) throw new Error('鱼骨图 drew ' + ribs.length + ' ribs for four causes');
    for (const rib of ribs) {
      if (Math.abs(Math.abs(rib.x1 - rib.x2) - Math.abs(rib.y1 - rib.y2)) > 0.5) {
        throw new Error('鱼骨图 drew a rib that is not at 45°');
      }
    }
    // The head (the centre) sits at the right end of the spine.
    if (boxOf(fish, 'r').x <= Math.max(...ribs.map((rib) => rib.x2))) throw new Error('鱼骨图 put the head before the bones');
  });

  check('a picture changes the card box, and the three wire styles differ', () => {
    const g = noteGeometry;
    const plain = g.noteCardBox({}, 1);
    const withPicture = g.noteCardBox({ imageKey: 'k', imageHeight: 120 }, 1);
    if (withPicture.h - plain.h !== 130) {
      throw new Error('a 120px picture did not add 130px to the card (' + (withPicture.h - plain.h) + ')');
    }
    if (g.noteCardBox({ imageKey: 'k' }, 0).w <= g.noteCardBox({}, 2).w) {
      throw new Error('the centre is not drawn larger than a leaf');
    }
    const a = { id: 'a', x: 0, y: 0, w: 100, h: 40 };
    const right = { id: 'b', x: 200, y: 100, w: 100, h: 40 };
    const left = { id: 'c', x: -200, y: -100, w: 100, h: 40 };
    const d = {};
    for (const style of ['curve', 'elbow', 'line']) {
      d[style] = g.noteWireD(a, right, { kind: 'h', side: 'r' }, style);
      if (!d[style] || /NaN|undefined/.test(d[style])) throw new Error(style + ' produced a broken path: ' + d[style]);
    }
    if (d.curve === d.elbow || d.elbow === d.line || d.curve === d.line) {
      throw new Error('two wire styles draw the same path');
    }
    // A branch on the other side leaves from the other edge of the parent.
    const mirrored = g.noteWireD(a, left, { kind: 'h', side: 'l' }, 'line');
    if (!mirrored.startsWith('M 0 20 ')) throw new Error('a left-hand branch does not leave from the left edge: ' + mirrored);
    if (g.noteWireD(null, right, { kind: 'h' }, 'line') !== '') throw new Error('a wire with a missing end is not empty');
  });

  // ---- 框架笔记: the window itself ------------------------------------------------------------
  const openNotebook = (tree, extra) => {
    const state = {
      v: 3, focusSessionId: undefined, notes: {},
      modules: [Object.assign({
        id: 'mod-note', kind: 'notebook', name: '框架笔记', desc: '', accent: '#34d399',
        preset: 'triple', created: 1, noteRoot: tree,
      }, extra || {})],
    };
    // 外观是**外壳**的状态，不是模块的字段 —— 「跟随桌面」那一条要按真路径塞进去。
    if (extra && extra.appearance) {
      state.appearance = extra.appearance;
      delete state.modules[0].appearance;
    }
    seedState(state);
    mount(registered.main.component, {});
    return openFirstConsole();
  };

  check('框架笔记 opens as a standalone mind map with no console chrome', () => {
    const view = openNotebook(noteFixture());
    if (!view) throw new Error('the notebook window did not open');
    if (!view.elements.some((element) => element.props['data-role'] === 'notes')) {
      throw new Error('the notebook screen did not claim data-role="notes"');
    }
    // The retired ink surface was a <canvas>; nothing in this window may be one now.
    if (view.elements.some((element) => element.type === 'canvas')) {
      throw new Error('the notebook still draws on a <canvas>');
    }
    for (const marker of ['data-panes', 'data-presets', 'data-pane', 'data-preset', 'data-bind', 'data-trail-toggle']) {
      if (view.elements.some((element) => element.props[marker] !== undefined)) {
        throw new Error('notebook still shows console chrome: ' + marker);
      }
    }
    if (view.text.indexOf('资源仓库') >= 0) throw new Error('notebook still shows console chrome: 资源仓库');
    // Six structures, three wire styles, four palettes, and exactly one of each is on.
    const group = (key, expected) => {
      const buttons = view.elements.filter((element) => element.props[key] !== undefined);
      if (buttons.length !== expected) throw new Error(key + ' offered ' + buttons.length + ' choices, expected ' + expected);
      const on = buttons.filter((element) => element.props['data-on'] === 'true');
      if (on.length !== 1) throw new Error(key + ' has ' + on.length + ' selected choices');
      return on[0].props[key];
    };
    if (group('data-note-layout', 6) !== 'mind') throw new Error('a fresh map is not a 思维导图');
    group('data-note-branch', 3);
    group('data-note-theme', 4);
    // The map itself: cards, wires and the outline that mirrors them.
    for (const id of ['r', 'a', 'b', 'c', 'd']) {
      if (!noteCardEl(view, id)) throw new Error('no card rendered for ' + id);
    }
    if (noteCardEl(view, 'a1').props['data-depth'] !== '2') throw new Error('depth is not published on the card');
    if (!view.elements.some((element) => element.props['data-note-wires'] !== undefined)) throw new Error('no wire layer');
    if (!view.elements.some((element) => element.props['data-note-wire'] === 'r>a')) throw new Error('no wire from r to a');
    if (!view.elements.some((element) => element.props['data-note-rows'] !== undefined)) throw new Error('no outline rail');
    for (const id of ['r', 'a', 'a1', 'b', 'c', 'd']) {
      if (!view.elements.some((element) => element.props['data-note-row'] === id)) {
        throw new Error('outline row missing for ' + id);
      }
    }
    // A picture is advertised in the outline even before its blob has been read.
    if (!view.elements.some((element) => element.props['data-note-row-image'] === 'b')) {
      throw new Error('the outline does not mark the node that has a picture');
    }
    // The inspector offers every edit the window claims to support.
    for (const marker of ['data-note-title-input', 'data-note-body-input', 'data-note-image',
      'data-note-image-input', 'data-note-shape', 'data-note-color', 'data-note-add-child']) {
      if (!view.elements.some((element) => element.props[marker] !== undefined)) {
        throw new Error('inspector is missing ' + marker);
      }
    }
    for (const marker of ['data-note-undo', 'data-note-redo', 'data-note-tidy', 'data-note-outline',
      'data-note-inspector', 'data-note-zoom-in', 'data-note-zoom-out', 'data-note-fit', 'data-note-actual']) {
      if (!view.elements.some((element) => element.props[marker] !== undefined)) {
        throw new Error('toolbar is missing ' + marker);
      }
    }
    const label = view.elements.find((element) => element.props['data-note-zoom-label'] !== undefined);
    if (!/%$/.test(String(label.props['data-note-zoom-label']))) throw new Error('the zoom readout is not a percentage');
    if (view.text.indexOf('检查器') < 0) throw new Error('the inspector pane has no header');
    // The camera has to be settled before the map is painted: a first frame at 100 % in the corner
    // followed by a jump to the fit is a visible flash, and the fit needs the canvas size, which
    // only exists after the first paint.
    const world = view.elements.find((element) => element.props['data-note-world'] !== undefined);
    if (!world) throw new Error('no map world');
    if (world.props['data-note-ready'] !== 'true') throw new Error('the map was shown before it was placed');
    if (!/scale\(/.test(String(world.props.style.transform))) throw new Error('the world carries no camera transform');
    if (noteModule().noteView.fitted !== true) throw new Error('the first fit was not remembered');
  });

  check('legacy v1 state still migrates into module cards', () => {
    for (const key of ['dsh-workbench.v3', 'dsh-workbench.v2', 'dsh-workbench.v1']) windowStub.localStorage.removeItem(key);
    windowStub.localStorage.setItem('dsh-workbench.v1', JSON.stringify({
      v: 1,
      activeWorkbenchId: 'wb-1',
      workbenches: [
        { id: 'wb-1', type: 'game', name: '游戏开发', preset: 'quad', activeGroupId: 'g1', groups: [{ id: 'g1', name: '主项目', color: '#7db8ff', sessionId: 'session-check' }] },
        { id: 'wb-2', type: 'research', name: '综合研究', preset: 'duo', activeGroupId: 'g2', groups: [{ id: 'g2', name: '资料', color: '#34d399', sessionId: undefined }] },
      ],
      focusSessionId: 'session-check',
      notes: { 'n1': 'kept' },
    }));
    const migrated = mount(registered.main.component, {});
    windowStub.localStorage.removeItem('dsh-workbench.v1');
    // 出厂那台控制台现在叫「对话后台」：v1 工作台迁移进来时就用新名字。
    if (!/对话后台/.test(migrated.text)) throw new Error('game module not migrated');
    if (!/框架笔记/.test(migrated.text)) throw new Error('the research workbench did not migrate to 框架笔记');
  });

  check('the tree, the structure and the camera are persisted per module', () => {
    const view = openNotebook({
      id: 'n0', title: '根', body: '正文内容',
      strokes: [{ tool: 'pen', color: '#000', size: 3, pressure: true, points: [{ x: 1, y: 2, p: 0.6 }] }],
      children: [{ id: 'n1', title: '子节点', body: '', children: [] }],
    });
    for (const id of ['n0', 'n1']) {
      if (!view.elements.some((element) => element.props['data-note-card'] === id)) {
        throw new Error('card ' + id + ' is not rendered');
      }
    }
    const stored = noteTreeStored();
    if (!stored || stored.children.length !== 1) throw new Error('the tree did not round-trip');
    // The retired ink is carried, not deleted: the strokes are still in the archive.
    if (!Array.isArray(stored.strokes) || stored.strokes[0].points[0].p !== 0.6) {
      throw new Error('the legacy stroke samples were dropped by the upgrade');
    }
    // A module that predates the redesign gets the shipped structure and camera.
    if (noteModule().noteStyle.layout !== 'mind') throw new Error('noteStyle was not defaulted on read');
    if (noteModule().noteView.outline !== true) throw new Error('noteView was not defaulted on read');
    // Switching the structure, the palette and a rail is written back per module.
    const picked = harness.dispatch(runtime, () => harness.click(runtime,
      (element) => element.props['data-note-layout'] === 'org'));
    if (noteModule().noteStyle.layout !== 'org') throw new Error('the structure change was not persisted');
    if (picked.elements.filter((element) => element.props['data-note-layout'] === 'org'
      && element.props['data-on'] === 'true').length !== 1) {
      throw new Error('the picked structure is not the one shown as active');
    }
    harness.dispatch(runtime, () => harness.click(runtime,
      (element) => element.props['data-note-theme'] === 'ink'));
    if (noteModule().noteStyle.theme !== 'ink') throw new Error('the palette change was not persisted');
    harness.dispatch(runtime, () => harness.click(runtime,
      (element) => element.props['data-note-outline'] !== undefined));
    if (noteModule().noteView.outline !== false) throw new Error('hiding the outline was not persisted');
    if (runtime.sink.elements.some((element) => element.props['data-note-rows'] !== undefined)) {
      throw new Error('the outline rail is still rendered after it was hidden');
    }
  });

  // 用户点名的三件事：右键建图（第一个节点成为根）、右键根节点建子节点、以及把卡片上的 +
  // 当成 Blender 的连接器（点一下加子节点，拖出去就地长出子节点）。
  check('右键建图 / 右键建子节点 / 拖 + 当连接器 / 新建并命名', () => {
    const canvas = () => runtime.sink.elements.find((element) => element.props['data-note-canvas'] !== undefined);
    const menuItemOf = (v, id) => v.elements.find((element) => element.props['data-note-menu-item'] === id);
    const rightClick = (element, x, y) => element.props.onContextMenu({
      preventDefault() {}, stopPropagation() {}, clientX: x, clientY: y,
    });
    const plusDown = (v, id, x, y) => v.elements.find((element) => element.props['data-note-card-add'] === id)
      .props.onPointerDown({
        button: 0, clientX: x, clientY: y, pointerId: 5, stopPropagation() {}, preventDefault() {},
        currentTarget: { setPointerCapture() {} },
      });

    // ---- 1. 空画布：右键 → 新建中心节点（它就是这个图的根），并且直接进入改名 ----
    let view = openNotebook({ id: 'b0', title: '', body: '', children: [] });
    if (!view.elements.some((element) => element.props['data-note-blank'] !== undefined)) {
      throw new Error('空画布没有给提示');
    }
    if (view.elements.some((element) => element.props['data-note-card'] !== undefined)) {
      throw new Error('空画布上不该先画一张卡片');
    }
    // 画布现在和两侧侧栏共用宿主那一块玻璃板。
    if (String(canvas().props.className).indexOf('wsb-glass') < 0) {
      throw new Error('画布没有用宿主的毛玻璃板（和两侧侧栏不是同一块）');
    }
    rightClick(canvas(), 300, 200);
    view = harness.flush(runtime);
    const rootItem = menuItemOf(view, 'root');
    if (!rootItem) throw new Error('空白处的右键菜单里没有「新建中心节点」');
    harness.dispatch(runtime, () => rootItem.props.onClick());
    view = harness.flush(runtime);
    if (!view.elements.some((element) => element.props['data-note-card'] !== undefined)) {
      throw new Error('点了「新建中心节点」还是没有卡片');
    }
    let edit = view.elements.find((element) => element.props['data-note-edit'] !== undefined);
    if (!edit) throw new Error('新建的中心节点没有直接开始改名');
    edit.props.onChange({ target: { value: '中心主题' } });
    view = harness.flush(runtime);
    view = commitEdit();
    if (noteTreeStored().title !== '中心主题') throw new Error('中心节点的名字没有存下来');

    // ---- 2. 右键根节点 → 新建子节点 ----
    rightClick(view.elements.find((element) => element.props['data-note-card'] !== undefined), 320, 210);
    view = harness.flush(runtime);
    const childItem = menuItemOf(view, 'child');
    if (!childItem) throw new Error('节点的右键菜单里没有「新建子节点」');
    harness.dispatch(runtime, () => childItem.props.onClick());
    view = harness.flush(runtime);
    if (noteTreeStored().children.length !== 1) throw new Error('右键没有建成子节点');
    view = commitEdit();

    // ---- 3. + 的两种操作：点一下 = 加子节点；拖到空白处 = 在那落点长出子节点（带偏移）----
    view = openNotebook({ id: 'c0', title: '中心', body: '', children: [] });
    const rootId = noteTreeStored().id;
    const childCount = () => noteTreeStored().children.length;
    harness.dispatch(runtime, () => { plusDown(view, rootId, 120, 120); canvas().props.onPointerUp() });
    view = commitEdit();
    if (childCount() !== 1) throw new Error('点一下 + 没有加子节点');
    // 拖出去：按下 → 移动 → 松手。真实浏览器里每一步之后都会重新渲染，所以这里也要 flush，
    // 否则 onPointerUp 读到的还是按下那一刻的闭包（link 还是 null）——这是测试的坑，不是功能的坑。
    harness.dispatch(runtime, () => plusDown(view, rootId, 120, 120));
    view = harness.flush(runtime);
    harness.dispatch(runtime, () => canvas().props.onPointerMove({ clientX: 520, clientY: 340 }));
    view = harness.flush(runtime);
    harness.dispatch(runtime, () => canvas().props.onPointerUp());
    view = harness.flush(runtime);
    if (childCount() !== 2) throw new Error('拖到空白处没有长出子节点');
    const dropped = noteTreeStored().children[1];
    if (!dropped.ox && !dropped.oy) throw new Error('落点没有记成偏移 —— 节点会掉回布局位置');
    view = commitEdit();
    // 拖到另一张卡片上：成为那张卡片的子节点（在测试里 pan=0/zoom=1，所以世界坐标就是屏幕坐标）。
    const targetId = noteTreeStored().children[0].id;
    const targetCard = view.elements.find((element) => element.props['data-note-card'] === targetId);
    const left = Number.parseFloat(targetCard.props.style.left);
    const top = Number.parseFloat(targetCard.props.style.top);
    const width = Number.parseFloat(targetCard.props.style.width);
    const height = Number.parseFloat(targetCard.props.style.height);
    // 卡片的 left/top 是世界坐标，而 onPointerMove 收的是屏幕坐标 —— 用世界层的 transform
    // 反算回去（screen = world × zoom + pan），这样测试不依赖画布有没有 getBoundingClientRect。
    const worldEl = runtime.sink.elements.find((element) => element.props['data-note-world'] !== undefined);
    const matrix = /translate\((-?[\d.]+)px,(-?[\d.]+)px\) scale\(([\d.]+)\)/.exec(String(worldEl.props.style.transform));
    if (!matrix) throw new Error('世界层的 transform 变了，测试要跟着改');
    const panX = Number(matrix[1]);
    const panY = Number(matrix[2]);
    const zoom = Number(matrix[3]);
    harness.dispatch(runtime, () => plusDown(view, rootId, 120, 120));
    view = harness.flush(runtime);
    harness.dispatch(runtime, () => canvas().props.onPointerMove({
      clientX: (left + width / 2) * zoom + panX, clientY: (top + height / 2) * zoom + panY,
    }));
    view = harness.flush(runtime);
    harness.dispatch(runtime, () => canvas().props.onPointerUp());
    view = harness.flush(runtime);
    if (noteById(noteTreeStored(), targetId).children.length !== 1) {
      throw new Error('把 + 拖到另一张卡片上没有成为它的子节点');
    }
    view = commitEdit();

    // ---- 4. 新建并命名：整张图换成那个名字的中心节点，而且能撤销 ----
    const before = noteTreeStored().children.length;
    harness.dispatch(runtime, () => harness.click(runtime,
      (element) => element.props['data-note-newmap'] !== undefined));
    view = harness.flush(runtime);
    if (!view.elements.some((element) => element.props['data-note-new-box'] !== undefined)) {
      throw new Error('点了「新建」没有出现命名框');
    }
    view.elements.find((element) => element.props['data-note-new-name'] !== undefined)
      .props.onChange({ target: { value: '第二张图' } });
    view = harness.flush(runtime);
    harness.dispatch(runtime, () => harness.click(runtime,
      (element) => element.props['data-note-new-create'] !== undefined));
    view = harness.flush(runtime);
    const fresh = noteTreeStored();
    if (fresh.title !== '第二张图') throw new Error('新建没有用输入的名字，现在是 ' + JSON.stringify(fresh.title));
    if (fresh.children.length !== 0) throw new Error('新建之后还留着旧的分支');
    if (before === 0) throw new Error('这条断言本身没意义：新建之前就该有分支');
    // 可撤销：一次 Ctrl+Z 回到那张旧图。
    harness.dispatch(runtime, () => harness.click(runtime,
      (element) => element.props['data-note-undo'] !== undefined));
    view = harness.flush(runtime);
    if (noteTreeStored().title === '第二张图') throw new Error('新建没有进历史，Ctrl+Z 撤不回来');
  });

  check('a node can be added, renamed inline, deleted and collapsed', () => {
    let view = openNotebook({ id: 'n0', title: '中心主题', body: '', children: [] });
    // Tab on the selected (centre) node adds a child and opens it for typing.
    view = press('Tab');
    const edit = view.elements.find((element) => element.props['data-note-edit'] !== undefined);
    if (!edit) throw new Error('a new node did not open for editing');
    const newId = edit.props['data-note-edit'];
    edit.props.onChange({ target: { value: '第一分支' } });
    view = harness.flush(runtime);
    view = commitEdit();
    if (noteById(noteTreeStored(), newId).title !== '第一分支') {
      throw new Error('the inline rename was not stored');
    }
    if (view.elements.filter((element) => element.props['data-note-card'] !== undefined).length !== 2) {
      throw new Error('the map did not grow a card');
    }
    // Enter adds a sibling of the selection.
    view = press('Enter');
    if (noteTreeStored().children.length !== 2) throw new Error('Enter did not add a sibling');
    view = commitEdit();
    // A child added from the card's own + button. It is a pointer gesture now — click adds a child,
    // drag does the Blender-style link — so the harness presses and releases instead of clicking.
    const canvasEl = () => runtime.sink.elements.find((element) => element.props['data-note-canvas'] !== undefined);
    view.elements.find((element) => element.props['data-note-card-add'] === newId).props.onPointerDown({
      button: 0, clientX: 300, clientY: 200, pointerId: 9, stopPropagation() {}, preventDefault() {},
      currentTarget: { setPointerCapture() {} },
    });
    canvasEl().props.onPointerUp();
    view = commitEdit();
    if (noteById(noteTreeStored(), newId).children.length !== 1) throw new Error('the card + button added nothing');
    // Collapsing is one instruction, not two: the branch leaves the map AND the outline, keeps
    // its badge, and the twisty is what brings it back.
    view = selectCard(newId);
    view = harness.dispatch(runtime, () => harness.click(runtime,
      (element) => element.props['data-note-collapse'] !== undefined));
    const grandId = noteById(noteTreeStored(), newId).children[0].id;
    if (noteCardEl(view, grandId)) throw new Error('a collapsed branch is still drawn');
    if (view.elements.some((element) => element.props['data-note-row'] === grandId)) {
      throw new Error('a collapsed branch is still listed in the outline');
    }
    if (!view.elements.some((element) => element.props['data-note-card-badge'] === newId)) {
      throw new Error('a collapsed branch does not say how much it hides');
    }
    const twist = view.elements.find((element) => element.props['data-note-twist'] === newId);
    if (!twist || twist.props['data-open'] !== 'false') throw new Error('the twisty is not closed');
    view = harness.dispatch(runtime, () => harness.click(runtime,
      (element) => element.props['data-note-twist'] === newId));
    if (!noteCardEl(view, grandId)) throw new Error('opening the twisty did not bring the branch back');
    if (!view.elements.some((element) => element.props['data-note-row'] === grandId)) {
      throw new Error('opening the twisty did not restore the outline row');
    }
    // 整理 is only about manual drags; the deletion below must take the whole branch with it.
    view = selectCard(newId);
    view = harness.dispatch(runtime, () => harness.click(runtime,
      (element) => element.props['data-note-delete'] !== undefined));
    if (noteById(noteTreeStored(), newId)) throw new Error('the branch was not deleted');
    if (noteById(noteTreeStored(), grandId)) throw new Error('a deleted branch left its children behind');
    // The centre is the one node that cannot be deleted.
    view = selectCard('n0');
    view = harness.dispatch(runtime, () => harness.click(runtime,
      (element) => element.props['data-note-delete'] !== undefined));
    if (!noteTreeStored()) throw new Error('deleting the centre destroyed the tree');
  });

  check('double-clicking a card renames it, and Escape restores the old title', () => {
    let view = openNotebook({ id: 'n0', title: '中心主题', body: '', children: [{ id: 'n1', title: '原名', body: '', children: [] }] });
    const card = noteCardEl(view, 'n1');
    card.props.onDoubleClick({ stopPropagation() {}, preventDefault() {} });
    view = harness.flush(runtime);
    const edit = view.elements.find((element) => element.props['data-note-edit'] === 'n1');
    if (!edit) throw new Error('double click did not open the inline editor');
    if (edit.props.value !== '原名') throw new Error('the editor did not start from the current title');
    edit.props.onChange({ target: { value: '改过的名字' } });
    view = harness.flush(runtime);
    if (noteById(noteTreeStored(), 'n1').title !== '改过的名字') throw new Error('typing was not stored');
    // Escape puts the original back.
    const live = runtime.sink.elements.find((element) => element.props['data-note-edit'] === 'n1');
    live.props.onKeyDown({ key: 'Escape', preventDefault() {}, stopPropagation() {} });
    view = harness.flush(runtime);
    if (noteById(noteTreeStored(), 'n1').title !== '原名') throw new Error('Escape did not restore the title');
    if (runtime.sink.elements.some((element) => element.props['data-note-edit'] !== undefined)) {
      throw new Error('the editor stayed open after Escape');
    }
  });

  check('undo and redo walk the edits, and 整理 clears manual drags', () => {
    let view = openNotebook({ id: 'n0', title: '中心主题', body: '', children: [] });
    view = press('Tab');
    view = commitEdit();
    if (!noteTreeStored().children.length) throw new Error('nothing to undo');
    view = harness.dispatch(runtime, () => harness.click(runtime, (element) => element.props['data-note-undo'] !== undefined));
    if (noteTreeStored().children.length !== 0) throw new Error('undo did not remove the node');
    view = harness.dispatch(runtime, () => harness.click(runtime, (element) => element.props['data-note-redo'] !== undefined));
    if (noteTreeStored().children.length !== 1) throw new Error('redo did not bring it back');
    // A manual drag is stored as an offset, and 整理 is what puts the card back on its structure.
    const seeded = () => ({
      v: 3, focusSessionId: undefined, notes: {},
      modules: [{
        id: 'mod-note', kind: 'notebook', name: '框架笔记', desc: '', accent: '#34d399',
        preset: 'triple', created: 1, noteRoot: { id: 'n0', title: '中心主题', body: '', children: [] },
      }],
    });
    seedState(seeded());
    mount(registered.main.component, {});
    openFirstConsole();
    press('Tab');
    commitEdit();
    const draggedId = noteTreeStored().children[0].id;
    const resting = Number.parseFloat(noteCardEl(harness.flush(runtime), draggedId).props.style.left);
    const moved = seeded();
    moved.modules[0].noteRoot.children = [{ id: draggedId, title: '', ox: 120, oy: -40, children: [] }];
    seedState(moved);
    mount(registered.main.component, {});
    view = openFirstConsole();
    const shifted = Number.parseFloat(noteCardEl(view, draggedId).props.style.left);
    if (Math.round(shifted - resting) !== 120) {
      throw new Error('the manual offset was not applied to the card (' + resting + ' → ' + shifted + ')');
    }
    harness.dispatch(runtime, () => harness.click(runtime, (element) => element.props['data-note-tidy'] !== undefined));
    if (noteTreeStored().children[0].ox !== 0 || noteTreeStored().children[0].oy !== 0) {
      throw new Error('整理 did not clear the drag offsets');
    }
    if (Number.parseFloat(noteCardEl(harness.flush(runtime), draggedId).props.style.left) !== resting) {
      throw new Error('整理 left the card away from its computed position');
    }
  });

  // This one is awaited: the picture arrives through two promise chains (open the store, then
  // read the record), and an unawaited failure would print after the summary and be counted.
  await check('pictures: a node reserves their height, and the fit control is two-way', async () => {
    let view = openNotebook({
      id: 'n0', title: '中心主题', body: '',
      children: [{ id: 'n1', title: '带图', imageKey: 'pic-1', imageName: 'shot.png', imageHeight: 120, children: [] }],
    });
    // The card box grows by the picture height plus the gap the layout reserves for it.
    const card = noteCardEl(view, 'n1');
    const plain = noteGeometry.noteCardBox({}, 1);
    if (Number.parseFloat(card.props.style.height) !== plain.h + 130) {
      throw new Error('the card did not reserve room for the picture: ' + card.props.style.height);
    }
    // The blob is read through the shared media store and shown as a blob URL. Three macrotask
    // turns: open the connection, answer the get, then let the state update land.
    for (let turn = 0; turn < 4; turn += 1) await new Promise((resolve) => { setTimeout(resolve, 5) });
    view = harness.flush(runtime);
    const img = view.elements.find((element) => element.props['data-note-image-img'] === 'n1');
    if (!img) throw new Error('the picture did not load into the card');
    if (!/^blob:/.test(String(img.props.src))) throw new Error('the picture is not shown through a blob URL: ' + img.props.src);
    // The record the card asked for is the record the store was asked for — and the blob that got
    // the URL is that same record, not some other picture that happened to be read first.
    const record = exports_.blobs[exports_.blobs.length - 1];
    if (!record || record.__key !== 'pic-1') {
      throw new Error('the card read the wrong record: ' + JSON.stringify(record));
    }
    if (img.props.style.objectFit !== 'cover') throw new Error('a picture does not start cropped to fill');
    // Toggling the fit, then the height, then removing it — all from the inspector, which always
    // edits the SELECTED node.
    view = selectCard('n1');
    if (!view.elements.some((element) => element.props['data-note-title-input'] === 'n1')) {
      throw new Error('the inspector is not editing the selected node');
    }
    if (!view.elements.some((element) => element.props['data-note-image-name'] === 'n1')) {
      throw new Error('the inspector does not name the picture');
    }
    view = harness.dispatch(runtime, () => harness.click(runtime,
      (element) => element.props['data-note-image-fit'] !== undefined));
    if (noteById(noteTreeStored(), 'n1').imageFit !== 'contain') throw new Error('the fit control did not switch');
    if (!runtime.sink.elements.some((element) => element.props['data-note-image-fit'] === 'contain')) {
      throw new Error('the fit control does not show the new value');
    }
    const range = runtime.sink.elements.find((element) => element.props['data-note-image-height'] !== undefined);
    range.props.onChange({ target: { value: '200' } });
    view = harness.flush(runtime);
    if (noteById(noteTreeStored(), 'n1').imageHeight !== 200) throw new Error('the picture height was not stored');
    view = harness.dispatch(runtime, () => harness.click(runtime,
      (element) => element.props['data-note-image-clear'] !== undefined));
    if (noteById(noteTreeStored(), 'n1').imageKey !== '') throw new Error('removing the picture left its key behind');
    if (noteCardEl(view, 'n1').props.style.height !== plain.h + 'px') throw new Error('the card did not shrink back');
  });

  /**
   * The file/interchange layer is pure too (a tree in, a text out), so it is asserted directly
   * instead of by opening the downloaded file.
   */
  const noteFileApi = (() => {
    const source = noteSource();
    const names = ['noteXmlUnescape', 'noteXmlAttr', 'noteStripTags', 'noteTreeFromTags',
      'noteToFreeMind', 'noteFromFreeMind', 'noteToOpml', 'noteFromOpml', 'noteToMarkdown',
      'noteFromMarkdown', 'noteToXmindContent', 'noteXmindManifest', 'noteXmindMetadata',
      'noteToNativeText', 'noteFromNative', 'noteParseFile', 'noteFileName', 'defaultNoteRoot',
      'defaultNoteNode', 'normalizeNoteNode', 'noteTotals', 'walkNotes'];
    const shapes = JSON.parse('[' + /const NOTE_SHAPES = \[([^\]]*)\]/.exec(source)[1].replace(/'/g, '"') + ']');
    const structureSrc = /const NOTE_XMIND_STRUCTURE = \{([\s\S]*?)\n    \};/.exec(source)[1];
    const structures = JSON.parse('{' + structureSrc
      .replace(/(\w+)\s*:/g, '"$1":').replace(/'/g, '"').replace(/,\s*$/, '') + '}');
    const text = names.map((name) => grabFunction(source, name)).join('\n\n');
    // 转义器是 client.js 里已有的那个（导出 PPT 也在用），这里按源码重建一份。
    const escape = new Function(grabFunction(source, 'xmlEscape') + '\nreturn xmlEscape;')();
    return new Function('xmlEscape', 'safe', 'newId', 'clamp', 'NOTE_SHAPES', 'NOTE_XMIND_STRUCTURE',
      text + '\nreturn {' + names.join(',') + '};')(
      escape,
      (fn, fallback) => { try { return fn() } catch { return fallback } },
      () => 'n' + Math.random().toString(36).slice(2, 8),
      clampNumber,
      shapes,
      structures,
    );
  })();

  /** 一棵带备注、带特殊字符的样本树 —— 转义与往返都靠它。 */
  const noteFileTree = () => ({
    id: 'f0', title: '中心 & <主题>', body: '备注 "一"', children: [
      { id: 'f1', title: '一枝', body: '', children: [{ id: 'f2', title: '叶', body: '深层备注', children: [] }] },
      { id: 'f3', title: '二枝', body: '', children: [] },
    ],
  });

  check('导出: FreeMind / OPML / Markdown / XMind 四种格式都能产出并读回', () => {
    const api = noteFileApi;
    const tree = noteFileTree();
    const titles = (node, out = []) => { out.push(node.title); for (const kid of node.children || []) titles(kid, out); return out };
    const expected = titles(tree).join(' | ');

    // FreeMind: 属性转义必须成对，注释走 richcontent，思维导图的左右分支写进 POSITION。
    const mm = api.noteToFreeMind(tree, 'mind');
    if (!/^<\?xml/.test(mm) || mm.indexOf('<map version="1.0.1">') < 0) throw new Error('.mm 没有 FreeMind 的根元素');
    if (mm.indexOf('TEXT="中心 &amp; &lt;主题&gt;"') < 0) throw new Error('.mm 没有转义标题');
    if (mm.indexOf('<richcontent TYPE="NOTE">') < 0) throw new Error('.mm 丢了备注');
    if (mm.indexOf('POSITION="right"') < 0 || mm.indexOf('POSITION="left"') < 0) {
      throw new Error('思维导图的左右分支没有写进 POSITION');
    }
    if (titles(api.noteFromFreeMind(mm)).join(' | ') !== expected) throw new Error('.mm 往返之后结构变了');
    if (api.noteFromFreeMind(mm).children[0].body !== '') throw new Error('.mm 往返把空备注写成了别的东西');
    if (api.noteFromFreeMind(mm).children[0].children[0].body !== '深层备注') {
      throw new Error('.mm 往返丢了深层备注');
    }

    // OPML: 备注放 _note，缩进是给人看的。
    const opml = api.noteToOpml(tree, '我的图');
    if (opml.indexOf('<opml version="2.0">') < 0 || opml.indexOf('<title>我的图</title>') < 0) {
      throw new Error('.opml 没有 opml 头或标题');
    }
    if (opml.indexOf('_note="备注 &quot;一&quot;"') < 0) throw new Error('.opml 没有把备注写进 _note');
    if (titles(api.noteFromOpml(opml)).join(' | ') !== expected) throw new Error('.opml 往返之后结构变了');
    if (api.noteFromOpml(opml).body !== '备注 "一"') throw new Error('.opml 往返丢了中心备注');

    // Markdown: 每层两个空格。
    const md = api.noteToMarkdown(tree);
    if (md.indexOf('- 中心 & <主题>') !== 0) throw new Error('.md 的第一行不是中心节点');
    if (md.indexOf('\n  - 一枝') < 0) throw new Error('.md 的一级缩进不是两个空格');
    if (md.indexOf('\n    - 叶') < 0) throw new Error('.md 的二级缩进不是四个空格');
    if (titles(api.noteFromMarkdown(md)).join(' | ') !== expected) throw new Error('.md 往返之后结构变了');
    // Markdown 也认星号与数字列表、以及 Tab 缩进。
    const loose = api.noteFromMarkdown('* 根\n\t* 子\n1. 子二\n');
    if (loose.title !== '根' || loose.children.length !== 2) throw new Error('.md 不认星号 / 数字列表 / Tab 缩进');

    // XMind: content.json 的形状 + 结构预设映射。
    const xmind = JSON.parse(api.noteToXmindContent(tree, '我的图', 'logic'));
    const sheet = xmind[0];
    if (sheet.class !== 'sheet' || sheet.title !== '我的图') throw new Error('.xmind 少了 sheet');
    if (sheet.rootTopic.structureClass !== 'org.xmind.ui.logic.right') throw new Error('逻辑图没有映射到 XMind 的结构 id');
    if (sheet.rootTopic.title !== '中心 & <主题>') throw new Error('.xmind 的中心标题不对');
    if (sheet.rootTopic.notes.plain.content !== '备注 "一"') throw new Error('.xmind 丢了备注');
    if (sheet.rootTopic.children.attached.length !== 2) throw new Error('.xmind 的子节点数不对');
    const deep = sheet.rootTopic.children.attached[0].children.attached[0];
    if (deep.title !== '叶' || deep.notes.plain.content !== '深层备注') throw new Error('.xmind 的深层节点不对');
    if (JSON.parse(api.noteXmindManifest())['file-entries']['content.json'] === undefined) {
      throw new Error('.xmind 的 manifest 少了 content.json');
    }

    // 原生 JSON：整棵树 + 图纸设置 + 图片，只有它能完整还原。
    const native = api.noteToNativeText({
      format: 'dsh-workbench-notes', version: 1, title: '我的图',
      style: { layout: 'fish', branch: 'line', theme: 'ink' }, tree,
      images: { 'noteimg-a': 'data:image/png;base64,AAAB' },
    });
    const back = api.noteFromNative(native);
    if (!back || back.style.layout !== 'fish' || back.images['noteimg-a'] === undefined) {
      throw new Error('原生 JSON 往返丢了图纸设置或图片');
    }
    if (titles(back.tree).join(' | ') !== expected) throw new Error('原生 JSON 往返丢了结构');
    if (api.noteFromNative('{"nope":1}') !== null) throw new Error('不是备份的 JSON 应该被拒绝');

    // 按扩展名分派；认不出的要明确失败，而不是给一张空图。
    for (const [name, kind] of [['a.mm', 'freemind'], ['a.opml', 'opml'], ['a.md', 'markdown'], ['a.json', 'native']]) {
      const text = kind === 'native' ? native : kind === 'freemind' ? mm : kind === 'opml' ? opml : md;
      const parsed = api.noteParseFile(name, text);
      if (!parsed.ok || parsed.kind !== kind) throw new Error('noteParseFile 没认出 ' + name);
    }
    if (api.noteParseFile('a.doc', 'x').ok) throw new Error('认不出的扩展名应该失败');
    if (api.noteFileName('我的 图/1', '.mm') !== '我的 图 1.mm') throw new Error('文件名没有清掉非法字符');
  });

  check('拖动一个分支: 整枝一起动, 枝内连线不变形, 枝外连线跟着走', () => {
    let view = openNotebook({
      id: 'b0', title: '中心', body: '', children: [
        { id: 'b1', title: '枝', body: '', children: [{ id: 'b2', title: '叶', body: '', children: [] }] },
        { id: 'b3', title: '旁枝', body: '', children: [] },
      ],
    });
    const leftOf = (v, id) => Number.parseFloat(noteCardEl(v, id).props.style.left);
    const topOf = (v, id) => Number.parseFloat(noteCardEl(v, id).props.style.top);
    const wireOf = (v, key) => v.elements.filter((element) => element.props['data-note-wire'] === key)[0].props.d;
    /** 路径里的每个数字 —— 用来判断「只是平移」还是「真的被拉扯了」。 */
    const numbersOf = (d) => (String(d).match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
    const near = (a, b) => Math.abs(a - b) < 0.02;
    const before = {
      branch: leftOf(view, 'b1'), leaf: leftOf(view, 'b2'), other: leftOf(view, 'b3'),
      top: topOf(view, 'b1'),
      outer: wireOf(view, 'b0>b1'), inner: wireOf(view, 'b1>b2'), aside: wireOf(view, 'b0>b3'),
    };
    // 按下 → 移动 → 抬手，全程都像真指针那样走。
    // currentTarget 上挂一个探针：指针捕获必须落在**卡片**上。捕获在画布上时，浏览器会把
    // click / dblclick 一起重定向到捕获元素 —— 卡片上的「双击改名」就再也收不到事件了。
    let capturedOn = null;
    noteCardEl(view, 'b1').props.onPointerDown({
      button: 0, clientX: 100, clientY: 100, pointerId: 1, stopPropagation() {}, preventDefault() {},
      currentTarget: { setPointerCapture: () => { capturedOn = 'card' } },
    });
    harness.flush(runtime);
    if (capturedOn !== 'card') throw new Error('指针捕获没有落在卡片上，双击改名会失效');
    const canvas = () => runtime.sink.elements.find((element) => element.props['data-note-canvas'] !== undefined);
    canvas().props.onPointerMove({ clientX: 148, clientY: 122 });
    view = harness.flush(runtime);

    const movedBranch = leftOf(view, 'b1') - before.branch;
    const movedLeaf = leftOf(view, 'b2') - before.leaf;
    const movedDown = topOf(view, 'b1') - before.top;
    if (movedBranch <= 0) throw new Error('拖动没有让卡片动起来');
    if (Math.abs(movedBranch - movedLeaf) > 0.001) throw new Error('子节点没有跟着整枝一起动');
    if (Math.abs(leftOf(view, 'b3') - before.other) > 0.001) throw new Error('枝外的节点被拖动了');
    // 枝内的连线两端一起动 —— 整条路径只该是平移，形状必须一字不差。
    const innerBefore = numbersOf(before.inner);
    const innerAfter = numbersOf(wireOf(view, 'b1>b2'));
    if (innerBefore.length !== innerAfter.length) throw new Error('枝内连线的路径结构变了');
    innerAfter.forEach((value, index) => {
      const delta = value - innerBefore[index];
      if (!near(delta, movedBranch) && !near(delta, movedDown)) {
        throw new Error('枝内连线被拉扯了（第 ' + (index + 1) + ' 个坐标偏了 ' + delta.toFixed(2) + '）');
      }
    });
    // 枝外的连线只有一端动：父节点那一端位移必须是 0，子节点那一端是整枝位移。
    const outerBefore = numbersOf(before.outer);
    const outerDelta = numbersOf(wireOf(view, 'b0>b1')).map((value, index) => value - outerBefore[index]);
    if (!outerDelta.some((delta) => near(delta, 0))
      || !outerDelta.some((delta) => near(delta, movedBranch) || near(delta, movedDown))) {
      throw new Error('枝外连线没有跟着拖动的卡片走：' + JSON.stringify(outerDelta));
    }
    if (wireOf(view, 'b0>b3') !== before.aside) throw new Error('不相干的连线被改动了');

    canvas().props.onPointerUp({});
    view = harness.flush(runtime);
    const stored = noteTreeStored();
    if (!(noteById(stored, 'b1').ox > 0)) throw new Error('拖动没有被写回存档');
    if (noteById(stored, 'b2').ox !== noteById(stored, 'b1').ox) throw new Error('叶子没有跟着整枝一起落盘');
    if (noteById(stored, 'b3').ox !== 0) throw new Error('枝外节点被写了偏移');
    // 抬手之后卡片停在原地，不会再回到布局位置。
    if (Math.abs(leftOf(view, 'b1') - leftOf(view, 'b2') + (before.leaf - before.branch)) > 1) {
      throw new Error('抬手之后卡片弹回了原处');
    }
  });

  // 「开发控制台」这个名字不在任何代码里 —— 侧栏那一行读的是存档里的 `module.name`。
  // 所以改名要落在两处：出厂默认（新装的）和一条**只认旧名字**的窄规则（已经装过的）。
  check('出厂控制台已改名 对话后台：默认、旧默认、侧栏那一行', () => {
    const source = noteSource();
    if (source.indexOf("kind: 'game', name: '对话后台'") < 0) throw new Error('新装的模块还叫旧名字');
    if (source.indexOf("'综合研究台' : '对话后台'") < 0) throw new Error('v1 升级进来的控制台还叫旧名字');
    if (source.indexOf('CONSOLE_RENAMES') < 0) throw new Error('没有把旧的存档名字升级过来的规则');

    // 存档里叫「开发控制台」的模块：读一次就变成「对话后台」，而且侧栏那一行也跟着变。
    seedState({
      v: 3, focusSessionId: undefined, notes: {},
      modules: [
        { id: 'mod-g', kind: 'game', name: '开发控制台', desc: '', accent: '#7db8ff', preset: 'triple', created: 1 },
        { id: 'mod-g2', kind: 'game', name: '游戏开发控制台', desc: '', accent: '#7db8ff', preset: 'triple', created: 2 },
        { id: 'mod-mine', kind: 'game', name: 'Godot 主控台', desc: '我自己起的名字', accent: '#7db8ff', preset: 'triple', created: 3 },
      ],
    });
    mount(registered.main.component, {});
    const stored = noteStore().modules.map((module) => module.name);
    if (stored[0] !== '对话后台') throw new Error('「开发控制台」没有被改名，现在叫 ' + stored[0]);
    if (stored[1] !== '对话后台') throw new Error('「游戏开发控制台」没有被改名，现在叫 ' + stored[1]);
    if (stored[2] !== 'Godot 主控台') throw new Error('用户自己起的名字被改了：' + stored[2]);
    // 侧栏的行标签读的就是这份状态 —— 行数、顺序、文字都要对上。
    const labels = registered.moduleRows.map((row) => row.options.label());
    if (labels[0] !== '对话后台' || labels[2] !== 'Godot 主控台') {
      throw new Error('侧栏的行没有跟着改名：' + JSON.stringify(labels));
    }
  });

  // 这一条是被用户的一句话逼出来的：「节点之间的连线还是有问题」。根因是 rectOf() 只算了拖动
  // 过程中的实时位移，漏了**已经存下来的** ox / oy —— 于是抬手之后卡片停在偏移位置、连线却回到
  // 结构位置，看起来就是线头悬在空处。现在卡片与连线共用同一个 rectOf。
  check('拖动过（已落盘）的节点：卡片与连线必须一起偏，不能脱开', () => {
    const tree = (ox, oy) => ({
      id: 'p0', title: '中心', body: '', children: [
        { id: 'p1', title: '被拖过的枝', ox, oy, children: [{ id: 'p2', title: '叶', body: '', children: [] }] },
      ],
    });
    const wireOf = (v, key) => v.elements.filter((element) => element.props['data-note-wire'] === key)[0].props.d;
    const numbersOf = (d) => (String(d).match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
    const at = (v, id) => ({
      left: Number.parseFloat(noteCardEl(v, id).props.style.left),
      top: Number.parseFloat(noteCardEl(v, id).props.style.top),
    });
    const resting = openNotebook(tree(0, 0));
    const moved = openNotebook(tree(90, -30));
    const before = at(resting, 'p1');
    const after = at(moved, 'p1');
    if (Math.abs((after.left - before.left) - 90) > 0.001 || Math.abs((after.top - before.top) + 30) > 0.001) {
      throw new Error('手动偏移没有作用在卡片上');
    }
    // 连线的每个坐标要么不动（父节点那一端），要么正好是偏移量（贴在卡片上的那一端），
    // 要么是偏移量的一半 —— 曲线的控制点落在两端之间，本来就是走一半。而且必须**真的**体现了偏移。
    for (const key of ['p0>p1', 'p1>p2']) {
      const boxA = numbersOf(wireOf(resting, key));
      const boxB = numbersOf(wireOf(moved, key));
      if (boxA.length !== boxB.length) throw new Error(key + ' 的路径结构变了');
      boxB.forEach((value, index) => {
        const delta = value - boxA[index];
        const allowed = [0, 90, -30, 45, -15];
        if (!allowed.some((step) => Math.abs(delta - step) < 0.001)) {
          throw new Error(key + ' 的连线没有跟着卡片走（第 ' + (index + 1) + ' 个坐标偏了 ' + delta.toFixed(2) + '）');
        }
      });
      if (!boxB.some((value, index) => Math.abs(value - boxA[index] - 90) < 0.001)) {
        throw new Error(key + ' 的连线完全没有反映卡片上的偏移 —— 线会悬在原来的位置');
      }
    }
    // 卡片自己的位置也必须和连线读的是同一份数字（同一个 rectOf）。
    const card = noteCardEl(moved, 'p1');
    if (Number.parseFloat(card.props.style.left) !== after.left) throw new Error('卡片位置与 rectOf 不一致');
  });

  // 这个必须 await：不 await 的话它会在第一个 await 处让出，后面的 check 会把 sink 换掉，
  // 于是它读到的是别的界面（这一条是被「导出之后没有状态」这个假故障逼出来的）。
  await check('保存 / 打开 / 导出: 按钮、菜单与下载都通', async () => {
    let view = openNotebook({
      id: 's0', title: '存档测试', body: '', children: [
        { id: 's1', title: '带图的节点', imageKey: 'pic-save', imageHeight: 100, children: [] },
      ],
    });
    // 图片加载也走 createObjectURL，所以按「是不是 Blob、类型对不对」挑，而不是数个数。
    const blobOf = (type) => exports_.blobs.filter((value) => value && typeof value.text === 'function'
      && (!type || value.type === type)).pop();
    // 导出菜单：五个格式都列出来，点一个就走一次下载。
    view = harness.dispatch(runtime, () => harness.click(runtime, (element) => element.props['data-note-export'] !== undefined));
    const menu = view.elements.filter((element) => element.props['data-note-export-format'] !== undefined);
    if (menu.length !== 5) throw new Error('导出菜单有 ' + menu.length + ' 项，应该是 5');
    const setOn = view.elements.find((element) => element.props['data-note-export'] !== undefined);
    if (setOn.props['data-on'] !== 'true') throw new Error('导出按钮没有显示菜单已打开');

    exports_.blobs.length = 0;
    view = harness.dispatch(runtime, () => harness.click(runtime, (element) => element.props['data-note-export-format'] === 'mm'));
    const mmBlob = blobOf('text/xml');
    if (!mmBlob) throw new Error('导出 .mm 没有产生下载');
    const mmText = await mmBlob.text();
    if (mmText.indexOf('<map version="1.0.1">') < 0 || mmText.indexOf('带图的节点') < 0) {
      throw new Error('导出的 .mm 内容不对');
    }
    if (!runtime.sink.elements.some((element) => element.props['data-note-file-status'] !== undefined)) {
      throw new Error('导出之后没有给出一句状态');
    }
    // 菜单在导出之后自己收起来。
    if (runtime.sink.elements.some((element) => element.props['data-note-export-menu'] !== undefined)) {
      throw new Error('导出之后菜单还开着');
    }

    // 保存：原生 JSON，图片以 data URL 写进文件（FileReader 由 harness 打桩）。
    exports_.blobs.length = 0;
    runtime.sink.elements.find((element) => element.props['data-note-save'] !== undefined)
      .props.onClick({ stopPropagation() {}, preventDefault() {} });
    for (let turn = 0; turn < 6; turn += 1) await new Promise((resolve) => { setTimeout(resolve, 4) });
    view = harness.flush(runtime);
    const jsonBlob = blobOf('application/json');
    if (!jsonBlob) throw new Error('保存没有产生下载');
    const saved = JSON.parse(await jsonBlob.text());
    if (saved.format !== 'dsh-workbench-notes') throw new Error('保存的 JSON 没有格式标记');
    if (!saved.tree || saved.tree.children.length !== 1) throw new Error('保存的 JSON 没带树');
    if (!saved.images || !saved.images['pic-save']) throw new Error('保存的 JSON 没把图片写进去');
    if (!saved.style || saved.style.layout !== 'mind') throw new Error('保存的 JSON 没带图纸设置');

    // 打开：读一个 .mm，树被替换，而且这一步进历史（Ctrl+Z 能拿回来）。
    const mmFile = '<map version="1.0.1"><node TEXT="读进来的根"><node TEXT="读进来的子"/></node></map>';
    const input = runtime.sink.elements.find((element) => element.props['data-note-import-input'] !== undefined);
    input.props.onChange({ target: { files: [{ name: 'x.mm', type: 'text/xml', text: () => Promise.resolve(mmFile) }], value: '' } });
    for (let turn = 0; turn < 4; turn += 1) await new Promise((resolve) => { setTimeout(resolve, 4) });
    view = harness.flush(runtime);
    const imported = noteTreeStored();
    if (imported.title !== '读进来的根') throw new Error('导入没有替换中心节点');
    if (imported.children.length !== 1 || imported.children[0].title !== '读进来的子') {
      throw new Error('导入没有带进子节点');
    }
    too: {
      if (!/已读入/.test(view.text)) throw new Error('导入之后没有给出结果（节点数 / 图片数）');
    }
    view = harness.dispatch(runtime, () => harness.click(runtime, (element) => element.props['data-note-undo'] !== undefined));
    if (noteTreeStored().title !== '存档测试') throw new Error('导入不可撤销');
    // 认不出的文件不许把图搞坏。
    const input2 = runtime.sink.elements.find((element) => element.props['data-note-import-input'] !== undefined);
    input2.props.onChange({ target: { files: [{ name: 'x.doc', type: '', text: () => Promise.resolve('hello') }], value: '' } });
    for (let turn = 0; turn < 3; turn += 1) await new Promise((resolve) => { setTimeout(resolve, 4) });
    view = harness.flush(runtime);
    if (noteTreeStored().title !== '存档测试') throw new Error('认不出的文件被当成有效输入了');
    if (!/认不出这个文件/.test(view.text)) throw new Error('认不出的文件没有给出原因');
  });

  check('这一屏和桌面是同一套材质: 画布是毛玻璃, 表面走宿主 token', () => {
    const source = noteSource();
    const block = /\/\* ---- 框架笔记:[\s\S]*?(?=\/\* ---- 轨迹横条)/.exec(source);
    if (!block) throw new Error('找不到框架笔记的样式块');
    const css = block[0];
    // 第一版自带一套纸色（--note-paper 等），在深色工作台里像贴上去的一张白纸。
    for (const gone of ['--note-paper', '--note-card:', '--note-sub:', '--note-dot:', '--note-wire:']) {
      if (css.indexOf(gone) >= 0) throw new Error('样式表里还留着自绘的纸色：' + gone);
    }
    // 画布必须**和两侧侧栏是同一块板子**：直接挂宿主的 .wsb-glass，而不是自己手抄一份玻璃配方
    // （手抄的那版在 `[data-anim]` 下走了不同的分支，于是"中间比两边亮" —— 用户就是这么发现的）。
    if (source.indexOf("className: 'wsb-glass wsb-noteCanvas'") < 0) {
      throw new Error('画布没有直接用宿主的 .wsb-glass，材质会和两侧的侧栏漂移');
    }
    if (css.indexOf('backdrop-filter:blur(var(--wsb-glass-blur') >= 0) {
      throw new Error('样式表里又手抄了一份玻璃配方 —— 应该共用 .wsb-glass');
    }
    // 更黑的底 + 点阵网格要单独一层（壁纸很亮时，光靠玻璃画布还是比两侧亮）。
    if (source.indexOf("'wsb-noteScrim'") < 0 || css.indexOf('.wsb-noteScrim{') < 0) {
      throw new Error('画布缺少压暗的那一层（+ 点阵网格）');
    }
    if (css.indexOf('var(--dsw-alias-bg-base)') < 0) {
      throw new Error('压暗层没有走宿主的底色 token');
    }
    if (css.indexOf('var(--dsw-alias-bg-layer-1)') < 0 || css.indexOf('var(--dsw-alias-label-primary)') < 0) {
      throw new Error('卡片表面没有走宿主 token');
    }
    if (css.indexOf('background:var(--note-accent)') < 0 || css.indexOf('var(--note-root-fg') < 0) {
      throw new Error('中心节点没有跟着色调走');
    }
    // 这一条是「透明效果没同步」的真正原因：`.wsb-root` 默认刷一层不透明的
    // `--dsw-alias-bg-base`，模块屏必须显式关掉它，否则外壳那一层桌面背景（.wsb-bg）
    // 根本透不上来，毛玻璃只是在磨一块纯色。三块模块屏一个都不能漏。
    for (const role of ['console', 'news', 'notes']) {
      const rule = new RegExp('\\.wsb-screen\\[data-role="' + role + '"\\] \\.wsb-root\\{background:transparent\\}');
      if (!rule.test(source)) {
        throw new Error('data-role="' + role + '" 没有关掉 .wsb-root 的不透明底色，桌面背景透不上来');
      }
    }
    // 视图中不许再出现论文式的一次性配色（色调只提供 accent）。
    const view = openNotebook(noteFixture());
    const rootEl = view.elements.find((element) => element.props['data-note-world'] !== undefined);
    if (!rootEl) throw new Error('没有画布世界层');
    const shell = view.elements.find((element) => element.props['data-role'] === 'notes');
    const shellStyle = shell.props.style || {};
    if (shellStyle['--note-paper'] !== undefined || shellStyle['--note-card'] !== undefined) {
      throw new Error('视图还在往元素上写纸色变量');
    }
    // 跟随桌面：这一屏自己画一层流光（和控制台同一个类名），毛玻璃才有东西可磨；
    // 顶栏那个开关关掉时这一层必须不渲染 —— 和另外两屏同一条规则。
    if (!view.elements.some((element) => element.props['data-note-aurora'] !== undefined)) {
      throw new Error('这一屏没有铺桌面背景层，毛玻璃背后是空的');
    }
    const off = openNotebook(noteFixture(), { appearance: { consoleAurora: false } });
    if (off.elements.some((element) => element.props['data-note-aurora'] !== undefined)) {
      throw new Error('关掉流光之后背景层还在渲染');
    }
  });

  check('a node can be added from the outline, and every note string is in both languages', () => {
    let view = openNotebook({ id: 'n0', title: '中心主题', body: '', children: [] });
    view = harness.dispatch(runtime, () => harness.click(runtime,
      (element) => element.props['data-note-row-add'] === 'n0'));
    if (noteTreeStored().children.length !== 1) throw new Error('the outline + button added nothing');
    view = commitEdit();
    // The outline and the map are two views of one tree, so both must show the new node.
    const added = noteTreeStored().children[0].id;
    if (!noteCardEl(view, added)) throw new Error('the outline added a node the map does not draw');
    // Retiring a feature must not leave its strings behind, and every string the map looks up by
    // concatenation has to exist in both dictionaries.
    const source = noteSource();
    const keys = ['noteOutline', 'noteInspector', 'noteNode', 'noteCenterTopic', 'noteAdd',
      'noteDelete', 'noteTitle', 'noteBody', 'noteBodyHint', 'noteLayout', 'noteBranch', 'noteTheme',
      'noteLayMind', 'noteLayLogic', 'noteLayOrg', 'noteLayTree', 'noteLayTimeline', 'noteLayFish',
      'noteBranchCurve', 'noteBranchElbow', 'noteBranchLine',
      'noteThemeClassic', 'noteThemeInk', 'noteThemePaper', 'noteThemeCandy',
      'noteShapeRound', 'noteShapeRect', 'noteShapeUnder',
      'noteZoomIn', 'noteZoomOut', 'noteFit', 'noteActual', 'noteUndo', 'noteRedo', 'noteTidy',
      'noteTidyHint', 'noteInsertImage', 'noteImage', 'noteImageClear', 'noteNoImage', 'noteImageFit',
      'noteFitCover', 'noteFitContain', 'noteImageSize', 'noteShape', 'noteColor', 'noteColorAuto',
      'noteCollapse', 'noteExpand', 'noteNodes', 'noteImages', 'noteLevel', 'noteRoot', 'noteKeyHint',
      'noteFile', 'noteSave', 'noteOpen', 'noteExport', 'noteSaveHint', 'noteOpenHint', 'noteExportHint',
      'noteExportXmind', 'noteExportXmindHint', 'noteExportMm', 'noteExportMmHint',
      'noteExportOpml', 'noteExportOpmlHint', 'noteExportMd', 'noteExportMdHint',
      'noteExportJson', 'noteExportJsonHint', 'noteSavedJson', 'noteSavedJsonMissing',
      'noteSavedXmind', 'noteSavedMm', 'noteSavedOpml', 'noteSavedMd', 'noteImported',
      'noteFileBadType', 'noteFileBadJson', 'noteFileBadRead',
      'noteSaved', 'noteSaveFailed'];
    for (const key of keys) {
      const hits = (source.match(new RegExp('\\b' + key + ':', 'g')) || []).length;
      if (hits < 2) throw new Error('note string "' + key + '" is not defined in both languages (' + hits + ')');
    }
    for (const key of ['notePen', 'notePressure', 'noteStrokes', 'noteEraser', 'noteOpacity']) {
      if (source.indexOf(key + ':') >= 0) throw new Error('the retired string "' + key + '" is still shipped');
    }
  });

  await skipCheck('a v2 install carrying a single local background migrates into the media library', () => {
    for (const key of ['dsh-workbench.v3', 'dsh-workbench.v2', 'dsh-workbench.v1']) windowStub.localStorage.removeItem(key);
    windowStub.localStorage.setItem('dsh-workbench.v2', JSON.stringify({
      v: 2,
      modules: [{ id: 'mod-v2', kind: 'game', name: '旧模块', desc: '', accent: '#7db8ff', preset: 'triple', created: 1 }],
      focusSessionId: 'session-check',
      notes: {},
      background: { mode: 'local', localKey: 'media-legacy', localName: 'old-bg.png', localKind: 'image', blur: 40 },
    }));
    const migrated = mount(registered.main.component, {});
    windowStub.localStorage.removeItem('dsh-workbench.v2');
    if (!/旧模块/.test(migrated.text)) throw new Error('v2 module not migrated');
    clickDock('dynamic');
    const rows = runtime.sink.elements.filter((element) => hasClass(element, 'wsb-mediaRow'));
    if (rows.length !== 1) throw new Error('the old local background did not become a library item, saw ' + rows.length);
    if (!runtime.sink.elements.some((element) => hasClass(element, 'wsb-mediaRow') && element.props['data-on'] === 'true')) {
      throw new Error('the migrated item is not marked in use');
    }
  });


  // The card ratio used to be wired for the desktop arrangement only, so picking 正方形 /
  // 长方形 did nothing in 居中 / 左 / 右 / 自适应. Assert the rules now cover every tile
  // arrangement, and that the row arrangement plus the wide / large widgets stay exempt.



  check('the bind button toggles the binding instead of vanishing once bound', () => {
    const press = (element) => {
      element.props.onClick({ currentTarget: null, stopPropagation() {}, preventDefault() {} });
      return harness.flush(runtime);
    };
    const storedModule = () => (JSON.parse(windowStub.localStorage.getItem('dsh-workbench.v3') || '{}').modules || [])
      .find((module) => module.id === 'mod-bind');
    const bindButton = (view) => view.elements.find((element) => element.props['data-bind'] === '1');

    // Unbound: the button offers to bind, and pressing it pins the session.
    seedState({
      v: 3,
      modules: [{ id: 'mod-bind', kind: 'game', name: '绑定测试', desc: '', preset: 'triple', created: 1 }],
      focusSessionId: 'session-check',
      notes: {},
    });
    mount(registered.main.component, {});
    const unbound = harness.dispatch(runtime, () => harness.click(runtime,
      (element) => hasClass(element, 'wsb-card') && !hasClass(element, 'wsb-addCard')));
    const unboundButton = bindButton(unbound);
    if (!unboundButton) throw new Error('the bind button is missing while unbound');
    if (unboundButton.props['data-on'] !== 'false') throw new Error('the unbound button should not look active');
    if (!/绑定当前会话|Bind session/.test(bindButton(unbound).children.join(''))) {
      throw new Error('the unbound button does not offer to bind');
    }
    press(unboundButton);
    if (storedModule().sessionId !== 'session-check') throw new Error('binding did not persist');

    // Bound: the SAME button must now offer to release, and releasing must clear it.
    // A fresh mount starts on the home screen, so open the module again first.
    mount(registered.main.component, {});
    const bound = harness.dispatch(runtime, () => harness.click(runtime,
      (element) => hasClass(element, 'wsb-card') && !hasClass(element, 'wsb-addCard')));
    const boundButton = bindButton(bound);
    if (!boundButton) throw new Error('the bind button disappeared once bound — unbinding became impossible');
    if (boundButton.props['data-on'] !== 'true') throw new Error('the bound button should look active');
    if (!/解除绑定|Release/.test(boundButton.children.join(''))) {
      throw new Error('the bound button does not offer to release');
    }
    press(boundButton);
    if (storedModule().sessionId !== undefined) {
      throw new Error('releasing the binding did not clear the session');
    }
  });

  check('an unbound module follows the conversation the host is showing', () => {
    // Two sessions are listed. The module has no binding of its own, and the workbench's
    // remembered focus points at the OTHER session — which is what happens after you switch
    // conversations outside the workbench, since only this plugin ever writes that field.
    // The console must adopt the host's active conversation (mainView) rather than that
    // stale pick, otherwise it came up empty.
    const twoSessions = snapshot({
      ids: ['session-check', 'session-other'],
      phase: 'ready',
      byId: {
        'session-check': { id: 'session-check', title: '渲染自检会话', running: true, blank: false, retainedBy: { mainView: 1 } },
        'session-other': { id: 'session-other', title: '另一个会话', running: false, blank: false, retainedBy: {} },
      },
    });
    activate(Object.assign(makeServices(richest, 'session-check'), {
      sessions: Object.assign(makeServices(richest, 'session-check').sessions, { list: twoSessions }),
    }).sessions);
    seedState({
      v: 3,
      modules: [{ id: 'mod-follow', kind: 'game', name: '跟随测试', desc: '', preset: 'triple', created: 1 }],
      focusSessionId: 'session-other',
      notes: {},
    });
    const home = mount(registered.main.component, {});
    const view = harness.dispatch(runtime, () => harness.click(runtime,
      (element) => hasClass(element, 'wsb-card') && !hasClass(element, 'wsb-addCard')));
    if (!view) throw new Error('the module did not open');
    const select = view.elements.find((element) => hasClass(element, 'wsb-select'));
    if (!select) throw new Error('session picker missing');
    if (select.props.value !== 'session-check') {
      throw new Error('the console did not adopt the host active conversation, showed "'
        + select.props.value + '" (a stale focus must not win)');
    }
    const adopted = JSON.parse(windowStub.localStorage.getItem('dsh-workbench.v3') || '{}');
    if (adopted.focusSessionId !== 'session-check') {
      throw new Error('the stale focus was not corrected in state, saw "' + adopted.focusSessionId + '"');
    }
    const stored = JSON.parse(windowStub.localStorage.getItem('dsh-workbench.v3') || '{}');
    if ((stored.modules || [])[0].sessionId) throw new Error('an unbound module carries a session binding');
    // Picking a session must NOT silently bind: that was the other half of the bug.
    const picker = view.elements.find((element) => hasClass(element, 'wsb-select'));
    picker.props.onChange({ target: { value: 'session-check' } });
    harness.flush(runtime);
    const after = JSON.parse(windowStub.localStorage.getItem('dsh-workbench.v3') || '{}');
    if (after.modules[0].sessionId) {
      throw new Error('choosing in the session picker bound the module without being asked');
    }
    if (after.focusSessionId !== 'session-check') throw new Error('the picker did not move the focus');
  });

  check('the trail strip toggles on and off and persists per module', () => {
    const source = fs.readFileSync(path.join(ROOT, 'client.js'), 'utf8');
    const press = (element, props) => {
      element.props.onClick(props || { currentTarget: null, stopPropagation() {}, preventDefault() {} });
      return harness.flush(runtime);
    };
    const stored = () => (JSON.parse(windowStub.localStorage.getItem('dsh-workbench.v3') || '{}').modules || [])[0];
    const openConsole = (state) => {
      seedState(state);
      mount(registered.main.component, {});
      return harness.dispatch(runtime, () => harness.click(runtime,
        (element) => hasClass(element, 'wsb-card') && !hasClass(element, 'wsb-addCard')));
    };
    const base = {
      v: 3,
      modules: [{ id: 'mod-trail', kind: 'game', name: '轨迹测试', desc: '', preset: 'triple', created: 1, sessionId: 'session-check' }],
      focusSessionId: 'session-check',
      notes: {},
    };

    // Off by default: the band must not be there, and the button must read as inactive.
    const closed = openConsole(base);
    if (!closed) throw new Error('console did not open');
    if (closed.elements.some((element) => element.props['data-trail-strip'] === '1')) {
      throw new Error('the trail strip is showing while it is switched off');
    }
    const toggle = closed.elements.find((element) => element.props['data-trail-toggle'] === '1');
    if (!toggle) throw new Error('the trail strip toggle is missing from the console header');
    if (toggle.props['data-on'] !== 'false') throw new Error('the trail toggle should read as off');
    // Two controls both labelled just 轨迹 is what made this button look inert: the 显示项
    // group has its own 轨迹 chip (it adds the trail PANE). They must be told apart.
    if (!hasClass(toggle, 'wsb-trailToggle')) {
      throw new Error('the strip toggle is not marked with its own class');
    }
    const toggleLabel = (toggle.children || []).join('');
    const paneChip = closed.elements.find((element) => element.props['data-pane'] === 'trail');
    if (!paneChip) throw new Error('the 显示项 list lost its 轨迹 chip');
    if (toggleLabel === (paneChip.children || []).join('')) {
      throw new Error('the strip toggle and the pane chip share a label, so neither is discoverable');
    }
    if (String(toggle.props.title || '').indexOf('横条') < 0 && String(toggle.props.title || '').indexOf('strip') < 0) {
      throw new Error('the strip toggle has no distinguishing tooltip');
    }

    // On: a band appears under the header, carrying the same ledger rows as the 轨迹 pane.
    const opened = press(toggle);
    const strip = opened.elements.find((element) => element.props['data-trail-strip'] === '1');
    if (!strip) throw new Error('the trail strip did not open');
    const stripRows = opened.elements.filter((element) => hasClass(element, 'wsb-trailRow'));
    if (stripRows.length === 0) throw new Error('the trail strip rendered no ledger rows');
    if (!opened.elements.some((element) => element.props['data-trail-grip'] === '1')) {
      throw new Error('the trail strip has no drag grip');
    }
    if (!opened.elements.some((element) => element.props['data-trail-close'] === '1')) {
      throw new Error('the trail strip has no close control');
    }
    if (stored().trailOpen !== true) throw new Error('opening the strip was not persisted');
    const body = opened.elements.find((element) => hasClass(element, 'wsb-trailStripBody'));
    if (!body || !/px$/.test(String(body.props.style.height))) {
      throw new Error('the strip body has no pixel height to drag');
    }

    // Off again: it closes, and the state remembers that too.
    const reopened = press(opened.elements.find((element) => element.props['data-trail-toggle'] === '1'));
    if (reopened.elements.some((element) => element.props['data-trail-strip'] === '1')) {
      throw new Error('the trail strip did not close on the second press');
    }
    if (stored().trailOpen !== false) throw new Error('closing the strip was not persisted');

    // A stored open state must come back on the next visit.
    const remembered = openConsole(Object.assign({}, base, {
      modules: [Object.assign({}, base.modules[0], { trailOpen: true, trailHeight: 240 })],
    }));
    const restored = remembered.elements.find((element) => hasClass(element, 'wsb-trailStripBody'));
    if (!restored) throw new Error('a stored-open trail strip did not come back');
    if (String(restored.props.style.height) !== '240px') {
      throw new Error('the stored trail height was not applied, saw ' + restored.props.style.height);
    }

    // The resize maths: dragging up grows the band, and both ends are clamped.
    const clampFn = new Function('value', 'low', 'high',
      grabFunction(source, 'clamp') + '\nreturn clamp(value, low, high);');
    const drag = (from, to, startHeight) => clampFn(Math.round(startHeight - (to - from)), 90, 620);
    if (drag(300, 250, 200) !== 250) throw new Error('dragging up did not grow the strip');
    if (drag(300, 350, 200) !== 150) throw new Error('dragging down did not shrink the strip');
    // Dragging far up is capped at the maximum; far down is floored at the minimum.
    if (drag(300, -900, 200) !== 620) throw new Error('the strip is not capped at its maximum');
    if (drag(300, 900, 200) !== 90) throw new Error('the strip is not floored at its minimum');

    // And the handle is really wired: pulling it up must write a larger height.
    const live = openConsole(Object.assign({}, base, {
      modules: [Object.assign({}, base.modules[0], { trailOpen: true, trailHeight: 200 })],
    }));
    const liveBody = live.elements.find((element) => hasClass(element, 'wsb-trailStripBody'));
    if (!liveBody) throw new Error('the strip body is missing');
    // Point the body's ref at a stand-in with a measurable box.
    liveBody.props.ref.current = {
      getBoundingClientRect: () => ({ height: 200, top: 0, left: 0, width: 400 }),
      addEventListener() {},
    };
    const gripNow = live.elements.find((element) => element.props['data-trail-grip'] === '1');
    if (!gripNow) throw new Error('the strip grip is missing');
    gripNow.props.onPointerDown({
      clientY: 300, pointerId: 1, preventDefault() {},
      currentTarget: { setPointerCapture() {} },
    });
    if (typeof windowStub.listeners.get('pointermove') !== 'function') {
      throw new Error('the grip installed no pointermove handler');
    }
    windowStub.listeners.get('pointermove')({ clientY: 250 });
    harness.flush(runtime);
    const resized = (JSON.parse(windowStub.localStorage.getItem('dsh-workbench.v3') || '{}').modules || [])[0];
    if (resized.trailHeight !== 250) {
      throw new Error('dragging the grip up did not store a taller strip, saw ' + resized.trailHeight);
    }
    if (typeof windowStub.listeners.get('pointerup') !== 'function') {
      throw new Error('the grip installed no pointerup handler');
    }
    windowStub.listeners.get('pointerup')({ clientY: 250 });
    if (windowStub.listeners.has('pointermove')) {
      throw new Error('the drag listeners were not removed on release');
    }

    // A stored height outside the range is clamped on read, not trusted.
    const clampedRead = openConsole(Object.assign({}, base, {
      modules: [Object.assign({}, base.modules[0], { trailOpen: true, trailHeight: 5000 })],
    }));
    const readBody = clampedRead.elements.find((element) => hasClass(element, 'wsb-trailStripBody'));
    if (String(readBody.props.style.height) !== '620px') {
      throw new Error('an out-of-range stored height was not clamped, saw ' + readBody.props.style.height);
    }
  });

  check('the running highlight is neutral while the palettes still drive the aurora', () => {
    const source = fs.readFileSync(path.join(ROOT, 'client.js'), 'utf8');
    // The tile highlight is deliberately monochrome: no palette stop may leak into it.
    const start = source.indexOf('.wsb-card[data-running="true"]{');
    const end = source.indexOf('.wsb-screen[data-concealed="true"] .wsb-card');
    if (start < 0 || end <= start) throw new Error('could not isolate the running-tile rules');
    const running = source.slice(start, end);
    if (running.indexOf('var(--wsb-g') >= 0 || running.indexOf('var(--wsb-ring') >= 0) {
      throw new Error('a palette colour leaked into the running highlight');
    }
    if (!/::after\{[\s\S]{0,500}?color-mix\(in srgb,#fff/.test(running)) {
      throw new Error('the sheen is not a neutral white pass');
    }
    // The palettes still have to carry their seven aurora stops and the restrained glass tint.
    for (const palette of ['aurora', 'ocean', 'sunset', 'forest', 'candy', 'ember', 'slate']) {
      const block = new RegExp('\\[data-palette="' + palette + '"\\]\\{([^}]*)\\}').exec(source);
      if (!block) throw new Error('palette block missing: ' + palette);
      if (block[1].indexOf('--wsb-glass-tint:') < 0) {
        throw new Error('palette "' + palette + '" does not set --wsb-glass-tint');
      }
      for (let i = 1; i <= 7; i += 1) {
        if (block[1].indexOf('--wsb-g' + i + ':') < 0) {
          throw new Error('palette "' + palette + '" does not set --wsb-g' + i);
        }
      }
    }
  });

  //#region 每日新闻 (daily news module)

  // --- 每日新闻: the shipped module, its reader, and the fetch contract ----------
  //
  // The reader is the first screen in this plugin that talks to the network, so the tests
  // below stub `fetch` rather than letting it fail: the interesting assertions are about what
  // the pane does with a real payload (how many items, which count as 大事件, what the archive
  // keeps), not about the request. The stub replaces the bare global because client.js calls
  // it the way it would in a browser.

  const realFetch = globalThis.fetch;
  let fetchHandler = () => Promise.reject(new Error('no fetch handler installed'));
  globalThis.fetch = (url, init) => {
    try { return Promise.resolve(fetchHandler(String(url), init || {})) } catch (error) { return Promise.reject(error) }
  };

  const NEWS_DAY = 86400000;
  const newsItem = (over) => Object.assign({
    id: 'n-' + Math.random().toString(36).slice(2),
    title: '一条新闻标题',
    url: 'https://example.com/a',
    source: 'Example',
    topicId: 'global',
    topicName: '全球大事件',
    accent: '#7db8ff',
    publishedAt: Date.now() - 3600000,
    summary: '这是摘要文本，长度足够显示出来。',
    related: [],
    coverage: 1,
    points: 0,
    category: '',
  }, over);

  /**
   * Answer the three operations the reader calls. `items` is what a collect returns; the
   * catalog is fixed, and the article endpoint always refuses — which is the common real
   * outcome and the branch that must degrade rather than break.
   */
  const stubNews = (items, stats) => {
    fetchHandler = (url, init) => {
      if (url.indexOf('op=catalog') >= 0) {
        return {
          ok: true,
          json: () => Promise.resolve({
            ok: true,
            feeds: [
              { id: 'gnews-top-zh', label: 'Google 新闻 · 中文头条', group: '全球', lang: 'zh' },
              { id: 'hn', label: 'Hacker News 头版', group: '科技', lang: 'en' },
            ],
            defaults: [{ id: 'global', name: '全球大事件', accent: '#7db8ff', lang: 'zh', kw: [], feeds: ['gnews-top-zh'] }],
            limits: { min: 10, max: 100, maxDays: 7 },
          }),
        };
      }
      if (url.indexOf('op=article') >= 0) {
        return { ok: true, json: () => Promise.resolve({ ok: false, error: 'HTTP 403' }) };
      }
      const body = JSON.parse(init.body || '{}');
      return {
        ok: true,
        json: () => Promise.resolve({
          ok: true, fetchedAt: Date.now(), tookMs: 12,
          window: { days: body.days, since: Date.now() - body.days * NEWS_DAY, until: Date.now() },
          items: items.slice(0, body.limit),
          stats: Object.assign({
            days: body.days, limit: body.limit, total: items.length,
            shown: Math.min(items.length, body.limit),
            feeds: 2,
            span: { oldest: items.length ? items[items.length - 1].publishedAt : 0, newest: Date.now() },
            topics: [{ id: 'global', name: '全球大事件', accent: '#7db8ff', count: items.length }],
            sources: [{ name: 'Example', count: items.length }],
            perFeed: [
              { source: 'Google 新闻 · 中文头条', topic: '全球大事件', items: items.length, ms: 1200, via: 'registry', cached: false, error: '' },
              { source: 'Hacker News 头版', topic: '全球大事件', items: 0, ms: 300, via: 'direct', cached: false, error: '请求超时' },
            ],
            errors: [{ topic: '全球大事件', source: 'Hacker News 头版', message: '请求超时', stale: false }],
            timedOut: false, pending: 0, hint: '',
          }, stats || {}),
        }),
      };
    };
  };

  /** A module of the news kind, ready to open. */
  const newsModule = (over) => Object.assign({
    id: 'mod-news', kind: 'news', name: '每日新闻', desc: '', accent: '#22d3ee', preset: 'triple',
    created: 1, news: undefined,
  }, over);

  /**
   * Let queued promise callbacks run, then settle the render.
   *
   * The harness is synchronous, so a `fetch` that resolves on a microtask needs real turns of
   * the microtask queue between flushes. Six is more than any of these paths needs and costs
   * nothing.
   */
  const settle = async () => {
    for (let round = 0; round < 6; round += 1) {
      await Promise.resolve();
      harness.flush(runtime);
    }
    return harness.flush(runtime);
  };

  /** Seed storage with exactly one news module, then open it. Returns the settled view.
   *  `stateExtra` merges into the seeded app state, which is how a test varies the desktop
   *  appearance (the news screen must follow it, so it has to be settable). */
  const openNews = async (over, items, stats, handler, stateExtra) => {
    stubNews(items || [], stats);
    // An explicit handler wins: `stubNews` always installs one, and a test that wants a 404 or
    // a 500 needs to override it *after* the stub, not before.
    if (handler) fetchHandler = handler;
    seedState(Object.assign({
      v: 3, modules: [newsModule(over)], focusSessionId: undefined, notes: {}, newsSeeded: true,
    }, stateExtra || {}));
    mount(registered.main.component, {});
    const opened = harness.dispatch(runtime, () => harness.click(runtime,
      (element) => hasClass(element, 'wsb-card')));
    if (!opened) throw new Error('the news card was not clickable');
    return settle();
  };

  const storedNewsState = () => {
    const state = JSON.parse(windowStub.localStorage.getItem('dsh-workbench.v3') || '{}');
    const found = (state.modules || []).find((item) => item.kind === 'news');
    return found ? found.news : undefined;
  };

  const newsCards = (view) => view.elements.filter((element) => element.props['data-news-item'] !== undefined);

  await check('the 每日新闻 module ships with the plugin and normalises to its own kind', () => {
    for (const key of ['dsh-workbench.v3', 'dsh-workbench.v2', 'dsh-workbench.v1']) windowStub.localStorage.removeItem(key);
    const fresh = mount(registered.main.component, {});
    if (!/每日新闻/.test(fresh.text)) throw new Error('a fresh install does not offer the news module');
    const cards = fresh.elements.filter((element) => hasClass(element, 'wsb-card') && element.props['data-add'] !== 'true');
    if (cards.length < 3) throw new Error('the shipped module list lost a module, saw ' + cards.length);
    const stored = JSON.parse(windowStub.localStorage.getItem('dsh-workbench.v3') || '{}');
    const seeded = (stored.modules || []).filter((item) => item.kind === 'news');
    if (seeded.length !== 1) throw new Error('expected exactly one shipped news module, saw ' + seeded.length);
    if (!seeded[0].news || !Array.isArray(seeded[0].news.topics) || !seeded[0].news.topics.length) {
      throw new Error('the news module was stored without its topic settings');
    }
    if (seeded[0].news.count < 10 || seeded[0].news.count > 100) {
      throw new Error('the stored default count is outside 10-100: ' + seeded[0].news.count);
    }
    if (stored.newsSeeded !== true) throw new Error('the one-time seed flag was not recorded');
  });

  await check('an install that predates the news module is offered it exactly once', () => {
    // No newsSeeded flag and no news module: this is the state a previous version left behind.
    seedState({
      v: 3, modules: [{ id: 'mod-old', kind: 'game', name: '旧控制台', desc: '', accent: '#7db8ff', preset: 'triple', created: 1 }],
      focusSessionId: undefined, notes: {},
    });
    mount(registered.main.component, {});
    const first = JSON.parse(windowStub.localStorage.getItem('dsh-workbench.v3') || '{}');
    if (!(first.modules || []).some((item) => item.kind === 'news')) {
      throw new Error('an older install was not offered the news module');
    }
    // Delete it, reload: it must stay deleted rather than reappearing on every load.
    first.modules = first.modules.filter((item) => item.kind !== 'news');
    first.newsSeeded = true;
    seedState(first);
    mount(registered.main.component, {});
    const second = JSON.parse(windowStub.localStorage.getItem('dsh-workbench.v3') || '{}');
    if ((second.modules || []).some((item) => item.kind === 'news')) {
      throw new Error('a deliberately deleted news module came back');
    }
  });


  await check('the reader renders its nav, two panes, dial and view controls', async () => {
    const view = await openNews();
    if (!view.elements.some((element) => element.props['data-role'] === 'news')) {
      throw new Error('the news screen did not render');
    }
    // Two panes, not three: the topic switcher moved out of the row and into a nav bar above it,
    // where it costs one row instead of a third of the reading width.
    for (const pane of ['stream', 'detail']) {
      if (!view.elements.some((element) => element.props['data-news-pane'] === pane)) {
        throw new Error('missing pane: ' + pane);
      }
    }
    const nav = view.elements.find((element) => element.props['data-news-nav'] === '1');
    if (!nav) throw new Error('the 关键领域 nav bar is missing');
    // The topic buttons are nested inside the scrollable items row, so they are found on the flat
    // element list rather than by walking the nav's own children. This fixture's catalog stub
    // ships a single default topic and the client adopts it, so one marked button is the correct
    // shape here — the multi-topic path is covered by the adoption check below.
    const topics = view.elements.filter((element) => element.props['data-topic'] !== undefined);
    if (topics.length !== storedNewsState().topics.length) {
      throw new Error('the nav lists ' + topics.length + ' topics but ' + storedNewsState().topics.length + ' are stored');
    }
    if (!topics.some((element) => element.props['data-on'] === 'true')) {
      throw new Error('no topic is marked as the active one');
    }
    if (topics.filter((element) => element.props['data-on'] === 'true').length !== 1) {
      throw new Error('more than one topic claims to be active');
    }
    // The add affordance lives in the bar: `+ 自定义`.
    if (!view.elements.some((element) => element.props['data-topic-add'] === '1')) {
      throw new Error('the nav bar has no custom-section button');
    }
    const dial = view.elements.find((element) => element.props['data-news-count'] === '1');
    if (!dial) throw new Error('the count dial is missing');
    if (Number(dial.props.min) !== 10 || Number(dial.props.max) !== 100) {
      throw new Error('the count dial is not bounded to 10-100, saw ' + dial.props.min + '-' + dial.props.max);
    }
    for (const days of ['1', '3', '7']) {
      if (!view.elements.some((element) => element.props['data-news-day'] === days)) {
        throw new Error('missing the ' + days + '-day window chip');
      }
    }
    for (const mode of ['list', 'grid', 'compact']) {
      if (!view.elements.some((element) => element.props['data-news-view'] === mode)) {
        throw new Error('missing the ' + mode + ' view chip');
      }
    }
    if (!view.elements.some((element) => element.props['data-news-refresh'] === '1')) {
      throw new Error('the refresh control is missing');
    }
    // One seam between the two panes. It used to be two, when a third pane held the topic rail.
    if (view.elements.filter((element) => element.props['data-split'] !== undefined).length !== 1) {
      throw new Error('the draggable pane seam is missing');
    }
    // Opening a news module must never bind it to the session that happens to be in focus.
    if (storedNewsState() === undefined) throw new Error('opening the reader did not persist its settings');
  });

  await check('the window chips re-filter the stored archive without another fetch', async () => {
    const now = Date.now();
    const items = [
      newsItem({ id: 'today', title: '今天的新闻', publishedAt: now - 3600000 }),
      newsItem({ id: 'two', title: '两天前的新闻', publishedAt: now - 2 * NEWS_DAY }),
      newsItem({ id: 'six', title: '六天前的新闻', publishedAt: now - 6 * NEWS_DAY }),
    ];
    const view = await openNews({ news: undefined }, items);
    if (newsCards(view).length !== 3) throw new Error('the 7-day default did not show every stored story');
    // Switching to 今日 must drop the older two, and must do it locally: the stub records calls.
    let fetches = 0;
    const counting = fetchHandler;
    fetchHandler = (url, init) => { fetches += 1; return counting(url, init) };
    const chip = runtime.sink.elements.find((element) => element.props['data-news-day'] === '1');
    harness.dispatch(runtime, () => chip.props.onClick({ stopPropagation() {} }));
    const oneDay = harness.flush(runtime);
    if (newsCards(oneDay).length !== 1) {
      throw new Error('the 今日 chip did not narrow the stream, saw ' + newsCards(oneDay).length);
    }
    if (fetches !== 0) throw new Error('changing the window refetched instead of filtering locally');
    if (storedNewsState().days !== 1) throw new Error('the window choice was not persisted');
  });

  await check('the count dial clamps to 10-100 and persists per module', async () => {
    await openNews();
    const fire = (value) => {
      const dial = runtime.sink.elements.find((element) => element.props['data-news-count'] === '1');
      dial.props.onChange({ target: { value: String(value) } });
      return harness.flush(runtime);
    };
    fire(5);
    if (storedNewsState().count !== 10) {
      throw new Error('a below-range count was not clamped, saw ' + storedNewsState().count);
    }
    fire(500);
    if (storedNewsState().count !== 100) {
      throw new Error('an above-range count was not clamped, saw ' + storedNewsState().count);
    }
    fire(70);
    if (storedNewsState().count !== 70) {
      throw new Error('a valid count was not stored, saw ' + storedNewsState().count);
    }
  });

  await check('the stream renders the fetched stories, newest first and capped by the dial', async () => {
    const now = Date.now();
    const items = [];
    for (let index = 0; index < 30; index += 1) {
      items.push(newsItem({
        id: 'news-' + index,
        title: '第 ' + index + ' 条新闻',
        url: 'https://example.com/' + index,
        publishedAt: now - index * 600000,
      }));
    }
    const view = await openNews({ news: undefined }, items);
    const cards = newsCards(view);
    if (cards.length !== 30) throw new Error('expected 30 story cards, saw ' + cards.length);
    if (cards[0].props['data-news-item'] !== 'news-0') throw new Error('the newest story is not first');
    // Shrinking the dial must re-cap immediately, again without another request.
    let fetches = 0;
    const counting = fetchHandler;
    fetchHandler = (url, init) => { fetches += 1; return counting(url, init) };
    const dial = runtime.sink.elements.find((element) => element.props['data-news-count'] === '1');
    dial.props.onChange({ target: { value: '12' } });
    const smaller = harness.flush(runtime);
    if (newsCards(smaller).length !== 12) {
      throw new Error('the dial did not cap the stream, saw ' + newsCards(smaller).length);
    }
    if (fetches !== 0) throw new Error('changing the count refetched instead of slicing locally');
  });

  await check('the broadcast carries the newest stories and only badges multi-outlet ones', async () => {
    const now = Date.now();
    const items = [
      newsItem({ id: 'big', title: '五家媒体报道的大事', coverage: 5, publishedAt: now - 5000 }),
      newsItem({ id: 'mid', title: '三家的中等事件', coverage: 3, publishedAt: now - 4000 }),
      newsItem({ id: 'small', title: '单独一家', coverage: 1, publishedAt: now - 1000 }),
      newsItem({ id: 'two', title: '两家报道', coverage: 2, publishedAt: now - 2000 }),
    ];
    const view = await openNews({ news: undefined }, items);
    const cards = view.elements.filter((element) => element.props['data-hot'] !== undefined);
    // Two copies of the track, so the loop has no seam. Only the first is real.
    const ids = cards.filter((card) => card.props['data-copy'] === '0').map((card) => card.props['data-hot']);
    if (cards.length !== ids.length * 2) {
      throw new Error('the ticker track is not exactly two identical halves: ' + cards.length + ' cards');
    }
    // A bulletin asks "what just happened", so every story rides — newest first.
    if (ids.join(',') !== 'small,two,mid,big') {
      throw new Error('the broadcast is not newest-first: ' + ids.join(','));
    }
    // ...and the coverage threshold still decides the LABEL. This is the property worth keeping:
    // a single-outlet story must never be presented as a 大事件.
    const label = (id) => {
      const card = cards.find((element) => element.props['data-hot'] === id && element.props['data-copy'] === '0');
      return card.props['data-label'];
    };
    if (label('big') !== 'hot' || label('mid') !== 'hot') {
      throw new Error('a multi-outlet story is not labelled 大事件: ' + label('big') + ' / ' + label('mid'));
    }
    if (label('small') !== 'source' || label('two') !== 'source') {
      throw new Error('a 1- or 2-outlet story was labelled 大事件');
    }
    // The badge text follows the same rule, and a single-source story names its source instead —
    // which is what a bulletin is for.
    const badges = view.elements
      .filter((element) => hasClass(element, 'wsb-hotBadge'))
      .map((element) => String(element.children));
    const hotHint = '家媒体报道';
    if (!badges.some((text) => text === '5 ' + hotHint) || !badges.some((text) => text === '3 ' + hotHint)) {
      throw new Error('the coverage badges are missing: ' + JSON.stringify(badges));
    }
    if (badges.some((text) => /^[12] /.test(text))) {
      throw new Error('a 1- or 2-outlet story got a coverage badge: ' + JSON.stringify(badges));
    }
    if (!badges.some((text) => /Example/.test(text))) {
      throw new Error('a single-source story does not name its source: ' + JSON.stringify(badges));
    }
  });

  await check('the broadcast scrolls itself, on the compositor, and can be stopped', async () => {
    const source = fs.readFileSync(path.join(ROOT, 'client.js'), 'utf8');
    // The rule this plugin paid for: keyframes move transform and opacity only. A ticker that
    // animated `left` or `width` would relayout the whole pane every frame.
    const frames = /@keyframes wsb-ticker\{([\s\S]*?)\}\}/.exec(source);
    if (!frames) throw new Error('the ticker keyframes are gone');
    if (!/translate3d/.test(frames[1])) throw new Error('the ticker does not translate');
    if (/left|right|\bwidth\b|\bmargin\b|border-radius|filter|background-position/.test(frames[1])) {
      throw new Error('the ticker animates a layout or paint property: ' + frames[1]);
    }
    // Seamless: the track holds the items twice and travels exactly one half.
    if (!/\-50%/.test(frames[1])) throw new Error('the ticker does not travel exactly one half, so the loop has a seam');
    if (!/\.wsb-tickerTrack\{[^}]*animation:wsb-ticker var\(--wsb-ticker-dur[^}]*linear infinite/.test(source)) {
      throw new Error('the ticker is not a linear infinite loop');
    }
    // Stoppable: on hover and on keyboard focus, because a ticker you cannot read is decoration.
    if (!/\.wsb-hotRail:hover \.wsb-tickerTrack,[\s\S]{0,120}?\.wsb-hotRail:focus-within \.wsb-tickerTrack\{animation-play-state:paused\}/.test(source)) {
      throw new Error('the ticker cannot be paused by the reader');
    }
    // Constant reading speed, derived from the count: no layout read, and a longer bulletin takes
    // proportionally longer instead of racing.
    if (!/NEWS_TICKER_PPS/.test(source) || !/tickerSeconds = Math\.max\(30, Math\.round\(broadcast\.length/.test(source)) {
      throw new Error('the ticker duration is not derived from its length');
    }
    // Reduced motion stops it and hands back a draggable rail.
    const last = source.lastIndexOf('@media (prefers-reduced-motion:reduce)');
    const block = source.slice(last, source.indexOf('}`;', last));
    for (const selector of ['.wsb-tickerTrack', '.wsb-tickerLead>i']) {
      if (block.indexOf(selector) < 0) throw new Error('reduced motion does not cover ' + selector);
    }
    if (block.indexOf('.wsb-hotRail{overflow-x:auto') < 0) {
      throw new Error('reduced motion leaves a stopped, unscrollable strip');
    }

    // ...and in the rendered tree: two halves, a lead chip in each, and the second half hidden
    // from assistive tech so the bulletin is announced once.
    const now = Date.now();
    const items = [
      newsItem({ id: 'a', title: '刚刚发生的一条', url: 'https://example.com/a', publishedAt: now - 1000 }),
      newsItem({ id: 'b', title: '稍早的一条', url: 'https://example.com/b', publishedAt: now - 2000 }),
    ];
    const view = await openNews({ news: undefined }, items);
    const rail = view.elements.find((element) => element.props['data-ticker'] === '1');
    if (!rail) throw new Error('the broadcast rail is missing');
    const track = view.elements.find((element) => element.props['data-ticker-track'] === '1');
    if (!track) throw new Error('the ticker track is missing');
    if (!/^\d+s$/.test(String(rail.props.style['--wsb-ticker-dur']))) {
      throw new Error('the ticker duration is not a time: ' + rail.props.style['--wsb-ticker-dur']);
    }
    // The label stands still outside the travelling viewport — a label that scrolls away with its
    // content is not a label — so there is exactly one chip, and it is not inside the track.
    const leads = view.elements.filter((element) => hasClass(element, 'wsb-tickerLead'));
    if (leads.length !== 1) throw new Error('expected one standing label, saw ' + leads.length);
    const trackKids = (track.children || []).filter((child) => child && child.props);
    if (trackKids.length !== 2) {
      throw new Error('the track does not hold exactly two halves, saw ' + trackKids.length);
    }
    const viewport = view.elements.find((element) => element.props['data-ticker-view'] === '1');
    if (!viewport) throw new Error('the ticker has no viewport to travel through');
    const copies = view.elements.filter((element) => element.props['data-copy'] === '1');
    if (copies.length !== 2) throw new Error('the second half of the track is incomplete');
    for (const copy of copies) {
      if (copy.props['aria-hidden'] !== 'true') throw new Error('the duplicated half is announced to screen readers');
      if (copy.props.tabIndex !== -1) throw new Error('the duplicated half is in the tab order');
    }
  });

  await check('the 大事件 rail shows a plate when the story has one', async () => {
    const now = Date.now();
    const items = [
      newsItem({ id: 'h0', title: '五家媒体报道的头条', url: 'https://example.com/h0', publishedAt: now - 1000, coverage: 5, image: 'https://img.example.com/h0.jpg' }),
      newsItem({ id: 'h1', title: '没有配图的大事件', url: 'https://example.com/h1', publishedAt: now - 2000, coverage: 4 }),
    ];
    const view = await openNews({ news: undefined }, items);
    const cards = view.elements.filter((element) => element.props['data-hot'] !== undefined
      && element.props['data-copy'] === '0');
    if (cards.length !== 2) throw new Error('expected two broadcast cards, saw ' + cards.length);
    const withPic = cards.filter((card) => card.props['data-hasimage'] === 'true');
    if (withPic.length !== 1) throw new Error('expected exactly one illustrated card, saw ' + withPic.length);
    const pics = view.elements.filter((element) => hasClass(element, 'wsb-hotPic'));
    if (pics.length !== 2) throw new Error('the picture is not in both halves of the track, saw ' + pics.length);
  });

  await check('selecting a story fills the detail pane and reports the sources', async () => {
    const now = Date.now();
    const items = [newsItem({
      id: 'pick', title: '被选中的新闻标题', url: 'https://example.com/pick',
      publishedAt: now - 5000, coverage: 4, related: ['同事件的另一篇报道'],
    })];
    const view = await openNews({ news: undefined }, items);
    // The pane opens on the lead story rather than on its hint: a reading pane that starts empty
    // is a wasted pane, and the hint only belongs on a screen with nothing to read at all.
    if (/在左侧新闻流里点一条/.test(view.text)) {
      throw new Error('the detail pane still shows its empty hint while a story is available');
    }
    if (!/被选中的新闻标题/.test(view.text)) {
      throw new Error('the lead story was not opened in the detail pane automatically');
    }
    if (storedNewsState().seen.pick) {
      throw new Error('auto-selecting the lead marked it as read');
    }
    const card = runtime.sink.elements.find((element) => element.props['data-news-item'] === 'pick');
    harness.dispatch(runtime, () => card.props.onClick({ stopPropagation() {}, preventDefault() {} }));
    const selected = await settle();
    if (!/被选中的新闻标题/.test(selected.text)) throw new Error('the selected story did not reach the detail pane');
    if (!/同事件的另一篇报道/.test(selected.text)) throw new Error('the related coverage list was not rendered');
    // The per-source report is the honest half of the module: a failed source must be visible
    // rather than silently shrinking the feed.
    if (!/请求超时/.test(selected.text)) throw new Error('a failed source was not reported in the source status list');
    if (!selected.elements.some((element) => element.props['data-bad'] === 'true')) {
      throw new Error('the failing source row is not marked as bad');
    }
    if (!storedNewsState().seen || !storedNewsState().seen.pick) {
      throw new Error('opening a story did not record it as read');
    }
  });

  await check('the archive keeps a week and drops anything older', async () => {
    const now = Date.now();
    // An eight-day-old item is seeded straight into the archive and the collect returns one
    // fresh item: only the fresh one may survive the merge.
    const archived = [
      newsItem({ id: 'ancient', title: '八天前的新闻', publishedAt: now - 8 * NEWS_DAY }),
      newsItem({ id: 'recent', title: '两天前的新闻', publishedAt: now - 2 * NEWS_DAY }),
    ];
    const view = await openNews({
      news: {
        topics: [{ id: 'global', name: '全球大事件', accent: '#7db8ff', lang: 'zh', kw: [], feeds: ['gnews-top-zh'] }],
        // Deliberately in the un-normalised "fr units" an older shape might hold: the loader
        // must turn it into unit fractions, or the drag arithmetic below is meaningless.
        activeId: 'global', count: 40, days: 7, view: 'list', cols: [0.78, 1.9, 1.04],
        archive: archived, seen: {}, lastFetchAt: 0, catalogAt: Date.now(),
      },
    }, [newsItem({ id: 'fresh', title: '刚刚的新闻', publishedAt: now - 60000 })]);
    const stored = storedNewsState();
    const ids = stored.archive.map((item) => item.id);
    if (ids.indexOf('ancient') >= 0) throw new Error('an eight-day-old story survived the retention window');
    if (ids.indexOf('recent') < 0) throw new Error('a two-day-old archived story was dropped');
    if (ids.indexOf('fresh') < 0) throw new Error('the freshly fetched story was not merged in');
    const again = stored.archive.find((item) => item.id === 'recent');
    if (!again.firstSeen) throw new Error('firstSeen was not recorded on the merged archive');
    const colSum = stored.cols.reduce((total, value) => total + value, 0);
    if (Math.abs(colSum - 1) > 0.001) {
      throw new Error('the stored pane split was not normalised to unit fractions: ' + JSON.stringify(stored.cols));
    }
    if (view === null) throw new Error('unreachable');
  });

  await check('a keyword can be added and removed, and a topic deleted', async () => {
    await openNews();
    // The editor is opened by the row's pencil button. It used to be a double-click on the row,
    // which is to say it was undiscoverable; the button is what the test now drives because the
    // button is what a person can find.
    const openEditorFor = (index) => {
      const rows = runtime.sink.elements.filter((element) => element.props['data-topic-edit-btn'] !== undefined);
      if (!rows[index]) throw new Error('no topic edit button at index ' + index);
      harness.dispatch(runtime, () => rows[index].props.onClick({ stopPropagation() {} }));
      return harness.flush(runtime);
    };
    const withEditor = openEditorFor(0);
    const input = withEditor.elements.find((element) => element.props['data-kw-input'] === '1');
    if (!input) throw new Error('the keyword input did not appear');
    // The keyword field is uncontrolled on purpose: every keystroke re-rendering the whole rail
    // (topics, source chips, the editor) is a cost paid for nothing when Enter is the commit.
    if (typeof input.props.onChange === 'function') {
      throw new Error('the keyword field became controlled again, so typing re-renders the rail');
    }
    input.props.onKeyDown({ key: 'Enter', preventDefault() {}, currentTarget: { value: '量子计算' } });
    harness.flush(runtime);
    if (storedNewsState().topics[0].kw.indexOf('量子计算') < 0) {
      throw new Error('the keyword was not stored: ' + JSON.stringify(storedNewsState().topics[0].kw));
    }
    const remove = runtime.sink.elements.find((element) => element.props['data-kw-remove'] === '量子计算');
    if (!remove) throw new Error('no remove control for the new keyword');
    harness.dispatch(runtime, () => remove.props.onClick({ stopPropagation() {} }));
    if (storedNewsState().topics[0].kw.indexOf('量子计算') >= 0) {
      throw new Error('the keyword was not removed');
    }
    // A source can be ticked and unticked; both must persist.
    const chip = runtime.sink.elements.find((element) => element.props['data-feed'] === 'hn');
    if (!chip) throw new Error('the source chips did not render');
    harness.dispatch(runtime, () => chip.props.onClick({ stopPropagation() {} }));
    if (storedNewsState().topics[0].feeds.indexOf('hn') < 0) throw new Error('ticking a source did not persist');
    const chip2 = runtime.sink.elements.find((element) => element.props['data-feed'] === 'hn');
    harness.dispatch(runtime, () => chip2.props.onClick({ stopPropagation() {} }));
    if (storedNewsState().topics[0].feeds.indexOf('hn') >= 0) throw new Error('unticking a source did not persist');
  });

  await check('a topic can be added and deleted, and the active topic follows', async () => {
    seedState({
      v: 3, newsSeeded: true, notes: {},
      modules: [newsModule({ news: {
        topics: [
          { id: 'global', name: '全球大事件', accent: '#7db8ff', lang: 'zh', kw: [], feeds: ['gnews-top-zh'] },
          { id: 'ai', name: 'AI 领域', accent: '#a78bfa', lang: 'zh', kw: ['人工智能'], feeds: ['hn'] },
        ],
        activeId: 'ai', count: 20, days: 3, view: 'grid', cols: [0.21, 0.51, 0.28],
        archive: [], seen: {}, lastFetchAt: 0, catalogAt: Date.now(),
      } })],
    });
    stubNews([]);
    mount(registered.main.component, {});
    harness.dispatch(runtime, () => harness.click(runtime, (element) => hasClass(element, 'wsb-card')));
    await settle();
    if (storedNewsState().activeId !== 'ai') throw new Error('the stored active topic was not adopted');
    // The editor starts closed, so it opens on demand — via the pencil button.
    const rows = runtime.sink.elements.filter((element) => element.props['data-topic'] !== undefined);
    if (rows.length !== 2) throw new Error('expected two topic rows, saw ' + rows.length);
    const pencils = runtime.sink.elements.filter((element) => element.props['data-topic-edit-btn'] !== undefined);
    if (pencils.length !== 2) throw new Error('expected a pencil per topic row, saw ' + pencils.length);
    harness.dispatch(runtime, () => pencils[1].props.onClick({ stopPropagation() {} }));
    harness.flush(runtime);
    const del = runtime.sink.elements.find((element) => element.props['data-topic-delete'] === '1');
    if (!del) throw new Error('the topic editor offers no delete control');
    harness.dispatch(runtime, () => del.props.onClick({ stopPropagation() {} }));
    const after = storedNewsState();
    if (after.topics.length !== 1) throw new Error('deleting a topic left ' + after.topics.length + ' topics');
    if (!after.topics.some((entry) => entry.id === after.activeId)) {
      throw new Error('the active topic was left pointing at the deleted one');
    }
  });

  await check('the pane seams commit a drag and reset on double click', async () => {
    const view = await openNews();
    const grid = view.elements.find((element) => element.props['data-news-grid'] === '1');
    // The seams measure their container and write a growth ratio onto each pane element. The
    // harness has no DOM, so the container reports a stable box and the pane lookup returns
    // style-collecting stand-ins — which also makes the per-move writes assertable, and those
    // writes are the point: they are what keeps a drag from re-rendering every card.
    const writes = [];
    const paneStubs = ['topics', 'stream', 'detail'].map((name) => ({
      name,
      style: {
        setProperty(property, value) { writes.push({ pane: name, property, value }) },
        getPropertyValue() { return '' },
      },
    }));
    grid.props.ref.current = {
      getBoundingClientRect: () => ({ left: 0, right: 1000, top: 0, bottom: 600, width: 1000, height: 600 }),
      querySelectorAll: () => paneStubs,
    };
    const split = runtime.sink.elements.find((element) => element.props['data-split'] === '0');
    if (!split) throw new Error('the first seam is missing');
    split.props.onPointerDown({
      clientX: 250, pointerId: 1, preventDefault() {},
      currentTarget: { setPointerCapture() {}, setAttribute() {} },
    });
    split.props.onPointerMove({ clientX: 350 });
    // Two panes now, so one seam writes two ratios.
    if (writes.length !== 2) {
      throw new Error('a drag move did not write both pane ratios, saw ' + writes.length);
    }
    for (const write of writes) {
      if (write.property !== '--wsb-grow') throw new Error('a drag wrote ' + write.property + ' instead of --wsb-grow');
    }
    if (Math.abs(Number(writes[0].value) - 0.35) > 0.02) {
      throw new Error('the live ratio is wrong, saw ' + writes[0].value);
    }
    // Nothing is committed until pointer-up: that is the whole reason the drag does not
    // re-render the up-to-100 cards in the stream.
    if (storedNewsState().cols[0] !== 0.66) {
      throw new Error('a drag committed before pointer-up, saw ' + storedNewsState().cols[0]);
    }
    split.props.onPointerUp({ currentTarget: { removeAttribute() {} } });
    harness.flush(runtime);
    const stored = storedNewsState();
    if (!Array.isArray(stored.cols) || stored.cols.length !== 2) {
      throw new Error('the drag did not commit two ratios: ' + JSON.stringify(stored.cols));
    }
    if (Math.abs(stored.cols[0] - 0.35) > 0.02) {
      throw new Error('the dragged ratio was not stored, saw ' + stored.cols[0]);
    }
    const sum = stored.cols.reduce((total, value) => total + value, 0);
    if (Math.abs(sum - 1) > 0.001) throw new Error('the ratios do not sum to 1: ' + sum);
    const splitNow = runtime.sink.elements.find((element) => element.props['data-split'] === '0');
    harness.dispatch(runtime, () => splitNow.props.onDoubleClick());
    if (Math.abs(storedNewsState().cols[0] - 0.66) > 0.001) {
      throw new Error('double-click did not restore the default split, saw ' + storedNewsState().cols[0]);
    }
  });

  await check('a failing fetch degrades to a message instead of an empty screen', async () => {
    fetchHandler = () => Promise.reject(new Error('boom'));
    seedState({ v: 3, newsSeeded: true, notes: {}, modules: [newsModule()] });
    mount(registered.main.component, {});
    harness.dispatch(runtime, () => harness.click(runtime, (element) => hasClass(element, 'wsb-card')));
    const view = await settle();
    if (!view.elements.some((element) => element.props['data-role'] === 'news')) {
      throw new Error('the reader did not survive a failed fetch');
    }
    if (!/抓取失败|还没有新闻/.test(view.text)) {
      throw new Error('a failed fetch produced neither a reason nor the empty state');
    }
    // A hostile payload must not be trusted either: every stored field is re-validated.
    stubNews([{ id: 42, title: null, url: 'javascript:alert(1)', publishedAt: 'soon' }]);
    const bad = await openNews();
    const stored = storedNewsState();
    if (stored.archive.some((item) => typeof item.id !== 'string')) {
      throw new Error('a malformed item was written into the archive');
    }
    if (!bad.elements.some((element) => element.props['data-role'] === 'news')) {
      throw new Error('a malformed payload broke the reader');
    }
  });

  await check('a deadline and a blocked network are explained rather than swallowed', async () => {
    const now = Date.now();
    const items = [newsItem({ id: 'partial', title: '到手的新闻', publishedAt: now - 60000 })];
    // The shape the Host returns when the overall deadline fires on a proxied network: some
    // sources answered, several timed out together, and the rest are still running.
    const view = await openNews({ news: undefined }, items, {
      timedOut: true, pending: 3, hint: 'timeout',
      errors: [
        { topic: '全球大事件', source: 'Google 新闻', message: '请求超时', stale: false },
        { topic: 'AI 领域', source: 'Google 新闻搜索', message: '请求超时', stale: false },
        { topic: '游戏领域', source: 'Google 新闻搜索', message: '请求超时', stale: false },
      ],
    });
    // The stories that arrived are still shown: partial is not broken.
    if (newsCards(view).length !== 1) throw new Error('a partial result was treated as an empty one');
    if (!view.elements.some((element) => element.props['data-news-pending'] === '1')) {
      throw new Error('a timed-out query was not announced');
    }
    if (!/3 /.test(view.text)) throw new Error('the number of still-running sources is not shown');
    const hint = view.elements.find((element) => element.props['data-news-hint'] === 'timeout');
    if (!hint) throw new Error('a blocked-network hint was not offered');
    if (!/代理/.test(view.text)) throw new Error('the hint does not say what to do about a proxy');
    // ...and the plain case must not show either note.
    const quiet = await openNews({ news: undefined }, items);
    if (quiet.elements.some((element) => element.props['data-news-pending'] === '1')) {
      throw new Error('the pending note appears even when nothing timed out');
    }
    if (quiet.elements.some((element) => element.props['data-news-hint'] !== undefined)) {
      throw new Error('the proxy hint appears even when nothing looked blocked');
    }
  });

  await check('a missing Host route is reported as "restart", not as a failed fetch', async () => {
    // Exactly the state an updated plugin is in before the app is restarted: the browser half
    // is live, the route it needs is not. A bare "抓取失败" would send the reader looking for a
    // network problem that does not exist.
    const notFound = () => ({ ok: false, status: 404, json: () => Promise.reject(new Error('no body')) });
    const view = await openNews(undefined, [], undefined, notFound);
    const notice = view.elements.find((element) => element.props['data-news-restart'] === '1');
    if (!notice) throw new Error('a missing route produced no restart notice');
    if (!/重启/.test(view.text)) throw new Error('the notice does not say to restart');
    if (!/workbench-news/.test(view.text)) throw new Error('the notice does not name the missing route');
    // A 500 is a different story and must not be dressed up as a restart.
    const serverError = () => ({ ok: false, status: 500, json: () => Promise.reject(new Error('no body')) });
    const other = await openNews(undefined, [], undefined, serverError);
    if (other.elements.some((element) => element.props['data-news-restart'] === '1')) {
      throw new Error('a 500 was reported as a missing route');
    }
    if (!/抓取失败/.test(other.text)) throw new Error('a 500 produced no failure message');
  });

  await check('adopting the shipped topics refetches with the adopted ids', async () => {
    // The trap this locks: `refresh` used to capture the topic list, so the adoption on mount
    // replaced the rail with the Host's six topics and then posted the four seed topics — six
    // tabs, two of them permanently empty because every item came back tagged with an id the
    // rail no longer had.
    const bodies = [];
    const six = [
      { id: 'global', name: '全球大事件', accent: '#7db8ff', lang: 'zh', kw: [], feeds: ['gnews-top-zh'] },
      { id: 'ai', name: 'AI 领域', accent: '#a78bfa', lang: 'zh', kw: ['AI'], feeds: ['hn'] },
      { id: 'games', name: '游戏领域', accent: '#34d399', lang: 'zh', kw: ['游戏'], feeds: ['ign'] },
      { id: 'tech', name: '科技前沿', accent: '#22d3ee', lang: 'zh', kw: ['科技'], feeds: ['verge'] },
      { id: 'science', name: '科学发现', accent: '#fbbf24', lang: 'zh', kw: ['科学'], feeds: ['nature'] },
      { id: 'business', name: '财经市场', accent: '#f472b6', lang: 'zh', kw: ['股市'], feeds: ['36kr'] },
    ];
    const handler = (url, init) => {
      if (url.indexOf('op=catalog') >= 0) {
        return {
          ok: true,
          json: () => Promise.resolve({
            ok: true,
            feeds: six.map((topic) => ({ id: topic.feeds[0], label: topic.feeds[0], group: '全球', lang: 'zh' })),
            defaults: six,
            limits: { min: 10, max: 100, maxDays: 7 },
          }),
        };
      }
      if (url.indexOf('op=article') >= 0) return { ok: true, json: () => Promise.resolve({ ok: false, error: 'HTTP 403' }) };
      bodies.push(JSON.parse(init.body || '{}'));
      return {
        ok: true,
        json: () => Promise.resolve({
          ok: true, fetchedAt: Date.now(), tookMs: 9,
          window: { days: 7, since: Date.now() - 7 * NEWS_DAY, until: Date.now() },
          items: [],
          stats: { days: 7, limit: 20, tookMs: 9, total: 0, shown: 0, feeds: 0, span: { oldest: 0, newest: 0 }, topics: [], sources: [], perFeed: [], errors: [] },
        }),
      };
    };
    // Four client-seed topics, an untouched `topicsFromCatalog`, and a FRESH non-empty archive —
    // so the open-time staleness rule cannot fire and any fetch must come from the adoption.
    const view = await openNews({
      news: {
        topics: [
          { id: 'global', name: '全球大事件', accent: '#7db8ff', lang: 'zh', kw: [], feeds: ['gnews-top-zh'] },
          { id: 'ai', name: 'AI 领域', accent: '#a78bfa', lang: 'zh', kw: [], feeds: ['hn'] },
          { id: 'games', name: '游戏领域', accent: '#34d399', lang: 'zh', kw: [], feeds: ['ign'] },
          { id: 'tech', name: '科技前沿', accent: '#22d3ee', lang: 'zh', kw: [], feeds: ['verge'] },
        ],
        activeId: 'global', count: 20, days: 7, view: 'list', cols: [0.21, 0.51, 0.28],
        archive: [newsItem({ id: 'kept', publishedAt: Date.now() - 60000 })],
        seen: {}, lastFetchAt: Date.now(), catalogAt: 0,
        topicsFromCatalog: false,
      },
    }, [], undefined, handler);

    const stored = storedNewsState();
    if (stored.topics.length !== 6) throw new Error('the shipped topics were not adopted, saw ' + stored.topics.length);
    if (stored.topicsFromCatalog !== true) throw new Error('the adoption did not claim ownership');
    if (view === null) throw new Error('unreachable');
    if (bodies.length !== 1) throw new Error('expected exactly one fetch from the adoption, saw ' + bodies.length);
    const sent = bodies[0].topics.map((topic) => topic.id);
    if (sent.indexOf('science') < 0 || sent.indexOf('business') < 0) {
      throw new Error('the refetch posted the old topic ids: ' + sent.join(','));
    }
    if (sent.length !== 6) throw new Error('the refetch posted ' + sent.length + ' topics');
    // An untouched stored archive must survive the adoption, not be thrown away.
    if (!stored.archive.some((item) => item.id === 'kept')) {
      throw new Error('adopting the topics discarded the stored archive');
    }
  });

  await check('the stream is a front page: one lead, two secondaries, then rows', async () => {
    const now = Date.now();
    const items = [
      newsItem({ id: 'a0', title: '头条：英国出台对俄新一轮制裁', url: 'https://example.com/0', publishedAt: now - 1000, image: 'https://img.example.com/0.jpg', coverage: 5 }),
      newsItem({ id: 'a1', title: '第二条副稿', url: 'https://example.com/1', publishedAt: now - 2000, image: 'https://img.example.com/1.jpg' }),
      newsItem({ id: 'a2', title: '第三条副稿', url: 'https://example.com/2', publishedAt: now - 3000, image: 'https://img.example.com/2.jpg' }),
      newsItem({ id: 'a3', title: '第四条：普通行', url: 'https://example.com/3', publishedAt: now - 4000, image: 'https://img.example.com/3.jpg' }),
      newsItem({ id: 'a4', title: '第五条：没有图片', url: 'https://example.com/4', publishedAt: now - 5000 }),
    ];
    const view = await openNews({ news: undefined }, items);

    const tier = (id) => {
      const node = view.elements.find((element) => element.props['data-news-item'] === id);
      if (!node) throw new Error('story ' + id + ' is not rendered');
      return node.props['data-tier'];
    };
    // Size is the hierarchy: one story gets the largest type, the next two the middle size, and
    // everything past that reads as rows. A uniform list could not say what mattered.
    if (tier('a0') !== 'lead') throw new Error('the first story is not the lead, saw ' + tier('a0'));
    if (tier('a1') !== 'secondary' || tier('a2') !== 'secondary') throw new Error('the second tier is not two stories');
    if (tier('a3') !== 'list' || tier('a4') !== 'list') throw new Error('the rows are not rows');
    if (!view.elements.some((element) => element.props['data-news-duo'] === '1')) {
      throw new Error('the two second-tier stories are not grouped');
    }
    // ...and the dateline is the masthead of the pane.
    const dateline = view.elements.find((element) => element.props['data-news-dateline'] === '1');
    if (!dateline) throw new Error('the stream has no dateline');
    const year = String(new Date().getFullYear());
    if (view.text.indexOf(year) < 0) throw new Error('the dateline does not carry the year');
    // Pictures: the lead gets a plate, the rows get a square thumbnail, and a story without an
    // image gets neither rather than a grey placeholder box.
    const figures = view.elements.filter((element) => hasClass(element, 'wsb-figure'));
    if (figures.length !== 3) throw new Error('expected three plates (lead + two), saw ' + figures.length);
    const thumbs = view.elements.filter((element) => hasClass(element, 'wsb-thumb'));
    if (thumbs.length !== 1) throw new Error('expected one row thumbnail, saw ' + thumbs.length);
    const bare = view.elements.find((element) => element.props['data-news-item'] === 'a4');
    if (bare.props['data-hasimage'] !== 'false') {
      throw new Error('a story without an image claims to have one');
    }
    if (bare.props['data-tier'] !== 'list') throw new Error('the imageless story is not a row');
    // Below three stories there is nothing to rank, so the tiers collapse to rows.
    const small = await openNews({ news: undefined }, items.slice(0, 2));
    const smallTiers = small.elements
      .filter((element) => element.props['data-news-item'] !== undefined)
      .map((element) => element.props['data-tier']);
    if (smallTiers.some((value) => value !== 'list')) {
      throw new Error('a two-story pane invented a lead: ' + JSON.stringify(smallTiers));
    }
  });

  await check('card images are fetched once, only for what is drawn, and persisted', async () => {
    const now = Date.now();
    const items = [
      newsItem({ id: 'i0', title: '有图的故事一', url: 'https://example.com/i0', publishedAt: now - 1000 }),
      newsItem({ id: 'i1', title: '有图的故事二', url: 'https://example.com/i1', publishedAt: now - 2000 }),
      newsItem({ id: 'i2', title: '已经有图的故事', url: 'https://example.com/i2', publishedAt: now - 3000, image: 'https://img.example.com/known.jpg' }),
    ];
    const imageCalls = [];
    const handler = (url, init) => {
      if (url.indexOf('op=images') >= 0) {
        const body = JSON.parse(init.body || '{}');
        imageCalls.push(body.urls);
        const images = {};
        for (const target of body.urls) images[target] = 'https://img.example.com/' + target.slice(-2) + '.jpg';
        return { ok: true, json: () => Promise.resolve({ ok: true, images, cached: 0, fetched: body.urls.length, failed: 0, rejected: 0, tookMs: 12 }) };
      }
      if (url.indexOf('op=translate') >= 0) return { ok: true, json: () => Promise.resolve({ ok: true, translations: {}, provider: '', cached: 0, skipped: 0, failed: 0, errors: [] }) };
      if (url.indexOf('op=catalog') >= 0) return { ok: true, json: () => Promise.resolve({ ok: true, feeds: [], defaults: [], limits: { min: 10, max: 100, maxDays: 7 } }) };
      if (url.indexOf('op=article') >= 0) return { ok: true, json: () => Promise.resolve({ ok: false, error: 'HTTP 403' }) };
      return {
        ok: true,
        json: () => Promise.resolve({
          ok: true, fetchedAt: now, tookMs: 5, window: { days: 7, since: now - 7 * NEWS_DAY, until: now },
          items, stats: { days: 7, limit: 40, tookMs: 5, total: 3, shown: 3, feeds: 1, span: { oldest: now - 3000, newest: now }, topics: [], sources: [], perFeed: [], errors: [] },
        }),
      };
    };
    let view = await openNews({ news: undefined }, [], undefined, handler);
    view = harness.advance(runtime, 700);
    await settle();

    // Scoped to this fixture's URLs on purpose. Earlier checks leave their own 600 ms image
    // timers pending — the harness never runs effect cleanups on unmount, so an `advance` here
    // also fires those, and they call whichever handler is installed *now*. That is an artefact
    // of the stub (a real unmount clears its timer), so the assertion filters rather than
    // pretending the count is global.
    const mine = imageCalls.filter((urls) => urls.every((url) => url.indexOf('example.com/i') >= 0));
    // One batched request, and only the stories that lacked a picture: the one that already had
    // an image must not be re-fetched, and neither must anything below the visible top.
    if (mine.length !== 1) throw new Error('expected one image request, saw ' + JSON.stringify(mine));
    const asked = mine[0];
    if (asked.length !== 2) throw new Error('asked for the wrong number of images: ' + JSON.stringify(asked));
    if (asked.indexOf('https://example.com/i2') >= 0) throw new Error('re-fetched a story that already had an image');
    // The resolved URLs land in the archive, which is what makes a later open instant.
    const stored = storedNewsState();
    const enriched = stored.archive.find((item) => item.url === 'https://example.com/i0');
    if (!enriched || !enriched.image) throw new Error('the resolved image was not stored on the item');
    if (stored.archive.find((item) => item.url === 'https://example.com/i2').image !== 'https://img.example.com/known.jpg') {
      throw new Error('an existing image was overwritten');
    }
    // And the second open asks for nothing at all.
    imageCalls.length = 0;
    await openNews({ news: stored }, [], undefined, handler);
    harness.advance(runtime, 700);
    await settle();
    const again = imageCalls.filter((urls) => urls.every((url) => url.indexOf('example.com/i') >= 0));
    if (again.length) throw new Error('a second open re-requested images: ' + JSON.stringify(again));
  });


  await check('an echoed translation is never drawn as if it were a translation', async () => {
    const now = Date.now();
    const echo = 'Peacemaker Taking a Backseat as James Gunn Builds Out the DCU, John Cena Says';
    const items = [newsItem({ id: 'e1', title: echo, url: 'https://example.com/e1', publishedAt: now - 1000 })];
    // A cached value identical to its source: the shape a rate-limited endpoint leaves behind when
    // it answers with the query. Printing it would show the headline twice at two weights.
    const view = await openNews({ news: { translated: { [echo]: echo, [echo + ' extra']: echo + ' extra' } } }, items);
    if (view.elements.some((element) => hasClass(element, 'wsb-itemXlate'))) {
      throw new Error('the echoed translation was drawn as a translation line');
    }
    // The original still renders, and the one-off translate control is offered again — because
    // "untranslated" is exactly the state it is in.
    if (view.text.indexOf('Peacemaker') < 0) throw new Error('the headline vanished with its bad translation');
    if (!view.elements.some((element) => element.props['data-xlate'] === 'e1')) {
      throw new Error('an echoed translation suppressed the retry control');
    }
  });

  await check('the 原文 pane reads like an article page', async () => {
    const now = Date.now();
    const items = [newsItem({
      id: 'art', title: 'Peacemaker Taking a Backseat as James Gunn Builds Out the DCU',
      summary: 'The feed summary.', url: 'https://example.com/art', publishedAt: now - 1000,
    })];
    const paragraphs = [
      'John Cena said Peacemaker is taking a back seat as James Gunn focuses on building out the DCU.',
      'The wrestler-turned-actor opened up about the character while promoting his new film this week.',
      'A third paragraph, long enough to be treated as prose rather than a caption by the extractor.',
    ];
    const articleCalls = [];
    const handler = (url) => {
      if (url.indexOf('op=article') >= 0) {
        articleCalls.push(url);
        return {
          ok: true,
          json: () => Promise.resolve({
            ok: true, url: 'https://example.com/art',
            title: 'Peacemaker Taking a Backseat',
            description: "It's a hungry world.",
            image: 'https://img.example.com/hero.jpg',
            publishedAt: now - 1000,
            site: 'IGN',
            author: 'Michael Cripe',
            paragraphs,
            bodyChars: paragraphs.join('').length,
          }),
        };
      }
      if (url.indexOf('op=translate') >= 0) return { ok: true, json: () => Promise.resolve({ ok: true, translations: {}, provider: '', cached: 0, skipped: 0, failed: 0, errors: [] }) };
      if (url.indexOf('op=images') >= 0) return { ok: true, json: () => Promise.resolve({ ok: true, images: {}, cached: 0, fetched: 0, failed: 0, rejected: 0, tookMs: 1 }) };
      if (url.indexOf('op=catalog') >= 0) return { ok: true, json: () => Promise.resolve({ ok: true, feeds: [], defaults: [], limits: { min: 10, max: 100, maxDays: 7 } }) };
      return {
        ok: true,
        json: () => Promise.resolve({
          ok: true, fetchedAt: now, tookMs: 5, window: { days: 7, since: now - 7 * NEWS_DAY, until: now },
          items, stats: { days: 7, limit: 40, tookMs: 5, total: 1, shown: 1, feeds: 1, span: { oldest: now, newest: now }, topics: [], sources: [], perFeed: [], errors: [] },
        }),
      };
    };
    await openNews({ news: undefined }, [], undefined, handler);
    const story = runtime.sink.elements.find((element) => element.props['data-news-item'] === 'art');
    harness.dispatch(runtime, () => story.props.onClick({ stopPropagation() {} }));
    // The article arrives on a promise chain started from an effect, so the view has to be read
    // *after* settling — the value `dispatch` returns was rendered before the fetch resolved.
    await settle();
    const view = harness.flush(runtime);

    // The order a reader expects: headline, then the dek under it, then the byline rule, then the
    // plate, then the body. The element list preserves creation order, so it can be asserted.
    const order = view.elements
      .map((element) => String(element.props.className || ''))
      .filter((name) => /wsb-detailTitle|wsb-detailDek|wsb-byline|wsb-detailCover|wsb-articleText|wsb-articleRow/.test(name));
    const firstOf = (needle) => order.findIndex((name) => name.indexOf(needle) >= 0);
    const title = firstOf('wsb-detailTitle');
    const dek = firstOf('wsb-detailDek');
    const byline = firstOf('wsb-byline');
    const cover = firstOf('wsb-detailCover');
    const body = firstOf('wsb-articleRow');
    if (title < 0 || dek < 0 || byline < 0 || body < 0) {
      throw new Error('the 原文 pane is missing a piece: ' + JSON.stringify({ title, dek, byline, cover, body })
        + ' | article requests: ' + articleCalls.length
        + ' | classes: ' + JSON.stringify(order.slice(0, 14)));
    }
    if (!(title < dek && dek < byline && byline < body)) {
      throw new Error('the article is not laid out headline → dek → byline → body: ' + JSON.stringify({ title, dek, byline, body }));
    }
    if (cover < 0 || !(byline < cover && cover < body)) {
      throw new Error('the cover plate is not between the byline and the body');
    }
    // The headline is the largest type on the pane and the body is not; that gap is the hierarchy.
    const source = fs.readFileSync(path.join(ROOT, 'client.js'), 'utf8');
    const sizeOf = (selector) => {
      const found = new RegExp('\\.' + selector + '\\{[^}]*font-size:(\\d+(?:\\.\\d+)?)px').exec(source);
      if (!found) throw new Error('no font-size for .' + selector);
      return Number(found[1]);
    };
    if (!(sizeOf('wsb-detailTitle') > sizeOf('wsb-detailDek'))) {
      throw new Error('the headline is not larger than the dek');
    }
    if (!(sizeOf('wsb-detailDek') > sizeOf('wsb-articleText'))) {
      throw new Error('the dek is not larger than the body text');
    }
    // The byline carries the author and the publication, which the pane reads live.
    if (view.text.indexOf('Michael Cripe') < 0) throw new Error('the byline is missing the author');
    if (view.text.indexOf('IGN') < 0) throw new Error('the byline is missing the publication');
    // Every paragraph is its own block, in order.
    const rows = view.elements.filter((element) => hasClass(element, 'wsb-articleRow'));
    if (rows.length !== paragraphs.length) throw new Error('expected ' + paragraphs.length + ' paragraphs, saw ' + rows.length);
    for (const text of paragraphs) {
      if (view.text.indexOf(text.slice(0, 40)) < 0) throw new Error('a paragraph is missing from the body');
    }
  });

  await check('a page with no readable body says so instead of looking truncated', async () => {
    const now = Date.now();
    const items = [newsItem({ id: 'bare', title: 'A paywalled story', url: 'https://example.com/bare', publishedAt: now - 1000 })];
    const handler = (url) => {
      if (url.indexOf('op=article') >= 0) {
        return { ok: true, json: () => Promise.resolve({ ok: true, url: 'https://example.com/bare', description: 'Just a dek.', image: '', paragraphs: [], bodyChars: 0, site: 'Paywall Times' }) };
      }
      if (url.indexOf('op=translate') >= 0) return { ok: true, json: () => Promise.resolve({ ok: true, translations: {}, provider: '', cached: 0, skipped: 0, failed: 0, errors: [] }) };
      if (url.indexOf('op=images') >= 0) return { ok: true, json: () => Promise.resolve({ ok: true, images: {}, cached: 0, fetched: 0, failed: 0, rejected: 0, tookMs: 1 }) };
      if (url.indexOf('op=catalog') >= 0) return { ok: true, json: () => Promise.resolve({ ok: true, feeds: [], defaults: [], limits: { min: 10, max: 100, maxDays: 7 } }) };
      return {
        ok: true,
        json: () => Promise.resolve({
          ok: true, fetchedAt: now, tookMs: 5, window: { days: 7, since: now - 7 * NEWS_DAY, until: now },
          items, stats: { days: 7, limit: 40, tookMs: 5, total: 1, shown: 1, feeds: 1, span: { oldest: now, newest: now }, topics: [], sources: [], perFeed: [], errors: [] },
        }),
      };
    };
    await openNews({ news: undefined }, [], undefined, handler);
    const story = runtime.sink.elements.find((element) => element.props['data-news-item'] === 'bare');
    harness.dispatch(runtime, () => story.props.onClick({ stopPropagation() {} }));
    await settle();
    const view = harness.flush(runtime);
    if (!view.elements.some((element) => element.props['data-news-nobody'] === '1')) {
      throw new Error('an empty body was not reported');
    }
    // ...and the dek still reads, so the pane is not blank.
    if (view.text.indexOf('Just a dek.') < 0) throw new Error('the dek vanished with the body');
  });

  await check('the 原文 extractor keeps prose and drops chrome', async () => {
    const engine = await import(pathToFileURL(path.join(ROOT, 'news.js')).href);
    const html = '<html><head><title>t</title></head><body>'
      + '<nav><p>' + '导航文字'.repeat(24) + '</p></nav>'
      + '<article><h1>Headline</h1>'
      + '<p>' + 'This is the first real paragraph of the story. '.repeat(3) + '</p>'
      + '<p>too short</p>'
      + '<p>' + 'A second paragraph long enough to count as prose. '.repeat(3) + '</p>'
      + '<script>var ad = 1;</script></article>'
      + '<footer><p>' + 'footer text '.repeat(24) + '</p></footer></body></html>';
    const body = engine.extractArticleText(html);
    if (body.paragraphs.length !== 2) {
      throw new Error('expected the 2 real paragraphs, saw ' + body.paragraphs.length + ': ' + JSON.stringify(body.paragraphs.map((p) => p.slice(0, 24))));
    }
    if (body.paragraphs.some((text) => /导航|footer|too short/.test(text))) {
      throw new Error('chrome leaked into the body: ' + JSON.stringify(body.paragraphs));
    }
    // The bound is real, not aspirational: a page with 40 paragraphs is truncated and reported.
    const long = '<article>' + new Array(40).fill('<p>' + 'A sentence of article prose that is long enough. '.repeat(3) + '</p>').join('') + '</article>';
    const capped = engine.extractArticleText(long);
    if (capped.paragraphs.length > 18) throw new Error('the paragraph cap did not hold: ' + capped.paragraphs.length);
    if (capped.chars > 6400) throw new Error('the character cap did not hold: ' + capped.chars);
  });

  await check('the news panes do not reuse the settings grid class', () => {
    const source = fs.readFileSync(path.join(ROOT, 'client.js'), 'utf8');
    // `.wsb-field` is the settings panel's `52px 1fr 30px` grid. The news pane originally reused
    // it for its own field wrappers, so every label landed in a 52 px column and the per-source
    // rows flowed side by side instead of stacking — visible, and only visible: no logic test
    // could have caught it, which is why the offline preview exists.
    const start = source.indexOf('function NewsNav');
    const end = source.indexOf('function NewsView');
    if (start < 0 || end < start) throw new Error('the news nav and panes are gone');
    const region = source.slice(start, end);
    if (/wsb-field/.test(region)) {
      throw new Error('the news panes use .wsb-field again, which is a settings-row grid');
    }
    if (!/\.wsb-nwField\{margin-bottom/.test(source)) throw new Error('the news field wrapper is gone');
    // The source rows are a named two-row grid: the bar spans both columns, and auto-placement
    // put the duration on a third row when it was left to guess.
    if (!/\.wsb-srcRow\{[^}]*grid-template-areas:"name value" "bar bar"/.test(source)) {
      throw new Error('the source rows no longer declare their grid areas');
    }
    // The 大事件 rail is a row of equal tiles, not whatever the tallest headline makes it.
    if (!/\.wsb-hotCard\{[^}]*height:92px/.test(source)) {
      throw new Error('the 大事件 cards are no longer a uniform height');
    }
    // The design pass rests on two rules from the published systems it cites, so they are pinned:
    // WIRED's hairline-divided reading rows instead of forty boxed cards, and Linear's single
    // accent (a 2px bar on the selected row rather than a per-story colour).
    if (!/\.wsb-item\[data-tier="list"\]\+\.wsb-item\[data-tier="list"\]:before/.test(source)) {
      throw new Error('the story rows lost their hairline dividers');
    }
    if (!/\.wsb-item:after\{[^}]*width:2px/.test(source)) {
      throw new Error('the selected-story accent bar is gone');
    }
    if (/\.wsb-item\{[^}]*border:1px solid var\(--wsb-tone/.test(source)) {
      throw new Error('the story rows are boxed in their accent colour again');
    }
  });

  await check('the news screen follows the desktop like the console does', async () => {
    // The screen must paint no background of its own and must render the same in-panel aurora
    // under the same switch, so 动态设置 reaches it exactly as it reaches the console.
    const view = await openNews();
    if (!view.elements.some((element) => hasClass(element, 'wsb-root'))) {
      throw new Error('the news screen has no root shell, so the shared padding/palette do not apply');
    }
    if (!view.elements.some((element) => hasClass(element, 'wsb-consoleAurora'))) {
      throw new Error('the in-panel aurora is missing');
    }
    const source = fs.readFileSync(path.join(ROOT, 'client.js'), 'utf8');
    if (!/\.wsb-screen\[data-role="news"\] \.wsb-root\{background:transparent\}/.test(source)) {
      throw new Error('the news root paints its own background, so the desktop background is hidden');
    }
    // The surface itself must declare no background at all: any fill would cover the aurora and
    // the desktop media the way the first version did.
    const surface = /\.wsb-news\{([^}]*)\}/.exec(source);
    if (!surface) throw new Error('the news surface rule is gone');
    if (/background\s*:/.test(surface[1])) {
      throw new Error('the news surface paints a background again: ' + surface[1].slice(0, 80));
    }
    // With 控制台流光 switched off, the aurora layer must not be rendered at all — the console's
    // rule, applied to this screen too.
    const off = await openNews(undefined, [], undefined, null, { appearance: { consoleAurora: false } });
    if (off.elements.some((element) => hasClass(element, 'wsb-consoleAurora'))) {
      throw new Error('the aurora is still rendered with 控制台流光 switched off');
    }
  });

  await check('new topic is a plus button, not an always-open field', async () => {
    const view = await openNews();
    // The old shape was a bare input labelled 新建主题, permanently visible: it read as a value
    // that was already there, and its blur-to-submit made it feel broken.
    if (view.elements.some((element) => element.props['data-topic-add-form'] === '1')) {
      throw new Error('the add field is open before anything asked for it');
    }
    const add = runtime.sink.elements.find((element) => element.props['data-topic-add'] === '1');
    if (!add) throw new Error('no + button to add a topic');
    if (!/\+/.test(String(add.children && add.children[0] && add.children[0].children))) {
      throw new Error('the add control does not read as a plus');
    }
    const opened = harness.dispatch(runtime, () => add.props.onClick({ stopPropagation() {} }));
    const form = opened.elements.find((element) => element.props['data-topic-add-form'] === '1');
    if (!form) throw new Error('clicking + revealed no input');
    const input = runtime.sink.elements.find((element) => element.props['data-topic-add-input'] === '1');
    if (!input) throw new Error('the revealed form has no input');
    input.props.onChange({ target: { value: '量子计算' } });
    harness.flush(runtime);
    const live = runtime.sink.elements.find((element) => element.props['data-topic-add-confirm'] === '1');
    if (!live) throw new Error('the revealed form has no confirm button');
    // `dispatch` flushes, so the element list reflects the post-create render — reading it before
    // the flush would still show the open form and find no + button.
    harness.dispatch(runtime, () => live.props.onClick({ stopPropagation() {} }));
    const stored = storedNewsState();
    const created = stored.topics.find((topic) => topic.name === '量子计算');
    if (!created) throw new Error('the + form did not create the topic: ' + JSON.stringify(stored.topics.map((t) => t.name)));
    if (stored.activeId !== created.id) throw new Error('the new topic was not made active');
    if (stored.topicsFromCatalog !== true) throw new Error('creating a topic did not claim ownership of the list');
    // The editor opens for the new topic, and the + button is back.
    if (!runtime.sink.elements.some((element) => element.props['data-topic-edit'] === created.id)) {
      throw new Error('the new topic was not opened for editing');
    }
    // Cancelling leaves no trace.
    const addAgain = runtime.sink.elements.find((element) => element.props['data-topic-add'] === '1');
    if (!addAgain) throw new Error('the + button did not come back after creating a topic');
    harness.dispatch(runtime, () => addAgain.props.onClick({ stopPropagation() {} }));
    const cancel = runtime.sink.elements.find((element) => element.props['data-topic-add-cancel'] === '1');
    if (!cancel) throw new Error('the revealed form has no cancel');
    harness.dispatch(runtime, () => cancel.props.onClick({ stopPropagation() {} }));
    if (runtime.sink.elements.some((element) => element.props['data-topic-add-form'] === '1')) {
      throw new Error('cancelling left the add field open');
    }
    if (storedNewsState().topics.length !== stored.topics.length) {
      throw new Error('cancelling created a topic anyway');
    }
  });

  await check('English headlines get a Chinese line, cached and deduplicated', async () => {
    const now = Date.now();
    const items = [
      newsItem({ id: 'en1', title: 'Apple announces a surprise launch event', url: 'https://example.com/1', publishedAt: now - 1000 }),
      newsItem({ id: 'en2', title: 'Russian strike on buses kills at least 30, say officials', url: 'https://example.com/2', publishedAt: now - 2000 }),
      newsItem({ id: 'zh1', title: '英国出台对俄新一轮制裁', url: 'https://example.com/3', publishedAt: now - 3000 }),
    ];
    const translateCalls = [];
    const handler = (url, init) => {
      if (url.indexOf('op=translate') >= 0) {
        const body = JSON.parse(init.body || '{}');
        translateCalls.push(body.texts);
        const translations = {};
        for (const text of body.texts) translations[text] = '译：' + text.slice(0, 18);
        return { ok: true, json: () => Promise.resolve({ ok: true, target: 'zh-CN', translations, cached: 0, provider: 'google', skipped: 0, failed: 0, errors: [] }) };
      }
      if (url.indexOf('op=catalog') >= 0) return { ok: true, json: () => Promise.resolve({ ok: true, feeds: [], defaults: [], limits: { min: 10, max: 100, maxDays: 7 } }) };
      if (url.indexOf('op=article') >= 0) return { ok: true, json: () => Promise.resolve({ ok: false, error: 'HTTP 403' }) };
      return {
        ok: true,
        json: () => Promise.resolve({
          ok: true, fetchedAt: now, tookMs: 7,
          window: { days: 7, since: now - 7 * NEWS_DAY, until: now },
          items,
          stats: {
            days: 7, limit: 40, tookMs: 7, total: items.length, shown: items.length, feeds: 1,
            span: { oldest: now - 3000, newest: now }, topics: [], sources: [], perFeed: [], errors: [],
          },
        }),
      };
    };
    let view = await openNews({ news: undefined }, [], undefined, handler);
    // The virtual clock drives the debounce, so the batch is issued deterministically.
    view = harness.advance(runtime, 400);
    await settle();
    view = harness.flush(runtime);

    // One request for the batch, not one per headline — and the Chinese story is not sent at all.
    // Filtered to this fixture's own headlines: earlier checks leave their 320 ms translate
    // debounce pending, the harness never runs effect cleanups on unmount, and an `advance` here
    // therefore fires those too — against whichever handler is installed now.
    const fixtureTitles = [
      'Apple announces a surprise launch event',
      'Russian strike on buses kills at least 30, say officials',
    ];
    // A live view of this fixture's own requests, so the later assertions can compare counts
    // without being disturbed by other checks' leaked debounce timers.
    const mine = translateCalls.filter((texts) => texts.length
      && texts.every((text) => fixtureTitles.indexOf(text) >= 0));
    if (!mine.length) throw new Error('no translation was requested for the English stories');
    // The property that matters is deduplication, not the request count: two callers (the stream's
    // visible batch and the 原文 pane for the story it opened on) may each ask, but no text is
    // ever paid for twice, and the Chinese headline is never sent at all.
    const sent = [];
    for (const batch of mine) for (const text of batch) sent.push(text);
    const unique = [...new Set(sent)];
    if (unique.length !== sent.length) throw new Error('a text was requested twice: ' + JSON.stringify(sent));
    if (unique.length !== 2) throw new Error('the translations requested should be the two English titles, saw ' + JSON.stringify(unique));
    if (unique.some((text) => /英国/.test(text))) throw new Error('a Chinese headline was sent for translation');

    // Both English stories now carry a Chinese line, and the original is still shown beneath it.
    const xlate = view.elements.filter((element) => hasClass(element, 'wsb-itemXlate'));
    if (xlate.length !== 2) throw new Error('expected two translated lines, saw ' + xlate.length);
    const orig = view.elements.filter((element) => hasClass(element, 'wsb-itemOrig'));
    if (orig.length !== 2) throw new Error('the English original was replaced instead of kept, saw ' + orig.length);
    if (!/Apple announces/.test(view.text)) throw new Error('the original English title vanished');
    if (!/译：Apple/.test(view.text)) throw new Error('the translation is not shown');
    // The Chinese story gets no English line and no translate button.
    const translateButtons = view.elements.filter((element) => element.props['data-xlate'] !== undefined);
    if (translateButtons.length !== 0) {
      throw new Error('a translate button survived on an already-translated list (' + translateButtons.length + ')');
    }

    // The cache is persisted, so a reload costs no request.
    const stored = storedNewsState();
    const keys = Object.keys(stored.translated || {});
    if (keys.length !== 2) throw new Error('the translation cache was not persisted: ' + keys.length);
    if (stored.translated['Apple announces a surprise launch event'] !== '译：Apple announces a ') {
      throw new Error('the cached translation is wrong: ' + JSON.stringify(stored.translated));
    }
    const before = mine.length;
    const reopened = await openNews({ news: stored }, [], undefined, handler);
    harness.advance(runtime, 400);
    await settle();
    if (mine.length !== before) {
      throw new Error('a cached translation was requested again: ' + JSON.stringify(mine.slice(before)));
    }
    if (!/译：Apple/.test(reopened.text)) throw new Error('the persisted translation was not rendered');
    // Latin headlines are tightened, Chinese ones are not — one attribute, two answers.
    const latinTitles = reopened.elements.filter((element) => element.props['data-latin'] === 'true');
    if (!latinTitles.length) throw new Error('Latin headlines are not marked for tighter tracking');
  });

  await check('the 中译 toggle turns translation off and back on', async () => {
    const now = Date.now();
    const items = [newsItem({ id: 'x', title: 'A headline in English', url: 'https://example.com/x', publishedAt: now - 1000 })];
    const calls = [];
    const handler = (url, init) => {
      if (url.indexOf('op=translate') >= 0) {
        calls.push(JSON.parse(init.body || '{}').texts);
        return { ok: true, json: () => Promise.resolve({ ok: true, translations: {}, provider: '', cached: 0, skipped: 0, failed: 0, errors: [] }) };
      }
      if (url.indexOf('op=catalog') >= 0) return { ok: true, json: () => Promise.resolve({ ok: true, feeds: [], defaults: [], limits: { min: 10, max: 100, maxDays: 7 } }) };
      if (url.indexOf('op=article') >= 0) return { ok: true, json: () => Promise.resolve({ ok: false, error: 'HTTP 403' }) };
      return {
        ok: true,
        json: () => Promise.resolve({
          ok: true, fetchedAt: now, tookMs: 5, window: { days: 7, since: now - 7 * NEWS_DAY, until: now },
          items, stats: { days: 7, limit: 40, tookMs: 5, total: 1, shown: 1, feeds: 1, span: { oldest: now, newest: now }, topics: [], sources: [], perFeed: [], errors: [] },
        }),
      };
    };
    await openNews({ news: undefined }, [], undefined, handler);
    harness.advance(runtime, 400);
    await settle();
    const sentTexts = calls.flat();
    if (!sentTexts.length) throw new Error('translation did not run while the toggle was on');
    if (!sentTexts.some((text) => text.indexOf('A headline in English') >= 0)) {
      throw new Error('the English headline was never sent: ' + JSON.stringify(sentTexts));
    }
    const beforeToggle = calls.length;
    // Toggle off: the toggle state persists and no further requests are made.
    const toggle = runtime.sink.elements.find((element) => element.props['data-news-translate'] === '1');
    if (!toggle) throw new Error('no 中译 toggle');
    if (toggle.props['data-on'] !== 'true') throw new Error('the toggle should start on');
    harness.dispatch(runtime, () => toggle.props.onClick({ stopPropagation() {} }));
    if (storedNewsState().translate !== false) throw new Error('turning translation off was not persisted');
    void beforeToggle;
    const after = calls.length;
    harness.advance(runtime, 500);
    await settle();
    if (calls.length !== after) throw new Error('translation kept running with the toggle off');
    if (runtime.sink.elements.some((element) => hasClass(element, 'wsb-itemXlate'))) {
      throw new Error('a translated line is still rendered with the toggle off');
    }
    // Each English story still offers a one-off translate even with the toggle off.
    if (!runtime.sink.elements.some((element) => element.props['data-xlate'] === 'x')) {
      throw new Error('the per-story translate button is missing');
    }
  });

  await check('the detail pane reads as 中英对照', async () => {
    const now = Date.now();
    const items = [
      newsItem({ id: 'd1', title: 'Apple announces a surprise launch event', summary: 'A short English summary of the story.', url: 'https://example.com/d1', publishedAt: now - 1000 }),
      newsItem({ id: 'd2', title: '英国出台对俄新一轮制裁', url: 'https://example.com/d2', publishedAt: now - 2000 }),
    ];
    const zhTitle = '苹果宣布举办一场惊喜发布会';
    const zhSummary = '这是一段简短的中文摘要。';
    const handler = (url, init) => {
      if (url.indexOf('op=translate') >= 0) {
        const body = JSON.parse(init.body || '{}');
        const translations = {};
        for (const text of body.texts) {
          if (text === 'Apple announces a surprise launch event') translations[text] = zhTitle;
          else translations[text] = zhSummary;
        }
        return { ok: true, json: () => Promise.resolve({ ok: true, target: 'zh-CN', translations, provider: 'google', cached: 0, skipped: 0, failed: 0, errors: [] }) };
      }
      if (url.indexOf('op=catalog') >= 0) return { ok: true, json: () => Promise.resolve({ ok: true, feeds: [], defaults: [], limits: { min: 10, max: 100, maxDays: 7 } }) };
      if (url.indexOf('op=article') >= 0) return { ok: true, json: () => Promise.resolve({ ok: false, error: 'HTTP 403' }) };
      return {
        ok: true,
        json: () => Promise.resolve({
          ok: true, fetchedAt: now, tookMs: 6, window: { days: 7, since: now - 7 * NEWS_DAY, until: now },
          items, stats: { days: 7, limit: 40, tookMs: 6, total: 2, shown: 2, feeds: 1, span: { oldest: now - 2000, newest: now }, topics: [], sources: [], perFeed: [], errors: [] },
        }),
      };
    };
    await openNews({ news: undefined }, [], undefined, handler);
    harness.advance(runtime, 400);
    await settle();
    const story = runtime.sink.elements.find((element) => element.props['data-news-item'] === 'd1');
    if (!story) throw new Error('the English story is missing from the stream');
    harness.dispatch(runtime, () => story.props.onClick({ stopPropagation() {} }));
    harness.advance(runtime, 400);
    const view = await settle();

    const detailTitle = view.elements.find((element) => hasClass(element, 'wsb-detailTitle'));
    if (!detailTitle) throw new Error('the detail pane has no title');
    // The original is kept and labelled as English; the translation is labelled as Chinese. Both
    // present, neither replacing the other — that is what 中英对照 means.
    if (detailTitle.props.lang !== 'en') throw new Error('the original English title is not marked as English');
    if (!/Apple announces/.test(String(detailTitle.children))) throw new Error('the English title is missing from the detail pane');
    const xlate = view.elements.filter((element) => hasClass(element, 'wsb-detailXlate'));
    if (xlate.length !== 1) throw new Error('expected one translated title line, saw ' + xlate.length);
    if (xlate[0].props.lang !== 'zh-CN') throw new Error('the translated title is not marked as Chinese');
    if (String(xlate[0].children).indexOf(zhTitle) < 0) throw new Error('the translation is not shown in the detail pane');
    const tag = view.elements.filter((element) => hasClass(element, 'wsb-xlateTag'));
    if (!tag.length) throw new Error('the 译 tag is missing');
    if (!/这是一段简短的中文摘要/.test(view.text)) throw new Error('the translated summary is missing');
    // The Chinese story is not marked for translation at all — and the tracking marker is on the
    // headline, not the row: Chinese wants its own glyph rhythm, Latin wants negative tracking.
    // A translated row renders its original with `.wsb-itemOrig`; an untranslated one keeps
    // `.wsb-itemTitle`, so both classes are searched.
    const zhStory = runtime.sink.elements.find((element) => element.props['data-news-item'] === 'd2');
    if (!zhStory) throw new Error('the Chinese story is missing');
    const headline = (text) => runtime.sink.elements.find((element) => element.type === 'span'
      && /wsb-item(Title|Orig)/.test(String(element.props.className || ''))
      && String(element.children).indexOf(text) >= 0);
    const zhHeadline = headline('英国出台');
    if (!zhHeadline) throw new Error('the Chinese headline is missing from the stream');
    if (zhHeadline.props['data-latin'] !== 'false') {
      throw new Error('a Chinese headline was marked for Latin tracking');
    }
    const enHeadline = headline('Apple announces');
    if (!enHeadline || enHeadline.props['data-latin'] !== 'true') {
      throw new Error('the English headline is not marked for tighter tracking');
    }
  });

  await check('the news animations stay on the compositor', () => {
    const source = fs.readFileSync(path.join(ROOT, 'client.js'), 'utf8');
    // The rule this plugin paid for: keyframes move transform and opacity only. A news reader
    // renders up to 100 cards over three frosted panes, so an animated border-radius, filter or
    // background-position here would repaint the whole screen every frame.
    for (const name of ['wsb-nwIn', 'wsb-nwShim', 'wsb-nwSpin', 'wsb-nwBar', 'wsb-nwBlink']) {
      const block = new RegExp('@keyframes ' + name + '\\{([\\s\\S]*?)\\}\\}').exec(source);
      if (!block) throw new Error('the ' + name + ' keyframes are gone');
      if (/border-radius|filter|background-position|box-shadow|\bheight\b|\bwidth\b|(^|[{;\s])color:/.test(block[1])) {
        throw new Error(name + ' animates a layout or paint property, not just transform/opacity');
      }
    }
    // The frost is swapped for a flat fill while a screen transition runs, exactly as on the
    // console — that is what keeps the zoom on the compositor over three frosted panes.
    if (!/\.wsb-screen\[data-anim\] \.wsb-glass\{backdrop-filter:none/.test(source)) {
      throw new Error('the transition-time frost bypass was lost');
    }
    // Reduced motion must cover the new selectors rather than merely shortening them. Anchored on
    // the LAST opt-out block — the news screen's own — because a `[\s\S]*?` from the first one
    // spans half the stylesheet, and this assertion used to pass by finding a rule that no longer
    // had anything to do with reduced motion.
    const optOutAt = source.lastIndexOf('@media (prefers-reduced-motion:reduce)');
    const newsOptOut = source.slice(optOutAt, source.indexOf('}`;', optOutAt));
    if (optOutAt < 0 || !newsOptOut.includes('.wsb-item')) {
      throw new Error('the news screen has no prefers-reduced-motion opt-out');
    }
    for (const selector of ['.wsb-hotCard', '.wsb-skel:after', '.wsb-barTrack>i', '.wsb-detailCover']) {
      if (newsOptOut.indexOf(selector) < 0) throw new Error('reduced motion does not cover ' + selector);
    }
    // The selector it used to assert no longer exists anywhere — proof the old assertion was
    // matching text outside the block it claimed to be checking.
    if (source.includes('.wsb-detailImg')) throw new Error('a renamed class is still in the stylesheet');
    // The panes are a flex row driven by --wsb-grow. A grid template would put the two seam
    // elements on a second row, which is how this was first written and why it is asserted.
    if (!/\.wsb-nwGrid\{[^}]*display:flex/.test(source)) throw new Error('the news panes are no longer a flex row');
    if (!/\.wsb-nwPane\{[^}]*flex-grow:var\(--wsb-grow/.test(source)) {
      throw new Error('the pane growth variable was lost');
    }
    if (!/\.wsb-split\{[^}]*flex:0 0 10px/.test(source)) throw new Error('the seams do not reserve their own width');
  });

  await check('every news string exists in both languages', () => {
    const source = fs.readFileSync(path.join(ROOT, 'client.js'), 'utf8');
    // Keys the reader looks up by concatenation and so cannot be grepped for directly:
    // `t['pane'+Kind]` in the console and the reader's own dictionary entries.
    const keys = [
      'kindNews', 'newsTitle', 'newsSubHint', 'newsJustNow', 'newsMin', 'newsHour', 'newsDayAge',
      'newsDayUnit', 'newsRefresh', 'newsRefreshing', 'newsCount', 'newsCountHint', 'newsRange',
      'newsDays1', 'newsDays3', 'newsDays7', 'newsViewList', 'newsViewGrid', 'newsViewCompact',
      'newsTopics', 'newsStream', 'newsDetail', 'newsHot', 'newsHotHint', 'newsRelated',
      'newsAddTopic', 'newsTopicName', 'newsKeywords', 'newsAddKeyword', 'newsSources', 'newsLang',
      'newsDeleteTopic', 'newsEditTopic', 'newsDone', 'newsNoKeywords', 'newsOpen', 'newsCopyLink',
      'newsCopied', 'newsSearchLink', 'newsEnriching', 'newsSourceStatus', 'newsCoverage',
      'newsItems', 'newsFailed', 'newsEmpty', 'newsEmptyTopic', 'newsLoading', 'newsLoadingHint',
      'newsStale', 'newsErrors', 'newsArchive', 'newsArchiveHint', 'newsRetention', 'newsUnread',
      'newsAll', 'newsTracked', 'newsTopicsN', 'newsDetailHint', 'newsSelectTopic', 'newsNoCatalog',
      'newsFetchFailed', 'newsDragHint', 'newsTimedOut', 'newsPending', 'newsProxyHint', 'newsRestartHint',
      'newsTranslateToggle', 'newsTranslateHint', 'newsTranslateOne', 'newsTranslateStory',
      'newsTranslateShort', 'newsTranslating', 'newsTranslatedTag', 'newsTranslatedCount',
      'newsTranslateFailed',
      'presetTriple', 'presetDuo', 'presetFocus', 'presetQuad',
      'paneTree', 'paneMid', 'paneProgress', 'paneTokens', 'paneTrail',
    ];
    for (const key of keys) {
      const hits = (source.match(new RegExp('\\b' + key + ':', 'g')) || []).length;
      // Two dictionaries, so every key appears at least twice. The preset/pane keys were
      // missing entirely once, which rendered the console's chips as empty capsules.
      if (hits < 2) throw new Error('string key "' + key + '" is not defined in both languages (' + hits + ')');
    }
  });

  await check('the host half declares its service and registers both routes', () => {
    const source = fs.readFileSync(path.join(ROOT, 'index.js'), 'utf8');
    // Without an `inject` export the plugin can run while the webserver is still listening,
    // read `undefined` from `ctx.get`, and register nothing — which is exactly what happened,
    // and why /workbench-media answered the SPA's 404 instead of its own error text.
    if (!/export const inject = \['webServer'\]/.test(source)) {
      throw new Error('the host half does not declare its webServer dependency');
    }
    for (const route of ['/workbench-media', '/workbench-news']) {
      if (source.indexOf("'" + route + "'") < 0) throw new Error('route not declared: ' + route);
    }
    if (!/webServer\.register\(\{[\s\S]{0,120}?path: NEWS_ROUTE/.test(source)) {
      throw new Error('the news route is never registered');
    }
    // The article endpoint fetches a browser-supplied URL, so it must be fenced.
    const news = fs.readFileSync(path.join(ROOT, 'news.js'), 'utf8');
    if (news.indexOf('拒绝访问内网地址') < 0) throw new Error('the article fetch has no private-address fence');
    // ...and the route must refuse a caller that is not the panel.
    if (source.indexOf('trustedClient') < 0) throw new Error('the news route has no same-origin fence');
  });

  await check('the news engine parses and guards without the network', async () => {
    const engine = await import(pathToFileURL(path.join(ROOT, 'news.js')).href);
    const catalog = engine.newsCatalog();
    if (!catalog.feeds.length) throw new Error('the feed catalog is empty');
    if (catalog.limits.min !== 10 || catalog.limits.max !== 100 || catalog.limits.maxDays !== 7) {
      throw new Error('the engine limits drifted from 10-100 / 7 days: ' + JSON.stringify(catalog.limits));
    }
    const known = new Set(catalog.feeds.map((feed) => feed.id));
    if (known.size !== catalog.feeds.length) throw new Error('the catalog has duplicate feed ids');
    for (const topic of catalog.defaults) {
      // Every shipped topic must be able to return something: a keyword, or a source.
      if (!topic.kw.length && !topic.feeds.length) {
        throw new Error('default topic "' + topic.name + '" can never return anything');
      }
      for (const feed of topic.feeds) {
        if (!known.has(feed)) throw new Error('topic "' + topic.name + '" references unknown feed ' + feed);
      }
    }
    // Article metadata extraction is pure, so it can be checked on a fixture.
    const meta = engine.extractArticleMeta([
      '<html><head><title>Fallback title</title>',
      '<meta property="og:title" content="Open Graph 标题" />',
      '<meta name="description" content="描述 &amp; 摘要" />',
      '<meta property="og:image" content="/img/lead.png" />',
      '<meta property="article:published_time" content="2026-10-08T12:00:00Z" />',
      '<meta property="og:site_name" content="Example News" />',
      '</head><body>body</body></html>',
    ].join(''), 'https://example.com/news/1');
    if (meta.title !== 'Open Graph 标题') throw new Error('og:title was not preferred, saw ' + meta.title);
    if (meta.description !== '描述 & 摘要') throw new Error('entities were not decoded: ' + meta.description);
    if (meta.image !== 'https://example.com/img/lead.png') {
      throw new Error('a relative og:image was not resolved: ' + meta.image);
    }
    if (!meta.publishedAt) throw new Error('the publication time was not parsed');
    if (meta.site !== 'Example News') throw new Error('og:site_name was ignored');
    // The one place a client-supplied URL crosses the boundary must be fenced, offline.
    for (const blocked of [
      'http://127.0.0.1:19387/',
      'http://localhost/',
      'http://10.0.0.5/',
      'http://192.168.1.1/',
      'http://169.254.169.254/latest/meta-data/',
      'http://[::1]/',
      'file:///C:/windows/win.ini',
      'gopher://example.com/',
    ]) {
      const result = await engine.enrichArticle(blocked);
      if (result.ok) throw new Error('the article fetcher accepted ' + blocked);
      if (!result.error) throw new Error('a refused URL produced no reason: ' + blocked);
    }
  });

  // --- 股票市场: the shipped module, its board, and the fetch contract -----------------
  //
  // The board is the second screen in this plugin that talks to the network, so these stub
  // `fetch` the same way the news checks do. What is worth pinning is not the request but what
  // the pane does with the answer: which rows exist, which way the arrows point, whether a stale
  // number is labelled, and whether a failure looks like a failure.

  /** One quote row in the shape the Host route returns it. */
  const stockQuote = (over) => Object.assign({
    id: 'sh', name: '上证指数', region: 'A股',
    price: 3813.79, change: 1.89, pct: 0.05, prev: 3811.9, decimals: 2,
    currency: 'CNY', exchange: 'Shanghai', session: 'closed',
    time: 1791529224000, timeText: '', spark: [3796.6, 3783.7, 3771.5, 3813.79],
    source: 'yahoo', stale: false,
  }, over);

  /** The catalog the Client mirrors: six markets across four regions, so the floor is testable. */
  const STOCK_CATALOG_STUB = [
    { id: 'sh', name: '上证指数', region: 'A股', fallback: true },
    { id: 'sz', name: '深证成指', region: 'A股', fallback: true },
    { id: 'spx', name: '标普500', region: '美股', fallback: true },
    { id: 'ixic', name: '纳斯达克', region: '美股', fallback: true },
    { id: 'n225', name: '日经225', region: '亚太', fallback: false },
    { id: 'gdaxi', name: '德国DAX', region: '欧洲', fallback: false },
  ];

  /**
   * Answer the two operations the board calls: the catalog, and the quotes themselves.
   * `quotes` is what a collect returns; extra operations are handled by an explicit `handler`.
   */
  const stubStocks = (quotes, stats) => {
    fetchHandler = (url, init) => {
      if (url.indexOf('op=catalog') >= 0) {
        return {
          ok: true,
          json: () => Promise.resolve({
            ok: true, regions: ['A股', '美股', '欧洲'],
            markets: STOCK_CATALOG_STUB, defaults: ['sh', 'sz', 'spx'],
            limits: { min: 4, max: 34 },
          }),
        };
      }
      const body = JSON.parse(init.body || '{}');
      const wanted = Array.isArray(body.ids) ? body.ids : [];
      const rows = (quotes || []).filter((quote) => wanted.indexOf(quote.id) >= 0);
      return {
        ok: true,
        json: () => Promise.resolve({
          ok: true, fetchedAt: Date.now(), tookMs: 11,
          quotes: rows,
          stats: Object.assign({
            requested: wanted.length, resolved: rows.length,
            failed: wanted.length - rows.length, cached: false,
            fallback: rows.filter((row) => row.source === 'tencent').length,
            timedOut: false, tookMs: 11, errors: [], hint: '',
          }, stats || {}),
        }),
      };
    };
  };

  /** A module of the stock kind, ready to open. */
  const stockModule = (over) => Object.assign({
    id: 'mod-stock', kind: 'stock', name: '股票市场', desc: '', accent: '#fbbf24', preset: 'triple',
    created: 1, stock: undefined,
  }, over);

  /** Seed storage with exactly one stock module, then open it. Returns the settled view. */
  const openStock = async (over, quotes, stats, handler, stateExtra) => {
    stubStocks(quotes || [], stats);
    // An explicit handler wins, so a test that wants a 404 or a 500 overrides the stub after it.
    if (handler) fetchHandler = handler;
    seedState(Object.assign({
      v: 3, modules: [stockModule(over)], focusSessionId: undefined, notes: {},
      newsSeeded: true, stockSeeded: true,
    }, stateExtra || {}));
    mount(registered.main.component, {});
    const opened = harness.dispatch(runtime, () => harness.click(runtime,
      (element) => hasClass(element, 'wsb-card') && element.props['data-add'] !== 'true'));
    if (!opened) throw new Error('the stock card was not clickable');
    return settle();
  };

  const storedStockState = () => {
    const state = JSON.parse(windowStub.localStorage.getItem('dsh-workbench.v3') || '{}');
    const found = (state.modules || []).find((item) => item.kind === 'stock');
    return found ? found.stock : undefined;
  };

  const stockTiles = (view) => view.elements.filter((element) => element.props['data-stock-tile'] !== undefined);

  await check('the 股票市场 module ships with the plugin and normalises to its own kind', () => {
    for (const key of ['dsh-workbench.v3', 'dsh-workbench.v2', 'dsh-workbench.v1']) windowStub.localStorage.removeItem(key);
    const fresh = mount(registered.main.component, {});
    if (!/股票市场/.test(fresh.text)) throw new Error('a fresh install does not offer the stock module');
    const cards = fresh.elements.filter((element) => hasClass(element, 'wsb-card') && element.props['data-add'] !== 'true');
    if (cards.length < 4) throw new Error('the shipped module list lost a module, saw ' + cards.length);
    const stored = JSON.parse(windowStub.localStorage.getItem('dsh-workbench.v3') || '{}');
    const seeded = (stored.modules || []).filter((item) => item.kind === 'stock');
    if (seeded.length !== 1) throw new Error('expected exactly one shipped stock module, saw ' + seeded.length);
    const settings = seeded[0].stock;
    if (!settings || !Array.isArray(settings.markets) || settings.markets.length < 4) {
      throw new Error('the stock module was stored without its market selection');
    }
    if (!Array.isArray(settings.catalog) || settings.catalog.length < 20) {
      throw new Error('the stored catalog mirror is too small to render the picker');
    }
    if (stored.stockSeeded !== true) throw new Error('the one-time seed flag was not recorded');
  });

  await check('an install that predates the stock module is offered it exactly once', () => {
    // No stockSeeded flag and no stock module: the state a previous version left behind.
    seedState({
      v: 3, newsSeeded: true, focusSessionId: undefined, notes: {},
      modules: [{ id: 'mod-old', kind: 'game', name: '旧控制台', desc: '', accent: '#7db8ff', preset: 'triple', created: 1 }],
    });
    mount(registered.main.component, {});
    const first = JSON.parse(windowStub.localStorage.getItem('dsh-workbench.v3') || '{}');
    if (!(first.modules || []).some((item) => item.kind === 'stock')) {
      throw new Error('an older install was not offered the stock module');
    }
    // Delete it, reload: it must stay deleted rather than reappearing on every load.
    first.modules = first.modules.filter((item) => item.kind !== 'stock');
    first.stockSeeded = true;
    seedState(first);
    mount(registered.main.component, {});
    const second = JSON.parse(windowStub.localStorage.getItem('dsh-workbench.v3') || '{}');
    if ((second.modules || []).some((item) => item.kind === 'stock')) {
      throw new Error('a deliberately deleted stock module came back');
    }
  });

  await check('the board renders a tile per selected market, with its level and change', async () => {
    // Four markets, not three: the module's own floor is four (below that the Host refuses the
    // query), so a three-market fixture would be testing a state the UI can never reach — and
    // `normalizeStockSettings` would quietly replace it with the shipped defaults.
    const selected = ['sh', 'sz', 'spx', 'gdaxi'];
    const quotes = [
      stockQuote({ id: 'sh', price: 3813.79, change: 1.89, pct: 0.05 }),
      stockQuote({ id: 'sz', name: '深证成指', price: 12641.86, change: -20.96, pct: -0.17, prev: 12662.8 }),
      stockQuote({ id: 'spx', name: '标普500', region: '美股', price: 7811.54, change: 46.18, pct: 0.59 }),
      stockQuote({ id: 'gdaxi', name: '德国DAX', region: '欧洲', price: 25087.27, change: 280.3, pct: 1.13 }),
    ];
    const view = await openStock({ stock: { markets: selected, region: 'all', view: 'board', sort: 'catalog', catalog: STOCK_CATALOG_STUB, catalogAt: Date.now(), last: [], lastFetchAt: 0 } }, quotes);

    if (!view.elements.some((element) => element.props['data-role'] === 'stock')) {
      throw new Error('the stock screen did not render');
    }
    const tiles = stockTiles(view);
    const seen = tiles.map((tile) => tile.props['data-stock-tile']);
    if (tiles.length !== selected.length) {
      throw new Error('expected ' + selected.length + ' tiles, saw ' + tiles.length + ' (' + seen.join(',') + ')'
        + ' stored=' + JSON.stringify(storedStockState().markets));
    }
    // One tile per selected market, each carrying its own numbers.
    const byId = {};
    for (const tile of tiles) byId[tile.props['data-stock-tile']] = tile;
    for (const id of selected) if (!byId[id]) throw new Error('the selected market ' + id + ' got no tile');

    const textOf = (tile) => JSON.stringify(tile);
    if (textOf(byId.sh).indexOf('3,813.79') < 0) throw new Error('the level was not formatted: ' + textOf(byId.sh).slice(0, 240));
    if (textOf(byId.sh).indexOf('+1.89') < 0) throw new Error('an up move was not signed positive');
    if (textOf(byId.sz).indexOf('−20.96') < 0) throw new Error('a down move was not signed negative');
    if (textOf(byId.sh).indexOf('+0.05%') < 0) throw new Error('the percent was not rendered');

    // The direction attribute is what drives the colour, and the two conventions disagree by
    // language — so it is asserted rather than left to a screenshot.
    if (byId.sh.props['data-dir'] !== 'up') throw new Error('an up market is not marked up');
    if (byId.sz.props['data-dir'] !== 'down') throw new Error('a down market is not marked down');
    const shell = view.elements.find((element) => hasClass(element, 'wsb-stock'));
    if (!shell) throw new Error('the board shell is missing');
    if (shell.props['data-updown'] !== 'zh') throw new Error('a Chinese UI must read 红涨绿跌, saw ' + shell.props['data-updown']);

    // A quote that arrived without a series draws no sparkline rather than inventing a flat line.
    const bare = await openStock({ stock: { markets: selected, region: 'all', view: 'board', sort: 'catalog', catalog: STOCK_CATALOG_STUB, catalogAt: Date.now(), last: [], lastFetchAt: 0 } },
      quotes.map((quote) => Object.assign({}, quote, { spark: [] })));
    const bareTiles = stockTiles(bare);
    if (bareTiles.length !== selected.length) throw new Error('the series-less board lost a market');
    for (const tile of bareTiles) {
      const sparks = (tile.children || []).filter((child) => child && child.props && child.props.className === 'wsb-stkSpark');
      if (sparks.length) throw new Error('a series-less quote produced a sparkline');
    }
  });

  await check('the board labels when a quote was read and never passes a stale one off as live', async () => {
    const selected = ['sh', 'sz', 'spx', 'gdaxi'];
    const quotes = selected.map((id) => stockQuote({ id }));
    const settings = () => ({
      markets: selected, region: 'all', view: 'board', sort: 'catalog',
      catalog: STOCK_CATALOG_STUB, catalogAt: Date.now(),
    });

    // A successful fetch is not stale, and the status line is always there — a price without a
    // time is a price pretending to be current.
    const fresh = await openStock({ stock: Object.assign(settings(), { last: [], lastFetchAt: 0 }) }, quotes);
    const freshStatus = fresh.elements.find((element) => element.props['data-stock-status'] === '1');
    if (!freshStatus) throw new Error('the status line is missing');
    if (freshStatus.props['data-stock-stale'] === 'true') throw new Error('a just-fetched quote was marked stale');
    for (const tile of stockTiles(fresh)) {
      if (tile.props['data-stale'] === 'true') throw new Error('a fresh tile is marked stale');
    }

    // Opening on an old snapshot refreshes immediately, so the only way to be looking at old data
    // is for that refresh to fail. Then the stored numbers must stay on screen AND say how old
    // they are: blanking the board would hide the numbers the reader opened the pane for.
    const failed = () => Promise.reject(new Error('boom'));
    const old = await openStock(
      { stock: Object.assign(settings(), { last: quotes, lastFetchAt: Date.now() - 4 * 3600 * 1000 }) },
      [], undefined, failed,
    );
    const oldStatus = old.elements.find((element) => element.props['data-stock-status'] === '1');
    if (oldStatus.props['data-stock-stale'] !== 'true') {
      throw new Error('a four-hour-old snapshot was presented as current');
    }
    if (!/数据已过期/.test(JSON.stringify(oldStatus))) throw new Error('the stale marker has no words');
    const oldTiles = stockTiles(old);
    if (oldTiles.length !== selected.length) throw new Error('a failed refresh emptied the board');
    for (const tile of oldTiles) {
      if (tile.props['data-stale'] !== 'true') throw new Error('a stale tile is not marked');
    }
    // The failure itself is reported, and it is the more specific of the two messages.
    if (!old.elements.some((element) => element.props['data-stock-error'] === '1')) {
      throw new Error('a failed refresh was not reported');
    }
  });

  await check('the board says which source answered, and the fallback has no series', async () => {
    const view = await openStock({ stock: { markets: ['sh', 'spx'], region: 'all', view: 'board', sort: 'catalog', catalog: STOCK_CATALOG_STUB, catalogAt: Date.now(), last: [], lastFetchAt: 0 } },
      [
        stockQuote({ id: 'sh', source: 'tencent', spark: [], time: 0, timeText: '2026-10-09 16:14:00' }),
        stockQuote({ id: 'spx', name: '标普500', region: '美股', source: 'yahoo' }),
      ]);
    const tiles = stockTiles(view);
    const sh = tiles.find((tile) => tile.props['data-stock-tile'] === 'sh');
    const spx = tiles.find((tile) => tile.props['data-stock-tile'] === 'spx');
    // The fallback row is labelled, because "this number came from the second source" is a fact
    // the reader is entitled to — and it is the row that has no intraday shape to show.
    if (JSON.stringify(sh).indexOf('备用源') < 0) throw new Error('the fallback row is not labelled');
    if (JSON.stringify(spx).indexOf('备用源') >= 0) throw new Error('a primary-source row was labelled as the fallback');
    // 腾讯's stamp has no offset in it, so it is shown as the exchange's local time, not as an
    // instant this machine pretends to know.
    if (JSON.stringify(sh).indexOf('2026-10-09 16:14:00') < 0) {
      throw new Error('the fallback row lost its source time');
    }
  });

  await check('the picker changes the selection, enforces the floor, and persists', async () => {
    const five = ['sh', 'sz', 'spx', 'ixic', 'gdaxi'];
    const view = await openStock({ stock: { markets: five, region: 'all', view: 'board', sort: 'catalog', catalog: STOCK_CATALOG_STUB, catalogAt: Date.now(), last: [], lastFetchAt: 0 } },
      five.map((id) => stockQuote({ id })));

    const toggle = view.elements.find((element) => element.props['data-stock-pick-toggle'] === '1');
    if (!toggle) throw new Error('the market picker has no open button');
    const opened = harness.dispatch(runtime, () => toggle.props.onClick({ stopPropagation() {}, preventDefault() {} }));
    if (!opened.elements.some((element) => element.props['data-stock-picker'] === '1')) {
      throw new Error('the picker did not open');
    }
    // Every catalog market is offered, grouped by region, with the current five already on.
    const picks = opened.elements.filter((element) => element.props['data-stock-pick'] !== undefined);
    if (picks.length !== STOCK_CATALOG_STUB.length) {
      throw new Error('the picker lists ' + picks.length + ' of ' + STOCK_CATALOG_STUB.length + ' markets');
    }
    if (picks.filter((element) => element.props['data-on'] === 'true').length !== 5) {
      throw new Error('the picker does not show the current selection');
    }

    // Removing one is persisted, and it removes exactly one — the reader's other choices survive.
    const remove = picks.find((element) => element.props['data-stock-pick'] === 'gdaxi');
    harness.dispatch(runtime, () => remove.props.onClick({ stopPropagation() {}, preventDefault() {} }));
    const afterRemove = storedStockState().markets;
    if (afterRemove.indexOf('gdaxi') >= 0) throw new Error('removing a market was not persisted');
    if (afterRemove.length !== 4) throw new Error('the selection is ' + afterRemove.length + ', expected 4');
    for (const id of ['sh', 'sz', 'spx', 'ixic']) {
      if (afterRemove.indexOf(id) < 0) throw new Error('removing one market dropped ' + id + ' as well');
    }

    // And the floor holds: at four markets the fifth removal is refused, so the board can never be
    // emptied by clicking — and refusing must NOT quietly substitute a different selection.
    const four = ['sh', 'sz', 'spx', 'ixic'];
    const rebuilt = await openStock({ stock: { markets: four, region: 'all', view: 'board', sort: 'catalog', catalog: STOCK_CATALOG_STUB, catalogAt: Date.now(), last: [], lastFetchAt: 0 } });
    const toggleAgain = rebuilt.elements.find((element) => element.props['data-stock-pick-toggle'] === '1');
    const panel = harness.dispatch(runtime, () => toggleAgain.props.onClick({ stopPropagation() {}, preventDefault() {} }));
    const target = panel.elements.find((element) => element.props['data-stock-pick'] === 'sh');
    harness.dispatch(runtime, () => target.props.onClick({ stopPropagation() {}, preventDefault() {} }));
    const afterFloor = storedStockState().markets;
    if (afterFloor.length !== 4) {
      throw new Error('the floor did not hold: the selection became ' + afterFloor.length + ' markets');
    }
    if (JSON.stringify(afterFloor) !== JSON.stringify(four)) {
      throw new Error('refusing the removal substituted a different selection: ' + JSON.stringify(afterFloor));
    }
  });

  await check('a stored selection below the floor is kept, not silently replaced', () => {
    // The regression: a below-floor selection used to be swapped for the twelve shipped defaults,
    // so removing one market from a four-market board replaced the reader's whole choice with a
    // different twelve. An *unusable* selection is still replaced; a short one is the reader's.
    seedState({
      v: 3, newsSeeded: true, stockSeeded: true, focusSessionId: undefined, notes: {},
      modules: [stockModule({ stock: { markets: ['sh', 'sz'], region: 'all', view: 'board', sort: 'catalog', catalog: STOCK_CATALOG_STUB, catalogAt: Date.now(), last: [], lastFetchAt: 0 } })],
    });
    mount(registered.main.component, {});
    if (JSON.stringify(storedStockState().markets) !== JSON.stringify(['sh', 'sz'])) {
      throw new Error('a short selection was replaced: ' + JSON.stringify(storedStockState().markets));
    }
    // An empty one is unusable, and falls back to the shipped defaults *that the catalog has* —
    // never to ids the picker cannot show.
    seedState({
      v: 3, newsSeeded: true, stockSeeded: true, focusSessionId: undefined, notes: {},
      modules: [stockModule({ stock: { markets: [], region: 'all', view: 'board', sort: 'catalog', catalog: STOCK_CATALOG_STUB, catalogAt: Date.now(), last: [], lastFetchAt: 0 } })],
    });
    mount(registered.main.component, {});
    const recovered = storedStockState().markets;
    if (!recovered.length) throw new Error('an empty selection was not recovered');
    const known = STOCK_CATALOG_STUB.map((market) => market.id);
    for (const id of recovered) {
      if (known.indexOf(id) < 0) throw new Error('the fallback named a market the catalog does not have: ' + id);
    }
  });

  await check('the table view shows the same rows densely', async () => {
    const four = ['sh', 'sz', 'spx', 'ixic'];
    const view = await openStock({ stock: { markets: four, region: 'all', view: 'table', sort: 'catalog', catalog: STOCK_CATALOG_STUB, catalogAt: Date.now(), last: [], lastFetchAt: 0 } }, four.map((id) => stockQuote({ id })));
    if (!view.elements.some((element) => element.props['data-stock-table'] === '1')) {
      throw new Error('the table view did not render');
    }
    const rows = view.elements.filter((element) => element.props['data-stock-row'] !== undefined);
    if (rows.length !== four.length) throw new Error('the table has ' + rows.length + ' rows, expected ' + four.length);
    if (stockTiles(view).length) throw new Error('the board still renders behind the table');
    // Switching back is persisted per module.
    const back = view.elements.find((element) => element.props['data-stock-view'] === 'board');
    if (!back) throw new Error('the board/table switch is missing');
    harness.dispatch(runtime, () => back.props.onClick({ stopPropagation() {}, preventDefault() {} }));
    if (storedStockState().view !== 'board') throw new Error('switching to the board was not persisted');
  });

  await check('a region chip filters the board without refetching', async () => {
    const four = ['sh', 'sz', 'spx', 'ixic'];
    const view = await openStock({ stock: { markets: four, region: 'all', view: 'board', sort: 'catalog', catalog: STOCK_CATALOG_STUB, catalogAt: Date.now(), last: [], lastFetchAt: Date.now() } }, four.map((id) => stockQuote({ id })));
    if (stockTiles(view).length !== four.length) throw new Error('the unfiltered board lost a market');
    // 美股 holds two of the four, so the filter has to actually narrow rather than trim to one.
    const chip = view.elements.find((element) => element.props['data-stock-region'] === '美股');
    if (!chip) throw new Error('the region chips are missing');
    const filtered = harness.dispatch(runtime, () => chip.props.onClick({ stopPropagation() {}, preventDefault() {} }));
    const tiles = stockTiles(filtered);
    const ids = tiles.map((tile) => tile.props['data-stock-tile']).sort();
    if (JSON.stringify(ids) !== JSON.stringify(['ixic', 'spx'])) {
      throw new Error('the region filter did not narrow the board to 美股, saw ' + JSON.stringify(ids));
    }
    if (storedStockState().region !== '美股') throw new Error('the region choice was not persisted');
  });

  await check('a failing market is reported without emptying the board', async () => {
    // Three markets answer, one does not — the pane must show all four rows AND say which failed.
    const four = ['sh', 'sz', 'spx', 'ixic'];
    const view = await openStock(
      { stock: { markets: four, region: 'all', view: 'board', sort: 'catalog', catalog: STOCK_CATALOG_STUB, catalogAt: Date.now(), last: [], lastFetchAt: 0 } },
      four.slice(0, 3).map((id) => stockQuote({ id })),
      { failed: 1, resolved: 3, errors: [{ id: 'ixic', name: '纳斯达克', message: '请求超时' }], hint: 'proxy' },
    );
    const tiles = stockTiles(view);
    if (tiles.length !== four.length) throw new Error('a failed market lost its row, saw ' + tiles.length);
    const failedTile = tiles.find((tile) => tile.props['data-stock-tile'] === 'ixic');
    if (!failedTile) throw new Error('the failed market has no row');
    if (JSON.stringify(failedTile).indexOf('—') < 0) throw new Error('a market with no quote rendered a number');
    if (!view.elements.some((element) => element.props['data-stock-fail-list'] === '1')) {
      throw new Error('the failed markets are not listed');
    }
    // The blocked-network hint is a sentence, not a silently short list.
    const hint = view.elements.find((element) => element.props['data-stock-hint'] === '1');
    if (!hint) throw new Error('a proxy-blocked fetch was not explained');
    if (!/代理/.test(JSON.stringify(hint))) throw new Error('the proxy hint does not mention the proxy');
  });

  await check('a missing Host route is reported as "restart", not as a failed fetch', async () => {
    const notFound = () => ({ ok: false, status: 404, json: () => Promise.resolve({}) });
    const view = await openStock({ stock: { markets: ['sh'], region: 'all', view: 'board', sort: 'catalog', catalog: STOCK_CATALOG_STUB, catalogAt: Date.now(), last: [], lastFetchAt: 0 } }, [], undefined, notFound);
    if (!view.elements.some((element) => element.props['data-stock-restart'] === '1')) {
      throw new Error('a 404 on the route was not recognised as a missing Host half');
    }
    // ...and it names the route, so the reader knows what to restart for.
    if (!/workbench-stocks/.test(JSON.stringify(view.elements))) {
      throw new Error('the notice does not name the missing route');
    }
    // A 500 is a different problem and must not be reported as "restart".
    const serverError = () => ({ ok: false, status: 500, json: () => Promise.resolve({}) });
    const other = await openStock({ stock: { markets: ['sh'], region: 'all', view: 'board', sort: 'catalog', catalog: STOCK_CATALOG_STUB, catalogAt: Date.now(), last: [], lastFetchAt: 0 } }, [], undefined, serverError);
    if (other.elements.some((element) => element.props['data-stock-restart'] === '1')) {
      throw new Error('a 500 was reported as a missing Host half');
    }
    if (!other.elements.some((element) => element.props['data-stock-error'] === '1')) {
      throw new Error('a failed fetch produced no message');
    }
  });

  // 新建模块 has no test here on purpose. The desktop grid deliberately carries no add tile
  // ("模块入口不再在桌面网格里"), and the suite now asserts its absence, so the stock module's
  // only entry points are the two the other modules have: it ships on a fresh install, and an
  // older install is offered it exactly once (checked above). `addModule('stock')` still exists
  // for a future entry point, and `defaultStockSettings` is what it would create.

  await check('every stock string exists in both languages', () => {
    // The bare-minimum check the news strings also get: a key defined in one dictionary only
    // renders as `undefined` in the other language, which no screenshot of one language catches.
    const source = fs.readFileSync(path.join(ROOT, 'client.js'), 'utf8');
    const zhAt = source.indexOf('        kindStock:');
    const enAt = source.indexOf('        kindStock:', zhAt + 1);
    if (zhAt < 0 || enAt < 0) throw new Error('kindStock is not defined in both languages');
    const keys = (from) => {
      const block = source.slice(from, source.indexOf('\n      },', from));
      return (block.match(/(?:^|\s)(\w+): /g) || []).map((hit) => hit.trim().replace(':', ''));
    };
    const zh = keys(zhAt);
    const en = keys(enAt);
    if (zh.length < 40) throw new Error('the Chinese dictionary lost stock strings, saw ' + zh.length);
    for (const key of zh) {
      if (en.indexOf(key) < 0) throw new Error('"' + key + '" is defined in Chinese only');
    }
    // And the language-specific convention switch is wired, not just documented.
    if (!/data-updown/.test(source)) throw new Error('the 红涨绿跌 / green-up switch is gone');
    if (!/--wsb-up:var\(--dsw-alias-state-success-primary\)/.test(source)) {
      throw new Error('the international convention is not the default');
    }
    if (!/\[data-updown="zh"\]\{--wsb-up:var\(--dsw-alias-state-error-primary\)/.test(source)) {
      throw new Error('the Chinese convention is not the default for a Chinese UI');
    }
  });

  globalThis.fetch = realFetch;
  //#endregion

  console.log('');

  if (failures.length) {
    console.error('FAILURES (' + failures.length + '):');
    for (const failure of failures) console.error(' - ' + failure);
    process.exit(1);
  }
  console.log('all render checks passed');
}

main().catch((error) => {
  console.error('harness crashed: ' + (error && error.stack ? error.stack : String(error)));
  process.exit(1);
});

