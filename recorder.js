/**
 * 录屏的 Host 半：抓屏 → MP4，外加预览帧、区域框选与磁盘读数。
 *
 * ## 为什么录屏在这一半
 *
 * 这个 GUI 跑在 Electron 窗口里，而 Electron 不实现浏览器那套 getDisplayMedia 选择器：
 * 页面里调用只会立刻被拒（NotAllowedError），选择框根本不出现。所以抓屏与编码在 Host：
 * ffmpeg（ddagrab 抓主显示器 / gdigrab 兜底）+ libx264，直接写 MP4。
 *
 * ## 这里提供的东西
 *
 *   · 录制          startRecording / stopRecording / recordingStatus
 *   · 预览          一个独立的低分辨率 MJPEG 流（4fps / 480px），只在面板打开预览时才跑
 *   · 区域框选       一个全屏的 PowerShell 覆盖层，拖出矩形后返回屏幕坐标
 *   · 文件与磁盘     listRecordings / delete / open / reveal / diskInfo / 可配置的保存目录
 *
 * 预览与录制是两条独立进程：预览用 gdigrab 小图，录制用 ddagrab 原尺寸。这样开关预览
 * 不会碰到正在录的文件，录制中途改不了参数也不会出问题。
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import * as fsp from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, dirname, extname, join, resolve, sep } from 'node:path';

const TOOLS_DIR = join(homedir(), '.dsh', 'dsh-workbench-tools');
/** 便携 ffmpeg（安装脚本放在这里，不进系统 PATH）。 */
const TOOLS_FFMPEG = join(TOOLS_DIR, 'ffmpeg.exe');
const CONFIG_FILE = join(TOOLS_DIR, 'workbench-recorder.json');
const DEFAULT_DIR = join(homedir(), 'Videos', 'DSH 工作台录屏');
const VIDEO_EXT = new Set(['.mp4', '.webm', '.mkv', '.mov']);

/** 正在录制的那一段；同一时刻只允许一段。 */
let session = null;
let config = { dir: DEFAULT_DIR };
let configReady = false;

//#region ffmpeg 与配置

let ffmpegCache = { at: 0, path: null };

/** 按 DSH_FFMPEG → 便携版 → PATH 的顺序找 ffmpeg；成功缓存 60 秒。 */
export function ffmpegPath() {
  if (ffmpegCache.path && Date.now() - ffmpegCache.at < 60000) return ffmpegCache.path;
  const explicit = String(process.env.DSH_FFMPEG || '').trim();
  if (explicit && existsSync(explicit)) {
    ffmpegCache = { at: Date.now(), path: explicit };
    return explicit;
  }
  if (existsSync(TOOLS_FFMPEG)) {
    ffmpegCache = { at: Date.now(), path: TOOLS_FFMPEG };
    return TOOLS_FFMPEG;
  }
  const names = process.platform === 'win32' ? ['ffmpeg.exe'] : ['ffmpeg'];
  for (const dir of String(process.env.PATH || '').split(process.platform === 'win32' ? ';' : ':').filter(Boolean)) {
    for (const name of names) {
      const candidate = join(dir, name);
      if (existsSync(candidate)) {
        ffmpegCache = { at: Date.now(), path: candidate };
        return candidate;
      }
    }
  }
  ffmpegCache = { at: Date.now(), path: null };
  return null;
}

async function ensureConfig() {
  if (configReady) return config;
  configReady = true;
  try {
    const raw = JSON.parse(await fsp.readFile(CONFIG_FILE, 'utf8'));
    if (raw && typeof raw.dir === 'string' && raw.dir.trim()) config.dir = resolve(raw.dir);
  } catch { /* 首次运行：用默认目录 */ }
  return config;
}

/** 保存目录。面板可以改，改完写回这个 JSON，重启后还记得。 */
export async function recordConfig() {
  await ensureConfig();
  return { dir: config.dir, ffmpeg: ffmpegPath() };
}

