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
import type React from "react";
import { useRef, useState } from "react";

interface ChatInputProps {
  onSendMessage: (message: string) => void;
  isLoading: boolean;
}

const TEXTAREA_MAX_HEIGHT = 160;

function SendIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M22 2L11 13" />
      <path d="M22 2l-7 20-4-9-9-4 20-7z" />
    </svg>
  );
}

function ChatInput({ onSendMessage, isLoading }: ChatInputProps) {
  const [inputValue, setInputValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const submit = () => {
    if (!inputValue.trim() || isLoading) return;
    onSendMessage(inputValue.trim());
    setInputValue("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    submit();
  };

  // Invio manda il messaggio, Shift+Invio va a capo: stesso comportamento del sito.
  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  };

  // Il campo cresce con il testo fino a un tetto, poi scorre.
  const autoGrow = (el: HTMLTextAreaElement) => {
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, TEXTAREA_MAX_HEIGHT)}px`;
  };

  return (
    <form className="chat-input-bar" onSubmit={handleSubmit}>
      <div className="chat-input-shell">
        <textarea
          ref={textareaRef}
          className="chat-input"
          value={inputValue}
          rows={1}
          placeholder="Chiedi di un prodotto, di allergeni, materiali, certificazioni…"
          disabled={isLoading}
          onChange={(e) => {
            setInputValue(e.target.value);
            autoGrow(e.target);
          }}
          onKeyDown={handleKeyDown}
        />
        <button
          type="submit"
          className="chat-send-btn"
          disabled={isLoading || !inputValue.trim()}
          aria-label="Invia messaggio"
        >
          <SendIcon />
        </button>
      </div>
    </form>
  );
}

export default ChatInput;
