// Foto: camera para o celular, sem build e sem dependencias.
//
// Qualidade da foto: onde o navegador oferece a ImageCapture API (Chrome no
// Android), a foto sai do sensor pelo takePhoto(), na resolucao maxima que a
// camera informa, e nao do quadro de video. Onde nao ha (Safari no iPhone,
// Firefox), o video e pedido na maior resolucao possivel e o quadro e copiado
// para um canvas sem reduzir, com JPEG de qualidade 0,95.

const $ = (id) => document.getElementById(id);

const video = $('video');
const viewfinder = $('viewfinder');
const shutter = $('shutter');
const switchBtn = $('switchBtn');
const flashBtn = $('flashBtn');
const flashBadge = $('flashBadge');
const timerBtn = $('timerBtn');
const timerBadge = $('timerBadge');
const gridBtn = $('gridBtn');
const grid = $('grid');
const zoomBox = $('zoomBox');
const zoomInput = $('zoom');
const zoomValue = $('zoomValue');
const focusRing = $('focus');
const flashOverlay = $('flashOverlay');
const countdownEl = $('countdown');
const resolutionEl = $('resolution');
const message = $('message');
const messageText = $('messageText');
const thumb = $('thumb');

const gallery = $('gallery');
const galleryGrid = $('galleryGrid');
const galleryEmpty = $('galleryEmpty');
const galleryCount = $('galleryCount');
const viewer = $('viewer');
const viewerImg = $('viewerImg');
const viewerInfo = $('viewerInfo');

const TIMERS = [0, 3, 10];
const JPEG_QUALITY = 0.95;
const THUMB_SIZE = 320;

const prefs = loadPrefs();

const state = {
  stream: null,
  track: null,
  imageCapture: null,
  photoCaps: null,
  caps: {},
  facing: prefs.facing,
  /** Modos de flash que a camera atual aceita: 'off' | 'auto' | 'on'. */
  flashModes: ['off'],
  flash: 'off',
  /** 'fill' = flash de verdade via takePhoto; 'torch' = lanterna ligada na hora. */
  flashKind: null,
  timer: prefs.timer,
  busy: false,
  starting: null,
};

// --- Preferencias ------------------------------------------------------------

function loadPrefs() {
  const fallback = { facing: 'environment', timer: 0, grid: false, flash: 'off' };
  try {
    return { ...fallback, ...JSON.parse(localStorage.getItem('foto:prefs') || '{}') };
  } catch {
    return fallback;
  }
}

function savePrefs() {
  try {
    localStorage.setItem(
      'foto:prefs',
      JSON.stringify({
        facing: state.facing,
        timer: state.timer,
        grid: !grid.hidden,
        flash: state.flash,
      }),
    );
  } catch {
    // Sem armazenamento (aba anonima): as preferencias so valem nesta sessao.
  }
}

// --- Aviso rapido ------------------------------------------------------------

let toastTimer = 0;
function toast(text) {
  const el = $('toast');
  el.textContent = text;
  el.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('is-visible'), 2200);
}

// --- Camera ------------------------------------------------------------------

function stopCamera() {
  state.stream?.getTracks().forEach((track) => track.stop());
  state.stream = null;
  state.track = null;
  state.imageCapture = null;
  state.photoCaps = null;
  video.srcObject = null;
  shutter.disabled = true;
}

function showMessage(text) {
  messageText.textContent = text;
  message.hidden = false;
}

function explainError(error) {
  if (!window.isSecureContext) {
    return 'A camera so funciona em endereco seguro (https). Abra o app por https ou pelo localhost.';
  }
  switch (error?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'O acesso a camera foi negado. Libere a camera para este site nas configuracoes do navegador e tente de novo.';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'Nenhuma camera encontrada neste aparelho.';
    case 'NotReadableError':
    case 'AbortError':
      return 'A camera esta sendo usada por outro app. Feche-o e tente de novo.';
    default:
      return 'Nao foi possivel abrir a camera.';
  }
}

