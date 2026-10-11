'use strict';
/**
 * 压暗改成"两段线性"：
 *   贝塞尔曲线本质上不是线性的，而你要的是"先快后慢 + 线性" —— 用两段折线同时满足：
 *     0%   → 28%   时间里完成 72% 的变暗（前段陡 = 点下瞬间就快速变暗）
 *     28%  → 100%  时间里完成剩下 28%（后段缓 = 渐渐停下来）
 *   两段各自都是直线（linear），整体仍是先快后慢。
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
let bad = 0;
const run = (label, from, to) => {
  const hits = src.split(from).length - 1;
  if (hits !== 1) { console.log('BAD   ' + label + '  [命中 ' + hits + ']'); bad += 1; return }
  src = src.replace(from, to);
  console.log('ok    ' + label);
};

run('关键帧：两段折线',
  `@keyframes wsb-dimIn{from{opacity:0}to{opacity:1}}`,
  `/* 两段折线：前 28% 的时间完成 72% 的变暗，其余时间缓缓收尾。
   两段都是直线（linear），所以既"先快后慢"又是线性的，不带缓动曲线。 */
@keyframes wsb-dimIn{
  0%{opacity:0}
  28%{opacity:.72}
  100%{opacity:1}}`);

run('动画：时间函数改为 linear',
  `opacity:0;animation:wsb-dimIn 2s cubic-bezier(.16,.84,.44,1) forwards;`,
  `opacity:0;animation:wsb-dimIn 2s linear forwards;`);

if (bad > 0) { console.log('\n中止：' + bad + ' 处不符 —— 未写入。'); process.exit(1) }
if (!apply) { console.log('\n演练结束：**尚未写入**。加 --apply 应用。'); process.exit(0) }
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
fs.copyFileSync(client, client + '.before-pwl-' + stamp);
fs.writeFileSync(client, src);
try {
  execFileSync(process.execPath, ['--check', client], { stdio: 'pipe' });
  console.log('node --check 通过');
} catch (error) {
  fs.writeFileSync(client, fs.readFileSync(client + '.before-pwl-' + stamp, 'utf8'));
  console.log('回滚：' + String(error.stderr || error).slice(0, 200));
  process.exit(1);
}
const hash = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').slice(0, 16);
fs.copyFileSync(client, pkg);
console.log((hash(client) === hash(pkg) ? 'hash=OK  ' : 'MISMATCH ') + path.basename(pkg));
