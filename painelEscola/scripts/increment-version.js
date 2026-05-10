#!/usr/bin/env node

const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');

const appJsonPath = path.join(__dirname, '../app.json');
const buildInfoPath = path.join(__dirname, '../buildInfo.json');
const buildNumberPath = path.join(__dirname, '../buildNumber.json');
const DEFAULT_LOCAL_API_BASE = 'http://localhost:4000/api';
const DEFAULT_REMOTE_API_BASE = 'https://api.appcurso.com.br/api';

const postJson = (url, payload) =>
  new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const transport = parsed.protocol === 'https:' ? https : http;
    const body = JSON.stringify(payload);

    const req = transport.request(
      {
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path: `${parsed.pathname}${parsed.search}`,
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          if ((res.statusCode || 500) >= 200 && (res.statusCode || 500) < 300) {
            resolve({ statusCode: res.statusCode, body: data });
            return;
          }

          reject(
            new Error(
              `Falha ao publicar versão (${res.statusCode}): ${data || 'sem resposta'}`
            )
          );
        });
      }
    );

    req.on('error', reject);
    req.write(body);
    req.end();
  });

const buildEndpointCandidates = () => {
  const configuredBase =
    process.env.APP_VERSION_API_URL ||
    process.env.API_BASE_URL ||
    process.env.EXPO_PUBLIC_API_URL ||
    '';

  const baseCandidates = configuredBase
    ? [configuredBase]
    : [DEFAULT_LOCAL_API_BASE, DEFAULT_REMOTE_API_BASE];

  const endpoints = [];

  for (const base of baseCandidates) {
    const cleaned = String(base || '').replace(/\/$/, '');
    if (!cleaned) continue;

    if (/\/version\/panel$/i.test(cleaned)) {
      endpoints.push(cleaned);
      continue;
    }

    endpoints.push(`${cleaned}/version/panel`);

    if (!/\/api$/i.test(cleaned)) {
      endpoints.push(`${cleaned}/api/version/panel`);
    }
  }

  return [...new Set(endpoints)];
};

const run = async () => {
  // Lê os arquivos
  const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf-8'));
  const buildNumber = JSON.parse(fs.readFileSync(buildNumberPath, 'utf-8'));

  // Incrementa número de build
  const nextBuildNumber = Number(buildNumber.number || 0) + 1;

  // Extrai versão major do app.json (primeira posição antes do primeiro ponto)
  const majorVersion = Number(String(appJson.expo.version).split('.')[0] || '1');

  // Formata versão do build: v{major}.{buildNumber}
  const buildVersion = `v${majorVersion}.${nextBuildNumber}`;
  const buildDateIso = new Date().toISOString();

  // Atualiza buildInfo.json
  const buildInfo = {
    version: buildVersion,
    buildDate: buildDateIso,
    buildNumber: nextBuildNumber,
  };

  fs.writeFileSync(buildInfoPath, JSON.stringify(buildInfo, null, 2) + '\n');

  // Atualiza buildNumber.json
  fs.writeFileSync(buildNumberPath, JSON.stringify({ number: nextBuildNumber }, null, 2) + '\n');

  console.log(`✅ Build incrementado: ${buildVersion}`);
  console.log(`📅 Build gerado: ${buildInfo.buildDate}`);

  const endpoints = buildEndpointCandidates();
  if (endpoints.length === 0) {
    console.warn(
      '⚠️ Publicação da versão no backend ignorada: endpoint inválido.'
    );
    return;
  }

  if (!process.env.APP_VERSION_API_URL && !process.env.API_BASE_URL && !process.env.EXPO_PUBLIC_API_URL) {
    console.log(`ℹ️ APP_VERSION_API_URL não definido. Tentando endpoints padrão: ${endpoints.join(' | ')}`);
  }

  const payload = {
    version: majorVersion,
    release: nextBuildNumber,
    release_date: buildDateIso.slice(0, 10),
  };

  let published = false;
  let lastError = null;

  for (const endpoint of endpoints) {
    try {
      await postJson(endpoint, payload);
      console.log(`☁️ Versão publicada no backend com sucesso: ${endpoint}`);
      published = true;
      break;
    } catch (error) {
      lastError = error;
      console.warn(`⚠️ Falha ao publicar em ${endpoint}: ${error.message}`);
    }
  }

  if (!published) {
    const hasExplicitEndpointConfig =
      !!process.env.APP_VERSION_API_URL ||
      !!process.env.API_BASE_URL ||
      !!process.env.EXPO_PUBLIC_API_URL;

    if (hasExplicitEndpointConfig) {
      console.error(`❌ Não foi possível publicar versão no backend: ${lastError?.message || 'erro desconhecido'}`);
      process.exitCode = 1;
      return;
    }

    console.warn(
      `⚠️ Publicação da versão não concluída em ambiente local (${lastError?.message || 'erro desconhecido'}). Build continuará normalmente.`
    );
  }
};

run();
