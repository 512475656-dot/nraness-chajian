'use strict';
/**
 * 妯″潡鐣岄潰鑳屾櫙锛氬帇鏆?+ 妯＄硦锛? = 涓嶅彉锛岄浂寮€閿€锛夈€? * 鏀规硶锛堜笁澶勶紝鍏ㄩ儴瀹夊叏閿氱偣锛夛細
 *   1. normalizeState 閲屽姞 appearance.dim锛?-100锛岄粯璁?0锛夈€? *   2. 鏍硅妭鐐规牱寮忛噷鍙戝竷 --wsb-dim 涓?data-dim锛堝叏灞€璁剧疆锛岄殢 CSS 鍙橀噺缁ф壙鍒版墍鏈夊睆锛夈€? *   3. CSS锛氭ā鍧楀睆锛堥潪 home锛夌殑 ::before 鍋?backdrop-filter锛沝im=0 鏃?data-dim=false 鈫?none銆? *   4. 銆岀晫闈㈣缃€嶉潰鏉块噷鍔犱竴鏉℃粦鏉★紙瀹冩梺杈瑰氨鏄崱鐗囧舰鐘?閫忔槑搴︼紝浣滅敤鍩熷唴鏈氨鏈?appearance 涓?onAppearance锛夈€? * 婕旂粌榛樿锛?-apply 鎵嶅啓锛涘啓鍓嶅浠斤紱鍐欏悗 node --check锛堝け璐ュ洖婊氾級锛涘啀閮ㄧ讲鏍￠獙 hash銆? */
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
  if (doneMarker && src.includes(doneMarker)) { console.log('宸插畬鎴?' + label); return }
  const hits = (src.match(new RegExp(re.source, 'g')) || []).length;
  if (hits !== want) { console.log('BAD   ' + label + '  [鍛戒腑 ' + hits + '锛岄鏈?' + want + ']'); bad += 1; return }
  src = src.replace(re, replacement);
  console.log('ok    ' + label);
};

// 1) 璁剧疆瀛楁 + 褰掍竴鍖栥€?run('璁剧疆锛歛ppearance.dim 褰掍竴鍖?,
  /(if \(appearance\.glassAlpha !== undefined && appearance\.glassAlpha !== null\) \{)/,
  (m) => `// 妯″潡鐣岄潰鑳屾櫙鐨勫帇鏆?妯＄硦寮哄害锛? = 涓嶅彉锛夈€俓n`
    + `        appearance.dim = isFinite(Number(appearance.dim))\n`
    + `          ? clamp(Math.round(Number(appearance.dim)), 0, 100) : 0;\n`
    + `        ${m}`,
  'appearance.dim = isFinite');

// 2) 鏍硅妭鐐瑰彂甯冨彉閲忋€?run('鍙戝竷锛?-wsb-dim 涓?data-dim',
  /(const glassAlphaStyle = appearance\.glassAlpha === undefined)/,
  (m) => `const dimStyle = { '--wsb-dim': String(clamp(appearance.dim || 0, 0, 100)) };\n`
    + `      ${m}`,
  'const dimStyle');

