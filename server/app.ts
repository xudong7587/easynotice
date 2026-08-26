import path from 'node:path';
import express, { type ErrorRequestHandler } from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { ZodError } from 'zod';
import multer from 'multer';
import { authRouter, requireAuth } from './auth.js';
import { apiRouter } from './api.js';
import { webhookRouter } from './webhook.js';
import { weComCallbackRouter } from './wecom-callback.js';
import { db } from './db.js';
import { isProduction, maxJsonBody } from './config.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'", 'data:'],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
    crossOriginResourcePolicy: { policy: 'same-origin' },
  }));
  app.use(cookieParser());
  app.use(express.json({ limit: maxJsonBody, type: ['application/json', 'application/*+json'] }));
  app.use(express.urlencoded({ extended: true, limit: maxJsonBody }));
  app.use(express.text({ type: ['text/*', 'application/xml'], limit: maxJsonBody }));

  app.get('/health', (_request, response) => {
    try {
      db.prepare('SELECT 1').get();
      response.json({ status: 'ok', service: 'easynotice', time: new Date().toISOString() });
    } catch {
      response.status(503).json({ status: 'error', service: 'easynotice' });
    }
  });

  app.use(webhookRouter);
  app.use(weComCallbackRouter);
  app.use('/api', authRouter);
  app.use('/api', requireAuth, apiRouter);

  if (isProduction) {
    const staticDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(staticDir, { index: false, maxAge: '1h' }));
    app.use((request, response, next) => {
      if (request.method === 'GET' && request.accepts('html')) {
        response.sendFile(path.join(staticDir, 'index.html'));
        return;
      }
      next();
    });
  }

  app.use((_request, response) => {
    response.status(404).json({ error: '请求的地址不存在' });
  });

  const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
    if (response.headersSent) return;
    if (error instanceof ZodError) {
      response.status(400).json({ error: error.issues[0]?.message || '填写内容不正确', issues: error.issues });
      return;
    }
    if (error instanceof multer.MulterError) {
      const message = error.code === 'LIMIT_FILE_SIZE' ? '图片不能超过 4 MB' : error.message;
      response.status(400).json({ error: message });
      return;
    }
    const status = Number((error as { statusCode?: number }).statusCode || 500);
    const message = error instanceof Error ? error.message : '服务内部错误';
    if (status >= 500) console.error('[EasyNotice]', error);
    response.status(status).json({ error: status >= 500 && !message ? '服务内部错误' : message });
  };
  app.use(errorHandler);
  return app;
}
