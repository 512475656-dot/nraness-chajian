/**
 * Host half of the 股票市场 (Stock Market) module — the quote engine.
 *
 * The module's whole promise is one sentence: *show the latest price of every stock market*.
 * Everything here exists to make that sentence true and to keep it honest.
 *
 * ## Why the Host does the fetching
 *
 * Same reason as 每日新闻 (`news.js`): the GUI is a page on `http://127.0.0.1:<port>`, every
 * quote endpoint is another origin with no CORS header, and on this machine the international
 * ones are only reachable through the system proxy — which a browser `fetch` cannot even be
 * told about. The browser therefore asks one same-origin route (`/workbench-stocks`) and this
 * file does the talking, over the shared client in `net.js`.
 *
 * ## Two sources, on purpose
 *
 * | source | covers | needs a proxy | gives an exact instant |
 * | --- | --- | --- | --- |
 * | Yahoo `chart` (primary) | every market below, incl. Europe/Korea/Taiwan/India | yes | yes (`regularMarketTime`) |
 * | 腾讯 `qt.gtimg.cn` (fallback) | A股 / 港股 / 美股 only | no | no (see {@link parseTencent}) |
 *
 * The split is not redundancy for its own sake. Yahoo is the only public source found that
 * answers for *all* of Europe and Asia in one shape, and it is blocked without a proxy on this
 * network; Tencent answers directly, from inside the country, for the three markets most
 * readers look at first. So a machine with no proxy still boots into a working pane showing
 * 上证 / 深证 / 恒生 / 道琼斯 / 纳斯达克 / 标普 rather than an error — and the row says which
 * source answered, because "this number came from the fallback" is a fact the reader is
 * entitled to.
 *
 * ## The three rules this file keeps
 *
 * 1. **No user-supplied URL ever crosses the boundary.** The Client sends market *ids*; ids are
 *    resolved against {@link STOCK_CATALOG} here, and only the `yahoo`/`tencent` fields of a
 *    catalog entry are ever fetched. Without that the route would be an open proxy that any
 *    page in the browser could point at the local network.
 * 2. **Failure is partial and reported.** One dead symbol must not empty the pane: every market
 *    resolves independently and its error is returned in `stats.errors`, so the Client can show
 *    "3 个市场抓取失败" beside thirteen live ones instead of a blank screen.
 * 3. **A stale number is labelled, never silently passed off as current.** Each row carries the
 *    exchange's own quote time; the Client prints it. See `time` / `timeText` below.
 *
 * ## What this file deliberately does NOT do
 *
 * No `lastFetchAt`-based "is the market open" guesswork: {@link sessionOf} reads the exchange's
 * own published trading session out of the Yahoo payload when it is there, and reports
 * `'unknown'` when it is not, rather than inferring a schedule from a clock and a country.
 */

import { httpGet } from './net.js';

/** How few markets a query may ask for. Below this the pane is not "every market" any more. */
export const MIN_MARKETS = 4;

/** The catalog size — asking for more than exists is clamped, not rejected. */
export const MAX_MARKETS = 34;

/**
 * How long a quote is reused.
 *
 * Quotes move, so this is short — but not zero. The pane refreshes on a timer and the reader
 * can hit 刷新 as often as they like; without a cache each press would be one HTTP request per
 * market, which is exactly how a free endpoint starts answering `socket hang up`. One minute is
 * finer than any of these indices is *displayed* at, and in-flight coalescing below means a
 * double press costs nothing extra.
 */
const QUOTE_TTL_MS = 60 * 1000;

/** How long a *failed* symbol is remembered, so a broken one cannot be retry-stormed. */
const QUOTE_ERROR_TTL_MS = 30 * 1000;

/** Bound on distinct symbols held in memory. The catalog is smaller than this by design. */
const CACHE_MAX_ENTRIES = 96;

/**
 * Parallel Yahoo requests.
 *
 * Six is below the browser's usual lane count on purpose: this endpoint rate-limits per IP, and
 * a burst of thirty at once is what produced `socket hang up` while this module was being
 * built. Six lanes over ~14 symbols is under three seconds in practice.
 */
const CONCURRENCY = 6;

/** Wall-clock ceiling for one aggregated query; whatever answered is returned. */
const OVERALL_DEADLINE_MS = 15000;

/** Per-request deadline. Shorter than a feed's: a quote that takes 12 s is not "latest". */
const QUOTE_TIMEOUT_MS = 9000;

/** Largest quote payload read. A 1-day intraday series is ~3 KB; this is 100× headroom. */
const MAX_QUOTE_BYTES = 300_000;

/** Points kept for the sparkline. A 15-minute series is ~27 points; this bounds a bad day. */
const SPARK_MAX = 48;

/** How many timed-out markets make this look like a blocked network rather than a slow one. */
const BLOCKED_HINT_THRESHOLD = 3;

/**
 * The market catalog — the model's entire vocabulary.
 *
 * Every entry was fetched and parsed before being listed, and the ones whose numbers did not
 * look like the index they claim to be were dropped: `^SET` on Yahoo resolves to an instrument
 * on "Chicago Options" quoted in USD with a value ten times the Thai SET, so 泰国SET is simply
 * not offered. A wrong number is worse than a missing row.
 *
 * `yahoo` is the primary symbol; `tencent` is the no-proxy fallback code, present only for the
 * three markets that endpoint covers. `decimals` is per market because 上证 is quoted to two
 * places and 韩国KOSPI to two as well, while 日经 runs to two and 巴西 to two — the field exists
 * so a future market with a different convention does not have to be special-cased in the UI.
 */
