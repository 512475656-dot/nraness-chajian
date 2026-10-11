'use strict';
/**
 * 让"进入"与"退出"对称：压暗层不再有自己的独立动画。
 *   退出之所以感觉对，是因为压暗层是模块屏的 ::before —— 它跟着屏幕自己的
 *   push-out / pop-out / zoom-out（动画的正是整个屏幕的 opacity 与 transform）一起走。
 *   进入却给它加了独立 2s 动画，而窗口入场只有 0.35s，两个节奏打架 → 所以怎么调都别扭。
 * 做法：删掉那两条触发规则与对应的关键帧，只留"那一层默认就是该有的强度"。
 *   于是入场时它跟着屏幕自己的淡入一起淡入 —— 与退出完全对称。
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
const drop = (label, text) => {
  const hits = src.split(text).length - 1;
  if (hits !== 1) { console.log('BAD   ' + label + '  [命中 ' + hits + ']'); bad += 1; return }
  src = src.replace(text, '');
  console.log('ok    ' + label);
};

drop('删：兄弟选择器那条触发规则',
  `/* 渐入只在"从首页进入模块"时播放（此刻首页带着 fade-out，与模块屏是兄弟节点）。
   模块之间直接切换时这条不匹配 —— 那一层直接以最终强度呈现，不重播动画。 */
.wsb-screen[data-role="home"][data-anim="fade-out"] ~ .wsb-screen:not([data-role="home"])::before{
  animation:wsb-dimIn 2s cubic-bezier(.42,0,.58,1) both}
`);
drop('删：:has() 那条触发规则',
  `/* 同一条件、不依赖兄弟顺序的写法。 */
.wsb-stack:has(>.wsb-screen[data-role="home"][data-anim="fade-out"])>.wsb-screen:not([data-role="home"])::before{
  animation:wsb-dimIn 2s cubic-bezier(.42,0,.58,1) both}`);
drop('删：独立的关键帧',
  `/* 只有起止两帧，形状交给时间函数 —— 起手快、斜率平滑衰减、没有折点。 */
@keyframes wsb-dimIn{
  from{opacity:0}
  to{opacity:1}}
`);

if (bad > 0) { console.log('\n中止：' + bad + ' 处不符 —— 未写入。'); process.exit(1) }
if (src === original) { console.log('\n无需改动。'); process.exit(0) }
if (!apply) { console.log('\n演练结束：**尚未写入**。加 --apply 应用。'); process.exit(0) }
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
fs.copyFileSync(client, client + '.before-symmetric-' + stamp);
fs.writeFileSync(client, src);
try {
  execFileSync(process.execPath, ['--check', client], { stdio: 'pipe' });
  console.log('node --check 通过');
} catch (error) {
  fs.writeFileSync(client, fs.readFileSync(client + '.before-symmetric-' + stamp, 'utf8'));
  console.log('回滚：' + String(error.stderr || error).slice(0, 200));
  process.exit(1);
}
const hash = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').slice(0, 16);
fs.copyFileSync(client, pkg);
console.log((hash(client) === hash(pkg) ? 'hash=OK  ' : 'MISMATCH ') + path.basename(pkg));
