const form = document.querySelector('#analyze-form');
const urlInput = document.querySelector('#tiktok-url');
const claimInput = document.querySelector('#claim');
const errorBox = document.querySelector('#form-error');
const resultArea = document.querySelector('#result-area');
const submitButton = document.querySelector('#submit-button');
const count = document.querySelector('#char-count');
const urlHint = document.querySelector('#url-hint');

function validTikTokUrl(value) {
  if (!value.trim()) return true;
  try { const url = new URL(value); return url.protocol === 'https:' && /(^|\.)tiktok\.com$/i.test(url.hostname); }
  catch { return false; }
}
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function validSource(value) { try { const u = new URL(value); return u.protocol === 'https:'; } catch { return false; } }

claimInput.addEventListener('input', () => { count.textContent = `${claimInput.value.length.toLocaleString('es-MX')} / 3,000`; });
document.querySelector('#validate-url').addEventListener('click', () => {
  const ok = validTikTokUrl(urlInput.value);
  urlHint.textContent = ok ? (urlInput.value ? 'Enlace reconocido. Recuerda que no reproducimos ni descargamos el video.' : 'Aceptamos enlaces públicos de TikTok.') : 'Ese enlace no parece ser de TikTok. Revisa que empiece con https://www.tiktok.com/';
  urlHint.classList.toggle('invalid', !ok);
});
urlInput.addEventListener('blur', () => { if (urlInput.value) document.querySelector('#validate-url').click(); });

form.addEventListener('submit', async event => {
  event.preventDefault(); errorBox.textContent = ''; resultArea.innerHTML = '';
  if (!validTikTokUrl(urlInput.value)) { errorBox.textContent = 'Escribe un enlace válido de TikTok o deja el campo vacío.'; urlInput.focus(); return; }
  const claim = claimInput.value.trim();
  if (claim.length < 12) { errorBox.textContent = 'Añade una afirmación más completa (al menos 12 caracteres) para poder buscarla.'; claimInput.focus(); return; }
  submitButton.disabled = true; submitButton.innerHTML = '<span>Consultando fuentes…</span><span class="spinner"></span>';
  try {
    const response = await fetch('/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ claim, tiktokUrl: urlInput.value.trim() }) });
    const responseText = await response.text();
    let data;
    try { data = JSON.parse(responseText); } catch {
      data = { configured: false, message: 'La vista previa está funcionando, pero el servidor de análisis todavía no está conectado.' };
    }
    if (!response.ok && data.configured !== false) throw new Error(data.error || 'No se pudo completar la consulta.');
    if (!data.configured) {
      resultArea.innerHTML = `<div class="result-box"><span class="label">MODO DEMOSTRACIÓN</span><h4>La verificación real aún no está conectada</h4><p>${escapeHtml(data.message)} Añade una clave de Google Fact Check Tools en el servidor para consultar verificaciones existentes. ${data.geminiConfigured ? 'Gemini está listo para extraer afirmaciones, pero todavía no hay evidencia consultada.' : 'También puedes añadir GEMINI_API_KEY para extraer afirmaciones automáticamente.'} No se analizó el video ni se asignó una clasificación.</p></div>`;
    } else if (!data.claims?.length) {
      resultArea.innerHTML = `<div class="result-box"><span class="label">NO VERIFICABLE</span><h4>No encontramos verificaciones coincidentes</h4><p>La búsqueda consultó Google Fact Check Tools el ${new Date(data.checkedAt).toLocaleString('es-MX')}. Esto no demuestra que la afirmación sea verdadera o falsa; significa que esta consulta no encontró una verificación pública coincidente.</p></div>`;
    } else {
      const results = data.claims.map(item => `<div class="result-box"><span class="label success">${escapeHtml(item.classification || 'VERIFICACIÓN PUBLICADA')}</span><h4>${escapeHtml(item.text || claim)}</h4><p><b>Calificación publicada:</b> ${escapeHtml(item.rating)}${item.claimant ? ` · <b>Atribuida a:</b> ${escapeHtml(item.claimant)}` : ''}</p><p><b>Medio verificador:</b> ${escapeHtml(item.publisher)}${item.reviewDate ? ` · <b>Fecha:</b> ${escapeHtml(item.reviewDate)}` : ''}</p>${validSource(item.url) ? `<a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">Consultar verificación original ↗</a>` : ''}</div>`).join('');
      resultArea.innerHTML = `<div><p class="field-hint">Coincidencias en Google Fact Check Tools · ${new Date(data.checkedAt).toLocaleString('es-MX')}</p>${results}<p class="field-hint">Las calificaciones corresponden a cada medio verificador citado; revisa la fuente original y su contexto.</p></div>`;
    }
    resultArea.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } catch (error) { resultArea.innerHTML = `<div class="result-box"><h4>No pudimos completar la búsqueda</h4><p>${escapeHtml(error.message)} Intenta de nuevo más tarde.</p></div>`; }
  finally { submitButton.disabled = false; submitButton.innerHTML = '<span>Buscar verificaciones</span><span>→</span>'; }
});

const menuButton = document.querySelector('.menu-toggle');
menuButton.addEventListener('click', () => { const nav = document.querySelector('.nav'); const open = nav.classList.toggle('open'); menuButton.setAttribute('aria-expanded', String(open)); menuButton.textContent = open ? '×' : '☰'; });
document.querySelectorAll('.nav a').forEach(link => link.addEventListener('click', () => { document.querySelector('.nav').classList.remove('open'); menuButton.setAttribute('aria-expanded', 'false'); menuButton.textContent = '☰'; }));