export const STOCK_CATALOG = [
  // ── A股 ────────────────────────────────────────────────────────────────────
  { id: 'sh', name: '上证指数', region: 'A股', yahoo: '000001.SS', tencent: 'sh000001', decimals: 2 },
  { id: 'sz', name: '深证成指', region: 'A股', yahoo: '399001.SZ', tencent: 'sz399001', decimals: 2 },
  { id: 'cyb', name: '创业板指', region: 'A股', yahoo: '399006.SZ', tencent: 'sz399006', decimals: 2 },
  { id: 'hs300', name: '沪深300', region: 'A股', yahoo: '000300.SS', tencent: 'sh000300', decimals: 2 },
  { id: 'kc50', name: '科创50', region: 'A股', yahoo: '000688.SS', tencent: 'sh000688', decimals: 2 },

  // ── 港股 ───────────────────────────────────────────────────────────────────
  { id: 'hsi', name: '恒生指数', region: '港股', yahoo: '^HSI', tencent: 'hkHSI', decimals: 2 },
  { id: 'hscei', name: '国企指数', region: '港股', yahoo: '^HSCE', tencent: 'hkHSCEI', decimals: 2 },

  // ── 美股 ───────────────────────────────────────────────────────────────────
  { id: 'dji', name: '道琼斯', region: '美股', yahoo: '^DJI', tencent: 'usDJI', decimals: 2 },
  { id: 'ixic', name: '纳斯达克', region: '美股', yahoo: '^IXIC', tencent: 'usIXIC', decimals: 2 },
  { id: 'spx', name: '标普500', region: '美股', yahoo: '^GSPC', tencent: 'usINX', decimals: 2 },
  { id: 'ndx', name: '纳斯达克100', region: '美股', yahoo: '^NDX', tencent: 'usNDX', decimals: 2 },
  { id: 'rut', name: '罗素2000', region: '美股', yahoo: '^RUT', decimals: 2 },
  { id: 'vix', name: '标普波动率', region: '美股', yahoo: '^VIX', tencent: 'usVIX', decimals: 2 },

  // ── 亚太 ───────────────────────────────────────────────────────────────────
  { id: 'n225', name: '日经225', region: '亚太', yahoo: '^N225', decimals: 2 },
  { id: 'ks11', name: '韩国KOSPI', region: '亚太', yahoo: '^KS11', decimals: 2 },
  { id: 'twii', name: '台湾加权', region: '亚太', yahoo: '^TWII', decimals: 2 },
  { id: 'sti', name: '新加坡STI', region: '亚太', yahoo: '^STI', decimals: 2 },
  { id: 'axjo', name: '澳洲ASX200', region: '亚太', yahoo: '^AXJO', decimals: 2 },
  { id: 'bsesn', name: '印度SENSEX', region: '亚太', yahoo: '^BSESN', decimals: 2 },
  { id: 'nsei', name: '印度NIFTY', region: '亚太', yahoo: '^NSEI', decimals: 2 },
  { id: 'klse', name: '马来西亚KLSE', region: '亚太', yahoo: '^KLSE', decimals: 2 },
  { id: 'jkse', name: '印尼JKSE', region: '亚太', yahoo: '^JKSE', decimals: 2 },

  // ── 欧洲 ───────────────────────────────────────────────────────────────────
  { id: 'ftse', name: '富时100', region: '欧洲', yahoo: '^FTSE', decimals: 2 },
  { id: 'gdaxi', name: '德国DAX', region: '欧洲', yahoo: '^GDAXI', decimals: 2 },
  { id: 'fchi', name: '法国CAC40', region: '欧洲', yahoo: '^FCHI', decimals: 2 },
  { id: 'stoxx50', name: '欧洲斯托克50', region: '欧洲', yahoo: '^STOXX50E', decimals: 2 },
  { id: 'ibex', name: '西班牙IBEX', region: '欧洲', yahoo: '^IBEX', decimals: 2 },
  { id: 'aex', name: '荷兰AEX', region: '欧洲', yahoo: '^AEX', decimals: 2 },
  { id: 'ssmi', name: '瑞士SMI', region: '欧洲', yahoo: '^SSMI', decimals: 2 },
  { id: 'mib', name: '意大利富时MIB', region: '欧洲', yahoo: 'FTSEMIB.MI', decimals: 2 },
  { id: 'atx', name: '奥地利ATX', region: '欧洲', yahoo: '^ATX', decimals: 2 },

  // ── 美洲（美股之外） ────────────────────────────────────────────────────────
  { id: 'bvsp', name: '巴西IBOVESPA', region: '美洲', yahoo: '^BVSP', decimals: 2 },
  { id: 'mxx', name: '墨西哥IPC', region: '美洲', yahoo: '^MXX', decimals: 2 },
  { id: 'gsptse', name: '加拿大S&P/TSX', region: '美洲', yahoo: '^GSPTSE', decimals: 2 },
];

const MARKET_BY_ID = new Map(STOCK_CATALOG.map((market) => [market.id, market]));

/** The regions in the order the UI groups them, derived so the two can never disagree. */
export const STOCK_REGIONS = [...new Set(STOCK_CATALOG.map((market) => market.region))];

/**
 * What a fresh module shows.
 *
 * One or two per major market rather than all thirty-four: the pane's job is a *preview* of
 * every market at a glance, and thirty-four rows is a page of scrolling, not a glance. Every
 * other market is one click away in the picker, and the choice is remembered per module.
 */
export const DEFAULT_MARKETS = [
  'sh', 'sz', 'hsi',
  'dji', 'ixic', 'spx',
  'n225', 'ks11', 'twii',
  'ftse', 'gdaxi',
  'bvsp',
];

