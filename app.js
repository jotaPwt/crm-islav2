// ═══════════════════════════════════════════════════════════════
//  isla.to — Founder CRM  |  app.js
// ═══════════════════════════════════════════════════════════════

// ─── CONFIG ──────────────────────────────────────────────────────────────────
const STEPS = [
  { id: 'added',    label: 'Adicionado',    color: '#5b6af0' },
  { id: 'connect',  label: 'Conectando',    color: '#8b5cf6' },
  { id: 'engage',   label: 'Engajando',     color: '#06b6d4' },
  { id: 'message',  label: 'Msg Enviada',   color: '#f59e0b' },
  { id: 'followup', label: 'Follow Up',     color: '#f97316' },
  { id: 'call',     label: 'Agend. Call',   color: '#22c55e' },
];

const LINKEDIN_API_URL  = 'https://apidolinkedin.com/v1/linkedin/profile';
const LINKEDIN_MOCK_URL = 'https://www.linkedin.com/in/jo%C3%A3owiltenburg/';

const CATEGORY_CLASS = {
  Investidor:           'cat-investidor',
  Cliente:              'cat-cliente',
  'Indicação':          'cat-indicacao',
  'LinkedIn Outreach':  'cat-outreach',
  'LinkedIn Inbound':   'cat-inbound',
  Evento:               'cat-evento',
  Outro:                'cat-outro',
};

// ─── STATE ───────────────────────────────────────────────────────────────────
let contacts            = JSON.parse(localStorage.getItem('isla-crm-contacts') || '[]');
let dragCard            = null;
let linkedinFetchTimer  = null;
let pendingLinkedinData = null;
let confirmCallback     = null;
let searchQuery         = '';
let currentNoteContactId = null;
let dailyGoal           = parseInt(localStorage.getItem('isla-crm-daily-goal') || '50', 10);

