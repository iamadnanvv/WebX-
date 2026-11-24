import crypto from 'node:crypto';
import nodemailer from 'nodemailer';
import {
  OFFICIAL_SUPPORT_EMAIL,
  buildSupportMailtoUrl,
  getSupportServiceMeta,
  type SupportCategory,
  type SupportPriority,
} from '../lib/supportCatalog.ts';

import { resolveSafeTimeZone } from '../lib/money.ts';

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function getConfiguredSupportEmail(): string {
  const envEmail = process.env.SUPPORT_EMAIL?.trim();
  return envEmail && envEmail.includes('@') ? envEmail : OFFICIAL_SUPPORT_EMAIL;
}

export function isSmtpConfigured(): boolean {
  return Boolean(
    process.env.SMTP_HOST?.trim() &&
      process.env.SMTP_USER?.trim() &&
      process.env.SMTP_PASS?.trim()
  );
}

export function generateTicketNumber(timeZone = 'Asia/Dubai'): string {
  const now = new Date();
  const dubaiDate = now
    .toLocaleDateString('en-CA', { timeZone: resolveSafeTimeZone(timeZone) })
    .replace(/-/g, '');
  const rand = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `WEBX-SUP-${dubaiDate}-${rand}`;
}

export interface DispatchSupportEmailInput {
  ticketNumber: string;
  category: SupportCategory;
  priority: SupportPriority;
  requesterName: string;
  requesterEmail: string;
  requesterRole: string;
  subject: string;
  description: string;
  metadata?: Record<string, unknown> | null;
}

export interface DispatchSupportEmailResult {
  routedToEmail: string;
  emailDeliveryStatus: 'SENT_SMTP' | 'READY_FOR_DISPATCH' | 'SMTP_ERROR';
  emailMessageId: string | null;
  mailtoUrl: string;
  deliveryNote: string;
}

