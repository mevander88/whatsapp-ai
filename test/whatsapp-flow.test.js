const test = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const { createWhatsAppBot, ERROR_REPLY, isRecentAppend } = require('../src/whatsapp')

function createFixture({ sendFailsOnce = false, agentFails = false, historyFails = false, prepareFails = false, agentResponse, cleanupGeneratedFile } = {}) {
  const rows = new Map()
  const calls = { agent: 0, send: [], assistant: [], logs: [], timers: [] }
  const ev = new EventEmitter()
  const logger = Object.fromEntries(['debug', 'info', 'warn', 'error'].map((level) => [
    level,
    (...args) => calls.logs.push([level, ...args])
  ]))
  const database = {
    async saveIncomingMessage({ conversationId, messageId }) {
      const key = `${conversationId}:${messageId}`
      if (!rows.has(key)) {
        rows.set(key, { status: 'processing' })
        return { status: 'new' }
      }
      return { ...rows.get(key) }
    },
    async getConversationHistory() {
      if (historyFails) throw new Error('Database tidak tersedia')
      return [{ role: 'user', content: 'Halo' }]
    },
    async prepareReply({ conversationId, messageId, response }) {
      if (prepareFails) throw new Error('Database gagal menyimpan balasan')
      rows.set(`${conversationId}:${messageId}`, { status: 'ready', response })
      return true
    },
    async replacePreparedReply({ conversationId, messageId, response }) {
      rows.set(`${conversationId}:${messageId}`, { status: 'ready', response })
    },
    async getReplyState({ conversationId, messageId }) {
      return rows.get(`${conversationId}:${messageId}`) || null
    },
    async markReplySent({ conversationId, messageId }) {
      const row = rows.get(`${conversationId}:${messageId}`)
      if (row.status !== 'ready') return false
      row.status = 'sent'
      calls.assistant.push(row.response)
      return true
    },
    async recoverInterruptedMessages(errorResponse) {
      let recovered = 0
      for (const row of rows.values()) {
        if (row.status === 'processing') {
          row.status = 'ready'
          row.response = errorResponse
          recovered += 1
        }
      }
      return recovered
    },
    async getPendingReplies() {
      return [...rows.entries()]
        .filter(([, row]) => row.status === 'ready')
        .map(([key, row]) => {
          const divider = key.lastIndexOf(':')
          return { conversationId: key.slice(0, divider), messageId: key.slice(divider + 1), response: row.response }
        })
    }
  }
  const agent = {
    async handle() {
      calls.agent += 1
      if (agentFails) throw new Error('AI gagal')
      return agentResponse || { type: 'text', text: 'Hai!' }
    },
    historyText(response) { return response.text }
  }
  const bot = createWhatsAppBot({
    database, agent, historyLimit: 10, sessionPath: 'auth-test', cleanupGeneratedFile
  }, {
    logger,
    fetchLatestWaWebVersion: async () => [2, 3000, 123],
    useMultiFileAuthState: async () => ({ state: { creds: {}, keys: {} }, saveCreds: async () => {} }),
    makeWASocket: () => ({
      ev,
      ws: { isOpen: false },
      async sendMessage(jid, content, options) {
        calls.send.push({ jid, content, options })
        if (sendFailsOnce && calls.send.length === 1) throw new Error('Jaringan putus')
        return { key: { id: options.messageId } }
      }
    }),
    setTimeout: (callback) => { calls.timers.push(callback); return callback },
    clearTimeout: () => {}
  })
  const message = (id = 'pesan-1', overrides = {}) => ({
    key: { id, remoteJid: '123@s.whatsapp.net', fromMe: false },
    messageTimestamp: Math.floor(Date.now() / 1_000),
    message: { conversation: 'Halo' },
    ...overrides
  })
  return { bot, ev, calls, rows, message }
}

async function settle() {
  for (let i = 0; i < 4; i += 1) await new Promise((resolve) => setImmediate(resolve))
}

