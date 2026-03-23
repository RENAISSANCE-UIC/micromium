import { useRef, useMemo, useEffect, useCallback, useState } from 'react'
import { VariableSizeList, type ListChildComponentProps } from 'react-window'
import { useSelection } from '../hooks/useSelection'
import type { DocumentDTO, SelectionDTO, FeatureDTO } from '../types'

function useContainerSize(ref: React.RefObject<HTMLDivElement | null>) {
  const [size, setSize] = useState({ width: 0, height: 0 })
  useEffect(() => {
    if (!ref.current) return
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect
      setSize({ width, height })
    })
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [ref])
  return size
}

const BASES_PER_LINE = 100
const SEQ_HEIGHT    = 20   // px — sequence text row
const RULER_HEIGHT  = 16   // px — position ruler
const TRACK_HEIGHT  = 15   // px — each annotation layer
const TRACK_GAP     = 3    // px — gap between layers / above first layer
const STRAND_SEP    = 4    // px — extra separation between fwd and rev zones
const ROW_GAP       = 10   // px — blank space between rows
const RULER_STEP    = 10   // bp between ticks
const ARROW_TIP     = 7    // px — arrowhead depth
const GUTTER_WIDTH  = '6ch'
const GUTTER_MARGIN = 8    // px

const COMPLEMENT: Record<string, string> = {
  A: 'T', T: 'A', G: 'C', C: 'G',
  a: 't', t: 'a', g: 'c', c: 'g',
}
function complementStrand(seq: string): string {
  return Array.from(seq).map(b => COMPLEMENT[b] ?? b).join('')
}

function baseColors(bp: number, selection: SelectionDTO | null): [string, string] {
  if (selection && selection.start >= 0 && bp >= selection.start && bp < selection.end) {
    return ['#000000', '#FFCC00']
  }
  return ['#1a1a1a', 'transparent']
}

// --- Annotation layout ---

interface TrackItem {
  feat:     FeatureDTO
  featIdx:  number
  startCol: number
  endCol:   number
  layer:    number
  isStart:  boolean  // span starts on this line
  isEnd:    boolean  // span ends on this line
}

interface LineLayout {
  fwdTracks:     TrackItem[]
  revTracks:     TrackItem[]
  fwdLayerCount: number
  revLayerCount: number
}

function assignLayers(items: TrackItem[]): number {
  if (items.length === 0) return 0
  items.sort((a, b) => a.startCol - b.startCol)
  const layerEndAt: number[] = []
  for (const item of items) {
    let layer = layerEndAt.findIndex(end => end <= item.startCol)
    if (layer === -1) { layer = layerEndAt.length; layerEndAt.push(0) }
    layerEndAt[layer] = item.endCol
    item.layer = layer
  }
  return layerEndAt.length
}

function buildLineLayouts(doc: DocumentDTO): LineLayout[] {
  const lineCount = Math.ceil(doc.bases.length / BASES_PER_LINE)
  const layouts: LineLayout[] = Array.from({ length: lineCount }, () => ({
    fwdTracks: [], revTracks: [], fwdLayerCount: 0, revLayerCount: 0,
  }))

  doc.features.forEach((feat, fi) => {
    if (feat.type === 'source') return
    const isForward = feat.direction !== 'reverse'

    feat.spans.forEach(span => {
      if (span.end <= span.start) return
      const firstLine = Math.floor(span.start / BASES_PER_LINE)
      const lastLine  = Math.floor(Math.max(span.end - 1, span.start) / BASES_PER_LINE)

      for (let li = firstLine; li <= lastLine && li < lineCount; li++) {
        const lineStart = li * BASES_PER_LINE
        const lineEnd   = lineStart + BASES_PER_LINE
        const startCol  = Math.max(0, span.start - lineStart)
        const endCol    = Math.min(BASES_PER_LINE, span.end - lineStart)
        if (endCol <= startCol) continue

        const item: TrackItem = {
          feat, featIdx: fi, startCol, endCol, layer: 0,
          isStart: span.start >= lineStart && span.start < lineEnd,
          isEnd:   span.end   >  lineStart && span.end   <= lineEnd,
        }
        if (isForward) layouts[li].fwdTracks.push(item)
        else           layouts[li].revTracks.push(item)
      }
    })
  })

  for (const layout of layouts) {
    layout.fwdLayerCount = assignLayers(layout.fwdTracks)
    layout.revLayerCount = assignLayers(layout.revTracks)
  }

  return layouts
}

