# Sondeo de prueba: IODP Expedition 397, Site U1385, Hole I, Core 1H

Datos públicos del IODP usados para probar IchAnTool. Margen ibérico ("Shackleton site"):
lodo hemipelágico con bioturbación entre sutil y moderada.

## Contenido

| Carpeta | Contenido |
|---------|-----------|
| `web/` | Imágenes de media sección (A, *archive half*) de las secciones 1–6, reducidas a **50 px/cm** con filtro Lanczos (`*_50pxcm.jpg`). Es lo que carga la aplicación. |
| `records/397-U1385I-1H_RSC_color.csv` | Reflectancia de color L\*, a\*, b\* (instrumento SHMSL), 438 medidas cada 2 cm, profundidad CSF-A (m). |
| `records/397-U1385I-1H_MS.csv` | Susceptibilidad magnética de lazo continuo (WRMSL, unidades del instrumento), 420 medidas, profundidad CSF-A (m). |
| `records/397-U1385_core1_section_images_LIMS.csv` | Tabla del LIMS con las secciones, profundidades y nombres de archivo de las imágenes. |
| `images/` | Imágenes originales a resolución completa (unos 200 px/cm, 1 380 × 29 880 px por sección). **No se guardan en git** por tamaño (16 MB); se descargan como se explica abajo. |

Secciones (profundidad CSF-A del techo y muro de cada sección curada):

| Sección | Techo (m) | Muro (m) | Archivo original del LIMS |
|---------|-----------|----------|---------------------------|
| 1 | 0,00 | 1,50 | 397-u1385i-1h-1-a_shlf11915031_20221126134127_trim.jpg |
| 2 | 1,50 | 2,99 | 397-u1385i-1h-2-a_shlf11915061_20221126134246_trim.jpg |
| 3 | 2,99 | 4,49 | 397-u1385i-1h-3-a_shlf11915091_20221126134353_trim.jpg |
| 4 | 4,49 | 5,98 | 397-u1385i-1h-4-a_shlf11915121_20221126134500_trim.jpg |
| 5 | 5,98 | 7,48 | 397-u1385i-1h-5-a_shlf11915151_20221126134601_trim.jpg |
| 6 | 7,48 | 8,78 | 397-u1385i-1h-6-a_shlf11915181_20221126134717_trim.jpg |

La altura de cada imagen corresponde a la longitud de su sección (unos 199–200 px/cm en los
originales), así que techo y muro de la sección se usan directamente como techo y muro de la
imagen.

## Cómo se obtuvieron (31-10-2026)

Portal LIMS Online Report (LORE), <https://web.iodp.tamu.edu/LORE/>:
- **Images → Core Sections (LSIMG) → Standard**: Expedition 397, Site U1385, Hole I, Core 1,
  columna *Cropped image (JPG) link*.
- **Physical Properties → Reflectance Spectroscopy and Colorimetry (RSC)**, mismos filtros.
- **Physical Properties → Magnetic Susceptibility – Pass-through (MS)**, mismos filtros.

Las secciones de U1385 de la Expedición 397 son los pozos F–J (A–E corresponden a la
Expedición 339).

## Modelo de edad

El proyecto de prueba trae un modelo de edad **ilustrativo, no publicado**: tasa constante supuesta
de 10 cm/ka (0 m = 0 ka; 8,78 m = 87,8 ka). Sirve solo para probar la conversión a edad. Para
cualquier interpretación hay que sustituirlo por el modelo de edad publicado del sitio U1385 y
pasar antes las profundidades de este pozo (CSF-A) a la escala compuesta (CCSF).

## Cita y uso

Datos del International Ocean Discovery Program (IODP), Expedition 397 (Iberian Margin
Paleoclimate), obtenidos del LIMS del IODP JRSO. Los datos del IODP son de acceso abierto; al
usarlos, cita los *Proceedings of the IODP*, volumen 397, y la base de datos LIMS.
