import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  getPort: (): Promise<number> => ipcRenderer.invoke('getPort'),
  openFile: (): Promise<string | null> => ipcRenderer.invoke('dialog:openFile'),
  getNativeThemeDark: (): Promise<boolean> => ipcRenderer.invoke('nativeTheme:isDark'),
  onThemeChange: (cb: (dark: boolean) => void) => {
    ipcRenderer.on('nativeTheme:updated', (_event, dark: boolean) => cb(dark))
  },
  watchFile: (filePath: string): Promise<void> => ipcRenderer.invoke('file:watch', filePath),
  onFileChanged: (cb: (filePath: string) => void) => {
    ipcRenderer.on('file:changed', (_event, filePath: string) => cb(filePath))
  },
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke('shell:openExternal', url),
})
