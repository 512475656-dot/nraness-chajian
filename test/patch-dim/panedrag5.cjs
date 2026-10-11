'use strict';
/**
 * 拖动换位 v5 —— 换成"绝对不会失效"的挂载方式：
 *   不再用 React 的 onPointerDown + setPointerCapture（可能被其它处理函数抢掉/拦掉），
 *   改为在 document 上以**捕获阶段**监听 pointerdown（页面上任何按下都先到它），
 *   再用 document 级监听处理 move / up / cancel / Escape / 失焦。
 *   iOS 式实时让位 + 插入式落位 + 便签手感 全部保留；无任何绿色元素。
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
const FROM = /      \/\/ ==== 面板标题栏拖动换位 v4[\s\S]*?\n      const togglePane = /;
const hits = (src.match(new RegExp(FROM.source, 'g')) || []).length;
console.log('锚点命中 ' + hits + ' 处');
if (hits !== 1) { console.log('中止 —— 未写入。'); process.exit(1) }

const BLOCK = `      // ==== 面板标题栏拖动换位 v5（document 捕获阶段监听 —— 挂载不会失效）====
      // 拖动期间只改 DOM（transform），不 setState。收尾五源：pointerup / pointercancel /
      // Escape / 窗口失焦 / 组件卸载。收尾时先无条件复原，再提交（插入式）。
      const paneGridRef = useRef(null);
      const paneDragRef = useRef(null);
      const PANE_KEEP = ['opacity', 'transform', 'transition', 'boxShadow', 'zIndex'];
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
        document.removeEventListener('pointermove', drag.onMove, true);
        document.removeEventListener('pointerup', drag.onUp, true);
        document.removeEventListener('pointercancel', drag.onCancel, true);
        window.removeEventListener('blur', drag.onCancel);
        document.removeEventListener('keydown', drag.onKey, true);
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
      useEffect(() => {
        const onDown = (event) => {
          if (event.button !== 0 || paneDragRef.current) return;
          const node = event.target;
          if (!node || !node.closest) return;
          if (node.closest('button,input,select,textarea,a,[contenteditable="true"]')) return;
          const head = node.closest('.wsb-paneHead');
          if (!head) return;
          const grid = paneGridRef.current;
          if (!grid || !grid.contains(head)) return;
          const nodes = Array.prototype.slice.call(grid.children);
          const source = nodes.findIndex((item) => item.contains(head));
          if (source < 0) return;
          const rects = nodes.map((item) => item.getBoundingClientRect());
          if (rects.length < 2) return;
          const gap = parseFloat(window.getComputedStyle(grid).columnGap) || 0;
          const drag = {
            nodes, source, target: source, rects, gap,
            startX: event.clientX, startY: event.clientY, saved: {},
          };
          nodes.forEach((item, index) => { drag.saved[index] = paneSnap(item) });
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
            let target = source;
            for (let i = 0; i < rects.length; i += 1) {
              const rect = rects[i];
              if (x >= rect.left && x <= rect.right) { target = i; break }
              if (i < rects.length - 1 && x > rect.right && x < rects[i + 1].left) {
                target = x < (rect.right + rects[i + 1].left) / 2 ? i : i + 1;
                break;
              }
            }
            if (x < rects[0].left) target = 0;
            if (x > rects[rects.length - 1].right) target = rects.length - 1;
            drag.target = target;
            const dx = x - drag.startX;
            const dy = Math.max(-40, Math.min(40, y - drag.startY));
            held.style.transform = 'translate3d(' + dx + 'px,' + dy + 'px,0) scale(1.015) rotate(.6deg)';
            applyBand();
          };
          drag.onUp = () => paneEndDrag(true);
          drag.onCancel = () => paneEndDrag(false);
          drag.onKey = (keyEvent) => { if (keyEvent.key === 'Escape') paneEndDrag(false) };
          paneDragRef.current = drag;
          document.addEventListener('pointermove', drag.onMove, true);
          document.addEventListener('pointerup', drag.onUp, true);
          document.addEventListener('pointercancel', drag.onCancel, true);
          window.addEventListener('blur', drag.onCancel);
          document.addEventListener('keydown', drag.onKey, true);
          document.body.style.cursor = 'grabbing';
          document.body.style.userSelect = 'none';
          if (event.preventDefault) event.preventDefault();
        };
        document.addEventListener('pointerdown', onDown, true);
        return () => {
          document.removeEventListener('pointerdown', onDown, true);
          paneEndDrag(false);
        };
      }, []);
      const togglePane = `;

if (!apply) { console.log('演练：将替换为 v5（未写入）。加 --apply 应用。'); process.exit(0) }
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
fs.copyFileSync(client, client + '.before-panedrag5-' + stamp);
src = src.replace(FROM, BLOCK);
// 去掉 grid 上的 React 事件（改由 document 捕获阶段接管）
src = src.replace(/\n\s*onPointerDown: onPanePointerDown,/, '');
fs.writeFileSync(client, src);
try { execFileSync(process.execPath, ['--check', client], { stdio: 'pipe' }); console.log('node --check 通过') }
catch (error) {
  fs.writeFileSync(client, fs.readFileSync(client + '.before-panedrag5-' + stamp, 'utf8'));
  console.log('回滚：' + String(error.stderr || error).slice(0, 240));
  process.exit(1);
}
const hash = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').slice(0, 16);
fs.copyFileSync(client, pkg);
console.log((hash(client) === hash(pkg) ? 'hash=OK  ' : 'MISMATCH ') + path.basename(pkg));
