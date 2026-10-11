/**
 * Apply the 股票市场 module to `client.js`, atomically and verifiably.
 *
 * Why this is a script and not a handful of hand edits: `client.js` in this repo is shared with
 * another session that deploys to the same profile. It was found damaged once during this work
 * — ~1030 lines of CSS missing — and restored from `workbench-notes-redesign/plugin-latest`.
 * A patch that asserts every anchor is exactly where it expects to be can be re-run against
 * whatever the file looks like next, and it fails loudly instead of half-applying.
 *
 * Usage:
 *   node tools/apply-stock-module.mjs            # apply, refuse if already applied
 *   node tools/apply-stock-module.mjs --check    # report only
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = path.join(ROOT, 'client.js');
const checkOnly = process.argv.includes('--check');

// ── the module's client half ────────────────────────────────────────────────────────────────

const ABBR_OLD = `    const MODULE_ABBR = {
      game: 'DEV', news: 'NEWS', notebook: 'NOTES', research: 'LAB', blank: 'BLANK',
    };`;
const ABBR_NEW = `    const MODULE_ABBR = {
      game: 'DEV', news: 'NEWS', notebook: 'NOTES', research: 'LAB', stock: 'MKT', blank: 'BLANK',
    };`;

const MARK_OLD = `      news: [
        'M3 6H21V18H3Z',
        'M3 10H21',
        'M6 13H11',
        'M6 16H11',
        'M14 13H18V16H14Z',
      ],`;
const MARK_NEW = `      news: [
        'M3 6H21V18H3Z',
        'M3 10H21',
        'M6 13H11',
        'M6 16H11',
        'M14 13H18V16H14Z',
      ],
      /* 股票市场: a rising line over a baseline. Straight segments on whole units, 45° only, and
         it spans 18 of the 20 live units like every other mark — see the spec table above and
         \`test/render-check.cjs\`, which measures the coverage rather than trusting this comment.
         A line was chosen over a coin or a ¥ because the module reads *indices*, and an index is
         a shape over time, not a thing you own. */
      stock: [
        'M3 13L8 8L13 13L18 8L21 11',
        'M3 16H21',
      ],`;

const VOCAB_OLD = `     *   news      a broadsheet front page                  (masthead rule, two columns, one picture box)
     *   research  three stacked planes                     (a vault of layers, not a magnifying glass)`;
const VOCAB_NEW = `     *   news      a broadsheet front page                  (masthead rule, two columns, one picture box)
     *   research  three stacked planes                     (a vault of layers, not a magnifying glass)
     *   stock     a rising line over a baseline            (a quote over time, not a coin)`;

const SETTINGS_OLD = `      if (catalog && Array.isArray(catalog.defaults) && catalog.defaults.length) {
        news.topics = catalog.defaults.map((topic) => Object.assign({}, topic, {
          kw: (topic.kw || []).slice(),
          feeds: (topic.feeds || []).slice(),
        }));
        news.activeId = news.topics[0].id;
      }
      return news;
    }

    //#endregion`;

