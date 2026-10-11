/**
 * Host half of the 每日新闻 (Daily News) module — the fetching and parsing engine.
 *
 * Why this lives on the Host and not in the browser: the GUI is a page served from
 * `http://127.0.0.1:<port>`, and every public news feed is a different origin with no
 * CORS headers. A browser `fetch` to `feeds.bbci.co.uk` is blocked before it leaves;
 * the Host process has no such restriction. So the browser asks one same-origin route,
 * and this file does the crawling.
 *
 * The contract with the Client is deliberately narrow:
 *   GET  ?op=catalog          → the verified feed catalog + the shipped default topics
 *   POST (body = query)       → aggregated, deduped, time-windowed news items
 *   GET  ?op=article&url=...  → one article's og: metadata, fetched on demand
 *
 * Three properties are load-bearing:
 *
 * 1. **No user-supplied URLs are ever fetched.** The Client sends feed *ids*, and ids are
 *    resolved against {@link FEED_CATALOG} here. Without that, the route would be an open
 *    proxy that any page in the browser could point at the local network. `op=article` is
 *    the one place a URL crosses the boundary, and it is fenced by {@link assertPublicUrl}
 *    (scheme whitelist, private-range rejection, DNS resolution check).
 *
 * 2. **Caching is per feed, not per request.** A query for three topics shares feeds with
 *    the next query; the 8-minute TTL plus in-flight coalescing means holding down
 *    "refresh" issues one HTTP request per feed, not one per click.
 *
 * 3. **Failure is partial and reported.** One dead feed must not empty the pane: every feed
 *    resolves independently and its error is returned in `stats.errors` so the Client can
 *    show "3 个来源失败" instead of a blank screen.
 */

import { lookup } from 'node:dns/promises';
// The proxy-aware HTTP client is shared with the 股票市场 module and lives in net.js. It used to
// live in this file; it moved out unchanged when a second caller appeared, because a second copy
// of that code would have been a second copy of every bug its comments exist to prevent.
import { ACCEPT_FEED, httpGet } from './net.js';

/** One day in milliseconds — the unit the 1–7 day retention window is expressed in. */
const DAY_MS = 24 * 60 * 60 * 1000;

/** The whole module's retention ceiling. The UI offers 1–7 days; nothing keeps 8. */
export const MAX_DAYS = 7;

/** The item-count bounds the UI is allowed to ask for. */
export const MIN_LIMIT = 10;
export const MAX_LIMIT = 100;

/** Largest feed body read. PC Gamer's full feed is ~2.5 MB of mostly-irrelevant markup. */
const MAX_FEED_BYTES = 1_500_000;

/** Largest article body read for `op=article`. Enough for `<head>`, nothing else. */
const MAX_ARTICLE_BYTES = 600_000;

/** How long a parsed feed is reused. Short enough that "today" stays true. */
const CACHE_TTL_MS = 8 * 60 * 1000;

/** How long a *failed* feed is remembered, so a broken source cannot be retry-stormed. */
const ERROR_TTL_MS = 60 * 1000;

/** Bound on distinct feed URLs held in memory. */
const CACHE_MAX_ENTRIES = 96;

/** Parallel feed fetches. Deliberately above the browser's usual six: 27 distinct hosts with a
 *  proxy hop in front of the international ones makes six lanes the difference between a 10 s
 *  refresh and a 60 s one, and no single host sees more than one concurrent request. */
const CONCURRENCY = 12;

/**
 * Wall-clock ceiling for one aggregated query.
 *
 * Past this the response is returned with whatever answered. Nothing is cancelled — the
 * remaining fetches finish into the cache — so the cost of the deadline is a possibly
 * incomplete list, never wasted work.
 */
const OVERALL_DEADLINE_MS = 15000;

/**
 * How many timed-out sources make this look like a network-policy problem rather than a slow
 * publisher. On a machine that needs a proxy to reach Google/BBC, every international source
 * times out together; the Client turns this into one actionable sentence instead of leaving a
 * reader to guess why half the list is missing.
 */
const BLOCKED_HINT_THRESHOLD = 3;

/** Most items a single feed may contribute before the merge sees them. */
const MAX_ITEMS_PER_FEED = 120;

/**
 * `ACCEPT_FEED` (the Accept every feed request carries) and the browser-like user agent that
 * BBC / Nature / CNBC require are imported from net.js, together with the client that sends them.
 */

/**
 * The verified source catalog.
 *
 * Every entry here was fetched and parsed before being listed — a feed that 403s or
 * returns HTML is worse than no entry, because it spends the user's refresh budget and
 * shows up as an error. `kind` selects the parser: `rss` (RSS 2.0 or Atom) or `hn`
 * (the Hacker News Algolia JSON API, which has no XML form).
 *
 * `group` is what the Client groups the toggles by; `lang` is the feed's own language and
 * is only used for display, since Google News search feeds carry their edition in the URL.
 */
