// Página "Mi pedido": seguimiento para clientes (código + correo) e ingreso de administrador.
import { formatPrice, SPECIES_LABELS } from './catalog.js';
import { VIEWER_SCRIPT, SAMPLE_WHITE, viewerMaterials, paintMaterials } from './viewer.js';
import { ORDER_CODE } from './rules.js';
import { el } from './dom.js';

const accountTabs = [
  {
    button: document.querySelector('#tab-customer'),
    panel: document.querySelector('#panel-customer'),
    name: 'customer'
  },
  { button: document.querySelector('#tab-admin'), panel: document.querySelector('#panel-admin'), name: 'admin' }
];
const trackForm = document.querySelector('#tracking-form');
const trackCode = document.querySelector('#tracking-code');
const trackEmail = document.querySelector('#tracking-email');
const trackMessage = document.querySelector('#tracking-message');
const trackResult = document.querySelector('#tracking-result');
const trackSteps = document.querySelector('#tracking-steps');
const trackDetails = document.querySelector('#tracking-details');
const trackFigure = document.querySelector('#tracking-figure');
const trackViewerBox = document.querySelector('#tracking-viewer');
const trackViewButton = document.querySelector('#tracking-view-figure');
const adminForm = document.querySelector('#admin-form');
const adminUser = document.querySelector('#admin-user');
const adminPassword = document.querySelector('#admin-password');
const adminMessage = document.querySelector('#admin-message');
const STEPS = [
  { status: 'nueva', title: 'Reserva recibida', text: 'Revisamos tu figura y te escribimos.' },
  { status: 'contactada', title: 'Te contactamos', text: 'Coordinamos el pago y el envío por correo.' },
  { status: 'pagada', title: 'Pago confirmado', text: 'Tu figura entra a impresión.' },
  { status: 'enviada', title: 'En camino', text: 'Tu figura ya salió del taller.' }
];
let tracked = null;

function setAccountMessage(box, text, isError) {
  box.textContent = text || '';
  box.className = 'account-message' + (isError ? ' error' : '');
}
function showAccountTab(name, focus) {
  accountTabs.forEach((tab) => {
    const active = tab.name === name;
    tab.button.setAttribute('aria-selected', String(active));
    tab.button.tabIndex = active ? 0 : -1;
    tab.panel.hidden = !active;
    if (active && focus) tab.button.focus();
  });
  if (name === 'admin') checkAdminSession();
}
accountTabs.forEach((tab, index) => {
  tab.button.addEventListener('click', () => {
    // La dirección queda en español (ingresar.html#cliente o #admin): es la que ven y comparten las personas.
    history.replaceState(null, '', tab.name === 'admin' ? '#admin' : '#cliente');
    showAccountTab(tab.name);
  });
  tab.button.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    showAccountTab(accountTabs[(index + 1) % accountTabs.length].name, true);
  });
});

// --- Seguimiento ---
function formatDate(value, withTime) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('es-CL', withTime ? { dateStyle: 'long', timeStyle: 'short' } : { dateStyle: 'long' });
}
const connectionError = (error) =>
  error.message === 'Failed to fetch' ? 'No pudimos conectar con el sitio. Inténtalo de nuevo.' : error.message;
