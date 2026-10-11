'use strict';
/**
 * 加"页面加载时刻"徽标（临时，用于判断是否真的刷新了）：
 *   在插件客户端代码加载的那一刻记下时间，显示在模块头部；
 *   每次整页刷新都会变 → 时间变了就是真的刷新了。
 *   同时拖动计数器会在刷新后归零，是第二个凭证。
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

// 1) 在工厂入口记下加载时刻（每次 bundle 重新加载都会重新执行）
run('记录加载时刻',
  /(factory\(require\) \{)/,
  `$1
    // 临时诊断：这一行在"插件客户端代码被加载"的那一刻执行 —— 整页刷新后时间会变。
    const WB_LOADED_AT = new Date();`);

// 2) 显示成徽标（放在拖动计数器旁边）
run('显示加载时刻徽标',
  /(\n\s*'data-pane-hit': '1',\n\s*\}, '拖动:' \+ paneHit\),)/,
  `$1
              h('span', {
                style: {
                  fontSize: '10.5px', marginLeft: '4px', padding: '1px 6px', borderRadius: '6px',
                  background: 'rgba(255,255,255,.14)', color: '#fff',
                },
                'data-wb-loaded': '1',
              }, '加载 ' + WB_LOADED_AT.toTimeString().slice(0, 8)),`);

if (bad > 0) { console.log('\n中止：' + bad + ' 处不符 —— 未写入。'); process.exit(1) }
if (src === original) { console.log('\n无需改动。'); process.exit(0) }
if (!apply) { console.log('\n演练结束（**尚未写入**）。加 --apply 应用。'); process.exit(0) }
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
fs.copyFileSync(client, client + '.before-loadtime-' + stamp);
fs.writeFileSync(client, src);
try { execFileSync(process.execPath, ['--check', client], { stdio: 'pipe' }); console.log('node --check 通过') }
catch (error) {
  fs.writeFileSync(client, fs.readFileSync(client + '.before-loadtime-' + stamp, 'utf8'));
  console.log('回滚：' + String(error.stderr || error).slice(0, 220));
  process.exit(1);
}
const hash = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').slice(0, 16);
fs.copyFileSync(client, pkg);
console.log((hash(client) === hash(pkg) ? 'hash=OK  ' : 'MISMATCH ') + path.basename(pkg));
