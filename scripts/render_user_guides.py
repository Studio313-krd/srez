from pathlib import Path
import pymupdf as fitz
root=Path(__file__).resolve().parents[1]
out=root/'tmp/pdfs';out.mkdir(parents=True,exist_ok=True)
for path in (root/'output/pdf').glob('Srez_*.pdf'):
    pdf=fitz.open(path)
    for i,page in enumerate(pdf):
        page.get_pixmap(matrix=fitz.Matrix(1.6,1.6)).save(out/f'{path.stem}-{i+1}.png')
    print(path.name, 'pages:',len(pdf), 'text characters:',sum(len(p.get_text()) for p in pdf))
