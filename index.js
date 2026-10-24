/**
 * Host half of the Workbench bundle.
 *
 * Three responsibilities, all of which exist because a browser tab cannot do them:
 *
 * 1. **`/workbench-media`** — the desktop background can reference a file **on the local
 *    machine**, and a browser cannot read an arbitrary local path. This route streams such a
 *    file to the GUI. That is what makes the background survive everything: the Client only
 *    ever stores the path, and as long as the file is still on disk it renders — across panel
 *    switches, page reloads and app restarts. No blob URLs, no IndexedDB, no object-URL
 *    lifetime.
 *
 * 2. **`/workbench-news`** — every public news feed is a different origin with no CORS headers,
 *    so a browser `fetch` to `feeds.bbci.co.uk` is blocked before it leaves. The Host has no
 *    such restriction, so the 每日新闻 module asks this route and `news.js` does the crawling.
 *
 * 3. **`/workbench-stocks`** — the same problem twice over: every quote endpoint is a foreign
 *    origin, and the international ones are only reachable through the system proxy, which a
 *    browser `fetch` cannot be told about. The 股票市场 module asks this route and `stocks.js`
 *    talks to Yahoo (primary) and 腾讯 (fallback for A股 / 港股 / 美股, which needs no proxy).
 *
 * All three share one rule: the Client sends **ids, never URLs**. Feed ids and market ids are
 * resolved against a catalog here, so none of these routes is an open proxy that a page the
 * user merely visits could point at the local network. (`/workbench-media` takes an absolute
 * path, and is fenced by an extension whitelist instead.)
 *
 * ## Why `inject` is exported
 *
 * This module used to acquire the webserver with `ctx.get('webServer')` and bail out silently
 * when it came back undefined. Webserver activation awaits `server.listen`, so a sibling entry
 * could run `apply()` while the service was still loading — `get()` returned undefined, the
 * plugin returned, and its fiber still ended up ACTIVE. Neither route was therefore ever
 * registered on a real host, which is exactly what a `/workbench-media` request returning the
 * SPA's fallback 404 (instead of this file's own "an absolute path is required") proved.
 * Declaring the dependency makes the framework wait, which is what every shipped package does.
 */

import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, isAbsolute } from 'node:path';
import { articleImages, collectNews, enrichArticle, newsCatalog, translateTexts } from './news.js';
import {
  deleteRecording,
  diskInfo,
  listMicrophones,
  listRecordings,
  openRecording,
  pickFolder,
  pickRegion,
  previewFrame,
  recordConfig,
  recordingStatus,
  revealRecording,
  setRecordDir,
  startPreview,
  startRecording,
  stopPreview,
  stopRecording,
} from './recorder.js';
import { collectMembers, collectQuotes, stockCatalog, stockMarkets } from './stocks.js';

/** Services this plugin cannot work without; the loader waits for them before `apply`. */
export const inject = ['webServer'];

const MEDIA_ROUTE = '/workbench-media';
const NEWS_ROUTE = '/workbench-news';
const STOCK_ROUTE = '/workbench-stocks';
const RECORD_ROUTE = '/workbench-recorder';

/**
 * Only real media may be served. This route is a background-image loader, not a general
 * file reader: a path outside this list is refused before anything is touched.
 */
const MEDIA_TYPES = {
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.webm': 'video/webm',
  '.ogv': 'video/ogg',
  '.mov': 'video/quicktime',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
};

/**
 * Cross-origin fence for the data routes.
 *
 * `webServer` applies no origin policy of its own — its README is explicit that route owners
 * must enforce their own. That matters here because `op=article` makes the Host fetch a URL,
 * so a page the user merely *visits* could otherwise drive requests from this process.
 *
 * Requiring a custom header is the cheap, standard answer: a cross-origin `fetch` cannot set
 * one without a successful CORS preflight, and these routes answer no preflight. The header is
 * not a secret and is not authentication — it is a same-origin assertion, which is exactly the
 * property being relied on.
 *
 * Each route names its own marker, so one panel's assertion cannot be replayed against another
 * route's endpoint: 每日新闻 sends `news`, 股票市场 sends `stock`, and a request carrying the
 * wrong value is refused on both.
 */
const CLIENT_HEADER = 'x-workbench-client';

function trustedClient(req, marker) {
  return String(req.headers[CLIENT_HEADER] || '') === marker;
}

function reply(res, status, message) {
  try {
    res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(message);
  } catch {
    /* the socket may already be gone */
  }
}

