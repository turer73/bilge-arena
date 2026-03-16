# KVKK & Consent System Design

**Date:** 2026-03-16
**Status:** Approved

## Overview

Full KVKK/privacy compliance system: granular cookie banner with category toggles, explicit consent checkbox on login, and Supabase-backed consent audit log.

## Components

### 1. Cookie Banner (Rewrite)

**File:** `src/components/cookie-banner.tsx`

Initial view: bottom bar with 3 buttons:
- "Tümünü Kabul Et" (primary) — grants all
- "Tümünü Reddet" (ghost) — essential only
- "Özelleştir" (text link) — expands toggle panel

Toggle panel (on "Özelleştir"):
- Essential cookies — always on, disabled toggle
- Analytics cookies — toggleable (GA + Vercel)
- "Tercihlerimi Kaydet" button

localStorage key: `bilge-arena-cookie-consent`
Format: `{ essential: true, analytics: true/false, version: 1, date: "ISO" }`

Re-access: Footer link "Çerez Tercihleri" reopens banner via global event.

### 2. Login Consent Checkbox

**File:** `src/app/giris/giris-client.tsx`

Replace passive text with explicit checkbox:
- Checkbox must be checked to enable Google login button
- Links to /kullanim-kosullari, /gizlilik-politikasi, /kvkk (new tab)
- Logs consent to Supabase after successful auth

### 3. Consent Helper Library

**File:** `src/lib/consent.ts`

Functions:
- `getCookieConsent()` — read from localStorage
- `setCookieConsent(prefs)` — write to localStorage + log to Supabase
- `logConsent(type, value)` — INSERT into consent_logs table
- `openConsentBanner()` — dispatch custom event to reopen banner

### 4. Google Analytics Update

**File:** `src/components/analytics/google-analytics.tsx`

Read granular consent from localStorage JSON instead of simple 'accepted' string.

### 5. Footer Update

**File:** `src/components/layout/footer.tsx`

Add "Çerez Tercihleri" client button in bottom bar that triggers banner reopen.

### 6. Database

**File:** `database/consent_logs.sql`

```sql
CREATE TABLE consent_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id),
  consent_type text NOT NULL,
  consent_value jsonb NOT NULL,
  ip_address text,
  user_agent text,
  created_at timestamptz DEFAULT now()
);
```

### 7. Types

**File:** `src/types/database.ts`

Add ConsentLog type and CookieConsent interface.

## File Change Summary

| File | Action |
|------|--------|
| `src/components/cookie-banner.tsx` | Rewrite |
| `src/lib/consent.ts` | New |
| `src/app/giris/giris-client.tsx` | Edit |
| `src/components/analytics/google-analytics.tsx` | Edit |
| `src/components/layout/footer.tsx` | Edit |
| `src/types/database.ts` | Edit |
| `database/consent_logs.sql` | New |
