#!/usr/bin/env node
/**
 * copy-icons.js
 *
 * Script pós-build que copia os ícones do pacote @expo/vector-icons
 * (baseado em @expo/vector-icons/build/vendor/react-native-vector-icons)
 * para a pasta ./build/icons, organizados por família de fontes.
 *
 * Uso:
 *   node scripts/copy-icons.js [destino]
 *
 * Exemplo:
 *   node scripts/copy-icons.js dist/icons
 */

const fs   = require('fs');
const path = require('path');

const destino = process.argv[2] ?? path.join(__dirname, '..', 'build', 'icons');

const fonteIcones = path.join(
  __dirname,
  '..',
  'node_modules',
  '@expo',
  'vector-icons',
  'build',
  'vendor',
  'react-native-vector-icons',
  'Fonts'
);

function copiarIcones() {
  if (!fs.existsSync(fonteIcones)) {
    console.error(`[copy-icons] Pasta de fontes não encontrada: ${fonteIcones}`);
    process.exit(1);
  }

  fs.mkdirSync(destino, { recursive: true });

  const arquivos = fs.readdirSync(fonteIcones).filter((f) => /\.(ttf|otf)$/i.test(f));

  if (arquivos.length === 0) {
    console.warn('[copy-icons] Nenhuma fonte encontrada para copiar.');
    return;
  }

  for (const arquivo of arquivos) {
    const origem = path.join(fonteIcones, arquivo);
    const alvo   = path.join(destino, arquivo);
    fs.copyFileSync(origem, alvo);
    console.log(`[copy-icons] Copiado: ${arquivo} → ${alvo}`);
  }

  console.log(`\n[copy-icons] ${arquivos.length} fonte(s) copiada(s) para: ${destino}`);
}

copiarIcones();
