import { Injectable, signal } from '@angular/core';

/**
 * Porting 1:1 del client React in chat-client/ (App.tsx, types.ts, mocks/credentialProviderProxy.ts):
 * stesso protocollo A2A/UCP verso lo stesso business-agent (POST /api, instradato da Traefik allo
 * stesso container chat-client che fa da proxy — vedi docker-compose.yml), stesse forme dati, stesso
 * mock del provider di pagamento. Qui vive come servizio con stato (signal) invece che useState di
 * React, seguendo la convenzione già in uso in questo progetto (vedi UiStateService).
 */

export enum UcpSender {
  USER = 'user',
  MODEL = 'model',
}

export interface UcpProduct {
  productID: string;
  name: string;
  image: string[];
  brand: { name: string };
  offers: {
    price: string;
    priceCurrency: string;
    availability: string;
  };
  url: string;
  description: string;
  size?: { name: string };
}

export interface UcpCredential {
  type: string;
  token: string;
}

export interface UcpDisplayInfo {
  brand: string;
  last_digits: string;
  expiry_month: number;
  expiry_year: number;
}

export interface UcpPaymentMethod {
  id: string;
  type: string;
  display: UcpDisplayInfo;
}

export interface UcpPaymentInstrument extends UcpPaymentMethod {
  handler_id: string;
  credential: UcpCredential;
  brand?: string;
  last_digits?: string;
}

export interface UcpCheckoutTotal {
  type: string;
  display_text: string;
  amount: number;
}

export interface UcpCheckoutItem {
  id: string;
  item: {
    id: string;
    title: string;
    price: number;
    image_url: string;
  };
  quantity: number;
  totals: UcpCheckoutTotal[];
}

export interface UcpPaymentHandler {
  id: string;
  name: string;
  config?: unknown;
}

export interface UcpPayment {
  handlers: UcpPaymentHandler[];
  selected_instrument_id?: string;
  instruments?: UcpPaymentInstrument[];
}

export interface UcpCheckout {
  id: string;
  line_items: UcpCheckoutItem[];
  currency: string;
  continue_url?: string | null;
  status: string;
  totals: UcpCheckoutTotal[];
  // Annidato (checkout.order.id / .permalink_url) — verificato contro la risposta reale del
  // business-agent. Il types.ts del client React di riferimento dichiara order_id/order_permalink_url
  // piatti, ma il suo stesso componente Checkout.tsx legge checkout.order?.id — un'incoerenza nel
  // sample originale. Qui si segue il payload reale, non la dichiarazione di tipo non allineata.
  order?: { id?: string; permalink_url?: string } | null;
  payment?: UcpPayment;
}

export interface UcpChatMessage {
  id: string;
  sender: UcpSender;
  text: string;
  products?: UcpProduct[];
  isLoading?: boolean;
  paymentMethods?: UcpPaymentMethod[];
  isUserAction?: boolean;
  checkout?: UcpCheckout;
  paymentInstrument?: UcpPaymentInstrument;
}

type RequestPart = { type: 'text'; text: string } | { type: 'data'; data: Record<string, unknown> };

// Stesso URL usato dal client React (VITE_PROFILE_URL nel docker-compose): identifica al
// business-agent il profilo UCP del client, risolvibile solo dentro la rete Docker — non varia
// per client, è lo stesso agent_profile.json indipendentemente da quale UI lo chiama.
const UCP_PROFILE_URL = 'http://chat-client:3000/assistente/profile/agent_profile.json';
const UCP_EXTENSION = 'https://ucp.dev/2026-01-23/specification/overview?v=2026-01-23';

function createMessage(sender: UcpSender, text: string, props: Partial<UcpChatMessage> = {}): UcpChatMessage {
  return { id: crypto.randomUUID(), sender, text, ...props };
}

/**
 * Mock del credential provider — nessuna chiamata di rete reale, stessi dati fittizi (carte,
 * token) del sample React: qui la demo simula il flusso di pagamento, non lo esegue davvero.
 */
class MockCredentialProvider {
  private readonly handlerId = 'example_payment_provider';