//#region cache

/**
 * Per-symbol quote cache with in-flight coalescing.
 *
 * Two maps, not one: `quoteCache` holds settled results (successes for {@link QUOTE_TTL_MS},
 * failures for {@link QUOTE_ERROR_TTL_MS}), while `inflight` holds promises for fetches
 * currently running. Without the second map, two overlapping refreshes — a timer firing while
 * the reader presses 刷新 — would each start their own request for the same index.
 */
const quoteCache = new Map();
const inflight = new Map();

/** Evict the oldest entries once the cache is over its bound. Insertion order is age order. */
function trimCache() {
  while (quoteCache.size > CACHE_MAX_ENTRIES) {
    const oldest = quoteCache.keys().next();
    if (oldest.done) return;
    quoteCache.delete(oldest.value);
  }
}

/** Read one symbol from the cache when it is still fresh for its own outcome. */
function cachedQuote(symbol) {
  const hit = quoteCache.get(symbol);
  if (!hit) return null;
  const ttl = hit.error ? QUOTE_ERROR_TTL_MS : QUOTE_TTL_MS;
  return Date.now() - hit.at < ttl ? hit : null;
}

//#endregion

//#region parsing

/**
 * The Yahoo `chart` request for one symbol.
 *
 * `range=1d&interval=15m` is the shape that answers both questions the pane asks at once: the
 * current level (in `meta`) and an intraday shape for the sparkline (in `indicators`). It costs
 * ~3 KB per symbol, against ~12 KB for the 5-day series — and the 5-day series is worse for
 * this job, because its `chartPreviousClose` is the close *before the window*, which is not
 * yesterday's close. That one cost two numbers that disagreed with every other source until it
 * was noticed.
 */
function yahooUrl(symbol) {
  return 'https://query1.finance.yahoo.com/v8/finance/chart/'
    + encodeURIComponent(symbol) + '?interval=15m&range=1d';
}

/** A finite number, or NaN. Yahoo mixes numbers, `null` and absent keys freely. */
function num(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : NaN;
}

/**
 * Whether the exchange says it is trading right now.
 *
 * Read from the exchange's own published session (`currentTradingPeriod.regular`), not inferred
 * from a clock and a country — a market with an unplanned closure, a half day or a holiday this
 * code has never heard of would make an inferred answer wrong, and a wrong "交易中" is worse
 * than "未知". Returns `'unknown'` whenever the payload does not carry the session.
 */
function sessionOf(meta, nowMs) {
  const regular = meta && meta.currentTradingPeriod && meta.currentTradingPeriod.regular;
  const start = regular ? num(regular.start) : NaN;
  const end = regular ? num(regular.end) : NaN;
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 'unknown';
  const seconds = nowMs / 1000;
  return seconds >= start && seconds <= end ? 'open' : 'closed';
}

/**
 * Turn one Yahoo `chart` payload into a quote row, or throw with a reason.
 *
 * The change is derived rather than read: this endpoint returns
 * `regularMarketChangePercent` but **not** `regularMarketChange` (only a `fulldayChange` that is
 * absent outside the regular session). Deriving `price - previousClose` matching the published
 * percent to the digit is what proves `previousClose` is really yesterday's close — the 5-day
 * range's `chartPreviousClose` does not, and using it put 上证's previous close at 3823.62
 * instead of 3811.90.
 */
export function parseYahoo(payload, market, nowMs) {  const result = payload && payload.chart && Array.isArray(payload.chart.result)
    ? payload.chart.result[0] : null;
  const meta = result && result.meta ? result.meta : null;
  if (!meta) {
    const reason = payload && payload.chart && payload.chart.error
      ? (payload.chart.error.description || payload.chart.error.code) : '响应里没有行情数据';
    throw new Error(String(reason));
  }
  const price = num(meta.regularMarketPrice);
  if (!Number.isFinite(price)) throw new Error('响应里没有价格');
  const prevRaw = num(meta.previousClose);
  const prev = Number.isFinite(prevRaw) ? prevRaw : num(meta.chartPreviousClose);
  const change = Number.isFinite(prev) ? price - prev : NaN;
  // Prefer the endpoint's own percent; derive only when it is missing, so a rounding difference
  // in `previousClose` cannot move the number the reader compares against every other site.
  const published = num(meta.regularMarketChangePercent);
  const pct = Number.isFinite(published) ? published
    : (Number.isFinite(change) && prev > 0 ? (change / prev) * 100 : NaN);

  // The intraday series is the sparkline. `timestamp` and `quote.close` are parallel arrays and
  // gaps arrive as `null` in the middle (a halt, or a bar with no trade), so the pairing has to
  // survive them — dropping nulls from the closes alone would shift every later point in time.
  const stamps = result.timestamp || [];
  const closes = (result.indicators && result.indicators.quote && result.indicators.quote[0]
    && result.indicators.quote[0].close) || [];
  const spark = [];
  for (let index = 0; index < closes.length && index < stamps.length; index += 1) {
    const point = num(closes[index]);
    if (Number.isFinite(point) && point > 0) spark.push(point);
  }

  return {
    price,
    change,
    pct,
    prev,
    currency: typeof meta.currency === 'string' ? meta.currency : '',
    exchange: String(meta.fullExchangeName || meta.exchangeName || ''),
    decimals: market.decimals,
    session: sessionOf(meta, nowMs),
    // Seconds in the payload, milliseconds everywhere in this plugin.
    time: Number.isFinite(num(meta.regularMarketTime)) ? num(meta.regularMarketTime) * 1000 : 0,
    timeText: '',
    spark: spark.slice(-SPARK_MAX),
  };
}