export async function dispatchSupportTicketEmail(
  input: DispatchSupportEmailInput
): Promise<DispatchSupportEmailResult> {
  const routedToEmail = getConfiguredSupportEmail();
  const service = getSupportServiceMeta(input.category);
  const detailValue =
    input.metadata && typeof input.metadata.detailReference === 'string'
      ? input.metadata.detailReference
      : undefined;

  const mailtoUrl = buildSupportMailtoUrl({
    category: input.category,
    subject: input.subject,
    ticketNumber: input.ticketNumber,
    requesterName: input.requesterName,
    requesterEmail: input.requesterEmail,
    description: input.description,
    detailValue,
  });

  if (!isSmtpConfigured()) {
    return {
      routedToEmail,
      emailDeliveryStatus: 'READY_FOR_DISPATCH',
      emailMessageId: null,
      mailtoUrl,
      deliveryNote: `Ticket logged in WebX Support Desk and addressed to ${routedToEmail}. Configure SMTP credentials or click Send via Email Client to transmit directly.`,
    };
  }

  try {
    const port = Number(process.env.SMTP_PORT || '587');
    const secure = process.env.SMTP_SECURE === 'true' || port === 465;
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST!.trim(),
      port,
      secure,
      auth: {
        user: process.env.SMTP_USER!.trim(),
        pass: process.env.SMTP_PASS!.trim(),
      },
    });

    const fromAddress =
      process.env.SMTP_FROM?.trim() ||
      `WebX Support Desk <${process.env.SMTP_USER!.trim()}>`;

    const textLines = [
      `Ticket Number: ${input.ticketNumber}`,
      `Service Category: ${service.title}`,
      `Priority: ${input.priority}`,
      `Requester: ${input.requesterName} <${input.requesterEmail}> (${input.requesterRole})`,
      detailValue ? `${service.detailFieldLabel}: ${detailValue}` : null,
      '',
      `Subject: ${input.subject}`,
      '',
      input.description,
    ].filter((l): l is string => l !== null);

    const htmlBody = `
      <div style="font-family: Arial, sans-serif; color: #0f172a; max-width: 640px;">
        <h2 style="color: #1d4ed8; margin-bottom: 6px;">WebX Support Ticket ${escapeHtml(input.ticketNumber)}</h2>
        <p style="color: #475569; font-size: 13px; margin-top: 0;">
          Routed to Official Support Desk (${escapeHtml(routedToEmail)})
        </p>
        <table style="border-collapse: collapse; width: 100%; font-size: 13px; margin: 14px 0;">
          <tr><td style="padding: 6px; border: 1px solid #e2e8f0; background: #f8fafc;"><strong>Service</strong></td><td style="padding: 6px; border: 1px solid #e2e8f0;">${escapeHtml(service.title)}</td></tr>
          <tr><td style="padding: 6px; border: 1px solid #e2e8f0; background: #f8fafc;"><strong>Priority</strong></td><td style="padding: 6px; border: 1px solid #e2e8f0;">${escapeHtml(input.priority)}</td></tr>
          <tr><td style="padding: 6px; border: 1px solid #e2e8f0; background: #f8fafc;"><strong>Requester</strong></td><td style="padding: 6px; border: 1px solid #e2e8f0;">${escapeHtml(input.requesterName)} (${escapeHtml(input.requesterEmail)}) · ${escapeHtml(input.requesterRole)}</td></tr>
          ${
            detailValue
              ? `<tr><td style="padding: 6px; border: 1px solid #e2e8f0; background: #f8fafc;"><strong>${escapeHtml(service.detailFieldLabel)}</strong></td><td style="padding: 6px; border: 1px solid #e2e8f0;">${escapeHtml(detailValue)}</td></tr>`
              : ''
          }
        </table>
        <div style="padding: 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px;">
          <div style="font-weight: bold; margin-bottom: 6px;">${escapeHtml(input.subject)}</div>
          <div style="white-space: pre-wrap; font-size: 13px; line-height: 1.5;">${escapeHtml(input.description)}</div>
        </div>
      </div>
    `;

    const info = await transporter.sendMail({
      from: fromAddress,
      to: routedToEmail,
      replyTo: input.requesterEmail,
      subject: `[${input.ticketNumber}] [${service.title}] ${input.subject}`,
      text: textLines.join('\n'),
      html: htmlBody,
    });

    return {
      routedToEmail,
      emailDeliveryStatus: 'SENT_SMTP',
      emailMessageId: info.messageId || null,
      mailtoUrl,
      deliveryNote: `Support ticket dispatched directly via email to ${routedToEmail}.`,
    };
  } catch (err) {
    console.error('Support SMTP dispatch failed:', err);
    return {
      routedToEmail,
      emailDeliveryStatus: 'SMTP_ERROR',
      emailMessageId: null,
      mailtoUrl,
      deliveryNote: `Ticket saved in WebX Support Desk, but automated SMTP dispatch encountered an error. You can send immediately via Email Client to ${routedToEmail}.`,
    };
  }
}

export async function dispatchSupportReplyEmail(params: {
  ticketNumber: string;
  category: SupportCategory;
  subject: string;
  senderName: string;
  senderEmail?: string;
  senderRole: string;
  message: string;
}): Promise<void> {
  if (!isSmtpConfigured()) return;
  try {
    const routedToEmail = getConfiguredSupportEmail();
    const service = getSupportServiceMeta(params.category);
    const port = Number(process.env.SMTP_PORT || '587');
    const secure = process.env.SMTP_SECURE === 'true' || port === 465;
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST!.trim(),
      port,
      secure,
      auth: {
        user: process.env.SMTP_USER!.trim(),
        pass: process.env.SMTP_PASS!.trim(),
      },
    });
    const fromAddress =
      process.env.SMTP_FROM?.trim() ||
      `WebX Support Desk <${process.env.SMTP_USER!.trim()}>`;

    await transporter.sendMail({
      from: fromAddress,
      to: routedToEmail,
      replyTo: params.senderEmail,
      subject: `Re: [${params.ticketNumber}] [${service.title}] ${params.subject}`,
      text: `New reply from ${params.senderName} (${params.senderRole}):\n\n${params.message}`,
    });
  } catch (err) {
    console.error('Support reply SMTP dispatch failed:', err);
  }
}
