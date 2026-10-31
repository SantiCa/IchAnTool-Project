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
| V6 | 30-10-2026 | Aplicación web 0.1, archivo único | `IchAnTool.html` que se abre con doble clic, sin servidor ni conexión |
| V8 | 31-10-2026 | Aplicación web 0.3 | Ajustes de realce de artículos recientes (Dorador et al. 2014 completo, CLAHE de Miguez-Salas et al. 2019), K-medias, ajustes propios, copias de seguridad |
| V7 | 31-10-2026 | Aplicación web 0.2 | Carpetas de proyecto, registro compuesto del sondeo (profundidad/edad), registros externos, sondeo de prueba IODP U1385I |
| V9 | 31-10-2026 | Aplicación web 0.4 | Herramienta de geoquímica: muchos sondeos y proxies, etiquetas por intervalos y reglas, aprendizaje automático configurable, mapas por edad, superposición con el registro icnológico |
| V10 | 31-10-2026 | Aplicación web 0.5 | «Geoquímica» pasa a «Multiproxy»: cualquier registro numérico, capas de intervalos descritos con subdivisiones (litología, turbiditas…), editables e importables, usadas por el clasificador automático de intervalos |
| V11 | 31-10-2026 | Aplicación web 0.6 | Modo claro/oscuro, prueba de la autoclasificación con coloreado de registros, sondeos reales de la tesis (ODP 977A, ODP 976, GP03, LC10) precargados; la rama pasa a `master` |
| V12 | 31-10-2026 | Aplicación web 0.7 | Selección de varias trazas y asignación conjunta; sin saltos ni zoom al asignar; elección automática del ajuste por separabilidad; datos propios de la tesis en Multiproxy (privados); valores que faltan; guía del modo |
| V13 | 31-10-2026 | Aplicación web 0.7.1 | Selección por recuadro arrastrando y Mayús/Ctrl+clic; exclusión de zonas con rectángulo |
| V14 | 31-10-2026 | Aplicación web 0.8 | Reestructuración: pantalla inicial con todos los proyectos y mapa multiproyecto; proyectos con varios sondeos; pestaña Datos (tabla, columnas calculadas y manuales, hoja libre); ventanas sincronizadas y panel flotante; Figuras |

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

## V6 — Aplicación en un solo archivo (30-10-2026)

**Qué se hizo.** Un único archivo `IchAnTool.html` que contiene toda la aplicación y la imagen de
ejemplo. Se abre con doble clic en Chrome, Edge, Firefox o Safari, sin servidor y sin internet.

**Cambios.**
- `tools/build_standalone.py`: genera `dist/IchAnTool.html`. Une los módulos JavaScript en orden
  de dependencia, quita `import`/`export` e incrusta la imagen de ejemplo en base64. Se detiene si
  dos módulos definen el mismo nombre.
- `dist/` no se guarda en git: el archivo se genera con el script (o se adjunta a una release).
- El código de la aplicación no cambia: el cálculo es idéntico al de V4.

**Por qué.** Los navegadores no cargan módulos JavaScript desde archivos locales (`file://`), así
que `app/index.html` necesitaba un servidor. Santiago quería probarla directamente.

**Comprobación.** Abierto desde `file://` en Chromium: carga el ejemplo, detecta 756 objetos,
112 intervalos y bioturbación media del 17,45 % (igual que la versión servida), exporta el CSV, y
la consola no da ningún error.

**Pendiente.**
- Sin conexión se usan fuentes del sistema, porque las tipográficas vienen de Google Fonts.
- Abrir TIFF necesita internet la primera vez (librería UTIF).
- Un ejecutable de escritorio (.exe/.app con Electron o Tauri) queda como opción futura.

---

## V7 — Proyectos, registro compuesto y sondeo de prueba (31-10-2026)

**Qué se hizo.** La aplicación guarda proyectos ("carpetas") en el navegador y tiene una segunda
vista, **Registro del sondeo**: todas las secciones juntas en profundidad o en edad, con ventana de
intervalo, imagen adaptada al eje, bioturbación total, por icnotaxón e índices, y registros externos
(CSV, TXT, Excel) proyectados junto a ella. Exporta SVG y CSV. Incluye un sondeo de prueba real
(IODP 397-U1385I-1H).

