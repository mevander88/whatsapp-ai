const OpenAI = require('openai')

function sdkBaseUrl(baseUrl) {
  const url = new URL(baseUrl)
  url.pathname = url.pathname.replace(/\/chat\/completions\/?$/, '').replace(/\/+$/, '')
  return url.toString().replace(/\/$/, '')
}

function aiError(error, model) {
  if (error?.status === 401) {
    return new Error('Secret key AI ditolak (401). Periksa baris pertama apikey.txt.')
  }
  if (error?.status === 403) {
    return new Error(`Akses API AI ditolak (403) untuk model ${model}. Periksa izin akun dan model pada penyedia API.`)
  }
  if (Number.isInteger(error?.status)) {
    return new Error(`Layanan AI mengembalikan status ${error.status} untuk model ${model}. Periksa ID model, izin akses, dan kondisi penyedia API.`)
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
