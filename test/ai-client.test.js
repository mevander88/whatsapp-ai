const test = require('node:test')
const assert = require('node:assert/strict')
const { createAIClient, sdkBaseUrl } = require('../src/ai-client')

function sdkResponse(body, status = 200) {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  })
}

function createClient(fetchImpl, overrides = {}) {
  return createAIClient({
    apiKey: 'token-rahasia',
    baseUrl: 'https://example.test/v1/chat/completions',
    model: 'deepseek-v4.1-flash',
    systemPrompt: 'Bantu pengguna',
    timeoutMs: 1_000,
    fetchImpl,
    ...overrides
  })
}

test('OpenAI SDK memakai base URL penyedia, secret key, model, dan riwayat', async () => {
  let request
  const client = createClient(async (url, options) => {
    request = { url: String(url), options }
    return sdkResponse({ choices: [{ message: { content: ' Jawaban bot ' } }] })
  })

  const answer = await client.reply([{ role: 'user', content: 'Halo' }])
  const body = JSON.parse(request.options.body)

  assert.equal(answer, 'Jawaban bot')
  assert.equal(sdkBaseUrl('https://api.rindri.com/v1/chat/completions'), 'https://api.rindri.com/v1')
  assert.equal(request.url, 'https://example.test/v1/chat/completions')
  assert.equal(new Headers(request.options.headers).get('authorization'), 'Bearer token-rahasia')
  assert.equal(body.model, 'deepseek-v4.1-flash')
  assert.deepEqual(body.messages, [
    { role: 'system', content: 'Bantu pengguna' },
    { role: 'user', content: 'Halo' }
  ])
})

test('OpenAI SDK mengirim definisi tool dan membaca tool call terstruktur', async () => {
  let body
  const client = createClient(async (_url, options) => {
    body = JSON.parse(options.body)
    return sdkResponse({
      choices: [{ message: {
        tool_calls: [{ id: 'call-1', function: { name: 'get_system_info', arguments: '{"detail":true}' } }]
      } }]
    })
  })
  const tools = [{ type: 'function', function: { name: 'get_system_info', parameters: { type: 'object', properties: {} } } }]

  assert.deepEqual(await client.chat([], { tools }), {
    toolCalls: [{ id: 'call-1', name: 'get_system_info', arguments: { detail: true } }],
    toolCall: { id: 'call-1', name: 'get_system_info', arguments: { detail: true } },
    text: ''
  })
  assert.deepEqual(body.tools, tools)
  assert.equal(body.tool_choice, 'auto')
})

test('OpenAI SDK mempertahankan semua tool call dalam satu respons model', async () => {
  const client = createClient(async () => sdkResponse({ choices: [{ message: { tool_calls: [
    { id: 'call-1', function: { name: 'web_search', arguments: '{"query":"Node.js"}' } },
    { id: 'call-2', function: { name: 'browser_open', arguments: '{"url":"https://nodejs.org"}' } }
  ] } }] }))
  const result = await client.chat([])
  assert.deepEqual(result.toolCalls.map((call) => call.name), ['web_search', 'browser_open'])
  assert.deepEqual(result.toolCalls.map((call) => call.id), ['call-1', 'call-2'])
})

test('respons gagal dari SDK menunjukkan status tanpa membocorkan token', async () => {
  const client = createClient(async () => sdkResponse({ error: { message: 'Rate limited' } }, 429))
  await assert.rejects(() => client.reply([]), (error) => {
    assert.match(error.message, /status 429/)
    assert.equal(error.message.includes('token-rahasia'), false)
    return true
  })
})

test('secret key ditolak menghasilkan diagnosis aman', async () => {
  const client = createClient(async () => sdkResponse({ error: { message: 'Unauthorized' } }, 401))
  await assert.rejects(() => client.reply([]), /Secret key AI ditolak \(401\).*apikey.txt/)
})

test('403 memberi diagnosis penyedia tanpa asumsi verifikasi akun', async () => {
  const client = createClient(async () => sdkResponse({
    error: { code: 'verification_required', message: 'account is not verified' }
  }, 403))
  await assert.rejects(() => client.reply([]), (error) => {
    assert.match(error.message, /Akses API AI ditolak \(403\)/)
    assert.match(error.message, /Periksa izin akun dan model/)
    assert.equal(error.message.includes('token-rahasia'), false)
    return true
  })
})

test('403 dengan pembatasan model tetap aman', async () => {
  const client = createClient(async () => sdkResponse({ error: { code: 'model_forbidden' } }, 403))
  await assert.rejects(() => client.reply([]), /model deepseek-v4.1-flash/)
})
