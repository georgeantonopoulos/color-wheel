/**
 * LUT Utilities for ACES Color Space Transforms
 * Parses Sony Pictures Imageworks .spi3d and .spi1d LUT formats
 * Used by OpenColorIO for official ACES transforms
 */

// ============================================================================
// SPI3D Parser (3D LUT)
// ============================================================================

/**
 * Parse a .spi3d file (Sony Pictures Imageworks 3D LUT format)
 * Format:
 *   SPILUT 1.0
 *   3 3
 *   {size} {size} {size}
 *   {r_idx} {g_idx} {b_idx} {R_out} {G_out} {B_out}
 *   ...
 *
 * @param {string} text - The raw .spi3d file content
 * @returns {Object} LUT object with size and data
 */
function parseSpi3d(text) {
    const lines = text.split('\n');
    let lineIndex = 0;

    // Line 1: Magic number "SPILUT 1.0"
    const magic = lines[lineIndex++].trim();
    if (magic !== 'SPILUT 1.0') {
        throw new Error(`Invalid spi3d magic number: ${magic}`);
    }

    // Line 2: "3 3" (dimensions indicator)
    const dims = lines[lineIndex++].trim();
    if (dims !== '3 3') {
        throw new Error(`Unexpected spi3d dimensions: ${dims}`);
    }

    // Line 3: "{size} {size} {size}"
    const sizeParts = lines[lineIndex++].trim().split(/\s+/).map(Number);
    if (sizeParts.length !== 3 || sizeParts[0] !== sizeParts[1] || sizeParts[1] !== sizeParts[2]) {
        throw new Error('Non-uniform LUT size is not supported');
    }
    const size = sizeParts[0];

    // Allocate flat Float32Array for LUT data
    // Layout: [R0,G0,B0, R1,G1,B1, ...]
    const totalEntries = size * size * size;
    const data = new Float32Array(totalEntries * 3);

    // Parse data lines
    // Each line: "r_idx g_idx b_idx R_out G_out B_out"
    let entriesRead = 0;
    while (lineIndex < lines.length && entriesRead < totalEntries) {
        const line = lines[lineIndex++].trim();

        // Skip empty lines and comments
        if (!line || line.startsWith('#')) continue;

        const parts = line.split(/\s+/);
        if (parts.length < 6) continue;

        const ri = parseInt(parts[0], 10);
        const gi = parseInt(parts[1], 10);
        const bi = parseInt(parts[2], 10);
        const R = parseFloat(parts[3]);
        const G = parseFloat(parts[4]);
        const B = parseFloat(parts[5]);

        // Calculate flat array index
        // Index order: R varies fastest, then G, then B
        const index = (bi * size * size + gi * size + ri) * 3;
        data[index] = R;
        data[index + 1] = G;
        data[index + 2] = B;

        entriesRead++;
    }

    if (entriesRead !== totalEntries) {
        console.warn(`Expected ${totalEntries} LUT entries, read ${entriesRead}`);
    }

    return {
        size,
        data,
        // Pre-compute for interpolation
        maxIndex: size - 1
    };
}

/**
 * Sample a 3D LUT using trilinear interpolation
 * @param {Object} lut - Parsed LUT object from parseSpi3d
 * @param {number} r - Red input (0-1)
 * @param {number} g - Green input (0-1)
 * @param {number} b - Blue input (0-1)
 * @returns {number[]} [R, G, B] output values
 */
