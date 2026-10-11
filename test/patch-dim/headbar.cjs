'use strict';
/**
 * 统一四个模块屏的标题栏：
 *   查证结果 —— 样式表里没有"对话后台专属的标题栏规则"，所以那个毛玻璃条不是它独有的。
 *   要"统一"，唯一明确的定义就是：四个标题栏都用同一套玻璃表面（同一组 --wsb-glass-* 变量），
 *   于是颜色/模糊程度一起受「图标材质 / 透明度」控制，和窗口面板是同一种材质语言。
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
const MARK = '/* 统一：四个模块屏的标题栏用同一套玻璃表面';
if (src.indexOf(MARK) >= 0) { console.log('已完成：标题栏统一规则已在'); process.exit(0) }
const anchor = /(\.wsb-stack\{--wsb-host-layer-1:var\(--dsw-alias-bg-layer-1\);--wsb-host-layer-2:var\(--dsw-alias-bg-layer-2\)\})/;
if ((src.match(new RegExp(anchor.source, 'g')) || []).length !== 1) {
  console.log('中止：找不到统一体的锚点 —— 未写入。');
  process.exit(1);
}
const CSS = `${MARK}（与窗口面板同一组 --wsb-glass-* 变量）。 */
.wsb-head,.wsb-nwHead,.wsb-stkHead,.wsb-noteTopRow{
  padding:8px 11px;border-radius:14px;
  border:1px solid color-mix(in srgb,var(--dsw-alias-label-primary) 10%,transparent);
  background:color-mix(in srgb,var(--dsw-alias-bg-layer-1) calc(var(--wsb-glass-alpha,18%) + 24%),transparent);
  -webkit-backdrop-filter:blur(var(--wsb-glass-blur,8px)) saturate(var(--wsb-glass-sat,180%));
  backdrop-filter:blur(var(--wsb-glass-blur,8px)) saturate(var(--wsb-glass-sat,180%))}`;
if (!apply) { console.log('演练：将插入标题栏统一规则（未写入）。加 --apply 应用。'); process.exit(0) }
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
fs.copyFileSync(client, client + '.before-headbar-' + stamp);
src = src.replace(anchor, (m) => `${m}\n${CSS}`);
fs.writeFileSync(client, src);
try {
  execFileSync(process.execPath, ['--check', client], { stdio: 'pipe' });
  console.log('node --check 通过');
} catch (error) {
  fs.writeFileSync(client, fs.readFileSync(client + '.before-headbar-' + stamp, 'utf8'));
  console.log('回滚：' + String(error.stderr || error).slice(0, 200));
  process.exit(1);
}
const hash = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').slice(0, 16);
fs.copyFileSync(client, pkg);
console.log((hash(client) === hash(pkg) ? 'hash=OK  ' : 'MISMATCH ') + path.basename(pkg));
