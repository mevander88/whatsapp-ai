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
