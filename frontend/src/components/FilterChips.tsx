import { useState, useMemo } from 'react'
import type { FeatureDTO } from '../types'

const PRESET_TYPES = ['CDS', 'AMR', 'IS element', 'oriT', 'oriV', 'misc_feature']
const MAX_CHIPS = 10

export function deriveTypeOrder(features: FeatureDTO[]): string[] {
  const inDoc = new Set(features.filter(f => f.type !== 'source').map(f => f.type))
  const preset = PRESET_TYPES.filter(t => inDoc.has(t))
  const rest   = [...inDoc].filter(t => !PRESET_TYPES.includes(t)).sort()
  return [...preset, ...rest]
}

interface FilterChipsProps {
  features:      FeatureDTO[]
  hiddenTypes:   Set<string>
  onToggle:      (type: string) => void
  basesLength?:  number
  onJumpToBp?:   (bp: number) => void
  /** Override chip color per type (e.g. genome-mode palette). Falls back to fwdColor. */
  colorForType?: (type: string) => string
}

export function FilterChips({ features, hiddenTypes, onToggle, basesLength, onJumpToBp, colorForType }: FilterChipsProps) {
  const [expanded,  setExpanded]  = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [jumpVal,   setJumpVal]   = useState('')

  const typeOrder = useMemo(() => deriveTypeOrder(features), [features])

  const countByType = useMemo(() => {
    const m: Record<string, number> = {}
    for (const f of features) {
      if (f.type === 'source') continue
      m[f.type] = (m[f.type] ?? 0) + 1
    }
    return m
  }, [features])

  const colorByType = useMemo(() => {
    const m: Record<string, string> = {}
    for (const f of features) {
      if (f.type === 'source') continue
      if (!m[f.type]) m[f.type] = colorForType ? colorForType(f.type) : (f.fwdColor || '#888')
    }
    return m
  }, [features, colorForType])

  if (typeOrder.length === 0) return null

  // Collapsed: just a slim strip with an expand toggle
  if (collapsed) {
    return (
      <div style={{ ...barStyle, padding: '2px 8px' }}>
        <button onClick={() => setCollapsed(false)} style={collapseBtn}>
          ▸ Type filters ({typeOrder.length})
        </button>
      </div>
    )
  }

  const overflow     = typeOrder.length - MAX_CHIPS
  const visibleTypes = expanded || overflow <= 0 ? typeOrder : typeOrder.slice(0, MAX_CHIPS)

  return (
    <div style={barStyle}>
      {visibleTypes.map(type => {
        const hidden = hiddenTypes.has(type)
        const color  = colorByType[type] ?? '#888'
        const count  = countByType[type] ?? 0
        return (
          <button
            key={type}
            onClick={() => onToggle(type)}
            title={hidden ? `Show ${type}` : `Hide ${type}`}
            style={{
              display: 'inline-flex', alignItems: 'center',
              padding: '1px 7px', fontSize: 10, borderRadius: 10,
              border: `1.5px solid ${color}`,
              background: hidden ? 'transparent' : color,
              color: hidden ? color : '#1a1a1a',
              fontWeight: hidden ? 400 : 600,
              cursor: 'pointer',
              fontFamily: 'system-ui, sans-serif',
              whiteSpace: 'nowrap',
              lineHeight: '16px',
              textShadow: hidden ? 'none' : '0 0 3px rgba(255,255,255,0.5)',
            }}
          >
            {type} ({count})
          </button>
        )
      })}

      {overflow > 0 && (
        <button onClick={() => setExpanded(e => !e)} style={moreBtn}>
          {expanded ? 'less' : `+${overflow} more`}
        </button>
      )}

      {/* Jump-to-bp — only when a virtual list is available */}
      {basesLength !== undefined && onJumpToBp && (
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          <label style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'system-ui, sans-serif', whiteSpace: 'nowrap' }}>
            Go to bp:
          </label>
          <input
            type="number"
            min={1}
            max={basesLength}
            value={jumpVal}
            onChange={e => setJumpVal(e.target.value)}
            onKeyDown={e => {
              if (e.key !== 'Enter') return
              const raw = parseInt(jumpVal, 10)
              if (!isNaN(raw)) onJumpToBp(Math.max(1, Math.min(basesLength, raw)))
              setJumpVal('')
            }}
            placeholder="bp"
            style={{
              width: 72, fontSize: 10, padding: '1px 4px', borderRadius: 3,
              border: '1px solid var(--btn-bd)', fontFamily: 'monospace', outline: 'none',
              background: 'var(--btn-bg)', color: 'var(--text)',
            }}
          />
        </div>
      )}

      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed(true)}
        title="Hide type filters"
        style={{ ...moreBtn, marginLeft: basesLength !== undefined ? 4 : 'auto', flexShrink: 0 }}
      >
        ▴ hide
      </button>
    </div>
  )
}

const barStyle: React.CSSProperties = {
  flexShrink: 0,
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: 4,
  padding: '4px 8px',
  borderBottom: '1px solid var(--border-lt)',
  background: 'var(--bg-filter)',
}

const moreBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center',
  padding: '1px 7px', fontSize: 10, borderRadius: 10,
  border: '1.5px solid var(--btn-bd)', background: 'transparent',
  color: 'var(--text-2)', cursor: 'pointer',
  fontFamily: 'system-ui, sans-serif',
  whiteSpace: 'nowrap', lineHeight: '16px',
}

const collapseBtn: React.CSSProperties = {
  fontSize: 10, background: 'transparent', border: 'none',
  color: 'var(--text-3)', cursor: 'pointer', fontFamily: 'system-ui, sans-serif',
  padding: 0,
}
