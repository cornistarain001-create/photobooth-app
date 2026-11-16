document.addEventListener('DOMContentLoaded', () => {
  const video = document.getElementById('video');
  const overlayCanvas = document.getElementById('overlayCanvas');
  const ctxOverlay = overlayCanvas ? overlayCanvas.getContext('2d') : null;
  const stripCanvas = document.getElementById('stripCanvas');
  const ctxStrip = stripCanvas ? stripCanvas.getContext('2d') : null;

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
  let currentFrame = 'classic';
  let currentSticker = 'none';
  let currentFilter = 'none';
  let capturedPhotos = [];

  // Initialize WebRTC Camera safely
  async function initCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      if (video) {
        video.srcObject = stream;
        video.play();
        video.onloadedmetadata = () => {
          if (overlayCanvas) {
            overlayCanvas.width = video.videoWidth || 640;
            overlayCanvas.height = video.videoHeight || 480;
          }
          startStickerAnimation();
        };
      }
      return true;
    } catch (err) {
      console.error("Camera access error:", err);
      alert('Unable to access camera. Please check browser permissions!');
      return false;
    }
  }

  // UI Pill Selectors Handlers
  function setupPillGroup(containerId, callback) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.querySelectorAll('.pill').forEach(btn => {
      btn.addEventListener('click', (e) => {
        container.querySelectorAll('.pill').forEach(b => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
        callback(e.currentTarget);
        updateStripPreview();
      });
    });
  }

  setupPillGroup('frameCountGroup', (btn) => { frameCount = parseInt(btn.dataset.count); });
  setupPillGroup('shapeGroup', (btn) => { currentShape = btn.dataset.shape; });
  setupPillGroup('frameDesignGroup', (btn) => { currentFrame = btn.dataset.frame; });
  setupPillGroup('stickerGroup', (btn) => { currentSticker = btn.dataset.sticker; });
  setupPillGroup('filterGroup', (btn) => { currentFilter = btn.dataset.filter; });

  if (captionInput) {
    captionInput.addEventListener('input', () => updateStripPreview());
  }

  // Live Kawaii Stickers Animation Loop
  function startStickerAnimation() {
    if (!ctxOverlay) return;
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
      requestAnimationFrame(renderLoop);
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
  if (startBtn) {
    startBtn.addEventListener('click', async () => {
      startBtn.classList.add('hidden');
      capturedPhotos = [];
      
      for (let i = 0; i < frameCount; i++) {
        await runCountdown();
        takeSnap();
        updateStripPreview();
      }

      if (retakeBtn) retakeBtn.classList.remove('hidden');
      if (downloadBtn) downloadBtn.disabled = false;
      if (printBtn) printBtn.disabled = false;
      updateStripPreview();
    });
  }

  if (retakeBtn) {
    retakeBtn.addEventListener('click', () => {
      capturedPhotos = [];
      retakeBtn.classList.add('hidden');
      if (startBtn) startBtn.classList.remove('hidden');
      if (downloadBtn) downloadBtn.disabled = true;
      if (printBtn) printBtn.disabled = true;
      updateStripPreview();
    });
  }

  function runCountdown() {
    return new Promise((resolve) => {
      let count = 3;
      if (countdownEl) {
        countdownEl.textContent = count;
        countdownEl.classList.remove('hidden');
      }
      
      const timer = setInterval(() => {
        count--;
        if (count > 0) {
          if (countdownEl) countdownEl.textContent = count;
        } else {
          clearInterval(timer);
          if (countdownEl) countdownEl.classList.add('hidden');
          triggerFlash();
          resolve();
        }
      }, 1000);
    });
  }

  function triggerFlash() {
    if (flashEl) {
      flashEl.classList.add('active');
      setTimeout(() => flashEl.classList.remove('active'), 200);
    }
  }

  function takeSnap() {
    if (!video || video.videoWidth === 0) return;
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
  }

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
    applyShapePath(ctx, x, y, w, h);
    ctx.clip();
    ctx.drawImage(img, x + offsetX, y + offsetY, renderW, renderH);
    ctx.restore();
  }

  function applyShapePath(ctx, x, y, w, h) {
    if (currentShape === 'heart') {
      drawHeartPath(ctx, x, y, w, h);
    } else if (currentShape === 'circle') {
      const radius = Math.min(w, h) / 2;
      ctx.arc(x + w / 2, y + h / 2, radius, 0, Math.PI * 2);
    } else if (currentShape === 'pill') {
      ctx.roundRect(x, y, w, h, h / 2);
    } else if (currentShape === 'scallop') {
      ctx.roundRect(x, y, w, h, 35);
    } else if (currentShape === 'star') {
      drawStarPath(ctx, x + w / 2, y + h / 2, Math.min(w, h) / 2, 5);
    } else {
      ctx.roundRect(x, y, w, h, 18);
    }
  }

  function drawHeartPath(ctx, x, y, w, h) {
    const cx = x + w / 2;
    const cy = y + h / 2;
    const size = Math.min(w, h) * 0.52;

    ctx.moveTo(cx, cy + size * 0.7);
    ctx.bezierCurveTo(cx - size * 1.6, cy + size * 0.1, cx - size * 1.2, cy - size * 1.1, cx, cy - size * 0.3);
    ctx.bezierCurveTo(cx + size * 1.2, cy - size * 1.1, cx + size * 1.6, cy + size * 0.1, cx, cy + size * 0.7);
  }

  function drawStarPath(ctx, cx, cy, r, points) {
    let rot = (Math.PI / 2) * 3;
    let step = Math.PI / points;
    ctx.moveTo(cx, cy - r);
    for (let i = 0; i < points; i++) {
      let x = cx + Math.cos(rot) * r;
      let y = cy + Math.sin(rot) * r;
      ctx.lineTo(x, y);
      rot += step;
      x = cx + Math.cos(rot) * (r * 0.5);
      y = cy + Math.sin(rot) * (r * 0.5);
      ctx.lineTo(x, y);
      rot += step;
    }
    ctx.closePath();
  }

  function updateStripPreview() {
    if (!stripCanvas || !ctxStrip) return;
    const width = 600;
    const padding = 36;
    const photoW = width - (padding * 2);
    const photoH = Math.round(photoW * 0.75);
    
    const hasCameraHeader = (currentFrame === 'camera');
    const headerH = hasCameraHeader ? 160 : 110;
    const footerH = 70;
    const spacing = 20;

    const totalHeight = headerH + (frameCount * photoH) + ((frameCount - 1) * spacing) + footerH + (padding * 2);
    stripCanvas.width = width;
    stripCanvas.height = totalHeight;

    let bgColor = '#FFFDF9';
    let headerColor = '#ff5c8a';
    let borderColor = '#ffb3c6';
    let accentSymbol = '✨';

    switch(currentFrame) {
      case 'camera': bgColor = '#F4F1EA'; headerColor = '#2b2b2b'; borderColor = '#4a4a4a'; accentSymbol = '📷'; break;
      case 'wine_seal': bgColor = '#5c1d24'; headerColor = '#ffccd5'; borderColor = '#8c2d38'; accentSymbol = '🍷'; break;
      case 'snoopy_love': bgColor = '#731722'; headerColor = '#ffd1d9'; borderColor = '#9e2a38'; accentSymbol = '💌'; break;
      case 'disco_pink': bgColor = '#fff0f3'; headerColor = '#ff4772'; borderColor = '#ffb3c6'; accentSymbol = '🪩'; break;
      case 'story_love': bgColor = '#4a151b'; headerColor = '#f5c6cb'; borderColor = '#80202a'; accentSymbol = '🌹'; break;
      case 'news_pin': bgColor = '#5e1922'; headerColor = '#f7d1d7'; borderColor = '#8c2531'; accentSymbol = '📌'; break;
      case 'letter_check': bgColor = '#F5EBE0'; headerColor = '#80202a'; borderColor = '#D5BDAf'; accentSymbol = '📜'; break;
      case 'film_noir': bgColor = '#1a1a1a'; headerColor = '#e0e0e0'; borderColor = '#404040'; accentSymbol = '🎞️'; break;
      case 'cherry_blush': bgColor = '#FFF0F3'; headerColor = '#C9184A'; borderColor = '#FFB3C6'; accentSymbol = '🍒'; break;
      case 'lavender_dream': bgColor = '#F3EEFF'; headerColor = '#7B2CBF'; borderColor = '#D8BBFF'; accentSymbol = '☁️'; break;
      case 'matcha_pantry': bgColor = '#F2F7F4'; headerColor = '#2D6A4F'; borderColor = '#B7E4C7'; accentSymbol = '🌿'; break;
      case 'golden_hour': bgColor = '#FFF9EC'; headerColor = '#BC6C25'; borderColor = '#FDE2E4'; accentSymbol = '🌅'; break;
      case 'teddy_hug': bgColor = '#FAF0E6'; headerColor = '#8C6239'; borderColor = '#D4A373'; accentSymbol = '🧸'; break;
      case 'midnight_star': bgColor = '#101820'; headerColor = '#FEE715'; borderColor = '#303840'; accentSymbol = '🌙'; break;
      default: bgColor = '#FFFDF9'; headerColor = '#ff5c8a'; borderColor = '#ffb3c6'; accentSymbol = '✨';
    }

    ctxStrip.fillStyle = bgColor;
    ctxStrip.fillRect(0, 0, width, totalHeight);

    let startY = padding + headerH;
    if (hasCameraHeader) {
      ctxStrip.fillStyle = '#2b2b2b';
      ctxStrip.beginPath();
      ctxStrip.roundRect(width/2 - 110, padding + 10, 220, 110, 14);
      ctxStrip.fill();

      ctxStrip.fillStyle = '#1a1a1a';
      ctxStrip.beginPath();
      ctxStrip.arc(width/2, padding + 65, 36, 0, Math.PI * 2);
      ctxStrip.fill();
      ctxStrip.strokeStyle = '#d4af37';
      ctxStrip.lineWidth = 4;
      ctxStrip.stroke();

      ctxStrip.fillStyle = '#4a4a4a';
      ctxStrip.beginPath();
      ctxStrip.arc(width/2, padding + 65, 24, 0, Math.PI * 2);
      ctxStrip.fill();
    } else {
      ctxStrip.fillStyle = headerColor;
      ctxStrip.font = '700 28px "Fredoka", sans-serif';
      ctxStrip.textAlign = 'center';
      ctxStrip.fillText(`${accentSymbol} AURA STUDIO ${accentSymbol}`, width / 2, padding + 35);

      ctxStrip.fillStyle = headerColor;
      ctxStrip.font = '600 18px "Quicksand", sans-serif';
      ctxStrip.fillText(captionInput ? captionInput.value || '✨ BESTIES 2026 ✨' : '✨ BESTIES 2026 ✨', width / 2, padding + 70);
    }

    for (let i = 0; i < frameCount; i++) {
      const photoX = padding;
      const photoY = startY;

      if (capturedPhotos[i]) {
        const img = new Image();
        img.src = capturedPhotos[i];
        img.onload = () => {
          drawImageProp(ctxStrip, img, photoX, photoY, photoW, photoH);
          drawBorder(photoX, photoY, photoW, photoH, borderColor);
        };
        if (img.complete) {
          drawImageProp(ctxStrip, img, photoX, photoY, photoW, photoH);
          drawBorder(photoX, photoY, photoW, photoH, borderColor);
        }
      } else {
        ctxStrip.save();
        ctxStrip.beginPath();
        applyShapePath(ctxStrip, photoX, photoY, photoW, photoH);
        ctxStrip.clip();
        ctxStrip.fillStyle = (currentFrame === 'film_noir' || currentFrame === 'midnight_star') ? '#222' : '#ffeef2';
        ctxStrip.fillRect(photoX, photoY, photoW, photoH);
        ctxStrip.fillStyle = headerColor;
        ctxStrip.font = '600 22px "Fredoka", sans-serif';
        ctxStrip.textAlign = 'center';
        ctxStrip.fillText(`Pose ${i + 1} 📸`, photoX + photoW/2, photoY + photoH/2 + 8);
        ctxStrip.restore();
        drawBorder(photoX, photoY, photoW, photoH, borderColor);
      }

      startY += photoH + spacing;
    }

    ctxStrip.fillStyle = headerColor;
    ctxStrip.font = '600 14px "Quicksand", sans-serif';
    ctxStrip.textAlign = 'center';
    ctxStrip.fillText(`© 2026 Aura Studio • ${accentSymbol} Aesthetic Edition`, width / 2, totalHeight - padding + 25);
  }

  function drawBorder(x, y, w, h, color) {
    ctxStrip.strokeStyle = color;
    ctxStrip.lineWidth = 4;
    ctxStrip.beginPath();
    applyShapePath(ctxStrip, x, y, w, h);
    ctxStrip.stroke();
  }

  if (downloadBtn) {
    downloadBtn.addEventListener('click', () => {
      const link = document.createElement('a');
      link.download = `aura-studio-${Date.now()}.png`;
      link.href = stripCanvas.toDataURL('image/png');
      link.click();
    });
  }

  if (printBtn) {
    printBtn.addEventListener('click', () => {
      const dataUrl = stripCanvas.toDataURL('image/png');
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(`
          <html>
            <head><title>Print Photo Strip</title></head>
            <body style="text-align:center; background:#fff; margin:0; padding:20px;">
              <img src="${dataUrl}" style="max-height:95vh;" onload="window.print();window.close();"/>
            </body>
          </html>
        `);
        printWindow.document.close();
      }
    });
  }

  // Run initialization
  initCamera();
  updateStripPreview();
});