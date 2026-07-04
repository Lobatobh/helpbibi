const LEGACY_DEV_SOCKET_URL = '/?XTransformPort=3003'
export const RESCUE_SOCKET_PATH = '/'
const PLACEHOLDER_HOSTS = new Set([
  'your-domain.example.com',
  'helpbibi.dominio.com',
])

type ResolveSocketUrlOptions = {
  envUrl?: string | null
  nodeEnv?: string
  origin?: string | null
}

type SocketStatus = {
  connected: boolean
  error?: string | null
}

function browserOrigin() {
  if (typeof window === 'undefined') return null
  return window.location?.origin || null
}

function isPlaceholderUrl(value: string) {
  try {
    const url = new URL(value, 'https://placeholder.invalid')
    return PLACEHOLDER_HOSTS.has(url.hostname)
  } catch {
    return value.includes('your-domain.example.com') || value.includes('helpbibi.dominio.com')
  }
}

export function resolveRescueSocketUrl(options: ResolveSocketUrlOptions = {}) {
  const envUrl = (options.envUrl ?? process.env.NEXT_PUBLIC_SOCKET_URL ?? '').trim()
  const nodeEnv = options.nodeEnv ?? process.env.NODE_ENV
  const origin = options.origin ?? browserOrigin()

  if (envUrl && !isPlaceholderUrl(envUrl)) return envUrl
  if (nodeEnv === 'production') return origin || '/'
  return LEGACY_DEV_SOCKET_URL
}

export function rescueSocketStatusMessage(status: SocketStatus) {
  if (status.connected) return '✓ Conectado ao serviço'
  if (status.error) {
    return 'Falha na conexão em tempo real. Recarregue a página ou tente novamente em alguns segundos.'
  }
  return 'Conectando ao serviço em tempo real...'
}
