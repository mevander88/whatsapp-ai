const test = require('node:test')
const assert = require('node:assert/strict')
const { createAgent, parseDecision } = require('../src/agent')
const { createResponseTools } = require('../src/response-tools')

function fixture(aiResult, responseToolsOverride, computerToolsOverride) {
  const calls = { pending: [], audit: [], execute: [], aiOptions: [] }
  const database = {
    createPendingAction: async (value) => calls.pending.push(value),
    resolvePendingAction: async () => null,
    saveAuditLog: async (value) => calls.audit.push(value)
  }
  const computerTools = computerToolsOverride || {
    definitions: [{ type: 'function', function: { name: 'get_system_info' } }],
    has: (name) => name === 'get_system_info',
    describe: () => 'membaca informasi sistem',
    validate: (_name, args) => args,
    execute: async (...args) => {
      calls.execute.push(args)
      return { type: 'data', data: { hostname: 'PC' } }
    }
  }
  const responseTools = responseToolsOverride || {
    definitions: [{ type: 'function', function: { name: 'send_buttons' } }],
    has: (name) => name === 'send_buttons',
    execute: () => ({ type: 'buttons', text: 'Pilih', options: [{ id: 'a', label: 'A' }] })
  }
  const ai = {
    chat: async (_history, options) => {
      calls.aiOptions.push(options)
      return typeof aiResult === 'function' ? aiResult(calls.aiOptions.length) : aiResult
    }
  }
  const agent = createAgent({
    ai,
    database,
    computerTools,
    responseTools,
    ownerIds: ['628123@s.whatsapp.net'],
    approvalTtlMinutes: 10
  })
  return { agent, calls, database, computerTools }
}

test('pengguna biasa tidak diberi definisi tool komputer', async () => {
  const { agent, calls } = fixture({ text: 'Jawaban umum' })
  const response = await agent.handle({
    chatId: '999@s.whatsapp.net',
    senderIds: ['999@s.whatsapp.net'],
    text: 'Apa kabar?',
    history: [{ role: 'user', content: 'Apa kabar?' }]
  })

  assert.equal(response.text, 'Jawaban umum')
  assert.deepEqual(calls.aiOptions[0].tools.map((tool) => tool.function.name), ['send_buttons'])
  assert.doesNotMatch(calls.aiOptions[0].systemPrompt, /run_cmd_command/)
})

test('permintaan tool komputer dari pemilik menghasilkan persetujuan tersimpan', async () => {
  const { agent, calls } = fixture({
    toolCall: { name: 'get_system_info', arguments: {} }
  })
  const response = await agent.handle({
    chatId: '628123@s.whatsapp.net',
    senderIds: ['628123@s.whatsapp.net'],
    text: 'Cek komputer',
    history: [{ role: 'user', content: 'Cek komputer' }]
  })

  assert.equal(response.type, 'buttons')
  assert.equal(calls.pending.length, 1)
  assert.equal(calls.pending[0].actionName, 'get_system_info')
  assert.equal(calls.execute.length, 0)
  assert.match(calls.aiOptions[0].systemPrompt, /run_cmd_command/)
})

test('foto kamera hanya diambil setelah pemilik menyetujui tindakan', async () => {
  let captures = 0
  const computerTools = {
    definitions: [{ type: 'function', function: { name: 'capture_camera_photo' } }],
    has: (name) => name === 'capture_camera_photo',
    validate: () => ({}),
    describe: () => 'mengambil foto kamera',
    execute: async () => {
      captures += 1
      return { type: 'response', response: { type: 'image', filePath: 'foto.jpg', cameraCapture: true } }
    }
  }
  const { agent, calls, database } = fixture({
    toolCall: { name: 'capture_camera_photo', arguments: {} }
  }, undefined, computerTools)

  const other = await agent.handle({ chatId: '999@s.whatsapp.net', senderIds: ['999@s.whatsapp.net'], text: 'Jepret kamera', history: [] })
  assert.match(other.text, /tidak memiliki izin/)
  const request = await agent.handle({ chatId: '628123@s.whatsapp.net', senderIds: ['628123@s.whatsapp.net'], text: 'Jepret kamera', history: [] })
  assert.equal(request.type, 'buttons')
  assert.equal(captures, 0)
  assert.equal(calls.pending[0].actionName, 'capture_camera_photo')

  database.resolvePendingAction = async () => ({ name: 'capture_camera_photo', arguments: {} })
  const approved = await agent.handle({
    chatId: '628123@s.whatsapp.net', senderIds: ['628123@s.whatsapp.net'],
    text: `SETUJUI ${calls.pending[0].token}`, history: []
  })
  assert.equal(approved.type, 'image')
  assert.equal(captures, 1)
})

