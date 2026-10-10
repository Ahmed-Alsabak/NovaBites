import sharp from 'sharp'

export async function loadRGBA(path) {
  const { data, info } = await sharp(path)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  return { data: Buffer.from(data), w: info.width, h: info.height }
}

export async function saveRGBA(img, path) {
  await sharp(img.data, { raw: { width: img.w, height: img.h, channels: 4 } })
    .png()
    .toFile(path)
}

export async function saveWebP(img, path, { lossless = true, quality = 82 } = {}) {
  await sharp(img.data, { raw: { width: img.w, height: img.h, channels: 4 } })
    .webp(lossless ? { lossless: true, effort: 4 } : { quality, effort: 4 })
    .toFile(path)
}

const isBackdrop = (d, i) => {
  if (d[i + 3] < 128) return true
  const r = d[i]
  const g = d[i + 1]
  const b = d[i + 2]
  const mn = Math.min(r, g, b)
  const mx = Math.max(r, g, b)
  return mn >= 190 && mx - mn <= 20
}

/** Removes the baked-in "fake transparency" checkerboard by flood filling from the borders. */
export function removeBackdrop(img) {
  const { data, w, h } = img
  const seen = new Uint8Array(w * h)
  const stack = []
  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return
    const p = y * w + x
    if (seen[p]) return
    if (!isBackdrop(data, p * 4)) return
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
    push(x + 1, y + 1)
    push(x - 1, y - 1)
    push(x + 1, y - 1)
    push(x - 1, y + 1)
  }
  for (let p = 0; p < seen.length; p++) {
    if (seen[p]) data[p * 4 + 3] = 0
  }
  return img
}

export function clearRect(img, x0, y0, x1, y1) {
  const { data, w, h } = img
  for (let y = Math.max(0, y0); y < Math.min(h, y1); y++) {
    for (let x = Math.max(0, x0); x < Math.min(w, x1); x++) {
      data[(y * w + x) * 4 + 3] = 0
    }
  }
}

export function bbox(img, x0 = 0, y0 = 0, x1 = img.w, y1 = img.h, test) {
  const { data, w } = img
  let minX = Infinity
  let minY = Infinity
  let maxX = -1
  let maxY = -1
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * w + x) * 4
      if (data[i + 3] < 40) continue
      if (test && !test(data[i], data[i + 1], data[i + 2])) continue
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }
  if (maxX < 0) return null
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 }
}

export const isLime = (r, g, b) => g > 130 && g > b + 60 && r > 60 && g >= r - 10

/** Draws a crop of `img` into a new RGBA buffer of size (cw x ch) at offset (dx, dy). */
export function blit(dst, src, sx, sy, sw, sh, dx, dy) {
  for (let y = 0; y < sh; y++) {
    const ty = dy + y
    if (ty < 0 || ty >= dst.h) continue
    for (let x = 0; x < sw; x++) {
      const tx = dx + x
      if (tx < 0 || tx >= dst.w) continue
      const si = ((sy + y) * src.w + (sx + x)) * 4
      if (src.data[si + 3] === 0) continue
      const di = (ty * dst.w + tx) * 4
      dst.data[di] = src.data[si]
      dst.data[di + 1] = src.data[si + 1]
      dst.data[di + 2] = src.data[si + 2]
      dst.data[di + 3] = src.data[si + 3]
    }
  }
}

export function blank(w, h) {
  return { data: Buffer.alloc(w * h * 4), w, h }
}

export async function resizeRGBA(img, width, height) {
  const { data, info } = await sharp(img.data, {
    raw: { width: img.w, height: img.h, channels: 4 },
  })
    .resize(width, height, { kernel: 'lanczos3', fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true })
  return { data: Buffer.from(data), w: info.width, h: info.height }
}
