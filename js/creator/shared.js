// Estado compartido de las partes del creador (fotos, pasos en celular, espera y reserva).

export const form = document.querySelector('#generation-form');
const stateBox = document.querySelector('#generation-state');
const tailNotesInput = document.querySelector('#tail-notes');

// Fotos elegidas: { file, sourceKey, label, previewUrl }. label es el ángulo (Front, Left…) o '?' si no se sabe.
export const selectedFiles = [];

export const state = {
  serviceReady: false, // el servidor tiene conectado el servicio 3D
  generationBusy: false, // hay una vista previa en curso
  preparingPhotos: 0, // fotos que se están achicando en el navegador
  hasGeneratedModel: false, // ya hay una vista previa lista para reservar
  taskId: null // vista previa que se reserva
};

// Cada parte avisa cuando cambia algo que afecta a los botones; creator.js decide qué se habilita.
let listener = () => {};
export function onChange(fn) {
  listener = fn;
}
export function notifyChange() {
  listener();
}

// Mensaje bajo el formulario de fotos. kind: 'success' o vacío.
export function showState(message, kind) {
  stateBox.textContent = message || '';
  stateBox.className = 'generation-state' + (kind ? ' ' + kind : '');
}
export function stateIsSuccess() {
  return stateBox.classList.contains('success');
}

// La cola es lo que más falla cuando no aparece en las fotos, así que se pregunta siempre.
export function tailChoice() {
  const checked = form.querySelector('input[name="tail"]:checked');
  return checked ? checked.value : '';
}
export function tailReady() {
  return tailChoice() !== '' && (tailChoice() !== 'not-visible' || tailNotesInput.value.trim().length >= 3);
}

export function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
