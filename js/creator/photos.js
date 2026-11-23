// Fotos de la mascota: subida libre (hasta cinco) o por ángulos (un recuadro por ángulo), y su preparación.
import { el } from '../dom.js';
import { MAX_PHOTOS, MAX_PHOTO_MB, MAX_PHOTO_BYTES, PHOTO_TYPES } from '../rules.js';
import { selectedFiles, state, showState, notifyChange } from './shared.js';

const imageInput = document.querySelector('#reference-images');
const uploadZone = document.querySelector('#upload-zone');
const fileList = document.querySelector('#file-list');
const moreAngles = document.querySelector('#more-angles');
const uploadModeBox = document.querySelector('#upload-mode');
const angleSlots = document.querySelector('#angle-slots');

// Subida por ángulos: cuatro recuadros (frente, costados y espalda), una foto en cada uno.
const ANGLE_SLOTS = [
  { label: 'Front', name: 'Frente', icon: '◉' },
  { label: 'Left', name: 'Costado izquierdo', icon: '◐' },
  { label: 'Right', name: 'Costado derecho', icon: '◑' },
  { label: 'Back', name: 'Espalda', icon: '○' }
];
let uploadMode = 'free';

// Las fotos se achican en el navegador antes de enviarlas: suben más rápido con datos móviles
// y quedan dentro de los límites de cualquier proveedor 3D (Hunyuan, por ejemplo, pide unos 6 MB por foto).
const PHOTO_MAX_SIDE = 2048;
const PHOTO_SEND_BYTES = 4 * 1024 * 1024;
const PHOTO_MIN_SIDE = 600;

// Fotos en el orden en que se envían: por ángulos, en el orden de los recuadros (frente, costados, espalda).
export function photosToSend() {
  if (uploadMode !== 'angles') return selectedFiles;
  const slotOrder = ANGLE_SLOTS.map((slot) => slot.label);
  return [...selectedFiles].sort((a, b) => slotOrder.indexOf(a.label) - slotOrder.indexOf(b.label));
}

