# VerificaTok

Aplicación web en español para consultar verificaciones públicas de afirmaciones compartidas en TikTok. El servidor no descarga ni reproduce videos; el usuario debe aportar la afirmación o transcripción.

## Ejecutar

1. Instala Node.js 18 o posterior.
2. Copia `.env.example` a `.env` y agrega una clave de Google Fact Check Tools API en `FACTCHECK_API_KEY`. Activa también la API de Gemini y agrega `GEMINI_API_KEY` si quieres extraer automáticamente afirmaciones de transcripciones largas.
3. Ejecuta `npm start` desde esta carpeta.
4. Abre http://localhost:3000.

Sin `FACTCHECK_API_KEY`, la interfaz se inicia en modo demostración y explica que no realizó una verificación real. No se asigna una calificación inventada. Las claves permanecen en el servidor.

## Integraciones y límites

- **Google Fact Check Tools API:** implementada en `POST /api/analyze`. Devuelve verificaciones existentes, atribución, calificación original, editor, fecha y enlace. La etiqueta VERIFICADA/FALSA/ENGAÑOSA/NO VERIFICABLE se deriva únicamente del texto de calificación publicado por el medio y se muestra junto con su fuente.
- **Google Gemini:** si configuras `GEMINI_API_KEY`, extrae hasta cinco afirmaciones atómicas en JSON antes de consultar Fact Check Tools. Gemini no decide por sí solo si una afirmación es verdadera; la respuesta se apoya en verificaciones publicadas.
- **Videos TikTok:** no se extraen metadatos ni transcripciones del enlace. Pega la afirmación/transcripción manualmente.
- **Fuentes oficiales:** esta versión consulta verificaciones indexadas por Fact Check Tools; no hace búsqueda web general de fuentes oficiales.

Antes de publicar, configura las claves como secretos del proveedor de hosting, usa HTTPS y define límites de uso para proteger la cuota de la API.

## Publicar gratis para revisión

El archivo `render.yaml` deja preparado un servicio web de Render con plan gratuito. Para publicarlo, sube este proyecto a un repositorio privado de GitHub, entra a Render, crea un servicio nuevo desde ese repositorio y conserva las variables secretas `GEMINI_API_KEY` y `FACTCHECK_API_KEY` en el panel de Environment. Render ejecutará `node server.js` y entregará una URL HTTPS pública. El plan gratuito puede suspender el servicio cuando no hay visitas, por lo que la primera carga puede tardar unos segundos.
