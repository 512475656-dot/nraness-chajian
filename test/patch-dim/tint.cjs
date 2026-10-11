'use strict';
/**
 * 真·"跟着视频主色调"的窗口配色：
 *   1. 视频元素挂载时起一个低频采样（每 1.2s 一次，缩到 24×14 画布求平均色），
 *      把结果写成根上的 --wsb-bg-tint（形如 "128 148 168"，供 rgb() 直接使用）。
 *      采样在 ref 回调里起/停 —— 不需要新的 hook，卸载时清掉。
 *   2. 所有玻璃表面（.wsb-glass，也就是四个模块窗口 + 桌面磁贴）都掺入这个色调。
 *      规则单独写、放在项目原有 .wsb-glass 之后 —— 不改动他们那一行。
 * 说明：颜色来自"画面本身"，所以换视频/换画面颜色就会跟着变；不是硬编码的调色板。
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
  const isRe = re instanceof RegExp;
  const hits = isRe ? (src.match(new RegExp(re.source, 'g')) || []).length : src.split(re).length - 1;
  if (hits !== want) { console.log('BAD   ' + label + '  [命中 ' + hits + '，预期 ' + want + ']'); bad += 1; return }
  src = isRe ? src.replace(new RegExp(re.source, 'g'), to) : src.split(re).join(to);
  console.log('ok    ' + label);
};

run('采样器：新增两个 ref',
  /const videoRef = useRef\([^)]*\);/,
  (m) => `${m}\n      // 主色调采样用的计时器与小画布（低频，几乎不耗）。\n      const tintTimer = useRef(null);\n      const tintCanvas = useRef(null);`);

run('采样器：视频挂载时起、卸载时停',
  /videoRef\.current = node \|\| null;/,
  `videoRef.current = node || null;
                  if (tintTimer.current) { clearInterval(tintTimer.current); tintTimer.current = null }
                  if (node) {
                    // 把当前帧缩到极小画布求平均色 —— 这就是"视频的主色调"。
                    // 低频（1.2s）且画布只有 24×14，成本可以忽略。
                    const sampleTint = () => {
                      try {
                        const canvas = tintCanvas.current || (tintCanvas.current = document.createElement('canvas'));
                        canvas.width = 24; canvas.height = 14;
                        const ctx = canvas.getContext('2d');
                        if (!ctx) return;
                        ctx.drawImage(node, 0, 0, canvas.width, canvas.height);
                        const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
                        let r = 0; let g = 0; let b = 0; let n = 0;
                        for (let i = 0; i < data.length; i += 4) { r += data[i]; g += data[i + 1]; b += data[i + 2]; n += 1 }
                        if (!n) return;
                        const ch = (value) => Math.round(Math.min(255, Math.max(0, (value / n) * 1.1)));
                        document.documentElement.style.setProperty('--wsb-bg-tint', ch(r) + ' ' + ch(g) + ' ' + ch(b));
                      } catch (error) { /* 画布被污染或帧未就绪：保留上一个色调 */ }
                    };
                    sampleTint();
                    tintTimer.current = window.setInterval(sampleTint, 1200);
                  }`);

const TINT_CSS = `/* 窗口表面掺入工作台背景的主色调（由上面的采样写入 --wsb-bg-tint）。
   单独一条、放在原有规则之后 —— 不改动他们的那一行；默认色是中性灰蓝，没有视频时不会偏色。 */
.wsb-glass{background:
  linear-gradient(0deg,
    color-mix(in srgb,rgb(var(--wsb-bg-tint,128 148 168)) 20%,transparent),
    color-mix(in srgb,rgb(var(--wsb-bg-tint,128 148 168)) 10%,transparent)),
  color-mix(in srgb,var(--dsw-alias-bg-layer-1) var(--wsb-glass-alpha),transparent)}`;

{
  const after = /\.wsb-glass\{background:color-mix\(in srgb,var\(--dsw-alias-bg-layer-1\)\s*var\(--wsb-glass-alpha\)[^}]*\)\}/;
  const fallback = /\[data-glass="thick"\] \.wsb-card,\[data-glass="thick"\] \.wsb-glass\{/;
  if (src.indexOf('rgb(var(--wsb-bg-tint') >= 0) {
    console.log('已完成 配色：玻璃表面掺入主色调');
  } else if ((src.match(new RegExp(after.source, 'g')) || []).length === 1) {
    src = src.replace(after, (m) => `${m}\n${TINT_CSS}`);
    console.log('ok    配色：玻璃表面掺入主色调（接在原规则之后）');
  } else if ((src.match(new RegExp(fallback.source, 'g')) || []).length === 1) {
    src = src.replace(fallback, (m) => `${TINT_CSS}\n${m}`);
    console.log('ok    配色：玻璃表面掺入主色调（退回到更靠后的锚点）');
  } else {
    console.log('BAD   配色：两个锚点都没找到');
    bad += 1;
  }
}

if (bad > 0) { console.log('\n中止：' + bad + ' 处不符 —— 未写入。'); process.exit(1) }
if (src === original) { console.log('\n无需改动。'); process.exit(0) }
if (!apply) { console.log('\n演练结束：**尚未写入**。加 --apply 应用。'); process.exit(0) }
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
fs.copyFileSync(client, client + '.before-tint-' + stamp);
fs.writeFileSync(client, src);
try {
  execFileSync(process.execPath, ['--check', client], { stdio: 'pipe' });
  console.log('node --check 通过');
} catch (error) {
  fs.writeFileSync(client, fs.readFileSync(client + '.before-tint-' + stamp, 'utf8'));
  console.log('回滚：' + String(error.stderr || error).slice(0, 220));
  process.exit(1);
}
const hash = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').slice(0, 16);
fs.copyFileSync(client, pkg);
console.log((hash(client) === hash(pkg) ? 'hash=OK  ' : 'MISMATCH ') + path.basename(pkg));
