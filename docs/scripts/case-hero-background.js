(() => {
  const hero = document.querySelector('.hero');
  const canvas = hero?.querySelector('[data-case-hero-wave]');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

  if (!hero || !canvas || reducedMotion.matches) return;

  const context = canvas.getContext('2d', { alpha: true });
  let width = 0;
  let height = 0;
  let pixelRatio = 1;
  let frameId = 0;
  let isRunning = false;

  const resize = () => {
    const bounds = hero.getBoundingClientRect();
    width = Math.max(1, bounds.width);
    height = Math.max(1, bounds.height);
    pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(width * pixelRatio);
    canvas.height = Math.round(height * pixelRatio);
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  };

  const drawGlow = (x, y, radius, color) => {
    const glow = context.createRadialGradient(x, y, 0, x, y, radius);
    glow.addColorStop(0, color);
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    context.fillStyle = glow;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
  };

  const drawWave = (line, time) => {
    const baseY = height * (0.2 + line * 0.065);
    const amplitude = height * (0.055 + line * 0.0025);
    const drift = time * (0.00017 + line * 0.000012);

    context.beginPath();
    for (let x = -20; x <= width + 20; x += 9) {
      const y = baseY
        + Math.sin(x * 0.008 + drift * 2.1 + line * 0.87) * amplitude
        + Math.sin(x * 0.018 - drift * 3.2 + line * 1.7) * amplitude * 0.42
        + Math.sin(x * 0.003 + drift * 0.72) * amplitude * 0.68;
      if (x < 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.strokeStyle = line === 8 ? 'rgba(200,77,32,.32)' : `rgba(218,232,255,${0.12 + line * 0.026})`;
    context.lineWidth = line === 8 ? 1.1 : 0.45 + line * 0.07;
    context.stroke();
  };

  const render = (time) => {
    if (!isRunning) return;

    context.clearRect(0, 0, width, height);
    context.globalCompositeOperation = 'screen';
    drawGlow(width * (0.7 + Math.sin(time / 5200) * 0.08), height * 0.28, width * 0.3, 'rgba(145,181,255,.28)');
    drawGlow(width * (0.5 + Math.cos(time / 7600) * 0.09), height * 0.75, width * 0.24, 'rgba(49,101,220,.26)');
    for (let line = 0; line < 10; line += 1) drawWave(line, time);
    context.globalCompositeOperation = 'source-over';
    frameId = requestAnimationFrame(render);
  };

  const start = () => {
    if (isRunning) return;
    isRunning = true;
    frameId = requestAnimationFrame(render);
  };

  const stop = () => {
    isRunning = false;
    cancelAnimationFrame(frameId);
  };

  resize();
  new ResizeObserver(resize).observe(hero);
  new IntersectionObserver(([entry]) => (entry.isIntersecting ? start() : stop()), { threshold: 0 }).observe(hero);
})();
