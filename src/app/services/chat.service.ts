import { Injectable, inject } from '@angular/core';
import { I18nService } from './i18n.service';
import { Product, ProductService, getVocabularies } from './product.service';

export type ChatRole = 'user' | 'assistant';

/** Chiavi dei campi dati strutturati che una ricerca può citare come prova (vedi FIELD_SOURCES). */
export type MatchedField =
  | 'name' | 'brand' | 'sector' | 'description' | 'ingredients' | 'allergens'
  | 'material' | 'color' | 'sustainability' | 'origin' | 'certifications' | 'traceability';

export interface ChatProductMatch {
  product: Product;
  /** Campi dei dati strutturati che giustificano il risultato — assente se il backend non lo fornisce. */
  matchedFields?: MatchedField[];
}

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  products?: ChatProductMatch[];
  error?: boolean;
}

/**
 * Endpoint del futuro backend LLM. Il server (da configurare in una fase successiva) riceverà
 * il messaggio e la cronologia, eseguirà una ricerca/RAG sui dati strutturati JSON-LD del
 * catalogo (`products.json` / `rawGs1Data`) e risponderà indicando quali prodotti (GTIN) sono
 * pertinenti. Il client non invia mai l'intero catalogo: il backend ha accesso diretto ai dati.
 *
 * Contratto atteso:
 *   POST {CHAT_API_ENDPOINT}
 *   body:     { message: string, history: { role: 'user'|'assistant', content: string }[] }
 *   risposta: { reply: string, results?: { gtin: string, matchedFields?: MatchedField[] }[] }
 *
 * `reply` è testo generato dal modello: nella UI viene sempre presentato come una deduzione
 * dell'assistente, mai come dato di catalogo verificato. `results` invece è verificato per
 * costruzione — ogni GTIN viene risolto contro il catalogo reale (ProductService) e scartato se
 * non esiste — ed è l'unica parte della risposta che la UI mostra come "dati strutturati".
 *
 * Finché il backend non è configurato, la richiesta fallisce (404) e si attiva automaticamente
 * il fallback locale sottostante, che simula una risposta cercando tra i prodotti del catalogo.
 */
const CHAT_API_ENDPOINT = '/api/chat';

interface ChatApiResponse {
  reply: string;
  results?: { gtin: string; matchedFields?: MatchedField[] }[];
}

@Injectable({ providedIn: 'root' })
export class ChatService {
  private productService = inject(ProductService);
  private t = inject(I18nService).t;

