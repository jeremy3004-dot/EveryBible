import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { Type } from '@sinclair/typebox';
import type { OpenClawPluginToolContext } from 'openclaw/plugin-sdk/plugin-entry';

const schemaOptions = { additionalProperties: false } as const;

const defaultChangeRequestDirectory = '.planning/workstreams/web-platform/operator-change-requests';

export interface CodeChangeRequestInput {
  likelyFiles?: string[];
  requestedChange: string;
  title: string;
  verificationExpectations?: string[];
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export function renderCodeChangeRequestMarkdown(params: {
  createdAt: string;
  input: CodeChangeRequestInput;
  messageChannel: string | null;
  senderName: string | null;
  requesterSenderId: string | null;
}): string {
  const likelyFiles = params.input.likelyFiles?.length
    ? params.input.likelyFiles.map((file) => `- ${file}`).join('\n')
    : '- Not specified';
  const verificationExpectations = params.input.verificationExpectations?.length
    ? params.input.verificationExpectations.map((item) => `- ${item}`).join('\n')
    : '- Not specified';

  return [
    '---',
    `title: ${params.input.title}`,
    `createdAt: ${params.createdAt}`,
    `channel: ${params.messageChannel ?? 'unknown'}`,
    `requesterSenderId: ${params.requesterSenderId ?? 'unknown'}`,
    `requesterDisplayName: ${params.senderName ?? 'unknown'}`,
    'status: pending-review',
    '---',
    '',
    '# Requested change',
    '',
    params.input.requestedChange,
    '',
    '# Likely files',
    '',
    likelyFiles,
    '',
    '# Verification expectations',
    '',
    verificationExpectations,
    '',
    '# Operator notes',
    '',
    '- This request was created by the OpenClaw EveryBible operator.',
    '- No repository files were changed automatically.',
    '- Route this into Codex or the normal git review workflow before implementation.',
    '',
  ].join('\n');
}

export function resolveChangeRequestDirectory(workspaceDir: string): string {
  return path.resolve(workspaceDir, defaultChangeRequestDirectory);
}

export function createRequestCodeChangeTool(context: OpenClawPluginToolContext) {
  return {
    name: 'request_code_change',
    label: 'Request Code Change',
    description:
      'Create a reviewable code-change request artifact instead of mutating source code directly.',
    ownerOnly: true,
    parameters: Type.Object(
      {
        title: Type.String(),
        requestedChange: Type.String(),
        likelyFiles: Type.Optional(Type.Array(Type.String(), { minItems: 1 })),
        verificationExpectations: Type.Optional(Type.Array(Type.String(), { minItems: 1 })),
      },
      schemaOptions
    ),
    async execute(_toolCallId: string, params: CodeChangeRequestInput) {
      const createdAt = new Date().toISOString();
      const workspaceDir = context.workspaceDir || process.cwd();
      const directory = resolveChangeRequestDirectory(workspaceDir);
      const filename = `${createdAt.replaceAll(':', '').replaceAll('.', '')}-${slugify(params.title)}.md`;
      const filePath = path.join(directory, filename);
      const markdown = renderCodeChangeRequestMarkdown({
        createdAt,
        input: params,
        messageChannel: context.messageChannel ?? null,
        senderName: null,
        requesterSenderId: context.requesterSenderId ?? null,
      });

      await mkdir(directory, { recursive: true });
      await writeFile(filePath, markdown, 'utf8');

      return {
        content: [
          {
            type: 'text' as const,
            text:
              'Created a reviewable code-change request artifact. Use Codex or the normal git workflow to implement it safely.',
          },
        ],
        details: {
          status: 'ok',
          filePath,
          nextStep:
            'Review the markdown artifact, then hand it to Codex/ACP or your standard repo workflow for implementation.',
        },
      };
    },
  };
}