test('permintaan foto kamera langsung menampilkan izin di chat tanpa bergantung pada jawaban AI', async () => {
  const computerTools = {
    definitions: [{ type: 'function', function: { name: 'capture_camera_photo' } }],
    has: (name) => name === 'capture_camera_photo',
    validate: () => ({}),
    describe: () => 'mengambil satu foto kamera',
    execute: async () => { throw new Error('belum disetujui') }
  }
  const { agent, calls } = fixture({ text: 'Silakan berikan izin melalui komputer.' }, undefined, computerTools)
  const response = await agent.handle({
    chatId: '628123@s.whatsapp.net', senderIds: ['628123@s.whatsapp.net'],
    text: 'Tolong jepret kamera lalu kirim fotonya', history: []
  })

  assert.equal(response.type, 'buttons')
  assert.deepEqual(response.options.map((option) => option.label), ['Setujui', 'Tolak'])
  assert.match(response.fallbackText, /SETUJUI [a-f0-9]{12}/)
  assert.equal(calls.pending[0].actionName, 'capture_camera_photo')
  assert.equal(calls.aiOptions.length, 0)
  assert.equal(calls.execute.length, 0)
})

test('perintah CMD yang jelas memakai persetujuan WhatsApp tanpa mengubah perintah', async () => {
  const computerTools = {
    definitions: [{ type: 'function', function: { name: 'run_cmd_command', parameters: { properties: { command: { enum: ['systeminfo'] } } } } }],
    has: (name) => name === 'run_cmd_command',
    validate: (_name, args) => args,
    describe: (_name, args) => `menjalankan ${args.command}`,
    execute: async () => { throw new Error('belum disetujui') }
  }
  const { agent, calls } = fixture({ text: 'Izin diberikan dari Windows.' }, undefined, computerTools)
  const response = await agent.handle({
    chatId: '628123@s.whatsapp.net', senderIds: ['628123@s.whatsapp.net'],
    text: 'Jalankan systeminfo di CMD', history: []
  })

  assert.equal(response.type, 'buttons')
  assert.deepEqual(calls.pending[0].arguments, { command: 'systeminfo' })
  assert.equal(calls.aiOptions.length, 0)
})

test('permintaan RAM pemilik meminta izin di WhatsApp, pengguna lain tidak', async () => {
  const { agent, calls } = fixture({ text: 'Silakan izinkan di komputer.' })
  const ownerResponse = await agent.handle({
    chatId: '628123@s.whatsapp.net', senderIds: ['628123@s.whatsapp.net'],
    text: 'Cek RAM komputer saya', history: []
  })
  assert.equal(ownerResponse.type, 'buttons')
  assert.equal(calls.pending[0].actionName, 'get_system_info')
  assert.equal(calls.aiOptions.length, 0)
  assert.equal(calls.execute.length, 0)

  await agent.handle({
    chatId: '999@s.whatsapp.net', senderIds: ['999@s.whatsapp.net'],
    text: 'Cek RAM komputer saya', history: []
  })
  assert.equal(calls.pending.length, 1)
  assert.equal(calls.aiOptions.length, 0)
})

test('jawaban AI yang mengarahkan izin ke komputer diperbaiki menjadi tombol WhatsApp', async () => {
  const computerTools = {
    definitions: [{ type: 'function', function: { name: 'read_text_file' } }],
    has: (name) => name === 'read_text_file',
    validate: (_name, args) => args,
    describe: () => 'membaca notes/todo.txt',
    execute: async () => { throw new Error('belum disetujui') }
  }
  const { agent, calls } = fixture((callNumber) => callNumber === 1
    ? { text: 'Untuk membaca file, berikan izin lewat popup komputer.' }
    : { toolCall: { name: 'read_text_file', arguments: { path: 'notes/todo.txt' } } }, undefined, computerTools)
  const response = await agent.handle({
    chatId: '628123@s.whatsapp.net', senderIds: ['628123@s.whatsapp.net'],
    text: 'Baca file notes/todo.txt', history: []
  })

  assert.equal(response.type, 'buttons')
  assert.equal(calls.pending[0].actionName, 'read_text_file')
  assert.equal(calls.aiOptions.length, 2)
  assert.deepEqual(calls.aiOptions[1].tools.map((tool) => tool.function.name), ['read_text_file'])
})

test('jawaban AI yang tetap meminta izin desktop tidak diteruskan ke chat', async () => {
  const { agent, calls } = fixture({ text: 'Klik Allow di komputer untuk memberi izin.' })
  const response = await agent.handle({
    chatId: '628123@s.whatsapp.net', senderIds: ['628123@s.whatsapp.net'],
    text: 'Buka aplikasi notepad', history: []
  })

  assert.equal(response.type, 'text')
  assert.match(response.text, /chat WhatsApp ini/)
  assert.doesNotMatch(response.text, /klik|desktop|windows|popup/i)
  assert.equal(calls.aiOptions.length, 2)
  assert.equal(calls.pending.length, 0)
})

