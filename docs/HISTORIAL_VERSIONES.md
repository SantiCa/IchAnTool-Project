# Historial de versiones de IchAnTool

Este documento recoge **qué se hizo, qué cambió y por qué** en cada versión del proyecto.
Cada entrega lleva un número **V** (V1, V2, …). La tabla relaciona ese número con la versión
interna de cada componente.

Cómo se lee cada versión:
- **Qué se hizo**: resumen en una frase.
- **Cambios**: lista de cambios concretos.
- **Por qué**: motivo de los cambios.
- **Comprobación**: cómo se verificó que funciona.
- **Pendiente o problemas conocidos**.

La descripción detallada de los algoritmos está en
[DOCUMENTACION_TECNICA.md](DOCUMENTACION_TECNICA.md).

## Resumen

| V | Fecha | Componente y versión interna | Qué se hizo |
|---|-------|------------------------------|-------------|
| V1 | mayo–ago 2019 | Interfaz tkinter (`legacy/v2.1_gui`) | Primer programa con interfaz gráfica y herramientas auxiliares |
| V2 | oct 2019 | Script de consola 2.1 (`legacy/v2.1_console`) | Versión usada en el artículo de 2020 |
| V3 | 30-10-2026 | Paquete Python `ichantool` 3.0.0.dev0 | Reorganización como paquete profesional + carpeta de publicaciones |
| V4 | 30-10-2026 | Aplicación web 0.1 (`app/`) | Aplicación en el navegador con detección, edición y aprendizaje |
| V5 | 30-10-2026 | Documentación | Historial de versiones, documentación técnica y defensa de métodos |

---

## V1 — Interfaz gráfica (mayo–agosto 2019)

**Qué se hizo.** Primer programa con ventana (tkinter) para analizar imágenes de testigos.

**Cambios.**
- `Program.py`: ventana principal con menú de herramientas.
- `Bioturbation.py`: abre una imagen tratada, cuenta píxeles de bioturbación y crea hojas Excel
  (openpyxl). Permite procesar una carpeta completa de imágenes.
- `AgeConverter.py`: convierte profundidad a edad con un modelo de edad (ejemplo con los datos de
  Martrat et al., 2004, en `Datos/martrat2004_AgeSST.xlsx`).
- `Data_Equalicer.py`: iguala series de datos con distinto espaciado.
- `Excelmerger.py`: une varios archivos Excel.

**Por qué.** Facilitar el uso a investigadores sin experiencia en programación.

**Comprobación.** Uso propio durante la tesis.

**Problemas conocidos.** Variables globales, cálculos píxel a píxel (lentos), dependiente de
Excel, sin pruebas automáticas.

---

## V2 — Script de consola 2.1 (octubre 2019)

**Qué se hizo.** Script de 129 líneas (`IchAnTool.py`) que calcula el porcentaje de bioturbación
y los índices BI e ii. Es la versión descrita en Casanova-Arenillas et al. (2020) y archivada en
Zenodo (registro 3518837). Etiqueta `V2.1` en GitHub.

**Cambios.**
- Lee un JPG con la bioturbación pintada en negro.
- Convierte a gris con pesos 0,30 / 0,56 / 0,11.
- Cuenta por fila los píxeles con valor ≤ 5.
- Promedia cada N filas y asigna la profundidad del centro del intervalo.
- Traduce el porcentaje a BI y a ii mediante tablas de rangos.
- Guarda un CSV.

**Por qué.** Tener un método reproducible y simple para el artículo.

**Comprobación.** Figuras del artículo (imagen idealizada, ODP 977A, IODP M0077, 26 m de 977
frente a temperatura superficial del mar).

**Problemas conocidos** (detectados en 2026 al revisar el código):
- Se pierde el último intervalo: el bucle recorre `range(0, img_rows-1)` y la escritura del CSV
  `range(0, len(depth)-1)`.
- Falla con imágenes que ya están en escala de grises (espera tres canales).
- Solo acepta JPG. La compresión JPG altera los negros.
- Los pesos de gris suman 0,97, no 1. No afecta en la práctica porque el umbral está en el negro.
- Bucles Python píxel a píxel: lento en imágenes grandes.

---

## V3 — Paquete Python y publicaciones (30-10-2026)

**Qué se hizo.** El proyecto se reorganizó como paquete instalable (`pip install`), con pruebas
automáticas, documentación y una carpeta de borradores de publicaciones.

**Cambios.**
- Paquete en `src/ichantool/`, dividido por funciones:
  - `io.py`: lectura de imágenes.
  - `segmentation.py`: obtención de la máscara (umbral o colores).
  - `pipeline.py`: cálculo del porcentaje por intervalos.
  - `indices.py`: BI e ii.
  - `depth.py`: profundidad y edad.
  - `export.py`: CSV y Excel.
  - `plotting.py`: gráficos.
  - `cli.py`: comando `ichantool`.
- Nuevas capacidades:
  - Formatos PNG y TIFF.
  - Porcentaje por icnotaxón a partir de imágenes con colores.
  - Índices configurables.
  - Modelo de edad.
- Corrección de los fallos de V2: se conserva el último intervalo (opcional) y funcionan las
  imágenes en gris.
