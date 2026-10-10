/**
 * Builds clean, normalised, transparent sprite strips for the alien character.
 *
 *   node scripts/prepare-sprites.mjs
 *
 * Sources (public/images):   alien-idle.png, alien-stairs.png, alien-walking.png
 * Outputs (public/sprites):  alien-idle.strip.webp, alien-stairs.strip.webp, alien-walking.strip.webp
 * Metadata:                  src/data/alienSprites.json
 *
 * Why: the idle / stairs sheets ship with a baked-in checkerboard "fake transparency" and a
 * label, the stairs sheet has a stair chunk glued to every frame, and the three sheets use
 * different frame sizes / scales. This script removes all of that and aligns every frame on the
 * character's feet so the three states can be swapped with zero visual jumps.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import sharp from 'sharp'
import {
  loadRGBA,
  saveWebP,
  removeBackdrop,
  clearRect,
  bbox,
  isLime,
  blit,
  blank,
  resizeRGBA,
} from './sprite-lib.mjs'

const IMG = 'public/images'
const OUT = 'public/sprites'
const HEAD_CSS = 56 // head width of the alien on screen, in CSS px
const SS = 2 // supersampling: strips are exported @2x and displayed @1x
mkdirSync(OUT, { recursive: true })
mkdirSync('src/data', { recursive: true })

/* ------------------------------------------------------------------ helpers */

function boxDilate(mask, w, h, r) {
  const tmp = new Uint8Array(w * h)
  const out = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) {
    let run = 0
    for (let x = 0; x < w; x++) {
      run = mask[y * w + x] ? r + 1 : run - 1
      // forward pass fills to the right
      if (run > 0) tmp[y * w + x] = 1
    }
    run = 0
    for (let x = w - 1; x >= 0; x--) {
      run = mask[y * w + x] ? r + 1 : run - 1
      if (run > 0) tmp[y * w + x] = 1
    }
  }
  for (let x = 0; x < w; x++) {
    let run = 0
    for (let y = 0; y < h; y++) {
      run = tmp[y * w + x] ? r + 1 : run - 1
      if (run > 0) out[y * w + x] = 1
    }
    run = 0
    for (let y = h - 1; y >= 0; y--) {
      run = tmp[y * w + x] ? r + 1 : run - 1
      if (run > 0) out[y * w + x] = 1
    }
  }
  return out
}

const lum = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b

/** Strips the grey stair chunk glued to the alien, keeping body, outline and eyes. */
function isolateAlien(img, rect) {
  const { data, w, h } = img
  const { x: rx, y: ry, w: rw, h: rh } = rect
  const lime = new Uint8Array(w * h)
  for (let y = ry; y < ry + rh; y++) {
    for (let x = rx; x < rx + rw; x++) {
      const i = (y * w + x) * 4
      if (data[i + 3] > 60 && isLime(data[i], data[i + 1], data[i + 2])) lime[y * w + x] = 1
    }
  }
  const lb = bbox(img, rx, ry, rx + rw, ry + rh, isLime)
  const near = boxDilate(lime, w, h, 7)
  const headTop = lb.y - 12
  const headBottom = lb.y + Math.round(lb.h * 0.42)
  for (let y = ry; y < ry + rh; y++) {
    for (let x = rx; x < rx + rw; x++) {
      const p = y * w + x
      const i = p * 4
      if (data[i + 3] === 0) continue
      const inHead = y >= headTop && y <= headBottom && x >= lb.x - 40 && x <= lb.x + lb.w + 40
      const dark = lum(data[i], data[i + 1], data[i + 2]) < 95
      if (lime[p] || inHead || (near[p] && dark)) continue
      data[i + 3] = 0
    }
  }
}

/** Largest run of columns that contain pixels -> frame rectangles. */
function columnRuns(img, y0, y1, minGap) {
  const { data, w } = img
  const filled = new Uint8Array(w)
  for (let x = 0; x < w; x++) {
    for (let y = y0; y < y1; y++) {
      if (data[(y * w + x) * 4 + 3] > 40) {
        filled[x] = 1
        break
      }
    }
  }
  const runs = []
  let start = -1
  let gap = 0
  for (let x = 0; x < w; x++) {
    if (filled[x]) {
      if (start < 0) start = x
      gap = 0
    } else if (start >= 0) {
      gap++
      if (gap >= minGap) {
        runs.push({ x: start, w: x - gap - start + 1 })
        start = -1
        gap = 0
      }
    }
  }
  if (start >= 0) runs.push({ x: start, w: w - start })
  return runs
}

