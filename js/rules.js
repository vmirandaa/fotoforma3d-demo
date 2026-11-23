// Reglas que comparten el navegador (creador, Mi pedido) y el servidor. Si cambias una, cambia en los dos lados.
// El navegador las usa para avisar antes de enviar; el servidor las vuelve a revisar y es quien decide el precio final.

// Fotos de la mascota
export const MAX_PHOTOS = 5;
export const MAX_PHOTO_MB = 25;
export const MAX_PHOTO_BYTES = MAX_PHOTO_MB * 1024 * 1024;
export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// Código de reserva: F- y ocho caracteres hexadecimales (F-ABCDEF12).
export const ORDER_CODE = /^F-[0-9A-F]{8}$/;

// Nombre grabado en la base.
export const BASE_NAME_MAX = 24;

// Cuántas figuras iguales se pueden pedir en una reserva (cantidadMaxima en data/catalog.json).
export function maxQuantity(extras) {
  return Number(extras?.cantidadMaxima) || 10;
}

// Una talla se ofrece pintada si data/catalog.json le pone un recargo ("pintada").
export function canPaint(size) {
  return Boolean(size && Number(size.pintada) > 0);
}

// Suma de los recargos de los extras elegidos (formato, estilo, base). Un extra que falta no suma.
export function extrasPrice(items) {
  return items.reduce((total, item) => total + (Number(item?.precio) || 0), 0);
}

// Precio de una figura: talla, más el recargo de pintarla si corresponde, más los extras.
export function unitPrice(size, painted, items) {
  return size.precio + (painted ? Number(size.pintada) : 0) + extrasPrice(items);
}