async function startCamera() {
  // Evita duas aberturas simultaneas (troca de camera + volta para a aba).
  if (state.starting) return state.starting;
  state.starting = openCamera().finally(() => {
    state.starting = null;
  });
  return state.starting;
}

async function openCamera() {
  stopCamera();
  message.hidden = true;

  if (!navigator.mediaDevices?.getUserMedia) {
    showMessage(explainError());
    return;
  }

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: state.facing },
        // Pede o maximo; o navegador entrega a maior resolucao que a camera tem.
        width: { ideal: 4096 },
        height: { ideal: 4096 },
      },
    });
  } catch (error) {
    showMessage(explainError(error));
    return;
  }

  // A pagina pode ter ido para segundo plano enquanto a permissao era pedida.
  if (document.hidden || !gallery.hidden || !viewer.hidden) {
    stream.getTracks().forEach((track) => track.stop());
    return;
  }

  state.stream = stream;
  state.track = stream.getVideoTracks()[0];
  state.caps = state.track.getCapabilities?.() ?? {};
  video.srcObject = stream;

  try {
    await video.play();
  } catch {
    // Alguns navegadores rejeitam o play() mesmo com autoplay; o video segue.
  }

  const settings = state.track.getSettings?.() ?? {};
  const facing = settings.facingMode || state.facing;
  video.classList.toggle('is-mirrored', facing === 'user');

  if ('ImageCapture' in window) {
    try {
      state.imageCapture = new ImageCapture(state.track);
      state.photoCaps = await state.imageCapture.getPhotoCapabilities();
    } catch {
      state.imageCapture = null;
      state.photoCaps = null;
    }
  }

  setupZoom();
  setupFlash();
  showResolution();
  await updateSwitchButton();
  shutter.disabled = false;
}

function photoSize() {
  const caps = state.photoCaps;
  if (caps?.imageWidth?.max && caps?.imageHeight?.max) {
    return { width: caps.imageWidth.max, height: caps.imageHeight.max };
  }
  return { width: video.videoWidth, height: video.videoHeight };
}

function showResolution() {
  const { width, height } = photoSize();
  if (!width || !height) {
    // O tamanho do video so aparece depois do primeiro quadro.
    video.addEventListener('loadedmetadata', showResolution, { once: true });
    resolutionEl.textContent = '';
    return;
  }
  const mp = (width * height) / 1e6;
  resolutionEl.textContent = `${mp >= 10 ? Math.round(mp) : mp.toFixed(1)} MP`;
}

async function updateSwitchButton() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cameras = devices.filter((device) => device.kind === 'videoinput');
    switchBtn.hidden = cameras.length < 2;
  } catch {
    switchBtn.hidden = false;
  }
}

async function switchCamera() {
  state.facing = state.facing === 'user' ? 'environment' : 'user';
  savePrefs();
  await startCamera();
}

// --- Zoom --------------------------------------------------------------------

function setupZoom() {
  const zoom = state.caps.zoom;
  if (!zoom || zoom.max <= zoom.min) {
    zoomBox.hidden = true;
    return;
  }
  zoomInput.min = String(zoom.min);
  zoomInput.max = String(zoom.max);
  zoomInput.step = String(zoom.step || 0.1);
  const current = state.track.getSettings().zoom ?? zoom.min;
  zoomInput.value = String(current);
  zoomValue.textContent = `${Number(current).toFixed(1)}x`;
  zoomBox.hidden = false;
}

let zoomPending = null;
function applyZoom(value) {
  const zoom = state.caps.zoom;
  if (!zoom || !state.track) return;
  const clamped = Math.min(zoom.max, Math.max(zoom.min, value));
  zoomInput.value = String(clamped);
  zoomValue.textContent = `${clamped.toFixed(1)}x`;
  // Um applyConstraints por quadro basta; mais que isso trava em alguns aparelhos.
  if (zoomPending !== null) {
    zoomPending = clamped;
    return;
  }
  zoomPending = clamped;
  requestAnimationFrame(() => {
    const target = zoomPending;
    zoomPending = null;
    state.track?.applyConstraints({ advanced: [{ zoom: target }] }).catch(() => {});
  });
}

