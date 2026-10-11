'use strict';
/**
 * 把压暗层从"模块屏的 ::before"挪到"屏的父节点 .wsb-stack 的 ::after"。
 *   原因：入场是纯淡入（wsb-zoomIn = opacity 0→1），其曲线起步很平，前约 0.15s 几乎没有变化；
 *   压暗层长在那个屏里，就必然继承这段死区 → 所以"进入感觉有延迟"，而退出因为有位移所以立刻可见。
 *   挪到常驻的父节点后：
 *     · 不再被屏的淡入拖累 → 点击即生效，没有死区；
 *     · 常驻元素，模块之间切换不会重播；
 *     · 场景仍然柔和：首页自己淡出、窗口内容自己淡入（那两段是项目原有的）。
 *   层级：home 的 z-index 是 1、模块屏是 2 —— ::after 与 home 同为 1 且在其后 → 压暗盖住首页，
 *   但仍在模块内容之下，所以面板与文字保持清晰。
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
const run = (label, from, to, expect) => {
  const want = expect === undefined ? 1 : expect;
  const hits = src.split(from).length - 1;
  if (hits !== want) { console.log('BAD   ' + label + '  [命中 ' + hits + '，预期 ' + want + ']'); bad += 1; return }
  src = src.split(from).join(to);
  console.log('ok    ' + label);
};

run('层级：移除那层"把内容抬到 ::before 之上"的规则（不再需要）',
  `.wsb-screen:not([data-role="home"])>.wsb-root{position:relative;z-index:1}\n`,
  '');

run('迁移：模块屏 ::before → .wsb-stack::after',
  `.wsb-screen:not([data-role="home"])::before{content:"";position:absolute;inset:0;z-index:0;`,
  `.wsb-stack::after{content:"";position:absolute;inset:0;z-index:1;`);

run('迁移：dim=0 时的关闭规则同步',
  `[data-dim="false"] .wsb-screen:not([data-role="home"])::before{backdrop-filter:none}`,
  `[data-dim="false"] .wsb-stack::after{backdrop-filter:none}`);

if (bad > 0) { console.log('\n中止：' + bad + ' 处不符 —— 未写入。'); process.exit(1) }
if (src === original) { console.log('\n无需改动。'); process.exit(0) }
if (!apply) { console.log('\n演练结束：**尚未写入**。加 --apply 应用。'); process.exit(0) }
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
fs.copyFileSync(client, client + '.before-stacklayer-' + stamp);
fs.writeFileSync(client, src);
try {
  execFileSync(process.execPath, ['--check', client], { stdio: 'pipe' });
  console.log('node --check 通过');
} catch (error) {
  fs.writeFileSync(client, fs.readFileSync(client + '.before-stacklayer-' + stamp, 'utf8'));
  console.log('回滚：' + String(error.stderr || error).slice(0, 200));
  process.exit(1);
}
const hash = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').slice(0, 16);
fs.copyFileSync(client, pkg);
console.log((hash(client) === hash(pkg) ? 'hash=OK  ' : 'MISMATCH ') + path.basename(pkg));
