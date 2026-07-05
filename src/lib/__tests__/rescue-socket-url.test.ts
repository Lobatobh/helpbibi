import { describe, expect, test } from 'bun:test'
import {
  RESCUE_SOCKET_PATH,
  resolveRescueSocketUrl,
  rescueSocketStatusMessage,
} from '@/lib/rescue-socket-url'

describe('rescue socket URL resolution', () => {
  test('uses the public Socket.IO path for browser connections', () => {
    expect(RESCUE_SOCKET_PATH).toBe('/socket.io')
  })

  test('accepts the production app domain as the public socket URL', () => {
    expect(resolveRescueSocketUrl({
      envUrl: 'https://helpbibi.com',
      nodeEnv: 'production',
      origin: 'https://helpbibi.com',
    })).toBe('https://helpbibi.com')
  })

  test('uses NEXT_PUBLIC_SOCKET_URL when it is configured with a real value', () => {
    expect(resolveRescueSocketUrl({
      envUrl: 'https://socket.helpbibi.com',
      nodeEnv: 'production',
      origin: 'https://helpbibi.com',
    })).toBe('https://socket.helpbibi.com')
  })

  test('falls back to the current public origin in production when env is missing or placeholder', () => {
    expect(resolveRescueSocketUrl({
      envUrl: 'https://your-domain.example.com',
      nodeEnv: 'production',
      origin: 'https://helpbibi.com',
    })).toBe('https://helpbibi.com')

    expect(resolveRescueSocketUrl({
      envUrl: '',
      nodeEnv: 'production',
      origin: 'https://www.helpbibi.com',
    })).toBe('https://www.helpbibi.com')
  })

  test('keeps the local XTransformPort gateway fallback outside production', () => {
    expect(resolveRescueSocketUrl({
      envUrl: '',
      nodeEnv: 'development',
      origin: 'http://localhost:3000',
    })).toBe('/?XTransformPort=3003')
  })

  test('never falls back to the local XTransformPort gateway in production', () => {
    expect(resolveRescueSocketUrl({
      envUrl: '',
      nodeEnv: 'production',
      origin: 'https://helpbibi.com',
    })).not.toBe('/?XTransformPort=3003')
  })
})

describe('rescue socket status message', () => {
  test('shows connected text when socket is connected', () => {
    expect(rescueSocketStatusMessage({ connected: true })).toBe('✓ Conectado ao serviço')
  })

  test('shows a clear visible error when the socket fails', () => {
    expect(rescueSocketStatusMessage({
      connected: false,
      error: 'websocket error',
    })).toBe('Falha na conexão em tempo real. Recarregue a página ou tente novamente em alguns segundos.')
  })
})
