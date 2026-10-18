const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { createBrowserTools, safeUrl } = require('../src/browser-tools')

test('browser hanya membuka alamat HTTP dan HTTPS', () => {
  assert.throws(() => safeUrl('file:///C:/Users/example/.env'), /HTTP/)
  assert.throws(() => safeUrl('https://user:password@example.com/'), /kredensial/)
  assert.equal(safeUrl('https://example.com/page'), 'https://example.com/page')
})

test('source web mentah dapat dibaca per bagian dan dicari tanpa membuka browser', async () => {
  const html = '<html><body>' + 'x'.repeat(6_500) + '<div>Harga: 12000</div></body></html>'
  let fetchCount = 0
  const browser = createBrowserTools({
    chromiumImpl: { launch: async () => { throw new Error('Browser tidak perlu dibuka') } },
    fetchImpl: async (url, options) => {
      assert.equal(url, 'https://example.com/products')
      assert.equal(options.headers.Cookie, undefined)
      fetchCount += 1
      return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } })
    }
  })

  const first = JSON.parse((await browser.execute('web_fetch_source', { url: 'https://example.com/products' })).response.text)
  assert.equal(first.source.length, 6_000)
  assert.equal(first.offset, 0)
  assert.equal(first.nextOffset, 6_000)
  assert.equal(first.truncatedBySize, false)

  const located = JSON.parse((await browser.execute('web_fetch_source', { url: 'https://example.com/products', find: 'Harga' })).response.text)
  assert.equal(located.found, true)
  assert.match(located.source, /Harga: 12000/)
  assert.equal(fetchCount, 1)

  const rest = JSON.parse((await browser.execute('web_fetch_source', { url: 'https://example.com/products', offset: first.nextOffset })).response.text)
  assert.match(rest.source, /Harga: 12000/)
  assert.equal(rest.nextOffset, null)
  await browser.close()
})

test('source web menolak konten biner dan membatasi unduhan besar', async () => {
  const browser = createBrowserTools({
    fetchImpl: async () => new Response(Buffer.from([0, 1, 2]), { headers: { 'content-type': 'image/png' } })
  })
  await assert.rejects(() => browser.execute('web_fetch_source', { url: 'https://example.com/image.png' }), /bukan HTML/)
  await assert.rejects(() => browser.execute('web_fetch_source', { url: 'https://example.com/', offset: -1 }), /Offset/)
  await browser.close()

  const large = createBrowserTools({
    fetchImpl: async () => new Response('a'.repeat(2_097_300), { headers: { 'content-type': 'text/html' } })
  })
  const result = JSON.parse((await large.execute('web_fetch_source', { url: 'https://example.com/large' })).response.text)
  assert.equal(result.truncatedBySize, true)
  assert.equal(result.capturedChars, 2_097_152)
  await large.close()
})

test('pencarian gambar mengembalikan URL gambar dan halaman sumber', async () => {
  let currentUrl = ''
  const page = {
    isClosed: () => false,
    goto: async (url) => { currentUrl = url },
    evaluate: async () => [{ title: 'Kucing oranye', imageUrl: 'https://cdn.example/cat.jpg', sourceUrl: 'https://example.com/cat' }]
  }
  const browser = createBrowserTools({ chromiumImpl: { launch: async () => ({ newContext: async () => ({ setDefaultTimeout: () => {}, newPage: async () => page, close: async () => {} }), close: async () => {} }) } })
  const result = JSON.parse((await browser.execute('web_image_search', { query: 'kucing oranye' })).response.text)
  assert.match(currentUrl, /bing\.com\/images\/search/)
  assert.deepEqual(result.results, [{ title: 'Kucing oranye', imageUrl: 'https://cdn.example/cat.jpg', sourceUrl: 'https://example.com/cat' }])
  await browser.close()
})

test('gambar web divalidasi, disiapkan sebagai media, dan dapat dibersihkan', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'wa-ai-web-media-'))
  const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(32, 1)])
  const browser = createBrowserTools({
    mediaDirectory: directory,
    maxMediaBytes: 100,
    fetchImpl: async () => new Response(jpeg, { headers: { 'content-type': 'image/jpeg', 'content-length': String(jpeg.length) } })
  })
  try {
    const response = (await browser.execute('web_download_image', {
      url: 'https://cdn.example/cat.jpg',
      sourceUrl: 'https://example.com/cat',
      caption: 'Kucing oranye'
    })).response
    assert.equal(response.type, 'image')
    assert.equal(response.generatedFile, true)
    assert.match(response.caption, /Sumber: https:\/\/example\.com\/cat/)
    assert.deepEqual(await fs.readFile(response.filePath), jpeg)
    await browser.cleanupGeneratedFile(response.filePath)
    await assert.rejects(() => fs.stat(response.filePath), /ENOENT/)
  } finally {
    await browser.close()
    await fs.rm(directory, { recursive: true, force: true })
  }
})