function lineRowHeight(layout: LineLayout): number {
  let h = SEQ_HEIGHT   // forward strand
  h += SEQ_HEIGHT      // reverse strand
  h += RULER_HEIGHT    // position ruler
  if (layout.fwdLayerCount > 0)
    h += TRACK_GAP + layout.fwdLayerCount * (TRACK_HEIGHT + TRACK_GAP)
  if (layout.revLayerCount > 0)
    h += (layout.fwdLayerCount > 0 ? STRAND_SEP : TRACK_GAP) + layout.revLayerCount * (TRACK_HEIGHT + TRACK_GAP)
  h += ROW_GAP
  return h
}

// Ruler tick: wrapper positioned at left:(col+1)ch (12px ch — inherits from ruler container),
// then shifted left by its own pixel width so the right edge lands at the right edge of base `col`.
function Tick({ col, label }: { col: number; label: string }) {
  return (
    <div style={{
      position: 'absolute',
      left: `${col + 1}ch`,
      top: 0,
      transform: 'translateX(-100%)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'flex-end',
    }}>
      <div style={{ width: 1, height: 4, background: '#b0b0b0' }} />
      <span style={{ fontSize: 9, whiteSpace: 'nowrap', lineHeight: 1 }}>{label}</span>
    </div>
  )
}

// --- Arrow rendering helper ---

