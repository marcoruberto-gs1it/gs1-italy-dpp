import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response as ExpressResponse } from 'express';

/**
 * Traccia delle chiamate USCENTI che registry-api fa mentre serve una richiesta del browser
 * (Auth0, DPP Registry UE, proof, GS1 Digital Link Resolver): l'interfaccia mostra i JSON di
 * OGNI chiamata API — quelle del browser verso questo servizio le cattura l'interceptor del
 * frontend, quelle del server verso i servizi esterni finiscono qui.
 *
 * Ogni richiesta riceve un id (header `X-Trace-Id`); il frontend recupera la traccia solo quando
 * l'utente la apre (`GET /registry-api/trace/:id`). Le tracce stanno in memoria (ultime 300): non
 * sono un log, servono solo a rendere ispezionabile ciò che è appena successo. I segreti
 * (Authorization, client_secret, token) sono oscurati PRIMA di salvare, mai dopo.
 */
export interface OutboundCall {
  seq: number;
  label: string;
  method: string;
  url: string;
  at: string;
  durationMs: number;
  requestHeaders: Record<string, string>;
  requestBody: unknown;
  status: number | null;
  responseBody: unknown;
  error?: string;
}

export interface Trace {
  id: string;
  method: string;
  path: string;
  startedAt: string;
  calls: OutboundCall[];
}

const MAX_TRACES = 300;
const MAX_BODY_CHARS = 20_000;
const SECRET_KEYS = /^(client_secret|access_token|id_token|refresh_token|password|authorization)$/i;

const store = new AsyncLocalStorage<Trace>();
const traces = new Map<string, Trace>();

export function traceMiddleware(req: Request, res: ExpressResponse, next: NextFunction): void {
  if (/^\/(trace|health|warmup)/.test(req.path)) {
    next();
    return;
  }
  const trace: Trace = { id: randomUUID(), method: req.method, path: req.originalUrl.split('?')[0], startedAt: new Date().toISOString(), calls: [] };
  traces.set(trace.id, trace);
  if (traces.size > MAX_TRACES) traces.delete(traces.keys().next().value as string);
  res.setHeader('X-Trace-Id', trace.id);
  store.run(trace, next);
}

export function getTrace(id: string): Trace | undefined {
  return traces.get(id);
}

function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, SECRET_KEYS.test(k) ? '***' : redact(v)]));
  }
  return value;
}

function parseBody(text: string | undefined | null): unknown {
  if (!text) return null;
  const clipped = text.length > MAX_BODY_CHARS ? text.slice(0, MAX_BODY_CHARS) + '…[troncato]' : text;
  try {
    return redact(JSON.parse(text));
  } catch {
    return clipped;
  }
}

function redactHeaders(headers: HeadersInit | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  new Headers(headers).forEach((value, key) => {
    // "Bearer eyJ…" → "Bearer ***": si vede lo schema, mai il token.
    out[key] = SECRET_KEYS.test(key) ? (value.includes(' ') ? `${value.split(' ')[0]} ***` : '***') : value;
  });
  return out;
}

/** fetch con registrazione nella traccia della richiesta corrente (se c'è). Il comportamento verso
 * il chiamante è IDENTICO a fetch: la risposta viene solo clonata per leggerne il corpo. */
export async function tracedFetch(label: string, url: string, init: RequestInit = {}): Promise<Response> {
  const trace = store.getStore();
  if (!trace) return fetch(url, init);
  const started = Date.now();
  const call: OutboundCall = {
    seq: trace.calls.length + 1,
    label,
    method: (init.method ?? 'GET').toUpperCase(),
    url,
    at: new Date().toISOString(),
    durationMs: 0,
    requestHeaders: redactHeaders(init.headers),
    requestBody: typeof init.body === 'string' ? parseBody(init.body) : null,
    status: null,
    responseBody: null,
  };
  trace.calls.push(call);
  try {
    const response = await fetch(url, init);
    call.status = response.status;
    call.responseBody = parseBody(await response.clone().text().catch(() => null));
    return response;
  } catch (err) {
    call.error = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    throw err;
  } finally {
    call.durationMs = Date.now() - started;
  }
}