export const FEED_CATALOG = [
  // ── 全球头条 ────────────────────────────────────────────────────────────────
  { id: 'gnews-top-zh', label: 'Google 新闻 · 中文头条', group: '全球', lang: 'zh', kind: 'rss', url: 'https://news.google.com/rss?hl=zh-CN&gl=CN&ceid=CN:zh-Hans' },
  { id: 'gnews-top-en', label: 'Google News · Top stories', group: '全球', lang: 'en', kind: 'rss', url: 'https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en' },
  { id: 'bbc-world', label: 'BBC World', group: '全球', lang: 'en', kind: 'rss', url: 'https://feeds.bbci.co.uk/news/world/rss.xml' },
  { id: 'npr-world', label: 'NPR World', group: '全球', lang: 'en', kind: 'rss', url: 'https://feeds.npr.org/1004/rss.xml' },
  { id: 'aljazeera', label: 'Al Jazeera', group: '全球', lang: 'en', kind: 'rss', url: 'https://www.aljazeera.com/xml/rss/all.xml' },
  { id: 'bbc-sport', label: 'BBC Sport', group: '全球', lang: 'en', kind: 'rss', url: 'https://feeds.bbci.co.uk/sport/rss.xml' },

  // ── 科技 / AI ──────────────────────────────────────────────────────────────
  { id: 'hn', label: 'Hacker News 头版', group: '科技', lang: 'en', kind: 'hn', url: 'https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=60' },
  { id: 'techcrunch', label: 'TechCrunch', group: '科技', lang: 'en', kind: 'rss', url: 'https://techcrunch.com/feed/' },
  { id: 'ars', label: 'Ars Technica', group: '科技', lang: 'en', kind: 'rss', url: 'https://feeds.arstechnica.com/arstechnica/index' },
  { id: 'verge', label: 'The Verge', group: '科技', lang: 'en', kind: 'rss', url: 'https://www.theverge.com/rss/index.xml' },
  { id: 'wired', label: 'WIRED', group: '科技', lang: 'en', kind: 'rss', url: 'https://www.wired.com/feed/rss' },
  { id: 'ithome', label: 'IT之家', group: '科技', lang: 'zh', kind: 'rss', url: 'https://www.ithome.com/rss/' },
  { id: 'solidot', label: 'Solidot 奇客', group: '科技', lang: 'zh', kind: 'rss', url: 'https://www.solidot.org/index.rss' },
  { id: 'cnbeta', label: 'cnBeta', group: '科技', lang: 'zh', kind: 'rss', url: 'https://www.cnbeta.com.tw/backend.php' },

  // ── 科学 ──────────────────────────────────────────────────────────────────
  { id: 'sciencedaily', label: 'ScienceDaily', group: '科学', lang: 'en', kind: 'rss', url: 'https://www.sciencedaily.com/rss/top/science.xml' },
  { id: 'nature', label: 'Nature', group: '科学', lang: 'en', kind: 'rss', url: 'https://www.nature.com/nature.rss' },
  { id: 'phys', label: 'Phys.org', group: '科学', lang: 'en', kind: 'rss', url: 'https://phys.org/rss-feed/' },

  // ── 游戏 ──────────────────────────────────────────────────────────────────
  { id: 'ign', label: 'IGN', group: '游戏', lang: 'en', kind: 'rss', url: 'https://feeds.ign.com/ign/all' },
  { id: 'eurogamer', label: 'Eurogamer', group: '游戏', lang: 'en', kind: 'rss', url: 'https://www.eurogamer.net/feed' },
  { id: 'gamesindustry', label: 'GamesIndustry.biz', group: '游戏', lang: 'en', kind: 'rss', url: 'https://www.gamesindustry.biz/feed' },

  // ── 财经 ──────────────────────────────────────────────────────────────────
  { id: 'wsj-markets', label: 'WSJ Markets', group: '财经', lang: 'en', kind: 'rss', url: 'https://feeds.a.dj.com/rss/RSSMarketsMain.xml' },
  { id: 'marketwatch', label: 'MarketWatch', group: '财经', lang: 'en', kind: 'rss', url: 'https://feeds.content.dowjones.io/public/rss/mw_topstories' },
  { id: 'cnbc-finance', label: 'CNBC Finance', group: '财经', lang: 'en', kind: 'rss', url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=10000664' },
  { id: 'ft', label: 'Financial Times', group: '财经', lang: 'en', kind: 'rss', url: 'https://www.ft.com/rss/home' },
  { id: '36kr', label: '36氪', group: '财经', lang: 'zh', kind: 'rss', url: 'https://36kr.com/feed' },
];

const FEED_BY_ID = new Map(FEED_CATALOG.map((feed) => [feed.id, feed]));

/**
 * Google News editions. The search feed is the one source that can answer an arbitrary
 * keyword, and it needs an edition triple — a query without `hl`/`gl`/`ceid` silently
 * resolves to the US English edition.
 */
const GN_EDITIONS = {
  zh: { hl: 'zh-CN', gl: 'CN', ceid: 'CN:zh-Hans' },
  tw: { hl: 'zh-TW', gl: 'TW', ceid: 'TW:zh-Hant' },
  en: { hl: 'en-US', gl: 'US', ceid: 'US:en' },
  ja: { hl: 'ja', gl: 'JP', ceid: 'JP:ja' },
};

/**
 * The shipped default topics — the module's first-run content.
 *
 * `feeds` are catalog ids; `kw` are the search keywords handed to Google News. A topic
 * with neither would render an empty pane, so every one of these carries at least one of
 * the two. `accent` drives the topic's colour in the UI and is stored here so the Client
 * does not have to keep its own copy of the defaults.
 */
export const DEFAULT_TOPICS = [
  {
    id: 'global',
    name: '全球大事件',
    accent: '#7db8ff',
    lang: 'zh',
    // No keywords on purpose: this topic is the "what happened in the world" seat and
    // should reflect each outlet's own front page rather than a query's opinion.
    kw: [],
    feeds: ['gnews-top-zh', 'gnews-top-en', 'bbc-world', 'npr-world', 'aljazeera'],
  },
  {
    id: 'ai',
    name: 'AI 领域',
    accent: '#a78bfa',
    lang: 'zh',
    kw: ['人工智能', '大模型', 'AI 芯片'],
    feeds: ['hn', 'techcrunch', 'ars', 'ithome'],
  },
  {
    id: 'games',
    name: '游戏领域',
    accent: '#34d399',
    lang: 'zh',
    kw: ['游戏', '主机', '电子游戏'],
    feeds: ['ign', 'eurogamer', 'gamesindustry'],
  },
  {
    id: 'tech',
    name: '科技前沿',
    accent: '#22d3ee',
    lang: 'zh',
    kw: ['科技', '半导体', '芯片'],
    feeds: ['verge', 'wired', 'solidot'],
  },
  {
    id: 'science',
    name: '科学发现',
    accent: '#fbbf24',
    lang: 'zh',
    kw: ['科学发现', '航天'],
    feeds: ['sciencedaily', 'nature', 'phys'],
  },
  {
    id: 'business',
    name: '财经市场',
    accent: '#f472b6',
    lang: 'zh',
    kw: ['股市', '经济'],
    feeds: ['wsj-markets', 'marketwatch', 'cnbc-finance', '36kr'],
  },
];

//#region text

/** Decode the five XML entities plus numeric references. */
function decodeEntities(value) {
  return String(value || '')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => codePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => codePoint(parseInt(dec, 10)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&hellip;/g, '…')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&rsquo;/g, '’')
    .replace(/&lsquo;/g, '‘')
    .replace(/&ldquo;/g, '“')
    .replace(/&rdquo;/g, '”')
    .replace(/&amp;/g, '&');
}

/** A numeric reference that is not a real code point must not throw. */
function codePoint(value) {
  if (!Number.isFinite(value) || value <= 0 || value > 0x10ffff) return '';
  try { return String.fromCodePoint(value) } catch { return '' }
}

/** Unwrap one level of CDATA, which most feeds use for titles and descriptions. */
function unwrapCdata(value) {
  const match = /^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/.exec(String(value || ''));
  return match ? match[1] : String(value || '');
}

/** Strip markup and collapse whitespace — descriptions arrive as HTML fragments. */
function plainText(value) {
  return collapse(decodeEntities(
    String(value || '')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<\/(p|div|li|h[1-6])>/gi, ' ')
      .replace(/<[^>]+>/g, ''),
  ));
}

/** Collapse every run of whitespace (including the ideographic space) to one space. */
function collapse(value) {
  return String(value || '').replace(/[\s\u3000]+/g, ' ').trim();
}

/** Cut to a length on a word boundary, with an ellipsis, never splitting a surrogate pair. */
function truncate(value, max) {
  const text = String(value || '');
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const at = Math.max(cut.lastIndexOf(' '), cut.lastIndexOf('，'), cut.lastIndexOf('。'));
  return (at > max * 0.6 ? cut.slice(0, at) : cut).trim() + '…';
}

/**
 * The merge key for "the same story".
 *
 * Punctuation, case and spacing differ between outlets covering one event, so both are
 * stripped before comparison. CJK survives `\p{P}`/`\p{S}` removal untouched, which is
 * what makes this work for Chinese headlines as well as English ones.
 */
function dedupeKey(title) {
  return String(title || '')
    .toLowerCase()
    .replace(/[\s\u3000]+/g, '')
    .replace(/[\p{P}\p{S}]/gu, '');
}

/** A short stable id from a string — FNV-1a, rendered in base 36. */
function hashId(value) {
  const text = String(value || '');
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36) + text.length.toString(36);
}

/** The publisher label shown on a card when the feed does not name one. */
function hostLabel(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch { return '' }
}

//#endregion

//#region time

/**
 * Parse every date shape the catalog actually produces: RFC 822 (RSS), ISO 8601 (Atom),
 * and `YYYY-MM-DD HH:MM:SS` (cnBeta, a few Chinese feeds). An unparseable value yields 0
 * and the caller substitutes the fetch time, so a dateless feed still shows up rather
 * than being silently dropped by the retention window.
 */
