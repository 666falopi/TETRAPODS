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
