import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

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
}

export interface DppInput {
  sectorId: string;
  gtin: string;
  name: string;
  granularityLevel: GranularityLevel;
  batchOrSerial?: string | null;
  attributes?: Record<string, string>;
}

const BASE = '/registry-api';

/** Client verso registry-api — usato solo dalla sezione admin (RenderMode.Client). */
@Injectable({ providedIn: 'root' })
export class RegistryApiService {
  private http = inject(HttpClient);

  login(password: string): Observable<{ ok: true }> {
    return this.http.post<{ ok: true }>(`${BASE}/login`, { password }, { withCredentials: true });
  }

  logout(): Observable<{ ok: true }> {
    return this.http.post<{ ok: true }>(`${BASE}/logout`, {}, { withCredentials: true });
  }

  list(): Observable<DppRecord[]> {
    return this.http.get<DppRecord[]>(`${BASE}/dpp`, { withCredentials: true });
  }

  get(id: string): Observable<DppRecord> {
    return this.http.get<DppRecord>(`${BASE}/dpp/${id}`, { withCredentials: true });
  }

  create(input: DppInput): Observable<DppRecord> {
    return this.http.post<DppRecord>(`${BASE}/dpp`, input, { withCredentials: true });
  }

  update(id: string, input: DppInput): Observable<DppRecord> {
    return this.http.put<DppRecord>(`${BASE}/dpp/${id}`, input, { withCredentials: true });
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${BASE}/dpp/${id}`, { withCredentials: true });
  }

  publish(id: string): Observable<DppRecord> {
    return this.http.post<DppRecord>(`${BASE}/dpp/${id}/publish`, {}, { withCredentials: true });
  }

  /** Lettura pubblica (nessun cookie, nessuna password) usata dalla pagina prodotto `/01/:gtin`
   * per mostrare una scheda pubblicata quando il catalogo statico non ha quel GTIN. */
  getPublicByGtin(gtin: string): Observable<DppRecord> {
    return this.http.get<DppRecord>(`${BASE}/public/dpp/${gtin}`);
  }
}
