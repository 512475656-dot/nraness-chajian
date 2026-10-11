'use strict';
/**
 * 1. 压暗曲线：两段折线 → 温和的减速曲线。
 *    折线在折点必然有一次速度突变（就是"有点突然"的来源）；要既先快后慢又平滑只能用曲线。
 *    cubic-bezier(.2,.75,.35,1)：起手很快、斜率平滑衰减、没有折点。
 * 2. 模块之间切换不再重播压暗：
 *    渐入动画只在"首页正在淡出"时生效（首页与模块屏在 .wsb-stack 里是兄弟节点）；
 *    其余情况那一层直接以最终强度呈现，不播动画。
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
const run = (label, from, to) => {
  const hits = src.split(from).length - 1;
  if (hits !== 1) { console.log('BAD   ' + label + '  [命中 ' + hits + ']'); bad += 1; return }
  src = src.replace(from, to);
  console.log('ok    ' + label);
};

// 1) 曲线：折线 → 平滑减速曲线；关键帧不再需要折点。
run('曲线：折线换成平滑减速曲线',
  `/* 两段折线：前 28% 的时间完成 72% 的变暗，其余时间缓缓收尾。
   两段都是直线（linear），所以既"先快后慢"又是线性的，不带缓动曲线。 */
@keyframes wsb-dimIn{
  0%{opacity:0}
  28%{opacity:.72}
  100%{opacity:1}}`,
  `/* 只有起止两帧，形状交给时间函数 —— 起手快、斜率平滑衰减、没有折点。 */
@keyframes wsb-dimIn{
  from{opacity:0}
  to{opacity:1}}`);

run('曲线：时间函数改为温和减速曲线',
  `opacity:0;animation:wsb-dimIn 2s linear forwards;`,
  `opacity:1;animation:wsb-dimIn 2s cubic-bezier(.2,.75,.35,1) forwards;`);

// 2) 只在"从首页进入"时播渐入；其余情况直接呈现强度。
run('重播：动画只绑定到"首页正在淡出"',
  `  opacity:1;animation:wsb-dimIn 2s cubic-bezier(.2,.75,.35,1) forwards;`,
  `  opacity:1;`);

run('重播：新增"从首页进入"才播放的规则',
  `@keyframes wsb-dimIn{
  from{opacity:0}
  to{opacity:1}}`,
  `@keyframes wsb-dimIn{
  from{opacity:0}
  to{opacity:1}}
/* 渐入只在"从首页进入模块"时播放（此刻首页带着 fade-out，与模块屏是兄弟节点）。
   模块之间直接切换时这条不匹配 —— 那一层直接以最终强度呈现，不重播动画。 */
.wsb-screen[data-role="home"][data-anim="fade-out"] ~ .wsb-screen:not([data-role="home"])::before{
  animation:wsb-dimIn 2s cubic-bezier(.2,.75,.35,1) both}`);

if (bad > 0) { console.log('\n中止：' + bad + ' 处不符 —— 未写入。'); process.exit(1) }
if (src === original) { console.log('\n无需改动。'); process.exit(0) }
if (!apply) { console.log('\n演练结束：**尚未写入**。加 --apply 应用。'); process.exit(0) }
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
fs.copyFileSync(client, client + '.before-noreplay-' + stamp);
fs.writeFileSync(client, src);
try {
  execFileSync(process.execPath, ['--check', client], { stdio: 'pipe' });
  console.log('node --check 通过');
} catch (error) {
  fs.writeFileSync(client, fs.readFileSync(client + '.before-noreplay-' + stamp, 'utf8'));
  console.log('回滚：' + String(error.stderr || error).slice(0, 200));
  process.exit(1);
}
const hash = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').slice(0, 16);
fs.copyFileSync(client, pkg);
console.log((hash(client) === hash(pkg) ? 'hash=OK  ' : 'MISMATCH ') + path.basename(pkg));