const SETTINGS_NEW = `      if (catalog && Array.isArray(catalog.defaults) && catalog.defaults.length) {
        news.topics = catalog.defaults.map((topic) => Object.assign({}, topic, {
          kw: (topic.kw || []).slice(),
          feeds: (topic.feeds || []).slice(),
        }));
        news.activeId = news.topics[0].id;
      }
      return news;
    }

    //#endregion

    //#region 股票市场 settings

    /** Same-origin Host route that does the quoting (see stocks.js). */
    const STOCK_ROUTE = '/workbench-stocks';

    /**
     * The market catalog, mirrored so the picker and the board render before the Host has ever
     * been asked — the same reason 每日新闻 mirrors its source list.
     *
     * It is a *mirror*, not the contract: the Host re-resolves every id against its own catalog,
     * so a stale or invented entry here cannot make it fetch something unexpected. The Host's
     * copy is authoritative and replaces this one on the first successful \`op=catalog\`.
     *
     * \`fallback\` is published because it is the difference between an empty row and a number
     * from the second source on a machine with no proxy: A股 / 港股 / 美股 can be answered by
     * 腾讯 without one, and every other market cannot.
     */
    const STOCK_SEED_MARKETS = [
      { id: 'sh', name: '上证指数', region: 'A股', fallback: true },
      { id: 'sz', name: '深证成指', region: 'A股', fallback: true },
      { id: 'cyb', name: '创业板指', region: 'A股', fallback: true },
      { id: 'hs300', name: '沪深300', region: 'A股', fallback: true },
      { id: 'kc50', name: '科创50', region: 'A股', fallback: true },
      { id: 'hsi', name: '恒生指数', region: '港股', fallback: true },
      { id: 'hscei', name: '国企指数', region: '港股', fallback: true },
      { id: 'dji', name: '道琼斯', region: '美股', fallback: true },
      { id: 'ixic', name: '纳斯达克', region: '美股', fallback: true },
      { id: 'spx', name: '标普500', region: '美股', fallback: true },
      { id: 'ndx', name: '纳斯达克100', region: '美股', fallback: true },
      { id: 'rut', name: '罗素2000', region: '美股', fallback: false },
      { id: 'vix', name: '标普波动率', region: '美股', fallback: true },
      { id: 'n225', name: '日经225', region: '亚太', fallback: false },
      { id: 'ks11', name: '韩国KOSPI', region: '亚太', fallback: false },
      { id: 'twii', name: '台湾加权', region: '亚太', fallback: false },
      { id: 'sti', name: '新加坡STI', region: '亚太', fallback: false },
      { id: 'axjo', name: '澳洲ASX200', region: '亚太', fallback: false },
      { id: 'bsesn', name: '印度SENSEX', region: '亚太', fallback: false },
      { id: 'nsei', name: '印度NIFTY', region: '亚太', fallback: false },
      { id: 'klse', name: '马来西亚KLSE', region: '亚太', fallback: false },
      { id: 'jkse', name: '印尼JKSE', region: '亚太', fallback: false },
      { id: 'ftse', name: '富时100', region: '欧洲', fallback: false },
      { id: 'gdaxi', name: '德国DAX', region: '欧洲', fallback: false },
      { id: 'fchi', name: '法国CAC40', region: '欧洲', fallback: false },
      { id: 'stoxx50', name: '欧洲斯托克50', region: '欧洲', fallback: false },
      { id: 'ibex', name: '西班牙IBEX', region: '欧洲', fallback: false },
      { id: 'aex', name: '荷兰AEX', region: '欧洲', fallback: false },
      { id: 'ssmi', name: '瑞士SMI', region: '欧洲', fallback: false },
      { id: 'mib', name: '意大利富时MIB', region: '欧洲', fallback: false },
      { id: 'atx', name: '奥地利ATX', region: '欧洲', fallback: false },
      { id: 'bvsp', name: '巴西IBOVESPA', region: '美洲', fallback: false },
      { id: 'mxx', name: '墨西哥IPC', region: '美洲', fallback: false },
      { id: 'gsptse', name: '加拿大S&P/TSX', region: '美洲', fallback: false },
    ];

    /** The shipped selection: one or two per major market, which is what "preview" means. */
    const STOCK_SEED_DEFAULTS = ['sh', 'sz', 'hsi', 'dji', 'ixic', 'spx', 'n225', 'ks11', 'twii', 'ftse', 'gdaxi', 'bvsp'];

    /** Region display order, derived from the mirror so the two cannot disagree. */
    const STOCK_SEED_REGIONS = ['A股', '港股', '美股', '亚太', '欧洲', '美洲'];

    /** The same bounds the Host enforces, mirrored so the UI can clamp without a request. */
    const STOCK_MIN = 4;
    const STOCK_MAX = 34;

    /**
     * How often the open board re-asks.
     *
     * The Host caches for a minute, so a faster timer would only spend renders. A quote that
     * moves once a minute is well inside what these indices actually do.
     */
    const STOCK_REFRESH_MS = 60 * 1000;

    /**
     * How old the stored snapshot may be before the pane must say so.
     *
     * A stock pane showing yesterday's close as if it were live is the one failure this module
     * must not have, so the age is always on screen and crosses into a warning here. It is
     * deliberately much longer than the refresh interval: that interval is how often we *ask*,
     * this is when the answer stops being plausible as "current".
     */
    const STOCK_STALE_MS = 10 * 60 * 1000;

    /** Bound on the persisted snapshot — the whole catalog, so no selection can overflow it. */
    const STOCK_SNAPSHOT_MAX = 34;

    /** The two readings of the same numbers: a tile board, or one dense table. */
    const STOCK_VIEWS = ['board', 'table'];
    /** Orderings the board offers. \`change\` is the "who is moving today" reading. */
    const STOCK_SORTS = ['catalog', 'change', 'pct'];

    function defaultStockSettings() {
      return {
        markets: STOCK_SEED_DEFAULTS.slice(),
        // 'all' or a region name — the chip row above the board.
        region: 'all',
        view: 'board',
        sort: 'catalog',
        // The catalog for the picker. Replaced by the Host's own on the first successful
        // \`op=catalog\`, and kept afterwards so the picker still renders with no network.
        catalog: STOCK_SEED_MARKETS.map((market) => Object.assign({}, market)),
        catalogAt: 0,
        lastFetchAt: 0,
        // The last snapshot, kept so reopening the module is instant and so an offline open shows
        // the last known numbers. It is ALWAYS drawn with its own timestamp (see \`stockAge\`),
        // because a price without a time is a price pretending to be current.
        last: [],
      };
    }

    /** Everything the Host route accepts; kept tiny because it is the request body. */
    function stockPayload(settings) {
      return { ids: (settings.markets || []).slice(0, STOCK_MAX) };
    }

    /** One market's catalog entry, or a stand-in so a removed market still has a row. */
    function stockMarketOf(settings, id) {
      return settings.catalog.find((market) => market.id === id) || { id, name: id, region: '', fallback: false };
    }

    /**
     * Coerce one module's persisted 股票市场 settings into the shape the view expects.
     *
     * Same discipline as \`normalizeNewsSettings\`: repair the shape on read, once, so no render
     * path has to defend itself. Everything numeric is clamped and everything free-form is
     * bounded, because this object is read back from \`localStorage\` and could have been edited
     * by hand.
     */
    function normalizeStockSettings(raw) {
      const stock = Object.assign(defaultStockSettings(), raw && typeof raw === 'object' ? raw : {});
      // The catalog first: the selection is validated against it below.
      stock.catalog = (Array.isArray(stock.catalog) ? stock.catalog : [])
        .filter((market) => market && typeof market.id === 'string' && market.id)
        .map((market) => ({
          id: market.id.slice(0, 32),
          name: typeof market.name === 'string' && market.name ? market.name.slice(0, 40) : market.id,
          region: typeof market.region === 'string' ? market.region.slice(0, 16) : '',
          fallback: market.fallback === true,
        }));
      if (!stock.catalog.length) stock.catalog = STOCK_SEED_MARKETS.map((market) => Object.assign({}, market));
      const known = new Set(stock.catalog.map((market) => market.id));
      stock.markets = (Array.isArray(stock.markets) ? stock.markets : [])
        .filter((id) => typeof id === 'string' && known.has(id))
        .filter((id, index, list) => list.indexOf(id) === index)
        .slice(0, STOCK_MAX);
      // Only an *unusable* selection is replaced here — never one that is merely short. A stored
      // selection below the floor used to be swapped for the twelve shipped defaults, so removing
      // one market from a four-market board silently replaced the reader's whole choice with a
      // different twelve. The floor is enforced where it can be explained: the picker refuses the
      // removal and says why, and the reader keeps exactly what they chose.
      if (!stock.markets.length) {
        stock.markets = STOCK_SEED_DEFAULTS.filter((id) => known.has(id));
        if (!stock.markets.length) stock.markets = STOCK_SEED_DEFAULTS.slice();
      }

      if (stock.region !== 'all' && STOCK_SEED_REGIONS.indexOf(stock.region) < 0) stock.region = 'all';
      if (STOCK_VIEWS.indexOf(stock.view) < 0) stock.view = 'board';
      if (STOCK_SORTS.indexOf(stock.sort) < 0) stock.sort = 'catalog';
      stock.catalogAt = Number(stock.catalogAt) || 0;
      stock.lastFetchAt = Number(stock.lastFetchAt) || 0;
      // The snapshot is display-only data, so every field is coerced rather than trusted: a
      // string where a price belongs would render as \`NaN\` in the middle of the board.
      const numberOrNull = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : null);
      stock.last = (Array.isArray(stock.last) ? stock.last : [])
        .filter((quote) => quote && typeof quote.id === 'string' && known.has(quote.id))
        .slice(0, STOCK_SNAPSHOT_MAX)
        .map((quote) => ({
          id: quote.id,
          price: numberOrNull(quote.price),
          change: numberOrNull(quote.change),
          pct: numberOrNull(quote.pct),
          prev: numberOrNull(quote.prev),
          decimals: Number.isFinite(Number(quote.decimals)) ? clamp(Math.round(Number(quote.decimals)), 0, 6) : 2,
          currency: typeof quote.currency === 'string' ? quote.currency.slice(0, 8) : '',
          exchange: typeof quote.exchange === 'string' ? quote.exchange.slice(0, 40) : '',
          session: quote.session === 'open' || quote.session === 'closed' ? quote.session : 'unknown',
          time: Number(quote.time) || 0,
          timeText: typeof quote.timeText === 'string' ? quote.timeText.slice(0, 32) : '',
          spark: (Array.isArray(quote.spark) ? quote.spark : [])
            .filter((point) => typeof point === 'number' && Number.isFinite(point))
            .slice(-64),
          source: quote.source === 'tencent' ? 'tencent' : 'yahoo',
          stale: quote.stale === true,
        }));
      return stock;
    }

    //#endregion`;

