const canvas = document.getElementById('colorWheel');
const ctx = canvas.getContext('2d');
const colorDisplay = document.getElementById('colorDisplay');
const rgbLabel = document.getElementById('rgbLabel');
const hexLabel = document.getElementById('hexLabel');
const hsvLabel = document.getElementById('hsvLabel');
const copyButton = document.getElementById('copyButton');
const saveButton = document.getElementById('saveButton');
const savedColorsContainer = document.getElementById('savedColors');
const valueSlider = document.getElementById('valueSlider');
const colorSpaceSelect = document.getElementById('colorSpace');
const resetWheelButton = document.getElementById('resetWheel');
const dropHint = document.getElementById('dropHint');
const clearButtonContainer = document.getElementById('clearButtonContainer');
const harmoniesContainer = document.getElementById('harmonies');
const trashZone = document.getElementById('trashZone');
const mainContainer = document.getElementById('mainContainer');
const pipToggle = document.getElementById('pipToggle');
const eyeDropperBtn = document.getElementById('eyeDropperBtn');

// Check for EyeDropper API support
if ('EyeDropper' in window) {
    eyeDropperBtn.classList.add('supported');
}

// Check for Document Picture-in-Picture API support
if ('documentPictureInPicture' in window) {
    pipToggle.classList.add('supported');
}

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
let currentHue, currentSaturation;
let isDragging = false;
let isImageLoaded = false;
let loadedImage = null;

// Offscreen canvas for clean sampling (no indicators)
const offscreenCanvas = document.createElement('canvas');
const offscreenCtx = offscreenCanvas.getContext('2d', { willReadFrequently: true });

function resizeCanvas() {
    const container = document.getElementById('mainContainer');
    if (!container) return;

    // Check if we are in PiP mode (pipWindow is defined globally)
    const isPip = typeof pipWindow !== 'undefined' && pipWindow !== null;

    let maxSize, padding, widthSource;

    if (isPip) {
        maxSize = 250;
        padding = 40;
        widthSource = pipWindow.innerWidth;
    } else {
        maxSize = 300;
        padding = 80;
        widthSource = container.offsetWidth;
    }

    const size = Math.min(widthSource - padding, maxSize);
    canvas.width = size;
    canvas.height = size;

    offscreenCanvas.width = size;
    offscreenCanvas.height = size;

    drawColorWheel();
}

function drawColorWheel() {
    const size = canvas.width;
    if (size === 0) return;
    const centerX = size / 2;
    const centerY = size / 2;

    if (isImageLoaded && loadedImage) {
        resetWheelButton.style.display = 'block';
        ctx.clearRect(0, 0, size, size);
        offscreenCtx.clearRect(0, 0, size, size);

        const imgWidth = loadedImage.width;
        const imgHeight = loadedImage.height;
        const ratio = Math.min(size / imgWidth, size / imgHeight);
        const newWidth = imgWidth * ratio;
        const newHeight = imgHeight * ratio;
        const xOffset = (size - newWidth) / 2;
        const yOffset = (size - newHeight) / 2;

        ctx.drawImage(loadedImage, xOffset, yOffset, newWidth, newHeight);
        offscreenCtx.drawImage(loadedImage, xOffset, yOffset, newWidth, newHeight);
    } else {
        const radius = size / 2;
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
        resetWheelButton.style.display = 'none';
    }

    if (currentX !== undefined && currentY !== undefined) {
        drawAllIndicators();
    }
}

