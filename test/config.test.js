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
})

test('positiveInteger menolak nilai yang tidak valid', () => {
  assert.throws(() => positiveInteger('0', 10, 'LIMIT'), /bilangan bulat positif/)
})