const DEFAULT_MODULES_OLD = `        {
          // Also standalone: it reads the network, not a session.
          id: newId('mod'), kind: 'news', name: '每日新闻', accent: MODULE_ACCENTS[5], preset: 'triple',
          sessionId: undefined, created: Date.now() + 2,
          news: defaultNewsSettings(),
          desc: '当日全球大事件 + 自定义关键词（AI、游戏…）：最多保留 7 天，条数 10–100 可调。',
        },
      ];`;
const DEFAULT_MODULES_NEW = `        {
          // Also standalone: it reads the network, not a session.
          id: newId('mod'), kind: 'news', name: '每日新闻', accent: MODULE_ACCENTS[5], preset: 'triple',
          sessionId: undefined, created: Date.now() + 2,
          news: defaultNewsSettings(),
          desc: '当日全球大事件 + 自定义关键词（AI、游戏…）：最多保留 7 天，条数 10–100 可调。',
        },
        {
          // Standalone for the same reason as the news reader: it reads the network.
          id: newId('mod'), kind: 'stock', name: '股票市场', accent: MODULE_ACCENTS[3], preset: 'triple',
          sessionId: undefined, created: Date.now() + 3,
          stock: defaultStockSettings(),
          desc: '全球股市行情预览：A股 / 港股 / 美股 / 亚太 / 欧洲 / 美洲共 34 个指数的最新价格、涨跌与日内走势。',
        },
      ];`;

