const test = require('node:test')
const assert = require('node:assert/strict')
const { createAgent, parseDecision } = require('../src/agent')
const { createResponseTools } = require('../src/response-tools')

function fixture(aiResult, responseToolsOverride, computerToolsOverride, agentOptions = {}) {
  const calls = { pending: [], audit: [], execute: [], aiOptions: [], aiHistory: [] }
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
      calls.aiHistory.push(_history)
      return typeof aiResult === 'function' ? aiResult(calls.aiOptions.length) : aiResult
    }
  }
  const agent = createAgent({
    ai,
    database,
    computerTools,
    responseTools,
    ownerIds: ['628123@s.whatsapp.net'],
    approvalTtlMinutes: 10,
    ...agentOptions
  })
  return { agent, calls, database, computerTools }
}

test('gambar WhatsApp dianalisis tanpa menyimpan data base64 pada riwayat percakapan', async () => {
  const { agent, calls } = fixture({ text: 'Tulisan pada gambar adalah HELLO.' }, undefined, undefined, {
    imageReader: { analyze: async () => ({ method: 'vision', description: 'Tulisan HELLO' }) }
  })
  const reply = await agent.handle({ chatId: '999@s.whatsapp.net', senderIds: ['999@s.whatsapp.net'], text: 'Baca gambar', history: [{ role: 'user', content: 'Baca gambar' }], imageBuffer: Buffer.from('synthetic') })
  assert.match(reply.text, /HELLO/)
  assert.match(calls.aiHistory[0][0].content, /Tulisan HELLO/)
  assert.doesNotMatch(calls.aiHistory[0][0].content, /c3ludGhldGlj/)
  assert.equal(calls.aiOptions[0].tools.some((tool) => tool.function.name === 'run_full_command'), false)
})

test('godmode memakai hasil pencarian untuk membuka pilihan dan menjawab', async () => {
  const actions = []
  const computerTools = {
    definitions: [],
    godmodeDefinitions: [{ type: 'function', function: { name: 'run_full_command' } }],
    has: () => false,
    hasGodmode: (name) => name === 'run_full_command',
    executeGodmode: async () => { throw new Error('Tidak dipakai') }
  }
  const browserTools = {
    definitions: ['web_search', 'browser_open'].map((name) => ({ type: 'function', function: { name } })),
    has: (name) => ['web_search', 'browser_open'].includes(name),
    execute: async (name, args) => {
      actions.push([name, args])
      return { type: 'response', response: { type: 'text', text: name === 'web_search' ? 'Hasil: https://nodejs.org/' : 'Halaman resmi Node.js' } }
    }
  }
  const results = [
    { toolCall: { id: 'call-1', name: 'web_search', arguments: { query: 'Node.js' } } },
    { toolCall: { id: 'call-2', name: 'browser_open', arguments: { url: 'https://nodejs.org/' } } },
    { text: 'Saya memilih situs resmi Node.js.' }
  ]
  const { agent } = fixture((call) => results[call - 1], undefined, computerTools, { browserTools })
  const owner = { chatId: '628123@s.whatsapp.net', senderIds: ['628123@s.whatsapp.net'], history: [{ role: 'user', content: 'Cari Node.js lalu pilih situs resmi' }] }
  await agent.handle({ ...owner, text: '/godmode' })
  const reply = await agent.handle({ ...owner, text: 'Cari Node.js lalu pilih situs resmi' })
  assert.deepEqual(actions.map(([name]) => name), ['web_search', 'browser_open'])
  assert.match(reply.text, /situs resmi Node.js/)
})

test('godmode mengumpulkan hasil web sebelum menawarkan tombol pilihan', async () => {
  const computerTools = {
    definitions: [],
    godmodeDefinitions: [{ type: 'function', function: { name: 'run_full_command' } }],
    has: () => false,
    hasGodmode: (name) => name === 'run_full_command',
    executeGodmode: async () => { throw new Error('Tidak dipakai') }
  }
  const browserTools = {
    definitions: [{ type: 'function', function: { name: 'web_search' } }],
    has: (name) => name === 'web_search',
    execute: async () => ({ type: 'response', response: { type: 'text', text: 'Situs resmi: https://nodejs.org/' } })
  }
  const answers = [
    { toolCall: { name: 'web_search', arguments: { query: 'Node.js' } } },
    { toolCall: { name: 'send_buttons', arguments: {} } }
  ]
  const { agent, calls } = fixture((number) => answers[number - 1], undefined, computerTools, { browserTools })
  const owner = { chatId: '628123@s.whatsapp.net', senderIds: ['628123@s.whatsapp.net'] }
  await agent.handle({ ...owner, text: '/godmode', history: [] })
  const request = 'Cari website Node.js dan berikan pilihan'
  const reply = await agent.handle({ ...owner, text: request, history: [{ role: 'user', content: request }] })
  assert.equal(reply.type, 'buttons')
  assert.equal(calls.aiOptions[0].tools.some((tool) => tool.function.name === 'send_buttons'), false)
  assert.equal(calls.aiOptions[1].tools.some((tool) => tool.function.name === 'send_buttons'), true)
  assert.match(calls.aiHistory[1].at(-1).content, /nodejs.org/)
})

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

