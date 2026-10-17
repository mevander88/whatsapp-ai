const { chromium } = require('playwright-core')

const BROWSER_DEFINITIONS = [
  { name: 'web_search', description: 'Cari informasi di Google dan baca judul, tautan, serta ringkasan hasilnya.', properties: { query: { type: 'string' } }, required: ['query'] },
  { name: 'browser_open', description: 'Buka URL hasil pencarian atau alamat situs pada browser agent, lalu baca isi halaman.', properties: { url: { type: 'string' } }, required: ['url'] },
  { name: 'browser_inspect', description: 'Baca kembali struktur dan teks halaman browser agent yang sedang terbuka.', properties: {}, required: [] },
  { name: 'browser_click', description: 'Klik satu elemen pada halaman browser berdasarkan role dan nama yang terlihat pada hasil inspeksi.', properties: { role: { type: 'string', enum: ['link', 'button', 'checkbox', 'radio', 'tab', 'menuitem', 'option'] }, name: { type: 'string' } }, required: ['role', 'name'] },
  { name: 'browser_fill', description: 'Isi kotak teks pada halaman browser berdasarkan nama/label yang terlihat.', properties: { name: { type: 'string' }, text: { type: 'string' } }, required: ['name', 'text'] },
  { name: 'browser_press', description: 'Tekan tombol keyboard pada halaman browser, misalnya Enter setelah mengisi pencarian.', properties: { key: { type: 'string' } }, required: ['key'] }
].map(({ name, description, properties, required }) => ({
  type: 'function', function: { name, description, parameters: { type: 'object', properties, required, additionalProperties: false } }
}))

function boundedText(value, name, maxLength = 2_000) {
  if (typeof value !== 'string' || !value.trim() || value.length > maxLength) throw new Error(`${name} tidak valid`)
  return value.trim()
}

function safeUrl(value) {
  let url
  try { url = new URL(boundedText(value, 'URL', 4_096)) } catch { throw new Error('URL tidak valid') }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Browser hanya menerima URL HTTP atau HTTPS')
  return url.toString()
}

