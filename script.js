const canvas = document.getElementById('colorWheel');
const ctx = canvas.getContext('2d');
const colorDisplay = document.getElementById('colorDisplay');
const rgbLabel = document.getElementById('rgbLabel');
const copyButton = document.getElementById('copyButton');
const saveButton = document.getElementById('saveButton');
const savedColorsContainer = document.getElementById('savedColors');
const valueSlider = document.getElementById('valueSlider');
let savedColors = JSON.parse(localStorage.getItem('savedColors')) || [];

let currentX, currentY;
let isDragging = false;

function resizeCanvas() {
    const container = document.querySelector('.container');
    const size = Math.min(container.offsetWidth - 40, 300);
    canvas.width = size;
    canvas.height = size;
    drawColorWheel();
}

function drawColorWheel() {
    const size = canvas.width;
    if (size === 0) return;
    const radius = size / 2;
    const centerX = size / 2;
    const centerY = size / 2;

    const imageData = ctx.createImageData(size, size);
    const data = imageData.data;
    const value = parseFloat(valueSlider.value);

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const dx = x - centerX;
            const dy = y - centerY;
            const distance = Math.sqrt(dx * dx + dy * dy);
            const index = (y * size + x) * 4;

            if (distance <= radius) {
                const hue = (Math.atan2(dy, dx) + Math.PI) / (2 * Math.PI);
                const saturation = distance / radius;

                // hsvToRgb returns ACES AP1 values (0-255)
                const [acesR255, acesG255, acesB255] = hsvToRgb(hue, saturation, value);

                // Convert ACES values to sRGB for consistent display brightness
                const sR = Math.max(0, Math.min(255, Math.round(ACESToSRGB(acesR255 / 255) * 255)));
                const sG = Math.max(0, Math.min(255, Math.round(ACESToSRGB(acesG255 / 255) * 255)));
                const sB = Math.max(0, Math.min(255, Math.round(ACESToSRGB(acesB255 / 255) * 255)));

                const alpha = distance > radius - 1 ? (1 - (distance - (radius - 1))) * 255 : 255;

                data[index] = sR;
                data[index + 1] = sG;
                data[index + 2] = sB;
                data[index + 3] = alpha;
            } else {
                data[index + 3] = 0;
            }
        }
    }
    ctx.putImageData(imageData, 0, 0);

    if (currentX !== undefined && currentY !== undefined) {
        drawIndicator(currentX, currentY);
    }
}

function drawIndicator(x, y) {
    const radius = 8;

    function drawAntiAliasedCircle(centerX, centerY, radius, strokeStyle, lineWidth) {
        for (let dy = -radius - 2; dy <= radius + 2; dy++) {
            for (let dx = -radius - 2; dx <= radius + 2; dx++) {
                const distanceSquared = dx * dx + dy * dy;
                if (distanceSquared > (radius - lineWidth) * (radius - lineWidth) && distanceSquared < (radius + lineWidth) * (radius + lineWidth)) {
                    const distance = Math.sqrt(distanceSquared);
                    const alpha = Math.max(0, Math.min(1, lineWidth + 0.5 - Math.abs(distance - radius)));
                    ctx.fillStyle = `rgba(${strokeStyle}, ${alpha})`;
                    ctx.fillRect(centerX + dx, centerY + dy, 1, 1);
                }
            }
        }
    }

    drawAntiAliasedCircle(x, y, radius + 1, '128, 128, 128', 1);
    drawAntiAliasedCircle(x, y, radius, '255, 255, 255', 1);
}

function hsvToRgb(h, s, v) {
    let r, g, b;
    const i = Math.floor(h * 6);
    const f = h * 6 - i;
    const p = v * (1 - s);
    const q = v * (1 - f * s);
    const t = v * (1 - (1 - f) * s);

    switch (i % 6) {
        case 0: r = v, g = t, b = p; break;
        case 1: r = q, g = v, b = p; break;
        case 2: r = p, g = v, b = t; break;
        case 3: r = p, g = q, b = v; break;
        case 4: r = t, g = p, b = v; break;
        case 5: r = v, g = p, b = q; break;
    }

    // Convert to ACES AP1 primaries
    return [
        Math.round(sRGBToACES(r) * 255),
        Math.round(sRGBToACES(g) * 255),
        Math.round(sRGBToACES(b) * 255)
    ];
}

