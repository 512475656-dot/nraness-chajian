'use strict';
/**
 * 1. 绕圈换做法：offset-path（路径与外框不重合 → 圆角越大偏差越大）→ 遮罩环。
 *    伪元素铺满 + mask 只留 2px 一圈，遮罩跟随 border-radius，因此任何圆角都精确贴边。
 * 2. 标题栏设计：统一叠一层"更浅"的渐变，与背景做出层次（四个模块屏同一条规则）。
 *    规则写在样式表末尾（我的权威段），因此不会被后面的规则覆盖。
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

// 1) 绕圈：换成遮罩环
run('绕圈：offset-path → 遮罩环（精确贴边）',
  /\/\* 工作状态: 一小段线沿着磁贴内缘跑[\s\S]{0,700}?animation:wsb-trace 3\.6s linear infinite\}/,
  `/* 工作状态：一道光沿着磁贴内缘跑。
   做法：伪元素铺满，用 mask 只留 2px 的一圈 —— 遮罩跟随 border-radius，
   于是无论圆角多大，光带都精确贴着边缘。（offset-path 做不到：路径与外框不重合，
   圆角越大偏差越明显。）代价是这条 2px 细边每帧重绘 —— 很小，且只作用于运行中的磁贴。 */
@property --wsb-trace{syntax:'<angle>';initial-value:0deg;inherits:false}
.wsb-card[data-running="true"]::after{
  content:"";position:absolute;inset:0;z-index:2;pointer-events:none;padding:2px;
  border-radius:inherit;
  background:conic-gradient(from var(--wsb-trace),
    transparent 0deg 284deg,
    color-mix(in srgb,#fff 50%,transparent) 316deg,
    #fff 350deg,
    transparent 360deg);
  -webkit-mask:linear-gradient(#000,#000) content-box,linear-gradient(#000,#000);
  -webkit-mask-composite:xor;mask:linear-gradient(#000,#000) content-box,linear-gradient(#000,#000);
  mask-composite:exclude;
  animation:wsb-trace 3.6s linear infinite}
@keyframes wsb-trace{to{--wsb-trace:360deg}}`);

// 2) 标题栏设计（贴在样式表末尾 —— 我的权威段，最后生效）
run('标题栏：统一叠一层更浅的渐变（末尾权威段）',
  /(\.wsb-tileAbbr\{position:absolute;left:0;right:0;bottom:24px;text-align:center\})/,
  `$1

/* ==== 标题栏（四个模块屏统一）====
   设计意图：与背景拉开层次，但不抢内容。
   · 一层"更浅"的渐变：上方稍亮、向下渐隐 —— 像被顶光照到的一条带子；
   · 上沿一道内高光、下沿一道发丝线 —— 把这条带子"压"在背景之上，边界清楚；
   · 一层轻模糊：让背后的画面在这条带上变得安静，于是标题读起来更稳。
   写在样式表末尾，因此不会被其它规则盖掉。 */
.wsb-screen .wsb-head,
.wsb-screen .wsb-nwHead,
.wsb-screen .wsb-stkHead,
.wsb-screen .wsb-noteTopRow{
  padding:8px 12px;
  border-radius:14px;
  background:linear-gradient(180deg,
    color-mix(in srgb,#fff 15%,transparent) 0%,
    color-mix(in srgb,#fff 7%,transparent) 58%,
    color-mix(in srgb,#fff 0%,transparent) 100%);
  border:1px solid color-mix(in srgb,#fff 10%,transparent);
  box-shadow:inset 0 1px 0 color-mix(in srgb,#fff 20%,transparent);
  -webkit-backdrop-filter:blur(18px) saturate(150%);
  backdrop-filter:blur(18px) saturate(150%)}`);

if (bad > 0) { console.log('\n中止：' + bad + ' 处不符 —— 未写入。'); process.exit(1) }
if (src === original) { console.log('\n无需改动。'); process.exit(0) }
if (!apply) { console.log('\n演练结束：**尚未写入**。加 --apply 应用。'); process.exit(0) }
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
fs.copyFileSync(client, client + '.before-ring-' + stamp);
fs.writeFileSync(client, src);
try {
  execFileSync(process.execPath, ['--check', client], { stdio: 'pipe' });
  console.log('node --check 通过');
} catch (error) {
  fs.writeFileSync(client, fs.readFileSync(client + '.before-ring-' + stamp, 'utf8'));
  console.log('回滚：' + String(error.stderr || error).slice(0, 220));
  process.exit(1);
}
const hash = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').slice(0, 16);
fs.copyFileSync(client, pkg);
console.log((hash(client) === hash(pkg) ? 'hash=OK  ' : 'MISMATCH ') + path.basename(pkg));
