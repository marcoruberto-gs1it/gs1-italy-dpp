import { CommonModule } from '@angular/common';
import { Component, Input, computed, signal } from '@angular/core';

@Component({
  selector: 'app-star-rating',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './star-rating.html',
  styleUrl: './star-rating.css',
})
export class StarRatingComponent {
  private _value = signal(0);
  private _count = signal<number | null>(null);

  @Input() set value(v: number) {
    this._value.set(v ?? 0);
  }
  @Input() set count(c: number | null | undefined) {
    this._count.set(c ?? null);
  }
  @Input() size: 'sm' | 'md' = 'md';

  stars = computed(() => {
    const v = this._value();
    return Array.from({ length: 5 }, (_, i) => Math.min(1, Math.max(0, v - i)));
  });

  displayValue = computed(() => this._value().toFixed(1));
  displayCount = computed(() => this._count());
}
