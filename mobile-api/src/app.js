'use strict';

const express = require('express');
const { rateLimit } = require('express-rate-limit');
const { ApiError } = require('./auth');

function createHandlers(service) {
  return {
    register: async (req, res) => res.status(201).json(await service.register(req.body)),
    login: async (req, res) => res.json(await service.login(req.body)),
    me: async (req, res) => res.json(await service.me(req.headers.authorization)),
    logout: async (req, res) => { await service.logout(req.headers.authorization); res.status(204).end(); },
  };
}
function errorHandler(error, _req, res, _next) {
  if (error instanceof ApiError) return res.status(error.status).json({ code: error.code, message: error.message });
  if (error.type === 'entity.parse.failed' || error.type === 'entity.too.large' || error.status === 415) {
    return res.status(error.type === 'entity.too.large' ? 413 : 400).json({ code: 'INVALID_BODY', message: '요청 본문을 확인해 주세요.' });
  }
  // Never send/log SQL, credentials, request bodies, tokens, or raw connector errors.
  return res.status(503).json({ code: 'SERVICE_UNAVAILABLE', message: '인증 서비스를 이용할 수 없습니다. 잠시 후 다시 시도해 주세요.' });
}
function createApp(service) {
  const app = express();
  app.disable('x-powered-by');
  // Keep trust proxy disabled until the exact production proxy topology is approved.
  app.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    res.set('X-Content-Type-Options', 'nosniff');
    next();
  });
  app.use('/auth', rateLimit({
    windowMs: 15 * 60 * 1000, limit: 100, standardHeaders: 'draft-8', legacyHeaders: false,
    message: { code: 'RATE_LIMITED', message: '요청이 많습니다. 잠시 후 다시 시도해 주세요.' },
  }));
  app.use(express.json({ limit: '8kb', strict: true }));
  const handlers = createHandlers(service);
  app.post('/auth/register', handlers.register);
  app.post('/auth/login', handlers.login);
  app.get('/auth/me', handlers.me);
  app.post('/auth/logout', handlers.logout);
  app.use((_req, res) => res.status(404).json({ code: 'NOT_FOUND', message: '요청한 API가 없습니다.' }));
  app.use(errorHandler);
  return app;
}
module.exports = { createApp, createHandlers, errorHandler };