function drawAllIndicators() {
    const size = canvas.width;
    const centerX = size / 2;
    const centerY = size / 2;
    const wheelRadius = size / 2;

    const harmonies = [
        (currentHue + 0.5) % 1,
        (currentHue + 0.333) % 1,
        (currentHue + 0.666) % 1
    ];

    // Helper to get coordinates from H/S
    const getCoords = (h, s) => {
        const angle = h * 2 * Math.PI - Math.PI;
        return {
            x: centerX + s * wheelRadius * Math.cos(angle),
            y: centerY + s * wheelRadius * Math.sin(angle)
        };
    };

    const primaryPos = { x: currentX, y: currentY };
    const harmonyPositions = harmonies.map(h => getCoords(h, currentSaturation));

    const v = parseFloat(valueSlider.value);
    // Dynamic contrast: Use black lines on light colors, white lines on dark colors.
    // We increase opacity for darker wheels to ensure the lines pop.
    const lineAlpha = v > 0.6 ? 0.4 : 0.7;
    const lineColor = v > 0.6 ? `rgba(0, 0, 0, ${lineAlpha})` : `rgba(255, 255, 255, ${lineAlpha})`;
    const subLineColor = v > 0.6 ? `rgba(0, 0, 0, ${lineAlpha * 0.4})` : `rgba(255, 255, 255, ${lineAlpha * 0.4})`;

    // 1. Draw Harmony Lines (Technical Guides)
    ctx.setLineDash([4, 4]);

    harmonyPositions.forEach(pos => {
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.lineTo(pos.x, pos.y);
        ctx.strokeStyle = lineColor;
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(primaryPos.x, primaryPos.y);
        ctx.lineTo(pos.x, pos.y);
        ctx.strokeStyle = subLineColor;
        ctx.lineWidth = 0.8;
        ctx.stroke();
    });

    // Dash from center to primary
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(primaryPos.x, primaryPos.y);
    ctx.strokeStyle = lineColor;
    ctx.stroke();
    ctx.setLineDash([]);

    // 2. Draw Harmony Indicators (Faint)
    harmonyPositions.forEach(pos => {
        drawIndicator(pos.x, pos.y, 4, false);
    });

    // 3. Draw Primary Indicator (The "Magnifier")
    drawIndicator(primaryPos.x, primaryPos.y, 8, true);
}

