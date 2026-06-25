export function slugId(prefix: string) {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}_${rand}`;
}

export function countWords(markdown: string) {
  return markdown.trim().split(/\s+/).filter(Boolean).length;
}

export function domainFromUrl(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

const MULTI_PART_PUBLIC_SUFFIXES = new Set([
  "co.uk",
  "org.uk",
  "ac.uk",
  "gov.uk",
  "ltd.uk",
  "plc.uk",
  "me.uk",
  "com.au",
  "net.au",
  "org.au",
  "co.nz",
  "com.br",
  "com.cn",
  "com.hk",
  "com.sg",
  "co.jp",
  "co.za"
]);

export function registeredDomainFromUrl(value: string) {
  const hostname = hostnameFromUrlOrDomain(value);
  if (!hostname) return "";
  const parts = hostname.replace(/^www\./, "").split(".").filter(Boolean);
  if (parts.length <= 2) return parts.join(".");
  const suffix = parts.slice(-2).join(".");
  if (MULTI_PART_PUBLIC_SUFFIXES.has(suffix)) return parts.slice(-3).join(".");
  return parts.slice(-2).join(".");
}

export function sameRegisteredDomain(url: string, registeredDomain: string) {
  const root = registeredDomainFromUrl(registeredDomain);
  const candidate = registeredDomainFromUrl(url);
  return Boolean(root && candidate && root === candidate);
}

function hostnameFromUrlOrDomain(value: string) {
  const clean = value.trim().toLowerCase();
  if (!clean) return "";
  try {
    return new URL(clean.includes("://") ? clean : `https://${clean}`).hostname.replace(/\.$/, "");
  } catch {
    return clean
      .replace(/^https?:\/\//, "")
      .split(/[/?#]/)[0]
      .replace(/\.$/, "");
  }
}

export function cleanJsonText(text: string) {
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) return trimmed;
  const match = trimmed.match(/\{[\s\S]*\}/);
  return match?.[0] ?? trimmed;
}
