'use strict';
/**
 * 模块内部所有按钮的"悬停高亮"，一处控制：
 *   · 用 filter:brightness() —— 渐变不能过渡，brightness 可以平滑过渡；
 *     且它保留每个按钮自己的颜色与选中态，只是整体点亮。
 *   · 同时把边框提亮一档 + 加一层柔和外发光，让"高亮"更明确。
 *   · 排除 disabled；不动各按钮原有的 hover 位移（保留既有手感）。
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
const MARK = '/* ==== 模块内按钮：统一悬停高亮 ====';
if (src.indexOf(MARK) >= 0) { console.log('已完成：悬停高亮规则已在'); process.exit(0) }
const anchor = /(\.wsb-screen:not\(\[data-role="home"\]\) :is\(\.wsb-chip,\.wsb-btn,\.wsb-segBtn,\.wsb-tab,\.wsb-iconBtn,\.wsb-backBtn,\.wsb-range\)\{\n\s*background-image:linear-gradient\(0deg,\n\s*color-mix\(in srgb,#fff 10%,transparent\),\n\s*color-mix\(in srgb,#fff 15%,transparent\)\)\})/;
if ((src.match(new RegExp(anchor.source, 'g')) || []).length !== 1) {
  console.log('中止：找不到"统一提亮"那条锚点 —— 未写入。');
  process.exit(1);
}
const CSS = `
${MARK}
   一处控制模块里所有按钮：悬停时整体点亮 + 边框提亮 + 柔和外发光。
   用 filter:brightness()（可平滑过渡，且保留各自的原色与选中态；渐变无法过渡）。
   disabled 不参与；各按钮原有的 hover 位移保持不动。 */
.wsb-screen:not([data-role="home"]) :is(.wsb-chip,.wsb-btn,.wsb-segBtn,.wsb-tab,.wsb-iconBtn,.wsb-backBtn,.wsb-range){
  transition:filter .18s ease,border-color .18s ease,box-shadow .18s ease,transform .18s cubic-bezier(.32,.72,0,1)}
.wsb-screen:not([data-role="home"]) :is(.wsb-chip,.wsb-btn,.wsb-segBtn,.wsb-tab,.wsb-iconBtn,.wsb-backBtn,.wsb-range):not([disabled]):hover{
  filter:brightness(1.32) saturate(1.06);
  border-color:color-mix(in srgb,var(--dsw-alias-label-primary) 26%,transparent);
  box-shadow:0 6px 18px rgba(0,0,0,.24),0 0 0 1px color-mix(in srgb,#fff 10%,transparent)}
.wsb-screen:not([data-role="home"]) :is(.wsb-chip,.wsb-btn,.wsb-segBtn,.wsb-tab,.wsb-iconBtn,.wsb-backBtn,.wsb-range):not([disabled]):active{
  filter:brightness(1.16) saturate(1.02)}`;
if (!apply) { console.log('演练：将追加悬停高亮规则（未写入）。加 --apply 应用。'); process.exit(0) }
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
fs.copyFileSync(client, client + '.before-hover-' + stamp);
src = src.replace(anchor, (m) => `${m}${CSS}`);
fs.writeFileSync(client, src);
try { execFileSync(process.execPath, ['--check', client], { stdio: 'pipe' }); console.log('node --check 通过') }
catch (error) {
  fs.writeFileSync(client, fs.readFileSync(client + '.before-hover-' + stamp, 'utf8'));
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
