import { defineBoot } from "#q-app/wrappers";

function isEditable(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.closest) return false;
  return Boolean(el.closest("input, textarea, [contenteditable='true']"));
}

export default defineBoot(() => {
  document.addEventListener(
    "contextmenu",
    (event) => {
      if (isEditable(event.target)) return;
      event.preventDefault();
    },
    { capture: true },
  );

  document.addEventListener("dragstart", (event) => {
    const el = event.target as HTMLElement | null;
    if (el && el.tagName === "IMG") event.preventDefault();
  });

  // Ensure window scroll stays at 0, preventing mobile viewport shifts/pans
  const resetScroll = () => {
    if (window.scrollX !== 0 || window.scrollY !== 0) {
      window.scrollTo(0, 0);
    }
  };

  document.addEventListener("focusout", (e) => {
    if (isEditable(e.target)) {
      requestAnimationFrame(resetScroll);
      setTimeout(resetScroll, 100);
      setTimeout(resetScroll, 300);
    }
  });

  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", () => {
      requestAnimationFrame(resetScroll);
    });
  }
});
