const video = document.getElementById('webcam');
const stripCanvas = document.getElementById('strip-canvas');
const ctx = stripCanvas.getContext('2d');
const flashOverlay = document.getElementById('flash-overlay');
const countdownDisplay = document.getElementById('countdown-display');
const poseBadge = document.getElementById('pose-badge');
const currentPoseEl = document.getElementById('current-pose');
const totalPosesEl = document.getElementById('total-poses');
const startCaptureBtn = document.getElementById('start-capture-btn');
const outputActions = document.getElementById('output-actions');
const emptyPlaceholder = document.getElementById('empty-strip-placeholder');
const saveStatus = document.getElementById('save-status');

// State
let selectedStripCount = 4; // Default 4, max 8
let selectedFilter = 'none';
let selectedTheme = 'classic-white';
let isMirrored = true;
let isCapturing = false;
let latestSavedUrl = '';

const THEMES = {
  'classic-white': { bg: '#ffffff', text: '#111827', border: '#e5e7eb' },
  'midnight-matte': { bg: '#121318', text: '#f8fafc', border: '#27272a' },
  'pastel-blush': { bg: '#ffe4ec', text: '#831843', border: '#fbcfe8' },
  'cyber-lime': { bg: '#ecfccb', text: '#1a2e05', border: '#bef264' }
};

// 1. Initialize Webcam
async function initCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 960 }, facingMode: 'user' },
      audio: false
    });
    video.srcObject = stream;
    document.getElementById('camera-error').classList.add('hidden');
  } catch (err) {
    console.error('Camera access denied:', err);
    document.getElementById('camera-error').classList.remove('hidden');
  }
}

// 2. Strip Count Selection (1 to 8)
document.querySelectorAll('#strip-selector .num-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    if (isCapturing) return;
    document.querySelectorAll('#strip-selector .num-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    selectedStripCount = Math.min(8, Math.max(1, parseInt(btn.dataset.count, 10)));
  });
});

// 3. Filter Selection
document.querySelectorAll('#filter-chips .chip').forEach((chip) => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('#filter-chips .chip').forEach((c) => c.classList.remove('active'));
    chip.classList.add('active');
    selectedFilter = chip.dataset.filter;
    video.style.filter = selectedFilter;
  });
});

// 4. Theme Selection
document.querySelectorAll('#theme-selector .theme-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#theme-selector .theme-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    selectedTheme = btn.dataset.theme;
  });
});

// 5. Mirror Toggle
document.getElementById('toggle-mirror-btn').addEventListener('click', (e) => {
  isMirrored = !isMirrored;
  video.classList.toggle('unmirrored', !isMirrored);
  e.target.textContent = `🪞 Mirror: ${isMirrored ? 'ON' : 'OFF'}`;
});

// Helper: Countdown timer
function runCountdown(seconds = 3) {
  return new Promise((resolve) => {
    countdownDisplay.classList.remove('hidden');
    let remaining = seconds;
    countdownDisplay.textContent = remaining;

    const timer = setInterval(() => {
      remaining -= 1;
      if (remaining > 0) {
        countdownDisplay.textContent = remaining;
      } else {
        clearInterval(timer);
        countdownDisplay.classList.add('hidden');
        resolve();
      }
    }, 1000);
  });
}

// Helper: Shutter Flash Effect
function triggerFlash() {
  flashOverlay.classList.add('active');
  setTimeout(() => flashOverlay.classList.remove('active'), 160);
}

// Helper: Capture Single Frame onto offscreen canvas
function captureSingleFrame() {
  const frameCanvas = document.createElement('canvas');
  const w = video.videoWidth || 1280;
  const h = video.videoHeight || 960;
  frameCanvas.width = w;
  frameCanvas.height = h;
  const fCtx = frameCanvas.getContext('2d');

  fCtx.filter = selectedFilter;

  if (isMirrored) {
    fCtx.translate(w, 0);
    fCtx.scale(-1, 1);
  }
  fCtx.drawImage(video, 0, 0, w, h);
  return frameCanvas;
}

// 6. Main Multi-Frame Capture Sequence
startCaptureBtn.addEventListener('click', async () => {
  if (isCapturing || !video.srcObject) return;

  isCapturing = true;
  startCaptureBtn.disabled = true;
  outputActions.classList.add('hidden');
  poseBadge.classList.remove('hidden');
  totalPosesEl.textContent = selectedStripCount;

  const capturedFrames = [];

  for (let i = 1; i <= selectedStripCount; i++) {
    currentPoseEl.textContent = i;
    await runCountdown(3);
    triggerFlash();
    capturedFrames.push(captureSingleFrame());
    await new Promise((r) => setTimeout(r, 450));
  }

  poseBadge.classList.add('hidden');
  await renderAndSaveStrip(capturedFrames);

  isCapturing = false;
  startCaptureBtn.disabled = false;
});

