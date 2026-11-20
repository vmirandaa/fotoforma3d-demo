// Versión de demostración: simula el servidor (server.mjs) en el navegador para poder
// mostrar el sitio en GitHub Pages. No genera figuras reales ni envía correos:
// la vista previa usa el modelo de muestra y las reservas quedan solo en este navegador.
(function () {
  const STORE_KEY = 'forma-demo-pedidos';
  const STATES_KEY = 'forma-demo-estados';
  const SESSION_KEY = 'forma-demo-admin';
  const ORDER_STATES = ['nueva', 'contactada', 'pagada', 'enviada', 'cancelada'];
  const MODEL_URL = 'assets/models/sample-figure.glb';
  const realFetch = window.fetch.bind(window);

  const hoursAgo = (h) => new Date(Date.now() - h * 3600 * 1000).toISOString();
  const SAMPLE_ORDERS = [
    { code: 'F-3A9C51E2', createdAt: hoursAgo(3), size: 'M', measure: '10 cm', finish: 'pintada', extrasText: 'base con nombre «Luna»', quantity: 1, price: 22990 + 14990 + 5990, name: 'Camila Rojas', email: 'camila@ejemplo.cl', petName: 'Luna', species: 'perro', petNotes: 'Tiene una mancha blanca en el pecho.', notes: 'Es un regalo de cumpleaños, ¿llega antes del 15?', photos: [{ file: 'F-3A9C51E2-foto-1.jpg', label: 'Front' }, { file: 'F-3A9C51E2-foto-2.jpg', label: 'Left' }, { file: 'F-3A9C51E2-foto-3.jpg', label: 'Right' }], hasModel: true },
    { code: 'F-7B21D0F4', createdAt: hoursAgo(28), size: 'S', measure: '8 cm', finish: 'blanco', extrasText: '', quantity: 2, price: 17990 * 2, name: 'Diego Muñoz', email: 'diego@ejemplo.cl', petName: 'Michi', species: 'gato', petNotes: '', notes: '', photos: [{ file: 'F-7B21D0F4-foto-1.jpg', label: '?' }], hasModel: true },
    { code: 'F-C04E8A19', createdAt: hoursAgo(75), size: 'L', measure: '12 cm', finish: 'pintada', extrasText: 'ánfora · estilo animado', quantity: 1, price: 31990 + 18990 + 14990 + 4990, name: 'Valentina Soto', email: 'valentina@ejemplo.cl', petName: 'Toby', species: 'perro', petNotes: 'Orejas caídas, pelaje café claro.', notes: 'Prefiero que me contacten por WhatsApp.', photos: [{ file: 'F-C04E8A19-foto-1.jpg', label: 'Front' }, { file: 'F-C04E8A19-foto-2.jpg', label: 'Back' }], hasModel: true },
    { code: 'F-91F2B3AD', createdAt: hoursAgo(170), size: 'XL', measure: '15 cm', finish: 'blanco', extrasText: 'cuadro 3D', quantity: 1, price: 45990 + 11990, name: 'Ignacio Pérez', email: 'ignacio@ejemplo.cl', petName: 'Kiwi', species: 'otro', petNotes: 'Es un conejo.', notes: '', photos: [{ file: 'F-91F2B3AD-foto-1.jpg', label: 'Front' }], hasModel: true }
  ];
  const SAMPLE_STATES = {
    'F-7B21D0F4': { status: 'contactada', updatedAt: hoursAgo(20) },
    'F-C04E8A19': { status: 'pagada', updatedAt: hoursAgo(50) },
    'F-91F2B3AD': { status: 'enviada', updatedAt: hoursAgo(30) }
  };

  function read(key, fallback) {
    try { const value = JSON.parse(localStorage.getItem(key)); return value ?? fallback; } catch { return fallback; }
  }
  function write(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* sin almacenamiento: la demo sigue en memoria */ }
  }
  function allOrders() {
    const states = { ...SAMPLE_STATES, ...read(STATES_KEY, {}) };
    return [...read(STORE_KEY, []), ...SAMPLE_ORDERS].map((order) => ({
      ...order,
      status: states[order.code]?.status || 'nueva',
      statusUpdatedAt: states[order.code]?.updatedAt || null
    }));
  }
  function json(status, payload) {
    return new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } });
  }
  async function bodyJson(init) {
    try { return JSON.parse(init && typeof init.body === 'string' ? init.body : '{}'); } catch { return {}; }
  }
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  // Fotos de ejemplo: un dibujo simple con el nombre de la mascota y el ángulo.
  const SPECIES_ICON = { perro: '🐶', gato: '🐱', otro: '🐰' };
  const PALETTE = ['#e7d8c3', '#d5e3d1', '#dcd6ea', '#f0d9d2'];
  function photoBlob(file) {
    const order = allOrders().find((item) => file.startsWith(item.code + '-'));
    const index = Number((file.match(/foto-(\d)/) || [])[1] || 1);
    const label = order?.photos?.[index - 1]?.label || '';
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600">' +
      '<rect width="600" height="600" fill="' + PALETTE[(index - 1) % PALETTE.length] + '"/>' +
      '<text x="300" y="330" font-size="220" text-anchor="middle">' + (SPECIES_ICON[order?.species] || '🐾') + '</text>' +
      '<text x="300" y="470" font-family="sans-serif" font-size="40" fill="#3a3a3a" text-anchor="middle">' + (order?.petName || 'Mascota') + (label && label !== '?' ? ' · ' + label : '') + '</text>' +
      '<text x="300" y="530" font-family="sans-serif" font-size="24" fill="#6a6a6a" text-anchor="middle">Foto de ejemplo (demo)</text></svg>';
    return new Blob([svg], { type: 'image/svg+xml' });
  }

  // Vistas previas simuladas: tardan unos segundos y entregan el modelo de muestra.
  const tasks = new Map();
  async function handleGenerate(init) {
    const form = init && init.body instanceof FormData ? init.body : new FormData();
    const id = 'demo-' + Math.random().toString(16).slice(2, 10);
    const images = form.getAll('images');
    const labels = form.getAll('image_label');
    tasks.set(id, {
      started: Date.now(),
      petName: String(form.get('petName') || ''),
      species: String(form.get('species') || 'perro'),
      petNotes: String(form.get('notes') || ''),
      photos: images.map((_, i) => ({ label: labels[i] || '?' }))
    });
    await wait(600);
    return json(202, { id });
  }
  function handleStatus(id) {
    const task = tasks.get(id);
    if (!task) return json(404, { error: 'No se encontró esta generación en el estudio.' });
    const elapsed = Date.now() - task.started;
    if (elapsed > 9000) return json(200, { status: 'done', modelReady: true });
    return json(200, { status: elapsed > 4000 ? 'generating' : 'queued' });
  }
  async function handleOrder(init) {
    const body = await bodyJson(init);
    const task = tasks.get(body.taskId);
    if (!task) return json(409, { error: 'La vista previa ya no está disponible. Genérala de nuevo para reservar.' });
    const catalog = await realFetch('data/catalog.json').then((r) => r.json());
    const size = catalog.tallas.find((item) => item.id === body.size);
    if (!size) return json(400, { error: 'Elige un tamaño para tu figura.' });
    const extras = catalog.extras || {};
    const pick = (list, id) => (Array.isArray(list) ? list.find((item) => item.id === id) || list[0] : null);
    const formato = pick(extras.formatos, body.format);
    const estilo = pick(extras.estilos, body.style);
    const base = pick(extras.bases, body.base);
    const parts = [];
    if (formato && formato.precio > 0) parts.push(formato.nombre.charAt(0).toLowerCase() + formato.nombre.slice(1));
    if (estilo && estilo.precio > 0) parts.push('estilo ' + estilo.nombre.toLowerCase());
    if (base && base.precio > 0) parts.push(base.conNombre ? base.nombre.toLowerCase() + ' «' + (body.baseName || '') + '»' : base.nombre.toLowerCase());
    const paint = body.finish === 'pintada' ? Number(size.pintada) || 0 : 0;
    const extra = [formato, estilo, base].reduce((total, item) => total + (Number(item?.precio) || 0), 0);
    const quantity = Number(body.quantity) || 1;
    const code = 'F-' + Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
    const order = {
      code, createdAt: new Date().toISOString(), size: size.id, measure: size.medida,
      finish: body.finish === 'pintada' ? 'pintada' : 'blanco', extrasText: parts.join(' · '), quantity,
      price: (size.precio + paint + extra) * quantity, name: body.name, email: body.email,
      petName: task.petName, species: task.species, petNotes: task.petNotes, notes: body.notes || '',
      photos: task.photos.map((photo, i) => ({ file: code + '-foto-' + (i + 1) + '.jpg', label: photo.label })),
      hasModel: true
    };
    write(STORE_KEY, [order, ...read(STORE_KEY, [])]);
    await wait(500);
    return json(201, { code });
  }
  async function findTracked(init) {
    const body = await bodyJson(init);
    let code = String(body.code || '').trim().toUpperCase();
    if (/^[0-9A-F]{8}$/.test(code)) code = 'F-' + code;
    const email = String(body.email || '').trim().toLowerCase();
    return allOrders().find((order) => order.code === code && String(order.email).toLowerCase() === email) || null;
  }
  const notFound = () => json(404, { error: 'No encontramos una reserva con ese código y correo. Revisa que estén escritos igual que en el correo de confirmación.' });
  const loggedIn = () => { try { return sessionStorage.getItem(SESSION_KEY) === '1'; } catch { return true; } };

  async function route(path, method, init) {
    if (path === '/api/health') return json(200, { ready: true });
    if (method === 'POST' && path === '/api/generate') return handleGenerate(init);
    if (path.startsWith('/api/status/')) return handleStatus(decodeURIComponent(path.slice(12)));
    if (path.startsWith('/api/model/')) return realFetch(MODEL_URL);
    if (method === 'POST' && path === '/api/order') return handleOrder(init);
    if (method === 'POST' && path === '/api/seguimiento') {
      const order = await findTracked(init);
      if (!order) return notFound();
      const { code, createdAt, status, statusUpdatedAt, measure, finish, extrasText, quantity, price, petName, species, hasModel } = order;
      return json(200, { code, createdAt, status, statusUpdatedAt, measure, finish, extrasText, quantity, price, petName, species, hasModel });
    }
    if (method === 'POST' && path === '/api/seguimiento/modelo') return (await findTracked(init)) ? realFetch(MODEL_URL) : notFound();
    if (method === 'POST' && path === '/api/admin/login') {
      const body = await bodyJson(init);
      if (!body.user || !body.password) return json(401, { error: 'Usuario o clave incorrectos.' });
      try { sessionStorage.setItem(SESSION_KEY, '1'); } catch {}
      return json(200, { ok: true });
    }
    if (method === 'POST' && path === '/api/admin/logout') {
      try { sessionStorage.removeItem(SESSION_KEY); } catch {}
      return json(200, { ok: true });
    }
    if (path.startsWith('/api/admin/')) {
      if (!loggedIn()) return json(401, { error: 'Tu sesión de administrador no está activa. Ingresa de nuevo.' });
      if (path === '/api/admin/session') return json(200, { ok: true });
      if (path === '/api/admin/orders') return json(200, { orders: allOrders(), states: ORDER_STATES });
      if (path.startsWith('/api/admin/model/')) return realFetch(MODEL_URL);
      if (path.startsWith('/api/admin/photo/')) return new Response(photoBlob(path.slice(17)), { status: 200 });
      const statusMatch = path.match(/^\/api\/admin\/orders\/(F-[0-9A-F]{8})\/status$/);
      if (method === 'POST' && statusMatch) {
        const body = await bodyJson(init);
        if (!ORDER_STATES.includes(body.status)) return json(400, { error: 'Estado no válido.' });
        const states = read(STATES_KEY, {});
        states[statusMatch[1]] = { status: body.status, updatedAt: new Date().toISOString() };
        write(STATES_KEY, states);
        return json(200, { code: statusMatch[1], status: body.status });
      }
    }
    return json(404, { error: 'No encontrado.' });
  }

  window.fetch = function (input, init) {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (typeof url === 'string' && url.startsWith('/api/')) {
      const path = url.split('?')[0];
      const method = String((init && init.method) || 'GET').toUpperCase();
      return route(path, method, init);
    }
    return realFetch(input, init);
  };

  // Aviso visible de que es una demostración.
  function addBanner() {
    const banner = document.createElement('div');
    banner.setAttribute('role', 'note');
    banner.style.cssText = 'position:fixed;left:50%;bottom:12px;transform:translateX(-50%);z-index:9999;background:#1f2a24;color:#f4f1ea;font:500 13px/1.4 system-ui,sans-serif;padding:8px 14px;border-radius:999px;box-shadow:0 4px 16px rgba(0,0,0,.2);max-width:calc(100% - 32px);text-align:center';
    banner.textContent = 'Versión de demostración · los datos son de ejemplo';
    document.body.append(banner);
  }
  if (document.body) addBanner(); else document.addEventListener('DOMContentLoaded', addBanner);
})();
