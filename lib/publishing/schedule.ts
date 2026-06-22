import { nowIso } from "@/lib/defaults";
import type {
  ArticleDocument,
  PublishingScheduleIntervalUnit,
  PublishingSchedulePattern,
  PublishingScheduleRequest
} from "@/lib/types";
import { applyPublishingDefaults } from "@/lib/publishing/status";

const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = 24 * MINUTES_PER_HOUR;
const MINUTES_PER_WEEK = 7 * MINUTES_PER_DAY;

export function buildPublishingSchedule(startAt: string, articleCount: number, request: Omit<PublishingScheduleRequest, "startAt">) {
  const offsets = Array.from({ length: articleCount }, (_, index) => scheduleOffsetMinutes(index, request));
  return offsets.map((offsetMinutes) => addMinutes(startAt, offsetMinutes));
}

export function markArticleAsScheduled(article: ArticleDocument, scheduledAt: string): ArticleDocument {
  const next = applyPublishingDefaults(article);
  return {
    ...next,
    publishingStatus: "scheduled",
    scheduledPublishAt: scheduledAt,
    publishingError: null,
    updatedAt: nowIso()
  };
}

function scheduleOffsetMinutes(index: number, request: Omit<PublishingScheduleRequest, "startAt">) {
  switch (request.pattern) {
    case "one_per_day":
      return index * MINUTES_PER_DAY;
    case "two_per_week":
      return index * ((7 * MINUTES_PER_DAY) / 2);
    case "custom_interval":
      return index * customIntervalMinutes(request.customIntervalValue, request.customIntervalUnit);
    default:
      return 0;
  }
}

function customIntervalMinutes(value: number | undefined, unit: PublishingScheduleIntervalUnit | undefined) {
  const safeValue = Math.max(1, Math.floor(value ?? 1));
  switch (unit) {
    case "weeks":
      return safeValue * MINUTES_PER_WEEK;
    case "days":
      return safeValue * MINUTES_PER_DAY;
    default:
      return safeValue * MINUTES_PER_HOUR;
  }
}

function addMinutes(startAt: string, minutes: number) {
  return new Date(new Date(startAt).getTime() + minutes * 60_000).toISOString();
}

export function schedulePatternLabel(pattern: PublishingSchedulePattern) {
  switch (pattern) {
    case "one_per_day":
      return "One article per day";
    case "two_per_week":
      return "Two articles per week";
    case "custom_interval":
      return "Custom interval";
    default:
      return "Publish all at once";
  }
}
