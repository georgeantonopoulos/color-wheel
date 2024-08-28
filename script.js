const canvas = document.getElementById('colorWheel');
const ctx = canvas.getContext('2d');
const colorDisplay = document.getElementById('colorDisplay');
const rgbLabel = document.getElementById('rgbLabel');
const copyButton = document.getElementById('copyButton');
const saveButton = document.getElementById('saveButton');
const savedColorsContainer = document.getElementById('savedColors');
let savedColors = [];

let currentX, currentY;

function resizeCanvas() {
    const container = document.querySelector('.container');
    const size = Math.min(container.offsetWidth - 40, 300);
    canvas.width = size;
    canvas.height = size;
    drawColorWheel();
}

function drawColorWheel() {
    const size = canvas.width;
    const radius = size / 2;
    const centerX = size / 2;
    const centerY = size / 2;

    ctx.clearRect(0, 0, size, size);
    
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const dx = x - centerX;
            const dy = y - centerY;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance <= radius) {
                const hue = (Math.atan2(dy, dx) + Math.PI) / (2 * Math.PI);
                const saturation = distance / radius;
                const [r, g, b] = hsvToRgb(hue, saturation, 1);
                
                const alpha = distance > radius - 1 ? 1 - (distance - (radius - 1)) : 1;
                ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
                ctx.fillRect(x, y, 1, 1);
            }
        }
    }

    if (currentX !== undefined && currentY !== undefined) {
        drawIndicator(currentX, currentY);
    }
}

