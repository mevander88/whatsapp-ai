const { loadConfig } = require('./src/config')
const { createDatabase } = require('./src/database')
const { createDeepSeekClient } = require('./src/deepseek')
const { createWhatsAppBot } = require('./src/whatsapp')
const { createAgent } = require('./src/agent')
const { createComputerTools } = require('./src/computer-tools')
const { createResponseTools } = require('./src/response-tools')
const { createPathPolicy } = require('./src/security')

async function main() {
  const config = loadConfig()
  const database = createDatabase(config.databaseUrl)

  await database.initialize()

  const ai = createDeepSeekClient({
    apiKey: config.deepseekApiKey,
    apiUrl: config.deepseekApiUrl,
    model: config.deepseekModel,
    systemPrompt: config.systemPrompt,
    timeoutMs: config.aiTimeoutMs
  })

  const pathPolicy = createPathPolicy(config.allowedPaths)
  const computerTools = createComputerTools({
    pathPolicy,
    allowedApps: config.allowedApps,
    maxFileBytes: config.maxFileBytes,
    maxMediaBytes: config.maxMediaBytes
  })
  const responseTools = createResponseTools()
  const agent = createAgent({
    ai,
    database,
    computerTools,
    responseTools,
    ownerIds: config.ownerIds,
    approvalTtlMinutes: config.approvalTtlMinutes
  })

  const bot = createWhatsAppBot({
    database,
    agent,
    historyLimit: config.historyLimit,
    sessionPath: config.sessionPath,
    logLevel: config.logLevel,
    connectTimeoutMs: config.whatsappConnectTimeoutMs,
    maxReconnectAttempts: config.whatsappMaxReconnectAttempts,
    whatsappVersion: config.whatsappVersion
  })

  await bot.start()

  let isShuttingDown = false
  const shutdown = async (signal) => {
    if (isShuttingDown) return
    isShuttingDown = true
    console.log(`Menerima ${signal}. Menghentikan bot...`)
    await bot.stop()
    await database.close()
    process.exit(0)
  }

  process.once('SIGINT', () => void shutdown('SIGINT'))
  process.once('SIGTERM', () => void shutdown('SIGTERM'))
}

main().catch((error) => {
  console.error('Bot gagal dijalankan:', error.message)
  process.exit(1)
})