export async function setRecordDir(dir) {
  await ensureConfig();
  const wanted = String(dir || '').trim();
  if (!wanted) return { ok: false, error: '目录不能为空' };
  const full = resolve(wanted);
  try {
    await fsp.mkdir(full, { recursive: true });
    const probe = await fsp.stat(full);
    if (!probe.isDirectory()) return { ok: false, error: '这不是一个文件夹' };
  } catch (error) {
    return { ok: false, error: '建不了这个目录：' + (error && error.message ? error.message : error) };
  }
  config.dir = full;
  try {
    await fsp.mkdir(TOOLS_DIR, { recursive: true });
    await fsp.writeFile(CONFIG_FILE, JSON.stringify({ dir: full }, null, 2), 'utf8');
  } catch { /* 写不进配置也不影响本次运行 */ }
  return { ok: true, dir: full };
}

async function recordDir() {
  await ensureConfig();
  return config.dir;
}

//#endregion

//#region 设备与磁盘

let deviceCache = { at: 0, items: [] };

/** 麦克风列表：向 ffmpeg 要一次 dshow 设备清单（写在 stderr 里）。 */
export async function listMicrophones() {
  if (Date.now() - deviceCache.at < 30000) return { items: deviceCache.items };
  const ffmpeg = ffmpegPath();
  if (!ffmpeg) return { items: [] };
  const text = await new Promise((done) => {
    let collected = '';
    let child;
    try {
      child = spawn(ffmpeg, ['-hide_banner', '-list_devices', 'true', '-f', 'dshow', '-i', 'dummy'], { windowsHide: true });
    } catch {
      done('');
      return;
    }
    const finish = () => done(collected);
    child.stdout?.on('data', (chunk) => { collected += chunk.toString() });
    child.stderr?.on('data', (chunk) => { collected += chunk.toString() });
    child.once('error', finish);
    child.once('exit', finish);
    setTimeout(() => { try { child.kill(); } catch { /* ignore */ } finish(); }, 4000);
  });
  const items = [];
  for (const line of text.split(/\r?\n/)) {
    const match = /"([^"]+)"\s*\(audio\)/.exec(line);
    if (match && !items.includes(match[1])) items.push(match[1]);
  }
  deviceCache = { at: Date.now(), items };
  return { items };
}

/** 保存目录所在盘的容量。`fs.statfs` 在新 Node 上才有，缺了就返回 null，面板不画环。 */
export async function diskInfo() {
  const dir = await recordDir();
  const statfs = fsp.statfs;
  if (typeof statfs !== 'function') return { dir, disk: null };
  try {
    const info = await statfs(dir);
    const total = Number(info.blocks) * Number(info.bsize);
    const free = Number(info.bavail) * Number(info.bsize);
    return { dir, disk: { total, free, used: Math.max(0, total - free) } };
  } catch {
    return { dir, disk: null };
  }
}

//#endregion

//#region 预览（独立的小尺寸 MJPEG）

const preview = { child: null, frame: null, at: 0, stderr: '' };

/**
 * 打开预览：独立跑一个 4fps、480px 宽的 MJPEG 进程，只保留最新一帧。
 *
 * 它是单独的进程，所以开关预览不会影响正在录制的文件；录制中同时开预览，CPU 代价也只是
 * 一次小尺寸抓屏。
 */
