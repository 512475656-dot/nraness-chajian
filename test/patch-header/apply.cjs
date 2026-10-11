'use strict';
/**
 * 模块屏头部补丁 v2.1 —— 标题放大 + 字体 + 英文缩写 + 统一返回按钮 + 修好工作状态动画。
 * 默认演练；应用： node test/patch-header/apply.cjs --apply
 * 完全幂等：已完成的步骤会显示“已完成/已存在”，不重复插入。
 * 纪律不变：唯一锚点或容忍空白的正则；命中数不符即中止、一个字不写；写前备份，
 * 写后 node --check（失败回滚），再部署并校验 hash。
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const ws = path.join(__dirname, '..', '..');
const file = path.join(ws, 'client.js');
const pkg = 'C:\\Users\\Administrator\\.dsh\\profiles\\desktop\\node_modules\\@local\\dsh-workbench\\client.js';
const apply = process.argv.indexOf('--apply') >= 0;
let src = fs.readFileSync(file, 'utf8');
const original = src;
const CSS_BLOCK = fs.readFileSync(path.join(__dirname, 'header.css'), 'utf8').trimEnd();
const CHEVRON = `h('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' }, h('path', { d: 'M14.5 6 8.5 12l6 6' }))`;
let bad = 0;

const log = (state, label, extra) => console.log((state === 'ok' ? 'ok    ' : state === 'done' ? '已完成 ' : state === 'note' ? 'NOTE  ' : 'BAD   ') + label + (extra || ''));

// 通用：唯一锚点替换（可声明 doneMarker 实现幂等）。
const step = (label, re, replace, expected, doneMarker, soft) => {
  const g = new RegExp(re.source, 'g');
  const hits = (src.match(g) || []).length;
  if (hits === expected) {
    src = src.replace(g, replace);
    log('ok', label, '  [命中 ' + hits + ']');
    return;
  }
  if (doneMarker && src.includes(doneMarker)) { log('done', label); return }
  if (soft) { log('note', label, '  [命中 ' + hits + '，预期 ' + expected + ' — 跳过]'); return }
  log('bad', label, '  [命中 ' + hits + '，预期 ' + expected + ']');
  bad += 1;
};

// 1) 样式（幂等标记用新块里独有的一句）。
if (src.includes('.wsb-stkTitle span{font-size:13px')) {
  log('done', '样式：标题/副标题/缩写/返回按钮');
} else {
  const anchor = /\.wsb-title span\{font-size:11\.5px;[\s\S]{0,200}?max-width:38ch\}/;
  const hits = (src.match(new RegExp(anchor.source, 'g')) || []).length;
  if (hits !== 1) { log('bad', '样式：插入锚点', '  [命中 ' + hits + ']'); bad += 1 }
  else {
    src = src.replace(anchor, (m) => m + '\n\n' + CSS_BLOCK);
    log('ok', '样式：标题/副标题/缩写/返回按钮');
  }
}

// 2) 英文缩写（控制台 + 笔记）。
step('标记：标题后加英文缩写',
  /(\s*)h\('b', null, module\.name\),/,
  (m, indent) => `${indent}h('b', null, module.name),\n${indent}h('em', { className: 'wsb-titleAbbr' }, MODULE_ABBR[module.kind] || ''),`,
  2, `className: 'wsb-titleAbbr' }, MODULE_ABBR`);

// 3) 控制台/笔记返回按钮。
step('标记：控制台/笔记返回按钮',
  /h\('button', \{ type: 'button', className: 'wsb-btn', onClick: onBack, title: t\.panel \}, '‹ ' \+ t\.panel\),/,
  `h('button', {
    type: 'button', className: 'wsb-backBtn', 'aria-label': t.panel, title: t.panel, onClick: onBack,
  }, ${CHEVRON}),`,
  2, `className: 'wsb-backBtn', 'aria-label': t.panel`);

// 4) 股市返回按钮类名。
step('标记：股市返回按钮类名',
  /className: 'wsb-btn', 'data-stock-back': '1'/,
  `className: 'wsb-backBtn', 'data-stock-back': '1'`,
  1, `className: 'wsb-backBtn', 'data-stock-back'`);

// 5) 新闻返回按钮类名。
step('标记：新闻返回按钮类名',
  /className: 'wsb-btn wsb-anim', 'data-news-back': '1'/,
  `className: 'wsb-backBtn wsb-anim', 'data-news-back': '1'`,
  1, `className: 'wsb-backBtn wsb-anim', 'data-news-back'`);

// 6) 剩下的文字箭头换成同一枚 chevron（股市 + 新闻）。
step('标记：股市/新闻箭头换成同一枚 chevron',
  /\}, '‹'\),/,
  `}, ${CHEVRON}),`,
  2, `'M14.5 6 8.5 12l6 6'`, true);

// 7) 工作状态动画：::after 改成沿边缘绕圈的线（修好引用），并注册角度。
step('动画：绕圈的线（修好引用）',
  /\.wsb-card\[data-running="true"\]::after\{\s*content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;z-index:0;\s*background:linear-gradient\(104deg,transparent 40%,color-mix\(in srgb,#fff 20%,transparent\) 50%,transparent 60%\);\s*transform:translateX\(-130%\);\s*animation:wsb-sheen 4\.8s cubic-bezier\(\.4,0,\.2,1\) infinite\}/,
  `@property --wsb-trace{syntax:'<angle>';initial-value:0deg;inherits:false}
.wsb-card[data-running="true"]::after{
  content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;z-index:2;
  padding:1.8px;
  background:conic-gradient(from var(--wsb-trace),
    transparent 0deg 282deg,
    color-mix(in srgb,#fff 45%,transparent) 316deg,
    #fff 350deg,
    transparent 360deg);
  -webkit-mask:linear-gradient(#000,#000) content-box,linear-gradient(#000,#000);
  -webkit-mask-composite:xor;mask:linear-gradient(#000,#000) content-box,linear-gradient(#000,#000);
  mask-composite:exclude;
  opacity:.9;
  animation:wsb-trace 3.6s linear infinite}`,
  1, `animation:wsb-trace 3.6s linear infinite`, true);

// 8) 减少动效：静止亮边。
step('动画：减少动效下的静止亮边',
  /\.wsb-card\[data-running="true"\]::after\{animation:none;opacity:0\}/,
  `.wsb-card[data-running="true"]::after{animation:none;background:none;
    box-shadow:inset 0 0 0 1.8px color-mix(in srgb,#fff 55%,transparent)}`,
  1, `box-shadow:inset 0 0 0 1.8px`, true);

if (bad > 0) { console.log('\n中止：有 ' + bad + ' 处不符 —— 未写入任何内容。'); process.exit(1) }
if (src === original) { console.log('\n无需改动。'); process.exit(0) }
if (!apply) { console.log('\n演练结束：**尚未写入**。确认后： node test/patch-header/apply.cjs --apply'); process.exit(0) }

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
const backup = path.join(ws, 'client.before-header2-' + stamp + '.js');
fs.copyFileSync(file, backup);
fs.writeFileSync(file, src);
console.log('\n备份：' + path.basename(backup));
try {
  execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  console.log('node --check: 通过');
} catch (error) {
  fs.writeFileSync(file, original);
  console.log('node --check 失败，已回滚：' + String(error.stderr || error).slice(0, 300));
  process.exit(1);
}
const hash = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').slice(0, 16);
fs.copyFileSync(file, pkg);
console.log((hash(file) === hash(pkg) ? 'hash=OK  ' : 'MISMATCH ')
  + 'workspace ' + fs.statSync(file).size + ' B → installed ' + fs.statSync(pkg).size + ' B');
