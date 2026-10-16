const RESPONSE_TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'send_buttons',
      description: 'Mengirim hingga tiga tombol pilihan ketika pengguna perlu memilih langkah berikutnya. Setiap label tombol wajib berisi 1 sampai 20 karakter.',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string' },
          footer: { type: 'string' },
          options: {
            type: 'array',
            minItems: 1,
            maxItems: 3,
            items: {
              type: 'object',
              properties: { id: { type: 'string', minLength: 1, maxLength: 100 }, label: { type: 'string', minLength: 1, maxLength: 20 } },
              required: ['id', 'label'],
              additionalProperties: false
            }
          }
        },
        required: ['text', 'options'],
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'send_list',
      description: 'Mengirim daftar pilihan yang lebih panjang.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          text: { type: 'string' },
          buttonText: { type: 'string' },
          options: {
            type: 'array',
            minItems: 1,
            maxItems: 10,
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                title: { type: 'string' },
                description: { type: 'string' }
              },
              required: ['id', 'title'],
              additionalProperties: false
            }
          }
        },
        required: ['title', 'text', 'buttonText', 'options'],
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'send_poll',
      description: 'Mengirim polling saat pengguna meminta pemungutan suara atau pilihan bersama.',
      parameters: {
        type: 'object',
        properties: {
          question: { type: 'string' },
          options: { type: 'array', minItems: 2, maxItems: 12, items: { type: 'string' } },
          selectableCount: { type: 'integer', minimum: 1 }
        },
        required: ['question', 'options'],
        additionalProperties: false
      }
    }
  }
]

function limitedString(value, max, name) {
  const text = String(value || '').trim()
  if (!text || text.length > max) throw new Error(`${name} tidak valid`)
  return text
}

function createResponseTools() {
  function execute(name, args = {}) {
    if (name === 'send_buttons') {
      const options = Array.isArray(args.options) ? args.options.slice(0, 3) : []
      if (options.length === 0) throw new Error('Pilihan tombol kosong')
      return {
        type: 'buttons',
        text: limitedString(args.text, 4_000, 'Teks tombol'),
        footer: String(args.footer || '').slice(0, 60),
        options: options.map((item) => ({
          id: limitedString(item.id, 100, 'ID tombol'),
          label: limitedString(item.label, 20, 'Label tombol')
        }))
      }
    }

    if (name === 'send_list') {
      const options = Array.isArray(args.options) ? args.options.slice(0, 10) : []
      if (options.length === 0) throw new Error('Pilihan daftar kosong')
      return {
        type: 'list',
        title: limitedString(args.title, 60, 'Judul daftar'),
        text: limitedString(args.text, 4_000, 'Teks daftar'),
        buttonText: limitedString(args.buttonText, 20, 'Teks tombol daftar'),
        options: options.map((item) => ({
          id: limitedString(item.id, 100, 'ID daftar'),
          title: limitedString(item.title, 60, 'Judul pilihan'),
          description: String(item.description || '').slice(0, 120)
        }))
      }
    }

    if (name === 'send_poll') {
      const options = Array.isArray(args.options) ? args.options.slice(0, 12).map((item) => limitedString(item, 100, 'Pilihan polling')) : []
      if (options.length < 2) throw new Error('Polling memerlukan minimal dua pilihan')
      return {
        type: 'poll',
        question: limitedString(args.question, 255, 'Pertanyaan polling'),
        options,
        selectableCount: Math.min(Math.max(Number(args.selectableCount) || 1, 1), options.length)
      }
    }

    throw new Error('Tool respons tidak dikenali')
  }

  return {
    definitions: RESPONSE_TOOL_DEFINITIONS,
    has: (name) => RESPONSE_TOOL_DEFINITIONS.some((tool) => tool.function.name === name),
    execute
  }
}

module.exports = { RESPONSE_TOOL_DEFINITIONS, createResponseTools }
