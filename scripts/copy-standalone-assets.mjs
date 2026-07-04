import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const standaloneDir = join(root, '.next', 'standalone')

if (!existsSync(standaloneDir)) {
  throw new Error('Missing .next/standalone. Ensure next.config.ts has output: "standalone".')
}

const standaloneNextDir = join(standaloneDir, '.next')
mkdirSync(standaloneNextDir, { recursive: true })

function copyDir(source, destination) {
  mkdirSync(destination, { recursive: true })
  for (const entry of readdirSync(source)) {
    const sourcePath = join(source, entry)
    const destinationPath = join(destination, entry)
    const stats = statSync(sourcePath)
    if (stats.isDirectory()) {
      copyDir(sourcePath, destinationPath)
    } else if (stats.isFile()) {
      copyFileSync(sourcePath, destinationPath)
    }
  }
}

const staticDir = join(root, '.next', 'static')
if (existsSync(staticDir)) {
  copyDir(staticDir, join(standaloneNextDir, 'static'))
}

const publicDir = join(root, 'public')
if (existsSync(publicDir)) {
  copyDir(publicDir, join(standaloneDir, 'public'))
}