/**
 * frames: [{ img, rect:{x,y,w,h}, anchor?: {x,y} }]
 * Aligns by anchor (default: bbox bottom + head centre) and exports a horizontal strip.
 */
async function buildStrip(name, frames, { fixedAnchor = false, fps }) {
  const metrics = frames.map(({ img, rect }) => {
    const b = bbox(img, rect.x, rect.y, rect.x + rect.w, rect.y + rect.h)
    const lb = bbox(img, rect.x, rect.y, rect.x + rect.w, rect.y + rect.h, isLime)
    const headRows = bbox(
      img,
      rect.x,
      lb.y,
      rect.x + rect.w,
      lb.y + Math.round(lb.h * 0.3),
      isLime,
    )
    return { b, headRows, headW: headRows.w }
  })

  // fixedAnchor: every cell shares the same anchor (relative to its own cell), so the
  // natural sway / bobbing of the walk cycle is preserved instead of being "snapped" out.
  let relFoot = 0
  let relX = 0
  if (fixedAnchor) {
    relFoot = Math.max(...frames.map((f, i) => metrics[i].b.y + metrics[i].b.h - f.rect.y))
    const xs = frames
      .map((f, i) => metrics[i].headRows.x + metrics[i].headRows.w / 2 - f.rect.x)
      .sort((a, b) => a - b)
    relX = xs[Math.floor(xs.length / 2)]
  }
  const anchors = frames.map((f, i) => {
    const m = metrics[i]
    const ax = fixedAnchor ? f.rect.x + relX : m.headRows.x + m.headRows.w / 2
    const fy = fixedAnchor ? f.rect.y + relFoot : m.b.y + m.b.h
    return { ax, fy }
  })

  let left = 0
  let right = 0
  let up = 0
  frames.forEach((_, i) => {
    const { b } = metrics[i]
    const { ax, fy } = anchors[i]
    left = Math.max(left, ax - b.x)
    right = Math.max(right, b.x + b.w - ax)
    up = Math.max(up, fy - b.y)
  })
  left = Math.ceil(left) + 4
  right = Math.ceil(right) + 4
  up = Math.ceil(up) + 4
  const cw = left + right
  const ch = up

  const headW = metrics.map((m) => m.headW).sort((a, b) => a - b)[Math.floor(frames.length / 2)]
  const scale = (HEAD_CSS * SS) / headW
  const cw2 = SS * Math.round((cw * scale) / SS)
  const ch2 = SS * Math.round((ch * scale) / SS)

  const strip = blank(cw2 * frames.length, ch2)
  for (let i = 0; i < frames.length; i++) {
    const cell = blank(cw, ch)
    const { ax, fy } = anchors[i]
    blit(
      cell,
      frames[i].img,
      frames[i].rect.x,
      frames[i].rect.y,
      frames[i].rect.w,
      frames[i].rect.h,
      Math.round(left - (ax - frames[i].rect.x)),
      Math.round(ch - (fy - frames[i].rect.y)),
    )
    const small = await resizeRGBA(cell, cw2, ch2)
    blit(strip, small, 0, 0, cw2, ch2, i * cw2, 0)
  }
  await saveWebP(strip, `${OUT}/${name}.strip.webp`)
  return {
    src: `/sprites/${name}.strip.webp`,
    frames: frames.length,
    cellW: cw2 / SS,
    cellH: ch2 / SS,
    /** x of the alien's centre inside a cell (CSS px) */
    anchorX: (left * scale) / SS,
    fps,
  }
}

/* -------------------------------------------------------------------- idle */

const idleImg = await loadRGBA(`${IMG}/alien-idle.png`)
removeBackdrop(idleImg)
clearRect(idleImg, 0, 0, 1000, 215) // "IDLE (8 FRAMES)" label
const idleRuns = columnRuns(idleImg, 215, idleImg.h, 24).filter((r) => r.w > 80)
const idleFrames = idleRuns.map((r) => ({
  img: idleImg,
  rect: { x: Math.max(0, r.x - 12), y: 0, w: Math.min(idleImg.w, r.x + r.w + 12) - Math.max(0, r.x - 12), h: idleImg.h },
}))

/* ------------------------------------------------------------------ stairs */

const stairsImg = await loadRGBA(`${IMG}/alien-stairs.png`)
removeBackdrop(stairsImg)
clearRect(stairsImg, 0, 0, 1200, 112) // "WALKING DOWN STAIRS" label
const STAIR_CELL = stairsImg.w / 8
const stairsFrames = []
for (let i = 0; i < 8; i++) {
  const rect = { x: Math.round(i * STAIR_CELL), y: 0, w: Math.round(STAIR_CELL), h: stairsImg.h }
  isolateAlien(stairsImg, rect)
  stairsFrames.push({ img: stairsImg, rect })
}

