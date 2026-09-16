"""Create compact, illustrated Russian user guides from real browser captures."""
from pathlib import Path
from PIL import Image
from reportlab.pdfgen import canvas
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import Paragraph, Table, TableStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'output/pdf'; OUT.mkdir(parents=True,exist_ok=True)
SHOTS=ROOT/'output/playwright'
pdfmetrics.registerFont(TTFont('Guide','C:/Windows/Fonts/arial.ttf'))
pdfmetrics.registerFont(TTFont('GuideBold','C:/Windows/Fonts/arialbd.ttf'))
pdfmetrics.registerFontFamily('Guide',normal='Guide',bold='GuideBold',italic='Guide',boldItalic='GuideBold')
W,H=A4
BLUE=colors.HexColor('#2854bf'); INK=colors.HexColor('#20334d'); MUTED=colors.HexColor('#52637a')
PALE=colors.HexColor('#edf3ff'); LINE=colors.HexColor('#d7e1ef'); GREEN=colors.HexColor('#eaf5ee')

class Guide:
    def __init__(self,name,role,total):
        self.c=canvas.Canvas(str(OUT/name),pagesize=A4,pageCompression=1)
        self.c.setTitle('Срез - '+role)
        self.c.setAuthor('Срез')
        self.role=role; self.total=total; self.page=0
    def p(self,text,top,x=17,width=176,size=11,leading=None,color=INK,bold=False):
        style=ParagraphStyle('text',fontName='GuideBold' if bold else 'Guide',fontSize=size,
            leading=leading or size*1.3,textColor=color,spaceAfter=0)
        item=Paragraph(text,style)
        _,height=item.wrap(width*mm,H)
        assert top+height/mm <= 270, f'Text overflow page {self.page} at {top+height/mm:.1f} mm: {text[:70]}'
        item.drawOn(self.c,x*mm,H-top*mm-height)
        return top+height/mm
    def start(self,title):
        if self.page: self.c.showPage()
        self.page+=1
        self.c.bookmarkPage(f'page-{self.page}')
        self.c.addOutlineEntry(title,f'page-{self.page}',level=0)
        self.c.setFillColor(BLUE)
        for i in range(3): self.c.rect((17+i*2.8)*mm,H-18*mm,1.7*mm,6*mm,fill=1,stroke=0)
        self.p('срез',11.5,x=27,size=15,bold=True)
        self.p(self.role.upper(),13,x=69,width=124,size=8.5,color=MUTED)
        self.c.setStrokeColor(LINE);self.c.line(17*mm,23*mm,193*mm,23*mm)
        self.c.setFont('Guide',8);self.c.setFillColor(MUTED)
        self.c.drawString(17*mm,17*mm,'На скриншотах учебные магазины и суммы')
        self.c.drawRightString(193*mm,17*mm,f'{self.page} / {self.total}')
        return self.p(title,24,size=21,bold=True)+5
    def step(self,n,text,top,width=176):
        self.c.setFillColor(BLUE);self.c.circle(20*mm,H-(top+2.8)*mm,3*mm,stroke=0,fill=1)
        self.c.setFillColor(colors.white);self.c.setFont('GuideBold',10)
        self.c.drawCentredString(20*mm,H-(top+4)*mm,str(n))
        return self.p(text,top,x=26,width=width-9,size=11)+2.6
    def note(self,text,top,kind='blue',size=10.2):
        item=Paragraph(text,ParagraphStyle('note',fontName='Guide',fontSize=size,leading=size*1.3,textColor=INK))
        _,h=item.wrap(164*mm,H); box=h+8*mm
        assert top+box/mm<=270, f'Note overflow page {self.page} at {top+box/mm:.1f}'
        self.c.setFillColor(GREEN if kind=='green' else PALE)
        self.c.roundRect(17*mm,H-top*mm-box,176*mm,box,3*mm,fill=1,stroke=0)
        item.drawOn(self.c,23*mm,H-top*mm-4*mm-h)
        return top+box/mm
    def shot(self,name,top,width=176,caption=None,points=None,maxheight=None):
        path=SHOTS/(name+'.png');iw,ih=Image.open(path).size
        height=width*ih/iw
        if maxheight and height>maxheight: height=maxheight;width=height*iw/ih
        x=(210-width)/2
        assert top+height<=270, f'Image overflow {name} page {self.page}: {top+height}'
        self.c.drawImage(str(path),x*mm,H-(top+height)*mm,width=width*mm,height=height*mm)
        self.c.setStrokeColor(LINE);self.c.setLineWidth(.5)
        self.c.rect(x*mm,H-(top+height)*mm,width*mm,height*mm,fill=0,stroke=1)
        for n,px,py in points or []:
            cx=(x+px*width/iw)*mm;cy=H-(top+py*height/ih)*mm
            self.c.setFillColor(BLUE);self.c.setStrokeColor(colors.white);self.c.setLineWidth(1.2)
            self.c.circle(cx,cy,7,fill=1,stroke=1)
            self.c.setFont('GuideBold',9);self.c.setFillColor(colors.white);self.c.drawCentredString(cx,cy-3,str(n))
        end=top+height+2
        if caption: end=self.p(caption,end,size=8.3,color=MUTED)+2
        return end
    def sub(self,text,top):return self.p(text,top,size=13,bold=True)+2
    def finish(self):
        assert self.page==self.total
        self.c.save()
