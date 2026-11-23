import { formatPrice, SPECIES_LABELS } from './catalog.js';
import { viewerMaterials, paintMaterials } from './viewer.js';
import { el } from './dom.js';

const loginBox = document.querySelector('#admin-login');
const loginMessage = document.querySelector('#login-message');
const board = document.querySelector('#admin-board');
const boardMessage = document.querySelector('#board-message');
const statsBox = document.querySelector('#admin-stats');
const filtersBox = document.querySelector('#admin-filters');
const searchInput = document.querySelector('#admin-search');
const countLine = document.querySelector('#admin-count');
let allOrders = [];
let allStates = [];
let currentFilter = 'todas';
const ordersBox = document.querySelector('#admin-orders');
const logoutButton = document.querySelector('#admin-logout');
const refreshButton = document.querySelector('#admin-refresh');
const STATE_LABELS = {
  nueva: 'Nueva',
  contactada: 'Contactada',
  pagada: 'Pagada',
  enviada: 'Enviada',
  cancelada: 'Cancelada'
};
const modelDialog = document.querySelector('#model-dialog');
const modelTitle = document.querySelector('#model-dialog-title');
const modelStatus = document.querySelector('#model-dialog-status');
const adminViewer = document.querySelector('#admin-viewer');
const viewWhite = document.querySelector('#view-white');
const viewColor = document.querySelector('#view-color');
const viewDownload = document.querySelector('#view-download');
const modelBlobs = new Map();
let openCode = '';
let openUrl = '';
let openMaterials = [];
const modelPhotos = document.querySelector('#model-photos');
const photoDialog = document.querySelector('#photo-dialog');
const photoTitle = document.querySelector('#photo-dialog-title');
const photoImage = document.querySelector('#photo-image');
const photoPrev = document.querySelector('#photo-prev');
const photoNext = document.querySelector('#photo-next');
const photoUrls = new Map();
const ANGLE_LABELS = {
  Front: 'Frente',
  'Front-Left': 'Frente izquierda',
  'Front-Right': 'Frente derecha',
  Back: 'Espalda',
  'Back-Left': 'Espalda izquierda',
  'Back-Right': 'Espalda derecha',
  Left: 'Costado izquierdo',
  Right: 'Costado derecho',
  Up: 'Desde arriba',
  Down: 'Desde abajo'
};
let photoOrder = null;
let photoIndex = 0;

function setMessage(box, text, isError) {
  box.textContent = text || '';
  box.className = 'admin-message' + (isError ? ' error' : '');
}
async function adminFetch(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    credentials: 'same-origin'
  });
  if (response.status === 401) {
    clearBoard();
    throw new Error('Tu sesión de administrador no está activa. Ingresa de nuevo.');
  }
  return response;
}
function showBoard(visible) {
  board.hidden = !visible;
  loginBox.hidden = visible;
  logoutButton.hidden = !visible;
}
// Limpia lo cargado en pantalla (reservas, fotos y modelos) cuando la sesión termina.
function clearBoard() {
  ordersBox.replaceChildren();
  modelBlobs.clear();
  photoUrls.forEach((pending) => pending.then((url) => URL.revokeObjectURL(url)).catch(() => {}));
  photoUrls.clear();
  if (photoDialog.open) photoDialog.close();
  if (modelDialog.open) modelDialog.close();
  showBoard(false);
}

