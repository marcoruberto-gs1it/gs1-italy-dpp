import { CommonModule } from '@angular/common';
import { Component, EventEmitter, HostListener, Input, Output, computed, inject, signal } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { I18nService } from '../../services/i18n.service';
import { highlightJson } from '../../utils/json-highlight';

/** Sidebar che mostra il JSON-LD (GS1 Web Vocabulary) di un prodotto, aperta da un bottone della pagina prodotto. */
@Component({
  selector: 'app-json-ld-drawer',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './json-ld-drawer.html',
  styleUrl: './json-ld-drawer.css',
})
export class JsonLdDrawerComponent {
  private sanitizer = inject(DomSanitizer);
  protected t = inject(I18nService).t;

  private _open = signal(false);
  private _jsonLd = signal<unknown>(null);

  @Input() set open(v: boolean) {
    this._open.set(!!v);
  }
  @Input() set jsonLd(v: unknown) {
    this._jsonLd.set(v);
  }
  @Output() closed = new EventEmitter<void>();

  isOpen = computed(() => this._open());
  copied = signal(false);

  rawJson = computed(() => {
    const data = this._jsonLd();
    return data ? JSON.stringify(data, null, 2) : '';
  });

  highlightedJson = computed<SafeHtml>(() => this.sanitizer.bypassSecurityTrustHtml(highlightJson(this.rawJson())));

  close(): void {
    this.closed.emit();
  }

  onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.close();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.isOpen()) this.close();
  }

  async copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.rawJson());
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 1800);
    } catch {
      /* clipboard non disponibile — ignora */
    }
  }
}