export async function startPreview() {
  if (preview.child) return { ok: true, running: true };
  const ffmpeg = ffmpegPath();
  if (!ffmpeg) return { ok: false, needsFfmpeg: true, error: '没有找到 ffmpeg' };
  const args = [
    '-hide_banner', '-loglevel', 'error',
    '-f', 'gdigrab', '-framerate', '4', '-i', 'desktop',
    '-vf', 'scale=480:-2', '-q:v', '7',
    '-f', 'mjpeg', 'pipe:1',
  ];
  const child = spawn(ffmpeg, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let buffer = Buffer.alloc(0);
  child.stdout.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    // MJPEG 的一帧就是一张完整 JPEG：FFD8 开头、FFD9 结尾。只留最后一帧。
    for (;;) {
      const start = buffer.indexOf(Buffer.from([0xff, 0xd8]));
      if (start < 0) { buffer = Buffer.alloc(0); return }
      const end = buffer.indexOf(Buffer.from([0xff, 0xd9]), start + 2);
      if (end < 0) { buffer = buffer.slice(start); return }
      preview.frame = buffer.slice(start, end + 2);
      preview.at = Date.now();
      buffer = buffer.slice(end + 2);
      if (preview.frame.length > 4 * 1024 * 1024) preview.frame = null;
    }
  });
  child.stderr.on('data', (chunk) => { preview.stderr = (preview.stderr + chunk.toString()).slice(-2000) });
  child.once('error', (error) => { preview.stderr = String(error && error.message ? error.message : error) });
  child.once('exit', () => {
    if (preview.child === child) { preview.child = null; preview.frame = null }
  });
  preview.child = child;
  // 等第一帧，最多 2.5 秒；起不来就报错，而不是留一个永远黑着的框。
  const startedAt = Date.now();
  while (!preview.frame && Date.now() - startedAt < 2500) {
    await new Promise((done) => setTimeout(done, 120));
    if (child.exitCode !== null) break;
  }
  if (!preview.frame) {
    try { child.kill(); } catch { /* ignore */ }
    preview.child = null;
    return { ok: false, error: preview.stderr ? preview.stderr.split(/\r?\n/).filter(Boolean).pop() : '预览没有出帧' };
  }
  return { ok: true, running: true };
}

export function stopPreview() {
  if (preview.child) {
    try { preview.child.kill(); } catch { /* ignore */ }
  }
  preview.child = null;
  preview.frame = null;
  return { ok: true };
}

/** 最新一帧（JPEG 字节），没有就返回 null。 */
export function previewFrame() {
  return preview.frame;
}

export function previewStatus() {
  return { running: Boolean(preview.child), at: preview.at };
}

//#endregion

//#region 区域框选（PowerShell 覆盖层）

