/**
 * Generate PWA icon PNGs from the STREFEX logo image.
 * Places the logo centered on a square navy (#192A56) background.
 * Run: node scripts/generate-icons.mjs
 */
import sharp from 'sharp'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const OUT = resolve(ROOT, 'public', 'icons')
const SRC = resolve(ROOT, 'public', 'assets', 'icon-source.png')
const BG_COLOR = { r: 25, g: 42, b: 86, alpha: 1 } // #192A56

const SIZES = [48, 72, 96, 120, 128, 144, 152, 167, 180, 192, 256, 384, 512]
const MASKABLE_SIZES = [192, 512]

async function createIcon(size, logoRatio, filename) {
  const logoBox = Math.round(size * logoRatio)
  const logo = await sharp(SRC).resize(logoBox, logoBox, { fit: 'inside' }).toBuffer()
  const icon = await sharp({
    create: { width: size, height: size, channels: 4, background: BG_COLOR },
  })
    .composite([{ input: logo, gravity: 'centre' }])
    .png()
    .toBuffer()
  return sharp(icon).toFile(filename)
}

async function generate() {
  const { mkdirSync } = await import('fs')
  mkdirSync(OUT, { recursive: true })

  const jobs = []

  for (const size of SIZES) {
    const file = resolve(OUT, `icon-${size}x${size}.png`)
    jobs.push(
      createIcon(size, 0.7, file).then(() => console.log(`  icon-${size}x${size}.png`))
    )
  }

  // Maskable icons: logo smaller (60%) to stay within the safe zone
  for (const size of MASKABLE_SIZES) {
    const file = resolve(OUT, `icon-maskable-${size}x${size}.png`)
    jobs.push(
      createIcon(size, 0.55, file).then(() => console.log(`  icon-maskable-${size}x${size}.png`))
    )
  }

  // Favicons
  jobs.push(
    createIcon(32, 0.7, resolve(ROOT, 'public', 'favicon-32x32.png'))
      .then(() => console.log('  favicon-32x32.png'))
  )
  jobs.push(
    createIcon(16, 0.75, resolve(ROOT, 'public', 'favicon-16x16.png'))
      .then(() => console.log('  favicon-16x16.png'))
  )

  // Apple touch icon
  jobs.push(
    createIcon(180, 0.7, resolve(ROOT, 'public', 'apple-touch-icon.png'))
      .then(() => console.log('  apple-touch-icon.png'))
  )

  await Promise.all(jobs)
  console.log(`\nDone — ${jobs.length} icons generated.`)
}

generate().catch((err) => {
  console.error('Icon generation failed:', err)
  process.exit(1)
})