// Un dato de la tarjeta de reserva: título (dt) y contenido (dd).
function field(label, ...content) {
  return el('div', {}, el('dt', label), el('dd', {}, ...content));
}
// --- Resumen del mes, filtro por estado y buscador ---
function plainText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}
function stat(label, value, note) {
  return el('div', { className: 'admin-stat' }, el('span', label), el('strong', value), el('small', note));
}
// Las ventas se cuentan por la fecha de la reserva, no por la del pago, que el panel no registra.
function renderStats(orders) {
  const now = new Date();
  const inMonth = orders.filter((order) => {
    const date = new Date(order.createdAt);
    return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
  });
  const sum = (list) => list.reduce((total, order) => total + (Number(order.price) || 0), 0);
  const sold = inMonth.filter((order) => order.status === 'pagada' || order.status === 'enviada');
  const pending = orders.filter((order) => order.status === 'nueva' || order.status === 'contactada');
  const month = now.toLocaleString('es-CL', { month: 'long' });
  const active = inMonth.filter((order) => order.status !== 'cancelada').length;
  statsBox.replaceChildren(
    stat(
      'Vendido en ' + month,
      formatPrice(sum(sold)),
      sold.length + (sold.length === 1 ? ' figura pagada o enviada' : ' figuras pagadas o enviadas')
    ),
    stat(
      'Por cobrar',
      formatPrice(sum(pending)),
      pending.length + (pending.length === 1 ? ' reserva nueva o contactada' : ' reservas nuevas o contactadas')
    ),
    stat('Reservas en ' + month, String(active), 'sin contar las canceladas')
  );
}
function renderFilters(orders, states) {
  filtersBox.replaceChildren();
  ['todas', ...states].forEach((state) => {
    const count = state === 'todas' ? orders.length : orders.filter((order) => order.status === state).length;
    if (state !== 'todas' && !count && currentFilter !== state) return;
    const all = state === 'todas';
    const button = el(
      'button',
      { type: 'button', ...(!all && { 'data-status': state }), 'aria-pressed': String(currentFilter === state) },
      !all && el('i'),
      all ? 'Todas' : STATE_LABELS[state] || state,
      el('b', String(count))
    );
    button.addEventListener('click', () => {
      currentFilter = state;
      renderOrders(allOrders, allStates);
    });
    filtersBox.append(button);
  });
}
function matchesSearch(order, query) {
  if (!query) return true;
  return [order.code, order.name, order.email, order.petName, order.notes, order.petNotes].some((value) =>
    plainText(value).includes(query)
  );
}
searchInput.addEventListener('input', () => renderOrders(allOrders, allStates));

function renderOrders(orders, states) {
  allOrders = orders;
  allStates = states;
  renderStats(orders);
  renderFilters(orders, states);
  const query = plainText(searchInput.value.trim());
  const visible = orders.filter(
    (order) => (currentFilter === 'todas' || order.status === currentFilter) && matchesSearch(order, query)
  );
  countLine.textContent =
    visible.length === orders.length ? '' : 'Mostrando ' + visible.length + ' de ' + orders.length + ' reservas.';

  ordersBox.replaceChildren();
  if (!orders.length) {
    ordersBox.append(
      el(
        'p',
        { className: 'admin-empty' },
        'Todavía no hay reservas. Aparecerán aquí cuando alguien reserve su figura.'
      )
    );
    return;
  }
  if (!visible.length) {
    ordersBox.append(
      el('p', { className: 'admin-empty' }, 'No hay reservas que coincidan con el filtro o la búsqueda.')
    );
    return;
  }
  visible.forEach((order) => {
    const card = el('dl', { className: 'order-card', 'data-status': order.status });
    const date = new Date(order.createdAt);
    const when = Number.isNaN(date.getTime())
      ? ''
      : date.toLocaleString('es-CL', { dateStyle: 'medium', timeStyle: 'short' });
    const mail = el(
      'a',
      { href: 'mailto:' + order.email + '?subject=' + encodeURIComponent('Tu figura FORMA · reserva ' + order.code) },
      order.email
    );
    card.append(
      field('Reserva', el('strong', order.code), el('small', when)),
      field(
        'Figura',
        el(
          'strong',
          (Number(order.quantity) > 1 ? order.quantity + ' × ' : '') +
            order.measure +
            (order.finish === 'pintada' ? ', pintada' : '') +
            ', ' +
            formatPrice(order.price)
        ),
        order.extrasText && el('small', order.extrasText),
        el(
          'small',
          (order.petName || 'Sin nombre') + ', ' + (SPECIES_LABELS[order.species] || order.species || '').toLowerCase()
        )
      ),
      field('Cliente', order.name, el('br'), mail)
    );

    const select = el(
      'select',
      { 'aria-label': 'Estado de la reserva ' + order.code },
      ...states.map((state) =>
        el('option', { value: state, selected: state === order.status }, STATE_LABELS[state] || state)
      )
    );
    select.addEventListener('change', async () => {
      select.disabled = true;
      try {
        const response = await adminFetch('/api/admin/orders/' + order.code + '/status', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ status: select.value })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'No se pudo guardar el estado.');
        order.status = result.status;
        renderOrders(orders, states);
        setMessage(
          boardMessage,
          'Reserva ' +
            order.code +
            ' marcada como ' +
            (STATE_LABELS[result.status] || result.status).toLowerCase() +
            '.'
        );
      } catch (error) {
        select.value = order.status;
        select.disabled = false;
        setMessage(boardMessage, error.message, true);
      }
    });
    const view = el(
      'button',
      { type: 'button', disabled: !order.hasModel },
      order.hasModel ? 'Ver en 3D' : 'Sin copia del modelo'
    );
    view.addEventListener('click', () => openModel(order));
    const download = el('button', { type: 'button', hidden: !order.hasModel }, 'Descargar modelo');
    download.addEventListener('click', async () => {
      download.disabled = true;
      try {
        await downloadModel(order.code);
      } catch (error) {
        setMessage(boardMessage, error.message, true);
      } finally {
        download.disabled = false;
      }
    });
    card.append(el('div', { className: 'order-actions' }, select, view, download));
    const notesField = (label, content) =>
      card.append(Object.assign(field(label, content), { className: 'order-notes' }));
    if (order.photos && order.photos.length) {
      const strip = el(
        'div',
        { className: 'photo-strip' },
        ...order.photos.map((photo, index) => photoThumb(order, index))
      );
      notesField(order.photos.length === 1 ? 'Foto del cliente' : 'Fotos del cliente', strip);
    }
    if (order.petNotes) notesField('Detalles de la mascota', order.petNotes);
    if (order.notes) notesField('Comentarios', order.notes);
    ordersBox.append(card);
  });
}