test('pengguna biasa tetap dapat meminta tombol balasan WhatsApp', async () => {
  const { agent } = fixture({ toolCall: { name: 'send_buttons', arguments: {} } })
  const response = await agent.handle({
    chatId: '999@s.whatsapp.net',
    senderIds: ['999@s.whatsapp.net'],
    text: 'Beri tombol pilihan',
    history: [{ role: 'user', content: 'Beri tombol pilihan' }]
  })
  assert.equal(response.type, 'buttons')
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

test('godmode hanya aktif di chat pribadi owner dan berhenti saat dimatikan atau kedaluwarsa', async () => {
  let currentTime = 1_000
  const executed = []
  const computerTools = {
    definitions: [],
    godmodeDefinitions: [{ type: 'function', function: { name: 'run_full_command' } }],
    has: () => false,
    hasGodmode: (name) => name === 'run_full_command',
    executeGodmode: async (name, args) => {
      executed.push([name, args])
      return { type: 'response', response: { type: 'text', text: 'Perintah selesai.' } }
    }
  }
  const { agent, calls } = fixture({ text: 'unused' }, undefined, computerTools, {
    godmodeTtlMinutes: 1,
    now: () => currentTime
  })
  const owner = { chatId: '628123@s.whatsapp.net', senderIds: ['628123@s.whatsapp.net'], history: [] }

  const stranger = await agent.handle({ chatId: '999@s.whatsapp.net', senderIds: ['999@s.whatsapp.net'], text: '/godmode', history: [] })
  const group = await agent.handle({ chatId: 'group@g.us', senderIds: ['628123@s.whatsapp.net'], text: '/godmode', history: [] })
  assert.match(stranger.text, /Hanya pemilik/)
  assert.match(group.text, /chat pribadi/)
  assert.match((await agent.handle({ ...owner, text: '/exec Get-Date' })).text, /tidak aktif/)
  assert.equal(executed.length, 0)

  const enabled = await agent.handle({ ...owner, text: '/godmode' })
  assert.match(enabled.text, /aktif selama 1 menit/)
  assert.match((await agent.handle({ ...owner, text: '/godmode status' })).text, /Godmode aktif/)
  const result = await agent.handle({ ...owner, text: '/exec Get-Date' })
  assert.equal(result.text, 'Perintah selesai.')
  assert.deepEqual(executed, [['run_full_command', { command: 'Get-Date' }]])
  assert.equal(calls.pending.length, 0)
  assert.equal(calls.audit.some((entry) => entry.eventType === 'godmode' && entry.outcome === 'enabled'), true)

  await agent.handle({ ...owner, text: '/godmode off' })
  assert.match((await agent.handle({ ...owner, text: '/exec Get-Date' })).text, /tidak aktif/)
  assert.equal(executed.length, 1)

  await agent.handle({ ...owner, text: '/godmode' })
  currentTime += 60_001
  assert.match((await agent.handle({ ...owner, text: '/exec Get-Date' })).text, /tidak aktif/)
  assert.equal(executed.length, 1)
})

test('AI hanya melihat tool akses penuh saat godmode aktif', async () => {
  const executed = []
  const computerTools = {
    definitions: [],
    godmodeDefinitions: [{ type: 'function', function: { name: 'run_full_command' } }],
    has: () => false,
    hasGodmode: (name) => name === 'run_full_command',
    executeGodmode: async (name, args) => {
      executed.push([name, args])
      return { type: 'response', response: { type: 'text', text: 'Halo' } }
    }
  }
  const { agent, calls } = fixture((number) => number <= 2
    ? { toolCall: { name: 'run_full_command', arguments: { command: 'Write-Output Halo' } } }
    : { text: 'Halo' }, undefined, computerTools)
  const owner = { chatId: '628123@s.whatsapp.net', senderIds: ['628123@s.whatsapp.net'], history: [] }

  const before = await agent.handle({ ...owner, text: 'Jalankan perintah PowerShell Write-Output Halo' })
  assert.match(before.text, /tidak memiliki izin/)
  assert.deepEqual(calls.aiOptions[0].tools.map((tool) => tool.function.name), ['send_buttons'])
  assert.equal(executed.length, 0)

  await agent.handle({ ...owner, text: '/godmode' })
  const after = await agent.handle({ ...owner, text: 'Jalankan perintah PowerShell Write-Output Halo' })
  assert.equal(after.text, 'Halo')
  assert.deepEqual(calls.aiOptions[1].tools.map((tool) => tool.function.name), ['run_full_command'])
  assert.deepEqual(executed, [['run_full_command', { command: 'Write-Output Halo' }]])
  assert.equal(calls.pending.length, 0)
})

test('godmode menampilkan tool buka dan tutup aplikasi tanpa memakai daftar izin biasa', async () => {
  const executed = []
  const computerTools = {
    definitions: [{ type: 'function', function: { name: 'open_application' } }],
    godmodeDefinitions: ['run_full_command', 'launch_application', 'close_application', 'list_running_applications']
      .map((name) => ({ type: 'function', function: { name } })),
    has: (name) => name === 'open_application',
    hasGodmode: (name) => ['run_full_command', 'launch_application', 'close_application', 'list_running_applications'].includes(name),
    executeGodmode: async (name, args) => {
      executed.push([name, args])
      return { type: 'response', response: { type: 'text', text: 'Berhasil.' } }
    }
  }
  const { agent, calls } = fixture((number) => number === 1
    ? { toolCall: { name: 'close_application', arguments: { processName: 'chrome' } } }
    : { text: 'Berhasil.' }, undefined, computerTools)
  const owner = { chatId: '628123@s.whatsapp.net', senderIds: ['628123@s.whatsapp.net'], history: [] }

  await agent.handle({ ...owner, text: '/godmode' })
  const response = await agent.handle({ ...owner, text: 'Tutup Chrome' })
  assert.equal(response.text, 'Berhasil.')
  assert.deepEqual(executed, [['close_application', { processName: 'chrome' }]])
  assert.deepEqual(calls.aiOptions[0].tools.map((tool) => tool.function.name), [
    'run_full_command', 'launch_application', 'close_application', 'list_running_applications'
  ])
  assert.equal(calls.pending.length, 0)
  assert.equal(calls.audit.some((entry) => entry.actionName === 'close_application' && entry.outcome === 'success'), true)
})

test('godmode menjalankan beberapa tindakan aplikasi yang diminta berurutan tanpa persetujuan ulang', async () => {
  const executed = []
  const computerTools = {
    definitions: [],
    godmodeDefinitions: ['run_full_command', 'launch_application', 'type_text']
      .map((name) => ({ type: 'function', function: { name } })),
    has: () => false,
    hasGodmode: (name) => ['run_full_command', 'launch_application', 'type_text'].includes(name),
    executeGodmode: async (name, args) => {
      executed.push([name, args])
      return { type: 'response', response: { type: 'text', text: `Selesai: ${name}` } }
    }
  }
  const answers = [
    { toolCall: { name: 'launch_application', arguments: { target: 'notepad.exe' } } },
    { toolCall: { name: 'type_text', arguments: { text: 'Halo' } } },
    { text: 'Selesai' }
  ]
  const { agent, calls } = fixture((number) => answers[number - 1], undefined, computerTools)
  const owner = { chatId: '628123@s.whatsapp.net', senderIds: ['628123@s.whatsapp.net'] }
  await agent.handle({ ...owner, text: '/godmode', history: [] })
  const response = await agent.handle({
    ...owner,
    text: 'Buka Notepad lalu ketik Halo',
    history: [{ role: 'user', content: 'Buka Notepad lalu ketik Halo' }]
  })

  assert.deepEqual(executed, [
    ['launch_application', { target: 'notepad.exe' }],
    ['type_text', { text: 'Halo' }]
  ])
  assert.equal(response.text, 'Selesai')
  assert.match(calls.aiHistory[2].filter((item) => item.role === 'tool')[0].content, /Selesai: launch_application/)
  assert.match(calls.aiHistory[2].filter((item) => item.role === 'tool')[1].content, /Selesai: type_text/)
  assert.equal(calls.pending.length, 0)
  assert.equal(calls.audit.filter((entry) => entry.outcome === 'success').length, 2)
})

test('godmode tidak menjalankan ulang langkah yang diulang oleh model', async () => {
  const executed = []
  const names = ['run_full_command', 'launch_application', 'type_text']
  const computerTools = {
    definitions: [],
    godmodeDefinitions: names.map((name) => ({ type: 'function', function: { name } })),
    has: () => false,
    hasGodmode: (name) => names.includes(name),
    executeGodmode: async (name, args) => {
      executed.push([name, args])
      return { type: 'response', response: { type: 'text', text: `Selesai: ${name}` } }
    }
  }
  const answers = [
    { toolCall: { id: 'call-1', name: 'launch_application', arguments: { target: 'notepad.exe' } } },
    { toolCall: { id: 'call-2', name: 'launch_application', arguments: { target: 'notepad.exe' } } },
    { toolCall: { id: 'call-3', name: 'type_text', arguments: { text: 'Halo' } } },
    { text: 'Selesai' }
  ]
  const { agent } = fixture((number) => answers[number - 1], undefined, computerTools)
  const owner = { chatId: '628123@s.whatsapp.net', senderIds: ['628123@s.whatsapp.net'] }
  await agent.handle({ ...owner, text: '/godmode', history: [] })
  const response = await agent.handle({ ...owner, text: 'Buka Notepad lalu ketik Halo', history: [{ role: 'user', content: 'Buka Notepad lalu ketik Halo' }] })

  assert.deepEqual(executed.map(([name]) => name), ['launch_application', 'type_text'])
  assert.equal(response.text, 'Selesai')
})

test('godmode menyelesaikan langkah kedua walau pesan tidak memakai kata lalu', async () => {
  const executed = []
  const names = ['run_full_command', 'launch_application', 'focus_application']
  const computerTools = {
    definitions: [],
    godmodeDefinitions: names.map((name) => ({ type: 'function', function: { name } })),
    has: () => false,
    hasGodmode: (name) => names.includes(name),
    executeGodmode: async (name) => {
      executed.push(name)
      return { type: 'response', response: { type: 'text', text: `${name} berhasil` } }
    }
  }
  const answers = [
    { toolCall: { name: 'launch_application', arguments: { target: 'chrome.exe' } } },
    { toolCall: { name: 'focus_application', arguments: { processName: 'chrome' } } },
    { text: 'Chrome sudah terbuka dan aktif.' }
  ]
  const { agent } = fixture((number) => answers[number - 1], undefined, computerTools)
  const owner = { chatId: '628123@s.whatsapp.net', senderIds: ['628123@s.whatsapp.net'] }
  await agent.handle({ ...owner, text: '/godmode', history: [] })
  const reply = await agent.handle({ ...owner, text: 'Buka Chrome', history: [{ role: 'user', content: 'Buka Chrome' }] })
  assert.deepEqual(executed, ['launch_application', 'focus_application'])
  assert.equal(reply.text, 'Chrome sudah terbuka dan aktif.')
})

test('godmode menjalankan semua tool call pada satu respons model', async () => {
  const executed = []
  const names = ['run_full_command', 'list_running_applications', 'get_system_info']
  const computerTools = {
    definitions: [],
    godmodeDefinitions: names.map((name) => ({ type: 'function', function: { name } })),
    has: () => false,
    hasGodmode: (name) => names.includes(name),
    executeGodmode: async (name, args) => {
      executed.push([name, args])
      return name === 'list_running_applications'
        ? { type: 'data', data: { processName: 'notepad', processId: 42 } }
        : { type: 'data', data: { availableRam: '8 GB' } }
    }
  }
  const calls = [
    { id: 'call-1', name: 'list_running_applications', arguments: {} },
    { id: 'call-2', name: 'get_system_info', arguments: {} }
  ]
  const { agent, calls: recorded } = fixture((number) => number === 1
    ? { toolCall: calls[0], toolCalls: calls }
    : { text: 'Notepad berjalan dan RAM tersedia 8 GB.' }, undefined, computerTools)
  const owner = { chatId: '628123@s.whatsapp.net', senderIds: ['628123@s.whatsapp.net'] }
  await agent.handle({ ...owner, text: '/godmode', history: [] })
  const reply = await agent.handle({ ...owner, text: 'Lihat aplikasi dan RAM', history: [{ role: 'user', content: 'Lihat aplikasi dan RAM' }] })
  assert.deepEqual(executed.map(([name]) => name), ['list_running_applications', 'get_system_info'])
  assert.equal(reply.text, 'Notepad berjalan dan RAM tersedia 8 GB.')
  assert.deepEqual(recorded.aiHistory[1].filter((item) => item.role === 'tool').map((item) => item.tool_call_id), ['call-1', 'call-2'])
  assert.match(recorded.aiHistory[1].filter((item) => item.role === 'tool')[0].content, /processId.*42/)
})

test('godmode melanjutkan pekerjaan setelah tool mengembalikan data', async () => {
  const executed = []
  const names = ['run_full_command', 'list_running_applications', 'focus_application']
  const computerTools = {
    definitions: [],
    godmodeDefinitions: names.map((name) => ({ type: 'function', function: { name } })),
    has: () => false,
    hasGodmode: (name) => names.includes(name),
    executeGodmode: async (name, args) => {
      executed.push([name, args])
      return name === 'list_running_applications'
        ? { type: 'data', data: { processName: 'notepad', processId: 42 } }
        : { type: 'response', response: { type: 'text', text: 'Jendela difokuskan.' } }
    }
  }
  const answers = [
    { toolCall: { name: 'list_running_applications', arguments: {} } },
    { toolCall: { name: 'focus_application', arguments: { processId: 42 } } },
    { text: 'Notepad aktif.' }
  ]
  const { agent, calls } = fixture((number) => answers[number - 1], undefined, computerTools)
  const owner = { chatId: '628123@s.whatsapp.net', senderIds: ['628123@s.whatsapp.net'] }
  await agent.handle({ ...owner, text: '/godmode', history: [] })
  const reply = await agent.handle({ ...owner, text: 'Aktifkan jendela Notepad', history: [{ role: 'user', content: 'Aktifkan jendela Notepad' }] })
  assert.deepEqual(executed.map(([name]) => name), ['list_running_applications', 'focus_application'])
  assert.match(calls.aiHistory[1].filter((item) => item.role === 'tool')[0].content, /processId.*42/)
  assert.equal(reply.text, 'Notepad aktif.')
})

test('godmode mencoba tool lagi saat model hanya berjanji melakukan tindakan', async () => {
  let executions = 0
  const names = ['run_full_command', 'launch_application']
  const computerTools = {
    definitions: [],
    godmodeDefinitions: names.map((name) => ({ type: 'function', function: { name } })),
    has: () => false,
    hasGodmode: (name) => names.includes(name),
    executeGodmode: async () => {
      executions += 1
      return { type: 'response', response: { type: 'text', text: 'Chrome dibuka.' } }
    }
  }
  const answers = [
    { text: 'Saya akan membuka Chrome.' },
    { toolCall: { name: 'launch_application', arguments: { target: 'chrome.exe' } } },
    { text: 'Chrome telah dibuka.' }
  ]
  const { agent } = fixture((number) => answers[number - 1], undefined, computerTools)
  const owner = { chatId: '628123@s.whatsapp.net', senderIds: ['628123@s.whatsapp.net'] }
  await agent.handle({ ...owner, text: '/godmode', history: [] })
  const reply = await agent.handle({ ...owner, text: 'Buka Chrome', history: [{ role: 'user', content: 'Buka Chrome' }] })
  assert.equal(executions, 1)
  assert.equal(reply.text, 'Chrome telah dibuka.')
})

test('godmode berhenti ketika model mengulang tindakan tanpa kemajuan', async () => {
  let executions = 0
  const computerTools = {
    definitions: [],
    godmodeDefinitions: [{ type: 'function', function: { name: 'run_full_command' } }],
    has: () => false,
    hasGodmode: (name) => name === 'run_full_command',
    executeGodmode: async () => {
      executions += 1
      return { type: 'response', response: { type: 'text', text: 'Selesai.' } }
    }
  }
  const { agent, calls } = fixture({ toolCall: { name: 'run_full_command', arguments: { command: 'Get-Date' } } }, undefined, computerTools)
  const owner = { chatId: '628123@s.whatsapp.net', senderIds: ['628123@s.whatsapp.net'] }
  await agent.handle({ ...owner, text: '/godmode', history: [] })
  const reply = await agent.handle({ ...owner, text: 'Jalankan Get-Date', history: [{ role: 'user', content: 'Jalankan Get-Date' }] })
  assert.equal(executions, 1)
  assert.match(reply.text, /mengulang langkah tanpa kemajuan/)
  assert.ok(calls.aiHistory.length < 6)
})

test('tool layar tidak berjalan dari chat selain owner atau ketika godmode mati', async () => {
  let executions = 0
  const computerTools = {
    definitions: [],
    godmodeDefinitions: ['run_full_command', 'capture_desktop_screenshot', 'click_screen']
      .map((name) => ({ type: 'function', function: { name } })),
    has: () => false,
    hasGodmode: (name) => ['run_full_command', 'capture_desktop_screenshot', 'click_screen'].includes(name),
    executeGodmode: async () => {
      executions += 1
      return { type: 'response', response: { type: 'text', text: 'OK' } }
    }
  }
  const { agent } = fixture((number) => number <= 2
    ? { toolCall: { name: 'click_screen', arguments: { x: 10, y: 20 } } }
    : { text: 'OK' }, undefined, computerTools)
  const owner = { chatId: '628123@s.whatsapp.net', senderIds: ['628123@s.whatsapp.net'], history: [] }
  const stranger = { chatId: '999@s.whatsapp.net', senderIds: ['999@s.whatsapp.net'], history: [] }

  assert.match((await agent.handle({ ...stranger, text: 'Klik layar di x=10 y=20' })).text, /tidak memiliki izin/)
  assert.match((await agent.handle({ ...owner, text: 'Klik layar di x=10 y=20' })).text, /tidak memiliki izin/)
  await agent.handle({ ...owner, text: '/godmode' })
  assert.equal((await agent.handle({ ...owner, text: 'Klik layar di x=10 y=20' })).text, 'OK')
  await agent.handle({ ...owner, text: '/godmode off' })
  assert.match((await agent.handle({ ...owner, text: 'Klik layar di x=10 y=20' })).text, /tidak memiliki izin/)
  assert.equal(executions, 1)
})

test('tool biasa langsung dijalankan tanpa antrean persetujuan ketika godmode aktif', async () => {
  const executed = []
  const computerTools = {
    definitions: [{ type: 'function', function: { name: 'get_system_info' } }],
    godmodeDefinitions: [{ type: 'function', function: { name: 'run_full_command' } }],
    has: (name) => name === 'get_system_info',
    hasGodmode: (name) => name === 'run_full_command',
    executeGodmode: async (name, args) => {
      executed.push([name, args])
      return { type: 'response', response: { type: 'text', text: 'RAM tersedia 8 GB.' } }
    }
  }
  const { agent, calls } = fixture({ text: 'unused' }, undefined, computerTools)
  const owner = { chatId: '628123@s.whatsapp.net', senderIds: ['628123@s.whatsapp.net'], history: [] }
  await agent.handle({ ...owner, text: '/godmode' })
  const response = await agent.handle({ ...owner, text: 'Cek RAM komputer saya' })

  assert.equal(response.text, 'RAM tersedia 8 GB.')
  assert.deepEqual(executed, [['get_system_info', {}]])
  assert.equal(calls.pending.length, 0)
})

test('owner yang dikenali lewat LID dapat mengaktifkan mode, audit gagal mencegah aktivasi', async () => {
  const executed = []
  const computerTools = {
    definitions: [],
    godmodeDefinitions: [{ type: 'function', function: { name: 'run_full_command' } }],
    has: () => false,
    hasGodmode: (name) => name === 'run_full_command',
    executeGodmode: async (name, args) => {
      executed.push([name, args])
      return { type: 'response', response: { type: 'text', text: 'OK' } }
    }
  }
  const { agent, database } = fixture({ text: 'unused' }, undefined, computerTools)
  const ownerLid = {
    chatId: '770000@lid',
    senderIds: ['770000@lid', '628123@s.whatsapp.net'],
    history: []
  }

  database.saveAuditLog = async () => { throw new Error('database offline') }
  await assert.rejects(() => agent.handle({ ...ownerLid, text: '/godmode' }), /Gagal menyimpan audit/)
  assert.match((await agent.handle({ ...ownerLid, text: '/exec Get-Date' })).text, /tidak aktif/)
  assert.equal(executed.length, 0)

  database.saveAuditLog = async () => {}
  assert.match((await agent.handle({ ...ownerLid, text: '/godmode' })).text, /Godmode aktif/)
  assert.equal((await agent.handle({ ...ownerLid, text: '/exec Get-Date' })).text, 'OK')
  assert.equal(executed.length, 1)

  database.saveAuditLog = async () => { throw new Error('database offline') }
  await assert.rejects(() => agent.handle({ ...ownerLid, text: '/exec Get-Date' }), /Gagal menyimpan audit/)
  assert.equal(executed.length, 1)
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
