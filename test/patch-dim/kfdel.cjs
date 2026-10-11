'use strict';
// 1) 删掉陈旧的关键帧（旧的 offset-distance 版，它排在后面会覆盖正确的那条）。
// 2) 定位 CSS 里多余的右括号：按行跟踪嵌套深度，深度变负的那一行就是。
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const ws = path.join(__dirname, '..', '..');
const client = path.join(ws, 'client.js');
const pkg = 'C:\\Users\\Administrator\\.dsh\\profiles\\desktop\\node_modules\\@local\\dsh-workbench\\client.js';
const apply = process.argv.indexOf('--apply') >= 0;
let src = fs.readFileSync(client, 'utf8');

// 2) 先看深度异常在哪（诊断，不写）
const start = src.indexOf('const CSS = `');
const end = src.indexOf('\n`;', start);
const css = src.slice(start, end);
const cssLines = css.split('\n');
let depth = 0;
const offenders = [];
cssLines.forEach((line, i) => {
  for (const ch of line) {
    if (ch === '{') depth += 1;
    else if (ch === '}') { depth -= 1; if (depth < 0) { offenders.push(i); depth = 0 } }
  }
});
console.log('深度变负的行（相对 CSS 起点）: ' + JSON.stringify(offenders.map((i) => i + 1)));
for (const i of offenders) {
  console.log('--- 附近 ---');
  for (let k = Math.max(0, i - 3); k <= Math.min(cssLines.length - 1, i + 2); k += 1) {
    console.log('  css#' + (k + 1) + ': ' + cssLines[k]);
  }
}

// 1) 删陈旧关键帧
const STALE = '\n@keyframes wsb-trace{to{offset-distance:100%}}';
const hits = src.split(STALE).length - 1;
console.log('陈旧关键帧: ' + hits + ' 处');
if (hits !== 1) { console.log('中止 —— 未写入。'); process.exit(1) }
if (!apply) { console.log('演练：将删除陈旧关键帧（未写入）。加 --apply 应用。'); process.exit(0) }
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
fs.copyFileSync(client, client + '.before-kfdel-' + stamp);
src = src.split(STALE).join('');
fs.writeFileSync(client, src);
try { execFileSync(process.execPath, ['--check', client], { stdio: 'pipe' }); console.log('node --check 通过') }
catch (error) {
  fs.writeFileSync(client, fs.readFileSync(client + '.before-kfdel-' + stamp, 'utf8'));
  console.log('回滚：' + String(error.stderr || error).slice(0, 200));
  process.exit(1);
}
const hash = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').slice(0, 16);
fs.copyFileSync(client, pkg);
console.log((hash(client) === hash(pkg) ? 'hash=OK  ' : 'MISMATCH ') + path.basename(pkg));