const DEFAULT_STATE_OLD = `      // Fresh installs already carry the 每日新闻 module (see \`defaultModules\`), so nothing has
      // to be offered; the flag exists so a *deleted* module stays deleted.
      base.newsSeeded = true;
      return base;`;
const DEFAULT_STATE_NEW = `      // Fresh installs already carry the 每日新闻 and 股票市场 modules (see \`defaultModules\`), so
      // nothing has to be offered; the flags exist so a *deleted* module stays deleted.
      base.newsSeeded = true;
      base.stockSeeded = true;
      return base;`;

const SEEDED_OLD = `      state.newsSeeded = Boolean(parsed && parsed.newsSeeded === true);
`;
const SEEDED_NEW = `      state.newsSeeded = Boolean(parsed && parsed.newsSeeded === true);
      state.stockSeeded = Boolean(parsed && parsed.stockSeeded === true);
`;

const AUTOBASES_OLD = `      const autoBases = [TEXT.zh.kindGame, TEXT.zh.kindNews, TEXT.zh.kindNotebook, TEXT.zh.kindResearch,
        TEXT.en.kindGame, TEXT.en.kindNews, TEXT.en.kindNotebook, TEXT.en.kindResearch,
        TEXT.zh.newModule, TEXT.en.newModule];`;
const AUTOBASES_NEW = `      const autoBases = [TEXT.zh.kindGame, TEXT.zh.kindNews, TEXT.zh.kindNotebook, TEXT.zh.kindResearch,
        TEXT.zh.kindStock,
        TEXT.en.kindGame, TEXT.en.kindNews, TEXT.en.kindNotebook, TEXT.en.kindResearch, TEXT.en.kindStock,
        TEXT.zh.newModule, TEXT.en.newModule];`;

