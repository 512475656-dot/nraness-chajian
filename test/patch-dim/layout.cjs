'use strict';
/**
 * 控制台头部版面调整：
 *   ① 去掉标题旁的副标题信息（游戏开发 · 控制台 · 轮次 · 工具调用）—— 红框内容。
 *   ② 给会话下拉框加 marginLeft:auto —— 它与其后所有控件（绿框整排）自动右移到箭头处。
 * 用内联样式实现，不依赖样式表（改动即时可见，无需等 CSS 通道）。
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

// ① 删掉副标题
run('删掉副标题（红框内容）',
  /\n\s*h\('span', null, kindLabel \+ ' · ' \+ t\.consoleTitle \+ ' · ' \+ \(data\.model\.summary\.turns \+ ' ' \+ t\.kTurns \+ ' · ' \+ data\.model\.summary\.calls \+ ' ' \+ t\.kCalls\)\)\)/,
  ')');

// ② 下拉框加 marginLeft:auto（其后整排右移）
run('下拉框改为右对齐起点',
  /h\('select', \{\n(\s*)className: 'wsb-select', value: sessionId \|\| '', onChange: \(event\) => onPickSession\(event\.target\.value\),\n\s*title: rows\.length \? '' : t\.noSession,\n\s*\},/,
  `h('select', {
              className: 'wsb-select', value: sessionId || '', onChange: (event) => onPickSession(event.target.value),
              title: rows.length ? '' : t.noSession,
              // 整排控件右对齐：从这里开始（含本控件）之后的兄弟元素一起被推到右侧。
              style: { marginLeft: 'auto' },
            },`);

if (bad > 0) { console.log('\n中止：' + bad + ' 处不符 —— 未写入。'); process.exit(1) }
if (src === original) { console.log('\n无需改动。'); process.exit(0) }
if (!apply) { console.log('\n演练结束（**尚未写入**）。加 --apply 应用。'); process.exit(0) }
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
fs.copyFileSync(client, client + '.before-layout-' + stamp);
fs.writeFileSync(client, src);
try { execFileSync(process.execPath, ['--check', client], { stdio: 'pipe' }); console.log('node --check 通过') }
catch (error) {
  fs.writeFileSync(client, fs.readFileSync(client + '.before-layout-' + stamp, 'utf8'));
  console.log('回滚：' + String(error.stderr || error).slice(0, 240));
  process.exit(1);
}
const hash = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').slice(0, 16);
fs.copyFileSync(client, pkg);
console.log((hash(client) === hash(pkg) ? 'hash=OK  ' : 'MISMATCH ') + path.basename(pkg));
