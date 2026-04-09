-- Migration 020: Asenkron duello sistemi
-- Arkadaslar arasi meydan okuma, ayni sorulari cozme, sonuc karsilastirma.

CREATE TABLE IF NOT EXISTS challenges (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  challenger_id   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  opponent_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  game            VARCHAR(20) NOT NULL CHECK (game IN ('wordquest','matematik','turkce','fen','sosyal')),
  category        VARCHAR(30),
  status          VARCHAR(20) NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','accepted','completed','expired','declined')),
  question_ids    UUID[] NOT NULL,
  challenger_score JSONB,      -- {correct: 7, total: 10, time_sec: 120, xp: 200}
  opponent_score   JSONB,
  winner_id       UUID REFERENCES profiles(id),
  xp_reward       INT NOT NULL DEFAULT 50,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),

  CONSTRAINT chk_not_self CHECK (challenger_id != opponent_id)
);

-- Indexler
CREATE INDEX IF NOT EXISTS idx_challenges_challenger ON challenges(challenger_id, status);
CREATE INDEX IF NOT EXISTS idx_challenges_opponent ON challenges(opponent_id, status);
CREATE INDEX IF NOT EXISTS idx_challenges_status ON challenges(status) WHERE status IN ('pending', 'accepted');

-- RLS
ALTER TABLE challenges ENABLE ROW LEVEL SECURITY;

-- Herkes kendi duellosunu gorebilir (challenger veya opponent)
CREATE POLICY "challenges_select_own" ON challenges FOR SELECT
  USING (challenger_id = auth.uid() OR opponent_id = auth.uid());

-- Service role tum islemleri yapabilir
CREATE POLICY "challenges_service" ON challenges FOR ALL
  USING (true) WITH CHECK (true);
-- Not: Bu policy service_role icin, authenticated kullanicilar icin INSERT/UPDATE/DELETE
-- API route'larinda service role client kullanilacak
