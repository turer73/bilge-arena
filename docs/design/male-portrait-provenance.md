# Selectable Bilge guides — 2026-09-14

Scope: the owner-private desktop/tablet Sites design preview only. No changes to bilgearena.com, the mobile application, account profiles, or learning logic.

- Female guide: the existing portrait and 12 separate expression assets remain.
- Male guide: one new main portrait is available. There is not yet a male 12-expression set; the gallery explicitly says so.
- The guide can be selected on the coach card and in the character gallery.
- Selection uses the preview-origin key `bilge-preview-character-v1`. Reload and other same-origin tabs restore it. When browser storage is unavailable, the choice works only on the current page.
- This is a visual guide preference, not an inference about the student's gender. Both guides use the same learning content and supportive copy.
- Existing theme, page background, profile-background settings, and header user avatar are unchanged.
- Local Node checks cover state isolation, restoration, cross-tab events, blocked storage, syntax and asset presence. These are not rendered browser QA.

## Image provenance

Mode: builtin imagegen. The user-supplied reference board was used for the male character's identity and academy style.

Reference: `C:\Users\sevdi\Downloads\Bilge arena\ChatGPT Image 12 Eyl 2026 16_41_48.png`

Output: `dist/bilge-male-portrait.png`

This is a newly generated adaptation, not a pixel-exact crop of the board. Visual inspection confirmed a single blue-haired, blue-eyed male guide, a supportive expression, academy hoodie and B badge. The opaque navy background includes softly blurred academy banners.

### Exact generation prompt

Use case: stylized-concept.
Asset type: ONE square upper-body anime character portrait for the Bilge Arena learning app right sidebar guide.
Input images: Image 1 is the character and style reference board. Use ONLY the masculine blue-haired guide at the upper-left board, immediately to the RIGHT of the large crowned B logo. Preserve that character identity; the rest of the board is context only.
Scene/backdrop: simple opaque dark navy academy-inspired background, dominant color #0d1930, very subtle softly blurred architecture, quiet enough to integrate with dark app UI.
Subject: one youthful student-age masculine friendly Bilge guide with short tousled navy/cobalt blue hair, clear bright blue eyes, delicate anime facial features, navy academy hoodie/jacket with cyan blue trim, small B shield badge on his chest matching the reference.
Expression and pose: calm warm confident supportive smile, closed mouth, approachable attentive eye contact, relaxed shoulders, neutral upright upper-body pose. No exaggerated expression, no pointing hand in front of the camera.
Style/medium: premium polished anime illustration matching the reference board, crisp controlled linework, soft dimensional cel shading, handsome friendly facial proportions, rich restrained blues.
Composition/framing: square canvas; centered face; full hair silhouette and both shoulders visible with comfortable margin; head and upper torso fill most of canvas. Important face details stay in the middle so it also crops well into a narrow right-sidebar portrait. Natural anatomy.
Lighting/mood: soft flattering face light with subtle blue edge light, trustworthy and supportive.
Constraints: exactly one character; no UI, no captions, no typography except the tiny B badge, no frame, no watermark, no montage, no other characters, no sexualization. Return a single finished square portrait.
