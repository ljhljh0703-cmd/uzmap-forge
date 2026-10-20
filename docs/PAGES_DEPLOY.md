# GitHub Pages test deployment

The public test URL is https://ljhljh0703-cmd.github.io/uzmap-forge/.

## Active scope

The user explicitly authorized inclusion of the two previously reviewed source
files for this public test by replying “포함해” to that exact scope question.
This is a narrow test-distribution exception; it does not alter canonical policy,
authorize other original files, or establish any third-party rights claim.

- GemTower_Max_7C.w3x: 2,043,936 bytes.
- Normalized1.28.5.7680 unit-abilities.json: 1,012,123 bytes.
- Combined: 3,056,059 bytes.

The two files are supplied as assets of release playtest-inputs-v1 and are not
committed to Git history. The full installation ZIP, other maps, source census,
private saves and Vault documents stay excluded.

## Hosted startup

UZMAP_HOSTED_INPUTS=enabled makes the workflow download the two named Release
assets into ignored fixtures paths, verify the exact SHA-256 pins and include them
in .site. The browser reads the same-origin source-inputs manifest and validates
the same pins before using the existing parser/session. A visitor can open the
shared URL directly without selecting files. Incorrect or missing inputs stop
the opted-in build before artifact upload.

If the variable is unset/disabled, no source download runs and the existing local
file picker remains. Loopback development still automatically uses its original
local fixture paths. ?input=files can exercise hosted startup locally.

## Build and release

Use Node22.22.3. Run focused boundary tests, node scripts/build-web.mjs, then
node scripts/package-pages.mjs --with-source-inputs for the explicitly enabled
source set. Without the flag, packaging remains original-free. The .site output
must not already exist; preserve an old output before rebuilding.

GitHub Pages source is GitHub Actions. main push or manual dispatch tests/builds
before uploading only .site. Pages/id-token write permissions are limited to the
deploy job. HTTPS is enabled.

## State boundaries

Existing input replay, source rules, fitted field and off-field centre culling are
unchanged by enabling hosted inputs. Saves stay browser/origin/build/seed/source
version specific. No automatic transfer from localhost, physical-device success,
multiplayer support or50-wave completion is implied by a successful deployment.
