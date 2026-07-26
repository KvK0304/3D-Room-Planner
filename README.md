# Room Layout Planner

A 2D room layout planner in the browser. Lay out your home on a CAD-style drafting board — drag furniture into rooms, move whole rooms around an infinite canvas, save your layouts, and export a clean vector PDF floor plan.

Built with React, Vite and Tailwind CSS. No canvas libraries, no drag-and-drop libraries — just plain mouse events on absolutely-positioned elements.

---

## Features

### Layout gallery

- The app opens on a gallery of your saved layouts, each with a live SVG thumbnail, room and item counts, and last-modified date
- Open, delete, or export any saved layout straight from its card
- Layouts persist in browser local storage, so your work is there when you come back

### CAD-style workspace

- Pan the canvas by dragging empty space; zoom with the scroll wheel (anchored to the cursor) or the toolbar
- Zoom controls with a live percentage readout and reset-view
- A drafting dot-grid that pans and scales with the view

### Multiple rooms

- Add as many rooms as you like — each carries its own name, dimensions and furniture
- Drag a room by its title bar to reposition it anywhere on the workspace
- Adjust the active room's width and length from 4 to 40 ft with sliders or number inputs

### Furniture

- A full-household catalog grouped by area:
  - **Bedroom** — Queen Bed, Single Bed, Almirah, Wardrobe, Dresser, Nightstand, Study Table, Chair
  - **Living Room** — 3-Seat Sofa, Loveseat, Armchair, Coffee Table, TV Unit, Bookshelf
  - **Dining & Kitchen** — Dining Table, Dining Chair, Refrigerator, Kitchen Counter, Stove, Sink Cabinet
  - **Bathroom & Utility** — Bathtub, Toilet, Bath Sink, Washing Machine
- Add a custom item at any size
- Drag pieces around the floor — boundary containment keeps everything inside the walls
- Select a piece to resize it (width × length in feet), rotate it in 90° steps, or delete it
- Everything is drawn to scale at 1 ft = 40 px

### PDF export

- Download any layout as an A4-landscape vector PDF
- All rooms are auto-scaled and centered to fit the page, with labelled furniture blocks and a title block

---

## Getting started

```bash
git clone https://github.com/<your-username>/room-layout-planner.git
cd room-layout-planner
npm install
npm run dev
```

Then open the URL Vite prints (usually `http://localhost:5173`).

### Other commands

```bash
npm run build     # production build into dist/
npm run preview   # preview the production build locally
```

---

## Tech stack

| Piece | Choice |
| --- | --- |
| Framework | React 18 |
| Build tool | Vite 5 |
| Styling | Tailwind CSS 4 |
| Icons | lucide-react |
| PDF | jsPDF, loaded on demand from a CDN |

---

## How it works

**Coordinates.** Everything is stored in feet and rendered at `PX_PER_FT = 40`. Rooms hold an `x`/`y` position in world space; furniture holds an `x`/`y` relative to its room's floor.

**Rotation.** Items store a `rotation` of 0/90/180/270. A `footprint()` helper swaps width and height at 90° and 270°, and that footprint drives both rendering and boundary checks.

**Dragging.** A single `drag` ref tracks one of three modes — `pan`, `room`, or `item` — and window-level `mousemove`/`mouseup` listeners handle the movement. Screen-space deltas are divided by the current zoom so dragging feels 1:1 at any zoom level.

**Containment.** On every move, an item's position is clamped to `[0, roomSize − itemFootprint]`, so furniture can never cross a wall. Rotating or resizing re-clamps as well.

**Persistence.** Saved layouts are serialized to `localStorage` under `room-planner-layouts-v1`, wrapped in try/catch so the app degrades to session-only storage if storage is unavailable.

---

## Project structure

```
├── .github/workflows/deploy.yml   # GitHub Pages CI
├── index.html
├── vite.config.js
├── src
│   ├── main.jsx                   # React entry point
│   ├── index.css                  # Tailwind import + base styles
│   └── RoomLayoutPlanner.jsx      # the whole app (gallery + editor)
└── package.json
```

---

## Deployment

A GitHub Actions workflow builds and publishes to GitHub Pages on every push to `main`.

To turn it on: go to **Settings → Pages** in your repository and set **Source** to **GitHub Actions**. The next push to `main` will publish your site, and the workflow run will show the live URL.

The Vite `base` is set to `"./"`, so the build works on a project site (`username.github.io/<repo>/`) without further configuration.

---

## Notes

- PDF export fetches jsPDF from a CDN the first time you use it, so it needs an internet connection.
- Local-storage persistence works in normal browsers. Some sandboxed preview environments disable storage, in which case saves last only for the current session.
- The planner is built for mouse input; touch support is not implemented yet.

---

## License

[MIT](LICENSE)
