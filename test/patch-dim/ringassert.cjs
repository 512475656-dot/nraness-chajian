'use strict';
// 把两条"我自己写的"断言更新到遮罩环这一版（意图不变：绕内缘的环 / 中性色 / 被盖住时暂停）。
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

const swap = (label, message, replacement) => {
  const at = h.indexOf(message);
  if (at < 0) { console.log('已完成 ' + label + '（原断言不在）'); return }
  const open = h.lastIndexOf('if (', at);
  const close = h.indexOf(');', at);
  if (open < 0 || close < 0) { console.log('BAD   ' + label + '：定位失败'); bad += 1; return }
  const span = h.slice(open, close + 2);
  if (span.length > 900) { console.log('BAD   ' + label + '：跨度过大(' + span.length + ')'); bad += 1; return }
  h = h.slice(0, open) + replacement + h.slice(close + 2);
  console.log('ok    ' + label + '（替换 ' + span.length + ' 字符）');
};

swap('断言：高光是绕内缘的环（遮罩环版）',
  'the highlight is not a ring tracing the tile edge',
  `if (!/conic-gradient\\(from var\\(--wsb-trace\\)/.test(body) || !/mask-composite:exclude/.test(body)) {\n`
  + `        throw new Error('the highlight is not a ring tracing the tile edge');\n`
  + `      }`);

swap('断言：绕圈在动（遮罩环版）',
  'the running sheen is not the transform-only animation',
  `if (!/@property --wsb-trace/.test(source) || !/animation:wsb-trace [\\d.]+s linear infinite/.test(source)) {\n`
  + `        throw new Error('the running highlight has no trace animation');\n`
  + `      }\n`
  + `      if (!/\\.wsb-screen\\[data-concealed="true"\\] \\.wsb-card\\[data-running="true"\\]::after\\{animation-play-state:paused\\}/.test(source)) {\n`
  + `        throw new Error('the running trace keeps animating while concealed');\n`
  + `      }`);

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
