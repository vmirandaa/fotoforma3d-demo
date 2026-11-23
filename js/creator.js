// Creador (crear.html): coordina las partes que están en js/creator/ y genera la vista previa.
//   shared.js   estado compartido y mensajes
//   photos.js  subida de fotos (libre o por ángulos)
//   wizard.js  el formulario en tres pantallas en celular
//   waiting.js  pantalla de espera mientras se genera
//   order.js   tamaño, extras, total y reserva
import { viewerMaterials } from './viewer.js';
import { form, selectedFiles, state, onChange, showState, tailChoice, tailReady, wait } from './creator/shared.js';
import { photosToSend } from './creator/photos.js';
import './creator/wizard.js';
import { startWaiting, stopWaiting, setWaitStep, pollTask } from './creator/waiting.js';
import { setOrderStatus, syncOrderButtons, previewReady } from './creator/order.js';

const tabs = [
  { button: document.querySelector('#tab-prepare'), panel: document.querySelector('#panel-prepare'), name: 'prepare' },
  { button: document.querySelector('#tab-view'), panel: document.querySelector('#panel-view'), name: 'view' }
];
const petNameInput = document.querySelector('#pet-name');
const consentInput = document.querySelector('#consent');
const tailDescribe = document.querySelector('#tail-describe');
const tailNotesInput = document.querySelector('#tail-notes');
const generateHint = document.querySelector('#generate-hint');
const generateButton = document.querySelector('#generate-model');
const viewer = document.querySelector('#model-viewer');
const modelState = document.querySelector('#model-state');
const modelStage = document.querySelector('#model-stage');
const viewerHint = document.querySelector('#viewer-hint');
const figureTitle = document.querySelector('#figure-title');

// --- Pestañas: preparar (fotos y datos) y ver (la figura y la reserva) ---
function setActiveTab(name, focusButton = false) {
  tabs.forEach((tab) => {
    const active = tab.name === name;
    tab.button.classList.toggle('active', active);
    tab.button.setAttribute('aria-selected', String(active));
    tab.button.tabIndex = active ? 0 : -1;
    tab.panel.hidden = !active;
    if (active && focusButton) tab.button.focus();
  });
  if (name === 'view')
    requestAnimationFrame(() => {
      if (viewer.updateFraming) viewer.updateFraming();
    });
}
tabs.forEach((tab, index) => {
  tab.button.addEventListener('click', () => setActiveTab(tab.name));
  tab.button.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? tabs.length - 1
          : (index + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length;
    setActiveTab(tabs[next].name, true);
  });
});

function setModelState(message, ready) {
  modelState.textContent = message;
  modelState.classList.toggle('ready', Boolean(ready));
}

// --- Qué falta para generar, y qué botones se habilitan ---
function missingSteps() {
  const missing = [];
  if (state.preparingPhotos) missing.push('esperar a que se preparen las fotos');
  else if (!selectedFiles.length) missing.push('subir al menos una foto');
  if (!tailChoice()) missing.push('contarnos si se ve su cola');
  else if (!tailReady()) missing.push('describir su cola');
  if (!consentInput.checked) missing.push('aceptar el envío de las fotos');
  return missing;
}
function syncButtons() {
  const missing = missingSteps();
  generateButton.disabled = state.generationBusy || missing.length > 0 || !state.serviceReady;
  const list = missing.length > 1 ? missing.slice(0, -1).join(', ') + ' y ' + missing[missing.length - 1] : missing[0];
  generateHint.textContent = state.serviceReady && !state.generationBusy && missing.length ? 'Falta ' + list + '.' : '';
  syncOrderButtons();
}
onChange(syncButtons);
consentInput.addEventListener('change', syncButtons);
form.querySelectorAll('input[name="tail"]').forEach((radio) =>
  radio.addEventListener('change', () => {
    tailDescribe.hidden = tailChoice() !== 'not-visible';
    if (!tailDescribe.hidden) tailNotesInput.focus();
    syncButtons();
  })
);
tailNotesInput.addEventListener('input', syncButtons);

