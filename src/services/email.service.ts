import path from "node:path";
import nodemailer from "nodemailer";
import { env, features } from "../config/env";
import { logger } from "../utils/logger";

/**
 * Sends email through SMTP when SMTP_HOST is set. Otherwise the email is printed
 * to the console (handy in development) — no code change needed to go live.
 */
const transporter = features.email
  ? nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    })
  : null;

type Mail = { to: string; subject: string; html: string; attachments?: { filename: string; content: Buffer }[] };

/**
 * Client-approved logo (used exactly as supplied), embedded in every email as an inline
 * attachment so it shows even when images from websites are blocked or the site is not live yet.
 */
const LOGO_CID = "onevaya-logo";
const LOGO_FILE = path.join(__dirname, "../../assets/brand/onevayawhite.png");

export async function sendMail(mail: Mail) {
  if (!transporter) {
    logger.info(`[email:console] To: ${mail.to} | ${mail.subject}\n${mail.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()}`);
    return;
  }
  try {
    await transporter.sendMail({
      from: env.EMAIL_FROM,
      ...mail,
      attachments: [{ filename: "onevaya-logo.png", path: LOGO_FILE, cid: LOGO_CID }, ...(mail.attachments ?? [])],
    });
  } catch (err) {
    // Email problems must never break the user's action (e.g. submitting an enquiry).
    logger.error("Email failed:", err);
  }
}

// ─────────────────────────── Templates ───────────────────────────
/** Escape user-provided text before putting it in HTML. */
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const layout = (title: string, body: string) => `
<div style="background:#F5F0E7;padding:32px;font-family:Arial,sans-serif;color:#101C2C">
  <div style="max-width:560px;margin:auto;background:#fff;border-radius:16px;overflow:hidden">
    <div style="background:#101C2C;padding:18px 28px"><img src="cid:${LOGO_CID}" alt="OneVaya" height="64" style="display:block;height:64px;width:auto;border:0"></div>
    <div style="padding:28px">
      <h2 style="font-family:Georgia,serif;font-weight:normal;margin:0 0 12px">${title}</h2>
      ${body}
    </div>
    <div style="padding:16px 28px;font-size:12px;color:#5D6878;border-top:1px solid #eee">OneVaya Travel &amp; Tourism · One World. Every Journey.</div>
  </div>
</div>`;

const button = (href: string, label: string) =>
  `<p><a href="${href}" style="display:inline-block;background:#101C2C;color:#F5F0E7;padding:12px 22px;border-radius:999px;text-decoration:none">${label}</a></p>`;

export const emails = {
  enquiryReceived: (to: string, name: string, ref: string) =>
    sendMail({
      to,
      subject: `We've received your request (${ref})`,
      html: layout(`Thank you, ${esc(name)}`, `<p>A OneVaya travel designer will reply with a tailored quote, usually within one working day.</p><p>Your reference: <b>${esc(ref)}</b></p>`),
    }),

  newLeadForTeam: (ref: string, source: string, name: string, email: string) =>
    sendMail({
      to: env.TEAM_EMAIL,
      subject: `New lead ${ref} (${source})`,
      html: layout("New lead", `<p><b>${esc(name)}</b> (${esc(email)}) via ${esc(source)}.</p>${button(`${env.ADMIN_URL}/leads`, "Open in admin panel")}`),
    }),

  quoteSent: (to: string, name: string, ref: string, pdf: Buffer) =>
    sendMail({
      to,
      subject: `Your OneVaya quote ${ref}`,
      html: layout(`Your journey, ${esc(name)}`, `<p>Please find your tailored quote attached. Reply to this email or message your travel designer to accept or make changes.</p>`),
      attachments: [{ filename: `${ref}.pdf`, content: pdf }],
    }),

  documentReady: (to: string, name: string, docName: string, bookingRef: string) =>
    sendMail({
      to,
      subject: `New travel document for ${bookingRef}`,
      html: layout(`Hello ${esc(name)}`, `<p><b>${esc(docName)}</b> is ready in My OneVaya.</p>${button(`${env.CLIENT_URL}/my-onevaya/documents`, "View documents")}`),
    }),

  passwordReset: (to: string, name: string, link: string) =>
    sendMail({
      to,
      subject: "Reset your OneVaya password",
      html: layout(`Hello ${esc(name)}`, `<p>Use the button below to choose a new password. The link expires in 1 hour.</p>${button(link, "Reset password")}<p style="font-size:12px;color:#5D6878">If you didn't ask for this, you can ignore this email.</p>`),
    }),

  teamReply: (to: string, name: string, subject: string) =>
    sendMail({
      to,
      subject: `New message: ${subject}`,
      html: layout(`Hello ${esc(name)}`, `<p>Your travel designer has replied.</p>${button(`${env.CLIENT_URL}/my-onevaya/messages`, "Read message")}`),
    }),
};
