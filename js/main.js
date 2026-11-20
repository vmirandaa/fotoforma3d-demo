const menuButton = document.querySelector('.menu-toggle');
const nav = document.querySelector('.nav');
const themeButton = document.querySelector('#theme-toggle');
const themeLabel = document.querySelector('#theme-label');

function setTheme(isDark, savePreference = false) {
  document.body.classList.toggle('theme-dark', isDark);
  // La barra del navegador en el celular toma el color de fondo del modo elegido.
  const themeColor = document.querySelector('meta[name="theme-color"]');
  if (themeColor) themeColor.content = isDark ? '#171b18' : '#f6f4ee';
  themeButton.setAttribute('aria-pressed', String(isDark));
  themeLabel.textContent = isDark ? 'Modo claro' : 'Modo oscuro';
  if (savePreference) {
    try { localStorage.setItem('forma-theme', isDark ? 'dark' : 'light'); } catch {}
  }
}

// Sin una elección guardada, el tema sigue al del dispositivo (y cambia con él); el botón fija una preferencia.
const deviceTheme = window.matchMedia('(prefers-color-scheme: dark)');
function savedTheme() {
  try {
    const saved = localStorage.getItem('forma-theme');
    return saved === 'dark' || saved === 'light' ? saved : null;
  } catch { return null; }
}
setTheme(savedTheme() ? savedTheme() === 'dark' : deviceTheme.matches);
deviceTheme.addEventListener('change', (event) => {
  if (!savedTheme()) setTheme(event.matches);
});
themeButton.addEventListener('click', () => {
  const nextIsDark = !document.body.classList.contains('theme-dark');
  if (document.startViewTransition) document.startViewTransition(() => setTheme(nextIsDark, true));
  else setTheme(nextIsDark, true);
});

// Catálogo de tallas y precios: una sola fuente (data/catalog.json) para la portada, el estudio y el servidor.
function formatPrice(value) { return '$' + Number(value).toLocaleString('es-CL'); }
const catalogPromise = fetch('data/catalog.json').then((response) => {
  if (!response.ok) throw new Error('catálogo no disponible');
  return response.json();
});
catalogPromise.catch(() => {});

const sizeGrid = document.querySelector('#size-grid');
if (sizeGrid) {
  catalogPromise.then((catalog) => {
    sizeGrid.replaceChildren();
    catalog.tallas.forEach((size) => {
      const card = document.createElement('article');
      card.className = 'size-card' + (size.destacada ? ' featured' : '');
      const name = document.createElement('span');
      name.className = 'size-name';
      name.textContent = size.nombre.toUpperCase();
      const measure = document.createElement('div');
      measure.className = 'size-measure';
      measure.textContent = size.medida;
      const text = document.createElement('p');
      text.textContent = size.descripcion;
      const price = document.createElement('div');
      price.className = 'size-price';
      price.textContent = formatPrice(size.precio);
      card.append(name, measure, text, price);
      if (Number(size.pintada) > 0) {
        const painted = document.createElement('span');
        painted.className = 'size-painted';
        painted.textContent = 'Pintada por el taller: +' + formatPrice(size.pintada);
        card.append(painted);
      }
      if (size.destacada) {
        const tag = document.createElement('span');
        tag.className = 'size-tag';
        tag.textContent = 'RECOMENDADA';
        card.append(tag);
      }
      sizeGrid.append(card);
    });
    const shipping = document.querySelector('#shipping-note');
    if (shipping) shipping.textContent = catalog.envio || '';
    buildSizeCompare(catalog.tallas);
  }).catch(() => {
    sizeGrid.innerHTML = '<p class="size-fallback">No pudimos cargar los precios. <a href="mailto:hola@forma3d.cl">Escríbenos</a> y te los enviamos.</p>';
  });
}