function drawIndicator(x, y, radius, isPrimary) {
    ctx.save();

    if (isPrimary) {
        // High-end Magnifier Look
        ctx.shadowBlur = 10;
        ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';

        ctx.beginPath();
        ctx.arc(x, y, radius + 2, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.lineWidth = 3;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Inner hair cross
        ctx.beginPath();
        ctx.moveTo(x - 3, y);
        ctx.lineTo(x + 3, y);
        ctx.moveTo(x, y - 3);
        ctx.lineTo(x, y + 3);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.lineWidth = 1;
        ctx.stroke();
    } else {
        // Subtle Harmony Dot
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(x, y, radius - 1, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)';
        ctx.lineWidth = 1;
        ctx.stroke();
    }

    ctx.restore();
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
    let outR, outG, outB, hue, saturation, value, sR, sG, sB;

    if (isImageLoaded) {
        // Sample from offscreen canvas for a "clean" pixel pick (no indicators)
        const pixelData = offscreenCtx.getImageData(x, y, 1, 1).data;
        sR = pixelData[0];
        sG = pixelData[1];
        sB = pixelData[2];

        const linR = sRGBToLinear(sR / 255);
        const linG = sRGBToLinear(sG / 255);
        const linB = sRGBToLinear(sB / 255);

        const selectedSpace = colorSpaceSelect.value;
        const toTargetMatrix = matrices[selectedSpace].toTarget;
        [outR, outG, outB] = applyMatrix([linR, linG, linB], toTargetMatrix);

        [hue, saturation, value] = rgbToHsvUnscaled(sR, sG, sB);
        currentX = x;
        currentY = y;
    } else {
        const radius = size / 2;
        const centerX = size / 2;
        const centerY = size / 2;
        const dx = x - centerX;
        const dy = y - centerY;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance <= radius) {
            currentX = x;
            currentY = y;
            hue = (Math.atan2(dy, dx) + Math.PI) / (2 * Math.PI);
            saturation = distance / radius;
            value = parseFloat(valueSlider.value);

            // Treat picked HSV as values in the TARGET color space
            const [rTarget, gTarget, bTarget] = hsvToRgbLin(hue, saturation, value);
            outR = rTarget;
            outG = gTarget;
            outB = bTarget;

            // Convert TARGET space to linear sRGB for monitor display
            const selectedSpace = colorSpaceSelect.value;
            const toLinMatrix = matrices[selectedSpace].toLinearSRGB;
            const [rLin, gLin, bLin] = applyMatrix([outR, outG, outB], toLinMatrix);

            // Display color is always sRGB-mapped for the monitor
            sR = Math.max(0, Math.min(255, Math.round(linearToSRGB(rLin) * 255)));
            sG = Math.max(0, Math.min(255, Math.round(linearToSRGB(gLin) * 255)));
            sB = Math.max(0, Math.min(255, Math.round(linearToSRGB(bLin) * 255)));
        } else {
            return;
        }
    }

    currentHue = hue;
    currentSaturation = saturation;

    colorDisplay.style.backgroundColor = `rgb(${sR}, ${sG}, ${sB})`;

    // Update labels with cleaned up values
    rgbLabel.textContent = `${outR.toFixed(3)}, ${outG.toFixed(3)}, ${outB.toFixed(3)}`;
    hexLabel.innerHTML = `<input type="text" id="hexInput" value="${rgbToHex(sR, sG, sB)}" />`;
    hsvLabel.textContent = `${Math.round(hue * 360)}°, ${Math.round(saturation * 100)}%, ${Math.round(value * 100)}%`;

    // Re-attach hex input listener
    const hexInput = document.getElementById('hexInput');
    if (hexInput) {
        hexInput.addEventListener('change', (e) => updateFromHex(e.target.value));
        hexInput.addEventListener('blur', (e) => updateFromHex(e.target.value));
    }

    // Harmonies logic
    if (harmoniesContainer) {
        const compHue = (hue + 0.5) % 1;
        const tri1Hue = (hue + 0.333) % 1;
        const tri2Hue = (hue + 0.666) % 1;

        const harmonyHues = [
            { label: 'Comp', hue: compHue },
            { label: 'Tri 1', hue: tri1Hue },
            { label: 'Tri 2', hue: tri2Hue }
        ];

        harmoniesContainer.innerHTML = '';
        harmonyHues.forEach(harmony => {
            // Current saturation and value are used for harmony swatches
            const [rTarget, gTarget, bTarget] = hsvToRgbLin(harmony.hue, saturation, value);

            // Convert to linear sRGB then sRGB for display
            const selectedSpace = colorSpaceSelect.value;
            const toLinMatrix = matrices[selectedSpace].toLinearSRGB;
            const [rLin, gLin, bLin] = applyMatrix([rTarget, gTarget, bTarget], toLinMatrix);

            const hR = Math.max(0, Math.min(255, Math.round(linearToSRGB(rLin) * 255)));
            const hG = Math.max(0, Math.min(255, Math.round(linearToSRGB(gLin) * 255)));
            const hB = Math.max(0, Math.min(255, Math.round(linearToSRGB(bLin) * 255)));

            const item = document.createElement('div');
            item.className = 'harmony-item';

            const swatch = document.createElement('div');
            swatch.className = 'harmony-swatch';
            swatch.style.backgroundColor = `rgb(${hR}, ${hG}, ${hB})`;

            // Drag and Drop for Harmony Swatch
            swatch.draggable = true;
            const harmonyData = {
                rgb: `rgb(${hR}, ${hG}, ${hB})`,
                hex: rgbToHex(hR, hG, hB),
                hsv: `${Math.round(harmony.hue * 360)}°, ${Math.round(saturation * 100)}%, ${Math.round(value * 100)}%`,
                rgbOutput: `${rTarget.toFixed(3)}, ${gTarget.toFixed(3)}, ${bTarget.toFixed(3)}`,
                x: (canvas.width / 2) + Math.cos(harmony.hue * 2 * Math.PI - Math.PI) * saturation * (canvas.width / 2),
                y: (canvas.height / 2) + Math.sin(harmony.hue * 2 * Math.PI - Math.PI) * saturation * (canvas.height / 2)
            };
            swatch.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('application/x-color-pick', JSON.stringify(harmonyData));
                e.dataTransfer.effectAllowed = 'copy';
            });
            swatch.addEventListener('dragend', handleDragEnd);

            // Click to pick harmony
            swatch.addEventListener('click', () => {
                updateFromHex(harmonyData.hex);
            });

            const label = document.createElement('span');
            label.className = 'harmony-label';
            label.textContent = harmony.label;

            item.appendChild(swatch);
            item.appendChild(label);
            harmoniesContainer.appendChild(item);
        });
    }

    drawColorWheel();
}

