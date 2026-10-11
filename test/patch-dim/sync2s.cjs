'use strict';
/**
 * 1. 调整按钮放到"后面"：内联展开时它会换到第二行并从左开始，改成 margin-left:auto → 始终贴右端。
 * 2. 调整后同步到所有模块：patchModule 的 mutate 第二参数就是整个 state，一次写入即可全部同步。
 *    （于是任意模块里调，所有模块界面看到的都是同一个值 —— 而且没有新增任何 props。）
 * 3. 压暗过程 ≈2 秒，前慢后快（非线性、更自然无感）。
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
const run = (label, re, replacement, doneMarker) => {
  if (doneMarker && src.includes(doneMarker)) { console.log('已完成 ' + label); return }
  const hits = (src.match(new RegExp(re.source, 'g')) || []).length;
  if (hits !== 1) { console.log('BAD   ' + label + '  [命中 ' + hits + ']'); bad += 1; return }
  src = src.replace(re, replacement);
  console.log('ok    ' + label);
};

run('位置：始终贴右端',
  /\.wsb-dimWrap\{position:relative;display:inline-flex;flex:0 0 auto;order:9;margin-left:8px\}/,
  `.wsb-dimWrap{position:relative;display:inline-flex;flex:0 0 auto;order:9;margin-left:auto}`,
  'order:9;margin-left:auto');

run('同步：写入所有模块',
  /onPatch\(module\.id, \(item\) => \{ item\.backdrop = nextDim \}\);/,
  `// 第二个参数就是整个 state —— 于是"调一次，所有模块同步"。\n`
  + `            onPatch(module.id, (item, next) => {\n`
  + `              (next.modules || []).forEach((each) => { each.backdrop = nextDim });\n`
  + `            });`,
  '(next.modules || []).forEach');

run('节奏：2 秒，前慢后快',
  /opacity:0;animation:wsb-dimIn \.8s cubic-bezier\(\.33,0,\.2,1\) forwards;/,
  `opacity:0;animation:wsb-dimIn 2s cubic-bezier(.6,.02,.9,.5) forwards;`,
  'animation:wsb-dimIn 2s');

if (bad > 0) { console.log('\n中止：' + bad + ' 处不符 —— 未写入。'); process.exit(1) }
if (src === original) { console.log('\n无需改动。'); process.exit(0) }
if (!apply) { console.log('\n演练结束：**尚未写入**。加 --apply 应用。'); process.exit(0) }
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
fs.copyFileSync(client, client + '.before-dim6-' + stamp);
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
