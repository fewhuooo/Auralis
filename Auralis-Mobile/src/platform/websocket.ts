export interface PlatformSocket {
  onOpen(handler: () => void): void
  onMessage(handler: (message: { data: string }) => void): void
  onClose(handler: () => void): void
  onError(handler: (error: unknown) => void): void
  close(): void
}

export function openWebSocket(url: string): PlatformSocket {
  const socket = new WebSocket(url)
  return {
    onOpen(handler) {
      socket.onopen = () => handler()
    },
    onMessage(handler) {
      socket.onmessage = (event) => {
        const data = typeof event.data === 'string' ? event.data : String(event.data ?? '')
        handler({ data })
      }
    },
    onClose(handler) {
      socket.onclose = () => handler()
    },
    onError(handler) {
      socket.onerror = (event) => handler(event)
    },
    close() {
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
        socket.close()
      }
    },
  }
}
