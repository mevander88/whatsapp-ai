const test = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const {
  buildMessageContent,
  connectionFailureMessage,
  createChatQueue,
  createWhatsAppBot,
  extractText,
  resolveSenderIds,
  resolveWhatsAppVersion
} = require('../src/whatsapp')
const { findOwnerId } = require('../src/security')

function createTestLogger(entries) {
  return {
    debug: (...args) => entries.push(['debug', ...args]),
    error: (...args) => entries.push(['error', ...args]),
    info: (...args) => entries.push(['info', ...args]),
    warn: (...args) => entries.push(['warn', ...args])
  }
}

const testDatabase = {
  recoverInterruptedMessages: async () => 0,
  getPendingReplies: async () => []
}

test('extractText membaca pesan teks biasa dan extended text', () => {
  assert.equal(extractText({ message: { conversation: ' Halo ' } }), 'Halo')
  assert.equal(
    extractText({ message: { extendedTextMessage: { text: 'Balasan' } } }),
    'Balasan'
  )
  assert.equal(extractText({ message: { imageMessage: { caption: ' Jelaskan gambar ' } } }), 'Jelaskan gambar')
  assert.equal(
    extractText({ message: { buttonsResponseMessage: { selectedButtonId: 'agent:approve:abc' } } }),
    'agent:approve:abc'
  )
})

test('LID pemilik dikenali lewat pemetaan Baileys, LID lain tetap tanpa izin', async () => {
  const currentSocket = {
    signalRepository: {
      getLIDMappingStore: () => ({
        getPNForLID: async (lid) => lid === '111@lid' ? '628123:4@s.whatsapp.net' : null
      })
    }
  }
  const ownerIds = await resolveSenderIds({ key: { remoteJid: '111@lid' } }, currentSocket)
  const otherIds = await resolveSenderIds({ key: { remoteJid: '222@lid' } }, currentSocket)

  assert.equal(findOwnerId(ownerIds, ['628123@s.whatsapp.net']), '628123@s.whatsapp.net')
  assert.equal(findOwnerId(otherIds, ['628123@s.whatsapp.net']), null)
  const misleadingAlt = await resolveSenderIds({
    key: { remoteJid: '222@lid', remoteJidAlt: '628123@s.whatsapp.net' }
  }, currentSocket)
  assert.equal(findOwnerId(misleadingAlt, ['628123@s.whatsapp.net']), null)
})

test('buildMessageContent menyusun tombol, daftar, dan media sesuai format Baileys', () => {
  assert.deepEqual(buildMessageContent({
    type: 'buttons',
    text: 'Pilih',
    footer: 'Agent',
    options: [{ id: 'yes', label: 'Ya' }]
  }), {
    text: 'Pilih',
    footer: 'Agent',
    buttons: [{ buttonId: 'yes', buttonText: { displayText: 'Ya' } }]
  })

  assert.deepEqual(buildMessageContent({
    type: 'list',
    text: 'Menu',
    options: [{ id: 'satu', title: 'Pilihan satu' }]
  }), {
    title: undefined,
    text: 'Menu',
    buttonText: undefined,
    sections: [{
      title: undefined,
      rows: [{ rowId: 'satu', title: 'Pilihan satu', description: undefined }]
    }]
  })

  assert.deepEqual(buildMessageContent({ type: 'image', filePath: 'C:\\tmp\\foto.jpg', caption: 'Foto' }), {
    image: { url: 'C:\\tmp\\foto.jpg' },
    caption: 'Foto'
  })
})

test('antrean menjalankan pesan dalam chat yang sama secara berurutan', async () => {
  const enqueue = createChatQueue()
  const order = []
  let releaseFirst
  const waitForRelease = new Promise((resolve) => { releaseFirst = resolve })

  const first = enqueue('chat-1', async () => {
    order.push('first-start')
    await waitForRelease
    order.push('first-end')
  })
  const second = enqueue('chat-1', async () => order.push('second'))

  await new Promise((resolve) => setImmediate(resolve))
  assert.deepEqual(order, ['first-start'])
  releaseFirst()
  await Promise.all([first, second])
  assert.deepEqual(order, ['first-start', 'first-end', 'second'])
})

test('resolveWhatsAppVersion memakai versi terbaru dan fallback saat sumber gagal', async () => {
  const entries = []
  const logger = createTestLogger(entries)
  const latest = await resolveWhatsAppVersion({
    fetchWaWebVersion: async () => [2, 3000, 123],
    fetchBaileysVersion: async () => ({ version: [2, 3000, 100], isLatest: true })
  }, logger)
  const fallback = await resolveWhatsAppVersion({
    fetchWaWebVersion: async () => { throw new Error('offline') },
    fetchBaileysVersion: async () => ({ version: [2, 3000, 100], isLatest: false, error: new Error('offline') })
  }, logger)

  assert.deepEqual(latest, [2, 3000, 123])
  assert.equal(fallback, undefined)
  assert.ok(entries.some((entry) => entry[0] === 'warn'))
})

