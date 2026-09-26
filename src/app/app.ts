import { Component, HostListener, computed, effect, inject, PLATFORM_ID, signal } from '@angular/core';
import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';
import { ThemeService } from './services/theme.service';
import { LanguageService } from './services/language.service';
import { I18nService } from './services/i18n.service';
import { SeoLinkService } from './services/seo-link.service';
import { SiteOriginService } from './services/site-origin.service';
import { IconComponent } from './components/icon/icon';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, IconComponent],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  protected readonly title = signal('gs1-catalog');
  protected languageService = inject(LanguageService);
  protected themeService = inject(ThemeService);
  protected t = inject(I18nService).t;
  private platformId = inject(PLATFORM_ID);
  private document = inject(DOCUMENT);
  private router = inject(Router);
  private seoLinks = inject(SeoLinkService);
  private siteOrigin = inject(SiteOriginService);

  protected mobileNavOpen = signal(false);

  // Segnale che avanza a ogni navigazione completata: usato per aggiornare il link canonical
  // in modo reattivo. initialValue null perché al bootstrap (hydration inclusa) il Router non
  // ha ancora emesso il primo NavigationEnd a quel punto preciso — leggere router.url in quel
  // momento restituirebbe ancora "/" indipendentemente dalla rotta reale.
  private navigationEnd = toSignal(
    this.router.events.pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd)),
    { initialValue: null },
  );

  /** /admin ha una console propria (sidebar + topbar, vedi admin.html): header e footer del sito
   * vetrina si nascondono lì, come nel design Figma dove la console è a schermo intero. Stessa
   * logica di risoluzione dell'URL del canonical più sotto (NavigationEnd, con ripiego su
   * location al primissimo paint quando il Router non ha ancora emesso). */
  protected consoleMode = computed(() => {
    const nav = this.navigationEnd();
    const url = nav?.urlAfterRedirects ?? (isPlatformBrowser(this.platformId) ? this.relativePathFromLocation() : this.router.url);
    return url.split('?')[0].split('#')[0].startsWith('/admin');
  });

  constructor() {
    if (isPlatformBrowser(this.platformId)) {
      effect(() => {
        this.document.documentElement.lang = this.languageService.lang();
      });
      this.wakeRegistryApi();
    } else {
      this.document.documentElement.lang = this.languageService.lang();
    }

    // Equivalenti-<link> degli header HTTP Link che un hosting statico come GitHub Pages non
    // può inviare: sitemap e llms.txt sono uguali su ogni pagina, quindi impostati una sola
    // volta (percorsi relativi: risolvono correttamente sotto <base href>, quindi anche sotto
    // il sottopercorso di un project site GitHub Pages).
    this.seoLinks.set('link-llms-txt', { rel: 'llms-txt', href: 'llms.txt', type: 'text/plain' });
    this.seoLinks.set('link-llms-full-txt', { rel: 'llms-full-txt', href: 'llms-full.txt', type: 'text/plain' });
    this.seoLinks.set('link-sitemap', { rel: 'sitemap', href: 'sitemap.xml', type: 'application/xml' });

    // Canonical: riflette la rotta corrente, ma per le istanze di prodotto (lotto/seriale,
    // AI 10/21) punta sempre alla pagina prodotto di base — sono varianti della stessa scheda,
    // non contenuti distinti da indicizzare separatamente.
    effect(() => {
      const nav = this.navigationEnd();
      // Se il Router non ha ancora risolto una navigazione: nel browser location.pathname
      // riflette comunque subito e correttamente l'URL reale caricato (a differenza di
      // router.url, popolato solo in modo asincrono); lato server ricade su router.url, già
      // corretto in quel momento perché il prerendering esegue una vera navigazione per rotta.
      const url = nav?.urlAfterRedirects ?? (isPlatformBrowser(this.platformId) ? this.relativePathFromLocation() : this.router.url);
      this.seoLinks.set('link-canonical', { rel: 'canonical', href: this.siteOrigin.value + this.canonicalPath(url) });
    });
  }

  /** Il piano gratuito di Render addormenta registry-api dopo un periodo di inattività (vedi
   * RegistryApiService) — invece di aspettare che sia la sezione /admin a scoprirlo al primo
   * salvataggio, ogni pagina del sito lo risveglia in anticipo appena caricata: da quando esiste
   * questo ping, chiunque arrivi sul sito e poi navighi verso /admin (o verso una pagina
   * prodotto che finisce su registry-api, vedi getPublicByGtin) lo trova già sveglio. Fetch
   * diretta (non RegistryApiService/HttpClient): un ping silenzioso in background, mai un
   * errore o un retry visibile — la vera richiesta che segue userà comunque il proprio retry se
   * il container non fosse ancora pronto. */
  private wakeRegistryApi(): void {
    fetch('/registry-api/health').catch(() => {});
  }

  // A differenza di router.url (già relativo a <base href>), location.pathname è assoluto
  // rispetto alla radice del dominio: sotto un project site GitHub Pages include anche il
  // sottopercorso del repository, che va rimosso per ottenere lo stesso path che produce il
  // Router — altrimenti finirebbe duplicato insieme al prefisso già incluso in siteOrigin.value.
  private relativePathFromLocation(): string {
    const basePath = new URL(this.document.baseURI).pathname;
    const fullPath = this.document.location.pathname;
    return fullPath.startsWith(basePath) ? '/' + fullPath.slice(basePath.length) : fullPath;
  }

  private canonicalPath(url: string): string {
    const path = url.split('?')[0].split('#')[0];
    const productMatch = path.match(/^\/01\/(\d+)/);
    return productMatch ? `/01/${productMatch[1]}` : path;
  }

  toggleMobileNav(): void {
    this.mobileNavOpen.update((v) => !v);
  }

  closeMobileNav(): void {
    this.mobileNavOpen.set(false);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.mobileNavOpen()) this.closeMobileNav();
  }
}
