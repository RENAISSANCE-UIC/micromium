import { useState, useEffect, useRef, useCallback } from 'react'
import { fetchDocument, openFile } from './api'
import { CircMap } from './components/CircMap'
import { GenomeMap } from './components/GenomeMap'
import { GenomeSeqPanel } from './components/GenomeSeqPanel'
import { SeqView } from './components/SeqView'
import { FeatureTable } from './components/FeatureTable'
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

  const handleOpen = async () => {
    const path = await window.electronAPI?.openFile()
    if (!path) return
    setError(null)
    try {
      setDoc(await openFile(path))
    } catch (e) {
      setError(String(e))
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>

      {/* Header */}
      <div style={headerStyle}>
        <span style={{ fontWeight: 600, fontSize: 15 }}>Micromium</span>
        <button onClick={handleOpen} style={btnStyle}>Open file…</button>
        {doc && (
          <span style={{ color: '#666', fontSize: 13 }}>
            {doc.name} · {doc.length.toLocaleString()} bp · {doc.topology}
          </span>
        )}
        {error  && <span style={{ color: '#c0392b', fontSize: 13 }}>{error}</span>}
        {loading && <span style={{ color: '#666', fontSize: 13 }}>Loading…</span>}
      </div>

      {doc ? (
        <>
          {doc.mode === 'genome' ? (
            /* Genome mode: SeqPanel (left) | drag | CGView map (right), feature table below */
            <div style={{ flex: '1 1 auto', display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
              <div style={{ flex: '1 1 auto', display: 'flex', minHeight: 0, overflow: 'hidden' }}>
                <div style={{ width: seqPanelWidth, flexShrink: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRight: '1px solid #d0d0d0' }}>
                  <GenomeSeqPanel doc={doc} alwaysShow />
                </div>
                <div onMouseDown={startSeqPanelDrag} style={{ width: 4, flexShrink: 0, cursor: 'col-resize', background: '#d0d0d0' }} />
                <div style={{ flex: '1 1 auto', minWidth: 0, overflow: 'hidden' }}>
                  <GenomeMap doc={doc} />
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
                  <SeqView doc={doc} />
                </div>
                <div
                  onMouseDown={startCircmapDrag}
                  style={{ width: 4, flexShrink: 0, cursor: 'col-resize', background: '#d0d0d0' }}
                />
                <div style={{
                  width: circmapWidth, flexShrink: 0, overflow: 'hidden',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <CircMap doc={doc} />
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
          <div style={{ fontSize: 32, marginBottom: 8 }}>🧬</div>
          <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 6, color: '#1a1a1a' }}>
            Open a plasmid file to begin
          </div>
          <div style={{ fontSize: 13, color: '#888', marginBottom: 24 }}>
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
  padding: '6px 16px', borderBottom: '1px solid #2d2d2d', flexShrink: 0,
}
const btnStyle: React.CSSProperties = {
  padding: '3px 10px', borderRadius: 4, border: '1px solid #bbb',
  background: '#ebebeb', color: '#1a1a1a', cursor: 'pointer', fontSize: 13,
}
const splashStyle: React.CSSProperties = {
  flex: '1 1 auto',
  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
}
const rowResizeHandle: React.CSSProperties = {
  height: 4, flexShrink: 0, cursor: 'row-resize', background: '#d0d0d0',
}
const splashBtnStyle: React.CSSProperties = {
  padding: '10px 28px', borderRadius: 6, border: '1px solid #bbb',
  background: '#1a1a1a', color: '#f5f5f5', cursor: 'pointer',
  fontSize: 15, fontWeight: 600,
}
