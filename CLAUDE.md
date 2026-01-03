# CLAUDE.md

## Project Overview

**Color Wheel for Nuke** - A professional VFX color wheel selector tool designed for Nuke workflows. Enables intuitive color picking with ACES color space support (ACEScct, ACEScg, ACEScc) and other professional color spaces.

**Author:** George Antonopoulos
**Repository:** https://github.com/georgeantonopoulos/color-wheel
**License:** Apache 2.0

## Tech Stack

- Vanilla JavaScript (ES6+), HTML5, CSS3
- Canvas API for color wheel rendering
- Official ACES OCIO LUTs for color transforms
- No build tools or package managers - pure client-side implementation
- PWA with Service Worker for offline support

## Project Structure

```
/
├── index.html          # Single-page application
├── script.js           # Main application logic (~1300 lines)
├── lut_utils.js        # LUT parsing and color transforms (~400 lines)
├── styles.css          # Styling (~770 lines)
├── sw.js               # Service Worker for PWA/caching
├── manifest.json       # PWA manifest
├── luts/
│   ├── InvRRT.sRGB.Log2_48_nits_Shaper.spi3d  # 65³ 3D LUT (~9.7MB)
│   └── Log2_48_nits_Shaper_to_linear.spi1d    # 4096-entry 1D LUT
├── favicon.ico         # Application icon
├── LICENSE             # Apache 2.0
└── README.md           # Project description
```

## Running the Project

Requires a local web server (for LUT file fetching). Examples:
```bash
python3 -m http.server 8000
# or
npx serve .
```
Then open `http://localhost:8000` in browser.

## Key Features

- Interactive HSV color wheel with real-time updates
- Multiple color space outputs: ACEScg, ACEScct, ACEScc, Linear sRGB, Rec.709, Display sRGB
- **Official ACES OCIO LUT-based transforms** for accurate Nuke color matching
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

## Color Processing Pipeline

### ACES Modes (ACEScg, ACEScct, ACEScc)

Uses official ACES 1.2 OCIO LUT files for accurate transforms:

```
Display sRGB (0-1)
    ↓ InvRRT.sRGB.Log2_48_nits_Shaper.spi3d (3D LUT, trilinear interpolation)
Log2 Shaper Space
    ↓ Log2_48_nits_Shaper_to_linear.spi1d (1D LUT, linear interpolation)
ACES2065-1 (AP0)
    ↓ Matrix (AP0 → AP1)
ACEScg (linear)
    ↓ Optional: linToACEScct() or linToACEScc()
ACEScct / ACEScc (log encoded)
```

### Non-ACES Modes (Linear sRGB, Rec.709, Display sRGB)

Uses direct matrix transforms without LUT processing.

## LUT System (lut_utils.js)

### File Formats

- **.spi3d** - Sony Pictures Imageworks 3D LUT (text-based)
  - Header: `SPILUT 1.0`, dimensions, size
  - Data: `r_idx g_idx b_idx R G B` per line

- **.spi1d** - Sony Pictures Imageworks 1D LUT (text-based)
  - Header: `Version 1`, `From min max`, `Length`, `Components`
  - Data: values enclosed in `{ }`

### Key Functions

- `parseSpi3d(text)` - Parse .spi3d format into Float32Array
- `parseSpi1d(text)` - Parse .spi1d format into Float32Array
- `sampleLut3d(lut, r, g, b)` - Trilinear interpolation
- `sampleLut1d(lut, value)` - Linear interpolation
- `srgbToAcescg(r, g, b)` - Complete transform chain
- `initColorSystem()` - Async LUT loader

### Fallback

If LUTs fail to load, falls back to polynomial approximation (`nukeInverseODT`).

## Code Conventions

- camelCase for variables/functions
- UPPERCASE for constants (matrices, AP0_TO_AP1)
- Element references cached at top of script.js
- Utility functions for color conversions grouped together
- Event handlers and UI updaters in separate sections

## Important Technical Notes

- Output format specifically designed for Nuke's color nodes
- LUT files sourced from official ACES 1.2 OCIO config
- Trilinear interpolation provides <0.05% accuracy vs Nuke
- Offscreen canvas used for clean image sampling (no UI overlays)
- LocalStorage key for saved colors: `savedColors`

## Browser Requirements

- ES6+ JavaScript support
- Canvas 2D API
- Fetch API (for LUT loading)
- CSS Grid/Flexbox
- Optional: EyeDropper API, Document Picture-in-Picture API

## LUT Source

LUT files from: https://github.com/colour-science/OpenColorIO-Configs/tree/master/aces_1.2/luts
