#!/usr/bin/env node
/**
 * Renders every FRIENDS ZONE raster asset from one source of truth (scripts/brand/mark.mjs + public/fonts).
 * Uses the Playwright Chromium already available in CI/dev containers (real Arabic shaping for wordmarks).
 *   node scripts/brand/generate-assets.mjs [outDir=brand-assets]
 * Output mirrors where files go: <out>/public/**, <out>/android/res/**, <out>/social/**, <out>/logos/**.
 */
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { tile, bare, padded } from './mark.mjs'
const require = createRequire(import.meta.url)
const { chromium } = require('playwright')
const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '../..')
const OUT = resolve(ROOT, process.argv[2] ?? 'brand-assets')
const font = (f) => `data:font/woff2;base64,${readFileSync(resolve(ROOT, 'public/fonts', f)).toString('base64')}`
const FONTS = `
@font-face{font-family:D;font-weight:800;src:url(${font('baloo-bhaijaan-2-latin-800-normal.woff2')})}
@font-face{font-family:D;font-weight:800;src:url(${font('baloo-bhaijaan-2-arabic-800-normal.woff2')});unicode-range:U+0600-06FF,U+FB50-FDFF,U+FE70-FEFC}
@font-face{font-family:T;font-weight:600;src:url(${font('cairo-latin-600-normal.woff2')})}
@font-face{font-family:T;font-weight:600;src:url(${font('cairo-arabic-600-normal.woff2')});unicode-range:U+0600-06FF,U+FB50-FDFF,U+FE70-FEFC}`
const page = (w, h, body, bg = 'transparent') => `<!doctype html><html><head><meta charset="utf-8"><style>${FONTS}
*{margin:0;box-sizing:border-box}html,body{width:${w}px;height:${h}px;background:${bg};overflow:hidden}
.c{width:100%;height:100%;display:grid;place-items:center}.zone{background:linear-gradient(90deg,#20D5D2,#3887FF);-webkit-background-clip:text;color:transparent}
.wm{font-family:D;font-weight:800;color:#F5F5FA;line-height:1;white-space:nowrap}.tg{font-family:T;font-weight:600;color:#A5A9BB;white-space:nowrap}
.navy{background:radial-gradient(120% 90% at 20% 0%,#2A2470 0%,#101426 55%) #101426}
.dots{background-image:radial-gradient(rgba(245,245,250,.07) 1.5px,transparent 1.6px);background-size:28px 28px}
</style></head><body>${body}</body></html>`
const svgBox = (svg, size) => `<div style="width:${size}px;height:${size}px">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</div>`
const wordmark = (lang, px) => lang === 'ar'
  ? `<div class="wm" dir="rtl" style="font-size:${px}px">فريندز <span class="zone">زون</span></div>`
  : `<div class="wm" style="font-size:${px}px;letter-spacing:.02em">FRIENDS <span class="zone">ZONE</span></div>`

const jobs = []
const add = (file, w, h, html, opts = {}) => jobs.push({ file, w, h, html, ...opts })
const markPage = (svg, s, bg) => page(s, s, `<div class="c">${svgBox(svg, s)}</div>`, bg)

// ---------- web / PWA ----------
writeOut('public/brand/fz-mark.svg', tile('fz'))
writeOut('public/brand/fz-mark-bare.svg', bare('fzb'))
writeOut('public/brand/fz-mark-mono-white.svg', bare('fzw', { mono: '#F5F5FA' }))
writeOut('public/favicon.svg', tile('fzf', { small: true }))
for (const s of [16, 32, 48]) add(`public/favicon-${s}.png`, s, s, markPage(tile('f' + s, { small: s <= 32 }), s))
add('public/apple-touch-icon.png', 180, 180, markPage(tile('a', { full: true }), 180))
for (const s of [192, 512]) add(`public/icon-${s}.png`, s, s, markPage(tile('i' + s), s))
add('public/icon-maskable-512.png', 512, 512, markPage(padded('m', 0.8, 'brand'), 512))

// ---------- Android launcher (legacy, round, adaptive foreground on a 108dp canvas) ----------
const dens = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 }
for (const [d, k] of Object.entries(dens)) {
  const s = Math.round(48 * k), fg = Math.round(108 * k)
  add(`android/res/mipmap-${d}/ic_launcher.png`, s, s, markPage(tile('l' + d), s))
  add(`android/res/mipmap-${d}/ic_launcher_round.png`, s, s, page(s, s, `<div class="c"><div style="width:${s}px;height:${s}px;border-radius:50%;overflow:hidden">${svgBox(tile('r' + d, { full: true }), s)}</div></div>`))
  add(`android/res/mipmap-${d}/ic_launcher_foreground.png`, fg, fg, markPage(padded('g' + d, 0.58, null), fg))
}
writeOut('android/res/values/ic_launcher_background.xml', `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#6D4AFF</color>\n</resources>\n`)

