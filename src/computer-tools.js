const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { spawn } = require('node:child_process')
const { redactSecrets } = require('./security')

const TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'get_system_info',
      description: 'Membaca informasi dasar komputer pemilik. Hanya gunakan jika pemilik memintanya.',
      parameters: { type: 'object', properties: {}, additionalProperties: false }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_directory',
      description: 'Menampilkan isi folder yang diizinkan.',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string', description: 'Path relatif terhadap folder kerja atau path yang diizinkan.' } },
        required: ['path'],
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'read_text_file',
      description: 'Membaca file teks berukuran kecil di folder yang diizinkan.',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string' } },
        required: ['path'],
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'write_text_file',
      description: 'Membuat atau mengganti file teks di folder yang diizinkan.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          content: { type: 'string' }
        },
        required: ['path', 'content'],
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'open_application',
      description: 'Membuka aplikasi yang ada dalam daftar izin pemilik tanpa argumen tambahan.',
      parameters: {
        type: 'object',
        properties: { name: { type: 'string' } },
        required: ['name'],
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'send_local_file',
      description: 'Mengirim gambar, video, audio, atau dokumen dari folder yang diizinkan ke pemilik.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          mediaType: { type: 'string', enum: ['image', 'video', 'audio', 'document'] },
          caption: { type: 'string' }
        },
        required: ['path', 'mediaType'],
        additionalProperties: false
      }
    }
  }
]

const APP_COMMANDS = {
  win32: { notepad: 'notepad.exe', calculator: 'calc.exe' },
  darwin: { textedit: '/System/Applications/TextEdit.app/Contents/MacOS/TextEdit', calculator: '/System/Applications/Calculator.app/Contents/MacOS/Calculator' },
  linux: { calculator: 'gnome-calculator', texteditor: 'gedit' }
}

