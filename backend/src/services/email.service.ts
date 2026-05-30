import nodemailer from "nodemailer";
import { env } from "../config/env.js";

let _transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (!_transporter) {
    _transporter = nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.port === 465,
      auth: { user: env.smtp.user, pass: env.smtp.pass },
    });
  }
  return _transporter;
}

export function isEmailConfigured(): boolean {
  return Boolean(env.smtp.user && env.smtp.pass);
}

export async function verifySmtp(): Promise<void> {
  if (!isEmailConfigured()) {
    console.warn("[Email] SMTP not configured — set SMTP_USER and SMTP_PASS in .env");
    return;
  }
  try {
    await getTransporter().verify();
    console.log(`[Email] SMTP ready — sending from ${env.smtp.from}`);
  } catch (err) {
    console.error("[Email] SMTP verification failed:", err instanceof Error ? err.message : err);
  }
}

function buildHtml(opts: {
  commodity: string;
  direction: "DROP" | "RISE";
  horizon: "7d" | "30d";
  percentChange: number;
  currentPrice: number;
  forecastPrice: number;
  targetRole: "buyer" | "farmer";
  recipientEmail: string;
}): string {
  const isDrop = opts.direction === "DROP";
  const accentColor = isDrop ? "#dc2626" : "#16a34a";
  const bgChip = isDrop ? "#fee2e2" : "#dcfce7";
  const arrowSymbol = isDrop ? "↓" : "↑";
  const changePct = Math.abs(opts.percentChange).toFixed(1);
  const horizonLabel = opts.horizon === "7d" ? "7-day" : "30-day";
  const actionMsg = isDrop
    ? `Good time to buy early — prices are expected to fall over the next 7 days.`
    : `Consider holding your stock — prices are expected to rise over the next 30 days.`;
  const roleLabel = opts.targetRole === "buyer" ? "Buyer" : "Farmer";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>AgroPredict Price Alert</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

        <!-- Header -->
        <tr>
          <td style="background:#1b4332;padding:24px 32px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td>
                  <span style="color:#ffffff;font-size:20px;font-weight:800;letter-spacing:-0.3px;">🌿 AgroPredict Nepal</span>
                </td>
                <td align="right">
                  <span style="background:rgba(255,255,255,0.15);color:#d1fae5;font-size:12px;font-weight:600;padding:4px 10px;border-radius:20px;">
                    Price Alert
                  </span>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Direction Banner -->
        <tr>
          <td style="background:${bgChip};padding:20px 32px;text-align:center;">
            <span style="font-size:48px;line-height:1;">${arrowSymbol}</span>
            <div style="font-size:28px;font-weight:900;color:${accentColor};margin-top:4px;">
              ${isDrop ? "Price Drop Alert" : "Price Rise Alert"}
            </div>
            <div style="font-size:14px;color:#475569;margin-top:6px;">
              ${horizonLabel} forecast &nbsp;·&nbsp; ${opts.commodity}
            </div>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:28px 32px;">

            <p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.6;">
              Hi <strong>${roleLabel}</strong>, our model has detected a significant price movement
              for <strong>${opts.commodity}</strong> based on today's Kalimati Market data.
            </p>

            <!-- Price Cards -->
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
              <tr>
                <td width="48%" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px;text-align:center;">
                  <div style="font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">Current Price</div>
                  <div style="font-size:26px;font-weight:800;color:#1e293b;">NPR ${opts.currentPrice.toFixed(0)}</div>
                  <div style="font-size:11px;color:#94a3b8;margin-top:3px;">Today's avg</div>
                </td>
                <td width="4%" style="text-align:center;font-size:22px;color:#94a3b8;">${arrowSymbol}</td>
                <td width="48%" style="background:${bgChip};border:1px solid ${accentColor}33;border-radius:10px;padding:16px;text-align:center;">
                  <div style="font-size:11px;font-weight:700;color:${accentColor};text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">Forecast Price</div>
                  <div style="font-size:26px;font-weight:800;color:${accentColor};">NPR ${opts.forecastPrice.toFixed(0)}</div>
                  <div style="font-size:11px;color:${accentColor};margin-top:3px;">${changePct}% ${isDrop ? "lower" : "higher"} in ${opts.horizon}</div>
                </td>
              </tr>
            </table>

            <!-- Action Tip -->
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
              <tr>
                <td style="background:#eff6ff;border-left:4px solid #3b82f6;border-radius:0 8px 8px 0;padding:14px 16px;">
                  <div style="font-size:12px;font-weight:700;color:#1d4ed8;margin-bottom:4px;">💡 RECOMMENDATION</div>
                  <div style="font-size:14px;color:#1e40af;line-height:1.5;">${actionMsg}</div>
                </td>
              </tr>
            </table>

            <!-- CTA -->
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
              <tr>
                <td align="center">
                  <a href="http://localhost:5173/dashboard"
                     style="display:inline-block;background:#1b4332;color:#ffffff;font-size:14px;font-weight:700;padding:13px 32px;border-radius:8px;text-decoration:none;letter-spacing:0.2px;">
                    View Dashboard →
                  </a>
                </td>
              </tr>
            </table>

            <hr style="border:none;border-top:1px solid #e2e8f0;margin:0 0 20px;"/>

            <p style="margin:0;font-size:12px;color:#94a3b8;line-height:1.6;">
              This alert was generated by the AgroPredict Nepal ML model using data from
              <strong>Kalimati Market, Kathmandu</strong>. Forecasts are based on historical trends
              and may not reflect sudden market changes. Always verify with local market conditions.
              <br/><br/>
              You are receiving this because your account (${opts.recipientEmail}) is registered
              as a <strong>${roleLabel}</strong> on AgroPredict Nepal.
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#1e293b;padding:16px 32px;text-align:center;">
            <span style="color:rgba(255,255,255,0.5);font-size:12px;">
              © ${new Date().getFullYear()} AgroPredict Nepal &nbsp;·&nbsp; Powered by Kalimati Market data
            </span>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export async function sendPriceAlertEmail(opts: {
  toEmail: string;
  commodity: string;
  direction: "DROP" | "RISE";
  horizon: "7d" | "30d";
  percentChange: number;
  currentPrice: number;
  forecastPrice: number;
  targetRole: "buyer" | "farmer";
}): Promise<void> {
  const subject = `AgroPredict Alert: ${opts.commodity} price expected to ${opts.direction === "DROP" ? `drop ${Math.abs(opts.percentChange).toFixed(1)}%` : `rise ${opts.percentChange.toFixed(1)}%`} over ${opts.horizon}`;

  const html = buildHtml({ ...opts, recipientEmail: opts.toEmail });

  await getTransporter().sendMail({
    from: `"AgroPredict Nepal" <${env.smtp.from}>`,
    to: opts.toEmail,
    subject,
    html,
  });
}

export async function sendBulkPriceAlertEmails(
  recipients: string[],
  opts: Omit<Parameters<typeof sendPriceAlertEmail>[0], "toEmail">
): Promise<{ sent: number; failed: number }> {
  if (!isEmailConfigured()) {
    console.warn("[Email] SMTP not configured — skipping email delivery. Set SMTP_USER and SMTP_PASS in .env");
    return { sent: 0, failed: 0 };
  }

  let sent = 0;
  let failed = 0;

  const BATCH = 5;
  for (let i = 0; i < recipients.length; i += BATCH) {
    const batch = recipients.slice(i, i + BATCH);
    await Promise.all(
      batch.map(async (email) => {
        try {
          await sendPriceAlertEmail({ ...opts, toEmail: email });
          sent++;
        } catch (err) {
          failed++;
          console.error(`[Email] Failed to send to ${email}:`, err instanceof Error ? err.message : err);
        }
      })
    );
  }

  return { sent, failed };
}

export interface DigestAlert {
  commodity: string;
  direction: "DROP" | "RISE";
  percentChange: number;
  currentPrice: number;
  forecastPrice: number;
  horizon: "7d" | "30d";
}

function buildDigestHtml(opts: {
  role: "buyer" | "farmer";
  periodLabel: string;
  alerts: DigestAlert[];
  recipientEmail: string;
}): string {
  const roleLabel = opts.role === "buyer" ? "Buyer" : "Farmer";
  const accentColor = opts.role === "buyer" ? "#1d4ed8" : "#15803d";
  const title = opts.role === "buyer" ? "Weekly Price Drop Report" : "Monthly Price Rise Report";

  const rows = opts.alerts
    .map((a) => {
      const isDrop = a.direction === "DROP";
      const color = isDrop ? "#dc2626" : "#16a34a";
      const arrow = isDrop ? "↓" : "↑";
      return `
      <tr style="border-bottom:1px solid #e2e8f0;">
        <td style="padding:10px 12px;font-size:13px;color:#1e293b;font-weight:600;">${a.commodity}</td>
        <td style="padding:10px 12px;font-size:13px;color:${color};font-weight:700;">${arrow} ${Math.abs(a.percentChange).toFixed(1)}%</td>
        <td style="padding:10px 12px;font-size:13px;color:#64748b;">NPR ${a.currentPrice.toFixed(0)}</td>
        <td style="padding:10px 12px;font-size:13px;color:${color};font-weight:600;">NPR ${a.forecastPrice.toFixed(0)}</td>
        <td style="padding:10px 12px;font-size:12px;color:#94a3b8;">${a.horizon}</td>
      </tr>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>AgroPredict ${title}</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        <tr>
          <td style="background:#1b4332;padding:24px 32px;">
            <table width="100%" cellpadding="0" cellspacing="0"><tr>
              <td><span style="color:#ffffff;font-size:20px;font-weight:800;">🌿 AgroPredict Nepal</span></td>
              <td align="right"><span style="background:rgba(255,255,255,0.15);color:#d1fae5;font-size:12px;font-weight:600;padding:4px 10px;border-radius:20px;">${title}</span></td>
            </tr></table>
          </td>
        </tr>
        <tr>
          <td style="background:#f8fafc;padding:20px 32px;border-bottom:1px solid #e2e8f0;">
            <p style="margin:0;font-size:15px;color:#374151;line-height:1.6;">
              Hi <strong>${roleLabel}</strong>, here is your <strong>${opts.periodLabel}</strong> price alert digest
              from the Kalimati Market. ${opts.alerts.length} commodit${opts.alerts.length === 1 ? "y" : "ies"} flagged.
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:24px 32px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
              <thead>
                <tr style="background:${accentColor};">
                  <th style="padding:10px 12px;font-size:11px;color:#fff;font-weight:700;text-align:left;text-transform:uppercase;letter-spacing:0.5px;">Commodity</th>
                  <th style="padding:10px 12px;font-size:11px;color:#fff;font-weight:700;text-align:left;text-transform:uppercase;letter-spacing:0.5px;">Change</th>
                  <th style="padding:10px 12px;font-size:11px;color:#fff;font-weight:700;text-align:left;text-transform:uppercase;letter-spacing:0.5px;">Current</th>
                  <th style="padding:10px 12px;font-size:11px;color:#fff;font-weight:700;text-align:left;text-transform:uppercase;letter-spacing:0.5px;">Forecast</th>
                  <th style="padding:10px 12px;font-size:11px;color:#fff;font-weight:700;text-align:left;text-transform:uppercase;letter-spacing:0.5px;">Horizon</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:0 32px 28px;" align="center">
            <a href="http://localhost:5173/dashboard"
               style="display:inline-block;background:#1b4332;color:#ffffff;font-size:14px;font-weight:700;padding:13px 32px;border-radius:8px;text-decoration:none;">
              View Dashboard →
            </a>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 32px;border-top:1px solid #e2e8f0;">
            <p style="margin:0;font-size:12px;color:#94a3b8;line-height:1.6;">
              You are receiving this because your account (${opts.recipientEmail}) is registered as a
              <strong>${roleLabel}</strong> on AgroPredict Nepal. Forecasts are based on Kalimati Market
              historical data and may not reflect sudden market changes.
            </p>
          </td>
        </tr>
        <tr>
          <td style="background:#1e293b;padding:16px 32px;text-align:center;">
            <span style="color:rgba(255,255,255,0.5);font-size:12px;">© ${new Date().getFullYear()} AgroPredict Nepal · Powered by Kalimati Market data</span>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export async function sendSubscriptionWelcomeEmail(opts: {
  toEmail: string;
  crops: string[];
  role: "buyer" | "farmer";
  todayPrices?: Record<string, number>;
  forecastPrices?: Record<string, number[]>;
}): Promise<void> {
  if (!isEmailConfigured()) {
    console.warn("[Email] SMTP not configured — skipping subscription welcome email.");
    return;
  }

  const horizonLabel = opts.role === "buyer" ? "7-Day Forecast Avg" : "30-Day Forecast Avg";

  const cropRows = opts.crops
    .map((c) => {
      const price = opts.todayPrices?.[c];
      const forecasts = opts.forecastPrices?.[c] ?? [];
      const avgForecast = forecasts.length > 0
        ? forecasts.reduce((s, p) => s + p, 0) / forecasts.length
        : null;

      const priceCell = price != null
        ? `<td style="padding:10px 16px;font-size:14px;color:#15803d;font-weight:700;">Rs. ${price.toFixed(0)} / KG</td>`
        : `<td style="padding:10px 16px;font-size:13px;color:#94a3b8;">—</td>`;
      const forecastCell = avgForecast != null
        ? `<td style="padding:10px 16px;font-size:14px;color:#2563eb;font-weight:700;">Rs. ${avgForecast.toFixed(0)} / KG</td>`
        : `<td style="padding:10px 16px;font-size:13px;color:#94a3b8;">—</td>`;

      return `<tr style="border-bottom:1px solid #e5e7eb;">
        <td style="padding:10px 16px;font-size:14px;color:#1e293b;font-weight:600;">${c}</td>
        ${priceCell}
        ${forecastCell}
      </tr>`;
    })
    .join("");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>AgroPrice Prediction — Subscription Confirmed</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;">
    <tr><td align="center">
      <table width="540" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

        <tr>
          <td style="background:#1b4332;padding:24px 32px;">
            <div style="color:#ffffff;font-size:20px;font-weight:800;">AgroPrice Prediction</div>
            <div style="color:rgba(255,255,255,0.6);font-size:12px;margin-top:3px;">Kalimati Market · Nepal</div>
          </td>
        </tr>

        <tr>
          <td style="background:#ecfdf5;padding:20px 32px;border-bottom:2px solid #a7f3d0;">
            <div style="font-size:22px;font-weight:800;color:#15803d;">You have subscribed to AgroPrice Prediction</div>
            <div style="font-size:13px;color:#166534;margin-top:6px;">
              We will notify you about your selected crops daily.
            </div>
          </td>
        </tr>

        <tr>
          <td style="padding:24px 32px;">
            <p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.7;">
              Hi, your crop price alerts are now active. Below are your subscribed commodities and their prices from <strong>Kalimati Market</strong> today:
            </p>

            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;margin-bottom:24px;">
              <thead>
                <tr style="background:#f8fafc;">
                  <th style="padding:10px 16px;font-size:11px;color:#6b7280;font-weight:700;text-align:left;text-transform:uppercase;letter-spacing:0.4px;">Commodity</th>
                  <th style="padding:10px 16px;font-size:11px;color:#6b7280;font-weight:700;text-align:left;text-transform:uppercase;letter-spacing:0.4px;">Today's Price</th>
                  <th style="padding:10px 16px;font-size:11px;color:#2563eb;font-weight:700;text-align:left;text-transform:uppercase;letter-spacing:0.4px;">${horizonLabel}</th>
                </tr>
              </thead>
              <tbody>${cropRows}</tbody>
            </table>

            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
              <tr>
                <td style="background:#f0fdf4;border-left:4px solid #16a34a;border-radius:0 8px 8px 0;padding:12px 16px;">
                  <div style="font-size:13px;color:#166534;line-height:1.6;">
                    ${opts.role === "buyer"
                      ? "You will receive price drop alerts — helping you buy at the right time."
                      : "You will receive price rise alerts — helping you sell at the best time."}
                  </div>
                </td>
              </tr>
            </table>

            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
              <tr>
                <td align="center">
                  <a href="http://localhost:5173/dashboard"
                     style="display:inline-block;background:#1b4332;color:#ffffff;font-size:14px;font-weight:700;padding:12px 28px;border-radius:8px;text-decoration:none;">
                    View Dashboard →
                  </a>
                </td>
              </tr>
            </table>

            <p style="margin:0;font-size:11px;color:#9ca3af;line-height:1.6;">
              Sent to ${opts.toEmail} · AgroPrice Prediction Nepal · Kalimati Market data
            </p>
          </td>
        </tr>

        <tr>
          <td style="background:#1e293b;padding:14px 32px;text-align:center;">
            <span style="color:rgba(255,255,255,0.45);font-size:11px;">
              &copy; ${new Date().getFullYear()} AgroPrice Prediction Nepal
            </span>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  await getTransporter().sendMail({
    from: `"AgroPrice Prediction" <${env.smtp.from}>`,
    to: opts.toEmail,
    subject: `You have subscribed to AgroPrice Prediction — daily price updates active`,
    html,
  });
}

export async function sendDigestEmail(opts: {
  toEmails: string[];
  role: "buyer" | "farmer";
  periodLabel: string;
  alerts: DigestAlert[];
}): Promise<{ sent: number; failed: number }> {
  if (!isEmailConfigured()) {
    console.warn("[Email] SMTP not configured — skipping digest. Set SMTP_USER and SMTP_PASS in .env");
    return { sent: 0, failed: 0 };
  }
  if (opts.alerts.length === 0) {
    console.log(`[Email] No ${opts.role} alerts in period — skipping digest`);
    return { sent: 0, failed: 0 };
  }

  const roleLabel = opts.role === "buyer" ? "Buyer" : "Farmer";
  const subject = `AgroPredict ${roleLabel} Report: ${opts.alerts.length} price alert${opts.alerts.length === 1 ? "" : "s"} (${opts.periodLabel})`;

  let sent = 0;
  let failed = 0;
  const BATCH = 5;

  for (let i = 0; i < opts.toEmails.length; i += BATCH) {
    const batch = opts.toEmails.slice(i, i + BATCH);
    await Promise.all(
      batch.map(async (email) => {
        try {
          const html = buildDigestHtml({ role: opts.role, periodLabel: opts.periodLabel, alerts: opts.alerts, recipientEmail: email });
          await getTransporter().sendMail({
            from: `"AgroPredict Nepal" <${env.smtp.from}>`,
            to: email,
            subject,
            html,
          });
          sent++;
        } catch (err) {
          failed++;
          console.error(`[Email] Digest failed to ${email}:`, err instanceof Error ? err.message : err);
        }
      })
    );
  }

  return { sent, failed };
}
