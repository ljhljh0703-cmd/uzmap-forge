# GitHub Pages test viewer

The published viewer contains the existing runtime and replacement graphics only.
Original maps, normalized installation profiles, private saves and dissection data
must never be committed or uploaded.

Build with Node 22.22.3: `node scripts/build-web.mjs`, then
`node scripts/package-pages.mjs`. The dedicated `.site` output must not already
exist. It contains the site artifact and a build identifier in deployment.json.

In the authenticated owner's `uzmap-forge` repository, select GitHub Actions as
the Pages source. Push to main or run Publish test viewer manually.
The workflow checks file intake and artifact boundaries before building and
uploads only .site, with Pages deployment permissions limited to the deploy job.

Public and non-loopback visitors first see a file picker. Choose your own
GemTower_Max_7C.w3x and 1.28.5.7680 unit-abilities.json; their exact SHA-256 values
must match web/source-input.js. Files are read in device memory and are never
uploaded. Reset reuses them until the page closes. Reopening the page requires
selecting them again. A link alone does not include original game content.

The existing loopback /web/ development flow remains automatic. To exercise the
public file-input flow locally, add ?seed=6&input=files. Private local sources
must not be added to the public artifact to avoid this step.

Saves remain in the same browser and origin. Localhost saves are not automatically
migrated to the published origin. Exported input logs still require exact build,
seed and source-version checks. Multiplayer and real-device validation are
separate work.
