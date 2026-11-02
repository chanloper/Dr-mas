'use strict';

const { randomBytes, createHash, timingSafeEqual } = require('node:crypto');

class ApiError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
const invalidCredentials = () => new ApiError(401, 'INVALID_CREDENTIALS', '이메일 또는 비밀번호를 확인해 주세요.');
const invalidToken = () => new ApiError(401, 'INVALID_TOKEN', '로그인이 필요합니다.');
const digest = value => createHash('sha256').update(value).digest('hex');

function credentials(body, registration = false) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ApiError(422, 'INVALID_INPUT', '입력 정보를 확인해 주세요.');
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  // Explicit ASCII email policy; IDN/international mailbox support needs a separate contract.
  const [local, domain, extra] = email.split('@');
  if (email.length > 254 || !local || local.length > 64 || !domain || extra !== undefined
      || !/^[a-z0-9.!#$%&'*+\/=?^_`{|}~-]+$/.test(local)
      || local.startsWith('.') || local.endsWith('.') || local.includes('..')
      || domain.length > 253 || domain.split('.').length < 2
      || !domain.split('.').every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) {
    throw new ApiError(422, 'INVALID_EMAIL', '올바른 이메일을 입력해 주세요.');
  }
  const password = body.password;
  if (typeof password !== 'string' || !password.length || password.includes('\0') || Buffer.byteLength(password, 'utf8') > 72 || (registration && password.length < 8)) {
    throw new ApiError(422, 'INVALID_PASSWORD', '비밀번호는 8자 이상, UTF-8 기준 72바이트 이내로 입력해 주세요.');
  }
  if (!registration) return { email, password };
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name || [...name].length > 30 || /[\u0000-\u001f\u007f<>"\\\u2028\u2029]/u.test(name)) throw new ApiError(422, 'INVALID_NAME', '이름은 30자 이내로 입력해 주세요.');
  if (body.requestedRole !== 'patient' && body.requestedRole !== 'guardian') throw new ApiError(422, 'INVALID_ROLE', '가입 역할을 확인해 주세요.');
  if (body.requestedRole === 'guardian') throw new ApiError(403, 'ROLE_APPROVAL_REQUIRED', '보호자 계정은 별도 승인 절차가 필요합니다.');
  return { email, password, name };
}

function bearer(header) {
  if (typeof header !== 'string' || !/^Bearer [A-Za-z0-9_-]{43}$/i.test(header)) throw invalidToken();
  return header.slice(7);
}

function publicUser(row) {
  if (!row || (row.role !== 'patient' && row.role !== 'guardian')) throw new ApiError(403, 'ACCOUNT_UNAVAILABLE', '계정 권한을 확인할 수 없습니다.');
  return { id: String(row.user_id), email: row.email, name: row.username, role: row.role };
}

function createAuthService({ repository, passwords, tokenTtlSeconds = 3600, now = () => new Date(), dummyHash }) {
  function issue(passwordHash) {
    const accessToken = randomBytes(32).toString('base64url');
    return { accessToken, tokenHash: digest(accessToken), credentialHash: digest(passwordHash), expiresAt: new Date(now().getTime() + tokenTtlSeconds * 1000) };
  }
  return {
    async register(body) {
      const input = credentials(body, true);
      const passwordHash = await passwords.hash(input.password, 10);
      const session = issue(passwordHash);
      try {
        await repository.register({
          email: input.email, username: input.name, passwordHash,
          // Fits both legacy login_id VARCHAR(50) definitions; never infer email identity.
          loginId: `mob_${randomBytes(16).toString('hex')}`,
          role: 'patient', session,
        });
      } catch (error) {
        if (error.code === 'EMAIL_EXISTS') throw new ApiError(409, 'EMAIL_EXISTS', '이미 가입된 이메일입니다.');
        throw error;
      }
      return { accessToken: session.accessToken };
    },
    async login(body) {
      const input = credentials(body);
      const row = await repository.findByEmail(input.email);
      // Use bcrypt on both paths to avoid a fast nonexistent-user response.
      const matched = await passwords.compare(input.password, row?.password || dummyHash);
      if (!row || !matched) throw invalidCredentials();
      publicUser(row);
      const session = issue(row.password);
      await repository.createSession(row.user_id, session);
      return { accessToken: session.accessToken };
    },
    async me(header) {
      const row = await repository.findSession(digest(bearer(header)), now());
      if (!row) throw invalidToken();
      // Password changes made by the legacy web app also invalidate these sessions.
      const expected = digest(row.password);
      if (typeof row.credential_hash !== 'string' || !/^[a-f0-9]{64}$/.test(row.credential_hash)
          || !timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(row.credential_hash, 'hex'))) throw invalidToken();
      return publicUser(row);
    },
    async logout(header) {
      await repository.deleteSession(digest(bearer(header)));
    },
  };
}

module.exports = { ApiError, createAuthService };