function parseTime(value) {
  const text = collapse(value);
  if (!text) return 0;
  const direct = Date.parse(text);
  if (Number.isFinite(direct)) return direct;
  const loose = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(text);
  if (loose) {
    const parsed = Date.parse(`${loose[1]}-${loose[2]}-${loose[3]}T${loose[4]}:${loose[5]}:${loose[6] || '00'}Z`);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

//#endregion

//#region feed parsing

/**
 * Pull the item/entry blocks out of a feed document.
 *
 * Regex rather than a real XML parser on purpose: this file is required to stay
 * dependency-free (the whole plugin ships as plain files), and the shapes involved are
 * regular. A truncated body is handled for free — an incomplete trailing `<item>` simply
 * never matches, so the last complete item is the last one returned.
 */
function splitItems(xml) {
  const items = [];
  const pattern = /<(item|entry)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi;
  let match;
  while ((match = pattern.exec(xml)) !== null) {
    items.push(match[2]);
    if (items.length >= MAX_ITEMS_PER_FEED) break;
  }
  return items;
}

/** The text of the first present child element, entity- and CDATA-decoded. */
function firstTag(body, names) {
  for (const name of names) {
    const pattern = new RegExp('<' + name + '(?:\\s[^>]*)?>([\\s\\S]*?)<\\/' + name + '>', 'i');
    const match = pattern.exec(body);
    if (match) return collapse(decodeEntities(unwrapCdata(match[1])));
  }
  return '';
}

/** The value of an attribute on the first matching element (`<link href="…">`). */
function firstAttr(body, name, attribute) {
  const pattern = new RegExp('<' + name + '(?:\\s[^>]*)?\\s' + attribute + '\\s*=\\s*["\']([^"\']*)["\']', 'i');
  const match = pattern.exec(body);
  return match ? collapse(decodeEntities(match[1])) : '';
}

/** The first URL-looking attribute among the media/enclosure elements feeds use. */
function firstImage(body) {
  for (const name of ['media:thumbnail', 'media:content', 'enclosure', 'image', 'itunes:image']) {
    const value = firstAttr(body, name, 'url');
    if (/^https?:\/\//i.test(value)) return value;
  }
  const inline = /<img[^>]+src\s*=\s*["']([^"']+)["']/i.exec(body);
  return inline && /^https?:\/\//i.test(inline[1]) ? decodeEntities(inline[1]) : '';
}

/**
 * Turn one raw feed block into the item shape the rest of the file works with.
 *
 * `sourceName` is the publisher when the feed names one (`<source>`, `<dc:creator>`) and
 * is otherwise filled from the link host — which is how the BBC and Nature items, whose
 * feeds never name a source, still show a publisher on the card.
 */
function parseRssItem(body, feed, fetchedAt) {
  const isAtom = /<entry[\s>]/i.test('<entry>') && !/<item[\s>]/i.test(body);
  const title = firstTag(body, ['title']);
  const link = firstTag(body, ['link']) || firstAttr(body, 'link', 'href');
  const date = firstTag(body, ['pubDate', 'published', 'updated', 'dc:date', 'date']);
  const description = firstTag(body, ['description', 'summary', 'content:encoded', 'content']);
  // `<source>` is the publisher; `<dc:creator>`/`<author>` is the journalist. They are read
  // separately because DC is far more common than `<source>` — using it as the publisher put
  // "Sophie McEvoy" and "Aisha Malik" in the source column instead of Eurogamer and
  // TechCrunch, which is not what that column means.
  const sourceName = firstTag(body, ['source']);
  const author = firstTag(body, ['dc:creator', 'author', 'creator']);
  const sourceUrl = firstAttr(body, 'source', 'url');
  const categories = [];
  const categoryPattern = /<category(?:\s[^>]*)?>([\s\S]*?)<\/category>/gi;
  let category;
  while ((category = categoryPattern.exec(body)) !== null) {
    const value = collapse(decodeEntities(unwrapCdata(category[1])));
    if (value && categories.length < 4) categories.push(value);
  }
  return {
    // Marked so the caller can tell an Atom entry from an RSS item when it matters.
    atom: isAtom,
    title,
    link,
    category: categories.join(' · '),
    rawDate: date,
    publishedAt: parseTime(date) || fetchedAt,
    description,
    sourceName: sourceName || hostLabel(link) || feed.label,
    sourceUrl: sourceUrl || (link ? originOf(link) : ''),
    author,
    image: firstImage(body),
    points: 0,
    comments: 0,
  };
}

/** The scheme+host of a URL, or '' — used for the `<source url>` fallback. */
function originOf(url) {
  try { return new URL(url).origin } catch { return '' }
}

/**
 * Hacker News has no XML feed; it has the Algolia JSON search API.
 *
 * `points` is carried as its own field rather than folded into `coverage`: 900 points means
 * 900 readers voted, which is a different quantity from "9 outlets ran this story", and the
 * UI labels them differently. Stories without an external URL are Ask/Show HN posts and link
 * to their discussion, which is the only thing there is to open.
 */
function parseHnItems(payload, feed, fetchedAt) {
  const hits = payload && Array.isArray(payload.hits) ? payload.hits : [];
  return hits.map((hit) => {
    const discussion = 'https://news.ycombinator.com/item?id=' + (hit.objectID || '');
    const link = typeof hit.url === 'string' && /^https?:\/\//i.test(hit.url) ? hit.url : discussion;
    return {
      atom: false,
      title: collapse(hit.title || hit.story_title || ''),
      link,
      category: 'Hacker News',
      rawDate: hit.created_at || '',
      publishedAt: parseTime(hit.created_at) || fetchedAt,
      description: plainText(hit.story_text || ''),
      sourceName: 'Hacker News',
      sourceUrl: discussion,
      image: '',
      points: Number(hit.points) || 0,
      comments: Number(hit.num_comments) || 0,
    };
  }).filter((item) => item.title);
}

/**
 * Google News puts a *cluster* in `<description>`, not prose.
 *
 * A top-stories item's description is an `<ol>` of every outlet covering the same event,
 * and a search item's is a single `<a>` plus a grey publisher name. Both are read here:
 * the count becomes `coverage` (the "N 家媒体报道" badge, and the signal behind the
 * 大事件 ordering) and the link texts become `related`, the coverage list shown in the
 * detail pane. This is the closest thing to an event-grouping the public feeds offer.
 */
function googleCluster(description) {
  const html = String(description || '');
  const related = [];
  const linkPattern = /<a\b[^>]*>([\s\S]*?)<\/a>/gi;
  let link;
  while ((link = linkPattern.exec(html)) !== null) {
    const text = plainText(link[1]);
    if (text && related.length < 12) related.push(text);
  }
  const listItems = (html.match(/<li[\s>]/gi) || []).length;
  return {
    related,
    coverage: Math.max(listItems, related.length, 1),
    hasCluster: listItems > 1,
  };
}

//#endregion

//#region cache

/**
 * Per-URL feed cache with in-flight coalescing.
 *
 * Two maps, not one: `feedCache` holds settled results (successes for {@link CACHE_TTL_MS},
 * failures for {@link ERROR_TTL_MS}), while `inflight` holds promises for fetches currently
 * running. Without the second map, two topics sharing a feed would each start their own
 * request; with it, the second caller awaits the first.
 */
const feedCache = new Map();
const inflight = new Map();

/** Evict the oldest entries once the cache is over its bound. Insertion order is age order. */
function trimCache() {
  while (feedCache.size > CACHE_MAX_ENTRIES) {
    const oldest = feedCache.keys().next();
    if (oldest.done) return;
    feedCache.delete(oldest.value);
  }
}

/**
 * Load one feed, from cache when fresh.
 *
 * @returns {Promise<{items: object[], cached: boolean, error?: string}>} never rejects —
 *   a feed failure is data the caller reports, not an exception that aborts the query.
 */
async function loadFeed(feed, refresh) {
  const now = Date.now();
  const hit = feedCache.get(feed.url);
  if (!refresh && hit) {
    const ttl = hit.error ? ERROR_TTL_MS : CACHE_TTL_MS;
    if (now - hit.at < ttl) {
      return { items: hit.items, cached: true, error: hit.error, ms: 0, via: 'cache' };
    }
  }
  const running = inflight.get(feed.url);
  if (running) return running;

  const pending = (async () => {
    const fetchedAt = Date.now();
    try {
      // A feed request is retried direct when the proxy is what failed: a proxy the user
      // has since closed must not take the whole pane down, and the direct attempt still
      // reaches every domestic source.
      const body = await httpGet(feed.url, {
        maxBytes: MAX_FEED_BYTES,
        fallbackDirect: true,
        accept: feed.kind === 'hn' ? 'application/json, */*;q=0.8' : ACCEPT_FEED,
      });
      let items;
      if (feed.kind === 'hn') {
        let payload;
        try { payload = JSON.parse(body.text) } catch { throw new Error('JSON 解析失败') }
        items = parseHnItems(payload, feed, fetchedAt);
      } else {
        items = splitItems(body.text)
          .map((block) => parseRssItem(block, feed, fetchedAt))
          .filter((item) => item.title && item.link);
      }
      const entry = { at: Date.now(), items, error: '', ms: Date.now() - fetchedAt, via: body.proxies };
      feedCache.set(feed.url, entry);
      trimCache();
      return { items, cached: false, error: '', ms: entry.ms, via: entry.via };
    } catch (error) {
      const message = error && error.message ? error.message : '抓取失败';
      feedCache.set(feed.url, { at: Date.now(), items: (hit && hit.items) || [], error: message });
      trimCache();
      // A stale success is better than an empty card: keep serving yesterday's headlines
      // while telling the caller (and the UI) that this refresh did not reach the source.
      return {
        items: (hit && hit.items) || [],
        cached: true,
        error: message,
        ms: Date.now() - fetchedAt,
        via: 'failed',
      };
    }
  })();

  inflight.set(feed.url, pending);
  try { return await pending } finally { inflight.delete(feed.url) }
}

//#endregion

//#region query

/** Build the Google News search URL for one topic's keywords and edition. */
function googleSearchUrl(keywords, lang, days) {
  const edition = GN_EDITIONS[lang] || GN_EDITIONS.zh;
  // Quoting is what makes a multi-word keyword one phrase rather than an AND of words;
  // `when:Nd` is Google News' own recency operator and is what keeps "today" honest
  // independently of this module's own window filter.
  const terms = keywords
    .map((keyword) => (/\s/.test(keyword) ? '"' + keyword + '"' : keyword))
    .join(' OR ');
  const query = '(' + terms + ') when:' + days + 'd';
  return 'https://news.google.com/rss/search?q=' + encodeURIComponent(query)
    + '&hl=' + edition.hl + '&gl=' + edition.gl + '&ceid=' + encodeURIComponent(edition.ceid);
}

/** Clamp a number from an untrusted request body. */
function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}

/** Coerce a request body's topic list into a safe, bounded spec list. */
function normalizeTopics(input) {
  const list = Array.isArray(input) ? input : [];
  const out = [];
  for (const raw of list) {
    if (!raw || typeof raw !== 'object') continue;
    const id = typeof raw.id === 'string' && raw.id ? raw.id.slice(0, 48) : 'topic-' + out.length;
    const name = typeof raw.name === 'string' && raw.name ? raw.name.slice(0, 40) : '未命名主题';
    const lang = typeof raw.lang === 'string' && GN_EDITIONS[raw.lang] ? raw.lang : 'zh';
    // Keywords are user text that ends up inside a URL query; both the count and the
    // length are bounded so one topic cannot make an unbounded request line.
    const kw = (Array.isArray(raw.kw) ? raw.kw : [])
      .filter((keyword) => typeof keyword === 'string' && keyword.trim())
      .map((keyword) => keyword.trim().slice(0, 40))
      .slice(0, 8);
    // Feed ids only — an unknown id is dropped rather than fetched. This is the fence
    // that keeps the route from being a general-purpose proxy.
    const feeds = (Array.isArray(raw.feeds) ? raw.feeds : [])
      .filter((feedId) => typeof feedId === 'string' && FEED_BY_ID.has(feedId))
      .slice(0, 12);
    const accent = typeof raw.accent === 'string' && /^#[0-9a-f]{3,8}$/i.test(raw.accent) ? raw.accent : '#7db8ff';
    if (!kw.length && !feeds.length) continue;
    out.push({ id, name, lang, kw, feeds, accent });
    if (out.length >= 12) break;
  }
  return out;
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

/**
 * Turn a pile of timeouts into one sentence the reader can act on.
 *
 * The failure this exists for: on a network where Google, the BBC and Al Jazeera are only
 * reachable through a proxy, all of them time out together while the domestic sources answer
 * in milliseconds. That looks like "the news module is broken" unless it is named, so it is
 * named. Returns `''` when there is nothing worth saying.
 */
function timeoutHint(errors, perFeed) {
  const timeouts = errors.filter((error) => /超时|timeout/i.test(error.message));
  if (timeouts.length < BLOCKED_HINT_THRESHOLD) return '';
  const answered = [...perFeed.values()].filter((feed) => !feed.error && feed.items > 0).length;
  // Only when *some* sources are fine: if nothing answered, the message is not "policy" but
  // "the network is down", and the Client already says the fetch failed.
  return answered > 0 ? 'timeout' : '';
}

/**
 * Take up to `limit` newest items for **each** topic, newest first overall.
 *
 * `limit` is per topic, and that is load-bearing. This used to slice the merged list to the
 * newest `limit` items overall. The Client shows one topic at a time out of the archive it
 * stores from this payload, so a global slice starves whichever topic is not currently
 * publishing fastest: with 300 items across four topics, the newest 40 were all from the
 * high-frequency tech feeds, the 全球大事件 tab got none of them, and the pane read "this topic
 * has nothing yet" while a perfectly good 10-item list sat one line above in the rail. Measured,
 * not guessed: the stored archive spanned 0.1 day while the fetch spanned 6.9.
 *
 * Taking up to `limit` per topic costs a bigger payload (12 topics × 100 is the ceiling) and buys
 * the property the UI actually needs: every tab can fill up to the number the reader set.
 *
 * @param {object[]} merged - items sorted newest-first, each carrying a `topicId`.
 * @param {number} limit - how many items one tab may show.
 */
export function selectPerTopic(merged, limit) {
  const buckets = new Map();
  for (const item of merged) {
    const bucket = buckets.get(item.topicId);
    if (!bucket) {
      buckets.set(item.topicId, [item]);
      continue;
    }
    // `merged` is newest-first, so stopping at `limit` keeps each topic's newest slice.
    if (bucket.length < limit) bucket.push(item);
  }
  return [...buckets.values()].flat().sort((a, b) => b.publishedAt - a.publishedAt);
}

/**
 * The aggregation the Client calls on every view.
 *
 * @param {object} request - `{ topics, limit, days, refresh }`, already JSON-parsed.
 * @returns {Promise<object>} the response payload; `ok:false` only when no topic was usable.
 */
export async function collectNews(request) {
  const started = Date.now();
  const days = clampNumber(request && request.days, 1, MAX_DAYS, MAX_DAYS);
  const limit = clampNumber(request && request.limit, MIN_LIMIT, MAX_LIMIT, 40);
  const refresh = Boolean(request && request.refresh);
  const topics = normalizeTopics(request && request.topics);
  if (!topics.length) {
    return { ok: false, error: '没有可用的主题：请至少填写一个关键词或选择一个来源。', fetchedAt: Date.now() };
  }

  // One task per (topic, source) pair. Deliberately NOT deduplicated by URL: a feed shared
  // by three topics has to contribute its items to all three, each tagged with that topic.
  // The actual fetching is deduplicated one level down, in `loadFeed`'s cache and in-flight
  // map, so a shared feed still costs exactly one HTTP request.
  const tasks = [];
  const urls = new Set();
  for (const topic of topics) {
    for (const feedId of topic.feeds) {
      const feed = FEED_BY_ID.get(feedId);
      if (!feed) continue;
      urls.add(feed.url);
      tasks.push({ kind: 'feed', feed, topic, url: feed.url });
    }
    if (topic.kw.length) {
      const url = googleSearchUrl(topic.kw, topic.lang, days);
      urls.add(url);
      // The synthesised feed object carries its own `url`: `loadFeed` reads `feed.url`, and a
      // search feed exists only for this request, so there is no catalog entry to point at.
      tasks.push({
        kind: 'search',
        feed: { id: 'gnews-search', label: 'Google 新闻搜索', kind: 'rss', url },
        topic,
        url,
      });
    }
  }

  const errors = [];
  const collected = [];
  // Per-source diagnostics, keyed by URL so a feed shared by three topics is reported once.
  const perFeed = new Map();

  const gather = mapLimit(tasks, CONCURRENCY, async (task) => {
    const result = await loadFeed(task.feed, refresh);
    if (result.error) {
      errors.push({
        topic: task.topic.name,
        source: task.feed.label,
        message: result.error,
        stale: result.items.length > 0,
      });
    }
    if (!perFeed.has(task.url)) {
      perFeed.set(task.url, {
        source: task.feed.label,
        topic: task.topic.name,
        items: result.items.length,
        ms: result.ms || 0,
        via: result.via || '',
        cached: Boolean(result.cached),
        error: result.error || '',
      });
    }
    for (const raw of result.items) collected.push(toNewsItem(raw, task, result.cached));
  });

  /**
   * Do not let the slowest source set the refresh time.
   *
   * A dozen-plus hosts is enough that one of them is always slow, and a reader staring at a
   * skeleton for twenty seconds because nature.com is dawdling is a worse outcome than a list
   * that is missing one source and says so. So the gather is raced against a deadline: whatever
   * has answered by then is returned, and the stragglers keep running in the background — their
   * results land in the feed cache, so the *next* refresh (or the next topic switch) has them
   * for free.
   */
  const timedOut = await Promise.race([
    gather.then(() => false),
    new Promise((resolve) => {
      const timer = setTimeout(() => resolve(true), OVERALL_DEADLINE_MS);
      if (typeof timer.unref === 'function') timer.unref();
    }),
  ]);

  const since = Date.now() - days * DAY_MS;
  const merged = mergeItems(collected.slice(), since);

  // Counted from the merged set, not from the fetches: three topics sharing one feed would
  // otherwise report that feed's items three times in the source breakdown.
  const bySource = new Map();
  for (const item of merged) bySource.set(item.source, (bySource.get(item.source) || 0) + 1);
  const items = selectPerTopic(merged, limit);

  const byTopic = topics.map((topic) => ({
    id: topic.id,
    name: topic.name,
    accent: topic.accent,
    count: merged.filter((item) => item.topicId === topic.id).length,
  }));

  return {
    ok: true,
    fetchedAt: Date.now(),
    tookMs: Date.now() - started,
    window: { days, since, until: Date.now() },
    items,
    // The 大事件 strip: the stories several outlets are running right now. Ranked by outlet
    // count — `coverage` — because that is the one number in the payload that actually means
    // "this is an event" rather than "this publisher posted it". A three-outlet floor keeps
    // the strip from filling with the two-outlet coincidences Google clusters produce, and a
    // Chinese-language item wins a tie so the strip reads as "today's world news" to the
    // person looking at a Chinese interface rather than as a US wire digest.
    highlights: merged
      .filter((item) => item.coverage >= 3)
      .sort((a, b) => (b.coverage - a.coverage)
        || ((b.lang === 'zh' ? 1 : 0) - (a.lang === 'zh' ? 1 : 0))
        || (b.publishedAt - a.publishedAt))
      .slice(0, 5),
    stats: {
      days,
      limit,
      // The query's own duration belongs with the rest of the report: the Client stores only
      // `stats`, so a top-level-only field renders as `undefinedms` in the status line.
      tookMs: Date.now() - started,
      total: merged.length,
      shown: items.length,
      feeds: urls.size,
      // The span actually covered, so the UI can say "已覆盖最近 3 天 · 1116 条" honestly
      // instead of implying the whole window was filled.
      span: merged.length
        ? { oldest: merged[merged.length - 1].publishedAt, newest: merged[0].publishedAt }
        : { oldest: 0, newest: 0 },
      topics: byTopic,
      sources: [...bySource.entries()]
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 24),
      // The slowest sources first: this is what turns "the news is slow" into "nature.com
      // took 9 s", both for the UI's source panel and for anyone debugging the crawler.
      perFeed: [...perFeed.values()].sort((a, b) => b.ms - a.ms),
      // `timedOut` means the deadline fired, not that the query failed: `errors` still lists
      // individual sources, and the ones that answered are all present.
      timedOut,
      pending: timedOut ? Math.max(0, urls.size - perFeed.size) : 0,
      hint: timeoutHint(errors, perFeed),
      errors: errors.slice(0, 24),
    },
  };
}

/** Shape one raw feed entry into the item the Client renders. */
function toNewsItem(raw, task, cached) {
  const cluster = task.url.startsWith('https://news.google.com/')
    ? googleCluster(raw.description)
    : { related: [], coverage: 1, hasCluster: false };

  // Google News suffixes every search title with " - <publisher>". The card already shows
  // the publisher on its own line, so the suffix is removed rather than printed twice.
  let title = collapse(raw.title);
  const publisher = collapse(raw.sourceName);
  if (publisher && title.endsWith(' - ' + publisher)) title = title.slice(0, -(publisher.length + 3)).trim();

  // Only a cluster's own summary is worth showing; a search item's description is the
  // title again plus the publisher, which would read as a duplicate line under the card.
  const summarySource = cluster.hasCluster ? '' : raw.description;
  let summary = truncate(plainText(summarySource), 220);
  // Even outside Google News, a feed's `<description>` frequently begins by repeating the
  // headline and ends with the outlet's own name. Rendering that gives a card whose summary
  // line says exactly what its title line said one centimetre above it, so both are trimmed
  // off here — and a summary too short to be worth a line is dropped rather than shown.
  if (summary && title && summary.startsWith(title)) summary = summary.slice(title.length).trim();
  summary = summary.replace(/^[\s·—-]+/, '');
  if (publisher && summary.endsWith(publisher)) summary = summary.slice(0, -publisher.length).trim();
  if (summary.length < 12) summary = '';

  const publishedAt = raw.publishedAt || Date.now();
  const topicLang = task.topic.lang || 'zh';
  return {
    id: hashId(raw.link || title),
    title,
    url: raw.link,
    source: publisher || raw.sourceName || task.feed.label,
    sourceUrl: raw.sourceUrl || '',
    topicId: task.topic.id,
    topicName: task.topic.name,
    accent: task.topic.accent,
    publishedAt,
    summary,
    // The item's own language, not the topic's: a Chinese topic queries the Chinese edition
    // of Google News but also carries Hacker News, whose items are English. The highlights
    // strip uses this to lead with the reader's own language.
    lang: task.kind === 'search' ? topicLang : (task.feed.lang || topicLang),
    related: cluster.related.filter((entry) => entry !== title).slice(0, 8),
    // Outlet count only. Points are a different quantity and live in their own field, so
    // "12 家媒体报道" and "▲ 985" can never be confused for one another in the UI.
    coverage: cluster.coverage,
    points: raw.points || 0,
    comments: raw.comments || 0,
    author: raw.author || '',
    image: raw.image || '',
    category: raw.category || '',
    stale: Boolean(cached),
  };
}

/**
 * Dedupe by story, drop anything outside the retention window, and sort newest first.
 *
 * The window is the module's stated contract — "新闻最多保存 1 周以内" — so it is enforced
 * here, on the Host, as well as in the Client's archive. Two enforcements of one rule is
 * deliberate: the Client's copy survives restarts, and this one governs what a refresh can
 * reintroduce.
 */
function mergeItems(items, since) {
  const freshest = Date.now() + 60 * 60 * 1000; // tolerate a source being an hour ahead
  const byKey = new Map();
  for (const item of items) {
    if (!item.title || !item.url) continue;
    if (item.publishedAt < since || item.publishedAt > freshest) continue;
    const key = dedupeKey(item.title);
    if (!key) continue;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, item);
      continue;
    }
    // Keep the version that carries more evidence: a bigger cluster, then more points,
    // then the newer stamp. Merging the related lists keeps both outlets' coverage.
    const better = (item.coverage * 1000 + item.points) > (existing.coverage * 1000 + existing.points)
      || (item.coverage === existing.coverage && item.publishedAt > existing.publishedAt);
    const winner = better ? item : existing;
    const loser = better ? existing : item;
    const related = [];
    for (const entry of winner.related.concat(loser.related)) {
      if (entry !== winner.title && related.indexOf(entry) < 0 && related.length < 8) related.push(entry);
    }
    byKey.set(key, Object.assign({}, winner, { related }));
  }
  return [...byKey.values()].sort((a, b) => b.publishedAt - a.publishedAt);
}

