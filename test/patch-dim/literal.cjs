'use strict';
/**
 * 绕过所有变量与层叠：形状在 JS 里算成字面量、以内联样式直接写在磁贴上。
 *   1) HomeView 调用 ModuleCard 时把算好的值传下去（HomeView 本来就有 appearance）。
 *   2) ModuleCard 接收 shapeRadius。
 *   3) 磁贴行内 borderRadius 用它（字面量，例如 '50%'）。
 *   4) 绕圈 SVG 的 rx 也用它（同一个值 → 光带与磁贴必然同形）。
 * 滑条 0 → '50%' → 正方形磁贴上就是数学意义上的正圆。
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
const original = src;
let bad = 0;
const run = (label, re, to, expect) => {
  const want = expect === undefined ? 1 : expect;
  const hits = (src.match(new RegExp(re.source, 'g')) || []).length;
  if (hits !== want) { console.log('BAD   ' + label + '  [命中 ' + hits + '，预期 ' + want + ']'); bad += 1; return }
  src = src.replace(re, to);
  console.log('ok    ' + label);
};

// 1) 调用处把值传下去
run('传递：HomeView → ModuleCard',
  /(onDragBegin: beginDrag, onDragMove: moveDrag, onDragEnd: endDrag, showAbbr,)/,
  `$1
              // 形状：滑条 0 → 50%（正方形磁贴下即正圆），100 → 0%（正方形）。
              shapeRadius: ((100 - clamp(appearance.radius === undefined ? 85 : appearance.radius, 0, 100)) / 2) + '%',`);

// 2) ModuleCard 接收
run('接口：ModuleCard 增加 shapeRadius',
  /function ModuleCard\(\{ t, module, running, hidden, index, onOpen, onDelete, drawKey, dragging, onDragBegin, onDragMove, onDragEnd, showAbbr \}\)/,
  `function ModuleCard({ t, module, running, hidden, index, onOpen, onDelete, drawKey, dragging, onDragBegin, onDragMove, onDragEnd, showAbbr, shapeRadius })`);

// 3) 行内半径用字面量
run('磁贴：行内半径用字面量',
  /borderRadius: 'var\(--wsb-shape-radius, var\(--wsb-card-radius, 20px\)\)',/,
  `// 字面量，不经任何 CSS 变量 —— 因此不会被层叠或就近优先改掉。
          borderRadius: shapeRadius || 'var(--wsb-shape-radius, var(--wsb-card-radius, 20px))',`);

// 4) 绕圈 rx 用同一个值
run('绕圈：rx 用同一个值',
  /h\('rect', \{ x: 1, y: 1, width: 98, height: 98, pathLength: 100 \}\)/,
  `h('rect', { x: 1, y: 1, width: 98, height: 98, pathLength: 100, style: shapeRadius ? { rx: shapeRadius } : null })`);

if (bad > 0) { console.log('\n中止：' + bad + ' 处不符 —— 未写入。'); process.exit(1) }
if (src === original) { console.log('\n无需改动。'); process.exit(0) }
if (!apply) { console.log('\n演练结束（**尚未写入**）。加 --apply 应用。'); process.exit(0) }
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
fs.copyFileSync(client, client + '.before-literal-' + stamp);
fs.writeFileSync(client, src);
try { execFileSync(process.execPath, ['--check', client], { stdio: 'pipe' }); console.log('node --check 通过') }
catch (error) {
  fs.writeFileSync(client, fs.readFileSync(client + '.before-literal-' + stamp, 'utf8'));
  console.log('回滚：' + String(error.stderr || error).slice(0, 220));
  process.exit(1);
}
const s = src.indexOf('const CSS = `'); const e = src.indexOf('\n`;', s);
const css = src.slice(s, e);
const o = (css.match(/\{/g) || []).length; const c = (css.match(/\}/g) || []).length;
console.log('CSS 括号：{ ' + o + ' } ' + c + ' ' + (o === c ? '✓' : '**不平衡**'));
const hash = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').slice(0, 16);
fs.copyFileSync(client, pkg);
console.log((hash(client) === hash(pkg) ? 'hash=OK  ' : 'MISMATCH ') + path.basename(pkg));
