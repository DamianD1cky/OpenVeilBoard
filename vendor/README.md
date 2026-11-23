# Third-party runtime source

This directory isolates the public runtime versions used by the reference site:

- GSAP 3.15.0: original upstream copyright and license comments remain in the files.
- Howler.js 2.2.4: MIT license comments remain in `howler/howler.js`.

Names and imports have been normalized, and code has been formatted for inspection. These files are third-party implementations; feature code belongs in `src/`.

The Howler adapter uses a module-relative `new URL()` so Vite emits the classic script with the correct build URL. It retains the library's expected global initialization behavior.
