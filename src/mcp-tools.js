const { Client } = require('@modelcontextprotocol/sdk/client/index.js')
const { StreamableHTTPClientTransport } = require('@modelcontextprotocol/sdk/client/streamableHttp.js')
const { SSEClientTransport } = require('@modelcontextprotocol/sdk/client/sse.js')
const { redactSecrets } = require('./security')

const MCP_STATIC_DEFINITIONS = [
  { name: 'mcp_status', description: 'Lihat server MCP jaringan yang dikonfigurasi dan status koneksinya.', properties: {}, required: [] },
  { name: 'mcp_list_tools', description: 'Lihat daftar lengkap tool yang disediakan satu server MCP terhubung.', properties: { server: { type: 'string' } }, required: ['server'] },
  { name: 'mcp_call_tool', description: 'Jalankan tool MCP yang tercantum dalam mcp_list_tools pada server terhubung.', properties: { server: { type: 'string' }, name: { type: 'string' }, arguments: { type: 'object', additionalProperties: true } }, required: ['server', 'name'], additionalProperties: false },
  { name: 'mcp_list_resources', description: 'Daftar resource yang tersedia pada satu server MCP terhubung.', properties: { server: { type: 'string' } }, required: ['server'] },
  { name: 'mcp_read_resource', description: 'Baca satu resource MCP berdasarkan URI yang muncul dari mcp_list_resources.', properties: { server: { type: 'string' }, uri: { type: 'string' } }, required: ['server', 'uri'] },
  { name: 'mcp_list_prompts', description: 'Lihat daftar prompt pada satu server MCP terhubung.', properties: { server: { type: 'string' } }, required: ['server'] },
  { name: 'mcp_get_prompt', description: 'Baca prompt MCP berdasarkan nama yang muncul dari mcp_list_prompts.', properties: { server: { type: 'string' }, name: { type: 'string' }, arguments: { type: 'object', additionalProperties: true } }, required: ['server', 'name'] }
].map(({ name, description, properties, required }) => ({ type: 'function', function: { name, description, parameters: { type: 'object', properties, required, additionalProperties: false } } }))

function parseMcpServers(value) {
  if (!value?.trim()) return []
  let parsed
  try { parsed = JSON.parse(value) } catch { throw new Error('MCP_SERVERS_JSON harus berupa JSON yang valid') }
  if (!Array.isArray(parsed) || parsed.length > 10) throw new Error('MCP_SERVERS_JSON harus berupa daftar maksimal 10 server')
  const names = new Set()
  return parsed.map((item) => {
    if (!item || typeof item.name !== 'string' || !/^[a-z][a-z0-9_]{0,23}$/.test(item.name) || names.has(item.name)) throw new Error('Nama server MCP tidak valid atau duplikat')
    names.add(item.name)
    let url
    try { url = new URL(item.url) } catch { throw new Error(`URL server MCP ${item.name} tidak valid`) }
    if (url.username || url.password || url.search || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))) {
      throw new Error(`Server MCP ${item.name} harus memakai HTTPS atau HTTP localhost`)
    }
    if (item.headers !== undefined && (typeof item.headers !== 'object' || Array.isArray(item.headers) || Object.entries(item.headers).some(([key, entry]) => !/^[\w-]+$/.test(key) || typeof entry !== 'string'))) {
      throw new Error(`Header server MCP ${item.name} tidak valid`)
    }
    return { name: item.name, url: url.toString(), headers: item.headers || {} }
  })
}

function toolName(serverName, name) {
  const suffix = String(name).replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 34)
  return `mcp_${serverName}_${suffix}`.slice(0, 64)
}

