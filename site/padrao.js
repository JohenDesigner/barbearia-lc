/* Movimento suave do padrão da marca conforme a rolagem */
(() => {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  let pend = false;
  const aplicar = () => { pend = false; document.documentElement.style.setProperty("--padrao-y", (scrollY * 0.06).toFixed(1)); };
  addEventListener("scroll", () => { if (!pend) { pend = true; requestAnimationFrame(aplicar); } }, { passive: true });
  aplicar();
})();
