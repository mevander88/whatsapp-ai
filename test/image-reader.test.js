const test = require('node:test')
const assert = require('node:assert/strict')
const { createImageReader, imageMime } = require('../src/image-reader')

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zf/8AAAAASUVORK5CYII=', 'base64')

test('gambar dikirim sebagai input visual ke model dan tidak perlu OCR saat hanya diminta deskripsi', async () => {
  let captured
  const reader = createImageReader({ ai: { chat: async (history) => { captured = history; return { text: 'Gambar berisi teks.' } } }, createWorkerImpl: () => { throw new Error('OCR tidak seharusnya dipakai') } })
  const result = await reader.analyze(png, { question: 'Apa isinya?' })
  assert.equal(result.method, 'vision')
  assert.equal(imageMime(png), 'image/png')
  assert.equal(captured[0].content[1].type, 'image_url')
  assert.match(captured[0].content[1].image_url.url, /^data:image\/png;base64,/)
})

test('OCR memberi teks dan posisi kata saat model visual gagal', async () => {
  const reader = createImageReader({
    ai: { chat: async () => { throw new Error('Vision gagal') } },
    createWorkerImpl: async () => ({
      recognize: async () => ({ data: { text: 'Buka File', blocks: [{ paragraphs: [{ lines: [{ words: [{ text: 'Buka', bbox: { x0: 10, x1: 30, y0: 20, y1: 40 } }] }] }] }] } }),
      terminate: async () => {}
    })
  })
  const result = await reader.analyze(png, { includeCoordinates: true, origin: { x: -100, y: 50 } })
  assert.equal(result.method, 'ocr')
  assert.match(result.description, /Buka File/)
  assert.deepEqual(result.words, [{ text: 'Buka', x: -80, y: 80 }])
  await reader.close()
})

test('mode OCR cepat tidak menunggu model visual', async () => {
  let visionCalls = 0
  const reader = createImageReader({
    ai: { chat: async () => { visionCalls += 1; return { text: 'vision' } } },
    createWorkerImpl: async () => ({
      recognize: async () => ({ data: { text: 'Simpan', blocks: [] } }),
      terminate: async () => {}
    })
  })

  const result = await reader.analyze(png, { ocrOnly: true, includeCoordinates: true })
  assert.equal(result.method, 'ocr')
  assert.match(result.description, /Simpan/)
  assert.equal(visionCalls, 0)
  await reader.close()
})

test('format selain gambar yang didukung ditolak sebelum dikirim ke model', () => {
  assert.throws(() => imageMime(Buffer.from('not an image')), /Format gambar/)
})
