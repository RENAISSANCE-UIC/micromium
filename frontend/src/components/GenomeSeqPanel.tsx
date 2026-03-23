import { useState, useEffect, useMemo } from 'react'
import { fetchSequence } from '../api'
import { useSelection } from '../hooks/useSelection'
import type { DocumentDTO, FeatureDTO } from '../types'

// ---- Layout constants (mirror SeqView) -----------------------------------
const BASES_PER_LINE = 100
const SEQ_HEIGHT     = 20   // px
const RULER_HEIGHT   = 16   // px
const TRACK_HEIGHT   = 15   // px
const TRACK_GAP      = 3    // px
const STRAND_SEP     = 4    // px
const ARROW_TIP      = 7    // px
const GUTTER_W       = '7ch'
const GUTTER_MX      = 8    // px
const MAX_BP         = 900

// ---- Complement ----------------------------------------------------------
const COMPLEMENT: Record<string, string> = {
  A: 'T', T: 'A', G: 'C', C: 'G',
  a: 't', t: 'a', g: 'c', c: 'g',
}
function comp(seq: string): string {
  return Array.from(seq).map(b => COMPLEMENT[b] ?? b).join('')
}

// ---- Annotation layout ---------------------------------------------------
interface TrackItem {
  feat:     FeatureDTO
  colStart: number   // column within row (0-indexed)
  colEnd:   number
  layer:    number
  isStart:  boolean  // feature's real start falls on this line
  isEnd:    boolean  // feature's real end falls on this line
}

interface LineLayout {
  fwdTracks:     TrackItem[]
  revTracks:     TrackItem[]
  fwdLayerCount: number
  revLayerCount: number
}

function assignLayers(items: TrackItem[]): number {
  if (!items.length) return 0
  items.sort((a, b) => a.colStart - b.colStart)
  const ends: number[] = []
  for (const it of items) {
    let l = ends.findIndex(e => e <= it.colStart)
    if (l < 0) { l = ends.length; ends.push(0) }
    ends[l] = it.colEnd
    it.layer = l
  }
  return ends.length
}

/**
 * Build per-row annotation layouts for the fetched window [gStart, gEnd).
 * Coordinate system: local index 0 = genomic position gStart.
 */
function buildLocalLayouts(
  features: FeatureDTO[],
  gStart: number,
  gEnd:   number,
): LineLayout[] {
  const winLen    = gEnd - gStart
  const lineCount = Math.ceil(winLen / BASES_PER_LINE)
  const layouts: LineLayout[] = Array.from({ length: lineCount }, () => ({
    fwdTracks: [], revTracks: [], fwdLayerCount: 0, revLayerCount: 0,
  }))

  for (const feat of features) {
    if (feat.type === 'source') continue
    const isFwd = feat.direction !== 'reverse'

    for (const span of feat.spans) {
      const clipStart = Math.max(gStart, span.start)
      const clipEnd   = Math.min(gEnd,   span.end)
      if (clipEnd <= clipStart) continue

      // Local indices within the fetched string
      const localStart = clipStart - gStart
      const localEnd   = clipEnd   - gStart

      const firstLine = Math.floor(localStart / BASES_PER_LINE)
      const lastLine  = Math.floor(Math.max(localEnd - 1, localStart) / BASES_PER_LINE)

      for (let li = firstLine; li <= lastLine && li < lineCount; li++) {
        const lineLS = li * BASES_PER_LINE
        const lineLE = lineLS + BASES_PER_LINE
        const colS = Math.max(0, localStart - lineLS)
        const colE = Math.min(BASES_PER_LINE, localEnd - lineLS)
        if (colE <= colS) continue

        // isStart/isEnd: only if the span's real edge falls within the window AND this line
        const featLocalStart = span.start - gStart
        const featLocalEnd   = span.end   - gStart
        const item: TrackItem = {
          feat,
          colStart: colS, colEnd: colE,
          layer: 0,
          isStart: featLocalStart >= 0 &&
                   featLocalStart >= lineLS && featLocalStart < lineLE,
          isEnd:   featLocalEnd <= winLen &&
                   featLocalEnd > lineLS && featLocalEnd <= lineLE,
        }
        if (isFwd) layouts[li].fwdTracks.push(item)
        else       layouts[li].revTracks.push(item)
      }
    }
  }

  for (const l of layouts) {
    l.fwdLayerCount = assignLayers(l.fwdTracks)
    l.revLayerCount = assignLayers(l.revTracks)
  }
  return layouts
}

// ---- Sub-components (mirror SeqView) ------------------------------------

