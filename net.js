/**
 * The shared outbound HTTP client for the Workbench bundle.
 *
 * This module exists because **two** features in this plugin have to talk to the network from
 * the Host half: 每日新闻 (`news.js`) and 股票市场 (`stocks.js`). It was originally part of
 * `news.js` and was moved out verbatim when the market module arrived — a second copy of this
 * code would have been a second copy of every bug documented below, and the comments are the
 * only reason those bugs are not still happening.
 *
 * The contract it offers is one function: {@link httpGet} — GET a URL, follow redirects, return
 * decoded text. Two rules are shared by every caller and are the whole reason this is not
 * `fetch`:
 *
 *   1. A feed or a quote endpoint is a different origin with no CORS header, so the browser
 *      cannot read it; the Host process has no such restriction.
 *   2. On a censored network `fetch` cannot reach Google / Yahoo / the BBC at all, while the
 *      machine's own proxy can. `fetch` reads neither `https_proxy` (unless the process was
 *      started with `--use-env-proxy`) nor the Windows WinINET settings, so it is the wrong
 *      tool. This client speaks HTTP itself and tunnels through the proxy it discovers.
 */

import { lookup } from 'node:dns/promises';
import { execFile } from 'node:child_process';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';
import zlib from 'node:zlib';

/** Per-request deadline. Requests that miss it are reported, not retried in-line. */
export const FETCH_TIMEOUT_MS = 12000;

/** Largest response body read by default. PC Gamer's full feed is ~2.5 MB of markup. */
export const MAX_FEED_BYTES = 1_500_000;

/**
 * A browser-like UA is not optional: BBC, Nature, CNBC and Yahoo all answer 403 to unknown
 * agents. This is the same header the DSH GUI itself would send, and nothing here is scraped
 * beyond the public document a reader would have loaded anyway.
 */
export const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
  + '(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

/** The Accept a feed request carries; a caller may replace it per request. */
export const ACCEPT_FEED = 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.95, '
  + 'application/json;q=0.9, */*;q=0.8';

//#region fetching

/**
 * The outbound client, and why it is not plain `fetch`.
 *
 * `fetch` was the first choice — it is the path DSH's own `dsh-http-proxy` plugin wires up,
 * and on an unproxied network it is exactly right. It fails on the network this module was
 * built against, and the failure is worth writing down because it looks like a bug in the
 * feeds:
 *
 *   - `news.google.com`, `feeds.bbci.co.uk` and `www.aljazeera.com` are unreachable direct
 *     from this machine (`UND_ERR_CONNECT_TIMEOUT` / `ECONNRESET`), while `phys.org` and
 *     `ithome.com` answer in milliseconds. That is a censored network, not a slow one.
 *   - The machine has a working proxy: Windows Internet Settings has `ProxyEnable=1`,
 *     `ProxyServer=127.0.0.1:7897`, and `curl -x http://127.0.0.1:7897 <google url>` returns
 *     200 in 1.2 s. Chrome and PowerShell therefore reach Google; Node's `fetch` does not,
 *     because it reads neither the registry nor the WinINET proxy.
 *   - Handing Node a proxy by environment variable works **only** when the variable is set
 *     before the process starts *and* the process runs with `--use-env-proxy`; setting
 *     `process.env.https_proxy` inside a plugin has no effect on the already-installed
 *     global dispatcher. A plugin cannot arrange either at runtime.
 *
 * So this file speaks HTTP itself, over `node:https`, and tunnels through the proxy it
 * discovers. The rules it follows:
 *
 *   1. An explicit proxy from the environment (`https_proxy`/`HTTPS_PROXY`, and the matching
 *      `http_proxy` for plain-HTTP targets) wins — that is DSH's own policy input, and
 *      honouring it keeps this module consistent with the rest of the harness.
 *   2. Otherwise, on Windows, the WinINET settings are read once via `reg.exe` and cached.
 *      This is what makes the module work on a machine whose proxy is configured in the
 *      Control Panel rather than in a shell profile — the common case.
 *   3. `no_proxy` / the registry's `ProxyOverride` bypass list is honoured.
 *   4. If the proxy refuses the connection, the request is retried **direct**. A dead proxy
 *      must not take the domestic sources down with it; being blocked is recoverable, being
 *      unable to read the feeds at all is not.
 *
 * Deliberately no `undici`/`Agent`: this plugin ships as plain files with zero dependencies,
 * and constructing a dispatcher would bypass the global one DSH installs.
 */

