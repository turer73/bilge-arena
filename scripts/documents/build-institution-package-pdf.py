from pathlib import Path
import re

import reportlab
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import PageBreak, Paragraph, SimpleDocTemplate, Spacer

root = Path(__file__).resolve().parents[2]
source = root / "docs" / "institution" / "bilge-arena-kurum-paketleri-v1.md"
out = root / "public" / "documents" / "bilge-arena-kurum-paketleri-v1.pdf"
out.parent.mkdir(parents=True, exist_ok=True)


def first_existing(paths):
    for path in paths:
        if path.exists():
            return path
    raise FileNotFoundError("PDF için Unicode yazı tipi bulunamadı")


reportlab_fonts = Path(reportlab.__file__).resolve().parent / "fonts"
regular = first_existing([
    Path("C:/Windows/Fonts/arial.ttf"),
    Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
    reportlab_fonts / "Vera.ttf",
])
bold = first_existing([
    Path("C:/Windows/Fonts/arialbd.ttf"),
    Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"),
    reportlab_fonts / "VeraBd.ttf",
])
pdfmetrics.registerFont(TTFont("BA-Regular", str(regular)))
pdfmetrics.registerFont(TTFont("BA-Bold", str(bold)))

styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name="TitleBA", fontName="BA-Bold", fontSize=18, leading=22, textColor=colors.HexColor("#111827"), alignment=TA_CENTER, spaceAfter=12))
styles.add(ParagraphStyle(name="SubBA", fontName="BA-Regular", fontSize=9, leading=12, textColor=colors.HexColor("#4B5563"), alignment=TA_CENTER, spaceAfter=10))
styles.add(ParagraphStyle(name="H1BA", fontName="BA-Bold", fontSize=13, leading=16, spaceBefore=5, spaceAfter=3))
styles.add(ParagraphStyle(name="BodyBA", fontName="BA-Regular", fontSize=9, leading=13, textColor=colors.HexColor("#1F2937"), spaceAfter=6))
styles.add(ParagraphStyle(name="BulletBA", fontName="BA-Regular", fontSize=9, leading=12, leftIndent=14, firstLineIndent=-8, spaceAfter=3))


def footer(canvas, doc):
    canvas.saveState()
    canvas.setFont("BA-Regular", 8)
    canvas.setFillColor(colors.HexColor("#6B7280"))
    canvas.drawString(45, 25, "Bilge Arena Kurum Paketleri - Sürüm 1.0")
    canvas.drawRightString(A4[0] - 45, 25, f"Sayfa {doc.page}")
    canvas.restoreState()


def inline(text):
    return re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", text)


story = []
for raw in source.read_text(encoding="utf-8").splitlines():
    line = raw.strip()
    if not line:
        continue
    if line.startswith("# "):
        story.append(Paragraph(inline(line[2:]), styles["TitleBA"]))
    elif line.startswith("## "):
        heading = line[3:]
        if heading == "Kısa Pilot Kullanım Şartları":
            story.append(PageBreak())
        story.append(Paragraph(inline(heading), styles["H1BA"]))
    elif line.startswith("- "):
        story.append(Paragraph("• " + inline(line[2:]), styles["BulletBA"]))
    elif line.startswith("Sürüm:"):
        story.append(Paragraph(inline(line), styles["SubBA"]))
    else:
        story.append(Paragraph(inline(line), styles["BodyBA"]))

story.insert(-8, Spacer(1, 8))
doc = SimpleDocTemplate(str(out), pagesize=A4, rightMargin=45, leftMargin=45, topMargin=30, bottomMargin=36, title="Bilge Arena Kurum Paketleri", author="Bilge Arena")
doc.build(story, onFirstPage=footer, onLaterPages=footer)
print(out)
