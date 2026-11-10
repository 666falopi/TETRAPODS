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
- Pared 6 mm inicial; pestaña exterior independiente 12 mm; solape 2.5 mm.
- Radio de vertido seleccionable 20/50/100 mm, validado contra la base.
- Tres alojamientos pasantes en núcleo para pasadores separados, holgura radial inicial 0.2 mm. No son roscas ni piezas impresas de drenaje.
- STL individual por pieza, separación visual y sección desde triángulos reales.
- Grupos y mapa de ángulo local frente a salidas radiales. No corrige textura ni certifica extracción sin colisiones; cierres pendientes.
- Limpiar cancela tareas y conserva parámetros; reconstruir recalcula. Cambios invalidan el molde y sus exportaciones.
- verify-mould.mjs: bordes con incidencia dos, cuatro componentes individuales, STL binario y solapamiento volumétrico <0.01 mm³ (tolerancia de conversión Float32), en tamaños para radios 20/50/100.
