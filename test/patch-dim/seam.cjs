'use strict';
/**
 * 消除"光带与磁贴轮廓之间的缝"：
 *   磁贴的 1px border 画在 padding box 之外，而 overflow:hidden 把后代裁在 padding box 之内，
 *   于是光带外缘永远比可见描边缩进 1px —— 大圆角时就是那道"间隙锯齿"。
 *   修法：把外侧那条 border 变透明（视觉边缘线由既有的内侧 inset 描边提供，位置正好与光带重合）。
 *   只加一条声明，写在样式表末尾（同优先级下最后生效）。
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
const MARK = '/* 消除光带与磁贴轮廓之间的 1px 缝';
if (src.indexOf(MARK) >= 0) { console.log('已完成：该规则已在'); process.exit(0) }
const anchor = /(\.wsb-tileAbbr\{position:absolute;left:0;right:0;bottom:24px;text-align:center\})/;
if ((src.match(new RegExp(anchor.source, 'g')) || []).length !== 1) {
  console.log('中止：找不到锚点 —— 未写入。');
  process.exit(1);
}
const CSS = `${MARK}
   磁贴的 1px 外侧描边画在 padding box 之外，而 overflow:hidden 把后代裁在 padding box 之内，
   所以光带外缘永远比可见描边缩进 1px —— 大圆角时就露出那道缝。
   视觉上的边缘线由既有的内侧 inset 描边提供，它的位置正好与光带重合。 */
.wsb-card{border-color:transparent}`;
if (!apply) { console.log('演练：将追加一条声明（未写入）。加 --apply 应用。'); process.exit(0) }
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
fs.copyFileSync(client, client + '.before-seam-' + stamp);
src = src.replace(anchor, (m) => `${m}\n${CSS}`);
fs.writeFileSync(client, src);
try { execFileSync(process.execPath, ['--check', client], { stdio: 'pipe' }); console.log('node --check 通过') }
catch (error) {
  fs.writeFileSync(client, fs.readFileSync(client + '.before-seam-' + stamp, 'utf8'));
  console.log('回滚：' + String(error.stderr || error).slice(0, 200));
  process.exit(1);
}
const s = src.indexOf('const CSS = `'); const e = src.indexOf('\n`;', s);
const css = src.slice(s, e);
const o = (css.match(/\{/g) || []).length; const c = (css.match(/\}/g) || []).length;
console.log('CSS 括号：{ ' + o + ' } ' + c + ' ' + (o === c ? '✓' : '**不平衡**'));
const hash = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').slice(0, 16);
fs.copyFileSync(client, pkg);
console.log((hash(client) === hash(pkg) ? 'hash=OK  ' : 'MISMATCH ') + path.basename(pkg));