function createComputerTools({ pathPolicy, allowedApps, maxFileBytes, maxMediaBytes = 10_485_760, platform = process.platform }) {
  const appAllowlist = new Set(allowedApps.map((item) => item.toLowerCase()))

  function requiredString(value, name, maxLength = 1_024) {
    const text = typeof value === 'string' ? value.trim() : ''
    if (!text || text.length > maxLength) throw new Error(`${name} tidak valid`)
    return text
  }

  function validate(name, args = {}) {
    if (name === 'get_system_info') return {}

    if (['list_directory', 'read_text_file'].includes(name)) {
      const requestedPath = requiredString(args.path, 'Path')
      pathPolicy.resolveAllowedPath(requestedPath)
      return { path: requestedPath }
    }

    if (name === 'write_text_file') {
      const requestedPath = requiredString(args.path, 'Path')
      const content = typeof args.content === 'string' ? args.content : ''
      pathPolicy.resolveAllowedPath(requestedPath)
      if (Buffer.byteLength(content) > maxFileBytes) throw new Error(`Isi melebihi batas ${maxFileBytes} byte`)
      return { path: requestedPath, content }
    }

    if (name === 'open_application') {
      const appName = requiredString(args.name, 'Nama aplikasi', 50).toLowerCase()
      if (!appAllowlist.has(appName) || !APP_COMMANDS[platform]?.[appName]) {
        throw new Error('Aplikasi tidak ada dalam daftar izin')
      }
      return { name: appName }
    }

    if (name === 'send_local_file') {
      const requestedPath = requiredString(args.path, 'Path')
      const mediaType = requiredString(args.mediaType, 'Tipe media', 20)
      if (!['image', 'video', 'audio', 'document'].includes(mediaType)) throw new Error('Tipe media tidak diizinkan')
      pathPolicy.resolveAllowedPath(requestedPath)
      return {
        path: requestedPath,
        mediaType,
        caption: String(args.caption || '').slice(0, 1_024)
      }
    }

    throw new Error('Tool komputer tidak dikenali')
  }

  async function existingAllowedPath(requestedPath) {
    const lexicalPath = pathPolicy.resolveAllowedPath(requestedPath)
    const realPath = await fs.realpath(lexicalPath)
    return pathPolicy.resolveAllowedPath(realPath)
  }

  async function writableAllowedPath(requestedPath) {
    const lexicalPath = pathPolicy.resolveAllowedPath(requestedPath)
    await fs.mkdir(path.dirname(lexicalPath), { recursive: true })
    const realParent = await fs.realpath(path.dirname(lexicalPath))
    return pathPolicy.resolveAllowedPath(path.join(realParent, path.basename(lexicalPath)))
  }

  function describe(name, args) {
    const descriptions = {
      get_system_info: 'membaca informasi dasar sistem dan mengirimkannya ke DeepSeek untuk dirangkum',
      list_directory: `melihat isi folder ${args.path}`,
      read_text_file: `membaca file ${args.path} dan mengirim isinya ke DeepSeek`,
      write_text_file: `menulis file ${args.path}`,
      open_application: `membuka aplikasi ${args.name}`,
      send_local_file: `mengirim ${args.mediaType || 'file'} ${args.path} ke chat ini`
    }
    return descriptions[name] || name
  }

  async function execute(name, args = {}) {
    args = validate(name, args)
    switch (name) {
      case 'get_system_info':
        return {
          type: 'data',
          data: {
            hostname: os.hostname(),
            platform: os.platform(),
            release: os.release(),
            architecture: os.arch(),
            cpuCount: os.cpus().length,
            totalMemoryMb: Math.round(os.totalmem() / 1024 / 1024),
            freeMemoryMb: Math.round(os.freemem() / 1024 / 1024),
            uptimeMinutes: Math.round(os.uptime() / 60),
            nodeVersion: process.version,
            currentTime: new Date().toISOString()
          }
        }
      case 'list_directory': { // eslint-disable-line no-case-declarations
        const target = await existingAllowedPath(args.path)
        const entries = await fs.readdir(target, { withFileTypes: true })
        return {
          type: 'data',
          data: entries.slice(0, 100).map((entry) => ({
            name: entry.name,
            type: entry.isDirectory() ? 'directory' : 'file'
          }))
        }
      }
      case 'read_text_file': { // eslint-disable-line no-case-declarations
        const target = await existingAllowedPath(args.path)
        const stat = await fs.stat(target)
        if (!stat.isFile()) throw new Error('Target bukan file')
        if (stat.size > maxFileBytes) throw new Error(`File melebihi batas ${maxFileBytes} byte`)
        const content = await fs.readFile(target, 'utf8')
        if (content.includes('\u0000')) throw new Error('File bukan teks')
        return { type: 'data', data: { path: target, content: redactSecrets(content) } }
      }
      case 'write_text_file': { // eslint-disable-line no-case-declarations
        const target = await writableAllowedPath(args.path)
        const content = String(args.content || '')
        if (Buffer.byteLength(content) > maxFileBytes) throw new Error(`Isi melebihi batas ${maxFileBytes} byte`)
        await fs.writeFile(target, content, 'utf8')
        return { type: 'data', data: { path: target, bytesWritten: Buffer.byteLength(content) } }
      }
      case 'open_application': { // eslint-disable-line no-case-declarations
        const appName = String(args.name || '').toLowerCase()
        const command = APP_COMMANDS[platform]?.[appName]
        if (!appAllowlist.has(appName) || !command) throw new Error('Aplikasi tidak ada dalam daftar izin')
        const child = spawn(command, [], { detached: true, stdio: 'ignore', windowsHide: true })
        await new Promise((resolve, reject) => {
          child.once('spawn', resolve)
          child.once('error', reject)
        })
        child.unref()
        return { type: 'data', data: { opened: appName } }
      }
      case 'send_local_file': { // eslint-disable-line no-case-declarations
        const target = await existingAllowedPath(args.path)
        const stat = await fs.stat(target)
        if (!stat.isFile()) throw new Error('Target bukan file')
        if (stat.size > maxMediaBytes) throw new Error(`Media melebihi batas ${maxMediaBytes} byte`)
        return {
          type: 'response',
          response: {
            type: args.mediaType,
            filePath: target,
            fileName: path.basename(target),
            caption: String(args.caption || '')
          }
        }
      }
      default:
        throw new Error('Tool komputer tidak dikenali')
    }
  }

  return {
    definitions: TOOL_DEFINITIONS,
    has: (name) => TOOL_DEFINITIONS.some((tool) => tool.function.name === name),
    describe,
    execute,
    validate
  }
}

module.exports = { TOOL_DEFINITIONS, createComputerTools }
