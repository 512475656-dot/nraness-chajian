'use strict';
/**
 * 悬停高亮加强版：背景白 26%→42%、边框 30%→48%、上沿内高光 18%→28%、
 * brightness 1.1→1.16；选中态强调色 44%→58%；并加一个 1.04 的轻微放大（最直观）。
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
const lit = (label, from, to) => {
  const hits = src.split(from).length - 1;
  if (hits !== 1) { console.log('BAD   ' + label + '  [命中 ' + hits + ']'); bad += 1; return }
  src = src.split(from).join(to);
  console.log('ok    ' + label);
};

lit('背景层更亮（26% → 42%）',
  'background-color:color-mix(in srgb,var(--dsw-alias-bg-layer-2),#fff 26%);',
  'background-color:color-mix(in srgb,var(--dsw-alias-bg-layer-2),#fff 42%);');
lit('边框更亮（30% → 48%）',
  'border-color:color-mix(in srgb,var(--dsw-alias-label-primary) 30%,transparent);',
  'border-color:color-mix(in srgb,var(--dsw-alias-label-primary) 48%,transparent);');
lit('上沿内高光更亮（18% → 28%）',
  'box-shadow:0 8px 22px rgba(0,0,0,.28),inset 0 1px 0 color-mix(in srgb,#fff 18%,transparent)}',
  'box-shadow:0 10px 26px rgba(0,0,0,.32),inset 0 1px 0 color-mix(in srgb,#fff 28%,transparent)}');
lit('整体再亮一点（1.1 → 1.16）+ 轻微放大',
  `  filter:brightness(1.1);`,
  `  filter:brightness(1.16);
  transform:translateY(-1px) scale(1.04);`);
lit('选中态更亮（44% → 58%）',
  'background-color:color-mix(in srgb,var(--wsb-c1) 44%,transparent);',
  'background-color:color-mix(in srgb,var(--wsb-c1) 58%,transparent);');
lit('选中态边框（60% → 72%）',
  'border-color:color-mix(in srgb,var(--wsb-c1) 60%,transparent);',
  'border-color:color-mix(in srgb,var(--wsb-c1) 72%,transparent);');

if (bad > 0) { console.log('\n中止：' + bad + ' 处 —— 未写入。'); process.exit(1) }
if (src === original) { console.log('无需改动。'); process.exit(0) }
if (!apply) { console.log('演练结束（未写入）。加 --apply 应用。'); process.exit(0) }
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
fs.copyFileSync(client, client + '.before-hover3-' + stamp);
fs.writeFileSync(client, src);
try { execFileSync(process.execPath, ['--check', client], { stdio: 'pipe' }); console.log('node --check 通过') }
catch (error) {
  fs.writeFileSync(client, fs.readFileSync(client + '.before-hover3-' + stamp, 'utf8'));
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
