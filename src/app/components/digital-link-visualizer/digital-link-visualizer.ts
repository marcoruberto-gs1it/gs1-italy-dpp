import { CommonModule } from '@angular/common';
import { Component, computed, inject, input, signal } from '@angular/core';
import { IconComponent, IconName } from '../icon/icon';
import { I18nService } from '../../services/i18n.service';

interface LinkSegment {
  label: string;
  value: string;
  ai: string;
  description: string;
  color: string;
  icon: IconName;
}

@Component({
  selector: 'app-digital-link-visualizer',
  standalone: true,
  imports: [CommonModule, IconComponent],
  templateUrl: './digital-link-visualizer.html',
  styleUrl: './digital-link-visualizer.css',
})
export class DigitalLinkVisualizerComponent {
  link = input.required<string>();
  gtin = input<string | null>(null);
  lot = input<string | null>(null);
  serial = input<string | null>(null);
  expiration = input<string | null>(null);
  sscc = input<string | null>(null);

  protected t = inject(I18nService).t;

  copied = signal(false);

  domain = computed(() => {
    try {
      return new URL(this.link()).origin;
    } catch {
      return this.link().split('/01/')[0] || '';
    }
  });

  segments = computed<LinkSegment[]>(() => {
    const segs: LinkSegment[] = [
      {
        label: this.t('dlv.resolverDomain'),
        value: this.domain(),
        ai: 'host',
        description: this.t('dlv.resolverDesc'),
        color: 'var(--text-tertiary)',
        icon: 'globe',
      },
    ];

    if (this.sscc()) {
      segs.push({
        label: this.t('dlv.sscc'),
        value: this.sscc()!,
        ai: '(00)',
        description: this.t('dlv.ssccDesc'),
        color: 'var(--gs1-forest)',
        icon: 'truck',
      });
    }

    if (this.gtin()) {
      segs.push({
        label: this.t('dlv.gtin'),
        value: this.gtin()!,
        ai: '(01)',
        description: this.t('dlv.gtinDesc'),
        color: 'var(--accent)',
        icon: 'hash',
      });
    }

    if (this.lot()) {
      segs.push({
        label: this.t('dlv.lot'),
        value: this.lot()!,
        ai: '(10)',
        description: this.t('dlv.lotDesc'),
        color: 'var(--gs1-teal)',
        icon: 'box',
      });
    }

    if (this.serial()) {
      segs.push({
        label: this.t('dlv.serial'),
        value: this.serial()!,
        ai: '(21)',
        description: this.t('dlv.serialDesc'),
        color: 'var(--gs1-purple)',
        icon: 'tag',
      });
    }

    if (this.expiration()) {
      segs.push({
        label: this.t('dlv.expiration'),
        value: this.expiration()!,
        ai: '(17)',
        description: this.t('dlv.expirationDesc'),
        color: 'var(--gs1-orange)',
        icon: 'calendar',
      });
    }

    return segs;
  });

  async copyLink(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.link());
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 1800);
    } catch {
      /* clipboard unavailable — ignore */
    }
  }
}
