import './env.ts';
import { createDpp, getAnyByGtin, markPublished } from './db.ts';
import { registerDpp } from './mockRegistryClient.ts';
import { syncResolverEntry } from './resolverClient.ts';
import { siteUrl } from './publicUrls.ts';
import { SEED_DATA } from './seedData.ts';
import { groupFlatAttributes } from './linkTypes.ts';

/**
 * Registra sul DPP Registry UE (vero, tramite mockRegistryClient.ts — non finto) i 10 prodotti
 * di esempio del carosello della home (vedi src/app/data/sectors.ts, stessi GTIN/nomi/AI
 * qualificatori: coerenza intenzionale, chi apre l'esempio dalla home trova esattamente questo
 * DPP) e li sincronizza sul GS1 Digital Link Resolver CE (resolverClient.ts) — a differenza della
 * rotta /admin di pubblicazione (routes/dpp.ts), che lo fa da sola a ogni pubblicazione, questo
 * script scrive direttamente nel database (createDpp/markPublished), quindi deve richiamare
 * syncResolverEntry esplicitamente. Serve perché altrimenti quegli esempi — mostrati come
 * "scansionabili" nella hero — non risolverebbero mai davvero: nessuno li ha ancora creati né
 * pubblicati tramite /admin.
 *
 * Idempotente: salta ogni GTIN già presente (bozza o pubblicato) invece di duplicarlo — si può
 * rilanciare in sicurezza, es. dopo aver aggiunto un altro settore in futuro.
 *
 * Esecuzione: `SITE_URL=<dominio pubblico reale> npm run seed` — SITE_URL qui sovrascrive il
 * fallback a localhost di registerDpp() (vedi il commento su digitalLinkUrl() in
 * mockRegistryClient.ts): mock-eu-registry scarica davvero questo URL per calcolare l'hash della
 * scheda, e non può raggiungere una macchina locale. Va lanciato con il dominio pubblico vero
 * del webshop (quello che risolve /01/:gtin), non con quello di registry-api. Stesso SITE_URL
 * passato a syncResolverEntry, per lo stesso motivo (gli href del linkset devono puntare al sito
 * pubblico vero, non a localhost).
 */


async function main(): Promise<void> {
  const site = siteUrl();
  if (!process.env.SITE_URL) {
    console.warn(`SITE_URL non impostata — uso il webshop di produzione (${site}). Per un altro dominio impostala esplicitamente: mock-eu-registry deve poter raggiungere le pagine /01/:gtin.`);
  }
  for (const entry of SEED_DATA) {
    const existing = await getAnyByGtin(entry.gtin);
    if (existing) {
      console.log(`- ${entry.gtin} (${entry.name}): già presente (status=${existing.status}), salto.`);
      continue;
    }
    const record = await createDpp({
      sectorId: entry.sectorId,
      gtin: entry.gtin,
      name: entry.name,
      granularityLevel: entry.granularityLevel,
      batchOrSerial: entry.batchOrSerial,
      // seedData.ts resta un semplice Record<string,string> per settore (come demo-data.ts lato
      // frontend, mai stato il caso di nidificarlo a mano): raggruppato qui per categoria con la
      // stessa euristica usata ovunque in questo progetto per dati senza una categoria propria.
      attributes: groupFlatAttributes(entry.attributes),
      // Questi 10 DPP sono gli esempi "scansionabili" della home: non modificabili né
      // eliminabili da /admin, vedi il commento su DppRecord.isStatic in db.ts.
      isStatic: true,
    });
    console.log(`- ${entry.gtin} (${entry.name}): bozza creata (${record.id}), registro su mock-eu-registry…`);
    try {
      const { registryId, proofJwt } = await registerDpp(record);
      const published = await markPublished(record.id, registryId, proofJwt);
      console.log(`  ✓ registrato, registryId=${registryId}`);
      if (published) {
        await syncResolverEntry(published, site);
        console.log(`  ✓ sincronizzato sul resolver (gs1:dpp + link per ogni sezione${published.isStatic ? ', default gs1:pip' : ''})`);
      }
    } catch (err) {
      console.error(`  ✗ registrazione fallita: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
