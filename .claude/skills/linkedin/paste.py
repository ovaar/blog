"""Print the evaluate_script function that pastes a LinkedIn post into the composer.

Usage: python3 -I paste.py social/linkedin/<date>-<slug>.md
Pass the uid of the "Geef uw mening..." textbox as the script's argument. It returns "exact"
when every paragraph and blank line arrived.
"""
import json
import sys

text = open(sys.argv[1], encoding="utf-8").read().split("+++", 2)[2].strip()
paras = text.split("\n\n")
print("""async (ed) => {
  const paras = %s;
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const enter = async () => { ed.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true})); await wait(80); };
  ed.focus();
  for (let i = 0; i < paras.length; i++) {
    const dt = new DataTransfer(); dt.setData('text/plain', paras[i]);
    ed.dispatchEvent(new ClipboardEvent('paste', {clipboardData: dt, bubbles: true, cancelable: true}));
    await wait(150);
    if (i < paras.length - 1) { await enter(); await enter(); }
  }
  const ps = [...ed.querySelectorAll('p')].map(p => p.innerText.replace(/\\n$/, ''));
  const want = paras.join('\\n\\n').split('\\n');
  return JSON.stringify(ps) === JSON.stringify(want) ? 'exact' : JSON.stringify({ps, want});
}""" % json.dumps(paras))