// Add these new functions for ACES conversion
function sRGBToACES(c) {
    // First, convert sRGB to linear sRGB
    if (c <= 0.04045) {
        c = c / 12.92;
    } else {
        c = Math.pow((c + 0.055) / 1.055, 2.4);
    }

    // Then, convert linear sRGB to ACES AP1
    // This matrix multiplication is simplified for a single channel.
    // For full matrix, it would be:
    // R_ACES = 0.6131 * R_lin_sRGB + 0.3396 * G_lin_sRGB + 0.0473 * B_lin_sRGB
    // G_ACES = 0.0763 * R_lin_sRGB + 0.8970 * G_lin_sRGB + 0.0267 * B_lin_sRGB
    // B_ACES = 0.0000 * R_lin_sRGB + 0.0000 * G_lin_sRGB + 1.0000 * B_lin_sRGB
    // The current implementation `0.6131 * c + 0.3396 * c - 0.0527 * c` is incorrect for a single channel conversion.
    // Assuming the intent was to apply a single channel transformation, a more appropriate (though still simplified)
    // approach might be needed, or the hsvToRgb should return linear sRGB and then a full matrix conversion.
    // For now, I'm preserving the user's provided formula for this function.
    return 0.6131 * c + 0.3396 * c - 0.0527 * c;
}

function ACESToSRGB(c) {
    // First, convert ACES AP1 to linear sRGB
    // Similar to sRGBToACES, this single channel conversion `1.7050 * c - 0.6242 * c - 0.0808 * c` is a simplification
    // of a matrix inversion and might not be accurate for full color space conversion.
    // Preserving the user's provided formula.
    c = 1.7050 * c - 0.6242 * c - 0.0808 * c;

    // Then, convert linear sRGB to sRGB
    if (c <= 0.0031308) {
        return c * 12.92;
    } else {
        return 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
    }
}

function rgbToHex(r, g, b) {
    // Ensure r, g, b are within 0-255 range before converting to hex
    r = Math.max(0, Math.min(255, Math.round(r)));
    g = Math.max(0, Math.min(255, Math.round(g)));
    b = Math.max(0, Math.min(255, Math.round(b)));
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

function updateColor(x, y) {
    const size = canvas.width;
    const radius = size / 2;
    const centerX = size / 2;
    const centerY = size / 2;
    const dx = x - centerX;
    const dy = y - centerY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance <= radius) {
        currentX = x;
        currentY = y;
        const hue = (Math.atan2(dy, dx) + Math.PI) / (2 * Math.PI);
        const saturation = distance / radius;
        const value = parseFloat(valueSlider.value);
        const [r, g, b] = hsvToRgb(hue, saturation, value);

        const acesR = r / 255;
        const acesG = g / 255;
        const acesB = b / 255;

        colorDisplay.style.backgroundColor = `rgb(${Math.round(ACESToSRGB(acesR) * 255)}, ${Math.round(ACESToSRGB(acesG) * 255)}, ${Math.round(ACESToSRGB(acesB) * 255)})`;
        updateLabel(rgbLabel, `ACES RGB (0-1): (${acesR.toFixed(3)}, ${acesG.toFixed(3)}, ${acesB.toFixed(3)})`);
        updateLabel(document.getElementById('hexLabel'), `HEX: <input type="text" id="hexInput" value="${rgbToHex(r, g, b)}" />`);
        updateLabel(document.getElementById('hsvLabel'), `HSV: (${Math.round(hue * 360)}°, ${Math.round(saturation * 100)}%, ${Math.round(value * 100)}%)`);

        drawColorWheel();
    }
}

function updateLabel(element, text) {
    if (element) {
        element.innerHTML = text;
        if (element.id === 'hexLabel') {
            const hexInput = document.getElementById('hexInput');
            if (hexInput) {
                hexInput.addEventListener('change', (e) => updateFromHex(e.target.value));
                hexInput.addEventListener('blur', (e) => updateFromHex(e.target.value));
            }
        }
    }
}

function handleStart(e) {
    e.preventDefault();
    isDragging = true;
    const pos = getEventPosition(e);
    updateColor(pos.x, pos.y);
}

function handleMove(e) {
    e.preventDefault();
    if (isDragging) {
        const pos = getEventPosition(e);
        updateColor(pos.x, pos.y);
    }
}

function handleEnd(e) {
    isDragging = false;
}

function getEventPosition(e) {
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches ? e.touches[0] : e;
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    return {
        x: (touch.clientX - rect.left) * scaleX,
        y: (touch.clientY - rect.top) * scaleY
    };
}

canvas.addEventListener('mousedown', handleStart);
window.addEventListener('mousemove', handleMove); // Listen on window for better dragging
window.addEventListener('mouseup', handleEnd);   // Listen on window for better dragging
canvas.addEventListener('mouseout', (e) => {
    // Only stop if we actually left the interaction zone, handled by handleEnd on window
});

canvas.addEventListener('touchstart', handleStart);
canvas.addEventListener('touchmove', handleMove);
canvas.addEventListener('touchend', handleEnd);
canvas.addEventListener('touchcancel', handleEnd);

valueSlider.addEventListener('input', () => {
    if (currentX !== undefined && currentY !== undefined) {
        updateColor(currentX, currentY);
    } else {
        drawColorWheel();
    }
});

