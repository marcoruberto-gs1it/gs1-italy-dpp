/*
 * Copyright 2026 UCP Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import { renderMarkdown } from "@/markdown";
import {
  type ChatMessage,
  type Checkout,
  type PaymentInstrument,
  type Product,
  Sender,
} from "../types";
import CheckoutComponent from "./Checkout";
import PaymentConfirmationComponent from "./PaymentConfirmation";
import PaymentMethodSelector from "./PaymentMethodSelector";
import ProductCard from "./ProductCard";

interface ChatMessageProps {
  message: ChatMessage;
  onAddToCart?: (product: Product) => Promise<void> | void;
  onCheckout?: () => void;
  onSelectPaymentMethod?: (selectedMethod: string) => void;
  onConfirmPayment?: (paymentInstrument: PaymentInstrument) => void;
  onCompletePayment?: (checkout: Checkout) => void;
  isLastCheckout?: boolean;
}

/** Avatar dell'assistente: la scintilla arancione GS1 usata anche sul sito. */
function AgentAvatar() {
  return (
    <span className="chat-avatar" aria-hidden="true">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2.5l2.1 5.9 5.9 2.1-5.9 2.1-2.1 5.9-2.1-5.9-5.9-2.1 5.9-2.1z" />
      </svg>
    </span>
  );
}

function TypingIndicator() {
  return (
    <div className="chat-row">
      <AgentAvatar />
      <div className="chat-bubble chat-bubble--pending">
        <span className="typing-dot" />
        <span className="typing-dot" />
        <span className="typing-dot" />
      </div>
    </div>
  );
}

function ChatMessageComponent({
  message,
  onAddToCart,
  onCheckout,
  onSelectPaymentMethod,
  onConfirmPayment,
  onCompletePayment,
  isLastCheckout,
}: ChatMessageProps) {
  const isUser = message.sender === Sender.USER;

  if (message.isLoading) {
    return <TypingIndicator />;
  }

  // Il messaggio dell'utente resta testo semplice: nessun markdown da interpretare.
  if (isUser) {
    return (
      <div className="chat-row chat-row--user">
        <div className="chat-bubble chat-bubble--user">
          <p className="bubble-text" style={{ whiteSpace: "pre-wrap" }}>
            {message.text}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-row">
      <AgentAvatar />
      <div className="chat-bubble">
        {message.text && (
          // Il modello risponde in Markdown: renderMarkdown neutralizza l'HTML in
          // ingresso e produce solo i tag che decidiamo noi (vedi markdown.ts).
          <div
            className="bubble-text"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(message.text) }}
          />
        )}

        {message.paymentMethods && onSelectPaymentMethod && (
          <PaymentMethodSelector
            paymentMethods={message.paymentMethods}
            onSelect={onSelectPaymentMethod}
          />
        )}

        {message.paymentInstrument && onConfirmPayment && (
          <PaymentConfirmationComponent
            paymentInstrument={message.paymentInstrument}
            onConfirm={() => onConfirmPayment(message.paymentInstrument)}
          />
        )}

        {message.products && message.products.length > 0 && (
          <div className="product-strip">
            {message.products.map((product) => (
              <ProductCard
                key={product.productID}
                product={product}
                onAddToCart={onAddToCart}
              />
            ))}
          </div>
        )}

        {message.checkout && (
          <CheckoutComponent
            checkout={message.checkout}
            onCheckout={isLastCheckout ? onCheckout : undefined}
            onCompletePayment={isLastCheckout ? onCompletePayment : undefined}
          />
        )}
      </div>
    </div>
  );
}

export default ChatMessageComponent;
