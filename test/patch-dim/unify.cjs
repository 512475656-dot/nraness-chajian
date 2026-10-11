'use strict';
/**
 * 1. 撤掉"视频主色调采样"（用户担心性能，先不做）：
 *    删掉两个 ref、ref 回调里的采样块、以及那条掺色的 CSS。
 * 2. 统一材质：模块窗口里那些"接近不透明"的卡片，用的是主机表面色
 *    --dsw-alias-bg-layer-1/2（94%、100% 不透明）—— 这就是它们看着发灰、视频透不出来的原因。
 *    做法：先在 .wsb-stack 上把主机原值捕获到另外两个变量（不同名，不构成循环引用），
 *    再在模块屏作用域里把这两个主机 token 重定义为"走同一套玻璃透明度"的半透明色。
 *    于是所有模块里的表面（新闻卡片、股市行、笔记栏……）自动统一到同一套毛玻璃。
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
const drop = (label, re, expect) => {
  const want = expect === undefined ? 1 : expect;
  const hits = (src.match(new RegExp(re.source, 'g')) || []).length;
  if (hits !== want) { console.log('BAD   ' + label + '  [命中 ' + hits + '，预期 ' + want + ']'); bad += 1; return }
  src = src.replace(new RegExp(re.source, 'g'), '');
  console.log('ok    ' + label);
};

// 1) 撤掉采样
drop('撤：采样用的两个 ref',
  /\n[ \t]*\/\/ 主色调采样用的计时器与小画布（低频，几乎不耗）。\n[ \t]*const tintTimer = useRef\(null\);\n[ \t]*const tintCanvas = useRef\(null\);/);
drop('撤：ref 回调里的采样块',
  /\n[ \t]*if \(tintTimer\.current\) \{ clearInterval\(tintTimer\.current\); tintTimer\.current = null \}[\s\S]{0,1400}?tintTimer\.current = window\.setInterval\(sampleTint, 1200\);\n[ \t]*\}/);
drop('撤：掺色的 CSS 规则',
  /\n\/\* 窗口表面掺入工作台背景的主色调（由上面视频采样写入 --wsb-bg-tint）。\n[\s\S]{0,420}?color-mix\(in srgb,var\(--dsw-alias-bg-layer-1\) var\(--wsb-glass-alpha\),transparent\)\}/);

// 2) 统一材质
if (src.indexOf('--wsb-host-layer-1') >= 0) {
  console.log('已完成 统一：模块表面走同一套玻璃');
} else {
  const anchor = /(\.wsb-stack\{position:relative;z-index:1;flex:1 1 auto;min-height:0;overflow:hidden\})/;
  if ((src.match(new RegExp(anchor.source, 'g')) || []).length !== 1) {
    console.log('BAD   统一：找不到 .wsb-stack 规则');
    bad += 1;
  } else {
    src = src.replace(anchor, (m) => `${m}\n` +
      `/* 先在这层捕获主机表面色的原值（不同名 → 不构成循环引用）。 */\n` +
      `.wsb-stack{--wsb-host-layer-1:var(--dsw-alias-bg-layer-1);--wsb-host-layer-2:var(--dsw-alias-bg-layer-2)}\n` +
      `/* 模块窗口里的所有表面统一走同一套毛玻璃：把主机表面色本身改成半透明，\n` +
      `   透明度仍由「图标材质 / 透明度」那套变量驱动 —— 于是视频的主色调透得进来，\n` +
      `   四个模块窗口（新闻/股市/笔记/控制台）与桌面磁贴用的是同一种材质语言。 */\n` +
      `.wsb-screen:not([data-role="home"]){\n` +
      `  --dsw-alias-bg-layer-1:color-mix(in srgb,var(--wsb-host-layer-1) calc(var(--wsb-glass-alpha,18%) + 24%),transparent);\n` +
      `  --dsw-alias-bg-layer-2:color-mix(in srgb,var(--wsb-host-layer-2) calc(var(--wsb-glass-alpha,18%) + 24%),transparent)}`);
    console.log('ok    统一：模块表面走同一套玻璃');
  }
}

if (bad > 0) { console.log('\n中止：' + bad + ' 处不符 —— 未写入。'); process.exit(1) }
if (src === original) { console.log('\n无需改动。'); process.exit(0) }
if (!apply) { console.log('\n演练结束：**尚未写入**。加 --apply 应用。'); process.exit(0) }
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
fs.copyFileSync(client, client + '.before-unify-' + stamp);
fs.writeFileSync(client, src);
try {
  execFileSync(process.execPath, ['--check', client], { stdio: 'pipe' });
  console.log('node --check 通过');
} catch (error) {
  fs.writeFileSync(client, fs.readFileSync(client + '.before-unify-' + stamp, 'utf8'));
  console.log('回滚：' + String(error.stderr || error).slice(0, 220));
  process.exit(1);
}
const hash = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').slice(0, 16);
fs.copyFileSync(client, pkg);
console.log((hash(client) === hash(pkg) ? 'hash=OK  ' : 'MISMATCH ') + path.basename(pkg));
