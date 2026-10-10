/**
 * Builds the assets used by the loading screen.
 *
 *   node scripts/prepare-loader.mjs      (or: npm run loader-assets)
 *
 * Sources (public/images):  alien-running.png (5x5 sheet), cookie-rocket.png (rocket on a round badge)
 * Outputs (public/sprites): alien-running.strip.webp, cookie-rocket.cut.webp
 * Metadata:                 src/data/loaderSprites.json
 *
 *  - running: the sheet mixes full-stride frames with a few crouched "tuck" frames and the head
 *    size drifts from frame to frame. We keep the stride frames, normalise every head to the same
 *    size, align them on head centre (x) and feet (y), and export a @2x horizontal strip.
 *  - rocket:  removes the beige badge + navy disc around the rocket (flood fill from the borders,
 *    stopping at the saturated brown / orange cookie body) and drops the baked-in flame, which is
 *    redrawn live in CSS so it can grow, flicker and shake.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { loadRGBA, saveWebP, removeBackdrop, bbox, blit, blank, resizeRGBA, isLime } from './sprite-lib.mjs'

const IMG = 'public/images'
const OUT = 'public/sprites'
const SS = 2
mkdirSync(OUT, { recursive: true })
mkdirSync('src/data', { recursive: true })

/* ------------------------------------------------------------------ running */

const HEAD_CSS = 44 // head width on screen (CSS px)
const MIN_STRIDE = 0.78 // bbox width / height below this = crouched tuck frame, dropped

async function buildRunning() {
  const sheet = await loadRGBA(`${IMG}/alien-running.png`)
  removeBackdrop(sheet) // no-op for real transparency, cleans a fake white backdrop otherwise
  const cell = sheet.w / 5

  const frames = []
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      const x = c * cell
      const y = r * cell
      const b = bbox(sheet, x, y, x + cell, y + cell)
      const lb = bbox(sheet, x, y, x + cell, y + cell, isLime)
      const head = bbox(sheet, x, lb.y, x + cell, lb.y + Math.round(lb.h * 0.3), isLime)
      frames.push({ x, y, b, head, ratio: b.w / b.h })
    }
  }
  const kept = frames.filter((f) => f.ratio >= MIN_STRIDE)
  console.log(
    'stride ratios:',
    frames.map((f) => f.ratio.toFixed(2)).join(' '),
    `-> keeping ${kept.length}/${frames.length}`,
  )

  // every frame is scaled so its head is HEAD_CSS wide (@2x)
  const placed = kept.map((f) => {
    const s = (HEAD_CSS * SS) / f.head.w
    const ax = (f.head.x + f.head.w / 2 - f.x) * s // head centre, in scaled cell coords
    const fy = (f.b.y + f.b.h - f.y) * s // feet
    return { f, s, ax, fy, bx: (f.b.x - f.x) * s, by: (f.b.y - f.y) * s, bw: f.b.w * s, bh: f.b.h * s }
  })
  let left = 0
  let right = 0
  let up = 0
  for (const p of placed) {
    left = Math.max(left, p.ax - p.bx)
    right = Math.max(right, p.bx + p.bw - p.ax)
    up = Math.max(up, p.fy - p.by)
  }
  const pad = 4 * SS
  const cw = SS * Math.ceil((left + right + pad * 2) / SS)
  const ch = SS * Math.ceil((up + pad) / SS)

  const strip = blank(cw * placed.length, ch)
  for (let i = 0; i < placed.length; i++) {
    const { f, s, ax, fy } = placed[i]
    const crop = blank(Math.round(cell), Math.round(cell))
    blit(crop, sheet, Math.round(f.x), Math.round(f.y), Math.round(cell), Math.round(cell), 0, 0)
    const scaled = await resizeRGBA(crop, Math.round(cell * s), Math.round(cell * s))
    const tile = blank(cw, ch)
    blit(tile, scaled, 0, 0, scaled.w, scaled.h, Math.round(pad + left - ax), Math.round(ch - fy))
    blit(strip, tile, 0, 0, cw, ch, i * cw, 0)
  }
  await saveWebP(strip, `${OUT}/alien-running.strip.webp`)
  return {
    src: '/sprites/alien-running.strip.webp',
    frames: placed.length,
    cellW: cw / SS,
    cellH: ch / SS,
    anchorX: (pad + left) / SS,
    fps: 20,
  }
}

