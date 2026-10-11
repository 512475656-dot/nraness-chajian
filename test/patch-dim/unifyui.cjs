'use strict';
/**
 * 统一模块界面的"返回按钮"与"入场动画"，做成一处控制：
 *   A. 返回按钮：笔记屏原本是 'wsb-btn' + 文字「‹ 工作台」，其余三屏是 wsb-backBtn + SVG chevron。
 *      把笔记那处换成与其余三处完全相同的写法 → 四个模块统一。
 *   B. 入场动画：四处屏幕头部里的控件统一走项目自己的 wsb-piano（同一节奏、同一曲线），
 *      顺序用 nth-child 给（不必每个屏各自标 --wsb-i）—— 一个 CSS 块管住四个模块。
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

// A) 笔记的返回按钮 → 与其余三屏一致
run('返回按钮：笔记改为与其余三屏相同的写法',
  /h\('button', \{ type: 'button', className: 'wsb-btn', onClick: onBack, title: t\.panel \}, '‹ ' \+ t\.panel\)/,
  `h('button', {
                type: 'button', className: 'wsb-backBtn', 'data-note-back': '1',
                title: t.panel, 'aria-label': t.panel, onClick: onBack,
              }, h('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' }, h('path', { d: 'M14.5 6 8.5 12l6 6' })))`);

// B) 入场动画：一个 CSS 块管住四个模块
const delays = Array.from({ length: 10 }, (_, i) => `  .wsb-screen:not([data-role="home"]) :is(.wsb-head,.wsb-nwHead,.wsb-stkHead,.wsb-noteTop)>:nth-child(${i + 1}){--wsb-i:${i}}`).join('\n');
run('入场动画：四个模块头部统一（一处控制）',
  /(\.wsb-tileAbbr\{position:absolute;left:0;right:0;bottom:24px;text-align:center\})/,
  `$1

/* ==== 模块头部的入场动画（一处控制四个模块）====
   项目自己的节奏是 [data-sweep="go"] .wsb-anim{animation:wsb-piano …}，但只有新闻那几个控件
   带了 wsb-anim，所以看起来"有的有、有的没有"。这里直接用同一个 wsb-piano，
   顺序由 nth-child 给出（省掉每个屏各自标 --wsb-i），于是四个模块完全一致。 */
.wsb-screen:not([data-role="home"]) :is(.wsb-head,.wsb-nwHead,.wsb-stkHead,.wsb-noteTop)>*{
  animation:wsb-piano .46s cubic-bezier(.16,.84,.24,1) both;
  animation-delay:calc(var(--wsb-i,0) * 28ms)}
${delays}`);

if (bad > 0) { console.log('\n中止：' + bad + ' 处不符 —— 未写入。'); process.exit(1) }
if (src === original) { console.log('\n无需改动。'); process.exit(0) }
if (!apply) { console.log('\n演练结束（**尚未写入**）。加 --apply 应用。'); process.exit(0) }
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
fs.copyFileSync(client, client + '.before-unifyui-' + stamp);
fs.writeFileSync(client, src);
try { execFileSync(process.execPath, ['--check', client], { stdio: 'pipe' }); console.log('node --check 通过') }
catch (error) {
  fs.writeFileSync(client, fs.readFileSync(client + '.before-unifyui-' + stamp, 'utf8'));
  console.log('回滚：' + String(error.stderr || error).slice(0, 220));
  process.exit(1);
}
const s = src.indexOf('const CSS = `'); const e = src.indexOf('\n`;', s);
const css = src.slice(s, e);
const o = (css.match(/\{/g) || []).length; const c = (css.match(/\}/g) || []).length;
console.log('CSS 括号：{ ' + o + ' } ' + c + ' ' + (o === c ? '✓' : '**不平衡**'));
const hash = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').slice(0, 16);
fs.copyFileSync(client, pkg);
console.log((hash(client) === hash(pkg) ? 'hash=OK  ' : 'MISMATCH ') + path.basename(pkg));
