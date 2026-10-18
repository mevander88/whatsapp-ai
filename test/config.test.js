const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { loadConfig, positiveInteger, readAICredentials, whatsappVersion } = require('../src/config')

const credentialContents = [
  'secret-test-value',
  '',
  'Endpoint: https://api.rindri.com/',
  'Cara pakai: OpenAI-compatible: base URL https://api.rindri.com/v1 + header Authorization: Bearer <Secret Key>.'
].join('\n')

function withCredentials(contents, run) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'wa-ai-config-'))
  const file = path.join(directory, 'apikey.txt')
  fs.writeFileSync(file, contents)
  try {
    return run(file)
  } finally {
    fs.unlinkSync(file)
    fs.rmdirSync(directory)
  }
}

test('loadConfig menolak DATABASE_URL yang kosong', () => {
  assert.throws(() => loadConfig({}), /DATABASE_URL/)
})

test('loadConfig membaca secret key dan base URL dari apikey.txt', () => withCredentials(credentialContents, (file) => {
  const config = loadConfig({
    AI_KEY_FILE: file,
    HF_TOKEN: 'token-lama',
    AI_BASE_URL: 'https://api.howtofix.id/v1',
    DATABASE_URL: 'postgresql://localhost/test'
  })

  assert.equal(config.aiApiKey, 'secret-test-value')
  assert.equal(config.historyLimit, 10)
  assert.equal(config.aiModel, 'deepseek-v4.1-flash')
  assert.equal(config.aiBaseUrl, 'https://api.rindri.com/v1')
  assert.deepEqual(config.ownerIds, [])
  assert.equal(config.approvalTtlMinutes, 10)
  assert.equal(config.godmodeTtlMinutes, 30)
  assert.equal(config.whatsappConnectTimeoutMs, 30_000)
  assert.equal(config.whatsappMaxReconnectAttempts, 5)
  assert.deepEqual(config.allowedCmdCommands, ['ver', 'whoami', 'hostname', 'ipconfig', 'tasklist', 'systeminfo'])
  assert.equal(config.cameraDeviceName, '')
  assert.equal(config.cameraFfmpegPath, 'ffmpeg')
  assert.equal(config.browserUserDataDir, path.resolve('agent-workspace/browser-profile'))
}))

test('loadConfig menormalkan nomor pemilik dan daftar izin', () => withCredentials(credentialContents, (file) => {
  const config = loadConfig({
    AI_KEY_FILE: file,
    DATABASE_URL: 'postgresql://localhost/test',
    OWNER_NUMBERS: '+628123, 628456@s.whatsapp.net',
    AGENT_ALLOWED_APPS: 'notepad, calculator',
    AGENT_ALLOWED_CMD_COMMANDS: 'systeminfo, ver',
    AGENT_GODMODE_TTL_MINUTES: '5'
  })

  assert.deepEqual(config.ownerIds, ['628123@s.whatsapp.net', '628456@s.whatsapp.net'])
  assert.deepEqual(config.allowedApps, ['notepad', 'calculator'])
  assert.deepEqual(config.allowedCmdCommands, ['systeminfo', 'ver'])
  assert.equal(config.godmodeTtlMinutes, 5)
}))

test('AI_MODEL dalam .env tetap dapat memilih model', () => withCredentials(credentialContents, (file) => {
  const config = loadConfig({
    AI_KEY_FILE: file,
    DATABASE_URL: 'postgresql://localhost/test',
    AI_MODEL: 'deepseek-v4-pro',
    DEEPSEEK_MODEL: 'model-lama'
  })
  assert.equal(config.aiModel, 'deepseek-v4-pro')
  assert.equal(config.aiBaseUrl, 'https://api.rindri.com/v1')
}))

test('file kredensial hilang atau tidak valid menghasilkan pesan tanpa secret key', () => {
  const missing = path.join(os.tmpdir(), `wa-ai-missing-${process.pid}-${Date.now()}.txt`)
  assert.throws(() => readAICredentials(missing), /File kredensial AI tidak ditemukan/)
  withCredentials('secret-test-value\nEndpoint: https://api.rindri.com/', (file) => {
    assert.throws(() => readAICredentials(file), (error) => {
      assert.match(error.message, /base URL OpenAI-compatible/)
      assert.equal(error.message.includes('secret-test-value'), false)
      return true
    })
  })
  withCredentials('secret-test-value\nbase URL http://example.test/v1', (file) => {
    assert.throws(() => readAICredentials(file), /HTTPS/)
  })
})

test('positiveInteger menolak nilai yang tidak valid', () => withCredentials(credentialContents, (file) => {
  assert.throws(() => positiveInteger('0', 10, 'LIMIT'), /bilangan bulat positif/)
  assert.throws(() => loadConfig({ AI_KEY_FILE: file, DATABASE_URL: 'postgresql://localhost/test', AGENT_GODMODE_TTL_MINUTES: '0' }), /AGENT_GODMODE_TTL_MINUTES/)
}))

test('whatsappVersion membaca override tiga angka', () => {
  assert.deepEqual(whatsappVersion('2, 3000, 123'), [2, 3000, 123])
  assert.throws(() => whatsappVersion('2,3000'), /tiga angka/)
})
