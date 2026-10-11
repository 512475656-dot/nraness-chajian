'use strict';
/**
 * 两个"不可能看不见"的临时验证：
 *   A. 静态纯白测试 —— 不用 :hover，直接给模块里所有按钮永久叠加纯白底 + 亮绿描边。
 *      看不到就等于 CSS 根本没到页面上。
 *   B. JS 标记 —— 启动后把窗口标题改成 DSH-WB-OK。JS 改动一向能生效，
 *      所以"标题变了、按钮没变"就能证明是 CSS 通道的问题（而不是 bundle 整体没更新）。
 * 两者都是临时的，验证完立刻撤掉。
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
let bad = 0;
const run = (label, re, to, expect) => {
  const want = expect === undefined ? 1 : expect;
  const hits = (src.match(new RegExp(re.source, 'g')) || []).length;
  if (hits !== want) { console.log('BAD   ' + label + '  [命中 ' + hits + '，预期 ' + want + ']'); bad += 1; return }
  src = src.replace(re, to);
  console.log('ok    ' + label);
};

// A) 静态纯白测试（CSS）
run('A. 静态纯白测试（不用 hover）',
  /(\.wsb-tileAbbr\{position:absolute;left:0;right:0;bottom:24px;text-align:center\})/,
  `$1

/* ==== 临时静态验证：模块内所有按钮永久纯白 ====
   不使用 :hover（悬停不好排查），直接永久生效。看不到就说明 CSS 没到页面。 */
.wsb-screen:not([data-role="home"]) button,
.wsb-screen:not([data-role="home"]) .wsb-chip,
.wsb-screen:not([data-role="home"]) .wsb-tab,
.wsb-screen:not([data-role="home"]) .wsb-segBtn,
.wsb-screen:not([data-role="home"]) .wsb-iconBtn,
.wsb-screen:not([data-role="home"]) .wsb-backBtn,
.wsb-screen:not([data-role="home"]) .wsb-range{
  background-color:#ffffff !important;
  background-image:none !important;
  color:#101014 !important;
  border:2px solid #00ff88 !important;
  filter:none !important;
  box-shadow:none !important}`);

// B) JS 标记（把窗口标题改掉）
run('B. JS 标记：改窗口标题',
  /(\n\s*const CSS = `)/,
  `
      // 临时验证标记：JS 改动一向能生效；标题变了而按钮没变 ⇒ CSS 通道有问题。
      try { setTimeout(() => { document.title = 'DSH-WB-OK' }, 2500) } catch (error) { /* 忽略 */ }
$1`);

if (bad > 0) { console.log('\n中止：' + bad + ' 处不符 —— 未写入。'); process.exit(1) }
if (src === original) { console.log('\n无需改动。'); process.exit(0) }
if (!apply) { console.log('\n演练结束（**尚未写入**）。加 --apply 应用。'); process.exit(0) }
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
fs.copyFileSync(client, client + '.before-static-' + stamp);
fs.writeFileSync(client, src);
try { execFileSync(process.execPath, ['--check', client], { stdio: 'pipe' }); console.log('node --check 通过') }
catch (error) {
  fs.writeFileSync(client, fs.readFileSync(client + '.before-static-' + stamp, 'utf8'));
  console.log('回滚：' + String(error.stderr || error).slice(0, 220));
  process.exit(1);
}
const s = src.indexOf('const CSS = `'); const e = src.indexOf('\n`;', s);
const css = src.slice(s, e);
const o = (css.match(/\{/g) || []).length; const c = (css.match(/\}/g) || []).length;
console.log('CSS 括号：{ ' + o + ' } ' + c + ' ' + (o === c ? '✓' : '**不平衡**'));
const hash = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').slice(0, 16);
fs.copyFileSync(client, pkg);
console.log((hash(client) === hash(pkg) ? 'hash=OK  ' : 'MISMATCH ') + path.basename(pkg));
