# Bilge Arena

Bilge Arena, YKS ve LGS hazırlığı için oyun ve çalışma akışları sunan bir öğrenme platformudur. Canlı site: [bilgearena.com](https://bilgearena.com).

Bu depo uygulama kodunu, veritabanı migration'larını, testleri ve operasyon belgelerini içerir. Bir oyunun arayüzde görünmesi, ilgili soru havuzunun kalite incelemesinin veya yayın onayının tamamlandığı anlamına gelmez; içerik kabulü ayrı bir süreçtir.

## Teknoloji

- Node.js 22, Next.js 16 App Router, React 19, TypeScript ve Tailwind CSS 4
- Supabase Auth/Postgres; sunucu tarafında ayrılmış service-role erişimi
- Vercel dağıtımı, Vitest ve Playwright doğrulaması

Sürüm ve komutların güncel kaynağı [package.json](package.json) dosyasıdır.

## Yerel geliştirme

```bash
npm ci
npm run dev
```

`npm run dev` varsayılan olarak `http://localhost:3000` adresini açar. Ortam değişkenleri için [.env.example](.env.example) dosyasını temel alıp kişisel `.env.local` dosyanızı oluşturun; gerçek anahtarları Git'e eklemeyin. Supabase service-role anahtarı veya Redis ayarı bulunmayan yerel ortamda bazı arka plan, sıralama ve yönetim API'leri güvenli biçimde hata dönebilir. Bu, tam uçtan uca kabul testi yerine geçmez.

```bash
npm run lint
npm run type-check
npm test
npm run build
npm run test:e2e
```

Veritabanı migration ve soru havuzu işlemlerini üretim verisine karşı rutin kurulum adımı olarak çalıştırmayın. Bunlar ayrı erişim, inceleme ve yayın prosedürleri gerektirir.

## Depo haritası

| Yol | İçerik |
| --- | --- |
| `src/app/` | Sayfalar, layout'lar ve API route'ları |
| `src/components/` | Arayüz bileşenleri |
| `src/lib/` | Uygulama kuralları ve servis yardımcıları |
| `database/` | Migration'lar, testler ve bakım araçları |
| `docs/` | Tasarım, güvenlik ve operasyon belgeleri |
| `e2e/` | Tarayıcı senaryoları |

Kodun, CI'ın, önizleme dağıtımının, üretim dağıtımının ve gerçek kullanıcı/cihaz kabulünün ayrı doğrulama aşamaları olduğunu gözetin. Yayın durumunu eski yol haritalarından veya sabit soru sayılarından çıkarmayın.

## Lisans

Bu depodaki kod **GNU Affero General Public License v3.0** (`AGPL-3.0-only`) ile lisanslanmıştır. Tam metin: [LICENSE](LICENSE).

Kodu kullanabilir, değiştirebilir ve dağıtabilirsiniz. Değiştirilmiş bir sürümü dağıtırsanız veya ağ üzerinden hizmet olarak sunarsanız, kaynak kodunu aynı lisansla açmanız gerekir. Üçüncü taraf bağımlılıklar ve `vendor/` benzeri dizinlerdeki bileşenler kendi lisanslarıyla gelir.

Telif hakkı (c) 2026 turer73.