const PICKER_SCRIPT = String.raw`
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$code = @'
using System;
using System.Drawing;
using System.Runtime.InteropServices;
using System.Windows.Forms;

public class RegionPicker
{
    [DllImport("user32.dll")] static extern bool SetProcessDPIAware();

    Rectangle sel = Rectangle.Empty;
    int mode = 0;          // 0 无, 1 拖新框, 2 移动, 3..10 八个手柄
    Point anchor;
    Rectangle origin;
    string result = "CANCEL";
    Form form;
    int hintX = 40;
    int hintY = 36;

    public static string Pick()
    {
        SetProcessDPIAware();
        return new RegionPicker().Run();
    }

    public static string SelfTest() { return "REGION:10,20,300,200"; }

    string Run()
    {
        Rectangle virt = SystemInformation.VirtualScreen;
        form = new Form();
        form.FormBorderStyle = FormBorderStyle.None;
        form.StartPosition = FormStartPosition.Manual;
        form.Bounds = virt;
        form.TopMost = true;
        form.ShowInTaskbar = false;
        form.BackColor = Color.Black;
        form.Opacity = 0.6;
        form.KeyPreview = true;
        form.Cursor = Cursors.Cross;
        form.Paint += OnPaint;
        form.MouseDown += OnDown;
        form.MouseMove += OnMove;
        form.MouseUp += OnUp;
        form.KeyDown += delegate(object s, KeyEventArgs e)
        {
            if (e.KeyCode == Keys.Escape) { result = "CANCEL"; form.Close(); }
            else if (e.KeyCode == Keys.Enter) { Accept(); }
        };

        // 控件放在**鼠标所在那块屏**的中下方：覆盖层横跨所有显示器，固定放在虚拟桌面中间
        // 可能落在两块屏的接缝上（之前确定按钮就压在任务栏里、文字还换行了）。
        Point cursor = Cursor.Position;
        Screen active = Screen.FromPoint(cursor);
        int dx = active.Bounds.Left - virt.Left;
        int dy = active.Bounds.Top - virt.Top;
        hintX = dx + 60;
        hintY = dy + 48;
        int mid = dx + active.Bounds.Width / 2;
        int bottom = dy + active.Bounds.Height - 130;

        Button ok = new Button();
        ok.Text = "确定  (Enter)";
        ok.Width = 200; ok.Height = 48;
        ok.Left = mid - 210; ok.Top = bottom;
        ok.Font = new Font("Microsoft YaHei UI", 11, FontStyle.Bold);
        ok.BackColor = Color.White;
        ok.Click += delegate(object s, EventArgs e) { Accept(); };

        Button cancel = new Button();
        cancel.Text = "取消  (Esc)";
        cancel.Width = 200; cancel.Height = 48;
        cancel.Left = mid + 10; cancel.Top = bottom;
        cancel.Font = new Font("Microsoft YaHei UI", 11, FontStyle.Bold);
        cancel.BackColor = Color.White;
        cancel.Click += delegate(object s, EventArgs e) { result = "CANCEL"; form.Close(); };

        form.Controls.Add(ok);
        form.Controls.Add(cancel);
        form.Shown += delegate(object s, EventArgs e) { form.Activate(); };

        Application.Run(form);
        return result;
    }

    void Accept()
    {
        if (sel.Width < 16 || sel.Height < 16) { result = "FULL"; }
        else
        {
            Rectangle virt = SystemInformation.VirtualScreen;
            result = string.Format("REGION:{0},{1},{2},{3}",
                virt.Left + sel.X, virt.Top + sel.Y, sel.Width, sel.Height);
        }
        form.Close();
    }

    static Point[] Handles(Rectangle r)
    {
        int cx = r.Left + r.Width / 2;
        int cy = r.Top + r.Height / 2;
        return new Point[] {
            new Point(r.Left, r.Top), new Point(cx, r.Top), new Point(r.Right, r.Top),
            new Point(r.Right, cy), new Point(r.Right, r.Bottom),
            new Point(cx, r.Bottom), new Point(r.Left, r.Bottom), new Point(r.Left, cy)
        };
    }

    void OnPaint(object s, PaintEventArgs e)
    {
        Graphics g = e.Graphics;
        string tip = "拖动框选 · 框内拖动移动 · 拖角/边调整 · Enter 确定 · Esc 取消";
        using (Font font = new Font("Microsoft YaHei UI", 13, FontStyle.Bold))
        using (SolidBrush brush = new SolidBrush(Color.White))
        using (SolidBrush plate = new SolidBrush(Color.FromArgb(170, 0, 0, 0)))
        {
            SizeF size = g.MeasureString(tip, font);
            g.FillRectangle(plate, hintX - 16, hintY - 12, size.Width + 32, size.Height + 24);
            g.DrawString(tip, font, brush, hintX, hintY);
        }
        if (sel.Width <= 0 || sel.Height <= 0) return;
        using (Pen pen = new Pen(Color.FromArgb(255, 69, 58), 2)) g.DrawRectangle(pen, sel);
        using (SolidBrush brush = new SolidBrush(Color.White))
        {
            foreach (Point p in Handles(sel)) g.FillRectangle(brush, p.X - 4, p.Y - 4, 8, 8);
        }
        using (Font font = new Font("Consolas", 11))
        using (SolidBrush brush = new SolidBrush(Color.White))
        {
            g.DrawString(sel.Width + " x " + sel.Height, font, brush, sel.Left, Math.Max(8, sel.Top - 24));
        }
    }

    int HitTest(Point p)
    {
        if (sel.Width <= 0) return 0;
        int t = 12;
        bool left = Math.Abs(p.X - sel.Left) <= t;
        bool right = Math.Abs(p.X - sel.Right) <= t;
        bool top = Math.Abs(p.Y - sel.Top) <= t;
        bool bottom = Math.Abs(p.Y - sel.Bottom) <= t;
        bool inside = p.X > sel.Left && p.X < sel.Right && p.Y > sel.Top && p.Y < sel.Bottom;
        if (top && left) return 3;
        if (top && right) return 4;
        if (bottom && right) return 5;
        if (bottom && left) return 6;
        if (left) return 7;
        if (right) return 8;
        if (top) return 9;
        if (bottom) return 10;
        if (inside) return 2;
        return 0;
    }

    void OnDown(object s, MouseEventArgs e)
    {
        if (e.Button != MouseButtons.Left) return;
        mode = HitTest(e.Location);
        anchor = e.Location;
        origin = sel;
        if (mode == 0) { mode = 1; sel = new Rectangle(e.X, e.Y, 0, 0); }
        form.Invalidate();
    }

    void OnMove(object s, MouseEventArgs e)
    {
        if (mode == 0) return;
        if (mode == 1)
        {
            sel = Rectangle.FromLTRB(Math.Min(anchor.X, e.X), Math.Min(anchor.Y, e.Y),
                                     Math.Max(anchor.X, e.X), Math.Max(anchor.Y, e.Y));
        }
        else if (mode == 2)
        {
            sel = new Rectangle(origin.X + e.X - anchor.X, origin.Y + e.Y - anchor.Y, origin.Width, origin.Height);
        }
        else
        {
            int l = origin.Left, t = origin.Top, r = origin.Right, b = origin.Bottom;
            if (mode == 3) { l = e.X; t = e.Y; }
            else if (mode == 4) { r = e.X; t = e.Y; }
            else if (mode == 5) { r = e.X; b = e.Y; }
            else if (mode == 6) { l = e.X; b = e.Y; }
            else if (mode == 7) { l = e.X; }
            else if (mode == 8) { r = e.X; }
            else if (mode == 9) { t = e.Y; }
            else if (mode == 10) { b = e.Y; }
            sel = Rectangle.FromLTRB(Math.Min(l, r), Math.Min(t, b), Math.Max(l, r), Math.Max(t, b));
        }
        form.Invalidate();
    }

    void OnUp(object s, MouseEventArgs e) { mode = 0; form.Invalidate(); }
}
'@

Add-Type -TypeDefinition $code -ReferencedAssemblies System.Windows.Forms, System.Drawing
if ($args -contains '--selftest') { [RegionPicker]::SelfTest() } else { [RegionPicker]::Pick() }
`;