// Comparador de tamaños: las tallas dibujadas a escala junto a una taza y una regla en centímetros.
// La altura de cada figura sale de la medida del catálogo ("8 cm" → 8), así que se actualiza sola.
const MUG_CM = 9;
function buildSizeCompare(sizes) {
  const box = document.querySelector('#size-compare');
  const stage = document.querySelector('#compare-stage');
  if (!box || !stage) return;
  const svgNS = 'http://www.w3.org/2000/svg';
  const items = sizes
    .map((size) => ({ size, cm: parseFloat(String(size.medida).replace(',', '.')) }))
    .filter((item) => item.cm > 0);
  if (!items.length) return;
  const tallest = Math.max(MUG_CM, ...items.map((item) => item.cm));
  const rulerCm = Math.ceil(tallest) + 1;
  stage.style.setProperty('--max-cm', rulerCm);
  stage.replaceChildren();

  const ruler = document.createElement('div');
  ruler.className = 'compare-ruler';
  ruler.setAttribute('aria-hidden', 'true');
  for (let cm = 5; cm < rulerCm; cm += 5) {
    const mark = document.createElement('span');
    mark.style.setProperty('--at', cm);
    mark.textContent = cm;
    ruler.append(mark);
  }
  stage.append(ruler);

  const makeItem = (cm, label, detail, art, extraClass) => {
    const item = document.createElement('div');
    item.className = 'compare-item' + (extraClass ? ' ' + extraClass : '');
    item.style.setProperty('--h', cm);
    const caption = document.createElement('span');
    caption.className = 'compare-label';
    const strong = document.createElement('strong');
    strong.textContent = label;
    caption.append(strong, ' ' + detail);
    item.append(art, caption);
    stage.append(item);
  };
  items.forEach(({ size, cm }) => {
    const art = document.createElementNS(svgNS, 'svg');
    art.setAttribute('viewBox', '0 0 120 150');
    art.setAttribute('class', 'compare-art pet-figure');
    art.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS(svgNS, 'use');
    use.setAttribute('href', '#pet-shape');
    art.append(use);
    makeItem(cm, size.id, size.medida, art, size.destacada ? 'destacada' : '');
  });
  const mug = document.createElementNS(svgNS, 'svg');
  mug.setAttribute('viewBox', '0 0 112 100');
  mug.setAttribute('class', 'compare-art compare-mug');
  mug.setAttribute('aria-hidden', 'true');
  mug.innerHTML = '<path d="M84 26h8a16 16 0 0 1 0 32h-9" fill="none" stroke-width="7"/>'
    + '<path d="M4 2h80v76a20 20 0 0 1-20 20H24A20 20 0 0 1 4 78z"/>'
    + '<path class="mug-shine" d="M14 12v58" fill="none" stroke-width="5" stroke-linecap="round"/>';
  makeItem(MUG_CM, 'Taza', MUG_CM + ' cm', mug, 'referencia');
  stage.setAttribute('role', 'img');
  stage.setAttribute('aria-label', 'Comparación a escala: ' + items.map(({ size }) => 'talla ' + size.id + ' de ' + size.medida).join(', ') + ', junto a una taza de ' + MUG_CM + ' cm.');

  // En celular se compara una talla a la vez con la taza, para dibujarlas más grandes.
  // Los botones solo se muestran en pantallas chicas; en computador se ven todas juntas.
  const figures = [...stage.querySelectorAll('.compare-item:not(.referencia)')];
  const picker = document.createElement('div');
  picker.className = 'compare-picker';
  picker.setAttribute('role', 'group');
  picker.setAttribute('aria-label', 'Talla para comparar');
  const choose = (index) => {
    figures.forEach((figure, i) => figure.classList.toggle('elegida', i === index));
    [...picker.children].forEach((button, i) => button.setAttribute('aria-pressed', String(i === index)));
  };
  items.forEach(({ size }, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = size.id;
    button.setAttribute('aria-label', 'Talla ' + size.id + ', ' + size.medida);
    button.addEventListener('click', () => choose(index));
    picker.append(button);
  });
  box.querySelector('.compare-picker')?.remove();
  box.prepend(picker);
  choose(Math.max(0, items.findIndex(({ size }) => size.destacada)));
  box.hidden = false;
}

menuButton.addEventListener('click', () => {
  const expanded = nav.classList.toggle('open');
  menuButton.setAttribute('aria-expanded', String(expanded));
  menuButton.setAttribute('aria-label', expanded ? 'Cerrar menú' : 'Abrir menú');
});
nav.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => {
  nav.classList.remove('open');
  menuButton.setAttribute('aria-expanded', 'false');
}));

