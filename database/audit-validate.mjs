#!/usr/bin/env node
/**
 * @deprecated 2026-07-05 — validate-question-bank.mjs ile değiştirildi.
 *
 * Bu eski araç yalnız hardcoded `audit-claude-batch.json`'u okuyordu (gerçek
 * bankayı değil), DUP_OPTION kontrolünde casefold kullanıp yazım/büyük-harf ve
 * genotip sorularını FALSE-POSITIVE flag'liyordu, ve test/CI entegrasyonu yoktu.
 *
 * YERİNE:
 *   node database/validate-question-bank.mjs      # tüm data/soru-bankasi/
 *   npm run validate:questions
 *   npx vitest --config vitest.database.config.ts  # regresyon kilidi
 */
console.error('[DEPRECATED] audit-validate.mjs -> validate-question-bank.mjs kullanın (npm run validate:questions).')
process.exit(2)
