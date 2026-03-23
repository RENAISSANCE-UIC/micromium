import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import { spawn, ChildProcess } from 'child_process'
import * as path from 'path'
import * as readline from 'readline'

let goProcess: ChildProcess | null = null
let backendPort: number | null = null
let mainWindow: BrowserWindow | null = null

function getBinaryPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'micromiumserver')
  }
  // Dev: electron/dist/main.js → __dirname = frontend/electron/dist
  // Three levels up = project root
  return path.join(__dirname, '..', '..', '..', 'micromiumserver')
}

function startBackend(): Promise<number> {
  return new Promise((resolve, reject) => {
    const bin = getBinaryPath()
    console.log(`[main] spawning backend: ${bin}`)

    goProcess = spawn(bin, [], { stdio: ['ignore', 'pipe', 'pipe'], cwd: path.dirname(bin) })

    const rl = readline.createInterface({ input: goProcess.stdout! })
    rl.on('line', (line: string) => {
      const m = line.match(/^PORT=(\d+)$/)
      if (m) {
        rl.close()
        resolve(parseInt(m[1], 10))
      }
    })

    goProcess.stderr!.on('data', (d: Buffer) => {
      console.error('[go]', d.toString().trimEnd())
    })

    goProcess.on('exit', (code: number | null) => {
      if (code !== 0 && code !== null) {
        reject(new Error(`Go backend exited with code ${code}`))
      }
    })

    setTimeout(() => reject(new Error('Backend start timeout (10s)')), 10000)
  })
}

app.whenReady().then(async () => {
  try {
    backendPort = await startBackend()
    console.log(`[main] backend on port ${backendPort}`)

    mainWindow = new BrowserWindow({
      width: 1200,
      height: 700,
      title: 'Micromium',
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
      },
    })

    mainWindow.loadURL(`http://localhost:${backendPort}`)

    if (!app.isPackaged) {
      mainWindow.webContents.openDevTools({ mode: 'detach' })
    }
  } catch (e) {
    console.error('[main] startup failed:', e)
    app.quit()
  }
})

ipcMain.handle('getPort', () => backendPort)

ipcMain.handle('dialog:openFile', async () => {
  if (!mainWindow) return null
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Open plasmid file',
    filters: [
      { name: 'Plasmid files', extensions: ['gb', 'gbk', 'ape', 'fasta', 'fa', 'fna'] },
      { name: 'All files', extensions: ['*'] },
    ],
  })
  return result.filePaths[0] ?? null
})

function killBackend() {
  if (goProcess) {
    goProcess.kill('SIGTERM')
    goProcess = null
  }
}

app.on('before-quit', killBackend)
app.on('window-all-closed', () => {
  killBackend()
  if (process.platform !== 'darwin') app.quit()
})
