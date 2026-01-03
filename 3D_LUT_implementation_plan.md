# 3D LUT Implementation Plan

## 1. Overview

To achieve 1:1 parity with Nuke's ACES color picker, we will replace the current approximation formulas (Polynomials & Matrices) with an industry-standard **3D Lookup Table (LUT)** implementation using the official ACES OpenColorIO configuration files directly.

This approach ensures all non-linear ACES behaviors (Red Modifier, Global Desaturation, etc.) are accurately handled using the same source data that Nuke and other professional applications use.

## 2. Architecture Changes

### New Files

1. **`lut_utils.js`**: A dedicated, dependency-free JavaScript module for:
   - Parsing `.spi3d` files (Sony Pictures Imageworks 3D LUT format)
   - Parsing `.spi1d` files (Sony Pictures Imageworks 1D LUT format)
   - Storing LUT data in optimized `Float32Array`
   - Performing trilinear interpolation (3D) and linear interpolation (1D)
   - Chaining transforms as defined by OCIO config

2. **`luts/`** directory containing official ACES 1.2 files:
   - `InvRRT.sRGB.Log2_48_nits_Shaper.spi3d` - Inverse RRT + ODT (sRGB → Log shaper)
   - `Log2_48_nits_Shaper_to_linear.spi1d` - Log shaper → Linear
   - `config.json` - Extracted transform chain and matrix from config.ocio

### Modified Files

- **`index.html`**: Load `lut_utils.js` before `script.js`
- **`script.js`**:
  - Remove `nukeInverseODT()` function (replaced by LUT chain)
  - Keep matrix math for non-ACES modes (Linear sRGB, Rec.709, Display sRGB)
  - Add async `initColorSystem()` to load LUT files on startup
  - Update `updateColor()` to route ACES modes through LUT engine
- **`sw.js`**: Add LUT files to cache list for offline support

## 3. Color Space Strategy

### Which Spaces Use the LUT?

| Color Space   | LUT Required? | Pipeline |
|---------------|---------------|----------|
| ACEScg        | Yes           | sRGB → 3D LUT → 1D LUT → Matrix → ACEScg |
| ACEScct       | Yes           | sRGB → 3D LUT → 1D LUT → Matrix → ACEScg → `linToACEScct()` |
| ACEScc        | Yes           | sRGB → 3D LUT → 1D LUT → Matrix → ACEScg → `linToACEScc()` |
| Linear sRGB   | No            | sRGB → linearize (gamma removal) |
| Rec.709       | No            | sRGB → linearize → Rec.709 OETF |
| Display sRGB  | No            | Pass-through (already in display space) |

### Complete Transform Chain (from config.ocio)

The "Output - sRGB" colorspace defines `to_reference` (inverse) as:

```
Display sRGB (0-1)
    ↓
InvRRT.sRGB.Log2_48_nits_Shaper.spi3d  (3D LUT, tetrahedral interpolation)
    ↓
Log2_48_nits_Shaper_to_linear.spi1d    (1D LUT, linear interpolation)
    ↓
ACES2065-1 (AP0, linear)
    ↓
Matrix: AP0 → AP1                       (ACES2065-1 → ACEScg)
    ↓
ACEScg (AP1, linear)
```

### Matrix: ACES2065-1 → ACEScg

From config.ocio, the ACEScg colorspace uses this matrix to convert from reference (ACES2065-1):

```javascript
const AP0_TO_AP1 = [
     1.4514393161, -0.2365107469, -0.2149285693,
    -0.0765537734,  1.1762296998, -0.0996759264,
     0.0083161484, -0.0060324498,  0.9977163014
];
```

## 4. File Format Specifications

### `.spi3d` Format (3D LUT)

Text-based format from Sony Pictures Imageworks.

**Structure:**
```
SPILUT 1.0
3 3
{size} {size} {size}
{r_idx} {g_idx} {b_idx} {R_out} {G_out} {B_out}
{r_idx} {g_idx} {b_idx} {R_out} {G_out} {B_out}
...
# Optional comments at end
```

| Line | Content | Example |
|------|---------|---------|
| 1 | Magic number | `SPILUT 1.0` |
| 2 | Dimensions (always "3 3") | `3 3` |
| 3 | Cube size (must be uniform) | `65 65 65` |
| 4+ | Index + RGB output values | `0 0 0 0.0 0.0 0.0` |

**Data ordering:** Indices are provided explicitly, so ordering in file doesn't matter. However, they're typically lexicographically sorted (R fastest, then G, then B).

**Parsing rules:**
- Lines starting with `#` are comments (skip)
- Each data line has 6 space-separated tokens: `ri gi bi R G B`
- All three dimensions must be equal (uniform cube)