// ---------- Android splash (portrait + landscape, every density) ----------
const splash = (w, h) => {
  const m = Math.round(Math.min(w, h) * 0.26)
  return page(w, h, `<div class="c navy"><div style="display:flex;flex-direction:column;align-items:center;gap:${Math.round(m * 0.18)}px">
    ${svgBox(tile('s' + w), m)}${wordmark('en', Math.round(m * 0.3))}${wordmark('ar', Math.round(m * 0.26))}</div></div>`)
}
const port = { mdpi: [270, 480], hdpi: [405, 720], xhdpi: [540, 960], xxhdpi: [810, 1440], xxxhdpi: [1080, 1920] }
const land = { mdpi: [853, 480], hdpi: [1280, 720], xhdpi: [1706, 960], xxhdpi: [2560, 1440], xxxhdpi: [3413, 1920] }
for (const [d, [w, h]] of Object.entries(port)) add(`android/res/drawable-port-${d}/splash.png`, w, h, splash(w, h), { opaque: true })
for (const [d, [w, h]] of Object.entries(land)) add(`android/res/drawable-land-${d}/splash.png`, w, h, splash(w, h), { opaque: true })
add('android/res/drawable/splash.png', 270, 480, splash(270, 480), { opaque: true })

// ---------- logos ----------
const lockup = (lang, tagline, bg) => page(1600, 520, `<div class="c ${bg}"><div dir="${lang === 'ar' ? 'rtl' : 'ltr'}" style="display:flex;align-items:center;gap:56px">
  ${svgBox(tile('k' + lang + tagline + bg), 300)}<div style="display:flex;flex-direction:column;gap:26px">${wordmark(lang, lang === 'ar' ? 150 : 132)}
  ${tagline ? `<div class="tg" style="font-size:44px">${lang === 'ar' ? 'عالم أصحابك.. واللعب مالوش حدود.' : 'Your Friends. Your Games. Your Zone.'}</div>` : ''}</div></div></div>`)
add('logos/fz-logo-horizontal-en.png', 1600, 520, lockup('en', true, ''))
add('logos/fz-logo-horizontal-ar.png', 1600, 520, lockup('ar', true, ''))
add('logos/fz-logo-horizontal-en-on-navy.png', 1600, 520, lockup('en', false, 'navy'), { opaque: true })
add('logos/fz-logo-stacked-bilingual.png', 1200, 1200, page(1200, 1200, `<div class="c navy dots"><div style="display:flex;flex-direction:column;align-items:center;gap:40px">${svgBox(tile('st'), 420)}${wordmark('en', 120)}${wordmark('ar', 104)}</div></div>`), { opaque: true })
add('logos/fz-monogram.png', 1024, 1024, markPage(tile('mo'), 1024))

// ---------- social ----------
add('social/fz-profile-1024.png', 1024, 1024, markPage(padded('pf', 0.86, 'brand'), 1024), { opaque: true })
add('public/brand/og-image.png', 1200, 630, page(1200, 630, `<div class="c navy dots" style="position:relative">
  <div style="position:absolute;inset:auto -120px -220px auto;width:620px;height:620px;border-radius:50%;border:26px solid rgba(32,213,210,.16)"></div>
  <div style="display:flex;align-items:center;gap:48px;padding:0 80px">${svgBox(tile('og'), 260)}
  <div style="display:flex;flex-direction:column;gap:18px">${wordmark('en', 92)}${wordmark('ar', 80)}
  <div class="tg" style="font-size:30px">Your Friends. Your Games. Your Zone.</div>
  <div style="display:flex;gap:12px;margin-top:8px;font-family:T;font-weight:600;font-size:22px;color:#F5F5FA">${['Story', 'Detective', 'Bakasa', 'Multiplayer'].map((t, i) => `<span style="padding:6px 16px;border-radius:999px;background:${['#3887FF', '#20D5D2', '#FF7A45', '#6D4AFF'][i]}33;border:2px solid ${['#3887FF', '#20D5D2', '#FF7A45', '#6D4AFF'][i]}">${t}</span>`).join('')}</div>
  </div></div></div>`), { opaque: true })
writeOut('public/brand/pattern.svg', `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><g fill="none" stroke="#F5F5FA" stroke-opacity=".06" stroke-width="2" stroke-linecap="round"><path d="M18 30 A20 20 0 0 1 48 14"/><path d="M78 66 A20 20 0 0 1 48 82"/><path d="M40 44h16L40 56h16"/></g><circle cx="16" cy="30" r="3" fill="#E5B85C" fill-opacity=".18"/><circle cx="80" cy="66" r="3" fill="#20D5D2" fill-opacity=".18"/></svg>`)

function writeOut(rel, text) { const f = resolve(OUT, rel); mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, text) }
const browser = await chromium.launch()
const ctx = await browser.newContext({ deviceScaleFactor: 1 })
const p = await ctx.newPage()
for (const j of jobs) {
  const f = resolve(OUT, j.file); mkdirSync(dirname(f), { recursive: true })
  await p.setViewportSize({ width: j.w, height: j.h })
  await p.setContent(j.html, { waitUntil: 'load' }); await p.evaluate(() => document.fonts.ready)
  await p.screenshot({ path: f, omitBackground: !j.opaque, clip: { x: 0, y: 0, width: j.w, height: j.h } })
}
await browser.close()
console.log(`${jobs.length} images rendered into ${OUT}`)