function createBrowserTools({ channel = 'msedge', headless = false, chromiumImpl = chromium } = {}) {
  let browser
  let context
  let page

  async function currentPage() {
    if (page && !page.isClosed()) return page
    browser = await chromiumImpl.launch({ channel, headless, timeout: 20_000 })
    context = await browser.newContext()
    context.setDefaultTimeout(10_000)
    page = await context.newPage()
    return page
  }

  async function inspect(active) {
    const snapshot = await active.locator('body').ariaSnapshot({ mode: 'ai', timeout: 10_000 }).catch(() => '')
    let content = ''
    try {
      content = await active.evaluate(() => {
        const main = document.querySelector('main, article, [role="main"]') || document.body
        return main?.innerText || ''
      })
    } catch {
      content = await active.locator('body').innerText().catch(() => '')
    }
    return {
      url: active.url(),
      title: typeof active.title === 'function' ? await active.title().catch(() => '') : '',
      content: content.slice(0, 6_000),
      page: snapshot.slice(0, 9_000),
      truncated: content.length > 6_000 || snapshot.length > 9_000,
      ...(snapshot || content ? {} : { error: 'Halaman belum dapat dibaca; coba inspeksi ulang atau buka sumber lain.' })
    }
  }

  async function searchResults(active) {
    if (typeof active.evaluate !== 'function') return []
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const results = await active.evaluate(() => {
          const bing = [...document.querySelectorAll('li.b_algo')].map((item) => {
            const link = item.querySelector('h2 a')
            const snippet = item.querySelector('.b_caption p, .b_snippet')
            return { title: link?.textContent?.trim(), url: link?.href, snippet: snippet?.textContent?.trim() || '' }
          })
          const google = [...document.querySelectorAll('#search h3')].map((heading) => {
            const link = heading.closest('a')
            const container = heading.closest('[data-hveid]') || heading.parentElement?.parentElement
            const snippet = container?.textContent?.replace(heading.textContent, '').trim() || ''
            return { title: heading.textContent.trim(), url: link?.href, snippet }
          })
          return (bing.length ? bing : google)
            .filter((item) => item.title && /^https?:\/\//.test(item.url || ''))
            .slice(0, 8)
            .map((item) => ({ title: item.title.slice(0, 180), url: item.url, snippet: item.snippet.slice(0, 400) }))
        })
        if (results.length) return results
      } catch {
        // Bing dapat melakukan navigasi ulang setelah DOM awal dimuat.
      }
      if (attempt < 2) await active.waitForTimeout(500)
    }
    return []
  }

  async function execute(name, args = {}) {
    if (!BROWSER_DEFINITIONS.some((item) => item.function.name === name)) throw new Error('Tool browser tidak dikenal')
    const active = await currentPage()
    if (name === 'web_search') {
      const query = boundedText(args.query, 'Kata pencarian', 500)
      let searchEngine = 'Google'
      try {
        await active.goto(`https://www.google.com/search?q=${encodeURIComponent(query)}`, { waitUntil: 'domcontentloaded', timeout: 20_000 })
        const body = (await active.locator('body').innerText()).slice(0, 1_000)
        if (active.url().includes('/sorry/') || /unusual traffic|not a robot/i.test(body)) throw new Error('Google meminta verifikasi')
        const results = await searchResults(active)
        if (results.length) return { type: 'response', response: { type: 'text', text: JSON.stringify({ searchEngine, query, results }) } }
      } catch {
        // Gunakan sumber lain saat Google meminta verifikasi atau gagal dimuat.
      }
      searchEngine = 'Bing'
      let bingError
      try {
        await active.goto(`https://www.bing.com/search?q=${encodeURIComponent(query)}`, { waitUntil: 'domcontentloaded', timeout: 20_000 })
      } catch (error) {
        bingError = error
      }
      const results = await searchResults(active)
      if (bingError && !results.length) throw new Error('Pencarian Google dan Bing belum dapat diakses. Coba lagi setelah koneksi browser stabil.')
      const search = results.length
        ? { searchEngine, query, results }
        : { searchEngine, query, ...(await inspect(active)), error: 'Hasil pencarian belum dapat dibaca. Coba kata kunci lain atau buka URL sumber langsung.' }
      return { type: 'response', response: { type: 'text', text: JSON.stringify(search) } }
    }
    if (name === 'browser_open') {
      await active.goto(safeUrl(args.url), { waitUntil: 'domcontentloaded', timeout: 20_000 })
      return { type: 'response', response: { type: 'text', text: JSON.stringify(await inspect(active)) } }
    }
    if (name === 'browser_inspect') {
      return { type: 'response', response: { type: 'text', text: JSON.stringify(await inspect(active)) } }
    }
    if (name === 'browser_click') {
      const role = boundedText(args.role, 'Role elemen', 30)
      if (!['link', 'button', 'checkbox', 'radio', 'tab', 'menuitem', 'option'].includes(role)) throw new Error('Role elemen tidak tersedia')
      const target = active.getByRole(role, { name: boundedText(args.name, 'Nama elemen', 300), exact: true })
      if (await target.count() !== 1) throw new Error('Elemen tidak unik atau tidak ditemukan; periksa halaman lagi')
      await target.click()
      return { type: 'response', response: { type: 'text', text: JSON.stringify(await inspect(active)) } }
    }
    if (name === 'browser_fill') {
      const target = active.getByRole('textbox', { name: boundedText(args.name, 'Nama kotak teks', 300), exact: true })
      if (await target.count() !== 1) throw new Error('Kotak teks tidak unik atau tidak ditemukan; periksa halaman lagi')
      await target.fill(boundedText(args.text, 'Isi kotak teks', 5_000))
      return { type: 'response', response: { type: 'text', text: 'Kotak teks diisi. ' + JSON.stringify(await inspect(active)) } }
    }
    if (name === 'browser_press') {
      await active.keyboard.press(boundedText(args.key, 'Tombol keyboard', 40))
      return { type: 'response', response: { type: 'text', text: JSON.stringify(await inspect(active)) } }
    }
  }

  async function close() {
    await context?.close()
    await browser?.close()
    page = undefined
    context = undefined
    browser = undefined
  }

  return { definitions: BROWSER_DEFINITIONS, has: (name) => BROWSER_DEFINITIONS.some((item) => item.function.name === name), execute, close }
}

module.exports = { BROWSER_DEFINITIONS, createBrowserTools, safeUrl }
