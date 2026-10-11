'use strict';
/**
 * 让绕圈规则"紧凑"：把长注释移到规则之外、把声明合并到更少的行。
 * 原因：自检用固定 560 字符的窗口截取 ::after{ 之后的内容 —— 我的注释写在规则里，
 * 把 mask-composite / animation 挤出了窗口，于是断言读不到（这不是断言错，是我的写法不够紧凑）。
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
const original = src;

const FROM = /\/\* 工作状态：一道光沿着磁贴内缘跑。[\s\S]{0,900}?@keyframes wsb-trace\{to\{--wsb-trace:360deg\}\}/;
const TO = `/* 工作状态：一道光沿磁贴内缘跑。遮罩跟随 border-radius，因此任何圆角都精确贴边。
   （offset-path 的路径与外框不重合，圆角越大偏差越大，所以换成这个做法。） */
@property --wsb-trace{syntax:'<angle>';initial-value:0deg;inherits:false}
.wsb-card[data-running="true"]::after{
  content:"";position:absolute;inset:0;z-index:2;pointer-events:none;padding:2px;border-radius:inherit;
  background:conic-gradient(from var(--wsb-trace),transparent 0deg 284deg,color-mix(in srgb,#fff 50%,transparent) 316deg,#fff 350deg,transparent 360deg);
  -webkit-mask:linear-gradient(#000,#000) content-box,linear-gradient(#000,#000);
  -webkit-mask-composite:xor;mask:linear-gradient(#000,#000) content-box,linear-gradient(#000,#000);
  mask-composite:exclude;
  animation:wsb-trace 3.6s linear infinite}
@keyframes wsb-trace{to{--wsb-trace:360deg}}`;

const hits = (src.match(new RegExp(FROM.source, 'g')) || []).length;
console.log('锚点命中 ' + hits + ' 处');
if (hits !== 1) { console.log('中止 —— 未写入。'); process.exit(1) }
if (!apply) { console.log('演练：将把规则改紧凑（未写入）。加 --apply 应用。'); process.exit(0) }
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
fs.copyFileSync(client, client + '.before-compact-' + stamp);
src = src.replace(FROM, TO);
fs.writeFileSync(client, src);
try {
  execFileSync(process.execPath, ['--check', client], { stdio: 'pipe' });
  console.log('node --check 通过');
} catch (error) {
  fs.writeFileSync(client, fs.readFileSync(client + '.before-compact-' + stamp, 'utf8'));
  console.log('回滚：' + String(error.stderr || error).slice(0, 200));
  process.exit(1);
}
const hash = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').slice(0, 16);
fs.copyFileSync(client, pkg);
console.log((hash(client) === hash(pkg) ? 'hash=OK  ' : 'MISMATCH ') + path.basename(pkg));
