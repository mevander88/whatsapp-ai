const path = require('node:path')

const BLOCKED_NAMES = new Set([
  '.env',
  '.git',
  '.ssh',
  'auth_info_baileys',
  'node_modules',
  'creds.json'
])
const BLOCKED_EXTENSIONS = new Set(['.key', '.pem', '.p12', '.pfx'])

function normalizeJid(value) {
  if (typeof value !== 'string') return ''
  return value.trim().toLowerCase().replace(/^([^@:]+):\d+@(s\.whatsapp\.net|lid)$/, '$1@$2')
}

function findOwnerId(senderIds, ownerIds) {
  const configured = new Set(ownerIds.map(normalizeJid))
  return senderIds.map(normalizeJid).find((id) => configured.has(id)) || null
}

function isInside(root, target) {
  const comparableRoot = process.platform === 'win32' ? root.toLowerCase() : root
  const comparableTarget = process.platform === 'win32' ? target.toLowerCase() : target
  return comparableTarget === comparableRoot || comparableTarget.startsWith(`${comparableRoot}${path.sep}`)
}

function createPathPolicy(allowedPaths) {
  const roots = allowedPaths.map((item) => path.resolve(item))
  for (const root of roots) {
    const parts = root.split(path.sep).filter(Boolean).map((part) => part.toLowerCase())
    if (parts.some((part) => BLOCKED_NAMES.has(part) || part.startsWith('.env'))) {
      throw new Error('Folder izin tidak boleh berada di lokasi sensitif')
    }
  }

  function resolveAllowedPath(requestedPath = '.') {
    if (roots.length === 0) throw new Error('Tidak ada folder agent yang diizinkan')

    const target = path.resolve(path.isAbsolute(requestedPath) ? requestedPath : path.join(roots[0], requestedPath))
    const root = roots.find((item) => isInside(item, target))
    if (!root) throw new Error('Path berada di luar folder yang diizinkan')

    const relativeParts = path.relative(root, target).split(path.sep).filter(Boolean)
    if (relativeParts.some((part) => {
      const name = part.toLowerCase()
      return BLOCKED_NAMES.has(name) || name.startsWith('.env')
    })) {
      throw new Error('Path mengarah ke lokasi sensitif')
    }
    if (BLOCKED_EXTENSIONS.has(path.extname(target).toLowerCase())) {
      throw new Error('Jenis file sensitif tidak diizinkan')
    }

    return target
  }

  return { resolveAllowedPath, roots: [...roots] }
}

function redactSecrets(value) {
  return String(value)
    .replace(/\b(sk-[A-Za-z0-9_-]{12,})\b/g, '[REDACTED_API_KEY]')
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [REDACTED]')
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, 'postgresql://[REDACTED]')
    .replace(/((?:password|passwd|token|secret|api[_-]?key)\s*[:=]\s*)[^\s,;]+/gi, '$1[REDACTED]')
}

module.exports = { createPathPolicy, findOwnerId, normalizeJid, redactSecrets }
