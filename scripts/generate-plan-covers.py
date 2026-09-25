"""Usage: python3 scripts/generate-plan-covers.py <out-dir> [cover-file-name ...]
Needs Google Chrome (headless) to rasterise; then pngquant --quality 55-80 + oxipng
before copying into assets/plans/covers/.

Every reading-plan cover as a language-free mark on a textured ground.
Canvas 2400x1800 (4:3); marks stay inside the centre square so the detail
hero (~1.1:1) and catalog thumbnails (1:1) both crop cleanly."""
import math, os, subprocess, sys
OUT = sys.argv[1]
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
EMBER, DEEP, OCHRE, SAND, STONE, INK = '#C06A4E', '#9F503B', '#DDA877', '#EFE3D1', '#B0A99B', '#3B251E'
GROUNDS = {  # centre, edge
  'V': ('#F5F1EA', '#E4DCCE'),
  'D': ('#4A2E25', '#2C1B16'),
  'T': ('#B8664A', '#8C452F'),
}
def arch(x, y_top, w, y_base):
  r = w / 2
  return f'M{x} {y_base} V{y_top + r} A{r} {r} 0 0 1 {x + w} {y_top + r} V{y_base} Z'

def year():  # Bible in a year: a disc inside a twelve-month wheel
  s = f'<circle cx="1200" cy="900" r="430" fill="none" stroke="{STONE}" stroke-width="5"/>'
  for i in range(12):
    a = math.radians(-90 + i * 30)
    x, y = 1200 + 430 * math.cos(a), 900 + 430 * math.sin(a)
    s += f'<circle cx="{x:.0f}" cy="{y:.0f}" r="{44 if i == 0 else 26}" fill="{DEEP if i == 0 else OCHRE}"/>'
  return s + f'<circle cx="1200" cy="900" r="250" fill="{EMBER}"/>'

def nt90():  # sunrise over three hills (three months)
  return (f'<defs><clipPath id="h"><rect width="2400" height="1250"/></clipPath></defs>'
    f'<circle cx="1200" cy="640" r="120" fill="{SAND}"/><g clip-path="url(#h)">'
    f'<ellipse cx="880" cy="1250" rx="420" ry="330" fill="{OCHRE}"/>'
    f'<ellipse cx="1540" cy="1250" rx="420" ry="300" fill="{STONE}"/>'
    f'<ellipse cx="1200" cy="1250" rx="440" ry="400" fill="{EMBER}"/></g>'
    f'<line x1="420" y1="1250" x2="1980" y2="1250" stroke="{SAND}" stroke-width="6" stroke-linecap="round" stroke-opacity="0.6"/>')

def psalms():  # a song at sunrise: half sun over lyre-string water lines
  s = ('<defs><clipPath id="c"><rect width="2400" height="1120"/></clipPath>'
       '<radialGradient id="sun" cx="50%" cy="100%" r="100%"><stop offset="0" stop-color="#C9765A"/><stop offset="1" stop-color="#A9553D"/></radialGradient></defs>'
       '<g clip-path="url(#c)">'
       f'<circle cx="1200" cy="1120" r="700" fill="none" stroke="#B8674C" stroke-width="4" stroke-opacity="0.18"/>'
       f'<circle cx="1200" cy="1120" r="565" fill="none" stroke="#B8674C" stroke-width="5" stroke-opacity="0.35"/>'
       '<circle cx="1200" cy="1120" r="430" fill="url(#sun)"/></g>')
  for i, op in enumerate([1, .75, .55, .38, .24]):
    s += f'<line x1="{400+120*i}" y1="{1120+75*i}" x2="{2000-120*i}" y2="{1120+75*i}" stroke="{DEEP}" stroke-width="7" stroke-linecap="round" stroke-opacity="{op}"/>'
  return s

def four_arches():  # the four Gospels
  s = ''
  for (x, top, c) in [(540, 760, EMBER), (915, 700, OCHRE), (1290, 640, SAND), (1665, 700, STONE)]:
    s += f'<path d="{arch(x, top - 165, 330, 1400)}" fill="{c}"/>'
  return s + f'<line x1="440" y1="1455" x2="2095" y2="1455" stroke="{SAND}" stroke-width="6" stroke-linecap="round" stroke-opacity="0.55"/>'

