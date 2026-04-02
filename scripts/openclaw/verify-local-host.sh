#!/usr/bin/env bash
set -euo pipefail

PROFILE="${EVERYBIBLE_OPERATOR_PROFILE:-everybible}"

echo "== OpenClaw doctor =="
openclaw --profile "${PROFILE}" doctor
echo

echo "== OpenClaw health =="
openclaw --profile "${PROFILE}" health
echo

echo "== OpenClaw status =="
openclaw --profile "${PROFILE}" status
echo

echo "== OpenClaw plugins =="
openclaw --profile "${PROFILE}" plugins list
echo

echo "== Telegram pairing queue =="
openclaw --profile "${PROFILE}" pairing list telegram || true
echo

echo "== Agent probe =="
openclaw --profile "${PROFILE}" agent --agent main --message "Reply with exactly OK." --json || true
echo

echo "If Telegram is still in pairing mode, send the bot a DM and approve it:"
echo "  openclaw --profile ${PROFILE} pairing list telegram"
echo "  openclaw --profile ${PROFILE} pairing approve telegram <CODE>"
echo
echo "Then switch the profile back to allowlist mode with your real Telegram numeric ID."