/** A host is bypassed when it equals an entry or ends with `.` + entry. Ports are ignored. */
function hostMatchesPattern(host, pattern) {
  const clean = String(pattern || '').trim().toLowerCase().replace(/^\./, '');
  if (!clean) return false;
  const bare = clean.includes(':') ? clean.slice(0, clean.lastIndexOf(':')) : clean;
  if (!bare) return false;
  if (bare === '*') return true;
  return host === bare || host.endsWith('.' + bare);
}

/** Split a `no_proxy` / `ProxyOverride` list; `*` means "bypass everything". */
function bypasses(host, list) {
  const entries = String(list || '').split(/[,;\s]+/).filter(Boolean);
  return entries.some((entry) => hostMatchesPattern(host, entry));
}

/** Normalise `host:port`, `http://host:port/` and `[::1]:port` into `{host, port}`. */
function parseProxy(value, scheme) {
  const text = String(value || '').trim();
  if (!text) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : 'http://' + text;
  try {
    const url = new URL(withScheme);
    const port = Number(url.port || (url.protocol === 'https:' ? 443 : 80));
    if (!url.hostname || !Number.isFinite(port)) return null;
    return { host: url.hostname, port, scheme: url.protocol === 'https:' ? 'https' : 'http', source: scheme };
  } catch { return null }
}

/**
 * Read the WinINET proxy configuration.
 *
 * `reg.exe` rather than a native module because the plugin must stay dependency-free, and
 * rather than `netsh winhttp show proxy` because that reports the *service* proxy, which on
 * this machine is empty while the user-level proxy is set. Read once, cached for
 * {@link PROXY_TTL_MS}: a desktop user can turn their proxy on mid-session, and a news pane
 * that stays broken until restart would be the wrong answer.
 */
const PROXY_TTL_MS = 60 * 1000;
const REG_PATH = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings';
let registryProxyCache = { at: 0, value: null, checked: false };

/** Query one registry value; resolves to '' when the value or the key is absent. */
function regQuery(name) {
  return new Promise((resolve) => {
    execFile('reg.exe', ['query', REG_PATH, '/v', name], { windowsHide: true, timeout: 4000 }, (error, stdout) => {
      if (error) return resolve('');
      const match = new RegExp(name + '\\s+REG_\\w+\\s+(.*)', 'i').exec(String(stdout || ''));
      resolve(match ? match[1].trim() : '');
    });
  });
}

/** The system proxy, or null. Windows-only; other platforms rely on the environment. */
async function systemProxy() {
  if (process.platform !== 'win32') return null;
  if (registryProxyCache.checked && Date.now() - registryProxyCache.at < PROXY_TTL_MS) {
    return registryProxyCache.value;
  }
  let value = null;
  const enabled = await regQuery('ProxyEnable');
  // `ProxyEnable` is a DWORD: "0x1" when on. Anything else means the user is direct.
  if (/0x0*1\b/i.test(enabled) || enabled === '1') {
    const server = await regQuery('ProxyServer');
    const override = await regQuery('ProxyOverride');
    value = parseProxy(server, 'registry');
    if (value) value.bypass = override;
  }
  registryProxyCache = { at: Date.now(), value, checked: true };
  return value;
}

/**
 * The proxy to use for one target URL, or null for a direct connection.
 * `seen` guards against a proxy URL that itself fails to parse into a usable host.
 */
async function proxyFor(url) {
  const env = process.env;
  const explicit = url.protocol === 'https:'
    ? (env.https_proxy || env.HTTPS_PROXY || env.all_proxy || env.ALL_PROXY)
    : (env.http_proxy || env.HTTP_PROXY || env.all_proxy || env.ALL_PROXY);
  const bypass = env.no_proxy || env.NO_PROXY || '';
  const host = url.hostname.toLowerCase();
  if (bypasses(host, bypass)) return null;
  let proxy = parseProxy(explicit, 'env');
  if (!proxy) {
    proxy = await systemProxy();
    if (proxy && bypasses(host, proxy.bypass)) return null;
  }
  if (proxy && (proxy.host === host || proxy.host === 'localhost' && host === 'localhost')) {
    // A proxy pointing at the target is a misconfiguration; going direct is the sane read.
    return null;
  }
  return proxy;
}

