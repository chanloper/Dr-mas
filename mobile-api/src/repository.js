'use strict';

function createRepository(pool) {
  return {
    async register({ loginId, passwordHash, username, email, role, session }) {
      const conn = await pool.getConnection();
      let inTransaction = false;
      let insertingEmail = false;
      try {
        await conn.beginTransaction(); inTransaction = true;
        const result = await conn.query('INSERT INTO Users (login_id, password, username) VALUES (?, ?, ?)', [loginId, passwordHash, username]);
        insertingEmail = true;
        await conn.query('INSERT INTO mobile_auth_accounts (user_id, email, role) VALUES (?, ?, ?)', [result.insertId, email, role]);
        insertingEmail = false;
        await conn.query('INSERT INTO mobile_auth_sessions (token_hash, user_id, credential_hash, expires_at) VALUES (?, ?, ?, ?)', [session.tokenHash, result.insertId, session.credentialHash, session.expiresAt]);
        await conn.commit(); inTransaction = false;
      } catch (error) {
        if (inTransaction) await conn.rollback();
        if (insertingEmail && error.code === 'ER_DUP_ENTRY') {
          const conflict = new Error('Email already registered'); conflict.code = 'EMAIL_EXISTS'; throw conflict;
        }
        throw error;
      } finally { conn.release(); }
    },
    async findByEmail(email) {
      const rows = await pool.query('SELECT u.user_id, u.password, u.username, a.email, a.role FROM mobile_auth_accounts a JOIN Users u ON u.user_id = a.user_id WHERE a.email = ? LIMIT 1', [email]);
      return rows[0] || null;
    },
    async createSession(userId, session) {
      await pool.query('INSERT INTO mobile_auth_sessions (token_hash, user_id, credential_hash, expires_at) VALUES (?, ?, ?, ?)', [session.tokenHash, userId, session.credentialHash, session.expiresAt]);
    },
    async findSession(tokenHash, now) {
      const rows = await pool.query('SELECT u.user_id, u.password, u.username, a.email, a.role, s.credential_hash FROM mobile_auth_sessions s JOIN mobile_auth_accounts a ON a.user_id = s.user_id JOIN Users u ON u.user_id = a.user_id WHERE s.token_hash = ? AND s.expires_at > ? LIMIT 1', [tokenHash, now]);
      return rows[0] || null;
    },
    async deleteSession(tokenHash) {
      await pool.query('DELETE FROM mobile_auth_sessions WHERE token_hash = ?', [tokenHash]);
    },
  };
}
module.exports = { createRepository };