def proverbs():  # the path of the righteous is like the light of dawn (Prov 4:18)
  return ('<defs><clipPath id="sky"><rect width="2400" height="760"/></clipPath></defs>'
          f'<circle cx="1200" cy="760" r="210" fill="{SAND}" clip-path="url(#sky)"/>'
          f'<circle cx="1200" cy="760" r="300" fill="none" stroke="{SAND}" stroke-width="6" stroke-opacity="0.35" clip-path="url(#sky)"/>'
          f'<line x1="520" y1="760" x2="1880" y2="760" stroke="{SAND}" stroke-width="8" stroke-linecap="round"/>'
          f'<path d="M780 1420 C860 1210 1330 1150 1290 990 C1265 890 1180 830 1190 762 L1210 762 '
          f'C1210 830 1330 885 1370 990 C1430 1160 1080 1250 1400 1420 Z" fill="{SAND}"/>')

def chronological():  # one story, beginning to end
  s = f'<line x1="440" y1="900" x2="1960" y2="900" stroke="{DEEP}" stroke-width="6" stroke-linecap="round"/>'
  for x, r, c in [(520, 18, STONE), (720, 30, STONE), (940, 48, OCHRE), (1190, 70, OCHRE), (1480, 100, EMBER), (1820, 140, DEEP)]:
    s += f'<circle cx="{x}" cy="900" r="{r}" fill="{c}"/>'
  return s

def epistles():  # letters to the churches
  s = ''
  for rot, c in [(-9, EMBER), (5, OCHRE)]:
    s += f'<rect x="920" y="520" width="560" height="740" rx="18" fill="{c}" transform="rotate({rot} 1200 890)"/>'
  s += f'<rect x="920" y="520" width="560" height="740" rx="18" fill="{SAND}" transform="rotate(-2 1200 890)"/><g transform="rotate(-2 1200 890)">'
  for i, w in enumerate([380, 400, 340, 400, 260]):
    s += f'<line x1="1010" y1="{660 + i*80}" x2="{1010+w}" y2="{660 + i*80}" stroke="{STONE}" stroke-width="12" stroke-linecap="round"/>'
  return s + f'<circle cx="1360" cy="1150" r="44" fill="{EMBER}"/></g>'

def city_on_hill():  # a city set on a hill cannot be hidden (Matt 5:14)
  s = (f'<circle cx="1230" cy="760" r="330" fill="{OCHRE}" fill-opacity="0.12"/>'
       f'<circle cx="1230" cy="760" r="220" fill="{OCHRE}" fill-opacity="0.16"/>'
       f'<path d="M380 1320 C700 1300 900 900 1230 880 C1560 900 1760 1240 2020 1320 Z" fill="{EMBER}"/>')
  for x, w, h in [(1090, 90, 120), (1190, 110, 170), (1310, 90, 110)]:
    y = 890 - h
    s += (f'<path d="M{x} {y + 40} L{x + w/2} {y - 10} L{x + w} {y + 40} V{y + h + 10} H{x} Z" fill="{SAND}"/>'
          f'<rect x="{x + w/2 - 12}" y="{y + 70}" width="24" height="30" rx="4" fill="{OCHRE}"/>')
  return s + f'<line x1="380" y1="1320" x2="2020" y2="1320" stroke="{SAND}" stroke-width="6" stroke-linecap="round" stroke-opacity="0.5"/>'

def foundations():  # courses of stone on a cornerstone
  s, h, w = '', 118, 250
  rows = [(5, 0), (4, w/2), (3, w)]
  for ri, (n, off) in enumerate(rows):
    y = 1260 - ri * (h + 18)
    x0 = 1200 - (5 * w + 4 * 18) / 2 + off
    for i in range(n):
      c = EMBER if (ri, i) == (0, 0) else [OCHRE, '#CFC4B2', STONE][(i + ri) % 3]
      s += f'<rect x="{x0 + i*(w+18):.0f}" y="{y}" width="{w}" height="{h}" rx="8" fill="{c}"/>'
  return s

