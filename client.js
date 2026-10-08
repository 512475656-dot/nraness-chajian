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
.wsb-bg{position:absolute;inset:0;z-index:0;overflow:hidden;pointer-events:none;background:var(--dsw-alias-bg-base)}
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

/* ---- screen stack: iOS push/pop and card-zoom ---- */
.wsb-stack{position:relative;z-index:1;flex:1 1 auto;min-height:0;overflow:hidden}
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
.wsb-home{display:flex;flex-direction:column;height:100%;min-height:0;box-sizing:border-box;
  padding:calc(var(--dsh-frame-top-clearance,0px) + 18px) 22px 18px}
.wsb-homeHead{display:flex;align-items:flex-end;gap:10px;flex-wrap:wrap;margin-bottom:15px;flex:0 0 auto}
.wsb-homeTitle{min-width:0;margin-right:auto}
.wsb-homeTitle h1{margin:0;font-size:20px;font-weight:660;letter-spacing:.2px}
.wsb-homeTitle p{margin:3px 0 0;font-size:11.5px;color:var(--dsw-alias-label-secondary)}
.wsb-cards{flex:1 1 auto;min-height:0;overflow:auto;display:grid;gap:14px;align-content:start;
  grid-template-columns:repeat(auto-fill,minmax(228px,1fr));padding:2px 2px 10px}
