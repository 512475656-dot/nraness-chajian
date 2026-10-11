'use strict';
// 加固：渐入的触发条件不能依赖 DOM 顺序。补一条 :has() 写法（与原来的兄弟选择器各自独立，
// 任一命中即可）。两条分开写，因为一条里出现不支持的写法会让整条规则失效。
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const ws = path.join(__dirname, '..', '..');
const client = path.join(ws, 'client.js');
const pkg = 'C:\\Users\\Administrator\\.dsh\\profiles\\desktop\\node_modules\\@local\\dsh-workbench\\client.js';
const apply = process.argv.indexOf('--apply') >= 0;
let src = fs.readFileSync(client, 'utf8');
const ANCHOR = `.wsb-screen[data-role="home"][data-anim="fade-out"] ~ .wsb-screen:not([data-role="home"])::before{
  animation:wsb-dimIn 2s cubic-bezier(.2,.75,.35,1) both}`;
const EXTRA = `\n/* 同一条件的另一种写法，不依赖兄弟顺序。 */
.wsb-scr`;
if (src.includes('.wsb-stack:has(')) { console.log('已完成：:has() 那条已在'); process.exit(0) }
if (src.split(ANCHOR).length - 1 !== 1) { console.log('中止：找不到锚点 —— 未写入。'); process.exit(1) }
if (!apply) { console.log('演练：将补一条 :has() 规则（未写入）。加 --apply 应用。'); process.exit(0) }
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
fs.copyFileSync(client, client + '.before-has-' + stamp);
src = src.replace(ANCHOR, ANCHOR + `\n/* 同一条件、不依赖兄弟顺序的写法。 */
.wsb-stack:has(>.wsb-screen[data-role="home"][data-anim="fade-out"])>.wsb-screen:not([data-role="home"])::before{
  animation:wsb-dimIn 2s cubic-bezier(.2,.75,.35,1) both}`);
fs.writeFileSync(client, src);
try {
  execFileSync(process.execPath, ['--check', client], { stdio: 'pipe' });
  console.log('node --check 通过');
} catch (error) {
  fs.writeFileSync(client, fs.readFileSync(client + '.before-has-' + stamp, 'utf8'));
  console.log('回滚：' + String(error.stderr || error).slice(0, 200));
  process.exit(1);
}
const hash = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').slice(0, 16);
fs.copyFileSync(client, pkg);
console.log((hash(client) === hash(pkg) ? 'hash=OK  ' : 'MISMATCH ') + path.basename(pkg));
