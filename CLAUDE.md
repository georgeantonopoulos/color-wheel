# CLAUDE.md

## Project Overview

**Color Wheel for Nuke** - A professional VFX color wheel selector tool designed for Nuke workflows. Enables intuitive color picking with ACES color space support (ACEScct, ACEScg, ACEScc) and other professional color spaces.

**Author:** George Antonopoulos
**Repository:** https://github.com/georgeantonopoulos/color-wheel
**License:** Apache 2.0

## Tech Stack

- Vanilla JavaScript (ES6+), HTML5, CSS3
- Canvas API for color wheel rendering
- No build tools or package managers - pure client-side implementation
- PWA with Service Worker for offline support

## Project Structure

```
/
├── index.html          # Single-page application
├── script.js           # Main application logic (~1200 lines)
├── styles.css          # Styling (~770 lines)
├── sw.js               # Service Worker for PWA/caching
├── manifest.json       # PWA manifest
├── favicon.ico         # Application icon
├── LICENSE             # Apache 2.0
└── README.md           # Project description
```

## Running the Project

No build process required. Open `index.html` in a browser or deploy static files to any web server.

## Key Features

- Interactive HSV color wheel with real-time updates
- Multiple color space outputs: ACEScg, ACEScct, ACEScc, Linear sRGB, Rec.709, Display sRGB
- Copy colors in Nuke-compatible node format
- Image drag-and-drop for color sampling
- Color harmonies (Complementary, Triadic)
- Saved color palette (localStorage persistence)
- EyeDropper API integration
- Picture-in-Picture mode

## Keyboard Shortcuts

- **P** - Toggle Picture-in-Picture mode
- **C** - Copy Nuke node
- **S** - Save color swatch
- **E** - Open EyeDropper
- **Arrow Up/Down** - Adjust VALUE by 0.05

## Code Conventions

- camelCase for variables/functions
- UPPERCASE for constants (matrices object)
- Element references cached at top of script.js
- Utility functions for color conversions grouped together
- Event handlers and UI updaters in separate sections

## Color Processing Pipeline

1. User input → Display RGB (0-255)
2. Apply sRGB gamma → Linear values (0-1)
3. Reverse ACES ODT if ACES selected
4. Apply color space transformation matrix
5. Apply encoding (log for ACEScct/ACEScc, OETF for Rec.709)
6. Output formatted for Nuke (4 decimal precision)

## Important Technical Notes

- Output format specifically designed for Nuke's color nodes (0-4 range)
- Transformation matrices defined in `matrices` object in script.js
- Offscreen canvas used for clean image sampling (no UI overlays)
- LocalStorage key for saved colors: `savedColors`

## Browser Requirements

- ES6+ JavaScript support
- Canvas 2D API
- CSS Grid/Flexbox
- Optional: EyeDropper API, Document Picture-in-Picture API
