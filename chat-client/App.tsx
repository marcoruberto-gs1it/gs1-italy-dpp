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
import { useEffect, useRef, useState } from "react";
import ChatInput from "./components/ChatInput";
import ChatMessageComponent from "./components/ChatMessage";
import Header from "./components/Header";
import { appConfig } from "./config";
import { CredentialProviderProxy } from "./mocks/credentialProviderProxy";

import {
  type ChatMessage,
  type PaymentInstrument,
  type Product,
  Sender,
  type Checkout,
  type PaymentHandler,
} from "./types";

type RequestPart =
  | { type: "text"; text: string }
  | { type: "data"; data: Record<string, unknown> };

function createChatMessage(
  sender: Sender,
  text: string,
  props: Partial<ChatMessage> = {}
): ChatMessage {
  return {
    id: crypto.randomUUID(),
    sender,
    text,
    ...props,
  };
}

const initialMessage: ChatMessage = createChatMessage(
  Sender.MODEL,
  appConfig.defaultMessage,
  { id: "initial" }
);

/**
 * Domande di partenza. Non sono esempi generici: ognuna è scelta perché la risposta
 * **non è deducibile** senza il dato strutturato — né dalla conoscenza generale del
 * modello, né dal testo commerciale della scheda. È lì che si vede la differenza fra un
 * catalogo che pubblica GS1 Web Vocabulary e uno che non lo fa.
 *
 * Tutte e quattro verificate contro il catalogo reale:
 *  - glutine        → 10 prodotti dichiarano FREE_FROM; distingue "non contiene" da "non lo dice"
 *  - guanti         → tre prodotti, uno solo con scheda: il contrasto sta in una sola risposta
 *  - mascherine     → numero di certificato e organismo notificato: non si indovinano
 *  - pollo/salmone  → confronto fra due schede, con la base di riferimento dichiarata
 *  - magazzino      → gerarchia di imballo (pallet, cartoni) e calcolo deterministico
 */
const EXAMPLE_PROMPTS = [
  "Quali alimenti dichiarano l'assenza di glutine?",
  "Che guanti avete e di che materiale sono esattamente?",
  "Le mascherine chirurgiche che certificazioni hanno e chi le ha rilasciate?",
  "Confronta pollo e salmone dal punto di vista nutrizionale",
  "Quanti pallet di confettura di fragole entrano in un magazzino di 12 x 8 metri alto 3?",
];

/**
 * An example A2A chat client that demonstrates consuming a business's A2A Agent with UCP Extension.
 * Only for demo purposes, not intended for production use.
 */
