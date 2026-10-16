const test = require('node:test')
const assert = require('node:assert/strict')
const { createDeepSeekClient } = require('../src/deepseek')

test('mengirim konteks dan mengembalikan jawaban DeepSeek', async () => {
  let request
  const client = createDeepSeekClient({
    apiKey: 'rahasia',
    apiUrl: 'https://example.test/chat',
    model: 'model-test',
    systemPrompt: 'Bantu pengguna',
    timeoutMs: 1_000,
    fetchImpl: async (url, options) => {
      request = { url, options }
      return {
        ok: true,
        json: async () => ({ choices: [{ message: { content: ' Jawaban bot ' } }] })
      }
    }
  })

  const answer = await client.reply([{ role: 'user', content: 'Halo' }])
  const body = JSON.parse(request.options.body)

  assert.equal(answer, 'Jawaban bot')
  assert.equal(request.options.headers.Authorization, 'Bearer rahasia')
  assert.deepEqual(body.messages, [
    { role: 'system', content: 'Bantu pengguna' },
    { role: 'user', content: 'Halo' }
  ])
})

test('menolak respons DeepSeek yang gagal', async () => {
  const client = createDeepSeekClient({
    apiKey: 'token',
    apiUrl: 'https://example.test/chat',
    model: 'model-test',
    systemPrompt: 'Prompt',
    timeoutMs: 1_000,
    fetchImpl: async () => ({ ok: false, status: 429 })
  })

  await assert.rejects(() => client.reply([]), /status 429/)
})
