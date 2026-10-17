const path = require('node:path')
const dotenv = require('dotenv')
const { parseMcpServers } = require('./mcp-tools')

function positiveInteger(value, fallback, name) {
  if (value === undefined || value === '') return fallback

  const number = Number(value)
  if (!Number.isInteger(number) || number <= 0) {
    throw new Error(`${name} harus berupa bilangan bulat positif`)
  }

  return number
}

function commaSeparated(value, fallback = []) {
  if (!value?.trim()) return fallback
  return value.split(',').map((item) => item.trim()).filter(Boolean)
}

function normalizeOwnerId(value) {
  const normalized = value.trim().replace(/^\+/, '')
  return normalized.includes('@') ? normalized : `${normalized}@s.whatsapp.net`
}

function whatsappVersion(value) {
  if (!value?.trim()) return undefined
  const version = value.split(',').map((item) => Number(item.trim()))
  if (version.length !== 3 || version.some((item) => !Number.isSafeInteger(item) || item < 0)) {
    throw new Error('WHATSAPP_WEB_VERSION harus berisi tiga angka yang dipisahkan koma')
  }
  return version
}

function loadConfig(environment = process.env) {
  dotenv.config({ quiet: true })

  const env = environment === process.env ? process.env : environment
  const missing = []
  if (!env.HF_TOKEN?.trim() && !env.DEEPSEEK_API_KEY?.trim()) missing.push('HF_TOKEN (atau DEEPSEEK_API_KEY)')
  if (!env.DATABASE_URL?.trim()) missing.push('DATABASE_URL')

  if (missing.length > 0) {
    throw new Error(`Konfigurasi wajib belum tersedia: ${missing.join(', ')}`)
  }

  return {
    aiApiKey: env.HF_TOKEN?.trim() || env.DEEPSEEK_API_KEY.trim(),
    databaseUrl: env.DATABASE_URL.trim(),
    aiBaseUrl: env.AI_BASE_URL?.trim() || env.AI_API_URL?.trim() || env.DEEPSEEK_API_URL?.trim() || 'https://api.howtofix.id/v1',
    aiModel: env.AI_MODEL?.trim() || env.DEEPSEEK_MODEL?.trim() || 'deepseek-v4.1-flash',
    systemPrompt:
      env.SYSTEM_PROMPT?.trim() ||
      'Anda adalah asisten WhatsApp yang ramah dan membantu. Jawab dengan ringkas dalam Bahasa Indonesia.',
    historyLimit: positiveInteger(env.HISTORY_LIMIT, 10, 'HISTORY_LIMIT'),
    aiTimeoutMs: positiveInteger(env.AI_TIMEOUT_MS, 30_000, 'AI_TIMEOUT_MS'),
    sessionPath: path.resolve(env.SESSION_PATH?.trim() || './auth_info_baileys'),
    logLevel: env.LOG_LEVEL?.trim() || 'info',
    whatsappConnectTimeoutMs: positiveInteger(env.WHATSAPP_CONNECT_TIMEOUT_MS, 30_000, 'WHATSAPP_CONNECT_TIMEOUT_MS'),
    whatsappMaxReconnectAttempts: positiveInteger(
      env.WHATSAPP_MAX_RECONNECT_ATTEMPTS,
      5,
      'WHATSAPP_MAX_RECONNECT_ATTEMPTS'
    ),
    whatsappVersion: whatsappVersion(env.WHATSAPP_WEB_VERSION),
    ownerIds: commaSeparated(env.OWNER_NUMBERS).map(normalizeOwnerId),
    allowedPaths: commaSeparated(env.AGENT_ALLOWED_PATHS, ['./agent-workspace']).map((item) => path.resolve(item)),
    allowedApps: commaSeparated(env.AGENT_ALLOWED_APPS).map((item) => item.toLowerCase()),
    allowedCmdCommands: commaSeparated(
      env.AGENT_ALLOWED_CMD_COMMANDS,
      ['ver', 'whoami', 'hostname', 'ipconfig', 'tasklist', 'systeminfo']
    ).map((item) => item.toLowerCase()),
    cameraDeviceName: env.CAMERA_DEVICE_NAME?.trim() || '',
    cameraFfmpegPath: env.CAMERA_FFMPEG_PATH?.trim() || 'ffmpeg',
    ocrLanguages: commaSeparated(env.OCR_LANGUAGES, ['eng', 'ind']),
    browserChannel: env.BROWSER_CHANNEL?.trim() || 'msedge',
    browserHeadless: env.BROWSER_HEADLESS?.trim().toLowerCase() === 'true',
    mcpServers: parseMcpServers(env.MCP_SERVERS_JSON),
    approvalTtlMinutes: positiveInteger(env.AGENT_APPROVAL_TTL_MINUTES, 10, 'AGENT_APPROVAL_TTL_MINUTES'),
    godmodeTtlMinutes: positiveInteger(env.AGENT_GODMODE_TTL_MINUTES, 30, 'AGENT_GODMODE_TTL_MINUTES'),
    maxFileBytes: positiveInteger(env.AGENT_MAX_FILE_BYTES, 32_768, 'AGENT_MAX_FILE_BYTES'),
    maxMediaBytes: positiveInteger(env.AGENT_MAX_MEDIA_BYTES, 10_485_760, 'AGENT_MAX_MEDIA_BYTES')
  }
}

module.exports = { commaSeparated, loadConfig, normalizeOwnerId, positiveInteger, whatsappVersion }
