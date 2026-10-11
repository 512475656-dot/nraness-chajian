'use strict';
/**
 * 补上你描述的第一拍：点击后**磁贴先淡出放大**，首页随后才隐去。
 * 做法（纯 CSS，不动 JS）：visibility 是可用 transition 延迟的 —— 给"隐藏"加 0.46s 延迟，
 * 磁贴就在这段时间里做淡出+放大。模块屏的层级本来就高于首页（z-index 2 vs 1），
 * 于是视觉顺序成为：磁贴淡出放大 → 背景渐渐压暗 → 窗口内容淡入。
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
const run = (label, re, replacement, doneMarker, expected) => {
  const want = expected === undefined ? 1 : expected;
  if (doneMarker && src.includes(doneMarker)) { console.log('已完成 ' + label); return }
  const hits = (src.match(new RegExp(re.source, 'g')) || []).length;
  if (hits !== want) { console.log('BAD   ' + label + '  [命中 ' + hits + '，预期 ' + want + ']'); bad += 1; return }
  src = src.replace(re, replacement);
  console.log('ok    ' + label);
};

run('隐藏延迟 0.46s（让磁贴动画播得出来）',
  /\.wsb-screen\[data-concealed="true"\]\{visibility:hidden;pointer-events:none\}/,
  `.wsb-screen[data-concealed="true"]{visibility:hidden;pointer-events:none;transition:visibility 0s linear .46s}`,
  'transition:visibility 0s linear .46s');

run('磁贴：淡出 + 放大',
  /(\.wsb-screen\[data-concealed="true"\] \.wsb-card\[data-running="true"\]::after\{animation-play-state:paused\})/,
  `/* 点击模块的第一拍：磁贴淡出并放大，首页在 .46s 后才隐去 —— 于是切换读起来是连续的。 */\n`
  + `.wsb-screen[data-concealed="true"] .wsb-card{animation:wsb-cardOpen .46s cubic-bezier(.33,0,.2,1) both}\n`
  + `@keyframes wsb-cardOpen{from{opacity:1;transform:scale(1)}to{opacity:0;transform:scale(1.16)}}\n`
  + `@media (prefers-reduced-motion:reduce){.wsb-screen[data-concealed="true"] .wsb-card{animation:none}}\n`
  + `$1`,
  '@keyframes wsb-cardOpen');

if (bad > 0) { console.log('\n中止：' + bad + ' 处不符 —— 未写入。'); process.exit(1) }
if (src === original) { console.log('\n无需改动。'); process.exit(0) }
if (!apply) { console.log('\n演练结束：**尚未写入**。加 --apply 应用。'); process.exit(0) }
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
fs.copyFileSync(client, client + '.before-cardout-' + stamp);
fs.writeFileSync(client, src);
try {
  execFileSync(process.execPath, ['--check', client], { stdio: 'pipe' });
  console.log('node --check 通过');
} catch (error) {
  fs.writeFileSync(client, original);
  console.log('回滚：' + String(error.stderr || error).slice(0, 220));
  process.exit(1);
}
const hash = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').slice(0, 16);
fs.copyFileSync(client, pkg);
console.log((hash(client) === hash(pkg) ? 'hash=OK  ' : 'MISMATCH ') + path.basename(pkg));
