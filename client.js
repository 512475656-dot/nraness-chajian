/**
 * Client half of the Workbench bundle.
 *
 * Renders a "global panel" workbench into the root-scoped `main` keyed slot and
 * its launcher into `sidebar.panellist`, so the sidebar owns the button and the
 * centre column swaps the Conversation for this page.
 *
 * Every pane is derived from data the Client already holds:
 *   - the retained Session's event window (`binding.eventSource`) folded into a
 *     development node tree, per-turn progress and per-turn token usage;
 *   - the Session projections `tokenUsage` / `contextPressure` /
 *     `contextBreakdown` registered by the shipped token meter.
 * The plugin owns no session data and never writes to the log. Its own user
 * state (workbench type, project groups, layout preset, custom notes) is
 * browser-profile state in `localStorage`.
 *
 * Nothing is imported from another Harness Client package: React arrives from
 * the browser module table and every control is written here against theme
 * tokens only.
 */

window.__ModuleLoader__.load({
  id: '@local/dsh-workbench',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } = React;

    //#region styles


    const CSS = `
.wsb-root{position:relative;display:flex;flex-direction:column;height:100%;min-width:0;overflow:hidden;
  padding:calc(var(--dsh-frame-top-clearance,0px) + 14px) 18px 16px;box-sizing:border-box;
  background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary)}

.wsb-head{position:relative;z-index:1;display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px}
.wsb-title{display:flex;align-items:baseline;gap:9px;margin-right:auto;min-width:0}
.wsb-title b{font-size:16px;font-weight:650;letter-spacing:.2px}
.wsb-title span{font-size:11.5px;color:var(--dsw-alias-label-secondary);white-space:nowrap;
  overflow:hidden;text-overflow:ellipsis;max-width:38ch}

/* 模块屏头部：更大的标题 · 更好看的字体 · 英文缩写胶囊 · 统一的返回按钮
   四屏的标题结构各自独立（.wsb-title / .wsb-nwTitle / .wsb-stkTitle），所以逐个覆盖。
   字体栈以圆体优先；返回按钮与桌面模块图标同一套线条语言（圆角方块 + 单线 chevron）。 */

.wsb-title,.wsb-nwTitle,.wsb-stkTitle{align-items:center;gap:11px}
.wsb-title b,.wsb-nwTitle b,.wsb-stkTitle b{font-size:22px;font-weight:600;letter-spacing:-.012em;
  line-height:1.15;white-space:nowrap;
  font-family:ui-rounded,"SF Pro Rounded","SF Pro Display",system-ui,-apple-system,
    "Segoe UI Variable Display","Segoe UI",sans-serif;
  -webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
.wsb-title span,.wsb-nwTitle span,.wsb-stkTitle span{font-size:13px;line-height:1.5;max-width:46ch}
/* 英文缩写：小号大写 + 字距，一枚安静的胶囊 */
.wsb-titleAbbr{flex:0 0 auto;font-size:11px;font-weight:600;letter-spacing:.14em;
  text-transform:uppercase;padding:2.5px 8px;border-radius:8px;
  color:var(--dsw-alias-label-secondary);
  background:color-mix(in srgb,var(--dsw-alias-label-primary) 7%,transparent);
  border:1px solid color-mix(in srgb,var(--dsw-alias-label-primary) 11%,transparent)}

/* 统一的返回按钮：38×38 圆角方块 + 单线 chevron */
.wsb-backBtn{appearance:none;flex:0 0 auto;width:38px;height:38px;padding:0;
  display:grid;place-items:center;border-radius:12px;cursor:pointer;
  color:var(--dsw-alias-label-primary);
  border:1px solid color-mix(in srgb,var(--dsw-alias-label-primary) 12%,transparent);
  background:color-mix(in srgb,var(--dsw-alias-bg-layer-2) 55%,transparent);
  transition:transform .18s cubic-bezier(.32,.72,0,1),background .18s ease}
.wsb-backBtn:hover{transform:translateY(-1px);
  background:color-mix(in srgb,var(--dsw-alias-bg-layer-2) 82%,transparent)}
.wsb-backBtn:active{transform:scale(.94)}
.wsb-backBtn>svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:1.5;
  stroke-linecap:round;stroke-linejoin:round}
@media (prefers-reduced-motion:reduce){
  .wsb-backBtn{transition:none}
  .wsb-backBtn:hover,.wsb-backBtn:active{transform:none}}

/* 模块屏头部：更大的标题 · 更好看的字体 · 英文缩写胶囊 · 统一的返回按钮
   说明：这是给 client.js 样式表用的补丁片段，由 apply.cjs 按唯一锚点插入。
   字体栈以圆体优先（ui-rounded / SF Pro Rounded），退回系统 UI 字体；
   返回按钮与桌面模块图标同一套线条语言：圆角方块 + 单线 chevron（1.5 圆端）。 */

/* 标题：16px → 22px，圆体优先，字距收紧一点（大字号下更利落） */
.wsb-title{align-items:center;gap:11px}
.wsb-title b{font-size:22px;font-weight:600;letter-spacing:-.01em;line-height:1.15;
  font-family:ui-rounded,"SF Pro Rounded","SF Pro Display",system-ui,-apple-system,
    "Segoe UI Variable Display","Segoe UI",sans-serif;
  -webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
/* 副标题：11.5px → 13px，行高放松，读起来更像一句话而不是标签 */
.wsb-title span{font-size:13px;line-height:1.5;max-width:46ch}
/* 英文缩写：小号大写 + 字距，做成一枚安静的胶囊，接在标题后面 */
.wsb-titleAbbr{flex:0 0 auto;font-size:11px;font-weight:600;letter-spacing:.14em;
  text-transform:uppercase;padding:2.5px 8px;border-radius:8px;
  color:var(--dsw-alias-label-secondary);
  background:color-mix(in srgb,var(--dsw-alias-label-primary) 7%,transparent);
  border:1px solid color-mix(in srgb,var(--dsw-alias-label-primary) 11%,transparent)}

/* 统一的返回按钮：38×38 圆角方块，图标是单线 chevron */
.wsb-backBtn{appearance:none;flex:0 0 auto;width:38px;height:38px;padding:0;
  display:grid;place-items:center;border-radius:12px;cursor:pointer;
  color:var(--dsw-alias-label-primary);
  border:1px solid color-mix(in srgb,var(--dsw-alias-label-primary) 12%,transparent);
  background:color-mix(in srgb,var(--dsw-alias-bg-layer-2) 55%,transparent);
  transition:transform .18s cubic-bezier(.32,.72,0,1),background .18s ease}
.wsb-backBtn:hover{transform:translateY(-1px);
  background:color-mix(in srgb,var(--dsw-alias-bg-layer-2) 82%,transparent)}
.wsb-backBtn:active{transform:scale(.94)}
.wsb-backBtn>svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:1.5;
  stroke-linecap:round;stroke-linejoin:round}
@media (prefers-reduced-motion:reduce){
  .wsb-backBtn{transition:none}
  .wsb-backBtn:hover,.wsb-backBtn:active{transform:none}}

/* The layout presets. They used to be a standalone dark segmented control in the console
   header; they now sit INSIDE the 显示项 row so every display control lives in one place.
   The inset background is what keeps them readable as a group of mutually exclusive
   choices, distinct from the free on/off pane chips next to them. */
.wsb-seg{display:inline-flex;padding:2px;gap:2px;border-radius:9px;flex:0 0 auto;
  background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1)}
.wsb-segBtn{appearance:none;border:0;cursor:pointer;font:inherit;font-size:11px;padding:3px 8px;border-radius:7px;
  background:transparent;color:var(--dsw-alias-label-secondary);
  transition:background .2s ease,color .2s ease,transform .2s cubic-bezier(.2,.8,.2,1)}
.wsb-segBtn:hover{color:var(--dsw-alias-label-primary)}
.wsb-segBtn[data-on="true"]{background:color-mix(in srgb,var(--wsb-c1) 30%,transparent);
  color:var(--dsw-alias-label-primary)}

.wsb-chip{display:inline-flex;align-items:center;gap:6px;font-size:11.5px;padding:5px 10px;border-radius:999px;cursor:pointer;
  border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);
  transition:background .2s ease,border-color .2s ease,transform .2s cubic-bezier(.2,.8,.2,1)}
.wsb-chip:hover{transform:translateY(-1px);border-color:var(--dsw-alias-border-l2)}
.wsb-chip[data-on="true"]{background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-border-l2)}
.wsb-dot{width:8px;height:8px;border-radius:50%;flex:0 0 auto;box-shadow:0 0 0 2px color-mix(in srgb,currentColor 14%,transparent)}

.wsb-btn{appearance:none;font:inherit;font-size:11.5px;cursor:pointer;padding:5px 10px;border-radius:9px;
  background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);border:1px solid var(--dsw-alias-border-l1);
  transition:background .2s ease,color .2s ease,transform .2s cubic-bezier(.2,.8,.2,1)}
.wsb-btn:hover{color:var(--dsw-alias-label-primary);transform:translateY(-1px)}
.wsb-btn[disabled]{opacity:.45;cursor:default;transform:none}
.wsb-btn[data-tone="danger"]:hover{color:var(--dsw-alias-state-error-primary)}
/* A pressed toggle has to be unmistakable at a glance, not just a slightly different grey. */
.wsb-btn[data-on="true"]{background:color-mix(in srgb,var(--wsb-c1) 30%,transparent);
  color:var(--dsw-alias-label-primary);border-color:color-mix(in srgb,var(--wsb-c1) 55%,transparent)}
.wsb-trailToggle[data-on="true"]{box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--wsb-c1) 45%,transparent)}

.wsb-input{font:inherit;font-size:12px;padding:5px 9px;border-radius:9px;min-width:0;
  background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);
  border:1px solid var(--dsw-alias-border-l2);outline:none}
.wsb-select{font:inherit;font-size:11.5px;padding:5px 8px;border-radius:9px;max-width:26ch;
  background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l1)}

.wsb-grid{position:relative;z-index:1;flex:1 1 auto;min-height:0;display:grid;gap:12px}
.wsb-strip{margin-top:12px;position:relative;z-index:1}

/* Frosted glass, built in layers rather than one flat translucent fill:
   1. a translucent fill tinted by the active palette
   2. a 1px gradient rim (light on the top-left, shadow on the bottom-right) that reads as
      the edge of a real slab
   3. a specular sweep across the top-left, the highlight a polished pane throws back
   4. an inner shadow at the bottom so the pane has depth instead of looking pasted on
   Every value below is driven by the glass scheme, so the four materials differ in all
   four layers rather than only in blur strength. */
.wsb-glass{position:relative;display:flex;flex-direction:column;min-height:0;min-width:0;overflow:hidden;
  border-radius:22px;
  border:1px solid transparent;
  /* Surface ladder (Raycast #07080a → #0d0d0d → #101111 → #121212), expressed against the
     host's own canvas so it follows light and dark alike. Elevation is a SURFACE change,
     not a shadow, and the palette tint stays almost invisible instead of washing the pane. */
  background:
    linear-gradient(180deg,
      color-mix(in srgb,#fff calc(var(--wsb-glass-sheen,1) * 3.2%),transparent),
      transparent 34%),
    linear-gradient(135deg,
      color-mix(in srgb,var(--wsb-glass-tint,#8fa6c8) calc(var(--wsb-glass-sheen,1) * 2.6%),transparent),
      transparent 52%),
    color-mix(in srgb,var(--wsb-surface-2) var(--wsb-glass-alpha,52%),transparent);
  background-clip:padding-box;
  -webkit-backdrop-filter:blur(var(--wsb-glass-blur,28px)) saturate(var(--wsb-glass-sat,180%))
    brightness(var(--wsb-glass-bright,1));
  backdrop-filter:blur(var(--wsb-glass-blur,28px)) saturate(var(--wsb-glass-sat,180%))
    brightness(var(--wsb-glass-bright,1));
  /* One soft ambient shadow + one inner gradient, nothing more. */
  box-shadow:
    0 var(--wsb-elev-y,16px) 40px -18px rgba(0,0,0,.52),
    inset 0 -12px 24px -20px rgba(0,0,0,.5);
  animation:wsb-rise .42s cubic-bezier(.22,.9,.24,1) both;
  transition:transform .28s cubic-bezier(.2,.8,.2,1),box-shadow .28s ease}
/* The rim: a hairline 1px gradient edge (light where the light hits), the way a real
   slab catches light — not a coloured ring. */
.wsb-glass:after{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;
  padding:1px;background:linear-gradient(135deg,
    color-mix(in srgb,#fff calc(var(--wsb-glass-rim,1) * 14%),transparent),
    color-mix(in srgb,var(--wsb-glass-hair,#242728) calc(var(--wsb-glass-rim,1) * 70%),transparent) 46%,
    color-mix(in srgb,var(--wsb-glass-hair,#242728) calc(var(--wsb-glass-rim,1) * 70%),transparent) 60%,
    color-mix(in srgb,#000 calc(var(--wsb-glass-rim,1) * 16%),transparent));
  -webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);
  -webkit-mask-composite:xor;
  mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);
  mask-composite:exclude}
/* The specular sweep: the polished-pane highlight, top-left. */
.wsb-glass:before{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;
  background:linear-gradient(142deg,
    color-mix(in srgb,#fff calc(var(--wsb-glass-spec,1) * 9%),transparent),
    transparent 34%,
    transparent 72%,
    color-mix(in srgb,#fff calc(var(--wsb-glass-spec,1) * 3%),transparent))}
.wsb-glass:hover{box-shadow:
  0 calc(var(--wsb-elev-y,16px) + 6px) 46px -18px rgba(0,0,0,.58),
  inset 0 -12px 24px -20px rgba(0,0,0,.55)}
@keyframes wsb-rise{from{opacity:0;transform:translate3d(0,14px,0) scale(.985)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){
  .wsb-glass{animation:none}
  .wsb-glass,.wsb-segBtn,.wsb-chip,.wsb-btn{transition:none}
}

.wsb-paneHead{display:flex;align-items:center;gap:8px;padding:10px 13px;border-bottom:1px solid var(--dsw-alias-border-l1);
  background:color-mix(in srgb,var(--dsw-alias-bg-layer-2) 55%,transparent);flex:0 0 auto}
.wsb-paneHead b{font-size:12.5px;font-weight:600;letter-spacing:.3px}
.wsb-paneHead .wsb-sub{font-size:11px;color:var(--dsw-alias-label-secondary);margin-left:auto;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wsb-body{flex:1 1 auto;min-height:0;overflow:auto;padding:10px 12px 14px;scrollbar-width:thin}
.wsb-body::-webkit-scrollbar{width:9px;height:9px}
.wsb-body::-webkit-scrollbar-thumb{background:var(--dsw-alias-border-l2);border-radius:9px;border:2px solid transparent;background-clip:content-box}

.wsb-empty{margin:22px 8px;text-align:center;font-size:12px;line-height:1.7;color:var(--dsw-alias-label-secondary)}

@keyframes wsb-fade{from{opacity:0}to{opacity:1}}

.wsb-badges{display:flex;gap:5px;flex-wrap:wrap;margin-top:4px}
.wsb-badge{font-size:10px;padding:1px 6px;border-radius:6px;border:1px solid var(--dsw-alias-border-l1);
  background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);white-space:nowrap}
.wsb-badge[data-tone="ok"]{color:var(--dsw-alias-state-success-primary)}
.wsb-badge[data-tone="err"]{color:var(--dsw-alias-state-error-primary)}
.wsb-badge[data-tone="warn"]{color:var(--dsw-alias-state-warn-primary)}

.wsb-code{margin:0;font-family:var(--dsw-font-mono,ui-monospace,SFMono-Regular,Menlo,Consolas,monospace);
  font-size:11.5px;line-height:1.65;white-space:pre;tab-size:2}
.wsb-codeRow{display:flex;gap:10px}
.wsb-ln{flex:0 0 auto;width:3ch;text-align:right;color:var(--dsw-alias-label-secondary);opacity:.55;user-select:none}
.wsb-src{flex:1 1 auto;min-width:0;white-space:pre-wrap;word-break:break-word}
.wsb-tok-k{color:var(--dsw-alias-brand-primary)}
.wsb-tok-s{color:var(--dsw-alias-state-success-primary)}
.wsb-tok-c{color:var(--dsw-alias-label-secondary);font-style:italic}
.wsb-tok-n{color:var(--dsw-alias-state-warn-primary)}
.wsb-diffAdd{background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 15%,transparent)}
.wsb-diffDel{background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 15%,transparent)}

.wsb-tabs{display:flex;gap:4px;padding:8px 12px 0;flex-wrap:wrap}
.wsb-tab{appearance:none;font:inherit;font-size:11px;cursor:pointer;padding:4px 9px;border-radius:8px;
  border:1px solid transparent;background:transparent;color:var(--dsw-alias-label-secondary);transition:all .18s ease}
.wsb-tab:hover{color:var(--dsw-alias-label-primary)}
.wsb-tab[data-on="true"]{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-border-l1);color:var(--dsw-alias-label-primary)}


.wsb-gauge{height:9px;border-radius:9px;overflow:hidden;background:var(--dsw-alias-bg-layer-2);
  border:1px solid var(--dsw-alias-border-l1);margin:3px 0 4px}
.wsb-gauge i{display:block;height:100%;border-radius:9px;background:var(--dsw-alias-brand-primary);
  transition:width .5s cubic-bezier(.22,.9,.24,1)}
.wsb-gauge i[data-tone="warn"]{background:var(--dsw-alias-state-warn-primary)}
.wsb-gauge i[data-tone="err"]{background:var(--dsw-alias-state-error-primary)}

.wsb-rounds{display:flex;flex-direction:column;gap:7px}
.wsb-round{position:relative;overflow:hidden;
  padding:8px 10px;border-radius:13px;border:1px solid var(--dsw-alias-border-l1);
  background:color-mix(in srgb,var(--dsw-alias-bg-layer-2) 45%,transparent);cursor:pointer;
  transition:transform .2s cubic-bezier(.2,.8,.2,1),border-color .2s ease;animation:wsb-fade .3s ease both}
/* Picking a turn in the tree plays a single soft white sweep across that turn's entry HERE,
   so the two panes are visibly tied together without adding any persistent highlight. It is
   remounted per pick (via a key), which is what makes the one-shot replay. */
.wsb-round[data-flash="true"]::after{content:"";position:absolute;inset:0;pointer-events:none;
  border-radius:inherit;
  background:linear-gradient(100deg,transparent 20%,rgba(255,255,255,.30) 50%,transparent 80%);
  transform:translateX(-115%);
  animation:wsb-sheen .72s cubic-bezier(.3,.7,.3,1) both}
@keyframes wsb-sheen{from{transform:translateX(-115%)}to{transform:translateX(115%)}}
.wsb-round:hover{transform:translateY(-1.5px);border-color:var(--dsw-alias-border-l2)}
.wsb-roundTop{display:flex;align-items:center;gap:7px;font-size:12px}
.wsb-roundTop strong{font-weight:600}
.wsb-roundTop span{margin-left:auto;font-size:10.5px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}
.wsb-roundSub{font-size:10.5px;color:var(--dsw-alias-label-secondary);margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}

.wsb-kv{display:grid;grid-template-columns:auto 1fr;gap:4px 12px;font-size:11.5px}
.wsb-kv dt{color:var(--dsw-alias-label-secondary)}
.wsb-kv dd{margin:0;text-align:right;font-variant-numeric:tabular-nums}

.wsb-srcCard{padding:9px 11px;border-radius:13px;border:1px solid var(--dsw-alias-border-l1);
  background:color-mix(in srgb,var(--dsw-alias-bg-layer-2) 45%,transparent);margin-bottom:7px;animation:wsb-fade .3s ease both}
.wsb-srcCard a{color:var(--dsw-alias-brand-primary);text-decoration:none;font-size:11.5px;word-break:break-all}
.wsb-srcCard a:hover{text-decoration:underline}
.wsb-srcCard p{margin:5px 0 0;font-size:11.5px;line-height:1.6;color:var(--dsw-alias-label-secondary);
  display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}

/* ---- project overview: KPIs, turn timeline, file impact ---- */
.wsb-overview{flex:0 0 auto;margin-bottom:10px;padding:10px 11px;border-radius:14px;
  border:1px solid var(--dsw-alias-border-l1);background:color-mix(in srgb,var(--dsw-alias-bg-layer-2) 38%,transparent)}
.wsb-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(62px,1fr));gap:6px}
.wsb-kpi em{display:block;font-style:normal;font-size:9.5px;color:var(--dsw-alias-label-secondary);letter-spacing:.2px}
.wsb-kpi strong{font-size:12.5px;font-weight:640;font-variant-numeric:tabular-nums}
.wsb-kpi strong[data-tone="err"]{color:var(--dsw-alias-state-error-primary)}
.wsb-ovLabel{display:flex;align-items:center;gap:6px;font-size:9.5px;letter-spacing:.35px;text-transform:uppercase;
  color:var(--dsw-alias-label-secondary);margin:9px 0 5px}
.wsb-tlBars{display:flex;align-items:flex-end;gap:3px;height:36px}
.wsb-tlBar{flex:1 1 0;min-width:3px;height:100%;appearance:none;border:0;padding:0;cursor:pointer;background:transparent;
  display:flex;align-items:flex-end;border-radius:3px;transition:transform .2s var(--wsb-spring)}
.wsb-tlBar:hover{transform:translateY(-2px)}
.wsb-tlBar>i{display:block;width:100%;border-radius:3px;background:color-mix(in srgb,var(--dsw-alias-brand-primary) 68%,transparent);
  transition:background .2s ease,height .3s var(--wsb-spring)}
.wsb-tlBar[data-tone="err"]>i{background:var(--dsw-alias-state-error-primary)}
.wsb-tlBar[data-on="true"]>i{background:var(--dsw-alias-brand-primary)}

/* ---- branch graph: measured rows + bezier edges ---- */
.wsb-graph{position:relative;width:100%}
.wsb-graphEdges{position:absolute;left:0;top:0;pointer-events:none;overflow:visible}
.wsb-edge{fill:none;stroke:color-mix(in srgb,var(--dsw-alias-label-primary) 24%,transparent);stroke-width:1.25;
  stroke-linecap:round;stroke-dasharray:1;stroke-dashoffset:1;animation:wsb-draw .5s ease both}
.wsb-edge[data-hot="true"]{stroke:var(--dsw-alias-brand-primary);stroke-width:1.8;opacity:.95}
.wsb-edge[data-dim="true"]{opacity:.14}
@keyframes wsb-draw{to{stroke-dashoffset:0}}
/* The tile mark is drawn, not faded: every shape is normalised to pathLength=1, so one dash
   rule works for all of them, and each shape's own --wsb-d delay makes the stroke travel
   around the mark like a pen. */
.wsb-mark{display:block;overflow:visible}
/* The stroke is measured in the artwork's own units, so it thickens with the mark instead of
   collapsing to a speckle: a non-scaling stroke cannot be dash-drawn by pathLength. */
.wsb-markLine{stroke-dasharray:1;stroke-dashoffset:1;
  animation:wsb-draw .62s cubic-bezier(.42,0,.32,1) both;animation-delay:var(--wsb-d,0s)}
.wsb-row{position:absolute;left:0;right:0;display:flex;align-items:center;gap:7px;padding:0 9px;border-radius:9px;
  appearance:none;border:1px solid transparent;background:transparent;color:inherit;font:inherit;text-align:left;
  cursor:pointer;transition:background .18s ease,border-color .18s ease,opacity .22s ease,filter .22s ease,
    transform .2s var(--wsb-spring)}
.wsb-row:hover{background:color-mix(in srgb,var(--dsw-alias-bg-layer-2) 62%,transparent);transform:translateX(2px)}
.wsb-row[data-sel="true"]{background:color-mix(in srgb,var(--dsw-alias-brand-primary) 16%,transparent);
  border-color:var(--dsw-alias-border-l2)}
.wsb-row[data-dim="true"]{opacity:.26;filter:saturate(.4)}
.wsb-rowTwist{flex:0 0 12px;font-size:9px;color:var(--dsw-alias-label-secondary);transition:transform .2s ease}
.wsb-rowTwist[data-open="true"]{transform:rotate(90deg)}
.wsb-rowGlyph{flex:0 0 auto;width:15px;height:15px;border-radius:5px;display:grid;place-items:center;
  font-size:9px;font-weight:700;color:var(--dsw-alias-bg-base)}
.wsb-rowTitle{flex:0 1 auto;min-width:0;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wsb-rowMeta{flex:1 1 auto;min-width:0;font-size:10px;color:var(--dsw-alias-label-secondary);
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wsb-rowNums{flex:0 0 auto;display:flex;gap:4px}
.wsb-graphDetail{position:absolute;left:0;right:0;padding:8px 11px;border-radius:11px;overflow:auto;
  font-size:11px;line-height:1.6;white-space:pre-wrap;word-break:break-word;color:var(--dsw-alias-label-secondary);
  background:color-mix(in srgb,var(--dsw-alias-bg-layer-2) 62%,transparent);border:1px solid var(--dsw-alias-border-l1);
  animation:wsb-fade .25s ease both}

/* ---- motion tokens: iOS-style springs ---- */
.wsb-root{--wsb-spring:cubic-bezier(.32,.72,0,1);--wsb-spring-soft:cubic-bezier(.22,.9,.24,1);
  --wsb-ease-in:cubic-bezier(.42,0,.58,1);--wsb-ease-out:cubic-bezier(.4,0,.2,1);
  --wsb-dur:.35s;--wsb-dur-zoom:.5s;--wsb-dur-exit:.26s;--wsb-glass-radius:22px;--wsb-card-radius:20px}

/* ---- background layer ---- */
.wsb-bg{position:absolute;inset:0;z-index:0;overflow:hidden;pointer-events:none;background:var(--dsw-alias-bg-base);
  contain:paint}
.wsb-bgMedia{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;
  transform:scale(1.04);transition:opacity .5s ease}
.wsb-bgScrim{position:absolute;inset:0;background:var(--dsw-alias-bg-base)}
.wsb-bgGrid{position:absolute;inset:0;
  background-image:linear-gradient(color-mix(in srgb,var(--dsw-alias-label-primary) 16%,transparent) 1px,transparent 1px),
    linear-gradient(90deg,color-mix(in srgb,var(--dsw-alias-label-primary) 16%,transparent) 1px,transparent 1px);
  background-size:76px 76px}

/* During a screen transition the panes are being scaled, and Chrome must re-run every
   backdrop blur on every frame of that scale — that is the last of the arrival stutter.
   While a screen is animating we swap the frost for a slightly stronger flat fill: the
   glass is only ~46% opaque, so the difference is not visible at speed, and the zoom
   becomes a pure compositor transform. The frost comes straight back when it settles. */
.wsb-screen[data-anim] .wsb-glass{backdrop-filter:none;-webkit-backdrop-filter:none;
  background:color-mix(in srgb,var(--wsb-surface-2) calc(var(--wsb-glass-alpha,46%) + 14%),transparent)}
/* 本层同理：入场动画期间不采样背景，否则切换界面会"黑一下"。这一条单独写，不动上面那条。 */
.wsb-screen[data-anim]:not([data-role="home"])::before{backdrop-filter:none;-webkit-backdrop-filter:none}

/* ---- screen stack: iOS push/pop and card-zoom ---- */
.wsb-stack{position:relative;z-index:1;flex:1 1 auto;min-height:0;overflow:hidden}
/* 先在这层捕获主机表面色的原值（不同名 → 不构成循环引用）。 */
.wsb-stack{--wsb-host-layer-1:var(--dsw-alias-bg-layer-1);--wsb-host-layer-2:var(--dsw-alias-bg-layer-2)}
/* 统一：四个模块屏的标题栏用同一套玻璃表面（与窗口面板同一组 --wsb-glass-* 变量）。 */
.wsb-head,.wsb-nwHead,.wsb-stkHead,.wsb-noteTopRow{
  padding:8px 11px;border-radius:14px;
  border:1px solid color-mix(in srgb,var(--dsw-alias-label-primary) 10%,transparent);
  background:color-mix(in srgb,var(--dsw-alias-bg-layer-1) calc(var(--wsb-glass-alpha,18%) + 24%),transparent);
  -webkit-backdrop-filter:blur(var(--wsb-glass-blur,8px)) saturate(var(--wsb-glass-sat,180%));
  backdrop-filter:blur(var(--wsb-glass-blur,8px)) saturate(var(--wsb-glass-sat,180%))}
/* 模块窗口里的所有表面统一走同一套毛玻璃：把主机表面色本身改成半透明，
   透明度仍由「图标材质 / 透明度」那套变量驱动 —— 于是视频的主色调透得进来，
   四个模块窗口（新闻/股市/笔记/控制台）与桌面磁贴用的是同一种材质语言。 */
.wsb-screen:not([data-role="home"]){
  --dsw-alias-bg-layer-1:color-mix(in srgb,color-mix(in srgb,var(--wsb-host-layer-1),#fff 18%) calc(var(--wsb-glass-alpha,18%) + 24%),transparent);
  --dsw-alias-bg-layer-2:color-mix(in srgb,color-mix(in srgb,var(--wsb-host-layer-2),#fff 18%) calc(var(--wsb-glass-alpha,18%) + 24%),transparent)}
.wsb-screen{position:absolute;inset:0;display:flex;flex-direction:column;min-height:0;overflow:hidden;
  border-radius:0;background:transparent}
/* No will-change here on purpose. Forcing a compositor layer on an element that contains a
   dozen backdrop-filter panes is not free, and on some GPU/driver combinations it makes the
   layer flash black for a frame or two during the fade — which is exactly the reported
   "black screen". The browser already promotes an element that is actively animating
   opacity, so the hint was buying nothing and risking that flash. */
/* Screen transitions must stay on the compositor. They used to interpolate border-radius
   as well, which repaints the whole screen on every frame of the zoom — with a dozen
   backdrop-filter panes underneath that is the "卡卡的" arrival. Transform + opacity only. */
.wsb-screen[data-anim="push-in"]{animation:wsb-pushIn var(--wsb-dur) var(--wsb-ease-out) both}
.wsb-screen[data-anim="push-out"]{animation:wsb-pushOut var(--wsb-dur) var(--wsb-ease-in) both}
.wsb-screen[data-anim="pop-in"]{animation:wsb-popIn var(--wsb-dur-exit) var(--wsb-ease-out) both}
.wsb-screen[data-anim="pop-out"]{animation:wsb-popOut var(--wsb-dur-exit) var(--wsb-ease-in) both}
.wsb-screen[data-anim="fade-out"]{animation:wsb-fadeOut var(--wsb-dur-zoom) var(--wsb-spring-soft) both}
.wsb-screen[data-anim="fade-in"]{animation:wsb-fadeInBack var(--wsb-dur-zoom) var(--wsb-spring-soft) both}
.wsb-screen[data-anim="zoom-in"]{transform-origin:var(--wsb-ox,0) var(--wsb-oy,0);
  animation:wsb-zoomIn var(--wsb-enter-dur,.62s) var(--wsb-enter-ease) both}
.wsb-screen[data-anim="zoom-out"]{transform-origin:var(--wsb-ox,0) var(--wsb-oy,0);
  animation:wsb-zoomOut calc(var(--wsb-dur-zoom) * .72) var(--wsb-spring) both}
.wsb-screen[data-anim="zoom-in"]>.wsb-root,
.wsb-screen[data-anim="zoom-out"]>.wsb-root{animation:wsb-contentIn .3s ease .13s both}
@keyframes wsb-contentIn{from{opacity:0}to{opacity:1}}
@keyframes wsb-pushIn{from{transform:translate3d(100%,0,0);opacity:.55}to{transform:none;opacity:1}}
@keyframes wsb-pushOut{from{transform:none;opacity:1}to{transform:translate3d(-30%,0,0);opacity:.3}}
@keyframes wsb-popIn{from{transform:translate3d(-30%,0,0);opacity:.3}to{transform:none;opacity:1}}
@keyframes wsb-popOut{from{transform:none;opacity:1}to{transform:translate3d(100%,0,0);opacity:.55}}
@keyframes wsb-fadeOut{from{transform:none;opacity:1}to{transform:scale(1.035);opacity:0}}
@keyframes wsb-fadeInBack{from{transform:scale(1.035);opacity:0}to{transform:none;opacity:1}}
/* The arrival is a FADE, not a scale. Scaling a screen that contains several
   backdrop-filter panes makes the browser re-run every one of those blurs on every frame;
   a pure fade is compositor-only and therefore can hold a high frame rate. It decelerates
   (fast at first, then settling) and is a touch longer than a snap, which is what makes it
   read as calm rather than abrupt. */
@keyframes wsb-zoomIn{
  from{opacity:0}
  to{opacity:1}}
@keyframes wsb-zoomOut{
  from{transform:none;opacity:1}
  to{transform:translate3d(var(--wsb-ox,0px),var(--wsb-oy,0px),0) scale(var(--wsb-sx,1),var(--wsb-sy,1));
    opacity:0}}

/* ---- home: module card grid ---- */
.wsb-home{position:relative;/* The size container is the CARD AREA, and it has to sit on this parent: cqw
  resolves against an ancestor container, never against the element that declares it (there
  it would fall back to the viewport, and the row would overflow the area). */
  container-type:inline-size;display:flex;flex-direction:column;height:100%;min-height:0;box-sizing:border-box;
  padding:calc(var(--dsh-frame-top-clearance,0px) + 18px) 22px 18px}
.wsb-homeHead{display:flex;align-items:flex-end;gap:10px;flex-wrap:wrap;margin-bottom:15px;flex:0 0 auto}
.wsb-homeTitle{min-width:0;margin-right:auto}
.wsb-homeTitle h1{margin:0;font-size:20px;font-weight:660;letter-spacing:.2px}
.wsb-homeTitle p{margin:3px 0 0;font-size:11.5px;color:var(--dsw-alias-label-secondary)}
.wsb-cards{flex:1 1 auto;min-height:0;overflow:auto;display:grid;align-content:start;
  /* A definite width is REQUIRED here: this element is a size container, so it cannot take
     its width from the tiles, and without this it shrinks to fit and every tile collapses. */
  width:100%;box-sizing:border-box;
  margin-inline:auto;
  /* Three tiles per row. With three columns a tile is 2/7 of the inline size, so a quarter of a
     tile is 1/14 = 7.143cqw of this grid — one unit for the column AND the row gap, which is
     what keeps the horizontal and vertical spacing identical. */
  /* Measured off the reference layout: four icons per row, an icon 13.4% of the card area and a
     gap 2.7% of it on BOTH axes, with the block centred. Expressed in cqw of this element, so
     the proportions are identical at every window size. */
  grid-template-columns:repeat(4,13.4cqw);
  /* The row is exactly as tall as a column is wide, so every cell is a square. An
     aspect-ratio alone is only a preferred height: taller content stretches the box and the
     50% corners that 0 asks for then render an ellipse. */
  grid-auto-rows:13.4cqw;
  gap:2.7cqw;justify-content:center;align-content:start;padding:2px 2px 10px}
.wsb-card{position:relative;display:flex;flex-direction:column;gap:9px;text-align:left;appearance:none;font:inherit;
  cursor:pointer;min-height:168px;padding:14px;border-radius:var(--wsb-card-radius);overflow:hidden;
  border:1px solid color-mix(in srgb,var(--dsw-alias-border-l1) calc(55% + var(--wsb-glass-rim,1) * 45%),transparent);
  /* 偏中性的浅色: 玻璃靠折射与边缘, 不靠填充色. */
  background:color-mix(in srgb,color-mix(in srgb,var(--dsw-alias-bg-layer-1) 40%,#fff) var(--wsb-glass-alpha,18%),transparent);
  -webkit-backdrop-filter:blur(var(--wsb-glass-blur,26px)) saturate(var(--wsb-glass-sat,170%));
  backdrop-filter:blur(var(--wsb-glass-blur,26px)) saturate(var(--wsb-glass-sat,170%));
  box-shadow:0 var(--wsb-elev-y,16px) 34px -16px rgba(0,0,0,.55),
    inset 0 1px 0 color-mix(in srgb,#fff calc(13% * var(--wsb-glass-spec,1)),transparent),
    inset 0 calc(-24px * var(--wsb-glass-depth,0)) calc(36px * var(--wsb-glass-depth,0)) calc(-26px * var(--wsb-glass-depth,0)) rgba(0,0,0,.55);
  transition:transform .3s var(--wsb-spring),box-shadow .3s ease,border-color .3s ease;
  animation:wsb-cardIn .5s var(--wsb-spring) both}
.wsb-card:before{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;
  background:linear-gradient(140deg,color-mix(in srgb,#fff calc(9% * var(--wsb-glass-sheen,1)),transparent),transparent 46%)}
.wsb-card:hover{transform:translateY(-4px);border-color:var(--dsw-alias-border-l2);
  box-shadow:0 26px 48px -18px rgba(0,0,0,.62),inset 0 1px 0 color-mix(in srgb,#fff 15%,transparent)}
.wsb-card:active{transform:scale(.965)}
.wsb-card[data-open="true"]{opacity:0;transition:opacity .3s ease}
@keyframes wsb-cardIn{from{opacity:0;transform:translateY(16px) scale(.95)}to{opacity:1;transform:none}}
/* 极简磁贴：居中一条单线标记 + 模块名，仅此而已。参考极简线条设计（单一线宽、圆端、无填充）。 */
.wsb-card{flex-direction:column;align-items:center;justify-content:center;gap:0;text-align:center;
  /* 宽与高同一单位: 磁贴必然是正方形, 谁也改不了. 内容超出由 overflow:hidden 裁掉. */
  width:13.4cqw;height:13.4cqw;min-height:0;max-height:13.4cqw;
  box-sizing:border-box;justify-self:center;align-self:start;
  /* 高度不再声明: 由内容保证 —— 见 .wsb-tileMark (aspect-ratio:1) 与绝对定位的名字. */
  /* Symmetric padding + border-box: with an asymmetric padding and the content box model the
     box ends up taller than it is wide, and 50% corners then render an ellipse rather than the
     circle that 0 promises. */
  padding:9px;gap:5px}
.wsb-tileMark{width:76%;height:76%;min-height:0;display:grid;place-items:center;
  color:var(--dsw-alias-label-primary);opacity:.9;
  transition:transform .45s var(--wsb-spring),opacity .3s ease}
/* The mark fills its cell, which makes the artwork read as roughly 55–60% of the whole tile
   (the pen is inset inside its 24×24 viewBox). */
.wsb-tileMark svg{width:100%;height:100%}
.wsb-card:hover .wsb-tileMark{transform:translateY(-2px) scale(1.035);opacity:1}
/* 名字是浮层: 默认隐藏, 悬停/聚焦淡入. 它不参与布局, 所以图标永远居中. */
.wsb-card{--wsb-label-on:0}
.wsb-card:hover,.wsb-card:focus-visible{--wsb-label-on:1}
.wsb-tileAbbr{position:absolute;left:0;right:0;bottom:24px;text-align:center;
  font-size:9px;font-weight:600;letter-spacing:1.4px;text-transform:uppercase;
  color:var(--dsw-alias-label-secondary);
  opacity:var(--wsb-label-on,0);transition:opacity .22s ease}
.wsb-tileName{position:absolute;left:0;right:0;bottom:7px;font-size:11.5px;font-weight:600;letter-spacing:.2px;
  opacity:var(--wsb-label-on,0);transition:opacity .22s ease;
  color:var(--dsw-alias-label-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
  text-align:center}
/* The add tile offers all three shipped modules rather than only a console: they are three
   different products, and "new module" defaulting to a conversation console was the only way
   to get a news reader or a notebook without editing storage. */
  border:1px solid var(--dsw-alias-border-l1);background:transparent;color:var(--dsw-alias-label-secondary);

/* ---- iOS-style controls (rows now come from .wsb-field / .wsb-fieldSwitch) ---- */
.wsb-popSep{height:1px;background:var(--dsw-alias-border-l1);margin:10px -13px}
.wsb-switch{position:relative;flex:0 0 auto;width:38px;height:22px;padding:0;border:0;border-radius:22px;cursor:pointer;
  background:var(--dsw-alias-bg-layer-2);transition:background .24s ease}
.wsb-switch[aria-checked="true"]{background:var(--dsw-alias-state-success-primary)}
.wsb-switch:after{content:"";position:absolute;top:2px;left:2px;width:18px;height:18px;border-radius:50%;background:#fff;
  box-shadow:0 1px 4px rgba(0,0,0,.35);transition:transform .24s var(--wsb-spring)}
.wsb-switch[aria-checked="true"]:after{transform:translateX(16px)}
/* 自定义界面: the switch, the chosen file and the honest note about what it saves. */
.wsb-switchRow{display:flex;align-items:center;gap:10px;margin:2px 0 4px}
.wsb-switchLabel{flex:1 1 auto;font-size:12px;color:var(--dsw-alias-label-primary)}
.wsb-switchHint{font-size:10.5px;line-height:1.5;color:var(--dsw-alias-label-secondary);margin:0 0 8px}
.wsb-customRow{display:flex;align-items:center;gap:8px;margin:0 0 8px;padding:7px 9px;border-radius:10px;
  border:1px solid var(--dsw-alias-border-l1);
  background:color-mix(in srgb,var(--dsw-alias-bg-layer-2) 52%,transparent)}
.wsb-customName{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11.5px;
  cursor:text}
.wsb-nameInput{width:100%;box-sizing:border-box;font:inherit;font-size:11.5px;padding:3px 7px;border-radius:7px;
  color:var(--dsw-alias-label-primary);outline:none;
  border:1px solid color-mix(in srgb,var(--dsw-alias-label-primary) 24%,transparent);
  background:color-mix(in srgb,var(--dsw-alias-bg-layer-2) 72%,transparent)}
.wsb-customKind{flex:0 0 auto;font-size:10px;color:var(--dsw-alias-label-secondary)}
.wsb-customList{display:flex;gap:5px;overflow-x:auto;padding-bottom:2px}
.wsb-customChip{flex:0 0 auto;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
  padding:3px 8px;border-radius:8px;border:1px solid var(--dsw-alias-border-l1);background:transparent;
  color:var(--dsw-alias-label-secondary);font:inherit;font-size:10.5px;cursor:pointer}
.wsb-customChip[data-on="true"]{background:color-mix(in srgb,var(--wsb-c1) 24%,transparent);color:var(--dsw-alias-label-primary)}
.wsb-range{-webkit-appearance:none;appearance:none;height:4px;border-radius:4px;outline:none;
  background:var(--dsw-alias-bg-layer-2)}
.wsb-range::-webkit-slider-thumb{-webkit-appearance:none;width:14px;height:14px;border-radius:50%;cursor:pointer;
  background:#fff;border:1px solid var(--dsw-alias-border-l2);box-shadow:0 2px 6px rgba(0,0,0,.4)}

/* ---- in-panel cross-fade + animated column resize ---- */
.wsb-xfade{animation:wsb-xIn .34s var(--wsb-spring-soft) both}
@keyframes wsb-xIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
.wsb-grid{transition:grid-template-columns var(--wsb-dur) var(--wsb-spring)}

/* ---- v3: palette / glass / shape variables ---- */
.wsb-root{--wsb-c1:#5aa9ff;--wsb-c2:#7c5cff;--wsb-c3:#3ddc97;
  /* The running ring is its own 7-stop multi-hue sweep; each palette supplies one. */
  --wsb-g1:#4facfe;--wsb-g2:#7c5cff;--wsb-g3:#f472b6;--wsb-g4:#ffb86b;
  --wsb-g5:#ffd166;--wsb-g6:#4ade80;--wsb-g7:#22d3ee;
  --wsb-glass-alpha:52%;--wsb-glass-blur:28px;--wsb-card-radius:20px;--wsb-aurora-dur:26s;
  /* Surface ladder — elevation is a surface step, not a shadow (Raycast's rule). */
  --wsb-surface-1:var(--dsw-alias-bg-base);
  --wsb-surface-2:var(--dsw-alias-bg-layer-1);
  --wsb-surface-3:var(--dsw-alias-bg-layer-2);
  --wsb-surface-4:var(--dsw-alias-bg-layer-3,var(--dsw-alias-bg-layer-2));
  --wsb-elev-y:16px;
  /* Arrival: a decelerating fade, a little longer than a snap, then the content sweep. */
  --wsb-enter-dur:.62s;--wsb-enter-ease:cubic-bezier(.16,.84,.24,1)}
[data-palette="aurora"]{--wsb-c1:#5aa9ff;--wsb-c2:#7c5cff;--wsb-c3:#3ddc97;
  --wsb-g1:#4facfe;--wsb-g2:#7c5cff;--wsb-g3:#f472b6;--wsb-g4:#ffb86b;
  --wsb-g5:#ffd166;--wsb-g6:#4ade80;--wsb-g7:#22d3ee;
  --wsb-glass-tint:#8fa6c8}
[data-palette="ocean"]{--wsb-c1:#2bb3d4;--wsb-c2:#2f6df6;--wsb-c3:#48e0c0;
  --wsb-g1:#22d3ee;--wsb-g2:#38bdf8;--wsb-g3:#2f6df6;--wsb-g4:#6366f1;
  --wsb-g5:#48e0c0;--wsb-g6:#0ea5e9;--wsb-g7:#7dd3fc;
  --wsb-glass-tint:#7fa8c4}
[data-palette="sunset"]{--wsb-c1:#ff8a5c;--wsb-c2:#ff5c8a;--wsb-c3:#ffd166;
  --wsb-g1:#ff9f68;--wsb-g2:#ff7a59;--wsb-g3:#ff5c8a;--wsb-g4:#e04f9b;
  --wsb-g5:#ffd166;--wsb-g6:#ffb347;--wsb-g7:#f472b6;
  --wsb-glass-tint:#c99a86}
[data-palette="forest"]{--wsb-c1:#4ade80;--wsb-c2:#0ea5e9;--wsb-c3:#a3e635;
  --wsb-g1:#4ade80;--wsb-g2:#22c55e;--wsb-g3:#a3e635;--wsb-g4:#facc15;
  --wsb-g5:#0ea5e9;--wsb-g6:#2dd4bf;--wsb-g7:#86efac;
  --wsb-glass-tint:#86b79a}
[data-palette="candy"]{--wsb-c1:#f472b6;--wsb-c2:#a78bfa;--wsb-c3:#22d3ee;
  --wsb-g1:#f472b6;--wsb-g2:#ec4899;--wsb-g3:#a78bfa;--wsb-g4:#818cf8;
  --wsb-g5:#22d3ee;--wsb-g6:#67e8f9;--wsb-g7:#f9a8d4;
  --wsb-glass-tint:#c39ad0}
[data-palette="ember"]{--wsb-c1:#fb923c;--wsb-c2:#ef4444;--wsb-c3:#facc15;
  --wsb-g1:#fb923c;--wsb-g2:#f97316;--wsb-g3:#ef4444;--wsb-g4:#dc2626;
  --wsb-g5:#facc15;--wsb-g6:#fbbf24;--wsb-g7:#f87171;
  --wsb-glass-tint:#c08a70}
[data-palette="slate"]{--wsb-c1:#94a3b8;--wsb-c2:#64748b;--wsb-c3:#cbd5e1;
  --wsb-g1:#cbd5e1;--wsb-g2:#94a3b8;--wsb-g3:#64748b;--wsb-g4:#7dd3fc;
  --wsb-g5:#e2e8f0;--wsb-g6:#38bdf8;--wsb-g7:#a5b4fc;
  --wsb-glass-tint:#9aa6b6}
/* The four frosted materials are four DIFFERENT qualities, not four opacities. Each sets the
   character of the surface: how much it blurs, how much it re-saturates what sits behind it,
   whether it carries a specular sweep, how strong its hairline rim is, and whether it has real
   depth (a thick slab reads as thick because of its inner shadow). Opacity is deliberately NOT
   one of the differences any more: it is the 透明度 slider, which overrides --wsb-glass-alpha. */
[data-glass="thin"]{--wsb-glass-alpha:10%;--wsb-glass-blur:12px;--wsb-glass-sat:135%;
  --wsb-glass-bright:1.05;--wsb-glass-rim:.7;--wsb-glass-spec:.55;--wsb-glass-sheen:0;--wsb-glass-depth:0;--wsb-elev-y:8px}
[data-glass="regular"]{--wsb-glass-alpha:18%;--wsb-glass-blur:8px;--wsb-glass-sat:180%;
  --wsb-glass-bright:1;--wsb-glass-rim:1;--wsb-glass-spec:1;--wsb-glass-sheen:1;--wsb-glass-depth:0;--wsb-elev-y:16px}
[data-glass="thick"]{--wsb-glass-alpha:14%;--wsb-glass-blur:6px;--wsb-glass-sat:165%;
  --wsb-glass-bright:.99;--wsb-glass-rim:1.25;--wsb-glass-spec:1.35;--wsb-glass-sheen:1.6;--wsb-glass-depth:1;--wsb-elev-y:24px}
[data-glass="solid"]{--wsb-glass-alpha:88%;--wsb-glass-blur:0px;--wsb-glass-sat:100%;
  --wsb-glass-bright:1;--wsb-glass-rim:.35;--wsb-glass-spec:.2;--wsb-glass-sheen:0;--wsb-glass-depth:.35;--wsb-elev-y:6px}

/* glass and cards now read the scheme variables */
.wsb-glass{background:color-mix(in srgb,var(--dsw-alias-bg-layer-1) var(--wsb-glass-alpha),transparent);
  -webkit-backdrop-filter:blur(var(--wsb-glass-blur)) saturate(170%);backdrop-filter:blur(var(--wsb-glass-blur)) saturate(170%)}

/* ---- aurora: the flowing light the workbench boots with ---- */
.wsb-aurora{position:absolute;inset:0;overflow:hidden;background:var(--dsw-alias-bg-base);
  /* These ranges are wide on purpose. At maximum, 形变幅度 is a heavy, obviously
     distorted morph (non-uniform scale + rotation), not a subtle wobble. */
  --wsb-shape:calc(var(--wsb-shape-var,40) / 100 * 1.7);
  --wsb-hue:calc(var(--wsb-hue-var,35) / 100 * 180)}
/* The blob carries the BLUR only, and animates only its transform. A filter *animation*
   replaces the whole static filter, so putting the hue animation here would silently drop
   the blur — which is exactly how the 边缘模糊度 slider broke. The hue drifts on ::after
   instead: it composites over the blurred blob, so both survive. */
.wsb-aurora i{position:absolute;display:block;border-radius:50%;will-change:transform;
  filter:blur(calc(4px + var(--wsb-edge,50) / 100 * 156px))
    saturate(var(--wsb-sat,1)) brightness(var(--wsb-tone,1));
  animation:wsb-aurora var(--wsb-aurora-dur) ease-in-out infinite alternate}
.wsb-aurora i::after{content:"";position:absolute;inset:0;border-radius:inherit;
  background:inherit;opacity:.45;pointer-events:none;
  animation:wsb-auroraTone var(--wsb-hue-dur,88s) ease-in-out infinite}
.wsb-aurora i:nth-child(1){width:62%;height:70%;left:-14%;top:-22%;background:var(--wsb-c1);opacity:.52;--wsb-drift:1}
.wsb-aurora i:nth-child(2){width:52%;height:58%;right:-12%;top:-8%;background:var(--wsb-c2);opacity:.44;--wsb-drift:1.35;
  animation-delay:-7s;animation-duration:calc(var(--wsb-aurora-dur) * 1.22)}
.wsb-aurora i:nth-child(3){width:64%;height:52%;left:14%;bottom:-24%;background:var(--wsb-c3);opacity:.34;--wsb-drift:.72;
  animation-delay:-13s;animation-duration:calc(var(--wsb-aurora-dur) * .86)}
.wsb-aurora i:nth-child(4){width:42%;height:44%;right:4%;bottom:-16%;background:var(--wsb-c2);opacity:.28;--wsb-drift:1.6;
  animation-delay:-19s;animation-duration:calc(var(--wsb-aurora-dur) * 1.35)}
/* Flow (drift + shape distortion), tone (hue speed + colour range + saturation +
   brightness) — kept as separate animations so every knob stays independent. */
@keyframes wsb-aurora{
  0%{transform:translate3d(0,0,0) scale(1,1) rotate(0deg)}
  50%{transform:translate3d(calc(var(--wsb-drift,1) * var(--wsb-shape) * 22%),calc(var(--wsb-drift,1) * var(--wsb-shape) * 12%),0)
       scale(calc(1 + var(--wsb-shape)),calc(1 + var(--wsb-shape) * .45)) rotate(calc(var(--wsb-shape) * 22deg))}
  100%{transform:translate3d(calc(var(--wsb-drift,1) * -6%),calc(var(--wsb-drift,1) * 8%),0)
       scale(calc(1 + var(--wsb-shape) * .55),calc(1 + var(--wsb-shape) * 1.15)) rotate(calc(var(--wsb-shape) * -26deg))}}
/* Deltas only: the user's 饱和度 / 明暗色调 live on the element, so this animation must not
   re-declare them (it would override the sliders instead of combining with them). The two
   saturation multipliers are baked as the constants they always were. */
@keyframes wsb-auroraTone{
  0%{filter:hue-rotate(0deg) saturate(1)}
  33%{filter:hue-rotate(calc(var(--wsb-hue) * 1deg)) saturate(1.09)}
  66%{filter:hue-rotate(calc(var(--wsb-hue) * -.76deg)) saturate(1.05)}
  100%{filter:hue-rotate(0deg) saturate(1)}}
.wsb-consoleAurora{position:absolute;inset:0;z-index:0;opacity:.46;pointer-events:none;overflow:hidden}
.wsb-root>.wsb-head,.wsb-root>.wsb-grid,.wsb-root>.wsb-strip{position:relative;z-index:1}

/* media must look untouched unless a blur was actually asked for */
.wsb-bgMedia{transform:none}
.wsb-bgMedia[data-blurred="true"]{transform:scale(1.06)}

/* ---- screen stacking: the console is always above the home screen ---- */
.wsb-stack>.wsb-screen[data-role="home"]{z-index:1}
.wsb-stack>.wsb-screen[data-role="console"],
.wsb-stack>.wsb-screen[data-role="news"],
.wsb-stack>.wsb-screen[data-role="stock"]{z-index:2}
/* 框架笔记 is its own full-screen window above the home screen, like the console. */
.wsb-stack>.wsb-screen[data-role="notes"]{z-index:2}
/* Once the console has settled, the home screen must stop existing visually: its
   cards would otherwise show straight through the console's frosted panes. */
.wsb-screen[data-concealed="true"]{visibility:hidden;pointer-events:none}

/* ---- 模块内背景：压暗 + 模糊（0 = 不变，且完全不产生开销）----------------
   模块屏本身是透明的，所以下面就是桌面背景。这一层只做 backdrop-filter：
   模糊它（blur）并压暗它（brightness）。强度为 0 时 data-dim=false → none，不进合成。 */
.wsb-stack::after{content:"";position:absolute;inset:0;z-index:1;
  pointer-events:none;
  /* 滤镜从头就开着，靠 opacity 渐入 —— 这样既不闪黑，也是"渐渐变暗"。 */
  opacity:1;
    backdrop-filter:blur(calc(var(--wsb-dim,0) * 0.2px)) brightness(calc(1 - var(--wsb-dim,0) * 0.0065))}

/* 顺序：背景先渐渐压暗，窗口内容随后浮现（复用项目中已有的 wsb-contentIn 关键帧）。 */
[data-dim="false"] .wsb-stack::after{backdrop-filter:none}
/* 退出时跟着屏的退场一起淡出 —— 否则它会一直留到最后才被"啪"地关掉（就是那一下卡顿）。 */
.wsb-stack[data-phase="exiting"]::after{animation:wsb-dimOut var(--wsb-dur-zoom) var(--wsb-ease-in) both}
@keyframes wsb-dimOut{from{opacity:1}to{opacity:0}}
.wsb-head,.wsb-nwHead,.wsb-stkHead{position:relative;z-index:6}
.wsb-dimWrap{position:relative;display:inline-flex;flex:0 0 auto;order:9;margin-left:auto}
.wsb-dimBtn{appearance:none;width:28px;height:28px;padding:0;cursor:pointer;font:inherit;
  display:grid;place-items:center;
  border-radius:9px;color:var(--dsw-alias-label-secondary);
  border:1px solid color-mix(in srgb,var(--dsw-alias-label-primary) 12%,transparent);
  background:color-mix(in srgb,var(--dsw-alias-bg-layer-2) 50%,transparent);
  transition:color .18s ease,background .18s ease}
.wsb-dimIcon{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:1.5;
  stroke-linecap:round;stroke-linejoin:round}
.wsb-dimBtn:hover{color:var(--dsw-alias-label-primary);
  background:color-mix(in srgb,var(--dsw-alias-bg-layer-2) 78%,transparent)}
.wsb-dimPop{position:absolute;left:0;top:calc(100% + 8px);z-index:9;width:238px;padding:12px 13px;
  border-radius:14px;border:1px solid color-mix(in srgb,var(--dsw-alias-label-primary) 12%,transparent);
  background:color-mix(in srgb,var(--dsw-alias-bg-overlay) 76%,transparent);
  -webkit-backdrop-filter:blur(26px) saturate(180%);backdrop-filter:blur(26px) saturate(180%);
  box-shadow:0 22px 44px -20px rgba(0,0,0,.6);animation:wsb-nwIn .2s cubic-bezier(.22,.9,.24,1) both}
.wsb-dimInline{display:inline-flex;align-items:center;gap:10px;padding:3px 10px 3px 12px;
  border-radius:11px;border:1px solid color-mix(in srgb,var(--dsw-alias-label-primary) 12%,transparent);
  background:color-mix(in srgb,var(--dsw-alias-bg-layer-2) 46%,transparent);
  animation:wsb-nwIn .2s cubic-bezier(.22,.9,.24,1) both}
.wsb-dimInline .wsb-field{grid-template-columns:auto 132px 30px;gap:8px;padding:0}
.wsb-dimInline .wsb-field>label{font-size:11px}
.wsb-dimInline .wsb-dimHint{margin:0;font-size:10.5px;max-width:22ch;white-space:normal}
.wsb-dimHint{margin-top:6px;font-size:11px;line-height:1.5;color:var(--dsw-alias-label-secondary)}
@media (prefers-reduced-motion:reduce){.wsb-dimPop{animation:none}.wsb-dimBtn{transition:none}}

/* ---- form rows: a grid so labels, sliders and values can never overlap ---- */
.wsb-field{display:grid;grid-template-columns:52px minmax(0,1fr) 30px;align-items:center;gap:9px;padding:5px 0}
.wsb-field>label{font-size:11.5px;color:var(--dsw-alias-label-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wsb-field>output{font-size:11px;text-align:right;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-secondary)}
.wsb-fieldSwitch{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:9px;padding:5px 0;font-size:11.5px}
.wsb-fieldSwitch>span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wsb-range{width:100%;min-width:0;flex:none}
.wsb-panelNote{font-size:10.5px;color:var(--dsw-alias-label-secondary);padding:4px 2px;line-height:1.6}

/* ---- bottom dock: the only chrome on the home screen ---- */
.wsb-dock{position:absolute;left:50%;bottom:20px;transform:translateX(-50%);z-index:6;
  display:flex;align-items:center;gap:4px;padding:6px;border-radius:999px;
  border:1px solid var(--dsw-alias-border-l1);
  background:color-mix(in srgb,var(--dsw-alias-bg-overlay) var(--wsb-glass-alpha),transparent);
  -webkit-backdrop-filter:blur(var(--wsb-glass-blur)) saturate(175%);backdrop-filter:blur(var(--wsb-glass-blur)) saturate(175%);
  box-shadow:0 20px 44px -18px rgba(0,0,0,.62),inset 0 1px 0 color-mix(in srgb,#fff 13%,transparent);
  animation:wsb-dockIn .5s var(--wsb-spring) both}
@keyframes wsb-dockIn{from{opacity:0;transform:translate(-50%,18px)}to{opacity:1;transform:translateX(-50%)}}
.wsb-dockBtn{appearance:none;border:0;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;
  width:38px;height:38px;border-radius:999px;display:grid;place-items:center;
  transition:background .2s ease,color .2s ease,transform .2s var(--wsb-spring)}
.wsb-dockBtn:hover{background:color-mix(in srgb,var(--dsw-alias-bg-layer-1) 72%,transparent);color:var(--dsw-alias-label-primary)}
.wsb-dockBtn:active{transform:scale(.93)}
.wsb-dockBtn[data-on="true"]{background:color-mix(in srgb,var(--wsb-c1) 28%,transparent);color:var(--dsw-alias-label-primary)}
.wsb-dockBtn svg{display:block}
.wsb-dockPop{position:absolute;left:50%;bottom:72px;z-index:7;width:302px;max-height:62vh;overflow:auto;
  border-radius:20px;border:1px solid var(--dsw-alias-border-l1);padding:13px;
  background:color-mix(in srgb,var(--dsw-alias-bg-overlay) var(--wsb-glass-alpha),transparent);
  -webkit-backdrop-filter:blur(var(--wsb-glass-blur)) saturate(180%);backdrop-filter:blur(var(--wsb-glass-blur)) saturate(180%);
  box-shadow:0 30px 64px -22px rgba(0,0,0,.72),inset 0 1px 0 color-mix(in srgb,#fff 12%,transparent);
  transform:translateX(-50%);transform-origin:bottom center;animation:wsb-popUp .3s var(--wsb-spring) both}
@keyframes wsb-popUp{from{opacity:0;transform:translateX(-50%) translateY(10px) scale(.96)}
  to{opacity:1;transform:translateX(-50%)}}

/* ---- reference-style card grid ---- */

/* A running module gets a slow aurora ring around its tile. */
.wsb-sideMod{position:relative;display:grid;place-items:center;color:var(--dsw-alias-label-secondary)}
/* The row's marker is a status dot, not an icon: grey while idle, lit green (and
   breathing) while that module's session is actually working.
   It is deliberately chunky and drawn with an explicit colour — at rail size a faint
   themed dot reads as "nothing here", which defeats the point of the marker. */
.wsb-sideMod .wsb-dot{display:block;flex:0 0 auto;border-radius:50%;min-width:9px;min-height:9px;
  background:#8f939c;
  box-shadow:inset 0 0 0 1px rgba(255,255,255,.22),0 0 0 1px rgba(0,0,0,.35)}
.wsb-sideMod[data-state="run"] .wsb-dot{background:#32d74b;
  box-shadow:0 0 0 3px rgba(50,215,75,.26),0 0 10px rgba(50,215,75,.85);
  animation:wsb-dotPulse 1.9s ease-in-out infinite}
@keyframes wsb-dotPulse{0%,100%{opacity:1}50%{opacity:.5}}

/* The entrance runs in TWO phases, the way an iOS push does:
     1. the screen itself fades in — fast at first, then settling (a decelerating curve);
     2. only once it is fully shown, the content sweeps: chrome bounces in reading order and
        the measured graphics grow from zero.
   Because phase 2 cannot start until phase 1's animationend, nothing here is ever running
   while the screen is still transitioning — that is what keeps the frames clean. */
[data-sweep="go"] .wsb-anim{animation:wsb-piano .46s cubic-bezier(.16,.84,.24,1) both;
  animation-delay:calc(var(--wsb-i,0) * 28ms)}
/* Suppress the wave for everything rendered inside a pane, then re-enable it for the
   pane chrome itself (the KPI strip and the graph toolbar are part of the arrival). */
[data-sweep="go"] .wsb-card .wsb-anim,
[data-sweep="go"] .wsb-body .wsb-anim,
[data-sweep="go"] .wsb-trailStrip .wsb-anim,
[data-sweep="go"] .wsb-strip .wsb-anim{animation:none}
[data-sweep="go"] .wsb-overview .wsb-anim{animation:wsb-piano .46s cubic-bezier(.16,.84,.24,1) both;
  animation-delay:calc(var(--wsb-i,0) * 28ms)}
/* The measured graphics FILL instead of bouncing: each timeline bar rises from the baseline
   to its own height like a health bar, and each share bar widens from zero. These bars also
   carry .wsb-anim, so the bounce has to be cancelled first — and the cancel must come AFTER
   the .wsb-anim shorthand above, because the animation shorthand resets animation-name and
   is matched by exactly the same specificity. Order here is load-bearing, not cosmetic. */
[data-sweep="go"] .wsb-tlBar>i,
[data-sweep="go"] .wsb-shareTrack>i,
[data-sweep="go"] .wsb-shareTrack>b{animation:none}
[data-sweep="go"] .wsb-tlBar>i{animation:wsb-fillUp .62s cubic-bezier(.22,.86,.24,1) both;
  animation-delay:calc(var(--wsb-i,0) * 26ms)}
[data-sweep="go"] .wsb-shareTrack>i,
[data-sweep="go"] .wsb-shareTrack>b{animation:wsb-growBar .62s cubic-bezier(.16,.84,.24,1) both;
  animation-delay:calc(var(--wsb-i,0) * 14ms);
  transform-origin:left center}
@keyframes wsb-piano{
  0%{transform:translateY(0) scale(1)}
  36%{transform:translateY(-4px) scale(1.06)}
  68%{transform:translateY(1px) scale(.99)}
  100%{transform:translateY(0) scale(1)}}
@keyframes wsb-growBar{from{transform:scaleX(0)}to{transform:scaleX(1)}}
/* A health bar filling: the bar rises from the baseline to its own height and STOPS there.
   Deliberately the height property, not scaleY — a scale factor would stretch every bar by
   the same ratio, whereas the fill has to land exactly on each turn's real value. No bounce,
   no overshoot: the easing only decelerates. */
@keyframes wsb-fillUp{from{height:0}to{height:var(--wsb-h,0)}}

/* A running module wears LIQUID GLASS: the tile reads as a glass slab with coloured light
   pooling INSIDE it. Deliberately restrained, following the three design systems this was
   checked against:
     · Apple  — "no decorative gradients on chrome"; the only elevation is one soft shadow,
                and it is reserved for imagery, never for cards.
     · Raycast — "no drop-shadow elevation at all"; depth comes from a surface ladder plus a
               1px hairline border (#242728). Saturated accents never touch chrome.
     · Superhuman — two restrained shadow levels, 0 1px 3px / 0 8px 24px.
   So: the refraction lives inside the tile, the rim is a 1px hairline that catches light,
   and almost no light escapes past the edge. Nothing needs mask-composite, and every layer
   stays inside the card box because the tile list clips its content. */
/* 工作状态高光 — one quiet light pass. A single neutral sheen crosses the tile behind the
   content every few seconds, and the hairline brightens a little. One pseudo-element, one
   composited transform, one colour: no conic gradients, no hue rotation, no per-frame
   re-rasterisation, and nothing that competes with the minimal tiles. */
.wsb-card[data-running="true"]{
  border-color:color-mix(in srgb,var(--dsw-alias-label-primary) 22%,transparent)}
/* Inside: two soft pools of colour, blurred, drifting — the liquid part.
   The tone drift lives on this same pseudo-element rather than on the card root: a filter
   on the root invalidates the whole tile (caption, glyphs, its own backdrop-filter) on
   every frame, whereas here the blur already forces a re-raster, so the hue rides along
   for free. */
/* The edge: a 1px hairline rim tinted by the running colour, an inner catch-light, and a
   faint inward glow. The outward halo is a whisper — enough to lift the tile off the
   surface, not enough to read as neon. */
/* 工作状态：一道光沿磁贴内缘跑。遮罩跟随 border-radius，因此任何圆角都精确贴边。
   （offset-path 的路径与外框不重合，圆角越大偏差越大，所以换成这个做法。） */
/* 工作状态：一道光沿磁贴内缘跑。
   伪元素铺满，用 mask 只留 2px 的一圈 —— 遮罩跟随 border-radius，
   所以无论圆角多大，光带都精确贴着边缘。 */
@property --wsb-trace{syntax:'<angle>';initial-value:0deg;inherits:false}
.wsb-card[data-running="true"]::after{
  animation:wsb-trace 3.6s linear infinite;
  content:"";position:absolute;inset:-1px;z-index:2;pointer-events:none;padding:2px;border-radius:inherit;
  background:conic-gradient(from var(--wsb-trace),transparent 0deg 284deg,color-mix(in srgb,#fff 50%,transparent) 316deg,#fff 350deg,transparent 360deg);
  -webkit-mask:linear-gradient(#000,#000) content-box,linear-gradient(#000,#000);
  -webkit-mask-composite:xor;mask:linear-gradient(#000,#000) content-box,linear-gradient(#000,#000);
  mask-composite:exclude;
  /* 遮罩的硬边在曲线上不抗锯齿 —— 大圆角时满眼锯齿。半像素柔化即可，成本可忽略。 */
  filter:blur(.5px)}
@keyframes wsb-trace{to{--wsb-trace:360deg}}
/* Glass needs something to sit on: the content is lifted above both light layers. */
.wsb-card[data-running="true"]>*{position:relative;z-index:1}
/* Slow colour drift, held small so it reads as refraction, never as a hue flash. */
/* A hidden desktop must not keep animating behind the console. */
/* 点击模块的第一拍：磁贴淡出并放大，首页在 .46s 后才隐去 —— 于是切换读起来是连续的。 */
/* 点击那一刻就播（data-anim="fade-out" 只在入场阶段出现一次）—— 所以不会重播。 */
/* 第一拍：整个首页放大并淡出。只放在首页这一个元素上 —— 一个元素一条动画，不可能播两遍。 */
.wsb-screen[data-role="home"][data-anim="fade-out"]{
  animation-name:wsb-homeOut;animation-duration:.46s;animation-timing-function:cubic-bezier(.33,0,.2,1)}
@keyframes wsb-homeOut{from{opacity:1;transform:scale(1)}to{opacity:0;transform:scale(1.045)}}
@media (prefers-reduced-motion:reduce){.wsb-screen[data-role="home"][data-anim="fade-out"]{animation-name:wsb-fadeOut}}
.wsb-screen[data-concealed="true"] .wsb-card[data-running="true"]::after{animation-play-state:paused}
@media (prefers-reduced-motion:reduce){
  .wsb-card[data-running="true"]::after{animation:none;offset-distance:0%}
  .wsb-markLine{animation:none;stroke-dashoffset:0}}

/* ---- 便签: sticky notes on the desktop ---- */
.wsb-notes{position:absolute;inset:0;z-index:3;pointer-events:none}
.wsb-sticky{position:absolute;pointer-events:auto;
  display:flex;flex-direction:column;border-radius:14px;overflow:hidden;
  background:var(--sticky-bg,#f6d97a);color:var(--sticky-ink,#3d3010);
  box-shadow:0 14px 30px -14px rgba(0,0,0,.55);transition:box-shadow .2s ease}
.wsb-sticky[data-snapped]{box-shadow:0 22px 40px -18px rgba(0,0,0,.62),
  0 0 0 1.5px color-mix(in srgb,var(--wsb-c1,#7fb2ff) 75%,transparent)}
.wsb-sticky[data-dragging="true"]{z-index:5;box-shadow:0 28px 50px -18px rgba(0,0,0,.7);
  animation:wsb-jiggle .44s ease-in-out infinite}
.wsb-stickyHead{display:flex;align-items:center;gap:6px;padding:6px 8px;cursor:grab;touch-action:none;
  user-select:none;-webkit-user-select:none}
.wsb-sticky[data-dragging="true"],.wsb-sticky[data-dragging="true"] *{user-select:none;-webkit-user-select:none}
.wsb-stickyGrip{flex:1 1 auto;height:4px;border-radius:2px;
  background:color-mix(in srgb,var(--sticky-ink,#3d3010) 24%,transparent)}
.wsb-stickyDots{display:flex;gap:4px}
.wsb-stickyDot{width:13px;height:13px;padding:0;border-radius:50%;cursor:pointer;
  border:1px solid color-mix(in srgb,#000 18%,transparent)}
.wsb-stickyDot[data-on="true"]{outline:2px solid color-mix(in srgb,var(--sticky-ink,#3d3010) 55%,transparent);
  outline-offset:1px}
.wsb-stickyDel{width:17px;height:17px;padding:0;border:0;border-radius:50%;cursor:pointer;
  font:inherit;font-size:12px;line-height:1;display:grid;place-items:center;color:inherit;
  background:color-mix(in srgb,var(--sticky-ink,#3d3010) 16%,transparent)}
.wsb-stickyResize{position:absolute;right:0;bottom:0;width:18px;height:18px;cursor:nwse-resize;
  background:linear-gradient(135deg,transparent 52%,color-mix(in srgb,var(--sticky-ink,#3d3010) 34%,transparent) 52%,transparent 64%)}
.wsb-stickyBody{flex:1 1 auto;width:100%;box-sizing:border-box;min-height:96px;resize:none;border:0;
  outline:none;background:transparent;color:inherit;font:inherit;font-size:12.5px;line-height:1.55;
  padding:0 10px 10px}
.wsb-stickyBody::placeholder{color:color-mix(in srgb,var(--sticky-ink,#3d3010) 45%,transparent)}

/* ---- minimal panel pieces (media library, swatches) ---- */
.wsb-miniHead{display:flex;align-items:center;gap:8px;font-size:11px;letter-spacing:.3px;text-transform:uppercase;
  color:var(--dsw-alias-label-secondary);margin:10px 0 6px}
.wsb-swatch{display:grid;grid-template-columns:repeat(auto-fill,minmax(60px,1fr));gap:6px}
.wsb-swatchBtn{appearance:none;font:inherit;border:1px solid var(--dsw-alias-border-l1);border-radius:11px;cursor:pointer;
  padding:6px 4px;background:transparent;color:var(--dsw-alias-label-secondary);font-size:10px;
  display:grid;justify-items:center;gap:4px;transition:border-color .2s ease,background .2s ease,color .2s ease}
.wsb-swatchBtn:hover{color:var(--dsw-alias-label-primary)}
.wsb-swatchBtn[data-on="true"]{border-color:var(--wsb-c1);color:var(--dsw-alias-label-primary);
  background:color-mix(in srgb,var(--wsb-c1) 14%,transparent)}
.wsb-swatchDots{display:flex;gap:3px}
.wsb-swatchDots i{width:11px;height:11px;border-radius:50%;display:block}

/* ---- colour the console instead of leaving it black and white ---- */
.wsb-screen[data-role="console"] .wsb-paneHead{background:color-mix(in srgb,var(--wsb-c1) 12%,transparent)}
.wsb-screen[data-role="console"] .wsb-root{background:transparent}
.wsb-gauge i{background:linear-gradient(90deg,var(--wsb-c1),var(--wsb-c2))}
.wsb-tlBar>i{background:color-mix(in srgb,var(--wsb-c1) 74%,transparent)}
.wsb-tlBar[data-on="true"]>i{background:var(--wsb-c1)}
.wsb-row[data-sel="true"]{background:color-mix(in srgb,var(--wsb-c1) 18%,transparent)}
.wsb-edge{stroke:color-mix(in srgb,var(--wsb-c1) 32%,transparent)}
.wsb-edge[data-hot="true"]{stroke:var(--wsb-c1)}
.wsb-badge{background:color-mix(in srgb,var(--wsb-c1) 12%,transparent)}
.wsb-overview{border-color:color-mix(in srgb,var(--wsb-c1) 22%,transparent)}
.wsb-graphDetail,.wsb-srcCard,.wsb-round{contain:paint}



/* ---- token balance tile (Apple-battery style: ring + one big number) ---- */
.wsb-tokenTop{display:flex;gap:14px;align-items:center;margin-bottom:12px}
.wsb-ringTile{flex:0 0 auto;display:flex;flex-direction:column;align-items:center;gap:1px;padding:13px 16px 11px;
  border-radius:24px;border:1px solid var(--dsw-alias-border-l1);--wsb-ring:var(--wsb-c3);
  background:color-mix(in srgb,var(--dsw-alias-bg-layer-2) 40%,transparent);
  box-shadow:inset 0 1px 0 color-mix(in srgb,#fff 9%,transparent)}
.wsb-ringTile[data-tone="warn"]{--wsb-ring:#f5b544}
.wsb-ringTile[data-tone="err"]{--wsb-ring:#ff6b6b}
.wsb-ringWrap{position:relative;width:128px;height:128px;display:grid;place-items:center}
.wsb-ring{position:absolute;inset:0}
.wsb-ringTrack{stroke:color-mix(in srgb,#fff 13%,transparent)}
.wsb-ringFill{stroke:var(--wsb-ring);transition:stroke-dashoffset .86s cubic-bezier(.32,.72,0,1),stroke .3s ease}
.wsb-ringGlyph{font-size:30px;line-height:1;color:var(--wsb-ring);opacity:.92}
.wsb-ringValue{font-size:37px;font-weight:660;letter-spacing:-.025em;line-height:1.08;font-variant-numeric:tabular-nums}
.wsb-ringCaption{font-size:11px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}
.wsb-tokenSide{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:7px}
.wsb-chips{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.wsb-chip{display:inline-flex;align-items:center;gap:5px;font-size:12px;font-variant-numeric:tabular-nums;
  padding:5px 9px;border-radius:11px;border:1px solid var(--dsw-alias-border-l1);
  background:color-mix(in srgb,var(--wsb-c1) 10%,transparent)}
.wsb-chip>b{font-weight:600;opacity:.72}
.wsb-chipText{font-size:10.5px;color:var(--dsw-alias-label-secondary)}
.wsb-chipText[data-dim="true"]{opacity:.72}

/* ---- per-turn rows: number, my prompt, that turn's token total ---- */
.wsb-roundTop>.wsb-roundNo{margin-left:0;font-size:11px;font-weight:640;color:var(--dsw-alias-label-primary)}
.wsb-roundTop>.wsb-roundPrompt{margin-left:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12.5px;color:var(--dsw-alias-label-primary)}
.wsb-roundTop>.wsb-roundShare{margin-left:auto;font-size:12.5px;font-weight:660;color:var(--wsb-c1);font-variant-numeric:tabular-nums}
/* Share of every token the session has spent; the tick is the running total. */
.wsb-shareTrack{position:relative;height:7px;border-radius:4px;margin:7px 0 1px;
  background:color-mix(in srgb,var(--dsw-alias-bg-layer-2) 74%,transparent)}
.wsb-shareTrack>i{display:block;height:100%;border-radius:4px;
  background:linear-gradient(90deg,var(--wsb-c1),var(--wsb-c2));
  transition:width .5s var(--wsb-spring-soft)}
.wsb-shareTrack>b{position:absolute;top:-2.5px;width:2px;height:12px;border-radius:1px;
  background:var(--wsb-c3);box-shadow:0 0 6px color-mix(in srgb,var(--wsb-c3) 70%,transparent)}

/* ---- 改动文件 ranking inside 对话轮次汇总 ---- */
.wsb-fileList{display:flex;flex-direction:column;gap:4px;margin-bottom:12px}
.wsb-fileItem{display:flex;align-items:center;gap:8px;padding:6px 9px;border-radius:10px;
  border:1px solid var(--dsw-alias-border-l1);font-size:11.5px;
  background:color-mix(in srgb,var(--dsw-alias-bg-layer-2) 34%,transparent)}
.wsb-fileItem[data-turn="true"]{border-color:color-mix(in srgb,var(--wsb-c1) 55%,transparent);
  background:color-mix(in srgb,var(--wsb-c1) 14%,transparent)}
.wsb-filePath{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;direction:rtl;text-align:left}
.wsb-fileNum{flex:0 0 auto;font-variant-numeric:tabular-nums;color:var(--wsb-c3)}
.wsb-fileOps{flex:0 0 auto;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-secondary)}

/* ---- 本项目 vs 其他对话项目的消耗对比 ---- */
.wsb-projectBars{display:flex;flex-direction:column;gap:6px}
.wsb-projectRow{display:flex;align-items:center;gap:8px;font-size:11.5px}
.wsb-projectName{flex:0 1 96px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wsb-projectTrack{flex:1 1 auto;min-width:40px;height:8px;border-radius:4px;
  background:color-mix(in srgb,var(--dsw-alias-bg-layer-2) 74%,transparent)}
.wsb-projectTrack>i{display:block;height:100%;border-radius:4px;background:var(--dsw-alias-label-secondary);opacity:.45}
.wsb-projectRow[data-current="true"] .wsb-projectTrack>i{
  background:linear-gradient(90deg,var(--wsb-c1),var(--wsb-c2));opacity:1}
.wsb-projectRow[data-current="true"] .wsb-projectName{font-weight:650;color:var(--dsw-alias-label-primary)}
.wsb-projectVal{flex:0 0 auto;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-secondary)}
.wsb-projectRow[data-current="true"] .wsb-projectVal{color:var(--wsb-c1)}

/* ---- 轨迹: dense chronological ledger, the console's optional fourth view ---- */
.wsb-trail{display:flex;flex-direction:column;gap:2px;font-size:11.5px}
.wsb-trailRow{display:flex;align-items:center;gap:8px;padding:4px 7px;border-radius:8px;
  border-left:2px solid transparent}
.wsb-trailRow[data-kind="turn"]{margin-top:7px;font-weight:650;
  background:color-mix(in srgb,var(--wsb-c1) 13%,transparent)}
.wsb-trailRow[data-kind="assistant"]{border-left-color:var(--wsb-c1)}
.wsb-trailRow[data-kind="tool"]{border-left-color:color-mix(in srgb,var(--wsb-c2) 70%,transparent)}
.wsb-trailRow[data-kind="file"]{border-left-color:var(--wsb-c3)}
.wsb-trailRow:hover{background:color-mix(in srgb,var(--dsw-alias-bg-layer-2) 56%,transparent)}
.wsb-trailRow[data-sel="true"]{background:color-mix(in srgb,var(--wsb-c1) 22%,transparent)}
.wsb-trailGlyph{flex:0 0 14px;text-align:center;font-size:10px;color:var(--dsw-alias-label-secondary)}
.wsb-trailLabel{flex:0 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wsb-trailDetail{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
  font-size:10.5px;color:var(--dsw-alias-label-secondary)}

/* ---- pane composer: every display control in one row, presets + panes ---- */
.wsb-panes{display:flex;gap:4px;align-items:center;flex-wrap:wrap;min-width:0}
.wsb-panesLabel{font-size:10.5px;color:var(--dsw-alias-label-secondary);margin-right:2px;white-space:nowrap}
.wsb-panes>button,.wsb-segBtn{appearance:none;border:1px solid var(--dsw-alias-border-l1);background:transparent;
  color:var(--dsw-alias-label-secondary);font:inherit;font-size:11px;padding:3px 8px;border-radius:8px;cursor:pointer;
  transition:background .2s ease,color .2s ease}
.wsb-panes>button:hover,.wsb-segBtn:hover{color:var(--dsw-alias-label-primary)}
.wsb-panes>button[data-on="true"]{background:color-mix(in srgb,var(--wsb-c1) 26%,transparent);
  color:var(--dsw-alias-label-primary)}
.wsb-round[data-loaded="false"]{opacity:.64}

/* ---- graph typography: turn rows are anchors, nodes are detail ---- */
.wsb-row[data-kind="turn"] .wsb-rowTitle{font-size:12.5px;font-weight:660}
.wsb-row[data-kind="turn"] .wsb-rowGlyph{width:17px;height:17px}
.wsb-row[data-kind="turn"] .wsb-rowMeta{font-size:11px}
.wsb-row[data-kind="prompt"] .wsb-rowTitle{font-size:12px;font-weight:560}
.wsb-row:not([data-kind="turn"]):not([data-kind="prompt"]) .wsb-rowTitle{font-size:11.5px;font-weight:450}

/* Surface patterns (桌面设置 → 表面效果 → 网格效果). */
.wsb-bgGrid{position:absolute;inset:0;pointer-events:none}
.wsb-bgGrid[data-shape="grid"]{background-image:
  linear-gradient(to right,rgba(255,255,255,.5) 1px,transparent 1px),
  linear-gradient(to bottom,rgba(255,255,255,.5) 1px,transparent 1px);background-size:44px 44px}
.wsb-bgGrid[data-shape="dots"]{background-image:radial-gradient(rgba(255,255,255,.62) 1.3px,transparent 1.4px);
  background-size:26px 26px}
.wsb-bgGrid[data-shape="diagonal"]{background-image:repeating-linear-gradient(45deg,rgba(255,255,255,.42) 0 1px,transparent 1px 16px)}

/* Alignment arrangements: one card sits centred, several align as a group. */

/* Widget sizes on the desktop grid. */
.wsb-card[data-size="large"]{grid-column:span 2;grid-row:span 2;align-self:stretch;
  width:calc(13.4cqw * 2 + 2.7cqw);height:calc(13.4cqw * 2 + 2.7cqw);max-height:none}
.wsb-card[data-size="wide"]{grid-column:span 2;align-self:stretch;
  width:calc(13.4cqw * 2 + 2.7cqw);height:13.4cqw;max-height:13.4cqw}
/* The mark scales with the widget size instead of a coloured icon plate. */

/* Card geometry: square (default) or rectangle, in EVERY tile arrangement — not just the
   desktop one. The chosen form publishes a root variable, so 居中 / 左对齐 / 右对齐 / 自适应 /
   grid / 错落 all reshape with it. Only the list arrangement (rows) and the wide / large
   widget sizes keep their own shape. */

/* ---- drag-to-trash: a long press picks the tile up, the bottom band deletes it ---- */
/* iOS-style jiggle: the tile wobbles around its own centre while it is carried. The rotate
   property is independent of transform, so the wiggle composes with the pointer-following
   translate instead of fighting it. */
.wsb-card[data-dragging="true"]{z-index:6;cursor:grabbing;
  box-shadow:0 34px 60px -22px rgba(0,0,0,.7);
  animation:wsb-jiggle .44s ease-in-out infinite}
@keyframes wsb-jiggle{
  0%,100%{rotate:-.9deg}
  50%{rotate:.9deg}}
/* The drop zone is a slab of frosted glass in the same language as the tiles: a hairline, a
   specular sweep across the top and a soft inner lift. It never takes pointer events (the drop
   is decided from the pointer's geometry), so it cannot interrupt a drag. */
.wsb-trash{position:absolute;left:26px;right:26px;bottom:66px;height:108px;z-index:7;
  display:flex;align-items:center;justify-content:center;gap:12px;overflow:hidden;
  border-radius:24px;border:1px solid color-mix(in srgb,#fff 16%,transparent);
  background:color-mix(in srgb,var(--dsw-alias-bg-overlay) 38%,transparent);
  -webkit-backdrop-filter:blur(26px) saturate(180%);backdrop-filter:blur(26px) saturate(180%);
  box-shadow:0 24px 48px -20px rgba(0,0,0,.6),
    inset 0 1px 0 color-mix(in srgb,#fff calc(14% * var(--wsb-glass-spec,1)),transparent),
    inset 0 -22px 36px -26px rgba(0,0,0,.6);
  color:var(--dsw-alias-label-secondary);pointer-events:none;
  animation:wsb-trashIn .26s cubic-bezier(.32,.72,0,1) both;
  transition:background .2s ease,border-color .2s ease,box-shadow .2s ease,color .2s ease}
.wsb-trash:before{content:"";position:absolute;inset:0;pointer-events:none;
  background:linear-gradient(140deg,color-mix(in srgb,#fff 9%,transparent),transparent 46%)}
.wsb-trash>svg{position:relative;transition:transform .24s var(--wsb-spring)}
.wsb-trash[data-over="true"]{
  border-color:color-mix(in srgb,var(--dsw-alias-state-error-primary,#ff6b6b) 62%,transparent);
  background:color-mix(in srgb,var(--dsw-alias-state-error-primary,#ff6b6b) 26%,transparent);
  color:var(--dsw-alias-label-primary);
  box-shadow:0 30px 58px -20px rgba(0,0,0,.66),
    inset 0 1px 0 color-mix(in srgb,#fff 22%,transparent),
    inset 0 0 46px -12px color-mix(in srgb,var(--dsw-alias-state-error-primary,#ff6b6b) 55%,transparent)}
.wsb-trash[data-over="true"]>svg{transform:scale(1.22);
  animation:wsb-trashBob .5s ease-in-out infinite}
.wsb-trashLabel{position:relative;font-size:12.5px;font-weight:600;letter-spacing:.2px}
@keyframes wsb-trashIn{from{opacity:0;transform:translateY(14px) scale(.98)}to{opacity:1;transform:none}}
@keyframes wsb-trashBob{0%,100%{translate:0 1px}50%{translate:0 -2px}}

/* ---- 框架笔记: a standalone node mind map --------------------------------------------
   这一屏**不画自己的纸**。表面全部走宿主 token（毛玻璃、层次、明暗、圆角、字号），
   所以它和桌面、控制台、每日新闻是同一套材质；色调只提供强调色（见 NOTE_THEMES）。
   第一版自带一套纸色，于是在深色工作台里像贴上去的一张白纸 —— 这里改掉了。 */
/* 关键的一条，和另外两屏逐字一致：.wsb-root 默认会刷一层不透明的 --dsw-alias-bg-base。
   不关掉它，桌面背景（外壳那一层 .wsb-bg：极光 / 图片 / 视频）根本透不上来 ——
   毛玻璃就只是在磨一块纯色，"透明效果没同步"就是这么来的。
   （这段 CSS 会被拼进一个 JS 模板字符串，所以这里不能出现反引号。） */
.wsb-screen[data-role="notes"] .wsb-root{background:transparent}
.wsb-noteRoot{outline:none;padding:calc(var(--dsh-frame-top-clearance,0px) + 12px) 14px 12px;gap:10px}
/* 顶栏的层级必须高于下面的舞台。
   舞台原先也是 z-index:1，于是"谁在上"由 DOM 顺序决定 —— 舞台在后，就画在顶栏之上，顶栏里
   弹出的「文件」菜单被它盖掉（实测：菜单中部的命中测试拿到的是 .wsb-noteCanvas，不是菜单）。
   现在舞台是 0、顶栏是 3，差值是明确的，不再依赖顺序。 */
.wsb-noteTop{flex-direction:column;align-items:stretch;gap:8px;margin-bottom:0;z-index:3}
.wsb-noteTopRow{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.wsb-noteTopSpacer{flex:1 1 auto;min-width:8px}
.wsb-noteGroup{display:flex;align-items:center;gap:6px;min-width:0;position:relative}
.wsb-noteGroup>b{font-size:9.5px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;
  color:var(--dsw-alias-label-secondary);white-space:nowrap}
.wsb-noteSwatches{display:inline-flex;align-items:center;gap:5px}
.wsb-noteSwatch{width:19px;height:19px;padding:0;border-radius:50%;cursor:pointer;appearance:none;
  border:1px solid var(--dsw-alias-border-l2);
  transition:transform .18s cubic-bezier(.2,.8,.2,1),box-shadow .18s ease}
.wsb-noteSwatch:hover{transform:translateY(-1px) scale(1.08)}
.wsb-noteSwatch[data-on="true"]{box-shadow:0 0 0 2px var(--dsw-alias-bg-base),0 0 0 3.5px var(--wsb-c1)}

/* ---- 文件: 一个按钮打开「新建 / 保存 / 打开 / 导出」 ------------------------------------------
   四个并排按钮加一个独立导出下拉，把顶栏撑得很长；它们本来就是同一类动作（对整张图做的事），
   收进一个菜单既是更短的顶栏，也是更清楚的归类。 */
/* 菜单从按钮下方 14px 开始，而不是贴着它：贴着的时候菜单顶边会压在工具栏那一行上，
   那一行的按钮文字就从第一项里透出来（量过：菜单首项 272px、工具栏行底 271px，正好差 1px）。 */
.wsb-noteExportMenu{position:absolute;top:calc(100% + 14px);left:0;z-index:6;min-width:250px;
  max-height:calc(100vh - 160px);overflow:auto;
  display:flex;flex-direction:column;gap:2px;padding:6px;border-radius:14px;
  /* **完全不透明**的面板。不能只写 var(--dsw-alias-bg-overlay)：宿主的这几个 alias 本身就带
     透明度，于是「设了背景」的菜单仍然是透的，背后工具栏的文字会从第一项里渗出来（截图里看
     得到）。所以是把 overlay 混到**不透明的画布底色**上 —— 得到的是一枚实心面板，色调仍然
     来自宿主。 */
  background:color-mix(in srgb,var(--dsw-alias-bg-overlay) 88%,var(--dsw-alias-bg-base));
  -webkit-backdrop-filter:blur(22px) saturate(180%);backdrop-filter:blur(22px) saturate(180%);
  border:1px solid var(--dsw-alias-border-l2);
  box-shadow:0 22px 44px -20px rgba(0,0,0,.7);
  animation:wsb-noteMenuIn .16s cubic-bezier(.2,.8,.2,1) both}
@keyframes wsb-noteMenuIn{from{opacity:0;translate:0 -4px}to{opacity:1;translate:0}}
/* 文件菜单比导出菜单宽一点：它现在还要放下「清空画布，用这个名字新建一张图」这类整句说明。 */
.wsb-noteFileMenu{min-width:290px;left:auto;right:0}
.wsb-noteExportItem{display:flex;flex-direction:column;gap:1px;align-items:flex-start;text-align:left;
  appearance:none;border:0;cursor:pointer;font:inherit;padding:7px 9px;border-radius:9px;
  background:transparent;color:var(--dsw-alias-label-primary)}
.wsb-noteExportItem:hover{background:color-mix(in srgb,var(--wsb-c1) 18%,transparent)}
.wsb-noteExportItem>b{font-size:12px;font-weight:640}
.wsb-noteExportItem>span{font-size:10.5px;color:var(--dsw-alias-label-secondary)}
.wsb-noteFileBtn[data-on="true"]{background:color-mix(in srgb,var(--wsb-c1) 20%,transparent);
  border-color:color-mix(in srgb,var(--wsb-c1) 38%,transparent)}

/* The stage: outline | canvas | inspector. Either rail can go away, and the grid is told which
   one did — the canvas then takes the whole window instead of leaving a gap where a rail was. */
.wsb-noteStage{flex:1 1 auto;min-height:0;display:grid;gap:10px;position:relative;z-index:0;
  grid-template-columns:236px minmax(0,1fr) 252px}
.wsb-noteStage[data-note-outline-on="false"]{grid-template-columns:minmax(0,1fr) 252px}
.wsb-noteStage[data-note-inspector-on="false"]{grid-template-columns:236px minmax(0,1fr)}
.wsb-noteStage[data-note-outline-on="false"][data-note-inspector-on="false"]{grid-template-columns:minmax(0,1fr)}
.wsb-noteRail{min-height:0;display:flex;flex-direction:column;overflow:hidden;border-radius:18px}
.wsb-noteRail .wsb-body{overflow:auto;padding:9px 10px 12px}

/* ---- the outline rail ---- */
.wsb-noteRows{display:flex;flex-direction:column;gap:1px}
.wsb-noteBranch{display:flex;flex-direction:column;gap:1px}
.wsb-noteRow{display:flex;align-items:center;gap:1px;border-radius:9px;padding-right:2px;
  border:1px solid transparent;transition:background .18s ease,border-color .18s ease}
.wsb-noteRow:hover{background:color-mix(in srgb,var(--dsw-alias-bg-layer-2) 70%,transparent)}
.wsb-noteRow[data-sel="true"]{background:color-mix(in srgb,var(--wsb-c1) 18%,transparent);
  border-color:color-mix(in srgb,var(--wsb-c1) 42%,transparent)}
.wsb-noteTwist{flex:0 0 auto;width:15px;height:20px;padding:0;appearance:none;border:0;cursor:pointer;
  background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:9px;line-height:1}
.wsb-noteTwist[data-open="true"]{color:color-mix(in srgb,var(--dsw-alias-label-primary) 80%,transparent)}
.wsb-noteTwist[disabled]{cursor:default;opacity:.35}
.wsb-noteRowMain{flex:1 1 auto;min-width:0;display:flex;align-items:center;gap:6px;appearance:none;border:0;
  background:transparent;color:inherit;font:inherit;font-size:11.5px;text-align:left;cursor:pointer;
  padding:5px 3px}
.wsb-noteRowTitle{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wsb-noteRowImg{flex:0 0 auto;font-size:9px;color:color-mix(in srgb,var(--wsb-c1) 80%,transparent)}
.wsb-noteRowMeta{flex:0 0 auto;font-size:9.5px;color:var(--dsw-alias-label-secondary);
  font-variant-numeric:tabular-nums}
.wsb-noteRowBtn{flex:0 0 auto;width:19px;height:19px;padding:0;border-radius:6px;cursor:pointer;
  appearance:none;border:1px solid transparent;background:transparent;
  color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;line-height:1}
.wsb-noteRowBtn:hover{color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-border-l2)}
.wsb-noteRowBtn[data-tone="danger"]:hover{color:var(--dsw-alias-state-error-primary)}

/* ---- the canvas: the same frosted slab as the console panes ---- */
.wsb-noteCanvasWrap{position:relative;min-height:0;min-width:0}
.wsb-noteCanvas{position:absolute;inset:0;cursor:grab;touch-action:none;
  -webkit-user-select:none;user-select:none}
.wsb-noteCanvas:active{cursor:grabbing}
/* 再压一层更黑的底 + 点阵网格：桌面壁纸很亮的时候（比如那片天光），光靠玻璃本身画布还是会比两侧亮。
   网格画在这一层上，所以它跟着缩放/平移走。 */
.wsb-noteScrim{position:absolute;inset:0;pointer-events:none;
  background-color:color-mix(in srgb,var(--dsw-alias-bg-base) 46%,transparent);
  background-image:radial-gradient(circle,color-mix(in srgb,var(--dsw-alias-label-primary) 15%,transparent) 1px,transparent 1.5px);
  background-repeat:repeat}
/* 空画布：还没有中心节点时的提示 */
.wsb-noteEmptyState{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;
  justify-content:center;gap:6px;pointer-events:none;text-align:center;padding:0 24px;
  color:var(--dsw-alias-label-secondary)}
.wsb-noteEmptyState b{font-size:14px;font-weight:650;color:var(--dsw-alias-label-primary)}
.wsb-noteEmptyState span{font-size:11.5px;line-height:1.6;max-width:46ch}

/* ---- 右键菜单（画布 / 节点）与「新建图表」对话框 ---- */
.wsb-noteMenu{position:absolute;z-index:8;min-width:194px;display:flex;flex-direction:column;gap:1px;
  padding:5px;border-radius:13px;
  background:color-mix(in srgb,var(--dsw-alias-bg-overlay) 90%,transparent);
  -webkit-backdrop-filter:blur(20px) saturate(180%);backdrop-filter:blur(20px) saturate(180%);
  border:1px solid var(--dsw-alias-border-l1);
  box-shadow:0 20px 40px -18px rgba(0,0,0,.62);
  animation:wsb-noteMenuIn .14s cubic-bezier(.2,.8,.2,1) both}
@keyframes wsb-noteMenuIn{from{opacity:0;translate:0 -3px}to{opacity:1;translate:0}}
.wsb-noteMenuItem{display:flex;align-items:center;gap:8px;text-align:left;appearance:none;border:0;
  cursor:pointer;font:inherit;font-size:12px;padding:6px 9px;border-radius:8px;background:transparent;
  color:var(--dsw-alias-label-primary)}
.wsb-noteMenuItem:hover{background:color-mix(in srgb,var(--wsb-c1) 20%,transparent)}
.wsb-noteMenuItem[data-tone="danger"]:hover{
  background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 22%,transparent)}
.wsb-noteMenuItem>i{font-style:normal;width:15px;text-align:center;opacity:.85}
.wsb-noteMenuItem>kbd{margin-left:auto;font:inherit;font-size:10px;color:var(--dsw-alias-label-secondary)}
.wsb-noteMenuSep{height:1px;margin:3px 6px;background:var(--dsw-alias-border-l1)}
/* 菜单遮罩：原来这个类名只在 JS 里出现，没有任何样式，所以点别处关不掉菜单。 */
.wsb-noteMenuMask{position:fixed;inset:0;z-index:7;background:transparent}

/* ---- 左栏：笔记历史 ------------------------------------------------------------
   一行一篇笔记。开放中的那篇用强调色 + 左侧竖条标出来（和节点选中同一套语言），
   元信息一行放节点数 / 图片数 / 时间 —— 这三样是画布上看不出来的。 */
.wsb-noteHistory{overflow:hidden}
.wsb-noteNewNote{width:100%;margin-bottom:8px}
.wsb-noteNameRow{display:flex;align-items:center;gap:5px;margin-bottom:8px}
.wsb-noteNameRow .wsb-input{flex:1 1 auto;min-width:0}
.wsb-noteNameRow .wsb-btn{flex:0 0 auto}
.wsb-noteDocRows{gap:2px}
.wsb-noteDoc{position:relative;display:flex;align-items:flex-start;gap:8px;width:100%;text-align:left;
  appearance:none;font:inherit;color:inherit;cursor:pointer;
  padding:8px 9px 8px 11px;border-radius:10px;border:1px solid transparent;background:transparent;
  transition:background .15s ease,border-color .15s ease}
.wsb-noteDoc:hover{background:color-mix(in srgb,var(--dsw-alias-bg-layer-2) 70%,transparent)}
.wsb-noteDoc::before{content:'';position:absolute;left:2px;top:9px;bottom:9px;width:2px;border-radius:2px;
  background:transparent;transition:background .15s ease}
/* 选中态：竖向强调条 + 一点底色。和画布上根节点的选中环呼应。 */
.wsb-noteDoc[data-open="true"]{background:color-mix(in srgb,var(--wsb-c1) 15%,transparent);
  border-color:color-mix(in srgb,var(--wsb-c1) 32%,transparent)}
.wsb-noteDoc[data-open="true"]::before{background:var(--wsb-c1)}
.wsb-noteDocDot{position:absolute;left:0;top:0;width:0;height:0}
.wsb-noteDocMain{display:flex;flex-direction:column;gap:2px;min-width:0;flex:1 1 auto}
.wsb-noteDocName{font-size:12.5px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wsb-noteDoc[data-open="true"] .wsb-noteDocName{color:var(--dsw-alias-label-primary)}
.wsb-noteDocMeta{font-size:10px;color:var(--dsw-alias-label-secondary);white-space:nowrap;
  overflow:hidden;text-overflow:ellipsis;font-variant-numeric:tabular-nums}
.wsb-noteEmptyMini{padding:14px 10px;font-size:11.5px;line-height:1.65;text-align:center;
  color:var(--dsw-alias-label-secondary)}
.wsb-noteNotice{margin-top:8px;padding:7px 9px;border-radius:9px;font-size:10.5px;
  background:color-mix(in srgb,var(--wsb-c1) 12%,transparent);
  border:1px solid color-mix(in srgb,var(--wsb-c1) 26%,transparent);
  color:var(--dsw-alias-label-primary)}
.wsb-noteNotice[data-tone="warn"]{background:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 14%,transparent);
  border-color:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 30%,transparent)}
.wsb-noteHistFoot{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:10px;
  padding-top:9px;border-top:1px solid var(--dsw-alias-border-l1);font-size:10px;
  color:var(--dsw-alias-label-secondary)}
.wsb-noteLinkBtn{appearance:none;border:0;background:transparent;cursor:pointer;font:inherit;font-size:10px;
  color:color-mix(in srgb,var(--wsb-c1) 90%,transparent);padding:2px 3px;border-radius:6px}
.wsb-noteLinkBtn:hover{color:var(--dsw-alias-label-primary)}
.wsb-noteNewBox{position:absolute;left:50%;top:14px;translate:-50% 0;z-index:9;width:min(430px,88%);
  display:flex;flex-direction:column;gap:9px;padding:14px 15px;border-radius:16px;
  background:color-mix(in srgb,var(--dsw-alias-bg-overlay) 92%,transparent);
  -webkit-backdrop-filter:blur(24px) saturate(180%);backdrop-filter:blur(24px) saturate(180%);
  border:1px solid var(--dsw-alias-border-l1);
  box-shadow:0 26px 52px -22px rgba(0,0,0,.66);
  animation:wsb-noteMenuIn .18s cubic-bezier(.2,.8,.2,1) both}
.wsb-noteNewBox>b{font-size:13px;font-weight:650}
.wsb-noteNewBox>p{margin:0;font-size:11px;line-height:1.6;color:var(--dsw-alias-label-secondary)}
.wsb-noteNewRow{display:flex;align-items:center;gap:8px;justify-content:flex-end}

/* 拖动 + 时的临时连线：虚线强调色，一眼看出"正在连"。 */
.wsb-noteWireLink{stroke:color-mix(in srgb,var(--wsb-c1) 80%,transparent);stroke-width:2;
  stroke-dasharray:5 4}
.wsb-noteCanvas[data-linking="true"]{cursor:crosshair}
.wsb-noteWorld{position:absolute;left:0;top:0;transform-origin:0 0;will-change:transform;
  transition:opacity .22s ease}
.wsb-noteWires{position:absolute;left:0;top:0;overflow:visible;pointer-events:none}
.wsb-noteWire{fill:none;stroke:color-mix(in srgb,var(--dsw-alias-label-primary) 30%,transparent);
  stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
.wsb-noteGuide{stroke:color-mix(in srgb,var(--dsw-alias-label-primary) 26%,transparent);
  stroke-width:1.3;stroke-linecap:round}
.wsb-noteGuide[data-note-guide="axis"]{stroke-width:2}
.wsb-noteGuide[data-note-guide="spine"]{stroke-width:2.6;stroke-linecap:square}
/* 鱼骨的骨：一根 45° 的直线段（rib），从脊柱斜到卡片近角。 */
.wsb-noteGuide[data-note-guide="rib"]{stroke-width:2.2}
.wsb-noteGuide[data-note-guide="tick"]{stroke-width:1.1;opacity:.75}

/* Cards are real elements with a fixed box, so the SVG wire geometry and the DOM can never
   disagree: both use the numbers the layout produced. Surfaces follow the host tokens; only the
   accent (--note-accent) comes from the palette. */
.wsb-noteCard{position:absolute;display:flex;flex-direction:column;gap:4px;padding:9px 11px;
  box-sizing:border-box;border-radius:12px;overflow:hidden;
  /* 卡面比画布亮一档（layer-2 而不是 layer-1）+ 一道顶边高光：和宿主的面板同一种做法，
     深色主题下才不会和毛玻璃糊在一起。留一点透（88%）让桌面背景的色温也渗进来。 */
  background:color-mix(in srgb,var(--dsw-alias-bg-layer-2) 88%,transparent);
  color:var(--dsw-alias-label-primary);
  border:1px solid var(--dsw-alias-border-l1);
  box-shadow:0 12px 24px -18px rgba(0,0,0,.6),
    inset 0 1px 0 color-mix(in srgb,#fff 7%,transparent);
  transition:box-shadow .18s ease,transform .18s cubic-bezier(.2,.8,.2,1)}
.wsb-noteCard[data-depth="0"]{padding:12px 15px;border-radius:14px;
  background:var(--note-accent);color:var(--note-root-fg,#fff);
  border-color:color-mix(in srgb,var(--note-accent) 60%,transparent);
  box-shadow:0 14px 28px -18px rgba(0,0,0,.6)}
.wsb-noteCard[data-shape="rect"]{border-radius:4px}
/* 下划线: the card keeps its place but drops its box — the shape people use for a free topic. */
.wsb-noteCard[data-shape="under"]{background:transparent !important;border-color:transparent !important;
  border-bottom:2px solid var(--note-accent) !important;border-radius:0;box-shadow:none !important}
.wsb-noteCard[data-sel="true"]{box-shadow:0 0 0 2px var(--note-accent),0 14px 28px -18px rgba(0,0,0,.6)}
/* 根节点（深度 0）的选中环**不能**用强调色：它的卡面本来就是强调色实心，同色描边等于没画。
   所以根节点改用「亮环 + 一圈暗缝」，靠明暗对比而不是色相对比把自己标出来。 */
.wsb-noteCard[data-depth="0"][data-sel="true"]{
  box-shadow:0 0 0 2px var(--note-root-fg,#fff),0 0 0 4px color-mix(in srgb,var(--note-accent) 72%,#000),
    0 16px 30px -18px rgba(0,0,0,.66)}
.wsb-noteCard[data-hot="true"]{box-shadow:0 0 0 2px var(--wsb-c1),0 14px 28px -18px rgba(0,0,0,.6)}
.wsb-noteCard:before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px;
  background:var(--note-accent);opacity:.9}
.wsb-noteCard[data-depth="0"]:before{display:none}
.wsb-noteCard[data-shape="under"]:before{display:none}
.wsb-noteCardTitle{font-size:12.5px;font-weight:650;line-height:1.35;letter-spacing:.1px;
  display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;word-break:break-word}
.wsb-noteCard[data-depth="0"] .wsb-noteCardTitle{font-size:14.5px}
.wsb-noteCard[data-depth="2"] .wsb-noteCardTitle{font-size:11.5px}
/* The note line inherits the card's own ink and drops its opacity, rather than using a theme
   colour: the centre card is filled with the accent, and a card grey on it is unreadable. */
.wsb-noteCardBody{font-size:10.5px;line-height:1.45;color:inherit;opacity:.74;overflow:hidden;
  display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;word-break:break-word}
.wsb-noteCardImg{display:block;width:100%;flex:0 0 auto;border-radius:8px;
  background:color-mix(in srgb,var(--dsw-alias-label-primary) 8%,transparent)}
.wsb-noteCardBadge{position:absolute;right:6px;top:6px;font-size:9px;line-height:1;padding:3px 5px;
  border-radius:999px;background:color-mix(in srgb,var(--note-accent) 30%,transparent);color:inherit}
.wsb-noteCardAdd{position:absolute;right:5px;bottom:5px;width:18px;height:18px;padding:0;cursor:pointer;
  appearance:none;border-radius:50%;font:inherit;font-size:12px;line-height:1;opacity:0;
  background:color-mix(in srgb,var(--note-accent) 24%,transparent);color:inherit;
  border:1px solid color-mix(in srgb,var(--note-accent) 48%,transparent);
  transition:opacity .18s ease,transform .18s ease}
.wsb-noteCard:hover .wsb-noteCardAdd,.wsb-noteCard[data-sel="true"] .wsb-noteCardAdd{opacity:1}
.wsb-noteCardAdd:hover{transform:scale(1.14)}
.wsb-noteEdit{flex:1 1 auto;width:100%;min-height:22px;resize:none;padding:0;border:0;outline:none;
  background:transparent;color:inherit;font:inherit;font-size:12.5px;font-weight:650;line-height:1.35}
.wsb-noteCard[data-depth="0"] .wsb-noteEdit{font-size:14.5px}

.wsb-noteHint{position:absolute;left:12px;bottom:11px;display:flex;align-items:center;gap:8px;
  max-width:min(760px,74%);padding:6px 11px;border-radius:999px;pointer-events:none;
  font-size:10.5px;color:var(--dsw-alias-label-secondary);
  background:color-mix(in srgb,var(--dsw-alias-bg-layer-1) 74%,transparent);
  -webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);
  border:1px solid var(--dsw-alias-border-l1)}
.wsb-noteLevel{flex:0 0 auto;font-weight:650;color:var(--dsw-alias-label-primary)}
.wsb-noteStatus{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
  color:color-mix(in srgb,var(--wsb-c1) 82%,var(--dsw-alias-label-primary))}
.wsb-noteHint>span:last-child{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

/* ---- the inspector rail ---- */
.wsb-noteInspector .wsb-body{display:flex;flex-direction:column;gap:10px}
.wsb-noteField2{display:flex;flex-direction:column;gap:4px;min-width:0}
.wsb-noteField2>b,.wsb-noteSect>b{font-size:9.5px;font-weight:700;letter-spacing:.1em;
  text-transform:uppercase;color:var(--dsw-alias-label-secondary)}
.wsb-noteInput{width:100%;font-size:12px;line-height:1.5;resize:vertical;min-height:30px;max-height:88px;
  box-sizing:border-box}
.wsb-noteInputBody{min-height:62px;max-height:170px}
.wsb-noteSect{display:flex;flex-direction:column;gap:7px;padding-top:9px;
  border-top:1px solid var(--dsw-alias-border-l1)}
.wsb-noteImgRow{display:flex;align-items:center;gap:6px;min-width:0}
.wsb-noteImgName{flex:1 1 auto;min-width:0;font-size:11px;color:var(--dsw-alias-label-secondary);
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wsb-noteBtnRow{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.wsb-noteField2 input[type="range"]{width:100%}
.wsb-noteBtnRowEnd{margin-top:auto;padding-top:10px;border-top:1px solid var(--dsw-alias-border-l1)}

/* ---- 轨迹横条: the ledger as a resizable band under the console header ---- */
.wsb-trailStrip{flex:0 0 auto;min-height:0;display:flex;flex-direction:column;position:relative;
  z-index:1;margin-bottom:12px;animation:wsb-rise .3s cubic-bezier(.22,.9,.24,1) both}
.wsb-trailGrip{flex:0 0 auto;height:12px;display:grid;place-items:center;cursor:ns-resize;
  touch-action:none;-webkit-user-select:none;user-select:none}
.wsb-trailGrip>i{display:block;width:52px;height:3px;border-radius:3px;
  background:var(--dsw-alias-border-l2);transition:background .2s ease,width .2s ease}
.wsb-trailGrip:hover>i{background:var(--wsb-c1);width:72px}
.wsb-trailStripHead{display:flex;align-items:center;gap:8px;padding:0 11px 7px;flex:0 0 auto}
.wsb-trailStripHead>b{font-size:12.5px;font-weight:600;letter-spacing:.3px}
.wsb-trailStripHead>span{font-size:10.5px;color:var(--dsw-alias-label-secondary)}
.wsb-trailClose{margin-left:auto;appearance:none;border:1px solid var(--dsw-alias-border-l1);cursor:pointer;
  width:22px;height:22px;border-radius:7px;background:transparent;color:var(--dsw-alias-label-secondary);
  font:inherit;font-size:12px;line-height:1}
.wsb-trailClose:hover{color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-border-l2)}
.wsb-trailStripBody{flex:0 0 auto;overflow:auto;padding:0 11px 9px;scrollbar-width:thin;
  transition:height .2s cubic-bezier(.22,.9,.24,1)}

.wsb-sumBlock{margin-bottom:12px;border:1px solid var(--dsw-alias-border-l1);border-radius:14px;overflow:hidden;
  background:color-mix(in srgb,var(--dsw-alias-bg-layer-2) 34%,transparent)}
.wsb-sumHead{display:flex;align-items:center;gap:8px;padding:8px 10px;
  border-bottom:1px solid var(--dsw-alias-border-l1);background:color-mix(in srgb,var(--wsb-c1) 9%,transparent)}
.wsb-sumHead>.wsb-btn{margin-left:auto}
.wsb-sumBody{padding:9px 11px;font-size:12px;line-height:1.75;white-space:pre-wrap;word-break:break-word;
  max-height:340px;overflow:auto}
/* The answer is never clipped to the same height as the working notes. */
.wsb-sumBody[data-grow="true"]{max-height:56vh}

/* ---- the answer, re-typeset for reading ----------------------------------------
   The reply used to be one pre-wrap text node: every line the same weight and colour, so a
   long answer was a wall. It now renders as structured paragraphs with the numbers, file
   paths, code and failure words coloured. Pre-wrap is switched OFF because paragraphs and
   headers are real elements now; the renderer keeps blank-line grouping instead. */
.wsb-rich{white-space:normal;padding:11px 13px;font-size:12.5px;line-height:1.78}
.wsb-rich>*+*{margin-top:7px}
.wsb-richH{margin:13px 0 6px;font-size:12.5px;font-weight:700;letter-spacing:.2px;
  color:var(--dsw-alias-label-primary);padding-left:8px;border-left:2px solid var(--wsb-c1)}
.wsb-richH:first-child{margin-top:0}
.wsb-richP{color:color-mix(in srgb,var(--dsw-alias-label-primary) 86%,transparent)}
.wsb-richLi{display:flex;gap:7px;color:color-mix(in srgb,var(--dsw-alias-label-primary) 86%,transparent)}
.wsb-richLi>i{flex:0 0 auto;color:var(--wsb-c1);font-style:normal;opacity:.9}
.wsb-richLi>span{min-width:0}
.wsb-richQuote{color:var(--dsw-alias-label-secondary);padding-left:9px;border-left:2px solid var(--dsw-alias-border-l2)}
.wsb-richB{font-weight:680;color:var(--dsw-alias-label-primary)}
.wsb-richCode{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11.5px;
  padding:1px 5px;border-radius:6px;background:color-mix(in srgb,var(--dsw-alias-bg-layer-1) 78%,transparent);
  border:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-primary);
  white-space:pre-wrap;word-break:break-word}
.wsb-richPath{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11.5px;
  color:var(--wsb-c1)}
/* Numbers get their own tabular face so a column of figures lines up. */
.wsb-richNum{font-variant-numeric:tabular-nums;font-weight:660;color:var(--dsw-alias-label-primary)}
.wsb-richUp{font-variant-numeric:tabular-nums;font-weight:660;color:#3ddc97}
.wsb-richDown{font-variant-numeric:tabular-nums;font-weight:660;color:#f47276}
.wsb-richErr{color:#ff8a8a;font-weight:600}
.wsb-richOk{color:#4ade80;font-weight:640}
.wsb-exportMenu{position:absolute;right:14px;top:46px;z-index:6;display:flex;flex-direction:column;gap:4px;padding:8px;
  border-radius:14px;border:1px solid var(--dsw-alias-border-l1);
  background:color-mix(in srgb,var(--dsw-alias-bg-overlay) 92%,transparent);
  -webkit-backdrop-filter:blur(26px) saturate(180%);backdrop-filter:blur(26px) saturate(180%);
  box-shadow:0 20px 44px -18px rgba(0,0,0,.65);animation:wsb-popUp .26s var(--wsb-spring) both}

/* ---- 每日新闻 (Daily News) ----------------------------------------------------
   Same slab vocabulary as the console, and the same rule for following the desktop: the screen
   paints no background of its own, so whatever 动态设置 put behind the app shows through, and
   the panel aurora is the console's own layer under the same 控制台流光 switch.

   The layout rules below are taken from three published design systems rather than taste:

   | source | rule applied here |
   | --- | --- |
   | **Linear** | a **4px spacing ladder** (4/8/12/16/24); hierarchy carried by a **surface ladder + 1px hairlines**, never drop shadows; **one accent**, reserved for brand/CTA/focus/emphasis — never for card fills; **aggressive negative tracking on display type**, weight 600 with body 400 (never 700+) |
   | **WIRED** | the reading stream is **hairline-separated rows**, not boxed cards — "surface contrast and hairlines carry all visual hierarchy"; a small **category eyebrow** above each headline; a separate **byline row**; display weight stays low and the elegance comes from the typeface |
   | **Apple / Raycast / Superhuman** (already the plugin's baseline) | no decorative gradients on chrome; saturated accents tint only the interior; one restrained ambient shadow |

   The accent discipline is the biggest change and the reason the first version looked busy: a
   per-story accent meant forty chromatic cards at once. Now the topic accent appears in exactly
   three places — the topic dot and its selected row, the 2px bar on the selected story, and the
   coverage badge — while everything else uses the shared palette. */

.wsb-screen[data-role="news"] .wsb-root{background:transparent}
.wsb-news{position:relative;z-index:1;flex:1 1 auto;display:flex;flex-direction:column;
  min-height:0;min-width:0;overflow:hidden;color:var(--dsw-alias-label-primary)}

/* ---- toolbar: one row, grouped, on the 4px ladder ---- */
.wsb-nwHead{display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-width:0;margin-bottom:12px}
.wsb-nwTitle{display:flex;align-items:baseline;gap:8px;margin-right:auto;min-width:0}
.wsb-nwTitle b{font-size:16px;font-weight:600;letter-spacing:-.014em}
.wsb-nwTitle span{font-size:11.5px;color:var(--dsw-alias-label-secondary);white-space:nowrap;
  overflow:hidden;text-overflow:ellipsis;max-width:44ch}
/* Grouped control cluster: 4px inside a group, 12px between groups, hairline separators. */
.wsb-nwGroup{display:inline-flex;align-items:center;gap:4px;flex:0 0 auto}
.wsb-nwGroup+.wsb-nwGroup{padding-left:12px;border-left:1px solid var(--dsw-alias-border-l1)}
.wsb-nwLive{display:inline-flex;align-items:center;gap:6px;font-size:11px;padding:3px 9px;border-radius:999px;
  border:1px solid color-mix(in srgb,var(--wsb-c1) 34%,transparent);color:var(--dsw-alias-label-secondary);
  background:color-mix(in srgb,var(--wsb-c1) 10%,transparent);font-variant-numeric:tabular-nums}
.wsb-nwLive i{width:6px;height:6px;border-radius:50%;background:var(--wsb-c1);animation:wsb-nwBlink 2.4s ease-in-out infinite}

/* The count dial. A native range is kept (keyboard + accessibility for free) but the track
   and thumb are drawn here so it matches the capsule controls instead of the OS theme. */
.wsb-dial{display:flex;align-items:center;gap:8px;padding:4px 10px 4px 9px;border-radius:999px;
  border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2)}
.wsb-dial>label{font-size:10.5px;color:var(--dsw-alias-label-secondary);white-space:nowrap}
.wsb-dial>output{font-size:12.5px;font-weight:600;font-variant-numeric:tabular-nums;min-width:2.6ch;
  text-align:right;color:var(--dsw-alias-label-primary)}
.wsb-range{appearance:none;-webkit-appearance:none;width:104px;height:16px;background:transparent;cursor:grab;margin:0}
.wsb-range:active{cursor:grabbing}
.wsb-range::-webkit-slider-runnable-track{height:4px;border-radius:2px;
  background:linear-gradient(to right,var(--wsb-c1) 0 calc(var(--wsb-range-fill,0%) - 6.5px),
    color-mix(in srgb,#fff 14%,transparent) calc(var(--wsb-range-fill,0%) - 6.5px))}
.wsb-range::-webkit-slider-thumb{appearance:none;-webkit-appearance:none;width:13px;height:13px;margin-top:-4.5px;
  border-radius:50%;background:#fff;border:0;box-shadow:0 1px 4px rgba(0,0,0,.45),0 0 0 1px rgba(0,0,0,.18);
  transition:transform .18s cubic-bezier(.2,.8,.2,1)}
.wsb-range:active::-webkit-slider-thumb{transform:scale(1.18)}
.wsb-range::-moz-range-track{height:4px;border-radius:2px;background:color-mix(in srgb,#fff 14%,transparent)}
.wsb-range::-moz-range-progress{height:4px;border-radius:2px;background:var(--wsb-c1)}
.wsb-range::-moz-range-thumb{width:12px;height:12px;border:0;border-radius:50%;background:#fff}

.wsb-refresh{display:inline-flex;align-items:center;gap:6px}
.wsb-refresh[data-busy="true"] .wsb-spin{animation:wsb-nwSpin 1.05s linear infinite}
.wsb-spin{display:inline-block;width:12px;height:12px;flex:0 0 auto}
/* The 中译 toggle reads as a state, not a button: tinted while on. */
.wsb-transToggle[data-on="true"]{background:color-mix(in srgb,var(--wsb-c1) 24%,transparent);
  border-color:color-mix(in srgb,var(--wsb-c1) 48%,transparent);color:var(--dsw-alias-label-primary)}

.wsb-nwGrid{flex:1 1 auto;min-height:0;min-width:0;max-width:100%;overflow:hidden;display:flex;align-items:stretch}

/* The draggable seams. 10px of hit area around a 1px line: wide enough to grab, thin enough
   that a 3-pane reading layout does not lose its width to its own furniture. A flex row is
   used rather than a grid because the seams are real children: in a 3-column grid they would
   wrap onto a second row, and laying out five tracks to compensate means the ratio arithmetic
   has to know the gutter width. flex-grow simply distributes what is left after the seams. */
.wsb-split{position:relative;flex:0 0 10px;cursor:col-resize;touch-action:none;align-self:stretch}
.wsb-split:before{content:"";position:absolute;inset:0 auto 0 50%;width:1px;transform:translateX(-.5px);
  border-radius:1px;background:var(--dsw-alias-border-l1);transition:background .18s ease,box-shadow .18s ease}
.wsb-split:hover:before,.wsb-split[data-drag="true"]:before{background:var(--wsb-c1);
  box-shadow:0 0 0 3px color-mix(in srgb,var(--wsb-c1) 18%,transparent)}
.wsb-split[data-drag="true"]{cursor:grabbing}

.wsb-nwPane{flex-grow:var(--wsb-grow,1);flex-shrink:1;flex-basis:0;min-width:0;max-width:100%;contain:paint}

.wsb-nwBody{padding:12px 12px 16px}
.wsb-nwBody[data-flush="true"]{padding:0}

/* The topic rail itself is gone — the switcher is the horizontal nav above the panes. One
   class from it survives: this is the muted aside text used by the editor panel. */
.wsb-topicN{font-size:10.5px;font-variant-numeric:tabular-nums;opacity:.7;color:var(--dsw-alias-label-secondary)}
/* The plus-button affordance. It replaces an always-open text field that looked like a
   filled-in value and gave no clue what a click would do. */
.wsb-addRow{display:flex;align-items:center;gap:6px;margin-top:8px}
.wsb-addBtn{appearance:none;font:inherit;font-size:11.5px;cursor:pointer;padding:5px 10px;border-radius:9px;
  display:inline-flex;align-items:center;gap:6px;
  border:1px dashed var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-secondary);
  transition:color .18s ease,border-color .18s ease,background .18s ease}
.wsb-addBtn:hover{color:var(--dsw-alias-label-primary);border-color:var(--wsb-c1);
  background:color-mix(in srgb,var(--wsb-c1) 10%,transparent)}
.wsb-addBtn>i{font-style:normal;font-size:13px;line-height:1}
.wsb-addForm{display:flex;align-items:center;gap:6px;animation:wsb-nwIn .22s cubic-bezier(.22,.9,.24,1) both}
.wsb-addForm>.wsb-input{flex:1 1 auto;min-width:0}
.wsb-iconBtn{appearance:none;flex:0 0 auto;width:26px;height:26px;border-radius:8px;cursor:pointer;
  display:grid;place-items:center;font:inherit;font-size:13px;line-height:1;
  border:1px solid color-mix(in srgb,var(--wsb-c1) 44%,transparent);
  background:color-mix(in srgb,var(--wsb-c1) 20%,transparent);color:var(--dsw-alias-label-primary);
  transition:transform .2s cubic-bezier(.2,.8,.2,1),background .18s ease}
.wsb-iconBtn:hover{transform:translateY(-1px);background:color-mix(in srgb,var(--wsb-c1) 30%,transparent)}
.wsb-iconBtn[data-tone="quiet"]{border-color:var(--dsw-alias-border-l1);background:transparent;
  color:var(--dsw-alias-label-secondary)}
.wsb-iconBtn[data-tone="quiet"]:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2)}

.wsb-editCard{margin-top:8px;padding:12px;border-radius:12px;border:1px solid var(--dsw-alias-border-l1);
  background:color-mix(in srgb,var(--dsw-alias-bg-layer-2) 40%,transparent);
  animation:wsb-nwIn .26s cubic-bezier(.22,.9,.24,1) both}
.wsb-nwField{margin-bottom:12px}
.wsb-nwField:last-child{margin-bottom:0}
.wsb-nwField>span{display:block;font-size:10px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;
  color:var(--dsw-alias-label-secondary);margin-bottom:6px}
.wsb-kwRow{display:flex;flex-wrap:wrap;gap:4px}
.wsb-kw{display:inline-flex;align-items:center;gap:4px;font-size:11.5px;padding:3px 4px 3px 9px;border-radius:7px;
  border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);
  color:var(--dsw-alias-label-primary)}
.wsb-kw>button{appearance:none;border:0;background:transparent;cursor:pointer;font:inherit;font-size:12px;line-height:1;
  color:var(--dsw-alias-label-secondary);padding:0 2px;border-radius:5px}
.wsb-kw>button:hover{color:var(--dsw-alias-state-error-primary)}
.wsb-srcGroup{margin-bottom:8px}
.wsb-srcList{display:flex;flex-wrap:wrap;gap:4px}
.wsb-srcChip{appearance:none;font:inherit;font-size:11px;cursor:pointer;padding:4px 8px;border-radius:7px;
  border:1px solid var(--dsw-alias-border-l1);background:transparent;color:var(--dsw-alias-label-secondary);
  transition:background .18s ease,color .18s ease,border-color .18s ease}
.wsb-srcChip:hover{color:var(--dsw-alias-label-primary)}
.wsb-srcChip[data-on="true"]{background:color-mix(in srgb,var(--wsb-c1) 22%,transparent);
  border-color:color-mix(in srgb,var(--wsb-c1) 44%,transparent);color:var(--dsw-alias-label-primary)}

/* ---- 最新播报: a continuous news ticker ------------------------------------------
   This strip used to be something you had to drag, which is the wrong shape for a broadcast:
   a bulletin should broadcast. One linear transform on a track holding the items **twice**
   makes the loop seamless, and because the animation is a single translate3d it never leaves
   the compositor — animating left or width here would relayout the pane every frame, which
   is exactly the trap the keyframe rule elsewhere in this file exists to catch.

   The edges are masked so a card fades in and out at the boundary instead of popping, and the
   track pauses on hover and on keyboard focus: a ticker you cannot stop to click is decoration.
   Under 减少动态 it stops entirely and degrades to the draggable rail it replaces. */
.wsb-hotRail{position:relative;display:flex;align-items:stretch;gap:10px;padding:10px 0 4px;overflow:hidden}
/* The viewport the news travels through. The chip sits outside it, so the label stays put while
   the headlines move — a label that scrolls away with its content is not a label. Both edges fade
   a little: cards enter under the right fade and leave under the left one. */
.wsb-tickerView{flex:1 1 auto;min-width:0;overflow:hidden;
  -webkit-mask-image:linear-gradient(90deg,transparent 0,#000 18px,#000 calc(100% - 34px),transparent 100%);
  mask-image:linear-gradient(90deg,transparent 0,#000 18px,#000 calc(100% - 34px),transparent 100%)}
.wsb-tickerTrack{display:flex;align-items:stretch;width:max-content;
  animation:wsb-ticker var(--wsb-ticker-dur,64s) linear infinite}
.wsb-hotRail:hover .wsb-tickerTrack,
.wsb-hotRail:focus-within .wsb-tickerTrack{animation-play-state:paused}
.wsb-hotRail[data-paused="true"] .wsb-tickerTrack{animation-play-state:paused}
/* The standing label: a live dot, the section name, and nothing that asks to be clicked. */
.wsb-tickerLead{flex:0 0 auto;display:inline-flex;align-items:center;gap:6px;align-self:center;
  margin-left:12px;padding:5px 10px;border-radius:999px;white-space:nowrap;
  font-size:10.5px;font-weight:680;letter-spacing:.08em;text-transform:uppercase;
  border:1px solid color-mix(in srgb,var(--wsb-c1) 38%,transparent);
  background:color-mix(in srgb,var(--wsb-c1) 14%,transparent);color:var(--dsw-alias-label-primary)}
.wsb-tickerLead>i{width:6px;height:6px;border-radius:50%;background:var(--wsb-c1);
  animation:wsb-nwBlink 2.2s ease-in-out infinite}
/* A fixed height rather than the tallest card's: align-items:stretch alone left the rail
   ragged in practice (a three-line headline next to a one-line one) and the strip is read as a
   row of equal tiles. Two clamped lines always fit inside this height. margin-right rather
   than a track gap is what makes the -50% loop land exactly on the seam. */
.wsb-hotCard{flex:0 0 auto;width:246px;height:92px;margin-right:8px;overflow:hidden;
  text-align:left;font:inherit;cursor:pointer;box-sizing:border-box;padding:0;
  border-radius:12px;border:1px solid var(--dsw-alias-border-l1);
  background:var(--dsw-alias-bg-layer-2);color:inherit;
  display:flex;flex-direction:row;gap:0;
  transition:transform .24s cubic-bezier(.2,.8,.2,1),border-color .18s ease,background .18s ease}
.wsb-hotCard:hover{transform:translateY(-2px);border-color:var(--dsw-alias-border-l2);
  background:var(--dsw-alias-bg-layer-1)}
.wsb-hotCard[data-on="true"]{border-color:color-mix(in srgb,var(--wsb-tone,var(--wsb-c1)) 56%,transparent);
  background:color-mix(in srgb,var(--wsb-tone,var(--wsb-c1)) 10%,var(--dsw-alias-bg-layer-2))}
/* The plate is a third of the tile and clipped by the card's radius, so the rail reads as a row
   of newspaper teasers rather than as a row of buttons. */
.wsb-hotPic{flex:0 0 84px;align-self:stretch;overflow:hidden;background:color-mix(in srgb,#fff 5%,transparent)}
.wsb-hotPic>img{width:100%;height:100%;object-fit:cover;display:block}
.wsb-hotBody{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:5px;padding:9px 10px}
.wsb-hotTop{display:flex;align-items:center;gap:6px;font-size:9.5px;letter-spacing:.04em;
  color:var(--dsw-alias-label-secondary);flex:0 0 auto;text-transform:uppercase}
.wsb-hotBadge{font-weight:700;color:var(--wsb-tone,var(--wsb-c1));font-variant-numeric:tabular-nums;
  letter-spacing:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wsb-hotTitle{font-size:12px;font-weight:560;line-height:1.4;letter-spacing:-.008em;display:-webkit-box;
  -webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;min-height:0}
/* Coverage as a measured bar rather than a number alone — the same "grow to the real value"
   idiom as the console's turnover bars, and it is a compositor-only scaleX transform. */
.wsb-hotBar{margin-top:auto;height:2px;border-radius:2px;background:color-mix(in srgb,#fff 10%,transparent);overflow:hidden}
.wsb-hotBar>i{display:block;height:100%;transform-origin:0 50%;background:var(--wsb-tone,var(--wsb-c1));
  animation:wsb-nwBar .62s cubic-bezier(.22,.86,.24,1) both}
@keyframes wsb-ticker{from{transform:translate3d(0,0,0)}to{transform:translate3d(-50%,0,0)}}

/* ---- the story stream: an editorial front page ---------------------------------
   The first version was a uniform list: forty rows at one size with no pictures. That is a
   changelog, not a newspaper. This is laid out the way Apple News and every broadsheet front
   page are:

     1. a dated section band,
     2. ONE lead story — full-width picture, the largest type on the screen,
     3. two second-tier stories side by side — smaller picture, smaller headline,
     4. everything else as rows with a small square thumbnail at the right edge,
     5. a one-line compact density that drops down to the typography alone.

   Size is the hierarchy. The tiers differ in picture size, headline size, weight, leading and
   how much summary survives, so a glance down the pane tells you what the desk thought mattered
   — which is the whole job of a front page, and the thing a single uniform row size cannot do.

   Hierarchy is carried by surface + hairlines (WIRED) and the accent stays in three places
   (Linear); the type scale is Cinematic — the size steps are wide enough to read as intentional
   rather than as rendering drift. */

.wsb-stream{display:flex;flex-direction:column}
.wsb-stream[data-view="list"],.wsb-stream[data-view="compact"]{padding:0 6px 14px}
.wsb-stream[data-view="grid"]{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(196px,100%),1fr));
  gap:10px;padding:10px 12px 16px}

/* The dated section band: a masthead line, not a toolbar. */
.wsb-dateline{display:flex;align-items:baseline;gap:8px;padding:10px 12px 8px;border-bottom:1px solid var(--dsw-alias-border-l1)}
.wsb-dateline>b{font-size:12px;font-weight:680;letter-spacing:.02em}
.wsb-dateline>span{font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--dsw-alias-label-secondary)}
.wsb-dateline>i{margin-left:auto;font-style:normal;font-size:10.5px;letter-spacing:.04em;
  color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;white-space:nowrap}

/* ---- pictures ---- */
.wsb-figure{margin:0;position:relative;overflow:hidden;border-radius:11px;
  background:color-mix(in srgb,#fff 5%,transparent);border:1px solid var(--dsw-alias-border-l1);
  aspect-ratio:16 / 9}
/* The lead plate is capped: at a wide pane a 16:9 hero is over 300 px tall, which pushes the
   headline it belongs to below the fold — a picture that hides its own story. object-fit:cover
   crops instead, which is what every front page does with a hero. */
.wsb-item[data-tier="lead"] .wsb-figure{max-height:300px}
.wsb-figure>img{width:100%;height:100%;object-fit:cover;display:block}
/* A duplicated source name in a caption is noise; the eyebrow above the headline already
   carries it, so the picture is left clean. */
.wsb-figure[data-tone="wide"]{border-radius:0;border-left:0;border-right:0;border-top:0}

.wsb-thumb{flex:0 0 auto;width:68px;height:68px;border-radius:9px;overflow:hidden;margin:0;
  background:color-mix(in srgb,#fff 5%,transparent);border:1px solid var(--dsw-alias-border-l1)}
/* NewsPicture renders a <figure> inside the square, so both levels have to be sized. */
.wsb-thumb>figure{margin:0;width:100%;height:100%}
.wsb-thumb img,.wsb-figure img{width:100%;height:100%;object-fit:cover;display:block}

/* ---- one story ---- */
.wsb-item{position:relative;text-align:left;font:inherit;cursor:pointer;color:inherit;border:0;
  background:transparent;display:flex;flex-direction:column;
  animation:wsb-nwIn .4s cubic-bezier(.22,.9,.24,1) both;
  transition:background .18s ease}
/* The selection is the ONLY place the topic accent touches a story: a 2px bar. */
.wsb-item:after{content:"";position:absolute;left:0;width:2px;border-radius:2px;
  background:var(--wsb-tone,var(--wsb-c1));opacity:0;transition:opacity .2s ease}
.wsb-item[data-on="true"]:after{opacity:1}

.wsb-itemTop{display:flex;align-items:center;gap:6px;min-width:0;
  font-size:10px;letter-spacing:.045em;color:var(--dsw-alias-label-secondary)}
.wsb-itemSrc{font-weight:620;letter-spacing:.03em;
  color:color-mix(in srgb,var(--dsw-alias-label-primary) 76%,transparent);
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:22ch}
.wsb-itemTime{margin-left:auto;font-variant-numeric:tabular-nums;white-space:nowrap}
.wsb-itemTitle{font-weight:600;display:-webkit-box;-webkit-box-orient:vertical;overflow:hidden}
.wsb-itemSum{line-height:1.7;color:var(--dsw-alias-label-secondary);display:-webkit-box;
  -webkit-box-orient:vertical;overflow:hidden}
.wsb-itemFoot{display:flex;align-items:center;gap:6px;font-size:10px;letter-spacing:.02em;
  color:var(--dsw-alias-label-secondary);min-width:0}
.wsb-covBadge{display:inline-flex;align-items:center;gap:4px;padding:2px 7px;border-radius:999px;font-weight:620;
  color:var(--wsb-tone,var(--wsb-c1));background:color-mix(in srgb,var(--wsb-tone,var(--wsb-c1)) 13%,transparent)}
.wsb-tag{font-size:10px;padding:2px 6px;border-radius:6px;border:1px solid var(--dsw-alias-border-l1);
  color:var(--dsw-alias-label-secondary);white-space:nowrap}
.wsb-itemOpen{margin-left:auto;font-size:10.5px;color:var(--dsw-alias-label-secondary);opacity:0;
  transition:opacity .2s ease;white-space:nowrap}
.wsb-item:hover .wsb-itemOpen{opacity:1}
/* Read stories stay legible but stop competing for attention. */
.wsb-item[data-read="true"] .wsb-itemTitle{opacity:.62;font-weight:520}

/* --- tier 1: the lead --- */
.wsb-item[data-tier="lead"]{padding:12px 10px 14px 12px;gap:9px}
.wsb-item[data-tier="lead"]:after{top:14px;bottom:16px}
.wsb-item[data-tier="lead"] .wsb-itemTitle{font-size:21px;line-height:1.34;letter-spacing:-.021em;
  -webkit-line-clamp:3}
.wsb-item[data-tier="lead"] .wsb-itemSum{font-size:13px;-webkit-line-clamp:3}
.wsb-item[data-tier="lead"] .wsb-itemTop,.wsb-item[data-tier="lead"] .wsb-itemFoot{font-size:10.5px}

/* --- tier 2: the two beside it --- */
.wsb-duo{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(210px,100%),1fr));gap:2px 14px;
  border-top:1px solid var(--dsw-alias-border-l1);margin-top:2px}
.wsb-item[data-tier="secondary"]{padding:12px 8px 13px 12px;gap:7px}
.wsb-item[data-tier="secondary"]:after{top:14px;bottom:15px}
.wsb-item[data-tier="secondary"] .wsb-itemTitle{font-size:14.5px;line-height:1.42;letter-spacing:-.014em;
  -webkit-line-clamp:3}
.wsb-item[data-tier="secondary"] .wsb-itemSum{font-size:11.5px;-webkit-line-clamp:2}

/* --- tier 3: the rows --- */
.wsb-item[data-tier="list"]{display:grid;grid-template-columns:minmax(0,1fr);gap:5px;
  padding:11px 10px 12px 12px;align-items:start}
.wsb-item[data-tier="list"][data-hasimage="true"]{grid-template-columns:minmax(0,1fr) 68px;gap:6px 12px}
.wsb-item[data-tier="list"][data-hasimage="true"]>.wsb-itemTop,
.wsb-item[data-tier="list"][data-hasimage="true"]>.wsb-itemTitle,
.wsb-item[data-tier="list"][data-hasimage="true"]>.wsb-itemSum,
.wsb-item[data-tier="list"][data-hasimage="true"]>.wsb-itemXlate,
.wsb-item[data-tier="list"][data-hasimage="true"]>.wsb-itemXlateSum,
.wsb-item[data-tier="list"][data-hasimage="true"]>.wsb-itemOrig,
.wsb-item[data-tier="list"][data-hasimage="true"]>.wsb-itemFoot{grid-column:1}
.wsb-item[data-tier="list"][data-hasimage="true"]>.wsb-thumb{grid-column:2;grid-row:1 / span 6;align-self:start}
.wsb-item[data-tier="list"]:after{top:12px;bottom:13px}
.wsb-item[data-tier="list"] .wsb-itemTitle{font-size:13.5px;line-height:1.44;letter-spacing:-.012em;
  -webkit-line-clamp:2}
.wsb-item[data-tier="list"] .wsb-itemSum{font-size:11.5px;-webkit-line-clamp:1}
.wsb-item[data-tier="list"]:hover{background:var(--dsw-alias-bg-layer-2);border-radius:9px}
.wsb-item[data-tier="list"][data-on="true"]{background:color-mix(in srgb,var(--dsw-alias-bg-layer-2) 88%,transparent);
  border-radius:9px}
.wsb-item[data-tier="secondary"]:hover,.wsb-item[data-tier="lead"]:hover{border-radius:10px;
  background:color-mix(in srgb,var(--dsw-alias-bg-layer-2) 70%,transparent)}
/* Hairline dividers between rows — the only elevation cue the reading stream uses. */
.wsb-item[data-tier="list"]+.wsb-item[data-tier="list"]:before{content:"";position:absolute;
  left:12px;right:10px;top:0;height:1px;background:var(--dsw-alias-border-l1)}

/* --- grid density: cards with a picture on top --- */
.wsb-stream[data-view="grid"] .wsb-item{border:1px solid var(--dsw-alias-border-l1);border-radius:12px;
  padding:0 0 11px;overflow:hidden;gap:7px;
  background:color-mix(in srgb,var(--dsw-alias-bg-layer-2) 34%,transparent)}
.wsb-stream[data-view="grid"] .wsb-item:after{display:none}
.wsb-stream[data-view="grid"] .wsb-item:hover{border-color:var(--dsw-alias-border-l2);
  background:var(--dsw-alias-bg-layer-2)}
.wsb-stream[data-view="grid"] .wsb-item[data-on="true"]{
  border-color:color-mix(in srgb,var(--wsb-tone,var(--wsb-c1)) 50%,transparent)}
.wsb-stream[data-view="grid"] .wsb-figure{border-radius:0;border-left:0;border-right:0;border-top:0}
.wsb-stream[data-view="grid"] .wsb-itemTop,
.wsb-stream[data-view="grid"] .wsb-itemTitle,
.wsb-stream[data-view="grid"] .wsb-itemSum,
.wsb-stream[data-view="grid"] .wsb-itemXlate,
.wsb-stream[data-view="grid"] .wsb-itemXlateSum,
.wsb-stream[data-view="grid"] .wsb-itemOrig,
.wsb-stream[data-view="grid"] .wsb-itemFoot{padding:0 11px}
.wsb-stream[data-view="grid"] .wsb-itemTop{padding-top:2px}
.wsb-stream[data-view="grid"] .wsb-itemTitle{font-size:14px;line-height:1.42;letter-spacing:-.014em}
.wsb-stream[data-view="grid"] .wsb-itemSum{-webkit-line-clamp:3}

/* --- compact density: typography only, one line each --- */
.wsb-stream[data-view="compact"]{padding:2px 16px 12px}
.wsb-stream[data-view="compact"] .wsb-item[data-tier]{display:grid;
  grid-template-columns:auto minmax(0,1fr) auto;gap:8px;padding:7px 0;align-items:baseline}
.wsb-stream[data-view="compact"] .wsb-item:after{display:none}
.wsb-stream[data-view="compact"] .wsb-itemTop{max-width:26ch}
.wsb-stream[data-view="compact"] .wsb-itemTop>span:not(.wsb-itemSrc){display:none}
.wsb-stream[data-view="compact"] .wsb-itemTitle,.wsb-stream[data-view="compact"] .wsb-itemXlate{
  font-size:12.5px;-webkit-line-clamp:1;flex:1 1 auto;min-width:0;letter-spacing:-.01em}
.wsb-stream[data-view="compact"] .wsb-itemSum,
.wsb-stream[data-view="compact"] .wsb-itemXlateSum,
.wsb-stream[data-view="compact"] .wsb-itemOrig,
.wsb-stream[data-view="compact"] .wsb-itemFoot,
.wsb-stream[data-view="compact"] .wsb-thumb,
.wsb-stream[data-view="compact"] .wsb-figure,
.wsb-stream[data-view="compact"] .wsb-duo{display:none}
.wsb-stream[data-view="compact"] .wsb-itemTop{grid-column:1}
.wsb-stream[data-view="compact"] .wsb-itemTitle,
.wsb-stream[data-view="compact"] .wsb-itemXlate{grid-column:2}
.wsb-stream[data-view="compact"] .wsb-item+.wsb-item{border-top:1px solid var(--dsw-alias-border-l1)}

/* ---- machine translation, shown as a second line rather than a replacement ----
   A Chinese reader gets the translation where the headline is; the original stays directly
   beneath it, one step smaller, so nothing is hidden and nothing is doubled up. */
.wsb-xlateTag{display:inline-flex;align-items:center;gap:3px;font-size:9px;font-weight:700;
  letter-spacing:.06em;padding:1px 5px;border-radius:5px;vertical-align:1.5px;
  color:var(--dsw-alias-label-secondary);background:color-mix(in srgb,#fff 9%,transparent);flex:0 0 auto}
.wsb-itemXlate{font-weight:580;display:-webkit-box;-webkit-box-orient:vertical;overflow:hidden}
.wsb-itemXlateSum{color:var(--dsw-alias-label-secondary);display:-webkit-box;
  -webkit-box-orient:vertical;overflow:hidden}
.wsb-itemOrig{color:var(--dsw-alias-label-secondary);opacity:.84;display:-webkit-box;
  -webkit-box-orient:vertical;overflow:hidden}
.wsb-itemOrig[data-latin="true"],.wsb-itemTitle[data-latin="true"]{letter-spacing:-.014em}
.wsb-itemXlateSum,.wsb-itemSum{line-height:1.65}
.wsb-item[data-tier="lead"] .wsb-itemXlate{font-size:18px;line-height:1.38;letter-spacing:-.018em;
  -webkit-line-clamp:3}
.wsb-item[data-tier="lead"] .wsb-itemXlateSum{font-size:12.5px;-webkit-line-clamp:3}
.wsb-item[data-tier="lead"] .wsb-itemOrig{font-size:12.5px;-webkit-line-clamp:2}
.wsb-item[data-tier="secondary"] .wsb-itemXlate{font-size:14px;line-height:1.4;-webkit-line-clamp:3}
.wsb-item[data-tier="secondary"] .wsb-itemXlateSum{font-size:11px;-webkit-line-clamp:2}
.wsb-item[data-tier="secondary"] .wsb-itemOrig{font-size:11px;-webkit-line-clamp:2}
.wsb-item[data-tier="list"] .wsb-itemXlate{font-size:13px;line-height:1.44;-webkit-line-clamp:2}
.wsb-item[data-tier="list"] .wsb-itemXlateSum{font-size:11px;-webkit-line-clamp:1}
.wsb-item[data-tier="list"] .wsb-itemOrig{font-size:11px;-webkit-line-clamp:1}
.wsb-itemXlateBtn{appearance:none;font:inherit;font-size:9.5px;cursor:pointer;padding:1px 6px;border-radius:5px;
  border:1px solid var(--dsw-alias-border-l1);background:transparent;color:var(--dsw-alias-label-secondary);
  transition:color .18s ease,border-color .18s ease}
.wsb-itemXlateBtn:hover{color:var(--dsw-alias-label-primary);border-color:var(--wsb-c1)}
.wsb-itemXlateBtn[disabled]{opacity:.5;cursor:default}

/* Thin, unobtrusive scrollbars inside the panes: a default 15px scrollbar in a 450px column is
   3% of the reading width spent on chrome. */
.wsb-nwBody{scrollbar-width:thin;scrollbar-color:color-mix(in srgb,#fff 16%,transparent) transparent}
.wsb-nwBody::-webkit-scrollbar{width:9px;height:9px}
.wsb-nwBody::-webkit-scrollbar-thumb{background:color-mix(in srgb,#fff 16%,transparent);border-radius:99px;
  border:3px solid transparent;background-clip:content-box}
.wsb-nwBody::-webkit-scrollbar-thumb:hover{background:color-mix(in srgb,#fff 26%,transparent);
  background-clip:content-box}
.wsb-nwBody::-webkit-scrollbar-track{background:transparent}

/* Skeleton: a translated sheen, not an animated gradient. Animating background-position would
   tick the main thread once per frame per card; a transform inside an overflow:hidden box
   does not. */
.wsb-skel{position:relative;overflow:hidden;border-radius:9px;
  padding:10px 12px;display:flex;flex-direction:column;gap:7px}
.wsb-skel:after{content:"";position:absolute;inset:0;
  background:linear-gradient(90deg,transparent,color-mix(in srgb,#fff 6%,transparent),transparent);
  animation:wsb-nwShim 1.5s cubic-bezier(.4,0,.6,1) infinite}
.wsb-skelRow{height:9px;border-radius:5px;background:color-mix(in srgb,#fff 8%,transparent)}
.wsb-skelRow[data-w="70"]{width:70%}
.wsb-skelRow[data-w="46"]{width:46%}
.wsb-skelRow[data-w="92"]{width:92%}

/* ---- detail pane: a reading column ---- */
.wsb-detail{display:flex;flex-direction:column;gap:12px}
.wsb-detailTitle{font-size:16px;font-weight:600;line-height:1.5}
.wsb-detailTitle[data-latin="true"]{letter-spacing:-.016em}
.wsb-detailXlate{font-size:14px;font-weight:560;line-height:1.6;color:var(--dsw-alias-label-primary)}
.wsb-detailMeta{display:flex;flex-wrap:wrap;gap:6px;align-items:center;font-size:10.5px;
  letter-spacing:.02em;color:var(--dsw-alias-label-secondary)}
.wsb-detailSum{font-size:12.5px;line-height:1.85;color:color-mix(in srgb,var(--dsw-alias-label-primary) 88%,transparent)}
.wsb-detailSum[data-latin="true"]{letter-spacing:-.004em}
.wsb-related{display:flex;flex-direction:column;gap:1px}
.wsb-relatedRow{display:flex;gap:7px;font-size:11.5px;line-height:1.6;color:var(--dsw-alias-label-secondary);
  padding:5px 6px;border-radius:7px}
.wsb-relatedRow:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
.wsb-relatedRow>i{color:var(--wsb-tone,var(--wsb-c1));font-style:normal;opacity:.75}
.wsb-actions{display:flex;gap:6px;flex-wrap:wrap}
.wsb-linkBtn{appearance:none;font:inherit;font-size:11.5px;cursor:pointer;text-decoration:none;
  padding:6px 11px;border-radius:9px;border:1px solid color-mix(in srgb,var(--wsb-c1) 42%,transparent);
  background:color-mix(in srgb,var(--wsb-c1) 18%,transparent);color:var(--dsw-alias-label-primary);
  display:inline-flex;align-items:center;gap:6px;
  transition:transform .22s cubic-bezier(.2,.8,.2,1),background .18s ease}
.wsb-linkBtn:hover{transform:translateY(-1px);background:color-mix(in srgb,var(--wsb-c1) 28%,transparent)}

/* Source report: two lines per source, hairline-divided, no boxes. */
.wsb-srcReport{display:flex;flex-direction:column}
.wsb-srcRow{position:relative;display:grid;grid-template-columns:minmax(0,1fr) auto;
  grid-template-areas:"name value" "bar bar";align-items:center;gap:4px 8px;
  font-size:11px;padding:7px 2px;color:var(--dsw-alias-label-secondary)}
.wsb-srcRow+.wsb-srcRow:before{content:"";position:absolute;left:0;right:0;top:0;height:1px;
  background:var(--dsw-alias-border-l1);opacity:.6}
.wsb-srcRow>b{grid-area:name;font-weight:520;color:var(--dsw-alias-label-primary);
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.wsb-srcRow>span:last-child{grid-area:value;font-variant-numeric:tabular-nums;white-space:nowrap;text-align:right}
.wsb-srcRow[data-bad="true"]>span:last-child{color:var(--dsw-alias-state-warn-primary)}
.wsb-barTrack{grid-area:bar;height:2px;border-radius:2px;background:color-mix(in srgb,#fff 8%,transparent);
  overflow:hidden;width:100%}
.wsb-barTrack>i{display:block;height:100%;transform-origin:0 50%;background:var(--wsb-c1);
  animation:wsb-nwBar .5s cubic-bezier(.22,.86,.24,1) both}

.wsb-nwEmpty{display:flex;flex-direction:column;align-items:center;gap:10px;padding:36px 18px;text-align:center;
  color:var(--dsw-alias-label-secondary);font-size:12px;line-height:1.7}
.wsb-nwEmpty b{font-size:13px;font-weight:560;color:var(--dsw-alias-label-primary)}
/* The status line is prose, not a panel: one muted line under the toolbar instead of a bordered
   box competing with the panes for attention. */
.wsb-nwStatus{font-size:10.5px;letter-spacing:.01em;color:var(--dsw-alias-label-secondary);
  display:flex;flex-wrap:wrap;align-items:center;gap:2px 8px;margin:-4px 0 10px;min-width:0}
.wsb-nwStatus>span{white-space:nowrap}
.wsb-nwStatus>span+span:before{content:"·";margin-right:8px;opacity:.5}
.wsb-nwNote{font-size:11px;line-height:1.75;color:var(--dsw-alias-label-secondary);
  padding:8px 10px;border-radius:9px;border:1px solid var(--dsw-alias-border-l1);
  background:color-mix(in srgb,var(--dsw-alias-bg-layer-2) 34%,transparent);overflow-wrap:anywhere}
.wsb-nwNote[data-tone="warn"]{border-color:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 38%,transparent);
  background:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 8%,transparent)}

/* ---- 关键领域 nav bar ------------------------------------------------------------
   The topic switcher is a horizontal nav, the way a news site's section bar works: one row,
   scrollable when the sections outgrow it, the active one marked with the accent. It replaces a
   vertical rail that cost a third of the width for a control used once per session. */

.wsb-navWrap{position:relative;z-index:3;margin-bottom:10px}
.wsb-nav{display:flex;align-items:center;gap:8px;min-width:0;
  padding:5px 6px 5px 10px;border-radius:13px;
  border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2)}
.wsb-navLead{flex:0 0 auto;font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;
  color:var(--dsw-alias-label-secondary);padding-right:8px;border-right:1px solid var(--dsw-alias-border-l1);
  white-space:nowrap}
.wsb-navItems{display:flex;align-items:center;gap:2px;min-width:0;flex:1 1 auto;
  overflow-x:auto;scrollbar-width:none;scroll-behavior:smooth}
.wsb-navItems::-webkit-scrollbar{height:0}
.wsb-navItem{appearance:none;font:inherit;position:relative;cursor:pointer;white-space:nowrap;
  display:inline-flex;align-items:center;gap:6px;flex:0 0 auto;
  padding:6px 10px;border-radius:9px;border:1px solid transparent;background:transparent;
  color:var(--dsw-alias-label-secondary);font-size:12.5px;font-weight:500;letter-spacing:-.004em;
  transition:color .18s ease,background .18s ease,border-color .18s ease}
.wsb-navItem:hover{color:var(--dsw-alias-label-primary);background:color-mix(in srgb,#fff 7%,transparent)}
/* The active section is the ONE place the accent marks identity in the chrome: a tinted pill plus
   a rule under it, exactly like a site's current-tab treatment. */
.wsb-navItem[data-on="true"]{color:var(--dsw-alias-label-primary);
  background:color-mix(in srgb,var(--wsb-tone,var(--wsb-c1)) 16%,transparent);
  border-color:color-mix(in srgb,var(--wsb-tone,var(--wsb-c1)) 34%,transparent)}
.wsb-navItem[data-on="true"]:after{content:"";position:absolute;left:10px;right:10px;bottom:-6px;height:2px;
  border-radius:2px;background:var(--wsb-tone,var(--wsb-c1))}
.wsb-navDot{width:6px;height:6px;border-radius:50%;flex:0 0 auto;background:var(--wsb-tone,var(--wsb-c1));
  opacity:.55;transition:opacity .18s ease}
.wsb-navItem[data-on="true"] .wsb-navDot{opacity:1}
.wsb-navN{font-size:10px;font-variant-numeric:tabular-nums;opacity:.62}
.wsb-navEdit{width:16px;height:16px;display:grid;place-items:center;border-radius:5px;font-size:10px;
  opacity:0;transition:opacity .18s ease,background .18s ease}
.wsb-navItem:hover .wsb-navEdit,.wsb-navItem[data-on="true"] .wsb-navEdit{opacity:.62}
.wsb-navEdit:hover{background:color-mix(in srgb,#fff 14%,transparent);opacity:1}
.wsb-navAdd{appearance:none;font:inherit;font-size:11.5px;cursor:pointer;white-space:nowrap;flex:0 0 auto;
  display:inline-flex;align-items:center;gap:5px;padding:5px 10px;border-radius:9px;
  border:1px dashed var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-secondary);
  transition:color .18s ease,border-color .18s ease,background .18s ease}
.wsb-navAdd:hover{color:var(--dsw-alias-label-primary);border-color:var(--wsb-c1);
  background:color-mix(in srgb,var(--wsb-c1) 10%,transparent)}
.wsb-navAdd>i{font-style:normal;font-size:13px;line-height:1}

/* The custom/keyword editor drops down from the bar and OVERLAYS the panes rather than pushing
   them: opening it must not reflow the article you were reading. */
.wsb-navPanel{position:absolute;left:0;right:0;top:calc(100% + 6px);z-index:4;
  max-height:min(58vh,460px);overflow-y:auto;overscroll-behavior:contain;
  padding:14px 16px;border-radius:14px;
  border:1px solid color-mix(in srgb,var(--wsb-tone,var(--wsb-c1)) 30%,var(--dsw-alias-border-l1));
  background:color-mix(in srgb,var(--dsw-alias-bg-layer-1) 94%,transparent);
  backdrop-filter:blur(22px) saturate(1.35);-webkit-backdrop-filter:blur(22px) saturate(1.35);
  box-shadow:0 24px 60px -18px rgba(0,0,0,.72),0 2px 0 0 color-mix(in srgb,#fff 7%,transparent) inset;
  animation:wsb-nwIn .24s cubic-bezier(.22,.9,.24,1) both}
.wsb-navPanelHead{display:flex;align-items:center;gap:8px;margin-bottom:12px;
  padding-bottom:10px;border-bottom:1px solid var(--dsw-alias-border-l1)}
.wsb-navPanelHead>b{font-size:13.5px;font-weight:620;flex:1 1 auto;min-width:0;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wsb-navPanelHead>.wsb-navDot{width:8px;height:8px;opacity:1}

/* ---- 新闻原文: a reading column, laid out like an article page ----
   Headline, dek, byline, plate, body — in that order, with the size steps doing the hierarchy.
   This is the IGN/WIRED article shape: the headline is twice the body size, the dek sits between
   them in muted larger-than-body type, and a hairline rule closes the headline block. */
.wsb-detail{display:flex;flex-direction:column;gap:0}
.wsb-detailMeta{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-bottom:10px}
.wsb-detailTitle{margin:0 0 8px;font-size:20px;font-weight:660;line-height:1.28;letter-spacing:-.021em}
.wsb-detailTitle[data-latin="false"]{letter-spacing:-.01em}
.wsb-detailXlate{margin:0 0 10px;font-size:14px;font-weight:520;line-height:1.55;
  color:color-mix(in srgb,var(--dsw-alias-label-primary) 82%,transparent)}
/* The dek: bigger than body text, lighter than the headline. That gap is the whole reason a
   front page reads as edited rather than dumped. */
.wsb-detailDek{margin:0 0 12px;font-size:14.5px;line-height:1.62;letter-spacing:-.005em;
  color:color-mix(in srgb,var(--dsw-alias-label-secondary) 92%,transparent)}
.wsb-byline{display:flex;flex-wrap:wrap;align-items:center;gap:8px;font-size:10.5px;letter-spacing:.04em;
  text-transform:uppercase;color:var(--dsw-alias-label-secondary);
  padding:9px 0;border-top:1px solid var(--dsw-alias-border-l1);border-bottom:1px solid var(--dsw-alias-border-l1);
  margin:2px 0 14px}
.wsb-byline>b{font-weight:700;color:color-mix(in srgb,var(--dsw-alias-label-primary) 80%,transparent);
  text-transform:none;letter-spacing:.02em;font-size:11px}
.wsb-byline>span+span:before{content:"·";margin-right:8px;opacity:.55}
.wsb-bylineBusy{color:var(--wsb-c1) !important}
.wsb-detailCover{margin:0 0 16px;border-radius:12px;overflow:hidden;border:1px solid var(--dsw-alias-border-l1);
  animation:wsb-nwIn .4s cubic-bezier(.22,.9,.24,1) both}
.wsb-detailCover>img{width:100%;display:block;object-fit:cover;max-height:340px}
.wsb-article{display:flex;flex-direction:column;gap:14px}
.wsb-articleRow{display:flex;flex-direction:column;gap:5px}
.wsb-articleText{margin:0;font-size:13.5px;line-height:1.92;letter-spacing:-.002em;
  color:color-mix(in srgb,var(--dsw-alias-label-primary) 90%,transparent)}
.wsb-articleText[data-latin="true"]{letter-spacing:-.006em}
/* The translated paragraph keeps the paragraph rhythm but reads as an annotation: one step
   smaller, secondary colour, and no extra gap of its own. */
.wsb-articleOrig{margin:0;font-size:12.5px;line-height:1.8;color:var(--dsw-alias-label-secondary);
  opacity:.8}
.wsb-articleOrig[data-latin="true"]{letter-spacing:-.004em}
/* The first paragraph gets a drop-cap-ish weight bump, the way a magazine opens a feature. */
.wsb-article>.wsb-articleRow:first-child .wsb-articleText{font-size:14.5px;line-height:1.8}

.wsb-related{display:flex;flex-direction:column;gap:1px}

@keyframes wsb-nwIn{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:none}}
@keyframes wsb-nwShim{from{transform:translateX(-100%)}to{transform:translateX(100%)}}
@keyframes wsb-nwSpin{from{transform:rotate(0)}to{transform:rotate(360deg)}}
@keyframes wsb-nwBar{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@keyframes wsb-nwBlink{0%,100%{opacity:1}50%{opacity:.35}}

@media (prefers-reduced-motion:reduce){
  .wsb-glass,.wsb-aurora i,.wsb-card,.wsb-screen,.wsb-dockPop,.wsb-dock,.wsb-xfade{animation:none}
  .wsb-round[data-flash="true"]::after{animation:none;display:none}
  .wsb-glass,.wsb-card,.wsb-segBtn,.wsb-chip,.wsb-btn,.wsb-grid,.wsb-dockBtn{transition:none}
  .wsb-screen[data-anim]{opacity:1 !important;transform:none !important;border-radius:0 !important}
  /* The news screen's own motion joins the same opt-out: entrance, sheen, spin and the
     measured bars all stop rather than merely shortening. */
  .wsb-item,.wsb-hotCard,.wsb-editCard,.wsb-addForm,.wsb-skel:after,.wsb-refresh[data-busy="true"] .wsb-spin,
  .wsb-hotBar>i,.wsb-barTrack>i,.wsb-tickerTrack,.wsb-tickerLead>i,.wsb-nwLive i,.wsb-detailCover{animation:none}
  /* Stopped, not merely shortened — and the strip becomes draggable again, because a
     ticker that cannot move itself still has to be scrollable. */
  .wsb-hotRail{overflow-x:auto;-webkit-mask-image:none;mask-image:none}
  .wsb-tickerTrack{animation:none}
  .wsb-item,.wsb-hotCard,.wsb-topic,.wsb-linkBtn,.wsb-iconBtn,.wsb-split:before{transition:none}
  .wsb-item:hover,.wsb-hotCard:hover,.wsb-topic:hover,.wsb-iconBtn:hover{transform:none}
}
  /* 行情看板: 数字换位时的过渡和走势线的描绘都停掉 —— 一个每秒闪动的价格不是一个能读的价格. */
  .wsb-stkTiles,.wsb-stkTile,.wsb-stkSpark,.wsb-stkMarket,.wsb-stkTable td,.wsb-stkTable th{transition:none}
  .wsb-stkTile{animation:none}
}

/* ---- 股票市场 (Stock market) --------------------------------------------------------------
   这一屏和桌面 / 控制台 / 每日新闻共用同一套材质：它**不画自己的底**，桌面背景从下面透上来，
   表面全部走宿主 token，模块自己的强调色只染两件事 —— 「这个市场被选中」和涨跌方向。

   涨跌的颜色按**阅读习惯**走，不写死：中文界面红涨绿跌，英文界面反过来。这两套约定互相看不
   顺眼，而把其中一套强加给另一套的读者，等于让他把每个数字读反。[data-updown] 由 lang 决定。 */
.wsb-screen[data-role="stock"] .wsb-root{background:transparent}
.wsb-stock{position:relative;z-index:1;flex:1 1 auto;display:flex;flex-direction:column;min-height:0;
  padding:calc(var(--dsh-frame-top-clearance,0px) + 12px) 16px 14px;box-sizing:border-box;
  --wsb-up:var(--dsw-alias-state-success-primary);--wsb-down:var(--dsw-alias-state-error-primary)}
.wsb-stock[data-updown="zh"]{--wsb-up:var(--dsw-alias-state-error-primary);--wsb-down:var(--dsw-alias-state-success-primary)}

.wsb-stkHead{display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-width:0;margin-bottom:10px}
.wsb-stkTitle{display:flex;align-items:baseline;gap:8px;margin-right:auto;min-width:0}
.wsb-stkTitle b{font-size:16px;font-weight:650;letter-spacing:.2px;white-space:nowrap}
.wsb-stkTitle span{font-size:11.5px;color:var(--dsw-alias-label-secondary);white-space:nowrap;
  overflow:hidden;text-overflow:ellipsis;max-width:40ch}
.wsb-stkGroup{display:inline-flex;align-items:center;gap:4px;flex:0 0 auto}
.wsb-stkGroup+.wsb-stkGroup{padding-left:11px;border-left:1px solid var(--dsw-alias-border-l1)}

/* 状态行：更新时间 · 市场数 · 失败数 · 备用源数。它是这一屏的诚实条款，所以永远是可见的。 */
.wsb-stkStatus{display:flex;align-items:center;gap:0;flex-wrap:wrap;font-size:10.5px;margin-bottom:10px;
  color:var(--dsw-alias-label-secondary)}
.wsb-stkStatus>span{white-space:nowrap}
.wsb-stkStatus>span+span:before{content:"·";margin:0 8px;opacity:.5}
.wsb-stkStatus[data-stock-stale="true"]>span:first-child{color:var(--dsw-alias-state-warn-primary);font-weight:600}

/* 备注条：重启提示 / 代理提示 / 过期说明。与新闻面板同一套配方，因为它承担同一件事。 */
.wsb-stkNote{display:flex;gap:8px;align-items:flex-start;font-size:11px;line-height:1.7;margin-bottom:10px;
  padding:9px 11px;border-radius:11px;color:var(--dsw-alias-label-secondary);
  background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1)}
.wsb-stkNote[data-tone="warn"]{border-color:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 38%,transparent);
  background:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 9%,var(--dsw-alias-bg-layer-1))}
.wsb-stkNote b{color:var(--dsw-alias-label-primary);font-weight:600;flex:0 0 auto}

/* 市场选择器：与新闻的主题编辑器同一套「浮出」做法 —— 打开它不该让正在看的行情重排。 */
.wsb-stkPicker{margin-bottom:10px;padding:11px 12px 12px;border-radius:13px;position:relative;z-index:3;
  animation:wsb-nwIn .22s cubic-bezier(.22,.9,.24,1) both}
.wsb-stkPickerHead{display:flex;align-items:baseline;gap:8px;margin-bottom:9px}
.wsb-stkPickerHead b{font-size:12px;font-weight:600}
.wsb-stkPickerHead span{font-size:10.5px;color:var(--dsw-alias-label-secondary);margin-right:auto}
.wsb-stkPickRegion{margin-bottom:9px}
.wsb-stkPickRegion:last-child{margin-bottom:0}
.wsb-stkPickRegion>i{display:block;font-style:normal;font-size:9.5px;font-weight:600;letter-spacing:.07em;
  text-transform:uppercase;color:var(--dsw-alias-label-secondary);margin-bottom:5px}
.wsb-stkPickRow{display:flex;flex-wrap:wrap;gap:5px}
.wsb-stkPickRow>button{appearance:none;font:inherit;font-size:11px;cursor:pointer;padding:4px 9px;border-radius:8px;
  background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);
  border:1px solid var(--dsw-alias-border-l1);transition:background .18s ease,color .18s ease,border-color .18s ease}
.wsb-stkPickRow>button:hover{color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-border-l2)}
.wsb-stkPickRow>button[data-on="true"]{color:var(--dsw-alias-label-primary);
  background:color-mix(in srgb,var(--wsb-c1) 26%,transparent);
  border-color:color-mix(in srgb,var(--wsb-c1) 52%,transparent)}

.wsb-stkBoard{flex:1 1 auto;min-height:0;overflow:auto;scrollbar-width:thin;padding-right:2px}
.wsb-stkBoard::-webkit-scrollbar{width:9px;height:9px}
.wsb-stkBoard::-webkit-scrollbar-thumb{background:var(--dsw-alias-border-l2);border-radius:9px;
  border:2px solid transparent;background-clip:content-box}

/* 看板 = 一格一个市场。最小宽度保证价格和涨跌永远在同一行里读，不会被挤断。 */
.wsb-stkTiles{display:grid;gap:10px;grid-template-columns:repeat(auto-fill,minmax(184px,1fr))}
.wsb-stkTile{position:relative;overflow:hidden;display:flex;flex-direction:column;gap:2px;
  padding:11px 12px 9px;border-radius:14px;cursor:default;
  animation:wsb-cardIn .3s cubic-bezier(.22,.9,.24,1) both;animation-delay:calc(var(--wsb-i,0) * 22ms)}
.wsb-stkTop{display:flex;align-items:baseline;gap:6px;min-width:0}
.wsb-stkName{font-size:12.5px;font-weight:600;letter-spacing:-.006em;white-space:nowrap;overflow:hidden;
  text-overflow:ellipsis;min-width:0}
/* 区域标签刻意做得极小、极淡：它是索引，不是内容。 */
.wsb-stkRegion{font-size:9px;font-weight:600;letter-spacing:.06em;padding:2px 5px;border-radius:5px;flex:0 0 auto;
  color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-2)}
.wsb-stkBadge{margin-left:auto;flex:0 0 auto;font-size:9px;letter-spacing:.04em;padding:2px 5px;border-radius:5px;
  color:var(--dsw-alias-label-secondary);border:1px solid var(--dsw-alias-border-l1)}
.wsb-stkBadge[data-live="open"]{color:var(--wsb-up);border-color:color-mix(in srgb,var(--wsb-up) 42%,transparent)}
.wsb-stkPrice{font-size:23px;font-weight:640;letter-spacing:-.02em;line-height:1.16;margin-top:3px;
  font-variant-numeric:tabular-nums}
/* tabular-nums 不是审美选择：比例数字下每一行的小数点位置不同，一列价格就没法扫读。 */
.wsb-stkDelta{display:flex;align-items:baseline;gap:7px;font-size:11.5px;font-variant-numeric:tabular-nums}
.wsb-stkDelta b{font-weight:600}
.wsb-stkTile[data-dir="up"] .wsb-stkDelta{color:var(--wsb-up)}
.wsb-stkTile[data-dir="down"] .wsb-stkDelta{color:var(--wsb-down)}
.wsb-stkTile[data-dir="flat"] .wsb-stkDelta{color:var(--dsw-alias-label-secondary)}
.wsb-stkFoot{display:flex;align-items:center;gap:6px;margin-top:6px;font-size:9.5px;min-width:0;
  color:var(--dsw-alias-label-secondary)}
.wsb-stkFoot>span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wsb-stkSrc{margin-left:auto;flex:0 0 auto;opacity:.85}
/* 走势图占满磁贴底部：它是一条形状，不是一张图表 —— 没有坐标轴、没有网格、没有标签。 */
.wsb-stkSpark{display:block;width:100%;height:30px;margin-top:4px;overflow:visible}
.wsb-stkSpark .wsb-stkArea{stroke:none;opacity:.15}
.wsb-stkSpark .wsb-stkLine{fill:none;stroke-width:1.4;stroke-linejoin:round;stroke-linecap:round}
.wsb-stkTile[data-dir="up"] .wsb-stkSpark{color:var(--wsb-up)}
.wsb-stkTile[data-dir="down"] .wsb-stkSpark{color:var(--wsb-down)}
.wsb-stkTile[data-dir="flat"] .wsb-stkSpark{color:var(--dsw-alias-label-secondary)}
.wsb-stkTile[data-stale="true"]{opacity:.62}
.wsb-stkTile[data-stale="true"] .wsb-stkPrice{text-decoration:line-through;
  text-decoration-color:var(--dsw-alias-state-warn-primary);text-decoration-thickness:1px}

/* 表格 = 同一批数字的密集读法。列宽固定，所以切到表格不会让数字跳位置。 */
.wsb-stkTable{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}
.wsb-stkTable th,.wsb-stkTable td{padding:6px 9px;text-align:right;white-space:nowrap;
  border-bottom:1px solid var(--dsw-alias-border-l1);font-size:11.5px}
.wsb-stkTable th{font-size:9.5px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;
  color:var(--dsw-alias-label-secondary);position:sticky;top:0;z-index:1;
  background:color-mix(in srgb,var(--dsw-alias-bg-layer-1) 92%,transparent);
  backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
.wsb-stkTable th:first-child,.wsb-stkTable td:first-child{text-align:left}
.wsb-stkTable td b{font-weight:600}
.wsb-stkTable tr[data-dir="up"] td[data-num]{color:var(--wsb-up)}
.wsb-stkTable tr[data-dir="down"] td[data-num]{color:var(--wsb-down)}
.wsb-stkTable tr[data-stale="true"]{opacity:.62}
.wsb-stkTable tbody tr:hover{background:var(--dsw-alias-bg-layer-2)}
.wsb-stkTable .wsb-stkSpark{width:66px;height:20px;margin:0;display:inline-block;vertical-align:middle}

/* ---- 市场板块 / 板块成分股（点进去看全部个股）----------------------------------
   板块卡片是"可点"的，所以它必须看起来像可点的东西：悬停抬头、右侧有一个明确的箭头。
   成分股表复用上面的 .wsb-stkTable 骨架，只补它没有的列与方向色 —— 一套表格，两种内容。

   这一版把两处"廉价感"改掉了：一是同一件事被三处重复说（已合并到一条头部），二是行太挤
   （6px/11.5px 的密集表），所以成分股表单独放宽行高与字号。 */
.wsb-stkMkGrid{display:grid;gap:10px;grid-template-columns:repeat(auto-fill,minmax(196px,1fr))}
.wsb-stkMkCard{position:relative;display:flex;align-items:center;gap:10px;padding:13px 14px;border-radius:15px;
  text-align:left;cursor:pointer;appearance:none;font:inherit;color:inherit;
  border:1px solid var(--dsw-alias-border-l1);
  transition:transform .18s cubic-bezier(.2,.8,.2,1),border-color .18s ease,background .18s ease}
.wsb-stkMkCard:hover{transform:translateY(-2px);border-color:var(--dsw-alias-border-l2);
  background:color-mix(in srgb,var(--wsb-c1) 9%,transparent)}
.wsb-stkMkMain{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:4px}
.wsb-stkMkName{font-size:13.5px;font-weight:620;letter-spacing:.01em}
.wsb-stkMkMeta{display:flex;align-items:center;gap:7px;font-size:10.5px;color:var(--dsw-alias-label-secondary)}
/* 作用域标签：一个小胶囊，是"这是完整名单还是活跃榜"的唯一说明，所以它必须一直看得见 */
.wsb-stkMkScope{display:inline-flex;align-items:center;flex:0 0 auto;font-style:normal;
  padding:1.5px 6px;border-radius:999px;font-size:9.5px;letter-spacing:.02em;
  border:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary)}
.wsb-stkMkScope[data-scope="board"]{border-color:color-mix(in srgb,var(--wsb-c1) 42%,transparent);
  color:color-mix(in srgb,var(--wsb-c1) 88%,transparent)}
.wsb-stkMkGo{flex:0 0 auto;width:15px;height:15px;color:var(--dsw-alias-label-secondary);opacity:.55}
.wsb-stkMkCard:hover .wsb-stkMkGo{opacity:1;color:var(--wsb-c1)}

/* 成分股头部：一条横排承载返回 / 板块名 / 规模 / 搜索 / 刷新 */
.wsb-stkMkHead{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:12px}
.wsb-stkMkBack{display:inline-flex;align-items:center;gap:3px;flex:0 0 auto;appearance:none;cursor:pointer;
  padding:5px 10px 5px 6px;border-radius:999px;font:inherit;font-size:11.5px;
  border:1px solid var(--dsw-alias-border-l1);background:transparent;color:var(--dsw-alias-label-secondary);
  text-decoration:none;transition:color .18s ease,border-color .18s ease}
.wsb-stkMkBack:hover{color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-border-l2)}
.wsb-stkMkBack>svg{width:13px;height:13px;flex:0 0 auto}
.wsb-stkMkWho{display:flex;flex-direction:column;gap:2px;min-width:0;margin-right:auto}
.wsb-stkMkWho b{font-size:16px;font-weight:660;letter-spacing:.01em;white-space:nowrap}
.wsb-stkMkCount{display:flex;align-items:center;gap:7px;font-size:10.5px;color:var(--dsw-alias-label-secondary);
  white-space:nowrap;font-variant-numeric:tabular-nums}
.wsb-stkMkSearch{flex:0 1 220px;min-width:132px}
.wsb-stkMkWrap{overflow:auto;max-height:100%}
.wsb-stkMkWrap::-webkit-scrollbar{width:9px;height:9px}
.wsb-stkMkWrap::-webkit-scrollbar-thumb{background:var(--dsw-alias-border-l2);border-radius:9px;
  border:2px solid transparent;background-clip:content-box}

/* ---- 成分股表：同一套骨架，但更透气 -------------------------------------------
   .wsb-stkTable 的 6px/11.5px 是给七列指数表调的；成分股有十列、要一行行读，所以这里
   单独放宽。数字仍走等宽数字，表格仍然右对齐 —— 只是不再挤在一起。 */
.wsb-stkTable[data-stock-members="1"] th,.wsb-stkTable[data-stock-members="1"] td{padding:12px 12px;font-size:12.5px}
.wsb-stkTable[data-stock-members="1"] th{font-size:10px;letter-spacing:.04em;text-transform:none;
  font-weight:600;color:var(--dsw-alias-label-secondary)}
.wsb-stkTable[data-stock-members="1"] tbody tr{transition:background .15s ease}
.wsb-stkTable[data-stock-members="1"] tbody tr:hover{background:color-mix(in srgb,var(--wsb-c1) 7%,transparent)}
.wsb-stkTable[data-stock-members="1"] th[data-sortable="1"]{cursor:pointer;user-select:none;white-space:nowrap}
.wsb-stkTable[data-stock-members="1"] th[data-sortable="1"]:hover{color:var(--dsw-alias-label-primary)}
/* 活动排序列用一条中性色的下划线标注，而不是品牌蓝：蓝色在这张表里会让"哪个在排序"和
   "涨跌"两种含义混在一起。用 rgba 而不是 color-mix —— 下划线是这条 Header 唯一的指示，
   不能因为某个渲染器不支持 color-mix 就整条声明被丢掉。 */
.wsb-stkTable[data-stock-members="1"] th[data-on="true"]{color:var(--dsw-alias-label-primary);
  box-shadow:inset 0 -2px 0 0 rgba(255,255,255,.62)}
/* 数值列一律右对齐 + 等宽数字；只有名称与代码靠左。 */
.wsb-stkTable[data-stock-members="1"] th,.wsb-stkTable[data-stock-members="1"] td{text-align:right}
.wsb-stkTable[data-stock-members="1"] th:first-child,.wsb-stkTable[data-stock-members="1"] td[data-code],
.wsb-stkTable[data-stock-members="1"] td[data-name]{text-align:left}
.wsb-stkTable[data-stock-members="1"] td[data-num],.wsb-stkTable[data-stock-members="1"] td[data-pct],
.wsb-stkTable[data-stock-members="1"] th{font-variant-numeric:tabular-nums}
.wsb-stkTable[data-stock-members="1"] td[data-code]{text-align:left;font-variant-numeric:tabular-nums;
  color:var(--dsw-alias-label-secondary);font-size:11.5px;letter-spacing:.02em}
.wsb-stkTable[data-stock-members="1"] td[data-name]{text-align:left;max-width:180px;overflow:hidden;
  text-overflow:ellipsis;font-weight:520}
.wsb-stkTable[data-stock-members="1"] td[data-pct]{font-variant-numeric:tabular-nums}
.wsb-stkTable[data-stock-members="1"] tr[data-dir="up"] td[data-pct]{color:var(--wsb-up);font-weight:640}
.wsb-stkTable[data-stock-members="1"] tr[data-dir="down"] td[data-pct]{color:var(--wsb-down);font-weight:640}
/* 今日区间：一根细轨 + 一个游标。轨道不抢眼，游标用强调色点出来。 */
.wsb-stkMkRange{display:flex;align-items:center;gap:7px;min-width:126px}
.wsb-stkMkRange>i{position:relative;display:block;flex:1 1 auto;height:3px;border-radius:3px;
  background:color-mix(in srgb,var(--dsw-alias-border-l2) 62%,transparent)}
.wsb-stkMkRange>i>b{position:absolute;top:-2.5px;width:2px;height:8px;border-radius:2px;
  background:var(--dsw-alias-label-primary)}
.wsb-stkMkRange>em{flex:0 0 auto;font-style:normal;font-size:10px;color:var(--dsw-alias-label-secondary);
  font-variant-numeric:tabular-nums;min-width:34px}
.wsb-stkMkRange>em:last-child{text-align:right}

.wsb-stkFail{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px;font-size:10.5px;
  color:var(--dsw-alias-label-secondary)}
.wsb-stkFail>span{padding:3px 8px;border-radius:999px;background:var(--dsw-alias-bg-layer-1);
  border:1px solid var(--dsw-alias-border-l1)}
.wsb-stkFail>span b{color:var(--dsw-alias-label-primary);font-weight:600}

/* 免责声明：行情面板里最容易被省略、也最不该省略的一行。 */
.wsb-stkLegal{margin-top:10px;font-size:9.5px;line-height:1.6;color:var(--dsw-alias-label-secondary);opacity:.85}
@property --wsb-lens-angle{syntax:'<angle>';initial-value:0deg;inherits:false}
/* ==== 液态玻璃 (图标材质) ====
   折射: backdrop-filter 追加 url(#过滤器). 不支持 url() 的引擎会丢掉这一条, 于是回落到
   上一条纯 blur+saturate 的声明 —— 这就是兼容性兜底, 不需要 @supports.
   厚塑料: 顶部高光 + 底部内阴影 + 更亮的发丝边.
   边缘拾色: .wsb-lens 是一圈取极光色的 conic 渐层, 用 mask 只留 1.5px, screen 混合;
   悬停时角度过渡, 于是整圈光带缓缓转动. */
.wsb-card,.wsb-glass{
  backdrop-filter:blur(var(--wsb-glass-blur,26px)) saturate(var(--wsb-glass-sat,170%))
    brightness(var(--wsb-glass-bright,1));
  backdrop-filter:blur(var(--wsb-glass-blur,26px)) saturate(var(--wsb-glass-sat,170%))
    brightness(var(--wsb-glass-bright,1)) url(#wsbRefractSoft)}
/* 曲面: 几乎不模糊(图案必须还在) + 位移(自带壁厚 depth=26) + 色散(见 #wsbLens).
   厚度的读数来自"只有边缘一圈被弯折", 而不是来自模糊或阴影. */
[data-glass="thick"] .wsb-card,[data-glass="thick"] .wsb-glass{
  backdrop-filter:blur(1px) saturate(182%) brightness(1.06) url(#wsbLens)}
/* 壁厚: 底部深色带 + 顶部亮边 + 内圈第二道高光 + 外圈发丝边. 这四层是"厚塑料"的读数来源. */
[data-glass="thick"] .wsb-card{box-shadow:
  inset 0 -10px 16px -12px rgba(0,0,0,.5),
  inset 0 8px 14px -12px rgba(255,255,255,.34),
  inset 0 0 0 1px rgba(255,255,255,.34),
  inset 0 1.5px 0 0 rgba(255,255,255,.6),
  0 20px 38px -20px rgba(0,0,0,.6)}
/* 边缘那一圈: 几乎不模糊地再取一次背景, 并做同样的镜面弯折 ——
   于是背景的图案与色彩会顺着边缘透进来、被扭一下, 而不是只透一层均匀的颜色. */
/* 边缘环只取背景的色与图案(低模糊 + 高饱和), 不做位移 ——
   它只有十几像素宽, 套同一个位移会被放大到夸张. 折射由主体那层负责. */
[data-glass="thick"] .wsb-lens{padding:12px;
  -webkit-backdrop-filter:blur(0.5px) saturate(215%) contrast(1.1) brightness(1.08);
  backdrop-filter:blur(0.5px) saturate(215%) contrast(1.1) brightness(1.08);
/* 薄雾与实心不折射: 它们要的是干净, 不是塑料 */
[data-glass="thin"] .wsb-card,[data-glass="thin"] .wsb-glass,
[data-glass="solid"] .wsb-card,[data-glass="solid"] .wsb-glass{
  backdrop-filter:blur(var(--wsb-glass-blur,26px)) saturate(var(--wsb-glass-sat,170%))
    brightness(var(--wsb-glass-bright,1))}
.wsb-lensDefs{position:absolute;width:0;height:0;pointer-events:none}
.wsb-card{box-shadow:
  inset 0 1.5px 0 color-mix(in srgb,#fff calc(26% * var(--wsb-glass-spec,1)),transparent),
  inset 0 -16px 26px -18px rgba(0,0,0,calc(.5 * var(--wsb-glass-depth,.4))),
  inset 0 0 0 1px color-mix(in srgb,#fff calc(9% * var(--wsb-glass-rim,1)),transparent),
  0 18px 34px -18px rgba(0,0,0,.6)}
/* 边缘拾色: 这是一个"环"(中间被 mask 挖空), 它自己带 backdrop-filter, 采样的是它下面
   真实的背景 —— 边缘的颜色因此来自背景本身, 不是主题色. saturate 把背景的色彩提出来,
   contrast 让色带更清晰, brightness 让它像被玻璃加亮. */
.wsb-lens{position:absolute;inset:0;border-radius:inherit;pointer-events:none;padding:11px;
  -webkit-backdrop-filter:blur(6px) saturate(260%) contrast(1.08) brightness(1.16);
  backdrop-filter:blur(6px) saturate(260%) contrast(1.08) brightness(1.16);
  -webkit-mask:linear-gradient(#000,#000) content-box,linear-gradient(#000,#000);
  -webkit-mask-composite:xor;mask:linear-gradient(#000,#000) content-box,linear-gradient(#000,#000);
  mask-composite:exclude;
  background:linear-gradient(152deg,
    color-mix(in srgb,#fff calc(26% * var(--wsb-glass-spec,1)),transparent),
    transparent 40%,
    color-mix(in srgb,#fff calc(9% * var(--wsb-glass-spec,1)),transparent));
  box-shadow:inset 0 0 0 1px color-mix(in srgb,#fff calc(34% * var(--wsb-glass-rim,1)),transparent),
    inset 0 1.6px 0 color-mix(in srgb,#fff calc(58% * var(--wsb-glass-spec,1)),transparent);
  opacity:calc(.72 + .28 * var(--wsb-glass-spec,1));
  transition:opacity .25s ease}
.wsb-card:hover .wsb-lens{opacity:1}
/* ==== tile geometry (authoritative) ====
   本插件所有: 磁贴宽高由同一单位声明, 所以必然是正方形; 图标填满磁贴内容盒, 因此在任何盒子
   比例下都在正中. 放在样式表最后, 是为了与同时在编辑本文件的其它任务共存 —— 同优先级下这里
   最后生效. 只作用于磁贴层, 与笔记层无关. */
.wsb-card{width:13.4cqw;height:13.4cqw;min-height:0;max-height:13.4cqw;box-sizing:border-box;
  justify-self:center;align-self:start;padding:9px;gap:0;overflow:hidden}
.wsb-card[data-size="wide"]{width:calc(13.4cqw * 2 + 2.7cqw);height:13.4cqw;max-height:13.4cqw}
.wsb-card[data-size="large"]{width:calc(13.4cqw * 2 + 2.7cqw);height:calc(13.4cqw * 2 + 2.7cqw);max-height:none}
.wsb-tileMark{width:76%;height:76%;display:grid;place-items:center}
.wsb-tileName{position:absolute;left:0;right:0;bottom:7px;text-align:center}
.wsb-tileAbbr{position:absolute;left:0;right:0;bottom:24px;text-align:center}

/* ==== 模块内所有按钮：与「AI 领域」chip 完全相同的悬停效果 ====
   chip 的配方是：基态边框 border-l1、底色 bg-layer-2；悬停时上浮 1px + 边框变亮到 border-l2。
   这里把同一套变量与数值套到返回按钮与其余模块按钮上 —— 观感与 chip 一致，四个模块一致。 */
.wsb-screen:not([data-role="home"]) :is(.wsb-backBtn,.wsb-btn,.wsb-chip,.wsb-tab,.wsb-segBtn,.wsb-iconBtn){
  transition:transform .2s cubic-bezier(.2,.8,.2,1),border-color .2s ease,background-color .2s ease,color .2s ease}
.wsb-screen:not([data-role="home"]) :is(.wsb-backBtn,.wsb-btn,.wsb-chip,.wsb-tab,.wsb-segBtn,.wsb-iconBtn):not([disabled]):hover{
  transform:translateY(-1px);
  border-color:var(--dsw-alias-border-l2);
  background-color:var(--dsw-alias-bg-layer-2);
  color:var(--dsw-alias-label-primary)}





/* ==== 模块头部的入场动画（一处控制四个模块）====
   最早的写法依赖"头部元素 → 直接子元素"，一旦某一屏内部多包了一层就会漏掉（新闻就因此
   显得和别人不一样）。这里改为按控件种类匹配：只要在模块头部范围内，任何深度的按钮、
   标题、控件组都拿到同一条动画；顺序用 :nth-of-type 给（同一父元素内依次错峰）。
   于是四个模块共用一套调度，不存在"某一个会跳、别的不会"。 */
.wsb-screen:not([data-role="home"]) :is(.wsb-head,.wsb-nwHead,.wsb-stkHead,.wsb-noteTop) :is(button,.wsb-title,.wsb-nwTitle,.wsb-stkTitle,.wsb-noteGroup,.wsb-noteTopSpacer){
  animation:wsb-piano .46s cubic-bezier(.16,.84,.24,1) both;
  animation-delay:calc(var(--wsb-i,0) * 28ms)}
  .wsb-screen:not([data-role="home"]) :is(.wsb-head,.wsb-nwHead,.wsb-stkHead,.wsb-noteTop) button:nth-of-type(1){--wsb-i:0}
  .wsb-screen:not([data-role="home"]) :is(.wsb-head,.wsb-nwHead,.wsb-stkHead,.wsb-noteTop) button:nth-of-type(2){--wsb-i:1}
  .wsb-screen:not([data-role="home"]) :is(.wsb-head,.wsb-nwHead,.wsb-stkHead,.wsb-noteTop) button:nth-of-type(3){--wsb-i:2}
  .wsb-screen:not([data-role="home"]) :is(.wsb-head,.wsb-nwHead,.wsb-stkHead,.wsb-noteTop) button:nth-of-type(4){--wsb-i:3}
  .wsb-screen:not([data-role="home"]) :is(.wsb-head,.wsb-nwHead,.wsb-stkHead,.wsb-noteTop) button:nth-of-type(5){--wsb-i:4}
  .wsb-screen:not([data-role="home"]) :is(.wsb-head,.wsb-nwHead,.wsb-stkHead,.wsb-noteTop) button:nth-of-type(6){--wsb-i:5}
  .wsb-screen:not([data-role="home"]) :is(.wsb-head,.wsb-nwHead,.wsb-stkHead,.wsb-noteTop) button:nth-of-type(7){--wsb-i:6}
  .wsb-screen:not([data-role="home"]) :is(.wsb-head,.wsb-nwHead,.wsb-stkHead,.wsb-noteTop) button:nth-of-type(8){--wsb-i:7}

/* ==== 模块里的按钮统一提亮 ====
   白色加在 background-IMAGE 上（与 background-color 是两套图层），
   所以只提亮、不覆盖各自的原色与选中态。选择器限定在模块屏内 —— 四个模块完全一致。 */
.wsb-screen:not([data-role="home"]) :is(.wsb-chip,.wsb-btn,.wsb-segBtn,.wsb-tab,.wsb-iconBtn,.wsb-backBtn,.wsb-range){
  background-image:linear-gradient(0deg,
    color-mix(in srgb,#fff 10%,transparent),
    color-mix(in srgb,#fff 15%,transparent))}


/* 光带要够到磁贴的轮廓线：overflow:hidden 把后代裁在 padding box 上，正好差 1px，
   于是大圆角处露出那道"间隙锯齿"。改为 overflow:clip 并把裁切区域放宽 1px ——
   磁贴内容都在中心，视觉零变化；磁贴自己的描边也完全保留。 */
.wsb-card{overflow:clip;overflow-clip-margin:1px}

/* ==== 面板头与磁贴形状（统一/保证）====
   1) 面板头：控制台原本有一条独有规则给它上极光色调，其它屏没有 —— 这里统一。
   2) 磁贴形状：滑条到底时 --wsb-card-radius 是 50%（方磁贴下即正圆）；再声明一次，
      放在样式表最末尾，确保不被任何规则改写。 */
.wsb-screen:not([data-role="home"]) .wsb-paneHead{
  background:color-mix(in srgb,var(--wsb-c1) 12%,transparent)}
.wsb-card{border-radius:var(--wsb-shape-radius, var(--wsb-card-radius, 20px))}

/* ==== 标题栏（四个模块屏统一）====
   设计意图：与背景拉开层次，但不抢内容。
   · 一层"更浅"的渐变：上方稍亮、向下渐隐 —— 像被顶光照到的一条带子；
   · 上沿一道内高光、下沿一道发丝线 —— 把这条带子"压"在背景之上，边界清楚；
   · 一层轻模糊：让背后的画面在这条带上变得安静，于是标题读起来更稳。
   写在样式表末尾，因此不会被其它规则盖掉。 */
.wsb-screen .wsb-head,
.wsb-screen .wsb-nwHead,
.wsb-screen .wsb-stkHead,
.wsb-screen .wsb-noteTopRow{
  padding:8px 12px;
  border-radius:14px;
  background:linear-gradient(180deg,
    color-mix(in srgb,#fff 22%,transparent) 0%,
    color-mix(in srgb,#fff 13%,transparent) 58%,
    color-mix(in srgb,#fff 4%,transparent) 100%);
  border:1px solid color-mix(in srgb,#fff 10%,transparent);
  box-shadow:inset 0 1px 0 color-mix(in srgb,#fff 20%,transparent);
  -webkit-backdrop-filter:blur(18px) saturate(150%);
  backdrop-filter:blur(18px) saturate(150%)}

`;

    //#endregion

    //#region text

    const TEXT = {
      zh: {
        panel: '工作台', panelHint: '项目组 · 对话节点树 · 轮次汇总 · 资源仓库',
        workbenches: '工作台类型', game: '游戏开发', research: '综合研究',
        groups: '项目组', addGroup: '新建项目组', groupName: '项目组名称', bind: '绑定当前会话',
        unbound: '未绑定会话', unbind: '解除绑定',
        trailToggle: '轨迹横条', trailDrag: '拖动调整轨迹横条高度', trailStripOpen: '收起轨迹横条', remove: '删除', rename: '重命名', preset: '布局预设',
        pTree: '对话节点树', pCode: '节点代码预览', pProgress: '资源仓库', pTokens: 'Token 明细',
        pSources: '资料与来源', pBrief: '摘要节点',
        noSession: '当前没有驻留的会话。请先在侧边栏打开一个会话，再回到工作台。',
        notResident: '这个会话当前没有驻留，所以取不到它的开发记录。先在对话里打开它，或点右上角“绑定当前会话”改用现在的会话。',
        notResidentShort: '会话未驻留',
        noSessionShort: '未选择会话', loadOlder: '加载更早', loading: '加载中…', older: '更早的事件',
        turns: '轮次', steps: '步骤', calls: '工具调用', changedFiles: '改动文件', errors: '错误',
        input: '输入', output: '输出', cacheRead: '缓存命中', cacheWrite: '缓存写入', total: '合计',
        window: '上下文窗口', pressure: '上次占用', projected: '预计占用', remaining: '剩余可用', budget: '自设预算',
        usedRatio: '占用比例', breakdown: '上下文构成', systemTokens: '系统提示', toolsTokens: '工具定义', messageTokens: '消息',
        perTurn: '逐轮用量', noTurns: '这个会话还没有已记录的轮次。',
        nodeSession: '会话', nodeTurn: '轮次', nodeStep: '步骤', nodeAssistant: '助手输出', nodeTool: '工具',
        sessionTotalTurns: '会话总轮次', turnTimes: '次',
        nodeFile: '文件改动', nodeNote: '扩展节点', note: '备注', addNote: '添加扩展节点',
        prompt: '提问',
        notePlaceholder: '写下要拓展的内容…', save: '保存', cancel: '取消',
        tabArgs: '参数', tabResult: '结果', tabNote: '备注', tabFiles: '文件',
        noCode: '这个节点没有可预览的代码。选择 write / edit / read 之类的节点可以看到文件内容与改动。',
        files: '文件', newString: '新增内容', oldString: '原内容', args: '调用参数', result: '返回结果',
        sources: '引用来源', noSources: '这个会话里还没有搜索或抓取到来源。',
        running: '运行中', done: '已完成', failed: '失败', pending: '（提问未加载）',
        refresh: '刷新投影', copied: '已复制',
        noFacts: '暂无可显示的用量数据。',
        approx: '估算值，非计费数据',
        mono: '等宽',
        homeHint: '项目模块 · 点一下进入控制台',
        newModule: '新建模块', moduleName: '模块名称', openModule: '打开', renameModule: '重命名',
        deleteModule: '删除模块', moduleDesc: '模块说明', moduleKind: '模块类型',
        sheetHint: '名称回车保存，说明失焦保存',
        kindGame: '游戏开发', kindNotebook: '框架笔记', kindResearch: '综合研究', kindBlank: '空白模块',
        kindNews: '每日新闻',
        idle: '空闲', busy: '运行中', noSessionBound: '未绑定会话',
        bgBlur: '模糊', bgDim: '遮罩', bgBright: '亮度', bgGrid: '网格',
        overview: '概览', branch: '分支树', treeView: '视图',
        kTurns: '轮次', kSteps: '步骤', kCalls: '工具调用', kFiles: '改动文件', kLines: '增删行', kErrors: '错误',
        fileImpact: '文件影响', turnTimeline: '轮次时间线', density: '密度', compact: '紧凑', full: '完整',
        consoleTitle: '控制台', projectMap: '项目总览',
        spanAll: '全部', focusHint: '已聚焦，点“全部”取消',
        bgAurora: '流光背景', bgMedia: '上传媒体', bgNetworkImg: '网络图片', bgLibrary: '媒体库',
        stickyNew: '新建便签', stickyResize: '拖动可拉伸', stickyHint: '写点什么…', stickyDelete: '删除便签',
        customBg: '自定义界面', customOn: '已开启 · 动态流光已暂停', customOff: '已关闭 · 使用动态流光',
        glassAlpha: '透明度', trashHint: '拖到此处松手即可删除', trashDrop: '松手删除',
        customPerfHint: '自定义界面开启时不再渲染动态流光；视频在切到控制台或窗口不可见时自动暂停。',
        mediaPick: '上传视频 / 图片', mediaReplace: '更换', mediaRemove: '移除',
        mediaSound: '声音 关', mediaSoundOn: '声音 开', mediaRenameHint: '双击重命名', mediaSoundHint: '播放这个视频自带的声音',
        mediaLoop: '循环播放', mediaStill: '静态图片',
        bgUseThis: '使用此媒体', bgInUse: '当前使用', bgReset: '恢复初始', bgSpeed: '流光速度',
        appearance: '外观', palette: '配色', glass: '图标材质', shape: '卡片形状', cardForm: '卡片比例', size: '卡片大小',
        consoleAurora: '控制台流光',
        dockBackground: '背景', dockAppearance: '外观', dockShape: '形状', dockAdd: '新建模块',
        dockLayout: '排布', layoutTitle: '卡片排布', adjust: '调整', mediaLoading: '载入中…',
        desktopSettings: '桌面设置', bgType: '背景类型', surface: '表面效果', mediaParams: '视频·图片设置',
        gridShape: '网格效果', gridNone: '无', gridGrid: '网格', gridDots: '点阵', gridDiagonal: '斜纹',
        edgeBlur: '边缘模糊度', shapeVariance: '形状变化差异', hueSpeed: '颜色变化速度',
        saturation: '饱和度', tone: '明暗色调', mediaBlur: '模糊', mediaSpeed: '播放速度',
        uiSettings: 'UI设置', editModule: '编辑', moduleSize: '控件大小',
        auroraSettings: '流光设置', auroraEnable: '流光背景', auroraColors: '流光配色',
        dockDynamic: '动态设置', dockInterface: '界面设置',
        motion: '动态参数', flowSpeed: '流动速度', shapeAmp: '形变幅度', hueRange: '颜色差异',
        softness: '柔和度', gridEffect: '网格效果',
        moduleList: '模块', railNew: '新建模块', narration: '过程',
        // 框架笔记: a standalone node mind map (no session binding at all).
        frameNotes: '框架笔记', noteTree: '大纲', noteOutline: '大纲', noteInspector: '检查器',
        noteNode: '节点', noteCenterTopic: '中心主题',
        noteAdd: '添加子节点', noteDelete: '删除节点', noteTitle: '标题', noteBody: '备注',
        noteBodyHint: '补充说明（可选）…',
        noteLayout: '结构', noteBranch: '连线', noteTheme: '配色',
        noteLayMind: '思维导图', noteLayLogic: '逻辑图', noteLayOrg: '组织结构图',
        noteLayTree: '树形图', noteLayTimeline: '时间轴', noteLayFish: '鱼骨图',
        noteBranchCurve: '曲线', noteBranchElbow: '直角', noteBranchLine: '直线',
        noteThemeClassic: '经典', noteThemeInk: '墨黑', noteThemePaper: '纸白', noteThemeCandy: '糖果',
        noteZoom: '缩放', noteZoomIn: '放大', noteZoomOut: '缩小', noteFit: '适应画布', noteActual: '实际大小',
        noteUndo: '撤销', noteRedo: '重做', noteTidy: '整理', noteTidyHint: '清除手动拖动的位置，回到结构自动排布',
        noteInsertImage: '插入图片', noteImage: '图片', noteImageClear: '移除图片', noteNoImage: '这个节点还没有图片',
        noteImageFit: '显示方式', noteFitCover: '裁剪填满', noteFitContain: '完整显示', noteImageSize: '图片高度',
        noteShape: '形状', noteShapeRound: '圆角', noteShapeRect: '直角', noteShapeUnder: '下划线',
        noteColor: '颜色', noteColorAuto: '跟随结构', noteCollapse: '折叠', noteExpand: '展开',
        noteNodes: '节点', noteImages: '图片', noteLevel: '第 {n} 层', noteRoot: '中心',
        // 左栏：笔记历史（每一条 = 一张独立的图，新建的都会出现在这里）
        noteHistory: '笔记历史', noteHistoryEmpty: '还没有笔记。点「新建笔记」开始一张。',
        noteNewNote: '新建笔记', noteNoteUntitled: '未命名笔记', noteNoteCount: '篇',
        noteNoteSaved: '已保存在本地', noteNoteDelete: '删除这篇笔记',
        noteNoteDeleteHint: '右键笔记可以删除',
        noteNoteSwitched: '已切换到',
        noteNoteDeleted: '已删除', noteNoteLastOne: '最后一篇笔记不能删除',
        noteJustNow: '刚刚', noteMinAgo: ' 分钟前', noteHourAgo: ' 小时前', noteDayAgo: ' 天前',
        noteKeyHint: '双击卡片改名 · Tab 加子节点 · Enter 加同级 · Delete 删除 · 拖拽卡片移动 · 拖拽空白平移 · 滚轮缩放 · Ctrl+滚轮左右移动 · Ctrl+Z 撤销 · Ctrl+0 实际大小 · Ctrl+加减 缩放',
        // 新建 / 右键菜单 / Blender 式连线
        noteNew: '新建',
        noteNewHint: '清空画布，用这个名字新建一张图（可撤销）',
        noteNewTitle: '新建思维导图',
        noteNewName: '图表名称',
        noteNewNameHint: '中心节点就用这个名字，之后随时能改。',
        noteNewPlaceholder: '例如：这周的计划',
        noteNewCreate: '创建',
        noteNewCancel: '取消',
        noteNewDone: '已新建「{name}」',
        noteNewDoneEmpty: '已新建一张空图',
        noteBlank: '这是一张空画布',
        noteBlankHint: '在空白处点右键 → 新建中心节点（它就是这个图的根）；再右键根节点 → 新建子节点。也可以把卡片上的 + 拖到空白处，在落点直接长出子节点。',
        noteMenuNewRoot: '新建中心节点',
        noteMenuNewChild: '新建子节点',
        noteMenuNewSibling: '新建同级节点',
        noteMenuRename: '重命名',
        noteMenuFit: '适应画布',
        noteMenuTidy: '整理',
        noteLinkHint: '点一下：加子节点并直接命名 · 拖出去：连到别的卡片，或拖到空白处就地长出子节点',
        // 文件: 本地保存 / 读取 / 通用格式导出
        noteFile: '文件', noteSave: '保存', noteOpen: '打开', noteExport: '导出',
        noteSaveHint: '把整张图存成本地 JSON（含图片）', noteOpenHint: '读入本地文件：JSON / FreeMind(.mm) / OPML / Markdown',
        noteExportHint: '导出成别的软件能打开的格式',
        noteExportXmind: 'XMind (.xmind)', noteExportXmindHint: 'XMind 2020+ 直接打开，结构预设一起带过去',
        noteExportMm: 'FreeMind (.mm)', noteExportMmHint: 'XMind / Freeplane / MindManager 都能导入',
        noteExportOpml: 'OPML (.opml)', noteExportOpmlHint: '大纲类工具通吃（幕布、OmniOutliner…）',
        noteExportMd: 'Markdown (.md)', noteExportMdHint: '只有标题的纯大纲，给笔记工具用',
        noteExportJson: 'JSON 备份（含图片）', noteExportJsonHint: '只有它能完整还原这张图与图纸设置',
        noteSavedJson: '已保存到本地（含图片）', noteSavedJsonMissing: '已保存，但有 {n} 张图片读不到，没写进文件',
        noteSavedXmind: '已导出 .xmind', noteSavedMm: '已导出 .mm', noteSavedOpml: '已导出 .opml', noteSavedMd: '已导出 .md',
        noteImported: '已读入 {n} 个节点（图片 {i} 张）· Ctrl+Z 可以撤销',
        noteFileBadType: '认不出这个文件：支持 .json / .mm / .opml / .md',
        noteFileBadJson: '这个 JSON 不是框架笔记的备份', noteFileBadRead: '这个文件读不出来',
        noteSaved: '已保存', noteSaveFailed: '本地存储已满，最新改动可能没保存',
        notLoaded: '未加载', noUsage: '无用量记录',
        notLoadedHint: '更早的轮次不在当前事件窗口内，点上方 ↑ 加载', notLoadedTurnHint: '该轮事件未加载',
        summary: '对话轮次汇总', sDialogue: '对话汇总', sCode: '代码汇总', sArgs: '参数汇总', sResult: '结果',
        myInput: '我的输入', thinking: '思考', reply: '回复', detail: '详细', collapse: '收起',
        synNote: '（自动梗概：由本轮步骤与工具调用生成，不是翻译；点「详细」看模型原文）',
        synSteps: '本轮共 {n} 步、{c} 次工具调用', synFiles: '涉及 {n} 个文件', synErrors: '{n} 次错误',
        synTools: '主要动作：{list}', synTokens: '消耗 {i} 输入 / {o} 输出',
        share: '占比', cumulative: '累计', compare: '各项目消耗对比',
        collapseHint: '按住左键向下拖动可全部收起', fileImpactShort: '改动文件',
        trail: '轨迹', trailRows: '条记录', panes: '',
        autoSummary: '自动摘要', export: '导出', exportPpt: '导出 PPT', exportPdf: '导出 PDF',
        // 总结: compress the conversation into a themed deck (theme → 现象/根因/解法/结果).
        summaryButton: '总结', summaryTitle: '对话总结', summaryHint: '把当前对话按主题压缩成一页一主题的 PPT',
        summaryCoverLine: '共 {turns} 轮，归纳为 {themes} 个主题',
        summaryField: '字段', summaryValue: '内容', summaryTheme: '主题',
        summaryEffect: '现象', summaryCause: '根因', summaryFix: '解法', summaryResult: '结果',
        summaryKeyValues: '关键数值', summaryNumbers: '数值', summaryTotals: '总体指标',
        summaryMetric: '指标', summaryDuration: '总用时',
        summaryNone: '这个会话还没有可总结的轮次。', summaryMaking: '正在整理…', summaryDone: '已导出总结 PPT',
        summaryCopy: '复制总结', summaryCopyHint: '把总结以 Markdown 表格复制到剪贴板',
        clickTurnHint: '在左侧点一个轮次节点，这里汇总它的对话、代码与参数。',
        noChanges: '这一轮没有文件改动。', noArgs: '这一轮没有工具调用。', noThinking: '这一轮没有记录到思考过程。',
        changedFilesN: '个文件改动', toolCallsN: '次工具调用', sessionTotal: '本项目消耗',

        // ---- 每日新闻 ----
        // 布局预设与窗格名。这两个 lookup（控制台里的 `t['preset'+Key]`、`t['pane'+Kind]`）一直
        // 没有对应的键，所以那排按钮渲染成了空胶囊 —— 补上，顺带记在这里免得再被漏掉。
        presetTriple: '三栏·标准', presetDuo: '双栏·并列', presetFocus: '单栏·专注', presetQuad: '四栏·全景',
        paneTree: '对话节点树', paneMid: '汇总', paneProgress: '资源仓库', paneTokens: 'Token 明细', paneTrail: '轨迹',
        newsTitle: '每日新闻', newsSubHint: '当日全球大事件 · 自定义关键词',
        newsJustNow: '刚刚', newsMin: ' 分钟前', newsHour: ' 小时前', newsDayAge: ' 天前', newsDayUnit: '天',
        newsRefresh: '刷新', newsRefreshing: '抓取中', newsCount: '条数', newsRange: '时间范围',
        newsDays1: '今日', newsDays3: '3 天', newsDays7: '7 天',
        newsViewList: '列表', newsViewGrid: '网格', newsViewCompact: '紧凑',
        newsTopics: '主题与关键词',
        newsTopicsShort: '关键领域',
        newsSurvey: '关键领域新闻速览',
        newsOriginal: '新闻原文',
        newsOriginalHint: '在左边点一条，这里显示它所在页面的原文。',
        newsParagraphs: '段',
        newsNoBody: '这个页面没有给出可读的正文（常见于付费墙或拒绝非浏览器访问）；摘要与原文链接仍然可用。',
        newsStream: '新闻流', newsDetail: '详情',
        newsHot: '大事件', newsHotHint: '家媒体报道', newsRelated: '同一事件的其他报道',
        newsAddTopic: '新建主题', newsTopicName: '主题名称', newsKeywords: '关键词', newsAddKeyword: '添加关键词，回车确认',
        newsSources: '新闻来源', newsLang: '语言', newsDeleteTopic: '删除主题',
        newsEditTopic: '编辑这个主题', newsDone: '完成', newsNoKeywords: '还没有关键词',
        newsOpen: '打开原文', newsCopyLink: '复制链接', newsCopied: '已复制',
        newsSearchLink: '搜索这个标题', newsEnriching: '正在读取原文摘要…',
        newsSourceStatus: '来源状态', newsCoverage: '覆盖', newsItems: '条', newsFailed: '失败',
        newsEmpty: '还没有新闻。点右上角「刷新」抓取一次。',
        newsEmptyTopic: '这个主题还没有内容：给它加一个关键词，或勾选一个新闻来源。',
        newsLoading: '正在抓取全球新闻…', newsLoadingHint: '首次抓取要同时访问十几个来源，通常 3–8 秒。',
        newsStale: '有来源没抓到，显示的是上次缓存。', newsErrors: '个来源失败',
        newsArchive: '已保存', newsArchiveHint: '最多保留最近 7 天',
        newsRetention: '最多保留 7 天', newsCountHint: '条数 10–100，可拖动',
        newsUnread: '未读', newsAll: '全部', newsTracked: '个来源', newsTopicsN: '个主题',
        newsDetailHint: '在左侧新闻流里点一条，这里显示它的详细内容与同期报道。',
        newsSelectTopic: '选一个主题',
        newsNoCatalog: '取不到来源目录，已使用内置列表。',
        newsFetchFailed: '抓取失败',
        newsRestartHint: 'Host 半还没生效：新闻的抓取路由在 /workbench-news，而 Host 半的代码只在 DSH 启动时加载一次。请重启一次 DSH，之后这里就会出新闻。（客户端半已经热重载了，所以模块本身能打开。）',
        newsTimedOut: '部分来源仍在加载，已先显示到手的新闻',
        newsPending: '个来源在后台继续',
        newsProxyHint: '有几个国际来源连不上。如果这台机器要经代理才能访问 Google / BBC，请在 ~/.dsh/.env 里加上 https_proxy=http://127.0.0.1:端口（把端口换成你的代理），然后重启 DSH；同一次抓取里国内来源是正常的。',
        newsTranslateToggle: '中译',
        newsTranslateHint: '英文标题显示中文对照（机器翻译，本地缓存；快捷键 T）',
        newsTranslateOne: '翻译这一条',
        newsTranslateStory: '翻译这条新闻',
        newsTranslateShort: '译',
        newsTranslating: '翻译中…',
        newsTranslatedTag: '译',
        newsTranslatedCount: '条已译',
        newsTranslateFailed: '翻译服务：',
        newsTickerLabel: '最新播报',
        newsDragHint: '拖动调整栏宽，双击复位',

        // ---- 股票市场 (Stock market) ----
        kindStock: '股票市场',
        stockTitle: '股票市场', stockSubHint: '全球股市最新行情 · 点选你要看的市场',
        stockRefresh: '刷新', stockRefreshing: '刷新中',
        stockUpdated: '更新于', stockJustNow: '刚刚', stockMinAgo: ' 分钟前', stockHourAgo: ' 小时前',
        stockStale: '数据已过期', stockStaleHint: '显示的是上次抓到的行情，不是当前价格 —— 点「刷新」重试。',
        stockSessionOpen: '交易中', stockSessionClosed: '休市', stockSessionUnknown: '时间未知',
        stockFallbackTag: '备用源', stockStaleRow: '旧数据', stockFallbackHint: '由腾讯备用源回答，因此没有日内走势',
        stockEmpty: '还没有行情。点右上角「刷新」抓取一次。',
        stockLoading: '正在抓取全球行情…', stockLoadingHint: '首次抓取要访问十几个市场，通常 2–5 秒。',
        stockMarkets: '市场', stockSelectedN: '个市场', stockRegionAll: '全部',
        stockEditMarkets: '选择要显示的市场', stockDone: '完成',
        stockMinHint: '至少选 4 个市场', stockPickHint: '点一下加入或移出',
        stockViewBoard: '看板', stockViewTable: '表格',
        dimLabel: '背景压暗', dimHint: '数值越高，模块内背景越模糊、越暗',
        stockSortCatalog: '目录顺序', stockSortChange: '按涨跌', stockSortPct: '按涨跌幅',
        stockPrice: '最新', stockChange: '涨跌', stockPct: '涨跌幅', stockPrev: '昨收',
        stockDataTime: '行情时间', stockReadTime: '读取时间', stockLocalTime: '交易所当地时间',
        stockSparkHint: '当日走势（15 分钟）',
        stockFailedN: '个市场抓取失败', stockNoPrice: '—',
        stockFetchFailed: '抓取失败',
        stockRestartHint: 'Host 半还没生效：行情的抓取路由在 /workbench-stocks，而 Host 半的代码只在 DSH 启动时加载一次。请重启一次 DSH，之后这里就会出行情。（客户端半已经热重载了，所以模块本身能打开。）',
        stockProxyHint: '有些市场抓不到：国际指数要走 Yahoo，而它需要经代理访问。请确认代理已开启（系统代理，或 ~/.dsh/.env 里的 https_proxy），然后重启 DSH。A股 / 港股 / 美股 有备用源，通常仍然可用。',
        stockOfflineHint: '一个市场都没抓到：请检查这台机器的网络连接。',
        stockDisclaimer: '行情来自公开接口，可能有延迟，仅供参考，不构成投资建议。',
        // ── 板块成分（点进某个市场看全部个股）──────────────────────────────────
        stockViewMarkets: '板块', stockViewMembers: '个股',
        stockMarketsTitle: '市场板块', stockMarketsHint: '点任意板块，查看它内部的全部个股行情。',
        stockMkBack: '返回板块', stockMkOpen: '查看个股',
        // 作用域标签要短：它出现在每张卡片的一行小字里，写成长句就是噪声。
        stockMkScopeFull: '完整名单', stockMkScopeRank: '活跃榜',
        stockMkTotal: '板块共', stockMkShownN: '只，本次显示', stockMkShown: '只，显示',
        stockMkHintScope: '完整名单', stockMkHintRank: '活跃榜 · 按涨幅取前 100 名',
        stockMkUpdated: '更新于', stockMkSearch: '搜索代码或名称',
        stockMkSortPct: '涨幅', stockMkSortAmount: '成交额', stockMkSortTurnover: '换手率',
        stockMkSortCap: '总市值', stockMkSortPrice: '价格', stockMkSortCode: '代码',
        stockMkDirDesc: '降序', stockMkDirAsc: '升序',
        stockMkEmpty: '没有匹配的个股。试试清空搜索。',
        stockMkColCode: '代码', stockMkColName: '名称', stockMkColPrice: '最新价',
        stockMkColPct: '涨跌幅', stockMkColAmount: '成交额', stockMkColTurnover: '换手率',
        stockMkColPe: '市盈率', stockMkColCap: '总市值', stockMkColAmp: '振幅',
        stockMkColRange: '今日区间', stockMkRestart: '成分股路由在 Host 半，需要重启一次 DSH 才会生效。',
      },
      en: {
        panel: 'Workbench', panelHint: 'projects · node tree · code preview · token meter',
        workbenches: 'Workbench', game: 'Game Dev', research: 'Research',
        groups: 'Projects', addGroup: 'New project', groupName: 'Project name', bind: 'Bind session',
        unbound: 'no session', unbind: 'Release',
        trailToggle: 'Trail strip', trailDrag: 'Drag to resize the trail strip', trailStripOpen: 'Hide the trail strip', remove: 'Delete', rename: 'Rename', preset: 'Layout',
        pTree: 'Dialogue node tree', pCode: 'Node code preview', pProgress: 'Resource vault', pTokens: 'Token detail',
        pSources: 'Sources', pBrief: 'Summary nodes',
        noSession: 'No session is resident. Open one from the sidebar, then come back to the Workbench.',
        notResident: 'That session is not resident, so its development record is unavailable. Open it in the conversation first, or use “Bind session” to follow the current one.',
        notResidentShort: 'session not resident',
        noSessionShort: 'no session', loadOlder: 'Load earlier', loading: 'loading…', older: 'earlier events',
        turns: 'Turns', steps: 'Steps', calls: 'Tool calls', changedFiles: 'Files changed', errors: 'Errors',
        input: 'Input', output: 'Output', cacheRead: 'Cache read', cacheWrite: 'Cache write', total: 'Total',
        window: 'Context window', pressure: 'Last prompt', projected: 'Next prompt', remaining: 'Remaining', budget: 'Budget',
        usedRatio: 'Occupancy', breakdown: 'Composition', systemTokens: 'System', toolsTokens: 'Tools', messageTokens: 'Messages',
        perTurn: 'Per-turn usage', noTurns: 'This session has no recorded turns yet.',
        nodeSession: 'Session', nodeTurn: 'Turn', nodeStep: 'Step', nodeAssistant: 'Assistant', nodeTool: 'Tool',
        sessionTotalTurns: 'Session turns', turnTimes: 'turns',
        nodeFile: 'File change', nodeNote: 'Extension node', note: 'Note', addNote: 'Add extension node',
        prompt: 'Prompt',
        notePlaceholder: 'What to extend…', save: 'Save', cancel: 'Cancel',
        tabArgs: 'Arguments', tabResult: 'Result', tabNote: 'Note', tabFiles: 'Files',
        noCode: 'This node has no previewable code. Pick a write / edit / read node to see file content and diffs.',
        files: 'Files', newString: 'Added', oldString: 'Removed', args: 'Arguments', result: 'Result',
        sources: 'Sources', noSources: 'No searched or fetched source in this session yet.',
        running: 'running', done: 'done', failed: 'failed', pending: '(prompt not loaded)',
        refresh: 'Refresh projections', copied: 'copied',
        noFacts: 'No usage data to display yet.',
        approx: 'estimate, not billing data',
        mono: 'mono',
        homeHint: 'Project modules · tap one to open its console',
        newModule: 'New module', moduleName: 'Module name', openModule: 'Open', renameModule: 'Rename',
        deleteModule: 'Delete module', moduleDesc: 'Module description', moduleKind: 'Module kind',
        sheetHint: 'Enter saves the name; the note saves on blur',
        kindGame: 'Game dev', kindNotebook: 'Frame notes', kindResearch: 'Research', kindBlank: 'Blank module',
        kindNews: 'Daily news',
        idle: 'idle', busy: 'running', noSessionBound: 'no session bound',
        bgBlur: 'Blur', bgDim: 'Scrim', bgBright: 'Brightness', bgGrid: 'Grid',
        overview: 'Overview', branch: 'Branch tree', treeView: 'View',
        kTurns: 'Turns', kSteps: 'Steps', kCalls: 'Tool calls', kFiles: 'Files', kLines: '± lines', kErrors: 'Errors',
        fileImpact: 'File impact', turnTimeline: 'Turn timeline', density: 'Density', compact: 'Compact', full: 'Full',
        consoleTitle: 'Console', projectMap: 'Project overview',
        spanAll: 'All', focusHint: 'focused — tap All to clear',
        bgAurora: 'Aurora background', bgMedia: 'Upload media', bgNetworkImg: 'Network image', bgLibrary: 'Media library',
        stickyNew: 'New note', stickyResize: 'Drag to resize', stickyHint: 'Write something…', stickyDelete: 'Delete note',
        customBg: 'Custom background', customOn: 'On · aurora paused', customOff: 'Off · aurora in use',
        glassAlpha: 'Opacity', trashHint: 'Drop here to delete', trashDrop: 'Release to delete',
        customPerfHint: 'While a custom background is on the aurora is not rendered at all, and the video pauses whenever the console covers it or the window is hidden.',
        mediaPick: 'Upload video / image', mediaReplace: 'Replace', mediaRemove: 'Remove',
        mediaSound: 'Sound off', mediaSoundOn: 'Sound on', mediaRenameHint: 'Double-click to rename', mediaSoundHint: "Use the video's own audio",
        mediaLoop: 'Loops', mediaStill: 'Still image',
        bgUseThis: 'Use this media', bgInUse: 'in use', bgReset: 'Reset', bgSpeed: 'Aurora speed',
        appearance: 'Appearance', palette: 'Palette', glass: 'Icon material', shape: 'Card shape', cardForm: 'Card ratio', size: 'Card size',
        consoleAurora: 'Console aurora',
        dockBackground: 'Background', dockAppearance: 'Appearance', dockShape: 'Shape', dockAdd: 'New module',
        dockLayout: 'Layout', layoutTitle: 'Card layout', adjust: 'Adjust', mediaLoading: 'loading…',
        desktopSettings: 'Desktop settings', bgType: 'Background type', surface: 'Surface',
        mediaParams: 'Video · image', gridShape: 'Surface pattern', gridNone: 'None', gridGrid: 'Grid',
        gridDots: 'Dots', gridDiagonal: 'Diagonals',
        edgeBlur: 'Edge blur', shapeVariance: 'Shape variance', hueSpeed: 'Hue speed',
        saturation: 'Saturation', tone: 'Tone', mediaBlur: 'Blur', mediaSpeed: 'Playback speed',
        uiSettings: 'UI settings', editModule: 'Edit', moduleSize: 'Widget size',
        auroraSettings: 'Aurora settings', auroraEnable: 'Aurora background', auroraColors: 'Aurora colours',
        dockDynamic: 'Motion', dockInterface: 'Interface',
        motion: 'Motion', flowSpeed: 'Flow speed', shapeAmp: 'Shape range', hueRange: 'Colour range',
        softness: 'Softness', gridEffect: 'Surface pattern',
        moduleList: 'Modules', railNew: 'New module', narration: 'Work log',
        // Frame notes: a standalone node mind map (no session binding at all).
        frameNotes: 'Frame notes', noteTree: 'Outline', noteOutline: 'Outline', noteInspector: 'Inspector',
        noteNode: 'Node', noteCenterTopic: 'Central topic',
        noteAdd: 'Add child node', noteDelete: 'Delete node', noteTitle: 'Title', noteBody: 'Note',
        noteBodyHint: 'Anything worth keeping with the node…',
        noteLayout: 'Structure', noteBranch: 'Wires', noteTheme: 'Palette',
        noteLayMind: 'Mind map', noteLayLogic: 'Logic chart', noteLayOrg: 'Org chart',
        noteLayTree: 'Tree chart', noteLayTimeline: 'Timeline', noteLayFish: 'Fishbone',
        noteBranchCurve: 'Curved', noteBranchElbow: 'Right angle', noteBranchLine: 'Straight',
        noteThemeClassic: 'Classic', noteThemeInk: 'Ink', noteThemePaper: 'Paper', noteThemeCandy: 'Candy',
        noteZoom: 'Zoom', noteZoomIn: 'Zoom in', noteZoomOut: 'Zoom out', noteFit: 'Fit', noteActual: 'Actual size',
        noteUndo: 'Undo', noteRedo: 'Redo', noteTidy: 'Tidy', noteTidyHint: 'Clear manual drags and let the structure place every card again',
        noteInsertImage: 'Insert picture', noteImage: 'Picture', noteImageClear: 'Remove picture', noteNoImage: 'This node has no picture yet',
        noteImageFit: 'Fit', noteFitCover: 'Crop to fill', noteFitContain: 'Show whole picture', noteImageSize: 'Picture height',
        noteShape: 'Shape', noteShapeRound: 'Rounded', noteShapeRect: 'Square', noteShapeUnder: 'Underline',
        noteColor: 'Colour', noteColorAuto: 'Follow structure', noteCollapse: 'Collapse', noteExpand: 'Expand',
        noteNodes: 'nodes', noteImages: 'pictures', noteLevel: 'Level {n}', noteRoot: 'Centre',
        noteHistory: 'Note history', noteHistoryEmpty: 'No notes yet. Hit New note to start one.',
        noteNewNote: 'New note', noteNoteUntitled: 'Untitled note', noteNoteCount: 'notes',
        noteNoteSaved: 'saved locally', noteNoteDelete: 'Delete this note',
        noteNoteDeleteHint: 'Right-click a note to delete it',
        noteNoteSwitched: 'Switched to',
        noteNoteDeleted: 'Deleted', noteNoteLastOne: 'The last note cannot be deleted',
        noteJustNow: 'just now', noteMinAgo: ' min ago', noteHourAgo: ' h ago', noteDayAgo: ' d ago',
        noteKeyHint: 'Double-click a card to rename · Tab adds a child · Enter adds a sibling · Delete removes · drag a card to move it · drag the background to pan · wheel to zoom · Ctrl+wheel to move sideways · Ctrl+Z to undo · Ctrl+0 actual size · Ctrl+plus/minus zoom',
        // new map / context menu / Blender-style linking
        noteNew: 'New',
        noteNewHint: 'Clear the canvas and start a new map with this name (undoable)',
        noteNewTitle: 'New mind map',
        noteNewName: 'Map name',
        noteNewNameHint: 'The centre node takes this name; you can change it any time.',
        noteNewPlaceholder: 'e.g. This week',
        noteNewCreate: 'Create',
        noteNewCancel: 'Cancel',
        noteNewDone: 'Started “{name}”',
        noteNewDoneEmpty: 'Started an empty map',
        noteBlank: 'This canvas is empty',
        noteBlankHint: 'Right-click empty space → New centre node (it becomes the root of this map); then right-click the root → New child node. You can also drag a card’s + into empty space to grow a child right where you drop it.',
        noteMenuNewRoot: 'New centre node',
        noteMenuNewChild: 'New child node',
        noteMenuNewSibling: 'New sibling node',
        noteMenuRename: 'Rename',
        noteMenuFit: 'Fit to canvas',
        noteMenuTidy: 'Tidy up',
        noteLinkHint: 'Click: add a child and name it · Drag out: link to another card, or drop on empty space to grow a child there',
        // File: local save / open / interchange export
        noteFile: 'File', noteSave: 'Save', noteOpen: 'Open', noteExport: 'Export',
        noteSaveHint: 'Save the whole map as a local JSON file (pictures included)', noteOpenHint: 'Open a local file: JSON / FreeMind (.mm) / OPML / Markdown',
        noteExportHint: 'Export a format another app can open',
        noteExportXmind: 'XMind (.xmind)', noteExportXmindHint: 'Opens directly in XMind 2020+, structure preset included',
        noteExportMm: 'FreeMind (.mm)', noteExportMmHint: 'Imports into XMind / Freeplane / MindManager',
        noteExportOpml: 'OPML (.opml)', noteExportOpmlHint: 'Read by outliners of every kind',
        noteExportMd: 'Markdown (.md)', noteExportMdHint: 'Titles only — a plain outline for note tools',
        noteExportJson: 'JSON backup (with pictures)', noteExportJsonHint: 'The only format that restores this map and its settings completely',
        noteSavedJson: 'Saved to your downloads (pictures included)', noteSavedJsonMissing: 'Saved, but {n} pictures could not be read and are not in the file',
        noteSavedXmind: 'Exported .xmind', noteSavedMm: 'Exported .mm', noteSavedOpml: 'Exported .opml', noteSavedMd: 'Exported .md',
        noteImported: 'Read {n} nodes ({i} pictures) · Ctrl+Z undoes it',
        noteFileBadType: 'Unrecognised file: .json / .mm / .opml / .md are supported',
        noteFileBadJson: 'That JSON is not a frame-notes backup', noteFileBadRead: 'That file could not be read',
        noteSaved: 'Saved', noteSaveFailed: 'Local storage is full; the newest change may not be saved',
        notLoaded: 'not loaded', noUsage: 'no usage recorded',
        notLoadedHint: 'Earlier turns are outside the loaded event window — press ↑ above', notLoadedTurnHint: 'turn not loaded',
        summary: 'Dialogue turn summary', sDialogue: 'Dialogue', sCode: 'Code', sArgs: 'Arguments', sResult: 'Result',
        myInput: 'My input', thinking: 'Thinking', reply: 'Reply', detail: 'Details', collapse: 'Collapse',
        synNote: '(auto synopsis from this turn\'s steps and tool calls — not a translation; Details shows the original)',
        synSteps: '{n} steps, {c} tool calls', synFiles: '{n} files touched', synErrors: '{n} errors',
        synTools: 'Main actions: {list}', synTokens: '{i} in / {o} out',
        share: 'Share', cumulative: 'Cumulative',
        collapseHint: 'Hold the left button and drag down to collapse everything',
        fileImpactShort: 'Files changed', compare: 'Project usage',
        trail: 'Trajectory', trailRows: 'records', panes: 'Panes',
        autoSummary: 'auto summary', export: 'Export', exportPpt: 'Export PPT', exportPdf: 'Export PDF',
        // 总结: compress the conversation into a themed deck (theme → symptom/cause/fix/result).
        summaryButton: 'Summarise', summaryTitle: 'Conversation summary', summaryHint: 'Compress this conversation into a one-theme-per-slide deck',
        summaryCoverLine: '{turns} turns, grouped into {themes} themes',
        summaryField: 'Field', summaryValue: 'Content', summaryTheme: 'Theme',
        summaryEffect: 'Symptom', summaryCause: 'Root cause', summaryFix: 'Solution', summaryResult: 'Result',
        summaryKeyValues: 'Key figures', summaryNumbers: 'Figures', summaryTotals: 'Totals',
        summaryMetric: 'Metric', summaryDuration: 'Duration',
        summaryNone: 'This session has no turns to summarise yet.', summaryMaking: 'Summarising…', summaryDone: 'Summary deck exported',
        summaryCopy: 'Copy summary', summaryCopyHint: 'Copy the summary as Markdown tables',
        clickTurnHint: 'Pick a turn on the left; its dialogue, code and arguments are summarised here.',
        noChanges: 'No file changes in this turn.', noArgs: 'No tool calls in this turn.', noThinking: 'No thinking text recorded for this turn.',
        changedFilesN: 'files changed', toolCallsN: 'tool calls', sessionTotal: 'Session usage',

        // ---- Daily news ----
        // The console's preset and pane buttons look these up dynamically and had no keys, so
        // they rendered as empty capsules. Restored here alongside the news strings.
        presetTriple: 'Triple', presetDuo: 'Duo', presetFocus: 'Focus', presetQuad: 'Quad',
        paneTree: 'Node tree', paneMid: 'Summary', paneProgress: 'Vault', paneTokens: 'Tokens', paneTrail: 'Trail',
        newsTitle: 'Daily news', newsSubHint: "today's world events · your own keywords",
        newsJustNow: 'just now', newsMin: ' min ago', newsHour: ' h ago', newsDayAge: ' d ago', newsDayUnit: 'd',
        newsRefresh: 'Refresh', newsRefreshing: 'Fetching', newsCount: 'Count', newsRange: 'Window',
        newsDays1: 'Today', newsDays3: '3 days', newsDays7: '7 days',
        newsViewList: 'List', newsViewGrid: 'Grid', newsViewCompact: 'Compact',
        newsTopics: 'Topics & keywords',
        newsTopicsShort: 'Sections',
        newsSurvey: 'Section overview',
        newsOriginal: 'Original article',
        newsOriginalHint: 'Pick a story on the left and its page text appears here.',
        newsParagraphs: 'paras',
        newsNoBody: 'This page exposed no readable body (common with paywalls and non-browser requests); the summary and the original link still work.',
        newsStream: 'Stream', newsDetail: 'Detail',
        newsHot: 'Major events', newsHotHint: 'outlets', newsRelated: 'Also covering this',
        newsAddTopic: 'New topic', newsTopicName: 'Topic name', newsKeywords: 'Keywords', newsAddKeyword: 'Add a keyword, Enter to confirm',
        newsSources: 'Sources', newsLang: 'Language', newsDeleteTopic: 'Delete topic',
        newsEditTopic: 'Edit this topic', newsDone: 'Done', newsNoKeywords: 'no keywords yet',
        newsOpen: 'Open article', newsCopyLink: 'Copy link', newsCopied: 'Copied',
        newsSearchLink: 'Search this headline', newsEnriching: 'Reading the article…',
        newsSourceStatus: 'Source status', newsCoverage: 'coverage', newsItems: 'items', newsFailed: 'failed',
        newsEmpty: 'No news yet. Hit Refresh to fetch.',
        newsEmptyTopic: 'Nothing in this topic yet: add a keyword or tick a source.',
        newsLoading: 'Fetching world news…', newsLoadingHint: 'The first fetch reaches a dozen sources; 3–8 s is normal.',
        newsStale: 'Some sources failed; showing the last cached copy.', newsErrors: 'sources failed',
        newsArchive: 'kept', newsArchiveHint: 'up to 7 days',
        newsRetention: 'kept for 7 days max', newsCountHint: '10–100, drag to change',
        newsUnread: 'unread', newsAll: 'All', newsTracked: 'sources', newsTopicsN: 'topics',
        newsDetailHint: 'Pick a story on the left; its detail and related coverage appear here.',
        newsSelectTopic: 'Choose a topic',
        newsNoCatalog: 'Source catalog unavailable; using the built-in list.',
        newsFetchFailed: 'Fetch failed',
        newsRestartHint: 'The Host half is not live yet: news fetching lives on the /workbench-news route, and Host code is loaded once when DSH starts. Restart DSH once and the stories will appear here. (The browser half has already hot-reloaded, which is why the module opens at all.)',
        newsTimedOut: 'Some sources are still loading; showing what arrived',
        newsPending: 'sources still running',
        newsProxyHint: 'Some international sources are unreachable. If this machine needs a proxy for Google / BBC, add https_proxy=http://127.0.0.1:PORT to ~/.dsh/.env and restart DSH; the domestic sources in the same fetch are fine.',
        newsTranslateToggle: 'Translate',
        newsTranslateHint: 'Show a Chinese translation under English headlines (machine translation, cached locally; press T)',
        newsTranslateOne: 'Translate this story',
        newsTranslateStory: 'Translate this story',
        newsTranslateShort: 'ZH',
        newsTranslating: 'Translating…',
        newsTranslatedTag: 'ZH',
        newsTranslatedCount: 'translated',
        newsTranslateFailed: 'Translation service: ',
        newsTickerLabel: 'Latest',
        newsDragHint: 'Drag to resize, double-click to reset',

        // ---- Stock market ----
        kindStock: 'Stock market',
        stockTitle: 'Stock market', stockSubHint: "the latest quote from every market · pick what you watch",
        stockRefresh: 'Refresh', stockRefreshing: 'Refreshing',
        stockUpdated: 'updated', stockJustNow: 'just now', stockMinAgo: ' min ago', stockHourAgo: ' h ago',
        stockStale: 'Stale data', stockStaleHint: 'These are the last quotes we fetched, not current prices — hit Refresh.',
        stockSessionOpen: 'open', stockSessionClosed: 'closed', stockSessionUnknown: 'hours unknown',
        stockFallbackTag: 'fallback', stockStaleRow: 'stale', stockFallbackHint: 'answered by the fallback source, so there is no intraday shape',
        stockEmpty: 'No quotes yet. Hit Refresh to fetch.',
        stockLoading: 'Fetching world markets…', stockLoadingHint: 'The first fetch reaches a dozen markets; 2–5 s is normal.',
        stockMarkets: 'Markets', stockSelectedN: 'markets', stockRegionAll: 'All',
        stockEditMarkets: 'Markets to show', stockDone: 'Done',
        stockMinHint: 'pick at least 4 markets', stockPickHint: 'click to add or remove',
        stockViewBoard: 'Board', stockViewTable: 'Table',
        dimLabel: 'Backdrop dim', dimHint: 'Higher values blur and darken the backdrop inside a module',
        stockSortCatalog: 'Catalog order', stockSortChange: 'By change', stockSortPct: 'By change %',
        stockPrice: 'Last', stockChange: 'Change', stockPct: 'Change %', stockPrev: 'Prev close',
        stockDataTime: 'Quote time', stockReadTime: 'read at', stockLocalTime: "exchange's local time",
        stockSparkHint: 'today, 15-minute bars',
        stockFailedN: 'markets failed', stockNoPrice: '—',
        stockFetchFailed: 'Fetch failed',
        stockRestartHint: 'The Host half is not live yet: quoting lives on the /workbench-stocks route, and Host code is loaded once when DSH starts. Restart DSH once and quotes will appear here. (The browser half has already hot-reloaded, which is why the module opens at all.)',
        stockProxyHint: 'Some markets are unreachable: the global indices come from Yahoo, which needs a proxy on this network. Check that your proxy is on (the system proxy, or https_proxy in ~/.dsh/.env) and restart DSH. A-shares / Hong Kong / US have a fallback source and usually still work.',
        stockOfflineHint: 'Not one market could be reached: check this machine\'s network connection.',
        stockDisclaimer: 'Quotes come from public endpoints, may be delayed, and are for reference only — not investment advice.',
        stockViewMarkets: 'Boards', stockViewMembers: 'Constituents',
        stockMarketsTitle: 'Market boards', stockMarketsHint: 'Open any board to see every stock inside it.',
        stockMkBack: 'Boards', stockMkOpen: 'Open constituents',
        stockMkScopeFull: 'Full list', stockMkScopeRank: 'Most active',
        stockMkTotal: 'board of', stockMkShownN: 'stocks, showing', stockMkShown: 'stocks, showing',
        stockMkHintScope: 'full list', stockMkHintRank: 'most active · top 100 by change %',
        stockMkUpdated: 'updated', stockMkSearch: 'Search code or name',
        stockMkSortPct: 'Change %', stockMkSortAmount: 'Turnover', stockMkSortTurnover: 'Turnover rate',
        stockMkSortCap: 'Market cap', stockMkSortPrice: 'Price', stockMkSortCode: 'Code',
        stockMkDirDesc: 'desc', stockMkDirAsc: 'asc',
        stockMkEmpty: 'No matching stock. Try clearing the search.',
        stockMkColCode: 'Code', stockMkColName: 'Name', stockMkColPrice: 'Last',
        stockMkColPct: 'Change', stockMkColAmount: 'Turnover', stockMkColTurnover: 'Turn rate',
        stockMkColPe: 'P/E', stockMkColCap: 'Mkt cap', stockMkColAmp: 'Amplitude',
        stockMkColRange: 'Day range', stockMkRestart: 'The constituents route lives in the Host half; restart DSH once for it to appear.',
      },
    };

    const langStore = {
      value: 'zh',
      listeners: new Set(),
      getSnapshot() { return this.value },
      subscribe(listener) {
        this.listeners.add(listener);
        return () => { this.listeners.delete(listener) };
      },
      set(next) {
        if (next === this.value) return;
        this.value = next;
        for (const listener of [...this.listeners]) { try { listener() } catch { /* a listener's failure is not ours to surface */ } }
      },
    };

    function detectLang(ctx) {
      try {
        const locale = ctx.locale;
        if (!locale) return 'zh';
        const snap = typeof locale.getSnapshot === 'function' ? locale.getSnapshot()
          : typeof locale.getLocale === 'function' ? locale.getLocale() : null;
        const id = snap && (snap.locale || snap.id || snap.current
          || (snap.active && (snap.active.id || snap.active.locale)));
        if (typeof id === 'string' && id) return id.toLowerCase().startsWith('en') ? 'en' : 'zh';
      } catch { /* fall through to the product default */ }
      return 'zh';
    }

    //#endregion

    //#region small utilities

    const EMPTY_LIST = { ids: [], byId: {}, phase: 'empty' };
    const EMPTY_WINDOW = { entries: [], hasMore: false, revision: 0, change: null };
    /** Upper bound for the paced auto-load, so a pathological log cannot page forever. */
    const AUTO_FILL_LIMIT = 6000;
    /** Delay between auto-load batches. Long enough that the UI stays interactive while the
     *  backlog streams in, short enough that the full history is there quickly. */
    const AUTO_FILL_STEP_MS = 180;
    const EMPTY_OBJECT = {};

    function cx() {
      let out = '';
      for (const part of arguments) if (part) out += (out ? ' ' : '') + part;
      return out;
    }

    function safe(fn, fallback) {
      try {
        const value = fn();
        return value === undefined ? fallback : value;
      } catch { return fallback }
    }

    function useStore(source, fallback) {
      const subscribe = useCallback((listener) => {
        if (!source || typeof source.subscribe !== 'function') return () => {};
        return source.subscribe(listener);
      }, [source]);
      const read = useCallback(() => {
        if (!source || typeof source.getSnapshot !== 'function') return fallback;
        try {
          const value = source.getSnapshot();
          return value === undefined ? fallback : value;
        } catch { return fallback }
      }, [source, fallback]);
      return useSyncExternalStore(subscribe, read, read);
    }

    /**
     * One-shot entrance for the geometry: everything measurable starts at zero and settles
     * into place a frame later, so the CSS transition has something to move from.
     */
    function useSettle(delay) {
      const [settled, setSettled] = useState(false);
      useEffect(() => {
        let raf = 0;
        const timer = setTimeout(() => {
          if (typeof requestAnimationFrame === 'function') raf = requestAnimationFrame(() => setSettled(true));
          else setSettled(true);
        }, delay || 0);
        return () => {
          clearTimeout(timer);
          if (raf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(raf);
        };
      }, []);
      return settled;
    }

    function formatCount(value) {
      if (typeof value !== 'number' || !isFinite(value)) return '—';
      const n = Math.abs(value);
      if (n >= 1e9) return (value / 1e9).toFixed(2) + 'B';
      if (n >= 1e6) return (value / 1e6).toFixed(2) + 'M';
      if (n >= 1e4) return (value / 1e3).toFixed(1) + 'K';
      if (n >= 1e3) return String(Math.round(value));
      return String(Math.round(value));
    }

    function formatDuration(ms) {
      if (typeof ms !== 'number' || !isFinite(ms) || ms < 0) return '—';
      if (ms < 1000) return Math.round(ms) + ' ms';
      const s = ms / 1000;
      if (s < 60) return s.toFixed(s < 10 ? 1 : 0) + ' s';
      const m = Math.floor(s / 60);
      return m + ' m ' + Math.round(s - m * 60) + ' s';
    }

    /** Concatenate the text of one content-block kind ('text', 'reasoning', …). */
    function blocksOfKind(blocks, kind) {
      if (!Array.isArray(blocks)) return '';
      let out = '';
      for (const block of blocks) {
        if (!block || typeof block !== 'object') continue;
        if (block.type === kind && typeof block.text === 'string') out += block.text;
      }
      return out;
    }

    function textOf(blocks) {
      return blocksOfKind(blocks, 'text');
    }

    function reasoningOf(blocks) {
      return blocksOfKind(blocks, 'reasoning');
    }

    function firstLine(value, limit) {
      const raw = typeof value === 'string' ? value : '';
      const line = raw.replace(/\s+/g, ' ').trim();
      if (line.length <= limit) return line;
      return line.slice(0, Math.max(0, limit - 1)) + '…';
    }

    function parseArgs(raw) {
      if (raw === undefined || raw === null) return null;
      if (typeof raw === 'object') return raw;
      if (typeof raw !== 'string') return null;
      const trimmed = raw.trim();
      if (!trimmed) return null;
      try {
        const value = JSON.parse(trimmed);
        return value && typeof value === 'object' ? value : null;
      } catch { return null }
    }

    function baseName(path) {
      if (typeof path !== 'string' || !path) return '';
      const parts = path.split(/[\\/]/);
      return parts[parts.length - 1] || path;
    }

    function fileRefFrom(args) {
      if (!args || typeof args !== 'object') return null;
      const path = args.file_path || args.filePath || args.path || args.filename || args.notebook_path;
      if (typeof path !== 'string' || !path) return null;
      return path;
    }

    //#endregion

    //#region event folding

    const CHANGE_TOOLS = new Set(['write', 'edit', 'multi_edit', 'str_replace_editor', 'notebook_edit', 'apply_patch', 'create_file', 'fs_write']);
    const READ_TOOLS = new Set(['read', 'read_image', 'fs_read', 'view']);
    const SHELL_TOOLS = new Set(['pwsh', 'bash', 'shell', 'terminal', 'native_command', 'pwsh_persistent', 'bash_persistent']);

    /**
     * Fold the Client's Session event window into the tree, per-turn progress and
     * per-turn usage the three panes render. Pure and total: unknown event types
     * are ignored and malformed payloads degrade to less detail, never a throw.
     */
    function foldWindow(entries) {
      const turns = [];
      const byTurn = new Map();
      const callIndex = new Map();
      const files = new Map();
      let contextWindow;
      let model;
      let provider;
      let sessionStartedAt;
      let firstUserText = '';
      // Real prompts carry `source.kind === 'user'`. Everything else on the user/message
      // channel (runtime-context snapshots, goal rounds, subagent notices, approval
      // policy changes, checkpoints) is injected and must not become a "turn".
      // A prompt also arrives *before* its `turn/start`, so it waits in this queue.
      const pendingPrompts = [];
      /** Every real prompt in arrival order, used for positional matching below. */
      const prompts = [];
      let firstEventType;
      let laggingPrompts = false;
      let firstTurnStartAt;
      let firstPromptAt;
      let eventIndex = 0;

      const ensureTurn = (number, time) => {
        const key = typeof number === 'number' ? number : 0;
        let turn = byTurn.get(key);
        if (!turn) {
          turn = {
            turn: key, startTime: time, endTime: undefined, reason: undefined,
            prompt: '', steps: 0, nodes: [], calls: 0, errors: 0,
            usage: null, files: new Set(), duration: undefined,
            prompts: [], reasoning: '', reply: '', narration: '', usageByStep: {}, sawTimeline: false,
          };
          byTurn.set(key, turn);
          turns.push(turn);
        }
        if (typeof time === 'number' && (turn.startTime === undefined || time < turn.startTime)) turn.startTime = time;
        return turn;
      };

      /** Write a prompt onto a turn, creating or refreshing its prompt node. */
      const applyPrompt = (turn, text) => {
        if (!text) return;
        turn.prompts = [text];
        turn.prompt = text;
        const existing = turn.nodes.find((node) => node.kind === 'prompt');
        if (existing) {
          existing.text = text;
          existing.title = firstLine(text, 96);
        } else {
          turn.nodes.unshift({ id: 't' + turn.turn + '-prompt', kind: 'prompt', title: firstLine(text, 96), text, time: undefined });
        }
      };

      const attachPrompt = (turn, text) => {
        if (!text) return;
        applyPrompt(turn, text);
      };

      const resolveCall = (callId) => (callId === undefined ? undefined : callIndex.get(callId));

      for (const entry of Array.isArray(entries) ? entries : []) {
        if (!entry || entry.type !== 'event' || !entry.event) continue;
        const event = entry.event;
        const data = event.data;
        if (!data || typeof data !== 'object') continue;
        const time = typeof event.time === 'number' ? event.time : undefined;
        if (sessionStartedAt === undefined && time !== undefined) sessionStartedAt = time;
        if (firstEventType === undefined) firstEventType = event.type;
        eventIndex += 1;
        if (event.type === 'turn/start' && firstTurnStartAt === undefined) firstTurnStartAt = eventIndex;

        switch (event.type) {
          case 'turn/start': {
            const turn = ensureTurn(data.turn, time);
            if (turn.startTime === undefined) turn.startTime = time;
            turn.sawTimeline = true;
            if (pendingPrompts.length) attachPrompt(turn, pendingPrompts.shift());
            break;
          }
          case 'user/message': {
            const kind = (data.source && data.source.kind) || '';
            if (kind !== 'user') break;
            const text = textOf(data.content);
            if (!firstUserText) firstUserText = text;
            prompts.push(text);
            if (firstPromptAt === undefined) firstPromptAt = eventIndex;
            if (typeof data.turn === 'number') {
              applyPrompt(ensureTurn(data.turn, time), text);
              break;
            }
            pendingPrompts.push(text);
            break;
          }
          case 'step/start': {
            const turn = ensureTurn(data.turn, time);
            turn.sawTimeline = true;
            if (typeof data.step === 'number' && data.step > turn.steps) turn.steps = data.step;
            break;
          }
          case 'step/end': {
            const turn = ensureTurn(data.turn, time);
            if (typeof data.step === 'number' && data.step > turn.steps) turn.steps = data.step;
            break;
          }
          case 'assistant/message': {
            const turn = ensureTurn(data.turn, time);
            turn.sawTimeline = true;
            if (typeof data.step === 'number' && data.step > turn.steps) turn.steps = data.step;
            const text = textOf(data.message && data.message.content);
            const reasoning = reasoningOf(data.message && data.message.content);
            if (reasoning) turn.reasoning = turn.reasoning ? turn.reasoning + '\n' + reasoning : reasoning;
            if (text) {
              // Only the LAST assistant message is the answer. Earlier per-step text is the
              // model's work log (frequently in another language) and must never be shown
              // as "the reply".
              if (turn.reply) turn.narration = turn.narration ? turn.narration + '\n' + turn.reply : turn.reply;
              turn.reply = text;
            }
            for (const item of turn.nodes) {
              if (item.kind === 'assistant') item.narration = true;
            }
            const node = {
              id: 't' + turn.turn + '-a' + (typeof data.step === 'number' ? data.step : turn.nodes.length),
              kind: 'assistant', step: data.step, title: firstLine(text, 96) || '(no text)',
              text, reasoning, usage: data.usage || null, time, narration: false,
            };
            turn.nodes.push(node);
            const usage = data.usage;
            if (usage && typeof usage === 'object') {
              // Keyed by step: a retry inside one step replaces its own sample instead
              // of being double counted, exactly like the token-meter projection.
              const step = typeof data.step === 'number' ? data.step : turn.nodes.length;
              turn.usageByStep[step] = {
                inputTokens: Number(usage.inputTokens) || 0,
                outputTokens: Number(usage.outputTokens) || 0,
                cacheReadTokens: Number(usage.cacheReadTokens) || 0,
                cacheWriteTokens: Number(usage.cacheWriteTokens) || 0,
              };
            }
            break;
          }
          case 'tool/call': {
            const turn = ensureTurn(data.turn, time);
            turn.sawTimeline = true;
            if (typeof data.step === 'number' && data.step > turn.steps) turn.steps = data.step;
            const args = parseArgs(data.arguments);
            const raw = typeof data.arguments === 'string' ? data.arguments : '';
            const path = fileRefFrom(args);
            const node = {
              id: 't' + turn.turn + '-c' + (data.callId || turn.nodes.length),
              kind: CHANGE_TOOLS.has(data.name) && path ? 'file' : 'tool',
              step: data.step, callId: data.callId, name: data.name,
              args, rawArgs: raw, path: path || undefined,
              title: path ? baseName(path) : (data.name || 'tool'),
              subtitle: path ? path : firstLine(raw, 90),
              status: 'ok', error: null, resultText: '', meta: undefined, time,
            };
            turn.calls += 1;
            turn.nodes.push(node);
            if (data.callId !== undefined) callIndex.set(data.callId, node);
            if (node.kind === 'file' && path) {
              const record = files.get(path) || { path, adds: 0, dels: 0, ops: 0, nodes: [] };
              record.ops += 1;
              record.nodes.push(node.id);
              const content = args && (args.content || args.new_string || args.new_str);
              const removed = args && (args.old_string || args.old_str);
              if (typeof content === 'string') record.adds += content.split('\n').length;
              if (typeof removed === 'string') record.dels += removed.split('\n').length;
              files.set(path, record);
              turn.files.add(path);
            }
            break;
          }
          case 'tool/result': {
            const callId = data.message && data.message.toolCallId ? data.message.toolCallId : data.callId;
            const node = resolveCall(callId);
            const body = data.message && data.message.content ? textOf(data.message.content) : '';
            const failed = Boolean(data.error) || Boolean(data.message && data.message.isError);
            if (node) {
              node.status = failed ? 'error' : 'ok';
              node.error = data.error || null;
              node.resultText = body || '';
              node.meta = data.meta;
            }
            const turn = ensureTurn(data.turn, time);
            if (failed) turn.errors += 1;
            break;
          }
          case 'turn/end': {
            const turn = ensureTurn(data.turn, time);
            turn.sawTimeline = true;
            turn.endTime = time;
            turn.reason = data.reason;
            break;
          }
          case 'request/context': {
            if (typeof data.contextWindow === 'number') contextWindow = data.contextWindow;
            if (typeof data.model === 'string') model = data.model;
            if (typeof data.provider === 'string') provider = data.provider;
            break;
          }
          default:
            break;
        }
      }

      let steps = 0;
      let calls = 0;
      let errors = 0;
      let totals = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
      // The loaded window can present a rebased replacement, so order turns by number
      // rather than by first sighting.
      // Prompts whose `turn/start` never made it into the window still get their own row,
      // so the numbering below stays "1 2 3 4 …" for every prompt we can see.
      // Does a turn open before the message that triggered it is appended? That ordering
      // shift decides whether prompts are matched positionally or by arrival.
      laggingPrompts = firstTurnStartAt !== undefined && firstPromptAt !== undefined && firstTurnStartAt < firstPromptAt;
      if (!laggingPrompts) {
        while (pendingPrompts.length) {
          const nextNumber = turns.reduce((max, turn) => Math.max(max, turn.turn), 0) + 1;
          attachPrompt(ensureTurn(nextNumber, undefined), pendingPrompts.shift());
        }
      }

      // Per-turn usage = sum over steps; within a step the last sample wins (`usageByStep`).
      for (const turn of turns) {
        const stepsUsed = Object.keys(turn.usageByStep);
        if (stepsUsed.length === 0) { turn.usage = null; continue }
        let sum = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
        for (const key of stepsUsed) {
          const bucket = turn.usageByStep[key];
          sum = {
            inputTokens: sum.inputTokens + bucket.inputTokens,
            outputTokens: sum.outputTokens + bucket.outputTokens,
            cacheReadTokens: sum.cacheReadTokens + bucket.cacheReadTokens,
            cacheWriteTokens: sum.cacheWriteTokens + bucket.cacheWriteTokens,
          };
        }
        turn.usage = Object.assign(sum, { samples: stepsUsed.length });
      }

      turns.sort((left, right) => left.turn - right.turn);

      // Some logs open a turn before appending the message that triggered it (the first
      // event is a turn/start). Then arrival order is off by one and prompts have to be
      // matched positionally: the k-th prompt belongs to the k-th turn.
      if (laggingPrompts && prompts.length) {
        for (let index = 0; index < prompts.length; index += 1) {
          if (index < turns.length) applyPrompt(turns[index], prompts[index]);
          else {
            const nextNumber = turns.reduce((max, turn) => Math.max(max, turn.turn), 0) + 1;
            attachPrompt(ensureTurn(nextNumber, undefined), prompts[index]);
          }
        }
        turns.sort((left, right) => left.turn - right.turn);
      }

      // Display numbering is sequential over what the window actually contains: the user
      // reads turns as "1 2 3 4 …", not as the wire turn ids. `turn.turn` stays the id.
      turns.forEach((turn, index) => { turn.index = index + 1 });
      for (const turn of turns) {
        steps += turn.steps;
        calls += turn.calls;
        errors += turn.errors;
        if (typeof turn.startTime === 'number' && typeof turn.endTime === 'number') {
          turn.duration = turn.endTime - turn.startTime;
        }
        if (turn.usage) {
          totals = {
            inputTokens: totals.inputTokens + turn.usage.inputTokens,
            outputTokens: totals.outputTokens + turn.usage.outputTokens,
            cacheReadTokens: totals.cacheReadTokens + turn.usage.cacheReadTokens,
            cacheWriteTokens: totals.cacheWriteTokens + turn.usage.cacheWriteTokens,
          };
        }
      }

      return {
        turns, files: [...files.values()], contextWindow, model, provider,
        sessionStartedAt, firstUserText,
        summary: { turns: turns.length, steps, calls, errors, files: files.size, totals },
      };
    }

    const URL_RE = /https?:\/\/[^\s"'<>)\]}\\]+/g;

    /**
     * Pull cited URLs out of what the tools actually returned, so the research
     * workbench lists real sources rather than a hand-maintained list.
     */
    function collectSources(turns) {
      const out = [];
      const seen = new Set();
      for (const turn of turns) {
        for (const node of turn.nodes) {
          const text = node.resultText || (SHELL_TOOLS.has(node.name) ? '' : '');
          if (!text) continue;
          URL_RE.lastIndex = 0;
          const matches = text.match(URL_RE);
          if (!matches) continue;
          const snippet = firstLine(text.replace(/\s+/g, ' '), 220);
          for (const match of matches) {
            const clean = match.replace(/[.,;:]+$/, '');
            if (clean.length < 12 || seen.has(clean)) continue;
            seen.add(clean);
            out.push({
              url: clean,
              host: safe(() => new URL(clean).host, clean),
              turn: turn.turn,
              step: node.step,
              tool: node.name,
              snippet,
            });
            if (out.length >= 200) return out;
          }
        }
      }
      return out;
    }

    //#endregion

    //#region code highlighting

    const KEYWORDS = new Set([
      'abstract', 'as', 'async', 'await', 'break', 'case', 'catch', 'class', 'const', 'continue', 'def', 'default',
      'delete', 'do', 'elif', 'else', 'enum', 'except', 'export', 'extends', 'false', 'finally', 'for', 'from',
      'func', 'function', 'if', 'import', 'in', 'instanceof', 'interface', 'is', 'lambda', 'let', 'new', 'None',
      'null', 'of', 'package', 'pass', 'private', 'protected', 'public', 'raise', 'return', 'self', 'static',
      'super', 'switch', 'this', 'throw', 'true', 'try', 'type', 'typeof', 'undefined', 'var', 'void', 'while',
      'with', 'yield', 'and', 'or', 'not', 'elif', 'struct', 'impl', 'fn', 'pub', 'mut', 'use', 'match',
    ]);

    const TOKEN_RE = /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)|(\/\/[^\n]*|#[^\n]*|\/\*[\s\S]*?\*\/)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_$][A-Za-z0-9_$]*)/g;

    /** Tokenize one line into {text, tone} spans; the caller renders them escaped by React. */
    function tokenize(line) {
      const spans = [];
      let last = 0;
      TOKEN_RE.lastIndex = 0;
      let match;
      while ((match = TOKEN_RE.exec(line)) !== null) {
        if (match.index > last) spans.push({ text: line.slice(last, match.index), tone: '' });
        if (match[1] !== undefined) spans.push({ text: match[1], tone: 's' });
        else if (match[2] !== undefined) spans.push({ text: match[2], tone: 'c' });
        else if (match[3] !== undefined) spans.push({ text: match[3], tone: 'n' });
        else if (match[4] !== undefined) spans.push({ text: match[4], tone: KEYWORDS.has(match[4]) ? 'k' : '' });
        else spans.push({ text: match[0], tone: '' });
        last = match.index + match[0].length;
      }
      if (last < line.length) spans.push({ text: line.slice(last), tone: '' });
      return spans;
    }

    function CodeBlock({ text, diff, startLine }) {
      const source = typeof text === 'string' ? text : '';
      const lines = source.length > 200000 ? source.slice(0, 200000).split('\n') : source.split('\n');
      const rows = [];
      let lineNumber = typeof startLine === 'number' ? startLine : 1;
      for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];
        let tone = '';
        if (diff === 'add') tone = 'wsb-diffAdd';
        else if (diff === 'del') tone = 'wsb-diffDel';
        const spans = tokenize(line);
        rows.push(h('div', { key: 'l' + index, className: cx('wsb-codeRow', tone) },
          h('span', { className: 'wsb-ln' }, String(lineNumber)),
          h('span', { className: 'wsb-src' },
            spans.length === 0 ? ' ' : spans.map((span, spanIndex) => (span.tone
              ? h('span', { key: spanIndex, className: 'wsb-tok-' + span.tone }, span.text)
              : span.text)))));
        lineNumber += 1;
      }
      return h('div', { className: 'wsb-code' }, rows);
    }

    //#endregion

    //#region persistence + media

    const STORAGE_KEY = 'dsh-workbench.v3';
    const LEGACY_KEYS = ['dsh-workbench.v2', 'dsh-workbench.v1'];
    const NOTES_KEY = 'dsh-workbench.v3.notes';
    const LEGACY_NOTES_KEY = 'dsh-workbench.v2.notes';
    const MEDIA_DB = 'dsh-workbench-media';
    /** Same-origin Host route that streams a local media file by path. */
    const MEDIA_ROUTE = '/workbench-media';
    const MEDIA_STORE = 'media';

    const MODULE_ACCENTS = ['#7db8ff', '#a78bfa', '#34d399', '#fbbf24', '#f472b6', '#22d3ee'];

    /**
     * Colour schemes. One palette drives everything the plugin paints: the aurora
     * background blobs, card icons, tree glyphs, timeline bars, gauges and the
     * active edge highlight. Coupling them keeps every combination coherent.
     */
    const PALETTES = {
      aurora: { name: '极光', c1: '#5aa9ff', c2: '#7c5cff', c3: '#3ddc97' },
      ocean: { name: '深海', c1: '#2bb3d4', c2: '#2f6df6', c3: '#48e0c0' },
      sunset: { name: '落日', c1: '#ff8a5c', c2: '#ff5c8a', c3: '#ffd166' },
      forest: { name: '森林', c1: '#4ade80', c2: '#0ea5e9', c3: '#a3e635' },
      candy: { name: '糖果', c1: '#f472b6', c2: '#a78bfa', c3: '#22d3ee' },
      ember: { name: '熔岩', c1: '#fb923c', c2: '#ef4444', c3: '#facc15' },
      slate: { name: '石墨', c1: '#94a3b8', c2: '#64748b', c3: '#cbd5e1' },
    };

    /** Frosted-glass recipes: how much surface tint sits on top of the blur. */
    const GLASS_SCHEMES = {
      thin: { name: '薄雾', alpha: 10, blur: 16 },
      regular: { name: '柔光', alpha: 18, blur: 8 },
      thick: { name: '曲面', alpha: 14, blur: 42 },
      solid: { name: '实心', alpha: 88, blur: 0 },
    };

    const CARD_SHAPES = {
      rounded: { name: '圆角', radius: 20 },
      large: { name: '大圆角', radius: 28 },
      small: { name: '小圆角', radius: 12 },
      sharp: { name: '直角', radius: 5 },
      pill: { name: '胶囊', radius: 34 },
    };

    /**
     * Tile geometry, independent of the corner radius above: a square tile is the
     * classic home-screen widget, a rectangle gives the description more room.
     */
    /** Legacy named ratios, kept only so an existing install migrates to a slider value. */
    const CARD_FORMS = {
      square: { name: '正方形', ratio: '1' },
      rectangle: { name: '长方形', ratio: '4 / 3' },
    };

    /** Surface patterns available under 桌面设置 → 表面效果 → 网格效果. */
    const GRID_SHAPES = {
      none: '无', grid: '网格', dots: '点阵', diagonal: '斜纹',
    };

    /** Widget-like tile sizes for the desktop arrangement. */
    const MODULE_SIZES = {
      small: '小', medium: '中', large: '大', wide: '宽',
    };

    /** Card arrangements: the grid centres whatever fits, so there is nothing to pick. */

    /** 英文缩写: 中文界面悬停时显示, 与自定义名字无关(由 kind 决定). */
    const MODULE_ABBR = {
      game: 'DEV', news: 'NEWS', notebook: 'NOTES', research: 'LAB', stock: 'MKT', blank: 'BLANK',
    };

    /** 便签 colours: a pastel body with an ink dark enough to read on it. */
    const STICKY_COLORS = {
      amber: { name: '琥珀', bg: '#f6d97a', ink: '#3d3010' },
      rose: { name: '玫瑰', bg: '#f6b6c4', ink: '#421a24' },
      sky: { name: '天空', bg: '#a8cdf0', ink: '#122b40' },
      mint: { name: '薄荷', bg: '#a8dfc6', ink: '#0f3225' },
      violet: { name: '紫罗兰', bg: '#c8b5ee', ink: '#2a1a46' },
      slate: { name: '石墨', bg: '#ccd4de', ink: '#1a1f28' },
    };

    /** Curated remote backgrounds; an unreachable host degrades to the aurora mesh. */
    const NETWORK_BACKGROUNDS = [
      'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1920&q=80',
      'https://images.unsplash.com/photo-1500375592092-40eb2168fd21?w=1920&q=80',
      'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=1920&q=80',
      'https://images.unsplash.com/photo-1419242902214-272b3f66ee7a?w=1920&q=80',
      'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=1920&q=80',
      'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=1920&q=80',
    ];

    //#region 每日新闻 settings

    /** Same-origin Host route that does the crawling (see news.js). */
    const NEWS_ROUTE = '/workbench-news';

    /** The window the module promises to keep. The view window is 1–7; retention is always 7. */
    const NEWS_KEEP_DAYS = 7;

    /** Hard bound on the local archive. The Host returns up to `count` items *per topic*, so
     *  twelve topics of a hundred is the real ceiling; this keeps even that inside ~600 KB of
     *  localStorage rather than leaving the bound to chance. */
    const NEWS_ARCHIVE_MAX = 1200;

    /**
     * Bound on the persisted translation cache.
     *
     * Translations are stored on the Client, not only on the Host, because the free
     * machine-translation endpoints are rate-limited: a headline translated once must never cost
     * a request again, across restarts. 1500 headlines is several weeks of reading for one
     * person and about 250 KB of storage.
     */
    const NEWS_TRANSLATION_MAX = 1500;

    /** The count dial's bounds, mirrored from the Host so the UI can clamp without a request. */
    const NEWS_MIN = 10;
    const NEWS_MAX = 100;

    /**
     * How old the archive may be before reopening the module refetches.
     *
     * A daily-news pane has to be current, but "current" does not mean "every time the module is
     * opened": that would hit a dozen sources per click and slow every navigation down. Twenty
     * minutes is the point where a reader would notice the headlines are stale.
     */
    const NEWS_STALE_MS = 20 * 60 * 1000;

    /**
     * How many stories ride the broadcast strip, and how fast it travels.
     *
     * The speed is in **pixels per second**, not a loop duration: a bulletin that takes longer
     * because it carries more news is a bulletin you can still read, whereas a fixed duration
     * makes a long one race. 46 px/s is a shade under a comfortable reading pace for a 12px
     * headline that is itself moving.
     */
    const NEWS_TICKER_ITEMS = 14;
    const NEWS_TICKER_PPS = 46;

    /** Outlets that must carry a story before it may be *labelled* 大事件. */
    const NEWS_HOT_MIN = 3;

    /** Header lang values the Host understands. */
    const NEWS_LANGS = { zh: '中文', tw: '繁體', en: 'English', ja: '日本語' };

    /**
     * Topics used before the Host catalog has ever been read, and the fallback if it never is.
     *
     * These are deliberately the same topics the Host ships, so a first run with no network
     * still shows a usable rail rather than an empty one. The Host's copy is authoritative and
     * replaces this one on the first successful `op=catalog` — see `topicsFromCatalog`.
     */
    const NEWS_SEED_TOPICS = [
      { id: 'global', name: '全球大事件', accent: '#7db8ff', lang: 'zh', kw: [], feeds: ['gnews-top-zh', 'gnews-top-en', 'bbc-world', 'npr-world', 'aljazeera'] },
      { id: 'ai', name: 'AI 领域', accent: '#a78bfa', lang: 'zh', kw: ['人工智能', '大模型', 'AI 芯片'], feeds: ['hn', 'techcrunch', 'ars', 'ithome'] },
      { id: 'games', name: '游戏领域', accent: '#34d399', lang: 'zh', kw: ['游戏', '主机', '电子游戏'], feeds: ['ign', 'eurogamer', 'gamesindustry'] },
      { id: 'tech', name: '科技前沿', accent: '#22d3ee', lang: 'zh', kw: ['科技', '半导体', '芯片'], feeds: ['verge', 'wired', 'solidot'] },
      { id: 'science', name: '科学发现', accent: '#fbbf24', lang: 'zh', kw: ['科学发现', '航天'], feeds: ['sciencedaily', 'nature', 'phys'] },
      { id: 'business', name: '财经市场', accent: '#f472b6', lang: 'zh', kw: ['股市', '经济'], feeds: ['wsj-markets', 'marketwatch', 'cnbc-finance', '36kr'] },
    ];

    /**
     * The source catalog, mirrored for offline rendering of the source toggles.
     * `id`/`label`/`group` are what the picker shows; the Host re-validates every id, so a
     * stale or invented entry here cannot make it fetch something unexpected.
     */
    const NEWS_SEED_FEEDS = [
      { id: 'gnews-top-zh', label: 'Google 新闻 · 中文头条', group: '全球' },
      { id: 'gnews-top-en', label: 'Google News · Top stories', group: '全球' },
      { id: 'bbc-world', label: 'BBC World', group: '全球' },
      { id: 'npr-world', label: 'NPR World', group: '全球' },
      { id: 'aljazeera', label: 'Al Jazeera', group: '全球' },
      { id: 'bbc-sport', label: 'BBC Sport', group: '全球' },
      { id: 'hn', label: 'Hacker News 头版', group: '科技' },
      { id: 'techcrunch', label: 'TechCrunch', group: '科技' },
      { id: 'ars', label: 'Ars Technica', group: '科技' },
      { id: 'verge', label: 'The Verge', group: '科技' },
      { id: 'wired', label: 'WIRED', group: '科技' },
      { id: 'ithome', label: 'IT之家', group: '科技' },
      { id: 'solidot', label: 'Solidot 奇客', group: '科技' },
      { id: 'cnbeta', label: 'cnBeta', group: '科技' },
      { id: 'sciencedaily', label: 'ScienceDaily', group: '科学' },
      { id: 'nature', label: 'Nature', group: '科学' },
      { id: 'phys', label: 'Phys.org', group: '科学' },
      { id: 'ign', label: 'IGN', group: '游戏' },
      { id: 'eurogamer', label: 'Eurogamer', group: '游戏' },
      { id: 'gamesindustry', label: 'GamesIndustry.biz', group: '游戏' },
      { id: 'wsj-markets', label: 'WSJ Markets', group: '财经' },
      { id: 'marketwatch', label: 'MarketWatch', group: '财经' },
      { id: 'cnbc-finance', label: 'CNBC Finance', group: '财经' },
      { id: 'ft', label: 'Financial Times', group: '财经' },
      { id: '36kr', label: '36氪', group: '财经' },
    ];

    /** The palette new topics cycle through, so a freshly added topic is never grey. */
    const NEWS_TOPIC_ACCENTS = ['#7db8ff', '#a78bfa', '#34d399', '#fbbf24', '#f472b6', '#22d3ee', '#fb923c'];

    function defaultNewsSettings() {
      return {
        topics: NEWS_SEED_TOPICS.map((topic) => Object.assign({}, topic, { kw: topic.kw.slice(), feeds: topic.feeds.slice() })),
        activeId: 'global',
        // False until the Host's shipped topics have been adopted. Any edit the user makes to a
        // topic (or adding/deleting one) flips it, so their work always wins over the defaults.
        // Without this the rail was stuck on the four seed topics forever: the catalog request
        // refreshed the *source labels* but never the topics, so 科学发现 and 财经市场 simply did
        // not exist and the seeded topics carried thinner source lists than the Host ships.
        topicsFromCatalog: false,
        count: 40,
        days: 7,
        view: 'list',
        // 中文对照 on by default: a reader who cannot read the English will not go hunting for a
        // switch to fix that, and the translation is cached so the cost is one request per story
        // ever, not per view.
        translate: true,
        // `original text → translation`, persisted so a rate-limited endpoint only ever answers
        // for a headline once. Keyed by the text rather than by the item id, so the same wire
        // story arriving from two topics shares one translation.
        translated: {},
        // Pane widths as shares of the row, summing to 1. Unit fractions rather than the raw
        // flex ratios because the drag arithmetic converts a pointer position into a share:
        // keeping the stored form normalised means there is exactly one representation, and it
        // is the one a seam can be compared against.
        // Two panes: the 速览 front page, and the 原文 reading column. The topic switcher is a
        // horizontal nav bar above both, so the rail no longer takes a share of the width.
        cols: [0.66, 0.34],
        // The source catalog for the picker. Replaced by the Host's own catalog on the first
        // successful `op=catalog`, and kept afterwards so the toggles still render offline.
        feeds: NEWS_SEED_FEEDS.map((feed) => Object.assign({}, feed)),
        // The local copy of what has been fetched. This is what makes the pane survive a
        // restart, a topic switch and an offline refresh.
        archive: [],
        seen: {},
        lastFetchAt: 0,
        catalogAt: 0,
      };
    }

    /** Everything the Host route accepts about one topic; kept small because it is the body. */
    function topicPayload(topic) {
      return {
        id: topic.id,
        name: topic.name,
        accent: topic.accent,
        lang: topic.lang,
        kw: topic.kw,
        feeds: topic.feeds,
      };
    }

    /** What the rail shows before any fetch has happened. */
    function newsModuleSeed(catalog) {
      const news = defaultNewsSettings();
      if (catalog && Array.isArray(catalog.feeds) && catalog.feeds.length) {
        news.feeds = catalog.feeds;
      }
      if (catalog && Array.isArray(catalog.defaults) && catalog.defaults.length) {
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
     * copy is authoritative and replaces this one on the first successful `op=catalog`.
     *
     * `fallback` is published because it is the difference between an empty row and a number
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

    /**
     * The readings of the same data.
     *
     * `board` / `table` are the two shapes of "the indices I selected". `markets` is a different
     * question —「哪些市场可以点进去」—— and opening one of its cards replaces the whole board
     * with that board's constituent stocks (see {@link StockMarkets} / {@link StockMembers}).
     */
    const STOCK_VIEWS = ['board', 'table', 'markets'];
    /** Orderings the board offers. `change` is the "who is moving today" reading. */
    const STOCK_SORTS = ['catalog', 'change', 'pct'];

    function defaultStockSettings() {
      return {
        markets: STOCK_SEED_DEFAULTS.slice(),
        // 'all' or a region name — the chip row above the board.
        region: 'all',
        view: 'board',
        sort: 'catalog',
        // The catalog for the picker. Replaced by the Host's own on the first successful
        // `op=catalog`, and kept afterwards so the picker still renders with no network.
        catalog: STOCK_SEED_MARKETS.map((market) => Object.assign({}, market)),
        catalogAt: 0,
        lastFetchAt: 0,
        // The last snapshot, kept so reopening the module is instant and so an offline open shows
        // the last known numbers. It is ALWAYS drawn with its own timestamp (see `stockAge`),
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
     * Same discipline as `normalizeNewsSettings`: repair the shape on read, once, so no render
     * path has to defend itself. Everything numeric is clamped and everything free-form is
     * bounded, because this object is read back from `localStorage` and could have been edited
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
      // string where a price belongs would render as `NaN` in the middle of the board.
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

    //#endregion

    /**
     * Object URLs minted in this document, held outside React on purpose: switching
     * panels unmounts the workbench, and a remount must not lose the chosen background.
     * They stay valid for the life of the document, so this is the fast path; IndexedDB
     * is only needed after a real page reload.
     */
    const sessionMediaUrls = new Map();
    /** Last durable-write outcome, surfaced in the desktop panel for diagnosis. */
    let mediaDiagPut = 'pending';

    /**
     * Every mounted workbench view shares one state. Each sidebar module row selects its
     * own `main` key, so more than one WorkbenchApp can be alive at once — without this,
     * a stale instance would save its own copy over a fresher one and silently undo the
     * user's last change (a chosen background, for instance).
     */
    const stateListeners = new Set();
    let lastBroadcastState = '';

    function broadcastState(next) {
      for (const listener of Array.from(stateListeners)) safe(() => listener(next));
    }

    function clamp(value, low, high) {
      const number = Number(value);
      if (!isFinite(number)) return low;
      return number < low ? low : number > high ? high : number;
    }

    function newId(prefix) {
      return prefix + '-' + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
    }

    let mediaDbPromise = null;
    /**
     * One long-lived IndexedDB connection.
     *
     * The previous version opened (and closed) a connection per operation. A write then
     * resolved on `request.onsuccess`, which fires *before* the transaction commits — so
     * `mediaPut` could report success while the data was never readable afterwards. That
     * is exactly the "idbPut=ok / idbGet=miss" failure this store used to show.
     */
    function mediaDb() {
      if (mediaDbPromise) return mediaDbPromise;
      mediaDbPromise = new Promise((resolve, reject) => {
        try {
          if (!window.indexedDB) { reject(new Error('no indexedDB')); return }
          const request = window.indexedDB.open(MEDIA_DB, 1);
          request.onupgradeneeded = () => {
            if (!request.result.objectStoreNames.contains(MEDIA_STORE)) request.result.createObjectStore(MEDIA_STORE);
          };
          request.onsuccess = () => {
            const db = request.result;
            // Another tab upgrading the schema invalidates this connection.
            db.onversionchange = () => { safe(() => db.close()); mediaDbPromise = null };
            db.onclose = () => { mediaDbPromise = null };
            resolve(db);
          };
          request.onerror = () => reject(request.error || new Error('indexedDB open failed'));
          request.onblocked = () => reject(new Error('indexedDB blocked'));
        } catch (error) { reject(error) }
      });
      return mediaDbPromise;
    }

    /**
     * Reads resolve with the record; writes resolve with `true` only once the transaction
     * has COMMITTED, so `mediaPut` can actually be trusted.
     */
    function mediaRun(mode, key, value) {
      return mediaDb().then((db) => new Promise((resolve, reject) => {
        let settled = false;
        const settle = (fn, argument) => { if (!settled) { settled = true; fn(argument) } };
        let transaction;
        try {
          transaction = db.transaction(MEDIA_STORE, mode === 'get' ? 'readonly' : 'readwrite');
        } catch (error) { reject(error); return }
        const store = transaction.objectStore(MEDIA_STORE);
        const request = mode === 'get' ? store.get(key) : mode === 'put' ? store.put(value, key) : store.delete(key);
        request.onsuccess = () => { if (mode === 'get') settle(resolve, request.result) };
        request.onerror = () => settle(reject, request.error);
        transaction.oncomplete = () => settle(resolve, true);
        transaction.onerror = () => settle(reject, transaction.error);
        transaction.onabort = () => settle(reject, transaction.error || new Error('transaction aborted'));
      }));
    }

    function mediaPut(key, blob) { return mediaRun('put', key, blob).catch(() => false) }
    function mediaGet(key) { return mediaRun('get', key).catch(() => undefined) }
    function mediaRemove(key) { return mediaRun('delete', key).catch(() => false) }

        /* ---- 框架笔记: the data shape ----------------------------------------------------------
       The notebook is a mind map, so a module owns ONE tree plus the three choices that turn
       that tree into a picture: which structure, which wire style, which palette. All of it is
       plain JSON on the module, which is why a note map needs no storage layer of its own and
       why the geometry below can be recomputed from the data alone.

       The tree is stored as `module.noteRoot`. v1 called each entry a 笔记 and gave it a
       pressure-ink stroke list plus one reference image; the strokes are carried through
       untouched by `normalizeNoteNode` instead of being deleted. Retiring a feature is not the
       same as destroying somebody's drawing, so the data stays and only the renderer changed. */

    /**
     * The structures the toolbar offers, in the order it shows them.
     *
     * 时间轴 and 鱼骨图 were removed from the toolbar. Their geometry was fixed twice and both
     * times it ended up correct-but-not-wanted: a timeline and a fishbone are *presentations* of a
     * sequence, and this is a free-form map where the tree is whatever the reader drew. Keeping two
     * buttons that place cards in ways the reader did not ask for was worse than not offering them.
     *
     * Their layout functions (`noteLayoutTimeline` / `noteLayoutFish`) and the four strings they
     * needed are deliberately still here: a note saved while they were selectable still carries
     * `noteStyle.layout = 'timeline'`, and `noteStyleOf` falls back to 思维导图 for anything not in
     * this list — so an old note opens as a mind map instead of failing to render.
     */
    const NOTE_LAYOUTS = ['mind', 'logic', 'org', 'tree'];
    /** Wire styles. `curve` is the mind-map default; the other two are for engineering diagrams. */
    const NOTE_BRANCHES = ['curve', 'elbow', 'line'];
    /** Node shapes the inspector offers ('' = follow the theme's own default). */
    const NOTE_SHAPES = ['round', 'rect', 'under'];
    const NOTE_ZOOM_MIN = 0.3;
    const NOTE_ZOOM_MAX = 2.4;
    /** How many edits 撤销 can walk back. Snapshots are small JSON trees, not whole state. */
    const NOTE_HISTORY = 40;

    /**
     * 色调。**表面交给宿主的 token**（毛玻璃、层次、明暗、圆角都跟着桌面设置走），色调只决定
     * **强调色**：中心节点的填充、各层级的色带、选中环，以及分支连线的着色基准。这是刻意的 ——
     * 一张图自带一套纸色，它就和旁边几个界面不是一套东西了（第一版正是这个毛病）。
     */
    const NOTE_THEMES = {
      classic: {
        label: 'noteThemeClassic', rootFg: '#ffffff',
        accent: ['#2f6df6', '#12a150', '#e08700', '#d6336c', '#7048e8', '#0b8fa8'],
      },
      ink: {
        label: 'noteThemeInk', rootFg: '#07111e',
        accent: ['#5aa9ff', '#3ddc97', '#f5b544', '#ff8fb1', '#a78bfa', '#22d3ee'],
      },
      paper: {
        label: 'noteThemePaper', rootFg: '#fbf7ee',
        accent: ['#8a6d3b', '#6b7f3a', '#a2542f', '#4f6d7a', '#7d5a8c', '#b5892f'],
      },
      candy: {
        label: 'noteThemeCandy', rootFg: '#ffffff',
        accent: ['#7b3fe4', '#e8467c', '#f2913d', '#2fa8a0', '#3d7bf2', '#9b5de5'],
      },
    };

    /** A fresh note map's choices. The mind map is the structure people expect first. */
    function defaultNoteStyle() {
      return { layout: 'mind', branch: 'curve', theme: 'classic' };
    }

    /**
     * The camera, remembered per module: reopening a map at 100 % in the corner after you left
     * it zoomed into one branch is the kind of thing that makes a tool feel forgetful. Written
     * when a gesture ends, never per frame.
     */
    function defaultNoteView() {
      return { x: 0, y: 0, zoom: 1, outline: true, inspector: true, fitted: false };
    }

    /** A fresh node. The title starts empty so the renderer can fall back to the language. */
    function defaultNoteNode(title) {
      return {
        id: newId('note'),
        title: typeof title === 'string' ? title : '',
        body: '',
        imageKey: '', imageName: '', imageFit: 'cover', imageHeight: 96,
        color: '', shape: '', collapsed: false,
        // Manual nudge from the computed position. Kept in the data so a dragged map is still
        // dragged tomorrow, and cleared in one go by 整理.
        ox: 0, oy: 0,
        children: [],
      };
    }

    function defaultNoteRoot() { return defaultNoteNode('') }

    /** Depth-first walk of a note tree. */
    function walkNotes(node, depth, visit) {
      if (!node || typeof node !== 'object') return;
      visit(node, depth);
      for (const child of Array.isArray(node.children) ? node.children : []) walkNotes(child, depth + 1, visit);
    }

    function findNote(node, id) {
      if (!node) return null;
      if (node.id === id) return node;
      for (const child of Array.isArray(node.children) ? node.children : []) {
        const hit = findNote(child, id);
        if (hit) return hit;
      }
      return null;
    }

    /** The parent of `id`, or null for the centre and for an id that is not in the tree. */
    function noteParentOf(node, id) {
      for (const child of Array.isArray(node && node.children) ? node.children : []) {
        if (child.id === id) return node;
        const hit = noteParentOf(child, id);
        if (hit) return hit;
      }
      return null;
    }

    function firstNoteId(node) {
      let id = null;
      walkNotes(node, 0, (note) => { if (!id) id = note.id });
      return id;
    }

    /** Append a child and hand it back, so a caller can select the node it just made. */
    function noteAddChild(parent, title) {
      if (!parent) return null;
      if (!Array.isArray(parent.children)) parent.children = [];
      const child = defaultNoteNode(title);
      parent.children.push(child);
      // A node that is being added to cannot stay collapsed, or the new node would be invisible.
      parent.collapsed = false;
      return child;
    }

    /** Remove `id` from the tree; the centre itself is never removable. */
    function removeNote(node, id) {
      if (!node || !Array.isArray(node.children)) return false;
      const index = node.children.findIndex((child) => child.id === id);
      if (index >= 0) { node.children.splice(index, 1); return true }
      return node.children.some((child) => removeNote(child, id));
    }

    /**
     * A tree read back from storage, with every field the renderer relies on present.
     *
     * Storage is shared with every other module and has been written by older builds, so the
     * shape is repaired here once instead of being defended against at each use site.
     */
    function normalizeNoteNode(node) {
      const source = node && typeof node === 'object' ? node : {};
      const out = {
        id: typeof source.id === 'string' && source.id ? source.id : newId('note'),
        title: typeof source.title === 'string' ? source.title : '',
        body: typeof source.body === 'string' ? source.body : '',
        imageKey: typeof source.imageKey === 'string' ? source.imageKey : '',
        imageName: typeof source.imageName === 'string' ? source.imageName : '',
        imageFit: source.imageFit === 'contain' ? 'contain' : 'cover',
        imageHeight: clamp(Number(source.imageHeight) || 96, 56, 240),
        color: typeof source.color === 'string' ? source.color : '',
        shape: NOTE_SHAPES.indexOf(source.shape) >= 0 ? source.shape : '',
        collapsed: source.collapsed === true,
        ox: isFinite(source.ox) ? Number(source.ox) : 0,
        oy: isFinite(source.oy) ? Number(source.oy) : 0,
        children: [],
      };
      // 手写/压感 ink and the reference-image opacity are v1 fields. The ink tool is gone, but
      // the strokes are the one thing here that cannot be retyped, so they are carried as-is.
      if (Array.isArray(source.strokes)) out.strokes = source.strokes;
      if (isFinite(source.imageOpacity)) out.imageOpacity = Number(source.imageOpacity);
      for (const child of Array.isArray(source.children) ? source.children : []) {
        out.children.push(normalizeNoteNode(child));
      }
      return out;
    }

    /** The module's tree, repaired. Always returns a tree, even for a module that has none. */
    function noteTreeOf(module) {
      const source = module && module.noteRoot && typeof module.noteRoot === 'object' ? module.noteRoot : null;
      return source ? normalizeNoteNode(source) : defaultNoteRoot();
    }

    /* ---- 笔记：一个模块下的一叠图 ------------------------------------------------------------
       Until this version a module held exactly ONE tree (`module.noteRoot`), so the left rail could
       only ever show that tree's nodes. The rail is now the note history — every note the reader
       has made, newest first — which needs several trees per module.

       The shape is a list plus a pointer:

           module.noteDocs = [{ id, name, root, created }]      // every note, in creation order
           module.activeNoteId = '<id of the open one>'          // which note the canvas shows

       `noteRoot` is deliberately kept in step with the active note, because it is what the older
       code paths (导出 / 打开 / 新建 / 撤销) still read and write. Two representations of the same
       truth is usually a smell; here it is the migration: a module written by the previous version
       has `noteRoot` and no `noteDocs`, and the check below turns it into a one-note stack on
       first open with nothing lost. */

    /** A stable identity for a note, namespaced so it can never collide with a node id. */
    function newNoteDocId() {
      return newId('note-doc');
    }

    function normalizeNoteDoc(doc) {
      const source = doc && typeof doc === 'object' ? doc : {};
      return {
        id: typeof source.id === 'string' && source.id ? source.id : newNoteDocId(),
        name: typeof source.name === 'string' ? source.name : '',
        root: normalizeNoteNode(source.root),
        created: Number(source.created) || Date.now(),
        // 是否已经离开「空画布」的起步说明。**按笔记记**，不是按模块记：新建一篇空笔记时它必须
        // 重新是 false，否则新笔记会直接跳过起步说明（或者反过来，旧笔记被当成新建的）。
        // 没有这个字段的存档按 true 处理 —— 它要么来自更早的版本（那时模块级标记已经翻过了），
        // 要么来自迁移，两种情况下读者都不是第一次看到空画布。
        started: source.started === undefined ? true : source.started === true,
      };
    }

    /**
     * The note stack of a module, migrated on read.
     *
     * Returns one entry for a module that predates the stack, built from its `noteRoot`, so the
     * reader's existing map becomes the first note of the history rather than disappearing.
     */
    function noteDocsOf(module) {
      const source = module && Array.isArray(module.noteDocs) ? module.noteDocs : null;
      if (source && source.length) return source.map(normalizeNoteDoc);
      return [normalizeNoteDoc({
        name: '',
        root: module && module.noteRoot ? module.noteRoot : defaultNoteRoot(),
        created: Date.now(),
        // 模块级标记是旧版的；它翻过就说明这张图早就开始过了。
        started: !(module && module.noteStarted !== true),
      })];
    }

    /** Which note is open. Falls back to the first when the pointer is missing or stale. */
    function activeNoteDocId(module, docs) {
      const list = docs || noteDocsOf(module);
      const wanted = module && typeof module.activeNoteId === 'string' ? module.activeNoteId : '';
      if (wanted && list.some((doc) => doc.id === wanted)) return wanted;
      return list[0] ? list[0].id : '';
    }

    /**
     * The name a note shows in the history. Derived from its centre node unless the note was
     * given an explicit name — so renaming the centre card in the canvas renames the note in the
     * list, which is what a reader expects and costs no extra state.
     */
    function noteDocLabel(doc, t) {
      const explicit = doc && typeof doc.name === 'string' ? doc.name.trim() : '';
      if (explicit) return explicit;
      const title = doc && doc.root && typeof doc.root.title === 'string' ? doc.root.title.trim() : '';
      return title || t.noteNoteUntitled;
    }

    /** A brand new note: a fresh centre node, named by the reader (or left to the fallback). */
    function makeNoteDoc(name) {
      const root = defaultNoteRoot();
      if (name) root.title = name;
      // `started: true` on purpose. This note exists because the reader pressed 新建笔记, so the
      // "click the empty canvas to begin" explainer would be advice they have already taken.
      return normalizeNoteDoc({
        name: typeof name === 'string' ? name : '', root, created: Date.now(), started: true,
      });
    }

    /**
     * How old a note is, in one short label.
     *
     * Written out by hand rather than via `Intl.RelativeTimeFormat` for the same reason the rest
     * of this file formats dates by hand: the units differ between the two languages, and a
     * formatter that is missing in a wrapped environment would take the whole rail down.
     */
    function noteDocAge(created, t) {
      const then = Number(created);
      if (!isFinite(then) || then <= 0) return '';
      const minutes = Math.floor((Date.now() - then) / 60000);
      if (minutes < 1) return t.noteJustNow;
      if (minutes < 60) return minutes + t.noteMinAgo;
      const hours = Math.floor(minutes / 60);
      if (hours < 24) return hours + t.noteHourAgo;
      const days = Math.floor(hours / 24);
      if (days < 30) return days + t.noteDayAgo;
      const date = new Date(then);
      const pad = (value) => (value < 10 ? '0' + value : String(value));
      return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
    }

    /** Everything the note list needs to draw one row, so the view stays declarative. */    function noteDocMeta(doc) {
      let nodes = 0;
      let images = 0;
      walkNotes(doc.root, 0, (note) => {
        nodes += 1;
        if (note.imageKey) images += 1;
      });
      return { nodes, images, created: doc.created };
    }

    function noteStyleOf(module) {
      const source = module && module.noteStyle && typeof module.noteStyle === 'object' ? module.noteStyle : {};
      return {
        layout: NOTE_LAYOUTS.indexOf(source.layout) >= 0 ? source.layout : 'mind',
        branch: NOTE_BRANCHES.indexOf(source.branch) >= 0 ? source.branch : 'curve',
        theme: NOTE_THEMES[source.theme] ? source.theme : 'classic',
      };
    }

    function noteViewOf(module) {
      const source = module && module.noteView && typeof module.noteView === 'object' ? module.noteView : {};
      return {
        x: isFinite(source.x) ? Number(source.x) : 0,
        y: isFinite(source.y) ? Number(source.y) : 0,
        zoom: clamp(Number(source.zoom) || 1, NOTE_ZOOM_MIN, NOTE_ZOOM_MAX),
        outline: source.outline !== false,
        inspector: source.inspector !== false,
        fitted: source.fitted === true,
      };
    }

    /** Totals for the header line: how many nodes, how many pictures, how deep it goes. */
    function noteTotals(root) {
      let nodes = 0;
      let images = 0;
      let depth = 0;
      walkNotes(root, 0, (note, at) => {
        nodes += 1;
        if (note.imageKey) images += 1;
        if (at > depth) depth = at;
      });
      return { nodes, images, depth };
    }

    /**
     * The accent a node wears: its own colour when it has one, otherwise the palette's colour for
     * its depth. The centre takes the first accent, so it reads as the root of the whole map.
     */
    function noteAccentOf(theme, note, depth) {
      if (note && note.color) return note.color;
      if (!theme || !Array.isArray(theme.accent) || !theme.accent.length) return '#5aa9ff';
      const at = depth === 0 ? 0 : depth % theme.accent.length;
      return theme.accent[at];
    }

    /**
     * 出厂的那台控制台改过名：它原来叫「游戏开发控制台」，也见过手打成「开发控制台」的，
     * 现在统一叫「对话后台」。这也更贴近它实际在做的事 —— 它读的是一段对话，展示的是对话节点树、
     * 逐轮汇总与资源仓库，跟「游戏」没有必然关系。
     *
     * 只升级**名字恰好是旧默认**的那种模块，和上面「综合研究台 → 框架笔记」是同一条规矩：
     * 你自己起过名的（「Godot 主控台」「我的对话台」）一律不碰 —— 那是你的东西，不是出厂默认。
     */
    const CONSOLE_RENAMES = { '游戏开发控制台': '对话后台', '开发控制台': '对话后台' };

    /** 这个模块是不是「那台还没被改过名的控制台」；是就返回新名字，否则返回空串。 */
    function renamedConsole(module) {
      if (!module || module.kind !== 'game') return '';
      const to = CONSOLE_RENAMES[String(module.name || '')];
      return typeof to === 'string' ? to : '';
    }

    function defaultModules() {
      return [
        {
          id: newId('mod'), kind: 'game', name: '对话后台', accent: MODULE_ACCENTS[0], preset: 'triple',
          sessionId: undefined, created: Date.now(),
          desc: 'Godot / 引擎项目的主控台：对话节点树、对话轮次汇总、资源仓库。',
        },
        {
          // Standalone: no session binding, no conversation data — just the notebook.
          id: newId('mod'), kind: 'notebook', name: '框架笔记', accent: MODULE_ACCENTS[2], preset: 'triple',
          sessionId: undefined, created: Date.now() + 1,
          noteRoot: defaultNoteRoot(),
          noteStyle: defaultNoteStyle(),
          noteView: defaultNoteView(),
          desc: '独立的框架笔记：节点式思维导图（思维导图 / 逻辑图 / 组织结构图 / 树形图 / 时间轴 / 鱼骨图），节点里可以写文字、贴图片，不依赖任何对话。',
        },
        {
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
      ];
    }

    function defaultBackground() {
      return {
        // 'aurora' = the built-in flowing light; 'media' = local upload; 'network' = remote image.
        mode: 'aurora',
        auroraId: 'aurora',
        auroraSpeed: 50,
        media: [],
        activeKey: '',
        networkIndex: 0,
        networkUrl: '',
        original: false,
        // Media blur: a photo or a video must look untouched until asked otherwise.
        blur: 0,
        // Aurora surface parameters, all exposed in 桌面设置 → 表面效果.
        edgeBlur: 50, hueSpeed: 50, hueRange: 35, shapeVariance: 40, saturation: 100,
        // Media playback rate in percent (100 = 1×).
        mediaSpeed: 100,
        gridShape: 'none', grid: 0,
        dim: 26, bright: 100,
      };
    }

    function defaultAppearance() {
      return {
        palette: 'aurora', glass: 'regular', shape: 'rounded', size: 'regular',
        form: 'square', layout: 'desktop', consoleAurora: true,
      };
    }

    function defaultAppState() {
      const base = { v: 3, modules: defaultModules(), focusSessionId: undefined, notes: {}, background: defaultBackground() };
      base.appearance = defaultAppearance();
      // Fresh installs already carry the 每日新闻 and 股票市场 modules (see `defaultModules`), so
      // nothing has to be offered; the flags exist so a *deleted* module stays deleted.
      base.newsSeeded = true;
      base.stockSeeded = true;
      return base;
    }

    /** Walk any earlier shape forward so an existing install keeps its modules and bindings. */
    function migrateState(parsed) {
      if (!parsed || typeof parsed !== 'object') return defaultAppState();
      if (parsed.v === 3 && Array.isArray(parsed.modules)) return normalizeState(parsed);
      if (parsed.v === 2 && Array.isArray(parsed.modules)) {
        return normalizeState(Object.assign({}, parsed, { v: 3, appearance: defaultAppearance() }));
      }
      if (parsed.v !== 1 || !Array.isArray(parsed.workbenches) || parsed.workbenches.length === 0) return defaultAppState();
      const modules = parsed.workbenches.map((workbench, index) => {
        const groups = Array.isArray(workbench.groups) ? workbench.groups : [];
        const bound = groups.find((group) => group && group.sessionId);
        return {
          id: newId('mod'),
          kind: workbench.type === 'research' ? 'research' : 'game',
          name: workbench.type === 'research' ? '综合研究台' : '对话后台',
          accent: MODULE_ACCENTS[index % MODULE_ACCENTS.length],
          preset: workbench.preset || 'triple',
          sessionId: bound ? bound.sessionId : undefined,
          created: Date.now() + index,
          desc: workbench.type === 'research'
            ? '对话检索、资料收集与总结：摘要节点、引用来源、资源仓库。'
            : 'Godot / 引擎项目的主控台：对话节点树、对话轮次汇总、资源仓库。',
        };
      });
      const state = {
        v: 3, modules, focusSessionId: parsed.focusSessionId, notes: parsed.notes || {},
        background: defaultBackground(), appearance: defaultAppearance(),
      };
      return normalizeState(state);
    }

    /**
     * Coerce one module's persisted news settings into the shape the view expects.
     *
     * Everything here is defensive because this object is the one part of the state that
     * carries fetched third-party content: a topic name from a catalog, an accent from a
     * request body, an archive written by whatever version of the Host was running last week.
     * A malformed entry is dropped rather than allowed to break the whole rail.
     */
    function normalizeNewsSettings(raw) {
      const news = Object.assign(defaultNewsSettings(), raw && typeof raw === 'object' ? raw : {});
      news.topics = (Array.isArray(news.topics) ? news.topics : [])
        .filter((topic) => topic && typeof topic.id === 'string' && typeof topic.name === 'string')
        .map((topic) => ({
          id: topic.id,
          name: String(topic.name).slice(0, 40),
          accent: typeof topic.accent === 'string' && /^#[0-9a-f]{3,8}$/i.test(topic.accent) ? topic.accent : NEWS_TOPIC_ACCENTS[0],
          lang: NEWS_LANGS[topic.lang] ? topic.lang : 'zh',
          kw: (Array.isArray(topic.kw) ? topic.kw : []).filter((word) => typeof word === 'string' && word.trim()).slice(0, 8),
          feeds: (Array.isArray(topic.feeds) ? topic.feeds : []).filter((id) => typeof id === 'string').slice(0, 12),
        }))
        .slice(0, 12);
      if (!news.topics.length) news.topics = defaultNewsSettings().topics;
      if (!news.topics.some((topic) => topic.id === news.activeId)) news.activeId = news.topics[0].id;
      news.topicsFromCatalog = news.topicsFromCatalog === true;
      news.count = clamp(Number(news.count) || 40, NEWS_MIN, NEWS_MAX);
      news.days = clamp(Number(news.days) || 7, 1, NEWS_KEEP_DAYS);
      if (news.view !== 'list' && news.view !== 'grid' && news.view !== 'compact') news.view = 'list';
      news.translate = news.translate !== false;
      // The translation cache is third-party text being persisted, so it is bounded and typed
      // here like everything else that comes back over the wire.
      const rawTranslated = news.translated && typeof news.translated === 'object' && !Array.isArray(news.translated)
        ? news.translated
        : {};
      const translatedEntries = Object.entries(rawTranslated)
        .filter(([key, value]) => typeof key === 'string' && key.length > 1 && typeof value === 'string' && value.length > 1)
        .slice(-NEWS_TRANSLATION_MAX);
      news.translated = Object.fromEntries(translatedEntries);
      // Pane shares are always normalised to sum 1 on the way in, so a split written by an older
      // build and one written by a drag are the same shape by the time the view sees them.
      //
      // The layout used to have three panes (topic rail | stream | detail) and the topic switcher
      // moved to a horizontal nav bar, so a stored 3-array is *migrated* rather than discarded:
      // the rail's share is dropped and the remaining two are renormalised, which keeps a reader's
      // chosen reading width instead of resetting it to the default.
      const validShare = (value) => Number.isFinite(value) && value > 0.02 && value < 0.98;
      const stored = Array.isArray(news.cols) ? news.cols.map(Number) : [];
      const rawCols = stored.length === 2 && stored.every(validShare) ? stored
        : stored.length === 3 && stored.every(validShare) ? [stored[1], stored[2]]
          : defaultNewsSettings().cols;
      const colSum = rawCols[0] + rawCols[1];
      news.cols = colSum > 0 ? rawCols.map((value) => value / colSum) : defaultNewsSettings().cols;
      // The archive is the module's whole point, so entries are validated field by field: one
      // bad item from a feed must not be able to blank the pane or wedge a render.
      const now = Date.now();
      news.archive = (Array.isArray(news.archive) ? news.archive : [])
        .filter((item) => item && typeof item.id === 'string' && typeof item.title === 'string'
          && typeof item.url === 'string' && Number.isFinite(item.publishedAt))
        .filter((item) => now - item.publishedAt <= NEWS_KEEP_DAYS * 86400000 + 3600000)
        .slice(0, NEWS_ARCHIVE_MAX);
      news.seen = news.seen && typeof news.seen === 'object' && !Array.isArray(news.seen) ? news.seen : {};
      news.feeds = (Array.isArray(news.feeds) ? news.feeds : [])
        .filter((feed) => feed && typeof feed.id === 'string' && typeof feed.label === 'string')
        .map((feed) => ({ id: feed.id, label: feed.label.slice(0, 60), group: typeof feed.group === 'string' ? feed.group.slice(0, 12) : '其他' }))
        .slice(0, 60);
      if (!news.feeds.length) news.feeds = NEWS_SEED_FEEDS.map((feed) => Object.assign({}, feed));
      news.lastFetchAt = Number(news.lastFetchAt) || 0;
      news.catalogAt = Number(news.catalogAt) || 0;
      return news;
    }

    function normalizeState(parsed) {
      const state = Object.assign(defaultAppState(), parsed);
      // `Object.assign` cannot tell "the key was absent" from "the key holds the default", and
      // the difference is the whole point of this flag, so it is read from the raw input.
      state.newsSeeded = Boolean(parsed && parsed.newsSeeded === true);
      state.stockSeeded = Boolean(parsed && parsed.stockSeeded === true);

      if (!Array.isArray(state.modules) || state.modules.length === 0) state.modules = defaultModules();
      // 自动编号后缀去掉: "框架笔记 4" → "框架笔记". 只对已知的类型名生效, 用户自己起的名字不动.
      const autoBases = [TEXT.zh.kindGame, TEXT.zh.kindNews, TEXT.zh.kindNotebook, TEXT.zh.kindResearch,
        TEXT.zh.kindStock,
        TEXT.en.kindGame, TEXT.en.kindNews, TEXT.en.kindNotebook, TEXT.en.kindResearch, TEXT.en.kindStock,
        TEXT.zh.newModule, TEXT.en.newModule];
      state.modules = state.modules.map((module) => {
        const name = typeof module.name === 'string' ? module.name : '';
        const stripped = name.replace(/ (\d+)$/, '');
        if (stripped !== name && autoBases.indexOf(stripped) >= 0) {
          return Object.assign({}, module, { name: stripped });
        }
        return module;
      });
      state.modules = state.modules.filter((module) => module && typeof module.id === 'string').map((module, index) => {
        // The shipped default research module became 框架笔记. Only the *untouched* default
        // is upgraded (same name and description); a renamed or re-described module is
        // somebody's own work and is left exactly as it is.
        const wasDefaultResearch = module.kind === 'research'
          && module.name === '综合研究台'
          && typeof module.desc === 'string'
          && module.desc.indexOf('对话检索、资料收集与总结') === 0;
        const kind = wasDefaultResearch ? 'notebook' : module.kind;
        return {
          id: module.id,
          kind: kind === 'research' || kind === 'game' || kind === 'blank' || kind === 'notebook'
            || kind === 'news' || kind === 'stock' ? kind : 'blank',
          // 框架笔记 is standalone: it never carries a session binding, and it always has a tree.
          noteRoot: kind === 'notebook' ? noteTreeOf(module) : undefined,
          noteStyle: kind === 'notebook' ? noteStyleOf(module) : undefined,
          noteView: kind === 'notebook' ? noteViewOf(module) : undefined,
          // 每日新闻 is standalone too, and its settings are read on every render — so they are
          // normalised here, once, rather than defensively at each use site.
          news: kind === 'news' ? normalizeNewsSettings(module.news) : undefined,
          // 股票市场 is the second standalone network module, normalised the same way.
          stock: kind === 'stock' ? normalizeStockSettings(module.stock) : undefined,
          name: wasDefaultResearch ? '框架笔记' : (renamedConsole(module) || (typeof module.name === 'string' && module.name ? module.name : '模块 ' + (index + 1))),
          desc: wasDefaultResearch
            ? '独立的框架笔记：节点式思维导图（思维导图 / 逻辑图 / 组织结构图 / 树形图 / 时间轴 / 鱼骨图），节点里可以写文字、贴图片，不依赖任何对话。'
            : (typeof module.desc === 'string' ? module.desc : ''),
          accent: typeof module.accent === 'string' && module.accent ? module.accent : MODULE_ACCENTS[index % MODULE_ACCENTS.length],
          preset: PRESETS[module.preset] ? module.preset : 'triple',
          // A notebook is standalone, so any stale binding is dropped with the upgrade.
          // 每日新闻 and 股票市场 are standalone for the same reason: they read the network, not a
          // session — so a stale binding on either is dropped as well.
          sessionId: wasDefaultResearch || kind === 'news' || kind === 'stock' ? undefined
            : (typeof module.sessionId === 'string' && module.sessionId ? module.sessionId : undefined),
          // 轨迹横条: off unless the user turned it on; the height is clamped on read.
          trailOpen: module.trailOpen === true,
          trailHeight: typeof module.trailHeight === 'number' ? module.trailHeight : undefined,
          created: typeof module.created === 'number' ? module.created : Date.now() + index,
          size: MODULE_SIZES[module.size] ? module.size : 'medium',
          // Composed pane set, when the user has customised it.
          panes: Array.isArray(module.panes) && module.panes.length
            ? module.panes.filter((kind) => PANE_KINDS.includes(kind))
            : undefined,
        };
      });

      const legacy = state.background || {};
      const background = Object.assign(defaultBackground(), legacy);
      // v2 stored one local file in localKey/localKind; lift it into the media library.
      if (typeof legacy.localKey === 'string' && legacy.localKey) {
        background.media = [{ key: legacy.localKey, name: legacy.localName || '媒体', kind: legacy.localKind === 'video' ? 'video' : 'image' }];
        background.activeKey = legacy.localKey;
        background.mode = 'media';
      }
      if (background.mode === 'gradient') background.mode = 'aurora';
      if (background.mode === 'local') background.mode = 'media';
      if (!Array.isArray(background.media)) background.media = [];
      background.media = background.media
        .filter((item) => item && typeof item.key === 'string')
        .map((item) => ({
          key: item.key,
          name: typeof item.name === 'string' ? item.name : '媒体',
          kind: item.kind === 'video' ? 'video' : 'image',
          // The durable form: a path on this machine, served by the Host route.
          path: typeof item.path === 'string' ? item.path : undefined,
          url: typeof item.url === 'string' ? item.url : undefined,
        }));
      if (typeof background.activeKey !== 'string' || !background.media.some((item) => item.key === background.activeKey)) {
        background.activeKey = background.media.length ? background.media[background.media.length - 1].key : '';
      }
      if (!PALETTES[background.auroraId]) background.auroraId = 'aurora';
      background.auroraSpeed = clamp(background.auroraSpeed, 0, 100);
      background.blur = clamp(background.blur, 0, 100);
      background.dim = clamp(background.dim, 0, 100);
      background.bright = clamp(background.bright, 0, 200);
      background.grid = clamp(background.grid, 0, 100);
      background.edgeBlur = clamp(background.edgeBlur, 0, 100);
      background.hueSpeed = clamp(background.hueSpeed, 0, 100);
      background.hueRange = clamp(background.hueRange, 0, 100);
      background.shapeVariance = clamp(background.shapeVariance, 0, 100);
      background.saturation = clamp(background.saturation, 0, 300);
      background.mediaSpeed = clamp(background.mediaSpeed, 25, 200);
      if (!GRID_SHAPES[background.gridShape]) background.gridShape = background.grid > 0 ? 'grid' : 'none';
      // The custom background (自定义界面) is a real feature, so the stored choice is preserved
      // and only sanitised: every entry needs an identity plus a source (a disk path served by
      // the Host route, or a stored blob's object URL). A `media` mode with nothing usable
      // behind it falls back to the aurora rather than showing an empty window.
      const entries = Array.isArray(background.media) ? background.media : [];
      background.media = entries.filter((item) => item && typeof item.key === 'string' && item.key
        && ((typeof item.path === 'string' && item.path) || (typeof item.url === 'string' && item.url)));
      if (!background.media.some((item) => item.key === background.activeKey)) {
        background.activeKey = background.media.length ? background.media[background.media.length - 1].key : '';
      }
      background.mode = background.mode === 'media' && background.activeKey ? 'media' : 'aurora';
      state.background = background;

      const appearance = Object.assign(defaultAppearance(), state.appearance || {});
      if (!PALETTES[appearance.palette]) appearance.palette = 'aurora';
      if (!GLASS_SCHEMES[appearance.glass]) appearance.glass = 'regular';
      delete appearance.size;
      // 形状 is one 0–100 scale (0 circle → 100 square). It used to be a named corner radius in
      // pixels, so an existing install is converted with the tile width that was in use.
      if (appearance.radius === undefined || appearance.radius === null) {
        // A stored named shape converts from its pixel radius; a fresh install gets the default.
        // Read from the RAW parsed state: the merged object already carries `shape: 'rounded'`,
        // so a fresh install would look like a migrated one.
        const stored = (parsed && parsed.appearance && parsed.appearance.shape) || null;
        const legacy = stored ? CARD_SHAPES[stored] : null;
        appearance.radius = legacy ? Math.round(100 - (legacy.radius / 258) * 200) : 85;
      }
      appearance.radius = clamp(Math.round(Number(appearance.radius) || 0), 0, 100);
      delete appearance.shape;
      delete appearance.form;
      delete appearance.ratio;
      delete appearance.layout;
      appearance.consoleAurora = appearance.consoleAurora !== false;
      // Absent means "use the material's own fill"; a number is the 透明度 slider's override.
      // 模块界面背景的压暗/模糊强度（0 = 不变）。
        appearance.dim = isFinite(Number(appearance.dim))
          ? clamp(Math.round(Number(appearance.dim)), 0, 100) : 0;
        if (appearance.glassAlpha !== undefined && appearance.glassAlpha !== null) {
        const alpha = Number(appearance.glassAlpha);
        appearance.glassAlpha = isFinite(alpha) ? clamp(Math.round(alpha), 0, 100) : undefined;
      } else appearance.glassAlpha = undefined;
      state.appearance = appearance;

      // The 每日新闻 module ships with this plugin, but an install that already had a saved
      // state predates it — and the module list is user data that is never regenerated, so a
      // new shipped module would otherwise never appear for anyone who has used the plugin
      // before. It is therefore offered exactly once, guarded by a flag that survives deletion:
      // a user who removes it does not get it back on the next reload.
      if (state.newsSeeded !== true) {
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
      }
      // 便签: position is stored as a percentage of the desktop, so a resize keeps the layout.
      const stickies = Array.isArray(state.stickies) ? state.stickies : [];
      state.stickies = stickies.filter((item) => item && typeof item.id === 'string' && item.id).map((item) => ({
        id: item.id,
        x: clamp(Number(item.x) || 8, 0, 92),
        y: clamp(Number(item.y) || 12, 0, 92),
        color: STICKY_COLORS[item.color] ? item.color : 'amber',
        w: clamp(Number(item.w) || 196, 140, 460),
        h: clamp(Number(item.h) || 150, 110, 460),
        text: typeof item.text === 'string' ? item.text.slice(0, 4000) : '',
        created: Number(item.created) || Date.now(),
      }));
      if (!state.notes || typeof state.notes !== 'object') state.notes = {};
      state.v = 3;
      return state;
    }

    function loadAppState() {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (raw) return migrateState(JSON.parse(raw));
        for (const key of LEGACY_KEYS) {
          const legacy = window.localStorage.getItem(key);
          if (legacy) return migrateState(JSON.parse(legacy));
        }
      } catch { /* fall through to defaults */ }
      return defaultAppState();
    }

    /**
     * Re-syncs the sidebar rows that mirror the module list. Set by `apply()`; called after
     * every save so adding, deleting or reordering modules keeps the sidebar in step.
     */
    let sidebarSync = null;

    function saveAppState(state) {
      try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state)) } catch { /* storage may be unavailable or full */ }
      safe(() => { if (sidebarSync) sidebarSync() });
    }

    function loadNotes() {
      try {
        return JSON.parse(window.localStorage.getItem(NOTES_KEY)
          || window.localStorage.getItem(LEGACY_NOTES_KEY)
          || '{}') || {};
      } catch { return {} }
    }

    function saveNotes(notes) {
      try { window.localStorage.setItem(NOTES_KEY, JSON.stringify(notes)) } catch { /* ignore */ }
    }

    //#endregion

    //#region model hooks

    function useSessionsList(services) {
      const source = services && services.sessions ? services.sessions.list : null;
      return useStore(source, EMPTY_LIST);
    }

    function useWorkbenchData(services, sessionId) {
      const binding = useMemo(() => {
        if (!services || !services.sessions || !sessionId) return null;
        return safe(() => services.sessions.binding(sessionId) || null, null);
      }, [services, sessionId]);

      const eventSource = binding ? binding.eventSource : null;
      const window_ = useStore(eventSource, EMPTY_WINDOW);

      const usageSource = useMemo(() => {
        if (!binding) return null;
        return safe(() => binding.session.projections.faceOf('tokenUsage') || null, null);
      }, [binding]);
      const pressureSource = useMemo(() => {
        if (!binding) return null;
        return safe(() => binding.session.projections.faceOf('contextPressure') || null, null);
      }, [binding]);
      const breakdownSource = useMemo(() => {
        if (!binding) return null;
        return safe(() => binding.session.projections.faceOf('contextBreakdown') || null, null);
      }, [binding]);

      const usage = useStore(usageSource, EMPTY_OBJECT);
      const pressure = useStore(pressureSource, EMPTY_OBJECT);
      const breakdown = useStore(breakdownSource, EMPTY_OBJECT);
      const status = useStore(binding ? binding.session : null, EMPTY_OBJECT);

      const model = useMemo(() => foldWindow(window_ ? window_.entries : []), [window_]);

      return { binding, model, usage, pressure, breakdown, status, window: window_ };
    }

    //#endregion

    //#region panes

    function PaneHead({ title, sub, children }) {
      return h('div', { className: 'wsb-paneHead' },
        h('b', null, title),
        children,
        sub ? h('span', { className: 'wsb-sub', title: sub }, sub) : null);
    }

    /**
     * Branch graph geometry.
     *
     * Rows are laid out arithmetically (fixed row height + fixed indent) instead of
     * measuring the DOM: no layout reads, no jank on expand, and the whole graph is
     * reproducible without a browser. Edges are cubic S-curves from the parent's rail
     * to the child's left edge, drawn with `pathLength="1"` so one dash animation
     * draws every edge regardless of its real length.
     */
    const GRAPH_ROW = 30;
    const GRAPH_DETAIL = 64;
    const GRAPH_NOTE_DETAIL = 108;
    const GRAPH_INDENT = 15;

    const KIND_MARK = { turn: 'T', assistant: 'A', prompt: 'U', tool: '›', file: '◆', note: '✎' };

    function kindColor(kind, status) {
      if (status === 'error') return 'var(--dsw-alias-state-error-primary)';
      if (kind === 'turn') return 'var(--dsw-alias-brand-primary)';
      if (kind === 'file') return 'var(--dsw-alias-state-success-primary)';
      if (kind === 'assistant') return 'var(--dsw-alias-state-warn-primary)';
      if (kind === 'note') return 'var(--dsw-alias-state-idle-primary)';
      return 'var(--dsw-alias-label-secondary)';
    }

    function TreeRow({ t, row, selectedId, onSelect, onToggle, notes, dim, animIndex }) {
      const node = row.node;
      const badges = [];
      if (node.kind === 'turn') {
        if (node.calls) badges.push(node.calls + 'c');
        if (node.errors) badges.push(node.errors + '!');
        if (node.usage) badges.push(formatCount(node.usage.inputTokens) + ' / ' + formatCount(node.usage.outputTokens));
      } else if (node.kind === 'file') {
        if (node.adds) badges.push('+' + node.adds);
        if (node.dels) badges.push('−' + node.dels);
      } else if (node.status === 'error') badges.push('err');
      if (node.custom) badges.push(t.nodeNote);
      if (notes[node.id]) badges.push('✎');

      return h('div', {
        className: 'wsb-row wsb-anim', role: 'button', tabIndex: 0,
        'data-node-id': node.id,
        'data-kind': node.kind,
        'data-sel': selectedId === node.id ? 'true' : 'false',
        'data-dim': dim ? 'true' : 'false',
        style: {
          top: row.y + 'px', height: GRAPH_ROW + 'px', paddingLeft: (9 + row.depth * GRAPH_INDENT) + 'px',
          '--wsb-i': String(animIndex || 0),
        },
        onClick: () => onSelect(node.id),
        onKeyDown: (event) => { if (event.key === 'Enter') onSelect(node.id) },
        title: node.subtitle || node.title || '',
      },
        h('span', {
          className: 'wsb-rowTwist', 'data-open': row.open ? 'true' : 'false',
          onClick: (event) => { event.stopPropagation(); if (row.hasKids || row.expandable) onToggle(node.id) },
        }, row.hasKids || row.expandable ? '▶' : '·'),
        h('span', {
          className: 'wsb-rowGlyph',
          style: { background: kindColor(node.kind, node.status) },
        }, KIND_MARK[node.kind] || '›'),
        h('span', { className: 'wsb-rowTitle' }, node.title || ''),
        h('span', { className: 'wsb-rowMeta' }, node.subtitle || ''),
        h('span', { className: 'wsb-rowNums' },
          badges.map((text, index) => h('span', { key: index, className: 'wsb-badge' }, text))));
    }

    function TreeGraph({ t, nodes, selectedId, onSelect, notes, onNote }) {
      const [expanded, setExpanded] = useState(() => new Set(['root']));

      // Nothing is ever expanded for you. Loading older events used to look like "new
      // turns arriving" and unfolded them, so the whole session came up open; now only an
      // explicit click (or the drag gesture below) changes the set.

      const layout = useMemo(() => {
        const rows = [];
        const walk = (list, depth, parentId) => {
          for (const node of list) {
            const kids = Array.isArray(node.children) ? node.children : [];
            const open = expanded.has(node.id);
            rows.push({
              node, depth, parentId, open, hasKids: kids.length > 0,
              expandable: Boolean(node.text || node.body),
              x: 9 + depth * GRAPH_INDENT,
            });
            if (!open) continue;
            if (kids.length) walk(kids, depth + 1, node.id);
            else rows[rows.length - 1].detail = true;
          }
        };
        walk(nodes, 0, null);

        let cursor = 0;
        for (const row of rows) {
          row.y = cursor;
          cursor += GRAPH_ROW;
          if (row.detail) {
            row.detailY = cursor;
            row.detailH = row.node.custom ? GRAPH_NOTE_DETAIL : GRAPH_DETAIL;
            cursor += row.detailH;
          }
        }

        const byId = new Map(rows.map((row) => [row.node.id, row]));
        const edges = [];
        for (const row of rows) {
          const parent = row.parentId ? byId.get(row.parentId) : undefined;
          if (!parent) continue;
          const sx = parent.x + 5;
          const sy = parent.y + GRAPH_ROW - 3;
          const cx = row.x;
          const cy = row.y + GRAPH_ROW / 2;
          const bend = Math.max(8, (cy - sy) * 0.5);
          edges.push({
            id: parent.node.id + '>' + row.node.id,
            childId: row.node.id,
            d: 'M ' + sx + ' ' + sy + ' C ' + sx + ' ' + (sy + bend) + ' ' + cx + ' ' + (cy - bend) + ' ' + cx + ' ' + cy,
          });
        }
        return { rows, edges, byId, height: cursor };
      }, [nodes, expanded]);

      // Focus + context: keep the selection and its ancestors bright, ghost the rest.
      const chain = useMemo(() => {
        const set = new Set();
        if (!selectedId || selectedId === 'root') return set;
        let row = layout.byId.get(selectedId);
        while (row) {
          set.add(row.node.id);
          row = row.parentId ? layout.byId.get(row.parentId) : undefined;
        }
        return set;
      }, [layout, selectedId]);

      const ghost = useMemo(() => {
        const set = new Set();
        if (chain.size === 0) return set;
        const selected = layout.byId.get(selectedId);
        const walk = (row) => {
          for (const child of row.node.children || []) {
            const childRow = layout.byId.get(child.id);
            if (!childRow) continue;
            set.add(child.id);
            walk(childRow);
          }
        };
        if (selected) walk(selected);
        const dim = new Set();
        for (const row of layout.rows) {
          if (!chain.has(row.node.id) && !set.has(row.node.id)) dim.add(row.node.id);
        }
        return dim;
      }, [layout, chain, selectedId]);

      const toggle = (id) => setExpanded((previous) => {
        const next = new Set(previous);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
      });

      // Hold the left button and pull down anywhere over the graph to collapse it all.
      const drag = useRef(null);
      const onDragStart = (event) => { if (event.button === 0) drag.current = { y: event.clientY, done: false } };
      const onDragMove = (event) => {
        if (!drag.current || drag.current.done) return;
        if (event.buttons !== 1) { drag.current = null; return }
        if (event.clientY - drag.current.y > 26) {
          drag.current.done = true;
          setExpanded(new Set(['root']));
        }
      };
      const onDragEnd = () => { drag.current = null };

      return h('div', {
        className: 'wsb-graph', style: { height: layout.height + 'px' },
        'data-graph': '1',
        title: t.collapseHint,
        onMouseDown: onDragStart, onMouseMove: onDragMove, onMouseUp: onDragEnd, onMouseLeave: onDragEnd,
      },
        h('svg', {
          className: 'wsb-graphEdges', width: '100%', height: layout.height, 'aria-hidden': 'true',
        },
          layout.edges.map((edge, index) => h('path', {
            key: edge.id, className: 'wsb-edge', d: edge.d, 'data-edge': 'true',
            // No viewBox: user units are CSS pixels, so x/y below line up with the rows.
            // pathLength=1 normalises every edge so one dash rule draws all of them.
            pathLength: 1,
            'data-hot': chain.has(edge.childId) ? 'true' : 'false',
            'data-dim': ghost.has(edge.childId) ? 'true' : 'false',
            style: { animationDelay: Math.min(index, 24) * 16 + 'ms' },
          }))),
        layout.rows.map((row, rowIndex) => h(TreeRow, {
          key: row.node.id, t, row, selectedId, notes, animIndex: rowIndex,
          onSelect, onToggle: toggle, dim: ghost.has(row.node.id),
        })),
        layout.rows.filter((row) => row.detail).map((row) => h('div', {
          key: 'detail-' + row.node.id, className: 'wsb-graphDetail',
          style: {
            top: row.detailY + 'px', height: row.detailH + 'px',
            paddingLeft: (11 + row.depth * GRAPH_INDENT) + 'px',
          },
        },
          h('div', null, row.node.text
            ? String(row.node.text).slice(0, 900)
            : (row.node.body || row.node.subtitle || '')),
          row.node.custom
            ? h('textarea', {
              className: 'wsb-input',
              style: { width: '100%', height: '56px', marginTop: '6px', resize: 'none' },
              value: notes[row.node.id] || '',
              onChange: (event) => onNote(row.node.id, event.target.value),
            })
            : null)));
    }

    /**
     * Project-level overview above the tree: roll-up KPIs, a per-turn timeline that
     * doubles as a filter, and a file-impact ranking. This is the "what happened in
     * this project" view; the tree below is the "where exactly" view.
     */
    function ProjectOverview({ t, model, focus, onFocusTurn, onFocusFile, onClearFocus }) {
      const summary = model.summary;
      const turns = model.turns;
      const adds = model.files.reduce((total, file) => total + file.adds, 0);
      const dels = model.files.reduce((total, file) => total + file.dels, 0);
      const maxTurn = turns.reduce((max, turn) => Math.max(max, turn.usage ? turn.usage.inputTokens + turn.usage.outputTokens : 0), 0) || 1;
      const ranked = model.files.slice().sort((a, b) => (b.adds + b.dels) - (a.adds + a.dels)).slice(0, 6);
      const maxFile = ranked.reduce((max, file) => Math.max(max, file.adds + file.dels), 0) || 1;
      const filtered = focus.turn !== undefined || Boolean(focus.file);

      const kpi = (label, value, tone) => h('div', { className: 'wsb-kpi' },
        h('em', null, label), h('strong', { 'data-tone': tone }, value));
      const kpiAt = (index, label, value, tone) => h('div', {
        className: 'wsb-kpi wsb-anim', style: { '--wsb-i': String(index) },
      }, h('em', null, label), h('strong', { 'data-tone': tone }, value));

      return h('div', { className: 'wsb-overview' },
        h('div', { className: 'wsb-kpis' },
          kpiAt(0, t.kTurns, String(summary.turns)),
          kpiAt(1, t.kSteps, String(summary.steps)),
          kpiAt(2, t.kCalls, String(summary.calls)),
          kpiAt(3, t.kFiles, String(summary.files)),
          kpiAt(4, t.kLines, '+' + adds + ' / −' + dels),
          kpiAt(5, t.kErrors, String(summary.errors), summary.errors ? 'err' : undefined)),
        turns.length
          ? h('div', null,
            h('div', { className: 'wsb-ovLabel' }, t.turnTimeline,
              filtered ? h('button', {
                type: 'button', className: 'wsb-btn', style: { marginLeft: 'auto', padding: '1px 7px' },
                onClick: onClearFocus,
              }, t.spanAll) : null),
            h('div', { className: 'wsb-tlBars' }, turns.map((turn, barIndex) => {
              const total = turn.usage ? turn.usage.inputTokens + turn.usage.outputTokens : 0;
              const active = focus.turn === turn.turn;
              return h('button', {
                key: turn.turn, type: 'button', className: 'wsb-tlBar wsb-anim',
                'data-on': active ? 'true' : 'false', 'data-tone': turn.errors ? 'err' : undefined,
                // --wsb-h is this bar's own target height. It has to live in a variable
                // because a keyframe cannot interpolate "from 0 to whatever the inline style
                // says" — the rise animates height against this resolved value, so each bar
                // grows to its OWN height instead of all scaling by the same factor.
                style: { '--wsb-i': String(barIndex), '--wsb-h': Math.max(9, Math.round(total / maxTurn * 100)) + '%' },
                title: t.nodeTurn + ' ' + turn.index + ' · ' + formatCount(total) + ' · ' + turn.calls + ' ' + t.kCalls,
                onClick: () => onFocusTurn(active ? undefined : turn.turn),
              }, h('i', { style: { height: 'var(--wsb-h)' } }));
            })))
          : null);
    }

    function TreePane({ t, model, selectedId, onSelect, notes, onNote, customNodes, onAddCustom, onLoadOlder, hasMore, loadingOlder, status }) {
      // Expansion, auto-open and focus/context all live in TreeGraph now.
      const [focus, setFocus] = useState({ turn: undefined, file: undefined });
      const [draft, setDraft] = useState('');
      const tree = useMemo(() => {
        const turnNodes = model.turns.map((turn) => ({
          id: 'turn-' + turn.turn,
          kind: 'turn',
          turn: turn.turn,
          title: (t.nodeTurn + ' ' + turn.index) + ' · ' + (firstLine(turn.prompt, 54) || t.pending),
          subtitle: turn.usage
            ? (formatCount(turn.usage.inputTokens) + ' in / ' + formatCount(turn.usage.outputTokens) + ' out')
            : '',
          calls: turn.calls, errors: turn.errors, usage: turn.usage, status: turn.reason ? 'ok' : 'running',
          children: turn.nodes.map((node) => ({
            id: node.id,
            kind: node.kind,
            title: node.kind === 'prompt' ? (t.nodeTurn + ' ' + turn.index + ' · ' + t.prompt)
              : node.kind === 'assistant' ? ((node.narration ? t.narration : t.reply) + ' · step ' + (node.step || '?'))
                : node.kind === 'file' ? (t.nodeFile + ' · ' + (node.title || ''))
                  : (node.name || t.nodeTool),
            subtitle: node.subtitle || (node.args ? firstLine(JSON.stringify(node.args), 96) : ''),
            status: node.status, text: node.text, body: node.rawArgs, path: node.path,
          })),
        }));
        for (const group of customNodes) {
          const target = group.turnId === undefined ? turnNodes : null;
          const bucket = target || turnNodes;
          bucket.push({
            id: group.id, kind: 'note', custom: true, title: group.title || t.nodeNote,
            subtitle: firstLine(group.body, 80), body: group.body,
          });
        }
        // Focus filtering: the timeline picks one turn, the impact ranking one file.
        let result = turnNodes;
        if (focus.turn !== undefined) result = result.filter((node) => node.turn === focus.turn);
        if (focus.file) {
          result = result
            .map((node) => Object.assign({}, node, {
              children: (node.children || []).filter((child) => child.path === focus.file),
            }))
            .filter((node) => node.children.length > 0 || node.custom);
        }
        return result;
      }, [model, customNodes, t, focus]);

      const fileRows = model.files;

      return h('div', { className: 'wsb-glass', style: { animationDelay: '0ms' } },
        h(PaneHead, {
          title: t.pTree,
        },
          status && status.running ? h('span', { className: 'wsb-badge', 'data-tone': 'warn' }, t.running) : null,
          h('button', {
            type: 'button', className: 'wsb-btn', onClick: onLoadOlder, disabled: !hasMore || loadingOlder,
            title: t.loadOlder, 'data-load-older': '1',
          }, loadingOlder ? t.loading : '↑')),
        h('div', { className: 'wsb-body' },
          h(ProjectOverview, {
            t, model, focus,
            onFocusTurn: (turn) => setFocus((previous) => ({ turn, file: previous.file })),
            onFocusFile: (file) => setFocus((previous) => ({ turn: previous.turn, file })),
            onClearFocus: () => setFocus({ turn: undefined, file: undefined }),
          }),
          h('div', { style: { display: 'flex', gap: '6px', marginBottom: '9px', flexWrap: 'wrap' } },
            h('input', {
              className: 'wsb-input', style: { flex: '1 1 120px' }, value: draft, placeholder: t.notePlaceholder,
              onChange: (event) => setDraft(event.target.value),
            }),
            h('button', {
              type: 'button', className: 'wsb-btn', disabled: !draft.trim(),
              onClick: () => { if (draft.trim()) { onAddCustom(draft.trim()); setDraft('') } },
            }, t.addNote)),
          tree.length === 0
            ? h('div', { className: 'wsb-empty' }, focus.turn !== undefined || focus.file ? t.focusHint : t.noTurns)
            : h(TreeGraph, {
              t,
              nodes: [{
                id: 'root', kind: 'turn',
                // "会话总轮次 22 次" — the count is this session's total turns, so the number
                // is followed by a measure word rather than the bare label.
                title: t.sessionTotalTurns + ' ' + model.summary.turns + ' ' + t.turnTimes,
                subtitle: model.model || '',
                children: tree,
              }],
              selectedId, onSelect, notes, onNote,
            }),
          fileRows.length
            ? h('div', { style: { marginTop: '14px' } },
              h('div', { style: { fontSize: '11px', color: 'var(--dsw-alias-label-secondary)', margin: '0 0 6px' } }, t.changedFiles),
              fileRows.map((file) => h('div', { key: file.path, className: 'wsb-badge', style: { display: 'block', marginBottom: '4px' }, title: file.path },
                h('span', { className: 'wsb-tok-k' }, baseName(file.path)),
                '  +' + file.adds + ' / −' + file.dels + '  · ' + file.ops + '×')))
            : null));
    }

    //#region summarising + export

    function splitSentences(text) {
      const parts = String(text || '').split(/(?<=[。！？!?；;\n])/);
      const out = [];
      for (const part of parts) {
        const clean = part.replace(/\s+/g, ' ').trim();
        if (clean) out.push(clean);
      }
      return out;
    }

    /**
     * Extractive summary: keep whole sentences under a character budget, preferring
     * the opening sentence and sentences carrying intent words. This runs locally —
     * it is not a model call, so the details button always offers the full text.
     */
    function summarizeText(text, limit) {
      const clean = String(text || '').replace(/\r/g, '').replace(/[ \t]+/g, ' ').trim();
      if (clean.length <= limit) return { text: clean, summarized: false };
      const sentences = splitSentences(clean).filter((sentence) => sentence.length > 6);
      if (sentences.length <= 1) return { text: clean.slice(0, limit).trim() + '…', summarized: true };
      const intent = /因为|所以|因此|结论|问题|修复|改|需要|应该|采用|实现|测试|原因|bug|fix|because|so |need|should|test/i;
      const scored = sentences.map((sentence, index) => ({
        sentence, index,
        score: Math.min(sentence.length, 90)
          + (index === 0 ? 70 : 0)
          + (index === sentences.length - 1 ? 24 : 0)
          + (intent.test(sentence) ? 30 : 0),
      }));
      scored.sort((left, right) => right.score - left.score);
      const chosen = [];
      let used = 0;
      for (const item of scored) {
        if (used + item.sentence.length > limit) continue;
        chosen.push(item);
        used += item.sentence.length;
        if (used >= limit - 24) break;
      }
      if (chosen.length === 0) return { text: clean.slice(0, limit).trim() + '…', summarized: true };
      chosen.sort((left, right) => left.index - right.index);
      return { text: chosen.map((item) => item.sentence).join(''), summarized: true };
    }

    /**
     * A Chinese synopsis of what one turn actually did, derived from its own steps, tool
     * calls and files. The model's own reasoning is often written in another language and
     * cannot be translated without a model call, so the collapsed view shows this instead
     * and 详细 reveals the original text untouched.
     */
    function turnSynopsis(t, turn) {
      const parts = [];
      parts.push(String(t.synSteps).replace('{n}', String(turn.steps)).replace('{c}', String(turn.calls)));
      const paths = new Set();
      for (const node of turn.nodes) {
        if (node.kind === 'file' && node.path) paths.add(node.path);
        else if (node.path) paths.add(node.path);
      }
      if (paths.size) parts.push(String(t.synFiles).replace('{n}', String(paths.size)));
      if (turn.errors) parts.push(String(t.synErrors).replace('{n}', String(turn.errors)));
      const counts = {};
      for (const node of turn.nodes) if (node.name) counts[node.name] = (counts[node.name] || 0) + 1;
      const top = Object.keys(counts).sort((left, right) => counts[right] - counts[left]).slice(0, 5);
      if (top.length) parts.push(String(t.synTools).replace('{list}', top.map((name) => name + ' ×' + counts[name]).join('、')));
      if (turn.usage) {
        parts.push(String(t.synTokens)
          .replace('{i}', formatCount(turn.usage.inputTokens))
          .replace('{o}', formatCount(turn.usage.outputTokens)));
      }
      return parts.join('；') + '。';
    }

    function xmlEscape(value) {
      return String(value === undefined || value === null ? '' : value)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&apos;')
        // control characters are illegal in XML and would make the file unreadable
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
    }

    function crc32(bytes) {
      if (!crc32.table) {
        const table = new Int32Array(256);
        for (let i = 0; i < 256; i += 1) {
          let value = i;
          for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xEDB88320 ^ (value >>> 1) : value >>> 1;
          table[i] = value;
        }
        crc32.table = table;
      }
      let crc = -1;
      for (let i = 0; i < bytes.length; i += 1) crc = (crc >>> 8) ^ crc32.table[(crc ^ bytes[i]) & 0xFF];
      return (crc ^ -1) >>> 0;
    }

    /** Minimal ZIP writer using stored (uncompressed) entries — enough for a .pptx. */
    function zipStore(files, mime) {
      const encoder = new TextEncoder();
      const u16 = (value) => [value & 255, (value >>> 8) & 255];
      const u32 = (value) => [value & 255, (value >>> 8) & 255, (value >>> 16) & 255, (value >>> 24) & 255];
      const body = [];
      const central = [];
      let offset = 0;
      for (const file of files) {
        const nameBytes = encoder.encode(file.name);
        const data = typeof file.data === 'string' ? encoder.encode(file.data) : file.data;
        const crc = crc32(data);
        const local = new Uint8Array([].concat(
          u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0),
          u32(crc), u32(data.length), u32(data.length), u16(nameBytes.length), u16(0)));
        body.push(local, nameBytes, data);
        central.push({ nameBytes, crc, size: data.length, offset });
        offset += local.length + nameBytes.length + data.length;
      }
      const tail = [];
      let centralSize = 0;
      for (const entry of central) {
        const header = new Uint8Array([].concat(
          u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0),
          u32(entry.crc), u32(entry.size), u32(entry.size),
          u16(entry.nameBytes.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(entry.offset)));
        tail.push(header, entry.nameBytes);
        centralSize += header.length + entry.nameBytes.length;
      }
      tail.push(new Uint8Array([].concat(
        u32(0x06054b50), u16(0), u16(0), u16(central.length), u16(central.length),
        u32(centralSize), u32(offset), u16(0))));
      return new Blob(body.concat(tail), { type: mime || 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
    }

    const P_NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
      + 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
      + 'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';

    function pptxTextBox(id, name, x, y, cx, cy, paragraphs) {
      return '<p:sp><p:nvSpPr><p:cNvPr id="' + id + '" name="' + xmlEscape(name) + '"/>'
        + '<p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr/></p:nvSpPr>'
        + '<p:spPr><a:xfrm><a:off x="' + x + '" y="' + y + '"/><a:ext cx="' + cx + '" cy="' + cy + '"/></a:xfrm>'
        + '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>'
        + '<p:txBody><a:bodyPr wrap="square"><a:normAutofit/></a:bodyPr><a:lstStyle/>'
        + paragraphs.join('') + '</p:txBody></p:sp>';
    }

    function pptxParagraph(text, size, bold) {
      return '<a:p><a:r><a:rPr lang="zh-CN" sz="' + size + '"' + (bold ? ' b="1"' : '') + ' dirty="0"/>'
        + '<a:t>' + xmlEscape(text) + '</a:t></a:r></a:p>';
    }

    /** Escape text for use inside a DrawingML run, and keep control chars out of the XML. */
    function xmlText(value) {
      return String(value == null ? '' : value)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&apos;')
        // eslint-disable-next-line no-control-regex
        .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ' ');
    }

    /**
     * A real DrawingML table. `rows` is a list of cells; the first row is the header.
     * Structured values (主题 / 现象 / 根因 / 解法 / 结果, and every key number) go in here
     * rather than into a paragraph of prose, which is what the summary slides are for.
     */
    function pptxTable(id, name, x, y, cx, cy, rows, options) {
      const opts = options || {};
      const colWidths = opts.colWidths && opts.colWidths.length === rows[0].length
        ? opts.colWidths
        : rows[0].map(() => Math.round(cx / rows[0].length));
      const rowHeight = Math.round(cy / Math.max(1, rows.length));
      const grid = colWidths.map((width) => '<a:gridCol w="' + width + '"/>').join('');
      const body = rows.map((cells, rowIndex) => {
        const isHeader = rowIndex === 0 && opts.header !== false;
        const height = isHeader ? Math.round(rowHeight * 0.72) : rowHeight;
        const tr = '<a:tr h="' + height + '">';
        const tds = cells.map((cell) => {
          const spec = typeof cell === 'object' && cell !== null ? cell : { text: cell };
          const bold = isHeader || spec.bold === true;
          const size = spec.size || (isHeader ? 1300 : 1150);
          const fill = isHeader ? '1F3355' : (spec.fill || 'FFFFFF');
          const color = isHeader ? 'FFFFFF' : (spec.color || '1A1A1A');
          // Long bodies need to wrap rather than clip.
          const text = xmlText(spec.text == null ? '' : spec.text);
          return '<a:tc><a:txBody><a:bodyPr wrap="square" lIns="72000" rIns="72000" tIns="36000" bIns="36000"/>'
            + '<a:lstStyle/><a:p><a:pPr algn="l"/><a:r><a:rPr lang="zh-CN" sz="' + size + '" b="' + (bold ? 1 : 0) + '" dirty="0">'
            + '<a:solidFill><a:srgbClr val="' + color + '"/></a:solidFill>'
            + '<a:latin typeface="Segoe UI"/><a:ea typeface="Microsoft YaHei"/></a:rPr>'
            + '<a:t>' + text + '</a:t></a:r><a:endParaRPr lang="zh-CN"/></a:p></a:txBody>'
            + '<a:tcPr marL="72000" marR="72000" marT="36000" marB="36000" anchor="t">'
            + '<a:lnL w="6350"><a:solidFill><a:srgbClr val="D8DEE9"/></a:solidFill></a:lnL>'
            + '<a:lnR w="6350"><a:solidFill><a:srgbClr val="D8DEE9"/></a:solidFill></a:lnR>'
            + '<a:lnT w="6350"><a:solidFill><a:srgbClr val="D8DEE9"/></a:solidFill></a:lnT>'
            + '<a:lnB w="6350"><a:solidFill><a:srgbClr val="D8DEE9"/></a:solidFill></a:lnB>'
            + '<a:solidFill><a:srgbClr val="' + fill + '"/></a:solidFill></a:tcPr></a:tc>';
        }).join('');
        return tr + tds + '</a:tr>';
      }).join('');
      return '<p:graphicFrame><p:nvGraphicFramePr>'
        + '<p:cNvPr id="' + id + '" name="' + xmlText(name || 'Table') + '"/>'
        + '<p:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></p:cNvGraphicFramePr>'
        + '<p:nvPr/></p:nvGraphicFramePr>'
        + '<p:xfrm><a:off x="' + x + '" y="' + y + '"/><a:ext cx="' + cx + '" cy="' + cy + '"/></p:xfrm>'
        + '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table">'
        + '<a:tbl><a:tblPr firstRow="' + (opts.header === false ? 0 : 1) + '" bandRow="1"/>'
        + '<a:tblGrid>' + grid + '</a:tblGrid>' + body + '</a:tbl>'
        + '</a:graphicData></a:graphic></p:graphicFrame>';
    }

    /** Build a valid .pptx from a list of {title, lines} and/or {title, table} slides. */
    function buildPptx(slides) {
      const parts = [];
      const contentTypes = [
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
        '<Default Extension="xml" ContentType="application/xml"/>',
        '<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>',
        '<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>',
        '<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>',
        '<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>',
      ];
      for (let index = 0; index < slides.length; index += 1) {
        contentTypes.push('<Override PartName="/ppt/slides/slide' + (index + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>');
      }
      contentTypes.push('</Types>');
      parts.push({ name: '[Content_Types].xml', data: contentTypes.join('') });
      parts.push({
        name: '_rels/.rels',
        data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
          + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
          + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>'
          + '</Relationships>',
      });

      const spTree = '<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>'
        + '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree>';

      parts.push({
        name: 'ppt/slideMasters/slideMaster1.xml',
        data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldMaster ' + P_NS + '>'
          + '<p:cSld>' + spTree + '</p:cSld>'
          + '<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>'
          + '<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>'
          + '</p:sldMaster>',
      });
      parts.push({
        name: 'ppt/slideMasters/_rels/slideMaster1.xml.rels',
        data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
          + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
          + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>'
          + '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/>'
          + '</Relationships>',
      });
      parts.push({
        name: 'ppt/slideLayouts/slideLayout1.xml',
        data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldLayout ' + P_NS + ' type="blank" preserve="1">'
          + '<p:cSld name="Blank">' + spTree + '</p:cSld>'
          + '<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>',
      });
      parts.push({
        name: 'ppt/slideLayouts/_rels/slideLayout1.xml.rels',
        data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
          + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
          + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>'
          + '</Relationships>',
      });
      const scheme = (name, value) => '<a:' + name + '><a:srgbClr val="' + value + '"/></a:' + name + '>';
      parts.push({
        name: 'ppt/theme/theme1.xml',
        data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
          + '<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Workbench">'
          + '<a:themeElements>'
          + '<a:clrScheme name="Workbench">'
          + '<a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1>'
          + '<a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>'
          + scheme('dk2', '1F2430') + scheme('lt2', 'EEF2F8')
          + scheme('accent1', '4C7DF0') + scheme('accent2', '7C5CFF') + scheme('accent3', '1F9E76')
          + scheme('accent4', 'C98A1B') + scheme('accent5', 'C2477A') + scheme('accent6', '2A93A8')
          + scheme('hlink', '2A5BD7') + scheme('folHlink', '8A5CD7')
          + '</a:clrScheme>'
          + '<a:fontScheme name="Workbench">'
          + '<a:majorFont><a:latin typeface="Segoe UI"/><a:ea typeface="Microsoft YaHei"/><a:cs typeface=""/></a:majorFont>'
          + '<a:minorFont><a:latin typeface="Segoe UI"/><a:ea typeface="Microsoft YaHei"/><a:cs typeface=""/></a:minorFont>'
          + '</a:fontScheme>'
          + '<a:fmtScheme name="Workbench">'
          + '<a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill>'
          + '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>'
          + '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst>'
          + '<a:lnStyleLst><a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln>'
          + '<a:ln w="12700"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln>'
          + '<a:ln w="19050"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst>'
          + '<a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle>'
          + '<a:effectStyle><a:effectLst/></a:effectStyle>'
          + '<a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>'
          + '<a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill>'
          + '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>'
          + '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst>'
          + '</a:fmtScheme></a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/></a:theme>',
      });

      const slideIds = [];
      const presentationRels = [
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>',
      ];
      slides.forEach((slide, index) => {
        const title = slide.title || '';
        const lines = (slide.lines || []).slice(0, 14);
        const hasTable = Array.isArray(slide.table) && slide.table.length > 0;
        // A slide is either a table (structured summary) or a bullet list (cover / notes).
        const tableHeight = clamp(slide.tableHeight || 3000000, 600000, 4416425);
        const body = hasTable
          ? pptxTable(3, 'Body', 838200, 1709738, 10515600, tableHeight, slide.table,
            { colWidths: slide.colWidths, header: slide.header !== false })
          : pptxTextBox(3, 'Body', 838200, 1709738, 10515600, 4416425,
            lines.length ? lines.map((line) => pptxParagraph(line, 1400, false)) : [pptxParagraph('—', 1400, false)]);
        parts.push({
          name: 'ppt/slides/slide' + (index + 1) + '.xml',
          data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld ' + P_NS + '><p:cSld>'
            + '<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>'
            + '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>'
            + pptxTextBox(2, 'Title', 838200, 457200, 10515600, 1000125, [pptxParagraph(title, 2400, true)])
            + body
            + '</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>',
        });
        parts.push({
          name: 'ppt/slides/_rels/slide' + (index + 1) + '.xml.rels',
          data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>'
            + '</Relationships>',
        });
        slideIds.push('<p:sldId id="' + (256 + index) + '" r:id="rId' + (index + 2) + '"/>');
        presentationRels.push('<Relationship Id="rId' + (index + 2) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide' + (index + 1) + '.xml"/>');
      });
      presentationRels.push('<Relationship Id="rId' + (slides.length + 2) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/>');
      presentationRels.push('</Relationships>');
      parts.push({ name: 'ppt/_rels/presentation.xml.rels', data: presentationRels.join('') });
      parts.push({
        name: 'ppt/presentation.xml',
        data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:presentation ' + P_NS + '>'
          + '<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>'
          + '<p:sldIdLst>' + slideIds.join('') + '</p:sldIdLst>'
          + '<p:sldSz cx="12192000" cy="6858000"/><p:notesSz cx="6858000" cy="9144000"/>'
          + '</p:presentation>',
      });
      return zipStore(parts);
    }

    /** Compact thousands so a metric fits in a table cell. */
    function formatK(value) {
      const n = Number(value) || 0;
      if (n >= 1000000) return (n / 1000000).toFixed(n >= 10000000 ? 0 : 1) + 'M';
      if (n >= 1000) return (n / 1000).toFixed(n >= 100000 ? 0 : 1) + 'K';
      return String(n);
    }

    const STOP_TOKENS = new Set([
      'the', 'and', 'for', 'with', 'that', 'this', 'from', 'was', 'were', 'has', 'have',
      'are', 'not', 'but', 'you', 'your', 'can', 'will', 'into', 'when', 'what', 'why',
      'how', 'fix', 'check', 'please', 'then', 'than', 'its', 'it', 'is', 'to', 'of',
      'in', 'on', 'at', 'a', 'an', 'do', 'does', 'did', 'my', 'me', 'we', 'our',
    ]);

    /** Distinctive words of a Chinese/English line, used to judge topic overlap. */
    function topicTokens(text) {
      const out = new Set();
      const source = String(text || '');
      // Latin words and identifiers.
      for (const word of source.toLowerCase().match(/[a-z][a-z0-9_-]{2,}/g) || []) {
        if (!STOP_TOKENS.has(word)) out.add(word);
      }
      // CJK bigrams, which is enough to spot "边缘流光" vs "绑定对话".
      const cjk = source.match(/[\u4e00-\u9fa5]+/g) || [];
      for (const run of cjk) {
        for (let i = 0; i + 2 <= run.length; i += 1) out.add(run.slice(i, i + 2));
      }
      return out;
    }

    function overlapRatio(a, b) {
      if (a.size === 0 || b.size === 0) return 0;
      let shared = 0;
      for (const token of a) if (b.has(token)) shared += 1;
      return shared / Math.min(a.size, b.size);
    }

    /** How many tokens two lines actually share (0 is the "different topic" signal). */
    function sharedTokens(a, b) {
      let shared = 0;
      for (const token of a) if (b.has(token)) shared += 1;
      return shared;
    }

    /**
     * A readable string for anything an error field holds. Tool errors arrive as objects as
     * often as strings, and the naive String(value) turns those into "[object Object]" —
     * which is worse than useless in a summary deck.
     */
    function errorText(value) {
      if (value == null) return '';
      if (typeof value === 'string') return value;
      if (typeof value === 'number' || typeof value === 'boolean') return String(value);
      if (typeof value === 'object') {
        for (const key of ['message', 'text', 'reason', 'error', 'detail', 'name', 'code']) {
          const found = value[key];
          if (typeof found === 'string' && found) return found;
        }
        const json = safe(() => JSON.stringify(value), '');
        return json && json !== '{}' ? json : '';
      }
      return '';
    }

    /**
     * Compress a session into the structured template the summary deck needs:
     * 主题 → 现象 / 根因 / 解法 / 结果, one slide per theme, tables where a table fits,
     * and every key number preserved.
     *
     * Pure and total: consecutive turns are clustered into themes by prompt-topic overlap
     * and by whether they touch the same files, then each theme's four fields are filled
     * from what the turn actually contains. Nothing here calls a model.
     */
    function summarizeConversation(model) {
      const source = model && typeof model === 'object' ? model : {};
      const turns = Array.isArray(source.turns) ? source.turns : [];
      const files = Array.isArray(source.files) ? source.files : [];
      const filesOf = (turn) => Array.from(turn.files || []);
      const duration = turns.reduce((total, turn) => total + (Number(turn.duration) || 0), 0);
      const lines = files.reduce((total, file) => total + (file.adds || 0) + (file.dels || 0), 0);

      // ---- cluster consecutive turns into themes ----
      // The comparison is always against the PREVIOUS TURN, not against a growing pool of
      // everything the theme has seen. A pool snowballs — every turn makes the next overlap
      // more likely — and one long session ends up as a single theme, which is exactly what
      // a summary must not do. Consecutive comparison tracks the real topic boundary.
      const themes = [];
      for (const turn of turns) {
        const topic = firstLine(String(turn.prompt || '').replace(/\s+/g, ' '), 70) || ('轮次 ' + turn.turn);
        const tokens = topicTokens(turn.prompt + ' ' + turn.reasoning + ' ' + turn.reply);
        const files = filesOf(turn);
        const previous = themes[themes.length - 1];
        if (previous) {
          const last = previous.lastTokens;
          const lastFiles = previous.lastFiles;
          const shared = sharedTokens(tokens, last);
          const overlap = overlapRatio(tokens, last);
          const sameFile = files.some((path) => lastFiles.has(path));
          // Same files AND the same subject => same theme.
          // Same files alone only counts when the wording still agrees.
          // Wording alone has to be a strong match to continue.
          const continues = (shared >= 2 && overlap >= 0.4)
            || (sameFile && shared >= 2 && overlap >= 0.25);
          if (continues) {
            previous.turns.push(turn);
            for (const path of files) previous.fileSet.add(path);
            previous.lastTokens = tokens;
            previous.lastFiles = new Set(files);
            continue;
          }
        }
        themes.push({
          topic, turns: [turn], tokens, fileSet: new Set(files),
          lastTokens: tokens, lastFiles: new Set(files),
        });
      }

      // ---- fill the four fields per theme ----
      const themeRows = themes.map((theme, index) => {
        const all = theme.turns;
        const prompts = all.map((turn) => String(turn.prompt || '')).filter(Boolean);
        const errors = all.reduce((total, turn) => total + (turn.errors || 0), 0);
        const calls = all.reduce((total, turn) => total + (turn.calls || 0), 0);
        const nodes = all.reduce((total, turn) => total + (Array.isArray(turn.nodes) ? turn.nodes.length : 0), 0);
        const failLines = [];
        const seenFailures = new Set();
        for (const turn of all) {
          for (const node of (Array.isArray(turn.nodes) ? turn.nodes : [])) {
            if (node.error) {
              const text = firstLine(errorText(node.error), 90);
              // The same failure repeats across dozens of calls; listing it once is enough.
              if (text && !seenFailures.has(text)) { seenFailures.add(text); failLines.push(text); }
            }
          }
        }
        const reasoning = all.map((turn) => String(turn.reasoning || '')).filter(Boolean).join('\n');
        const replies = all.map((turn) => String(turn.reply || '')).filter(Boolean).join('\n');
        // 作品: the tools used, and which files were actually touched.
        const toolCounts = new Map();
        for (const turn of all) {
          for (const node of (Array.isArray(turn.nodes) ? turn.nodes : [])) {
            if (node.kind === 'file') continue;
            if (!node.name) continue;
            toolCounts.set(node.name, (toolCounts.get(node.name) || 0) + 1);
          }
        }
        const toolList = [...toolCounts.entries()].sort((a, b) => b[1] - a[1])
          .slice(0, 6).map(([name, count]) => name + '×' + count);
        const changed = (model.files || [])
          .filter((file) => theme.fileSet.has(file.path))
          .sort((a, b) => (b.adds + b.dels) - (a.adds + a.dels));
        const fileList = changed.slice(0, 6)
          .map((file) => baseName(file.path) + ' +' + file.adds + '/−' + file.dels);
        // 结果: every key number this theme produced.
        const tokens = all.reduce((total, turn) => total + (turn.usage
          ? turn.usage.inputTokens + turn.usage.outputTokens : 0), 0);
        const seconds = all.reduce((total, turn) => total + (Number(turn.duration) || 0), 0);
        const localLines = changed.reduce((total, file) => total + file.adds + file.dels, 0);
        const numbers = [];
        numbers.push('轮次 ' + all.map((turn) => turn.turn).join('、'));
        if (seconds) numbers.push('用时 ' + Math.round(seconds / 1000) + 's');
        if (tokens) numbers.push('Token ' + formatK(tokens));
        if (calls) numbers.push('工具调用 ' + calls);
        if (nodes) numbers.push('节点 ' + nodes);
        if (localLines) numbers.push('改动 ' + localLines + ' 行');
        if (errors) numbers.push('错误 ' + errors);
        return {
          index: index + 1,
          topic: theme.topic,
          prompt: firstLine(prompts[0] || theme.topic, 60),
          effect: firstLine([prompts[0] || theme.topic].concat(failLines.slice(0, 1)).join(' / '), 170),
          cause: firstLine(failLines.join('；') || firstLine(reasoning, 190) || '未记录到显式根因（按对话内容归纳）', 190),
          fix: firstLine([
            toolList.length ? '动作：' + toolList.join('、') : '',
            fileList.length ? '改动：' + fileList.join('、') : '',
          ].filter(Boolean).join('  |  ') || '未记录到改动（以讨论/排查为主）', 190),
          result: firstLine(numbers.join(' · '), 190),
          numbers,
          errorText: failLines[0] ? firstLine(failLines[0], 70) : '',
        };
      });

      const summary = (source && source.summary) || {};
      return {
        turns: turns.length,
        themes: themeRows,
        metrics: {
          turns: summary.turns || turns.length,
          steps: summary.steps || 0,
          calls: summary.calls || 0,
          errors: summary.errors || 0,
          files: summary.files || files.length,
          lines,
          duration,
          tokens: summary.totals
            ? summary.totals.inputTokens + summary.totals.outputTokens : 0,
        },
      };
    }

    /**
     * Turn the summary into slides: a cover, one slide per theme laid out as a
     * 主题 / 现象 / 根因 / 解法 / 结果 table, then the theme index and the metrics.
     */
    function summaryToSlides(t, module, model, analysis) {
      const metrics = analysis.metrics;
      const slides = [];
      slides.push({
        title: t.summaryTitle,
        lines: [
          (module && module.name ? module.name + ' · ' : '') + t.consoleTitle,
          t.summaryCoverLine
            .replace('{turns}', String(metrics.turns))
            .replace('{themes}', String(analysis.themes.length)),
          t.kTurns + ' ' + metrics.turns + ' · ' + t.kSteps + ' ' + metrics.steps
            + ' · ' + t.kCalls + ' ' + metrics.calls + ' · ' + t.kErrors + ' ' + metrics.errors,
          t.kFiles + ' ' + metrics.files + ' · ' + t.kLines + ' ' + metrics.lines
            + (metrics.duration ? ' · ' + Math.round(metrics.duration / 1000) + 's' : '')
            + (metrics.tokens ? ' · Token ' + formatK(metrics.tokens) : ''),
        ],
      });

      analysis.themes.forEach((theme, index) => {
        slides.push({
          title: (index + 1) + '. ' + theme.topic,
          // One row per field of the template, exactly as asked for.
          table: [
            [t.summaryField, t.summaryValue],
            [t.summaryEffect, theme.effect],
            [t.summaryCause, theme.cause],
            [t.summaryFix, theme.fix],
            [t.summaryResult, theme.result],
          ],
          colWidths: [1900000, 8615600],
          tableHeight: 3400000,
          lines: [],
        });
      });

      // Where the numbers live, so nothing numeric is lost when a cell is truncated.
      if (analysis.themes.length) {
        slides.push({
          title: t.summaryKeyValues,
          table: [[t.summaryTheme, t.summaryNumbers]].concat(
            analysis.themes.map((theme) => [
              theme.topic,
              (theme.errorText ? t.kErrors + ': ' + theme.errorText + '  |  ' : '') + theme.numbers.join(' · '),
            ]),
          ),
          colWidths: [3200000, 7315600],
          tableHeight: 3600000,
          lines: [],
        });
      }

      slides.push({
        title: t.summaryTotals,
        table: [
          [t.summaryMetric, t.summaryValue],
          [t.kTurns, String(metrics.turns)],
          [t.kSteps, String(metrics.steps)],
          [t.kCalls, String(metrics.calls)],
          [t.kFiles, String(metrics.files)],
          [t.kLines, String(metrics.lines)],
          [t.kErrors, String(metrics.errors)],
          ['Token', formatK(metrics.tokens)],
          [t.summaryDuration, metrics.duration ? Math.round(metrics.duration / 1000) + 's' : '—'],
        ],
        colWidths: [3200000, 7315600],
        tableHeight: 3400000,
        lines: [],
      });
      return slides;
    }

    /** Copy text to the clipboard, with a textarea fallback for older engines. */
    function copyText(text) {
      const direct = window.navigator && window.navigator.clipboard && window.navigator.clipboard.writeText
        ? safe(() => window.navigator.clipboard.writeText(text), null) : null;
      if (direct && typeof direct.then === 'function') return direct.then(() => true, () => false);
      return Promise.resolve(false);
    }

    /**
     * The same summary as a Markdown outline — for pasting into notes, an issue or a doc
     * where a .pptx is the wrong shape.
     */
    function summaryMarkdown(t, module, analysis) {
      const metrics = analysis.metrics;
      const out = [];
      out.push('# ' + t.summaryTitle + (module && module.name ? ' · ' + module.name : ''));
      out.push('');
      out.push(t.summaryCoverLine
        .replace('{turns}', String(metrics.turns))
        .replace('{themes}', String(analysis.themes.length)));
      out.push('');
      out.push('| ' + t.summaryMetric + ' | ' + t.summaryValue + ' |');
      out.push('| --- | --- |');
      out.push('| ' + t.kTurns + ' | ' + metrics.turns + ' |');
      out.push('| ' + t.kSteps + ' | ' + metrics.steps + ' |');
      out.push('| ' + t.kCalls + ' | ' + metrics.calls + ' |');
      out.push('| ' + t.kFiles + ' | ' + metrics.files + ' |');
      out.push('| ' + t.kLines + ' | ' + metrics.lines + ' |');
      out.push('| ' + t.kErrors + ' | ' + metrics.errors + ' |');
      out.push('| Token | ' + formatK(metrics.tokens) + ' |');
      out.push('| ' + t.summaryDuration + ' | ' + (metrics.duration ? Math.round(metrics.duration / 1000) + 's' : '—') + ' |');
      analysis.themes.forEach((theme, index) => {
        out.push('');
        out.push('## ' + (index + 1) + '. ' + theme.topic);
        out.push('');
        out.push('| ' + t.summaryField + ' | ' + t.summaryValue + ' |');
        out.push('| --- | --- |');
        out.push('| ' + t.summaryEffect + ' | ' + theme.effect + ' |');
        out.push('| ' + t.summaryCause + ' | ' + theme.cause + ' |');
        out.push('| ' + t.summaryFix + ' | ' + theme.fix + ' |');
        out.push('| ' + t.summaryResult + ' | ' + theme.result + ' |');
      });
      return out.join('\n');
    }

    function downloadBlob(filename, blob) {
      const url = safe(() => window.URL.createObjectURL(blob), null);
      if (!url) return false;
      const anchor = window.document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      anchor.style.display = 'none';
      window.document.body.appendChild(anchor);
      anchor.click();
      window.document.body.removeChild(anchor);
      setTimeout(() => safe(() => window.URL.revokeObjectURL(url)), 20000);
      return true;
    }

    /** Print an isolated document so the browser can save it as PDF. */
    /**
     * The summary deck as a printable document — the same content as the .pptx, so a
     * quick read needs no PowerPoint.
     */
    function summaryDeckHtml(t, module, analysis) {
      const metrics = analysis.metrics;
      const esc = (value) => String(value == null ? '' : value)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const rows = analysis.themes.map((theme, index) => '<section class="slide">'
        + '<h2>' + (index + 1) + '. ' + esc(theme.topic) + '</h2>'
        + '<table>'
        + '<tr><th>' + esc(t.summaryEffect) + '</th><td>' + esc(theme.effect) + '</td></tr>'
        + '<tr><th>' + esc(t.summaryCause) + '</th><td>' + esc(theme.cause) + '</td></tr>'
        + '<tr><th>' + esc(t.summaryFix) + '</th><td>' + esc(theme.fix) + '</td></tr>'
        + '<tr><th>' + esc(t.summaryResult) + '</th><td>' + esc(theme.result) + '</td></tr>'
        + '</table></section>').join('');
      const keyRows = analysis.themes.map((theme) => '<tr><td>' + esc(theme.topic) + '</td><td>'
        + esc(theme.numbers.join(' · ')) + '</td></tr>').join('');
      return '<!doctype html><html><head><meta charset="utf-8"><title>'
        + esc(t.summaryTitle) + '</title><style>'
        + 'body{font:14px/1.65 "Segoe UI","Microsoft YaHei",system-ui;margin:32px;color:#1a1a1a}'
        + 'h1{font-size:24px;margin:0 0 6px}h2{font-size:17px;margin:26px 0 8px}'
        + 'table{border-collapse:collapse;width:100%;margin:0 0 8px}'
        + 'th,td{border:1px solid #d8dee9;padding:7px 10px;text-align:left;vertical-align:top}'
        + 'th{width:110px;background:#f4f7fb;font-weight:600}'
        + '.meta{color:#556;font-size:13px;margin-bottom:14px}'
        + '.slide{page-break-inside:avoid;break-inside:avoid}'
        + '</style></head><body>'
        + '<h1>' + esc(t.summaryTitle) + (module && module.name ? ' · ' + esc(module.name) : '') + '</h1>'
        + '<div class="meta">' + esc(t.summaryCoverLine
          .replace('{turns}', String(metrics.turns))
          .replace('{themes}', String(analysis.themes.length))) + '<br>'
        + esc(t.kTurns + ' ' + metrics.turns + ' · ' + t.kSteps + ' ' + metrics.steps + ' · '
          + t.kCalls + ' ' + metrics.calls + ' · ' + t.kFiles + ' ' + metrics.files + ' · '
          + t.kLines + ' ' + metrics.lines + ' · ' + t.kErrors + ' ' + metrics.errors
          + (metrics.tokens ? ' · Token ' + formatK(metrics.tokens) : '')) + '</div>'
        + rows
        + '<section class="slide"><h2>' + esc(t.summaryKeyValues) + '</h2>'
        + '<table><tr><th>' + esc(t.summaryTheme) + '</th><th style="width:auto">'
        + esc(t.summaryNumbers) + '</th></tr>' + keyRows + '</table></section>'
        + '</body></html>';
    }

    function printHtml(html) {
      const frame = window.document.createElement('iframe');
      frame.setAttribute('aria-hidden', 'true');
      frame.style.position = 'fixed';
      frame.style.right = '0';
      frame.style.bottom = '0';
      frame.style.width = '0';
      frame.style.height = '0';
      frame.style.border = '0';
      window.document.body.appendChild(frame);
      const doc = frame.contentWindow.document;
      doc.open();
      doc.write(html);
      doc.close();
      safe(() => frame.contentWindow.focus());
      safe(() => frame.contentWindow.print());
      setTimeout(() => safe(() => window.document.body.removeChild(frame)), 60000);
      return true;
    }

    function summaryDocument(t, module, turn) {
      const lines = [];
      const input = (turn.prompts || []).join('\n\n');
      const thinking = summarizeText(turn.reasoning, 200);
      const reply = summarizeText(turn.reply, 200);
      const changes = turn.nodes.filter((node) => node.kind === 'file');
      const calls = turn.nodes.filter((node) => node.kind === 'tool' || node.kind === 'file');
      return {
        title: (module ? module.name + ' · ' : '') + t.nodeTurn + ' ' + turn.index,
        meta: [
          turn.steps + ' ' + t.steps,
          turn.calls + ' ' + t.kCalls,
          turn.errors ? turn.errors + ' ' + t.kErrors : null,
          turn.usage ? formatCount(turn.usage.inputTokens) + ' in / ' + formatCount(turn.usage.outputTokens) + ' out' : t.noUsage,
          turn.duration !== undefined ? formatDuration(turn.duration) : null,
        ].filter(Boolean),
        input,
        thinking: thinking.text,
        thinkingSummarized: thinking.summarized,
        thinkingFull: turn.reasoning,
        reply: reply.text,
        replySummarized: reply.summarized,
        replyFull: turn.reply,
        changes: changes.map((node) => ({
          path: node.path || node.title,
          adds: node.args && typeof node.args.content === 'string' ? node.args.content.split('\n').length : 0,
          content: codeContentOf(node),
          raw: node.rawArgs,
        })),
        calls: calls.map((node) => ({ name: node.name || 'tool', summary: firstLine(node.rawArgs, 200), raw: node.rawArgs })),
      };
    }

    function summaryHtml(t, doc) {
      const block = (title, body) => '<h2>' + xmlEscape(title) + '</h2><pre>' + xmlEscape(body || '—') + '</pre>';
      return '<!doctype html><html><head><meta charset="utf-8"><title>' + xmlEscape(doc.title) + '</title>'
        + '<style>body{font:13px/1.7 "Segoe UI","Microsoft YaHei",sans-serif;margin:32px;color:#1b1f27}'
        + 'h1{font-size:20px;margin:0 0 4px}h2{font-size:13px;text-transform:uppercase;letter-spacing:.4px;color:#5a6472;margin:22px 0 6px}'
        + 'pre{white-space:pre-wrap;word-break:break-word;font:12px/1.6 ui-monospace,Consolas,monospace;background:#f4f6fa;padding:10px;border-radius:8px}'
        + '.meta{color:#5a6472;font-size:12px}</style></head><body>'
        + '<h1>' + xmlEscape(doc.title) + '</h1><div class="meta">' + xmlEscape(doc.meta.join(' · ')) + '</div>'
        + block(t.myInput, doc.input)
        + block(t.thinking + (doc.thinkingSummarized ? ' · ' + t.autoSummary : ''), doc.thinking)
        + block(t.reply + (doc.replySummarized ? ' · ' + t.autoSummary : ''), doc.reply)
        + block(t.sCode, doc.changes.map((change) => change.path + '\n' + (change.content || '')).join('\n\n'))
        + block(t.sArgs, doc.calls.map((call) => call.name + ' ' + call.summary).join('\n'))
        + '</body></html>';
    }

    function summarySlides(t, doc) {
      const slides = [{ title: doc.title, lines: doc.meta }];
      slides.push({ title: t.myInput, lines: wrapLines(doc.input, 12) });
      slides.push({ title: t.thinking + (doc.thinkingSummarized ? ' · ' + t.autoSummary : ''), lines: wrapLines(doc.thinking, 12) });
      slides.push({ title: t.reply + (doc.replySummarized ? ' · ' + t.autoSummary : ''), lines: wrapLines(doc.reply, 12) });
      for (const change of doc.changes) {
        slides.push({ title: change.path, lines: wrapLines(change.content || '—', 12) });
      }
      if (doc.calls.length) {
        slides.push({ title: t.sArgs, lines: doc.calls.slice(0, 12).map((call) => call.name + ' ' + call.summary) });
      }
      return slides;
    }

    function wrapLines(text, perLine) {
      const rows = String(text || '').split('\n').flatMap((line) => {
        const chunks = [];
        for (let index = 0; index < line.length; index += 90) chunks.push(line.slice(index, index + 90));
        return chunks.length ? chunks : [''];
      });
      if (rows.length <= perLine) return rows;
      return rows.slice(0, perLine - 1).concat(['… (' + (rows.length - perLine + 1) + ' more lines)']);
    }

    function codeContentOf(node) {
      const args = node.args && typeof node.args === 'object' ? node.args : null;
      if (!args) return '';
      if (typeof args.content === 'string') return args.content;
      if (typeof args.file_text === 'string') return args.file_text;
      if (typeof args.new_string === 'string') return args.new_string;
      if (typeof args.new_str === 'string') return args.new_str;
      return '';
    }

    //#endregion

    //#region summary pane (the middle column)

    // ---- the answer's typesetting ------------------------------------------------
    // The reply arrives as one plain block whose lines all look alike, which is what made a
    // long answer hard to read. These two helpers turn it into structured paragraphs and
    // colour the parts that carry information: figures, file paths, code, and failure words.
    // Everything here is a pure text transformation — no data is fetched or recomputed.
    const RICH_HEAD = /^\s{0,3}(#{1,4})\s+(.+?)\s*$/;
    // Models very often head a section with "#1. …" / "#1 …" rather than markdown's "# …".
    // Without this those lines rendered as ordinary body text and the structure was lost.
    const RICH_HASH_NUM = /^\s{0,3}#(\d{1,2})[.、)]?\s*(.+?)\s*$/;
    const RICH_RULE = /^\s*([-*_=])\1{2,}\s*$/;
    const RICH_NUM = /^\s*(\d{1,2})[.、)]\s+(.*)$/;
    const RICH_BULLET = /^\s*[-*•·]\s+(.*)$/;
    const RICH_WHOLE_BOLD = /^\s*\*\*(.+?)\*\*\s*[：:]?\s*$/;

    /** Inline pass: colours figures, paths, inline code and emphasis inside one line. */
    function richInline(text, keyPrefix) {
      const out = [];
      // The code-span marker is read from a char code so this file never needs a literal
      // backtick inside its own source.
      const TICK = String.fromCharCode(96);
      const source = String(text === undefined || text === null ? '' : text);
      const pattern = new RegExp(
        '(' + TICK + '[^' + TICK + ']{1,200}' + TICK + ')'
        + '|(\\*\\*[^*]{1,180}\\*\\*)'
        + '|((?:[A-Za-z]:[\\\\/]|res:\\/|\\.{0,2}\\/)[^\\s，。；：、）)】」]*\\.[A-Za-z0-9]{1,8})'
        + '|([+＋]\\d[\\d,]*\\s*(?:\\/|\\s)\\s*[−–-]\\d[\\d,]*)'
        + '|([+＋]\\d[\\d,]*|(?<![A-Za-z0-9.])−(?!\\d)[^\\s]*|(?<![A-Za-z0-9.])-\\d[\\d,]*)'
        + '|(\\d+(?:\\.\\d+)?\\s*(?:%|ms|s|KB|MB|GB|px|k|K|万|次|行|个|条|项|轮|步))'
        + '|(\\b(?:error|failed|failure|exception|timeout|refused|denied|aborted|crash)\\b)'
        + '|(\\b(?:ok|passed|success|fixed|done)\\b)',
        'gi');
      let last = 0;
      let match;
      let index = 0;
      while ((match = pattern.exec(source)) !== null) {
        if (match.index > last) out.push(source.slice(last, match.index));
        const token = match[0];
        const key = keyPrefix + '-t' + (index += 1);
        if (match[1] !== undefined) {
          out.push(h('code', { key, className: 'wsb-richCode' }, token.slice(1, -1)));
        } else if (match[2] !== undefined) {
          out.push(h('b', { key, className: 'wsb-richB' }, token.slice(2, -2)));
        } else if (match[3] !== undefined) {
          out.push(h('span', { key, className: 'wsb-richPath', title: token }, token));
        } else if (match[4] !== undefined) {
          out.push(h('span', { key, className: 'wsb-richUp' }, token));
        } else if (match[5] !== undefined) {
          out.push(h('span', {
            key, className: /^\s*[+＋]/.test(token) ? 'wsb-richUp' : 'wsb-richDown',
          }, token));
        } else if (match[6] !== undefined) {
          out.push(h('span', { key, className: 'wsb-richNum' }, token));
        } else if (match[7] !== undefined) {
          out.push(h('span', { key, className: 'wsb-richErr' }, token));
        } else {
          out.push(h('span', { key, className: 'wsb-richOk' }, token));
        }
        last = pattern.lastIndex;
        if (match.index === pattern.lastIndex) pattern.lastIndex += 1;
      }
      if (last < source.length) out.push(source.slice(last));
      return out;
    }

    /** Block pass: headers, list items, quotes and paragraphs. */
    function renderRichText(text) {
      const source = String(text === undefined || text === null ? '' : text).replace(/\r\n?/g, '\n');
      if (!source.trim()) return '—';
      const rawLines = source.split('\n');
      const out = [];
      let buffer = [];
      let key = 0;
      const flush = () => {
        if (buffer.length === 0) return;
        const joined = buffer.join(' ');
        out.push(h('p', { key: 'p' + (key += 1), className: 'wsb-richP' }, richInline(joined, 'p' + key)));
        buffer = [];
      };
      for (const raw of rawLines) {
        const line = raw.replace(/\s+$/, '');
        if (!line.trim()) { flush(); continue }
        if (RICH_RULE.test(line)) { flush(); continue }
        const head = RICH_HEAD.exec(line);
        if (head) {
          flush();
          out.push(h('div', { key: 'h' + (key += 1), className: 'wsb-richH' }, richInline(head[2], 'h' + key)));
          continue;
        }
        const hashNum = RICH_HASH_NUM.exec(line);
        if (hashNum) {
          flush();
          out.push(h('div', { key: 'h' + (key += 1), className: 'wsb-richH' },
            h('span', { className: 'wsb-richNum' }, '#' + hashNum[1]), ' ', richInline(hashNum[2], 'h' + key)));
          continue;
        }
        // A line that is entirely bold is a label in disguise, so it reads as a header too.
        const boldHead = !buffer.length ? RICH_WHOLE_BOLD.exec(line) : null;
        if (boldHead) {
          flush();
          out.push(h('div', { key: 'h' + (key += 1), className: 'wsb-richH' }, richInline(boldHead[1], 'h' + key)));
          continue;
        }
        const bullet = RICH_BULLET.exec(line);
        if (bullet) {
          flush();
          out.push(h('div', { key: 'l' + (key += 1), className: 'wsb-richLi' },
            h('i', null, '·'), h('span', null, richInline(bullet[1], 'l' + key))));
          continue;
        }
        const numbered = RICH_NUM.exec(line);
        if (numbered) {
          flush();
          out.push(h('div', { key: 'n' + (key += 1), className: 'wsb-richLi' },
            h('i', null, numbered[1] + '.'), h('span', null, richInline(numbered[2], 'n' + key))));
          continue;
        }
        if (/^\s*[>》]/.test(line)) {
          flush();
          out.push(h('div', { key: 'q' + (key += 1), className: 'wsb-richQuote' },
            richInline(line.replace(/^\s*[>》]\s?/, ''), 'q' + key)));
          continue;
        }
        buffer.push(line.trim());
      }
      flush();
      return out.length ? out : '—';
    }

    function SummaryBlock({ t, title, summarized, text, full, id, expanded, onToggle, tone, grow, rich }) {
      const open = Boolean(expanded[id]);
      const shown = open || !summarized ? (full || text) : text;
      return h('div', { className: 'wsb-sumBlock', 'data-block': id },
        h('div', { className: 'wsb-sumHead' },
          h('span', { className: 'wsb-miniHead', style: { margin: 0 } }, title),
          summarized
            ? h('button', {
              type: 'button', className: 'wsb-btn', 'data-expand': id,
              onClick: () => onToggle(id),
            }, open ? t.collapse : t.detail)
            : null),
        rich
          ? h('div', {
            className: 'wsb-sumBody wsb-rich', 'data-tone': tone, 'data-grow': grow ? 'true' : 'false',
          }, renderRichText(shown || ''))
          : h('div', { className: 'wsb-sumBody', 'data-tone': tone, 'data-grow': grow ? 'true' : 'false' }, shown || '—'));
    }

    function SummaryPane({ t, model, selection, notes, onNote, module }) {
      const [tab, setTab] = useState('dialogue');
      const [expanded, setExpanded] = useState(() => ({}));
      const [exportOpen, setExportOpen] = useState(false);

      const turn = useMemo(() => {
        if (!selection || selection.turnRef === undefined) return model.turns.length ? model.turns[model.turns.length - 1] : null;
        return model.turns.find((item) => item.turn === selection.turnRef) || null;
      }, [selection, model]);

      const toggle = (id) => setExpanded((previous) => Object.assign({}, previous, { [id]: !previous[id] }));

      if (!turn) {
        return h('div', { className: 'wsb-glass', style: { animationDelay: '55ms' } },
          h(PaneHead, { title: t.summary }),
          h('div', { className: 'wsb-empty' }, t.clickTurnHint));
      }

      const doc = summaryDocument(t, module, turn);
      const changes = turn.nodes.filter((node) => node.kind === 'file');
      // Session-wide ranking, shown as a strip above the tabs so it is visible whatever
      // tab is open — and in full inside 代码汇总.
      const ranked = (model.files || []).slice().sort((left, right) => (right.adds + right.dels) - (left.adds + left.dels));
      const calls = turn.nodes.filter((node) => node.kind === 'tool' || node.kind === 'file');
      const thinking = summarizeText(turn.reasoning, 200);
      const reply = summarizeText(turn.reply, 200);
      const input = (turn.prompts || []).join('\n\n');
      const noteValue = notes[turn.nodes.length ? turn.nodes[0].id : 'turn'] || '';

      const exportHtml = () => {
        setExportOpen(false);
        return printHtml(summaryHtml(t, doc));
      };
      const exportPpt = () => {
        setExportOpen(false);
        const blob = buildPptx(summarySlides(t, doc));
        return downloadBlob('workbench-turn-' + turn.index + '.pptx', blob);
      };

      const tabs = [
        { id: 'dialogue', label: t.sDialogue },
        { id: 'code', label: t.sCode },
        { id: 'args', label: t.sArgs },
        { id: 'note', label: t.tabNote },
        { id: 'files', label: t.fileImpactShort },
      ];

      let body;
      if (tab === 'dialogue') {
        body = h('div', null,
          h(SummaryBlock, {
            t, id: 'input', title: t.myInput, text: input, summarized: false, expanded, onToggle: toggle,
          }),
          h(SummaryBlock, {
            t, id: 'thinking', title: t.thinking,
            text: turnSynopsis(t, turn) + '\n' + t.synNote,
            full: [turn.reasoning, turn.narration].filter(Boolean).join('\n\n——\n\n'),
            summarized: Boolean(turn.reasoning || turn.narration), expanded, onToggle: toggle,
          }),
          h(SummaryBlock, {
            // The answer is what the user came to read: never summarised, given room, and
            // typeset (headers, lists, coloured figures / paths / code) rather than dumped.
            t, id: 'reply', title: t.reply, text: turn.reply, full: turn.reply,
            summarized: false, grow: true, rich: true, expanded, onToggle: toggle,
          }),
          h('div', { className: 'wsb-panelNote' },
            turn.steps + ' ' + t.steps + ' · ' + turn.calls + ' ' + t.kCalls
            + (turn.errors ? ' · ' + turn.errors + ' ' + t.kErrors : '')
            + (turn.usage ? ' · ' + formatCount(turn.usage.inputTokens) + ' in / ' + formatCount(turn.usage.outputTokens) + ' out' : '')));
      } else if (tab === 'code') {
        // 改动文件: the whole session's file ranking, the same numbers the overview shows,
        // with the files this turn touched marked. Below it, this turn's actual code.
        const ranked = (model.files || []).slice().sort((left, right) => (right.adds + right.dels) - (left.adds + left.dels));
        const turnPaths = new Set(changes.map((node) => node.path).filter(Boolean));
        body = h('div', null,
          h('div', { className: 'wsb-miniHead' }, t.fileImpact),
          ranked.length === 0
            ? h('div', { className: 'wsb-panelNote' }, t.noChanges)
            : h('div', { className: 'wsb-fileList', 'data-filelist': '1' }, ranked.map((file) => h('div', {
              key: file.path, className: 'wsb-fileItem',
              'data-turn': turnPaths.has(file.path) ? 'true' : 'false',
              title: file.path,
            },
              h('span', { className: 'wsb-filePath' }, file.path),
              h('span', { className: 'wsb-fileNum' }, '+' + file.adds + ' / −' + file.dels),
              h('span', { className: 'wsb-fileOps' }, file.ops + '×')))),
          changes.length
            ? h('div', null,
              h('div', { className: 'wsb-miniHead' }, t.sCode),
              changes.map((node) => {
                const content = codeContentOf(node);
                const removed = node.args && (node.args.old_string || node.args.old_str);
                const summary = summarizeText(content, 260);
                const open = Boolean(expanded['code-' + node.id]);
                const head = content.split('\n').length + ' lines'
                  + (node.args && node.args.content ? '' : removed ? ' · diff' : '');
                return h('div', { className: 'wsb-sumBlock', key: node.id, 'data-block': 'code-' + node.id },
                  h('div', { className: 'wsb-sumHead' },
                    h('span', { className: 'wsb-miniHead', style: { margin: 0 }, title: node.path || node.title }, node.title || node.path),
                    h('span', { className: 'wsb-badge' }, head),
                    h('button', {
                      type: 'button', className: 'wsb-btn', 'data-expand': 'code-' + node.id,
                      onClick: () => toggle('code-' + node.id),
                    }, open ? t.collapse : t.detail)),
                  open
                    ? h('div', { className: 'wsb-sumBody' },
                      removed ? h(CodeBlock, { text: removed, diff: 'del' }) : null,
                      h(CodeBlock, { text: content, diff: removed ? 'add' : null }))
                    : h('div', { className: 'wsb-sumBody' }, summary.text || '—'));
              }))
            : null);
      } else if (tab === 'args') {
        body = calls.length === 0
          ? h('div', { className: 'wsb-empty' }, t.noArgs)
          : h('div', null, calls.map((node) => {
            const open = Boolean(expanded['args-' + node.id]);
            return h('div', { className: 'wsb-sumBlock', key: node.id, 'data-block': 'args-' + node.id },
              h('div', { className: 'wsb-sumHead' },
                h('span', { className: 'wsb-miniHead', style: { margin: 0 } }, node.name || 'tool'),
                h('span', { className: 'wsb-badge' }, 'step ' + (node.step || '?')),
                h('button', {
                  type: 'button', className: 'wsb-btn', 'data-expand': 'args-' + node.id,
                  onClick: () => toggle('args-' + node.id),
                }, open ? t.collapse : t.detail)),
              h('div', { className: 'wsb-sumBody' }, open ? h(CodeBlock, { text: prettyJson(node.rawArgs) }) : firstLine(node.rawArgs, 180) || '—'));
          }));
      } else if (tab === 'files') {
        // 改动文件: this session's ranking. Open a row to read that file's code.
        const nodesByPath = {};
        for (const item of model.turns) {
          for (const node of item.nodes) {
            if (node.kind !== 'file' || !node.path) continue;
            (nodesByPath[node.path] = nodesByPath[node.path] || []).push(Object.assign({ turnIndex: item.index }, node));
          }
        }
        body = ranked.length === 0
          ? h('div', { className: 'wsb-empty' }, t.noChanges)
          : h('div', null, ranked.map((file) => {
            const open = Boolean(expanded['file-' + file.path]);
            const nodes = nodesByPath[file.path] || [];
            return h('div', { className: 'wsb-sumBlock', key: file.path, 'data-block': 'file-' + file.path },
              h('div', { className: 'wsb-sumHead' },
                h('span', { className: 'wsb-miniHead', style: { margin: 0 }, title: file.path }, baseName(file.path)),
                h('span', { className: 'wsb-badge' }, '+' + file.adds + ' / −' + file.dels),
                h('span', { className: 'wsb-badge' }, file.ops + '×'),
                h('button', {
                  type: 'button', className: 'wsb-btn', 'data-expand': 'file-' + file.path,
                  onClick: () => toggle('file-' + file.path),
                }, open ? t.collapse : t.detail)),
              open
                ? h('div', { className: 'wsb-sumBody' }, nodes.length
                  ? nodes.map((node) => {
                    const content = codeContentOf(node);
                    const removed = node.args && (node.args.old_string || node.args.old_str);
                    return h('div', { key: node.id, style: { marginBottom: '10px' } },
                      h('div', { className: 'wsb-chipText' }, t.nodeTurn + ' ' + node.turnIndex + ' · step ' + (node.step || '?')),
                      removed ? h(CodeBlock, { text: removed, diff: 'del' }) : null,
                      h(CodeBlock, { text: content || node.rawArgs || '', diff: removed ? 'add' : null }));
                  })
                  : h('div', { className: 'wsb-chipText' }, t.noCode))
                : h('div', { className: 'wsb-sumBody' },
                  firstLine(String((nodes[0] && (nodes[0].subtitle || nodes[0].rawArgs)) || file.path), 200)));
          }));
      } else {
        body = h('textarea', {
          className: 'wsb-input',
          style: { width: '100%', minHeight: '200px', resize: 'vertical' },
          value: noteValue,
          placeholder: t.notePlaceholder,
          onChange: (event) => onNote(turn.nodes.length ? turn.nodes[0].id : 'turn', event.target.value),
        });
      }

      return h('div', { className: 'wsb-glass', style: { animationDelay: '55ms' } },
        h(PaneHead, {
          title: t.summary,
        },
          h('span', { className: 'wsb-badge' }, t.nodeTurn + ' ' + turn.index),
          h('span', { className: 'wsb-badge' }, changes.length + ' ' + t.changedFilesN),
          h('span', { className: 'wsb-badge' }, calls.length + ' ' + t.toolCallsN),
          h('button', {
            type: 'button', className: 'wsb-btn', 'data-action': 'export',
            onClick: () => setExportOpen((value) => !value),
          }, '⤓ ' + t.export)),
        exportOpen
          ? h('div', { className: 'wsb-exportMenu', 'data-panel': 'export' },
            h('button', { type: 'button', className: 'wsb-btn', 'data-export': 'ppt', onClick: exportPpt }, t.exportPpt),
            h('button', { type: 'button', className: 'wsb-btn', 'data-export': 'pdf', onClick: exportHtml }, t.exportPdf))
          : null,
        h('div', { className: 'wsb-tabs' }, tabs.map((entry) => h('button', {
          key: entry.id, type: 'button', className: 'wsb-tab', 'data-tab': entry.id,
          'data-on': tab === entry.id ? 'true' : 'false',
          onClick: () => setTab(entry.id),
        }, entry.label))),
        h('div', { className: 'wsb-body wsb-xfade', key: tab }, body));
    }

    //#endregion

    function prettyJson(raw) {
      if (typeof raw !== 'string') {
        try { return JSON.stringify(raw, null, 2) } catch { return String(raw) }
      }
      try { return JSON.stringify(JSON.parse(raw), null, 2) } catch { return raw }
    }

    function SourcesPane({ t, model }) {
      const sources = useMemo(() => collectSources(model.turns), [model]);
      return h('div', { className: 'wsb-glass', style: { animationDelay: '55ms' } },
        h(PaneHead, { title: t.pSources, sub: sources.length + ' ' + t.sources }),
        h('div', { className: 'wsb-body' },
          sources.length === 0
            ? h('div', { className: 'wsb-empty' }, t.noSources)
            : sources.map((source, index) => h('div', { key: source.url + index, className: 'wsb-srcCard', style: { animationDelay: (index * 18) + 'ms' } },
              h('a', { href: source.url, target: '_blank', rel: 'noreferrer noopener' }, source.host + ' · ' + firstLine(source.url, 68)),
              h('p', null, source.snippet),
              h('div', { className: 'wsb-badges' },
                h('span', { className: 'wsb-badge' }, 'T' + source.turn),
                h('span', { className: 'wsb-badge' }, source.tool))))));
    }

    /** Apple-battery-style circular gauge: ring + one huge number + one small caption. */
    function RingTile({ t, ratio, value, caption, tone, glyph }) {
      const radius = 46;
      const circumference = 2 * Math.PI * radius;
      const filled = Math.max(0, Math.min(1, Number(ratio) || 0));
      // The ring starts empty and draws itself to the real reading on arrival.
      const settled = useSettle(90);
      const shown = settled ? filled : 0;
      return h('div', { className: 'wsb-ringTile', 'data-tone': tone, 'data-ring': String(Math.round(filled * 1000) / 1000) },
        h('div', { className: 'wsb-ringWrap' },
          h('svg', { className: 'wsb-ring', viewBox: '0 0 120 120', width: 128, height: 128, 'aria-hidden': 'true' },
            h('circle', { className: 'wsb-ringTrack', cx: 60, cy: 60, r: radius, fill: 'none', strokeWidth: 11 }),
            h('circle', {
              className: 'wsb-ringFill', cx: 60, cy: 60, r: radius, fill: 'none', strokeWidth: 11,
              strokeLinecap: 'round', transform: 'rotate(-90 60 60)',
              strokeDasharray: String(circumference), strokeDashoffset: String(circumference * (1 - shown)),
            })),
          h('span', { className: 'wsb-ringGlyph' }, glyph || '◎')),
        h('div', { className: 'wsb-ringValue' }, value),
        h('div', { className: 'wsb-ringCaption' }, caption));
    }

    function ProgressPane({ t, model, usage, pressure, breakdown, status, selectedId, onSelectTurn, hasMore, projects }) {
      const totals = model.summary.totals;
      // The entry that should play the white sweep when a turn is picked in the tree.
      const flashId = String(selectedId || '');
      const wire = usage && typeof usage === 'object' ? usage : EMPTY_OBJECT;
      const input = Number(wire.uncachedInputTokens || totals.inputTokens || 0);
      const output = Number(wire.outputTokens || totals.outputTokens || 0);
      const cacheRead = Number(wire.cacheReadTokens || totals.cacheReadTokens || 0);
      const cacheWrite = Number(wire.cacheWriteTokens || totals.cacheWriteTokens || 0);
      const contextWindow = Number(pressure && pressure.contextWindow) || model.contextWindow || 0;
      const pressureTokens = Number(pressure && pressure.pressureTokens) || 0;
      const projected = Number(pressure && pressure.projectedTokens) || pressureTokens;
      const remaining = contextWindow > 0 ? Math.max(0, contextWindow - projected) : 0;
      const ratio = contextWindow > 0 ? Math.min(1, projected / contextWindow) : 0;
      const tone = ratio > 0.9 ? 'err' : ratio > 0.72 ? 'warn' : undefined;
      const maxTurnTokens = model.turns.reduce((max, turn) => Math.max(max, turn.usage ? turn.usage.inputTokens + turn.usage.outputTokens : 0), 0) || 1;
      // The per-turn and per-project bars grow from zero into their share on arrival.
      const settled = useSettle(120);
      const lastTurn = model.turns.length ? model.turns[model.turns.length - 1] : null;
      // Every turn's share is computed against the whole session, so the bars sum to 100%.
      const grandTotal = model.turns.reduce((sum, turn) => sum + (turn.usage ? turn.usage.inputTokens + turn.usage.outputTokens : 0), 0) || 1;
      let runningShare = 0;
      const sessionRunning = Boolean(status && status.running);
      const unloaded = model.turns.filter((turn) => !turn.sawTimeline).length;

      return h('div', { className: 'wsb-glass', style: { animationDelay: '110ms' } },
        h(PaneHead, {
          title: t.pProgress,
        }),
        h('div', { className: 'wsb-body' },
          // Battery-style balance tile plus a label-free consumption strip.
          h('div', { className: 'wsb-tokenTop' },
            h(RingTile, {
              t,
              ratio: contextWindow > 0 ? remaining / contextWindow : 0,
              value: contextWindow > 0 ? formatCount(remaining) : '—',
              caption: contextWindow > 0 ? (t.remaining + ' ' + Math.round((remaining / contextWindow) * 1000) / 10 + '%') : t.noFacts,
              tone: contextWindow > 0 ? (remaining / contextWindow < 0.1 ? 'err' : remaining / contextWindow < 0.28 ? 'warn' : 'ok') : undefined,
              glyph: '◎',
            }),
            h('div', { className: 'wsb-tokenSide' },
              h('div', { className: 'wsb-chips' },
                h('span', { className: 'wsb-chip', title: t.input }, h('b', null, '↑'), formatCount(input)),
                h('span', { className: 'wsb-chip', title: t.output }, h('b', null, '↓'), formatCount(output)),
                h('span', { className: 'wsb-chip', title: t.cacheRead }, h('b', null, '⚡'), formatCount(cacheRead)),
                h('span', { className: 'wsb-chip', title: t.total }, h('b', null, 'Σ'), formatCount(input + output + cacheRead + cacheWrite))),
              h('div', { className: 'wsb-chips' },
                h('span', { className: 'wsb-chipText' }, t.sessionTotal),
                h('span', { className: 'wsb-chipText', 'data-dim': 'true' }, t.window + ' ' + (contextWindow > 0 ? formatCount(contextWindow) : '—'))),
              breakdown && typeof breakdown === 'object' && (breakdown.systemTokens || breakdown.toolsTokens || breakdown.messageTokens)
                ? h('div', { className: 'wsb-chips' },
                  h('span', { className: 'wsb-chip', title: t.systemTokens }, h('b', null, 'S'), formatCount(Number(breakdown.systemTokens) || 0)),
                  h('span', { className: 'wsb-chip', title: t.toolsTokens }, h('b', null, 'T'), formatCount(Number(breakdown.toolsTokens) || 0)),
                  h('span', { className: 'wsb-chip', title: t.messageTokens }, h('b', null, 'M'), formatCount(Number(breakdown.messageTokens) || 0)),
                  h('span', { className: 'wsb-chipText', 'data-dim': 'true' }, t.approx))
                : null,
              // This project against every other workbench project, drawn the same way as
              // the per-turn bars: length is the share of the largest consumer.
              projects && projects.length
                ? h('div', { className: 'wsb-projectBars', 'data-compare': '1' },
                  h('div', { className: 'wsb-chipText' }, t.compare),
                  projects.map((project) => {
                    const maxProject = projects.reduce((max, item) => Math.max(max, item.total), 0) || 1;
                    return h('div', {
                      key: project.name, className: 'wsb-projectRow',
                      'data-current': project.current ? 'true' : 'false',
                      'data-total': String(project.total),
                    },
                      h('span', { className: 'wsb-projectName', title: project.name }, project.name),
                      h('span', { className: 'wsb-projectTrack' },
                        h('i', { style: { width: (settled ? Math.max(2, (project.total / maxProject) * 100) : 0) + '%' } })),
                      h('span', { className: 'wsb-projectVal' }, project.total ? formatCount(project.total) : '—'));
                  }))
                : null)),
          unloaded > 0
            ? h('div', { className: 'wsb-panelNote', 'data-note': 'unloadedTurns' },
              t.notLoadedHint + '（' + unloaded + ' ' + t.turns + (hasMore ? ' · ↑' : '') + '）')
            : null,
          h('div', { style: { fontSize: '11px', color: 'var(--dsw-alias-label-secondary)', margin: '4px 0 7px' } }, t.perTurn),
          model.turns.length === 0
            ? h('div', { className: 'wsb-empty' }, t.noTurns)
            : h('div', { className: 'wsb-rounds' },
              model.turns.map((turn) => {
                const turnTotal = turn.usage ? turn.usage.inputTokens + turn.usage.outputTokens : 0;
                const share = turnTotal / grandTotal;
                runningShare += share;
                const cumulative = runningShare;
                const loaded = turn.sawTimeline;
                const isLast = turn === lastTurn;
                const reasonKind = turn.reason && turn.reason.kind;
                const running = loaded && !turn.reason && isLast && sessionRunning;
                const stateLabel = !loaded ? t.notLoaded
                  : reasonKind === 'error' ? t.failed
                    : reasonKind ? reasonKind
                      : running ? t.running : t.done;
                const stateTone = !loaded ? undefined : reasonKind === 'error' ? 'err' : running ? 'warn' : undefined;
                const detail = !loaded
                  ? t.notLoadedTurnHint
                  : turn.steps + ' ' + t.steps + ' · ' + turn.calls + ' ' + t.calls
                    + (turn.errors ? ' · ' + turn.errors + ' ' + t.errors : '')
                    + (turn.usage
                      ? ' · ' + formatCount(turn.usage.inputTokens) + ' ↑ / ' + formatCount(turn.usage.outputTokens) + ' ↓'
                      : ' · ' + t.noUsage);
                return h('div', {
                  key: turn.turn, className: 'wsb-round', 'data-loaded': loaded ? 'true' : 'false',
                  // The white sweep is tied to the tree selection, so clicking 轮次 3 lights up
                  // entry 3 here. It is a one-shot: leaving the row clears the flag.
                  'data-flash': flashId === 'turn-' + turn.turn ? 'true' : 'false',
                  onClick: () => onSelectTurn('turn-' + turn.turn),
                },
                  h('div', { className: 'wsb-roundTop' },
                    h('span', { className: 'wsb-roundNo' }, String(turn.index)),
                    h('span', { className: 'wsb-roundPrompt', title: turn.prompt }, firstLine(turn.prompt, 72) || t.pending),
                    h('span', { className: 'wsb-roundShare' }, share ? (Math.round(share * 1000) / 10) + '%' : '—')),
                  // The bar is this turn's share of every token the session has spent, so
                  // the bars add up to the whole; the tick is the running total.
                  h('div', {
                    className: 'wsb-shareTrack',
                    'data-share': String(Math.round(share * 1000) / 10),
                    'data-cumulative': String(Math.round(cumulative * 1000) / 10),
                  },
                    h('i', { style: { width: (settled ? Math.max(1.5, share * 100) : 0) + '%' } }),
                    h('b', { style: { left: Math.min(100, cumulative * 100) + '%' } })),
                  h('div', { className: 'wsb-roundSub' },
                    h('span', { className: 'wsb-badge', 'data-tone': stateTone }, stateLabel),
                    ' ' + detail,
                    turnTotal ? ' · ' + t.cumulative + ' ' + (Math.round(cumulative * 1000) / 10) + '%' : '',
                    loaded && turn.duration !== undefined ? ' · ' + formatDuration(turn.duration) : ''));
              }))));
    }

    function TokenPane({ t, model, usage, pressure, breakdown }) {
      const wire = usage && typeof usage === 'object' ? usage : EMPTY_OBJECT;
      const contextWindow = Number(pressure && pressure.contextWindow) || model.contextWindow || 0;
      const projected = Number(pressure && pressure.projectedTokens) || Number(pressure && pressure.pressureTokens) || 0;
      const rows = [
        [t.input, formatCount(Number(wire.uncachedInputTokens) || model.summary.totals.inputTokens)],
        [t.output, formatCount(Number(wire.outputTokens) || model.summary.totals.outputTokens)],
        [t.cacheRead, formatCount(Number(wire.cacheReadTokens) || model.summary.totals.cacheReadTokens)],
        [t.cacheWrite, formatCount(Number(wire.cacheWriteTokens) || model.summary.totals.cacheWriteTokens)],
        [t.window, contextWindow ? formatCount(contextWindow) : '—'],
        [t.projected, projected ? formatCount(projected) : '—'],
        [t.remaining, contextWindow ? formatCount(Math.max(0, contextWindow - projected)) : '—'],
        [t.systemTokens, formatCount(Number(breakdown && breakdown.systemTokens) || 0)],
        [t.toolsTokens, formatCount(Number(breakdown && breakdown.toolsTokens) || 0)],
        [t.messageTokens, formatCount(Number(breakdown && breakdown.messageTokens) || 0)],
      ];
      return h('div', { className: 'wsb-glass', style: { animationDelay: '150ms' } },
        h(PaneHead, { title: t.pTokens, sub: t.approx }),
        h('div', { className: 'wsb-body' },
          h('dl', { className: 'wsb-kv' }, rows.map((row, index) => [
            h('dt', { key: 'k' + index }, row[0]),
            h('dd', { key: 'v' + index }, row[1]),
          ]))));
    }

    function TokenStrip({ t, model, usage, pressure }) {
      const wire = usage && typeof usage === 'object' ? usage : EMPTY_OBJECT;
      const input = Number(wire.uncachedInputTokens) || model.summary.totals.inputTokens;
      const output = Number(wire.outputTokens) || model.summary.totals.outputTokens;
      const contextWindow = Number(pressure && pressure.contextWindow) || model.contextWindow || 0;
      const projected = Number(pressure && pressure.projectedTokens) || Number(pressure && pressure.pressureTokens) || 0;
      const ratio = contextWindow > 0 ? Math.min(1, projected / contextWindow) : 0;
      return h('div', { className: 'wsb-glass', style: { animationDelay: '150ms' } },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: '12px', padding: '9px 14px', flexWrap: 'wrap', fontSize: '11.5px' } },
          h('span', { className: 'wsb-badge' }, t.input + ' ' + formatCount(input)),
          h('span', { className: 'wsb-badge' }, t.output + ' ' + formatCount(output)),
          h('span', { className: 'wsb-badge' }, t.remaining + ' ' + (contextWindow ? formatCount(Math.max(0, contextWindow - projected)) : '—')),
          h('span', { style: { flex: '1 1 140px', minWidth: '120px' } },
            h('span', { className: 'wsb-gauge', style: { margin: 0 } },
              h('i', { style: { width: Math.round(ratio * 100) + '%' }, 'data-tone': ratio > 0.9 ? 'err' : ratio > 0.72 ? 'warn' : undefined }))),
          h('span', { className: 'wsb-badge' }, Math.round(ratio * 1000) / 10 + '%')));
    }

    //#endregion

    //#region presets

    /** Every pane the console can show; the user composes the set per module. */
    const PANE_KINDS = ['tree', 'mid', 'progress', 'trail', 'tokens'];

    const PRESETS = {
      triple: { cols: 'minmax(258px,1.16fr) minmax(220px,1fr) minmax(220px,0.95fr)', panes: ['tree', 'mid', 'progress'], strip: false },
      duo: { cols: 'minmax(250px,1fr) minmax(250px,1fr)', panes: ['tree', 'mid'], strip: true },
      focus: { cols: 'minmax(280px,1fr)', panes: ['tree'], strip: true },
      quad: { cols: 'minmax(210px,1fr) minmax(210px,1fr) minmax(200px,1fr) minmax(190px,0.9fr)', panes: ['tree', 'mid', 'progress', 'tokens'], strip: false },
    };

    //#endregion

    //#region home + console + app shell

    function WorkbenchInput({ value, placeholder, onSubmit, onCancel, autoFocus }) {
      const [draft, setDraft] = useState(value || '');
      const ref = useRef(null);
      useEffect(() => { if (autoFocus && ref.current) safe(() => ref.current.focus()) }, [autoFocus]);
      return h('input', {
        ref, className: 'wsb-input', value: draft, placeholder,
        onChange: (event) => setDraft(event.target.value),
        onKeyDown: (event) => {
          if (event.key === 'Enter' && draft.trim()) { onSubmit(draft.trim()); setDraft('') }
          else if (event.key === 'Escape') { if (onCancel) onCancel(); setDraft('') }
        },
        onBlur: () => { if (draft.trim() && onSubmit) { onSubmit(draft.trim()); setDraft('') } },
      });
    }

    /**
     * The tile marks: one monoline drawing per module kind.
     *
     * The first version was drawn by eye — coordinates like 4.4 / 15.2, an app-icon rounded rect
     * for the gamepad, angles that were not multiples of 45°, element gaps that varied from 1.5 px
     * to 6 px. Individually nothing was obviously wrong; together they read as amateur, because
     * the eye compares marks rather than inspecting one. So this set is *constructed* to a
     * published specification instead of to taste, taken from the icon-pack canon (Lucide /
     * Tabler / Feather, with Heroicons' lighter outline weight) and IBM Carbon's size-banded stroke:
     *
     *   | rule | value | why this set uses it |
     *   | --- | --- | --- |
     *   | canvas | 24 × 24 | the canon; every guide assumes it |
     *   | live area | 2 → 22 (2px padding) | Lucide asks for ≥1px; 2 keeps the hairline's outer edge (0.75) clear of the frame |
     *   | stroke | 1.5 px, non-scaling | Heroicons' outline weight — "for dense UIs a 2px stroke can feel heavy", and this is an IDE-like product |
     *   | caps / joins | round / round | the canon |
     *   | fills | none | stroke-only |
     *   | angles | multiples of 45° (Ant Design) | construction, not sketching |
     *   | coordinates | whole units | Lucide's pixel-grid snap: anchor points and arc centres on whole pixels |
     *   | element gap | ≥ 2 px | the canon's minimum spacing between distinct elements |
     *
     * Two consequences worth stating, because they are the whole reason the set now looks like a
     * set: every mark is built from **straight segments only** (so the 45° rule is mechanically
     * checkable rather than aspirational), and every mark is described by a one-line **metaphor**
     * that is fixed in advance. The reference material calls the second one an icon vocabulary and
     * warns that without it "settings" becomes a gear on one icon and a slider on the next — the
     * same drift is what made the old gamepad sit next to a globe next to a magnifier.
     *
     * The vocabulary:
     *
     *   game      an arcade chevron inside a diamond       (play, not a gamepad — a console is a tool)
     *   notebook  a bound page with spiral rings and rules (a page, bound, with something written on it)
     *   news      a broadsheet front page                  (masthead rule, two columns, one picture box)
     *   research  three stacked planes                     (a vault of layers, not a magnifying glass)
     *   stock     a rising line over a baseline            (a quote over time, not a coin)
     *   blank     a square with its diagonal               (an unknown module, drawn as an empty plate)
     */
    const GLYPH_STROKE = 1.5;
    /** The tile mark is drawn large, so its stroke is measured in the artwork's 24-unit
        viewBox: ~0.16 renders as a ~2px hairline on a full-size tile, and it thickens with
        the mark instead of vanishing. */
    const MARK_STROKE = 0.16;
    const GLYPH_LIVE = 2;
    /**
     * Two more rules came out of the review grid (`tools/preview-glyphs.mjs`), because the first
     * constructed draft still looked uneven in a row:
     *
     *   | rule | value | what it fixed |
     *   | --- | --- | --- |
     *   | optical coverage | every mark spans 18 of the 20 live units (90%) | the draft ranged from 65% (research) to 100% (game), which read as different icon sizes |
     *   | one spine, no combs | no element crosses another's edge more than once | notebook's spiral rings stuck 2 units into the page and turned the mark into a rake at 24 px |
     */
    const MARKS = {
      game: [
        'M12 3L21 12L12 21L3 12Z',
        'M15 12L11 8L11 16Z',
      ],
      notebook: [
        'M7 3H19V21H7Z',
        'M10 3V21',
        'M12 9H17',
        'M12 13H17',
        'M12 17H17',
      ],
      news: [
        'M3 6H21V18H3Z',
        'M3 10H21',
        'M6 13H11',
        'M6 16H11',
        'M14 13H18V16H14Z',
      ],
      /* 股票市场: a rising line over a baseline. Straight segments on whole units, 45° only, and
         it spans 18 of the 20 live units like every other mark — see the spec table above and
         `test/render-check.cjs`, which measures the coverage rather than trusting this comment.
         A line was chosen over a coin or a ¥ because the module reads *indices*, and an index is
         a shape over time, not a thing you own. */
      stock: [
        'M3 13L8 8L13 13L18 8L21 11',
        'M3 16H21',
      ],
      research: [
        'M7 3H21L17 7H3Z',
        'M7 9H21L17 13H3Z',
        'M7 15H21L17 19H3Z',
      ],
      blank: [
        'M3 3H21V21H3Z',
        'M3 3L21 21',
      ],
    };

    /**
     * The tile mark. Every shape carries `pathLength="1"`, so one dash rule draws all of them, and
     * each gets its own delay: the mark looks *penned* on entry rather than faded in. `drawKey` is
     * part of each path's React key, so entering the desktop remounts the paths and replays it.
     */
    function ModuleGlyph({ kind, drawKey }) {
      const lines = MARKS[kind] || MARKS.blank;
      return h('svg', {
        // Named, so the review grid and the self-test can check each mark against the spec from
        // what actually renders rather than from a regular expression over the source.
        'data-mark': kind,
        className: 'wsb-mark', viewBox: '0 0 24 24', width: 46, height: 46,
        fill: 'none', stroke: 'currentColor', strokeWidth: MARK_STROKE,
        strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true',
      }, lines.map((d, index) => h('path', {
        key: String(drawKey || 0) + '-' + index,
        d, pathLength: 1, className: 'wsb-markLine',
        style: { '--wsb-d': (index * 0.13).toFixed(2) + 's' },
      })));
    }

    /** The set the marks are checked against; exported for the self-test through a global. */
    ModuleGlyph.marks = MARKS;
    ModuleGlyph.stroke = GLYPH_STROKE;
    ModuleGlyph.live = GLYPH_LIVE;

    //#region background

    /**
     * 曲面的位移图: 用 canvas 现算一张法线图, 不依赖任何图片资源.
     *   · 位移量随半径三次方增大 —— 中心几乎不动、靠边强烈弯折, 像一块厚玻璃的边缘;
     *   · 附带一点凸起(凹凸镜的"凸"), 由 dome 项给出;
     *   · R/G 通道分别编码 x/y 方向的位移, 0.5 表示不位移(feDisplacementMap 的约定).
     * 只在浏览器里有 canvas 时生成, 失败则返回空串.
     */
    let lensMapCache = { key: '', url: '' };
    /**
     * 曲面用的位移图. 做法与 GitHub 上公开的实现一致(此处以字符串现拼, 不依赖 canvas):
     *   · 底 #808080 = 不位移(feDisplacementMap 以 128 为零点);
     *   · Y 渐变 #0F0→#000 走绿通道(即 y 位移), X 渐变 #F00→#000 走红通道(x 位移), screen 叠加;
     *   · 最后盖一块"内缩 depth 的圆角矩形"(灰、模糊过): 这块是**不位移区**, 于是只有边缘一圈
     *     depth 宽被弯折 —— 这个 depth 就是玻璃的壁厚, 也是"厚度"的唯一来源;
     *   · 渐变的起止按 radius 内缩, 让位移在四角/边缘达到最大.
     * 需要按元素尺寸重建, 所以缓存一个默认尺寸的结果.
     */
    function lensMapUrl(size, depth) {
      const px = size || 256;
      const wall = depth || 32;
      const inset = Math.round((48 / px) * 15 * px / 100);   // 与社区实现的渐变内缩一致
      const radius = 48;
      const key = px + ':' + wall;
      if (lensMapCache && lensMapCache.key === key) return lensMapCache.url;
      let url = '';
      try {
        const canvas = document.createElement('canvas');
        canvas.width = px;
        canvas.height = px;
        const context = canvas.getContext('2d');
        if (!context) return '';
        const image = context.createImageData(px, px);
        const data = image.data;
        const span = Math.max(1, px - 2 * inset);
        const cl = (value) => Math.max(0, Math.min(1, value));
        for (let y = 0; y < px; y += 1) {
          for (let x = 0; x < px; x += 1) {
            // 社区配方: R 沿 x 从 255 降到 0, G 沿 y 从 255 降到 0 —— 两侧都向"外"推, 于是成为透镜.
            const rx = 1 - cl((x - inset) / span);
            const ry = 1 - cl((y - inset) / span);
            let dx = rx * 255;
            let dy = ry * 255;
            // 内缩的圆角矩形 = "不位移区"; 用圆角矩形的符号距离加平滑过渡, 等价于社区那张图里的
            // "内缩 depth 的圆角矩形 + blur(depth)" —— 于是只有边缘一圈被弯折, 那就是壁厚.
            const half = px / 2;
            const boxHalf = half - wall - radius;
            const qx = Math.abs(x - half + 0.5) - boxHalf;
            const qy = Math.abs(y - half + 0.5) - boxHalf;
            const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
            const inside = Math.min(Math.max(qx, qy), 0);
            const distance = outside + inside - radius;
            const flat = cl(0.5 - distance / wall);       // 1 = 深处(不位移), 0 = 边缘(位移最大)
            dx += (128 - dx) * flat;
            dy += (128 - dy) * flat;
            const k = (y * px + x) * 4;
            data[k] = Math.round(cl(dx / 255) * 255);
            data[k + 1] = Math.round(cl(dy / 255) * 255);
            data[k + 2] = 128;
            data[k + 3] = 255;
          }
        }
        context.putImageData(image, 0, 0);
        url = canvas.toDataURL('image/png');
      } catch (error) {
        url = '';
      }
      lensMapCache = { key, url };
      return url;
    }

    function AuroraBlobs() {
      return [0, 1, 2, 3].map((index) => h('i', { key: index }));
    }

    function BackgroundLayer({ background, mediaSrc, mediaKind, paused, onMediaError }) {
      // A full-screen `filter: blur()` on a playing video is re-rasterised every frame, so the
      // custom background deliberately ignores the blur knob: an image may still take it.
      const blurred = background.blur > 0 && mediaKind !== 'video';
      const filters = [];
      // Gentler than v2: 100 no longer means a 26px smear over the whole window.
      if (blurred) filters.push('blur(' + (background.blur / 100 * 14).toFixed(1) + 'px)');
      const mediaStyle = filters.length ? { filter: filters.join(' ') } : undefined;
      // Media wins whenever there is one: no mode to get wrong.
      const showMedia = Boolean(mediaSrc);
      const scrim = (showMedia ? 0.85 : 0.35) * clamp(background.dim, 0, 100) / 100;
      const gridShape = GRID_SHAPES[background.gridShape] ? background.gridShape : 'none';
      const videoRef = useRef(null);

      // Performance: a custom background REPLACES the aurora rather than sitting under it, and
      // the video only runs while the workbench is actually visible. Together those two remove
      // every animation the compositor was running in the background.
      useEffect(() => {
        const node = videoRef.current;
        if (!node) return undefined;
        const apply = () => {
          const hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';
          if (paused || hidden) safe(() => node.pause());
          else safe(() => { node.play() });
        };
        apply();
        if (typeof document === 'undefined' || typeof document.addEventListener !== 'function') return undefined;
        document.addEventListener('visibilitychange', apply);
        return () => { safe(() => document.removeEventListener('visibilitychange', apply)) };
      }, [paused, mediaSrc]);

      return h('div', { className: 'wsb-bg', 'aria-hidden': 'true' },
        // The aurora is not rendered at all behind a custom background: no blobs, no hue
        // rotation, no blur layer — nothing for the compositor to keep painting.
        showMedia ? null : h('div', { className: 'wsb-aurora' }, h(AuroraBlobs, null)),
        showMedia && mediaKind === 'video'
          ? h('video', {
            className: 'wsb-bgMedia', 'data-blurred': blurred ? 'true' : 'false',
            'data-paused': paused ? 'true' : 'false',
            src: mediaSrc, style: mediaStyle,
            autoPlay: true, loop: true, muted: !background.mediaSound, playsInline: true, preload: 'auto',
            onError: onMediaError,
            ref: (node) => {
              videoRef.current = node || null;
              // Playback speed is a media-only control under 视频·图片设置.
              if (node) safe(() => { node.playbackRate = clamp(background.mediaSpeed, 25, 200) / 100 });
                  // React 对 muted 的更新路径不够可靠，这里再设一次。
                  if (node) safe(() => { node.muted = !background.mediaSound });
            },
          })
          : null,
        showMedia && mediaKind !== 'video'
          ? h('img', {
            className: 'wsb-bgMedia', 'data-blurred': blurred ? 'true' : 'false',
            src: mediaSrc, style: mediaStyle, alt: '', onError: onMediaError,
          })
          : null,
        h('div', { className: 'wsb-bgScrim', style: { opacity: scrim } }),
        gridShape !== 'none'
          ? h('div', {
            className: 'wsb-bgGrid', 'data-shape': gridShape,
            style: { opacity: clamp(background.grid || 40, 0, 100) / 100 * 0.5 },
          })
          : null);
    }

    /** Minimal line icons for the dock — one stroke weight, no fills. */
    function DockIcon({ name }) {
      const common = {
        viewBox: '0 0 24 24', width: 19, height: 19, fill: 'none', stroke: 'currentColor',
        strokeWidth: 1.55, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true,
      };
      if (name === 'background') {
        return h('svg', common,
          h('rect', { x: 3, y: 4.5, width: 18, height: 15, rx: 3.6 }),
          h('circle', { cx: 8.6, cy: 10.1, r: 1.55 }),
          h('path', { d: 'M4 17.2l5.2-5 3.4 3.2 3.3-2.9 4.1 4' }));
      }
      if (name === 'appearance') {
        return h('svg', common,
          h('circle', { cx: 9.3, cy: 9.3, r: 5.3 }),
          h('circle', { cx: 14.7, cy: 14.7, r: 5.3, opacity: '0.5' }));
      }
      if (name === 'shape') {
        return h('svg', common,
          h('rect', { x: 3.5, y: 3.5, width: 8, height: 8, rx: 2.4 }),
          h('circle', { cx: 17.5, cy: 7.5, r: 4 }),
          h('rect', { x: 3.5, y: 13.5, width: 8, height: 8, rx: 4 }),
          h('rect', { x: 13.5, y: 13.5, width: 8, height: 8, rx: 1 }));
      }
      if (name === 'aurora') {
        return h('svg', common,
          h('path', { d: 'M11.4 3.4l1.7 4.6 4.6 1.7-4.6 1.7-1.7 4.6-1.7-4.6L5.1 9.7l4.6-1.7z' }),
          h('path', { d: 'M18.1 15.4l.7 1.9 1.9.7-1.9.7-.7 1.9-.7-1.9-1.9-.7 1.9-.7z' }));
      }
      if (name === 'layout') {
        return h('svg', common,
          h('rect', { x: 3.5, y: 4.5, width: 7, height: 15, rx: 2.2 }),
          h('rect', { x: 13.5, y: 4.5, width: 7, height: 9, rx: 2.2 }),
          h('path', { d: 'M13.5 17.5h7' }));
      }
      if (name === 'plus') return h('svg', common, h('path', { d: 'M12 5.6v12.8M5.6 12h12.8' }));
      if (name === 'reset') {
        return h('svg', common,
          h('path', { d: 'M20 12a8 8 0 1 1-2.7-6' }),
          h('path', { d: 'M20 3.6v4.6h-4.6' }));
      }
      return h('svg', common, h('circle', { cx: 12, cy: 12, r: 8 }));
    }

    /** A label / slider / value row on a grid, so the three can never overlap. */
    function FieldSlider({ label, value, low, high, onChange, name }) {
      return h('div', { className: 'wsb-field' },
        h('label', { title: label }, label),
        h('input', {
          className: 'wsb-range', type: 'range', min: low, max: high, value: value,
          'data-slider': name || label, 'aria-label': label,
        // 已填充比例由这里下发: WebKit 的轨道渐变需要它, 否则蓝色不跟圆点.
        style: {
          '--wsb-range-fill': (((clamp(value, low, high) - low) / Math.max(1, high - low)) * 100).toFixed(2) + '%',
        },
          onChange: (event) => onChange(clamp(event.target.value, low, high)),
        }),
        h('output', null, String(Math.round(value))));
    }

    function FieldSwitch({ label, on, onFlip, name }) {
      return h('div', { className: 'wsb-fieldSwitch' },
        h('span', null, label),
        h('button', {
          type: 'button', className: 'wsb-switch', role: 'switch', 'data-switch': name || label,
          'aria-checked': on ? 'true' : 'false', 'aria-label': label, onClick: onFlip,
        }));
    }

    function SwatchDots({ colors }) {
      return h('span', { className: 'wsb-swatchDots' }, colors.map((color, index) => h('i', { key: index, style: { background: color } })));
    }

    /**
     * One self-contained background control: a three-way mode selector on top, the
     * settings for the active mode in the middle, then the shared adjustment rows.
     */
    /**
     * 桌面设置 — the single control for the desktop surface. Background type is either
     * the flowing aurora or a video/image (mutually exclusive, never layered); surface
     * effects cover the pattern and every dynamic parameter; media settings cover blur
     * and playback speed.
     */
    /**
     * 动态设置 — the flowing background and nothing else. Every knob maps to a real CSS
     * variable, and each range is deliberately wide: 形变幅度 at maximum is a heavy,
     * genuinely distorted morph, not a subtle wobble.
     */
    function DynamicPanel({ t, appearance, background, patch, onAuroraColor, onReset, media, activeKey, onPick, onRemove, onSelect }) {
      const items = Array.isArray(media) ? media : [];
      // 双击文件名就地重命名：Enter 提交、Esc 取消、失焦提交。
        const [renaming, setRenaming] = useState('');
        const [draft, setDraft] = useState('');
        const commitRename = () => {
          const next = String(draft || '').trim();
          const key = renaming;
          setRenaming('');
          if (!key || !next) return;
          patch({ media: (background.media || []).map((item) => (item.key === key ? { ...item, name: next } : item)) });
        };
        const active = items.find((item) => item.key === activeKey) || null;
      const custom = background.mode === 'media';
      const button = (label, action, onClick) => h('button', {
        type: 'button', className: 'wsb-btn', 'data-action': action, style: { flex: '1 1 0' }, onClick,
      }, label);
      return h('div', null,
        // 自定义界面 replaces the aurora rather than layering over it, so it is the first
        // thing in the panel — and the only thing that can silence the background entirely.
        h('div', { className: 'wsb-switchRow' },
          h('span', { className: 'wsb-switchLabel' }, t.customBg),
          h('button', {
            type: 'button', className: 'wsb-switch', role: 'switch',
            'aria-checked': custom ? 'true' : 'false', 'aria-label': t.customBg, 'data-custom-bg': '1',
            onClick: () => {
              if (custom) { patch({ mode: 'aurora' }); return }
              // Turning it on with nothing chosen opens the picker straight away.
              if (!active) { onPick(); return }
              patch({ mode: 'media', activeKey: active.key });
            },
          })),
        h('div', { className: 'wsb-switchHint', 'data-hint': 'customState' },
          custom ? t.customOn : t.customOff),
        custom && active
          ? h('div', { className: 'wsb-customRow', 'data-media-active': active.key },
            h('span', {
                  className: 'wsb-customName',
                  title: (active.name || '') + '  ·  ' + ((t && t.mediaRenameHint) || '双击重命名'),
                  onDoubleClick: () => { setRenaming(active.key); setDraft(active.name || '') },
                }, renaming === active.key
                  ? h('input', {
                    className: 'wsb-nameInput', value: draft, autoFocus: true,
                    'aria-label': (t && t.mediaRenameHint) || '重命名',
                    onChange: (event) => setDraft(event.target.value),
                    onKeyDown: (event) => {
                      if (event.key === 'Enter') { event.preventDefault(); commitRename() }
                      else if (event.key === 'Escape') { event.preventDefault(); setRenaming('') }
                    },
                    onBlur: commitRename,
                  })
                  : (active.name || t.bgMedia)),
            h('span', { className: 'wsb-customKind' }, active.kind === 'video' ? t.mediaLoop : t.mediaStill))
          : null,
        h('div', { className: 'wsb-swatch' },
          button(active ? t.mediaReplace : t.mediaPick, 'pickMedia', onPick),
          active ? button(t.mediaRemove, 'clearMedia', () => onRemove(active.key)) : null,
              active && active.kind === 'video'
                ? h('button', {
                  type: 'button', className: 'wsb-btn', 'data-media-sound': '1',
                  'data-on': background.mediaSound ? 'true' : 'false',
                  'aria-pressed': background.mediaSound ? 'true' : 'false',
                  title: (t && t.mediaSoundHint) || '播放这个视频自带的声音',
                  onClick: () => patch({ mediaSound: !background.mediaSound }),
                }, background.mediaSound ? ((t && t.mediaSoundOn) || '声音 开') : ((t && t.mediaSound) || '声音 关'))
                : null),
        custom
          ? h('div', { className: 'wsb-switchHint', 'data-hint': 'customPerf' }, t.customPerfHint)
          : null,
        items.length > 1
          ? h('div', { className: 'wsb-customList' }, items.map((item) => h('button', {
            key: item.key, type: 'button', className: 'wsb-customChip',
            'data-media-item': item.key, 'data-on': item.key === activeKey ? 'true' : 'false',
            title: item.name || '',
            onClick: () => onSelect(item.key),
          }, item.name || item.kind)))
          : null,
        h('div', { className: 'wsb-popSep' }),
        h('div', { className: 'wsb-miniHead' }, t.auroraColors),
        h('div', { className: 'wsb-swatch' }, Object.keys(PALETTES).map((id) => h('button', {
          key: id, type: 'button', className: 'wsb-swatchBtn', 'data-palette-opt': id, 'data-aurora': id,
          'data-on': appearance.palette === id ? 'true' : 'false',
          onClick: () => onAuroraColor(id),
        }, h(SwatchDots, { colors: [PALETTES[id].c1, PALETTES[id].c2, PALETTES[id].c3] }), PALETTES[id].name))),
        h('div', { className: 'wsb-popSep' }),
        h('div', { className: 'wsb-miniHead' }, t.motion),
        h(FieldSlider, { label: t.flowSpeed, name: 'auroraSpeed', value: background.auroraSpeed, low: 0, high: 100, onChange: (value) => patch({ auroraSpeed: value }) }),
        h(FieldSlider, { label: t.shapeAmp, name: 'shapeVariance', value: background.shapeVariance, low: 0, high: 100, onChange: (value) => patch({ shapeVariance: value }) }),
        h(FieldSlider, { label: t.hueSpeed, name: 'hueSpeed', value: background.hueSpeed, low: 0, high: 100, onChange: (value) => patch({ hueSpeed: value }) }),
        h(FieldSlider, { label: t.hueRange, name: 'hueRange', value: background.hueRange, low: 0, high: 100, onChange: (value) => patch({ hueRange: value }) }),
        h(FieldSlider, { label: t.tone, name: 'bright', value: background.bright, low: 0, high: 200, onChange: (value) => patch({ bright: value }) }),
        h(FieldSlider, { label: t.saturation, name: 'saturation', value: background.saturation, low: 0, high: 300, onChange: (value) => patch({ saturation: value }) }),
        h(FieldSlider, { label: t.edgeBlur, name: 'edgeBlur', value: background.edgeBlur, low: 0, high: 100, onChange: (value) => patch({ edgeBlur: value }) }),
        h(FieldSlider, { label: t.softness, name: 'dim', value: background.dim, low: 0, high: 100, onChange: (value) => patch({ dim: value }) }),
        h('div', { className: 'wsb-popSep' }),
        h('button', { type: 'button', className: 'wsb-btn', 'data-action': 'bgReset', style: { width: '100%' }, onClick: onReset }, t.bgReset));
    }

    /**
     * 界面设置: every look decision in one panel — the card arrangement, the tile
     * geometry (square / rectangle), the corner radius, the card size, the frosted-glass
     * material and the surface pattern. The old separate 排布 dock panel was folded in
     * here so there is one place for appearance.
     */
    function InterfacePanel({ t, appearance, patch, background, patchBackground }) {
      return h('div', null,
        // 形状: one slider, and its scale is the shape itself — 0 is a circle, 100 a square.
              h(FieldSlider, {
          label: t.shape, name: 'radius', value: appearance.radius === undefined ? 85 : appearance.radius,
          low: 0, high: 100, onChange: (value) => patch({ radius: value }),
        }),
        h('div', { className: 'wsb-popSep' }),
        h('div', { className: 'wsb-miniHead' }, t.glass),
        h('div', { className: 'wsb-swatch' }, Object.keys(GLASS_SCHEMES).map((id) => h('button', {
          key: id, type: 'button', className: 'wsb-swatchBtn', 'data-glass-opt': id,
          'data-on': appearance.glass === id ? 'true' : 'false',
          onClick: () => patch({ glass: id }),
        }, GLASS_SCHEMES[id].name))),
        // 透明度 is its own control: the four materials above set the CHARACTER (blur,
        // saturation, specular sweep, depth), this slider sets how much you see through them.
        h(FieldSlider, {
          label: t.glassAlpha, name: 'glassAlpha',
          value: appearance.glassAlpha === undefined ? (GLASS_SCHEMES[appearance.glass] || GLASS_SCHEMES.regular).alpha : appearance.glassAlpha,
          low: 0, high: 100,
          onChange: (value) => patch({ glassAlpha: value }),
        }),
        h('div', { className: 'wsb-popSep' }),
        h('div', { className: 'wsb-miniHead' }, t.gridEffect),
        h('div', { className: 'wsb-swatch' }, Object.keys(GRID_SHAPES).map((id) => h('button', {
          key: id, type: 'button', className: 'wsb-swatchBtn', 'data-grid-opt': id,
          'data-on': (GRID_SHAPES[background.gridShape] ? background.gridShape : 'none') === id ? 'true' : 'false',
          onClick: () => patchBackground({ gridShape: id, grid: id === 'none' ? 0 : (background.grid || 40) }),
        }, t['grid' + id.charAt(0).toUpperCase() + id.slice(1)] || GRID_SHAPES[id]))),
        background.gridShape && background.gridShape !== 'none'
          ? h(FieldSlider, {
            label: t.bgGrid, name: 'grid', value: background.grid, low: 0, high: 100,
            onChange: (value) => patchBackground({ grid: value }),
          })
          : null);
    }

    //#endregion

    //#region module cards

    /**
     * Sidebar row for one module: registered once per module into `sidebar.panellist`,
     * so the module list sits in the left sidebar directly under 工作台.
     */
    /**
     * Session ids that are working right now, kept fresh outside React so the sidebar dots
     * can read it without a hook (the rail's rows are rendered by the shell).
     */
    const runningSessions = new Set();

    function syncRunningSessions(list) {
      runningSessions.clear();
      // The list snapshot is `{ids, byId, phase}`; an array is accepted too.
      const byId = list && list.byId ? list.byId : null;
      const rows = Array.isArray(list)
        ? list
        : byId ? Object.keys(byId).map((id) => byId[id]).filter(Boolean) : [];
      for (const row of rows) {
        if (row && row.running && row.id) runningSessions.add(row.id);
      }
    }

    /**
     * The module row's marker: a status dot — grey while idle, lit green (and breathing)
     * while that module's session is actually working.
     */
    function SidebarModuleIcon(ownerProps, index) {
      const size = ownerProps && typeof ownerProps.size === 'number' ? ownerProps.size : 18;
      const modules = safe(() => loadAppState().modules, []) || [];
      const module = modules[index];
      const running = Boolean(module && module.sessionId && runningSessions.has(module.sessionId));
      const dot = Math.max(9, Math.round(size * 0.62));
      return h('span', {
        className: 'wsb-sideMod', 'data-side-module': String(index),
        'data-state': running ? 'run' : 'idle',
        style: { width: size + 'px', height: size + 'px', opacity: (ownerProps && ownerProps.active) ? 1 : 0.85 },
        title: module ? module.name : '',
      }, h('i', { className: 'wsb-dot', style: { width: dot + 'px', height: dot + 'px' } }));
    }

    const TRAIL_GLYPH = { turn: 'T', prompt: 'U', assistant: 'A', file: '◆', tool: '›', note: '✎' };

    /**
     * 轨迹 rows: the session as one dense chronological ledger — a title row per turn and,
     * under it, one row each for the prompt / assistant / tool call / file change, in the
     * order they happened. Shared by the 轨迹 pane and the console's trail strip.
     */
    function trailRows(t, model) {
      const rows = [];
      for (const turn of model.turns) {
        rows.push({
          kind: 'turn', time: turn.startTime,
          label: t.nodeTurn + ' ' + turn.index,
          detail: firstLine(turn.prompt, 90) || t.pending,
        });
        for (const node of turn.nodes) {
          if (node.kind === 'prompt') continue;
          rows.push({
            kind: node.kind, id: node.id, time: node.time,
            label: node.kind === 'assistant'
              ? ((node.narration ? t.narration : t.reply) + ' · step ' + (node.step || '?'))
              : node.kind === 'file' ? (t.nodeFile + ' · ' + (node.title || ''))
                : (node.name || t.nodeTool),
            detail: node.subtitle || node.title || '',
          });
        }
      }
      return rows;
    }

    /** The ledger itself, so the pane and the strip render identical rows. */
    function TrailRows({ t, model, selectedId, onSelect }) {
      const rows = trailRows(t, model);
      if (rows.length === 0) return h('div', { className: 'wsb-empty' }, t.noTurns);
      return h('div', { className: 'wsb-trail', 'data-trail': '1' }, rows.map((row, trailIndex) => h('div', {
        key: (row.id || 'r') + '-' + trailIndex,
        className: 'wsb-trailRow', 'data-kind': row.kind,
        'data-sel': row.id && row.id === selectedId ? 'true' : 'false',
        style: { '--wsb-i': String(trailIndex) },
        onClick: row.id ? () => onSelect(row.id) : null,
      },
        h('span', { className: 'wsb-trailGlyph' }, TRAIL_GLYPH[row.kind] || '·'),
        h('span', { className: 'wsb-trailLabel' }, row.label),
        h('span', { className: 'wsb-trailDetail', title: row.detail }, firstLine(row.detail, 60)))));
    }

    /**
     * 轨迹: the session as one dense chronological ledger — the same reading mode as the
     * conversation's Trajectory tab, rebuilt from the event window this panel already has.
     */
    function TrailPane({ t, model, selectedId, onSelect }) {
      const rows = trailRows(t, model);
      return h('div', { className: 'wsb-glass', style: { animationDelay: '140ms' } },
        h(PaneHead, { title: t.trail, sub: rows.length + ' ' + t.trailRows }),
        h('div', { className: 'wsb-body' }, h(TrailRows, { t, model, selectedId, onSelect })));
    }

    /**
     * The console trail strip: a horizontal band under the header that shows the same
     * ledger. It is opened with the 轨迹 button and can be dragged taller to reveal more.
     */
    function TrailStrip({ t, model, selectedId, onSelect, height, onResize, onClose }) {
      const rows = trailRows(t, model);
      const canvasRef = useRef(null);
      const startDrag = (event) => {
        const box = canvasRef.current;
        if (!box || !box.getBoundingClientRect) return;
        event.preventDefault();
        safe(() => event.currentTarget.setPointerCapture(event.pointerId));
        const startY = event.clientY;
        const startHeight = box.getBoundingClientRect().height;
        const move = (moveEvent) => {
          // Dragging the grip UP makes the strip taller, which is what the handle implies.
          onResize(clamp(Math.round(startHeight - (moveEvent.clientY - startY)), 90, 620));
        };
        const up = () => {
          safe(() => window.removeEventListener('pointermove', move));
          safe(() => window.removeEventListener('pointerup', up));
          safe(() => window.removeEventListener('pointercancel', up));
        };
        safe(() => window.addEventListener('pointermove', move));
        safe(() => window.addEventListener('pointerup', up));
        safe(() => window.addEventListener('pointercancel', up));
      };
      return h('div', { className: 'wsb-glass wsb-trailStrip', 'data-trail-strip': '1' },
        h('div', {
          className: 'wsb-trailGrip', 'data-trail-grip': '1', title: t.trailDrag,
          onPointerDown: startDrag,
        }, h('i', null)),
        h('div', { className: 'wsb-trailStripHead' },
          h('b', null, t.trail),
          h('span', null, rows.length + ' ' + t.trailRows),
          h('button', {
            type: 'button', className: 'wsb-trailClose', 'data-trail-close': '1',
            title: t.collapse, onClick: onClose,
          }, '×')),
        h('div', { ref: canvasRef, className: 'wsb-trailStripBody', style: { height: String(height) + 'px' } },
          h(TrailRows, { t, model, selectedId, onSelect })));
    }

    /** The trash drop-zone glyph — same monoline language as the tile marks. */
    function TrashGlyph() {
      return h('svg', {
        viewBox: '0 0 24 24', width: 26, height: 26, fill: 'none', stroke: 'currentColor',
        strokeWidth: GLYPH_STROKE, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true',
        style: { display: 'block' },
      },
        // Built to the same spec as the tile marks: straight segments on whole units, axis-aligned
        // or 45°, spanning 18 of the 20 live units. This was the one mark in the product that did
        // not obey it — two arc commands and a 1.4 pen — which is exactly the kind of drift the
        // review grid exists to catch. A tapered bin is impossible under the 45° rule (the taper
        // is 2 units over 15), so the bin is straight: geometry over gesture.
        h('path', { d: 'M4 6H20' }),
        h('path', { d: 'M9 6V3H15V6' }),
        h('path', { d: 'M6 6V21H18V6' }),
        h('path', { d: 'M10 10V17' }),
        h('path', { d: 'M14 10V17' }));
    }

    function ModuleCard({ t, module, running, hidden, index, onOpen, onDelete, drawKey, dragging, onDragBegin, onDragMove, onDragEnd, showAbbr, shapeRadius }) {
      const [armed, setArmed] = useState(false);
      const armedRef = useRef(false);
      const armedAtRef = useRef(0);
      const pressRef = useRef(null);
      const cardRef = useRef(null);
      const dragRef = useRef(null);
      // The tile keeps its own offset while it is being dragged, so only the carried tile
      // re-renders per pointermove — and React can never wipe the transform, which is exactly
      // what happened when it was written straight onto the node.
      const [offset, setOffset] = useState(null);
      const overRef = useRef(false);

      // The trash band is the bottom strip of the viewport, above the dock. Kept in step with
      // the .wsb-trash box in the CSS (bottom:66px, height:108px).
      const inTrash = (clientY) => {
        const viewport = (typeof window !== 'undefined' && window.innerHeight) || 800;
        return clientY > viewport - 174 && clientY < viewport - 66;
      };
      const onMove = (event) => {
        const drag = dragRef.current;
        if (!drag) return;
        // State, not a direct DOM write: a re-render would otherwise put the tile back.
        setOffset({ x: event.clientX - drag.x, y: event.clientY - drag.y });
        const over = inTrash(event.clientY);
        if (over !== overRef.current) { overRef.current = over; onDragMove(over) }
      };
      const stopDrag = (event) => {
        safe(() => window.removeEventListener('pointermove', onMove));
        safe(() => window.removeEventListener('pointerup', stopDrag));
        const node = cardRef.current;
        // The drop is decided from the release coordinates, not from the last move: a fast
        // flick can land in the band without a final move ever being delivered.
        const dropped = event && typeof event.clientY === 'number' ? inTrash(event.clientY) : overRef.current;
        overRef.current = false;
        dragRef.current = null;
        setOffset(null);
        if (node) safe(() => node.removeAttribute('data-dragging'));
        onDragEnd(module.id, dropped);
      };
      const startPress = (event) => {
        if (event && event.button) return;
        // React pools synthetic events, so the press point is copied out now. The transform is
        // RELATIVE to the tile, so the offset is the pointer's travel since the press — adding
        // the tile's own rect here is what threw the tile across the screen.
        const point = { x: (event && event.clientX) || 0, y: (event && event.clientY) || 0 };
        armedAtRef.current = 0;
        cancelPress();
        pressRef.current = setTimeout(() => {
          dragRef.current = { x: point.x, y: point.y };
          overRef.current = false;
          armedAtRef.current = Date.now();
          armedRef.current = true;
          setArmed(true);
          const node = cardRef.current;
          if (node) safe(() => node.setAttribute('data-dragging', 'true'));
          onDragBegin(module.id);
          safe(() => window.addEventListener('pointermove', onMove));
          safe(() => window.addEventListener('pointerup', stopDrag));
        }, 520);
      };
      const cancelPress = () => { if (pressRef.current) { safe(() => clearTimeout(pressRef.current)); pressRef.current = null } };
      const onClickCard = (event) => {
        // The click that ends a long press (or a drop) must never also open the module.
        if (armedRef.current && Date.now() - armedAtRef.current < 600) return;
        if (armedRef.current) { armedRef.current = false; setArmed(false); return }
        onOpen(module.id, event);
      };
      const title = module.desc ? module.name + ' — ' + module.desc : module.name;
      return h('div', {
        className: 'wsb-card', role: 'button', tabIndex: 0, ref: cardRef,
        'data-open': hidden ? 'true' : 'false',
        // A running module wears a single quiet sheen; see the CSS.
        'data-running': running ? 'true' : 'false',
        'data-dragging': dragging ? 'true' : 'false',
        'data-size': MODULE_SIZES[module.size] ? module.size : 'medium',
        title,
        // The lift/translate is a rendered style, so the tile follows the pointer exactly and
        // survives the re-render that arming it triggers. `rotate` (the iOS-style jiggle) is a
        // separate CSS property, so the wiggle animation composes with this transform.
        style: {
          animationDelay: Math.min(index, 12) * 45 + 'ms',
      // 形状直接写在行内：映射是 (100 - 滑条)/2 %，所以 0 = 50% = 正圆，100 = 0% = 正方形。
      // 行内样式压过所有样式表规则，不会再被更具体的规则盖掉。
      // 字面量，不经任何 CSS 变量 —— 因此不会被层叠或就近优先改掉。
          borderRadius: shapeRadius || 'var(--wsb-shape-radius, var(--wsb-card-radius, 20px))',
          ...(offset ? { transform: 'translate3d(' + offset.x + 'px,' + offset.y + 'px,0) scale(1.045)' } : null),
        },
        onPointerDown: startPress,
        onPointerUp: () => { if (!armedRef.current) cancelPress() },
        onPointerLeave: cancelPress,
        onPointerMove: cancelPress,
        onClick: onClickCard,
        onKeyDown: (event) => { if (event.key === 'Enter') onOpen(module.id, event) },
      },
        // Minimal by design: a centred monoline mark and the module's name. Nothing else.
        // 边缘拾色层: 一圈极光色的 conic 渐层, 只留边缘 1.5px, 悬停时缓缓转动.
        h('i', {
          className: 'wsb-lens', 'aria-hidden': 'true',
          // 关键几何内联: 它是纯装饰层, 任何情况下都不该参与布局、影响图标位置.
          style: { position: 'absolute', inset: 0, pointerEvents: 'none' },
        }),
        h('span', { className: 'wsb-tileMark' }, h(ModuleGlyph, { kind: module.kind, drawKey })),
        showAbbr
          ? h('span', { className: 'wsb-tileAbbr', 'data-tile-abbr': module.kind },
            MODULE_ABBR[module.kind] || MODULE_ABBR.blank)
          : null,
        h('span', { className: 'wsb-tileName' }, module.name));
    }

    /**
     * Home screen: a staggered grid of module cards with a single chrome element —
     * a minimal dock pinned to the bottom. Exactly one dock panel is open at a time,
     * which is also what keeps panels from stacking on top of each other.
     */
    /**
     * A sticky note. Its header is the drag handle (the body has to stay a textarea so it can be
     * typed in), the dots pick a colour, and a drop on the trash band deletes it. The report back
     * carries the travel so the caller can turn pixels into a percentage of the desktop.
     */
    function StickyNote({ t, sticky, siblings, onPatch, onDelete, dragging, onDragBegin, onDragEnd }) {
      const [offset, setOffset] = useState(null);
      const [size, setSize] = useState(null);
      const [snapped, setSnapped] = useState('');
      const snapRef = useRef('');
      const offsetRef = useRef(null);
      const sizeRef = useRef(null);
      const dragRef = useRef(null);
      const bodyRef = useRef(null);
      const noteRef = useRef(null);
      const inTrash = (clientY) => {
        const viewport = (typeof window !== 'undefined' && window.innerHeight) || 800;
        return clientY > viewport - 174 && clientY < viewport - 66;
      };
      // 就近吸附: 8px 内对齐到其它便签或桌面边界. 只调位置, 不改变尺寸.
      const SNAP = 8;
      const snapAxis = (pos, width, targets) => {
        let delta = 0;
        for (const edge of [0, 0.5, 1]) {
          const mine = pos + width * edge;
          for (const target of targets) {
            const candidate = target - mine;
            if (Math.abs(candidate) <= SNAP && (delta === 0 || Math.abs(candidate) < Math.abs(delta))) {
              delta = candidate;
            }
          }
        }
        return { pos: pos + delta, hit: delta !== 0 };
      };
      const onMove = (event) => {
        const drag = dragRef.current;
        if (!drag) return;
        let x = drag.left + (event.clientX - drag.press.x);
        let y = drag.top + (event.clientY - drag.press.y);
        let hit = '';
        if (drag.surface) {
          const xs = [0, drag.surface.w / 2, drag.surface.w];
          const ys = [0, drag.surface.h / 2, drag.surface.h];
          for (const other of drag.siblings) {
            xs.push(other.left, other.left + other.w / 2, other.left + other.w);
            ys.push(other.top, other.top + other.h / 2, other.top + other.h);
          }
          const sx = snapAxis(x, drag.w, xs);
          const sy = snapAxis(y, drag.h, ys);
          x = Math.max(0, Math.min(drag.surface.w - drag.w, sx.pos));
          y = Math.max(0, Math.min(drag.surface.h - drag.h, sy.pos));
          hit = (sx.hit ? 'x' : '') + (sy.hit ? 'y' : '');
        }
        offsetRef.current = { x: x - drag.left, y: y - drag.top };
        setOffset(offsetRef.current);
        if (hit !== snapRef.current) { snapRef.current = hit; setSnapped(hit) }
      };
      const stop = () => {
        safe(() => window.removeEventListener('pointermove', onMove));
        safe(() => window.removeEventListener('pointerup', stop));
        const moved = offsetRef.current;
        // The stored position is a percentage of the note's offsetParent, so the drop is
        // measured against that same box instead of guessed from another element's size.
        const node = noteRef.current;
        const parent = node && node.offsetParent;
        const width = (parent && parent.clientWidth)
          || (typeof window !== 'undefined' && window.innerWidth) || 1200;
        const height = (parent && parent.clientHeight)
          || (typeof window !== 'undefined' && window.innerHeight) || 800;
        const left = node && typeof node.offsetLeft === 'number' ? node.offsetLeft : 0;
        const top = node && typeof node.offsetTop === 'number' ? node.offsetTop : 0;
        const place = moved
          ? { x: ((left + moved.x) / width) * 100, y: ((top + moved.y) / height) * 100 }
          : null;
        safe(() => { if (typeof document !== 'undefined' && document.body) document.body.style.userSelect = '' });
        safe(() => window.removeEventListener('pointercancel', stop));
        offsetRef.current = null;
        dragRef.current = null;
        snapRef.current = '';
        setSnapped('');
        setOffset(null);
        onDragEnd(sticky.id, false, place, 'sticky');
      };
      const begin = (point, target) => {
        const node = noteRef.current;
        const parent = node && node.offsetParent;
        const surface = parent ? { w: parent.clientWidth, h: parent.clientHeight } : null;
        dragRef.current = {
          press: point,
          left: node && typeof node.offsetLeft === 'number' ? node.offsetLeft : 0,
          top: node && typeof node.offsetTop === 'number' ? node.offsetTop : 0,
          w: (node && node.offsetWidth) || sticky.w || 196,
          h: (node && node.offsetHeight) || sticky.h || 150,
          surface,
          siblings: (siblings || []).filter((item) => item.id !== sticky.id).map((item) => ({
            left: surface ? (item.x / 100) * surface.w : 0,
            top: surface ? (item.y / 100) * surface.h : 0,
            w: item.w || 196,
            h: item.h || 150,
          })),
        };
        offsetRef.current = null;
        // While a note is carried the page must not select anything: a selection that escapes
        // the window is what painted the whole desktop blue.
        safe(() => { if (typeof document !== 'undefined' && document.body) document.body.style.userSelect = 'none' });
        safe(() => { if (typeof window !== 'undefined' && window.getSelection) window.getSelection().removeAllRanges() });
        safe(() => { if (target && target.setPointerCapture && point.id !== undefined) target.setPointerCapture(point.id) });
        onDragBegin(sticky.id, 'sticky');
        safe(() => window.addEventListener('pointermove', onMove));
        safe(() => window.addEventListener('pointerup', stop));
        safe(() => window.addEventListener('pointercancel', stop));
      };
      const start = (event) => {
        if (event && event.button) return;
        if (event && event.stopPropagation) event.stopPropagation();
        // The handle is not a text surface: taking the default here is what stops the browser
        // from starting a selection drag in the first place.
        if (event && event.preventDefault) event.preventDefault();
        begin({ x: (event && event.clientX) || 0, y: (event && event.clientY) || 0, id: event && event.pointerId }, event && event.currentTarget);
      };
      // The body has to stay typable, so a drag only begins once the pointer has clearly moved.
      const bodyDown = (event) => {
        if (event && event.button) return;
        bodyRef.current = { x: (event && event.clientX) || 0, y: (event && event.clientY) || 0, id: event && event.pointerId, target: event && event.currentTarget };
      };
      const bodyMove = (event) => {
        const pending = bodyRef.current;
        if (!pending) return;
        if (Math.abs(event.clientX - pending.x) < 6 && Math.abs(event.clientY - pending.y) < 6) return;
        bodyRef.current = null;
        if (event && event.preventDefault) event.preventDefault();
        begin({ x: pending.x, y: pending.y, id: pending.id }, pending.target);
      };
      const bodyUp = () => { bodyRef.current = null };
      // 拉伸: the corner handle changes the note's own size, stored with it.
      const onResize = (event) => {
        if (event && event.button) return;
        if (event && event.stopPropagation) event.stopPropagation();
        if (event && event.preventDefault) event.preventDefault();
        const from = { w: sticky.w || 196, h: sticky.h || 150 };
        const point = { x: (event && event.clientX) || 0, y: (event && event.clientY) || 0 };
        const move = (moveEvent) => {
          const next = {
            w: clamp(from.w + (moveEvent.clientX - point.x), 140, 460),
            h: clamp(from.h + (moveEvent.clientY - point.y), 110, 460),
          };
          sizeRef.current = next;
          setSize(next);
        };
        const up = () => {
          safe(() => window.removeEventListener('pointermove', move));
          safe(() => window.removeEventListener('pointerup', up));
          safe(() => { if (typeof document !== 'undefined' && document.body) document.body.style.userSelect = '' });
          const final = sizeRef.current;
          sizeRef.current = null;
          setSize(null);
          if (final) onPatch({ w: Math.round(final.w), h: Math.round(final.h) });
        };
        safe(() => { if (typeof document !== 'undefined' && document.body) document.body.style.userSelect = 'none' });
        safe(() => window.addEventListener('pointermove', move));
        safe(() => window.addEventListener('pointerup', up));
      };
      const palette = STICKY_COLORS[sticky.color] || STICKY_COLORS.amber;
      const width = (size && size.w) || sticky.w || 196;
      const height = (size && size.h) || sticky.h || 150;
      return h('div', {
        className: 'wsb-sticky', 'data-sticky': sticky.id, 'data-sticky-color': sticky.color, ref: noteRef,
        'data-dragging': dragging ? 'true' : 'false',
        'data-snapped': snapped || undefined,
        style: Object.assign({
          left: sticky.x + '%', top: sticky.y + '%', width: width + 'px', height: height + 'px',
          '--sticky-bg': palette.bg, '--sticky-ink': palette.ink,
        }, offset ? { transform: 'translate3d(' + offset.x + 'px,' + offset.y + 'px,0)' } : null),
      },
        h('div', { className: 'wsb-stickyHead', onPointerDown: start },
          h('span', { className: 'wsb-stickyGrip', 'aria-hidden': 'true' }),
          h('span', { className: 'wsb-stickyDots' }, Object.keys(STICKY_COLORS).map((id) => h('button', {
            key: id, type: 'button', className: 'wsb-stickyDot', 'data-sticky-swatch': id,
            'data-on': sticky.color === id ? 'true' : 'false', title: STICKY_COLORS[id].name,
            style: { background: STICKY_COLORS[id].bg },
            onPointerDown: (event) => event.stopPropagation(),
            onClick: (event) => { event.stopPropagation(); onPatch({ color: id }) },
          }))),
          h('button', {
            type: 'button', className: 'wsb-stickyDel', 'data-sticky-del': sticky.id, title: t.stickyDelete,
            onPointerDown: (event) => event.stopPropagation(),
            onClick: (event) => { event.stopPropagation(); onDelete() },
          }, '×')),
        h('span', {
          className: 'wsb-stickyResize', 'data-sticky-resize': sticky.id, title: t.stickyResize,
          onPointerDown: onResize,
        }),
        h('textarea', {
          className: 'wsb-stickyBody', 'data-sticky-text': sticky.id, value: sticky.text || '',
          placeholder: t.stickyHint, spellCheck: false,
          onPointerDown: (event) => { event.stopPropagation(); bodyDown(event) },
          onPointerMove: bodyMove,
          onPointerUp: bodyUp,
          onChange: (event) => onPatch({ text: event.target.value }),
        }));
    }

    function HomeView({ t, state, rows, hidden, onOpen, onAddModule, onAddSticky, onPatchSticky, onDeleteSticky, onMoveSticky, onRenameModule, onDeleteModule, onPatchModule, anim, panel, onPanel, bg, appearance, onAppearance, onAnimEnd, concealed, drawKey, showAbbr }) {
      const screenRef = useRef(null);
      const rowFor = (module) => (module.sessionId ? rows.find((row) => row.id === module.sessionId) : undefined)
        || rows.find((row) => ((row.retainedBy && row.retainedBy.mainView) || 0) > 0);
      // Drag-to-trash: `drag` is null unless a tile is being carried. `over` flips only when the
      // pointer enters or leaves the band, so a drag does not re-render the grid per frame.
      const [drag, setDrag] = useState(null);
      const beginDrag = (id, kind) => setDrag({ id, kind: kind || 'module', over: false });
      const moveDrag = (over) => setDrag((previous) => (previous && previous.over !== over
        ? { id: previous.id, kind: previous.kind, over } : previous));
      const endDrag = (id, dropped, offset, kind) => {
        setDrag(null);
        if (kind === 'sticky') {
          if (dropped) { onDeleteSticky(id); return }
          if (offset) onMoveSticky(id, offset);
          return;
        }
        if (dropped) onDeleteModule(id);
      };
      const dockButton = (id, label, icon, on) => h('button', {
        type: 'button', className: 'wsb-dockBtn', title: label, 'aria-label': label,
        'data-dock': id, 'data-on': on ? 'true' : 'false',
        onClick: (event) => { event.stopPropagation(); onPanel(panel === id ? null : id) },
      }, h(DockIcon, { name: icon }));
      const dockPop = (id) => (panel === id
        ? h('div', { className: 'wsb-dockPop', 'data-panel': id, onClick: (event) => event.stopPropagation() },
          id === 'dynamic' ? h(DynamicPanel, {
            t, appearance, background: bg.background, patch: bg.patch,
            onAuroraColor: bg.onAuroraColor, onReset: bg.onReset,
            media: bg.background.media, activeKey: bg.background.activeKey,
            onPick: () => safe(() => bg.fileRef && bg.fileRef.current && bg.fileRef.current.click()),
            onRemove: bg.onRemoveMedia, onSelect: bg.onSelectMedia,
          })
            : h(InterfacePanel, { t, appearance, patch: onAppearance, background: bg.background, patchBackground: bg.patch }))
        : null);
      return h('div', {
        ref: screenRef,
        className: 'wsb-screen', 'data-role': 'home', 'data-anim': anim,
        'data-concealed': concealed ? 'true' : 'false',
        onAnimationEnd: (event) => { if (event.target === event.currentTarget) onAnimEnd() },
      },
        h('div', { className: 'wsb-home', onClick: () => onPanel(null) },
          h('div', { className: 'wsb-homeHead' },
            h('div', { className: 'wsb-homeTitle' },
              h('h1', null, t.panel),
              h('p', null, t.homeHint))),
          h('div', { className: 'wsb-cards' },
            state.modules.map((module, index) => h(ModuleCard, {
              key: module.id, t, module, hidden: hidden.has(module.id), index,
              // The tile only needs the live flag: the sheen is the only running signal left.
              running: Boolean((rowFor(module) || {}).running),
              onOpen, onDelete: onDeleteModule, drawKey,
              dragging: Boolean(drag && drag.id === module.id),
              onDragBegin: beginDrag, onDragMove: moveDrag, onDragEnd: endDrag, showAbbr,
              // 形状：滑条 0 → 50%（正方形磁贴下即正圆），100 → 0%（正方形）。
              shapeRadius: ((100 - clamp(appearance.radius === undefined ? 85 : appearance.radius, 0, 100)) / 2) + '%',
            }))),
          // 便签层：绝对定位在桌面之上，只有便签本身接收指针事件。
          h('div', { className: 'wsb-notes', 'data-notes': '1' },
            (state.stickies || []).map((sticky) => h(StickyNote, {
              key: sticky.id, t, sticky, siblings: state.stickies,
              onPatch: (changes) => onPatchSticky(sticky.id, changes),
              onDelete: () => onDeleteSticky(sticky.id),
              dragging: Boolean(drag && drag.kind === 'sticky' && drag.id === sticky.id),
              onDragBegin: beginDrag, onDragMove: moveDrag, onDragEnd: endDrag,
            }))),
          // 拖动到此处松手即删除。纯几何落区，不接收指针事件，避免打断拖动。
          drag && drag.kind === 'module'
            ? h('div', {
              className: 'wsb-trash', 'data-trash': '1', 'data-over': drag.over ? 'true' : 'false',
            },
              h(TrashGlyph, null),
              h('span', { className: 'wsb-trashLabel' }, drag.over ? t.trashDrop : t.trashHint))
            : null,
          dockPop('dynamic'),
          dockPop('interface'),
          h('div', { className: 'wsb-dock', onClick: (event) => event.stopPropagation() },
            dockButton('dynamic', t.dockDynamic, 'aurora', panel === 'dynamic'),
            dockButton('interface', t.dockInterface, 'shape', panel === 'interface'),
            h('button', {
              type: 'button', className: 'wsb-dockBtn', title: t.dockAdd, 'aria-label': t.stickyNew, 'data-dock': 'add',
              onClick: (event) => { event.stopPropagation(); onAddSticky() },
            }, h(DockIcon, { name: 'plus' })))));
    }

    //#endregion

    //#region console (the original three-pane workbench)

    // 模块界面最底层那层压暗毛玻璃的控件：一个小胶囊 + 点开的滑条（0 = 不变）。

    function ModuleBackdrop({ t, module, onPatch }) {

      const [open, setOpen] = useState(false);

      const rawDim = module && module.backdrop;
  const value = clamp(Math.round(rawDim === undefined || rawDim === null ? 50 : Number(rawDim)), 0, 100);

      return h('span', { className: 'wsb-dimWrap' },

        h('button', {

          type: 'button', className: 'wsb-btn wsb-dimBtn', 'data-dim-btn': '1',

          title: (t && t.dimLabel) || '背景压暗', 'aria-expanded': open ? 'true' : 'false',

          onClick: (event) => { event.stopPropagation(); setOpen((v) => !v) },

        }, h('svg', {
      viewBox: '0 0 24 24', 'aria-hidden': 'true', className: 'wsb-dimIcon',
    },
      h('circle', { cx: 12, cy: 12, r: 7.2 }),
      h('path', { d: 'M12 4.8a7.2 7.2 0 0 0 0 14.4z' }))),

        open

          ? h('span', { className: 'wsb-dimInline', 'data-dim-inline': '1' },

            h(FieldSlider, {

              label: (t && t.dimLabel) || '背景压暗', name: 'backdropDim',

              value, low: 0, high: 100,

              onChange: (next) => {
            const nextDim = clamp(Math.round(next), 0, 100);
            // 第二个参数就是整个 state —— 于是"调一次，所有模块同步"。
            onPatch(module.id, (item, next) => {
              (next.modules || []).forEach((each) => { each.backdrop = nextDim });
            });
          },

            }),

            h('div', { className: 'wsb-dimHint' }, (t && t.dimHint) || '数值越高，模块内背景越模糊、越暗'))

          : null);

    }


    function ConsoleView({ t, services, module, rows, state, patchModule, patchState, notes, onNote, customNodes, onAddCustom, onBack, onPickSession, onBindSession, anim, screenStyle, onAnimEnd, appearance }) {
      const [selectedId, setSelectedId] = useState('root');
      const [loadingOlder, setLoadingOlder] = useState(false);

      const mainRow = useMemo(() => rows.find((row) => ((row.retainedBy && row.retainedBy.mainView) || 0) > 0), [rows]);

      // Follow the conversation the HOST is actually showing.
      //
      // `state.focusSessionId` is only ever written by this plugin (its picker, or the bind
      // button), so switching conversations outside the workbench left it pointing at the
      // PREVIOUS conversation. Opening a module then resolved to that stale pick — a session
      // that may no longer be resident or listed — and the console came up empty. The host's
      // main view is the authority on which conversation is in front, so adopt it on entry.
      useEffect(() => {
        const active = mainRow && mainRow.id;
        if (!active || active === state.focusSessionId) return;
        patchState((next) => { next.focusSessionId = active });
      }, [mainRow, state.focusSessionId, patchState]);

      // A console must show something: prefer a session that is actually resident
      // (borrowable binding), then the bound one, so a stale binding from an old
      // profile cannot leave every pane permanently empty.
      const isResident = (id) => Boolean(id && services && services.sessions
        && safe(() => services.sessions.binding(id), null));

      const sessionId = useMemo(() => {
        // An explicit binding wins whenever it still exists — that is what "bound" means.
        if (module.sessionId && (isResident(module.sessionId) || rows.some((row) => row.id === module.sessionId))) {
          return module.sessionId;
        }
        // Not bound (or the bound session is gone): follow the conversation in focus, so
        // switching conversations carries the console over with it.
        if (state.focusSessionId && (isResident(state.focusSessionId) || rows.some((row) => row.id === state.focusSessionId))) {
          return state.focusSessionId;
        }
        // A binding that is neither resident nor listed is still better than an empty pane
        // (the pane itself explains that the session is not resident).
        if (module.sessionId) return module.sessionId;
        if (isResident(state.focusSessionId)) return state.focusSessionId;
        if (mainRow) return mainRow.id;
        return rows.length ? rows[0].id : undefined;
      }, [module.sessionId, rows, state.focusSessionId, mainRow]);

      const data = useWorkbenchData(services, sessionId);

      useEffect(() => {
        if (!services || !services.sessions || !sessionId) return;
        safe(() => { services.sessions.refreshProjections(sessionId) });
      }, [services, sessionId]);

      const onSelectPreset = useCallback((preset) => patchModule(module.id, (target) => { target.preset = preset }), [patchModule, module.id]);
      const onSelectNode = useCallback((id) => setSelectedId(id), []);

      const onLoadOlder = useCallback(() => {
        if (!data.binding || !data.window || !data.window.hasMore) return;
        setLoadingOlder(true);
        Promise.resolve(safe(() => data.binding.session.loadOlder(), null)).catch(() => {}).then(() => setLoadingOlder(false));
      }, [data.binding, data.window]);

      // Earlier events are filled in automatically, but at a PACED rate.
      //
      // Getting this wrong cost two rounds. First the loop was eager: it paged as fast as it
      // could, and because each batch re-folds the whole window (8ms at 2500 entries, 22ms at
      // 8000) and re-renders the whole console (~1400 elements), twenty batches meant several
      // hundred milliseconds of work racing the entrance animation — that was the stutter.
      // Then removing it entirely was also wrong: the pane only holds the tail of the log, so
      // the history appeared to have been thrown away.
      //
      // The right shape is in between: page until the backlog is exhausted, but space the
      // batches out so the main thread gets its frames back between them, and wait for the
      // entrance animation before starting.
      const entryCount = data.window && Array.isArray(data.window.entries) ? data.window.entries.length : 0;
      const [filling, setFilling] = useState(false);
      const [fillArmed, setFillArmed] = useState(false);
      useEffect(() => {
        if (fillArmed) return undefined;
        if (anim !== undefined && anim !== null && anim !== '') return undefined;
        setFillArmed(true);
        return undefined;
      }, [anim, fillArmed]);
      useEffect(() => {
        if (!fillArmed) return undefined;
        if (filling) return undefined;
        if (loadingOlder) return undefined;
        if (!data.window || !data.window.hasMore) return undefined;
        if (entryCount >= AUTO_FILL_LIMIT) return undefined;
        // Timers rather than requestAnimationFrame: a longer, predictable gap is what keeps
        // the panel responsive while the backlog streams in.
        const timer = window.setTimeout(() => {
          setFilling(true);
          Promise.resolve(safe(() => data.binding && data.binding.session.loadOlder(), null))
            .catch(() => {})
            .then(() => setFilling(false));
        }, AUTO_FILL_STEP_MS);
        return () => window.clearTimeout(timer);
      }, [fillArmed, filling, loadingOlder, entryCount, data.window && data.window.hasMore, data.binding]);

      const onRefresh = useCallback(() => {
        if (!services || !services.sessions || !sessionId) return;
        safe(() => { services.sessions.refreshProjections(sessionId) });
      }, [services, sessionId]);

      const onSelectTurn = useCallback((id) => setSelectedId(id), []);

      const lastPreviewable = (nodes) => {
        for (let inner = nodes.length - 1; inner >= 0; inner -= 1) {
          if (nodes[inner].kind !== 'prompt') return nodes[inner];
        }
        return null;
      };

      const selection = useMemo(() => {
        if (selectedId === 'root') {
          for (let index = data.model.turns.length - 1; index >= 0; index -= 1) {
            const found = lastPreviewable(data.model.turns[index].nodes);
            if (found) return Object.assign({}, found, { turnRef: data.model.turns[index].turn });
          }
          return { id: 'root' };
        }
        for (const turn of data.model.turns) {
          if ('turn-' + turn.turn === selectedId) {
            const last = lastPreviewable(turn.nodes);
            return last ? Object.assign({}, last, { turnRef: turn.turn }) : { id: selectedId, turnRef: turn.turn };
          }
          for (const node of turn.nodes) if (node.id === selectedId) return Object.assign({}, node, { turnRef: turn.turn });
        }
        return { id: selectedId };
      }, [selectedId, data.model, t]);

      const midPane = module.kind === 'research'
        ? h(SourcesPane, { key: 'sources', t, model: data.model })
        : h(SummaryPane, { key: 'summary', t, model: data.model, selection, notes, onNote, module });

      /**
       * Consumption of every workbench project, so this conversation can be compared with
       * the others. Only sessions the client can actually borrow are listed.
       */
      // Which other sessions to compare against: other workbench projects first, then the
      // remaining sessions in the list.
      const compareTargets = useMemo(() => {
        const seen = new Set([sessionId]);
        const list = [];
        for (const item of (state.modules || []).slice(0, 6)) {
          if (!item.sessionId || seen.has(item.sessionId)) continue;
          seen.add(item.sessionId);
          list.push({ id: item.sessionId, name: item.name });
        }
        for (const row of (rows || []).slice(0, 4)) {
          if (!row || !row.id || seen.has(row.id)) continue;
          seen.add(row.id);
          list.push({ id: row.id, name: firstLine(row.title || row.id, 22) });
        }
        return list;
      }, [state.modules, rows, sessionId]);
      const compareKey = compareTargets.map((item) => item.id).join(',');

      // `binding()` only borrows a session that is ALREADY retained, which is why every
      // other project showed no number at all. A one-shot `using()` acquires a reference,
      // reads the shipped projection and releases it.
      const [otherUsage, setOtherUsage] = useState([]);
      useEffect(() => {
        const api = services && services.sessions;
        if (!api || typeof api.using !== 'function' || compareTargets.length === 0) {
          setOtherUsage([]);
          return undefined;
        }
        let alive = true;
        const publish = (item, total) => {
          if (!alive) return;
          setOtherUsage((previous) => previous.filter((entry) => entry.id !== item.id)
            .concat([{ id: item.id, name: item.name, total: Number(total) || 0 }]));
        };
        for (const item of compareTargets) {
          Promise.resolve()
            .then(() => (typeof api.refreshProjections === 'function' ? api.refreshProjections(item.id) : undefined))
            .catch(() => {})
            .then(() => api.using(item.id, { source: 'gateway' }, async (reference) => {
              if (reference && reference.ready) await reference.ready.catch(() => {});
              const face = reference.binding.session.projections.faceOf('tokenUsage');
              const wire = face.getSnapshot() || {};
              return (Number(wire.uncachedInputTokens) || 0) + (Number(wire.outputTokens) || 0);
            }))
            .then((total) => publish(item, total), () => publish(item, 0));
        }
        return () => { alive = false };
      }, [compareKey, services]);

      /**
       * Consumption of every workbench project, so this conversation can be compared with
       * the others.
       */
      const projectBars = useMemo(() => {
        const wire = data.usage && typeof data.usage === 'object' ? data.usage : {};
        const currentTotal = (Number(wire.uncachedInputTokens) || 0) + (Number(wire.outputTokens) || 0);
        const others = otherUsage.slice().sort((left, right) => right.total - left.total);
        return [{ name: module.name, total: currentTotal, current: true }].concat(others);
      }, [data.usage, otherUsage, module.name]);

      const paneFor = (kind) => {
        if (kind === 'tree') {
          return h(TreePane, {
            key: 'tree', t, model: data.model, selectedId, onSelect: onSelectNode, notes, onNote,
            customNodes, onAddCustom, onLoadOlder, hasMore: Boolean(data.window && data.window.hasMore),
            loadingOlder, status: data.status,
          });
        }
        if (kind === 'mid') return midPane;
        if (kind === 'progress') return h(ProgressPane, { key: 'progress', t, model: data.model, usage: data.usage, pressure: data.pressure, breakdown: data.breakdown, status: data.status, selectedId, onSelectTurn, hasMore: Boolean(data.window && data.window.hasMore), projects: projectBars });
        if (kind === 'tokens') return h(TokenPane, { key: 'tokens', t, model: data.model, usage: data.usage, pressure: data.pressure, breakdown: data.breakdown });
        if (kind === 'trail') return h(TrailPane, { key: 'trail', t, model: data.model, selectedId, onSelect: onSelectNode });
        return null;
      };

      const preset = PRESETS[module.preset] || PRESETS.triple;
      // Phase 2 of the arrival: the content sweep arms once the screen's fade has settled.
      // It lives HERE, not on the app root, so the `[data-sweep="go"] .wsb-anim` rule can
      // only ever reach this screen — never the home screen's cards, which are still
      // mounted behind it during the transition.
      // It is deliberately NOT retired on a timer: `animation-fill-mode: both` already
      // leaves every swept element settled at its final state, so a retirement would buy
      // nothing and cost an extra full re-render of the tree.
      const [sweep, setSweep] = useState(false);
      useEffect(() => {
        if (sweep) return undefined;
        if (anim !== undefined && anim !== null && anim !== '') return undefined;
        setSweep(true);
        return undefined;
      }, [anim, sweep]);
      // The preset proposes a set of panes; the user can add or drop any of them, and the
      // grid re-flows to however many are switched on.
      const activePanes = Array.isArray(module.panes) && module.panes.length
        ? module.panes.filter((kind) => PANE_KINDS.includes(kind))
        : preset.panes;
      const shownPanes = activePanes.length ? activePanes : ['tree'];
      const paneCols = shownPanes.length === preset.panes.length
        ? preset.cols
        : 'repeat(' + shownPanes.length + ', minmax(0, 1fr))';
      // ==== 面板标题栏拖动换位 v5（document 捕获阶段监听 —— 挂载不会失效）====
      // 拖动期间只改 DOM（transform），不 setState。收尾五源：pointerup / pointercancel /
      // Escape / 窗口失焦 / 组件卸载。收尾时先无条件复原，再提交（插入式）。

      const paneGridRef = useRef(null);
      const paneDragRef = useRef(null);
      const PANE_KEEP = ['opacity', 'transform', 'transition', 'boxShadow', 'zIndex'];
      const paneSnap = (node) => {
        const saved = {};
        PANE_KEEP.forEach((key) => { saved[key] = node.style[key] });
        return saved;
      };
      const paneRestore = (node, saved) => { PANE_KEEP.forEach((key) => { node.style[key] = saved[key] || '' }) };
      const paneCommitInsert = (from, to) => {
        patchModule(module.id, (target) => {
          const current = Array.isArray(target.panes) && target.panes.length
            ? target.panes.slice() : preset.panes.slice();
          if (from < 0 || from >= current.length) return;
          const next = current.slice();
          const moved = next.splice(from, 1)[0];
          const at = Math.max(0, Math.min(next.length, to));
          next.splice(at, 0, moved);              // ← 插入：其余面板自动后移
          target.panes = next;
        });
      };
      const paneEndDrag = (commit) => {
        const drag = paneDragRef.current;
        if (!drag) return;
        paneDragRef.current = null;
        document.removeEventListener('pointermove', drag.onMove, true);
        document.removeEventListener('pointerup', drag.onUp, true);
        document.removeEventListener('pointercancel', drag.onCancel, true);
        window.removeEventListener('blur', drag.onCancel);
        document.removeEventListener('keydown', drag.onKey, true);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        // ① 无条件复原（回到拖动前）
        drag.nodes.forEach((node, index) => { if (node) paneRestore(node, drag.saved[index]) });
        if (!commit || drag.target === drag.source) return;
        // ② 复原之后才做落地反馈（快照的是干净样式 → 不可能残留）
        const moved = drag.nodes[drag.source];
        if (moved) {
          const clean = paneSnap(moved);
          moved.style.transition = 'box-shadow .34s ease';
          moved.style.boxShadow = '0 0 0 2px rgba(255,255,255,.5), 0 0 22px rgba(255,255,255,.22)';
          window.setTimeout(() => { paneRestore(moved, clean) }, 340);
        }
        paneCommitInsert(drag.source, drag.target);
      };
      useEffect(() => {
        // 无 DOM 环境（例如在 Node 里做渲染自检）直接跳过：不假设 document 一定存在。
        if (typeof document === 'undefined' || typeof window === 'undefined') return undefined;
        const onDown = (event) => {
          if (event.button !== 0 || paneDragRef.current) return;
          const node = event.target;
          if (!node || !node.closest) return;
          if (node.closest('button,input,select,textarea,a,[contenteditable="true"]')) return;
          const head = node.closest('.wsb-paneHead');
          if (!head) return;
          const grid = paneGridRef.current;
          if (!grid || !grid.contains(head)) return;
          const nodes = Array.prototype.slice.call(grid.children);
          const source = nodes.findIndex((item) => item.contains(head));
          if (source < 0) return;
          const rects = nodes.map((item) => item.getBoundingClientRect());
          if (rects.length < 2) return;
          const gap = parseFloat(window.getComputedStyle(grid).columnGap) || 0;
          const drag = {
            nodes, source, target: source, rects, gap,
            startX: event.clientX, startY: event.clientY, saved: {},
          };
          nodes.forEach((item, index) => { drag.saved[index] = paneSnap(item) });
          const held = nodes[source];
          held.style.transition = 'box-shadow .16s ease,opacity .16s ease';
          held.style.zIndex = '5';
          held.style.opacity = '.92';
          held.style.boxShadow = '0 24px 54px rgba(0,0,0,.5)';
          held.style.transform = 'translate3d(0,0,0) scale(1.015) rotate(.6deg)';
          const band = (index) => (index > source && index <= drag.target) || (index < source && index >= drag.target);
          const slid = (index) => {
            const item = nodes[index];
            if (!item || index === source || !band(index)) return;
            const shift = (index > source ? -1 : 1) * (rects[source].width + gap);
            item.style.transition = 'transform .18s cubic-bezier(.2,.8,.2,1)';
            item.style.transform = 'translate3d(' + shift + 'px,0,0)';
          };
          const unslide = (index) => {
            const item = nodes[index];
            if (!item || index === source) return;
            paneRestore(item, drag.saved[index]);
          };
          const applyBand = () => {
            for (let i = 0; i < nodes.length; i += 1) {
              if (i === source) continue;
              if (band(i)) slid(i); else unslide(i);
            }
          };
          drag.onMove = (moveEvent) => {
            const x = moveEvent.clientX;
            const y = moveEvent.clientY;
            let target = source;
            for (let i = 0; i < rects.length; i += 1) {
              const rect = rects[i];
              if (x >= rect.left && x <= rect.right) { target = i; break }
              if (i < rects.length - 1 && x > rect.right && x < rects[i + 1].left) {
                target = x < (rect.right + rects[i + 1].left) / 2 ? i : i + 1;
                break;
              }
            }
            if (x < rects[0].left) target = 0;
            if (x > rects[rects.length - 1].right) target = rects.length - 1;
            drag.target = target;
            const dx = x - drag.startX;
            const dy = Math.max(-40, Math.min(40, y - drag.startY));
            held.style.transform = 'translate3d(' + dx + 'px,' + dy + 'px,0) scale(1.015) rotate(.6deg)';
            applyBand();
          };
          drag.onUp = () => paneEndDrag(true);
          drag.onCancel = () => paneEndDrag(false);
          drag.onKey = (keyEvent) => { if (keyEvent.key === 'Escape') paneEndDrag(false) };
          paneDragRef.current = drag;
          document.addEventListener('pointermove', drag.onMove, true);
          document.addEventListener('pointerup', drag.onUp, true);
          document.addEventListener('pointercancel', drag.onCancel, true);
          window.addEventListener('blur', drag.onCancel);
          document.addEventListener('keydown', drag.onKey, true);
          document.body.style.cursor = 'grabbing';
          document.body.style.userSelect = 'none';
          if (event.preventDefault) event.preventDefault();
        };
        document.addEventListener('pointerdown', onDown, true);
        return () => {
          document.removeEventListener('pointerdown', onDown, true);
          paneEndDrag(false);
        };
      }, []);
      const togglePane = (kind) => patchModule(module.id, (target) => {
        const current = Array.isArray(target.panes) && target.panes.length ? target.panes.slice() : preset.panes.slice();
        const next = current.includes(kind) ? current.filter((item) => item !== kind) : current.concat([kind]);
        target.panes = next.length ? next : [kind];
      });
      const kindLabel = module.kind === 'game' ? t.kindGame
        : module.kind === 'notebook' ? t.kindNotebook
          : module.kind === 'news' ? t.kindNews
            : module.kind === 'stock' ? t.kindStock
              : module.kind === 'research' ? t.kindResearch : t.kindBlank;
      // 轨迹横条: the same ledger as the 轨迹 pane, but as a band under the header that the
      // user can open, close and drag taller. Persisted per module.
      const trailOpen = module.trailOpen === true;
      const trailHeight = clamp(module.trailHeight != null ? module.trailHeight : 180, 90, 620);
      const setTrail = (changes) => patchModule(module.id, (target) => {
        if ('trailOpen' in changes) target.trailOpen = changes.trailOpen;
        if ('trailHeight' in changes) target.trailHeight = changes.trailHeight;
      });
      // 总结: compress this conversation into a themed deck. The analysis is pure, so it
      // costs nothing until the button is pressed.
      const [summaryCopied, setSummaryCopied] = useState(false);
      useEffect(() => {
        if (!summaryCopied) return undefined;
        const timer = setTimeout(() => setSummaryCopied(false), 2200);
        return () => clearTimeout(timer);
      }, [summaryCopied]);
      const summarize = () => {
        const analysis = summarizeConversation(data.model);
        if (!analysis.themes.length) return;
        const blob = buildPptx(summaryToSlides(t, module, data.model, analysis));
        const stamp = new Date().toISOString().slice(0, 10);
        downloadBlob('workbench-summary-' + stamp + '.pptx', blob);
      };
      /** The same summary as Markdown, for notes/issues where a deck is the wrong shape. */
      const summarizeCopy = () => {
        const analysis = summarizeConversation(data.model);
        if (!analysis.themes.length) return Promise.resolve(false);
        setSummaryCopied(false);
        return copyText(summaryMarkdown(t, module, analysis)).then((ok) => {
          if (ok) setSummaryCopied(true);
          return ok;
        });
      };

      return h('div', {
        className: 'wsb-screen', 'data-role': 'console', 'data-anim': anim, style: screenStyle,
        // Scope the content sweep to THIS screen. On the app root the `[data-sweep="go"]
        // .wsb-anim` rule also reached the home screen's cards, which are still mounted (and
        // still visible) while the console fades in — hundreds of elements bouncing at once,
        // with no stagger, on top of the transition.
        'data-sweep': sweep ? 'go' : 'done',
        onAnimationEnd: (event) => { if (event.target === event.currentTarget) onAnimEnd() },
      },
        h('div', { className: 'wsb-root' },
          appearance && appearance.consoleAurora === false
            ? null
            : h('div', { className: 'wsb-consoleAurora', 'aria-hidden': 'true' }, h(AuroraBlobs, null)),
          h('div', { className: 'wsb-head' },
            h('button', {
    type: 'button', className: 'wsb-backBtn', 'aria-label': t.panel, title: t.panel, onClick: onBack,
  }, h('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' },
    h('path', { d: 'M14.5 6 8.5 12l6 6' }))),
  h(ModuleBackdrop, { t, module, onPatch: patchModule }),
            h('div', { className: 'wsb-title', style: { flex: '1 1 auto', minWidth: '0' } },
              h('b', null, module.name),

              h('em', { className: 'wsb-titleAbbr' }, MODULE_ABBR[module.kind] || ''),),
            h('select', {
              className: 'wsb-select', value: sessionId || '', onChange: (event) => onPickSession(event.target.value),
              title: rows.length ? '' : t.noSession,
              // 整排控件右对齐：从这里开始（含本控件）之后的兄弟元素一起被推到右侧。
              style: { marginLeft: 'auto' },
            },
              rows.length === 0 ? h('option', { value: '' }, t.noSessionShort) : null,
              rows.map((row) => h('option', { key: row.id, value: row.id },
                (row.title || row.id) + (row.running ? ' · ' + t.running : '')))),
            h('div', { className: 'wsb-panes', 'data-panes': '1' },
              h('span', { className: 'wsb-panesLabel' }, t.panes),
              // Layout presets live in this row too, as a bounded group: they are mutually
              // exclusive choices, unlike the free on/off pane chips beside them.
              h('span', { className: 'wsb-seg', 'data-presets': '1' },
                Object.keys(PRESETS).map((key, presetIndex) => h('button', {
                  key, type: 'button', className: 'wsb-segBtn wsb-anim',
                  'data-preset': key, 'data-on': module.preset === key ? 'true' : 'false',
                  style: { '--wsb-i': String(presetIndex) },
                  onClick: () => onSelectPreset(key), title: t.preset,
                }, t['preset' + key.charAt(0).toUpperCase() + key.slice(1)]))),
              PANE_KINDS.map((kind, chipIndex) => h('button', {
                key: kind, type: 'button', 'data-pane': kind,
                'data-on': shownPanes.includes(kind) ? 'true' : 'false',
                className: 'wsb-anim', style: { '--wsb-i': String(chipIndex) },
                onClick: () => togglePane(kind),
              }, t['pane' + kind.charAt(0).toUpperCase() + kind.slice(1)]))),
            // On/off: the 轨迹横条 band. Its label is deliberately NOT just "轨迹" — the
            // 显示项 group also has a 轨迹 chip (which adds the trail PANE), and two
            // controls with the same name is what made this button look like it did
            // nothing. This one owns the strip under the header.
            h('button', {
              type: 'button', className: 'wsb-btn wsb-trailToggle', 'data-trail-toggle': '1',
              'data-on': trailOpen ? 'true' : 'false',
              'aria-pressed': trailOpen ? 'true' : 'false',
              title: trailOpen ? t.trailStripOpen : t.trailToggle,
              onClick: () => setTrail({ trailOpen: !trailOpen }),
            }, '▤ ' + t.trailToggle),
            // One toggle, always available: pin this module to the session shown, or let
            // it go and follow whatever conversation is in focus again.
            h('button', {
              type: 'button', className: 'wsb-btn', 'data-bind': '1',
              'data-on': module.sessionId ? 'true' : 'false',
              disabled: !sessionId,
              title: module.sessionId ? t.unbind : t.bind,
              onClick: () => onBindSession(module.id, module.sessionId ? '' : (sessionId || '')),
            }, (module.sessionId ? '⇤ ' : '⇥ ') + (module.sessionId ? t.unbind : t.bind)),
            // 总结: the main structured export — one slide per theme, tables, every number.
            h('button', {
              type: 'button', className: 'wsb-btn wsb-summaryBtn', 'data-summary': '1',
              disabled: !data.model.turns.length,
              title: t.summaryHint,
              onClick: summarize,
            }, '⊞ ' + t.summaryButton),
            h('button', {
              type: 'button', className: 'wsb-btn', 'data-summary-copy': '1',
              disabled: !data.model.turns.length,
              title: t.summaryCopyHint,
              onClick: summarizeCopy,
            }, summaryCopied ? '✓ ' + t.copied : '⧉ ' + t.summaryCopy),
            h('button', { type: 'button', className: 'wsb-btn', onClick: onRefresh, title: t.refresh }, '⟳')),
          // The trail band sits between the header and the panes, so opening it pushes the
          // panes down instead of covering them.
          trailOpen
            ? h(TrailStrip, {
              t, model: data.model, selectedId, onSelect: onSelectNode,
              height: trailHeight,
              onResize: (value) => setTrail({ trailHeight: value }),
              onClose: () => setTrail({ trailOpen: false }),
            })
            : null,
          !sessionId
            ? h('div', { className: 'wsb-glass', style: { flex: '1 1 auto', animationDelay: '0ms' } },
              h(PaneHead, { title: module.name }),
              h('div', { className: 'wsb-empty' }, t.noSession))
            : !data.binding
              ? h('div', { className: 'wsb-glass', style: { flex: '1 1 auto', animationDelay: '0ms' } },
                h(PaneHead, { title: module.name, sub: t.notResidentShort }),
                h('div', { className: 'wsb-empty' }, t.notResident))
              : h('div', {
                  ref: paneGridRef, className: 'wsb-grid',
                  style: { gridTemplateColumns: paneCols },
                },
                shownPanes.map((kind) => paneFor(kind))),
          sessionId && data.binding && preset.strip
            ? h('div', { className: 'wsb-strip' }, h(TokenStrip, { t, model: data.model, usage: data.usage, pressure: data.pressure }))
            : null));
    }

    //#endregion

    //#region 框架笔记 (a node mind map; 6 structures, pictures in nodes, file interchange)

    /* ---- geometry: the six structures ------------------------------------------------------
       Every structure is a pure function from the note tree to one flat list of placements.
       Nothing is measured in the DOM. That is deliberate and it buys three things: a layout can
       be asserted without a browser, it cannot jitter while a CSS transition runs, and dragging
       a card never triggers a re-measure of the tree. Card sizes come from the data alone —
       depth sets the base box, a picture adds its height — which is what makes "no two cards
       overlap" a claim a test can actually check instead of a hope. */

    const NOTE_GAP_X = 58;    // gap between two levels, left→right structures
    const NOTE_GAP_Y = 16;    // gap between two siblings sharing a level
    const NOTE_GAP_L = 46;    // gap between two levels, top→down structures
    const NOTE_GAP_ROW = 12;  // extra room between the uniform rows of 树形图
    const NOTE_AXIS_OFF = 30; // distance from the timeline axis to the first event card
    const NOTE_RIB = 96;      // fishbone rib: 96 across and 96 up, i.e. exactly 45°
    const NOTE_SUB_INDENT = 22; // lateral indent of one sub-level on a 时间轴 / 鱼骨 branch
    const NOTE_TL_GAP = 30;   // gap between two consecutive events on the timeline axis
    const NOTE_PAD = 56;      // margin baked into every layout, for the selection ring

    /** Children that take part in a layout: a collapsed node hides its whole subtree. */
    function noteVisibleChildren(node) {
      if (!node || node.collapsed === true) return [];
      return Array.isArray(node.children) ? node.children : [];
    }

    /**
     * The box a card is drawn in. Depth sets the base size; a picture adds its height.
     *
     * The base heights are not arbitrary: a card has to hold a two-line title AND one line of the
     * note without clipping, or the note's descenders get cut off by the card's own edge. The
     * centre is bigger than the first ring, and the first ring bigger than the rest.
     */
    function noteCardBox(node, depth) {
      const base = depth === 0 ? { w: 224, h: 86 } : depth === 1 ? { w: 188, h: 66 } : { w: 162, h: 58 };
      const image = node && node.imageKey ? clamp(Number(node.imageHeight) || 96, 56, 240) : 0;
      return { w: base.w, h: base.h + (image ? image + 10 : 0) };
    }

    /** The vertical band a subtree needs in a left→right structure. */
    function noteSpanV(node, depth) {
      const own = noteCardBox(node, depth).h;
      const kids = noteVisibleChildren(node);
      if (!kids.length) return own;
      let total = 0;
      for (const kid of kids) total += noteSpanV(kid, depth + 1);
      total += NOTE_GAP_Y * (kids.length - 1);
      return Math.max(own, total);
    }

    /** The horizontal band a subtree needs in a top→down structure. */
    function noteSpanH(node, depth) {
      const own = noteCardBox(node, depth).w;
      const kids = noteVisibleChildren(node);
      if (!kids.length) return own;
      let total = 0;
      for (const kid of kids) total += noteSpanH(kid, depth + 1);
      total += NOTE_GAP_X * (kids.length - 1);
      return Math.max(own, total);
    }

    /** Start offset and tallest card per level, so two levels can never collide. */
    function noteLevels(root, axis) {
      const sizes = [];
      const measure = (node, depth) => {
        const box = noteCardBox(node, depth);
        sizes[depth] = Math.max(sizes[depth] || 0, axis === 'y' ? box.h : box.w);
        for (const kid of noteVisibleChildren(node)) measure(kid, depth + 1);
      };
      measure(root, 0);
      const gap = axis === 'y' ? NOTE_GAP_L : NOTE_GAP_X;
      const starts = [];
      let cursor = 0;
      for (let depth = 0; depth < sizes.length; depth += 1) {
        starts[depth] = cursor;
        cursor += (sizes[depth] || 0) + gap;
      }
      return { starts, sizes };
    }

    /**
     * Place one subtree in a left→right structure.
     *
     * `cy` is the vertical centre this subtree owns, and a node always ends up at the centre of
     * its own children — that rule is what makes a mind map read as a fan instead of a
     * staircase, and it is the only reason the packing below is this short.
     */
    function placeBranch(node, depth, dir, cy, parent, out) {
      const box = noteCardBox(node, depth);
      const x = parent
        ? (dir > 0 ? parent.x + parent.w + NOTE_GAP_X : parent.x - NOTE_GAP_X - box.w)
        : -box.w / 2;
      const at = { id: node.id, depth, x, y: cy - box.h / 2, w: box.w, h: box.h };
      out.nodes.push(at);
      if (parent) out.edges.push({ from: parent.id, to: node.id, kind: 'h', side: dir > 0 ? 'r' : 'l' });
      const kids = noteVisibleChildren(node);
      if (!kids.length) return;
      let span = 0;
      for (const kid of kids) span += noteSpanV(kid, depth + 1);
      span += NOTE_GAP_Y * (kids.length - 1);
      let cursor = cy - span / 2;
      for (const kid of kids) {
        const kidSpan = noteSpanV(kid, depth + 1);
        placeBranch(kid, depth + 1, dir, cursor + kidSpan / 2, at, out);
        cursor += kidSpan + NOTE_GAP_Y;
      }
    }

    /** The centre of a structure that has exactly one, placed at the given centre point. */
    function noteCentreNode(root, cx, cy) {
      const box = noteCardBox(root, 0);
      return { id: root.id, depth: 0, x: cx - box.w / 2, y: cy - box.h / 2, w: box.w, h: box.h };
    }

    /**
     * 思维导图: the centre in the middle, branches alternating right and left.
     *
     * Sides alternate by index so a wide map stays balanced, and each side keeps its own order —
     * reading one side top→bottom still matches the outline.
     */
    function noteLayoutMind(root) {
      const out = { nodes: [], edges: [], guides: [] };
      const centre = noteCentreNode(root, 0, 0);
      out.nodes.push(centre);
      const kids = noteVisibleChildren(root);
      const sides = [[], []];
      kids.forEach((kid, index) => { sides[index % 2].push(kid) });
      for (let side = 0; side < 2; side += 1) {
        const dir = side === 0 ? 1 : -1;
        const list = sides[side];
        if (!list.length) continue;
        let span = 0;
        for (const kid of list) span += noteSpanV(kid, 1);
        span += NOTE_GAP_Y * (list.length - 1);
        let cursor = -span / 2;
        for (const kid of list) {
          const kidSpan = noteSpanV(kid, 1);
          placeBranch(kid, 1, dir, cursor + kidSpan / 2, centre, out);
          cursor += kidSpan + NOTE_GAP_Y;
        }
      }
      return out;
    }

    /** 逻辑图: one direction only — the right-hand logic chart everyone draws first. */
    function noteLayoutLogic(root) {
      const out = { nodes: [], edges: [], guides: [] };
      const centre = noteCentreNode(root, 0, 0);
      out.nodes.push(centre);
      const kids = noteVisibleChildren(root);
      if (kids.length) {
        let span = 0;
        for (const kid of kids) span += noteSpanV(kid, 1);
        span += NOTE_GAP_Y * (kids.length - 1);
        let cursor = -span / 2;
        for (const kid of kids) {
          const kidSpan = noteSpanV(kid, 1);
          placeBranch(kid, 1, 1, cursor + kidSpan / 2, centre, out);
          cursor += kidSpan + NOTE_GAP_Y;
        }
      }
      return out;
    }

    /**
     * 树形图: one uniform row per node, columns lined up by depth — the folder-tree reading.
     *
     * Deliberately not the same packing as 逻辑图: with a uniform pitch a deep branch can never
     * push its neighbours around, and every wire is a right angle into the row it belongs to.
     */
    function noteLayoutTree(root) {
      const out = { nodes: [], edges: [], guides: [] };
      const rows = [];
      const levelW = [];
      let pitch = 0;
      const collect = (node, depth) => {
        rows.push({ node, depth });
        const box = noteCardBox(node, depth);
        pitch = Math.max(pitch, box.h);
        levelW[depth] = Math.max(levelW[depth] || 0, box.w);
        for (const kid of noteVisibleChildren(node)) collect(kid, depth + 1);
      };
      collect(root, 0);
      pitch += NOTE_GAP_ROW;
      const columnX = [0];
      for (let depth = 1; depth < levelW.length; depth += 1) {
        columnX[depth] = columnX[depth - 1] + (levelW[depth - 1] || 0) + NOTE_GAP_X;
      }
      rows.forEach((row, index) => {
        const box = noteCardBox(row.node, row.depth);
        out.nodes.push({
          id: row.node.id, depth: row.depth,
          x: columnX[row.depth] || 0, y: index * pitch, w: box.w, h: box.h,
        });
      });
      for (const row of rows) {
        for (const kid of noteVisibleChildren(row.node)) {
          out.edges.push({ from: row.node.id, to: kid.id, kind: 'h', side: 'r' });
        }
      }
      return out;
    }

    /**
     * 组织结构图: the centre on top, every subtree owning a horizontal band.
     *
     * A level is a row: every card in it starts at the same y even when one of them carries a
     * picture and is twice as tall. The level's own height comes from its tallest card, so the
     * gap to the next level holds whatever the row turns out to be.
     */
    function noteLayoutOrg(root) {
      const out = { nodes: [], edges: [], guides: [] };
      const levels = noteLevels(root, 'y');
      const placeOrg = (node, depth, left, parent) => {
        const box = noteCardBox(node, depth);
        const span = noteSpanH(node, depth);
        const cx = left + span / 2;
        const at = { id: node.id, depth, x: cx - box.w / 2, y: levels.starts[depth], w: box.w, h: box.h };
        out.nodes.push(at);
        if (parent) out.edges.push({ from: parent.id, to: node.id, kind: 'v' });
        const kids = noteVisibleChildren(node);
        if (!kids.length) return;
        let total = 0;
        for (const kid of kids) total += noteSpanH(kid, depth + 1);
        total += NOTE_GAP_X * (kids.length - 1);
        // The children are packed inside the band the parent measured, centred in it — so a
        // parent wider than all its children still hangs them under its own middle.
        let cursor = left + (span - total) / 2;
        for (const kid of kids) {
          const kidSpan = noteSpanH(kid, depth + 1);
          placeOrg(kid, depth + 1, cursor, at);
          cursor += kidSpan + NOTE_GAP_X;
        }
      };
      placeOrg(root, 0, 0, null);
      return out;
    }

    /**
     * Lay one child and its whole subtree away from a structure's axis (时间轴 sub-notes,
     * 鱼骨图 spurs).
     *
     * `dir` is -1 to grow upwards and +1 to grow downwards; each level indents a little, so a
     * stack reads as one chain of thought instead of a column of unrelated cards.
     *
     * This builds a **self-contained** subtree and returns it, rather than pushing into the
     * shared arrays. That shape is what lets a caller pack sibling chains without collisions:
     * the old version walked a node's children starting at `at.y` with a fixed indent, so a
     * grandchild landed on its uncle's card whenever a node had both a sibling and a child.
     * Measured on a depth-3 tree it produced fully identical rectangles (`n4` and `n6` came out
     * as the same box), which is the reported 时间轴/鱼骨图 bug.
     *
     * Two passes, because a sibling's lateral room depends on how deep its own chain goes:
     * widths are measured bottom-up first, then positions are placed top-down using them.
     */
    function noteAxisSubtree(node, depth, x, y, dir) {
      const widthOf = new Map();
      const measure = (walk) => {
        const box = noteCardBox(walk, depth);
        let width = box.w;
        for (const kid of noteVisibleChildren(walk)) {
          width = Math.max(width, NOTE_SUB_INDENT + measure(kid));
        }
        widthOf.set(walk, width);
        return width;
      };
      measure(node);

      const nodes = [];
      const edges = [];
      const place = (walk, walkDepth, x0, y0) => {
        const box = noteCardBox(walk, walkDepth);
        nodes.push({ id: walk.id, depth: walkDepth, x: x0, y: y0, w: box.w, h: box.h });
        // Children stack along the axis from this card; each one starts after its predecessor's
        // whole chain, which is what keeps a deep chain from landing on the next sibling.
        let cursor = y0;
        for (const kid of noteVisibleChildren(walk)) {
          const kidHeight = noteCardBox(kid, walkDepth + 1).h;
          const childY = dir < 0 ? cursor - kidHeight - NOTE_GAP_Y : cursor + NOTE_GAP_Y;
          const childX = x0 + NOTE_SUB_INDENT;
          place(kid, walkDepth + 1, childX, childY);
          edges.push({ from: walk.id, to: kid.id, kind: 'stack', side: dir < 0 ? 'a' : 'b' });
          const placed = nodes[nodes.length - 1];
          cursor = dir < 0 ? placed.y : placed.y + placed.h;
        }
      };
      place(node, depth, x, y);
      const minY = Math.min(...nodes.map((item) => item.y));
      const maxY = Math.max(...nodes.map((item) => item.y + item.h));
      return { nodes, edges, width: widthOf.get(node) || 0, minY, maxY };
    }

    /**
     * Append a {@link noteAxisSubtree} result into a layout's arrays.
     *
     * The `stack` edges are dropped here on purpose. 时间轴 and 鱼骨图 draw their own axis and bones,
     * and a sub-note is placed tight against the card it belongs to, so a wire from the parent's
     * centre to it adds nothing but a long curve across the figure — the thing readers described as
     * "the lines go inside the nodes". Dropping them from the *data* also means the layout no longer
     * claims to draw something the renderer skips.
     */
    function appendAxisSubtree(out, sub) {
      for (const node of sub.nodes) out.nodes.push(node);
      for (const edge of sub.edges) {
        if (edge.kind === 'stack') continue;
        out.edges.push(edge);
      }
    }

    /**
     * 时间轴: the centre at the left end of a horizontal axis, events alternating above/below.
     *
     * The axis and its ticks are part of the drawing, so the wire from the centre to an event is
     * suppressed (`kind: 'none'`) — a fan of lines across the axis would just be noise.
     */
    /**
     * 时间轴: the centre sits at the left end of a horizontal axis and the notes that hang off it
     * are its **events**, laid out in order left→right and alternating above and below the axis.
     *
     * The axis and its ticks are part of the drawing, so no wire is drawn from the centre to an
     * event (`kind: 'none'`): a fan of lines across the axis is exactly the noise the axis exists
     * to avoid. Each event's own sub-notes continue away from the axis as a packed chain, which is
     * also why those `stack` edges are not drawn (see the wire layer).
     *
     * This is a *sequence*, not a race: the previous version reserved the ticks by padding each
     * event by a fixed 46px, which with long labels left ~150px of empty axis between events and
     * made the "timeline" read as scattered cards. The pitch is now the event's own width plus a
     * small constant, so the axis looks like time passing.
     */
    function noteLayoutTimeline(root) {
      const out = { nodes: [], edges: [], guides: [] };
      const rootBox = noteCardBox(root, 0);
      out.nodes.push(noteCentreNode(root, rootBox.w / 2, 0));
      const kids = noteVisibleChildren(root);
      let cursor = rootBox.w + NOTE_TL_GAP;
      kids.forEach((kid, index) => {
        const dir = index % 2 === 0 ? -1 : 1;
        const box = noteCardBox(kid, 1);
        const at = {
          id: kid.id, depth: 1, x: cursor,
          y: dir * (NOTE_AXIS_OFF + box.h / 2) - box.h / 2, w: box.w, h: box.h,
        };
        // The event card and its sub-notes are placed by ONE call, so the card is never emitted
        // twice and its chain reserves the column it needs.
        out.edges.push({ from: root.id, to: kid.id, kind: 'none' });
        out.guides.push({
          kind: 'tick', x1: cursor + box.w / 2, y1: 0, x2: cursor + box.w / 2,
          y2: dir * NOTE_AXIS_OFF, dir,
        });
        const sub = noteAxisSubtree(kid, 1, at.x, at.y, dir);
        appendAxisSubtree(out, sub);
        cursor += chainWidth(sub, box) + NOTE_TL_GAP;
      });
      let right = 0;
      for (const node of out.nodes) right = Math.max(right, node.x + node.w);
      out.guides.unshift({ kind: 'axis', x1: -20, y1: 0, x2: right + 16, y2: 0 });
      return out;
    }

    /** Horizontal space a packed chain needs, given the box of the node it starts from. */
    function chainWidth(sub, box) {
      return Math.max(box.w, NOTE_SUB_INDENT + (sub ? sub.width : 0));
    }

    /**
     * The fishbone's spine runs low and its head sits at the right end; causes branch **up** off
     * the spine and then bend up-left at a true 45°, which is the "bone" the name promises.
     *
     * Each cause's own sub-causes are placed by {@link noteAxisSubtree} and then lifted so that
     * **every cause card sits on one baseline**. That is what keeps neighbours apart: a cause at
     * even index grows upward from the line and its odd neighbour grows downward, so a deep chain
     * at 45° runs *away* from the cause next door instead of into it. An earlier version indented
     * sub-causes to the right, which walked each chain straight into its neighbour.
     */
    function noteLayoutFish(root) {
      const out = { nodes: [], edges: [], guides: [] };
      const box = noteCardBox(root, 0);
      const kids = noteVisibleChildren(root);
      const step = 150;
      // The spine always leaves room for at least two causes, so a single cause still reads as a
      // rib on a spine rather than a line with a card at the end.
      const spineLen = Math.max(300, (kids.length + 0.4) * step);
      const rise = NOTE_RIB;
      const head = noteCentreNode(root, spineLen + rise + box.w / 2, 0);
      head.y = -head.h / 2;
      out.nodes.push(head);
      out.guides.push({ kind: 'spine', x1: 0, y1: 0, x2: spineLen + rise, y2: 0 });

      kids.forEach((kid, index) => {
        const dir = index % 2 === 0 ? -1 : 1;
        const kidBox = noteCardBox(kid, 1);
        const attach = spineLen - index * step;
        // One straight bone from the spine to the card's near corner: `vdist` is both the vertical
        // drop to that corner and the 45° leg's horizontal length. Drawing it as a single barb —
        // rather than a stub plus a segment — is what keeps |dx| === |dy| for every card height.
        const vdist = rise + kidBox.h / 2;
        const cornerY = dir < 0 ? -vdist : vdist;
        const cornerX = attach - vdist;
        // The card sits with its near corner on the barb's end: an upper cause's bottom-LEFT corner,
        // a lower cause's top-left corner.
        const primeX = cornerX - kidBox.w;
        const sub = noteAxisSubtree(kid, 1, 0, 0, dir);
        const prime = sub.nodes.find((node) => node.depth === 1) || sub.nodes[0];
        const dx = primeX - prime.x;
        const dy = cornerY - prime.y;
        // Place the whole chain shifted, then append through the helper so its `stack` edges are
        // dropped exactly as they are on the timeline (see appendAxisSubtree).
        appendAxisSubtree(out, {
          nodes: sub.nodes.map((node) => Object.assign({}, node, { x: node.x + dx, y: node.y + dy })),
          edges: sub.edges,
        });
        out.guides.push({ kind: 'rib', x1: attach, y1: 0, x2: cornerX, y2: cornerY, dir });
      });
      return out;
    }

    /**
     * Shift a packing into positive coordinates and index it by id.
     *
     * Every structure works in its own convenient origin (the centre at 0,0; the axis at y=0)
     * while the view needs one space it can pan in, so the shift happens once, here, instead of
     * in six places. It also drops edges whose ends are no longer visible — a collapsed branch
     * leaves its descendants out of `nodes`, and a wire to a card that is not drawn is a bug.
     */
    function noteFinish(raw, root) {
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const node of raw.nodes) {
        minX = Math.min(minX, node.x);
        minY = Math.min(minY, node.y);
        maxX = Math.max(maxX, node.x + node.w);
        maxY = Math.max(maxY, node.y + node.h);
      }
      if (!raw.nodes.length) { minX = 0; minY = 0; maxX = 1; maxY = 1 }
      const dx = NOTE_PAD - minX;
      const dy = NOTE_PAD - minY;
      const nodes = raw.nodes.map((node) => Object.assign({}, node, { x: node.x + dx, y: node.y + dy }));
      const guides = raw.guides.map((guide) => Object.assign({}, guide, {
        x1: guide.x1 + dx, y1: guide.y1 + dy, x2: guide.x2 + dx, y2: guide.y2 + dy,
      }));
      const byId = {};
      for (const node of nodes) byId[node.id] = node;
      const order = [];
      walkNotes(root, 0, (note) => { if (byId[note.id]) order.push(note.id) });
      return {
        byId,
        order,
        guides,
        nodes,
        edges: raw.edges.filter((edge) => byId[edge.from] && byId[edge.to]),
        box: { w: maxX - minX + NOTE_PAD * 2, h: maxY - minY + NOTE_PAD * 2 },
      };
    }

    function noteLayoutFor(layout, root) {
      const recipe = layout === 'logic' ? noteLayoutLogic
        : layout === 'org' ? noteLayoutOrg
          : layout === 'tree' ? noteLayoutTree
            : layout === 'timeline' ? noteLayoutTimeline
              : layout === 'fish' ? noteLayoutFish
                : noteLayoutMind;
      return noteFinish(recipe(root), root);
    }

    /**
     * The `d` of one wire, in the map's own coordinate space.
     *
     * `branch` picks the shape. `edge.side` is not decoration: a branch on the left of a mind map
     * leaves from the parent's left edge, and a wire that always left from the right would cross
     * its own card. 树形图 forces the right angle because that is what makes it a tree.
     */
    function noteWireD(a, b, edge, branch) {
      if (!a || !b) return '';
      const kind = edge && edge.kind ? edge.kind : 'h';
      const mid = (from, to) => from + (to - from) / 2;
      if (kind === 'rib') {
        return 'M ' + (a.x + a.w / 2) + ' ' + (a.y + a.h / 2) + ' L ' + (b.x + b.w / 2) + ' ' + (b.y + b.h / 2);
      }
      if (kind === 'stack') {
        const up = edge.side === 'a';
        const x1 = a.x + a.w / 2;
        const y1 = up ? a.y : a.y + a.h;
        const x2 = b.x + b.w / 2;
        const y2 = up ? b.y + b.h : b.y;
        return 'M ' + x1 + ' ' + y1 + ' L ' + mid(x1, x2) + ' ' + mid(y1, y2) + ' L ' + x2 + ' ' + y2;
      }
      const vertical = kind === 'v';
      const right = (b.x + b.w / 2) >= (a.x + a.w / 2);
      const down = (b.y + b.h / 2) >= (a.y + a.h / 2);
      const x1 = vertical ? a.x + a.w / 2 : (right ? a.x + a.w : a.x);
      const y1 = vertical ? (down ? a.y + a.h : a.y) : a.y + a.h / 2;
      const x2 = vertical ? b.x + b.w / 2 : (right ? b.x : b.x + b.w);
      const y2 = vertical ? (down ? b.y : b.y + b.h) : b.y + b.h / 2;
      if (branch === 'line') return 'M ' + x1 + ' ' + y1 + ' L ' + x2 + ' ' + y2;
      if (branch === 'elbow') {
        return vertical
          ? 'M ' + x1 + ' ' + y1 + ' V ' + mid(y1, y2) + ' H ' + x2 + ' V ' + y2
          : 'M ' + x1 + ' ' + y1 + ' H ' + mid(x1, x2) + ' V ' + y2 + ' H ' + x2;
      }
      // The mind-map S-curve: both control points sit on the axis the wire actually travels,
      // so the curve leaves and lands horizontally (or vertically) and never cuts a corner.
      return vertical
        ? 'M ' + x1 + ' ' + y1 + ' C ' + x1 + ' ' + mid(y1, y2) + ' ' + x2 + ' ' + mid(y1, y2) + ' ' + x2 + ' ' + y2
        : 'M ' + x1 + ' ' + y1 + ' C ' + mid(x1, x2) + ' ' + y1 + ' ' + mid(x1, x2) + ' ' + y2 + ' ' + x2 + ' ' + y2;
    }

    /* ---- 文件: 本地保存 / 读取 / 通用格式导出 ----------------------------------------------
       这一层全是纯函数：一棵树进，一段文本出（或反过来）。所以
       「导出的 .mm / .opml / .md 里到底有什么」是能被断言的事实，而不是靠打开文件看一眼。
       解析器不用 DOMParser / DOMParser 不存在时要能跑（自检在 Node 里跑），
       三种格式的文法都很小，按标签扫描比引一个 XML 解析器更可控。 */

    /** 反转义 XML 实体，含数字引用 —— 导出时用 xmlEscape，两边必须成对。 */
    function noteXmlUnescape(value) {
      return String(value === undefined || value === null ? '' : value)
        .replace(/&#x([0-9a-fA-F]+);/g, (all, code) => String.fromCharCode(parseInt(code, 16)))
        .replace(/&#(\d+);/g, (all, code) => String.fromCharCode(Number(code)))
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
        .replace(/&amp;/g, '&');
    }

    /** 从一个标签文本里取属性，单双引号都认。 */
    function noteXmlAttr(tag, name) {
      const hit = new RegExp('\\b' + name + '\\s*=\\s*"([^"]*)"').exec(tag)
        || new RegExp('\\b' + name + "\\s*=\\s*'([^']*)'").exec(tag);
      return hit ? noteXmlUnescape(hit[1]) : '';
    }

    /** 去掉标签、压平空白 —— 用于把 <richcontent> 里的备注读回纯文本。 */
    function noteStripTags(value) {
      return noteXmlUnescape(String(value || '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
    }

    /** 把 <node> / <outline> 这类嵌套标签扫成一棵树；返回 null 表示一个标签都没有。 */
    function noteTreeFromTags(text, tag, readAttr) {
      const source = String(text || '');
      const pattern = new RegExp('<' + tag + '\\b[^>]*?/>|<' + tag + '\\b[^>]*>|</' + tag + '>|<richcontent\\b[^>]*>[\\s\\S]*?</richcontent>', 'gi');
      const tokens = source.match(pattern) || [];
      if (!tokens.length) return null;
      const root = defaultNoteRoot();
      const stack = [];
      let current = null;
      for (const token of tokens) {
        if (/^<richcontent/i.test(token)) {
          if (current) current.body = noteStripTags(token);
          continue;
        }
        if (/^<\//.test(token)) {
          stack.pop();
          current = stack[stack.length - 1] || null;
          continue;
        }
        const title = readAttr(token);
        const leaf = /\/>\s*$/.test(token);
        if (!stack.length) {
          // 第一个节点就是中心：保住 root 的 id，让整棵树始终有且只有一个根。
          // 中心的备注也要读 —— 它和子节点一样可能带 _note / richcontent。
          root.title = title;
          root.body = noteXmlAttr(token, '_note');
          root.children = [];
          stack.push(root);
          current = root;
          continue;
        }
        const node = defaultNoteNode(title);
        const extra = noteXmlAttr(token, '_note');
        if (extra) node.body = extra;
        stack[stack.length - 1].children.push(node);
        if (!leaf) { stack.push(node); current = node } else { current = stack[stack.length - 1] }
      }
      return root;
    }

    /**
     * FreeMind / XMind 的 .mm。XMind 能直接导入它，Freeplane / MindManager 也认；
     * 备注走 FreeMind 自己的 <richcontent TYPE="NOTE">。
     */
    function noteToFreeMind(root, layout) {
      const pad = (depth) => new Array(depth + 1).join('  ');
      const write = (note, depth, index) => {
        const attrs = ['TEXT="' + xmlEscape(note.title || '') + '"'];
        // 思维导图的分支是左右交替的，导出时把它写进 POSITION，导进 XMind 才是同一个形状。
        if (layout === 'mind' && depth === 1) attrs.push('POSITION="' + (index % 2 === 0 ? 'right' : 'left') + '"');
        const kids = Array.isArray(note.children) ? note.children : [];
        const body = String(note.body || '');
        if (!kids.length && !body) return pad(depth) + '<node ' + attrs.join(' ') + '/>';
        const lines = [pad(depth) + '<node ' + attrs.join(' ') + '>'];
        if (body) {
          lines.push(pad(depth + 1) + '<richcontent TYPE="NOTE"><html><body><p>'
            + xmlEscape(body) + '</p></body></html></richcontent>');
        }
        kids.forEach((kid, at) => lines.push(write(kid, depth + 1, at)));
        lines.push(pad(depth) + '</node>');
        return lines.join('\n');
      };
      return '<?xml version="1.0" encoding="UTF-8"?>\n<map version="1.0.1">\n'
        + write(root, 0, 0) + '\n</map>\n';
    }

    function noteFromFreeMind(text) {
      const tree = noteTreeFromTags(text, 'node', (token) => noteXmlAttr(token, 'TEXT') || noteXmlAttr(token, 'text'));
      return tree || defaultNoteRoot();
    }

    /** OPML：大纲类工具（OmniOutliner / 幕布 / MindManager）通吃的格式，备注放 _note。 */
    function noteToOpml(root, title) {
      const pad = (depth) => new Array(depth + 1).join('  ');
      const write = (note, depth) => {
        const attrs = ['text="' + xmlEscape(note.title || '') + '"'];
        if (note.body) attrs.push('_note="' + xmlEscape(note.body) + '"');
        const kids = Array.isArray(note.children) ? note.children : [];
        if (!kids.length) return pad(depth) + '<outline ' + attrs.join(' ') + '/>';
        return pad(depth) + '<outline ' + attrs.join(' ') + '>\n'
          + kids.map((kid) => write(kid, depth + 1)).join('\n') + '\n' + pad(depth) + '</outline>';
      };
      return '<?xml version="1.0" encoding="UTF-8"?>\n<opml version="2.0">\n<head>\n  <title>'
        + xmlEscape(title || '') + '</title>\n</head>\n<body>\n' + write(root, 1) + '\n</body>\n</opml>\n';
    }

    function noteFromOpml(text) {
      const source = String(text || '');
      const tree = noteTreeFromTags(source, 'outline', (token) => noteXmlAttr(token, 'text') || noteXmlAttr(token, 'title'));
      if (tree) return tree;
      // 没有 <outline>：退回按 Markdown 大纲读，总比给一张空图好。
      return noteFromMarkdown(source);
    }

    /** Markdown：只有标题的纯大纲 —— 它是给别的工具看的，不是备份（备份走 JSON）。 */
    function noteToMarkdown(root) {
      const lines = [];
      const write = (note, depth) => {
        lines.push(new Array(depth + 1).join('  ') + '- ' + String(note.title || '').replace(/\s*\n+\s*/g, ' '));
        for (const kid of Array.isArray(note.children) ? note.children : []) write(kid, depth + 1);
      };
      write(root, 0);
      return lines.join('\n') + '\n';
    }

    /**
     * 读 Markdown 大纲：`- ` / `* ` / `1. ` 都认，缩进（空格或 Tab）决定层级。
     * 第一条就是中心节点 —— 与导出对称。
     */
    function noteFromMarkdown(text) {
      const root = defaultNoteRoot();
      const stack = [{ node: root, indent: -1 }];
      let first = true;
      for (const line of String(text || '').split(/\r?\n/)) {
        const hit = /^([ \t]*)(?:[-*+]|\d+[.)])\s+(.*)$/.exec(line);
        if (!hit) continue;
        const indent = hit[1].replace(/\t/g, '  ').length;
        const title = hit[2].replace(/\s+$/, '');
        while (stack.length > 1 && indent <= stack[stack.length - 1].indent) stack.pop();
        if (first) {
          root.title = title;
          stack.push({ node: root, indent });
          first = false;
          continue;
        }
        const node = defaultNoteNode(title);
        stack[stack.length - 1].node.children.push(node);
        stack.push({ node, indent });
      }
      return root;
    }

    /**
     * XMind 的结构 id。导出时写进 rootTopic.structureClass，XMind 打开就是同一种排布 ——
     * 这几种预设本来就是照市面思维导图软件的结构命名的，能对上是应该的。
     */
    const NOTE_XMIND_STRUCTURE = {
      mind: 'org.xmind.ui.map.unbalanced',
      logic: 'org.xmind.ui.logic.right',
      org: 'org.xmind.ui.org-chart.down',
      tree: 'org.xmind.ui.tree.right',
      timeline: 'org.xmind.ui.timeline.horizontal',
      fish: 'org.xmind.ui.fishbone.right',
    };

    /** .xmind 的 content.json（XMind Zen / 2020+ 的容器格式；压缩包由调用方去打）。 */
    function noteToXmindContent(root, title, layout) {
      let seq = 0;
      const topic = (note, depth) => {
        const out = { id: 't' + (++seq), class: 'topic', title: String(note.title || '') };
        if (depth === 0) out.structureClass = NOTE_XMIND_STRUCTURE[layout] || NOTE_XMIND_STRUCTURE.mind;
        if (note.body) out.notes = { plain: { content: String(note.body) } };
        const kids = Array.isArray(note.children) ? note.children : [];
        if (kids.length) out.children = { attached: kids.map((kid) => topic(kid, depth + 1)) };
        return out;
      };
      const sheet = { id: 'sheet-1', class: 'sheet', title: title || '框架笔记', rootTopic: topic(root, 0) };
      return JSON.stringify([sheet], null, 2);
    }

    /** .xmind 的另外两个成员；XMind 认这一组三件套。 */
    function noteXmindManifest() {
      return JSON.stringify({ 'file-entries': { 'content.json': {}, 'metadata.json': {} } }, null, 2);
    }

    function noteXmindMetadata() {
      return JSON.stringify({ creator: { name: 'DSH 工作台 · 框架笔记', version: '1.0' } }, null, 2);
    }

    /** 原生格式：整棵树 + 图纸设置 + 图片（base64）。只有它能完整还原本模块。 */
    function noteToNativeText(payload) {
      return JSON.stringify(payload, null, 2);
    }

    function noteFromNative(text) {
      const data = safe(() => JSON.parse(text), null);
      if (!data || typeof data !== 'object') return null;
      if (!data.tree || typeof data.tree !== 'object') return null;
      return {
        tree: normalizeNoteNode(data.tree),
        style: data.style && typeof data.style === 'object' ? data.style : null,
        images: data.images && typeof data.images === 'object' ? data.images : {},
        title: typeof data.title === 'string' ? data.title : '',
      };
    }

    /**
     * 读一个本地文件。用扩展名决定解析器 —— 扩展名是用户自己选的那一个；
     * 只有原生 JSON 带图片与逐节点样式，其余三种是结构 + 文字（备注能带的都带）。
     */
    function noteParseFile(filename, text) {
      const name = String(filename || '').toLowerCase();
      if (/\.json$/.test(name)) {
        const native = noteFromNative(text);
        if (!native) return { ok: false, error: 'noteFileBadJson' };
        return { ok: true, kind: 'native', tree: native.tree, style: native.style, images: native.images, title: native.title };
      }
      if (/\.(mm|freemind)$/.test(name)) return { ok: true, kind: 'freemind', tree: noteFromFreeMind(text), images: {} };
      if (/\.(opml|xml)$/.test(name)) return { ok: true, kind: 'opml', tree: noteFromOpml(text), images: {} };
      if (/\.(md|markdown|txt)$/.test(name)) return { ok: true, kind: 'markdown', tree: noteFromMarkdown(text), images: {} };
      return { ok: false, error: 'noteFileBadType' };
    }

    /** 下载用的文件名：模块名 + 扩展名，去掉文件名里不能用的字符。 */
    function noteFileName(title, extension) {
      const base = String(title || '框架笔记').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();
      return (base || '框架笔记') + extension;
    }

    /** Blob → data URL，用来把图片塞进原生 JSON；没有 FileReader 就交回空串（图片缺席）。 */
    function noteBlobToDataUrl(blob) {
      return new Promise((resolve) => {
        const Reader = safe(() => window.FileReader, null);
        if (!Reader || !blob) { resolve(''); return }
        const reader = new Reader();
        reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
        reader.onerror = () => resolve('');
        safe(() => reader.readAsDataURL(blob));
      });
    }

    /** data URL → Blob，导入原生 JSON 时把图片写回 IndexedDB。 */
    function noteDataUrlToBlob(dataUrl) {
      const hit = /^data:([^;,]*)(;base64)?,([\s\S]*)$/.exec(String(dataUrl || ''));
      if (!hit) return null;
      const mime = hit[1] || 'image/png';
      if (!hit[2]) {
        const text = safe(() => decodeURIComponent(hit[3]), null);
        return text === null ? null : new Blob([text], { type: mime });
      }
      const binary = safe(() => window.atob(hit[3].replace(/\s+/g, '')), null);
      if (binary === null) return null;
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
      return new Blob([bytes], { type: mime });
    }

    /**
     * Blob URLs for every picture the map shows, loaded once per storage key.
     *
     * Pictures live in IndexedDB — the same store the background library uses — because a data
     * URL for a photo would eat the localStorage budget the whole workbench shares. One loader
     * for the map rather than one per card: cards are re-created on every pan, and a per-card
     * loader would re-read the same blob dozens of times a second.
     */
    function useNoteImages(root) {
      const [urls, setUrls] = useState({});
      const loadedRef = useRef({});
      const keys = useMemo(() => {
        const list = [];
        walkNotes(root, 0, (note) => { if (note.imageKey) list.push(note.imageKey) });
        return list.join('\u0000');
      }, [root]);
      useEffect(() => {
        const wanted = keys ? keys.split('\u0000') : [];
        const missing = wanted.filter((key) => !loadedRef.current[key]);
        if (!missing.length) return undefined;
        let alive = true;
        Promise.all(missing.map((key) => mediaGet(key).then((blob) => ({ key, blob })).catch(() => null)))
          .then((rows) => {
            if (!alive) return;
            const next = {};
            let added = false;
            for (const row of rows) {
              if (!row || !row.blob || typeof window.URL.createObjectURL !== 'function') continue;
              const url = safe(() => window.URL.createObjectURL(row.blob), null);
              if (url) { next[row.key] = url; added = true }
            }
            if (!added) return;
            loadedRef.current = Object.assign({}, loadedRef.current, next);
            setUrls(loadedRef.current);
          });
        return () => { alive = false };
      }, [keys]);
      return urls;
    }

    /** 一个节点连同它可见的后代一起访问 —— 拖一枝的时候要把整枝都算上。 */
    function noteWalkVisible(node, visit) {
      if (!node) return;
      visit(node);
      for (const kid of noteVisibleChildren(node)) noteWalkVisible(kid, visit);
    }

    /** One row of the outline rail, recursively with its children. */
    function NoteOutlineRow({ node, depth, selectedId, t, onSelect, onEdit, onAdd, onDelete, onToggle }) {
      const kids = Array.isArray(node.children) ? node.children : [];
      const collapsed = node.collapsed === true;
      return h('div', { className: 'wsb-noteBranch' },
        h('div', {
          className: 'wsb-noteRow', 'data-note-row': node.id,
          'data-sel': selectedId === node.id ? 'true' : 'false',
          style: { paddingLeft: (4 + depth * 13) + 'px' },
        },
          h('button', {
            type: 'button', className: 'wsb-noteTwist', 'data-note-twist': node.id,
            'data-open': collapsed ? 'false' : 'true', title: collapsed ? t.noteExpand : t.noteCollapse,
            disabled: !kids.length,
            onClick: () => onToggle(node.id),
          }, kids.length ? (collapsed ? '▸' : '▾') : '·'),
          h('button', {
            type: 'button', className: 'wsb-noteRowMain', title: node.title || t.noteNode,
            'data-note-row-main': node.id,
            onClick: () => onSelect(node.id),
            onDoubleClick: () => onEdit(node.id),
          },
            h('span', { className: 'wsb-noteRowTitle' }, node.title || t.noteNode),
            node.imageKey
              ? h('span', { className: 'wsb-noteRowImg', 'data-note-row-image': node.id, title: t.noteImage }, '▣')
              : null,
            kids.length ? h('span', { className: 'wsb-noteRowMeta' }, String(kids.length)) : null),
          h('button', {
            type: 'button', className: 'wsb-noteRowBtn', title: t.noteAdd,
            'data-note-row-add': node.id, onClick: () => onAdd(node.id),
          }, '+'),
          depth > 0
            ? h('button', {
              type: 'button', className: 'wsb-noteRowBtn', 'data-tone': 'danger', title: t.noteDelete,
              'data-note-row-del': node.id, onClick: () => onDelete(node.id),
            }, '×')
            : null),
        !collapsed && kids.length
          ? h('div', { className: 'wsb-noteKids' }, kids.map((kid) => h(NoteOutlineRow, {
            key: kid.id, node: kid, depth: depth + 1, selectedId, t,
            onSelect, onEdit, onAdd, onDelete, onToggle,
          })))
          : null);
    }

    /**
     * 框架笔记 (kind: 'notebook'): a node mind map.
     *
     * The window IS the map: a two-row top bar that switches structure / wires / palette and
     * saves or exports the map, a collapsible outline rail on the left, the canvas in the middle
     * and an inspector for the selected node on the right. Both rails can be hidden, so the map
     * can take the whole screen.
     *
     * The canvas is a frosted slab over the desktop background, exactly like the console and the
     * news reader — the map's own colours are limited to ACCENTS (see NOTE_THEMES), so the map
     * follows the desktop's material, light/dark and palette settings instead of fighting them.
     *
     * Cards are real elements, not a <canvas> drawing: text editing is then a textarea the
     * browser already knows how to handle, a picture is an <img> the browser already knows how to
     * decode, and every claim about the map is inspectable. The wires are the only SVG.
     */
    /**
     * 左栏：笔记历史。
     *
     * One row per note in the module, newest first, with the open one marked. This replaced the
     * node tree that used to live here: the tree is already the picture in the middle, so a second
     * outline of it said nothing new, while "which notes do I have" had nowhere to be asked.
     *
     * A row carries the things you cannot see from the canvas: how big the note is, whether it
     * holds pictures, and when it was made. Delete is on the context menu (右键) rather than a
     * hover button, so a stray click cannot destroy a note.
     */
    function NoteHistory({ t, docs, activeId, onOpen, onDelete }) {
      const [menu, setMenu] = useState(null);
      const [notice, setNotice] = useState('');

      const rows = docs.slice().sort((left, right) => right.created - left.created);
      const askDelete = (doc) => {
        if (docs.length <= 1) {
          setNotice(t.noteNoteLastOne);
          setMenu(null);
          return;
        }
        setNotice(t.noteNoteDeleted + ' · ' + noteDocLabel(doc, t));
        onDelete(doc.id);
        setMenu(null);
      };

      return h('div', { className: 'wsb-glass wsb-noteRail wsb-noteHistory', 'data-note-history': '1' },
        h(PaneHead, { title: t.noteHistory, sub: docs.length + '' }),
        h('div', { className: 'wsb-body' },
          h('div', { className: 'wsb-noteRows wsb-noteDocRows', 'data-note-doc-rows': '1' },
            rows.length
              ? rows.map((doc, index) => {
                const meta = noteDocMeta(doc);
                const open = doc.id === activeId;
                return h('button', {
                  key: doc.id, type: 'button', className: 'wsb-noteDoc', 'data-note-doc': doc.id,
                  'data-open': open ? 'true' : 'false', style: { '--wsb-i': String(index) },
                  title: t.noteNoteDeleteHint,
                  onClick: () => onOpen(doc.id),
                  onContextMenu: (event) => {
                    event.preventDefault();
                    setMenu({ id: doc.id, x: event.clientX, y: event.clientY });
                  },
                },
                  h('span', { className: 'wsb-noteDocDot', 'aria-hidden': 'true' }),
                  h('span', { className: 'wsb-noteDocMain' },
                    h('span', { className: 'wsb-noteDocName', 'data-note-doc-name': doc.id },
                      noteDocLabel(doc, t)),
                    h('span', { className: 'wsb-noteDocMeta' },
                      meta.nodes + ' ' + t.noteNodes,
                      meta.images ? ' · ' + meta.images + ' ' + t.noteImages : '',
                      ' · ' + noteDocAge(doc.created, t))));
              })
              : h('div', { className: 'wsb-noteEmptyMini' }, t.noteHistoryEmpty)),
          notice ? h('div', { className: 'wsb-noteNotice', 'data-note-notice': '1' }, notice) : null,
          // 这里原本还有一个「文件」小链接指向导出菜单。文件动作已经收进顶栏那一个「文件」按钮，
          // 所以这条只是同一件事的第二个入口 —— 去掉，rail 底部只留一句状态。
          h('div', { className: 'wsb-noteHistFoot' },
            h('span', null, t.noteNoteSaved))),
        menu
          ? h('div', {
            className: 'wsb-noteMenu', 'data-note-doc-menu': menu.id,
            style: { left: (menu.x || 0) + 'px', top: (menu.y || 0) + 'px' },
          },
            h('button', {
              type: 'button', className: 'wsb-noteMenuItem', 'data-tone': 'danger',
              'data-note-doc-del': menu.id, onClick: () => askDelete(rows.find((doc) => doc.id === menu.id) || rows[0]),
            }, t.noteNoteDelete),
            h('button', {
              type: 'button', className: 'wsb-noteMenuItem', 'data-note-doc-close': '1',
              onClick: () => setMenu(null),
            }, t.cancel))
          : null,
        menu ? h('div', { className: 'wsb-noteMenuMask', onClick: () => setMenu(null) }) : null);
    }

    function NotebookView({ t, module, patchModule, appearance, onBack, anim, screenStyle, onAnimEnd }) {
      const style = noteStyleOf(module);
      // The note stack (migrated on read) and which note is open. `root` stays the single source
      // the rest of this component reads, so every existing call site keeps working.
      const docs = useMemo(() => noteDocsOf(module), [module]);
      const activeId = useMemo(() => activeNoteDocId(module, docs), [module, docs]);
      const activeDoc = useMemo(
        () => docs.find((doc) => doc.id === activeId) || docs[0] || null,
        [docs, activeId],
      );
      const root = useMemo(() => (activeDoc ? activeDoc.root : defaultNoteRoot()), [activeDoc]);
      const view0 = useMemo(() => noteViewOf(module), [module]);
      const theme = NOTE_THEMES[style.theme];
      const [selectedId, setSelectedId] = useState(root.id);
      const [editingId, setEditingId] = useState(null);
      const [outline, setOutline] = useState(view0.outline);
      const [inspector, setInspector] = useState(view0.inspector);
      const [pan, setPan] = useState({ x: view0.x, y: view0.y, zoom: view0.zoom });
      // A map that has never been placed is fitted on open, and that fit needs the canvas size —
      // which only exists after the first paint. Until then the world is held invisible, or the
      // first frame shows the map at 100 % in the corner and then jumps to the fit.
      const [ready, setReady] = useState(view0.fitted);
      const [liveDrag, setLiveDrag] = useState(null);
      const [hot, setHot] = useState('');
      const [fileOpen, setFileOpen] = useState(false);
      const [fileStatus, setFileStatus] = useState('');
      // 右键菜单（画布 / 节点）、「新建图表」对话框、以及拖动 + 时的临时连线。
      const [menu, setMenu] = useState(null);
      const [newOpen, setNewOpen] = useState(false);
      const [newName, setNewName] = useState('');
      const [link, setLink] = useState(null);
      const [, setHistVer] = useState(0);
      const canvasRef = useRef(null);
      const editRef = useRef(null);
      const fileRef = useRef(null);
      const importRef = useRef(null);
      const gestureRef = useRef(null);
      const originalRef = useRef('');
      const statusRef = useRef(null);
      const historyRef = useRef({ past: [], future: [] });
      const urls = useNoteImages(root);

      const layout = useMemo(() => noteLayoutFor(style.layout, root), [style.layout, root]);
      const totals = useMemo(() => noteTotals(root), [root]);
      const branch = style.layout === 'tree' ? 'elbow' : style.branch;
      const selected = findNote(root, selectedId) || root;
      const selectedAt = layout.byId[selectedId] || null;
      // 一张还没开始的图：只剩那个空的中心节点。右键空白处新建的第一个节点就是它 ——
      // 「新建 → 空画布 → 右键建第一个节点（它成为根）→ 右键根节点建子节点」。
      /**
       * Mark the **open note** as started, so the blank-canvas explainer does not come back.
       *
       * This used to write a module-level flag, which breaks once a module can hold several notes:
       * a second, empty note found the flag already set and skipped the explainer, and there was
       * no way to say "note A has begun, note B has not".
       */
      const markNoteStarted = useCallback(() => {
        patchModule(module.id, (target) => {
          const stack = noteDocsOf(target);
          const wanted = activeNoteDocId(target, stack);
          const doc = stack.find((item) => item.id === wanted) || stack[0];
          if (!doc) return;
          doc.started = true;
          target.noteDocs = stack;
          target.activeNoteId = doc.id;
          target.noteRoot = doc.root;
        });
      }, [patchModule, module.id]);

      const blank = !(activeDoc && activeDoc.started === true) && !root.title && !root.children.length && !root.imageKey;

      /**
       * A node's rect in world space, including everything that moves it: its saved drag offset
       * (`ox` / `oy`) and, while a drag is in flight, the live delta.
       *
       * This has to be the ONE place that decides where a node is, because the cards and the wires
       * both read it. The first version applied the offsets to the cards only while the wires were
       * computed from the pure layout position — so after a drag the cards stayed put and every
       * wire snapped back to where the node used to be, which reads as "the line does not reach the
       * card" (and is exactly what the user saw).
       */
      const rectOf = useCallback((id) => {
        const base = layout.byId[id];
        if (!base) return null;
        const note = findNote(root, id);
        const ox = note && isFinite(note.ox) ? Number(note.ox) : 0;
        const oy = note && isFinite(note.oy) ? Number(note.oy) : 0;
        const live = liveDrag && liveDrag.ids.indexOf(id) >= 0 ? liveDrag : null;
        if (!ox && !oy && !live) return base;
        return Object.assign({}, base, {
          x: base.x + ox + (live ? live.dx : 0),
          y: base.y + oy + (live ? live.dy : 0),
        });
      }, [layout, liveDrag, root]);

      const patchTree = useCallback((mutate, rememberFirst) => {
        // The snapshot is taken from the rendered tree rather than from inside the state
        // updater: a side effect inside an updater can run twice, and 撤销 would then skip.
        if (rememberFirst) {
          const history = historyRef.current;
          history.past.push(JSON.stringify(root));
          if (history.past.length > NOTE_HISTORY) history.past.shift();
          history.future.length = 0;
          setHistVer((value) => value + 1);
        }
        patchModule(module.id, (target) => {
          const stack = noteDocsOf(target);
          const wanted = activeNoteDocId(target, stack);
          const doc = stack.find((item) => item.id === wanted) || stack[0];
          if (!doc) return;
          // Mutate the **stored** tree in place, then repair it. Normalising into a copy first and
          // writing that back would work too, but it re-generates ids for any node that lost one
          // and breaks every reference the caller still holds (`findNote` lookups, `parent`).
          mutate(doc.root);
          doc.root = normalizeNoteNode(doc.root);
          target.noteDocs = stack;
          target.activeNoteId = doc.id;
          // Keep the legacy single-tree field pointing at the open note: 导出/打开/新建 still read
          // it, and a reader who downgrades should find their current map where they left it.
          target.noteRoot = doc.root;
        });
      }, [patchModule, module.id, root]);

      const patchStyle = useCallback((changes) => {
        patchModule(module.id, (target) => {
          target.noteStyle = Object.assign(noteStyleOf(target), changes);
        });
      }, [patchModule, module.id]);

      const persistView = useCallback((changes) => {
        patchModule(module.id, (target) => {
          target.noteView = Object.assign(noteViewOf(target), changes);
        });
      }, [patchModule, module.id]);

      // Keep the selection pointing at a node that still exists (a delete, an undo).
      useEffect(() => {
        if (!findNote(root, selectedId)) setSelectedId(root.id);
      }, [root, selectedId]);

      // A map that has never been placed is fitted once, on open. After that the camera is
      // whatever the user left behind, because a map is not a page you re-read from the top.
      useEffect(() => {
        if (view0.fitted) return;
        const size = fitFor(layout.box, canvasRef.current);
        setPan(size);
        setReady(true);
        persistView({ x: size.x, y: size.y, zoom: size.zoom, fitted: true });
        return undefined;
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);

      // The wheel has to be a real listener: React's own onWheel is passive, so calling
      // preventDefault there (needed to keep the page from scrolling under us) only warns.
      //
      // The mapping is the one a drawing tool uses: the **wheel zooms** (that is the gesture
      // people reach for when they want to see more or less of a map), and Ctrl/Cmd + wheel
      // moves the canvas sideways/up, which is what a trackpad's two-finger swipe produces
      // naturally. The previous version had these two swapped.
      useEffect(() => {
        const host = canvasRef.current;
        if (!host || typeof host.addEventListener !== 'function') return undefined;
        const onWheel = (event) => {
          event.preventDefault();
          const rect = host.getBoundingClientRect ? host.getBoundingClientRect() : null;
          const cx = event.clientX - ((rect && rect.left) || 0);
          const cy = event.clientY - ((rect && rect.top) || 0);
          setPan((value) => {
            if (event.ctrlKey || event.metaKey) {
              // Pan. deltaX is the horizontal intent when a trackpad sends one; deltaY is the
              // fallback so a plain Ctrl+wheel on a mouse still does something useful.
              return {
                ...value,
                x: value.x - (event.deltaX || 0),
                y: value.y - (event.deltaY || 0),
              };
            }
            const zoom = clamp(value.zoom * (event.deltaY < 0 ? 1.12 : 1 / 1.12), NOTE_ZOOM_MIN, NOTE_ZOOM_MAX);
            const k = zoom / value.zoom;
            // Zoom around the pointer, not the corner: the card under the cursor stays put.
            return { zoom, x: cx - k * (cx - value.x), y: cy - k * (cy - value.y) };
          });
        };
        host.addEventListener('wheel', onWheel, { passive: false });
        return () => host.removeEventListener('wheel', onWheel);
      }, []);

      // Selecting a node and starting to type should not need a mouse trip to the textarea.
      useEffect(() => {
        if (!editingId) return undefined;
        safe(() => {
          const element = editRef.current;
          if (element && element.focus) {
            element.focus();
            if (element.select) element.select();
          }
        });
        return undefined;
      }, [editingId]);

      /** The camera that fits the whole map into the viewport, with a little air around it. */
      function fitFor(box, host) {
        const rect = host && host.getBoundingClientRect ? safe(() => host.getBoundingClientRect(), null) : null;
        const vw = (rect && rect.width) || 900;
        const vh = (rect && rect.height) || 560;
        const zoom = clamp(Math.min((vw - 36) / box.w, (vh - 36) / box.h), NOTE_ZOOM_MIN, 1.3);
        return { zoom, x: (vw - box.w * zoom) / 2, y: (vh - box.h * zoom) / 2 };
      }

      const setZoom = useCallback((factor) => {
        const host = canvasRef.current;
        const rect = host && host.getBoundingClientRect ? safe(() => host.getBoundingClientRect(), null) : null;
        const vw = (rect && rect.width) || 900;
        const vh = (rect && rect.height) || 560;
        const zoom = clamp(pan.zoom * factor, NOTE_ZOOM_MIN, NOTE_ZOOM_MAX);
        const k = zoom / pan.zoom;
        const next = { zoom, x: vw / 2 - k * (vw / 2 - pan.x), y: vh / 2 - k * (vh / 2 - pan.y) };
        setPan(next);
        persistView({ x: next.x, y: next.y, zoom: next.zoom });
      }, [pan, persistView]);

      const fitMap = useCallback(() => {
        const next = fitFor(layout.box, canvasRef.current);
        setPan(next);
        persistView({ x: next.x, y: next.y, zoom: next.zoom });
      }, [layout.box, persistView]);

      const actualSize = useCallback(() => {
        const host = canvasRef.current;
        const rect = host && host.getBoundingClientRect ? safe(() => host.getBoundingClientRect(), null) : null;
        const vw = (rect && rect.width) || 900;
        const vh = (rect && rect.height) || 560;
        const k = 1 / pan.zoom;
        const next = { zoom: 1, x: vw / 2 - k * (vw / 2 - pan.x), y: vh / 2 - k * (vh / 2 - pan.y) };
        setPan(next);
        persistView({ x: next.x, y: next.y, zoom: next.zoom });
      }, [pan, persistView]);

      const startEdit = useCallback((id) => {
        const note = findNote(root, id);
        if (!note) return;
        originalRef.current = note.title || '';
        setSelectedId(id);
        setEditingId(id);
        // One undo entry covers the whole typing session: per-keystroke snapshots would make
        // Ctrl+Z walk back through the sentence letter by letter.
        patchTree(() => {}, true);
      }, [root, patchTree]);

      const commitEdit = useCallback(() => setEditingId(null), []);

      const cancelEdit = useCallback(() => {
        setEditingId(null);
        patchTree((base) => {
          const target = findNote(base, editingId);
          if (target) target.title = originalRef.current;
        }, false);
      }, [editingId, patchTree]);

      const setText = useCallback((id, field, value) => {
        patchTree((base) => {
          const target = findNote(base, id);
          if (target) target[field] = value;
        }, false);
      }, [patchTree]);

      const addChild = useCallback((id) => {
        const node = defaultNoteNode('');
        patchTree((base) => {
          const parent = findNote(base, id) || base;
          if (!Array.isArray(parent.children)) parent.children = [];
          parent.children.push(node);
          parent.collapsed = false;
        }, true);
        setSelectedId(node.id);
        setEditingId(node.id);
        originalRef.current = '';
      }, [patchTree]);

      const addSibling = useCallback((id) => {
        if (id === root.id) return;
        const node = defaultNoteNode('');
        patchTree((base) => {
          const parent = noteParentOf(base, id);
          if (!parent) return;
          const at = parent.children.findIndex((kid) => kid.id === id);
          parent.children.splice(at < 0 ? parent.children.length : at + 1, 0, node);
        }, true);
        setSelectedId(node.id);
        setEditingId(node.id);
        originalRef.current = '';
      }, [patchTree, root.id]);

      const removeNode = useCallback((id) => {
        if (id === root.id) return;
        // The picture blob belongs to the node: deleting a branch must not leave orphans behind.
        const doomed = findNote(root, id);
        if (doomed) walkNotes(doomed, 0, (note) => { if (note.imageKey) mediaRemove(note.imageKey) });
        const parent = noteParentOf(root, id);
        // The splice is written out here rather than routed through the module-level `removeNote`:
        // the two are the same four lines, and doing it locally keeps the delete path independent
        // of a helper declared a few thousand lines away in a different region of the file.
        patchTree((base) => {
          if (!base || !Array.isArray(base.children)) return;
          const at = base.children.findIndex((child) => child.id === id);
          if (at >= 0) base.children.splice(at, 1);
        }, true);
        setEditingId(null);
        setSelectedId(parent ? parent.id : root.id);
      }, [patchTree, root]);

      const setImage = useCallback((id, file) => {
        if (!file || !/^image\//.test(file.type || '')) return;
        const key = 'noteimg-' + newId('x');
        mediaPut(key, file).then((ok) => {
          // A failed write must not leave a dangling key in the tree.
          if (!ok) return;
          const before = findNote(root, id);
          const previous = before && before.imageKey;
          patchTree((base) => {
            const target = findNote(base, id);
            if (!target) return;
            target.imageKey = key;
            target.imageName = file.name || '';
          }, true);
          if (previous) mediaRemove(previous);
        }).catch(() => {});
      }, [patchTree, root]);

      const clearImage = useCallback((id) => {
        const note = findNote(root, id);
        if (note && note.imageKey) mediaRemove(note.imageKey);
        patchTree((base) => {
          const target = findNote(base, id);
          if (target) { target.imageKey = ''; target.imageName = '' }
        }, true);
      }, [patchTree, root]);

      const toggleCollapse = useCallback((id) => {
        patchTree((base) => {
          const target = findNote(base, id);
          if (target) target.collapsed = !(target.collapsed === true);
        }, false);
      }, [patchTree]);

      /** 整理: drop every manual nudge, so the structure is the only thing placing cards again. */
      const tidy = useCallback(() => {
        patchTree((base) => { walkNotes(base, 0, (note) => { note.ox = 0; note.oy = 0 }) }, true);
      }, [patchTree]);

      /**
       * Undo/redo write into the note that is open, and only that note.
       *
       * Replacing the *document list* here would be wrong: the snapshots are single trees, so
       * restoring one into a stack would silently reset which note is open and drop the others.
       */
      const applySnapshot = useCallback((text) => {
        const tree = safe(() => JSON.parse(text), null);
        if (!tree) return;
        setEditingId(null);
        patchModule(module.id, (target) => {
          const stack = noteDocsOf(target);
          const wanted = activeNoteDocId(target, stack);
          const doc = stack.find((item) => item.id === wanted) || stack[0];
          if (!doc) return;
          doc.root = normalizeNoteNode(tree);
          target.noteDocs = stack;
          target.activeNoteId = doc.id;
          target.noteRoot = doc.root;
        });
      }, [patchModule, module.id]);

      /** 新建笔记: append a note and open it. Undoable, because losing your place is not. */
      const createNote = useCallback((name) => {
        const history = historyRef.current;
        history.past.push(JSON.stringify(root));
        if (history.past.length > NOTE_HISTORY) history.past.shift();
        history.future.length = 0;
        setHistVer((value) => value + 1);
        const fresh = makeNoteDoc(name);
        patchModule(module.id, (target) => {
          const stack = noteDocsOf(target);
          stack.push(fresh);
          target.noteDocs = stack;
          target.activeNoteId = fresh.id;
          target.noteRoot = fresh.root;
        });
        setSelectedId(fresh.root.id);
        setEditingId(null);
      }, [patchModule, module.id, root]);

      /** Click a note in the history: remember where the old one was and open the new one. */
      const openNote = useCallback((id) => {
        if (id === activeId) return;
        setSelectedId('');
        setEditingId(null);
        patchModule(module.id, (target) => {
          const stack = noteDocsOf(target);
          const doc = stack.find((item) => item.id === id);
          if (!doc) return;
          target.noteDocs = stack;
          target.activeNoteId = doc.id;
          target.noteRoot = doc.root;
        });
        // A different note is a different picture, so the camera is refitted on the next paint
        // rather than left where the previous note happened to be scrolled.
        setReady(false);
        setPan((value) => Object.assign({}, value, { x: 0, y: 0 }));
      }, [patchModule, module.id, activeId]);

      /** 右键删除. The last note is refused: an empty history has nothing to click. */
      const removeNote = useCallback((id) => {
        if (docs.length <= 1) return false;
        const index = docs.findIndex((doc) => doc.id === id);
        if (index < 0) return false;
        // Land on the neighbour the reader was most likely looking at.
        const next = docs[index + 1] || docs[index - 1] || docs[0];
        patchModule(module.id, (target) => {
          const stack = noteDocsOf(target).filter((doc) => doc.id !== id);
          const landing = stack.find((doc) => doc.id === (next ? next.id : '')) || stack[0];
          target.noteDocs = stack;
          target.activeNoteId = landing ? landing.id : '';
          target.noteRoot = landing ? landing.root : defaultNoteRoot();
        });
        if (id === activeId) {
          setSelectedId('');
          setEditingId(null);
          setReady(false);
        }
        return true;
      }, [patchModule, module.id, docs, activeId]);

      const undo = useCallback(() => {
        const history = historyRef.current;
        if (!history.past.length) return;
        history.future.push(JSON.stringify(root));
        const previous = history.past.pop();
        setHistVer((value) => value + 1);
        applySnapshot(previous);
      }, [root, applySnapshot]);

      const redo = useCallback(() => {
        const history = historyRef.current;
        if (!history.future.length) return;
        history.past.push(JSON.stringify(root));
        const next = history.future.pop();
        setHistVer((value) => value + 1);
        applySnapshot(next);
      }, [root, applySnapshot]);

      /** Move the selection the way the picture reads, not the way the tree is stored. */
      const moveSelection = useCallback((key) => {
        const parent = noteParentOf(root, selectedId);
        const current = findNote(root, selectedId);
        if (key === 'ArrowUp' || key === 'ArrowLeft') {
          if (parent) { setSelectedId(parent.id); return }
          setSelectedId(root.id);
          return;
        }
        const kids = current && !current.collapsed ? noteVisibleChildren(current) : [];
        if (kids.length) { setSelectedId(kids[0].id); return }
        if (!parent || !Array.isArray(parent.children)) return;
        const at = parent.children.findIndex((kid) => kid.id === selectedId);
        const next = parent.children[at + 1];
        if (next) setSelectedId(next.id);
      }, [root, selectedId]);

      const onKeyDown = (event) => {
        const key = event.key || '';
        const meta = event.ctrlKey || event.metaKey;
        if (meta && (key === 'z' || key === 'Z')) {
          event.preventDefault();
          if (event.shiftKey) redo(); else undo();
          return;
        }
        if (meta && (key === 'y' || key === 'Y')) { event.preventDefault(); redo(); return }
        if (meta && (key === '0' || key === '=' || key === '+' || key === '-')) {
          event.preventDefault();
          if (key === '0') actualSize(); else setZoom(key === '-' ? 1 / 1.15 : 1.15);
          return;
        }
        // While a card is being typed into, the textarea owns the keyboard.
        if (editingId) return;
        if (key === 'Tab') { event.preventDefault(); addChild(selectedId); return }
        if (key === 'Enter') { event.preventDefault(); addSibling(selectedId); return }
        if (key === 'F2') { event.preventDefault(); startEdit(selectedId); return }
        if (key === 'Delete' || key === 'Backspace') { event.preventDefault(); removeNode(selectedId); return }
        if (key === 'Escape') { setEditingId(null); setFileOpen(false); return }
        if (key === 'ArrowUp' || key === 'ArrowDown' || key === 'ArrowLeft' || key === 'ArrowRight') {
          event.preventDefault();
          moveSelection(key);
        }
      };

      const onCanvasPointerDown = (event) => {
        setEditingId(null);
        setFileOpen(false);
        setMenu(null);
        gestureRef.current = { kind: 'pan', x: event.clientX, y: event.clientY, vx: pan.x, vy: pan.y };
        safe(() => canvasRef.current.setPointerCapture(event.pointerId));
      };

      const onNodePointerDown = (event, note) => {
        if (editingId === note.id) return;
        if (event.button === 1) return;   // the middle button always pans
        event.stopPropagation();
        setSelectedId(note.id);
        setFileOpen(false);
        // 拖一枝就是拖一整枝：只动自己会让子节点留在原地、连线被拉成长丝。
        const ids = [];
        noteWalkVisible(note, (item) => ids.push(item.id));
        gestureRef.current = { kind: 'node', id: note.id, x: event.clientX, y: event.clientY, ids };
        // 指针捕获必须落在**卡片**上，不能落在画布上。
        //
        // 捕获之后浏览器会把兼容鼠标事件（mousedown / mouseup / click / **dblclick**）一起重定向
        // 到捕获元素 —— 捕获在画布上时，双击永远到不了卡片，「双击改名」于是完全失效，
        // 反而会触发画布自己的「双击空白新建节点」。捕获在卡片上：指针事件（拖动）照样冒泡到画布，
        // 而 click / dblclick 仍然属于卡片。
        safe(() => {
          const host = event.currentTarget;
          if (host && typeof host.setPointerCapture === 'function') host.setPointerCapture(event.pointerId);
        });
      };

      const onPointerMove = (event) => {
        const gesture = gestureRef.current;
        if (!gesture) return;
        const dx = event.clientX - gesture.x;
        const dy = event.clientY - gesture.y;
        if (Math.abs(dx) > 4 || Math.abs(dy) > 4) gesture.moved = true;
        if (gesture.kind === 'pan') {
          setPan((value) => ({ ...value, x: gesture.vx + dx, y: gesture.vy + dy }));
          return;
        }
        if (gesture.kind === 'link') {
          // 拖动 + 时那条虚线跟着指针走（世界坐标，所以缩放平移都不影响）。
          const point = worldPoint(event.clientX, event.clientY);
          setLink((current) => (current ? { from: current.from, x: point.x, y: point.y } : current));
          return;
        }
        setLiveDrag({ ids: gesture.ids, dx: dx / pan.zoom, dy: dy / pan.zoom });
      };

      const onPointerUp = () => {
        const gesture = gestureRef.current;
        gestureRef.current = null;
        if (!gesture) return;
        if (gesture.kind === 'pan') {
          if (Math.abs(pan.x - gesture.vx) > 0.5 || Math.abs(pan.y - gesture.vy) > 0.5) {
            persistView({ x: pan.x, y: pan.y, zoom: pan.zoom });
          }
          return;
        }
        if (gesture.kind === 'link') {
          const point = link ? { x: link.x, y: link.y } : null;
          setLink(null);
          // 没拖动就是"点了一下 +"：还是老行为，直接加一个子节点并开始改名。
          if (!gesture.moved) { addChild(gesture.id); return }
          if (!point) return;
          const hit = cardAt(point);
          // 落在别的卡片上 → 成为那张卡片的子节点（相当于把线接到那个输入口）；
          // 落在空白处 → 就在落点长一个子节点；落在自己身上按空白处理。
          if (hit && hit !== gesture.id) createNodeAt(hit, null, '');
          else createNodeAt(gesture.id, point, '');
          return;
        }
        const live = liveDrag;
        setLiveDrag(null);
        if (!live || (Math.abs(live.dx) < 0.5 && Math.abs(live.dy) < 0.5)) return;
        // The nudge is written once, on release — a drag must not write to storage per frame.
        patchTree((base) => {
          walkNotes(base, 0, (target) => {
            if (live.ids.indexOf(target.id) < 0) return;
            target.ox = clamp((Number(target.ox) || 0) + live.dx, -6000, 6000);
            target.oy = clamp((Number(target.oy) || 0) + live.dy, -6000, 6000);
          });
        }, true);
      };

      const onDrop = (event, nodeId) => {
        const list = event.dataTransfer && event.dataTransfer.files ? event.dataTransfer.files : [];
        const files = [];
        for (let index = 0; index < (list.length || 0); index += 1) files.push(list[index]);
        const image = files.filter((file) => /^image\//.test((file && file.type) || ''))[0];
        setHot('');
        if (nodeId) {
          if (image) { event.preventDefault(); setImage(nodeId, image) }
          return;
        }
        // Dropping a picture on the background is a request for a new picture node.
        if (!image) return;
        event.preventDefault();
        const node = defaultNoteNode(image.name || '');
        patchTree((base) => { base.children.push(node) }, true);
        setSelectedId(node.id);
        setImage(node.id, image);
      };

      const onPaste = (event) => {
        const items = event.clipboardData && event.clipboardData.items ? event.clipboardData.items : [];
        for (let index = 0; index < (items.length || 0); index += 1) {
          const item = items[index];
          if (!item || item.kind !== 'file' || !/^image\//.test(item.type || '')) continue;
          const file = item.getAsFile ? item.getAsFile() : null;
          if (file) { event.preventDefault(); setImage(selectedId, file); return }
        }
      };

      const pickFile = (event) => {
        const file = event.target.files && event.target.files[0];
        safe(() => { event.target.value = '' });
        if (file) setImage(selectedId, file);
      };

      //#region 文件: 保存 / 打开 / 导出

      /** 一条会自己消失的状态 —— 放在底部提示条上，不弹窗。 */
      const say = useCallback((text) => {
        setFileStatus(text);
        safe(() => {
          if (statusRef.current) window.clearTimeout(statusRef.current);
          statusRef.current = window.setTimeout(() => setFileStatus(''), 4200);
        });
      }, []);

      const save = useCallback((filename, blob) => {
        const done = downloadBlob(filename, blob);
        return done;
      }, []);

      /** 把整张图上的图片读成 data URL —— 只有原生 JSON 需要（其余格式只带结构 + 文字）。 */
      const collectImages = useCallback(async () => {
        const keys = [];
        walkNotes(root, 0, (note) => { if (note.imageKey && keys.indexOf(note.imageKey) < 0) keys.push(note.imageKey) });
        const images = {};
        for (const key of keys) {
          const blob = await mediaGet(key).catch(() => undefined);
          if (!blob) continue;
          const dataUrl = await noteBlobToDataUrl(blob);
          if (dataUrl) images[key] = dataUrl;
        }
        return { images, total: keys.length, missing: keys.length - Object.keys(images).length };
      }, [root]);

      const exportAs = useCallback((format) => {
        setFileOpen(false);
        const title = module.name || t.kindNotebook;
        if (format === 'native') {
          collectImages().then(({ images, missing }) => {
            const text = noteToNativeText({
              format: 'dsh-workbench-notes', version: 1, tool: 'DSH 工作台 · 框架笔记',
              title, savedAt: new Date().toISOString(),
              style, tree: root, images,
            });
            save(noteFileName(title, '.json'), new Blob([text], { type: 'application/json' }));
            say(missing ? t.noteSavedJsonMissing.replace('{n}', String(missing)) : t.noteSavedJson);
          });
          return;
        }
        if (format === 'xmind') {
          // XMind 的容器就是一个 zip：content.json + metadata.json + manifest.json。
          const blob = zipStore([
            { name: 'content.json', data: noteToXmindContent(root, title, style.layout) },
            { name: 'metadata.json', data: noteXmindMetadata() },
            { name: 'manifest.json', data: noteXmindManifest() },
          ], 'application/x-xmind');
          save(noteFileName(title, '.xmind'), blob);
          say(t.noteSavedXmind);
          return;
        }
        if (format === 'mm') {
          save(noteFileName(title, '.mm'), new Blob([noteToFreeMind(root, style.layout)], { type: 'text/xml' }));
          say(t.noteSavedMm);
          return;
        }
        if (format === 'opml') {
          save(noteFileName(title, '.opml'), new Blob([noteToOpml(root, title)], { type: 'text/xml' }));
          say(t.noteSavedOpml);
          return;
        }
        if (format === 'md') {
          save(noteFileName(title, '.md'), new Blob([noteToMarkdown(root)], { type: 'text/markdown' }));
          say(t.noteSavedMd);
        }
      }, [collectImages, module.name, root, save, say, style, t]);

      /**
       * 读本地文件：树被替换，但**先进历史** —— 导入之后一个 Ctrl+Z 就能把原来那张图拿回来。
       * 图片按新 key 写回 IndexedDB（旧的 key 只对导出它的那台机器有意义）。
       */
      const onImportFile = useCallback((event) => {
        const file = event.target.files && event.target.files[0];
        safe(() => { event.target.value = '' });
        if (!file) return;
        const handle = (text) => {
          const parsed = noteParseFile(file.name, text);
          if (!parsed.ok) { say(t[parsed.error] || t.noteFileBadType); return }
          const incoming = noteTreeOf({ noteRoot: parsed.tree });
          const remap = [];
          const rekey = (node) => {
            if (node.imageKey) {
              const to = 'noteimg-' + newId('x');
              remap.push({ from: node.imageKey, to });
              node.imageKey = to;
            }
            for (const kid of node.children) rekey(kid);
          };
          rekey(incoming);
          const count = noteTotals(incoming).nodes;
          patchTree((base) => {
            base.title = incoming.title;
            base.body = incoming.body;
            base.imageKey = incoming.imageKey;
            base.imageName = incoming.imageName;
            base.imageFit = incoming.imageFit;
            base.imageHeight = incoming.imageHeight;
            base.color = incoming.color;
            base.shape = incoming.shape;
            base.collapsed = false;
            base.ox = 0;
            base.oy = 0;
            base.children = incoming.children;
          }, true);
          if (parsed.style) patchStyle(noteStyleOf({ noteStyle: parsed.style }));
          setEditingId(null);
          setSelectedId(root.id);
          const restore = async () => {
            let restored = 0;
            for (const pair of remap) {
              const blob = noteDataUrlToBlob(parsed.images && parsed.images[pair.from]);
              if (!blob) continue;
              const ok = await mediaPut(pair.to, blob).catch(() => false);
              if (ok) restored += 1;
            }
            say(t.noteImported.replace('{n}', String(count)).replace('{i}', String(restored)));
          };
          restore();
        };
        if (typeof file.text === 'function') {
          file.text().then(handle).catch(() => say(t.noteFileBadRead));
          return;
        }
        const reader = safe(() => new window.FileReader(), null);
        if (!reader) { say(t.noteFileBadRead); return }
        reader.onload = () => handle(String(reader.result || ''));
        reader.onerror = () => say(t.noteFileBadRead);
        safe(() => reader.readAsText(file));
      }, [patchStyle, patchTree, root.id, say, t]);

      const exportItems = [
        ['xmind', t.noteExportXmind, t.noteExportXmindHint],
        ['mm', t.noteExportMm, t.noteExportMmHint],
        ['opml', t.noteExportOpml, t.noteExportOpmlHint],
        ['md', t.noteExportMd, t.noteExportMdHint],
        ['native', t.noteExportJson, t.noteExportJsonHint],
      ];

      //#endregion

      //#region 新建 / 右键菜单 / Blender 式连线拖拽

      /** 屏幕坐标 → 画布世界坐标。右键落点和拖拽落点都靠它。 */
      const worldPoint = useCallback((clientX, clientY) => {
        const host = canvasRef.current;
        const rect = host && host.getBoundingClientRect ? safe(() => host.getBoundingClientRect(), null) : null;
        return {
          x: ((clientX - (rect ? rect.left : 0)) - pan.x) / pan.zoom,
          y: ((clientY - (rect ? rect.top : 0)) - pan.y) / pan.zoom,
        };
      }, [pan]);

      /** 在世界坐标 point 处落在哪张卡片上（用布局矩形判定）。 */
      const cardAt = useCallback((point) => {
        for (const id of layout.order) {
          const rect = rectOf(id);
          if (rect && point.x >= rect.x && point.x <= rect.x + rect.w
            && point.y >= rect.y && point.y <= rect.y + rect.h) return id;
        }
        return null;
      }, [layout.order, rectOf]);

      /**
       * 在给定世界坐标处新建一个节点。
       *
       * 布局是纯函数，所以可以先把改过的树算一遍、拿到新节点**会被放在哪**，再把
       * 「落点 − 布局位置」记成 ox / oy —— 于是它长在你右键 / 松手的地方，而不是布局给它的位置。
       */
      const createNodeAt = useCallback((parentId, at) => {
        const node = defaultNoteNode('');
        patchTree((base) => {
          const parent = findNote(base, parentId) || base;
          if (!Array.isArray(parent.children)) parent.children = [];
          parent.children.push(node);
          parent.collapsed = false;
          if (at) {
            const placed = noteLayoutFor(style.layout, base).byId[node.id];
            if (placed) {
              node.ox = clamp(at.x - placed.x, -6000, 6000);
              node.oy = clamp(at.y - placed.y, -6000, 6000);
            }
          }
        }, true);
        markNoteStarted();
        setMenu(null);
        setSelectedId(node.id);
        setEditingId(node.id);
        originalRef.current = '';
      }, [patchModule, module.id, patchTree, style.layout]);

      /** 空画布上的第一个节点：就是那个空的中心节点，直接开始编辑。 */
      const startRoot = useCallback(() => {
        markNoteStarted();
        setMenu(null);
        setSelectedId(root.id);
        originalRef.current = root.title || '';
        setEditingId(root.id);
        patchTree(() => {}, true);
      }, [patchModule, module.id, patchTree, root]);

      /** 新建一张图：中心节点用输入的名字，其余清空。进历史，所以 Ctrl+Z 能撤回。 */
      const createMap = useCallback(() => {
        const name = newName.trim();
        patchTree((base) => {
          base.title = name;
          base.body = '';
          base.imageKey = '';
          base.imageName = '';
          base.color = '';
          base.shape = '';
          base.collapsed = false;
          base.ox = 0;
          base.oy = 0;
          base.children = [];
        }, true);
        markNoteStarted();
        setNewOpen(false);
        setNewName('');
        setEditingId(null);
        setSelectedId(root.id);
        setMenu(null);
        say(name ? t.noteNewDone.replace('{name}', name) : t.noteNewDoneEmpty);
      }, [newName, patchModule, module.id, patchTree, root.id, say, t]);

      const openMenu = (event, kind, id) => {
        event.preventDefault();
        event.stopPropagation();
        const host = canvasRef.current;
        const rect = host && host.getBoundingClientRect ? safe(() => host.getBoundingClientRect(), null) : null;
        const x = event.clientX - (rect ? rect.left : 0);
        const y = event.clientY - (rect ? rect.top : 0);
        const width = rect ? rect.width : 520;
        const height = rect ? rect.height : 380;
        setEditingId(null);
        setFileOpen(false);
        setSelectedId(id);
        setMenu({
          kind, id, world: worldPoint(event.clientX, event.clientY),
          x: clamp(x, 8, Math.max(8, width - 206)),
          y: clamp(y, 8, Math.max(8, height - 236)),
        });
      };

      /** 从 + 上按下：Blender 式的连线拖拽（松手处决定新节点落在哪、连给谁）。 */
      const onLinkDown = (event, note) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        const point = worldPoint(event.clientX, event.clientY);
        gestureRef.current = { kind: 'link', id: note.id, x: event.clientX, y: event.clientY, moved: false };
        setLink({ from: note.id, x: point.x, y: point.y });
        setSelectedId(note.id);
        setMenu(null);
        // 捕获落在 + 上：指针事件照旧冒泡到画布（拖拽继续），而 click/dblclick 不会跑到画布上去。
        safe(() => {
          const host = event.currentTarget;
          if (host && typeof host.setPointerCapture === 'function') host.setPointerCapture(event.pointerId);
        });
      };

      //#endregion

      /** 右键菜单里的一项：图标 + 文字 + 快捷键提示。 */
      const menuItem = (id, icon, label, onClick, hint, tone) => h('button', {
        key: id, type: 'button', className: 'wsb-noteMenuItem', 'data-note-menu-item': id,
        'data-tone': tone || undefined, onClick,
      },
        h('i', null, icon),
        h('span', null, label),
        hint ? h('kbd', null, hint) : null);

      const layoutButton = (id, label) => h('button', {
        key: id, type: 'button', className: 'wsb-segBtn', 'data-note-layout': id,
        'data-on': style.layout === id ? 'true' : 'false', title: label,
        onClick: () => patchStyle({ layout: id }),
      }, label);

      const branchButton = (id, label) => h('button', {
        key: id, type: 'button', className: 'wsb-segBtn', 'data-note-branch': id,
        'data-on': style.branch === id ? 'true' : 'false', title: label,
        onClick: () => patchStyle({ branch: id }),
      }, label);

      const themeButton = (id) => {
        const entry = NOTE_THEMES[id];
        return h('button', {
          key: id, type: 'button', className: 'wsb-noteSwatch', 'data-note-theme': id,
          'data-on': style.theme === id ? 'true' : 'false', title: t[entry.label],
          style: { background: 'linear-gradient(135deg,' + entry.accent.slice(0, 3).join(',') + ')' },
          onClick: () => patchStyle({ theme: id }),
        });
      };

      const shapeButton = (id, label) => h('button', {
        key: id, type: 'button', className: 'wsb-btn', 'data-note-shape': id,
        'data-on': selected.shape === id ? 'true' : 'false',
        onClick: () => patchTree((base) => {
          const target = findNote(base, selectedId);
          if (target) target.shape = target.shape === id ? '' : id;
        }, false),
      }, label);

      return h('div', {
        className: 'wsb-screen', 'data-role': 'notes', 'data-anim': anim, style: screenStyle,
        'data-note-layout-now': style.layout, 'data-note-theme-now': style.theme,
        onAnimationEnd: (event) => { if (event.target === event.currentTarget) onAnimEnd() },
      },
        h('div', {
          className: 'wsb-root wsb-noteRoot',
          tabIndex: 0,
          onKeyDown,
          // Paste lands on whatever has focus, which is this shell — not the canvas inside it.
          onPaste,
          // 只留强调色的前景：表面全部交给宿主 token（见 NOTE_THEMES 的注释）。
          style: { '--note-root-fg': theme.rootFg },
        },
          // 和桌面 / 控制台 / 每日新闻同一层背景：这一屏也不画自己的底，让桌面流光从毛玻璃下面
          // 透上来。用的是控制台那一层（同一个类名、同一套 CSS），所以「跟随桌面」开关一起管到它。
          appearance && appearance.consoleAurora === false
            ? null
            : h('div', { className: 'wsb-consoleAurora', 'aria-hidden': 'true', 'data-note-aurora': '1' }, h(AuroraBlobs, null)),
          h('div', { className: 'wsb-head wsb-noteTop' },
            h('div', { className: 'wsb-noteTopRow' },
              h('button', {
                type: 'button', className: 'wsb-backBtn', 'data-note-back': '1',
                title: t.panel, 'aria-label': t.panel, onClick: onBack,
              }, h('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' }, h('path', { d: 'M14.5 6 8.5 12l6 6' }))),
              h('div', { className: 'wsb-title', style: { flex: '1 1 auto', minWidth: '0' } },
                h('b', null, module.name),),
              h('div', { className: 'wsb-noteTopSpacer' }),
              h('button', {
                type: 'button', className: 'wsb-btn', 'data-note-outline': '1',
                'data-on': outline ? 'true' : 'false', title: t.noteOutline,
                onClick: () => { const next = !outline; setOutline(next); persistView({ outline: next }) },
              }, t.noteOutline),
              h('button', {
                type: 'button', className: 'wsb-btn', 'data-note-inspector': '1',
                'data-on': inspector ? 'true' : 'false', title: t.noteInspector,
                onClick: () => { const next = !inspector; setInspector(next); persistView({ inspector: next }) },
              }, t.noteInspector)),
            h('div', { className: 'wsb-noteTopRow' },
              // 工具带整条靠左。原来这一组带 `marginLeft:'auto'`，把结构/连线/配色/文件/撤销/
              // 整理/适应画布一起推到最右边、只留标签在左端，看起来像两截。
              h('div', { className: 'wsb-noteGroup' },
                h('b', null, t.noteLayout),
                h('div', { className: 'wsb-seg', 'data-note-layouts': '1' },
                  NOTE_LAYOUTS.map((id) => layoutButton(id, t['noteLay' + id.charAt(0).toUpperCase() + id.slice(1)])))),
              h('div', { className: 'wsb-noteGroup' },
                h('b', null, t.noteBranch),
                h('div', { className: 'wsb-seg', 'data-note-branches': '1' },
                  NOTE_BRANCHES.map((id) => branchButton(id, t['noteBranch' + id.charAt(0).toUpperCase() + id.slice(1)])))),
              h('div', { className: 'wsb-noteGroup' },
                h('b', null, t.noteTheme),
                h('div', { className: 'wsb-noteSwatches', 'data-note-themes': '1' },
                  Object.keys(NOTE_THEMES).map(themeButton))),
              h('div', { className: 'wsb-noteGroup wsb-noteFileGroup' },
                // 一个「文件」按钮承载全部文件动作：新建 / 保存 / 打开 / 导出。
                // 之前这四个是并排的四个按钮，外加一个独立的导出下拉 —— 顶栏被撑得很长，而
                // 它们本来就是同一类动作（都是"对整张图做的事"），合成一个入口更清楚。
                h('button', {
                  type: 'button', className: 'wsb-btn wsb-noteFileBtn',
                  'data-note-file': '1', 'data-on': fileOpen ? 'true' : 'false',
                  title: t.noteFile, onClick: () => setFileOpen((open) => !open),
                }, t.noteFile + ' ▾'),
                fileOpen
                  ? h('div', {
                    className: 'wsb-noteExportMenu wsb-noteFileMenu', 'data-note-file-menu': '1',
                    // 层级写在内联样式上，而不是只靠 CSS：这一条被样式表里更靠后的规则盖过一次
                    // （实测 .wsb-noteTop 的 z-index 计算出来是 1 而不是写的 3），菜单于是被画布
                    // 盖住。内联样式的优先级最高，"菜单浮在最上层"这件事就不该再依赖层叠顺序。
                    style: { zIndex: 20 },
                  },
                    h('button', {
                      type: 'button', className: 'wsb-noteExportItem', 'data-note-newmap': '1',
                      // 新建 = **加一篇新笔记**，不是清空当前这篇。旧版本这里调 createMap，它会
                      // 把当前那张图清空重来 —— 那在单图时代说得通，现在模块下可以有很多篇，
                      // 「新建」这个词只能指向"多一篇"。
                      onClick: () => { setFileOpen(false); createNote('') },
                    },
                      h('b', null, t.noteNew),
                      h('span', null, t.noteNewHint)),
                    h('button', {
                      type: 'button', className: 'wsb-noteExportItem', 'data-note-save': '1',
                      onClick: () => { setFileOpen(false); exportAs('native') },
                    },
                      h('b', null, t.noteSave),
                      h('span', null, t.noteSaveHint)),
                    h('button', {
                      type: 'button', className: 'wsb-noteExportItem', 'data-note-open': '1',
                      onClick: () => { setFileOpen(false); safe(() => importRef.current && importRef.current.click()) },
                    },
                      h('b', null, t.noteOpen),
                      h('span', null, t.noteOpenHint)),
                    h('div', { className: 'wsb-noteMenuSep' }),
                    exportItems.map(([id, label, hint]) => h('button', {
                      key: id, type: 'button', className: 'wsb-noteExportItem',
                      'data-note-export-format': id, onClick: () => { setFileOpen(false); exportAs(id) },
                    },
                      h('b', null, label),
                      h('span', null, hint))))
                  : null,
                // 点别处关掉菜单。菜单本身把它盖住，所以这条不会拦住菜单里的点击。
                fileOpen
                  ? h('div', { className: 'wsb-noteMenuMask', 'data-note-file-mask': '1', onClick: () => setFileOpen(false) })
                  : null),
              // 撤销 / 重做 / 整理。这三个原本和标题挤在第一行右侧（那一行只有它们三个是"对整张图
              // 的操作"），现在跟着「文件」一起放在第二行的工具带里 —— 第一行只留导航（返回 + 标题）
              // 与两个面板开关，工具类动作都在下面这一行。
              h('div', { className: 'wsb-noteGroup' },
                h('button', {
                  type: 'button', className: 'wsb-btn', 'data-note-undo': '1',
                  title: t.noteUndo, disabled: !historyRef.current.past.length, onClick: undo,
                }, '↶ ' + t.noteUndo),
                h('button', {
                  type: 'button', className: 'wsb-btn', 'data-note-redo': '1',
                  title: t.noteRedo, disabled: !historyRef.current.future.length, onClick: redo,
                }, '↷ ' + t.noteRedo),
                h('button', {
                  type: 'button', className: 'wsb-btn', 'data-note-tidy': '1',
                  title: t.noteTidyHint, onClick: tidy,
                }, t.noteTidy),
                // 适应画布并入这条工具带，紧跟「整理」。它原来和最右边那组
                // − / 百分比 / + / 1:1 放在一起 —— 那四个是「精确控制缩放」，而适应画布是
                // 「把整张图收进视野」，属于对图的整体操作，和撤销 / 整理是同一类。
                h('button', {
                  type: 'button', className: 'wsb-btn', 'data-note-fit': '1',
                  title: t.noteFit, onClick: fitMap,
                }, t.noteFit)))),
          h('div', {
            className: 'wsb-noteStage',
            'data-note-outline-on': outline ? 'true' : 'false',
            'data-note-inspector-on': inspector ? 'true' : 'false',
          },
            outline
              ? h(NoteHistory, {
                t, docs, activeId, onOpen: openNote, onDelete: removeNote,
              })
              : null,
            h('div', { className: 'wsb-noteCanvasWrap' },
              h('div', {
                // 画布和两侧的侧栏是**同一块板子**：同一个 .wsb-glass，同一套材质与描边。
                ref: canvasRef, className: 'wsb-glass wsb-noteCanvas', 'data-note-canvas': '1',
                'data-linking': link ? 'true' : 'false',
                onPointerDown: onCanvasPointerDown,
                onPointerMove,
                onPointerUp,
                onPointerLeave: onPointerUp,
                onDoubleClick: (event) => { if (event.target === event.currentTarget) addChild(root.id) },
                onContextMenu: (event) => openMenu(event, 'canvas', root.id),
                onDragOver: (event) => { event.preventDefault() },
                onDrop: (event) => onDrop(event, ''),
              },
                // 更黑的底 + 点阵网格（网格跟着缩放/平移走）。
                h('div', {
                  className: 'wsb-noteScrim', 'data-note-scrim': '1',
                  style: {
                    backgroundSize: (24 * pan.zoom) + 'px ' + (24 * pan.zoom) + 'px',
                    backgroundPosition: pan.x + 'px ' + pan.y + 'px',
                  },
                }),
                // 空画布：还没有中心节点，说明下一步怎么开始。
                blank
                  ? h('div', { className: 'wsb-noteEmptyState', 'data-note-blank': '1' },
                    h('b', null, t.noteBlank),
                    h('span', null, t.noteBlankHint))
                  : null,
                h('div', {
                  className: 'wsb-noteWorld', 'data-note-world': '1', 'data-note-ready': ready ? 'true' : 'false',
                  style: {
                    transform: 'translate(' + pan.x + 'px,' + pan.y + 'px) scale(' + pan.zoom + ')',
                    width: layout.box.w + 'px', height: layout.box.h + 'px',
                    opacity: ready ? 1 : 0,
                  },
                },
                  h('svg', {
                    className: 'wsb-noteWires', 'data-note-wires': '1',
                    width: layout.box.w, height: layout.box.h,
                    style: { width: layout.box.w + 'px', height: layout.box.h + 'px' },
                  },
                    layout.guides.map((guide, index) => h('line', {
                      key: 'guide' + index, className: 'wsb-noteGuide', 'data-note-guide': guide.kind,
                      x1: guide.x1, y1: guide.y1, x2: guide.x2, y2: guide.y2,
                    })),
                    layout.edges.map((edge) => {
                      if (edge.kind === 'none') return null;
                      // 时间轴 / 鱼骨图 的 sub-note 连线**不画**。这两种结构的层与层之间的距离是
                      // 刻意压紧的（子节点就贴在自己那根轴/骨旁边），再补一条从父卡片中心出发的
                      // 长曲线，只会横穿整张图 —— 那正是「线跑到节点里去了」的来源。它们的层级由
                      // 自己的轴 / 骨（guides）表达，这是刻意的、也是这两种图该有的样子。
                      if (edge.kind === 'stack') return null;
                      // 两端都过 rectOf：拖动中的那一枝连线跟着一起动，不会脱开卡片。
                      return h('path', {
                        key: edge.from + '>' + edge.to, className: 'wsb-noteWire',
                        'data-note-wire': edge.from + '>' + edge.to,
                        d: noteWireD(rectOf(edge.from), rectOf(edge.to), edge, branch),
                      });
                    }),
                    // 拖动 + 时那条虚线：从卡片边缘指向指针（Blender 里就是那根跟着鼠标的线）。
                    link
                      ? h('path', {
                        className: 'wsb-noteWire wsb-noteWireLink',
                        'data-note-link': link.from,
                        d: noteWireD(rectOf(link.from), { x: link.x, y: link.y, w: 0, h: 0 },
                          { kind: 'h', side: 'r' }, 'line'),
                      })
                      : null),
                  layout.order.map((id) => {
                    const note = findNote(root, id);
                    // Same source as the wires: one function decides where a node is.
                    const at = rectOf(id);
                    if (!note || !at) return null;
                    // 空画布：中心节点还没开始，先不画它（提示语占着中间那块）。
                    if (blank && id === root.id) return null;
                    const depth = at.depth;
                    const shape = note.shape || 'round';
                    const editing = editingId === id;
                    const kids = Array.isArray(note.children) ? note.children.length : 0;
                    const url = note.imageKey ? urls[note.imageKey] : '';
                    return h('div', {
                      key: id, className: 'wsb-noteCard', 'data-note-card': id,
                      'data-depth': String(depth), 'data-shape': shape,
                      'data-sel': selectedId === id ? 'true' : 'false',
                      'data-hot': hot === id ? 'true' : 'false',
                      style: {
                        left: at.x + 'px',
                        top: at.y + 'px',
                        width: at.w + 'px',
                        height: at.h + 'px',
                        '--note-accent': noteAccentOf(theme, note, depth),
                      },
                      onPointerDown: (event) => onNodePointerDown(event, note),
                      onDoubleClick: (event) => { event.stopPropagation(); startEdit(id) },
                      // 右键节点 → 「新建子节点 / 新建同级 / 重命名 / 插入图片 / 折叠 / 删除」。
                      onContextMenu: (event) => openMenu(event, 'node', id),
                      onDragOver: (event) => { event.preventDefault(); if (hot !== id) setHot(id) },
                      onDragLeave: () => setHot(''),
                      onDrop: (event) => onDrop(event, id),
                    },
                      url
                        ? h('img', {
                          className: 'wsb-noteCardImg', 'data-note-image-img': id, src: url,
                          alt: note.imageName || '', draggable: false,
                          style: {
                            height: Math.max(32, Math.min(Number(note.imageHeight) || 96, at.h - 22)) + 'px',
                            objectFit: note.imageFit === 'contain' ? 'contain' : 'cover',
                          },
                        })
                        : null,
                      editing
                        ? h('textarea', {
                          ref: editRef, className: 'wsb-noteEdit', 'data-note-edit': id,
                          value: note.title || '', placeholder: t.noteTitle,
                          onChange: (event) => setText(id, 'title', event.target.value),
                          onKeyDown: (event) => {
                            if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); commitEdit() }
                            else if (event.key === 'Escape') { event.preventDefault(); cancelEdit() }
                          },
                          onBlur: commitEdit,
                        })
                        : h('div', { className: 'wsb-noteCardTitle', 'data-note-card-title': id },
                          note.title || (depth === 0 ? t.noteCenterTopic : t.noteNode)),
                      !editing && note.body
                        ? h('div', { className: 'wsb-noteCardBody', 'data-note-card-body': id }, note.body)
                        : null,
                      kids && note.collapsed
                        ? h('span', { className: 'wsb-noteCardBadge', 'data-note-card-badge': id }, '+' + kids)
                        : null,
                      h('button', {
                        type: 'button', className: 'wsb-noteCardAdd', title: t.noteLinkHint,
                        'data-note-card-add': id,
                        // 点一下 = 加一个子节点并开始改名；拖出去 = Blender 式的连线（松手处决定连给谁/长在哪）。
                        onPointerDown: (event) => onLinkDown(event, note),
                        onDoubleClick: (event) => event.stopPropagation(),
                      }, '+'));
                  })),
                h('div', { className: 'wsb-noteHint', 'data-note-hint': '1' },
                  h('span', { className: 'wsb-noteLevel', 'data-note-level': String(selectedAt ? selectedAt.depth : 0) },
                    t.noteLevel.replace('{n}', String((selectedAt ? selectedAt.depth : 0) + 1))),
                  fileStatus
                    ? h('span', { className: 'wsb-noteStatus', 'data-note-file-status': '1' }, fileStatus)
                    : h('span', null, blank ? t.noteBlankHint : t.noteKeyHint)))),
            // 右键菜单与「新建图表」都挂在画布这一格里，这样坐标就是画布坐标。
            menu
              ? h('div', {
                className: 'wsb-noteMenu', 'data-note-menu': menu.kind,
                style: { left: menu.x + 'px', top: menu.y + 'px' },
              },
                (menu.kind === 'canvas'
                  ? [
                    blank
                      ? menuItem('root', '◉', t.noteMenuNewRoot, () => startRoot(), '⏎')
                      : menuItem('child', '＋', t.noteMenuNewChild, () => createNodeAt(root.id, menu.world), 'Tab'),
                    menuItem('new', '✦', t.noteNew, () => { setMenu(null); setNewName(blank ? '' : root.title); setNewOpen(true) }),
                    h('div', { key: 'sep1', className: 'wsb-noteMenuSep' }),
                    menuItem('fit', '⤢', t.noteMenuFit, () => { setMenu(null); fitMap() }),
                    menuItem('tidy', '⌗', t.noteMenuTidy, () => { setMenu(null); tidy() }),
                  ]
                  : [
                    menuItem('child', '＋', t.noteMenuNewChild, () => createNodeAt(menu.id, null), 'Tab'),
                    menu.id === root.id ? null
                      : menuItem('sibling', '↳', t.noteMenuNewSibling, () => { setMenu(null); addSibling(menu.id) }, '⏎'),
                    menuItem('rename', '✎', t.noteMenuRename, () => { setMenu(null); startEdit(menu.id) }, 'F2'),
                    menuItem('image', '▣', t.noteInsertImage, () => {
                      setMenu(null);
                      setSelectedId(menu.id);
                      safe(() => fileRef.current && fileRef.current.click());
                    }),
                    menuItem('collapse', '▾', (findNote(root, menu.id) || {}).collapsed ? t.noteExpand : t.noteCollapse,
                      () => { setMenu(null); toggleCollapse(menu.id) }),
                    h('div', { key: 'sep2', className: 'wsb-noteMenuSep' }),
                    menu.id === root.id ? null
                      : menuItem('delete', '⌫', t.noteDelete, () => { setMenu(null); removeNode(menu.id) }, 'Del', 'danger'),
                  ]).filter(Boolean))
              : null,
            newOpen
              ? h('div', { className: 'wsb-noteNewBox', 'data-note-new-box': '1' },
                h('b', null, t.noteNewTitle),
                h('p', null, t.noteNewHint),
                h('input', {
                  className: 'wsb-input', 'data-note-new-name': '1', value: newName,
                  placeholder: t.noteNewPlaceholder,
                  onChange: (event) => setNewName(event.target.value),
                  onKeyDown: (event) => {
                    if (event.key === 'Enter') { event.preventDefault(); createMap() }
                    else if (event.key === 'Escape') { event.preventDefault(); setNewOpen(false) }
                  },
                }),
                h('div', { className: 'wsb-noteNewRow' },
                  h('button', {
                    type: 'button', className: 'wsb-btn', 'data-note-new-cancel': '1',
                    onClick: () => setNewOpen(false),
                  }, t.noteNewCancel),
                  h('button', {
                    type: 'button', className: 'wsb-btn', 'data-note-new-create': '1', onClick: createMap,
                  }, t.noteNewCreate)))
              : null,
            // The inspector is a grid cell of `.wsb-noteStage`, so it has to be a sibling of the
            // canvas wrap — not a child of it, which would break the three-column layout.
            inspector
              ? h('div', { className: 'wsb-glass wsb-noteRail wsb-noteInspector' },
                h(PaneHead, { title: t.noteInspector, sub: selectedId === root.id ? t.noteRoot : t.noteNode }),
                h('div', { className: 'wsb-body' },
                  h('label', { className: 'wsb-noteField2' }, h('b', null, t.noteTitle),
                    h('textarea', {
                      className: 'wsb-input wsb-noteInput', 'data-note-title-input': selectedId,
                      value: selected.title || '', placeholder: t.noteTitle,
                      onFocus: () => patchTree(() => {}, true),
                      onChange: (event) => setText(selectedId, 'title', event.target.value),
                    })),
                  h('label', { className: 'wsb-noteField2' }, h('b', null, t.noteBody),
                    h('textarea', {
                      className: 'wsb-input wsb-noteInput wsb-noteInputBody', 'data-note-body-input': selectedId,
                      value: selected.body || '', placeholder: t.noteBodyHint,
                      onFocus: () => patchTree(() => {}, true),
                      onChange: (event) => setText(selectedId, 'body', event.target.value),
                    })),
                  h('div', { className: 'wsb-noteSect' },
                    h('b', null, t.noteImage),
                    selected.imageKey
                      ? h('div', { className: 'wsb-noteImgRow' },
                        h('span', { className: 'wsb-noteImgName', 'data-note-image-name': selectedId }, selected.imageName || t.noteImage),
                        h('button', { type: 'button', className: 'wsb-btn', 'data-tone': 'danger', 'data-note-image-clear': '1', onClick: () => clearImage(selectedId) }, t.noteImageClear))
                      : h('div', { className: 'wsb-noteImgRow' }, h('span', { className: 'wsb-noteImgName' }, t.noteNoImage)),
                    h('div', { className: 'wsb-noteBtnRow' },
                      h('button', {
                        type: 'button', className: 'wsb-btn', 'data-note-image': '1', title: t.noteInsertImage,
                        onClick: () => safe(() => fileRef.current && fileRef.current.click()),
                      }, t.noteInsertImage),
                      selected.imageKey
                        ? h('button', {
                          type: 'button', className: 'wsb-btn', 'data-note-image-fit': selected.imageFit,
                          title: t.noteImageFit,
                          onClick: () => patchTree((base) => {
                            const target = findNote(base, selectedId);
                            if (target) target.imageFit = target.imageFit === 'contain' ? 'cover' : 'contain';
                          }, false),
                        }, selected.imageFit === 'contain' ? t.noteFitContain : t.noteFitCover)
                        : null),
                    selected.imageKey
                      ? h('label', { className: 'wsb-noteField2' }, h('b', null, t.noteImageSize),
                        h('input', {
                          type: 'range', min: 56, max: 240, step: 4, value: selected.imageHeight,
                          'data-note-image-height': '1',
                          onChange: (event) => patchTree((base) => {
                            const target = findNote(base, selectedId);
                            if (target) target.imageHeight = clamp(Number(event.target.value) || 96, 56, 240);
                          }, false),
                        }))
                      : null),
                  h('div', { className: 'wsb-noteSect' },
                    h('b', null, t.noteShape),
                    h('div', { className: 'wsb-noteBtnRow' },
                      NOTE_SHAPES.map((id) => shapeButton(id, t['noteShape' + id.charAt(0).toUpperCase() + id.slice(1)])))),
                  h('div', { className: 'wsb-noteSect' },
                    h('b', null, t.noteColor),
                    h('div', { className: 'wsb-noteSwatches' },
                      h('button', {
                        type: 'button', className: 'wsb-noteSwatch', 'data-note-color': 'auto',
                        'data-on': selected.color ? 'false' : 'true', title: t.noteColorAuto,
                        style: { background: 'linear-gradient(135deg,' + theme.accent.slice(0, 3).join(',') + ')' },
                        onClick: () => patchTree((base) => {
                          const target = findNote(base, selectedId);
                          if (target) target.color = '';
                        }, false),
                      }),
                      theme.accent.map((hex) => h('button', {
                        key: hex, type: 'button', className: 'wsb-noteSwatch', 'data-note-color': hex,
                        'data-on': selected.color === hex ? 'true' : 'false', title: hex,
                        style: { background: hex },
                        onClick: () => patchTree((base) => {
                          const target = findNote(base, selectedId);
                          if (target) target.color = hex;
                        }, false),
                      })))),
                  h('div', { className: 'wsb-noteBtnRow wsb-noteBtnRowEnd' },
                    h('button', {
                      type: 'button', className: 'wsb-btn', 'data-note-collapse': '1',
                      onClick: () => toggleCollapse(selectedId),
                    }, selected.collapsed ? t.noteExpand : t.noteCollapse),
                    h('button', {
                      type: 'button', className: 'wsb-btn', 'data-note-add-child': '1',
                      onClick: () => addChild(selectedId),
                    }, '+ ' + t.noteAdd),
                    selectedId === root.id
                      ? null
                      : h('button', {
                        type: 'button', className: 'wsb-btn', 'data-tone': 'danger', 'data-note-delete': '1',
                        onClick: () => removeNode(selectedId),
                      }, t.noteDelete))))
              : null,
            h('input', {
              ref: fileRef, type: 'file', accept: 'image/*',
              style: { display: 'none' }, 'data-note-image-input': '1', onChange: pickFile,
            }),
            h('input', {
              ref: importRef, type: 'file', accept: '.json,.mm,.opml,.xml,.md,.markdown,.txt,application/json,text/xml,text/markdown,text/plain',
              style: { display: 'none' }, 'data-note-import-input': '1', onChange: onImportFile,
            }))));
    }

    //#endregion

    //#region 每日新闻 (daily news reader)

    /** Format an age as the shortest string a reader accepts: 刚刚 / 12 分钟 / 3 小时 / 2 天. */
    function newsAge(stamp, t) {
      const seconds = Math.max(0, (Date.now() - Number(stamp || 0)) / 1000);
      if (seconds < 90) return t.newsJustNow || '刚刚';
      const minutes = seconds / 60;
      if (minutes < 60) return Math.round(minutes) + (t.newsMin || ' 分钟前');
      const hours = minutes / 60;
      if (hours < 24) return Math.round(hours) + (t.newsHour || ' 小时前');
      return Math.round(hours / 24) + (t.newsDayAge || ' 天前');
    }

    /** Human date+time for the detail pane, in the locale the panel is already using. */
    function newsStamp(stamp) {
      const date = new Date(Number(stamp) || Date.now());
      const pad = (n) => (n < 10 ? '0' : '') + n;
      return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate())
        + ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes());
    }

    /**
     * Today's date as a masthead line — `2026年2月14日 · 星期六` / `Saturday, February 14, 2026`.
     *
     * Built from `formatToParts` rather than from one formatted string, because the zh-CN pattern
     * runs the weekday straight into the date ("2026年10月10日星期六") and a masthead needs the
     * separator to be a design decision rather than a locale accident. A failure falls back to the
     * ISO date instead of throwing inside a render.
     */
    function newsDateLabel(lang) {
      const date = new Date();
      const english = lang === 'en';
      try {
        const parts = date.toLocaleDateString(english ? 'en-US' : 'zh-CN', {
          year: 'numeric', month: 'long', day: 'numeric', weekday: 'long',
        });
        if (english) return parts;
        const weekday = date.toLocaleDateString('zh-CN', { weekday: 'long' });
        // Strip the weekday out of the date half, whichever end the locale put it on.
        const rest = parts.replace(weekday, '').replace(/[·,，\s]+$/, '').replace(/^[·,，\s]+/, '');
        return rest + ' · ' + weekday;
      } catch {
        return date.getFullYear() + '-' + (date.getMonth() + 1) + '-' + date.getDate();
      }
    }

    /**
     * Is this text Latin-script enough to want machine translation, and to want tightened
     * tracking?
     *
     * Two different questions with the same answer, which is why one helper serves both. A
     * headline with no Han characters is foreign to a Chinese reader (translate it) and is set in
     * a grotesk (tighten it); Chinese carries its own optical rhythm and wants neither.
     */
    function isLatinText(value) {
      const text = String(value || '');
      if (!/[A-Za-z]/.test(text)) return false;
      const han = (text.match(/[\u3400-\u4dbf\u4e00-\u9fff]/g) || []).length;
      return han < 2;
    }

    /** Letters and digits only, for comparing a translation against its source. */
    function contentKey(value) {
      return String(value || '').toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, '');
    }

    /**
     * The translation cached for a text, or '' — the map is keyed by the original text.
     *
     * An entry equal to its own source is treated as absent. That is not belt-and-braces for its
     * own sake: a machine-translation endpoint under load answers with the query echoed back, and
     * a cached echo would print the same headline twice — once as the translation, once as the
     * original — which reads as a layout bug and never heals, because the bad value is now cached.
     * The Host refuses to store echoes; this refuses to draw one that got in anyway.
     */
    function translationOf(news, text) {
      const map = news && news.translated;
      if (!map || !text) return '';
      const hit = map[text];
      if (typeof hit !== 'string' || !hit) return '';
      const source = contentKey(text);
      if (source && contentKey(hit) === source) return '';
      return hit;
    }

    /**
     * Merge a fetch result into the local archive.
     *
     * Returns a new object rather than mutating, because the caller stores the result straight
     * into React state and a mutation there would not re-render. Two rules matter:
     *
     *  - **the 7-day promise is enforced here as well as on the Host.** The Host governs what a
     *    refresh may reintroduce; this governs what survives in localStorage after a week of
     *    the app being closed and reopened. Neither alone is sufficient.
     *  - **an existing item is not simply replaced.** Feeds rewrite their own items (a headline
     *    gets a typo fix, an item gains an image), so the newer copy wins for content, but
     *    `firstSeen` — which is what "已读/未读" and the retention window are actually measured
     *    against — is carried over from the older one.
     */
    function mergeNewsArchive(archive, incoming, now) {
      const cutoff = now - NEWS_KEEP_DAYS * 86400000;
      const byId = new Map();
      for (const item of archive) {
        if (!item || typeof item.id !== 'string' || Number(item.publishedAt) < cutoff) continue;
        // Every surviving entry carries a `firstSeen`, including one written by a build that
        // did not record it. For those the publication time is the only honest bound available:
        // it is earlier than the moment it was stored, and it is not invented.
        byId.set(item.id, item.firstSeen ? item : Object.assign({}, item, { firstSeen: item.publishedAt }));
      }
      for (const item of incoming) {
        if (!item || typeof item.id !== 'string' || !item.title || !item.url) continue;
        if (!Number.isFinite(item.publishedAt) || item.publishedAt < cutoff) continue;
        const previous = byId.get(item.id);
        byId.set(item.id, Object.assign({}, previous, item, {
          firstSeen: previous && previous.firstSeen ? previous.firstSeen : now,
        }));
      }
      return [...byId.values()]
        .sort((a, b) => b.publishedAt - a.publishedAt)
        .slice(0, NEWS_ARCHIVE_MAX);
    }

    /**
     * The news screen's data layer: catalog, fetch, archive, translation.
     *
     * Returns a plain object plus two callbacks; the components below own only presentation.
     * Persisting goes through `patchModule`, which is the same write-through path every other
     * module uses, so the archive and the translation cache survive a reload for free.
     *
     * @param {object} module - the news module; `patchModule` writes back into its `news` field.
     */
    function useNewsData(module, patchModule) {
      const news = module.news || defaultNewsSettings();
      const [busy, setBusy] = useState(false);
      const [error, setError] = useState('');
      // A 404 on this route does not mean "the network is down": it means the Host half that
      // owns the route is not the version on disk yet. Host code is read once at process start,
      // so after an update the reader is live (the browser half hot-reloads) while the route is
      // still missing. That is a completely different problem from a failed fetch, and it has a
      // completely different fix, so it is tracked separately rather than folded into `error`.
      const [needsRestart, setNeedsRestart] = useState(false);
      const [catalogNote, setCatalogNote] = useState('');
      // The host route reports per-source timings; they are diagnostic state, not user data,
      // so they live here rather than in localStorage.
      const [status, setStatus] = useState(null);
      const [translating, setTranslating] = useState(false);
      const [translateNote, setTranslateNote] = useState('');
      const [fetchingImages, setFetchingImages] = useState(false);
      const inflight = useRef(false);
      /** Texts a translation request is currently in flight for; see `translate`. */
      const inflightTranslations = useRef(new Set());

      // `refresh` must send the topics, count and window as they are NOW, not as they were when
      // the callback was created. Two paths need this:
      //   - a reader-triggered refresh after editing a topic, where the callback is reused across
      //     renders (the callback's identity no longer changes with the topic list);
      //   - the catalog adoption below, which fires a refresh in the *same* microtask as the
      //     state update — before any re-render, so the ref is still one render behind. That path
      //     passes the adopted list explicitly through `options.topics`.
      const nowRef = useRef({ topics: news.topics, count: news.count, days: news.days });
      nowRef.current = { topics: news.topics, count: news.count, days: news.days };

      const refresh = useCallback((options) => {
        if (inflight.current) return Promise.resolve();
        inflight.current = true;
        setBusy(true);
        setError('');
        const want = options || {};
        const payload = {
          topics: (want.topics || nowRef.current.topics).map(topicPayload),
          limit: nowRef.current.count,
          days: nowRef.current.days,
          refresh: Boolean(want.force),
        };
        return fetch(NEWS_ROUTE, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-workbench-client': 'news' },
          body: JSON.stringify(payload),
        })
          .then((response) => {
            if (response.ok) return response.json();
            if (response.status === 404) {
              setNeedsRestart(true);
              throw new Error('HTTP 404');
            }
            throw new Error('HTTP ' + response.status);
          })
          .then((result) => {
            if (!result || !result.ok) throw new Error((result && result.error) || '抓取失败');
            const now = Date.now();
            setNeedsRestart(false);
            setStatus(result.stats || null);
            patchModule(module.id, (target) => {
              target.news = normalizeNewsSettings(Object.assign({}, target.news, {
                archive: mergeNewsArchive((target.news && target.news.archive) || [], result.items || [], now),
                lastFetchAt: now,
              }));
            });
          })
          .catch((failure) => {
            setError(String((failure && failure.message) || failure));
          })
          .then(() => {
            inflight.current = false;
            setBusy(false);
          });
      }, [module.id, patchModule]);

      /**
       * Translate a batch of texts and cache the result in the module.
       *
       * `texts` is deduplicated against the existing cache *before* the request, so pressing
       * "translate this page" twice costs nothing the second time, and a translation that has
       * already been paid for once is never paid for again — which is what makes a rate-limited
       * free endpoint workable for a reader who opens the same tab every morning.
       *
       * @param {string[]} texts - originals to translate; already-foreign-looking ones included,
       *   the Host drops anything already in the target language.
       */
      const translate = useCallback((texts) => {
        const wanted = [];
        const seen = new Set();
        const known = (module.news && module.news.translated) || {};
        // Texts already asked for and not yet answered. Two callers request translations of the
        // same headline — the stream's visible batch and the 原文 pane for the story it opened on
        // — and without this they would both pay for it, which on a rate-limited endpoint is the
        // difference between working and not.
        const inflightTexts = inflightTranslations.current;
        for (const text of texts) {
          const value = String(text || '').trim();
          if (value.length < 2 || seen.has(value)) continue;
          seen.add(value);
          if (typeof known[value] === 'string') continue;
          if (inflightTexts.has(value)) continue;
          wanted.push(value.slice(0, 400));
          if (wanted.length >= 200) break;
        }
        if (!wanted.length) return Promise.resolve(0);
        for (const text of wanted) inflightTexts.add(text);
        const release = () => { for (const text of wanted) inflightTexts.delete(text) };
        setTranslating(true);
        setTranslateNote('');
        return fetch(NEWS_ROUTE + '?op=translate', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-workbench-client': 'news' },
          body: JSON.stringify({ texts: wanted, to: 'zh-CN' }),
        })
          .then((response) => (response.ok ? response.json() : Promise.reject(new Error('HTTP ' + response.status))))
          .then((result) => {
            if (!result || !result.ok) throw new Error((result && result.error) || '翻译失败');
            const gained = Object.keys(result.translations || {}).length;
            if (gained) {
              patchModule(module.id, (target) => {
                const settings = normalizeNewsSettings(target.news);
                settings.translated = Object.assign({}, settings.translated, result.translations);
                // Bound the cache the same way the archive is bounded: newest keys win, and the
                // rest are dropped rather than growing localStorage without limit.
                const keys = Object.keys(settings.translated);
                if (keys.length > NEWS_TRANSLATION_MAX) {
                  const keep = keys.slice(keys.length - NEWS_TRANSLATION_MAX);
                  const trimmed = {};
                  for (const key of keep) trimmed[key] = settings.translated[key];
                  settings.translated = trimmed;
                }
                target.news = settings;
              });
            }
            // A provider that answered nothing (or refused) is worth saying out loud: an
            // untranslated list otherwise looks like a setting that did not take.
            const why = (result.providerErrors || []).map((entry) => entry.provider + ' ' + entry.message).join('；');
            setTranslateNote(gained ? '' : (why || (result.failed ? '翻译服务暂时不可用' : '')));
            return gained;
          })
          .catch((failure) => {
            const message = String((failure && failure.message) || failure);
            // Same condition as the collect route: a 404 here means the Host half that owns the
            // route is older than the browser half, not that translation is broken. Reporting it
            // as "the service failed" would send the reader looking in the wrong place.
            if (message.indexOf('404') >= 0) setNeedsRestart(true);
            setTranslateNote(message);
            return 0;
          })
          .then((gained) => {
            // Released whatever the outcome: a text the provider refused must be retryable, and
            // one it answered is now served by the cache instead.
            release();
            setTranslating(false);
            return gained;
          });
      }, [module.id, patchModule]);

      const toggleTranslate = useCallback((on) => patchModule(module.id, (target) => {
        const settings = normalizeNewsSettings(target.news);
        settings.translate = on;
        target.news = settings;
      }), [module.id, patchModule]);

      /**
       * Ask the Host for card images, then write them onto the archived stories.
       *
       * Writing them into the archive (rather than keeping a side map) is what makes the second
       * open of the module instant and offline-clean: the URL is part of the item, so it is
       * still there tomorrow without asking anyone.
       */
      const resolveImages = useCallback((urls) => {
        const wanted = (urls || []).filter((url) => typeof url === 'string' && /^https?:\/\//i.test(url));
        if (!wanted.length) return Promise.resolve(0);
        setFetchingImages(true);
        return fetch(NEWS_ROUTE + '?op=images', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-workbench-client': 'news' },
          body: JSON.stringify({ urls: wanted.slice(0, 24) }),
        })
          .then((response) => (response.ok ? response.json() : Promise.reject(new Error('HTTP ' + response.status))))
          .then((result) => {
            if (!result || !result.ok) throw new Error((result && result.error) || '配图抓取失败');
            const images = result.images || {};
            const found = Object.keys(images);
            if (found.length) {
              patchModule(module.id, (target) => {
                const settings = normalizeNewsSettings(target.news);
                settings.archive = settings.archive.map((item) => (
                  images[item.url] ? Object.assign({}, item, { image: images[item.url] }) : item
                ));
                target.news = settings;
              });
            }
            return found.length;
          })
          .catch((failure) => {
            const message = String((failure && failure.message) || failure);
            // A 404 here is the same "Host half is older than the browser half" signal the other
            // ops raise; pictures simply stay absent until the restart.
            if (message.indexOf('404') >= 0) setNeedsRestart(true);
            return 0;
          })
          .then((count) => {
            setFetchingImages(false);
            return count;
          });
      }, [module.id, patchModule]);

      // Catalog once per session. It supplies the source picker's labels *and* the shipped
      // topic set, so an untouched rail is replaced by the Host's own list on the first
      // successful read. A failure is a note, not an error state.
      const catalogStale = Date.now() - (news.catalogAt || 0) > 6 * 3600 * 1000;
      useEffect(() => {
        if (!catalogStale) return undefined;
        let alive = true;
        fetch(NEWS_ROUTE + '?op=catalog', { headers: { 'x-workbench-client': 'news' } })
          .then((response) => (response.ok ? response.json() : Promise.reject(new Error('HTTP ' + response.status))))
          .then((result) => {
            if (!alive || !result || !result.ok) return;
            let adoptedTopics = null;
            patchModule(module.id, (target) => {
              const current = normalizeNewsSettings(target.news);
              const next = Object.assign({}, current, {
                feeds: result.feeds,
                catalogAt: Date.now(),
              });
              // The Host owns the shipped topics; the Client owns the user's edits. Only an
              // untouched rail is replaced — and the replacement is normalised, so a catalog
              // with a malformed entry degrades instead of breaking the pane.
              if (!current.topicsFromCatalog && Array.isArray(result.defaults) && result.defaults.length) {
                const adoptedSettings = normalizeNewsSettings(Object.assign({}, current, {
                  topics: result.defaults,
                  activeId: current.activeId,
                  topicsFromCatalog: true,
                }));
                next.topics = adoptedSettings.topics;
                next.activeId = adoptedSettings.activeId;
                next.topicsFromCatalog = true;
                adoptedTopics = adoptedSettings.topics;
              }
              target.news = normalizeNewsSettings(next);
            });
            // A replaced topic set makes the archive stale by definition: whatever is stored is
            // tagged with the ids of the topics that no longer exist, so without this the two
            // newly adopted tabs would sit empty until the reader thought to hit refresh. The
            // adopted list is passed in because this runs before the state it just queued has
            // been rendered.
            if (adoptedTopics) refresh({ force: true, topics: adoptedTopics });
          })
          .catch(() => { if (alive) setCatalogNote('catalog') });
        return () => { alive = false };
        // Intentionally once per mount: the catalog is static for the life of a host process.
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);

      // Open-time refresh, with a staleness window.
      //
      // An empty archive fetches immediately: an empty pane with a "press refresh" hint is a
      // worse first impression than a progress state. A non-empty one is shown straight away
      // and only refetched once it is old enough to be worth the round trip — a reader that
      // re-fetched a dozen sources every time the module was reopened would be both slow and
      // rude to the sources, while one that never refreshed on open would show yesterday's
      // headlines under today's date.
      const autoRef = useRef(false);
      useEffect(() => {
        if (autoRef.current) return;
        autoRef.current = true;
        const last = Number(news.lastFetchAt) || 0;
        if (!news.archive.length || Date.now() - last > NEWS_STALE_MS) refresh({ force: true });
        // Intentionally once per mount: this is the "opened the module" event.
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);

      return {
        news, busy, error, status, catalogNote, needsRestart,
        translating, translateNote, refresh, translate, toggleTranslate,
        fetchingImages, resolveImages,
      };
    }

    /**
     * Translate whatever is on screen, once, whenever the set of untranslated texts changes.
     *
     * Batched on the Host, debounced here: a topic switch changes fifty headlines at once and
     * firing a request per headline would be both slower and ruder than one request per ten.
     */
    function useVisibleTranslation(items, news, enabled, translate) {
      const pending = useMemo(() => {
        if (!enabled) return [];
        const wanted = [];
        for (const item of items) {
          if (!isLatinText(item.title)) continue;
          if (!translationOf(news, item.title)) wanted.push(item.title);
          if (wanted.length >= 60) break;
        }
        return wanted;
      }, [items, news, enabled]);
      // The key is what makes this run once per distinct batch rather than on every render.
      const key = pending.join('\u0001');
      const lastKey = useRef('');
      useEffect(() => {
        if (!key || key === lastKey.current) return undefined;
        lastKey.current = key;
        let alive = true;
        // A short delay lets a burst of state changes (fetch arriving, topic switching) settle
        // into one batch instead of three.
        const timer = window.setTimeout(() => { if (alive) translate(pending) }, 320);
        return () => { alive = false; safe(() => window.clearTimeout(timer)) };
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [key]);
    }

    /**
     * A picture. Two shapes, one component: the wide 16:9 plate used by the lead, the grid and
     * the 大事件 rail, and the 68px square that sits at the right edge of a row.
     *
     * A broken image is hidden rather than left to render as a torn-page icon: these are
     * third-party URLs behind hotlink policies, so a miss is routine, and one grey broken frame
     * in a front page undoes the whole layout. `referrerPolicy` is not decoration either — it
     * keeps the loopback GUI's origin out of the publisher's logs, and it is what gets past the
     * hotlink checks that key on Referer.
     */
    function NewsPicture({ className, src, alt, tone }) {
      const [dead, setDead] = useState(false);
      if (!src || dead) return null;
      return h('figure', {
        className,
        'data-tone': tone || undefined,
        onError: () => setDead(true),
      }, h('img', {
        src, alt: alt || '', loading: 'lazy', decoding: 'async', referrerPolicy: 'no-referrer',
        onError: () => setDead(true),
      }));
    }

    /**
     * Resolve pictures for what is about to be drawn, once per batch.
     *
     * Only the top of the stream is asked for — a lead plate, two secondaries, the first rows and
     * the 大事件 strip — because those are the ones a reader sees without scrolling, and each miss
     * costs the Host a page fetch. The Host caches by article URL, and the resolved URL is merged
     * into the archived item, so a story is paid for once ever.
     */
    function useVisibleImages(items, highlights, onResolve) {
      const pending = useMemo(() => {
        const wanted = [];
        const seen = new Set();
        for (const item of [].concat(highlights || [], items.slice(0, 12))) {
          if (!item || item.image || !item.url || seen.has(item.url)) continue;
          seen.add(item.url);
          wanted.push(item.url);
          if (wanted.length >= 18) break;
        }
        return wanted;
      }, [items, highlights]);
      const key = pending.join('\u0001');
      const lastKey = useRef('');
      useEffect(() => {
        if (!key || key === lastKey.current) return undefined;
        lastKey.current = key;
        let alive = true;
        // Deliberately slower than the translation batch: the text is what the reader came for,
        // and pictures are worth a moment's patience rather than a contested socket.
        const timer = window.setTimeout(() => { if (alive) onResolve(pending) }, 600);
        return () => { alive = false; safe(() => window.clearTimeout(timer)) };
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [key]);
    }

    /** One story, in one of four tiers.
     *
     * The tier is the whole point: `lead` carries the largest type and a full-width plate,
     * `secondary` the middle size, `list` the smallest with a square thumbnail, and grid/compact
     * are the same content at the two other densities. Passing the tier in rather than deriving it
     * here keeps the ranking in one place — the stream builder — where the ordering is decided.
     */
    function NewsItem({ t, item, index, tier, active, read, translated, translations, translating, onSelect, onOpen, onTranslate }) {
      const tone = item.accent || 'var(--wsb-c1)';
      const latin = isLatinText(item.title);
      const xlate = translated || '';
      const xlateSum = translationOf({ translated: translations }, item.summary) || '';
      const summaryLatin = isLatinText(item.summary);
      const picture = tier === 'lead' || tier === 'secondary' || tier === 'grid';
      const thumbed = tier === 'list' && Boolean(item.image);
      return h('div', {
        className: 'wsb-item', role: 'button', tabIndex: 0,
        'data-news-item': item.id,
        'data-tier': tier,
        'data-hasimage': item.image ? 'true' : 'false',
        'data-on': active ? 'true' : 'false',
        'data-read': read ? 'true' : 'false',
        style: {
          '--wsb-tone': tone,
          // Only the first screenful participates in the entrance sweep. Past that the list is
          // scroll material, and animating 100 cards for 2 seconds is exactly the "everything
          // jumps at once" problem the console already fixed once.
          animationDelay: Math.min(index, 16) * 16 + 'ms',
        },
        onClick: () => onSelect(item.id),
        onKeyDown: (event) => { if (event.key === 'Enter') onSelect(item.id) },
      },
        picture ? h(NewsPicture, { className: 'wsb-figure', src: item.image, alt: item.title }) : null,
        h('span', { className: 'wsb-itemTop' },
          h('span', { className: 'wsb-itemSrc', title: item.source }, item.source),
          h('span', { className: 'wsb-itemTime' }, newsAge(item.publishedAt, t))),
        // Translation first, original second: for a Chinese reader the translation IS the
        // headline, and demoting the English to a smaller line below keeps both without
        // printing the same story twice at the same weight.
        xlate
          ? h('span', { className: 'wsb-itemXlate', lang: 'zh-CN' }, xlate)
          : null,
        h('span', {
          className: latin && xlate ? 'wsb-itemOrig' : 'wsb-itemTitle',
          'data-latin': latin ? 'true' : 'false',
          lang: latin ? 'en' : undefined,
        }, item.title),
        item.summary
          ? h('span', {
            className: xlateSum ? 'wsb-itemXlateSum' : 'wsb-itemSum',
            'data-latin': summaryLatin ? 'true' : 'false',
            lang: summaryLatin ? 'en' : undefined,
          }, xlateSum || item.summary)
          : null,
        item.summary && xlateSum
          ? h('span', { className: 'wsb-itemSum', 'data-latin': 'true', lang: 'en' }, item.summary)
          : null,
        h('span', { className: 'wsb-itemFoot' },
          item.coverage > 1
            ? h('span', { className: 'wsb-covBadge' }, item.coverage + ' ' + t.newsHotHint)
            : null,
          item.points ? h('span', { className: 'wsb-tag' }, '▲ ' + item.points) : null,
          item.category ? h('span', { className: 'wsb-tag' }, firstLine(item.category, 14)) : null,
          // A per-story translate control, for the reader who keeps 中文对照 off but wants this
          // one headline. Hidden once translated — there is nothing left to ask for.
          latin && !xlate
            ? h('button', {
              type: 'button', className: 'wsb-itemXlateBtn', 'data-xlate': item.id,
              disabled: translating, title: t.newsTranslateOne,
              onClick: (event) => { event.stopPropagation(); onTranslate([item.title, item.summary]) },
            }, translating ? '…' : t.newsTranslateShort)
            : null,
          h('span', {
            className: 'wsb-itemOpen',
            onClick: (event) => { event.stopPropagation(); onOpen(item.url) },
          }, t.newsOpen + ' ↗')),
        // The thumbnail is emitted last so the grid can place it in the right-hand column without
        // the text having to declare its own column: one explicit `grid-column` beats eight.
        thumbed ? h('span', { className: 'wsb-thumb' }, h(NewsPicture, { className: 'wsb-thumbImg', src: item.image, alt: '' })) : null);
    }

    /** A single measured bar; used for coverage and for per-source volume. */
    function NewsBar({ value, max, tone }) {
      const ratio = max > 0 ? Math.max(0.04, Math.min(1, value / max)) : 0.04;
      return h('span', { className: 'wsb-barTrack' },
        h('i', { style: { transform: 'scaleX(' + ratio.toFixed(3) + ')', background: tone || undefined } }));
    }

    /** Skeleton rows shown while the very first fetch is in flight. */
    function NewsSkeleton({ count }) {
      return h('div', { className: 'wsb-stream', 'data-view': 'list', 'data-skeleton': '1' },
        new Array(Math.max(3, Math.min(6, count))).fill(0).map((_, index) => h('div', {
          key: index, className: 'wsb-skel', style: { animationDelay: index * 40 + 'ms' },
        },
          h('span', { className: 'wsb-skelRow', 'data-w': '46' }),
          h('span', { className: 'wsb-skelRow', 'data-w': '92' }),
          h('span', { className: 'wsb-skelRow', 'data-w': '70' }))));
    }

    /**
     * 关键领域 — the topic switcher, as a horizontal nav bar.
     *
     * This used to be a vertical rail taking a third of the width. Two things were wrong with
     * that: it spent reading width on a switcher that is used once per session, and at any narrow
     * window it squeezed the news itself. A horizontal bar costs one row and buys the whole width
     * back for the front page — the same trade every news site makes.
     *
     * The custom/keyword editor is a panel *below* the bar rather than a third column, so opening
     * it never reflows the thing you were reading. It overlays rather than pushes, and it closes
     * on the same ✎ / Done controls as before.
     */
    function NewsNav({ t, news, module, patchModule, stats }) {
      const [editingId, setEditingId] = useState('');
      const [adding, setAdding] = useState(false);
      const [draft, setDraft] = useState('');
      const active = news.topics.find((topic) => topic.id === news.activeId) || news.topics[0];
      const editing = news.topics.find((topic) => topic.id === editingId) || null;

      /** Topic edits all funnel through here so the accent/name/id invariants hold, and so
       *  every one of them claims ownership of the topic list against the Host's defaults. */
      const patchTopic = (id, mutate) => patchModule(module.id, (target) => {
        const settings = normalizeNewsSettings(target.news);
        const topic = settings.topics.find((entry) => entry.id === id);
        if (!topic) return;
        mutate(topic, settings);
        settings.topicsFromCatalog = true;
        target.news = settings;
      });

      const counts = new Map(((stats && stats.topics) || []).map((entry) => [entry.id, entry.count]));

      const addKeyword = (word) => {
        const value = String(word || '').trim();
        if (!value || !editing) return;
        patchTopic(editing.id, (topic) => {
          if (topic.kw.indexOf(value) < 0 && topic.kw.length < 8) topic.kw.push(value);
        });
      };

      const addTopic = (name) => {
        const value = String(name || '').trim();
        if (!value) { setAdding(false); return }
        const id = 'topic-' + newId('n').slice(2);
        patchModule(module.id, (target) => {
          const settings = normalizeNewsSettings(target.news);
          if (settings.topics.length >= 12) return;
          settings.topics.push({
            id, name: value.slice(0, 40),
            accent: NEWS_TOPIC_ACCENTS[settings.topics.length % NEWS_TOPIC_ACCENTS.length],
            lang: 'zh', kw: [], feeds: ['gnews-top-zh'],
          });
          settings.activeId = id;
          settings.topicsFromCatalog = true;
          target.news = settings;
        });
        setAdding(false);
        setEditingId(id);
      };

      const grouped = [];
      for (const feed of news.feeds) {
        const group = grouped.find((entry) => entry.group === feed.group);
        if (group) group.feeds.push(feed);
        else grouped.push({ group: feed.group, feeds: [feed] });
      }

      return h('div', { className: 'wsb-navWrap' },
        h('nav', { className: 'wsb-nav', role: 'tablist', 'data-news-nav': '1' },
          // A leading label, like the wordmark a site's nav starts with, so the row reads as
          // navigation rather than as a row of unrelated buttons.
          h('span', { className: 'wsb-navLead' }, t.newsTopicsShort),
          h('div', { className: 'wsb-navItems' },
            news.topics.map((topic) => h('button', {
              key: topic.id, type: 'button', role: 'tab',
              className: 'wsb-navItem',
              'data-topic': topic.id,
              'data-on': topic.id === (active && active.id) ? 'true' : 'false',
              'aria-selected': topic.id === (active && active.id) ? 'true' : 'false',
              style: { '--wsb-tone': topic.accent },
              onClick: () => patchModule(module.id, (target) => {
                const settings = normalizeNewsSettings(target.news);
                settings.activeId = topic.id;
                target.news = settings;
              }),
            },
              h('i', { className: 'wsb-navDot' }),
              h('span', { className: 'wsb-navName' }, topic.name),
              h('span', { className: 'wsb-navN' },
                counts.has(topic.id) ? String(counts.get(topic.id)) : (topic.kw.length + '/' + topic.feeds.length)),
              // The edit affordance stays a separate hit target so switching topics is one clean
              // click and editing is one deliberate click, never a mis-click between the two.
              h('span', {
                className: 'wsb-navEdit', role: 'button', title: t.newsEditTopic,
                'data-topic-edit-btn': topic.id,
                onClick: (event) => {
                  event.stopPropagation();
                  setEditingId(editingId === topic.id ? '' : topic.id);
                },
              }, '✎')))),
          // `+ 自定义`: the add affordance lives in the bar it extends. Same rule as before — a
          // button that reveals one input, not a permanently open field that reads as a value.
          adding
            ? h('div', { className: 'wsb-addForm', 'data-topic-add-form': '1' },
              h('input', {
                className: 'wsb-input', autoFocus: true, placeholder: t.newsAddTopic,
                value: draft, 'data-topic-add-input': '1',
                onChange: (event) => setDraft(event.target.value),
                onKeyDown: (event) => {
                  if (event.key === 'Enter') { event.preventDefault(); addTopic(draft); setDraft('') }
                  else if (event.key === 'Escape') { event.preventDefault(); setAdding(false); setDraft('') }
                },
              }),
              h('button', {
                type: 'button', className: 'wsb-iconBtn', 'data-topic-add-confirm': '1',
                title: t.newsAddTopic, disabled: !draft.trim(),
                onClick: () => { addTopic(draft); setDraft('') },
              }, '+'),
              h('button', {
                type: 'button', className: 'wsb-iconBtn', 'data-tone': 'quiet',
                'data-topic-add-cancel': '1', title: t.remove,
                onClick: () => { setAdding(false); setDraft('') },
              }, '×'))
            : h('button', {
              type: 'button', className: 'wsb-navAdd', 'data-topic-add': '1',
              disabled: news.topics.length >= 12,
              title: t.newsAddTopic,
              onClick: () => setAdding(true),
            }, h('i', null, '+'), t.newsCustom)),

        editing
          ? h('div', {
            className: 'wsb-navPanel', 'data-topic-edit': editing.id,
            style: { '--wsb-tone': editing.accent },
          },
            h('div', { className: 'wsb-navPanelHead' },
              h('i', { className: 'wsb-navDot' }),
              h('b', null, editing.name),
              h('button', {
                type: 'button', className: 'wsb-iconBtn', 'data-tone': 'quiet',
                'data-topic-done': '1', title: t.newsDone, onClick: () => setEditingId(''),
              }, '×')),
            h('div', { className: 'wsb-nwField' },
              h('span', null, t.newsTopicName),
              h(WorkbenchInput, {
                value: editing.name,
                onSubmit: (name) => patchTopic(editing.id, (topic) => { topic.name = name.slice(0, 40) }),
              })),
            h('div', { className: 'wsb-nwField' },
              h('span', null, t.newsKeywords),
              h('div', { className: 'wsb-kwRow' },
                editing.kw.map((word) => h('span', { key: word, className: 'wsb-kw' }, word,
                  h('button', {
                    type: 'button', title: t.remove, 'data-kw-remove': word,
                    onClick: () => patchTopic(editing.id, (topic) => {
                      topic.kw = topic.kw.filter((entry) => entry !== word);
                    }),
                  }, '×'))),
                editing.kw.length === 0 ? h('span', { className: 'wsb-topicN' }, t.newsNoKeywords) : null),
              h('div', { style: { marginTop: 6 } },
                h('input', {
                  className: 'wsb-input', style: { width: '100%' }, defaultValue: '',
                  placeholder: t.newsAddKeyword, 'data-kw-input': '1',
                  onKeyDown: (event) => {
                    if (event.key !== 'Enter') return;
                    event.preventDefault();
                    addKeyword(event.currentTarget.value);
                    event.currentTarget.value = '';
                  },
                }))),
            h('div', { className: 'wsb-nwField' },
              h('span', null, t.newsLang),
              h('span', { className: 'wsb-seg' }, Object.keys(NEWS_LANGS).map((code) => h('button', {
                key: code, type: 'button', className: 'wsb-segBtn', 'data-news-lang': code,
                'data-on': editing.lang === code ? 'true' : 'false',
                onClick: () => patchTopic(editing.id, (topic) => { topic.lang = code }),
              }, NEWS_LANGS[code])))),
            h('div', { className: 'wsb-nwField' },
              h('span', null, t.newsSources),
              grouped.map((group) => h('div', { key: group.group, className: 'wsb-srcGroup' },
                h('div', { className: 'wsb-miniHead', style: { margin: '6px 0 4px' } }, group.group),
                h('div', { className: 'wsb-srcList' },
                  group.feeds.map((feed) => h('button', {
                    key: feed.id, type: 'button', className: 'wsb-srcChip',
                    'data-feed': feed.id,
                    'data-on': editing.feeds.indexOf(feed.id) >= 0 ? 'true' : 'false',
                    onClick: () => patchTopic(editing.id, (topic) => {
                      topic.feeds = topic.feeds.indexOf(feed.id) >= 0
                        ? topic.feeds.filter((entry) => entry !== feed.id)
                        : topic.feeds.concat([feed.id]).slice(0, 12);
                    }),
                  }, feed.label)))))),
            h('div', { className: 'wsb-actions' },
              h('button', {
                type: 'button', className: 'wsb-btn', 'data-topic-done-2': '1',
                onClick: () => setEditingId(''),
              }, t.newsDone),
              h('button', {
                type: 'button', className: 'wsb-btn', 'data-tone': 'danger', 'data-topic-delete': '1',
                disabled: news.topics.length <= 1, title: t.newsDeleteTopic,
                onClick: () => {
                  patchModule(module.id, (target) => {
                    const settings = normalizeNewsSettings(target.news);
                    settings.topics = settings.topics.filter((entry) => entry.id !== editing.id);
                    if (!settings.topics.length) settings.topics = defaultNewsSettings().topics;
                    if (!settings.topics.some((entry) => entry.id === settings.activeId)) {
                      settings.activeId = settings.topics[0].id;
                    }
                    settings.topicsFromCatalog = true;
                    target.news = settings;
                  });
                  setEditingId('');
                },
              }, t.newsDeleteTopic)))
          : null);
    }

    /**
     * The detail pane: the selected story in full, its related coverage, and the source report.
     *
     * The article body is never fetched as a whole. `op=article` reads one page's `<head>` on
     * demand — `og:description`, `og:image`, publication time — because a summary is what the
     * feed so often omits and a thumbnail is what makes the pane worth looking at. Publishers
     * that refuse it (403 is common) degrade to the feed's own summary.
     */
    function NewsDetailPane({ t, news, item, status, busy, error, needsRestart, translating, onOpen, onTranslate, grow }) {
      const [article, setArticle] = useState(null);
      const [loadingArticle, setLoadingArticle] = useState(false);
      const [copied, setCopied] = useState(false);
      const url = item ? item.url : '';

      useEffect(() => {
        setArticle(null);
        setCopied(false);
        if (!url || !/^https?:\/\//i.test(url)) return undefined;
        let alive = true;
        setLoadingArticle(true);
        fetch(NEWS_ROUTE + '?op=article&url=' + encodeURIComponent(url), { headers: { 'x-workbench-client': 'news' } })
          .then((response) => (response.ok ? response.json() : Promise.reject(new Error('HTTP ' + response.status))))
          .then((result) => { if (alive) setArticle(result && result.ok ? result : null) })
          .catch(() => { if (alive) setArticle(null) })
          .then(() => { if (alive) setLoadingArticle(false) });
        return () => { alive = false };
      }, [url]);

      // The detail pane is where a reader actually reads, so it translates on its own rather
      // than waiting for the list toggle: the headline, the dek, and — bounded on purpose — the
      // first few paragraphs. Translating all eighteen would be several thousand characters per
      // story on a free endpoint for text most readers skim in the original anyway.
      useEffect(() => {
        if (!item) return;
        const wanted = [item.title, item.summary];
        if (article && article.description) wanted.push(article.description);
        if (article && article.title) wanted.push(article.title);
        if (article && article.paragraphs) wanted.push(...article.paragraphs.slice(0, 3));
        const missing = wanted.filter((text) => isLatinText(text) && !translationOf(news, text));
        if (missing.length) onTranslate(missing);
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [item && item.id, article]);

      const perFeed = (status && status.perFeed) || [];
      const worst = perFeed.length ? perFeed[0].ms : 0;
      const xlateTitle = item ? translationOf(news, item.title) : '';
      // The dek is the article's own description when it has one, and the feed's summary when the
      // page refused to be read. Both are the same thing to a reader: the sentence under the
      // headline.
      const dek = item ? ((article && article.description) || item.summary || '') : '';
      const xlateDek = dek ? translationOf(news, dek) : '';
      const paragraphs = (article && article.paragraphs) || [];
      const trans = (text) => translationOf(news, text);

      return h('div', {
        className: 'wsb-glass wsb-nwPane', 'data-news-pane': 'detail',
        style: { '--wsb-grow': String(grow) },
      },
        h(PaneHead, {
          // 新闻原文, not 详情: the pane's job is the original text, and naming it after what it
          // holds is what makes the two panes distinguishable at a glance.
          title: t.newsOriginal,
          sub: paragraphs.length ? (paragraphs.length + ' ' + t.newsParagraphs) : (status ? (status.total + ' ' + t.newsItems) : ''),
        }),
        h('div', { className: 'wsb-body wsb-nwBody' },
          // The restart notice comes first and replaces the fetch-failure line: the route is
          // missing, so "抓取失败" would be a misleading description of what to do next.
          needsRestart
            ? h('div', { className: 'wsb-nwNote', 'data-tone': 'warn', 'data-news-restart': '1' }, t.newsRestartHint)
            : error
              ? h('div', { className: 'wsb-nwNote', 'data-tone': 'warn' }, t.newsFetchFailed + '：' + error)
              : null,
          !needsRestart && error && news.archive.length ? h('div', { className: 'wsb-nwNote' }, t.newsStale) : null,
          // Two notes that are worth distinguishing: "we stopped waiting" is a normal outcome
          // of a deadline, while "these sources are blocked" is a network-policy problem with a
          // concrete fix. Neither is an error state — the pane is showing real news underneath.
          status && status.timedOut
            ? h('div', { className: 'wsb-nwNote', 'data-news-pending': '1' },
              t.newsTimedOut + (status.pending ? ' · ' + status.pending + ' ' + t.newsPending : ''))
            : null,
          status && status.hint === 'timeout'
            ? h('div', { className: 'wsb-nwNote', 'data-tone': 'warn', 'data-news-hint': 'timeout' }, t.newsProxyHint)
            : null,

          item
            ? h('article', { className: 'wsb-detail', style: { '--wsb-tone': item.accent || 'var(--wsb-c1)' } },
              h('div', { className: 'wsb-detailMeta' },
                h('span', { className: 'wsb-covBadge' }, item.source),
                item.coverage > 1 ? h('span', { className: 'wsb-covBadge' }, item.coverage + ' ' + t.newsHotHint) : null),
              // The headline, at a size a headline deserves rather than the same size as a row.
              h('h1', {
                className: 'wsb-detailTitle',
                'data-latin': isLatinText(item.title) ? 'true' : 'false',
                lang: isLatinText(item.title) ? 'en' : undefined,
              }, item.title),
              // In the stream the translation leads and the original follows; here it is the other
              // way round, because this pane *is* the original — the translation is the annotation.
              xlateTitle
                ? h('div', { className: 'wsb-detailXlate', lang: 'zh-CN' },
                  h('span', { className: 'wsb-xlateTag' }, t.newsTranslatedTag), ' ', xlateTitle)
                : null,
              dek ? h('p', {
                className: 'wsb-detailDek',
                'data-latin': isLatinText(dek) ? 'true' : 'false',
                lang: isLatinText(dek) ? 'en' : undefined,
              }, dek) : null,
              xlateDek ? h('p', { className: 'wsb-detailDek', lang: 'zh-CN' }, xlateDek) : null,
              // The byline row, between two hairlines — the rule that separates a headline block
              // from the body in every newspaper and every news site.
              h('div', { className: 'wsb-byline' },
                article && article.author ? h('b', null, article.author) : null,
                h('span', null, (article && article.site) || item.source),
                h('span', null, newsStamp(item.publishedAt)),
                loadingArticle ? h('span', { className: 'wsb-bylineBusy' }, t.newsEnriching) : null),
              article && article.image
                ? h('figure', { className: 'wsb-detailCover' },
                  h('img', { src: article.image, alt: '', loading: 'lazy', decoding: 'async', referrerPolicy: 'no-referrer' }))
                : null,
              // The body. Paragraphs are rendered one element each — the block rhythm is the
              // layout, and a wall of text in one node is what makes a reader leave.
              paragraphs.length
                ? h('div', { className: 'wsb-article', 'data-news-body': '1' },
                  paragraphs.map((text, index) => h('div', { key: index, className: 'wsb-articleRow' },
                    trans(text)
                      ? h('p', { className: 'wsb-articleText', lang: 'zh-CN', 'data-translated': 'true' }, trans(text))
                      : null,
                    h('p', {
                      className: trans(text) ? 'wsb-articleOrig' : 'wsb-articleText',
                      'data-latin': isLatinText(text) ? 'true' : 'false',
                      lang: isLatinText(text) ? 'en' : undefined,
                    }, text))))
                : null,
              // No body was readable (a paywall, a refusal, or a page that carries its text in
              // something other than <p>). Say so, rather than letting the pane look truncated.
              !paragraphs.length && !loadingArticle && article
                ? h('div', { className: 'wsb-nwNote', 'data-news-nobody': '1' }, t.newsNoBody)
                : null,
              // The translate control stays available even when the list toggle is off: this is
              // the pane where a reader decides whether a story is worth opening.
              isLatinText(item.title) && !xlateTitle
                ? h('div', { className: 'wsb-actions' },
                  h('button', {
                    type: 'button', className: 'wsb-btn', 'data-xlate-detail': '1', disabled: translating,
                    onClick: () => onTranslate([item.title, dek].concat(paragraphs.slice(0, 3))),
                  }, translating ? t.newsTranslating : t.newsTranslateStory))
                : null,

              h('div', { className: 'wsb-actions' },
                h('button', {
                  type: 'button', className: 'wsb-linkBtn', 'data-open-article': '1',
                  onClick: () => onOpen(item.url),
                }, t.newsOpen + ' ↗'),
                h('button', {
                  type: 'button', className: 'wsb-btn', 'data-copy-link': '1',
                  onClick: () => {
                    // `navigator.clipboard` is unavailable on an insecure origin in some
                    // builds; the fallback keeps the button honest either way.
                    const done = () => {
                      setCopied(true);
                      // `window.` rather than the bare global: the plugin's other timers go
                      // through the window so the offline harness's virtual clock can drive
                      // them, and a copy confirmation is not worth an exception to that.
                      safe(() => window.setTimeout(() => setCopied(false), 1600));
                    };
                    safe(() => {
                      if (navigator.clipboard && navigator.clipboard.writeText) {
                        navigator.clipboard.writeText(item.url).then(done, done);
                      } else done();
                    });
                  },
                }, copied ? t.newsCopied : t.newsCopyLink),
                h('a', {
                  className: 'wsb-btn', href: 'https://www.bing.com/news/search?q=' + encodeURIComponent(item.title),
                  target: '_blank', rel: 'noreferrer', 'data-search-title': '1',
                }, t.newsSearchLink)),

              item.related && item.related.length
                ? h('div', { className: 'wsb-nwField' },
                  h('span', null, t.newsRelated + ' · ' + item.related.length),
                  h('div', { className: 'wsb-related' },
                    item.related.map((entry, index) => h('div', {
                      key: entry + index, className: 'wsb-relatedRow',
                    }, h('i', null, '·'), h('span', null, entry)))))
                : null)
            : h('div', { className: 'wsb-nwEmpty' },
              h('b', null, t.newsDetailHint),
              h('span', null, t.newsOriginalHint)),

          perFeed.length
            ? h('div', { className: 'wsb-nwField', style: { marginTop: 4 } },
              h('span', null, t.newsSourceStatus + ' · ' + perFeed.length + ' ' + t.newsTracked),
              h('div', { className: 'wsb-srcReport' },
                perFeed.slice(0, 14).map((feed) => h('div', {
                  key: feed.source, className: 'wsb-srcRow', 'data-bad': feed.error ? 'true' : 'false',
                },
                  h('b', { title: feed.source }, feed.source),
                  h(NewsBar, { value: Math.max(1, feed.ms), max: Math.max(1, worst) }),
                  h('span', null, feed.error
                    ? (feed.error + (feed.items ? ' · ' + feed.items : ''))
                    : (feed.ms + 'ms · ' + feed.items))))))
            : null));
    }

    /**
     * 每日新闻 — the module's whole screen.
     *
     * Three frosted panes like the console, and for the same reason: a topic rail, a reading
     * stream and a detail column answer three different questions and are each worth their own
     * width. The seams between them drag, because a reader's idea of "wide enough" changes with
     * the headline and a fixed split is the one thing every newsreader gets wrong.
     *
     * It follows the desktop exactly as the console does: no background of its own, the shared
     * panel aurora under the same 控制台流光 switch, and the same two-phase entrance.
     */
    function NewsView({ t, lang, module, patchModule, appearance, onBack, anim, screenStyle, onAnimEnd }) {
      const data = useNewsData(module, patchModule);
      const { news, busy, error, status, needsRestart, translating, translateNote, refresh, translate, toggleTranslate, resolveImages } = data;
      const [selectedId, setSelectedId] = useState('');
      const gridRef = useRef(null);
      const dragRef = useRef(null);

      const patchNews = useCallback((mutate) => patchModule(module.id, (target) => {
        const settings = normalizeNewsSettings(target.news);
        mutate(settings);
        target.news = settings;
      }), [module.id, patchModule]);

      const openExternal = useCallback((url) => {
        if (!url) return;
        safe(() => { window.open(url, '_blank', 'noopener,noreferrer') });
      }, []);

      // Display window: the module keeps 7 days, the reader sees as much of it as they asked
      // for. Filtering here (not in the fetch) is what makes the 1/3/7 day chips instant.
      const cutoff = Date.now() - news.days * 86400000;
      const items = useMemo(() => news.archive
        .filter((item) => item.publishedAt >= cutoff)
        .filter((item) => item.topicId === news.activeId)
        .sort((a, b) => b.publishedAt - a.publishedAt)
        .slice(0, news.count), [news.archive, news.activeId, news.count, cutoff]);

      /**
       * The broadcast strip's selection: the newest stories, across every topic.
       *
       * This replaced a 大事件 filter (three or more outlets, ordered by coverage). A *bulletin*
       * asks the opposite question — what just happened, anywhere — so the coverage threshold
       * survives where it belongs, as the badge rule in the ticker: a story is only *labelled*
       * 大事件 when three outlets carried it. The old filter and the new badge ask the same
       * question at different strengths, and the weaker one is the honest one here.
       *
       * It sits above the render for one reason: the image hunt needs it, and that hook runs
       * before the strip is built.
       */
      const broadcast = useMemo(() => news.archive
        .filter((item) => item.title && item.url)
        .slice()
        .sort((a, b) => b.publishedAt - a.publishedAt)
        .slice(0, NEWS_TICKER_ITEMS), [news.archive]);

      const selected = useMemo(() => items.find((item) => item.id === selectedId)
        || news.archive.find((item) => item.id === selectedId) || null, [items, news.archive, selectedId]);

      const activeTopic = news.topics.find((topic) => topic.id === news.activeId) || news.topics[0];

      // Open on the lead story rather than on an empty reading pane.
      //
      // Two things this fixes: a 原文 pane that starts as a hint is a wasted pane — the reader has
      // to click before the layout makes sense — and switching sections used to leave the previous
      // topic's story selected, so the 原文 pane showed something unrelated to the list beside it.
      // Auto-selecting does NOT mark anything read: only an explicit click does.
      useEffect(() => {
        if (!items.length) return;
        if (items.some((item) => item.id === selectedId)) return;
        setSelectedId(items[0].id);
      }, [items, selectedId]);

      useVisibleTranslation(items, news, news.translate === true, translate);
      useVisibleImages(items, broadcast, resolveImages);

      // Phase 2 of the arrival, exactly as the console does it: the content sweep arms once the
      // screen's own fade has settled, and the flag lives on this screen so the rule can never
      // reach the home screen's cards behind it.
      const [sweep, setSweep] = useState(false);
      useEffect(() => {
        if (sweep) return undefined;
        if (anim !== undefined && anim !== null && anim !== '') return undefined;
        setSweep(true);
        return undefined;
      }, [anim, sweep]);

      // Keyboard: 1/2/3 pick the window, r refreshes, j/k walk the stream, t toggles 中文对照.
      // Bound to the screen element rather than the document so it cannot fire while the console
      // is behind it, and skipped while a field has focus.
      useEffect(() => {
        const onKey = (event) => {
          const target = event.target;
          if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
          if (event.metaKey || event.ctrlKey || event.altKey) return;
          if (event.key === 'r' || event.key === 'R') { event.preventDefault(); refresh({ force: true }); return }
          if (event.key === 't' || event.key === 'T') { event.preventDefault(); toggleTranslate(news.translate !== true); return }
          if (event.key === '1' || event.key === '3' || event.key === '7') {
            event.preventDefault();
            patchNews((settings) => { settings.days = Number(event.key) });
            return;
          }
          if (event.key === 'j' || event.key === 'k') {
            if (!items.length) return;
            event.preventDefault();
            const at = items.findIndex((item) => item.id === selectedId);
            const next = event.key === 'j' ? Math.min(items.length - 1, at + 1) : Math.max(0, at - 1);
            setSelectedId(items[next < 0 ? 0 : next].id);
          }
        };
        const node = gridRef.current;
        const root = node && node.closest ? node.closest('.wsb-screen') : null;
        const host = root || window;
        host.addEventListener('keydown', onKey);
        return () => host.removeEventListener('keydown', onKey);
      }, [items, selectedId, refresh, patchNews, toggleTranslate, news.translate]);

      // Pane seams. Pointer capture keeps the drag alive past the 10 px handle, and the drag
      // writes `--wsb-grow` straight onto the three pane elements — no React state, so moving a
      // seam never re-renders the up-to-100 cards in the stream. The committed value lands in
      // `news.cols` on pointer-up, which is what survives a reload.
      const paneNodes = () => {
        const node = gridRef.current;
        if (!node || !node.querySelectorAll) return [];
        return [...node.querySelectorAll('[data-news-pane]')];
      };
      const applyGrow = (values) => {
        const nodes = paneNodes();
        for (let index = 0; index < nodes.length && index < values.length; index += 1) {
          nodes[index].style.setProperty('--wsb-grow', values[index].toFixed(4));
        }
      };
      const startDrag = (which) => (event) => {
        event.preventDefault();
        const node = gridRef.current;
        if (!node) return;
        dragRef.current = { which, box: node.getBoundingClientRect(), cols: news.cols.slice() };
        safe(() => event.currentTarget.setPointerCapture(event.pointerId));
        const handle = event.currentTarget;
        if (handle && handle.setAttribute) handle.setAttribute('data-drag', 'true');
      };
      const moveDrag = (event) => {
        const drag = dragRef.current;
        if (!drag) return;
        // One seam between two panes, so the arithmetic is one subtraction rather than a cascade
        // of three: the boundary is the stream's share, and the reading column takes the rest.
        const usable = Math.max(1, drag.box.width - 10);
        const at = Math.min(drag.box.right, Math.max(drag.box.left, event.clientX));
        const ratio = (at - drag.box.left) / usable;
        const left = Math.min(0.86, Math.max(0.28, ratio));
        drag.live = [left, 1 - left];
        applyGrow(drag.live);
      };
      const endDrag = (event) => {
        const drag = dragRef.current;
        dragRef.current = null;
        const handle = event && event.currentTarget;
        if (handle && handle.removeAttribute) handle.removeAttribute('data-drag');
        if (!drag || !drag.live) return;
        const live = drag.live;
        patchNews((settings) => { settings.cols = live });
      };

      const readMark = news.seen || {};
      const markRead = (id) => patchNews((settings) => {
        settings.seen = Object.assign({}, settings.seen, { [id]: Date.now() });
        // The read map is trimmed by age so a long-lived install does not accumulate one key
        // per headline ever seen.
        const cutoffSeen = Date.now() - NEWS_KEEP_DAYS * 86400000;
        settings.seen = Object.fromEntries(Object.entries(settings.seen).filter(([, when]) => when >= cutoffSeen));
      });

      const failing = status && status.errors ? status.errors.length : 0;
      const span = status && status.span ? status.span : null;
      const spanDays = span && span.oldest ? Math.max(0.04, (Date.now() - span.oldest) / 86400000) : 0;
      const archiveDays = news.archive.length
        ? Math.max(0.04, (Date.now() - news.archive[news.archive.length - 1].publishedAt) / 86400000)
        : 0;
      const cols = news.cols && news.cols.length === 2 ? news.cols : defaultNewsSettings().cols;
      const translateOn = news.translate === true;
      const untranslated = translateOn
        ? items.filter((item) => isLatinText(item.title) && !translationOf(news, item.title)).length
        : 0;

      // Built as named locals rather than one nested expression. A four-level element tree is
      // where a missing bracket hides, and this screen is the largest single expression in the
      // plugin — the locals cost nothing at runtime and make the structure readable.

      const head = h('div', { className: 'wsb-nwHead' },
        h('button', {
          type: 'button', className: 'wsb-backBtn', 'data-news-back': '1',
          title: t.panel, 'aria-label': t.panel, onClick: onBack,
        }, h('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' }, h('path', { d: 'M14.5 6 8.5 12l6 6' }))),
        h(ModuleBackdrop, { t, module, onPatch: patchModule }),
        h('div', { className: 'wsb-nwTitle', style: { flex: '1 1 auto', minWidth: '0' } },
          h('b', null, t.newsTitle),
          h('em', { className: 'wsb-titleAbbr' }, MODULE_ABBR[module.kind] || ''),),
        h('span', {
          className: 'wsb-nwLive', title: t.newsArchiveHint,
          // 控件排右对齐：从这一项起（含它）之后的兄弟元素一起被推到右侧。
          style: { marginLeft: 'auto' },
        },
          h('i'), news.lastFetchAt ? newsAge(news.lastFetchAt, t) : t.newsLoading),

        // The count dial. 10 to 100, dragged; the fill percentage is a CSS variable so the
        // track reads as a real control rather than a browser default.
        h('span', { className: 'wsb-nwGroup' },
          h('span', { className: 'wsb-dial', title: t.newsCountHint },
            h('label', null, t.newsCount),
            h('input', {
              className: 'wsb-range', type: 'range', min: NEWS_MIN, max: NEWS_MAX, step: 5,
              value: news.count, 'data-news-count': '1',
              'aria-label': t.newsCount,
              style: { '--wsb-fill': (((news.count - NEWS_MIN) / (NEWS_MAX - NEWS_MIN)) * 100).toFixed(1) + '%' },
              onChange: (event) => patchNews((settings) => {
                settings.count = clamp(Number(event.target.value), NEWS_MIN, NEWS_MAX);
              }),
            }),
            h('output', null, news.count))),

        h('span', { className: 'wsb-nwGroup' },
          h('span', { className: 'wsb-seg', 'data-news-days': '1' },
            [[1, t.newsDays1], [3, t.newsDays3], [7, t.newsDays7]].map(([days, label]) => h('button', {
              key: days, type: 'button', className: 'wsb-segBtn', 'data-news-day': String(days),
              'data-on': news.days === days ? 'true' : 'false',
              onClick: () => patchNews((settings) => { settings.days = days }),
            }, label)))),

        h('span', { className: 'wsb-nwGroup' },
          h('span', { className: 'wsb-seg', 'data-news-views': '1' },
            [['list', t.newsViewList], ['grid', t.newsViewGrid], ['compact', t.newsViewCompact]]
              .map(([view, label]) => h('button', {
                key: view, type: 'button', className: 'wsb-segBtn', 'data-news-view': view,
                'data-on': news.view === view ? 'true' : 'false',
                onClick: () => patchNews((settings) => { settings.view = view }),
              }, label)))),

        h('span', { className: 'wsb-nwGroup' },
          // 中文对照. Off by default would be the cautious choice; on is the useful one, because
          // a reader who cannot read the English will not go looking for a switch to fix that.
          h('button', {
            type: 'button', className: 'wsb-btn wsb-transToggle', 'data-news-translate': '1',
            'data-on': translateOn ? 'true' : 'false',
            'aria-pressed': translateOn ? 'true' : 'false',
            title: t.newsTranslateHint,
            onClick: () => toggleTranslate(!translateOn),
          }, (translating ? '◌ ' : '译 ') + t.newsTranslateToggle
            + (translateOn && untranslated ? ' ' + untranslated : '')),
          h('button', {
            type: 'button', className: 'wsb-btn wsb-refresh', 'data-busy': busy ? 'true' : 'false',
            'data-news-refresh': '1', disabled: busy,
            onClick: () => refresh({ force: true }),
          },
            h('svg', {
              className: 'wsb-spin', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
              strokeWidth: 2, strokeLinecap: 'round',
            }, h('path', { d: 'M20 12a8 8 0 1 1-2.34-5.66' }), h('path', { d: 'M20 4v4h-4' })),
            busy ? t.newsRefreshing : t.newsRefresh)));

      // The provenance line is prose, not a panel: one muted row instead of a bordered box
      // competing with the panes. The honest numbers are the ones that are cheap to get wrong.
      const statusParts = [
        status ? status.shown + '/' + status.total + ' ' + t.newsItems
          : news.archive.length + ' ' + t.newsItems,
        t.newsArchive + ' ' + archiveDays.toFixed(1) + ' ' + t.newsDayUnit,
        status ? status.feeds + ' ' + t.newsTracked : '—',
        status ? status.tookMs + 'ms' : '',
        failing ? failing + ' ' + t.newsErrors : '',
        status && status.pending ? status.pending + ' ' + t.newsPending : '',
        t.newsRetention,
        spanDays ? t.newsCoverage + ' ' + spanDays.toFixed(1) + ' ' + t.newsDayUnit : '',
        translateOn && news.translated ? Object.keys(news.translated).length + ' ' + t.newsTranslatedCount : '',
      ].filter(Boolean);
      const statusLine = h('div', { className: 'wsb-nwStatus', 'data-news-status': '1' },
        statusParts.map((part, index) => h('span', { key: index }, part)));

      // 大事件 rail: coverage bars grow from the left to each story's real outlet count, the
      // same "measure, then fill" idiom as the console's bars — a compositor-only scaleX.
      /**
       * The broadcast strip.
       *
       * Selection changed with the behaviour. This was the 大事件 rail: only stories that three or
       * more outlets carried, filtered by coverage. A *bulletin* asks the opposite question — what
       * just happened, anywhere — so the strip now carries the newest stories across every topic,
       * and the coverage threshold survives where it belongs, as the **badge rule**: a story is
       * only *labelled* 大事件 when three outlets carried it. The old filter and the new badge ask
       * the same question at different strengths, and the weaker one is the honest one here.
       *
       * The ticker is one track holding the items twice, translated by exactly -50%, so the loop
       * has no seam. The second copy is \`aria-hidden\` and untabbable, so a screen reader and the
       * tab order each meet the bulletin once.
       */

      // A constant reading speed, not a constant duration: the loop advances one card per
      // NEWS_TICKER_PPS seconds, so a longer bulletin takes proportionally longer instead of
      // racing. Derived from the count because the card width is fixed — no layout read at all.
      const tickerSeconds = Math.max(30, Math.round(broadcast.length * (246 + 8) / NEWS_TICKER_PPS));
      const tickerCard = (item, index, copy) => h('button', {
        key: copy + '-' + item.id, type: 'button', className: 'wsb-hotCard',
        'data-hot': item.id,
        'data-copy': String(copy),
        // What the eyebrow line says: a multi-outlet story is labelled 大事件, everything else
        // names its source. On the card rather than only in the markup because it is the
        // contract — and because the label is what a reader takes away from the strip.
        'data-label': item.coverage >= NEWS_HOT_MIN ? 'hot' : 'source',
        'data-hasimage': item.image ? 'true' : 'false',
        'data-on': item.id === selectedId ? 'true' : 'false',
        // The travelling copy is decoration: the first copy is the real, focusable, clickable one.
        tabIndex: copy ? -1 : 0,
        'aria-hidden': copy ? 'true' : undefined,
        style: { '--wsb-tone': item.accent || 'var(--wsb-c1)' },
        onClick: () => { setSelectedId(item.id); markRead(item.id) },
      },
        item.image
          ? h('span', { className: 'wsb-hotPic', 'aria-hidden': 'true' },
            h('img', { src: item.image, alt: '', loading: 'lazy', decoding: 'async', referrerPolicy: 'no-referrer' }))
          : null,
        h('span', { className: 'wsb-hotBody' },
          h('span', { className: 'wsb-hotTop' },
            // A multi-outlet story keeps the coverage badge; everything else says where it came
            // from, which is what a bulletin is for.
            item.coverage >= NEWS_HOT_MIN
              ? h('span', { className: 'wsb-hotBadge' }, item.coverage + ' ' + t.newsHotHint)
              : h('span', {
                className: 'wsb-hotBadge',
                style: { color: 'var(--dsw-alias-label-secondary)' },
              }, firstLine(item.source, 14)),
            h('span', null, newsAge(item.publishedAt, t))),
          h('span', { className: 'wsb-hotTitle' }, translationOf(news, item.title) || item.title),
          h('span', { className: 'wsb-hotBar' },
            h('i', {
              style: {
                animationDelay: index * 24 + 'ms',
                transform: 'scaleX(' + Math.min(1, Math.max(item.coverage, 1) / 12).toFixed(2) + ')',
              },
            }))));

      const hotRail = broadcast.length
        ? h('div', {
          className: 'wsb-hotRail', 'data-news-hot': '1', 'data-ticker': '1',
          style: { '--wsb-ticker-dur': tickerSeconds + 's' },
          'aria-label': t.newsTickerLabel,
        },
          // The standing label, outside the travelling viewport.
          h('span', { className: 'wsb-tickerLead' }, h('i'), t.newsTickerLabel),
          h('div', { className: 'wsb-tickerView', 'data-ticker-view': '1' },
            h('div', { className: 'wsb-tickerTrack', 'data-ticker-track': '1' },
              // Both copies come from the same expression, so the two halves of the track stay
              // identical — which is what makes the -50% seam invisible. The travelling copy is
              // decoration: hidden from assistive tech and out of the tab order.
              [0, 1].map((copy) => h('span', {
                key: 'copy-' + copy, style: { display: 'contents' },
              }, broadcast.map((item, index) => tickerCard(item, index, copy)))))))
        : null;

      const emptyCard = h('div', { className: 'wsb-nwEmpty' },
        h('b', null, news.archive.length ? t.newsEmptyTopic : t.newsEmpty),
        busy ? h('span', null, t.newsLoadingHint) : null,
        h('button', {
          type: 'button', className: 'wsb-btn', 'data-news-refresh': '2', disabled: busy,
          onClick: () => refresh({ force: true }),
        }, busy ? t.newsRefreshing : t.newsRefresh));
      /**
       * The front page.
       *
       * `lead` gets one story, `duo` the next two side by side, and everything else reads as
       * rows — the shape every newspaper front page and every news app converges on, because it
       * answers "what matters most" with size instead of with a badge. Below three stories there
       * is nothing to rank, so the tiers collapse to plain rows and the pane stays honest.
       */
      const tierOf = (index) => {
        if (news.view !== 'list') return news.view === 'grid' ? 'grid' : 'list';
        if (items.length < 3) return 'list';
        if (index === 0) return 'lead';
        if (index <= 2) return 'secondary';
        return 'list';
      };
      const storyOf = (item, index) => h(NewsItem, {
        key: item.id, t, item, index, tier: tierOf(index),
        active: item.id === selectedId,
        read: Boolean(readMark[item.id]),
        translated: translationOf(news, item.title),
        translations: news.translated,
        translating,
        onSelect: (id) => { setSelectedId(id); markRead(id) },
        onOpen: openExternal,
        onTranslate: translate,
      });
      // The dateline is the masthead of the reading pane: a date, a section name, and how much of
      // the archive is being shown. In the grid density the cards carry their own labels and a
      // band above them would just be a second title.
      const dateline = news.view === 'grid' ? null : h('div', { className: 'wsb-dateline', 'data-news-dateline': '1' },
        h('b', null, newsDateLabel(lang)),
        h('span', null, activeTopic ? activeTopic.name : ''),
        h('i', null, items.length + ' / ' + news.count + ' ' + t.newsItems));

      const duo = [];
      const rows = [];
      items.forEach((item, index) => {
        const node = storyOf(item, index);
        const tier = tierOf(index);
        if (tier === 'secondary') duo.push(node);
        else if (tier !== 'lead') rows.push(node);
      });

      const streamBody = h('div', { className: 'wsb-body wsb-nwBody', 'data-flush': 'true' },
        hotRail,
        busy && !news.archive.length
          ? h('div', { style: { padding: '10px 12px' } }, h(NewsSkeleton, { count: 5 }))
          : items.length
            ? h('div', { className: 'wsb-stream', 'data-view': news.view, 'data-news-stream': '1' },
              dateline,
              tierOf(0) === 'lead' ? storyOf(items[0], 0) : null,
              duo.length ? h('div', { className: 'wsb-duo', 'data-news-duo': '1' }, duo) : null,
              rows)
            : h('div', { style: { padding: '10px 12px' } }, emptyCard));

      const streamPane = h('div', {
        className: 'wsb-glass wsb-nwPane', 'data-news-pane': 'stream',
        style: { '--wsb-grow': String(cols[0]) },
      },
        h(PaneHead, {
          // Renamed from the topic's own name: the topic is now shown marked as selected in the
          // nav bar directly above, so repeating it here would spend the pane's title on a
          // duplicate. This pane is the 速览 — the survey you scan before choosing.
          title: t.newsSurvey,
          sub: items.length + ' / ' + (activeTopic
            ? activeTopic.kw.length + ' kw · ' + activeTopic.feeds.length + ' ' + t.newsTracked
            : ''),
        }),
        streamBody);

      const seam = (which) => h('div', {
        className: 'wsb-split', 'data-split': String(which), title: t.newsDragHint,
        onPointerDown: startDrag(which), onPointerMove: moveDrag, onPointerUp: endDrag,
        onPointerCancel: endDrag,
        onDoubleClick: () => patchNews((settings) => { settings.cols = defaultNewsSettings().cols }),
      });

      const detailPane = h(NewsDetailPane, {
        t, news, item: selected, status, busy, error, needsRestart, translating, lang,
        onOpen: openExternal, onTranslate: translate, grow: cols[1],
      });

      const notice = translateNote
        ? h('div', { className: 'wsb-nwStatus', 'data-news-xlate-note': '1' },
          h('span', null, t.newsTranslateFailed + ' ' + translateNote))
        : null;

      return h('div', {
        className: 'wsb-screen', 'data-role': 'news', 'data-anim': anim, style: screenStyle,
        'data-sweep': sweep ? 'go' : 'done',
        onAnimationEnd: (event) => { if (event.target === event.currentTarget) onAnimEnd() },
      },
        // The same shell as the console: the shared padding and the shared panel aurora, so the
        // desktop's background and the 控制台流光 switch both apply here unchanged.
        h('div', { className: 'wsb-root' },
          appearance && appearance.consoleAurora === false
            ? null
            : h('div', { className: 'wsb-consoleAurora', 'aria-hidden': 'true' }, h(AuroraBlobs, null)),
          h('div', { className: 'wsb-news' },
            head,
            // The topic switcher is a nav bar above the panes, not a third column: it is used
            // once per session and was costing the news a third of the width for the privilege.
            h(NewsNav, { t, news, module, patchModule, stats: status }),
            statusLine,
            notice,
            h('div', { ref: gridRef, className: 'wsb-nwGrid', 'data-news-grid': '1' },
              streamPane,
              seam(0),
              detailPane))));
    }

    //#endregion

    //#region 股票市场 (stock market board)

    /** 涨 / 跌 / 平 — the one classification every presentation of these numbers needs. */
    function stockDir(change) {
      if (typeof change !== 'number' || !Number.isFinite(change) || change === 0) return 'flat';
      return change > 0 ? 'up' : 'down';
    }

    /** How long ago a quote was read, in the reader's own language. */
    function stockAge(stamp, t) {
      if (!stamp) return '';
      const seconds = Math.max(0, (Date.now() - stamp) / 1000);
      if (seconds < 90) return t.stockJustNow || '刚刚';
      const minutes = seconds / 60;
      if (minutes < 60) return Math.round(minutes) + (t.stockMinAgo || ' 分钟前');
      return Math.round(minutes / 60) + (t.stockHourAgo || ' 小时前');
    }

    /**
     * A level, formatted to the market's own precision.
     *
     * `toLocaleString` rather than `toFixed` because 49313.44 and 209066.9 are read by comparing
     * digit groups, not by reading every digit — and `tabular-nums` in the CSS only lines the
     * columns up once the separator is there.
     */
    function stockPrice(value, decimals, lang) {
      if (typeof value !== 'number' || !Number.isFinite(value)) return null;
      const places = Number.isFinite(decimals) ? decimals : 2;
      try {
        return value.toLocaleString(lang === 'en' ? 'en-US' : 'zh-CN', {
          minimumFractionDigits: places, maximumFractionDigits: places,
        });
      } catch { return value.toFixed(places) }
    }

    /** A change, always signed — the sign is the whole message. */
    function stockDelta(value, decimals, lang) {
      if (typeof value !== 'number' || !Number.isFinite(value)) return null;
      const body = stockPrice(Math.abs(value), decimals, lang);
      return (value > 0 ? '+' : value < 0 ? '−' : '') + body;
    }

    /**
     * 当日走势: the intraday shape, drawn from the quote response's own series.
     *
     * One polyline and one fill, no axes, no grid, no labels — at 30 px tall a chart with axes is
     * a chart nobody can read, whereas a shape is read instantly. Rendered with
     * `preserveAspectRatio="none"` so it stretches to whatever width the tile has, and
     * so the stroke is measured in the stretched space rather than pinned to device pixels — a
     *  deliberate trade, because the suite bans a non-scaling stroke outright (it would break the
     *  tile marks' `pathLength` pen animation) and a 30 px sparkline cannot show the difference.
     *
     * Fewer than two points draws nothing at all: the fallback source answers a snapshot with no
     * series, and a flat line invented from one number would be a lie about the shape.
     */
    function StockSpark({ points }) {
      if (!Array.isArray(points) || points.length < 2) return null;
      const min = Math.min.apply(null, points);
      const max = Math.max.apply(null, points);
      const span = max - min || 1;
      const width = 100;
      const height = 30;
      const step = width / (points.length - 1);
      const coords = points.map((point, index) => [
        index * step,
        height - 2 - ((point - min) / span) * (height - 4),
      ]);
      const line = coords.map(([x, y], index) => (index ? 'L' : 'M') + x.toFixed(2) + ' ' + y.toFixed(2)).join('');
      return h('svg', {
        className: 'wsb-stkSpark', viewBox: '0 0 100 30', preserveAspectRatio: 'none',
        'aria-hidden': 'true', focusable: 'false',
      },
        h('path', { className: 'wsb-stkArea', d: line + 'L' + width + ' ' + height + 'L0 ' + height + 'Z', fill: 'currentColor' }),
        h('path', { className: 'wsb-stkLine', d: line, stroke: 'currentColor' }));
    }

    /** The one time label a row gets, chosen by what its source could actually tell us. */
    function stockTimeLabel(row, t) {
      if (row.time) {
        const at = new Date(row.time);
        const pad = (value) => String(value).padStart(2, '0');
        return t.stockDataTime + ' ' + pad(at.getHours()) + ':' + pad(at.getMinutes());
      }
      // 腾讯's stamp is the exchange's own wall clock with no offset in it, so it is shown as the
      // exchange's local time rather than converted into a local instant we cannot compute.
      if (row.timeText) return t.stockLocalTime + ' ' + row.timeText;
      return '';
    }

    /**
     * The market board's data layer: catalog, quotes, the snapshot, and the refresh timer.
     *
     * @param {object} module - the stock module; `patchModule` writes back into its `stock` field.
     */
    function useStockData(module, patchModule) {
      const stock = module.stock || defaultStockSettings();
      const [busy, setBusy] = useState(false);
      const [error, setError] = useState('');
      // A 404 here means the Host half that owns the route is not the version on disk yet — Host
      // code is read once at process start, so after an update the browser half is live while the
      // route is still missing. That is a different problem with a different fix (restart DSH),
      // so it is tracked separately rather than folded into `error`.
      const [needsRestart, setNeedsRestart] = useState(false);
      const [status, setStatus] = useState(null);
      const inflight = useRef(false);
      // The selection as it is NOW, not as it was when the callback was built: the catalog
      // adoption below fires a refresh in the same microtask as its state update.
      const nowRef = useRef(stock.markets);
      nowRef.current = stock.markets;

      const refresh = useCallback((options) => {
        if (inflight.current) return Promise.resolve();
        inflight.current = true;
        setBusy(true);
        setError('');
        const want = options || {};
        const payload = { ids: want.ids || nowRef.current, refresh: Boolean(want.force) };
        return fetch(STOCK_ROUTE, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-workbench-client': 'stock' },
          body: JSON.stringify(payload),
        })
          .then((response) => {
            if (response.ok) return response.json();
            if (response.status === 404) {
              setNeedsRestart(true);
              throw new Error('HTTP 404');
            }
            throw new Error('HTTP ' + response.status);
          })
          .then((result) => {
            if (!result || !result.ok) throw new Error((result && result.error) || '抓取失败');
            const now = Date.now();
            setNeedsRestart(false);
            setStatus(result.stats || null);
            patchModule(module.id, (target) => {
              const settings = normalizeStockSettings(target.stock);
              settings.last = Array.isArray(result.quotes) ? result.quotes : [];
              settings.lastFetchAt = now;
              target.stock = settings;
            });
          })
          .catch((failure) => {
            setError(String((failure && failure.message) || failure));
          })
          .then(() => {
            inflight.current = false;
            setBusy(false);
          });
      }, [module.id, patchModule]);

      // Open: fetch when the snapshot is missing or old, then keep asking while this pane is
      // mounted. The interval's cleanup is what makes a closed module cost nothing — the module
      // never asks in the background, so there is nothing to pause.
      useEffect(() => {
        const last = Number(stock.lastFetchAt) || 0;
        if (!stock.last.length || Date.now() - last > STOCK_REFRESH_MS) refresh({ force: true });
        const timer = setInterval(() => {
          // A hidden tab is not being read, and a quote endpoint that gets polled by a tab nobody
          // is looking at is how a free source starts refusing us.
          if (typeof document !== 'undefined' && document.hidden) return;
          refresh({ force: true });
        }, STOCK_REFRESH_MS);
        // `unref` when the runtime has it, which means Node. A browser's `setInterval` returns a
        // number and has no such method, so this is a no-op there — but in Node it is the
        // difference between a background poll and a process that will not exit: the suite renders
        // this pane and never unmounts it, so an un-unref'd interval made the whole test run hang
        // after its last assertion. "Keep polling while the pane is open, but do not let the poll
        // alone keep the process alive" is exactly what `unref` says.
        if (timer && typeof timer.unref === 'function') timer.unref();
        return () => clearInterval(timer);
      }, [module.id]);

      // Adopt the Host's catalog once per six hours. It refreshes the market *names and regions*
      // only: the reader's selection is their own, and silently replacing it with the shipped
      // defaults would undo the picker every time this ran.
      useEffect(() => {
        if (Date.now() - (stock.catalogAt || 0) < 6 * 3600 * 1000) return undefined;
        let alive = true;
        fetch(STOCK_ROUTE + '?op=catalog', { headers: { 'x-workbench-client': 'stock' } })
          .then((response) => (response.ok ? response.json() : Promise.reject(new Error('HTTP ' + response.status))))
          .then((result) => {
            if (!alive || !result || !result.ok || !Array.isArray(result.markets) || !result.markets.length) return;
            patchModule(module.id, (target) => {
              const settings = normalizeStockSettings(target.stock);
              settings.catalog = result.markets.map((market) => ({
                id: market.id, name: market.name, region: market.region, fallback: market.fallback === true,
              }));
              settings.catalogAt = Date.now();
              target.stock = settings;
            });
          })
          .catch(() => { /* the mirror already renders the picker; a stale one is not an error */ });
        return () => { alive = false };
      }, [module.id, stock.catalogAt, patchModule]);

      return { stock, busy, error, status, needsRestart, refresh };
    }

    /** One market as a tile: name, level, change, session, and the day's shape. */
    function StockTile({ t, lang, row, index }) {
      const dir = stockDir(row.change);
      const price = stockPrice(row.price, row.decimals, lang);
      const change = stockDelta(row.change, row.decimals, lang);
      const pct = typeof row.pct === 'number' && Number.isFinite(row.pct)
        ? (row.pct > 0 ? '+' : row.pct < 0 ? '−' : '') + Math.abs(row.pct).toFixed(2) + '%' : null;
      const time = stockTimeLabel(row, t);
      return h('div', {
        className: 'wsb-glass wsb-stkTile', 'data-stock-tile': row.id, 'data-dir': dir,
        'data-stale': row.stale ? 'true' : 'false',
        style: { '--wsb-i': String(index) },
      },
        h('div', { className: 'wsb-stkTop' },
          h('span', { className: 'wsb-stkName', title: row.name }, row.name),
          row.region ? h('span', { className: 'wsb-stkRegion' }, row.region) : null,
          row.session === 'open'
            ? h('span', { className: 'wsb-stkBadge', 'data-live': 'open' }, t.stockSessionOpen)
            : row.session === 'closed'
              ? h('span', { className: 'wsb-stkBadge' }, t.stockSessionClosed)
              : null),
        h('div', { className: 'wsb-stkPrice' }, price === null ? t.stockNoPrice : price),
        h('div', { className: 'wsb-stkDelta' },
          change === null ? null : h('b', null, change),
          pct === null ? null : h('span', null, pct)),
        h(StockSpark, { points: row.spark }),
        h('div', { className: 'wsb-stkFoot' },
          h('span', { title: row.stale ? t.stockStaleHint : '' }, time),
          row.source === 'tencent' ? h('span', { className: 'wsb-stkSrc', title: t.stockFallbackHint }, t.stockFallbackTag) : null,
          row.stale ? h('span', { className: 'wsb-stkSrc' }, t.stockStaleRow) : null));
    }

    /** The same rows as one dense table — the reading mode for comparing rather than scanning. */
    function StockTable({ t, lang, rows }) {
      return h('table', { className: 'wsb-stkTable', 'data-stock-table': '1' },
        h('thead', null, h('tr', null,
          h('th', null, t.stockMarkets),
          h('th', null, t.stockPrice),
          h('th', null, t.stockChange),
          h('th', null, t.stockPct),
          h('th', null, t.stockPrev),
          h('th', null, t.stockSparkHint),
          h('th', null, t.stockDataTime))),
        h('tbody', null, rows.map((row) => {
          const dir = stockDir(row.change);
          const time = stockTimeLabel(row, t);
          return h('tr', {
            key: row.id, 'data-stock-row': row.id, 'data-dir': dir,
            'data-stale': row.stale ? 'true' : 'false',
          },
            h('td', null,
              h('b', null, row.name),
              row.region ? h('span', { className: 'wsb-stkRegion', style: { marginLeft: '7px' } }, row.region) : null),
            h('td', { 'data-num': '1' }, stockPrice(row.price, row.decimals, lang) || t.stockNoPrice),
            h('td', { 'data-num': '1' }, stockDelta(row.change, row.decimals, lang) || t.stockNoPrice),
            h('td', { 'data-num': '1' }, typeof row.pct === 'number' && Number.isFinite(row.pct)
              ? (row.pct > 0 ? '+' : row.pct < 0 ? '−' : '') + Math.abs(row.pct).toFixed(2) + '%'
              : t.stockNoPrice),
            h('td', null, stockPrice(row.prev, row.decimals, lang) || t.stockNoPrice),
            h('td', null, h(StockSpark, { points: row.spark })),
            h('td', null, time));
        })));
    }

    /**
     * 选择要显示的市场: the picker, floated above the board rather than in a third column.
     *
     * Opening the editor must not reflow the numbers being read — the same rule the news module's
     * topic editor follows, for the same reason. Grouped by region because the catalog's own
     * grouping is the only one that stays true as markets are added.
     */
    function StockPicker({ t, stock, onToggle, onDone }) {
      const chosen = new Set(stock.markets);
      return h('div', { className: 'wsb-glass wsb-stkPicker', 'data-stock-picker': '1' },
        h('div', { className: 'wsb-stkPickerHead' },
          h('b', null, t.stockEditMarkets),
          h('span', null, chosen.size + ' ' + t.stockSelectedN + ' · ' + t.stockMinHint + ' · ' + t.stockPickHint),
          h('button', { type: 'button', className: 'wsb-btn', 'data-stock-done': '1', onClick: onDone }, t.stockDone)),
        STOCK_SEED_REGIONS.map((region) => {
          const markets = stock.catalog.filter((market) => market.region === region);
          if (!markets.length) return null;
          return h('div', { key: region, className: 'wsb-stkPickRegion' },
            h('i', null, region),
            h('div', { className: 'wsb-stkPickRow' }, markets.map((market) => h('button', {
              key: market.id, type: 'button', 'data-stock-pick': market.id,
              'data-on': chosen.has(market.id) ? 'true' : 'false',
              // Title carries the fallback fact: a market the no-proxy source can answer is a
              // different promise from one that needs the proxy, and that is worth knowing before
              // picking it on a machine with no proxy.
              title: market.fallback ? t.stockFallbackHint : '',
              onClick: () => onToggle(market.id),
            }, market.name))));
        }));
    }

    /**
     * 股票市场 — the market board.
     *
     * Same shell as the console and the news reader on purpose: `data-role="stock"` → `.wsb-root`
     * → the optional shared aurora → content. So the desktop background shows through, the
     * 控制台流光 switch applies unchanged, and every colour comes from the host tokens.
     */
    //#region 板块成分股（点进某个市场）

    /**
     * 十进制定点格式化 —— 全程避开 `toLocaleString`。
     *
     * 不是洁癖：这台机器上 Hermes/V8 的 `toLocaleString` 在包裹层里做过一次代理（本文件别处
     * 因为同一类问题改写过日期格式化），一旦它在某个环境里抛错，整个板块视图就打不开。整数
     * 部分自己加千分位只有十来行，换来的是这块功能在任何环境都能显示。
     */
    function mkFixed(value, digits) {
      const number = Number(value);
      if (!Number.isFinite(number)) return '—';
      const places = Math.max(0, Math.min(6, Number(digits) || 0));
      const negative = number < 0;
      const text = Math.abs(number).toFixed(places);
      const dot = text.indexOf('.');
      const whole = dot < 0 ? text : text.slice(0, dot);
      const fraction = dot < 0 ? '' : text.slice(dot);
      let grouped = '';
      for (let index = 0; index < whole.length; index += 1) {
        if (index > 0 && (whole.length - index) % 3 === 0) grouped += ',';
        grouped += whole[index];
      }
      return (negative ? '-' : '') + grouped + fraction;
    }

    /** 大数字按语言的量级缩写：中文用 万/亿，英文用 K/M/B。读者一眼能比大小。 */
    function mkCompact(value, lang) {
      const number = Number(value);
      if (!Number.isFinite(number) || number === 0) return '—';
      const abs = Math.abs(number);
      if (lang === 'en') {
        if (abs >= 1e12) return mkFixed(number / 1e12, 2) + 'T';
        if (abs >= 1e9) return mkFixed(number / 1e9, 2) + 'B';
        if (abs >= 1e6) return mkFixed(number / 1e6, 2) + 'M';
        if (abs >= 1e3) return mkFixed(number / 1e3, 1) + 'K';
        return mkFixed(number, 0);
      }
      if (abs >= 1e8) return mkFixed(number / 1e8, 2) + '亿';
      if (abs >= 1e4) return mkFixed(number / 1e4, 2) + '万';
      return mkFixed(number, 0);
    }

    /** 有值时带符号的百分比；`null`（东财的 `-`）显示成破折号，而不是 0。 */
    function mkPct(value) {
      const number = Number(value);
      if (!Number.isFinite(number)) return '—';
      return (number > 0 ? '+' : '') + mkFixed(number, 2) + '%';
    }

    function mkDir(pct) {
      if (!Number.isFinite(pct)) return 'flat';
      if (pct > 0) return 'up';
      if (pct < 0) return 'down';
      return 'flat';
    }

    /** 同一份数据里，某一列的取值；排序与展示共用，避免两处判断漂移。 */
    const MK_SORTS = [
      { id: 'pct', label: 'stockMkSortPct', value: (row) => row.pct, dir: -1 },
      { id: 'amount', label: 'stockMkSortAmount', value: (row) => row.amount, dir: -1 },
      { id: 'turnover', label: 'stockMkSortTurnover', value: (row) => row.turnover, dir: -1 },
      { id: 'marketCap', label: 'stockMkSortCap', value: (row) => row.marketCap, dir: -1 },
      { id: 'price', label: 'stockMkSortPrice', value: (row) => row.price, dir: -1 },
      { id: 'code', label: 'stockMkSortCode', value: (row) => row.code, dir: 1, text: true },
    ];

    function mkSortOf(id) {
      return MK_SORTS.find((item) => item.id === id) || MK_SORTS[0];
    }

    /**
     * 取板块列表。
     *
     * `reload()` 让刷新按钮真的能重取；`asked` 只用来拦住「进这一页之前的空转」，
     * 不拦显式刷新 —— 否则刷新按钮按下去什么都不会发生。
     */
    function useStockMarkets(enabled) {
      const [state, setState] = useState({ list: [], loading: false, error: '', needsRestart: false });
      const [token, setToken] = useState(0);
      useEffect(() => {
        if (!enabled && token === 0) return undefined;
        let alive = true;
        setState((previous) => Object.assign({}, previous, { loading: true, error: '' }));
        fetch(STOCK_ROUTE + '?op=markets', { headers: { 'x-workbench-client': 'stock' } })
          .then((response) => {
            if (response.ok) return response.json();
            if (response.status === 404) {
              if (alive) setState((previous) => Object.assign({}, previous, { loading: false, needsRestart: true }));
              return null;
            }
            throw new Error('HTTP ' + response.status);
          })
          .then((payload) => {
            if (!payload || !alive) return;
            if (!payload.ok) throw new Error(payload.error || '板块列表抓取失败');
            setState({ list: Array.isArray(payload.markets) ? payload.markets : [], loading: false, error: '', needsRestart: false });
          })
          .catch((issue) => {
            if (alive) setState((previous) => Object.assign({}, previous, { loading: false, error: issue && issue.message ? issue.message : '板块列表抓取失败' }));
          });
        return () => { alive = false };
      }, [enabled, token]);
      return Object.assign({}, state, { reload: () => setToken((value) => value + 1) });
    }

    /** 取一个板块的成分股切片。和指数报价一样，404 单独记，因为它要的是重启而不是重试。 */
    function useStockMembers(marketId, refreshToken) {
      const [state, setState] = useState({
        rows: [], market: null, total: 0, loading: false, error: '', needsRestart: false, fetchedAt: 0, stats: null,
      });
      useEffect(() => {
        if (!marketId) return undefined;
        let alive = true;
        setState((previous) => Object.assign({}, previous, { loading: true, error: '' }));
        fetch(STOCK_ROUTE + '?op=members', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-workbench-client': 'stock' },
          body: JSON.stringify({ id: marketId, limit: 100, refresh: Boolean(refreshToken) }),
        })
          .then((response) => {
            if (response.ok) return response.json();
            if (response.status === 404) {
              if (alive) setState((previous) => Object.assign({}, previous, { loading: false, needsRestart: true }));
              return null;
            }
            throw new Error('HTTP ' + response.status);
          })
          .then((payload) => {
            if (!payload || !alive) return;
            if (!payload.ok) throw new Error(payload.error || '成分股抓取失败');
            setState({
              rows: Array.isArray(payload.rows) ? payload.rows : [],
              market: payload.market || null,
              total: Number(payload.total) || 0,
              loading: false,
              error: '',
              needsRestart: false,
              fetchedAt: payload.fetchedAt || Date.now(),
              stats: payload.stats || null,
            });
          })
          .catch((issue) => {
            if (alive) setState((previous) => Object.assign({}, previous, { loading: false, error: issue && issue.message ? issue.message : '成分股抓取失败' }));
          });
        return () => { alive = false };
      }, [marketId, refreshToken]);
      return state;
    }

    /** 板块卡片墙：每个板块一张卡，点进去看成分股。 */
    function StockMarkets({ t, state, onOpen, onRefresh, busy }) {
      const cards = state.list.map((market, index) => h('button', {
        key: market.id, type: 'button', className: 'wsb-glass wsb-stkMkCard wsb-anim',
        'data-stock-market': market.id,
        style: { '--wsb-i': String(index) },
        onClick: () => onOpen(market.id),
      },
        h('div', { className: 'wsb-stkMkMain' },
          h('span', { className: 'wsb-stkMkName' }, market.name),
          // 这里只放「区域 + 作用域」。早先还插了一个数量，但 `op=markets` 根本不发数量，
          // 于是每一行都渲染成「A股 · 只（…）」—— 一个凭空出现的「只」。
          h('span', { className: 'wsb-stkMkMeta' },
            market.region,
            h('i', { className: 'wsb-stkMkScope', 'data-scope': market.scope },
              market.scope === 'board' ? t.stockMkScopeFull : t.stockMkScopeRank))),
        h('svg', { className: 'wsb-stkMkGo', viewBox: '0 0 24 24', 'aria-hidden': 'true' },
          h('path', { d: 'M9.5 6l6 6-6 6', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round' }))));

      if (state.needsRestart) {
        return h('div', { className: 'wsb-nwEmpty', 'data-stock-mk-restart': '1' },
          h('b', null, t.stockMkRestart));
      }
      if (state.loading && !cards.length) {
        return h('div', { className: 'wsb-nwEmpty', 'data-stock-mk-loading': '1' },
          h('b', null, t.stockLoading), h('span', null, t.stockLoadingHint));
      }
      return h('div', null,
        h('div', { className: 'wsb-stkMkBar' },
          h('div', { className: 'wsb-stkMkWho' }, h('b', null, t.stockMarketsTitle)),
          h('button', {
            type: 'button', className: 'wsb-btn', 'data-stock-mk-refresh': '1',
            'data-busy': busy ? 'true' : 'false', disabled: busy,
            onClick: onRefresh,
          }, busy ? t.stockRefreshing : t.stockRefresh)),
        state.error
          ? h('div', { className: 'wsb-stkNote', 'data-tone': 'warn', 'data-stock-mk-error': '1' }, t.stockFetchFailed + '：' + state.error)
          : null,
        cards.length
          ? h('div', { className: 'wsb-stkMkGrid', 'data-stock-markets': '1' }, cards)
          : h('div', { className: 'wsb-nwEmpty' }, h('b', null, t.stockMkEmpty)));
    }

    /**
     * 一个板块的成分股表。
     *
     * 排序、搜索、方向全部在**客户端**做：Host 只保证「按涨幅降序的前 N 条」，因为东财的
     * `fid` 只有 f3 真的会排序（见 stocks.js 文件头的实测）。所以这里的排序是"在切片里排"，
     * 这一点在计数行里如实写出来，不假装它是全市场排名。
     */
    function StockMembers({ t, lang, state, onBack, onRefresh, busy }) {
      const [sortId, setSortId] = useState('pct');
      const [desc, setDesc] = useState(true);
      const [query, setQuery] = useState('');
      const market = state.market;
      const digits = market && Number.isFinite(market.decimals) ? market.decimals : 2;

      const shown = useMemo(() => {
        const needle = query.trim().toLowerCase();
        let list = state.rows;
        if (needle) {
          list = list.filter((row) => String(row.code).toLowerCase().indexOf(needle) >= 0
            || String(row.name).toLowerCase().indexOf(needle) >= 0);
        }
        const sort = mkSortOf(sortId);
        const list2 = list.slice();
        list2.sort((left, right) => {
          if (sort.text) {
            const a = String(sort.value(left) || '');
            const b = String(sort.value(right) || '');
            return (desc ? -1 : 1) * a.localeCompare(b);
          }
          const a = sort.value(left);
          const b = sort.value(right);
          const na = Number.isFinite(a) ? a : null;
          const nb = Number.isFinite(b) ? b : null;
          // 缺值永远排在最后，无论升序还是降序 —— 否则「按市值」的第一屏会是一堆空行。
          if (na === null && nb === null) return 0;
          if (na === null) return 1;
          if (nb === null) return -1;
          return (desc ? -1 : 1) * (na - nb);
        });
        return list2;
      }, [state.rows, query, sortId, desc]);

      const headCell = (key, label, sortable) => h('th', {
        key,
        'data-sortable': sortable ? '1' : 'false',
        'data-on': sortable && sortId === key ? 'true' : 'false',
        onClick: sortable ? () => {
          if (sortId === key) setDesc((value) => !value);
          else { setSortId(key); setDesc(mkSortOf(key).dir < 0) }
        } : undefined,
        title: sortable ? (desc ? t.stockMkDirDesc : t.stockMkDirAsc) : '',
      }, label);

      const rowNodes = shown.map((row) => {
        const dir = mkDir(row.pct);
        const low = Number.isFinite(row.low) ? row.low : null;
        const high = Number.isFinite(row.high) ? row.high : null;
        // 现价在当日区间里的位置。区间无效时整条不渲染，而不是画一根骗人的中位线。
        let position = null;
        if (low !== null && high !== null && high > low && Number.isFinite(row.price)) {
          position = Math.max(0, Math.min(1, (row.price - low) / (high - low)));
        }
        return h('tr', {
          key: row.code, 'data-dir': dir, 'data-stock-member': row.code,
        },
          h('td', { 'data-code': '1' }, row.code),
          h('td', { 'data-name': '1', title: row.name }, row.name),
          h('td', { 'data-num': '1' }, mkFixed(row.price, row.decimals === undefined ? digits : row.decimals)),
          h('td', { 'data-pct': '1' }, mkPct(row.pct)),
          h('td', { 'data-num': '1' }, mkCompact(row.amount, lang)),
          h('td', { 'data-num': '1' }, Number.isFinite(row.turnover) ? mkFixed(row.turnover, 2) + '%' : '—'),
          h('td', { 'data-num': '1' }, Number.isFinite(row.pe) ? mkFixed(row.pe, 2) : '—'),
          h('td', { 'data-num': '1' }, mkCompact(row.marketCap, lang)),
          h('td', { 'data-num': '1' }, Number.isFinite(row.amplitude) ? mkFixed(row.amplitude, 2) + '%' : '—'),
          h('td', null, position === null ? '—' : h('div', { className: 'wsb-stkMkRange' },
            h('em', null, mkFixed(low, digits)),
            h('i', null, h('b', { style: { left: (position * 100).toFixed(1) + '%' } })),
            h('em', null, mkFixed(high, digits)))));
      });

      const scopeNote = market && market.scope === 'rank' ? t.stockMkHintRank : t.stockMkHintScope;

      return h('div', { 'data-stock-members-view': market ? market.id : '1' },
        // 一条头部，承载「返回 · 板块名 · 规模 · 搜索 · 刷新」。早先这里有三处都在说同一件事
        // （状态行 + 头部副标题 + 计数行），把仅有的视觉重量浪费在重复上。
        h('div', { className: 'wsb-stkMkHead' },
          h('button', {
            type: 'button', className: 'wsb-stkMkBack', 'data-stock-mk-back': '1',
            onClick: onBack, title: t.stockMkBack,
          },
            h('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' },
              h('path', { d: 'M14.5 6 8.5 12l6 6', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round' })),
            h('span', null, t.stockMkBack)),
          h('div', { className: 'wsb-stkMkWho' },
            h('b', null, (market && market.name) || t.stockViewMembers),
            h('span', { className: 'wsb-stkMkCount' },
              market ? market.region + ' · ' : '',
              t.stockMkTotal + ' ' + mkFixed(state.total, 0) + ' ' + t.stockMkShown + ' ' + shown.length,
              h('i', { className: 'wsb-stkMkScope', 'data-scope': market && market.scope }, scopeNote))),
          h('input', {
            className: 'wsb-input wsb-stkMkSearch', 'data-stock-mk-search': '1', value: query,
            placeholder: t.stockMkSearch, 'aria-label': t.stockMkSearch,
            onChange: (event) => setQuery(event.target.value),
          }),
          h('button', {
            type: 'button', className: 'wsb-btn', 'data-stock-mk-refresh': '1',
            'data-busy': busy ? 'true' : 'false', disabled: busy,
            onClick: onRefresh,
          }, busy ? t.stockRefreshing : t.stockRefresh)),
        state.error
          ? h('div', { className: 'wsb-stkNote', 'data-tone': 'warn', 'data-stock-mk-error': '1' }, t.stockFetchFailed + '：' + state.error)
          : null,
        state.needsRestart
          ? h('div', { className: 'wsb-stkNote', 'data-tone': 'warn', 'data-stock-mk-restart': '1' }, t.stockMkRestart)
          : null,
        state.loading && !state.rows.length
          ? h('div', { className: 'wsb-nwEmpty', 'data-stock-mk-loading': '1' },
            h('b', null, t.stockLoading), h('span', null, t.stockLoadingHint))
          : shown.length
            ? h('div', { className: 'wsb-stkMkWrap' },
              h('table', { className: 'wsb-stkTable', 'data-stock-members': '1' },
                h('thead', null, h('tr', null,
                  headCell('code', t.stockMkColCode, true),
                  h('th', { key: 'name' }, t.stockMkColName),
                  headCell('price', t.stockMkColPrice, true),
                  headCell('pct', t.stockMkColPct, true),
                  headCell('amount', t.stockMkColAmount, true),
                  headCell('turnover', t.stockMkColTurnover, true),
                  h('th', { key: 'pe' }, t.stockMkColPe),
                  headCell('marketCap', t.stockMkColCap, true),
                  h('th', { key: 'amp' }, t.stockMkColAmp),
                  h('th', { key: 'range' }, t.stockMkColRange))),
                h('tbody', null, rowNodes)))
            : h('div', { className: 'wsb-nwEmpty', 'data-stock-mk-none': '1' }, h('b', null, t.stockMkEmpty)));
    }

    //#endregion

    function StockView({ t, lang, module, patchModule, appearance, onBack, anim, screenStyle, onAnimEnd }) {
      const data = useStockData(module, patchModule);
      const { stock, busy, error, status, needsRestart, refresh } = data;
      const [picking, setPicking] = useState(false);
      const [sweep, setSweep] = useState(false);
      // 打开的板块（null = 还在板块墙）。刻意**不进模块状态**：这是一次点击进去看一眼的动作，
      // 不是这个模块的长期配置，下次进来应该又看到板块墙。
      const [openMarket, setOpenMarket] = useState(null);
      const [mkToken, setMkToken] = useState(0);
      const marketsData = useStockMarkets(stock.view === 'markets');
      const membersData = useStockMembers(openMarket, mkToken);

      const patchStock = useCallback((mutate) => patchModule(module.id, (target) => {
        const settings = normalizeStockSettings(target.stock);
        mutate(settings);
        target.stock = settings;
      }), [module.id, patchModule]);

      // Phase 2 of the arrival, exactly as the console and the news reader do it: the sweep is
      // armed here, on this screen, so its rule can never reach the home screen's cards.
      useEffect(() => {
        if (sweep) return undefined;
        if (anim !== undefined && anim !== null && anim !== '') return undefined;
        setSweep(true);
        return undefined;
      }, [anim, sweep]);

      /**
       * How old the snapshot is, computed BEFORE the rows so a row can carry it.
       *
       * `STOCK_STALE_MS` is when the answer stops being plausible as "current", and it is much
       * longer than the refresh interval on purpose: that interval is how often we *ask*, this is
       * when the answer must stop being presented as live.
       */
      const snapshotStale = !stock.lastFetchAt || Date.now() - stock.lastFetchAt > STOCK_STALE_MS;

      /**
       * The rows: the selection, joined to whatever the last snapshot has for each market.
       *
       * The join is by id and the *selection* is the spine, so a market that failed to answer —
       * or has never answered — still gets a row, showing 没有数据 rather than vanishing. A board
       * that quietly drops the markets it could not reach reads as "your selection changed".
       */
      const rows = useMemo(() => {
        const byId = new Map(stock.last.map((quote) => [quote.id, quote]));
        const blank = { price: null, change: null, pct: null, prev: null, decimals: 2, spark: [], session: 'unknown', time: 0, timeText: '', source: 'yahoo', stale: false };
        let list = stock.markets.map((id) => Object.assign(
          { id, name: id, region: '', fallback: false }, blank, stockMarketOf(stock, id), byId.get(id) || {}));
        // Two different reasons a number is not current, and either one marks the row: the Host
        // said this particular market is serving a cached value, or the whole snapshot is old
        // enough that every row in it is. The second one is why this is not left to the Host —
        // an offline pane must not draw a four-hour-old close as today's price just because the
        // failure it stored was per-snapshot rather than per-market.
        if (snapshotStale) list = list.map((row) => (row.stale ? row : Object.assign({}, row, { stale: true })));
        if (stock.region !== 'all') list = list.filter((row) => row.region === stock.region);
        if (stock.sort === 'change' || stock.sort === 'pct') {
          const key = stock.sort;
          // Newest-first is meaningless here; the reading is "who is moving", so the sort is
          // descending on the chosen column with the missing values last rather than first.
          list = list.slice().sort((left, right) => {
            const a = typeof left[key] === 'number' && Number.isFinite(left[key]) ? left[key] : -Infinity;
            const b = typeof right[key] === 'number' && Number.isFinite(right[key]) ? right[key] : -Infinity;
            return b - a;
          });
        }
        return list;
      }, [stock.markets, stock.last, stock.region, stock.sort, stock.catalog, snapshotStale]);

      const regions = useMemo(() => {
        const seen = [];
        for (const id of stock.markets) {
          const region = stockMarketOf(stock, id).region;
          if (region && seen.indexOf(region) < 0) seen.push(region);
        }
        return seen;
      }, [stock.markets, stock.catalog]);

      const age = stockAge(stock.lastFetchAt, t);
      const stale = snapshotStale;
      // Only the markets that actually failed, so the line below can be specific about which.
      const failed = (status && Array.isArray(status.errors)) ? status.errors : [];
      const answered = rows.filter((row) => row.price !== null).length;
      const usingFallback = rows.some((row) => row.source === 'tencent');
      const hint = status && status.hint === 'proxy' ? t.stockProxyHint
        : status && status.hint === 'offline' ? t.stockOfflineHint : '';

      const toggleMarket = (id) => patchStock((settings) => {
        const has = settings.markets.indexOf(id) >= 0;
        if (has && settings.markets.length <= STOCK_MIN) return;
        settings.markets = has
          ? settings.markets.filter((item) => item !== id)
          : settings.markets.concat([id]);
      });

      const head = h('div', { className: 'wsb-stkHead' },
        h('button', {
          type: 'button', className: 'wsb-backBtn', 'data-stock-back': '1', title: t.panel, onClick: onBack,
        }, h('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' }, h('path', { d: 'M14.5 6 8.5 12l6 6' }))),
        h(ModuleBackdrop, { t, module, onPatch: patchModule }),
        h('div', { className: 'wsb-stkTitle', style: { flex: '1 1 auto', minWidth: '0' } },
          h('b', null, module.name || t.kindStock),
          h('em', { className: 'wsb-titleAbbr' }, MODULE_ABBR[module.kind] || ''),),
        h('div', {
          className: 'wsb-stkGroup',
          // 控件排右对齐：从这一组起（含它）之后的兄弟元素一起被推到右侧。
          style: { marginLeft: 'auto' },
        },
        h('button', {
          type: 'button', className: 'wsb-btn', 'data-stock-refresh': '1',
            'data-busy': busy ? 'true' : 'false', disabled: busy,
            onClick: () => refresh({ force: true }),
          }, busy ? t.stockRefreshing : t.stockRefresh),
          h('button', {
            type: 'button', className: 'wsb-btn', 'data-stock-pick-toggle': '1',
            'data-on': picking ? 'true' : 'false',
            onClick: () => setPicking((value) => !value),
          }, t.stockMarkets + ' ' + stock.markets.length)),
        h('div', { className: 'wsb-stkGroup' },
          h('div', { className: 'wsb-seg' },
            h('button', {
              type: 'button', className: 'wsb-segBtn', 'data-stock-view': 'board',
              'data-on': stock.view === 'board' ? 'true' : 'false',
              onClick: () => { setOpenMarket(null); patchStock((settings) => { settings.view = 'board' }) },
            }, t.stockViewBoard),
            h('button', {
              type: 'button', className: 'wsb-segBtn', 'data-stock-view': 'table',
              'data-on': stock.view === 'table' ? 'true' : 'false',
              onClick: () => { setOpenMarket(null); patchStock((settings) => { settings.view = 'table' }) },
            }, t.stockViewTable),
            h('button', {
              type: 'button', className: 'wsb-segBtn', 'data-stock-view': 'markets',
              'data-on': stock.view === 'markets' ? 'true' : 'false',
              onClick: () => { setOpenMarket(null); patchStock((settings) => { settings.view = 'markets' }) },
            }, t.stockViewMarkets))),
        h('div', { className: 'wsb-stkGroup' },
          h('select', {
            className: 'wsb-select', 'data-stock-sort': '1', value: stock.sort,
            onChange: (event) => patchStock((settings) => { settings.sort = event.target.value }),
          },
            h('option', { value: 'catalog' }, t.stockSortCatalog),
            h('option', { value: 'change' }, t.stockSortChange),
            h('option', { value: 'pct' }, t.stockSortPct))),
        regions.length > 1
          ? h('div', { className: 'wsb-stkGroup' },
            h('div', { className: 'wsb-seg' },
              h('button', {
                type: 'button', className: 'wsb-segBtn', 'data-stock-region': 'all',
                'data-on': stock.region === 'all' ? 'true' : 'false',
                onClick: () => patchStock((settings) => { settings.region = 'all' }),
              }, t.stockRegionAll),
              regions.map((region) => h('button', {
                key: region, type: 'button', className: 'wsb-segBtn', 'data-stock-region': region,
                'data-on': stock.region === region ? 'true' : 'false',
                onClick: () => patchStock((settings) => { settings.region = region }),
              }, region))))
          : null);

      // The status line is this screen's honesty clause: when a quote was read, how many markets
      // answered, and whether anything came from the fallback. It is never hidden.
      // 板块视图下它衡量的是另一件事（多少个板块、几只个股），所以换一套说法 ——
      // 拿指数的那三个数字去描述板块，是另一种形式的撒谎。
      const statusLine = stock.view === 'markets'
        ? h('div', { className: 'wsb-stkStatus', 'data-stock-status': '1', 'data-stock-status-scope': 'markets' },
          h('span', null, marketsData.list.length
            ? t.stockMarketsTitle + ' ' + marketsData.list.length
            : ''),
          // 打开某个板块时头部已经承担了「多少只里的多少只」，这里再说一遍就是重复。
          h('span', null, openMarket ? '' : t.stockMarketsHint),
          marketsData.error || membersData.error
            ? h('span', { 'data-stock-failed': '1' }, t.stockFetchFailed)
            : null)
        : h('div', {
          className: 'wsb-stkStatus', 'data-stock-status': '1',
          'data-stock-stale': stale ? 'true' : 'false',
        },
          h('span', { 'data-stock-updated': '1' },
            stale ? t.stockStale : t.stockUpdated + ' ' + (age || t.stockJustNow)),
          h('span', null, answered + ' / ' + stock.markets.length + ' ' + t.stockSelectedN),
          failed.length ? h('span', { 'data-stock-failed': String(failed.length) }, failed.length + ' ' + t.stockFailedN) : null,
          usingFallback ? h('span', null, t.stockFallbackTag) : null);

      const notices = [
        needsRestart ? h('div', { key: 'restart', className: 'wsb-stkNote', 'data-tone': 'warn', 'data-stock-restart': '1' }, t.stockRestartHint) : null,
        !needsRestart && hint ? h('div', { key: 'hint', className: 'wsb-stkNote', 'data-tone': 'warn', 'data-stock-hint': '1' }, hint) : null,
        !needsRestart && error ? h('div', { key: 'error', className: 'wsb-stkNote', 'data-tone': 'warn', 'data-stock-error': '1' }, t.stockFetchFailed + '：' + error) : null,
        stale && !needsRestart && !error ? h('div', { key: 'stale', className: 'wsb-stkNote', 'data-tone': 'warn', 'data-stock-stale-note': '1' }, t.stockStaleHint) : null,
      ];

      const body = busy && !stock.last.length
        ? h('div', { className: 'wsb-nwEmpty', 'data-stock-loading': '1' },
          h('b', null, t.stockLoading), h('span', null, t.stockLoadingHint))
        : stock.view === 'markets'
          // 板块墙与成分股是同一件事的两层：没有打开任何板块时给墙，打开了就给那一张表。
          ? (openMarket
            ? h(StockMembers, {
              t, lang, state: membersData,
              onBack: () => setOpenMarket(null),
              onRefresh: () => setMkToken((value) => value + 1),
              busy: membersData.loading,
            })
            : h(StockMarkets, {
              t, state: marketsData,
              onOpen: (id) => setOpenMarket(id),
              onRefresh: () => { marketsData.reload && marketsData.reload() },
              busy: marketsData.loading,
            }))
          : !stock.markets.length
            ? h('div', { className: 'wsb-nwEmpty' }, h('b', null, t.stockEmpty))
            : stock.view === 'table'
              ? h(StockTable, { t, lang, rows })
              : h('div', { className: 'wsb-stkTiles', 'data-stock-tiles': '1' },
                rows.map((row, index) => h(StockTile, { key: row.id, t, lang, row, index })));

      return h('div', {
        className: 'wsb-screen', 'data-role': 'stock', 'data-anim': anim, style: screenStyle,
        'data-sweep': sweep ? 'go' : 'done',
        onAnimationEnd: (event) => { if (event.target === event.currentTarget) onAnimEnd() },
      },
        h('div', { className: 'wsb-root' },
          appearance && appearance.consoleAurora === false
            ? null
            : h('div', { className: 'wsb-consoleAurora', 'aria-hidden': 'true' }, h(AuroraBlobs, null)),
          h('div', {
            className: 'wsb-stock',
            // 红涨绿跌 in Chinese, green-up/red-down in English — the two conventions disagree, and
            // imposing either on the other's readers makes them read every number backwards.
            'data-updown': lang === 'en' ? 'intl' : 'zh',
          },
            head,
            statusLine,
            notices,
            picking ? h(StockPicker, { t, stock, onToggle: toggleMarket, onDone: () => setPicking(false) }) : null,
            h('div', { className: 'wsb-stkBoard', 'data-stock-board': '1' }, body),
            failed.length
              ? h('div', { className: 'wsb-stkFail', 'data-stock-fail-list': '1' },
                failed.map((entry) => h('span', { key: entry.id },
                  h('b', null, entry.name), ' ' + entry.message)))
              : null,
            h('div', { className: 'wsb-stkLegal' }, t.stockDisclaimer))));
    }

    //#endregion

    //#region app shell: state, navigation, transitions

    function WorkbenchApp({ services, moduleIndex }) {
      const lang = useStore(langStore, 'zh');
      const t = TEXT[lang] || TEXT.zh;
      const [state, setState] = useState(loadAppState);
      const [notes, setNotes] = useState(loadNotes);
      const [customNodes, setCustomNodes] = useState([]);
      const [route, setRoute] = useState({ name: 'home', moduleId: null, origin: null, phase: 'idle' });
      const [hidden, setHidden] = useState(() => new Set());
      const [dockPanel, setDockPanel] = useState(null);
      const [mediaUrls, setMediaUrls] = useState({});
      const [mediaFailed, setMediaFailed] = useState(false);
      const [mediaRetry, setMediaRetry] = useState(0);
      const stackRef = useRef(null);
      const fileRef = useRef(null);
      // Bumped every time the desktop is entered, so the tile marks replay their pen stroke.
      const [deskEpoch, setDeskEpoch] = useState(0);
      useEffect(() => {
        if (route.name === 'home') setDeskEpoch((value) => value + 1);
      }, [route.name]);

      // The sweep is a one-shot retired by the console screen itself; nothing to do here.

      // Publish this instance's state, and adopt anything another live instance published.
      // The serialized comparison on both sides is what stops a feedback loop.
      useEffect(() => {
        const serialized = JSON.stringify(state);
        if (serialized === lastBroadcastState) return;
        lastBroadcastState = serialized;
        saveAppState(state);
        broadcastState(state);
      }, [state]);
      useEffect(() => {
        const listener = (next) => {
          const serialized = JSON.stringify(next);
          if (serialized === lastBroadcastState) return;
          lastBroadcastState = serialized;
          setState(next);
        };
        stateListeners.add(listener);
        return () => { stateListeners.delete(listener) };
      }, []);
      useEffect(() => { saveNotes(notes) }, [notes]);

      // The sidebar rail mirrors this state's module list, so it is re-synced on every
      // change — not only when `saveAppState` happens to run. Without this the row count
      // could settle before the modules were readable, and the rail stayed empty.
      useEffect(() => { safe(() => { if (sidebarSync) sidebarSync() }) }, [state.modules]);

      const list = useSessionsList(services);
      const rows = useMemo(() => {
        const byId = list && list.byId ? list.byId : {};
        return Object.keys(byId).map((id) => byId[id]).filter(Boolean);
      }, [list]);

      const background = state.background;
      const appearance = state.appearance || defaultAppearance();
      const module = useMemo(
        () => state.modules.find((item) => item.id === route.moduleId) || null,
        [state.modules, route.moduleId]);

      // A module deleted while it is open returns the stack to the home screen.
      useEffect(() => {
        if (route.moduleId && !module) setRoute({ name: 'home', moduleId: null, origin: null, phase: 'idle' });
      }, [route.moduleId, module]);

      // Resolve every media-library item to an object URL, once per key set.
      const mediaKeys = (background.media || []).map((item) => item.key).join('|');
      useEffect(() => {
        const pending = (background.media || []).filter((item) => item.key
          && !(item.key in mediaUrls) && !sessionMediaUrls.has(item.key));
        if (pending.length === 0) return undefined;
        let alive = true;
        Promise.all(pending.map((item) => mediaGet(item.key).then((blob) => [
          item.key, blob ? safe(() => window.URL.createObjectURL(blob), null) : null,
        ]).catch(() => [item.key, null]))).then((entries) => {
          if (!alive) return;
          const found = entries.filter((entry) => entry[1]);
          if (found.length === 0) return;
          for (const entry of found) sessionMediaUrls.set(entry[0], entry[1]);
          setMediaUrls((previous) => {
            const next = Object.assign({}, previous);
            for (const entry of found) next[entry[0]] = entry[1];
            return next;
          });
        }).catch(() => {});
        return () => { alive = false };
      }, [mediaKeys]);
      // A failure on one item must not stick to the next: picking a different background
      // clears it so the media layer is given a fresh chance.
      useEffect(() => { setMediaFailed(false); setMediaRetry(0) }, [background.activeKey, background.mode]);

      // Mount path: never trust the URL that was persisted. A stored object URL belongs to
      // the document that created it, so re-mint a fresh one from durable storage whenever
      // the record is still there. This runs on every mount, which is exactly what a panel
      // switch is.
      const [mediaDiag, setMediaDiag] = useState({ idbGet: 'idle' });
      useEffect(() => {
        const key = background.activeKey;
        if (!key || background.mode === 'aurora') return undefined;
        let alive = true;
        mediaGet(key).then((blob) => {
          if (!alive) return;
          if (!blob) { setMediaDiag({ idbGet: 'miss', idbPut: mediaDiagPut }); return }
          const url = safe(() => window.URL.createObjectURL(blob), null);
          if (!url) { setMediaDiag({ idbGet: 'no-url', idbPut: mediaDiagPut }); return }
          sessionMediaUrls.set(key, url);
          setMediaUrls((previous) => Object.assign({}, previous, { [key]: url }));
          setMediaFailed(false);
          setMediaDiag({ idbGet: 'ok', idbPut: mediaDiagPut });
        }).catch(() => { if (alive) setMediaDiag({ idbGet: 'error', idbPut: mediaDiagPut }) });
        return () => { alive = false };
      }, [background.activeKey, background.mode]);

      // Recovery path: if the media element errors (a stale blob URL after a reload,
      // say) fetch a fresh object URL for the active item before giving up.
      useEffect(() => {
        if (mediaRetry === 0) return undefined;
        const key = background.activeKey;
        if (!key) { setMediaFailed(true); return undefined }
        let alive = true;
        mediaGet(key).then((blob) => {
          if (!alive) return;
          const url = blob ? safe(() => window.URL.createObjectURL(blob), null) : null;
          if (!url) { setMediaFailed(true); return }
          setMediaUrls((previous) => Object.assign({}, previous, { [key]: url }));
          sessionMediaUrls.set(key, url);
          setMediaFailed(false);
        }).catch(() => { if (alive) setMediaFailed(true) });
        return () => { alive = false };
      }, [mediaRetry]);

      const activeItem = (background.media || []).find((item) => item.key === background.activeKey) || null;
      const networkIndex = clamp(background.networkIndex, 0, NETWORK_BACKGROUNDS.length - 1);
      const networkSrc = background.networkUrl || NETWORK_BACKGROUNDS[networkIndex];
      // Wide by design: the low end is a near-static field, the high end is a fast churn.
      const auroraDuration = (260 / (0.45 + clamp(background.auroraSpeed, 0, 100) / 100 * 12.5)).toFixed(1) + 's';
      // A media entry with a local path is served by the Host route, so it keeps working
      // for as long as the file is on disk — no blob URL, no blob store, no lifetime.
      // Only when the picker could not give us a path do we fall back to a session URL.
      let mediaSrc = null;
      // 自定义界面 is the switch that owns this: with it off the aurora runs even though a file
      // is still remembered, so turning the switch back on is instant.
      if (background.mode === 'media' && activeItem && !mediaFailed) {
        mediaSrc = activeItem.path
          ? MEDIA_ROUTE + '?path=' + encodeURIComponent(activeItem.path)
          : (sessionMediaUrls.get(activeItem.key) || mediaUrls[activeItem.key] || activeItem.url || null);
      }
      // Legacy states could still be sitting on the removed network mode.
      if (background.mode === 'network' && !activeItem) mediaSrc = mediaFailed ? null : networkSrc;
      const mediaStatus = (background.media || []).length === 0 ? 'na'
        : mediaFailed ? 'failed'
          : mediaSrc ? 'ready' : 'loading';
      const mediaKind = activeItem ? activeItem.kind : (background.mode === 'network' ? 'image' : 'image');
      // One terse line, so a background that cannot render is never a mystery.
      const mediaDiagText = activeItem && activeItem.path
        ? '文件 ' + activeItem.path
        : 'items=' + (background.media || []).length + ' session=' + (activeItem && sessionMediaUrls.has(activeItem.key) ? 'Y' : 'N');

      useEffect(() => {
        setMediaFailed(false);
      }, [background.mode, background.networkUrl, background.networkIndex, background.activeKey]);

      const patchState = useCallback((mutate) => {
        setState((previous) => {
          const next = JSON.parse(JSON.stringify(previous));
          mutate(next);
          // Write through immediately as well as in the effect below: the effect does not
          // run if the panel unmounts before it flushes, and the chosen background must
          // never be lost just because the user switched pages.
          try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next)) } catch { /* quota / unavailable */ }
          return next;
        });
      }, []);

      const patchModule = useCallback((id, mutate) => {
        patchState((next) => {
          const target = next.modules.find((item) => item.id === id);
          if (target) mutate(target, next);
        });
      }, [patchState]);

      const patchBackground = useCallback((changes) => {
        patchState((next) => { next.background = Object.assign({}, next.background, changes) });
      }, [patchState]);

      const open = useCallback((moduleId, event) => {
        let origin = null;
        const card = event && event.currentTarget;
        const host = stackRef.current;
        if (card && host && card.getBoundingClientRect && host.getBoundingClientRect) {
          const rect = card.getBoundingClientRect();
          const frame = host.getBoundingClientRect();
          if (rect.width > 4 && frame.width > 4) {
            const sx = frame.width ? rect.width / frame.width : 1;
            const sy = frame.height ? rect.height / frame.height : 1;
            origin = {
              ox: (rect.left - frame.left) + 'px',
              oy: (rect.top - frame.top) + 'px',
              sx: sx.toFixed(4),
              sy: sy.toFixed(4),
              // Radius is authored in the layer's own (scaled) space so it lands
              // as the card's radius on screen: r_screen = r_local * scale.
              r: (20 / Math.max(sx, 0.05)).toFixed(1) + 'px',
            };
          }
        }
        setHidden(new Set([moduleId]));
        // Leaving the home screen closes whatever dock panel was open, so a panel can
        // never linger over the console.
        setDockPanel(null);
        // Derive the kind from the CURRENT state: this callback has no deps, so reading
        // the `module` binding here would use the value captured on the first render.
        let kind = 'game';
        setState((previous) => {
          const found = previous.modules.find((item) => item.id === moduleId);
          if (found) kind = found.kind;
          return previous;
        });
        setRoute((previous) => ({
          // Three of the four kinds are windows of their own — the notebook, the news reader and
          // the market board all read something other than a session, so none of them can open
          // as a conversation console. The rest are consoles.
          name: kind === 'notebook' ? 'notes'
            : kind === 'news' ? 'news'
              : kind === 'stock' ? 'stock' : 'console',
          moduleId, origin,
          // 从桌面进入模块才走 entering（保留完整的入场动画）。
          // 已经在模块里再切到另一个模块就直接落到 idle —— 桌面保持被覆盖，
          // 不会把"桌面淡出"重播一遍，所以不会闪一下。
          phase: previous.name === 'home' ? 'entering' : 'idle',
        }));
      }, []);

      const back = useCallback(() => {
        setRoute((previous) => (previous.name !== 'home' && previous.phase !== 'exiting'
          ? { ...previous, phase: 'exiting' } : previous));
      }, []);

      // A sidebar module row opened this panel instance: go straight into that module.
      useEffect(() => {
        if (moduleIndex === undefined || moduleIndex === null) return undefined;
        const target = state.modules[moduleIndex];
        if (target) open(target.id, null);
        return undefined;
      }, []);

      const onConsoleAnimEnd = useCallback(() => {
        setRoute((previous) => {
          if (previous.phase === 'entering') return { ...previous, phase: 'idle' };
          if (previous.phase === 'exiting') return { name: 'home', moduleId: null, origin: null, phase: 'idle' };
          return previous;
        });
      }, []);

      useEffect(() => {
        if (route.phase === 'exiting') setHidden(new Set());
      }, [route.phase]);

      /**
       * Create a module. `kind` selects which shipped module is created, because the three
       * kinds are three different products: a conversation console, a standalone notebook and
       * the daily-news reader. The add tile offers all of them.
       */
      /** 便签: create, edit, move and delete. Position is a percentage of the desktop. */
      const addSticky = useCallback(() => {
        patchState((next) => {
          if (!Array.isArray(next.stickies)) next.stickies = [];
          const count = next.stickies.length;
          const colors = Object.keys(STICKY_COLORS);
          next.stickies.push({
            id: newId('sticky'),
            // A cascade, so a new note never lands exactly on the previous one.
            x: clamp(10 + (count * 7) % 56, 2, 84),
            y: clamp(14 + (count * 9) % 50, 4, 84),
            color: colors[count % colors.length],
            w: 196, h: 150,
            text: '', created: Date.now(),
          });
        });
      }, [patchState]);
      const patchSticky = useCallback((id, changes) => {
        patchState((next) => {
          const target = (next.stickies || []).find((item) => item.id === id);
          if (target) Object.assign(target, changes);
        });
      }, [patchState]);
      const deleteSticky = useCallback((id) => {
        patchState((next) => { next.stickies = (next.stickies || []).filter((item) => item.id !== id) });
      }, [patchState]);
      const moveSticky = useCallback((id, place) => {
        // The note measured its own new place as a share of the surface it lives on; this just
        // stores it, so a resize keeps the layout and a drop lands where it was released.
        patchState((next) => {
          const target = (next.stickies || []).find((item) => item.id === id);
          if (!target) return;
          target.x = clamp(place.x, 0, 90);
          target.y = clamp(place.y, 0, 88);
        });
      }, [patchState]);

      const addModule = useCallback((kind) => {
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
      }, [patchState, t]);

      const renameModule = useCallback((id, name) => patchModule(id, (target) => { target.name = name }), [patchModule]);
      const deleteModule = useCallback((id) => {
        patchState((next) => { next.modules = next.modules.filter((item) => item.id !== id) });
      }, [patchState]);
      const bindSession = useCallback((id, sessionId) => {
        // An empty id releases the binding, so the module follows the focused conversation.
        patchModule(id, (target, next) => {
          if (sessionId) { target.sessionId = sessionId; next.focusSessionId = sessionId; return }
          target.sessionId = undefined;
        });
      }, [patchModule]);
      const pickSession = useCallback((id) => {
        // Choosing in the session picker only moves the focus. It deliberately does NOT
        // bind: binding is an explicit act (the 绑定当前会话 button), otherwise merely
        // looking at another conversation would silently pin this module to it.
        patchState((next) => { next.focusSessionId = id || undefined });
      }, [patchState]);

      const onNote = useCallback((id, value) => {
        setNotes((previous) => {
          const next = { ...previous };
          if (value) next[id] = value; else delete next[id];
          return next;
        });
      }, []);

      const onAddCustom = useCallback((text) => {
        setCustomNodes((previous) => previous.concat([{ id: newId('note'), title: t.nodeNote, body: text }]));
      }, [t]);

      const shuffle = useCallback(() => {
        patchBackground({ networkIndex: (networkIndex + 1) % NETWORK_BACKGROUNDS.length, networkUrl: '' });
      }, [patchBackground, networkIndex]);

      const onPickFile = useCallback((event) => {
        const input = event && event.target;
        const file = input && input.files && input.files[0];
        if (!file) return;
        const kind = file.type && file.type.indexOf('video') === 0 ? 'video' : 'image';
        const key = newId('media');
        // Mint the object URL straight away so the background switches immediately.
        const sessionUrl = safe(() => window.URL.createObjectURL(file), null);
        if (sessionUrl) {
          sessionMediaUrls.set(key, sessionUrl);
          setMediaUrls((previous) => Object.assign({}, previous, { [key]: sessionUrl }));
        }
        // A path from the picker is the durable form; only when the browser gives us no
        // path do we fall back to keeping the bytes in IndexedDB.
        const localPath = typeof file.path === 'string' && file.path ? file.path : '';
        patchState((next) => {
          next.background.media = (next.background.media || []).concat([{
            key,
            name: file.name || '媒体',
            kind,
            path: localPath || undefined,
            url: localPath ? undefined : (sessionUrl || undefined),
          }]);
          next.background.activeKey = key;
          next.background.mode = 'media';
        });
        if (localPath) return;
        // Upgrading to a durable copy is best effort — but verify it, because a write that
        // reports success and cannot be read back is the exact failure we are chasing.
        mediaDiagPut = 'pending';
        mediaPut(key, file).then((ok) => {
          if (!ok) { mediaDiagPut = 'fail'; return }
          mediaGet(key).then((blob) => { mediaDiagPut = blob ? 'ok' : 'ok-unreadable' }, () => { mediaDiagPut = 'ok-unreadable' });
        }, () => { mediaDiagPut = 'fail' });
        if (input.value !== undefined) input.value = '';
      }, [patchState]);

      const onSelectMedia = useCallback((key) => {
        patchBackground({ mode: 'media', activeKey: key });
      }, [patchBackground]);

      const onRemoveMedia = useCallback((key) => {
        mediaRemove(key);
        safe(() => {
          const held = sessionMediaUrls.get(key);
          if (held) window.URL.revokeObjectURL(held);
          sessionMediaUrls.delete(key);
        });
        setMediaUrls((previous) => {
          const next = Object.assign({}, previous);
          if (next[key]) safe(() => window.URL.revokeObjectURL(next[key]));
          delete next[key];
          return next;
        });
        patchState((next) => {
          next.background.media = (next.background.media || []).filter((item) => item.key !== key);
          if (next.background.activeKey === key) {
            const rest = next.background.media;
            next.background.activeKey = rest.length ? rest[rest.length - 1].key : '';
          }
          if (next.background.mode === 'media' && !next.background.media.length) next.background.mode = 'aurora';
        });
      }, [patchState]);

      /** Reset the settings but keep the uploaded library, so nothing is lost by accident. */
      const resetBackground = useCallback(() => {
        patchState((next) => {
          next.background = Object.assign(defaultBackground(), {
            media: next.background.media || [],
            activeKey: next.background.activeKey || '',
          });
        });
      }, [patchState]);

      const patchAppearance = useCallback((changes) => {
        patchState((next) => { next.appearance = Object.assign({}, next.appearance, changes) });
      }, [patchState]);

      // One colour control drives both the aurora blobs and every UI accent, so the two
      // can never drift apart.
      const applyAuroraColor = useCallback((id) => {
        patchAppearance({ palette: id });
        patchBackground({ auroraId: id });
      }, [patchAppearance, patchBackground]);

      /**
       * Reference a media file **on this machine by path**. The Host serves it over a
       * same-origin route, so it keeps working as long as the file exists — nothing to
       * store, nothing to expire, nothing to lose when the panel remounts.
       */
      const useMediaPath = useCallback((rawPath) => {
        const path = String(rawPath || '').trim();
        if (!path) return;
        const key = newId('media');
        const kind = /\.(mp4|m4v|webm|ogv|mov)$/i.test(path) ? 'video' : 'image';
        patchState((next) => {
          next.background.media = (next.background.media || []).concat([{
            key,
            name: path.split(/[\\/]/).pop() || path,
            kind,
            path,
          }]);
          next.background.activeKey = key;
          next.background.mode = 'media';
        });
      }, [patchState]);

      // Keyboard layer: Escape dismisses; on the home screen digits open a module,
      // `n` creates one and `b`/`a`/`s` toggle the dock panels; inside a console the
      // digits pick a layout preset.
      useEffect(() => {
        const onKey = (event) => {
          if (event.metaKey || event.ctrlKey || event.altKey) return;
          const target = event.target;
          if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
          if (event.key === 'Escape') {
            // The conversation console, the notebook window and the news reader are all
            // full-screen surfaces, so Escape has to be able to leave any of them.
            if (route.name === 'console' || route.name === 'notes' || route.name === 'news'
              || route.name === 'stock') { event.preventDefault(); back() }
            else if (dockPanel) { event.preventDefault(); setDockPanel(null) }
            return;
          }
          if (route.name === 'console') {
            const order = Object.keys(PRESETS);
            const slot = Number(event.key) - 1;
            if (route.moduleId && slot >= 0 && slot < order.length) {
              event.preventDefault();
              patchModule(route.moduleId, (item) => { item.preset = order[slot] });
            }
            return;
          }
          if (event.key === 'n' || event.key === 'N') { event.preventDefault(); addModule(); return }
          if (event.key === 'b' || event.key === 'B') { event.preventDefault(); setDockPanel((value) => (value === 'dynamic' ? null : 'dynamic')); return }
          // 排布 / 形状 / UI all live in the single 界面设置 panel now.
          if (event.key === 'a' || event.key === 'A') { event.preventDefault(); setDockPanel((value) => (value === 'interface' ? null : 'interface')); return }
          if (event.key === 'l' || event.key === 'L') { event.preventDefault(); setDockPanel((value) => (value === 'interface' ? null : 'interface')); return }
          if (event.key === 's' || event.key === 'S') { event.preventDefault(); setDockPanel((value) => (value === 'interface' ? null : 'interface')); return }
          const slot = Number(event.key) - 1;
          if (slot >= 0 && slot < state.modules.length) {
            event.preventDefault();
            open(state.modules[slot].id, null);
          }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
      }, [route.name, route.moduleId, dockPanel, state.modules, back, addModule, patchModule, open]);

      const homeAnim = route.phase === 'entering' ? 'fade-out' : route.phase === 'exiting' ? 'fade-in' : undefined;
      const consoleAnim = route.phase === 'entering' ? 'zoom-in' : route.phase === 'exiting' ? 'zoom-out' : undefined;
      const screenStyle = route.origin ? {
        '--wsb-ox': route.origin.ox, '--wsb-oy': route.origin.oy,
        '--wsb-sx': String(route.origin.sx), '--wsb-sy': String(route.origin.sy),
        '--wsb-r': route.origin.r || '20px',
      } : undefined;

      // The workbench is fully covered by another screen: the home screen must not stay painted
      // underneath, and the background video has no reason to keep decoding.
      const homeCovered = (route.name === 'console' || route.name === 'notes' || route.name === 'news'
        || route.name === 'stock')
        && route.phase === 'idle';
      // For the background video any other screen is reason enough to stop — waiting for the
      // transition to settle would leave it decoding through the whole animation.
      const backgroundPaused = route.name !== 'home';
      // The 透明度 slider overrides the material's own fill, and being an inline custom property
      // on the root it wins over the [data-glass] rule without any specificity games.
      const dimRaw = module && module.backdrop;
      // 没有打开任何模块（home）时必须是 0 —— 否则那一层会把工作台自己也压暗模糊掉。
      const dimBackdrop = module
        ? clamp(Math.round(dimRaw === undefined || dimRaw === null ? 50 : Number(dimRaw)), 0, 100)
        : 0;
      // 模块界面最底层的那层压暗毛玻璃：0 = 不变（此时 data-dim=false，直接不合成）。
      const dimStyle = { '--wsb-dim': String(dimBackdrop) };
      const glassAlphaStyle = appearance.glassAlpha === undefined
        ? undefined : { '--wsb-glass-alpha': clamp(appearance.glassAlpha, 0, 100) + '%' };

      return h('div', {
        className: 'wsb-root',
        'data-palette': appearance.palette,
              'data-dim': dimBackdrop > 0 ? 'true' : 'false',
        'data-glass': appearance.glass,
        style: {
          padding: 0, background: 'transparent',
          // 透明度 slider override (undefined = use the material's own fill).
          ...glassAlphaStyle,
              ...dimStyle,
          // 形状: 0 → 50% 圆角(磁贴自身是正方形, 所以这就是正圆), 100 → 0%(正方形),
          // 中间就是圆角半径本身. 名字只由悬停决定, 与形状无关.
          // 内层的 .wsb-root 把 --wsb-card-radius 设成了旧默认 20px（就近优先，会盖掉这里）。
      // 所以另发一个内层从未设过的名字，磁贴与绕圈都用它 —— 外层值必胜。
      '--wsb-shape-radius': ((100 - clamp(appearance.radius === undefined ? 85 : appearance.radius, 0, 100)) / 2) + '%',
      '--wsb-card-radius': ((100 - clamp(appearance.radius === undefined ? 85 : appearance.radius, 0, 100)) / 2) + '%',
          '--wsb-aurora-dur': auroraDuration,
          // Surface parameters, all driven by 桌面设置 → 表面效果.
          '--wsb-edge': String(background.edgeBlur),
          '--wsb-hue-dur': (220 - clamp(background.hueSpeed, 0, 100) * 2.1).toFixed(1) + 's',
          '--wsb-sat': (clamp(background.saturation, 0, 300) / 100).toFixed(2),
          '--wsb-tone': (clamp(background.bright, 0, 200) / 100).toFixed(2),
          '--wsb-shape-var': String(background.shapeVariance),
          '--wsb-hue-var': String(background.hueRange),
        },
      },
        // 液态玻璃的折射源: 位移图由 feTurbulence 生成, 柔和/强烈两张, 由材质切换.
        h('svg', { className: 'wsb-lensDefs', 'aria-hidden': 'true', width: 0, height: 0 },
          h('filter', {
            id: 'wsbRefract', x: '-15%', y: '-15%', width: '130%', height: '130%',
            colorInterpolationFilters: 'sRGB',
          },
            h('feTurbulence', { type: 'fractalNoise', baseFrequency: '0.006 0.011', numOctaves: 2, seed: 11, result: 'warp' }),
            h('feGaussianBlur', { in: 'warp', stdDeviation: 3, result: 'soft' }),
            h('feDisplacementMap', {
              in: 'SourceGraphic', in2: 'soft', scale: 20,
              xChannelSelector: 'R', yChannelSelector: 'G',
            })),
          // 曲面: 位移图(带壁厚) + 色散. R/G/B 各用不同 scale 位移一次, 再按通道合回 ——
          // 边缘因此会出现真实的色散(颜色来自背景, 不是主题色), 这就是"玻璃边缘映射背景色彩".
          h('filter', {
            // 滤镜区域就是元素本身, 位移图百分比铺满 —— 两者严格对齐, 不会有接缝.
            id: 'wsbLens', x: '0%', y: '0%', width: '100%', height: '100%',
            colorInterpolationFilters: 'sRGB',
          },
            h('feImage', {
              x: 0, y: 0, width: '100%', height: '100%',
              href: lensMapUrl(256, 32), result: 'map', preserveAspectRatio: 'none',
            }),
            h('feDisplacementMap', {
              in: 'SourceGraphic', in2: 'map', scale: 20,
              xChannelSelector: 'R', yChannelSelector: 'G',
            }),
            h('feColorMatrix', {
              type: 'matrix', result: 'displacedR',
              values: '1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0',
            }),
            h('feDisplacementMap', {
              in: 'SourceGraphic', in2: 'map', scale: 19,
              xChannelSelector: 'R', yChannelSelector: 'G',
            }),
            h('feColorMatrix', {
              type: 'matrix', result: 'displacedG',
              values: '0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0',
            }),
            h('feDisplacementMap', {
              in: 'SourceGraphic', in2: 'map', scale: 18,
              xChannelSelector: 'R', yChannelSelector: 'G',
            }),
            h('feColorMatrix', {
              type: 'matrix', result: 'displacedB',
              values: '0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0',
            }),
            h('feBlend', { in: 'displacedR', in2: 'displacedG', mode: 'screen' }),
            h('feBlend', { in2: 'displacedB', mode: 'screen' })),
          h('filter', {
            id: 'wsbRefractSoft', x: '-10%', y: '-10%', width: '120%', height: '120%',
            colorInterpolationFilters: 'sRGB',
          },
            h('feTurbulence', { type: 'fractalNoise', baseFrequency: '0.009 0.014', numOctaves: 2, seed: 5, result: 'warp' }),
            h('feGaussianBlur', { in: 'warp', stdDeviation: 2, result: 'soft' }),
            h('feDisplacementMap', {
              in: 'SourceGraphic', in2: 'soft', scale: 9,
              xChannelSelector: 'R', yChannelSelector: 'G',
            }))),
        h('style', null, CSS),
        h(BackgroundLayer, {
          background, mediaSrc, mediaKind,
          // The console / notes / news screens cover the workbench: a looping video behind an
          // opaque screen is pure GPU and battery, so it pauses instead.
          paused: backgroundPaused,
          onMediaError: () => {
            // A stale object URL (e.g. after reload) gets one re-resolve before we
            // give up and fall back to the aurora layer.
            if (mediaRetry < 3) setMediaRetry(mediaRetry + 1);
            else setMediaFailed(true);
          },
        }),
        h('div', { ref: stackRef, className: 'wsb-stack', 'data-phase': route.phase, style: { height: '100%' } },
          h(HomeView, {
            t, state, rows, hidden, anim: homeAnim,
            onOpen: open, onAddModule: addModule, onAddSticky: addSticky,
            onPatchSticky: patchSticky, onDeleteSticky: deleteSticky, onMoveSticky: moveSticky,
            onRenameModule: renameModule, onDeleteModule: deleteModule,
            onPatchModule: patchModule,
            panel: dockPanel, onPanel: setDockPanel, onAnimEnd: onConsoleAnimEnd,
            appearance, onAppearance: patchAppearance,
            // Once the console has settled the home screen must not stay painted
            // underneath it: the console panes are frosted and would show its cards. The same
            // condition drives the background video's pause.
            concealed: homeCovered,
            drawKey: deskEpoch,
            // 缩写只在中文界面出现: 英文界面里名字本身就是英文, 再加缩写是重复信息.
            showAbbr: lang !== 'en',
            bg: {
              t, background, patch: patchBackground, onPickFile, onShuffle: shuffle, onReset: resetBackground,
              mediaUrls, onSelectMedia, onRemoveMedia, fileRef, onAuroraColor: applyAuroraColor,
            onUsePath: useMediaPath, mediaStatus, mediaDiag: mediaDiagText,
            },
          }),
          route.moduleId && module
            ? (module.kind === 'notebook'
              // 框架笔记 is its own window: it reads no session, so it takes neither the
              // event window nor the pane presets.
              ? h(NotebookView, {
                t, module, patchModule, appearance,
                onBack: back, anim: consoleAnim, screenStyle, onAnimEnd: onConsoleAnimEnd,
              })
              : module.kind === 'news'
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
                  : h(ConsoleView, {
                  t, services, module, rows, state, patchModule, notes, onNote, customNodes, onAddCustom,
                  onBack: back, onPickSession: pickSession, onBindSession: bindSession,
                  patchState,
                  anim: consoleAnim, screenStyle, onAnimEnd: onConsoleAnimEnd, appearance,
                }))
            : null),
        h('input', {
          ref: fileRef, type: 'file', accept: 'image/*,video/*',
          style: { display: 'none' }, onChange: onPickFile,
        }));
    }

    //#endregion

    //#region sidebar launcher

    function SidebarIcon(ownerProps) {
      const size = ownerProps && typeof ownerProps.size === 'number' ? ownerProps.size : 18;
      const active = Boolean(ownerProps && ownerProps.active);
      return h('svg', {
        viewBox: '0 0 24 24', width: size, height: size, 'aria-hidden': true,
        style: { display: 'block', pointerEvents: 'none', opacity: active ? 1 : 0.82 },
      },
        h('rect', { x: 2.75, y: 3.75, width: 18.5, height: 16.5, rx: 4.75, fill: 'none', stroke: 'currentColor', strokeWidth: 1.5 }),
        h('rect', { x: 5.6, y: 7.1, width: 6.1, height: 4.3, rx: 1.7, fill: 'currentColor', opacity: 0.92 }),
        h('rect', { x: 12.6, y: 7.1, width: 5.8, height: 4.3, rx: 1.7, fill: 'currentColor', opacity: 0.52 }),
        h('rect', { x: 5.6, y: 13.1, width: 12.8, height: 3.9, rx: 1.7, fill: 'currentColor', opacity: 0.34 }));
    }

    //#endregion

    //#region activation

    const PANEL_ID = 'workbench';

    let servicesRef = null;

    /** Panel wrapper: contains any render failure so the slot entry never blanks. */
    class WorkbenchBoundary extends React.Component {
      constructor(properties) {
        super(properties);
        this.state = { error: null };
      }
      static getDerivedStateFromError(error) {
        return { error };
      }
      render() {
        if (this.state.error) {
          const t = TEXT[langStore.getSnapshot()] || TEXT.zh;
          return h('div', { className: 'wsb-root' },
            h('style', null, CSS),
            h('div', { className: 'wsb-glass', style: { padding: '18px' } },
              h('b', null, t.panel),
              h('div', { className: 'wsb-empty' }, String(this.state.error && this.state.error.message ? this.state.error.message : this.state.error))));
        }
        return this.props.children;
      }
    }

    function WorkbenchPanel() {
      return h(WorkbenchBoundary, null, h(WorkbenchApp, { services: servicesRef }));
    }

    function apply(ctx) {
      servicesRef = {
        sessions: ctx.sessions || (typeof ctx.get === 'function' ? ctx.get('sessions') : undefined),
        layout: ctx.layout || (typeof ctx.get === 'function' ? ctx.get('layout') : undefined),
      };

      ctx.effect(() => {
        langStore.set(detectLang(ctx));
        if (typeof ctx.on !== 'function') return () => {};
        const off = ctx.on('locale/change', () => langStore.set(detectLang(ctx)));
        return () => { if (typeof off === 'function') off() };
      }, 'workbench.locale');

      ctx.effect(() => {
        const list = ctx.sessions && ctx.sessions.list;
        if (!list || typeof list.subscribe !== 'function') return () => {};
        const read = () => syncRunningSessions(safe(() => list.getSnapshot(), []));
        read();
        const off = list.subscribe(read);
        return () => { if (typeof off === 'function') off() };
      }, 'workbench.running');

      ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
        name: 'sidebar.panellist',
        id: PANEL_ID,
        order: 12,
        label: () => (TEXT[langStore.getSnapshot()] || TEXT.zh).panel,
      }, SidebarIcon));

      ctx.slots.inject('main', () => ctx.slots.register({
        name: 'main',
        key: PANEL_ID,
      }, WorkbenchPanel));

      // One sidebar row per module, directly under 工作台. The browser's directory-flow hole
      // was tried for a nested tree and made the whole plugin fail to load, so the sidebar
      // stays with the flat entry list this panel has always used.
      const MODULE_ROWS_MAX = 16;
      const moduleRowDisposers = [];
      let moduleRowSignature = '';
      const syncModuleRows = (force) => {
        const modules = safe(() => loadAppState().modules, []) || [];
        const count = Math.min(modules.length, MODULE_ROWS_MAX);
        // Re-register when the module list actually changes. Keying on the ids (not just the
        // count) means a rename-free add/remove still rebuilds, and `force` lets the inject
        // callback rebuild unconditionally: the host owns this slot's rendering and can drop
        // our rows without telling us (a sidebar reload, a plugin re-init). Without that
        // forced pass the guard would skip the rebuild and the rail would stay empty with no
        // way back — which is exactly the reported "快捷入口消失了".
        const signature = count + ':' + modules.slice(0, count).map((item) => item.id).join(',');
        if (!force && signature === moduleRowSignature) return;
        moduleRowSignature = signature;
        while (moduleRowDisposers.length) safe(() => moduleRowDisposers.pop()());
        for (let index = 0; index < count; index += 1) {
          const slotIndex = index;
          safe(() => moduleRowDisposers.push(ctx.slots.register({
            name: 'sidebar.panellist',
            id: PANEL_ID + '-m' + slotIndex,
            order: 13 + slotIndex,
            label: () => {
              const list = safe(() => loadAppState().modules, []) || [];
              return list[slotIndex] ? list[slotIndex].name : '';
            },
          }, (ownerProps) => SidebarModuleIcon(ownerProps, slotIndex))));
          safe(() => moduleRowDisposers.push(ctx.slots.register({
            name: 'main',
            key: PANEL_ID + '-m' + slotIndex,
          }, () => h(WorkbenchBoundary, null, h(WorkbenchApp, { services: servicesRef, moduleIndex: slotIndex })))));
        }
      };
      sidebarSync = syncModuleRows;
      // Force once on inject: the host owns this slot's rendering, and a re-inject is exactly
      // the moment at which our rows may have been dropped.
      ctx.slots.inject('sidebar.panellist', () => { syncModuleRows(true); return () => {} });
      syncModuleRows(true);
    }

    return { inject: ['slots', 'sessions', 'layout'], apply };

    //#endregion
  },
});
