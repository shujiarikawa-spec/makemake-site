(() => {
  const board = document.querySelector('.case-timeline-board');
  const grid = document.querySelector('.case-timeline-grid');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  if (!board || !grid) return;

  const cells = document.createDocumentFragment();
  for (let index = 0; index < 13 * 8; index += 1) {
    const cell = document.createElement('span');
    cell.className = 'case-timeline-cell';
    cell.style.setProperty('--cell-index', index);
    cells.appendChild(cell);
  }
  grid.appendChild(cells);

  if (reducedMotion.matches) return;

  const cycleLength = 5100;
  let cycleTimer = 0;

  const stop = () => {
    clearTimeout(cycleTimer);
    board.classList.remove('is-playing');
  };

  const play = () => {
    board.classList.remove('is-playing');
    board.classList.add('is-resetting');
    void grid.offsetWidth;
    board.classList.remove('is-resetting');
    board.classList.add('is-playing');
    cycleTimer = window.setTimeout(play, cycleLength);
  };

  new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting) play();
    else stop();
  }, { threshold: 0.15 }).observe(board);
})();
