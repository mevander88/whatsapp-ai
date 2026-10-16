function createDeepSeekClient({ apiKey, apiUrl, model, systemPrompt, timeoutMs, fetchImpl = globalThis.fetch }) {
  if (typeof fetchImpl !== 'function') {
    throw new Error('Versi Node.js ini belum menyediakan fetch')
  }

  async function chat(history, options = {}) {
    const requestSystemPrompt = options.systemPrompt || systemPrompt
    const body = {
      model,
      messages: [{ role: 'system', content: requestSystemPrompt }, ...history],
      stream: false
    }

    if (options.tools?.length) {
      body.tools = options.tools
      body.tool_choice = 'auto'
    }

    const response = await fetchImpl(apiUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs)
    })

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Token AI ditolak (401). Periksa HF_TOKEN atau DEEPSEEK_API_KEY serta DEEPSEEK_API_URL di .env.')
      }
      throw new Error(`Layanan AI mengembalikan status ${response.status} untuk model ${model}. Periksa ID model dan aksesnya di penyedia API.`)
    }

    const data = await response.json()
    const message = data?.choices?.[0]?.message
    const toolCall = message?.tool_calls?.[0]

    if (toolCall?.function?.name) {
      let argumentsValue
      try {
        argumentsValue = typeof toolCall.function.arguments === 'string'
          ? JSON.parse(toolCall.function.arguments || '{}')
          : (toolCall.function.arguments || {})
      } catch {
        throw new Error('DeepSeek mengembalikan argumen tool yang tidak valid')
      }

      return {
        toolCall: {
          id: toolCall.id,
          name: toolCall.function.name,
          arguments: argumentsValue
        }
      }
    }

    const content = message?.content?.trim()

    if (!content) {
      throw new Error('DeepSeek tidak mengembalikan jawaban')
    }

    return { text: content }
  }

  async function reply(history, options) {
    const result = await chat(history, options)
    if (!result.text) throw new Error('DeepSeek meminta tool pada mode jawaban teks')
    return result.text
  }

  return { chat, reply }
}

module.exports = { createDeepSeekClient }