/** Escape a string for literal use inside a RegExp. Tencent symbols contain `^`-free dots only,
 *  but the escape is the difference between "today's codes work" and "a code with a dot works". */
function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Turn one 腾讯 `qt.gtimg.cn` payload into rows keyed by catalog id.
 *
 * The `~`-separated fields this reads, all verified against live A股 / 港股 / 美股 rows:
 *
 *   | index | meaning |
 *   | --- | --- |
 *   | 1 | name |
 *   | 3 | last |
 *   | 4 | previous close |
 *   | 30 | the source's own stamp, **in the exchange's local wall clock, in three formats** |
 *   | 31 | change |
 *   | 32 | change percent |
 *
 * Index 31/32 are read when present and derived from 3/4 when not, because a quoted change and
 * a computed one can differ by one tick of rounding and the quoted one is what the source shows.
 *
 * `time` is deliberately `0` for these rows. The stamp is a wall clock with no offset, written
 * as `YYYYMMDDHHMMSS` for A股, `YYYY/MM/DD HH:MM:SS` for 港股 and `YYYY-MM-DD HH:MM:SS` for 美股
 * — three formats and two timezones, with nothing in the payload saying which. Converting it to
 * an instant would mean guessing, and a "数据时间" that is thirteen hours out on 道琼斯 is worse
 * than none. {@link normaliseStamp} keeps it as text and the Client labels it as the exchange's
 * local time, which is exactly what it is.
 */
export function parseTencent(text, markets) {
  const out = new Map();
  for (const market of markets) {
    const match = new RegExp('v_' + escapeRegExp(market.tencent) + '="([^"]*)"').exec(text);
    if (!match) continue;
    const body = match[1];
    const parts = body.split('~');
    if (parts.length < 6) continue;
    const price = Number(parts[3]);
    const prev = Number(parts[4]);
    if (!Number.isFinite(price) || price <= 0) continue;
    const derivedChange = Number.isFinite(prev) && prev > 0 ? price - prev : NaN;
    const derivedPct = Number.isFinite(derivedChange) && prev > 0 ? (derivedChange / prev) * 100 : NaN;
    const quotedChange = Number(parts[31]);
    const quotedPct = Number(parts[32]);
    out.set(market.id, {
      price,
      change: Number.isFinite(quotedChange) ? quotedChange : derivedChange,
      pct: Number.isFinite(quotedPct) ? quotedPct : derivedPct,
      prev: Number.isFinite(prev) ? prev : NaN,
      currency: '',
      exchange: parts[1] || '',
      decimals: market.decimals,
      session: 'unknown',
      time: 0,
      timeText: normaliseStamp(parts[30]),
      // This endpoint answers a snapshot, not a series: no sparkline, and none is invented.
      spark: [],
    });
  }
  return out;
}

/** `20261009161400` / `2026/10/09 18:31:07` / `2026-10-09 16:37:50` → `2026-10-09 16:14:00`. */
export function normaliseStamp(raw) {
  const text = String(raw || '').trim();
  let match = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(text);
  if (match) return match[1] + '-' + match[2] + '-' + match[3] + ' ' + match[4] + ':' + match[5] + ':' + match[6];
  match = /^(\d{4})[/-](\d{2})[/-](\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(text);
  if (match) return match[1] + '-' + match[2] + '-' + match[3] + ' ' + match[4] + ':' + match[5] + ':' + match[6];
  return '';
}

//#endregion

//#region loading

/** One Yahoo symbol, from the cache when fresh, coalesced while in flight. Never rejects. */
async function loadYahoo(market, refresh) {
  const symbol = market.yahoo;
  if (!refresh) {
    const hit = cachedQuote(symbol);
    if (hit) {
      return { quote: hit.quote, error: hit.error, cached: true, ms: 0, via: hit.via || 'yahoo' };
    }
  }
  const running = inflight.get(symbol);
  if (running) return running;

  const pending = (async () => {
    const started = Date.now();
    const previous = quoteCache.get(symbol);
    try {
      const response = await httpGet(yahooUrl(symbol), {
        timeoutMs: QUOTE_TIMEOUT_MS,
        maxBytes: MAX_QUOTE_BYTES,
        accept: 'application/json, */*;q=0.8',
        // A proxy the user has since closed must not take the domestic markets down with it.
        fallbackDirect: true,
      });
      const quote = parseYahoo(JSON.parse(response.text), market, Date.now());
      quote.via = 'yahoo';
      quote.proxies = response.proxies;
      const entry = { at: Date.now(), quote, error: '', via: 'yahoo' };
      quoteCache.set(symbol, entry);
      trimCache();
      return { quote, error: '', cached: false, ms: Date.now() - started, via: 'yahoo' };
    } catch (error) {
      const message = error && error.message ? error.message : '抓取失败';
      quoteCache.set(symbol, { at: Date.now(), quote: null, error: message, via: 'yahoo' });
      trimCache();
      // A stale success is better than a blank card: keep serving the last number while telling
      // the caller — and the UI — that this refresh did not reach the source. `stale` is what
      // stops the pane from presenting it as current.
      const stale = previous && previous.quote ? previous.quote : null;
      return { quote: stale, error: message, cached: Boolean(stale), stale: Boolean(stale), ms: Date.now() - started, via: 'yahoo' };
    }
  })();

  inflight.set(symbol, pending);
  try { return await pending } finally { inflight.delete(symbol) }
}

/**
 * The 腾讯 fallback, one request for every market it can answer.
 *
 * Kept as a single batch rather than per-market because the endpoint supports it and because a
 * fallback that costs twelve requests is not a fallback anyone wants to trigger.
 */
async function loadTencent(markets, refresh) {
  const codes = markets.map((market) => market.tencent).filter(Boolean);
  if (!codes.length) return { quotes: new Map(), error: '', cached: false, ms: 0 };
  const key = 'tencent:' + codes.join(',');
  if (!refresh) {
    const hit = cachedQuote(key);
    if (hit) return { quotes: hit.quotes || new Map(), error: hit.error || '', cached: true, ms: 0 };
  }
  const started = Date.now();
  try {
    const response = await httpGet('https://qt.gtimg.cn/q=' + codes.join(','), {
      timeoutMs: QUOTE_TIMEOUT_MS,
      maxBytes: MAX_QUOTE_BYTES,
      accept: 'text/plain, */*;q=0.8',
      // GBK, declared only in the `content-type` header and absent from the body entirely.
      // Asking the client for it is the whole fix: decoding this payload as UTF-8 and then
      // trying to recover the bytes does not work, because a mangled 2-byte character comes
      // back as one byte and the `~`-separated fields re-pair one position over — which put
      // 恒生指数's *previous close* where its last price belongs and its *high* where its
      // change percent belongs. Verified wrong, then verified right, against live rows.
      charset: 'gb18030',
      fallbackDirect: true,
    });
    const quotes = parseTencent(response.text, markets);
    const entry = { at: Date.now(), quotes, error: '', via: 'tencent' };
    quoteCache.set(key, entry);
    trimCache();
    return { quotes, error: '', cached: false, ms: Date.now() - started };
  } catch (error) {
    const message = error && error.message ? error.message : '备用源抓取失败';
    quoteCache.set(key, { at: Date.now(), quotes: null, error: message, via: 'tencent' });
    trimCache();
    return { quotes: new Map(), error: message, cached: false, ms: Date.now() - started };
  }
}

/** Run `worker` over `items` with a fixed number of parallel lanes, order preserved. */
async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const lanes = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(lanes);
  return results;
}