test('unduhan gambar menolak file palsu dan file di atas batas', async () => {
  const invalid = createBrowserTools({ fetchImpl: async () => new Response('bukan gambar') })
  await assert.rejects(() => invalid.execute('web_download_image', { url: 'https://example.com/fake.jpg', sourceUrl: 'https://example.com/page' }), /bukan gambar/)
  await invalid.close()

  const oversized = createBrowserTools({ maxMediaBytes: 4, fetchImpl: async () => new Response(Buffer.from([0xff, 0xd8, 0xff, 1, 2])) })
  await assert.rejects(() => oversized.execute('web_download_image', { url: 'https://example.com/large.jpg', sourceUrl: 'https://example.com/page' }), /melebihi batas/)
  await oversized.close()
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

test('browser mengisi dan submit formulir lengkap lalu memeriksa halaman', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'wa-ai-browser-form-'))
  const uploadPath = path.join(directory, 'lampiran.txt')
  await fs.writeFile(uploadPath, 'lampiran')
  const actions = []
  const target = (name) => ({
    count: async () => 1,
    fill: async (value) => actions.push(['fill', name, value]),
    selectOption: async (value) => actions.push(['select', name, value]),
    check: async () => actions.push(['check', name]),
    uncheck: async () => actions.push(['uncheck', name]),
    setInputFiles: async (value) => actions.push(['upload', name, value]),
    click: async () => actions.push(['click', name])
  })
  const page = {
    isClosed: () => false,
    url: () => 'https://example.com/form',
    title: async () => 'Form',
    evaluate: async () => 'Form berhasil dikirim',
    locator: (selector) => selector === 'body'
      ? { ariaSnapshot: async () => '- heading "Form"', innerText: async () => 'Form berhasil dikirim' }
      : target('submit-default'),
    getByRole: (role, { name }) => target(`${role}:${name}`),
    getByLabel: (name) => target(`file:${name}`),
    waitForLoadState: async () => actions.push(['loaded'])
  }
  const context = { setDefaultTimeout: () => {}, newPage: async () => page, pages: () => [page], close: async () => {} }
  const browser = createBrowserTools({
    maxMediaBytes: 1_024,
    chromiumImpl: { launch: async () => ({ newContext: async () => context, close: async () => {} }) }
  })

  try {
    await browser.execute('browser_fill', { name: 'Nama', text: 'Evan' })
    await browser.execute('browser_select_option', { name: 'Negara', option: 'Indonesia' })
    await browser.execute('browser_set_checkbox', { name: 'Setuju', checked: true })
    await browser.execute('browser_upload_file', { name: 'Lampiran', path: uploadPath })
    const submitted = await browser.execute('browser_submit_form', { buttonName: 'Kirim' })

    assert.deepEqual(actions.slice(0, 5), [
      ['fill', 'textbox:Nama', 'Evan'],
      ['select', 'combobox:Negara', { label: 'Indonesia' }],
      ['check', 'checkbox:Setuju'],
      ['upload', 'file:Lampiran', path.resolve(uploadPath)],
      ['click', 'button:Kirim']
    ])
    assert.match(submitted.response.text, /Formulir disubmit/)
    assert.match(submitted.response.text, /Form berhasil dikirim/)
  } finally {
    await browser.close()
    await fs.rm(directory, { recursive: true, force: true })
  }
})

test('browser memakai satu profil persisten dan halaman aktif yang sama', async () => {
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'wa-ai-browser-profile-'))
  let launches = 0
  let currentUrl = 'about:blank'
  const page = {
    isClosed: () => false,
    goto: async (url) => { currentUrl = url },
    url: () => currentUrl,
    title: async () => 'Browser Agent',
    evaluate: async () => 'Halaman aktif',
    locator: () => ({ ariaSnapshot: async () => '- heading "Aktif"', innerText: async () => 'Halaman aktif' })
  }
  const context = {
    pages: () => [page],
    newPage: async () => page,
    setDefaultTimeout: () => {},
    close: async () => {}
  }
  const browser = createBrowserTools({
    userDataDir: profile,
    chromiumImpl: {
      launchPersistentContext: async (directory) => {
        launches += 1
        assert.equal(directory, path.resolve(profile))
        return context
      }
    }
  })
  try {
    await browser.execute('browser_open', { url: 'https://example.com/one' })
    await browser.execute('browser_inspect', {})
    await browser.execute('browser_open', { url: 'https://example.com/two' })
    assert.equal(launches, 1)
    assert.equal(currentUrl, 'https://example.com/two')
  } finally {
    await browser.close()
    await fs.rm(profile, { recursive: true, force: true })
  }
})
