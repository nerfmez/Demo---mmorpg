"""Cut supplied transparent batches into review icons; no background removal/repainting."""
import hashlib
import json
import shutil
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy.ndimage import label, distance_transform_edt

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
AUDIT = json.loads((HERE / 'mapping.json').read_text())
OUT = HERE / 'candidate-icons'
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
THAI = '/usr/share/fonts/truetype/noto/NotoSansThai-Regular.ttf'
def digest(f):
    return hashlib.sha256(f.read_bytes()).hexdigest()

records = []
def split_sheet(filename, kind, ids, columns, rows, size, extent):
    path = HERE / 'sheets' / filename
    im = Image.open(path).convert('RGBA')
    pixels = np.array(im)
    alpha = pixels[:, :, 3]
    parts, count = label(alpha > 8)
    areas = np.bincount(parts.ravel())
    primary = [i for i in range(1,count+1) if areas[i] > 20000]
    if len(ids) == 1:
        primary = [max(primary, key=lambda i: areas[i])]
    assert len(primary) == len(ids), (filename, len(primary))
    seeds = np.zeros(alpha.shape, dtype=np.int16)
    by_cell = {}
    for i in primary:
        ys, xs = np.where(parts == i)
        cell = (int(ys.mean() // (im.height/rows)), int(xs.mean() // (im.width/columns)))
        assert cell not in by_cell
        by_cell[cell] = i
        seeds[parts == i] = i
    _, nearest = distance_transform_edt(seeds == 0, return_indices=True)
    nearest_seed = seeds[tuple(nearest)]
    # Assign whole detached painted components (flame curls, droplets) together.
    ownership = nearest_seed.copy()
    for i in range(1,count+1):
        if i in primary:
            continue
        mask = parts == i
        owner = int(np.argmax(np.bincount(nearest_seed[mask])))
        ownership[mask] = owner
    for n, key in enumerate(ids):
        cell = (n // columns, n % columns)
        owner = by_cell[cell]
        isolated = pixels.copy()
        isolated[ownership != owner] = 0
        isolated[isolated[:,:,3] == 0] = 0
        cut = Image.fromarray(isolated)
        bounds = cut.getbbox()
        assert bounds
        cut = cut.crop(bounds)
        cut.thumbnail((extent, extent), Image.Resampling.LANCZOS)
        icon = Image.new('RGBA',(size,size))
        icon.alpha_composite(cut, ((size-cut.width)//2,(size-cut.height)//2))
        dest = OUT / kind / (key+'.png')
        dest.parent.mkdir(parents=True,exist_ok=True)
        icon.save(dest,optimize=True)
        arr = np.array(icon)
        assert not (arr[:8,:,3].any() or arr[-8:,:,3].any() or arr[:,:8,3].any() or arr[:,-8:,3].any())
        records.append(dict(kind=kind,id=key,status='candidate, owner review pending',
            source_sheet='sheets/'+filename,source_sha256=digest(path),source_bounds=list(bounds),
            row=cell[0]+1,column=cell[1]+1,path=str(dest.relative_to(HERE)),sha256=digest(dest),
            dimensions=[size,size],alpha_extrema=list(icon.getextrema()[3]),
            alpha_bounds=list(icon.getbbox()),alpha_clear=int((arr[:,:,3]==0).sum()),
            alpha_partial=int(((arr[:,:,3]>0)&(arr[:,:,3]<255)).sum()),
            original_transparency_preserved=True))

split_sheet('portraits-candidate.png','monster',[v['id'] for v in AUDIT['monsters']],3,2,256,232)
split_sheet('materials-candidate.png','material',['viper_scale','wisp_core'],2,1,512,456)
# Keep the other five batch crops unchanged; only the wisp correction is used.
initial = next(v for v in records if v['id'] == 'marsh_wisp')
records.remove(initial)
split_sheet('wisp-correction.png','monster',['marsh_wisp'],1,1,256,232)
records[-1]['superseded_source'] = {k: initial[k] for k in ['source_sheet','source_sha256','source_bounds','sha256']}
records[-1]['correction'] = 'Removed the extra gold-containing detached flame; the final wisp has one golden torso core and blue-only motes.'
for v in AUDIT['materials']:
    if v['artwork'] == 'candidate':
        continue
    src = ROOT / v['current_path']
    dest = OUT / 'material' / (v['id']+'.png')
    shutil.copy2(src,dest)
    assert digest(src) == digest(dest) == v['current_sha256']
    im = Image.open(dest).convert('RGBA')
    records.append(dict(kind='material',id=v['id'],status='reuse approved bytes',
        source_path=v['current_path'],source_library_file_id=v['source_library_file_id'],
        path=str(dest.relative_to(HERE)),sha256=digest(dest),dimensions=list(im.size),
        alpha_extrema=list(im.getextrema()[3]),alpha_bounds=list(im.getbbox())))

(HERE/'candidate-manifest.json').write_text(json.dumps(dict(main_sha=AUDIT['main_sha'],
    pr106_sha=AUDIT['pr106_sha'],status='not integrated; pending owner review',
    method='Connected alpha component ownership and proportional Lanczos export; no color-key/background removal or art repainting. Reused icons byte-identical.',
    assets=records),ensure_ascii=False,indent=2)+'\n')

def font(size,thai=False):
    return ImageFont.truetype(THAI if thai else FONT,size)
def draw_icon(canvas,path,x,y,size):
    im = Image.open(path).convert('RGBA').resize((size,size),Image.Resampling.LANCZOS)
    canvas.paste(im,(x,y),im)
def label_text(draw,xy,text,size=17,fill='#433c30',thai=False):
    draw.text(xy,text,font=font(size,thai),fill=fill)

# All individual files seen on cream/dark at large scale and exact target sizes.
for kind,values,big,small in [('monster',AUDIT['monsters'],190,50),('material',AUDIT['materials'],180,40)]:
    h=310*((len(values)+2)//3)+55
    sheet=Image.new('RGB',(1380,h),'#f5efdf');d=ImageDraw.Draw(sheet)
    label_text(d,(20,13),f'{kind.upper()} CANDIDATES / LARGE + {small}px + DARK',22)
    for n,v in enumerate(values):
        x=(n%3)*460;y=(n//3)*310+55;path=OUT/kind/(v['id']+'.png')
        draw_icon(sheet,path,x+12,y+12,big)
        draw_icon(sheet,path,x+221,y+58,small)
        d.rectangle((x+286,y+4,x+443,y+197),fill='#172423')
        draw_icon(sheet,path,x+298,y+10,132)
        draw_icon(sheet,path,x+351,y+151,small)
        label_text(d,(x+12,y+207),v['id'],17)
        label_text(d,(x+12,y+234),v.get('proposed_nameTh',v.get('current_nameTh','')),18,thai=True)
        label_text(d,(x+12,y+267),v.get('artwork','new portrait candidate'),13)
    sheet.save(HERE/(kind+'-pixel-review.png'))

# Owner preview: old→new portraits; all live drop items, reused or candidate.
board=Image.new('RGB',(1440,1080),'#f3eddf');d=ImageDraw.Draw(board)
label_text(d,(28,14),'PR106 · MONSTER IDENTITY PREPARATION',29)
label_text(d,(28,54),'ภาพร่างสำหรับรีวิว - ชื่อไทยเสนอ - ยังไม่ใช้ในเกม',23,thai=True)
for n,v in enumerate(AUDIT['monsters']):
    x=n%3*480;y=110+n//3*475
    d.rounded_rectangle((x+12,y,x+468,y+455),12,fill='#fffaf0',outline='#d8cdb8')
    label_text(d,(x+28,y+13),v['reference_name'],22)
    label_text(d,(x+28,y+48),v['proposed_nameTh'],20,thai=True)
    label_text(d,(x+28,y+82),v['id'],14,fill='#7d7466')
    label_text(d,(x+34,y+110),'OLD',14);label_text(d,(x+166,y+110),'CANDIDATE',14)
    draw_icon(board,ROOT/v['current_portrait'],x+26,y+135,116)
    label_text(d,(x+144,y+169),'→',22)
    draw_icon(board,OUT/'monster'/(v['id']+'.png'),x+165,y+123,195)
    draw_icon(board,OUT/'monster'/(v['id']+'.png'),x+391,y+170,50)
    for m,drop in enumerate([a for a in v['drops'] if a['item']!='gold']):
        key=drop['item'];mat=next(a for a in AUDIT['materials'] if a['id']==key)
        xx=x+28+m*144
        draw_icon(board,OUT/'material'/(key+'.png'),xx+24,y+330,76)
        label_text(d,(xx,y+412),key,12)
        label_text(d,(xx,y+432),'NEW' if mat['artwork']=='candidate' else 'REUSE',12,fill='#456e64')
board.save(HERE/'owner-preview.png')

comparison=Image.new('RGB',(1200,460),'#f5efdf');d=ImageDraw.Draw(comparison)
label_text(d,(22,12),'MATERIAL CHANGES / OLD → CANDIDATE',24)
for n,key in enumerate(['viper_scale','wisp_core']):
    x=n*600
    old=ROOT/'public/assets/icons/material'/(key+'.png')
    label_text(d,(x+24,65),key,20)
    label_text(d,(x+28,103),'OLD',15);label_text(d,(x+272,103),'CANDIDATE',15)
    draw_icon(comparison,old,x+24,135,210)
    label_text(d,(x+240,213),'→',25)
    draw_icon(comparison,OUT/'material'/(key+'.png'),x+279,135,210)
    draw_icon(comparison,OUT/'material'/(key+'.png'),x+520,210,40)
    mat=next(v for v in AUDIT['materials'] if v['id']==key)
    label_text(d,(x+24,378),mat['current_nameTh']+' เป็น '+mat['proposed_nameTh'],18,thai=True)
comparison.save(HERE/'material-old-new.png')

tiny=Image.new('RGB',(1050,720),'#f5efdf');d=ImageDraw.Draw(tiny)
label_text(d,(18,12),'EXACT SMALL SIZES / 32px · 40px · 50px',22)
for n,v in enumerate(records):
    x=n%4*262;y=n//4*165+55;path=HERE/v['path']
    label_text(d,(x+12,y+5),v['id'],14)
    d.rectangle((x+10,y+88,x+248,y+150),fill='#172423')
    for size,offset in [(32,18),(40,92),(50,177)]:
        draw_icon(tiny,path,x+offset,y+30,size)
        draw_icon(tiny,path,x+offset,y+94,size)
tiny.save(HERE/'small-icon-review.png')
print('Exported 6 portraits, 2 new materials, 8 byte-identical approved materials and five review sheets.')
