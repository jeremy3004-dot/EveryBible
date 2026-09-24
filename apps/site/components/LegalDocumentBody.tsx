import type { ReactNode } from 'react';

import { parseInline, type LegalBlock, type LegalDocument } from '../lib/legal/legal-document';

function Inline({ text }: { text: string }): ReactNode {
  return parseInline(text).map((token, index) => {
    if (token.kind === 'strong') return <strong key={index}>{token.text}</strong>;
    if (token.kind === 'link') {
      return (
        <a key={index} href={token.href}>
          {token.text}
        </a>
      );
    }
    return token.text;
  });
}

function Block({ block }: { block: LegalBlock }) {
  switch (block.kind) {
    case 'paragraph':
      return (
        <p>
          <Inline text={block.text} />
        </p>
      );
    case 'subheading':
      return (
        <h3>
          <Inline text={block.text} />
        </h3>
      );
    case 'list':
      return (
        <ul>
          {block.items.map((item) => (
            <li key={item}>
              <Inline text={item} />
            </li>
          ))}
        </ul>
      );
    case 'steps':
      return (
        <ol>
          {block.items.map((item) => (
            <li key={item}>
              <Inline text={item} />
            </li>
          ))}
        </ol>
      );
  }
}

/** Renders a shared legal document (lib/legal) inside StaticPageLayout. */
export function LegalDocumentBody({ document }: { document: LegalDocument }) {
  return document.sections.map((section) => (
    <section key={section.id} id={section.id}>
      <h2>
        <Inline text={section.heading} />
      </h2>
      {section.blocks.map((block, index) => (
        <Block key={index} block={block} />
      ))}
    </section>
  ));
}
