const { loadConfig } = require('./src/config')
const { createDatabase } = require('./src/database')
const { createAIClient } = require('./src/ai-client')
const { createWhatsAppBot } = require('./src/whatsapp')
const { createAgent } = require('./src/agent')
const { createComputerTools } = require('./src/computer-tools')
const { createCamera } = require('./src/camera')
const { createResponseTools } = require('./src/response-tools')
const { createPathPolicy } = require('./src/security')
const { createImageReader } = require('./src/image-reader')
const { createBrowserTools } = require('./src/browser-tools')
const { createMcpTools } = require('./src/mcp-tools')

async function main() {
  const config = loadConfig()
  const database = createDatabase(config.databaseUrl)

  await database.initialize()

  const ai = createAIClient({
    apiKey: config.aiApiKey,
    baseUrl: config.aiBaseUrl,
    model: config.aiModel,
    systemPrompt: config.systemPrompt,
    timeoutMs: config.aiTimeoutMs
  })

  const pathPolicy = createPathPolicy(config.allowedPaths)
  const imageReader = createImageReader({ ai, maxMediaBytes: config.maxMediaBytes, ocrLanguages: config.ocrLanguages })
  const browserTools = createBrowserTools({
    channel: config.browserChannel,
    headless: config.browserHeadless,
    userDataDir: config.browserUserDataDir,
    maxMediaBytes: config.maxMediaBytes
  })
  const mcpTools = createMcpTools({ servers: config.mcpServers, imageReader })
  const camera = createCamera({
    deviceName: config.cameraDeviceName,
    ffmpegPath: config.cameraFfmpegPath,
    maxMediaBytes: config.maxMediaBytes
  })
  const computerTools = createComputerTools({
    pathPolicy,
    allowedApps: config.allowedApps,
    allowedCmdCommands: config.allowedCmdCommands,
    camera,
    imageReader,
    maxFileBytes: config.maxFileBytes,
    maxMediaBytes: config.maxMediaBytes
  })
  const responseTools = createResponseTools()
  const agent = createAgent({
    ai,
    database,
    computerTools,
    imageReader,
    browserTools,
    mcpTools,
    responseTools,
    ownerIds: config.ownerIds,
    approvalTtlMinutes: config.approvalTtlMinutes,
    godmodeTtlMinutes: config.godmodeTtlMinutes
  })

  const cleanupGeneratedFile = async (filePath) => {
    try {
      await browserTools.cleanupGeneratedFile(filePath)
    } catch {
      await computerTools.cleanupGeneratedFile(filePath)
    }
  }

  const bot = createWhatsAppBot({
    database,
    agent,
    historyLimit: config.historyLimit,
    sessionPath: config.sessionPath,
    logLevel: config.logLevel,
    connectTimeoutMs: config.whatsappConnectTimeoutMs,
    maxReconnectAttempts: config.whatsappMaxReconnectAttempts,
    whatsappVersion: config.whatsappVersion,
    maxMediaBytes: config.maxMediaBytes,
    cleanupGeneratedFile
  })

  await bot.start()
  void imageReader.warmup().catch(() => {})

  let isShuttingDown = false
  const shutdown = async (signal) => {
    if (isShuttingDown) return
    isShuttingDown = true
    console.log(`Menerima ${signal}. Menghentikan bot...`)
    await bot.stop()
    await Promise.allSettled([imageReader.close(), browserTools.close(), mcpTools.close()])
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
