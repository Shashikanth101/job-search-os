import { useEffect, useRef } from 'react';

/**
 * Keyboard shortcuts for the jobs view: ArrowDown / ArrowUp move the selection, a applies, s saves, x skips, / focuses the
 * search box. Ignored while typing in a field (or choosing in a select) and when a modifier key is held; Escape (anywhere) closes the detail drawer.
 * @param {object} handlers
 * @param {() => void} handlers.onNext - ArrowDown
 * @param {() => void} handlers.onPrevious - ArrowUp
 * @param {() => void} handlers.onApply - a
 * @param {() => void} handlers.onSave - s
 * @param {() => void} handlers.onSkip - x
 * @param {() => void} handlers.onSearch - /
 * @param {() => void} handlers.onClose - Escape
 */
export function useReviewShortcuts(handlers) {
  const latest = useRef(handlers);
  latest.current = handlers;

  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === 'Escape') { latest.current.onClose(); return; }
      if (event.metaKey || event.ctrlKey || event.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(event.target?.tagName) || event.target?.isContentEditable) return;
      const { onNext, onPrevious, onApply, onSave, onSkip, onSearch } = latest.current;
      const action = { ArrowDown: onNext, ArrowUp: onPrevious, a: onApply, s: onSave, x: onSkip, '/': onSearch }[event.key];
      if (!action) return;
      event.preventDefault();
      action();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
