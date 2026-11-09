# GENERADOR DE MACETEROS MAESTRO

Herramienta estática: abrir mediante un servidor HTTP, no file://.

- Perfil de revolución VASEGEN con radios dtop/dbott, bandas y drenaje triple.
- Retranqueo independiente de hbump. Desplazamiento radial 0..hbump según gris.
- Filetes circulares tangentes en las dos raíces exteriores de la pared, con radio compartido; chaflán superior exterior a 45 grados.
- El radio corresponde al perfil base. En las uniones se atenúa el desplazamiento del mapa para enlazar con las bandas lisas; la superficie texturizada final puede alterar la curvatura local.
- Se rechazan radios o chaflanes que no caben en las longitudes disponibles.
- Dos zonas de densidad; arcos con al menos ocho segmentos. La vista y el STL utilizan los mismos vértices y caras.
- JSON v2; se leen proyectos v1 trasladando el antiguo hbump también al retranqueo.

Los filetes mejoran la transición. Revisar los voladizos del STL en el laminador con la textura y los parámetros definitivos.
