import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Component, ElementRef, OnInit, PLATFORM_ID, ViewChild, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { I18nService } from '../../services/i18n.service';
import {
  UcpCheckout,
  UcpChatMessage,
  UcpPaymentInstrument,
  UcpProduct,
  UcpSender,
  UcpChatService,
} from '../../services/ucp-chat.service';

const EXAMPLE_PROMPT_KEYS = ['chatbot.example1', 'chatbot.example2', 'chatbot.example3', 'chatbot.example4'] as const;
const TEXTAREA_MAX_HEIGHT = 160;
const VISIBLE_LINE_ITEMS = 5;

@Component({
  selector: 'app-chatbot',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './chatbot.html',
  styleUrl: './chatbot.css',
})
export class ChatbotComponent implements OnInit {
  private platformId = inject(PLATFORM_ID);
  private titleService = inject(Title);
  protected chat = inject(UcpChatService);
  protected t = inject(I18nService).t;
  protected Sender = UcpSender;

  @ViewChild('scrollContainer') private scrollContainer?: ElementRef<HTMLElement>;
  @ViewChild('taRef') private textareaRef?: ElementRef<HTMLTextAreaElement>;

  protected readonly examplePromptKeys = EXAMPLE_PROMPT_KEYS;
  protected readonly visibleLineItems = VISIBLE_LINE_ITEMS;

  draft = signal('');
  expandedCheckouts = signal<ReadonlySet<string>>(new Set());
  selectedPaymentMethodId = signal<string | null>(null);
  confirmingMessageId = signal<string | null>(null);

  lastCheckoutIndex = computed(() => {
    const msgs = this.chat.messages();
    let idx = -1;
    msgs.forEach((m, i) => {
      if (m.checkout) idx = i;
    });
    return idx;
  });

  ngOnInit(): void {
    this.titleService.setTitle(this.t('chatbot.pageTitle'));
  }

  setDraft(value: string): void {
    this.draft.set(value);
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void this.send();
    }
  }

  autoGrow(el: HTMLTextAreaElement): void {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, TEXTAREA_MAX_HEIGHT) + 'px';
  }

  useExample(key: string): void {
    this.draft.set(this.t(key));
    void this.send();
  }

  async send(): Promise<void> {
    const text = this.draft().trim();
    if (!text || this.chat.isLoading()) return;
    this.draft.set('');
    this.resetTextareaHeight();
    await this.chat.sendMessage(text);
    this.scrollToBottom();
  }

  clearChat(): void {
    this.chat.reset();
  }

  addToCheckout(product: UcpProduct): void {
    this.chat.addToCheckout(product.productID);
    this.scrollToBottom();
  }

  startPayment(): void {
    this.chat.startPayment();
    this.scrollToBottom();
  }

  completePaymentSelection(checkout: UcpCheckout): void {
    void this.chat.completePaymentSelection(checkout).then(() => this.scrollToBottom());
  }

  selectPaymentMethod(): void {
    const methodId = this.selectedPaymentMethodId();
    if (!methodId) return;
    this.selectedPaymentMethodId.set(null);
    void this.chat.selectPaymentMethod(methodId).then(() => this.scrollToBottom());
  }

  confirmPayment(instrument: UcpPaymentInstrument, messageId: string): void {
    if (this.confirmingMessageId() === messageId) return;
    this.confirmingMessageId.set(messageId);
    void this.chat.confirmPayment(instrument).finally(() => {
      this.confirmingMessageId.set(null);
      this.scrollToBottom();
    });
  }

  isAvailable(product: UcpProduct): boolean {
    return product.offers.availability.includes('InStock');
  }

  formatPrice(price: string, currency: string): string {
    return `${currency === 'EUR' ? '€' : '$'}${price}`;
  }

  formatCurrency(amountCents: number, currency: string): string {
    const symbol = currency === 'EUR' ? '€' : '$';
    return `${symbol}${(amountCents / 100).toFixed(2)}`;
  }

  checkoutTotal(checkout: UcpCheckout, type: string) {
    return checkout.totals.find((t) => t.type === type);
  }

  itemTotal(item: UcpCheckout['line_items'][number]) {
    return item.totals.find((t) => t.type === 'total');
  }

  isCheckoutExpanded(checkoutId: string): boolean {
    return this.expandedCheckouts().has(checkoutId);
  }

  toggleCheckoutExpanded(checkoutId: string): void {
    this.expandedCheckouts.update((set) => {
      const next = new Set(set);
      if (next.has(checkoutId)) next.delete(checkoutId);
      else next.add(checkoutId);
      return next;
    });
  }

  lineItemsToShow(checkout: UcpCheckout) {
    return this.isCheckoutExpanded(checkout.id) ? checkout.line_items : checkout.line_items.slice(0, VISIBLE_LINE_ITEMS);
  }

  trackByMessageId(_index: number, message: UcpChatMessage): string {
    return message.id;
  }

  private resetTextareaHeight(): void {
    const el = this.textareaRef?.nativeElement;
    if (el) el.style.height = 'auto';
  }

  private scrollToBottom(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    setTimeout(() => {
      const el = this.scrollContainer?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    }, 30);
  }
}
