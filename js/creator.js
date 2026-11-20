const tabs = [
  { button: document.querySelector('#tab-prepare'), panel: document.querySelector('#panel-prepare'), name: 'prepare' },
  { button: document.querySelector('#tab-view'), panel: document.querySelector('#panel-view'), name: 'view' }
];
const form = document.querySelector('#generation-form');
const imageInput = document.querySelector('#reference-images');
const uploadZone = document.querySelector('#upload-zone');
const fileList = document.querySelector('#file-list');
const moreAngles = document.querySelector('#more-angles');
const petNameInput = document.querySelector('#pet-name');
const consentInput = document.querySelector('#consent');
const tailDescribe = document.querySelector('#tail-describe');
const tailNotesInput = document.querySelector('#tail-notes');
const generateHint = document.querySelector('#generate-hint');
const generateButton = document.querySelector('#generate-model');
const stateBox = document.querySelector('#generation-state');
const progressBox = document.querySelector('#generation-progress');
const progressFill = document.querySelector('#progress-fill');
const progressText = document.querySelector('#progress-text');
const progressTime = document.querySelector('#progress-time');
const waitSteps = document.querySelector('#wait-steps');
const waitTip = document.querySelector('#wait-tip');
const viewer = document.querySelector('#model-viewer');
const modelState = document.querySelector('#model-state');
const modelStage = document.querySelector('#model-stage');
const viewerHint = document.querySelector('#viewer-hint');
const figureTitle = document.querySelector('#figure-title');
const finishWhite = document.querySelector('#finish-white');
const finishColor = document.querySelector('#finish-color');
const orderForm = document.querySelector('#order-form');
const sizeOptions = document.querySelector('#size-options');
const orderName = document.querySelector('#order-name');
const orderEmail = document.querySelector('#order-email');
const orderNotes = document.querySelector('#order-notes');
const orderSubmit = document.querySelector('#order-submit');
const orderStatus = document.querySelector('#order-status');
const selectedFiles = [];
const WHITE_FINISH = [0.93, 0.92, 0.89, 1];
let serviceReady = false;
let generationBusy = false;
let orderBusy = false;
let orderSent = false;
let taskId = null;
let hasGeneratedModel = false;
let originalMaterials = [];

function setActiveTab(name, focusButton = false) {
  tabs.forEach((tab) => {
    const active = tab.name === name;
    tab.button.classList.toggle('active', active);
    tab.button.setAttribute('aria-selected', String(active));
    tab.button.tabIndex = active ? 0 : -1;
    tab.panel.hidden = !active;
    if (active && focusButton) tab.button.focus();
  });
  if (name === 'view') requestAnimationFrame(() => {
    if (viewer.updateFraming) viewer.updateFraming();
  });
}
tabs.forEach((tab, index) => {
  tab.button.addEventListener('click', () => setActiveTab(tab.name));
  tab.button.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length;
    setActiveTab(tabs[next].name, true);
  });
});

const directionOptions = [
  ['?', 'Vista sin indicar'], ['Front', 'Frente'], ['Front-Left', 'Frente izquierda'],
  ['Front-Right', 'Frente derecha'], ['Back', 'Espalda'], ['Back-Left', 'Espalda izquierda'],
  ['Back-Right', 'Espalda derecha'], ['Left', 'Costado izquierdo'], ['Right', 'Costado derecho'],
  ['Up', 'Desde arriba'], ['Down', 'Desde abajo']
];
function showState(message, kind) {
  stateBox.textContent = message || '';
  stateBox.className = 'generation-state' + (kind ? ' ' + kind : '');
}
function setModelState(message, ready) {
  modelState.replaceChildren(document.createElement('i'), ' ' + message);
  modelState.classList.toggle('ready', Boolean(ready));
}
function setOrderStatus(message, kind) {
  orderStatus.textContent = message || '';
  orderStatus.className = 'order-status' + (kind ? ' ' + kind : '');
}
function selectedSize() {
  const checked = sizeOptions.querySelector('input:checked');
  return checked ? checked.value : '';
}
// La cola es lo que más falla cuando no aparece en las fotos, así que se pregunta siempre.
function tailChoice() {
  const checked = form.querySelector('input[name="tail"]:checked');
  return checked ? checked.value : '';
}
function tailReady() {
  return tailChoice() !== '' && (tailChoice() !== 'oculta' || tailNotesInput.value.trim().length >= 3);
}
function missingSteps() {
  const missing = [];
  if (preparingPhotos) missing.push('esperar a que se preparen las fotos');
  else if (!selectedFiles.length) missing.push('subir al menos una foto');
  if (!tailChoice()) missing.push('contarnos si se ve su cola');
  else if (!tailReady()) missing.push('describir su cola');
  if (!consentInput.checked) missing.push('aceptar el envío de las fotos');
  return missing;
}
function syncButtons() {
  const missing = missingSteps();
  generateButton.disabled = generationBusy || missing.length > 0 || !serviceReady;
  const list = missing.length > 1 ? missing.slice(0, -1).join(', ') + ' y ' + missing[missing.length - 1] : missing[0];
  generateHint.textContent = serviceReady && !generationBusy && missing.length ? 'Falta ' + list + '.' : '';
  orderSubmit.disabled = generationBusy || orderBusy || orderSent || !hasGeneratedModel || !selectedSize();
  finishWhite.disabled = finishColor.disabled = !hasGeneratedModel;
}
consentInput.addEventListener('change', syncButtons);
form.querySelectorAll('input[name="tail"]').forEach((radio) => radio.addEventListener('change', () => {
  tailDescribe.hidden = tailChoice() !== 'oculta';
  if (!tailDescribe.hidden) tailNotesInput.focus();
  syncButtons();
}));
tailNotesInput.addEventListener('input', syncButtons);

