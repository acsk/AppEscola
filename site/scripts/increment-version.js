#!/usr/bin/env node
/**
 * Incrementa o build do site (v{major}.{build}) em buildInfo.json e buildNumber.json.
 * Diferente do painel, não publica a versão na API: o site não tem endpoint de versão.
 */
const fs = require("fs");
const path = require("path");

const appJsonPath = path.join(__dirname, "../app.json");
const buildInfoPath = path.join(__dirname, "../buildInfo.json");
const buildNumberPath = path.join(__dirname, "../buildNumber.json");

const appJson = JSON.parse(fs.readFileSync(appJsonPath, "utf-8"));
const buildNumber = JSON.parse(fs.readFileSync(buildNumberPath, "utf-8"));

const nextBuildNumber = Number(buildNumber.number || 0) + 1;
const majorVersion = Number(String(appJson.expo.version).split(".")[0] || "1");
const buildVersion = `v${majorVersion}.${nextBuildNumber}`;

const buildInfo = {
  version: buildVersion,
  buildDate: new Date().toISOString(),
  buildNumber: nextBuildNumber,
};

fs.writeFileSync(buildInfoPath, JSON.stringify(buildInfo, null, 2) + "\n");
fs.writeFileSync(buildNumberPath, JSON.stringify({ number: nextBuildNumber }, null, 2) + "\n");

console.log(`✅ Build incrementado: ${buildVersion}`);
console.log(`📅 Build gerado: ${buildInfo.buildDate}`);
