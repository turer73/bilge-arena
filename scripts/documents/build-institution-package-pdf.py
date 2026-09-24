from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from pathlib import Path

root = Path(__file__).resolve().parents[2]
out = root / "public" / "documents" / "bilge-arena-kurum-paketleri-v1.pdf"
out.parent.mkdir(parents=True, exist_ok=True)
font = r"C:\Windows\Fonts\arial.ttf"
bold = r"C:\Windows\Fonts\arialbd.ttf"
pdfmetrics.registerFont(TTFont("Arial", font))
pdfmetrics.registerFont(TTFont("Arial-Bold", bold))
styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name="TitleBA", fontName="Arial-Bold", fontSize=18, leading=22, textColor=colors.HexColor("#111827"), alignment=TA_CENTER, spaceAfter=12))
styles.add(ParagraphStyle(name="SubBA", fontName="Arial", fontSize=9, leading=12, textColor=colors.HexColor("#4B5563"), alignment=TA_CENTER, spaceAfter=10))
styles.add(ParagraphStyle(name="H1BA", fontName="Arial-Bold", fontSize=13, leading=16, textColor=colors.black, spaceBefore=5, spaceAfter=2))
styles.add(ParagraphStyle(name="H2BA", fontName="Arial-Bold", fontSize=10, leading=12, textColor=colors.black, spaceBefore=5, spaceAfter=2))
styles.add(ParagraphStyle(name="BodyBA", fontName="Arial", fontSize=10, leading=15, textColor=colors.HexColor("#1F2937"), spaceAfter=6))
styles.add(ParagraphStyle(name="BulletBA", fontName="Arial", fontSize=8, leading=10.5, leftIndent=14, firstLineIndent=-8, spaceAfter=2))

def footer(canvas, doc):
    canvas.saveState()
    canvas.setFont("Arial", 8)
    canvas.setFillColor(colors.HexColor("#6B7280"))
    canvas.drawString(45, 25, "Bilge Arena Kurum Paketleri - Sürüm 1.0")
    canvas.drawRightString(A4[0]-45, 25, f"Sayfa {doc.page}")
    canvas.restoreState()

story = [
 Paragraph("Bilge Arena Kurum Paketleri", styles["TitleBA"]),
 Paragraph("Dershaneler için pilot ve kurumsal kullanım özeti", styles["SubBA"]),
 Paragraph("Bu belge Bilge Arena'nın sağlayacaklarını, kurumdan beklenenleri ve pilot kullanım şartlarını kısa biçimde açıklar. Nihai sözleşme ve kişisel veri metinleri imza öncesinde hukuk danışmanı tarafından kontrol edilmelidir.", styles["BodyBA"]),
]

packages = [
 ("Paket 1 Başlangıç Pilotu", ["30 gün kullanım", "En fazla 30 öğrenci", "Bir kurum yöneticisi ve bir öğretmen hesabı", "Kuruma özel alan, günlük planlar, sınıf ve öğrenci takibi", "Başlangıç eğitimi, teknik destek ve pilot sonu özeti"], ["Kurum ve yetkili bilgileri", "Doğrulanmış yönetici hesabı", "Pilot protokolü ve veri işleme eki onayı", "Öğrenci ve veli bilgilendirmesi", "Pilot grubu ve sonuç geri bildirimi"]),
 ("Paket 2 Gelişim Pilotu", ["60 gün kullanım", "En fazla 40 öğrenci", "Bir kurum yöneticisi ve bir öğretmen hesabı", "Haftalık gelişim değerlendirmesi ve öğrenci programları", "Kazanım takibi ve ayrıntılı sonuç raporu"], ["Pilot sorumlusu yönetici ve öğretmen", "Öğrenci grubunun belirlenmesi", "Öğrenci ve veli bilgilendirmesi", "Haftalık kullanım kontrolü", "Pilot ortası ve sonu geri bildirimi"]),
 ("Paket 3 Kurumsal Kullanım", ["6 veya 12 aylık kullanım", "Sözleşmede belirlenen kapasite", "Birden fazla sınıf ve öğretmen", "Yönetici paneli ve gelişim raporları", "Teknik destek ve periyodik değerlendirme"], ["Öğrenci ve personel sayısı", "Kurum sorumluları", "Ticari sözleşme ve veri işleme eki", "Öğrenci bilgilendirmesi", "Düzenli öğretmen kullanımı"]),
]
for title, gives, asks in packages:
    story.append(Paragraph(title, styles["H1BA"]))
    story.append(Paragraph("Bilge Arena'nın verecekleri", styles["H2BA"]))
    for item in gives: story.append(Paragraph("• " + item, styles["BulletBA"]))
    story.append(Paragraph("Kurumdan istenenler", styles["H2BA"]))
    for item in asks: story.append(Paragraph("• " + item, styles["BulletBA"]))

story += [PageBreak(), Paragraph("Kısa Pilot Kullanım Şartları", styles["H1BA"])]
terms = [
 ("Amaç ve süre", "Pilot seçilen paket, başlangıç ve bitiş tarihleri üzerinden yürütülür. Amaç kullanım kolaylığı, öğretmen takibi ve öğrenci gelişimine katkının değerlendirilmesidir. Pilot sınav sonucu veya kesin öğrenme başarısı garantisi vermez."),
 ("Bilge Arena'nın sorumlulukları", "Bilge Arena kuruma özel alanı açar, kapasiteyi sağlar, erişimleri tanımlar, başlangıç desteği verir ve kurum verilerini diğer kurumların erişimine kapalı tutar."),
 ("Kurumun sorumlulukları", "Kurum kullanıcı grubunu belirler, bilgilerin doğruluğunu sağlar, öğrenci ve velileri bilgilendirir, hesapların paylaşılmasını engeller ve sisteme sağlık veya psikolojik durum gibi özel nitelikli bilgiler girmez."),
 ("Kişisel veriler", "Taraflar yalnız hizmet için gerekli verileri kullanır. Öğrenci ve veli aydınlatma metni ayrı sunulur. Açık rıza gereken bir işlem varsa açık rıza ayrıca alınır."),
 ("Pilot sonu ve güvenlik", "Kurum devam, hesapları kapatma veya verilerin yasal zorunluluklar dışında silinmesi seçeneklerinden birini belirler. Güvenlik veya sözleşmeye aykırılık durumunda pilot erken sonlandırılabilir."),
]
for h, b in terms:
    story.append(Paragraph(h, styles["H2BA"]))
    story.append(Paragraph(b, styles["BodyBA"]))

story.append(Spacer(1, 12))
story.append(Paragraph("Kurum Onay Alanı", styles["H1BA"]))
for label in ["Kurum adı", "Kurum yetkilisi", "Seçilen paket", "Başlangıç tarihi", "Bitiş tarihi", "Bilge Arena yetkilisi", "Kurum yetkilisi imza", "Bilge Arena yetkilisi imza"]:
    story.append(Paragraph(f"<b>{label}:</b> ______________________________________________", styles["BodyBA"]))

doc = SimpleDocTemplate(str(out), pagesize=A4, rightMargin=45, leftMargin=45, topMargin=30, bottomMargin=36, title="Bilge Arena Kurum Paketleri", author="Bilge Arena")
doc.build(story, onFirstPage=footer, onLaterPages=footer)
print(out)