// --- Fotos ---
function filesReadyMessage() {
  return selectedFiles.length === 1 ? 'Foto lista.' : selectedFiles.length + ' fotos listas.';
}
// Las fotos se achican en el navegador antes de enviarlas: suben más rápido con datos móviles
// y quedan dentro de los límites de cualquier proveedor 3D (Hunyuan, por ejemplo, pide unos 6 MB por foto).
const PHOTO_MAX_SIDE = 2048;
const PHOTO_MAX_BYTES = 4 * 1024 * 1024;
const PHOTO_MIN_SIDE = 600;
let preparingPhotos = 0;
async function preparePhoto(file) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    return { file, small: false };
  }
  const longest = Math.max(bitmap.width, bitmap.height);
  const small = longest < PHOTO_MIN_SIDE;
  if (file.type !== 'image/webp' && longest <= PHOTO_MAX_SIDE && file.size <= PHOTO_MAX_BYTES) {
    bitmap.close();
    return { file, small };
  }
  const scale = Math.min(1, PHOTO_MAX_SIDE / longest);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext('2d');
  context.fillStyle = '#ffffff'; // fondo blanco para fotos recortadas con transparencia
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
  if (!blob) return { file, small };
  const name = file.name.replace(/\.[^.]+$/, '') + '.jpg';
  return { file: new File([blob], name, { type: 'image/jpeg', lastModified: file.lastModified }), small };
}
// slotLabel: en el modo por ángulos, la foto va a ese recuadro (Front, Left, Right o Back) y reemplaza la que hubiera.
async function addFiles(files, slotLabel = '') {
  const accepted = [];
  for (const file of Array.from(files || []).slice(0, slotLabel ? 1 : undefined)) {
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
      showState('Solo se aceptan fotos JPG, PNG o WEBP.');
      continue;
    }
    if (file.size > 25 * 1024 * 1024) {
      showState('Cada foto debe pesar 25 MB o menos.');
      continue;
    }
    const key = file.name + ':' + file.size;
    if (selectedFiles.some((entry) => entry.sourceKey === key && entry.label !== slotLabel) || accepted.some((item) => item.key === key)) {
      if (slotLabel) showState('Esa foto ya está en otro ángulo.');
      continue;
    }
    if (!slotLabel && selectedFiles.length + preparingPhotos + accepted.length >= 5) {
      showState('Puedes subir hasta cinco fotos de la misma mascota.');
      break;
    }
    accepted.push({ file, key });
  }
  if (!accepted.length) {
    syncButtons();
    return;
  }
  preparingPhotos += accepted.length;
  showState(accepted.length === 1 ? 'Preparando la foto…' : 'Preparando ' + accepted.length + ' fotos…');
  syncButtons();
  const smallPhotos = [];
  for (const item of accepted) {
    const prepared = await preparePhoto(item.file);
    preparingPhotos -= 1;
    if (slotLabel) {
      const previous = selectedFiles.findIndex((entry) => entry.label === slotLabel);
      if (previous >= 0) selectedFiles.splice(previous, 1);
      selectedFiles.push({ file: prepared.file, sourceKey: item.key, label: slotLabel });
    } else {
      selectedFiles.push({ file: prepared.file, sourceKey: item.key, label: selectedFiles.length === 0 ? 'Front' : '?' });
    }
    if (prepared.small) smallPhotos.push(item.file.name);
    renderFiles();
    syncButtons();
  }
  if (preparingPhotos) return;
  if (smallPhotos.length) {
    showState((smallPhotos.length === 1 ? 'Una foto es muy pequeña' : smallPhotos.length + ' fotos son muy pequeñas') + ' (menos de ' + PHOTO_MIN_SIDE + ' px): la figura puede salir con menos detalle.');
  } else {
    showState(filesReadyMessage(), 'success');
  }
}
function renderFiles() {
  selectedFiles.forEach((entry) => { if (entry.previewUrl) URL.revokeObjectURL(entry.previewUrl); });
  if (uploadMode === 'angulos') { renderAngleSlots(); return; }
  fileList.replaceChildren();
  fileList.classList.toggle('single', selectedFiles.length < 2);
  moreAngles.hidden = selectedFiles.length === 0;
  moreAngles.classList.toggle('nudge', selectedFiles.length === 1);
  if (selectedFiles.length === 1) moreAngles.textContent = 'Con una sola foto, el modelo inventa lo que no se ve. Si puedes, suma una de costado o donde se vea la cola.';
  else if (selectedFiles.length >= 5) moreAngles.textContent = 'Llegaste al máximo de cinco fotos. Indica desde dónde está tomada cada una.';
  else moreAngles.textContent = 'Indica desde dónde está tomada cada foto: ayuda a armar bien el volumen.';
  selectedFiles.forEach((entry, index) => {
    const card = document.createElement('div');
    card.className = 'file-thumb';
    const image = document.createElement('img');
    entry.previewUrl = URL.createObjectURL(entry.file);
    image.src = entry.previewUrl;
    image.alt = 'Foto seleccionada ' + (index + 1);
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.setAttribute('aria-label', 'Quitar foto ' + (index + 1));
    remove.textContent = '×';
    remove.addEventListener('click', () => {
      if (entry.previewUrl) URL.revokeObjectURL(entry.previewUrl);
      selectedFiles.splice(index, 1);
      renderFiles();
      syncButtons();
      showState(selectedFiles.length ? filesReadyMessage() : 'Sube al menos una foto.', selectedFiles.length ? 'success' : '');
    });
    const select = document.createElement('select');
    select.setAttribute('aria-label', 'Ángulo de la foto ' + (index + 1));
    directionOptions.forEach(([value, label]) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      if (entry.label === value) option.selected = true;
      select.append(option);
    });
    select.addEventListener('change', () => { entry.label = select.value; });
    card.append(image, remove, select);
    fileList.append(card);
  });
}
imageInput.addEventListener('change', () => {
  addFiles(Array.from(imageInput.files));
  imageInput.value = '';
});
uploadZone.addEventListener('dragover', (event) => {
  event.preventDefault();
  uploadZone.classList.add('dragover');
});
uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('dragover'));
uploadZone.addEventListener('drop', (event) => {
  event.preventDefault();
  uploadZone.classList.remove('dragover');
  addFiles(event.dataTransfer.files);
});

