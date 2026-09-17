import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { SectorId } from './sectors.ts';

export type GranularityLevel = 'MODEL' | 'BATCH' | 'ITEM';
export type DppStatus = 'draft' | 'published';

export interface DppRecord {
  id: string;
  sectorId: SectorId;
  gtin: string;
  name: string;
  granularityLevel: GranularityLevel;
  batchOrSerial: string | null;
  /** Coppie chiave/valore libere — i settori non hanno ancora uno schema dati proprio. */
  attributes: Record<string, string>;
  status: DppStatus;
  createdAt: string;
  updatedAt: string;
  registryId: string | null;
  proofJwt: string | null;
  registeredAt: string | null;
}

/** Riga così com'è salvata su SQLite: `attributes` è testo JSON, non un oggetto. */
interface DppRow {
  id: string;
  sectorId: string;
  gtin: string;
  name: string;
  granularityLevel: string;
  batchOrSerial: string | null;
  attributes: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  registryId: string | null;
  proofJwt: string | null;
  registeredAt: string | null;
}

const DB_PATH = process.env.REGISTRY_DB_PATH || './data/registry.sqlite';
mkdirSync(dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS dpp_records (
    id TEXT PRIMARY KEY,
    sectorId TEXT NOT NULL,
    gtin TEXT NOT NULL,
    name TEXT NOT NULL,
    granularityLevel TEXT NOT NULL,
    batchOrSerial TEXT,
    attributes TEXT NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'draft',
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL,
    registryId TEXT,
    proofJwt TEXT,
    registeredAt TEXT
  )
`);

function fromRow(row: DppRow): DppRecord {
  return {
    ...row,
    sectorId: row.sectorId as SectorId,
    granularityLevel: row.granularityLevel as GranularityLevel,
    status: row.status as DppStatus,
    attributes: JSON.parse(row.attributes),
  };
}

export function listDpp(): DppRecord[] {
  const rows = db.prepare('SELECT * FROM dpp_records ORDER BY updatedAt DESC').all() as DppRow[];
  return rows.map(fromRow);
}

export function getDpp(id: string): DppRecord | undefined {
  const row = db.prepare('SELECT * FROM dpp_records WHERE id = ?').get(id) as DppRow | undefined;
  return row ? fromRow(row) : undefined;
}

/** Lettura pubblica (senza auth, vedi routes/public.ts) per le pagine prodotto `/01/:gtin`:
 * solo schede pubblicate — una bozza non è dato da mostrare a chi scansiona il prodotto. Se più
 * schede condividono lo stesso GTIN (varianti di lotto/seriale), quella pubblicata più di recente. */
export function getPublishedByGtin(gtin: string): DppRecord | undefined {
  const row = db
    .prepare("SELECT * FROM dpp_records WHERE gtin = ? AND status = 'published' ORDER BY registeredAt DESC LIMIT 1")
    .get(gtin) as DppRow | undefined;
  return row ? fromRow(row) : undefined;
}

export interface CreateDppInput {
  sectorId: SectorId;
  gtin: string;
  name: string;
  granularityLevel: GranularityLevel;
  batchOrSerial?: string | null;
  attributes?: Record<string, string>;
}

export function createDpp(input: CreateDppInput): DppRecord {
  const now = new Date().toISOString();
  const record: DppRecord = {
    id: randomUUID(),
    sectorId: input.sectorId,
    gtin: input.gtin,
    name: input.name,
    granularityLevel: input.granularityLevel,
    batchOrSerial: input.batchOrSerial ?? null,
    attributes: input.attributes ?? {},
    status: 'draft',
    createdAt: now,
    updatedAt: now,
    registryId: null,
    proofJwt: null,
    registeredAt: null,
  };
  db.prepare(
    `INSERT INTO dpp_records
      (id, sectorId, gtin, name, granularityLevel, batchOrSerial, attributes, status, createdAt, updatedAt, registryId, proofJwt, registeredAt)
     VALUES (@id, @sectorId, @gtin, @name, @granularityLevel, @batchOrSerial, @attributes, @status, @createdAt, @updatedAt, @registryId, @proofJwt, @registeredAt)`
  ).run({ ...record, attributes: JSON.stringify(record.attributes) });
  return record;
}

export type UpdateDppInput = Partial<CreateDppInput>;

export function updateDpp(id: string, input: UpdateDppInput): DppRecord | undefined {
  const existing = getDpp(id);
  if (!existing) return undefined;

  const updated: DppRecord = {
    ...existing,
    ...input,
    batchOrSerial: input.batchOrSerial !== undefined ? input.batchOrSerial : existing.batchOrSerial,
    attributes: input.attributes ?? existing.attributes,
    updatedAt: new Date().toISOString(),
  };
  db.prepare(
    `UPDATE dpp_records SET
      sectorId = @sectorId, gtin = @gtin, name = @name, granularityLevel = @granularityLevel,
      batchOrSerial = @batchOrSerial, attributes = @attributes, updatedAt = @updatedAt
     WHERE id = @id`
  ).run({ ...updated, attributes: JSON.stringify(updated.attributes) });
  return updated;
}

export function deleteDpp(id: string): boolean {
  const result = db.prepare('DELETE FROM dpp_records WHERE id = ?').run(id);
  return result.changes > 0;
}

/** Segna la scheda come pubblicata, dopo una registrazione riuscita su mock-eu-registry. */
export function markPublished(id: string, registryId: string, proofJwt: string | null): DppRecord | undefined {
  const existing = getDpp(id);
  if (!existing) return undefined;
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE dpp_records SET status = 'published', registryId = @registryId, proofJwt = @proofJwt, registeredAt = @registeredAt, updatedAt = @registeredAt
     WHERE id = @id`
  ).run({ id, registryId, proofJwt, registeredAt: now });
  return getDpp(id);
}
