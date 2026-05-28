#!/usr/bin/env bash
# Gera ZIP com todo o conteúdo de dist/ (inclui _expo/static, ignorado no git).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -d dist/_expo/static ]]; then
  echo "❌ dist/_expo/static não existe. Rode antes: npm run web:build"
  exit 1
fi

OUT="$ROOT/deploy-painel-dist.zip"
rm -f "$OUT"
(cd dist && zip -rq "$OUT" .)

echo "✅ Pacote: $OUT"
echo "   Tamanho: $(du -h "$OUT" | cut -f1)"
echo ""
echo "No Hostinger (Gerenciador de arquivos ou FTP):"
echo "  1. Abra a pasta public_html/dist/ (ou onde está o painel)"
echo "  2. Envie e extraia deploy-painel-dist.zip DENTRO de dist/"
echo "  3. Confirme: dist/_expo/static/js/web/index-*.js existe no servidor"
