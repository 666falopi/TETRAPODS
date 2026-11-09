# GENERADOR DE MACETEROS MAESTRO

Herramienta estática: abrir mediante un servidor HTTP, no file://.

- Perfil de revolución VASEGEN con radios dtop/dbott, bandas y drenaje triple.
- Retranqueo independiente de hbump. Desplazamiento radial 0..hbump según gris.
- Dos chaflanes rectos en las raíces exteriores de la pared, con largo compartido sobre los segmentos adyacentes; filete circular tangente en la esquina exterior superior.
- El bump conserva toda su amplitud sobre la cara roja completa. Se une con los soportes de chaflán mediante máximo radial (unión de sólidos de sección radial), sin mezcla, suavizado ni atenuación del mapa. El soporte puede ocupar un valle en la intersección, pero no reduce ni mueve las crestas del bump.
- Se rechazan radios o chaflanes que no caben en las longitudes disponibles.
- Dos zonas de densidad; arcos con al menos ocho segmentos. La vista y el STL utilizan los mismos vértices y caras.
- JSON v3; se leen v1/v2 conservando las medidas de las operaciones por ubicación.

Los filetes mejoran la transición. Revisar los voladizos del STL en el laminador con la textura y los parámetros definitivos.
