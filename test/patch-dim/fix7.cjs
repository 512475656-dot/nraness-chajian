'use strict';
/**
 * 1. 弹层改成头部内联展开的滑条 —— 不再浮层，因此不可能被遮挡/裁剪。
 * 2. 顺序改成"先渐渐压暗，再让窗口内容淡入"：
 *      · 压暗层 opacity 渐入从 0.55s 放慢到 0.8s；
 *      · 模块屏的内容加 0.22s 延迟 + 0.5s 淡入 —— 于是先看到背景变暗，窗口随后浮现。
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
const run = (label, re, replacement, doneMarker, expected) => {
  const want = expected === undefined ? 1 : expected;
  if (doneMarker && src.includes(doneMarker)) { console.log('已完成 ' + label); return }
  const hits = (src.match(new RegExp(re.source, 'g')) || []).length;
  if (hits !== want) { console.log('BAD   ' + label + '  [命中 ' + hits + '，预期 ' + want + ']'); bad += 1; return }
  src = src.replace(re, replacement);
  console.log('ok    ' + label);
};

// 1) 内联展开：把浮层容器换成内联容器。
run('内联：弹层容器改为内联',
  /h\('div', \{\n\s*className: 'wsb-dimPop', 'data-dim-pop': '1',\n\s*onClick: \(event\) => event\.stopPropagation\(\),\n\s*\},/,
  `h('span', { className: 'wsb-dimInline', 'data-dim-inline': '1' },`,
  "className: 'wsb-dimInline'");
run('内联：容器样式',
  /(\.wsb-dimHint\{margin-top:6px;font-size:11px;line-height:1\.5;color:var\(--dsw-alias-label-secondary\)\})/,
  `.wsb-dimInline{display:inline-flex;align-items:center;gap:10px;padding:3px 10px 3px 12px;\n`
  + `  border-radius:11px;border:1px solid color-mix(in srgb,var(--dsw-alias-label-primary) 12%,transparent);\n`
  + `  background:color-mix(in srgb,var(--dsw-alias-bg-layer-2) 46%,transparent);\n`
  + `  animation:wsb-nwIn .2s cubic-bezier(.22,.9,.24,1) both}\n`
  + `.wsb-dimInline .wsb-field{grid-template-columns:auto 132px 30px;gap:8px;padding:0}\n`
  + `.wsb-dimInline .wsb-field>label{font-size:11px}\n`
  + `.wsb-dimInline .wsb-dimHint{margin:0;font-size:10.5px;max-width:22ch;white-space:normal}\n`
  + `$1`,
  '.wsb-dimInline{display:inline-flex');

// 2) 压暗渐入放慢。
run('顺序：压暗渐入放慢到 0.8s',
  /opacity:0;animation:wsb-dimIn \.55s cubic-bezier\(\.4,0,\.2,1\) forwards;/,
  `opacity:0;animation:wsb-dimIn .8s cubic-bezier(.33,0,.2,1) forwards;`,
  'animation:wsb-dimIn .8s');

// 3) 窗口内容延迟淡入（先暗后现）。
run('顺序：窗口内容延迟淡入',
  /(@keyframes wsb-dimIn\{from\{opacity:0\}to\{opacity:1\}\})/,
  `$1\n`
  + `/* 顺序：背景先渐渐压暗，窗口内容随后浮现（复用项目中已有的 wsb-contentIn 关键帧）。 */\n`
  + `.wsb-screen:not([data-role="home"])>.wsb-root{animation:wsb-contentIn .5s cubic-bezier(.33,0,.2,1) .22s both}`,
  '先渐渐压暗，窗口内容随后浮现');

if (bad > 0) { console.log('\n中止：' + bad + ' 处不符 —— 未写入。'); process.exit(1) }
if (src === original) { console.log('\n无需改动。'); process.exit(0) }
if (!apply) { console.log('\n演练结束：**尚未写入**。加 --apply 应用。'); process.exit(0) }
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
fs.copyFileSync(client, client + '.before-dim5-' + stamp);
fs.writeFileSync(client, src);
try {
  execFileSync(process.execPath, ['--check', client], { stdio: 'pipe' });
  console.log('node --check 通过');
} catch (error) {
  fs.writeFileSync(client, original);
  console.log('回滚：' + String(error.stderr || error).slice(0, 220));
  process.exit(1);
}
const hash = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').slice(0, 16);
fs.copyFileSync(client, pkg);
console.log((hash(client) === hash(pkg) ? 'hash=OK  ' : 'MISMATCH ') + path.basename(pkg));
