#!/usr/bin/env python3
"""Resume las expediciones Madrid <-> Talavera de un GTFS de Samar.

Uso: python -I scripts/analiza_gtfs.py <dir_gtfs_descomprimido> [--csv salida.csv]
Para cada trip que pasa por una parada de Madrid y por Talavera calcula, entre esas
dos paradas: paradas intermedias, si pasa por Santa Olalla y la duracion.
"""
import csv, sys
from collections import defaultdict

MADRID = {"341": "Estación Sur", "1027": "Aeropuerto T1", "1119": "Aeropuerto T4"}
TALAVERA, SANTA_OLALLA = "261", "873"


def read(d, name):
    with open(f"{d}/{name}.txt", newline="", encoding="utf-8-sig") as f:
        # los ficheros de Samar llevan espacios tras las comas, tanto en cabecera como en valores
        return [{k.strip(): (v or "").strip() for k, v in r.items()} for r in csv.DictReader(f, skipinitialspace=True)]


def mins(t):
    h, m, _ = map(int, t.split(":"))
    return h * 60 + m


def analyse(d):
    routes = {r["route_id"]: r for r in read(d, "routes")}
    trips = {t["trip_id"]: t for t in read(d, "trips")}
    names = {s["stop_id"]: s["stop_name"] for s in read(d, "stops")}
    cal = {c["service_id"]: "".join(c[k] for k in ("monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday")) for c in read(d, "calendar")}
    st = defaultdict(list)
    for r in read(d, "stop_times"):
        st[r["trip_id"]].append(r)
    rows = []
    for tid, times in st.items():
        times.sort(key=lambda r: int(r["stop_sequence"]))
        ids = [r["stop_id"] for r in times]
        if TALAVERA not in ids or not MADRID.keys() & set(ids):
            continue
        i_tal = ids.index(TALAVERA)
        # parada de Madrid más cercana a Talavera dentro del trip (la última antes / la primera después)
        mad_idx = [i for i, s in enumerate(ids) if s in MADRID]
        i_mad = max((i for i in mad_idx if i < i_tal), default=None)
        if i_mad is None:
            i_mad = min(i for i in mad_idx if i > i_tal)
        a, b = sorted((i_mad, i_tal))
        t = trips[tid]
        rt = routes[t["route_id"]]
        rows.append({
            "linea": rt["route_short_name"],
            "nombre": rt["route_long_name"],
            "trip_id": tid,
            "sentido": "Madrid→Talavera" if i_mad < i_tal else "Talavera→Madrid",
            "madrid": MADRID[ids[i_mad]],
            "salida": times[a]["departure_time"][:5],
            "llegada": times[b]["arrival_time"][:5],
            # el feed repite a veces la misma parada seguida (p. ej. Cruce El Bravo): contar únicas
            "intermedias": len(set(ids[a + 1:b])),
            "santa_olalla": SANTA_OLALLA in ids[a:b + 1],
            # el feed de Samar vuelve a 00:xx tras medianoche en vez de usar 24:xx
            "duracion_min": (mins(times[b]["arrival_time"]) - mins(times[a]["departure_time"])) % 1440,
            "paradas": " > ".join(names[s] for s in ids[a:b + 1]),
            "dias_LMXJVSD": cal.get(t["service_id"], "?"),
        })
    return sorted(rows, key=lambda r: (r["sentido"], r["salida"]))


def summary(rows):
    g = defaultdict(list)
    for r in rows:
        g[(r["linea"], r["nombre"], r["sentido"], r["madrid"])].append(r)
    out = []
    for (linea, nombre, sentido, madrid), rs in sorted(g.items()):
        inter = sorted({r["intermedias"] for r in rs})
        dur = [r["duracion_min"] for r in rs]
        so = {r["santa_olalla"] for r in rs}
        out.append(f"{linea:>4} | {nombre[:38]:38} | {sentido:16} | {madrid:13} | expediciones={len(rs):3} | intermedias={inter} | "
                   f"StaOlalla={'sí' if so == {True} else 'no' if so == {False} else 'mixto'} | dur={min(dur)}-{max(dur)} min")
    return out


if __name__ == "__main__":
    assert mins("25:10:00") == 1510  # GTFS permite horas > 24
    rows = analyse(sys.argv[1])
    print("\n".join(summary(rows)))
    if "--csv" in sys.argv:
        with open(sys.argv[sys.argv.index("--csv") + 1], "w", newline="") as f:
            w = csv.DictWriter(f, fieldnames=rows[0].keys())
            w.writeheader(); w.writerows(rows)
