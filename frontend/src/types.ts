export interface SpanDTO {
  start: number  // 0-indexed, half-open [start, end)
  end: number
}

export interface FeatureDTO {
  id: string
  label: string
  type: string
  spans: SpanDTO[]
  direction: 'forward' | 'reverse' | 'none'
  fwdColor: string  // "#RRGGBB"
  revColor: string  // "#RRGGBB"
  qualifiers: Record<string, string[]>  // raw GenBank qualifiers, e.g. /product, /db_xref
}

export interface RecordDTO {
  index: number
  name: string
  length: number
  mode: 'plasmid' | 'genome'
}

export interface DocumentDTO {
  name: string
  length: number
  topology: 'circular' | 'linear'
  bases: string  // empty string when mode === 'genome'
  mode: 'plasmid' | 'genome'
  features: FeatureDTO[]
  recordIndex: number   // index of this record in records[]
  records: RecordDTO[]  // all records from the file; len > 1 means multi-record
}

export interface SelectionDTO {
  start: number       // -1 = cleared
  end: number
  featureId: string   // "" = raw bp selection
  source: string      // "circmap" | "seqview" | "featuretable"
}

// Type declaration for the contextBridge API exposed by preload.ts
declare global {
  interface Window {
    electronAPI: {
      getPort: () => Promise<number>
      openFile: () => Promise<string | null>
      getNativeThemeDark: () => Promise<boolean>
      onThemeChange: (cb: (dark: boolean) => void) => void
      watchFile: (filePath: string) => Promise<void>
      onFileChanged: (cb: (filePath: string) => void) => void
      openExternal: (url: string) => Promise<void>
    }
  }
}
