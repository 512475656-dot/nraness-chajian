'use strict';
// 两处最小字面替换：把"禁止圆锥渐变 / 要求 offset-distance 关键帧"这两条旧条件，
// 改成"要求遮罩环 + 角度关键帧"。只替换那一句条件，不涉及任何花括号。
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const ws = path.join(__dirname, '..', '..');
const harness = path.join(ws, 'test', 'render-check.cjs');
const pkg = 'C:\\Users\\Administrator\\.dsh\\profiles\\desktop\\node_modules\\@local\\dsh-workbench\\test\\render-check.cjs';
const apply = process.argv.indexOf('--apply') >= 0;
let h = fs.readFileSync(harness, 'utf8');
const original = h;
let bad = 0;
const lit = (label, from, to) => {
  const hits = h.split(from).length - 1;
  if (hits !== 1) { console.log('BAD   ' + label + '  [命中 ' + hits + ']'); bad += 1; return }
  h = h.replace(from, to);
  console.log('ok    ' + label);
};

lit('断言：改为要求遮罩环（而不是禁止圆锥渐变）',
  `if (/conic-gradient/.test(body)) throw new Error('a conic gradient is still in the highlight');`,
  `if (!/conic-gradient\\(from var\\(--wsb-trace\\)/.test(body) || !/mask-composite:exclude/.test(body)) throw new Error('the highlight is not a ring tracing the tile edge');`);

lit('断言：关键帧改为角度版',
  `if (!/@keyframes wsb-trace\\{to\\{offset-distance:100%\\}\\}/.test(source)) {`,
  `if (!/@keyframes wsb-trace\\{to\\{--wsb-trace:360deg\\}\\}/.test(source)) {`);

// 把第二条失败断言的原句打出来（供下一步精确替换）。
const at = h.indexOf('the running sheen is not the transform-only animation');
if (at >= 0) {
  const lineStart = h.lastIndexOf('\n', at) + 1;
  const lineEnd = h.indexOf('\n', at);
  console.log('原文> ' + h.slice(lineStart, lineEnd).trim());
}

if (bad > 0) { console.log('\n中止：' + bad + ' 处 —— 未写入。'); process.exit(1) }
if (h === original) { console.log('无需改动。'); process.exit(0) }
if (!apply) { console.log('演练结束（未写入）。加 --apply 应用。'); process.exit(0) }
fs.writeFileSync(harness, h);
try {
  execFileSync(process.execPath, ['--check', harness], { stdio: 'pipe' });
  console.log('node --check 通过');
} catch (error) {
  fs.writeFileSync(harness, original);
  console.log('回滚：' + String(error.stderr || error).slice(0, 200));
  process.exit(1);
}
const hash = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').slice(0, 16);
fs.copyFileSync(harness, pkg);
console.log((hash(harness) === hash(pkg) ? 'hash=OK  ' : 'MISMATCH ') + path.basename(pkg));
