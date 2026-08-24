# GitHub depo güvenlik kontrolleri

Bu belge GitHub üzerinde uygulanan, fakat yalnızca Git geçmişinden görülemeyen
depo kontrollerinin kaynak-kod karşılığını tanımlar.

## `master` ruleset

`github-master-ruleset.json`, `master` dalı için uygulanacak ruleset gövdesidir.
Ruleset doğrudan push'u, dal silmeyi ve force-push'u engeller; PR, güncel dal ve
tanımlı CI/güvenlik kontrollerinin geçmesini zorunlu kılar.

Depo şu anda tek sahibin yönettiği kişisel bir depodur. PR yazarı kendi PR'ını
onaylayamayacağı için onay sayısı `0`, code-owner onayı ise bilerek zorunlu
değildir. CODEOWNERS yine otomatik sahip ataması ve hassas yüzeylerin görünür
olması için tutulur. İkinci yetkili incelemeci eklendiğinde bu iki parametre
ayrı bir güvenlik değişikliğiyle yükseltilmelidir.

Ruleset'i uygulama:

```powershell
gh api --method POST repos/turer73/bilge-arena/rulesets `
  --input docs/security/github-master-ruleset.json
```

Uzak durum doğrulaması:

```powershell
gh api repos/turer73/bilge-arena/rulesets
gh api repos/turer73/bilge-arena --jq '.security_and_analysis'
gh api repos/turer73/bilge-arena/code-scanning/alerts
gh api repos/turer73/bilge-arena/secret-scanning/alerts
gh api repos/turer73/bilge-arena/dependabot/alerts
```

Ruleset JSON'unun depoda bulunması tek başına korumanın etkin olduğunu kanıtlamaz;
release kapanışında GitHub API çıktısı ayrıca kaydedilmelidir.
