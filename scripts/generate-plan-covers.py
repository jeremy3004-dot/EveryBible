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

def common_prayer():  # morning and evening, through the month
  s = ''
  for i in range(4, 26):  # the days arching over from the sunrise to the moonrise
    a = math.radians(180 + i * 180 / 29)
    x, y = 1200 + 440 * math.cos(a), 1020 + 440 * math.sin(a)
    s += f'<circle cx="{x:.0f}" cy="{y:.0f}" r="{14 if i % 5 else 20}" fill="{STONE}" fill-opacity="{0.55 if i % 5 else 0.9}"/>'
  s += (f'<circle cx="760" cy="1020" r="150" fill="{EMBER}"/>'
        f'<circle cx="760" cy="1020" r="215" fill="none" stroke="{EMBER}" stroke-width="5" stroke-opacity="0.35"/>'
        f'<defs><mask id="moon"><rect width="2400" height="1800" fill="white"/><circle cx="1700" cy="970" r="130" fill="black"/></mask></defs>'
        f'<circle cx="1640" cy="1020" r="150" fill="{SAND}" mask="url(#moon)"/>')
  return s + f'<line x1="480" y1="1260" x2="1920" y2="1260" stroke="{SAND}" stroke-width="6" stroke-linecap="round" stroke-opacity="0.5"/>'

def week_of_christ():  # the week as a ring: the Cross on Friday, Sunday's light at the top
  s, r = '', 400
  s += f'<circle cx="1200" cy="900" r="{r}" fill="none" stroke="{SAND}" stroke-width="5" stroke-opacity="0.3"/>'
  for i in range(7):
    a = math.radians(-90 + i * 360 / 7)
    x, y = 1200 + r * math.cos(a), 900 + r * math.sin(a)
    if i == 0:
      s += (f'<circle cx="{x:.0f}" cy="{y:.0f}" r="190" fill="{SAND}" fill-opacity="0.16"/>'
            f'<circle cx="{x:.0f}" cy="{y:.0f}" r="135" fill="{SAND}" fill-opacity="0.26"/>'
            f'<circle cx="{x:.0f}" cy="{y:.0f}" r="85" fill="{SAND}"/>')
    elif i == 5:
      s += (f'<rect x="{x - 15:.0f}" y="{y - 110:.0f}" width="30" height="220" rx="6" fill="{SAND}"/>'
            f'<rect x="{x - 65:.0f}" y="{y - 60:.0f}" width="130" height="30" rx="6" fill="{SAND}"/>')
    else:
      s += f'<circle cx="{x:.0f}" cy="{y:.0f}" r="34" fill="{SAND}" fill-opacity="0.6"/>'
  return s

def lords_prayer():  # our Father in heaven, give us today our daily bread
  s = ''.join(f'<path d="M{1200-r} 1200 A{r} {r} 0 0 1 {1200+r} 1200" fill="none" stroke="{c}" stroke-width="{w}" stroke-opacity="{o}" stroke-linecap="round"/>'
              for r, c, w, o in [(620, STONE, 5, .5), (500, OCHRE, 6, .6), (380, EMBER, 7, .7)])
  return (s + f'<ellipse cx="1200" cy="1110" rx="210" ry="110" fill="{OCHRE}"/>'
          f'<path d="M1060 1080 C1130 1050 1270 1050 1340 1080" fill="none" stroke="{SAND}" stroke-width="12" stroke-linecap="round"/>'
          f'<line x1="480" y1="1225" x2="1920" y2="1225" stroke="{DEEP}" stroke-width="6" stroke-linecap="round"/>')

def gospels_month():  # four lamps kept burning through the month, one for each Gospel
  def lamp(c):  # drawn around its own centre; the flame sits on the spout's tip
    fx, fy = 150, -40
    return (f'<circle cx="{fx}" cy="{fy - 40}" r="120" fill="{OCHRE}" fill-opacity="0.14"/>'
            f'<path d="M-180 0 H30 L{fx + 10} {fy + 12} C{fx - 20} {fy + 50} 70 30 40 50 '
            f'C-10 110 -150 110 -180 0 Z" fill="{c}"/>'
            f'<rect x="-90" y="-28" width="60" height="28" rx="10" fill="{c}"/>'
            f'<path d="M{fx} {fy} C{fx - 44} {fy - 40} {fx - 30} {fy - 100} {fx + 4} {fy - 150} '
            f'C{fx + 30} {fy - 100} {fx + 44} {fy - 40} {fx} {fy} Z" fill="{OCHRE}"/>'
            f'<path d="M{fx} {fy - 10} C{fx - 18} {fy - 30} {fx - 12} {fy - 60} {fx + 2} {fy - 84} '
            f'C{fx + 14} {fy - 60} {fx + 18} {fy - 30} {fx} {fy - 10} Z" fill="{SAND}"/>'
            f'<line x1="-230" y1="130" x2="230" y2="130" stroke="{SAND}" stroke-width="5" stroke-linecap="round" stroke-opacity="0.45"/>')
  return ''.join(f'<g transform="translate({x} {y}) scale(1.2)">{lamp(c)}</g>'
                 for x, y, c in [(880, 700, EMBER), (1520, 700, OCHRE), (880, 1180, SAND), (1520, 1180, STONE)])

