// Página "Mi pedido": seguimiento para clientes (código + correo) e ingreso de administrador.
const cuentaTabs = [
  { button: document.querySelector('#tab-cliente'), panel: document.querySelector('#panel-cliente'), name: 'cliente' },
  { button: document.querySelector('#tab-admin'), panel: document.querySelector('#panel-admin'), name: 'admin' }
];
const trackForm = document.querySelector('#seguimiento-form');
const trackCode = document.querySelector('#seguimiento-codigo');
const trackEmail = document.querySelector('#seguimiento-correo');
const trackMessage = document.querySelector('#seguimiento-mensaje');
const trackResult = document.querySelector('#seguimiento-resultado');
const trackSteps = document.querySelector('#seguimiento-pasos');
const trackDetails = document.querySelector('#seguimiento-datos');
const trackFigure = document.querySelector('#seguimiento-figura');
const trackViewerBox = document.querySelector('#seguimiento-visor');
const trackViewButton = document.querySelector('#seguimiento-ver-figura');
const adminForm = document.querySelector('#admin-ingreso');
const adminUser = document.querySelector('#admin-usuario');
const adminPassword = document.querySelector('#admin-clave');
const adminMessage = document.querySelector('#admin-mensaje');
const STEPS = [
  { status: 'nueva', title: 'Reserva recibida', text: 'Revisamos tu figura y te escribimos.' },
  { status: 'contactada', title: 'Te contactamos', text: 'Coordinamos el pago y el envío por correo.' },
  { status: 'pagada', title: 'Pago confirmado', text: 'Tu figura entra a impresión.' },
  { status: 'enviada', title: 'En camino', text: 'Tu figura ya salió del taller.' }
];
const SPECIES_NAMES = { perro: 'Perro', gato: 'Gato', otro: 'Otro animal' };
let tracked = null;

function setCuentaMessage(box, text, isError) {
  box.textContent = text || '';
  box.className = 'cuenta-message' + (isError ? ' error' : '');
}
function showCuentaTab(name, focus) {
  cuentaTabs.forEach((tab) => {
    const active = tab.name === name;
    tab.button.setAttribute('aria-selected', String(active));
    tab.button.tabIndex = active ? 0 : -1;
    tab.panel.hidden = !active;
    if (active && focus) tab.button.focus();
  });
  if (name === 'admin') checkAdminSession();
}
cuentaTabs.forEach((tab, index) => {
  tab.button.addEventListener('click', () => {
    history.replaceState(null, '', tab.name === 'admin' ? '#admin' : '#cliente');
    showCuentaTab(tab.name);
  });
  tab.button.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    showCuentaTab(cuentaTabs[(index + 1) % cuentaTabs.length].name, true);
  });
});

// --- Seguimiento ---
function formatDate(value, withTime) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('es-CL', withTime ? { dateStyle: 'long', timeStyle: 'short' } : { dateStyle: 'long' });
}
function detail(label, value) {
  const wrapper = document.createElement('div');
  const term = document.createElement('dt');
  term.textContent = label;
  const data = document.createElement('dd');
  data.textContent = value;
  wrapper.append(term, data);
  return wrapper;
}
function renderTracking(order) {
  document.querySelector('#seguimiento-titulo').textContent = order.code;
  document.querySelector('#seguimiento-fecha').textContent = 'Hecha el ' + formatDate(order.createdAt);
  const cancelled = order.status === 'cancelada';
  document.querySelector('#seguimiento-cancelada').hidden = !cancelled;
  const current = STEPS.findIndex((step) => step.status === order.status);
  trackSteps.replaceChildren();
  trackSteps.classList.toggle('cancelada', cancelled);
  STEPS.forEach((step, index) => {
    const item = document.createElement('li');
    item.className = cancelled ? 'pendiente' : index < current ? 'hecho' : index === current ? 'actual' : 'pendiente';
    if (!cancelled && index === current) item.setAttribute('aria-current', 'step');
    const mark = document.createElement('span');
    mark.className = 'paso-marca';
    mark.setAttribute('aria-hidden', 'true');
    mark.textContent = !cancelled && index < current ? '✓' : String(index + 1);
    const text = document.createElement('span');
    const title = document.createElement('strong');
    title.textContent = step.title;
    const note = document.createElement('small');
    note.textContent = step.text;
    text.append(title, note);
    item.append(mark, text);
    trackSteps.append(item);
  });
  const updated = order.statusUpdatedAt ? formatDate(order.statusUpdatedAt, true) : '';
  document.querySelector('#seguimiento-actualizado').textContent = updated ? 'Última actualización: ' + updated + '.' : '';
  trackDetails.replaceChildren(
    detail('Figura', (Number(order.quantity) > 1 ? order.quantity + ' × ' : '') + order.measure + (order.finish === 'pintada' ? ', pintada' : ', en blanco') + (order.extrasText ? ', ' + order.extrasText : '')),
    detail('Mascota', [order.petName || 'Sin nombre', SPECIES_NAMES[order.species]].filter(Boolean).join(' · ')),
    detail('Precio', formatPrice(order.price) + ' más envío')
  );
  document.querySelector('#seguimiento-contacto').href = 'mailto:hola@forma3d.cl?subject=' + encodeURIComponent('Mi pedido ' + order.code);
  trackFigure.hidden = !order.hasModel;
  trackViewerBox.hidden = true;
  trackViewerBox.replaceChildren();
  trackViewButton.hidden = false;
  trackViewButton.disabled = false;
  trackForm.hidden = true;
  trackResult.hidden = false;
  trackResult.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
trackForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const code = trackCode.value.trim();
  const email = trackEmail.value.trim();
  if (!code) { setCuentaMessage(trackMessage, 'Escribe el código de tu reserva.', true); trackCode.focus(); return; }
  if (!email || !trackEmail.checkValidity()) { setCuentaMessage(trackMessage, 'Revisa tu correo.', true); trackEmail.focus(); return; }
  setCuentaMessage(trackMessage, 'Buscando tu reserva…');
  try {
    const response = await fetch('/api/seguimiento', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code, email })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'No pudimos buscar tu reserva.');
    tracked = { code: result.code, email };
    setCuentaMessage(trackMessage, '');
    renderTracking(result);
  } catch (error) {
    setCuentaMessage(trackMessage, error.message === 'Failed to fetch' ? 'No pudimos conectar con el sitio. Inténtalo de nuevo.' : error.message, true);
  }
});
document.querySelector('#seguimiento-otra').addEventListener('click', () => {
  tracked = null;
  trackResult.hidden = true;
  trackForm.hidden = false;
  trackCode.value = '';
  trackCode.focus();
});