// ─── SAVE ─────────────────────────────────────────────────────────────────────
function save() {
  localStorage.setItem('isla-crm-contacts', JSON.stringify(contacts));
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function escapeHtml(str) {
  if (str == null || str === '') return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getCategoryClass(label) {
  if (!label) return 'cat-outro';
  return CATEGORY_CLASS[label] || 'cat-outro';
}

function getInitials(name, max = 2) {
  if (!name) return '?';
  return name.trim().split(/\s+/).slice(0, max).map(w => w[0].toUpperCase()).join('');
}

function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

function formatDateFull(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function daysAgo(iso) {
  if (!iso) return 0;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

function timeAgo(iso) {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return 'agora';
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `há ${Math.max(1, mins)}min`;
  const hours = Math.floor(ms / 3600000);
  if (hours < 24) return `há ${hours}h`;
  const days = Math.floor(ms / 86400000);
  if (days < 30) return days === 1 ? 'há 1 dia' : `há ${days} dias`;
  const months = Math.floor(days / 30);
  return months === 1 ? 'há 1 mês' : `há ${months} meses`;
}

function staleLabel(days) {
  if (days < 7) return null;
  const weeks = Math.floor(days / 7);
  return weeks === 1 ? '1 sem. nesta etapa' : `${weeks} sem. nesta etapa`;
}

function isColdLead(contact) {
  const ref = contact.lastMovedAt || contact.stepEnteredAt || contact.addedAt;
  return daysAgo(ref) > 3;
}

function highlight(text, query) {
  if (!query || !text) return text || '';
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.replace(new RegExp(escaped, 'gi'), m => `<mark>${m}</mark>`);
}

function matchesSearch(contact, q) {
  if (!q) return true;
  const lq = q.toLowerCase();
  return (
    (contact.name     || '').toLowerCase().includes(lq) ||
    (contact.company  || '').toLowerCase().includes(lq) ||
    (contact.role     || '').toLowerCase().includes(lq) ||
    (contact.category || '').toLowerCase().includes(lq)
  );
}

// ─── BOARD ───────────────────────────────────────────────────────────────────
function buildBoard() {
  const board = document.getElementById('board');
  board.innerHTML = '';
  STEPS.forEach((step, si) => {
    const col = document.createElement('div');
    col.className = 'column';
    col.dataset.step = si;

    const stepContacts = contacts
      .filter(c => c.step === si)
      .sort((a, b) => new Date(a.stepEnteredAt || a.addedAt) - new Date(b.stepEnteredAt || b.addedAt));

    const heatClass =
      stepContacts.length >= 10 ? 'heat-3' :
      stepContacts.length >= 6  ? 'heat-2' :
      stepContacts.length >= 3  ? 'heat-1' : '';

    col.innerHTML = `
      <div class="col-header ${heatClass}">
        <div class="col-title">
          <div class="col-dot" style="background:${step.color}"></div>
          ${step.label}
        </div>
        <div class="col-count">${stepContacts.length}</div>
      </div>
      <div class="cards-zone" id="zone-${si}" data-step="${si}"
        ondragover="onDragOver(event)"
        ondragenter="onDragEnter(event)"
        ondragleave="onDragLeave(event)"
        ondrop="onDrop(event)">
      </div>
    `;
    board.appendChild(col);
    const zone = col.querySelector('.cards-zone');
    if (stepContacts.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty-drop';
      empty.textContent = 'Arraste um card aqui';
      zone.appendChild(empty);
    } else {
      stepContacts.forEach(contact => zone.appendChild(buildCard(contact, step.color)));
    }
  });
  applySearch();
  updateStats();
}

function buildCard(contact, color) {
  const card = document.createElement('div');
  card.className = 'card';
  card.draggable = true;
  card.dataset.id = contact.id;
  card.style.setProperty('--step-color', color);

  const initials       = getInitials(contact.name);
  const avatarHtml     = contact.avatar
    ? `<img src="${contact.avatar}" alt="${escapeHtml(contact.name)}" onerror="this.parentNode.innerHTML='${initials}'">`
    : initials;

  const companyLogoHtml = contact.companyLogo
    ? `<img src="${contact.companyLogo}" alt="${escapeHtml(contact.company)}" onerror="this.remove()">`
    : getInitials(contact.company || '?', 1);

  const addedStr  = formatDate(contact.addedAt);
  const stepDate  = contact.stepEnteredAt || contact.addedAt;
  const stepStr   = formatDate(stepDate);
  const days      = daysAgo(stepDate);
  const staleLbl  = staleLabel(days);
  const staleClass = days >= 14 ? 'danger' : 'warn';

  const lastRef       = contact.lastMovedAt || contact.stepEnteredAt || contact.addedAt;
  const lastMovedStr  = formatDate(lastRef);

  const cold = isColdLead(contact);
  const coldIndicator = cold
    ? `<div class="cold-indicator" title="Lead frio — parado há mais de 3 dias">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
          <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
      </div>`
    : '';

  const hName    = highlight(contact.name    || 'Sem nome', searchQuery);
  const hRole    = highlight(contact.role    || '',         searchQuery);
  const hCompany = highlight(contact.company || '',         searchQuery);

  const category      = (contact.category || '').trim();
  const catClass      = getCategoryClass(category);
  const categoryBlock = category
    ? `<div class="card-category-row"><span class="category-badge ${catClass}">${escapeHtml(category)}</span></div>`
    : '';

  const noteContent = contact.note || '';

  card.innerHTML = `
    ${coldIndicator}
    <div class="card-top">
      <div class="avatar">${avatarHtml}</div>
      <div style="flex:1;min-width:0;">
        <div class="card-name">${hName}</div>
        <div class="card-role">${hRole}</div>
      </div>
    </div>
    ${categoryBlock}
    ${contact.company ? `
    <div class="card-company">
      <div class="company-logo">${companyLogoHtml}</div>
      <span>${hCompany}</span>
    </div>` : ''}
    ${staleLbl ? `<div class="stale-badge ${staleClass}">⏱ ${staleLbl}</div>` : ''}
    <div class="card-note-area">
      <div class="note-text ${noteContent ? '' : 'empty'}" title="Clique para editar nota"
        onclick="openNote(this, '${contact.id}')">
        ${noteContent ? escapeHtml(noteContent) : 'Adicionar nota…'}
      </div>
      <textarea class="note-input" id="note-${contact.id}"
        placeholder="Anotações…"
        onblur="saveNote(this, '${contact.id}')"
        onkeydown="noteKeydown(event, this, '${contact.id}')"
      >${escapeHtml(noteContent)}</textarea>
    </div>
    <div class="card-footer">
      <div class="card-footer-meta">
        <div class="card-footer-line">
          <span class="card-date-added">adicionado ${addedStr}</span>
        </div>
        <div class="card-last-moved">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
          </svg>
          movido ${lastMovedStr}
        </div>
        ${stepDate !== contact.addedAt ? `<div class="card-date-step">etapa desde ${stepStr}</div>` : ''}
      </div>
      <div class="card-actions">
        <button type="button" class="icon-btn note-btn" title="Notas" onclick="openNotesPanel('${contact.id}')">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </button>
        ${contact.linkedin
          ? `<button type="button" class="icon-btn" title="Abrir LinkedIn" onclick="openLinkedInById('${contact.id}')">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
              </svg>
            </button>`
          : ''}
        <button class="icon-btn danger" title="Remover" onclick="confirmRemove('${contact.id}')">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>
    </div>
  `;

  card.addEventListener('dragstart', e => {
    dragCard = contact.id;
    card.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
  });
  card.addEventListener('dragend', () => {
    card.classList.remove('dragging');
    document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
  });

  return card;
}

// ─── SEARCH ──────────────────────────────────────────────────────────────────
function applySearch() {
  const q = searchQuery;
  document.querySelectorAll('.card').forEach(card => {
    const contact = contacts.find(c => c.id === card.dataset.id);
    if (!contact) return;
    card.classList.toggle('hidden-search', !matchesSearch(contact, q));
  });
  document.querySelectorAll('.cards-zone').forEach(zone => {
    const visible = [...zone.querySelectorAll('.card')].filter(c => !c.classList.contains('hidden-search'));
    let empty = zone.querySelector('.empty-drop');
    const si = zone.dataset.step;
    const total = contacts.filter(c => c.step === parseInt(si, 10)).length;
    if (visible.length === 0 && !empty && total > 0 && q) {
      empty = document.createElement('div');
      empty.className = 'empty-drop';
      empty.textContent = 'Nenhum resultado';
      zone.appendChild(empty);
    } else if (visible.length > 0 && empty && empty.textContent === 'Nenhum resultado') {
      empty.remove();
    }
  });
}

// ─── INLINE NOTE EDITING ──────────────────────────────────────────────────────
function openNote(el, id) {
  const textarea = document.getElementById('note-' + id);
  el.style.display = 'none';
  textarea.style.display = 'block';
  textarea.focus();
  textarea.setSelectionRange(textarea.value.length, textarea.value.length);
}

function saveNote(textarea, id) {
  const contact = contacts.find(c => c.id === id);
  if (!contact) return;
  const val = textarea.value.trim();
  if (val !== contact.note) {
    if (val) {
      if (!contact.noteHistory) contact.noteHistory = [];
      contact.noteHistory.unshift({ text: val, savedAt: new Date().toISOString() });
      if (contact.noteHistory.length > 20) contact.noteHistory.pop();
    }
    contact.note = val;
    save();
  }
  textarea.style.display = 'none';
  const noteText = textarea.previousElementSibling;
  noteText.style.display = '';
  noteText.innerHTML = val ? escapeHtml(val) : 'Adicionar nota…';
  noteText.classList.toggle('empty', !val);
}

function noteKeydown(e, textarea, id) {
  if (e.key === 'Escape') textarea.blur();
  else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) textarea.blur();
}

// ─── NOTES SIDE PANEL ────────────────────────────────────────────────────────
function openNotesPanel(id) {
  const contact = contacts.find(c => c.id === id);
  if (!contact) return;
  currentNoteContactId = id;

  const initials = getInitials(contact.name);
  const npAvatar = document.getElementById('np-avatar');
  npAvatar.innerHTML = contact.avatar
    ? `<img src="${contact.avatar}" alt="${escapeHtml(contact.name)}" onerror="this.parentNode.innerHTML='${initials}'">`
    : initials;

  document.getElementById('np-name').textContent = contact.name || '—';
  document.getElementById('np-sub').textContent  = [contact.role, contact.company].filter(Boolean).join(' · ') || '—';
  document.getElementById('np-textarea').value   = contact.note || '';

  renderNoteHistory(contact);

  document.getElementById('notes-panel-backdrop').classList.add('open');
  setTimeout(() => document.getElementById('np-textarea').focus(), 250);
}

function renderNoteHistory(contact) {
  const hist = contact.noteHistory || [];
  const container = document.getElementById('np-history');
  if (hist.length === 0) {
    container.innerHTML = '<div class="notes-empty">Nenhuma nota salva ainda.</div>';
    return;
  }
  container.innerHTML = hist.map(h => `
    <div class="notes-history-item">
      <div class="notes-history-ts">${formatDateFull(h.savedAt)}</div>
      <div class="notes-history-text">${escapeHtml(h.text)}</div>
    </div>
  `).join('');
}

function saveNoteFromPanel() {
  if (!currentNoteContactId) return;
  const contact = contacts.find(c => c.id === currentNoteContactId);
  if (!contact) return;
  const val = document.getElementById('np-textarea').value.trim();
  if (val && val !== contact.note) {
    if (!contact.noteHistory) contact.noteHistory = [];
    contact.noteHistory.unshift({ text: val, savedAt: new Date().toISOString() });
    if (contact.noteHistory.length > 20) contact.noteHistory.pop();
  }
  contact.note = val;
  save();
  buildBoard();
  renderNoteHistory(contact);
  showToast('Nota salva!');
}

function closeNotesPanelBtn() {
  document.getElementById('notes-panel-backdrop').classList.remove('open');
  currentNoteContactId = null;
}

function closeNotesPanel(e) {
  if (e.target.id === 'notes-panel-backdrop') closeNotesPanelBtn();
}

// ─── DRAG & DROP ─────────────────────────────────────────────────────────────
function onDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
}

function onDragEnter(e) {
  e.preventDefault();
  e.currentTarget.classList.add('drag-over');
}

function onDragLeave(e) {
  if (!e.currentTarget.contains(e.relatedTarget)) {
    e.currentTarget.classList.remove('drag-over');
  }
}

function onDrop(e) {
  e.preventDefault();
  const zone = e.currentTarget;
  zone.classList.remove('drag-over');
  const targetStep = parseInt(zone.dataset.step, 10);
  if (dragCard === null) return;
  const contact = contacts.find(c => c.id === dragCard);
  if (!contact || contact.step === targetStep) return;
  const now = new Date().toISOString();
  contact.step          = targetStep;
  contact.stepEnteredAt = now;
  contact.lastMovedAt   = now;   // Feature 3: register movement timestamp
  save();
  buildBoard();
  showToast(`${contact.name} movido para "${STEPS[targetStep].label}"`);
}

// ─── STATS ───────────────────────────────────────────────────────────────────
function updateStats() {
  document.getElementById('stat-total').textContent = contacts.length;
  const weekAgo = new Date(Date.now() - 7 * 864e5);
  document.getElementById('stat-week').textContent  = contacts.filter(c => new Date(c.addedAt) > weekAgo).length;
}

// ─── TOAST ───────────────────────────────────────────────────────────────────
let toastTimer;
function showToast(msg) {
  const toast = document.getElementById('toast');
  document.getElementById('toast-msg').textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3000);
}

// ─── THEME ───────────────────────────────────────────────────────────────────
const THEME_STORAGE_KEY = 'isla-crm-theme';

function updateThemeToggleIcon() {
  const moon  = document.getElementById('theme-icon-moon');
  const sun   = document.getElementById('theme-icon-sun');
  const btn   = document.getElementById('theme-toggle');
  if (!moon || !sun || !btn) return;
  const light = document.body.classList.contains('light-mode');
  moon.hidden = light;
  sun.hidden  = !light;
  btn.setAttribute('aria-label', light ? 'Alternar para modo escuro' : 'Alternar para modo claro');
}

function toggleTheme() {
  document.body.classList.toggle('light-mode');
  localStorage.setItem(THEME_STORAGE_KEY, document.body.classList.contains('light-mode') ? 'light' : 'dark');
  updateThemeToggleIcon();
}

function applySavedTheme() {
  if (localStorage.getItem(THEME_STORAGE_KEY) === 'light') document.body.classList.add('light-mode');
  else document.body.classList.remove('light-mode');
  updateThemeToggleIcon();
}

// ─── MODAL ───────────────────────────────────────────────────────────────────
function openModal() {
  document.getElementById('modal').classList.add('open');
  document.getElementById('linkedin-url').value = '';
  document.getElementById('preview-contact').classList.remove('show');
  document.getElementById('loading-indicator').classList.remove('show');
  document.getElementById('modal-categoria').value = 'Investidor';
  pendingLinkedinData = null;
  setTimeout(() => document.getElementById('linkedin-url').focus(), 100);
}

function closeModal() {
  document.getElementById('modal').classList.remove('open');
  clearTimeout(linkedinFetchTimer);
}

function backdropClose(e) {
  if (e.target.id === 'modal') closeModal();
}

// ─── CONFIRM MODAL ───────────────────────────────────────────────────────────
function confirmRemove(id) {
  const contact = contacts.find(c => c.id === id);
  if (!contact) return;
  document.getElementById('confirm-title').textContent = `Remover ${contact.name}?`;
  document.getElementById('confirm-desc').textContent  = 'Este founder será removido do CRM. Esta ação não pode ser desfeita.';
  confirmCallback = () => removeContact(id);
  document.getElementById('confirm-ok-btn').onclick = () => {
    if (confirmCallback) confirmCallback();
    closeConfirm();
  };
  document.getElementById('confirm-modal').classList.add('open');
}

function closeConfirm() {
  document.getElementById('confirm-modal').classList.remove('open');
  confirmCallback = null;
}

// ─── REMOVE ──────────────────────────────────────────────────────────────────
function removeContact(id) {
  const contact = contacts.find(c => c.id === id);
  if (!contact) return;
  contacts = contacts.filter(c => c.id !== id);
  save();
  buildBoard();
  showToast(`${contact.name} removido`);
}

function openLinkedInById(id) {
  const c = contacts.find(c => c.id === id);
  if (c?.linkedin) window.open(c.linkedin, '_blank');
}

// ─── ADD CONTACT ─────────────────────────────────────────────────────────────
function addContact() {
  const url      = document.getElementById('linkedin-url').value.trim();
  const step     = parseInt(document.getElementById('modal-step').value, 10);
  const category = document.getElementById('modal-categoria').value;

  if (!pendingLinkedinData || !pendingLinkedinData.name) {
    const el = document.getElementById('linkedin-url');
    el.focus();
    el.style.borderColor = 'var(--red)';
    setTimeout(() => { el.style.borderColor = ''; }, 1500);
    showToast('Aguarde os dados do LinkedIn serem carregados.');
    return;
  }

  const now = new Date().toISOString();
  const contact = {
    id: 'c_' + Date.now() + Math.random().toString(36).slice(2, 6),
    step,
    addedAt:      now,
    stepEnteredAt: now,
    lastMovedAt:  now,
    note:         '',
    noteHistory:  [],
    ...pendingLinkedinData,
    linkedin:     pendingLinkedinData.linkedin || url,
    category,
    nextAction:   '',
    responsible:  '',
  };
  contacts.push(contact);
  save();
  buildBoard();
  closeModal();
  showToast(`${contact.name} adicionado ao CRM! 🎉`);
}

// ─── LINKEDIN FETCH ───────────────────────────────────────────────────────────
function getMockData(url) {
  return {
    data: {
      full_name:          'João Wiltenburg',
      job_title:          'Desenvolvedor web',
      headline:           'Estudante de ADS na FIAP | HTML | CSS | JavaScript | Git',
      company:            'DRB Negócios',
      company_logo_url:   null,
      profile_image_url:  'https://media.licdn.com/dms/image/v2/D5603AQH3WOKWNraOKA/profile-displayphoto-crop_800_800/B56Z2Ht9ceIQAI-/0/1776098470061',
      linkedin_url:       url,
      about:              'Estudante de TI com foco em desenvolvimento web.',
      city: 'Guarulhos', state: 'São Paulo', country: 'Brazil',
      location:           'Guarulhos, São Paulo, Brazil',
      follower_count: 127, connection_count: 116,
      experiences: [{ company: 'DRB Negócios', title: 'Desenvolvedor web', duration: '2 mos' }],
      educations:  [{ school: 'FIAP', degree: 'Tecnólogo', field_of_study: 'ADS' }],
      email: '', phone: '', skills: '',
      first_name: 'João', last_name: 'Wiltenburg',
    },
    message: 'ok',
  };
}

async function fetchLinkedIn(url) {
  if (url === LINKEDIN_MOCK_URL) {
    const json = getMockData(url);
    const d = json.data;
    pendingLinkedinData = mapLinkedInData(d, url);
    showPreview(pendingLinkedinData);
    return;
  }

  const loading = document.getElementById('loading-indicator');
  loading.classList.add('show');
  try {
    const res = await fetch(LINKEDIN_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ linkedin_url: url }),
    });
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    const json = await res.json();
    pendingLinkedinData = mapLinkedInData(json.data, url);
    showPreview(pendingLinkedinData);
  } catch (err) {
    console.error('Erro na API do LinkedIn:', err);
    showToast('Não foi possível buscar os dados do LinkedIn.');
  } finally {
    loading.classList.remove('show');
  }
}