**Cambios.**
- `app/js/storage.js` (nuevo): biblioteca de proyectos en IndexedDB. Crear, abrir, renombrar, borrar,
  importar y exportar. Guardado automático 1,5 s después de cada cambio. Cada proyecto guarda sus
  imágenes, profundidades, modelo de edad, máscaras, clases, ajustes, registros y vista del registro.
- `app/js/log.js` (nuevo, sin navegador):
  - lectura de tablas (`parseTable`);
  - cambio de eje profundidad↔edad;
  - filas del registro compuesto;
  - SVG del registro (`buildLogSVG`);
  - CSV de la ventana con los registros interpolados (`windowCSV`).
- `app/js/imageproc.js`: `downsampleRGBA` (reducción por promedio de bloques).
- `app/js/app.js`:
  - resolución de trabajo al importar (máx. 8 MP por defecto);
  - vista de registro con la imagen remuestreada fila a fila al eje elegido;
  - diálogo de registros externos (Excel con SheetJS, descargado al usarlo por primera vez);
  - diálogo de proyectos;
  - sondeo de prueba;
  - la detección se separa en `detectSection`.
- `examples/U1385I-1H/`: 6 imágenes de media sección (reducidas a 50 px/cm), color L\*a\*b\* y
  susceptibilidad magnética del LIMS del IODP, con su procedencia. Modelo de edad **ilustrativo**.
- Formato de proyecto versión 2: añade `ds` (factor de reducción), `records`, `logView` y `notes`.
  Los archivos de la versión 1 se siguen abriendo.
- `tools/build_standalone.py`: incluye los módulos nuevos y el sondeo de prueba en el archivo único
  (3,9 MB).
- Interfaz: selector de modo (Sección / Registro del sondeo) y botón de proyecto con estado de
  guardado. Se quitan los botones Nuevo/Abrir/Guardar, que pasan al diálogo de proyectos.

**Por qué.** Petición de Santiago:
- probar con imágenes reales;
- carpetas de proyecto que conserven las definiciones de profundidad y edad;
- ver el sondeo completo o una ventana en profundidad o edad, con la bioturbación elegida;
- exportar SVG o CSV;
- proyectar registros externos (por ejemplo, geoquímica).

**Comprobación.**
- 13 pruebas automáticas de la aplicación (`npm test`; 5 nuevas para `log.js` y la reducción) y
  9 de Python.
- Prueba en Chromium con el servidor y con el archivo único desde disco:
  - el sondeo de prueba se carga en unos 4 s;
  - detección en las 6 secciones;
  - registro en profundidad y en edad (ventana 10–40 ka);
  - exportación SVG (295 kB) y CSV con L\*, a\*, b\* y susceptibilidad interpoladas;
  - importación de una tabla con «;» y coma decimal;
  - creación de un segundo proyecto y vuelta al primero;
  - recarga de la página con el proyecto recuperado;
  - ningún error en consola.
- Los parámetros de detección del sondeo de prueba se compararon en la sección 3 (113 / 60 / 45
  objetos con tres combinaciones) y se eligió un ajuste moderado.

**Pendiente o problemas conocidos.**
- El modelo de edad del sondeo de prueba es ilustrativo. Para trabajo real, usar el publicado.
- La detección en este lodo detecta parte de las manchas y trazas oscuras, pero no la bioturbación
  difusa (moteado), que hay que marcar con pincel. Además confunde algunas marcas de corte y de
  muestreo, que hay que excluir o marcar como artefacto.
- Los proyectos viven en el navegador de cada ordenador: borrar los datos del navegador los
  elimina. Hay que exportar copias de seguridad.
- Excel necesita internet la primera vez (librería SheetJS). CSV y TXT funcionan sin conexión.
- En el registro compuesto, todas las secciones y registros deben usar unidades coherentes. La
  aplicación convierte mm, cm y m entre secciones, pero no los registros externos.

---

## V8 — Ajustes publicados, ajustes propios y copias de seguridad (31-10-2026)

**Qué se hizo.** Se revisó la bibliografía posterior a 2014 sobre tratamiento de imagen en icnología
de testigos y se añadieron los métodos publicados que faltaban. El usuario puede guardar sus propios
ajustes, y se añadió un sistema de copias de seguridad en tres capas.