//#endregion

//#region query

/** Clamp a number from an untrusted request body. */
function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}

/**
 * Coerce a request body's market list into catalog ids.
 *
 * This is the fence described in the header: only ids that exist in {@link STOCK_CATALOG}
 * survive, so the Client cannot name a symbol, a host or a path — the worst it can do is ask
 * for a market this plugin already knows how to quote.
 */
function normalizeIds(input) {
  const list = Array.isArray(input) ? input : [];
  const out = [];
  const seen = new Set();
  for (const raw of list) {
    if (typeof raw !== 'string') continue;
    const id = raw.trim().slice(0, 32);
    if (!MARKET_BY_ID.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= MAX_MARKETS) break;
  }
  return out;
}

/**
 * Turn an untrusted diagnosis into one sentence the reader can act on.
 *
 * The failure this exists for: on a machine with no proxy (or a closed one), every international
 * symbol fails together while 上证 / 深证 / 恒生 answer in milliseconds. That looks like "the
 * stock module is broken" unless it is named, so it is named. Returns `''` when there is nothing
 * to say.
 *
 * Two shapes of "not welcome from here" have to count, and the second one was found by running
 * this with `no_proxy=*`: a censored route usually *times out*, but Yahoo answers a bare
 * **HTTP 403** when asked directly from this network. Counting only timeouts meant the one
 * situation the hint was written for produced a silent `hint: ''` with six failed rows.
 */
function networkHint(failures, resolvedCount) {
  const blocked = failures.filter((failure) => /超时|timeout|hang up|ECONNRESET|代理|HTTP (?:401|403|451)\b/i
    .test(failure.message));
  if (resolvedCount === 0) return 'offline';
  return blocked.length >= BLOCKED_HINT_THRESHOLD ? 'proxy' : '';
}

/** The market catalog and the shipped defaults — what the picker renders before any fetch. */
export function stockCatalog() {
  return {
    ok: true,
    regions: STOCK_REGIONS,
    markets: STOCK_CATALOG.map((market) => ({
      id: market.id,
      name: market.name,
      region: market.region,
      // Whether the no-proxy fallback can answer for this market is a fact the reader is
      // allowed to see: it is the difference between "empty row" and "a number, from 腾讯".
      fallback: Boolean(market.tencent),
    })),
    defaults: DEFAULT_MARKETS.slice(),
    limits: { min: MIN_MARKETS, max: MAX_MARKETS },
  };
}

/**
 * The aggregation the Client calls on every view.
 *
 * @param {object} request - `{ ids, refresh }`, already JSON-parsed.
 * @returns {Promise<object>} the response payload; `ok:false` only when no market was usable.
 */