//#endregion

//#region article extraction

/** Private and link-local IPv4 ranges, as first-octet/prefix pairs. */
const PRIVATE_V4 = [
  [/^10\./, true],
  [/^127\./, true],
  [/^0\./, true],
  [/^169\.254\./, true],
  [/^192\.168\./, true],
  [/^172\.(1[6-9]|2\d|3[01])\./, true],
  [/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, true], // carrier-grade NAT
];

/** True when an IPv4 literal is loopback, link-local, private or otherwise not public. */
function isPrivateV4(host) {
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return false;
  return PRIVATE_V4.some(([pattern]) => pattern.test(host));
}

/**
 * Fence the one URL the Client is allowed to hand over.
 *
 * This route exists so a card can show a real summary and thumbnail instead of a headline
 * alone. That makes it a server-side fetch of a browser-supplied URL, which is the shape of
 * an SSRF hole: without a check, `http://192.168.1.1/` or `http://127.0.0.1:19387/api` would
 * be reachable *from the Host process*, past the browser's own protections. The fence is
 * three layers — scheme whitelist, hostname form check, then DNS resolution — so a name that
 * merely *resolves* to a private address is refused too.
 *
 * Residual risk stated honestly: DNS is resolved here and then re-resolved by `fetch`, so a
 * rebinding attacker wins a narrow race. On a loopback-bound developer GUI whose only client
 * is the user's own browser tab this is an accepted trade, and it is written down rather than
 * assumed away.
 */