// --- Subida por ángulos: cuatro recuadros (frente, costados y espalda), una foto en cada uno ---
const ANGLE_SLOTS = [
  { label: 'Front', name: 'Frente', icon: '◉' },
  { label: 'Left', name: 'Costado izquierdo', icon: '◐' },
  { label: 'Right', name: 'Costado derecho', icon: '◑' },
  { label: 'Back', name: 'Espalda', icon: '○' }
];
const uploadModeBox = document.querySelector('#upload-mode');
const angleSlots = document.querySelector('#angle-slots');
let uploadMode = 'libre';
function renderAngleSlots() {
  angleSlots.replaceChildren();
  ANGLE_SLOTS.forEach((slot) => {
    const entry = selectedFiles.find((item) => item.label === slot.label);
    const box = document.createElement('label');
    box.className = 'angle-slot' + (entry ? ' con-foto' : '') + (slot.label === 'Front' ? ' principal' : '');
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/webp';
    input.setAttribute('aria-label', (entry ? 'Cambiar' : 'Subir') + ' la foto: ' + slot.name);
    input.addEventListener('change', () => { addFiles(Array.from(input.files), slot.label); input.value = ''; });
    box.append(input);
    if (entry) {
      const image = document.createElement('img');
      entry.previewUrl = URL.createObjectURL(entry.file);
      image.src = entry.previewUrl;
      image.alt = 'Foto: ' + slot.name;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = '×';
      remove.setAttribute('aria-label', 'Quitar la foto: ' + slot.name);
      remove.addEventListener('click', (event) => {
        event.preventDefault();
        if (entry.previewUrl) URL.revokeObjectURL(entry.previewUrl);
        selectedFiles.splice(selectedFiles.indexOf(entry), 1);
        renderFiles();
        syncButtons();
        showState(selectedFiles.length ? filesReadyMessage() : 'Sube al menos una foto.', selectedFiles.length ? 'success' : '');
      });
      const name = document.createElement('span');
      name.className = 'angle-name';
      name.textContent = slot.name;
      box.append(image, remove, name);
    } else {
      const icon = document.createElement('span');
      icon.className = 'angle-icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = slot.icon;
      const name = document.createElement('strong');
      name.textContent = slot.name;
      const hint = document.createElement('small');
      hint.textContent = slot.label === 'Front' ? 'La más importante' : 'Opcional';
      box.append(icon, name, hint);
    }
    box.addEventListener('dragover', (event) => { event.preventDefault(); box.classList.add('dragover'); });
    box.addEventListener('dragleave', () => box.classList.remove('dragover'));
    box.addEventListener('drop', (event) => {
      event.preventDefault();
      box.classList.remove('dragover');
      addFiles(event.dataTransfer.files, slot.label);
    });
    angleSlots.append(box);
  });
  const count = selectedFiles.length;
  moreAngles.hidden = false;
  moreAngles.classList.toggle('nudge', count === 1);
  moreAngles.textContent = count === 0
    ? 'Toca cada recuadro para subir la foto de ese ángulo. Con la de frente basta para empezar.'
    : count < 4
      ? 'Cada ángulo que sumes ayuda a que la figura salga más parecida, sobre todo la espalda si se ve la cola.'
      : 'Tienes los cuatro ángulos: es la mejor base para la figura.';
}
// Al pasar a ángulos, las fotos que ya estaban se reparten en los recuadros (primero las que ya tenían ese ángulo).
function setUploadMode(mode) {
  if (mode === uploadMode || preparingPhotos) return;
  uploadMode = mode;
  if (mode === 'angulos') {
    const slotLabels = ANGLE_SLOTS.map((slot) => slot.label);
    const placed = new Set();
    selectedFiles.forEach((entry) => {
      if (slotLabels.includes(entry.label) && !placed.has(entry.label)) placed.add(entry.label);
      else entry.label = '';
    });
    selectedFiles.forEach((entry) => {
      if (entry.label) return;
      const free = slotLabels.find((label) => !placed.has(label));
      if (free) { entry.label = free; placed.add(free); }
    });
    const extra = selectedFiles.filter((entry) => !entry.label);
    extra.forEach((entry) => {
      if (entry.previewUrl) URL.revokeObjectURL(entry.previewUrl);
      selectedFiles.splice(selectedFiles.indexOf(entry), 1);
    });
    if (extra.length) showState('Por ángulos caben cuatro fotos: quitamos ' + (extra.length === 1 ? 'una' : extra.length) + '. Revisa que cada una esté en su recuadro.');
  }
  uploadModeBox.querySelectorAll('button').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.mode === mode)));
  angleSlots.hidden = mode !== 'angulos';
  uploadZone.hidden = mode === 'angulos';
  fileList.hidden = mode === 'angulos';
  renderFiles();
  syncButtons();
}
uploadModeBox.querySelectorAll('button').forEach((button) => button.addEventListener('click', () => setUploadMode(button.dataset.mode)));

