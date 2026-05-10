#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const appJsonPath = path.join(__dirname, '../app.json');
const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf-8'));

const currentVersion = appJson.expo.version;
const parts = currentVersion.split('.').map(Number);

// Por padrão incrementa patch (1.0.0 → 1.0.1)
// Use: node scripts/increment-version.js minor ou major
const type = process.argv[2] || 'patch';

switch (type) {
  case 'major':
    parts[0]++;
    parts[1] = 0;
    parts[2] = 0;
    break;
  case 'minor':
    parts[1]++;
    parts[2] = 0;
    break;
  case 'patch':
  default:
    parts[2]++;
}

const newVersion = parts.join('.');
appJson.expo.version = newVersion;

fs.writeFileSync(appJsonPath, JSON.stringify(appJson, null, 2) + '\n');

console.log(`✅ Versão incrementada: ${currentVersion} → ${newVersion}`);
