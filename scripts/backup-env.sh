#!/usr/bin/env bash
# backup-env.sh — Encripta el .env (API keys) a .env.enc para poder respaldarlo.
#
# El .env real NUNCA va a git (gitignored). Este script lo encripta con AES-256
# usando una passphrase que SOLO vos escribís (no queda en ningún lado).
# El .env.enc resultante es seguro: se puede commitear o subir a la nube.
#
# Uso:   bash scripts/backup-env.sh
# Restaurar en otra Mac:   bash scripts/restore-env.sh
#
# IMPORTANTE: guardá la passphrase en tu gestor de contraseñas. Es lo único
# que no se puede recuperar si la perdés.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "❌ No existe .env en $(pwd) — nada que respaldar."
  exit 1
fi

echo "🔒 Encriptando .env → .env.enc (te va a pedir una passphrase, dos veces)..."
openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -in .env -out .env.enc

echo "✅ Listo: .env.enc creado ($(wc -c < .env.enc) bytes)."
echo "   Ahora podés commitearlo y pushearlo (está encriptado, es seguro)."
echo "   Y guardá la PASSPHRASE en tu gestor de contraseñas."
