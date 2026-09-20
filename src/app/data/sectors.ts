import { AppLang } from '../services/language.service';
import { IconName } from '../components/icon/icon';

export interface Sector {
  id: string;
  /** Nome completo, usato nella card del settore. */
  name: string;
  /** Versione breve, per l'eyebrow della card di anteprima nella hero (deve stare su una riga). */
  shortName: string;
  /** Nome dell'icona in app-icon (vedi components/icon/icon.ts) — non un percorso immagine. */
  icon: IconName;
  description: string;
  /** Colore piatto usato per l'icona del settore (vedi .icon-flat in home.css) — niente gradienti. */
  brandColor: string;
  /** Etichetta breve mostrata come badge sulla card, es. "Obbligo dal 18 febbraio 2027". */
  dateLabel: string;
  /** Stessa data di dateLabel, come numero (anno + frazione per il trimestre) — usato solo per
   * posizionare il settore sull'asse del grafico roadmap in home.html. Non tradotto (un
   * numero non ha lingua), non mostrato direttamente all'utente. */
  roadmapYear: number;
  /** Riferimento normativo breve per la card di anteprima nella hero. */
  regulationRef: string;
  /** 'coming-soon': settore annunciato in homepage ma senza ancora prodotti pubblicati. */
  status: 'live' | 'coming-soon';
  /** Nome del prodotto di esempio nella card di anteprima — dato dimostrativo, non un prodotto reale. */
  exampleName: string;
  /** GTIN di esempio (14 cifre, dato dimostrativo) per QR e element string della card di anteprima. */
  exampleGtin: string;
  /** Riga aggiuntiva dell'element string GS1 (es. AI (10) per un lotto) — solo dove serve. */
  exampleExtraElement?: string;
}