/**
 * 框选录制区域：全屏覆盖层拖一个矩形，返回主显示器坐标。
 *
 * 覆盖层是 PowerShell + WinForms（不依赖任何额外组件），进程启动时声明 DPI 感知，
 * 所以返回的是**物理像素**坐标 —— 与 ddagrab 的 offset/video_size 同一套坐标。
 */
export async function pickRegion() {
  await fsp.mkdir(TOOLS_DIR, { recursive: true });
  const scriptPath = join(TOOLS_DIR, 'pick-region.ps1');
  // Windows PowerShell 5.1 读无 BOM 的 .ps1 会按 ANSI 解释：脚本里的中文注释会变成乱码，
  // 甚至把下一行吞进注释。加 BOM 让它按 UTF-8 读。
  await fsp.writeFile(scriptPath, '\uFEFF' + PICKER_SCRIPT, 'utf8');
  const output = await new Promise((done) => {
    let collected = '';
    let child;
    try {
      child = spawn('powershell.exe', ['-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass', '-File', scriptPath], { windowsHide: true });
    } catch (error) {
      done('CANCEL');
      return;
    }
    child.stdout.on('data', (chunk) => { collected += chunk.toString() });
    child.stderr.on('data', (chunk) => { collected += chunk.toString() });
    child.once('error', () => done('CANCEL'));
    child.once('exit', () => done(collected));
    // 有人把覆盖层忘了：两分钟后自己收掉，别留一个黑框在屏幕上。
    setTimeout(() => { try { child.kill(); } catch { /* ignore */ } }, 120000);
  });
  const text = String(output || '');
  if (/FULL/.test(text)) return { ok: true, region: null, full: true };
  // 坐标可以是负的：第二块屏在主屏左边时，虚拟桌面原点是负的。
  const match = /REGION:(-?\d+),(-?\d+),(\d+),(\d+)/.exec(text);
  if (!match) return { ok: false, error: 'cancelled' };
  return {
    ok: true,
    region: { x: Number(match[1]), y: Number(match[2]), w: Number(match[3]), h: Number(match[4]) },
  };
}

