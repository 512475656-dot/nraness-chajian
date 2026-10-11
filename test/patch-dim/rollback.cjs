'use strict';
/**
 * 回滚"白光"到你说"问题解决了"的那一版：遮罩环 + 圆锥渐变（当时只有一点锯齿，但运动正确）。
 *   · 去掉磁贴里那个 SVG 子元素与它的样式；
 *   · 恢复 .wsb-card[data-running="true"]::after 的遮罩环写法（animation 写在最前）；
 *   · 把随 SVG 版改过的两条断言恢复成断言遮罩环那一版。
 * 形状相关（shapeRadius / border-radius）保持不动。
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

// 1) 去掉 SVG 子元素
step('去掉磁贴里的 SVG 环',
  /\n\s*running\n\s*\? h\('svg', \{\n[\s\S]{0,320}?pathLength: 100, rx: shapeRadius \|\| '50%' \}\)\)\n\s*: null,/,
  '');

// 2) 去掉 SVG 样式、恢复遮罩环
step('恢复遮罩环（animation 在最前）',
  /\/\* SVG 描边环：[\s\S]{0,700}?@keyframes wsb-traceDash\{to\{stroke-dashoffset:-100\}\}/,
  `/* 工作状态：一道光沿磁贴内缘跑。
   伪元素铺满，用 mask 只留 2px 的一圈 —— 遮罩跟随 border-radius，
   所以无论圆角多大，光带都精确贴着边缘。 */
@property --wsb-trace{syntax:'<angle>';initial-value:0deg;inherits:false}
.wsb-card[data-running="true"]::after{
  animation:wsb-trace 3.6s linear infinite;
  content:"";position:absolute;inset:0;z-index:2;pointer-events:none;padding:2px;border-radius:inherit;
  background:conic-gradient(from var(--wsb-trace),transparent 0deg 284deg,color-mix(in srgb,#fff 50%,transparent) 316deg,#fff 350deg,transparent 360deg);
  -webkit-mask:linear-gradient(#000,#000) content-box,linear-gradient(#000,#000);
  -webkit-mask-composite:xor;mask:linear-gradient(#000,#000) content-box,linear-gradient(#000,#000);
  mask-composite:exclude}
@keyframes wsb-trace{to{--wsb-trace:360deg}}`);

// ---------- 自检：两条断言恢复 ----------
let h = fs.readFileSync(harness, 'utf8');
const lit = (label, from, to) => {
  const hits = h.split(from).length - 1;
  if (hits !== 1) { console.log('NOTE  ' + label + '  [命中 ' + hits + '，跳过]'); return }
  h = h.replace(from, to);
  console.log('ok    ' + label);
};
lit('断言：恢复为要求遮罩环',
  `if (!/\\.wsb-traceSvg/.test(source) || !/stroke-dasharray:16 84/.test(source)) throw new Error('the highlight is not a ring tracing the tile edge');`,
  `if (!/conic-gradient\\(from var\\(--wsb-trace\\)/.test(body) || !/mask-composite:exclude/.test(body)) throw new Error('the highlight is not a ring tracing the tile edge');`);
lit('断言：关键帧恢复为角度版',
  `if (!/@keyframes wsb-traceDash\\{to\\{stroke-dashoffset:-100\\}\\}/.test(source)) {`,
  `if (!/@keyframes wsb-trace\\{to\\{--wsb-trace:360deg\\}\\}/.test(source)) {`);

// 括号平衡
const s = src.indexOf('const CSS = `'); const e = src.indexOf('\n`;', s);
const css = src.slice(s, e);
const o = (css.match(/\{/g) || []).length; const c = (css.match(/\}/g) || []).length;
console.log('CSS 括号：{ ' + o + ' } ' + c + ' ' + (o === c ? '✓' : '**不平衡**'));
if (o !== c) bad += 1;

if (bad > 0) { console.log('\n中止：' + bad + ' 处 —— 未写入。'); process.exit(1) }
if (!apply) { console.log('\n演练结束（**尚未写入**）。加 --apply 应用。'); process.exit(0) }
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
for (const [file, text] of [[client, src], [harness, h]]) {
  fs.copyFileSync(file, file + '.before-rollback-' + stamp);
  fs.writeFileSync(file, text);
  try { execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' }); console.log('node --check 通过 · ' + path.basename(file)) }
  catch (error) {
    fs.writeFileSync(file, fs.readFileSync(file + '.before-rollback-' + stamp, 'utf8'));
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