### `.spi1d` Format (1D LUT)

Text-based format for 1D or 3×1D lookup tables.

**Structure:**
```
Version 1
From {min} {max}
Length {size}
Components {1|3}
{
{value}
{value}
...
}
# Optional comments at end
```

| Header | Required | Description |
|--------|----------|-------------|
| `Version` | Yes | Always `1` |
| `From` | Yes | Input domain range (e.g., `0 1` or `-0.125 1.125`) |
| `Length` | Yes | Number of entries in LUT |
| `Components` | Yes | `1` for mono, `3` for RGB |

**Data section:**
- Enclosed in curly braces `{ }`
- One value per line (for Components=1)
- Three values per line for Components=3

**Example (Log2_48_nits_Shaper_to_linear.spi1d):**
```
Version 1
From 0 1
Length 4096
Components 1
{
1.1857370846e-03
1.1892585317e-03
...
}
```

## 5. Interpolation Algorithms

### 5.1 Trilinear Interpolation (3D LUT)

For `.spi3d` files. The OCIO config specifies `tetrahedral` interpolation, but trilinear is a reasonable approximation for our use case.

```javascript
function sample3D(lut, r, g, b) {
    const size = lut.size;
    const maxIdx = size - 1;

    // Clamp inputs to [0, 1]
    r = Math.max(0, Math.min(1, r));
    g = Math.max(0, Math.min(1, g));
    b = Math.max(0, Math.min(1, b));

    // Scale to LUT coordinates
    const rScaled = r * maxIdx;
    const gScaled = g * maxIdx;
    const bScaled = b * maxIdx;

    // Find lower corner indices
    const r0 = Math.floor(rScaled);
    const g0 = Math.floor(gScaled);
    const b0 = Math.floor(bScaled);

    // Find upper corner indices (clamped)
    const r1 = Math.min(r0 + 1, maxIdx);
    const g1 = Math.min(g0 + 1, maxIdx);
    const b1 = Math.min(b0 + 1, maxIdx);

    // Fractional distances
    const dr = rScaled - r0;
    const dg = gScaled - g0;
    const db = bScaled - b0;

    // Fetch 8 corner values
    const c000 = lut.getValue(r0, g0, b0);
    const c001 = lut.getValue(r1, g0, b0);
    const c010 = lut.getValue(r0, g1, b0);
    const c011 = lut.getValue(r1, g1, b0);
    const c100 = lut.getValue(r0, g0, b1);
    const c101 = lut.getValue(r1, g0, b1);
    const c110 = lut.getValue(r0, g1, b1);
    const c111 = lut.getValue(r1, g1, b1);

    // Trilinear interpolation (per channel)
    const result = [0, 0, 0];
    for (let ch = 0; ch < 3; ch++) {
        const c00 = c000[ch] + dr * (c001[ch] - c000[ch]);
        const c01 = c010[ch] + dr * (c011[ch] - c010[ch]);
        const c10 = c100[ch] + dr * (c101[ch] - c100[ch]);
        const c11 = c110[ch] + dr * (c111[ch] - c110[ch]);

        const c0 = c00 + dg * (c01 - c00);
        const c1 = c10 + dg * (c11 - c10);

        result[ch] = c0 + db * (c1 - c0);
    }

    return result;
}
```

### 5.2 Linear Interpolation (1D LUT)

For `.spi1d` files. Applies same curve to all channels (Components=1).

```javascript
function sample1D(lut, value) {
    const { min, max, size, data } = lut;

    // Map input domain to [0, 1]
    const normalized = (value - min) / (max - min);

    // Clamp to valid range
    const clamped = Math.max(0, Math.min(1, normalized));

    // Scale to LUT index
    const scaled = clamped * (size - 1);
    const i0 = Math.floor(scaled);
    const i1 = Math.min(i0 + 1, size - 1);
    const frac = scaled - i0;

    // Linear interpolation
    return data[i0] + frac * (data[i1] - data[i0]);
}

// Apply 1D LUT to RGB (same curve per channel)
function apply1D(lut, rgb) {
    return [
        sample1D(lut, rgb[0]),
        sample1D(lut, rgb[1]),
        sample1D(lut, rgb[2])
    ];
}
```

### 5.3 Matrix Multiplication

```javascript
function applyMatrix(rgb, matrix) {
    return [
        matrix[0] * rgb[0] + matrix[1] * rgb[1] + matrix[2] * rgb[2],
        matrix[3] * rgb[0] + matrix[4] * rgb[1] + matrix[5] * rgb[2],
        matrix[6] * rgb[0] + matrix[7] * rgb[1] + matrix[8] * rgb[2]
    ];
}
```

## 6. Workflow Logic

