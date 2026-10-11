'use strict';
/**
 * 修"模块界面出现后，桌面磁贴又露一次"：
 *   根因是我加的那条 visibility 延迟 —— 首页在"该隐藏"之后又多留了 0.46s，
 *   而模块屏是透明的（要透出桌面背景），于是那批磁贴从模块界面背后又露了出来。
 *   这条延迟本来就不需要：首页的淡出在入场阶段就完成了（wsb-homeOut 结束时 opacity=0，
 *   且 fill=both 会保持），隐藏随后发生，所以不会闪。
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
const FROM = `.wsb-screen[data-concealed="true"]{visibility:hidden;pointer-events:none;transition:visibility 0s linear .46s}`;
const TO = `.wsb-screen[data-concealed="true"]{visibility:hidden;pointer-events:none}`;
const hits = src.split(FROM).length - 1;
console.log('锚点命中 ' + hits + ' 处');
if (hits !== 1) { console.log('中止 —— 未写入。'); process.exit(1) }
if (!apply) { console.log('演练：将撤掉这条延迟（未写入）。加 --apply 应用。'); process.exit(0) }
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
fs.copyFileSync(client, client + '.before-nodelay-' + stamp);
src = src.replace(FROM, TO);
fs.writeFileSync(client, src);
try {
  execFileSync(process.execPath, ['--check', client], { stdio: 'pipe' });
  console.log('node --check 通过');
} catch (error) {
  fs.writeFileSync(client, fs.readFileSync(client + '.before-nodelay-' + stamp, 'utf8'));
  console.log('回滚：' + String(error.stderr || error).slice(0, 200));
  process.exit(1);
}
const hash = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').slice(0, 16);
fs.copyFileSync(client, pkg);
console.log((hash(client) === hash(pkg) ? 'hash=OK  ' : 'MISMATCH ') + path.basename(pkg));
