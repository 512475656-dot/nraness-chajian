'use strict';
/**
 * 悬停高亮（第二版）：直接改"背景层本身"，而不是只加 filter。
 *   原因：按钮背景是 color-mix(…, transparent) 的半透明填充，filter:brightness 只作用于
 *   那部分像素，视觉变化极小。改成在悬停时把 background-color 换成"与白色混合的更亮填充"，
 *   并且 background-color 可以平滑过渡（渐变不行）。
 *   选中态（data-on）不动其原色，只做轻微点亮。
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
const FROM = /\.wsb-screen:not\(\[data-role="home"\]\) :is\(\.wsb-chip,\.wsb-btn,\.wsb-segBtn,\.wsb-tab,\.wsb-iconBtn,\.wsb-backBtn,\.wsb-range\)\{\n\s*transition:filter \.18s ease[\s\S]{0,760}?:not\(\[disabled\]\):active\{\n\s*filter:brightness\(1\.16\) saturate\(1\.02\)\}/;
const SEL = '.wsb-screen:not([data-role="home"]) :is(.wsb-chip,.wsb-btn,.wsb-segBtn,.wsb-tab,.wsb-iconBtn,.wsb-backBtn,.wsb-range)';
const TO = `${SEL}{
  transition:background-color .18s ease,border-color .18s ease,color .18s ease,box-shadow .18s ease,filter .18s ease,transform .18s cubic-bezier(.32,.72,0,1)}
/* 悬停：背景层本身被替换成"混了白的更亮填充" —— 这才是看得见的提亮。
   background-color 能平滑过渡（渐变不行），且不动各自原有的 background-image。 */
${SEL}:not([disabled]):hover{
  background-color:color-mix(in srgb,var(--dsw-alias-bg-layer-2),#fff 26%);
  border-color:color-mix(in srgb,var(--dsw-alias-label-primary) 30%,transparent);
  color:var(--dsw-alias-label-primary);
  filter:brightness(1.1);
  box-shadow:0 8px 22px rgba(0,0,0,.28),inset 0 1px 0 color-mix(in srgb,#fff 18%,transparent)}
/* 选中态：保留它自己的强调色，只做轻微点亮（不被换成灰白）。 */
${SEL}[data-on="true"]:not([disabled]):hover{
  background-color:color-mix(in srgb,var(--wsb-c1) 44%,transparent);
  border-color:color-mix(in srgb,var(--wsb-c1) 60%,transparent);
  filter:brightness(1.14)}
${SEL}:not([disabled]):active{filter:brightness(.96)}`;

const hits = (src.match(new RegExp(FROM.source, 'g')) || []).length;
console.log('锚点命中 ' + hits + ' 处');
if (hits !== 1) { console.log('中止 —— 未写入。'); process.exit(1) }
if (!apply) { console.log('演练：将替换悬停规则（未写入）。加 --apply 应用。'); process.exit(0) }
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
fs.copyFileSync(client, client + '.before-hover2-' + stamp);
src = src.replace(FROM, TO);
fs.writeFileSync(client, src);
try { execFileSync(process.execPath, ['--check', client], { stdio: 'pipe' }); console.log('node --check 通过') }
catch (error) {
  fs.writeFileSync(client, fs.readFileSync(client + '.before-hover2-' + stamp, 'utf8'));
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
