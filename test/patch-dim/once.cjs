'use strict';
/**
 * 修"磁贴放大播放两次"：
 *   homeCovered = (路由是模块) && route.phase === 'idle' —— 结尾那个 phase 条件意味着
 *   data-concealed 要等入场动画结束才为真，所以我的磁贴动画实际是"第二个界面出来之后"才播。
 *   改成挂在点击那一刻就存在的 data-anim="fade-out" 上：一次导航只发生一次，不会重播。
 *   （首页隐藏仍带 0.46s 的 visibility 延迟，所以动画有时间播完。）
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

run('触发点改到点击那一刻',
  /\.wsb-screen\[data-concealed="true"\] \.wsb-card\{animation:wsb-cardOpen \.46s cubic-bezier\(\.33,0,\.2,1\) both\}/,
  `/* 点击那一刻就播（data-anim="fade-out" 只在入场阶段出现一次）—— 所以不会重播。 */\n`
  + `.wsb-screen[data-role="home"][data-anim="fade-out"] .wsb-card{animation:wsb-cardOpen .46s cubic-bezier(.33,0,.2,1) both}`,
  'data-role="home"][data-anim="fade-out"] .wsb-card');

run('减少动效那一条同步',
  /@media \(prefers-reduced-motion:reduce\)\{\.wsb-screen\[data-concealed="true"\] \.wsb-card\{animation:none\}\}/,
  `@media (prefers-reduced-motion:reduce){.wsb-screen[data-role="home"][data-anim="fade-out"] .wsb-card{animation:none}}`,
  'prefers-reduced-motion:reduce){.wsb-screen[data-role="home"]');

if (bad > 0) { console.log('\n中止：' + bad + ' 处不符 —— 未写入。'); process.exit(1) }
if (src === original) { console.log('\n无需改动。'); process.exit(0) }
if (!apply) { console.log('\n演练结束：**尚未写入**。加 --apply 应用。'); process.exit(0) }
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
fs.copyFileSync(client, client + '.before-once-' + stamp);
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
