// Definizione statica dei 15 termini dell'estensione gs1it: (2 classi, 13 proprietà) — la stessa
// lista introdotta in generate-knowledge-graph.js (gs1it:CertificationBody, gs1it:certifiedBy) e
// in product.service.ts::buildGdsnWebVocabJson (la gerarchia di imballo GDSN). Fonte di verità
// unica per le pagine /voc (indice) e /voc/:term (dettaglio), e per il loro prerendering — se un
// termine viene aggiunto al vocabolario, aggiungerlo qui è sufficiente perché ottenga una pagina.
export type VocabTermKind = 'Class' | 'Property';

export interface VocabTerm {
  term: string;
  kind: VocabTermKind;
  /** Solo per le proprietà. Testo libero (es. "gs1:CertificationDetails"), non un @id risolvibile. */
  domain?: string;
  range?: string;
  labelIt: string;
  labelEn: string;
  commentIt: string;
  commentEn: string;
  usageIt: string;
  usageEn: string;
}

export const VOCABULARY_TERMS: VocabTerm[] = [
  {
    term: 'TradeItemHierarchy',
    kind: 'Class',
    labelIt: 'Gerarchia di Imballo',
    labelEn: 'Trade Item Hierarchy',
    commentIt:
      "La gerarchia di imballo multilivello di un articolo commerciale così come sincronizzata in GDSN — unità base, consumer, orderable, despatch e invoice, con le quantità contenute a ciascun livello. È un concetto specifico dello scambio B2B via GDSN che il GS1 Web Vocabulary, pensato per la pubblicazione di singole pagine prodotto, non copre.",
    commentEn:
      "The multi-level packaging hierarchy of a trade item as synchronised via GDSN — base, consumer, orderable, despatch and invoice units, with the quantity contained at each level. A B2B GDSN-exchange concept that the GS1 Web Vocabulary, designed for individual product-page publishing, doesn't cover.",
    usageIt: 'Pubblicata nella tab GDSN della pagina prodotto, per i prodotti che dichiarano una gerarchia di imballo.',
    usageEn: 'Published in the GDSN tab of the product page, for products that declare a packaging hierarchy.',
  },
  {
    term: 'CertificationBody',
    kind: 'Class',
    labelIt: 'Organismo di Certificazione',
    labelEn: 'Certification Body',
    commentIt:
      "L'organizzazione che rilascia una certificazione (gs1:certificationAgency), come nodo dedicato e deduplicato: il GS1 Web Vocabulary tratta gs1:certificationAgency come testo libero, senza un'identità propria referenziabile — questo termine colma quel vuoto quando lo stesso organismo certifica più prodotti.",
    commentEn:
      "The organisation that issues a certification (gs1:certificationAgency), as a dedicated, deduplicated node: the GS1 Web Vocabulary treats gs1:certificationAgency as free text, with no referenceable identity of its own — this term fills that gap when the same body certifies multiple products.",
    usageIt: 'Un nodo per organismo nel grafo della conoscenza, collegato da ogni certificazione che quell’organismo ha rilasciato.',
    usageEn: 'One node per body in the knowledge graph, linked from every certification that body has issued.',
  },
  {
    term: 'certifiedBy',
    kind: 'Property',
    domain: 'gs1:CertificationDetails',
    range: 'gs1it:CertificationBody',
    labelIt: 'certificato da',
    labelEn: 'certified by',
    commentIt:
      'Collega un record gs1:certification al nodo gs1it:CertificationBody dedicato che lo ha rilasciato — un’aggiunta accanto a gs1:certificationAgency (che resta testo, come da vocabolario ufficiale), non una sostituzione.',
    commentEn:
      'Links a gs1:certification record to the dedicated gs1it:CertificationBody node that issued it — an addition alongside gs1:certificationAgency (kept as text, per the official vocabulary), not a replacement.',
    usageIt: 'Presente nel grafo della conoscenza (knowledge-graph.jsonld), non nella scheda JSON-LD di singolo prodotto.',
    usageEn: 'Present in the knowledge graph (knowledge-graph.jsonld), not in the single-product JSON-LD sheet.',
  },
  {
    term: 'dataPool',
    kind: 'Property',
    domain: 'gs1it:TradeItemHierarchy',
    range: 'Text',
    labelIt: 'data pool',
    labelEn: 'data pool',
    commentIt: 'Il data pool GDSN attraverso cui questa gerarchia è stata sincronizzata.',
    commentEn: 'The GDSN data pool through which this hierarchy was synchronised.',
    usageIt: 'Tab GDSN della pagina prodotto.',
    usageEn: 'GDSN tab of the product page.',
  },
  {
    term: 'lastModified',
    kind: 'Property',
    domain: 'gs1it:TradeItemHierarchy',
    range: 'Date',
    labelIt: 'ultima modifica',
    labelEn: 'last modified',
    commentIt: "Data dell'ultima sincronizzazione GDSN di questa gerarchia.",
    commentEn: 'Date of the last GDSN synchronisation of this hierarchy.',
    usageIt: 'Tab GDSN della pagina prodotto.',
    usageEn: 'GDSN tab of the product page.',
  },
  {
    term: 'tradeItemHierarchy',
    kind: 'Property',
    domain: 'gs1it:TradeItemHierarchy',
    range: 'gs1:Product (elenco)',
    labelIt: 'gerarchia',
    labelEn: 'hierarchy',
    commentIt:
      "L'elenco ordinato dei livelli di imballo (unità base, consumer, orderable, despatch, invoice) che compongono questa gerarchia.",
    commentEn: 'The ordered list of packaging levels (base, consumer, orderable, despatch, invoice units) composing this hierarchy.',
    usageIt: 'Tab GDSN della pagina prodotto.',
    usageEn: 'GDSN tab of the product page.',
  },
  {
    term: 'packagingLevel',
    kind: 'Property',
    domain: 'gs1:Product',
    range: 'Text',
    labelIt: 'livello di imballo',
    labelEn: 'packaging level',
    commentIt: 'Etichetta leggibile della posizione di questo livello nella gerarchia di imballo (es. "unità base", "cartone", "pallet").',
    commentEn: 'Human-readable label of this level’s position in the packaging hierarchy (e.g. "base unit", "carton", "pallet").',
    usageIt: 'Ogni livello della tab GDSN della pagina prodotto.',
    usageEn: 'Each level in the GDSN tab of the product page.',
  },
  {
    term: 'packagingTypeLabel',
    kind: 'Property',
    domain: 'gs1:Product',
    range: 'Text',
    labelIt: 'etichetta tipo imballo',
    labelEn: 'packaging type label',
    commentIt: 'Etichetta leggibile del codice di tipo imballo GS1 (gs1:packagingType) per questo livello.',
    commentEn: 'Human-readable label of the GS1 packaging-type code (gs1:packagingType) for this level.',
    usageIt: 'Ogni livello della tab GDSN della pagina prodotto.',
    usageEn: 'Each level in the GDSN tab of the product page.',
  },
  {
    term: 'quantityContained',
    kind: 'Property',
    domain: 'gs1:Product',
    range: 'Number',
    labelIt: 'quantità contenuta',
    labelEn: 'quantity contained',
    commentIt: 'Quantità del livello inferiore contenuta in questo livello di imballo (es. pezzi per cartone).',
    commentEn: 'Quantity of the lower level contained in this packaging level (e.g. pieces per carton).',
    usageIt: 'Ogni livello della tab GDSN della pagina prodotto.',
    usageEn: 'Each level in the GDSN tab of the product page.',
  },
  {
    term: 'containedLevel',
    kind: 'Property',
    domain: 'gs1:Product',
    range: 'Text',
    labelIt: 'livello contenuto',
    labelEn: 'contained level',
    commentIt: 'A quale livello di imballo inferiore si riferisce la quantità espressa da gs1it:quantityContained.',
    commentEn: 'Which lower packaging level the quantity expressed by gs1it:quantityContained refers to.',
    usageIt: 'Ogni livello della tab GDSN della pagina prodotto.',
    usageEn: 'Each level in the GDSN tab of the product page.',
  },
  {
    term: 'isBaseUnit',
    kind: 'Property',
    domain: 'gs1:Product',
    range: 'Boolean',
    labelIt: 'è unità base',
    labelEn: 'is base unit',
    commentIt: "Se questo livello di imballo è l'unità base — il livello più granulare della gerarchia, quello con il proprio GTIN di vendita al consumatore.",
    commentEn: "Whether this packaging level is the base unit — the most granular level of the hierarchy, the one with its own consumer-facing GTIN.",
    usageIt: 'Ogni livello della tab GDSN della pagina prodotto.',
    usageEn: 'Each level in the GDSN tab of the product page.',
  },
  {
    term: 'isConsumerUnit',
    kind: 'Property',
    domain: 'gs1:Product',
    range: 'Boolean',
    labelIt: 'è unità consumer',
    labelEn: 'is consumer unit',
    commentIt: "Se questo livello di imballo è l'unità consumer — quella effettivamente acquistata dal consumatore finale.",
    commentEn: 'Whether this packaging level is the consumer unit — the one actually purchased by the end consumer.',
    usageIt: 'Ogni livello della tab GDSN della pagina prodotto.',
    usageEn: 'Each level in the GDSN tab of the product page.',
  },
  {
    term: 'isOrderableUnit',
    kind: 'Property',
    domain: 'gs1:Product',
    range: 'Boolean',
    labelIt: 'è unità ordinabile',
    labelEn: 'is orderable unit',
    commentIt: "Se questo livello di imballo è l'unità ordinabile — quella che un cliente B2B può ordinare come articolo a sé.",
    commentEn: 'Whether this packaging level is the orderable unit — the one a B2B customer can order as a standalone item.',
    usageIt: 'Ogni livello della tab GDSN della pagina prodotto.',
    usageEn: 'Each level in the GDSN tab of the product page.',
  },
  {
    term: 'isDespatchUnit',
    kind: 'Property',
    domain: 'gs1:Product',
    range: 'Boolean',
    labelIt: 'è unità di spedizione',
    labelEn: 'is despatch unit',
    commentIt: "Se questo livello di imballo è l'unità di spedizione — quella movimentata nella logistica distributiva (tipicamente il cartone o il pallet).",
    commentEn: 'Whether this packaging level is the despatch unit — the one handled in distribution logistics (typically the carton or pallet).',
    usageIt: 'Ogni livello della tab GDSN della pagina prodotto.',
    usageEn: 'Each level in the GDSN tab of the product page.',
  },
  {
    term: 'isInvoiceUnit',
    kind: 'Property',
    domain: 'gs1:Product',
    range: 'Boolean',
    labelIt: 'è unità di fatturazione',
    labelEn: 'is invoice unit',
    commentIt: "Se questo livello di imballo è l'unità di fatturazione — quella su cui viene emesso il documento commerciale.",
    commentEn: 'Whether this packaging level is the invoice unit — the one on which the commercial document is issued.',
    usageIt: 'Ogni livello della tab GDSN della pagina prodotto.',
    usageEn: 'Each level in the GDSN tab of the product page.',
  },
];
