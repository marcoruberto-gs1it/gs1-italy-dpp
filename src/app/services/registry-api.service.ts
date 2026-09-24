import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, retry, timeout, timer, TimeoutError } from 'rxjs';

export type GranularityLevel = 'MODEL' | 'BATCH' | 'ITEM';
export type DppStatus = 'draft' | 'published';

/** Rispecchia registry-api/src/db.ts — due servizi separati, stesso contratto tenuto a mano. */
export interface DppRecord {
  id: string;
  sectorId: string;
  gtin: string;
  name: string;
  granularityLevel: GranularityLevel;
  batchOrSerial: string | null;
  attributes: Record<string, string>;
  status: DppStatus;
  createdAt: string;
  updatedAt: string;
  registryId: string | null;
  proofJwt: string | null;
  registeredAt: string | null;
  economicOperatorId: string;
  facilityId: string;
}

/** Il payload/risposta reali scambiati con mock-eu-registry durante una pubblicazione — solo
 * nella risposta di publish(), non persistito. Vedi registry-api/src/mockRegistryClient.ts. */
export interface PublishTechnicalTrace {
  request: Record<string, unknown>;
  response: Record<string, unknown>;
}

export interface DppInput {
  sectorId: string;
  gtin: string;
  name: string;
  granularityLevel: GranularityLevel;
  batchOrSerial?: string | null;
  attributes?: Record<string, string>;
  economicOperatorId?: string;
  facilityId?: string;
}

const BASE = '/registry-api';

/** Il piano gratuito di Render addormenta ogni servizio dopo un periodo di inattività e lo
 * risveglia solo quando riceve una richiesta reale — aprire il sito web non risveglia da solo
 * anche registry-api, un servizio Render separato raggiunto tramite proxy (vedi
 * webshop/nginx.conf#location /registry-api/). La primissima richiesta dopo un periodo di
 * inattività può quindi fallire (errore di rete/502/503/504) mentre il container si sta ancora
 * avviando: qui la ripetiamo da sola con un'attesa crescente invece di mostrare subito un
 * errore, cumulando circa un minuto — lo stesso margine già usato in admin.ts
 * (PUBLISH_RETRY_DELAYS_MS) per il risveglio di mock-eu-registry durante la pubblicazione, ma
 * applicato qui a livello di trasporto così copre ogni chiamata, non solo publish(). Il
 * chiamante vede solo un'icona che gira (vedi 'loader' in IconComponent), mai un messaggio che
 * spiega il perché — un risveglio a freddo è un dettaglio implementativo, non qualcosa su cui
 * l'utente deve riflettere ad ogni salvataggio. */
const COLD_START_RETRY_DELAYS_MS = [1000, 3000, 6000, 10000, 15000, 20000];

/** Solo per publish(): quella chiamata può legittimamente restare in sospeso più a lungo delle
 * altre (registry-api al suo interno aspetta Auth0 + mock-eu-registry, che a sua volta scarica
 * il nostro liveURL — un risveglio a freddo doppio, vedi mockRegistryClient.ts). Con i timeout
 * lato server aggiunti lì (90s per la registrazione) una risposta arriva sempre entro quel
 * tempo, in un modo o nell'altro; questo timeout lato client è solo una rete di sicurezza in
 * più, nel caso si blocchi la connessione stessa tra browser e server invece che una delle
 * chiamate esterne. Prima non c'era ALCUN limite qui: una connessione rimasta sospesa lasciava
 * l'animazione "Verifica del Digital Link" ferma per sempre, senza che scattasse mai il retry
 * sotto (che ha bisogno di un errore vero per attivarsi). */
const PUBLISH_HTTP_TIMEOUT_MS = 150_000;

function isColdStartError(error: unknown): boolean {
  // status 0 = la richiesta non ha nemmeno raggiunto un server (connessione rifiutata/TLS
  // fallito) — lo stesso sintomo di un container che non sta ancora ascoltando sulla porta.
  // TimeoutError: solo publish() lo può generare (vedi PUBLISH_HTTP_TIMEOUT_MS) — stesso
  // trattamento, "il servizio è lento a rispondere", non un errore applicativo.
  return (error instanceof HttpErrorResponse && (error.status === 0 || error.status === 502 || error.status === 503 || error.status === 504)) || error instanceof TimeoutError;
}

/** Client verso registry-api — usato solo dalla sezione admin (RenderMode.Client). */
@Injectable({ providedIn: 'root' })
export class RegistryApiService {
  private http = inject(HttpClient);

  private withColdStartRetry<T>(source: Observable<T>): Observable<T> {
    return source.pipe(
      retry({
        count: COLD_START_RETRY_DELAYS_MS.length,
        delay: (error, retryCount) => {
          if (!isColdStartError(error)) throw error;
          return timer(COLD_START_RETRY_DELAYS_MS[retryCount - 1]);
        },
      })
    );
  }

  login(password: string): Observable<{ ok: true }> {
    return this.withColdStartRetry(this.http.post<{ ok: true }>(`${BASE}/login`, { password }, { withCredentials: true }));
  }

  logout(): Observable<{ ok: true }> {
    return this.http.post<{ ok: true }>(`${BASE}/logout`, {}, { withCredentials: true });
  }

  list(): Observable<DppRecord[]> {
    return this.withColdStartRetry(this.http.get<DppRecord[]>(`${BASE}/dpp`, { withCredentials: true }));
  }

  get(id: string): Observable<DppRecord> {
    return this.withColdStartRetry(this.http.get<DppRecord>(`${BASE}/dpp/${id}`, { withCredentials: true }));
  }

  create(input: DppInput): Observable<DppRecord> {
    return this.withColdStartRetry(this.http.post<DppRecord>(`${BASE}/dpp`, input, { withCredentials: true }));
  }

  update(id: string, input: DppInput): Observable<DppRecord> {
    return this.withColdStartRetry(this.http.put<DppRecord>(`${BASE}/dpp/${id}`, input, { withCredentials: true }));
  }

  delete(id: string): Observable<void> {
    return this.withColdStartRetry(this.http.delete<void>(`${BASE}/dpp/${id}`, { withCredentials: true }));
  }

  publish(id: string): Observable<DppRecord & { technical?: PublishTechnicalTrace }> {
    return this.withColdStartRetry(
      this.http.post<DppRecord & { technical?: PublishTechnicalTrace }>(`${BASE}/dpp/${id}/publish`, {}, { withCredentials: true }).pipe(timeout(PUBLISH_HTTP_TIMEOUT_MS))
    );
  }

  /** Lettura pubblica (nessun cookie, nessuna password) usata dalla pagina prodotto `/01/:gtin`
   * per mostrare una scheda pubblicata quando il catalogo statico non ha quel GTIN. */
  getPublicByGtin(gtin: string): Observable<DppRecord> {
    return this.withColdStartRetry(this.http.get<DppRecord>(`${BASE}/public/dpp/${gtin}`));
  }
}