// --- Creador por pasos en celular ---
// En pantallas chicas el formulario se muestra en tres pantallas (fotos, su mascota, confirmar).
// No se mueven elementos: cada uno lleva su número de paso y el CSS oculta los de los otros pasos.
const WIZARD_STEPS = [
  { title: 'Sus fotos', parts: ['.studio-form-heading', '.photo-checklist', '#upload-mode', '#angle-slots', '#upload-zone', '#file-list', '#more-angles'] },
  { title: 'Su mascota', parts: ['#pet-name', '#pet-species', '.tail-field', '#pet-notes'] },
  { title: 'Confirmar', parts: ['.consent-row', '#generate-model', '#generate-hint', '#generation-progress', '.privacy-message'] }
];
const wizardQuery = window.matchMedia('(max-width: 700px)');
const wizardHead = document.createElement('div');
wizardHead.className = 'wizard-head';
const wizardNav = document.createElement('div');
wizardNav.className = 'wizard-nav';
const wizardBack = Object.assign(document.createElement('button'), { type: 'button', className: 'wizard-back', textContent: '← Atrás' });
const wizardNext = Object.assign(document.createElement('button'), { type: 'button', className: 'button button-dark wizard-next' });
const wizardHint = Object.assign(document.createElement('p'), { className: 'wizard-hint' });
wizardHint.setAttribute('role', 'status');
wizardNav.append(wizardBack, wizardNext, wizardHint);
WIZARD_STEPS.forEach((step, index) => {
  step.parts.forEach((selector) => {
    const element = form.querySelector(selector);
    const block = element && (element.closest('.field-block') && !element.matches('fieldset') ? element.closest('.field-block') : element);
    if (block) block.dataset.paso = String(index + 1);
  });
});
form.prepend(wizardHead);
form.append(wizardNav);
let wizardStep = 1;
function wizardBlocker(step) {
  if (step === 1) {
    if (preparingPhotos) return 'Espera a que se preparen las fotos.';
    if (!selectedFiles.length) return 'Sube al menos una foto para seguir.';
  }
  if (step === 2) {
    if (!tailChoice()) return 'Cuéntanos si se ve su cola en las fotos.';
    if (!tailReady()) return 'Describe brevemente su cola.';
  }
  return '';
}
function renderWizard(scroll) {
  const active = wizardQuery.matches;
  form.classList.toggle('wizard', active);
  if (!active) { delete form.dataset.pasoActual; return; }
  form.dataset.pasoActual = String(wizardStep);
  wizardHead.replaceChildren();
  const label = document.createElement('span');
  label.textContent = 'Paso ' + wizardStep + ' de ' + WIZARD_STEPS.length;
  const title = document.createElement('strong');
  title.textContent = WIZARD_STEPS[wizardStep - 1].title;
  const dots = document.createElement('ol');
  dots.setAttribute('aria-hidden', 'true');
  WIZARD_STEPS.forEach((step, index) => {
    const dot = document.createElement('li');
    if (index + 1 < wizardStep) dot.className = 'hecho';
    if (index + 1 === wizardStep) dot.className = 'actual';
    dots.append(dot);
  });
  wizardHead.append(label, title, dots);
  wizardBack.hidden = wizardStep === 1;
  wizardNext.hidden = wizardStep === WIZARD_STEPS.length;
  wizardNext.innerHTML = 'Siguiente: ' + WIZARD_STEPS[Math.min(wizardStep, WIZARD_STEPS.length - 1)].title.toLowerCase() + ' <span>→</span>';
  wizardHint.textContent = '';
  // Un aviso de éxito del paso anterior ("Foto lista.") ya no aporta al cambiar de paso.
  if (scroll && stateBox.classList.contains('success')) showState('');
  if (scroll) form.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
wizardNext.addEventListener('click', () => {
  const blocker = wizardBlocker(wizardStep);
  if (blocker) { wizardHint.textContent = blocker; return; }
  wizardStep = Math.min(wizardStep + 1, WIZARD_STEPS.length);
  renderWizard(true);
});
wizardBack.addEventListener('click', () => {
  if (generationBusy) return;
  wizardStep = Math.max(wizardStep - 1, 1);
  renderWizard(true);
});
wizardQuery.addEventListener('change', () => renderWizard(false));
renderWizard(false);

async function checkServer() {
  try {
    const response = await fetch('/api/health');
    const result = await response.json();
    serviceReady = Boolean(result.ready);
    if (!serviceReady) showState('La vista previa no está disponible en este momento. Vuelve a intentarlo más tarde.');
  } catch {
    serviceReady = false;
    showState('No pudimos conectar con el estudio. Recarga la página para intentarlo de nuevo.');
  }
  syncButtons();
}
checkServer();

// --- Acabado de la vista previa: en blanco (como se imprime) o con los colores de la foto ---
function captureMaterials() {
  const materials = (viewer.model && viewer.model.materials) || [];
  originalMaterials = materials.map((material) => {
    const pbr = material.pbrMetallicRoughness;
    return {
      pbr,
      color: Array.from(pbr.baseColorFactor),
      metallic: pbr.metallicFactor,
      roughness: pbr.roughnessFactor,
      colorTexture: pbr.baseColorTexture ? pbr.baseColorTexture.texture : null,
      surfaceTexture: pbr.metallicRoughnessTexture ? pbr.metallicRoughnessTexture.texture : null
    };
  });
}
function applyFinish(kind) {
  const white = kind !== 'color';
  originalMaterials.forEach((entry) => {
    const { pbr } = entry;
    if (pbr.baseColorTexture) pbr.baseColorTexture.setTexture(white ? null : entry.colorTexture);
    if (pbr.metallicRoughnessTexture) pbr.metallicRoughnessTexture.setTexture(white ? null : entry.surfaceTexture);
    pbr.setBaseColorFactor(white ? WHITE_FINISH : entry.color);
    pbr.setMetallicFactor(white ? 0 : entry.metallic);
    pbr.setRoughnessFactor(white ? 0.82 : entry.roughness);
  });
  finishWhite.setAttribute('aria-pressed', String(white));
  finishColor.setAttribute('aria-pressed', String(!white));
}
finishWhite.addEventListener('click', () => applyFinish('white'));
finishColor.addEventListener('click', () => applyFinish('color'));

// --- Generación de la vista previa ---
function wait(ms) { return new Promise((resolve) => window.setTimeout(resolve, ms)); }

// --- Pantalla de espera: etapas, tiempo transcurrido y consejos mientras se genera ---
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
const waitState = { started: 0, step: '', clock: null, tipIndex: 0 };
function formatElapsed(ms) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
}
function setWaitStep(step) {
  waitState.step = step;
  const order = Object.keys(WAIT_STEPS);
  const current = order.indexOf(step);
  waitSteps.querySelectorAll('li').forEach((item) => {
    const index = order.indexOf(item.dataset.step);
    item.classList.toggle('hecho', index < current);
    item.classList.toggle('actual', index === current);
  });
  progressText.textContent = WAIT_STEPS[step];
}
function tickWait() {
  const elapsed = Date.now() - waitState.started;
  progressTime.textContent = formatElapsed(elapsed);
  // Avance estimado: se acerca al 95 % sin llegar, porque el servicio no informa un porcentaje real.
  const estimate = 4 + 91 * (1 - Math.exp(-elapsed / 150000));
  progressFill.style.width = estimate.toFixed(1) + '%';
  const seconds = Math.floor(elapsed / 1000);
  if (seconds > 0 && seconds % 10 === 0) showWaitTip(waitState.tipIndex + 1);
}
function showWaitTip(index) {
  waitState.tipIndex = index % WAIT_TIPS.length;
  waitTip.textContent = WAIT_TIPS[waitState.tipIndex];
}
function startWaiting() {
  waitState.started = Date.now();
  progressBox.hidden = false;
  progressBox.classList.remove('terminado', 'fallido');
  progressFill.style.width = '4%';
  progressTime.textContent = '0:00';
  showWaitTip(Math.floor(Math.random() * WAIT_TIPS.length));
  setWaitStep('send');
  window.clearInterval(waitState.clock);
  waitState.clock = window.setInterval(tickWait, 1000);
  progressBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
function stopWaiting(ok) {
  window.clearInterval(waitState.clock);
  progressBox.classList.add(ok ? 'terminado' : 'fallido');
  if (ok) {
    waitSteps.querySelectorAll('li').forEach((item) => { item.classList.add('hecho'); item.classList.remove('actual'); });
    progressFill.style.width = '100%';
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

async function pollTask(id) {
  const deadline = Date.now() + 20 * 60 * 1000;
  let delay = 4000;
  while (Date.now() < deadline) {
    await wait(delay);
    const response = await fetch('/api/status/' + encodeURIComponent(id));
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'No se pudo consultar el avance.');
    if (result.status === 'failed') throw new Error(result.error || 'No pudimos crear la figura con esta foto.');
    if (result.status === 'done') return result;
    if (result.status === 'generating' || result.status === 'downloading') {
      setWaitStep(Date.now() - waitState.started > 100000 || result.status === 'downloading' ? 'detail' : 'shape');
    }
    delay = Math.min(delay + 2000, 15000);
  }
  throw new Error('La vista previa está tardando más de lo esperado. Inténtalo nuevamente más tarde.');
}
function waitForViewerLoad(source) {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error('La figura no se pudo abrir en el visor.')), 90000);
    viewer.addEventListener('load', () => { window.clearTimeout(timeout); resolve(); }, { once: true });
    viewer.addEventListener('error', () => { window.clearTimeout(timeout); reject(new Error('La figura generada no se pudo abrir.')); }, { once: true });
    viewer.src = source;
  });
}