def prayer():  # a flame kept in the dark
  s = ''.join(f'<circle cx="1200" cy="860" r="{r}" fill="none" stroke="{EMBER}" stroke-width="5" stroke-opacity="{o}"/>' for r, o in [(330, .45), (450, .25), (570, .12)])
  s += (f'<path d="M1200 520 C1330 700 1390 830 1330 960 A140 140 0 0 1 1070 960 C1010 830 1070 700 1200 520 Z" fill="{OCHRE}"/>'
        f'<path d="M1200 760 C1260 840 1280 900 1250 960 A55 55 0 0 1 1150 960 C1120 900 1140 840 1200 760 Z" fill="{SAND}"/>'
        f'<rect x="1130" y="1080" width="140" height="300" rx="10" fill="{SAND}" fill-opacity="0.9"/>')
  return s

def identity():  # sealed in Christ
  return (f'<circle cx="1200" cy="900" r="360" fill="{SAND}"/>'
          f'<circle cx="1200" cy="900" r="290" fill="none" stroke="{DEEP}" stroke-width="8"/>'
          f'<circle cx="1200" cy="900" r="210" fill="{DEEP}"/>'
          f'<rect x="1172" y="760" width="56" height="280" rx="6" fill="{SAND}"/>'
          f'<rect x="1080" y="852" width="240" height="56" rx="6" fill="{SAND}"/>')

def kingdom():  # the mustard seed becomes a tree
  return (f'<rect x="1178" y="880" width="44" height="420" rx="10" fill="{DEEP}"/>'
          f'<circle cx="1010" cy="860" r="190" fill="{OCHRE}"/>'
          f'<circle cx="1390" cy="860" r="190" fill="#D9C3A5"/>'
          f'<circle cx="1200" cy="700" r="250" fill="{EMBER}"/>'
          f'<line x1="600" y1="1300" x2="1800" y2="1300" stroke="{DEEP}" stroke-width="6" stroke-linecap="round"/>'
          f'<circle cx="760" cy="1250" r="20" fill="{DEEP}"/>')

def warfare():  # the shield of faith
  return (f'<path d="M880 480 H1520 V880 C1520 1140 1370 1290 1200 1380 C1030 1290 880 1140 880 880 Z" fill="{EMBER}"/>'
          f'<path d="M960 560 H1440 V880 C1440 1090 1330 1210 1200 1285 C1070 1210 960 1090 960 880 Z" fill="none" stroke="{SAND}" stroke-width="8" stroke-opacity="0.8"/>'
          f'<rect x="1176" y="640" width="48" height="520" rx="6" fill="{SAND}"/>'
          f'<rect x="1040" y="780" width="320" height="48" rx="6" fill="{SAND}"/>')

def holiness():  # refined, dark to light
  s = f'<circle cx="1760" cy="900" r="190" fill="none" stroke="{SAND}" stroke-width="5" stroke-opacity="0.4"/>'
  for i, c in enumerate([DEEP, EMBER, OCHRE, '#E9CFA9', SAND]):
    s += f'<circle cx="{640 + i*280}" cy="900" r="115" fill="{c}"/>'
  return s

def commission():  # go to all nations
  s = f'<circle cx="1200" cy="900" r="480" fill="none" stroke="{STONE}" stroke-width="4" stroke-opacity="0.7"/>'
  for i in range(8):
    a = math.radians(i * 45 - 90)
    x1, y1, x2, y2 = 1200 + 150*math.cos(a), 900 + 150*math.sin(a), 1200 + 440*math.cos(a), 900 + 440*math.sin(a)
    s += f'<line x1="{x1:.0f}" y1="{y1:.0f}" x2="{x2:.0f}" y2="{y2:.0f}" stroke="{DEEP}" stroke-width="7" stroke-linecap="round"/>'
    s += f'<circle cx="{1200 + 480*math.cos(a):.0f}" cy="{900 + 480*math.sin(a):.0f}" r="30" fill="{OCHRE if i % 2 else EMBER}"/>'
  return s + f'<circle cx="1200" cy="900" r="100" fill="{EMBER}"/>'

