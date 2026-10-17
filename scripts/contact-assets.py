from pathlib import Path
import sys,json
from PIL import Image,ImageDraw,ImageOps
root=Path(__file__).resolve().parents[1]
p=root/'data/projects/nano-banana-cartoon-workflow-28043a87'
mode=sys.argv[1]if len(sys.argv)>1 else'images'
files=sorted((p/'assets').glob('local-*.png'))if mode=='images'else sorted((p/'exports/full-remake').glob('section-*-frame-*.jpg'))
out=p/'exports/full-remake/inspection';out.mkdir(parents=True,exist_ok=True)
for page in range(0,len(files),8):
    sheet=Image.new('RGB',(1600,1000),'#202830');d=ImageDraw.Draw(sheet)
    for j,file in enumerate(files[page:page+8]):
        im=ImageOps.contain(Image.open(file).convert('RGB'),(784,218))
        x=(j%2)*800+(800-im.width)//2;y=(j//2)*250+25
        sheet.paste(im,(x,y));d.text(((j%2)*800+12,(j//2)*250+5),file.name,fill='white')
    dest=out/f'{mode}-{page//8:02}.jpg';sheet.save(dest,quality=90);print(str(dest))