zoomInput.addEventListener('input', () => applyZoom(Number(zoomInput.value)));

// --- Flash -------------------------------------------------------------------

const FLASH_LABELS = { off: 'Flash desligado', auto: 'Flash automatico', on: 'Flash ligado' };

function setupFlash() {
  const fill = state.photoCaps?.fillLightMode ?? [];
  if (fill.includes('flash')) {
    state.flashKind = 'fill';
    state.flashModes = ['off', ...(fill.includes('auto') ? ['auto'] : []), 'on'];
  } else if (state.caps.torch) {
    state.flashKind = 'torch';
    state.flashModes = ['off', 'on'];
  } else {
    state.flashKind = null;
    state.flashModes = ['off'];
  }
  state.flash = state.flashModes.includes(prefs.flash) ? prefs.flash : 'off';
  flashBtn.hidden = state.flashKind === null;
  renderFlash();
}

function renderFlash() {
  flashBadge.textContent = state.flash;
  flashBtn.classList.toggle('is-on', state.flash !== 'off');
  flashBtn.setAttribute('aria-label', FLASH_LABELS[state.flash]);
}

flashBtn.addEventListener('click', () => {
  const index = state.flashModes.indexOf(state.flash);
  state.flash = state.flashModes[(index + 1) % state.flashModes.length];
  prefs.flash = state.flash;
  savePrefs();
  renderFlash();
  toast(FLASH_LABELS[state.flash]);
});

async function setTorch(on) {
  try {
    await state.track?.applyConstraints({ advanced: [{ torch: on }] });
  } catch {
    // Lanterna indisponivel neste momento; a foto sai sem ela.
  }
}

// --- Temporizador e grade ----------------------------------------------------

function renderTimer() {
  timerBadge.textContent = state.timer ? `${state.timer}s` : 'off';
  timerBtn.classList.toggle('is-on', state.timer > 0);
  timerBtn.setAttribute(
    'aria-label',
    state.timer ? `Temporizador de ${state.timer} segundos` : 'Temporizador desligado',
  );
}

timerBtn.addEventListener('click', () => {
  state.timer = TIMERS[(TIMERS.indexOf(state.timer) + 1) % TIMERS.length];
  savePrefs();
  renderTimer();
  toast(state.timer ? `Temporizador: ${state.timer} s` : 'Temporizador desligado');
});

gridBtn.addEventListener('click', () => {
  grid.hidden = !grid.hidden;
  gridBtn.setAttribute('aria-pressed', String(!grid.hidden));
  savePrefs();
});

// --- Foco por toque e pinca para zoom ---------------------------------------

/** Converte um toque na tela para a posicao (0..1) no quadro da camera. */
function toFramePoint(clientX, clientY) {
  const rect = video.getBoundingClientRect();
  const vw = video.videoWidth || rect.width;
  const vh = video.videoHeight || rect.height;
  // O video usa object-fit: cover, entao parte do quadro fica fora da tela.
  const scale = Math.max(rect.width / vw, rect.height / vh);
  const shownW = vw * scale;
  const shownH = vh * scale;
  let x = (clientX - rect.left - (rect.width - shownW) / 2) / shownW;
  const y = (clientY - rect.top - (rect.height - shownH) / 2) / shownH;
  if (video.classList.contains('is-mirrored')) x = 1 - x;
  return { x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) };
}

