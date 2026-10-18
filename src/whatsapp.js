const fs = require('node:fs/promises')
const path = require('node:path')
const crypto = require('node:crypto')
const pino = require('pino')
const {
  DisconnectReason,
  downloadMediaMessage,
  fetchLatestBaileysVersion,
  makeWASocket,
  normalizeMessageContent,
  useMultiFileAuthState
} = require('@itsukichan/baileys')
const { fetchLatestWaWebVersion } = require('./whatsapp-version')

const ERROR_REPLY = 'Maaf, layanan sedang mengalami gangguan. Silakan coba lagi sebentar.'
const VERSION_FETCH_TIMEOUT_MS = 10_000
const APPEND_MAX_AGE_MS = 5 * 60_000
const PROCESSING_GRACE_MS = 30_000
const MAX_DELIVERY_RETRIES = 3
const UNAVAILABLE_NOTICE_DELAY_MS = 25_000
const UNAVAILABLE_REPLY = 'Maaf, pesan Anda belum dapat dibaca oleh perangkat bot. Silakan kirim ulang sebagai pesan teks.'
const logTagKey = crypto.randomBytes(16)
const SENSITIVE_LOG_PATHS = [
  'auth',
  'creds',
  'helloMsg',
  'node',
  'me',
  'histNotification',
  'mediaKey',
  'directPath',
  'myPN',
  'myLID',
  'wireJid',
  'lidMapping',
  'user',
  'key',
  '*.auth',
  '*.creds',
  '*.helloMsg',
  '*.node',
  '*.me',
  '*.histNotification',
  '*.mediaKey',
  '*.directPath',
  '*.myPN',
  '*.myLID',
  '*.wireJid',
  '*.lidMapping',
  '*.user',
  '*.key',
  '*.data'
]

function createSafeLogger(level) {
  return pino({
    level,
    redact: {
      paths: SENSITIVE_LOG_PATHS,
      censor: '[Disaring]'
    }
  })
}

function isInitQueryTimeout(context, message) {
  const statusCode = context?.err?.output?.statusCode || context?.err?.statusCode
  const errorMessage = context?.err?.message || ''
  return String(message || '').includes("unexpected error in 'init queries'") &&
    (statusCode === 408 || /timed? out/i.test(errorMessage))
}

function createBaileysLogger(logger, isConnectionOpen = () => false) {
  const base = typeof logger.child === 'function'
    ? logger.child({ component: 'baileys' }, { level: 'warn' })
    : logger
  const adapter = Object.create(base)

  adapter.error = (context, message, ...rest) => {
    if (isInitQueryTimeout(context, message)) {
      logger.warn({
        component: 'baileys',
        statusCode: 408,
        connectionOpen: Boolean(isConnectionOpen())
      }, 'Sinkronisasi awal WhatsApp melewati batas waktu; socket tetap dipantau dan bot tetap menerima pesan jika koneksi terbuka')
      return
    }
    return base.error(context, message, ...rest)
  }

  return adapter
}

function isWhatsAppVersion(value) {
  return Array.isArray(value) && value.length === 3 && value.every(Number.isInteger)
}

async function resolveWhatsAppVersion({ fetchWaWebVersion, fetchBaileysVersion, versionOverride }, logger) {
  if (isWhatsAppVersion(versionOverride)) {
    logger.info({ version: versionOverride.join('.'), source: 'config' }, 'Versi protokol WhatsApp dipilih')
    return versionOverride
  }

  try {
    const version = await fetchWaWebVersion({ timeoutMs: VERSION_FETCH_TIMEOUT_MS })
    if (isWhatsAppVersion(version)) {
      logger.info({ version: version.join('.'), source: 'whatsapp-web' }, 'Versi protokol WhatsApp dipilih')
      return version
    }
    throw new Error('Respons versi WhatsApp Web tidak valid')
  } catch (error) {
    logger.warn({ err: error }, 'Versi langsung dari WhatsApp Web tidak dapat dimuat; mencoba versi Baileys')
  }

  try {
    const result = await fetchBaileysVersion({ timeout: VERSION_FETCH_TIMEOUT_MS })
    if (result?.isLatest && isWhatsAppVersion(result.version)) {
      logger.info({ version: result.version.join('.'), source: 'baileys' }, 'Versi protokol WhatsApp dipilih')
      return result.version
    }

    const error = result?.error || new Error('Respons versi WhatsApp tidak valid')
    logger.warn({ err: error }, 'Versi protokol terbaru tidak dapat dimuat; menggunakan versi bawaan Baileys')
  } catch (error) {
    logger.warn({ err: error }, 'Versi protokol terbaru tidak dapat dimuat; menggunakan versi bawaan Baileys')
  }

  return undefined
}

