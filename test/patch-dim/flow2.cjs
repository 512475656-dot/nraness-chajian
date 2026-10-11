'use strict';
// 只替换我自己写过的文本（最可靠），把"每张磁贴各播一遍"换成"首页一个元素一条动画"。
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
const run = (label, from, to) => {
  const hits = src.split(from).length - 1;
  if (hits !== 1) { console.log('BAD   ' + label + '  [命中 ' + hits + ']'); bad += 1; return }
  src = src.replace(from, to);
  console.log('ok    ' + label);
};

run('首页级动画：替换磁贴级规则',
  `.wsb-screen[data-role="home"][data-anim="fade-out"] .wsb-card{animation:wsb-cardOpen .46s cubic-bezier(.33,0,.2,1) both}`,
  `/* 第一拍：整个首页放大并淡出。只放在首页这一个元素上 —— 一个元素一条动画，不可能播两遍。 */
.wsb-screen[data-role="home"][data-anim="fade-out"]{
  animation-name:wsb-homeOut;animation-duration:.46s;animation-timing-function:cubic-bezier(.33,0,.2,1)}`);

run('首页级动画：替换关键帧',
  `@keyframes wsb-cardOpen{from{opacity:1;transform:scale(1)}to{opacity:0;transform:scale(1.16)}}`,
  `@keyframes wsb-homeOut{from{opacity:1;transform:scale(1)}to{opacity:0;transform:scale(1.045)}}`);

run('首页级动画：减少动效那条',
  `@media (prefers-reduced-motion:reduce){.wsb-screen[data-role="home"][data-anim="fade-out"] .wsb-card{animation:none}}`,
  `@media (prefers-reduced-motion:reduce){.wsb-screen[data-role="home"][data-anim="fade-out"]{animation-name:wsb-fadeOut}}`);

run('顺序：窗口在首页隐去后淡入',
  `.wsb-screen:not([data-role="home"])>.wsb-root{animation:wsb-contentIn .5s cubic-bezier(.33,0,.2,1) .22s both}`,
  `.wsb-screen:not([data-role="home"])>.wsb-root{animation:wsb-contentIn .5s cubic-bezier(.33,0,.2,1) .45s both}`);

if (bad > 0) { console.log('\n中止：' + bad + ' 处不符 —— 未写入。'); process.exit(1) }
if (src === original) { console.log('\n无需改动。'); process.exit(0) }
if (!apply) { console.log('\n演练结束：**尚未写入**。加 --apply 应用。'); process.exit(0) }
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
fs.copyFileSync(client, client + '.before-flow2-' + stamp);
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
