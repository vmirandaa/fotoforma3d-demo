// Reserva de la figura: tamaño, acabado (en blanco o pintada), extras, cantidad, total y envío del pedido.
// También el acabado del visor, porque elegir "pintada" muestra la vista previa con sus colores.
import { el } from '../dom.js';
import { formatPrice, catalogPromise } from '../catalog.js';
import { paintMaterials } from '../viewer.js';
import { BASE_NAME_MAX, maxQuantity, canPaint, unitPrice } from '../rules.js';
import { state, notifyChange } from './shared.js';

const finishWhite = document.querySelector('#finish-white');
const finishColor = document.querySelector('#finish-color');
const orderForm = document.querySelector('#order-form');
const sizeOptions = document.querySelector('#size-options');
const orderName = document.querySelector('#order-name');
const orderEmail = document.querySelector('#order-email');
const orderNotes = document.querySelector('#order-notes');
const orderSubmit = document.querySelector('#order-submit');
const orderStatus = document.querySelector('#order-status');
const paintOption = document.querySelector('#paint-option');
const paintPrice = document.querySelector('#paint-price');
const finishNote = document.querySelector('#finish-note');
const orderTotal = document.querySelector('#order-total');
const extrasBox = document.querySelector('#extras-options');
let orderBusy = false;
let orderSent = false;
let originalMaterials = [];
let catalogSizes = [];
let catalogExtras = { formatos: [], estilos: [], bases: [], cantidadMaxima: 10 };
let baseNameInput = null;
let quantityInput = null;

export function setOrderStatus(message, kind) {
  orderStatus.textContent = message || '';
  orderStatus.className = 'order-status' + (kind ? ' ' + kind : '');
}
export function selectedSize() {
  const checked = sizeOptions.querySelector('input:checked');
  return checked ? checked.value : '';
}
function selectedFinish() {
  const checked = orderForm.querySelector('input[name="finish"]:checked');
  return checked ? checked.value : 'blanco';
}
// Botones de la reserva y del acabado: solo con una vista previa lista y sin otra en curso.
export function syncOrderButtons() {
  orderSubmit.disabled = state.generationBusy || orderBusy || orderSent || !state.hasGeneratedModel || !selectedSize();
  finishWhite.disabled = finishColor.disabled = !state.hasGeneratedModel;
}

// --- Acabado de la vista previa: en blanco (como se imprime) o con los colores de la foto ---
function applyFinish(kind) {
  const white = kind !== 'color';
  paintMaterials(originalMaterials, white);
  finishWhite.setAttribute('aria-pressed', String(white));
  finishColor.setAttribute('aria-pressed', String(!white));
}
// Una vista previa nueva quedó en el visor: se puede reservar, con el acabado que esté elegido.
export function previewReady(id, materials) {
  state.taskId = id;
  state.hasGeneratedModel = true;
  orderSent = false;
  originalMaterials = materials;
  applyFinish(selectedFinish() === 'pintada' ? 'color' : 'white');
}
finishWhite.addEventListener('click', () => applyFinish('white'));
finishColor.addEventListener('click', () => applyFinish('color'));

