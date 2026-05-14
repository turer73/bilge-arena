/**
 * ÖSYM PDF URL listesi — TYT (Türkçe) + YDT İngilizce (wordquest)
 * Kaynak: osym.gov.tr/tr,15164/yks-cikmis-sorular.html
 * Not: FSEK kapsamında telif ÖSYM'ye aittir. Sadece private referans/şablon amaçlı.
 */

export const OSYM_PDFS = [
  // ─── TYT (Tüm dersler — Türkçe bölümü parse edilecek) ───
  {
    year: 2018, exam: 'TYT', lang: 'tr',
    url: 'https://dokuman.osym.gov.tr/pdfdokuman/2018/YKS/TYT_01072018.pdf',
    filename: 'tyt_2018.pdf',
  },
  {
    year: 2019, exam: 'TYT', lang: 'tr',
    url: 'https://dokuman.osym.gov.tr/pdfdokuman/2019/YKS/TSK/tyt_yks_2019_web.pdf',
    filename: 'tyt_2019.pdf',
  },
  {
    year: 2020, exam: 'TYT', lang: 'tr',
    url: 'https://dokuman.osym.gov.tr/pdfdokuman/2020/YKS/TSK/tyt_yks_2020.pdf',
    filename: 'tyt_2020.pdf',
  },
  {
    year: 2021, exam: 'TYT', lang: 'tr',
    url: 'https://dokuman.osym.gov.tr/pdfdokuman/2021/YKS/TSK/tyt_yks_2021.pdf',
    filename: 'tyt_2021.pdf',
  },

  // ─── YDT İngilizce (wordquest few-shot şablonu) ───
  {
    year: 2018, exam: 'YDT', lang: 'en',
    url: 'https://dokuman.osym.gov.tr/pdfdokuman/2018/YKS/YDTING01072018.pdf',
    filename: 'ydt_ingilizce_2018.pdf',
  },
  {
    year: 2019, exam: 'YDT', lang: 'en',
    url: 'https://dokuman.osym.gov.tr/pdfdokuman/2019/YKS/TSK/ydt_ingilizce_yks_2019_web.pdf',
    filename: 'ydt_ingilizce_2019.pdf',
  },
  {
    year: 2020, exam: 'YDT', lang: 'en',
    url: 'https://dokuman.osym.gov.tr/pdfdokuman/2020/YKS/TSK/ydt_ingilizce_yks_2020.pdf',
    filename: 'ydt_ingilizce_2020.pdf',
  },
  {
    year: 2021, exam: 'YDT', lang: 'en',
    url: 'https://dokuman.osym.gov.tr/pdfdokuman/2021/YKS/TSK/ydt_ingilizce_yks_2021.pdf',
    filename: 'ydt_ingilizce_2021.pdf',
  },
]