test('bot memakai versi terbaru, menampilkan status QR, dan menyimpan kredensial sesi', async () => {
  const entries = []
  const logger = createTestLogger(entries)
  const ev = new EventEmitter()
  let socketOptions
  let saveCredsCalled = false

  const bot = createWhatsAppBot({
    database: testDatabase,
    agent: {},
    historyLimit: 10,
    sessionPath: 'auth-test'
  }, {
    logger,
    fetchLatestWaWebVersion: async () => [2, 3000, 123],
    useMultiFileAuthState: async () => ({
      state: { creds: {}, keys: {} },
      saveCreds: async () => { saveCredsCalled = true }
    }),
    makeWASocket: (options) => {
      socketOptions = options
      return { ev, ws: { isOpen: false } }
    }
  })

  await bot.start()
  ev.emit('connection.update', { qr: 'nilai-qr-rahasia' })
  ev.emit('creds.update', {})
  await new Promise((resolve) => setImmediate(resolve))

  assert.deepEqual(socketOptions.version, [2, 3000, 123])
  assert.equal(socketOptions.printQRInTerminal, true)
  assert.equal(saveCredsCalled, true)
  assert.ok(entries.some((entry) => entry.includes('QR login WhatsApp siap. Pindai melalui menu Perangkat tertaut di aplikasi WhatsApp.')))
  assert.equal(JSON.stringify(entries).includes('nilai-qr-rahasia'), false)
})

test('kegagalan registrasi memiliki petunjuk yang dapat ditindaklanjuti', () => {
  assert.match(connectionFailureMessage(405), /versi Baileys\/protokol/)
  assert.match(connectionFailureMessage(500), /proxy, firewall/)
})

test('bot tidak mengulang registrasi yang ditolak dengan status 405', async () => {
  const entries = []
  const ev = new EventEmitter()
  const timers = []
  const bot = createWhatsAppBot({
    database: testDatabase, agent: {}, historyLimit: 10, sessionPath: 'auth-test'
  }, {
    logger: createTestLogger(entries),
    fetchLatestWaWebVersion: async () => [2, 3000, 123],
    useMultiFileAuthState: async () => ({ state: { creds: {}, keys: {} }, saveCreds: async () => {} }),
    makeWASocket: () => ({ ev, ws: { isOpen: false } }),
    setTimeout: (callback) => { timers.push(callback); return { timer: 1 } }
  })

  await bot.start()
  ev.emit('connection.update', { connection: 'close', lastDisconnect: { error: { output: { statusCode: 405 } } } })

  assert.equal(timers.length, 0)
  assert.ok(entries.some((entry) => entry.includes('Koneksi tidak akan diulang otomatis untuk kegagalan ini. Perbaiki versi atau akses jaringan, lalu jalankan ulang bot.')))
})

test('bot membatasi koneksi ulang dan hanya mengambil versi protokol sekali', async () => {
  const entries = []
  const logger = createTestLogger(entries)
  const sockets = []
  const timers = []
  let versionFetches = 0

  const bot = createWhatsAppBot({
    database: testDatabase,
    agent: {},
    historyLimit: 10,
    sessionPath: 'auth-test',
    maxReconnectAttempts: 2
  }, {
    logger,
    fetchLatestWaWebVersion: async () => {
      versionFetches += 1
      return [2, 3000, 123]
    },
    useMultiFileAuthState: async () => ({ state: { creds: {}, keys: {} }, saveCreds: async () => {} }),
    makeWASocket: () => {
      const ev = new EventEmitter()
      sockets.push({ ev, ws: { isOpen: false } })
      return sockets.at(-1)
    },
    setTimeout: (callback) => {
      timers.push(callback)
      return { timer: timers.length }
    }
  })

  await bot.start()
  sockets[0].ev.emit('connection.update', { connection: 'close', lastDisconnect: { error: { output: { statusCode: 408 } } } })
  timers.shift()()
  await new Promise((resolve) => setImmediate(resolve))
  sockets[1].ev.emit('connection.update', { connection: 'close', lastDisconnect: { error: { output: { statusCode: 408 } } } })
  timers.shift()()
  await new Promise((resolve) => setImmediate(resolve))
  sockets[2].ev.emit('connection.update', { connection: 'close', lastDisconnect: { error: { output: { statusCode: 408 } } } })

  assert.equal(sockets.length, 3)
  assert.equal(timers.length, 0)
  assert.equal(versionFetches, 1)
  assert.ok(entries.some((entry) => entry.includes('Batas koneksi ulang WhatsApp tercapai. Periksa jaringan dan konfigurasi, lalu jalankan ulang bot.')))
})