**Bibliografía revisada** (detalle en la documentación técnica, §6, §7 y §20):
- Dorador, Rodríguez-Tovar e IODP Exp. 339 (2014, *Facies* 60): Niveles → Brillo/Contraste →
  Vibrance/Saturación, con rangos y medias publicados.
- Miguez-Salas, Dorador y Rodríguez-Tovar (2019, *Marine Geology* 413): CLAHE en Fiji; ICY con
  K-medias de 2 clases; filtros binarios (erosión, rellenar huecos, mínimo/máximo).
- Rodríguez-Tovar, Miguez-Salas y Dorador (2020, *Ichnos*): Fiji e ICY aplicados a icnofábricas
  compuestas. Solo se consultó la ficha, no el texto.
- Kikuchi y Naruse (2024, *Sedimentary Geology* 461): U-Net para *Phycosiphon* (Dice 0,892).
  Se anota para el artículo 2; no se implementa.

**Cambios.**
- `imageproc.js`:
  - `autoLevels` (percentiles 0,5 % y 99,5 % en la zona de análisis, y mediana);
  - `gammaForMedian` (gamma automática limitada a 0,19–1);
  - `clahe` (Zuiderveld, 1994);
  - vibrance;
  - `kmeansThreshold`;
  - `fillHoles`;
  - nuevos ajustes `dorador2014` y `clahe2019`;
  - el ajuste «levels» pasa a llamarse genérico, porque **antes se atribuía erróneamente a Dorador y
    Rodríguez-Tovar (2014)** y sus valores eran propios.
- Detección: método K-medias de 2 clases y opción de rellenar huecos.
- **Ajustes propios:** se guardan realce y detección con nombre. Son comunes a todos los proyectos
  (IndexedDB más una copia en localStorage). También se puede aplicar un ajuste a todas las
  secciones.
- **Copias de seguridad:**
  - almacenamiento persistente del navegador (`navigator.storage.persist`);
  - copia automática en una carpeta elegida por el usuario (Chrome/Edge, *File System Access*):
    proyecto actual 20 s después de cada cambio, copia diaria en `historial/` y
    `ichantool_ajustes.json`;
  - descarga de una copia completa (todos los proyectos y ajustes);
  - restauración de varios archivos a la vez (proyectos, copias completas o ajustes).
- `storage.js`: base de datos versión 2 con almacén `prefs`.

**Por qué.** Petición de Santiago: métodos más recientes que Dorador (2014), poder guardar sus
propios ajustes y no perder nada si falla el ordenador.

**Comprobación.**
- 20 pruebas de la aplicación (6 nuevas: CLAHE, niveles automáticos, gamma automática, K-medias,
  rellenar huecos, ajustes completos y detección por K-medias) y 9 de Python.
- En Chromium:
  - los ajustes nuevos se aplican en la sección 3 del sondeo de prueba (niveles automáticos 65–114);
  - se guarda un ajuste propio;
  - la copia completa (3,1 MB) se descarga y se restaura en un navegador limpio con su proyecto y
    su ajuste;
  - ningún error.
- La copia en carpeta no se pudo probar automáticamente, porque el selector de carpeta exige un
  clic real. Hay que probarla a mano en Chrome o Edge.

**Pendiente o problemas conocidos.**
- La equivalencia numérica con Photoshop (contraste y brillo) es aproximada (§6).
- El CLAHE es por mosaicos con interpolación (Zuiderveld, 1994), no la ventana deslizante del
  plugin de Fiji. El efecto es parecido, pero no idéntico píxel a píxel.
- La copia automática en carpeta solo funciona en Chrome y Edge, y el navegador pide el permiso
  de nuevo en cada sesión (un clic en «Reactivar copia automática»).
- La carpeta `historial/` crece un archivo por proyecto y día; hay que limpiarla a mano.

---

## V9 — Herramienta de geoquímica y aprendizaje automático (31-10-2026)

**Qué se hizo.** Se añadió a la aplicación un tercer modo, «Geoquímica», separado de las imágenes
pero dentro del mismo proyecto. Sirve para interpretar registros de muchos proxies en muchos
sondeos (pensado para llegar a cientos), etiquetar eventos, entrenar un clasificador que
autoclasifica los sondeos nuevos y hacer mapas por edad al estilo del atlas. La interpretación
icnológica del proyecto entra como datos más.

