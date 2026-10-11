/**
 * A tiny SVG path reader, for checking the tile marks against their construction spec.
 *
 * It exists because the interesting rules about this icon set are *geometric* — inside the live
 * area, whole-number coordinates, angles that are multiples of 45° — and geometry cannot be
 * checked with a regular expression over the path string. The first version of the review grid
 * proved the point by reporting `research` as 14×14 when the drawing is 18 wide: it read the
 * numbers in `M7 3H21L17 7H3Z` in pairs, and `H` takes one argument, not two.
 *
 * Only the commands this set uses are understood (M / L / H / V / Z, absolute and relative). A
 * curve command throws rather than being silently mis-measured, so adding one is a deliberate act
 * that forces the spec to be revisited.
 */
'use strict';

const ARGC = { M: 2, L: 2, H: 1, V: 1, Z: 0 };

/** Split a path into `{ cmd, args, at }` commands, rejecting anything this spec does not cover. */
function parseCommands(d) {
  const text = String(d || '');
  const tokens = text.match(/[A-Za-z]|-?\d*\.?\d+(?:e-?\d+)?/gi) || [];
  const out = [];
  let index = 0;
  while (index < tokens.length) {
    const letter = tokens[index];
    if (!/^[A-Za-z]$/.test(letter)) throw new Error('expected a command letter in "' + d + '", saw ' + letter);
    const upper = letter.toUpperCase();
    if (!(upper in ARGC)) {
      throw new Error('command ' + letter + ' is outside the straight-line spec (' + d + ')');
    }
    index += 1;
    const args = [];
    while (index < tokens.length && !/^[A-Za-z]$/.test(tokens[index])) {
      args.push(Number(tokens[index]));
      index += 1;
    }
    const want = ARGC[upper];
    if (want === 0) { out.push({ cmd: upper, args: [], relative: letter !== upper }); continue }
    if (args.length % want !== 0) {
      throw new Error('command ' + letter + ' in "' + d + '" has ' + args.length + ' arguments, not a multiple of ' + want);
    }
    for (let i = 0; i < args.length; i += want) {
      out.push({ cmd: upper, args: args.slice(i, i + want), relative: letter !== upper });
    }
  }
  return out;
}

/** Every straight segment in a path, as `{ x1, y1, x2, y2 }`. */
function segments(d) {
  const commands = parseCommands(d);
  const out = [];
  let x = 0;
  let y = 0;
  let startX = 0;
  let startY = 0;
  for (const command of commands) {
    const [a, b] = command.args;
    const to = { x, y };
    if (command.cmd === 'M') {
      to.x = command.relative ? x + a : a;
      to.y = command.relative ? y + b : b;
      startX = to.x;
      startY = to.y;
    } else if (command.cmd === 'L') {
      to.x = command.relative ? x + a : a;
      to.y = command.relative ? y + b : b;
    } else if (command.cmd === 'H') {
      to.x = command.relative ? x + a : a;
    } else if (command.cmd === 'V') {
      to.y = command.relative ? y + a : a;
    } else if (command.cmd === 'Z') {
      to.x = startX;
      to.y = startY;
    }
    if (command.cmd !== 'M' && (to.x !== x || to.y !== y)) {
      out.push({ x1: x, y1: y, x2: to.x, y2: to.y });
    }
    x = to.x;
    y = to.y;
  }
  return out;
}

/**
 * The bounding box of a set of paths.
 *
 * Straight segments only, so the box is exact rather than a control-point approximation.
 */
function bbox(paths) {
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  for (const d of paths) {
    for (const segment of segments(d)) {
      minX = Math.min(minX, segment.x1, segment.x2);
      maxX = Math.max(maxX, segment.x1, segment.x2);
      minY = Math.min(minY, segment.y1, segment.y2);
      maxY = Math.max(maxY, segment.y1, segment.y2);
    }
  }
  if (!Number.isFinite(minX)) return { minX: 0, minY: 0, maxX: 0, maxY: 0, w: 0, h: 0 };
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
}

/** Every distinct coordinate in a path set, for the whole-number check. */
function coordinates(paths) {
  const out = [];
  for (const d of paths) {
    for (const command of parseCommands(d)) {
      for (const value of command.args) out.push(value);
    }
  }
  return out;
}

/**
 * The angle of a segment in degrees, folded to 0–180 and normalised so -45 and 45 both report 45.
 * A segment that is not axis-aligned or 45° returns its true angle, which the caller compares.
 */
function angleOf(segment) {
  const dx = Math.abs(segment.x2 - segment.x1);
  const dy = Math.abs(segment.y2 - segment.y1);
  if (dx === 0) return 90;
  if (dy === 0) return 0;
  return Math.round(Math.atan2(dy, dx) * 180 / Math.PI);
}

module.exports = { parseCommands, segments, bbox, coordinates, angleOf };