function filesReadyMessage() {
  return selectedFiles.length === 1 ? 'Foto lista.' : selectedFiles.length + ' fotos listas.';
}
function removeFile(entry) {
  if (entry.previewUrl) URL.revokeObjectURL(entry.previewUrl);
  selectedFiles.splice(selectedFiles.indexOf(entry), 1);
  renderFiles();
  notifyChange();
  showState(
    selectedFiles.length ? filesReadyMessage() : 'Sube al menos una foto.',
    selectedFiles.length ? 'success' : ''
  );
}
async function preparePhoto(file) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    return { file, small: false };
  }
  const longest = Math.max(bitmap.width, bitmap.height);
  const small = longest < PHOTO_MIN_SIDE;
  if (file.type !== 'image/webp' && longest <= PHOTO_MAX_SIDE && file.size <= PHOTO_SEND_BYTES) {
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
    if (!PHOTO_TYPES.includes(file.type)) {
      showState('Solo se aceptan fotos JPG, PNG o WEBP.');
      continue;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      showState('Cada foto debe pesar ' + MAX_PHOTO_MB + ' MB o menos.');
      continue;
    }
    const key = file.name + ':' + file.size;
    if (
      selectedFiles.some((entry) => entry.sourceKey === key && entry.label !== slotLabel) ||
      accepted.some((item) => item.key === key)
    ) {
      if (slotLabel) showState('Esa foto ya está en otro ángulo.');
      continue;
    }
    if (!slotLabel && selectedFiles.length + state.preparingPhotos + accepted.length >= MAX_PHOTOS) {
      showState('Puedes subir hasta cinco fotos de la misma mascota.');
      break;
    }
    accepted.push({ file, key });
  }
  if (!accepted.length) {
    notifyChange();
    return;
  }
  state.preparingPhotos += accepted.length;
  showState(accepted.length === 1 ? 'Preparando la foto…' : 'Preparando ' + accepted.length + ' fotos…');
  notifyChange();
  const smallPhotos = [];
  for (const item of accepted) {
    const prepared = await preparePhoto(item.file);
    state.preparingPhotos -= 1;
    if (slotLabel) {
      const previous = selectedFiles.findIndex((entry) => entry.label === slotLabel);
      if (previous >= 0) selectedFiles.splice(previous, 1);
      selectedFiles.push({ file: prepared.file, sourceKey: item.key, label: slotLabel });
    } else {
      selectedFiles.push({
        file: prepared.file,
        sourceKey: item.key,
        label: selectedFiles.length === 0 ? 'Front' : '?'
      });
    }
    if (prepared.small) smallPhotos.push(item.file.name);
    renderFiles();
    notifyChange();
  }
  if (state.preparingPhotos) return;
  if (smallPhotos.length) {
    showState(
      (smallPhotos.length === 1 ? 'Una foto es muy pequeña' : smallPhotos.length + ' fotos son muy pequeñas') +
        ' (menos de ' +
        PHOTO_MIN_SIDE +
        ' px): la figura puede salir con menos detalle.'
    );
  } else {
    showState(filesReadyMessage(), 'success');
  }
}
// Vista previa de la foto (el enlace temporal se libera al volver a dibujar la lista).
function thumbnail(entry, alt) {
  entry.previewUrl = URL.createObjectURL(entry.file);
  return el('img', { src: entry.previewUrl, alt });
}
function renderFiles() {
  selectedFiles.forEach((entry) => {
    if (entry.previewUrl) URL.revokeObjectURL(entry.previewUrl);
  });
  if (uploadMode === 'angles') {
    renderAngleSlots();
    return;
  }
  fileList.replaceChildren();
  fileList.classList.toggle('single', selectedFiles.length < 2);
  moreAngles.hidden = selectedFiles.length === 0;
  moreAngles.classList.toggle('nudge', selectedFiles.length === 1);
  if (selectedFiles.length === 1)
    moreAngles.textContent =
      'Con una sola foto, el modelo inventa lo que no se ve. Si puedes, suma una de costado o donde se vea la cola.';
  else if (selectedFiles.length >= MAX_PHOTOS) moreAngles.textContent = 'Llegaste al máximo de cinco fotos.';
  else
    moreAngles.textContent = 'Para indicar desde dónde es cada foto, usa "Por ángulos": ayuda a armar bien el volumen.';
  selectedFiles.forEach((entry, index) => {
    const remove = el('button', { type: 'button', 'aria-label': 'Quitar foto ' + (index + 1) }, '×');
    remove.addEventListener('click', () => removeFile(entry));
    fileList.append(
      el('div', { className: 'file-thumb' }, thumbnail(entry, 'Foto seleccionada ' + (index + 1)), remove)
    );
  });
}
function renderAngleSlots() {
  angleSlots.replaceChildren();
  ANGLE_SLOTS.forEach((slot) => {
    const entry = selectedFiles.find((item) => item.label === slot.label);
    const box = el('label', {
      className: 'angle-slot' + (entry ? ' has-photo' : '') + (slot.label === 'Front' ? ' primary' : '')
    });
    const input = el('input', {
      type: 'file',
      accept: 'image/png,image/jpeg,image/webp',
      'aria-label': (entry ? 'Cambiar' : 'Subir') + ' la foto: ' + slot.name
    });
    input.addEventListener('change', () => {
      addFiles(Array.from(input.files), slot.label);
      input.value = '';
    });
    box.append(input);
    if (entry) {
      const remove = el('button', { type: 'button', 'aria-label': 'Quitar la foto: ' + slot.name }, '×');
      remove.addEventListener('click', (event) => {
        event.preventDefault();
        removeFile(entry);
      });
      box.append(thumbnail(entry, 'Foto: ' + slot.name), remove, el('span', { className: 'angle-name' }, slot.name));
    } else {
      box.append(
        el('span', { className: 'angle-icon', 'aria-hidden': 'true' }, slot.icon),
        el('strong', slot.name),
        el('small', slot.label === 'Front' ? 'La más importante' : 'Opcional')
      );
    }
    box.addEventListener('dragover', (event) => {
      event.preventDefault();
      box.classList.add('dragover');
    });
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
  moreAngles.textContent =
    count === 0
      ? 'Toca cada recuadro para subir la foto de ese ángulo. Con la de frente basta para empezar.'
      : count < 4
        ? 'Cada ángulo que sumes ayuda a que la figura salga más parecida, sobre todo la espalda si se ve la cola.'
        : 'Tienes los cuatro ángulos: es la mejor base para la figura.';
}
// Al pasar a ángulos, las fotos que ya estaban se reparten en los recuadros (primero las que ya tenían ese ángulo).
function setUploadMode(mode) {
  if (mode === uploadMode || state.preparingPhotos) return;
  uploadMode = mode;
  if (mode === 'angles') {
    const slotLabels = ANGLE_SLOTS.map((slot) => slot.label);
    const placed = new Set();
    selectedFiles.forEach((entry) => {
      if (slotLabels.includes(entry.label) && !placed.has(entry.label)) placed.add(entry.label);
      else entry.label = '';
    });
    selectedFiles.forEach((entry) => {
      if (entry.label) return;
      const free = slotLabels.find((label) => !placed.has(label));
      if (free) {
        entry.label = free;
        placed.add(free);
      }
    });
    const extra = selectedFiles.filter((entry) => !entry.label);
    extra.forEach((entry) => {
      if (entry.previewUrl) URL.revokeObjectURL(entry.previewUrl);
      selectedFiles.splice(selectedFiles.indexOf(entry), 1);
    });
    if (extra.length)
      showState(
        'Por ángulos caben cuatro fotos: quitamos ' +
          (extra.length === 1 ? 'una' : extra.length) +
          '. Revisa que cada una esté en su recuadro.'
      );
  }
  uploadModeBox
    .querySelectorAll('button')
    .forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.mode === mode)));
  angleSlots.hidden = mode !== 'angles';
  uploadZone.hidden = mode === 'angles';
  fileList.hidden = mode === 'angles';
  renderFiles();
  notifyChange();
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
uploadModeBox
  .querySelectorAll('button')
  .forEach((button) => button.addEventListener('click', () => setUploadMode(button.dataset.mode)));
