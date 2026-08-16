/** Writing the Windows executable's `.ico` resource. */

import { existsSync } from 'node:fs'
import { cp, readFile, writeFile } from 'node:fs/promises'
import { basename, extname } from 'node:path'

/**
 * Write an `.ico`, accepting either an existing icon or one square PNG.
 *
 * Modern Windows icon readers accept PNG-compressed frames inside an ICO
 * container. Keeping the original PNG intact avoids an image dependency and
 * preserves its alpha channel.
 * @param source - `.ico` or square `.png` artwork.
 * @param destination - `.ico` path to write.
 */
export async function writeWindowsIcon(source: string, destination: string): Promise<void> {
  if (!existsSync(source)) throw new Error(`icon artwork ${source} does not exist`)
  const extension = extname(source).toLowerCase()
  if (extension === '.ico') {
    await cp(source, destination)
    return
  }
  if (extension !== '.png') {
    throw new Error(`--icon takes a .ico or .png file, received ${basename(source)}`)
  }

  const png = await readFile(source)
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  if (png.length < 24 || !png.subarray(0, 8).equals(signature)) {
    throw new Error(`icon artwork ${source} is not a PNG`)
  }
  const width = png.readUInt32BE(16)
  const height = png.readUInt32BE(20)
  if (width === 0 || width !== height || width > 256) {
    throw new Error(`Windows PNG icon must be square and at most 256px, received ${String(width)}x${String(height)}`)
  }

  const header = Buffer.alloc(22)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // icon
  header.writeUInt16LE(1, 4) // one image
  header.writeUInt8(width === 256 ? 0 : width, 6)
  header.writeUInt8(height === 256 ? 0 : height, 7)
  header.writeUInt8(0, 8) // palette
  header.writeUInt8(0, 9) // reserved
  header.writeUInt16LE(1, 10) // color planes
  header.writeUInt16LE(32, 12) // bits per pixel
  header.writeUInt32LE(png.length, 14)
  header.writeUInt32LE(header.length, 18)
  await writeFile(destination, Buffer.concat([header, png]))
}
