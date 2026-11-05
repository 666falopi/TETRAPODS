# Tres familias: coral, anémona, fungi

## Coral — primera herramienta local
Referencia visual: colonia compacta con ramas redondeadas y cavidades superficiales. V1 crea una carcasa aproximadamente esférica con lóbulos bifurcados; no genera ramas libres con túneles entre ellas.

- Horiuchi et al. (2022), Artist-directed Modeling of Competitively Growing Corals. Texto completo de dos páginas consultado: https://mukai-lab.org/content/SA2022PosterPaperHoriuchi.pdf . Combina reglas de ramificación y colonización del espacio. La malla y los desplazamientos se producen fuera de su algoritmo. En V1 inspira la organización, pero NO se implementa su algoritmo de competencia.
- Merks et al. (2004), Polyp oriented modelling of coral growth. Resumen consultado: https://pubmed.ncbi.nlm.nih.gov/15178203/ . Pólipos, ramificación y compactación. No se reprodujo la simulación.
- A generalized numerical model for clonal growth in scleractinian coral colonies (2024): https://pmc.ncbi.nlm.nih.gov/articles/PMC11463216/ . Se consultaron extractos indexados; el acceso directo al texto completo quedó bloqueado. Candidato para una implementación posterior, no base implementada de V1.
- Kaandorp (2013), Macroscopic modelling of environmental influence on growth and form of sponges and corals using the accretive growth model: https://dare.uva.nl/id/0396bad2-3237-4fb3-b12e-529f3530e11a . Registro institucional y resumen consultados; no afirmar lectura completa.

## Anémona — pendiente
Aliaga y Larboulette (2009), Physically Based Animation of Sea Anemones in Real-Time: https://oa.upm.es/5789/2/INVE_MEM_2009_73302.pdf . PDF accesible; se consultaron descripción del modelo y campos de movimiento. Cilindros alrededor de esqueletos articulados, filotaxis y campos de flujo. Adaptación prevista: tentáculos con movimiento coordinado alrededor de un volumen redondo hueco.

## Fungi — pendiente
Investigación y generador no iniciados. Mantener una silueta circular/volumétrica; no reutilizar un cilindro largo como forma principal.

## Fabricación V1
Exterior e interior conectados por un borde inferior, abertura inferior y base del borde plana. Espesor radial constante salvo ajuste del borde. La estimación perpendicular usa la inclinación local de los triángulos: no es una medición global de mínima distancia entre superficies. Tamaño máximo en mm; STL rotado con Z vertical. La vista de corte no altera el archivo exportado.

Verificación: aristas con exactamente dos caras y orientación opuesta, triángulos no degenerados y volumen positivo en parámetros iniciales, ambos presets y un caso pequeño de pared gruesa. No se verificaron todos los parámetros posibles ni el comportamiento en laminador o impresión física. Requiere revisar soportes y paredes antes de fabricar.


## Revisión V2
La carcasa radial V1 se sustituyó por ramas libres: curvas cuadráticas muestreadas en cápsulas de radio variable, unidas en un campo implícito. La sustracción de otra red de tubos crea el interior hueco; la intersección con el plano inferior deja la base abierta. Se extrae la malla con marching tetrahedra. Espesor nominal tubular, no garantía de espesor constante en cruces. Coralitos pendientes: primero se valida la forma. El control de tamaño es escala nominal; las dimensiones reales aparecen en pantalla.


## Revisión V3 — núcleo achatado
El núcleo es una envolvente elipsoidal hueca con ancho y altura independientes. Las raíces de las ramas se distribuyen sobre su superficie superior; el largo de las ramas se mide desde esa zona. Se conserva la escala nominal y se muestran las dimensiones reales. El espesor del núcleo se obtiene reduciendo sus semiejes, por lo que no es un offset normal exacto.
