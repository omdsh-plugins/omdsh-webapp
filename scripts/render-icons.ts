/** Render both committed platform PNGs from the shared SVG artwork. */

import { resolve } from 'node:path'
import { run } from '../src/run.ts'

const root = resolve(import.meta.dirname, '..')
const source = resolve(root, 'assets/macos-app-icon.svg')
run('rsvg-convert', ['-w', '1024', '-h', '1024', source, '-o', resolve(root, 'assets/macos-app-icon.png')])
run('rsvg-convert', ['-w', '256', '-h', '256', source, '-o', resolve(root, 'assets/windows-app-icon.png')])
