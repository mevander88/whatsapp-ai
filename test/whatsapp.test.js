const test = require('node:test')
const assert = require('node:assert/strict')
const { buildMessageContent, createChatQueue, extractText } = require('../src/whatsapp')

test('extractText membaca pesan teks biasa dan extended text', () => {
  assert.equal(extractText({ message: { conversation: ' Halo ' } }), 'Halo')
  assert.equal(
    extractText({ message: { extendedTextMessage: { text: 'Balasan' } } }),
    'Balasan'
  )
  assert.equal(extractText({ message: { imageMessage: { caption: ' Jelaskan gambar ' } } }), 'Jelaskan gambar')
  assert.equal(
    extractText({ message: { buttonsResponseMessage: { selectedButtonId: 'agent:approve:abc' } } }),
    'agent:approve:abc'
  )
})

test('buildMessageContent menyusun tombol dan media sesuai format Baileys', () => {
  assert.deepEqual(buildMessageContent({
    type: 'buttons',
    text: 'Pilih',
    footer: 'Agent',
    options: [{ id: 'yes', label: 'Ya' }]
  }), {
    text: 'Pilih',
    footer: 'Agent',
    buttons: [{ buttonId: 'yes', buttonText: { displayText: 'Ya' } }]
  })

  assert.deepEqual(buildMessageContent({ type: 'image', filePath: 'C:\\tmp\\foto.jpg', caption: 'Foto' }), {
    image: { url: 'C:\\tmp\\foto.jpg' },
    caption: 'Foto'
  })
})

test('antrean menjalankan pesan dalam chat yang sama secara berurutan', async () => {
  const enqueue = createChatQueue()
  const order = []
  let releaseFirst
  const waitForRelease = new Promise((resolve) => { releaseFirst = resolve })

  const first = enqueue('chat-1', async () => {
    order.push('first-start')
    await waitForRelease
    order.push('first-end')
  })
  const second = enqueue('chat-1', async () => order.push('second'))

  await new Promise((resolve) => setImmediate(resolve))
  assert.deepEqual(order, ['first-start'])
  releaseFirst()
  await Promise.all([first, second])
  assert.deepEqual(order, ['first-start', 'first-end', 'second'])
})