// Unify hex update to the existing version at bottom
function updateColorFromHex(hex) {
    updateFromHex(hex);
}

async function startEyeDropper() {
    if (!('EyeDropper' in window)) return;
    const eyeDropper = new EyeDropper();
    try {
        const result = await eyeDropper.open();
        updateColorFromHex(result.sRGBHex);
    } catch (e) {
        console.log('EyeDropper cancelled or failed', e);
    }
}

function rgbToHsvUnscaled(r, g, b) {
    const [h, s, v] = rgbToHsv(r, g, b);
    return [h, s, v];
}

// function updateLabel(element, text) { ... } REMOVED AS IT WAS REDUNDANT

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

canvas.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropHint.style.opacity = '1';
    canvas.style.transform = 'scale(1.05)';
});

canvas.addEventListener('dragleave', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropHint.style.opacity = '0';
    canvas.style.transform = 'scale(1)';
});

canvas.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropHint.style.opacity = '0';
    canvas.style.transform = 'scale(1)';

    const files = e.dataTransfer.files;
    if (files.length > 0) {
        const file = files[0];
        if (file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = (event) => {
                const img = new Image();
                img.onload = () => {
                    isImageLoaded = true;
                    loadedImage = img;
                    drawColorWheel();
                };
                img.src = event.target.result;
            };
            reader.readAsDataURL(file);
        }
    }
});

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

resetWheelButton.addEventListener('click', () => {
    isImageLoaded = false;
    loadedImage = null;
    currentX = undefined;
    currentY = undefined;
    drawColorWheel();
});

saveButton.addEventListener('click', () => saveColor());

