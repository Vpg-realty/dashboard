// onKeyDown for a search box: Esc empties it first (and goes no further, so a
// panel or menu around it doesn't close at the same time).
export const escClears = (value, onClear) => (e) => {
  if (e.key === 'Escape' && value) { e.preventDefault(); e.stopPropagation(); onClear(); }
};
