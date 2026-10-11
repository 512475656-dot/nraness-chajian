'use strict';
/**
 * 自定义背景：双击文件名重命名 + 视频声音开关。
 * 这次的锚点全部用"容忍空白的内容正则"，不依赖任何一次读取的快照；
 * 中英文案用同一个模式匹配，靠"匹配内容里有没有汉字"自动分流。
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

run('状态：重命名草稿 + 提交函数',
  /const active = items\.find\(\(item\) => item\.key === activeKey\) \|\| null;/,
  `// 双击文件名就地重命名：Enter 提交、Esc 取消、失焦提交。
        const [renaming, setRenaming] = useState('');
        const [draft, setDraft] = useState('');
        const commitRename = () => {
          const next = String(draft || '').trim();
          const key = renaming;
          setRenaming('');
          if (!key || !next) return;
          patch({ media: (background.media || []).map((item) => (item.key === key ? { ...item, name: next } : item)) });
        };
        const active = items.find((item) => item.key === activeKey) || null;`);

run('标记：双击改名',
  /h\('span', \{ className: 'wsb-customName', title: active\.name \|\| '' \}, active\.name \|\| t\.bgMedia\),/,
  `h('span', {
                  className: 'wsb-customName',
                  title: (active.name || '') + '  ·  ' + ((t && t.mediaRenameHint) || '双击重命名'),
                  onDoubleClick: () => { setRenaming(active.key); setDraft(active.name || '') },
                }, renaming === active.key
                  ? h('input', {
                    className: 'wsb-nameInput', value: draft, autoFocus: true,
                    'aria-label': (t && t.mediaRenameHint) || '重命名',
                    onChange: (event) => setDraft(event.target.value),
                    onKeyDown: (event) => {
                      if (event.key === 'Enter') { event.preventDefault(); commitRename() }
                      else if (event.key === 'Escape') { event.preventDefault(); setRenaming('') }
                    },
                    onBlur: commitRename,
                  })
                  : (active.name || t.bgMedia)),`);

run('标记：声音开关',
  /active \? button\(t\.mediaRemove, 'clearMedia', \(\) => onRemove\(active\.key\)\) : null\),/,
  `active ? button(t.mediaRemove, 'clearMedia', () => onRemove(active.key)) : null,
              active && active.kind === 'video'
                ? h('button', {
                  type: 'button', className: 'wsb-btn', 'data-media-sound': '1',
                  'data-on': background.mediaSound ? 'true' : 'false',
                  'aria-pressed': background.mediaSound ? 'true' : 'false',
                  title: (t && t.mediaSoundHint) || '播放这个视频自带的声音',
                  onClick: () => patch({ mediaSound: !background.mediaSound }),
                }, background.mediaSound ? ((t && t.mediaSoundOn) || '声音 开') : ((t && t.mediaSound) || '声音 关'))
                : null),`);

run('播放：muted 跟随开关',
  /autoPlay: true, loop: true, muted: true, playsInline: true, preload: 'auto',/,
  `autoPlay: true, loop: true, muted: !background.mediaSound, playsInline: true, preload: 'auto',`);

run('播放：ref 里再同步一次 muted',
  /if \(node\) safe\(\(\) => \{ node\.playbackRate = clamp\(background\.mediaSpeed, 25, 200\) \/ 100 \}\);?/,
  `if (node) safe(() => { node.playbackRate = clamp(background.mediaSpeed, 25, 200) / 100 });
                  // React 对 muted 的更新路径不够可靠，这里再设一次。
                  if (node) safe(() => { node.muted = !background.mediaSound });`);

run('样式：就地输入框',
  /\.wsb-customName\{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11\.5px\}/,
  `.wsb-customName{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11.5px;
  cursor:text}
.wsb-nameInput{width:100%;box-sizing:border-box;font:inherit;font-size:11.5px;padding:3px 7px;border-radius:7px;
  color:var(--dsw-alias-label-primary);outline:none;
  border:1px solid color-mix(in srgb,var(--dsw-alias-label-primary) 24%,transparent);
  background:color-mix(in srgb,var(--dsw-alias-bg-layer-2) 72%,transparent)}`);

// 文案：同一个模式，按"有没有汉字"自动分流；已补过的跳过。
{
  const re = /(mediaPick: '[^']*', mediaReplace: '[^']*', mediaRemove: '[^']*',)/g;
  let added = 0;
  src = src.replace(re, (m) => {
    if (/mediaSound/.test(m)) return m;
    const zh = /[\u4e00-\u9fff]/.test(m);
    added += 1;
    return m + (zh
      ? `\n        mediaSound: '声音 关', mediaSoundOn: '声音 开', mediaRenameHint: '双击重命名', mediaSoundHint: '播放这个视频自带的声音',`
      : `\n        mediaSound: 'Sound off', mediaSoundOn: 'Sound on', mediaRenameHint: 'Double-click to rename', mediaSoundHint: "Use the video's own audio",`);
  });
  console.log('ok    文案：中英各补一份（共 ' + added + ' 处）');
  if (added < 2) { console.log('BAD   文案：只补到 ' + added + ' 处'); bad += 1 }
}

if (bad > 0) { console.log('\n中止：' + bad + ' 处不符 —— 未写入。'); process.exit(1) }
if (src === original) { console.log('\n无需改动。'); process.exit(0) }
if (!apply) { console.log('\n演练结束：**尚未写入**。加 --apply 应用。'); process.exit(0) }
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
fs.copyFileSync(client, client + '.before-media-' + stamp);
fs.writeFileSync(client, src);
try {
  execFileSync(process.execPath, ['--check', client], { stdio: 'pipe' });
  console.log('node --check 通过');
} catch (error) {
  fs.writeFileSync(client, fs.readFileSync(client + '.before-media-' + stamp, 'utf8'));
  console.log('回滚：' + String(error.stderr || error).slice(0, 220));
  process.exit(1);
}
const hash = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').slice(0, 16);
fs.copyFileSync(client, pkg);
console.log((hash(client) === hash(pkg) ? 'hash=OK  ' : 'MISMATCH ') + path.basename(pkg));