test('pesan notify dibalas sekali dan baru dicatat setelah pengiriman', async () => {
  const { bot, ev, calls, rows, message } = createFixture()
  await bot.start()
  ev.emit('connection.update', { connection: 'open' })
  ev.emit('messages.upsert', { type: 'notify', messages: [message()] })
  await settle()
  ev.emit('messages.upsert', { type: 'notify', messages: [message()] })
  await settle()

  assert.equal(calls.agent, 1)
  assert.equal(calls.send.length, 1)
  assert.equal(calls.send[0].content.text, 'Hai!')
  assert.equal(calls.assistant.length, 1)
  assert.equal(rows.get('123@s.whatsapp.net:pesan-1').status, 'sent')
  await bot.stop()
})

test('balasan gagal dikirim tetap siap dan event ulang tidak menjalankan agent lagi', async () => {
  const { bot, ev, calls, rows, message } = createFixture({ sendFailsOnce: true })
  await bot.start()
  ev.emit('connection.update', { connection: 'open' })
  ev.emit('messages.upsert', { type: 'notify', messages: [message()] })
  await settle()
  assert.equal(rows.get('123@s.whatsapp.net:pesan-1').status, 'ready')
  assert.equal(calls.assistant.length, 0)

  ev.emit('messages.upsert', { type: 'notify', messages: [message()] })
  await settle()
  assert.equal(calls.agent, 1)
  assert.equal(calls.send.length, 2)
  assert.equal(calls.send[0].options.messageId, calls.send[1].options.messageId)
  assert.equal(calls.assistant.length, 1)
  await bot.stop()
})

test('append baru diproses, riwayat lama dan pesan sendiri diabaikan', async () => {
  const { bot, ev, calls, message } = createFixture()
  await bot.start()
  ev.emit('connection.update', { connection: 'open' })
  ev.emit('messages.upsert', { type: 'append', messages: [message('lama', { messageTimestamp: 1 })] })
  ev.emit('messages.upsert', { type: 'notify', messages: [message('sendiri', { key: { id: 'sendiri', remoteJid: '123@s.whatsapp.net', fromMe: true } })] })
  ev.emit('messages.upsert', { type: 'append', messages: [message('baru')] })
  await settle()

  assert.equal(calls.agent, 1)
  assert.equal(calls.send.length, 1)
  assert.equal(isRecentAppend({ messageTimestamp: 1 }, Date.now()), false)
  await bot.stop()
})

test('kegagalan agent mengirim pemberitahuan tanpa isi rahasia', async () => {
  const { bot, ev, calls, message } = createFixture({ agentFails: true })
  await bot.start()
  ev.emit('connection.update', { connection: 'open' })
  ev.emit('messages.upsert', { type: 'notify', messages: [message()] })
  await settle()

  assert.equal(calls.send[0].content.text, ERROR_REPLY)
  assert.equal(calls.assistant.length, 1)
  assert.ok(calls.logs.some((entry) => entry.includes('Agent gagal memproses pesan')))
  assert.equal(JSON.stringify(calls.logs).includes('123@s.whatsapp.net'), false)
  await bot.stop()
})

test('proses yang terputus pada run sebelumnya dipulihkan tanpa menjalankan agent ulang', async () => {
  const { bot, ev, calls, rows } = createFixture()
  rows.set('123@s.whatsapp.net:pesan-lama', { status: 'processing' })
  await bot.start()
  ev.emit('connection.update', { connection: 'open' })
  await settle()

  assert.equal(calls.agent, 0)
  assert.equal(calls.send.length, 1)
  assert.equal(calls.send[0].content.text, ERROR_REPLY)
  assert.equal(rows.get('123@s.whatsapp.net:pesan-lama').status, 'sent')
  await bot.stop()
})

test('status 515 setelah pairing dijelaskan dan dijadwalkan untuk koneksi ulang', async () => {
  const { bot, ev, calls } = createFixture()
  await bot.start()
  ev.emit('connection.update', {
    connection: 'close',
    lastDisconnect: { error: { output: { statusCode: 515 } } }
  })

  assert.ok(calls.logs.some((entry) => entry.includes('WhatsApp meminta restart socket setelah pairing; menyambung kembali dengan sesi yang tersimpan')))
  assert.equal(calls.timers.length, 1)
  await bot.stop()
})