// --- Extras del pedido: formato, estilo, base y cantidad (las opciones y recargos vienen de data/catalog.json) ---
function checkedValue(name, fallback) {
  const checked = orderForm.querySelector('input[name="' + name + '"]:checked');
  return checked ? checked.value : fallback;
}
function selectedExtras() {
  const find = (list, id) => list.find((item) => item.id === id) || list[0] || { id: '', precio: 0 };
  const formato = find(catalogExtras.formatos, checkedValue('formato', ''));
  const estilo = find(catalogExtras.estilos, checkedValue('estilo', ''));
  const base = find(catalogExtras.bases, checkedValue('base', ''));
  const max = maxQuantity(catalogExtras);
  const quantity = Math.min(max, Math.max(1, Math.round(Number(quantityInput && quantityInput.value) || 1)));
  return {
    formato,
    estilo,
    base,
    baseName: base.conNombre && baseNameInput ? baseNameInput.value.trim() : '',
    quantity
  };
}
function priceLabel(value) {
  return Number(value) > 0 ? '+' + formatPrice(value) : 'Incluido';
}
// Una opción para elegir con un círculo: la talla o un extra.
function choice(name, value, checked, title, detail, onChange) {
  const input = el('input', { type: 'radio', name, value, checked });
  input.addEventListener('change', onChange);
  return el('label', { className: 'size-option' }, input, el('strong', title), el('small', detail));
}
function buildChoiceGroup(legend, name, options) {
  if (!options || !options.length) return null;
  return el(
    'fieldset',
    { className: 'size-options extras-group' },
    el('legend', legend),
    ...options.map((option, index) =>
      choice(
        name,
        option.id,
        index === 0,
        option.nombre,
        [option.detalle, priceLabel(option.precio)].filter(Boolean).join(', '),
        updateOrderTotal
      )
    )
  );
}
function buildExtras(extras) {
  if (!extras || !extrasBox) return;
  catalogExtras = { ...catalogExtras, ...extras };
  extrasBox.replaceChildren();
  const groups = [
    buildChoiceGroup('Formato', 'formato', extras.formatos),
    buildChoiceGroup('Estilo', 'estilo', extras.estilos),
    buildChoiceGroup('Base', 'base', extras.bases)
  ].filter(Boolean);
  extrasBox.append(...groups);

  // Nombre para la base: aparece solo con una base que lo lleva.
  baseNameInput = el('input', {
    id: 'base-name',
    type: 'text',
    maxLength: BASE_NAME_MAX,
    autocomplete: 'off',
    placeholder: 'Ej.: Luna'
  });
  baseNameInput.addEventListener('input', updateOrderTotal);
  extrasBox.append(
    el(
      'div',
      { className: 'field-block base-name', hidden: true },
      el('label', { htmlFor: 'base-name' }, 'Nombre para la base'),
      baseNameInput,
      el('small', 'Hasta ' + BASE_NAME_MAX + ' letras. Lo grabamos tal como lo escribas.')
    )
  );

  // Cantidad, con botones para sumar y restar.
  const max = maxQuantity(extras);
  const minus = el('button', { type: 'button', 'aria-label': 'Una menos' }, '−');
  const plus = el('button', { type: 'button', 'aria-label': 'Una más' }, '+');
  quantityInput = el('input', { id: 'order-quantity', type: 'number', min: 1, max, value: 1, inputMode: 'numeric' });
  const step = (delta) => {
    quantityInput.value = Math.min(max, Math.max(1, (Number(quantityInput.value) || 1) + delta));
    updateOrderTotal();
  };
  minus.addEventListener('click', () => step(-1));
  plus.addEventListener('click', () => step(1));
  quantityInput.addEventListener('input', updateOrderTotal);
  quantityInput.addEventListener('change', () => step(0));
  extrasBox.append(
    el(
      'div',
      { className: 'quantity-field' },
      el('label', { htmlFor: 'order-quantity' }, 'Cantidad'),
      el('div', { className: 'quantity-stepper' }, minus, quantityInput, plus),
      el('small', 'Hasta ' + max + ' figuras iguales por reserva.')
    )
  );
}
// Muestra el recargo de pintarla según la talla elegida y el total de la reserva.
function updateOrderTotal() {
  const size = catalogSizes.find((item) => item.id === selectedSize());
  const paintable = canPaint(size);
  paintOption.hidden = !paintable;
  if (!paintable && selectedFinish() === 'pintada')
    orderForm.querySelector('input[name="finish"][value="blanco"]').checked = true;
  paintPrice.textContent = paintable ? '+' + formatPrice(size.pintada) + ', por el taller' : 'por el taller';
  const painted = paintable && selectedFinish() === 'pintada';
  finishNote.hidden = !painted;
  const extras = selectedExtras();
  const nameBlock = extrasBox && extrasBox.querySelector('.base-name');
  if (nameBlock) nameBlock.hidden = !extras.base.conNombre;
  orderTotal.hidden = !size;
  if (size) {
    const unit = unitPrice(size, painted, [extras.formato, extras.estilo, extras.base]);
    orderTotal.replaceChildren(
      'Total ',
      el('strong', formatPrice(unit * extras.quantity)),
      ' más envío',
      extras.quantity > 1 ? el('small', extras.quantity + ' × ' + formatPrice(unit)) : ''
    );
  }
}
orderForm.querySelectorAll('input[name="finish"]').forEach((radio) =>
  radio.addEventListener('change', () => {
    updateOrderTotal();
    // Al elegir pintada se muestra la vista previa con sus colores, que es la guía del taller.
    if (state.hasGeneratedModel) applyFinish(selectedFinish() === 'pintada' ? 'color' : 'white');
  })
);

catalogPromise
  .then((catalog) => {
    catalogSizes = catalog.tallas;
    buildExtras(catalog.extras);
    catalog.tallas.forEach((size) => {
      sizeOptions.append(
        choice(
          'size',
          size.id,
          Boolean(size.destacada),
          size.medida,
          size.nombre + ', ' + formatPrice(size.precio),
          () => {
            notifyChange();
            updateOrderTotal();
          }
        )
      );
    });
    notifyChange();
    updateOrderTotal();
  })
  .catch(() => {
    setOrderStatus('No pudimos cargar los tamaños. Recarga la página para intentarlo de nuevo.', 'error');
  });

orderForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!state.hasGeneratedModel || orderBusy || orderSent) return;
  const name = orderName.value.trim();
  const email = orderEmail.value.trim();
  if (!name) {
    setOrderStatus('Escribe tu nombre para reservar.', 'error');
    orderName.focus();
    return;
  }
  if (!orderEmail.checkValidity() || !email) {
    setOrderStatus('Revisa tu correo: lo usaremos para confirmar el pedido.', 'error');
    orderEmail.focus();
    return;
  }
  const extras = selectedExtras();
  if (extras.base.conNombre && !extras.baseName) {
    setOrderStatus('Escribe el nombre que va en la base.', 'error');
    baseNameInput.focus();
    return;
  }
  orderBusy = true;
  notifyChange();
  setOrderStatus('Enviando tu reserva…');
  try {
    const response = await fetch('/api/order', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        taskId: state.taskId,
        size: selectedSize(),
        finish: selectedFinish(),
        name,
        email,
        notes: orderNotes.value.trim(),
        format: extras.formato.id,
        style: extras.estilo.id,
        base: extras.base.id,
        baseName: extras.baseName,
        quantity: extras.quantity
      })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'No se pudo registrar la reserva.');
    orderSent = true;
    orderSubmit.textContent = 'Reserva enviada';
    setOrderStatus(
      'Reserva ' + result.code + ' recibida. Te escribiremos a ' + email + ' para confirmar el pago y el envío.',
      'success'
    );
    orderStatus.append(
      ' ',
      el('a', { href: 'ingresar.html?codigo=' + encodeURIComponent(result.code) }, 'Sigue tu pedido aquí'),
      '.'
    );
  } catch (error) {
    setOrderStatus(error.message || 'No se pudo registrar la reserva.', 'error');
  } finally {
    orderBusy = false;
    notifyChange();
  }
});
