import './env.ts';
import { listDpp } from './db.ts';
import { syncResolverEntry } from './resolverClient.ts';

/**
 * Ri-sincronizza sul GS1 Digital Link Resolver TUTTE le schede DPP già pubblicate, con il
 * linkset corrente (vedi buildLinksetDocument in resolverClient.ts: gs1:dpp/gs1:pip più un link
 * per ogni sezione del passaporto). Serve quando cambia l'insieme dei link type registrati —
 * il resolver conosce solo ciò che gli è stato scritto al momento della pubblicazione, quindi
 * le schede pubblicate prima non hanno i link nuovi. Idempotente (PUT con merge, POST /new come
 * fallback): si può rilanciare in sicurezza. Nota: aggiunge/aggiorna link, non rimuove quelli
 * di sezioni che nel frattempo non ci sono più.
 *
 * Esecuzione: `SITE_URL=<dominio pubblico del webshop> RESOLVER_API_URL=… RESOLVER_SESSION_TOKEN=…
 * DATABASE_URL=… npm run resolver:sync` — SITE_URL è l'origine degli href dei link (deve essere
 * il sito pubblico vero, mai localhost), come per `npm run seed`.
 */
async function main(): Promise<void> {
  const site = process.env.SITE_URL;
  if (!site) {
    console.error('SITE_URL mancante: gli href del linkset devono puntare al sito pubblico vero.');
    process.exit(1);
  }
  const records = (await listDpp()).filter((r) => r.status === 'published');
  console.log(`${records.length} schede pubblicate da sincronizzare su ${process.env.RESOLVER_API_URL ?? '(RESOLVER_API_URL non impostata)'}`);
  for (const record of records) {
    await syncResolverEntry(record, site);
    console.log(`✓ ${record.gtin} (${record.name}) — ${record.isStatic ? 'statica' : 'utente'}`);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
