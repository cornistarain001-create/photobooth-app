const video = document.getElementById('video');
const overlayCanvas = document.getElementById('overlayCanvas');
const ctxOverlay = overlayCanvas.getContext('2d');
const stripCanvas = document.getElementById('stripCanvas');
const ctxStrip = stripCanvas.getContext('2d');

const startBtn = document.getElementById('startBtn');
const retakeBtn = document.getElementById('retakeBtn');
const downloadBtn = document.getElementById('downloadBtn');
const printBtn = document.getElementById('printBtn');
const countdownEl = document.getElementById('countdown');
const flashEl = document.getElementById('flash');
const captionInput = document.getElementById('captionInput');

// State options
let frameCount = 4;
let currentShape = 'rounded';
let currentSticker = 'none';
let currentFilter = 'none';
let currentTheme = 'cream';
let capturedPhotos = [];
let animId = null;

// Initialize WebRTC Camera
async function initCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 }, audio: false });
    video.srcObject = stream;
    video.play();
    video.onloadedmetadata = () => {
      overlayCanvas.width = video.videoWidth;
      overlayCanvas.height = video.videoHeight;
      startStickerAnimation();
    };
  } catch (err) {
    alert('Unable to access camera. Please allow webcam permissions!');
    console.error(err);
  }
}

// UI Pill Selectors Handlers
function setupPillGroup(containerId, callback) {
  const container = document.getElementById(containerId);
  container.querySelectorAll('.pill, .swatch').forEach(btn => {
    btn.addEventListener('click', (e) => {
      container.querySelectorAll('.pill, .swatch').forEach(b => b.classList.remove('active'));
      e.currentTarget.classList.add('active');
      callback(e.currentTarget);
      updateStripPreview();
    });
  });
}

setupPillGroup('frameCountGroup', (btn) => { frameCount = parseInt(btn.dataset.count); });
setupPillGroup('shapeGroup', (btn) => { currentShape = btn.dataset.shape; });
setupPillGroup('stickerGroup', (btn) => { currentSticker = btn.dataset.sticker; });
setupPillGroup('filterGroup', (btn) => { currentFilter = btn.dataset.filter; });
setupPillGroup('themeGroup', (btn) => { currentTheme = btn.dataset.theme; });

captionInput.addEventListener('input', () => updateStripPreview());

// Live Kawaii Stickers / Face Overlays Animation Loop
function startStickerAnimation() {
  function renderLoop() {
    ctxOverlay.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
    
    if (currentSticker !== 'none') {
      ctxOverlay.save();
      ctxOverlay.font = '72px sans-serif';
      ctxOverlay.textAlign = 'center';
      
      const cx = overlayCanvas.width / 2;
      const cy = overlayCanvas.height / 2 - 80;

      if (currentSticker === 'cat') {
        ctxOverlay.fillText('🐱', cx - 110, cy - 60);
        ctxOverlay.fillText('🐱', cx + 110, cy - 60);
        ctxOverlay.font = '36px sans-serif';
        ctxOverlay.fillText('🐾', cx - 140, cy + 20);
      } else if (currentSticker === 'bunny') {
        ctxOverlay.fillText('🐰', cx - 100, cy - 90);
        ctxOverlay.fillText('🐰', cx + 100, cy - 90);
      } else if (currentSticker === 'bear') {
        ctxOverlay.fillText('🧸', cx - 110, cy - 80);
        ctxOverlay.fillText('🧸', cx + 110, cy - 80);
      } else if (currentSticker === 'blush') {
        ctxOverlay.font = '50px sans-serif';
        ctxOverlay.fillText('🌸', cx - 90, cy + 30);
        ctxOverlay.fillText('🌸', cx + 90, cy + 30);
      } else if (currentSticker === 'crown') {
        ctxOverlay.fillText('👑', cx, cy - 110);
      } else if (currentSticker === 'bow') {
        ctxOverlay.fillText('🎀', cx + 80, cy - 90);
      } else if (currentSticker === 'sparkles') {
        const time = Date.now() / 300;
        ctxOverlay.font = '45px sans-serif';
        ctxOverlay.fillText('✨', cx - 120 + Math.sin(time) * 15, cy - 50);
        ctxOverlay.fillText('⭐', cx + 120 + Math.cos(time) * 15, cy - 20);
        ctxOverlay.fillText('💖', cx, cy - 120);
      }
      ctxOverlay.restore();
    }
    animId = requestAnimationFrame(renderLoop);
  }
  renderLoop();
}

