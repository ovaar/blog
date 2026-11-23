// Turns a blog post page into a 1200x1500 title card. Run with evaluate_script on the post page,
// with the viewport emulated at 1200x1500x1, dark colour scheme and reduced motion.
async () => {
  const s = document.createElement('style');
  s.textContent = `html,body{overflow:hidden!important}
  .site-nav,.head-tools,.crumbs,.meta,.progress{display:none!important}
  .site-head .page::after{content:"ovaar.github.io";letter-spacing:.1em;opacity:.6}
  .article-head{padding-top:64px!important;padding-bottom:24px!important}
  .article-art{max-width:none!important;margin-left:0!important;margin-right:0!important}
  .art--hero{width:100%!important;aspect-ratio:auto!important}`;
  document.head.appendChild(s);
  window.scrollTo(0, 0);
  const art = document.querySelector('.art--hero');
  const top = art.getBoundingClientRect().top;
  art.style.setProperty('height', (1500 - top - 56) + 'px', 'important');
  window.dispatchEvent(new Event('resize')); // the canvas sizes itself on resize
  await new Promise(r => setTimeout(r, 800));
  const b = art.getBoundingClientRect();
  return [Math.round(b.left), Math.round(b.right), Math.round(b.top), Math.round(b.bottom)]; // expect [40, 1160, ~500-620, 1444]
}
