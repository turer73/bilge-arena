# -*- coding: utf-8 -*-
"""
Çıkmış-soru katalog kurucu (few-shot referans, IP-güvenli birebir-kopya-değil).

Downloads/2026/üniversite/*.pdf (yks_tyt/ayt/ydt_YYYY) → yapılandırılmış katalog JSON.
Metin-dersleri parse eder (Türkçe/Sosyal/Edebiyat/İngilizce); matematik/fen sayısal
görsel-ağırlıklı → few-shot-metin önceliğiyle bu sürümde atlanır (ayrı vision-fazı).

Çıktı: cikmis-katalog/universite_metin_2023-2026.json
"""
import re, json, subprocess, glob, os

PDF_DIR = r"C:\Users\sevdi\Downloads\2026\üniversite"
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "soru-bankasi", "cikmis-katalog", "universite_metin_2023-2026.json")

# Sınav → metin-testleri (parse edilecek) + test-başlık desenleri
EXAM_TESTS = {
    "TYT": [("TÜRKÇE TESTİ", "turkce"), ("SOSYAL BİLİMLER TESTİ", "sosyal")],
    "AYT": [("TÜRK DİLİ VE EDEBİYATI", "edebiyat"), ("SOSYAL BİLİMLER-2 TESTİ", "sosyal2")],
    "YDT": [("YABANCI DİL TESTİ", "ingilizce"), ("İNGİLİZCE", "ingilizce")],
}
# Cevap-anahtarında test-ayırıcı başlıklar (TYT/AYT'de dersli, YDT düz-liste)
# NOT: "SOSYAL BİLİMLER-1 TESTİ" bilerek YOK — AYT'de edebiyat ile birleşik başlıklı
# ("TÜRK DİLİ VE EDEBİYATI-SOSYAL BİLİMLER-1 TESTİ"); ayırıcı olarak eklenirse edebiyatı
# hemen keser. Edebiyat+sos1 birlikte SOSYAL BİLİMLER-2'ye kadar parse edilir.
ALL_TEST_HEADERS = ["TÜRKÇE TESTİ", "SOSYAL BİLİMLER TESTİ", "TEMEL MATEMATİK TESTİ",
    "FEN BİLİMLERİ TESTİ", "TÜRK DİLİ VE EDEBİYATI",
    "SOSYAL BİLİMLER-2 TESTİ", "MATEMATİK TESTİ"]
ANS = {"A": 0, "B": 1, "C": 2, "D": 3, "E": 4}


def pdftext(pdf, f=None, l=None):
    cmd = ["pdftotext", "-enc", "UTF-8"]
    if f: cmd += ["-f", str(f), "-l", str(l or f)]
    cmd += [pdf, "-"]
    return subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8").stdout or ""


def page_count(pdf):
    try:
        import fitz
        return fitz.open(pdf).page_count
    except Exception:
        return 60


def clean(t):
    out = []
    for ln in t.split("\n"):
        s = ln.strip()
        if not s or s.startswith("Ö Bu soru") or ("izni" in s and "ÖSYM" in s):
            continue
        if re.match(r"^(20\d\d)[- ](TYT|AYT|YDT|YKS)", s) or re.match(r"^\d{2}[-.]\d{2}[-.]20\d\d", s):
            continue
        out.append(s)
    return "\n".join(out)


def parse_block(raw, keymap):
    qs = []
    for b in re.split(r"(?=(?:^|\n)\s*\d+\.\s)", raw):
        m = re.match(r"\s*(\d+)\.\s(.*)", b, re.S)
        if not m:
            continue
        num = int(m.group(1))
        opts = re.split(r"\s(?=[A-E]\)\s)", m.group(2))
        if len(opts) < 6:
            continue
        stem = re.sub(r"\s+", " ", opts[0]).strip()
        options = [re.sub(r"^[A-E]\)\s", "", re.sub(r"\s+", " ", o).strip()) for o in opts[1:6]]
        if len(options) == 5 and 10 <= len(stem) <= 2000:
            qs.append({"no": num, "question": stem, "options": options, "answer": keymap.get(num)})
    return qs


