Project Context: Nuke-Ready Color Wheel

GENEREAL COMMENTS

ALWAYS READ this file and update it at the end of each inference
DO NOT remove comments, add missing comments where needed. 


1. Project Overview

This is a lightweight, vanilla JavaScript web application designed primarily for Visual Effects (VFX) artists, specifically those using The Foundry's Nuke. It allows users to pick colors from a wheel and get values compatible with VFX pipelines (ACES AP1 color space).

2. Tech Stack & Architecture

Core: HTML5, CSS3, Vanilla JavaScript (ES6+).

No Frameworks: intentionally dependency-free. No React, Vue, or bundlers.
Static Application: Runs directly from file system (index.html). No local server required.

State Management: Simple in-memory variables (currentX, currentY, savedColors) and planned localStorage.

Rendering: HTML5 Canvas API for the color wheel.

PWA: Includes a Service Worker (sw.js) for offline capabilities.

3. Developer Goals

The user is a VFX artist moving into tech. The code should be clean, readable, and well-commented.

Priority: Accuracy of color math and utility for Nuke workflows.

Style: Dark mode UI, "professional tool" aesthetic.

4. Implementation Roadmap

The following 10 features have been approved for implementation.

Task 1: The 'Darkness' Slider (Value Control)

Context: The current wheel only shows HSV Value = 1. We need full range.

Instructions:

HTML: Add <input type="range" id="valueSlider" min="0" max="1" step="0.01" value="1">.

CSS: Style vertically beside the wheel.

JS: Update drawColorWheel and updateColor to use the slider value instead of hardcoded 1. Add event listeners to redraw on slide.

Task 2: Browser Memory (Local Storage)

Context: Data loss on refresh is annoying.

Instructions:

JS: Initialize savedColors from localStorage.

Update saveColor and clearSavedColors to sync with localStorage.

Call updateSavedColorsDisplay() on load.

Task 3: Paste as Nuke Node [COMPLETED]

Context: Copying raw numbers is slow. We want to paste actual Nodes.

Instructions:

JS: Modify #copyButton.

Construct string: set cut_paste_input [stack 0]; version 13.0; Constant { inputs 0 color {R G B 1} name ColorWheel_Pick selected true xpos 0 ypos 0 }

Inject current ACES RGB values.

Update button text to "Copy Nuke Node".

Task 4: ACES Output Transform Selector [COMPLETED]

Context: Pipelines vary (ACEScg vs Rec.709).

Instructions:

HTML: Add <select id="colorSpace"> (Options: ACES AP1, ACEScg, Linear sRGB, Rec.709).

JS: Implement transform matrices/math for these spaces.

Update display logic to respect the selected space.

Task 5: Reference Image Dropper [COMPLETED]

Context: Artists pick colors from concept art.

Instructions:

JS: Add drag-and-drop listeners to canvas.

On drop, render image to canvas.

Update updateColor to sample pixel data (ctx.getImageData) if an image is loaded, bypassing the math-based hue calculation.

Task 6: Color Harmonies [COMPLETED]

Context: Helper for lighting setups.

Instructions:

UI: Add #harmonies container.

JS: Calculate Complementary (+180°), Triadic (+120°/+240°) hues.

Render dynamic swatches below the main info.

Task 7: Comparison Swatch

Context: A/B testing colors.

Instructions:

CSS: Split #colorDisplay into #colorCurrent (active hover) and #colorPrevious (last clicked).

JS: Update logic to only change Current on hover, and update Previous on click.

Task 8: Keyboard Shortcuts

Context: VFX artists use hotkeys.

Instructions:

JS: Add keydown listener.

Map: C (Copy), S (Save), Up/Down (Brightness +/-).

Task 9: CSS Variable Export

Context: Web dev utility.

Instructions:

JS: Add "Export CSS" button.

Generate :root { --color-1: #hex; } block from savedColors.

Copy to clipboard.

Task 10: Compact Mode

Context: Screen real estate management.

Instructions:

CSS: Create .compact class hiding non-essentials (Header, Instructions, Saved List).

JS: Add toggle button to switch modes.

Task 11: Professional Visual Assets [COMPLETED]

Context: The project needs a slicker, more professional look.

Instructions:

Image Generation: Create a high-end `color_wheel.jpeg` and a minimalist `favicon.ico`.

Conversion: Use `sips` to convert generated PNGs to JPEG and ICO formats.

Integration: Ensure they are correctly placed in the root directory.

Task 12: Professional UI Overhaul [IN PROGRESS]

Context: High-end VFX aesthetic with glassmorphism and modern typography.

Instructions:
- Update index.html for better structure.
- Update styles.css with professional dark theme.
- Ensure all elements are accessible and functional.