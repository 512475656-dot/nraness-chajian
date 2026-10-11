'use strict';
// 补上「界面设置」里的背景压暗滑条: 在"卡片形状"那条 FieldSlider 之前插入同级的一条.
// 只此一处, 锚点唯一, 失败即中止; 写前备份, 写后 node --check(失败回滚), 再部署.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const ws = path.join(__dirname, '..', '..');
const client = path.join(ws, 'client.js');
const pkg = 'C:\\Users\\Administrator\\.dsh\\profiles\\desktop\\node_modules\\@local\\dsh-workbench\\client.js';
const apply = process.argv.indexOf('--apply') >= 0;

const ANCHOR = /h\(FieldSlider, \{\s*label: t\.shape, name: 'radius'/;
let src = fs.readFileSync(client, 'utf8');
const hits = src.split(ANCHOR).length - 1;
console.log('锚点命中 ' + hits + ' 处');
if (src.includes("name: 'backdropDim'")) { console.log('已完成：滑条已在'); process.exit(0) }
if (hits !== 1) { console.log('中止：锚点不是 1 处 —— 未写入。'); process.exit(1) }

const INSERT = `h(FieldSlider, {
                label: (t && t.dimLabel) || '背景压暗', name: 'backdropDim',
                value: appearance.dim === undefined ? 0 : appearance.dim, low: 0, high: 100,
                onChange: (value) => onAppearance({ dim: clamp(Math.round(value), 0, 100) }),
              }),
              `;
if (!apply) { console.log('演练：将插入一条 FieldSlider（未写入）。加 --apply 应用。'); process.exit(0) }

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
fs.copyFileSync(client, client + '.before-dimslider-' + stamp);
src = src.replace(ANCHOR, (matched) => INSERT + matched);
fs.writeFileSync(client, src);
try {
  execFileSync(process.execPath, ['--check', client], { stdio: 'pipe' });
  console.log('node --check 通过');
} catch (error) {
  fs.writeFileSync(client, fs.readFileSync(client + '.before-dimslider-' + stamp, 'utf8'));
  console.log('回滚：' + String(error.stderr || error).slice(0, 200));
  process.exit(1);
}
const hash = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').slice(0, 16);
fs.copyFileSync(client, pkg);
console.log((hash(client) === hash(pkg) ? 'hash=OK  ' : 'MISMATCH ') + path.basename(pkg));