def find_answer_page(pdf, n):
    for p in range(n, max(1, n - 5), -1):
        t = pdftext(pdf, p, p)
        if re.search(r"\d+\.\s*[A-E]\b", t) and t.count(")") < 20:  # cevap-anahtarı: "1. A" yoğun
            return t
    return ""


def key_by_tests(keytxt, testnames):
    # dersli cevap-anahtarı (TYT/AYT): test-başlığına göre böl
    hdrs = [h for h in ALL_TEST_HEADERS if h in keytxt] or testnames
    parts = re.split("(" + "|".join(re.escape(h) for h in hdrs) + ")", keytxt)
    out = {}
    for i in range(1, len(parts), 2):
        body = parts[i + 1] if i + 1 < len(parts) else ""
        out[parts[i]] = {int(n): a for n, a in re.findall(r"(\d+)\.\s*([A-E])\b", body)}
    return out


catalog = {"meta": {"source": "YKS 2023-2026 gerçek sınav (ÖSYM) — few-shot STİL referansı, birebir-kopya-DEĞİL, IP-güvenli, prod'a-girmez"}, "sinavlar": []}

for pdf in sorted(glob.glob(os.path.join(PDF_DIR, "*.pdf"))):
    fn = os.path.basename(pdf)
    m = re.search(r"(tyt|ayt|ydt)_?(?:ing_)?(20\d\d)", fn, re.I)
    if not m:
        continue
    exam = m.group(1).upper()
    year = m.group(2)
    n = page_count(pdf)
    full = clean(pdftext(pdf))
    keytxt = find_answer_page(pdf, n)
    tests = EXAM_TESTS.get(exam, [])

    if exam == "YDT":
        # tek test, düz cevap-listesi
        key = {int(x): a for x, a in re.findall(r"(\d+)\.\s*([A-E])\b", keytxt)}
        body = re.split(r"YABANCI DİL TESTİ|İNGİLİZCE", full, maxsplit=1)
        seg = body[-1] if len(body) > 1 else full
        qs = parse_block(seg, key)
        for q in qs:
            q["answer_index"] = ANS.get(q.get("answer"))
        catalog["sinavlar"].append({"yil": year, "sinav": exam, "ders": "ingilizce", "soru_sayisi": len(qs), "sorular": qs})
    else:
        keymap = key_by_tests(keytxt, [t[0] for t in tests])
        # metin-testlerini gövdeden ayır
        headers = [t[0] for t in tests]
        for hdr, ders in tests:
            if hdr not in full:
                continue
            # bu test başlığından sonraki bir sonraki-test başlığına kadar
            after = full.split(hdr, 1)[1]
            nxt = [h for h in ALL_TEST_HEADERS if h in after and h != hdr]
            end = min((after.index(h) for h in nxt), default=len(after))
            seg = after[:end]
            key = keymap.get(hdr, {})
            qs = parse_block(seg, key)
            for q in qs:
                q["answer_index"] = ANS.get(q.get("answer"))
            catalog["sinavlar"].append({"yil": year, "sinav": exam, "ders": ders, "soru_sayisi": len(qs), "sorular": qs})

# özet
total = sum(s["soru_sayisi"] for s in catalog["sinavlar"])
by = {}
for s in catalog["sinavlar"]:
    k = f"{s['sinav']}-{s['ders']}"
    by[k] = by.get(k, 0) + s["soru_sayisi"]
print(f"Toplam katalog sorusu: {total} | sınav-seti: {len(catalog['sinavlar'])}")
for s in catalog["sinavlar"]:
    withans = sum(1 for q in s["sorular"] if q.get("answer"))
    print(f"  {s['yil']} {s['sinav']}/{s['ders']}: {s['soru_sayisi']} soru ({withans} cevaplı)")
print("kategori-toplam:", json.dumps(by, ensure_ascii=False))

json.dump(catalog, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("->", OUT)
