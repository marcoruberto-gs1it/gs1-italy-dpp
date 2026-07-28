import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, REQUEST, inject, signal } from '@angular/core';

export type AppLang = 'it' | 'en';

const SUPPORTED: readonly AppLang[] = ['it', 'en'];
const DEFAULT_LANG: AppLang = 'it';
const STORAGE_KEY = 'gs1-catalog-lang';

/** Estrae la lingua preferita (tra quelle supportate) da un header Accept-Language HTTP. */
function fromAcceptLanguage(header: string | null): AppLang | null {
  if (!header) return null;
  const entries = header
    .split(',')
    .map((part) => {
      const [tag, qPart] = part.trim().split(';q=');
      const q = qPart ? parseFloat(qPart) : 1;
      return { tag: tag.trim().toLowerCase(), q: Number.isNaN(q) ? 1 : q };
    })
    .sort((a, b) => b.q - a.q);

  for (const { tag } of entries) {
    const base = tag.split('-')[0] as AppLang;
    if (SUPPORTED.includes(base)) return base;
  }
  return null;
}

/** Estrae la lingua preferita dalle impostazioni del browser (navigator.languages). */
function fromNavigator(): AppLang | null {
  const langs = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const l of langs) {
    const base = l.split('-')[0].toLowerCase() as AppLang;
    if (SUPPORTED.includes(base)) return base;
  }
  return null;
}

/** Preferenza salvata esplicitamente dall'utente tramite il selettore di lingua, se presente. */
function fromStorage(): AppLang | null {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === 'it' || saved === 'en' ? saved : null;
  } catch {
    return null; // localStorage non disponibile (privacy mode, ecc.)
  }
}

/**
 * Lingua attiva dell'app (solo italiano/inglese). Ordine di rilevamento:
 * 1. Preferenza esplicita salvata dall'utente tramite il selettore di lingua (localStorage).
 * 2. In assenza di scelta esplicita, rilevamento automatico:
 *    - Lato server, quando esiste una richiesta HTTP reale (SSR non prerenderizzato, es. `ng
 *      serve` o rotte in RenderMode.Client), dall'header Accept-Language.
 *    - Lato browser, da `navigator.languages` — l'equivalente client-side dello stesso segnale,
 *      necessario perché le pagine prerenderizzate in build non hanno una richiesta reale a cui
 *      agganciarsi. Dopo l'idratazione la lingua rilevata dal browser prevale sempre finché
 *      l'utente non sceglie esplicitamente una lingua.
 */
@Injectable({ providedIn: 'root' })
export class LanguageService {
  private platformId = inject(PLATFORM_ID);
  private request = inject(REQUEST, { optional: true });

  private detectInitial(): AppLang {
    if (isPlatformBrowser(this.platformId)) {
      return fromStorage() ?? fromNavigator() ?? DEFAULT_LANG;
    }
    return fromAcceptLanguage(this.request?.headers.get('accept-language') ?? null) ?? DEFAULT_LANG;
  }

  lang = signal<AppLang>(this.detectInitial());

  /** Imposta esplicitamente la lingua e la ricorda per le prossime visite. */
  setLang(lang: AppLang): void {
    this.lang.set(lang);
    if (isPlatformBrowser(this.platformId)) {
      try {
        localStorage.setItem(STORAGE_KEY, lang);
      } catch {
        /* localStorage non disponibile — la scelta resta valida solo per questa sessione */
      }
    }
  }
}
