const DEFAULT_MARKETING_BASE_URL = "https://queuewrite.com";
const DEFAULT_APP_BASE_URL = "https://app.queuewrite.com";

export function marketingBaseUrl() {
  return normalizeBaseUrl(process.env.NEXT_PUBLIC_MARKETING_URL ?? process.env.MARKETING_BASE_URL ?? DEFAULT_MARKETING_BASE_URL);
}

export function appBaseUrl() {
  return normalizeBaseUrl(process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_BASE_URL ?? DEFAULT_APP_BASE_URL);
}

export function marketingUrl(pathname = "/") {
  return new URL(pathname, marketingBaseUrl()).toString();
}

export function appUrl(pathname = "/") {
  return new URL(pathname, appBaseUrl()).toString();
}

export function isSplitHostDeployment() {
  return hostname(marketingBaseUrl()) !== hostname(appBaseUrl());
}

export function isMarketingHost(value: string | null | undefined) {
  if (!value) return false;
  return stripPort(value).toLowerCase() === hostname(marketingBaseUrl());
}

export function isAppHost(value: string | null | undefined) {
  if (!value) return false;
  return stripPort(value).toLowerCase() === hostname(appBaseUrl());
}

export function appHostName() {
  return hostname(appBaseUrl());
}

export function marketingHostName() {
  return hostname(marketingBaseUrl());
}

function hostname(url: string) {
  return new URL(url).hostname.toLowerCase();
}

function normalizeBaseUrl(value: string) {
  return value.endsWith("/") ? value : `${value}/`;
}

function stripPort(value: string) {
  return value.split(":")[0] ?? value;
}
