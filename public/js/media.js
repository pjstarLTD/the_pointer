(function (root, factory) {
  const media = factory();
  if (typeof module === "object" && module.exports) module.exports = media;
  if (root) root.PointerMedia = media;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function parseHttpUrl(value) {
    if (typeof value !== "string" || !value.trim() || value.length > 10000) return null;
    try {
      const url = new URL(value.trim());
      return url.protocol === "http:" || url.protocol === "https:" ? url : null;
    } catch {
      return null;
    }
  }

  function extractVideoUrl(value) {
    const raw = typeof value === "string" ? value.trim() : "";
    if (!raw) return null;
    const direct = parseHttpUrl(raw);
    if (direct) return direct.href;
    const match = raw.match(/<iframe\b[^>]*?\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>/i);
    const source = match && (match[1] || match[2] || match[3]);
    const iframeUrl = source && parseHttpUrl(source);
    return iframeUrl ? iframeUrl.href : null;
  }

  function youtubeId(url) {
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    const parts = url.pathname.split("/").filter(Boolean);
    let id = "";
    if (host === "youtu.be") id = parts[0] || "";
    else if (host === "youtube.com" || host.endsWith(".youtube.com") || host === "youtube-nocookie.com") {
      id = url.searchParams.get("v") || (["embed", "shorts", "live"].includes(parts[0]) ? parts[1] : "");
    }
    return /^[A-Za-z0-9_-]{6,20}$/.test(id) ? id : "";
  }

  function resolveMedia(value) {
    const normalized = extractVideoUrl(value);
    const url = normalized && parseHttpUrl(normalized);
    if (!url) return null;
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    const parts = url.pathname.split("/").filter(Boolean);
    const ytId = youtubeId(url);
    if (ytId) return { type: "iframe", src: `https://www.youtube.com/embed/${ytId}`, label: "YouTube" };

    if (host === "vimeo.com" || host.endsWith(".vimeo.com")) {
      const id = url.pathname.match(/(?:^|\/)(\d{5,})(?:\/|$)/)?.[1];
      if (id) return { type: "iframe", src: `https://player.vimeo.com/video/${id}`, label: "Vimeo" };
    }

    if (host === "dailymotion.com" || host.endsWith(".dailymotion.com") || host === "dai.ly") {
      const id = host === "dai.ly" ? parts[0] : url.pathname.match(/\/(?:video|embed\/video)\/([A-Za-z0-9]+)/)?.[1];
      if (id) return { type: "iframe", src: `https://www.dailymotion.com/embed/video/${id}`, label: "Dailymotion" };
    }

    if (host === "facebook.com" || host.endsWith(".facebook.com") || host === "fb.watch") {
      return { type: "iframe", src: `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(url.href)}&show_text=false`, label: "Facebook video" };
    }

    if (host === "tiktok.com" || host.endsWith(".tiktok.com")) {
      const id = url.pathname.match(/\/video\/(\d+)/)?.[1];
      if (id) return { type: "iframe", src: `https://www.tiktok.com/player/v1/${id}`, label: "TikTok" };
    }

    if (host === "streamable.com" || host.endsWith(".streamable.com")) {
      const id = parts[0] === "e" ? parts[1] : parts[0];
      if (id) return { type: "iframe", src: `https://streamable.com/e/${encodeURIComponent(id)}`, label: "Streamable" };
    }

    if (host === "loom.com" || host.endsWith(".loom.com")) {
      const id = url.pathname.match(/\/share\/([A-Za-z0-9]+)/)?.[1];
      if (id) return { type: "iframe", src: `https://www.loom.com/embed/${id}`, label: "Loom" };
    }

    if (host === "wistia.com" || host.endsWith(".wistia.com") || host === "wi.st") {
      const id = url.pathname.match(/\/(?:medias|embed\/medias)\/([A-Za-z0-9]+)/)?.[1];
      if (id) return { type: "iframe", src: `https://fast.wistia.net/embed/iframe/${id}`, label: "Wistia" };
    }

    if (host === "drive.google.com" || host.endsWith(".drive.google.com")) {
      const id = url.pathname.match(/\/file\/d\/([^/]+)/)?.[1] || url.searchParams.get("id");
      if (id) return { type: "iframe", src: `https://drive.google.com/file/d/${encodeURIComponent(id)}/preview`, label: "Google Drive" };
    }

    if (host === "player.cloudinary.com") {
      return { type: "iframe", src: url.href, label: "Cloudinary player" };
    }

    if (host === "res.cloudinary.com" && /\/video\/upload\//.test(url.pathname)) {
      const extension = url.pathname.toLowerCase().match(/\.(mp4|webm|mov|m3u8)(?:$)/)?.[1];
      if (extension) return { type: extension === "m3u8" ? "hls" : "video", src: url.href, label: "Cloudinary video" };
    }

    const pathname = url.pathname.toLowerCase();
    const extension = pathname.match(/\.(mp4|webm|ogg|mov|m3u8)(?:$)/)?.[1];
    if (extension) return { type: extension === "m3u8" ? "hls" : "video", src: url.href, label: "Direct file" };
    return { type: "iframe", src: url.href, label: "Embed" };
  }

  function youtubeThumbnail(value) {
    const url = parseHttpUrl(value);
    const id = url && youtubeId(url);
    return id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : null;
  }

  return {
    resolveMedia,
    extractVideoUrl,
    validateHttpUrl(value) {
      return Boolean(extractVideoUrl(value));
    },
    youtubeThumbnail
  };
});