function detail(label, value) {
  return el('div', {}, el('dt', label), el('dd', value));
}
function renderTracking(order) {
  document.querySelector('#tracking-title').textContent = order.code;
  document.querySelector('#tracking-date').textContent = 'Hecha el ' + formatDate(order.createdAt);
  const cancelled = order.status === 'cancelada';
  document.querySelector('#tracking-cancelled').hidden = !cancelled;
  const current = STEPS.findIndex((step) => step.status === order.status);
  trackSteps.replaceChildren();
  trackSteps.classList.toggle('cancelled', cancelled);
  STEPS.forEach((step, index) => {
    const isCurrent = !cancelled && index === current;
    trackSteps.append(
      el(
        'li',
        {
          className: cancelled ? 'pending' : index < current ? 'done' : isCurrent ? 'current' : 'pending',
          ...(isCurrent && { 'aria-current': 'step' })
        },
        el(
          'span',
          { className: 'step-mark', 'aria-hidden': 'true' },
          !cancelled && index < current ? '✓' : String(index + 1)
        ),
        el('span', {}, el('strong', step.title), el('small', step.text))
      )
    );
  });
  const updated = order.statusUpdatedAt ? formatDate(order.statusUpdatedAt, true) : '';
  document.querySelector('#tracking-updated').textContent = updated ? 'Última actualización: ' + updated + '.' : '';
  trackDetails.replaceChildren(
    detail(
      'Figura',
      (Number(order.quantity) > 1 ? order.quantity + ' × ' : '') +
        order.measure +
        (order.finish === 'pintada' ? ', pintada' : ', en blanco') +
        (order.extrasText ? ', ' + order.extrasText : '')
    ),
    detail('Mascota', [order.petName || 'Sin nombre', SPECIES_LABELS[order.species]].filter(Boolean).join(', ')),
    detail('Precio', formatPrice(order.price) + ' más envío')
  );
  document.querySelector('#tracking-contact').href =
    'mailto:hola@forma3d.cl?subject=' + encodeURIComponent('Mi pedido ' + order.code);
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
  if (!code) {
    setAccountMessage(trackMessage, 'Escribe el código de tu reserva.', true);
    trackCode.focus();
    return;
  }
  if (!email || !trackEmail.checkValidity()) {
    setAccountMessage(trackMessage, 'Revisa tu correo.', true);
    trackEmail.focus();
    return;
  }
  setAccountMessage(trackMessage, 'Buscando tu reserva…');
  try {
    const response = await fetch('/api/tracking', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code, email })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'No pudimos buscar tu reserva.');
    tracked = { code: result.code, email };
    setAccountMessage(trackMessage, '');
    renderTracking(result);
  } catch (error) {
    setAccountMessage(trackMessage, connectionError(error), true);
  }
});
document.querySelector('#tracking-another').addEventListener('click', () => {
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
    script.src = VIEWER_SCRIPT;
    script.onerror = () => reject(new Error('No se pudo cargar el visor 3D.'));
    document.head.append(script);
    customElements.whenDefined('model-viewer').then(resolve);
  });
}
trackViewButton.addEventListener('click', async () => {
  if (!tracked) return;
  trackViewButton.disabled = true;
  trackViewButton.textContent = 'Cargando la figura…';
  try {
    const [response] = await Promise.all([
      fetch('/api/tracking/model', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(tracked)
      }),
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
    viewer.addEventListener('load', () => paintMaterials(viewerMaterials(viewer), true, SAMPLE_WHITE), { once: true });
    viewer.src = url;
    trackViewerBox.replaceChildren(viewer);
    trackViewerBox.hidden = false;
    trackViewButton.hidden = true;
  } catch (error) {
    trackViewButton.disabled = false;
    trackViewButton.textContent = 'Ver su figura en 3D';
    setAccountMessage(trackMessage, error.message, true);
    trackForm.hidden = true;
  }
});

// --- Administrador ---
async function checkAdminSession() {
  try {
    const response = await fetch('/api/admin/session', { credentials: 'same-origin' });
    document.querySelector('#admin-session').hidden = !response.ok;
  } catch {
    /* sin conexión: el formulario sigue disponible */
  }
}
adminForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!adminUser.value.trim() || !adminPassword.value) {
    setAccountMessage(adminMessage, 'Escribe tu usuario y tu clave.', true);
    return;
  }
  setAccountMessage(adminMessage, 'Ingresando…');
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
    setAccountMessage(adminMessage, connectionError(error), true);
  }
});

// Entrada: #admin abre la pestaña de administrador; ?codigo=F-... rellena el código.
const startCode = new URLSearchParams(window.location.search).get('codigo');
if (startCode && ORDER_CODE.test(startCode.toUpperCase())) trackCode.value = startCode.toUpperCase();
showAccountTab(window.location.hash === '#admin' ? 'admin' : 'customer');
if (startCode) trackEmail.focus();
