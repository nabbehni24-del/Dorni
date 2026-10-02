// A second QR may navigate only the fragment while React remains mounted.
// Reload through the original capture path: never retain/reuse the old journey.
export function watchActivationFragment(target: Pick<Window, 'location' | 'addEventListener' | 'removeEventListener'>) {
  const changed = () => { if (target.location.hash) target.location.reload(); };
  target.addEventListener('hashchange', changed);
  return () => target.removeEventListener('hashchange', changed);
}
