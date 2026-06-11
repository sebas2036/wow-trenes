#!/usr/bin/env bash
# restore-env.sh — Restaura el .env desde .env.enc (tras clonar en una Mac nueva).
#
# Uso:   bash scripts/restore-env.sh
# Te pide la passphrase con la que encriptaste (la que guardaste en tu gestor).
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -f .env.enc ]; then
  echo "❌ No existe .env.enc — ¿clonaste el repo y trajiste LFS?"
  exit 1
fi
if [ -f .env ]; then
  echo "⚠️  Ya existe un .env. Lo sobrescribo? (Ctrl-C para cancelar)"
  read -r _
fi

echo "🔓 Desencriptando .env.enc → .env (te va a pedir la passphrase)..."
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -in .env.enc -out .env

echo "✅ Listo: .env restaurado. Reiniciá Expo con: npx expo start --clear"
