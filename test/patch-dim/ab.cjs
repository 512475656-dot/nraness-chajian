'use strict';
/**
 * 把诊断拆成两个计数：
 *   A —— onDown 第一行就 +1（只要监听被触发就加，不受任何守卫影响）
 *   B —— 确认为"面板标题栏上的按下"之后才 +1
 * 组合含义：
 *   A=0            → 监听根本没挂上
 *   A>0, B=0       → 触发了但被守卫拦掉（类名/容器判断）
 *   B>0            → 判定成功，问题在拖动逻辑/视觉
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

// A：第一行计数
run('A 计数（监听被触发）',
  /(const onDown = \(event\) => \{\n)/,
  `$1          setPaneHitA((value) => value + 1);\n`);
// B：判定成功后计数（把原来的计数改名）
run('B 计数（判定成功）',
  /setPaneHit\(\(value\) => value \+ 1\);/,
  `setPaneHitB((value) => value + 1);`);
// 状态
run('新增两个计数器状态',
  /(const \[paneHit, setPaneHit\] = useState\(0\);)/,
  `const [paneHitA, setPaneHitA] = useState(0);
      const [paneHitB, setPaneHitB] = useState(0);`);
// 显示
run('显示两个计数',
  /('data-pane-hit': '1',\n\s*\}, '拖动:' \+ paneHit\),)/,
  `'data-pane-hit': '1',
              }, 'A:' + paneHitA + ' B:' + paneHitB),`);

if (bad > 0) { console.log('\n中止：' + bad + ' 处不符 —— 未写入。'); process.exit(1) }
if (src === original) { console.log('\n无需改动。'); process.exit(0) }
if (!apply) { console.log('\n演练结束（**尚未写入**）。加 --apply 应用。'); process.exit(0) }
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
fs.copyFileSync(client, client + '.before-ab-' + stamp);
fs.writeFileSync(client, src);
try { execFileSync(process.execPath, ['--check', client], { stdio: 'pipe' }); console.log('node --check 通过') }
catch (error) {
  fs.writeFileSync(client, fs.readFileSync(client + '.before-ab-' + stamp, 'utf8'));
  console.log('回滚：' + String(error.stderr || error).slice(0, 220));
  process.exit(1);
}
const hash = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').slice(0, 16);
fs.copyFileSync(client, pkg);
console.log((hash(client) === hash(pkg) ? 'hash=OK  ' : 'MISMATCH ') + path.basename(pkg));
