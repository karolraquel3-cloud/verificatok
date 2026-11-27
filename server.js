const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

// Carga opcional de .env sin dependencias externas.
try {
  for (const line of fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
} catch {}

const root = path.join(__dirname, 'public');
const port = Number(process.env.PORT || 3000);
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml' };
const send = (res, status, data) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); };

function classifyRating(rating = '') {
  const value = rating.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (/fals|false|incorrect|incorrecto|not true|no es cierto/.test(value)) return 'FALSA';
  if (/misleading|enganos|engaños|fuera de contexto|half true|incompleta/.test(value)) return 'ENGAÑOSA';
  if (/true|verdader|correct|ciert/.test(value)) return 'VERIFICADA';
  return 'NO VERIFICABLE';
}

async function extractClaims(text) {
  if (!process.env.GEMINI_API_KEY) return [text];
  try {
    const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
    const prompt = `Extrae las afirmaciones verificables del siguiente texto en español. Devuelve únicamente JSON válido con esta forma: {"claims":["..."]}. No inventes, no opines y conserva el sentido original. Si no hay afirmaciones verificables, devuelve {"claims":[]}. Texto:\n${text}`;
    const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0, responseMimeType: 'application/json' } }) });
    if (!response.ok) return [text];
    const data = await response.json();
    const raw = data.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('') || '{"claims":[]}';
    const parsed = JSON.parse(raw.replace(/^```json\s*|\s*```$/g, '').trim());
    return Array.isArray(parsed.claims) ? parsed.claims.map(item => String(item).trim()).filter(item => item.length >= 12).slice(0, 5) : [text];
  } catch { return [text]; }
}

async function searchFactChecks(query) {
  const url = new URL('https://factchecktools.googleapis.com/v1alpha1/claims:search');
  url.searchParams.set('query', query);
  url.searchParams.set('languageCode', process.env.FACTCHECK_LANGUAGE || 'es');
  url.searchParams.set('pageSize', '5');
  url.searchParams.set('key', process.env.FACTCHECK_API_KEY);
  const response = await fetch(url);
  if (!response.ok) throw new Error('Fact Check Tools respondió con un error.');
  const data = await response.json();
  return (data.claims || []).map(item => {
    const review = item.claimReview?.[0] || {};
    return {
      text: item.text || query,
      claimant: item.claimant || '',
      rating: review.textualRating || 'Sin calificación indicada',
      classification: classifyRating(review.textualRating || ''),
      publisher: review.publisher?.name || 'Fuente de verificación',
      url: review.url || '',
      reviewDate: review.reviewDate || ''
    };
  });
}

async function analyze(req, res) {
  let raw = '';
  for await (const chunk of req) { raw += chunk; if (raw.length > 50_000) return send(res, 413, { error: 'El texto enviado es demasiado largo.' }); }
  let body;
  try { body = JSON.parse(raw); } catch { return send(res, 400, { error: 'No pudimos leer la solicitud.' }); }
  const claim = String(body.claim || '').trim();
  if (claim.length < 12 || claim.length > 3000) return send(res, 400, { error: 'Escribe una afirmación de entre 12 y 3,000 caracteres.' });
  if (!process.env.FACTCHECK_API_KEY) {
    return send(res, 200, { configured: false, message: 'La búsqueda de verificaciones aún no está conectada. No se generó una conclusión.', geminiConfigured: Boolean(process.env.GEMINI_API_KEY) });
  }
  try {
    const claimsToCheck = await extractClaims(claim);
    const results = (await Promise.all(claimsToCheck.map(searchFactChecks))).flat().slice(0, 8);
    return send(res, 200, { configured: true, checkedAt: new Date().toISOString(), claims: results, searchedClaims: claimsToCheck });
  } catch (error) {
    return send(res, 502, { error: 'No fue posible consultar Fact Check Tools en este momento.' });
  }
}

http.createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === '/api/analyze') return analyze(req, res);
  if (req.url.startsWith('/api/')) return send(res, 404, { error: 'Ruta de API no encontrada.' });
  const requested = decodeURIComponent((req.url || '/').split('?')[0]);
  const file = path.resolve(root, `.${requested === '/' ? '/index.html' : requested}`);
  if (!file.startsWith(root + path.sep) && file !== path.join(root, 'index.html')) { res.writeHead(403); return res.end('Forbidden'); }
  fs.readFile(file, (err, content) => {
    if (err) { res.writeHead(404); return res.end('No encontrado'); }
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' }); res.end(content);
  });
}).listen(port, () => console.log(`VerificaTok disponible en http://localhost:${port}`));