let focusTimer = 0;
async function focusAt(clientX, clientY) {
  const rect = viewfinder.getBoundingClientRect();
  focusRing.style.left = `${clientX - rect.left}px`;
  focusRing.style.top = `${clientY - rect.top}px`;
  focusRing.classList.remove('is-visible');
  void focusRing.offsetWidth;
  focusRing.classList.add('is-visible');
  clearTimeout(focusTimer);
  focusTimer = setTimeout(() => focusRing.classList.remove('is-visible'), 1200);

  const caps = state.caps;
  if (!state.track || !('pointsOfInterest' in caps || caps.focusMode)) return;
  const point = toFramePoint(clientX, clientY);
  const advanced = { pointsOfInterest: [point] };
  if (caps.focusMode?.includes('single-shot')) advanced.focusMode = 'single-shot';
  else if (caps.focusMode?.includes('continuous')) advanced.focusMode = 'continuous';
  if (caps.exposureMode?.includes('continuous')) advanced.exposureMode = 'continuous';
  try {
    await state.track.applyConstraints({ advanced: [advanced] });
  } catch {
    // Camera sem foco por ponto: o anel aparece, a camera segue no automatico.
  }
}

const pointers = new Map();
let pinch = null;

viewfinder.addEventListener('pointerdown', (event) => {
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, t: Date.now() });
  if (pointers.size === 2 && state.caps.zoom) {
    const [a, b] = [...pointers.values()];
    pinch = { distance: Math.hypot(a.x - b.x, a.y - b.y), zoom: Number(zoomInput.value) };
  }
});

viewfinder.addEventListener('pointermove', (event) => {
  if (!pointers.has(event.pointerId)) return;
  pointers.set(event.pointerId, { ...pointers.get(event.pointerId), x: event.clientX, y: event.clientY });
  if (pinch && pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    const distance = Math.hypot(a.x - b.x, a.y - b.y);
    applyZoom(pinch.zoom * (distance / pinch.distance));
  }
});

function endPointer(event) {
  const start = pointers.get(event.pointerId);
  pointers.delete(event.pointerId);
  if (pinch) {
    if (pointers.size === 0) pinch = null;
    return;
  }
  // Toque curto e parado = focar ali.
  if (
    start &&
    message.hidden &&
    event.type === 'pointerup' &&
    Date.now() - start.t < 400 &&
    Math.hypot(event.clientX - start.x, event.clientY - start.y) < 12 &&
    !event.target.closest('button, input, label')
  ) {
    void focusAt(event.clientX, event.clientY);
  }
}

viewfinder.addEventListener('pointerup', endPointer);
viewfinder.addEventListener('pointercancel', endPointer);

// --- Captura -----------------------------------------------------------------

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runCountdown(seconds) {
  for (let left = seconds; left > 0; left -= 1) {
    countdownEl.textContent = String(left);
    await wait(1000);
    if (!state.track) break;
  }
  countdownEl.textContent = '';
}

async function grabFromSensor() {
  const { width, height } = photoSize();
  const settings = { imageWidth: width, imageHeight: height };
  if (state.flashKind === 'fill') settings.fillLightMode = state.flash === 'on' ? 'flash' : state.flash;
  return state.imageCapture.takePhoto(settings);
}

function grabFromVideo() {
  const width = video.videoWidth;
  const height = video.videoHeight;
  if (!width || !height) throw new Error('Sem imagem da camera ainda.');
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  context.imageSmoothingEnabled = false;
  context.drawImage(video, 0, 0, width, height);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Falha ao gerar a imagem.'))),
      'image/jpeg',
      JPEG_QUALITY,
    );
  });
}

async function takePhoto() {
  if (state.busy || !state.track) return;
  state.busy = true;
  shutter.classList.add('is-busy');

  try {
    if (state.timer) await runCountdown(state.timer);
    if (!state.track) return;

    const torch = state.flashKind === 'torch' && state.flash === 'on';
    if (torch) {
      await setTorch(true);
      // Tempo para a exposicao se ajustar a luz.
      await wait(450);
    }

    let blob;
    try {
      blob = state.imageCapture ? await grabFromSensor() : await grabFromVideo();
    } catch {
      // takePhoto falha em alguns aparelhos; o quadro do video ainda serve.
      blob = await grabFromVideo();
    } finally {
      if (torch) void setTorch(false);
    }

    flashOverlay.classList.remove('is-firing');
    void flashOverlay.offsetWidth;
    flashOverlay.classList.add('is-firing');
    navigator.vibrate?.(30);

    const photo = await savePhoto(blob);
    setThumb(photo);
  } catch (error) {
    console.error(error);
    toast('Nao foi possivel tirar a foto.');
  } finally {
    state.busy = false;
    shutter.classList.remove('is-busy');
  }
}

