# GENERADOR DE MACETEROS MAESTRO

Herramienta estática: abrir mediante un servidor HTTP, no file://.

- Perfil de revolución VASEGEN con radios dtop/dbott, bandas y drenaje triple.
- Retranqueo independiente de hbump. Desplazamiento radial 0..hbump según gris.
- Dos chaflanes rectos desde los bordes exteriores completos hacia la pared; ángulo compartido medido desde horizontal (35° inicial, umbral 30°); filete circular tangente en la esquina exterior superior.
- El bump conserva toda su amplitud sobre la cara roja completa. Se une con los soportes de chaflán mediante máximo radial (unión de sólidos de sección radial), sin mezcla, suavizado ni atenuación del mapa. El soporte puede ocupar un valle en la intersección, pero no reduce ni mueve las crestas del bump.
- Se rechazan radios o chaflanes que no caben en las longitudes disponibles.
- Dos zonas de densidad; arcos con al menos ocho segmentos. La vista y el STL utilizan los mismos vértices y caras.
- Corrección opcional por envolvente radial: añade material bajo los voladizos conservando las crestas, con pendiente de 31° para un umbral de 30°. Puede rellenar valles. La vista roja señala caras descendentes inferiores a 30° sobre la malla final, sin contar la base apoyada. No sustituye el laminado por capas.
- JSON v4; se leen v1/v2/v3 conservando las medidas de las operaciones por ubicación.

El filete solo modifica la esquina exterior superior. Revisar los voladizos del STL en el laminador con la textura y los parámetros definitivos.


## Molde local de cuatro piezas
- Cálculo manual desde la malla final; núcleo hueco y tres sectores de 120 grados.
- Negativo por sustracción booleana: conserva bump, chaflanes y filete.
- Pared 6 mm inicial; pestaña exterior radial 15 mm medida desde la pared del molde (antes se medía desde el radio del macetero); solape 2.5 mm.
- Radio de vertido seleccionable 20/50/100 mm, validado contra la base.
- Tres alojamientos pasantes en núcleo para pasadores separados, holgura radial inicial 0.2 mm. No son roscas ni piezas impresas de drenaje.
- STL individual por pieza, separación visual y sección desde triángulos reales.
- Grupos y mapa de ángulo local frente a salidas radiales. No corrige textura ni certifica extracción sin colisiones.
- Cierres (opcional, activo por defecto): aleta radial en cada junta (mismo ancho radial que la pestaña, espesor por lado 5 mm) partida por el plano de la junta; pernos horizontales M4/M5/M6 (M6 por defecto, perforación Ø perno + 0.4 mm; la pestaña mínima es la cabeza + 4 mm: Ø10 + 4 para M6) cada ~70 mm (mínimo 2 por junta; los extremos quedan a 20 mm del borde superior e inferior de la aleta, ajustable) y 3 pernos verticales núcleo–sector en la pestaña, en el centro de cada sector.
- Llaves de registro. Entre tercios: lengüeta macho (10 × 30 × 3 mm, flancos a 45°) en la aleta del sector posterior a cada junta, una por tramo entre pernos, inclinada con la pared; hueco con holgura 0.2 mm en la aleta del sector anterior. La salida relativa entre vecinos queda a 30° de la normal, dentro del flanco de 45°. Núcleo: 2 conos de 45° (Ø8 × 2.5 mm) por sector a ±30° del centro, hacia abajo, en la pestaña.
- Desmoldeo: retirar pernos, núcleo en vertical, luego sectores en radial (el solape del núcleo bloquea los sectores mientras está puesto).
- El cálculo informa pernos (cantidad y largo) y llaves.
- Limpiar cancela tareas y conserva parámetros; reconstruir recalcula. Cambios invalidan el molde y sus exportaciones.
- verify-mould.mjs: bordes con incidencia dos, cuatro componentes individuales, STL binario y solapamiento con el macetero menor que una película de 0.05 µm sobre su superficie (ruido de superficies coincidentes) y <0.01 mm³ entre piezas (tolerancia de conversión Float32; las booleanas extra de los cierres suman ruido de superficie, ~0.016 mm³ en toda una pieza), en tamaños para radios 20/50/100.

## Textura fijada al molde
- "Fijar repeticiones al molde" (activo por defecto): la textura es un módulo repetido exactamente 3 × k veces alrededor (k = copias por pieza), así los tres sectores llevan copias idénticas. Escala y semilla cambian el dibujo dentro del módulo, no la cantidad.
- Reacción–difusión fijada: la simulación usa N × N celdas por módulo, N = ancho del módulo / "escala del grano" (mm por celda, 32–512). Grano más chico = dibujo más fino. Repeticiones y ancho de módulo libres quedan desactivados.
- La espiral no se fija (usa sus columnas).
- Semilla visible arriba en MAPA / FAMILIA, con botón de semilla al azar.
- Patrones regulares: diamantes (alto/ancho, dureza), rayas verticales (dureza = meseta), rayas suaves (coseno), rayas suaves inclinadas (ángulo) y curvadas inclinadas (ángulo, curvatura en anchos de módulo, curvas a lo alto). Cantidad = "Escala / repeticiones" por módulo; siempre entera, sin costura.

