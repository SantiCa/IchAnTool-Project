# Documentación técnica de IchAnTool

Versión del documento: V7 (31-10-2026). Componentes descritos: paquete Python 3.0.0.dev0 y
aplicación web 0.2.

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
20. Referencias

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
| `app/js/storage.js` | Biblioteca de proyectos (IndexedDB) | Sí |
| `app/js/app.js` | Interfaz, herramientas, dibujo, archivos | Sí |
| `app/js/i18n.js` | Textos en español e inglés | Sí |

`core.js`, `imageproc.js`, `learn.js` y `log.js` no usan el navegador. Por eso se prueban automáticamente con Node
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
2. **Niveles:** `v₁ = limitar((v − negro) / (blanco − negro), 0, 1)`.
3. **Gamma:** `v₂ = v₁^(1/γ) · 255`.
4. **Contraste y brillo:** `v₃ = (v₂ − 128) · F + 128 + 2,55 · brillo`, con
   `F = 259 (C + 255) / (255 (259 − C))` y `C = 2,55 · contraste` (contraste entre −100 y 100).
   Los pasos 2 a 4 se precalculan en una tabla de 256 valores.
5. **Saturación:** `v₄ = l + (v₃ − l) · s`, con `l` = luminancia BT.601 y `s` = saturación / 100.
6. **Ecualización del histograma** (opcional): sobre la luminancia, con la función de
   distribución acumulada:
   `T = (CDF(L) − CDF_min) / (n − CDF_min) · 255`.
7. **Contraste local** (máscara de enfoque, *unsharp mask*): sobre la luminancia,
   `T' = T + a · (T − media_r(T))`, con `a = cantidad / 25` y `media_r` = media en una ventana
   cuadrada de lado `2r + 1` (desenfoque de caja separable, coste proporcional al número de
   píxeles).
8. Los pasos 6 y 7 se aplican como un **desplazamiento de luminancia** igual en R, G y B
   (`R += T' − L`, etc.), que conserva aproximadamente el tono.
9. **Inversión** (opcional): `v = 255 − v`.

Ajustes predefinidos (`FILTER_PRESETS`):

| Ajuste | Valores |
|--------|---------|
| Sin realce | todo neutro |
| Niveles y contraste | negro 40, blanco 215, contraste 25, saturación 140 % |
| Contraste local | cantidad 60, radio 25 px, contraste 15 |
| Ecualizado + contraste local | gris, ecualizar, cantidad 40, radio 20 px |

**Para el revisor.** Son operaciones estándar de procesado de imagen (Gonzalez y Woods, 2018). El
ajuste «Niveles y contraste» sigue la idea del tratamiento de Dorador y Rodríguez-Tovar (2014)
(ajuste de niveles, contraste y saturación para resaltar trazas), pero los valores numéricos son
propios, no los de ese trabajo. Los parámetros de realce de cada sección se guardan en el
proyecto, así que el procedimiento se puede reproducir.

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
| `*.ichantool.json` | Proyecto completo (formato v2; también abre v1): clases, ajustes, modelo de edad, ejemplos importados y, por sección, la imagen original (base64), el giro, profundidades, zona, realce, detección, índices manuales, objetos y capas de etiquetas y exclusión comprimidas por RLE. La v2 añade `ds` (factor de reducción), `records` (registros externos), `logView` (vista del registro) y `notes` |

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

## 20. Referencias

- Casanova-Arenillas, S., Rodríguez-Tovar, F.J., Martínez-Ruiz, F. (2020). Applied ichnology in
  sedimentary geology: Python scripts as a method to automatize ichnofabric analysis in marine core
  images. *Computers & Geosciences* 136, 104407. https://doi.org/10.1016/j.cageo.2020.104407
- Dorador, J., Rodríguez-Tovar, F.J. (2014). Quantitative estimation of bioturbation based on
  digital image analysis. *Marine Geology* 349, 55–60.
- Dorador, J., Rodríguez-Tovar, F.J. (2018). High-resolution image treatment in ichnological core
  analysis: Initial steps, advances and prospects. *Earth-Science Reviews* 177, 226–237.
- Droser, M.L., Bottjer, D.J. (1986). A semiquantitative field classification of ichnofabric.
  *Journal of Sedimentary Petrology* 56, 558–559.
- Gonzalez, R.C., Woods, R.E. (2018). *Digital Image Processing*, 4.ª ed. Pearson.
- Hu, M.-K. (1962). Visual pattern recognition by moment invariants. *IRE Transactions on
  Information Theory* 8, 179–187.
- Martrat, B., et al. (2004). Abrupt temperature changes in the Western Mediterranean over the past
  250,000 years. *Science* 306, 1762–1765.
- Reineck, H.-E. (1963). Sedimentgefüge im Bereich der südlichen Nordsee. *Abhandlungen der
  Senckenbergischen Naturforschenden Gesellschaft* 505, 1–138.
- Serra, J. (1982). *Image Analysis and Mathematical Morphology*. Academic Press.
- Taylor, A.M., Goldring, R. (1993). Description and analysis of bioturbation and ichnofabric.
  *Journal of the Geological Society* 150, 141–148.

> Antes de enviar cualquier artículo, comprobar cada referencia con la publicación original.
