#!/usr/bin/env python3
"""Haalt schadebeelden uit de Digigids (https://digigids.stowa.nl) en schrijft ze als JSON.

Gebruik:  python3 scripts/digigids.py /gids/steenbekledingen > digigids.json

Per schadebeeld: element, naam, omschrijving en per klasse (Goed, Redelijk, Matig, Slecht) het criterium,
de paden van de voorbeeldfoto's en hun bijschriften (alt-teksten). js/digigids.js is hieruit samengesteld; de koppeling met de
STOWA-inspectiewijzers (veld "wijzer") is daar met de hand gelegd.
"""
import html
import json
import re
import sys
import time
import urllib.request

BASE = 'https://digigids.stowa.nl'


def haal(pad):
    with urllib.request.urlopen(BASE + pad, timeout=40) as r:
        return r.read().decode('utf-8')


def tekst(s):
    return ' '.join(html.unescape(re.sub(r'<[^>]+>', ' ', s)).split())


def main(start):
    gezien, rij, uit = set(), [start], []
    while rij:
        pad = rij.pop(0)
        if pad in gezien:
            continue
        gezien.add(pad)
        t = haal(pad)
        time.sleep(0.3)
        rij += [m for m in re.findall(r"href=['\"](" + re.escape(start) + r"/[^'\"#?]+)['\"]", t) if m not in gezien]
        main_ = re.sub(r'<script.*?</script>', '', t[t.find('<main'):t.find('</main>')], flags=re.S)
        if '</h1>' not in main_ or '<h2' not in main_:
            continue  # overzichtspagina, geen schadebeeld
        titel = tekst(re.search(r'<h1[^>]*>(.*?)</h1>', main_, re.S).group(1))
        na = main_[main_.find('</h1>') + 5:]
        klassen = [{
            'klasse': tekst(m.group(1)),
            'criterium': tekst(' '.join(re.findall(r'<p[^>]*>(.*?)</p>', m.group(2), re.S))),
            'fotos': sorted(set(re.findall(r'(/sites/default/files/styles/large_43/public/[^"\'?\s]+)', m.group(2)))),
            # Sommige schadebeelden hebben geen criteriumtekst; dan staat de omschrijving alleen bij de foto's.
            'fotoOmschrijving': sorted({tekst(x) for x in re.findall(r'alt="([^"]*)"', m.group(2)) if tekst(x)}),
        } for m in re.finditer(r'<h2[^>]*>(.*?)</h2>(.*?)(?=<h2|$)', na, re.S)]
        if not any(k['klasse'] in ('Goed', 'Redelijk', 'Matig', 'Slecht') for k in klassen):
            continue  # overzichtspagina, geen schadebeeld
        uit.append({'pad': pad, 'url': BASE + pad, 'element': pad.strip('/').split('/')[2] if pad.count('/') >= 3 else '',
                    'naam': titel, 'omschrijving': tekst(na[:na.find('<h2')]), 'klassen': klassen})
    json.dump(uit, sys.stdout, ensure_ascii=False, indent=1)


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else '/gids/steenbekledingen')
