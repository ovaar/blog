(function () {
  var root = document.documentElement;

  /* Theme toggle */
  var themeBtn = document.getElementById('theme-toggle');
  if (themeBtn) {
    var sync = function () {
      var dark = root.getAttribute('data-theme') === 'dark';
      themeBtn.setAttribute('aria-pressed', dark ? 'true' : 'false');
      themeBtn.setAttribute('title', dark ? 'Switch to light mode' : 'Switch to dark mode');
    };
    themeBtn.addEventListener('click', function () {
      var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      try { localStorage.setItem('theme', next); } catch (e) {}
      sync();
    });
    sync();
  }

  /* Mobile menu */
  var menuBtn = document.getElementById('menu-toggle');
  var nav = document.getElementById('site-nav');
  if (menuBtn && nav) {
    var setOpen = function (open) {
      nav.classList.toggle('is-open', open);
      menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    };
    menuBtn.addEventListener('click', function () {
      setOpen(menuBtn.getAttribute('aria-expanded') !== 'true');
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && nav.classList.contains('is-open')) { setOpen(false); menuBtn.focus(); }
    });
  }

  /* Reading progress */
  var bar = document.querySelector('.progress span');
  var article = document.querySelector('.prose');
  if (bar && article) {
    var queued = false;
    var update = function () {
      queued = false;
      var rect = article.getBoundingClientRect();
      var total = rect.height - window.innerHeight * 0.6;
      var p = total > 0 ? Math.min(1, Math.max(0, -rect.top / total)) : 1;
      bar.style.transform = 'scaleX(' + p + ')';
    };
    window.addEventListener('scroll', function () {
      if (!queued) { queued = true; requestAnimationFrame(update); }
    }, { passive: true });
    update();
  }

  /* Table of contents: open on wide screens, track the current section */
  var toc = document.querySelector('.toc');
  if (toc) {
    var wide = window.matchMedia('(min-width: 1100px)');
    toc.open = wide.matches;
    var links = {};
    toc.querySelectorAll('a[href^="#"]').forEach(function (a) {
      links[decodeURIComponent(a.getAttribute('href').slice(1))] = a;
    });
    var heads = Array.prototype.filter.call(
      document.querySelectorAll('.prose h1[id], .prose h2[id], .prose h3[id]'),
      function (h) { return links[h.id]; }
    );
    if (heads.length && 'IntersectionObserver' in window) {
      var current = null;
      var io = new IntersectionObserver(function () {
        var active = heads[0];
        for (var i = 0; i < heads.length; i++) {
          if (heads[i].getBoundingClientRect().top < window.innerHeight * 0.3) active = heads[i];
        }
        if (current) current.removeAttribute('aria-current');
        current = links[active.id];
        current.setAttribute('aria-current', 'true');
      }, { rootMargin: '0px 0px -70% 0px' });
      heads.forEach(function (h) { io.observe(h); });
    }
  }

  /* Code blocks: language label and copy button */
  document.querySelectorAll('.prose .highlight, .prose > pre').forEach(function (block) {
    var code = block.querySelector('code');
    if (!code) return;
    if (block.tagName === 'PRE') {
      var wrap = document.createElement('div');
      wrap.className = 'highlight';
      block.parentNode.insertBefore(wrap, block);
      wrap.appendChild(block);
      block = wrap;
    }
    var lang = code.getAttribute('data-lang') || '';
    var head = document.createElement('div');
    head.className = 'code-head';
    var label = document.createElement('span');
    label.textContent = lang || 'text';
    head.appendChild(label);
    if (navigator.clipboard) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = 'Copy';
      btn.setAttribute('aria-label', 'Copy ' + (lang || 'code') + ' to clipboard');
      btn.addEventListener('click', function () {
        navigator.clipboard.writeText(code.innerText).then(function () {
          btn.textContent = 'Copied';
          setTimeout(function () { btn.textContent = 'Copy'; }, 1600);
        });
      });
      head.appendChild(btn);
    }
    block.classList.add('has-head');
    block.insertBefore(head, block.firstChild);
  });
})();