function sampleLut3d(lut, r, g, b) {
    const { size, data, maxIndex } = lut;

    // Clamp inputs to [0, 1]
    r = Math.max(0, Math.min(1, r));
    g = Math.max(0, Math.min(1, g));
    b = Math.max(0, Math.min(1, b));

    // Scale to LUT coordinates
    const rScaled = r * maxIndex;
    const gScaled = g * maxIndex;
    const bScaled = b * maxIndex;

    // Find lower corner indices
    const r0 = Math.floor(rScaled);
    const g0 = Math.floor(gScaled);
    const b0 = Math.floor(bScaled);

    // Find upper corner indices (clamped)
    const r1 = Math.min(r0 + 1, maxIndex);
    const g1 = Math.min(g0 + 1, maxIndex);
    const b1 = Math.min(b0 + 1, maxIndex);

    // Fractional distances for interpolation weights
    const dr = rScaled - r0;
    const dg = gScaled - g0;
    const db = bScaled - b0;

    // Helper to get LUT value at (ri, gi, bi)
    const getValue = (ri, gi, bi) => {
        const idx = (bi * size * size + gi * size + ri) * 3;
        return [data[idx], data[idx + 1], data[idx + 2]];
    };

    // Fetch 8 corner values
    const c000 = getValue(r0, g0, b0);
    const c100 = getValue(r1, g0, b0);
    const c010 = getValue(r0, g1, b0);
    const c110 = getValue(r1, g1, b0);
    const c001 = getValue(r0, g0, b1);
    const c101 = getValue(r1, g0, b1);
    const c011 = getValue(r0, g1, b1);
    const c111 = getValue(r1, g1, b1);

    // Trilinear interpolation (per channel)
    const result = [0, 0, 0];
    for (let ch = 0; ch < 3; ch++) {
        // Interpolate along R axis
        const c00 = c000[ch] + dr * (c100[ch] - c000[ch]);
        const c01 = c010[ch] + dr * (c110[ch] - c010[ch]);
        const c10 = c001[ch] + dr * (c101[ch] - c001[ch]);
        const c11 = c011[ch] + dr * (c111[ch] - c011[ch]);

        // Interpolate along G axis
        const c0 = c00 + dg * (c01 - c00);
        const c1 = c10 + dg * (c11 - c10);

        // Interpolate along B axis (final result)
        result[ch] = c0 + db * (c1 - c0);
    }

    return result;
}


// ============================================================================
// SPI1D Parser (1D LUT)
// ============================================================================

/**
 * Parse a .spi1d file (Sony Pictures Imageworks 1D LUT format)
 * Format:
 *   Version 1
 *   From {min} {max}
 *   Length {size}
 *   Components {1|3}
 *   {
 *   {value}
 *   ...
 *   }
 *
 * @param {string} text - The raw .spi1d file content
 * @returns {Object} LUT object with domain, size, and data
 */
function parseSpi1d(text) {
    const lines = text.split('\n');
    let lineIndex = 0;

    let version = null;
    let min = 0, max = 1;
    let size = 0;
    let components = 1;
    let data = null;
    let inDataSection = false;
    let dataIndex = 0;

    while (lineIndex < lines.length) {
        const line = lines[lineIndex++].trim();

        // Skip empty lines and comments outside data section
        if (!line || line.startsWith('#')) {
            if (!inDataSection) continue;
            if (line.startsWith('#')) continue;
        }

        // Parse headers
        if (line.startsWith('Version')) {
            version = parseInt(line.split(/\s+/)[1], 10);
        } else if (line.startsWith('From')) {
            const parts = line.split(/\s+/);
            min = parseFloat(parts[1]);
            max = parseFloat(parts[2]);
        } else if (line.startsWith('Length')) {
            size = parseInt(line.split(/\s+/)[1], 10);
        } else if (line.startsWith('Components')) {
            components = parseInt(line.split(/\s+/)[1], 10);
        } else if (line === '{') {
            // Start of data section
            inDataSection = true;
            data = new Float32Array(size * components);
        } else if (line === '}') {
            // End of data section
            inDataSection = false;
        } else if (inDataSection && data) {
            // Parse data values
            const values = line.split(/\s+/).filter(v => v.length > 0).map(parseFloat);
            for (const v of values) {
                if (dataIndex < data.length) {
                    data[dataIndex++] = v;
                }
            }
        }
    }

    if (!data || dataIndex === 0) {
        throw new Error('Failed to parse spi1d data');
    }

    return {
        version,
        min,
        max,
        size,
        components,
        data
    };
}

/**
 * Sample a 1D LUT using linear interpolation
 * @param {Object} lut - Parsed LUT object from parseSpi1d
 * @param {number} value - Input value
 * @returns {number} Interpolated output value
 */
