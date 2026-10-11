'use strict';
/**
 * A. 面板头颜色统一：控制台有一条独有规则给 .wsb-paneHead 上极光色调，其它屏没有。
 *    在样式表末尾补一条，让所有模块屏的面板头都用同一个色调（与对话后台一致）。
 * B. 磁贴正圆保证：形状滑条到底时 --wsb-card-radius 就是 50%（方磁贴下即正圆），
 *    在样式表最末尾再声明一次 border-radius，确保不被任何规则改写。
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
const MARK = '/* ==== 面板头与磁贴形状（统一/保证）====';
if (src.indexOf(MARK) >= 0) { console.log('已完成：两条规则都在'); process.exit(0) }
const anchor = /(\.wsb-tileAbbr\{position:absolute;left:0;right:0;bottom:24px;text-align:center\})/;
if ((src.match(new RegExp(anchor.source, 'g')) || []).length !== 1) {
  console.log('中止：找不到锚点 —— 未写入。');
  process.exit(1);
}
const CSS = `${MARK}
   1) 面板头：控制台原本有一条独有规则给它上极光色调，其它屏没有 —— 这里统一。
   2) 磁贴形状：滑条到底时 --wsb-card-radius 是 50%（方磁贴下即正圆）；再声明一次，
      放在样式表最末尾，确保不被任何规则改写。 */
.wsb-screen:not([data-role="home"]) .wsb-paneHead{
  background:color-mix(in srgb,var(--wsb-c1) 12%,transparent)}
.wsb-card{border-radius:var(--wsb-card-radius,20px)}`;
if (!apply) { console.log('演练：将追加两条规则（未写入）。加 --apply 应用。'); process.exit(0) }
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
fs.copyFileSync(client, client + '.before-panehead-' + stamp);
src = src.replace(anchor, (m) => `${m}\n\n${CSS}`);
fs.writeFileSync(client, src);
try { execFileSync(process.execPath, ['--check', client], { stdio: 'pipe' }); console.log('node --check 通过') }
catch (error) {
  fs.writeFileSync(client, fs.readFileSync(client + '.before-panehead-' + stamp, 'utf8'));
  console.log('回滚：' + String(error.stderr || error).slice(0, 200));
  process.exit(1);
}
const hash = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').slice(0, 16);
fs.copyFileSync(client, pkg);
console.log((hash(client) === hash(pkg) ? 'hash=OK  ' : 'MISMATCH ') + path.basename(pkg));
