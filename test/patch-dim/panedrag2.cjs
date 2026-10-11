'use strict';
/**
 * 拖动换位 v2：
 *   修 BUG —— 收尾同时监听 pointerup / pointercancel / Escape / 窗口失焦，
 *   并且只保存/恢复"我改过的那几个属性"（不覆盖面板自己的内联样式）。
 *   更生动 —— 被拖面板"浮起"（缩放 + 阴影 + 过渡），目标面板整体淡绿描边高亮，
 *   落下时两个面板有一次淡绿闪光反馈，指示线加粗并带光晕。
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
const FROM = /      \/\/ ==== 面板标题栏拖动换位[\s\S]*?\n      const togglePane = /;
const hits = (src.match(new RegExp(FROM.source, 'g')) || []).length;
console.log('锚点命中 ' + hits + ' 处');
if (hits !== 1) { console.log('中止 —— 未写入。'); process.exit(1) }

const BLOCK = `      // ==== 面板标题栏拖动换位 v2（所有模块共用同一套；顺序存在 module.panes 里）====
      // 拖动期间只改 DOM、不 setState（控制台里有上百个元素，逐帧重渲染会卡）。
      // 收尾有四个来源：pointerup / pointercancel / Escape / 窗口失焦 —— 所以指示线不可能卡住。
      const paneGridRef = useRef(null);
      const paneDragRef = useRef(null);
      const PANE_KEEP = ['opacity', 'transform', 'transition', 'boxShadow', 'outline', 'outlineOffset'];
      const paneSnap = (node) => {
        const saved = {};
        PANE_KEEP.forEach((key) => { saved[key] = node.style[key] });
        return saved;
      };
      const paneRestore = (node, saved) => {
        PANE_KEEP.forEach((key) => { node.style[key] = saved[key] || '' });
      };
      const paneFlash = (nodes) => {
        nodes.forEach((node) => {
          const saved = paneSnap(node);
          node.style.transition = 'box-shadow .35s ease';
          node.style.boxShadow = '0 0 0 2px rgba(74,222,128,.85), 0 0 26px rgba(74,222,128,.45)';
          window.setTimeout(() => { paneRestore(node, saved) }, 340);
        });
      };
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
        window.removeEventListener('pointercancel', drag.onCancel);
        window.removeEventListener('blur', drag.onCancel);
        window.removeEventListener('keydown', drag.onKey, true);
        if (drag.line && drag.line.parentNode) drag.line.parentNode.removeChild(drag.line);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        Object.keys(drag.saved).forEach((index) => {
          const node = drag.nodes[Number(index)];
          if (node) paneRestore(node, drag.saved[index]);
        });
        if (!commit) return;
        paneFlash([drag.nodes[drag.source], drag.nodes[drag.target]].filter(Boolean));
        paneCommitSwap(drag.source, drag.target);
      };
      const onPanePointerDown = (event) => {
        if (event.button !== 0 || paneDragRef.current) return;
        const node = event.target;
        const head = node && node.closest ? node.closest('.wsb-paneHead') : null;
        const grid = paneGridRef.current;
        if (!head || !grid) return;
        const nodes = Array.prototype.slice.call(grid.children);
        const source = nodes.findIndex((item) => item.contains(head));
        if (source < 0) return;
        const drag = {
          nodes, source, target: source,
          rects: nodes.map((item) => item.getBoundingClientRect()),
          saved: {},
          line: document.createElement('div'),
        };
        drag.line.setAttribute('data-pane-drop', '1');
        drag.line.style.cssText = 'position:fixed;z-index:9999;width:4px;border-radius:3px;'
          + 'pointer-events:none;display:none;background:#4ade80;'
          + 'box-shadow:0 0 16px rgba(74,222,128,.95),0 0 3px rgba(255,255,255,.95)';
        document.body.appendChild(drag.line);
        nodes.forEach((item, index) => { drag.saved[index] = paneSnap(item) });
        // 拿起来的样子：略微缩小 + 浮起阴影 + 半透明，并且有过渡（不 setState）。
        const held = nodes[source];
        held.style.transition = 'transform .16s ease,opacity .16s ease,box-shadow .16s ease';
        held.style.transform = 'scale(.985)';
        held.style.opacity = '.5';
        held.style.boxShadow = '0 18px 40px rgba(0,0,0,.45)';
        drag.onMove = (moveEvent) => {
          const x = moveEvent.clientX;
          const y = moveEvent.clientY;
          let target = -1;
          for (let i = 0; i < drag.rects.length; i += 1) {
            const rect = drag.rects[i];
            if (y >= rect.top && y <= rect.bottom && x >= rect.left && x <= rect.right) { target = i; break }
          }
          if (target < 0) return;
          if (target !== drag.target) {
            const previous = nodes[drag.target];
            if (previous && drag.target !== drag.source) paneRestore(previous, drag.saved[drag.target]);
            drag.target = target;
          }
          const rect = drag.rects[target];
          const atLeft = x < rect.left + rect.width / 2;
          drag.line.style.display = 'block';
          drag.line.style.top = rect.top + 4 + 'px';
          drag.line.style.height = Math.max(24, rect.height - 8) + 'px';
          drag.line.style.left = (atLeft ? rect.left - 3 : rect.right - 1) + 'px';
          // 目标面板整块高亮描边（"这里会被换过去"）。
          if (target !== source) {
            const active = nodes[target];
            if (active) {
              active.style.transition = 'box-shadow .16s ease,transform .16s ease';
              active.style.boxShadow = 'inset 0 0 0 2px rgba(74,222,128,.6), 0 0 22px rgba(74,222,128,.25)';
              active.style.transform = 'scale(1.006)';
            }
          }
        };
        drag.onUp = () => paneEndDrag(true);
        drag.onCancel = () => paneEndDrag(false);
        drag.onKey = (keyEvent) => { if (keyEvent.key === 'Escape') paneEndDrag(false) };
        paneDragRef.current = drag;
        window.addEventListener('pointermove', drag.onMove);
        window.addEventListener('pointerup', drag.onUp);
        window.addEventListener('pointercancel', drag.onCancel);
        window.addEventListener('blur', drag.onCancel);
        window.addEventListener('keydown', drag.onKey, true);
        document.body.style.cursor = 'grabbing';
        document.body.style.userSelect = 'none';
        if (event.preventDefault) event.preventDefault();
        if (event.currentTarget && event.currentTarget.setPointerCapture) {
          try { event.currentTarget.setPointerCapture(event.pointerId) } catch (error) { /* 忽略 */ }
        }
      };
      const togglePane = `;

if (!apply) { console.log('演练：将替换为 v2（未写入）。加 --apply 应用。'); process.exit(0) }
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
fs.copyFileSync(client, client + '.before-panedrag2-' + stamp);
src = src.replace(FROM, BLOCK);
fs.writeFileSync(client, src);
try { execFileSync(process.execPath, ['--check', client], { stdio: 'pipe' }); console.log('node --check 通过') }
catch (error) {
  fs.writeFileSync(client, fs.readFileSync(client + '.before-panedrag2-' + stamp, 'utf8'));
  console.log('回滚：' + String(error.stderr || error).slice(0, 240));
  process.exit(1);
}
const hash = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').slice(0, 16);
fs.copyFileSync(client, pkg);
console.log((hash(client) === hash(pkg) ? 'hash=OK  ' : 'MISMATCH ') + path.basename(pkg));
