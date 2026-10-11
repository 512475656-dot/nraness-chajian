'use strict';
/**
 * 修四件事：
 *   1. 滑条失效 —— patchModule 的签名是 (id, mutate)，之前按单参数调用，值从未写入。
 *   2. 默认 50%（组件读值与根节点发布值都改）。
 *   3. 控件放到右侧、风格与其它按钮一致（加 .wsb-btn + order 推到最右）。
 *   4. 切换界面时"黑一下" —— 入场动画期间禁用这一层的 backdrop-filter（沿用项目原有的做法）。
 *   另：去掉每屏重复出现的第二个英文缩写胶囊（可见的重复 bug）。
 * 演练默认；--apply 才写；唯一锚点；命中数不符即中止；写前备份、写后 node --check（失败回滚）。
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

// 1) 滑条真正写入（patchModule(id, mutate)）。
run('修：滑条写入 patchModule(id, mutate)',
  /onChange: \(next\) => onPatch\(\{ backdrop: clamp\(Math\.round\(next\), 0, 100\) \}\),/,
  `onChange: (next) => {\n`
  + `            const nextDim = clamp(Math.round(next), 0, 100);\n`
  + `            onPatch(module.id, (item) => { item.backdrop = nextDim });\n`
  + `          },`,
  'onPatch(module.id, (item) => { item.backdrop');

// 2) 默认 50%（组件读值）。
run('默认：控件读值 50%',
  /const value = clamp\(Math\.round\(Number\(module && module\.backdrop\) \|\| 0\), 0, 100\);/,
  `const rawDim = module && module.backdrop;\n`
  + `  const value = clamp(Math.round(rawDim === undefined || rawDim === null ? 50 : Number(rawDim)), 0, 100);`,
  'rawDim === undefined');

// 3) 默认 50%（根节点发布值）。
run('默认：发布值 50%',
  /const dimBackdrop = clamp\(Math\.round\(Number\(module && module\.backdrop\) \|\| 0\), 0, 100\);/,
  `const dimRaw = module && module.backdrop;\n`
  + `      const dimBackdrop = clamp(Math.round(dimRaw === undefined || dimRaw === null ? 50 : Number(dimRaw)), 0, 100);`,
  'dimRaw === undefined');

// 4) 去掉重复的第二个缩写胶囊（每个屏里成对出现）。
run('去重：重复的英文缩写胶囊',
  /(h\('em', \{ className: 'wsb-titleAbbr' \}, MODULE_ABBR\[module\.kind\] \|\| ''\),)(\s*\n\s*)(h\('em', \{ className: 'wsb-titleAbbr' \}, MODULE_ABBR\[module\.kind\] \|\| ''\),)/g,
  (m, first) => first,
  null, 2);

// 5) 风格与位置：加 .wsb-btn（与其它头部按钮同一套），并推到最右。
run('风格：控件加 .wsb-btn',
  /className: 'wsb-dimBtn', 'data-dim-btn': '1',/,
  `className: 'wsb-btn wsb-dimBtn', 'data-dim-btn': '1',`,
  "className: 'wsb-btn wsb-dimBtn'");
run('位置：推到最右（order）',
  /\.wsb-dimWrap\{position:relative;display:inline-flex;flex:0 0 auto\}/,
  `.wsb-dimWrap{position:relative;display:inline-flex;flex:0 0 auto;order:9;margin-left:8px}`,
  'order:9');

// 6) 切换界面不再"黑一下"：入场动画期间禁用这一层的滤镜（沿用 .wsb-glass 的做法）。
run('切换：动画期禁用这一层的滤镜',
  /\.wsb-screen\[data-anim\] \.wsb-glass\{backdrop-filter:none;-webkit-backdrop-filter:none;/,
  `.wsb-screen[data-anim] .wsb-glass,.wsb-screen[data-anim]:not([data-role="home"])::before{backdrop-filter:none;-webkit-backdrop-filter:none;`,
  'data-anim]:not([data-role="home"])::before');

if (bad > 0) { console.log('\n中止：' + bad + ' 处不符 —— 未写入。'); process.exit(1) }
if (src === original) { console.log('\n无需改动。'); process.exit(0) }
if (!apply) { console.log('\n演练结束：**尚未写入**。加 --apply 应用。'); process.exit(0) }

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
fs.copyFileSync(client, client + '.before-dim3-' + stamp);
fs.writeFileSync(client, src);
console.log('\n备份：client.before-dim3-' + stamp + '.js');
try {
  execFileSync(process.execPath, ['--check', client], { stdio: 'pipe' });
  console.log('node --check: 通过 · ' + original.length + ' → ' + src.length + ' B');
} catch (error) {
  fs.writeFileSync(client, original);
  console.log('node --check 失败，已回滚：' + String(error.stderr || error).slice(0, 300));
  process.exit(1);
}
const hash = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').slice(0, 16);
fs.copyFileSync(client, pkg);
console.log((hash(client) === hash(pkg) ? 'hash=OK  ' : 'MISMATCH ') + path.basename(pkg));