test('pertanyaan tentang kamera tidak langsung membuat tindakan', async () => {
  const computerTools = {
    definitions: [{ type: 'function', function: { name: 'capture_camera_photo' } }],
    has: (name) => name === 'capture_camera_photo',
    validate: () => ({}),
    describe: () => 'mengambil foto',
    execute: async () => { throw new Error('belum disetujui') }
  }
  const { agent, calls } = fixture({ text: 'Saya dapat mengambil foto setelah Anda memintanya.' }, undefined, computerTools)
  const response = await agent.handle({
    chatId: '628123@s.whatsapp.net', senderIds: ['628123@s.whatsapp.net'],
    text: 'Apakah bisa jepret kamera?', history: []
  })

  assert.equal(response.type, 'text')
  assert.equal(calls.pending.length, 0)
})

test('jawaban berbentuk tombol buatan AI tidak boleh meminta izin di desktop', async () => {
  const computerTools = {
    definitions: [{ type: 'function', function: { name: 'open_application' } }],
    has: (name) => name === 'open_application',
    validate: (_name, args) => args,
    describe: () => 'membuka notepad',
    execute: async () => { throw new Error('belum disetujui') }
  }
  const responseTools = {
    definitions: [{ type: 'function', function: { name: 'send_buttons' } }],
    has: (name) => name === 'send_buttons',
    execute: () => ({ type: 'buttons', text: 'Klik Allow di komputer untuk memberi izin.', options: [{ id: 'ok', label: 'OK' }] })
  }
  const { agent, calls } = fixture((callNumber) => callNumber === 1
    ? { toolCall: { name: 'send_buttons', arguments: {} } }
    : { toolCall: { name: 'open_application', arguments: { name: 'notepad' } } }, responseTools, computerTools)
  const response = await agent.handle({
    chatId: '628123@s.whatsapp.net', senderIds: ['628123@s.whatsapp.net'],
    text: 'Buka aplikasi notepad', history: []
  })

  assert.equal(response.type, 'buttons')
  assert.deepEqual(response.options.map((option) => option.label), ['Setujui', 'Tolak'])
  assert.equal(calls.pending[0].actionName, 'open_application')
  assert.equal(calls.execute.length, 0)
})

test('pengguna biasa tidak dapat menyetujui tindakan', async () => {
  const { agent, calls } = fixture({ text: 'unused' })
  const response = await agent.handle({
    chatId: '999@s.whatsapp.net',
    senderIds: ['999@s.whatsapp.net'],
    text: 'SETUJUI abcdef123456',
    history: []
  })

  assert.match(response.text, /Hanya pemilik/)
  assert.equal(calls.execute.length, 0)
})

test('persetujuan pemilik menjalankan satu tindakan dan merangkum hasil', async () => {
  const { agent, calls, database } = fixture((callNumber) => (
    callNumber === 1 ? { text: 'Komputer bernama PC.' } : { text: 'tidak dipakai' }
  ))
  database.resolvePendingAction = async () => ({ name: 'get_system_info', arguments: {} })

  const response = await agent.handle({
    chatId: '628123@s.whatsapp.net',
    senderIds: ['628123@s.whatsapp.net'],
    text: 'SETUJUI abcdef123456',
    history: []
  })

  assert.equal(response.text, 'Komputer bernama PC.')
  assert.deepEqual(calls.execute, [['get_system_info', {}]])
  assert.equal(calls.audit.some((entry) => entry.outcome === 'success'), true)
})

test('tool berbahaya yang tidak terdaftar ditolak', async () => {
  const { agent, calls } = fixture({ toolCall: { name: 'delete_file', arguments: { path: 'x' } } })
  const response = await agent.handle({
    chatId: '628123@s.whatsapp.net',
    senderIds: ['628123@s.whatsapp.net'],
    text: 'Hapus semua file',
    history: []
  })

  assert.match(response.text, /tidak memiliki izin/)
  assert.equal(calls.execute.length, 0)
})

test('label tombol AI yang terlalu panjang tetap menghasilkan jawaban teks', async () => {
  const { agent } = fixture({
    toolCall: {
      name: 'send_buttons',
      arguments: {
        text: 'Pilih informasi yang ingin dilihat',
        options: [{ id: 'detail', label: 'Lihat informasi lebih lengkap' }]
      }
    }
  }, createResponseTools())
  const message = await agent.handle({ chatId: '999@s.whatsapp.net', senderIds: ['999@s.whatsapp.net'], text: 'Pilihan?', history: [] })
  assert.equal(message.type, 'text')
  assert.match(message.text, /Pilih informasi yang ingin dilihat/)
  assert.match(message.text, /Lihat informasi lebih lengkap/)
})

test('parseDecision membaca tombol dan fallback teks', () => {
  assert.deepEqual(parseDecision('agent:approve:abcdef123456'), { decision: 'approved', token: 'abcdef123456' })
  assert.deepEqual(parseDecision('TOLAK abcdef123456'), { decision: 'rejected', token: 'abcdef123456' })
})
