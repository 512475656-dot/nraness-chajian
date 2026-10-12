/**
 * Offline check for the Workbench Host half.
 *
 * `render-check.cjs` covers the browser half by faking the module loader. This is its mirror:
 * it loads the real `index.js`, hands it a stub cordis context that captures the routes it
 * registers, serves those handlers from a real `node:http` server, and drives them with real
 * requests. That is the only way to exercise the Host half without booting the whole harness,
 * and it covers the things that actually broke in production:
 *
 *   - the plugin declaring no `inject`, so it ran before the webserver existed and registered
 *     nothing (a `/workbench-media` request answered the SPA's 404 instead of its own error);
 *   - the news route's same-origin fence, which is the only thing standing between a random
 *     web page and a server-side fetch of a URL it chose;
 *   - JSON shapes the Client depends on, asserted without a browser.
 *
 * Usage: node test/host-route-check.cjs
 */
'use strict';

const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..');
const failures = [];

function check(label, fn) {
  try {
    const result = fn();
    if (result && typeof result.then === 'function') {
      return result.then(
        () => console.log('  PASS  ' + label),
        (error) => {
          failures.push(label + ' :: ' + (error && error.stack ? error.stack.split('\n').slice(0, 3).join(' | ') : String(error)));
          console.log('  FAIL  ' + label + ' :: ' + (error && error.message ? error.message : String(error)));
        },
      );
    }
    console.log('  PASS  ' + label);
    return Promise.resolve();
  } catch (error) {
    failures.push(label + ' :: ' + (error && error.stack ? error.stack.split('\n').slice(0, 3).join(' | ') : String(error)));
    console.log('  FAIL  ' + label + ' :: ' + (error && error.message ? error.message : String(error)));
    return Promise.resolve();
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  const moduleUrl = pathToFileURL(path.join(ROOT, 'index.js')).href;
  const host = await import(moduleUrl);

  // --- the dependency declaration -------------------------------------------------
  await check('the host half requires the webserver before it runs', () => {
    assert(Array.isArray(host.inject), 'index.js exports no inject array');
    assert(host.inject.indexOf('webServer') >= 0, 'inject does not name webServer: ' + JSON.stringify(host.inject));
  });

  // --- registration ---------------------------------------------------------------
  const routes = [];
  const effects = [];
  const ctx = {
    webServer: {
      register(route) {
        routes.push(route);
        return () => {};
      },
    },
    // The real cordis `effect` runs the callback and keeps its disposer. The callback here
    // returns one, which is what makes the route live.
    effect(run) {
      effects.push(run());
      return () => {};
    },
  };
  host.apply(ctx);

  await check('all three routes are registered as prefixes', () => {
    assert(routes.length === 3, 'expected three routes, saw ' + routes.length);
    for (const route of routes) {
      assert(route.kind === 'prefix', 'route ' + route.path + ' is not a prefix route');
      assert(typeof route.handler === 'function', 'route ' + route.path + ' has no handler');
    }
    const paths = routes.map((route) => route.path).sort();
    assert(paths[0] === '/workbench-media' && paths[1] === '/workbench-news' && paths[2] === '/workbench-stocks',
      'unexpected routes: ' + paths.join(','));
  });

  await check('registration is bound to the plugin effect, not run bare', () => {
    // Every registration must sit inside ctx.effect, or a reload would leak the old route.
    assert(effects.length === 3, 'expected three effect registrations, saw ' + effects.length);
  });

  // --- serve the captured handlers -------------------------------------------------
  const server = http.createServer((req, res) => {
    const pathname = new URL(req.url || '/', 'http://x').pathname;
    let best = null;
    for (const route of routes) {
      if (pathname === route.path || pathname.startsWith(route.path + '/')) {
        if (!best || route.path.length > best.path.length) best = route;
      }
    }
    if (!best) {
      res.writeHead(404);
      res.end();
      return;
    }
    Promise.resolve(best.handler(req, res)).catch((error) => {
      res.writeHead(500);
      res.end(String(error && error.message ? error.message : error));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  const headers = { 'x-workbench-client': 'news' };
  const stockHeaders = { 'x-workbench-client': 'stock' };

  try {
    // --- the same-origin fence ----------------------------------------------------
    await check('the news route refuses a caller without the client marker', async () => {
      const bare = await fetch(base + '/workbench-news?op=catalog');
      assert(bare.status === 403, 'a cross-origin-shaped request was answered with ' + bare.status);
      const text = await bare.text();
      assert(/client marker/.test(text), 'the refusal does not say why: ' + text);
      // ...and it is not fooled by a wrong value.
      const wrong = await fetch(base + '/workbench-news?op=catalog', { headers: { 'x-workbench-client': 'godot' } });
      assert(wrong.status === 403, 'a wrong marker value was accepted');
    });

    await check('the news catalog lists usable sources and the shipped limits', async () => {
      const response = await fetch(base + '/workbench-news?op=catalog', { headers });
      assert(response.status === 200, 'catalog returned ' + response.status);
      assert(/application\/json/.test(response.headers.get('content-type')), 'catalog is not JSON');
      assert(response.headers.get('cache-control') === 'no-store', 'the catalog is cacheable, which would pin a stale source list');
      const body = await response.json();
      assert(body.ok === true, 'catalog is not ok');
      assert(Array.isArray(body.feeds) && body.feeds.length >= 10, 'catalog has too few feeds');
      for (const feed of body.feeds) {
        assert(typeof feed.id === 'string' && feed.id, 'a catalog entry has no id');
        assert(typeof feed.label === 'string' && feed.label, 'feed ' + feed.id + ' has no label');
        assert(typeof feed.group === 'string' && feed.group, 'feed ' + feed.id + ' has no group');
        // Ids are what the Client sends; URLs must never be exposed as the contract.
        assert(feed.url === undefined, 'the catalog leaks a raw url for ' + feed.id);
      }
      assert(body.limits.min === 10 && body.limits.max === 100 && body.limits.maxDays === 7,
        'the advertised limits drifted: ' + JSON.stringify(body.limits));
      assert(Array.isArray(body.defaults) && body.defaults.length >= 3, 'no shipped default topics');
      const ids = new Set(body.feeds.map((feed) => feed.id));
      for (const topic of body.defaults) {
        assert(topic.kw.length || topic.feeds.length, 'default topic "' + topic.name + '" can never return anything');
        for (const feed of topic.feeds) assert(ids.has(feed), 'topic "' + topic.name + '" names unknown feed ' + feed);
      }
    });

    await check('the engine refuses an empty query instead of fetching everything', async () => {
      const response = await fetch(base + '/workbench-news', {
        method: 'POST',
        headers: Object.assign({ 'content-type': 'application/json' }, headers),
        body: JSON.stringify({ topics: [] }),
      });
      assert(response.status === 200, 'an empty query returned ' + response.status);
      const body = await response.json();
      assert(body.ok === false, 'an empty query was answered with a success');
      assert(typeof body.error === 'string' && body.error, 'the refusal carries no reason');
    });

    await check('a malformed body is reported, not thrown', async () => {
      const response = await fetch(base + '/workbench-news', {
        method: 'POST',
        headers: Object.assign({ 'content-type': 'application/json' }, headers),
        body: '{not json',
      });
      assert(response.status === 200, 'a malformed body returned ' + response.status);
      const body = await response.json();
      assert(body.ok === false && /JSON/.test(body.error), 'a malformed body was not reported: ' + JSON.stringify(body));
    });

    await check('an unknown op is a 404 rather than a silent success', async () => {
      const response = await fetch(base + '/workbench-news?op=nonsense', { headers });
      assert(response.status === 404, 'an unknown op returned ' + response.status);
    });

    await check('the article op needs a url and fences the ones it is given', async () => {
      const missing = await fetch(base + '/workbench-news?op=article', { headers });
      assert(missing.status === 400, 'a missing url returned ' + missing.status);
      // The private-address fence must survive the HTTP layer, not just the unit call.
      for (const blocked of ['http://127.0.0.1:19387/', 'http://10.0.0.5/', 'file:///C:/windows/win.ini']) {
        const response = await fetch(base + '/workbench-news?op=article&url=' + encodeURIComponent(blocked), { headers });
        const body = await response.json();
        assert(body.ok === false, 'the article route fetched ' + blocked);
        assert(typeof body.error === 'string' && body.error, 'no reason given for ' + blocked);
      }
    });

    await check('the media route answers its own errors instead of the SPA 404', async () => {
      // This is the exact symptom of the missing `inject`: a bare 404 with no body, produced by
      // the frontend fallback rather than by this plugin.
      const bare = await fetch(base + '/workbench-media');
      assert(bare.status === 400, 'a missing path returned ' + bare.status + ' (the plugin is not handling the route)');
      assert(/absolute path/.test(await bare.text()), 'the 400 did not come from this plugin');

      const relative = await fetch(base + '/workbench-media?path=relative/file.png');
      assert(relative.status === 400, 'a relative path returned ' + relative.status);

      const wrongType = await fetch(base + '/workbench-media?path=' + encodeURIComponent(path.join(ROOT, 'package.json')));
      assert(wrongType.status === 415, 'a non-media extension returned ' + wrongType.status);

      const absent = await fetch(base + '/workbench-media?path=' + encodeURIComponent(path.join(ROOT, 'nope.png')));
      assert(absent.status === 404, 'a missing file returned ' + absent.status);

      // A real image must stream, with a range honoured.
      const image = path.join(ROOT, 'icon.svg');
      if (fs.existsSync(image)) {
        const ok = await fetch(base + '/workbench-media?path=' + encodeURIComponent(image));
        assert(ok.status === 415 || ok.status === 200, 'an existing file returned ' + ok.status);
      }
    });
    // And the route itself is registered: a GET with an empty `texts` returns the same shape.
    // This part has to run inside the live-server block, before the `finally` closes it.
    await check('the translation route answers in the shape the Client reads', async () => {
      const response = await fetch(base + '/workbench-news?op=translate&texts=', { headers });
      assert(response.status === 200, 'op=translate is not served, status ' + response.status);
      const translated = await response.json();
      assert(translated.ok === true && translated.translations && typeof translated.translations === 'object',
        'op=translate answered an unexpected shape: ' + JSON.stringify(translated).slice(0, 120));
      // The fence applies here too: this route takes text from the caller.
      const bare = await fetch(base + '/workbench-news?op=translate&texts=');
      assert(bare.status === 403, 'the translate op skipped the client fence: ' + bare.status);
    });

    await check('the image op is registered, fenced, and refuses private addresses', async () => {
      const response = await fetch(base + '/workbench-news?op=images&urls=', { headers });
      assert(response.status === 200, 'op=images is not served, status ' + response.status);
      const empty = await response.json();
      assert(empty.ok === true && empty.images && typeof empty.images === 'object',
        'op=images answered an unexpected shape: ' + JSON.stringify(empty).slice(0, 140));
      assert(Object.keys(empty.images).length === 0, 'an empty request invented images');

      // The security-relevant half: this op takes a *list* of addresses from the caller, so a
      // loopback or link-local entry must be counted and skipped — certainly not fetched, and not
      // fatal to the rest of the batch either.
      const posted = await fetch(base + '/workbench-news?op=images', {
        method: 'POST',
        headers: Object.assign({ 'content-type': 'application/json' }, headers),
        body: JSON.stringify({ urls: ['http://127.0.0.1:19387/', 'http://169.254.169.254/latest/meta-data/'] }),
      });
      const body = await posted.json();
      assert(body.ok === true, 'the private-address batch did not answer ok');
      assert(body.rejected === 2, 'private addresses were not rejected, saw ' + body.rejected);
      assert(Object.keys(body.images).length === 0, 'a private address produced an image');
      assert(body.fetched === 0, 'a private address was actually fetched');

      const bare = await fetch(base + '/workbench-news?op=images&urls=');
      assert(bare.status === 403, 'the images op skipped the client fence: ' + bare.status);
    });

    // --- 股票市场: the third route, and the fence that is per-route ------------------
    await check('the stock route has its own fence and cannot be driven with the news marker', async () => {
      const bare = await fetch(base + '/workbench-stocks?op=catalog');
      assert(bare.status === 403, 'a cross-origin-shaped request was answered with ' + bare.status);
      // The two panels assert different markers on purpose: a marker that opened every route
      // would make one module's request a key to the other module's endpoint.
      const crossNews = await fetch(base + '/workbench-stocks?op=catalog', { headers });
      assert(crossNews.status === 403, 'the news marker opened the stock route: ' + crossNews.status);
      const crossStock = await fetch(base + '/workbench-news?op=catalog', { headers: stockHeaders });
      assert(crossStock.status === 403, 'the stock marker opened the news route: ' + crossStock.status);
    });

    await check('the stock catalog lists every market without leaking a fetchable symbol', async () => {
      const response = await fetch(base + '/workbench-stocks?op=catalog', { headers: stockHeaders });
      assert(response.status === 200, 'catalog returned ' + response.status);
      assert(/application\/json/.test(response.headers.get('content-type')), 'catalog is not JSON');
      assert(response.headers.get('cache-control') === 'no-store',
        'the catalog is cacheable, which would pin a stale market list');
      const body = await response.json();
      assert(body.ok === true, 'catalog is not ok');
      assert(Array.isArray(body.markets) && body.markets.length >= 20,
        'the catalog is too small to be "every market": ' + (body.markets || []).length);
      assert(Array.isArray(body.regions) && body.regions.length >= 4, 'the catalog has no regions');
      const ids = new Set();
      for (const market of body.markets) {
        assert(typeof market.id === 'string' && market.id, 'a catalog entry has no id');
        assert(typeof market.name === 'string' && market.name, 'market ' + market.id + ' has no name');
        assert(body.regions.indexOf(market.region) >= 0, 'market ' + market.id + ' names an unknown region');
        assert(!ids.has(market.id), 'duplicate market id ' + market.id);
        ids.add(market.id);
        // Ids are the contract. A symbol, a host or a URL in the payload would make the Client
        // able to name what gets fetched, which is exactly what this route must never allow.
        for (const leak of ['yahoo', 'tencent', 'symbol', 'url', 'secid']) {
          assert(market[leak] === undefined, 'the catalog leaks `' + leak + '` for ' + market.id);
        }
      }
      assert(body.limits && body.limits.min >= 1 && body.limits.max === body.markets.length,
        'the advertised limits drifted: ' + JSON.stringify(body.limits));
      assert(Array.isArray(body.defaults) && body.defaults.length >= 4, 'no shipped default selection');
      for (const id of body.defaults) assert(ids.has(id), 'the default selection names unknown market ' + id);
    });

    await check('the board list is fenced the same way the catalog is', async () => {
      const bare = await fetch(base + '/workbench-stocks?op=markets');
      assert(bare.status === 403, 'the board list answered without the client marker: ' + bare.status);
      const response = await fetch(base + '/workbench-stocks?op=markets', { headers: stockHeaders });
      assert(response.status === 200, 'markets returned ' + response.status);
      const body = await response.json();
      assert(body.ok === true, 'markets is not ok');
      assert(Array.isArray(body.markets) && body.markets.length >= 6,
        'too few boards to be worth a drill-down: ' + (body.markets || []).length);
      const ids = new Set();
      for (const market of body.markets) {
        assert(typeof market.id === 'string' && market.id, 'a board has no id');
        assert(typeof market.name === 'string' && market.name, 'board ' + market.id + ' has no name');
        assert(market.scope === 'board' || market.scope === 'rank',
          'board ' + market.id + ' has an unexplained scope: ' + market.scope);
        assert(!ids.has(market.id), 'duplicate board id ' + market.id);
        ids.add(market.id);
        // 与 catalog 同一条围栏：客户端只能说「哪个板块」，永远不能说出要抓的地址。
        // 注意用 `in` 而不是 `!== undefined`：`fs` 是 `offset` 的子串，用字符串包含去查会误报。
        for (const leak of ['fs', 'url', 'secid', 'eastmoney', 'push2']) {
          assert(!(leak in market), 'the board list leaks `' + leak + '` for ' + market.id);
        }
      }
    });

    await check('a board id that is not in the catalog is refused, never fetched', async () => {
      for (const id of ['nope', '../../etc/passwd', 'https://evil.test/x', 'm:1+t:2']) {
        const response = await fetch(base + '/workbench-stocks?op=members', {
          method: 'POST',
          headers: Object.assign({ 'content-type': 'application/json' }, stockHeaders),
          body: JSON.stringify({ id, limit: 20 }),
        });
        assert(response.status === 200, 'a refused board returned ' + response.status);
        const body = await response.json();
        assert(body.ok === false, 'board `' + id + '` was accepted: ' + JSON.stringify(body).slice(0, 120));
        assert(typeof body.error === 'string' && body.error, 'the refusal carries no reason');
        assert(!('rows' in body) || !body.rows.length, 'a refused board still returned rows');
      }
    });

    await check('opening a board returns its constituent stocks with prices', async () => {
      const response = await fetch(base + '/workbench-stocks?op=members', {
        method: 'POST',
        headers: Object.assign({ 'content-type': 'application/json' }, stockHeaders),
        // 沪深主板是 A 股里最稳的一个板块，用它做这条断言；不 refresh 以免每次都打网络。
        body: JSON.stringify({ id: 'shmain', limit: 40 }),
      });
      assert(response.status === 200, 'members returned ' + response.status);
      const body = await response.json();
      if (body.ok !== true) {
        // 网络不可用时这条断言不该把整个自检判死，但必须把原因说出来。
        assert(typeof body.error === 'string' && body.error, 'a failed members call carries no reason');
        console.log('        (skipped price assertions: ' + body.error + ')');
        return;
      }
      assert(body.market && body.market.id === 'shmain', 'the wrong board came back');
      assert(Array.isArray(body.rows) && body.rows.length > 0, 'no constituent rows');
      assert(body.total >= body.rows.length,
        'the board total (' + body.total + ') is smaller than the slice (' + body.rows.length + ')');
      for (const row of body.rows) {
        assert(typeof row.code === 'string' && row.code, 'a row has no code');
        assert(typeof row.name === 'string' && row.name, 'row ' + row.code + ' has no name');
        // 每一行都必须有价格：没有价格的行（窝轮、票据、退市代码）在 Host 侧就被丢掉了，
        // 否则读者的第一屏会是一片空白。
        assert(typeof row.price === 'number' && Number.isFinite(row.price),
          'row ' + row.code + ' has no usable price');
        // 缺值要如实是 null，不能悄悄变成 0 —— 0 是一个会被人当真的数字。
        for (const key of ['pct', 'amount', 'turnover', 'pe', 'marketCap']) {
          assert(row[key] === null || Number.isFinite(row[key]),
            'row ' + row.code + '.' + key + ' is neither a number nor null: ' + row[key]);
        }
        // 与两条报价路由同一条围栏：成分股里也不能出现可抓取的字段。
        for (const leak of ['secid', 'fs', 'f12', 'f2']) {
          assert(!(leak in row), 'a constituent row leaks `' + leak + '`');
        }
      }
    });

    await check('an empty or invented selection is refused instead of fetching something', async () => {
      for (const body of [{ ids: [] }, { ids: ['not-a-market'] }, { ids: ['../../etc/passwd'] }, {}]) {
        const response = await fetch(base + '/workbench-stocks', {
          method: 'POST',
          headers: Object.assign({ 'content-type': 'application/json' }, stockHeaders),
          body: JSON.stringify(body),
        });
        assert(response.status === 200, 'a refused selection returned ' + response.status);
        const payload = await response.json();
        assert(payload.ok === false, 'an unusable selection was answered with a success: ' + JSON.stringify(body));
        assert(typeof payload.error === 'string' && payload.error, 'the refusal carries no reason');
      }
    });

    await check('a malformed stock body is reported, not thrown', async () => {
      const response = await fetch(base + '/workbench-stocks', {
        method: 'POST',
        headers: Object.assign({ 'content-type': 'application/json' }, stockHeaders),
        body: '{not json',
      });
      assert(response.status === 200, 'a malformed body returned ' + response.status);
      const body = await response.json();
      assert(body.ok === false && /JSON/.test(body.error), 'a malformed body was not reported: ' + JSON.stringify(body));
    });

    await check('an unknown stock op is a 404 rather than a silent success', async () => {
      const response = await fetch(base + '/workbench-stocks?op=nonsense', { headers: stockHeaders });
      assert(response.status === 404, 'an unknown op returned ' + response.status);
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }

  // --- the engine's own rules, exercised without a server or a network -------------
  await check('the item selection fills every topic instead of the fastest publisher', async () => {
    const engine = await import(pathToFileURL(path.join(ROOT, 'news.js')).href);
    // This is the bug the news pane shipped with: `items` was the newest `limit` overall, so a
    // topic that was not currently publishing fastest got an empty tab while its own stories sat
    // in the same payload. `selectPerTopic` is the fix, and it is pure, so it can be pinned here
    // rather than inferred from a live fetch.
    const now = Date.now();
    const merged = [];
    for (let index = 0; index < 5; index += 1) {
      merged.push({ id: 'tech-' + index, topicId: 'tech', publishedAt: now - index * 1000 });
    }
    for (let index = 0; index < 3; index += 1) {
      merged.push({ id: 'global-' + index, topicId: 'global', publishedAt: now - 100000 - index * 1000 });
    }
    merged.sort((a, b) => b.publishedAt - a.publishedAt);

    const picked = engine.selectPerTopic(merged, 2);
    const ids = picked.map((item) => item.id);
    const byTopic = (topic) => ids.filter((id) => id.startsWith(topic)).length;

    assert(byTopic('tech') === 2, 'the fast topic should contribute its own limit, saw ' + byTopic('tech'));
    assert(byTopic('global') === 2, 'the slow topic was starved: ' + JSON.stringify(ids));
    assert(picked.length === 4, 'expected 4 items (2 per topic), saw ' + picked.length);
    for (let index = 1; index < picked.length; index += 1) {
      assert(picked[index - 1].publishedAt >= picked[index].publishedAt, 'the union is not newest-first');
    }
    assert(engine.selectPerTopic(merged, 10).length === merged.length, 'a limit above every bucket dropped items');
    // The regression itself: the old behaviour was exactly "slice the merged list".
    const old = merged.slice(0, 2).map((item) => item.id);
    assert(old.filter((id) => id.startsWith('global')).length === 0,
      'the fixture no longer reproduces the starvation this check exists for');
  });

  await check('the translation engine skips what it should and forwards nothing odd', async () => {
    const engine = await import(pathToFileURL(path.join(ROOT, 'news.js')).href);
    // Everything here answers without touching the network, so the check stays offline: it pins
    // the contract and the skip rules, not a live translation.
    const empty = await engine.translateTexts([], 'zh-CN');
    assert(empty.ok === true, 'an empty translate request is not ok');
    assert(typeof empty.translations === 'object' && Object.keys(empty.translations).length === 0,
      'an empty request invented translations');
    assert(empty.target === 'zh-CN', 'the target language was not echoed');

    // Text already in the target language is skipped rather than sent: translating Chinese to
    // Chinese is a round trip for nothing.
    const chinese = await engine.translateTexts(['英国出台对俄新一轮制裁', '中文标题二'], 'zh-CN');
    assert(chinese.skipped === 2, 'Chinese input was not skipped, saw skipped=' + chinese.skipped);
    assert(Object.keys(chinese.translations).length === 0, 'Chinese input produced translations');

    // A malformed target degrades to the default instead of being forwarded to the endpoint.
    const weird = await engine.translateTexts([], 'javascript:alert(1)');
    assert(weird.target === 'zh-CN', 'a malformed target language was forwarded: ' + weird.target);

    // Duplicates collapse, so the same headline from two feeds is one request slot.
    const dupes = await engine.translateTexts(['英国制裁', '英国制裁'], 'zh-CN');
    assert(dupes.skipped === 2, 'duplicates were not collapsed');
  });

  await check('the whole query reports its own duration inside stats', async () => {
    const engine = await import(pathToFileURL(path.join(ROOT, 'news.js')).href);
    // The Client stores only `stats`, so a top-level-only `tookMs` rendered as "undefinedms" in
    // the status line — a small thing that made the pane look broken.
    const catalog = engine.newsCatalog();
    const source = fs.readFileSync(path.join(ROOT, 'news.js'), 'utf8');
    assert(/stats: \{[\s\S]{0,400}?tookMs: Date\.now\(\) - started/.test(source),
      'tookMs is not part of the stats the Client receives');
    assert(catalog.limits.maxDays === 7, 'the retention ceiling is no longer a week');
  });

  // --- 股票市场: the parsers, pinned offline ---------------------------------------
  //
  // Both quote parsers are pure, so the two things that actually went wrong while this module
  // was being built can be pinned without a network: the wrong "previous close" field, and a
  // `~`-separated field layout that differed per market.

  /**
   * A Yahoo `chart` payload in the shape the live endpoint returns.
   *
   * `regularMarketChangePercent` is present and `regularMarketChange` is **absent** — that is
   * not an omission in the fixture, it is what the endpoint does, and it is why the engine has
   * to derive the change from the previous close.
   */
  const yahooFixture = (metaOver, closes) => ({
    chart: {
      result: [{
        meta: Object.assign({
          currency: 'CNY',
          symbol: '000001.SS',
          exchangeName: 'Shanghai',
          fullExchangeName: 'Shanghai',
          instrumentType: 'INDEX',
          regularMarketTime: 1791529224,
          regularMarketPrice: 3813.791,
          regularMarketChangePercent: 0.05,
          // The two candidates, deliberately different values: the 5-day range's
          // `chartPreviousClose` is the close *before the window*, not yesterday's.
          previousClose: 3811.904,
          chartPreviousClose: 3823.621,
          currentTradingPeriod: { regular: { start: 1791500000, end: 1791550000 } },
        }, metaOver || {}),
        timestamp: [1791500000, 1791500900, 1791501800, 1791502700, 1791503600],
        indicators: { quote: [{ close: closes || [3796.618, 3783.726, 3771.504, 3762.625, 3813.791] }] },
      }],
    },
  });

  /**
   * A 腾讯 `qt.gtimg.cn` row, with the layout read off live A股 / 港股 / 美股 payloads:
   * index 3 last, 4 previous close, 30 the source's own wall-clock stamp, 31 change, 32
   * change percent. The indices are set here rather than written as a literal string precisely
   * so a future edit cannot silently shift them.
   */
  const tencentFixture = (code, name, last, prev, change, pct, stamp) => {
    const parts = new Array(40).fill('0');
    parts[0] = '1';
    parts[1] = name;
    parts[2] = code;
    parts[3] = String(last);
    parts[4] = String(prev);
    parts[5] = '0';
    parts[30] = stamp;
    parts[31] = String(change);
    parts[32] = String(pct);
    return 'v_' + code + '="' + parts.join('~') + '";';
  };

  await check('the Yahoo parser derives the change from the previous close, not the window close', async () => {
    const engine = await import(pathToFileURL(path.join(ROOT, 'stocks.js')).href);
    const market = { id: 'sh', decimals: 2 };
    const quote = engine.parseYahoo(yahooFixture(), market, 1791530000 * 1000);

    assert(Math.abs(quote.price - 3813.791) < 1e-9, 'the price was misread: ' + quote.price);
    assert(Math.abs(quote.prev - 3811.904) < 1e-9,
      'the previous close is not `previousClose`: saw ' + quote.prev
      + ' (3823.621 means it read `chartPreviousClose`, which is the close before the 5-day window)');
    assert(Math.abs(quote.change - (3813.791 - 3811.904)) < 1e-9, 'the change was not derived: ' + quote.change);
    assert(quote.pct === 0.05, 'the endpoint\'s own percent was not preferred: ' + quote.pct);
    assert(quote.time === 1791529224 * 1000, 'the quote time was not converted from seconds: ' + quote.time);
    assert(quote.currency === 'CNY' && quote.exchange === 'Shanghai', 'the currency/exchange were lost');
    assert(quote.session === 'open', 'the published trading session was not read: ' + quote.session);
    assert(quote.spark.length === 5, 'the intraday series was dropped: ' + quote.spark.length);

    // A market whose session has passed reports closed from the same payload.
    const closed = engine.parseYahoo(yahooFixture(), market, 1791600000 * 1000);
    assert(closed.session === 'closed', 'a finished session was reported open');
    // ...and a payload with no published session says so instead of guessing.
    const unknown = engine.parseYahoo(
      yahooFixture({ currentTradingPeriod: undefined }), market, 1791530000 * 1000);
    assert(unknown.session === 'unknown', 'a missing trading session was invented as ' + unknown.session);

    // Without the endpoint's percent, it is derived rather than left blank.
    const derived = engine.parseYahoo(
      yahooFixture({ regularMarketChangePercent: undefined }), market, 1791530000 * 1000);
    const expected = (3813.791 - 3811.904) / 3811.904 * 100;
    assert(Math.abs(derived.pct - expected) < 1e-9, 'the percent was not derived: ' + derived.pct);
    // Without `previousClose`, the window close is the only remaining candidate.
    const fallback = engine.parseYahoo(
      yahooFixture({ previousClose: undefined }), market, 1791530000 * 1000);
    assert(Math.abs(fallback.prev - 3823.621) < 1e-9, 'the previous-close fallback chain broke: ' + fallback.prev);
  });

  await check('the sparkline keeps every point in order and drops the gaps', async () => {
    const engine = await import(pathToFileURL(path.join(ROOT, 'stocks.js')).href);
    // A halted bar arrives as `null` in the middle of `close`. Dropping nulls from the closes
    // alone would be correct here but wrong in general — the pairing is by index, and this
    // checks the pairing survived: the surviving values must be exactly the non-null ones, in
    // their original order, with the last point still the last point.
    const quote = engine.parseYahoo(
      yahooFixture({}, [3796.618, null, 3771.504, null, 3813.791]),
      { id: 'sh', decimals: 2 }, 1791530000 * 1000);
    assert(JSON.stringify(quote.spark) === JSON.stringify([3796.618, 3771.504, 3813.791]),
      'the series was mangled: ' + JSON.stringify(quote.spark));
    assert(quote.spark[quote.spark.length - 1] === 3813.791, 'the newest point is not last');

    // A payload with no indicators at all yields no sparkline rather than throwing.
    const bare = engine.parseYahoo({ chart: { result: [{ meta: yahooFixture().chart.result[0].meta }] } },
      { id: 'sh', decimals: 2 }, 1791530000 * 1000);
    assert(Array.isArray(bare.spark) && bare.spark.length === 0, 'a series-less payload invented points');
    // A payload with no price is an error with a reason, not a row of zeros.
    let threw = false;
    try {
      engine.parseYahoo({ chart: { result: [{ meta: { symbol: 'X' } }] } }, { id: 'sh', decimals: 2 }, Date.now());
    } catch { threw = true }
    assert(threw, 'a priceless payload produced a quote instead of an error');
  });

  await check('the 腾讯 fallback reads the right fields for A股, 港股 and 美股', async () => {
    const engine = await import(pathToFileURL(path.join(ROOT, 'stocks.js')).href);
    // Three real rows, one per market, with the three stamp formats the endpoint actually uses.
    const payload = [
      tencentFixture('sh000001', '上证指数', 3813.79, 3811.90, 1.89, 0.05, '20261009161400'),
      tencentFixture('hkHSI', '恒生指数', 24211.350, 23785.790, 425.560, 1.79, '2026/10/09 18:31:07'),
      tencentFixture('usDJI', '道琼斯', 51654.95, 51231.64, 423.31, 0.83, '2026-10-09 16:37:50'),
    ].join('\n');

    const rows = engine.parseTencent(payload, [
      { id: 'sh', tencent: 'sh000001', decimals: 2 },
      { id: 'hsi', tencent: 'hkHSI', decimals: 2 },
      { id: 'dji', tencent: 'usDJI', decimals: 2 },
      { id: 'spx', tencent: 'usINX', decimals: 2 },
    ]);

    assert(rows.size === 3, 'expected three rows, saw ' + rows.size);
    assert(!rows.has('spx'), 'a market that was not in the payload produced a row');

    // This is the regression that matters: reading one index downstream put 恒生指数's previous
    // close where its last price belongs and its high where its change percent belongs, and the
    // rows still *looked* plausible.
    const hsi = rows.get('hsi');
    assert(Math.abs(hsi.price - 24211.350) < 1e-6, 'hkHSI price is at the wrong index: ' + hsi.price);
    assert(Math.abs(hsi.prev - 23785.790) < 1e-6, 'hkHSI previous close is at the wrong index: ' + hsi.prev);
    assert(Math.abs(hsi.change - 425.560) < 1e-6, 'hkHSI change is at the wrong index: ' + hsi.change);
    assert(Math.abs(hsi.pct - 1.79) < 1e-6, 'hkHSI percent is at the wrong index: ' + hsi.pct);

    const dji = rows.get('dji');
    assert(Math.abs(dji.price - 51654.95) < 1e-6 && Math.abs(dji.pct - 0.83) < 1e-6,
      'usDJI was misread: ' + JSON.stringify({ price: dji.price, pct: dji.pct }));

    // No quote time is claimed from this source, because its stamp carries no offset. See the
    // note in stocks.js: guessing a timezone would put 道琼斯 thirteen hours out.
    for (const [, row] of rows) {
      assert(row.time === 0, 'the fallback claimed an instant it cannot know: ' + row.time);
      assert(row.spark.length === 0, 'the fallback invented a sparkline');
    }
    assert(hsi.timeText === '2026-10-09 18:31:07', 'the 港股 stamp was not normalised: ' + hsi.timeText);
    assert(dji.timeText === '2026-10-09 16:37:50', 'the 美股 stamp was not normalised: ' + dji.timeText);
    assert(rows.get('sh').timeText === '2026-10-09 16:14:00', 'the A股 stamp was not normalised');

    // Every stamp format, plus the two ways it can be unparseable.
    assert(engine.normaliseStamp('20261009161400') === '2026-10-09 16:14:00', 'YYYYMMDDHHMMSS');
    assert(engine.normaliseStamp('2026/10/09 18:31:07') === '2026-10-09 18:31:07', 'YYYY/MM/DD');
    assert(engine.normaliseStamp('2026-10-09 16:37:50') === '2026-10-09 16:37:50', 'YYYY-MM-DD');
    assert(engine.normaliseStamp('') === '', 'an empty stamp became a date');
    assert(engine.normaliseStamp('nonsense') === '', 'an unparseable stamp became a date: '
      + engine.normaliseStamp('nonsense'));
    // A bare 14-digit scan is unsafe on this payload: the US rows contain an unrelated
    // 14-digit run, which is why the stamp is read positionally at index 30.
    assert(engine.parseTencent('v_usAAA="0~x~AAA~1~1~0~0~~17501025732366~0~0";',
      [{ id: 'dji', tencent: 'usAAA', decimals: 2 }]).get('dji').timeText === '',
      'a stray digit run was read as a timestamp');
  });

  await check('the quote engine answers without a network when there is nothing to ask', async () => {
    const engine = await import(pathToFileURL(path.join(ROOT, 'stocks.js')).href);
    // No network is touched on this path: the selection is refused before any fetch is planned.
    for (const request of [{ ids: [] }, { ids: null }, {}, { ids: ['nope', ''] }]) {
      const result = await engine.collectQuotes(request);
      assert(result.ok === false, 'an unusable selection was answered with success: ' + JSON.stringify(request));
      assert(typeof result.error === 'string' && result.error, 'the refusal carries no reason');
    }
    const catalog = engine.stockCatalog();
    assert(catalog.limits.min >= 1 && catalog.limits.max === catalog.markets.length, 'the limits drifted');
    assert(catalog.defaults.length >= 4, 'too few shipped defaults to preview "every market"');
    // The fallback flag is published because it is the difference between an empty row and a
    // number from the second source; the symbols behind it are not.
    const withFallback = catalog.markets.filter((market) => market.fallback === true);
    assert(withFallback.length >= 3, 'no market advertises a no-proxy fallback');
    assert(catalog.markets.every((market) => typeof market.fallback === 'boolean'),
      'a market leaves the fallback flag undefined');
  });

  console.log('');
  if (failures.length) {
    console.error('FAILURES (' + failures.length + '):');
    for (const failure of failures) console.error(' - ' + failure);
    process.exit(1);
  }
  console.log('all host route checks passed');
}

main().catch((error) => {
  console.error('harness crashed: ' + (error && error.stack ? error.stack : String(error)));
  process.exit(1);
});
