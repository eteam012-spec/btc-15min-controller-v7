# BTC 15-Minute Controller — V7 Tablet + Electron

V7 keeps the V6 adaptive-learning engine and adds a tablet-first Windows delivery path.

## What changed
- Responsive/touch-friendly controller UI for Windows tablets.
- Larger touch targets and simplified navigation.
- Electron remains local-only; public Kalshi data adapter stays in the main process.
- No authenticated trading endpoint or order credentials.
- GitHub Actions workflow builds Windows x64 and Windows ARM64 packages, so Node.js does not need to be installed on the tablet.
- Electron Forge is used for Windows packaging.

## Recommended tablet setup
1. Push this repository to GitHub.
2. Open Actions → Build Windows Controller.
3. Run the workflow (or push to `main`).
4. Download the artifact matching the tablet architecture: `x64` for Intel/AMD Windows, `arm64` for Windows on ARM.
5. Extract/install and launch the controller.

## Important
The GitHub Pages site and the Electron desktop controller are different runtimes. The Pages version is useful for a touch-friendly dashboard, but Electron is the runtime that provides the local main-process security boundary and OS-backed secure storage used by the desktop controller.

This remains simulation/paper-only. Do not add live order placement until the strategy has been validated over a meaningful sample and the execution layer has independent risk controls.
