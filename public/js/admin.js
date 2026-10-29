(() => {
  const API_BASE = "/api";
  const TOKEN_KEY = "pointer-admin-token";
  const THEME_KEY = "pointer-admin-theme";
  const root = document.getElementById("view-root");
  const toast = document.getElementById("toast");
  const breadcrumb = document.getElementById("breadcrumb");
  let episodes = [];
  let categories = [];
  let settings = {};
  let episodeToDelete = null;
  let confirmAction = null;
  let toastTimer;
  let editingId = null;
  let previewTimer;
  let previewHls = null;
  let uploadedThumbnailUrl = "";
  let episodeLimit = null;

  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
  const token = () => sessionStorage.getItem(TOKEN_KEY);

  function showToast(message, isError = false) {
    toast.textContent = message;
    toast.classList.toggle("error", isError);
    toast.hidden = false;
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => { toast.hidden = true; }, 4000);
  }

  function logout() {
    sessionStorage.removeItem(TOKEN_KEY);
    episodes = [];
    if (location.hash !== "#login") location.hash = "login";
    else renderLogin();
  }

  async function api(path, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (options.body && !(options.body instanceof FormData)) headers["Content-Type"] = "application/json";
    if (token()) headers.Authorization = `Bearer ${token()}`;
    let response;
    try {
      response = await fetch(`${API_BASE}${path}`, { ...options, headers });
    } catch (error) {
      throw new Error("Unable to reach the API. Check the server connection and try again.");
    }
    if (response.status === 401 && !path.startsWith("/auth/login")) {
      logout();
      throw new Error("Your session expired. Please sign in again.");
    }
    let payload = {};
    try { payload = await response.json(); } catch { payload = {}; }
    if (!response.ok) throw new Error(payload.message || payload.error || `Request failed (${response.status}).`);
    return payload;
  }

  function setLoading(button, loading, text) {
    if (!button) return;
    if (loading) {
      button.dataset.originalText = button.textContent;
      button.disabled = true;
      button.textContent = text || "Saving…";
    } else {
      button.disabled = false;
      if (button.dataset.originalText) button.textContent = button.dataset.originalText;
    }
  }

  function setActive(route) {
    document.querySelectorAll(".nav-link[data-route]").forEach((link) => {
      link.classList.toggle("active", link.dataset.route === route);
    });
  }

  function emptyState(message = "No episodes yet. Add your first one.") {
    const element = document.createElement("div");
    element.className = "empty";
    element.textContent = message;
    return element;
  }

  function formatDate(date) {
    if (!date) return "—";
    const parsed = new Date(date);
    return Number.isNaN(parsed.getTime()) ? "—" : new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(parsed);
  }

  async function loadCategories() {
    const result = await api("/categories");
    categories = Array.isArray(result) ? result : result.categories || [];
    return categories;
  }

  async function loadEpisodes() {
    const result = await api("/admin/episodes");
    episodes = Array.isArray(result) ? result : result.episodes || [];
    return episodes;
  }

  async function loadEpisodeLimit() {
    episodeLimit = await api("/admin/episodes/limit-info");
    return episodeLimit;
  }

  function episodeLimitLabel() {
    return `Episodes used: ${episodeLimit?.count ?? episodes.length} / ${episodeLimit?.max ?? "—"}`;
  }

  function categoryOptions(selected = "") {
    return categories.map((item) => {
      const name = typeof item === "string" ? item : item.name;
      return `<option value="${escapeHtml(name)}"${name === selected ? " selected" : ""}>${escapeHtml(name)}</option>`;
    }).join("");
  }

  function renderLogin() {
    setActive("");
    breadcrumb.textContent = "Sign in";
    root.innerHTML = `
      <div class="login-wrap"><form class="login-card" id="login-form">
        <div class="brand"><span class="target"></span><span><span class="brand-name">THE POINTER</span><span class="admin-label">ADMIN</span></span></div>
        <h1>Welcome back</h1><p class="page-description">Sign in to your editorial workspace.</p>
        <div class="field"><label for="login-email">Email address</label><input id="login-email" name="email" type="email" autocomplete="username" required></div>
        <div class="field" style="margin-top:14px"><label for="login-password">Password</label><input id="login-password" name="password" type="password" autocomplete="current-password" required></div>
        <button class="btn btn-red" style="width:100%;margin-top:18px" type="submit">Sign in</button>
      </form></div>`;
    root.querySelector("#login-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const button = form.querySelector("button");
      setLoading(button, true, "Signing in…");
      try {
        const payload = Object.fromEntries(new FormData(form));
        const result = await api("/auth/login", { method: "POST", body: JSON.stringify(payload) });
        sessionStorage.setItem(TOKEN_KEY, result.token);
        location.hash = "add-episode";
      } catch (error) {
        showToast(error.message, true);
      } finally {
        setLoading(button, false);
      }
    });
  }

  function validVideoUrl(value) {
    return Boolean(window.PointerMedia?.validateHttpUrl(value));
  }

  function resolveMedia(value) {
    return window.PointerMedia?.resolveMedia(value) || null;
  }

  function updateSourcePreview(value) {
    const preview = document.getElementById("video-preview");
    const badge = document.getElementById("source-badge");
    const form = document.getElementById("episode-form");
    if (!preview || !badge) return;
    if (previewHls) {
      previewHls.destroy();
      previewHls = null;
    }
    preview.replaceChildren();
    if (!value.trim()) {
      badge.hidden = true;
      const empty = document.createElement("div");
      empty.className = "preview-empty";
      empty.textContent = "Video preview appears here";
      preview.append(empty);
      return;
    }
    if (!validVideoUrl(value)) {
      badge.hidden = false;
      badge.textContent = "Invalid URL";
      preview.append(Object.assign(document.createElement("div"), { className: "preview-empty", textContent: "Enter a valid http(s) URL or iframe embed." }));
      return;
    }
    try {
      const resolved = resolveMedia(value);
      badge.hidden = false;
      badge.textContent = resolved.label || (resolved.type === "iframe" ? "Embed" : "Direct video");
      const media = resolved.type === "iframe" ? document.createElement("iframe") : document.createElement("video");
      if (resolved.type === "iframe") {
        media.src = resolved.src;
        media.setAttribute("sandbox", "allow-scripts allow-same-origin allow-presentation allow-popups");
        media.allow = "autoplay; fullscreen; picture-in-picture";
        media.referrerPolicy = "no-referrer-when-downgrade";
        media.allowFullscreen = true;
      } else {
        media.src = resolved.src;
        media.controls = true;
        media.muted = true;
        media.addEventListener("error", () => {
          preview.replaceChildren(Object.assign(document.createElement("div"), {
            className: "preview-empty",
            textContent: "This video preview could not be loaded. The source URL can still be saved."
          }));
        }, { once: true });
        media.addEventListener("loadedmetadata", () => {
          if (document.getElementById("episode-form") !== form) return;
          const duration = document.getElementById("episode-duration");
          if (duration && !duration.value) duration.value = formatDuration(media.duration);
        }, { once: true });
        if (resolved.type === "hls" && media.canPlayType("application/vnd.apple.mpegurl") === "") {
          loadHls().then((Hls) => {
            if (Hls && Hls.isSupported()) {
              const hls = new Hls();
              hls.loadSource(resolved.src);
              hls.attachMedia(media);
              previewHls = hls;
              hls.on(Hls.Events.ERROR, (event, data) => {
                if (data.fatal) {
                  preview.replaceChildren(Object.assign(document.createElement("div"), {
                    className: "preview-empty",
                    textContent: "This video preview could not be loaded. The source URL can still be saved."
                  }));
                }
              });
            } else {
              preview.replaceChildren(Object.assign(document.createElement("div"), {
                className: "preview-empty",
                textContent: "HLS preview is not supported in this browser."
              }));
            }
          }).catch(() => {
            preview.replaceChildren(Object.assign(document.createElement("div"), {
              className: "preview-empty",
              textContent: "HLS preview support could not be loaded. The source URL can still be saved."
            }));
          });
        }
      }
      preview.append(media);
    } catch {
      badge.hidden = false;
      badge.textContent = "Invalid URL";
      preview.append(Object.assign(document.createElement("div"), { className: "preview-empty", textContent: "This source can't be previewed." }));
    }
  }

  function loadHls() {
    return new Promise((resolve, reject) => {
      if (window.Hls) return resolve(window.Hls);
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/hls.js@1.5.17/dist/hls.min.js";
      script.onload = () => resolve(window.Hls);
      script.onerror = reject;
      document.head.append(script);
    });
  }

  function formatDuration(seconds) {
    if (!Number.isFinite(seconds)) return "";
    const whole = Math.floor(seconds);
    const hours = Math.floor(whole / 3600);
    const minutes = Math.floor((whole % 3600) / 60);
    const secs = whole % 60;
    return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}` : `${minutes}:${String(secs).padStart(2, "0")}`;
  }

  function youtubeThumbnail(value) {
    if (window.PointerMedia?.youtubeThumbnail) return window.PointerMedia.youtubeThumbnail(value);
    try {
      const url = new URL(value);
      let id = "";
      if (url.hostname.includes("youtu.be")) id = url.pathname.split("/").filter(Boolean)[0] || "";
      else if (url.hostname.includes("youtube.com")) id = url.searchParams.get("v") || url.pathname.split("/").filter(Boolean).pop() || "";
      return /^[\w-]{11}$/.test(id) ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : "";
    } catch { return ""; }
  }

  async function autoThumbnail(value) {
    const field = document.getElementById("thumbnail-url");
    if (!field || field.value.trim()) return;
    const yt = youtubeThumbnail(value);
    if (yt) { field.value = yt; updateThumbnailPreview(yt); return; }
    let src = value.trim();
    if (src.includes("<iframe")) {
      const iframe = new DOMParser().parseFromString(src, "text/html").querySelector("iframe");
      src = iframe?.src || "";
    }
    try {
      if (!new URL(src).hostname.includes("vimeo.com")) return;
      const response = await fetch(`https://vimeo.com/api/oembed.json?url=${encodeURIComponent(src)}`);
      if (!response.ok) return;
      const data = await response.json();
      if (document.getElementById("thumbnail-url") === field && !field.value.trim() && data.thumbnail_url) {
        field.value = data.thumbnail_url;
        updateThumbnailPreview(data.thumbnail_url);
      }
    } catch { /* Auto-fill is optional when provider metadata is unavailable. */ }
  }

  function updateThumbnailPreview(value) {
    const image = document.getElementById("thumbnail-preview");
    if (!image) return;
    if (!value.trim()) { image.style.display = "none"; image.removeAttribute("src"); return; }
    image.src = value.trim();
    image.style.display = "block";
    image.onerror = () => { image.style.display = "none"; };
  }

  function renderEpisodeForm(episode = null) {
    window.clearTimeout(previewTimer);
    const oldUrlField = document.getElementById("episode-url");
    if (oldUrlField) window.clearTimeout(oldUrlField._thumbTimer);
    if (previewHls) {
      previewHls.destroy();
      previewHls = null;
    }
    editingId = episode?._id || null;
    uploadedThumbnailUrl = episode?.thumbnailUrl || "";
    const title = episode ? "Edit Episode" : "Add New Episode";
    breadcrumb.textContent = `Dashboard > Episodes > ${episode ? "Edit" : "Add New"}`;
    root.innerHTML = `
      <h1 class="page-title">${title}</h1>
      <p class="page-description">Bring the next conversation to The Pointer. Add the details, then publish.</p>
      <p class="page-description" id="episode-limit-counter">${episodeLimitLabel()}</p>
      <form class="panel" id="episode-form" novalidate>
        <div class="panel-head"><h2 class="panel-title">Episode details</h2><span class="muted-small" id="form-status">${episode?.status === "published" ? "Published episode" : episode ? "Draft episode" : "Unpublished episode"}</span></div>
        <div class="episode-form"><div class="form-grid">
          <div class="field span-9"><label for="episode-title">Episode Title</label><input id="episode-title" name="title" value="${escapeHtml(episode?.title || "")}" required maxlength="200"><div class="field-error" data-error="title"></div></div>
          <div class="field span-3"><label for="episode-number">Episode Number</label><input id="episode-number" name="number" type="number" min="1" value="${escapeHtml(episode?.number || "")}" required><div class="field-error" data-error="number"></div></div>
          <div class="field"><label for="episode-category">Category</label><select id="episode-category" name="category" required><option value="">Select category</option>${categoryOptions(episode?.category || "")}</select><p class="field-help" id="category-help">Politics · Economy · Elections · Oil &amp; Gas · Civil Unrest · Education &amp; Health · Business</p><div class="field-error" data-error="category"></div></div>
          <div class="field span-8"><label for="episode-url">Video URL</label><input id="episode-url" name="videoUrl" placeholder="Paste any http(s) link or iframe embed code" value="${escapeHtml(episode?.videoUrl || "")}" required><span class="source-badge" id="source-badge" hidden></span><div class="video-preview" id="video-preview"><div class="preview-empty">Video preview appears here</div></div><div class="field-error" data-error="videoUrl"></div></div>
          <div class="field span-4"><label for="episode-duration">Video Duration</label><input id="episode-duration" name="duration" placeholder="28:15" value="${escapeHtml(episode?.duration || "")}"><p class="field-help">Optional · mm:ss or h:mm:ss</p><div class="field-error" data-error="duration"></div></div>
          <div class="field"><label for="episode-description">Description</label><textarea id="episode-description" name="description" maxlength="3000">${escapeHtml(episode?.description || "")}</textarea><div class="field-error" data-error="description"></div></div>
          <div class="field"><span class="field-label">Video Thumbnail</span>
            <label class="thumbnail-drop" id="thumbnail-drop" for="thumbnail-file"><span><span class="drop-copy">⇧ &nbsp; Drag and drop thumbnail image or click to browse</span><span class="drop-help">JPG, PNG or WebP · 16:9 aspect ratio</span></span></label>
            <input id="thumbnail-file" type="file" accept="image/jpeg,image/png,image/webp" hidden>
            <input class="thumb-url" id="thumbnail-url" name="thumbnailUrl" aria-label="Thumbnail URL" placeholder="Thumbnail URL" value="${escapeHtml(episode?.thumbnailUrl || "")}">
            <img class="thumbnail-preview" id="thumbnail-preview" alt="Thumbnail preview" ${episode?.thumbnailUrl ? `src="${escapeHtml(episode.thumbnailUrl)}" style="display:block"` : ""}>
            <div class="field-error" data-error="thumbnailUrl"></div>
          </div>
        </div></div>
        <div class="form-footer"><span class="form-footer-note">ⓘ &nbsp; Published episodes appear in the public Video Hub.</span><div class="button-row"><label class="form-footer-note"><input id="feature-episode" name="isFeatured" type="checkbox"${episode?.isFeatured ? " checked" : ""}> Feature this episode on the homepage</label><button class="btn" type="button" id="save-draft">Save Draft</button><button class="btn btn-red" type="button" id="publish-episode">↗ &nbsp; Publish Episode</button></div></div>
      </form>
      <div class="recent-head"><div><p class="eyebrow">THE VIDEO HUB</p><h2 class="recent-title">Recent Episodes</h2><p class="page-description">The featured episode appears in the big 'Watch Latest Episode' card on the website.</p></div><a class="link-red" href="/index.html#watch-full-episodes" target="_blank" rel="noopener">View all episodes <span>→</span></a></div>
      <div class="panel" id="recent-panel"></div>`;
    if (!episode) {
      const highest = episodes.reduce((max, item) => Math.max(max, Number(item.number) || 0), 0);
      root.querySelector("#episode-number").value = String(highest + 1);
    }
    if (episode?.videoUrl) updateSourcePreview(episode.videoUrl);
    renderRecentEpisodes();
    wireEpisodeForm();
  }

  function appendFeatureAction(actions, episode) {
    if (episode.isFeatured) {
      const badge = document.createElement("span");
      badge.className = "status-pill";
      badge.textContent = "★ Featured";
      actions.append(badge);
      return;
    }
    const feature = document.createElement("button");
    feature.className = "table-action";
    feature.style.marginLeft = "8px";
    feature.textContent = "Set as Latest";
    feature.disabled = episode.status !== "published";
    feature.title = episode.status === "published" ? "" : "Only published episodes can be featured.";
    feature.addEventListener("click", async () => {
      try {
        await api(`/admin/episodes/${encodeURIComponent(episode._id)}/feature`, { method: "PATCH" });
        showToast("Featured episode updated.");
        await Promise.all([loadEpisodes(), loadEpisodeLimit()]);
        const counter = document.getElementById("episode-limit-counter");
        if (counter) counter.textContent = episodeLimitLabel();
        if (location.hash === "#manage-episodes") await renderManageEpisodes();
        else renderRecentEpisodes();
      } catch (error) {
        showToast(error.message, true);
      }
    });
    actions.append(feature);
  }

  function renderRecentEpisodes() {
    const panel = document.getElementById("recent-panel");
    if (!panel) return;
    panel.replaceChildren();
    if (!episodes.length) { panel.append(emptyState()); return; }
    const tableWrap = document.createElement("div");
    tableWrap.className = "table-wrap";
    const table = document.createElement("table");
    table.innerHTML = "<thead><tr><th>THUMBNAIL</th><th>TITLE</th><th>CATEGORY</th><th>DATE</th><th>ACTIONS</th></tr></thead>";
    const tbody = document.createElement("tbody");
    episodes.slice().sort((a, b) => {
      const aDate = new Date(a.updatedAt || a.createdAt || 0).getTime();
      const bDate = new Date(b.updatedAt || b.createdAt || 0).getTime();
      return bDate - aDate;
    }).slice(0, 3).forEach((episode) => {
      const row = document.createElement("tr");
      const thumbCell = document.createElement("td");
      const thumb = document.createElement("div");
      thumb.className = "episode-thumb";
      if (episode.thumbnailUrl) thumb.style.backgroundImage = `url("${episode.thumbnailUrl.replace(/["\\]/g, "")}")`;
      const duration = document.createElement("span");
      duration.className = "duration-tag";
      duration.textContent = episode.duration || "";
      thumb.append(duration); thumbCell.append(thumb);
      const titleCell = document.createElement("td");
      const title = document.createElement("div"); title.className = "table-title"; title.textContent = episode.title || "";
      const sub = document.createElement("div"); sub.className = "table-sub"; sub.textContent = `Ep. ${episode.number} · ${episode.show || "The Pointer"}`;
      titleCell.append(title, sub);
      const categoryCell = document.createElement("td");
      const category = document.createElement("span"); category.className = "category-pill"; category.textContent = episode.category || "";
      categoryCell.append(category);
      const dateCell = document.createElement("td"); dateCell.textContent = formatDate(episode.publishedAt || episode.createdAt);
      const actions = document.createElement("td");
      const edit = document.createElement("button"); edit.className = "table-action"; edit.textContent = "Edit"; edit.addEventListener("click", () => renderEpisodeForm(episode));
      const del = document.createElement("button"); del.className = "table-action delete"; del.textContent = "Delete"; del.style.marginLeft = "12px"; del.addEventListener("click", () => confirmDeleteEpisode(episode));
      actions.append(edit);
      appendFeatureAction(actions, episode);
      del.style.marginLeft = "8px";
      actions.append(del); row.append(thumbCell, titleCell, categoryCell, dateCell, actions); tbody.append(row);
    });
    table.append(tbody); tableWrap.append(table); panel.append(tableWrap);
    const foot = document.createElement("div"); foot.className = "table-foot"; foot.innerHTML = "<span>Showing 3 most recent uploads</span><span>Newest first</span>"; panel.append(foot);
  }

  function wireEpisodeForm() {
    const form = document.getElementById("episode-form");
    const urlField = document.getElementById("episode-url");
    const thumbnailField = document.getElementById("thumbnail-url");
    urlField.addEventListener("input", () => {
      window.clearTimeout(previewTimer);
      previewTimer = window.setTimeout(() => updateSourcePreview(urlField.value), 250);
      window.clearTimeout(urlField._thumbTimer);
      urlField._thumbTimer = window.setTimeout(() => autoThumbnail(urlField.value), 500);
    });
    thumbnailField.addEventListener("input", () => updateThumbnailPreview(thumbnailField.value));
    const drop = document.getElementById("thumbnail-drop");
    const fileInput = document.getElementById("thumbnail-file");
    ["dragenter", "dragover"].forEach((name) => drop.addEventListener(name, (event) => { event.preventDefault(); drop.classList.add("dragover"); }));
    ["dragleave", "drop"].forEach((name) => drop.addEventListener(name, (event) => { event.preventDefault(); drop.classList.remove("dragover"); }));
    drop.addEventListener("drop", (event) => handleThumbnailFile(event.dataTransfer.files[0]));
    fileInput.addEventListener("change", () => handleThumbnailFile(fileInput.files[0]));
    document.getElementById("save-draft").addEventListener("click", () => saveEpisode("draft"));
    document.getElementById("publish-episode").addEventListener("click", () => saveEpisode("published"));
  }

  async function handleThumbnailFile(file) {
    if (!file) return;
    const formElement = document.getElementById("episode-form");
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) return showToast("Choose a JPG, PNG or WebP image.", true);
    if (!settings.cloudinaryCloudName || !settings.cloudinaryUploadPreset) return showToast("Paste an image URL above, or add your Cloudinary details in Settings to enable uploads.", true);
    const dropCopy = document.querySelector(".drop-copy");
    const original = dropCopy.textContent;
    dropCopy.textContent = "Uploading thumbnail…";
    const form = new FormData();
    form.append("file", file);
    form.append("upload_preset", settings.cloudinaryUploadPreset);
    try {
      const response = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(settings.cloudinaryCloudName)}/image/upload`, { method: "POST", body: form });
      const result = await response.json();
      if (!response.ok || !result.secure_url) throw new Error(result.error?.message || "Thumbnail upload failed.");
      if (document.getElementById("episode-form") !== formElement) return;
      uploadedThumbnailUrl = result.secure_url;
      document.getElementById("thumbnail-url").value = result.secure_url;
      updateThumbnailPreview(result.secure_url);
      showToast("Thumbnail uploaded.");
    } catch (error) {
      showToast(error.message, true);
    } finally { dropCopy.textContent = original; }
  }

  function validateEpisode(payload) {
    const errors = {};
    if (!payload.title.trim()) errors.title = "Episode title is required.";
    if (!payload.number || Number(payload.number) < 1) errors.number = "Enter a valid episode number.";
    if (!payload.category) errors.category = "Choose a category.";
    if (!payload.videoUrl.trim() || !validVideoUrl(payload.videoUrl)) errors.videoUrl = "Enter a valid http(s) URL or iframe embed.";
    if (payload.duration && !/^(?:\d{1,2}:)?[0-5]?\d:[0-5]\d$/.test(payload.duration)) errors.duration = "Use mm:ss or h:mm:ss.";
    Object.entries(errors).forEach(([key, message]) => {
      const target = document.querySelector(`[data-error="${key}"]`);
      if (target) target.textContent = message;
    });
    return Object.keys(errors).length === 0;
  }

  async function saveEpisode(status, limitConfirmed = false) {
    const form = document.getElementById("episode-form");
    const payload = Object.fromEntries(new FormData(form).entries());
    payload.number = Number(payload.number);
    payload.videoUrl = payload.videoUrl.trim();
    payload.status = status;
    payload.isFeatured = form.elements.isFeatured.checked;
    if (!validateEpisode(payload)) return;
    if (!editingId && !limitConfirmed) {
      try {
        const info = await loadEpisodeLimit();
        if (info.count >= info.max) {
          if (!info.willDelete) {
            showToast("No non-featured episode can be removed to make room.", true);
            return;
          }
          confirm(
            `You've reached the ${info.max} episode limit of your plan. Publishing will permanently delete the oldest episode: ${info.willDelete.title}. Continue?`,
            () => saveEpisode(status, true),
            "Episode limit reached",
            "Continue"
          );
          return;
        }
      } catch (error) {
        showToast(error.message, true);
        return;
      }
    }
    const button = document.getElementById(status === "draft" ? "save-draft" : "publish-episode");
    setLoading(button, true, "Saving…");
    try {
      const path = editingId ? `/admin/episodes/${encodeURIComponent(editingId)}` : "/admin/episodes";
      await api(path, { method: editingId ? "PUT" : "POST", body: JSON.stringify(payload) });
      editingId = null;
      let refreshError = null;
      try { await loadEpisodes(); } catch (error) { refreshError = error; }
      try { await loadEpisodeLimit(); } catch (error) { refreshError = refreshError || error; }
      renderEpisodeForm();
      document.getElementById("episode-form").scrollIntoView({ behavior: "smooth", block: "start" });
      showToast(status === "published" ? "Episode published successfully." : "Draft saved successfully.");
      if (refreshError) {
        console.error("Episode was saved, but the episode list could not be fully refreshed.", refreshError);
        window.setTimeout(() => showToast("Episode saved, but the episode list could not be fully refreshed.", true), 4000);
      }
    } catch (error) {
      showToast(error.message, true);
    } finally { setLoading(button, false); }
  }

  function confirm(message, callback, title = "Confirm action", acceptLabel = "Delete") {
    document.getElementById("confirm-title").textContent = title;
    document.getElementById("confirm-copy").textContent = message;
    document.getElementById("confirm-accept").textContent = acceptLabel;
    confirmAction = callback;
    document.getElementById("confirm-modal").classList.add("open");
  }

  function closeConfirm() {
    document.getElementById("confirm-modal").classList.remove("open");
    document.getElementById("confirm-accept").textContent = "Delete";
    confirmAction = null;
  }
  document.getElementById("confirm-cancel").addEventListener("click", closeConfirm);
  document.getElementById("confirm-accept").addEventListener("click", async () => {
    const action = confirmAction;
    closeConfirm();
    if (action) await action();
  });

  function confirmDeleteEpisode(episode) {
    confirm(`Delete “${episode.title}”? This cannot be undone.`, async () => {
      try {
        await api(`/admin/episodes/${encodeURIComponent(episode._id)}`, { method: "DELETE" });
        showToast("Episode deleted.");
        await Promise.all([loadEpisodes(), loadEpisodeLimit()]);
        renderEpisodeForm();
      } catch (error) { showToast(error.message, true); }
    }, "Delete episode");
  }

  async function renderAddEpisode() {
    breadcrumb.textContent = `Dashboard > Episodes > ${editingId ? "Edit" : "Add New"}`;
    root.innerHTML = '<div class="empty">Loading episode workspace…</div>';
    try {
      await Promise.all([loadEpisodes(), loadCategories(), loadSettings(), loadEpisodeLimit()]);
      renderEpisodeForm(editingId ? episodes.find((item) => item._id === editingId) : null);
    } catch (error) { root.replaceChildren(emptyState(error.message)); }
  }

  function buildEpisodeTable(items, includeStatus = false) {
    const table = document.createElement("table");
    const heading = document.createElement("thead");
    const cols = ["THUMBNAIL", "TITLE", "CATEGORY", ...(includeStatus ? ["STATUS"] : []), "DATE", "ACTIONS"];
    const rowHead = document.createElement("tr");
    cols.forEach((column) => { const th = document.createElement("th"); th.textContent = column; rowHead.append(th); });
    heading.append(rowHead); table.append(heading);
    const body = document.createElement("tbody");
    items.forEach((episode) => {
      const row = document.createElement("tr");
      const imageCell = document.createElement("td");
      const image = document.createElement("div"); image.className = "episode-thumb";
      if (episode.thumbnailUrl) image.style.backgroundImage = `url("${episode.thumbnailUrl.replace(/["\\]/g, "")}")`;
      const duration = document.createElement("span"); duration.className = "duration-tag"; duration.textContent = episode.duration || "";
      image.append(duration); imageCell.append(image);
      const titleCell = document.createElement("td");
      const title = document.createElement("div"); title.className = "table-title"; title.textContent = episode.title || "";
      const sub = document.createElement("div"); sub.className = "table-sub"; sub.textContent = `Ep. ${episode.number} · ${episode.show || "The Pointer"}`;
      titleCell.append(title, sub);
      const categoryCell = document.createElement("td"); const category = document.createElement("span"); category.className = "category-pill"; category.textContent = episode.category || ""; categoryCell.append(category);
      row.append(imageCell, titleCell, categoryCell);
      if (includeStatus) {
        const statusCell = document.createElement("td");
        const badge = document.createElement("span"); badge.className = "status-pill"; badge.textContent = episode.status === "published" ? "Published" : "Draft";
        statusCell.append(badge); row.append(statusCell);
      }
      const dateCell = document.createElement("td"); dateCell.textContent = formatDate(episode.publishedAt || episode.updatedAt || episode.createdAt);
      const actions = document.createElement("td");
      const edit = document.createElement("button"); edit.className = "table-action"; edit.textContent = "Edit"; edit.addEventListener("click", () => { editingId = episode._id; location.hash = "add-episode"; });
      actions.append(edit);
      appendFeatureAction(actions, episode);
      if (includeStatus) {
        const toggle = document.createElement("button"); toggle.className = "table-action"; toggle.style.marginLeft = "8px"; toggle.textContent = episode.status === "published" ? "Unpublish" : "Publish";
        toggle.addEventListener("click", async () => {
          try { await api(`/admin/episodes/${encodeURIComponent(episode._id)}/status`, { method: "PATCH", body: JSON.stringify({ status: episode.status === "published" ? "draft" : "published" }) }); showToast("Episode status updated."); await renderManageEpisodes(); }
          catch (error) { showToast(error.message, true); }
        });
        actions.append(toggle);
      }
      const del = document.createElement("button"); del.className = "table-action delete"; del.style.marginLeft = "8px"; del.textContent = "Delete";
      del.addEventListener("click", () => confirmDeleteEpisode(episode)); actions.append(del); row.append(dateCell, actions); body.append(row);
    });
    table.append(body);
    return table;
  }

  async function renderManageEpisodes() {
    breadcrumb.textContent = "Dashboard > Manage Episodes";
    root.innerHTML = '<h1 class="page-title">Manage Episodes</h1><p class="page-description">Search, filter, edit and publish your episodes.</p><p class="page-description">The featured episode appears in the big \'Watch Latest Episode\' card on the website.</p><div class="toolbar"><input class="search-input" id="episode-search" placeholder="Search episodes"><select id="episode-filter"><option value="">All categories</option></select></div><div class="panel" id="manage-table"></div>';
    const panel = document.getElementById("manage-table");
    try {
      await Promise.all([loadEpisodes(), loadCategories(), loadEpisodeLimit()]);
      const filter = document.getElementById("episode-filter");
      categories.forEach((category) => { const option = document.createElement("option"); option.value = typeof category === "string" ? category : category.name; option.textContent = option.value; filter.append(option); });
      const update = () => {
        const query = document.getElementById("episode-search").value.toLowerCase();
        const selected = filter.value;
        const matches = episodes.filter((episode) => (!selected || episode.category === selected) && (!query || `${episode.title} ${episode.number} ${episode.category}`.toLowerCase().includes(query)));
        panel.replaceChildren(matches.length ? buildEpisodeTable(matches, true) : emptyState("No episodes match your search."));
      };
      document.getElementById("episode-search").addEventListener("input", update);
      filter.addEventListener("change", update);
      update();
    } catch (error) { panel.replaceChildren(emptyState(error.message)); }
  }

  async function renderDashboard() {
    breadcrumb.textContent = "Dashboard";
    root.innerHTML = '<h1 class="page-title">Dashboard</h1><p class="page-description">Your editorial overview.</p><p class="page-description" id="episode-limit-counter"></p><div class="stats" id="stats"></div><div class="dashboard-grid"><section class="panel"><div class="panel-head"><h2 class="panel-title">Recent messages</h2></div><div id="messages-list"></div></section><section class="panel"><div class="panel-head"><h2 class="panel-title">Subscribers</h2><div class="button-row"><button class="btn" id="copy-emails">Copy emails</button><button class="btn" id="export-emails">Download CSV</button></div></div><div id="subscriber-list"></div></section></div>';
    const stats = document.getElementById("stats");
    const messages = document.getElementById("messages-list");
    const subscribers = document.getElementById("subscriber-list");
    try {
      const [episodeResult, messagesResult, subscriberResult] = await Promise.all([
        loadEpisodes(), api("/admin/messages"), api("/admin/subscribers"), loadEpisodeLimit()
      ]);
      document.getElementById("episode-limit-counter").textContent = episodeLimitLabel();
      const messageItems = Array.isArray(messagesResult) ? messagesResult : messagesResult.messages || [];
      const subscriberItems = Array.isArray(subscriberResult) ? subscriberResult : subscriberResult.subscribers || [];
      const counts = [
        ["Total episodes", episodes.length],
        ["Published", episodes.filter((item) => item.status === "published").length],
        ["Drafts", episodes.filter((item) => item.status === "draft").length],
        ["Subscribers", subscriberItems.length]
      ];
      counts.forEach(([label, count]) => {
        const card = document.createElement("div"); card.className = "stat-card";
        const name = document.createElement("div"); name.className = "stat-name"; name.textContent = label;
        const value = document.createElement("div"); value.className = "stat-value"; value.textContent = count;
        card.append(name, value); stats.append(card);
      });
      if (!messageItems.length) messages.append(emptyState("No messages yet."));
      messageItems.slice(0, 8).forEach((message) => {
        const row = document.createElement("div"); row.className = "list-row";
        const top = document.createElement("div"); top.className = "message-row";
        const name = document.createElement("span"); name.className = "message-name"; name.textContent = `${message.name || "Visitor"} · ${message.subject || "General Inquiry"}`;
        const actions = document.createElement("span"); actions.className = "message-actions";
        const read = document.createElement("button"); read.className = "table-action"; read.textContent = message.read ? "Read" : "Mark read";
        read.addEventListener("click", async () => {
          try { await api(`/admin/messages/${encodeURIComponent(message._id)}`, { method: "PATCH", body: JSON.stringify({ read: true }) }); await renderDashboard(); }
          catch (error) { showToast(error.message, true); }
        });
        const del = document.createElement("button"); del.className = "table-action delete"; del.textContent = "Delete";
        del.addEventListener("click", async () => {
          try { await api(`/admin/messages/${encodeURIComponent(message._id)}`, { method: "DELETE" }); showToast("Message deleted."); await renderDashboard(); }
          catch (error) { showToast(error.message, true); }
        });
        actions.append(read, del); top.append(name, actions);
        const copy = document.createElement("div"); copy.className = "message-copy collapsed"; copy.textContent = `${message.email || ""} · ${message.message || ""}`;
        row.append(top, copy);
        if ((message.message || "").length > 120) {
          const expand = document.createElement("button");
          expand.className = "table-action message-expand";
          expand.type = "button";
          expand.textContent = "Read more";
          expand.setAttribute("aria-expanded", "false");
          expand.addEventListener("click", () => {
            const expanded = expand.getAttribute("aria-expanded") !== "true";
            expand.setAttribute("aria-expanded", String(expanded));
            expand.textContent = expanded ? "Show less" : "Read more";
            copy.classList.toggle("collapsed", !expanded);
          });
          row.append(expand);
        }
        messages.append(row);
      });
      if (!subscriberItems.length) subscribers.append(emptyState("No subscribers yet."));
      subscriberItems.slice(0, 8).forEach((subscriber) => {
        const row = document.createElement("div"); row.className = "list-row"; row.textContent = subscriber.email || ""; subscribers.append(row);
      });
      document.getElementById("copy-emails").addEventListener("click", async () => {
        try { await navigator.clipboard.writeText(subscriberItems.map((item) => item.email).join("\n")); showToast("Subscriber emails copied."); }
        catch { showToast("Could not access the clipboard.", true); }
      });
      document.getElementById("export-emails").addEventListener("click", async () => {
        try {
          const response = await fetch(`${API_BASE}/admin/subscribers/export`, {
            headers: { Authorization: `Bearer ${token()}` }
          });
          if (response.status === 401) { logout(); throw new Error("Your session expired. Please sign in again."); }
          if (!response.ok) throw new Error("Could not export subscribers.");
          const blob = await response.blob();
          const url = URL.createObjectURL(blob);
          const download = document.createElement("a");
          download.href = url;
          download.download = "subscribers.csv";
          download.click();
          URL.revokeObjectURL(url);
        } catch (error) { showToast(error.message, true); }
      });
    } catch (error) { root.append(emptyState(error.message)); }
  }

  async function renderCategories() {
    breadcrumb.textContent = "Dashboard > Categories";
    root.innerHTML = '<h1 class="page-title">Categories</h1><p class="page-description">Manage episode categories.</p><div class="panel"><div class="panel-head"><h2 class="panel-title">Add category</h2></div><form class="episode-form" id="category-form"><div class="toolbar"><input class="search-input" id="category-name" placeholder="Category name" required maxlength="60"><button class="btn btn-red" type="submit">Add Category</button></div></form><div class="category-list" id="category-list" style="padding:0 18px 18px"></div></div>';
    const list = document.getElementById("category-list");
    async function refresh() {
      await loadCategories();
      list.replaceChildren();
      categories.forEach((category) => {
        const item = typeof category === "string" ? { name: category } : category;
        const row = document.createElement("div"); row.className = "category-row";
        const name = document.createElement("span"); name.textContent = item.name;
        const actions = document.createElement("span");
        const edit = document.createElement("button"); edit.className = "table-action"; edit.textContent = "Edit";
        edit.addEventListener("click", async () => {
          const nextName = window.prompt("Category name", item.name)?.trim();
          if (!nextName || nextName === item.name) return;
          try {
            await api(`/admin/categories/${encodeURIComponent(item._id)}`, { method: "PUT", body: JSON.stringify({ name: nextName }) });
            showToast("Category updated.");
            await refresh();
          } catch (error) { showToast(error.message, true); }
        });
        const del = document.createElement("button"); del.className = "table-action delete"; del.textContent = "Delete";
        del.addEventListener("click", () => confirm(`Delete category “${item.name}”?`, async () => {
          try { await api(`/admin/categories/${encodeURIComponent(item._id || item.name)}`, { method: "DELETE" }); showToast("Category deleted."); await refresh(); }
          catch (error) { showToast(error.message, true); }
        }, "Delete category"));
        actions.append(edit, del); row.append(name, actions); list.append(row);
      });
      if (!categories.length) list.append(emptyState("No categories yet."));
    }
    try { await refresh(); } catch (error) { list.append(emptyState(error.message)); }
    document.getElementById("category-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const name = document.getElementById("category-name").value.trim();
      try { await api("/admin/categories", { method: "POST", body: JSON.stringify({ name }) }); event.currentTarget.reset(); showToast("Category added."); await refresh(); }
      catch (error) { showToast(error.message, true); }
    });
  }

  async function loadSettings(showErrors = true) {
    try {
      settings = await api("/admin/settings");
      return settings;
    } catch (error) {
      if (showErrors) showToast(error.message, true);
      return settings;
    }
  }

  async function renderSettings() {
    breadcrumb.textContent = "Dashboard > Settings";
    root.innerHTML = '<h1 class="page-title">Settings</h1><p class="page-description">Manage public links and Cloudinary upload configuration.</p><form class="panel" id="settings-form"><div class="panel-head"><h2 class="panel-title">Site settings</h2></div><div class="settings-grid"><div class="field"><label for="setting-youtube">YouTube URL</label><input class="settings-input" id="setting-youtube" name="youtubeUrl"></div><div class="field"><label for="setting-instagram">Instagram URL</label><input class="settings-input" id="setting-instagram" name="instagramUrl"></div><div class="field"><label for="setting-facebook">Facebook URL</label><input class="settings-input" id="setting-facebook" name="facebookUrl"></div><div class="field"><label for="setting-whatsapp">WhatsApp URL</label><input class="settings-input" id="setting-whatsapp" name="whatsappUrl"></div><div class="field"><label for="setting-cloud">Cloudinary Cloud Name</label><input class="settings-input" id="setting-cloud" name="cloudinaryCloudName"></div><div class="field"><label for="setting-preset">Unsigned Upload Preset</label><input class="settings-input" id="setting-preset" name="cloudinaryUploadPreset"></div></div><div class="form-footer"><span class="form-footer-note">Public API exposes social links only. Upload credentials remain private.</span><button class="btn btn-red" type="submit">Save Settings</button></div></form>';
    const form = document.getElementById("settings-form");
    try {
      settings = await api("/admin/settings");
      Object.entries(settings).forEach(([key, value]) => { if (form.elements[key]) form.elements[key].value = value || ""; });
    } catch (error) { showToast(error.message, true); }
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const button = form.querySelector("button[type=submit]");
      setLoading(button, true);
      try {
        const result = await api("/admin/settings", { method: "PUT", body: JSON.stringify(Object.fromEntries(new FormData(form))) });
        settings = result.settings || result;
        showToast("Settings saved.");
      } catch (error) { showToast(error.message, true); }
      finally { setLoading(button, false); }
    });
  }

  const routeRenderers = {
    dashboard: renderDashboard,
    "add-episode": renderAddEpisode,
    "manage-episodes": renderManageEpisodes,
    categories: renderCategories,
    settings: renderSettings
  };

  async function route() {
    document.body.classList.remove("drawer-open");
    const routeName = location.hash.replace(/^#/, "") || "add-episode";
    if (!token()) return renderLogin();
    if (!routeRenderers[routeName]) { location.hash = "add-episode"; return; }
    editingId = routeName === "add-episode" ? editingId : null;
    setActive(routeName);
    try { await routeRenderers[routeName](); }
    catch (error) { root.replaceChildren(emptyState(error.message)); }
  }

  document.getElementById("logout-button").addEventListener("click", logout);
  document.getElementById("menu-button").addEventListener("click", () => document.body.classList.toggle("drawer-open"));
  document.getElementById("mobile-scrim").addEventListener("click", () => document.body.classList.remove("drawer-open"));
  const themeButton = document.getElementById("theme-button");
  try {
    const storedTheme = localStorage.getItem(THEME_KEY);
    if (storedTheme === "light" || storedTheme === "dark") document.documentElement.dataset.theme = storedTheme;
  } catch (error) {
    console.error("Could not read the theme preference.", error);
  }
  themeButton.addEventListener("click", () => {
    const theme = document.documentElement.dataset.theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem(THEME_KEY, theme); } catch (error) { console.error("Could not store theme preference.", error); }
  });
  document.getElementById("confirm-modal").addEventListener("click", (event) => { if (event.target.id === "confirm-modal") closeConfirm(); });
  window.addEventListener("hashchange", route);
  route();
})();
