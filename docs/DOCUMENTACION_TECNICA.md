# Documentación técnica de IchAnTool

Versión del documento: V12 (31-10-2026). Componentes descritos: paquete Python 3.0.0.dev0 y
aplicación web 0.7.

Este documento explica **cómo funciona cada parte**, con las fórmulas y los valores por defecto
tal como están en el código. Cada apartado indica el archivo donde está implementado, para poder
comprobarlo. Al final de cada bloque hay una nota **«Para el revisor»** con la justificación y los
límites del método.

## Índice
1. Arquitectura general
2. Convenciones: orientación, zona de análisis y escala de profundidad
3. Porcentaje de bioturbación por intervalos
4. Índices BI e ii
5. Modelo de edad
6. Realce de la imagen
7. Detección automática de trazas
8. Herramientas de edición y capa de exclusión
9. Descriptores de cada objeto
10. Aprendizaje: identificación de icnotaxones
11. Qué se cuenta como bioturbación
12. Exportación y formatos de archivo
13. Validación realizada
14. Limitaciones conocidas
15. Reproducibilidad
16. Resolución de trabajo al importar
17. Proyectos (carpetas) y guardado automático
18. Registro compuesto del sondeo
19. Registros externos
20. Ajustes del usuario y copias de seguridad
21. Herramienta multiproxy: registros numéricos, capas de intervalos y clasificación automática de intervalos
22. Referencias

---

## 1. Arquitectura general

El proyecto tiene dos implementaciones que comparten las mismas definiciones de cálculo:

| Componente | Lenguaje | Uso | Carpeta |
|------------|----------|-----|---------|
| Paquete `ichantool` | Python (NumPy, Pillow, pandas) | Análisis por lotes, scripts, reproducibilidad | `src/ichantool/` |
| Aplicación web | JavaScript (sin librerías, salvo UTIF para TIFF) | Trabajo interactivo: realce, detección, edición, etiquetado | `app/` |
| Código original | Python 3.7 | Reproducir el artículo de 2020 | `legacy/` |

Flujo de trabajo común:

```
imagen del testigo
   → (realce)                       solo app; no cambia el cálculo, solo lo que se ve y se detecta
   → máscara de etiquetas           cada píxel: 0 = matriz, n = objeto o clase
   → porcentaje por fila
   → intervalos de N filas          profundidad del centro, %, % por clase
   → índices BI e ii
   → (edad)                         interpolación del modelo de edad
   → CSV / Excel / PNG / proyecto
```

La aplicación web añade sobre la máscara una capa de **objetos**: cada objeto es un conjunto
conexo de píxeles con un identificador, una clase y unos descriptores. Esto permite etiquetar y
aprender.

Módulos de la aplicación web:

| Archivo | Contenido | Depende del navegador |
|---------|-----------|-----------------------|
| `app/js/core.js` | Intervalos, índices, edad, CSV, codificación RLE | No |
| `app/js/imageproc.js` | Realce, detección, componentes, varita, lazo, descriptores, giro | No |
| `app/js/learn.js` | Clasificador k-NN con rechazo de novedades | No |
| `app/js/log.js` | Registro compuesto: tablas, ejes, SVG y CSV de una ventana | No |
| `app/js/geo.js` | Multiproxy: muestras, capas de intervalos, etiquetas, Random Forest, k-NN, Bayes, k-medias, validación cruzada, mapas | No |
| `app/js/storage.js` | Biblioteca de proyectos (IndexedDB) | Sí |
| `app/js/app.js` | Interfaz, herramientas, dibujo, archivos | Sí |
| `app/js/i18n.js` | Textos en español e inglés | Sí |

`core.js`, `imageproc.js`, `learn.js`, `log.js` y `geo.js` no usan el navegador. Por eso se prueban automáticamente con Node
(`tests/app/core.test.mjs`).

---

## 2. Convenciones

### 2.1 Orientación
La fila 0 de la imagen es el **techo** de la sección. Si la foto está en horizontal, se gira 90°
en la aplicación (`rotate90`, `imageproc.js`).

### 2.2 Zona de análisis (ROI)
Rectángulo `[x0, x1) × [y0, y1)` en píxeles. Por defecto es la imagen completa. Sirve para dejar
fuera la escala, la carta de color y los bordes del testigo. Solo se cuentan píxeles dentro de
la zona.

### 2.3 Escala de profundidad
El usuario indica la profundidad del **borde superior** (techo, `top`) y del **borde inferior**
(muro, `bottom`) de la zona de análisis. Se supone escala lineal (sin compresión ni huecos dentro
de la sección).

Con `R = y1 − y0` filas y `Δz = (bottom − top) / R` unidades por fila, la profundidad del centro
de la fila `r` (contada desde `y0`) es:

    z(r) = top + (r + 0,5) · Δz

Resolución en píxeles por centímetro (necesaria para los descriptores físicos):

    ppcm = R / ((bottom − top) · f)      con f = 0,1 (mm), 1 (cm) o 100 (m)

Implementación: `depth.py::pixel_depths`, `app.js::depthAtRow` y `pxPerCm`.

**Para el revisor.** Se supone que los píxeles son cuadrados (misma escala en horizontal y en
vertical). Es cierto en fotografías y escáneres lineales corregidos. Si no lo fuera, las áreas
físicas tendrían un factor de error constante, pero el porcentaje no cambia, porque es una
proporción de píxeles.

---

## 3. Porcentaje de bioturbación por intervalos

Implementación: `pipeline.py::analyze_mask` (Python) y `core.js::rowCounts` + `binRows` (web).

### 3.1 Por fila
Para cada fila `r` de la zona de análisis:
- `V_r` = píxeles **válidos**: dentro de la zona y no excluidos.
- `B_r` = píxeles válidos que pertenecen a bioturbación (ver §11).
- `C_r,k` = píxeles válidos de la clase `k`.

### 3.2 Por intervalo
Los intervalos agrupan `N` filas consecutivas (parámetro «píxeles por intervalo», `bin_px`). El
intervalo `j` abarca las filas `[jN, min((j+1)N, R))`. **El último intervalo puede ser
incompleto y se conserva** (en Python se puede descartar con `keep_partial=False`).

    %bioturbación_j = 100 · Σ B_r / Σ V_r
    %clase_k,j      = 100 · Σ C_r,k / Σ V_r
    profundidad_j   = top + ((r0 + r1) / 2) · Δz       (centro del intervalo)

Si un intervalo no tiene píxeles válidos (todo excluido), su porcentaje queda vacío.

### 3.3 Equivalencia con la versión publicada (V2)
La V2 calculaba el porcentaje de cada fila y después la **media** de las filas del intervalo.
Si todas las filas tienen el mismo número de píxeles válidos (sin exclusiones), la media de los
porcentajes es igual al cociente de sumas de §3.2. Con exclusiones, el cociente de sumas es el
estimador correcto: cada píxel pesa lo mismo.

La profundidad asignada por la V2, `(i − N/2) · Δz + top` con `i = (j+1)N`, es la misma que la de
§3.2.

Diferencias con la V2:
- La V2 perdía el último intervalo. Ahora se conserva.
- La V2 no tenía zona de exclusión.

### 3.4 Conversión a gris y diferencia de 0,56 puntos
En el flujo heredado (imagen con la bioturbación pintada de negro), la máscara se obtiene con un
umbral sobre el gris:
- Python: `gris = 0,30 R + 0,56 G + 0,11 B` (pesos de la V2) y bioturbación si `gris ≤ 5`.
- Web: `L = 0,299 R + 0,587 G + 0,114 B` (norma ITU-R BT.601). En el ejemplo se usa el umbral
  global `L < 6`.

Los dos criterios solo difieren en píxeles casi negros, que en un JPG aparecen en los bordes de
las manchas por la compresión. Por eso la aplicación web difiere de la V2 como máximo 0,56 puntos
porcentuales, sin cambiar ningún BI ni ii (§13). El paquete Python mantiene los pesos de la V2 y la
reproduce exactamente.

**Para el revisor.** El porcentaje es una medida directa: superficie marcada como bioturbación
dividida por la superficie analizada, en la cara expuesta del testigo (2D). No estima la
bioturbación en volumen. La calidad del resultado depende de la calidad de la máscara (§7–§8),
no del cálculo, que es exacto.

---

## 4. Índices BI e ii

Implementación: `indices.py` (Python) y `core.js::BI, II, classify` (web). Cada tramo es un
intervalo semiabierto `[mínimo, máximo)` en porcentaje.

### 4.1 Bioturbation Index (Reineck, 1963; Taylor y Goldring, 1993)

| BI | Rango de % |
|----|-----------|
| 0 | [0, 1) |
| 1 | [1, 5) |
| 2 | [5, 31) |
| 3 | [31, 61) |
| 4 | [61, 91) |
| 5 | [91, 100) |
| 6 | 100 |

### 4.2 Ichnofabric index (Droser y Bottjer, 1986)

| ii | Rango de % |
|----|-----------|
| 1 | [0, 1) |
| 2 | [1, 10) |
| 3 | [10, 40) |
| 4 | [40, 60) |
| 5 | [60, 100) |
| 6 | 100 |

Son los mismos tramos de la V2. En Python se pueden definir otros esquemas con `IndexScheme`,
sin tocar el código.

### 4.3 Índices manuales (aplicación web)
En la tabla de resultados el usuario puede anotar su propio BI e ii visual en cada intervalo. Se
guarda como un tramo de profundidad `[desde, hasta)`. Si se cambia el tamaño del intervalo, cada
intervalo nuevo hereda el valor manual del tramo que contiene su centro. Se exporta en las
columnas `BI_manual` e `ii_manual`.

