const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { createCamera, parseCameraDevices } = require('../src/camera')

test('kamera memilih perangkat video pertama, menyimpan JPEG, lalu membersihkannya', async (t) => {
  const captureDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wa-ai-camera-test-'))
  t.after(async () => { await fs.rmdir(captureDir) })
  const calls = []
  const camera = createCamera({
    captureDir,
    platform: 'win32',
    runFfmpeg: async (args) => {
      calls.push(args)
      if (args.includes('-list_devices')) {
        return {
          stderr: '[dshow @ 1234] "Integrated Camera" (video)\n[dshow @ 1234] "Microphone" (audio)\n[dshow @ 1234] "Web Camera" (video)\n'
        }
      }
      await fs.writeFile(args.at(-1), Buffer.from([0xff, 0xd8, 0xff, 0xd9]))
      return { stderr: '' }
    }
  })

  const response = await camera.capture()
  assert.equal(response.type, 'image')
  assert.equal(response.cameraCapture, true)
  assert.ok(calls[1].includes('video=Integrated Camera'))
  assert.equal((await fs.stat(response.filePath)).size, 4)
  await camera.cleanup(response.filePath)
  await assert.rejects(fs.stat(response.filePath), { code: 'ENOENT' })
  await assert.rejects(camera.cleanup(path.join(captureDir, 'other.jpg')), /tidak valid/)
})

test('parser kamera hanya mengambil perangkat video', () => {
  assert.deepEqual(parseCameraDevices('[dshow @ 1234] "Kamera A" (video)\r\n[dshow @ 1234] "Mic" (audio)\r\n'), ['Kamera A'])
})
