'use strict';
// 最后两处：
//  A. 把我绕圈规则里的 animation 声明挪到最前面（自检用 420 字符窗口读它，之前落在窗口外）。
//  B. 修掉我上一步在自检里多转义的一层反斜杠（\\( → \( ），否则那条正则什么都不匹配。
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const ws = path.join(__dirname, '..', '..');
const client = path.join(ws, 'client.js');
const harness = path.join(ws, 'test', 'render-check.cjs');
const pkgDir = 'C:\\Users\\Administrator\\.dsh\\profiles\\desktop\\node_modules\\@local\\dsh-workbench';
const apply = process.argv.indexOf('--apply') >= 0;
let bad = 0;

// A) 客户端：把 animation 挪到最前
let src = fs.readFileSync(client, 'utf8');
const FROM = `  content:"";position:absolute;inset:0;z-index:2;pointer-events:none;padding:2px;border-radius:inherit;`;
const TO = `  animation:wsb-trace 3.6s linear infinite;\n  content:"";position:absolute;inset:0;z-index:2;pointer-events:none;padding:2px;border-radius:inherit;`;
if (src.includes(TO)) { console.log('已完成 A') }
else if (src.split(FROM).length - 1 !== 1) { console.log('BAD   A  [命中 ' + (src.split(FROM).length - 1) + ']'); bad += 1 }
else {
  src = src.replace(FROM, TO)
    // 原来那行 animation 现在重复了，删掉后出现的那个
    .replace('  mask-composite:exclude;\n  animation:wsb-trace 3.6s linear infinite}', '  mask-composite:exclude}');
  console.log('ok    A：animation 挪到最前');
}

// B) 自检：修掉多转义的一层
let h = fs.readFileSync(harness, 'utf8');
const BAD_RE = String.raw`conic-gradient\\(from var\\(--wsb-trace\\)`;
const GOOD_RE = String.raw`conic-gradient\(from var\(--wsb-trace\)`;
if (h.includes(GOOD_RE) && !h.includes(BAD_RE)) { console.log('已完成 B') }
else if (h.split(BAD_RE).length - 1 !== 1) { console.log('BAD   B  [命中 ' + (h.split(BAD_RE).length - 1) + ']'); bad += 1 }
else { h = h.replace(BAD_RE, GOOD_RE); console.log('ok    B：修掉多余转义') }

if (bad > 0) { console.log('\n中止：' + bad + ' 处 —— 未写入。'); process.exit(1) }
if (!apply) { console.log('演练结束（未写入）。加 --apply 应用。'); process.exit(0) }
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
for (const [file, text] of [[client, src], [harness, h]]) {
  fs.copyFileSync(file, file + '.before-final-' + stamp);
  fs.writeFileSync(file, text);
  try { execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' }); console.log('node --check 通过 · ' + path.basename(file)) }
  catch (error) {
    fs.writeFileSync(file, fs.readFileSync(file + '.before-final-' + stamp, 'utf8'));
    console.log('回滚 ' + path.basename(file) + '：' + String(error.stderr || error).slice(0, 200));
    process.exit(1);
  }
}
const hash = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').slice(0, 16);
for (const rel of ['client.js', path.join('test', 'render-check.cjs')]) {
  const from = path.join(ws, rel); const to = path.join(pkgDir, rel);
  fs.copyFileSync(from, to);
  console.log((hash(from) === hash(to) ? 'hash=OK  ' : 'MISMATCH ') + rel);
}