**Para el revisor.** BI e ii son escalas semicuantitativas pensadas para estimación visual. El ii
de Droser y Bottjer también tiene en cuenta si se conserva la estructura sedimentaria original
(ii 6 = homogeneización total). Aquí solo se calcula su componente de **porcentaje**: es una
conversión automática y reproducible, no un sustituto de la descripción del icnofábrica. Por eso
la aplicación guarda también el índice manual, y la comparación entre ambos es objeto del
artículo 3.

---

## 5. Modelo de edad

Implementación: `depth.py::depth_to_age` (Python) y `core.js::parseAgeModel, interpAge` (web).

- Entrada: pares `(profundidad, edad)`, ordenados por profundidad. Los separadores pueden ser
  coma, punto y coma, tabulador o espacio, y se ignoran las líneas no numéricas.
- Edad de cada intervalo: **interpolación lineal** entre los dos puntos del modelo que rodean la
  profundidad del centro del intervalo.
- Fuera del rango del modelo:
  - Web: sin valor.
  - Python: `NaN`, o extrapolación lineal con la pendiente del primer o último tramo si
    `extrapolate=True`.

**Para el revisor.** Es el mismo procedimiento usado en el artículo de 2020 para el testigo 977
(modelo de Martrat et al., 2004). La incertidumbre del modelo de edad no se propaga; habría que
hacerlo aparte.

---

## 6. Realce de la imagen (aplicación web)

Implementación: `imageproc.js::applyFilters`. **El realce solo cambia lo que se ve y lo que usa
la detección automática.** No interviene en el cálculo del porcentaje, que depende únicamente de
la máscara, ni en los descriptores de color del aprendizaje, que se calculan sobre la imagen
original (§9).

Orden de las operaciones sobre cada píxel `(R, G, B)`, con valores de 0 a 255:

1. **Canal:** color, gris (BT.601), o un solo canal R, G o B copiado a los tres.
2. **Niveles:** `v₁ = limitar((v − negro) / (blanco − negro), 0, 1)`. Con **niveles automáticos**, negro
   y blanco son los percentiles 0,5 % y 99,5 % de la luminancia (BT.601, redondeada) dentro de la zona
   de análisis (`autoLevels`).
3. **Gamma:** `v₂ = v₁^(1/γ) · 255`. Con **gamma automática** (`gammaForMedian`, adaptación propia),
   γ = ln(m) / ln(0,5), donde `m` es la mediana normalizada tras los niveles, limitada a [0,01; 0,99].
   Así la mediana pasa a gris medio. γ se limita al rango 0,19–1 publicado por Dorador et al. (2014).
4. **Contraste y brillo:** `v₃ = (v₂ − 128) · F + 128 + 2,55 · brillo`, con
   `F = 259 (C + 255) / (255 (259 − C))` y `C = 2,55 · contraste` (contraste entre −100 y 100).
   Los pasos 2 a 4 se precalculan en una tabla de 256 valores.
5. **Saturación:** `v₄ = l + (v₃ − l) · s`, con `l` = luminancia BT.601 y `s` = saturación / 100.
5b. **Vibrance:** como la saturación, pero con factor `f = 1 + (vibrance/100) · (1 − sᵥ)`, donde
   `sᵥ = (máx − mín)/255` es la saturación del píxel. Afecta más a los píxeles poco saturados. Es una
   aproximación al «Vibrance» de Photoshop, cuyo algoritmo exacto no es público.
6. **Ecualización del histograma** (opcional): sobre la luminancia, con la función de
   distribución acumulada:
   `T = (CDF(L) − CDF_min) / (n − CDF_min) · 255`.
6b. **CLAHE** (`clahe`; Zuiderveld, 1994), opcional, sobre la luminancia:
   - la imagen se divide en `nx × ny` mosaicos de unos `bloque` px (`nx = redondeo(ancho/bloque)`);
   - en cada mosaico se calcula el histograma de 256 niveles y se recorta cada nivel al límite
     `pendiente × n/256`;
   - el exceso se reparte por igual entre los 256 niveles, y la función acumulada normalizada
     (×255) es la transformación del mosaico;
   - cada píxel se transforma por **interpolación bilineal** de las cuatro transformaciones de los
     centros de mosaico más cercanos.
7. **Contraste local** (máscara de enfoque, *unsharp mask*): sobre la luminancia,
   `T' = T + a · (T − media_r(T))`, con `a = cantidad / 25` y `media_r` = media en una ventana
   cuadrada de lado `2r + 1` (desenfoque de caja separable, coste proporcional al número de
   píxeles).
8. Los pasos 6 y 7 se aplican como un **desplazamiento de luminancia** igual en R, G y B
   (`R += T' − L`, etc.), que conserva aproximadamente el tono.
9. **Inversión** (opcional): `v = 255 − v`.

Ajustes predefinidos (`FILTER_PRESETS`):

| Ajuste | Valores | Fuente |
|--------|---------|--------|
| Sin realce | todo neutro | — |
| **Dorador et al. (2014)** | niveles automáticos, gamma automática (0,19–1), contraste 20, brillo −3, vibrance −31, saturación 34 % | Dorador, Rodríguez-Tovar e IODP Exp. 339 (2014) |
| **CLAHE (Miguez-Salas et al., 2019)** | bloque 127 px, pendiente 3 | Miguez-Salas et al. (2019); valores por defecto de Fiji |
| Niveles y contraste (genérico) | negro 40, blanco 215, contraste 25, saturación 140 % | propio |
| Contraste local | cantidad 60, radio 25 px, contraste 15 | propio |
| Ecualizado + contraste local | gris, ecualizar, cantidad 40, radio 20 px | propio |

**Cómo se trasladó cada protocolo publicado.**

- **Dorador et al. (2014)** describen tres pasos en Photoshop CS6, con valores elegidos en cada
  imagen (38 testigos y 10 intervalos):
  1. Niveles: valores mínimo y máximo del histograma de entrada; medias 54,3 y 100; gris medio 0,76,
     con rango 0,19–1.
  2. Brillo y contraste: contraste medio 70 (escala −50 a 100); brillo medio −8 (escala −150 a 150).
  3. Vibrance y saturación: medias −31 y −66.

  Como los niveles dependen de cada imagen (con las imágenes del sondeo de prueba, 54–100 dejaría casi
  todo en blanco), aquí se calculan con percentiles, y la gamma se ajusta a la mediana dentro del rango
  publicado. Vibrance y saturación usan las medias publicadas. Las escalas de contraste y brillo de
  Photoshop no son lineales ni equivalentes a las nuestras, así que 20 y −3 son equivalentes aproximados
  elegidos visualmente. El usuario puede afinarlos.
- **Miguez-Salas et al. (2019)** aplican «Enhance Local Contrast (CLAHE)» de Fiji ajustando el tamaño
  de bloque y los bins del histograma, sin dar valores. Se usan los valores por defecto de Fiji
  (bloque 127, 256 bins, pendiente 3). El plugin de Fiji calcula el histograma en una ventana deslizante
  alrededor de cada píxel; aquí se usa la versión por mosaicos con interpolación (Zuiderveld, 1994).
  El efecto es equivalente, pero no idéntico píxel a píxel.

**Elegir el ajuste automáticamente** (`imageproc.js::separability`, `app.js::rankPresets`, desde V12).
Procedimiento propio, no publicado. Para cada ajuste (de fábrica y del usuario) se realza una copia
reducida de la imagen (lado ÷ k, con k tal que quedan ~0,4 MP; promedio de bloques) y se mide, en la
zona de análisis, la separabilidad de Otsu (1979) del histograma de luminancia BT.601:
`η = σ²_B(t*) / σ²_T`, con `σ²_B(t) = (μ·ω₀(t) − μ₀(t))² / (ω₀(t)·(1 − ω₀(t)))` maximizada en `t*`
(η ∈ [0, 1]). Se aplica el ajuste de mayor η y se muestran los cuatro primeros. Una η alta indica dos
grupos de grises bien separados (relleno y matriz), en la línea de la comparación de valores de
píxel de Rodríguez-Tovar y Dorador (2015). Limitación: η premia cualquier bimodalidad (también
grietas o cambios de color de fondo), y un histograma uniforme da 0,75; por eso es una propuesta
inicial que el usuario revisa.

