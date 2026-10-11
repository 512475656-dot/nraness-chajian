'use strict';
/**
 * 修 CSS 花括号不平衡（多 3 个 }），全部来自我自己的补丁切断规则：
 *   1) css#335-338：我在还原本条规则时把 } 插到了中间，孤立了它原本的 background: 尾巴 —— 重接。
 *   2) 另外三处是"只有尾巴、没有开头"的残片（对应早已移除的元素/块），直接删除。
 * 之后重新核对括号平衡，并跑一遍自检。
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

// 1) 重接被切断的那条规则
const BROKEN = `.wsb-screen[data-anim] .wsb-glass{backdrop-filter:none;-webkit-backdrop-filter:none;
  /* 本层同理：入场动画期间不采样背景，否则切换界面会"黑一下"。这一条单独写，不动上面那条。 */
  }
  background:color-mix(in srgb,var(--wsb-surface-2) calc(var(--wsb-glass-alpha,46%) + 14%),transparent)}`;
const FIXED = `.wsb-screen[data-anim] .wsb-glass{backdrop-filter:none;-webkit-backdrop-filter:none;
  background:color-mix(in srgb,var(--wsb-surface-2) calc(var(--wsb-glass-alpha,46%) + 14%),transparent)}
/* 本层同理：入场动画期间不采样背景，否则切换界面会"黑一下"。这一条单独写，不动上面那条。 */
.wsb-screen[data-anim]:not([data-role="home"])::before{backdrop-filter:none;-webkit-backdrop-filter:none}`;
if (src.includes(BROKEN)) { src = src.replace(BROKEN, FIXED); console.log('ok    重接被切断的规则') }
else { console.log('NOTE  那一处已不是这个形状（可能已被修好或改动）') }

// 2) 删掉三处死尾巴（只有 close、没有 open 的残片）
const orphans = [
  /^\s*background:color-mix\(in srgb,var\(--dsw-alias-bg-layer-1\) 26%,transparent\)\}\n/m,
  /^\s*transition:background \.18s ease,color \.18s ease,border-color \.18s ease,transform \.2s cubic-bezier\(\.2,\.8,\.2,1\)\}\n/m,
];
for (const re of orphans) {
  const hits = (src.match(new RegExp(re.source, 'gm')) || []).length;
  if (hits === 1) { src = src.replace(re, ''); console.log('ok    删除一处死尾巴') }
  else console.log('NOTE  死尾巴命中 ' + hits + ' 处，跳过');
}

// 3) 花括号平衡核对（只在模板字符串范围内）
const check = (text, label) => {
  const s = text.indexOf('const CSS = `');
  const e = text.indexOf('\n`;', s);
  const css = text.slice(s, e);
  const opens = (css.match(/\{/g) || []).length;
  const closes = (css.match(/\}/g) || []).length;
  console.log('  ' + label + '：{ ' + opens + '  } ' + closes + '  ' + (opens === closes ? '平衡 ✓' : '**不平衡**'));
};
check(original, '修改前');
check(src, '修改后');
if ((src.match(/\{/g) || []).length !== (src.match(/\}/g) || []).length) { /* 全文不必相等（JS 部分括号很多） */ }

if (bad > 0) { console.log('中止 —— 未写入。'); process.exit(1) }
if (src === original) { console.log('无需改动。'); process.exit(0) }
if (!apply) { console.log('演练结束（未写入）。加 --apply 应用。'); process.exit(0) }
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
fs.copyFileSync(client, client + '.before-braces-' + stamp);
fs.writeFileSync(client, src);
try { execFileSync(process.execPath, ['--check', client], { stdio: 'pipe' }); console.log('node --check 通过') }
catch (error) {
  fs.writeFileSync(client, fs.readFileSync(client + '.before-braces-' + stamp, 'utf8'));
  console.log('回滚：' + String(error.stderr || error).slice(0, 200));
  process.exit(1);
}
const hash = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').slice(0, 16);
fs.copyFileSync(client, pkg);
console.log((hash(client) === hash(pkg) ? 'hash=OK  ' : 'MISMATCH ') + path.basename(pkg));