function replyJson(res, status, value) {
  try {
    const body = JSON.stringify(value);
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': Buffer.byteLength(body),
      // Never let the browser pin a news response: the whole module is about "right now".
      'Cache-Control': 'no-store',
    });
    res.end(body);
  } catch {
    /* the socket may already be gone */
  }
}

function parseRange(header, total) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(String(header || ''));
  if (!match) return null;
  const hasStart = match[1] !== '';
  const hasEnd = match[2] !== '';
  if (!hasStart && !hasEnd) return null;
  let start = hasStart ? Number(match[1]) : Math.max(0, total - Number(match[2]));
  let end = hasStart && hasEnd ? Number(match[2]) : total - 1;
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  start = Math.max(0, start);
  end = Math.min(total - 1, end);
  if (start > end) return null;
  return { start, end };
}

async function serveMedia(req, res) {
  let url;
  try {
    url = new URL(String(req.url || ''), 'http://localhost');
  } catch {
    return reply(res, 400, 'bad request url');
  }
  const target = url.searchParams.get('path') || '';
  if (!target || !isAbsolute(target)) return reply(res, 400, 'an absolute path is required');
  const type = MEDIA_TYPES[extname(target).toLowerCase()];
  if (!type) return reply(res, 415, 'unsupported media type');

  let info;
  try {
    info = await stat(target);
  } catch {
    return reply(res, 404, 'file not found');
  }
  if (!info.isFile()) return reply(res, 404, 'not a file');

  const total = info.size;
  res.setHeader('Content-Type', type);
  res.setHeader('Accept-Ranges', 'bytes');
  // The file behind a path can change at any time; never let the browser pin a stale copy.
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Last-Modified', info.mtime.toUTCString());

  const range = parseRange(req.headers.range, total);
  if (range) {
    res.writeHead(206, {
      'Content-Range': `bytes ${range.start}-${range.end}/${total}`,
      'Content-Length': range.end - range.start + 1,
    });
  } else {
    res.writeHead(200, { 'Content-Length': total });
  }
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  const stream = createReadStream(target, range ? { start: range.start, end: range.end } : undefined);
  stream.on('error', () => {
    try { res.destroy() } catch { /* already gone */ }
  });
  stream.pipe(res);
}

/** Read a JSON request body, bounded so a malformed client cannot grow the heap. */
function readJsonBody(req, limitBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > limitBytes) {
        reject(new Error('请求体过大'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (total === 0) {
        resolve({});
        return;
      }
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))) } catch { reject(new Error('请求体不是 JSON')) }
    });
    req.on('error', reject);
  });
}

/**
 * The news route. Three operations on one path, because they are one feature:
 *
 *   GET  ?op=catalog            → the feed catalog and the shipped default topics
 *   GET  ?op=article&url=...    → one article's og: metadata, fetched on demand
 *   POST (body = the query)     → the aggregated, deduped, windowed item list
 *
 * A body-based query rather than a query string: a topic carries up to eight keywords and
 * twelve feed ids, and six topics of those do not fit in a URL that any proxy will pass.
 */
async function serveNews(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') return reply(res, 405, 'GET or POST only');
  if (!trustedClient(req, 'news')) return reply(res, 403, 'missing client marker');

  let url;
  try {
    url = new URL(String(req.url || ''), 'http://localhost');
  } catch {
    return reply(res, 400, 'bad request url');
  }
  const op = url.searchParams.get('op') || (req.method === 'POST' ? 'collect' : 'catalog');

  try {
    if (op === 'catalog') {
      return replyJson(res, 200, newsCatalog());
    }
    if (op === 'article') {
      const target = url.searchParams.get('url') || '';
      if (!target) return reply(res, 400, 'url is required');
      return replyJson(res, 200, await enrichArticle(target));
    }
    if (op === 'collect') {
      // A GET collect is accepted with a `spec` parameter so the route can be exercised from a
      // shell (and by the self-test) without assembling a POST body.
      let request;
      if (req.method === 'POST') {
        request = await readJsonBody(req, 64 * 1024);
      } else {
        const spec = url.searchParams.get('spec');
        request = spec ? JSON.parse(spec) : { topics: newsCatalog().defaults };
      }
      return replyJson(res, 200, await collectNews(request));
    }
    if (op === 'translate') {
      // POST with `{ texts: [...], to: 'zh-CN' }`. The texts are the Client's, so the engine
      // bounds and deduplicates them; nothing here trusts the body beyond its shape.
      const body = req.method === 'POST'
        ? await readJsonBody(req, 256 * 1024)
        : { texts: (url.searchParams.get('texts') || '').split('\n'), to: url.searchParams.get('to') || 'zh-CN' };
      return replyJson(res, 200, await translateTexts(body.texts, body.to));
    }
    if (op === 'images') {
      // POST with `{ urls: [...] }`, or GET with a newline-separated `urls`. Every URL is fenced
      // inside the engine by the same `assertPublicUrl` the article op uses; a rejected entry is
      // counted and skipped rather than failing the batch.
      const body = req.method === 'POST'
        ? await readJsonBody(req, 64 * 1024)
        : { urls: (url.searchParams.get('urls') || '').split('\n') };
      return replyJson(res, 200, await articleImages(body.urls));
    }
    return reply(res, 404, 'unknown op');
  } catch (error) {
    // A failed query is reported as JSON so the Client can show the reason rather than an
    // opaque broken response. Nothing here should ever take the host process down.
    return replyJson(res, 200, {
      ok: false,
      error: error && error.message ? error.message : '新闻服务内部错误',
      fetchedAt: Date.now(),
    });
  }
}