/* ------------------------------------------------------------------- rocket */

/** Pixels that belong to the badge / sky (everything but the saturated brown + orange cookie). */
function isSky(r, g, b) {
  const mx = Math.max(r, g, b)
  const mn = Math.min(r, g, b)
  const sat = mx === 0 ? 0 : (mx - mn) / mx
  if (b >= r - 6) return true // navy disc, white stars
  return sat < 0.42 // beige badge, pale highlights
}

async function buildRocket() {
  const src = await loadRGBA(`${IMG}/cookie-rocket.png`)
  const { data, w, h } = src
  // The rocket body ends where the baked-in flame starts: the flame hangs between the two fins
  // (centre column) a bit higher than the fin tips on the sides.
  const cutY = (x) => (x > 195 && x < 305 ? 352 : 392)
  const seen = new Uint8Array(w * h)
  const stack = []
  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return
    const p = y * w + x
    if (seen[p]) return
    const i = p * 4
    const flame = y >= cutY(x)
    if (!flame && data[i + 3] >= 128 && !isSky(data[i], data[i + 1], data[i + 2])) return
    seen[p] = 1
    stack.push(p)
  }
  for (let x = 0; x < w; x++) {
    push(x, 0)
    push(x, h - 1)
  }
  for (let y = 0; y < h; y++) {
    push(0, y)
    push(w - 1, y)
  }
  while (stack.length) {
    const p = stack.pop()
    const x = p % w
    const y = (p - x) / w
    push(x + 1, y)
    push(x - 1, y)
    push(x, y + 1)
    push(x, y - 1)
  }
  for (let p = 0; p < seen.length; p++) if (seen[p]) data[p * 4 + 3] = 0

  // keep only the biggest connected blob (drops stray stars / specks)
  const label = new Int32Array(w * h)
  let best = { id: 0, size: 0 }
  let next = 1
  for (let p = 0; p < w * h; p++) {
    if (label[p] || data[p * 4 + 3] < 40) continue
    const id = next++
    let size = 0
    const q = [p]
    label[p] = id
    while (q.length) {
      const c = q.pop()
      size++
      const x = c % w
      const y = (c - x) / w
      for (const [nx, ny] of [
        [x + 1, y],
        [x - 1, y],
        [x, y + 1],
        [x, y - 1],
      ]) {
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
        const n = ny * w + nx
        if (label[n] || data[n * 4 + 3] < 40) continue
        label[n] = id
        q.push(n)
      }
    }
    if (size > best.size) best = { id, size }
  }
  for (let p = 0; p < w * h; p++) if (label[p] !== best.id) data[p * 4 + 3] = 0

  const b = bbox(src, 0, 0, w, h)
  const pad = 4
  const crop = blank(b.w + pad * 2, b.h + pad * 2)
  blit(crop, src, b.x, b.y, b.w, b.h, pad, pad)
  await saveWebP(crop, `${OUT}/cookie-rocket.cut.webp`)
  // porthole centre in the original image: (248, 175)
  return {
    src: '/sprites/cookie-rocket.cut.webp',
    w: crop.w,
    h: crop.h,
    portX: +((248 - b.x + pad) / crop.w).toFixed(4),
    portY: +((175 - b.y + pad) / crop.h).toFixed(4),
  }
}

const meta = { running: await buildRunning(), rocket: await buildRocket() }
writeFileSync('src/data/loaderSprites.json', JSON.stringify(meta, null, 2))
console.log(JSON.stringify(meta, null, 2))