### A. Initialization Sequence

```
1. App starts, shows loading indicator
2. initColorSystem() called
3. Fetch all LUT files in parallel:
   - luts/InvRRT.sRGB.Log2_48_nits_Shaper.spi3d
   - luts/Log2_48_nits_Shaper_to_linear.spi1d
4. Parse each file into optimized data structures
5. Store AP0→AP1 matrix (hardcoded from config.ocio)
6. Set global lutReady = true
7. Hide loading indicator, enable UI
8. If any fetch/parse fails → set lutFailed = true, use polynomial fallback
```

### B. Color Update Pipeline (`updateColor`)

```
1. User picks color → get Display sRGB (0-255)
2. Normalize to 0-1 range

3. Check selected color space:

   IF (ACEScg | ACEScct | ACEScc):
       IF lutReady:
           // Step 1: 3D LUT (sRGB → Log2 shaper space)
           logShaper = lut3D.sample(r, g, b)

           // Step 2: 1D LUT (Log2 shaper → Linear ACES2065-1)
           aces2065 = lut1D.apply(logShaper)

           // Step 3: Matrix (ACES2065-1 → ACEScg)
           acescg = applyMatrix(aces2065, AP0_TO_AP1)
       ELSE:
           acescg = nukeInverseODT(r, g, b)  // fallback

       IF ACEScct: output = linToACEScct(acescg)
       IF ACEScc:  output = linToACEScc(acescg)
       IF ACEScg:  output = acescg

   ELSE IF Linear sRGB:
       output = srgbToLinear(r, g, b)

   ELSE IF Rec.709:
       linear = srgbToLinear(r, g, b)
       output = linToRec709(linear)

   ELSE IF Display sRGB:
       output = [r, g, b]

4. Format output to 4 decimal places
5. Update UI displays
```

## 7. Source Files

### Required Files from ACES 1.2 Config

Download from: https://github.com/colour-science/OpenColorIO-Configs/tree/master/aces_1.2/luts

| File | Size | Purpose |
|------|------|---------|
| `InvRRT.sRGB.Log2_48_nits_Shaper.spi3d` | ~15MB | Inverse RRT+ODT 3D LUT (65³) |
| `Log2_48_nits_Shaper_to_linear.spi1d` | ~80KB | Log→Linear 1D LUT (4096 entries) |

### Hardcoded Matrix (from config.ocio)

The AP0→AP1 matrix is stable across ACES versions and can be hardcoded:

```javascript
// ACES2065-1 (AP0) to ACEScg (AP1) matrix
const AP0_TO_AP1 = [
     1.4514393161, -0.2365107469, -0.2149285693,
    -0.0765537734,  1.1762296998, -0.0996759264,
     0.0083161484, -0.0060324498,  0.9977163014
];
```

## 8. Performance Considerations

### File Sizes & Load Times

| File | Disk Size | Memory | Parse Time |
|------|-----------|--------|------------|
| `.spi3d` (65³) | ~15MB | ~3.3MB (Float32) | ~200-500ms |
| `.spi1d` (4096) | ~80KB | ~16KB (Float32) | ~10ms |

### Optimization Strategies

1. **Parallel fetch**: Load both files simultaneously
2. **Streaming parse**: Don't wait for full file, parse line-by-line
3. **Float32Array**: Direct typed array for LUT data
4. **Index lookup table**: Pre-compute (r,g,b) → array index mapping
5. **Inline interpolation**: Avoid function calls in hot path
6. **Smaller 3D LUT option**: Consider using 33³ instead of 65³ if precision is acceptable

### Alternative: Smaller LUT

If 65³ is too large, we could bake a smaller LUT:
```bash
ociobakelut --inputspace "Output - sRGB" --outputspace "ACES - ACEScg" \
  --format spi3d --cubesize 33 inverse_srgb_acescg_33.spi3d
```

## 9. Error Handling & Fallback

```javascript
let lut3D = null;
let lut1D = null;
let lutReady = false;

const AP0_TO_AP1 = [
    1.4514393161, -0.2365107469, -0.2149285693,
   -0.0765537734,  1.1762296998, -0.0996759264,
    0.0083161484, -0.0060324498,  0.9977163014
];

async function initColorSystem() {
    try {
        const [spi3dText, spi1dText] = await Promise.all([
            fetch('luts/InvRRT.sRGB.Log2_48_nits_Shaper.spi3d').then(r => r.text()),
            fetch('luts/Log2_48_nits_Shaper_to_linear.spi1d').then(r => r.text())
        ]);

        lut3D = parseSpi3d(spi3dText);
        lut1D = parseSpi1d(spi1dText);
        lutReady = true;

        console.log(`LUTs loaded: 3D=${lut3D.size}³, 1D=${lut1D.size} entries`);
    } catch (err) {
        console.warn('LUT load failed, using polynomial fallback:', err);
        // App continues with nukeInverseODT()
    }
}

function srgbToAcescg(r, g, b) {
    if (lutReady) {
        // Official OCIO transform chain
        const logShaper = lut3D.sample(r, g, b);
        const aces2065 = lut1D.apply(logShaper);
        return applyMatrix(aces2065, AP0_TO_AP1);
    } else {
        // Polynomial fallback
        return nukeInverseODT(r, g, b);
    }
}
```