async function assertPublicUrl(value) {
  let url;
  try { url = new URL(String(value || '')) } catch { throw new Error('链接格式无效') }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('只允许 http/https 链接');
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (!host) throw new Error('链接缺少主机名');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    throw new Error('拒绝访问本机地址');
  }
  if (host.startsWith('[') || host.includes(':')) throw new Error('拒绝访问 IPv6 字面量地址');
  if (isPrivateV4(host)) throw new Error('拒绝访问内网地址');
  let addresses;
  try {
    addresses = await lookup(host, { all: true });
  } catch {
    throw new Error('域名解析失败');
  }
  for (const entry of addresses) {
    if (entry.family === 4 && isPrivateV4(entry.address)) throw new Error('该域名解析到内网地址');
    if (entry.family === 6 && (entry.address === '::1' || /^f[cd]/i.test(entry.address) || /^fe80/i.test(entry.address))) {
      throw new Error('该域名解析到内网地址');
    }
  }
  return url;
}

/** The content of a `<meta>` tag, whether it leads with `property` or `name`. */
function metaContent(html, keys) {
  for (const key of keys) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp('<meta[^>]+(?:property|name)\\s*=\\s*["\']' + escaped + '["\'][^>]*>', 'i');
    const tag = pattern.exec(html);
    if (!tag) continue;
    const content = /content\s*=\s*["']([\s\S]*?)["']/i.exec(tag[0]);
    if (content) {
      const value = collapse(decodeEntities(content[1]));
      if (value) return value;
    }
  }
  return '';
}