  async sendMessage(message: string, history: ChatMessage[]): Promise<ChatMessage> {
    try {
      const response = await fetch(CHAT_API_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          history: history.map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      if (!response.ok) throw new Error(`chat API ${response.status}`);
      const data = (await response.json()) as ChatApiResponse;
      return {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: data.reply,
        products: sortByVocabPriority(
          (data.results ?? [])
            .map((r): ChatProductMatch | null => {
              const product = this.productService.getProductByGtin(r.gtin);
              return product ? { product, matchedFields: r.matchedFields } : null;
            })
            .filter((m): m is ChatProductMatch => !!m),
        ),
      };
    } catch {
      return this.localFallback(message);
    }
  }

  /**
   * Simulazione locale, attiva finché il backend LLM non è disponibile: cerca tra i campi
   * testuali del catalogo (nome, marchio, settore, descrizione, ingredienti, materiali,
   * certificazioni...) i termini della domanda e restituisce i prodotti più pertinenti, insieme
   * ai campi che hanno determinato ciascun risultato. Non è un vero LLM — è solo un ripiego per
   * rendere la sezione già utilizzabile in fase di sviluppo.
   */
  private localFallback(message: string): ChatMessage {
    // Le domande su un allergene specifico ("senza glutine" vs "contiene glutine") non possono
    // essere risolte da un match per parola chiave: "glutine" è presente nel testo in entrambi i
    // casi. Qui interpretiamo la negazione e rispondiamo usando il livello di contenimento
    // strutturato (gs1:AllergenDetails) invece del semplice matching testuale.
    const allergenIntent = detectAllergenIntent(message);
    if (allergenIntent) return this.allergenFallback(allergenIntent);

    const words = message
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((t) => t.length >= 3);
    // Le parole troppo generiche (stopword) da sole producono falsi positivi (es. "senza" in
    // "senza glutine" combacerebbe anche con "termometro senza contatto"): contano solo se non
    // restano altri termini significativi nella domanda.
    const terms = words.filter((w) => !STOPWORDS.has(w));
    const effectiveTerms = terms.length ? terms : words;
    // Richiede che corrisponda almeno metà dei termini significativi, non un singolo termine
    // isolato su una domanda lunga: riduce ulteriormente i risultati fuori tema.
    const threshold = Math.max(1, Math.ceil(effectiveTerms.length / 2));

    const matches: ChatProductMatch[] = effectiveTerms.length
      ? sortByVocabPriority(
          this.productService
            .getAllProducts()
            .map((product) => scoreProduct(product, effectiveTerms))
            .filter((m) => m.score >= threshold)
            .sort((a, b) => b.score - a.score)
            .slice(0, 5)
            .map((m) => ({ product: m.product, matchedFields: m.matchedFields })),
        )
      : [];

    return {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: matches.length
        ? this.t('chat.localFoundIntro', { count: matches.length })
        : this.t('chat.localEmptyIntro'),
      products: matches,
    };
  }

  /** Filtra i soli prodotti alimentari per livello di contenimento dell'allergene richiesto. */
  private allergenFallback(intent: AllergenIntent): ChatMessage {
    const allergenLabel = this.t(`chat.allergenLabel.${intent.code}`);
    const matches: ChatProductMatch[] = sortByVocabPriority(
      this.productService
        .getAllProducts()
        .filter((product) => product.food)
        .map((product) => ({ product, level: allergenLevel(product, intent.code) }))
        .filter((m) => (intent.exclude ? m.level === 'FREE_FROM' : m.level === 'CONTAINS' || m.level === 'MAY_CONTAIN'))
        .map((m) => ({ product: m.product, matchedFields: ['allergens'] as MatchedField[] })),
    ).slice(0, 8);

    const key = matches.length
      ? intent.exclude ? 'chat.allergenFreeFoundIntro' : 'chat.allergenContainsFoundIntro'
      : intent.exclude ? 'chat.allergenFreeEmptyIntro' : 'chat.allergenContainsEmptyIntro';

    return {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: this.t(key, { count: matches.length, allergen: allergenLabel }),
      products: matches,
    };
  }
}

// =========================================================================
// Domande su un allergene specifico: "senza glutine" e "contiene glutine"
// condividono la parola "glutine" ma richiedono risposte opposte — un match
// per parola chiave non può distinguerle. Qui interpretiamo la negazione e
// rispondiamo con il livello di contenimento (gs1:AllergenDetails) invece
// che con un semplice "il termine compare nel testo".
// =========================================================================

type AllergenCode = 'GLUTEN' | 'MILK' | 'FISH' | 'MOLLUSCS' | 'CELERY' | 'SOY' | 'TREE_NUTS' | 'SULPHITES';
type AllergenLevel = 'CONTAINS' | 'MAY_CONTAIN' | 'FREE_FROM';
interface AllergenIntent {
  code: AllergenCode;
  exclude: boolean; // true = l'utente cerca prodotti SENZA questo allergene
}

const ALLERGEN_SEARCH_TERMS: { code: AllergenCode; terms: string[] }[] = [
  { code: 'GLUTEN', terms: ['glutine', 'gluten'] },
  { code: 'MILK', terms: ['latte', 'milk', 'lattosio', 'lactose', 'dairy'] },
  { code: 'FISH', terms: ['pesce', 'fish'] },
  { code: 'MOLLUSCS', terms: ['molluschi', 'molluscs', 'mollusks'] },
  { code: 'CELERY', terms: ['sedano', 'celery'] },
  { code: 'SOY', terms: ['soia', 'soy', 'soybean', 'soybeans'] },
  { code: 'TREE_NUTS', terms: ['frutta a guscio', 'noci', 'nuts', 'nut'] },
  { code: 'SULPHITES', terms: ['solfiti', 'solfito', 'sulphites', 'sulfites', 'sulphite', 'sulfite'] },
];

const NEGATION_WORDS = new Set([
  'senza', 'non', 'privo', 'priva', 'esente', 'esenti', 'niente',
  'without', 'no', 'free', 'not',
]);

function detectAllergenIntent(message: string): AllergenIntent | null {
  const lower = message.toLowerCase();
  const words = lower.split(/[^\p{L}\p{N}]+/u).filter(Boolean);

  for (const entry of ALLERGEN_SEARCH_TERMS) {
    if (!entry.terms.some((term) => lower.includes(term))) continue;
    const exclude = words.some((w) => NEGATION_WORDS.has(w));
    return { code: entry.code, exclude };
  }
  return null;
}

/** Etichette IT usate anche per il fallback testuale (i nomi effettivamente scritti nei dati). */
const ALLERGEN_TEXT_LABELS: Record<AllergenCode, string> = {
  GLUTEN: 'glutine',
  MILK: 'latte',
  FISH: 'pesce',
  MOLLUSCS: 'molluschi',
  CELERY: 'sedano',
  SOY: 'soia',
  TREE_NUTS: 'frutta a guscio',
  SULPHITES: 'solfiti',
};

/**
 * Livello di contenimento dell'allergene per un prodotto: usa il dato strutturato
 * gs1:AllergenDetails quando disponibile (preciso), altrimenti applica un'euristica sul testo
 * libero `food.allergens` — analizzando ogni frase separatamente, perché una singola dicitura
 * può dichiarare più allergeni con livelli diversi (es. "Contiene glutine. Può contenere tracce
 * di soia."). Nessun allergene dichiarato per il prodotto equivale a FREE_FROM.
 */
function allergenLevel(product: Product, code: AllergenCode): AllergenLevel {
  const structured = product.rawGs1Data?.['gs1:allergen'] as
    | { 'gs1:allergenType'?: { '@id'?: string }; 'gs1:allergenLevelOfContainmentCode'?: { '@id'?: string } }[]
    | undefined;

  if (structured?.length) {
    const entry = structured.find((a) => a['gs1:allergenType']?.['@id'] === `gs1:AllergenTypeCode-${code}`);
    if (entry) {
      const levelId = entry['gs1:allergenLevelOfContainmentCode']?.['@id'] ?? '';
      if (levelId.endsWith('CONTAINS')) return 'CONTAINS';
      if (levelId.endsWith('MAY_CONTAIN')) return 'MAY_CONTAIN';
      if (levelId.endsWith('FREE_FROM')) return 'FREE_FROM';
    }
    // Ha un elenco di allergeni strutturato ma non cita questo codice: non dichiarato = assente.
    return 'FREE_FROM';
  }

  const text = product.food?.allergens;
  if (!text) return 'FREE_FROM';
  const lower = text.toLowerCase();
  if (lower.includes('nessun allergene')) return 'FREE_FROM';

  const label = ALLERGEN_TEXT_LABELS[code];
  const sentences = lower.split(/[.;]/).map((s) => s.trim()).filter(Boolean);
  let level: AllergenLevel | null = null;
  for (const sentence of sentences) {
    if (!sentence.includes(label)) continue;
    if (sentence.includes('può contenere') || sentence.includes('tracce')) {
      level = level ?? 'MAY_CONTAIN';
    } else if (sentence.includes('senza') || sentence.includes('non contiene') || sentence.includes('idoneo')) {
      return 'FREE_FROM';
    } else {
      return 'CONTAINS'; // dicitura diretta ("Contiene glutine", o frase secca "Pesce.")
    }
  }
  return level ?? 'FREE_FROM';
}

/**
 * Ordina i risultati per "grado di affidabilità" dei dati pubblicati, non solo per pertinenza:
 * prima i prodotti con GS1 Web Vocabulary (il vocabolario di riferimento GS1), poi quelli con
 * solo schema.org, infine i prodotti presenti a catalogo ma senza dati strutturati. L'ordine di
 * rilevanza già calcolato (punteggio/ordine del backend) viene preservato all'interno di ogni
 * gruppo, perché Array.prototype.sort è stabile.
 */
function vocabRank(product: Product): number {
  const vocabs = getVocabularies(product);
  if (vocabs.includes('gs1')) return 0;
  if (vocabs.includes('schema')) return 1;
  return 2;
}

function sortByVocabPriority(matches: ChatProductMatch[]): ChatProductMatch[] {
  return [...matches].sort((a, b) => vocabRank(a.product) - vocabRank(b.product));
}

// Parole troppo comuni per essere un segnale utile di ricerca da sole (italiano + inglese).
const STOPWORDS = new Set([
  'prodotti', 'prodotto', 'con', 'senza', 'per', 'che', 'delle', 'della', 'dello', 'dei', 'del',
  'una', 'uno', 'gli', 'sono', 'come', 'questo', 'questa', 'questi', 'queste', 'anche', 'più',
  'products', 'product', 'with', 'without', 'for', 'that', 'this', 'these', 'those', 'are', 'the', 'and',
]);

/** Ogni campo indicizzato per la ricerca locale, con la chiave usata per citarlo come prova. */
function fieldSources(product: Product): { key: MatchedField; text: string }[] {
  return [
    { key: 'name', text: product.name },
    { key: 'brand', text: product.brand },
    { key: 'sector', text: product.sectorName },
    { key: 'description', text: product.description },
    { key: 'ingredients', text: product.food?.ingredients },
    { key: 'allergens', text: product.food?.allergens },
    { key: 'material', text: product.apparel?.material },
    { key: 'color', text: product.apparel?.color },
    {
      key: 'sustainability',
      text: [product.environmentalImpact?.recycledContent, product.environmentalImpact?.sustainabilityCertifiedContent]
        .filter(Boolean)
        .join(' '),
    },
    { key: 'origin', text: product.logistics?.origin },
    { key: 'certifications', text: product.certifications?.map((c) => c.value).filter(Boolean).join(' ') },
    { key: 'traceability', text: product.traceability?.map((ev) => ev.label).join(' ') },
  ]
    .filter((f): f is { key: MatchedField; text: string } => !!f.text)
    .map((f) => ({ key: f.key, text: f.text.toLowerCase() }));
}

function scoreProduct(product: Product, terms: string[]): { product: Product; score: number; matchedFields: MatchedField[] } {
  const sources = fieldSources(product);
  const matchedFields = new Set<MatchedField>();
  let score = 0;

  for (const term of terms) {
    let termMatched = false;
    for (const source of sources) {
      if (matchesTerm(term, source.text)) {
        matchedFields.add(source.key);
        termMatched = true;
      }
    }
    if (termMatched) score++;
  }

  return { product, score, matchedFields: [...matchedFields] };
}

/**
 * Oltre alla corrispondenza per sottostringa, confronta un prefisso delle singole parole: senza
 * uno stemmer vero, permette a termini come "biologica"/"medici" di trovare "biologico"/"medico"
 * nei dati (semplici variazioni di genere e numero), un caso reale incontrato testando la ricerca.
 */
function matchesTerm(term: string, text: string): boolean {
  if (text.includes(term)) return true;
  if (term.length < 5) return false;
  const stemLen = term.length - 2;
  const stem = term.slice(0, stemLen);
  return text.split(/[^\p{L}\p{N}]+/u).some((w) => w.length >= stemLen && w.slice(0, stemLen) === stem);
}
