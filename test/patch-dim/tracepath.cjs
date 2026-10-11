'use strict';
/**
 * 修"绕圈的线跑得歪"：
 *   路径原本是 inset(0) —— 正好压在磁贴最外沿，而线本身有 2px 高，于是有一半落在磁贴外、
 *   被 overflow:hidden 裁掉；转到圆角时线是斜的，就只剩角上一小截歪斜的白线。
 *   改成：路径内收 2px（整条线都在磁贴内），线收短到 22px，转弯处更像沿着边跑。
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
const run = (label, re, to) => {
  const hits = (src.match(new RegExp(re.source, 'g')) || []).length;
  if (hits !== 1) { console.log('BAD   ' + label + '  [命中 ' + hits + ']'); bad += 1; return }
  src = src.replace(re, to);
  console.log('ok    ' + label);
};

run('绕圈：路径内收 2px + 线收短',
  /content:"";position:absolute;width:30px;height:2px;border-radius:2px;\n\s*background:#fff;\n\s*box-shadow:0 0 6px color-mix\(in srgb,#fff 55%,transparent\);\n\s*offset-path:inset\(0 round var\(--wsb-card-radius,20px\)\);/,
  `content:"";position:absolute;width:22px;height:2px;border-radius:2px;
  background:#fff;
  box-shadow:0 0 6px color-mix(in srgb,#fff 55%,transparent);
  /* 内收 2px：线有 2px 高，压在 inset(0) 上会被裁掉一半，角上就只剩一小截斜线。 */
  offset-path:inset(2px round var(--wsb-card-radius,20px));`);

if (bad > 0) { console.log('\n中止：' + bad + ' 处不符 —— 未写入。'); process.exit(1) }
if (src === original) { console.log('\n无需改动。'); process.exit(0) }
if (!apply) { console.log('\n演练结束：**尚未写入**。加 --apply 应用。'); process.exit(0) }
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
fs.copyFileSync(client, client + '.before-tracepath-' + stamp);
fs.writeFileSync(client, src);
try {
  execFileSync(process.execPath, ['--check', client], { stdio: 'pipe' });
  console.log('node --check 通过');
} catch (error) {
  fs.writeFileSync(client, fs.readFileSync(client + '.before-tracepath-' + stamp, 'utf8'));
  console.log('回滚：' + String(error.stderr || error).slice(0, 200));
  process.exit(1);
}
const hash = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').slice(0, 16);
fs.copyFileSync(client, pkg);
console.log((hash(client) === hash(pkg) ? 'hash=OK  ' : 'MISMATCH ') + path.basename(pkg));