const FOLDER_SCRIPT = String.raw`
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class DpiAware2 { [DllImport("user32.dll")] public static extern bool SetProcessDPIAware(); }
"@
[void][DpiAware2]::SetProcessDPIAware()

$owner = New-Object System.Windows.Forms.Form
$owner.TopMost = $true
$owner.ShowInTaskbar = $false
$owner.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::None
$owner.StartPosition = [System.Windows.Forms.FormStartPosition]::CenterScreen
$owner.Size = New-Object System.Drawing.Size(1, 1)
$owner.Opacity = 0
$owner.Show()

$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = '选择录屏保存目录'
$dialog.ShowNewFolderButton = $true
$dialog.SelectedPath = [Environment]::GetFolderPath('MyVideos')

$result = $dialog.ShowDialog($owner)
$owner.Close()
if ($result -eq [System.Windows.Forms.DialogResult]::OK -and $dialog.SelectedPath) {
  'FOLDER:' + $dialog.SelectedPath
} else {
  'CANCEL'
}
`;

/** 目录选择：系统原生的 FolderBrowserDialog（同样用 PowerShell，避免依赖宿主服务）。 */
export async function pickFolder() {
  await fsp.mkdir(TOOLS_DIR, { recursive: true });
  const scriptPath = join(TOOLS_DIR, 'pick-folder.ps1');
  await fsp.writeFile(scriptPath, '\uFEFF' + FOLDER_SCRIPT, 'utf8');
  const output = await new Promise((done) => {
    let collected = '';
    let child;
    try {
      child = spawn('powershell.exe', ['-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass', '-File', scriptPath], { windowsHide: true });
    } catch {
      done('CANCEL');
      return;
    }
    child.stdout.on('data', (chunk) => { collected += chunk.toString() });
    child.stderr.on('data', (chunk) => { collected += chunk.toString() });
    child.once('error', () => done('CANCEL'));
    child.once('exit', () => done(collected));
    setTimeout(() => { try { child.kill(); } catch { /* ignore */ } }, 300000);
  });
  const text = String(output || '');
  const match = /FOLDER:(.+)/.exec(text);
  if (!match) return { ok: false, error: 'cancelled' };
  return { ok: true, dir: match[1].trim() };
}

//#endregion

//#region 录制

function pad(value) {
  return value < 10 ? '0' + value : String(value);
}

function stamp(at) {
  const date = new Date(at);
  return date.getFullYear() + pad(date.getMonth() + 1) + pad(date.getDate())
    + '-' + pad(date.getHours()) + pad(date.getMinutes()) + pad(date.getSeconds());
}

function clampInt(value, low, high, fallback) {
  const number = Math.round(Number(value));
  if (!Number.isFinite(number)) return fallback;
  return Math.min(high, Math.max(low, number));
}

function lastLine(text) {
  const lines = String(text || '').trim().split(/\r?\n/).filter(Boolean);
  return lines.length ? lines[lines.length - 1].slice(0, 400) : '';
}

function insideRecords(file) {
  const full = resolve(String(file || ''));
  const root = resolve(config.dir);
  return full.startsWith(root + sep) && VIDEO_EXT.has(extname(full).toLowerCase());
}

/**
 * 一次录制的 ffmpeg 参数。
 *
 * `dda` 走 Desktop Duplication API：抓主显示器，2560×1440 下实测稳定 30fps、~700kbps。
 * 带 `region` 时改用 **gdigrab + offset/video_size**：gdigrab 的坐标是**虚拟桌面**坐标，
 * 可以是负数，所以框选可以落在第二块屏上，也可以横跨两块屏 —— ddagrab 只能抓单个输出，
 * 做不到这一点。区域很小的时候 gdigrab 也只抓那一块，开销不是问题。
 * `gdigrab`（无区域）是旧系统上整屏录制的兜底。
 */
