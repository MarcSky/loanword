# Loanword tree branding

These are the reusable brand assets for the tree direction. All PNGs have a
real alpha channel; do not add a white rectangle behind them.

| Asset | Use |
| --- | --- |
| `loanword-tree-mark.png` | Square blue tree mark, for compact UI placements and avatars. |
| `loanword-tree-lockup.png` | Blue mark with near-black wordmark, for light surfaces. |
| `loanword-tree-lockup-dark.png` | Blue mark with off-white wordmark, for dark surfaces. |

The trainer serves only `ui/`, so it reads copies: `ui/logo-lockup.png` and `ui/logo-lockup-dark.png` (the
sidebar head), `ui/logo-mark.png` (the collapsed rail) and `ui/favicon.png`, all
rendered from these files
by `docs/design/brand/render.sh`, which also renders the app icons, the avatars,
the `logo-mark-*.png` sizes beside this folder and the site's copies. The
plugin README consumes both lockups through a `<picture>` element. Use the dark lockup whenever the surrounding surface is
dark. Keep the mark at or above 16 px and the lockup at or above 96 px wide.
