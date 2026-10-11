/**
 * Apply the 股票市场 module's **UI** to `client.js` — the four blocks that are new content rather
 * than wiring. `tools/apply-stock-module.mjs` applies the wiring; this applies the rest:
 *
 *   1. the Chinese strings
 *   2. the English strings
 *   3. the board's CSS
 *   4. the whole 股票市场 view region (data layer + tiles + table + picker + screen)
 *
 * The blocks are *extracted from a reference file* rather than retyped, so there is exactly one
 * copy of each and no transcription drift. Point `--from` at a client.js that already carries the
 * module (a saved snapshot of a working build).
 *
 * Rebuild recipe, from a clean base:
 *
 *   Copy-Item workbench-notes-redesign\deliver\client.js client.js
 *   node tools/apply-stock-module.mjs
 *   node tools/apply-stock-module-ui.mjs --from <a client.js that already has the module>
 *
 * Usage: node tools/apply-stock-module-ui.mjs --from <reference client.js> [--check]
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TARGET = path.join(ROOT, 'client.js');
const checkOnly = process.argv.includes('--check');
const fromAt = process.argv.indexOf('--from');
const REFERENCE = fromAt >= 0 ? path.resolve(process.argv[fromAt + 1]) : '';
if (!REFERENCE) {
  console.error('usage: node tools/apply-stock-module-ui.mjs --from <reference client.js> [--check]');
  process.exit(2);
}

const reference = fs.readFileSync(REFERENCE, 'utf8');

/** Cut a block out of the reference between two literal markers. */
function cut(label, startMarker, endMarker, includeEnd) {
  const start = reference.indexOf(startMarker);
  if (start < 0) throw new Error('the reference has no ' + label + ' (marker: ' + JSON.stringify(startMarker) + ')');
  const after = reference.indexOf(endMarker, start);
  if (after < 0) throw new Error('the reference has no end for ' + label);
  const end = includeEnd ? after + endMarker.length : after;
  return reference.slice(start, end);
}

// ── 1/2. the two string blocks ─────────────────────────────────────────────────────────────
const ZH_BLOCK = cut('Chinese stock strings',
  '        // ---- 股票市场 (Stock market) ----',
  "        stockDisclaimer: '行情来自公开接口，可能有延迟，仅供参考，不构成投资建议。',", true);
const EN_BLOCK = cut('English stock strings',
  '        // ---- Stock market ----',
  "        stockDisclaimer: 'Quotes come from public endpoints, may be delayed, and are for reference only — not investment advice.',", true);

// ── 3. the board's CSS ─────────────────────────────────────────────────────────────────────
// The rule the suite bans outright: a non-scaling stroke cannot be dash-drawn by `pathLength`,
// which is the mechanism the tile marks' pen animation uses. The sparkline does not animate, but
// the ban is global and the reason it exists is good, so the sparkline simply does not use it —
// at 30px tall the difference is invisible, and the anisotropic stroke of a `preserveAspectRatio`
// -less chart is the cost of staying inside the house rule.
let CSS_BLOCK = cut('the stock CSS block',
  '/* ---- 股票市场 (Stock market) ---', '\n.wsb-stkLegal{', false);
CSS_BLOCK = CSS_BLOCK.replace(/\.wsb-stkSpark path\{vector-effect:non-scaling-stroke;?\}\n?/g, '');
if (CSS_BLOCK.includes('vector-effect')) {
  throw new Error('the CSS block still carries a non-scaling stroke after stripping — check the rule shape');
}
// Close the block with the rule the marker stopped before.
const LEGAL_RULE = '\n.wsb-stkLegal{margin-top:10px;font-size:9.5px;line-height:1.6;color:var(--dsw-alias-label-secondary);opacity:.85}\n';

// ── 4. the view region ─────────────────────────────────────────────────────────────────────
let VIEW_BLOCK = cut('the stock view region',
  '    //#region 股票市场 (stock market board)',
  '    //#region app shell: state, navigation, transitions', false);
// The same ban reaches prose: the suite reads the source with a regular expression, so a comment
// that *names* the banned property trips it just as surely as the property does. The sentence is
// rewritten rather than deleted, because why the stroke is allowed to stretch is worth keeping.
VIEW_BLOCK = VIEW_BLOCK
  .replace(/`vector-effect:non-scaling-stroke` keeps the line 1\.4 px while it does\./,
    'so the stroke is measured in the stretched space rather than pinned to device pixels — a\n     *  deliberate trade, because the suite bans a non-scaling stroke outright (it would break the\n     *  tile marks\' `pathLength` pen animation) and a 30 px sparkline cannot show the difference.');