/**
 * The stock route. Three operations on one path, because they are one feature:
 *
 *   GET  ?op=catalog                  → the market catalog and the shipped default selection
 *   POST (body = `{ ids, refresh }`)  → the latest quote for each requested market
 *   GET  ?op=markets                  → the boards that can be opened (点进去看成分股)
 *   POST ?op=members (body = `{ id, limit, refresh }`) → one board's constituent stocks
 *
 * A body-based query for the same reason as the news route: a selection of twelve market ids
 * plus a refresh flag is small, but it is a *selection*, and a query string is the wrong shape
 * for something the Client composes as structured data.
 *
 * `op=quotes` may also be reached with a GET + `spec`, which exists so the route can be driven
 * from a shell and from the offline self-test without assembling a POST body.
 */
async function serveStocks(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') return reply(res, 405, 'GET or POST only');
  if (!trustedClient(req, 'stock')) return reply(res, 403, 'missing client marker');

  let url;
  try {
    url = new URL(String(req.url || ''), 'http://localhost');
  } catch {
    return reply(res, 400, 'bad request url');
  }
  const op = url.searchParams.get('op') || (req.method === 'POST' ? 'quotes' : 'catalog');

  try {
    if (op === 'catalog') return replyJson(res, 200, stockCatalog());
    if (op === 'markets') return replyJson(res, 200, stockMarkets());
    if (op === 'members') {
      // GET + spec exists for the same reason as the quotes one: drivable from a shell and
      // from the offline self-test without building a POST body.
      let request;
      if (req.method === 'POST') {
        request = await readJsonBody(req, 32 * 1024);
      } else {
        const spec = url.searchParams.get('spec');
        request = spec ? JSON.parse(spec) : { id: url.searchParams.get('id') || '' };
      }
      return replyJson(res, 200, await collectMembers(request));
    }
    if (op === 'quotes') {
      let request;
      if (req.method === 'POST') {
        request = await readJsonBody(req, 32 * 1024);
      } else {
        const spec = url.searchParams.get('spec');
        request = spec ? JSON.parse(spec) : { ids: stockCatalog().defaults };
      }
      return replyJson(res, 200, await collectQuotes(request));
    }
    return reply(res, 404, 'unknown op');
  } catch (error) {
    return replyJson(res, 200, {
      ok: false,
      error: error && error.message ? error.message : '行情服务内部错误',
      fetchedAt: Date.now(),
    });
  }
}

/**
 * The recording route. A capture is "start" then "stop"; everything else is about the files
 * that already exist, so the panel can list, play, reveal and delete them without touching
 * the filesystem itself.
 *
 *   GET  ?op=status                          → is a capture running, which file, where is ffmpeg
 *   GET  ?op=list                            → the recording folder and its videos
 *   GET  ?op=devices                         → dshow microphone names
 *   GET  ?op=config                          → the save folder and ffmpeg path
 *   POST ?op=config { dir }                  → change (and persist) the save folder
 *   GET  ?op=frame                           → the latest low-res preview JPEG
 *   POST ?op=preview { on: true|false }      → start / stop the preview process
 *   POST ?op=pick-region                     → full-screen drag picker → { region } or full
 *   POST ?op=start  { fps, crf, mic, region }→ begin a capture
 *   POST ?op=stop                            → finish it and return the file's size
 *   POST ?op=open | reveal | delete { file } → act on one recording in that folder
 */
