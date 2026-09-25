/**
 * Elenco minimo dei settori DPP, usato solo per validare `sectorId` in ingresso.
 * Copia intenzionalmente ridotta di src/app/data/sectors.ts (Angular): sono due
 * servizi separati, niente import cross-progetto. Se si aggiunge un settore lì,
 * va aggiunto anche qui.
 */
export const SECTOR_IDS = [
  'battery',
  'apparel',
  'steel',
  'construction',
  'aluminium',
  'tyres',
  'furniture',
  'mattresses',
  'ict',
  'detergents',
] as const;

export type SectorId = (typeof SECTOR_IDS)[number];

export function isValidSectorId(value: unknown): value is SectorId {
  return typeof value === 'string' && (SECTOR_IDS as readonly string[]).includes(value);
}
