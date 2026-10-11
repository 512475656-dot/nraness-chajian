'use strict';
/**
 * 1) 真实缺陷修复：从标题栏上的按钮/输入框按下时不应触发拖动（否则会挡住它们的点击）。
 * 2) 临时可视标记：把控制台"显示项"标签改成 "显示项 ✓" —— 你一眼就能判断页面有没有拿到新代码。
 *    （确认后我会把这个 ✓ 撤掉。）
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

// 1) 跳过交互元素
run('修复：按钮/输入框上的按下不触发拖动',
  /(const head = node && node\.closest \? node\.closest\('\.wsb-paneHead'\) : null;\n)(\s*)(const grid = paneGridRef\.current;)/,
  `$1        if (node && node.closest && node.closest('button,input,select,textarea,a,[contenteditable="true"]')) return;
$2$3`);

// 2) 可视标记（自动定位含"显示项"的那个字符串字面量）
run('标记：显示项 → 显示项 ✓',
  /(displayItems|panes)\s*:\s*'显示项'/,
  (m) => `${m.replace("'显示项'", "'显示项 ✓'")}`);

if (bad > 0) { console.log('\n中止：' + bad + ' 处不符 —— 未写入。'); process.exit(1) }
if (src === original) { console.log('\n无需改动。'); process.exit(0) }
if (!apply) { console.log('\n演练结束（**尚未写入**）。加 --apply 应用。'); process.exit(0) }
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
fs.copyFileSync(client, client + '.before-marker-' + stamp);
fs.writeFileSync(client, src);
try { execFileSync(process.execPath, ['--check', client], { stdio: 'pipe' }); console.log('node --check 通过') }
catch (error) {
  fs.writeFileSync(client, fs.readFileSync(client + '.before-marker-' + stamp, 'utf8'));
  console.log('回滚：' + String(error.stderr || error).slice(0, 220));
  process.exit(1);
}
const hash = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').slice(0, 16);
fs.copyFileSync(client, pkg);
console.log((hash(client) === hash(pkg) ? 'hash=OK  ' : 'MISMATCH ') + path.basename(pkg));
