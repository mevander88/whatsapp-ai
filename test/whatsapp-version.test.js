const test = require('node:test')
const assert = require('node:assert/strict')
const { fetchLatestWaWebVersion, WHATSAPP_WEB_SERVICE_WORKER_URL } = require('../src/whatsapp-version')

test('fetchLatestWaWebVersion membaca client revision dari service worker', async () => {
  let requestedUrl
  const version = await fetchLatestWaWebVersion({
    fetchImpl: async (url) => {
      requestedUrl = url
      return {
        ok: true,
        text: async () => 'self.__WB_MANIFEST={"client_revision":1046500012}'
      }
    }
  })

  assert.equal(requestedUrl, WHATSAPP_WEB_SERVICE_WORKER_URL)
  assert.deepEqual(version, [2, 3000, 1046500012])
})

test('fetchLatestWaWebVersion menolak respons tanpa revision', async () => {
  await assert.rejects(
    fetchLatestWaWebVersion({ fetchImpl: async () => ({ ok: true, text: async () => 'invalid' }) }),
    /tidak ditemukan/
  )
})
