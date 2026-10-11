'use strict';
/**
 * 刷新提示：客户端代码加载后（= 页面真的刷新了），让标题 LOGO 亮一下。
 *   · 先按几种候选选择器找 LOGO（品牌区 / 顶栏里的 svg、img）；
 *   · 找到就做 3 次白色脉冲（放大 + 白光晕），约 1.6 秒后完全复原；
 *   · 找不到就退而闪一条"已刷新"提示条 —— 保证一定有可见反馈。
 *   · 只在页面加载时执行一次；用完即恢复，不留下任何样式。
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
const MARK = 'WB_FLASH_ON_LOAD';
if (src.indexOf(MARK) >= 0) { console.log('已完成：刷新提示已在'); process.exit(0) }
const anchor = /(\n\s*\/\/ 临时诊断：这一行在"插件客户端代码被加载"的那一刻执行 —— 整页刷新后时间会变。\n\s*const WB_LOADED_AT = new Date\(\);)/;
const hits = (src.match(new RegExp(anchor.source, 'g')) || []).length;
console.log('锚点命中 ' + hits + ' 处');
if (hits !== 1) { console.log('中止 —— 未写入。'); process.exit(1) }

const BLOCK = `$1
    // ${MARK}：页面加载后让 LOGO 亮一下（= 刷新成功的可见凭证）。
    const wbFlashOnLoad = () => {
      if (typeof document === 'undefined') return;
      const toast = () => {
        const bar = document.createElement('div');
        bar.textContent = '✓ 页面已刷新（' + new Date().toTimeString().slice(0, 8) + '）';
        bar.style.cssText = 'position:fixed;left:50%;top:14px;transform:translateX(-50%);z-index:2147483647;'
          + 'padding:7px 16px;border-radius:999px;background:#fff;color:#111;font:600 13px/1.2 system-ui,sans-serif;'
          + 'box-shadow:0 8px 30px rgba(0,0,0,.45),0 0 0 2px rgba(255,255,255,.6);pointer-events:none;'
          + 'transition:opacity .4s ease';
        document.body.appendChild(bar);
        window.setTimeout(() => { bar.style.opacity = '0' }, 1500);
        window.setTimeout(() => { if (bar.parentNode) bar.parentNode.removeChild(bar) }, 2100);
      };
      const logo = document.querySelector('[class*="brand" i] svg, [class*="brand" i] img, [class*="logo" i] svg, [class*="logo" i] img, header svg, header img');
      if (!logo) { toast(); return }
      const keep = { transition: logo.style.transition, filter: logo.style.filter, transform: logo.style.transform };
      logo.style.transition = 'filter .28s ease,transform .28s ease';
      let step = 0;
      const pulse = () => {
        step += 1;
        const on = step % 2 === 1;
        logo.style.filter = on ? 'brightness(2.2) drop-shadow(0 0 16px rgba(255,255,255,.95))' : 'none';
        logo.style.transform = on ? 'scale(1.32)' : 'scale(1)';
        if (step < 6) window.setTimeout(pulse, 280);
        else window.setTimeout(() => {
          logo.style.transition = keep.transition || '';
          logo.style.filter = keep.filter || '';
          logo.style.transform = keep.transform || '';
        }, 300);
      };
      pulse();
      toast();
    };
    try { window.setTimeout(wbFlashOnLoad, 350) } catch (error) { /* 忽略 */ }`;

if (!apply) { console.log('演练：将插入刷新提示（未写入）。加 --apply 应用。'); process.exit(0) }
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
fs.copyFileSync(client, client + '.before-flash-' + stamp);
src = src.replace(anchor, BLOCK);
fs.writeFileSync(client, src);
try { execFileSync(process.execPath, ['--check', client], { stdio: 'pipe' }); console.log('node --check 通过') }
catch (error) {
  fs.writeFileSync(client, fs.readFileSync(client + '.before-flash-' + stamp, 'utf8'));
  console.log('回滚：' + String(error.stderr || error).slice(0, 240));
  process.exit(1);
}
const hash = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').slice(0, 16);
fs.copyFileSync(client, pkg);
console.log((hash(client) === hash(pkg) ? 'hash=OK  ' : 'MISMATCH ') + path.basename(pkg));