/** Blocks whose text is never the article: chrome, ads, prompts, and the page's own machinery. */
const NON_ARTICLE_BLOCKS = /<(script|style|noscript|iframe|svg|form|nav|header|footer|aside|figure|figcaption|button|select|template)\b[\s\S]*?<\/\1>/gi;

/** Where an article's own text usually lives, most specific first. */
const ARTICLE_REGIONS = [
  /<article\b[^>]*>([\s\S]*?)<\/article>/i,
  /<main\b[^>]*>([\s\S]*?)<\/main>/i,
  /<div[^>]+(?:class|id)\s*=\s*["'][^"']*(?:article|post|entry|story)[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
];

/** Paragraphs shorter than this are captions, credits and bullets far more often than prose. */
const MIN_PARAGRAPH_CHARS = 40;

/** Roughly 15-20 paragraphs: enough to actually read, bounded enough that the pane never mirrors
 *  a publisher's page, and small enough that it does not bloat the local archive. */
const MAX_ARTICLE_PARAGRAPHS = 18;
const MAX_ARTICLE_TEXT = 6400;

/**
 * Pull the readable body out of an article page.
 *
 * Deliberately crude, and crude is the right call here: a real readability implementation is a
 * thousand lines of heuristics that still fails on half the web, and the pane only needs enough
 * prose to answer "what does this story actually say" before the reader decides whether to open
 * the page itself. So it strips the machinery, finds the most article-shaped region it can, and
 * keeps the paragraphs that look like sentences.
 */
export function extractArticleText(html) {
  let body = String(html || '').replace(/<!--[\s\S]*?-->/g, '');
  body = body.replace(NON_ARTICLE_BLOCKS, ' ');
  for (const region of ARTICLE_REGIONS) {
    const match = region.exec(body);
    if (match && match[1] && match[1].length > 400) { body = match[1]; break }
  }
  const paragraphs = [];
  let total = 0;
  const pattern = /<p\b[^>]*>([\s\S]*?)<\/p>/gi;
  let match = pattern.exec(body);
  while (match) {
    const text = collapse(plainText(decodeEntities(match[1])));
    match = pattern.exec(body);
    if (!text || text.length < MIN_PARAGRAPH_CHARS) continue;
    if (total + text.length > MAX_ARTICLE_TEXT) break;
    paragraphs.push(text);
    total += text.length;
    if (paragraphs.length >= MAX_ARTICLE_PARAGRAPHS) break;
  }
  return { paragraphs, chars: total };
}

/**
 * Read the pieces of a page that make a card useful: title, description, image, publication time,
 * and — when asked — the body. Everything else (ads, the paywall, the comment thread) is ignored.
 *
 * `withText` opts into the body extraction above. It is off by default because the image hunt
 * calls this for every thumbnail in the pane, and there the body is 600 KB of waste; the article
 * op turns it on for the one story the reader actually selected.
 */
export function extractArticleMeta(html, finalUrl, withText) {
  const head = String(html || '');
  const title = metaContent(head, ['og:title', 'twitter:title'])
    || plainText((/<title[^>]*>([\s\S]*?)<\/title>/i.exec(head) || [])[1] || '');
  const description = metaContent(head, [
    'og:description', 'twitter:description', 'description', 'weibo:description',
  ]);
  let image = metaContent(head, ['og:image:secure_url', 'og:image', 'twitter:image', 'twitter:image:src']);
  // Relative images are common; a card needs an absolute URL or nothing.
  if (image && !/^https?:\/\//i.test(image)) {
    try { image = new URL(image, finalUrl).href } catch { image = '' }
  }
  const published = metaContent(head, [
    'article:published_time', 'og:published_time', 'datePublished', 'pubdate', 'publishdate',
  ]);
  const body = withText ? extractArticleText(head) : { paragraphs: [], chars: 0 };
  return {
    title: truncate(title, 200),
    description: truncate(description, 400),
    image: /^https?:\/\//i.test(image) ? image : '',
    publishedAt: parseTime(published),
    site: metaContent(head, ['og:site_name']) || hostLabel(finalUrl),
    // The byline row a reader expects under a headline. `author` is the field publishers fill
    // least consistently, so it degrades to '' and the row simply omits it.
    author: truncate(metaContent(head, ['article:author', 'author', 'twitter:creator']), 60),
    paragraphs: body.paragraphs,
    bodyChars: body.chars,
  };
}

/**
 * Fetch one article and return its head metadata.
 *
 * @param {string} rawUrl - the URL from a card, validated by {@link assertPublicUrl}.
 * @returns {Promise<object>} `{ ok, url, ...meta }`; `ok:false` when the page refused or
 *   was not HTML. A refusal is a normal outcome — plenty of publishers block non-browser
 *   fetches — so it is reported, never thrown at the caller as a crash.
 */
export async function enrichArticle(rawUrl) {
  let url;
  try { url = await assertPublicUrl(rawUrl) } catch (error) {
    return { ok: false, error: error.message };
  }
  try {
    const response = await httpGet(url, {
      maxBytes: MAX_ARTICLE_BYTES,
      timeoutMs: 9000,
      fallbackDirect: true,
      headers: { accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5' },
    });
    if (response.contentType && !/text\/html|application\/xhtml/i.test(response.contentType)) {
      return { ok: false, error: '不是网页内容' };
    }
    const meta = extractArticleMeta(response.text, response.url, true);
    return Object.assign({ ok: true, url: response.url, proxies: response.proxies }, meta);
  } catch (error) {
    return { ok: false, error: error && error.message ? error.message : '抓取失败' };
  }
}

//#endregion

//#region article images

/**
 * Card images, and why they are hunted separately from the collect.
 *
 * Almost none of these feeds publish an image in the RSS itself, so a picture has to come from
 * the article's own `og:image`. Doing that inside `collectNews` would put a dozen page loads in
 * front of the reader's first paint; doing it here means the text arrives immediately and the
 * pictures fill in behind it, once per URL ever.
 *
 * The cost is bounded three ways: only the URLs the Client is actually about to draw are asked
 * for, `done` stops each transfer as soon as a complete image tag has arrived (typically well
 * under 100 KB of a 500 KB page), and everything is cached by article URL so a second open of the
 * same story costs nothing.
 */

/** Article url → `{ at, image }`. Six hours: a lead image occasionally changes, not often. */
const imageCache = new Map();
const IMAGE_CACHE_MAX = 800;
const IMAGE_CACHE_TTL_MS = 6 * 3600 * 1000;

/** Most URLs honoured per request, and how wide the fetch runs. */
const IMAGE_MAX_URLS = 24;
const IMAGE_CONCURRENCY = 5;
const IMAGE_DEADLINE_MS = 9000;
const IMAGE_MAX_BYTES = 180000;

/**
 * Has a complete `og:image` (or Twitter equivalent) meta tag arrived?
 *
 * Complete is the operative word: stopping at the substring `og:image` would cut the URL off
 * mid-attribute, and a truncated image URL is worse than none — it renders as a broken picture.
 */
function hasCompleteImageTag(buffer) {
  const text = buffer.toString('latin1');
  return /<meta[^>]+(?:property|name)\s*=\s*["'](?:og:image(?::secure_url|:url)?|twitter:image(?::src)?)["'][^>]*>/i.test(text);
}

/** Fetch one article's image URL, or '' if it has none or refuses to be read. */
async function imageFor(url) {
  const response = await httpGet(url, {
    maxBytes: IMAGE_MAX_BYTES,
    timeoutMs: 8000,
    fallbackDirect: true,
    done: hasCompleteImageTag,
    headers: { accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5' },
  });
  if (response.contentType && !/text\/html|application\/xhtml/i.test(response.contentType)) return '';
  const meta = extractArticleMeta(response.text, response.url);
  return meta.image || '';
}

/**
 * Resolve card images for a list of article URLs.
 *
 * @param {string[]} rawUrls - article URLs, as the Client has them.
 * @returns {Promise<object>} `{ ok, images, cached, fetched, failed, rejected, timedOut, tookMs }`,
 *   where `images` maps article URL → image URL (only entries that resolved).
 */
export async function articleImages(rawUrls) {
  const started = Date.now();
  const urls = [];
  const seen = new Set();
  let rejected = 0;
  for (const raw of Array.isArray(rawUrls) ? rawUrls : []) {
    if (typeof raw !== 'string' || !raw) continue;
    if (seen.has(raw)) continue;
    seen.add(raw);
    // Each URL crosses the same boundary `op=article` guards, so each is fenced the same way.
    // A rejection is counted rather than thrown: one bad entry must not lose the batch.
    try {
      urls.push(await assertPublicUrl(raw));
    } catch {
      rejected += 1;
    }
    if (urls.length >= IMAGE_MAX_URLS) break;
  }

  const images = {};
  let cached = 0;
  const pending = [];
  for (const url of urls) {
    const hit = imageCache.get(url.href);
    if (hit && Date.now() - hit.at < IMAGE_CACHE_TTL_MS) {
      if (hit.image) images[url.href] = hit.image;
      cached += 1;
      continue;
    }
    pending.push(url);
  }

  let fetched = 0;
  let failed = 0;
  let timedOut = false;
  const deadline = started + IMAGE_DEADLINE_MS;
  let cursor = 0;
  const workers = new Array(Math.min(IMAGE_CONCURRENCY, pending.length)).fill(0).map(async () => {
    while (cursor < pending.length) {
      if (Date.now() > deadline) { timedOut = true; return }
      const url = pending[cursor];
      cursor += 1;
      try {
        const image = await imageFor(url);
        fetched += 1;
        if (image) images[url.href] = image;
        imageCache.set(url.href, { at: Date.now(), image });
      } catch {
        // A refusal is remembered as "no image" so the same dead URL is not retried on every
        // refresh; it ages out with the TTL.
        failed += 1;
        imageCache.set(url.href, { at: Date.now(), image: '' });
      }
    }
  });
  await Promise.all(workers);

  while (imageCache.size > IMAGE_CACHE_MAX) {
    const oldest = imageCache.keys().next();
    if (oldest.done) break;
    imageCache.delete(oldest.value);
  }

  return {
    ok: true,
    images,
    cached,
    fetched,
    failed,
    rejected,
    timedOut,
    tookMs: Date.now() - started,
  };
}

//#endregion

//#region translation

/**
 * Translation, and why it is a machine-translation endpoint rather than the model.
 *
 * The module's stated bottom line is that it never issues a model request: a news pane that
 * quietly spent the reader's tokens on 40 headlines would break that promise in the least
 * visible way possible. So the two providers below are ordinary public MT endpoints, reached
 * through the same proxy-aware client as the feeds.
 *
 * They are used in this order:
 *
 *  1. **Google's `translate_a/single` (the `gtx` client endpoint).** No key, no quota page, and
 *     the best quality of the free options by a distance. It is not a documented API, so it is
 *     treated as one that may disappear: any failure falls through rather than erroring.
 *  2. **MyMemory.** Documented, free for anonymous use, and rate-limited to a few thousand
 *     characters a day — fine as a fallback, hopeless as a primary.
 *
 * Batching is by **newline**, which is not a guess: a request with three lines comes back as
 * three segments, each carrying both the translation and the original. That lets a batch be
 * mapped back onto its inputs and *verified* rather than trusted positionally.
 */

const TRANSLATE_TIMEOUT_MS = 12000;

/** Longest joined query per request. Keeps the URL well inside every proxy's comfort zone. */
const TRANSLATE_CHUNK_CHARS = 1400;

/** Most texts per request, independent of length. */
const TRANSLATE_CHUNK_ITEMS = 10;

/** Bound on the host-side translation cache. Translations never change, so there is no TTL. */
const TRANSLATE_CACHE_MAX = 4000;

/** `lang|text → translation`. Shared across requests, so the second topic switch is free. */
const translationCache = new Map();

/**
 * When the primary provider has refused us, stop asking for a while.
 *
 * The `gtx` endpoint answers `429` when it has had enough, and a 429 is not a per-request
 * condition: retrying it for every chunk of every refresh burns the reader's time and makes the
 * endpoint crosser. Skipping straight to the fallback for ten minutes is both faster and politer,
 * and the cache means anything already translated is unaffected either way.
 */
const TRANSLATE_COOLDOWN_MS = 10 * 60 * 1000;
let googleCooldownUntil = 0;

/** True when the text is already in the target language and worth skipping. */
function isMostlyHan(text) {
  const han = (text.match(/[\u3400-\u4dbf\u4e00-\u9fff]/g) || []).length;
  return han >= Math.max(2, text.length * 0.25);
}

/** Split `texts` into chunks bounded by both item count and joined length. */
function chunkTexts(texts) {
  const chunks = [];
  let current = [];
  let length = 0;
  for (const text of texts) {
    if (current.length && (current.length >= TRANSLATE_CHUNK_ITEMS || length + text.length > TRANSLATE_CHUNK_CHARS)) {
      chunks.push(current);
      current = [];
      length = 0;
    }
    current.push(text);
    length += text.length + 1;
  }
  if (current.length) chunks.push(current);
  return chunks;
}

/** Normalise a string for matching a segment's original back to its input. */
function matchKey(value) {
  return collapse(value).replace(/[\s\u3000]+/g, '');
}

/**
 * One Google `gtx` request for up to a chunk of texts.
 * @returns {Promise<Record<string,string>>} translations keyed by the input text.
 */
async function googleTranslate(texts, to) {
  const joined = texts.join('\n');
  const url = 'https://translate.googleapis.com/translate_a/single?client=gtx'
    + '&sl=auto&tl=' + encodeURIComponent(to) + '&dt=t&q=' + encodeURIComponent(joined);
  const response = await httpGet(url, {
    maxBytes: 256000,
    timeoutMs: TRANSLATE_TIMEOUT_MS,
    fallbackDirect: true,
    headers: { accept: 'application/json, */*;q=0.8' },
  });
  const payload = JSON.parse(response.text);
  const segments = Array.isArray(payload) && Array.isArray(payload[0]) ? payload[0] : [];
  const out = {};
  // Segment 0 of a line carries that line's translation; multi-segment lines are concatenated.
  for (const segment of segments) {
    if (!Array.isArray(segment)) continue;
    const translated = String(segment[0] || '');
    const original = String(segment[1] || '');
    if (!translated) continue;
    out[matchKey(original)] = (out[matchKey(original)] || '') + translated;
  }
  // Map back by the original text rather than by position: the endpoint may merge or split
  // lines, and a positional mapping would then hand a story someone else's translation.
  const mapped = {};
  for (const text of texts) {
    const hit = out[matchKey(text)] || out[matchKey(text + '\n')];
    if (!hit) continue;
    const clean = collapse(hit.replace(/\n+/g, ' '));
    // An echo is not a translation, and storing one makes the pane print the same headline twice.
    if (isEchoed(text, clean)) continue;
    mapped[text] = clean;
  }
  return mapped;
}

/** A string with everything but letters and digits removed, for comparing two translations. */
function contentKey(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, '');
}

/**
 * Did the provider hand back the input unchanged?
 *
 * This is not paranoia: a machine-translation endpoint under load answers `200` with the query
 * echoed back, and the pane then shows the English headline twice — once as the translation and
 * once as the original — which looks like a layout bug rather than a provider one. Treated as a
 * miss so the other provider gets a turn and, failing that, the row simply stays untranslated.
 */
function isEchoed(input, output) {
  const a = contentKey(input);
  const b = contentKey(output);
  if (!a || !b) return true;
  return a === b;
}

/** One MyMemory request for a single text. */
async function myMemoryTranslate(text, to) {
  const url = 'https://api.mymemory.translated.net/get?q=' + encodeURIComponent(text)
    + '&langpair=' + encodeURIComponent('en|' + to);
  const response = await httpGet(url, {
    maxBytes: 128000,
    timeoutMs: TRANSLATE_TIMEOUT_MS,
    fallbackDirect: true,
    headers: { accept: 'application/json, */*;q=0.8' },
  });
  const payload = JSON.parse(response.text);
  const translated = payload && payload.responseData && payload.responseData.translatedText;
  if (!translated || /MYMEMORY WARNING/i.test(translated)) return '';
  const clean = collapse(String(translated));
  // Same rule as the primary provider: an echo is a miss, not a translation.
  if (isEchoed(text, clean)) return '';
  return clean;
}

/**
 * Translate a list of texts into `to`.
 *
 * @param {string[]} texts - untrusted input from the Client; bounded and deduplicated here.
 * @param {string} to - a BCP-47-ish tag the endpoints accept (`zh-CN`, `zh-TW`, `en`).
 * @returns {Promise<object>} `{ ok, translations, cached, provider, skipped, failed }`.
 *   `translations` is keyed by the **input text**, which is what lets the Client cache it across
 *   restarts without knowing anything about identifiers.
 */
export async function translateTexts(texts, to) {
  const target = typeof to === 'string' && /^[a-z]{2}(-[A-Za-z]{2,4})?$/.test(to) ? to : 'zh-CN';
  const list = [];
  const seen = new Set();
  for (const raw of Array.isArray(texts) ? texts : []) {
    if (typeof raw !== 'string') continue;
    const text = collapse(raw).slice(0, 400);
    if (text.length < 2) continue;
    // Already in the target language: translating it is a round trip for nothing.
    if (target.startsWith('zh') && isMostlyHan(text)) continue;
    const key = target + '\u0000' + text;
    if (seen.has(key)) continue;
    seen.add(key);
    list.push(text);
    if (list.length >= 200) break;
  }

  const result = {};
  let cached = 0;
  const pending = [];
  for (const text of list) {
    const hit = translationCache.get(target + '\u0000' + text);
    if (hit !== undefined) {
      result[text] = hit;
      cached += 1;
    } else pending.push(text);
  }

  let provider = '';
  const failures = [];
  const providerErrors = [];
  if (pending.length) {
    if (Date.now() < googleCooldownUntil) {
      providerErrors.push({ provider: 'google', message: '冷却中（此前被限流）' });
    } else {
      for (const chunk of chunkTexts(pending)) {
        try {
          const mapped = await googleTranslate(chunk, target);
          if (Object.keys(mapped).length) provider = 'google';
          for (const [text, translated] of Object.entries(mapped)) {
            result[text] = translated;
            translationCache.set(target + '\u0000' + text, translated);
          }
        } catch (error) {
          // Recorded, not swallowed: "translations stopped working" and "the primary provider
          // started refusing us" look identical from the pane, and only one of them is worth
          // chasing. The fallback below still runs.
          const message = error && error.message ? error.message : '翻译失败';
          providerErrors.push({ provider: 'google', message });
          if (/429|403/.test(message)) googleCooldownUntil = Date.now() + TRANSLATE_COOLDOWN_MS;
          break;
        }
      }
    }
    // Only the texts Google did not answer are retried one by one on the fallback: MyMemory's
    // anonymous allowance is small, so it is spent on the gaps and nothing else.
    for (const text of pending) {
      if (result[text] !== undefined) continue;
      try {
        const translated = await myMemoryTranslate(text, target);
        if (translated) {
          result[text] = translated;
          provider = provider || 'mymemory';
          translationCache.set(target + '\u0000' + text, translated);
        } else failures.push(text);
      } catch (error) {
        failures.push(text);
      }
    }
  }

  while (translationCache.size > TRANSLATE_CACHE_MAX) {
    const oldest = translationCache.keys().next();
    if (oldest.done) break;
    translationCache.delete(oldest.value);
  }

  return {
    ok: true,
    target,
    translations: result,
    cached,
    provider,
    skipped: (Array.isArray(texts) ? texts.length : 0) - list.length,
    failed: failures.length,
    // The first failure reasons, so a provider going down is visible in the pane instead of
    // silently degrading to "no translations".
    errors: failures.slice(0, 3).map(String),
    providerErrors,
  };
}

//#endregion

/** Everything the Client needs to render its source pickers and first-run topics. */
export function newsCatalog() {
  return {
    ok: true,
    feeds: FEED_CATALOG.map((feed) => ({
      id: feed.id, label: feed.label, group: feed.group, lang: feed.lang,
    })),
    defaults: DEFAULT_TOPICS,
    limits: { min: MIN_LIMIT, max: MAX_LIMIT, maxDays: MAX_DAYS },
  };
}