.wsb-card{position:relative;display:flex;flex-direction:column;gap:9px;text-align:left;appearance:none;font:inherit;
  cursor:pointer;min-height:168px;padding:14px;border-radius:var(--wsb-card-radius);overflow:hidden;
  border:1px solid var(--dsw-alias-border-l1);
  background:color-mix(in srgb,var(--dsw-alias-bg-layer-1) 52%,transparent);
  -webkit-backdrop-filter:blur(26px) saturate(170%);backdrop-filter:blur(26px) saturate(170%);
  box-shadow:0 16px 34px -16px rgba(0,0,0,.55),inset 0 1px 0 color-mix(in srgb,#fff 12%,transparent);
  transition:transform .3s var(--wsb-spring),box-shadow .3s ease,border-color .3s ease;
  animation:wsb-cardIn .5s var(--wsb-spring) both}
.wsb-card:before{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;
  background:linear-gradient(140deg,color-mix(in srgb,#fff 8%,transparent),transparent 46%)}
.wsb-card:hover{transform:translateY(-4px);border-color:var(--dsw-alias-border-l2);
  box-shadow:0 26px 48px -18px rgba(0,0,0,.62),inset 0 1px 0 color-mix(in srgb,#fff 15%,transparent)}
.wsb-card:active{transform:scale(.965)}
.wsb-card[data-open="true"]{opacity:0;transition:opacity .3s ease}
@keyframes wsb-cardIn{from{opacity:0;transform:translateY(16px) scale(.95)}to{opacity:1;transform:none}}
.wsb-cardTop{display:flex;align-items:center;gap:9px;min-width:0}
.wsb-cardIcon{flex:0 0 auto;width:34px;height:34px;border-radius:11px;display:grid;place-items:center;color:#fff;
  box-shadow:0 8px 18px -8px rgba(0,0,0,.6),inset 0 1px 0 rgba(255,255,255,.22)}
.wsb-cardName{font-size:13.5px;font-weight:620;letter-spacing:.2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wsb-cardKind{font-size:10px;color:var(--dsw-alias-label-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wsb-cardDesc{flex:1 1 auto;font-size:11.5px;line-height:1.68;color:var(--dsw-alias-label-secondary);
  display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.wsb-cardFoot{display:flex;align-items:center;gap:7px;padding-top:9px;font-size:10.5px;
  color:var(--dsw-alias-label-secondary);border-top:1px solid var(--dsw-alias-border-l1)}
.wsb-cardFoot b{margin-left:auto;font-weight:500;font-variant-numeric:tabular-nums}
.wsb-cardMenu{position:absolute;top:9px;right:9px;opacity:0;transition:opacity .2s ease}
.wsb-card:hover .wsb-cardMenu{opacity:1}
.wsb-addCard{align-items:center;justify-content:center;border-style:dashed;
  background:color-mix(in srgb,var(--dsw-alias-bg-layer-1) 26%,transparent)}
.wsb-addCard:hover{background:color-mix(in srgb,var(--dsw-alias-bg-layer-1) 42%,transparent)}
.wsb-addCard>span{font-size:12px;color:var(--dsw-alias-label-secondary);display:flex;align-items:center;gap:7px}

/* ---- iOS-style controls (rows now come from .wsb-field / .wsb-fieldSwitch) ---- */
.wsb-popSep{height:1px;background:var(--dsw-alias-border-l1);margin:10px -13px}
.wsb-switch{position:relative;flex:0 0 auto;width:38px;height:22px;padding:0;border:0;border-radius:22px;cursor:pointer;
  background:var(--dsw-alias-bg-layer-2);transition:background .24s ease}
.wsb-switch[aria-checked="true"]{background:var(--dsw-alias-state-success-primary)}
.wsb-switch:after{content:"";position:absolute;top:2px;left:2px;width:18px;height:18px;border-radius:50%;background:#fff;
  box-shadow:0 1px 4px rgba(0,0,0,.35);transition:transform .24s var(--wsb-spring)}
.wsb-switch[aria-checked="true"]:after{transform:translateX(16px)}
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
  --wsb-glass-alpha:52%;--wsb-glass-blur:28px;--wsb-card-radius:20px;--wsb-card-min:258px;--wsb-aurora-dur:26s;
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
/* The four glass materials differ in all four layers: fill strength, blur, saturation,
   brightness, how strong the hairline rim is, and how bright the specular sweep is.
   Values follow the two systems that document glass most precisely: Apple's frosted bar
   (saturate(180%) blur(20px)) and Raycast's surface ladder. */
[data-glass="thin"]{--wsb-glass-alpha:28%;--wsb-glass-blur:14px;--wsb-glass-sat:150%;
  --wsb-glass-bright:1.05;--wsb-glass-rim:.7;--wsb-glass-spec:.6;--wsb-glass-sheen:.5;--wsb-elev-y:10px}
[data-glass="regular"]{--wsb-glass-alpha:46%;--wsb-glass-blur:22px;--wsb-glass-sat:180%;
  --wsb-glass-bright:1;--wsb-glass-rim:1;--wsb-glass-spec:1;--wsb-glass-sheen:1;--wsb-elev-y:16px}
[data-glass="thick"]{--wsb-glass-alpha:64%;--wsb-glass-blur:38px;--wsb-glass-sat:200%;
  --wsb-glass-bright:.99;--wsb-glass-rim:1.1;--wsb-glass-spec:1.15;--wsb-glass-sheen:1.1;--wsb-elev-y:22px}
[data-glass="solid"]{--wsb-glass-alpha:92%;--wsb-glass-blur:0px;--wsb-glass-sat:100%;
  --wsb-glass-bright:1;--wsb-glass-rim:.4;--wsb-glass-spec:.25;--wsb-glass-sheen:.25;--wsb-elev-y:6px}
[data-shape="rounded"]{--wsb-card-radius:20px}
[data-shape="large"]{--wsb-card-radius:28px}
[data-shape="small"]{--wsb-card-radius:12px}
[data-shape="sharp"]{--wsb-card-radius:5px}
[data-shape="pill"]{--wsb-card-radius:34px}
[data-size="large"]{--wsb-card-min:318px}
[data-size="regular"]{--wsb-card-min:258px}
[data-size="compact"]{--wsb-card-min:206px}

/* glass and cards now read the scheme variables */
.wsb-glass{background:color-mix(in srgb,var(--dsw-alias-bg-layer-1) var(--wsb-glass-alpha),transparent);
  -webkit-backdrop-filter:blur(var(--wsb-glass-blur)) saturate(170%);backdrop-filter:blur(var(--wsb-glass-blur)) saturate(170%)}
.wsb-card{border-radius:var(--wsb-card-radius);
  background:color-mix(in srgb,var(--dsw-alias-bg-layer-1) var(--wsb-glass-alpha),transparent);
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
.wsb-stack>.wsb-screen[data-role="console"]{z-index:2}
/* 框架笔记 is its own full-screen window above the home screen, like the console. */
.wsb-stack>.wsb-screen[data-role="notes"]{z-index:2}
/* Once the console has settled, the home screen must stop existing visually: its
   cards would otherwise show straight through the console's frosted panes. */
.wsb-screen[data-concealed="true"]{visibility:hidden;pointer-events:none}

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

/* ---- reference-style card grid, arrangement chosen by the user ---- */
.wsb-cardMenu{display:flex;gap:4px;top:9px;right:9px}
.wsb-cards{grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;padding-bottom:74px;align-content:start}
[data-layout="grid3"] .wsb-cards{grid-template-columns:repeat(3,minmax(0,1fr))}
[data-layout="grid4"] .wsb-cards{grid-template-columns:repeat(4,minmax(0,1fr))}
[data-layout="grid2"] .wsb-cards{grid-template-columns:repeat(2,minmax(0,1fr))}
[data-layout="auto"] .wsb-cards{grid-template-columns:repeat(auto-fill,minmax(var(--wsb-card-min),1fr))}
[data-layout="stagger"] .wsb-cards{grid-template-columns:repeat(3,minmax(0,1fr))}
[data-layout="stagger"] .wsb-cards>*:nth-child(3n+2){margin-top:26px}
/* Desktop mode: icon-first tiles, like a home screen. */
[data-layout="desktop"] .wsb-cards{grid-template-columns:repeat(auto-fill,minmax(var(--wsb-card-min),1fr));gap:18px}
[data-layout="desktop"] .wsb-card{min-height:0;aspect-ratio:var(--wsb-card-ratio,1);align-items:center;justify-content:flex-start;
  gap:0;text-align:center;padding:18px 10px 14px}
[data-layout="desktop"] .wsb-cardTop{flex-direction:column;align-items:center;gap:0;width:100%}
[data-layout="desktop"] .wsb-cardTop>span:last-child{display:flex;flex-direction:column;align-items:center;width:100%}
[data-layout="desktop"] .wsb-cardIcon{width:54px;height:54px;border-radius:16px}
[data-layout="desktop"] .wsb-cardIcon svg{width:27px;height:27px}
[data-layout="desktop"] .wsb-cardName{margin-top:11px;font-size:12.5px;font-weight:600;max-width:100%;text-align:center}
[data-layout="desktop"] .wsb-cardKind,[data-layout="desktop"] .wsb-cardDesc,[data-layout="desktop"] .wsb-cardFoot{display:none}
[data-layout="desktop"] .wsb-status{margin-top:auto;font-size:12px}
[data-layout="desktop"] .wsb-cardMenu{opacity:0;top:8px;right:8px}
[data-layout="desktop"] .wsb-card:hover .wsb-cardMenu{opacity:1}

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
@property --wsb-spin{syntax:'<angle>';initial-value:0deg;inherits:false}
.wsb-card[data-running="true"]{
  --wsb-ring:var(--wsb-g1,#4facfe);
  --wsb-ring2:var(--wsb-g3,#f472b6);
  border:1px solid transparent}
/* Inside: two soft pools of colour, blurred, drifting — the liquid part.
   The tone drift lives on this same pseudo-element rather than on the card root: a filter
   on the root invalidates the whole tile (caption, glyphs, its own backdrop-filter) on
   every frame, whereas here the blur already forces a re-raster, so the hue rides along
   for free. */
.wsb-card[data-running="true"]::before{
  content:"";position:absolute;inset:-12%;border-radius:inherit;pointer-events:none;z-index:0;
  background:
    radial-gradient(44% 46% at 22% 26%,var(--wsb-ring) 0%,transparent 70%),
    radial-gradient(48% 50% at 78% 74%,var(--wsb-ring2) 0%,transparent 72%),
    radial-gradient(38% 40% at 62% 10%,var(--wsb-g5,#ffd166) 0%,transparent 74%);
  filter:blur(26px);opacity:.22;
  animation:wsb-liquid 19s ease-in-out infinite alternate,
    wsb-hue 18s ease-in-out infinite}
/* The edge: a 1px hairline rim tinted by the running colour, an inner catch-light, and a
   faint inward glow. The outward halo is a whisper — enough to lift the tile off the
   surface, not enough to read as neon. */
.wsb-card[data-running="true"]::after{
  content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;z-index:0;
  box-shadow:
    inset 0 0 0 1px color-mix(in srgb,var(--wsb-ring) 38%,transparent),
    inset 0 0 22px -8px color-mix(in srgb,var(--wsb-ring) 55%,transparent),
    inset 1px 1px 0 0 rgba(255,255,255,.10),
    0 0 14px -6px color-mix(in srgb,var(--wsb-ring) 40%,transparent);
  animation:wsb-liquidPulse 7.5s ease-in-out infinite}
/* Glass needs something to sit on: the content is lifted above both light layers. */
.wsb-card[data-running="true"]>*{position:relative;z-index:1}
/* Slow colour drift, held small so it reads as refraction, never as a hue flash. */
@keyframes wsb-hue{
  0%,100%{filter:hue-rotate(-7deg) saturate(1.04)}
  50%{filter:hue-rotate(8deg) saturate(1.1)}}
/* The pools slide and change scale, which is what makes it look like the light is moving. */
@keyframes wsb-liquid{
  0%{transform:translate3d(-2%,-1%,0) scale(1.04) rotate(0deg)}
  50%{transform:translate3d(2%,2%,0) scale(1.09) rotate(5deg)}
  100%{transform:translate3d(1%,-2%,0) scale(1.06) rotate(-3deg)}}
@keyframes wsb-liquidPulse{0%,100%{opacity:.72}50%{opacity:.95}}
[data-layout="list"] .wsb-cards{grid-template-columns:minmax(0,1fr)}
[data-layout="list"] .wsb-card{min-height:0;flex-direction:row;align-items:center;gap:12px;padding:11px 14px}
[data-layout="list"] .wsb-cardDesc{display:none}
[data-layout="list"] .wsb-status{font-size:13px;margin-left:auto;flex:0 0 auto}
[data-layout="list"] .wsb-cardFoot{display:none}
.wsb-card{min-height:174px;gap:9px;padding:15px 15px 13px}
.wsb-cardIcon{width:30px;height:30px;border-radius:9px}
.wsb-status{font-size:19px;font-weight:640;letter-spacing:.3px;line-height:1.28}
.wsb-status[data-live="true"]{color:var(--wsb-c3)}
.wsb-cardFoot{margin-top:auto}
.wsb-addCard>span{flex-direction:column;gap:8px}

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
[data-layout="center"] .wsb-cards{grid-template-columns:repeat(auto-fit,minmax(var(--wsb-card-min),calc(var(--wsb-card-min) * 1.4)));justify-content:center}
[data-layout="left"] .wsb-cards{grid-template-columns:repeat(auto-fit,minmax(var(--wsb-card-min),calc(var(--wsb-card-min) * 1.4)));justify-content:start}
[data-layout="right"] .wsb-cards{grid-template-columns:repeat(auto-fit,minmax(var(--wsb-card-min),calc(var(--wsb-card-min) * 1.4)));justify-content:end}

/* Widget sizes on the desktop grid. */
[data-layout="desktop"] .wsb-card[data-size="large"]{grid-column:span 2;grid-row:span 2;aspect-ratio:auto}
[data-layout="desktop"] .wsb-card[data-size="wide"]{grid-column:span 2;aspect-ratio:auto}
[data-layout="desktop"] .wsb-card[data-size="small"] .wsb-cardIcon{width:42px;height:42px;border-radius:13px}

/* Card geometry: square (default) or rectangle. The wide / large widget sizes above keep
   their own shape, so the ratio only drives the plain tiles. */
[data-layout="desktop"][data-form="rectangle"] .wsb-card:not([data-size="wide"]):not([data-size="large"]){aspect-ratio:4 / 3}

/* Edit popover on a desktop tile. */
.wsb-cardEdit{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:6;width:min(210px,90%);
  display:flex;flex-direction:column;gap:7px;padding:11px;border-radius:16px;text-align:left;
  border:1px solid var(--dsw-alias-border-l2);
  background:color-mix(in srgb,var(--dsw-alias-bg-overlay) 94%,transparent);
  -webkit-backdrop-filter:blur(24px) saturate(180%);backdrop-filter:blur(24px) saturate(180%);
  box-shadow:0 18px 40px -16px rgba(0,0,0,.7)}
.wsb-cardEdit>span{font-size:10.5px;color:var(--dsw-alias-label-secondary)}
.wsb-cardEditSizes{display:flex;gap:5px}
.wsb-cardEditSizes>button{flex:1 1 0;height:30px;border-radius:9px;border:1px solid var(--dsw-alias-border-l1);
  background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:11px;cursor:pointer}
.wsb-cardEditSizes>button[data-on="true"]{background:color-mix(in srgb,var(--wsb-c1) 26%,transparent);color:var(--dsw-alias-label-primary)}

/* ---- 框架笔记: a standalone notebook window ---- */
.wsb-notes{flex:1 1 auto;min-height:0;display:grid;grid-template-columns:270px minmax(0,1fr);
  grid-template-rows:minmax(0,1fr);gap:12px;position:relative;z-index:1}
.wsb-noteTree,.wsb-noteMain{min-height:0;display:flex;flex-direction:column;overflow:hidden}
.wsb-noteTree .wsb-body{overflow:auto}
.wsb-noteRows{display:flex;flex-direction:column;gap:2px}
.wsb-noteBranch{display:flex;flex-direction:column;gap:1px}
.wsb-noteRow{display:flex;align-items:center;gap:2px;border-radius:9px;
  border:1px solid transparent;transition:background .18s ease,border-color .18s ease}
.wsb-noteRow:hover{background:color-mix(in srgb,var(--dsw-alias-bg-layer-2) 70%,transparent)}
.wsb-noteRow[data-sel="true"]{background:color-mix(in srgb,var(--wsb-c1) 18%,transparent);
  border-color:color-mix(in srgb,var(--wsb-c1) 42%,transparent)}
.wsb-noteRowMain{flex:1 1 auto;min-width:0;display:flex;align-items:center;gap:7px;appearance:none;border:0;
  background:transparent;color:inherit;font:inherit;font-size:11.5px;text-align:left;cursor:pointer;
  padding:5px 4px}
.wsb-noteRowTitle{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wsb-noteRowMeta{flex:0 0 auto;font-size:9.5px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}
.wsb-noteRowBtn{flex:0 0 auto;width:20px;height:20px;padding:0;border-radius:6px;cursor:pointer;
  appearance:none;border:1px solid var(--dsw-alias-border-l1);background:transparent;
  color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;line-height:1}
.wsb-noteRowBtn:hover{color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-border-l2)}
.wsb-noteRowBtn[data-tone="danger"]:hover{color:var(--dsw-alias-state-error-primary)}
.wsb-noteMain{overflow:auto}
.wsb-noteBar{display:flex;align-items:center;gap:5px;flex-wrap:wrap;padding:9px 11px;
  border-bottom:1px solid var(--dsw-alias-border-l1);flex:0 0 auto;
  background:color-mix(in srgb,var(--dsw-alias-bg-layer-2) 55%,transparent)}
.wsb-noteBar .wsb-btn[data-on="true"]{background:color-mix(in srgb,var(--wsb-c1) 26%,transparent);
  color:var(--dsw-alias-label-primary);border-color:color-mix(in srgb,var(--wsb-c1) 46%,transparent)}
.wsb-noteSep{width:1px;height:18px;background:var(--dsw-alias-border-l1);margin:0 2px}
.wsb-noteColor{width:19px;height:19px;border-radius:50%;cursor:pointer;padding:0;
  border:1px solid var(--dsw-alias-border-l2);appearance:none}
.wsb-noteColor[data-on="true"]{box-shadow:0 0 0 2px var(--dsw-alias-bg-base),0 0 0 3.5px var(--wsb-c1)}
.wsb-noteField{display:inline-flex;align-items:center;gap:5px;font-size:10.5px;
  color:var(--dsw-alias-label-secondary);white-space:nowrap}
.wsb-noteField input[type="range"]{width:74px}
.wsb-noteDoc{display:flex;flex-direction:column;gap:9px;padding:11px 12px 14px;min-height:0}
.wsb-noteTitle{font-size:14px;font-weight:600}
/* The paper is always light, so dark ink stays readable in either theme. */
.wsb-notePaper{position:relative;border-radius:14px;overflow:hidden;border:1px solid var(--dsw-alias-border-l1);
  background:
    repeating-linear-gradient(180deg,transparent 0 27px,rgba(0,0,0,.06) 27px 28px),
    #fdfdfb;
  box-shadow:inset 0 1px 0 rgba(255,255,255,.7)}
.wsb-noteCanvas{display:block;width:100%;height:auto;cursor:crosshair;
  touch-action:none;-webkit-user-select:none;user-select:none}
.wsb-noteBody{min-height:96px;resize:vertical;font-size:12px;line-height:1.7}

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

@media (prefers-reduced-motion:reduce){
  .wsb-glass,.wsb-aurora i,.wsb-card,.wsb-screen,.wsb-dockPop,.wsb-dock,.wsb-xfade{animation:none}
  .wsb-round[data-flash="true"]::after{animation:none;display:none}
  .wsb-glass,.wsb-card,.wsb-segBtn,.wsb-chip,.wsb-btn,.wsb-grid,.wsb-dockBtn{transition:none}
  .wsb-screen[data-anim]{opacity:1 !important;transform:none !important;border-radius:0 !important}
}
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
        deleteModule: '删除模块', moduleDesc: '模块说明',
        kindGame: '游戏开发', kindNotebook: '框架笔记', kindResearch: '综合研究', kindBlank: '空白模块',
        idle: '空闲', busy: '运行中', noSessionBound: '未绑定会话',
        bgBlur: '模糊', bgDim: '遮罩', bgBright: '亮度', bgGrid: '网格',
        overview: '概览', branch: '分支树', treeView: '视图',
        kTurns: '轮次', kSteps: '步骤', kCalls: '工具调用', kFiles: '改动文件', kLines: '增删行', kErrors: '错误',
        fileImpact: '文件影响', turnTimeline: '轮次时间线', density: '密度', compact: '紧凑', full: '完整',
        consoleTitle: '控制台', projectMap: '项目总览',
        spanAll: '全部', focusHint: '已聚焦，点“全部”取消',
        bgAurora: '流光背景', bgMedia: '上传媒体', bgNetworkImg: '网络图片', bgLibrary: '媒体库',
        bgUseThis: '使用此媒体', bgInUse: '当前使用', bgReset: '恢复初始', bgSpeed: '流光速度',
        appearance: '外观', palette: '配色', glass: '毛玻璃', shape: '卡片形状', cardForm: '卡片比例', size: '卡片大小',
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
        // 框架笔记: a standalone notebook window (no session binding at all).
        frameNotes: '框架笔记', noteTree: '笔记树', noteNewRoot: '新建笔记', noteAdd: '添加子笔记',
        noteDelete: '删除笔记', noteTitle: '标题', noteBody: '正文', noteBodyHint: '在这里写文字…',
        notePen: '画笔', noteEraser: '橡皮', noteSize: '笔宽', noteUndo: '撤销', noteClear: '清空笔迹',
        noteInsertImage: '插入参考图', noteImage: '参考图', noteImageClear: '移除参考图', noteOpacity: '参考图浓度',
        notePressure: '压感', notePressureOn: '已按数位板压感调节笔宽', notePressureOff: '未检测到压感（鼠标固定笔宽）',
        noteEmpty: '在左侧新建一条笔记，然后就可以写画、加文字、贴参考图。',
        notePenHint: '支持数位板压感：压得重线更粗。', noteSaved: '已保存', noteSaveFailed: '本地存储已满，最新笔迹可能没保存',
        noteStrokes: '笔迹',
        notLoaded: '未加载', noUsage: '无用量记录',
        notLoadedHint: '更早的轮次不在当前事件窗口内，点上方 ↑ 加载', notLoadedTurnHint: '该轮事件未加载',
        summary: '对话轮次汇总', sDialogue: '对话汇总', sCode: '代码汇总', sArgs: '参数汇总', sResult: '结果',
        myInput: '我的输入', thinking: '思考', reply: '回复', detail: '详细', collapse: '收起',
        synNote: '（自动梗概：由本轮步骤与工具调用生成，不是翻译；点「详细」看模型原文）',
        synSteps: '本轮共 {n} 步、{c} 次工具调用', synFiles: '涉及 {n} 个文件', synErrors: '{n} 次错误',
        synTools: '主要动作：{list}', synTokens: '消耗 {i} 输入 / {o} 输出',
        share: '占比', cumulative: '累计', compare: '各项目消耗对比',
        collapseHint: '按住左键向下拖动可全部收起', fileImpactShort: '改动文件',
        trail: '轨迹', trailRows: '条记录', panes: '显示项',
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
        deleteModule: 'Delete module', moduleDesc: 'Module description',
        kindGame: 'Game dev', kindNotebook: 'Frame notes', kindResearch: 'Research', kindBlank: 'Blank module',
        idle: 'idle', busy: 'running', noSessionBound: 'no session bound',
        bgBlur: 'Blur', bgDim: 'Scrim', bgBright: 'Brightness', bgGrid: 'Grid',
        overview: 'Overview', branch: 'Branch tree', treeView: 'View',
        kTurns: 'Turns', kSteps: 'Steps', kCalls: 'Tool calls', kFiles: 'Files', kLines: '± lines', kErrors: 'Errors',
        fileImpact: 'File impact', turnTimeline: 'Turn timeline', density: 'Density', compact: 'Compact', full: 'Full',
        consoleTitle: 'Console', projectMap: 'Project overview',
        spanAll: 'All', focusHint: 'focused — tap All to clear',
        bgAurora: 'Aurora background', bgMedia: 'Upload media', bgNetworkImg: 'Network image', bgLibrary: 'Media library',
        bgUseThis: 'Use this media', bgInUse: 'in use', bgReset: 'Reset', bgSpeed: 'Aurora speed',
        appearance: 'Appearance', palette: 'Palette', glass: 'Frost', shape: 'Card shape', cardForm: 'Card ratio', size: 'Card size',
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
        // Frame notes: a standalone notebook window (no session binding at all).
        frameNotes: 'Frame notes', noteTree: 'Note tree', noteNewRoot: 'New note', noteAdd: 'Add child note',
        noteDelete: 'Delete note', noteTitle: 'Title', noteBody: 'Body', noteBodyHint: 'Write here…',
        notePen: 'Pen', noteEraser: 'Eraser', noteSize: 'Width', noteUndo: 'Undo', noteClear: 'Clear strokes',
        noteInsertImage: 'Insert reference', noteImage: 'Reference', noteImageClear: 'Remove reference', noteOpacity: 'Reference opacity',
        notePressure: 'Pressure', notePressureOn: 'Pen width follows stylus pressure', notePressureOff: 'No pressure detected (fixed width)',
        noteEmpty: 'Add a note on the left, then write, draw, type and attach reference images.',
        notePenHint: 'Stylus pressure supported: press harder for a thicker line.', noteSaved: 'Saved', noteSaveFailed: 'Local storage is full; the newest strokes may not be saved',
        noteStrokes: 'strokes',
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
      thin: { name: '薄雾', alpha: 34, blur: 16 },
      regular: { name: '标准', alpha: 52, blur: 28 },
      thick: { name: '厚玻璃', alpha: 68, blur: 42 },
      solid: { name: '实心', alpha: 90, blur: 0 },
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
    const CARD_FORMS = {
      square: { name: '正方形', ratio: '1' },
      rectangle: { name: '长方形', ratio: '4 / 3' },
    };

    const CARD_SIZES = {
      large: { name: '大', min: 318 },
      regular: { name: '中', min: 258 },
      compact: { name: '小', min: 206 },
    };

    /** Surface patterns available under 桌面设置 → 表面效果 → 网格效果. */
    const GRID_SHAPES = {
      none: '无', grid: '网格', dots: '点阵', diagonal: '斜纹',
    };

    /** Widget-like tile sizes for the desktop arrangement. */
    const MODULE_SIZES = {
      small: '小', medium: '中', large: '大', wide: '宽',
    };

    /** Card arrangements the user picks from the dock. */
    const CARD_LAYOUTS = {
      desktop: { name: '桌面' },
      center: { name: '居中' },
      left: { name: '左对齐' },
      right: { name: '右对齐' },
      grid3: { name: '三列' },
      grid4: { name: '四列' },
      grid2: { name: '两列' },
      auto: { name: '自适应' },
      stagger: { name: '错落' },
      list: { name: '列表' },
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

    /** A fresh note tree for a 框架笔记 module: one root node, empty canvas. */
    function defaultNoteRoot() {
      return {
        id: newId('note'), title: '笔记 1', body: '',
        strokes: [], imageKey: '', imageName: '', imageOpacity: 40,
        children: [],
      };
    }

    function defaultModules() {
      return [
        {
          id: newId('mod'), kind: 'game', name: '游戏开发控制台', accent: MODULE_ACCENTS[0], preset: 'triple',
          sessionId: undefined, created: Date.now(),
          desc: 'Godot / 引擎项目的主控台：对话节点树、对话轮次汇总、资源仓库。',
        },
        {
          // Standalone: no session binding, no conversation data — just the notebook.
          id: newId('mod'), kind: 'notebook', name: '框架笔记', accent: MODULE_ACCENTS[2], preset: 'triple',
          sessionId: undefined, created: Date.now() + 1,
          noteRoot: defaultNoteRoot(),
          desc: '独立的框架笔记窗口：树状笔记、手写批注与参考图，不依赖任何对话。',
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
          name: workbench.type === 'research' ? '综合研究台' : '游戏开发控制台',
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

    function normalizeState(parsed) {
      const state = Object.assign(defaultAppState(), parsed);

      if (!Array.isArray(state.modules) || state.modules.length === 0) state.modules = defaultModules();
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
          kind: kind === 'research' || kind === 'game' || kind === 'blank' || kind === 'notebook' ? kind : 'blank',
          // 框架笔记 is standalone: it never carries a session binding, and it always has a tree.
          noteRoot: kind === 'notebook'
            ? (module.noteRoot && typeof module.noteRoot === 'object' ? module.noteRoot : defaultNoteRoot())
            : undefined,
          name: wasDefaultResearch ? '框架笔记' : (typeof module.name === 'string' && module.name ? module.name : '模块 ' + (index + 1)),
          desc: wasDefaultResearch
            ? '独立的框架笔记窗口：树状笔记、手写批注与参考图，不依赖任何对话。'
            : (typeof module.desc === 'string' ? module.desc : ''),
          accent: typeof module.accent === 'string' && module.accent ? module.accent : MODULE_ACCENTS[index % MODULE_ACCENTS.length],
          preset: PRESETS[module.preset] ? module.preset : 'triple',
          // A notebook is standalone, so any stale binding is dropped with the upgrade.
          sessionId: wasDefaultResearch ? undefined
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
      // The media background was cancelled: only the aurora remains, so a legacy mode or a
      // leftover media entry is dropped here instead of showing a stale warning.
      background.mode = 'aurora';
      background.media = [];
      background.activeKey = '';
      state.background = background;

      const appearance = Object.assign(defaultAppearance(), state.appearance || {});
      if (!PALETTES[appearance.palette]) appearance.palette = 'aurora';
      if (!GLASS_SCHEMES[appearance.glass]) appearance.glass = 'regular';
      if (!CARD_SHAPES[appearance.shape]) appearance.shape = 'rounded';
      if (!CARD_FORMS[appearance.form]) appearance.form = 'square';
      if (!CARD_SIZES[appearance.size]) appearance.size = 'regular';
      if (!CARD_LAYOUTS[appearance.layout]) appearance.layout = 'desktop';
      appearance.consoleAurora = appearance.consoleAurora !== false;
      state.appearance = appearance;

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
    function zipStore(files) {
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
      return new Blob(body.concat(tail), { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
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

    function ModuleGlyph({ kind }) {
      const common = { viewBox: '0 0 24 24', width: 18, height: 18, fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, 'aria-hidden': true, style: { display: 'block' } };
      if (kind === 'game') {
        // Dev console: a screen with a prompt caret.
        return h('svg', common,
          h('rect', { x: 2.5, y: 4, width: 19, height: 13.5, rx: 3 }),
          h('path', { d: 'M6.6 8.6l2.8 2.6-2.8 2.6' }),
          h('path', { d: 'M12.4 14h4.6' }),
          h('path', { d: 'M9 20.5h6' }),
          h('path', { d: 'M12 17.5v3' }));
      }
      if (kind === 'notebook') {
        // 框架笔记: a page with a pen, a text line and a placed reference image.
        return h('svg', common,
          h('rect', { x: 4, y: 2.6, width: 16, height: 18.8, rx: 3 }),
          h('path', { d: 'M7.6 17.4l1.1-3.6 7.4-7.4 2.5 2.5-7.4 7.4-3.6 1.1z' }),
          h('path', { d: 'M14.6 8.9l2.5 2.5' }),
          h('path', { d: 'M7.4 6.2h3.4' }));
      }
      if (kind === 'research') {
        return h('svg', common,
          h('circle', { cx: 11, cy: 11, r: 6.4 }),
          h('path', { d: 'M15.8 15.8l3.9 3.9' }),
          h('path', { d: 'M8.4 11h5.2M11 8.4v5.2' }));
      }
      if (kind === 'gamePad') {
        return h('svg', common,
          h('rect', { x: 2.5, y: 6.5, width: 19, height: 11, rx: 5.5 }),
          h('path', { d: 'M7.2 9.9v4.2M5.1 12h4.2' }),
          h('circle', { cx: 15.6, cy: 10.9, r: 1.15, fill: 'currentColor', stroke: 'none' }),
          h('circle', { cx: 17.9, cy: 13.3, r: 1.15, fill: 'currentColor', stroke: 'none' }));
      }
      if (kind === 'researchLegacy') {
        return h('svg', common,
          h('circle', { cx: 10.4, cy: 10.4, r: 6.1 }),
          h('path', { d: 'M15.1 15.1 20.4 20.4' }),
          h('path', { d: 'M7.5 10.4h5.8' }));
      }
      return h('svg', common,
        h('rect', { x: 3.5, y: 3.5, width: 17, height: 17, rx: 4.5 }),
        h('path', { d: 'M12 8.6v6.8M8.6 12h6.8' }));
    }

    //#region background

    function AuroraBlobs() {
      return [0, 1, 2, 3].map((index) => h('i', { key: index }));
    }

    function BackgroundLayer({ background, mediaSrc, mediaKind, onMediaError }) {
      const blurred = background.blur > 0;
      const filters = [];
      // Gentler than v2: 100 no longer means a 26px smear over the whole window.
      if (blurred) filters.push('blur(' + (background.blur / 100 * 14).toFixed(1) + 'px)');
      const mediaStyle = filters.length ? { filter: filters.join(' ') } : undefined;
      // Media wins whenever there is one: no mode to get wrong.
      const showMedia = Boolean(mediaSrc);
      const scrim = (showMedia ? 0.85 : 0.35) * clamp(background.dim, 0, 100) / 100;
      const gridShape = GRID_SHAPES[background.gridShape] ? background.gridShape : 'none';
      return h('div', { className: 'wsb-bg', 'aria-hidden': 'true' },
        h('div', { className: 'wsb-aurora' }, h(AuroraBlobs, null)),
        showMedia && mediaKind === 'video'
          ? h('video', {
            className: 'wsb-bgMedia', 'data-blurred': blurred ? 'true' : 'false',
            src: mediaSrc, style: mediaStyle,
            autoPlay: true, loop: true, muted: true, playsInline: true, onError: onMediaError,
            ref: (node) => {
              // Playback speed is a media-only control under 视频·图片设置.
              if (node) safe(() => { node.playbackRate = clamp(background.mediaSpeed, 25, 200) / 100 });
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
    function DynamicPanel({ t, appearance, background, patch, onAuroraColor, onReset }) {
      return h('div', null,
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
      const radiusOf = (id) => CARD_SHAPES[id].radius;
      return h('div', null,
        h('div', { className: 'wsb-miniHead' }, t.layoutTitle),
        h('div', { className: 'wsb-swatch' }, Object.keys(CARD_LAYOUTS).map((id) => h('button', {
          key: id, type: 'button', className: 'wsb-swatchBtn', 'data-layout-opt': id,
          'data-on': appearance.layout === id ? 'true' : 'false',
          onClick: () => patch({ layout: id }),
        }, t['layout' + id.charAt(0).toUpperCase() + id.slice(1)] || CARD_LAYOUTS[id].name))),
        h('div', { className: 'wsb-popSep' }),
        h('div', { className: 'wsb-miniHead' }, t.cardForm),
        h('div', { className: 'wsb-swatch' }, Object.keys(CARD_FORMS).map((id) => h('button', {
          key: id, type: 'button', className: 'wsb-swatchBtn', 'data-form-opt': id,
          'data-on': appearance.form === id ? 'true' : 'false',
          onClick: () => patch({ form: id }),
        }, h('i', {
          style: {
            display: 'block', width: id === 'square' ? '18px' : '22px', height: '18px',
            background: 'var(--wsb-c1)', opacity: '0.85', borderRadius: '5px',
          },
        }), CARD_FORMS[id].name))),
        h('div', { className: 'wsb-popSep' }),
        h('div', { className: 'wsb-miniHead' }, t.shape),
        h('div', { className: 'wsb-swatch' }, Object.keys(CARD_SHAPES).map((id) => h('button', {
          key: id, type: 'button', className: 'wsb-swatchBtn', 'data-shape-opt': id,
          'data-on': appearance.shape === id ? 'true' : 'false',
          onClick: () => patch({ shape: id }),
        }, h('i', {
          style: {
            display: 'block', width: '18px', height: '18px', background: 'var(--wsb-c1)',
            opacity: '0.85', borderRadius: Math.min(radiusOf(id), 9) + 'px',
          },
        }), CARD_SHAPES[id].name))),
        h('div', { className: 'wsb-miniHead' }, t.size),
        h('div', { className: 'wsb-swatch' }, Object.keys(CARD_SIZES).map((id) => h('button', {
          key: id, type: 'button', className: 'wsb-swatchBtn', 'data-size-opt': id,
          'data-on': appearance.size === id ? 'true' : 'false',
          onClick: () => patch({ size: id }),
        }, CARD_SIZES[id].name))),
        h('div', { className: 'wsb-popSep' }),
        h('div', { className: 'wsb-miniHead' }, t.glass),
        h('div', { className: 'wsb-swatch' }, Object.keys(GLASS_SCHEMES).map((id) => h('button', {
          key: id, type: 'button', className: 'wsb-swatchBtn', 'data-glass-opt': id,
          'data-on': appearance.glass === id ? 'true' : 'false',
          onClick: () => patch({ glass: id }),
        }, GLASS_SCHEMES[id].name))),
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

    function ModuleCard({ t, module, row, hidden, index, onOpen, onRename, onDelete, onPatch, confirming, onConfirmDelete }) {
      const running = Boolean(row && row.running);
      const [editing, setEditing] = useState(false);
      const kindLabel = module.kind === 'game' ? t.kindGame
        : module.kind === 'notebook' ? t.kindNotebook
          : module.kind === 'research' ? t.kindResearch : t.kindBlank;
      const statusTone = running ? 'var(--wsb-c3)' : 'var(--dsw-alias-state-idle-primary)';
      const iconBackground = module.kind === 'notebook'
        ? 'linear-gradient(150deg,var(--wsb-c3),var(--wsb-c2))'
        : module.kind === 'research'
          ? 'linear-gradient(150deg,var(--wsb-c3),var(--wsb-c1))'
          : module.kind === 'game'
            ? 'linear-gradient(150deg,var(--wsb-c1),var(--wsb-c2))'
            : 'linear-gradient(150deg,var(--dsw-alias-label-secondary),var(--wsb-c2))';
      return h('div', {
        className: 'wsb-card', role: 'button', tabIndex: 0,
        'data-open': hidden ? 'true' : 'false',
        // A running module gets the rotating aurora ring.
        'data-running': running ? 'true' : 'false',
        // Widget size, chosen from the tile's edit popover.
        'data-size': MODULE_SIZES[module.size] ? module.size : 'medium',
        style: { animationDelay: Math.min(index, 12) * 45 + 'ms' },
        onClick: (event) => { if (!editing) onOpen(module.id, event) },
        onKeyDown: (event) => { if (event.key === 'Enter') onOpen(module.id, event) },
      },
        h('span', { className: 'wsb-cardTop' },
          h('span', { className: 'wsb-cardIcon', style: { background: iconBackground } }, h(ModuleGlyph, { kind: module.kind })),
          h('span', { style: { minWidth: 0, flex: '1 1 auto' } },
          h('span', { className: 'wsb-cardName', style: { display: 'block' } }, module.name),
            h('span', { className: 'wsb-cardKind', style: { display: 'block' } }, kindLabel))),
        h('span', { className: 'wsb-cardMenu' },
          h('button', {
            type: 'button', className: 'wsb-btn', title: t.editModule, 'data-edit': module.id,
            onClick: (event) => { event.stopPropagation(); setEditing((value) => !value) },
          }, '✎'),
          h('button', {
            type: 'button', className: 'wsb-btn', 'data-tone': 'danger', title: t.deleteModule,
            onClick: (event) => { event.stopPropagation(); confirming ? onDelete(module.id) : onConfirmDelete(module.id) },
          }, confirming ? '✓' : '×')),
        // Apple-widget style edit sheet: rename plus the tile size.
        editing
          ? h('div', { className: 'wsb-cardEdit', 'data-edit-panel': module.id, onClick: (event) => event.stopPropagation() },
            h(WorkbenchInput, {
              value: module.name, autoFocus: true,
              onSubmit: (name) => onRename(module.id, name),
              onCancel: () => setEditing(false),
            }),
            h('span', null, t.moduleSize),
            h('div', { className: 'wsb-cardEditSizes' }, Object.keys(MODULE_SIZES).map((id) => h('button', {
              key: id, type: 'button', className: 'wsb-btn', 'data-module-size': id,
              'data-on': (MODULE_SIZES[module.size] ? module.size : 'medium') === id ? 'true' : 'false',
              onClick: () => onPatch(module.id, (target) => { target.size = id }),
            }, t['size' + id.charAt(0).toUpperCase() + id.slice(1)] || MODULE_SIZES[id]))))
          : null,
        // Reference layout: the status word is the second-largest element on the card.
        h('span', { className: 'wsb-status', 'data-live': running ? 'true' : 'false' }, running ? t.busy : t.idle),
        h('span', { className: 'wsb-cardDesc' }, module.desc || ''),
        h('span', { className: 'wsb-cardFoot' },
          h('i', { className: 'wsb-dot', style: { background: statusTone, color: statusTone } }),
          h('b', { style: { marginLeft: 0 } }, row ? firstLine(row.title || row.id, 22) : t.noSessionBound)));
    }

    /**
     * Home screen: a staggered grid of module cards with a single chrome element —
     * a minimal dock pinned to the bottom. Exactly one dock panel is open at a time,
     * which is also what keeps panels from stacking on top of each other.
     */
    function HomeView({ t, state, rows, hidden, onOpen, onAddModule, onRenameModule, onDeleteModule, onPatchModule, anim, panel, onPanel, bg, appearance, onAppearance, onAnimEnd, concealed }) {
      const [confirming, setConfirming] = useState(null);
      const rowFor = (module) => (module.sessionId ? rows.find((row) => row.id === module.sessionId) : undefined)
        || rows.find((row) => ((row.retainedBy && row.retainedBy.mainView) || 0) > 0);
      const close = () => onPanel(null);
      const dockButton = (id, label, icon, on) => h('button', {
        type: 'button', className: 'wsb-dockBtn', title: label, 'aria-label': label,
        'data-dock': id, 'data-on': on ? 'true' : 'false',
        onClick: (event) => { event.stopPropagation(); onPanel(panel === id ? null : id) },
      }, h(DockIcon, { name: icon }));
      const dockPop = (id) => (panel === id
        ? h('div', { className: 'wsb-dockPop', 'data-panel': id, onClick: (event) => event.stopPropagation() },
          id === 'dynamic' ? h(DynamicPanel, { t, appearance, background: bg.background, patch: bg.patch, onAuroraColor: bg.onAuroraColor, onReset: bg.onReset })
            : h(InterfacePanel, { t, appearance, patch: onAppearance, background: bg.background, patchBackground: bg.patch }))
        : null);
      return h('div', {
        className: 'wsb-screen', 'data-role': 'home', 'data-anim': anim,
        'data-concealed': concealed ? 'true' : 'false',
        onAnimationEnd: (event) => { if (event.target === event.currentTarget) onAnimEnd() },
      },
        h('div', { className: 'wsb-home', onClick: close },
          h('div', { className: 'wsb-homeHead' },
            h('div', { className: 'wsb-homeTitle' },
              h('h1', null, t.panel),
              h('p', null, t.homeHint))),
          h('div', { className: 'wsb-cards' },
            state.modules.map((module, index) => h(ModuleCard, {
              key: module.id, t, module, row: rowFor(module), hidden: hidden.has(module.id), index,
              onOpen, onRename: onRenameModule, onDelete: (id) => { setConfirming(null); onDeleteModule(id) },
              onPatch: onPatchModule,
              confirming: confirming === module.id,
              onConfirmDelete: (id) => setConfirming(id),
            })),
            h('div', {
              className: 'wsb-card wsb-addCard', role: 'button', tabIndex: 0, 'data-add': 'true',
              onClick: (event) => { event.stopPropagation(); onAddModule() },
              onKeyDown: (event) => { if (event.key === 'Enter') onAddModule() },
            }, h('span', null, h('span', { style: { fontSize: '20px', lineHeight: 1 } }, '+'), t.newModule))),
          dockPop('dynamic'),
          dockPop('interface'),
          h('div', { className: 'wsb-dock', onClick: (event) => event.stopPropagation() },
            dockButton('dynamic', t.dockDynamic, 'aurora', panel === 'dynamic'),
            dockButton('interface', t.dockInterface, 'shape', panel === 'interface'),
            h('button', {
              type: 'button', className: 'wsb-dockBtn', title: t.dockAdd, 'aria-label': t.dockAdd, 'data-dock': 'add',
              onClick: (event) => { event.stopPropagation(); onAddModule() },
            }, h(DockIcon, { name: 'plus' })))));
    }

    //#endregion

    //#region console (the original three-pane workbench)

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
      const togglePane = (kind) => patchModule(module.id, (target) => {
        const current = Array.isArray(target.panes) && target.panes.length ? target.panes.slice() : preset.panes.slice();
        const next = current.includes(kind) ? current.filter((item) => item !== kind) : current.concat([kind]);
        target.panes = next.length ? next : [kind];
      });
      const kindLabel = module.kind === 'game' ? t.kindGame
        : module.kind === 'notebook' ? t.kindNotebook
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
            h('button', { type: 'button', className: 'wsb-btn', onClick: onBack, title: t.panel }, '‹ ' + t.panel),
            h('div', { className: 'wsb-title' },
              h('b', null, module.name),
              h('span', null, kindLabel + ' · ' + t.consoleTitle + ' · ' + (data.model.summary.turns + ' ' + t.kTurns + ' · ' + data.model.summary.calls + ' ' + t.kCalls))),
            h('select', {
              className: 'wsb-select', value: sessionId || '', onChange: (event) => onPickSession(event.target.value),
              title: rows.length ? '' : t.noSession,
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
              : h('div', { className: 'wsb-grid', style: { gridTemplateColumns: paneCols } },
                shownPanes.map((kind) => paneFor(kind))),
          sessionId && data.binding && preset.strip
            ? h('div', { className: 'wsb-strip' }, h(TokenStrip, { t, model: data.model, usage: data.usage, pressure: data.pressure }))
            : null));
    }

    //#endregion

    //#region 框架笔记 (standalone notebook)

    /** The note canvas works in a fixed virtual space, so strokes survive any resize. */
    const NOTE_W = 1000;
    const NOTE_H = 700;
    /** Ink colours offered in the note toolbar. */
    const NOTE_COLORS = ['#1d1d1f', '#2f6df6', '#e0384f', '#1f9d55', '#8b5cf6', '#e08a00'];

    /**
     * Paint one committed stroke. Width interpolates between consecutive samples, which is
     * what turns the stylus pressure reading into a line that thins and thickens.
     */
    function paintStroke(ctx, stroke) {
      const points = stroke && Array.isArray(stroke.points) ? stroke.points : [];
      if (!points.length) return;
      const size = clamp(stroke.size || 3, 0.5, 40);
      const usePressure = stroke.pressure !== false;
      const pen = stroke.tool === 'eraser' ? 'eraser' : 'pen';
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = pen === 'eraser' ? '#ffffff' : (stroke.color || '#1d1d1f');
      ctx.fillStyle = ctx.strokeStyle;
      if (points.length === 1) {
        const radius = Math.max(0.4, size * (usePressure ? (points[0].p || 0.5) : 1) / 2);
        ctx.beginPath();
        ctx.arc(points[0].x, points[0].y, radius, 0, Math.PI * 2);
        ctx.fill();
        return;
      }
      for (let index = 1; index < points.length; index += 1) {
        const from = points[index - 1];
        const to = points[index];
        const pressure = usePressure ? clamp(((from.p || 0.5) + (to.p || 0.5)) / 2, 0.08, 1) : 1;
        ctx.beginPath();
        ctx.lineWidth = Math.max(0.3, size * (0.45 + pressure));
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();
      }
    }

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

    function firstNoteId(node) {
      let id = null;
      walkNotes(node, 0, (note) => { if (!id) id = note.id });
      return id;
    }

    function addNoteChild(parent, title) {
      if (!parent) return null;
      if (!Array.isArray(parent.children)) parent.children = [];
      const child = {
        id: newId('note'), title, body: '',
        strokes: [], imageKey: '', imageName: '', imageOpacity: 40,
        children: [],
      };
      parent.children.push(child);
      return child;
    }

    /** Remove `id` from the tree; the root itself is never removable. */
    function removeNote(node, id) {
      if (!node || !Array.isArray(node.children)) return false;
      const index = node.children.findIndex((child) => child.id === id);
      if (index >= 0) { node.children.splice(index, 1); return true }
      return node.children.some((child) => removeNote(child, id));
    }

    function countStrokes(node) {
      let total = 0;
      walkNotes(node, 0, (note) => { total += Array.isArray(note.strokes) ? note.strokes.length : 0 });
      return total;
    }

    /** One row of the note tree, recursively with its children. */
    function NoteRow({ node, depth, selectedId, onSelect, onAdd, onDelete, t }) {
      const strokes = Array.isArray(node.strokes) ? node.strokes.length : 0;
      const children = Array.isArray(node.children) ? node.children : [];
      return h('div', { className: 'wsb-noteBranch' },
        h('div', {
          className: 'wsb-noteRow',
          'data-note': node.id,
          'data-sel': selectedId === node.id ? 'true' : 'false',
          style: { paddingLeft: (6 + depth * 14) + 'px' },
        },
          h('button', {
            type: 'button', className: 'wsb-noteRowMain', title: node.title,
            onClick: () => onSelect(node.id),
          },
            h('span', { className: 'wsb-noteRowTitle' }, node.title || t.noteTitle),
            h('span', { className: 'wsb-noteRowMeta' },
              strokes ? strokes + ' ' + t.noteStrokes : (node.body ? '文' : '·'))),
          h('button', {
            type: 'button', className: 'wsb-noteRowBtn', title: t.noteAdd,
            'data-note-add': node.id,
            onClick: () => onAdd(node.id),
          }, '+'),
          depth > 0
            ? h('button', {
              type: 'button', className: 'wsb-noteRowBtn', 'data-tone': 'danger', title: t.noteDelete,
              'data-note-del': node.id,
              onClick: () => onDelete(node.id),
            }, '×')
            : null),
        children.map((child) => h(NoteRow, {
          key: child.id, node: child, depth: depth + 1,
          selectedId, onSelect, onAdd, onDelete, t,
        })));
    }

    /**
     * 框架笔记: a standalone notebook window. It reads no session, no event window and no
     * token projection — the whole module is its own note tree plus a pressure-sensitive
     * canvas, so it can be opened without any conversation being bound.
     */
    function NotebookView({ t, module, patchModule, onBack, anim, screenStyle, onAnimEnd }) {
      const root = module.noteRoot && typeof module.noteRoot === 'object' ? module.noteRoot : defaultNoteRoot();
      const [selectedId, setSelectedId] = useState(() => firstNoteId(root));
      const [tool, setTool] = useState('pen');
      const [color, setColor] = useState('#1d1d1f');
      const [width, setWidth] = useState(3);
      const [pressure, setPressure] = useState(true);
      const [imageUrl, setImageUrl] = useState(null);
      const canvasRef = useRef(null);
      const imageInputRef = useRef(null);
      const pointsRef = useRef(null);
      const pressureSeenRef = useRef(false);

      const patchTree = useCallback((mutate) => {
        patchModule(module.id, (target) => {
          const base = target.noteRoot && typeof target.noteRoot === 'object' ? target.noteRoot : defaultNoteRoot();
          mutate(base);
          target.noteRoot = base;
        });
      }, [patchModule, module.id]);

      // Keep the selection pointing at a node that still exists.
      useEffect(() => {
        if (!findNote(root, selectedId)) setSelectedId(firstNoteId(root));
      }, [root, selectedId]);

      const note = findNote(root, selectedId);
      const strokes = note && Array.isArray(note.strokes) ? note.strokes : [];

      // The reference image is stored as a Blob in IndexedDB (same store as the media
      // library), so only its key lives in the persistent state.
      useEffect(() => {
        const key = note && note.imageKey;
        if (!key) { setImageUrl(null); return undefined }
        let alive = true;
        mediaGet(key).then((blob) => {
          if (!alive || !blob || typeof window.URL.createObjectURL !== 'function') return;
          const url = safe(() => window.URL.createObjectURL(blob), null);
          if (url) setImageUrl(url);
        }).catch(() => {});
        return () => { alive = false };
      }, [note && note.imageKey]);

      // Repaint the canvas from the committed strokes plus the in-progress one. The
      // in-progress stroke is drawn from the scratch buffer on every move, so the stroke
      // appears immediately without writing to persistent state 60 times a second.
      const draw = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas || typeof canvas.getContext !== 'function') return;
        const ctx = safe(() => canvas.getContext('2d'), null);
        if (!ctx) return;
        const scale = canvas.width / NOTE_W;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.save();
        ctx.scale(scale, scale);
        if (imageUrl) {
          ctx.globalAlpha = clamp((note && note.imageOpacity) != null ? note.imageOpacity : 40, 0, 100) / 100;
          // A failed decode throws inside drawImage; the strokes below must still land.
          safe(() => ctx.drawImage(imageUrl, 4, 4, NOTE_W - 8, NOTE_H - 8));
          ctx.globalAlpha = 1;
        }
        for (const stroke of strokes) paintStroke(ctx, stroke);
        if (pointsRef.current) paintStroke(ctx, pointsRef.current);
        ctx.restore();
      }, [strokes, imageUrl, note && note.imageOpacity]);

      useEffect(() => {
        // High-DPI: the backing store is the CSS size times the device ratio, so pen
        // input lands on the same coordinates the pointer reported.
        const canvas = canvasRef.current;
        if (canvas && typeof canvas.getContext === 'function') {
          const ratio = clamp(window.devicePixelRatio || 1, 1, 3);
          canvas.width = Math.round(NOTE_W * ratio);
          canvas.height = Math.round(NOTE_H * ratio);
        }
        draw();
      }, [draw, selectedId]);

      const worldPoint = (event, canvas) => {
        const rect = canvas.getBoundingClientRect();
        const scale = canvas.width / NOTE_W;
        return {
          x: clamp((event.clientX - rect.left) / (rect.width / NOTE_W), 0, NOTE_W),
          y: clamp((event.clientY - rect.top) / (rect.height / NOTE_H), 0, NOTE_H),
          p: clamp(typeof event.pressure === 'number' ? event.pressure : 0.5, 0.05, 1),
        };
      };

      const onPointerDown = (event) => {
        const canvas = canvasRef.current;
        if (!canvas || !note) return;
        safe(() => canvas.setPointerCapture(event.pointerId));
        const point = worldPoint(event, canvas);
        if (typeof event.pressure === 'number' && event.pressure > 0 && event.pressure !== 0.5) {
          pressureSeenRef.current = true;
        }
        pointsRef.current = {
          tool: tool === 'eraser' ? 'eraser' : 'pen',
          color: tool === 'eraser' ? '#ffffff' : color,
          size: width,
          pressure,
          points: [point],
        };
        draw();
      };

      const onPointerMove = (event) => {
        const canvas = canvasRef.current;
        const stroke = pointsRef.current;
        if (!canvas || !stroke) return;
        // Coalesced events give the full pen sample rate instead of one point per frame.
        const events = typeof event.nativeEvent?.getCoalescedEvents === 'function'
          ? event.nativeEvent.getCoalescedEvents() : null;
        const batch = events && events.length ? events : [event];
        for (const sample of batch) {
          const point = worldPoint(sample, canvas);
          stroke.points.push(point);
        }
        if (typeof event.pressure === 'number' && event.pressure > 0 && event.pressure !== 0.5) {
          pressureSeenRef.current = true;
        }
        draw();
      };

      const finishStroke = () => {
        const stroke = pointsRef.current;
        if (!stroke) return;
        pointsRef.current = null;
        let points = stroke.points.filter((point) => point && isFinite(point.x) && isFinite(point.y));
        if (points.length > 0) {
          if (points.length === 1) {
            // A tap is a dot, not an invisible zero-length segment.
            points = [points[0], { x: points[0].x + 0.6, y: points[0].y + 0.6, p: points[0].p }];
          }
          const committed = { tool: stroke.tool, color: stroke.color, size: stroke.size, pressure: stroke.pressure, points };
          patchTree((base) => {
            const target = findNote(base, selectedId);
            if (!target) return;
            if (!Array.isArray(target.strokes)) target.strokes = [];
            target.strokes.push(committed);
          });
        }
        draw();
      };

      const onUndo = () => patchTree((base) => {
        const target = findNote(base, selectedId);
        if (target && Array.isArray(target.strokes) && target.strokes.length) target.strokes.pop();
      });

      const onClear = () => patchTree((base) => {
        const target = findNote(base, selectedId);
        if (target) target.strokes = [];
      });

      const onPickImage = (event) => {
        const file = event.target.files && event.target.files[0];
        safe(() => { event.target.value = '' });
        if (!file || !note) return;
        const key = 'noteimg-' + newId('x');
        mediaPut(key, file).then((ok) => {
          // A failed write must not leave a dangling key in the tree.
          if (!ok) return;
          patchTree((base) => {
            const target = findNote(base, selectedId);
            if (target) { target.imageKey = key; target.imageName = file.name || '' }
          });
        }).catch(() => {});
      };

      const onClearImage = () => {
        const key = note && note.imageKey;
        if (key) mediaRemove(key);
        patchTree((base) => {
          const target = findNote(base, selectedId);
          if (target) { target.imageKey = ''; target.imageName = '' }
        });
      };

      /** A tool button in the note toolbar. */
      const toolButton = (id, label, on) => h('button', {
        key: id, type: 'button', className: 'wsb-btn', 'data-note-tool': id,
        'data-on': on ? 'true' : 'false', title: label,
        onClick: () => setTool(id),
      }, label);

      const treeRows = [];
      walkNotes(root, 0, (node, depth) => treeRows.push({ node, depth }));

      return h('div', {
        className: 'wsb-screen', 'data-role': 'notes', 'data-anim': anim, style: screenStyle,
        onAnimationEnd: (event) => { if (event.target === event.currentTarget) onAnimEnd() },
      },
        h('div', { className: 'wsb-root' },
          h('div', { className: 'wsb-head' },
            h('button', { type: 'button', className: 'wsb-btn', onClick: onBack, title: t.panel }, '‹ ' + t.panel),
            h('div', { className: 'wsb-title' },
              h('b', null, module.name),
              h('span', null, t.kindNotebook + ' · ' + t.noteTree + ' · ' + countStrokes(root) + ' ' + t.noteStrokes)),
            h('span', { className: 'wsb-badge', 'data-note-pressure': pressureSeenRef.current ? 'on' : 'off' },
              t.notePressure + ': ' + (pressureSeenRef.current ? t.notePressureOn : t.notePressureOff))),
          h('div', { className: 'wsb-notes' },
            h('div', { className: 'wsb-glass wsb-noteTree' },
              h(PaneHead, { title: t.noteTree, sub: treeRows.length + '' }),
              h('div', { className: 'wsb-body' },
                h('button', {
                  type: 'button', className: 'wsb-btn', style: { width: '100%', marginBottom: '8px' },
                  'data-note-new': '1',
                  onClick: () => {
                    let created = null;
                    patchTree((base) => {
                      if (!Array.isArray(base.children)) base.children = [];
                      created = addNoteChild(base, t.noteNewRoot + ' ' + (base.children.length + 1));
                    });
                    if (created) setSelectedId(created.id);
                  },
                }, '+ ' + t.noteNewRoot),
                treeRows.length ? h('div', { className: 'wsb-noteRows' }, treeRows.map((row) => h(NoteRow, {
                  key: row.node.id, node: row.node, depth: row.depth, selectedId, t,
                  onSelect: setSelectedId,
                  onAdd: (id) => {
                    let created = null;
                    patchTree((base) => { created = addNoteChild(findNote(base, id), t.noteNewRoot) });
                    if (created) setSelectedId(created.id);
                  },
                  onDelete: (id) => patchTree((base) => { removeNote(base, id) }),
                }))) : h('div', { className: 'wsb-empty' }, t.noteEmpty))),
            h('div', { className: 'wsb-glass wsb-noteMain' },
              h('div', { className: 'wsb-noteBar' },
                toolButton('pen', t.notePen, tool === 'pen'),
                toolButton('eraser', t.noteEraser, tool === 'eraser'),
                h('span', { className: 'wsb-noteSep' }),
                NOTE_COLORS.map((hex) => h('button', {
                  key: hex, type: 'button', className: 'wsb-noteColor', 'data-note-color': hex,
                  'data-on': color === hex && tool === 'pen' ? 'true' : 'false',
                  title: hex, style: { background: hex },
                  onClick: () => { setColor(hex); setTool('pen') },
                })),
                h('span', { className: 'wsb-noteSep' }),
                h('label', { className: 'wsb-noteField' }, t.noteSize,
                  h('input', {
                    type: 'range', min: 1, max: 14, step: 1, value: width,
                    'data-note-width': '1',
                    onChange: (event) => setWidth(clamp(Number(event.target.value), 1, 14)),
                  })),
                h('label', { className: 'wsb-noteField', title: t.notePenHint }, t.notePressure,
                  h('input', {
                    type: 'checkbox', checked: pressure, 'data-note-pressure-toggle': '1',
                    onChange: (event) => setPressure(Boolean(event.target.checked)),
                  })),
                h('span', { className: 'wsb-noteSep' }),
                h('button', { type: 'button', className: 'wsb-btn', 'data-note-undo': '1', onClick: onUndo }, '↶ ' + t.noteUndo),
                h('button', { type: 'button', className: 'wsb-btn', 'data-tone': 'danger', 'data-note-clear': '1', onClick: onClear }, t.noteClear),
                h('button', { type: 'button', className: 'wsb-btn', 'data-note-image': '1', onClick: () => safe(() => imageInputRef.current && imageInputRef.current.click()) }, t.noteInsertImage),
                note && note.imageKey
                  ? h('button', { type: 'button', className: 'wsb-btn', 'data-note-image-clear': '1', onClick: onClearImage }, t.noteImageClear)
                  : null),
              note
                ? h('div', { className: 'wsb-noteDoc' },
                  h('input', {
                    className: 'wsb-input wsb-noteTitle', value: note.title || '', placeholder: t.noteTitle,
                    'data-note-title': '1',
                    onChange: (event) => patchTree((base) => {
                      const target = findNote(base, selectedId);
                      if (target) target.title = event.target.value;
                    }),
                  }),
                  h('div', { className: 'wsb-notePaper' },
                    h('canvas', {
                      ref: canvasRef, className: 'wsb-noteCanvas',
                      'data-note-canvas': selectedId || '',
                      // Bitmap size is set in an effect; these only drive the layout box.
                      style: { aspectRatio: NOTE_W + ' / ' + NOTE_H },
                      onPointerDown,
                      onPointerMove,
                      onPointerUp: finishStroke,
                      onPointerLeave: finishStroke,
                      onPointerCancel: finishStroke,
                    })),
                  h('textarea', {
                    className: 'wsb-input wsb-noteBody', value: note.body || '', placeholder: t.noteBodyHint,
                    'data-note-body': '1',
                    onChange: (event) => patchTree((base) => {
                      const target = findNote(base, selectedId);
                      if (target) target.body = event.target.value;
                    }),
                  }))
                : h('div', { className: 'wsb-empty' }, t.noteEmpty)),
            h('input', {
              ref: imageInputRef, type: 'file', accept: 'image/*',
              style: { display: 'none' }, onChange: onPickImage,
            }))));
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
      if (activeItem && !mediaFailed) {
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
        setRoute({
          // A notebook module opens as its own window; the rest are conversation consoles.
          name: kind === 'notebook' ? 'notes' : 'console',
          moduleId, origin, phase: 'entering',
        });
      }, []);

      const back = useCallback(() => {
        setRoute((previous) => (previous.name === 'console' && previous.phase !== 'exiting'
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

      const addModule = useCallback(() => {
        patchState((next) => {
          const accent = MODULE_ACCENTS[next.modules.length % MODULE_ACCENTS.length];
          next.modules.push({
            id: newId('mod'), kind: 'game', name: t.newModule + ' ' + (next.modules.length + 1),
            desc: '', accent, preset: 'triple', sessionId: undefined, created: Date.now(),
          });
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
            // Both the conversation console and the notebook window are full-screen
            // surfaces, so Escape has to be able to leave either one.
            if (route.name === 'console' || route.name === 'notes') { event.preventDefault(); back() }
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

      return h('div', {
        className: 'wsb-root',
        'data-palette': appearance.palette,
        'data-glass': appearance.glass,
        'data-shape': appearance.shape,
        'data-form': appearance.form || 'square',
        'data-size': appearance.size,
        'data-layout': appearance.layout,
        style: {
          padding: 0, background: 'transparent',
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
        h('style', null, CSS),
        h(BackgroundLayer, {
          background, mediaSrc, mediaKind,
          onMediaError: () => {
            // A stale object URL (e.g. after reload) gets one re-resolve before we
            // give up and fall back to the aurora layer.
            if (mediaRetry < 3) setMediaRetry(mediaRetry + 1);
            else setMediaFailed(true);
          },
        }),
        h('div', { ref: stackRef, className: 'wsb-stack', style: { height: '100%' } },
          h(HomeView, {
            t, state, rows, hidden, anim: homeAnim,
            onOpen: open, onAddModule: addModule, onRenameModule: renameModule, onDeleteModule: deleteModule,
            onPatchModule: patchModule,
            panel: dockPanel, onPanel: setDockPanel, onAnimEnd: onConsoleAnimEnd,
            appearance, onAppearance: patchAppearance,
            // Once the console has settled the home screen must not stay painted
            // underneath it: the console panes are frosted and would show its cards.
            concealed: (route.name === 'console' || route.name === 'notes') && route.phase === 'idle',
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
                t, module, patchModule,
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
