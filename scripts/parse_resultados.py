#!/usr/bin/env python3
"""Extrae las expediciones del HTML de resultados de samar.es
(/horarios/autobuses/<slug>/<slug>/<origen>/<destino>?IsOneWay=true&OutboundDate=AAAA-MM-DD).

Uso: python -I scripts/parse_resultados.py <resultados.html> [--json salida.json]
"""
import html, json, re, sys

CARD = re.compile(r'<div class="journey-card[^"]*"(.*?)(?=<div class="journey-card[ "]|<footer|\Z)', re.S)
ATTR = re.compile(r'data-([a-z-]+)="([^"]*)"')
STOP = re.compile(r'itinerary-stop-name[^"]*">([^<]+)</span>.*?itinerary-stop-time[^"]*">([^<]+)</div>', re.S)
LINE = re.compile(r'<div class="small text-muted mb-2">([^<]+)</div>')
DAYS = re.compile(r'day-badge">([^<]+)</span>')
DUR = re.compile(r'time-duration">([^<]+)</div>')


def parse(page):
    out = []
    for m in CARD.finditer(page):
        body = m.group(1)
        a = dict(ATTR.findall(body.split(">", 1)[0]))  # solo los atributos de la propia tarjeta
        if "expedition" not in a:
            continue
        stops = [(html.unescape(n).strip(), t.strip().rstrip("h")) for n, t in STOP.findall(body)]
        line = LINE.search(body)
        out.append({
            "expedition": a["expedition"],
            "line": html.unescape(line.group(1)).split(" - ")[0].strip() if line else None,
            "departure": a.get("departure-time"),
            "arrival": a.get("arrival-time"),
            "duration": (DUR.search(body) or [None, None])[1],
            "days": "".join(DAYS.findall(body)),
            "price": a.get("price"),
            "can_buy_online": a.get("can-buy-online"),
            "purchase_codes": [a.get("origin-purchase-code"), a.get("destination-purchase-code")],
            "stops": stops,
            "intermediate": len(stops) - 2,
            "santa_olalla": any(n == "Santa Olalla" for n, _ in stops),
        })
    return out


if __name__ == "__main__":
    sample = '<div class="journey-card" data-expedition="1" data-departure-time="07:00"><div class="small text-muted mb-2">909 - 909</div><span class="itinerary-stop-name fw-semibold">A</span></div><div class="itinerary-stop-time fw-semibold">07:00h</div>'
    assert parse(sample)[0]["line"] == "909" and parse(sample)[0]["stops"] == [("A", "07:00")]
    trips = parse(open(sys.argv[1], encoding="utf-8").read())
    for t in trips:
        mid = " > ".join(n for n, _ in t["stops"][1:-1])
        print(f'{t["departure"]}-{t["arrival"]} {t["line"]:>4} exp={t["expedition"]:<7} {t["days"]:<7} int={t["intermediate"]:>2} SO={"sí" if t["santa_olalla"] else "no"} | {t["stops"][0][0]} > … > {t["stops"][-1][0]} | {mid[:70]}')
    print(len(trips), "expediciones")
    if "--json" in sys.argv:
        json.dump(trips, open(sys.argv[sys.argv.index("--json") + 1], "w"), ensure_ascii=False, indent=1)
