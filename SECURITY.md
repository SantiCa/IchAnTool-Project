# Security policy

SedCoreTool runs locally: projects and images stay in the browser (IndexedDB) or on the computer (desktop program).
Network requests are made only for optional downloads (map backgrounds from Esri/GEBCO after consent, the DINOv2
vision model from Hugging Face, and libraries from jsDelivr/SheetJS when the bundled copies are missing).

## Supported versions
Only the latest delivery (`V0.<n>`, see [CHANGELOG.md](CHANGELOG.md)) receives fixes.

## Reporting a vulnerability
Please do **not** open a public issue. Use GitHub's private reporting (*Security → Report a vulnerability*) or write
to the maintainer (address in `desktop/package.json`). Include the version, the steps to reproduce and, if possible,
a file that triggers the problem. You will get an answer within two weeks.

Files from other people (projects, spreadsheets, images) are parsed in the browser; reports about crafted files that
crash the program or run code are especially welcome.

## Desktop scientific runtime

Desktop build preparation downloads the exact CPython archives from Astral's GitHub releases and wheels from
`files.pythonhosted.org` listed in `desktop/runtime-lock.json`. This is build-time network access, not an
installed-program download. Artifact byte lengths and SHA-256 hashes are checked before extraction/install;
pip uses only the verified local wheels, with dependency resolution and index access disabled. An offline
rebuild requires the complete verified cache. Training installation remains a separate optional operation
managed by `desktop/trainer.js`; its environment matrix is still tracked in roadmap M3.2.4.

The experimental desktop engine verifies its resource inventory and application-source hashes before spawning
the included interpreter. Runtime resources are application files, not a writable project environment. No
automatic runtime update, package installation, system-Python search or silent fallback occurs at launch.
Checksums detect corruption and mismatches relative to the application's trusted lock and manifest; they do
not replace installer signing or protect against an attacker who can replace the application and its lock.

Runtime updates require an explicit lock change: obtain hashes from the upstream release/PyPI metadata,
rebuild offline from verified artifacts, run native scientific/image and lifecycle checks, and validate the
packaged resources on each supported architecture. Record the tested versions and limitations in the technical
documentation and changelog. Keep the previous complete runtime until its replacement is verified; failed
staging does not merge into or overwrite that working directory.
