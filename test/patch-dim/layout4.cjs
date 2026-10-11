'use strict';
/**
 * ① 框架笔记：删掉副标题（思维导图 · N 节点） + 工具条首组右对齐。
 * ② 更可靠的右对齐：给"标题元素"加 flex:'1 1 auto'，让它吃掉剩余空间，
 *    把后面的控件顶到最右边（蓝线位置）。控制台/新闻/股市三处一起加。
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

// ① 笔记副标题
run('笔记：删副标题',
  /\n\s*h\('span', null, t\['noteLay' \+ style\.layout\.charAt\(0\)\.toUpperCase\(\) \+ style\.layout\.slice\(1\)\][\s\S]{0,160}?t\.noteImages : ''\)\)\)/,
  ')');

// ①b 笔记工具条首组右对齐
run('笔记：工具条首组右对齐',
  /h\('div', \{ className: 'wsb-noteGroup' \},\n(\s*)h\('b', null, t\.noteLayout\),/,
  `h('div', { className: 'wsb-noteGroup', style: { marginLeft: 'auto' } },
$1h('b', null, t.noteLayout),`);

// ② 三个标题元素撑满剩余空间（把控件顶到最右）
//    注：.wsb-title 同时用于控制台与笔记，两处一起加（对笔记无害：其右侧按钮由 spacer 定位）。
run('控制台/笔记标题：撑满剩余空间',
  /h\('div', \{ className: 'wsb-title' \},/g,
  `h('div', { className: 'wsb-title', style: { flex: '1 1 auto', minWidth: '0' } },`, 2);
run('新闻标题：撑满剩余空间',
  /h\('div', \{ className: 'wsb-nwTitle' \},/,
  `h('div', { className: 'wsb-nwTitle', style: { flex: '1 1 auto', minWidth: '0' } },`);
run('股市标题：撑满剩余空间',
  /h\('div', \{ className: 'wsb-stkTitle' \},/,
  `h('div', { className: 'wsb-stkTitle', style: { flex: '1 1 auto', minWidth: '0' } },`);

if (bad > 0) { console.log('\n中止：' + bad + ' 处不符 —— 未写入。'); process.exit(1) }
if (src === original) { console.log('\n无需改动。'); process.exit(0) }
if (!apply) { console.log('\n演练结束（**尚未写入**）。加 --apply 应用。'); process.exit(0) }
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
fs.copyFileSync(client, client + '.before-layout4-' + stamp);
fs.writeFileSync(client, src);
try { execFileSync(process.execPath, ['--check', client], { stdio: 'pipe' }); console.log('node --check 通过') }
catch (error) {
  fs.writeFileSync(client, fs.readFileSync(client + '.before-layout4-' + stamp, 'utf8'));
  console.log('回滚：' + String(error.stderr || error).slice(0, 240));
  process.exit(1);
}
const hash = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').slice(0, 16);
fs.copyFileSync(client, pkg);
console.log((hash(client) === hash(pkg) ? 'hash=OK  ' : 'MISMATCH ') + path.basename(pkg));
