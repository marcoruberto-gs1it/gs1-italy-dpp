import { GranularityLevel } from '../../services/registry-api.service';

/** Dati fittizi plausibili per popolare rapidamente il form — non prodotti reali. */
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
    },
  },
};