def faith():  # step by step toward the light
  pts, x, y = ['620 1320'], 620, 1320
  for i in range(5):
    pts += [f'{x} {y - 140}', f'{x + 230} {y - 140}']
    x, y = x + 230, y - 140
  pts += [f'{x} 1320']
  return (f'<polygon points="{" ".join(pts)}" fill="{SAND}"/>'
          f'<circle cx="{x - 115}" cy="{y - 190}" r="80" fill="{OCHRE}"/>')

def hearing():  # a voice, and the one who listens
  s = f'<circle cx="860" cy="900" r="70" fill="{SAND}"/>'
  for i, (r, c, o) in enumerate([(200, OCHRE, 1), (330, OCHRE, .8), (460, EMBER, .7), (590, EMBER, .45)]):
    a = math.radians(48)
    x1, y1 = 860 + r*math.cos(-a), 900 + r*math.sin(-a)
    x2, y2 = 860 + r*math.cos(a), 900 + r*math.sin(a)
    s += f'<path d="M{x1:.0f} {y1:.0f} A{r} {r} 0 0 1 {x2:.0f} {y2:.0f}" fill="none" stroke="{c}" stroke-width="16" stroke-linecap="round" stroke-opacity="{o}"/>'
  return s

def kathisma():  # twenty kathismata through the week
  s, size, gap = '', 118, 40
  x0, y0 = 1200 - (5*size + 4*gap)/2, 900 - (4*size + 3*gap)/2
  for r in range(4):
    for c in range(5):
      i = r*5 + c
      fill = DEEP if i < 3 else (EMBER if r % 2 == 0 else OCHRE)
      s += f'<rect x="{x0 + c*(size+gap):.0f}" y="{y0 + r*(size+gap):.0f}" width="{size}" height="{size}" rx="18" fill="{fill}" fill-opacity="{1 if i < 3 else 0.85}"/>'
  return s

def month():  # thirty days around a dial
  s = f'<circle cx="1200" cy="900" r="160" fill="{SAND}"/>'
  for i in range(30):
    a = math.radians(-90 + i * 12)
    r1, r2 = (350, 450) if i % 5 == 0 else (380, 440)
    s += (f'<line x1="{1200 + r1*math.cos(a):.0f}" y1="{900 + r1*math.sin(a):.0f}" x2="{1200 + r2*math.cos(a):.0f}" y2="{900 + r2*math.sin(a):.0f}" '
          f'stroke="{SAND}" stroke-width="{14 if i % 5 == 0 else 9}" stroke-linecap="round"/>')
  return s

def three_months():  # three overlapping seasons
  return ''.join(f'<circle cx="{x}" cy="900" r="270" fill="{c}" style="mix-blend-mode:multiply"/>' for x, c in [(900, OCHRE), (1200, EMBER), (1500, STONE)])

def doorway():  # an open door
  return (f'<path d="M1060 1220 L1340 1220 L1640 1440 L760 1440 Z" fill="{OCHRE}" fill-opacity="0.28"/>'
          f'<path d="{arch(1040, 480, 320, 1220)}" fill="{OCHRE}"/>'
          f'<path d="{arch(1000, 440, 400, 1220)}" fill="none" stroke="{SAND}" stroke-width="10"/>'
          f'<line x1="700" y1="1220" x2="1700" y2="1220" stroke="{SAND}" stroke-width="6" stroke-linecap="round" stroke-opacity="0.6"/>')

def four_circles():  # the four Gospels, quicker
  s = ''.join(f'<circle cx="{x}" cy="880" r="130" fill="{c}"/>' for x, c in [(780, EMBER), (1060, OCHRE), (1340, '#D9C3A5'), (1620, STONE)])
  return s + f'<line x1="600" y1="1080" x2="1800" y2="1080" stroke="{DEEP}" stroke-width="6" stroke-linecap="round"/>'