/* ----------------------------------------------------------------- walking */

const walkImg = await loadRGBA(`${IMG}/alien-walking.png`)
const walkFrames = []
const WALK_CELL = walkImg.w / 5
for (let r = 0; r < 5; r++) {
  for (let c = 0; c < 5; c++) {
    walkFrames.push({
      img: walkImg,
      rect: { x: c * WALK_CELL, y: r * WALK_CELL, w: WALK_CELL, h: WALK_CELL },
    })
  }
}

/* -------------------------------------------------------------------- wave */

/**
 * There is no "waving" sheet, so we derive one from the idle sheet: the alien's right arm is
 * erased and a raised arm (same lime body + black outline look) is drawn on top, with the
 * forearm swinging a little more every frame. Coordinates are in @2x sprite pixels.
 */
async function buildWave(idle) {
  const FRAMES = 12
  const PAD = 72 // extra room on the right for the raised arm
  const cw = idle.cellW * SS
  const ch = idle.cellH * SS
  const outW = cw + PAD
  const sheet = await loadRGBA(`${OUT}/alien-idle.strip.webp`)
  const strip = blank(outW * FRAMES, ch)

  // line that separates the right arm from the torso / right leg, as [y, x]
  const divider = [
    [138, 87],
    [166, 91],
    [200, 94],
    [233, 98],
    [270, 101],
  ]
  const dividerX = (y) => {
    for (let i = 0; i < divider.length - 1; i++) {
      const [y0, x0] = divider[i]
      const [y1, x1] = divider[i + 1]
      if (y <= y1) return x0 + ((x1 - x0) * (Math.max(y, y0) - y0)) / (y1 - y0)
    }
    return divider[divider.length - 1][1]
  }

  const shoulder = [90, 152]
  const elbow = [156, 198]
  const forearm = 70

  for (let k = 0; k < FRAMES; k++) {
    const cell = blank(outW, ch)
    blit(cell, sheet, Math.floor((k * idle.frames) / FRAMES) * cw, 0, cw, ch, 0, 0)
    for (let y = 138; y < Math.min(ch, 275); y++) {
      for (let x = Math.ceil(dividerX(y)) + 2; x < outW; x++) cell.data[(y * outW + x) * 4 + 3] = 0
    }

    const angle = (Math.sin((k / FRAMES) * Math.PI * 2) * 28 * Math.PI) / 180
    const hand = [elbow[0] + Math.sin(angle) * forearm, elbow[1] - Math.cos(angle) * forearm]
    const limb = `M${shoulder} L${elbow} L${hand}`
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${outW}" height="${ch}" viewBox="0 0 ${outW} ${ch}">
      <g fill="none" stroke-linecap="round" stroke-linejoin="round">
        <path d="${limb}" stroke="#0a0a0a" stroke-width="17"/>
        <path d="${limb}" stroke="#a8e615" stroke-width="9.5"/>
        <path d="M${shoulder} L${elbow}" stroke="#d6ff5a" stroke-width="2.5" opacity=".7"/>
      </g>
      <circle cx="${hand[0]}" cy="${hand[1]}" r="14" fill="#0a0a0a"/>
      <circle cx="${hand[0]}" cy="${hand[1]}" r="10" fill="#b6ee1e"/>
    </svg>`
    const raw = await sharp(cell.data, { raw: { width: outW, height: ch, channels: 4 } })
      .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
      .raw()
      .toBuffer()
    blit(strip, { data: raw, w: outW, h: ch }, 0, 0, outW, ch, k * outW, 0)
  }
  await saveWebP(strip, `${OUT}/alien-wave.strip.webp`)
  return {
    src: '/sprites/alien-wave.strip.webp',
    frames: FRAMES,
    cellW: outW / SS,
    cellH: ch / SS,
    anchorX: idle.anchorX,
    fps: 12,
  }
}

/* -------------------------------------------------------------------- build */

const meta = {
  idle: await buildStrip('alien-idle', idleFrames, { fps: 7 }),
  stairs: await buildStrip('alien-stairs', stairsFrames, { fps: 10 }),
  walking: await buildStrip('alien-walking', walkFrames, { fixedAnchor: true, fps: 44 }),
}
meta.wave = await buildWave(meta.idle)
writeFileSync('src/data/alienSprites.json', JSON.stringify(meta, null, 2))
console.log(JSON.stringify(meta, null, 2))