function drawIndicator(x, y) {
    const radius = 8;
    
    function drawAntiAliasedCircle(centerX, centerY, radius, strokeStyle, lineWidth) {
        const diameter = radius * 2;
        const radiusSquared = radius * radius;
        
        for (let y = -radius - 2; y <= radius + 2; y++) {
            for (let x = -radius - 2; x <= radius + 2; x++) {
                const distanceSquared = x * x + y * y;
                if (distanceSquared > (radius - lineWidth) * (radius - lineWidth) && distanceSquared < (radius + lineWidth) * (radius + lineWidth)) {
                    const distance = Math.sqrt(distanceSquared);
                    const alpha = Math.max(0, Math.min(1, lineWidth + 0.5 - Math.abs(distance - radius)));
                    ctx.fillStyle = `rgba(${strokeStyle}, ${alpha})`;
                    ctx.fillRect(centerX + x, centerY + y, 1, 1);
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
    return 0.6131 * c + 0.3396 * c - 0.0527 * c;
}

function ACESToSRGB(c) {
    // First, convert ACES AP1 to linear sRGB
    c = 1.7050 * c - 0.6242 * c - 0.0808 * c;
    
    // Then, convert linear sRGB to sRGB
    if (c <= 0.0031308) {
        return c * 12.92;
    } else {
        return 1.055 * Math.pow(c, 1/2.4) - 0.055;
    }
}

function rgbToHex(r, g, b) {
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
        const [r, g, b] = hsvToRgb(hue, saturation, 1);
        
        const acesR = r / 255;
        const acesG = g / 255;
        const acesB = b / 255;
        
        colorDisplay.style.backgroundColor = `rgb(${Math.round(ACESToSRGB(acesR) * 255)}, ${Math.round(ACESToSRGB(acesG) * 255)}, ${Math.round(ACESToSRGB(acesB) * 255)})`;
        updateLabel(rgbLabel, `ACES RGB (0-1): (${acesR.toFixed(3)}, ${acesG.toFixed(3)}, ${acesB.toFixed(3)})`);
        updateLabel(document.getElementById('hexLabel'), `HEX: ${rgbToHex(r, g, b)}`);
        updateLabel(document.getElementById('hsvLabel'), `HSV: (${Math.round(hue * 360)}°, ${Math.round(saturation * 100)}%, 100%)`);
        
        drawColorWheel();
    }
}

function updateLabel(element, text) {
    if (element) {
        element.textContent = text;
    }
}

function handleStart(e) {
    e.preventDefault();
    const pos = getEventPosition(e);
    updateColor(pos.x, pos.y);
}

function handleMove(e) {
    e.preventDefault();
    if (e.buttons > 0 || e.type === 'touchmove') {
        const pos = getEventPosition(e);
        updateColor(pos.x, pos.y);
    }
}

function handleEnd(e) {
    // Optional: Add any cleanup or final actions here
}

function getEventPosition(e) {
    const rect = canvas.getBoundingClientRect();
    const clientX = e.clientX || (e.touches && e.touches[0].clientX);
    const clientY = e.clientY || (e.touches && e.touches[0].clientY);
    return {
        x: clientX - rect.left,
        y: clientY - rect.top
    };
}

canvas.addEventListener('mousedown', handleStart);
canvas.addEventListener('mousemove', handleMove);
canvas.addEventListener('mouseup', handleEnd);
canvas.addEventListener('mouseout', handleEnd);

canvas.addEventListener('touchstart', handleStart);
canvas.addEventListener('touchmove', handleMove);
canvas.addEventListener('touchend', handleEnd);
canvas.addEventListener('touchcancel', handleEnd);

copyButton.textContent = 'Copy for Nuke';
copyButton.addEventListener('click', () => {
    const rgbText = rgbLabel ? rgbLabel.textContent : '';
    const rgbValues = rgbText.match(/\d+\.\d+/g);
    
    if (rgbValues && rgbValues.length === 3) {
        // The values are already in ACES space, just format them
        const formattedValues = `${rgbValues.join(' ')} 1`;
        
        navigator.clipboard.writeText(formattedValues).then(() => {
            alert('Color values copied to clipboard!');
        }).catch(err => {
            console.error('Failed to copy: ', err);
            alert('Failed to copy to clipboard. Please copy the values manually.');
        });
    } else {
        console.error('Failed to extract color values');
        alert('Failed to extract color values. Please try again.');
    }
});

saveButton.addEventListener('click', saveColor);

function saveColor() {
    const currentColor = {
        rgb: colorDisplay.style.backgroundColor,
        hex: document.getElementById('hexLabel').textContent.split(': ')[1],
        hsv: document.getElementById('hsvLabel').textContent.split(': ')[1],
        x: currentX,
        y: currentY
    };
    if (!savedColors.some(color => color.rgb === currentColor.rgb)) {
        savedColors.push(currentColor);
        updateSavedColorsDisplay();
    }
}

function updateSavedColorsDisplay() {
    savedColorsContainer.innerHTML = '';
    
    // Add clear button if there are saved colors
    if (savedColors.length > 0) {
        const clearButton = document.createElement('button');
        clearButton.id = 'clearSavedColors';
        clearButton.innerHTML = '&times;';
        clearButton.addEventListener('click', clearSavedColors);
        savedColorsContainer.appendChild(clearButton);
    }
    
    savedColors.forEach((color, index) => {
        const colorElement = document.createElement('div');
        colorElement.className = 'saved-color';
        colorElement.style.backgroundColor = color.rgb;
        colorElement.addEventListener('click', () => revertToColor(color));
        savedColorsContainer.appendChild(colorElement);
    });

    // Calculate and set the height of the savedColors container
    const rows = Math.ceil(savedColors.length / 4); // Assuming 4 colors per row
    const height = Math.max(60, rows * 50); // 50px per row, minimum 60px
    savedColorsContainer.style.height = `${height}px`;
}

function clearSavedColors() {
    savedColors = [];
    updateSavedColorsDisplay();
}

function revertToColor(color) {
    // Update color display
    colorDisplay.style.backgroundColor = color.rgb;
    
    // Update labels
    updateLabel(rgbLabel, `RGB (0-1): ${color.rgb.match(/\d+/g).map(v => (parseInt(v) / 255).toFixed(3)).join(', ')}`);
    updateLabel(document.getElementById('hexLabel'), `HEX: ${color.hex}`);
    updateLabel(document.getElementById('hsvLabel'), `HSV: ${color.hsv}`);
    
    // Update color wheel position
    currentX = color.x;
    currentY = color.y;
    
    // Redraw the color wheel with the updated position
    drawColorWheel();
}

function rgbToHsv(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
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
    const x = radius + s * radius * Math.cos(angle);
    const y = radius + s * radius * Math.sin(angle);
    return [x, y];
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas();