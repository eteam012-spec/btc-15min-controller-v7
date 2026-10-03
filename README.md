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


## Mobile phone companion
The repository now includes an installable mobile PWA in `/mobile/`.

### Phone setup
1. Enable GitHub Pages for the repository using the GitHub Actions deployment source.
2. Open the deployed `/mobile/` page on the iPhone.
3. In Safari, use **Share → Add to Home Screen**.
4. Open the installed app and tap **ENABLE PHONE ALERTS**.
5. For reliable background iPhone push, use the optional ntfy notification relay: install the ntfy iOS app, subscribe to a private/random topic, then enter the same topic in the mobile app and in the desktop controller's **Phone alert topic** field.

The mobile app monitors the active BTC 15-minute market, countdown, target, Kalshi direction, confidence/risk state, strategy signals, and alert thresholds. The desktop controller can relay window/reversal/risk alerts to the phone through ntfy.

Authenticated live order placement is intentionally not stored in the phone browser. The next architecture step is a secure server-side execution service so the phone can control live/paper mode without exposing Kalshi private keys.

For iPhone, installed web apps can receive background web push on iOS 16.4+; Safari requires the site to be added to the Home Screen. See the official ntfy documentation for its iOS/PWA notification behavior.
