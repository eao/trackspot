export function shouldReserveSidebarSpace({ sidebarCollapsed, reserveSidebarSpace }) {
  return !sidebarCollapsed || reserveSidebarSpace;
}

export function shouldAnimateGridSidebarToggle({ reserveSidebarSpace, cardCount }) {
  return cardCount > 0 && !reserveSidebarSpace;
}
