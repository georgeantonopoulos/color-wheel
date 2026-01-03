# 3D LUT Implementation Plan

## 1. Overview
To achieve 1:1 parity with Nuke's ACES color picker, we will replace the current approximation formulas (Polynomials & Matrices) with an industry-standard **3D Lookup Table (LUT)** implementation. This approach ensures all non-linear ACES behaviors (Red Modifier, Global Desaturation, etc.) are accurately handled.

## 2. Architecture Changes

### New Files
1.  **`lut_utils.js`**: A dedicated, dependency-free JavaScript module for parsing `.cube` files and performing trilinear interpolation.
2.  **`inverse_srgb_to_aces.cube`**: The specific LUT file containing the bake of the `Output - sRGB (Inverse)` transform, enabling direct mapping from Display sRGB to ACEScg.

### Modified Files
-   **`index.html`**: Must load `lut_utils.js` before `script.js`.
-   **`script.js`**:
    -   Remove `nukeInverseODT` and manual Matrix math for ACES modes.
    -   Add async initialization to load the `.cube` file on startup.
    -   Update `updateColor` to query the LUT engine instead of running math formulas.

## 3. Workflow Logic

### A. Initialization
1.  App starts.
2.  `initColorSystem()` is called.
3.  App fetches `inverse_srgb_to_aces.cube`.
4.  `lut_utils.js` parses the text file into a flat `Float32Array` for performance.
5.  UI unlocks once LUT is ready (approx. 50-100ms).

### B. The Render Loop (`updateColor`)
1.  User picks a color (Display sRGB).
2.  RGB values (0-1) are passed to `LUT.sample(r, g, b)`.
3.  **Trilinear Interpolation**:
    -   Find the 8 nearest cube vertices surrounding the RGB point.
    -   Interpolate weights based on distance.
    -   Return precise ACEScg value.
4.  Result is displayed in the UI.

## 4. Performance & Optimization
-   **LUT Size**: We will target a **33x33x33** Cube (approx. 100KB - 300KB). This offers professional precision without the overhead of a 65^3 LUT.
-   **Interpolation**: The `sample` function will use optimized math (no specialized objects per pixel) to ensure dragging remains 60fps.

## 5. Source of Truth
-   **The LUT File**: We will not manually create this. We will use an official ACES OpenColorIO bake or a Nuke-generated `.cube` to ensure the data is indisputable.
-   **Fallback**: If the LUT fails to load, the system will fall back to the current Polynomial implementation to prevent app crash.

## 6. Execution Steps
1.  Create `lut_utils.js`.
2.  Acquire/Generate `inverse_srgb_to_aces.cube`.
3.  Refactor `script.js` to use the new engine.
4.  Verify against the specific "Red Discrepancy" (`#FF4038` -> `1.23, 0.20`).
