(() => {
  const section = document.querySelector('[data-final-reveal]');
  const panel = section?.querySelector('.final-panel');
  const title = section?.querySelector('.final-title');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

  if (!section) return;

  const clamp = (value) => Math.min(1, Math.max(0, value));
  const smoothStep = (value) => value * value * (3 - 2 * value);

  const render = (progress) => {
    const eased = smoothStep(progress);
    // Halve the current fade amount at the midpoint while still reaching full opacity
    // exactly at the end of the scroll range.
    const panelFade = Math.pow(eased, 2.415);
    const ctaProgress = clamp((eased - 0.62) / 0.24);

    section.style.setProperty('--final-panel-x', `${(1 - eased) * 100}%`);
    section.style.setProperty('--final-panel-opacity', String(panelFade));
    section.style.setProperty('--final-title-x', `${(1 - eased) * -38}vw`);
    section.style.setProperty('--final-title-opacity', String(clamp(eased * 1.45)));

    // Reveal the white title copy only where the actual blue panel overlaps it.
    const panelLeft = panel.getBoundingClientRect().left;
    const titleRect = title.getBoundingClientRect();
    const inverseStart = titleRect.width
      ? clamp((panelLeft - titleRect.left) / titleRect.width) * 100
      : 100;
    section.style.setProperty('--final-inverse-left', `${inverseStart}%`);
    section.style.setProperty('--final-cta-opacity', String(ctaProgress));
    section.style.setProperty('--final-cta-y', `${(1 - ctaProgress) * 16}px`);
  };

  if (reducedMotion.matches) {
    render(1);
    return;
  }

  let pending = false;
  const update = () => {
    pending = false;
    const progress = clamp((window.innerHeight - section.getBoundingClientRect().top) / section.offsetHeight);
    render(progress);
  };
  const requestUpdate = () => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(update);
  };

  addEventListener('scroll', requestUpdate, { passive: true });
  addEventListener('resize', requestUpdate);
  requestUpdate();
})();
