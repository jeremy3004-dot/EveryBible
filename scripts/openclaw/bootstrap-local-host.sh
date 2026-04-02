#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: bootstrap-local-host.sh [--pairing] [--allowlist <telegram-id>]

Bootstraps an isolated EveryBible OpenClaw profile on the local host.

Required env:
  EVERYBIBLE_OPERATOR_TELEGRAM_BOT_TOKEN

Optional env:
  EVERYBIBLE_OPERATOR_PROFILE                 default: everybible
  EVERYBIBLE_OPERATOR_GATEWAY_PORT            default: 18791
  EVERYBIBLE_OPERATOR_GATEWAY_TOKEN           default: generated locally
  EVERYBIBLE_OPERATOR_TELEGRAM_ALLOW_FROM     default: inferred from ~/.openclaw/openclaw.json
  EVERYBIBLE_OPERATOR_MODEL_ID                default: openai-codex/gpt-5.4
  NEXT_PUBLIC_SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY
  OPENAI_API_KEY
EOF
}

PAIRING_MODE=0
ALLOWLIST_ID="${EVERYBIBLE_OPERATOR_TELEGRAM_ALLOW_FROM:-}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --pairing)
      PAIRING_MODE=1
      shift
      ;;
    --allowlist)
      ALLOWLIST_ID="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ -z "${EVERYBIBLE_OPERATOR_TELEGRAM_BOT_TOKEN:-}" ]]; then
  echo "EVERYBIBLE_OPERATOR_TELEGRAM_BOT_TOKEN is required." >&2
  exit 1
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PLUGIN_ROOT="${EVERYBIBLE_OPERATOR_PLUGIN_ROOT:-${REPO_ROOT}}"
PROFILE="${EVERYBIBLE_OPERATOR_PROFILE:-everybible}"
STATE_DIR="${HOME}/.openclaw-${PROFILE}"
WORKSPACE_DIR="${EVERYBIBLE_OPERATOR_WORKSPACE:-${REPO_ROOT}}"
CONFIG_FILE="${STATE_DIR}/openclaw.json"
TOKEN_DIR="${STATE_DIR}/secrets"
TOKEN_FILE="${TOKEN_DIR}/telegram-${PROFILE}.token"
PORT="${EVERYBIBLE_OPERATOR_GATEWAY_PORT:-18791}"
MODEL_ID="${EVERYBIBLE_OPERATOR_MODEL_ID:-openai-codex/gpt-5.4}"
GATEWAY_TOKEN="${EVERYBIBLE_OPERATOR_GATEWAY_TOKEN:-}"

if [[ -z "${GATEWAY_TOKEN}" ]]; then
  GATEWAY_TOKEN="$(node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))")"
fi

if [[ -z "${ALLOWLIST_ID}" && -f "${HOME}/.openclaw/openclaw.json" ]]; then
  ALLOWLIST_ID="$(node <<'NODE'
const fs = require('node:fs');
const path = require('node:path');

const configPath = path.join(process.env.HOME, '.openclaw', 'openclaw.json');
const raw = fs.readFileSync(configPath, 'utf8');
const config = JSON.parse(raw);
const allowFrom = config?.channels?.telegram?.allowFrom;

if (Array.isArray(allowFrom) && typeof allowFrom[0] === 'string') {
  process.stdout.write(allowFrom[0]);
}
NODE
)"
fi

mkdir -p "${TOKEN_DIR}" "${STATE_DIR}"
chmod 700 "${STATE_DIR}" "${TOKEN_DIR}"
printf '%s' "${EVERYBIBLE_OPERATOR_TELEGRAM_BOT_TOKEN}" > "${TOKEN_FILE}"
chmod 600 "${TOKEN_FILE}"

rm -f "${CONFIG_FILE}"

openclaw --profile "${PROFILE}" onboard \
  --non-interactive \
  --accept-risk \
  --mode local \
  --auth-choice skip \
  --gateway-auth token \
  --gateway-token "${GATEWAY_TOKEN}" \
  --gateway-bind loopback \
  --gateway-port "${PORT}" \
  --workspace "${WORKSPACE_DIR}" \
  --skip-channels \
  --skip-health \
  --skip-ui \
  --skip-skills \
  --skip-search \
  --no-install-daemon >/dev/null

mkdir -p "${STATE_DIR}/agents/main/agent"

