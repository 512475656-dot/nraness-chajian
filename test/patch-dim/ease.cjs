'use strict';
/**
 * 压暗曲线改成"先快后慢"（减速曲线）：
 *   之前用的是 cubic-bezier(.6,.02,.9,.5) —— 那是"前半天几乎不动、最后才冲"，
 *   正好和你要的相反。现在用 cubic-bezier(.16,.84,.44,1)（decelerate）：
 *   t=0.1s 时就已经暗了约一半（点下瞬间就快速变暗），之后渐渐慢下来。
 *   2 秒的总时长保持不变。
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
const FROM = 'opacity:0;animation:wsb-dimIn 2s cubic-bezier(.6,.02,.9,.5) forwards;';
const TO = 'opacity:0;animation:wsb-dimIn 2s cubic-bezier(.16,.84,.44,1) forwards;';
if (src.includes(TO)) { console.log('已完成：曲线已是减速曲线'); process.exit(0) }
const hits = src.split(FROM).length - 1;
console.log('锚点命中 ' + hits + ' 处');
if (hits !== 1) { console.log('中止 —— 未写入。'); process.exit(1) }
if (!apply) { console.log('演练：将换成减速曲线（未写入）。加 --apply 应用。'); process.exit(0) }
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
fs.copyFileSync(client, client + '.before-ease-' + stamp);
src = src.replace(FROM, TO);
fs.writeFileSync(client, src);
try {
  execFileSync(process.execPath, ['--check', client], { stdio: 'pipe' });
  console.log('node --check 通过');
} catch (error) {
  fs.writeFileSync(client, fs.readFileSync(client + '.before-ease-' + stamp, 'utf8'));
  console.log('回滚：' + String(error.stderr || error).slice(0, 200));
  process.exit(1);
}
const hash = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').slice(0, 16);
fs.copyFileSync(client, pkg);
console.log((hash(client) === hash(pkg) ? 'hash=OK  ' : 'MISMATCH ') + path.basename(pkg));
