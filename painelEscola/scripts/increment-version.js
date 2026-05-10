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

const toEndpointVariants = (base) => {
  const cleaned = String(base || '').replace(/\/$/, '');
  if (!cleaned) return [];

  if (/\/version\/panel$/i.test(cleaned)) {
    return [cleaned];
  }

  const variants = [`${cleaned}/version/panel`];
  if (!/\/api$/i.test(cleaned)) {
    variants.push(`${cleaned}/api/version/panel`);
  }

  return [...new Set(variants)];
};

const buildPublishTargets = () => {
  const rawList = process.env.APP_VERSION_API_URLS || '';

  // Permite sobrescrever com múltiplas bases: APP_VERSION_API_URLS="http://localhost:4000/api,https://api.appcurso.com.br/api"
  if (rawList.trim()) {
    return rawList
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
      .map((base) => ({ base, endpoints: toEndpointVariants(base) }));
  }

  return [
    { base: DEFAULT_LOCAL_API_BASE, endpoints: toEndpointVariants(DEFAULT_LOCAL_API_BASE) },
    { base: DEFAULT_REMOTE_API_BASE, endpoints: toEndpointVariants(DEFAULT_REMOTE_API_BASE) },
  ];
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

  const targets = buildPublishTargets().filter((target) => target.endpoints.length > 0);
  if (targets.length === 0) {
    console.warn(
      '⚠️ Publicação da versão no backend ignorada: endpoint inválido.'
    );
    return;
  }

  if (!process.env.APP_VERSION_API_URLS) {
    console.log('ℹ️ Publicando versão nos dois destinos padrão: local e produção.');
  }

  const payload = {
    version: majorVersion,
    release: nextBuildNumber,
    release_date: buildDateIso.slice(0, 10),
  };

  const failures = [];

  for (const target of targets) {
    let publishedInTarget = false;
    let lastError = null;

    for (const endpoint of target.endpoints) {
      try {
        await postJson(endpoint, payload);
        console.log(`☁️ Versão publicada com sucesso em ${target.base}: ${endpoint}`);
        publishedInTarget = true;
        break;
      } catch (error) {
        lastError = error;
        console.warn(`⚠️ Falha ao publicar em ${endpoint}: ${error.message}`);
      }
    }

    if (!publishedInTarget) {
      failures.push({ base: target.base, message: lastError?.message || 'erro desconhecido' });
    }
  }

  if (failures.length > 0) {
    console.error('❌ Não foi possível publicar versão em todos os destinos.');
    failures.forEach((failure) => {
      console.error(`   - ${failure.base}: ${failure.message}`);
    });
    process.exitCode = 1;
  }
};

run();
