// Catálogo de tallas y precios: una sola fuente (data/catalog.json) para la portada, el estudio y el servidor.
export function formatPrice(value) {
  return '$' + Number(value).toLocaleString('es-CL');
}
export const catalogPromise = fetch('data/catalog.json').then((response) => {
  if (!response.ok) throw new Error('catálogo no disponible');
  return response.json();
});
// Evita el aviso de promesa sin atender en páginas que no usan el catálogo; cada página maneja su propio error.
catalogPromise.catch(() => {});
export const SPECIES_LABELS = { perro: 'Perro', gato: 'Gato', otro: 'Otro animal' };