// Apply Filter Styles on Canvas Context
function applyFilter(context, filterName, width, height) {
  if (filterName === 'peach') {
    context.fillStyle = 'rgba(255, 160, 122, 0.18)';
    context.fillRect(0, 0, width, height);
  } else if (filterName === 'strawberry') {
    context.fillStyle = 'rgba(255, 105, 180, 0.18)';
    context.fillRect(0, 0, width, height);
  } else if (filterName === 'dreamy') {
    context.fillStyle = 'rgba(186, 150, 255, 0.22)';
    context.fillRect(0, 0, width, height);
  } else if (filterName === 'mint') {
    context.fillStyle = 'rgba(135, 235, 190, 0.16)';
    context.fillRect(0, 0, width, height);
  } else if (filterName === 'sunset') {
    context.fillStyle = 'rgba(255, 180, 50, 0.18)';
    context.fillRect(0, 0, width, height);
  } else if (filterName === 'vintage') {
    context.fillStyle = 'rgba(120, 80, 40, 0.2)';
    context.fillRect(0, 0, width, height);
  } else if (filterName === 'bw') {
    context.filter = 'grayscale(100%) contrast(110%)';
  }
}

// Capture Sequence with Countdown
startBtn.addEventListener('click', async () => {
  startBtn.classList.add('hidden');
  capturedPhotos = [];
  
  for (let i = 0; i < frameCount; i++) {
    await runCountdown();
    takeSnap();
  }

  retakeBtn.classList.remove('hidden');
  downloadBtn.disabled = false;
  printBtn.disabled = false;
  updateStripPreview();
});

retakeBtn.addEventListener('click', () => {
  capturedPhotos = [];
  retakeBtn.classList.add('hidden');
  startBtn.classList.remove('hidden');
  downloadBtn.disabled = true;
  printBtn.disabled = true;
  updateStripPreview();
});

function runCountdown() {
  return new Promise((resolve) => {
    let count = 3;
    countdownEl.textContent = count;
    countdownEl.classList.remove('hidden');
    
    const timer = setInterval(() => {
      count--;
      if (count > 0) {
        countdownEl.textContent = count;
      } else {
        clearInterval(timer);
        countdownEl.classList.add('hidden');
        triggerFlash();
        resolve();
      }
    }, 1000);
  });
}

function triggerFlash() {
  flashEl.classList.add('active');
  setTimeout(() => flashEl.classList.remove('active'), 200);
}

function takeSnap() {
  const snapCanvas = document.createElement('canvas');
  snapCanvas.width = video.videoWidth;
  snapCanvas.height = video.videoHeight;
  const sCtx = snapCanvas.getContext('2d');
  
  sCtx.save();
  sCtx.scale(-1, 1);
  sCtx.drawImage(video, -snapCanvas.width, 0, snapCanvas.width, snapCanvas.height);
  sCtx.restore();

  applyFilter(sCtx, currentFilter, snapCanvas.width, snapCanvas.height);
  capturedPhotos.push(snapCanvas.toDataURL('image/png'));
  updateStripPreview();
}

// Helper function to draw images without stretching (mimics CSS object-fit: cover)
function drawImageProp(ctx, img, x, y, w, h) {
  const imgW = img.naturalWidth || img.width;
  const imgH = img.naturalHeight || img.height;
  const targetAspect = w / h;
  const imgAspect = imgW / imgH;

  let renderW, renderH, offsetX = 0, offsetY = 0;

  if (imgAspect > targetAspect) {
    renderH = h;
    renderW = imgW * (h / imgH);
    offsetX = (w - renderW) / 2;
  } else {
    renderW = w;
    renderH = imgH * (w / imgW);
    offsetY = (h - renderH) / 2;
  }

  ctx.save();
  ctx.beginPath();
  if (currentShape === 'heart') {
    drawHeartPath(ctx, x, y, w, h);
  } else if (currentShape === 'circle') {
    ctx.arc(x + w/2, y + h/2, Math.min(w, h)/2, 0, Math.PI * 2);
  } else if (currentShape === 'pill') {
    ctx.roundRect(x, y, w, h, h / 2);
  } else if (currentShape === 'scallop' || currentShape === 'star') {
    ctx.roundRect(x, y, w, h, 40);
  } else {
    ctx.roundRect(x, y, w, h, 18);
  }
  ctx.clip();

  ctx.drawImage(img, x + offsetX, y + offsetY, renderW, renderH);
  ctx.restore();
}

