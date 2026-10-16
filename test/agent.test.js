const test = require('node:test')
const assert = require('node:assert/strict')
const { createAgent, parseDecision } = require('../src/agent')

function fixture(aiResult) {
  const calls = { pending: [], audit: [], execute: [], aiOptions: [] }
  const database = {
    createPendingAction: async (value) => calls.pending.push(value),
    resolvePendingAction: async () => null,
    saveAuditLog: async (value) => calls.audit.push(value)
  }
  const computerTools = {
    definitions: [{ type: 'function', function: { name: 'get_system_info' } }],
    has: (name) => name === 'get_system_info',
    describe: () => 'membaca informasi sistem',
    validate: (_name, args) => args,
    execute: async (...args) => {
      calls.execute.push(args)
      return { type: 'data', data: { hostname: 'PC' } }
    }
  }
  const responseTools = {
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

test('parseDecision membaca tombol dan fallback teks', () => {
  assert.deepEqual(parseDecision('agent:approve:abcdef123456'), { decision: 'approved', token: 'abcdef123456' })
  assert.deepEqual(parseDecision('TOLAK abcdef123456'), { decision: 'rejected', token: 'abcdef123456' })
})
