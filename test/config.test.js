const test = require('node:test')
const assert = require('node:assert/strict')
const { loadConfig, positiveInteger, whatsappVersion } = require('../src/config')

test('loadConfig menolak konfigurasi wajib yang kosong', () => {
  assert.throws(() => loadConfig({}), /HF_TOKEN \(atau DEEPSEEK_API_KEY\), DATABASE_URL/)
})

test('loadConfig membaca konfigurasi wajib dan nilai bawaan', () => {
  const config = loadConfig({
    HF_TOKEN: 'token-test',
    DATABASE_URL: 'postgresql://localhost/test'
  })

  assert.equal(config.deepseekApiKey, 'token-test')
  assert.equal(config.historyLimit, 10)
  assert.equal(config.deepseekModel, 'deepseek-v4.1-flash')
  assert.equal(config.deepseekApiUrl, 'https://api.howtofix.id/v1/chat/completions')
  assert.deepEqual(config.ownerIds, [])
  assert.equal(config.approvalTtlMinutes, 10)
  assert.equal(config.whatsappConnectTimeoutMs, 30_000)
  assert.equal(config.whatsappMaxReconnectAttempts, 5)
  assert.deepEqual(config.allowedCmdCommands, ['ver', 'whoami', 'hostname', 'ipconfig', 'tasklist', 'systeminfo'])
  assert.equal(config.cameraDeviceName, '')
  assert.equal(config.cameraFfmpegPath, 'ffmpeg')
})

test('loadConfig menormalkan nomor pemilik dan daftar izin', () => {
  const config = loadConfig({
    DEEPSEEK_API_KEY: 'token-test',
    DATABASE_URL: 'postgresql://localhost/test',
    OWNER_NUMBERS: '+628123, 628456@s.whatsapp.net',
    AGENT_ALLOWED_APPS: 'notepad, calculator',
    AGENT_ALLOWED_CMD_COMMANDS: 'systeminfo, ver'
  })

  assert.deepEqual(config.ownerIds, ['628123@s.whatsapp.net', '628456@s.whatsapp.net'])
  assert.deepEqual(config.allowedApps, ['notepad', 'calculator'])
  assert.deepEqual(config.allowedCmdCommands, ['systeminfo', 'ver'])
})

test('loadConfig menerima nama token lama dan mengutamakan HF_TOKEN', () => {
  const oldConfig = loadConfig({ DEEPSEEK_API_KEY: 'token-lama', DATABASE_URL: 'postgresql://localhost/test' })
  assert.equal(oldConfig.deepseekApiKey, 'token-lama')

  const newConfig = loadConfig({ HF_TOKEN: 'token-baru', DEEPSEEK_API_KEY: 'token-lama', DATABASE_URL: 'postgresql://localhost/test' })
  assert.equal(newConfig.deepseekApiKey, 'token-baru')

  const blankConfig = loadConfig({ HF_TOKEN: '   ', DEEPSEEK_API_KEY: 'token-lama', DATABASE_URL: 'postgresql://localhost/test' })
  assert.equal(blankConfig.deepseekApiKey, 'token-lama')
})

test('positiveInteger menolak nilai yang tidak valid', () => {
  assert.throws(() => positiveInteger('0', 10, 'LIMIT'), /bilangan bulat positif/)
})

test('whatsappVersion membaca override tiga angka', () => {
  assert.deepEqual(whatsappVersion('2, 3000, 123'), [2, 3000, 123])
  assert.throws(() => whatsappVersion('2,3000'), /tiga angka/)
})
