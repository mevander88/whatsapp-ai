const test = require('node:test')
const assert = require('node:assert/strict')
const { loadConfig, positiveInteger } = require('../src/config')

test('loadConfig menolak konfigurasi wajib yang kosong', () => {
  assert.throws(() => loadConfig({}), /DEEPSEEK_API_KEY, DATABASE_URL/)
})

test('loadConfig membaca konfigurasi wajib dan nilai bawaan', () => {
  const config = loadConfig({
    DEEPSEEK_API_KEY: 'token-test',
    DATABASE_URL: 'postgresql://localhost/test'
  })

  assert.equal(config.deepseekApiKey, 'token-test')
  assert.equal(config.historyLimit, 10)
  assert.equal(config.deepseekModel, 'deepseek-flash')
  assert.deepEqual(config.ownerIds, [])
  assert.equal(config.approvalTtlMinutes, 10)
})

test('loadConfig menormalkan nomor pemilik dan daftar izin', () => {
  const config = loadConfig({
    DEEPSEEK_API_KEY: 'token-test',
    DATABASE_URL: 'postgresql://localhost/test',
    OWNER_NUMBERS: '+628123, 628456@s.whatsapp.net',
    AGENT_ALLOWED_APPS: 'notepad, calculator'
  })

  assert.deepEqual(config.ownerIds, ['628123@s.whatsapp.net', '628456@s.whatsapp.net'])
  assert.deepEqual(config.allowedApps, ['notepad', 'calculator'])
})

test('positiveInteger menolak nilai yang tidak valid', () => {
  assert.throws(() => positiveInteger('0', 10, 'LIMIT'), /bilangan bulat positif/)
})
