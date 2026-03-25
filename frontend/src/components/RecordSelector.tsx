import type { RecordDTO } from '../types'

interface RecordSelectorProps {
  records: RecordDTO[]
  activeIndex: number
  onSelect: (index: number) => void
}

function formatLength(bp: number): string {
  if (bp >= 1_000_000) return (bp / 1_000_000).toFixed(2).replace(/\.?0+$/, '') + ' Mbp'
  if (bp >= 1_000)     return (bp / 1_000).toFixed(1).replace(/\.0$/, '') + ' kbp'
  return bp + ' bp'
}

export function RecordSelector({ records, activeIndex, onSelect }: RecordSelectorProps) {
  return (
    <div style={stripStyle}>
      <span style={labelStyle}>⚠ Multi-record file — select a molecule:</span>
      <div style={pillRowStyle}>
        {records.map((rec, i) => {
          const isChrom = i === 0  // largest record = chromosome
          const active  = rec.index === activeIndex
          const tag     = isChrom ? 'Chromosome' : 'Plasmid'
          return (
            <button
              key={rec.index}
              title={`${tag}: ${rec.name} · ${formatLength(rec.length)}`}
              onClick={() => onSelect(rec.index)}
              style={pillStyle(active, isChrom)}
            >
              <span style={tagStyle(isChrom)}>{tag}</span>
              <span style={nameStyle}>{rec.name}</span>
              <span style={sizeStyle}>{formatLength(rec.length)}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ---- Styles -----------------------------------------------------------------

const stripStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '4px 16px',
  background: 'var(--bg-strip)',
  borderBottom: '1px solid var(--border-strip)',
  flexShrink: 0,
  flexWrap: 'wrap',
}

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--text-strip)',
  fontWeight: 500,
  whiteSpace: 'nowrap',
}

const pillRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: 6,
  flexWrap: 'wrap',
}

function pillStyle(active: boolean, isChrom: boolean): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    padding: '3px 10px',
    borderRadius: 20,
    border: active ? '2px solid #1a6fbf' : '1px solid #bbb',
    background: active ? '#e8f2fd' : '#f5f5f5',
    color: active ? '#1a4a7a' : '#333',
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: active ? 600 : 400,
    outline: 'none',
    transition: 'background 0.1s, border-color 0.1s',
  }
}

function tagStyle(isChrom: boolean): React.CSSProperties {
  return {
    fontSize: 10,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    color: isChrom ? '#1a6fbf' : '#7a5c00',
    background: isChrom ? '#dbeeff' : '#fef3cd',
    padding: '1px 5px',
    borderRadius: 4,
  }
}

const nameStyle: React.CSSProperties = {
  fontFamily: 'monospace',
  fontSize: 12,
}

const sizeStyle: React.CSSProperties = {
  color: 'var(--text-2)',
  fontSize: 11,
}
