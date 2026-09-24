import './env.ts';
import { createDpp, getAnyByGtin, markPublished, type GranularityLevel } from './db.ts';
import { registerDpp } from './mockRegistryClient.ts';
import type { SectorId } from './sectors.ts';

/**
 * Registra sul DPP Registry UE (vero, tramite mockRegistryClient.ts — non finto) i 9 prodotti
 * di esempio del carosello della home (vedi src/app/data/sectors.ts, stessi GTIN/nomi/AI
 * qualificatori: coerenza intenzionale, chi apre l'esempio dalla home trova esattamente questo
 * DPP). Serve perché altrimenti quegli esempi — mostrati come "scansionabili" nella hero — non
 * risolverebbero mai davvero: nessuno li ha ancora creati né pubblicati tramite /admin.
 *
 * Idempotente: salta ogni GTIN già presente (bozza o pubblicato) invece di duplicarlo — si può
 * rilanciare in sicurezza, es. dopo aver aggiunto un decimo settore in futuro.
 *
 * Esecuzione: `SITE_URL=<dominio pubblico reale> npm run seed` — SITE_URL qui sovrascrive il
 * fallback a localhost di registerDpp() (vedi il commento su digitalLinkUrl() in
 * mockRegistryClient.ts): mock-eu-registry scarica davvero questo URL per calcolare l'hash della
 * scheda, e non può raggiungere una macchina locale. Va lanciato con il dominio pubblico vero
 * del webshop (quello che risolve /01/:gtin), non con quello di registry-api.
 */

interface SeedEntry {
  sectorId: SectorId;
  gtin: string;
  name: string;
  granularityLevel: GranularityLevel;
  batchOrSerial: string | null;
  attributes: Record<string, string>;
}

// Stessi exampleGtin/exampleName/exampleExtraElement di src/app/data/sectors.ts — duplicati qui
// per lo stesso motivo del resto di questo servizio (due progetti separati, vedi sectors.ts in
// questa cartella). Attributi presi da src/app/pages/admin/demo-data.ts (stesso settore, dati
// plausibili) — quel dataset descrive un prodotto diverso per nome/GTIN (usato dal pulsante
// "Usa demo" in admin), qui riusiamo solo la sua idea di quali attributi siano pertinenti al
// settore.
const SEED_DATA: SeedEntry[] = [
  {
    sectorId: 'battery',
    gtin: '08000000000019',
    name: 'Modulo batteria EV — esempio',
    granularityLevel: 'MODEL',
    batchOrSerial: null,
    attributes: {
      chimica: 'NMC 811',
      'capacità nominale (kWh)': '75',
      'impronta di carbonio (kg CO₂e)': '1850',
      'contenuto riciclato cobalto (%)': '16',
    },
  },
  {
    sectorId: 'apparel',
    gtin: '08000000000026',
    name: 'Capo — esempio',
    granularityLevel: 'BATCH',
    batchOrSerial: '(10) LOTTO2027A',
    attributes: {
      'composizione fibre': '100% cotone organico',
      'paese di origine': 'Portogallo',
      certificazione: 'GOTS',
    },
  },
  {
    sectorId: 'steel',
    gtin: '08000000000033',
    name: 'Profilato in acciaio — esempio',
    granularityLevel: 'MODEL',
    batchOrSerial: null,
    attributes: {
      'grado acciaio': 'S355',
      'contenuto riciclato (%)': '32',
      'impronta di carbonio (kg CO₂e/t)': '1420',
    },
  },
  {
    sectorId: 'construction',
    gtin: '08000000000040',
    name: 'Pannello isolante — esempio',
    granularityLevel: 'MODEL',
    batchOrSerial: null,
    attributes: {
      'conducibilità termica (W/mK)': '0.035',
      'classe reazione al fuoco': 'A1',
      certificazione: 'CE — EN 13162',
    },
  },
  {
    sectorId: 'aluminium',
    gtin: '08000000000057',
    name: 'Profilo in alluminio — esempio',
    granularityLevel: 'MODEL',
    batchOrSerial: null,
    attributes: {
      lega: 'EN AW-6060',
      'contenuto riciclato (%)': '75',
      'impronta di carbonio (kg CO₂e/kg)': '4.1',
    },
  },
  {
    sectorId: 'tyres',
    gtin: '08000000000064',
    name: 'Pneumatico estivo — esempio',
    granularityLevel: 'MODEL',
    batchOrSerial: null,
    attributes: {
      'classe efficienza carburante': 'B',
      'classe aderenza bagnato': 'A',
      'rumorosità (dB)': '68',
    },
  },
  {
    sectorId: 'furniture',
    gtin: '08000000000071',
    name: 'Sedia da ufficio — esempio',
    granularityLevel: 'MODEL',
    batchOrSerial: null,
    attributes: {
      'materiale scocca': 'Polipropilene riciclato 40%',
      'garanzia (anni)': '5',
      'disponibilità ricambi (anni)': '10',
    },
  },
  {
    sectorId: 'mattresses',
    gtin: '08000000000088',
    name: 'Materasso a molle — esempio',
    granularityLevel: 'MODEL',
    batchOrSerial: null,
    attributes: {
      composizione: 'Molle in acciaio + schiuma poliuretano',
      certificazione: 'OEKO-TEX Standard 100',
      'riciclabilità (%)': '85',
    },
  },
  {
    sectorId: 'ict',
    gtin: '08000000000095',
    name: 'Router domestico — esempio',
    granularityLevel: 'MODEL',
    batchOrSerial: null,
    attributes: {
      'indice di riparabilità': '7.2 / 10',
      'disponibilità ricambi (anni)': '7',
      'contenuto riciclato plastica (%)': '30',
    },
  },
];

async function main(): Promise<void> {
  if (!process.env.SITE_URL) {
    console.warn('ATTENZIONE: SITE_URL non impostata — mock-eu-registry non potrà raggiungere le pagine /01/:gtin (vedi il commento in cima a questo file). La registrazione fallirà quasi certamente.');
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
      attributes: entry.attributes,
      // Questi 9 DPP sono gli esempi "scansionabili" della home: non modificabili né
      // eliminabili da /admin, vedi il commento su DppRecord.isStatic in db.ts.
      isStatic: true,
    });
    console.log(`- ${entry.gtin} (${entry.name}): bozza creata (${record.id}), registro su mock-eu-registry…`);
    try {
      const { registryId, proofJwt } = await registerDpp(record);
      await markPublished(record.id, registryId, proofJwt);
      console.log(`  ✓ registrato, registryId=${registryId}`);
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