export async function collectQuotes(request) {
  const started = Date.now();
  const refresh = Boolean(request && request.refresh);
  const ids = normalizeIds(request && request.ids);
  if (!ids.length) {
    return { ok: false, error: '没有可用的市场：请至少选择一个股市。', fetchedAt: Date.now() };
  }

  const now = Date.now();
  const resolved = new Map();
  const failures = new Map();
  let anyCached = false;

  // ── Pass 1: the primary source, one request per market. ────────────────────────────────
  const markets = ids.map((id) => MARKET_BY_ID.get(id)).filter(Boolean);
  const primary = markets.filter((market) => market.yahoo);
  const results = await mapLimit(primary, CONCURRENCY, (market) => loadYahoo(market, refresh));
  const needFallback = [];
  for (let index = 0; index < primary.length; index += 1) {
    const market = primary[index];
    const outcome = results[index] || {};
    if (outcome.quote) {
      resolved.set(market.id, { market, quote: outcome.quote, via: outcome.via || 'yahoo', stale: Boolean(outcome.stale) });
      if (outcome.cached) anyCached = true;
    } else {
      failures.set(market.id, { message: outcome.error || '抓取失败' });
      if (market.tencent) needFallback.push(market);
    }
  }

  // ── Pass 2: the no-proxy fallback, for whatever the primary could not answer. ──────────
  if (needFallback.length && Date.now() - started < OVERALL_DEADLINE_MS) {
    const batch = await loadTencent(needFallback, refresh);
    if (batch.cached) anyCached = true;
    for (const market of needFallback) {
      const quote = batch.quotes.get(market.id);
      if (quote) {
        resolved.set(market.id, { market, quote, via: 'tencent', stale: false });
        // Answered after all, so it is not a failure — dropping this is what kept a working row
        // out of `quotes` while its error sat in `stats.errors`.
        failures.delete(market.id);
      } else if (batch.error) {
        failures.set(market.id, { message: batch.error });
      }
    }
  }

  // Catalog order, so the pane's row order never depends on which source answered first.
  const quotes = [];
  for (const id of ids) {
    const entry = resolved.get(id);
    if (!entry) continue;
    const { market, quote, via, stale } = entry;
    quotes.push({
      id: market.id,
      name: market.name,
      region: market.region,
      price: Number.isFinite(quote.price) ? quote.price : null,
      change: Number.isFinite(quote.change) ? quote.change : null,
      pct: Number.isFinite(quote.pct) ? quote.pct : null,
      prev: Number.isFinite(quote.prev) ? quote.prev : null,
      decimals: quote.decimals,
      currency: quote.currency || '',
      exchange: quote.exchange || '',
      session: quote.session || 'unknown',
      time: quote.time || 0,
      timeText: quote.timeText || '',
      spark: Array.isArray(quote.spark) ? quote.spark : [],
      source: via,
      stale,
    });
  }

  const errors = ids
    .filter((id) => failures.has(id))
    .map((id) => ({ id, name: MARKET_BY_ID.get(id).name, message: failures.get(id).message }));
  const tookMs = Date.now() - started;

  return {
    ok: true,
    fetchedAt: Date.now(),
    tookMs,
    quotes,
    stats: {
      requested: ids.length,
      resolved: quotes.length,
      failed: errors.length,
      cached: anyCached,
      fallback: quotes.filter((quote) => quote.source === 'tencent').length,
      timedOut: tookMs >= OVERALL_DEADLINE_MS,
      tookMs,
      errors,
      hint: networkHint([...failures.values()], quotes.length),
    },
  };
}

//#region market members (点进某个市场，看它内部的全部个股)

/**
 * 东方财富的板块成分 —— 「点进市场看全部股票」的数据来源。
 *
 * ## 为什么换来源，而不是接着用 Yahoo
 *
 * 本机实测（`query1.finance.yahoo.com`，走系统代理 127.0.0.1:7897）：
 *
 * | 端点 | 结果 |
 * | --- | --- |
 * | `/v7/finance/quote?symbols=…` | **403** |
 * | `/v1/finance/screener/predefined/saved` | **403** |
 * | `/v8/finance/chart/AAPL` （本文件的主力源） | **403** |
 *
 * 也就是说指数报价那一半一直在靠腾讯的兜底在跑。东财 `push2.eastmoney.com` 从本机**直连**
 * 200、200 毫秒内返回，而且它天生就有「按板块列出成分股」这个能力 —— 这正是这个功能要的
 * 东西，Yahoo 那侧反而没有（它的 screener 只能给「热门股」，不是某个交易所的成员表）。
 *
 * ## 实测出来的三条硬约束（写代码前先量过）
 *
 * 1. **`fid=f3` 是唯一真的会排序的字段**。`fid=f6`（成交额）、`fid=f20`（市值）实测返回的是
 *    代码序的垃圾行（`600001 邯郸钢铁` 这种退市股排在最前），不是降序。所以**服务端只按涨幅
 *    排序取一片**，其余排序交给客户端在取回的切片上做 —— 这也正是各种看盘软件「榜单」的做法。
 * 2. **`pz` 上限 100**：请求 `pz=200` 也只回 100 行，要更多必须翻页。这里按需翻 `pn`。
 * 3. **港股/美股的全量列表里混着大量窝轮、票据、权证**（`m:116` 全量 17348 条，多数价格为空）。
 *    所以这两类市场**不列全量**，而是取「按涨幅排序的前 N 条」当成活跃榜 —— 对读者来说，
 *    一个全是空行的全量列表没有任何价值。
 *
 * ## 与指数报价的关系
 *
 * 这里**完全独立于** {@link STOCK_CATALOG}：那个是「13 个指数的最新点位」，这个是「某个板块的
 * 成分股」。两者共用 `net.js` 的客户端、共用失败与诊断的写法，但缓存、并发、限流各自一套。
 */

/** 东财列表接口。GET，字段用 `f` 编号，`fltt=2` 让它把价格当小数返回（否则是 ×100 的整数）。 */
const EM_LIST_URL = 'https://push2.eastmoney.com/api/qt/clist/get';

/** 东财单页上限，实测：要 200 也只给 100。 */
const EM_PAGE_MAX = 100;

/** 相对 {@link EM_PAGE_MAX}，一次市场查询最多翻几页。切片再大读者也不会逐行读完。 */
const EM_MAX_PAGES = 2;

