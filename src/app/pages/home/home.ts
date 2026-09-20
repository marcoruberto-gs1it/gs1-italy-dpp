import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Component, OnDestroy, PLATFORM_ID, computed, effect, inject, signal } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { QRCodeComponent } from 'angularx-qrcode';
import { IconComponent } from '../../components/icon/icon';
import { ScrollRevealDirective } from '../../directives/scroll-reveal';
import { Sector, SECTORS, localizeSector } from '../../data/sectors';
import { I18nService } from '../../services/i18n.service';
import { LanguageService } from '../../services/language.service';
import { SiteOriginService } from '../../services/site-origin.service';
import { StructuredDataService } from '../../services/structured-data.service';
import { setSocialMeta } from '../../utils/social-meta';

const AUTOPLAY_INTERVAL_MS = 5000;

@Component({
  selector: 'app-home',
  imports: [CommonModule, IconComponent, QRCodeComponent, ScrollRevealDirective],
  templateUrl: './home.html',
  styleUrl: './home.css',
})
export class Home implements OnDestroy {
  protected t = inject(I18nService).t;
  private languageService = inject(LanguageService);
  private titleService = inject(Title);
  private metaService = inject(Meta);
  protected siteOrigin = inject(SiteOriginService);
  private structuredData = inject(StructuredDataService);
  private platformId = inject(PLATFORM_ID);
  /** angularx-qrcode manipola direttamente il DOM (canvas/SVG): non è compatibile col
   * rendering lato server, quindi il codice QR reale compare solo dopo l'idratazione. */
  protected isBrowser = isPlatformBrowser(this.platformId);

  /** I settori target del progetto DPP, nella lingua corrente — anche fonte delle card del
   * carosello di anteprima nella hero (un settore = una card), niente dati duplicati. */
  sectors = computed<Sector[]>(() => SECTORS.map((s) => localizeSector(s, this.languageService.lang())));

  protected activeIndex = signal(0);
  protected activeCard = computed(() => this.sectors()[this.activeIndex()]);
  protected autoplay = signal(true);
  protected qrValue = computed(() => `${this.siteOrigin.value}/01/${this.activeCard().exampleGtin}`);
  /** Element string GS1 mostrato nella card — AI (01) più l'eventuale AI aggiuntivo (es. lotto). */
  protected elementString = computed(() => {
    const card = this.activeCard();
    return card.exampleExtraElement ? `(01) ${card.exampleGtin}\n${card.exampleExtraElement}` : `(01) ${card.exampleGtin}`;
  });

  private autoplayTimer?: ReturnType<typeof setInterval>;

  // Identità del sito come schema:WebSite — non presente altrove, e la home è l'unica pagina
  // dove ha senso pubblicarla una volta sola (le pagine prodotto/brand hanno già il proprio
  // schema:Product/Organization più specifico).
  websiteJsonLd = computed(() => ({
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: this.t('hero.pageTitle'),
    url: this.siteOrigin.value,
  }));

  constructor() {
    // effect, non chiamata diretta nel costruttore: this.t() legge il segnale della lingua
    // corrente, quindi titolo/meta restano corretti anche se l'utente cambia lingua restando
    // sulla home, invece di restare quelli della lingua attiva al primo caricamento.
    effect(() => {
      const title = this.t('hero.pageTitle');
      const description = this.t('hero.subtitle');
      this.titleService.setTitle(title);
      this.metaService.updateTag({ name: 'description', content: description });
      setSocialMeta(this.metaService, { title, description, url: this.siteOrigin.value });
    });

    effect(() => {
      this.structuredData.apply('website-jsonld', this.websiteJsonLd());
    });

    // Il carosello avanza da solo solo lato browser: durante il prerendering (Node, nessun
    // event loop persistente da servire) un setInterval non serve e non andrebbe mai ripulito.
    if (isPlatformBrowser(this.platformId)) {
      this.autoplayTimer = setInterval(() => {
        if (this.autoplay()) this.next();
      }, AUTOPLAY_INTERVAL_MS);
    }
  }

  next(): void {
    this.activeIndex.update((i) => (i + 1) % this.sectors().length);
  }

  prev(): void {
    this.activeIndex.update((i) => (i - 1 + this.sectors().length) % this.sectors().length);
  }

  toggleAutoplay(): void {
    this.autoplay.update((v) => !v);
  }

  ngOnDestroy(): void {
    this.structuredData.remove('website-jsonld');
    if (this.autoplayTimer) clearInterval(this.autoplayTimer);
  }
}
