const fs = require('node:fs/promises')
const path = require('node:path')
const pino = require('pino')
const {
  DisconnectReason,
  makeWASocket,
  normalizeMessageContent,
  useMultiFileAuthState
} = require('@itsukichan/baileys')

const ERROR_REPLY = 'Maaf, layanan sedang mengalami gangguan. Silakan coba lagi sebentar.'

function extractText(message) {
  const content = normalizeMessageContent(message?.message)
  if (!content) return null

  let interactiveId
  const paramsJson = content.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson
  if (paramsJson) {
    try {
      const params = JSON.parse(paramsJson)
      interactiveId = params.id || params.row_id || params.selected_id
    } catch {
      interactiveId = null
    }
  }

  const text =
    content.conversation ||
    content.extendedTextMessage?.text ||
    content.imageMessage?.caption ||
    content.videoMessage?.caption ||
    content.documentMessage?.caption ||
    content.buttonsResponseMessage?.selectedButtonId ||
    content.templateButtonReplyMessage?.selectedId ||
    content.listResponseMessage?.singleSelectReply?.selectedRowId ||
    interactiveId
  return typeof text === 'string' && text.trim() ? text.trim() : null
}

function senderIds(message) {
  return [
    message?.key?.remoteJid,
    message?.key?.remoteJidAlt,
    message?.key?.participant,
    message?.key?.participantAlt
  ].filter(Boolean)
}

function responseFallbackText(response) {
  if (response.fallbackText) return `${response.text}\n\n${response.fallbackText}`
  if (response.type === 'buttons') return `${response.text}\n\n${response.options.map((item) => `${item.label}: ${item.id}`).join('\n')}`
  if (response.type === 'list') return `${response.text}\n\n${response.options.map((item) => `- ${item.title}: ${item.id}`).join('\n')}`
  if (response.type === 'poll') return `${response.question}\n\n${response.options.map((item) => `- ${item}`).join('\n')}`
  return response.text || response.caption || 'Respons tidak dapat ditampilkan.'
}

function buildMessageContent(response) {
  switch (response.type) {
    case 'text':
      return { text: response.text }
    case 'buttons':
      return {
        text: response.fallbackText ? `${response.text}\n\n${response.fallbackText}` : response.text,
        footer: response.footer,
        buttons: response.options.map((item) => ({
          buttonId: item.id,
          buttonText: { displayText: item.label }
        }))
      }
    case 'list':
      return {
        title: response.title,
        text: response.text,
        buttonText: response.buttonText,
        sections: [{
          title: response.title,
          rows: response.options.map((item) => ({
            rowId: item.id,
            title: item.title,
            description: item.description
          }))
        }]
      }
    case 'poll':
      return {
        poll: {
          name: response.question,
          values: response.options,
          selectableCount: response.selectableCount,
          toAnnouncementGroup: false
        }
      }
    case 'image':
    case 'video':
      return { [response.type]: { url: response.filePath }, caption: response.caption }
    case 'audio':
      return { audio: { url: response.filePath }, mimetype: 'audio/mp4' }
    case 'document':
      return {
        document: { url: response.filePath },
        fileName: response.fileName,
        caption: response.caption,
        mimetype: 'application/octet-stream'
      }
    default:
      throw new Error('Jenis respons WhatsApp tidak didukung')
  }
}

function disconnectStatusCode(error) {
  return error?.output?.statusCode || error?.statusCode
}

function createChatQueue() {
  const queues = new Map()

  return function enqueue(chatId, task) {
    const previous = queues.get(chatId) || Promise.resolve()
    const current = previous.catch(() => undefined).then(task)
    queues.set(chatId, current)
    const cleanup = () => {
      if (queues.get(chatId) === current) queues.delete(chatId)
    }
    current.then(cleanup, cleanup)
    return current
  }
}

