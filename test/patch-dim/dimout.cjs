'use strict';
/**
 * 修"退出时卡一下"：
 *   那层压暗现在在屏的外面（.wsb-stack::after），退出时屏会淡出/滑走，但这一层留在原地，
 *   直到退出动画结束、相位翻成 idle 才被"啪"地关掉 → 末尾一次硬切，就是那"卡一下"。
 * 做法：给 stack 加一个 data-phase 属性（比 :has() 更稳），退出时让这一层用与屏同样的时长淡出。
 *   进入侧不动 —— 那里保持"点击即生效、无死区"。
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
const run = (label, from, to) => {
  const hits = src.split(from).length - 1;
  if (hits !== 1) { console.log('BAD   ' + label + '  [命中 ' + hits + ']'); bad += 1; return }
  src = src.replace(from, to);
  console.log('ok    ' + label);
};

run('标记：stack 带上当前相位',
  `h('div', { ref: stackRef, className: 'wsb-stack', style: { height: '100%' } },`,
  `h('div', { ref: stackRef, className: 'wsb-stack', 'data-phase': route.phase, style: { height: '100%' } },`);

run('退出：那一层跟着一起淡出',
  `[data-dim="false"] .wsb-stack::after{backdrop-filter:none}`,
  `[data-dim="false"] .wsb-stack::after{backdrop-filter:none}
/* 退出时跟着屏的退场一起淡出 —— 否则它会一直留到最后才被"啪"地关掉（就是那一下卡顿）。 */
.wsb-stack[data-phase="exiting"]::after{animation:wsb-dimOut var(--wsb-dur-zoom) var(--wsb-ease-in) both}
@keyframes wsb-dimOut{from{opacity:1}to{opacity:0}}`);

if (bad > 0) { console.log('\n中止：' + bad + ' 处不符 —— 未写入。'); process.exit(1) }
if (src === original) { console.log('\n无需改动。'); process.exit(0) }
if (!apply) { console.log('\n演练结束：**尚未写入**。加 --apply 应用。'); process.exit(0) }
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
fs.copyFileSync(client, client + '.before-dimout-' + stamp);
fs.writeFileSync(client, src);
try {
  execFileSync(process.execPath, ['--check', client], { stdio: 'pipe' });
  console.log('node --check 通过');
} catch (error) {
  fs.writeFileSync(client, fs.readFileSync(client + '.before-dimout-' + stamp, 'utf8'));
  console.log('回滚：' + String(error.stderr || error).slice(0, 200));
  process.exit(1);
}
const hash = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').slice(0, 16);
fs.copyFileSync(client, pkg);
console.log((hash(client) === hash(pkg) ? 'hash=OK  ' : 'MISMATCH ') + path.basename(pkg));
