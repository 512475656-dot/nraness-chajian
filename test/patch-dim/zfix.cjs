'use strict';
// 把"头部抬到面板之上"这条规则补上（用规则本身当幂等标记）。
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const ws = path.join(__dirname, '..', '..');
const client = path.join(ws, 'client.js');
const pkg = 'C:\\Users\\Administrator\\.dsh\\profiles\\desktop\\node_modules\\@local\\dsh-workbench\\client.js';
const apply = process.argv.indexOf('--apply') >= 0;
const RULE = '.wsb-head,.wsb-nwHead,.wsb-stkHead{position:relative;z-index:6}';
let src = fs.readFileSync(client, 'utf8');
if (src.includes(RULE)) { console.log('已完成：规则已在'); process.exit(0) }
const anchor = /(\.wsb-dimWrap\{position:relative;display:inline-flex;flex:0 0 auto;order:9;margin-left:8px\})/;
if (!anchor.test(src)) { console.log('中止：找不到锚点 —— 未写入。'); process.exit(1) }
if (!apply) { console.log('演练：将插入头部层级规则（未写入）。加 --apply 应用。'); process.exit(0) }
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
fs.copyFileSync(client, client + '.before-z-' + stamp);
src = src.replace(anchor, RULE + '\n$1');
fs.writeFileSync(client, src);
try {
  execFileSync(process.execPath, ['--check', client], { stdio: 'pipe' });
  console.log('node --check 通过');
} catch (error) {
  fs.writeFileSync(client, fs.readFileSync(client + '.before-z-' + stamp, 'utf8'));
  console.log('回滚：' + String(error.stderr || error).slice(0, 200));
  process.exit(1);
}
const hash = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').slice(0, 16);
fs.copyFileSync(client, pkg);
console.log((hash(client) === hash(pkg) ? 'hash=OK  ' : 'MISMATCH ') + path.basename(pkg));
