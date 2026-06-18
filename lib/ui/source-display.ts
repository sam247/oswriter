const DOMAIN_LABELS: Record<string, string> = {
  "contractsfinder.service.gov.uk": "Contracts Finder",
  "legislation.gov.uk": "UK Legislation"
};

export function getSourceDisplayTitle(title: string, url: string, domain = "") {
  const cleanedTitle = title.trim();
  if (cleanedTitle && !looksLikeUrl(cleanedTitle)) return cleanedTitle;

  const hostname = getSourceDisplayDomain(url, domain);
  const brand = DOMAIN_LABELS[hostname] ?? domainLabel(hostname);
  const pathLabel = meaningfulPathLabel(url);
  return [brand, pathLabel].filter(Boolean).join(" ") || "Source";
}

export function getSourceDisplayDomain(url: string, domain = "") {
  const storedDomain = domain.trim().toLowerCase().replace(/^www\./, "");
  if (storedDomain && !looksLikeUrl(storedDomain)) return storedDomain;

  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function truncateSourceTitle(title: string, maxLength = 50) {
  const characters = Array.from(title);
  if (characters.length <= maxLength) return title;
  return `${characters.slice(0, Math.max(1, maxLength - 1)).join("").trimEnd()}…`;
}

function looksLikeUrl(value: string) {
  return /^https?:\/\//i.test(value) || /^www\./i.test(value);
}

function domainLabel(hostname: string) {
  const label = hostname.split(".").find((part) => part && part !== "www") ?? "";
  return titleCase(label.replace(/[-_]+/g, " "));
}

function meaningfulPathLabel(url: string) {
  try {
    const segment = new URL(url).pathname
      .split("/")
      .map((part) => decodeURIComponent(part).trim())
      .find((part) => part && !/^(?:id|attachment|article|page)$/i.test(part) && !/^\d+$/.test(part) && !/^[a-f0-9-]{20,}$/i.test(part));
    if (!segment) return "";
    if (/^(?:uksi|ukpga|asp|ssi)$/i.test(segment)) return segment.toUpperCase();
    return titleCase(segment.replace(/[-_]+/g, " "));
  } catch {
    return "";
  }
}

function titleCase(value: string) {
  return value.replace(/\b\w/g, (character) => character.toUpperCase());
}
