const canvas = document.getElementById('colorWheel');
const ctx = canvas.getContext('2d');
const colorDisplay = document.getElementById('colorDisplay');
const rgbLabel = document.getElementById('rgbLabel');
const copyButton = document.getElementById('copyButton');

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

    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
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
        
        colorDisplay.style.backgroundColor = `rgb(${r}, ${g}, ${b})`;
        rgbLabel.textContent = `RGB (0-1): (${(r/255).toFixed(3)}, ${(g/255).toFixed(3)}, ${(b/255).toFixed(3)})`;
        
        drawColorWheel();
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

copyButton.addEventListener('click', () => {
    const rgbText = rgbLabel.textContent;
    const rgbValues = rgbText.match(/\d+\.\d+/g);
    if (rgbValues && rgbValues.length === 3) {
        const formattedValues = rgbValues.map(v => parseFloat(v).toFixed(3)).join(' ') + ' 1';
        navigator.clipboard.writeText(formattedValues).then(() => {
            alert('Color values copied to clipboard!');
        }).catch(err => {
            console.error('Failed to copy: ', err);
        });
    } else {
        console.error('Failed to extract RGB values');
    }
});

window.addEventListener('resize', resizeCanvas);
resizeCanvas();