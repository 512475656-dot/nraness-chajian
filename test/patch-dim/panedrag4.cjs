'use strict';
/**
 * 拖动换位 v4 —— iOS 式"实时让位 + 插入"：
 *   · 拖动期间不改 DOM 顺序、不 setState：被拖面板跟随光标（translate + 轻微倾斜 + 浮起）；
 *     位于"原位置 → 当前位置"之间的面板整体滑开一格（translate，.18s 过渡）—— 就是让位；
 *   · 松手时按"插入"写入 module.panes（其它面板自动后移），不是两两互换；
 *   · 收尾四源（pointerup / pointercancel / Esc / 失焦）：先无条件复原，再提交。
 *   · 无任何绿色元素；反馈全为中性白。
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
const FROM = /      \/\/ ==== 面板标题栏拖动换位 v3[\s\S]*?\n      const togglePane = /;
const hits = (src.match(new RegExp(FROM.source, 'g')) || []).length;
console.log('锚点命中 ' + hits + ' 处');
if (hits !== 1) { console.log('中止 —— 未写入。'); process.exit(1) }

const BLOCK = `      // ==== 面板标题栏拖动换位 v4（iOS 式实时让位 + 插入；无指示线；顺序存 module.panes）====
      // 拖动期间只改 DOM（transform），不 setState —— 控制台里上百个元素，逐帧重渲染会卡。
      // 收尾四源：pointerup / pointercancel / Escape / 窗口失焦。收尾时先无条件复原，再提交。
      const paneGridRef = useRef(null);
      const paneDragRef = useRef(null);
      const PANE_KEEP = ['opacity', 'transform', 'transition', 'boxShadow', 'zIndex', 'filter'];
      const paneSnap = (node) => {
        const saved = {};
        PANE_KEEP.forEach((key) => { saved[key] = node.style[key] });
        return saved;
      };
      const paneRestore = (node, saved) => { PANE_KEEP.forEach((key) => { node.style[key] = saved[key] || '' }) };
      const paneCommitInsert = (from, to) => {
        patchModule(module.id, (target) => {
          const current = Array.isArray(target.panes) && target.panes.length
            ? target.panes.slice() : preset.panes.slice();
          if (from < 0 || from >= current.length) return;
          const next = current.slice();
          const moved = next.splice(from, 1)[0];
          const at = Math.max(0, Math.min(next.length, to));
          next.splice(at, 0, moved);              // ← 插入：其余面板自动后移
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
        // ① 无条件复原（回到拖动前）
        drag.nodes.forEach((node, index) => { if (node) paneRestore(node, drag.saved[index]) });
        if (!commit || drag.target === drag.source) return;
        // ② 复原之后才做落地反馈（快照的是干净样式 → 不可能残留）
        const moved = drag.nodes[drag.source];
        if (moved) {
          const clean = paneSnap(moved);
          moved.style.transition = 'box-shadow .34s ease';
          moved.style.boxShadow = '0 0 0 2px rgba(255,255,255,.5), 0 0 22px rgba(255,255,255,.22)';
          window.setTimeout(() => { paneRestore(moved, clean) }, 340);
        }
        paneCommitInsert(drag.source, drag.target);
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
        const rects = nodes.map((item) => item.getBoundingClientRect());
        const gap = parseFloat(window.getComputedStyle(grid).columnGap) || 0;
        const drag = {
          nodes, source, target: source, rects, gap,
          startX: event.clientX, startY: event.clientY, saved: {},
        };
        nodes.forEach((item, index) => { drag.saved[index] = paneSnap(item) });
        // 被拖面板：拿起来（跟随光标 + 略放大 + 轻倾斜 + 浮起投影）
        const held = nodes[source];
        held.style.transition = 'box-shadow .16s ease,opacity .16s ease';
        held.style.zIndex = '5';
        held.style.opacity = '.92';
        held.style.boxShadow = '0 24px 54px rgba(0,0,0,.5)';
        held.style.transform = 'translate3d(0,0,0) scale(1.015) rotate(.6deg)';
        const band = (index) => (index > source && index <= drag.target) || (index < source && index >= drag.target);
        const slid = (index) => {
          const item = nodes[index];
          if (!item || index === source || !band(index)) return;
          const shift = (index > source ? -1 : 1) * (rects[source].width + gap);
          item.style.transition = 'transform .18s cubic-bezier(.2,.8,.2,1)';
          item.style.transform = 'translate3d(' + shift + 'px,0,0)';
        };
        const unslide = (index) => {
          const item = nodes[index];
          if (!item || index === source) return;
          paneRestore(item, drag.saved[index]);
        };
        const applyBand = () => {
          for (let i = 0; i < nodes.length; i += 1) {
            if (i === source) continue;
            if (band(i)) slid(i); else unslide(i);
          }
        };
        drag.onMove = (moveEvent) => {
          const x = moveEvent.clientX;
          const y = moveEvent.clientY;
          // 位置：按指针落在哪个面板的区间里
          let target = source;
          for (let i = 0; i < rects.length; i += 1) {
            const rect = rects[i];
            if (x >= rect.left && x <= rect.right) { target = i; break }
            if (i < rects.length - 1 && x > rect.right && x < rects[i + 1].left) { target = x < (rect.right + rects[i + 1].left) / 2 ? i : i + 1; break }
          }
          if (x < rects[0].left) target = 0;
          if (x > rects[rects.length - 1].right) target = rects.length - 1;
          drag.target = target;
          const dx = x - drag.startX;
          const dy = y - drag.startY;
          held.style.transform = 'translate3d(' + dx + 'px,' + Math.max(-40, Math.min(40, dy)) + 'px,0)'
            + ' scale(1.015) rotate(.6deg)';
          applyBand();                              // ← 其它面板实时让位（iOS 那种）
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

if (!apply) { console.log('演练：将替换为 v4（未写入）。加 --apply 应用。'); process.exit(0) }
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
fs.copyFileSync(client, client + '.before-panedrag4-' + stamp);
src = src.replace(FROM, BLOCK);
fs.writeFileSync(client, src);
try { execFileSync(process.execPath, ['--check', client], { stdio: 'pipe' }); console.log('node --check 通过') }
catch (error) {
  fs.writeFileSync(client, fs.readFileSync(client + '.before-panedrag4-' + stamp, 'utf8'));
  console.log('回滚：' + String(error.stderr || error).slice(0, 240));
  process.exit(1);
}
const hash = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').slice(0, 16);
fs.copyFileSync(client, pkg);
console.log((hash(client) === hash(pkg) ? 'hash=OK  ' : 'MISMATCH ') + path.basename(pkg));
