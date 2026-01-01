const canvas = document.getElementById('colorWheel');
const ctx = canvas.getContext('2d');
const colorDisplay = document.getElementById('colorDisplay');
const rgbLabel = document.getElementById('rgbLabel');
const copyButton = document.getElementById('copyButton');
const saveButton = document.getElementById('saveButton');
const savedColorsContainer = document.getElementById('savedColors');
const valueSlider = document.getElementById('valueSlider');
const colorSpaceSelect = document.getElementById('colorSpace');

const matrices = {
    aces_ap1: {
        toTarget: [
            [0.61311, 0.33955, 0.04734],
            [0.07015, 0.91635, 0.01350],
            [0.02059, 0.10957, 0.86984]
        ],
        toLinearSRGB: [
            [1.70505, -0.62423, -0.08082],
            [-0.12977, 1.13847, -0.00870],
            [-0.02425, -0.12461, 1.14886]
        ]
    },
    aces_cg: { // Same as AP1 primaries
        toTarget: [
            [0.61311, 0.33955, 0.04734],
            [0.07015, 0.91635, 0.01350],
            [0.02059, 0.10957, 0.86984]
        ],
        toLinearSRGB: [
            [1.70505, -0.62423, -0.08082],
            [-0.12977, 1.13847, -0.00870],
            [-0.02425, -0.12461, 1.14886]
        ]
    },
    linear_srgb: {
        toTarget: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
        toLinearSRGB: [[1, 0, 0], [0, 1, 0], [0, 0, 1]]
    },
    rec_709: {
        toTarget: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
        toLinearSRGB: [[1, 0, 0], [0, 1, 0], [0, 0, 1]]
    }
};

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

                // Treat HSV as values in the SELECTED space
                const [rTarget, gTarget, bTarget] = hsvToRgbLin(hue, saturation, value);

                // Convert TARGET space to linear sRGB for display
                const selectedSpace = colorSpaceSelect.value;
                const matrix = matrices[selectedSpace].toLinearSRGB;
                const [rLin, gLin, bLin] = applyMatrix([rTarget, gTarget, bTarget], matrix);

                // Convert linear sRGB to sRGB for consistent display brightness
                const sR = Math.max(0, Math.min(255, Math.round(linearToSRGB(rLin) * 255)));
                const sG = Math.max(0, Math.min(255, Math.round(linearToSRGB(gLin) * 255)));
                const sB = Math.max(0, Math.min(255, Math.round(linearToSRGB(bLin) * 255)));

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

function hsvToRgbLin(h, s, v) {
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

    // Return linear values (0-1)
    return [r, g, b];
}

function applyMatrix(color, matrix) {
    const [r, g, b] = color;
    return [
        r * matrix[0][0] + g * matrix[0][1] + b * matrix[0][2],
        r * matrix[1][0] + g * matrix[1][1] + b * matrix[1][2],
        r * matrix[2][0] + g * matrix[2][1] + b * matrix[2][2]
    ];
}

function sRGBToLinear(c) {
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function linearToSRGB(c) {
    return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

// Old conversion functions removed in favor of applyMatrix

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

        // Treat picked HSV as values in the TARGET color space
        const [outR, outG, outB] = hsvToRgbLin(hue, saturation, value);

        // Convert TARGET space to linear sRGB for monitor display
        const selectedSpace = colorSpaceSelect.value;
        const toLinMatrix = matrices[selectedSpace].toLinearSRGB;
        const [rLin, gLin, bLin] = applyMatrix([outR, outG, outB], toLinMatrix);

        // Display color is always sRGB-mapped for the monitor
        const sR = Math.max(0, Math.min(255, Math.round(linearToSRGB(rLin) * 255)));
        const sG = Math.max(0, Math.min(255, Math.round(linearToSRGB(gLin) * 255)));
        const sB = Math.max(0, Math.min(255, Math.round(linearToSRGB(bLin) * 255)));

        colorDisplay.style.backgroundColor = `rgb(${sR}, ${sG}, ${sB})`;

        const spaceLabel = colorSpaceSelect.options[colorSpaceSelect.selectedIndex].text;
        updateLabel(rgbLabel, `${spaceLabel} RGB (0-1): (${outR.toFixed(3)}, ${outG.toFixed(3)}, ${outB.toFixed(3)})`);
        updateLabel(document.getElementById('hexLabel'), `HEX: <input type="text" id="hexInput" value="${rgbToHex(sR, sG, sB)}" />`);
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
    if (isDragging) {
        e.preventDefault();
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

colorSpaceSelect.addEventListener('change', () => {
    drawColorWheel();
    if (currentX !== undefined && currentY !== undefined) {
        updateColor(currentX, currentY);
    }
});

valueSlider.addEventListener('input', () => {
    if (currentX !== undefined && currentY !== undefined) {
        updateColor(currentX, currentY);
    } else {
        drawColorWheel();
    }
});

copyButton.textContent = 'Copy Nuke Node';
copyButton.addEventListener('click', () => {
    const rgbText = rgbLabel.textContent;
    const rgbValues = rgbText.match(/\d+\.\d+/g);

    if (rgbValues && rgbValues.length === 3) {
        const [r, g, b] = rgbValues;
        const nukeNode = `set cut_paste_input [stack 0]; version 13.0; Constant { inputs 0 color {${r} ${g} ${b} 1} name ColorWheel_Pick selected true xpos 0 ypos 0 }`;

        navigator.clipboard.writeText(nukeNode).then(() => {
            alert('Nuke Constant node copied!');
        });
    }
});

saveButton.addEventListener('click', saveColor);

function saveColor() {
    const currentColor = {
        rgb: colorDisplay.style.backgroundColor,
        hex: document.getElementById('hexInput').value,
        hsv: document.getElementById('hsvLabel').textContent.split(': ')[1],
        rgbOutput: rgbLabel.textContent,
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
    updateLabel(rgbLabel, color.rgbOutput || color.aces || `RGB (0-1): ${color.rgb.match(/\d+/g).map(v => (parseInt(v) / 255).toFixed(3)).join(', ')}`);
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
        // HEX RGB is display sRGB. For output space, we need to convert sRGB -> Linear sRGB -> Target Space
        const linR = sRGBToLinear(rgb.r / 255);
        const linG = sRGBToLinear(rgb.g / 255);
        const linB = sRGBToLinear(rgb.b / 255);
        const linRgb = [linR, linG, linB];

        const selectedSpace = colorSpaceSelect.value;
        const toTargetMatrix = matrices[selectedSpace].toTarget;
        const transformedRgb = applyMatrix(linRgb, toTargetMatrix);
        const [outR, outG, outB] = transformedRgb;

        const spaceLabel = colorSpaceSelect.options[colorSpaceSelect.selectedIndex].text;
        updateLabel(rgbLabel, `${spaceLabel} RGB (0-1): (${outR.toFixed(3)}, ${outG.toFixed(3)}, ${outB.toFixed(3)})`);
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
