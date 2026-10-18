const fs = require('node:fs')
const path = require('node:path')
const { inferTask } = require('../src/task-state')

const scenarios = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'evals', 'agent-scenarios.json'), 'utf8'))
let passed = 0

for (const scenario of scenarios) {
  const task = inferTask(scenario.input)
  const missingGroups = scenario.expectedGroups.filter((group) => !task.groups.includes(group))
  const missingEvidence = scenario.requiredEvidence.filter((item) => !task.requiredEvidence.includes(item))
  const ok = missingGroups.length === 0 && missingEvidence.length === 0
  if (ok) passed += 1
  console.log(`${ok ? 'PASS' : 'FAIL'} ${scenario.id}`)
  if (missingGroups.length) console.log(`  kelompok tool belum terpilih: ${missingGroups.join(', ')}`)
  if (missingEvidence.length) console.log(`  bukti belum diwajibkan: ${missingEvidence.join(', ')}`)
}

console.log(`\n${passed}/${scenarios.length} skenario routing dan bukti lulus.`)
if (passed !== scenarios.length) process.exitCode = 1
