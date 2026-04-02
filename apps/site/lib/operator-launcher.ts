export interface OperatorLauncherConfig {
  chatUrl: string;
  description: string;
  primaryActionLabel: string;
  title: string;
}

export type OperatorLauncherEnv = Record<string, string | undefined>;

const defaultLauncherCopy = {
  description:
    'Start a guided chat with the EveryBible AI operator for questions, prayer, and trusted follow-up.',
  primaryActionLabel: 'Open chat',
  title: 'Chat with EveryBible AI',
} as const;

function normalizeChatUrl(value: string | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  try {
    const url = new URL(trimmed);

    if (url.protocol !== 'https:' && url.protocol !== 'tg:') {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}

export function getOperatorLauncherConfig(
  env: OperatorLauncherEnv = process.env
): OperatorLauncherConfig | null {
  const chatUrl = normalizeChatUrl(env.NEXT_PUBLIC_EVERYBIBLE_OPERATOR_CHAT_URL);

  if (!chatUrl) {
    return null;
  }

  return {
    chatUrl,
    description: defaultLauncherCopy.description,
    primaryActionLabel: defaultLauncherCopy.primaryActionLabel,
    title: defaultLauncherCopy.title,
  };
}