// 7. Stitch Frames into Vertical Photo Strip & Save to SQLite
async function renderAndSaveStrip(frames) {
  const theme = THEMES[selectedTheme] || THEMES['classic-white'];
  const caption = document.getElementById('strip-caption').value.trim() || 'AURA STUDIO • 2026';
  const dateStamp = new Date().toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });

  const frameWidth = 600;
  const frameHeight = 450;
  const padding = 36;
  const gap = 24;
  const footerHeight = 110;

  const totalWidth = frameWidth + padding * 2;
  const totalHeight =
    padding + frames.length * frameHeight + (frames.length - 1) * gap + footerHeight;

  stripCanvas.width = totalWidth;
  stripCanvas.height = totalHeight;

  // Strip Background
  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, totalWidth, totalHeight);

  // Draw each captured photo
  frames.forEach((frame, index) => {
    const yPos = padding + index * (frameHeight + gap);
    ctx.drawImage(frame, padding, yPos, frameWidth, frameHeight);

    // Subtle frame border
    ctx.strokeStyle = theme.border;
    ctx.lineWidth = 2;
    ctx.strokeRect(padding, yPos, frameWidth, frameHeight);
  });

  // Footer Typography
  ctx.fillStyle = theme.text;
  ctx.textAlign = 'center';
  ctx.font = 'bold 26px "Plus Jakarta Sans", sans-serif';
  ctx.fillText(caption.toUpperCase(), totalWidth / 2, totalHeight - 52);

  ctx.font = '16px "Space Mono", monospace';
  ctx.globalAlpha = 0.7;
  ctx.fillText(`${dateStamp} • ${frames.length} STRIP EDITION`, totalWidth / 2, totalHeight - 24);
  ctx.globalAlpha = 1.0;

  // Show Canvas in UI
  emptyPlaceholder.classList.add('hidden');
  stripCanvas.style.display = 'block';
  outputActions.classList.remove('hidden');

  // Persist to Backend SQLite Database
  const dataUrl = stripCanvas.toDataURL('image/png');
  saveStatus.textContent = 'Saving to DB...';

  try {
    const response = await fetch('/api/strips', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageData: dataUrl,
        stripCount: selectedStripCount,
        filterUsed: selectedFilter,
        themeUsed: selectedTheme,
        caption
      })
    });

    const result = await response.json();
    if (response.ok) {
      saveStatus.textContent = 'Saved to DB ✓';
      latestSavedUrl = `${window.location.origin}${result.imageUrl}`;
      loadGalleryCount();
    } else {
      saveStatus.textContent = 'Save Error';
    }
  } catch (err) {
    console.error('Database save failed:', err);
    saveStatus.textContent = 'Offline Mode';
  }
}

// 8. Download Button
document.getElementById('download-btn').addEventListener('click', () => {
  const link = document.createElement('a');
  link.download = `aura-photostrip-${selectedStripCount}frames-${Date.now()}.png`;
  link.href = stripCanvas.toDataURL('image/png');
  link.click();
});

// 9. Print Button
document.getElementById('print-btn').addEventListener('click', () => {
  const printImg = document.getElementById('print-image');
  printImg.src = stripCanvas.toDataURL('image/png');
  printImg.onload = () => {
    window.print();
  };
});

// 10. QR Share Modal
document.getElementById('qr-btn').addEventListener('click', () => {
  const qrBox = document.getElementById('qrcode-box');
  qrBox.innerHTML = '';
  const shareTarget = latestSavedUrl || window.location.href;
  new QRCode(qrBox, {
    text: shareTarget,
    width: 200,
    height: 200
  });
  document.getElementById('qr-modal').classList.remove('hidden');
});

document.getElementById('close-qr-btn').addEventListener('click', () => {
  document.getElementById('qr-modal').classList.add('hidden');
});

// 11. Retake / Reset
document.getElementById('retake-btn').addEventListener('click', () => {
  stripCanvas.style.display = 'none';
  emptyPlaceholder.classList.remove('hidden');
  outputActions.classList.add('hidden');
  saveStatus.textContent = 'Ready';
});

// 12. Database Event Gallery
async function loadGallery() {
  const grid = document.getElementById('gallery-grid');
  grid.innerHTML = '<p>Loading saved strips...</p>';

  const res = await fetch('/api/strips');
  const strips = await res.json();
  document.getElementById('gallery-count').textContent = strips.length;

  if (!strips.length) {
    grid.innerHTML = '<p>No photo strips captured yet.</p>';
    return;
  }

  grid.innerHTML = strips
    .map(
      (item) => `
      <div class="gallery-item">
        <img src="${item.image_url}" alt="Photo Strip" loading="lazy" />
        <small style="color:#94a3b8;font-size:0.75rem;">${item.strip_count} Frames • ${new Date(item.created_at).toLocaleDateString()}</small>
        <div class="gallery-item-actions">
          <a href="${item.image_url}" download="strip_${item.id}.png" style="flex:1;text-decoration:none;">
            <button style="width:100%;background:#22c55e;color:#052e16;">Download</button>
          </a>
          <button onclick="printSavedStrip('${item.image_url}')" style="background:#fff;color:#000;">Print</button>
        </div>
      </div>
    `
    )
    .join('');
}

async function loadGalleryCount() {
  try {
    const res = await fetch('/api/strips');
    const strips = await res.json();
    document.getElementById('gallery-count').textContent = strips.length;
  } catch (e) {}
}

window.printSavedStrip = function (url) {
  const printImg = document.getElementById('print-image');
  printImg.src = url;
  printImg.onload = () => window.print();
};

document.getElementById('open-gallery-btn').addEventListener('click', () => {
  document.getElementById('gallery-modal').classList.remove('hidden');
  loadGallery();
});

document.getElementById('close-gallery-btn').addEventListener('click', () => {
  document.getElementById('gallery-modal').classList.add('hidden');
});

document.getElementById('retry-cam-btn').addEventListener('click', initCamera);

// Boot
initCamera();
loadGalleryCount();