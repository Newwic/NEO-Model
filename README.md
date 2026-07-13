# NEO-Model

Minimal static animation page for the generated NEO model frames.

Live site:

```text
https://newwic.github.io/NEO-Model/
```

## Run

```powershell
cd C:\Users\newtv\.openclaw\workspace\model_viewer_site_20260709
python -m http.server 5177
```

Open:

```text
http://127.0.0.1:5177/
```

## Files

- `assets/frame-1.png` to `assets/frame-6.png` - animation frames.
- `index.html`, `styles.css`, `src/app.js` - fullscreen animation page.
- `assets/model.glb` and `assets/source.blend` - kept as source assets.

## Features

- No visible UI controls.
- Shows the first animation frame on load.
- Press `Spacebar` to play or pause the animation.

## Add your own files

Put files into `assets/` and update links as needed:

- `assets/frame-1.png`
- `assets/frame-2.png`
- `assets/frame-3.png`
- `assets/frame-4.png`
- `assets/frame-5.png`
- `assets/frame-6.png`

## GitHub Pages checklist

1. Push the latest changes to the `main` branch.
2. Make sure the repo name is `NEO-Model`.
3. In GitHub, open `Settings > Pages`.
4. Choose `Deploy from a branch`.
5. Select `main` and `/ (root)`.
6. Save and wait for the Pages URL.
7. Open `https://newwic.github.io/NEO-Model/` and hard refresh once.
