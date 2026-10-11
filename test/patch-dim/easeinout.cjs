'use strict';
/**
 * 压暗"瞬间就变暗"的真正原因：曲线起手太陡。
 *   cubic-bezier(.2,.75,.35,1) 在 0.2s 内就完成了约 55% 的变暗 —— 总时长再长也没用。
 * 改成 S 形（ease-in-out）：两端都缓，中段推进 —— 全程都是"渐渐"的，没有前段冲掉大部分。
 * 两条触发规则用的是同一行，一起替换。
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
const FROM = 'animation:wsb-dimIn 2s cubic-bezier(.2,.75,.35,1) both}';
const TO = 'animation:wsb-dimIn 2s cubic-bezier(.42,0,.58,1) both}';
const hits = src.split(FROM).length - 1;
console.log('锚点命中 ' + hits + ' 处（两条触发规则）');
if (hits !== 2) { console.log('中止 —— 未写入。'); process.exit(1) }
if (!apply) { console.log('演练：将换成 S 形曲线（未写入）。加 --apply 应用。'); process.exit(0) }
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
fs.copyFileSync(client, client + '.before-easeinout-' + stamp);
src = src.split(FROM).join(TO);
fs.writeFileSync(client, src);
try {
  execFileSync(process.execPath, ['--check', client], { stdio: 'pipe' });
  console.log('node --check 通过');
} catch (error) {
  fs.writeFileSync(client, fs.readFileSync(client + '.before-easeinout-' + stamp, 'utf8'));
  console.log('回滚：' + String(error.stderr || error).slice(0, 200));
  process.exit(1);
}
const hash = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').slice(0, 16);
fs.copyFileSync(client, pkg);
console.log((hash(client) === hash(pkg) ? 'hash=OK  ' : 'MISMATCH ') + path.basename(pkg));
