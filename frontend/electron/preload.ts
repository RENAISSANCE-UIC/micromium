import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  getPort: (): Promise<number> => ipcRenderer.invoke('getPort'),
  openFile: (): Promise<string | null> => ipcRenderer.invoke('dialog:openFile'),
})
