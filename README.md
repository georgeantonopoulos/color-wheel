# Color Wheel for Nuke

A VFX color selection tool designed for accurate Nuke workflows. It provides real-time color picking with integrated ACES color space support (ACEScg, ACEScct, ACEScc) and OCIO-matched transforms.

## Features

- 🎯 **ACES LUT Engine**: Provides exact value matching for ACEScg, ACEScct, and Linear sRGB using official OCIO transforms.
- 📋 **Nuke Node Export**: Generates a standard `Constant` node string for the clipboard, including correctly formatted RGB values.
- 🖼️ **Pixel Sampling**: Support for drag-and-drop reference images to sample colors directly from external assets.
- 🖥️ **PiP Mode**: Native "Always on Top" functionality to keep the tool visible while working in other applications.
- 🧪 **Global EyeDropper**: Integrated screen picker (hotkey 'E') to sample colors from anywhere on your display.

## Color Accuracy

The application uses official ACES 1.2 OCIO LUT files to ensure parity with Nuke’s internal color management. The processing pipeline includes:

1.  **Inverse ODT**: Mapping Display sRGB (0-1) via a 65³ 3D LUT (`InvRRT.sRGB.Log2_48_nits_Shaper.spi3d`).
2.  **Shaper to Linear**: Mapping Log2 Shaper space to ACES2065-1 (AP0) via a 4096-entry 1D LUT.
3.  **Gamut Conversion**: AP0 to AP1 matrix transform.
4.  **Encoding**: Final mapping to ACEScg (linear), ACEScct, or ACEScc.

## Keyboard Shortcuts

| Key | Action |
| --- | --- |
| **P** | Toggle Pop-out (Picture-in-Picture) |
| **C** | Copy Nuke Constant Node |
| **S** | Save Color Swatch to Palette |
| **E** | Open EyeDropper (Screen Sample) |
| **Arrows** | Adjust VALUE (brightness) by ±0.05 |

## Running Locally

Because the tool fetches LUT files, it requires a local web server to run:

```bash
# Using Python
python3 -m http.server 8000

# Using Node.js
npx serve .
```

Then open `http://localhost:8000` in your browser.

## Tech Stack

- **Core**: Vanilla JavaScript (ES6+), HTML5, CSS3.
- **Rendering**: Canvas 2D API for the interactive wheel.
- **Accuracy**: Official ACES 1.2 OCIO LUTs.
- **Offline**: PWA support via Service Workers.

---
**Author:** George Antonopoulos  
**License:** Apache 2.0
