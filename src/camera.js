const crypto = require('node:crypto')
const fs = require('node:fs/promises')
const path = require('node:path')
const { execFile } = require('node:child_process')
const { promisify } = require('node:util')

const execFileAsync = promisify(execFile)
const CAMERA_FILE_PATTERN = /^wa-ai-camera-[0-9a-f-]{36}\.jpg$/

function parseCameraDevices(output) {
  return [...String(output).matchAll(/^\[dshow[^\]\r\n]*\]\s+"([^"\r\n]+)" \(video\)\r?$/gm)]
    .map((match) => match[1])
}

function createCamera({
  deviceName = '',
  ffmpegPath = 'ffmpeg',
  captureDir = path.resolve('agent-workspace/.camera-captures'),
  maxMediaBytes = 10_485_760,
  platform = process.platform,
  runFfmpeg = (args, timeout) => execFileAsync(ffmpegPath, args, {
    timeout,
    maxBuffer: 256 * 1024,
    windowsHide: true
  })
}) {
  const resolvedCaptureDir = path.resolve(captureDir)

  async function listDevices() {
    if (platform !== 'win32') throw new Error('Fitur kamera saat ini hanya tersedia di Windows')
    let output
    try {
      output = await runFfmpeg(['-hide_banner', '-list_devices', 'true', '-f', 'dshow', '-i', 'dummy'], 10_000)
    } catch (error) {
      if (error.code === 'ENOENT') throw new Error('FFmpeg tidak ditemukan. Pasang FFmpeg dan tambahkan ke PATH.')
      if (error.killed) throw new Error('Pencarian kamera melewati batas waktu')
      output = error
    }
    const devices = parseCameraDevices(`${output?.stdout || ''}\n${output?.stderr || ''}`)
    if (devices.length === 0) throw new Error('Kamera tidak terdeteksi. Periksa FFmpeg dan izin kamera Windows.')
    return devices
  }

  async function capture() {
    const devices = await listDevices()
    const selected = deviceName || devices[0]
    if (!devices.includes(selected)) throw new Error('Kamera yang dikonfigurasi tidak ditemukan')

    await fs.mkdir(resolvedCaptureDir, { recursive: true })
    const filePath = path.join(resolvedCaptureDir, `wa-ai-camera-${crypto.randomUUID()}.jpg`)
    try {
      await runFfmpeg([
        '-nostdin', '-hide_banner', '-loglevel', 'error',
        '-f', 'dshow', '-i', `video=${selected}`,
        '-ss', '1', '-frames:v', '1', '-an', '-q:v', '3', '-update', '1', '-y', filePath
      ], 25_000)
      const stat = await fs.stat(filePath)
      if (!stat.isFile() || stat.size < 4 || stat.size > maxMediaBytes) {
        throw new Error('Ukuran foto kamera tidak valid')
      }
      const handle = await fs.open(filePath, 'r')
      let header
      try {
        header = Buffer.alloc(3)
        await handle.read(header, 0, 3, 0)
      } finally {
        await handle.close()
      }
      if (header[0] !== 0xff || header[1] !== 0xd8 || header[2] !== 0xff) {
        throw new Error('Kamera tidak menghasilkan gambar JPEG')
      }
      return {
        type: 'image',
        filePath,
        caption: 'Foto dari kamera komputer',
        cameraCapture: true
      }
    } catch (error) {
      await fs.rm(filePath, { force: true })
      if (error.code === 'ENOENT') throw new Error('FFmpeg tidak ditemukan. Pasang FFmpeg dan tambahkan ke PATH.')
      if (error.killed) throw new Error('Pengambilan foto kamera melewati batas waktu')
      throw error
    }
  }

  async function cleanup(filePath) {
    const resolved = path.resolve(filePath)
    const parent = path.dirname(resolved)
    const sameDirectory = platform === 'win32'
      ? parent.toLowerCase() === resolvedCaptureDir.toLowerCase()
      : parent === resolvedCaptureDir
    if (!sameDirectory || !CAMERA_FILE_PATTERN.test(path.basename(resolved))) {
      throw new Error('Path foto kamera tidak valid untuk dibersihkan')
    }
    await fs.rm(resolved, { force: true })
  }

  return { capture, cleanup, listDevices }
}

module.exports = { createCamera, parseCameraDevices }
