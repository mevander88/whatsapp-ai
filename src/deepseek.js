function createDeepSeekClient({ apiKey, apiUrl, model, systemPrompt, timeoutMs, fetchImpl = globalThis.fetch }) {
  if (typeof fetchImpl !== 'function') {
    throw new Error('Versi Node.js ini belum menyediakan fetch')
  }

  async function reply(history) {
    const response = await fetchImpl(apiUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'system', content: systemPrompt }, ...history],
        stream: false
      }),
      signal: AbortSignal.timeout(timeoutMs)
    })

    if (!response.ok) {
      throw new Error(`DeepSeek mengembalikan status ${response.status}`)
    }

    const data = await response.json()
    const content = data?.choices?.[0]?.message?.content?.trim()

    if (!content) {
      throw new Error('DeepSeek tidak mengembalikan jawaban')
    }

    return content
  }

  return { reply }
}

module.exports = { createDeepSeekClient }