/** 一次返回给客户端的最多条数。超过就截断，并如实报告 `total`。 */
const MEMBERS_MAX = 200;

/** 成分股列表的缓存时长。榜单比指数变得慢，但也不该是一天前的。 */
const EM_TTL_MS = 60 * 1000;

/** 失败记住的时长，避免连续刷新把一个坏板块打成重试风暴。 */
const EM_ERROR_TTL_MS = 30 * 1000;

/** 请求超时。东财通常 200 ms 内回来，这是给慢网络的余量。 */
const EM_TIMEOUT_MS = 9000;

/** 响应字节上限。100 行 × 17 字段约 20 KB，这是 10 倍余量。 */
const EM_MAX_BYTES = 400_000;

/**
 * 请求的字段编号 → 返回对象里的名字。
 *
 * 编号是东财的协议，不是我们的选择；这张表把协议挡在本模块内部，客户端只见名字。
 * 每个名字都用实测确认过**确实有值**（否则客户端会出现一列永远为空的表头）。
 */
const EM_FIELDS = {
  f12: 'code',
  f13: 'board',
  f14: 'name',
  f2: 'price',
  f3: 'pct',
  f4: 'change',
  f5: 'volume',
  f6: 'amount',
  f7: 'amplitude',
  f8: 'turnover',
  f9: 'pe',
  f15: 'high',
  f16: 'low',
  f17: 'open',
  f18: 'prevClose',
  f20: 'marketCap',
  f21: 'floatCap',
  f23: 'pb',
  f115: 'peStatic',
};

/**
 * 可以点进去看成分股的市场板块。
 *
 * `fs` 是东财的板块选择器，`unit`/`decimals` 影响展示，`cap` 说明「有多少行是真的有值」——
 * 港股与美股那一列偏小，是因为它们的全量表里混着窝轮、票据与权证，那些行价格为空，被过滤掉了。
 */
export const STOCK_MARKETS = [
  { id: 'shmain', name: '沪市主板', region: 'A股', fs: 'm:1+t:2', decimals: 2, kind: 'board' },
  { id: 'kc', name: '科创板', region: 'A股', fs: 'm:1+t:23', decimals: 2, kind: 'board' },
  { id: 'szmain', name: '深市主板', region: 'A股', fs: 'm:0+t:6', decimals: 2, kind: 'board' },
  { id: 'cyb2', name: '创业板', region: 'A股', fs: 'm:0+t:80', decimals: 2, kind: 'board' },
  { id: 'bj', name: '北交所', region: 'A股', fs: 'm:0+t:81+s:2048', decimals: 2, kind: 'board' },
  { id: 'hk', name: '港股主板', region: '港股', fs: 'm:116+t:3', decimals: 3, kind: 'rank' },
  { id: 'hkcyb', name: '港股创业板', region: '港股', fs: 'm:116+t:4', decimals: 3, kind: 'rank' },
  { id: 'nasdaq', name: '纳斯达克', region: '美股', fs: 'm:105', decimals: 2, kind: 'rank' },
  { id: 'nyse', name: '纽约证交所', region: '美股', fs: 'm:106', decimals: 2, kind: 'rank' },
  { id: 'amex', name: '美国交易所', region: '美股', fs: 'm:107', decimals: 2, kind: 'rank' },
];

const MARKET_MEMBERS_BY_ID = new Map(STOCK_MARKETS.map((market) => [market.id, market]));

/** 板块列表，先于任何抓取就能渲染。 */
export function stockMarkets() {
  return {
    ok: true,
    regions: [...new Set(STOCK_MARKETS.map((market) => market.region))],
    markets: STOCK_MARKETS.map((market) => ({
      id: market.id,
      name: market.name,
      region: market.region,
      decimals: market.decimals,
      // `board` = 这个板块本身就是一份完整名单（A股各板）；`rank` = 全量里混着衍生品，
      // 只给活跃榜。读者有权知道「这是全部，还是前 N 名」。
      scope: market.kind,
    })),
    limit: MEMBERS_MAX,
  };
}

