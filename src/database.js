const { Pool } = require('pg')

function createDatabase(connectionString) {
  const pool = new Pool({ connectionString })

  async function initialize() {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id BIGSERIAL PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        external_message_id TEXT UNIQUE,
        role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
        content TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)

    await pool.query(`
      CREATE INDEX IF NOT EXISTS messages_conversation_created_idx
      ON messages (conversation_id, created_at DESC, id DESC)
    `)
  }

  async function saveIncomingMessage({ conversationId, messageId, content }) {
    const result = await pool.query(
      `INSERT INTO messages (conversation_id, external_message_id, role, content)
       VALUES ($1, $2, 'user', $3)
       ON CONFLICT (external_message_id) DO NOTHING
       RETURNING id`,
      [conversationId, messageId, content]
    )

    return result.rowCount === 1
  }

  async function saveAssistantMessage({ conversationId, content }) {
    await pool.query(
      `INSERT INTO messages (conversation_id, role, content)
       VALUES ($1, 'assistant', $2)`,
      [conversationId, content]
    )
  }

  async function getConversationHistory(conversationId, limit) {
    const result = await pool.query(
      `SELECT role, content
       FROM (
         SELECT id, role, content, created_at
         FROM messages
         WHERE conversation_id = $1
         ORDER BY created_at DESC, id DESC
         LIMIT $2
       ) recent_messages
       ORDER BY created_at ASC, id ASC`,
      [conversationId, limit]
    )

    return result.rows
  }

  return {
    initialize,
    saveIncomingMessage,
    saveAssistantMessage,
    getConversationHistory,
    close: () => pool.end()
  }
}

module.exports = { createDatabase }
