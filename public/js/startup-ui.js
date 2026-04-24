export function revealSidebarForStartup(sidebar, options = {}) {
  const {
    body = document.body,
    scheduleFrame = cb => requestAnimationFrame(cb),
  } = options;

  if (!sidebar) return Promise.resolve(false);

  if (body.classList.contains('sidebar-collapsed')) {
    sidebar.classList.remove('startup-hidden');
    sidebar.style.visibility = '';
    return Promise.resolve(false);
  }

  sidebar.classList.add('startup-hidden');

  return new Promise(resolve => {
    scheduleFrame(() => {
      sidebar.style.visibility = '';
      sidebar.classList.remove('startup-hidden');
      sidebar.classList.add('slide-in');
      sidebar.addEventListener('animationend', () => {
        sidebar.classList.remove('slide-in');
      }, { once: true });
      resolve(true);
    });
  });
}
