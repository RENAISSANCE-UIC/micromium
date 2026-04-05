import { useState, useEffect, useRef, useCallback } from 'react'
import { fetchDocument, openFile, selectRecord } from './api'
import { CircMap } from './components/CircMap'
import { GenomeMap } from './components/GenomeMap'
import { GenomeSeqPanel } from './components/GenomeSeqPanel'
import { SeqView } from './components/SeqView'
import { TopologyViewer } from './components/TopologyViewer'
import { FeatureTable } from './components/FeatureTable'
import { RecordSelector } from './components/RecordSelector'
import type { DocumentDTO } from './types'

const CIRCMAP_MIN = 200
const CIRCMAP_MAX = 900
const CIRCMAP_DEFAULT = 440
const SEQPANEL_MIN = 300
const SEQPANEL_MAX = 1000
const SEQPANEL_DEFAULT = 700
const TABLE_MIN = 80
const TABLE_MAX = 600
const TABLE_DEFAULT = 220

export default function App() {
  const [doc, setDoc] = useState<DocumentDTO | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [filePath, setFilePath] = useState<string | null>(null)
  const [fileChangedPath, setFileChangedPath] = useState<string | null>(null)
  const [dark, setDark] = useState(() => {
    const saved = localStorage.getItem('micromium-dark') === 'true'
    if (saved) document.documentElement.classList.add('dark')
    return saved
  })

  const toggleDark = () => {
    const next = !dark
    setDark(next)
    document.documentElement.classList.toggle('dark', next)
    localStorage.setItem('micromium-dark', String(next))
  }
  const [topoTarget, setTopoTarget] = useState<{
    protein: string; label?: string; qualifiers?: Record<string, string[]>
  } | null>(null)
  const [circmapWidth, setCircmapWidth] = useState(CIRCMAP_DEFAULT)
  const [seqPanelWidth, setSeqPanelWidth] = useState(SEQPANEL_DEFAULT)
  const [tableHeight, setTableHeight] = useState(TABLE_DEFAULT)

  // horizontal drag — 'circmap' | 'seqpanel' | null
  const hDragging = useRef<'circmap' | 'seqpanel' | null>(null)
  const hDragStartX = useRef(0)
  const hDragStartW = useRef(0)

  // vertical drag (feature table height)
  const vDragging = useRef(false)
  const vDragStartY = useRef(0)
  const vDragStartH = useRef(0)

  useEffect(() => {
    fetchDocument()
      .then(d => { setDoc(d); setLoading(false) })
      .catch(e => { setError(String(e)); setLoading(false) })
  }, [])

  // OS dark mode sync and file-watch listener
  useEffect(() => {
    if (!window.electronAPI) return
    const hasSavedPref = localStorage.getItem('micromium-dark') !== null
    if (!hasSavedPref) {
      window.electronAPI.getNativeThemeDark().then(isDark => {
        setDark(isDark)
        document.documentElement.classList.toggle('dark', isDark)
      })
    }
    window.electronAPI.onThemeChange(isDark => {
      if (localStorage.getItem('micromium-dark') !== null) return
      setDark(isDark)
      document.documentElement.classList.toggle('dark', isDark)
    })
    window.electronAPI.onFileChanged(changedPath => {
      setFileChangedPath(changedPath)
    })
  }, [])

  useEffect(() => { setTopoTarget(null) }, [doc])

  const startCircmapDrag = useCallback((e: React.MouseEvent) => {
    hDragging.current = 'circmap'
    hDragStartX.current = e.clientX
    hDragStartW.current = circmapWidth
    e.preventDefault()
  }, [circmapWidth])

  const startSeqPanelDrag = useCallback((e: React.MouseEvent) => {
    hDragging.current = 'seqpanel'
    hDragStartX.current = e.clientX
    hDragStartW.current = seqPanelWidth
    e.preventDefault()
  }, [seqPanelWidth])

  const startVDrag = useCallback((e: React.MouseEvent) => {
    vDragging.current = true
    vDragStartY.current = e.clientY
    vDragStartH.current = tableHeight
    e.preventDefault()
  }, [tableHeight])

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (hDragging.current === 'circmap') {
        const delta = hDragStartX.current - e.clientX
        setCircmapWidth(Math.max(CIRCMAP_MIN, Math.min(CIRCMAP_MAX, hDragStartW.current + delta)))
      } else if (hDragging.current === 'seqpanel') {
        const delta = e.clientX - hDragStartX.current
        setSeqPanelWidth(Math.max(SEQPANEL_MIN, Math.min(SEQPANEL_MAX, hDragStartW.current + delta)))
      }
      if (vDragging.current) {
        const delta = vDragStartY.current - e.clientY
        setTableHeight(Math.max(TABLE_MIN, Math.min(TABLE_MAX, vDragStartH.current + delta)))
      }
    }
    const onUp = () => { hDragging.current = null; vDragging.current = false }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
  }, [])

  const handleOpenPath = useCallback(async (p: string) => {
    setError(null)
    setFileChangedPath(null)
    try {
      setDoc(await openFile(p))
      setFilePath(p)
      await window.electronAPI?.watchFile(p)
    } catch (e) {
      setError(String(e))
    }
  }, [])

  const handleOpen = async () => {
    const p = await window.electronAPI?.openFile()
    if (!p) return
    await handleOpenPath(p)
  }

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault() }
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0] as File & { path?: string }
    if (file?.path) handleOpenPath(file.path)
  }, [handleOpenPath])

  const handleSelectRecord = async (index: number) => {
    setError(null)
    try {
      setDoc(await selectRecord(index))
    } catch (e) {
      setError(String(e))
    }
  }

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', background: 'var(--bg)', color: 'var(--text)' }}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >

      {/* Header */}
      <div style={headerStyle}>
        <span style={{ fontWeight: 600, fontSize: 15 }}>Micromium</span>
        <button onClick={handleOpen} style={btnStyle}>Open file…</button>
        {doc && (
          <span style={{ color: 'var(--text-2)', fontSize: 13 }}>
            {doc.name} · {doc.length.toLocaleString()} bp · {doc.topology}
          </span>
        )}
        {error  && <span style={{ color: '#c0392b', fontSize: 13 }}>{error}</span>}
        {loading && <span style={{ color: 'var(--text-2)', fontSize: 13 }}>Loading…</span>}
        <button onClick={toggleDark} style={{ ...btnStyle, marginLeft: 'auto' }}>
          {dark ? 'Light mode' : 'Dark mode'}
        </button>
      </div>

      {fileChangedPath && (
        <div style={bannerStyle}>
          <span>File changed on disk.</span>
          <button onClick={() => handleOpenPath(fileChangedPath)} style={bannerBtnStyle}>Reload</button>
          <button onClick={() => setFileChangedPath(null)} style={bannerBtnStyle}>Dismiss</button>
        </div>
      )}

      {doc !== null && (doc.records?.length ?? 0) > 1 && (
        <RecordSelector
          records={doc.records}
          activeIndex={doc.recordIndex}
          onSelect={handleSelectRecord}
        />
      )}

      {doc ? (
        <>
          {doc.mode === 'genome' ? (
            /* Genome mode: SeqPanel (left) | drag | CGView map (right), feature table below */
            <div style={{ flex: '1 1 auto', display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
              <div style={{ flex: '1 1 auto', display: 'flex', minHeight: 0, overflow: 'hidden' }}>
                <div style={{ width: seqPanelWidth, flexShrink: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRight: '1px solid #d0d0d0' }}>
                  <GenomeSeqPanel doc={doc} alwaysShow genomeMode onTopologyChange={setTopoTarget} topologyActive={!!topoTarget} />
                </div>
                <div onMouseDown={startSeqPanelDrag} style={{ width: 4, flexShrink: 0, cursor: 'col-resize', background: 'var(--border)' }} />
                <div style={{ flex: '1 1 auto', minWidth: 0, overflow: 'hidden' }}>
                  {topoTarget ? (
                    <TopologyViewer protein={topoTarget.protein} label={topoTarget.label} qualifiers={topoTarget.qualifiers} />
                  ) : (
                    <GenomeMap doc={doc} />
                  )}
                </div>
              </div>
              <div onMouseDown={startVDrag} style={rowResizeHandle} />
              <div style={{ height: tableHeight, flexShrink: 0, overflow: 'hidden' }}>
                <FeatureTable doc={doc} />
              </div>
            </div>
          ) : (
            /* Plasmid mode: SeqView (left) | drag handle | CircMap (right) + feature table */
            <>
              <div style={{ flex: '1 1 auto', display: 'flex', minHeight: 0, overflow: 'hidden' }}>
                <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                  <SeqView doc={doc} onTopologyChange={setTopoTarget} topologyActive={!!topoTarget} />
                </div>
                <div
                  onMouseDown={startCircmapDrag}
                  style={{ width: 4, flexShrink: 0, cursor: 'col-resize', background: 'var(--border)' }}
                />
                <div style={{
                  width: circmapWidth, flexShrink: 0, overflow: 'hidden',
                  display: 'flex', flexDirection: 'column',
                }}>
                  {topoTarget ? (
                    <TopologyViewer protein={topoTarget.protein} label={topoTarget.label} qualifiers={topoTarget.qualifiers} />
                  ) : (
                    <CircMap doc={doc} dark={dark} />
                  )}
                </div>
              </div>
              <div onMouseDown={startVDrag} style={rowResizeHandle} />
              <div style={{ height: tableHeight, flexShrink: 0, overflow: 'hidden' }}>
                <FeatureTable doc={doc} />
              </div>
            </>
          )}
        </>
      ) : (
        /* Splash screen */
        <div style={splashStyle}>
          <img src="/logo.png" alt="Micromium" style={{ width: 120, height: 120, marginBottom: 16, objectFit: 'contain' }} />
          <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 6, color: 'var(--text)' }}>
            Open a plasmid file to begin
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 24 }}>
            GenBank (.gb, .gbk, .ape) or FASTA (.fa, .fasta, .fna)
          </div>
          <button onClick={handleOpen} style={splashBtnStyle}>Open file…</button>
          {error && <div style={{ marginTop: 16, color: '#c0392b', fontSize: 13 }}>{error}</div>}
        </div>
      )}

    </div>
  )
}

const headerStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 16,
  padding: '6px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0,
}
const btnStyle: React.CSSProperties = {
  padding: '3px 10px', borderRadius: 4, border: '1px solid var(--btn-bd)',
  background: 'var(--btn-bg2)', color: 'var(--text)', cursor: 'pointer', fontSize: 13,
}
const splashStyle: React.CSSProperties = {
  flex: '1 1 auto',
  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
}
const rowResizeHandle: React.CSSProperties = {
  height: 4, flexShrink: 0, cursor: 'row-resize', background: 'var(--border)',
}
const splashBtnStyle: React.CSSProperties = {
  padding: '10px 28px', borderRadius: 6, border: '1px solid var(--btn-bd)',
  background: 'var(--text)', color: 'var(--bg)', cursor: 'pointer',
  fontSize: 15, fontWeight: 600,
}
const bannerStyle: React.CSSProperties = {
  background: '#b5750e', color: '#fff', padding: '4px 16px', flexShrink: 0,
  display: 'flex', alignItems: 'center', gap: 12, fontSize: 13,
}
const bannerBtnStyle: React.CSSProperties = {
  padding: '2px 10px', borderRadius: 4, border: '1px solid rgba(255,255,255,0.45)',
  background: 'transparent', color: '#fff', cursor: 'pointer', fontSize: 12,
}
