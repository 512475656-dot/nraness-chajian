'use strict';
/**
 * 梳理并重排动画流程（根治"播两遍"）：
 *   磁贴级动画 → 首页级动画：只把一个"放大淡出"放在 .wsb-screen[data-role="home"] 这一个元素上，
 *   一个元素一条动画，不可能播两遍（之前挂在每张磁贴上，而首页里磁贴不止一份）。
 *
 * 时序（重叠、连续）：
 *   0        点击 → 整个首页放大并淡出（0.46s）
 *   0 起     压暗同时开始（2s，前慢后快）—— 与上一步重叠，而非等它结束
 *   ~0.45s   首页隐去 → 模块窗口淡入（0.5s）
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
const run = (label, re, replacement, doneMarker) => {
  if (doneMarker && src.includes(doneMarker)) { console.log('已完成 ' + label); return }
  const hits = (src.match(new RegExp(re.source, 'g')) || []).length;
  if (hits !== 1) { console.log('BAD   ' + label + '  [命中 ' + hits + ']'); bad += 1; return }
  src = src.replace(re, replacement);
  console.log('ok    ' + label);
};

// 1) 把磁贴级动画整段换成首页级动画（一个元素，一条动画）。
run('流程：磁贴级 → 首页级（一条动画）',
  /\/\* 点击模块的第一拍：磁贴淡出并放大，首页在 \.46s 后才隐去 —— 于是切换读起来是连续的。 \*\/\n\.wsb-screen\[data-concealed="true"\] \.wsb-card\{animation:wsb-cardOpen \.46s cubic-bezier\(\.33,0,\.2,1\) both\}\n@keyframes wsb-cardOpen\{from\{opacity:1;transform:scale\(1\)\}to\{opacity:0;transform:scale\(1\.16\)\}\}\n@media \(prefers-reduced-motion:reduce\)\{\.wsb-screen\[data-role="home"\]\[data-anim="fade-out"\] \.wsb-card\{animation:none\}\}/,
  `/* 第一拍：整个首页放大并淡出。放在首页这一个元素上 —— 一个元素一条动画，不会播两遍。
   （之前挂在每张磁贴上，而首页里同一批磁贴会被渲染不止一份，于是各播一遍。） */
.wsb-screen[data-role="home"][data-anim="fade-out"]{
  animation-name:wsb-homeOut;animation-duration:.46s;animation-timing-function:cubic-bezier(.33,0,.2,1)}
@keyframes wsb-homeOut{from{opacity:1;transform:scale(1)}to{opacity:0;transform:scale(1.045)}}
@media (prefers-reduced-motion:reduce){
  .wsb-screen[data-role="home"][data-anim="fade-out"]{animation-name:wsb-fadeOut}}`,
  '@keyframes wsb-homeOut');

// 2) 窗口出现得更靠后：首页淡出完成之后再浮现（0.45s 延迟）。
run('流程：窗口在首页隐去后淡入',
  /\.wsb-screen:not\(\[data-role="home"\]\)>\.wsb-root\{animation:wsb-contentIn \.5s cubic-bezier\(\.33,0,\.2,1\) \.22s both\}/,
  `.wsb-screen:not([data-role="home"])>.wsb-root{animation:wsb-contentIn .5s cubic-bezier(.33,0,.2,1) .45s both}`,
  'cubic-bezier(.33,0,.2,1) .45s both');

if (bad > 0) { console.log('\n中止：' + bad + ' 处不符 —— 未写入。'); process.exit(1) }
if (src === original) { console.log('\n无需改动。'); process.exit(0) }
if (!apply) { console.log('\n演练结束：**尚未写入**。加 --apply 应用。'); process.exit(0) }
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
fs.copyFileSync(client, client + '.before-flow-' + stamp);
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
