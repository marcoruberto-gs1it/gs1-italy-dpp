import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { ApiCall, ApiInspectorService, OutboundCall } from '../../services/api-inspector.service';
import { highlightJson } from '../../utils/json-highlight';

/**
 * Pannello "API" sempre raggiungibile: elenca ogni chiamata fatta dall'app a registry-api, con
 * richiesta e risposta JSON, e — aprendo una chiamata — le chiamate che il SERVER ha fatto a sua
 * volta (Auth0, DPP Registry UE, resolver GS1). Nessun JSON è nascosto: è il modo per vedere
 * davvero cosa viaggia, invece di fidarsi dell'interfaccia.
 */
@Component({
  selector: 'app-api-inspector',
  standalone: true,
  imports: [],
  templateUrl: './api-inspector.html',
  styleUrl: './api-inspector.css',
})
export class ApiInspectorComponent {
  protected inspector = inject(ApiInspectorService);
  private http = inject(HttpClient);
  private sanitizer = inject(DomSanitizer);

  protected copiedKey = signal<string | null>(null);

  protected selected = computed(() => this.inspector.calls().find((c) => c.id === this.inspector.selectedId()) ?? null);

  protected select(call: ApiCall): void {
    this.inspector.selectedId.set(call.id);
    if (call.traceId && call.outbound === null) this.loadOutbound(call);
  }

  private loadOutbound(call: ApiCall): void {
    this.inspector.update(call.id, { outbound: 'loading' });
    this.http.get<{ calls: OutboundCall[] }>(`/registry-api/trace/${call.traceId}`).subscribe({
      next: (trace) => this.inspector.update(call.id, { outbound: trace.calls }),
      error: () => this.inspector.update(call.id, { outbound: 'missing' }),
    });
  }

  /** Ricarica le chiamate del server (una sincronizzazione del resolver parte DOPO la risposta). */
  protected reloadOutbound(call: ApiCall): void {
    this.loadOutbound(call);
  }

  protected outboundList(call: ApiCall): OutboundCall[] {
    return Array.isArray(call.outbound) ? call.outbound : [];
  }

  protected json(value: unknown): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(highlightJson(this.text(value)));
  }

  protected text(value: unknown): string {
    if (value === null || value === undefined || value === '') return '';
    const s = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
    return s.length > 60_000 ? s.slice(0, 60_000) + '\n…[troncato]' : s;
  }

  protected statusClass(status: number | null): string {
    if (status === null) return 'st-err';
    return status < 300 ? 'st-ok' : status < 400 ? 'st-redir' : 'st-err';
  }

  protected shortUrl(url: string): string {
    return url.replace(/^https?:\/\/[^/]+/, '').replace(/^\/registry-api/, '');
  }

  protected async copy(key: string, value: unknown): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.text(value));
      this.copiedKey.set(key);
      setTimeout(() => this.copiedKey.set(null), 1600);
    } catch {
      /* clipboard non disponibile */
    }
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    if (this.inspector.open()) this.inspector.open.set(false);
  }
}