# ---- Seasons of life: one shape cut down the middle. The left half is how it
# feels, the right half is the answer the plan's readings give. Heads carry the
# feelings that live in your thoughts; hearts, clay jars, round windows,
# doorways and a house carry the rest, so the set is not a row of faces.
import random
LIGHT, STONE_LIGHT, NIGHT = '#F5F1EA', '#CFC4B2', '#2A1813'
SHAPES = {
  'head': ('M1060 1420 C1040 1260 950 1110 975 900 C1000 680 1150 560 1310 575 C1450 590 1490 720 1478 830 '
           'L1535 935 L1482 955 L1492 1010 L1470 1040 L1482 1090 C1482 1140 1430 1165 1375 1160 L1365 1420 Z'),
  'heart': ('M1200 1420 C900 1200 760 1000 780 820 C800 650 960 580 1080 620 C1140 640 1180 690 1200 740 '
            'C1220 690 1260 640 1320 620 C1440 580 1600 650 1620 820 C1640 1000 1500 1200 1200 1420 Z'),
  'jar': ('M1080 520 H1320 V580 C1320 620 1290 640 1290 680 C1480 760 1560 900 1540 1080 C1520 1280 1400 1420 1200 1420 '
          'C1000 1420 880 1280 860 1080 C840 900 920 760 1110 680 C1110 640 1080 620 1080 580 Z'),
  'circle': 'M780 950 A420 420 0 1 0 1620 950 A420 420 0 1 0 780 950 Z',
  'arch': arch(880, 500, 640, 1420),
  'house': 'M820 1420 V900 L1200 540 L1580 900 V1420 Z',
}
HEAD_MID = 1235

def cut(shape, back, front, line_color=SAND):
  mid = HEAD_MID if shape == 'head' else 1200
  return (f'<defs><clipPath id="sh"><path d="{SHAPES[shape]}"/></clipPath><clipPath id="bk"><rect width="{mid}" height="1800"/></clipPath>'
          f'<clipPath id="fr"><rect x="{mid}" width="{2400 - mid}" height="1800"/></clipPath></defs>'
          f'<g clip-path="url(#sh)"><g clip-path="url(#bk)">{back}</g><g clip-path="url(#fr)">{front}</g>'
          f'<line x1="{mid}" y1="400" x2="{mid}" y2="1450" stroke="{line_color}" stroke-width="8"/></g>')

def fill(c):
  return f'<rect width="2400" height="1800" fill="{c}"/>'

def stroke(x1, y1, x2, y2, c, w=10, o=1):
  return f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{c}" stroke-width="{w}" stroke-linecap="round" stroke-opacity="{o}"/>'

def scatter_stars(seed, n, box):
  r, s = random.Random(seed), ''
  for _ in range(n):
    s += f'<circle cx="{r.uniform(box[0], box[2]):.0f}" cy="{r.uniform(box[1], box[3]):.0f}" r="{r.choice([5, 7, 9, 12, 15])}" fill="{SAND}" fill-opacity="{r.uniform(.35, 1):.2f}"/>'
  return s

