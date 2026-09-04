import { Meta } from '@angular/platform-browser';

/**
 * I sei tag Open Graph/Twitter Card che ogni pagina (home, prodotto, brand) deve impostare per
 * avere un'anteprima decente quando l'URL viene condiviso (Slack, WhatsApp, LinkedIn, X…). Un
 * unico posto invece di ripetere le stesse sei chiamate a Meta.updateTag in ogni componente
 * pagina — og:type/og:site_name/twitter:card sono invece statici, impostati una sola volta in
 * index.html perché non cambiano da una pagina all'altra.
 */
export interface SocialMetaInput {
  title: string;
  description: string;
  url: string;
  /** URL assoluto — i consumer di og:image non risolvono percorsi relativi. */
  image?: string;
}

export function setSocialMeta(meta: Meta, input: SocialMetaInput): void {
  meta.updateTag({ property: 'og:title', content: input.title });
  meta.updateTag({ property: 'og:description', content: input.description });
  meta.updateTag({ property: 'og:url', content: input.url });
  meta.updateTag({ name: 'twitter:title', content: input.title });
  meta.updateTag({ name: 'twitter:description', content: input.description });
  if (input.image) {
    meta.updateTag({ property: 'og:image', content: input.image });
    meta.updateTag({ name: 'twitter:image', content: input.image });
  }
}
