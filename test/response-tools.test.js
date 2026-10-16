const test = require('node:test')
const assert = require('node:assert/strict')
const { createResponseTools } = require('../src/response-tools')

test('membuat respons tombol yang sudah divalidasi', () => {
  const tools = createResponseTools()
  const response = tools.execute('send_buttons', {
    text: 'Pilih tindakan',
    options: [{ id: 'lanjut', label: 'Lanjut' }]
  })

  assert.equal(response.type, 'buttons')
  assert.deepEqual(response.options, [{ id: 'lanjut', label: 'Lanjut' }])
})

test('menolak polling tanpa pilihan yang cukup', () => {
  const tools = createResponseTools()
  assert.throws(() => tools.execute('send_poll', { question: 'Pilih?', options: ['Satu'] }), /minimal dua/)
})
