"""Build the thesis dataset of the Multiproxy mode from S. Casanova-Arenillas' own data files.

The source files are private (unpublished data, co-authors). The output goes to
examples/tesis_casanova/privado/, which is git-ignored: it is bundled only in the local
standalone build and in the private test page. Do not commit it without the authors' consent.

Usage: python tools/make_thesis_dataset.py "<folder 'Proyectos Investigación'>"
"""

from __future__ import annotations

import csv
import sys
from pathlib import Path

import numpy as np
import openpyxl

OUT = Path(__file__).resolve().parents[1] / "examples" / "tesis_casanova" / "privado"


def num(v):
    try:
        x = float(str(v).replace(",", "."))
        return x if np.isfinite(x) else None
    except (TypeError, ValueError):
        return None


def read_csv(p, enc="latin-1"):
    with open(p, encoding=enc, newline="") as f:
        return list(csv.reader(f))


def sheet(p, name):
    wb = openpyxl.load_workbook(p, read_only=True, data_only=True)
    return list(wb[name].iter_rows(values_only=True))


def write(name, header, rows):
    with open(OUT / name, "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(header)
        for r in rows:
            w.writerow(["" if v is None else (round(v, 6) if isinstance(v, float) else v) for v in r])


def binned(depths, values, width):
    """Mean of values in bins of `width` (same units as depths); returns centre depth and mean."""
    d = np.asarray(depths, float)
    v = np.asarray(values, float)
    k = np.floor(d / width)
    out = []
    for b in np.unique(k):
        m = k == b
        out.append((float(d[m].mean()), float(np.nanmean(v[m]))))
    return out


def icp_name(c):
    return "ICP LOI_pct" if c.startswith("LOI") else f"ICP {c.split(' (')[0]}"


def runs(xs, labels):
    """Contiguous runs of equal labels; boundaries at midpoints between samples."""
    out, start = [], 0
    for i in range(1, len(xs) + 1):
        if i == len(xs) or labels[i] != labels[start]:
            a = xs[start] if start == 0 else (xs[start - 1] + xs[start]) / 2
            b = xs[i - 1] if i == len(xs) else (xs[i - 1] + xs[i]) / 2
            if labels[start]:
                out.append((a, b, labels[start]))
            start = i
    return out


def main(src: Path):
    OUT.mkdir(parents=True, exist_ok=True)
    common = src / "1_Escritura de TESIS" / "6_Datos comunes"
    ivs_depth, ivs_age = [], []

    # ── ODP 977A: ichnology, greyscale, trace areas, TOC (thesis) ──
    rows977 = []
    biot = read_csv(common / "977 biot.csv")[1:]
    for r in biot:
        d, a = num(r[0]), num(r[1])
        if d is None:
            continue
        rows977.append({"depth_m": d / 100, "age_ka": a, "Bioturbacion_trazas_pct": num(r[2]), "BI_trazas": num(r[3]), "ii_trazas": num(r[4]),
                        "Bioturbacion_total_pct": num(r[5]), "BI_total": num(r[6]), "ii_total": num(r[7])})
    g = sheet(common / "977 y 976.xlsx", "977")[2:]
    gd = [(num(r[1]), num(r[2]), num(r[3])) for r in g if num(r[1]) is not None and num(r[3]) is not None]
    for (d, gray), (_, age) in zip(binned([x[0] for x in gd], [x[2] for x in gd], 0.05), binned([x[0] for x in gd], [x[1] for x in gd], 0.05)):
        rows977.append({"depth_m": d, "age_ka": age, "Gris_imagen": gray})
    area = [(num(r[0]), num(r[1]), num(r[2])) for r in read_csv(common / "Area trazas 977.csv")[1:] if num(r[0]) is not None and num(r[2]) is not None]
    A = np.array(area, float)
    k = np.floor(A[:, 0] / 5)  # 5-cm bins (depth in cm)
    for b in np.unique(k):
        m = k == b
        rows977.append({"depth_m": float(A[m, 0].mean()) / 100, "age_ka": float(np.nanmean(A[m, 1])), "Trazas_n_5cm": int(m.sum()),
                        "Trazas_area_media_cm2": float(A[m, 2].mean()), "Trazas_area_total_cm2_5cm": float(A[m, 2].sum())})
    for r in read_csv(common / "TOC 977.csv")[1:]:
        if len(r) < 9 or num(r[8]) is None:
            continue
        rows977.append({"depth_m": num(r[8]) / 100, "age_ka": num(r[0]), "CaCO3_pct": num(r[2]), "TOC_pct": num(r[4]), "TS_pct": num(r[6])})
    pang = read_csv(Path(__file__).resolve().parents[1] / "examples" / "tesis_casanova" / "ODP977A_pangaea.csv", "utf-8")
    ph = pang[0]
    keep = {"SST_alkenonas_C": "SST_alquenonas_C", "C37_4_pct": "C37_4_pct", "L_star": "L_star", "a_star": "a_star", "b_star": "b_star", "MS_kappa_1e-6SI": "MS_kappa_1e-6SI"}
    for r in pang[1:]:
        row = {"depth_m": num(r[0]), "age_ka": num(r[1])}
        vals = {new: num(r[ph.index(old)]) for old, new in keep.items()}
        if any(v is not None for v in vals.values()):
            rows977.append({**row, **vals})
    cols977 = ["Bioturbacion_trazas_pct", "BI_trazas", "ii_trazas", "Bioturbacion_total_pct", "BI_total", "ii_total", "Gris_imagen",
               "Trazas_n_5cm", "Trazas_area_media_cm2", "Trazas_area_total_cm2_5cm", "CaCO3_pct", "TOC_pct", "TS_pct",
               "SST_alquenonas_C", "C37_4_pct", "L_star", "a_star", "b_star", "MS_kappa_1e-6SI"]
    rows977.sort(key=lambda r: r["depth_m"])
    # One depth–age relation for every row: the ichnology table of the author (+ Martrat et al. 2004 below it).
    pairs = sorted({(r["depth_m"], r["age_ka"]) for r in rows977 if "Bioturbacion_trazas_pct" in r or "SST_alquenonas_C" in r if r["age_ka"] is not None})
    dz, az = np.array([p[0] for p in pairs]), np.array([p[1] for p in pairs])
    for r in rows977:
        r["age_ka"] = float(np.interp(r["depth_m"], dz, az)) if dz[0] <= r["depth_m"] <= dz[-1] else None
    write("ODP977A_tesis.csv", ["depth_m", "age_ka", *cols977], [[r["depth_m"], r["age_ka"], *[r.get(c) for c in cols977]] for r in rows977])

    # 977 events (H1–H6 and MIS boundaries, thesis graph file), new ORLs a–f (Marine Geology 2021 work)
    ev = read_csv(common / "Eventos.csv")[1:]
    hs = [(num(r[0]), r[2].strip()) for r in ev if num(r[0]) is not None and r[2].strip()]
    for i in range(0, len(hs) - 1, 2):
        name = hs[i][1].lower().replace("inicio", "").strip().upper().replace(" ", "")
        ivs_age.append(("ODP 977A", hs[i][0], hs[i + 1][0], "Periodo climático", f"{name} (estadial Heinrich)", "Eventos.csv (tesis)"))
    mis = [(num(r[4]), r[6].strip()) for r in ev if len(r) > 6 and num(r[4]) is not None]
    prev = 0.0
    for a, name in mis:
        ivs_age.append(("ODP 977A", prev, a, "MIS", name, "Eventos.csv (tesis)"))
        prev = a
    for r in read_csv(common / "ORLs 977 NEW.csv")[1:]:
        name = r[0].strip()
        if name.startswith("ORL ") and name != "ORL g" and num(r[1]) is not None and num(r[4]) is not None and num(r[4]) > num(r[1]):
            ivs_age.append(("ODP 977A", num(r[1]), num(r[4]), "Capas orgánicas", "ORL nueva (sin tipo)", f"ORLs 977 NEW.csv ({name})"))

    # ── GP03: XRF core scanner (labels by the author), ICP, magnetic susceptibility, benthic foraminifera ──
    gp = src / "Articulos" / "2024_paleo3" / "2_Datos y Materiales" / "1_originales sin tocar"
    rel = sheet(gp / "XRF 2022.xlsx", "Relations (last secction delete")
    lab = sheet(gp / "XRF 2022.xlsx", "Sheet1")
    H = list(rel[0])
    want = ["Ca/Ti", "Ti/Al", "Ti/Ca", "Zr/Rb", "Zr/Ti", "Mn/Ti", "Mn/Al", "Ba/Al", "Ba/Ti", "Br/Ti", "K/Ti", "K/Al", "K/Rb", "Fe/Ca", "Si/Ti", "Sr/Ca", "S/Cl", "Br/Cl", "Cu/Ti"]
    ix = [H.index(c) for c in want]
    xrf = [(num(r[0]), num(r[1])) for r in rel[1:]]
    depth_age = [(d, a / 1000) for d, a in xrf if d is not None and a is not None]
    dA = np.array(depth_age)
    age_at = lambda d: float(np.interp(d, dA[:, 0], dA[:, 1])) if dA[0, 0] <= d <= dA[-1, 0] else None
    rowsgp = []
    for r in rel[1:]:
        d = num(r[0])
        if d is None:
            continue
        rowsgp.append({"depth_cm": d, **{f"XRF {c}": num(r[i]) for c, i in zip(want, ix)}})
    # labels aligned by row with the XRF sheet (same age column)
    xs, per, clim, orl = [], [], [], []
    for r, l in zip(rel[1:], lab[1:]):
        d = num(r[0])
        if d is None:
            continue
        xs.append(d)
        per.append({"Holocene": "Holoceno", "BA": "Bølling-Allerød", "YD": "Younger Dryas", "LGM": "Último Máximo Glacial"}.get(l[3], f"{l[3]} (estadial Heinrich)" if l[3] else None))
        clim.append({"warm": "Cálido", "cold": "Frío", "mild": "Templado"}.get(str(l[2]).strip().lower()))
        orl.append({"ORL": "ORL (sin tipo)", "NO ORL": "Fuera de capa orgánica"}.get(str(l[4]).strip()))
    for layer, labs in [("Periodo climático", per), ("Clima", clim), ("Capas orgánicas", orl)]:
        for a, b, v in runs(xs, labs):
            if layer == "Periodo climático" and b - a < 1.5:   # single-sample markers (H2–H5) are not intervals
                continue
            ivs_depth.append(("GP03", a, b, "cm", layer, v, "XRF 2022.xlsx, etiquetas del autor"))
    orl_runs = [(a, b) for a, b, v in runs(xs, orl) if v == "ORL (sin tipo)"]
    icp = sheet(gp / "ICP GP03 2022.xlsx", "TODO")
    Hi = list(icp[0])
    wi = ["Al2O3 (%)", "CaO (%)", "TiO2 (%)", "Fe2O3 (%)", "MnO (%)", "LOI(%)(sd 0,03)", "Ba", "Ba/Al", "Mo", "U", "V", "Cr", "Ni", "Cu", "Zr", "Rb", "Ti/Ca"]
    for r in icp[1:]:
        d = num(r[Hi.index("Depth with corrections")])
        if d is not None:
            rowsgp.append({"depth_cm": d, **{icp_name(c): num(r[Hi.index(c)]) for c in wi}})
    for r in sheet(gp / "GP03-MagSus-Limpio.xlsx", "Hoja1")[1:]:
        if num(r[3]) is not None and num(r[4]) is not None:
            rowsgp.append({"depth_cm": num(r[3]), "Susceptibilidad_LF_1e-8_m3kg": num(r[4]) * 1e8})
    fo = sheet(gp / "Data foraminifera GP03 260422.xlsx", "Sheet3")
    for r in fo[1:]:
        if num(r[1]) is None or num(r[2]) is None:
            continue
        rowsgp.append({"depth_cm": num(r[1]), "Bentonicos_alto_O2_pct": num(r[2]), "Bentonicos_bajo_O2_pct": num(r[3]), "Gyroidina_pct": num(r[4]),
                       "Bentonicos_flujo_organico_pct": num(r[5]), "Hyalinea_balthica_pct": num(r[6])})
    colsgp = [f"XRF {c}" for c in want] + [icp_name(c) for c in wi] + ["Susceptibilidad_LF_1e-8_m3kg", "Bentonicos_alto_O2_pct", "Bentonicos_bajo_O2_pct",
                                                                                 "Gyroidina_pct", "Bentonicos_flujo_organico_pct", "Hyalinea_balthica_pct"]
    rowsgp.sort(key=lambda r: r["depth_cm"])
    write("GP03_tesis.csv", ["depth_cm", "age_ka", *colsgp], [[r["depth_cm"], age_at(r["depth_cm"]), *[r.get(c) for c in colsgp]] for r in rowsgp])
    with open(OUT / "GP03_age_model.txt", "w", encoding="utf-8") as f:
        f.write("# GP03 age model (depth cm, age ka) from the XRF table 'Age vs2' of the author (XRF 2022.xlsx), every ~10 cm\n")
        for d, a in depth_age[::10] + [depth_age[-1]]:
            f.write(f"{d},{round(a, 4)}\n")
    # ORL 1 phases (thesis chapter VIII, ages) clipped to the ORL marked in the data
    if orl_runs:
        top_age = max(age_at(b) or 0 for a, b in orl_runs)
        for a, b, v in [(min(15, top_age), 11.7, "Fase euxínica"), (11.7, 9, "Fase subóxica")]:
            ivs_age.append(("GP03", a, b, "Fases internas", v, "Tesis cap. VIII"))

    # ── LC10: ITRAX ratios (1-cm means) and ICP enrichment factors ──
    lc = read_csv(src / "Articulos en proceso de publicacion" / "2_EasternMed and Southampton" / "Eastern basin" / "Datos comunes" / "ICP y XRF LC10.csv")
    h = lc[0]
    rat = {i: h[i].replace("/ti", "/Ti") for i in range(15, len(h)) if h[i].strip()}
    xr = [(num(r[14]), {n: num(r[i]) for i, n in rat.items()}) for r in lc[1:] if len(r) > 15 and num(r[14]) is not None]
    rowslc = []
    D = np.array([d for d, _ in xr])
    k = np.floor(D)
    for b in np.unique(k):
        m = np.where(k == b)[0]
        row = {"depth_cm": float(D[m].mean())}
        for n in rat.values():
            vals = [xr[i][1][n] for i in m if xr[i][1][n] is not None]
            row[f"XRF {n}"] = float(np.mean(vals)) if vals else None
        rowslc.append(row)
    efs = [h[i] for i in range(2, 10)]
    for r in lc[1:]:
        if num(r[0]) is not None and any(num(r[i]) is not None for i in range(2, 10)):
            rowslc.append({"depth_cm": num(r[0]), **{f"ICP {e}": num(r[i]) for i, e in zip(range(2, 10), efs)}})
    colslc = [f"XRF {n}" for n in rat.values()] + [f"ICP {e}" for e in efs]
    rowslc.sort(key=lambda r: r["depth_cm"])
    write("LC10_tesis.csv", ["depth_cm", *colslc], [[r["depth_cm"], *[r.get(c) for c in colslc]] for r in rowslc])

    # ── ODP 976 ORLs A1–A6 (thesis files; types from thesis Table VII.3) ──
    types = {"A1": "ORL tipo 1 (bioturbada)", "A2": "ORL tipo 1 (bioturbada)", "A3": "ORL tipo 2 (larga y cíclica)", "A4": "ORL tipo 2 (larga y cíclica)",
             "A5": "ORL (sin tipo)", "A6": "ORL tipo 1 (bioturbada)"}
    a976 = []
    for r in read_csv(common / "ORLs 976.csv")[1:]:
        if len(r) > 9 and r[9].strip() in types and num(r[3]) is not None:
            a976.append((num(r[3]), num(r[4]), types[r[9].strip()], r[9].strip()))
    prev = 0.0
    for a, b, v, name in sorted(a976):
        if a > prev:
            ivs_age.append(("ODP 976", prev, a, "Capas orgánicas", "Fuera de capa orgánica", "complemento de las ORL A1-A6"))
        ivs_age.append(("ODP 976", a, b, "Capas orgánicas", v, f"ORLs 976.csv ({name}); tipo de la tesis Tabla VII.3"))
        prev = b
    ivs_age.append(("ODP 976", prev, 135, "Capas orgánicas", "Fuera de capa orgánica", "complemento de las ORL A1-A6"))

    with open(OUT / "intervals_age.csv", "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["core", "top_ka", "bottom_ka", "layer", "value", "source"])
        w.writerows(ivs_age)
    with open(OUT / "intervals_depth.csv", "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["core", "top", "bottom", "units", "layer", "value", "source"])
        w.writerows([(c, round(a, 3), round(b, 3), u, l, v, s) for c, a, b, u, l, v, s in ivs_depth])
    print("977:", len(rows977), "GP03:", len(rowsgp), "LC10:", len(rowslc), "intervals:", len(ivs_age), "+", len(ivs_depth))


if __name__ == "__main__":
    main(Path(sys.argv[1]))