// 3) CSS锛氭ā鍧楀睆鐨勮儗鏅眰銆?run('鏍峰紡锛氭ā鍧楀睆鐨勫帇鏆楁ā绯婂眰',
  /(\.wsb-screen\[data-concealed="true"\]\{visibility:hidden;pointer-events:none\})/,
  (m) => `${m}\n\n`
    + `/* ---- 妯″潡鍐呰儗鏅細鍘嬫殫 + 妯＄硦锛? = 涓嶅彉锛屼笖瀹屽叏涓嶄骇鐢熷紑閿€锛?---------------\n`
    + `   妯″潡灞忔湰韬槸閫忔槑鐨勶紝鎵€浠ヤ笅闈㈠氨鏄闈㈣儗鏅€傝繖涓€灞傚彧鍋?backdrop-filter锛歕n`
    + `   妯＄硦瀹冿紙blur锛夊苟鍘嬫殫瀹冿紙brightness锛夈€傚己搴︿负 0 鏃?data-dim=false 鈫?none锛屼笉杩涘悎鎴愩€?*/\n`
    + `.wsb-screen:not([data-role="home"])::before{content:"";position:absolute;inset:0;z-index:0;\n`
    + `  pointer-events:none;\n`
    + `  backdrop-filter:blur(calc(var(--wsb-dim,0) * 0.2px)) brightness(calc(1 - var(--wsb-dim,0) * 0.0065))}\n`
    + `[data-dim="false"] .wsb-screen:not([data-role="home"])::before{backdrop-filter:none}\n`
    + `.wsb-screen:not([data-role="home"])>.wsb-root{position:relative;z-index:1}`,
  '妯″潡鍐呰儗鏅細鍘嬫殫 + 妯＄硦');

// 4) 璁剧疆闈㈡澘閲屽姞婊戞潯锛堢揣璺?鍗＄墖褰㈢姸"閭ｆ潯涔嬪悗锛夈€?run('闈㈡澘锛氳儗鏅帇鏆楁粦鏉?,
  /(h\(FieldSlider, \{ label: t\.shape, name: 'radius'[\s\S]{0,200}?\}\),)/,
  (m) => `${m}\n`
    + `              h(FieldSlider, {\n`
    + `                label: (t && t.dimLabel) || '鑳屾櫙鍘嬫殫', name: 'backdropDim',\n`
    + `                value: appearance.dim === undefined ? 0 : appearance.dim, low: 0, high: 100,\n`
    + `                onChange: (value) => onAppearance({ dim: clamp(Math.round(value), 0, 100) }),\n`
    + `              }),`,
  "name: 'backdropDim'");

// 5) 涓嫳鏂囨銆?run('鏂囨锛氫腑鏂囦袱鏉?,
  /(stockViewBoard: '[^']*', stockViewTable: '[^']*',)/,
  (m) => `${m}\n        dimLabel: '鑳屾櫙鍘嬫殫', dimHint: '鏁板€艰秺楂橈紝妯″潡鍐呰儗鏅秺妯＄硦銆佽秺鏆?,`,
  "dimLabel: '鑳屾櫙鍘嬫殫'", 2);
run('鏂囨锛氳嫳鏂囦袱鏉?,
  /(stockViewBoard: '[^']*', stockViewTable: '[^']*',)(?!\n\s*dimLabel)/,
  (m) => `${m}\n        dimLabel: 'Backdrop dim', dimHint: 'Higher values blur and darken the backdrop inside a module',`,
  "dimLabel: 'Backdrop dim'");

if (bad > 0) { console.log('\n涓锛? + bad + ' 澶勪笉绗?鈥斺€?鏈啓鍏ャ€?); process.exit(1) }
if (src === original) { console.log('\n鏃犻渶鏀瑰姩銆?); process.exit(0) }
if (!apply) { console.log('\n婕旂粌缁撴潫锛?*灏氭湭鍐欏叆**銆傚姞 --apply 搴旂敤銆?); process.exit(0) }

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
fs.copyFileSync(client, client + '.before-dim-' + stamp);
fs.writeFileSync(client, src);
console.log('\n澶囦唤锛歝lient.before-dim-' + stamp + '.js');
try {
  execFileSync(process.execPath, ['--check', client], { stdio: 'pipe' });
  console.log('node --check: 閫氳繃 路 ' + original.length + ' 鈫?' + src.length + ' B');
} catch (error) {
  fs.writeFileSync(client, original);
  console.log('node --check 澶辫触锛屽凡鍥炴粴锛? + String(error.stderr || error).slice(0, 300));
  process.exit(1);
}
const hash = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').slice(0, 16);
fs.copyFileSync(client, pkg);
console.log((hash(client) === hash(pkg) ? 'hash=OK  ' : 'MISMATCH ') + path.basename(pkg));
