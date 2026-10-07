// Sensitive numbers in WhatsApp messages (T10, Serge 3–4 Oct 2026). The same rules as the "Mask Sensitive Data" step
// that runs before the model in n8n (aya-os-local/generators/gen_redaction.py): card numbers (Luhn-checked), IBANs,
// French social-security numbers and passport or ID numbers. The database keeps the original; the console shows it
// only to someone with sensitive.view on that business, and every such view is logged.

function luhn(d: string): boolean {
  let s = 0;
  let alt = false;
  for (let i = d.length - 1; i >= 0; i--) {
    let n = +d[i];
    if (alt) { n *= 2; if (n > 9) n -= 9; }
    s += n;
    alt = !alt;
  }
  return s % 10 === 0;
}

export function maskSensitive(original: string | null | undefined): { text: string; masked: number } {
  if (!original) return { text: original ?? '', masked: 0 };
  let masked = 0;
  let text = String(original);
  text = text.replace(/\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]){11,30}\b/gi, (m) => {
    const tail = (m.match(/(?:[ ][A-Za-z]+)+$/) || [''])[0];
    const core = m.slice(0, m.length - tail.length);
    const c = core.replace(/\s/g, '');
    if (c.length < 15 || c.length > 34 || !/\d{6,}/.test(c)) return m;
    masked++;
    return '[IBAN hidden]' + tail;
  });
  text = text.replace(/\b(?:\d[ -]?){12,18}\d\b/g, (m) => {
    const d = m.replace(/\D/g, '');
    if (d.length < 13 || d.length > 19 || !luhn(d)) return m;
    masked++;
    return '[card number hidden]';
  });
  text = text.replace(/\b[12](?:[ ]?\d){14}\b/g, () => { masked++; return '[ID number hidden]'; });
  text = text.replace(
    /\b(passport|passeport|id card|carte d'identit[ée]|national id)(\s*(?:no\.?|number|num[ée]ro|n°|#)?\s*(?:is\s+|est\s+)?:?\s*)([A-Z0-9]{6,12})\b/gi,
    (m, w, sep, num) => { if (!/\d/.test(num)) return m; masked++; return w + sep + '[number hidden]'; },
  );
  return { text, masked };
}