// --- Fotos del cliente: se piden con la clave del panel y se muestran como miniaturas ---
function photoLabel(photo) {
  return ANGLE_LABELS[photo.label] || '';
}
async function photoUrl(photo) {
  if (!photoUrls.has(photo.file)) {
    photoUrls.set(
      photo.file,
      adminFetch('/api/admin/photo/' + photo.file).then(async (response) => {
        if (!response.ok) throw new Error('No se pudo cargar la foto.');
        return URL.createObjectURL(await response.blob());
      })
    );
  }
  return photoUrls.get(photo.file);
}
function photoThumb(order, index) {
  const photo = order.photos[index];
  const label = photoLabel(photo);
  const image = el('img', { alt: '' });
  const button = el(
    'button',
    {
      type: 'button',
      className: 'photo-thumb',
      'aria-label': 'Ver foto ' + (index + 1) + (label ? ' (' + label + ')' : '') + ' de la reserva ' + order.code
    },
    image,
    label && el('span', label)
  );
  photoUrl(photo)
    .then((url) => {
      image.src = url;
    })
    .catch(() => {
      photoUrls.delete(photo.file);
      button.classList.add('failed');
      button.disabled = true;
    });
  button.addEventListener('click', () => openPhoto(order, index));
  return button;
}
function showPhoto() {
  const photo = photoOrder.photos[photoIndex];
  const label = photoLabel(photo);
  photoTitle.textContent =
    (photoOrder.petName || 'Sin nombre') +
    ', foto ' +
    (photoIndex + 1) +
    ' de ' +
    photoOrder.photos.length +
    (label ? ' (' + label.toLowerCase() + ')' : '');
  photoPrev.hidden = photoNext.hidden = photoOrder.photos.length < 2;
  photoImage.removeAttribute('src');
  const current = photo.file;
  photoUrl(photo)
    .then((url) => {
      if (photoOrder && photoOrder.photos[photoIndex].file === current) photoImage.src = url;
    })
    .catch(() => {});
}
function openPhoto(order, index) {
  photoOrder = order;
  photoIndex = index;
  showPhoto();
  if (!photoDialog.open) photoDialog.showModal();
}
function stepPhoto(step) {
  if (!photoOrder) return;
  photoIndex = (photoIndex + step + photoOrder.photos.length) % photoOrder.photos.length;
  showPhoto();
}
photoPrev.addEventListener('click', () => stepPhoto(-1));
photoNext.addEventListener('click', () => stepPhoto(1));
photoDialog.addEventListener('keydown', (event) => {
  if (event.key === 'ArrowLeft') stepPhoto(-1);
  if (event.key === 'ArrowRight') stepPhoto(1);
});
photoDialog.addEventListener('close', () => {
  photoOrder = null;
});
document.querySelector('#photo-close').addEventListener('click', () => photoDialog.close());
photoDialog.addEventListener('click', (event) => {
  if (event.target === photoDialog) photoDialog.close();
});

