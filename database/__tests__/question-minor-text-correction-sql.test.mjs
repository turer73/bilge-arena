import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const sql = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations', '230_question_minor_text_correction.sql'), 'utf8');

describe('230 question minor text correction SQL contract', () => {
  it('creates the question_minor_text_corrections table with strict RLS and revocations', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.question_minor_text_corrections');
    expect(sql).toContain('ALTER TABLE public.question_minor_text_corrections ENABLE ROW LEVEL SECURITY;');
    expect(sql).toContain('REVOKE ALL ON TABLE public.question_minor_text_corrections FROM PUBLIC, anon, authenticated, service_role;');
    expect(sql).toContain("rule_version text NOT NULL CHECK (rule_version = 'minor-text-correction@1')");
  });

  it('defines pure immutable helper functions for digit preservation and negation checks', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.question_minor_text_correction_clean_digits');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.question_minor_text_correction_negation_count');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.question_minor_text_correction_verify_string');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.question_minor_text_correction_verify');
    expect(sql).toContain("translate(COALESCE(p_text, ''), '⁰¹²³⁴⁵⁶⁷⁸⁹', '0123456789')");
    expect(sql).toContain('(degil|değil|degildir|değildir|yok|yoktur|hic|hiç|asla|olamaz|yapamaz|tuzsuz|etsiz|yagsiz|yağsız|kokusuz)');
  });

  it('enforces rigorous safety guards against meaning drift, diacritic tricks, and answer changes', () => {
    // Answer must not change
    expect(sql).toContain("IF p_old->'answer' IS DISTINCT FROM p_new->'answer' THEN");
    expect(sql).not.toContain("(p_old->>'answer')::int");
    expect(sql).toContain("COALESCE(jsonb_typeof(p_new->'options'->i), 'null') NOT IN ('string', 'null')");
    expect(sql).toContain("'([A-Za-zÇĞİÖŞÜÂÎÛçğıöşüâîû]{2}[[:space:]\\u00a0]*)[.,;:?!…]+(?!=)'");
    // Option count must match
    expect(sql).toContain("jsonb_array_length(p_new->'options') <> v_opt_len");
    // NFC normalization check
    expect(sql).toContain('NOT (p_new IS NFC NORMALIZED)');
    // Digit sequence match
    expect(sql).toContain('question_minor_text_correction_clean_digits(p_old) IS DISTINCT FROM');
    // Negation count match
    expect(sql).toContain('question_minor_text_correction_negation_count(p_old) <>');
    // Letter skeleton: only case, ASCII->Turkish restoration and text punctuation may change
    expect(sql).toContain('IF NOT public.question_minor_text_correction_letters_compatible(p_old, p_new) THEN');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.question_minor_text_correction_case_mask(p_text text)');
    expect(sql).toContain("IF b <> fb AND substr(v_mask_new, i, 1) <> '2' THEN");
    expect(sql).toContain("anlatim bozuklugu|anlam|deyim|atasoz)");
    expect(sql).toContain('public.question_minor_text_correction_case_mask(text),');
    expect(sql).toContain('IF NOT public.question_minor_text_correction_restoration_ok(p_old, p_new) THEN');
    expect(sql).toContain("[.,;:?!…]+(?!=)");
    expect(sql).toContain('SELECT 1 FROM public.question_turkish_restoration_stems stem');
    expect(sql).toContain("'(?<![0-9])[.,]|[.,](?![0-9])'");
    expect(sql).toContain("(('c','ç'),('g','ğ'),('i','ı'),('o','ö'),('s','ş'),('u','ü'),('a','â'),('i','î'),('u','û'))");
    // Roman numeral words are preserved
    expect(sql).toContain('question_minor_text_correction_roman_tokens(p_old) IS DISTINCT FROM');
  });

  it('only treats a base with no decision and no revision-bound policy as NONE_LEGACY', () => {
    expect(sql).toContain('revision-bound quality policy: use the reviewed revision path');
    expect(sql).toContain('base revision has a non-current or non-approved quality decision');
    expect(sql).toContain("v_has_approved := FOUND AND d.verdict = 'APPROVED';");
    expect(sql).toContain('AND NOT EXISTS (SELECT 1 FROM public.question_validation_decisions x WHERE x.revision_id = m.base_revision_id)');
  });

  it('implements publish_question_minor_text_correction with full governance locks and event logging', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.publish_question_minor_text_correction(');
    expect(sql).toContain('content_governance_has_permission(p_user_id, \'content.prepare\')');
    expect(sql).toContain('content_governance_has_permission(p_user_id, \'content.publish\')');
    expect(sql).toContain("content_governance_lock_request(p_user_id, 'minor_text_correction', p_request_id)");
    expect(sql).toContain("hashtextextended('content-revision:' || p_question_id::text, 0)");
    expect(sql).toContain("hashtextextended('content-publish:' || p_question_id::text, 0)");
    expect(sql).toContain('spelling-topic question: use the two-stage revision path');
    expect(sql).toContain('approved TYT social revision: use the reviewed revision path');
    expect(sql).toContain('INSERT INTO public.question_minor_text_corrections');
    expect(sql).toContain('INSERT INTO public.question_governance_events');
    expect(sql).toContain("left('Kucuk metin duzeltmesi (230, hizli yol): '");
  });

  it('updates tg_require_question_validation_decision to respect legacy carryover without fake approvals', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.tg_require_question_validation_decision()');
    expect(sql).toContain("m.base_policy_verdict = 'NONE_LEGACY'");
    expect(sql).toContain('public.question_minor_text_corrections');
  });

  it('restricts execution exclusively to service_role', () => {
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.publish_question_minor_text_correction(uuid, uuid, uuid, jsonb, uuid)\n  TO service_role;');
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.question_minor_text_correction_clean_digits(text)');
    expect(sql).toContain('FROM PUBLIC, anon, authenticated, service_role;');
  });
});
