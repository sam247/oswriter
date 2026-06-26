import { Resend } from "resend";

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface MailService {
  send(message: MailMessage): Promise<void>;
}

interface StoredMailMessage extends MailMessage {
  sentAt: string;
}

type MemoryMailState = {
  mailbox: StoredMailMessage[];
  singleton: MailService | null;
};

class MemoryMailService implements MailService {
  async send(message: MailMessage) {
    state.mailbox.push({ ...message, sentAt: new Date().toISOString() });
  }
}

class ResendMailService implements MailService {
  private client: Resend | null = null;

  async send(message: MailMessage) {
    const from = process.env.RESEND_FROM_EMAIL;
    if (!from) {
      throw new Error("RESEND_FROM_EMAIL is required when using Resend mail delivery.");
    }
    await this.instance.emails.send({
      from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      ...(message.html ? { html: message.html } : {})
    });
  }

  private get instance() {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new Error("RESEND_API_KEY is required when using Resend mail delivery.");
    }
    this.client ??= new Resend(apiKey);
    return this.client;
  }
}

const state = memoryMailState();

export function createMailService() {
  return mailBackend() === "resend" ? new ResendMailService() : new MemoryMailService();
}

export function getMailService() {
  state.singleton ??= createMailService();
  return state.singleton;
}

export function renderOtpMail(input: {
  productName?: string;
  email: string;
  code: string;
  purpose: "login" | "signup";
  expiresInMinutes: number;
}) {
  const productName = input.productName ?? "QueueWrite";
  const action = input.purpose === "signup" ? "Finish creating your account" : "Sign in to your workspace";
  const subject = input.purpose === "signup"
    ? `Your ${productName} signup code`
    : `Your ${productName} login code`;
  const text = [
    `${action}.`,
    "",
    `Your one-time code is: ${input.code}`,
    "",
    `This code expires in ${input.expiresInMinutes} minutes and can only be used once.`,
    "",
    `If you did not request this email, you can ignore it.`
  ].join("\n");
  const html = [
    `<p>${escapeHtml(action)}.</p>`,
    `<p style="font-size:28px;font-weight:700;letter-spacing:0.08em">${escapeHtml(input.code)}</p>`,
    `<p>This code expires in ${input.expiresInMinutes} minutes and can only be used once.</p>`,
    `<p>If you did not request this email, you can ignore it.</p>`
  ].join("");
  return { to: input.email, subject, text, html };
}

export function renderQueueCompletedMail(input: {
  productName?: string;
  email: string;
  workspaceName: string;
  projectName: string;
  generated: number;
  needsReview: number;
  failed: number;
}) {
  const productName = input.productName ?? "QueueWrite";
  const subject = `${productName} queue completed for ${input.projectName}`;
  const statusLine = input.failed > 0
    ? `${input.failed} item(s) failed`
    : input.needsReview > 0
      ? `${input.needsReview} item(s) need review`
      : `${input.generated} item(s) finished cleanly`;
  const text = [
    `Your ${input.workspaceName} queue has completed.`,
    "",
    `Project: ${input.projectName}`,
    `Generated: ${input.generated}`,
    `Needs review: ${input.needsReview}`,
    `Failed: ${input.failed}`,
    "",
    statusLine
  ].join("\n");
  const html = [
    `<p>Your ${escapeHtml(input.workspaceName)} queue has completed.</p>`,
    `<p><strong>Project:</strong> ${escapeHtml(input.projectName)}<br />`,
    `<strong>Generated:</strong> ${input.generated}<br />`,
    `<strong>Needs review:</strong> ${input.needsReview}<br />`,
    `<strong>Failed:</strong> ${input.failed}</p>`,
    `<p>${escapeHtml(statusLine)}</p>`
  ].join("");
  return { to: input.email, subject, text, html };
}

export function resetMemoryMailbox() {
  state.mailbox.length = 0;
  state.singleton = null;
}

export function listMemoryMailbox() {
  return [...state.mailbox];
}

function mailBackend() {
  if (process.env.MAIL_BACKEND) return process.env.MAIL_BACKEND;
  if (process.env.NODE_ENV === "test") return "memory";
  return process.env.RESEND_API_KEY ? "resend" : "memory";
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function memoryMailState() {
  const scope = globalThis as typeof globalThis & {
    __queuewriteMemoryMailState__?: MemoryMailState;
  };
  scope.__queuewriteMemoryMailState__ ??= {
    mailbox: [],
    singleton: null
  };
  return scope.__queuewriteMemoryMailState__;
}
