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
  /** Solo il frammento data di dateLabel (es. "18 feb 2027", "Q4 2026"), senza il prefisso
   * "Obbligo dal"/"Atto delegato atteso" — quel prefisso è già leggibile una volta sola
   * nell'intro della roadmap compatta in home.html; ripeterlo per ciascuno dei 9 nodi, in una
   * colonna larga quanto 1/9 di 620px, è quello che li faceva andare a capo su 2-3 righe. */
  dateShort: string;
  /** Stessa data di dateLabel, come numero (anno + frazione per il trimestre) — usato solo per
   * posizionare il settore sull'asse del grafico roadmap in home.html. Non tradotto (un
   * numero non ha lingua), non mostrato direttamente all'utente. */
  roadmapYear: number;
  /** Riferimento normativo breve per la card di anteprima nella hero. */
  regulationRef: string;
  /** Stesso riferimento normativo di regulationRef, come identificativo macchina — valorizza
   * "contentSpecificationIds" nel JSON-LD del DPP (EN 18223 §4.1.2.1, Tabella 1: "references to
   * delegated/implementing acts or other content specifications"). Non tradotto (un
   * identificativo non ha lingua, esattamente come roadmapYear qui sopra). */
  contentSpecificationId: string;
  /** 'coming-soon': settore annunciato in homepage ma senza ancora prodotti pubblicati. */
  status: 'live' | 'coming-soon';
  /** Nome del prodotto di esempio nella card di anteprima — dato dimostrativo, non un prodotto reale. */
  exampleName: string;
  /** GTIN di esempio (14 cifre, dato dimostrativo) per QR e element string della card di anteprima. */
  exampleGtin: string;
  /** Riga aggiuntiva dell'element string GS1 (es. AI (10) per un lotto) — solo dove serve. */
  exampleExtraElement?: string;
  /** Due tappe di filiera plausibili ("passo · luogo", dato dimostrativo) per il mini percorso
   * mostrato nella card di anteprima della hero — insieme alla scansione dell'utente stesso
   * (terza tappa, generica, vedi heroPreview.scannedNow) suggeriscono cosa un vero DPP
   * mostrerebbe: non solo i dati del prodotto, ma la sua storia verificabile. */
  exampleJourneyStep1: string;
  exampleJourneyStep2: string;
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
    dateShort: '18 feb 2027',
    roadmapYear: 2027.13,
    regulationRef: 'Regolamento (UE) 2023/1542',
    contentSpecificationId: 'EU_BATTERY_REGULATION_2023_1542',
    status: 'coming-soon',
    exampleName: 'Modulo batteria EV — esempio',
    exampleGtin: '08000000000019',
    exampleJourneyStep1: 'Celle assemblate · Svezia',
    exampleJourneyStep2: 'Collaudo e imballo · Germania',
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
    dateShort: 'Q3-Q4 2027',
    roadmapYear: 2027.5,
    regulationRef: 'ESPR — Regolamento (UE) 2024/1781',
    contentSpecificationId: 'EU_ESPR_REGULATION_2024_1781',
    status: 'coming-soon',
    exampleName: 'Capo — esempio',
    exampleGtin: '08000000000026',
    exampleExtraElement: '(10) LOTTO2027A',
    exampleJourneyStep1: 'Tessuto tessuto · Portogallo',
    exampleJourneyStep2: 'Confezionato · Italia',
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
    dateShort: 'Q4 2026',
    roadmapYear: 2026.9,
    regulationRef: 'ESPR — Regolamento (UE) 2024/1781',
    contentSpecificationId: 'EU_ESPR_REGULATION_2024_1781',
    status: 'coming-soon',
    exampleName: 'Profilato in acciaio — esempio',
    exampleGtin: '08000000000033',
    exampleJourneyStep1: 'Colata e laminazione · Italia',
    exampleJourneyStep2: 'Certificazione qualità · Italia',
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
    dateShort: 'Q2 2027',
    roadmapYear: 2027.4,
    regulationRef: 'ESPR — Regolamento (UE) 2024/1781',
    contentSpecificationId: 'EU_ESPR_REGULATION_2024_1781',
    status: 'coming-soon',
    exampleName: 'Pannello isolante — esempio',
    exampleGtin: '08000000000040',
    exampleJourneyStep1: 'Materia prima · Germania',
    exampleJourneyStep2: 'Produzione pannelli · Polonia',
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
    dateShort: 'Q3-Q4 2027',
    roadmapYear: 2027.6,
    regulationRef: 'ESPR — Regolamento (UE) 2024/1781',
    contentSpecificationId: 'EU_ESPR_REGULATION_2024_1781',
    status: 'coming-soon',
    exampleName: 'Profilo in alluminio — esempio',
    exampleGtin: '08000000000057',
    exampleJourneyStep1: 'Fusione lega · Norvegia',
    exampleJourneyStep2: 'Estrusione profilo · Italia',
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
    dateShort: 'Q3-Q4 2027',
    roadmapYear: 2027.7,
    regulationRef: 'ESPR — Regolamento (UE) 2024/1781',
    contentSpecificationId: 'EU_ESPR_REGULATION_2024_1781',
    status: 'coming-soon',
    exampleName: 'Pneumatico estivo — esempio',
    exampleGtin: '08000000000064',
    exampleJourneyStep1: 'Mescola e stampaggio · Romania',
    exampleJourneyStep2: 'Collaudo su strada · Germania',
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
    dateShort: '2028',
    roadmapYear: 2028.5,
    regulationRef: 'ESPR — Regolamento (UE) 2024/1781',
    contentSpecificationId: 'EU_ESPR_REGULATION_2024_1781',
    status: 'coming-soon',
    exampleName: 'Sedia da ufficio — esempio',
    exampleGtin: '08000000000071',
    exampleJourneyStep1: 'Taglio componenti · Italia',
    exampleJourneyStep2: 'Assemblaggio finale · Italia',
  },
  {
    id: 'mattresses',
    name: 'Materassi',
    shortName: 'Materassi',
    icon: 'bed',
    description: 'Composizione dei materiali e riciclabilità per i materassi immessi sul mercato europeo.',
    brandColor: '#FF375F',
    dateLabel: 'Atto delegato atteso 2029',
    dateShort: '2029',
    roadmapYear: 2029.2,
    regulationRef: 'ESPR — Regolamento (UE) 2024/1781',
    contentSpecificationId: 'EU_ESPR_REGULATION_2024_1781',
    status: 'coming-soon',
    exampleName: 'Materasso a molle — esempio',
    exampleGtin: '08000000000088',
    exampleJourneyStep1: 'Produzione molle · Belgio',
    exampleJourneyStep2: 'Imbottitura e confezione · Italia',
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
    dateShort: '2029',
    roadmapYear: 2029.4,
    regulationRef: 'ESPR — Regolamento (UE) 2024/1781',
    contentSpecificationId: 'EU_ESPR_REGULATION_2024_1781',
    status: 'coming-soon',
    exampleName: 'Router domestico — esempio',
    exampleGtin: '08000000000095',
    exampleJourneyStep1: 'Assemblaggio schede · Taiwan',
    exampleJourneyStep2: 'Collaudo finale · Paesi Bassi',
  },
];

