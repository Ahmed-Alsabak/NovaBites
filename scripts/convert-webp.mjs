/**
 * Builds the WebP files the site actually serves.
 *
 *   node scripts/convert-webp.mjs      (or: npm run webp)
 *
 * Sources stay as PNG / JPG (the sprite scripts still read them). Only the runtime copies
 * change: photos are resized + lossy, cookie art is lossy with alpha, sprite strips stay
 * lossless so the animation frames don't smear.
 */
import { readdirSync } from 'node:fs'
import { join, parse } from 'node:path'
import sharp from 'sharp'

const SPACE = 'public/images/pxsprite-space 1.jpg'
const SPACE_MAX_W = 1920
const COOKIES = [
  'SunsetCookie',
  'KIKICookie',
  'DollarCookie',
  'SnickersCookie',
  'WhiteCookie',
  'CoalCookie',
  'NewYorkcookie',
  'SimpleCookie',
]

const out = (src) => join(parse(src).dir, `${parse(src).name}.webp`)

const report = (src, dest, info) =>
  console.log(`${src} -> ${parse(dest).base}  ${info.width}x${info.height}  ${(info.size / 1024).toFixed(1)} KB`)

const space = await sharp(SPACE)
  .resize({ width: SPACE_MAX_W, withoutEnlargement: true })
  .webp({ quality: 78, effort: 5 })
  .toFile(out(SPACE))
report(SPACE, out(SPACE), space)

for (const name of COOKIES) {
  const src = `public/images/${name}.png`
  const info = await sharp(src).webp({ quality: 82, alphaQuality: 90, effort: 5 }).toFile(out(src))
  report(src, out(src), info)
}

for (const extra of ['galaxy-bg2.jpg', 'galaxy-bg.jpg']) {
  const src = `public/images/${extra}`
  try {
    const info = await sharp(src).webp({ quality: 78, effort: 5 }).toFile(out(src))
    report(src, out(src), info)
  } catch {
    /* optional leftover */
  }
}

for (const file of readdirSync('public/sprites')) {
  if (!file.endsWith('.png')) continue
  const src = join('public/sprites', file)
  const info = await sharp(src).webp({ lossless: true, effort: 4 }).toFile(out(src))
  report(src, out(src), info)
}
