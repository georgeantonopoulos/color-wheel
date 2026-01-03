# 3D LUT Implementation Plan

## 1. Overview

To achieve 1:1 parity with Nuke's ACES color picker, we will replace the current approximation formulas (Polynomials & Matrices) with an industry-standard **3D Lookup Table (LUT)** implementation. This approach ensures all non-linear ACES behaviors (Red Modifier, Global Desaturation, etc.) are accurately handled.

## 2. Architecture Changes

### New Files

1. **`lut_utils.js`**: A dedicated, dependency-free JavaScript module for:
   - Parsing `.cube` files (Resolve/Nuke format)
   - Storing LUT data in optimized `Float32Array`
   - Performing trilinear interpolation with edge clamping

2. **`luts/inverse_srgb_to_acescg.cube`**: The LUT file containing the bake of the `Output - sRGB (Inverse)` transform, mapping Display sRGB → ACEScg (linear AP1).

### Modified Files

- **`index.html`**: Load `lut_utils.js` before `script.js`.
- **`script.js`**:
  - Remove `nukeInverseODT()` function (replaced by LUT lookup).
  - Keep matrix math for non-ACES modes (Linear sRGB, Rec.709, Display sRGB).
  - Add async `initColorSystem()` to load LUT on startup.
  - Update `updateColor()` to route ACES modes through LUT engine.
- **`sw.js`**: Add `.cube` file to cache list for offline support.

## 3. Color Space Strategy

### Which Spaces Use the LUT?

| Color Space   | LUT Required? | Pipeline |
|---------------|---------------|----------|
| ACEScg        | Yes           | sRGB → LUT → ACEScg (linear) |
| ACEScct       | Yes           | sRGB → LUT → ACEScg → `linToACEScct()` |
| ACEScc        | Yes           | sRGB → LUT → ACEScg → `linToACEScc()` |
| Linear sRGB   | No            | sRGB → linearize (gamma removal) |
| Rec.709       | No            | sRGB → linearize → Rec.709 OETF |
| Display sRGB  | No            | Pass-through (already in display space) |

**Key insight**: We only need ONE LUT (sRGB → ACEScg). The log encodings (ACEScct/ACEScc) are applied *after* the LUT lookup using the existing `linToACEScct()` and `linToACEScc()` functions.

## 4. `.cube` File Format Specification

The `.cube` format is a simple text-based 3D LUT standard. `lut_utils.js` must correctly parse:

### Header Lines
```
TITLE "Inverse sRGB to ACEScg"
DOMAIN_MIN 0.0 0.0 0.0
DOMAIN_MAX 1.0 1.0 1.0
LUT_3D_SIZE 33
```

| Header | Required | Description |
|--------|----------|-------------|
| `TITLE` | No | Human-readable name (can be ignored) |
| `DOMAIN_MIN` | No | Input range minimum (default: 0 0 0) |
| `DOMAIN_MAX` | No | Input range maximum (default: 1 1 1) |
| `LUT_3D_SIZE` | **Yes** | Grid resolution (e.g., 33 means 33×33×33) |

### Data Lines
- Each line contains 3 space-separated floats: `R G B`
- Lines starting with `#` are comments (skip)
- Empty lines should be skipped
- Data ordering: **R varies fastest, then G, then B** (standard .cube order)

### Index Calculation
For a LUT of size `N`, the index for position `(r, g, b)` where each is an integer `0` to `N-1`:
```javascript
index = (b * N * N + g * N + r) * 3;  // multiply by 3 for RGB triplet offset
```

## 5. Trilinear Interpolation Algorithm

### Step 1: Normalize Input
```javascript
// Map input (0-1) to LUT grid coordinates
const size = lut.size;  // e.g., 33
const r_scaled = r * (size - 1);
const g_scaled = g * (size - 1);
const b_scaled = b * (size - 1);
```

