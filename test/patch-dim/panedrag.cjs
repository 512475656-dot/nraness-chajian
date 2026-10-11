'use strict';
/**
 * 面板标题栏拖动换位（照搬本项目"面板缝隙拖动"的思路）：
 *   · 拖动期间不触发 React 重渲染 —— 落点指示线是临时创建在 body 上的元素，位置直接写 style；
 *   · 松手时才把顺序写进 module.panes（每个模块各自记住、刷新后仍在）；
 *   · 全部用内联样式 —— 不依赖样式表，所以一定看得见。
 * 触发方式：在面板的标题栏（.wsb-paneHead）上按住左键拖动。
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const ws = path.join(__dirname, '..', '..');
const client = path.join(ws, 'client.js');
const pkg = 'C:\\Users\\Administrator\\.dsh\\profiles\\desktop\\node_modules\\@local\\dsh-workbench\\client.js';
const apply = process.argv.indexOf('--apply') >= 0;
let src = fs.readFileSync(client, 'utf8');
const MARK = '// ==== 面板标题栏拖动换位';
if (src.indexOf(MARK) >= 0) { console.log('已完成：拖动换位已在'); process.exit(0) }
const original = src;
let bad = 0;
const run = (label, re, to, expect) => {
  const want = expect === undefined ? 1 : expect;
  const hits = (src.match(new RegExp(re.source, 'g')) || []).length;
  if (hits !== want) { console.log('BAD   ' + label + '  [命中 ' + hits + '，预期 ' + want + ']'); bad += 1; return }
  src = src.replace(re, to);
  console.log('ok    ' + label);
};

// 1) 插入拖动逻辑（放在 togglePane 之前）
run('插入拖动换位逻辑',
  /(\n\s*const togglePane = \(kind\) => patchModule\(module\.id, \(target\) => \{)/,
  `
      ${MARK}（所有模块共用同一套；顺序存在 module.panes 里）====
      // 拖动期间只改 DOM、不 setState（控制台里有上百个元素，逐帧重渲染会卡）。
      const paneGridRef = useRef(null);
      const paneDragRef = useRef(null);
      const paneCommitSwap = (from, to) => {
        if (from === to || from < 0 || to < 0) return;
        patchModule(module.id, (target) => {
          const current = Array.isArray(target.panes) && target.panes.length
            ? target.panes.slice() : preset.panes.slice();
          if (from >= current.length || to >= current.length) return;
          const next = current.slice();
          const held = next[from];
          next[from] = next[to];
          next[to] = held;                       // ← 松手即完成"位置互换"
          target.panes = next;
        });
      };
      const paneEndDrag = (commit) => {
        const drag = paneDragRef.current;
        if (!drag) return;
        paneDragRef.current = null;
        window.removeEventListener('pointermove', drag.onMove);
        window.removeEventListener('pointerup', drag.onUp);
        if (drag.line && drag.line.parentNode) drag.line.parentNode.removeChild(drag.line);
        document.body.style.cursor = '';
        if (commit && drag.target !== drag.source) paneCommitSwap(drag.source, drag.target);
      };
      const onPanePointerDown = (event) => {
        if (event.button !== 0) return;
        const node = event.target;
        const head = node && node.closest ? node.closest('.wsb-paneHead') : null;
        const grid = paneGridRef.current;
        if (!head || !grid) return;
        const items = Array.prototype.slice.call(grid.children);
        const source = items.findIndex((item) => item.contains(head));
        if (source < 0) return;
        const drag = {
          source, target: source, items, rects: items.map((item) => item.getBoundingClientRect()),
          line: document.createElement('div'),
        };
        drag.line.setAttribute('data-pane-drop', '1');
        drag.line.style.cssText = 'position:fixed;z-index:9999;width:3px;border-radius:2px;'
          + 'pointer-events:none;display:none;background:#4ade80;'
          + 'box-shadow:0 0 12px rgba(74,222,128,.95),0 0 2px rgba(255,255,255,.9)';
        document.body.appendChild(drag.line);
        drag.onMove = (moveEvent) => {
          const x = moveEvent.clientX;
          const y = moveEvent.clientY;
          let target = -1;
          for (let i = 0; i < drag.rects.length; i += 1) {
            const rect = drag.rects[i];
            if (y >= rect.top && y <= rect.bottom && x >= rect.left && x <= rect.right) { target = i; break }
          }
          if (target < 0) return;
          drag.target = target;
          const rect = drag.rects[target];
          const atLeft = x < rect.left + rect.width / 2;
          drag.line.style.display = 'block';
          drag.line.style.top = rect.top + 6 + 'px';
          drag.line.style.height = Math.max(24, rect.height - 12) + 'px';
          drag.line.style.left = (atLeft ? rect.left - 2 : rect.right - 1) + 'px';
          items.forEach((item, i) => {
            item.style.opacity = i === drag.source ? '.55'
              : (i === target ? '.85' : '1');
          });
        };
        drag.onUp = () => paneEndDrag(true);
        paneDragRef.current = drag;
        window.addEventListener('pointermove', drag.onMove);
        window.addEventListener('pointerup', drag.onUp, { once: true });
        document.body.style.cursor = 'grabbing';
        // 直接改 DOM、不 setState —— 与项目自己拖面板缝隙的做法一致。
        if (event.currentTarget && event.currentTarget.setPointerCapture) {
          try { event.currentTarget.setPointerCapture(event.pointerId) } catch (error) { /* 忽略 */ }
        }
      };
$1`);

// 2) 把 ref 与指针事件挂到面板容器上
run('挂到面板容器（wsb-grid）',
  /h\('div', \{ className: 'wsb-grid', style: \{ gridTemplateColumns: paneCols \} \},\n\s*shownPanes\.map\(\(kind\) => paneFor\(kind\)\)\)/,
  `h('div', {
                  ref: paneGridRef, className: 'wsb-grid',
                  style: { gridTemplateColumns: paneCols },
                  onPointerDown: onPanePointerDown,
                },
                shownPanes.map((kind) => paneFor(kind)))`);

if (bad > 0) { console.log('\n中止：' + bad + ' 处不符 —— 未写入。'); process.exit(1) }
if (src === original) { console.log('\n无需改动。'); process.exit(0) }
if (!apply) { console.log('\n演练结束（**尚未写入**）。加 --apply 应用。'); process.exit(0) }
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
fs.copyFileSync(client, client + '.before-panedrag-' + stamp);
fs.writeFileSync(client, src);
try { execFileSync(process.execPath, ['--check', client], { stdio: 'pipe' }); console.log('node --check 通过') }
catch (error) {
  fs.writeFileSync(client, fs.readFileSync(client + '.before-panedrag-' + stamp, 'utf8'));
  console.log('回滚：' + String(error.stderr || error).slice(0, 240));
  process.exit(1);
}
const s = src.indexOf('const CSS = `'); const e = src.indexOf('\n`;', s);
const css = src.slice(s, e);
const o = (css.match(/\{/g) || []).length; const c = (css.match(/\}/g) || []).length;
console.log('CSS 括号：{ ' + o + ' } ' + c + ' ' + (o === c ? '✓' : '**不平衡**'));
const hash = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').slice(0, 16);
fs.copyFileSync(client, pkg);
console.log((hash(client) === hash(pkg) ? 'hash=OK  ' : 'MISMATCH ') + path.basename(pkg));
