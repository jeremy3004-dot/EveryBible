'use client';

import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react';

import { StatusPill } from './StatusPill';

interface ChatMessage {
  content: string;
  id: string;
  role: 'assistant' | 'user';
}

interface ChatAvailability {
  available: boolean;
  model: string;
  reason?: string | null;
}

const CHAT_STORAGE_KEY = 'everybible.admin.operator-helper.chat.v1';
const INITIAL_MESSAGES: ChatMessage[] = [
  {
    content:
      'Ask me about admin health, audit trail, translations, or what to look at next. I can ground the answer in the live EveryBible admin data.',
    id: 'welcome',
    role: 'assistant',
  },
];

function createMessageId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }

  return `msg-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function OperatorGlyph() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="7.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="12" cy="12" r="2.5" fill="currentColor" />
      <path
        d="M4.5 12h2.1M17.4 12h2.1M12 4.5v2.1M12 17.4v2.1"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.5"
      />
    </svg>
  );
}

function ChevronGlyph() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20">
      <path
        d="m5.5 7.5 4.5 5 4.5-5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

export function OperatorLauncher() {
  const [isOpen, setIsOpen] = useState(false);
  const [availability, setAvailability] = useState<ChatAvailability | null>(null);
  const [chatError, setChatError] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_MESSAGES);
  const [hasHydrated, setHasHydrated] = useState(false);
  const launcherId = useId();
  const composerId = useId();
  const launcherRef = useRef<HTMLDivElement>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesRef = useRef<ChatMessage[]>(INITIAL_MESSAGES);

  useEffect(() => {
    try {
      const storedMessages = window.localStorage.getItem(CHAT_STORAGE_KEY);

      if (storedMessages) {
        const parsed = JSON.parse(storedMessages) as unknown;
        if (Array.isArray(parsed)) {
          const normalized = parsed
            .flatMap((message) => {
              if (!message || typeof message !== 'object') {
                return [];
              }

              const record = message as Record<string, unknown>;
              if (record.role !== 'assistant' && record.role !== 'user') {
                return [];
              }

              if (typeof record.content !== 'string' || record.content.trim().length === 0) {
                return [];
              }

              return [
                {
                  content: record.content.trim(),
                  id: typeof record.id === 'string' && record.id ? record.id : createMessageId(),
                  role: record.role as ChatMessage['role'],
                } satisfies ChatMessage,
              ];
            })
            .slice(-20);

          if (normalized.length > 0) {
            messagesRef.current = normalized;
            setMessages(normalized);
          }
        }
      }
    } catch {
      try {
        window.localStorage.removeItem(CHAT_STORAGE_KEY);
      } catch {
        // Ignore storage failures and fall back to the in-memory conversation.
      }
    }

    setHasHydrated(true);

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) {
        return;
      }

      if (!launcherRef.current?.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('pointerdown', handlePointerDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, []);

  useEffect(() => {
    if (!hasHydrated) {
      return;
    }

    try {
      window.localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages));
    } catch {
      // Ignore storage failures and keep the in-memory conversation only.
    }
    messagesRef.current = messages;

    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }, [hasHydrated, messages]);

  useEffect(() => {
    if (availability === null) {
      void refreshAvailability();
    }
  }, [availability]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    inputRef.current?.focus();
  }, [isOpen]);

  const readyState = availability?.available ?? false;
  const statusLabel =
    availability === null
      ? 'Checking AI'
      : readyState
        ? 'AI ready'
        : availability.reason === 'unauthorized'
          ? 'Sign in'
          : 'AI offline';
  const statusTone: 'default' | 'success' | 'warning' =
    availability === null ? 'default' : readyState ? 'success' : 'warning';
  const canSend = readyState && inputValue.trim().length > 0 && !isSending;

  async function refreshAvailability() {
    try {
      const response = await fetch('/api/operator/chat', { cache: 'no-store' });
      const payload = (await response.json().catch(() => null)) as
        | ChatAvailability
        | { error?: string }
        | null;

      if (response.status === 401) {
        setAvailability({
          available: false,
          model: 'gpt-5.4-mini',
          reason: 'unauthorized',
        });
        setChatError(null);
        return;
      }

      if (!response.ok) {
        throw new Error(
          (payload && 'error' in payload && payload.error) || 'Unable to load AI helper status.'
        );
      }

      if (payload && typeof payload === 'object' && 'available' in payload) {
        setAvailability({
          available: Boolean(payload.available),
          model: typeof payload.model === 'string' ? payload.model : 'gpt-5.4-mini',
          reason: 'reason' in payload ? payload.reason ?? null : null,
        });
        setChatError(null);
      }
    } catch (error) {
      setAvailability({
        available: false,
        model: 'gpt-5.4-mini',
        reason: 'status_check_failed',
      });
      setChatError(error instanceof Error ? error.message : 'Unable to load AI helper status.');
    }
  }

  function appendMessage(message: ChatMessage) {
    setMessages((current) => {
      const next = [...current, message].slice(-20);
      messagesRef.current = next;
      return next;
    });
  }

  async function submitPrompt(prompt: string) {
    const content = prompt.trim();
    if (!content || isSending || !readyState) {
      return;
    }

    setChatError(null);
    setInputValue('');

    const userMessage: ChatMessage = {
      content,
      id: createMessageId(),
      role: 'user',
    };

    const conversation = [...messagesRef.current, userMessage];
    appendMessage(userMessage);
    setIsSending(true);

    try {
      const response = await fetch('/api/operator/chat', {
        body: JSON.stringify({
          messages: conversation.map(({ content: messageContent, role }) => ({
            content: messageContent,
            role,
          })),
        }),
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'POST',
      });

      const payload = (await response.json().catch(() => null)) as
        | { error?: string; reply?: string }
        | null;

      if (!response.ok) {
        throw new Error(
          payload?.error ?? 'The AI helper could not answer just now. Please try again.'
        );
      }

      if (typeof payload?.reply !== 'string' || payload.reply.trim().length === 0) {
        throw new Error('The AI helper returned an empty response.');
      }

      appendMessage({
        content: payload.reply.trim(),
        id: createMessageId(),
        role: 'assistant',
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'The AI helper could not answer right now.';
      setChatError(message);
      appendMessage({
        content: message,
        id: createMessageId(),
        role: 'assistant',
      });
    } finally {
      setIsSending(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await submitPrompt(inputValue);
  }

  function handleComposerKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter' || event.shiftKey) {
      return;
    }

    event.preventDefault();
    void submitPrompt(inputValue);
  }

  function resetConversation() {
    messagesRef.current = INITIAL_MESSAGES;
    setMessages(INITIAL_MESSAGES);
    setInputValue('');
    setChatError(null);
  }

  return (
    <div ref={launcherRef} className="operator-launcher" data-open={isOpen ? 'true' : 'false'}>
      <button
        type="button"
        className="operator-launcher__toggle"
        aria-controls={launcherId}
        aria-expanded={isOpen}
        aria-label={isOpen ? 'Close operator launcher' : 'Open operator launcher'}
        onClick={() => setIsOpen((current) => !current)}
      >
        <span className="operator-launcher__toggle-icon" aria-hidden="true">
          <OperatorGlyph />
        </span>
        <span className="operator-launcher__toggle-copy">
          <span className="operator-launcher__toggle-eyebrow">Operator</span>
          <span className="operator-launcher__toggle-label">AI helper</span>
        </span>
        <span className="operator-launcher__toggle-status" aria-hidden="true">
          <StatusPill tone={statusTone}>{statusLabel}</StatusPill>
        </span>
        <span className="operator-launcher__toggle-chevron" aria-hidden="true">
          <ChevronGlyph />
        </span>
      </button>

      <div className="operator-launcher__panel" id={launcherId} aria-hidden={!isOpen}>
        <div className="operator-launcher__header">
          <div className="operator-launcher__title">
            <h3>AI helper</h3>
            <p>Read-only answers grounded in live admin data.</p>
          </div>
          <div className="operator-launcher__header-actions">
            <button
              type="button"
              className="button operator-launcher__reset"
              onClick={resetConversation}
            >
              New chat
            </button>
          </div>
        </div>

        {chatError ? (
          <div className="operator-launcher__status operator-launcher__status--danger" role="status">
            {chatError}
          </div>
        ) : null}

        <div className="operator-launcher__status" role="status">
          {availability === null
            ? 'Checking AI helper status...'
            : readyState
              ? `Live chat is ready with ${availability.model}.`
              : availability.reason === 'missing_openai_api_key'
                ? 'Chat is offline until OPENAI_API_KEY is set in Vercel. You can still draft prompts here, but send is disabled.'
                : availability.reason === 'unauthorized'
                  ? 'Sign in to use the AI helper.'
                : 'Chat status could not be loaded. Refresh the page to try again.'}
        </div>

        <div
          className="operator-chat__thread"
          ref={transcriptRef}
          aria-live="polite"
          aria-relevant="additions text"
          role="log"
        >
          {messages.map((message) => (
            <article
              key={message.id}
              className={`operator-chat__message operator-chat__message--${message.role}`}
            >
              <span className="operator-chat__role">
                {message.role === 'assistant' ? 'AI' : 'You'}
              </span>
              <p>{message.content}</p>
            </article>
          ))}
        </div>

        <form className="operator-chat__composer" onSubmit={handleSubmit}>
          <label className="sr-only" htmlFor={composerId}>
            Message the admin AI helper
          </label>
          <textarea
            id={composerId}
            ref={inputRef}
            className="operator-chat__input"
            placeholder="Ask a question..."
            value={inputValue}
            onChange={(event) => setInputValue(event.target.value)}
            onKeyDown={handleComposerKeyDown}
            rows={5}
          />

          <div className="operator-chat__composer-footer">
            <p className="operator-launcher__note">Read-only helper.</p>
            <button type="submit" className="button button--primary" disabled={!canSend}>
              {isSending ? 'Sending…' : readyState ? 'Send' : 'Chat offline'}
            </button>
          </div>
        </form>

      </div>
    </div>
  );
}
