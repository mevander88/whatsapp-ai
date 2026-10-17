const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { EventEmitter } = require('node:events')
const { createComputerTools } = require('../src/computer-tools')
const { createPathPolicy } = require('../src/security')

test('tool komputer membaca dan menulis hanya dalam folder izin', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'wa-ai-agent-'))
  t.after(async () => fs.rm(root, { recursive: true, force: true }))

  const tools = createComputerTools({
    pathPolicy: createPathPolicy([root]),
    allowedApps: [],
    maxFileBytes: 1_024,
    maxMediaBytes: 2_048
  })

  const writeResult = await tools.execute('write_text_file', { path: 'notes/info.txt', content: 'Halo' })
  assert.equal(writeResult.data.bytesWritten, 4)

  const readResult = await tools.execute('read_text_file', { path: 'notes/info.txt' })
  assert.equal(readResult.data.content, 'Halo')

  await assert.rejects(
    () => tools.execute('read_text_file', { path: '../rahasia.txt' }),
    /di luar folder/
  )
})

test('tool komputer tidak menyediakan perintah terminal atau penghapusan', () => {
  const tools = createComputerTools({
    pathPolicy: createPathPolicy([path.resolve('agent-workspace')]),
    allowedApps: [],
    maxFileBytes: 1_024
  })

  assert.equal(tools.has('run_shell'), false)
  assert.equal(tools.has('run_cmd_command'), false)
  assert.equal(tools.has('delete_file'), false)
  assert.throws(
    () => tools.validate('read_text_file', { path: '../rahasia.txt' }),
    /di luar folder/
  )
  assert.throws(
    () => tools.validate('open_application', { name: 'powershell' }),
    /daftar izin/
  )
})

test('CMD hanya menerima perintah diagnostik yang diizinkan tanpa argumen', () => {
  const tools = createComputerTools({
    pathPolicy: createPathPolicy([path.resolve('agent-workspace')]),
    allowedApps: [],
    allowedCmdCommands: ['systeminfo'],
    maxFileBytes: 1_024,
    platform: 'win32'
  })

  assert.equal(tools.has('run_cmd_command'), true)
  assert.deepEqual(tools.definitions.find((item) => item.function.name === 'run_cmd_command').function.parameters.properties.command.enum, ['systeminfo'])
  assert.deepEqual(tools.validate('run_cmd_command', { command: 'systeminfo' }), { command: 'systeminfo' })
  assert.throws(() => tools.validate('run_cmd_command', { command: 'ver' }), /daftar izin/)
  assert.throws(() => tools.validate('run_cmd_command', { command: 'systeminfo & del' }), /daftar izin/)
  assert.throws(() => tools.validate('run_cmd_command', { command: 'cmd /c whoami' }), /daftar izin/)
})

test('tool kamera tersedia hanya di Windows dan menghasilkan respons gambar', async () => {
  let captured = 0
  const camera = {
    capture: async () => {
      captured += 1
      return { type: 'image', filePath: 'foto.jpg', cameraCapture: true }
    },
    cleanup: async () => {}
  }
  const tools = createComputerTools({
    pathPolicy: createPathPolicy([path.resolve('agent-workspace')]),
    allowedApps: [],
    camera,
    maxFileBytes: 1_024,
    platform: 'win32'
  })

  assert.equal(tools.has('capture_camera_photo'), true)
  const result = await tools.execute('capture_camera_photo', {})
  assert.equal(result.response.cameraCapture, true)
  assert.equal(captured, 1)
  const otherPlatform = createComputerTools({
    pathPolicy: createPathPolicy([path.resolve('agent-workspace')]),
    allowedApps: [],
    camera,
    maxFileBytes: 1_024,
    platform: 'linux'
  })
  assert.equal(otherPlatform.has('capture_camera_photo'), false)
  assert.equal(otherPlatform.hasGodmode('run_full_command'), false)
})

