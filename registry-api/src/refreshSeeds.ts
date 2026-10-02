import { getAnyByGtin, updateDpp } from './db.ts';
import { SEED_DATA } from './seedData.ts';
import { groupFlatAttributes } from './linkTypes.ts';

/**
 * Riallinea gli attributi dei record STATICI già presenti (i 10 esempi della home) ai dati di
 * seedData.ts. `npm run seed` salta i GTIN esistenti, quindi non basta quando si arricchisce un
 * esempio: qui si aggiornano solo gli attributi — mai nome, GTIN, stato di pubblicazione o
 * registrazione presso il registro UE, che restano quelli già registrati. Solo record con
 * isStatic=true: un DPP creato da un utente con lo stesso GTIN non viene mai toccato.
 * Idempotente: non scrive se gli attributi coincidono già.
 *
 * Usato all'avvio con RESEED_STATIC_ON_BOOT=true (server.ts), seguito dalla ri-sincronizzazione
 * del resolver (resyncResolver.ts) per registrare i link delle nuove sezioni.
 */
export async function refreshStaticSeeds(): Promise<number> {
  let updated = 0;
  for (const entry of SEED_DATA) {
    const existing = await getAnyByGtin(entry.gtin);
    if (!existing || !existing.isStatic) continue;
    const nextAttributes = groupFlatAttributes(entry.attributes);
    if (JSON.stringify(existing.attributes) === JSON.stringify(nextAttributes)) continue;
    await updateDpp(existing.id, { attributes: nextAttributes });
    updated++;
    console.log(`refresh seed: ✓ ${entry.gtin} (${entry.name}) — attributi aggiornati`);
  }
  console.log(`refresh seed: ${updated} record aggiornati`);
  return updated;
}
