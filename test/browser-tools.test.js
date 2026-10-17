const test = require('node:test')
const assert = require('node:assert/strict')
const { createBrowserTools, safeUrl } = require('../src/browser-tools')

test('browser hanya membuka alamat HTTP dan HTTPS', () => {
  assert.throws(() => safeUrl('file:///C:/Users/example/.env'), /HTTP/)
  assert.equal(safeUrl('https://example.com/page'), 'https://example.com/page')
})

test('pencarian beralih ke Bing ketika Google meminta verifikasi dan hasilnya dibaca', async () => {
  let currentUrl = ''
  const visited = []
  const page = {
    isClosed: () => false,
    goto: async (url) => { currentUrl = url; visited.push(url) },
    url: () => currentUrl.includes('google.com') ? 'https://www.google.com/sorry/' : currentUrl,
    locator: () => ({ innerText: async () => 'Our systems have detected unusual traffic', ariaSnapshot: async () => '- link "Node.js":\n  - /url: https://nodejs.org/' }),
    waitForTimeout: async () => {}
  }
  const browser = createBrowserTools({ chromiumImpl: { launch: async () => ({ newContext: async () => ({ setDefaultTimeout: () => {}, newPage: async () => page, close: async () => {} }), close: async () => {} }) } })
  const result = await browser.execute('web_search', { query: 'Node.js docs' })
  const data = JSON.parse(result.response.text)
  assert.equal(data.searchEngine, 'Bing')
  assert.match(data.page, /nodejs.org/)
  assert.equal(visited.length, 2)
  await browser.close()
})

test('pencarian memberi hasil terstruktur agar agent dapat memilih URL', async () => {
  let currentUrl = ''
  const page = {
    isClosed: () => false,
    goto: async (url) => { currentUrl = url },
    url: () => currentUrl,
    locator: () => ({ innerText: async () => 'Hasil pencarian', ariaSnapshot: async () => '' }),
    evaluate: async () => [{ title: 'Node.js Documentation', url: 'https://nodejs.org/docs/latest/api/', snippet: 'Official API reference' }]
  }
  const browser = createBrowserTools({ chromiumImpl: { launch: async () => ({ newContext: async () => ({ setDefaultTimeout: () => {}, newPage: async () => page, close: async () => {} }), close: async () => {} }) } })
  const response = JSON.parse((await browser.execute('web_search', { query: 'Node.js docs' })).response.text)
  assert.deepEqual(response.results, [{ title: 'Node.js Documentation', url: 'https://nodejs.org/docs/latest/api/', snippet: 'Official API reference' }])
  assert.equal(response.page, undefined)
  await browser.close()
})

test('pencarian menunggu navigasi ulang sebelum membaca hasil', async () => {
  let currentUrl = ''
  let evaluations = 0
  const page = {
    isClosed: () => false,
    goto: async (url) => { currentUrl = url },
    url: () => currentUrl,
    locator: () => ({ innerText: async () => 'Hasil pencarian', ariaSnapshot: async () => '' }),
    waitForTimeout: async () => {},
    evaluate: async () => {
      evaluations += 1
      if (evaluations === 1) throw new Error('Execution context was destroyed')
      return [{ title: 'Node.js', url: 'https://nodejs.org/', snippet: 'Official site' }]
    }
  }
  const browser = createBrowserTools({ chromiumImpl: { launch: async () => ({ newContext: async () => ({ setDefaultTimeout: () => {}, newPage: async () => page, close: async () => {} }), close: async () => {} }) } })
  const result = JSON.parse((await browser.execute('web_search', { query: 'Node.js' })).response.text)
  assert.equal(evaluations, 2)
  assert.equal(result.results[0].url, 'https://nodejs.org/')
  await browser.close()
})
