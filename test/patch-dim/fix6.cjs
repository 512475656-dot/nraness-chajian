'use strict';
/**
 * 1. 进入模块的压暗改成"渐渐变暗"：
 *    · 恢复"滤镜一直开着"，改让这一层 opacity 从 0 渐入 —— 既不闪黑，又是渐变；
 *    · 顺便注册 --wsb-dim 为可动画的数字，于是拖滑条时也是平滑过渡。
 * 2. 控件换成与头部其它按钮同款的图标按钮（不再显示数字），并把头部层级抬到面板之上，解决遮挡。
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
const run = (label, re, replacement, doneMarker, expected) => {
  const want = expected === undefined ? 1 : expected;
  if (doneMarker && src.includes(doneMarker)) { console.log('已完成 ' + label); return }
  const hits = (src.match(new RegExp(re.source, 'g')) || []).length;
  if (hits !== want) { console.log('BAD   ' + label + '  [命中 ' + hits + '，预期 ' + want + ']'); bad += 1; return }
  src = src.replace(re, replacement);
  console.log('ok    ' + label);
};

// 1) 去掉"动画期禁用本层滤镜"那条（改用 opacity 渐入，就不再需要它；同时保持项目原有那条不动）。
run('恢复：移除本层的动画期禁用',
  /\n\.wsb-screen\[data-anim\]:not\(\[data-role="home"\]\)::before\{backdrop-filter:none;-webkit-backdrop-filter:none;\n?/,
  '\n',
  null);

// 2) 本层改为 opacity 渐入，并注册可动画的 --wsb-dim。
run('渐入：本层 opacity 动画 + 注册变量',
  /(\.wsb-screen:not\(\[data-role="home"\]\)::before\{content:"";position:absolute;inset:0;z-index:0;\n\s*pointer-events:none;\n)(\s*backdrop-filter:blur\(calc\(var\(--wsb-dim,0\) \* 0\.2px\)\) brightness\(calc\(1 - var\(--wsb-dim,0\) \* 0\.0065\)\)\})/,
  (m, head, filter) => `@property --wsb-dim{syntax:'<number>';initial-value:0;inherits:true}\n`
    + `.wsb-root{transition:--wsb-dim .5s cubic-bezier(.4,0,.2,1)}\n`
    + `${head}`
    + `  /* 滤镜从头就开着，靠 opacity 渐入 —— 这样既不闪黑，也是"渐渐变暗"。 */\n`
    + `  opacity:0;animation:wsb-dimIn .55s cubic-bezier(.4,0,.2,1) forwards;\n  ${filter}\n`
    + `@keyframes wsb-dimIn{from{opacity:0}to{opacity:1}}`,
  '@keyframes wsb-dimIn');

// 3) 控件：图标按钮（不再显示数字），并抬高层级避免遮挡。
run('控件：换成图标按钮',
  /\}, String\(value\)\),/,
  `}, h('svg', {\n`
  + `      viewBox: '0 0 24 24', 'aria-hidden': 'true', className: 'wsb-dimIcon',\n`
  + `    },\n`
  + `      h('circle', { cx: 12, cy: 12, r: 7.2 }),\n`
  + `      h('path', { d: 'M12 4.8a7.2 7.2 0 0 0 0 14.4z' }))),`,
  'wsb-dimIcon');
run('层级：头部抬到面板之上',
  /(\.wsb-dimWrap\{position:relative;display:inline-flex;flex:0 0 auto;order:9;margin-left:8px\})/,
  `.wsb-head,.wsb-nwHead,.wsb-stkHead{position:relative;z-index:6}\n`
  + `.wsb-dimWrap{position:relative;display:inline-flex;flex:0 0 auto;order:9;margin-left:8px}`,
  'z-index:6');
run('样式：图标按钮与弹层',
  /\.wsb-dimBtn\{appearance:none;min-width:34px;height:28px;padding:0 9px;cursor:pointer;font:inherit;\n\s*font-size:11px;font-weight:600;font-variant-numeric:tabular-nums;/,
  `.wsb-dimBtn{appearance:none;width:28px;height:28px;padding:0;cursor:pointer;font:inherit;\n`
  + `  display:grid;place-items:center;`,
  'width:28px;height:28px;padding:0;cursor:pointer');
run('样式：图标描边',
  /(\.wsb-dimBtn:hover\{)/,
  `.wsb-dimIcon{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:1.5;\n`
  + `  stroke-linecap:round;stroke-linejoin:round}\n`
  + `$1`,
  '.wsb-dimIcon');

if (bad > 0) { console.log('\n中止：' + bad + ' 处不符 —— 未写入。'); process.exit(1) }
if (src === original) { console.log('\n无需改动。'); process.exit(0) }
if (!apply) { console.log('\n演练结束：**尚未写入**。加 --apply 应用。'); process.exit(0) }
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
fs.copyFileSync(client, client + '.before-dim4-' + stamp);
fs.writeFileSync(client, src);
try {
  execFileSync(process.execPath, ['--check', client], { stdio: 'pipe' });
  console.log('node --check 通过');
} catch (error) {
  fs.writeFileSync(client, original);
  console.log('回滚：' + String(error.stderr || error).slice(0, 220));
  process.exit(1);
}
const hash = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').slice(0, 16);
fs.copyFileSync(client, pkg);
console.log((hash(client) === hash(pkg) ? 'hash=OK  ' : 'MISMATCH ') + path.basename(pkg));
