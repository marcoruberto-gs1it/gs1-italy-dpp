import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Component, ElementRef, OnInit, PLATFORM_ID, ViewChild, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { I18nService } from '../../services/i18n.service';
import { ChatMessage, ChatService, MatchedField } from '../../services/chat.service';
import { getVocabularies, isAiReady } from '../../services/product.service';
import { onImageError } from '../../utils/image-fallback';

const EXAMPLE_PROMPT_KEYS = ['chat.example1', 'chat.example2', 'chat.example3', 'chat.example4'] as const;
const TEXTAREA_MAX_HEIGHT = 160;

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './chat.html',
  styleUrl: './chat.css',
})
export class ChatComponent implements OnInit {
  private platformId = inject(PLATFORM_ID);
  private titleService = inject(Title);
  private chatService = inject(ChatService);
  protected t = inject(I18nService).t;
  protected onImageError = onImageError;
  protected isAiReady = isAiReady;
  protected getVocabularies = getVocabularies;

  @ViewChild('scrollContainer') private scrollContainer?: ElementRef<HTMLElement>;
  @ViewChild('taRef') private textareaRef?: ElementRef<HTMLTextAreaElement>;

  protected readonly examplePromptKeys = EXAMPLE_PROMPT_KEYS;

  messages = signal<ChatMessage[]>([]);
  draft = signal('');
  sending = signal(false);

  ngOnInit(): void {
    this.titleService.setTitle(this.t('chat.pageTitle'));
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

  matchedFieldsLabel(fields: MatchedField[]): string {
    return fields.map((f) => this.t('chat.field.' + f)).join(', ');
  }

  async send(): Promise<void> {
    const text = this.draft().trim();
    if (!text || this.sending()) return;

    const userMessage: ChatMessage = { id: this.nextId(), role: 'user', content: text };
    this.messages.update((m) => [...m, userMessage]);
    this.draft.set('');
    this.resetTextareaHeight();
    this.sending.set(true);
    // Porta la domanda appena inviata in cima all'area visibile: la risposta si legge così dal
    // suo inizio, invece di ritrovarsi già in fondo a una risposta lunga (con più schede prodotto).
    this.scrollToMessage(userMessage.id);

    try {
      const reply = await this.chatService.sendMessage(text, this.messages());
      this.messages.update((m) => [...m, reply]);
    } finally {
      this.sending.set(false);
    }
  }

  clearChat(): void {
    this.messages.set([]);
  }

  private resetTextareaHeight(): void {
    const el = this.textareaRef?.nativeElement;
    if (el) el.style.height = 'auto';
  }

  private nextId(): string {
    return isPlatformBrowser(this.platformId) ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  }

  private scrollToMessage(id: string): void {
    if (!isPlatformBrowser(this.platformId)) return;
    setTimeout(() => {
      const row = this.scrollContainer?.nativeElement.querySelector(`[data-msg-id="${id}"]`);
      row?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 30);
  }
}
