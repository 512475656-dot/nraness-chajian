'use strict';
/**
 * 修两处我自己的方法错误：
 *   1. 不该改写项目原有的「动画期禁用毛玻璃」规则（自检匹配的是原文本）。
 *      改为：把那行恢复原样，另加一条只针对本层 ::before 的规则。
 *   2. 上一步给新闻/股市加缩写的幂等标记选错了（标记就是锚点本身），改成真正的"已完成"标记。
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

// 1) 恢复他们原有的规则 + 另加一条只针对本层的。
run('恢复：原有的动画期禁用规则',
  /\.wsb-screen\[data-anim\] \.wsb-glass,\.wsb-screen\[data-anim\]:not\(\[data-role="home"\]\)::before\{backdrop-filter:none;-webkit-backdrop-filter:none;/,
  `.wsb-screen[data-anim] .wsb-glass{backdrop-filter:none;-webkit-backdrop-filter:none;\n`
  + `  /* 本层同理：入场动画期间不采样背景，否则切换界面会"黑一下"。这一条单独写，不动上面那条。 */\n`
  + `  }\n`
  + `.wsb-screen[data-anim]:not([data-role="home"])::before{backdrop-filter:none;-webkit-backdrop-filter:none;`,
  '这一条单独写');

// 2) 新闻/股市的缩写（用真正的已完成标记）。
const ABBR = (indent) => `\n${indent}h('em', { className: 'wsb-titleAbbr' }, MODULE_ABBR[module.kind] || ''),`;
run('新闻屏：标题加缩写',
  /(\n([ \t]*)h\('b', null, t\.newsTitle\),)/,
  (m, whole, indent) => whole + ABBR(indent),
  "h('b', null, t.newsTitle),\n              h('em'", 1);
run('股市屏：标题加缩写',
  /(\n([ \t]*)h\('b', null, module\.name \|\| t\.kindStock\),)/,
  (m, whole, indent) => whole + ABBR(indent),
  "h('b', null, module.name || t.kindStock),\n              h('em'", 1);

if (bad > 0) { console.log('\n中止：' + bad + ' 处不符 —— 未写入。'); process.exit(1) }
if (src === original) { console.log('\n无需改动。'); process.exit(0) }
if (!apply) { console.log('\n演练结束：**尚未写入**。加 --apply 应用。'); process.exit(0) }
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
fs.copyFileSync(client, client + '.before-fix5-' + stamp);
fs.writeFileSync(client, src);
try {
  execFileSync(process.execPath, ['--check', client], { stdio: 'pipe' });
  console.log('node --check 通过');
} catch (error) {
  fs.writeFileSync(client, original);
  console.log('回滚：' + String(error.stderr || error).slice(0, 200));
  process.exit(1);
}
const hash = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').slice(0, 16);
fs.copyFileSync(client, pkg);
console.log((hash(client) === hash(pkg) ? 'hash=OK  ' : 'MISMATCH ') + path.basename(pkg));