**Revisión bibliográfica (V12).** No se ha encontrado ningún trabajo posterior a Miguez-Salas et
al. (2019) que proponga cómo preseleccionar los parámetros de realce en imágenes de testigos. Los
trabajos recientes usan tomografía (*Scientific Reports*, 2020, doi:10.1038/s41598-019-57028-z) o
laminografía (*Marine Geology*, 2024, https://www.sciencedirect.com/science/article/pii/S0025322724000513) o redes neuronales
entrenadas directamente sobre la imagen sin realce previo (Di Martino et al., 2023; Kikuchi y Naruse,
2024).

**Para el revisor.** Son operaciones estándar de procesado de imagen (Gonzalez y Woods, 2018). Los dos
ajustes con fuente publicada se describen arriba, con sus diferencias respecto al original; los demás
son puntos de partida propios y así se indican en la interfaz. Los parámetros efectivos de realce de
cada sección se guardan en el proyecto, así que el procedimiento se puede reproducir.

---

## 7. Detección automática de trazas (aplicación web)

Implementación: `imageproc.js::detectMask, components` y `app.js::runDetection`.

### 7.1 Umbral
Se trabaja con la luminancia `L` (BT.601) de la imagen **realzada**, solo dentro de la zona de
análisis y fuera de las zonas excluidas.

- **Adaptativo (local)**, opción por defecto. Se calcula la media local `μ` en una ventana
  cuadrada de lado `2r + 1` (desenfoque de caja). Un píxel es candidato si:
  - trazas más oscuras: `L < μ − δ`
  - trazas más claras: `L > μ + δ`
  - ambas: `|L − μ| > δ`

  Es el umbral de «media menos constante» (*mean-C*), que compensa los cambios de iluminación y
  de color de fondo a lo largo del testigo.
- **Global**: candidato si `L < t` (oscuras) o `L > t` (claras). La opción «ambas» se trata como
  «oscuras» en este modo.
- **K-medias de 2 clases** (`kmeansThreshold`), como la opción K-Means de ICY usada por Miguez-Salas
  et al. (2019):
  - centros iniciales en los percentiles 10 y 90 de `L` dentro de la zona;
  - se iteran asignación y media hasta que los centros cambian < 0,001 (máximo 50 iteraciones);
  - el umbral es el punto medio entre los dos centros, y se aplica como el umbral global.
- **Rellenar huecos** (opcional, `fillHoles`): tras la morfología, los píxeles de fondo no
  alcanzables desde el borde de la zona (relleno 4-conexo) pasan a traza. Equivale al «Fill holes»
  binario de Fiji del mismo trabajo.

### 7.2 Limpieza morfológica
Se repite `s` veces (parámetro «suavizado») una **apertura** (erosión y luego dilatación) para
quitar puntos sueltos. Después se repite `s` veces un **cierre** (dilatación y luego erosión)
para unir huecos pequeños. El elemento estructurante es un cuadrado de 3 × 3 píxeles, aplicado
de forma separable (horizontal y luego vertical). En los bordes de la imagen se repite el píxel
del borde.

### 7.3 Objetos
Se buscan **componentes conexas con conectividad 8** (recorrido en anchura) y se eliminan las de
menos de `A_min` píxeles. Cada componente es un objeto candidato.

### 7.4 Volver a detectar
Al repetir la detección:
1. Se borran solo los candidatos automáticos **sin clase asignada**.
2. Los nuevos candidatos solo ocupan píxeles libres: nunca sobrescriben objetos identificados o
   dibujados por el usuario.
3. Si un candidato queda por debajo de `A_min` tras ese recorte, se elimina.

Valores por defecto (`DEFAULT_DETECT`): adaptativo, trazas oscuras, `δ = 12`, `r = 40 px`,
`t = 80`, `A_min = 40 px`, `s = 1`.

**Para el revisor.** La detección propone candidatos; el usuario los revisa. No se presenta como
segmentación automática validada. Su calidad depende del contraste entre relleno y matriz, y no
está medida en fotografías reales (§14). Los parámetros elegidos se guardan en el proyecto. El
umbral adaptativo y la morfología son métodos clásicos (Serra, 1982; Gonzalez y Woods, 2018),
elegidos por ser rápidos, deterministas y fáciles de explicar. La segmentación aprendida es una
línea futura (artículo 2).

---

## 8. Herramientas de edición y capa de exclusión (aplicación web)

Implementación: `imageproc.js::regionGrow, polygonPixels` y `app.js` (herramientas).

| Herramienta | Algoritmo |
|-------------|-----------|
| **Varita** | Relleno por inundación con 4 vecinos desde el píxel pulsado. Incluye los píxeles cuya distancia euclídea en RGB al color del píxel semilla es ≤ tolerancia. Usa la imagen que se está viendo (realzada u original), limitada a la zona de análisis y fuera de exclusiones. Tope: 4 millones de píxeles. |
| **Lazo** | El usuario dibuja un polígono. Se rellenan los píxeles cuyo centro queda dentro (regla par-impar, barrido por filas). |
| **Pincel** | Disco de radio `r` px. El trazo se interpola cada `r/3` px. Si empieza sobre un objeto, lo amplía; si empieza fuera, crea un objeto nuevo con la clase activa. Con Mayús añade al objeto seleccionado. |
| **Borrador** | Disco de radio `r` px que quita los píxeles de cualquier objeto. |
| **Excluir / Recuperar** | Pincel que marca o desmarca una capa aparte de **exclusión**. |

Modificadores: Mayús añade al objeto seleccionado y Alt resta (varita y lazo).

**Selección de varias trazas** (desde V12). Con la herramienta de selección, Ctrl+clic añade o quita
una traza y Mayús+arrastrar selecciona las trazas cuyo centro del rectángulo envolvente cae dentro
del rectángulo dibujado. También se pueden seleccionar todas las sugeridas como la clase activa o
todas las sin revisar. Las teclas 1–9 (y 0), «Asignar a todas», «Aceptar sus sugerencias» y
«Eliminar todas» actúan sobre toda la selección en una sola operación de deshacer. Sirve igual para
trazas detectadas automáticamente y para trazas dibujadas a mano. La vista no se mueve al asignar;
«Saltar a la siguiente al asignar» está desactivado por defecto (se recuerda por navegador) y, si se
activa, centra la traza siguiente sin cambiar el zoom.

**Capa de exclusión.** Los píxeles excluidos salen del numerador **y** del denominador del
porcentaje (§3). Sirve para grietas, huecos, zonas muestreadas, etiquetas o perturbación de
perforación. Así no se confunde «sin bioturbación» con «sin dato».

**Deshacer.** Cada operación guarda la lista de píxeles cambiados con su valor anterior, y una
copia de la lista de objetos. Se guardan las 30 últimas operaciones.

Tras cada edición se recalculan los descriptores (§9) solo de los objetos afectados, dentro del
rectángulo que los contiene.

---

## 9. Descriptores de cada objeto

Implementación: `imageproc.js::objectStats, features`. Se calculan sobre la **imagen original**
(sin realce) para que el aprendizaje no dependa de los ajustes de visualización.

Sea `n` el número de píxeles del objeto, `(x, y)` sus coordenadas, `ppcm` la resolución (§2.3) y
`(R, G, B)` el color original.

Momentos de segundo orden: `cxx = var(x) + 1/12`, `cyy = var(y) + 1/12`, `cxy = cov(x, y)`. El
término 1/12 es la varianza de un píxel cuadrado de lado 1 y evita valores nulos en objetos de
una sola fila o columna. Valores propios: `λ₁ ≥ λ₂`. Ángulo del eje mayor respecto a la
horizontal: `θ = ½ · atan2(2 cxy, cxx − cyy)`.

| Descriptor | Fórmula | Qué mide |
|------------|---------|----------|
| `logArea` | log₁₀(n / ppcm²), área en cm² | Tamaño |
| `logMajor` | log₁₀(4 √λ₁ / ppcm) | Longitud: eje mayor de la elipse con los mismos momentos, en cm |
| `logMinor` | log₁₀(4 √λ₂ / ppcm) | Anchura, en cm |
| `elong` | √(λ₁ / λ₂) | Alargamiento (1 = redondo) |
| `vert` | \|sen θ\| | Verticalidad (1 = eje mayor vertical, 0 = horizontal) |
| `compact` | min(1, 4π n / P²), P = píxeles de borde | Compacidad (1 = disco) |
| `fill` | n / área del rectángulo envolvente | Relleno del rectángulo |
| `meanL` | media de L (BT.601) | Brillo del relleno |
| `stdL` | desviación típica de L | Textura del relleno |
| `meanA` | media de (R − G) | Eje de color rojo–verde |
| `meanB` | media de ((R + G)/2 − B) | Eje de color amarillo–azul |
| `contrast` | meanL − media de L en un anillo exterior | Contraste con la matriz |

El anillo exterior se muestrea a 3 píxeles de cada píxel del borde, en las cuatro direcciones,
cuando ese punto no pertenece al objeto.

Las medidas de tamaño se expresan en **centímetros**, no en píxeles. Así, ejemplos de imágenes con
distinta resolución son comparables.

**Para el revisor.** Son descriptores clásicos de forma (momentos de imagen; Hu, 1962) y de
color. `meanA` y `meanB` son una aproximación rápida a los ejes oponentes del espacio CIELAB, no
una conversión colorimétrica. `compact` usa como perímetro el número de píxeles de borde, que
infravalora el perímetro real en contornos diagonales. Es una aproximación consistente entre
objetos, que es lo que importa para comparar. Los descriptores de color dependen de la cámara y
de la iluminación (§14).

---

## 10. Aprendizaje: identificación de icnotaxones (aplicación web)

Implementación: `learn.js::Classifier` y `app.js::learnNow`.

### 10.1 Ejemplos
Cada objeto con clase asignada por el usuario es un ejemplo `(x, y)`: `x` es el vector de los
12 descriptores de §9 e `y` el icnotaxón. Se usan los ejemplos de **todas las secciones del
proyecto** y los **importados** de modelos anteriores (archivo de modelo, §12).

### 10.2 Clasificador: k vecinos más cercanos ponderados (k-NN)
1. **Normalización:** cada descriptor se transforma en `z = (x − media) / desviación`, con la media
   y la desviación de los ejemplos. Si la desviación es 0, se usa 1.
2. **Distancia:** euclídea en el espacio normalizado.
3. **Votación:** los `k = 5` vecinos más cercanos votan con peso `w = 1 / (d + 0,05)`.
4. **Confianza:** peso de la clase ganadora / suma de pesos (de 0 a 1).

### 10.3 Rechazo de formas desconocidas (novedad)
Se calcula `m`, la mediana de la distancia de cada ejemplo a su vecino más cercano (dejándolo
fuera). Si la distancia de un objeto a su ejemplo más cercano es mayor que `ν · m`, el objeto
**no se etiqueta** y se marca como «no se parece a nada conocido». `ν` es la «tolerancia a formas
nuevas» (3 por defecto, ajustable entre 1 y 8).

### 10.4 Umbral de confianza
Una sugerencia se considera **identificación automática** solo si su confianza es ≥ 0,70
(«confianza mínima», ajustable entre 0,30 y 0,99). Por debajo, el objeto sigue siendo un
candidato sin revisar.

### 10.5 Acierto estimado
Con al menos dos clases se calcula el acierto por **validación cruzada dejando uno fuera**: cada
ejemplo se clasifica con los demás y se cuenta el porcentaje de aciertos.

### 10.6 Actualización
El modelo se recalcula automáticamente 60 ms después de cada cambio. k-NN no necesita
entrenamiento: el coste es proporcional a (ejemplos × objetos). El botón «Aceptar sugerencias» convierte las
identificaciones automáticas en etiquetas, que pasan a ser ejemplos.

### 10.7 Por qué k-NN
- **Pocos ejemplos:** funciona desde el segundo ejemplo. Un usuario etiqueta unas decenas de
  objetos, no miles.
- **Incremental:** cada corrección se aplica al instante, sin reentrenar.
- **Transparente:** la sugerencia se explica por los ejemplos parecidos.
- **Rechazo explícito:** es fácil decir «no lo sé» por distancia.
- **Sin parámetros entrenados:** reproducible y determinista.

Alternativas descartadas por ahora: bosques aleatorios y redes neuronales. Necesitan más ejemplos
o un entrenamiento previo, y quedan para el artículo 2.

**Para el revisor.**
- El acierto dejando uno fuera es **optimista** si los ejemplos vienen del mismo testigo o de
  objetos vecinos, que se parecen entre sí (autocorrelación espacial). La validación seria
  necesita testigos de prueba no usados para etiquetar (artículo 2–3).
- Las clases desequilibradas (muchos *Chondrites*, pocos *Zoophycos*) sesgan el voto hacia la
  clase frecuente. El peso por distancia lo reduce, pero no lo elimina.
- «Aceptar sugerencias» es autoentrenamiento: si se aceptan errores, se refuerzan. Por eso existe
  el umbral de confianza y la revisión objeto a objeto.
- Un objeto detectado puede contener varias trazas unidas, o una traza cortada en varios objetos.
  La clasificación hereda los errores de la detección.

---

## 11. Qué se cuenta como bioturbación (aplicación web)

Implementación: `app.js::effClassId, effClassArray`. Para cada objeto se decide su **clase
efectiva** en este orden:

1. La clase asignada por el usuario, si existe.
2. Si no hay, la sugerencia automática, si «Contar identificaciones automáticas» está activado y
   la confianza ≥ umbral.
3. Si no hay, «Bioturbación indeterminada», si «Contar candidatos sin revisar» está activado.
4. Si no, el objeto no cuenta.

La clase **Artefacto** nunca cuenta (`counts: false`). Sirve para marcar falsos positivos
(conchas, clastos, grietas detectadas), que además enseñan al modelo qué no es bioturbación. Las
zonas excluidas tampoco cuentan.

Los ajustes activos se guardan en el proyecto, así que cualquier resultado se puede reproducir.

---

## 12. Exportación y formatos de archivo

| Archivo | Contenido |
|---------|-----------|
| `*_bioturbation.csv` | Una fila por intervalo y sección: `section, depth_top, depth_bottom, depth, units, age, age_units, valid_pixels, bioturbation_pct, <clase>_pct…, BI, ii, BI_manual, ii_manual` |
| `*_objects.csv` | Una fila por objeto: sección, id, clase, estado, sugerencia, confianza, profundidades, área (cm²), longitud y anchura (cm), alargamiento, verticalidad, compacidad, luminancia, contraste, si cuenta |
| `*_mask.png` | Máscara a tamaño completo: fondo negro y cada píxel contado con el color de su clase. Compatible con `ichantool analyze --palette` del paquete Python |
| `*_palette.json` | `{nombre de clase: "#rrggbb"}` |
| `ichantool_model.json` | Modelo de aprendizaje: lista de descriptores, clases y ejemplos `{name, x}` |
| `*_registro.svg` / `*_registro.csv` | Registro compuesto de la ventana elegida (§18) |
| `*_mapa_<a0>-<a1>.svg` / `.csv` | Mapa de una ventana de edad (§21.6) |
| `*_clasificacion_intervalos.csv` | Muestras con etiqueta y clase predicha (§21.7) |
| `*_intervalos.csv` | Intervalos de todas las capas (§21.7) |
| Preferencia `ichantool.theme` (localStorage) | Tema claro u oscuro elegido |
| `*.ichantool.json` | Proyecto completo (formato v2; también abre v1): clases, ajustes, modelo de edad, ejemplos importados y, por sección, la imagen original (base64), el giro, profundidades, zona, realce, detección, índices manuales, objetos y capas de etiquetas y exclusión comprimidas por RLE. La v2 añade `ds` (factor de reducción), `records` (registros externos), `logView` (vista del registro) y `notes`. Desde V9, `geo`: sondeos (nombre, lat, lon, profundidad, edad, variables), razones, capas de intervalos con su jerarquía y categorías (desde V10; en V9, lista de etiquetas), intervalos, reglas, ajustes de preparación y del método, mapa y nombres de grupos; el modelo entrenado no se guarda (se reentrena con su semilla) |

**RLE (codificación por longitud de series):** `[valor, repeticiones, valor, repeticiones, …]`.
Reduce mucho el tamaño de las máscaras, que tienen grandes zonas iguales.

---

## 13. Validación realizada

### 13.1 Pruebas automáticas
- **Python (9 pruebas, `tests/test_core.py`):** tramos de índices, porcentajes e intervalos en
  casos calculados a mano, último intervalo incompleto, multiclase por colores, gris y RGB,
  profundidad y edad, imagen de ejemplo, línea de comandos y **regresión frente al CSV publicado
  de la V2** (coincidencia exacta en profundidad, porcentaje, BI e ii).
- **Web (13 pruebas, `tests/app/*.test.mjs`):** en `log.test.mjs`, lectura de tablas (coma, punto y coma con coma decimal, espacios, comentarios), elección de la columna de profundidad o edad, marcas de eje, cambio profundidad↔edad, filas compuestas, SVG y CSV con interpolación, y reducción por bloques. En `core.test.mjs`: los mismos casos de índices e intervalos que en
  Python, exclusiones, modelo de edad, RLE y CSV, detección de una madriguera vertical sintética
  (verticalidad > 0,9 y alargamiento > 3), varita, lazo, giro, realce, y un clasificador que
  aprende dos clases (acierto 100 %) y rechaza un objeto lejano.
- **Multiproxy (`geo.test.mjs`, 8 pruebas):** tabla larga y catálogo, conversión
  profundidad↔edad, remuestreo con huecos, razones, escalado por sondeo, reglas con z-score
  (precisión > 0,8 frente a la verdad sintética), prioridad intervalo > regla y conversión de
  intervalos entre ejes, Random Forest, k-NN y Bayes entrenados con 3 sondeos y probados en los
  otros 12 (acierto > 0,8), validación dejando un sondeo fuera, reproducibilidad con semilla,
  k-medias, resumen por ventana, IDW y SVG del mapa; desde V10, importación de intervalos en formato
ancho y largo, columnas 0/1 de capas (con conversión de eje), capa objetivo y comprobación de
intervalos fuera de la capa madre. Total de la web: 28 pruebas.
- Se ejecutan automáticamente en GitHub en cada cambio (`.github/workflows/tests.yml`).

### 13.2 Comparación de la aplicación web con la V2 publicada
- Imagen idealizada del artículo de 2020 (620 × 16 726 px, 0–500 cm), intervalos de 150 px,
  110 intervalos comparados.

| Medida | Resultado |
|--------|-----------|
| Profundidad | idéntica (diferencia < 10⁻¹³ cm) |
| BI | 100 % de intervalos iguales |
| ii | 100 % de intervalos iguales |
| Porcentaje | diferencia máxima 0,56 puntos, media 0,13 puntos |

La diferencia del porcentaje se explica en §3.4.

### 13.3 Lo que todavía no está validado
- Calidad de la detección automática en fotografías reales de testigos.
- Acierto del clasificador con icnotaxones reales y testigos independientes.
- Concordancia entre usuarios (dos personas analizando el mismo testigo).
- Concordancia entre índices automáticos y estimación visual de expertos.

Estos puntos son el objetivo de los artículos 2 y 3 (ver `publications/METODOS_Y_DEFENSA.md`).

---

## 14. Limitaciones conocidas

1. **2D:** se mide la superficie expuesta, no el volumen.
2. **Depende de la máscara:** el cálculo es exacto, pero la máscara la decide el usuario o la
   detección automática.
3. **Detección por umbral:** falla si relleno y matriz tienen brillo parecido, con iluminación muy
   desigual (en parte corregido por el umbral adaptativo) o con trazas de borde difuso.
4. **Color dependiente de la cámara:** los descriptores de color cambian con la iluminación y el
   equipo. Un modelo importado de otro laboratorio puede funcionar peor.
5. **Escala lineal por sección:** no corrige expansión o compresión del testigo dentro de una
   sección.
6. **Memoria:** la aplicación carga la imagen completa (unos 13 bytes por píxel entre capas). Más
   de unos 50 millones de píxeles puede ser lento.
7. **El paquete Python todavía no tiene capa de exclusión**; la aplicación web sí.
8. **Proyectos locales:** viven en el navegador de cada ordenador (§17). Borrar los datos del
   navegador los elimina; hay que exportar copias.
9. **Registro en edad:** la imagen y las series dependen del modelo de edad, que se supone
   monótono. No se propaga su incertidumbre.
10. **Multiproxy (§21):** los métodos no tienen en cuenta la autocorrelación de las series ni la
    incertidumbre de los modelos de edad de cada sondeo; la interpolación IDW de los mapas es
    exploratoria; el k-NN compara cada muestra con todas las de entrenamiento (lento con cientos de
    miles de muestras); todo el cálculo se hace en el navegador.

---

## 15. Reproducibilidad

- Todos los cálculos son **deterministas**: no hay números aleatorios en el análisis ni en el
  aprendizaje. Los únicos valores aleatorios son identificadores internos de sección y de clase.
- El archivo de proyecto guarda la imagen original y todos los parámetros. Al abrirlo se obtiene
  el mismo resultado.
- Ejecutar las pruebas:

```bash
pip install -e ".[dev]" && pytest      # Python
npm test                               # Aplicación web (Node 22)
```

- Archivo único sin servidor: `python tools/build_standalone.py` genera `dist/IchAnTool.html`
  con el mismo código de `app/js/` concatenado (sin cambios en el cálculo) y el ejemplo incrustado.
- Versiones: paquete 3.0.0.dev0, aplicación 3.0.0-dev (constante `VERSION` en `app.js`; se guarda
  en cada proyecto).

---

## 16. Resolución de trabajo al importar (aplicación web)

Implementación: `imageproc.js::downsampleRGBA` y `app.js::decodeBytes`.

Las imágenes de escáner de testigos pueden tener más de 40 millones de píxeles por sección, que no
caben bien en la memoria del navegador (unos 13 bytes por píxel, §14). Al importar, si
`ancho × alto > M` megapíxeles (M = «Resolución de trabajo», 8 MP por defecto), la imagen se reduce
por un factor entero:

    k = ⌈ √(ancho · alto / (M · 10⁶)) ⌉

Cada píxel nuevo es la **media aritmética** de un bloque `k × k` de píxeles originales (en R, G y
B). Se descartan las últimas `ancho mod k` columnas y `alto mod k` filas, es decir, menos de `k`
píxeles originales en el borde inferior y derecho. La lectura se hace por franjas de altura
múltiplo de `k`, sin cargar la imagen completa en memoria.

- El **archivo original** se guarda intacto en el proyecto, junto con `k` (`ds`). Al reabrir el
  proyecto se aplica el mismo `k`, así que las máscaras coinciden píxel a píxel.
- La escala de profundidad (§2.3) se calcula sobre la imagen de trabajo, así que el porcentaje no
  depende de `k`. Lo que cambia es el tamaño mínimo de traza que se puede distinguir.

**Para el revisor.** La reducción por promedio de bloques es un filtro paso bajo seguido de
submuestreo. Evita el aliasing del submuestreo directo y es reproducible porque `k` queda
registrado. Se recomienda indicar en los métodos la resolución de trabajo (px/cm), que la
aplicación muestra junto a la zona de análisis.

---

## 17. Proyectos (carpetas) y guardado automático (aplicación web)

Implementación: `storage.js` y `app.js` (bloque *projects*).

- Cada proyecto es una «carpeta» con:
  - nombre;
  - secciones, cada una con su archivo de imagen original, factor `k`, giro, techo, muro, unidades,
    zona de análisis, realce, detección, objetos, máscaras e índices manuales;
  - modelo de edad;
  - clases;
  - ajustes;
  - ejemplos importados;
  - registros externos;
  - vista del registro.
- Se guarda en **IndexedDB** del navegador, en dos almacenes: `meta` (lista ligera: nombre, número
  de secciones, fecha) y `data` (el proyecto completo, con las imágenes como bytes).
- **Guardado automático** 1,5 s después de cualquier cambio. El estado se muestra junto al nombre
  del proyecto. Al abrir la aplicación se abre el último proyecto usado.
- Exportar e importar usa el mismo contenido en JSON, con las imágenes en base64 (§12). Al importar
  se asigna un identificador nuevo para no sobrescribir otro proyecto.
- Si el navegador no permite almacenamiento (ventana privada o datos bloqueados), la aplicación lo
  indica y hay que exportar el proyecto a mano.

---

## 18. Registro compuesto del sondeo (aplicación web)

Implementación: `log.js::compositeRows, buildLogSVG, windowCSV` y `app.js::renderLog, stripDataURL`.

### 18.1 Unión de secciones
- Las secciones se ordenan por profundidad de techo.
- Todas las profundidades se pasan a las unidades de la primera sección (mm, cm o m).
- Los intervalos de cada sección (§3) se unen en una sola serie. **No se recalculan:** cada
  intervalo conserva su porcentaje, BI, ii, porcentajes por clase e índices manuales.

### 18.2 Eje de profundidad o de edad
- **Profundidad:** cada intervalo ocupa `[techo, muro)`.
- **Edad:** techo y muro se convierten con el modelo de edad (§5). Si alguno cae fuera del modelo,
  el intervalo no se dibuja.
- Para pasar de edad a profundidad se usa el modelo invertido (pares edad→profundidad ordenados por
  edad), lo que **supone que la edad crece con la profundidad**.

### 18.3 Ventana de intervalo
El usuario elige desde–hasta en el eje activo. Se dibujan los intervalos que se solapan con la
ventana, y todo se recorta al rectángulo de la ventana.

### 18.4 Imagen adaptada al eje
La columna de imagen se genera fila a fila, con `2 × altura del gráfico` filas (máximo 4 000):
1. A cada fila de salida `r` le corresponde un valor del eje `v = desde + (r + 0,5)/N · (hasta − desde)`.
2. Si el eje es edad, `v` se pasa a profundidad con el modelo invertido.
3. Se busca la sección que contiene esa profundidad y su fila de imagen (§2.3).
4. Se copia esa fila, dentro de la zona de análisis y escalada al ancho de la columna.

Así la imagen se estira o comprime según el modelo de edad: los tramos de sedimentación lenta
ocupan más altura en edad. Se usa la imagen realzada u original y, si se elige, la bioturbación
contada superpuesta con el color de su clase. Es un **muestreo por la fila más cercana**, sin
interpolar entre filas.

### 18.5 Columnas y escalas

| Columna | Contenido | Escala horizontal |
|---------|-----------|-------------------|
| Bioturbación (%) | barra por intervalo y contorno escalonado | 0–100 % fija |
| Por icnotaxón (%) | barras apiladas por clase contada | 0 al máximo de la ventana redondeado («nice range») |
| BI / ii | barra por intervalo; índice manual como línea negra | 0–6 |
| Registro externo | línea que une los puntos en orden de profundidad o edad | mínimo–máximo de los puntos de la ventana, redondeado; invertible |

Las líneas discontinuas marcan el techo de cada sección.

### 18.6 Exportación
- **SVG:** el mismo SVG que se ve en pantalla (vectorial; la imagen va incrustada como JPEG).
- **CSV:** una fila por intervalo de la ventana, con sección, profundidades, edad, porcentajes,
  BI, ii, índices manuales y, por cada serie externa visible, su valor **interpolado linealmente**
  en el centro del intervalo. La interpolación se hace en el eje propio del registro (profundidad
  o edad), y queda vacía fuera de su rango.

**Para el revisor.** El registro compuesto no cambia ningún cálculo: es una representación de los
intervalos de §3 en un eje común. El CSV con los registros interpolados en los mismos intervalos
permite calcular correlaciones fuera de la aplicación. La interpolación lineal supone que el
registro externo varía suavemente entre dos medidas, así que conviene que su resolución sea igual
o mayor que la de los intervalos.

---

## 19. Registros externos (aplicación web)

Implementación: `log.js::parseTable, guessAxisColumn` y `app.js` (diálogo de registros).

- **Formatos:** CSV, TXT, TSV o DAT, y Excel (`.xlsx`, `.xls`, `.ods`, primera hoja, leída con la
  librería SheetJS 0.18.5).
- **Lectura** (`parseTable`):
  - separador detectado entre tabulador, punto y coma, coma o barra vertical (el primero presente en
    las 6 primeras líneas) o espacios;
  - coma decimal si el separador no es la coma y aparecen números del tipo `1,5`;
  - cabecera si la primera fila tiene algún texto no numérico;
  - se ignoran las líneas que empiezan por `#`;
  - las celdas no numéricas se tratan como vacías.
- **Columna de eje:** se propone la primera cabecera que parezca profundidad (depth, prof, mbsf,
  CSF, CCSF, mcd, m, cm) o, si no hay, edad (age, edad, ka, Ma, yr, cal). El usuario puede cambiarla
  e indicar si es profundidad o edad.
- **Series:** cada columna elegida es una serie, con los pares (eje, valor) sin vacíos y ordenados
  por el eje. Cada serie tiene color, visibilidad y opción de invertir el eje.
- **Unidades:** una columna de profundidad debe estar en las mismas unidades que el sondeo y una de
  edad en las del modelo de edad. La aplicación no convierte unidades de registros externos.

---

## 20. Ajustes del usuario y copias de seguridad (aplicación web)

### 20.1 Ajustes propios
«Guardar ajuste» guarda con nombre los parámetros de realce y de detección de la sección activa. Los
ajustes son comunes a todos los proyectos: se guardan en el almacén `prefs` de IndexedDB, con una copia
en `localStorage`, y se incluyen en las copias de seguridad. «Aplicar este ajuste a todas las
secciones» copia realce y detección de la sección activa a las demás. Cada sección guarda los valores
efectivos en el proyecto, así que un análisis sigue siendo reproducible aunque luego se borre el
ajuste.

### 20.2 Copias de seguridad: tres capas

| Capa | Dónde | Cuándo | Protege de |
|------|-------|--------|------------|
| 1. Biblioteca | IndexedDB del navegador, marcada como persistente si el navegador lo concede | 1,5 s después de cada cambio | cierres, recargas, cortes de luz |
| 2. Carpeta automática | carpeta elegida por el usuario, idealmente sincronizada con OneDrive, Google Drive o Dropbox (Chrome/Edge) | 20 s después de cada cambio y al cambiar de proyecto | avería o pérdida del ordenador, borrado de datos del navegador |
| 3. Copia completa | archivo descargado por el usuario | a demanda | todo lo anterior; archivo independiente para guardar aparte |

En la carpeta automática se escriben:
- `<proyecto>__<id>.ichantool.json`: estado actual de cada proyecto;
- `historial/<proyecto>__<id>__AAAA-MM-DD.ichantool.json`: última versión de cada día, para volver
  a un día anterior si algo se estropea;
- `ichantool_ajustes.json`: ajustes propios.

El identificador de la carpeta se guarda en IndexedDB. El navegador pide confirmar el permiso en cada
sesión, con el botón «Reactivar copia automática».

**Qué incluye cada copia de proyecto:**
- imágenes originales;
- profundidades y modelo de edad;
- máscaras, objetos y clases asignadas por el usuario (las interpretaciones);
- ejemplos de aprendizaje importados (el entrenamiento: los ejemplos son los objetos etiquetados);
- registros externos;
- vista del registro.

**Restauración:** «Importar archivo…» acepta varios archivos de proyecto, copias completas o archivos
de ajustes. Si un proyecto ya existe con el mismo identificador, se importa como copia
(«restaurado») sin sobrescribir.

---

## 21. Herramienta multiproxy: registros numéricos, capas de intervalos y clasificación automática de intervalos (aplicación web)

Tercer modo de la aplicación («Multiproxy»; hasta V9 se llamaba «Geoquímica»), separado de las
imágenes pero guardado en el mismo proyecto (campo `geo` del archivo de proyecto, nombre conservado
por compatibilidad). Combina **registros numéricos** de cualquier tipo (geoquímica, foraminíferos,
TOC, granulometría, color…) y **capas de intervalos descritos** (litología, turbiditas, zonas de
migración de metales, eventos…), que pueden subdividirse unas dentro de otras. Con todo ello
entrena un **clasificador automático de intervalos** que se aplica a todos los sondeos, y dibuja
mapas por ventana de edad. Código: `app/js/geo.js` (sin navegador, probado en
`tests/app/geo.test.mjs`) y el bloque «multiproxy tool» de `app/js/app.js` (interfaz).

Este clasificador es **independiente** del que sugiere icnotaxones en el modo Sección (§10): usa
otro código, otras variables y otro objetivo.

### 21.1 Entrada de datos
**Registros numéricos:**
- **Tabla larga:** una fila por muestra con columna de sondeo (`coresFromLongTable`). Lat/lon se
  toman de la primera fila del sondeo que las tenga.
- **Un archivo por sondeo:** el nombre del archivo (sin extensión) es el nombre del sondeo
  (`coreFromRows`).
- **Catálogo:** asigna lat, lon y profundidad de agua por nombre de sondeo, sin distinguir
  mayúsculas (`applyCatalogue`).
- Formatos: CSV/TXT (mismo lector que §19, `parseTable`) y Excel/ODS (SheetJS, primera hoja).
- El usuario elige qué columna es sondeo, lat, lon, profundidad, edad y qué variables importa. Hace
  falta profundidad o edad. Los valores no numéricos se ignoran. Si el sondeo ya existe, las
  variables nuevas se añaden a las que tenía.

**Intervalos descritos** (`intervalsFromTable`): una fila por intervalo con techo y base (en
profundidad o en edad, en las unidades de los registros del sondeo) y:
- **formato ancho:** cada columna de texto marcada es una capa (p. ej. `Litologia`, `Turbidita`) y
  el texto de la fila es la categoría; las celdas vacías no crean intervalo;
- **formato largo:** una columna dice la capa y otra la categoría.

El sondeo sale de una columna, del nombre del archivo o de la elección del usuario. Se crean las
capas, categorías y sondeos que no existan (comparación sin distinguir mayúsculas). Un intervalo
idéntico a uno existente (mismo sondeo, capa, eje, categoría, techo y base) no se duplica.
- Las filas de cada sondeo se ordenan por profundidad (o por edad si no hay profundidad).
- **Sondeo de las imágenes** (`mainCoreFromImages`): convierte el proyecto de imágenes en un sondeo
  más, con id `main`. Sus variables son, por intervalo del registro compuesto (§18): porcentaje de
  bioturbación, BI, ii, porcentaje de cada icnotaxón que cuenta y los registros externos (§19)
  interpolados linealmente a la profundidad (o edad) del intervalo. Su edad sale del modelo de edad
  del proyecto. Así la interpretación icnológica entra como dato en el análisis multiproxy.

### 21.2 Muestras: remuestreo, transformación y escalado
`buildSamples(cores, cfg)`:
1. **Eje** (`axis`): edad o profundidad. La edad de un sondeo es su columna de edad o, si no hay,
   su modelo de edad aplicado a la profundidad (`coreAges`).
2. **Malla común** por sondeo: desde `ceil(min/paso)·paso` hasta el máximo, cada `paso`
   (por defecto 1; 0,5 en la demostración).
3. **Remuestreo lineal** (`resample`): interpolación entre las dos muestras vecinas; nulo fuera
   del rango del sondeo (no se extrapola) o si las dos vecinas están separadas más que `maxGap`
   (por defecto sin límite).
4. **Razones** A/B creadas por el usuario: se calculan fila a fila sobre los datos originales
   (nulo si el divisor es 0 o falta) antes de remuestrear.
5. **Logaritmo** opcional por variable: `t = log10(v)` si `v > 0`; si no, nulo.
6. **Valores que faltan** (`cfg.missing`): con `drop` (por defecto) una muestra entra solo si
   **todas** las variables elegidas tienen valor; un sondeo sin alguna variable no aporta muestras.
   Con `mean` (desde V12) basta con una variable; las que faltan valen la media, es decir 0 en `zc`
   y en `f` con escalado global o por sondeo (la media global de `t` sin escalar). Media y desviación
   se calculan sin los valores que faltan (`colStats`). Las reglas no se cumplen sobre un valor que
   falta. Permite combinar sondeos con variables distintas, a costa de que el modelo vea un valor
   neutro donde no hay dato.
7. **z-score dentro del sondeo** (siempre calculado, usado por las reglas y los mapas):
   `zc_j = (t_j − μ_j,sondeo) / σ_j,sondeo`, con σ de población (divisor n; si σ = 0 se usa 1).
8. **Variables del modelo** (`scaling`):
   - `global` (por defecto): `f_j = (t_j − μ_j) / σ_j` con μ y σ de todas las muestras de todos
     los sondeos (σ de población). Conserva las diferencias de nivel entre sondeos.
   - `core`: `f = zc`. Elimina diferencias de nivel entre sondeos (útil si cambian la
     calibración o la litología de fondo).
   - `none`: `f = t`.
9. **Capas de intervalos como variables** (`cfg.layers`): por cada capa usada y cada una de sus
   categorías se añade una columna `«Capa: categoría»` que vale 1 si la muestra está dentro de un
   intervalo de esa categoría (`from ≤ x < to`, con el intervalo convertido al eje si hace falta)
   y 0 si no. Estas columnas van **después** de las numéricas y **no se transforman ni se
   escalan** (valen 0/1 en `raw`, `t`, `zc` y `f`). Una muestra sin intervalo de esa capa vale 0
   en todas sus categorías (también si el sondeo no tiene esa capa descrita). Los intervalos
   automáticos (§21.3) no se usan como variables.

### 21.3 Capas de intervalos, jerarquía y etiquetas
- **Capa:** `{id, name, parent, cats:[{id, name, color}]}`. Por defecto existe la capa «Eventos»
  con cuatro categorías. El usuario crea capas, las renombra, las borra y define categorías.
- **Jerarquía:** `parent` hace que una capa sea subdivisión de otra (p. ej. Turbidita dentro de
  Litología). Se impiden ciclos (no se puede elegir como madre una capa descendiente). Al dibujar un
  intervalo de una capa hija, se recorta al intervalo madre donde empieza el arrastre. Los
  intervalos hijos que no caben enteros en un intervalo madre del mismo sondeo se marcan con ⚠
  (`orphanIntervals`), pero se conservan.
- Al convertir un intervalo entre profundidad y edad, un extremo fuera del rango de datos del
  sondeo se ajusta al primer o último valor (`coreConvert(..., clamp)`); un intervalo entero fuera
  del rango se descarta. No se extrapola.
- **Intervalo:** `{id, core, layer, axis, from, to, cat, auto?}`. Se crean arrastrando sobre el
  registro, importándolos o aceptando la clasificación; se editan en la lista (categoría, techo,
  base) y se exportan en CSV.
- **Capa objetivo:** la capa que el clasificador aprende a asignar (`settings.target`). Las demás
  capas marcadas (`settings.useLayers`; por defecto todas) entran como variables 0/1. La capa
  objetivo **nunca** entra como variable.

`labelSamples` (solo intervalos y reglas de la capa objetivo):
- **Intervalos** `{core, axis, from, to, label}` dibujados arrastrando sobre el registro de un
  sondeo, en el eje activo. Si el eje cambia, se convierten con la relación profundidad–edad del
  sondeo (`coreConvert`, interpolación lineal). Una muestra está en el intervalo si
  `from ≤ x < to`.
- **Reglas** (asociaciones de variables): `{layer, cat, enabled, conds:[{feature, op, value}]}`.
  Las condiciones pueden usar variables numéricas o columnas 0/1 de otras capas. Se
  cumple si se cumplen **todas** las condiciones. `op`: `z>` / `z<` comparan `zc` (z-score dentro
  del sondeo); `>` / `<` comparan el valor original remuestreado (sin log).
- Prioridad: intervalo manual → primera regla activa que se cumpla (si «Usar reglas» está
  activo) → sin etiqueta.
- Los intervalos **automáticos** (`auto: true`) nunca son etiquetas de entrenamiento.
- Proyectos de V9: la lista de etiquetas se convierte en la capa «Eventos» y sus intervalos y
  reglas pasan a esa capa (`normalizeGeo`).

### 21.4 Métodos de aprendizaje
Todos usan un generador pseudoaleatorio con semilla (mulberry32, `seededRandom`; semilla por
defecto 42): el mismo proyecto da el mismo resultado. Parámetros por defecto en `METHODS`:

| Método | Parámetros por defecto | Descripción |
|--------|------------------------|-------------|
| Random Forest (`rf`, recomendado) | `trees` 100, `maxDepth` 12, `minLeaf` 3, `mtry` √d, `bins` 32, `bootstrap` sí, `balanced` sí | Árboles CART con impureza de Gini. Umbrales candidatos de cada variable: los cuantiles `b/bins` (b = 1…bins−1) de los datos de entrenamiento. En cada nodo se prueban `mtry` variables al azar. Con `balanced`, cada muestra pesa `n / (K · n_clase)`. Hoja: proporciones de clase ponderadas. Probabilidad = media de las hojas de todos los árboles. Importancia: reducción de Gini ponderada por el peso del nodo, sumada por variable y normalizada a 1 (MDI). |
| k vecinos (`knn`) | `k` 7, `weights` distance | Distancia euclídea en las variables escaladas. Voto `1/(d + 10⁻⁹)` (distance) o 1 (uniform), normalizado. |
| Bayes ingenuo gaussiano (`nb`) | `smoothing` 10⁻⁶, `priors` uniform | Media y varianza por clase y variable; a cada varianza se suma `smoothing · max_j var_j`. A priori uniforme o según la frecuencia. Log-verosimilitud normalizada con softmax. |
| k-medias (`kmeans`, sin etiquetas) | `k` 4, `restarts` 5, `maxIter` 100 | Inicio k-means++, iteraciones de Lloyd hasta que no cambian las asignaciones o `maxIter`; se queda la repetición con menor inercia. Grupos `G1…Gk`, que el usuario puede nombrar. |

- **Variables del modelo:** las numéricas elegidas más las columnas 0/1 de las capas usadas
  (§21.2, paso 9).
- **Entrenamiento:** con las muestras etiquetadas (intervalos y reglas de la capa objetivo). k-medias usa todas las
  muestras. Hacen falta al menos dos etiquetas distintas (salvo k-medias).
- **Clasificación:** cada muestra recibe la clase de mayor probabilidad si esta es ≥ la
  probabilidad mínima (por defecto 0,5); si no, queda sin clasificar.
- **Sondeos nuevos:** el modelo se aplica a todas las muestras, también a las de sondeos añadidos
  después de entrenar (`geoPredictAll`). Con escalado global, se usan la media y la desviación de
  las variables numéricas **congeladas al entrenar**, para que añadir sondeos no cambie la escala
  del modelo. Si cambian las variables, el eje, el escalado o la capa objetivo, hay que volver a
  entrenar.
- **Aceptar como intervalos:** las muestras contiguas de la misma clase predicha en un sondeo se
  convierten en intervalos de la capa objetivo con `auto: true` (se muestran claros y en cursiva).
  Sustituyen a los automáticos anteriores de ese sondeo y capa. El botón ✓ los confirma (dejan de
  ser automáticos y cuentan para entrenar).
- El modelo no se guarda en el archivo de proyecto (solo el método, los parámetros y la fecha).
  Al abrir el proyecto se reentrena con la misma semilla, por lo que el resultado es el mismo si
  los datos no han cambiado.

### 21.5 Validación cruzada
`crossValidate`:
- Con muestras etiquetadas en **dos o más sondeos: dejando un sondeo fuera** (cada sondeo se
  predice con un modelo entrenado sin él).
- Con un solo sondeo: **5 bloques contiguos** a lo largo del eje.
- Ambos esquemas evitan que muestras vecinas (autocorrelacionadas) estén a la vez en
  entrenamiento y prueba, lo que inflaría el acierto.
- Se informa: matriz de confusión, acierto, **acierto equilibrado** (media de la sensibilidad de
  cada clase, que no se deja engañar por una clase mayoritaria como el fondo), precisión,
  sensibilidad y F1 por clase. En validación se usa probabilidad mínima 0.

### 21.5 bis Prueba de la autoclasificación en un sondeo
`geoTestCore` (botón «Probar la autoclasificación en este sondeo»), con el método y los parámetros
elegidos (k-medias se sustituye por Random Forest):
- si las muestras etiquetadas de **otros sondeos** cubren al menos dos clases, se entrena con ellas
  y se predice el sondeo actual;
- si no, el sondeo se divide en **5 bloques contiguos** a lo largo del eje y cada bloque se
  predice con un modelo entrenado con todas las etiquetas menos las de ese bloque.

Se muestran las bandas «Prueba» y «Acierto» (verde si la predicción coincide con la etiqueta,
rojo si no) y el porcentaje de coincidencia sobre las muestras etiquetadas del sondeo. Es una
comprobación visual de la validación cruzada (§21.5) en un sondeo concreto; no cambia el modelo
entrenado. «Colorear registros por clase» rellena el fondo de cada columna de registro (opacidad
0,22) con la clase de la prueba, si existe; si no, de la clasificación; si no, de las etiquetas.

### 21.6 Mapas por edad
- **Ventana de edad** `[a0, a1)` (por defecto 6–10 ka); los botones ◀ ▶ la desplazan su propia
  anchura.
- **Clase dominante** (`mapSummary`, modo `class`): por sondeo, fracción de muestras de cada
  clase predicha (o de las etiquetas si no hay modelo) en la ventana; el punto toma el color de la
  dominante y su radio es `5 + 5 · fracción` px.
- **Valor de un proxy** (modo `value`): media de `zc` de la variable en la ventana; opcionalmente
  menos su media en una ventana de referencia (anomalía). Escala divergente azul–beige–rojo
  saturada en ±2.
- **Interpolación IDW** (`idwGrid`, solo modo valor, ≥ 3 sondeos con dato): malla de 90 columnas;
  `v = Σ w_i v_i / Σ w_i`, `w_i = 1 / d_i^p` (p por defecto 2), con `d` en grados y la longitud
  multiplicada por `cos(latitud central)`. Es exploratoria: no estima incertidumbre ni respeta
  barreras de tierra.
- **Proyección** equirectangular con la longitud escalada por `cos(latitud central)`. Costa:
  Natural Earth 1:50 m (dominio público), 1223 anillos en `examples/data/land-50m.json`.
- Exportación SVG y CSV (`core, lat, lon, n_samples, dominant_class, fraction, value`).

### 21.7 Superposición con el registro del sondeo
- En el modo «Multiproxy», el registro de cada sondeo muestra sus variables numéricas y una banda
  por capa de intervalos en orden jerárquico (las hijas con «↳»), dibujada desde los intervalos;
  en la capa objetivo se añaden, en claro, las muestras etiquetadas por reglas. Al final, la banda
  **«Clasif. auto»** (predicción).
- Si el sondeo de las imágenes está incluido, el registro compuesto (§18) añade sus bandas de
  intervalos y de clasificación junto a la imagen y la bioturbación, en profundidad o en edad.
- Exportación de la clasificación (`*_clasificacion_intervalos.csv`): sondeo, eje, profundidad,
  edad, variables, etiqueta, origen de la etiqueta, clase predicha y probabilidad.
- Exportación de intervalos (`*_intervalos.csv`): sondeo, capa, capa madre, categoría, eje, techo,
  base, automático y fuera de la capa madre. Se puede volver a importar.

### 21.8 ter Datos propios de la tesis (desde V12)
`tools/make_thesis_dataset.py` lee los archivos originales del autor (carpeta «Proyectos
Investigación») y escribe `examples/tesis_casanova/privado/`, que **no se sube a GitHub** (datos no
publicados, coautores). Solo entra en el archivo único construido en el ordenador del autor y en la
página de prueba privada. Contenido:
- ODP 977A: bioturbación de trazas discretas y total con BI e ii, gris de la imagen (medias cada
  5 cm), número y área de trazas cada 5 cm, CaCO3, TOC y TS, más los registros de PANGAEA (SST,
  C37:4, color, susceptibilidad).
- GP03 (cap. VIII): XRF (19 razones), ICP (óxidos y traza), susceptibilidad magnética y grupos de
  foraminíferos bentónicos, en cm; modelo de edad de la tabla XRF del autor; intervalos de las
  etiquetas del autor en esa tabla (periodo climático, clima cálido/frío/templado, ORL/no ORL);
  marcas de una sola muestra (H2–H5) descartadas.
- LC10 (cap. IX): razones ITRAX (medias cada 1 cm) y factores de enriquecimiento ICP; edad del
  modelo de la tabla IX.1.
- ODP 977A: estadiales H1–H6 y límites MIS del archivo de eventos de la tesis; ORL nuevas a–f.
- ODP 976: ORL A1–A6 con profundidad y edad del autor y tipo de la tabla VII.3.
- «Fuera de capa orgánica» se recalcula al cargar como complemento de las capas orgánicas de cada
  sondeo (977A 0–147 ka, 976 0–135 ka, LC10 0–653 cm; GP03 lo trae en sus etiquetas).

Configuración al cargar con estos datos: 12 variables (8 razones XRF comunes a GP03 y LC10,
bioturbación total, gris, TOC y SST), escalado por sondeo (las cuentas de dos escáneres distintos,
Avaatech e ITRAX, no son comparables en valor absoluto), valores que faltan con la media, capa
objetivo «Capas orgánicas» sin capas como variables. Resultado V12 (Random Forest, semilla 42):
validación dejando un sondeo fuera, acierto 61,1 %, acierto equilibrado 17,7 % (7 clases); prueba en
LC10 entrenando con los otros tres: 85,6 % de coincidencia, sobre todo por «fuera de capa orgánica»;
en GP03, 29,8 %. Con variables tan distintas entre sondeos, la transferencia entre sondeos es pobre.

### 21.8 bis Sondeos de la tesis (datos reales, primera versión)
`examples/tesis_casanova/` y `loadThesisCores` (app.js). Registros de PANGAEA de ODP 977A (0–30 mbsf;
color y susceptibilidad promediados cada 5 cm; edad interpolada con el modelo de Martrat et al.,
2004) y ODP 976 (por edad), e intervalos y posiciones tomados de la tesis (Caps. IV, VI–IX). Fuentes
y DOI en el README de la carpeta. Configuración al cargar: eje edad, paso 0,5 ka, escalado global,
variables SST, CaCO3, TOC, L\*, a\*, b\* y susceptibilidad; capa objetivo «Capas orgánicas»
(ORL tipo 1, 2 y 3, ORL sin tipo, sapropel, fuera de capa orgánica); «Fases internas» es
subdivisión de «Capas orgánicas». Se cargan solos al abrir Multiproxy en un proyecto sin sondeos
mientras `PRELOAD_THESIS` sea `true`.

Resultado en V11 (Random Forest, valores por defecto, semilla 42): validación por 5 bloques en
977A, acierto 78,8 %, acierto equilibrado 36 %. Las ORL tipo 1–3 suman pocas muestras; el modelo
aprende sobre todo «fuera de capa orgánica». «Fuera de capa orgánica» es el complemento de las ORL
descritas, no una observación.

### 21.8 Datos de demostración (sintéticos)
`tools/make_geochem_demo.py` (semilla 397) genera 15 sondeos **ficticios** en el Mediterráneo
(0–150 ka cada 0,5 ka, 4515 muestras) con eventos conocidos (columna `event_true`): baja
oxigenación en 6–10, 79–86, 100–105 y 122–128 ka solo al este de ~11° E (Ba/Al y TOC altos, Mn/Al
bajo, más intensos hacia el este); aporte detrítico en 14–29, 57–71 y 130–150 ka (Ti/Al alto,
Ca bajo); pulsos de corriente al oeste de 10° E (Zr/Rb alto). Ruido AR(1) multiplicativo. Además, `intervals.csv` (generador aleatorio aparte, semilla 398,
para no cambiar los registros numéricos): capa **Litologia** («Arcilla limosa» en las ventanas
detríticas con los límites desplazados ±1 ka; «Marga nanofosilifera» el resto) y capa
**Turbidita**, de 0 a 3 capas finas (0,3–1,2 ka) por sondeo, siempre dentro de arcilla limosa
(subdivisión). Archivos: `examples/geochem_demo/` (tabla larga, catálogo, un archivo por sondeo e
intervalos en profundidad).

El botón «Datos de demostración» etiqueta intervalos a partir de la verdad sintética en dos sondeos
por evento (DEMO-02 y DEMO-12 detrítico; DEMO-09 y DEMO-14 baja oxigenación; DEMO-01 y DEMO-04
corriente) más el fondo de esos sondeos, importa `intervals.csv` (Turbidita como subdivisión de
Litologia), añade una regla de ejemplo (Ba/Al z > 1,5 y Mn/Al z < −0,5 → baja oxigenación) y
entrena un Random Forest con capa objetivo «Eventos» y 9 variables (6 numéricas y 3 de capas).

**Para el revisor.** Los resultados con estos datos (V10: acierto 98,4 %, acierto equilibrado
96,7 %, dejando un sondeo fuera, 1730 muestras etiquetadas; en V9, sin capas de intervalos, 98,6 %
y 97,7 %) **solo comprueban que la
implementación funciona**: los eventos sintéticos están muy separados y no representan la
dificultad de datos reales. La validez para interpretar eventos reales debe medirse con sondeos
con interpretación publicada e independiente, dejando sondeos enteros fuera. Las etiquetas por
reglas hacen que el modelo reaprenda las reglas: su acierto mide coherencia, no verdad. La
importancia MDI reparte el mérito de forma desigual entre proxies correlacionados (p. ej. Ba/Al y
TOC); para un artículo conviene añadir importancia por permutación. En la demostración la
litología se construyó a partir de las ventanas detríticas, así que está muy ligada a la etiqueta
«aporte detrítico»: con datos reales, una capa descrita así de cerca del objetivo puede hacer que
el modelo dependa de la descripción y no de los registros.

---

## 22. Referencias

- Casanova-Arenillas, S., Rodríguez-Tovar, F.J., Martínez-Ruiz, F. (2020). Applied ichnology in
  sedimentary geology: Python scripts as a method to automatize ichnofabric analysis in marine core
  images. *Computers & Geosciences* 136, 104407. https://doi.org/10.1016/j.cageo.2020.104407
- Dorador, J., Rodríguez-Tovar, F.J. (2014). Quantitative estimation of bioturbation based on
  digital image analysis. *Marine Geology* 349, 55–60.
- Dorador, J., Rodríguez-Tovar, F.J. (2018). High-resolution image treatment in ichnological core
  analysis: Initial steps, advances and prospects. *Earth-Science Reviews* 177, 226–237.
- Dorador, J., Rodríguez-Tovar, F.J., IODP Expedition 339 Scientists (2014). Digital image treatment
  applied to ichnological analysis of marine core sediments. *Facies* 60, 39–44.
  https://doi.org/10.1007/s10347-013-0383-z
- Droser, M.L., Bottjer, D.J. (1986). A semiquantitative field classification of ichnofabric.
  *Journal of Sedimentary Petrology* 56, 558–559.
- Gonzalez, R.C., Woods, R.E. (2018). *Digital Image Processing*, 4.ª ed. Pearson.
- Kikuchi, K., Naruse, H. (2024). Abundance of trace fossil *Phycosiphon incertum* in core sections
  measured using a convolutional neural network. *Sedimentary Geology* 461, 106570.
  https://doi.org/10.1016/j.sedgeo.2023.106570
- Hu, M.-K. (1962). Visual pattern recognition by moment invariants. *IRE Transactions on
  Information Theory* 8, 179–187.
- Martrat, B., et al. (2004). Abrupt temperature changes in the Western Mediterranean over the past
  250,000 years. *Science* 306, 1762–1765.
- Miguez-Salas, O., Dorador, J., Rodríguez-Tovar, F.J. (2019). Introducing Fiji and ICY image
  processing techniques in ichnological research as a tool for sedimentary basin analysis.
  *Marine Geology* 413, 1–9. https://doi.org/10.1016/j.margeo.2019.03.013
- Reineck, H.-E. (1963). Sedimentgefüge im Bereich der südlichen Nordsee. *Abhandlungen der
  Senckenbergischen Naturforschenden Gesellschaft* 505, 1–138.
- Rodríguez-Tovar, F.J., Miguez-Salas, O., Dorador, J. (2020). Image processing techniques to improve
  characterization of composite ichnofabrics. *Ichnos*. https://doi.org/10.1080/10420940.2020.1744579
- Serra, J. (1982). *Image Analysis and Mathematical Morphology*. Academic Press.
- Di Martino, A., Carlini, G., Castellani, G., Remondini, D., Amorosi, A. (2023). Sediment core
  analysis using artificial intelligence. *Scientific Reports* 13, 20409.
- Otsu, N. (1979). A threshold selection method from gray-level histograms. *IEEE Transactions on
  Systems, Man, and Cybernetics* 9, 62–66.
- Rodríguez-Tovar, F.J., Dorador, J. (2015). Ichnofabric characterization in cores: a method of
  digital image treatment. *Annales Societatis Geologorum Poloniae* 85. https://doi.org/10.14241/asgp.2015.010
- Zuiderveld, K. (1994). Contrast limited adaptive histogram equalization. En: Heckbert, P. (ed.),
  *Graphics Gems IV*, Academic Press, 474–485.
- Taylor, A.M., Goldring, R. (1993). Description and analysis of bioturbation and ichnofabric.
  *Journal of the Geological Society* 150, 141–148.

> Antes de enviar cualquier artículo, comprobar cada referencia con la publicación original.
