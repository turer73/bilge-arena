import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import postcss from 'postcss'
import sharp from 'sharp'

const root = process.cwd()
const ids = ['neseli','kutlayan','kararli','odaklanmis','dusunen','merakli','saskin','utangac','uzgun','yorgun','destekleyici','hafif-kizgin']
let bytes = 0
for (const character of ['female','male']) {
  const hashes = new Set()
  for (const id of [...ids,'portrait']) {
    const file = path.join(root,'public/academy/bilge',character,id+'.png')
    const buffer = fs.readFileSync(file)
    assert.equal(buffer.subarray(0,8).toString('hex'),'89504e470d0a1a0a',file)
    if (id !== 'portrait') {
      assert.equal(buffer.readUInt32BE(16),buffer.readUInt32BE(20),'Expression must be square: '+file)
      hashes.add(createHash('sha256').update(buffer).digest('hex'))
    }
    bytes += buffer.length
  }
  assert.equal(hashes.size,12,character+' must contain 12 distinct files')
}
const css = fs.readFileSync(path.join(root,'src/components/academy/academy.module.css'),'utf8')
const modeAssets = [
  ['tower-v1.png','tower-concept-v1.png'],
  ['conquest-janissary-v2.png','conquest-janissary-concept-v2.png'],
  ['wordquest-v1.png','wordquest-concept-v1.png'],
]
for (const [file,concept] of modeAssets) {
  const asset = fs.readFileSync(path.join(root,'public/academy/modes',file))
  const original = fs.readFileSync(path.join(root,'docs/design/game-mode-concepts-20260914',concept))
  const metadata = await sharp(asset).metadata()
  assert.equal(metadata.format,'png','Mode art must be PNG: '+file)
  assert(metadata.width / metadata.height >= 2.8,'Preserve full-height artwork in a 2.8:1 card: '+file)
  assert.equal(createHash('sha256').update(asset).digest('hex'),createHash('sha256').update(original).digest('hex'),'Approved artwork must remain unchanged: '+file)
}
const subjectManifest = JSON.parse(fs.readFileSync(path.join(root,'docs/design/subject-magic-prompts-20260914.json'),'utf8'))
assert.deepEqual(subjectManifest.assets.map(asset => asset.slug),['matematik','turkce','fen','sosyal'])
for (const asset of subjectManifest.assets) {
  assert.equal(asset.file,`public/academy/subjects/${asset.slug}-magic-v1.png`)
  const buffer = fs.readFileSync(path.join(root,asset.file))
  const metadata = await sharp(buffer).metadata()
  assert.equal(metadata.format,'png','Subject art must be PNG: '+asset.slug)
  assert.equal(metadata.width,asset.width)
  assert.equal(metadata.height,asset.height)
  assert.equal(createHash('sha256').update(buffer).digest('hex'),asset.sha256,'Original subject artwork changed: '+asset.slug)
  assert(asset.prompt.length > 100,'Keep the generation prompt: '+asset.slug)
}
const lobbyModeManifest = JSON.parse(fs.readFileSync(path.join(root,'docs/design/lobby-mode-card-prompts-20260914.json'),'utf8'))
const lobbyModeComponent = fs.readFileSync(path.join(root,'src/components/academy/desktop-game-lobby.tsx'),'utf8')
assert.deepEqual(lobbyModeManifest.assets.map(asset => asset.slug),['classic','blitz','marathon','boss','deneme','practice'])
for (const asset of lobbyModeManifest.assets) {
  assert.equal(asset.file,`public/academy/lobby-modes/${asset.slug}-v1.webp`)
  assert(lobbyModeComponent.includes(`${asset.slug}: '/${asset.file.replace(/^public\//,'')}'`),'Lobby component must reference manifest art: '+asset.slug)
  const buffer = fs.readFileSync(path.join(root,asset.file))
  const metadata = await sharp(buffer).metadata()
  assert.equal(metadata.format,'webp','Lobby mode art must be WebP: '+asset.slug)
  assert.equal(metadata.width,asset.width)
  assert.equal(metadata.height,asset.height)
  assert(metadata.width / metadata.height >= 2.2,'Lobby mode artwork must remain panoramic: '+asset.slug)
  assert.equal(createHash('sha256').update(buffer).digest('hex'),asset.sha256,'Lobby mode artwork changed: '+asset.slug)
  assert(asset.prompt.length > 100,'Keep the lobby mode generation prompt: '+asset.slug)
}
postcss.parse(css)
postcss.parse(fs.readFileSync(path.join(root,'src/components/academy/desktop-game-lobby.module.css'),'utf8'))
for (const match of css.matchAll(/url\(['"]?([^)'"]+)['"]?\)/g)) assert(fs.existsSync(path.join(root,'public',match[1])))
for (const file of ['academy-landscape.png','brand-crest-orbit.png']) assert(fs.existsSync(path.join(root,'public/academy',file)))
const trophyPath = path.join(root,'public/academy/daily-plan-trophy-v1.png')
const trophyMetadata = await sharp(trophyPath).metadata()
const trophyStats = await sharp(trophyPath).stats()
assert.equal(trophyMetadata.format,'png','Daily plan trophy must be PNG')
assert.equal(trophyMetadata.width,trophyMetadata.height,'Daily plan trophy must be square')
assert(trophyMetadata.hasAlpha && !trophyStats.isOpaque,'Daily plan trophy must preserve real transparency')
const desktop = fs.readFileSync(path.join(root,'src/components/academy/desktop-study-home.tsx'),'utf8')
assert(!desktop.includes('fetch('),'Reuse established hooks and plan component, not parallel endpoints')
const pref = fs.readFileSync(path.join(root,'src/lib/bilge/use-bilge-character.ts'),'utf8')
assert(!pref.includes('bilge-theme'))
assert(!pref.includes('bilge-arena-zemin-v1'))
assert(!pref.includes('profile-background'))
console.log(JSON.stringify({assetChecks:'passed',femaleExpressions:12,maleExpressions:12,portraits:2,sourcePngBytes:bytes,trophy:'transparent-png',modeArt:modeAssets.length,subjectArt:subjectManifest.assets.length,lobbyModeArt:lobbyModeManifest.assets.length,css:'parsed',state:'independent',browserVisualQa:'not_run'}))