test('perintah akses penuh hanya tersedia lewat executor godmode dan keluarannya dibatasi', async () => {
  const launches = []
  let fakeOutput = 'hasil perintah'
  const spawnImpl = (file, args, options) => {
    launches.push({ file, args, options })
    const child = new EventEmitter()
    child.stdout = new EventEmitter()
    child.stderr = new EventEmitter()
    queueMicrotask(() => {
      child.stdout.emit('data', Buffer.from(fakeOutput))
      child.emit('close', 0, null)
    })
    return child
  }
  const tools = createComputerTools({
    pathPolicy: createPathPolicy([path.resolve('agent-workspace')]),
    allowedApps: [],
    maxFileBytes: 1_024,
    platform: 'win32',
    spawnImpl
  })

  assert.equal(tools.has('run_full_command'), false)
  assert.equal(tools.hasGodmode('run_full_command'), true)
  await assert.rejects(() => tools.execute('run_full_command', { command: 'Get-Date' }), /tidak dikenali/)
  await assert.rejects(() => tools.executeGodmode('run_full_command', { command: '' }), /tidak valid/)

  const result = await tools.executeGodmode('run_full_command', { command: 'Get-Date' })
  assert.equal(result.response.text, 'hasil perintah')
  assert.match(launches[0].file, /powershell\.exe$/i)
  assert.deepEqual(launches[0].args, ['-NoProfile', '-NonInteractive', '-Command', 'Get-Date'])
  assert.equal(launches[0].options.shell, false)
  assert.equal(launches[0].options.timeout, 60_000)

  fakeOutput = 'x'.repeat(20_000)
  const longResult = await tools.executeGodmode('run_full_command', { command: 'Get-Content large.txt' })
  assert.match(longResult.response.text, /\[Keluaran dipotong\]$/)
  assert.ok(longResult.response.text.length < 17_000)
})

test('godmode dapat membuka dan menutup aplikasi di luar daftar izin tanpa menyisipkan perintah', async () => {
  const scripts = []
  const spawnImpl = (_file, args) => {
    scripts.push(args[3])
    const child = new EventEmitter()
    child.stdout = new EventEmitter()
    child.stderr = new EventEmitter()
    queueMicrotask(() => {
      child.stdout.emit('data', Buffer.from('1234'))
      child.emit('close', 0, null)
    })
    return child
  }
  const tools = createComputerTools({
    pathPolicy: createPathPolicy([path.resolve('agent-workspace')]),
    allowedApps: [],
    maxFileBytes: 1_024,
    platform: 'win32',
    spawnImpl
  })

  assert.equal(tools.has('launch_application'), false)
  assert.equal(tools.hasGodmode('launch_application'), true)
  assert.equal(tools.hasGodmode('close_application'), true)
  assert.equal(tools.hasGodmode('list_running_applications'), true)
  await assert.rejects(() => tools.execute('open_application', { name: 'chrome' }), /daftar izin/)

  const opened = await tools.executeGodmode('launch_application', { target: "C:\\Program Files\\O'Brien\\app.exe", arguments: "--title 'Hello'" })
  assert.match(opened.response.text, /dibuka/)
  assert.equal(scripts[0], "Start-Process -FilePath 'C:\\Program Files\\O''Brien\\app.exe' -ArgumentList '--title ''Hello''' -ErrorAction Stop")

  const closed = await tools.executeGodmode('close_application', { processName: 'chrome.exe' })
  assert.match(closed.response.text, /chrome diminta tutup secara normal/)
  assert.match(scripts[1], /Get-Process -Name 'chrome'/)
  assert.match(scripts[1], /CloseMainWindow\(\)/)

  await tools.executeGodmode('close_application', { processId: 42, force: true })
  assert.match(scripts[2], /Get-Process -Id 42/)
  assert.match(scripts[2], /Stop-Process -Id \$item.Id -Force/)
  await assert.rejects(() => tools.executeGodmode('close_application', { processName: '*' }), /tidak valid/)
  await assert.rejects(() => tools.executeGodmode('close_application', { processName: '.exe' }), /tidak valid/)
  await assert.rejects(() => tools.executeGodmode('close_application', { processId: -1 }), /tidak valid/)

  await tools.executeGodmode('list_running_applications', {})
  assert.match(scripts[3], /Get-Process/)

  await tools.executeGodmode('open_application', { name: 'chrome.exe' })
  assert.match(scripts[4], /Start-Process -FilePath 'chrome.exe'/)
})

