# Event Horizon

A Schwarzschild black hole, ray-traced in real time in the browser. Every pixel follows a photon backwards along a null geodesic of curved spacetime, so the shadow, the photon ring and the lensed arc of the accretion disk come straight out of the physics. None of them are painted in.

**Live:** https://qbickkk.github.io/event-horizon/

## What you see

- **Gravitational lensing.** Light bends around the hole. The far side of the disk shows up as an arc above and below the shadow, and stars behind the hole smear into an Einstein ring.
- **Shadow and photon ring.** Any ray with an impact parameter below 3√3⁄2 r<sub>s</sub> ≈ 2.6 r<sub>s</sub> is captured. Light that circles near the photon sphere (1.5 r<sub>s</sub>) forms a thin ring at the shadow's edge.
- **Accretion disk.**
  - It runs from the innermost stable circular orbit (3 r<sub>s</sub>) outward and follows the Novikov–Thorne flux profile.
  - Its colour is a blackbody at the local temperature.
  - The turbulence is sheared by Keplerian rotation.
- **Relativistic shifts.** Gas at the inner edge orbits at about 0.5 c. The approaching side is Doppler-boosted, brighter by g⁴ and bluer. The receding side dims and reddens, and gravitational redshift dims everything near the hole.
- **Time dilation readout.** It shows how much slower a static observer's clock runs at the camera's distance.

Presets:

| Preset | What it shows |
| --- | --- |
| As in nature | The full physics |
| Interstellar | Doppler effects switched off, as in the film |
| From the pole | The disk face-on, viewed along its rotation axis |
| Lens only | No disk, just lensing |

## Controls

| Action | Mouse / keyboard | Touch |
| --- | --- | --- |
| Orbit | Drag, or arrow keys | Drag |
| Distance | Scroll wheel, or <kbd>+</kbd> / <kbd>−</kbd> | Pinch |

The settings panel adjusts these parameters:

- disk temperature
- strength of the Doppler and redshift effects
- disk size
- exposure
- whether the disk is shown
- slow auto-orbit

## How it works

Units are chosen so that r<sub>s</sub> = 2GM/c² = 1. A photon's path in the Schwarzschild metric obeys

```
x'' = −(3/2) · h² · x / r⁵,   h = |x × x'|  (conserved)
```

This Newtonian-looking equation reproduces Schwarzschild null geodesics exactly. The fragment shader integrates it for every pixel with a step size that grows with radius.

A ray ends in one of three ways:

- it falls inside r = 1;
- it escapes past r = 50 and samples the procedural sky;
- it runs out of its step budget.

Each time a ray crosses the disk plane it picks up emission and loses transparency. The observed shift there is

```
g = D · √(1 − 1/r),   D = 1 / (γ (1 − β·n)),   β = √(1 / (2(r − 1)))
```

where β is the orbital speed and n is the direction to the camera. The disk's temperature scales with g and its intensity with g⁴.

Rendering runs in three stages:

1. The scene is drawn into a half-float target.
2. A three-level bloom chain (downsample plus separable Gaussian blur) adds glow.
3. A composite pass applies ACES tone mapping.

The render resolution adapts to keep the frame rate up.

## Development

Requires Node.js 22.12+ and a browser with WebGL 2.

```sh
npm install
npm run dev              # dev server with hot reload, including the .glsl files
npm run typecheck
npm run build            # single self-contained dist/index.html
npm run build:artifact   # also writes dist/artifact.html for publishing as a claude.ai Artifact
```

Every push to `main` builds the site and deploys it to GitHub Pages (`.github/workflows/deploy.yml`).

## Project layout

```
index.html                markup
src/main.ts               boot and frame loop
src/renderer.ts           WebGL 2 pipeline: scene → bloom → composite
src/gl.ts                 shader program and render target helpers
src/camera.ts             orbit camera and input
src/quality.ts            adaptive render resolution
src/ui.ts                 settings panel and readout
src/presets.ts            preset views and their explainers
src/shaders/*.glsl        ray tracer, downsample, blur, composite, fullscreen triangle
scripts/artifact.mjs      turns the build into a claude.ai Artifact page
```

No runtime dependencies. Vite, TypeScript and `vite-plugin-singlefile` are only used for building.
