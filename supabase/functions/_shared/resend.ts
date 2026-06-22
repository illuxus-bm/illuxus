/** Shared Resend helpers for Supabase edge functions. */

export function textToHtml(text: string, footer?: string): string {
  const footerHtml = footer
    ?? "You received this email because you are registered for an event on Illuxus.";
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
           font-size: 15px; line-height: 1.6; color: #1a1a1a; margin: 0; padding: 0; }
    .wrap { max-width: 600px; margin: 40px auto; padding: 0 24px; }
    .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #e5e7eb;
              font-size: 12px; color: #6b7280; }
  </style>
</head>
<body>
  <div class="wrap">
    <p>${escapeHtml(text).replace(/\n/g, "<br />")}</p>
    <div class="footer">${escapeHtml(footerHtml)}</div>
  </div>
</body>
</html>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export interface ResendEmailPayload {
  from: string;
  to: string[];
  subject: string;
  html: string;
  text: string;
  reply_to?: string;
}

export async function sendViaResend(
  apiKey: string,
  payload: ResendEmailPayload,
): Promise<{ ok: true; id?: string } | { ok: false; error: string }> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errText = await res.text();
    return { ok: false, error: `${res.status} ${errText.slice(0, 500)}` };
  }

  const data = await res.json().catch(() => ({})) as { id?: string };
  return { ok: true, id: data.id };
}

/** Default From header — override with RESEND_FROM_EMAIL or RESEND_FROM secret. */
export function defaultFromAddress(displayName = "Illuxus"): string {
  // Accept either secret name. `RESEND_FROM_EMAIL` is the original; `RESEND_FROM`
  // is the shorter alias already accepted by send-communication-email. Whichever
  // is set in Supabase secrets is used; if both, the longer name wins.
  const from =
    Deno.env.get("RESEND_FROM_EMAIL") ??
    Deno.env.get("RESEND_FROM") ??
    "Illuxus <onboarding@resend.dev>";
  if (from.includes("<")) return from;
  return `${displayName} <${from}>`;
}
