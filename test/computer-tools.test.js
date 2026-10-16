const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
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
})