async function runGeneration() {
  if (generationBusy || !selectedFiles.length) return;
  generationBusy = true;
  syncButtons();
  startWaiting();
  showState('');
  setModelState('PREPARANDO LA FIGURA', false);
  generateButton.innerHTML = 'Creando la vista previa… <span>◌</span>';
  const petName = petNameInput.value.trim();
  try {
    const payload = new FormData();
    // Por ángulos, las fotos se envían en el orden de los recuadros (frente, costados, espalda).
    const slotOrder = ANGLE_SLOTS.map((slot) => slot.label);
    const photosToSend = uploadMode === 'angulos'
      ? [...selectedFiles].sort((a, b) => slotOrder.indexOf(a.label) - slotOrder.indexOf(b.label))
      : selectedFiles;
    photosToSend.forEach((entry) => {
      payload.append('images', entry.file, entry.file.name);
      payload.append('image_label', entry.label);
    });
    payload.append('species', document.querySelector('#pet-species').value);
    payload.append('petName', petName);
    payload.append('notes', document.querySelector('#pet-notes').value.trim());
    payload.append('tail', tailChoice());
    payload.append('tailNotes', tailChoice() === 'oculta' ? tailNotesInput.value.trim() : '');
    const response = await fetch('/api/generate', { method: 'POST', body: payload });
    const started = await response.json();
    if (!response.ok) throw new Error(started.error || 'No se pudo iniciar la vista previa.');
    setModelState('MODELANDO', false);
    setWaitStep('queue');
    const completed = await pollTask(started.id);
    if (!completed.modelReady) throw new Error('La figura se generó, pero no se pudo preparar la vista previa.');
    setWaitStep('viewer');
    await waitForViewerLoad('/api/model/' + encodeURIComponent(started.id) + '?v=' + Date.now());
    taskId = started.id;
    hasGeneratedModel = true;
    orderSent = false;
    captureMaterials();
    applyFinish(selectedFinish() === 'pintada' ? 'color' : 'white');
    modelStage.classList.add('ready');
    viewerHint.hidden = false;
    figureTitle.textContent = petName ? 'La figura de ' + petName : 'Su figura';
    setModelState('VISTA PREVIA LISTA', true);
    stopWaiting(true);
    showState('Listo. Revisa la figura y, si te gusta, elige el tamaño.', 'success');
    setOrderStatus('Revisa el tamaño y completa tus datos para reservar.');
    generateButton.innerHTML = 'Probar con otras fotos <span>↗</span>';
    setActiveTab('view');
  } catch (error) {
    setModelState(hasGeneratedModel ? 'VISTA PREVIA ANTERIOR' : 'SIN FIGURA TODAVÍA', hasGeneratedModel);
    stopWaiting(false);
    showState(error.message || 'Ocurrió un error al crear la vista previa.');
    generateButton.innerHTML = 'Intentar de nuevo <span>↗</span>';
  } finally {
    generationBusy = false;
    syncButtons();
  }
}
form.addEventListener('submit', (event) => {
  event.preventDefault();
  if (missingSteps().length) return;
  runGeneration();
});

