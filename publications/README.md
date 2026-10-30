# Publicaciones — IchAnTool

Borradores de las publicaciones previstas y revistas candidatas.
Estado al 30-10-2026. Todo lo marcado `[TODO]` está pendiente; ningún resultado de estos
borradores debe tomarse como definitivo.

> Aviso: este repositorio es **público**. Mientras un manuscrito no esté enviado o publicado
> como preprint, conviene no subir aquí datos o resultados inéditos (o mover los borradores a
> un repositorio privado).

## Cartera de publicaciones

| # | Trabajo | Depende de | Revista principal | Alternativas | Estado |
|---|---------|------------|-------------------|--------------|--------|
| 1 | Software: IchAnTool 3 | Fase 1 (núcleo) | JOSS | Applied Computing and Geosciences | Borrador inicial |
| 2 | Dataset anotado + segmentación automática | Fase 2 + imágenes del grupo UGR | Earth System Science Data | Scientific Data · Computers & Geosciences · AI in Geosciences | Esquema |
| 3 | Validación y aplicación paleoambiental | 1 + 2 | Palaeogeography, Palaeoclimatology, Palaeoecology | Ichnos · Marine Geology · Sedimentary Geology | Esquema |

Orden recomendado: 1 → 2 → 3. El 1 da el DOI citable que usan los demás.

## Estructura

```
publications/
  README.md                         este índice
  journals.md                       revistas candidatas y criterios
  01_software_JOSS/                 paper.md + paper.bib (formato JOSS)
  02_dataset_segmentation/draft.md  esquema y resumen provisional
  03_validation_application/draft.md
```

## Antes de enviar
- Confirmar coautorías (F.J. Rodríguez-Tovar, F. Martínez-Ruiz, J. Dorador u otros según
  aporten datos o validación).
- ORCID de todos los autores.
- Release con DOI de Zenodo del código citado.
- Comprobar en la web de cada revista: alcance, formato, APC y política de preprints.
- Preprint opcional en EarthArXiv.
