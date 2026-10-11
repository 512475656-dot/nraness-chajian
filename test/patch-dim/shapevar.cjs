'use strict';
/**
 * 真病根：屏幕内部的 .wsb-root 把 --wsb-card-radius 设成了 20px（旧默认），
 * 自定义属性就近优先 → 磁贴一直继承到 20px，所以滑条怎么拉都是"方圆角"。
 * 修法：另发一个内层从未设过的变量 --wsb-shape-radius（值同样由滑条算出），
 * 磁贴与绕圈的 rx 都用它 → 外层值必胜、行内样式必然生效。
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

// 1) 另发一个内层没设过的变量（与 --wsb-card-radius 同值）。
run('发布：新增 --wsb-shape-radius',
  /('--wsb-card-radius': \(\(100 - clamp\(appearance\.radius === undefined \? 85 : appearance\.radius, 0, 100\)\) \/ 2\) \+ '%',)/,
  `// 内层的 .wsb-root 把 --wsb-card-radius 设成了旧默认 20px（就近优先，会盖掉这里）。
      // 所以另发一个内层从未设过的名字，磁贴与绕圈都用它 —— 外层值必胜。
      '--wsb-shape-radius': ((100 - clamp(appearance.radius === undefined ? 85 : appearance.radius, 0, 100)) / 2) + '%',
      $1`);

// 2) 磁贴行内半径改用它。
run('磁贴：行内半径改用 --wsb-shape-radius',
  /borderRadius: 'var\(--wsb-card-radius,20px\)',/,
  `borderRadius: 'var(--wsb-shape-radius, var(--wsb-card-radius, 20px))',`);

// 3) 绕圈的 rx 也改用它（否则光带与磁贴形状不一致）。
run('绕圈：rx 改用 --wsb-shape-radius',
  /stroke-width:2;rx:var\(--wsb-card-radius,20px\);/,
  `stroke-width:2;rx:var(--wsb-shape-radius, var(--wsb-card-radius, 20px));`);

// 4) 末尾那条兜底规则同步（避免它仍按旧变量走）。
run('兜底：末尾规则同步',
  /\.wsb-card\{border-radius:var\(--wsb-card-radius,20px\)\}/,
  `.wsb-card{border-radius:var(--wsb-shape-radius, var(--wsb-card-radius, 20px))}`);

if (bad > 0) { console.log('\n中止：' + bad + ' 处不符 —— 未写入。'); process.exit(1) }
if (src === original) { console.log('\n无需改动。'); process.exit(0) }
if (!apply) { console.log('\n演练结束（**尚未写入**）。加 --apply 应用。'); process.exit(0) }
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
fs.copyFileSync(client, client + '.before-shapevar-' + stamp);
fs.writeFileSync(client, src);
try { execFileSync(process.execPath, ['--check', client], { stdio: 'pipe' }); console.log('node --check 通过') }
catch (error) {
  fs.writeFileSync(client, fs.readFileSync(client + '.before-shapevar-' + stamp, 'utf8'));
  console.log('回滚：' + String(error.stderr || error).slice(0, 200));
  process.exit(1);
}
// 括号平衡核对（上轮学到的）
const s = src.indexOf('const CSS = `'); const e = src.indexOf('\n`;', s);
const css = src.slice(s, e);
const o = (css.match(/\{/g) || []).length; const c = (css.match(/\}/g) || []).length;
console.log('CSS 括号：{ ' + o + ' } ' + c + ' ' + (o === c ? '✓' : '**不平衡**'));
const hash = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').slice(0, 16);
fs.copyFileSync(client, pkg);
console.log((hash(client) === hash(pkg) ? 'hash=OK  ' : 'MISMATCH ') + path.basename(pkg));
