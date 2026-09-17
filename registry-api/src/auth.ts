/**
 * Sbarramento con password unica davanti alla sezione admin DPP: cookie di sessione firmato
 * HMAC, confronto password a tempo costante, nessuno stato lato server oltre al segreto di
 * firma. Risposta sempre JSON: il login lo disegna Angular (client-side), non questo servizio.
 *
 * Configurazione (variabili d'ambiente):
 *   REGISTRY_ADMIN_PASSWORD  la password. Se vuota o assente, il cancello è SPENTO (sviluppo).
 *   REGISTRY_AUTH_SECRET     segreto con cui si firma il cookie di sessione.
 */
import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

const COOKIE_NAME = 'gs1_registry_auth';
const SESSION_DAYS = 30;

function safeEqual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) {
    timingSafeEqual(bufferA, bufferA);
    return false;
  }
  return timingSafeEqual(bufferA, bufferB);
}

function sign(value: string, secret: string): string {
  return createHmac('sha256', secret).update(value).digest('hex');
}

function issueToken(secret: string): string {
  const expiry = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
  return `${expiry}.${sign(String(expiry), secret)}`;
}

function isTokenValid(token: string | undefined, secret: string): boolean {
  if (!token) return false;
  const [expiry, signature] = token.split('.');
  if (!expiry || !signature) return false;
  if (Number(expiry) < Date.now()) return false;
  return safeEqual(signature, sign(expiry, secret));
}

function readCookie(header: string | undefined, name: string): string | undefined {
  return header
    ?.split(';')
    .map((part) => part.trim().split('='))
    .find(([key]) => key === name)?.[1];
}

const password = process.env.REGISTRY_ADMIN_PASSWORD || '';
const secret = process.env.REGISTRY_AUTH_SECRET || randomBytes(32).toString('hex');
const gateEnabled = !!password;

if (!gateEnabled) {
  console.log('[auth] REGISTRY_ADMIN_PASSWORD non impostata: accesso libero.');
} else if (!process.env.REGISTRY_AUTH_SECRET) {
  console.warn('[auth] REGISTRY_AUTH_SECRET non impostata: uso un segreto casuale, le sessioni non sopravvivono ai riavvii.');
}

function setSessionCookie(req: Request, res: Response): void {
  const secure = (req.headers['x-forwarded-proto'] || '') === 'https';
  res.setHeader(
    'Set-Cookie',
    [
      `${COOKIE_NAME}=${issueToken(secret)}`,
      'Path=/',
      'HttpOnly',
      'SameSite=Lax',
      `Max-Age=${SESSION_DAYS * 24 * 60 * 60}`,
      secure ? 'Secure' : '',
    ]
      .filter(Boolean)
      .join('; ')
  );
}

/** `POST /login` — verifica la password e apre la sessione. */
export function loginHandler(req: Request, res: Response): void {
  if (!gateEnabled) {
    res.json({ ok: true });
    return;
  }
  const submitted = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!safeEqual(submitted, password)) {
    // Mai loggare il valore ricevuto.
    res.status(401).json({ error: 'password errata' });
    return;
  }
  setSessionCookie(req, res);
  res.json({ ok: true });
}

/** `POST /logout` — invalida il cookie lato client (nessuno stato server da revocare). */
export function logoutHandler(_req: Request, res: Response): void {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; Max-Age=0`);
  res.json({ ok: true });
}

/** Middleware da applicare a tutte le rotte DPP: 401 JSON se la sessione non è valida. */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!gateEnabled || isTokenValid(readCookie(req.headers.cookie, COOKIE_NAME), secret)) {
    next();
    return;
  }
  res.status(401).json({ error: 'authentication required' });
}
