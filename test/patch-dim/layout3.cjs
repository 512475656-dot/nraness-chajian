'use strict';
/**
 * 三个模块头部版面统一（与控制台同一套做法）：
 *   ① 删掉标题旁的红框副标题：新闻 t.newsSubHint / 股市 t.stockSubHint。
 *   ② 绿框整排右对齐：给"控件排的第一个元素"加 marginLeft:auto
 *      —— 新闻是「N 分钟前」chip（.wsb-nwLive），股市是「刷新 / 市场」组（第一个 .wsb-stkGroup）。
 *   （控制台已在上一轮改好。）
 * 全部用内联样式，不依赖样式表。
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

// ① 删副标题
run('新闻：删副标题',
  /\n\s*h\('span', null, t\.newsSubHint\)\)/,
  ')');
run('股市：删副标题',
  /\n\s*h\('span', null, t\.stockSubHint\)\)/,
  ')');

// ② 右对齐起点
run('新闻：控件排右对齐起点（N 分钟前 chip）',
  /h\('span', \{ className: 'wsb-nwLive', title: t\.newsArchiveHint \},/,
  `h('span', {
          className: 'wsb-nwLive', title: t.newsArchiveHint,
          // 控件排右对齐：从这一项起（含它）之后的兄弟元素一起被推到右侧。
          style: { marginLeft: 'auto' },
        },`);
run('股市：控件排右对齐起点（刷新 / 市场 组）',
  /h\('div', \{ className: 'wsb-stkGroup' \},\n(\s*)h\('button', \{\n\s*type: 'button', className: 'wsb-btn', 'data-stock-refresh': '1',/,
  `h('div', {
          className: 'wsb-stkGroup',
          // 控件排右对齐：从这一组起（含它）之后的兄弟元素一起被推到右侧。
          style: { marginLeft: 'auto' },
        },
        h('button', {
          type: 'button', className: 'wsb-btn', 'data-stock-refresh': '1',`);

if (bad > 0) { console.log('\n中止：' + bad + ' 处不符 —— 未写入。'); process.exit(1) }
if (src === original) { console.log('\n无需改动。'); process.exit(0) }
if (!apply) { console.log('\n演练结束（**尚未写入**）。加 --apply 应用。'); process.exit(0) }
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
fs.copyFileSync(client, client + '.before-layout3-' + stamp);
fs.writeFileSync(client, src);
try { execFileSync(process.execPath, ['--check', client], { stdio: 'pipe' }); console.log('node --check 通过') }
catch (error) {
  fs.writeFileSync(client, fs.readFileSync(client + '.before-layout3-' + stamp, 'utf8'));
  console.log('回滚：' + String(error.stderr || error).slice(0, 240));
  process.exit(1);
}
const hash = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').slice(0, 16);
fs.copyFileSync(client, pkg);
console.log((hash(client) === hash(pkg) ? 'hash=OK  ' : 'MISMATCH ') + path.basename(pkg));