async function serveRecorder(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') return reply(res, 405, 'GET or POST only');
  if (!trustedClient(req, 'recorder')) return reply(res, 403, 'missing client marker');

  let url;
  try {
    url = new URL(String(req.url || ''), 'http://localhost');
  } catch {
    return reply(res, 400, 'bad request url');
  }
  const op = url.searchParams.get('op') || 'status';

  try {
    if (op === 'status') {
      const disk = await diskInfo();
      return replyJson(res, 200, Object.assign({ ok: true }, await recordingStatus(), { disk: disk.disk }));
    }
    if (op === 'list') {
      const disk = await diskInfo();
      return replyJson(res, 200, Object.assign({ ok: true }, await listRecordings(), { disk: disk.disk }));
    }
    if (op === 'devices') return replyJson(res, 200, Object.assign({ ok: true }, await listMicrophones()));
    if (op === 'config') {
      if (req.method === 'POST') {
        const body = await readJsonBody(req, 8 * 1024);
        const changed = await setRecordDir(body && body.dir);
        const configNow = await recordConfig();
        return replyJson(res, 200, Object.assign({ ok: true }, configNow, changed.ok ? {} : { ok: false, error: changed.error }));
      }
      return replyJson(res, 200, Object.assign({ ok: true }, await recordConfig()));
    }
    if (op === 'frame') {
      // 预览帧是二进制 JPEG，不走 replyJson。没开预览时返回 204，客户端据此显示占位。
      const frame = previewFrame();
      if (!frame) { res.writeHead(204, { 'Cache-Control': 'no-store' }); return res.end() }
      res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Content-Length': frame.length, 'Cache-Control': 'no-store' });
      return res.end(frame);
    }
    if (op === 'preview') {
      const body = req.method === 'POST' ? await readJsonBody(req, 4 * 1024) : { on: url.searchParams.get('on') !== 'false' };
      const wanted = !(body && body.on === false);
      const region = body && body.region && typeof body.region === 'object' ? body.region : null;
      const result = wanted ? await startPreview(region) : stopPreview();
      return replyJson(res, 200, Object.assign({ ok: true, running: wanted }, result));
    }
    if (op === 'pick-region') {
      if (req.method !== 'POST') return reply(res, 405, 'POST only');
      return replyJson(res, 200, await pickRegion());
    }
    if (op === 'pick-folder') {
      if (req.method !== 'POST') return reply(res, 405, 'POST only');
      return replyJson(res, 200, await pickFolder());
    }
    if (op === 'start') {
      const body = req.method === 'POST' ? await readJsonBody(req, 32 * 1024) : {};
      return replyJson(res, 200, await startRecording(body));
    }
    if (op === 'stop') return replyJson(res, 200, await stopRecording());

    const body = req.method === 'POST' ? await readJsonBody(req, 32 * 1024) : { file: url.searchParams.get('file') || '' };
    const file = body && typeof body.file === 'string' ? body.file : '';
    if (op === 'open') return replyJson(res, 200, openRecording(file));
    if (op === 'reveal') return replyJson(res, 200, revealRecording(file));
    if (op === 'delete') {
      const removed = await deleteRecording(file);
      // The list comes back with the delete so the panel never has to ask twice.
      return replyJson(res, 200, Object.assign({}, removed, await listRecordings()));
    }
    return reply(res, 404, 'unknown op');
  } catch (error) {
    return replyJson(res, 200, {
      ok: false,
      error: error && error.message ? error.message : '录屏服务内部错误',
    });
  }
}

export function apply(ctx) {
  const webServer = ctx.webServer
    || (typeof ctx.get === 'function' ? ctx.get('webServer') : undefined);
  if (!webServer || typeof webServer.register !== 'function') return;

  ctx.effect(() => webServer.register({
    kind: 'prefix',
    path: MEDIA_ROUTE,
    handler: (req, res) => { serveMedia(req, res).catch(() => reply(res, 500, 'media read failed')) },
  }), 'workbench.media-route');

  ctx.effect(() => webServer.register({
    kind: 'prefix',
    path: NEWS_ROUTE,
    handler: (req, res) => { serveNews(req, res).catch(() => reply(res, 500, 'news failed')) },
  }), 'workbench.news-route');

  ctx.effect(() => webServer.register({
    kind: 'prefix',
    path: STOCK_ROUTE,
    handler: (req, res) => { serveStocks(req, res).catch(() => reply(res, 500, 'stocks failed')) },
  }), 'workbench.stock-route');

  // 录屏：屏幕抓取在 Host 侧（Electron 的页面里没有 getDisplayMedia 选择器），
  // 输出是磁盘上的 MP4，所以渲染进程只负责开始/停止和列文件。
  ctx.effect(() => webServer.register({
    kind: 'prefix',
    path: RECORD_ROUTE,
    handler: (req, res) => { serveRecorder(req, res).catch(() => reply(res, 500, 'recorder failed')) },
  }), 'workbench.record-route');
}
