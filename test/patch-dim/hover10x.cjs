'use strict';
/**
 * 临时 10× 验证版：悬停时把按钮变成醒目的品红背景 + 白描边 + 放大 12% + 取消滤镜。
 * 目的：一次就能判定"规则有没有生效"——看得见就说明生效（之前只是太弱），
 * 看不见就说明选择器没命中，需要 DevTools 里的 class。
 * 验证通过后我会把它换回正常档位。
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
const MARK = '/* ==== 临时 10× 验证版（悬停诊断）====';
if (src.indexOf(MARK) >= 0) { console.log('已完成：验证版已在'); process.exit(0) }
const anchor = /(\.wsb-tileAbbr\{position:absolute;left:0;right:0;bottom:24px;text-align:center\})/;
if ((src.match(new RegExp(anchor.source, 'g')) || []).length !== 1) {
  console.log('中止：找不到锚点 —— 未写入。');
  process.exit(1);
}
const CSS = `
${MARK}
   悬停时：品红背景 + 白描边 + 放大 12% + 取消滤镜。强度拉到 10 倍，只用于判定规则是否生效。
   验证通过后替换回正常档位。 */
.wsb-screen:not([data-role="home"]) button:hover,
.wsb-screen:not([data-role="home"]) .wsb-chip:hover,
.wsb-screen:not([data-role="home"]) .wsb-tab:hover,
.wsb-screen:not([data-role="home"]) .wsb-segBtn:hover,
.wsb-screen:not([data-role="home"]) .wsb-iconBtn:hover,
.wsb-screen:not([data-role="home"]) .wsb-backBtn:hover,
.wsb-screen:not([data-role="home"]) .wsb-range:hover{
  background-color:#ff2d95 !important;
  border-color:#ffffff !important;
  color:#ffffff !important;
  transform:scale(1.12) !important;
  box-shadow:0 0 0 3px #ffffff !important;
  filter:none !important}`;
if (!apply) { console.log('演练：将追加验证版（未写入）。加 --apply 应用。'); process.exit(0) }
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
fs.copyFileSync(client, client + '.before-hover10x-' + stamp);
src = src.replace(anchor, (m) => `${m}${CSS}`);
fs.writeFileSync(client, src);
try { execFileSync(process.execPath, ['--check', client], { stdio: 'pipe' }); console.log('node --check 通过') }
catch (error) {
  fs.writeFileSync(client, fs.readFileSync(client + '.before-hover10x-' + stamp, 'utf8'));
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