**Cambios.**
- Nuevo módulo `app/js/geo.js` (sin navegador):
  - importación de tabla larga, un archivo por sondeo y catálogo de posiciones;
  - muestras remuestreadas a una malla común de edad o profundidad, razones A/B, log10, z-score
    por sondeo y escalado global o por sondeo;
  - etiquetas por intervalos y por reglas (asociaciones de proxies con z-score o valor);
  - Random Forest (CART, Gini, pesos equilibrados, importancia MDI), k vecinos, Bayes ingenuo
    gaussiano y k-medias, todos con semilla;
  - validación cruzada dejando un sondeo fuera (o 5 bloques contiguos con un solo sondeo), matriz
    de confusión y acierto equilibrado;
  - resumen por ventana de edad, interpolación IDW y mapa SVG con costa de Natural Earth.
- Interfaz (`app.js`, `index.html`, `i18n.js`):
  - modo «Geoquímica» con cuatro pasos: sondeos y datos, preparación, etiquetas y reglas,
    aprendizaje (con explicación de cada método y parámetro, valores sugeridos y semilla);
  - pestañas Registros (variables + bandas de etiquetas y clasificación, marcar intervalos
    arrastrando), Mapa (ventana de edad, ◀ ▶, clase dominante o valor, IDW, anomalía, SVG y CSV) y
    Modelo (métricas, matriz de confusión, importancia, nombres de grupos de k-medias, CSV);
  - «Añadir el sondeo de las imágenes»: bioturbación, BI, ii, % por icnotaxón y registros
    externos como variables;
  - el modelo se aplica también a sondeos añadidos después de entrenar, con la escala congelada;
  - banda «Clases geoq.» en el registro compuesto del sondeo de imágenes;
  - aviso por sondeo de las variables que le faltan.
- `log.js`: `parseTable` devuelve también el texto de cada celda; `buildLogSVG` admite bandas de
  clases (`bands`, `bandLegend`) y devuelve la posición del gráfico.
- Archivo de proyecto: campo `geo` (sondeos, etiquetas, intervalos, reglas, ajustes). El modelo
  no se guarda: se reentrena con la misma semilla al abrir.
- Datos: `examples/data/land-50m.json` (costa Natural Earth 1:50 m, dominio público) y
  `examples/geochem_demo/` con `tools/make_geochem_demo.py` (15 sondeos **sintéticos**).
- `tools/build_standalone.py`: añade `geo.js`, la costa y la tabla de demostración al archivo único.

**Por qué.** Petición de Santiago: integrar una herramienta de interpretación geoquímica
multiproxy con etiquetas propias, aprendizaje automático ajustable con ayuda para no expertos,
autoclasificación de muchos sondeos, mapas por edad y superposición con la interpretación
icnológica en los mismos proyectos. Formatos elegidos por él: tabla larga y archivos por sondeo;
etiquetado por intervalos y reglas; mapas de puntos con interpolación.

**Comprobación.**
- 27 pruebas de la aplicación (7 de geoquímica) y 9 de Python.
- En Chromium, servidor local y archivo único:
  - la demostración entrena un Random Forest con 1730 muestras etiquetadas: acierto 98,6 % y
    acierto equilibrado 97,7 % dejando un sondeo fuera (datos sintéticos: **solo comprueba la
    implementación**, §21.8);
  - el mapa de 6–10 ka muestra baja oxigenación al este y fondo al oeste, como en la verdad
    sintética;
  - importación de tres archivos por sondeo y del catálogo con asignación automática de columnas;
  - sondeo de las imágenes incluido (440 intervalos, 8 variables), marcado de intervalos
    arrastrando, entrenamiento con un solo sondeo (5 bloques) y banda «Clases geoq.» en el
    registro compuesto;
  - tras recargar, se recuperan los intervalos y el modelo se reentrena solo;
  - ningún error de JavaScript.

**Pendiente o problemas conocidos.**
- Validar con sondeos reales con interpretación publicada (dejando sondeos enteros fuera) antes
  de afirmar nada sobre la capacidad de detectar eventos reales.
- Importancia por permutación (más fiable que MDI con proxies correlacionados).
- Con cientos de miles de muestras, el k-NN y la validación cruzada pueden tardar: todo corre en
  el navegador. Si hace falta, pasar el entrenamiento a un *web worker* o al paquete Python.
