'use strict';
/**
 * 统一入场动画的"调度"：
 *   A. 新闻的返回按钮自己带了 wsb-anim + 内联 --wsb-i —— 那是项目那套（依赖每个屏各自的
 *      data-sweep）在单独动它，所以只有它一位看着不一样。去掉，让它走统一那条。
 *   B. 把统一规则改成按"控件种类"匹配（后代选择器 + :nth-of-type 给顺序），
 *      不再依赖具体嵌套层级 —— 四个模块里任何位置的按钮/标题/控件组都拿到同一条动画，
 *      一处控制、不可能漏。
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

// A) 新闻按钮：去掉自带的类与内联序号
run('新闻返回按钮：去掉自带的 wsb-anim 调度',
  /type: 'button', className: 'wsb-backBtn wsb-anim', 'data-news-back': '1',\n\s*style: \{ '--wsb-i': '0' \}, title: t\.panel, onClick: onBack,/,
  `type: 'button', className: 'wsb-backBtn', 'data-news-back': '1',\n          title: t.panel, 'aria-label': t.panel, onClick: onBack,`);

// B) 统一规则：改成按控件种类匹配（不依赖嵌套层级）
const typeDelays = Array.from({ length: 8 }, (_, i) => `  .wsb-screen:not([data-role="home"]) :is(.wsb-head,.wsb-nwHead,.wsb-stkHead,.wsb-noteTop) button:nth-of-type(${i + 1}){--wsb-i:${i}}`).join('\n');
run('入场动画：改为按控件匹配（不可能漏）',
  /\/\* ==== 模块头部的入场动画（一处控制四个模块）====[\s\S]{0,2600}?:nth-child\(10\)\{--wsb-i:9\}/,
  `/* ==== 模块头部的入场动画（一处控制四个模块）====
   最早的写法依赖"头部元素 → 直接子元素"，一旦某一屏内部多包了一层就会漏掉（新闻就因此
   显得和别人不一样）。这里改为按控件种类匹配：只要在模块头部范围内，任何深度的按钮、
   标题、控件组都拿到同一条动画；顺序用 :nth-of-type 给（同一父元素内依次错峰）。
   于是四个模块共用一套调度，不存在"某一个会跳、别的不会"。 */
.wsb-screen:not([data-role="home"]) :is(.wsb-head,.wsb-nwHead,.wsb-stkHead,.wsb-noteTop) :is(button,.wsb-title,.wsb-nwTitle,.wsb-stkTitle,.wsb-noteGroup,.wsb-noteTopSpacer){
  animation:wsb-piano .46s cubic-bezier(.16,.84,.24,1) both;
  animation-delay:calc(var(--wsb-i,0) * 28ms)}
${typeDelays}`);

if (bad > 0) { console.log('\n中止：' + bad + ' 处不符 —— 未写入。'); process.exit(1) }
if (src === original) { console.log('\n无需改动。'); process.exit(0) }
if (!apply) { console.log('\n演练结束（**尚未写入**）。加 --apply 应用。'); process.exit(0) }
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
fs.copyFileSync(client, client + '.before-sched-' + stamp);
fs.writeFileSync(client, src);
try { execFileSync(process.execPath, ['--check', client], { stdio: 'pipe' }); console.log('node --check 通过') }
catch (error) {
  fs.writeFileSync(client, fs.readFileSync(client + '.before-sched-' + stamp, 'utf8'));
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