function createWhatsAppBot({ database, agent, historyLimit, sessionPath, logLevel = 'info' }) {
  const logger = pino({ level: logLevel })
  const enqueue = createChatQueue()
  let socket
  let reconnectTimer
  let reconnectAttempts = 0
  let stopped = false

  async function handleMessage(message) {
    const chatId = message?.key?.remoteJid
    const messageId = message?.key?.id

    if (!chatId || !messageId || message.key.fromMe) return
    if (chatId.endsWith('@g.us') || chatId === 'status@broadcast') return

    const text = extractText(message)
    if (!text) return

    try {
      const isNew = await database.saveIncomingMessage({
        conversationId: chatId,
        messageId,
        content: text
      })

      if (!isNew) {
        logger.debug({ messageId }, 'Pesan duplikat diabaikan')
        return
      }

      const history = await database.getConversationHistory(chatId, historyLimit)
      const response = await agent.handle({
        chatId,
        senderIds: senderIds(message),
        text,
        history
      })
      await database.saveAssistantMessage({
        conversationId: chatId,
        content: agent.historyText(response)
      })

      try {
        await socket.sendMessage(chatId, buildMessageContent(response), { quoted: message })
      } catch (formatError) {
        logger.warn({ err: formatError, chatId, responseType: response.type }, 'Format respons gagal, menggunakan teks')
        await socket.sendMessage(chatId, { text: responseFallbackText(response) }, { quoted: message })
      }
    } catch (error) {
      logger.error({ err: error, messageId, chatId }, 'Gagal memproses pesan')
      try {
        await socket.sendMessage(chatId, { text: ERROR_REPLY }, { quoted: message })
      } catch (sendError) {
        logger.error({ err: sendError, chatId }, 'Gagal mengirim pemberitahuan kesalahan')
      }
    }
  }

  function scheduleReconnect() {
    if (stopped || reconnectTimer) return
    const delayMs = Math.min(1_000 * 2 ** reconnectAttempts, 30_000)
    reconnectAttempts += 1
    logger.info({ delayMs }, 'Menjadwalkan koneksi ulang WhatsApp')
    reconnectTimer = setTimeout(() => {
      reconnectTimer = undefined
      void connect().catch((error) => {
        logger.error({ err: error }, 'Koneksi ulang WhatsApp gagal')
        scheduleReconnect()
      })
    }, delayMs)
  }

  async function resetLoggedOutSession() {
    const resolved = path.resolve(sessionPath)
    const root = path.parse(resolved).root
    if (resolved === root || resolved === path.resolve('.')) {
      throw new Error('SESSION_PATH tidak aman untuk dihapus')
    }
    await fs.rm(resolved, { recursive: true, force: true })
    logger.warn('Sesi WhatsApp sudah logout. Scan QR baru untuk login kembali.')
  }

  async function connect() {
    if (stopped) return

    const { state, saveCreds } = await useMultiFileAuthState(sessionPath)
    socket = makeWASocket({
      auth: state,
      logger,
      printQRInTerminal: true,
      markOnlineOnConnect: false,
      syncFullHistory: false
    })

    socket.ev.on('creds.update', saveCreds)

    socket.ev.on('messages.upsert', ({ messages, type }) => {
      if (type !== 'notify') return
      for (const message of messages) {
        const chatId = message?.key?.remoteJid
        if (chatId) {
          void enqueue(chatId, () => handleMessage(message)).catch((error) => {
            logger.error({ err: error, chatId }, 'Antrean pesan gagal')
          })
        }
      }
    })

    socket.ev.on('connection.update', ({ connection, lastDisconnect }) => {
      if (connection === 'open') {
        reconnectAttempts = 0
        logger.info('WhatsApp terhubung')
        return
      }

      if (connection !== 'close' || stopped) return

      const statusCode = disconnectStatusCode(lastDisconnect?.error)
      if (statusCode === DisconnectReason.loggedOut) {
        void resetLoggedOutSession()
          .then(() => connect())
          .catch((error) => logger.error({ err: error }, 'Gagal menyiapkan login ulang'))
        return
      }

      logger.warn({ statusCode }, 'Koneksi WhatsApp terputus')
      scheduleReconnect()
    })
  }

  return {
    start: connect,
    async stop() {
      stopped = true
      if (reconnectTimer) clearTimeout(reconnectTimer)
      if (socket?.ws?.isOpen) socket.ws.close()
    }
  }
}

module.exports = {
  ERROR_REPLY,
  buildMessageContent,
  createChatQueue,
  createWhatsAppBot,
  disconnectStatusCode,
  extractText,
  responseFallbackText,
  senderIds
}
