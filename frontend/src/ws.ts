import type { SelectionDTO } from './types'

export type SelectionHandler = (sel: SelectionDTO) => void

export interface WSClient {
  send: (sel: SelectionDTO) => void
  close: () => void
}

// createWSClient opens a WebSocket to url and calls onMessage for each
// SelectionDTO received. Reconnects automatically with exponential backoff.
export function createWSClient(url: string, onMessage: SelectionHandler): WSClient {
  let ws: WebSocket | null = null
  let retries = 0
  let closed = false

  function connect() {
    ws = new WebSocket(url)

    ws.onopen = () => {
      retries = 0
    }

    ws.onmessage = (e) => {
      try {
        onMessage(JSON.parse(e.data) as SelectionDTO)
      } catch {
        // malformed message — ignore
      }
    }

    ws.onclose = () => {
      if (!closed) {
        const delay = Math.min(300 * Math.pow(2, retries), 10000)
        retries++
        setTimeout(connect, delay)
      }
    }
  }

  connect()

  return {
    send(sel) {
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(sel))
      }
    },
    close() {
      closed = true
      ws?.close()
    },
  }
}
