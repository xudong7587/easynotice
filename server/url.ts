import type { Request } from 'express';
import { getSetting } from './db.js';

export function requestBaseUrl(request: Request): string {
  const configured = getSetting('base_url').trim().replace(/\/$/, '');
  if (configured) return configured;
  const forwardedProto = request.header('x-forwarded-proto')?.split(',')[0]?.trim();
  const protocol = forwardedProto || request.protocol || 'http';
  const host = request.header('x-forwarded-host')?.split(',')[0]?.trim() || request.get('host') || 'localhost:18088';
  return `${protocol}://${host}`;
}
