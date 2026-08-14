# Bilge Arena Kurumsal sentetik demo

Demo gerçek kullanıcı veya production verisi oluşturmaz. Yalnız environment flag açıkken `/arena/kurum/demo` adresinde dört sentetik öğrenciyle çalışır; kapalıyken rota 404 döner.

PowerShell ile yerel başlatma:

```powershell
$env:INSTITUTION_DEMO_ENABLED='true'
npm.cmd run dev
```

Ardından `http://localhost:3000/arena/kurum/demo` açılır. “Sede Dilara Ürer” burada yalnız sentetik görünen addır. Takip, program ve rapor düğmeleri veritabanına yazmaz; sayfa yenilenince sıfırlanır.

Gerçek pilot smoke bundan ayrıdır. Migration 114–124 yalnız açıkça disposable olduğu onaylanan localhost `bilge_inst_test_*` veritabanında veya ayrıca onaylanmış hedef Supabase projesinde denenmelidir.
