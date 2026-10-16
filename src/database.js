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

    // Pesan lama dianggap sudah selesai; hanya pesan baru yang memakai alur pengiriman ini.
    await pool.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS delivery_status TEXT NOT NULL DEFAULT 'sent'`)
    await pool.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS reply_payload JSONB`)
    await pool.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS reply_history_text TEXT`)
    await pool.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS delivery_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`)
    await pool.query(`
      CREATE INDEX IF NOT EXISTS messages_ready_delivery_idx
      ON messages (created_at)
      WHERE role = 'user' AND delivery_status = 'ready'
    `)

    await pool.query(`
      CREATE TABLE IF NOT EXISTS pending_agent_actions (
        token TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        requester_id TEXT NOT NULL,
        action_name TEXT NOT NULL,
        action_arguments JSONB NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        resolved_at TIMESTAMPTZ
      )
    `)

    await pool.query(`
      CREATE TABLE IF NOT EXISTS agent_audit_logs (
        id BIGSERIAL PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        requester_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        action_name TEXT,
        outcome TEXT NOT NULL,
        details JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)
  }

  async function saveIncomingMessage({ conversationId, messageId, content }) {
    const result = await pool.query(
      `INSERT INTO messages (conversation_id, external_message_id, role, content, delivery_status)
       VALUES ($1, $2, 'user', $3, 'processing')
       ON CONFLICT (external_message_id) DO NOTHING
       RETURNING id`,
      [conversationId, messageId, content]
    )

    if (result.rowCount === 1) return { status: 'new' }

    const existing = await pool.query(
      `SELECT delivery_status, reply_payload
       FROM messages
       WHERE conversation_id = $1 AND external_message_id = $2 AND role = 'user'`,
      [conversationId, messageId]
    )
    if (existing.rowCount !== 1) return { status: 'duplicate' }
    return {
      status: existing.rows[0].delivery_status,
      response: existing.rows[0].reply_payload
    }
  }

  async function prepareReply({ conversationId, messageId, response, historyText }) {
    const result = await pool.query(
      `UPDATE messages
       SET delivery_status = 'ready', reply_payload = $3::jsonb,
           reply_history_text = $4, delivery_updated_at = NOW()
       WHERE conversation_id = $1 AND external_message_id = $2
         AND role = 'user' AND delivery_status = 'processing'
       RETURNING id`,
      [conversationId, messageId, JSON.stringify(response), historyText]
    )
    return result.rowCount === 1
  }

  async function replacePreparedReply({ conversationId, messageId, response, historyText }) {
    await pool.query(
      `UPDATE messages
       SET reply_payload = $3::jsonb, reply_history_text = $4, delivery_updated_at = NOW()
       WHERE conversation_id = $1 AND external_message_id = $2
         AND role = 'user' AND delivery_status = 'ready'`,
      [conversationId, messageId, JSON.stringify(response), historyText]
    )
  }

  async function markReplySent({ conversationId, messageId }) {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const result = await client.query(
        `UPDATE messages
         SET delivery_status = 'sent', delivery_updated_at = NOW()
         WHERE conversation_id = $1 AND external_message_id = $2
           AND role = 'user' AND delivery_status = 'ready'
         RETURNING reply_history_text`,
        [conversationId, messageId]
      )
      if (result.rowCount === 1) {
        await client.query(
          `INSERT INTO messages (conversation_id, role, content)
           VALUES ($1, 'assistant', $2)`,
          [conversationId, result.rows[0].reply_history_text]
        )
      }
      await client.query('COMMIT')
      return result.rowCount === 1
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }

  async function getPendingReplies() {
    const result = await pool.query(
      `SELECT conversation_id, external_message_id, reply_payload
       FROM messages
       WHERE role = 'user' AND delivery_status = 'ready'
       ORDER BY created_at ASC`
    )
    return result.rows.map((row) => ({
      conversationId: row.conversation_id,
      messageId: row.external_message_id,
      response: row.reply_payload
    }))
  }

  async function getReplyState({ conversationId, messageId }) {
    const result = await pool.query(
      `SELECT delivery_status, reply_payload
       FROM messages
       WHERE conversation_id = $1 AND external_message_id = $2 AND role = 'user'`,
      [conversationId, messageId]
    )
    if (result.rowCount !== 1) return null
    return { status: result.rows[0].delivery_status, response: result.rows[0].reply_payload }
  }

  async function recoverInterruptedMessages(errorResponse, includeRecent = false) {
    const result = await pool.query(
      `UPDATE messages
       SET delivery_status = 'ready', reply_payload = $1::jsonb,
           reply_history_text = $2, delivery_updated_at = NOW()
       WHERE role = 'user' AND delivery_status = 'processing'
         AND ($3::boolean OR delivery_updated_at < NOW() - INTERVAL '2 minutes')
       RETURNING id`,
      [JSON.stringify(errorResponse), errorResponse.text, includeRecent]
    )
    return result.rowCount
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

  async function createPendingAction(action) {
    await pool.query(
      `INSERT INTO pending_agent_actions
       (token, conversation_id, requester_id, action_name, action_arguments, expires_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6)`,
      [
        action.token,
        action.conversationId,
        action.requesterId,
        action.actionName,
        JSON.stringify(action.arguments || {}),
        action.expiresAt
      ]
    )
  }

  async function resolvePendingAction({ token, conversationId, requesterId, decision }) {
    const result = await pool.query(
      `UPDATE pending_agent_actions
       SET status = $4, resolved_at = NOW()
       WHERE token = $1
         AND conversation_id = $2
         AND requester_id = $3
         AND status = 'pending'
         AND expires_at > NOW()
       RETURNING action_name, action_arguments`,
      [token, conversationId, requesterId, decision]
    )
    if (result.rowCount !== 1) return null
    return {
      name: result.rows[0].action_name,
      arguments: result.rows[0].action_arguments
    }
  }

  async function saveAuditLog(entry) {
    await pool.query(
      `INSERT INTO agent_audit_logs
       (conversation_id, requester_id, event_type, action_name, outcome, details)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
      [
        entry.conversationId,
        entry.requesterId,
        entry.eventType,
        entry.actionName || null,
        entry.outcome,
        JSON.stringify(entry.details || {})
      ]
    )
  }

  return {
    initialize,
    saveIncomingMessage,
    prepareReply,
    replacePreparedReply,
    markReplySent,
    getPendingReplies,
    getReplyState,
    recoverInterruptedMessages,
    getConversationHistory,
    createPendingAction,
    resolvePendingAction,
    saveAuditLog,
    close: () => pool.end()
  }
}

module.exports = { createDatabase }
