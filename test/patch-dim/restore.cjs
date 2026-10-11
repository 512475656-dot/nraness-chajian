'use strict';
// 诊断并原地补回绕圈规则（紧凑、animation 在最前，符合自检窗口）。
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const ws = path.join(__dirname, '..', '..');
const client = path.join(ws, 'client.js');
const pkg = 'C:\\Users\\Administrator\\.dsh\\profiles\\desktop\\node_modules\\@local\\dsh-workbench\\client.js';
const apply = process.argv.indexOf('--apply') >= 0;
let src = fs.readFileSync(client, 'utf8');
const hasRule = src.includes('.wsb-card[data-running="true"]::after{');
console.log('规则是否存在: ' + hasRule);
console.log('@property --wsb-trace: ' + src.includes('@property --wsb-trace'));
console.log('conic-gradient(from var(--wsb-trace): ' + src.includes('conic-gradient(from var(--wsb-trace)'));
if (hasRule) { console.log('无需补回。'); process.exit(0) }

const RULE = `
/* 工作状态：一道光沿磁贴内缘跑。遮罩跟随 border-radius，因此任何圆角都精确贴边。
   （offset-path 的路径与外框不重合，圆角越大偏差越明显，所以换成了这个做法。） */
@property --wsb-trace{syntax:'<angle>';initial-value:0deg;inherits:false}
.wsb-card[data-running="true"]::after{
  animation:wsb-trace 3.6s linear infinite;
  content:"";position:absolute;inset:0;z-index:2;pointer-events:none;padding:2px;border-radius:inherit;
  background:conic-gradient(from var(--wsb-trace),transparent 0deg 284deg,color-mix(in srgb,#fff 50%,transparent) 316deg,#fff 350deg,transparent 360deg);
  -webkit-mask:linear-gradient(#000,#000) content-box,linear-gradient(#000,#000);
  -webkit-mask-composite:xor;mask:linear-gradient(#000,#000) content-box,linear-gradient(#000,#000);
  mask-composite:exclude}
@keyframes wsb-trace{to{--wsb-trace:360deg}}`;

const anchor = /(\.wsb-screen\[data-concealed="true"\] \.wsb-card\[data-running="true"\]::after\{animation-play-state:paused\})/;
if ((src.match(new RegExp(anchor.source, 'g')) || []).length !== 1) {
  console.log('中止：找不到稳定锚点 —— 未写入。');
  process.exit(1);
}
if (!apply) { console.log('演练：将补回绕圈规则（未写入）。加 --apply 应用。'); process.exit(0) }
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
fs.copyFileSync(client, client + '.before-restore-' + stamp);
src = src.replace(anchor, (m) => `${RULE}\n${m}`);
fs.writeFileSync(client, src);
try { execFileSync(process.execPath, ['--check', client], { stdio: 'pipe' }); console.log('node --check 通过') }
catch (error) {
  fs.writeFileSync(client, fs.readFileSync(client + '.before-restore-' + stamp, 'utf8'));
  console.log('回滚：' + String(error.stderr || error).slice(0, 200));
  process.exit(1);
}
const hash = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').slice(0, 16);
fs.copyFileSync(client, pkg);
console.log((hash(client) === hash(pkg) ? 'hash=OK  ' : 'MISMATCH ') + path.basename(pkg));