function mapLinkedInData(d, url) {
  return {
    name:            d.full_name || '',
    role:            d.job_title || d.headline || '',
    company:         d.company || '',
    companyLogo:     d.company_logo_url || null,
    avatar:          d.profile_image_url || null,
    linkedin:        d.linkedin_url || url,
    about:           d.about || '',
    headline:        d.headline || '',
    city:            d.city || '',
    state:           d.state || '',
    country:         d.country || '',
    location:        d.location || '',
    followers:       d.follower_count || 0,
    connections:     d.connection_count || 0,
    currentCompany:  d.company || '',
    currentJobTitle: d.job_title || '',
    experiences:     d.experiences || [],
    education:       d.educations || [],
    email:           d.email || '',
    phone:           d.phone || '',
    skills:          d.skills || '',
    firstName:       d.first_name || '',
    lastName:        d.last_name || '',
    publicId:        d.public_id || '',
    profileId:       d.profile_id || '',
  };
}

function showPreview(data) {
  const prev = document.getElementById('preview-contact');
  const initials = getInitials(data.name || '?');
  document.getElementById('prev-avatar').innerHTML = data.avatar
    ? `<img src="${data.avatar}" alt="${escapeHtml(data.name)}">`
    : initials;
  document.getElementById('prev-name').textContent    = data.name    || '—';
  document.getElementById('prev-role').textContent    = data.role    || '—';
  document.getElementById('prev-company').textContent = data.company || '—';
  prev.classList.add('show');
}