shutter.addEventListener('click', () => void takePhoto());
switchBtn.addEventListener('click', () => void switchCamera());
$('retry').addEventListener('click', () => void startCamera());

// Sem acesso a camera pelo navegador, a camera do proprio sistema ainda serve.
$('systemCamera').addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;
  const photo = await savePhoto(file);
  setThumb(photo);
  toast('Foto guardada.');
});

document.addEventListener('keydown', (event) => {
  if (!gallery.hidden || !viewer.hidden) {
    if (event.key === 'Escape') (viewer.hidden ? closeGallery : closeViewer)();
    return;
  }
  if (event.key === ' ' || event.key === 'Enter' || event.key === 'AudioVolumeUp') {
    event.preventDefault();
    void takePhoto();
  }
});

// --- Armazenamento (IndexedDB) ------------------------------------------------

let dbPromise = null;
function db() {
  dbPromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open('foto', 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('photos', { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

async function tx(mode, run) {
  const database = await db();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction('photos', mode);
    const result = run(transaction.objectStore('photos'));
    transaction.oncomplete = () => resolve(result?.result ?? result);
    transaction.onerror = () => reject(transaction.error);
  });
}

async function makeThumb(blob) {
  const bitmap = await createImageBitmap(blob);
  const { width, height } = bitmap;
  const scale = THUMB_SIZE / Math.min(width, height);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  const small = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.8));
  return { thumb: small, width, height };
}

