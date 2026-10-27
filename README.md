# Tetrapod Volume Studio

Interactive browser app for exploring a generic tetrapod and estimating its solid volume.

Live app: https://tetrapod-volume-studio.jerez-diseno.chatgpt.site/

## Run locally

Requires Python 3. From this folder run:

```sh
python -m http.server 8000
```

Open http://localhost:8000 in a browser. On Windows, `py -m http.server 8000` also works. Serve over HTTP so browser modules and workers load correctly.

## Controls

- Total height: 2–25 cm.
- Root and tip radii shared by all four arms.
- Drag to orbit; scroll to zoom.
- Live volume in cm³ and litres, plus bounding dimensions.

## Geometry and calculation

Four overlapping circular frustums follow tetrahedral axes. The union is uniformly scaled to the chosen vertical height. Analytic ray exits define its outer surface; a closed sampled mesh estimates volume, counting the overlapping centre once. A worker compares mesh refinements. This is a generic geometric study, not a standard industrial tetrapod. Volume is approximate and excludes casting waste, shrinkage and voids.

## Files

`index.html` and `style.css` provide the interface; `app.js` renders the model and handles controls; `geometry.js` defines the shape; worker files compute volume away from the interface. See `measurement.json` for reference measurements.

Plain HTML, CSS and JavaScript. No build step or package installation is required.
