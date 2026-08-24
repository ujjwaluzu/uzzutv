/* ============================================================
   ANIUZU — watch page
   AniList supplies the header metadata; Anikoto supplies every
   episode (numbers, embed ids, SUB/DUB URLs) via the server, and
   MegaPlay plays them. The client NEVER builds playback URLs and
   never treats the AniList ID as an Anikoto/episode identifier.

   Everything is decided server-side in #az-watch-data:
     playerUrls.sub/.dub  — verbatim Anikoto embed URLs (MegaPlay)
     availableLanguages   — languages this exact episode really has
     prevNumber/nextNumber— neighbours from Anikoto's ordered list
     episodes[]           — full catalog for search + navigation
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

  var AUTO_NEXT_ENABLED = false; // scaffolding; manual click stays primary
  var LOAD_TIMEOUT_MS = 25000;
  var SAVE_INTERVAL_MS = 10000;
  var RESUME_MIN_PERCENT = 1.5;
  var RESUME_MAX_PERCENT = 93;
  var RESUME_MIN_SECONDS = 20;
  var WATCHED_PERCENT = 85;

  var PREFS_KEY = 'aniuzu:watch-prefs';
  var PROGRESS_PREFIX = 'aniuzu:progress:' + CFG.anilistId + ':';

  // ------------------------------------------------------------
  // Provider-independent progress layer.
  // Keyed by the Anikoto episode identity (embed id), NOT just the
  // episode number, so progress survives renumbering/specials.
  // localStorage today; swappable later without touching callers.
  // ------------------------------------------------------------

  function progressKey(embedId) {
    return PROGRESS_PREFIX + embedId;
  }

  function saveWatchProgress(snapshot, currentTime, duration) {
    if (!snapshot || !snapshot.embedId) return;
    if (!duration || duration <= 0 || currentTime <= 0) return;
    var percent = Math.min(100, (currentTime / duration) * 100);
    try {
      localStorage.setItem(progressKey(snapshot.embedId), JSON.stringify({
        anilistId: CFG.anilistId,
        anikotoSeriesId: CFG.anikotoSeriesId,
        anikotoEpisodeId: snapshot.anikotoEpisodeId,
        embedId: snapshot.embedId,
        episodeNumber: snapshot.episodeNumber,
        currentTime: currentTime,
        duration: duration,
        percent: percent,
        updatedAt: Date.now()
      }));
    } catch (err) { /* storage full/unavailable — non-fatal */ }
  }

  function getWatchProgress(embedId) {
    if (!embedId) return null;
    try {
      var raw = localStorage.getItem(progressKey(embedId));
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

  function getResumeTime(embedId) {
    var saved = getWatchProgress(embedId);
    if (!saved) return null;
    if (saved.currentTime < RESUME_MIN_SECONDS) return null;
    if (!saved.duration) return null;
    var percent = (saved.currentTime / saved.duration) * 100;
    if (percent < RESUME_MIN_PERCENT || percent > RESUME_MAX_PERCENT) return null;
    return saved.currentTime;
  }

  function clearWatchProgress(embedId) {
    try {
      localStorage.removeItem(progressKey(embedId));
    } catch (err) { /* ignore */ }
  }

  // Watched map by episode number (percent watched >= threshold),
  // gathered from stored records instead of guessing numbers.
  function watchedEpisodes() {
    var watched = {};
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var key = localStorage.key(i);
        if (!key || key.indexOf(PROGRESS_PREFIX) !== 0) continue;
        var data = null;
        try { data = JSON.parse(localStorage.getItem(key)); } catch (err) { continue; }
        if (data && typeof data.percent === 'number' && data.percent >= WATCHED_PERCENT &&
            data.episodeNumber !== undefined && data.episodeNumber !== null) {
          watched[String(data.episodeNumber)] = true;
        }
      }
    } catch (err) { /* ignore */ }
    return watched;
  }

  // ------------------------------------------------------------
  // State
  // ------------------------------------------------------------

  var prefs = loadPrefs();
  var state = {
    language: pickInitialLanguage(),
    episodeNumber: CFG.episodeNumber,
    anikotoEpisodeId: CFG.anikotoEpisodeId,
    embedId: CFG.embedId,
    playerUrls: CFG.playerUrls,
    prevNumber: CFG.prevNumber,
    nextNumber: CFG.nextNumber,
    loading: false,
    error: false,
    resumePrompted: false,
    completeShown: false,
    lastSavedAt: 0,
    lastEvent: null
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
      localStorage.setItem(PREFS_KEY, JSON.stringify({ language: state.language }));
    } catch (err) { /* ignore */ }
  }

  function pickInitialLanguage() {
    var available = CFG.availableLanguages || [];
    if (prefs.language && available.indexOf(prefs.language) !== -1) return prefs.language;
    if (CFG.language && available.indexOf(CFG.language) !== -1) return CFG.language;
    return available[0] || null;
  }

  // ------------------------------------------------------------
  // Elements
  // ------------------------------------------------------------

  var el = {
    frame: document.getElementById('az-player-frame'),
    loading: document.getElementById('az-loading'),
    loadingLabel: document.getElementById('az-loading-label'),
    error: document.getElementById('az-error'),
    errorActions: document.getElementById('az-error-actions'),
    resume: document.getElementById('az-resume'),
    resumeTime: document.getElementById('az-resume-time'),
    resumeYes: document.getElementById('az-resume-yes'),
    resumeNo: document.getElementById('az-resume-no'),
    complete: document.getElementById('az-complete'),
    nextFromComplete: document.getElementById('az-next-from-complete'),
    completeDismiss: document.getElementById('az-complete-dismiss'),
    languages: document.getElementById('az-languages'),
    prev: document.getElementById('az-prev'),
    next: document.getElementById('az-next'),
    navEpisode: document.getElementById('az-nav-episode'),
    currentEpisodeLabel: document.getElementById('az-current-episode'),
    episodesHost: document.getElementById('az-episodes-host'),
    epSearch: document.getElementById('az-ep-search')
  };
  if (!el.frame || !CFG.playerUrls) return;

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
    return (h > 0 ? h + ':' : '') + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  }

  // ------------------------------------------------------------
  // Overlays
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

  // ------------------------------------------------------------
  // Iframe lifecycle — src always comes from server-provided URLs.
  // ------------------------------------------------------------

  function mountIframe(url) {
    if (!url) { failPlayback('no-url'); return; }

    if (loadTimer) { clearTimeout(loadTimer); loadTimer = null; }
    if (iframe && iframe.parentNode) iframe.parentNode.removeChild(iframe);

    iframe = document.createElement('iframe');
    iframe.className = 'az-player-iframe';
    iframe.title = 'MegaPlay player';
    iframe.setAttribute('allow', 'autoplay; fullscreen; encrypted-media; picture-in-picture');
    iframe.setAttribute('referrerpolicy', 'origin');
    iframe.src = url;
    el.frame.appendChild(iframe);

    state.loading = true;
    state.error = false;
    state.completeShown = false;
    state.lastEvent = null;
    setStage('loading');

    iframe.addEventListener('load', markLoaded);

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
    renderErrorActions();
    setCard(null);
    setStage('error');
  }

  function maybeOfferResume() {
    if (state.resumePrompted) return;
    state.resumePrompted = true;
    var resumeAt = getResumeTime(state.embedId);
    if (resumeAt === null) return;
    if (el.resumeTime) el.resumeTime.textContent = formatTime(resumeAt);
    setCard('resume');
  }

  // ------------------------------------------------------------
  // Rendering: language selector, navigation, episodes
  // ------------------------------------------------------------

  function renderLanguages() {
    if (!el.languages) return;
    el.languages.innerHTML = '';
    [['sub', 'SUB'], ['dub', 'DUB']].forEach(function (pair) {
      var lang = pair[0];
      var label = pair[1];
      var supported = (CFG.availableLanguages || []).indexOf(lang) !== -1 &&
                      !!state.playerUrls[lang];
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'az-seg az-seg-lang' + (lang === state.language ? ' active' : '');
      btn.setAttribute('role', 'tab');
      btn.setAttribute('aria-selected', lang === state.language ? 'true' : 'false');
      btn.textContent = label;
      btn.disabled = !supported;
      if (!supported) btn.title = label + ' not available for this episode';
      btn.addEventListener('click', function () { selectLanguage(lang); });
      el.languages.appendChild(btn);
    });
  }

  function renderNavigation() {
    if (el.prev) el.prev.disabled = !state.prevNumber;
    if (el.next) el.next.disabled = !state.nextNumber;
    updateEpisodeLabels();
  }

  function updateEpisodeLabels() {
    if (el.navEpisode) el.navEpisode.textContent = String(state.episodeNumber);
    if (el.currentEpisodeLabel) el.currentEpisodeLabel.textContent = String(state.episodeNumber);
  }

  var browser = null;
  var watchedMap = {};

  function renderEpisodes() {
    if (!el.episodesHost || !window.AniuzuEpisodes) return;
    watchedMap = watchedEpisodes();
    browser = window.AniuzuEpisodes.create({
      container: el.episodesHost,
      searchInput: el.epSearch,
      episodes: CFG.episodes || [],
      activeNumber: state.episodeNumber,
      watched: watchedMap,
      onSelect: function (record) {
        if (String(record.n) === String(state.episodeNumber)) return;
        goToEpisode(record);
      }
    });
  }

  // ------------------------------------------------------------
  // Actions
  // ------------------------------------------------------------

  function loadCurrentPlayer() {
    var url = state.playerUrls[state.language];
    if (!url) {
      failPlayback('invalid-language');
      return;
    }
    if (el.loadingLabel) el.loadingLabel.textContent = 'Loading MegaPlay…';
    mountIframe(url);
    renderLanguages();
    savePrefs();
  }

  function selectLanguage(lang) {
    if ((CFG.availableLanguages || []).indexOf(lang) === -1) return;
    if (!state.playerUrls[lang] || lang === state.language) return;
    state.language = lang;
    loadCurrentPlayer();
  }

  function watchPath(episodeNumber) {
    return window.location.pathname.replace(
      /\/watch\/\d+\/[^\/]+\/?/,
      '/watch/' + CFG.anilistId + '/' + episodeNumber + '/'
    );
  }

  function goToEpisode(record) {
    if (!record || (!record.sub && !record.dub)) return;

    var urls = { sub: record.sub || null, dub: record.dub || null };
    var available = [];
    if (urls.sub) available.push('sub');
    if (urls.dub) available.push('dub');
    if (!available.length) return;

    var wanted = prefs.language;
    var nextLanguage = available.indexOf(wanted) !== -1 ? wanted : available[0];

    // Neighbours come from Anikoto's ordered list, recomputed for the
    // episode we are switching to (never number ± 1 arithmetic).
    var list = CFG.episodes || [];
    var index = -1;
    for (var i = 0; i < list.length; i++) {
      if (String(list[i].n) === String(record.n)) { index = i; break; }
    }
    if (index === -1) return;
    var previous = index > 0 ? list[index - 1] : null;
    var following = index < list.length - 1 ? list[index + 1] : null;

    state.playerUrls = urls;
    state.episodeNumber = record.n;
    state.anikotoEpisodeId = record.id;      // Anikoto episode record id
    state.embedId = record.embed;            // MegaPlay embed id
    state.language = nextLanguage;
    state.prevNumber = previous ? String(previous.n) : null;
    state.nextNumber = following ? String(following.n) : null;
    state.resumePrompted = false;
    state.completeShown = false;

    try {
      window.history.replaceState({}, '', watchPath(record.n));
    } catch (err) { /* ignore */ }

    document.title = document.title.replace(/Episode\s+\S+/, 'Episode ' + record.n);
    renderNavigation();
    if (browser) browser.setActive(record.n);
    loadCurrentPlayer();
    maybeOfferResume();
    el.frame.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function goNext() {
    if (!state.nextNumber) return;
    jumpToNumber(state.nextNumber);
  }

  function goPrev() {
    if (!state.prevNumber) return;
    jumpToNumber(state.prevNumber);
  }

  function jumpToNumber(number) {
    var record = (CFG.episodes || []).filter(function (item) {
      return String(item.n) === String(number);
    })[0];
    if (record) goToEpisode(record);
  }

  function renderErrorActions() {
    if (!el.errorActions) return;
    el.errorActions.innerHTML = '';
    // Retry the same stream…
    var retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'az-mini-btn az-mini-primary';
    retry.textContent = 'Retry';
    retry.addEventListener('click', loadCurrentPlayer);
    el.errorActions.appendChild(retry);
    // …or switch to the other track when one exists.
    (CFG.availableLanguages || []).forEach(function (lang) {
      if (lang === state.language || !state.playerUrls[lang]) return;
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'az-mini-btn';
      btn.textContent = 'Try ' + lang.toUpperCase();
      btn.addEventListener('click', function () { selectLanguage(lang); });
      el.errorActions.appendChild(btn);
    });
    var reload = document.createElement('button');
    reload.type = 'button';
    reload.className = 'az-mini-btn';
    reload.textContent = 'Reload page';
    reload.addEventListener('click', function () { window.location.reload(); });
    el.errorActions.appendChild(reload);
  }

  // ------------------------------------------------------------
  // MegaPlay postMessage events
  // ------------------------------------------------------------

  function parseMegaplayEvent(data) {
    switch (data.event || data.type) {
      case 'time':
        return { kind: 'progress', currentTime: num(data.time), duration: num(data.duration) };
      case 'watching-log':
        return { kind: 'progress', currentTime: num(data.currentTime), duration: num(data.duration) };
      case 'complete':
        return { kind: 'complete' };
      case 'error':
        return { kind: 'error' };
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
    // Never trust messages from unknown origins.
    var allowed = Array.isArray(CFG.allowedOrigins) ? CFG.allowedOrigins : [];
    if (allowed.indexOf(event.origin) === -1) return;

    var data = safeParseData(event.data);
    if (!data) return;

    var parsed = parseMegaplayEvent(data);
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
        saveCurrentProgress(evt.currentTime, evt.duration);
      }
      return;
    }

    if (evt.kind === 'complete') {
      if (state.completeShown) return;
      state.completeShown = true;
      var lastKnown = state.lastEvent || {};
      if (lastKnown.currentTime && lastKnown.duration) {
        saveCurrentProgress(lastKnown.currentTime, lastKnown.duration);
      }
      setCard('complete');
      if (AUTO_NEXT_ENABLED && state.nextNumber) {
        setTimeout(goNext, 5000);
      }
      return;
    }

    if (evt.kind === 'error') {
      failPlayback('provider-error');
      return;
    }
  }

  function saveCurrentProgress(currentTime, duration) {
    saveWatchProgress({
      embedId: state.embedId,
      anikotoEpisodeId: state.anikotoEpisodeId,
      episodeNumber: state.episodeNumber
    }, currentTime, duration);
  }

  window.addEventListener('message', onMessage);

  window.addEventListener('beforeunload', flushProgress);
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') flushProgress();
  });

  function flushProgress() {
    var evt = state.lastEvent;
    if (evt && evt.currentTime !== null && evt.duration) {
      saveCurrentProgress(evt.currentTime, evt.duration);
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
    // MegaPlay resumes on its own once it receives watching-log state;
    // we simply acknowledge and get out of the way.
    setCard(null);
  });

  if (el.resumeNo) el.resumeNo.addEventListener('click', function () {
    clearWatchProgress(state.embedId);
    setCard(null);
    loadCurrentPlayer();
  });

  if (el.epSearch) {
    el.epSearch.addEventListener('keydown', function (ev) {
      if (ev.key !== 'Enter') return;
      ev.preventDefault();
      var wanted = parseInt(el.epSearch.value, 10);
      if (wanted) {
        jumpToNumber(wanted);
        el.epSearch.blur();
      }
    });
  }

  renderLanguages();
  renderNavigation();
  renderEpisodes();
  loadCurrentPlayer();
  maybeOfferResume();
})();