// Il sito riparte da zero sul Digital Product Passport (ESPR, Regolamento (UE) 2024/1781):
// i settori del vecchio "Catalogo Smart" FMCG (largo consumo, foodservice, sanità, alimenti
// freschi, costruzioni generiche) sono stati rimossi insieme ai relativi prodotti. Al loro posto,
// la roadmap dei settori realmente impattati dal DPP: le batterie (Regolamento (UE) 2023/1542,
// obbligo autonomo) e gli altri, che arrivano scaglionati attraverso gli atti delegati ESPR
// (date dal working plan della Commissione, vedi ricerca di progetto — soggette a slittamenti).
export const SECTORS: Sector[] = [
  {
    id: 'battery',
    name: 'Batterie',
    shortName: 'Batterie',
    icon: 'battery',
    description:
      'Passaporto obbligatorio per batterie EV, LMT e industriali sopra i 2 kWh: origine dei materiali, impronta di carbonio, stato di salute e cicli di ricarica, accessibili da un QR code sulla batteria.',
    brandColor: '#0A84FF',
    dateLabel: 'Obbligo dal 18 febbraio 2027',
    roadmapYear: 2027.13,
    regulationRef: 'Regolamento (UE) 2023/1542',
    status: 'coming-soon',
    exampleName: 'Modulo batteria EV — esempio',
    exampleGtin: '08000000000019',
  },
  {
    id: 'apparel',
    name: 'Tessile e abbigliamento',
    shortName: 'Tessile',
    icon: 'swatch',
    description:
      "Composizione delle fibre, processi produttivi, tracciabilità di filiera e riciclabilità, a partire dal lotto di produzione — non dal singolo capo.",
    brandColor: '#AF96D4',
    dateLabel: 'Atto delegato atteso Q3-Q4 2027',
    roadmapYear: 2027.5,
    regulationRef: 'ESPR — Regolamento (UE) 2024/1781',
    status: 'coming-soon',
    exampleName: 'Capo — esempio',
    exampleGtin: '08000000000026',
    exampleExtraElement: '(10) LOTTO2027A',
  },
  {
    id: 'steel',
    name: 'Siderurgia',
    shortName: 'Siderurgia',
    icon: 'flame',
    description:
      'Impronta di carbonio e contenuto riciclato per prodotti in ferro e acciaio — il primo settore del piano di lavoro ESPR dopo le batterie.',
    brandColor: '#FF9F0A',
    dateLabel: 'Atto delegato atteso Q4 2026',
    roadmapYear: 2026.9,
    regulationRef: 'ESPR — Regolamento (UE) 2024/1781',
    status: 'coming-soon',
    exampleName: 'Profilato in acciaio — esempio',
    exampleGtin: '08000000000033',
  },
  {
    id: 'construction',
    name: 'Edilizia',
    shortName: 'Edilizia',
    icon: 'building',
    description:
      'Materiali da costruzione con dati di sicurezza, conformità e fine vita, accessibili in cantiere e lungo tutta la filiera.',
    brandColor: '#FFD60A',
    dateLabel: 'Atto delegato atteso Q2 2027',
    roadmapYear: 2027.4,
    regulationRef: 'ESPR — Regolamento (UE) 2024/1781',
    status: 'coming-soon',
    exampleName: 'Pannello isolante — esempio',
    exampleGtin: '08000000000040',
  },
  {
    id: 'aluminium',
    name: 'Alluminio',
    shortName: 'Alluminio',
    icon: 'layers',
    description:
      'Origine, contenuto riciclato e impronta di carbonio dei prodotti in alluminio immessi sul mercato europeo.',
    brandColor: '#8E8E93',
    dateLabel: 'Atto delegato atteso Q3-Q4 2027',
    roadmapYear: 2027.6,
    regulationRef: 'ESPR — Regolamento (UE) 2024/1781',
    status: 'coming-soon',
    exampleName: 'Profilo in alluminio — esempio',
    exampleGtin: '08000000000057',
  },
  {
    id: 'tyres',
    name: 'Pneumatici',
    shortName: 'Pneumatici',
    icon: 'wheel',
    description:
      'Prestazioni, durabilità e tracciabilità dei materiali per i pneumatici venduti nell\'Unione Europea.',
    brandColor: '#48484A',
    dateLabel: 'Atto delegato atteso Q3-Q4 2027',
    roadmapYear: 2027.7,
    regulationRef: 'ESPR — Regolamento (UE) 2024/1781',
    status: 'coming-soon',
    exampleName: 'Pneumatico estivo — esempio',
    exampleGtin: '08000000000064',
  },
  {
    id: 'furniture',
    name: 'Mobili',
    shortName: 'Mobili',
    icon: 'sofa',
    description:
      'Materiali, durabilità e riparabilità dei mobili, dal singolo pezzo alla filiera di produzione.',
    brandColor: '#AC8E68',
    dateLabel: 'Atto delegato atteso 2028',
    roadmapYear: 2028.5,
    regulationRef: 'ESPR — Regolamento (UE) 2024/1781',
    status: 'coming-soon',
    exampleName: 'Sedia da ufficio — esempio',
    exampleGtin: '08000000000071',
  },
  {
    id: 'mattresses',
    name: 'Materassi',
    shortName: 'Materassi',
    icon: 'bed',
    description: 'Composizione dei materiali e riciclabilità per i materassi immessi sul mercato europeo.',
    brandColor: '#FF375F',
    dateLabel: 'Atto delegato atteso 2029',
    roadmapYear: 2029.2,
    regulationRef: 'ESPR — Regolamento (UE) 2024/1781',
    status: 'coming-soon',
    exampleName: 'Materasso a molle — esempio',
    exampleGtin: '08000000000088',
  },
  {
    id: 'ict',
    name: 'Elettronica e ICT',
    shortName: 'Elettronica',
    icon: 'cpu',
    description:
      'Riparabilità, disponibilità di ricambi e impronta ambientale per dispositivi elettronici e ICT.',
    brandColor: '#40C8E0',
    dateLabel: 'Atto delegato atteso 2029',
    roadmapYear: 2029.4,
    regulationRef: 'ESPR — Regolamento (UE) 2024/1781',
    status: 'coming-soon',
    exampleName: 'Router domestico — esempio',
    exampleGtin: '08000000000095',
  },
];