function saveColor(colorData) {
    const currentColor = colorData || {
        rgb: colorDisplay.style.backgroundColor,
        hex: document.getElementById('hexInput').value,
        hsv: hsvLabel.textContent,
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

// Drag and Drop Handlers
function handleDragStart(e, colorData) {
    e.dataTransfer.setData('application/x-color-pick', JSON.stringify(colorData));
    e.dataTransfer.effectAllowed = 'copy';
}

function handleDragEnd(e) {
    savedColorsContainer.classList.remove('drag-over');
}

colorDisplay.addEventListener('dragstart', (e) => {
    const colorData = {
        rgb: colorDisplay.style.backgroundColor,
        hex: document.getElementById('hexInput').value,
        hsv: hsvLabel.textContent,
        rgbOutput: rgbLabel.textContent,
        x: currentX,
        y: currentY
    };
    e.dataTransfer.setData('application/x-color-pick', JSON.stringify(colorData));
    e.dataTransfer.effectAllowed = 'copy';
});

// Keyboard Shortcuts
window.addEventListener('keydown', (e) => {
    // Don't trigger if user is typing in an input
    if (e.target.tagName === 'INPUT') return;

    if (e.key.toLowerCase() === 'p' && 'documentPictureInPicture' in window) {
        pipToggle.click();
    }
    if (e.key.toLowerCase() === 'c') {
        copyButton.click();
    }
    if (e.key.toLowerCase() === 's') {
        saveButton.click();
    }
    if (e.key.toLowerCase() === 'e') {
        startEyeDropper();
    }
    if (e.key === 'ArrowUp') {
        e.preventDefault();
        valueSlider.value = Math.min(1, parseFloat(valueSlider.value) + 0.05);
        valueSlider.dispatchEvent(new Event('input'));
    }
    if (e.key === 'ArrowDown') {
        e.preventDefault();
        valueSlider.value = Math.max(0, parseFloat(valueSlider.value) - 0.05);
        valueSlider.dispatchEvent(new Event('input'));
    }
});

// Global Pop-out (PiP) Logic
let pipWindow = null;

async function togglePip() {
    if (pipWindow) {
        pipWindow.close();
        return;
    }

    const wheelSection = document.querySelector('.wheel-section');
    const actions = document.querySelector('.actions');
    const mainMain = document.querySelector('main');

    try {
        pipWindow = await window.documentPictureInPicture.requestWindow({
            width: 380,
            height: 480,
        });

        // Copy relevant styles
        [...document.styleSheets].forEach((styleSheet) => {
            try {
                const cssRules = [...styleSheet.cssRules].map((rule) => rule.cssText).join('');
                const style = document.createElement('style');
                style.textContent = cssRules;
                pipWindow.document.head.appendChild(style);
            } catch (e) {
                const link = document.createElement('link');
                if (styleSheet.href) {
                    link.rel = 'stylesheet';
                    link.href = styleSheet.href;
                    pipWindow.document.head.appendChild(link);
                }
            }
        });

        // Setup PiP body
        pipWindow.document.body.classList.add('pip-body');
        const pipContainer = document.createElement('div');
        pipContainer.className = 'glass-container';

        // Move elements to PiP
        pipContainer.append(wheelSection, actions);
        pipWindow.document.body.append(pipContainer);

        // Ensure color wheel stays interactive and sized correctly
        setTimeout(() => {
            resizeCanvas();
        }, 100);

        // Fix: Ensure the slider is interactive in the new document
        valueSlider.style.pointerEvents = 'all';
        valueSlider.addEventListener('input', () => {
            if (currentX !== undefined && currentY !== undefined) {
                updateColor(currentX, currentY);
            } else {
                drawColorWheel();
            }
        }, { passive: true });

        // Add a click listener as fallback for some PiP implementations
        valueSlider.addEventListener('click', (e) => {
            // Some PiP windows handle range clicks better than slides
            drawColorWheel();
        });

        pipWindow.addEventListener('resize', resizeCanvas);

        // Proxy dragging events for the PiP window
        pipWindow.document.addEventListener('mousemove', (e) => handleMove(e));
        pipWindow.document.addEventListener('mouseup', (e) => handleEnd(e));

        // Handle closure
        pipWindow.addEventListener('pagehide', () => {
            document.body.classList.remove('pip-mode-active');
            // Return elements to original home
            mainMain.prepend(wheelSection);
            const controlsSection = document.querySelector('.controls-section');
            controlsSection.after(actions);
            pipWindow = null;
            resizeCanvas();
        });
    } catch (err) {
        console.error('PiP failed', err);
    }
}

pipToggle.addEventListener('click', togglePip);
eyeDropperBtn.addEventListener('click', startEyeDropper);


savedColorsContainer.addEventListener('dragover', (e) => {
    if (e.dataTransfer.types.includes('application/x-color-pick')) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        savedColorsContainer.classList.add('drag-over');
    }
});

savedColorsContainer.addEventListener('dragleave', () => {
    savedColorsContainer.classList.remove('drag-over');
});

savedColorsContainer.addEventListener('drop', (e) => {
    e.preventDefault();
    savedColorsContainer.classList.remove('drag-over');
    const pickData = e.dataTransfer.getData('application/x-color-pick');
    if (pickData) {
        try {
            const data = JSON.parse(pickData);
            saveColor(data);
        } catch (err) {
            console.error('Failed to parse dropped color data', err);
        }
    }
});

// Trash Zone Handlers
trashZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    trashZone.classList.add('drag-over');
});

