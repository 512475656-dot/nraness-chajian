'use strict';
/**
 * 收尾一：撤掉全部诊断显示（红框内容）+ 把重载按钮移到工作台视图里。
 *   撤掉：显示项 ✓ 标记、LOGO 闪光/提示条、WB_LOADED_AT、A/B 计数徽标与两个状态。
 *   保留：拖动实现本身（v5）与 ⟳ 重载 按钮（换个位置）。
 * 说明：绿箭头在主聊天区，那是宿主界面，插件无法绘制 —— 所以放在工作台视图自己的头部。
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
const cut = (label, re) => {
  const hits = (src.match(new RegExp(re.source, 'g')) || []).length;
  if (hits !== 1) { console.log('BAD   ' + label + '  [命中 ' + hits + ']'); bad += 1; return }
  src = src.replace(new RegExp(re.source, 'g'), '');
  console.log('ok    撤掉 ' + label);
};

cut('LOGO 闪光 + 提示条 + 加载时刻', /\n\s*\/\/ 临时诊断：这一行在"插件客户端代码被加载"的那一刻执行[\s\S]{0,2400}?try \{ window\.setTimeout\(wbFlashOnLoad, 350\) \} catch \(error\) \{ \/\* 忽略 \*\/ \}/);
cut('A/B 计数徽标', /\n\s*h\('span', \{\n\s*style: \{[\s\S]{0,300}?'data-pane-hit': '1',\n\s*\}, 'A:' \+ paneHitA \+ ' B:' \+ paneHitB\),/);
cut('加载徽标', /\n\s*h\('span', \{\n\s*style: \{[\s\S]{0,300}?'data-wb-loaded': '1',\n\s*\}, '加载 ' \+ WB_LOADED_AT\.toTimeString\(\)\.slice\(0, 8\)\),/);
cut('重载按钮（旧位置）', /\n\s*h\('button', \{\n\s*type: 'button', 'data-wb-reload': '1',[\s\S]{0,600}?\}, '⟳ 重载'\),/);
cut('A/B 状态', /\n\s*\/\/ 临时诊断：在标题栏上按下时 \+1[\s\S]{0,300}?const \[paneHitB, setPaneHitB\] = useState\(0\);/);
cut('A 计数语句', /\n\s*setPaneHitA\(\(value\) => value \+ 1\);/);
cut('B 计数语句', /\n\s*setPaneHitB\(\(value\) => value \+ 1\);/);
cut('显示项 ✓ 标记', /显示项 ✓/);

// 把重载按钮放进工作台视图（换到 home 面板头部）
const dockAnchor = /(h\('h1', null, t\.panel\),)/;
const hits2 = (src.match(new RegExp(dockAnchor.source, 'g')) || []).length;
console.log('工作台头部锚点命中 ' + hits2 + ' 处');
if (hits2 !== 1) { console.log('BAD   找不到工作台头部锚点'); bad += 1 } else {
  src = src.replace(dockAnchor, `$1
              h('button', {
                type: 'button', 'data-wb-reload': '1', title: '重新加载页面（等于 Ctrl+R）',
                style: {
                  marginLeft: '10px', padding: '3px 10px', borderRadius: '999px', cursor: 'pointer',
                  border: '1px solid rgba(255,255,255,.35)', background: 'rgba(255,255,255,.14)',
                  color: 'inherit', fontSize: '11px', fontWeight: '600',
                },
                onClick: () => { if (typeof location !== 'undefined') location.reload() },
              }, '⟳ 重载'),`);
  console.log('ok    重载按钮放到工作台头部');
}

if (bad > 0) { console.log('\n中止：' + bad + ' 处 —— 未写入。'); process.exit(1) }
if (src === original) { console.log('无需改动。'); process.exit(0) }
if (!apply) { console.log('演练结束（未写入）。加 --apply 应用。'); process.exit(0) }
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
fs.copyFileSync(client, client + '.before-cleanup2-' + stamp);
fs.writeFileSync(client, src);
try { execFileSync(process.execPath, ['--check', client], { stdio: 'pipe' }); console.log('node --check 通过') }
catch (error) {
  fs.writeFileSync(client, fs.readFileSync(client + '.before-cleanup2-' + stamp, 'utf8'));
  console.log('回滚：' + String(error.stderr || error).slice(0, 240));
  process.exit(1);
}
const s = src.indexOf('const CSS = `'); const e = src.indexOf('\n`;', s);
const css = src.slice(s, e);
const o = (css.match(/\{/g) || []).length; const c = (css.match(/\}/g) || []).length;
console.log('CSS 括号：{ ' + o + ' } ' + c + ' ' + (o === c ? '✓' : '**不平衡**'));
const hash = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').slice(0, 16);
fs.copyFileSync(client, pkg);
console.log((hash(client) === hash(pkg) ? 'hash=OK  ' : 'MISMATCH ') + path.basename(pkg));
