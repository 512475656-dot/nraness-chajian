'use strict';
/**
 * 1. 绕圈改 SVG 描边环（抗锯齿；rx 跟随圆角；把旧的遮罩环撤掉）：
 *    磁贴里加一个 <svg><rect pathLength="100">，虚线 16/100，动画只动 stroke-dashoffset。
 * 2. 圆角：映射不变（0 → 50% 即正圆），但改写在磁贴的**行内样式**上 —— 行内压过所有样式表规则，
 *    所以不会再被更具体的规则（例如 [data-size=…]）盖掉。
 * 3. 同步更新两条断言（它们断言的是遮罩环那一版）。
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const ws = path.join(__dirname, '..', '..');
const client = path.join(ws, 'client.js');
const harness = path.join(ws, 'test', 'render-check.cjs');
const pkgDir = 'C:\\Users\\Administrator\\.dsh\\profiles\\desktop\\node_modules\\@local\\dsh-workbench';
const apply = process.argv.indexOf('--apply') >= 0;
let bad = 0;

// ---------- 客户端 ----------
let src = fs.readFileSync(client, 'utf8');
const step = (label, re, to, expect) => {
  const want = expect === undefined ? 1 : expect;
  const hits = (src.match(new RegExp(re.source, 'g')) || []).length;
  if (hits !== want) { console.log('BAD   ' + label + '  [命中 ' + hits + '，预期 ' + want + ']'); bad += 1; return }
  src = src.replace(re, to);
  console.log('ok    ' + label);
};

// 2) 行内半径（保证生效）
step('圆角：写到磁贴行内样式',
  /animationDelay: Math\.min\(index, 12\) \* 45 \+ 'ms',/,
  `animationDelay: Math.min(index, 12) * 45 + 'ms',
      // 形状直接写在行内：映射是 (100 - 滑条)/2 %，所以 0 = 50% = 正圆，100 = 0% = 正方形。
      // 行内样式压过所有样式表规则，不会再被更具体的规则盖掉。
      borderRadius: 'var(--wsb-card-radius,20px)',`);

// 1a) 磁贴里加 SVG 环
step('绕圈：磁贴里加 SVG 描边环',
  /h\('span', \{ className: 'wsb-tileMark' \}, h\(ModuleGlyph,/,
  `running
          ? h('svg', {
            className: 'wsb-traceSvg', viewBox: '0 0 100 100', preserveAspectRatio: 'none',
            'aria-hidden': 'true',
          }, h('rect', { x: 1, y: 1, width: 98, height: 98, pathLength: 100 }))
          : null,
        h('span', { className: 'wsb-tileMark' }, h(ModuleGlyph,`);

// 1b) 撤掉旧的遮罩环 + 加新的 SVG 样式
step('绕圈：撤掉遮罩环、加 SVG 环样式',
  /@property --wsb-trace\{[^}]*\}\n\.wsb-card\[data-running="true"\]::after\{[\s\S]{0,700}?mask-composite:exclude\}\n@keyframes wsb-trace\{to\{--wsb-trace:360deg\}\}/,
  `/* SVG 描边环：描边天生抗锯齿；rx 用 CSS 属性跟随圆角；pathLength=100 把周长归一化，
   于是"虚线 16/100"就是周长的 16%，动画只动 stroke-dashoffset（很便宜）。 */
.wsb-traceSvg{position:absolute;inset:0;width:100%;height:100%;z-index:2;pointer-events:none;overflow:visible}
.wsb-traceSvg rect{fill:none;stroke:#fff;stroke-width:2;rx:var(--wsb-card-radius,20px);
  stroke-dasharray:16 84;stroke-dashoffset:0;animation:wsb-traceDash 3.6s linear infinite}
@keyframes wsb-traceDash{to{stroke-dashoffset:-100}}`);

// ---------- 自检（两条断言同步） ----------
let h = fs.readFileSync(harness, 'utf8');
const lit = (label, from, to) => {
  const hits = h.split(from).length - 1;
  if (hits !== 1) { console.log('NOTE  ' + label + '  [命中 ' + hits + '，跳过]'); return }
  h = h.replace(from, to);
  console.log('ok    ' + label);
};
lit('断言：改为要求 SVG 描边环',
  `if (!/conic-gradient\\(from var\\(--wsb-trace\\)/.test(body) || !/mask-composite:exclude/.test(body)) throw new Error('the highlight is not a ring tracing the tile edge');`,
  `if (!/\\.wsb-traceSvg/.test(source) || !/stroke-dasharray:16 84/.test(source)) throw new Error('the highlight is not a ring tracing the tile edge');`);
lit('断言：关键帧改为 dash 版',
  `if (!/@keyframes wsb-trace\\{to\\{--wsb-trace:360deg\\}\\}/.test(source)) {`,
  `if (!/@keyframes wsb-traceDash\\{to\\{stroke-dashoffset:-100\\}\\}/.test(source)) {`);

// 括号平衡核对（这次学到的一步）
const balance = (text) => {
  const s = text.indexOf('const CSS = `'); const e = text.indexOf('\n`;', s);
  const css = text.slice(s, e);
  return [(css.match(/\{/g) || []).length, (css.match(/\}/g) || []).length];
};
const before = balance(src);
console.log('  CSS 括号：{ ' + before[0] + ' } ' + before[1] + ' ' + (before[0] === before[1] ? '✓' : '**不平衡**'));
if (before[0] !== before[1]) { console.log('BAD   CSS 括号不平衡 —— 未写入。'); bad += 1 }

if (bad > 0) { console.log('\n中止：' + bad + ' 处 —— 未写入。'); process.exit(1) }
if (!apply) { console.log('\n演练结束（未写入）。加 --apply 应用。'); process.exit(0) }
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
for (const [file, text] of [[client, src], [harness, h]]) {
  fs.copyFileSync(file, file + '.before-svg-' + stamp);
  fs.writeFileSync(file, text);
  try { execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' }); console.log('node --check 通过 · ' + path.basename(file)) }
  catch (error) {
    fs.writeFileSync(file, fs.readFileSync(file + '.before-svg-' + stamp, 'utf8'));
    console.log('回滚 ' + path.basename(file) + '：' + String(error.stderr || error).slice(0, 200));
    process.exit(1);
  }
}
const hash = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').slice(0, 16);
for (const rel of ['client.js', path.join('test', 'render-check.cjs')]) {
  const from = path.join(ws, rel); const to = path.join(pkgDir, rel);
  fs.copyFileSync(from, to);
  console.log((hash(from) === hash(to) ? 'hash=OK  ' : 'MISMATCH ') + rel);
}
