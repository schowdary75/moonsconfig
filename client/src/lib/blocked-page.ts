export function renderBlockedPage(ip: string, reason: string, blockedAt: string): string {
  const dateStr = new Date(blockedAt).toUTCString();
  const ticketId = Math.random().toString(36).substring(2, 10).toUpperCase();
  const escapeHtml = (value: string) =>
    value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  const safeIp = escapeHtml(ip);
  const safeReason = escapeHtml(reason);
  const safeDateStr = escapeHtml(dateStr);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Access Denied — MooN</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,400;0,9..144,600;1,9..144,400&family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet">
    <style>
      :root {
        --background: #0f131a;
        --foreground: #f3f4f6;
        --card: #181d26;
        --border: rgba(255, 255, 255, 0.08);
        --accent: #ef4444;
        --accent-hover: #dc2626;
        --muted: #9ca3af;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        padding: 1.5rem;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background-color: var(--background);
        color: var(--foreground);
        font-family: "Inter", system-ui, -apple-system, sans-serif;
        -webkit-font-smoothing: antialiased;
      }
      .container {
        max-width: 32rem;
        width: 100%;
        text-align: center;
        padding: 3rem 2rem;
      }
      h1 {
        font-family: "Fraunces", Georgia, serif;
        font-size: 2.5rem;
        font-weight: 300;
        margin: 0 0 1rem;
        letter-spacing: -0.02em;
      }
      h1 span {
        font-style: italic;
        color: var(--accent);
      }
      p {
        color: var(--muted);
        font-size: 0.95rem;
        line-height: 1.6;
        margin: 0 0 2rem;
      }
      .shield-icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 4.5rem;
        height: 4.5rem;
        border-radius: 50%;
        background-color: rgba(239, 68, 68, 0.1);
        border: 1px solid rgba(239, 68, 68, 0.2);
        color: var(--accent);
        margin-bottom: 2rem;
      }
      .details-card {
        background-color: var(--card);
        border: 1px solid var(--border);
        border-radius: 1.5rem;
        padding: 1.5rem;
        text-align: left;
        margin-bottom: 2rem;
      }
      .details-title {
        font-size: 0.75rem;
        text-transform: uppercase;
        letter-spacing: 0.15em;
        color: var(--muted);
        border-bottom: 1px solid var(--border);
        padding-bottom: 0.75rem;
        margin-top: 0;
        margin-bottom: 0.75rem;
      }
      .detail-row {
        display: flex;
        justify-content: space-between;
        font-size: 0.85rem;
        padding: 0.35rem 0;
      }
      .detail-label {
        color: var(--muted);
      }
      .detail-value {
        font-family: monospace;
        color: var(--foreground);
        word-break: break-all;
      }
      .footer-text {
        font-size: 0.8rem;
        color: var(--muted);
        line-height: 1.5;
      }
      .footer-text a {
        color: var(--foreground);
        text-decoration: underline;
        text-underline-offset: 4px;
        transition: color 0.2s;
      }
      .footer-text a:hover {
        color: var(--accent);
      }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="shield-icon">
        <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
      </div>
      <h1>Access <span>Denied.</span></h1>
      <p>
        Our security system has detected suspicious automated activity from your network. Access to MooN has been temporarily restricted to protect our services.
      </p>
      
      <div class="details-card">
        <h3 class="details-title">Security Report</h3>
        <div class="detail-row">
          <span class="detail-label">IP Address</span>
          <span class="detail-value">${safeIp}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Violation</span>
          <span class="detail-value">${safeReason}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Timestamp</span>
          <span class="detail-value">${safeDateStr}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Reference ID</span>
          <span class="detail-value">#${ticketId}</span>
        </div>
      </div>
      
      <div class="footer-text">
        If you believe this is an error, please contact us at 
        <a href="mailto:support@moonsholiday.com?subject=IP%20Block%20Appeal%20${ticketId}">support@moonsholiday.com</a>
        including the Security Report details above so we can investigate and unblock you.
      </div>
    </div>
  </body>
</html>`;
}