- No se propaga la incertidumbre de los modelos de edad ni se modela la autocorrelación.
- El paquete Python todavía no tiene la parte de geoquímica.

---

## V10 — Herramienta multiproxy: capas de intervalos y clasificación automática de intervalos (31-10-2026)

**Qué se hizo.** El modo «Geoquímica» pasa a llamarse **«Multiproxy»**, porque admite cualquier
registro numérico (geoquímica, foraminíferos, TOC, sedimentología…) y además **intervalos
descritos** organizados en capas (litología, turbiditas, zonas de migración de metales, eventos…).
Una capa puede ser **subdivisión** de otra. Los intervalos se importan, se dibujan y se editan, y
**todas** las capas entran como variables en el clasificador automático de intervalos, que puede
aprender cualquier capa como objetivo. Se deja explícito que este clasificador es independiente
del que sugiere icnotaxones.

**Cambios.**
- `geo.js`:
  - `buildSamples` añade una columna 0/1 por categoría de cada capa usada (sin escalar);
  - `labelSamples` filtra por capa objetivo y no usa intervalos automáticos;
  - nuevas `intervalsFromTable` (formato ancho y largo), `intervalsOnAxis`, `orphanIntervals`
    (intervalos hijos fuera de la capa madre) y `layerFeatureNames`.
- Interfaz:
  - paso 3 «Capas de intervalos y etiquetas»: crear, renombrar y borrar capas, elegir la capa
    madre (sin ciclos), categorías con color y reglas por capa (también con variables de capas);
  - importación de intervalos (techo, base, eje, columna de capa opcional, columnas de categoría;
    sondeo por columna, por nombre de archivo o elegido), sin duplicar intervalos idénticos;
  - registro con una banda por capa en orden jerárquico; al dibujar en una capa hija, el
    intervalo se recorta al intervalo madre; lista editable (categoría, techo, base), aviso ⚠ de
    intervalos fuera de su madre, exportación CSV;
  - paso 4: capa objetivo y capas usadas como variables; la capa objetivo nunca es variable;
  - «Aceptar la clasificación como intervalos»: crea intervalos automáticos (en claro), que se
    confirman con ✓ y solo entonces cuentan para entrenar;
  - el registro compuesto del sondeo de imágenes muestra sus capas de intervalos y la
    clasificación.
- Proyectos de V9: la lista de etiquetas se convierte en la capa «Eventos» (`normalizeGeo`).
- Demostración: `intervals.csv` sintético (Litologia y Turbidita como subdivisión), generado con
  una semilla aparte para no cambiar los registros numéricos.
- `log.js`: el ancho de cada banda es configurable.

**Por qué.** Petición de Santiago: no limitarlo a geoquímica; importar y modificar intervalos
definidos y subdividirlos; que el sistema de clasificación automática de intervalos los use; y
separarlo claramente del sistema que sugiere la clasificación de la bioturbación.

**Comprobación.**
- 28 pruebas de la aplicación (1 nueva: importación de intervalos, columnas 0/1 con conversión de
  eje, capa objetivo y comprobación de anidamiento) y 9 de Python.
- En Chromium:
  - demostración: 3 capas, 9 variables, acierto 98,4 % y acierto equilibrado 96,7 % dejando un
    sondeo fuera (sintético; solo comprueba la implementación);
  - con «Litologia» como capa objetivo se entrena y se aceptan 7 intervalos automáticos;
  - arrastre en la capa hija recortado al intervalo madre;
  - diálogo de importación con detección de techo, base, sondeo y columnas de categoría; volver a
    importar el mismo archivo no duplica;
  - proyecto con formato de V9 convertido correctamente;
  - recarga con todo recuperado; banda de clasificación en el registro compuesto; ningún error.

**Pendiente o problemas conocidos.**
- Las muestras se sitúan con los registros numéricos: un sondeo que solo tenga intervalos (sin
  ningún dato numérico) no aporta muestras.
- Sin intervalo de una capa, sus columnas valen 0, igual que «no presente»: no se distingue «no
  descrito» de «ausente».
- Los intervalos en profundidad deben estar en las mismas unidades que los registros del sondeo.
- Importancia por permutación y validación con datos reales siguen pendientes (V9).

---

## V11 — Modo oscuro, prueba de la autoclasificación y sondeos de la tesis (31-10-2026)