function sampleLut1d(lut, value) {
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

/**
 * Apply 1D LUT to RGB values (same curve per channel)
 * @param {Object} lut - Parsed LUT object from parseSpi1d
 * @param {number[]} rgb - [R, G, B] input values
 * @returns {number[]} [R, G, B] output values
 */
function applyLut1d(lut, rgb) {
    return [
        sampleLut1d(lut, rgb[0]),
        sampleLut1d(lut, rgb[1]),
        sampleLut1d(lut, rgb[2])
    ];
}


// ============================================================================
// Matrix Operations
// ============================================================================

/**
 * Apply a 3x3 matrix to RGB values
 * Matrix is stored as flat array in row-major order
 * @param {number[]} rgb - [R, G, B] input values
 * @param {number[]} matrix - 9-element flat matrix array
 * @returns {number[]} [R, G, B] output values
 */
function applyMatrix3x3(rgb, matrix) {
    return [
        matrix[0] * rgb[0] + matrix[1] * rgb[1] + matrix[2] * rgb[2],
        matrix[3] * rgb[0] + matrix[4] * rgb[1] + matrix[5] * rgb[2],
        matrix[6] * rgb[0] + matrix[7] * rgb[1] + matrix[8] * rgb[2]
    ];
}


// ============================================================================
// ACES Color System
// ============================================================================

// ACES2065-1 (AP0) to ACEScg (AP1) matrix from config.ocio
const AP0_TO_AP1 = [
     1.4514393161, -0.2365107469, -0.2149285693,
    -0.0765537734,  1.1762296998, -0.0996759264,
     0.0083161484, -0.0060324498,  0.9977163014
];

// Global LUT state
let lut3D = null;
let lut1D = null;
let lutReady = false;
let lutError = null;

/**
 * Initialize the color system by loading LUT files
 * @returns {Promise<boolean>} True if LUTs loaded successfully
 */
async function initColorSystem() {
    try {
        console.log('Loading ACES LUT files...');

        // Determine base path - works for both local file:// and http:// serving
        const basePath = window.location.href.substring(0, window.location.href.lastIndexOf('/') + 1);
        const spi3dUrl = basePath + 'luts/InvRRT.sRGB.Log2_48_nits_Shaper.spi3d';
        const spi1dUrl = basePath + 'luts/Log2_48_nits_Shaper_to_linear.spi1d';

        console.log('Fetching 3D LUT from:', spi3dUrl);
        console.log('Fetching 1D LUT from:', spi1dUrl);

        const [spi3dText, spi1dText] = await Promise.all([
            fetch(spi3dUrl).then(r => {
                if (!r.ok) throw new Error(`HTTP ${r.status} loading spi3d from ${spi3dUrl}`);
                return r.text();
            }),
            fetch(spi1dUrl).then(r => {
                if (!r.ok) throw new Error(`HTTP ${r.status} loading spi1d from ${spi1dUrl}`);
                return r.text();
            })
        ]);

        console.log('Parsing LUT files...');
        console.log('3D LUT size:', spi3dText.length, 'bytes');
        console.log('1D LUT size:', spi1dText.length, 'bytes');

        lut3D = parseSpi3d(spi3dText);
        lut1D = parseSpi1d(spi1dText);

        lutReady = true;
        console.log(`LUTs loaded successfully: 3D=${lut3D.size}³, 1D=${lut1D.size} entries`);

        return true;
    } catch (err) {
        lutError = err;
        lutReady = false;
        console.error('LUT load failed, using polynomial fallback:', err.message);
        console.error('Full error:', err);
        return false;
    }
}

/**
 * Check if LUT system is ready
 * @returns {boolean}
 */
function isLutReady() {
    return lutReady;
}

/**
 * Convert Display sRGB to ACEScg using the official ACES transform chain
 * Transform: sRGB → 3D LUT → 1D LUT → Matrix → ACEScg
 *
 * @param {number} r - Red (0-1, display sRGB)
 * @param {number} g - Green (0-1, display sRGB)
 * @param {number} b - Blue (0-1, display sRGB)
 * @returns {number[]} [R, G, B] in ACEScg (linear AP1)
 */
function srgbToAcescg(r, g, b) {
    if (!lutReady) {
        // Fallback: return null to signal caller should use polynomial
        return null;
    }

    // Step 1: 3D LUT (Display sRGB → Log2 shaper space)
    const logShaper = sampleLut3d(lut3D, r, g, b);

    // Step 2: 1D LUT (Log2 shaper → Linear ACES2065-1)
    const aces2065 = applyLut1d(lut1D, logShaper);

    // Step 3: Matrix (ACES2065-1 → ACEScg)
    const acescg = applyMatrix3x3(aces2065, AP0_TO_AP1);

    return acescg;
}

// Export for use in script.js
window.LutUtils = {
    initColorSystem,
    isLutReady,
    srgbToAcescg,
    parseSpi3d,
    parseSpi1d,
    sampleLut3d,
    sampleLut1d,
    applyLut1d,
    applyMatrix3x3,
    AP0_TO_AP1
};
