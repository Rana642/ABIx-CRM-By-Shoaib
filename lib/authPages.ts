// The console's sign-in, invitation and two-step pages: plain server-rendered HTML with no script,
// in the same dark style as the connector sign-in page.

export const esc = (s: string) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "default-src 'none'; img-src data:; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'",
};

export function authPage(title: string, body: string, status = 200, extraHeaders: Record<string, string> = {}) {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<style>
  :root{color-scheme:dark}
  body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px 16px;
       background:#0B1220;color:#E2E8F0;font:15px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif}
  main{width:100%;max-width:420px;background:#111a2e;border:1px solid #1f2b45;border-radius:14px;padding:28px}
  .mark{font:600 13px/1 system-ui;letter-spacing:.14em;text-transform:uppercase;color:#00E5D1;margin-bottom:14px}
  h1{font-size:21px;line-height:1.3;margin:0 0 10px}
  p{margin:0 0 14px;color:#94A3B8}
  label{display:block;font-size:13px;color:#94A3B8;margin:14px 0 6px}
  input{width:100%;box-sizing:border-box;padding:11px 12px;border-radius:9px;border:1px solid #2a3a5c;
        background:#0B1220;color:#E2E8F0;font:inherit}
  input:focus{outline:2px solid #00E5D1;outline-offset:1px}
  button{margin-top:20px;width:100%;padding:12px;border:0;border-radius:9px;background:#00E5D1;color:#0B1220;
         font:600 15px system-ui;cursor:pointer}
  button:focus-visible{outline:2px solid #E2E8F0;outline-offset:2px}
  .err{background:#3a1e1b;color:#f4c7c2;border-radius:9px;padding:10px 12px;margin:0 0 6px;font-size:14px}
  .qr{display:block;margin:10px auto;background:#fff;border-radius:10px;padding:8px;width:200px;height:200px}
  code{font:13px ui-monospace,Menlo,monospace;background:#0B1220;border:1px solid #2a3a5c;border-radius:6px;padding:2px 6px;word-break:break-all}
  a{color:#00E5D1}
</style></head><body><main><div class="mark">Aya console</div>${body}</main></body></html>`;
  return new Response(html, { status, headers: { ...HEADERS, ...extraHeaders } });
}

export const errorBox = (message?: string) => (message ? `<div class="err" role="alert">${esc(message)}</div>` : '');

// Only same-site paths are followed after signing in.
export function safeNext(next: string | null | undefined): string {
  const n = String(next ?? '/');
  return n.startsWith('/') && !n.startsWith('//') && !n.startsWith('/login') ? n : '/';
}

export function clientIp(req: Request): string | null {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || null;
}