### Step 2: Find Bounding Vertices
```javascript
// Lower corner indices (clamped to valid range)
const r0 = Math.floor(r_scaled);
const g0 = Math.floor(g_scaled);
const b0 = Math.floor(b_scaled);

// Upper corner indices (clamped)
const r1 = Math.min(r0 + 1, size - 1);
const g1 = Math.min(g0 + 1, size - 1);
const b1 = Math.min(b0 + 1, size - 1);

// Fractional distances for weighting
const dr = r_scaled - r0;
const dg = g_scaled - g0;
const db = b_scaled - b0;
```

### Step 3: Fetch 8 Corner Values
```javascript
// c000 = LUT[r0, g0, b0], c001 = LUT[r1, g0, b0], etc.
const c000 = getLutValue(r0, g0, b0);
const c001 = getLutValue(r1, g0, b0);
const c010 = getLutValue(r0, g1, b0);
const c011 = getLutValue(r1, g1, b0);
const c100 = getLutValue(r0, g0, b1);
const c101 = getLutValue(r1, g0, b1);
const c110 = getLutValue(r0, g1, b1);
const c111 = getLutValue(r1, g1, b1);
```

### Step 4: Interpolate
```javascript
// Interpolate along R axis
const c00 = lerp(c000, c001, dr);
const c01 = lerp(c010, c011, dr);
const c10 = lerp(c100, c101, dr);
const c11 = lerp(c110, c111, dr);

// Interpolate along G axis
const c0 = lerp(c00, c01, dg);
const c1 = lerp(c10, c11, dg);

// Interpolate along B axis (final result)
const result = lerp(c0, c1, db);
```

### Edge Cases & Clamping
- **Input < 0**: Clamp to 0 before scaling
- **Input > 1**: Clamp to 1 before scaling (or extend if DOMAIN_MAX > 1)
- **Exact grid points**: Interpolation still works (fractional = 0)

## 6. Workflow Logic

### A. Initialization Sequence

```
1. App starts, shows loading indicator on color wheel
2. initColorSystem() called
3. Fetch 'luts/inverse_srgb_to_acescg.cube'
4. Parse header → extract size, domain min/max
5. Parse data → store in Float32Array (size³ × 3 floats)
6. Set global lutReady = true
7. Hide loading indicator, enable UI
8. If fetch/parse fails → set lutFailed = true, log warning
```

### B. Color Update Pipeline (`updateColor`)

```
1. User picks color → get Display sRGB (0-255)
2. Normalize to 0-1 range
3. Check selected color space:

   IF (ACEScg | ACEScct | ACEScc):
       IF lutReady:
           acescg = LUT.sample(r, g, b)  // trilinear interpolation
       ELSE:
           acescg = nukeInverseODT(r, g, b)  // fallback to polynomial

       IF ACEScct: output = linToACEScct(acescg)
       IF ACEScc:  output = linToACEScc(acescg)
       IF ACEScg:  output = acescg

   ELSE IF Linear sRGB:
       output = srgbToLinear(r, g, b)

   ELSE IF Rec.709:
       linear = srgbToLinear(r, g, b)
       output = linToRec709(linear)

   ELSE IF Display sRGB:
       output = [r, g, b]  // pass-through

4. Format output to 4 decimal places
5. Update UI displays
```

## 7. Performance & Optimization

### LUT Size Tradeoffs

| Size | Total Values | File Size | Precision | Load Time |
|------|--------------|-----------|-----------|-----------|
| 17³  | 14,739       | ~50KB     | Good      | ~20ms     |
| 33³  | 107,811      | ~350KB    | Excellent | ~50ms     |
| 65³  | 823,875      | ~2.5MB    | Overkill  | ~200ms    |

**Recommendation**: 33×33×33 provides professional-grade precision with negligible load time.

### Interpolation Optimizations

1. **Flat array access**: Use `Float32Array` with direct index calculation (no nested arrays)
2. **Inline lerp**: Avoid function call overhead in hot path
3. **Pre-calculate constants**: `size - 1` computed once per LUT load
4. **No object allocation**: Return results via pre-allocated array or output parameters

### Memory Layout
```javascript
// Flat Float32Array: [R0,G0,B0, R1,G1,B1, R2,G2,B2, ...]
// Total bytes = size³ × 3 × 4 = 33³ × 12 ≈ 1.3MB in memory
```

## 8. LUT Generation