/** The zlib transform for a `content-encoding`, or null when the body is already plain. */
function decoderFor(encoding) {
  const value = String(encoding || '').toLowerCase().trim();
  if (!value || value === 'identity') return null;
  if (value === 'gzip' || value === 'x-gzip') return zlib.createGunzip();
  if (value === 'deflate') return zlib.createInflate();
  if (value === 'br') return zlib.createBrotliDecompress();
  return null;
}

/**
 * Open a TLS connection to `target` by asking the proxy for a `CONNECT` tunnel.
 *
 * This is the whole reason the module is not using `fetch`: for an HTTPS target behind an
 * HTTP proxy there is exactly one protocol — `CONNECT host:443`, read the `200`, then start
 * TLS inside the socket. `https-proxy-agent` does the same thing; this is the same 40 lines
 * without the dependency.
 */
function tunnelTo(proxy, target, timeoutMs) {
  return new Promise((resolve, reject) => {
    const socket = proxy.scheme === 'https'
      ? tls.connect({ host: proxy.host, port: proxy.port, servername: proxy.host })
      : net.connect({ host: proxy.host, port: proxy.port });
    let settled = false;
    const fail = (error) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      reject(error);
    };
    socket.setTimeout(timeoutMs, () => fail(new Error('代理连接超时')));
    socket.once('error', fail);
    socket.once('close', () => fail(new Error('代理连接已关闭')));
    socket.once(proxy.scheme === 'https' ? 'secureConnect' : 'connect', () => {
      const port = target.port || (target.protocol === 'https:' ? 443 : 80);
      socket.write('CONNECT ' + target.hostname + ':' + port + ' HTTP/1.1\r\n'
        + 'Host: ' + target.hostname + ':' + port + '\r\n'
        + 'Proxy-Connection: keep-alive\r\n\r\n');
      let head = Buffer.alloc(0);
      const onData = (chunk) => {
        head = Buffer.concat([head, chunk]);
        const end = head.indexOf('\r\n\r\n');
        if (end < 0) {
          if (head.length > 16384) fail(new Error('代理响应异常'));
          return;
        }
        socket.off('data', onData);
        socket.setTimeout(0);
        const status = /^HTTP\/1\.[01]\s+(\d{3})/.exec(head.subarray(0, end).toString('latin1'));
        if (!status || status[1] !== '200') {
          return fail(new Error('代理拒绝隧道 (HTTP ' + (status ? status[1] : '?') + ')'));
        }
        // Bytes after the header block belong to TLS; they must be pushed back.
        const rest = head.subarray(end + 4);
        if (rest.length) socket.unshift(rest);
        settled = true;
        socket.setTimeout(0);
        if (target.protocol !== 'https:') return resolve(socket);
        const secured = tls.connect({ socket, servername: target.hostname });
        secured.once('secureConnect', () => resolve(secured));
        secured.once('error', (error) => { secured.destroy(); reject(error) });
        return undefined;
      };
      socket.on('data', onData);
      return undefined;
    });
  });
}

/**
 * One HTTP request, direct or tunnelled, with a deadline and a byte cap.
 * Resolves `{ status, headers, body }`; rejects only on transport failure.
 *
 * The body is accumulated on a shared `state` rather than in a closure so the wall-clock
 * deadline can still return what arrived. That matters more than it sounds: IGN's feed holds
 * its chunked response open without ever sending the terminating chunk, so `end` never fires
 * and the socket-timeout never triggers either (a socket with data still flowing is not idle).
 * Before this, one such source turned a 4-second refresh into a 63-second one.
 */
