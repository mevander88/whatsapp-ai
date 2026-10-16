const WHATSAPP_WEB_SERVICE_WORKER_URL = 'https://web.whatsapp.com/sw.js'
const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

async function fetchLatestWaWebVersion({ fetchImpl = globalThis.fetch, timeoutMs = 10_000 } = {}) {
  const response = await fetchImpl(WHATSAPP_WEB_SERVICE_WORKER_URL, {
    method: 'GET',
    headers: {
      'sec-fetch-site': 'none',
      'user-agent': DEFAULT_USER_AGENT
    },
    signal: AbortSignal.timeout(timeoutMs)
  })

  if (!response.ok) {
    throw new Error(`WhatsApp Web mengembalikan HTTP ${response.status}`)
  }

  const content = await response.text()
  const match = content.match(/\\?"client_revision\\?":\s*(\d+)/)
  const revision = Number(match?.[1])
  if (!Number.isSafeInteger(revision) || revision <= 0) {
    throw new Error('Versi WhatsApp Web tidak ditemukan pada service worker')
  }

  return [2, 3000, revision]
}

module.exports = { fetchLatestWaWebVersion, WHATSAPP_WEB_SERVICE_WORKER_URL }