**Qué se hizo.** Botón para cambiar entre modo claro y oscuro. Botón para **probar la
autoclasificación** en un sondeo sin usar sus propias etiquetas, con bandas de resultado y de
acierto y la opción de **colorear los registros** por clase. Para esta primera versión, el modo
Multiproxy carga solo los **sondeos de la tesis** (capítulos VI–IX) con datos reales. Desde esta
entrega los cambios van a la rama principal (`master`).

**Cambios.**
- Tema: botón ☾/☀ en la cabecera; se guarda en `localStorage` (`ichantool.theme`); sin elección,
  sigue al sistema.
- `geoTestCore` (app.js): si otros sondeos tienen etiquetas de al menos dos clases, entrena con
  ellos y predice el sondeo actual; si no, divide el sondeo en 5 bloques contiguos y predice cada
  bloque con un modelo entrenado sin él. Bandas «Prueba» y «Acierto» (verde = coincide con la
  etiqueta, rojo = no) y porcentaje de coincidencia.
- «Colorear registros por clase»: fondo translúcido de cada columna de registro con la clase de la
  prueba, de la clasificación o de las etiquetas (`log.js`, opción `shade`).
- `geo.js`: al convertir intervalos entre profundidad y edad, los extremos fuera de los datos del
  sondeo se ajustan al primer/último valor (antes se perdía el intervalo entero; p. ej. la unidad
  superior de 977A, que empieza en 0 mbsf).
- `examples/tesis_casanova/` (ver su README):
  - registros de PANGAEA: ODP 977A (SST de alquenonas y C37:4, CaCO3, TOC, color L\*a\*b\*,
    susceptibilidad magnética) y ODP 976 (SST, K37, tasa de sedimentación, δ18O, Mg/Ca);
  - intervalos de la tesis: ORL L1–L8 de 977A con su tipo (Cap. VII), unidades icnológicas de 977A
    (Cap. VI), ORL 1 de GP03 con sus fases euxínica y subóxica como subdivisión, HS1 (Cap. VIII),
    sapropeles S2–S6 de LC10 con la interrupción de S4 como subdivisión (Cap. IX);
  - posiciones (Tabla IV.1) y modelo de edad de LC10 (Tabla IX.1).
- `PRELOAD_THESIS = true` en app.js: los carga al abrir Multiproxy en un proyecto sin sondeos, y
  hay un botón para cargarlos cuando se quiera. En la versión final se pondrá en `false`.

**Por qué.** Petición de Santiago: modo oscuro/claro, probar la autoclasificación con coloreado,
tener sus sondeos en esta primera versión y empezar a trabajar sobre la rama principal.

**Comprobación.**
- 28 pruebas de la aplicación (ampliada la de capas con el ajuste de extremos) y 9 de Python.
- En Chromium: se cargan los 4 sondeos con posición, 30 intervalos en 5 capas, ninguno fuera de su
  capa madre; ODP 977A da 311 muestras (0,5 ka). Random Forest con capa objetivo «Capas
  orgánicas»: validación por 5 bloques, acierto 78,8 % y **acierto equilibrado 36 %**; la prueba
  en 977A coincide con la etiqueta en el 73,8 % de 263 muestras. Las ORL de tipo 1–3 son pocas y
  cortas: el modelo acierta sobre todo «fuera de capa orgánica». Es un resultado real y modesto,
  útil como punto de partida, no como validación.
- Modo oscuro aplicado y guardado; ningún error de JavaScript.

**Pendiente o problemas conocidos.**
- Faltan los datos propios de la tesis (XRF/WDXRF de GP03 y LC10, bioturbación de 976/977): GP03
  y LC10 solo tienen intervalos y no aportan muestras hasta importar sus registros.
- ODP 976 solo tiene en común con 977A la SST de alquenonas.
- Quitar la precarga (`PRELOAD_THESIS = false`) en la versión final.

---

## V12 — Selección múltiple, elección del ajuste y datos propios de la tesis (31-10-2026)

**Qué se hizo.**
- **Selección de varias trazas** (automáticas o dibujadas) y asignación a un icnotaxón de una vez.
- Al asignar, la vista **ya no salta ni hace zoom**: «Saltar a la siguiente» está desactivado por
  defecto, se recuerda y, si se activa, ya no cambia el zoom.
- Revisión bibliográfica sobre preselección de parámetros de realce y botón para **elegir el ajuste**
  que más separa trazas y matriz.
