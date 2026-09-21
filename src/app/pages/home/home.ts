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

/** Stato "urgenza" (colore + etichetta, vedi regulation.status* in translations.ts) per i
 * quattro momenti della sezione #normativa — calcolato dalla data vera di ognuno rispetto a
 * oggi, non scritto a mano: resta corretto da solo col passare del tempo (un "In preparazione"
 * diventa "In vigore" da sé quando la data passa, senza dover ritoccare il sito). Le date qui
 * sono quelle vere citate nel testo (regulation.item1Date ecc. in translations.ts) — se una
 * cambia, va aggiornata in entrambi i posti. */
const REGULATION_MILESTONES: { key: 1 | 2 | 3 | 4; date: Date }[] = [
  { key: 1, date: new Date('2024-07-18') },
  { key: 2, date: new Date('2026-07-20') },
  { key: 3, date: new Date('2027-02-18') },
  // "Fino al 2029": la coda della roadmap ESPR per gli ultimi settori (vedi sectors.ts) — fine
  // 2029 come riferimento per lo status, non una data ufficiale singola.
  { key: 4, date: new Date('2029-12-31') },
];

type MilestoneStatus = 'done' | 'soon' | 'later';

function milestoneStatus(date: Date, now: Date): MilestoneStatus {
  const monthsAway = (date.getTime() - now.getTime()) / (30.44 * 24 * 3600 * 1000);
  if (monthsAway <= 0) return 'done';
  return monthsAway <= 12 ? 'soon' : 'later';
}

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

  /** Stato di ognuno dei 4 momenti normativi (vedi REGULATION_MILESTONES sopra), come mappa
   * chiave→stato per una lettura diretta nel template (regulationStatus()[1] ecc.). */
  protected regulationStatus = computed<Record<number, MilestoneStatus>>(() => {
    const now = new Date();
    return Object.fromEntries(REGULATION_MILESTONES.map((m) => [m.key, milestoneStatus(m.date, now)]));
  });

  private static readonly STATUS_KEY: Record<MilestoneStatus, string> = { done: 'Done', soon: 'Soon', later: 'Later' };

  protected statusLabel(status: MilestoneStatus): string {
    return this.t(`regulation.status${Home.STATUS_KEY[status]}Label`);
  }

  protected statusHint(status: MilestoneStatus): string {
    return this.t(`regulation.status${Home.STATUS_KEY[status]}Hint`);
  }

  /** Marker + percorso del grafico "roadmap normativa" (sezione #settori in home.html):
   * posiziona ogni settore lungo un asse temporale REALE (`roadmapYear` in sectors.ts, che
   * riflette lo stesso `dateLabel` mostrato per esteso sulla card) — non un layout decorativo.
   * viewBox fisso 0 0 1000 170, coordinate già in unità SVG (nessun calcolo nel template).
   * Niente etichette incollate ai punti (vedi .roadmap-legend sotto nel template): con 9
   * settori, alcuni a poche settimane di distanza, si sovrapporrebbero. */
  protected roadmapChart = computed(() => {
    const xMin = 2026.6;
    const xMax = 2029.7;
    const toX = (year: number) => 40 + ((year - xMin) / (xMax - xMin)) * 920;
    const sorted = [...this.sectors()].sort((a, b) => a.roadmapYear - b.roadmapYear);
    const points = sorted.map((sector) => {
      const t = (sector.roadmapYear - xMin) / (xMax - xMin);
      return { sector, x: toX(sector.roadmapYear), y: 130 - t * 110 };
    });
    const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
    // "OGGI": stessa trasformazione data→coordinata SVG dei punti settore, sulla data vera
    // di oggi invece di un roadmapYear fisso — resta corretta da sola col passare del tempo,
    // niente da aggiornare a mano. Nascosto se cade fuori da [xMin, xMax] (asse tarato sulla
    // finestra dei settori, non pensato per estendersi al passato/futuro remoto).
    const now = new Date();
    const todayYear = now.getFullYear() + (now.getTime() - new Date(now.getFullYear(), 0, 1).getTime()) / (365.25 * 24 * 3600 * 1000);
    const todayX = todayYear >= xMin && todayYear <= xMax ? toX(todayYear) : null;
    return { points, path, todayX };
  });

  protected activeIndex = signal(0);
  protected activeCard = computed(() => this.sectors()[this.activeIndex()]);
  protected autoplay = signal(true);
  protected qrValue = computed(() => `${this.siteOrigin.value}/01/${this.activeCard().exampleGtin}`);
  /** Stessa URL del QR, senza protocollo — per la barra indirizzi decorativa sopra il
   * carosello di anteprima (vedi .preview-chrome in home.css): i browser reali nascondono
   * "https://" di default, replichiamo la stessa convenzione invece di mostrarlo per intero. */
  protected previewUrlDisplay = computed(() => this.qrValue().replace(/^https?:\/\//, ''));
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
