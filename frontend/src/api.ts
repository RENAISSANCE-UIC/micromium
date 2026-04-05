import type { DocumentDTO } from './types'

let _baseUrl: string | null = null

async function baseUrl(): Promise<string> {
  if (!_baseUrl) {
    // In Electron: port comes from IPC preload.
    // In plain browser / Puppeteer: port is injected into index.html by Go server.
    const port = window.electronAPI
      ? await window.electronAPI.getPort()
      : (window as unknown as { __MICROMIUM_PORT__: number }).__MICROMIUM_PORT__
    _baseUrl = `http://localhost:${port}`
  }
  return _baseUrl
}

export async function fetchDocument(): Promise<DocumentDTO | null> {
  const base = await baseUrl()
  const r = await fetch(`${base}/api/document`)
  if (r.status === 204) return null
  if (!r.ok) throw new Error(await r.text())
  return r.json()
}

export async function fetchSequence(start: number, end: number): Promise<string> {
  const base = await baseUrl()
  const r = await fetch(`${base}/api/document/sequence?start=${start}&end=${end}`)
  if (r.status === 204) return ''
  if (!r.ok) throw new Error(await r.text())
  const json = await r.json() as { bases: string }
  return json.bases
}

export async function openFile(path: string): Promise<DocumentDTO> {
  const base = await baseUrl()
  const r = await fetch(`${base}/api/document/open`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path }),
  })
  if (!r.ok) throw new Error(await r.text())
  return r.json()
}

export interface TopologySegment {
  start: number  // 1-indexed, inclusive
  end: number    // 1-indexed, inclusive
  type: 'TM' | 'peri' | 'cyto'
}

export interface TopologyResult {
  sequence: string
  segments: TopologySegment[]
  length: number
  profile: number[]  // per-residue KD score
}

export async function fetchTopology(seq: string): Promise<TopologyResult> {
  const base = await baseUrl()
  const r = await fetch(`${base}/api/topology?seq=${encodeURIComponent(seq)}`)
  if (!r.ok) throw new Error(await r.text())
  return r.json()
}

export async function fetchProtterSVG(seq: string, name: string): Promise<string> {
  const base = await baseUrl()
  const r = await fetch(`${base}/api/protter?seq=${encodeURIComponent(seq)}&name=${encodeURIComponent(name)}`)
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  const text = await r.text()
  if (!text.includes('<svg')) throw new Error('Protter response is not SVG — service may be down')
  return text
}

export async function selectRecord(index: number): Promise<DocumentDTO> {
  const base = await baseUrl()
  const r = await fetch(`${base}/api/document/select`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ index }),
  })
  if (!r.ok) throw new Error(await r.text())
  return r.json()
}