async function checkServer() {
  try {
    const response = await fetch('/api/health');
    const result = await response.json();
    state.serviceReady = Boolean(result.ready);
    if (!state.serviceReady)
      showState('La vista previa no está disponible en este momento. Vuelve a intentarlo más tarde.');
  } catch {
    state.serviceReady = false;
    showState('No pudimos conectar con el estudio. Recarga la página para intentarlo de nuevo.');
  }
  syncButtons();
}
checkServer();

// --- Pase del creador (protección contra envíos automáticos) ---
// El servidor lo entrega al abrir la página y lo exige para generar. Cada pase sirve una vez.
let previewPass = '';
async function refreshPass() {
  try {
    const response = await fetch('/api/pass', { cache: 'no-store' });
    const result = await response.json();
    previewPass = result.pass || '';
  } catch {
    previewPass = '';
  }
}
refreshPass();
function startGeneration(payload) {
  return fetch('/api/generate', { method: 'POST', body: payload, headers: { 'x-forma-pass': previewPass } });
}

// --- Generación de la vista previa ---
function waitForViewerLoad(source) {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error('La figura no se pudo abrir en el visor.')), 90000);
    viewer.addEventListener(
      'load',
      () => {
        window.clearTimeout(timeout);
        resolve();
      },
      { once: true }
    );
    viewer.addEventListener(
      'error',
      () => {
        window.clearTimeout(timeout);
        reject(new Error('La figura generada no se pudo abrir.'));
      },
      { once: true }
    );
    viewer.src = source;
  });
}
async function runGeneration() {
  if (state.generationBusy || !selectedFiles.length) return;
  state.generationBusy = true;
  syncButtons();
  startWaiting();
  showState('');
  setModelState('Preparando la figura', false);
  generateButton.textContent = 'Creando la vista previa…';
  const petName = petNameInput.value.trim();
  try {
    const payload = new FormData();
    photosToSend().forEach((entry) => {
      payload.append('images', entry.file, entry.file.name);
      payload.append('image_label', entry.label);
    });
    payload.append('species', document.querySelector('#pet-species').value);
    payload.append('petName', petName);
    payload.append('notes', document.querySelector('#pet-notes').value.trim());
    payload.append('tail', tailChoice());
    payload.append('tailNotes', tailChoice() === 'not-visible' ? tailNotesInput.value.trim() : '');
    payload.append('website', document.querySelector('#website').value);
    if (!previewPass) await refreshPass();
    let response = await startGeneration(payload);
    let started = await response.json();
    // Si el pase venció (por ejemplo, el servidor se reinició), se pide uno nuevo y se reintenta una vez.
    if (response.status === 403 && started.code === 'pass') {
      await refreshPass();
      await wait(4500);
      response = await startGeneration(payload);
      started = await response.json();
    }
    // Cada pase sirve una vez: se pide otro para la siguiente vista previa.
    refreshPass();
    if (!response.ok) throw new Error(started.error || 'No se pudo iniciar la vista previa.');
    setModelState('Modelando', false);
    setWaitStep('queue');
    const completed = await pollTask(started.id);
    if (!completed.modelReady) throw new Error('La figura se generó, pero no se pudo preparar la vista previa.');
    setWaitStep('viewer');
    await waitForViewerLoad('/api/model/' + encodeURIComponent(started.id) + '?v=' + Date.now());
    previewReady(started.id, viewerMaterials(viewer));
    modelStage.classList.add('ready');
    viewerHint.hidden = false;
    figureTitle.textContent = petName ? 'La figura de ' + petName : 'Su figura';
    setModelState('Vista previa lista', true);
    stopWaiting(true);
    showState('Listo. Revisa la figura y, si te gusta, elige el tamaño.', 'success');
    setOrderStatus('Revisa el tamaño y completa tus datos para reservar.');
    generateButton.textContent = 'Probar con otras fotos';
    setActiveTab('view');
  } catch (error) {
    setModelState(state.hasGeneratedModel ? 'Vista previa anterior' : 'Sin figura todavía', state.hasGeneratedModel);
    stopWaiting(false);
    showState(error.message || 'Ocurrió un error al crear la vista previa.');
    generateButton.textContent = 'Intentar de nuevo';
  } finally {
    state.generationBusy = false;
    syncButtons();
  }
}
form.addEventListener('submit', (event) => {
  event.preventDefault();
  if (missingSteps().length) return;
  runGeneration();
});
