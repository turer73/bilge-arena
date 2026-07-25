#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Sayısal-vision fazı araç-zinciri: ÖSYM kitapçık PDF'lerinden matematik/fen sorularını
görsel-okuma ile çıkarma iş akışı.

NEDEN VISION: matematik/fen soruları şık/senaryo düzeyinde Unicode metne
ifade edilebiliyor ama PDF metin-katmanı formülleri (kesir, kök, üs, tablo)
bozuk/eksik veriyor. Sayfayı PNG'ye render edip görsel okumak tek güvenilir yol.
(PR#262 vision-pilot bulgusu: "mat/fen alınamaz" varsayımı fazla kötümsermiş.)

AKIŞ:
  1) python database/vision-extract-exam.py map <pdf>              # sayfa haritası
  2) python database/vision-extract-exam.py render <pdf> <out> 25-43,45
  3) (manuel) PNG'leri vision ile oku -> {ders}-sorular.json yaz;
     şekil-bağımlı soruları "atlanan" listesine sebebiyle ekle
  4) python database/vision-extract-exam.py verify <dizin>         # cevap-anahtarı doğrulaması
  5) python database/vision-extract-exam.py verify <dizin> --merge # katalogu güncelle

JSON SÖZLEŞMESİ (dizin içinde):
  cevap-anahtari.json : {"matematik": ["C","B",...], "fen": [...]}   (kitapçık sonu tablosu)
  {ders}-sorular.json : {"ders","sinav","yil","sorular":[{no,question,options[5],answer,answer_index}],
                         "atlanan":[{no,sebep}]}

DOĞRULAMA KAPISI (verify): resmi cevap anahtarıyla %100 uyum şartı — tek uyuşmazlıkta
katalog YAZILMAZ. Ayrıca 5-şık, answer/answer_index tutarlılığı, boş metin ve
"hiç işlenmemiş soru no" kontrolleri yapılır.

Katalog telifli-referans olduğundan gitignore'ludur (data/soru-bankasi/); yalnız
few-shot STİL referansı olarak kullanılır, prod'a soru olarak GİRMEZ.
"""
import io, json, os, sys

LETTERS = "ABCDE"
CATALOG = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..",
                       "data", "soru-bankasi", "cikmis-katalog",
                       "universite_metin_2023-2026.json")


def _rd(path):
    with io.open(path, encoding="utf-8-sig") as f:
        return json.load(f)


def cmd_map(pdf):
    import fitz
    doc = fitz.open(pdf)
    print("sayfa sayisi:", len(doc))
    for i, page in enumerate(doc):
        print("p%d: %s" % (i + 1, page.get_text().strip().replace("\n", " | ")[:110]))


def _parse_pages(spec):
    out = []
    for part in spec.split(","):
        if "-" in part:
            a, b = part.split("-")
            out.extend(range(int(a), int(b) + 1))
        else:
            out.append(int(part))
    return out


def cmd_render(pdf, outdir, spec, zoom=2.2):
    import fitz
    os.makedirs(outdir, exist_ok=True)
    doc = fitz.open(pdf)
    mat = fitz.Matrix(zoom, zoom)
    for p in _parse_pages(spec):
        pix = doc[p - 1].get_pixmap(matrix=mat)
        path = os.path.join(outdir, "p%02d.png" % p)
        pix.save(path)
        print("p%d -> %s (%dx%d)" % (p, path, pix.width, pix.height))


def cmd_verify(dirpath, merge=False, totals=None):
    totals = totals or {"matematik": 40, "fen": 20}
    key = _rd(os.path.join(dirpath, "cevap-anahtari.json"))
    problems, merged = [], {}
    for ders, total in totals.items():
        fn = os.path.join(dirpath, "%s-sorular.json" % ("mat" if ders == "matematik" else ders))
        if not os.path.exists(fn):
            problems.append("%s: %s bulunamadi" % (ders, fn))
            continue
        data = _rd(fn)
        qs, atl = data["sorular"], data.get("atlanan", [])
        nos = [q["no"] for q in qs]
        if len(nos) != len(set(nos)):
            problems.append("%s: tekrar eden soru no" % ders)
        kapsanan = set(nos) | set(a["no"] for a in atl)
        eksik = [n for n in range(1, total + 1) if n not in kapsanan]
        if eksik:
            problems.append("%s: HIC ISLENMEMIS sorular %s" % (ders, eksik))
        for q in qs:
            if len(q["options"]) != 5:
                problems.append("%s s%d: %d sik (5 olmali)" % (ders, q["no"], len(q["options"])))
            if LETTERS.index(q["answer"]) != q["answer_index"]:
                problems.append("%s s%d: answer/index tutarsiz" % (ders, q["no"]))
            resmi = key[ders][q["no"] - 1]
            if q["answer"] != resmi:
                problems.append("%s s%d: okunan=%s RESMI=%s <-- UYUSMAZLIK" % (ders, q["no"], q["answer"], resmi))
            if not q["question"].strip() or any(not o.strip() for o in q["options"]):
                problems.append("%s s%d: bos soru/sik metni" % (ders, q["no"]))
        merged[ders] = {"sorular": qs, "atlanan": atl, "sinav": data["sinav"], "yil": data["yil"]}
        print("%s: %d soru, %d atlandi (toplam %d)" % (ders, len(qs), len(atl), total))

    if problems:
        print("\n=== SORUNLAR ===")
        for p in problems:
            print(" -", p)
        print("\nKATALOG YAZILMADI.")
        return 1
    print("\nTum dogrulamalar TEMIZ (resmi cevap anahtariyla %100 uyum).")

    if merge:
        cat = _rd(CATALOG)
        for ders, m in merged.items():
            cat["sinavlar"] = [s for s in cat["sinavlar"]
                               if not (s["sinav"] == m["sinav"] and s["yil"] == m["yil"] and s["ders"] == ders)]
            cat["sinavlar"].append({
                "sinav": m["sinav"], "yil": m["yil"], "ders": ders,
                "sorular": m["sorular"], "vision_atlanan": m["atlanan"],
                "kaynak_not": "vision-okuma (PDF->PNG->model); sekil-bagimli sorular vision_atlanan'da",
            })
        cat["sinavlar"].sort(key=lambda s: (str(s["sinav"]), str(s["yil"]), str(s["ders"])))
        with io.open(CATALOG, "w", encoding="utf-8") as f:
            json.dump(cat, f, ensure_ascii=False, indent=1)
        print("KATALOG GUNCELLENDI:", os.path.normpath(CATALOG))
    return 0


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(2)
    cmd = sys.argv[1]
    if cmd == "map":
        cmd_map(sys.argv[2])
    elif cmd == "render":
        cmd_render(sys.argv[2], sys.argv[3], sys.argv[4])
    elif cmd == "verify":
        sys.exit(cmd_verify(sys.argv[2], merge="--merge" in sys.argv))
    else:
        print(__doc__)
        sys.exit(2)
