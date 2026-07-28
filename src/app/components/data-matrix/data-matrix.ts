import { Component, computed, effect, inject, input, signal, ViewEncapsulation } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

/**
 * GS1 DataMatrix (ISO/IEC 16022, ECC200) come data carrier alternativo al QR code: è lo
 * standard GS1 raccomandato per etichette di piccole dimensioni, tipicamente in ambito
 * sanitario/UDI. Nella pratica reale il DataMatrix in sanità codifica gli identificativi
 * GS1 (non un URI): è il software di scansione o un resolver conforme GS1 a convertirli nel
 * Digital Link — a differenza del retail, dove il Digital Link è codificato direttamente nel
 * barcode. Qui usiamo il simbolo "gs1dldatamatrix" di bwip-js per coerenza visiva col QR.
 * Vedi https://www.gs1.org/standards/gs1-digital-link.
 *
 * bwip-js (l'intero motore BWIPP) viene importato dinamicamente: pesa oltre 1MB e questo
 * componente è usato solo dai prodotti del settore sanità, quindi non deve gravare sul
 * bundle principale dell'app.
 */
@Component({
  selector: 'app-data-matrix',
  standalone: true,
  template: `<span class="dm-wrap" [innerHTML]="svgHtml()"></span>`,
  styleUrl: './data-matrix.css',
  encapsulation: ViewEncapsulation.None,
})
export class DataMatrixComponent {
  data = input.required<string>();
  scale = input<number>(3);

  private sanitizer = inject(DomSanitizer);
  private svgMarkup = signal('');

  svgHtml = computed<SafeHtml>(() => this.sanitizer.bypassSecurityTrustHtml(this.svgMarkup()));

  constructor() {
    effect(() => {
      const text = this.data();
      const scale = this.scale();
      if (!text) return;
      import('bwip-js/browser').then((mod) => {
        try {
          const svg = mod.default.toSVG({
            bcid: 'gs1dldatamatrix',
            text,
            scale,
            includetext: false,
            backgroundcolor: 'FFFFFF',
          });
          this.svgMarkup.set(svg);
        } catch {
          this.svgMarkup.set('');
        }
      });
    });
  }
}
