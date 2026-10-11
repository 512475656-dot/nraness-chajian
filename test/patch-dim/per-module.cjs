'use strict';
/**
 * 把「背景压暗」改成**模块自己的**设置（0 = 不变）：
 *   1. 值存在 module.backdrop（每个模块各记一份）。
 *   2. WorkbenchApp 里已有 module / patchModule，所以不需要改任何函数签名。
 *   3. dimStyle 接到根节点（上次漏了这一步，效果其实没生效）；--wsb-dim 由当前模块决定，
 *      并在根节点上给 data-dim —— 0 时 CSS 直接 backdrop-filter:none，零开销。
 *   4. 控件移进模块头部：每个模块屏的返回按钮旁边一个小胶囊按钮，点开是滑条。
 *   5. 删掉「界面设置」面板里那条（位置不对）。
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

// 1) 值改由当前模块决定 + 接到根节点。
run('值：改由当前模块决定',
  /const dimStyle = \{ '--wsb-dim': String\(clamp\(appearance\.dim \|\| 0, 0, 100\)\) \};/,
  `const dimBackdrop = clamp(Math.round(Number(module && module.backdrop) || 0), 0, 100);\n`
  + `      // 模块界面最底层的那层压暗毛玻璃：0 = 不变（此时 data-dim=false，直接不合成）。\n`
  + `      const dimStyle = { '--wsb-dim': String(dimBackdrop) };`,
  'const dimBackdrop');
run('接线：根节点应用 dimStyle',
  /(\n\s*\.\.\.glassAlphaStyle,)/,
  (m) => `${m}\n              ...dimStyle,`,
  '...dimStyle,');
run('接线：根节点 data-dim',
  /('data-palette': appearance\.palette,)/,
  (m) => `${m}\n              'data-dim': dimBackdrop > 0 ? 'true' : 'false',`,
  "'data-dim': dimBackdrop");

// 2) 组件（放在模块头部里）。
run('组件：ModuleBackdrop',
  /(\n)(\s*)function ConsoleView\(/,
  (m, nl, indent) => `${nl}${indent}// 模块界面最底层那层压暗毛玻璃的控件：一个小胶囊 + 点开的滑条（0 = 不变）。\n`
    + `${indent}function ModuleBackdrop({ t, module, onPatch }) {\n`
    + `${indent}  const [open, setOpen] = useState(false);\n`
    + `${indent}  const value = clamp(Math.round(Number(module && module.backdrop) || 0), 0, 100);\n`
    + `${indent}  return h('span', { className: 'wsb-dimWrap' },\n`
    + `${indent}    h('button', {\n`
    + `${indent}      type: 'button', className: 'wsb-dimBtn', 'data-dim-btn': '1',\n`
    + `${indent}      title: (t && t.dimLabel) || '背景压暗', 'aria-expanded': open ? 'true' : 'false',\n`
    + `${indent}      onClick: (event) => { event.stopPropagation(); setOpen((v) => !v) },\n`
    + `${indent}    }, String(value)),\n`
    + `${indent}    open\n`
    + `${indent}      ? h('div', {\n`
    + `${indent}        className: 'wsb-dimPop', 'data-dim-pop': '1',\n`
    + `${indent}        onClick: (event) => event.stopPropagation(),\n`
    + `${indent}      },\n`
    + `${indent}        h(FieldSlider, {\n`
    + `${indent}          label: (t && t.dimLabel) || '背景压暗', name: 'backdropDim',\n`
    + `${indent}          value, low: 0, high: 100,\n`
    + `${indent}          onChange: (next) => onPatch({ backdrop: clamp(Math.round(next), 0, 100) }),\n`
    + `${indent}        }),\n`
    + `${indent}        h('div', { className: 'wsb-dimHint' }, (t && t.dimHint) || '数值越高，模块内背景越模糊、越暗'))\n`
    + `${indent}      : null);\n`
    + `${indent}}\n`
    + m,
  'function ModuleBackdrop');

// 3) 头部插入：放在返回按钮**元素之后**（那才是子元素的位置）。
//    控制台/笔记用的是多行写法, 新闻/股市是单行写法 —— 一条容忍两者的正则命中全部四处。
run('头部：四个模块屏各插一次',
  /(\n[ \t]*)(\}, h\('svg', \{ viewBox: '0 0 24 24', 'aria-hidden': 'true' \},?[\s\S]{0,90}?h\('path', \{ d: 'M14\.5 6 8\.5 12l6 6' \}\)\)\),)/g,
  (m, lead, tail) => `${lead}${tail}${lead}h(ModuleBackdrop, { t, module, onPatch: patchModule }),`,
  'h(ModuleBackdrop, { t, module', 4);

// 4) 删掉界面设置里那条（位置不对）。
run('删除：面板里的那条滑条',
  /\s*h\(FieldSlider, \{\n\s*label: \(t && t\.dimLabel\) \|\| '背景压暗', name: 'backdropDim',\n\s*value: appearance\.dim === undefined \? 0 : appearance\.dim, low: 0, high: 100,\n\s*onChange: \(value\) => onAppearance\(\{ dim: clamp\(Math\.round\(value\), 0, 100\) \}\),\n\s*\}\),/,
  '', null);

// 5) 控件样式（插在背景层那条规则之后）。
run('样式：控件的胶囊与弹层',
  /(\.wsb-screen:not\(\[data-role="home"\]\)>\.wsb-root\{position:relative;z-index:1\})/,
  (m) => `${m}\n`
    + `.wsb-dimWrap{position:relative;display:inline-flex;flex:0 0 auto}\n`
    + `.wsb-dimBtn{appearance:none;min-width:34px;height:28px;padding:0 9px;cursor:pointer;font:inherit;\n`
    + `  font-size:11px;font-weight:600;font-variant-numeric:tabular-nums;\n`
    + `  border-radius:9px;color:var(--dsw-alias-label-secondary);\n`
    + `  border:1px solid color-mix(in srgb,var(--dsw-alias-label-primary) 12%,transparent);\n`
    + `  background:color-mix(in srgb,var(--dsw-alias-bg-layer-2) 50%,transparent);\n`
    + `  transition:color .18s ease,background .18s ease}\n`
    + `.wsb-dimBtn:hover{color:var(--dsw-alias-label-primary);\n`
    + `  background:color-mix(in srgb,var(--dsw-alias-bg-layer-2) 78%,transparent)}\n`
    + `.wsb-dimPop{position:absolute;left:0;top:calc(100% + 8px);z-index:9;width:238px;padding:12px 13px;\n`
    + `  border-radius:14px;border:1px solid color-mix(in srgb,var(--dsw-alias-label-primary) 12%,transparent);\n`
    + `  background:color-mix(in srgb,var(--dsw-alias-bg-overlay) 76%,transparent);\n`
    + `  -webkit-backdrop-filter:blur(26px) saturate(180%);backdrop-filter:blur(26px) saturate(180%);\n`
    + `  box-shadow:0 22px 44px -20px rgba(0,0,0,.6);animation:wsb-nwIn .2s cubic-bezier(.22,.9,.24,1) both}\n`
    + `.wsb-dimHint{margin-top:6px;font-size:11px;line-height:1.5;color:var(--dsw-alias-label-secondary)}\n`
    + `@media (prefers-reduced-motion:reduce){.wsb-dimPop{animation:none}.wsb-dimBtn{transition:none}}`,
  '.wsb-dimBtn');

if (bad > 0) { console.log('\n中止：' + bad + ' 处不符 —— 未写入。'); process.exit(1) }
if (src === original) { console.log('\n无需改动。'); process.exit(0) }
if (!apply) { console.log('\n演练结束：**尚未写入**。加 --apply 应用。'); process.exit(0) }

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
fs.copyFileSync(client, client + '.before-dim2-' + stamp);
fs.writeFileSync(client, src);
console.log('\n备份：client.before-dim2-' + stamp + '.js');
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