interface SectorTranslationEn {
  name: string;
  shortName: string;
  description: string;
  dateLabel: string;
  regulationRef: string;
  exampleName: string;
}

const SECTOR_TRANSLATIONS_EN: Record<string, SectorTranslationEn> = {
  battery: {
    name: 'Batteries',
    shortName: 'Batteries',
    description:
      'Mandatory passport for EV, LMT and industrial batteries above 2 kWh: material origin, carbon footprint, state of health and charge cycles, accessible from a QR code on the battery.',
    dateLabel: 'Mandatory from 18 February 2027',
    regulationRef: 'Regulation (EU) 2023/1542',
    exampleName: 'EV battery module — example',
  },
  apparel: {
    name: 'Textiles & apparel',
    shortName: 'Textiles',
    description:
      'Fibre composition, manufacturing processes, supply-chain traceability and recyclability, starting at production-batch level — not per garment.',
    dateLabel: 'Delegated act expected Q3-Q4 2027',
    regulationRef: 'ESPR — Regulation (EU) 2024/1781',
    exampleName: 'Garment — example',
  },
  steel: {
    name: 'Iron & steel',
    shortName: 'Iron & steel',
    description:
      'Carbon footprint and recycled content for iron and steel products — the first sector on the ESPR working plan after batteries.',
    dateLabel: 'Delegated act expected Q4 2026',
    regulationRef: 'ESPR — Regulation (EU) 2024/1781',
    exampleName: 'Steel profile — example',
  },
  construction: {
    name: 'Construction',
    shortName: 'Construction',
    description:
      'Construction materials with safety, compliance and end-of-life data, accessible on site and across the supply chain.',
    dateLabel: 'Delegated act expected Q2 2027',
    regulationRef: 'ESPR — Regulation (EU) 2024/1781',
    exampleName: 'Insulation panel — example',
  },
  aluminium: {
    name: 'Aluminium',
    shortName: 'Aluminium',
    description: 'Origin, recycled content and carbon footprint of aluminium products placed on the EU market.',
    dateLabel: 'Delegated act expected Q3-Q4 2027',
    regulationRef: 'ESPR — Regulation (EU) 2024/1781',
    exampleName: 'Aluminium profile — example',
  },
  tyres: {
    name: 'Tyres',
    shortName: 'Tyres',
    description: "Performance, durability and material traceability for tyres sold in the European Union.",
    dateLabel: 'Delegated act expected Q3-Q4 2027',
    regulationRef: 'ESPR — Regulation (EU) 2024/1781',
    exampleName: 'Summer tyre — example',
  },
  furniture: {
    name: 'Furniture',
    shortName: 'Furniture',
    description: 'Materials, durability and repairability of furniture, from the single piece to the production chain.',
    dateLabel: 'Delegated act expected 2028',
    regulationRef: 'ESPR — Regulation (EU) 2024/1781',
    exampleName: 'Office chair — example',
  },
  mattresses: {
    name: 'Mattresses',
    shortName: 'Mattresses',
    description: 'Material composition and recyclability for mattresses placed on the European market.',
    dateLabel: 'Delegated act expected 2029',
    regulationRef: 'ESPR — Regulation (EU) 2024/1781',
    exampleName: 'Spring mattress — example',
  },
  ict: {
    name: 'Electronics & ICT',
    shortName: 'Electronics',
    description: 'Repairability, spare-parts availability and environmental footprint for electronic and ICT devices.',
    dateLabel: 'Delegated act expected 2029',
    regulationRef: 'ESPR — Regulation (EU) 2024/1781',
    exampleName: 'Home router — example',
  },
};

/** Restituisce il settore con i testi nella lingua richiesta (IT è quella di base). */
export function localizeSector(sector: Sector, lang: AppLang): Sector {
  if (lang === 'it') return sector;
  const t = SECTOR_TRANSLATIONS_EN[sector.id];
  return t ? { ...sector, ...t } : sector;
}
