const test = require('node:test')
const assert = require('node:assert/strict')
const { createMcpTools, parseMcpServers } = require('../src/mcp-tools')

test('konfigurasi MCP hanya menerima server HTTPS atau localhost', () => {
  assert.throws(() => parseMcpServers('[{"name":"bad","url":"http://example.com/mcp"}]'), /HTTPS/)
  assert.throws(() => parseMcpServers('[{"name":"bad","url":"https://example.com/mcp?token=secret"}]'), /HTTPS/)
  assert.equal(parseMcpServers('[{"name":"test","url":"https://example.com/mcp"}]')[0].name, 'test')
})

test('tool MCP yang diumumkan server tersedia dan dipanggil dengan argumen', async () => {
  let called
  class FakeClient {
    async connect() {}
    async listTools() { return { tools: [{ name: 'find', description: 'Cari data', inputSchema: { type: 'object', properties: { query: { type: 'string' } } } }] } }
    async callTool(args) { called = args; return { content: [{ type: 'text', text: 'Ditemukan' }] } }
    async close() {}
  }
  const mcp = createMcpTools({ servers: [{ name: 'network', url: 'https://example.com/mcp', headers: {} }], clientClass: FakeClient, transportClass: class {} })
  const definitions = await mcp.definitions()
  assert.equal(definitions.some((item) => item.function.name === 'mcp_network_find'), true)
  const result = await mcp.execute('mcp_call_tool', { server: 'network', name: 'find', arguments: { query: 'apa' } })
  assert.deepEqual(called, { name: 'find', arguments: { query: 'apa' } })
  assert.match(result.response.text, /Ditemukan/)
  await mcp.close()
})

test('server MCP SSE lama dipakai ketika endpoint menolak Streamable HTTP', async () => {
  let attempts = 0
  class FakeClient {
    async connect() { attempts += 1; if (attempts === 1) throw new Error('HTTP 405 Method Not Allowed') }
    async listTools() { return { tools: [{ name: 'lookup', inputSchema: { type: 'object', properties: {} } }] } }
    async close() {}
  }
  const mcp = createMcpTools({ servers: [{ name: 'legacy', url: 'https://example.com/sse', headers: {} }], clientClass: FakeClient, transportClass: class {}, sseTransportClass: class {} })
  const definitions = await mcp.definitions()
  assert.equal(attempts, 2)
  assert.equal(definitions.some((item) => item.function.name === 'mcp_legacy_lookup'), true)
  await mcp.close()
})

test('model hanya melihat tool MCP yang relevan dan dapat menemukan sisanya lewat daftar', async () => {
  class FakeClient {
    async connect() {}
    async listTools() {
      return { tools: [
        ...Array.from({ length: 20 }, (_, index) => ({ name: `unrelated_${index}`, description: 'Manage unrelated records', inputSchema: { type: 'object', properties: {} } })),
        { name: 'find_calendar', description: 'Find calendar events', inputSchema: { type: 'object', properties: {} } }
      ] }
    }
    async close() {}
  }
  const mcp = createMcpTools({ servers: [{ name: 'personal', url: 'https://example.com/mcp', headers: {} }], clientClass: FakeClient, transportClass: class {} })
  const definitions = await mcp.definitions({ query: 'find calendar events' })
  const names = definitions.map((item) => item.function.name)
  assert.ok(names.includes('mcp_personal_find_calendar'))
  assert.ok(names.includes('mcp_list_tools'))
  assert.ok(!names.includes('mcp_personal_unrelated_0'))
  assert.ok(names.length <= 15)
  await mcp.close()
})
