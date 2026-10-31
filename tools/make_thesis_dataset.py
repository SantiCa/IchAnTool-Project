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
    fc = sheet(gp / "Data foraminifera GP03 260422.xlsx", "core GP03")
    for r in fc[1:]:
        if num(r[3]) is None:
            continue
        rowsgp.append({"depth_cm": num(r[3]), "Foram_arena_63um_pct": num(r[6]), "Foram_P_B_pct": num(r[8]), "Foram_bentonicos_riqueza_S": num(r[14]),
                       "Foram_bentonicos_N_g": num(r[17])})
    colsgp = [f"XRF {c}" for c in want] + [icp_name(c) for c in wi] + ["Susceptibilidad_LF_1e-8_m3kg", "Bentonicos_alto_O2_pct", "Bentonicos_bajo_O2_pct",
                                                                                 "Gyroidina_pct", "Bentonicos_flujo_organico_pct", "Hyalinea_balthica_pct",
                                                                                 "Foram_arena_63um_pct", "Foram_P_B_pct", "Foram_bentonicos_riqueza_S", "Foram_bentonicos_N_g"]
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

    print("otros sondeos:", extra_cores(src, ivs_age, ivs_depth))

    with open(OUT / "intervals_age.csv", "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["core", "top_ka", "bottom_ka", "layer", "value", "source"])
        w.writerows(ivs_age)
    with open(OUT / "intervals_depth.csv", "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["core", "top", "bottom", "units", "layer", "value", "source"])
        w.writerows([(c, round(a, 3), round(b, 3), u, l, v, s) for c, a, b, u, l, v, s in ivs_depth])
    print("977:", len(rows977), "GP03:", len(rowsgp), "LC10:", len(rowslc), "intervals:", len(ivs_age), "+", len(ivs_depth))



# ───────────── V16: the other cores of the thesis folder ─────────────
RATIOS = [("Ti", "Ca"), ("Fe", "Ca"), ("Zr", "Ti"), ("Zr", "Rb"), ("Mn", "Ti"), ("Ba", "Ti"), ("Br", "Cl"), ("S", "Cl"),
          ("Sr", "Ca"), ("K", "Ti"), ("Si", "Ti"), ("Rb", "Ti"), ("Fe", "Ti")]


def xrf_ratios(depths, elem):
    """1-cm means of XRF element ratios. depths (cm) and elem {name: values}; zero or missing denominators are skipped."""
    d = np.asarray(depths, float)
    out = {}
    for a, b in RATIOS:
        if a in elem and b in elem:
            x, y = np.asarray(elem[a], float), np.asarray(elem[b], float)
            with np.errstate(divide="ignore", invalid="ignore"):
                out[f"XRF {a}/{b}"] = np.where((y > 0) & np.isfinite(x) & np.isfinite(y), x / y, np.nan)
    rows = []
    k = np.floor(d)
    for bk in np.unique(k[np.isfinite(k)]):
        m = k == bk
        row = {"depth_cm": round(float(d[m].mean()), 3)}
        for n, v in out.items():
            vv = v[m]
            vv = vv[np.isfinite(vv)]
            row[n] = float(vv.mean()) if len(vv) else None
        rows.append(row)
    return rows, list(out)


def itrax_txt(p):
    """ITRAX result.txt (tab separated, 'peakarea' block): position (mm) and element counts of valid points."""
    lines = Path(p).read_text(encoding="latin-1").splitlines()
    i = next(j for j, l in enumerate(lines) if l.startswith("filename"))
    H = [h.strip() for h in lines[i].split("\t")]
    pos, el = [], {h: [] for h in H[3:] if h}
    for l in lines[i + 1:]:
        c = l.split("\t")
        if len(c) < len(H) - 1 or num(c[2]) != 1:
            continue
        pos.append(num(c[1]))
        for j, h in enumerate(H[3:], 3):
            if h:
                el[h].append(num(c[j]) if j < len(c) else None)
    return np.array(pos, float), {h: np.array([np.nan if v is None else v for v in vs], float) for h, vs in el.items()}


def write_core(name, rows, cols, age=False):
    rows.sort(key=lambda r: r["depth_cm"])
    head = ["depth_cm", "age_ka"] if age else ["depth_cm"]
    write(f"{name}_tesis.csv", head + cols, [[r["depth_cm"], *([r.get("age_ka")] if age else []), *[r.get(c) for c in cols]] for r in rows])
    return len(rows)


def extra_cores(src, ivs_age, ivs_depth):
    pub = src / "Articulos en proceso de publicacion"
    em = pub / "2_EasternMed and Southampton"
    manifest, n = [], {}

    # GP14 (Alboran): pellet XRF (FRX) oxides/ppm, ICP-MS trace elements, ratios and EF; age of each sample from the author's table
    wb = openpyxl.load_workbook(pub / "3_GP14_Alboranbasin" / "Datos geoquimicas_santiago.xlsx", read_only=True, data_only=True)
    todo = list(wb["todo"].iter_rows(values_only=True))
    H = list(todo[0])
    frx = H[3:23]
    icp = H[23:]
    rows = []
    for r in todo[1:]:
        if num(r[1]) is None:
            continue
        row = {"depth_cm": num(r[1]), "age_ka": num(r[2]) / 1000 if num(r[2]) is not None else None}
        for i, c in enumerate(frx, 3):
            row[f"FRX {c.replace(' (%)', '_pct').replace(' (PPM)', '_ppm')}"] = num(r[i])
        for i, c in enumerate(icp, 23):
            row[f"ICP {c}"] = num(r[i])
        rows.append(row)
    rat = list(wb["ratios"].iter_rows(values_only=True))
    Hr = [c for c in rat[0]]
    keep = [j for j, c in enumerate(Hr) if c and (" EF" in c or "/" in c or c.startswith("U aut"))]
    byd = {r["depth_cm"]: r for r in rows}
    for r in rat[1:]:
        d = num(r[1])
        if d is None:
            continue
        row = byd.setdefault(d, {"depth_cm": d})
        for j in keep:
            row[f"ICP {Hr[j].replace('U aut (U//Th/3))', 'U aut')}"] = num(r[j])
    rows = list(byd.values())
    cols = [f"FRX {c.replace(' (%)', '_pct').replace(' (PPM)', '_ppm')}" for c in frx] + [f"ICP {c}" for c in icp]
    cols += [f"ICP {Hr[j].replace('U aut (U//Th/3))', 'U aut')}" for j in keep if f"ICP {Hr[j]}" not in cols]
    cols = list(dict.fromkeys(cols))
    n["GP14"] = write_core("GP14", rows, cols, age=True)
    manifest.append({"name": "GP14", "file": "GP14_tesis.csv", "units": "cm", "age": True,
                     "note": "Alborán (Big One West off mound); FRX en pastilla, ICP-MS, ratios y EF; edad de cada muestra de la tabla del autor"})

    # LC21 (Aegean, Kasos Strait): magnetic susceptibility and greyscale, ARM, Sr–Nd isotopes, planktonic foraminifera isotopes (Amies et al., 2019),
    # biomarkers and Nd–Sm (PANGAEA); age model 'Generado por mi' (Age models.xlsx)
    c21 = pub / "capitulo LC10 and 21 southampton" / "LC21" / "DATA"
    am = list(openpyxl.load_workbook(c21 / "Data Raw" / "Age models.xlsx", read_only=True, data_only=True)["Generado por mi"].iter_rows(values_only=True))[1:]
    model = [(num(a), num(b)) for a, b in am if num(a) is not None and num(b) is not None]
    with open(OUT / "LC21_age_model.txt", "w", encoding="utf-8") as f:
        f.write("# LC21 age model (depth cm, age ka): sheet 'Generado por mi' of Age models.xlsx (14C, tephra, RSL tie points), every 10 cm\n")
        for d, a in model[::10] + [model[-1]]:
            f.write(f"{d},{round(a, 4)}\n")
    rows = []
    for l in (c21 / "Procesed Data" / "Nueva carpeta" / "Magnetic and color data.dat").read_text(encoding="latin-1").splitlines()[1:]:
        c = l.split(",")
        if len(c) >= 5 and num(c[0]) is not None:
            rows.append({"depth_cm": num(c[0]), "Susceptibilidad_magnetica_SI": num(c[3]), "Gris_reflectancia": num(c[4])})
    ms = list(openpyxl.load_workbook(c21 / "Data Raw" / "Magnetic propieties" / "MagSusc_LC21_nov2021" / "LC21 Mag susc_Santiago.xlsx", read_only=True, data_only=True).worksheets[0].iter_rows(values_only=True))
    for r in ms[2:]:
        if num(r[1]) is not None and num(r[10]) is not None:
            rows.append({"depth_cm": num(r[1]), "Susceptibilidad_masica_muestras": num(r[10])})
    arm = list(openpyxl.load_workbook(c21 / "Procesed Data" / "LC21_ARMdata.xlsx", read_only=True, data_only=True)["Sheet1"].iter_rows(values_only=True))
    ia = list(arm[0]).index("Intensity")
    for r in arm[1:]:
        if num(r[1]) is not None and num(r[ia]) is not None:
            rows.append({"depth_cm": num(r[1]), "ARM_intensidad": num(r[ia])})
    sr = list(openpyxl.load_workbook(c21 / "Procesed Data" / "Sr _Nd resulkts.xlsx", read_only=True, data_only=True).worksheets[0].iter_rows(values_only=True))
    for r in sr[1:]:
        if num(r[2]) is not None:
            rows.append({"depth_cm": num(r[2]), "eNd": num(r[7]), "Sr87_86": num(r[13])})

    def pangaea(p):
        L = Path(p).read_text(encoding="utf-8", errors="replace").splitlines()
        i = L.index("*/")
        return L[i + 1].split("\t"), [l.split("\t") for l in L[i + 2:] if l.strip()]
    h, data = pangaea(c21 / "From other publications" / "Amies-etal_2019" / "datasets" / "LC21_S5_multispecies.tab")
    di = h.index("Depth [m] (Downhole depth)")
    iso = [(j, c.split(" [")[0].replace(" ", "_").replace("δ", "d")) for j, c in enumerate(h) if "δ" in c]
    for r in data:
        if num(r[di]) is not None:
            rows.append({"depth_cm": num(r[di]) * 100, **{f"Foram_{nm}": num(r[j]) if j < len(r) else None for j, nm in iso}})
    h, data = pangaea(c21 / "From other publications" / "MD81-LC21_biomarker.tab")
    for r in data:
        if num(r[1]) is not None:
            rows.append({"depth_cm": num(r[1]) * 100, "BHT_TOC_ug_g": num(r[5]), "Lad_OC_ng_g": num(r[6])})
    h, data = pangaea(c21 / "From other publications" / "MD81-LC21_Nd_Sm_isotope.tab")
    for r in data:
        if num(r[0]) is not None:
            rows.append({"depth_cm": num(r[0]) * 100, "eNd_Osborne2010": num(r[3]), "Nd_mg_kg": num(r[5])})
    cols = ["Susceptibilidad_magnetica_SI", "Gris_reflectancia", "Susceptibilidad_masica_muestras", "ARM_intensidad", "eNd", "Sr87_86",
            *[f"Foram_{nm}" for _, nm in iso], "BHT_TOC_ug_g", "Lad_OC_ng_g", "eNd_Osborne2010", "Nd_mg_kg"]
    n["LC21"] = write_core("LC21", rows, cols)
    manifest.append({"name": "LC21", "file": "LC21_tesis.csv", "units": "cm", "ageModel": "LC21_age_model.txt", "lat": 35.66, "lon": 26.58, "wd": 1522,
                     "note": "Egeo (estrecho de Kasos); susceptibilidad, gris, ARM, Sr-Nd del autor; isótopos de foraminíferos planctónicos (Amies et al., 2019), biomarcadores y Nd-Sm (PANGAEA)"})
    for s, a, b in [("S1", 6.1, 8.3), ("S3", 80.8, 85.8), ("S4", 101.8, 107.8), ("S5", 121, 128.3)]:
        ivs_age.append(("LC21", a, b, "Capas orgánicas", "Sapropel", f"Age models.xlsx, hoja 'Sapropel ages' ({s})"))
    ivs_age.append(("LC21", 104, 105.4, "Fases internas", "Interrupción", "Age models.xlsx (S4 interruption)"))

    # LC12 (Eastern basin): ITRAX ratios from the author's Grapher table (depth cm)
    L = (em / "Eastern basin" / "LC12" / "Poyecto Grapher" / "Proyecto de grapher LC12.dat").read_text(encoding="latin-1").splitlines()
    H = L[0].split(",")
    name = {h: "XRF " + h.replace(" (NORM)", "_norm").replace("ti/ca", "Ti/Ca").replace("/ti", "/Ti") for h in H[1:-1]}
    raw = []
    for l in L[1:]:
        c = l.split(",")
        if num(c[0]) is not None:
            raw.append((num(c[0]), {name[h]: num(c[j]) for j, h in enumerate(H[1:-1], 1)}))
    rows = []
    D = np.array([d for d, _ in raw])
    for bk in np.unique(np.floor(D)):
        m = np.where(np.floor(D) == bk)[0]
        row = {"depth_cm": round(float(D[m].mean()), 3)}
        for nm in name.values():
            v = [raw[i][1][nm] for i in m if raw[i][1][nm] is not None]
            row[nm] = float(np.mean(v)) if v else None
        rows.append(row)
    n["LC12"] = write_core("LC12", rows, list(name.values()))
    manifest.append({"name": "LC12", "file": "LC12_tesis.csv", "units": "cm", "note": "Cuenca oriental; ratios ITRAX del proyecto Grapher del autor (medias de 1 cm). Sin coordenadas: añádelas con ✎"})

    # LC01 (Western basin): ITRAX normalised table, depth in mm
    ws = openpyxl.load_workbook(em / "Western basin" / "MD81_LC 01" / "DATOS" / "MD81_LC01_TOTAL NORMALIZADO.xlsx", read_only=True, data_only=True).worksheets[0]
    it = ws.iter_rows(values_only=True)
    H = list(next(it))
    els = [h for h in H[11:] if h and h.isalpha() and len(h) <= 2]
    dep, el = [], {e: [] for e in els}
    for r in it:
        if num(r[1]) is None or num(r[4]) != 1:
            continue
        dep.append(num(r[1]) / 10)
        for e in els:
            v = num(r[H.index(e)])
            el[e].append(np.nan if v is None else v)
    rows, cols = xrf_ratios(dep, el)
    n["LC01"] = write_core("LC01", rows, cols)
    manifest.append({"name": "LC01", "file": "LC01_tesis.csv", "units": "cm", "note": "Cuenca occidental; ratios ITRAX (tabla normalizada del autor, medias de 1 cm). Sin coordenadas: añádelas con ✎"})

    # LC05 (Western basin): normalised ratios and PCA of the author, depth in mm
    ws = openpyxl.load_workbook(em / "Western basin" / "MD81_LC 05" / "Datos LC 05" / "Relaciones normalizadas.xlsx", read_only=True, data_only=True).worksheets[0]
    it = ws.iter_rows(values_only=True)
    H = list(next(it))
    nm = {"Ti/Ca": "XRF Ti/Ca", "Fe/Ca": "XRF Fe/Ca", "Si (2)": "XRF Si_norm", "S (2)": "XRF S_norm", "Zr/Ti": "XRF Zr/Ti", "Zr/Rb": "XRF Zr/Rb", "Mn/Ti": "XRF Mn/Ti", "PC1": "XRF PC1", "PC2": "XRF PC2"}
    raw = [(num(r[7]) / 10, r) for r in it if num(r[7]) is not None]
    D = np.array([d for d, _ in raw])
    rows = []
    for bk in np.unique(np.floor(D)):
        m = np.where(np.floor(D) == bk)[0]
        row = {"depth_cm": round(float(D[m].mean()), 3)}
        for j, h in enumerate(H):
            if h in nm:
                v = [num(raw[i][1][j]) for i in m if num(raw[i][1][j]) is not None]
                row[nm[h]] = float(np.mean(v)) if v else None
        rows.append(row)
    n["LC05"] = write_core("LC05", rows, [nm[h] for h in H if h in nm])
    manifest.append({"name": "LC05", "file": "LC05_tesis.csv", "units": "cm", "note": "Cuenca occidental; ratios ITRAX normalizados y PCA del autor (medias de 1 cm). Sin coordenadas: añádelas con ✎"})

    # Raw ITRAX sections: composite depth ASSUMED by stacking the scanned length of each section from the highest number (top, as the LC05
    # files 'Sec 37_0-1m' … 'Sec 1_36-37m') downwards, without gaps
    def sections(core, items, top_sec, note):
        dep, el, off = [], {}, 0.0
        for sec, p in sorted(items, key=lambda q: -q[0]):   # stacked from the highest section number down, end to end
            pos, e = p
            if not len(pos):
                continue
            dep.extend(off + (pos - pos.min()) / 10)
            off += (pos.max() - pos.min()) / 10
            for k, v in e.items():
                el.setdefault(k, [np.nan] * (len(dep) - len(pos)))
            for k in el:
                el[k].extend(e[k] if k in e else [np.nan] * len(pos))
        rows, cols = xrf_ratios(dep, el)
        n[core] = write_core(core, rows, cols)
        manifest.append({"name": core, "file": f"{core}_tesis.csv", "units": "cm", "note": note})

    itx = em / "Western basin" / "MD81_LC 06" / "ITRAX"
    lc06 = []
    for d in sorted(itx.iterdir()):
        m = __import__("re").match(r"LC06_(\d+)(A|Final)?$", d.name)
        if not m:
            continue
        f = next((q for q in d.rglob("*result.txt") if "LC06-4-XRF" in q.name or d.name != "LC06_4"), None)
        if d.name == "LC06_4":
            f = d / "LC06-4" / "LC06-4-XRFresult.txt"
        if f and f.exists():
            lc06.append((int(m.group(1)), m.group(2) or "", f))
    best = {}
    for sec, suf, f in lc06:
        if sec not in best or suf:
            best[sec] = f
    sections("LC06", [(s, itrax_txt(f)) for s, f in sorted(best.items())], max(best),
             "Cuenca occidental; ITRAX bruto por secciones (ratios, medias de 1 cm). PROFUNDIDAD APROXIMADA: secciones apiladas sin huecos desde la de n\u00famero mayor (techo) (verificar). Sin coordenadas")
    wb = openpyxl.load_workbook(em / "Western basin" / "MD81_LC14" / "LC14.xlsx", read_only=True, data_only=True)
    items = []
    for ws in wb.worksheets:
        R = list(ws.iter_rows(min_row=3, values_only=True))
        if not R or not R[0] or R[0][0] != "filename":
            continue
        H = list(R[0])
        ok = [r for r in R[1:] if num(r[1]) is not None and num(r[3]) == 1]
        pos = np.array([num(r[1]) for r in ok], float)
        els = [h for h in H[10:46] if isinstance(h, str) and h.isalpha() and len(h) <= 2]
        items.append((int(ws.title), (pos, {e: np.array([num(r[H.index(e)]) if num(r[H.index(e)]) is not None else np.nan for r in ok], float) for e in els})))
    sections("LC14", items, max(s for s, _ in items),
             "Cuenca occidental; ITRAX bruto de las secciones 24-27 (ratios, medias de 1 cm). PROFUNDIDAD RELATIVA (sección 27 = 0-1 m; verificar). Sin coordenadas")
    l20 = em / "Eastern basin" / "LC20" / "ITRAX"
    sections("LC20", [(1, itrax_txt(l20 / "LC20-1-1" / "LC20-1result.txt")), (2, itrax_txt(l20 / "LC20-2A" / "LC20-2Aresult.txt"))], 2,
             "Cuenca oriental; ITRAX bruto de las secciones 1 y 2 (ratios, medias de 1 cm). PROFUNDIDAD RELATIVA (sección 2 encima de la 1; verificar). Sin coordenadas")
    import json
    (OUT / "extra_cores.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")
    return n


if __name__ == "__main__":
    main(Path(sys.argv[1]))
