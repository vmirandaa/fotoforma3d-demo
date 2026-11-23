// Pantalla de espera mientras se genera la vista previa: etapas, tiempo transcurrido, avance y consejos.
import { wait } from './shared.js';

const progressBox = document.querySelector('#generation-progress');
const progressFill = document.querySelector('#progress-fill');
const progressText = document.querySelector('#progress-text');
const progressTime = document.querySelector('#progress-time');
const waitSteps = document.querySelector('#wait-steps');
const waitTip = document.querySelector('#wait-tip');

const WAIT_STEPS = {
  send: 'Enviando las fotos…',
  queue: 'Revisando sus fotos…',
  shape: 'Armando su forma…',
  detail: 'Afinando orejas, patas y cola…',
  viewer: 'Abriendo la figura en 3D…'
};
const WAIT_TIPS = [
  'La medida de cada talla es el lado más largo de la figura. En la portada puedes compararlas con una taza.',
  'La figura llega en blanco, lista para pintar o para dejarla así. Si prefieres, al reservar puedes pedirla pintada por el taller.',
  'Reservar no te cobra nada todavía: te escribimos para confirmar el pago y el envío.',
  'Con el código de tu reserva y tu correo puedes ver en qué etapa va en «Mi pedido».',
  'Si la figura no te convence, puedes probar con otras fotos: un ángulo de costado suele mejorar mucho el resultado.',
  'Los detalles muy finos, como bigotes o pelos sueltos, se simplifican para que la figura se pueda imprimir.'
];
const PAGE_TITLE = document.title;
const waitState = { started: 0, step: '', clock: null, tipIndex: 0, realProgress: 0 };

function formatElapsed(ms) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
}
export function setWaitStep(step) {
  waitState.step = step;
  const order = Object.keys(WAIT_STEPS);
  const current = order.indexOf(step);
  waitSteps.querySelectorAll('li').forEach((item) => {
    const index = order.indexOf(item.dataset.step);
    item.classList.toggle('done', index < current);
    item.classList.toggle('current', index === current);
  });
  progressText.textContent = WAIT_STEPS[step];
}
function tickWait() {
  const elapsed = Date.now() - waitState.started;
  progressTime.textContent = formatElapsed(elapsed);
  // Avance estimado: se acerca al 95 % sin llegar, porque el servicio no informa un porcentaje real.
  // Si el servicio informa su avance real (Tripo lo hace), se usa cuando va por delante de la estimación.
  const estimate = Math.max(4 + 91 * (1 - Math.exp(-elapsed / 150000)), Math.min(95, waitState.realProgress));
  progressFill.style.setProperty('--progress', Number(estimate.toFixed(1)) / 100);
  const seconds = Math.floor(elapsed / 1000);
  if (seconds > 0 && seconds % 10 === 0) showWaitTip(waitState.tipIndex + 1);
}
function showWaitTip(index) {
  waitState.tipIndex = index % WAIT_TIPS.length;
  waitTip.textContent = WAIT_TIPS[waitState.tipIndex];
}
export function startWaiting() {
  waitState.started = Date.now();
  waitState.realProgress = 0;
  progressBox.hidden = false;
  progressBox.classList.remove('finished', 'failed');
  progressFill.style.setProperty('--progress', 0.04);
  progressTime.textContent = '0:00';
  showWaitTip(Math.floor(Math.random() * WAIT_TIPS.length));
  setWaitStep('send');
  window.clearInterval(waitState.clock);
  waitState.clock = window.setInterval(tickWait, 1000);
  progressBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
export function stopWaiting(ok) {
  window.clearInterval(waitState.clock);
  progressBox.classList.add(ok ? 'finished' : 'failed');
  if (ok) {
    waitSteps.querySelectorAll('li').forEach((item) => {
      item.classList.add('done');
      item.classList.remove('current');
    });
    progressFill.style.setProperty('--progress', 1);
    progressText.textContent = 'La vista previa está lista.';
    // Si el cliente se fue a otra pestaña, el título le avisa que ya puede volver.
    if (document.hidden) document.title = '✓ Su figura está lista · FORMA';
  } else {
    progressText.textContent = 'No se pudo completar.';
    if (document.hidden) document.title = 'No se pudo crear la figura · FORMA';
  }
}
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) document.title = PAGE_TITLE;
});

// Pregunta al servidor cómo va la vista previa hasta que esté lista, falle o pasen 20 minutos.
export async function pollTask(id) {
  const deadline = Date.now() + 20 * 60 * 1000;
  let delay = 4000;
  while (Date.now() < deadline) {
    await wait(delay);
    const response = await fetch('/api/status/' + encodeURIComponent(id));
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'No se pudo consultar el avance.');
    if (result.status === 'failed') throw new Error(result.error || 'No pudimos crear la figura con esta foto.');
    if (result.status === 'done') return result;
    if (Number(result.progress) > 0) waitState.realProgress = Number(result.progress);
    if (result.status === 'generating' || result.status === 'downloading') {
      setWaitStep(Date.now() - waitState.started > 100000 || result.status === 'downloading' ? 'detail' : 'shape');
    }
    delay = Math.min(delay + 2000, 15000);
  }
  throw new Error('La vista previa está tardando más de lo esperado. Inténtalo nuevamente más tarde.');
}