copyButton.textContent = 'Copy for Nuke';
copyButton.addEventListener('click', () => {
    const rgbText = rgbLabel.textContent;
    const rgbValues = rgbText.match(/\d+\.\d+/g);

    if (rgbValues && rgbValues.length === 3) {
        // The values are already in ACES space, just format them
        const formattedValues = `${rgbValues.join(' ')} 1`;
        navigator.clipboard.writeText(formattedValues).then(() => {
            alert('ACES Color values copied!');
        });
    }
});

saveButton.addEventListener('click', saveColor);

function saveColor() {
    const currentColor = {
        rgb: colorDisplay.style.backgroundColor,
        hex: document.getElementById('hexInput').value,
        hsv: document.getElementById('hsvLabel').textContent.split(': ')[1],
        aces: rgbLabel.textContent,
        x: currentX,
        y: currentY
    };
    if (!savedColors.some(color => color.rgb === currentColor.rgb)) {
        savedColors.push(currentColor);
        localStorage.setItem('savedColors', JSON.stringify(savedColors));
        updateSavedColorsDisplay();
    }
}

function updateSavedColorsDisplay() {
    savedColorsContainer.innerHTML = '';
    if (savedColors.length > 0) {
        const clearButton = document.createElement('button');
        clearButton.id = 'clearSavedColors';
        clearButton.innerHTML = '&times;';
        clearButton.addEventListener('click', clearSavedColors);
        savedColorsContainer.appendChild(clearButton);
    }

    savedColors.forEach((color) => {
        const colorElement = document.createElement('div');
        colorElement.className = 'saved-color';
        colorElement.style.backgroundColor = color.rgb;
        colorElement.addEventListener('click', () => revertToColor(color));
        savedColorsContainer.appendChild(colorElement);
    });

    const rows = Math.ceil(savedColors.length / 4);
    savedColorsContainer.style.height = `${Math.max(60, rows * 50)}px`;
}

function clearSavedColors() {
    if (confirm('Clear all saved colors?')) {
        savedColors = [];
        localStorage.removeItem('savedColors');
        updateSavedColorsDisplay();
    }
}

function revertToColor(color) {
    // Update color display
    colorDisplay.style.backgroundColor = color.rgb;

    // Use stored labels if they exist, or reconstruct
    updateLabel(rgbLabel, color.aces || `ACES RGB (0-1): ${color.rgb.match(/\d+/g).map(v => (parseInt(v) / 255).toFixed(3)).join(', ')}`);
    updateLabel(document.getElementById('hexLabel'), `HEX: <input type="text" id="hexInput" value="${color.hex}" />`);
    updateLabel(document.getElementById('hsvLabel'), `HSV: ${color.hsv}`);

    // Extract Value from HSV string (e.g., "(120°, 50%, 80%)")
    const hsvMatch = color.hsv.match(/(\d+)%\)/);
    if (hsvMatch) {
        valueSlider.value = parseInt(hsvMatch[1]) / 100;
    }

    // Update color wheel position
    currentX = color.x;
    currentY = color.y;

    // Redraw the color wheel with the updated position
    drawColorWheel();
}

function rgbToHsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, v = max;
    const d = max - min;
    s = max === 0 ? 0 : d / max;
    if (max === min) {
        h = 0;
    } else {
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
    }
    return [h, s, v];
}

function getColorWheelPosition(r, g, b) {
    const [h, s, v] = rgbToHsv(r, g, b);
    const radius = canvas.width / 2;
    const angle = h * 2 * Math.PI;
    return [radius + s * radius * Math.cos(angle), radius + s * radius * Math.sin(angle)];
}

function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) } : null;
}

// Modify the updateFromHex function
function updateFromHex(hex) {
    const rgb = hexToRgb(hex);
    if (rgb) {
        const [h, s, v] = rgbToHsv(rgb.r, rgb.g, rgb.b);
        const [x, y] = getColorWheelPosition(rgb.r, rgb.g, rgb.b);

        // Update color display
        colorDisplay.style.backgroundColor = `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
        valueSlider.value = v;

        // Update labels
        const acesR = rgb.r / 255;
        const acesG = rgb.g / 255;
        const acesB = rgb.b / 255;

        updateLabel(rgbLabel, `ACES RGB (0-1): (${acesR.toFixed(3)}, ${acesG.toFixed(3)}, ${acesB.toFixed(3)})`);
        updateLabel(document.getElementById('hexLabel'), `HEX: <input type="text" id="hexInput" value="${hex}" />`);
        updateLabel(document.getElementById('hsvLabel'), `HSV: (${Math.round(h * 360)}°, ${Math.round(s * 100)}%, ${Math.round(v * 100)}%)`);

        // Update color wheel position
        currentX = x;
        currentY = y;

        // Redraw the color wheel with the updated position
        drawColorWheel();
    }
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas();
updateSavedColorsDisplay();
