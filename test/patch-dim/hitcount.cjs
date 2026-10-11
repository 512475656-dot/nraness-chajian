'use strict';
/**
 * 诊断：在控制台头部显示一个计数器 —— 在面板标题栏上按下时 +1。
 *   0  = 处理函数从未被触发（挂载/事件拦截问题）
 *   >0 = 触发了（问题在拖动逻辑本身）
 * 同时把之前的 ✓ 标记换成一个明确的版本号文字，便于判断页面是否更新。
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

// 1) 计数器状态
run('加计数器状态',
  /(\n\s*const paneGridRef = useRef\(null\);)/,
  `
      // 临时诊断：在标题栏上按下时 +1，用来判断处理函数到底有没有被触发。
      const [paneHit, setPaneHit] = useState(0);
$1`);

// 2) 触发时 +1
run('触发时 +1',
  /(\n\s*const nodes = Array\.prototype\.slice\.call\(grid\.children\);\n\s*const source = nodes\.findIndex\(\(item\) => item\.contains\(head\)\);\n\s*if \(source < 0\) return;)/,
  `$1
          setPaneHit((value) => value + 1);`);

// 3) 把计数器显示出来（放在"显示项"标签后面）
run('显示计数器',
  /(h\('span', \{ className: 'wsb-panesLabel' \}, t\.panes\),)/,
  `$1
              h('span', {
                style: {
                  fontSize: '10.5px', marginLeft: '4px', padding: '1px 6px', borderRadius: '6px',
                  background: 'rgba(255,255,255,.14)', color: '#fff',
                },
                'data-pane-hit': '1',
              }, '拖动:' + paneHit),`);

if (bad > 0) { console.log('\n中止：' + bad + ' 处不符 —— 未写入。'); process.exit(1) }
if (src === original) { console.log('\n无需改动。'); process.exit(0) }
if (!apply) { console.log('\n演练结束（**尚未写入**）。加 --apply 应用。'); process.exit(0) }
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
fs.copyFileSync(client, client + '.before-hitcount-' + stamp);
fs.writeFileSync(client, src);
try { execFileSync(process.execPath, ['--check', client], { stdio: 'pipe' }); console.log('node --check 通过') }
catch (error) {
  fs.writeFileSync(client, fs.readFileSync(client + '.before-hitcount-' + stamp, 'utf8'));
  console.log('回滚：' + String(error.stderr || error).slice(0, 220));
  process.exit(1);
}
const hash = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').slice(0, 16);
fs.copyFileSync(client, pkg);
console.log((hash(client) === hash(pkg) ? 'hash=OK  ' : 'MISMATCH ') + path.basename(pkg));
