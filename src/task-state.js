const crypto = require('node:crypto')

const TOOL_GROUPS = {
  web: new Set(['web_search', 'web_image_search', 'web_download_image', 'web_fetch_source', 'browser_open', 'browser_inspect', 'browser_click', 'browser_fill', 'browser_select_option', 'browser_set_checkbox', 'browser_upload_file', 'browser_submit_form', 'browser_back', 'browser_reload', 'browser_new_tab', 'browser_list_tabs', 'browser_switch_tab', 'browser_close_tab', 'browser_press']),
  files: new Set(['list_directory', 'read_text_file', 'write_text_file', 'send_local_file', 'run_full_command']),
  desktop: new Set(['launch_application', 'close_application', 'list_running_applications', 'capture_desktop_screenshot', 'inspect_desktop', 'read_image_file', 'focus_application', 'get_cursor_position', 'move_cursor', 'click_screen', 'drag_screen', 'scroll_screen', 'type_text', 'press_windows_shortcut', 'press_keys', 'run_full_command']),
  camera: new Set(['capture_camera_photo']),
  system: new Set(['get_system_info', 'run_cmd_command', 'run_full_command']),
  mcp: new Set(['mcp_status', 'mcp_list_tools', 'mcp_call_tool', 'mcp_list_resources', 'mcp_read_resource', 'mcp_list_prompts', 'mcp_get_prompt'])
}
const KNOWN_TOOLS = new Set(Object.values(TOOL_GROUPS).flatMap((group) => [...group]))
const TAB_TOOLS = new Set(['browser_new_tab', 'browser_list_tabs', 'browser_switch_tab', 'browser_close_tab'])
const DESKTOP_MUTATIONS = new Set(['launch_application', 'close_application', 'move_cursor', 'click_screen', 'drag_screen', 'scroll_screen', 'type_text', 'press_keys', 'press_windows_shortcut'])

function includesAny(text, words) {
  return words.some((word) => text.includes(word))
}

function inferTask(requestText) {
  const text = String(requestText || '').trim()
  const lower = text.toLowerCase()
  const groups = new Set()
  const evidence = []
  let deliverable = 'answer'

  if (includesAny(lower, ['web', 'website', 'situs', 'google', 'internet', 'url', 'source', 'html', 'cari', 'carikan', 'riset', 'browser', 'form', 'formulir', 'submit', 'upload', 'dropdown', 'checkbox', 'tab'])) groups.add('web')
  if (includesAny(lower, ['gambar', 'image', 'foto']) && includesAny(lower, ['cari', 'carikan', 'web', 'internet', 'google', 'kirim'])) {
    groups.add('web')
    deliverable = 'image'
    evidence.push('media_ready')
  }
  if (includesAny(lower, ['file', 'folder', 'direktori', 'kode', 'script', 'project', 'proyek', 'npm']) ||
      (includesAny(lower, ['vscode', 'vs code']) && includesAny(lower, ['buat', 'ubah', 'edit', 'tulis', 'jalankan']))) {
    groups.add('files')
    evidence.push('artifact_checked')
  }
  if (includesAny(lower, ['aplikasi', 'jendela', 'layar', 'desktop', 'klik', 'ketik', 'keyboard', 'mouse', 'kursor', 'cursor', 'scroll', 'drag', 'geser', 'vscode', 'vs code', 'chrome', 'notepad'])) groups.add('desktop')
  if (includesAny(lower, ['kamera', 'webcam', 'jepret', 'potret'])) {
    groups.add('camera')
    deliverable = 'image'
    evidence.push('media_ready')
  }
  if (includesAny(lower, ['ram', 'memori', 'sistem', 'cmd', 'terminal', 'powershell', 'perintah', 'hostname', 'ipconfig'])) groups.add('system')
  if (lower.includes('mcp')) groups.add('mcp')
  if (groups.size === 0) groups.add('system')

  if (groups.has('web') && deliverable === 'answer') evidence.push('source_read')
  if (includesAny(lower, ['submit', 'kirim form', 'kirim formulir', 'daftar', 'registrasi'])) evidence.push('form_submitted')
  const hasExactDesktopCoordinates = /\b(?:gerakkan|gerakan|pindahkan|geser|klik|click)\b[^\n]*-?\d+\s*[,x]\s*-?\d+/i.test(text)
  if (groups.has('desktop') && !hasExactDesktopCoordinates) evidence.push('state_checked')
  return {
    id: crypto.randomUUID(),
    goal: text.slice(0, 1_000),
    deliverable,
    groups: [...groups],
    requiredEvidence: [...new Set(evidence)],
    evidence: [],
    completedSteps: [],
    actions: [],
    artifacts: [],
    failures: [],
    status: 'active',
    updatedAt: new Date().toISOString()
  }
}

function routeDefinitions(definitions, task, { includeResponseTools = true } = {}) {
  const selected = new Set()
  for (const group of task.groups) {
    for (const name of TOOL_GROUPS[group] || []) selected.add(name)
  }
  // Tool observasi dan eksekusi umum dibutuhkan untuk memeriksa hasil tindakan.
  if (task.groups.includes('desktop')) {
    selected.add('inspect_desktop')
    selected.add('list_running_applications')
  }
  if (task.groups.includes('files')) selected.add('run_full_command')
  return definitions.filter((tool) => {
    const name = tool?.function?.name
    if (TAB_TOOLS.has(name) && !/\b(tab|halaman (?:baru|terpisah)|jendela browser (?:baru|lain))\b/i.test(task.goal)) return false
    return selected.has(name) || (task.groups.includes('mcp') && !KNOWN_TOOLS.has(name)) ||
      (includeResponseTools && /^send_(buttons|list|poll)$/.test(name))
  })
}