## 10. Testing & Validation

### Test Cases

| Input (sRGB Hex) | Expected ACEScg | Notes |
|------------------|-----------------|-------|
| `#FF4038`        | ~1.23, 0.20, 0.15 | The "red discrepancy" test |
| `#FFFFFF`        | ~1.0, 1.0, 1.0  | White point |
| `#000000`        | 0.0, 0.0, 0.0   | Black point |
| `#808080`        | ~0.18, 0.18, 0.18 | Mid-gray |
| `#FF0000`        | High R, low G/B | Pure red |
| `#00FF00`        | Low R, high G, low B | Pure green |
| `#0000FF`        | Low R/G, high B | Pure blue |

### Validation Method

1. Use `ocioconvert` CLI to get ground truth:
   ```bash
   ocioconvert --inputspace "Output - sRGB" --outputspace "ACES - ACEScg" \
     --inputimage test.exr --outputimage result.exr
   ```
2. Compare our JavaScript output against the official OCIO result
3. Should match within ±0.0001

## 11. File Structure After Implementation

```
/
├── index.html
├── script.js               # Modified: uses LUT engine
├── lut_utils.js            # NEW: SPI parsing + interpolation
├── styles.css
├── sw.js                   # Modified: caches LUT files
├── manifest.json
├── luts/
│   ├── InvRRT.sRGB.Log2_48_nits_Shaper.spi3d    # 65³ 3D LUT (~15MB)
│   └── Log2_48_nits_Shaper_to_linear.spi1d      # 4096-entry 1D LUT
├── favicon.ico
├── LICENSE
└── README.md
```

## 12. Execution Checklist

- [ ] **Step 1**: Create `lut_utils.js` with:
  - [ ] `parseSpi3d(text)` - parse .spi3d format
  - [ ] `parseSpi1d(text)` - parse .spi1d format
  - [ ] `Lut3D.sample(r, g, b)` - trilinear interpolation
  - [ ] `Lut1D.apply(rgb)` - 1D LUT application
  - [ ] `applyMatrix(rgb, matrix)` - 3×3 matrix multiply
  - [ ] Comment handling for both formats

- [ ] **Step 2**: Download LUT files
  - [ ] Get `InvRRT.sRGB.Log2_48_nits_Shaper.spi3d` from ACES 1.2 config
  - [ ] Get `Log2_48_nits_Shaper_to_linear.spi1d` from ACES 1.2 config
  - [ ] Place in `luts/` directory
  - [ ] Verify files parse correctly

- [ ] **Step 3**: Update `script.js`
  - [ ] Add `initColorSystem()` async loader
  - [ ] Implement `srgbToAcescg()` using LUT chain
  - [ ] Keep `nukeInverseODT()` as fallback
  - [ ] Add loading state UI
  - [ ] Hardcode AP0→AP1 matrix

- [ ] **Step 4**: Update `sw.js`
  - [ ] Add both `.spi3d` and `.spi1d` files to cache list

- [ ] **Step 5**: Update `index.html`
  - [ ] Add `<script src="lut_utils.js">` before script.js

- [ ] **Step 6**: Validate
  - [ ] Test `#FF4038` red discrepancy
  - [ ] Test white/black/gray points
  - [ ] Test all 6 color space modes
  - [ ] Test offline mode (service worker cache)
  - [ ] Test fallback (delete LUT files, verify polynomial used)
  - [ ] Performance test: drag smoothness at 60fps
  - [ ] Compare against `ocioconvert` ground truth

## 13. References

- [ACES 1.2 OpenColorIO Config](https://github.com/colour-science/OpenColorIO-Configs/tree/master/aces_1.2)
- [OpenColorIO Issue #537 - SPI Format Spec Discussion](https://github.com/AcademySoftwareFoundation/OpenColorIO/issues/537)
- [Colour Library - SPI1D Parser](https://colour.readthedocs.io/en/develop/_modules/colour/io/luts/sony_spi1d.html)
- [Colour Library - SPI3D Parser](https://colour.readthedocs.io/en/develop/_modules/colour/io/luts/sony_spi3d.html)
