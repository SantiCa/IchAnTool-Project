# Métodos y defensa ante revisores

Para cada artículo previsto: qué partes de IchAnTool usa, qué se puede afirmar con lo que ya está
hecho, qué falta comprobar antes de enviarlo y las preguntas que probablemente hará un revisor,
con una respuesta preparada.

Los detalles de cada algoritmo (fórmulas, parámetros, archivos de código) están en
[`docs/DOCUMENTACION_TECNICA.md`](../docs/DOCUMENTACION_TECNICA.md). Aquí se cita la sección (§).
El historial de cambios está en [`docs/HISTORIAL_VERSIONES.md`](../docs/HISTORIAL_VERSIONES.md).

Regla general: **solo se afirma lo que está medido**. Lo que no está validado se presenta como
limitación o trabajo futuro.

---

## Artículo 1 — Software (JOSS)

### Qué describe
El paquete Python y la aplicación web como herramienta abierta para calcular series continuas de
bioturbación a partir de imágenes de testigos.

### Métodos que usa
| Método | § |
|--------|---|
| Escala de profundidad y zona de análisis | §2 |
| Porcentaje por intervalos, multiclase y exclusiones | §3, §8 |
| BI e ii (tramos de la V2, configurables) | §4 |
| Modelo de edad (interpolación lineal) | §5 |
| Realce, detección y edición (aplicación web) | §6–§8 |
| Identificación asistida k-NN (aplicación web) | §10 |
| Formatos de exportación | §12 |
| Resolución de trabajo, proyectos | §16–§17 |
| Registro compuesto y registros externos | §18–§19 |

### Qué se puede afirmar hoy
- Integra en una sola herramienta las imágenes, la bioturbación y otros registros del mismo sondeo, en profundidad o en edad, con exportación vectorial (§18). Demostrado con datos públicos del IODP (sondeo de prueba U1385I-1H).
- Reproduce exactamente los resultados publicados en 2020 (prueba de regresión, §13.1).
- La aplicación web da los mismos BI e ii que la versión publicada en la imagen de ejemplo
  (100 %), con una diferencia de porcentaje ≤ 0,56 puntos explicada por los pesos de gris
  (§3.4, §13.2).
- Es determinista y el archivo de proyecto permite reproducir cualquier análisis (§15).
- Tiene pruebas automáticas en integración continua (§13.1).

### Qué falta antes de enviarlo
- [ ] Publicar en PyPI y crear la release con DOI en Zenodo.
- [ ] Documentación de uso (tutorial con un testigo real) y notebook de ejemplo.
- [ ] Capa de exclusión también en el paquete Python, para igualar las dos implementaciones.
- [ ] Alojar la aplicación en GitHub Pages.
- [ ] Decidir la licencia definitiva.
- [ ] Revisar la bibliografía.

### Preguntas probables de revisores (JOSS revisa también el código)
**¿Qué aporta frente a ImageJ/Fiji, que ya cuenta píxeles?**
ImageJ da un área total. IchAnTool da una **serie continua por profundidad o edad** con BI, ii y
porcentaje por icnotaxón, lista para correlacionar con datos geoquímicos. Gestiona varias secciones,
zonas excluidas y modelo de edad en un solo flujo. Ese flujo en ImageJ requiere macros propias.

**¿Cómo sé que los resultados son correctos?**
Pruebas con casos calculados a mano y prueba de regresión frente a los resultados publicados
(§13.1). Ambas se ejecutan automáticamente en cada cambio.

**¿Por qué dos implementaciones (Python y JavaScript)?**
Python para análisis por lotes y reproducibilidad en scripts. Web para el trabajo interactivo sin
instalar nada. Comparten las mismas definiciones y las pruebas comprueban los mismos casos en las
dos (§1, §13.1).

**¿Por qué BI e ii salen solo del porcentaje?**
Es la componente cuantificable de esas escalas. Se documenta que no sustituye la descripción
completa del icnofábrica, y la aplicación guarda el índice manual del usuario (§4.3).

---

## Artículo 2 — Conjunto de datos anotado y segmentación automática

### Qué describirá
Un conjunto abierto de imágenes de testigos con máscaras de bioturbación (y de icnotaxones),
anotado con la aplicación web, y la evaluación de métodos automáticos de detección e
identificación.

### Métodos que usa
| Método | § |
|--------|---|
| Herramientas de anotación (varita, pincel, lazo, exclusión) | §8 |
| Detección clásica: umbral adaptativo + morfología (método base) | §7 |
| Descriptores de objeto | §9 |
| k-NN con rechazo de novedad (método base de identificación) | §10 |
| Segmentación aprendida tipo U-Net (**por implementar**) | — |
| Formato de máscara y paleta | §12 |

### Qué se puede afirmar hoy
Nada sobre la precisión en datos reales: todavía no hay datos anotados. Solo que las herramientas
existen y producen máscaras en un formato abierto.

### Experimentos necesarios
1. **Datos:** testigos con imágenes de licencia clara (IODP/ODP son públicas; las imágenes tratadas
   del grupo de la UGR, con permiso). Anotar la resolución y el equipo de cada imagen.
