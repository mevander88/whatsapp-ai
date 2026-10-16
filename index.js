const { loadConfig } = require('./src/config')
const { createDatabase } = require('./src/database')
const { createDeepSeekClient } = require('./src/deepseek')
const { createWhatsAppBot } = require('./src/whatsapp')

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

  const bot = createWhatsAppBot({
    database,
    ai,
    historyLimit: config.historyLimit,
    sessionPath: config.sessionPath,
    logLevel: config.logLevel
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
