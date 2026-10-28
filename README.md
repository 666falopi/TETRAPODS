# Hard Matter / Sculpture Lab

One landing page for the complete collection of browser tools: clouds, waves, tetrapods and mould studies.

## Run the complete suite

Install Python 3, then run this command from the repository root:

```sh
python -m http.server 8000
```

On Windows you can also use `py -m http.server 8000`. On Linux use `python3 -m http.server 8000` if needed.

Open http://localhost:8000/ to see the dashboard. Keep the server running while using the apps. HTTP is required for browser modules, workers and model loading. No build step or package installation is needed. The pages use relative links so the collection can also be hosted together under one folder.

## Tools

| Folder | Tool |
| --- | --- |
| `/` | Hard Matter landing / dashboard |
| `cloud/` | Branch-guided cloud generator |
| `wave/` | Barrel wave and foam generator |
| `tetrapod-mould/` | Tetrapod cloud mould, editable planes and removal-order study |
| `two-piece/` | Upload an STL and examine a two-piece mould, draft statistics and study exports |
| `tetrapod-volume/` | Generic tetrapod calculator, height 2–25 cm with adjustable root and tip radii |
| `texture-generator/` | Seamless procedural textures with PNG and normal-map export |

The tetrapod volume tool counts the overlapping centre once and reports approximate solid volume. Mould tools are geometric prototypes; draft maps and sampled release checks do not certify that a mould can be manufactured and released.

## Implementation

Static HTML, CSS and JavaScript, with browser 3D rendering and workers for heavier calculations. Three.js is bundled with the tools that use it, with its licence notice in the source. The tetrapod mould folder includes its generated reference model. Uploaded personal STL files are not included in this repository.

This repository contains the current suite as a snapshot. Future edits to the separately hosted Sites apps are not automatically synced here.
