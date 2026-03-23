import { useState, useEffect, useRef, useCallback } from 'react'
import { createWSClient } from '../ws'
import type { WSClient } from '../ws'
import type { SelectionDTO } from '../types'

// useSelection manages a WebSocket connection to the Go selection hub.
// source identifies this view — events from the same source are ignored
// (mirrors app.Bus behaviour from the Fyne era).
export function useSelection(source: string) {
  const [selection, setSelection] = useState<SelectionDTO | null>(null)
  const clientRef = useRef<WSClient | null>(null)

  useEffect(() => {
    let client: WSClient | null = null

    const getPort = window.electronAPI
      ? window.electronAPI.getPort()
      : Promise.resolve((window as unknown as { __MICROMIUM_PORT__: number }).__MICROMIUM_PORT__)

    getPort.then(port => {
      client = createWSClient(`ws://localhost:${port}/ws`, (sel) => {
        if (sel.source !== source) {
          setSelection(sel)
        }
      })
      clientRef.current = client
    })

    return () => {
      client?.close()
      clientRef.current = null
    }
  }, [source])

  const publish = useCallback((partial: Omit<SelectionDTO, 'source'>) => {
    clientRef.current?.send({ ...partial, source })
  }, [source])

  return { selection, publish }
}
