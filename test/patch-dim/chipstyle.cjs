'use strict';
/**
 * 1) 撤掉全部临时诊断（品红 10×、静态纯白、保证可见版、统一悬停版、以及 JS 标题标记）。
 * 2) 按用户要求：把「AI 领域」chip 的悬停配方（上浮 1px + 边框变亮到 border-l2 + 底色用 bg-layer-2）
 *    原样套到返回按钮与所有模块按钮上 —— 同一套变量、同一套数值，观感一致。
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
const cut = (label, re) => {
  const hits = (src.match(new RegExp(re.source, 'g')) || []).length;
  if (hits !== 1) { console.log('BAD   ' + label + '  [命中 ' + hits + ']'); bad += 1; return }
  src = src.replace(new RegExp(re.source, 'g'), '');
  console.log('ok    撤掉 ' + label);
};

cut('品红 10× 验证版', /\/\* ==== 临时 10× 验证版（悬停诊断）====[\s\S]{0,900}?filter:none !important\}/);
cut('静态纯白验证', /\/\* ==== 临时静态验证：模块内所有按钮永久纯白 ====[\s\S]{0,900}?box-shadow:none !important\}/);
cut('保证可见版', /\/\* ==== 悬停高亮（保证可见版）====[\s\S]{0,1100}?border-color:currentColor !important\}/);
cut('统一悬停版', /\/\* ==== 模块内按钮：统一悬停高亮 ====[\s\S]{0,3200}?filter:brightness\(\.96\)\}/);
cut('JS 标题标记', /\n\s*\/\/ 临时验证标记：JS 改动一向能生效；标题变了而按钮没变 ⇒ CSS 通道有问题。\n\s*try \{ setTimeout\(\(\) => \{ document\.title = 'DSH-WB-OK' \}, 2500\) \} catch \(error\) \{ \/\* 忽略 \*\/ \}/);

// 追加：按 chip 配方统一
const run2 = (label, re, to) => {
  const hits = (src.match(new RegExp(re.source, 'g')) || []).length;
  if (hits !== 1) { console.log('BAD   ' + label + '  [命中 ' + hits + ']'); bad += 1; return }
  src = src.replace(re, to);
  console.log('ok    ' + label);
};
run2('按 chip 配方统一所有模块按钮',
  /(\.wsb-tileAbbr\{position:absolute;left:0;right:0;bottom:24px;text-align:center\})/,
  `$1

/* ==== 模块内所有按钮：与「AI 领域」chip 完全相同的悬停效果 ====
   chip 的配方是：基态边框 border-l1、底色 bg-layer-2；悬停时上浮 1px + 边框变亮到 border-l2。
   这里把同一套变量与数值套到返回按钮与其余模块按钮上 —— 观感与 chip 一致，四个模块一致。 */
.wsb-screen:not([data-role="home"]) :is(.wsb-backBtn,.wsb-btn,.wsb-chip,.wsb-tab,.wsb-segBtn,.wsb-iconBtn){
  transition:transform .2s cubic-bezier(.2,.8,.2,1),border-color .2s ease,background-color .2s ease,color .2s ease}
.wsb-screen:not([data-role="home"]) :is(.wsb-backBtn,.wsb-btn,.wsb-chip,.wsb-tab,.wsb-segBtn,.wsb-iconBtn):not([disabled]):hover{
  transform:translateY(-1px);
  border-color:var(--dsw-alias-border-l2);
  background-color:var(--dsw-alias-bg-layer-2);
  color:var(--dsw-alias-label-primary)}`);

if (bad > 0) { console.log('\n中止：' + bad + ' 处 —— 未写入。'); process.exit(1) }
if (src === original) { console.log('无需改动。'); process.exit(0) }
if (!apply) { console.log('演练结束（未写入）。加 --apply 应用。'); process.exit(0) }
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
fs.copyFileSync(client, client + '.before-chipstyle-' + stamp);
fs.writeFileSync(client, src);
try { execFileSync(process.execPath, ['--check', client], { stdio: 'pipe' }); console.log('node --check 通过') }
catch (error) {
  fs.writeFileSync(client, fs.readFileSync(client + '.before-chipstyle-' + stamp, 'utf8'));
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