// Draw Photo Strip Preview with Non-Stretched Shapes & Themes
function updateStripPreview() {
  const width = 600;
  const padding = 36;
  const photoW = width - (padding * 2);
  const photoH = Math.round(photoW * 0.75);
  const headerH = 110;
  const footerH = 70;
  const spacing = 20;

  const totalHeight = headerH + (frameCount * photoH) + ((frameCount - 1) * spacing) + footerH + (padding * 2);
  stripCanvas.width = width;
  stripCanvas.height = totalHeight;

  // Background Theme Fill
  if (currentTheme === 'pink') {
    ctxStrip.fillStyle = '#FFD6E0';
  } else if (currentTheme === 'lavender') {
    ctxStrip.fillStyle = '#E2D4F0';
  } else if (currentTheme === 'mint') {
    ctxStrip.fillStyle = '#D4F4E7';
  } else if (currentTheme === 'butter') {
    ctxStrip.fillStyle = '#FFF3B0';
  } else if (currentTheme === 'peach') {
    ctxStrip.fillStyle = '#FFE5D9';
  } else if (currentTheme === 'gingham') {
    ctxStrip.fillStyle = '#FFE5EC';
  } else {
    ctxStrip.fillStyle = '#FFFDF9'; // Cream
  }
  ctxStrip.fillRect(0, 0, width, totalHeight);

  // Draw Header Branding
  ctxStrip.fillStyle = '#ff5c8a';
  ctxStrip.font = '700 28px "Fredoka", sans-serif';
  ctxStrip.textAlign = 'center';
  ctxStrip.fillText('✨ AURA STUDIO ✨', width / 2, padding + 35);

  ctxStrip.fillStyle = '#8a798f';
  ctxStrip.font = '600 18px "Quicksand", sans-serif';
  ctxStrip.fillText(captionInput.value || '✨ BESTIES 2026 ✨', width / 2, padding + 70);

  // Draw Photos
  let startY = padding + headerH;
  for (let i = 0; i < frameCount; i++) {
    const photoX = padding;
    const photoY = startY;

    if (capturedPhotos[i]) {
      const img = new Image();
      img.src = capturedPhotos[i];
      // Draw non-stretched image with cover property
      drawImageProp(ctxStrip, img, photoX, photoY, photoW, photoH);
    } else {
      ctxStrip.save();
      ctxStrip.beginPath();
      ctxStrip.roundRect(photoX, photoY, photoW, photoH, 18);
      ctxStrip.clip();
      ctxStrip.fillStyle = '#ffeef2';
      ctxStrip.fillRect(photoX, photoY, photoW, photoH);
      ctxStrip.fillStyle = '#ffb3c6';
      ctxStrip.font = '600 22px "Fredoka", sans-serif';
      ctxStrip.textAlign = 'center';
      ctxStrip.fillText(`Pose ${i + 1} 📸`, photoX + photoW/2, photoY + photoH/2 + 8);
      ctxStrip.restore();
    }

    // Subtle Photo Frame Border
    ctxStrip.strokeStyle = '#ffb3c6';
    ctxStrip.lineWidth = 4;
    ctxStrip.beginPath();
    ctxStrip.roundRect(photoX, photoY, photoW, photoH, 18);
    ctxStrip.stroke();

    startY += photoH + spacing;
  }

  // Footer Timestamp / Watermark
  ctxStrip.fillStyle = '#b09eb3';
  ctxStrip.font = '600 14px "Quicksand", sans-serif';
  ctxStrip.textAlign = 'center';
  ctxStrip.fillText('© 2026 Aura Studio • Made with 💖', width / 2, totalHeight - padding + 25);
}

function drawHeartPath(ctx, x, y, w, h) {
  const d = Math.min(w, h);
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  ctx.moveTo(0, d / 4);
  ctx.bezierCurveTo(d / 2, -d / 2, d, d / 3, 0, d / 2);
  ctx.bezierCurveTo(-d, d / 3, -d / 2, -d / 2, 0, d / 4);
  ctx.restore();
}

// Download Button Handler
downloadBtn.addEventListener('click', () => {
  const link = document.createElement('a');
  link.download = `aura-studio-${Date.now()}.png`;
  link.href = stripCanvas.toDataURL('image/png');
  link.click();
});

// Print Button Handler
printBtn.addEventListener('click', () => {
  const dataUrl = stripCanvas.toDataURL('image/png');
  const printWindow = window.open('', '_blank');
  printWindow.document.write(`
    <html>
      <head><title>Print Photo Strip</title></head>
      <body style="text-align:center; background:#fff; margin:0; padding:20px;">
        <img src="${dataUrl}" style="max-height:95vh;" onload="window.print();window.close();"/>
      </body>
    </html>
  `);
  printWindow.document.close();
});

// Initialize on Load
initCamera();
updateStripPreview();