interface SectorTranslationEn {
  name: string;
  shortName: string;
  description: string;
  dateLabel: string;
  dateShort: string;
  regulationRef: string;
  exampleName: string;
  exampleJourneyStep1: string;
  exampleJourneyStep2: string;
}

const SECTOR_TRANSLATIONS_EN: Record<string, SectorTranslationEn> = {
  battery: {
    name: 'Batteries',
    shortName: 'Batteries',
    description:
      'Mandatory passport for EV, LMT and industrial batteries above 2 kWh: material origin, carbon footprint, state of health and charge cycles, accessible from a QR code on the battery.',
    dateLabel: 'Mandatory from 18 February 2027',
    dateShort: '18 Feb 2027',
    regulationRef: 'Regulation (EU) 2023/1542',
    exampleName: 'EV battery module — example',
    exampleJourneyStep1: 'Cells assembled · Sweden',
    exampleJourneyStep2: 'Tested and packed · Germany',
  },
  apparel: {
    name: 'Textiles & apparel',
    shortName: 'Textiles',
    description:
      'Fibre composition, manufacturing processes, supply-chain traceability and recyclability, starting at production-batch level — not per garment.',
    dateLabel: 'Delegated act expected Q3-Q4 2027',
    dateShort: 'Q3-Q4 2027',
    regulationRef: 'ESPR — Regulation (EU) 2024/1781',
    exampleName: 'Garment — example',
    exampleJourneyStep1: 'Fabric woven · Portugal',
    exampleJourneyStep2: 'Sewn and packed · Italy',
  },
  steel: {
    name: 'Iron & steel',
    shortName: 'Iron & steel',
    description:
      'Carbon footprint and recycled content for iron and steel products — the first sector on the ESPR working plan after batteries.',
    dateLabel: 'Delegated act expected Q4 2026',
    dateShort: 'Q4 2026',
    regulationRef: 'ESPR — Regulation (EU) 2024/1781',
    exampleName: 'Steel profile — example',
    exampleJourneyStep1: 'Cast and rolled · Italy',
    exampleJourneyStep2: 'Quality certification · Italy',
  },
  construction: {
    name: 'Construction',
    shortName: 'Construction',
    description:
      'Construction materials with safety, compliance and end-of-life data, accessible on site and across the supply chain.',
    dateLabel: 'Delegated act expected Q2 2027',
    dateShort: 'Q2 2027',
    regulationRef: 'ESPR — Regulation (EU) 2024/1781',
    exampleName: 'Insulation panel — example',
    exampleJourneyStep1: 'Raw material · Germany',
    exampleJourneyStep2: 'Panel production · Poland',
  },
  aluminium: {
    name: 'Aluminium',
    shortName: 'Aluminium',
    description: 'Origin, recycled content and carbon footprint of aluminium products placed on the EU market.',
    dateLabel: 'Delegated act expected Q3-Q4 2027',
    dateShort: 'Q3-Q4 2027',
    regulationRef: 'ESPR — Regulation (EU) 2024/1781',
    exampleName: 'Aluminium profile — example',
    exampleJourneyStep1: 'Alloy smelted · Norway',
    exampleJourneyStep2: 'Profile extrusion · Italy',
  },
  tyres: {
    name: 'Tyres',
    shortName: 'Tyres',
    description: "Performance, durability and material traceability for tyres sold in the European Union.",
    dateLabel: 'Delegated act expected Q3-Q4 2027',
    dateShort: 'Q3-Q4 2027',
    regulationRef: 'ESPR — Regulation (EU) 2024/1781',
    exampleName: 'Summer tyre — example',
    exampleJourneyStep1: 'Compound and moulding · Romania',
    exampleJourneyStep2: 'Road-tested · Germany',
  },
  furniture: {
    name: 'Furniture',
    shortName: 'Furniture',
    description: 'Materials, durability and repairability of furniture, from the single piece to the production chain.',
    dateLabel: 'Delegated act expected 2028',
    dateShort: '2028',
    regulationRef: 'ESPR — Regulation (EU) 2024/1781',
    exampleName: 'Office chair — example',
    exampleJourneyStep1: 'Parts cut · Italy',
    exampleJourneyStep2: 'Final assembly · Italy',
  },
  mattresses: {
    name: 'Mattresses',
    shortName: 'Mattresses',
    description: 'Material composition and recyclability for mattresses placed on the European market.',
    dateLabel: 'Delegated act expected 2029',
    dateShort: '2029',
    regulationRef: 'ESPR — Regulation (EU) 2024/1781',
    exampleName: 'Spring mattress — example',
    exampleJourneyStep1: 'Springs produced · Belgium',
    exampleJourneyStep2: 'Upholstery and packing · Italy',
  },
  ict: {
    name: 'Electronics & ICT',
    shortName: 'Electronics',
    description: 'Repairability, spare-parts availability and environmental footprint for electronic and ICT devices.',
    dateLabel: 'Delegated act expected 2029',
    dateShort: '2029',
    regulationRef: 'ESPR — Regulation (EU) 2024/1781',
    exampleName: 'Home router — example',
    exampleJourneyStep1: 'Boards assembled · Taiwan',
    exampleJourneyStep2: 'Final testing · Netherlands',
  },
};

/** Restituisce il settore con i testi nella lingua richiesta (IT è quella di base). */
export function localizeSector(sector: Sector, lang: AppLang): Sector {
  if (lang === 'it') return sector;
  const t = SECTOR_TRANSLATIONS_EN[sector.id];
  return t ? { ...sector, ...t } : sector;
}