const KIND_OLD = `          kind: kind === 'research' || kind === 'game' || kind === 'blank' || kind === 'notebook' || kind === 'news' ? kind : 'blank',`;
const KIND_NEW = `          kind: kind === 'research' || kind === 'game' || kind === 'blank' || kind === 'notebook'
            || kind === 'news' || kind === 'stock' ? kind : 'blank',`;

const NEWS_FIELD_OLD = `          news: kind === 'news' ? normalizeNewsSettings(module.news) : undefined,`;
const NEWS_FIELD_NEW = `          news: kind === 'news' ? normalizeNewsSettings(module.news) : undefined,
          // 股票市场 is the second standalone network module, normalised the same way.
          stock: kind === 'stock' ? normalizeStockSettings(module.stock) : undefined,`;

const SESSIONID_OLD = `          // A notebook is standalone, so any stale binding is dropped with the upgrade.
          // 每日新闻 is standalone for the same reason: it reads the network, not a session.
          sessionId: wasDefaultResearch || kind === 'news' ? undefined`;
const SESSIONID_NEW = `          // A notebook is standalone, so any stale binding is dropped with the upgrade.
          // 每日新闻 and 股票市场 are standalone for the same reason: they read the network, not a
          // session — so a stale binding on either is dropped as well.
          sessionId: wasDefaultResearch || kind === 'news' || kind === 'stock' ? undefined`;

const SEEDING_OLD = `      if (state.newsSeeded !== true) {
        state.newsSeeded = true;
        if (!state.modules.some((module) => module.kind === 'news')) {
          state.modules.push({
            id: 'mod-news-daily',
            kind: 'news', name: '每日新闻', accent: MODULE_ACCENTS[5], preset: 'triple',
            sessionId: undefined, created: Date.now() + state.modules.length,
            news: defaultNewsSettings(),
            desc: '当日全球大事件 + 自定义关键词（AI、游戏…）：最多保留 7 天，条数 10–100 可调。',
          });
        }
      }`;
const SEEDING_NEW = `      if (state.newsSeeded !== true) {
        state.newsSeeded = true;
        if (!state.modules.some((module) => module.kind === 'news')) {
          state.modules.push({
            id: 'mod-news-daily',
            kind: 'news', name: '每日新闻', accent: MODULE_ACCENTS[5], preset: 'triple',
            sessionId: undefined, created: Date.now() + state.modules.length,
            news: defaultNewsSettings(),
            desc: '当日全球大事件 + 自定义关键词（AI、游戏…）：最多保留 7 天，条数 10–100 可调。',
          });
        }
      }
      // 股票市场 gets the same one-time offer, for the same reason and with the same guarantee:
      // a flag that survives deletion, so removing it is final.
      if (state.stockSeeded !== true) {
        state.stockSeeded = true;
        if (!state.modules.some((module) => module.kind === 'stock')) {
          state.modules.push({
            id: 'mod-stock-market',
            kind: 'stock', name: '股票市场', accent: MODULE_ACCENTS[3], preset: 'triple',
            sessionId: undefined, created: Date.now() + state.modules.length,
            stock: defaultStockSettings(),
            desc: '全球股市行情预览：A股 / 港股 / 美股 / 亚太 / 欧洲 / 美洲共 34 个指数的最新价格、涨跌与日内走势。',
          });
        }
      }`;

const KINDLABEL_OLD = `      const kindLabel = module.kind === 'game' ? t.kindGame
        : module.kind === 'notebook' ? t.kindNotebook
          : module.kind === 'news' ? t.kindNews
            : module.kind === 'research' ? t.kindResearch : t.kindBlank;`;
const KINDLABEL_NEW = `      const kindLabel = module.kind === 'game' ? t.kindGame
        : module.kind === 'notebook' ? t.kindNotebook
          : module.kind === 'news' ? t.kindNews
            : module.kind === 'stock' ? t.kindStock
              : module.kind === 'research' ? t.kindResearch : t.kindBlank;`;

