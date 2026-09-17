import { isPlatformBrowser } from '@angular/common';
import { DOCUMENT, Injectable, PLATFORM_ID, inject, signal } from '@angular/core';

export type AppTheme = 'light' | 'dark';

/**
 * Stessa chiave letta dallo script inline in src/index.html, che applica il tema prima del
 * primo paint per non far lampeggiare la pagina.
 */
const STORAGE_KEY = 'gs1-theme';

function fromStorage(): AppTheme | null {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === 'light' || saved === 'dark' ? saved : null;
  } catch {
    return null; // localStorage non disponibile (modalità privata, ecc.)
  }
}

/**
 * Tema attivo dell'app. Ordine: preferenza salvata dall'utente, altrimenti impostazione di
 * sistema. Finché l'utente non sceglie, il sito continua a seguire il sistema; dal momento
 * in cui sceglie, la sua decisione vince e viene ricordata.
 *
 * Lato server si assume 'light': è il tema con cui viene prerenderizzato l'HTML, e lo script
 * in index.html corregge l'attributo prima che la pagina sia visibile.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private platformId = inject(PLATFORM_ID);
  private document = inject(DOCUMENT);

  private detectInitial(): AppTheme {
    if (!isPlatformBrowser(this.platformId)) return 'light';
    const stored = fromStorage();
    if (stored) return stored;
    return this.document.defaultView?.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  }

  theme = signal<AppTheme>(this.detectInitial());

  /** Applica il tema, lo ricorda, e lo scrive sull'attributo che i token CSS osservano. */
  setTheme(theme: AppTheme): void {
    this.theme.set(theme);
    if (!isPlatformBrowser(this.platformId)) return;

    this.document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      /* localStorage non disponibile — la scelta vale solo per questa sessione */
    }
  }

}
