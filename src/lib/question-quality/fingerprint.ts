import { createHash } from 'node:crypto'

export function normalizeCorrectionText(value: string | null | undefined): string {
  return (value ?? '')
    .normalize('NFKC')
    .toLocaleLowerCase('tr-TR')
    .replace(/\s+/g, ' ')
    .trim()
}

export function correctionFingerprint(input: {
  reasonCode: string
  proposedAnswerIndex?: number | null
  correctionText?: string | null
}): string {
  return createHash('sha256').update(JSON.stringify({
    reasonCode: input.reasonCode,
    proposedAnswerIndex: input.proposedAnswerIndex ?? null,
    correctionText: normalizeCorrectionText(input.correctionText),
  })).digest('hex')
}