// ─── EXPORT CSV ──────────────────────────────────────────────────────────────
function exportCSV() {
  const headers = ['Nome', 'Cargo', 'Empresa', 'Etapa atual', 'Categoria', 'Data adicionado', 'Último movimento', 'URL LinkedIn', 'Notas'];
  const rows = contacts.map(c => [
    c.name    || '',
    c.role    || '',
    c.company || '',
    STEPS[c.step]?.label || '',
    c.category || '',
    c.addedAt ? new Date(c.addedAt).toLocaleDateString('pt-BR') : '',
    (c.lastMovedAt || c.stepEnteredAt || c.addedAt)
      ? new Date(c.lastMovedAt || c.stepEnteredAt || c.addedAt).toLocaleDateString('pt-BR')
      : '',
    c.linkedin || '',
    (c.note || '').replace(/\n/g, ' '),
  ]);

  const csvContent = [headers, ...rows]
    .map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
    .join('\n');

  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href  = url;
  link.download = `isla-crm-${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  showToast(`${contacts.length} leads exportados como CSV`);
}

// ─── ANALYTICS ───────────────────────────────────────────────────────────────
function showAnalytics() {
  document.getElementById('board').style.display = 'none';
  document.getElementById('search-input').closest('.header-center').style.display = 'none';
  document.getElementById('analytics-btn').classList.add('active');
  const view = document.getElementById('analytics-view');
  view.classList.add('visible');
  renderAnalytics();
}

function hideAnalytics() {
  document.getElementById('board').style.display           = '';
  document.getElementById('search-input').closest('.header-center').style.display = '';
  document.getElementById('analytics-btn').classList.remove('active');
  document.getElementById('analytics-view').classList.remove('visible');
}

function renderAnalytics() {
  const now      = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const weekAgo  = new Date(now - 7 * 864e5);

  const todayCount = contacts.filter(c => (c.addedAt || '').startsWith(todayStr)).length;
  const weekCount  = contacts.filter(c => new Date(c.addedAt) > weekAgo).length;
  const coldCount  = contacts.filter(isColdLead).length;

  // ── Metric cards
  const metricsEl = document.getElementById('analytics-metrics');
  const todayPct  = dailyGoal ? Math.round((todayCount / dailyGoal) * 100) : 0;
  metricsEl.innerHTML = `
    <div class="metric-card">
      <div class="metric-label">Total de leads</div>
      <div class="metric-value">${contacts.length}</div>
    </div>
    <div class="metric-card">
      <div class="metric-label">Adicionados hoje</div>
      <div class="metric-value">${todayCount}</div>
      <div class="metric-sub">${todayPct}% da meta diária</div>
    </div>
    <div class="metric-card">
      <div class="metric-label">Essa semana</div>
      <div class="metric-value">${weekCount}</div>
    </div>
    <div class="metric-card">
      <div class="metric-label">Meta diária</div>
      <div class="metric-value">
        <input class="metric-input-inline" type="number" min="1" max="999"
          value="${dailyGoal}"
          onchange="dailyGoal=parseInt(this.value)||50;localStorage.setItem('isla-crm-daily-goal',dailyGoal);renderAnalytics();"
        />
      </div>
      <div class="metric-sub">leads / dia</div>
    </div>
    <div class="metric-card">
      <div class="metric-label">Leads frios</div>
      <div class="metric-value" style="color:var(--amber)">${coldCount}</div>
      <div class="metric-sub">parados há +3 dias</div>
    </div>
  `;

  // ── Funnel
  const total  = contacts.length || 1;
  const counts = STEPS.map((_, si) => contacts.filter(c => c.step === si).length);

  let bottleneckIdx = 0;
  let bottleneckMax = -1;
  counts.slice(0, -1).forEach((n, i) => {
    if (n > bottleneckMax) { bottleneckMax = n; bottleneckIdx = i; }
  });

  const funnelEl = document.getElementById('analytics-funnel');
  funnelEl.innerHTML = STEPS.map((step, i) => {
    const pct           = Math.round((counts[i] / total) * 100);
    const isBottleneck  = i === bottleneckIdx && counts[i] > 0;
    return `
      <div class="funnel-row ${isBottleneck ? 'bottleneck' : ''}">
        <div class="funnel-label">${step.label}${isBottleneck ? ' ⚠' : ''}</div>
        <div class="funnel-bar-wrap">
          <div class="funnel-bar-fill" style="width:${pct}%;background:${step.color};"></div>
        </div>
        <div class="funnel-count">${counts[i]} <span style="color:var(--muted2);font-size:10px;">(${pct}%)</span></div>
      </div>
    `;
  }).join('');

  // ── Conversion rates
  const convEl = document.getElementById('analytics-conv');
  convEl.innerHTML = STEPS.slice(0, -1).map((step, i) => {
    const from = contacts.filter(c => c.step >= i).length;
    const to   = contacts.filter(c => c.step >= i + 1).length;
    const rate = from > 0 ? Math.round((to / from) * 100) : 0;
    const cls  = rate >= 50 ? '' : rate >= 25 ? 'mid' : 'low';
    return `
      <div class="conv-row">
        <div class="conv-label">${step.label} → ${STEPS[i + 1].label}</div>
        <div class="conv-rate ${cls}">${rate}%</div>
      </div>
    `;
  }).join('');

  // ── Activity chart (last 7 days)
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().split('T')[0]);
  }
  const maxAct = Math.max(...days.map(d => contacts.filter(c => (c.addedAt || '').startsWith(d)).length), 1);

  const actEl = document.getElementById('analytics-activity');
  actEl.innerHTML = days.map(d => {
    const cnt       = contacts.filter(c => (c.addedAt || '').startsWith(d)).length;
    const heightPct = Math.round((cnt / maxAct) * 80) + 10;
    const label     = new Date(d + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    const isToday   = d === todayStr;
    return `
      <div class="activity-bar-col">
        <div class="activity-bar-count">${cnt > 0 ? cnt : ''}</div>
        <div class="activity-bar ${isToday ? 'today' : ''}" style="height:${heightPct}%;" title="${cnt} leads em ${label}"></div>
        <div class="activity-day-label">${label}</div>
      </div>
    `;
  }).join('');

  // ── Cold leads table
  const cold = contacts.filter(isColdLead).sort((a, b) => {
    const dA = daysAgo(a.lastMovedAt || a.stepEnteredAt || a.addedAt);
    const dB = daysAgo(b.lastMovedAt || b.stepEnteredAt || b.addedAt);
    return dB - dA;
  });

  document.getElementById('cold-leads-count').textContent = cold.length;

  const coldTableEl = document.getElementById('analytics-cold-table');
  if (cold.length === 0) {
    coldTableEl.innerHTML = '<div class="notes-empty">Nenhum lead frio no momento 🎉</div>';
  } else {
    coldTableEl.innerHTML = `
      <table class="cold-table">
        <thead>
          <tr>
            <th>Nome</th>
            <th>Etapa</th>
            <th>Empresa</th>
            <th>Dias parado</th>
          </tr>
        </thead>
        <tbody>
          ${cold.map(c => {
            const ref = c.lastMovedAt || c.stepEnteredAt || c.addedAt;
            const d   = daysAgo(ref);
            return `
              <tr>
                <td>${escapeHtml(c.name    || '—')}</td>
                <td>${STEPS[c.step]?.label || '—'}</td>
                <td>${escapeHtml(c.company || '—')}</td>
                <td class="cold-days">${d}d</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;
  }

  // ── Two-col responsive fix
  const twoCol = document.getElementById('analytics-two-col');
  if (twoCol) {
    twoCol.style.gridTemplateColumns = window.innerWidth < 640 ? '1fr' : '1fr 1fr';
  }
}

// ─── INIT ────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  applySavedTheme();

  document.getElementById('confirm-modal').addEventListener('click', e => {
    if (e.target.id === 'confirm-modal') closeConfirm();
  });

  document.getElementById('linkedin-url').addEventListener('input', e => {
    clearTimeout(linkedinFetchTimer);
    pendingLinkedinData = null;
    document.getElementById('preview-contact').classList.remove('show');
    const val = e.target.value.trim();
    if (!val.includes('linkedin.com/in/')) return;
    const delay = val === LINKEDIN_MOCK_URL ? 0 : 800;
    linkedinFetchTimer = setTimeout(() => fetchLinkedIn(val), delay);
  });

  document.getElementById('search-input').addEventListener('input', e => {
    searchQuery = e.target.value.trim();
    buildBoard();
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeModal();
      closeConfirm();
      closeNotesPanelBtn();
      if (document.getElementById('analytics-view').classList.contains('visible')) hideAnalytics();
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      document.getElementById('search-input').focus();
      document.getElementById('search-input').select();
    }
  });

  window.addEventListener('resize', () => {
    if (document.getElementById('analytics-view').classList.contains('visible')) {
      const twoCol = document.getElementById('analytics-two-col');
      if (twoCol) twoCol.style.gridTemplateColumns = window.innerWidth < 640 ? '1fr' : '1fr 1fr';
    }
  });

  buildBoard();
});
