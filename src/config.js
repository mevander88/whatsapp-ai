const path = require('node:path')
const dotenv = require('dotenv')

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

function loadConfig(environment = process.env) {
  dotenv.config({ quiet: true })

  const env = environment === process.env ? process.env : environment
  const missing = ['DEEPSEEK_API_KEY', 'DATABASE_URL'].filter((name) => !env[name]?.trim())

  if (missing.length > 0) {
    throw new Error(`Konfigurasi wajib belum tersedia: ${missing.join(', ')}`)
  }

  return {
    deepseekApiKey: env.DEEPSEEK_API_KEY.trim(),
    databaseUrl: env.DATABASE_URL.trim(),
    deepseekApiUrl: env.DEEPSEEK_API_URL?.trim() || 'https://api.deepseek.com/chat/completions',
    deepseekModel: env.DEEPSEEK_MODEL?.trim() || 'deepseek-flash',
    systemPrompt:
      env.SYSTEM_PROMPT?.trim() ||
      'Anda adalah asisten WhatsApp yang ramah dan membantu. Jawab dengan ringkas dalam Bahasa Indonesia.',
    historyLimit: positiveInteger(env.HISTORY_LIMIT, 10, 'HISTORY_LIMIT'),
    aiTimeoutMs: positiveInteger(env.AI_TIMEOUT_MS, 30_000, 'AI_TIMEOUT_MS'),
    sessionPath: path.resolve(env.SESSION_PATH?.trim() || './auth_info_baileys'),
    logLevel: env.LOG_LEVEL?.trim() || 'info',
    ownerIds: commaSeparated(env.OWNER_NUMBERS).map(normalizeOwnerId),
    allowedPaths: commaSeparated(env.AGENT_ALLOWED_PATHS, ['./agent-workspace']).map((item) => path.resolve(item)),
    allowedApps: commaSeparated(env.AGENT_ALLOWED_APPS).map((item) => item.toLowerCase()),
    approvalTtlMinutes: positiveInteger(env.AGENT_APPROVAL_TTL_MINUTES, 10, 'AGENT_APPROVAL_TTL_MINUTES'),
    maxFileBytes: positiveInteger(env.AGENT_MAX_FILE_BYTES, 32_768, 'AGENT_MAX_FILE_BYTES'),
    maxMediaBytes: positiveInteger(env.AGENT_MAX_MEDIA_BYTES, 10_485_760, 'AGENT_MAX_MEDIA_BYTES')
  }
}

module.exports = { commaSeparated, loadConfig, normalizeOwnerId, positiveInteger }