// --- Pedido ---
const paintOption = document.querySelector('#paint-option');
const paintPrice = document.querySelector('#paint-price');
const finishNote = document.querySelector('#finish-note');
const orderTotal = document.querySelector('#order-total');
const extrasBox = document.querySelector('#extras-options');
let catalogSizes = [];
let catalogExtras = { formatos: [], estilos: [], bases: [], cantidadMaxima: 10 };
let baseNameInput = null;
let quantityInput = null;

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
  const max = Number(catalogExtras.cantidadMaxima) || 10;
  const quantity = Math.min(max, Math.max(1, Math.round(Number(quantityInput && quantityInput.value) || 1)));
  return { formato, estilo, base, baseName: base.conNombre && baseNameInput ? baseNameInput.value.trim() : '', quantity };
}
function priceLabel(value) {
  return Number(value) > 0 ? '+' + formatPrice(value) : 'Incluido';
}
function buildChoiceGroup(legend, name, options) {
  if (!options || !options.length) return null;
  const group = document.createElement('fieldset');
  group.className = 'size-options extras-group';
  const title = document.createElement('legend');
  title.textContent = legend;
  group.append(title);
  options.forEach((option, index) => {
    const label = document.createElement('label');
    label.className = 'size-option';
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = name;
    input.value = option.id;
    input.checked = index === 0;
    input.addEventListener('change', updateOrderTotal);
    const strong = document.createElement('strong');
    strong.textContent = option.nombre;
    const small = document.createElement('small');
    small.textContent = [option.detalle, priceLabel(option.precio)].filter(Boolean).join(' · ');
    label.append(input, strong, small);
    group.append(label);
  });
  return group;
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
  const nameBlock = document.createElement('div');
  nameBlock.className = 'field-block base-name';
  nameBlock.hidden = true;
  const nameLabel = document.createElement('label');
  nameLabel.htmlFor = 'base-name';
  nameLabel.textContent = 'Nombre para la base';
  baseNameInput = document.createElement('input');
  baseNameInput.id = 'base-name';
  baseNameInput.type = 'text';
  baseNameInput.maxLength = 24;
  baseNameInput.autocomplete = 'off';
  baseNameInput.placeholder = 'Ej.: Luna';
  baseNameInput.addEventListener('input', updateOrderTotal);
  const nameHint = document.createElement('small');
  nameHint.textContent = 'Hasta 24 letras. Lo grabamos tal como lo escribas.';
  nameBlock.append(nameLabel, baseNameInput, nameHint);
  extrasBox.append(nameBlock);

  // Cantidad, con botones para sumar y restar.
  const max = Number(extras.cantidadMaxima) || 10;
  const quantity = document.createElement('div');
  quantity.className = 'quantity-field';
  const quantityLabel = document.createElement('label');
  quantityLabel.htmlFor = 'order-quantity';
  quantityLabel.textContent = 'Cantidad';
  const stepper = document.createElement('div');
  stepper.className = 'quantity-stepper';
  const minus = Object.assign(document.createElement('button'), { type: 'button', textContent: '−' });
  minus.setAttribute('aria-label', 'Una menos');
  const plus = Object.assign(document.createElement('button'), { type: 'button', textContent: '+' });
  plus.setAttribute('aria-label', 'Una más');
  quantityInput = Object.assign(document.createElement('input'), { id: 'order-quantity', type: 'number', min: 1, max, value: 1, inputMode: 'numeric' });
  const step = (delta) => {
    quantityInput.value = Math.min(max, Math.max(1, (Number(quantityInput.value) || 1) + delta));
    updateOrderTotal();
  };
  minus.addEventListener('click', () => step(-1));
  plus.addEventListener('click', () => step(1));
  quantityInput.addEventListener('input', updateOrderTotal);
  quantityInput.addEventListener('change', () => step(0));
  stepper.append(minus, quantityInput, plus);
  const quantityHint = document.createElement('small');
  quantityHint.textContent = 'Hasta ' + max + ' figuras iguales por reserva.';
  quantity.append(quantityLabel, stepper, quantityHint);
  extrasBox.append(quantity);
}
function selectedFinish() {
  const checked = orderForm.querySelector('input[name="finish"]:checked');
  return checked ? checked.value : 'blanco';
}
// Muestra el recargo de pintarla según la talla elegida y el total de la reserva.
function updateOrderTotal() {
  const size = catalogSizes.find((item) => item.id === selectedSize());
  const canPaint = Boolean(size && Number(size.pintada) > 0);
  paintOption.hidden = !canPaint;
  if (!canPaint && selectedFinish() === 'pintada') orderForm.querySelector('input[name="finish"][value="blanco"]').checked = true;
  paintPrice.textContent = canPaint ? '+' + formatPrice(size.pintada) + ' · por el taller' : 'por el taller';
  const painted = canPaint && selectedFinish() === 'pintada';
  finishNote.hidden = !painted;
  const extras = selectedExtras();
  const nameBlock = extrasBox && extrasBox.querySelector('.base-name');
  if (nameBlock) nameBlock.hidden = !extras.base.conNombre;
  orderTotal.hidden = !size;
  if (size) {
    const unit = size.precio + (painted ? Number(size.pintada) : 0) + Number(extras.formato.precio || 0) + Number(extras.estilo.precio || 0) + Number(extras.base.precio || 0);
    const parts = ['Total ', Object.assign(document.createElement('strong'), { textContent: formatPrice(unit * extras.quantity) }), ' más envío'];
    if (extras.quantity > 1) parts.push(Object.assign(document.createElement('small'), { textContent: extras.quantity + ' × ' + formatPrice(unit) }));
    orderTotal.replaceChildren(...parts);
  }
}
orderForm.querySelectorAll('input[name="finish"]').forEach((radio) => radio.addEventListener('change', () => {
  updateOrderTotal();
  // Al elegir pintada se muestra la vista previa con sus colores, que es la guía del taller.
  if (hasGeneratedModel) applyFinish(selectedFinish() === 'pintada' ? 'color' : 'white');
}));

