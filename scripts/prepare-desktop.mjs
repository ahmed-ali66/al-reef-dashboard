// ─────────────────────────────────────────────────────────────────────────
// prepare-desktop.mjs — prepares the Next.js build for Tauri packaging
// ─────────────────────────────────────────────────────────────────────────
// Tauri expects frontendDist to be static files (no node_modules).
// But Next.js standalone needs node_modules to run the server.
//
// This script:
// 1. Copies .next/standalone → desktop-server/ (the Node.js server + node_modules)
// 2. Copies .next/static → desktop-server/.next/static (static assets)
// 3. Copies public → desktop-server/public (images, etc.)
// 4. Creates a minimal desktop-frontend/ with just an index.html that
//    redirects to http://localhost:3000 (Tauri loads this first, then
//    the Rust code starts the Node server and navigates to localhost:3000)

import { cpSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'fs'
import { join, resolve } from 'path'

const root = resolve(process.cwd())
const standaloneDir = join(root, '.next', 'standalone')
const staticDir = join(root, '.next', 'static')
const publicDir = join(root, 'public')

const serverOutDir = join(root, 'desktop-server')
const frontendOutDir = join(root, 'desktop-frontend')

console.log('[prepare-desktop] Preparing Next.js build for Tauri...')

// 1. Clean previous output
for (const dir of [serverOutDir, frontendOutDir]) {
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true })
  }
  mkdirSync(dir, { recursive: true })
}

// 2. Copy standalone server → desktop-server/
console.log('[prepare-desktop] Copying standalone server...')
cpSync(standaloneDir, serverOutDir, { recursive: true })

// 3. Copy static assets → desktop-server/.next/static
if (existsSync(staticDir)) {
  console.log('[prepare-desktop] Copying static assets...')
  mkdirSync(join(serverOutDir, '.next'), { recursive: true })
  cpSync(staticDir, join(serverOutDir, '.next', 'static'), { recursive: true })
}

// 4. Copy public folder → desktop-server/public
if (existsSync(publicDir)) {
  console.log('[prepare-desktop] Copying public assets...')
  cpSync(publicDir, join(serverOutDir, 'public'), { recursive: true })
}

// 5. Create a minimal frontend (Tauri loads this, then Rust navigates to localhost:3000)
console.log('[prepare-desktop] Creating frontend redirect...')
writeFileSync(
  join(frontendOutDir, 'index.html'),
  `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Al Reef Al Madeena</title>
  <style>
    body { font-family: sans-serif; text-align: center; padding: 50px; background: #f5f0e6; }
    h1 { color: #1a5276; }
    p { color: #666; }
  </style>
</head>
<body>
  <h1>Starting Al Reef Al Madeena...</h1>
  <p>The application is loading. Please wait.</p>
</body>
</html>`
)

console.log('[prepare-desktop] ✅ Done! desktop-server/ and desktop-frontend/ created.')