function rawRequest(url, options) {
  const timeoutMs = options.timeoutMs || FETCH_TIMEOUT_MS;
  const maxBytes = options.maxBytes || MAX_FEED_BYTES;
  const state = { chunks: [], total: 0, status: 0, headers: {}, truncated: false };
  return new Promise((resolve, reject) => {
    let request;
    let settled = false;
    let deadline = null;
    const partial = () => ({
      status: state.status,
      headers: state.headers,
      body: Buffer.concat(state.chunks),
      truncated: true,
    });
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      if (deadline) clearTimeout(deadline);
      if (error) reject(error); else resolve(value);
    };
    const onResponse = (response) => {
      state.status = response.statusCode;
      state.headers = response.headers;
      const cap = () => {
        if (state.total < maxBytes) return;
        // Enough has arrived; stop the transfer instead of buffering a 2.5 MB feed.
        response.destroy();
        state.truncated = true;
        finish(null, partial());
      };
      const decoder = decoderFor(response.headers['content-encoding']);
      const sink = decoder || response;
      // `options.done(buffer)` lets a caller stop as soon as it has what it came for. Hunting a
      // thumbnail needs only the `<head>`, so without this a card image would cost a full page
      // download per story — 500 KB to read 200 bytes.
      const done = typeof options.done === 'function' ? options.done : null;
      sink.on('data', (chunk) => {
        if (settled) return;
        state.chunks.push(chunk);
        state.total += chunk.length;
        if (done) {
          let satisfied = false;
          try {
            satisfied = done(Buffer.concat(state.chunks), state.total);
          } catch {
            satisfied = false;
          }
          if (satisfied) {
            response.destroy();
            state.truncated = true;
            return finish(null, partial());
          }
        }
        cap();
      });
      sink.on('end', () => finish(null, {
        status: state.status,
        headers: state.headers,
        body: Buffer.concat(state.chunks),
        truncated: state.truncated || state.total >= maxBytes,
      }));
      const onError = (error) => {
        // A truncated gzip stream is expected when the cap fires mid-body; the bytes already
        // decoded are still the head of the document, which is all either caller wants.
        if (state.total > 0) return finish(null, partial());
        finish(error);
      };
      sink.on('error', onError);
      response.on('aborted', () => onError(new Error('连接中断')));
      if (decoder) {
        // Easy to forget and impossible to notice from the outside: without this pipe the
        // decoder never receives a byte, the response stream is never drained, and the
        // request sits there until the socket timeout — which does not even fire, because a
        // socket holding unread data is not idle. Every compressed feed looked like a
        // timeout until this line existed.
        response.on('error', onError);
        response.pipe(decoder);
      }
    };

    const headers = Object.assign({}, options.headers, { host: url.host });
    const proxy = options.proxy;
    if (!proxy) {
      const driver = url.protocol === 'https:' ? https : http;
      request = driver.request(url, { method: options.method || 'GET', headers }, onResponse);
    } else if (url.protocol === 'https:') {
      const agent = new https.Agent({ keepAlive: false });
      // `createConnection` returning an already-secured socket is how an HTTPS proxy agent
      // is built: https.Agent performs the TLS wrapping itself, so the tunnel is the wrap.
      agent.createConnection = (connectOptions, callback) => {
        tunnelTo(proxy, url, timeoutMs).then((socket) => callback(null, socket), (error) => callback(error));
        return undefined;
      };
      request = https.request(url, { method: options.method || 'GET', headers, agent }, onResponse);
    } else {
      // Plain HTTP through a proxy uses the absolute-URI form.
      request = http.request({
        host: proxy.host,
        port: proxy.port,
        method: options.method || 'GET',
        path: url.href,
        headers,
      }, onResponse);
    }

    request.setTimeout(timeoutMs, () => {
      // Inactivity: nothing arrived at all. A response already in hand is returned as partial.
      if (state.total > 0) finish(null, partial());
      else request.destroy(new Error('请求超时'));
    });
    // The wall-clock guard is what actually bounds a request. It is cleared in `finish` and
    // nowhere else — clearing it on the request's `close` event looked equivalent and was not:
    // `close` fires once the response object is torn down, which for a stalled chunked feed
    // never happens, leaving the deadline disarmed exactly when it was needed.
    deadline = setTimeout(() => {
      request.destroy();
      if (state.total > 0) finish(null, partial());
      else finish(new Error('请求超时'));
    }, timeoutMs + 1500);
    request.on('error', (error) => finish(error));
    request.end();
  });
}

/**
 * The headers every request carries. A browser-like UA is not optional: BBC, Nature and
 * CNBC answer 403 to unknown agents. `connection: close` is right here because each request
 * gets a fresh socket and a fresh tunnel — pooling would reuse a tunnel that may have been
 * opened through a proxy the user has since switched off.
 */
function requestHeaders(options) {
  return Object.assign({
    'user-agent': USER_AGENT,
    accept: ACCEPT_FEED,
    'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'accept-encoding': 'gzip, deflate, br',
    connection: 'close',
  }, options.headers || {});
}

/**
 * The charset a response declares in its own `content-type` header, or `''`.
 *
 * Both callers need this and neither can see it: a body's own `<meta charset>` declaration is
 * absent from HTML fragments and entirely absent from the `text/plain` and text/html-typed
 * quote endpoints, which put it in the header instead. 腾讯's quote route answers
 * `text/html; charset=GBK` with a GBK body and no in-band declaration at all, so ignoring the
 * header here means the whole payload is decoded as UTF-8.
 */
