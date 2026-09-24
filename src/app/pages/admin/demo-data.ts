import { GranularityLevel } from '../../services/registry-api.service';

/** Dati fittizi plausibili per popolare rapidamente il form — non prodotti reali.
 *
 * Gli attributi contrassegnati "tracepass:" sotto sono stati scelti (nome del concetto, unità
 * di misura, valore plausibile) confrontando questo file con i template reali di
 * github.com/malinoto/tracepass-dpp-schemas (Apache-2.0) — 1.005 campi su 13 categorie
 * prodotto, ciascuno tracciato all'articolo del regolamento UE che lo richiede o lo anticipa.
 * Non tutti i settori hanno un template corrispondente lì (mancano alluminio e materassi, che
 * restano quindi solo plausibili come prima) e non tutti i campi lì sono "required" nel senso
 * legale — dove il commento dice "anticipated" l'atto delegato ESPR che lo imporrà non è ancora
 * stato adottato, la citazione resta comunque quella reale del template. */
export interface DemoDataset {
  name: string;
  granularityLevel: GranularityLevel;
  batchOrSerial: string;
  attributes: Record<string, string>;
}

/** Una scheda demo per ciascuno dei 9 settori (vedi src/app/data/sectors.ts, stessi id). */
export const DEMO_DATA: Record<string, DemoDataset> = {
  battery: {
    name: 'Modulo batteria EV 75 kWh — demo',
    granularityLevel: 'ITEM',
    batchOrSerial: '(21) SN00234891',
    attributes: {
      chimica: 'NMC 811',
      'capacità nominale (kWh)': '75',
      'stato di salute (%)': '98',
      'cicli di ricarica': '42',
      'impronta di carbonio (kg CO₂e)': '1850',
      'contenuto riciclato cobalto (%)': '16',
      // tracepass: batteryCategory — Reg. (UE) 2023/1542 Art. 1, Annex VI Part A (required).
      'categoria batteria': 'EV',
      // tracepass: nominalVoltage — Art. 77, Annex XIII (required).
      'tensione nominale (V)': '400',
      // tracepass: ceMarking — Art. 20 (required).
      'marcatura CE': 'Sì',
    },
  },
  apparel: {
    name: 'T-shirt in cotone organico — demo',
    granularityLevel: 'BATCH',
    batchOrSerial: '(10) LOTTO2027A',
    attributes: {
      'composizione fibre': '100% cotone organico',
      'paese di origine': 'Portogallo',
      certificazione: 'GOTS',
      'istruzioni di cura': 'Lavaggio a 30°C',
      // tracepass: recycledContentPercentage — ESPR Art. 7(2)(b) (anticipated, nessun atto
      // delegato tessile ancora adottato — vedi nota in cima al file).
      'contenuto riciclato (%)': '35',
      // tracepass: carbonFootprint — ESPR Art. 7(2)(a), metodologia PEF (anticipated).
      'impronta di carbonio (kg CO₂e)': '4.2',
    },
  },
  steel: {
    name: 'Trave in acciaio strutturale — demo',
    granularityLevel: 'BATCH',
    batchOrSerial: '(10) COLATA2026-118',
    attributes: {
      'grado acciaio': 'S355',
      'contenuto riciclato (%)': '32',
      'impronta di carbonio (kg CO₂e/t)': '1420',
      stabilimento: 'Acciaieria di Taranto',
      // tracepass: yieldStrengthMpa — EN 10025/EN 10204 (required). 355 MPa è per
      // definizione il carico di snervamento nominale di un acciaio "S355".
      'carico di snervamento (MPa)': '355',
      // tracepass: tensileStrengthMpa — EN 10204 (required). Intervallo tipico per S355:
      // 470-630 MPa.
      'resistenza alla trazione (MPa)': '510',
    },
  },
  construction: {
    name: 'Pannello isolante in lana di roccia — demo',
    granularityLevel: 'BATCH',
    batchOrSerial: '(10) LOTTOISOL0472',
    attributes: {
      'conducibilità termica (W/mK)': '0.035',
      'classe reazione al fuoco': 'A1',
      'spessore (mm)': '100',
      certificazione: 'CE — EN 13162',
      // tracepass: recycledContent — CPR (UE) 2024/3110 (anticipated).
      'contenuto riciclato (%)': '30',
    },
  },
  aluminium: {
    name: 'Profilo in alluminio estruso — demo',
    granularityLevel: 'BATCH',
    batchOrSerial: '(10) COLATAAL3391',
    attributes: {
      lega: 'EN AW-6060',
      'contenuto riciclato (%)': '75',
      'impronta di carbonio (kg CO₂e/kg)': '4.1',
    },
  },
  tyres: {
    name: 'Pneumatico estivo 205/55 R16 — demo',
    granularityLevel: 'ITEM',
    batchOrSerial: '(21) DOT26340091',
    attributes: {
      'classe efficienza carburante': 'B',
      'classe aderenza bagnato': 'A',
      'rumorosità (dB)': '68',
      'indice carico/velocità': '91V',
      // tracepass: recycledRubberContentPercentage — ESPR Art. 7(2)(b) (anticipated).
      'contenuto gomma riciclata (%)': '12',
    },
  },
  furniture: {
    name: 'Sedia da ufficio ergonomica — demo',
    granularityLevel: 'ITEM',
    batchOrSerial: '(21) SNCHAIR77210',
    attributes: {
      'materiale scocca': 'Polipropilene riciclato 40%',
      'garanzia (anni)': '5',
      'disponibilità ricambi (anni)': '10',
      'peso (kg)': '14.2',
      // tracepass: repairabilityScore — ESPR Art. 7(2)(a) (anticipated).
      'punteggio di riparabilità': '7.5 / 10',
      // tracepass: carbonFootprint — ESPR Art. 7(2)(a), metodologia PEF (anticipated).
      'impronta di carbonio (kg CO₂e)': '18',
    },
  },
  mattresses: {
    name: 'Materasso a molle insacchettate — demo',
    granularityLevel: 'ITEM',
    batchOrSerial: '(21) SNMAT55931',
    attributes: {
      composizione: 'Molle in acciaio + schiuma poliuretano',
      certificazione: 'OEKO-TEX Standard 100',
      'riciclabilità (%)': '85',
    },
  },
  ict: {
    name: 'Router Wi-Fi 6 domestico — demo',
    // Unico settore demo a livello MODEL (gli altri 8 sono ITEM/BATCH): un router non
    // serializzato individualmente — passaporto valido per l'intera linea di prodotto, non
    // per il singolo esemplare o lotto. Nessun batchOrSerial: non si applica a MODEL.
    granularityLevel: 'MODEL',
    batchOrSerial: '',
    attributes: {
      'indice di riparabilità': '7.2 / 10',
      'disponibilità ricambi (anni)': '7',
      'consumo in standby (W)': '1.8',
      'contenuto riciclato plastica (%)': '30',
      // tracepass: recycledMetalContent — ESPR Art. 7 (anticipated).
      'contenuto riciclato metallo (%)': '18',
    },
  },
};
