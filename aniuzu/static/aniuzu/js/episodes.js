/* ============================================================
   ANIUZU — shared episode browser
   Compact, searchable, paginated grid used by BOTH the detail
   page (links to /watch/) and the watch page (in-place switching).
   Built for catalogs with 1000+ episodes: only `pageSize` chips
   exist in the DOM at any time, so huge lists stay fast.
   Episode data always comes from Anikoto via the server.
   ============================================================ */

(function () {
  'use strict';

  var DEFAULT_PAGE_SIZE = 100;

  function create(options) {
    var opts = options || {};
    var root = opts.container;
    if (!root || !Array.isArray(opts.episodes)) return null;

    var pageSize = opts.pageSize > 0 ? opts.pageSize : DEFAULT_PAGE_SIZE;
    var onSelect = typeof opts.onSelect === 'function' ? opts.onSelect : function () {};
    var watched = opts.watched || {};

    // Internal view of Anikoto records: {n, sub, dub} — two payload shapes
    // are accepted (detail: s/d flags, watch: full URLs).
    var episodes = opts.episodes.map(function (raw) {
      return {
        n: raw.n,
        sub: ('s' in raw) ? !!raw.s : !!raw.sub,
        dub: ('d' in raw) ? !!raw.d : !!raw.dub,
        raw: raw
      };
    });

    var searchInput = opts.searchInput || null;
    var prevBtn = null;
    var nextBtn = null;
    var pageInfo = null;
    var grid = null;
    var emptyNote = null;

    var state = { query: '', page: 0 };

    function buildSkeleton() {
      root.classList.add('az-ep-browser');
      root.innerHTML = '';

      if (!searchInput) {
        var toolbarTop = document.createElement('div');
        toolbarTop.className = 'az-ep-toolbar';
        searchInput = document.createElement('input');
        searchInput.type = 'search';
        searchInput.className = 'az-ep-search';
        searchInput.placeholder = 'Search episode…';
        searchInput.setAttribute('aria-label', 'Find episode');
        toolbarTop.appendChild(searchInput);
        root.appendChild(toolbarTop);
      }

      grid = document.createElement('div');
      grid.className = 'az-episodes-scroll';
      grid.setAttribute('tabindex', '0');
      grid.setAttribute('aria-label', 'Episode list');
      root.appendChild(grid);

      var pager = document.createElement('div');
      pager.className = 'az-ep-pager';
      prevBtn = document.createElement('button');
      prevBtn.type = 'button';
      prevBtn.className = 'az-nav-btn az-ep-pager-btn';
      prevBtn.textContent = '← Prev';
      pageInfo = document.createElement('span');
      pageInfo.className = 'az-ep-pageinfo';
      nextBtn = document.createElement('button');
      nextBtn.type = 'button';
      nextBtn.className = 'az-nav-btn az-ep-pager-btn';
      nextBtn.textContent = 'Next →';
      pager.appendChild(prevBtn);
      pager.appendChild(pageInfo);
      pager.appendChild(nextBtn);
      root.appendChild(pager);

      emptyNote = document.createElement('p');
      emptyNote.className = 'az-ep-empty';
      emptyNote.hidden = true;
      emptyNote.textContent = 'No episode matches your search.';
      root.appendChild(emptyNote);

      prevBtn.addEventListener('click', function () { goToPage(state.page - 1); });
      nextBtn.addEventListener('click', function () { goToPage(state.page + 1); });

      var debounce;
      searchInput.addEventListener('input', function () {
        clearTimeout(debounce);
        debounce = setTimeout(function () {
          state.query = searchInput.value.trim();
          state.page = 0;
          render();
        }, 120);
      });
      searchInput.addEventListener('keydown', function (ev) {
        if (ev.key !== 'Enter') return;
        ev.preventDefault();
        // Enter jumps straight to an exact match when one exists.
        var wanted = Number(state.query);
        if (!state.query || isNaN(wanted)) return;
        var hit = episodes.filter(function (e) { return e.n === wanted; })[0];
        if (hit) onSelect(hit.raw);
      });
    }

    function filtered() {
      var q = state.query.replace(/^0+/, '');
      if (!q) return episodes.slice();
      return episodes.filter(function (episode) {
        return String(episode.n).indexOf(q) !== -1;
      });
    }

    function pageCount(list) {
      return Math.max(1, Math.ceil(list.length / pageSize));
    }

    function goToPage(page) {
      var total = pageCount(filtered());
      state.page = Math.min(total - 1, Math.max(0, page));
      render();
    }

    function chip(episode) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'az-ep-btn';
      btn.dataset.episode = String(episode.n);
      btn.textContent = String(episode.n);
      var langs = [];
      if (episode.sub) langs.push('SUB');
      if (episode.dub) langs.push('DUB');
      btn.title = 'Episode ' + episode.n +
        (langs.length ? ' (' + langs.join('/') + ')' : '') +
        (watched[episode.n] ? ' — watched' : '');
      if (watched[episode.n]) btn.classList.add('watched');
      if (opts.activeNumber !== undefined && Number(opts.activeNumber) === Number(episode.n)) {
        btn.classList.add('active');
      }
      btn.addEventListener('click', function () { onSelect(episode.raw); });
      return btn;
    }

    function render() {
      if (!grid) return;
      var list = filtered();
      var total = pageCount(list);
      if (state.page >= total) state.page = total - 1;

      grid.innerHTML = '';
      var start = state.page * pageSize;
      var end = Math.min(list.length, start + pageSize);
      var fragment = document.createDocumentFragment();
      for (var i = start; i < end; i++) fragment.appendChild(chip(list[i]));
      grid.appendChild(fragment);

      emptyNote.hidden = list.length > 0;

      var multiPage = list.length > pageSize;
      prevBtn.parentNode.hidden = !multiPage;
      if (multiPage) {
        pageInfo.textContent = 'Page ' + (state.page + 1) + ' / ' + total +
          ' · ' + list.length + ' ep';
        prevBtn.disabled = state.page === 0;
        nextBtn.disabled = state.page >= total - 1;
      }
    }

    function setActive(number) {
      opts.activeNumber = number;
      // Ensure the active chip's page is visible, then re-render.
      var index = -1;
      for (var i = 0; i < episodes.length; i++) {
        if (Number(episodes[i].n) === Number(number)) { index = i; break; }
      }
      if (index >= 0 && !state.query) state.page = Math.floor(index / pageSize);
      render();
      highlightAndReveal(number);
    }

    function highlightAndReveal(number) {
      var target = grid.querySelector('.az-ep-btn.active');
      if (target && target.scrollIntoView) {
        target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }
    }

    buildSkeleton();
    if (opts.activeNumber !== undefined) setActive(opts.activeNumber);
    else render();

    return {
      setActive: setActive,
      refresh: render,
      goToPage: goToPage,
      setWatched: function (map) { watched = map || {}; render(); }
    };
  }

  window.AniuzuEpisodes = { create: create };
})();