// --- Modelos: se piden con la clave del panel y quedan en memoria mientras la sesión siga abierta ---
async function fetchModel(code) {
  if (modelBlobs.has(code)) return modelBlobs.get(code);
  const response = await adminFetch('/api/admin/model/' + code);
  if (!response.ok) throw new Error((await response.json()).error || 'No se pudo obtener el modelo.');
  const blob = await response.blob();
  modelBlobs.set(code, blob);
  return blob;
}
async function downloadModel(code) {
  const url = URL.createObjectURL(await fetchModel(code));
  const link = el('a', { href: url, download: code + '.glb' });
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30000);
}
function setModelStatus(text, isError) {
  modelStatus.textContent = text || '';
  modelStatus.className = 'model-dialog-status' + (isError ? ' error' : '');
}
// En blanco (como se imprime) o con los colores del modelo generado.
function applyModelFinish(white) {
  paintMaterials(openMaterials, white);
  viewWhite.setAttribute('aria-pressed', String(white));
  viewColor.setAttribute('aria-pressed', String(!white));
}
// El visor conserva el último modelo aunque el siguiente falle: se oculta hasta que cargue el de esta reserva.
function showViewer(visible) {
  adminViewer.style.visibility = visible ? 'visible' : 'hidden';
}
adminViewer.addEventListener('load', () => {
  if (!openUrl || adminViewer.src !== openUrl) return;
  showViewer(true);
  openMaterials = viewerMaterials(adminViewer);
  applyModelFinish(true);
  viewWhite.disabled = viewColor.disabled = false;
  setModelStatus('Arrastra para girarla. Con la rueda, acércala.');
});
adminViewer.addEventListener('error', () => {
  showViewer(false);
  setModelStatus('El archivo del modelo no se pudo abrir.', true);
});

async function openModel(order) {
  openCode = order.code;
  openMaterials = [];
  modelTitle.textContent = (order.petName || 'Sin nombre') + ', ' + order.measure + ', ' + order.code;
  viewWhite.disabled = viewColor.disabled = true;
  showViewer(false);
  // Las fotos del cliente quedan junto al modelo para comparar.
  modelPhotos.replaceChildren();
  (order.photos || []).forEach((photo, index) => modelPhotos.append(photoThumb(order, index)));
  modelPhotos.hidden = !modelPhotos.childElementCount;
  setModelStatus('Cargando el modelo…');
  modelDialog.showModal();
  try {
    const blob = await fetchModel(order.code);
    if (openCode !== order.code) return;
    openUrl = URL.createObjectURL(blob);
    adminViewer.src = openUrl;
  } catch (error) {
    setModelStatus(error.message, true);
  }
}
modelDialog.addEventListener('close', () => {
  showViewer(false);
  adminViewer.removeAttribute('src');
  if (openUrl) URL.revokeObjectURL(openUrl);
  openUrl = '';
  openCode = '';
  openMaterials = [];
});
document.querySelector('#model-close').addEventListener('click', () => modelDialog.close());
modelDialog.addEventListener('click', (event) => {
  if (event.target === modelDialog) modelDialog.close();
});
viewWhite.addEventListener('click', () => applyModelFinish(true));
viewColor.addEventListener('click', () => applyModelFinish(false));
viewDownload.addEventListener('click', () => {
  if (openCode) downloadModel(openCode).catch((error) => setModelStatus(error.message, true));
});

async function loadOrders() {
  setMessage(boardMessage, 'Cargando reservas…');
  const response = await adminFetch('/api/admin/orders');
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'No se pudieron cargar las reservas.');
  showBoard(true);
  renderOrders(result.orders, result.states);
  setMessage(boardMessage, '');
}
async function enter() {
  try {
    await loadOrders();
    setMessage(loginMessage, '');
  } catch (error) {
    showBoard(false);
    setMessage(loginMessage, error.message, true);
  }
}
async function logout() {
  try {
    await fetch('/api/admin/logout', { method: 'POST', credentials: 'same-origin' });
  } catch {}
  clearBoard();
  window.location.href = 'ingresar.html#admin';
}
logoutButton.addEventListener('click', logout);
refreshButton.addEventListener('click', () =>
  loadOrders().catch((error) => setMessage(boardMessage, error.message, true))
);
enter();
