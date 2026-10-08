/**
 * Host half of the Workbench bundle.
 *
 * The Workbench draws its panes from data the Client already holds, so for the most part
 * this half has nothing to do. It owns exactly one thing: the desktop background can
 * reference a file **on the local machine**, and a browser cannot read an arbitrary local
 * path. So the Host registers one same-origin route that streams such a file to the GUI.
 *
 * That is what makes the background survive everything: the Client only ever stores the
 * path, and as long as the file is still on disk it renders — across panel switches,
 * page reloads and app restarts. No blob URLs, no IndexedDB, no object-URL lifetime.
 */
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, isAbsolute } from 'node:path';

const ROUTE_PATH = '/workbench-media';

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

function reply(res, status, message) {
  try {
    res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(message);
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

export function apply(ctx) {
  const webServer = typeof ctx.get === 'function' ? ctx.get('webServer') : undefined;
  if (!webServer || typeof webServer.register !== 'function') return;
  ctx.effect(() => webServer.register({
    kind: 'prefix',
    path: ROUTE_PATH,
    handler: (req, res) => { serveMedia(req, res).catch(() => reply(res, 500, 'media read failed')) },
  }), 'workbench.media-route');
}
