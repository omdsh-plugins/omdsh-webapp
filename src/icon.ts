/** Writing the bundle's `Resources/icon.icns`. */

import { existsSync } from 'node:fs'
import { cp, mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, extname, join } from 'node:path'
import { run } from './run.ts'

/** Icon sizes an `.icns` carries; each is emitted at 1x and 2x. */
export const ICON_SIZES = [16, 32, 128, 256, 512] as const

/**
 * Write `Resources/icon.icns` from an `.icns` (copied) or a square `.png`
 * (rendered to an iconset by `sips`, packed by `iconutil`).
 *
 * SVG is not accepted: `sips` and `iconutil` read PNG and no macOS system tool
 * rasterizes SVG, so the artwork in `assets/` is committed as both.
 * @param source - the artwork path.
 * @param resources - the bundle's `Resources` directory.
 */
export async function writeIcon(source: string, resources: string): Promise<void> {
  if (!existsSync(source)) throw new Error(`icon artwork ${source} does not exist`)
  const destination = join(resources, 'icon.icns')
  if (extname(source).toLowerCase() === '.icns') {
    await cp(source, destination)
    return
  }
  if (extname(source).toLowerCase() !== '.png') {
    throw new Error(`--icon takes a .icns or .png file, received ${basename(source)}`)
  }
  const staging = await mkdtemp(join(tmpdir(), 'omdsh-webapp-icon-'))
  const iconset = join(staging, 'icon.iconset')
  try {
    await mkdir(iconset)
    for (const size of ICON_SIZES) {
      for (const scale of [1, 2]) {
        const pixels = size * scale
        const name = scale === 1
          ? `icon_${String(size)}x${String(size)}.png`
          : `icon_${String(size)}x${String(size)}@2x.png`
        run('sips', ['-z', String(pixels), String(pixels), source, '--out', join(iconset, name)])
      }
    }
    run('iconutil', ['-c', 'icns', iconset, '-o', destination])
  } finally {
    await rm(staging, { recursive: true, force: true })
  }
}
