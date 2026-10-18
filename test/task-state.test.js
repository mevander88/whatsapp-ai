const test = require('node:test')
const assert = require('node:assert/strict')
const {
  classifyFailure,
  inferTask,
  missingEvidence,
  normalizeToolResult,
  repeatedFailure,
  routeDefinitions,
  taskContext,
  updateTask
} = require('../src/task-state')

test('task context tetap valid saat belum ada tugas eksekusi', () => {
  assert.doesNotThrow(() => JSON.parse(taskContext(null)))
  assert.equal(JSON.parse(taskContext(null)).taskId, null)
})

const definition = (name) => ({ type: 'function', function: { name } })

test('routing hanya memberikan kelompok tool yang relevan', () => {
  const task = inferTask('Carikan gambar kucing oranye lalu kirim')
  const routed = routeDefinitions([
    definition('web_image_search'), definition('web_download_image'),
    definition('launch_application'), definition('capture_camera_photo')
  ], task).map((tool) => tool.function.name)

  assert.deepEqual(routed, ['web_image_search', 'web_download_image'])
  assert.deepEqual(task.requiredEvidence, ['media_ready'])
})

test('hasil tool menambah bukti dan pemeriksaan hasil akhir', () => {
  const task = inferTask('Carikan gambar kucing lalu kirim')
  updateTask(task, 'web_image_search', { query: 'kucing' }, normalizeToolResult('web_image_search', { type: 'data', data: [{ url: 'https://example.com/cat.jpg' }] }))
  assert.deepEqual(missingEvidence(task), ['media_ready'])

  updateTask(task, 'web_download_image', { url: 'https://example.com/cat.jpg' }, normalizeToolResult('web_download_image', { type: 'response', response: { type: 'image', filePath: 'cat.jpg' } }))
  assert.deepEqual(missingEvidence(task), [])
  assert.deepEqual(task.actions.map(({ tool, ok }) => ({ tool, ok })), [
    { tool: 'web_image_search', ok: true },
    { tool: 'web_download_image', ok: true }
  ])
})

test('kandidat gambar disimpan sebagai artefak agar dapat dipakai pada pesan lanjutan', () => {
  const task = inferTask('Cari gambar lalu kirim yang kedua')
  const result = { type: 'response', response: { type: 'text', text: JSON.stringify({ results: [
    { title: 'Satu', imageUrl: 'https://cdn.example/1.jpg', sourceUrl: 'https://example.com/1' },
    { title: 'Dua', imageUrl: 'https://cdn.example/2.jpg', sourceUrl: 'https://example.com/2' }
  ] }) } }
  updateTask(task, 'web_image_search', { query: 'contoh' }, normalizeToolResult('web_image_search', result))
  assert.equal(task.artifacts.length, 2)
  assert.equal(task.artifacts[1].imageUrl, 'https://cdn.example/2.jpg')
})

test('routing MCP mempertahankan tool dinamis dari server yang relevan', () => {
  const task = inferTask('Gunakan MCP untuk membaca repository')
  const routed = routeDefinitions([definition('mcp_status'), definition('github_read_repo'), definition('launch_application')], task)
  assert.deepEqual(routed.map((tool) => tool.function.name), ['mcp_status', 'github_read_repo'])
})

test('tugas submit formulir mendapat tool browser dan bukti hasil submit', () => {
  const task = inferTask('Isi formulir pendaftaran lalu submit')
  const routed = routeDefinitions([
    definition('browser_fill'), definition('browser_select_option'),
    definition('browser_submit_form'), definition('run_full_command')
  ], task)
  assert.deepEqual(routed.map((tool) => tool.function.name), [
    'browser_fill', 'browser_select_option', 'browser_submit_form'
  ])
  assert.ok(task.requiredEvidence.includes('form_submitted'))
  updateTask(task, 'browser_submit_form', {}, normalizeToolResult('browser_submit_form', { type: 'response', response: { type: 'text', text: 'Formulir disubmit dan halaman sukses dibaca' } }))
  assert.ok(!missingEvidence(task).includes('form_submitted'))
})

test('tool tab hanya diberikan ketika owner meminta penggunaan tab', () => {
  const definitions = [definition('browser_open'), definition('browser_new_tab'), definition('browser_switch_tab')]
  assert.deepEqual(routeDefinitions(definitions, inferTask('Buka website contoh')).map((tool) => tool.function.name), ['browser_open'])
  assert.deepEqual(routeDefinitions(definitions, inferTask('Buka website contoh di tab baru')).map((tool) => tool.function.name), [
    'browser_open', 'browser_new_tab', 'browser_switch_tab'
  ])
})

test('checkpoint tidak menyimpan isi field dan perintah secara mentah', () => {
  const task = inferTask('Isi form')
  updateTask(task, 'browser_fill', { name: 'Password', text: 'rahasia-sekali' }, normalizeToolResult('browser_fill', { type: 'response', response: { type: 'text', text: 'Terisi' } }))
  assert.equal(JSON.stringify(task).includes('rahasia-sekali'), false)
  assert.equal(task.actions[0].arguments.text.redacted, true)
})

test('kegagalan diklasifikasikan dan pengulangan identik dihentikan', () => {
  const task = inferTask('Buka website')
  const outcome = normalizeToolResult('browser_open', { type: 'text', text: 'Tindakan gagal: Timed Out (408)' })
  assert.equal(outcome.failureType, 'timeout')
  updateTask(task, 'browser_open', { url: 'https://example.com' }, outcome)
  updateTask(task, 'browser_open', { url: 'https://example.com' }, outcome)
  assert.equal(repeatedFailure(task, 'browser_open', { url: 'https://example.com' }, classifyFailure(outcome.summary)), true)
})

test('tugas desktop membutuhkan pemeriksaan keadaan setelah tindakan', () => {
  const task = inferTask('Buka VS Code')
  assert.ok(task.groups.includes('desktop'))
  assert.deepEqual(missingEvidence(task), ['state_checked'])

  updateTask(task, 'launch_application', { app: 'code' }, normalizeToolResult('launch_application', { type: 'data', data: { launched: true } }))
  assert.ok(missingEvidence(task).includes('state_checked'))
  updateTask(task, 'list_running_applications', {}, normalizeToolResult('list_running_applications', { type: 'data', data: [{ name: 'Code' }] }))
  assert.ok(!missingEvidence(task).includes('state_checked'))
})

test('perintah cursor dengan koordinat pasti tidak membutuhkan inspeksi layar', () => {
  const move = inferTask('Gerakkan cursor ke 500,300')
  const click = inferTask('Klik di koordinat 200 x 100')

  assert.ok(move.groups.includes('desktop'))
  assert.deepEqual(move.requiredEvidence, [])
  assert.deepEqual(click.requiredEvidence, [])
})