function headerCharset(headers) {
  const match = /charset\s*=\s*["']?([\w-]+)/i.exec(String((headers && headers['content-type']) || ''));
  return match ? match[1] : '';
}

/**
 * GET a URL and return decoded text, following redirects.
 *
 * Redirections are followed here rather than by a helper because a proxied 30x has to be
 * re-planned: the new target may bypass the proxy, and a redirect to a different host is
 * exactly where a proxy misconfiguration shows up.
 *
 * @param {string|URL} rawUrl - the target.
 * @param {object} options - `{ headers, accept, charset, timeoutMs, maxBytes, maxRedirects,
 *   fallbackDirect, done }`. `charset` names the body encoding when the response declares none
 *   and the caller knows better than the UTF-8 default.
 * @returns {Promise<{text: string, url: string, contentType: string, truncated: boolean, proxies: string}>}
 */
export async function httpGet(rawUrl, options) {
  const maxRedirects = options.maxRedirects === undefined ? 5 : options.maxRedirects;
  const headers = requestHeaders(options);
  let url = rawUrl instanceof URL ? rawUrl : new URL(String(rawUrl));
  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    const proxy = await proxyFor(url);
    let result;
    try {
      result = await rawRequest(url, Object.assign({}, options, { headers, proxy }));
    } catch (error) {
      // Retry direct, but only when the *proxy* was what failed before any response.
      if (!proxy || !options.fallbackDirect) throw error;
      result = await rawRequest(url, Object.assign({}, options, { headers, proxy: null }));
    }
    const status = result.status || 0;
    if (status >= 300 && status < 400 && result.headers.location) {
      const next = new URL(String(result.headers.location), url);
      if (next.protocol !== 'http:' && next.protocol !== 'https:') throw new Error('重定向到不支持的协议');
      url = next;
      continue;
    }
    if (status < 200 || status >= 300) throw new Error('HTTP ' + status);
    return {
      // The caller's explicit charset wins, then the response's own header, then the body's
      // in-band declaration, then UTF-8. Getting this order wrong is not cosmetic: decoding a
      // GBK payload as UTF-8 replaces the multi-byte characters with replacement characters,
      // and *re-encoding* that text to recover the bytes does not work, because a 2-byte GBK
      // character that became one U+FFFD comes back as one byte — the whole payload shifts by
      // a byte per mangled character and `~`-separated fields re-pair into different fields.
      text: decodeBody(result.body, options.charset || headerCharset(result.headers)),
      url: url.href,
      contentType: String(result.headers['content-type'] || ''),
      truncated: Boolean(result.truncated),
      proxies: proxy ? proxy.source : 'direct',
    };
  }
  throw new Error('重定向次数过多');
}

/**
 * Decode a body using the charset it declares, a caller-supplied one, or UTF-8.
 *
 * Chinese feeds are the reason this exists: cnBeta and several others still ship GBK, and
 * decoding GBK as UTF-8 produces a screen of replacement characters rather than an error.
 * `gb2312`/`gbk` are aliases of `gb18030` in WHATWG encoding, so they are normalised
 * before the attempt list is built.
 *
 * `hint` takes precedence over the document's own in-band declaration, because that is the
 * order the two callers need: a `content-type` header is more authoritative than a `<meta>` a
 * truncated body may have cut off, and a caller that knows the endpoint (腾讯 is GBK with no
 * declaration anywhere) must be able to say so. Decoding a GBK payload as UTF-8 is not a
 * cosmetic failure — see the note in {@link httpGet}: the replacement characters cannot be
 * turned back into the original bytes, and everything after them shifts.
 *
 * @param {Buffer|Uint8Array} bytes - the raw body.
 * @param {string} [hint] - a charset to try first, ahead of anything the document declares.
 */
export function decodeBody(bytes, hint) {
  const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes || []);
  const head = buffer.subarray(0, 512).toString('latin1');
  const declared = /encoding\s*=\s*["']([\w-]+)["']/i.exec(head);
  const raw = (hint || (declared ? declared[1] : 'utf-8')).toLowerCase();
  const normalized = raw === 'gb2312' || raw === 'gbk' ? 'gb18030' : raw;
  for (const charset of [normalized, 'utf-8']) {
    try { return new TextDecoder(charset, { fatal: false }).decode(buffer) } catch { /* next */ }
  }
  return buffer.toString('utf8');
}

//#endregion
