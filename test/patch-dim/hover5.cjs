'use strict';
/**
 * "保证可见"版悬停高亮：
 *   之前用 background-color: color-mix(in srgb, var(--dsw-alias-bg-layer-2), #fff …) ——
 *   那个 token 本身已被我改成嵌套 color-mix，任一环节解析失败整条声明就会作废（被静默丢弃），
 *   这正好解释"滤镜生效、背景层无效"。
 *   这一版：字面颜色（不用任何变量）+ !important + 选择器放宽到模块屏里的任何 button/chip/tab，
 *   于是不受变量解析与优先级影响，必然可见。
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
const MARK = '/* ==== 悬停高亮（保证可见版）====';
if (src.indexOf(MARK) >= 0) { console.log('已完成：保证可见版已在'); process.exit(0) }
const anchor = /(\.wsb-tileAbbr\{position:absolute;left:0;right:0;bottom:24px;text-align:center\})/;
if ((src.match(new RegExp(anchor.source, 'g')) || []).length !== 1) {
  console.log('中止：找不到锚点 —— 未写入。');
  process.exit(1);
}
const CSS = `
${MARK}
   字面颜色 + !important + 选择器放宽到"模块屏里的任何 button"。
   目的：不受 CSS 变量解析结果与优先级影响，必定可见。
   说明：选中态（data-on）保留自己的强调色，不被白色覆盖。 */
.wsb-screen:not([data-role="home"]) button:hover,
.wsb-screen:not([data-role="home"]) .wsb-chip:hover,
.wsb-screen:not([data-role="home"]) .wsb-tab:hover{
  background-color:rgba(255,255,255,.34) !important;
  border-color:rgba(255,255,255,.40) !important;
  color:#fff !important}
.wsb-screen:not([data-role="home"]) button[data-on="true"]:hover,
.wsb-screen:not([data-role="home"]) .wsb-chip[data-on="true"]:hover{
  background-color:rgba(255,255,255,.20) !important;
  border-color:rgba(255,255,255,.55) !important}
.wsb-screen:not([data-role="home"]) button:disabled:hover{
  background-color:transparent !important;
  border-color:currentColor !important}`;
if (!apply) { console.log('演练：将追加"保证可见"版（未写入）。加 --apply 应用。'); process.exit(0) }
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
fs.copyFileSync(client, client + '.before-hover5-' + stamp);
src = src.replace(anchor, (m) => `${m}${CSS}`);
fs.writeFileSync(client, src);
try { execFileSync(process.execPath, ['--check', client], { stdio: 'pipe' }); console.log('node --check 通过') }
catch (error) {
  fs.writeFileSync(client, fs.readFileSync(client + '.before-hover5-' + stamp, 'utf8'));
  console.log('回滚：' + String(error.stderr || error).slice(0, 220));
  process.exit(1);
}
const s = src.indexOf('const CSS = `'); const e = src.indexOf('\n`;', s);
const css = src.slice(s, e);
const o = (css.match(/\{/g) || []).length; const c = (css.match(/\}/g) || []).length;
console.log('CSS 括号：{ ' + o + ' } ' + c + ' ' + (o === c ? '✓' : '**不平衡**'));
const hash = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').slice(0, 16);
fs.copyFileSync(client, pkg);
console.log((hash(client) === hash(pkg) ? 'hash=OK  ' : 'MISMATCH ') + path.basename(pkg));
