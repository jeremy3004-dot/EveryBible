'use client';

import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';

interface ChatMessage {
  content: string;
  id: string;
  role: 'assistant' | 'user';
}

const INITIAL_MESSAGES: ChatMessage[] = [
  {
    content: 'Ask me about admin health, audit trail, or translations.',
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
  const [inputValue, setInputValue] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_MESSAGES);
  const launcherId = useId();
  const composerId = useId();
  const launcherRef = useRef<HTMLDivElement>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesRef = useRef<ChatMessage[]>(INITIAL_MESSAGES);

  useEffect(() => {
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
    if (!isOpen) {
      return;
    }

    inputRef.current?.focus();
  }, [isOpen]);

  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
    messagesRef.current = messages;
  }, [messages]);

  function appendMessage(message: ChatMessage) {
    setMessages((current) => {
      const next = [...current, message].slice(-20);
      messagesRef.current = next;
      return next;
    });
  }

  async function submitPrompt(prompt: string) {
    const content = prompt.trim();
    if (!content || isSending) {
      return;
    }

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
        throw new Error(payload?.error ?? 'The AI helper could not answer right now.');
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
          <span className="operator-launcher__toggle-label">AI helper</span>
        </span>
        <span className="operator-launcher__toggle-chevron" aria-hidden="true">
          <ChevronGlyph />
        </span>
      </button>

      <div className="operator-launcher__panel" id={launcherId} aria-hidden={!isOpen}>
        <div className="operator-launcher__header">
          <div className="operator-launcher__title">
            <h3>AI helper</h3>
            <p>Simple read-only chat grounded in live admin data.</p>
          </div>
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
            <span className="operator-chat__hint">Ask a plain question about the dashboard.</span>
            <button type="submit" className="button button--primary" disabled={inputValue.trim().length === 0 || isSending}>
              {isSending ? 'Sending...' : 'Send'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
