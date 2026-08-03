import { DOCUMENT, Injectable, inject } from '@angular/core';

/**
 * Pubblica un blocco `application/ld+json` nella pagina.
 *
 * Il pattern è "trova per id, altrimenti crea", lo stesso che usano internamente i servizi
 * Title e Meta di Angular: legare lo script al template con [innerHTML] fa sì che durante
 * l'hydration ne compaia un secondo accanto a quello prerenderizzato, e un validator
 * schema.org segnalerebbe due record identici.
 *
 * Ogni pagina usa un id diverso, così due sezioni possono pubblicare i propri dati senza
 * sovrascriversi, e ognuna può ripulire il proprio quando viene abbandonata.
 */
@Injectable({ providedIn: 'root' })
export class StructuredDataService {
  private document = inject(DOCUMENT);

  /** Scrive (o aggiorna) il blocco con quell'id. `null` lo rimuove. */
  apply(id: string, data: unknown | null): void {
    let script = this.document.getElementById(id) as HTMLScriptElement | null;

    if (!data) {
      script?.remove();
      return;
    }

    if (!script) {
      script = this.document.createElement('script');
      script.type = 'application/ld+json';
      script.id = id;
      this.document.body.appendChild(script);
    }

    script.textContent = JSON.stringify(data);
  }

  remove(id: string): void {
    this.document.getElementById(id)?.remove();
  }
}