### Option A: OpenColorIO (Recommended)
```bash
# Requires OCIO installed with ACES config
ociobakelut \
  --inputspace "Output - sRGB" \
  --outputspace "ACES - ACEScg" \
  --format cube \
  --cubesize 33 \
  luts/inverse_srgb_to_acescg.cube
```

### Option B: Nuke Export
1. Create Vectorfield node
2. Set Input Space: `Output - sRGB`
3. Set Output Space: `ACES - ACEScg`
4. Set direction to Inverse
5. Export as `.cube` format with 33³ resolution

### Option C: Resolve Export
1. Open Color Management
2. Create custom LUT from ACES transforms
3. Export as .cube

## 9. Error Handling & Fallback

### Graceful Degradation
```javascript
let lutEngine = null;
let lutFailed = false;

async function initColorSystem() {
    try {
        const response = await fetch('luts/inverse_srgb_to_acescg.cube');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const text = await response.text();
        lutEngine = parseCubeLUT(text);
        console.log(`LUT loaded: ${lutEngine.size}³ grid`);
    } catch (err) {
        console.warn('LUT load failed, using polynomial fallback:', err);
        lutFailed = true;
        // App continues working with existing nukeInverseODT()
    }
}
```

### User Feedback
- If LUT fails to load, optionally show subtle indicator (e.g., "(approx)" next to ACES values)
- Never block the app or show error dialogs for LUT issues

## 10. Testing & Validation

### Test Cases

| Input (sRGB Hex) | Expected ACEScg | Notes |
|------------------|-----------------|-------|
| `#FF4038`        | ~1.23, 0.20, 0.15 | The "red discrepancy" test |
| `#FFFFFF`        | ~1.0, 1.0, 1.0  | White point |
| `#000000`        | 0.0, 0.0, 0.0   | Black point |
| `#808080`        | ~0.18, 0.18, 0.18 | Mid-gray (18% reflectance) |
| `#FF0000`        | High R, low G/B | Pure red stress test |
| `#00FF00`        | Low R, high G, low B | Pure green |
| `#0000FF`        | Low R/G, high B | Pure blue |

### Validation Method
1. Pick color in Nuke with ACES color management
2. Note the ACEScg values Nuke reports
3. Pick same hex color in this tool
4. Compare outputs (should match within ±0.001)

## 11. File Structure After Implementation

```
/
├── index.html
├── script.js           # Modified: uses LUT engine
├── lut_utils.js        # NEW: LUT parsing + interpolation
├── styles.css
├── sw.js               # Modified: caches .cube file
├── manifest.json
├── luts/
│   └── inverse_srgb_to_acescg.cube  # NEW: 33³ LUT file
├── favicon.ico
├── LICENSE
└── README.md
```

## 12. Execution Checklist

- [ ] **Step 1**: Create `lut_utils.js` with:
  - [ ] `parseCubeLUT(text)` - returns LUT object
  - [ ] `LUT.sample(r, g, b)` - trilinear interpolation
  - [ ] Proper header parsing (SIZE, DOMAIN_MIN/MAX)
  - [ ] Comment and empty line handling

- [ ] **Step 2**: Acquire LUT file
  - [ ] Generate via OCIO or Nuke
  - [ ] Verify file parses correctly
  - [ ] Place in `luts/` directory

- [ ] **Step 3**: Update `script.js`
  - [ ] Add `initColorSystem()` async loader
  - [ ] Route ACES modes through LUT
  - [ ] Keep `nukeInverseODT()` as fallback
  - [ ] Add loading state UI

- [ ] **Step 4**: Update `sw.js`
  - [ ] Add `luts/inverse_srgb_to_acescg.cube` to cache list

- [ ] **Step 5**: Update `index.html`
  - [ ] Add `<script src="lut_utils.js">` before script.js

- [ ] **Step 6**: Validate
  - [ ] Test `#FF4038` red discrepancy
  - [ ] Test white/black/gray points
  - [ ] Test all 6 color space modes
  - [ ] Test offline mode (service worker cache)
  - [ ] Test fallback (delete .cube, verify polynomial used)
  - [ ] Performance test: drag smoothness at 60fps
