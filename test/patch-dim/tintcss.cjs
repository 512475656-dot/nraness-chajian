'use strict';
// 只做一件事：把"掺入主色调"的那条 CSS 加到 .wsb-glass 原有背景规则之后。
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const ws = path.join(__dirname, '..', '..');
const client = path.join(ws, 'client.js');
const pkg = 'C:\\Users\\Administrator\\.dsh\\profiles\\desktop\\node_modules\\@local\\dsh-workbench\\client.js';
const apply = process.argv.indexOf('--apply') >= 0;
let src = fs.readFileSync(client, 'utf8');
if (src.indexOf('rgb(var(--wsb-bg-tint') >= 0) { console.log('已完成：CSS 那条已在'); process.exit(0) }

const TINT = `/* 窗口表面掺入工作台背景的主色调（由上面视频采样写入 --wsb-bg-tint）。
   单独一条、放在原有规则之后 —— 不改动他们的那一行；默认中性灰蓝，没有视频时不偏色。 */
.wsb-glass{background:
  linear-gradient(0deg,
    color-mix(in srgb,rgb(var(--wsb-bg-tint,128 148 168)) 20%,transparent),
    color-mix(in srgb,rgb(var(--wsb-bg-tint,128 148 168)) 10%,transparent)),
  color-mix(in srgb,var(--dsw-alias-bg-layer-1) var(--wsb-glass-alpha),transparent)}`;

const after = /\.wsb-glass\{background:color-mix\(in srgb,var\(--dsw-alias-bg-layer-1\)\s*var\(--wsb-glass-alpha\)[^}]*\)\}/;
const fallback = /\[data-glass="thick"\] \.wsb-card,\[data-glass="thick"\] \.wsb-glass\{/;
let next = null;
if ((src.match(new RegExp(after.source, 'g')) || []).length === 1) {
  next = src.replace(after, (m) => `${m}\n${TINT}`);
  console.log('方式：接在原规则之后');
} else if ((src.match(new RegExp(fallback.source, 'g')) || []).length === 1) {
  next = src.replace(fallback, (m) => `${TINT}\n${m}`);
  console.log('方式：退回更靠后的锚点（仍在原规则之后）');
} else {
  console.log('中止：两个锚点都没找到 —— 未写入。');
  process.exit(1);
}
if (!apply) { console.log('演练：将写入（未写入）。加 --apply 应用。'); process.exit(0) }
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
fs.copyFileSync(client, client + '.before-tintcss-' + stamp);
fs.writeFileSync(client, next);
try {
  execFileSync(process.execPath, ['--check', client], { stdio: 'pipe' });
  console.log('node --check 通过');
} catch (error) {
  fs.writeFileSync(client, fs.readFileSync(client + '.before-tintcss-' + stamp, 'utf8'));
  console.log('回滚：' + String(error.stderr || error).slice(0, 200));
  process.exit(1);
}
const hash = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').slice(0, 16);
fs.copyFileSync(client, pkg);
console.log((hash(client) === hash(pkg) ? 'hash=OK  ' : 'MISMATCH ') + path.basename(pkg));
