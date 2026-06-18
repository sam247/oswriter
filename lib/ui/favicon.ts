export function getFaviconUrl(url: string) {
  const hostname = safeHostname(url);
  return hostname ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=64` : "";
}

function safeHostname(value: string) {
  const candidate = value.trim();
  if (!candidate) return "";

  try {
    return new URL(candidate).hostname;
  } catch {
    try {
      return new URL(`https://${candidate}`).hostname;
    } catch {
      return "";
    }
  }
}
