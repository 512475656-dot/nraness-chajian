'use strict';
// 清掉"保证可见版"剩下的两条 !important 残片（它们会与新配方互相覆盖）。
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const ws = path.join(__dirname, '..', '..');
const client = path.join(ws, 'client.js');
const pkg = 'C:\\Users\\Administrator\\.dsh\\profiles\\desktop\\node_modules\\@local\\dsh-workbench\\client.js';
const apply = process.argv.indexOf('--apply') >= 0;
let src = fs.readFileSync(client, 'utf8');
const lines = src.split('\n');
const bad = lines.filter((l) => /rgba\(255,255,255,\.(34|40|20|55)\)/.test(l) || /#ff2d95|#00ff88/.test(l));
console.log('待清行的原文：');
bad.forEach((l) => console.log('  ' + l.trim()));
const kept = lines.filter((l) => !(/rgba\(255,255,255,\.(34|40|20|55)\)/.test(l) || /#ff2d95|#00ff88/.test(l)));
let next = kept.join('\n');
// 顺带把留下空注释头的情况收一下
next = next.replace(/\n\/\* ==== 悬停高亮（保证可见版）====[\s\S]{0,400}?\*\/\n/g, '\n');
console.log('清理行数: ' + (lines.length - kept.length));
if (bad.length === 0) { console.log('无需清理。'); process.exit(0) }
if (!apply) { console.log('演练（未写入）。加 --apply 应用。'); process.exit(0) }
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
fs.copyFileSync(client, client + '.before-clean-' + stamp);
fs.writeFileSync(client, next);
try { execFileSync(process.execPath, ['--check', client], { stdio: 'pipe' }); console.log('node --check 通过') }
catch (error) {
  fs.writeFileSync(client, fs.readFileSync(client + '.before-clean-' + stamp, 'utf8'));
  console.log('回滚：' + String(error.stderr || error).slice(0, 200));
  process.exit(1);
}
const s = next.indexOf('const CSS = `'); const e = next.indexOf('\n`;', s);
const css = next.slice(s, e);
const o = (css.match(/\{/g) || []).length; const c = (css.match(/\}/g) || []).length;
console.log('CSS 括号：{ ' + o + ' } ' + c + ' ' + (o === c ? '✓' : '**不平衡**'));
const hash = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').slice(0, 16);
fs.copyFileSync(client, pkg);
console.log((hash(client) === hash(pkg) ? 'hash=OK  ' : 'MISMATCH ') + path.basename(pkg));