catalogPromise.then((catalog) => {
  catalogSizes = catalog.tallas;
  buildExtras(catalog.extras);
  catalog.tallas.forEach((size) => {
    const option = document.createElement('label');
    option.className = 'size-option';
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = 'size';
    input.value = size.id;
    input.checked = Boolean(size.destacada);
    input.addEventListener('change', () => { syncButtons(); updateOrderTotal(); });
    const measure = document.createElement('strong');
    measure.textContent = size.medida;
    const detail = document.createElement('small');
    detail.textContent = size.nombre + ' · ' + formatPrice(size.precio);
    option.append(input, measure, detail);
    sizeOptions.append(option);
  });
  syncButtons();
  updateOrderTotal();
}).catch(() => {
  setOrderStatus('No pudimos cargar los tamaños. Recarga la página para intentarlo de nuevo.', 'error');
});

orderForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!hasGeneratedModel || orderBusy || orderSent) return;
  const name = orderName.value.trim();
  const email = orderEmail.value.trim();
  if (!name) { setOrderStatus('Escribe tu nombre para reservar.', 'error'); orderName.focus(); return; }
  if (!orderEmail.checkValidity() || !email) { setOrderStatus('Revisa tu correo: lo usaremos para confirmar el pedido.', 'error'); orderEmail.focus(); return; }
  const extras = selectedExtras();
  if (extras.base.conNombre && !extras.baseName) { setOrderStatus('Escribe el nombre que va en la base.', 'error'); baseNameInput.focus(); return; }
  orderBusy = true;
  syncButtons();
  setOrderStatus('Enviando tu reserva…');
  try {
    const response = await fetch('/api/order', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        taskId, size: selectedSize(), finish: selectedFinish(), name, email, notes: orderNotes.value.trim(),
        format: extras.formato.id, style: extras.estilo.id, base: extras.base.id, baseName: extras.baseName, quantity: extras.quantity
      })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'No se pudo registrar la reserva.');
    orderSent = true;
    orderSubmit.innerHTML = 'Reserva enviada <span>✓</span>';
    setOrderStatus('Reserva ' + result.code + ' recibida. Te escribiremos a ' + email + ' para confirmar el pago y el envío.', 'success');
    const trackLink = document.createElement('a');
    trackLink.href = 'ingresar.html?codigo=' + encodeURIComponent(result.code);
    trackLink.textContent = 'Sigue tu pedido aquí';
    orderStatus.append(' ', trackLink, '.');
  } catch (error) {
    setOrderStatus(error.message || 'No se pudo registrar la reserva.', 'error');
  } finally {
    orderBusy = false;
    syncButtons();
  }
});
