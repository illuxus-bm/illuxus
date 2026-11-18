/**
 * denomailer's SMTPClient interface (what the edge functions were written
 * against) on top of nodemailer, so the Node ports send mail the same way.
 *
 *   new SMTPClient({ connection: { hostname, port, tls, auth: { username, password } } })
 *   await client.send({ from, to, cc?, bcc?, subject, content, html, replyTo?, attachments? })
 *   await client.close()
 *
 * `tls: true` is implicit TLS (port 465); `tls: false` upgrades with
 * STARTTLS when the server offers it (587/25), as denomailer does.
 */
import nodemailer, { type Transporter } from "nodemailer";

type Connection = { hostname: string; port?: number; tls?: boolean; auth?: { username: string; password: string } };
type Attachment = { filename: string; content: string | Uint8Array; encoding?: string; contentType?: string };
type Message = {
  from: string;
  to: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  subject: string;
  content?: string;
  html?: string;
  replyTo?: string;
  attachments?: Attachment[];
};

export class SMTPClient {
  private transport: Transporter;

  constructor(config: { connection: Connection }) {
    const { hostname, port, tls, auth } = config.connection;
    this.transport = nodemailer.createTransport({
      host: hostname,
      port: port ?? (tls ? 465 : 587),
      secure: Boolean(tls),
      auth: auth ? { user: auth.username, pass: auth.password } : undefined,
      // Fail within a function's time budget instead of hanging.
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
  }

  async send(message: Message): Promise<void> {
    await this.transport.sendMail({
      from: message.from,
      to: message.to,
      cc: message.cc,
      bcc: message.bcc,
      subject: message.subject,
      text: message.content,
      html: message.html,
      replyTo: message.replyTo,
      attachments: message.attachments?.map((a) => ({
        filename: a.filename,
        content: typeof a.content === "string" && a.encoding === "base64" ? Buffer.from(a.content, "base64") : a.content instanceof Uint8Array ? Buffer.from(a.content) : a.content,
        contentType: a.contentType,
      })),
    });
  }

  async close(): Promise<void> {
    this.transport.close();
  }
}
