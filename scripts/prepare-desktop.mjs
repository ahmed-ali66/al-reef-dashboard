// ─────────────────────────────────────────────────────────────────────────
// prepare-desktop.mjs — prepares the Next.js build for Tauri packaging
// ─────────────────────────────────────────────────────────────────────────
// This script:
// 1. Copies .next/standalone → desktop-server/ (the Node.js server + node_modules)
// 2. Copies .next/static → desktop-server/.next/static (static assets)
// 3. Copies public → desktop-server/public (images, etc.)
// 4. Downloads portable Node.js → desktop-server/node-portable/ (so clients
//    don't need Node.js installed)
// 5. Creates a minimal desktop-frontend/ with a loading screen

import { cpSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'fs'
import { join, resolve } from 'path'
import { execSync } from 'child_process'
import { createWriteStream } from 'fs'
import { pipeline } from 'stream/promises'
import { Readable } from 'stream'

const root = resolve(process.cwd())
const standaloneDir = join(root, '.next', 'standalone')
const staticDir = join(root, '.next', 'static')
const publicDir = join(root, 'public')

const serverOutDir = join(root, 'desktop-server')
const frontendOutDir = join(root, 'desktop-frontend')

// Node.js portable download URL (Windows x64)
const NODE_VERSION = 'v22.16.0'
const NODE_URL = `https://nodejs.org/dist/${NODE_VERSION}/node-${NODE_VERSION}-win-x64.zip`
const NODE_ZIP = join(root, 'node-portable.zip')
const NODE_DIR = join(serverOutDir, 'node-portable')

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

// 4b. Copy .env file → desktop-server/.env (the server needs DATABASE_URL + NEXTAUTH_SECRET)
const envFile = join(root, '.env')
if (existsSync(envFile)) {
  console.log('[prepare-desktop] Copying .env file...')
  cpSync(envFile, join(serverOutDir, '.env'))
} else {
  console.warn('[prepare-desktop] WARNING: .env file not found! Server will not have DATABASE_URL.')
}

// 4c. Verify server.js exists in the standalone build
const serverJs = join(serverOutDir, 'server.js')
if (!existsSync(serverJs)) {
  console.error('[prepare-desktop] ERROR: server.js not found in standalone build!')
  console.error('[prepare-desktop] The build will fail. Check that next build completed successfully.')
} else {
  console.log('[prepare-desktop] ✓ server.js found')
}

// 5. Download portable Node.js (Windows x64)
// Skip if already downloaded (cache the zip)
if (!existsSync(join(NODE_DIR, 'node.exe'))) {
  console.log('[prepare-desktop] Downloading portable Node.js...')

  // Check if we have the zip cached
  if (!existsSync(NODE_ZIP)) {
    console.log(`[prepare-desktop] Downloading from ${NODE_URL}...`)
    const response = await fetch(NODE_URL)
    if (!response.ok) {
      console.warn(`[prepare-desktop] WARNING: Could not download Node.js (${response.status}).`)
      console.warn('[prepare-desktop] The desktop app will require Node.js to be installed on the client machine.')
    } else {
      const arrayBuffer = await response.arrayBuffer()
      writeFileSync(NODE_ZIP, Buffer.from(arrayBuffer))
      console.log('[prepare-desktop] Node.js downloaded.')
    }
  }

  // Extract the zip
  if (existsSync(NODE_ZIP)) {
    console.log('[prepare-desktop] Extracting Node.js...')
    try {
      // Try PowerShell Expand-Archive (available on Windows)
      execSync(`powershell -Command "Expand-Archive -Path '${NODE_ZIP}' -DestinationPath '${serverOutDir}/node-temp' -Force"`)
      // Move the extracted folder to node-portable
      const extractedName = `node-${NODE_VERSION}-win-x64`
      const extractedPath = join(serverOutDir, 'node-temp', extractedName)
      if (existsSync(extractedPath)) {
        cpSync(extractedPath, NODE_DIR, { recursive: true })
        rmSync(join(serverOutDir, 'node-temp'), { recursive: true, force: true })
        console.log('[prepare-desktop] Node.js extracted to node-portable/')
      }
    } catch (e) {
      console.warn('[prepare-desktop] WARNING: Could not extract Node.js:', e.message)
      console.warn('[prepare-desktop] The desktop app will require Node.js on the client machine.')
    }
  }
} else {
  console.log('[prepare-desktop] Portable Node.js already exists, skipping download.')
}

// 6. Create a start script that uses the bundled Node.js
const startScript = `@echo off
cd /d "%~dp0"
if exist "node-portable\\node.exe" (
  "node-portable\\node.exe" server.js
) else (
  node server.js
)
`

writeFileSync(join(serverOutDir, 'start-server.bat'), startScript)
writeFileSync(join(serverOutDir, 'start-server.sh'), `#!/bin/bash\ncd "$(dirname "$0")"\nif [ -f "node-portable/bin/node" ]; then\n  ./node-portable/bin/node server.js\nelse\n  node server.js\nfi\n`)

// 7. Create a minimal frontend (Tauri loads this, then Rust navigates to localhost:3000)
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
    .spinner { border: 4px solid #f3f3f3; border-top: 4px solid #1a5276; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; margin: 20px auto; }
    @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <h1>Starting Al Reef Al Madeena...</h1>
  <div class="spinner"></div>
  <p>The application is loading. Please wait.</p>
</body>
</html>`
)

console.log('[prepare-desktop] ✅ Done! desktop-server/ and desktop-frontend/ created.')