def crescent(cx, cy, r):
  return (f'<defs><mask id="moon-cut"><rect width="2400" height="1800" fill="white"/><circle cx="{cx + r*0.55:.0f}" cy="{cy - r*0.4:.0f}" r="{r*0.85:.0f}" fill="black"/></mask></defs>'
          f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{SAND}" mask="url(#moon-cut)"/>')

def half_sun(cx, cy, r, rays):
  s = f'<defs><clipPath id="above-horizon"><rect width="2400" height="{cy}"/></clipPath></defs><circle cx="{cx}" cy="{cy}" r="{r}" fill="{SAND}" clip-path="url(#above-horizon)"/>'
  for i in range(rays):
    a = math.radians(180 + (i + 1) * 180 / (rays + 1))
    s += stroke(round(cx + (r + 40)*math.cos(a)), round(cy + (r + 40)*math.sin(a)), round(cx + (r + 120)*math.cos(a)), round(cy + (r + 120)*math.sin(a)), SAND, 12)
  return s

def wavy(x0, x1, y0, rows, c, amp0=0, grow=0, gap=50):
  return ''.join(f'<polyline points="{" ".join(f"{x},{y0 + i*gap + (amp0 + i*grow)*math.sin(x/40):.0f}" for x in range(x0, x1 + 1, 10))}" '
                 f'fill="none" stroke="{c}" stroke-width="7" stroke-linecap="round" stroke-opacity="{max(0.2, 0.8 - i*0.05):.2f}"/>' for i in range(rows))

def still(x0, x1, y0, rows, c, gap=70):
  return ''.join(stroke(x0, y0 + i*gap, x1, y0 + i*gap, c, 8, max(0.25, 0.75 - i*0.06)) for i in range(rows))

def rain(x0, x1, c=DEEP, o=0.6):
  return ''.join(stroke(x + 80, 480, x, 1440, c, 9, o) for x in range(x0, x1, 60))

def knot(x0, y0, length, c, amp0, loops, width):
  pts = []
  for k in range(401):
    s = k / 400
    amp = amp0 * (1 - s) ** 1.3
    pts.append(f'{x0 + length*0.55*s + amp*math.cos(2*math.pi*loops*s):.0f},{y0 + amp*math.sin(2*math.pi*loops*s):.0f}')
  return f'<polyline points="{" ".join(pts)} {x0 + length:.0f},{y0}" fill="none" stroke="{c}" stroke-width="{width}" stroke-linecap="round" stroke-linejoin="round"/>'

def flame(cx, base, h, w, c):
  return (f'<path d="M{cx} {base - h} C{cx + w*0.9} {base - h*0.5} {cx + w} {base - h*0.15} {cx + w*0.5} {base} '
          f'L{cx - w*0.5} {base} C{cx - w} {base - h*0.15} {cx - w*0.9} {base - h*0.5} {cx} {base - h} Z" fill="{c}"/>')

def kneeling(cx, base, c):  # a small robed figure bowed low, head down toward the ground
  return (f'<g transform="rotate(24 {cx} {base})"><path d="{arch(cx - 100, base - 250, 200, base)}" fill="{c}"/>'
          f'<circle cx="{cx}" cy="{base - 250 - 68}" r="66" fill="{c}"/></g>')

def sprout(x, ground, top, c):
  return (f'<path d="M{x} {ground} C{x - 10} {ground - 120} {x + 15} {top + 130} {x} {top}" fill="none" stroke="{c}" stroke-width="20" stroke-linecap="round"/>'
          f'<path d="M{x + 2} {top + 100} C{x - 90} {top + 10} {x - 70} {top - 60} {x - 90} {top - 130} C{x - 10} {top - 80} {x + 20} {top - 10} {x + 2} {top + 100} Z" fill="{c}"/>'
          f'<path d="M{x + 4} {top + 170} C{x + 80} {top + 80} {x + 140} {top + 90} {x + 180} {top + 30} C{x + 110} {top + 10} {x + 40} {top + 60} {x + 4} {top + 170} Z" fill="{c}"/>')

def life_loss():  # night | morning
  return cut('head', fill(DEEP) + scatter_stars(3, 10, (980, 640, 1230, 1300)) + crescent(1110, 880, 80),
             fill(OCHRE) + f'<rect y="1100" width="2400" height="700" fill="{EMBER}"/>' + half_sun(1360, 1100, 100, 4))

def life_stress():  # a jar crammed with stones | still water
  stones = ''.join(f'<rect x="{x}" y="{y}" width="{w}" height="130" rx="60" fill="{c}"/>'
                   for x, y, w, c in [(860, 1260, 330, STONE), (900, 1120, 280, STONE_LIGHT), (860, 980, 320, STONE), (920, 840, 260, STONE_LIGHT), (960, 700, 220, STONE)])
  return cut('jar', fill(DEEP) + stones,
             fill(SAND) + f'<rect y="1000" width="2400" height="800" fill="{OCHRE}"/>' + still(1210, 1560, 1070, 4, SAND))

def life_fear():  # storm | a clearing over still water
  return cut('arch', fill(STONE) + rain(760, 1300),
             fill(SAND) + f'<circle cx="1360" cy="780" r="80" fill="{EMBER}"/>' + still(1210, 1540, 1080, 5, DEEP), DEEP)

def life_peace():  # churning | still
  return cut('circle', fill(EMBER) + wavy(760, 1210, 640, 12, SAND, amp0=30, grow=4, gap=65),
             fill(SAND) + still(1210, 1640, 660, 12, DEEP, gap=65), DEEP)

def life_depression():  # the pit | a ladder up to the light
  rungs = ''.join(stroke(1300, y, 1420, y, SAND, 12) for y in range(760, 1420, 90))
  return cut('head', fill(NIGHT) + f'<circle cx="1110" cy="1300" r="36" fill="{STONE}" fill-opacity="0.5"/>',
             fill(OCHRE) + f'<circle cx="1360" cy="560" r="150" fill="{SAND}" fill-opacity="0.6"/>'
             + stroke(1300, 660, 1300, 1440, SAND, 14) + stroke(1420, 660, 1420, 1440, SAND, 14) + rungs)

def life_hope():  # a buried seed | a green shoot
  return cut('circle', fill(NIGHT) + f'<ellipse cx="1040" cy="1200" rx="70" ry="44" fill="{OCHRE}"/>' + stroke(760, 1080, 1200, 1080, SAND, 6, .35),
             fill(OCHRE) + f'<rect y="1080" width="2400" height="800" fill="{EMBER}"/>' + sprout(1380, 1080, 720, SAND))

def life_healing():  # a cracked jar | mended with gold
  crack = 'M960 760 L1060 880 L1030 1000 L1140 1100 L1230 1060 L1300 1180 L1270 1290 L1400 1380'
  crack2 = 'M1140 640 L1180 740 L1290 800 L1370 920 L1520 940'
  seams = lambda c, w: (f'<path d="{crack}" fill="none" stroke="{c}" stroke-width="{w}" stroke-linejoin="round"/>'
                        f'<path d="{crack2}" fill="none" stroke="{c}" stroke-width="{w - 3}" stroke-linejoin="round"/>')
  return cut('jar', fill(STONE) + seams(DEEP, 11), fill(SAND) + seams(OCHRE, 24))

def life_anger():  # fire | embers cooling
  embers = ''.join(f'<circle cx="{x}" cy="{y}" r="{r}" fill="{OCHRE}" fill-opacity="{o}"/>'
                   for x, y, r, o in [(1300, 1180, 46, .95), (1400, 1150, 36, .8), (1350, 1100, 26, .6), (1460, 1080, 22, .45)])
  smoke = f'<path d="M1350 1040 C1310 980 1390 930 1350 860 C1310 800 1390 750 1360 680" fill="none" stroke="{STONE}" stroke-width="12" stroke-linecap="round" stroke-opacity="0.6"/>'
  return cut('heart', fill(EMBER) + flame(1060, 1380, 700, 230, OCHRE) + flame(1060, 1380, 420, 130, SAND), fill(DEEP) + embers + smoke)

def life_anxiety():  # tangled | straight
  return cut('head', fill(OCHRE) + knot(990, 900, 245, INK, 100, 4, 11),
             fill(SAND) + stroke(1220, 900, 1420, 900, INK, 11) + f'<circle cx="1420" cy="900" r="34" fill="{EMBER}"/>')

def life_love():  # a heart of stone | a heart of flesh (Ezek 36:26)
  grain = ''.join(stroke(*seg, DEEP, 7, .45) for seg in [(880, 800, 1000, 760), (960, 1000, 1120, 960), (1020, 1180, 1160, 1150), (900, 900, 960, 880)])
  return cut('heart', fill(STONE) + grain,
             fill(EMBER) + f'<path d="M1300 700 C1420 700 1520 780 1530 880" fill="none" stroke="{SAND}" stroke-width="18" stroke-linecap="round" stroke-opacity="0.8"/>')

def life_patience():  # a bare winter branch | the same branch in blossom
  branch = 'M860 1100 C1000 1080 1120 1050 1250 980 C1340 930 1420 890 1520 820'
  twigs = [(1000, 1085, 980, 960), (1120, 1055, 1150, 940), (1260, 975, 1250, 1100), (1400, 900, 1450, 800)]
  bare = f'<path d="{branch}" fill="none" stroke="{DEEP}" stroke-width="20" stroke-linecap="round"/>' + ''.join(stroke(*t, DEEP, 12) for t in twigs)
  blossom = ''.join(f'<circle cx="{x}" cy="{y}" r="{r}" fill="{EMBER}"/>' for x, y, r in [(1250, 1100, 36), (1300, 950, 28), (1450, 800, 38), (1400, 900, 26), (1500, 850, 24), (1350, 1010, 22), (1500, 760, 20)])
  return cut('arch', fill(STONE) + bare, fill(SAND) + bare + blossom)

def life_doubt():  # fog | a clear path
  road = f'<path d="M1120 1440 L1440 1440 L1300 900 L1260 900 Z" fill="{EMBER}"/>' + stroke(960, 900, 1560, 900, DEEP, 6, .5)
  fog = ''.join(f'<rect x="900" y="{y}" width="400" height="60" rx="30" fill="{SAND}" fill-opacity="0.6"/>' for y in range(700, 1440, 110))
  return cut('head', fill(STONE) + road + fog, fill(SAND) + road + f'<circle cx="1330" cy="760" r="60" fill="{OCHRE}"/>', DEEP)

def life_pride():  # a tall tower | kneeling low
  tower = (f'<rect x="950" y="600" width="150" height="900" fill="{SAND}"/>'
           + ''.join(f'<rect x="{950 + i*58}" y="545" width="34" height="70" fill="{SAND}"/>' for i in range(3))
           + ''.join(f'<rect x="1005" y="{y}" width="40" height="64" rx="20" fill="{DEEP}"/>' for y in (720, 920, 1120)))
  return cut('circle', fill(DEEP) + tower, fill(OCHRE) + kneeling(1400, 1240, SAND) + stroke(1210, 1242, 1640, 1242, SAND, 7, .7))

def life_temptation():  # caged | set free
  bars = ''.join(stroke(x, 480, x, 1440, STONE, 16) for x in range(940, 1200, 64))
  bird = lambda x, y, w, sw, o: (f'<path d="M{x} {y} Q{x + w/4} {y - w/4} {x + w/2} {y} Q{x + 3*w/4} {y - w/4} {x + w} {y}" fill="none" '
                                 f'stroke="{DEEP}" stroke-width="{sw}" stroke-linecap="round" stroke-linejoin="round" stroke-opacity="{o}"/>')
  return cut('arch', fill(DEEP) + bars, fill(SAND) + bird(1250, 780, 260, 20, 1) + bird(1290, 980, 160, 14, .55))

def life_family():  # scattered | gathered home
  colors = [EMBER, OCHRE, LIGHT, DEEP, EMBER, OCHRE]
  scattered = ''.join(f'<circle cx="{x}" cy="{y}" r="40" fill="{c}"/>'
                      for (x, y), c in zip([(900, 1000), (1080, 1330), (960, 1240), (1130, 930), (1030, 1110), (880, 1350)], colors))
  ring = ''.join(f'<circle cx="{1400 + 105*math.cos(math.radians(i*60 - 90)):.0f}" cy="{1150 + 105*math.sin(math.radians(i*60 - 90)):.0f}" r="40" fill="{STONE if c == LIGHT else c}"/>'
                 for i, c in enumerate(colors))
  return cut('house', fill(STONE) + scattered, fill('#E9DCC6') + ring, DEEP)

# ---- Church year
def advent():  # four candles set in the wreath, one for each Sunday; the third, for joy, is rose
  def ring(half):  # the wreath's back or front half, so the candles stand inside it
    arc = f'M600 1300 A600 130 0 0 {1 if half == "back" else 0} 1800 1300'
    berries = ''.join(f'<circle cx="{1200 + 600*math.cos(a):.0f}" cy="{1300 + 130*math.sin(a):.0f}" r="16" fill="{OCHRE}"/>'
                      for a in [math.radians(d) for d in (range(200, 341, 35) if half == 'back' else range(20, 161, 35))])
    return f'<path d="{arc}" fill="none" stroke="{DEEP}" stroke-width="70" stroke-linecap="round"/>' + berries
  s = ring('back')
  for x, c in [(840, EMBER), (1080, EMBER), (1320, OCHRE), (1560, EMBER)]:
    s += (f'<circle cx="{x}" cy="690" r="120" fill="{OCHRE}" fill-opacity="0.12"/>'
          f'<rect x="{x - 60}" y="820" width="120" height="500" rx="14" fill="{c}"/>'
          + stroke(x, 820, x, 790, SAND, 6, .7) + flame(x, 790, 190, 58, OCHRE) + flame(x, 780, 100, 28, SAND))
  return s + ring('front')

def christmas():  # the star over the stable, its light falling on the manger
  cy = 520
  star = ''.join(f'<path d="M1200 {cy - l} L{1200 + w} {cy} L1200 {cy + l} L{1200 - w} {cy} Z" fill="{EMBER}" transform="rotate({a} 1200 {cy})"/>'
                 for a, l, w in [(0, 170, 32), (90, 170, 32), (45, 100, 22), (135, 100, 22)])
  return (f'<path d="M1185 {cy + 60} L1215 {cy + 60} L1420 1230 L980 1230 Z" fill="{OCHRE}" fill-opacity="0.2"/>'
          f'<circle cx="1200" cy="{cy}" r="140" fill="{OCHRE}" fill-opacity="0.18"/>' + star +
          f'<path d="M820 1080 L1200 840 L1580 1080" fill="none" stroke="{DEEP}" stroke-width="22" stroke-linecap="round" stroke-linejoin="round"/>'
          + stroke(900, 1030, 900, 1400, DEEP, 22) + stroke(1500, 1030, 1500, 1400, DEEP, 22) +
          f'<path d="M1040 1260 H1360 L1310 1390 H1090 Z" fill="{OCHRE}"/>'
          f'<ellipse cx="1215" cy="1238" rx="105" ry="40" fill="{EMBER}"/><circle cx="1098" cy="1226" r="38" fill="{EMBER}"/>'
          + stroke(700, 1400, 1700, 1400, STONE, 8, .8))

def new_year():  # a gate swung open on the first morning (Rev 21:5, all things new)
  return (f'<defs><clipPath id="sky"><rect width="2400" height="1240"/></clipPath></defs>'
          f'<path d="M1020 1240 L1380 1240 L1700 1460 L700 1460 Z" fill="{OCHRE}" fill-opacity="0.25"/>'
          f'<circle cx="1200" cy="1240" r="200" fill="{OCHRE}" clip-path="url(#sky)"/>'
          f'<circle cx="1200" cy="1240" r="290" fill="none" stroke="{OCHRE}" stroke-width="6" stroke-opacity="0.35" clip-path="url(#sky)"/>'
          + stroke(1020, 600, 1020, 1240, DEEP, 26) + stroke(1380, 600, 1380, 1240, DEEP, 26) +
          f'<path d="M1020 660 L760 560 L760 1300 L1020 1240 Z" fill="{EMBER}"/>'
          f'<path d="M1380 660 L1640 560 L1640 1300 L1380 1240 Z" fill="{EMBER}"/>'
          + ''.join(stroke(x, 640, x, 1240, SAND, 8, .55) for x in (840, 920, 1480, 1560))
          + stroke(560, 1240, 1840, 1240, DEEP, 8))

def epiphany():  # the star, and its light falling on every people (Isa 60:3)
  cy = 480
  star = ''.join(f'<path d="M1200 {cy - l} L{1200 + w} {cy} L1200 {cy + l} L{1200 - w} {cy} Z" fill="{SAND}" transform="rotate({a} 1200 {cy})"/>'
                 for a, l, w in [(0, 150, 28), (90, 150, 28), (45, 90, 18), (135, 90, 18)])
  peoples = ''.join(f'<circle cx="{x}" cy="{1250 - abs(x - 1200) * 0.12:.0f}" r="{r}" fill="{c}"/>'
                    for x, r, c in [(620, 44, STONE), (760, 52, OCHRE), (900, 46, EMBER), (1040, 56, SAND),
                                    (1200, 50, OCHRE), (1360, 56, EMBER), (1500, 46, STONE), (1640, 52, SAND), (1780, 44, OCHRE)])
  return (f'<path d="M1180 {cy + 40} L1220 {cy + 40} L1880 1320 L520 1320 Z" fill="{OCHRE}" fill-opacity="0.16"/>'
          f'<circle cx="1200" cy="{cy}" r="130" fill="{SAND}" fill-opacity="0.16"/>' + star + peoples
          + stroke(500, 1330, 1900, 1330, SAND, 6, .5))

def lent():  # a path across the wilderness to the cross on the hill
  dunes = (f'<path d="M0 1200 C620 1080 900 1120 1200 1060 C1500 1000 1820 1060 2400 1170 V1800 H0 Z" fill="{DEEP}" fill-opacity="0.55"/>'
           f'<path d="M0 1320 C700 1220 1000 1260 1300 1230 C1600 1200 1900 1260 2400 1310 V1800 H0 Z" fill="{DEEP}"/>')
  path = ''.join(f'<circle cx="{x:.0f}" cy="{y:.0f}" r="{r:.0f}" fill="{SAND}" fill-opacity="{o:.2f}"/>'
                 for i in range(14)
                 for x, y, r, o in [(760 + i * 34 + 120 * math.sin(i / 2.2), 1440 - i * 26, 15 - i * 0.6, 1 - i * 0.045)])
  return (f'<circle cx="1440" cy="560" r="110" fill="{OCHRE}" fill-opacity="0.5"/>' + dunes
          + stroke(1260, 640, 1260, 1050, SAND, 28) + stroke(1150, 750, 1370, 750, SAND, 28) + path)

def palm(x, y, length, angle, c):  # a palm branch: a stem with leaves swept along it
  s = f'<g transform="rotate({angle} {x} {y})">' + stroke(x, y, x, y - length, c, 14)
  for i in range(1, 12):
    yy, w = y - length * i / 12, 150 * math.sin(math.pi * i / 12) + 30
    s += (f'<path d="M{x} {yy} Q{x - w * 0.6} {yy - 30} {x - w} {yy + 40}" fill="none" stroke="{c}" stroke-width="12" stroke-linecap="round"/>'
          f'<path d="M{x} {yy} Q{x + w * 0.6} {yy - 30} {x + w} {yy + 40}" fill="none" stroke="{c}" stroke-width="12" stroke-linecap="round"/>')
  return s + '</g>'

def holy_week():  # the palm laid down at the foot of the cross
  return (f'<circle cx="1200" cy="760" r="420" fill="{EMBER}" fill-opacity="0.12"/>'
          f'<rect x="1165" y="420" width="70" height="960" rx="10" fill="{SAND}"/>'
          f'<rect x="960" y="620" width="480" height="70" rx="10" fill="{SAND}"/>'
          + palm(1000, 1400, 560, 58, OCHRE) + stroke(600, 1400, 1800, 1400, STONE, 8, .8))

def orthodox_holy_week():  # the Orthodox cross, its footrest slanting up to the right, and a candle
  return (f'<circle cx="1200" cy="820" r="460" fill="{OCHRE}" fill-opacity="0.14"/>'
          f'<rect x="1170" y="380" width="60" height="1020" rx="8" fill="{DEEP}"/>'
          f'<rect x="1080" y="500" width="240" height="50" rx="8" fill="{DEEP}"/>'
          f'<rect x="960" y="640" width="480" height="60" rx="8" fill="{DEEP}"/>'
          f'<rect x="1060" y="1080" width="280" height="50" rx="8" fill="{DEEP}" transform="rotate(-24 1200 1105)"/>'
          f'<rect x="1580" y="1080" width="56" height="300" rx="8" fill="{EMBER}"/>'
          + flame(1608, 1070, 150, 44, OCHRE) + stroke(700, 1400, 1700, 1400, STONE, 8, .8))

def easter():  # the stone rolled away, and morning at the door of the tomb
  return (f'<defs><clipPath id="sky"><rect width="2400" height="1300"/></clipPath></defs>'
          f'<circle cx="1640" cy="1300" r="230" fill="{OCHRE}" clip-path="url(#sky)"/>'
          f'<circle cx="1640" cy="1300" r="320" fill="none" stroke="{OCHRE}" stroke-width="6" stroke-opacity="0.4" clip-path="url(#sky)"/>'
          f'<path d="M500 1300 C540 900 760 700 1060 700 C1360 700 1520 940 1540 1300 Z" fill="{STONE}"/>'
          f'<path d="{arch(880, 960, 300, 1300)}" fill="{INK}"/>'
          f'<path d="M1080 1300 L1180 1180 L1360 1300 Z" fill="{SAND}" fill-opacity="0.35"/>'
          f'<circle cx="1420" cy="1140" r="160" fill="{DEEP}"/><circle cx="1420" cy="1140" r="110" fill="none" stroke="{SAND}" stroke-width="6" stroke-opacity="0.4"/>'
          + stroke(420, 1300, 1980, 1300, DEEP, 8))

def pentecost():  # tongues of fire resting on each one (Acts 2:3)
  s = ''.join(f'<circle cx="1200" cy="900" r="{r}" fill="none" stroke="{OCHRE}" stroke-width="5" stroke-opacity="{o}"/>' for r, o in [(470, .18), (560, .1)])
  for i in range(12):
    a = math.radians(-90 + i * 30)
    x, y = 1200 + 380 * math.cos(a), 900 + 380 * math.sin(a)
    s += flame(round(x), round(y + 55), 130, 40, [EMBER, OCHRE, SAND][i % 3])
  return s + flame(1200, 1060, 330, 110, EMBER) + flame(1200, 1060, 200, 60, OCHRE)

def translation_week():  # the open Book, its word going out in every tongue
  s = (f'<path d="M1200 1080 C1050 1000 820 990 640 1040 V1380 C820 1330 1050 1340 1200 1420 Z" fill="{OCHRE}"/>'
       f'<path d="M1200 1080 C1350 1000 1580 990 1760 1040 V1380 C1580 1330 1350 1340 1200 1420 Z" fill="#E2BC93"/>'
       + stroke(1200, 1080, 1200, 1420, DEEP, 8))
  for i in range(9):
    a = math.radians(-160 + i * 17.5)
    x1, y1 = 1200 + 200 * math.cos(a), 960 + 200 * math.sin(a)
    x2, y2 = 1200 + (420 + 60 * (i % 3)) * math.cos(a), 960 + (420 + 60 * (i % 3)) * math.sin(a)
    c = [EMBER, OCHRE, DEEP][i % 3]
    s += stroke(round(x1), round(y1), round(x2), round(y2), c, 12) + f'<circle cx="{x2:.0f}" cy="{y2:.0f}" r="26" fill="{c}"/>'
  return s

def all_saints():  # a great cloud of witnesses around the race (Heb 12:1)
  s = ''
  for row, (r, n, size) in enumerate([(640, 23, 22), (540, 19, 26), (440, 15, 30)]):
    for i in range(n):
      a = math.radians(190 + i * 160 / (n - 1))
      x, y = 1200 + r * math.cos(a), 1220 + r * 0.85 * math.sin(a)
      s += f'<circle cx="{x:.0f}" cy="{y:.0f}" r="{size}" fill="{[SAND, OCHRE, STONE][(i + row) % 3]}" fill-opacity="{0.55 + row * 0.2:.2f}"/>'
  return (s + f'<path d="M560 1340 C800 1240 1600 1240 1840 1340" fill="none" stroke="{EMBER}" stroke-width="20" stroke-linecap="round"/>'
          + flame(1200, 1210, 200, 60, OCHRE) + flame(1200, 1210, 110, 30, SAND))

def persecuted_church():  # a light kept burning inside a ring of thorns
  s = f'<circle cx="1200" cy="900" r="330" fill="{OCHRE}" fill-opacity="0.12"/>'
  for i in range(3):
    pts = ' '.join(f'{1200 + (420 + 30 * math.sin(k / 3 + i * 2)) * math.cos(math.radians(k * 3 + i * 40)):.0f},'
                   f'{900 + (420 + 30 * math.sin(k / 3 + i * 2)) * 0.62 * math.sin(math.radians(k * 3 + i * 40)):.0f}' for k in range(121))
    s += f'<polyline points="{pts}" fill="none" stroke="{STONE}" stroke-width="16" stroke-linecap="round" stroke-opacity="0.85"/>'
  for i in range(16):
    a = math.radians(i * 22.5 + 8)
    x, y = 1200 + 420 * math.cos(a), 900 + 420 * 0.62 * math.sin(a)
    s += stroke(round(x), round(y), round(x + 70 * math.cos(a + 0.9)), round(y + 70 * math.sin(a + 0.9)), STONE, 10)
  return s + flame(1200, 1040, 340, 110, EMBER) + flame(1200, 1040, 200, 58, OCHRE) + f'<rect x="1150" y="1040" width="100" height="220" rx="10" fill="{SAND}"/>'

def hard_christmas():  # the longest night, and one candle in it (John 1:5)
  return (scatter_stars(11, 14, (520, 420, 1880, 900)) + crescent(1660, 560, 110)
          + f'<circle cx="1200" cy="1000" r="260" fill="{OCHRE}" fill-opacity="0.1"/>'
          + f'<circle cx="1200" cy="1000" r="160" fill="{OCHRE}" fill-opacity="0.14"/>'
          + f'<rect x="1150" y="1040" width="100" height="330" rx="10" fill="{SAND}"/>'
          + flame(1200, 1030, 190, 56, OCHRE) + flame(1200, 1020, 100, 26, SAND)
          + stroke(760, 1380, 1640, 1380, STONE, 8, .7))

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
  'commonPrayerPsalter': ('D', common_prayer, 'Common Prayer Psalter'),
  'weekOfChrist': ('T', week_of_christ, 'Week of Christ'),
  'lordsPrayer': ('V', lords_prayer, "Lord's Prayer Week"),
  'gospelsMonthly': ('D', gospels_month, 'Gospels Monthly'),
  'lifeLoss': ('D', life_loss, 'Seasons of life: Loss'),
  'lifeStress': ('T', life_stress, 'Seasons of life: Stress'),
  'lifeFear': ('V', life_fear, 'Seasons of life: Fear'),
  'lifePeace': ('D', life_peace, 'Seasons of life: Peace'),
  'lifeDepression': ('T', life_depression, 'Seasons of life: Depression'),
  'lifeHope': ('D', life_hope, 'Seasons of life: Hope'),
  'lifeHealing': ('D', life_healing, 'Seasons of life: Healing'),
  'lifeAnger': ('V', life_anger, 'Seasons of life: Anger'),
  'lifeAnxiety': ('T', life_anxiety, 'Seasons of life: Anxiety'),
  'lifeLove': ('D', life_love, 'Seasons of life: Love'),
  'lifePatience': ('D', life_patience, 'Seasons of life: Patience'),
  'lifeDoubt': ('T', life_doubt, 'Seasons of life: Doubt'),
  'lifePride': ('V', life_pride, 'Seasons of life: Pride'),
  'lifeTemptation': ('T', life_temptation, 'Seasons of life: Temptation'),
  'lifeFamily': ('D', life_family, 'Seasons of life: Family'),
  'advent': ('D', advent, 'Advent'),
  'christmas': ('V', christmas, 'Twelve Days of Christmas'),
  'newYear': ('V', new_year, 'A New Year'),
  'epiphany': ('D', epiphany, 'Epiphany'),
  'lent': ('T', lent, 'Lent'),
  'holyWeek': ('D', holy_week, 'Holy Week'),
  'orthodoxHolyWeek': ('V', orthodox_holy_week, 'Holy Week (Orthodox)'),
  'easter': ('V', easter, 'Easter'),
  'pentecost': ('D', pentecost, 'Ascension to Pentecost'),
  'translationWeek': ('V', translation_week, 'The Word in Every Language'),
  'allSaints': ('D', all_saints, 'All Saints'),
  'persecutedChurch': ('D', persecuted_church, 'The Persecuted Church'),
  'hardChristmas': ('D', hard_christmas, 'When Christmas Is Hard'),
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
