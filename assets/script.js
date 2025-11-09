// Theme toggle (respects saved preference or system default)
(function themeInit() {
  const saved = localStorage.getItem('theme');
  if (saved === 'light' || saved === 'dark') {
    document.documentElement.setAttribute('data-theme', saved);
  } else {
    // default to system
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      document.documentElement.setAttribute('data-theme', 'dark');
    }
  }
})();

document.addEventListener('DOMContentLoaded', () => {
  const navToggle = document.getElementById('navToggle');
  const sidebar = document.getElementById('sidebar');
  const themeToggle = document.getElementById('themeToggle');
  const searchInput = document.getElementById('searchInput');
  const searchResults = document.getElementById('searchResults');

  // Mobile sidebar toggle
  if (navToggle && sidebar) {
    navToggle.addEventListener('click', () => {
      const open = sidebar.classList.toggle('is-open');
      navToggle.setAttribute('aria-expanded', String(open));
    });
  }

  // Theme toggle
  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme');
      const next = current === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('theme', next);
    });
  }

  // Copy buttons in code blocks
  document.querySelectorAll('[data-copy]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const wrapper = btn.closest('.codeblock');
      const code = wrapper?.querySelector('pre > code');
      if (!code) return;
      const text = code.innerText;
      try {
        await navigator.clipboard.writeText(text);
        const original = btn.textContent;
        btn.textContent = 'Copied!';
        setTimeout(() => (btn.textContent = original), 1200);
      } catch (e) {
        // Fallback
        const ta = document.createElement('textarea');
        ta.value = text; document.body.appendChild(ta); ta.select();
        document.execCommand('copy'); document.body.removeChild(ta);
      }
    });
  });

  // Simple scrollspy for TOC
  const headings = Array.from(document.querySelectorAll('.content h2'));
  const tocLinks = Array.from(document.querySelectorAll('.toc__link'));
  const byId = new Map(tocLinks.map((a) => [a.getAttribute('href')?.slice(1), a]));
  const onScroll = () => {
    const y = window.scrollY + 100; // offset for topbar
    let currentId = headings[0]?.id;
    for (const h of headings) {
      if (h.getBoundingClientRect().top + window.scrollY - 120 <= y) {
        currentId = h.id;
      } else {
        break;
      }
    }
    tocLinks.forEach((a) => a.classList.remove('active'));
    const active = byId.get(currentId);
    if (active) active.classList.add('active');
  };
  if (headings.length && tocLinks.length) {
    document.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  // Search suggestions via mock API
  let timer;
  async function runSearch(q) {
    try {
      const resp = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      if (!resp.ok) throw new Error('search failed');
      const data = await resp.json();
      renderResults(data.results || []);
    } catch (e) {
      renderResults([]);
    }
  }
  function renderResults(items) {
    if (!searchResults) return;
    if (!items.length) {
      searchResults.hidden = true;
      searchResults.innerHTML = '';
      return;
    }
    searchResults.innerHTML = items.map((it, i) => `
      <div class="search-result" role="option" data-path="${it.path}">
        <span class="search-result__title">${escapeHtml(it.title)}</span>
        <span class="search-result__snippet">${escapeHtml(it.snippet)}</span>
      </div>
    `).join('');
    searchResults.hidden = false;
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
  }
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const q = e.target.value.trim();
      if (timer) clearTimeout(timer);
      if (q.length < 2) {
        renderResults([]);
        return;
      }
      timer = setTimeout(() => runSearch(q), 200);
    });
    document.addEventListener('click', (e) => {
      if (!searchResults || searchResults.hidden) return;
      if (searchResults.contains(e.target)) {
        const item = e.target.closest('.search-result');
        if (item) {
          const p = item.getAttribute('data-path') || '#';
          renderResults([]);
          if (p.startsWith('#')) {
            const el = document.querySelector(p);
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
          } else {
            location.href = p;
          }
        }
      } else if (!searchInput.contains(e.target)) {
        renderResults([]);
      }
    });
  }
});