function createMcpTools({ servers = [], imageReader, clientClass = Client, transportClass = StreamableHTTPClientTransport, sseTransportClass = SSEClientTransport } = {}) {
  const connections = new Map()
  const remoteTools = new Map()
  const serverTools = new Map()
  const errors = new Map()
  let lastAttempt = 0
  let refreshPromise

  async function refresh() {
    if (refreshPromise) return refreshPromise
    if (!servers.length || (lastAttempt && Date.now() - lastAttempt < 60_000)) return
    lastAttempt = Date.now()
    refreshPromise = Promise.allSettled(servers.filter((server) => !connections.has(server.name)).map(async (server) => {
      let client = new clientClass({ name: 'wa-ai', version: '1.0.0' })
      const connect = async (transport) => {
        await client.connect(transport, { timeout: 10_000 })
        return client.listTools(undefined, { timeout: 10_000 })
      }
      try {
        let listing
        try {
          listing = await connect(new transportClass(new URL(server.url), { requestInit: { headers: server.headers } }))
        } catch (error) {
          await client.close().catch(() => {})
          if (!/404|405|not found|method not allowed|unsupported/i.test(String(error.message || error))) throw error
          client = new clientClass({ name: 'wa-ai', version: '1.0.0' })
          const eventSourceInit = { fetch: (url, init) => {
            const headers = new Headers(init.headers)
            for (const [key, value] of Object.entries(server.headers)) headers.set(key, value)
            return fetch(url, { ...init, headers })
          } }
          listing = await connect(new sseTransportClass(new URL(server.url), { eventSourceInit, requestInit: { headers: server.headers } }))
        }
        const { tools } = listing
        connections.set(server.name, client)
        errors.delete(server.name)
        serverTools.set(server.name, tools)
        for (const remote of tools) {
          const exposedName = toolName(server.name, remote.name)
          if (remoteTools.has(exposedName)) continue
          remoteTools.set(exposedName, { server: server.name, name: remote.name, description: remote.description || '', schema: remote.inputSchema })
        }
      } catch (error) {
        errors.set(server.name, String(error.message || error).slice(0, 300))
        await client.close().catch(() => {})
      }
    })).finally(() => { refreshPromise = undefined })
    await refreshPromise
  }

  async function definitions({ query } = {}) {
    await refresh()
    if (!servers.length) return []
    const terms = String(query || '').toLowerCase().match(/[a-z0-9_]{3,}/g) || []
    const candidates = [...remoteTools.entries()].map(([name, remote]) => {
      const description = `${remote.server} ${remote.name} ${remote.description}`.toLowerCase()
      return { name, remote, score: terms.reduce((total, term) => total + (description.includes(term) ? 1 : 0), 0) }
    })
    const selected = (terms.length ? candidates.filter((item) => item.score > 0) : candidates)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
    return [
      ...MCP_STATIC_DEFINITIONS,
      ...selected.map(({ name, remote }) => ({
        type: 'function',
        function: {
          name,
          description: `MCP ${remote.server}: ${remote.description}`.slice(0, 1_000),
          parameters: remote.schema?.type === 'object' ? remote.schema : { type: 'object', properties: {}, additionalProperties: true }
        }
      }))
    ]
  }

  function has(name) { return (servers.length || name === 'mcp_status') && (MCP_STATIC_DEFINITIONS.some((item) => item.function.name === name) || remoteTools.has(name)) }

  async function asText(result) {
    const content = []
    for (const item of result.content || result.contents || []) {
      if (item.type === 'image' && item.data && imageReader?.analyze) {
        try { content.push({ type: 'image_analysis', result: await imageReader.analyze(Buffer.from(item.data, 'base64')) }) } catch (error) { content.push({ type: 'image_error', message: error.message }) }
      } else if (item.blob && item.mimeType?.startsWith('image/') && imageReader?.analyze) {
        try { content.push({ type: 'image_analysis', result: await imageReader.analyze(Buffer.from(item.blob, 'base64')) }) } catch (error) { content.push({ type: 'image_error', message: error.message }) }
      } else if (item.type === 'text') {
        content.push({ type: 'text', text: item.text })
      } else if (typeof item.text === 'string') {
        content.push({ uri: item.uri, text: item.text })
      } else {
        content.push({ type: item.type || 'binary', uri: item.uri, mimeType: item.mimeType })
      }
    }
    return redactSecrets(JSON.stringify({ isError: result.isError || false, content, structuredContent: result.structuredContent }).slice(0, 16_000))
  }

  async function execute(name, args = {}) {
    await refresh()
    if (name === 'mcp_status') {
      return { type: 'response', response: { type: 'text', text: redactSecrets(JSON.stringify(servers.map((server) => ({ name: server.name, connected: connections.has(server.name), tools: serverTools.get(server.name)?.length || 0, error: errors.get(server.name) || null })))) } }
    }
    if (name === 'mcp_list_tools') {
      if (!serverTools.has(args.server)) throw new Error('Server MCP tidak terhubung')
      return { type: 'response', response: { type: 'text', text: redactSecrets(JSON.stringify(serverTools.get(args.server).map((tool) => ({ name: tool.name, description: tool.description, inputSchema: tool.inputSchema }))).slice(0, 16_000)) } }
    }
    if (['mcp_list_resources', 'mcp_read_resource', 'mcp_list_prompts', 'mcp_get_prompt'].includes(name)) {
      const client = connections.get(args.server)
      if (!client) throw new Error('Server MCP tidak terhubung')
      const result = name === 'mcp_list_resources' ? await client.listResources(undefined, { timeout: 15_000 })
        : name === 'mcp_read_resource' ? await client.readResource({ uri: String(args.uri || '') }, { timeout: 15_000 })
          : name === 'mcp_list_prompts' ? await client.listPrompts(undefined, { timeout: 15_000 })
            : await client.getPrompt({ name: String(args.name || ''), arguments: args.arguments || {} }, { timeout: 15_000 })
      const output = name === 'mcp_read_resource' ? await asText(result) : redactSecrets(JSON.stringify(result).slice(0, 16_000))
      return { type: 'response', response: { type: 'text', text: output } }
    }
    const remote = name === 'mcp_call_tool'
      ? { server: args.server, name: args.name }
      : remoteTools.get(name)
    if (!remote) throw new Error('Tool MCP tidak tersedia')
    if (!(serverTools.get(remote.server) || []).some((tool) => tool.name === remote.name)) throw new Error('Tool MCP tidak tersedia pada server ini')
    const client = connections.get(remote.server)
    if (!client) throw new Error('Server MCP tidak terhubung')
    const result = await client.callTool({ name: remote.name, arguments: name === 'mcp_call_tool' ? args.arguments || {} : args }, undefined, { timeout: 30_000 })
    const output = await asText(result)
    return { type: 'response', response: { type: 'text', text: output } }
  }

  async function close() {
    await Promise.allSettled([...connections.values()].map((client) => client.close()))
    connections.clear()
    remoteTools.clear()
    serverTools.clear()
    errors.clear()
    lastAttempt = 0
  }

  return { definitions, has, execute, close }
}

module.exports = { createMcpTools, parseMcpServers, toolName }
