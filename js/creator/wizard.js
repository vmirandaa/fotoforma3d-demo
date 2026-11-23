// Creador por pasos en celular.
// En pantallas chicas el formulario se muestra en tres pantallas (fotos, su mascota, confirmar).
// No se mueven elementos: cada uno lleva su número de paso y el CSS oculta los de los otros pasos.
import { el } from '../dom.js';
import { form, selectedFiles, state, showState, stateIsSuccess, tailChoice, tailReady } from './shared.js';

const WIZARD_STEPS = [
  {
    title: 'Sus fotos',
    parts: [
      '.studio-form-heading',
      '.photo-checklist',
      '#upload-mode',
      '#angle-slots',
      '#upload-zone',
      '#file-list',
      '#more-angles'
    ]
  },
  { title: 'Su mascota', parts: ['#pet-name', '#pet-species', '.tail-field', '#pet-notes'] },
  {
    title: 'Confirmar',
    parts: ['.consent-row', '#generate-model', '#generate-hint', '#generation-progress', '.privacy-message']
  }
];
const wizardQuery = window.matchMedia('(max-width: 700px)');
const wizardHead = el('div', { className: 'wizard-head' });
const wizardBack = el('button', { type: 'button', className: 'wizard-back' }, 'Atrás');
const wizardNext = el('button', { type: 'button', className: 'button button-dark wizard-next' });
const wizardHint = el('p', { className: 'wizard-hint', role: 'status' });
const wizardNav = el('div', { className: 'wizard-nav' }, wizardBack, wizardNext, wizardHint);
let wizardStep = 1;

WIZARD_STEPS.forEach((step, index) => {
  step.parts.forEach((selector) => {
    const element = form.querySelector(selector);
    const block =
      element &&
      (element.closest('.field-block') && !element.matches('fieldset') ? element.closest('.field-block') : element);
    if (block) block.dataset.wizardStep = String(index + 1);
  });
});
form.prepend(wizardHead);
form.append(wizardNav);

function wizardBlocker(step) {
  if (step === 1) {
    if (state.preparingPhotos) return 'Espera a que se preparen las fotos.';
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
  if (!active) {
    delete form.dataset.wizardCurrent;
    return;
  }
  form.dataset.wizardCurrent = String(wizardStep);
  const dots = el('ol', { 'aria-hidden': 'true' });
  WIZARD_STEPS.forEach((step, index) => {
    const dotClass = index + 1 < wizardStep ? 'done' : index + 1 === wizardStep ? 'current' : '';
    dots.append(el('li', dotClass ? { className: dotClass } : {}));
  });
  wizardHead.replaceChildren(
    el('span', 'Parte ' + wizardStep + ' de ' + WIZARD_STEPS.length + ' del paso 1'),
    el('strong', WIZARD_STEPS[wizardStep - 1].title),
    dots
  );
  wizardBack.hidden = wizardStep === 1;
  wizardNext.hidden = wizardStep === WIZARD_STEPS.length;
  wizardNext.textContent =
    'Siguiente: ' + WIZARD_STEPS[Math.min(wizardStep, WIZARD_STEPS.length - 1)].title.toLowerCase();
  wizardHint.textContent = '';
  // Un aviso de éxito del paso anterior ("Foto lista.") ya no aporta al cambiar de paso.
  if (scroll && stateIsSuccess()) showState('');
  if (scroll) form.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

wizardNext.addEventListener('click', () => {
  const blocker = wizardBlocker(wizardStep);
  if (blocker) {
    wizardHint.textContent = blocker;
    return;
  }
  wizardStep = Math.min(wizardStep + 1, WIZARD_STEPS.length);
  renderWizard(true);
});
wizardBack.addEventListener('click', () => {
  if (state.generationBusy) return;
  wizardStep = Math.max(wizardStep - 1, 1);
  renderWizard(true);
});
wizardQuery.addEventListener('change', () => renderWizard(false));
renderWizard(false);
