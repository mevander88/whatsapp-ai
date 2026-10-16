const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { createPathPolicy, findOwnerId, redactSecrets } = require('../src/security')

test('mengenali pemilik dari JID utama atau alternatif', () => {
  assert.equal(
    findOwnerId(['123@lid', '628123@s.whatsapp.net'], ['628123@s.whatsapp.net']),
    '628123@s.whatsapp.net'
  )
  assert.equal(findOwnerId(['999@s.whatsapp.net'], ['628123@s.whatsapp.net']), null)
})

test('path policy membatasi akses ke root dan memblokir rahasia', () => {
  const root = path.resolve('agent-workspace')
  const policy = createPathPolicy([root])

  assert.equal(policy.resolveAllowedPath('notes/info.txt'), path.join(root, 'notes', 'info.txt'))
  assert.throws(() => policy.resolveAllowedPath('../.env'), /di luar folder/)
  assert.throws(() => policy.resolveAllowedPath('.env.local'), /sensitif/)
  assert.throws(() => policy.resolveAllowedPath('private.pem'), /sensitif/)
})

test('redactSecrets menyamarkan token dan connection string', () => {
  const result = redactSecrets('token=abc123 password=secret postgresql://user:pass@host/db sk-abcdefghijklmnop')
  assert.equal(result.includes('abc123'), false)
  assert.equal(result.includes('user:pass'), false)
  assert.equal(result.includes('sk-abcdefghijklmnop'), false)
})
