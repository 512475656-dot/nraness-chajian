'use strict';
/**
 * 修"工作台默认就模糊了"：
 *   压暗层现在挂在 .wsb-stack::after（会盖住整个 stack，含首页）。而 dimBackdrop 在"没有模块"
 *   （module 为 null）时也走默认 50 → 于是首页也被压暗模糊。
 * 正解：没有打开模块时值为 0 → data-dim="false" → 那一层直接 backdrop-filter:none，首页干净。
 * （打开模块后，多出来的 50 是"模块默认值"，仍然生效。）
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
const FROM = `const dimBackdrop = clamp(Math.round(dimRaw === undefined || dimRaw === null ? 50 : Number(dimRaw)), 0, 100);`;
const TO = `// 没有打开任何模块（home）时必须是 0 —— 否则那一层会把工作台自己也压暗模糊掉。\n`
  + `      const dimBackdrop = module\n`
  + `        ? clamp(Math.round(dimRaw === undefined || dimRaw === null ? 50 : Number(dimRaw)), 0, 100)\n`
  + `        : 0;`;
const hits = src.split(FROM).length - 1;
console.log('锚点命中 ' + hits + ' 处');
if (hits !== 1) { console.log('中止 —— 未写入。'); process.exit(1) }
if (!apply) { console.log('演练：将把 home 的值设为 0（未写入）。加 --apply 应用。'); process.exit(0) }
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
fs.copyFileSync(client, client + '.before-homedim-' + stamp);
src = src.replace(FROM, TO);
fs.writeFileSync(client, src);
try {
  execFileSync(process.execPath, ['--check', client], { stdio: 'pipe' });
  console.log('node --check 通过');
} catch (error) {
  fs.writeFileSync(client, fs.readFileSync(client + '.before-homedim-' + stamp, 'utf8'));
  console.log('回滚：' + String(error.stderr || error).slice(0, 200));
  process.exit(1);
}
const hash = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').slice(0, 16);
fs.copyFileSync(client, pkg);
console.log((hash(client) === hash(pkg) ? 'hash=OK  ' : 'MISMATCH ') + path.basename(pkg));