function Tick({ col, label }: { col: number; label: string }) {
  return (
    <div style={{
      position: 'absolute', left: `${col + 1}ch`, top: 0,
      transform: 'translateX(-100%)',
      display: 'flex', flexDirection: 'column', alignItems: 'flex-end',
    }}>
      <div style={{ width: 1, height: 4, background: '#b0b0b0' }} />
      <span style={{ fontSize: 9, whiteSpace: 'nowrap', lineHeight: 1 }}>{label}</span>
    </div>
  )
}

function ArrowTrack({ tracks, isFwd, selId, onFeatClick }: {
  tracks:       TrackItem[]
  isFwd:        boolean
  selId:        string
  onFeatClick:  (f: FeatureDTO) => void
}) {
  if (!tracks.length) return null
  const layerCount = Math.max(...tracks.map(t => t.layer)) + 1
  const height     = layerCount * (TRACK_HEIGHT + TRACK_GAP) + TRACK_GAP

  return (
    <div style={{ position: 'relative', height }}>
      {tracks.map((item, ti) => {
        const color    = isFwd ? item.feat.fwdColor : item.feat.revColor
        const top      = TRACK_GAP + item.layer * (TRACK_HEIGHT + TRACK_GAP)
        const widthCh  = item.colEnd - item.colStart
        const selected = item.feat.id === selId

        let clipPath: string | undefined
        if (isFwd && item.isEnd)
          clipPath = `polygon(0 0, calc(100% - ${ARROW_TIP}px) 0, 100% 50%, calc(100% - ${ARROW_TIP}px) 100%, 0 100%)`
        else if (!isFwd && item.isStart)
          clipPath = `polygon(${ARROW_TIP}px 0, 100% 0, 100% 100%, ${ARROW_TIP}px 100%, 0 50%)`

        const padL = (!isFwd && item.isStart) ? ARROW_TIP + 3 : 4
        const padR = (isFwd  && item.isEnd)   ? ARROW_TIP + 3 : 4

        return (
          <div
            key={`${item.feat.id}-${ti}`}
            onClick={(e) => { e.stopPropagation(); onFeatClick(item.feat) }}
            title={item.feat.label}
            style={{
              position: 'absolute',
              left: `${item.colStart}ch`, width: `${widthCh}ch`,
              top, height: TRACK_HEIGHT,
              background: color, clipPath, cursor: 'pointer',
              display: 'flex', alignItems: 'center', overflow: 'hidden',
              opacity:       selected ? 1 : 0.82,
              outline:       selected ? '2px solid #FFCC00' : 'none',
              outlineOffset: 1,
            }}
          >
            <span style={{
              paddingLeft: padL, paddingRight: padR,
              fontSize: 9, fontFamily: 'system-ui, sans-serif',
              fontWeight: 600, letterSpacing: 0.2,
              color: '#1a1a1a', textShadow: '0 0 3px rgba(255,255,255,0.6)',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
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

// ---- Main component ------------------------------------------------------

interface Props { doc: DocumentDTO; alwaysShow?: boolean }

export function GenomeSeqPanel({ doc, alwaysShow }: Props) {
  const { selection, publish } = useSelection('seqpanel')

  const [state, setState] = useState<{
    gStart:    number   // genomic start of window (0-indexed)
    gEnd:      number   // genomic end of window (exclusive)
    bases:     string
    truncated: boolean
    featId:    string
    label:     string
    span:      string
  } | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!selection || selection.start < 0 || !selection.featureId) {
      setState(null); return
    }
    const feat = doc.features.find(f => f.id === selection.featureId)
    if (!feat || !feat.spans.length) { setState(null); return }

    const gStart    = feat.spans[0].start
    const gEnd      = feat.spans[feat.spans.length - 1].end
    const fetchEnd  = Math.min(gStart + MAX_BP, gEnd)
    const truncated = gEnd - gStart > MAX_BP
    const label     = feat.label || feat.id
    const span      = `${gStart + 1}..${gEnd}  (${feat.direction})`

    setLoading(true)
    setState(null)
    fetchSequence(gStart, fetchEnd)
      .then(bases => {
        setState({ gStart, gEnd: fetchEnd, bases, truncated, featId: feat.id, label, span })
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [selection, doc])

  const layouts = useMemo(() => {
    if (!state) return []
    return buildLocalLayouts(doc.features, state.gStart, state.gEnd)
  }, [doc.features, state])

  const onFeatClick = (feat: FeatureDTO) => {
    publish({
      start:     feat.spans[0].start,
      end:       feat.spans[feat.spans.length - 1].end,
      featureId: feat.id,
    })
  }

  if (!loading && !state) {
    if (!alwaysShow) return null
    return (
      <div style={{
        flex: '1 1 auto', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#f8f8f8', color: '#bbb', fontSize: 12, fontFamily: 'monospace',
        userSelect: 'none',
      }}>
        Select a feature to view its sequence
      </div>
    )
  }

  const selId = selection?.featureId ?? ''

  return (
    <div style={{
      borderTop:  alwaysShow ? 'none' : '1px solid #d0d0d0',
      background: '#f8f8f8',
      flexShrink: alwaysShow ? undefined : 0,
      flex:       alwaysShow ? '1 1 auto' : undefined,
      display:    alwaysShow ? 'flex' : undefined,
      flexDirection: alwaysShow ? 'column' : undefined,
      minHeight:  alwaysShow ? 0 : undefined,
      overflow:   alwaysShow ? 'hidden' : undefined,
    }}>
      {/* Header: feature name + span */}
      {state && (
        <div style={{
          padding: '4px 14px 2px',
          fontSize: 12, color: '#555', fontFamily: 'monospace',
        }}>
          <strong style={{ color: '#1a1a1a' }}>{state.label}</strong>
          {'  '}{state.span}
          {state.truncated && (
            <span style={{ color: '#aaa', marginLeft: 8 }}>(first {MAX_BP} bp shown)</span>
          )}
        </div>
      )}

      {/* Sequence body */}
      <div style={{
        flex:      alwaysShow ? '1 1 auto' : undefined,
        maxHeight: alwaysShow ? undefined : 220,
        overflowY: 'auto',
        overflowX: 'auto',
        padding:   '4px 14px 8px',
        fontFamily: 'monospace',
        fontSize:   12,
      }}>
        {loading ? (
          <span style={{ color: '#aaa' }}>Loading…</span>
        ) : state && layouts.map((layout, li) => {
          const localStart = li * BASES_PER_LINE
          const localEnd   = Math.min(localStart + BASES_PER_LINE, state.bases.length)
          const fwdSlice   = state.bases.slice(localStart, localEnd)
          const revSlice   = comp(fwdSlice)
          const gFirst1    = state.gStart + localStart + 1   // 1-indexed genomic start

          return (
            <div key={li} style={{ marginBottom: 6 }}>

              {/* Forward strand */}
              <div style={{
                display: 'flex', alignItems: 'center',
                height: SEQ_HEIGHT, lineHeight: `${SEQ_HEIGHT}px`,
              }}>
                <span style={{
                  color: '#909090', width: GUTTER_W, textAlign: 'right',
                  marginRight: GUTTER_MX, flexShrink: 0,
                }}>
                  {gFirst1}
                </span>
                <span>{fwdSlice}</span>
                <span style={{ color: '#909090', marginLeft: 6, flexShrink: 0 }}>
                  {state.gStart + localEnd}
                </span>
              </div>

              {/* Reverse (complement) strand */}
              <div style={{
                display: 'flex', alignItems: 'center',
                height: SEQ_HEIGHT, lineHeight: `${SEQ_HEIGHT}px`,
              }}>
                <span style={{ width: GUTTER_W, marginRight: GUTTER_MX, flexShrink: 0 }} />
                <span style={{ color: '#888' }}>{revSlice}</span>
              </div>

              {/* Position ruler — genomic coordinates */}
              <div style={{
                position: 'relative', height: RULER_HEIGHT,
                marginLeft: `calc(${GUTTER_W} + ${GUTTER_MX}px)`,
                fontSize: 12, fontFamily: 'monospace',
                color: '#909090', userSelect: 'none',
              }}>
                {li === 0 && <Tick col={0} label={String(state.gStart + 1)} />}
                {Array.from({ length: localEnd - localStart }, (_, col) => {
                  const gp1 = state.gStart + localStart + col + 1
                  if (gp1 % 10 !== 0) return null
                  return <Tick key={col} col={col} label={String(gp1)} />
                })}
              </div>

              {/* Forward annotation tracks */}
              {layout.fwdLayerCount > 0 && (
                <div style={{ marginLeft: `calc(${GUTTER_W} + ${GUTTER_MX}px)` }}>
                  <ArrowTrack
                    tracks={layout.fwdTracks} isFwd={true}
                    selId={selId} onFeatClick={onFeatClick}
                  />
                </div>
              )}

              {/* Reverse annotation tracks */}
              {layout.revLayerCount > 0 && (
                <div style={{
                  marginLeft: `calc(${GUTTER_W} + ${GUTTER_MX}px)`,
                  marginTop:  layout.fwdLayerCount > 0 ? STRAND_SEP : 0,
                }}>
                  <ArrowTrack
                    tracks={layout.revTracks} isFwd={false}
                    selId={selId} onFeatClick={onFeatClick}
                  />
                </div>
              )}

            </div>
          )
        })}
      </div>
    </div>
  )
}
