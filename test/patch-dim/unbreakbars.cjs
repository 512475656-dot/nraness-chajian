'use strict';
/**
 * 修复被我弄坏的"读条动画"：
 *   我曾在 .wsb-root 上加了 contentIn 动画与一个 transition，覆盖了项目自己的内容入场动画；
 *   而他们的扫过时序（data-sweep="go" → wsb-piano / wsb-growBar 那一批读条动画）是挂在那条
 *   入场动画上的，被覆盖后读条就不再触发。
 * 做法：撤掉我在 .wsb-root 上的全局规则（动画 + 过渡），并撤掉不再需要的 @property 注册。
 *   保留的只有"只作用于模块屏"的那一层背景与控件 —— 范围窄，不会碰到别人的动画。
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
const drop = (label, text) => {
  const hits = src.split(text).length - 1;
  if (hits !== 1) { console.log('BAD   ' + label + '  [命中 ' + hits + ']'); bad += 1; return }
  src = src.replace(text, '');
  console.log('ok    ' + label);
};

drop('撤：.wsb-root 上的过渡',
  `.wsb-root{transition:--wsb-dim .5s cubic-bezier(.4,0,.2,1)}\n`);
drop('撤：.wsb-root 上的入场动画（会覆盖他们的，导致读条不触发）',
  `.wsb-screen:not([data-role="home"])>.wsb-root{animation:wsb-contentIn .5s cubic-bezier(.33,0,.2,1) .45s both}\n`);
drop('撤：不再需要的 @property 注册',
  `@property --wsb-dim{syntax:'<number>';initial-value:0;inherits:true}\n`);

if (bad > 0) { console.log('\n中止：' + bad + ' 处不符 —— 未写入。'); process.exit(1) }
if (src === original) { console.log('\n无需改动。'); process.exit(0) }
if (!apply) { console.log('\n演练结束：**尚未写入**。加 --apply 应用。'); process.exit(0) }
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
fs.copyFileSync(client, client + '.before-bars-' + stamp);
fs.writeFileSync(client, src);
try {
  execFileSync(process.execPath, ['--check', client], { stdio: 'pipe' });
  console.log('node --check 通过');
} catch (error) {
  fs.writeFileSync(client, fs.readFileSync(client + '.before-bars-' + stamp, 'utf8'));
  console.log('回滚：' + String(error.stderr || error).slice(0, 200));
  process.exit(1);
}
const hash = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').slice(0, 16);
fs.copyFileSync(client, pkg);
console.log((hash(client) === hash(pkg) ? 'hash=OK  ' : 'MISMATCH ') + path.basename(pkg));