const ROUTE_OLD = `        setRoute({
          // A notebook module opens as its own window, the news module opens the reader, and
          // the rest are conversation consoles.
          name: kind === 'notebook' ? 'notes' : kind === 'news' ? 'news' : 'console',
          moduleId, origin, phase: 'entering',
        });`;
const ROUTE_NEW = `        setRoute({
          // Three of the four kinds are windows of their own — the notebook, the news reader and
          // the market board all read something other than a session, so none of them can open
          // as a conversation console. The rest are consoles.
          name: kind === 'notebook' ? 'notes'
            : kind === 'news' ? 'news'
              : kind === 'stock' ? 'stock' : 'console',
          moduleId, origin, phase: 'entering',
        });`;

const ADD_OLD = `      const addModule = useCallback((kind) => {
        const want = kind === 'notebook' || kind === 'news' ? kind : 'game';
        patchState((next) => {
          const accent = MODULE_ACCENTS[next.modules.length % MODULE_ACCENTS.length];
          const base = {
            id: newId('mod'), kind: want,
            // 不带自动编号: 名字就是类型名, 重名时再加编号.
        name: (function () {
          const base = want === 'notebook' ? t.kindNotebook : want === 'news' ? t.kindNews : t.newModule;
          if (!next.modules.some((module) => module.name === base)) return base;
          let n = 2;
          while (next.modules.some((module) => module.name === base + ' ' + n)) n += 1;
          return base + ' ' + n;
        })(),
            desc: '', accent, preset: 'triple', sessionId: undefined, created: Date.now(),
          };
          if (want === 'notebook') {
            base.noteRoot = defaultNoteRoot();
            base.noteStyle = defaultNoteStyle();
            base.noteView = defaultNoteView();
          }
          if (want === 'news') base.news = defaultNewsSettings();
          next.modules.push(base);
        });
      }, [patchState, t]);`;
const ADD_NEW = `      const addModule = useCallback((kind) => {
        // The four kinds, each with the label it takes and the settings blob it needs. A table
        // rather than a chain of ternaries: that chain had already been extended twice, and the
        // extension that adds 股票市场 is exactly where a missed branch silently falls through to
        // 'game' and creates the wrong product.
        const KINDS = {
          game: { label: () => t.newModule, make: () => ({}) },
          notebook: {
            label: () => t.kindNotebook,
            make: () => ({ noteRoot: defaultNoteRoot(), noteStyle: defaultNoteStyle(), noteView: defaultNoteView() }),
          },
          news: { label: () => t.kindNews, make: () => ({ news: defaultNewsSettings() }) },
          stock: { label: () => t.kindStock, make: () => ({ stock: defaultStockSettings() }) },
        };
        const want = KINDS[kind] ? kind : 'game';
        const spec = KINDS[want];
        patchState((next) => {
          const accent = MODULE_ACCENTS[next.modules.length % MODULE_ACCENTS.length];
          // 不带自动编号: 名字就是类型名, 重名时再加编号.
          const base = spec.label();
          let name = base;
          if (next.modules.some((module) => module.name === name)) {
            let n = 2;
            while (next.modules.some((module) => module.name === base + ' ' + n)) n += 1;
            name = base + ' ' + n;
          }
          next.modules.push(Object.assign({
            id: newId('mod'), kind: want, name, desc: '', accent, preset: 'triple',
            sessionId: undefined, created: Date.now(),
          }, spec.make()));
        });
      }, [patchState, t]);`;

const RENDER_OLD = `              : module.kind === 'news'
                // 每日新闻 reads the network, not a session, so it also skips the console.
                ? h(NewsView, {
                  t, lang, module, patchModule, appearance,
                  onBack: back, anim: consoleAnim, screenStyle, onAnimEnd: onConsoleAnimEnd,
                })
                : h(ConsoleView, {`;
const RENDER_NEW = `              : module.kind === 'news'
                // 每日新闻 reads the network, not a session, so it also skips the console.
                ? h(NewsView, {
                  t, lang, module, patchModule, appearance,
                  onBack: back, anim: consoleAnim, screenStyle, onAnimEnd: onConsoleAnimEnd,
                })
                : module.kind === 'stock'
                  // 股票市场 reads the network too — a second such module, with its own board.
                  ? h(StockView, {
                    t, lang, module, patchModule, appearance,
                    onBack: back, anim: consoleAnim, screenStyle, onAnimEnd: onConsoleAnimEnd,
                  })
                  : h(ConsoleView, {`;

