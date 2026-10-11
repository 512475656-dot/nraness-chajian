'use strict';
/**
 * 统一提亮模块里的"标题栏"与"按钮背景"：
 *   1) 按钮：加一层白色 background-IMAGE（与 background-color 是两套图层），
 *      所以提亮的同时保留各自的原色与选中态（不会把选中态的蓝色洗掉）。
 *      选择器带 .wsb-screen:not([data-role=home]) → 四个模块完全一致。
 *   2) 标题栏：把我那层"更浅的渐变"整体调亮一档。
 *   3) 模块里的表面 token 也预混一点白，让所有用小 token 的面板一起提亮。
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

// 1) 标题栏渐变提亮一档
run('标题栏：渐变调亮（15/7/0 → 22/13/4）',
  /background:linear-gradient\(180deg,\n\s*color-mix\(in srgb,#fff 15%,transparent\) 0%,\n\s*color-mix\(in srgb,#fff 7%,transparent\) 58%,\n\s*color-mix\(in srgb,#fff 0%,transparent\) 100%\);/,
  `background:linear-gradient(180deg,
    color-mix(in srgb,#fff 22%,transparent) 0%,
    color-mix(in srgb,#fff 13%,transparent) 58%,
    color-mix(in srgb,#fff 4%,transparent) 100%);`);

// 2) 按钮统一提亮（白色背景图层，不动各自的原色/选中态）
run('按钮：统一叠一层白（保留原色与选中态）',
  /(\.wsb-tileAbbr\{position:absolute;left:0;right:0;bottom:24px;text-align:center\})/,
  `$1

/* ==== 模块里的按钮统一提亮 ====
   白色加在 background-IMAGE 上（与 background-color 是两套图层），
   所以只提亮、不覆盖各自的原色与选中态。选择器限定在模块屏内 —— 四个模块完全一致。 */
.wsb-screen:not([data-role="home"]) :is(.wsb-chip,.wsb-btn,.wsb-segBtn,.wsb-tab,.wsb-iconBtn,.wsb-backBtn,.wsb-range){
  background-image:linear-gradient(0deg,
    color-mix(in srgb,#fff 10%,transparent),
    color-mix(in srgb,#fff 15%,transparent))}`);

// 3) 模块表面 token 预混白
run('表面 token：预混 18% 白',
  /--dsw-alias-bg-layer-1:color-mix\(in srgb,var\(--wsb-host-layer-1\) calc\(var\(--wsb-glass-alpha,18%\) \+ 24%\),transparent\);[\s\S]{0,80}?--dsw-alias-bg-layer-2:color-mix\(in srgb,var\(--wsb-host-layer-2\) calc\(var\(--wsb-glass-alpha,18%\) \+ 24%\),transparent\)\}/,
  `--dsw-alias-bg-layer-1:color-mix(in srgb,color-mix(in srgb,var(--wsb-host-layer-1),#fff 18%) calc(var(--wsb-glass-alpha,18%) + 24%),transparent);
  --dsw-alias-bg-layer-2:color-mix(in srgb,color-mix(in srgb,var(--wsb-host-layer-2),#fff 18%) calc(var(--wsb-glass-alpha,18%) + 24%),transparent)}`);

if (bad > 0) { console.log('\n中止：' + bad + ' 处不符 —— 未写入。'); process.exit(1) }
if (src === original) { console.log('\n无需改动。'); process.exit(0) }
if (!apply) { console.log('\n演练结束（**尚未写入**）。加 --apply 应用。'); process.exit(0) }
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
fs.copyFileSync(client, client + '.before-bright-' + stamp);
fs.writeFileSync(client, src);
try { execFileSync(process.execPath, ['--check', client], { stdio: 'pipe' }); console.log('node --check 通过') }
catch (error) {
  fs.writeFileSync(client, fs.readFileSync(client + '.before-bright-' + stamp, 'utf8'));
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