// La figura se carga solo si el cliente la pide, para no descargar el visor sin necesidad.
function loadViewerScript() {
  if (customElements.get('model-viewer')) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.type = 'module';
    script.src = 'https://ajax.googleapis.com/ajax/libs/model-viewer/4.4.0/model-viewer.min.js';
    script.onerror = () => reject(new Error('No se pudo cargar el visor 3D.'));
    document.head.append(script);
    customElements.whenDefined('model-viewer').then(resolve);
  });
}
trackViewButton.addEventListener('click', async () => {
  if (!tracked) return;
  trackViewButton.disabled = true;
  trackViewButton.innerHTML = 'Cargando la figura… <span>◌</span>';
  try {
    const [response] = await Promise.all([
      fetch('/api/seguimiento/modelo', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(tracked) }),
      loadViewerScript()
    ]);
    if (!response.ok) throw new Error((await response.json()).error || 'No pudimos cargar la figura.');
    const url = URL.createObjectURL(await response.blob());
    const viewer = document.createElement('model-viewer');
    viewer.setAttribute('camera-controls', '');
    viewer.setAttribute('touch-action', 'pan-y');
    viewer.setAttribute('auto-rotate', '');
    viewer.setAttribute('shadow-intensity', '1');
    viewer.setAttribute('environment-image', 'neutral');
    viewer.setAttribute('exposure', '0.9');
    viewer.setAttribute('alt', 'Vista 3D de tu figura, en blanco como se imprime');
    viewer.addEventListener('load', () => {
      ((viewer.model && viewer.model.materials) || []).forEach((material) => {
        const pbr = material.pbrMetallicRoughness;
        if (pbr.baseColorTexture) pbr.baseColorTexture.setTexture(null);
        if (pbr.metallicRoughnessTexture) pbr.metallicRoughnessTexture.setTexture(null);
        pbr.setBaseColorFactor([0.88, 0.87, 0.83, 1]);
        pbr.setMetallicFactor(0);
        pbr.setRoughnessFactor(0.82);
      });
    }, { once: true });
    viewer.src = url;
    trackViewerBox.replaceChildren(viewer);
    trackViewerBox.hidden = false;
    trackViewButton.hidden = true;
  } catch (error) {
    trackViewButton.disabled = false;
    trackViewButton.innerHTML = 'Ver su figura en 3D <span>◈</span>';
    setCuentaMessage(trackMessage, error.message, true);
    trackForm.hidden = true;
  }
});

// --- Administrador ---
async function checkAdminSession() {
  try {
    const response = await fetch('/api/admin/session', { credentials: 'same-origin' });
    document.querySelector('#admin-sesion').hidden = !response.ok;
  } catch { /* sin conexión: el formulario sigue disponible */ }
}
adminForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!adminUser.value.trim() || !adminPassword.value) {
    setCuentaMessage(adminMessage, 'Escribe tu usuario y tu clave.', true);
    return;
  }
  setCuentaMessage(adminMessage, 'Ingresando…');
  try {
    const response = await fetch('/api/admin/login', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ user: adminUser.value.trim(), password: adminPassword.value })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'No se pudo ingresar.');
    adminPassword.value = '';
    window.location.href = 'admin.html';
  } catch (error) {
    adminPassword.value = '';
    setCuentaMessage(adminMessage, error.message === 'Failed to fetch' ? 'No pudimos conectar con el sitio. Inténtalo de nuevo.' : error.message, true);
  }
});

// Entrada: #admin abre la pestaña de administrador; ?codigo=F-... rellena el código.
const startCode = new URLSearchParams(window.location.search).get('codigo');
if (startCode && /^F-[0-9A-F]{8}$/i.test(startCode)) trackCode.value = startCode.toUpperCase();
showCuentaTab(window.location.hash === '#admin' ? 'admin' : 'cliente');
if (startCode) trackEmail.focus();