function buildArgs(kind, options) {
  const { fps, crf, mic, file, region } = options;
  const args = ['-hide_banner', '-loglevel', 'warning', '-y'];
  if (kind === 'region') {
    args.push(
      '-f', 'gdigrab',
      '-offset_x', String(Math.round(region.x)),
      '-offset_y', String(Math.round(region.y)),
      '-video_size', Math.round(region.w) + 'x' + Math.round(region.h),
      '-framerate', String(fps), '-i', 'desktop',
    );
  } else if (kind === 'dda') {
    args.push('-f', 'lavfi', '-i', 'ddagrab=output_idx=0:framerate=' + fps, '-vf', 'hwdownload,format=bgra');
  } else {
    args.push('-f', 'gdigrab', '-framerate', String(fps), '-i', 'desktop');
  }
  if (mic) args.push('-f', 'dshow', '-i', 'audio=' + mic);
  args.push(
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', String(crf),
    '-pix_fmt', 'yuv420p',
  );
  if (mic) args.push('-c:a', 'aac', '-b:a', '160k');
  args.push('-movflags', '+faststart', '-f', 'mp4', file);
  return args;
}

/** 起一个 ffmpeg 并观察 700ms；返回 { state } 或 { error, detail }。 */
async function launch(ffmpeg, kind, options) {
  const child = spawn(ffmpeg, buildArgs(kind, options), { windowsHide: true, stdio: ['pipe', 'ignore', 'pipe'] });
  const state = {
    child, file: options.file, startedAt: options.startedAt, fps: options.fps,
    mic: options.mic, region: options.region, stderr: '', spawnError: null, kind,
  };
  child.stderr.on('data', (chunk) => { state.stderr = (state.stderr + chunk.toString()).slice(-8000) });
  child.once('error', (error) => {
    state.spawnError = error || new Error('spawn failed');
    state.stderr += '\n' + (error && error.message ? error.message : String(error));
  });
  state.exited = new Promise((resolveExit) => {
    child.once('exit', (code, signal) => resolveExit({ code, signal }));
  });
  // 录制中途自己退出（设备被占用、显示模式变化、编码器拒绝参数……）也要算「结束」，
  // 否则 status 会一直说 recording=true，面板就一直转着计时却什么都没录。
  child.once('exit', () => {
    if (session === state) {
      state.endedEarly = true;
      session = null;
    }
  });
  await new Promise((done) => setTimeout(done, 700));
  if (state.spawnError || child.exitCode !== null) {
    return { error: lastLine(state.stderr) || 'ffmpeg 没能开始录制', detail: state.stderr.slice(-2000) };
  }
  return { state };
}

export async function startRecording(options = {}) {
  if (session) {
    return { ok: false, error: '已经在录制了', file: session.file, startedAt: session.startedAt };
  }
  const ffmpeg = ffmpegPath();
  if (!ffmpeg) return { ok: false, needsFfmpeg: true, error: '没有找到 ffmpeg' };

  const dir = await recordDir();
  await fsp.mkdir(dir, { recursive: true });
  const startedAt = Date.now();
  const file = join(dir, 'screen-' + stamp(startedAt) + '.mp4');
  // H.264 的 yuv420p 要求宽高都是偶数：框选随手拖出来的 1091×881 会让 libx264 直接拒绝
  // （"height not divisible by 2"），表现就是「点开始马上就结束」。这里统一向下取偶数。
  const even = (value) => Math.max(16, Math.round(Number(value) || 0) & ~1);
  const region = options.region && Number(options.region.w) >= 16 && Number(options.region.h) >= 16
    ? {
      x: Math.round(Number(options.region.x) || 0),
      y: Math.round(Number(options.region.y) || 0),
      w: even(options.region.w),
      h: even(options.region.h),
    }
    : null;
  const settings = {
    startedAt,
    file,
    fps: clampInt(options.fps, 15, 60, 30),
    crf: clampInt(options.crf, 16, 32, 22),
    mic: typeof options.mic === 'string' ? options.mic.trim() : '',
    region,
  };

  // 有区域就用 gdigrab 的虚拟桌面坐标抓那一块（可跨屏、可为负）；没有区域才走 ddagrab。
  const first = await launch(ffmpeg, region ? 'region' : 'dda', settings);
  let state = first.state;
  let failure = first.error ? first : null;
  if (!state && !region) {
    const second = await launch(ffmpeg, 'gdigrab', settings);
    state = second.state;
    if (!state) failure = second.error ? second : failure;
  }
  if (!state) {
    return { ok: false, error: failure ? failure.error : 'ffmpeg 没能开始录制', detail: failure ? failure.detail : '', file };
  }
  session = state;
  return { ok: true, file, startedAt, fps: settings.fps, mic: settings.mic || null, region, capture: state.kind };
}

