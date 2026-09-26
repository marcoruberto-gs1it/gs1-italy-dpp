import type { GranularityLevel } from './db.ts';
import type { SectorId } from './sectors.ts';

/** I 10 prodotti di esempio del carosello home (record statici, isStatic=true) — dati di seed
 * condivisi da `npm run seed` (seed.ts, creazione) e dall'aggiornamento all'avvio
 * (refreshSeeds.ts, RESEED_STATIC_ON_BOOT). */
export interface SeedEntry {
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
export const SEED_DATA: SeedEntry[] = [
  {
    sectorId: 'battery',
    gtin: '08000000000019',
    name: 'Modulo batteria EV — esempio',
    granularityLevel: 'MODEL',
    batchOrSerial: null,
    // Dati di una batteria per veicoli leggeri (LMT) presi come spunto dal passaporto demo
    // pubblico di origovero.com (SCT-BAT-002): stessa struttura (specifiche, durabilità, materiali,
    // riciclato, impronta di carbonio, imballaggio, certificazioni, fine vita) e valori tecnici
    // generici; NON copiati i nomi di aziende, laboratori, numeri di certificato o di produttore
    // di quel sito — qui sono descrizioni neutre. Le chiavi decidono in quale pagina per link type
    // finisce ogni voce (vedi classifyAttribute in linkTypes.ts).
    attributes: {
      // gs1:sustainabilityInfo — carbonio, riciclato, imballaggio, fine vita
      'impronta di carbonio (kg CO₂e)': '32,8',
      'intensità di carbonio (kg CO₂e/kWh)': '61,5',
      'classe di prestazione carbonica': 'C',
      'contenuto riciclato totale (%)': '16',
      'cobalto riciclato (%)': '10',
      'litio riciclato (%)': '4',
      'nichel riciclato (%)': '4',
      'efficienza di carica a nuovo (%)': '94',
      'imballaggio — cartone ondulato da trasporto': '320 g, 85% di contenuto riciclato',
      'imballaggio — inserto in pasta di cellulosa': '60 g, 100% di contenuto riciclato',
      'imballaggio riutilizzabile': 'No',
      'fine vita — raccolta': 'Ritiro presso i centri comunali di raccolta delle batterie',
      'fine vita — processo di riciclo': 'Meccanico-termico, in circuito chiuso',
      'fine vita — materiali recuperati': 'Cobalto, nichel, litio, rame, alluminio',
      // gs1:certificationInfo
      'certificazione sicurezza batteria': 'EN 50604-1, prova indipendente',
      'certificazione trasporto': 'UN 38.3',
      'marcatura CE': 'Dichiarazione di conformità del fabbricante',
      // gs1:safetyInfo
      'risposta al fuoco': "Acqua nebulizzata o polvere ABC — non soffocare l'incendio",
      // gs1:instructions — durabilità e riparazione
      'garanzia (mesi)': '24',
      'riparabilità e sostituzione da parte dell\'utente': 'Sì, anche presso centri di assistenza indipendenti',
      'disponibilità ricambi (anni)': '6',
      // gs1:masterData — dati tecnici
      'categoria di batteria': 'Veicoli leggeri (LMT)',
      chimica: 'Li-ion NMC',
      catodo: 'Ossido di nichel-manganese-cobalto',
      elettrolita: 'LiPF6 in solventi carbonati organici',
      'capacità nominale': '14,0 Ah · 504 Wh',
      'tensione nominale (V)': '36,0 (intervallo 30,0–42,0)',
      'potenza nominale (W)': '750 (massima 1000)',
      'massa (kg)': '2,9',
      'temperatura di esercizio (°C)': 'da −10 a 45',
      'resistenza interna della batteria (Ω)': '0,085',
      'vita utile prevista': '6 anni · 800 cicli di carica',
      'cicli di carica testati': '1200',
      'materiali rinnovabili (quota %)': '4',
      contaminanti: 'Cadmio < 0,002 % · Piombo < 0,004 %',
      'paese di origine delle celle': 'Repubblica di Corea',
      'luogo di assemblaggio del pacco': 'Italia',
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
  {
    sectorId: 'detergents',
    gtin: '08000000000101',
    name: 'Detersivo liquido bucato — esempio',
    granularityLevel: 'MODEL',
    batchOrSerial: null,
    attributes: {
      'biodegradabilità tensioattivi (%)': '92',
      'dosaggio raccomandato (ml/lavaggio)': '35',
      'packaging riciclabile (%)': '100',
      certificazione: 'Ecolabel UE',
    },
  },
];