test('gagal membaca database menghasilkan pemberitahuan dan tidak menjalankan agent', async () => {
  const { bot, ev, calls, message } = createFixture({ historyFails: true })
  await bot.start()
  ev.emit('connection.update', { connection: 'open' })
  ev.emit('messages.upsert', { type: 'notify', messages: [message()] })
  await settle()

  assert.equal(calls.agent, 0)
  assert.equal(calls.send.length, 1)
  assert.equal(calls.send[0].content.text, ERROR_REPLY)
  assert.ok(calls.logs.some((entry) => entry.includes('Gagal memproses pesan')))
  await bot.stop()
})

test('placeholder tanpa isi meminta kirim ulang setelah menunggu dan tidak berulang untuk ID yang sama', async () => {
  const { bot, ev, calls, message } = createFixture()
  await bot.start()
  ev.emit('connection.update', { connection: 'open' })
  const unavailable = message('tidak-tersedia', {
    message: undefined,
    messageStubType: 2,
    messageStubParameters: ['Message absent from node']
  })
  ev.emit('messages.upsert', { type: 'notify', messages: [unavailable] })
  await settle()
  assert.equal(calls.send.length, 0)
  assert.equal(calls.timers.length, 1)

  calls.timers[0]()
  await settle()
  assert.match(calls.send[0].content.text, /kirim ulang/)
  assert.equal(calls.agent, 0)

  ev.emit('messages.upsert', { type: 'notify', messages: [unavailable] })
  await settle()
  assert.equal(calls.timers.length, 1)
  await bot.stop()
})

test('pesan teks yang datang setelah placeholder membatalkan pemberitahuan', async () => {
  const { bot, ev, calls, message } = createFixture()
  await bot.start()
  ev.emit('connection.update', { connection: 'open' })
  ev.emit('messages.upsert', { type: 'notify', messages: [message('dikirim-ulang', {
    message: undefined,
    messageStubType: 2,
    messageStubParameters: ['Message absent from node']
  })] })
  await settle()
  const noticeTimer = calls.timers[0]
  ev.emit('messages.upsert', { type: 'notify', messages: [message('dikirim-ulang')] })
  await settle()
  noticeTimer()
  await settle()

  assert.equal(calls.send.length, 1)
  assert.equal(calls.send[0].content.text, 'Hai!')
  await bot.stop()
})

test('foto kamera dikirim sebagai gambar, dicoba ulang, lalu file sementara dibersihkan', async () => {
  const cleaned = []
  const photo = { type: 'image', filePath: 'foto-kamera.jpg', caption: 'Foto kamera', cameraCapture: true }
  const { bot, ev, calls, rows, message } = createFixture({
    sendFailsOnce: true,
    agentResponse: photo,
    cleanupGeneratedFile: async (filePath) => { cleaned.push(filePath) }
  })
  await bot.start()
  ev.emit('connection.update', { connection: 'open' })
  ev.emit('messages.upsert', { type: 'notify', messages: [message()] })
  await settle()

  assert.equal(calls.agent, 1)
  assert.deepEqual(calls.send[0].content.image, { url: 'foto-kamera.jpg' })
  assert.equal(rows.get('123@s.whatsapp.net:pesan-1').status, 'ready')
  assert.deepEqual(cleaned, [])

  ev.emit('messages.upsert', { type: 'notify', messages: [message()] })
  await settle()
  assert.equal(calls.agent, 1)
  assert.equal(rows.get('123@s.whatsapp.net:pesan-1').status, 'sent')
  assert.deepEqual(cleaned, ['foto-kamera.jpg'])
  await bot.stop()
})

test('foto sementara dibersihkan jika penyimpanan balasan gagal', async () => {
  const cleaned = []
  const { bot, ev, calls, message } = createFixture({
    prepareFails: true,
    agentResponse: { type: 'image', filePath: 'foto-gagal.jpg', cameraCapture: true },
    cleanupGeneratedFile: async (filePath) => { cleaned.push(filePath) }
  })
  await bot.start()
  ev.emit('connection.update', { connection: 'open' })
  ev.emit('messages.upsert', { type: 'notify', messages: [message()] })
  await settle()

  assert.deepEqual(cleaned, ['foto-gagal.jpg'])
  assert.equal(calls.send[0].content.text, ERROR_REPLY)
  await bot.stop()
})
