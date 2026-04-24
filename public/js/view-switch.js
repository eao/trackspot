export function shouldHideSidebarImmediatelyOnViewSwitch({
  previousView,
  nextView,
  wasSidebarCollapsed,
  nextSidebarCollapsed,
}) {
  return (
    previousView === 'list'
    && nextView === 'grid'
    && wasSidebarCollapsed === false
    && nextSidebarCollapsed === true
  ) || (
    previousView === 'grid'
    && nextView === 'list'
    && wasSidebarCollapsed === true
    && nextSidebarCollapsed === false
  );
}