/** 东财把「没有值」写成 `-`，也写成 `null`，也直接不写这个键。三种都归一成 null。 */
function emNumber(value) {
  if (value === null || value === undefined || value === '' || value === '-') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function emText(value) {
  if (value === null || value === undefined) return '';
  const text = String(value).trim();
  return text === '-' ? '' : text;
}

/**
 * 把一行东财记录变成客户端的行。
 *
 * **没有价格的行直接丢掉**：港美股的全量表里，窝轮、票据、权证占了绝大多数，它们价格为空、
 * 名称是一串编号。把它们留在列表里，读者的第一屏就是一片空白 —— 这也是「活跃榜」这个选择的由来。
 */
function emRow(raw, market) {
  const price = emNumber(raw.f2);
  if (price === null) return null;
  const code = emText(raw.f12);
  if (!code) return null;
  return {
    code,
    name: emText(raw.f14) || code,
    price,
    decimals: market.decimals,
    pct: emNumber(raw.f3),
    change: emNumber(raw.f4),
    // 东财的成交量单位是「手」（100 股）；港美股同接口也是手，客户端按手展示。
    volume: emNumber(raw.f5),
    amount: emNumber(raw.f6),
    amplitude: emNumber(raw.f7),
    turnover: emNumber(raw.f8),
    pe: emNumber(raw.f9),
    pb: emNumber(raw.f23),
    high: emNumber(raw.f15),
    low: emNumber(raw.f16),
    open: emNumber(raw.f17),
    prevClose: emNumber(raw.f18),
    marketCap: emNumber(raw.f20),
    floatCap: emNumber(raw.f21),
    board: emText(raw.f13),
  };
}

async function emPage(market, page, pageSize) {
  const fields = Object.keys(EM_FIELDS).join(',');
  // `po=1` 降序，`fid=f3` 涨幅 —— 见文件头的实测结论：只有 f3 真的会排序。
  const url = EM_LIST_URL
    + '?pn=' + page + '&pz=' + pageSize + '&po=1&np=1&fltt=2&invt=2&fid=f3'
    + '&fs=' + encodeURIComponent(market.fs)
    + '&fields=' + fields;
  const response = await httpGet(url, {
    timeoutMs: EM_TIMEOUT_MS,
    maxBytes: EM_MAX_BYTES,
    accept: 'application/json, */*;q=0.8',
    // 东财是国内源，代理反而会绕远甚至失败；`fallbackDirect` 让客户端在代理不通时直连。
    fallbackDirect: true,
  });
  let payload;
  try {
    payload = JSON.parse(response.text);
  } catch {
    throw new Error('行情列表返回的不是 JSON');
  }
  const data = payload && payload.data;
  if (!data || (!data.diff && !Array.isArray(data.diff))) {
    // 东财对空板块返回 `data: null`，这不是网络错误，要区分出来。
    return { total: 0, rows: [] };
  }
  const list = Array.isArray(data.diff) ? data.diff : Object.values(data.diff);
  return { total: Number(data.total) || list.length, rows: list };
}

const membersCache = new Map();

function cacheGet(key, ttl) {
  const hit = membersCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > ttl) { membersCache.delete(key); return null }
  return hit;
}

function trimMembersCache() {
  while (membersCache.size > 32) {
    const oldest = membersCache.keys().next().value;
    membersCache.delete(oldest);
  }
}

/**
 * 取一个市场的成分股切片。
 *
 * @param {object} request - `{ id, limit, refresh }`，已 JSON 解析。
 * @returns {Promise<object>} `{ ok, market, total, rows, stats }`；`ok:false` 只在整体失败时。
 */
export async function collectMembers(request) {
  const started = Date.now();
  const id = String((request && request.id) || '').trim().slice(0, 32);
  const market = MARKET_MEMBERS_BY_ID.get(id);
  if (!market) {
    return { ok: false, error: '未知的市场板块：' + (id || '(空)'), fetchedAt: Date.now() };
  }
  const refresh = Boolean(request && request.refresh);
  const wanted = clampNumber(request && request.limit, 20, MEMBERS_MAX, 100);
  // pz 上限 100，要 150 条就必须翻两页。
  const pages = Math.max(1, Math.min(EM_MAX_PAGES, Math.ceil(wanted / EM_PAGE_MAX)));
  const cacheKey = market.id + ':' + wanted;
  if (!refresh) {
    const hit = cacheGet(cacheKey, EM_TTL_MS);
    if (hit) return Object.assign({}, hit.payload, { stats: Object.assign({}, hit.payload.stats, { cached: true, tookMs: Date.now() - started }) });
    const bad = cacheGet(cacheKey, EM_ERROR_TTL_MS);
    if (bad && bad.error) return { ok: false, error: bad.error, market: { id: market.id, name: market.name }, fetchedAt: Date.now() };
  }

  const rows = [];
  let total = 0;
  let error = '';
  for (let page = 1; page <= pages; page += 1) {
    const size = Math.min(EM_PAGE_MAX, wanted - rows.length);
    if (size <= 0) break;
    try {
      const result = await emPage(market, page, size);
      total = result.total || total;
      if (!result.rows.length) break;
      let kept = 0;
      for (const raw of result.rows) {
        const row = emRow(raw, market);
        if (row) { rows.push(row); kept += 1 }
      }
      // 一整页没有任何有价的行，说明后面也不会有 —— 别再把翻页浪费在衍生品上。
      if (kept === 0) break;
    } catch (issue) {
      error = issue && issue.message ? issue.message : '行情列表抓取失败';
      break;
    }
  }

  if (!rows.length) {
    const message = error || '这个市场暂时没有返回可用的行情';
    membersCache.set(cacheKey, { at: Date.now(), error: message });
    trimMembersCache();
    return {
      ok: false, market: { id: market.id, name: market.name, region: market.region },
      error: message, fetchedAt: Date.now(),
      stats: { tookMs: Date.now() - started, hint: 'proxy' },
    };
  }

  const payload = {
    ok: true,
    market: {
      id: market.id, name: market.name, region: market.region,
      decimals: market.decimals, scope: market.kind,
    },
    fetchedAt: Date.now(),
    // `total` 是板块真实规模（A股主板 1846），`rows.length` 是这次给到的切片。
    // 两个数分开报，客户端才能说清楚「1846 只里的前 100 只」而不是骗人说这是全部。
    total,
    shown: rows.length,
    requestId: id,
    // 服务端只保证「按涨幅降序的前 N 条」；其余排序由客户端在切片上做，原因见文件头。
    rows,
    stats: {
      tookMs: Date.now() - started,
      pages,
      cached: false,
      // `networkHint` 的第二个参数是「指数里成功了几个」，这里语义不同，不能借用：
      // 成分股只要拿到任何一行就说明网络是通的；一行都没拿到时上面已经单独返回了
      // `ok:false` + `hint:'proxy'`。所以这里只在「翻页途中出错但仍有数据」时提示。
      hint: error ? 'proxy' : '',
    },
  };
  membersCache.set(cacheKey, { at: Date.now(), payload });
  trimMembersCache();
  return payload;
}