export async function stopRecording() {
  const state = session;
  if (!state) return { ok: false, error: '当前没有在录制' };
  session = null;
  const ms = Date.now() - state.startedAt;
  try {
    if (state.child.exitCode === null && state.child.stdin) state.child.stdin.write('q');
  } catch { /* 管道可能已经关了 */ }

  const timedOut = await Promise.race([
    state.exited.then(() => false),
    new Promise((done) => setTimeout(() => done(true), 12000)),
  ]);
  if (timedOut) {
    try { state.child.kill('SIGKILL'); } catch { /* ignore */ }
    await new Promise((done) => setTimeout(done, 400));
  }
  let size = 0;
  try { size = (await fsp.stat(state.file)).size; } catch { /* 可能没写出来 */ }
  if (!size) {
    return {
      ok: false,
      error: lastLine(state.stderr) || '这次没有写出文件',
      detail: state.stderr.slice(-2000),
      file: state.file,
      ms,
    };
  }
  return { ok: true, file: state.file, name: basename(state.file), size, ms };
}

/** 当前状态：面板重新挂载时用它恢复。`size` 是这一段的实时体积。 */
export async function recordingStatus() {
  const dir = await recordDir();
  let size = 0;
  if (session) {
    try { size = (await fsp.stat(session.file)).size; } catch { /* 文件刚建好 */ }
  }
  return {
    recording: Boolean(session),
    file: session ? session.file : '',
    startedAt: session ? session.startedAt : 0,
    size,
    region: session ? session.region : null,
    dir,
    ffmpeg: ffmpegPath(),
    preview: Boolean(preview.child),
    // 客户端据此判断 Host 半是不是这一版：旧进程没有这些字段，面板会提示重启。
    features: ['preview', 'region', 'config'],
  };
}

export async function listRecordings() {
  const dir = await recordDir();
  await fsp.mkdir(dir, { recursive: true });
  let names = [];
  try { names = await fsp.readdir(dir); } catch { names = [] }
  const items = [];
  for (const name of names) {
    if (!VIDEO_EXT.has(extname(name).toLowerCase())) continue;
    const full = join(dir, name);
    try {
      const info = await fsp.stat(full);
      items.push({ file: full, name, size: info.size, at: info.mtimeMs });
    } catch { /* 刚好被删掉 */ }
  }
  items.sort((left, right) => right.at - left.at);
  return { dir, items: items.slice(0, 60), ffmpeg: ffmpegPath() };
}

export function openRecording(file) {
  if (!insideRecords(file)) return { ok: false, error: '不是录制目录里的文件' };
  try {
    spawn('explorer.exe', [resolve(file)], { windowsHide: false, detached: true }).unref();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error && error.message ? error.message : '打不开' };
  }
}

export function revealRecording(file) {
  const target = file && insideRecords(file) ? resolve(file) : config.dir;
  try {
    if (file) spawn('explorer.exe', ['/select,' + target], { windowsHide: false, detached: true }).unref();
    else spawn('explorer.exe', [resolve(config.dir)], { windowsHide: false, detached: true }).unref();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error && error.message ? error.message : '打不开文件夹' };
  }
}

export async function deleteRecording(file) {
  if (!insideRecords(file)) return { ok: false, error: '不是录制目录里的文件' };
  if (session && resolve(session.file) === resolve(file)) return { ok: false, error: '这一段正在录，先停再删' };
  try {
    await fsp.unlink(resolve(file));
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error && error.message ? error.message : '删不掉' };
  }
}

//#endregion
