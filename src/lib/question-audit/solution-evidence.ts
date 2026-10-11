/**
 * Evidence units are derived ONLY from the immutable author's solution.
 * No sentence splitting: decimal points, abbreviations and formulas stay intact.
 * Long lines use bounded, lossless UTF-16 spans without splitting surrogate pairs.
 * IDs are local to this exact input snapshot, not transferable evidence IDs.
 */
export interface AuthorEvidenceUnit {
  id: string
  start: number
  end: number
  text: string
}

export function authorEvidenceUnits(solutionText: string): AuthorEvidenceUnit[] {
  const units: AuthorEvidenceUnit[] = []
  for (let start = 0; start < solutionText.length;) {
    const newline = solutionText.indexOf('\n', start)
    let end = Math.min(start + 2000, newline === -1 ? solutionText.length : newline + 1)
    const last = solutionText.charCodeAt(end - 1)
    const next = solutionText.charCodeAt(end)
    if (last >= 0xd800 && last <= 0xdbff && next >= 0xdc00 && next <= 0xdfff) end--
    const text = solutionText.slice(start, end)
    if (text.trim()) units.push({ id: `author:${units.length}`, start, end, text })
    start = end
  }
  return units
}