let askedPersist = false;
async function savePhoto(blob) {
  let meta = { thumb: blob, width: 0, height: 0 };
  try {
    meta = await makeThumb(blob);
  } catch {
    // Formato que o navegador nao decodifica (HEIC em alguns casos): usa o original.
  }
  const createdAt = Date.now();
  const photo = {
    id: `${createdAt}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt,
    blob,
    type: blob.type || 'image/jpeg',
    ...meta,
  };
  await tx('readwrite', (store) => store.put(photo));

  // Pede que o navegador nao apague as fotos quando o espaco apertar.
  if (!askedPersist) {
    askedPersist = true;
    navigator.storage?.persist?.().catch(() => {});
  }
  return photo;
}

async function allPhotos() {
  const photos = await tx('readonly', (store) => store.getAll());
  return photos.sort((a, b) => b.createdAt - a.createdAt);
}

async function deletePhoto(id) {
  await tx('readwrite', (store) => store.delete(id));
}

// --- Miniatura e galeria -----------------------------------------------------

let thumbUrl = '';
function setThumb(photo) {
  if (thumbUrl) URL.revokeObjectURL(thumbUrl);
  thumbUrl = photo ? URL.createObjectURL(photo.thumb) : '';
  thumb.src = thumbUrl;
  thumb.hidden = !photo;
}

let galleryUrls = [];
let galleryPhotos = [];

function releaseGalleryUrls() {
  galleryUrls.forEach((url) => URL.revokeObjectURL(url));
  galleryUrls = [];
}

async function renderGallery() {
  releaseGalleryUrls();
  galleryPhotos = await allPhotos();
  galleryGrid.replaceChildren(
    ...galleryPhotos.map((photo, index) => {
      const url = URL.createObjectURL(photo.thumb);
      galleryUrls.push(url);
      const item = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('aria-label', `Foto de ${formatDate(photo.createdAt)}`);
      const img = document.createElement('img');
      img.src = url;
      img.alt = '';
      img.loading = 'lazy';
      button.append(img);
      button.addEventListener('click', () => openViewer(index));
      item.append(button);
      return item;
    }),
  );
  galleryEmpty.hidden = galleryPhotos.length > 0;
  galleryCount.textContent = galleryPhotos.length
    ? `${galleryPhotos.length} foto${galleryPhotos.length > 1 ? 's' : ''}`
    : '';
  setThumb(galleryPhotos[0] ?? null);
}

async function openGallery() {
  stopCamera();
  gallery.hidden = false;
  await renderGallery();
}

function closeGallery() {
  gallery.hidden = true;
  releaseGalleryUrls();
  void startCamera();
}

$('galleryBtn').addEventListener('click', () => void openGallery());
$('galleryClose').addEventListener('click', closeGallery);

// --- Visualizador --------------------------------------------------------------

let viewerUrl = '';
let viewerPhoto = null;

function formatDate(time) {
  return new Date(time).toLocaleString('pt-BR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function fileName(photo) {
  const date = new Date(photo.createdAt);
  const pad = (n) => String(n).padStart(2, '0');
  const ext = photo.type.includes('png') ? 'png' : photo.type.includes('heic') ? 'heic' : 'jpg';
  return `IMG_${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(
    date.getHours(),
  )}${pad(date.getMinutes())}${pad(date.getSeconds())}.${ext}`;
}

function openViewer(index) {
  viewerPhoto = galleryPhotos[index];
  if (!viewerPhoto) return;
  if (viewerUrl) URL.revokeObjectURL(viewerUrl);
  viewerUrl = URL.createObjectURL(viewerPhoto.blob);
  viewerImg.src = viewerUrl;
  const size = viewerPhoto.width
    ? ` · ${viewerPhoto.width}×${viewerPhoto.height}`
    : '';
  const kb = viewerPhoto.blob.size / 1024;
  const weight = kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(kb))} KB`;
  viewerInfo.textContent = `${formatDate(viewerPhoto.createdAt)}${size} · ${weight}`;
  viewer.hidden = false;
}

function closeViewer() {
  viewer.hidden = true;
  viewerImg.removeAttribute('src');
  if (viewerUrl) URL.revokeObjectURL(viewerUrl);
  viewerUrl = '';
  viewerPhoto = null;
}

$('viewerClose').addEventListener('click', closeViewer);

$('saveBtn').addEventListener('click', () => {
  if (!viewerPhoto) return;
  const link = document.createElement('a');
  link.href = viewerUrl;
  link.download = fileName(viewerPhoto);
  document.body.append(link);
  link.click();
  link.remove();
});

$('shareBtn').addEventListener('click', async () => {
  if (!viewerPhoto) return;
  const file = new File([viewerPhoto.blob], fileName(viewerPhoto), { type: viewerPhoto.type });
  if (!navigator.canShare?.({ files: [file] })) {
    toast('Este navegador nao compartilha arquivos. Use "Salvar no aparelho".');
    return;
  }
  try {
    await navigator.share({ files: [file] });
  } catch (error) {
    if (error?.name !== 'AbortError') toast('Nao foi possivel compartilhar.');
  }
});

$('deleteBtn').addEventListener('click', async () => {
  if (!viewerPhoto || !confirm('Apagar esta foto? Nao da para desfazer.')) return;
  await deletePhoto(viewerPhoto.id);
  closeViewer();
  await renderGallery();
  toast('Foto apagada.');
});

// --- Ciclo de vida -------------------------------------------------------------

// A camera fica desligada em segundo plano: libera o sensor e a bateria.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) stopCamera();
  else if (gallery.hidden && viewer.hidden) void startCamera();
});

if ('serviceWorker' in navigator && window.isSecureContext) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

grid.hidden = !prefs.grid;
gridBtn.setAttribute('aria-pressed', String(prefs.grid));
renderTimer();
allPhotos()
  .then((photos) => setThumb(photos[0] ?? null))
  .catch(() => {});
void startCamera();
