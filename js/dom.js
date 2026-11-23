// Ayudante para armar elementos de la página sin repetir createElement, className y textContent.
//
//   el('button', { type: 'button', className: 'boton', 'aria-label': 'Cerrar' }, '×')
//   el('p', 'Solo texto')                 // sin propiedades
//   el('li', {}, el('strong', 'Título'), ' y más texto')
//
// Las propiedades con guion (aria-*, data-*) y role van como atributos; el resto, como propiedades del elemento
// (type, className, href, hidden…). El texto se agrega como texto, nunca como HTML.
export function el(tag, props, ...children) {
  if (props === null || typeof props !== 'object' || props instanceof Node) {
    children.unshift(props);
    props = {};
  }
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key.includes('-') || key === 'role') node.setAttribute(key, value);
    else node[key] = value;
  }
  node.append(...children.filter((child) => child !== null && child !== undefined && child !== false && child !== ''));
  return node;
}