def acts():  # the church sets sail
  s = (f'<path d="M1170 420 L1170 1080 L740 1080 Z" fill="{SAND}"/>'
       f'<path d="M1230 540 L1230 1080 L1580 1080 Z" fill="{OCHRE}"/>'
       f'<path d="M740 1130 H1660 L1530 1270 H870 Z" fill="{SAND}"/>')
  for i, (w, o) in enumerate([(1100, .6), (860, .4), (620, .25)]):
    s += f'<line x1="{1200 - w/2}" y1="{1340 + i*55}" x2="{1200 + w/2}" y2="{1340 + i*55}" stroke="{SAND}" stroke-width="7" stroke-linecap="round" stroke-opacity="{o}"/>'
  return s

# file name (existing cover key file) -> (ground, mark, plan)
COVERS = {
  'lakeLandscape': ('V', year, 'Bible in 1 Year'),
  'stars': ('D', nt90, 'New Testament in 90 Days'),
  'shore': ('V', psalms, 'Psalms in 30 Days'),
  'mountains': ('D', four_arches, 'Gospels in 60 Days'),
  'desert': ('T', proverbs, 'Proverbs in 31 Days'),
  'forest': ('V', chronological, 'Chronological'),
  'valley': ('D', epistles, 'Epistles in 30 Days'),
  'dunes': ('D', city_on_hill, 'Sermon on the Mount'),
  'gospelFoundations': ('V', foundations, 'Foundations of the Gospel'),
  'prayerIntimacy': ('D', prayer, 'Prayer & Intimacy'),
  'identityInChrist': ('T', identity, 'Identity in Christ'),
  'kingdomOfGod': ('V', kingdom, 'The Kingdom of God'),
  'spiritualWarfare': ('D', warfare, 'Spiritual Warfare'),
  'holinessSanctification': ('D', holiness, 'Holiness'),
  'greatCommission': ('V', commission, 'Great Commission'),
  'faithObedience': ('T', faith, 'Faith & Obedience'),
  'hearingGodVoice': ('D', hearing, "Hearing God's Voice"),
  'kathisma': ('V', kathisma, 'Kathisma (weekly)'),
  'seashore': ('T', month, 'Bible in 30 Days'),
  'field': ('V', three_months, 'Bible in 90 Days'),
  'sandDune': ('D', doorway, 'NT in 30 Days'),
  'pineSky': ('V', four_circles, 'Gospels in 30 Days'),
  'riverForest': ('T', acts, 'Acts in 28 Days'),
}

GRAIN = ('<filter id="g" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="3" stitchTiles="stitch"/>'
  '<feColorMatrix type="matrix" values="0 0 0 0 0.2  0 0 0 0 0.13  0 0 0 0 0.08  0 0 0 0.55 0"/></filter>'
  '<filter id="f" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.012" numOctaves="4" seed="7"/>'
  '<feColorMatrix type="matrix" values="0 0 0 0 0.35  0 0 0 0 0.22  0 0 0 0 0.12  0 0 0 0.35 0"/></filter>')

only = sys.argv[2:] or list(COVERS)
for name in only:
  ground, fn, _ = COVERS[name]
  c0, c1 = GROUNDS[ground]
  svg = (f'<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900" viewBox="0 0 2400 1800"><defs>{GRAIN}'
         f'<radialGradient id="v" cx="50%" cy="45%" r="78%"><stop offset="0" stop-color="{c0}"/><stop offset="1" stop-color="{c1}"/></radialGradient></defs>'
         f'<rect width="2400" height="1800" fill="url(#v)"/><g style="isolation:isolate">{fn()}</g>'
         f'<rect width="2400" height="1800" filter="url(#f)" opacity="0.35"/><rect width="2400" height="1800" filter="url(#g)" opacity="0.12"/></svg>')
  html = os.path.join(OUT, f'{name}.html')
  open(html, 'w').write(f'<html><body style="margin:0">{svg}</body></html>')
  subprocess.run([CHROME, '--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1.2',
                  '--window-size=1200,900', f'--screenshot={os.path.join(OUT, name + ".png")}', f'file://{html}'],
                 stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
  print('rendered', name)
