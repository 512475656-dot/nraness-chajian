'use strict';
/**
 * 拖动换位 v3：
 *   1) 按用户要求 —— 彻底去掉"绿色竖线"（落点指示线）。
 *   2) 修死循环残留 —— v2 里先 paneFlash(快照) 再 commit，快照时样式还带着绿高亮，
 *      于是 340ms 后又把绿高亮恢复回来 = 永远不消失。v3 先"完全复原"再给反馈。
 *   3) 反馈改为中性：被拖面板浮起+半透明；目标面板中性白描边；落下时一次白闪。全部可复原。
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
const FROM = /      \/\/ ==== 面板标题栏拖动换位 v2[\s\S]*?\n      const togglePane = /;
const hits = (src.match(new RegExp(FROM.source, 'g')) || []).length;
console.log('锚点命中 ' + hits + ' 处');
if (hits !== 1) { console.log('中止 —— 未写入。'); process.exit(1) }

const BLOCK = `      // ==== 面板标题栏拖动换位 v3（无指示线；所有模块共用；顺序存在 module.panes 里）====
      // 拖动期间只改 DOM、不 setState（控制台里上百个元素，逐帧重渲染会卡）。
      // 收尾四个来源：pointerup / pointercancel / Escape / 窗口失焦。
      // 关键顺序：先在 paneEndDrag 里把一切复原，然后才给"落地反馈" —— 所以不可能有残留。
      const paneGridRef = useRef(null);
      const paneDragRef = useRef(null);
      const PANE_KEEP = ['opacity', 'transform', 'transition', 'boxShadow', 'outline', 'outlineOffset', 'zIndex'];
      const paneSnap = (node) => {
        const saved = {};
        PANE_KEEP.forEach((key) => { saved[key] = node.style[key] });
        return saved;
      };
      const paneRestore = (node, saved) => { PANE_KEEP.forEach((key) => { node.style[key] = saved[key] || '' }) };
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
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        // ① 先无条件复原每一块面板（回到拖动前的样式）
        drag.nodes.forEach((node, index) => { if (node) paneRestore(node, drag.saved[index]) });
        if (!commit || drag.target === drag.source) return;
        // ② 复原之后才做一次落地反馈 —— 快照的是"干净样式"，所以不会残留
        const pair = [drag.nodes[drag.source], drag.nodes[drag.target]];
        pair.forEach((node) => {
          if (!node) return;
          const clean = paneSnap(node);
          node.style.transition = 'box-shadow .34s ease';
          node.style.boxShadow = '0 0 0 2px rgba(255,255,255,.5), 0 0 22px rgba(255,255,255,.22)';
          window.setTimeout(() => { paneRestore(node, clean) }, 340);
        });
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
        };
        nodes.forEach((item, index) => { drag.saved[index] = paneSnap(item) });
        // 拿起来：略微缩小 + 浮起 + 半透明（全部会复原）
        const held = nodes[source];
        held.style.transition = 'transform .16s ease,opacity .16s ease,box-shadow .16s ease';
        held.style.transform = 'scale(.985)';
        held.style.opacity = '.55';
        held.style.boxShadow = '0 18px 40px rgba(0,0,0,.45)';
        held.style.zIndex = '3';
        const markTarget = (index) => {
          const active = index >= 0 && index !== source ? nodes[index] : null;
          if (!active) return;
          paneRestore(active, drag.saved[index]);
          active.style.transition = 'box-shadow .16s ease,transform .16s ease';
          active.style.boxShadow = 'inset 0 0 0 2px rgba(255,255,255,.34)';
          active.style.transform = 'scale(1.004)';
        };
        const clearTarget = (index) => {
          const active = index >= 0 ? nodes[index] : null;
          if (active) paneRestore(active, drag.saved[index]);
        };
        drag.onMove = (moveEvent) => {
          const x = moveEvent.clientX;
          const y = moveEvent.clientY;
          let target = -1;
          for (let i = 0; i < drag.rects.length; i += 1) {
            const rect = drag.rects[i];
            if (y >= rect.top && y <= rect.bottom && x >= rect.left && x <= rect.right) { target = i; break }
          }
          if (target < 0 || target === drag.target) return;
          clearTarget(drag.target);
          drag.target = target;
          markTarget(target);
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

if (!apply) { console.log('演练：将替换为 v3（未写入）。加 --apply 应用。'); process.exit(0) }
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
fs.copyFileSync(client, client + '.before-panedrag3-' + stamp);
src = src.replace(FROM, BLOCK);
fs.writeFileSync(client, src);
try { execFileSync(process.execPath, ['--check', client], { stdio: 'pipe' }); console.log('node --check 通过') }
catch (error) {
  fs.writeFileSync(client, fs.readFileSync(client + '.before-panedrag3-' + stamp, 'utf8'));
  console.log('回滚：' + String(error.stderr || error).slice(0, 240));
  process.exit(1);
}
const hash = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').slice(0, 16);
fs.copyFileSync(client, pkg);
console.log((hash(client) === hash(pkg) ? 'hash=OK  ' : 'MISMATCH ') + path.basename(pkg));