## Molde liviano (menos material)
- Pared 3 mm por defecto (antes 6). Pestaña superior con espesor propio: 4 mm (núcleo y tercios), así los pernos verticales aprietan sin doblarla.
- Aletas recortadas entre pernos: entre dos pernos la aleta se quita hasta un borde de 1 mm pegado a la pared. Cada perno queda en una oreja con bordes a 45° (se imprime parada sin soportes); la oreja cubre la cabeza del perno (Ø cabeza/2 + 1 mm).
- Llave entre tercios: lengüeta corta (10 × 8 × 1.5 mm, flancos 45°) por fuera de los pernos de los extremos, bajo el inferior y sobre el superior; hueco con holgura en la pieza vecina.
- Pines del núcleo más chicos (Ø5 × 1.5 mm) y desplazados al borde exterior de la pestaña.
- Aviso de pared: se sugiere 4 mm sobre 150 mm de alto o 180 mm de diámetro, y 5 mm sobre 220 / 260 mm (regla práctica, no cálculo).
- Con el macetero por defecto: 590 → 351 cm³ (pared 3, aletas 3 mm recortadas) en las 4 piezas (−37 %).
- Plano de sección con cotas: alturas (macetero, molde, fondo, espesores de pestaña), pared, diámetros (vertido, macetero abajo/arriba, molde abajo, pestaña), ancho de pestaña y aleta, y posición de los pernos de la aleta medida desde la base del molde.
- Pestaña en orejas: la pestaña superior (núcleo y tercios) se recorta a 3 mm del borde del macetero, salvo una oreja en cada junta (±17 mm desde el plano de la junta). Cada oreja lleva el perno vertical del tercio que empieza en esa junta (a 10 mm del plano, para que la tuerca libre la aleta) y el pin del núcleo del tercio vecino al otro lado. 351 → 307 cm³.

## Tamaños estándar
- Botones S / M / ML bajo las acciones. Cada clic borra la geometría, el molde y todos los parámetros (macetero, textura y molde vuelven a los valores por defecto) y construye el tamaño elegido desde cero.
- S · CHICO: Ø100 arriba, Ø80 abajo, 100 mm de alto (el estándar anterior).
- M · MEDIANO: Ø150 / Ø120 / 150 mm. ML · MEDIANO-GRANDE: Ø200 / Ø160 / 200 mm. El fondo mantiene la proporción 0.8 del S y el alto es igual al diámetro superior.
- Espesores iguales en los tres. Volumen del molde por defecto: S 307 cm³, M 691 cm³, ML 1237 cm³. En ML el generador sugiere pared de 4 mm.
- El JSON guarda el tamaño y acepta los patrones nuevos al cargar.

## Peso y cargas
- Peso estimado del macetero = volumen × densidad del mortero (cemento + arena + agua). 2.1 g/cm³ por defecto (fresco ~2.0–2.2; seco algo menos); ajustable en el panel del molde. También aparece en las estadísticas del macetero.
- Cargas del vertido invertido: presión hidrostática p = ρ·g·H × 1.5 (golpeteo/vibrado) en el borde; tensión de aro en la pared p·r/t; fuerza por junta ρ·g·r·H²/2 × 1.5 repartida entre los pernos de la aleta; flexión de la aleta 6·F·e/(b·t²) con e = mitad del ancho de aleta. Admisible 10 MPa (impreso cargado entre capas) → factor de seguridad.
- Resultado con espesores por defecto: S 0.61 kg (pared FS 194, aleta FS 7.8); M 1.50 kg (aleta FS 3.5); ML 2.77 kg (aleta FS 1.5 → aviso). La pared de 3 mm sobra en los tres; lo que limita en ML son las aletas de 3 mm (5 mm → FS 4.1).
- Modelo simplificado para dimensionar, no un cálculo estructural.

## Cáscara que sigue la textura (activa por defecto)
- Antes: el exterior de los tercios era una revolución lisa a radio de banda + pared; el espesor real era pared + retranqueo − relieve local (3 mm en las crestas, hasta pared + retranqueo = 11 mm en los valles). thick no interviene: es la pared del propio macetero.
- Ahora: la cara exterior es el offset esférico de la superficie del macetero (radio "Cáscara", 5 mm por defecto), muestreado en una grilla cilíndrica de 1 mm; cada triángulo del macetero se subdivide para que las bandas lisas también queden exactas. La base (3 mm), el borde, la pestaña y las aletas se mantienen; las aletas y su recorte se cortan solo en la aleta, no en la cáscara.
- El offset es normal: en valles más angostos que 2 × cáscara la cáscara los puentea, por eso el espesor radial puede ser mayor que 5 en el fondo de un valle.
- Volumen S (tres tercios / total), coral: liso 224 / 309; cáscara 5 ≈ 231 / 318; 4 ≈ 195 / 281; 3 ≈ 160 / 245 cm³. Con cells la cáscara 5 ya ahorra (233 → 189).

## 06 / DESMOLDEO
- Sección propia con tabla por tercio: % de superficie en contrasalida (caras con ángulo < 0° frente a la salida), área trabada, profundidad máxima trabada y veredicto.
- Profundidad trabada: rayos paralelos a la salida de cada tercio (grilla ≤ 250 000 celdas); una cara que mira a la salida seguida de una que mira hacia atrás encierra molde detrás del hormigón; su largo es lo que el molde tendría que doblarse o romperse. ≤ 0.2 mm bien, 0.2–0.5 regular, > 0.5 malo (reglas prácticas, PLA/PETG contra mortero con desmoldante).
- Colores: profundidad trabada (por defecto), ángulo de cara o grupos por tercio.
- Resultados S por defecto: coral 14 % / 8 mm (malo), con hbump 4: 5 % / 5 mm (malo), cells 0 % / 0 mm (bien). Rayas verticales y suaves también traban (~10 % / 9–10 mm) cerca de las juntas.