- Modo Multiproxy con los **datos propios de la tesis** (carpeta del autor), una guía «¿Cómo funciona
  este modo?» y la opción de rellenar variables que faltan.

**Cambios.**
- `app.js`: `S.multi`, Ctrl+clic, Mayús+arrastrar (rectángulo), «Seleccionar las sugeridas como…» y
  «Seleccionar todas sin revisar»; `assignClassMany`, `acceptSuggestions`, `deleteObjects` en una
  sola operación de deshacer; panel de selección múltiple; `centerOn` solo desplaza.
- `imageproc.js::separability` (η de Otsu) y `app.js::rankPresets` + botón «Elegir el ajuste que más
  separa trazas y matriz».
- `geo.js`: `missing: 'mean'` y `colStats`; las reglas no se cumplen sobre valores que faltan.
- `tools/make_thesis_dataset.py` → `examples/tesis_casanova/privado/` (en `.gitignore`); el archivo
  único lo incluye si existe; `loadThesisCores` usa esos datos si están y, si no, la versión pública.
- Interfaz: guía del modo Multiproxy y selector de valores que faltan.

**Por qué.** Petición de Santiago: asignar varias trazas a la vez, que no salte ni haga zoom al
asignar, buscar publicaciones sobre preselección de parámetros y usar los datos reales de su tesis
(no los de los artículos publicados) en el modo Multiproxy, que además no se entendía bien.

**Comprobación.**
- 29 pruebas de la aplicación (nueva: separabilidad) y 9 de Python.
- En Chromium: selección por rectángulo de 28 trazas y asignación con la tecla 2 a las 28, sin cambio
  de vista ni de zoom; el botón de ajuste ordena los ajustes (η 0,81 «ecualizado + contraste local»,
  0,68 Dorador 2014…) y aplica el primero.
- Multiproxy con datos propios: 4 sondeos, 7 capas, ninguna fuera de su madre; validación dejando un
  sondeo fuera, acierto 61,1 % y equilibrado 17,7 %; prueba en LC10 85,6 %, en GP03 29,8 %. Ningún error.

**Pendiente o problemas conocidos.**
- Los datos propios no están en GitHub; para publicarlos hace falta el acuerdo de los coautores.
- η favorece cualquier bimodalidad; es una propuesta inicial.
- Falta la bioturbación de GP03 y LC10 (está en otros archivos del autor, p. ej. `TODOS GP03.xlsx`).
- La transferencia de la clasificación entre sondeos con variables distintas es pobre.

---

## V13 — Selección arrastrando y exclusión con rectángulo (31-10-2026)

**Qué se hizo.** Con la herramienta de selección, **arrastrar dibuja un recuadro** que selecciona las
trazas (antes arrastrar desplazaba la imagen). Mayús o Ctrl + clic añade o quita una traza, y Mayús o
Ctrl + recuadro añade a la selección. Las herramientas **Excluir** y **Recuperar** tienen la forma
«Rectángulo» (o Mayús + arrastrar con el pincel) para marcar zonas que no cuentan.

**Cambios.** `app.js`: el arrastre de selección pasa a recuadro; desplazar la vista queda en la
herramienta mano, la barra espaciadora o el botón central; tipo de arrastre `exrect` que marca o
desmarca la capa de exclusión en el rectángulo con una sola operación de deshacer; opción
`S.exShape`. `index.html`, `i18n.js`: selector de forma y textos de ayuda.

**Por qué.** Petición de Santiago: seleccionar varias trazas con Mayús, Ctrl o arrastrando, y poder
excluir partes del sondeo con un recuadro.

**Comprobación.** 29 pruebas de la aplicación y 9 de Python. En Chromium: recuadro simple (1 traza),
Mayús + recuadro añade (2), recuadro nuevo sustituye (1); exclusión con rectángulo de 2688 px;
ningún error.

**Pendiente o problemas conocidos.** Reestructuración del programa en proyectos → sondeos (pedida a
la vez; se planifica aparte).

---

## V14 — Proyectos con sondeos, Datos, ventanas y Figuras (31-10-2026)

**Qué se hizo.** Se reorganizó el programa como pidió Santiago:
- **Pantalla inicial** con los proyectos y «Todos los proyectos»: tabla de los sondeos de todos los
  proyectos (clic para abrir) y **mapa multiproyecto** (situación, valor de una variable o categoría
  dominante de una capa en una ventana de edad).