2. **Protocolo de anotación escrito**, con criterios de qué es traza, qué es artefacto y qué se
   excluye.
3. **Concordancia entre anotadores:** al menos dos expertos anotan el mismo subconjunto. Se mide
   IoU (intersección sobre unión) y la diferencia de porcentaje por intervalo.
4. **División por testigo**, no por recortes: los testigos de prueba no se usan para entrenar ni
   para ajustar parámetros. Evita resultados inflados por autocorrelación espacial.
5. **Métricas:**
   - IoU y F1 por píxel.
   - Error absoluto del porcentaje por intervalo.
   - Coincidencia de BI e ii.
   - Para la identificación: matriz de confusión y F1 por clase.
6. **Comparaciones:** umbral adaptativo (método base), U-Net y concordancia entre humanos, que es
   el techo razonable.

### Preguntas probables de revisores
**¿Por qué un umbral adaptativo como base y no directamente deep learning?**
Porque es reproducible, no necesita datos de entrenamiento y marca el nivel mínimo que un método
aprendido debe superar. Se compara con U-Net en el mismo conjunto de prueba.

**¿El acierto del k-NN no está inflado?**
El acierto dejando uno fuera que muestra la aplicación sí puede estarlo (§10, nota al revisor).
En el artículo solo se dará el acierto en **testigos independientes**.

**¿Qué pasa con la dependencia del color y de la cámara?**
Se documentan el equipo y la iluminación de cada imagen y se evalúa el rendimiento entre fuentes
distintas (entrenar con unas, probar con otras). Los descriptores de tamaño van en unidades
físicas (§9).

**¿Hay trabajos previos con deep learning en bioturbación?**
Sí. Hay que revisarlos y citarlos: el artículo de *Applied Sciences* 11(16):7736 (2021) sobre deep
learning en análisis icnológico y la patente US12142024. La aportación propia es el **conjunto de
datos abierto**, la herramienta de anotación libre y la comparación con concordancia humana.

---

## Artículo 3 — Validación y aplicación paleoambiental

### Qué describirá
1. Cuánto difieren los índices automáticos de la estimación visual de varios icnólogos.
2. Registros continuos de bioturbación y de icnotaxones en testigos largos, correlacionados con
   indicadores geoquímicos y de temperatura (amplía el ejemplo de ODP 977 de 2020).

### Métodos que usa
| Método | § |
|--------|---|
| Porcentaje, BI e ii automáticos | §3–§4 |
| BI e ii manuales en la aplicación | §4.3 |
| Porcentaje por icnotaxón e identificación asistida | §3, §10–§11 |
| Modelo de edad | §5 |
| Registro compuesto, registros externos y CSV interpolado | §18–§19 |

### Experimentos necesarios
0. **Modelo de edad publicado:** el del sondeo de prueba es ilustrativo y no vale para interpretar.
1. **Experimento a ciegas:** de 3 a 5 icnólogos asignan BI e ii visuales a los mismos intervalos,
   sin ver el resultado automático. La aplicación ya permite registrarlo (columnas `BI_manual` e
   `ii_manual`).
2. **Estadística:**
   - Concordancia entre observadores (kappa de Cohen ponderado o coeficiente de correlación
     intraclase).
   - Sesgo de cada observador frente al valor automático.
   - Diagrama de Bland-Altman para el porcentaje.
3. **Aplicación:**
   - Elegir testigos con buenas imágenes y datos de indicadores ya publicados (material de la
     tesis).
   - Correlación con desfase y prueba de significación que tenga en cuenta la autocorrelación de
     las series.

### Preguntas probables de revisores
**Si los observadores no coinciden entre sí, ¿con qué se valida el método?**
No se trata de que la máquina «acierte» a un experto. Se mide cuánta variabilidad hay entre
expertos y si el método automático cae dentro de ella, con la ventaja de ser reproducible.

**¿Una medida 2D de la cara del testigo representa la bioturbación?**
Es la misma limitación de las estimaciones visuales, que también se hacen sobre la cara expuesta.
Se indica como limitación (§14) y se mantiene la comparación en las mismas condiciones.

**¿Cómo afecta la incertidumbre del modelo de edad a las correlaciones?**
Se discute aparte. Si hace falta, se repite el análisis con modelos de edad alternativos. El
programa no propaga esa incertidumbre (§5).

---

## Lista de comprobación antes de enviar cualquier artículo
- [ ] Cada método citado en el texto tiene su sección en `DOCUMENTACION_TECNICA.md`, y coincide con
      el código de la versión citada.
- [ ] Versión del software citada con DOI de Zenodo.
- [ ] Parámetros usados guardados (archivo de proyecto) y publicados como material suplementario.
- [ ] Datos y máscaras depositados (Zenodo o PANGAEA) con licencia.
- [ ] Limitaciones declaradas (§14).
- [ ] Referencias comprobadas contra los originales.
- [ ] Coautorías y agradecimientos acordados.
