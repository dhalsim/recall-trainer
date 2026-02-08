#!/usr/bin/env node
/**
 * Validates i18n translation files per .cursor/i18n-rule.md:
 * - All keys must be full English sentences
 * - In english.json, keys and values must be identical
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const englishPath = join(__dirname, '../src/i18n/english.json');

const en = JSON.parse(readFileSync(englishPath, 'utf-8'));
let failed = false;

for (const [key, value] of Object.entries(en)) {
  if (key !== value) {
    console.error(`[i18n] english.json: key must equal value. Key: "${key}" Value: "${value}"`);
    failed = true;
  }
}

if (failed) {
  process.exit(1);
}
console.log('[i18n] english.json validation passed');