for source_dir in "${HOME}/.openclaw/agents/main/agent" "${HOME}/.openclaw/agents/engineer/agent"; do
  if [[ -d "${source_dir}" ]]; then
    [[ -f "${source_dir}/auth-profiles.json" ]] && cp "${source_dir}/auth-profiles.json" "${STATE_DIR}/agents/main/agent/auth-profiles.json"
    [[ -f "${source_dir}/auth.json" ]] && cp "${source_dir}/auth.json" "${STATE_DIR}/agents/main/agent/auth.json"
    [[ -f "${source_dir}/models.json" ]] && cp "${source_dir}/models.json" "${STATE_DIR}/agents/main/agent/models.json"
    break
  fi
done

if [[ "${PAIRING_MODE}" -eq 0 && -z "${ALLOWLIST_ID}" ]]; then
  echo "No allowlist ID found; falling back to pairing mode." >&2
  PAIRING_MODE=1
fi

DM_POLICY="allowlist"
ALLOW_FROM_BLOCK="\"${ALLOWLIST_ID}\""

if [[ "${PAIRING_MODE}" -eq 1 ]]; then
  DM_POLICY="pairing"
  ALLOW_FROM_BLOCK=""
fi

if [[ -n "${OPENAI_API_KEY:-}" ]]; then
  MODEL_PROVIDER_BLOCK=$(cat <<EOF
  models: {
    providers: {
      openai: {
        apiKey: "${OPENAI_API_KEY}",
        baseUrl: "https://api.openai.com/v1",
      },
    },
  },
EOF
)
  MODEL_ID="${EVERYBIBLE_OPERATOR_MODEL_ID:-openai/gpt-5.4}"
else
  MODEL_PROVIDER_BLOCK=""
fi

openclaw --profile "${PROFILE}" plugins install acpx >/dev/null
openclaw --profile "${PROFILE}" plugins install -l "${PLUGIN_ROOT}/packages/openclaw-everybible" >/dev/null
mkdir -p "${STATE_DIR}/extensions"
ln -sfn "${PLUGIN_ROOT}/packages/openclaw-everybible" "${STATE_DIR}/extensions/everybible"

cat > "${CONFIG_FILE}" <<EOF
{
  gateway: {
    mode: "local",
    port: ${PORT},
    bind: "loopback",
    auth: {
      mode: "token",
      token: "${GATEWAY_TOKEN}",
    },
  },

  plugins: {
    enabled: true,
    allow: ["acpx", "everybible"],
    entries: {
      acpx: {
        enabled: true,
      },
      everybible: {
        enabled: true,
      },
    },
  },

${MODEL_PROVIDER_BLOCK}
  agents: {
    defaults: {
      workspace: "${WORKSPACE_DIR}",
      model: {
        primary: "${MODEL_ID}",
      },
    },
  },

  acp: {
    enabled: true,
    dispatch: {
      enabled: true,
    },
    backend: "acpx",
    defaultAgent: "codex",
    allowedAgents: ["codex"],
    maxConcurrentSessions: 4,
  },

  channels: {
    telegram: {
      enabled: true,
      tokenFile: "${TOKEN_FILE}",
      dmPolicy: "${DM_POLICY}",
      allowFrom: [${ALLOW_FROM_BLOCK}],
      groupPolicy: "disabled",
    },
  },
}
EOF

openclaw --profile "${PROFILE}" models set "${MODEL_ID}" >/dev/null || true
openclaw --profile "${PROFILE}" config validate >/dev/null
openclaw --profile "${PROFILE}" gateway install --force --runtime node --port "${PORT}" --token "${GATEWAY_TOKEN}" >/dev/null
openclaw --profile "${PROFILE}" gateway restart >/dev/null

echo "EveryBible OpenClaw profile bootstrapped."
echo "Profile: ${PROFILE}"
echo "Config: ${CONFIG_FILE}"
echo "Workspace: ${WORKSPACE_DIR}"
echo "Model: ${MODEL_ID}"
if [[ "${PAIRING_MODE}" -eq 1 ]]; then
  echo "Telegram mode: pairing"
  echo "Next step: send a DM to https://t.me/everybible_global_bot, then run openclaw --profile ${PROFILE} pairing list telegram"
else
  echo "Telegram mode: allowlist (${ALLOWLIST_ID})"
fi