  private mockPaymentMethods(): UcpPaymentMethod[] {
    return [
      { id: 'instr_1', type: 'card', display: { brand: 'amex', last_digits: '1111', expiry_month: 12, expiry_year: 2026 } },
      { id: 'instr_2', type: 'card', display: { brand: 'visa', last_digits: '8888', expiry_month: 12, expiry_year: 2026 } },
      { id: 'instr_3', type: 'card', display: { brand: 'mastercard', last_digits: '5555', expiry_month: 12, expiry_year: 2026 } },
    ];
  }

  async getSupportedPaymentMethods(): Promise<UcpPaymentMethod[]> {
    await new Promise((resolve) => setTimeout(resolve, 500));
    return this.mockPaymentMethods();
  }

  async getPaymentToken(methodId: string): Promise<UcpPaymentInstrument | undefined> {
    await new Promise((resolve) => setTimeout(resolve, 500));
    const method = this.mockPaymentMethods().find((m) => m.id === methodId);
    if (!method) return undefined;
    return {
      ...method,
      // Lo schema server CardPaymentInstrument richiede brand e last_digits a livello top-level
      // (oltre a display, usato dalla UI).
      brand: method.display.brand,
      last_digits: method.display.last_digits,
      handler_id: this.handlerId,
      credential: { type: 'token', token: `mock_token_${crypto.randomUUID()}` },
    };
  }
}

@Injectable({ providedIn: 'root' })
export class UcpChatService {
  private credentialProvider = new MockCredentialProvider();
  private contextId: string | null = null;
  private taskId: string | null = null;

  // Niente bolla di benvenuto pre-caricata (a differenza di App.tsx, che parte con initialMessage
  // già nell'array): qui il saluto vive nello stato vuoto della UI (vedi chatbot.html), non come
  // messaggio — altrimenti bolla di benvenuto e stato vuoto finirebbero visualizzati insieme.
  messages = signal<UcpChatMessage[]>([]);
  isLoading = signal(false);

  reset(): void {
    this.contextId = null;
    this.taskId = null;
    this.messages.set([]);
  }

  addToCheckout(productId: string): void {
    const actionPayload = JSON.stringify({ action: 'add_to_checkout', product_id: productId, quantity: 1 });
    void this.sendMessage(actionPayload, { isUserAction: true });
  }

  startPayment(): void {
    const actionPayload = JSON.stringify({ action: 'start_payment' });
    void this.sendMessage(actionPayload, { isUserAction: true });
  }

  /** Il checkout è "pronto per il completamento": recupera i metodi di pagamento mock e li mostra. */
  async completePaymentSelection(checkout: UcpCheckout): Promise<void> {
    const handler = checkout.payment?.handlers?.find((h) => h.id === 'example_payment_provider');
    if (!checkout.payment?.handlers || !handler) {
      this.messages.update((m) => [...m, createMessage(UcpSender.MODEL, "Spiacente, non ho trovato un metodo di pagamento supportato.")]);
      return;
    }
    try {
      const paymentMethods = await this.credentialProvider.getSupportedPaymentMethods();
      this.messages.update((m) => [...m, createMessage(UcpSender.MODEL, '', { paymentMethods })]);
    } catch (err) {
      console.error('Failed to resolve mandate:', err);
      this.messages.update((m) => [...m, createMessage(UcpSender.MODEL, 'Spiacente, non sono riuscito a recuperare i metodi di pagamento.')]);
    }
  }

  async selectPaymentMethod(methodId: string): Promise<void> {
    // Nasconde il selettore rimuovendolo dai messaggi.
    this.messages.update((m) => m.filter((msg) => !msg.paymentMethods));
    this.messages.update((m) => [...m, createMessage(UcpSender.USER, `Metodo di pagamento selezionato: ${methodId}`, { isUserAction: true })]);

    try {
      const paymentInstrument = await this.credentialProvider.getPaymentToken(methodId);
      if (!paymentInstrument?.credential) throw new Error('Failed to retrieve payment credential');
      this.messages.update((m) => [...m, createMessage(UcpSender.MODEL, '', { paymentInstrument })]);
    } catch (err) {
      console.error('Failed to process payment mandate:', err);
      this.messages.update((m) => [...m, createMessage(UcpSender.MODEL, 'Spiacente, non sono riuscito a elaborare il pagamento. Riprova.')]);
    }
  }

