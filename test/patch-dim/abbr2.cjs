'use strict';
// 新闻屏与股市屏的标题也要英文缩写（它们用的是自己的 b 元素）。
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
const run = (label, re, replacement, doneMarker) => {
  if (doneMarker && src.includes(doneMarker)) { console.log('已完成 ' + label); return }
  const hits = (src.match(new RegExp(re.source, 'g')) || []).length;
  if (hits !== 1) { console.log('BAD   ' + label + '  [命中 ' + hits + ']'); bad += 1; return }
  src = src.replace(re, replacement);
  console.log('ok    ' + label);
};
const ABBR = (indent) => `\n${indent}h('em', { className: 'wsb-titleAbbr' }, MODULE_ABBR[module.kind] || ''),`;
run('新闻屏：标题加缩写',
  /(\n([ \t]*)h\('b', null, t\.newsTitle\),)/,
  (m, whole, indent) => whole + ABBR(indent),
  "h('b', null, t.newsTitle),");
run('股市屏：标题加缩写',
  /(\n([ \t]*)h\('b', null, module\.name \|\| t\.kindStock\),)/,
  (m, whole, indent) => whole + ABBR(indent),
  "h('b', null, module.name || t.kindStock),");

if (bad > 0) { console.log('中止 —— 未写入。'); process.exit(1) }
if (src === original) { console.log('无需改动。'); process.exit(0) }
if (!apply) { console.log('演练结束（未写入）。加 --apply 应用。'); process.exit(0) }
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
fs.copyFileSync(client, client + '.before-abbr2-' + stamp);
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
