# NEO-Model

Static Three.js viewer for the GLB model uploaded on 2026-07-09.

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

- `assets/model.glb` - model shown on the page.
- `assets/source.blend` - original Blender source file from the upload.
- `index.html`, `styles.css`, `src/app.js` - viewer page.

## Features

- `3D` view for GLB preview.
- `Animation` view for 4-6 frame image sequences.
- Spacebar toggles animation playback with the included demo frames.
- `Assets` view for quick links and future uploads.
- Mobile drawer for settings and media panels.
- Drag and drop GLB or image files directly onto the page.

## Mobile

- The model opens full-screen first.
- Tap the sliders icon to open settings.
- Add `#settings` to the URL to open the settings drawer directly.

## Add your own files

Put files into `assets/` and update links as needed:

- `assets/model.glb`
- `assets/source.blend`
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
