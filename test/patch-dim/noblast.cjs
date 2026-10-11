'use strict';
/**
 * 修"模块之间快捷切换会闪一下"：
 *   原因：open() 一律把 phase 设成 'entering' —— 于是从模块 A 切到模块 B 时，
 *   homeAnim 又算出 'fade-out'，桌面（视频）被重新播一遍淡出 → 露出一帧桌面 = 闪动。
 *   修法：改成函数式更新，按"从哪来"决定 phase：
 *     · 从桌面进入模块 → 'entering'（保留原有的入场动画，用户认可的丝滑感）
 *     · 已经在模块里再切模块 → 'idle'（桌面保持被覆盖，两个界面在同一次提交里换掉，不闪）
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
const MARK = '// 从桌面进入模块才走 entering';
if (src.indexOf(MARK) >= 0) { console.log('已完成：该修复已在'); process.exit(0) }
const FROM = /setRoute\(\{\n(\s*)\/\/ Three of the four kinds[\s\S]{0,700}?moduleId, origin, phase: 'entering',\n\s*\}\);/;
const hits = (src.match(new RegExp(FROM.source, 'g')) || []).length;
console.log('锚点命中 ' + hits + ' 处');
if (hits !== 1) { console.log('中止 —— 未写入。'); process.exit(1) }
const TO = `setRoute((previous) => ({
          // Three of the four kinds are windows of their own — the notebook, the news reader and
          // the market board all read something other than a session, so none of them can open
          // as a conversation console. The rest are consoles.
          name: kind === 'notebook' ? 'notes'
            : kind === 'news' ? 'news'
              : kind === 'stock' ? 'stock' : 'console',
          moduleId, origin,
          // 从桌面进入模块才走 entering（保留完整的入场动画）。
          // 已经在模块里再切到另一个模块就直接落到 idle —— 桌面保持被覆盖，
          // 不会把"桌面淡出"重播一遍，所以不会闪一下。
          phase: previous.name === 'home' ? 'entering' : 'idle',
        }));`;
if (!apply) { console.log('演练：将替换为函数式更新（未写入）。加 --apply 应用。'); process.exit(0) }
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
fs.copyFileSync(client, client + '.before-noblast-' + stamp);
src = src.replace(FROM, TO);
fs.writeFileSync(client, src);
try { execFileSync(process.execPath, ['--check', client], { stdio: 'pipe' }); console.log('node --check 通过') }
catch (error) {
  fs.writeFileSync(client, fs.readFileSync(client + '.before-noblast-' + stamp, 'utf8'));
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