function ArrowTrack({
  tracks, color: _colorUnused, isForward, selection, onAnnotationClick,
}: {
  tracks:             TrackItem[]
  color?:             string
  isForward:          boolean
  selection:          SelectionDTO | null
  onAnnotationClick:  (feat: FeatureDTO) => void
}) {
  if (tracks.length === 0) return null
  const layerCount = Math.max(...tracks.map(t => t.layer)) + 1
  const height = layerCount * (TRACK_HEIGHT + TRACK_GAP) + TRACK_GAP

  return (
    <div style={{ position: 'relative', height }}>
      {tracks.map((item, ti) => {
        const color    = isForward ? item.feat.fwdColor : item.feat.revColor
        const top      = TRACK_GAP + item.layer * (TRACK_HEIGHT + TRACK_GAP)
        const widthCh  = item.endCol - item.startCol
        const selected = selection?.featureId === item.feat.id

        let clipPath: string | undefined
        if (isForward && item.isEnd)
          clipPath = `polygon(0 0, calc(100% - ${ARROW_TIP}px) 0, 100% 50%, calc(100% - ${ARROW_TIP}px) 100%, 0 100%)`
        else if (!isForward && item.isStart)
          clipPath = `polygon(${ARROW_TIP}px 0, 100% 0, 100% 100%, ${ARROW_TIP}px 100%, 0 50%)`

        const padL = (!isForward && item.isStart) ? ARROW_TIP + 3 : 4
        const padR = (isForward  && item.isEnd)   ? ARROW_TIP + 3 : 4

        return (
          <div
            key={`${item.featIdx}-${ti}`}
            onClick={(e) => { e.stopPropagation(); onAnnotationClick(item.feat) }}
            title={item.feat.label}
            style={{
              position:   'absolute',
              left:       `${item.startCol}ch`,
              width:      `${widthCh}ch`,
              top, height: TRACK_HEIGHT,
              background: color,
              clipPath,
              cursor:     'pointer',
              display:    'flex',
              alignItems: 'center',
              overflow:   'hidden',
              opacity:    selected ? 1 : 0.82,
              outline:    selected ? '2px solid #FFCC00' : 'none',
              outlineOffset: 1,
            }}
          >
            <span style={{
              paddingLeft:   padL,
              paddingRight:  padR,
              fontSize:      9,
              fontFamily:    'system-ui, sans-serif',
              fontWeight:    600,
              letterSpacing: 0.2,
              color:         '#1a1a1a',
              textShadow:    '0 0 3px rgba(255,255,255,0.6)',
              whiteSpace:    'nowrap',
              overflow:      'hidden',
              textOverflow:  'ellipsis',
              pointerEvents: 'none',
            }}>
              {item.feat.label}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// --- Row ---

interface RowData {
  doc:               DocumentDTO
  selection:         SelectionDTO | null
  lineLayouts:       LineLayout[]
  onAnnotationClick: (feat: FeatureDTO) => void
}

function Row({ index, style, data }: ListChildComponentProps<RowData>) {
  const { doc, selection, lineLayouts, onAnnotationClick } = data
  const lineStart = index * BASES_PER_LINE
  const lineEnd   = Math.min(lineStart + BASES_PER_LINE, doc.bases.length)
  const layout    = lineLayouts[index]

  const fwdSegments: Array<{ text: string; fg: string; bg: string }> = []
  const revSlice = complementStrand(doc.bases.slice(lineStart, lineEnd))
  let i = lineStart
  while (i < lineEnd) {
    const [fg, bg] = baseColors(i, selection)
    let j = i + 1
    while (j < lineEnd) {
      const [fgJ, bgJ] = baseColors(j, selection)
      if (fgJ !== fg || bgJ !== bg) break
      j++
    }
    fwdSegments.push({ text: doc.bases.slice(i, j), fg, bg })
    i = j
  }

  const annotationStyle: React.CSSProperties = {
    marginLeft: `calc(${GUTTER_WIDTH} + ${GUTTER_MARGIN}px)`,
  }

  return (
    <div style={{ ...style, fontFamily: 'monospace', fontSize: 12, paddingBottom: ROW_GAP }} data-line-idx={index}>

      {/* Forward (sense) strand */}
      <div style={{ display: 'flex', alignItems: 'center',
                    height: SEQ_HEIGHT, lineHeight: `${SEQ_HEIGHT}px` }}>
        <span style={{ color: '#909090', width: GUTTER_WIDTH, textAlign: 'right',
                       marginRight: GUTTER_MARGIN, flexShrink: 0 }}>
          {lineStart + 1}
        </span>
        {fwdSegments.map((s, idx) => (
          <span key={idx} style={{ color: s.fg, background: s.bg }}>{s.text}</span>
        ))}
        <span style={{ color: '#909090', marginLeft: 6, flexShrink: 0 }}>{lineEnd}</span>
      </div>

      {/* Reverse (antisense) strand — immediately below forward */}
      <div style={{ display: 'flex', alignItems: 'center',
                    height: SEQ_HEIGHT, lineHeight: `${SEQ_HEIGHT}px` }}>
        <span style={{ color: '#909090', width: GUTTER_WIDTH, textAlign: 'right',
                       marginRight: GUTTER_MARGIN, flexShrink: 0 }} />
        <span style={{ color: '#888888' }}>{revSlice}</span>
      </div>

      {/* Position ruler — fontSize MUST match the sequence row (12px) so ch units align */}
      <div style={{
        position: 'relative',
        height: RULER_HEIGHT,
        marginLeft: `calc(${GUTTER_WIDTH} + ${GUTTER_MARGIN}px)`,
        fontSize: 12,
        fontFamily: 'monospace',
        color: '#909090',
        userSelect: 'none',
      }}>
        {/* Tick at bp=1 (only on the first row) */}
        {lineStart === 0 && <Tick col={0} label="1" />}
        {/* Ticks at every 1-based multiple of RULER_STEP */}
        {Array.from({ length: lineEnd - lineStart }, (_, col) => {
          const bp1 = lineStart + col + 1
          if (bp1 % RULER_STEP !== 0) return null
          return <Tick key={col} col={col} label={String(bp1)} />
        })}
      </div>

      {/* Sense (forward) annotation track */}
      {layout.fwdLayerCount > 0 && (
        <div style={annotationStyle}>
          <ArrowTrack
            tracks={layout.fwdTracks}
            isForward={true}
            selection={selection}
            onAnnotationClick={onAnnotationClick}
          />
        </div>
      )}

      {/* Antisense (reverse) annotation track */}
      {layout.revLayerCount > 0 && (
        <div style={{ ...annotationStyle, marginTop: layout.fwdLayerCount > 0 ? STRAND_SEP : 0 }}>
          <ArrowTrack
            tracks={layout.revTracks}
            isForward={false}
            selection={selection}
            onAnnotationClick={onAnnotationClick}
          />
        </div>
      )}

    </div>
  )
}

// --- SelectionHUD ---

function gcPercent(seq: string): string {
  if (seq.length === 0) return '—'
  let gc = 0
  for (const b of seq) { if (b === 'G' || b === 'C' || b === 'g' || b === 'c') gc++ }
  return (gc / seq.length * 100).toFixed(1) + '%'
}

function tmCelsius(seq: string): string {
  const len = seq.length
  if (len < 6) return '—'
  let gc = 0
  for (const b of seq) {
    const u = b.toUpperCase()
    if (u === 'G' || u === 'C') gc++
  }
  // Marmur-Schildkraut-Doty, 50 mM NaCl — matches BioPython Tm_GC / R TmCalculator
  const tm = 81.5 + 16.6 * Math.log10(0.05) + 0.41 * (gc / len * 100) - 675 / len
  return tm.toFixed(1) + '°C'
}

function reverseComplement(seq: string): string {
  return Array.from(seq).reverse().map(b => COMPLEMENT[b] ?? b).join('')
}

function wrapSeq(seq: string, width = 60): string {
  const lines: string[] = []
  for (let i = 0; i < seq.length; i += width) lines.push(seq.slice(i, i + width))
  return lines.join('\n')
}

function downloadFasta(filename: string, text: string) {
  const blob = new Blob([text], { type: 'text/plain' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

function SelectionHUD({ selection, bases, features }: {
  selection: import('../types').SelectionDTO | null
  bases:     string
  features:  import('../types').FeatureDTO[]
}) {
  const [senseMode, setSenseMode] = useState(true)
  const [copied,    setCopied]    = useState(false)

  // Reset when selection changes
  useEffect(() => { setSenseMode(true); setCopied(false) }, [selection?.featureId])

  const hasSelection = !!(selection && selection.start >= 0 && selection.end > selection.start)
  const feat      = hasSelection && selection!.featureId
    ? features.find(f => f.id === selection!.featureId) ?? null
    : null
  const isReverse = feat?.direction === 'reverse'
  const rawSlice  = hasSelection ? bases.slice(selection!.start, selection!.end) : ''
  const exportSeq = (senseMode && isReverse) ? reverseComplement(rawSlice) : rawSlice
  const gc = hasSelection ? gcPercent(rawSlice) : '—'
  const tm = hasSelection ? tmCelsius(rawSlice)  : '—'

  const fastaLabel = feat
    ? (isReverse && senseMode
        ? `complement(${selection!.start + 1}..${selection!.end})`
        : `${selection!.start + 1}..${selection!.end}`)
    : `${(selection?.start ?? 0) + 1}..${selection?.end ?? 0}`
  const fastaName = feat?.label ?? 'selection'
  const fastaStr  = `>${fastaName} ${fastaLabel}\n${wrapSeq(exportSeq)}\n`

  const handleCopy = () => {
    navigator.clipboard.writeText(fastaStr).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <div style={hudStyle}>
      {hasSelection ? (
        <>
          <span style={{ flex: 1 }}>
            <span style={hudLabelStyle}>pos </span>
            <span style={hudValueStyle}>{selection!.start + 1}–{selection!.end}</span>
            <span style={hudSepStyle}> | </span>
            <span style={hudValueStyle}>{selection!.end - selection!.start} bp</span>
            <span style={hudSepStyle}> | </span>
            <span style={hudLabelStyle}>GC </span>
            <span style={hudValueStyle}>{gc}</span>
            <span style={hudSepStyle}> | </span>
            <span style={hudLabelStyle}>Tm </span>
            <span style={hudValueStyle}>{tm}</span>
          </span>
          <div style={{ display: 'flex', gap: 4, paddingRight: 6 }}>
            {isReverse && (
              <button
                onClick={() => setSenseMode(m => !m)}
                title={senseMode
                  ? 'Exporting sense strand (RC). Click for raw genomic.'
                  : 'Exporting raw genomic strand. Click for sense.'}
                style={{ ...hudBtnStyle, color: senseMode ? '#2a7a2a' : '#888' }}
              >
                {senseMode ? '5′→3′ sense' : '3′→5′ raw'}
              </button>
            )}
            <button onClick={handleCopy} style={hudBtnStyle}>
              {copied ? 'Copied ✓' : 'Copy FASTA'}
            </button>
            <button
              onClick={() => downloadFasta(`${fastaName}.fasta`, fastaStr)}
              style={hudBtnStyle}
            >
              ↓ .fasta
            </button>
          </div>
        </>
      ) : (
        <span style={{ color: '#aaa' }}>No selection</span>
      )}
    </div>
  )
}

const hudStyle: React.CSSProperties = {
  flexShrink: 0,
  height: 26,
  display: 'flex',
  alignItems: 'center',
  paddingLeft: 10,
  fontSize: 11,
  fontFamily: 'monospace',
  background: '#f5f5f5',
  borderTop: '1px solid #d0d0d0',
  userSelect: 'none',
}
const hudLabelStyle: React.CSSProperties = { color: '#999' }
const hudValueStyle: React.CSSProperties = { color: '#222' }
const hudSepStyle:   React.CSSProperties = { color: '#ccc' }
const hudBtnStyle:   React.CSSProperties = {
  padding: '1px 6px', fontSize: 10, borderRadius: 3,
  border: '1px solid #ccc', background: '#fff',
  cursor: 'pointer', color: '#444', whiteSpace: 'nowrap',
}

// --- SeqView ---

interface SeqViewProps {
  doc: DocumentDTO
}

export function SeqView({ doc }: SeqViewProps) {
  const { selection, publish } = useSelection('seqview')
  const listRef      = useRef<VariableSizeList>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const { width, height } = useContainerSize(containerRef)

  const lineLayouts = useMemo(() => buildLineLayouts(doc), [doc])

  useEffect(() => {
    listRef.current?.resetAfterIndex(0)
  }, [lineLayouts])

  useEffect(() => {
    if (selection && selection.start >= 0) {
      const lineNum = Math.floor(selection.start / BASES_PER_LINE)
      listRef.current?.scrollToItem(lineNum, 'center')
    }
  }, [selection])

  const lineCount = Math.ceil(doc.bases.length / BASES_PER_LINE)

  const onAnnotationClick = useCallback((feat: FeatureDTO) => {
    const start = feat.spans[0]?.start ?? 0
    const end   = feat.spans[feat.spans.length - 1]?.end ?? 0
    publish({ start, end, featureId: feat.id })
  }, [publish])

  const itemData = useMemo<RowData>(
    () => ({ doc, selection, lineLayouts, onAnnotationClick }),
    [doc, selection, lineLayouts, onAnnotationClick],
  )

  const handleClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement
    if (target.tagName !== 'SPAN') return
    const row = target.closest('[data-line-idx]') as HTMLElement | null
    if (!row) return
    const lineIdx   = parseInt(row.dataset.lineIdx ?? '0', 10)
    const lineStart = lineIdx * BASES_PER_LINE
    const lineEnd   = Math.min(lineStart + BASES_PER_LINE, doc.bases.length)
    publish({ start: lineStart, end: lineEnd, featureId: '' })
  }, [doc.bases.length, publish])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%' }}>
      <div ref={containerRef} style={{ flex: 1, overflow: 'hidden' }} onClick={handleClick}>
        {height > 0 && (
          <VariableSizeList
            ref={listRef}
            height={height}
            width={width}
            itemCount={lineCount}
            itemSize={(i) => lineRowHeight(lineLayouts[i] ?? { fwdTracks: [], revTracks: [], fwdLayerCount: 0, revLayerCount: 0 })}
            itemData={itemData}
          >
            {Row}
          </VariableSizeList>
        )}
      </div>
      <SelectionHUD selection={selection} bases={doc.bases} features={doc.features} />
    </div>
  )
}
