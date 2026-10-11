'use strict';
/**
 * 在模块头部加一个「重载」按钮：单击 = location.reload()。
 * 目的：键盘快捷键在这台机器上不可靠（多次"没刷新"），给一个明确的点击入口。
 * 同时把"页面加载时刻"徽标保留在旁边，点击后时间变了就证明刷新成功。
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
const MARK = "'data-wb-reload': '1'";
if (src.indexOf(MARK) >= 0) { console.log('已完成：重载按钮已在'); process.exit(0) }
const anchor = /(\n\s*'data-wb-loaded': '1',\n\s*\}, '加载 ' \+ WB_LOADED_AT\.toTimeString\(\)\.slice\(0, 8\)\),)/;
const hits = (src.match(new RegExp(anchor.source, 'g')) || []).length;
console.log('锚点命中 ' + hits + ' 处');
if (hits !== 1) { console.log('中止 —— 未写入。'); process.exit(1) }

const BLOCK = `$1
              h('button', {
                type: 'button', ${MARK},
                title: '重新加载页面（等于 Ctrl+R）',
                style: {
                  marginLeft: '6px', padding: '2px 9px', borderRadius: '999px', cursor: 'pointer',
                  border: '1px solid rgba(255,255,255,.45)', background: 'rgba(255,255,255,.2)',
                  color: '#fff', fontSize: '11px', fontWeight: '600',
                },
                onClick: () => { if (typeof location !== 'undefined') location.reload() },
              }, '⟳ 重载'),`;

if (!apply) { console.log('演练：将插入重载按钮（未写入）。加 --apply 应用。'); process.exit(0) }
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
fs.copyFileSync(client, client + '.before-reloadbtn-' + stamp);
src = src.replace(anchor, BLOCK);
fs.writeFileSync(client, src);
try { execFileSync(process.execPath, ['--check', client], { stdio: 'pipe' }); console.log('node --check 通过') }
catch (error) {
  fs.writeFileSync(client, fs.readFileSync(client + '.before-reloadbtn-' + stamp, 'utf8'));
  console.log('回滚：' + String(error.stderr || error).slice(0, 240));
  process.exit(1);
}
const hash = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').slice(0, 16);
fs.copyFileSync(client, pkg);
console.log((hash(client) === hash(pkg) ? 'hash=OK  ' : 'MISMATCH ') + path.basename(pkg));
