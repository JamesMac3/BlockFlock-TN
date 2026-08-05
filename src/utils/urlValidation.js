const BLOCKED_PROTOCOLS = new Set(["javascript:", "data:", "file:", "blob:", "vbscript:"]);
const PRIVATE_IPV4 = /^(?:10\.|127\.|169\.254\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/;
const YOUTUBE_ID = /^[A-Za-z0-9_-]{6,15}$/;

export function isValidYouTubeVideoId(value) {
  return YOUTUBE_ID.test(String(value ?? ""));
}

export function validateExternalUrl(value) {
  const raw = String(value ?? "").trim();
  const hasControlCharacter = [...raw].some((character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127;
  });
  if (!raw || raw.length > 2048 || hasControlCharacter) {
    return { valid: false, error: "Enter a valid HTTPS address." };
  }

  let url;
  try {
    url = new URL(raw);
  } catch {
    return { valid: false, error: "Enter a complete HTTPS address." };
  }

  if (BLOCKED_PROTOCOLS.has(url.protocol) || url.protocol !== "https:") {
    return { valid: false, error: "Links must use HTTPS." };
  }
  if (!url.hostname || url.username || url.password) {
    return { valid: false, error: "That address contains unsupported credentials or host information." };
  }

  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    hostname === "localhost" ||
    hostname === "0.0.0.0" ||
    hostname === "::1" ||
    hostname.startsWith("fc") ||
    hostname.startsWith("fd") ||
    hostname.startsWith("fe80:") ||
    PRIVATE_IPV4.test(hostname)
  ) {
    return { valid: false, error: "Local and private-network addresses are not allowed." };
  }

  return { valid: true, url: url.href, hostname: url.hostname };
}

export function parseYouTubeUrl(value) {
  const result = validateExternalUrl(value);
  if (!result.valid) return result;

  const url = new URL(result.url);
  const hostname = url.hostname.toLowerCase();
  let videoId;

  if (hostname === "youtu.be") {
    videoId = url.pathname.split("/").filter(Boolean)[0] ?? "";
  } else if (hostname === "www.youtube.com" || hostname === "youtube.com") {
    if (url.pathname === "/watch") videoId = url.searchParams.get("v") ?? "";
    else if (url.pathname.startsWith("/shorts/")) videoId = url.pathname.split("/")[2] ?? "";
    else return { valid: false, error: "Use a YouTube watch, short, or Shorts link." };
  } else {
    return { valid: false, error: "Only exact YouTube or youtu.be addresses are accepted." };
  }

  if (!isValidYouTubeVideoId(videoId)) {
    return { valid: false, error: "That YouTube video ID is not valid." };
  }

  return {
    valid: true,
    videoId,
    url: `https://www.youtube.com/watch?v=${videoId}`,
    hostname: "www.youtube.com",
  };
}

export function isExternalToCurrentOrigin(value) {
  try {
    const url = new URL(value, window.location.href);
    return url.origin !== window.location.origin;
  } catch {
    return false;
  }
}