  async confirmPayment(paymentInstrument: UcpPaymentInstrument): Promise<void> {
    this.messages.update((m) => [...m.filter((msg) => !msg.paymentInstrument), createMessage(UcpSender.USER, 'Pagamento confermato.', { isUserAction: true })]);

    try {
      const parts: RequestPart[] = [
        { type: 'data', data: { action: 'complete_checkout' } },
        {
          type: 'data',
          data: {
            'a2a.ucp.checkout.payment_data': paymentInstrument,
            'a2a.ucp.checkout.risk_signals': { data: 'some risk data' },
          },
        },
      ];
      await this.sendMessage(parts, { isUserAction: true });
    } catch (err) {
      console.error('Error confirming payment:', err);
      this.messages.update((m) => [...m, createMessage(UcpSender.MODEL, 'Spiacente, si è verificato un problema nella conferma del pagamento.')]);
      this.isLoading.set(false);
    }
  }

  async sendMessage(messageContent: string | RequestPart[], options?: { isUserAction?: boolean }): Promise<void> {
    if (this.isLoading()) return;

    const userMessage = createMessage(
      UcpSender.USER,
      options?.isUserAction ? '<User Action>' : typeof messageContent === 'string' ? messageContent : 'Dati inviati'
    );
    if (userMessage.text) {
      this.messages.update((m) => [...m, userMessage]);
    }
    this.messages.update((m) => [...m, createMessage(UcpSender.MODEL, '', { isLoading: true })]);
    this.isLoading.set(true);

    try {
      const requestParts: RequestPart[] = typeof messageContent === 'string' ? [{ type: 'text', text: messageContent }] : messageContent;

      const message: Record<string, unknown> = {
        role: 'user',
        parts: requestParts,
        messageId: crypto.randomUUID(),
        kind: 'message',
      };
      if (this.contextId) message['contextId'] = this.contextId;
      if (this.taskId) message['taskId'] = this.taskId;

      const response = await fetch('/api', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-A2A-Extensions': UCP_EXTENSION,
          'UCP-Agent': `profile="${UCP_PROFILE_URL}"`,
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: crypto.randomUUID(),
          method: 'message/send',
          params: { message, configuration: { historyLength: 0 } },
        }),
      });

      if (!response.ok) throw new Error(`API request failed with status ${response.status}`);

      const data = await response.json();

      if (data.result?.contextId) this.contextId = data.result.contextId;
      // Stessa logica (e stesso comportamento, incluso il controllo `in` su un array anziché su un
      // insieme di valori) del client React di riferimento: qui si duplica il comportamento
      // osservabile del sample, non solo l'intento.
      if (data.result?.id && data.result?.status?.state in ['working', 'submitted', 'input-required']) {
        this.taskId = data.result.id;
      } else {
        this.taskId = null;
      }

      const combined = createMessage(UcpSender.MODEL, '');
      const responseParts = data.result?.parts || data.result?.status?.message?.parts || [];

      for (const part of responseParts) {
        if (part.text) {
          combined.text += (combined.text ? '\n' : '') + part.text;
        } else if (part.data?.['a2a.product_results']) {
          combined.text += (combined.text ? '\n' : '') + (part.data['a2a.product_results'].content || '');
          combined.products = part.data['a2a.product_results'].results;
        } else if (part.data?.['a2a.ucp.checkout']) {
          combined.checkout = part.data['a2a.ucp.checkout'];
        }
      }

      const hasContent = combined.text || combined.products || combined.checkout;
      if (hasContent) {
        this.messages.update((m) => [...m.slice(0, -1), combined]);
      } else {
        this.messages.update((m) => [...m.slice(0, -1), createMessage(UcpSender.MODEL, 'Spiacente, ho ricevuto una risposta che non sono riuscito a interpretare.')]);
      }
    } catch (err) {
      console.error('Error sending message:', err);
      this.messages.update((m) => [...m.slice(0, -1), createMessage(UcpSender.MODEL, 'Spiacente, qualcosa è andato storto. Riprova.')]);
    } finally {
      this.isLoading.set(false);
    }
  }
}