function resultText(result) {
  if (result?.type === 'data') return JSON.stringify(result.data)
  if (result?.type === 'response' && result.response?.type === 'text') return result.response.text
  if (result?.type === 'text') return result.text
  if (result?.type === 'response') return `Media ${result.response?.type || 'unknown'} siap dikirim.`
  return 'Tool tidak mengembalikan hasil.'
}

function classifyFailure(text) {
  const value = String(text || '').toLowerCase()
  if (/timed? out|timeout|408/.test(value)) return 'timeout'
  if (/ditolak|denied|forbidden|tidak memiliki izin|401|403/.test(value)) return 'access_denied'
  if (/tidak ditemukan|not found|404/.test(value)) return 'not_found'
  if (/tidak valid|invalid|schema|argument/.test(value)) return 'invalid_input'
  if (/kosong|empty|tidak mengembalikan/.test(value)) return 'empty_result'
  return 'tool_error'
}

function safeActionArguments(name, args = {}) {
  const result = { ...args }
  const sensitiveKeys = {
    browser_fill: ['text'],
    type_text: ['text'],
    run_full_command: ['command'],
    write_text_file: ['content']
  }[name] || []
  for (const key of sensitiveKeys) {
    if (result[key] === undefined) continue
    if (result[key]?.redacted === true && typeof result[key]?.sha256 === 'string') continue
    result[key] = { redacted: true, sha256: crypto.createHash('sha256').update(String(result[key])).digest('hex').slice(0, 16) }
  }
  return result
}

function actionSignature(name, args = {}, failureType = null) {
  return JSON.stringify([name, safeActionArguments(name, args), failureType])
}

function normalizeToolResult(name, result) {
  const text = resultText(result)
  const failed = result?.type === 'text' && /^(tindakan gagal|tool tidak|pembacaan yang sama)/i.test(text)
  const evidence = []
  if (!failed) {
    if (name === 'web_fetch_source' || name === 'browser_open' || name === 'browser_inspect') evidence.push('source_read')
    if (name === 'browser_submit_form') evidence.push('form_submitted', 'source_read')
    if (name === 'web_download_image' || name === 'capture_camera_photo' || result?.response?.type === 'image') evidence.push('media_ready')
    if (['inspect_desktop', 'list_running_applications', 'focus_application'].includes(name)) evidence.push('state_checked')
    if (['read_text_file', 'list_directory'].includes(name)) evidence.push('artifact_checked')
    if (name === 'run_full_command' && !/exit\s*code[^0-9-]*[1-9]/i.test(text)) evidence.push('artifact_checked')
  }
  return {
    ok: !failed,
    summary: text.slice(0, 12_000),
    evidence,
    failureType: failed ? classifyFailure(text) : null
  }
}

function updateTask(task, name, args, outcome) {
  const signature = actionSignature(name, args, outcome.failureType)
  if (outcome.ok) {
    if (DESKTOP_MUTATIONS.has(name)) task.evidence = task.evidence.filter((item) => item !== 'state_checked')
    task.completedSteps.push({ tool: name, summary: outcome.summary.slice(0, 500) })
    task.evidence.push(...outcome.evidence)
    task.evidence = [...new Set(task.evidence)]
    if (!Array.isArray(task.artifacts)) task.artifacts = []
    if (name === 'web_image_search') {
      try {
        const parsed = JSON.parse(outcome.summary)
        const candidates = Array.isArray(parsed.results) ? parsed.results : []
        task.artifacts = candidates.slice(0, 8).map((item, index) => ({
          type: 'image_candidate',
          index: index + 1,
          title: String(item.title || '').slice(0, 200),
          imageUrl: String(item.imageUrl || ''),
          sourceUrl: String(item.sourceUrl || '')
        })).filter((item) => /^https?:\/\//.test(item.imageUrl) && /^https?:\/\//.test(item.sourceUrl))
      } catch {
        // Hasil yang tidak berbentuk JSON tetap tersedia sebagai ringkasan tool.
      }
    }
  } else {
    task.failures.push({ tool: name, type: outcome.failureType, signature })
  }
  if (!Array.isArray(task.actions)) task.actions = []
  task.actions.push({ tool: name, arguments: safeActionArguments(name, args), ok: outcome.ok, failureType: outcome.failureType })
  task.updatedAt = new Date().toISOString()
  return task
}

function missingEvidence(task) {
  return task.requiredEvidence.filter((item) => !task.evidence.includes(item))
}

function taskContext(task) {
  if (!task) {
    return JSON.stringify({
      taskId: null,
      goal: '',
      deliverable: 'answer',
      completed: [],
      recentResults: [],
      artifacts: [],
      evidence: [],
      missingEvidence: [],
      failures: []
    })
  }
  return JSON.stringify({
    taskId: task.id,
    goal: task.goal,
    deliverable: task.deliverable,
    completed: task.completedSteps.map((step) => step.tool),
    recentResults: task.completedSteps.slice(-3),
    artifacts: (task.artifacts || []).slice(0, 8),
    evidence: task.evidence,
    missingEvidence: missingEvidence(task),
    failures: task.failures.slice(-4).map(({ tool, type }) => ({ tool, type }))
  })
}

function repeatedFailure(task, name, args, failureType) {
  const signature = actionSignature(name, args, failureType)
  return task.failures.filter((failure) => failure.signature === signature).length >= 2
}

module.exports = {
  actionSignature,
  classifyFailure,
  inferTask,
  missingEvidence,
  normalizeToolResult,
  repeatedFailure,
  routeDefinitions,
  taskContext,
  updateTask
}
