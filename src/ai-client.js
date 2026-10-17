const OpenAI = require('openai')

function sdkBaseUrl(baseUrl) {
  const url = new URL(baseUrl || 'https://api.howtofix.id/v1')
  url.pathname = url.pathname.replace(/\/chat\/completions\/?$/, '').replace(/\/+$/, '')
  return url.toString().replace(/\/$/, '')
}

function aiError(error, model) {
  if (error?.status === 401) {
    return new Error('Token AI ditolak (401). Isi HF_TOKEN di .env dengan API key HowToFix dari Console > Tokens yang berawalan sk-. Access token untuk verifikasi akun tidak dapat dipakai sebagai API key.')
  }
  if (error?.status === 403) {
    const reason = error?.error || error
    const details = `${reason?.code || ''} ${reason?.message || ''} ${error?.message || ''}`
    if (/verification_required|not finished verification|bind your discord account/i.test(details)) {
      return new Error('Gateway HowToFix mengembalikan verification_required (403). Periksa Account Bindings di https://howtofix.id/security. Jika sudah terhubung, pastikan API key berasal dari akun yang sama dan hubungi dukungan HowToFix dengan request ID dari Usage Logs.')
    }
    return new Error(`Token AI tidak diizinkan mengakses model ${model} (403). Periksa model yang tersedia untuk token melalui GET /v1/models dan daftar izin token di konsol HowToFix.`)
  }
  if (Number.isInteger(error?.status)) {
    return new Error(`Layanan AI mengembalikan status ${error.status} untuk model ${model}. Periksa akses model dan kondisi layanan HowToFix.`)
  }
  return error
}

function createAIClient({ apiKey, baseUrl, model, systemPrompt, timeoutMs, fetchImpl }) {
  const client = new OpenAI({
    apiKey,
    baseURL: sdkBaseUrl(baseUrl),
    timeout: timeoutMs,
    maxRetries: 0,
    ...(fetchImpl ? { fetch: fetchImpl } : {})
  })

  async function chat(history, options = {}) {
    const body = {
      model,
      messages: [{ role: 'system', content: options.systemPrompt || systemPrompt }, ...history],
      stream: false
    }
    if (options.tools?.length) {
      body.tools = options.tools
      body.tool_choice = 'auto'
    }

    let completion
    try {
      completion = await client.chat.completions.create(body)
    } catch (error) {
      throw aiError(error, model)
    }

    const message = completion?.choices?.[0]?.message
    if (message?.tool_calls?.length) {
      const toolCalls = message.tool_calls.map((call) => {
        if (!call?.function?.name) throw new Error('Model AI mengembalikan nama tool yang tidak valid')
        let argumentsValue
        try {
          argumentsValue = typeof call.function.arguments === 'string'
            ? JSON.parse(call.function.arguments || '{}')
            : (call.function.arguments || {})
        } catch {
          throw new Error('Model AI mengembalikan argumen tool yang tidak valid')
        }
        if (!argumentsValue || typeof argumentsValue !== 'object' || Array.isArray(argumentsValue)) {
          throw new Error('Model AI mengembalikan argumen tool yang tidak valid')
        }
        return { id: call.id, name: call.function.name, arguments: argumentsValue }
      })
      return { toolCalls, toolCall: toolCalls[0], text: typeof message.content === 'string' ? message.content.trim() : '' }
    }

    const content = message?.content?.trim()
    if (!content) throw new Error('Model AI tidak mengembalikan jawaban')
    return { text: content }
  }

  async function reply(history, options) {
    const result = await chat(history, options)
    if (!result.text) throw new Error('Model AI meminta tool pada mode jawaban teks')
    return result.text
  }

  return { chat, reply }
}

module.exports = { createAIClient, sdkBaseUrl }
