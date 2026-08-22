import { beforeEach, describe, expect, it } from 'vitest'
import {
  createGuestGradingToken,
  verifyGuestGradingToken,
} from '../guest-grading-session'
import {
  createActivationRewardToken,
  verifyActivationRewardToken,
} from '@/lib/activation/server-reward'

/**
 * Iki semanin ayni gizli anahtari paylastigi uretim konfigurasyonu:
 * QUESTION_GRADING_SECRET tanimli degil -> misafir puanlama, yedek zincirden
 * ACTIVATION_REWARD_SECRET'i kullanir. Alan ayrimi olmadan iki token birebir
 * takas edilebiliyordu (ayni alanlar, ayni imza girdisi).
 */
const SHARED_SECRET = 'paylasilan-gizli-anahtar-en-az-32-karakter'
const QUESTION_ID = '11111111-2222-4333-8444-555555555555'

beforeEach(() => {
  process.env.ACTIVATION_REWARD_SECRET = SHARED_SECRET
  delete process.env.QUESTION_GRADING_SECRET
})

describe('token alan ayrimi (cross-protocol confusion)', () => {
  it('misafir puanlama token\'i activation dogrulayicisinca REDDEDILIR', () => {
    const guestToken = createGuestGradingToken([QUESTION_ID])
    expect(guestToken).toBeTruthy()
    // kendi dogrulayicisinda gecerli
    expect(verifyGuestGradingToken(guestToken)).not.toBeNull()
    // digerinde gecersiz — XP tasiyan activation akisina terfi edemez
    expect(verifyActivationRewardToken(guestToken)).toBeNull()
  })

  it('activation token\'i misafir dogrulayicisinca REDDEDILIR', () => {
    const rewardToken = createActivationRewardToken([QUESTION_ID])
    expect(rewardToken).toBeTruthy()
    expect(verifyActivationRewardToken(rewardToken)).not.toBeNull()
    expect(verifyGuestGradingToken(rewardToken)).toBeNull()
  })

  it('token yuku amac etiketini tasir', () => {
    const guestToken = createGuestGradingToken([QUESTION_ID])
    const [encoded] = (guestToken ?? '').split('.')
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'))
    expect(payload.purpose).toBe('guest-grading')
  })

  it('amac alani olmayan eski token kabul edilmez', () => {
    const guestToken = createGuestGradingToken([QUESTION_ID]) ?? ''
    const [encoded, signature] = guestToken.split('.')
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'))
    delete payload.purpose
    const tampered = Buffer.from(JSON.stringify(payload)).toString('base64url')
    expect(verifyGuestGradingToken(`${tampered}.${signature}`)).toBeNull()
  })
})