- **Proyecto → sondeos.** Cada proyecto tiene varios sondeos; cada sondeo guarda sus imágenes y su
  bioturbación, datos importados, registros, modelo de edad e intervalos. La icnología (Bioturbación)
  y el Multiproxy son pestañas separadas que trabajan sobre los mismos sondeos.
- **Datos:** todos los datos del proyecto distinguiendo importados, creados y calculados; columnas
  calculadas por fórmula, columnas manuales y una hoja libre tipo Excel.
- **Ventanas:** mapa, registros multiproxy y registro del sondeo en otra ventana que se actualiza sola,
  o en un panel flotante dentro de la misma.
- **Figuras:** trazas representativas por icnotaxón (elección manual o automática), sondeo entero
  interpretado, registro, registro multiproxy y mapa, con título y pie, en SVG y PNG.
- La tesis pasa a ser un proyecto propio («Tesis Casanova-Arenillas (2023)») que se crea la primera
  vez; ya no se mezcla con el sondeo de prueba.

**Cambios.**
- `app.js`: modelo de sondeos (`makeCore`, `activateCore`, `refreshCoreData`, `coreImageParts`),
  formato de proyecto v3 con conversión de v1/v2 (`upgradeProject`), pantalla inicial
  (`showHome`, `renderAllProjects`, `buildAllMap`), pestaña Datos, ventanas (`openWindow`,
  `startWindow`) y panel flotante, Figuras (`traceCanvas`, `autoPick`, `tracesSVG`, `coreSVG`,
  `wrapFigure`); el multiproxy usa los sondeos del proyecto; se quita «Añadir el sondeo de las imágenes».
- Nuevo `sheet.js` (fórmulas, sin `eval`) y `tests/app/sheet.test.mjs`.
- `storage.js`: base de datos v3 con almacén `lite`.
- `index.html`, `i18n.js`: cabecera con proyecto, sondeo (+, ✎) y pestañas Bioturbación, Registro,
  Datos, Multiproxy y Figuras; pantalla inicial; diálogo de sondeo; panel flotante.

**Por qué.** Petición de Santiago: separar icnología y multiproxy, organizar por proyectos y sondeos,
ver y calcular datos como en Excel, trabajar en un sondeo mientras se ve el mapa en otra ventana,
navegar por todos los proyectos con mapas multiproyecto y sacar figuras.

**Comprobación.**
- 31 pruebas de la aplicación (2 nuevas de fórmulas) y 9 de Python.
- En Chromium, perfil limpio: se crean el sondeo de prueba y el proyecto de la tesis; pantalla
  inicial con 2 proyectos y 6 sondeos en la tabla; mapa multiproyecto por proyecto; figura de
  trazas (2 icnotaxones × 4 trazas elegidas automáticamente) y figura del sondeo entero; pestaña
  Datos (2174 filas), columna calculada `[Bioturbación %] * 2` y celda `=MEAN(COL("Bio_x2"))`;
  multiproxy con los sondeos del proyecto; panel flotante del mapa; sondeo nuevo añadido; ventana
  nueva del mapa en solo lectura; ventana del registro del sondeo; proyecto de la tesis con
  validación dejando un sondeo fuera; selección por recuadro y exclusión rectangular siguen igual;
  ningún error de JavaScript.

**Pendiente o problemas conocidos.**
- Con `file://`, la ventana nueva puede no recibir cambios en algunos navegadores (queda la
  comprobación cada 4 s y el panel flotante).
- Los proyectos restaurados desde archivo aparecen en «Todos los proyectos» cuando se abren una vez.
- El registro del sondeo necesita imágenes; los sondeos solo con datos se ven en Multiproxy.
- La bioturbación de GP03 y LC10 de la tesis sigue sin cargar.

---

## Cómo mantener este documento

En cada entrega nueva:
1. Añadir una sección `V<n>` con fecha y los cinco apartados.
2. Añadir la fila a la tabla de resumen.
3. Si cambia un algoritmo o un valor por defecto, actualizar `DOCUMENTACION_TECNICA.md` en la misma
   entrega.
4. Actualizar `CHANGELOG.md` (resumen breve en inglés para usuarios externos).
