/* ============================================================
   ANIUZU — watch page
   Player state, provider switching, postMessage events,
   localStorage progress, resume + auto-next scaffolding.
   Provider metadata is injected from the server (single source
   of truth: aniuzu/providers.py) via #az-watch-data.
   ============================================================ */

(function () {
  'use strict';

  var dataEl = document.getElementById('az-watch-data');
  if (!dataEl) return;

  var CFG;
  try {
    CFG = JSON.parse(dataEl.textContent);
  } catch (err) {
    return;
  }

  var AUTO_NEXT_ENABLED = false; // flip later to enable automatic switching
  var LOAD_TIMEOUT_MS = 25000;   // give slow providers a fair chance
  var SAVE_INTERVAL_MS = 10000;
  var RESUME_MIN_PERCENT = 1.5;  // ignore trivial progress
  var RESUME_MAX_PERCENT = 93;   // near-finished counts as "done", not resume
  var RESUME_MIN_SECONDS = 20;
  var WATCHED_PERCENT = 85;

  var PREFS_KEY = 'aniuzu:watch-prefs';
  var progressKey = function (animeId, episode) {
    return 'aniuzu:anime:' + animeId + ':episode:' + episode;
  };

  // ------------------------------------------------------------
  // Progress storage abstraction (localStorage today, swappable
  // for an API/database later — the rest of the code only calls
  // these four functions).
  // ------------------------------------------------------------

  function saveWatchProgress(animeId, episode, currentTime, duration) {
    if (!duration || duration <= 0 || currentTime <= 0) return;
    var percent = Math.min(100, (currentTime / duration) * 100);
    try {
      localStorage.setItem(progressKey(animeId, episode), JSON.stringify({
        currentTime: currentTime,
        duration: duration,
        percent: percent,
        updatedAt: Date.now()
      }));
    } catch (err) { /* storage full/unavailable — non-fatal */ }
  }

  function getWatchProgress(animeId, episode) {
    try {
      var raw = localStorage.getItem(progressKey(animeId, episode));
      if (!raw) return null;
      var data = JSON.parse(raw);
      if (!data || typeof data.currentTime !== 'number' || typeof data.duration !== 'number') {
        return null;
      }
      return data;
    } catch (err) {
      return null;
    }
  }

  function getResumeTime(animeId, episode) {
    var saved = getWatchProgress(animeId, episode);
    if (!saved) return null;
    if (saved.currentTime < RESUME_MIN_SECONDS) return null;
    if (!saved.duration) return null;
    var percent = (saved.currentTime / saved.duration) * 100;
    if (percent < RESUME_MIN_PERCENT || percent > RESUME_MAX_PERCENT) return null;
    return saved.currentTime;
  }

  function clearWatchProgress(animeId, episode) {
    try {
      localStorage.removeItem(progressKey(animeId, episode));
    } catch (err) { /* ignore */ }
  }

  function watchedEpisodes(animeId, total) {
    var watched = {};
    try {
      for (var ep = 1; ep <= total; ep++) {
        var saved = getWatchProgress(animeId, ep);
        if (saved && saved.duration && (saved.currentTime / saved.duration) * 100 >= WATCHED_PERCENT) {
          watched[ep] = true;
        }
      }
    } catch (err) { /* ignore */ }
    return watched;
  }

  // ------------------------------------------------------------
  // Providers / URL building
  // ------------------------------------------------------------

  var providerList = Array.isArray(CFG.providers) ? CFG.providers : [];
  var providersByKey = {};
  providerList.forEach(function (p) { providersByKey[p.key] = p; });

  function findProvider(key) {
    return providersByKey[key] || null;
  }

  function supportsLanguage(provider, language) {
    return !!(provider && provider.supportedLanguages.indexOf(language) !== -1);
  }

  // The only place player URLs are built on the client.
  function buildProviderUrl(providerKey, anilistId, episode, language) {
    var provider = findProvider(providerKey);
    if (!provider) return null;
    if (!supportsLanguage(provider, language)) return null;
    return provider.urlTemplate
      .replace('{anilist_id}', encodeURIComponent(anilistId))
      .replace('{episode}', encodeURIComponent(episode))
      .replace('{language}', encodeURIComponent(language));
  }

  function closestLanguage(providerKey, wanted) {
    var provider = findProvider(providerKey);
    if (provider && provider.supportedLanguages.indexOf(wanted) !== -1) return wanted;
    if (provider && provider.supportedLanguages.length) return provider.supportedLanguages[0];
    return 'sub';
  }

  // ------------------------------------------------------------
  // State
  // ------------------------------------------------------------

  var prefs = loadPrefs();
  var initialProvider = pickInitialProvider();
  var state = {
    provider: initialProvider,
    language: closestLanguage(initialProvider, prefs.language || CFG.defaultLanguage || 'sub'),
    episode: CFG.episode,
    totalEpisodes: CFG.totalEpisodes,
    loading: false,
    error: false,
    resumePrompted: false,
    completeShown: false,
    lastSavedAt: 0,
    lastEvent: null // most recent raw event values, used for throttled saves
  };

  function loadPrefs() {
    try {
      return JSON.parse(localStorage.getItem(PREFS_KEY)) || {};
    } catch (err) {
      return {};
    }
  }

  function savePrefs() {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({
        provider: state.provider,
        language: state.language
      }));
    } catch (err) { /* ignore */ }
  }

  function pickInitialProvider() {
    var wanted = prefs.provider;
    if (findProvider(wanted)) return wanted;
    return findProvider(CFG.defaultProvider) ? CFG.defaultProvider : (providerList[0] || {}).key;
  }

  // ------------------------------------------------------------
  // Elements
  // ------------------------------------------------------------

  var el = {
    frame: document.getElementById('az-player-frame'),
    loading: document.getElementById('az-loading'),
    loadingLabel: document.getElementById('az-loading-label'),
    error: document.getElementById('az-error'),
    errorServers: document.getElementById('az-error-servers'),
    resume: document.getElementById('az-resume'),
    resumeTime: document.getElementById('az-resume-time'),
    resumeYes: document.getElementById('az-resume-yes'),
    resumeNo: document.getElementById('az-resume-no'),
    complete: document.getElementById('az-complete'),
    nextFromComplete: document.getElementById('az-next-from-complete'),
    completeDismiss: document.getElementById('az-complete-dismiss'),
    servers: document.getElementById('az-servers'),
    languages: document.getElementById('az-languages'),
    prev: document.getElementById('az-prev'),
    next: document.getElementById('az-next'),
    navEpisode: document.getElementById('az-nav-episode'),
    currentEpisodeLabel: document.getElementById('az-current-episode'),
    episodes: document.getElementById('az-episodes'),
    epSearch: document.getElementById('az-ep-search')
  };
  if (!el.frame) return;

  var iframe = null;
  var loadTimer = null;

  function devLog() {
    if (CFG.debug && window.console && console.log) {
      console.log.apply(console, ['[aniuzu]'].concat([].slice.call(arguments)));
    }
  }

  function formatTime(seconds) {
    seconds = Math.max(0, Math.floor(seconds || 0));
    var h = Math.floor(seconds / 3600);
    var m = Math.floor((seconds % 3600) / 60);
    var s = seconds % 60;
    var mm = (h > 0 ? String(m).padStart(2, '0') : String(m));
    return (h > 0 ? h + ':' : '') + mm + ':' + String(s).padStart(2, '0');
  }

  function maxEpisode() {
    return state.totalEpisodes || null;
  }

  function hasNext() {
    return maxEpisode() === null || state.episode < maxEpisode();
  }
  function hasPrev() {
    return state.episode > 1;
  }

  // ------------------------------------------------------------
  // Overlays
  // loading/error = full stage states (mutually exclusive);
  // resume/complete = small cards that don't block the player.
  // ------------------------------------------------------------

  function setStage(name) {
    ['loading', 'error'].forEach(function (key) {
      if (el[key]) el[key].hidden = key !== name;
    });
  }

  function setCard(name) {
    ['resume', 'complete'].forEach(function (key) {
      if (el[key]) el[key].hidden = key !== name;
    });
  }

  function hideOverlays() {
    setStage(null);
    setCard(null);
  }

  // ------------------------------------------------------------
  // Iframe lifecycle
  // ------------------------------------------------------------

  function mountIframe(url) {
    if (loadTimer) { clearTimeout(loadTimer); loadTimer = null; }
    if (iframe && iframe.parentNode) iframe.parentNode.removeChild(iframe);

    iframe = document.createElement('iframe');
    iframe.className = 'az-player-iframe';
    iframe.title = 'Episode player';
    iframe.setAttribute('allow', 'autoplay; fullscreen; encrypted-media; picture-in-picture');
    iframe.setAttribute('referrerpolicy', 'origin');
    iframe.src = url;
    el.frame.appendChild(iframe);

    state.loading = true;
    state.error = false;
    state.completeShown = false;
    state.lastEvent = null;
    setStage('loading');

    iframe.addEventListener('load', function () {
      // Fires when the provider page itself finishes loading (success or
      // its own error page — we can't inspect cross-origin content).
      if (iframe && iframe.src === url) markLoaded();
    });

    loadTimer = setTimeout(function () {
      if (state.loading) failPlayback('timeout');
    }, LOAD_TIMEOUT_MS);
  }

  function markLoaded() {
    if (loadTimer) { clearTimeout(loadTimer); loadTimer = null; }
    state.loading = false;
    setStage(null);
  }

  function failPlayback(reason) {
    devLog('playback failed:', reason);
    state.loading = false;
    state.error = true;
    renderErrorServers();
    setCard(null);
    setStage('error');
  }

  function maybeOfferResume() {
    // Offered once per page load (when an episode opens), regardless of
    // whether the provider has reported progress yet — providers may be
    // slow or silent, and the card must not depend on them.
    if (state.resumePrompted) return;
    state.resumePrompted = true;
    var resumeAt = getResumeTime(CFG.anilistId, state.episode);
    if (resumeAt === null) return;
    if (el.resumeTime) el.resumeTime.textContent = formatTime(resumeAt);
    setCard('resume');
  }

  // ------------------------------------------------------------
  // Rendering: selectors, navigation, episodes
  // ------------------------------------------------------------

  function renderServers() {
    if (!el.servers) return;
    el.servers.innerHTML = '';
    providerList.forEach(function (provider) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'az-seg' + (provider.key === state.provider ? ' active' : '');
      btn.setAttribute('role', 'tab');
      btn.setAttribute('aria-selected', provider.key === state.provider ? 'true' : 'false');
      btn.textContent = provider.displayName;
      btn.addEventListener('click', function () { selectServer(provider.key); });
      el.servers.appendChild(btn);
    });
  }

  function renderLanguages() {
    if (!el.languages) return;
    var current = findProvider(state.provider);
    // Union of every language any provider can serve.
    var union = [];
    providerList.forEach(function (p) {
      p.supportedLanguages.forEach(function (lang) {
        if (union.indexOf(lang) === -1) union.push(lang);
      });
    });

    el.languages.innerHTML = '';
    union.forEach(function (lang) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'az-seg az-seg-lang' + (lang === state.language ? ' active' : '');
      btn.setAttribute('role', 'tab');
      btn.setAttribute('aria-selected', lang === state.language ? 'true' : 'false');
      btn.textContent = lang.toUpperCase();

      var supportedHere = supportsLanguage(current, lang);
      btn.disabled = !supportedHere;
      if (!supportedHere) {
        btn.title = current ? current.displayName + " doesn't support " + lang.toUpperCase() : '';
      }
      btn.addEventListener('click', function () { selectLanguage(lang); });
      el.languages.appendChild(btn);
    });
  }

  function renderNavigation() {
    if (el.prev) {
      el.prev.disabled = !hasPrev();
    }
    if (el.next) {
      el.next.disabled = !hasNext();
    }
    if (el.navEpisode) el.navEpisode.textContent = String(state.episode);
    if (el.currentEpisodeLabel) el.currentEpisodeLabel.textContent = String(state.episode);
  }

  function renderEpisodes() {
    if (!el.episodes) return;
    el.episodes.innerHTML = '';

    var total = maxEpisode();
    if (total === null) {
      // No reliable count from AniList: offer only what we know exists,
      // plus a manual jump box — never fabricate episode numbers.
      appendEpisodeButton(state.episode);
      renderJumpBox();
      return;
    }

    var watched = watchedEpisodes(CFG.anilistId, total);
    var filter = (el.epSearch && !el.epSearch.hidden && el.epSearch.value || '').trim();
    for (var ep = 1; ep <= total; ep++) {
      if (filter && String(ep).indexOf(filter.replace(/^0+/, '')) === -1) continue;
      appendEpisodeButton(ep, watched[ep]);
    }

    highlightCurrentEpisode();
  }

  function appendEpisodeButton(ep, watched) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'az-ep-btn';
    btn.dataset.episode = String(ep);
    btn.textContent = String(ep);
    btn.title = 'Episode ' + ep + (watched ? ' (watched)' : '');
    if (watched) btn.classList.add('watched');
    if (ep === state.episode) btn.classList.add('active');
    btn.addEventListener('click', function () { goToEpisode(ep); });
    el.episodes.appendChild(btn);
  }

  function renderJumpBox() {
    if (el.epSearch) {
      el.epSearch.hidden = false;
      el.epSearch.placeholder = 'Jump to episode…';
    }
  }

  function highlightCurrentEpisode() {
    if (!el.episodes) return;
    var buttons = el.episodes.querySelectorAll('.az-ep-btn');
    for (var i = 0; i < buttons.length; i++) {
      var isActive = Number(buttons[i].dataset.episode) === state.episode;
      buttons[i].classList.toggle('active', isActive);
      if (isActive) {
        buttons[i].scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }
    }
  }

  // ------------------------------------------------------------
  // Actions
  // ------------------------------------------------------------

  function loadCurrentPlayer() {
    var url = buildProviderUrl(state.provider, CFG.anilistId, state.episode, state.language);
    if (!url) {
      failPlayback('invalid-url');
      return;
    }
    var provider = findProvider(state.provider);
    if (el.loadingLabel && provider) {
      el.loadingLabel.textContent = 'Loading ' + provider.displayName + '…';
    }
    mountIframe(url);
    renderServers();
    renderLanguages();
    savePrefs();
  }

  function selectServer(key) {
    if (!findProvider(key) || key === state.provider) return;
    state.provider = key;
    // Keep URLs valid: fall back to the closest language this server has.
    state.language = closestLanguage(key, state.language);
    loadCurrentPlayer();
  }

  function selectLanguage(lang) {
    var current = findProvider(state.provider);
    if (!supportsLanguage(current, lang) || lang === state.language) return;
    state.language = lang;
    loadCurrentPlayer();
  }

  function watchPath(episode) {
    // Same route pattern as urls.py: aniuzu/watch/<id>/<ep>/
    return window.location.pathname.replace(
      /\/watch\/\d+\/\d+\/?/,
      '/watch/' + CFG.anilistId + '/' + episode + '/'
    );
  }

  function goToEpisode(episode) {
    episode = Number(episode);
    if (!episode || episode < 1) return;
    if (maxEpisode() !== null && episode > maxEpisode()) return;
    if (episode === state.episode) return;

    state.episode = episode;

    // Keep refresh/back behaviour sane without reloading the page.
    try {
      window.history.replaceState({}, '', watchPath(episode));
    } catch (err) { /* ignore */ }

    document.title = document.title.replace(/Episode \d+/, 'Episode ' + episode);
    renderNavigation();
    renderEpisodes();
    loadCurrentPlayer();
    el.frame.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function goNext() { if (hasNext()) goToEpisode(state.episode + 1); }
  function goPrev() { if (hasPrev()) goToEpisode(state.episode - 1); }

  function renderErrorServers() {
    if (!el.errorServers) return;
    el.errorServers.innerHTML = '';
    providerList.forEach(function (provider) {
      if (provider.key === state.provider) return;
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'az-mini-btn az-mini-primary';
      btn.textContent = 'Try ' + provider.displayName;
      btn.addEventListener('click', function () {
        selectServer(provider.key);
      });
      el.errorServers.appendChild(btn);
    });
  }

  // ------------------------------------------------------------
  // Player events (postMessage)
  // ------------------------------------------------------------

  // Each parser returns {kind, currentTime, duration} or null.
  var eventParsers = {
    megaplay: parseMegaplayEvent,
    vidnest: parseVidnestEvent
  };

  function parseMegaplayEvent(data) {
    // {event:"time", time, duration, percent} | {event:"complete"} |
    // {event:"error"} | {type:"watching-log", currentTime, duration}
    switch (data.event || data.type) {
      case 'time':
        return {
          kind: 'progress',
          currentTime: num(data.time),
          duration: num(data.duration)
        };
      case 'watching-log':
        return {
          kind: 'progress',
          currentTime: num(data.currentTime),
          duration: num(data.duration)
        };
      case 'complete':
        return { kind: 'complete' };
      case 'error':
        return { kind: 'error' };
      default:
        return null;
    }
  }

  function parseVidnestEvent(data) {
    // play/pause/ended/seeked/timeupdate — shape may vary between embeds.
    var name = data.event || data.type;
    switch (name) {
      case 'play': return { kind: 'play' };
      case 'pause': return { kind: 'pause' };
      case 'ended': return { kind: 'complete' };
      case 'seeked': return { kind: 'seeked' };
      case 'timeupdate':
        return {
          kind: 'progress',
          currentTime: num(data.currentTime != null ? data.currentTime : data.time),
          duration: num(data.duration)
        };
      default:
        return null;
    }
  }

  function num(value) {
    return typeof value === 'number' && isFinite(value) ? value : null;
  }

  function safeParseData(data) {
    if (typeof data === 'string') {
      try {
        data = JSON.parse(data);
      } catch (err) {
        return null;
      }
    }
    if (!data || typeof data !== 'object') return null;
    return data;
  }

  function onMessage(event) {
    var provider = findProvider(state.provider);
    if (!provider) return;

    // Never trust messages from unknown origins.
    if (provider.allowedOrigins.indexOf(event.origin) === -1) return;

    var data = safeParseData(event.data);
    if (!data) return;

    var parsed = (eventParsers[provider.eventStyle] || function () { return null; })(data);
    if (!parsed) {
      devLog('ignored message from', event.origin, data);
      return;
    }

    handlePlayerEvent(parsed);
  }

  function handlePlayerEvent(evt) {
    devLog('player event:', evt.kind, evt.currentTime, evt.duration);

    if (evt.kind === 'progress') {
      state.lastEvent = evt;
      markLoaded(); // first real event also proves the player is alive
      var now = Date.now();
      if (now - state.lastSavedAt >= SAVE_INTERVAL_MS &&
          evt.currentTime !== null && evt.duration) {
        state.lastSavedAt = now;
        saveWatchProgress(CFG.anilistId, state.episode, evt.currentTime, evt.duration);
      }
      return;
    }

    if (evt.kind === 'complete') {
      if (state.completeShown) return;
      state.completeShown = true;
      var lastKnown = state.lastEvent || {};
      if (lastKnown.currentTime && lastKnown.duration) {
        saveWatchProgress(CFG.anilistId, state.episode, lastKnown.currentTime, lastKnown.duration);
      }
      setCard('complete');
      if (AUTO_NEXT_ENABLED && hasNext()) {
        // Scaffolding for future auto-next; manual click stays primary.
        setTimeout(goNext, 5000);
      }
      return;
    }

    if (evt.kind === 'error') {
      failPlayback('provider-error');
      return;
    }

    // play/pause/seeked etc.: acknowledged, nothing to do yet.
  }

  window.addEventListener('message', onMessage);

  // Persist the latest position when leaving or hiding the tab.
  window.addEventListener('beforeunload', flushProgress);
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') flushProgress();
  });

  function flushProgress() {
    var evt = state.lastEvent;
    if (evt && evt.currentTime !== null && evt.duration) {
      saveWatchProgress(CFG.anilistId, state.episode, evt.currentTime, evt.duration);
    }
  }

  // ------------------------------------------------------------
  // Wiring
  // ------------------------------------------------------------

  if (el.prev) el.prev.addEventListener('click', goPrev);
  if (el.next) el.next.addEventListener('click', goNext);
  if (el.nextFromComplete) el.nextFromComplete.addEventListener('click', goNext);
  if (el.completeDismiss) el.completeDismiss.addEventListener('click', function () { setCard(null); });

  if (el.resumeYes) el.resumeYes.addEventListener('click', function () {
    // The provider player handles its own playback position; we simply
    // acknowledge and get out of the way.
    setCard(null);
  });

  if (el.resumeNo) el.resumeNo.addEventListener('click', function () {
    clearWatchProgress(CFG.anilistId, state.episode);
    setCard(null);
    mountIframe(buildProviderUrl(state.provider, CFG.anilistId, state.episode, state.language));
  });

  if (el.epSearch) {
    el.epSearch.addEventListener('input', renderEpisodes);
    el.epSearch.addEventListener('keydown', function (ev) {
      if (ev.key !== 'Enter') return;
      ev.preventDefault();
      var wanted = parseInt(el.epSearch.value, 10);
      if (wanted && (maxEpisode() === null || wanted <= maxEpisode())) {
        goToEpisode(wanted);
        el.epSearch.blur();
      }
    });
  }

  renderServers();
  renderLanguages();
  renderNavigation();
  renderEpisodes();
  loadCurrentPlayer();
  maybeOfferResume();
})();
