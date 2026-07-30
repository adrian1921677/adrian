# Self-hosted fonts

`src/index.css` declares an `@font-face` for **Helvetica Neue Roman** and exposes it
through the `.font-helvetica-neue` class used on the hero section wrapper.

Helvetica Neue is a commercially licensed typeface, so the font files are not
included here. To activate it, drop your licensed webfont files into this folder:

```
public/fonts/HelveticaNeue-Roman.woff2
public/fonts/HelveticaNeue-Roman.woff
```

Filenames must match exactly — they are referenced from `src/index.css`.

Until those files exist the `@font-face` rule simply fails to resolve and the
declared fallback stack takes over (`Helvetica Neue` → `Helvetica` → `Inter` →
`Arial` → `sans-serif`), so the layout renders correctly either way.
