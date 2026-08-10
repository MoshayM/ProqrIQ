/**
 * ProqrIQ branding export — generates PNG files for all logo variants.
 * Run: node branding/generate-logos.mjs
 * Requires: Playwright (already a dev dependency)
 */

import { chromium } from 'playwright'
import path from 'path'
import { fileURLToPath } from 'url'
import { copyFileSync } from 'fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ─── Logo SVG builder ────────────────────────────────────────────────────────

function logoMarkSVG(size) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="32" height="32" rx="8" fill="#1e2d4e"/>
    <rect x="8" y="8" width="4" height="16" rx="2" fill="white"/>
    <path d="M12 8h4a5 5 0 0 1 0 10h-4" stroke="white" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
    <circle cx="22" cy="22" r="2.5" fill="#e85c1a"/>
    <circle cx="27" cy="19" r="1.5" fill="#e85c1a" opacity="0.7"/>
    <circle cx="24" cy="27" r="1.5" fill="#e85c1a" opacity="0.7"/>
    <line x1="22" y1="22" x2="27" y2="19" stroke="#e85c1a" stroke-width="1" opacity="0.5"/>
    <line x1="22" y1="22" x2="24" y2="27" stroke="#e85c1a" stroke-width="1" opacity="0.5"/>
  </svg>`
}

// ─── HTML templates ──────────────────────────────────────────────────────────

const variants = [
  {
    name: 'logo-mark-64',
    width: 64, height: 64,
    bg: 'transparent',
    html: logoMarkSVG(64),
  },
  {
    name: 'logo-mark-256',
    width: 256, height: 256,
    bg: 'transparent',
    html: logoMarkSVG(256),
  },
  {
    name: 'logo-full-dark',
    width: 320, height: 64,
    bg: 'transparent',
    html: `<div style="display:inline-flex;align-items:center;gap:12px;font-family:'Segoe UI',Arial,sans-serif;">
      ${logoMarkSVG(48)}
      <span style="font-size:26px;font-weight:600;letter-spacing:-0.5px;color:#1e2d4e;line-height:1;">
        Proqr<span style="color:#e85c1a;">IQ</span>
      </span>
    </div>`,
  },
  {
    name: 'logo-full-light',
    width: 320, height: 64,
    bg: '#1e2d4e',
    html: `<div style="display:inline-flex;align-items:center;gap:12px;font-family:'Segoe UI',Arial,sans-serif;">
      ${logoMarkSVG(48)}
      <span style="font-size:26px;font-weight:600;letter-spacing:-0.5px;color:#ffffff;line-height:1;">
        Proqr<span style="color:#e85c1a;">IQ</span>
      </span>
    </div>`,
  },
  {
    name: 'og-image',
    width: 1200, height: 630,
    bg: '#1e2d4e',
    html: `<div style="width:1200px;height:630px;background:linear-gradient(135deg,#1e2d4e 0%,#2d4070 60%,#1a3040 100%);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:32px;font-family:'Segoe UI',Arial,sans-serif;">
      <div style="display:flex;align-items:center;gap:20px;">
        ${logoMarkSVG(100)}
        <span style="font-size:72px;font-weight:700;letter-spacing:-1px;color:#ffffff;line-height:1;">
          Proqr<span style="color:#e85c1a;">IQ</span>
        </span>
      </div>
      <p style="font-size:26px;color:rgba(255,255,255,0.65);letter-spacing:0.5px;margin:0;font-weight:400;">
        B2B Cost Engineering &amp; Quotation Platform
      </p>
      <div style="display:flex;gap:16px;margin-top:8px;">
        <span style="background:rgba(232,92,26,0.18);border:1px solid rgba(232,92,26,0.4);color:#e85c1a;padding:6px 18px;border-radius:20px;font-size:14px;font-weight:600;letter-spacing:0.5px;">AI-POWERED</span>
        <span style="background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);color:rgba(255,255,255,0.7);padding:6px 18px;border-radius:20px;font-size:14px;font-weight:600;letter-spacing:0.5px;">ON-PREMISE</span>
        <span style="background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);color:rgba(255,255,255,0.7);padding:6px 18px;border-radius:20px;font-size:14px;font-weight:600;letter-spacing:0.5px;">B2B MANUFACTURING</span>
      </div>
    </div>`,
  },
  {
    name: 'favicon-32',
    width: 32, height: 32,
    bg: 'transparent',
    html: logoMarkSVG(32),
  },
  // PWA icons — copied to client/public/
  { name: 'icon-32',  width: 32,  height: 32,  bg: 'transparent', html: logoMarkSVG(32)  },
  { name: 'icon-180', width: 180, height: 180, bg: 'transparent', html: logoMarkSVG(180) },
  { name: 'icon-192', width: 192, height: 192, bg: 'transparent', html: logoMarkSVG(192) },
  { name: 'icon-512', width: 512, height: 512, bg: '#1e2d4e',     html: `<div style="width:512px;height:512px;background:#1e2d4e;display:flex;align-items:center;justify-content:center;border-radius:80px;">${logoMarkSVG(320)}</div>` },
]

// ─── Generate PNGs ────────────────────────────────────────────────────────────

const browser = await chromium.launch()
const page = await browser.newPage()

for (const v of variants) {
  await page.setViewportSize({ width: v.width, height: v.height })
  await page.setContent(`<!DOCTYPE html>
<html><head><style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { background:${v.bg}; width:${v.width}px; height:${v.height}px;
         display:flex; align-items:center; justify-content:center; overflow:hidden; }
</style></head>
<body>${v.html}</body></html>`)

  const outPath = path.join(__dirname, `${v.name}.png`)
  await page.screenshot({
    path: outPath,
    clip: { x: 0, y: 0, width: v.width, height: v.height },
    omitBackground: v.bg === 'transparent',
  })
  console.log(`✓ ${v.name}.png  (${v.width}×${v.height})`)
}

await browser.close()

// Copy PWA icons to client/public/ so they're served as static assets
const publicDir = path.join(__dirname, '..', 'client', 'public')
const pwaCopy = ['icon-32', 'icon-180', 'icon-192', 'icon-512', 'og-image']
for (const name of pwaCopy) {
  const src  = path.join(__dirname, `${name}.png`)
  const dest = path.join(publicDir, `${name}.png`)
  copyFileSync(src, dest)
  console.log(`  → copied ${name}.png to client/public/`)
}

console.log('\nAll branding assets saved to /branding/ and PWA icons copied to /client/public/')
