import './env.ts';
import { listDpp } from './db.ts';
import { syncResolverEntry } from './resolverClient.ts';
import { siteUrl } from './publicUrls.ts';

/**
 * Ri-sincronizza sul GS1 Digital Link Resolver TUTTE le schede DPP già pubblicate, con il
 * linkset corrente (vedi buildLinksetDocument in resolverClient.ts: gs1:dpp/gs1:pip più un link
 * per ogni sezione del passaporto). Serve quando cambia l'insieme dei link type registrati —
 * il resolver conosce solo ciò che gli è stato scritto al momento della pubblicazione, quindi
 * le schede pubblicate prima non hanno i link nuovi. Idempotente (PUT con merge, POST /new come
 * fallback): si può rilanciare in sicurezza. Nota: aggiunge/aggiorna link, non rimuove quelli
 * di sezioni che nel frattempo non ci sono più.
 *
 * Due modi d'uso: da riga di comando (`SITE_URL=<dominio pubblico del webshop> RESOLVER_API_URL=…
 * RESOLVER_SESSION_TOKEN=… DATABASE_URL=… npm run resolver:sync`) oppure all'avvio di
 * registry-api con RESYNC_RESOLVER_ON_BOOT=true (server.ts) — comodo su Render free, dove non c'è
 * una shell e le credenziali esistono solo lì. SITE_URL è l'origine degli href dei link (deve
 * essere il sito pubblico vero, mai localhost), come per `npm run seed`.
 */
export async function resyncAllToResolver(site: string): Promise<number> {
  const apiUrl = process.env.RESOLVER_API_URL;
  if (apiUrl) {
    // Sveglia il resolver (Render free: 30-60s a freddo) prima di scrivere, altrimenti i primi
    // PUT scadono a 10s e il link resta non sincronizzato. L'esito non conta.
    await fetch(apiUrl.replace(/\/api\/?$/, '/'), { signal: AbortSignal.timeout(75_000) }).catch(() => undefined);
  }
  const records = (await listDpp()).filter((r) => r.status === 'published');
  console.log(`resync resolver: ${records.length} schede pubblicate da sincronizzare`);
  for (const record of records) {
    await syncResolverEntry(record, site);
    console.log(`resync resolver: ✓ ${record.gtin} (${record.name}) — ${record.isStatic ? 'statica' : 'utente'}`);
  }
  return records.length;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  resyncAllToResolver(siteUrl()).then(
    () => process.exit(0),
    (err) => {
      console.error(err);
      process.exit(1);
    }
  );
}