// Figura 3D de muestra en la portada. Si existe assets/models/sample-figure.glb se carga el visor y la figura
// reemplaza a la ilustración; si no existe, la portada queda con la ilustración tal como está.
const heroModelSlot = document.querySelector('#hero-model');
if (heroModelSlot) {
  const HERO_MODEL = 'assets/models/sample-figure.glb';
  const VIEWER_SCRIPT = 'https://ajax.googleapis.com/ajax/libs/model-viewer/4.4.0/model-viewer.min.js';
  const whiteFinish = (viewer) => {
    ((viewer.model && viewer.model.materials) || []).forEach((material) => {
      const pbr = material.pbrMetallicRoughness;
      if (pbr.baseColorTexture) pbr.baseColorTexture.setTexture(null);
      if (pbr.metallicRoughnessTexture) pbr.metallicRoughnessTexture.setTexture(null);
      pbr.setBaseColorFactor([0.88, 0.87, 0.83, 1]);
      pbr.setMetallicFactor(0);
      pbr.setRoughnessFactor(0.82);
    });
  };
  fetch(HERO_MODEL, { method: 'HEAD' }).then((response) => {
    if (!response.ok) return;
    const script = document.createElement('script');
    script.type = 'module';
    script.src = VIEWER_SCRIPT;
    document.head.append(script);
    const viewer = document.createElement('model-viewer');
    viewer.setAttribute('src', HERO_MODEL);
    viewer.setAttribute('alt', 'Figura 3D de muestra, en blanco como se imprime');
    viewer.setAttribute('loading', 'eager');
    viewer.setAttribute('camera-controls', '');
    viewer.setAttribute('disable-zoom', '');
    viewer.setAttribute('disable-pan', '');
    viewer.setAttribute('touch-action', 'pan-y');
    viewer.setAttribute('interaction-prompt', 'none');
    viewer.setAttribute('shadow-intensity', '1');
    viewer.setAttribute('environment-image', 'neutral');
    viewer.setAttribute('exposure', '0.9');
    viewer.setAttribute('shadow-softness', '0.6');
    viewer.setAttribute('field-of-view', '24deg');
    viewer.setAttribute('camera-orbit', '25deg 78deg auto');
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      viewer.setAttribute('auto-rotate', '');
      viewer.setAttribute('rotation-per-second', '18deg');
    }
    viewer.addEventListener('load', () => {
      whiteFinish(viewer);
      document.querySelector('.hero-visual').classList.add('con-figura');
      const caption = document.querySelector('#hero-caption');
      if (caption) caption.innerHTML = 'Figura de muestra hecha con IA,<br>en blanco como llega. Arrástrala para girarla.';
    }, { once: true });
    heroModelSlot.append(viewer);
  }).catch(() => {});
}

// Entrada suave de las secciones de la portada al bajar por la página.
// Se revisa al desplazarse: aparece todo lo que ya está en pantalla o quedó más arriba,
// así nada queda oculto si se salta con un enlace del menú. No se activa si se pide reducir el movimiento.
const revealEnabled = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const revealPending = new Set();
let revealQueued = false;
function revealVisible() {
  revealQueued = false;
  const limit = window.innerHeight * 0.92;
  revealPending.forEach((element) => {
    if (element.getBoundingClientRect().top < limit) {
      element.classList.add('visible');
      revealPending.delete(element);
    }
  });
  if (!revealPending.size) window.removeEventListener('scroll', queueReveal);
}
function queueReveal() {
  if (revealQueued) return;
  revealQueued = true;
  window.setTimeout(revealVisible, 60);
}
function revealOnScroll(elements) {
  if (!revealEnabled) return;
  const groups = new Map();
  elements.forEach((element) => {
    // Las tarjetas de una misma fila entran una tras otra.
    const siblings = groups.get(element.parentElement) || 0;
    groups.set(element.parentElement, siblings + 1);
    element.style.setProperty('--reveal-delay', Math.min(siblings, 4) * 80 + 'ms');
    element.classList.add('revelar');
    revealPending.add(element);
  });
  window.addEventListener('scroll', queueReveal, { passive: true });
  queueReveal();
}
if (document.querySelector('.how-section')) {
  revealOnScroll(document.querySelectorAll('.how-heading, .how-steps article, #la-foto .section-intro, .tip-grid .offer, #precios .section-intro, .faq-intro, .faq-list details'));
  catalogPromise.then(() => revealOnScroll(document.querySelectorAll('.size-card, .size-compare'))).catch(() => {});
}

// Botón fijo "Crear mi figura" en celular: se muestra una vez que el botón de la portada quedó atrás
// y se esconde cuando hay otro botón para crear la figura a la vista (precios) o al llegar al pie.
const stickyCta = document.querySelector('#cta-fija');
if (stickyCta) {
  const stickyQuery = window.matchMedia('(max-width: 700px)');
  const heroCta = document.querySelector('.hero-actions');
  const otherCtas = [document.querySelector('.price-cta'), document.querySelector('.footer')].filter(Boolean);
  const stickyLink = stickyCta.querySelector('a');
  let stickyQueued = false;
  const onScreen = (element) => {
    const box = element.getBoundingClientRect();
    return box.bottom > 0 && box.top < window.innerHeight;
  };
  const updateSticky = () => {
    stickyQueued = false;
    const show = stickyQuery.matches && heroCta && heroCta.getBoundingClientRect().bottom < 0 && !otherCtas.some(onScreen);
    stickyCta.classList.toggle('visible', show);
    stickyCta.setAttribute('aria-hidden', String(!show));
    stickyLink.tabIndex = show ? 0 : -1;
  };
  const queueSticky = () => {
    if (stickyQueued) return;
    stickyQueued = true;
    window.setTimeout(updateSticky, 60);
  };
  window.addEventListener('scroll', queueSticky, { passive: true });
  window.addEventListener('resize', queueSticky);
  stickyQuery.addEventListener('change', queueSticky);
  updateSticky();
}