if (VIEW_BLOCK.includes('vector-effect')) {
  throw new Error('the view region still names the banned non-scaling stroke');
}

// The auto-refresh interval must not keep a Node process alive.
//
// The suite renders this pane and never unmounts it, so an un-`unref`'d interval makes the test
// run hang *after* its last assertion — the run prints "all render checks passed" and then never
// exits. A browser's `setInterval` returns a number with no `unref`, so this is a no-op there; in
// Node it is the difference between a background poll and a process that will not exit.
const REFRESH_OLD = `        }, STOCK_REFRESH_MS);
        return () => clearInterval(timer);`;
const REFRESH_NEW = `        }, STOCK_REFRESH_MS);
        // "Keep polling while the pane is open, but do not let the poll alone keep the process
        // alive" is exactly what \`unref\` says. Absent in the browser, where the timer is a number.
        if (timer && typeof timer.unref === 'function') timer.unref();
        return () => clearInterval(timer);`;
if (VIEW_BLOCK.includes(REFRESH_OLD)) {
  VIEW_BLOCK = VIEW_BLOCK.replace(REFRESH_OLD, REFRESH_NEW);
} else if (!VIEW_BLOCK.includes('timer.unref')) {
  throw new Error('the refresh interval was not found in the view region');
}

// ── the reduced-motion additions, which live inside the existing media block ────────────────
const RM_ADD = cut('the stock reduced-motion rules',
  '  /* 行情看板: 数字换位时的过渡和走势线的描绘都停掉',
  '  .wsb-stkTile{animation:none}\n', true);

// ── apply ──────────────────────────────────────────────────────────────────────────────────
const original = fs.readFileSync(TARGET, 'utf8');
let text = original;
const report = [];
let failed = 0;

const replaceOnce = (label, from, to) => {
  const count = text.split(from).length - 1;
  if (count === 1) { text = text.replace(from, to); report.push('  applied   ' + label); return }
  if (count === 0 && text.includes(to.slice(0, Math.min(60, to.length)))) {
    report.push('  present   ' + label);
    return;
  }
  failed += 1;
  report.push('  FAILED    ' + label + '  (anchor found ' + count + ' times)');
};

// 1. Chinese strings: append inside the zh dictionary, before its closing brace.
replaceOnce('the Chinese stock strings',
  "        newsDragHint: '拖动调整栏宽，双击复位',\n      },",
  "        newsDragHint: '拖动调整栏宽，双击复位',\n\n" + ZH_BLOCK + "\n      },");

// 2. English strings.
replaceOnce('the English stock strings',
  "        newsDragHint: 'Drag to resize, double-click to reset',\n      },",
  "        newsDragHint: 'Drag to resize, double-click to reset',\n\n" + EN_BLOCK + "\n      },");

// 3. The board's CSS, after the news reduced-motion block and before the glass section.
replaceOnce('the stock CSS block',
  `  .wsb-item,.wsb-hotCard,.wsb-topic,.wsb-linkBtn,.wsb-iconBtn,.wsb-split:before{transition:none}
  .wsb-item:hover,.wsb-hotCard:hover,.wsb-topic:hover,.wsb-iconBtn:hover{transform:none}
}
`,
  `  .wsb-item,.wsb-hotCard,.wsb-topic,.wsb-linkBtn,.wsb-iconBtn,.wsb-split:before{transition:none}
  .wsb-item:hover,.wsb-hotCard:hover,.wsb-topic:hover,.wsb-iconBtn:hover{transform:none}
}
` + RM_ADD + `}

` + CSS_BLOCK + LEGAL_RULE);

// 4. The view region, before the app shell.
replaceOnce('the stock view region',
  '    //#region app shell: state, navigation, transitions',
  VIEW_BLOCK + '    //#region app shell: state, navigation, transitions');

console.log(report.join('\n'));
console.log('\n' + (4 - failed) + '/4 blocks ok  (CSS block ' + CSS_BLOCK.split('\n').length
  + ' lines, view region ' + VIEW_BLOCK.split('\n').length + ' lines)');
if (failed) {
  console.error('refusing to write: ' + failed + ' block(s) did not apply');
  process.exit(1);
}
if (checkOnly) { console.log('--check: nothing written'); process.exit(0) }
fs.writeFileSync(TARGET, text, 'utf8');
console.log('client.js: ' + original.split('\n').length + ' -> ' + text.split('\n').length + ' lines');