function App() {
  const [user_email, _setUserEmail] = useState<string | null>(
    "foo@example.com"
  );
  const [messages, setMessages] = useState<ChatMessage[]>([initialMessage]);
  const [isLoading, setIsLoading] = useState(false);
  const [contextId, setContextId] = useState<string | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);
  const credentialProvider = useRef(new CredentialProviderProxy());
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // Scroll to the bottom when new messages are added
  // biome-ignore lint/correctness/useExhaustiveDependencies: Scroll when messages change
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop =
        chatContainerRef.current.scrollHeight;
    }
  }, [messages]);

  const handleAddToCheckout = (productToAdd: Product) => {
    const actionPayload = JSON.stringify({
      action: "add_to_checkout",
      product_id: productToAdd.productID,
      quantity: 1,
    });
    handleSendMessage(actionPayload, { isUserAction: true });
  };

  const handleStartPayment = () => {
    const actionPayload = JSON.stringify({ action: "start_payment" });
    handleSendMessage(actionPayload, {
      isUserAction: true,
    });
  };

  const handlePaymentMethodSelection = async (checkout: Checkout) => {
    if (!checkout || !checkout.payment || !checkout.payment.handlers) {
      const errorMessage = createChatMessage(
        Sender.MODEL,
        "Sorry, I couldn't retrieve payment methods."
      );
      setMessages((prev) => [...prev, errorMessage]);
      return;
    }

    //find the handler with id "example_payment_provider"
    const handler = checkout.payment.handlers.find(
      (handler: PaymentHandler) => handler.id === "example_payment_provider"
    );
    if (!handler) {
      const errorMessage = createChatMessage(
        Sender.MODEL,
        "Sorry, I couldn't find the supported payment handler."
      );
      setMessages((prev) => [...prev, errorMessage]);
      return;
    }

    try {
      const paymentResponse =
        await credentialProvider.current.getSupportedPaymentMethods(
          user_email,
          handler.config
        );
      const paymentMethods = paymentResponse.payment_method_aliases;

      const paymentSelectorMessage = createChatMessage(Sender.MODEL, "", {
        paymentMethods,
      });
      setMessages((prev) => [...prev, paymentSelectorMessage]);
    } catch (error) {
      console.error("Failed to resolve mandate:", error);
      const errorMessage = createChatMessage(
        Sender.MODEL,
        "Sorry, I couldn't retrieve payment methods."
      );
      setMessages((prev) => [...prev, errorMessage]);
    }
  };

  const handlePaymentMethodSelected = async (selectedMethod: string) => {
    // Hide the payment selector by removing it from the messages
    setMessages((prev) => prev.filter((msg) => !msg.paymentMethods));

    // Add a temporary user message
    const userActionMessage = createChatMessage(
      Sender.USER,
      `User selected payment method: ${selectedMethod}`,
      { isUserAction: true }
    );
    setMessages((prev) => [...prev, userActionMessage]);

    try {
      if (!user_email) {
        throw new Error("User email is not set.");
      }

      const paymentInstrument =
        await credentialProvider.current.getPaymentToken(
          user_email,
          selectedMethod
        );

      if (!paymentInstrument || !paymentInstrument.credential) {
        throw new Error("Failed to retrieve payment credential");
      }

      const paymentInstrumentMessage = createChatMessage(Sender.MODEL, "", {
        paymentInstrument,
      });
      setMessages((prev) => [...prev, paymentInstrumentMessage]);
    } catch (error) {
      console.error("Failed to process payment mandate:", error);
      const errorMessage = createChatMessage(
        Sender.MODEL,
        "Sorry, I couldn't process the payment. Please try again."
      );
      setMessages((prev) => [...prev, errorMessage]);
    }
  };

  const handleConfirmPayment = async (paymentInstrument: PaymentInstrument) => {
    // Hide the payment confirmation component
    const userActionMessage = createChatMessage(
      Sender.USER,
      `User confirmed payment.`,
      { isUserAction: true }
    );
    // Let handleSendMessage manage the loading indicator
    setMessages((prev) => [
      ...prev.filter((msg) => !msg.paymentInstrument),
      userActionMessage,
    ]);

    try {
      const parts: RequestPart[] = [
        { type: "data", data: { action: "complete_checkout" } },
        {
          type: "data",
          data: {
            "a2a.ucp.checkout.payment_data": paymentInstrument,
            "a2a.ucp.checkout.risk_signals": { data: "some risk data" },
          },
        },
      ];

      await handleSendMessage(parts, {
        isUserAction: true,
      });
    } catch (error) {
      console.error("Error confirming payment:", error);
      const errorMessage = createChatMessage(
        Sender.MODEL,
        "Sorry, there was an issue confirming your payment."
      );
      // If handleSendMessage wasn't called, we might need to manually update state
      // In this case, we remove the loading indicator that handleSendMessage would have added
      setMessages((prev) => [...prev.slice(0, -1), errorMessage]); // This assumes handleSendMessage added a loader
      setIsLoading(false); // Ensure loading is stopped on authorization error
    }
  };

  const handleSendMessage = async (
    messageContent: string | RequestPart[],
    options?: { isUserAction?: boolean; headers?: Record<string, string> }
  ) => {
    if (isLoading) return;

    const userMessage = createChatMessage(
      Sender.USER,
      options?.isUserAction
        ? "<User Action>"
        : typeof messageContent === "string"
          ? messageContent
          : "Sent complex data"
    );
    if (userMessage.text) {
      // Only add if there's text
      setMessages((prev) => [...prev, userMessage]);
    }
    setMessages((prev) => [
      ...prev,
      createChatMessage(Sender.MODEL, "", { isLoading: true }),
    ]);
    setIsLoading(true);

    try {
      const requestParts =
        typeof messageContent === "string"
          ? [{ type: "text", text: messageContent }]
          : messageContent;

      const requestParams: {
        message: {
          role: string;
          parts: RequestPart[];
          messageId: string;
          kind: string;
          contextId?: string;
          taskId?: string;
        };
        configuration: {
          historyLength: number;
        };
      } = {
        message: {
          role: "user",
          parts: requestParts,
          messageId: crypto.randomUUID(),
          kind: "message",
        },
        configuration: {
          historyLength: 0,
        },
      };

      if (contextId) {
        requestParams.message.contextId = contextId;
      }
      if (taskId) {
        requestParams.message.taskId = taskId;
      }

      const defaultHeaders = {
        "Content-Type": "application/json",
        "X-A2A-Extensions":
          "https://ucp.dev/2026-01-23/specification/overview?v=2026-01-23",
        "UCP-Agent":
          `profile="${import.meta.env.VITE_PROFILE_URL ?? "http://localhost:3000/profile/agent_profile.json"}"`,
      };

      const response = await fetch("/api", {
        method: "POST",
        headers: { ...defaultHeaders, ...options?.headers },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: crypto.randomUUID(),
          method: "message/send",
          params: requestParams,
        }),
      });

      if (!response.ok || !response.body) {
        throw new Error(`API request failed with status ${response.status}`);
      }

      const data = await response.json();

      if (data.result?.contextId) {
        setContextId(data.result.contextId);
      }
      if (
        data.result?.id &&
        data.result?.status?.state in ["working", "submitted", "input-required"]
      ) {
        setTaskId(data.result.id);
      } else {
        setTaskId(undefined);
      }

      const combinedBotMessage = createChatMessage(Sender.MODEL, "");

      const responseParts =
        data.result?.parts || data.result?.status?.message?.parts || [];

      for (const part of responseParts) {
        if (part.text) {
          combinedBotMessage.text +=
            (combinedBotMessage.text ? "\n" : "") + part.text;
        } else {
          // Le due chiavi tipizzate possono arrivare nella STESSA parte dati: succede
          // quando in un turno l'agente aggiunge al carrello e poi rilancia una ricerca
          // per allineare le schede mostrate al testo. Con una catena else-if il
          // checkout veniva scartato ogni volta che c'erano anche dei prodotti.
          if (part.data?.["a2a.product_results"]) {
            combinedBotMessage.text +=
              (combinedBotMessage.text ? "\n" : "") +
              (part.data["a2a.product_results"].content || "");
            combinedBotMessage.products =
              part.data["a2a.product_results"].results;
          }
          if (part.data?.["a2a.ucp.checkout"]) {
            combinedBotMessage.checkout = part.data["a2a.ucp.checkout"];
          }
        }
      }

      const hasContent =
        combinedBotMessage.text ||
        combinedBotMessage.products ||
        combinedBotMessage.checkout;

      if (hasContent) {
        setMessages((prev) => [...prev.slice(0, -1), combinedBotMessage]);
      } else {
        setMessages((prev) => [
          ...prev.slice(0, -1),
          createChatMessage(
            Sender.MODEL,
            "Sorry, I received a response I couldn't understand."
          ),
        ]);
      }
    } catch (error) {
      console.error("Error sending message:", error);
      const errorMessage = createChatMessage(
        Sender.MODEL,
        "Sorry, something went wrong. Please try again."
      );
      // Replace the placeholder with the error message
      setMessages((prev) => [...prev.slice(0, -1), errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const lastCheckoutIndex = messages.map((m) => !!m.checkout).lastIndexOf(true);

  return (
    <div className="chat-viewport">
      <Header />

      {/* Struttura e classi della pagina di chat del catalogo (chat.css): stesso
          contenitore, stessa shell, stessa griglia di messaggi. */}
      <div className="chat-page">
        <nav className="breadcrumbs" aria-label="breadcrumb">
          <ol>
            <li>
              <a href="/">Home</a>
            </li>
            <li className="separator">/</li>
            <li className="current" aria-current="page">
              Assistente AI
            </li>
          </ol>
        </nav>

        <div className="chat-titlebar">
          <h1>{appConfig.titleText}</h1>
        </div>

        <div className="chat-shell">
          <main ref={chatContainerRef} className="chat-scroll">
            {messages.map((msg, index) => (
          <ChatMessageComponent
            key={msg.id}
            message={msg}
            onAddToCart={handleAddToCheckout}
            onCheckout={
              msg.checkout?.status !== "ready_for_complete"
                ? handleStartPayment
                : undefined
            }
            onSelectPaymentMethod={handlePaymentMethodSelected}
            onConfirmPayment={handleConfirmPayment}
            onCompletePayment={
              msg.checkout?.status === "ready_for_complete"
                ? handlePaymentMethodSelection
                : undefined
            }
                isLastCheckout={index === lastCheckoutIndex}
              ></ChatMessageComponent>
            ))}

            {/* Suggerimenti di partenza: finché la conversazione è al primo messaggio,
                mostrano cosa questo assistente sa fare che una ricerca non sa fare. */}
            {messages.length === 1 && (
              <div className="example-chips">
                {EXAMPLE_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    className="example-chip"
                    onClick={() => handleSendMessage(prompt)}
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            )}
          </main>

          <ChatInput onSendMessage={handleSendMessage} isLoading={isLoading} />
        </div>
      </div>
    </div>
  );
}

export default App;