test('godmode dapat mengirim tangkapan layar dan input desktop melalui tool khusus', async (t) => {
  const captureDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wa-ai-desktop-test-'))
  t.after(async () => fs.rm(captureDir, { recursive: true, force: true }))
  const scripts = []
  const spawnImpl = (_file, args) => {
    const script = args[3]
    scripts.push(script)
    const child = new EventEmitter()
    child.stdout = new EventEmitter()
    child.stderr = new EventEmitter()
    queueMicrotask(async () => {
      try {
        const capturePath = script.match(/\$bitmap\.Save\('((?:''|[^'])*)'/)?.[1]?.replace(/''/g, "'")
        if (capturePath) await fs.writeFile(capturePath, Buffer.from([0xff, 0xd8, 0xff, 0xd9]))
        child.stdout.emit('data', Buffer.from('OK'))
        child.emit('close', 0, null)
      } catch (error) {
        child.emit('error', error)
      }
    })
    return child
  }
  const tools = createComputerTools({
    pathPolicy: createPathPolicy([path.resolve('agent-workspace')]),
    allowedApps: [],
    maxFileBytes: 1_024,
    maxMediaBytes: 2_048,
    desktopCaptureDir: captureDir,
    platform: 'win32',
    spawnImpl
  })

  for (const name of ['capture_desktop_screenshot', 'focus_application', 'click_screen', 'type_text', 'press_keys']) {
    assert.equal(tools.has(name), false)
    assert.equal(tools.hasGodmode(name), true)
  }

  await tools.executeGodmode('focus_application', { processName: 'notepad' })
  assert.match(scripts[0], /AppActivate/)
  assert.match(scripts[0], /Get-Process -Name 'notepad'/)

  await tools.executeGodmode('click_screen', { x: 100, y: 200, button: 'double' })
  assert.match(scripts[1], /Point\]::new\(100, 200\)/)
  assert.equal((scripts[1].match(/mouse_event\(2,/g) || []).length, 2)
  await assert.rejects(() => tools.executeGodmode('click_screen', { x: '100', y: 200 }), /Koordinat layar tidak valid/)

  await tools.executeGodmode('type_text', { text: 'A+{}\n' })
  assert.match(scripts[2], /SendWait\('A\{\+\}\{\{\}\{\}\}\{ENTER\}'\)/)
  await tools.executeGodmode('press_keys', { key: 'S', modifiers: ['ctrl'] })
  assert.match(scripts[3], /SendWait\('\^s'\)/)

  const screenshot = await tools.executeGodmode('capture_desktop_screenshot', {})
  assert.equal(screenshot.response.type, 'image')
  assert.equal(screenshot.response.desktopCapture, true)
  assert.match(scripts[4], /CopyFromScreen/)
  await fs.stat(screenshot.response.filePath)
  await tools.cleanupGeneratedFile(screenshot.response.filePath)
  await assert.rejects(() => fs.stat(screenshot.response.filePath), /ENOENT/)
  await assert.rejects(() => tools.cleanupGeneratedFile(path.join(captureDir, 'unrelated.jpg')), /tidak valid/)
})

test('inspect_desktop membaca screenshot dan membersihkan file sementara', async (t) => {
  const captureDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wa-ai-inspect-test-'))
  t.after(async () => fs.rm(captureDir, { recursive: true, force: true }))
  let capturedFile
  let origin
  const spawnImpl = (_file, args) => {
    const script = args[3]
    const child = new EventEmitter()
    child.stdout = new EventEmitter()
    child.stderr = new EventEmitter()
    queueMicrotask(async () => {
      const capturePath = script.match(/\$bitmap\.Save\('((?:''|[^'])*)'/)?.[1]?.replace(/''/g, "'")
      if (capturePath) {
        capturedFile = capturePath
        await fs.writeFile(capturePath, Buffer.from([0xff, 0xd8, 0xff, 0xd9]))
      }
      child.stdout.emit('data', Buffer.from('-120,30'))
      child.emit('close', 0, null)
    })
    return child
  }
  const tools = createComputerTools({
    pathPolicy: createPathPolicy([path.resolve('agent-workspace')]),
    allowedApps: [], maxFileBytes: 1_024, maxMediaBytes: 2_048,
    desktopCaptureDir: captureDir, platform: 'win32', spawnImpl,
    imageReader: { analyze: async (_buffer, options) => { origin = options.origin; return { method: 'ocr', description: 'Tombol Buka' } } }
  })
  const result = await tools.executeGodmode('inspect_desktop', {})
  assert.match(result.response.text, /Tombol Buka/)
  assert.deepEqual(origin, { x: -120, y: 30 })
  await assert.rejects(() => fs.stat(capturedFile), /ENOENT/)
})
