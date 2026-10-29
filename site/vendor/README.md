# Browser libraries

| Library | Version | License | Source |
| --- | --- | --- | --- |
| Cytoscape.js | 3.34.4 | MIT | [npm](https://www.npmjs.com/package/cytoscape/v/3.34.4) |
| Papa Parse | 5.7.0 | MIT | [npm](https://www.npmjs.com/package/papaparse/v/5.7.0) |

These bundles are served from the same origin as the desk. Runtime loading
does not depend on a JavaScript CDN. Original license files are included.

`manifest.json` records each npm tarball's SHA-512 integrity and the bundled
file's SHA-256 hash. Downloads were checked against npm's integrity value.
The unit suite verifies the checked-in file hashes.

To update, choose an exact npm version, verify the downloaded tarball against
its registry integrity value, replace its distribution bundle and original
license, update the manifest and run both unit and browser checks. Browser
test tooling is managed separately by the pinned package lock and Dependabot.
