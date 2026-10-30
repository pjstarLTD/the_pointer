(() => {
  const API_BASE = "/api";
  const MEDIA = window.PointerMedia;
  const videoGrid = document.getElementById("video-grid");
  const featuredTitle = document.getElementById("featured-title");
  const featuredCard = document.querySelector(".featured-card");
  const featuredPlay = document.querySelector(".feature-play");
  const featuredCta = document.querySelector(".featured-bottom .js-play-video");
  const modal = document.getElementById("video-modal");
  const modalPlayer = document.getElementById("modal-player");
  const modalTitle = document.getElementById("modal-title");
  const modalClose = document.getElementById("modal-close");
  const fallbackMessage = document.getElementById("media-fallback");
  const fallbackExternal = document.getElementById("fallback-open-link");
  const openExternal = document.getElementById("open-video-link");
  const playerControls = document.getElementById("video-controls");
  const toast = document.getElementById("toast");
  const playButton = document.getElementById("video-play");
  const seekbar = document.getElementById("video-seek");
  const videoTime = document.getElementById("video-time");
  let episodes = [];
  let toastTimer;
  let activeVideo = null;
  let lastFocusedElement = null;
  let frameTimer = null;
  let hlsScriptPromise = null;

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add("visible");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove("visible"), 3800);
  }

  async function request(path, options = {}) {
    let response;
    try {
      response = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers: { ...(options.body ? { "Content-Type": "application/json" } : {}), ...(options.headers || {}) }
      });
    } catch (error) {
      throw new Error("Unable to reach the site right now. Please try again.");
    }
    let payload = {};
    try { payload = await response.json(); } catch { payload = {}; }
    if (!response.ok) {
      const error = new Error(payload.message || payload.error || "Something went wrong. Please try again.");
      error.status = response.status;
      throw error;
    }
    return payload;
  }

  function createText(tag, className, value) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    element.textContent = value == null ? "" : String(value);
    return element;
  }

  function appendArrowButton(label, episodeId) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "pill js-play-video";
    button.dataset.episodeId = String(episodeId);
    button.append(document.createTextNode(label));
    const arrow = createText("span", "", "→");
    arrow.setAttribute("aria-hidden", "true");
    button.append(arrow);
    return button;
  }

  function safeImageUrl(value) {
    if (typeof value !== "string" || !value.trim()) return "";
    try {
      const parsed = new URL(value, location.origin);
      return ["http:", "https:"].includes(parsed.protocol) ? parsed.href : "";
    } catch { return ""; }
  }

  function renderEpisodes() {
    videoGrid.replaceChildren();
    const heroEpisode = episodes.find((episode) => episode.isFeatured) || episodes[0];
    if (heroEpisode) {
      featuredTitle.textContent = heroEpisode.title || "";
      featuredPlay.dataset.episodeId = heroEpisode.id;
      featuredCta.dataset.episodeId = heroEpisode.id;
      featuredPlay.disabled = false;
      featuredCta.disabled = false;
      featuredPlay.setAttribute("aria-label", `Play ${heroEpisode.title || "latest episode"}`);
      const thumbnailUrl = safeImageUrl(heroEpisode.thumbnailUrl);
      featuredCard.style.backgroundImage = thumbnailUrl
        ? `linear-gradient(180deg, rgba(7, 11, 18, .04) 18%, rgba(7, 11, 18, .35) 45%, rgba(7, 11, 18, .97) 100%), url("${thumbnailUrl}")`
        : "";
    } else {
      featuredTitle.textContent = "No episodes available";
      featuredPlay.disabled = true;
      featuredCta.disabled = true;
      featuredPlay.removeAttribute("data-episode-id");
      featuredCta.removeAttribute("data-episode-id");
      featuredCard.style.backgroundImage = "";
    }
    const hubEpisodes = heroEpisode
      ? episodes.filter((episode) => episode.id !== heroEpisode.id)
      : [];
    console.log("Hero episode id:", heroEpisode?.id ?? null, "Video Hub episode ids:", hubEpisodes.map((episode) => episode.id));
    if (!hubEpisodes.length) {
      const empty = createText("p", "empty-episodes", "More episodes coming soon.");
      videoGrid.append(empty);
      return;
    }

    hubEpisodes.forEach((episode) => {
      const id = episode.id;
      const card = document.createElement("article");
      card.className = "hub-card";
      const thumb = document.createElement("div");
      thumb.className = "hub-thumb";
      const imageUrl = safeImageUrl(episode.thumbnailUrl || episode.thumbnail);
      if (imageUrl) {
        const image = document.createElement("img");
        image.className = "thumb-image";
        image.src = imageUrl;
        image.alt = "";
        image.loading = "lazy";
        image.addEventListener("error", () => image.remove(), { once: true });
        thumb.append(image);
      }
      const play = document.createElement("button");
      play.type = "button";
      play.className = "hub-play js-play-video";
      play.dataset.episodeId = id;
      play.setAttribute("aria-label", `Play ${episode.title || "episode"}`);
      play.innerHTML = '<svg width="19" height="21" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m8 5 12 7-12 7V5Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>';
      thumb.append(play);
      const body = document.createElement("div");
      body.className = "hub-card-body";
      const meta = document.createElement("div");
      meta.className = "hub-meta-row";
      meta.append(createText("span", "card-meta", episode.show || "THE POINTER"));
      meta.append(createText("span", "card-meta", episode.duration || ""));
      const heading = createText("h3", "", episode.title);
      const category = createText("span", "tag", episode.category?.name || episode.category || "");
      body.append(meta, heading, category);
      const bottom = document.createElement("div");
      bottom.className = "hub-card-bottom";
      bottom.append(appendArrowButton("Watch Now", id));
      body.append(bottom);
      card.append(thumb, body);
      videoGrid.append(card);
    });
  }

  function renderInvestigationTiles() {
    const grid = document.getElementById("investigation-grid");
    const coverage = [
      ["Politics", "politics"],
      ["Economy & Enterprise", "economy"],
      ["Elections", "elections"],
      ["Oil & Gas", "oil-gas"],
      ["Civil Unrest", "civil-unrest"],
      ["Education & Health", "education-health"]
    ];
    grid.replaceChildren();
    coverage.forEach(([label, image]) => {
      const tile = createText("div", "investigation-tile", "");
      tile.setAttribute("role", "img");
      tile.setAttribute("aria-label", label);
      tile.style.backgroundImage = `url("/images/investigate-${image}.jpg")`;
      tile.append(createText("span", "", label));
      grid.append(tile);
    });
  }

  function formatTime(seconds) {
    if (!Number.isFinite(seconds)) return "0:00";
    const minutes = Math.floor(seconds / 60);
    const remaining = Math.floor(seconds % 60).toString().padStart(2, "0");
    return `${minutes}:${remaining}`;
  }

  function getVideo() {
    return modalPlayer.querySelector("video");
  }

  function showFallback() {
    fallbackMessage.hidden = false;
  }

  function clearPlayer() {
    window.clearTimeout(frameTimer);
    modalPlayer.replaceChildren(fallbackMessage);
    fallbackMessage.hidden = true;
    openExternal.hidden = true;
    playerControls.hidden = true;
    seekbar.value = "0";
    videoTime.textContent = "0:00 / 0:00";
  }

  function loadHls() {
    if (window.Hls) return Promise.resolve(window.Hls);
    if (!hlsScriptPromise) {
      hlsScriptPromise = new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "https://cdn.jsdelivr.net/npm/hls.js@1.5.17/dist/hls.min.js";
        script.onload = () => resolve(window.Hls);
        script.onerror = () => reject(new Error("Unable to load HLS playback support."));
        document.head.append(script);
      });
    }
    return hlsScriptPromise;
  }

  async function openVideo(episode, trigger) {
    if (!episode || !episode.videoUrl || !MEDIA) {
      showToast("This video is currently unavailable.");
      return;
    }
    const resolved = MEDIA.resolveMedia(episode.videoUrl);
    if (!resolved) {
      showToast("This video has an invalid source URL.");
      return;
    }
    console.log("Playing:", resolved);
    activeVideo = episode;
    lastFocusedElement = trigger;
    modalTitle.textContent = episode.title || "Watch video";
    clearPlayer();
    modal.classList.add("open");
    document.body.style.overflow = "hidden";
    modalClose.focus();
    openExternal.href = resolved.src;
    fallbackExternal.href = resolved.src;
    const type = resolved.type;
    if (["video", "hls", "audio"].includes(type)) {
      const media = document.createElement(type === "audio" ? "audio" : "video");
      media.className = "modal-video";
      media.controls = type === "video";
      media.playsInline = true;
      media.autoplay = type === "video";
      media.preload = "metadata";
      const poster = safeImageUrl(episode.thumbnailUrl || episode.thumbnail);
      if (poster && type !== "audio") media.poster = poster;
      media.addEventListener("loadedmetadata", updateProgress);
      media.addEventListener("timeupdate", updateProgress);
      media.addEventListener("play", () => { playButton.textContent = "Pause"; });
      media.addEventListener("pause", () => { playButton.textContent = "Play"; });
      media.addEventListener("error", showFallback);
      modalPlayer.append(media);
      playerControls.hidden = type === "audio";
      openExternal.hidden = false;
      if (type === "hls" && media.canPlayType("application/vnd.apple.mpegurl") === "") {
        try {
          const Hls = await loadHls();
          if (!modal.classList.contains("open")) return;
          if (Hls && Hls.isSupported()) {
            const hls = new Hls();
            hls.loadSource(resolved.src);
            hls.attachMedia(media);
            hls.on(Hls.Events.ERROR, (event, data) => { if (data.fatal) showFallback(); });
            media._hls = hls;
          } else showFallback();
        } catch { showFallback(); }
      } else {
        media.src = resolved.src;
      }
      return;
    }

    const iframe = document.createElement("iframe");
    iframe.className = "modal-frame";
    iframe.title = episode.title || "Video player";
    iframe.src = resolved.src;
    iframe.setAttribute("sandbox", "allow-scripts allow-same-origin allow-presentation allow-popups");
    iframe.setAttribute("allow", "autoplay; fullscreen; picture-in-picture");
    iframe.setAttribute("referrerpolicy", "no-referrer-when-downgrade");
    iframe.allowFullscreen = true;
    iframe.addEventListener("load", () => window.clearTimeout(frameTimer), { once: true });
    iframe.addEventListener("error", showFallback);
    modalPlayer.append(iframe);
    openExternal.hidden = false;
    frameTimer = window.setTimeout(showFallback, 5000);
  }

  function updateProgress() {
    const media = getVideo();
    if (!media || !Number.isFinite(media.duration)) return;
    seekbar.max = String(media.duration);
    seekbar.value = String(media.currentTime || 0);
    videoTime.textContent = `${formatTime(media.currentTime)} / ${formatTime(media.duration)}`;
  }

  function closeVideo() {
    if (!modal.classList.contains("open")) return;
    const media = getVideo();
    if (media) {
      media.pause();
      if (media._hls) media._hls.destroy();
      media.removeAttribute("src");
      media.load();
    }
    clearPlayer();
    modal.classList.remove("open");
    activeVideo = null;
    document.body.style.overflow = "";
    if (lastFocusedElement) lastFocusedElement.focus();
  }

  document.addEventListener("click", (event) => {
    const trigger = event.target.closest(".js-play-video");
    if (!trigger) return;
    event.preventDefault();
    const episodeId = trigger.dataset.episodeId;
    const episode = episodes.find((item) => item.id === episodeId);
    if (episode) openVideo(episode, trigger);
  });
  modalClose.addEventListener("click", closeVideo);
  modal.addEventListener("click", (event) => { if (event.target === modal) closeVideo(); });
  document.addEventListener("keydown", (event) => { if (event.key === "Escape") closeVideo(); });
  playButton.addEventListener("click", async () => {
    const media = getVideo();
    if (!media) return;
    try {
      if (media.paused) await media.play();
      else media.pause();
    } catch { showFallback(); }
  });
  seekbar.addEventListener("input", () => {
    const media = getVideo();
    if (media && Number.isFinite(media.duration)) media.currentTime = Number(seekbar.value);
  });
  document.getElementById("video-speed").addEventListener("change", (event) => {
    const media = getVideo();
    if (media) media.playbackRate = Number(event.target.value);
  });
  document.getElementById("video-fullscreen").addEventListener("click", async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await modalPlayer.requestFullscreen();
    } catch { showFallback(); }
  });

  document.getElementById("current-date").textContent = new Intl.DateTimeFormat("en-GB", {
    weekday: "long", day: "2-digit", month: "long", year: "numeric"
  }).format(new Date()).toUpperCase();
  fetch("https://ipapi.co/json/").then((response) => {
    if (!response.ok) throw new Error(`Location request failed with status ${response.status}.`);
    return response.json();
  }).then((location) => {
    if (location.city && location.country_code) document.getElementById("location-text").textContent = `${location.city}, ${location.country_code}`;
  }).catch((error) => console.warn("Using the default location because location lookup failed.", error));

  const themeToggle = document.getElementById("theme-toggle");
  try {
    const savedTheme = localStorage.getItem("pointer-theme");
    if (savedTheme === "light" || savedTheme === "dark") document.documentElement.dataset.theme = savedTheme;
  } catch (error) { console.warn("Could not read the theme preference.", error); }
  function updateThemeToggle() {
    themeToggle.setAttribute("aria-label", document.documentElement.dataset.theme === "light" ? "Switch to dark mode" : "Switch to light mode");
  }
  updateThemeToggle();
  themeToggle.addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("pointer-theme", next); }
    catch (error) { console.error("Could not save the theme preference.", error); }
    updateThemeToggle();
  });

  document.getElementById("contact-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      const result = await request("/contact", { method: "POST", body: JSON.stringify(Object.fromEntries(new FormData(form))) });
      if (!result.ok) throw new Error("Your message could not be sent. Please try again.");
      form.reset();
      showToast("Message received! Saved to Admin Portal");
    } catch (error) { showToast(error.message, true); }
    finally { button.disabled = false; }
  });

  document.getElementById("newsletter-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      const result = await request("/newsletter", { method: "POST", body: JSON.stringify(Object.fromEntries(new FormData(form))) });
      if (!result.ok) throw new Error(result.message || "Your subscription could not be saved.");
      form.reset();
      showToast(result.message || "Thanks for subscribing to The Pointer Briefing.");
    } catch (error) {
      showToast(error.status === 409 ? "You're already subscribed." : error.message, true);
    } finally { button.disabled = false; }
  });

  function updateSocialLinks(settings) {
    const mappings = [
      ["youtubeUrl", ["https://youtube.com/@thepointer"]],
      ["instagramUrl", ["https://www.instagram.com/reel/DeHTJZEgYVi/?utm_source=ig_web_copy_link&rpxt=NTc4MTIwNjQ2YQ=="]],
      ["facebookUrl", ["https://facebook.com"]],
      ["whatsappUrl", ["https://wa.me/2340000000000"]]
    ];
    for (const [field, defaults] of mappings) {
      const url = settings[field];
      if (!url || !MEDIA.validateHttpUrl(url)) continue;
      document.querySelectorAll("a[href]").forEach((anchor) => {
        if (defaults.includes(anchor.href)) anchor.href = url;
      });
    }
  }

  async function loadSiteData() {
    try {
      const [episodeData, settings] = await Promise.all([request("/episodes"), request("/settings")]);
      episodes = Array.isArray(episodeData) ? episodeData : episodeData.episodes || [];
      renderEpisodes();
      updateSocialLinks(settings);
    } catch (error) {
      episodes = [];
      renderEpisodes();
      showToast(error.message, true);
    }
  }

  renderInvestigationTiles();
  loadSiteData();
})();
