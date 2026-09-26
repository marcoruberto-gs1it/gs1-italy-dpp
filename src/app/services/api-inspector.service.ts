import { HttpErrorResponse, HttpEvent, HttpHandlerFn, HttpRequest, HttpResponse } from '@angular/common/http';
import { PLATFORM_ID, inject, Injectable, signal, computed } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Observable, tap } from 'rxjs';

/** Una chiamata di registry-api al servizio esterno (Auth0, registro UE, resolver) — vedi
 * registry-api/src/trace.ts. Segreti già oscurati lato server. */
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

export interface ApiCall {
  id: number;
  method: string;
  url: string;
  startedAt: Date;
  durationMs: number | null;
  status: number | null;
  requestBody: unknown;
  responseBody: unknown;
  error: string | null;
  /** id della traccia lato server (header X-Trace-Id): le chiamate uscenti del server, caricate a richiesta. */
  traceId: string | null;
  outbound: OutboundCall[] | 'loading' | 'missing' | null;
}

const MAX_CALLS = 200;
const TRACKED = /^\/registry-api\//;
const IGNORED = /^\/registry-api\/(trace\/|warmup|health)/;

/**
 * Registro di TUTTE le chiamate API che l'app fa verso registry-api, con richiesta e risposta
 * JSON: alimenta il pannello "API" sempre raggiungibile (vedi ApiInspectorComponent). Vive solo
 * lato browser. Le chiamate che registry-api fa a sua volta verso Auth0, il registro UE e il
 * resolver non passano dal browser: le espone il server con un id di traccia (header
 * X-Trace-Id) che si recupera solo quando l'utente apre quella chiamata.
 */
@Injectable({ providedIn: 'root' })
export class ApiInspectorService {
  private seq = 0;
  readonly calls = signal<ApiCall[]>([]);
  readonly count = computed(() => this.calls().length);
  readonly open = signal(false);
  readonly selectedId = signal<number | null>(null);

  add(call: Omit<ApiCall, 'id'>): ApiCall {
    const full: ApiCall = { ...call, id: ++this.seq };
    this.calls.update((list) => [full, ...list].slice(0, MAX_CALLS));
    return full;
  }

  update(id: number, patch: Partial<ApiCall>): void {
    this.calls.update((list) => list.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }

  clear(): void {
    this.calls.set([]);
    this.selectedId.set(null);
  }

  /** Apre il pannello, opzionalmente già sulla chiamata più recente che SCRIVE (POST/PUT/PATCH/
   * DELETE) — di solito quella che interessa — o, se non ce ne sono, sull'ultima in assoluto. */
  show(latest = false): void {
    this.open.set(true);
    const calls = this.calls();
    if (latest && calls.length) this.selectedId.set((calls.find((c) => c.method !== 'GET') ?? calls[0]).id);
  }
}

/** Interceptor funzionale: registra ogni chiamata a /registry-api (esclusi trace/warmup/health). */
export function apiInspectorInterceptor(req: HttpRequest<unknown>, next: HttpHandlerFn): Observable<HttpEvent<unknown>> {
  const inspector = inject(ApiInspectorService);
  if (!isPlatformBrowser(inject(PLATFORM_ID)) || !TRACKED.test(req.url) || IGNORED.test(req.url)) return next(req);
  const started = performance.now();
  const call = inspector.add({
    method: req.method,
    url: req.urlWithParams,
    startedAt: new Date(),
    durationMs: null,
    status: null,
    requestBody: req.body ?? null,
    responseBody: null,
    error: null,
    traceId: null,
    outbound: null,
  });
  return next(req).pipe(
    tap({
      next: (event) => {
        if (event instanceof HttpResponse) {
          inspector.update(call.id, {
            status: event.status,
            responseBody: event.body ?? null,
            durationMs: Math.round(performance.now() - started),
            traceId: event.headers.get('X-Trace-Id'),
          });
        }
      },
      error: (err) => {
        const e = err as HttpErrorResponse;
        inspector.update(call.id, {
          status: e.status || null,
          responseBody: e.error ?? null,
          error: e.status ? null : 'Nessuna risposta dal server',
          durationMs: Math.round(performance.now() - started),
          traceId: e.headers?.get('X-Trace-Id') ?? null,
        });
      },
    })
  );
}