function connectionFailureMessage(statusCode) {
  if (statusCode === 405) {
    return 'Registrasi WhatsApp ditolak (405). Periksa versi Baileys/protokol dan pastikan jaringan tidak memblokir WhatsApp Web.'
  }
  if (statusCode === 500) {
    return 'Handshake WhatsApp gagal (500). Periksa koneksi, proxy, firewall, dan validitas folder sesi.'
  }
  if (statusCode === DisconnectReason.timedOut) {
    return 'Koneksi WhatsApp kehabisan waktu. Periksa koneksi internet, proxy, atau firewall.'
  }
  return 'Koneksi WhatsApp terputus sebelum siap.'
}

function messageTag(chatId, messageId) {
  return crypto.createHmac('sha256', logTagKey).update(`${chatId}\0${messageId}`).digest('hex').slice(0, 12)
}

function outboundMessageId(chatId, messageId) {
  return `SUKI${crypto.createHash('sha256').update(`${chatId}\0${messageId}`).digest('hex').slice(0, 16).toUpperCase()}`
}

function isRecentAppend(message, startedAt, now = Date.now()) {
  const seconds = Number(message?.messageTimestamp)
  if (!Number.isFinite(seconds) || seconds <= 0) return false
  const timestampMs = seconds * 1_000
  const oldestAllowed = Math.max(startedAt - PROCESSING_GRACE_MS, now - APPEND_MAX_AGE_MS)
  return timestampMs >= oldestAllowed && timestampMs <= now + 60_000
}

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

function stubReason(message) {
  const reason = String(message?.messageStubParameters?.[0] || '')
  if (reason === 'Message absent from node') return 'message_absent'
  if (reason === 'Key used already or never filled') return 'missing_keys'
  if (/no session record/i.test(reason)) return 'missing_session'
  if (/mac|decrypt/i.test(reason)) return 'decryption_failed'
  if (/undefined|null|jid/i.test(reason)) return 'addressing_failed'
  return reason ? 'other' : 'none'
}

function senderIds(message) {
  return [
    message?.key?.remoteJid,
    message?.key?.remoteJidAlt,
    message?.key?.participant,
    message?.key?.participantAlt
  ].filter(Boolean)
}

