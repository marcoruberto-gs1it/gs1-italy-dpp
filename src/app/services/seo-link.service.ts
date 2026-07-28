import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';

/**
 * Gestisce tag <link> nell'<head> (canonical, sitemap, llms-txt...) con lo stesso pattern
 * "trova per id, altrimenti crea" usato per il JSON-LD in ProductComponent: Angular non ha un
 * servizio equivalente a Meta/Title per i tag <link>, e un [innerHTML]/appendChild ingenuo
 * duplicherebbe l'elemento in hydration invece di riusare quello già presente nell'HTML
 * prerenderizzato.
 */
@Injectable({ providedIn: 'root' })
export class SeoLinkService {
  private document = inject(DOCUMENT);

  set(id: string, attrs: { rel: string; href: string; type?: string }): void {
    let el = this.document.getElementById(id) as HTMLLinkElement | null;
    if (!el) {
      el = this.document.createElement('link');
      el.id = id;
      this.document.head.appendChild(el);
    }
    el.rel = attrs.rel;
    el.href = attrs.href;
    if (attrs.type) el.type = attrs.type;
  }
}