trashZone.addEventListener('dragleave', () => {
    trashZone.classList.remove('drag-over');
});

trashZone.addEventListener('drop', (e) => {
    e.preventDefault();
    trashZone.classList.remove('drag-over');
    trashZone.classList.remove('visible');

    const index = e.dataTransfer.getData('application/x-color-index');
    if (index !== "") {
        savedColors.splice(parseInt(index), 1);
        localStorage.setItem('savedColors', JSON.stringify(savedColors));
        updateSavedColorsDisplay();
    }
});

function updateSavedColorsDisplay() {
    savedColorsContainer.innerHTML = '';
    clearButtonContainer.innerHTML = '';

    if (savedColors.length > 0) {
        const clearButton = document.createElement('button');
        clearButton.id = 'clearSavedColors';
        clearButton.textContent = 'Clear All';
        clearButton.addEventListener('click', clearSavedColors);
        clearButtonContainer.appendChild(clearButton);
    }

    savedColors.forEach((color, index) => {
        const colorElement = document.createElement('div');
        colorElement.className = 'saved-color';
        colorElement.style.backgroundColor = color.rgb;
        colorElement.draggable = true;

        colorElement.addEventListener('click', () => revertToColor(color));

        colorElement.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('application/x-color-index', index);
            e.dataTransfer.effectAllowed = 'move';
            trashZone.classList.add('visible');
        });

        colorElement.addEventListener('dragend', () => {
            trashZone.classList.remove('visible');
            trashZone.classList.remove('drag-over');
        });

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
    rgbLabel.textContent = color.rgbOutput ? color.rgbOutput.split(': ')[1] : color.rgb.match(/\d+/g).map(v => (parseInt(v) / 255).toFixed(3)).join(', ');
    hexLabel.innerHTML = `<input type="text" id="hexInput" value="${color.hex}" />`;
    hsvLabel.textContent = color.hsv.replace(/[()]/g, '');

    // Re-attach hex input listener
    const hexInput = document.getElementById('hexInput');
    if (hexInput) {
        hexInput.addEventListener('change', (e) => updateFromHex(e.target.value));
        hexInput.addEventListener('blur', (e) => updateFromHex(e.target.value));
    }

    // Extract Value from HSV string (e.g., "(120°, 50%, 80%)")
    const hsvMatch = color.hsv.match(/(\d+)%\)/);
    if (hsvMatch) {
        valueSlider.value = parseInt(hsvMatch[1]) / 100;
    }

    // Update color wheel position
    currentX = color.x;
    currentY = color.y;

    const rgb = hexToRgb(color.hex);
    if (rgb) {
        const [h, s] = rgbToHsv(rgb.r, rgb.g, rgb.b);
        currentHue = h;
        currentSaturation = s;
    }

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
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const angle = h * 2 * Math.PI - Math.PI;
    return [centerX + s * radius * Math.cos(angle), centerY + s * radius * Math.sin(angle)];
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
        rgbLabel.textContent = `${outR.toFixed(3)}, ${outG.toFixed(3)}, ${outB.toFixed(3)}`;
        hexLabel.innerHTML = `<input type="text" id="hexInput" value="${hex}" />`;
        hsvLabel.textContent = `${Math.round(h * 360)}°, ${Math.round(s * 100)}%, ${Math.round(v * 100)}%`;

        // Re-attach hex input listener
        const hexInput = document.getElementById('hexInput');
        if (hexInput) {
            hexInput.addEventListener('change', (e) => updateFromHex(e.target.value));
            hexInput.addEventListener('blur', (e) => updateFromHex(e.target.value));
        }

        // Update color wheel position
        currentX = x;
        currentY = y;
        currentHue = h;
        currentSaturation = s;

        // Redraw the color wheel with the updated position
        drawColorWheel();
    }
}

window.addEventListener('resize', resizeCanvas);

// Small delay to ensure container dimensions are calculated
setTimeout(resizeCanvas, 0);
updateSavedColorsDisplay();