async function resolveSenderIds(message, currentSocket, logger) {
  const ids = senderIds(message)
  const lid = message?.key?.remoteJid
  if (typeof lid !== 'string' || !lid.endsWith('@lid')) return ids

  try {
    const mappingStore = currentSocket?.signalRepository?.getLIDMappingStore?.()
    if (typeof mappingStore?.getPNForLID !== 'function') return [lid]
    const phoneJid = await mappingStore.getPNForLID(lid)
    if (typeof phoneJid === 'string' && phoneJid.endsWith('@s.whatsapp.net')) return [lid, phoneJid]
  } catch {
    logger?.warn('Pemetaan nomor pengirim tidak tersedia; akses komputer tetap terkunci')
  }
  return [lid]
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

function createWhatsAppBot({
  database,
  agent,
  historyLimit,
  sessionPath,
  logLevel = 'info',
  connectTimeoutMs = 30_000,
  maxReconnectAttempts = 5,
  whatsappVersion: versionOverride,
  maxMediaBytes = 10_485_760,
  cleanupGeneratedFile
}, runtime = {}) {
  const logger = runtime.logger || createSafeLogger(logLevel)
  const createSocket = runtime.makeWASocket || makeWASocket
  const downloadMedia = runtime.downloadMediaMessage || downloadMediaMessage
  const loadAuthState = runtime.useMultiFileAuthState || useMultiFileAuthState
  const fetchWaWebVersion = runtime.fetchLatestWaWebVersion || fetchLatestWaWebVersion
  const fetchBaileysVersion = runtime.fetchLatestBaileysVersion || fetchLatestBaileysVersion
  const scheduleTimer = runtime.setTimeout || setTimeout
  const cancelTimer = runtime.clearTimeout || clearTimeout
  const repeatTimer = runtime.setInterval || setInterval
  const cancelRepeatTimer = runtime.clearInterval || clearInterval
  const startedAt = Date.now()
  const enqueue = createChatQueue()
  const deliveryTimers = new Map()
  const deliveryAttempts = new Map()
  const unavailableTimers = new Map()
  const unavailableNotified = new Set()
  let socket
  let reconnectTimer
  let reconnectAttempts = 0
  let stopped = false
  let whatsappVersion
  let versionResolved = false
  let connectionOpen = false
  const baileysLogger = runtime.baileysLogger || createBaileysLogger(logger, () => connectionOpen)

  function deliveryKey(chatId, messageId) {
    return `${chatId}\0${messageId}`
  }

  function scheduleDeliveryRetry(chatId, messageId) {
    const key = deliveryKey(chatId, messageId)
    if (stopped || deliveryTimers.has(key)) return
    const attempt = deliveryAttempts.get(key) || 0
    if (attempt >= MAX_DELIVERY_RETRIES) {
      logger.error({ messageTag: messageTag(chatId, messageId) }, 'Batas kirim ulang tercapai; balasan tersimpan dan akan dicoba saat koneksi berikutnya')
      return
    }
    deliveryAttempts.set(key, attempt + 1)
    const timer = scheduleTimer(() => {
      deliveryTimers.delete(key)
      if (!connectionOpen || stopped) return
      void enqueue(chatId, async () => {
        const state = await database.getReplyState({ conversationId: chatId, messageId })
        if (state?.status === 'ready') await sendPreparedReply(chatId, messageId, state.response)
      }).catch((error) => logger.error({ err: error, messageTag: messageTag(chatId, messageId) }, 'Gagal mencoba ulang balasan'))
    }, Math.min(5_000 * 2 ** attempt, 20_000))
    deliveryTimers.set(key, timer)
  }

  function scheduleUnavailableNotice(chatId, messageId) {
    const key = deliveryKey(chatId, messageId)
    if (stopped || unavailableTimers.has(key) || unavailableNotified.has(key)) return
    const timer = scheduleTimer(() => {
      if (unavailableTimers.get(key) !== timer) return
      unavailableTimers.delete(key)
      if (!connectionOpen || stopped) return
      void enqueue(chatId, async () => {
        const state = await database.getReplyState({ conversationId: chatId, messageId })
        if (state) return
        await socket.sendMessage(chatId, { text: UNAVAILABLE_REPLY }, {
          messageId: outboundMessageId(chatId, `${messageId}:unavailable`)
        })
        unavailableNotified.add(key)
        logger.warn({ messageTag: messageTag(chatId, messageId) }, 'Pesan tetap tidak tersedia; pengirim diminta mengirim ulang')
      }).catch((error) => logger.error({ err: error, messageTag: messageTag(chatId, messageId) }, 'Gagal mengirim pemberitahuan pesan tidak tersedia'))
    }, UNAVAILABLE_NOTICE_DELAY_MS)
    unavailableTimers.set(key, timer)
  }

  function cancelUnavailableNotice(chatId, messageId) {
    const key = deliveryKey(chatId, messageId)
    const timer = unavailableTimers.get(key)
    if (timer) cancelTimer(timer)
    unavailableTimers.delete(key)
  }

  async function cleanupTemporaryCapture(response, tag) {
    if ((response?.cameraCapture !== true && response?.desktopCapture !== true && response?.generatedFile !== true) || typeof cleanupGeneratedFile !== 'function') return
    try {
      await cleanupGeneratedFile(response.filePath)
    } catch (error) {
      logger.warn({ err: error, messageTag: tag }, 'File sementara tangkapan gambar belum terhapus')
    }
  }

  async function startTyping(chatId, tag) {
    const activeSocket = socket
    if (!connectionOpen || typeof activeSocket?.sendPresenceUpdate !== 'function') return null

    let active = true
    let pending = Promise.resolve()
    function updatePresence(type) {
      pending = pending.then(async () => {
        if (stopped || !connectionOpen || socket !== activeSocket || (type === 'composing' && !active)) return
        try {
          await activeSocket.sendPresenceUpdate(type, chatId)
        } catch (error) {
          logger.debug({ err: error, messageTag: tag, presence: type }, 'Gagal memperbarui indikator mengetik')
        }
      })
      return pending
    }

    await updatePresence('composing')
    const timer = repeatTimer(() => { void updatePresence('composing') }, 8_000)
    timer.unref?.()

    return async () => {
      active = false
      cancelRepeatTimer(timer)
      await pending
      await updatePresence('paused')
    }
  }

  async function sendPreparedReply(chatId, messageId, response, quoted) {
    const tag = messageTag(chatId, messageId)
    const current = await database.getReplyState({ conversationId: chatId, messageId })
    if (current?.status !== 'ready') return
    let reply = current.response || response
    const temporaryCapture = (reply?.cameraCapture === true || reply?.desktopCapture === true || reply?.generatedFile === true) && reply.type === 'image' ? reply : null
    const options = { messageId: outboundMessageId(chatId, messageId) }
    if (quoted) options.quoted = quoted

    try {
      logger.info({ messageTag: tag, stage: 'send', responseType: reply.type }, 'Mengirim balasan WhatsApp')
      await socket.sendMessage(chatId, buildMessageContent(reply), options)
    } catch (error) {
      logger.warn({ err: error, messageTag: tag, stage: 'send' }, 'Pengiriman balasan gagal')
      if (reply.type !== 'text' && !temporaryCapture) {
        reply = { type: 'text', text: responseFallbackText(reply) }
        try {
          await database.replacePreparedReply({
            conversationId: chatId,
            messageId,
            response: reply,
            historyText: reply.text
          })
          await socket.sendMessage(chatId, buildMessageContent(reply), options)
        } catch (fallbackError) {
          logger.error({ err: fallbackError, messageTag: tag, stage: 'fallback' }, 'Balasan teks cadangan gagal dikirim')
          scheduleDeliveryRetry(chatId, messageId)
          return
        }
      } else {
        scheduleDeliveryRetry(chatId, messageId)
        return
      }
    }

    let recorded = false
    try {
      recorded = await database.markReplySent({ conversationId: chatId, messageId })
      const key = deliveryKey(chatId, messageId)
      if (deliveryTimers.has(key)) cancelTimer(deliveryTimers.get(key))
      deliveryTimers.delete(key)
      deliveryAttempts.delete(key)
      logger.info({ messageTag: tag, stage: 'sent', recorded }, 'Balasan diserahkan ke WhatsApp')
    } catch (error) {
      logger.error({ err: error, messageTag: tag, stage: 'record_sent' }, 'Balasan terkirim, tetapi status database belum tersimpan')
      scheduleDeliveryRetry(chatId, messageId)
    }
    if (recorded) await cleanupTemporaryCapture(temporaryCapture, tag)
  }

  async function recoverReplies() {
    const recovered = await database.recoverInterruptedMessages({ type: 'text', text: ERROR_REPLY })
    if (recovered > 0) logger.warn({ count: recovered }, 'Pesan yang terputus saat diproses akan diberi balasan kesalahan')
    const pending = await database.getPendingReplies()
    for (const item of pending) {
      void enqueue(item.conversationId, () => sendPreparedReply(item.conversationId, item.messageId, item.response))
        .catch((error) => logger.error({ err: error, messageTag: messageTag(item.conversationId, item.messageId) }, 'Pemulihan balasan gagal'))
    }
  }

  function isCancellationText(text) {
    return /^\s*(?:\/cancel|\/batal|batal(?:kan)?(?:\s+tugas)?|stop(?:\s+tugas)?)\s*[.!]?\s*$/i.test(String(text || ''))
  }

  async function handleCancellationMessage(message) {
    const chatId = message?.key?.remoteJid
    const messageId = message?.key?.id
    if (!chatId || !messageId || message.key.fromMe || typeof agent.cancel !== 'function') return
    const tag = messageTag(chatId, messageId)
    try {
      const text = extractText(message)
      const stored = await database.saveIncomingMessage({ conversationId: chatId, messageId, content: text })
      if (stored.status === 'ready') {
        await sendPreparedReply(chatId, messageId, stored.response, message)
        return
      }
      if (stored.status !== 'new') return
      const outcome = await agent.cancel({
        chatId,
        senderIds: await resolveSenderIds(message, socket, logger)
      })
      const response = outcome.response
      const prepared = await database.prepareReply({
        conversationId: chatId,
        messageId,
        response,
        historyText: agent.historyText(response)
      })
      if (prepared) await sendPreparedReply(chatId, messageId, response, message)
      logger.info({ messageTag: tag, cancelled: outcome.cancelled }, 'Perintah pembatalan tugas diproses realtime')
    } catch (error) {
      logger.error({ err: error, messageTag: tag }, 'Gagal memproses pembatalan tugas')
      try {
        await socket.sendMessage(chatId, { text: ERROR_REPLY }, {
          quoted: message,
          messageId: outboundMessageId(chatId, messageId)
        })
      } catch {
        // Kegagalan balasan pembatalan sudah dicatat di atas.
      }
    }
  }

  async function handleMessage(message, eventType) {
    const chatId = message?.key?.remoteJid
    const messageId = message?.key?.id
    const tag = chatId && messageId ? messageTag(chatId, messageId) : undefined
    if (!chatId || !messageId) {
      logger.debug({ reason: 'missing_id', eventType }, 'Pesan diabaikan')
      return
    }
    if (message.key.fromMe) {
      logger.debug({ messageTag: tag, reason: 'from_me', eventType }, 'Pesan diabaikan')
      return
    }
    if (!chatId.endsWith('@s.whatsapp.net') && !chatId.endsWith('@lid')) {
      logger.debug({ messageTag: tag, reason: 'non_private', eventType }, 'Pesan diabaikan')
      return
    }

    const imageMessage = normalizeMessageContent(message.message)?.imageMessage
    const text = extractText(message) || (imageMessage ? 'Jelaskan isi gambar ini.' : null)
    if (!text) {
      logger.info({
        messageTag: tag,
        reason: 'unsupported_content',
        eventType,
        rawTypes: Object.keys(message.message || {}).slice(0, 6),
        contentTypes: Object.keys(normalizeMessageContent(message.message) || {}).slice(0, 6),
        stubType: message.messageStubType ?? null,
        stubReason: stubReason(message)
      }, 'Pesan pribadi tanpa teks diabaikan')
      if (message.messageStubType === 2 && stubReason(message) === 'message_absent') {
        scheduleUnavailableNotice(chatId, messageId)
      }
      return
    }

    cancelUnavailableNotice(chatId, messageId)

    logger.info({ messageTag: tag, eventType, stage: 'received' }, 'Pesan pribadi diterima')

    let unpreparedCapture
    let stopTyping
    try {
      const stored = await database.saveIncomingMessage({
        conversationId: chatId,
        messageId,
        content: text
      })
      if (stored.status === 'ready') {
        logger.info({ messageTag: tag, stage: 'retry' }, 'Mengirim ulang balasan yang sudah disiapkan')
        await sendPreparedReply(chatId, messageId, stored.response, message)
        return
      }
      if (stored.status !== 'new') {
        logger.debug({ messageTag: tag, reason: stored.status }, 'Pesan duplikat diabaikan')
        return
      }

      stopTyping = await startTyping(chatId, tag)
      logger.info({ messageTag: tag, stage: 'history' }, 'Membaca riwayat percakapan')
      const history = await database.getConversationHistory(chatId, historyLimit)
      let response
      try {
        const agentStartedAt = Date.now()
        logger.info({ messageTag: tag, stage: 'agent' }, 'Memproses pesan dengan agent')
        const progressStages = new Set()
        let lastSuccessProgressAt = 0
        const sendProgress = async ({ stage, text: progressText }) => {
          const safeStage = String(stage || '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 40)
          const safeText = String(progressText || '').trim().slice(0, 500)
          if (!safeStage || !safeText || progressStages.has(safeStage)) return
          const isStepSuccess = safeStage.startsWith('step_success_')
          const isStepFailure = safeStage.startsWith('step_failed_')
          const currentTime = Date.now()
          if (isStepSuccess && currentTime - lastSuccessProgressAt < 15_000) return
          if (!isStepFailure && progressStages.size >= 6) return
          if (isStepSuccess) lastSuccessProgressAt = currentTime
          progressStages.add(safeStage)
          try {
            await socket.sendMessage(chatId, { text: safeText }, {
              quoted: message,
              messageId: outboundMessageId(chatId, `${messageId}:progress:${safeStage}`)
            })
            logger.info({ messageTag: tag, stage: 'progress', progressStage: safeStage }, 'Pembaruan progres dikirim')
          } catch (error) {
            logger.debug({ err: error, messageTag: tag, stage: 'progress', progressStage: safeStage }, 'Pembaruan progres gagal dikirim')
          }
        }
        let imageBuffer
        if (imageMessage) {
          const declaredBytes = Number(imageMessage.fileLength || 0)
          if (declaredBytes > maxMediaBytes) throw new Error(`Gambar melebihi batas ${maxMediaBytes} byte`)
          imageBuffer = await downloadMedia(message, 'buffer', {}, {
            logger: baileysLogger,
            reuploadRequest: socket.updateMediaMessage?.bind(socket)
          })
          if (!Buffer.isBuffer(imageBuffer) || imageBuffer.length > maxMediaBytes) throw new Error('Gambar tidak tersedia atau terlalu besar')
        }
        response = await agent.handle({
          chatId,
          senderIds: await resolveSenderIds(message, socket, logger),
          text,
          history,
          imageBuffer,
          onProgress: sendProgress
        })
        logger.info({ messageTag: tag, stage: 'agent_completed', durationMs: Date.now() - agentStartedAt }, 'Agent selesai memproses pesan')
      } catch (error) {
        logger.error({ err: error, messageTag: tag, stage: 'agent' }, 'Agent gagal memproses pesan')
        response = { type: 'text', text: imageMessage
          ? (/melebihi batas|terlalu besar/i.test(error.message) ? 'Gambar terlalu besar untuk diproses. Kirim gambar yang lebih kecil.' : 'Gambar WhatsApp belum dapat diunduh atau dibaca. Coba kirim ulang.')
          : ERROR_REPLY }
      }
      if (response?.cameraCapture === true || response?.desktopCapture === true || response?.generatedFile === true) unpreparedCapture = response
      const prepared = await database.prepareReply({
        conversationId: chatId,
        messageId,
        response,
        historyText: agent.historyText(response)
      })
      if (!prepared) {
        await cleanupTemporaryCapture(unpreparedCapture, tag)
        return
      }
      unpreparedCapture = undefined
      logger.info({ messageTag: tag, stage: 'prepared', responseType: response.type }, 'Balasan tersimpan untuk dikirim')
      await sendPreparedReply(chatId, messageId, response, message)
    } catch (error) {
      logger.error({ err: error, messageTag: tag, stage: 'processing' }, 'Gagal memproses pesan')
      await cleanupTemporaryCapture(unpreparedCapture, tag)
      try {
        await socket.sendMessage(chatId, { text: ERROR_REPLY }, {
          quoted: message,
          messageId: outboundMessageId(chatId, messageId)
        })
      } catch (sendError) {
        logger.error({ err: sendError, messageTag: tag, stage: 'error_reply' }, 'Gagal mengirim pemberitahuan kesalahan')
      }
    } finally {
      await stopTyping?.()
    }
  }

  function scheduleReconnect() {
    if (stopped || reconnectTimer) return
    if (reconnectAttempts >= maxReconnectAttempts) {
      logger.error(
        { attempts: reconnectAttempts },
        'Batas koneksi ulang WhatsApp tercapai. Periksa jaringan dan konfigurasi, lalu jalankan ulang bot.'
      )
      return
    }
    const delayMs = Math.min(1_000 * 2 ** reconnectAttempts, 30_000)
    reconnectAttempts += 1
    logger.info({ attempt: reconnectAttempts, maxAttempts: maxReconnectAttempts, delayMs }, 'Menjadwalkan koneksi ulang WhatsApp')
    reconnectTimer = scheduleTimer(() => {
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

    if (!versionResolved) {
      whatsappVersion = await resolveWhatsAppVersion({ fetchWaWebVersion, fetchBaileysVersion, versionOverride }, logger)
      versionResolved = true
    }

    const { state, saveCreds } = await loadAuthState(sessionPath)
    const socketOptions = {
      auth: state,
      logger: baileysLogger,
      printQRInTerminal: true,
      connectTimeoutMs,
      fireInitQueries: false,
      markOnlineOnConnect: false,
      syncFullHistory: false
    }
    if (whatsappVersion) socketOptions.version = whatsappVersion

    logger.info(
      { hasSession: Boolean(state.creds?.me), version: whatsappVersion?.join('.') || 'bawaan-paket' },
      'Memulai koneksi WhatsApp'
    )
    socket = createSocket(socketOptions)

    if (logLevel === 'debug' && typeof socket.ws?.on === 'function') {
      socket.ws.on('CB:message', (node) => {
        const children = Array.isArray(node?.content) ? node.content : []
        logger.debug({
          attributeNames: Object.keys(node?.attrs || {}).slice(0, 12),
          childTypes: children.map((child) => child?.tag).slice(0, 8),
          encryptedTypes: children.filter((child) => child?.tag === 'enc').map((child) => child?.attrs?.type).slice(0, 4),
          hasRecipient: Boolean(node?.attrs?.recipient),
          isOffline: Boolean(node?.attrs?.offline)
        }, 'Struktur paket pesan WhatsApp diterima')
      })
    }

    socket.ev.on('creds.update', () => {
      void Promise.resolve().then(saveCreds).catch((error) => logger.error({ err: error }, 'Gagal menyimpan sesi WhatsApp'))
    })

    socket.ev.on('messages.upsert', ({ messages, type }) => {
      logger.info({ eventType: type, count: messages?.length || 0 }, 'Event pesan WhatsApp diterima')
      if (type !== 'notify' && type !== 'append') {
        logger.debug({ eventType: type, reason: 'unsupported_event' }, 'Event pesan diabaikan')
        return
      }
      for (const message of messages || []) {
        const chatId = message?.key?.remoteJid
        if (chatId) {
          if (type === 'append' && !isRecentAppend(message, startedAt)) {
            logger.debug({ messageTag: message?.key?.id && messageTag(chatId, message.key.id), reason: 'old_append' }, 'Pesan riwayat diabaikan')
            continue
          }
          if (isCancellationText(extractText(message)) && typeof agent.cancel === 'function') {
            void handleCancellationMessage(message)
            continue
          }
          void enqueue(chatId, () => handleMessage(message, type)).catch((error) => {
            logger.error({ err: error, messageTag: message?.key?.id && messageTag(chatId, message.key.id) }, 'Antrean pesan gagal')
          })
        }
      }
    })

    socket.ev.on('connection.update', ({ connection, lastDisconnect, qr, receivedPendingNotifications }) => {
      if (receivedPendingNotifications) {
        logger.info('Notifikasi tertunda WhatsApp selesai diterima')
      }
      if (qr) {
        logger.info('QR login WhatsApp siap. Pindai melalui menu Perangkat tertaut di aplikasi WhatsApp.')
      }

      if (connection === 'open') {
        connectionOpen = true
        reconnectAttempts = 0
        logger.info('WhatsApp terhubung')
        void recoverReplies().catch((error) => logger.error({ err: error }, 'Gagal memulihkan balasan tertunda'))
        return
      }

      if (connection !== 'close' || stopped) return

      connectionOpen = false
      const statusCode = disconnectStatusCode(lastDisconnect?.error)
      if (statusCode === DisconnectReason.loggedOut) {
        void resetLoggedOutSession()
          .then(() => connect())
          .catch((error) => logger.error({ err: error }, 'Gagal menyiapkan login ulang'))
        return
      }

      if (statusCode === DisconnectReason.restartRequired) {
        logger.info('WhatsApp meminta restart socket setelah pairing; menyambung kembali dengan sesi yang tersimpan')
        scheduleReconnect()
        return
      }

      logger.warn({ statusCode }, 'Koneksi WhatsApp terputus')
      logger.warn(connectionFailureMessage(statusCode))
      if (statusCode === 405 || statusCode === DisconnectReason.forbidden) {
        logger.error('Koneksi tidak akan diulang otomatis untuk kegagalan ini. Perbaiki versi atau akses jaringan, lalu jalankan ulang bot.')
        return
      }
      scheduleReconnect()
    })
  }

  return {
    async start() {
      const recovered = await database.recoverInterruptedMessages({ type: 'text', text: ERROR_REPLY }, true)
      if (recovered > 0) logger.warn({ count: recovered }, 'Proses pesan sebelumnya terputus; pemberitahuan akan dikirim setelah WhatsApp terhubung')
      await connect()
    },
    async stop() {
      stopped = true
      connectionOpen = false
      if (reconnectTimer) cancelTimer(reconnectTimer)
      for (const timer of deliveryTimers.values()) cancelTimer(timer)
      deliveryTimers.clear()
      for (const timer of unavailableTimers.values()) cancelTimer(timer)
      unavailableTimers.clear()
      unavailableNotified.clear()
      if (socket?.ws?.isOpen) socket.ws.close()
    }
  }
}

module.exports = {
  ERROR_REPLY,
  buildMessageContent,
  connectionFailureMessage,
  createChatQueue,
  createBaileysLogger,
  createSafeLogger,
  createWhatsAppBot,
  disconnectStatusCode,
  extractText,
  isWhatsAppVersion,
  isRecentAppend,
  outboundMessageId,
  resolveWhatsAppVersion,
  responseFallbackText,
  resolveSenderIds,
  senderIds
}
