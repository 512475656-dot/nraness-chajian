'use strict';
/**
 * 保住磁贴本身的设计（描边照旧），改让光带够到轮廓线：
 *   1) 撤掉我上一步的 .wsb-card{border-color:transparent}（那是在改磁贴的设计）。
 *   2) .wsb-card{overflow:clip;overflow-clip-margin:1px} —— 裁切区域放宽 1px；
 *      磁贴内容都在中心，视觉零变化，只是允许后代（光带）画到轮廓线。
 *   3) 光带 inset:0 → inset:-1px —— 外缘正好落在磁贴的描边上，缝消失。
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

// 1) 撤掉改描边那一处（连注释一起）
run('撤回：取消改磁贴描边',
  /\n\/\* 消除光带与磁贴轮廓之间的 1px 缝[\s\S]{0,520}?\.wsb-card\{border-color:transparent\}/,
  '');

// 2) 裁切放宽 1px（写在样式表末尾）
run('裁切：放宽 1px（视觉零变化）',
  /(\.wsb-tileAbbr\{position:absolute;left:0;right:0;bottom:24px;text-align:center\})/,
  `$1

/* 光带要够到磁贴的轮廓线：overflow:hidden 把后代裁在 padding box 上，正好差 1px，
   于是大圆角处露出那道"间隙锯齿"。改为 overflow:clip 并把裁切区域放宽 1px ——
   磁贴内容都在中心，视觉零变化；磁贴自己的描边也完全保留。 */
.wsb-card{overflow:clip;overflow-clip-margin:1px}`);

// 3) 光带外扩 1px
run('光带：外扩 1px（外缘压在描边上）',
  /content:"";position:absolute;inset:0;z-index:2;pointer-events:none;padding:2px;border-radius:inherit;/,
  `content:"";position:absolute;inset:-1px;z-index:2;pointer-events:none;padding:2px;border-radius:inherit;`);

if (bad > 0) { console.log('\n中止：' + bad + ' 处不符 —— 未写入。'); process.exit(1) }
if (src === original) { console.log('\n无需改动。'); process.exit(0) }
if (!apply) { console.log('\n演练结束（**尚未写入**）。加 --apply 应用。'); process.exit(0) }
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
fs.copyFileSync(client, client + '.before-keep-' + stamp);
fs.writeFileSync(client, src);
try { execFileSync(process.execPath, ['--check', client], { stdio: 'pipe' }); console.log('node --check 通过') }
catch (error) {
  fs.writeFileSync(client, fs.readFileSync(client + '.before-keep-' + stamp, 'utf8'));
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