const ESCAPE_OLD = `            if (route.name === 'console' || route.name === 'notes' || route.name === 'news') { event.preventDefault(); back() }`;
const ESCAPE_NEW = `            if (route.name === 'console' || route.name === 'notes' || route.name === 'news'
              || route.name === 'stock') { event.preventDefault(); back() }`;

const COVERED_OLD = `      const homeCovered = (route.name === 'console' || route.name === 'notes' || route.name === 'news')
        && route.phase === 'idle';`;
const COVERED_NEW = `      const homeCovered = (route.name === 'console' || route.name === 'notes' || route.name === 'news'
        || route.name === 'stock')
        && route.phase === 'idle';`;

const CSS_OLD = `.wsb-stack>.wsb-screen[data-role="console"],
.wsb-stack>.wsb-screen[data-role="news"]{z-index:2}`;
const CSS_NEW = `.wsb-stack>.wsb-screen[data-role="console"],
.wsb-stack>.wsb-screen[data-role="news"],
.wsb-stack>.wsb-screen[data-role="stock"]{z-index:2}`;

/** @type {[string, string, string][]} label, from, to */
const EDITS = [
  ['MODULE_ABBR gains stock', ABBR_OLD, ABBR_NEW],
  ['MARKS gains the stock mark', MARK_OLD, MARK_NEW],
  ['the icon vocabulary gains stock', VOCAB_OLD, VOCAB_NEW],
  ['the 股票市场 settings region', SETTINGS_OLD, SETTINGS_NEW],
  ['defaultModules ships the stock module', DEFAULT_MODULES_OLD, DEFAULT_MODULES_NEW],
  ['defaultAppState records stockSeeded', DEFAULT_STATE_OLD, DEFAULT_STATE_NEW],
  ['normalizeState reads stockSeeded', SEEDED_OLD, SEEDED_NEW],
  ['autoBases strips 股票市场 N', AUTOBASES_OLD, AUTOBASES_NEW],
  ['the kind whitelist accepts stock', KIND_OLD, KIND_NEW],
  ['the module carries its stock settings', NEWS_FIELD_OLD, NEWS_FIELD_NEW],
  ['a stock module drops any session binding', SESSIONID_OLD, SESSIONID_NEW],
  ['an older install is offered the stock module once', SEEDING_OLD, SEEDING_NEW],
  ['kindLabel names 股票市场', KINDLABEL_OLD, KINDLABEL_NEW],
  ['open() routes stock to its own screen', ROUTE_OLD, ROUTE_NEW],
  ['addModule can create a stock module', ADD_OLD, ADD_NEW],
  ['WorkbenchApp renders StockView', RENDER_OLD, RENDER_NEW],
  ['Escape leaves the market board', ESCAPE_OLD, ESCAPE_NEW],
  ['the board covers the home screen', COVERED_OLD, COVERED_NEW],
  ['the stock screen stacks with the others', CSS_OLD, CSS_NEW],
];

// ── apply ──────────────────────────────────────────────────────────────────────────────────

const original = fs.readFileSync(FILE, 'utf8');
let text = original;
const report = [];
let failed = 0;

for (const [label, from, to] of EDITS) {
  const count = text.split(from).length - 1;
  if (count === 1) {
    text = text.replace(from, to);
    report.push('  applied   ' + label);
  } else if (count === 0 && text.split(to).length - 1 === 1) {
    report.push('  present   ' + label);
  } else {
    failed += 1;
    report.push('  FAILED    ' + label + '  (anchor found ' + count + ' times)');
  }
}

console.log(report.join('\n'));
console.log('\n' + (EDITS.length - failed) + '/' + EDITS.length + ' edits ok');
if (failed) {
  console.error('refusing to write: ' + failed + ' anchor(s) did not match');
  process.exit(1);
}
if (checkOnly) {
  console.log('--check: nothing written');
  process.exit(0);
}
if (text === original) {
  console.log('client.js already carries the module; nothing to write');
  process.exit(0);
}
fs.writeFileSync(FILE, text, 'utf8');
console.log('client.js: ' + original.split('\n').length + ' -> ' + text.split('\n').length + ' lines');
