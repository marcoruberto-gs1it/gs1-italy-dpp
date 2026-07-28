import { Injectable, inject } from '@angular/core';
import { LanguageService } from './language.service';
import { TRANSLATIONS } from '../i18n/translations';

/** Traduzione statica dell'interfaccia utente, reattiva alla lingua rilevata da LanguageService. */
@Injectable({ providedIn: 'root' })
export class I18nService {
  private languageService = inject(LanguageService);

  /** Restituisce la stringa tradotta per `path` (es. "nav.home"), con interpolazione opzionale. */
  t = (path: string, params?: Record<string, string | number>): string => {
    const dict = TRANSLATIONS[this.languageService.lang()];
    const value = path.split('.').reduce<unknown>((acc, key) => (acc as Record<string, unknown> | undefined)?.[key], dict);
    let result = typeof value === 'string' ? value : path;
    if (params) {
      for (const [key, val] of Object.entries(params)) {
        result = result.replace(`{${key}}`, String(val));
      }
    }
    return result;
  };
}
