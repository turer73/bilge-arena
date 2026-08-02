#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Çıkmış-sınav katalogundan ders bazlı STİL İSTATİSTİĞİ çıkarır.

Amaç: REF_2026_STYLE (src/lib/admin/question-content-guard.mjs) metinlerini
tahmine değil ÖLÇÜME dayandırmak. Çıktı jeneriktir (birebir soru yok) —
telif-güvenli, prompt'a girmeye uygun.

Kapsam: yalnız ÜNİVERSİTE katalogu (TYT + AYT, 5 şıklı). LGS (lise_metin_*.json)
bilerek DIŞARIDA — 4 şıklı ayrı sınav, cevap-dağılımı/şık istatistiği karışır.

Katalog büyüdüğünde bu script yeniden koşulmalı ve REF_2026_STYLE metinleri
güncellenmelidir; metindeki "N-soru analizi" etiketi örneklemi belgeler.

  python database/analyze-catalog-style.py [ders ...]     # varsayılan: matematik fen
"""
import io, json, os, re, sys
from collections import Counter

CATALOG = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..",
                       "data", "soru-bankasi", "cikmis-katalog",
                       "universite_metin_2023-2026.json")

# Soru-kökü kalıpları: (etiket, regex)
STEMS = [
    ("olumsuz-kok (hangisi olamaz/yanlistir/soylenemez/yapilamaz)",
     r"(olamaz|yanl[ıi][şs]t[ıi]r|s[öo]ylenemez|yap[ıi]lamaz|de[ğg]ildir|bulunmamaktad[ıi]r|beklenmez)\s*\?"),
    ("oncullu (I/II/III + hangileri)", r"\bI+\s*\.|hangileri"),
    ("kac-tir (sayisal sonuc)", r"ka[çc]t[ıi]r\s*\?|ka[çc]\s+\w+['’]?d[ıi]r\s*\?|ka[çc]\s+\w+\s*\?"),
    ("dogru-olan (hangisi dogrudur/olabilir)", r"(do[ğg]rudur|olabilir|do[ğg]ru verilmi[şs]tir)\s*\?"),
    ("buna-gore baglaci", r"Buna g[öo]re"),
]

# Senaryo/bağlam sinyali: özel isim + günlük-hayat fiilleri
SCENARIO = re.compile(
    r"\b(bir|birer)\s+(ma[ğg]aza|market|kafe|okul|s[ıi]n[ıi]f|fabrika|[şs]irket|turnuva|"
    r"sergi|klas[öo]r|otoyol|nehir|tren|merdiven|kutu|kasa|paket|tabl[oa]|banka|"
    r"bilgisayar|yaz[ıi]c[ıi]|telefon|buzdolab|deney|laboratuvar)", re.I)
PERSON = re.compile(r"\b(Ahmet|Mehmet|Ali|Ay[şs]e|Selma|Sena|Duru|Merve|Elif|Can|Burcu|G[öo]kay|"
                    r"Erman|G[öo]rkem|Kerem|M[üu]ge|[İIi]lkay|[ÖO]zge|Pelin|Altay|Ahsen|Sevilay|"
                    r"Atlas|Melike|Sude|Beyza|Hayri|K[âa]mil|Mert|Bora|Zeynep|Efe|Ate[şs])\b")
TABLE = re.compile(r"tablo|[çc]izelge|grafik|liste|kay[ıi]t", re.I)


def rd(p):
    with io.open(p, encoding="utf-8-sig") as f:
        return json.load(f)


def analyze(rows, atlanan, ders):
    n = len(rows)
    if not n:
        return None
    opt_lens, ans, stem_hits = [], Counter(), Counter()
    scen = tablo = oncul = 0
    for q in rows:
        opts = q.get("options", [])
        opt_lens.extend(len(o) for o in opts)
        ans[q.get("answer_index")] += 1
        text = q.get("question", "")
        for label, pat in STEMS:
            if re.search(pat, text, re.I):
                stem_hits[label] += 1
        if SCENARIO.search(text) or PERSON.search(text):
            scen += 1
        if TABLE.search(text):
            tablo += 1
        if re.search(r"\bI+\s*\.", text) and re.search(r"hangileri", text, re.I):
            oncul += 1

    toplam_slot = n + len(atlanan)
    print("=== %s ===" % ders.upper())
    print("islenen: %d | sekil-bagimli atlanan: %d | kitapciklardaki toplam: %d (%.0f%% metne-ifade-edilebilir)"
          % (n, len(atlanan), toplam_slot, 100.0 * n / toplam_slot))
    print("ortalama sik uzunlugu: %.0f karakter (min %d, max %d)"
          % (sum(opt_lens) / len(opt_lens), min(opt_lens), max(opt_lens)))
    print("senaryo/kisi-adi iceren: %d (%.0f%%) | tablo-liste-kayit atifli: %d (%.0f%%) | I/II/III onculu: %d (%.0f%%)"
          % (scen, 100.0 * scen / n, tablo, 100.0 * tablo / n, oncul, 100.0 * oncul / n))
    print("cevap dagilimi (A-E): %s"
          % ", ".join("%s=%d" % ("ABCDE"[i], ans.get(i, 0)) for i in range(5)))
    print("soru-koku kaliplari:")
    for label, _ in STEMS:
        c = stem_hits.get(label, 0)
        print("   %-52s %3d (%.0f%%)" % (label, c, 100.0 * c / n))
    # atlama sebep-ozeti
    sebepler = Counter()
    for a in atlanan:
        s = a.get("sebep", "")
        key = "grafik" if "grafik" in s else ("sekil" if "sekil" in s or "şekil" in s else "diger")
        sebepler[key] += 1
    if atlanan:
        print("atlama sebepleri: %s" % dict(sebepler))
    print("")


if __name__ == "__main__":
    dersler = sys.argv[1:] or ["matematik", "fen"]
    cat = rd(CATALOG)
    for ders in dersler:
        rows, atl = [], []
        kaynaklar = []
        for s in cat["sinavlar"]:
            if s["ders"] != ders:
                continue
            rows.extend(s["sorular"])
            atl.extend(s.get("vision_atlanan", []))
            kaynaklar.append("%s-%s" % (s["sinav"], s["yil"]))
        print("kaynak: %s" % ", ".join(sorted(kaynaklar)))
        analyze(rows, atl, ders)
