// Sets the date and time in LinkedIn's "Bijdrage inplannen" dialog. Pass the uids of the
// "Datum*" and "Tijd*" textboxes as arguments, and replace DATE (DD-MM-YYYY) before running.
async (d, t) => {
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  for (const [el, v] of [[d, 'DATE'], [t, '08:30']]) {
    el.focus(); set.call(el, v);
    el.dispatchEvent(new Event('input', {bubbles: true}));
    el.dispatchEvent(new Event('change', {bubbles: true}));
    el.blur(); el.dispatchEvent(new FocusEvent('focusout', {bubbles: true}));
    await new Promise(r => setTimeout(r, 400));
  }
  await new Promise(r => setTimeout(r, 400));
  const s = [...document.querySelectorAll('*')].find(e => e.children.length === 0 && /^Wordt geplaatst op/.test(e.textContent));
  return d.value + ' ' + t.value + ' | ' + (s && s.textContent); // must name the right day and 08:30
}