- Cálculo vectorizado con NumPy (sin bucles por píxel).
- Código original intacto en `legacy/`.
- Archivos de proyecto: `pyproject.toml`, `CITATION.cff`, `CHANGELOG.md`, `CONTRIBUTING.md`,
  pruebas automáticas en GitHub Actions.
- Carpeta `publications/` con tres artículos previstos y una lista de revistas.

**Por qué.** Convertir el script en una herramienta que otros puedan instalar, citar y ampliar,
y preparar la publicación.

**Comprobación.**
- 9 pruebas automáticas (`pytest`).
- **Prueba de regresión:** la V3 reproduce exactamente (a nivel de decimales) el CSV de la V2
  sobre la imagen de ejemplo, en profundidad, porcentaje, BI e ii.

**Pendiente.** Procesado por lotes, exportación LAS, zonas excluidas en el paquete Python,
publicación en PyPI y DOI nuevo en Zenodo.

---

## V4 — Aplicación web 0.1 (30-10-2026)

**Qué se hizo.** Aplicación que funciona en el navegador, sin instalar nada. Las imágenes no se
envían a ningún servidor.

**Cambios.**
- **Sondeo:** varias secciones por proyecto, techo, muro, unidades, zona de análisis, giro de 90°
  y modelo de edad.
- **Realce:** niveles, gamma, brillo, contraste, saturación, ecualizado, contraste local, canal e
  inversión. Ajustes predefinidos.
- **Detección automática:** umbral adaptativo (local) o global, morfología (apertura y cierre) y
  componentes conexas con tamaño mínimo.
- **Edición:** varita, pincel, lazo, borrador y capa de exclusión (grietas, huecos, muestras).
  Deshacer hasta 30 pasos.
- **Icnotaxones:** 12 clases iniciales editables, con teclas 1–9 y 0 (artefacto).
- **Aprendizaje:** k vecinos más cercanos sobre 12 descriptores de forma, tamaño y color, con
  rechazo de formas desconocidas, acierto estimado y exportación e importación del modelo.
- **Resultados:**
  - Porcentaje total y por icnotaxón, BI e ii automáticos y manuales.
  - Perfil dibujado junto a la imagen a la misma escala.
  - Exportación CSV, PNG y JSON.
  - Proyecto guardable.
- Interfaz en español e inglés.
- 8 pruebas automáticas (Node) para el cálculo, el procesado de imagen y el aprendizaje.

**Por qué.** Era la idea de Santiago. El usuario sube imágenes, el programa las realza y detecta
formas, el usuario etiqueta, y el programa aprende a identificar lo que se repite.

**Comprobación.**
- Pruebas automáticas (8/8 correctas).
- Prueba en navegador real (Chromium) con la imagen de ejemplo del artículo, comparando
  110 intervalos con el CSV de la V2:
  - BI e ii coinciden en el **100 %** de los intervalos.
  - Diferencia en el porcentaje: máxima **0,56** puntos, media **0,13** puntos. Se explica
    por los pesos de gris (ver documentación técnica, §3.4).
  - Profundidades idénticas (diferencia < 10⁻¹³).

**Pendiente o problemas conocidos.**
- **No probada con fotografías reales** de testigos. Los valores por defecto de la detección pueden
  necesitar ajustes.
- El aprendizaje clasifica objetos ya detectados; todavía no aprende a detectar (segmentación por
  píxel).
- El acierto estimado (validación cruzada dejando uno fuera) es optimista si los ejemplos vienen
  del mismo testigo.
- TIFF depende de una librería externa (UTIF) que se descarga al abrir el primer TIFF.
- Imágenes muy grandes (> 50 millones de píxeles) pueden ir lentas o agotar memoria.

---

## V5 — Documentación (30-10-2026)

**Qué se hizo.** Documentación completa del proyecto para poder entenderlo y defenderlo ante
revisores.

**Cambios.**
- `docs/HISTORIAL_VERSIONES.md`: este documento.
- `docs/DOCUMENTACION_TECNICA.md`: cada algoritmo con fórmulas, parámetros, justificación,
  validación y limitaciones.
- `publications/METODOS_Y_DEFENSA.md`: para cada artículo, qué métodos usa, qué se puede afirmar,
  qué falta por validar y preguntas probables de revisores con su respuesta.
- `CLAUDE.md` y `CONTRIBUTING.md`: regla de documentar cada cambio.
- Sección de implementación ampliada en el borrador para JOSS.

**Por qué.** Petición de Santiago: poder leer cómo funciona todo y defenderlo ante un revisor.

**Comprobación.** Revisión de cada fórmula contra el código fuente (`src/ichantool/*.py`,
`app/js/*.js`).

---

## Cómo mantener este documento

En cada entrega nueva:
1. Añadir una sección `V<n>` con fecha y los cinco apartados.
2. Añadir la fila a la tabla de resumen.
3. Si cambia un algoritmo o un valor por defecto, actualizar `DOCUMENTACION_TECNICA.md` en la misma
   entrega.
4. Actualizar `CHANGELOG.md` (resumen breve en inglés para usuarios externos).
