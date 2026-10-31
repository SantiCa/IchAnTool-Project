# Sondeos de la tesis de S. Casanova-Arenillas (2023) — datos de prueba del modo Multiproxy

Datos **reales** para probar la herramienta multiproxy en esta primera versión. Se cargan solos al
abrir el modo «Multiproxy» en un proyecto sin sondeos (constante `PRELOAD_THESIS` en `app/js/app.js`;
se quitará en la versión final).

Tesis: Casanova Arenillas, S. (2023). *Análisis integrado del impacto de la variabilidad ambiental en
las condiciones del fondo marino en el Mediterráneo durante el Último Ciclo Glacial*. Universidad de
Granada. https://hdl.handle.net/10481/88714

| Archivo | Contenido | Fuente |
|---------|-----------|--------|
| `catalogue.csv` | Posición y profundidad de agua de ODP 977A, ODP 976, GP03 y LC10 | Tesis, Tabla IV.1 |
| `ODP977A_pangaea.csv` | 0–30 mbsf: SST de alquenonas y C37:4 (Martrat et al., 2004), CaCO3 y TOC, color L\*a\*b\* y susceptibilidad magnética (datos de a bordo, promedio cada 5 cm). Edad interpolada con el modelo de Martrat et al. (2004) | PANGAEA (ver abajo) |
| `ODP976_pangaea.csv` | Por edad: SST de alquenonas, K37 y tasa de sedimentación (Martrat et al., 2014); δ18O, Mg/Ca y SST Mg/Ca de *G. bulloides* (Jiménez-Amat y Zahn, 2015) | PANGAEA |
| `intervals_age.csv` | ODP 977A: ORL L1–L8 con su tipo (Cap. VII, Tabla VII.2) y el resto de 0–147 ka como «fuera de capa orgánica»; GP03: ORL 1 (15–8 ka), sus fases euxínica (15–11.7) y subóxica (11.7–9), y HS1 (18–14.9 ka) (Cap. VIII) | Tesis |
| `intervals_depth.csv` | ODP 977A: unidades icnológicas basal, media y superior en mbsf (Cap. VI); LC10: sapropeles S2–S6 e interrupción de S4 en cm (Cap. IX, Tabla IX.1) | Tesis |
| `LC10_age_model.txt` | Modelo de edad de LC10 (profundidad cm, edad ka) | Tesis, Tabla IX.1 |

Conjuntos de PANGAEA (licencia CC BY 3.0/4.0; citar si se publican):
- Martrat, B. et al. (2004) SST, alkenones and sedimentation rate from ODP Hole 161-977A. https://doi.org/10.1594/PANGAEA.787811
- Comas, M.C. et al. (2005) Carbonates and bulk sediment geochemistry of ODP Hole 161-977A. https://doi.org/10.1594/PANGAEA.252192
- Comas, M.C. et al. (2005) Color reflectance of ODP Hole 161-977A. https://doi.org/10.1594/PANGAEA.253164
- Comas, M.C. et al. (2005) Magnetic susceptibility on ODP Hole 161-977A. https://doi.org/10.1594/PANGAEA.265934
- Martrat, B. et al. (2014) SST, alkenones and sedimentation rates at the Alboran basin from ODP Site 161-976. https://doi.org/10.1594/PANGAEA.787969
- Jiménez-Amat, P., Zahn, R. (2015) Planktic stable isotope and trace element record of ODP Site 161-976 (MIS2–T1–Holocene y MIS6–T2–MIS5e). https://doi.org/10.1594/PANGAEA.847256 y https://doi.org/10.1594/PANGAEA.847255

Datos propios (desde V12): `tools/make_thesis_dataset.py "<carpeta Proyectos Investigación>"` crea
`privado/` con los datos del autor (bioturbación, gris y trazas de 977A; XRF, ICP, susceptibilidad,
foraminíferos y etiquetas de GP03; ITRAX e ICP de LC10; ORL de 976). Esa carpeta **no se sube a
GitHub** (`.gitignore`): son datos no publicados con coautores. Si existe, la aplicación la usa en
lugar de la versión pública.

Notas:
- Los datos propios de la tesis (XRF y WDXRF de GP03 y LC10, bioturbación de 976/977, color de las
  imágenes) no son públicos y no se incluyen: GP03 y LC10 aparecen solo con sus intervalos. Para
  completarlos, importar los archivos propios con «Registros numéricos» (se suman al sondeo existente).
- «Fuera de capa orgánica» en ODP 977A es el complemento de las ORL descritas, no una observación
  aparte. ORL L6 es tipo 3* (incierto en la tesis).
- Las profundidades de ODP 976 de los dos conjuntos vienen de agujeros distintos; por eso este sondeo
  se carga solo por edad.
