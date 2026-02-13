// Golf course data – loaded from map.geojson at startup
let GOLF_COURSE_DATA = null;

// Constants
// Väder-API: Sätt window.SLOTTS_WEATHER_PROXY till din proxy-URL (t.ex. Netlify/Vercel-funktion)
// för att dölja API-nyckeln. Annars används nyckeln direkt (synlig i klienten).
const WEATHER_API_KEY = '99d688898682ba4fc727529cd0fbd7ac';
const CLUBS = [
    'Driver', 'Trä 3', 'Trä 5', 'Hybrid 3', 'Järn 4', 'Järn 5', 
    'Järn 6', 'Järn 7', 'Järn 8', 'Järn 9', 'PW', 'SW', 'LW'
];

// Default distances (meters) and spread so users have sensible starting values they can edit
const DEFAULT_CLUB_DATA = {
    'Driver': { totalDistance: 230, carryDistance: 220, spread: 10 },
    'Trä 3': { totalDistance: 210, carryDistance: 200, spread: 8 },
    'Trä 5': { totalDistance: 195, carryDistance: 185, spread: 8 },
    'Hybrid 3': { totalDistance: 185, carryDistance: 175, spread: 7 },
    'Järn 4': { totalDistance: 170, carryDistance: 160, spread: 6 },
    'Järn 5': { totalDistance: 160, carryDistance: 150, spread: 6 },
    'Järn 6': { totalDistance: 150, carryDistance: 140, spread: 5 },
    'Järn 7': { totalDistance: 140, carryDistance: 130, spread: 5 },
    'Järn 8': { totalDistance: 130, carryDistance: 120, spread: 5 },
    'Järn 9': { totalDistance: 120, carryDistance: 110, spread: 5 },
    'PW': { totalDistance: 110, carryDistance: 95, spread: 5 },
    'SW': { totalDistance: 85, carryDistance: 80, spread: 4 },
    'LW': { totalDistance: 75, carryDistance: 70, spread: 4 }
};
// Logger – stäng av i produktion genom att sätta window.SLOTTS_DEBUG = false
const log = (typeof window !== 'undefined' && window.SLOTTS_DEBUG === false)
    ? () => {}
    : (...args) => console.warn(...args);

// App State
let state = {
    currentHole: null,
    userPosition: null,
    weatherData: null,
    weatherLoading: false,
    pinOffset: { x: 0, y: 0 },
    selectedTee: 50,
    clubs: loadClubData(),
    watchId: null,
    timerStartTime: null,
    timerRunning: false,
    timerIntervalId: null,
    deviceHeading: null,  // kompassriktning (grader), 0 = N, 90 = Ö
    notes: loadNotes()    // anteckningar per hål { 1: "...", 2: "...", ... }
};

// Tees: 47, 50, 54, 58 (bana längre = högre siffra). Varje hål har längd per tee i meter.
const TEE_IDS = [47, 50, 54, 58];

// Hålinfo per hål: par, handicap (index 1–18), lengths = { 47, 50, 54, 58 } i meter. Slottsbanan.
const HOLE_INFO = {
    1: { par: 4, handicap: 12, lengths: { 47: 301, 50: 338, 54: 354, 58: 404 } },
    2: { par: 5, handicap: 8, lengths: { 47: 368, 50: 422, 54: 422, 58: 431 } },
    3: { par: 5, handicap: 6, lengths: { 47: 417, 50: 417, 54: 469, 58: 480 } },
    4: { par: 3, handicap: 16, lengths: { 47: 84, 50: 93, 54: 116, 58: 128 } },
    5: { par: 5, handicap: 4, lengths: { 47: 386, 50: 386, 54: 446, 58: 456 } },
    6: { par: 4, handicap: 14, lengths: { 47: 275, 50: 275, 54: 332, 58: 345 } },
    7: { par: 4, handicap: 18, lengths: { 47: 196, 50: 230, 54: 238, 58: 257 } },
    8: { par: 4, handicap: 2, lengths: { 47: 264, 50: 279, 54: 327, 58: 360 } },
    9: { par: 3, handicap: 10, lengths: { 47: 98, 50: 131, 54: 150, 58: 158 } },
    10: { par: 4, handicap: 5, lengths: { 47: 265, 50: 270, 54: 280, 58: 309 } },
    11: { par: 4, handicap: 1, lengths: { 47: 311, 50: 317, 54: 346, 58: 367 } },
    12: { par: 5, handicap: 9, lengths: { 47: 404, 50: 420, 54: 431, 58: 452 } },
    13: { par: 3, handicap: 15, lengths: { 47: 114, 50: 144, 54: 152, 58: 170 } },
    14: { par: 5, handicap: 11, lengths: { 47: 400, 50: 420, 54: 468, 58: 480 } },
    15: { par: 3, handicap: 17, lengths: { 47: 97, 50: 116, 54: 116, 58: 134 } },
    16: { par: 4, handicap: 3, lengths: { 47: 290, 50: 316, 54: 334, 58: 365 } },
    17: { par: 3, handicap: 13, lengths: { 47: 106, 50: 127, 54: 133, 58: 142 } },
    18: { par: 4, handicap: 7, lengths: { 47: 286, 50: 292, 54: 333, 58: 398 } }
};

// Layout persistence keys (en per sida)
const LAYOUT_KEY_MAIN = 'layoutOrderMain';
const LAYOUT_KEY_BANGUIDE = 'layoutOrderBanguide';
const LAYOUT_KEY_DISTANCE = 'layoutOrderDistance';
const NOTES_KEY = 'holeNotes';

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
});

function showLoading() {
    const el = document.getElementById('loadingOverlay');
    if (el) el.classList.add('active');
}

function hideLoading() {
    const el = document.getElementById('loadingOverlay');
    if (el) el.classList.remove('active');
}

async function loadCourseData() {
    try {
        const res = await fetch('map.geojson');
        if (!res.ok) throw new Error(res.statusText);
        const data = await res.json();
        if (data && data.type === 'FeatureCollection' && Array.isArray(data.features)) {
            GOLF_COURSE_DATA = data;
            return;
        }
    } catch (e) {
        console.warn('Kunde inte ladda banan:', e);
    }
    GOLF_COURSE_DATA = { type: 'FeatureCollection', features: [] };
    const distEl = document.getElementById('distanceToGreen');
    if (distEl) distEl.innerHTML = '<span class="loading">❌ Kunde inte ladda banan</span>';
}

async function initializeApp() {
    showLoading();
    await loadCourseData();
    createHoleButtons();
    populateClubSelect();
    setupEventListeners();
    loadLayoutOrder();
    setDraggableState(true);
    setupAllDragHandlers();
    // Set total (max) time for full round (18 holes x 15 min = 270 min = 04:30)
    try {
        const totalMinutes = 18 * 15;
        const totalHours = Math.floor(totalMinutes / 60);
        const totalMins = totalMinutes % 60;
        const formatted = `${String(totalHours).padStart(2, '0')}:${String(totalMins).padStart(2, '0')}`;
        const el = document.getElementById('totalTimeLimit');
        if (el) el.textContent = formatted;
    } catch (e) {
        // ignore if element missing
    }
    selectHole(1);
    startLocationTracking();
    setupDeviceOrientation();
    setupBanguideImageZoom();
    setupGreenPinDrag();
    updateBanguidePage();
    hideLoading();
}

// Club Data Management
function loadClubData() {
    const saved = localStorage.getItem('clubData');
    if (saved) {
        const parsed = JSON.parse(saved);
        // Ensure every club has spread (for old saved data)
        Object.keys(parsed).forEach(name => {
            if (parsed[name] && typeof parsed[name].spread !== 'number') {
                parsed[name].spread = (DEFAULT_CLUB_DATA[name] && typeof DEFAULT_CLUB_DATA[name].spread === 'number')
                    ? DEFAULT_CLUB_DATA[name].spread : 5;
            }
        });
        return parsed;
    }
    // Use predefined sensible defaults so users have values to edit from start
    const defaultClubs = {};
    CLUBS.forEach(club => {
        if (DEFAULT_CLUB_DATA[club]) {
            defaultClubs[club] = { 
                totalDistance: DEFAULT_CLUB_DATA[club].totalDistance,
                carryDistance: DEFAULT_CLUB_DATA[club].carryDistance,
                spread: DEFAULT_CLUB_DATA[club].spread ?? 5
            };
        } else {
            defaultClubs[club] = { totalDistance: 0, carryDistance: 0, spread: 5 };
        }
    });
    return defaultClubs;
}

function saveClubData() {
    localStorage.setItem('clubData', JSON.stringify(state.clubs));
}

function loadNotes() {
    try {
        const saved = localStorage.getItem(NOTES_KEY);
        return saved ? JSON.parse(saved) : {};
    } catch (e) {
        return {};
    }
}

function saveNotes() {
    try {
        localStorage.setItem(NOTES_KEY, JSON.stringify(state.notes));
    } catch (e) {
        console.warn('Kunde inte spara anteckningar', e);
    }
}

// UI Creation
function createHoleButtons() {
    const container = document.getElementById('holeButtons');
    if (!container) return;
    container.innerHTML = '';

    // Create swipe-friendly hole navigation
    const swipeArea = document.createElement('div');
    swipeArea.id = 'holeSwipeArea';
    swipeArea.className = 'hole-swipe-area';
    
    // Left arrow - simple and clean
    const leftArrow = document.createElement('div');
    leftArrow.className = 'swipe-arrow left-arrow';
    leftArrow.textContent = '‹';
    
    const holeDisplay = document.createElement('div');
    holeDisplay.className = 'hole-display';
    
    const holeNumber = document.createElement('div');
    holeNumber.id = 'currentHoleNumber';
    holeNumber.className = 'hole-number';
    holeNumber.textContent = state.currentHole || '1';
    
    const holeLabel = document.createElement('div');
    holeLabel.className = 'hole-label';
    holeLabel.textContent = 'Hål';
    
    const swipeHint = document.createElement('div');
    swipeHint.className = 'swipe-hint';
    swipeHint.textContent = 'Svep för att byta';
    
    // Right arrow - simple and clean
    const rightArrow = document.createElement('div');
    rightArrow.className = 'swipe-arrow right-arrow';
    rightArrow.textContent = '›';
    
    holeDisplay.appendChild(holeLabel);
    holeDisplay.appendChild(holeNumber);
    swipeArea.appendChild(leftArrow);
    swipeArea.appendChild(holeDisplay);
    swipeArea.appendChild(rightArrow);
    swipeArea.appendChild(swipeHint);
    
    container.appendChild(swipeArea);
    
    // Click / tap handlers (tap to change hole)
    leftArrow.addEventListener('click', (e) => {
        e.stopPropagation();
        triggerSwipeVibration('right');
        selectHole(state.currentHole - 1);
    });
    rightArrow.addEventListener('click', (e) => {
        e.stopPropagation();
        triggerSwipeVibration('left');
        selectHole(state.currentHole + 1);
    });

    // Tap left/right half of the area to change hole (for larger touch targets)
    swipeArea.addEventListener('click', (e) => {
        const rect = swipeArea.getBoundingClientRect();
        const x = e.clientX - rect.left;
        if (x < rect.width / 2) {
            triggerSwipeVibration('right');
            selectHole(state.currentHole - 1);
        } else {
            triggerSwipeVibration('left');
            selectHole(state.currentHole + 1);
        }
    });

    // Setup swipe detection (keeps background move on touchmove, but touchend no longer changes hole)
    setupSwipeDetection();
}

function createClubSettings() {
    const container = document.getElementById('clubList');
    if (!container) return;
    container.innerHTML = '';

    const clubNames = Object.keys(state.clubs).sort((a, b) => {
        const orderA = CLUBS.indexOf(a);
        const orderB = CLUBS.indexOf(b);
        if (orderA >= 0 && orderB >= 0) return orderA - orderB;
        if (orderA >= 0) return -1;
        if (orderB >= 0) return 1;
        return a.localeCompare(b);
    });

    clubNames.forEach(clubName => {
        const clubData = state.clubs[clubName];
        if (!clubData) return;
        const isCustom = CLUBS.indexOf(clubName) === -1;
        const item = document.createElement('div');
        item.className = 'club-item' + (isCustom ? ' club-item-custom' : '');
        const removeBtn = isCustom
            ? `<button type="button" class="btn-remove-club" data-club="${escapeHtml(clubName)}" aria-label="Ta bort ${escapeHtml(clubName)}">Ta bort</button>`
            : '';
        item.innerHTML = `
            <div class="club-item-header-row">
                <span class="club-item-header">${escapeHtml(clubName)}</span>
                ${removeBtn}
            </div>
            <div class="club-inputs">
                <div class="input-group">
                    <label>Totallängd (m)</label>
                    <input type="number" 
                           data-club="${escapeHtml(clubName)}" 
                           data-field="totalDistance" 
                           value="${Number(clubData.totalDistance) || ''}" 
                           placeholder="0">
                </div>
                <div class="input-group">
                    <label>Längd utan rull (m)</label>
                    <input type="number" 
                           data-club="${escapeHtml(clubName)}" 
                           data-field="carryDistance" 
                           value="${Number(clubData.carryDistance) || ''}" 
                           placeholder="0">
                </div>
                <div class="input-group">
                    <label>Spridning (m)</label>
                    <input type="number" 
                           data-club="${escapeHtml(clubName)}" 
                           data-field="spread" 
                           value="${clubData.spread != null ? Number(clubData.spread) : ''}" 
                           placeholder="0" min="0">
                </div>
            </div>
        `;
        container.appendChild(item);
    });

    const removeBtns = container.querySelectorAll('.btn-remove-club');
    removeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const name = btn.getAttribute('data-club');
            if (name && CLUBS.indexOf(name) === -1) {
                delete state.clubs[name];
                saveClubData();
                createClubSettings();
                populateClubSelect();
            }
        });
    });
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// Swipe Detection for Hole Navigation
let touchStartX = 0;
let touchEndX = 0;

function setupSwipeDetection() {
    const swipeArea = document.getElementById('holeSwipeArea');
    if (!swipeArea) return;

    swipeArea.addEventListener('touchstart', (e) => {
        touchStartX = e.changedTouches[0].screenX;
        swipeArea.style.transition = 'none';
    }, false);

    swipeArea.addEventListener('touchmove', (e) => {
        const currentX = e.changedTouches[0].screenX;
        const diff = touchStartX - currentX;
        // Subtle background shift during swipe (max 20px shift)
        const shift = Math.max(-20, Math.min(20, diff * 0.5));
        swipeArea.style.backgroundPosition = `calc(50% + ${shift}px) center`;
    }, false);

    swipeArea.addEventListener('touchend', (e) => {
        touchEndX = e.changedTouches[0].screenX;
        swipeArea.style.transition = 'background-position 0.3s ease';
        swipeArea.style.backgroundPosition = 'center';
    }, false);
    // Note: touchend no longer triggers hole change; taps/clicks (or arrow clicks) handle that.
}

function handleSwipe() {
    const threshold = 50; // Minimum swipe distance in pixels
    const diff = touchStartX - touchEndX;

    if (Math.abs(diff) < threshold) return; // Swipe too small, ignore

    if (diff > 0) {
        // Swiped left - next hole
        triggerSwipeVibration('left');
        selectHole(state.currentHole + 1);
    } else {
        // Swiped right - previous hole
        triggerSwipeVibration('right');
        selectHole(state.currentHole - 1);
    }
}

function triggerSwipeVibration(direction) {
    // Haptic feedback pattern for swipe
    if (navigator.vibrate) {
        // Short vibration pulse
        navigator.vibrate([30, 10, 30]);
    }
}


// Event Listeners
function setupEventListeners() {
    const settingsBtn = document.getElementById('settingsBtn');
    const closeSettingsBtn = document.getElementById('closeSettings');
    const saveSettingsBtn = document.getElementById('saveSettings');
    if (settingsBtn) settingsBtn.addEventListener('click', openSettings);
    if (closeSettingsBtn) closeSettingsBtn.addEventListener('click', closeSettings);
    if (saveSettingsBtn) saveSettingsBtn.addEventListener('click', saveSettings);

    const addClubBtn = document.getElementById('addClubBtn');
    if (addClubBtn) addClubBtn.addEventListener('click', addCustomClub);

    const resetPinBtn = document.getElementById('resetPin');
    if (resetPinBtn) resetPinBtn.addEventListener('click', resetPinPosition);

    const clubSelect = document.getElementById('clubSelect');
    if (clubSelect) {
        clubSelect.addEventListener('change', () => {
            updateClubDistanceDisplay();
            updateDistances(); // uppdaterar siktråd (sidovind beror på vald klubba)
        });
    }

    const resetLayoutBtn = document.getElementById('resetLayoutBtn');
    if (resetLayoutBtn) {
        resetLayoutBtn.addEventListener('click', () => {
            localStorage.removeItem(LAYOUT_KEY_MAIN);
            localStorage.removeItem(LAYOUT_KEY_BANGUIDE);
            localStorage.removeItem(LAYOUT_KEY_DISTANCE);
            location.reload();
        });
    }

    const updateAimBtn = document.getElementById('updateAimBtn');
    if (updateAimBtn) {
        updateAimBtn.addEventListener('click', refreshAimPosition);
    }

    // Fast bottenmeny – navigation mellan sidor
    const pages = document.getElementById('pages');
    const navBtnHome = document.getElementById('navBtnHome');
    const navBtnBanguide = document.getElementById('navBtnBanguide');
    const navBtnAvstand = document.getElementById('navBtnAvstand');
    const banguideExpandBtn = document.getElementById('banguideExpandBtn');
    const distanceExpandBtn = document.getElementById('distanceExpandBtn');

    function setActiveNav(active) {
        [navBtnHome, navBtnBanguide, navBtnAvstand].forEach(btn => {
            if (btn) btn.classList.toggle('active', btn.dataset.nav === active);
        });
    }
    const pagesWrapper = document.getElementById('pagesWrapper');
    function scrollPageToTop(selector) {
        const el = document.querySelector(selector);
        if (el) el.scrollTop = 0;
    }
    function scrollTargetPageToTop(selector) {
        scrollPageToTop(selector);
        if (pagesWrapper) pagesWrapper.scrollTop = 0;
        requestAnimationFrame(() => scrollPageToTop(selector));
    }
    function focusPageHeading(id) {
        requestAnimationFrame(() => {
            const el = document.getElementById(id);
            if (el) el.focus({ preventScroll: true });
        });
    }
    function goHome() {
        pages.classList.remove('show-banguide', 'show-distance');
        setActiveNav('home');
        requestAnimationFrame(() => scrollTargetPageToTop('.page-main'));
        focusPageHeading('mainPageHeading');
    }
    function goBanguide() {
        pages.classList.remove('show-distance');
        pages.classList.add('show-banguide');
        setActiveNav('banguide');
        requestAnimationFrame(() => scrollTargetPageToTop('.banguide-content'));
        focusPageHeading('banguidePageHeading');
    }
    function goDistance() {
        pages.classList.remove('show-banguide');
        pages.classList.add('show-distance');
        const holeEl = document.getElementById('distancePageHoleNumber');
        if (holeEl) holeEl.textContent = state.currentHole || 1;
        setActiveNav('avstand');
        requestAnimationFrame(() => scrollTargetPageToTop('.distance-page-content'));
        focusPageHeading('distancePageHeading');
    }
    if (navBtnHome) navBtnHome.addEventListener('click', goHome);
    if (navBtnBanguide) navBtnBanguide.addEventListener('click', goBanguide);
    if (navBtnAvstand) navBtnAvstand.addEventListener('click', goDistance);
    if (banguideExpandBtn) banguideExpandBtn.addEventListener('click', goBanguide);
    if (distanceExpandBtn) distanceExpandBtn.addEventListener('click', goDistance);

    const banguideHolePrev = document.getElementById('banguideHolePrev');
    const banguideHoleNext = document.getElementById('banguideHoleNext');
    if (banguideHolePrev) banguideHolePrev.addEventListener('click', () => selectHole((state.currentHole || 1) - 1));
    if (banguideHoleNext) banguideHoleNext.addEventListener('click', () => selectHole((state.currentHole || 1) + 1));

    const holeNotesInput = document.getElementById('holeNotesInput');
    if (holeNotesInput) {
        holeNotesInput.addEventListener('input', () => {
            if (state.currentHole == null) return;
            const text = holeNotesInput.value.trim();
            if (text) state.notes[state.currentHole] = holeNotesInput.value;
            else delete state.notes[state.currentHole];
            saveNotes();
        });
    }
}

const MAIN_PAGE_IDS = ['holeSelector', 'windArrowCard', 'conditionsImpactCard', 'timerSection'];

function loadLayoutOrder() {
    try {
        // Huvudsidan
        const savedMain = localStorage.getItem(LAYOUT_KEY_MAIN);
        const containerMain = document.querySelector('.main-content');
        if (containerMain && savedMain) {
            const order = JSON.parse(savedMain);
            order.forEach(id => {
                if (!MAIN_PAGE_IDS.includes(id)) return;
                const el = document.querySelector(`[data-layout-id="${id}"], #${id}`);
                if (el && el.closest('.main-content')) containerMain.appendChild(el);
            });
        }
        // Banguide-sidan
        const savedBanguide = localStorage.getItem(LAYOUT_KEY_BANGUIDE);
        const containerBanguide = document.querySelector('.banguide-content');
        if (containerBanguide && savedBanguide) {
            const order = JSON.parse(savedBanguide);
            order.forEach(id => {
                const el = document.querySelector(`[data-layout-id="${id}"], #${id}`);
                if (el && el.closest('.banguide-content')) containerBanguide.appendChild(el);
            });
        }
        // Avståndssidan
        const savedDistance = localStorage.getItem(LAYOUT_KEY_DISTANCE);
        const containerDistance = document.querySelector('.distance-page-content');
        if (containerDistance && savedDistance) {
            const order = JSON.parse(savedDistance);
            order.forEach(id => {
                const el = document.querySelector(`[data-layout-id="${id}"], #${id}`);
                if (el && el.closest('.distance-page-content')) containerDistance.appendChild(el);
            });
        }
    } catch (e) {
        console.warn('Could not load layout order', e);
    }
}

function saveLayoutOrder(container, storageKey) {
    if (!container || !storageKey) return;
    const sections = Array.from(container.querySelectorAll('.card'));
    const order = sections.map(s => s.dataset.layoutId || s.id).filter(Boolean);
    localStorage.setItem(storageKey, JSON.stringify(order));
}

function setDraggableState(enabled) {
    document.querySelectorAll('.card').forEach(el => {
        if (enabled) {
            el.setAttribute('draggable', 'true');
            el.classList.add('draggable');
            if (!el.querySelector('.drag-handle')) {
                const handle = document.createElement('div');
                handle.className = 'drag-handle';
                handle.textContent = '⋮';
                el.appendChild(handle);
            }
        } else {
            el.removeAttribute('draggable');
            el.classList.remove('draggable');
            const h = el.querySelector('.drag-handle');
            if (h) h.remove();
        }
    });
}

// Drag & drop – en handler per container så att ordning sparas per sida
let draggedEl = null;
let currentDragContainer = null;

function setupDragHandlersForContainer(container, storageKey) {
    if (!container || !storageKey) return;

    container.addEventListener('dragstart', (e) => {
        const el = e.target.closest('.card');
        if (!el || !container.contains(el)) return;
        draggedEl = el;
        currentDragContainer = container;
        e.dataTransfer.effectAllowed = 'move';
        try { e.dataTransfer.setData('text/plain', el.dataset.layoutId || el.id); } catch (err) {}
        el.classList.add('dragging');
    });

    container.addEventListener('dragend', () => {
        if (draggedEl) draggedEl.classList.remove('dragging');
        if (currentDragContainer && storageKey) saveLayoutOrder(currentDragContainer, storageKey);
        draggedEl = null;
        currentDragContainer = null;
    });

    container.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (!draggedEl || container !== currentDragContainer) return;
        const afterEl = getDragAfterElement(container, e.clientY);
        if (afterEl == null) {
            container.appendChild(draggedEl);
        } else {
            container.insertBefore(draggedEl, afterEl);
        }
    });

    container.addEventListener('drop', (e) => {
        e.preventDefault();
        saveLayoutOrder(container, storageKey);
    });
}

function setupAllDragHandlers() {
    const main = document.querySelector('.main-content');
    const banguide = document.querySelector('.banguide-content');
    const distance = document.querySelector('.distance-page-content');
    if (main) setupDragHandlersForContainer(main, LAYOUT_KEY_MAIN);
    if (banguide) setupDragHandlersForContainer(banguide, LAYOUT_KEY_BANGUIDE);
    if (distance) setupDragHandlersForContainer(distance, LAYOUT_KEY_DISTANCE);
}

function getDragAfterElement(container, y) {
    const draggableEls = [...container.querySelectorAll('.card:not(.dragging)')];
    let closest = { offset: Number.NEGATIVE_INFINITY, element: null };
    draggableEls.forEach(child => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        if (offset < 0 && offset > closest.offset) {
            closest = { offset, element: child };
        }
    });
    return closest.element;
}

let modalKeyHandler = null;

function openSettings() {
    createClubSettings();
    const modal = document.getElementById('settingsModal');
    if (!modal) return;
    modal.classList.add('active');
    // Focus first focusable in modal (first input or Spara button)
    requestAnimationFrame(() => {
        const focusable = modal.querySelector('input, button:not([disabled])');
        if (focusable) focusable.focus();
    });
    // Escape to close
    modalKeyHandler = (e) => {
        if (e.key === 'Escape') {
            closeSettings();
            document.removeEventListener('keydown', modalKeyHandler);
            modalKeyHandler = null;
        }
        // Keep Tab inside modal
        if (e.key !== 'Tab') return;
        const focusableList = modal.querySelectorAll('input, button:not([disabled])');
        if (focusableList.length === 0) return;
        const first = focusableList[0];
        const last = focusableList[focusableList.length - 1];
        if (e.shiftKey) {
            if (document.activeElement === first) {
                e.preventDefault();
                last.focus();
            }
        } else {
            if (document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
        }
    };
    document.addEventListener('keydown', modalKeyHandler);
}

function closeSettings() {
    const modal = document.getElementById('settingsModal');
    if (modal) modal.classList.remove('active');
    if (modalKeyHandler) {
        document.removeEventListener('keydown', modalKeyHandler);
        modalKeyHandler = null;
    }
}

function saveSettings() {
    const inputs = document.querySelectorAll('#clubList input');
    inputs.forEach(input => {
        const club = input.dataset.club;
        const field = input.dataset.field;
        if (club && state.clubs[club] && field) {
            state.clubs[club][field] = parseFloat(input.value) || 0;
        }
    });
    saveClubData();
    closeSettings();
    if (state.currentHole) {
        updateDistances();
    }
}

function addCustomClub() {
    const nameEl = document.getElementById('newClubName');
    const totalEl = document.getElementById('newClubTotal');
    const carryEl = document.getElementById('newClubCarry');
    const spreadEl = document.getElementById('newClubSpread');
    const msgEl = document.getElementById('addClubMessage');
    if (!nameEl || !totalEl || !carryEl) return;

    const name = nameEl.value.trim();
    const total = parseFloat(totalEl.value) || 0;
    const carry = parseFloat(carryEl.value) || 0;
    const spread = spreadEl ? (parseFloat(spreadEl.value) || 0) : 0;

    if (!name) {
        if (msgEl) { msgEl.textContent = 'Ange ett klubbnamn.'; msgEl.classList.add('error'); }
        return;
    }
    if (state.clubs[name]) {
        if (msgEl) { msgEl.textContent = 'En klubba med det namnet finns redan.'; msgEl.classList.add('error'); }
        return;
    }

    state.clubs[name] = { totalDistance: total, carryDistance: carry, spread };
    saveClubData();
    createClubSettings();
    populateClubSelect();

    nameEl.value = '';
    totalEl.value = '';
    carryEl.value = '';
    if (spreadEl) spreadEl.value = '';
    if (msgEl) {
        msgEl.textContent = 'Klubban är tillagd.';
        msgEl.classList.remove('error');
        setTimeout(() => { msgEl.textContent = ''; }, 3000);
    }
}

// Location Tracking
function startLocationTracking() {
    if (!navigator.geolocation) {
        alert('GPS stöds inte av din enhet');
        return;
    }
    
    state.watchId = navigator.geolocation.watchPosition(
        (position) => {
            state.userPosition = {
                lat: position.coords.latitude,
                lng: position.coords.longitude,
                altitude: position.coords.altitude || 0
            };
            if (state.currentHole) {
                // Fetch weather once when GPS becomes available and weather not yet loaded
                if (!state.weatherData) fetchWeather();
                updateDistances();
            }
        },
        (error) => {
            console.error('GPS error:', error);
            const distEl = document.getElementById('distanceToGreen');
            if (distEl) distEl.innerHTML = '<span class="loading">❌ GPS-fel. Kontrollera att plats är på.</span>';
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 5000 }
    );
}

// Hole Selection
function selectHole(holeNumber) {
    // Wrap around: 0 becomes 18, 19 becomes 1
    if (holeNumber < 1) holeNumber = 18;
    if (holeNumber > 18) holeNumber = 1;

    // Spara anteckningar för aktuellt hål innan vi byter
    const notesInput = document.getElementById('holeNotesInput');
    if (state.currentHole != null && notesInput) {
        const text = notesInput.value.trim();
        if (text) state.notes[state.currentHole] = text;
        else delete state.notes[state.currentHole];
        saveNotes();
    }
    
    state.currentHole = holeNumber;

    const holeEl = document.getElementById('distancePageHoleNumber');
    if (holeEl) holeEl.textContent = holeNumber;

    // Uppdatera green-formen direkt (från GeoJSON) så den syns från pos
    const holeDataForGreen = getHoleData(holeNumber);
    drawGreenShape(getGreenPolygon(holeDataForGreen), holeDataForGreen);
    
    // Uppdatera anteckningsrutan till det nya hålet (kortet finns på avståndssidan)
    const holeNotesNumber = document.getElementById('holeNotesHoleNumber');
    if (holeNotesNumber) holeNotesNumber.textContent = holeNumber;
    if (notesInput) notesInput.value = state.notes[holeNumber] || '';
    
    // Update UI: update hole number display with animation
    const holeNumberEl = document.getElementById('currentHoleNumber');
    if (holeNumberEl) {
        // Trigger slide animation
        holeNumberEl.classList.remove('slide-in');
        // Force reflow to restart animation
        void holeNumberEl.offsetWidth;
        holeNumberEl.classList.add('slide-in');
        
        // Update text after animation starts
        setTimeout(() => {
            holeNumberEl.textContent = holeNumber;
        }, 150);
    }
    
    // Show relevant sections (varje del är eget draggbart kort; clubRecommendation och windAdjustmentCard finns på avståndssidan)
    const windArrowCard = document.getElementById('windArrowCard');
    const conditionsCard = document.getElementById('conditionsImpactCard');
    const timerSec = document.getElementById('timerSection');
    if (windArrowCard) windArrowCard.style.display = 'block';
    if (conditionsCard) conditionsCard.style.display = 'block';
    if (timerSec) timerSec.style.display = 'block';

    // Update ideal time for this hole (15 min per hole)
    const idealMinutes = holeNumber * 15;
    const idealHours = Math.floor(idealMinutes / 60);
    const idealMins = idealMinutes % 60;
    const holeTimeEl = document.getElementById('holeTimeLimit');
    if (holeTimeEl) holeTimeEl.textContent = `${String(idealHours).padStart(2, '0')}:${String(idealMins).padStart(2, '0')}`;
    
    // Start timer on first hole if not already running
    if (!state.timerRunning && !state.timerStartTime) {
        startTimer();
    }
    
    // Reset pin position
    resetPinPosition();
    
    // Fetch weather
    fetchWeather();
    
    // Update distances och siktråd
    if (state.userPosition) {
        updateDistances();
    } else {
        updateAimCard();
    }

    updateBanguidePage();

    // Scroll banguide till toppen vid byte av hål (knapparna) så man slipper scrolla upp
    const pages = document.getElementById('pages');
    if (pages && pages.classList.contains('show-banguide')) {
        const banguideContent = document.querySelector('.banguide-content');
        if (banguideContent) banguideContent.scrollTop = 0;
    }
}

function resetPinPosition() {
    state.pinOffset = { x: 0, y: 0 };
    if (state.currentHole && state.userPosition) {
        updateDistances();
    }
}

// Timer Functions
function startTimer() {
    if (state.timerRunning) return;
    
    if (!state.timerStartTime) {
        state.timerStartTime = Date.now();
    }
    
    state.timerRunning = true;
    
    state.timerIntervalId = setInterval(updateTimerDisplay, 1000);
    updateTimerDisplay();
}

// Note: stop/reset timer functions removed — timer can only be started.

function updateTimerDisplay() {
    if (!state.timerStartTime) return;
    
    const elapsed = Math.floor((Date.now() - state.timerStartTime) / 1000);
    const hours = Math.floor(elapsed / 3600);
    const minutes = Math.floor((elapsed % 3600) / 60);
    
    const timeString = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    const elapsedEl = document.getElementById('elapsedTime');
    if (elapsedEl) {
        elapsedEl.textContent = timeString;
        // Idealtid för aktuellt hål = 15 min per hål
        const idealSeconds = (state.currentHole || 1) * 15 * 60;
        if (elapsed > idealSeconds) {
            elapsedEl.classList.add('timer-value-over-ideal');
        } else {
            elapsedEl.classList.remove('timer-value-over-ideal');
        }
    }
}

// Weather API – använd window.SLOTTS_WEATHER_PROXY för att dölja API-nyckel
async function fetchWeather() {
    if (!state.userPosition) return;

    setWeatherLoading(true);
    const url = typeof window !== 'undefined' && window.SLOTTS_WEATHER_PROXY
        ? `${window.SLOTTS_WEATHER_PROXY}?lat=${state.userPosition.lat}&lon=${state.userPosition.lng}`
        : `https://api.openweathermap.org/data/2.5/weather?lat=${state.userPosition.lat}&lon=${state.userPosition.lng}&appid=${WEATHER_API_KEY}&units=metric`;

    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Väder API: ${response.status} ${response.statusText}`);
        const data = await response.json();
        if (data.cod && data.cod >= 400) throw new Error(data.message || 'Väderfel');
        state.weatherData = data;
        updateWeatherDisplay();
    } catch (error) {
        log('Weather fetch error:', error);
        state.weatherData = null;
        showWeatherError();
    } finally {
        setWeatherLoading(false);
    }
}

function setWeatherLoading(loading) {
    state.weatherLoading = loading;
    const impactList = document.getElementById('impactList');
    const conditionsCard = document.getElementById('conditionsImpactCard');
    if (!conditionsCard) return;
    conditionsCard.style.display = 'block';
    if (!impactList) return;
    if (loading) {
        impactList.innerHTML = '<p class="impact-loading">Hämtar väder...</p>';
    }
}

function showWeatherError() {
    const conditionsCard = document.getElementById('conditionsImpactCard');
    const impactList = document.getElementById('impactList');
    if (conditionsCard) conditionsCard.style.display = 'block';
    if (impactList) impactList.innerHTML = '<p class="impact-loading">Kunde inte hämta väder</p>';
}

function updateWeatherDisplay() {
    const w = state.weatherData;
    if (!w || !w.main || !w.wind) return;

    const temp = Math.round(w.main.temp);
    const windSpeed = Math.round((w.wind.speed ?? 0) * 10) / 10;
    const windDir = getWindDirection(w.wind.deg ?? 0);
    const humidity = w.main.humidity ?? 0;
    const tempEl = document.getElementById('temperature');
    if (tempEl) tempEl.textContent = `${temp}°C`;
    const windEl = document.getElementById('windSpeed');
    if (windEl) windEl.textContent = `${windSpeed} m/s`;
    const windDirEl = document.getElementById('windDirection');
    if (windDirEl) windDirEl.textContent = windDir;
    const humEl = document.getElementById('humidity');
    if (humEl) humEl.textContent = `${humidity}%`;

    updateWindArrow();

    updateImpactDetails(
        calculateTemperatureAdjustment(w.main.temp),
        calculateWindAdjustment(0),
        calculateHumidityAdjustment(w.main.humidity),
        calculateElevationAdjustment(0),
        calculatePressureAdjustment(w.main.pressure ?? 1013)
    );
}

function getWindDirection(degrees) {
    const directions = ['N', 'NNÖ', 'NÖ', 'ÖNÖ', 'Ö', 'ÖSÖ', 'SÖ', 'SSÖ', 'S', 'SSV', 'SV', 'VSV', 'V', 'VNV', 'NV', 'NNV'];
    const index = Math.round(degrees / 22.5) % 16;
    return directions[index];
}

// Vindpil: roterar efter vindriktning (vind.deg = varifrån vinden blåser) och enhetens kompass
function updateWindArrow() {
    const block = document.getElementById('windArrowBlock');
    const needle = document.getElementById('windArrowNeedle');
    const fromEl = document.getElementById('windArrowFrom');
    if (!block || !needle) return;
    if (!state.weatherData || state.weatherData.wind == null) {
        block.style.display = 'none';
        return;
    }
    block.style.display = 'flex';
    addCompassPermissionButton();
    const windDeg = state.weatherData.wind.deg;
    const windDirText = getWindDirection(windDeg);
    if (fromEl) fromEl.textContent = `Vind från ${windDirText}`;
    // Pilen pekar mot vindriktning. Skärmens "upp" = var användaren tittar (deviceHeading).
    // Så rotation = windDeg - deviceHeading (så pilen pekar rätt i verkligheten).
    const heading = state.deviceHeading != null ? state.deviceHeading : 0;
    const rotation = windDeg - heading;
    needle.style.transform = `rotate(${rotation}deg)`;
}

let compassPermissionBtnAdded = false;

function setupDeviceOrientation() {
    if (typeof DeviceOrientationEvent === 'undefined') return;
    const handler = (e) => {
        if (e.alpha == null) return;
        let alpha = e.alpha;
        if (e.webkitCompassHeading != null) alpha = e.webkitCompassHeading;
        else if (alpha < 0) alpha = alpha + 360;
        state.deviceHeading = alpha;
        updateWindArrow();
    };
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
        return;
    }
    window.addEventListener('deviceorientation', handler, false);
}

// Pinch-zoom och pan (drag) på banguide-bilden
let banguideImageScale = 1;
let banguideImageTranslate = { x: 0, y: 0 };

function getTouchDistance(touches) {
    if (!touches || touches.length < 2) return 0;
    const a = touches[0];
    const b = touches[1];
    return Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
}

function getBanguideImageBounds(wrap, img) {
    const w = wrap.offsetWidth || 1;
    const h = wrap.offsetHeight || 1;
    const iw = img.offsetWidth || w;
    const ih = img.offsetHeight || h;
    const s = banguideImageScale;
    return {
        txMin: w / 2 - (iw * s) / 2,
        txMax: (iw * s) / 2 - w / 2,
        tyMin: h / 2 - (ih * s) / 2,
        tyMax: (ih * s) / 2 - h / 2
    };
}

function clampBanguideImageTranslate(wrap, img) {
    const b = getBanguideImageBounds(wrap, img);
    banguideImageTranslate.x = Math.max(b.txMin, Math.min(b.txMax, banguideImageTranslate.x));
    banguideImageTranslate.y = Math.max(b.tyMin, Math.min(b.tyMax, banguideImageTranslate.y));
}

function applyBanguideImageTransform(img, wrap) {
    if (!img) return;
    if (wrap) clampBanguideImageTranslate(wrap, img);
    img.style.transform = `translate(${banguideImageTranslate.x}px, ${banguideImageTranslate.y}px) scale(${banguideImageScale})`;
}

function setupBanguideImageZoom() {
    const wrap = document.querySelector('.banguide-image-wrap');
    const img = document.getElementById('banguideImage');
    if (!wrap || !img) return;
    let pinchStartDist = 0;
    let pinchStartScale = 1;
    let panStartX = 0, panStartY = 0, panStartTx = 0, panStartTy = 0;
    wrap.addEventListener('touchstart', (e) => {
        if (e.touches.length === 2) {
            pinchStartDist = getTouchDistance(e.touches);
            pinchStartScale = banguideImageScale;
        } else if (e.touches.length === 1) {
            panStartX = e.touches[0].clientX;
            panStartY = e.touches[0].clientY;
            panStartTx = banguideImageTranslate.x;
            panStartTy = banguideImageTranslate.y;
        }
    }, { passive: true });
    wrap.addEventListener('touchmove', (e) => {
        if (e.touches.length === 2) {
            e.preventDefault();
            const dist = getTouchDistance(e.touches);
            if (pinchStartDist > 0) {
                let scale = pinchStartScale * (dist / pinchStartDist);
                scale = Math.max(1, Math.min(4, scale));
                banguideImageScale = scale;
                if (scale <= 1) banguideImageTranslate = { x: 0, y: 0 };
                applyBanguideImageTransform(img, wrap);
            }
        } else if (e.touches.length === 1 && banguideImageScale > 1) {
            e.preventDefault();
            const dx = e.touches[0].clientX - panStartX;
            const dy = e.touches[0].clientY - panStartY;
            banguideImageTranslate.x = panStartTx + dx;
            banguideImageTranslate.y = panStartTy + dy;
            applyBanguideImageTransform(img, wrap);
        }
    }, { passive: false });
    wrap.addEventListener('touchend', (e) => {
        if (e.touches.length === 2) {
            panStartX = e.touches[0].clientX;
            panStartY = e.touches[0].clientY;
            panStartTx = banguideImageTranslate.x;
            panStartTy = banguideImageTranslate.y;
        }
        if (e.touches.length < 2) pinchStartDist = 0;
        if (e.touches.length < 1) {
            panStartX = 0;
            panStartY = 0;
        }
    }, { passive: true });
    wrap.addEventListener('touchcancel', () => {
        pinchStartDist = 0;
    }, { passive: true });

    // Mus: dra för att förflytta (pan)
    let mouseDown = false;
    let mouseStartX = 0, mouseStartY = 0, mouseStartTx = 0, mouseStartTy = 0;
    wrap.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        mouseDown = true;
        mouseStartX = e.clientX;
        mouseStartY = e.clientY;
        mouseStartTx = banguideImageTranslate.x;
        mouseStartTy = banguideImageTranslate.y;
    });
    wrap.addEventListener('mousemove', (e) => {
        if (!mouseDown || banguideImageScale <= 1) return;
        e.preventDefault();
        banguideImageTranslate.x = mouseStartTx + (e.clientX - mouseStartX);
        banguideImageTranslate.y = mouseStartTy + (e.clientY - mouseStartY);
        applyBanguideImageTransform(img, wrap);
    });
    wrap.addEventListener('mouseup', () => { mouseDown = false; });
    wrap.addEventListener('mouseleave', () => { mouseDown = false; });
}

// Banguide-sida: uppdatera hålnummer, bild och information om hålet
function updateBanguidePage() {
    const hole = state.currentHole || 1;
    const numEl = document.getElementById('banguideHoleNumber');
    const imgEl = document.getElementById('banguideImage');
    const previewNumEl = document.getElementById('banguidePreviewHoleNumber');
    const previewImgEl = document.getElementById('banguidePreviewImage');
    const expandBtnHoleEl = document.getElementById('banguideExpandBtnHole');
    const expandBtn = document.getElementById('banguideExpandBtn');
    const infoEl = document.getElementById('banguideInfo');
    if (numEl) numEl.textContent = hole;
    if (previewNumEl) previewNumEl.textContent = hole;
    if (expandBtnHoleEl) expandBtnHoleEl.textContent = hole;
    if (expandBtn) expandBtn.setAttribute('aria-label', `Öppna banguide för hål ${hole}`);
    if (imgEl) {
        imgEl.src = `img/s${hole}.jpeg`;
        imgEl.alt = `Hål ${hole}`;
        banguideImageScale = 1;
        banguideImageTranslate = { x: 0, y: 0 };
        imgEl.style.transform = '';
    }
    if (previewImgEl) {
        previewImgEl.src = `img/s${hole}.jpeg`;
        previewImgEl.alt = `Hål ${hole}`;
    }
    if (infoEl) {
        const info = HOLE_INFO[hole];
        const tee = state.selectedTee;
        if (info && info.lengths) {
            const lengthM = info.lengths[tee] != null ? info.lengths[tee] : info.lengths[50];
            infoEl.innerHTML = `
                <p><strong>Index:</strong> ${info.handicap} (svårighetsgrad 1–18)</p>
                <p><strong>Längd (tee ${tee}):</strong> ${lengthM} m</p>
                <p><strong>Par:</strong> ${info.par}</p>
                <p class="banguide-tee-select">
                    <span class="banguide-tee-label">Tee:</span>
                    ${TEE_IDS.map(t => `<button type="button" class="banguide-tee-btn ${t === tee ? 'active' : ''}" data-tee="${t}" aria-pressed="${t === tee}">${t}</button>`).join('')}
                </p>
            `;
            infoEl.querySelectorAll('.banguide-tee-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    state.selectedTee = Number(btn.dataset.tee);
                    updateBanguidePage();
                });
            });
        } else {
            infoEl.innerHTML = '<p>Information om hålet visas här.</p>';
        }
    }
}

function addCompassPermissionButton() {
    if (compassPermissionBtnAdded || typeof DeviceOrientationEvent === 'undefined' || typeof DeviceOrientationEvent.requestPermission !== 'function') return;
    const block = document.getElementById('windArrowBlock');
    if (!block || block.querySelector('.wind-arrow-permission-btn')) return;
    compassPermissionBtnAdded = true;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'wind-arrow-permission-btn';
    btn.textContent = 'Aktivera kompass';
    btn.addEventListener('click', () => {
        DeviceOrientationEvent.requestPermission()
            .then((p) => {
                if (p === 'granted') {
                    const handler = (e) => {
                        if (e.alpha == null) return;
                        let alpha = e.alpha;
                        if (e.webkitCompassHeading != null) alpha = e.webkitCompassHeading;
                        else if (alpha < 0) alpha = alpha + 360;
                        state.deviceHeading = alpha;
                        updateWindArrow();
                    };
                    window.addEventListener('deviceorientation', handler, false);
                    btn.remove();
                    updateWindArrow();
                }
            })
            .catch(() => {});
    });
    block.appendChild(btn);
}

// Distance Calculations
function updateDistances() {
    if (!state.currentHole || !state.userPosition) return;
    
    const holeData = getHoleData(state.currentHole);
    if (!holeData || holeData.length === 0) return;

    const greenPolygon = getGreenPolygon(holeData);
    const greenCenter = getGreenCenterPosition(holeData);
    const pinPosition = getPinPosition(holeData);

    // Avstånd till mitten på green (oförändrat av flaggposition)
    const distanceToGreenCenter = greenCenter
        ? calculateDistance(state.userPosition, greenCenter)
        : null;
    // Avstånd till pin (ändras när man flyttar flaggan)
    const distanceToPin = pinPosition
        ? calculateDistance(state.userPosition, pinPosition)
        : null;

    const distanceToFront = greenPolygon ? calculateDistanceToFrontEdge(state.userPosition, greenPolygon) : 0;
    const distanceToBack = greenPolygon ? calculateDistanceToBackEdge(state.userPosition, greenPolygon) : 0;
    const greenArea = greenPolygon ? calculatePolygonArea(greenPolygon) : 0;

    // Update UI: mitten på green = alltid greenens centrum
    const distEl = document.getElementById('distanceToGreen');
    const distToPinEl = document.getElementById('distanceToPin');
    const frontEl = document.getElementById('frontEdge');
    const backEl = document.getElementById('backEdge');
    if (distEl) {
        if (distanceToGreenCenter != null) {
            distEl.innerHTML = `<span style="font-size: 3rem;">${Math.round(distanceToGreenCenter)}</span> <span style="font-size: 1.5rem;">m</span>`;
        } else {
            distEl.innerHTML = '<span class="loading">📍 Hämtar position...</span>';
        }
    }
    if (distToPinEl) {
        distToPinEl.textContent = distanceToPin != null ? `${Math.round(distanceToPin)} m` : '–';
    }
    // Uppdatera förhandsvisning på huvudsidan
    const previewDist = document.getElementById('distancePreviewValue');
    const previewToPin = document.getElementById('distancePreviewToPin');
    const previewClub = document.getElementById('distancePreviewClub');
    if (previewDist) {
        previewDist.innerHTML = distanceToGreenCenter != null
            ? `<span class="distance-preview-number">${Math.round(distanceToGreenCenter)}</span> m`
            : '<span class="loading">📍 Hämtar position...</span>';
    }
    if (previewToPin) {
        previewToPin.textContent = distanceToPin != null ? `Till flaggan: ${Math.round(distanceToPin)} m` : 'Till flaggan: –';
    }
    if (frontEl) frontEl.textContent = `${Math.round(distanceToFront)} m`;
    if (backEl) backEl.textContent = `${Math.round(distanceToBack)} m`;

    drawGreenShape(greenPolygon, holeData);

    const elevation = calculateElevation(holeData, state.userPosition);
    // Rekommendera klubba från avstånd till pin (eller till mitten om pin saknas)
    const distanceForClub = distanceToPin != null ? distanceToPin : distanceToGreenCenter;
    if (distanceForClub != null) {
        recommendClub(distanceForClub, elevation);
    } else {
        updateAimCard();
        updateClubDistanceDisplay();
    }
}

function getHoleData(holeNumber) {
    if (!GOLF_COURSE_DATA || !GOLF_COURSE_DATA.features) return [];
    return GOLF_COURSE_DATA.features.filter(f =>
        f.properties.hole === holeNumber
    );
}

function getPinPosition(holeData) {
    const pin = holeData.find(f => f.properties.type === 'pin');
    if (!pin) return null;

    const [lng, lat] = pin.geometry.coordinates;
    const pos = holeData ? getPosPosition(holeData) : null;

    if (!pos) {
        // Ingen pos i GeoJSON: använd geografisk offset (nord/syd, öst/väst)
        const offsetLat = lat + (state.pinOffset.y / 111320);
        const offsetLng = lng + (state.pinOffset.x / (111320 * Math.cos(lat * Math.PI / 180)));
        return { lat: offsetLat, lng: offsetLng };
    }

    // Offset relativt pos: Fram/Bak = mot pos (y), Vänster/höger = vänster/höger sett från pos (x)
    const mPerDegLat = 111320;
    const mPerDegLon = 111320 * Math.cos(lat * Math.PI / 180);
    // Riktning från pin mot pos (i meter: öst, nord)
    const towardEast = (pos.lng - lng) * mPerDegLon;
    const towardNorth = (pos.lat - lat) * mPerDegLat;
    const distToward = Math.hypot(towardEast, towardNorth) || 1e-10;
    const towardUnitEast = towardEast / distToward;
    const towardUnitNorth = towardNorth / distToward;
    // Vänster = 90° moturs från (pos -> pin). Pos->pin i meter: (pin - pos)
    const posToPinEast = (lng - pos.lng) * (111320 * Math.cos(pos.lat * Math.PI / 180));
    const posToPinNorth = (lat - pos.lat) * mPerDegLat;
    const leftEast = -posToPinNorth;
    const leftNorth = posToPinEast;
    const distLeft = Math.hypot(leftEast, leftNorth) || 1e-10;
    const leftUnitEast = leftEast / distLeft;
    const leftUnitNorth = leftNorth / distLeft;
    // Offset: pinOffset.y = meter mot pos (Fram), pinOffset.x = meter vänster (Vänster)
    const offsetEast = state.pinOffset.y * towardUnitEast + state.pinOffset.x * leftUnitEast;
    const offsetNorth = state.pinOffset.y * towardUnitNorth + state.pinOffset.x * leftUnitNorth;
    const offsetLat = offsetNorth / mPerDegLat;
    const offsetLng = offsetEast / mPerDegLon;
    return { lat: lat + offsetLat, lng: lng + offsetLng };
}

function getGreenPolygon(holeData) {
    const green = holeData.find(f => f.properties.type === 'green');
    if (!green) return null;
    
    return green.geometry.coordinates[0].map(coord => ({
        lng: coord[0],
        lat: coord[1]
    }));
}

function getGreenCenterPosition(holeData) {
    const polygon = getGreenPolygon(holeData);
    if (!polygon || polygon.length === 0) return null;
    const sumLng = polygon.reduce((s, p) => s + p.lng, 0);
    const sumLat = polygon.reduce((s, p) => s + p.lat, 0);
    return { lng: sumLng / polygon.length, lat: sumLat / polygon.length };
}

function getPosPosition(holeData) {
    const pos = holeData.find(f => f.properties && f.properties.type === 'pos');
    if (!pos || !pos.geometry || pos.geometry.coordinates == null) return null;
    const [lng, lat] = pos.geometry.coordinates;
    return { lng, lat };
}

// Rita greenens form från GeoJSON, som den ser ut från positionen pos (t.ex. tee)
function drawGreenShape(greenPolygon, holeData) {
    const svg = document.getElementById('greenShapeSvg');
    const wrap = document.getElementById('greenShapeWrap');
    if (!svg || !wrap) return;

    if (!greenPolygon || greenPolygon.length < 3) {
        svg.innerHTML = '';
        wrap.classList.remove('has-shape');
        return;
    }

    const pos = holeData ? getPosPosition(holeData) : null;
    const pad = 4;
    const w = 100 - 2 * pad;
    const h = 60 - 2 * pad;

    let points;
    let pinSx, pinSy;

    if (pos) {
        // Koordinater i meter relativt pos
        const mPerDegLat = 111320;
        const mPerDegLon = 111320 * Math.cos(pos.lat * Math.PI / 180);
        const toMeters = (p) => ({
            x: (p.lng - pos.lng) * mPerDegLon,
            y: (p.lat - pos.lat) * mPerDegLat
        });
        const meters = greenPolygon.map(toMeters);
        const cx = meters.reduce((s, p) => s + p.x, 0) / meters.length;
        const cy = meters.reduce((s, p) => s + p.y, 0) / meters.length;
        const angle = Math.atan2(cy, cx);
        // Vänd greenen 180° jämfört med fågelperspektivet ovan
        const rot = -angle - Math.PI / 2 + Math.PI;
        const cos = Math.cos(rot), sin = Math.sin(rot);
        const rotated = meters.map(p => ({
            x: p.x * cos - p.y * sin,
            y: -(p.x * sin + p.y * cos)
        }));
        const rx = rotated.map(p => p.x), ry = rotated.map(p => p.y);
        const minX = Math.min(...rx), maxX = Math.max(...rx);
        const minY = Math.min(...ry), maxY = Math.max(...ry);
        const rangeX = maxX - minX || 1e-6;
        const rangeY = maxY - minY || 1e-6;
        points = rotated.map(p => {
            const sx = pad + ((p.x - minX) / rangeX) * w;
            const sy = pad + ((p.y - minY) / rangeY) * h;
            return `${sx.toFixed(2)},${sy.toFixed(2)}`;
        }).join(' ');
        // Pin-position i SVG (samma koordinatsystem som greenen)
        const pinPos = getPinPosition(holeData);
        const pinM = pinPos ? toMeters(pinPos) : { x: cx + state.pinOffset.x, y: cy + state.pinOffset.y };
        const pinRot = {
            x: pinM.x * cos - pinM.y * sin,
            y: -(pinM.x * sin + pinM.y * cos)
        };
        pinSx = pad + ((pinRot.x - minX) / rangeX) * w;
        pinSy = pad + ((pinRot.y - minY) / rangeY) * h;
        // Spara konverteringsdata för drag av flaggan (SVG-koordinater -> pinOffset i meter)
        const pinFeature = holeData.find(f => f.properties && f.properties.type === 'pin');
        if (pinFeature && pinFeature.geometry && pinFeature.geometry.coordinates) {
            const [pinLng, pinLat] = pinFeature.geometry.coordinates;
            const towardEast = (pos.lng - pinLng) * mPerDegLon;
            const towardNorth = (pos.lat - pinLat) * mPerDegLat;
            const dist = Math.hypot(towardEast, towardNorth) || 1e-10;
            const towardUnitEast = towardEast / dist;
            const towardUnitNorth = towardNorth / dist;
            const leftUnitEast = -towardUnitNorth;
            const leftUnitNorth = towardUnitEast;
            // Gränser för greenen i SVG-koordinater – flaggan ska bara kunna placeras innanför
            const sxs = rotated.map(p => pad + ((p.x - minX) / rangeX) * w);
            const sys = rotated.map(p => pad + ((p.y - minY) / rangeY) * h);
            const greenMinSx = Math.min(...sxs);
            const greenMaxSx = Math.max(...sxs);
            const greenMinSy = Math.min(...sys);
            const greenMaxSy = Math.max(...sys);
            const centerSx = pad + ((minX + maxX) / 2 - minX) / rangeX * w;
            const centerSy = pad + ((minY + maxY) / 2 - minY) / rangeY * h;
            wrap._greenDragData = {
                minX, maxX, minY, maxY, rangeX, rangeY, pad, w, h, cos, sin, cx, cy,
                towardUnitEast, towardUnitNorth, leftUnitEast, leftUnitNorth,
                greenMinSx, greenMaxSx, greenMinSy, greenMaxSy,
                centerSx, centerSy
            };
        } else {
            wrap._greenDragData = null;
        }
    } else {
        const lngs = greenPolygon.map(p => p.lng);
        const lats = greenPolygon.map(p => p.lat);
        const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
        const minLat = Math.min(...lats), maxLat = Math.max(...lats);
        const rangeLng = maxLng - minLng || 1e-6;
        const rangeLat = maxLat - minLat || 1e-6;
        points = greenPolygon.map(p => {
            const x = pad + ((p.lng - minLng) / rangeLng) * w;
            const y = pad + ((maxLat - p.lat) / rangeLat) * h;
            return `${x.toFixed(2)},${y.toFixed(2)}`;
        }).join(' ');
        const centerLng = (minLng + maxLng) / 2;
        const centerLat = (minLat + maxLat) / 2;
        const pinLng = centerLng + state.pinOffset.x / (111320 * Math.cos(centerLat * Math.PI / 180));
        const pinLat = centerLat + state.pinOffset.y / 111320;
        pinSx = pad + ((pinLng - minLng) / rangeLng) * w;
        pinSy = pad + ((maxLat - pinLat) / rangeLat) * h;
        wrap._greenDragData = null;
    }

    const poleH = 12;
    const flagW = 6;
    const flagPath = `M ${pinSx} ${pinSy - poleH} L ${pinSx + flagW} ${pinSy - poleH + 2} L ${pinSx} ${pinSy - poleH + 4} Z`;
    const pinMarkup = (pinSx != null && pinSy != null) ? `
      <g class="green-pin-flag" aria-label="Pin">
        <line x1="${pinSx}" y1="${pinSy}" x2="${pinSx}" y2="${pinSy - poleH}" stroke="var(--primary-dark)" stroke-width="1.2"/>
        <path d="${flagPath}" fill="var(--primary)" stroke="var(--primary-dark)" stroke-width="0.8"/>
        <circle cx="${pinSx}" cy="${pinSy}" r="2" fill="var(--primary-dark)"/>
      </g>
    ` : '';

    const filterId = 'greenSoftEdge';
    svg.innerHTML = `
      <defs>
        <filter id="${filterId}" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="0.6" />
        </filter>
      </defs>
      <polygon class="green-shape-polygon" points="${points}" fill="var(--primary-light)" stroke="var(--primary-dark)" stroke-width="1.5" filter="url(#${filterId})" />
      ${pinMarkup}
    `;
    wrap.classList.add('has-shape');
}

// Konvertera (pinSx, pinSy) i SVG-koordinater till pinOffset (meter) med sparad drag-data
function greenSvgToPinOffset(pinSx, pinSy, data) {
    if (!data) return null;
    const { minX, minY, rangeX, rangeY, pad, w, h, cos, sin, cx, cy, towardUnitEast, towardUnitNorth, leftUnitEast, leftUnitNorth, greenMinSx, greenMaxSx, greenMinSy, greenMaxSy } = data;
    // Begränsa till greenens område – flaggan ska bara kunna placeras innanför
    const clampedSx = Math.max(greenMinSx, Math.min(greenMaxSx, pinSx));
    const clampedSy = Math.max(greenMinSy, Math.min(greenMaxSy, pinSy));
    const pinRotX = minX + ((clampedSx - pad) / w) * rangeX;
    const pinRotY = minY + ((clampedSy - pad) / h) * rangeY;
    const pinMx = cos * pinRotX - sin * pinRotY;
    const pinMy = -sin * pinRotX - cos * pinRotY;
    const offsetEast = pinMx - cx;
    const offsetNorth = pinMy - cy;
    const pinOffsetX = offsetEast * leftUnitEast + offsetNorth * leftUnitNorth;
    const pinOffsetY = offsetEast * towardUnitEast + offsetNorth * towardUnitNorth;
    // Invertera X: SVG x ökar åt höger, men pinOffset.x positiv = vänster; koordinatsystemen är speglade
    return { x: -pinOffsetX, y: pinOffsetY };
}

function setupGreenPinDrag() {
    const wrap = document.getElementById('greenShapeWrap');
    const svg = document.getElementById('greenShapeSvg');
    const ring = document.getElementById('pinDragRing');
    if (!wrap || !svg || !ring) return;

    let dragging = false;
    let dragStarted = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let startPinOffsetX = 0;
    let startPinOffsetY = 0;
    let startVirtualPinOffsetX = 0;
    let startVirtualPinOffsetY = 0;
    const DRAG_START_THRESHOLD_PX = 8;

    function getClientCoords(e) {
        if (e.touches && e.touches.length > 0) {
            return { clientX: e.touches[0].clientX, clientY: e.touches[0].clientY };
        }
        return { clientX: e.clientX, clientY: e.clientY };
    }

    // Virtuell pekpunkt på greenen: greenens centrum + finger-delta (så att ringen kan ligga under greenen)
    function getPinOffsetFromFingerDelta(clientX, clientY) {
        const data = wrap._greenDragData;
        if (!data || data.centerSx == null || data.centerSy == null) return null;
        const anchorPt = svg.createSVGPoint();
        anchorPt.x = data.centerSx;
        anchorPt.y = data.centerSy;
        const anchorScreen = anchorPt.matrixTransform(svg.getScreenCTM());
        const dxScreen = clientX - dragStartX;
        const dyScreen = clientY - dragStartY;
        const virtualPt = svg.createSVGPoint();
        virtualPt.x = anchorScreen.x + dxScreen;
        virtualPt.y = anchorScreen.y + dyScreen;
        const svgPt = virtualPt.matrixTransform(svg.getScreenCTM().inverse());
        return greenSvgToPinOffset(svgPt.x, svgPt.y, data);
    }

    function applyPinOffsetFromDelta(clientX, clientY) {
        const current = getPinOffsetFromFingerDelta(clientX, clientY);
        if (current == null) return;
        state.pinOffset.x = startPinOffsetX + (current.x - startVirtualPinOffsetX);
        state.pinOffset.y = startPinOffsetY + (current.y - startVirtualPinOffsetY);
        updateDistances();
    }

    ring.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1 && wrap._greenDragData) {
            const { clientX, clientY } = getClientCoords(e);
            dragging = true;
            dragStarted = false;
            dragStartX = clientX;
            dragStartY = clientY;
            e.preventDefault();
        }
    }, { passive: false });

    ring.addEventListener('touchmove', (e) => {
        if (dragging && e.touches.length === 1) {
            e.preventDefault();
            const { clientX, clientY } = getClientCoords(e);
            const dx = clientX - dragStartX;
            const dy = clientY - dragStartY;
            if (!dragStarted) {
                if (Math.hypot(dx, dy) < DRAG_START_THRESHOLD_PX) {
                    return;
                }
                dragStarted = true;
                startPinOffsetX = state.pinOffset.x;
                startPinOffsetY = state.pinOffset.y;
                const startVirtual = getPinOffsetFromFingerDelta(dragStartX, dragStartY);
                if (startVirtual) {
                    startVirtualPinOffsetX = startVirtual.x;
                    startVirtualPinOffsetY = startVirtual.y;
                } else {
                    startVirtualPinOffsetX = startPinOffsetX;
                    startVirtualPinOffsetY = startPinOffsetY;
                }
            }
            applyPinOffsetFromDelta(clientX, clientY);
        }
    }, { passive: false });

    ring.addEventListener('touchend', (e) => {
        if (e.touches.length === 0) {
            dragging = false;
            dragStarted = false;
        }
    }, { passive: true });

    ring.addEventListener('touchcancel', () => {
        dragging = false;
        dragStarted = false;
    }, { passive: true });

    ring.addEventListener('mousedown', (e) => {
        if (e.button === 0 && wrap._greenDragData) {
            dragging = true;
            dragStarted = false;
            dragStartX = e.clientX;
            dragStartY = e.clientY;
            e.preventDefault();
        }
    });

    document.addEventListener('mousemove', (e) => {
        if (dragging && e.buttons === 1) {
            const dx = e.clientX - dragStartX;
            const dy = e.clientY - dragStartY;
            if (!dragStarted) {
                if (Math.hypot(dx, dy) < DRAG_START_THRESHOLD_PX) {
                    return;
                }
                dragStarted = true;
                startPinOffsetX = state.pinOffset.x;
                startPinOffsetY = state.pinOffset.y;
                const startVirtual = getPinOffsetFromFingerDelta(dragStartX, dragStartY);
                if (startVirtual) {
                    startVirtualPinOffsetX = startVirtual.x;
                    startVirtualPinOffsetY = startVirtual.y;
                } else {
                    startVirtualPinOffsetX = startPinOffsetX;
                    startVirtualPinOffsetY = startPinOffsetY;
                }
            }
            applyPinOffsetFromDelta(e.clientX, e.clientY);
        }
    });

    document.addEventListener('mouseup', (e) => {
        if (e.button === 0) {
            dragging = false;
            dragStarted = false;
        }
    });

    ring.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        ring.click();
    });
}

// Calculate polygon area in square meters using planar projection (sufficient for small areas like greens)
function calculatePolygonArea(polygon) {
    if (!polygon || polygon.length < 3) return 0;
    // average latitude for longitude scaling
    const avgLat = polygon.reduce((s, p) => s + p.lat, 0) / polygon.length;
    const metersPerDegLat = 111320; // approx meters per degree latitude
    const metersPerDegLon = 111320 * Math.cos(avgLat * Math.PI / 180);

    const pts = polygon.map(p => ({ x: p.lng * metersPerDegLon, y: p.lat * metersPerDegLat }));

    let sum = 0;
    for (let i = 0; i < pts.length; i++) {
        const j = (i + 1) % pts.length;
        sum += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
    }
    return Math.abs(sum) / 2; // square meters
}

function calculateDistance(pos1, pos2) {
    const R = 6371e3; // Earth's radius in meters
    const φ1 = pos1.lat * Math.PI / 180;
    const φ2 = pos2.lat * Math.PI / 180;
    const Δφ = (pos2.lat - pos1.lat) * Math.PI / 180;
    const Δλ = (pos2.lng - pos1.lng) * Math.PI / 180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c;
}

function calculateDistanceToFrontEdge(userPos, polygon) {
    if (!polygon) return 0;
    let minDistance = Infinity;
    
    polygon.forEach(point => {
        const dist = calculateDistance(userPos, point);
        if (dist < minDistance) {
            minDistance = dist;
        }
    });
    
    return minDistance;
}

function calculateDistanceToBackEdge(userPos, polygon) {
    if (!polygon) return 0;
    let maxDistance = 0;
    
    polygon.forEach(point => {
        const dist = calculateDistance(userPos, point);
        if (dist > maxDistance) {
            maxDistance = dist;
        }
    });
    
    return maxDistance;
}

function calculateElevation(holeData, userPos) {
    // Simplified elevation - in production, use elevation API
    return 0; // Placeholder
}

// Club Recommendation
function recommendClub(distance, elevation) {
    if (!state.weatherData) {
        updateAimCard();
        updateClubDistanceDisplay();
        const adjEl = document.getElementById('clubRecommendedAdjusted');
        if (adjEl) adjEl.style.display = 'none';
        const previewClubEl = document.getElementById('distancePreviewClub');
        if (previewClubEl) previewClubEl.textContent = 'Klubba: Väntar på väder…';
        return;
    }
    
    // Calculate adjustments
    const tempAdjustment = calculateTemperatureAdjustment(state.weatherData.main.temp);
    const windAdjustment = calculateWindAdjustment(distance);
    const humidityAdjustment = calculateHumidityAdjustment(state.weatherData.main.humidity);
    const elevationAdjustment = calculateElevationAdjustment(elevation);
    const pressureAdjustment = calculatePressureAdjustment(state.weatherData.main.pressure);
    
    const totalAdjustment = tempAdjustment + windAdjustment + humidityAdjustment + 
                           elevationAdjustment + pressureAdjustment;
    
    const adjustedDistance = distance - totalAdjustment;
    
    // Find best club
    let bestClub = null;
    let minDiff = Infinity;
    
    Object.entries(state.clubs).forEach(([name, data]) => {
        if (data.totalDistance === 0) return;
        const diff = Math.abs(data.totalDistance - adjustedDistance);
        if (diff < minDiff) {
            minDiff = diff;
            bestClub = { name, ...data };
        }
    });
    
    if (bestClub) {
        const clubNameEl = document.querySelector('.club-name');
        const clubDistEl = document.querySelector('.club-distance');
        if (clubNameEl) clubNameEl.textContent = bestClub.name;
        const spreadStr = (bestClub.spread != null && bestClub.spread > 0) ? ` ±${Math.round(bestClub.spread)} m` : '';
        if (clubDistEl) clubDistEl.textContent =
            `Normalt: ${Math.round(bestClub.totalDistance)} m (${Math.round(bestClub.carryDistance)} m carry)${spreadStr}`;
        const adjEl = document.getElementById('clubRecommendedAdjusted');
        if (adjEl) {
            const todayM = Math.round(bestClub.totalDistance + totalAdjustment);
            adjEl.textContent = `Idag (väder + höjd): ${todayM} m`;
            adjEl.style.display = '';
        }
        const previewClubEl = document.getElementById('distancePreviewClub');
        if (previewClubEl) previewClubEl.textContent = `Klubba: ${bestClub.name}`;
    } else {
        const clubNameEl = document.querySelector('.club-name');
        const clubDistEl = document.querySelector('.club-distance');
        if (clubNameEl) clubNameEl.textContent = 'Ställ in klubbor';
        if (clubDistEl) clubDistEl.textContent = 'Gå till inställningar';
        const adjEl = document.getElementById('clubRecommendedAdjusted');
        if (adjEl) adjEl.style.display = 'none';
        const previewClubEl = document.getElementById('distancePreviewClub');
        if (previewClubEl) previewClubEl.textContent = 'Klubba: –';
    }
    
    // Siktråd: vind, höjd, lufttryck, avstånd
    updateAimCard(distance, elevation, tempAdjustment, windAdjustment, humidityAdjustment, elevationAdjustment, pressureAdjustment);
    
    // Show impact details
    updateImpactDetails(tempAdjustment, windAdjustment, humidityAdjustment, 
                       elevationAdjustment, pressureAdjustment);

    updateClubDistanceDisplay(totalAdjustment);
}

function populateClubSelect() {
    const sel = document.getElementById('clubSelect');
    if (!sel) return;
    const currentVal = sel.value;
    sel.innerHTML = '';
    const names = Object.keys(state.clubs).sort((a, b) => {
        const ia = CLUBS.indexOf(a), ib = CLUBS.indexOf(b);
        if (ia >= 0 && ib >= 0) return ia - ib;
        if (ia >= 0) return -1;
        if (ib >= 0) return 1;
        return a.localeCompare(b);
    });
    names.forEach(name => {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        sel.appendChild(opt);
    });
    if (state.clubs[currentVal]) sel.value = currentVal;
    updateClubDistanceDisplay();
}

function updateClubDistanceDisplay(totalAdjustmentFromRecommend) {
    const sel = document.getElementById('clubSelect');
    const normEl = document.getElementById('clubNormalDist');
    const adjEl = document.getElementById('clubAdjustedDist');
    if (!sel || !normEl || !adjEl) return;
    const clubName = sel.value;
    const clubData = state.clubs[clubName];
    if (!clubData) {
        normEl.textContent = 'Normalt: – m';
        adjEl.textContent = 'Idag (väder + höjd): – m';
        return;
    }
    const normal = Math.round(clubData.totalDistance);
    const spreadStr = (clubData.spread != null && clubData.spread > 0) ? ` ±${Math.round(clubData.spread)} m` : '';
    normEl.textContent = `Normalt: ${normal} m${spreadStr}`;
    let totalAdj = totalAdjustmentFromRecommend;
    if (totalAdj == null && state.weatherData && state.userPosition && state.currentHole) {
        const holeData = getHoleData(state.currentHole);
        const pinPos = getPinPosition(holeData);
        if (holeData && pinPos) {
            const dist = calculateDistance(state.userPosition, pinPos);
            const elev = calculateElevation(holeData, state.userPosition);
            totalAdj = calculateTemperatureAdjustment(state.weatherData.main.temp)
                + calculateWindAdjustment(dist)
                + calculateHumidityAdjustment(state.weatherData.main.humidity)
                + calculateElevationAdjustment(elev)
                + calculatePressureAdjustment(state.weatherData.main.pressure);
        }
    }
    if (totalAdj != null) {
        const today = Math.round(clubData.totalDistance + totalAdj);
        adjEl.textContent = `Idag (väder + höjd): ${today} m`;
    } else {
        adjEl.textContent = 'Idag (väder + höjd): – m';
    }
}

function calculateTemperatureAdjustment(temp) {
    // ~1m per 5°C above/below 20°C
    const baseTemp = 20;
    return (temp - baseTemp) * 0.2;
}

// Vind på avstånd: beroende på riktning (med-/motvind), styrka och avstånd (längre slag = mer påverkan)
function calculateWindAdjustment(distance) {
    if (!state.weatherData || !state.userPosition) return 0;
    
    const windSpeed = state.weatherData.wind.speed; // m/s
    const windDeg = state.weatherData.wind.deg;
    
    const holeData = getHoleData(state.currentHole);
    const pinPos = getPinPosition(holeData);
    if (!pinPos) return 0;
    
    const bearing = calculateBearing(state.userPosition, pinPos);
    const windEffect = Math.cos((windDeg - bearing) * Math.PI / 180); // 1 = motvind, -1 = medvind
    
    // Längre slag = mer tid i luften = större vindpåverkan. Bas ~2 m per m/s, ökar med avstånd
    const distanceFactor = 2 * (1 + Math.min(distance, 250) / 150);
    return -windSpeed * windEffect * distanceFactor; // motvind negativ, medvind positiv
}

// Returnerar vindtyp för visning (medvind/motvind/ingen)
function getWindDistanceType() {
    if (!state.weatherData || !state.userPosition) return 'ingen';
    const holeData = getHoleData(state.currentHole);
    const pinPos = getPinPosition(holeData);
    if (!pinPos) return 'ingen';
    const bearing = calculateBearing(state.userPosition, pinPos);
    const windEffect = Math.cos((state.weatherData.wind.deg - bearing) * Math.PI / 180);
    if (windEffect > 0.2) return 'motvind';
    if (windEffect < -0.2) return 'medvind';
    return 'ingen';
}

function calculateHumidityAdjustment(humidity) {
    // High humidity slightly increases distance
    return (humidity - 50) * 0.05;
}

function calculateElevationAdjustment(elevation) {
    // ~1m per 1m elevation difference
    return elevation * 1.0;
}

function calculatePressureAdjustment(pressure) {
    // Standard pressure is 1013 hPa
    // ~1m per 10 hPa difference
    return (1013 - pressure) * 0.1;
}

function calculateBearing(pos1, pos2) {
    const φ1 = pos1.lat * Math.PI / 180;
    const φ2 = pos2.lat * Math.PI / 180;
    const Δλ = (pos2.lng - pos1.lng) * Math.PI / 180;
    
    const y = Math.sin(Δλ) * Math.cos(φ2);
    const x = Math.cos(φ1) * Math.sin(φ2) -
              Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
    const θ = Math.atan2(y, x);
    
    return (θ * 180 / Math.PI + 360) % 360;
}

// Knappen "Uppdatera position och siktråd" – hämtar ny position och uppdaterar siktråden
function refreshAimPosition() {
    const btn = document.getElementById('updateAimBtn');
    const aimWaiting = document.getElementById('aimWaiting');
    const aimList = document.getElementById('aimList');
    if (!navigator.geolocation) {
        if (aimWaiting) {
            aimWaiting.style.display = 'block';
            aimWaiting.textContent = 'GPS stöds inte på denna enhet.';
            if (aimList) aimList.style.display = 'none';
        }
        return;
    }
    const originalText = btn ? btn.textContent : '';
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Uppdaterar…';
    }
    if (aimWaiting) {
        aimWaiting.style.display = 'block';
        aimWaiting.textContent = 'Hämtar ny position…';
        if (aimList) aimList.style.display = 'none';
    }
    navigator.geolocation.getCurrentPosition(
        (position) => {
            state.userPosition = {
                lat: position.coords.latitude,
                lng: position.coords.longitude,
                altitude: position.coords.altitude || 0
            };
            if (!state.weatherData) fetchWeather();
            updateDistances();
            if (btn) {
                btn.disabled = false;
                btn.textContent = originalText;
            }
        },
        (error) => {
            if (aimWaiting) {
                aimWaiting.style.display = 'block';
                aimWaiting.textContent = 'Kunde inte hämta position. Kontrollera att plats är på.';
                if (aimList) aimList.style.display = 'none';
            }
            if (btn) {
                btn.disabled = false;
                btn.textContent = originalText;
            }
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
    );
}

// Uppdaterar "Vart ska jag sikta?" med siktråd utifrån vind, höjd, lufttryck och avstånd
function updateAimCard(distanceToPin, elevation, tempAdj, windAdj, humidityAdj, elevationAdj, pressureAdj) {
    const aimWaiting = document.getElementById('aimWaiting');
    const aimList = document.getElementById('aimList');
    if (!aimWaiting || !aimList) return;

    if (!state.userPosition) {
        aimWaiting.style.display = 'block';
        aimWaiting.textContent = 'Väntar på GPS-position…';
        aimList.innerHTML = '';
        aimList.style.display = 'none';
        return;
    }
    if (!state.weatherData) {
        aimWaiting.style.display = 'block';
        aimWaiting.textContent = 'Väntar på väderdata…';
        aimList.innerHTML = '';
        aimList.style.display = 'none';
        return;
    }

    const holeData = getHoleData(state.currentHole);
    const pinPos = getPinPosition(holeData);
    if (!pinPos) {
        aimWaiting.style.display = 'block';
        aimWaiting.textContent = 'Välj hål för siktråd.';
        aimList.innerHTML = '';
        aimList.style.display = 'none';
        return;
    }

    aimWaiting.style.display = 'none';
    aimList.style.display = 'block';
    aimList.innerHTML = '';

    const bearing = calculateBearing(state.userPosition, pinPos);
    const windDeg = state.weatherData.wind.deg;
    const windSpeed = state.weatherData.wind.speed;

    // Sidovind – antal meter att sikta åt sidan beror på vald klubba: längre klubba = längre bollflykt = mer drift
    const clubSel = document.getElementById('clubSelect');
    const clubName = clubSel ? clubSel.value : null;
    const clubData = clubName && state.clubs[clubName] ? state.clubs[clubName] : null;
    const clubDistance = clubData && typeof clubData.totalDistance === 'number' && clubData.totalDistance > 0
        ? clubData.totalDistance
        : distanceToPin; // fallback till avstånd till pin om ingen klubba vald
    const distanceFactor = 2 * (1 + Math.min(clubDistance, 250) / 100);
    const crossWind = Math.sin((windDeg - bearing) * Math.PI / 180) * windSpeed; // m/s sidovind
    const aimMeters = Math.round(Math.abs(crossWind) * distanceFactor);
    const clubLabel = clubName ? ` för ${clubName}` : '';
    if (aimMeters >= 1) {
        const direction = crossWind > 0 ? 'höger' : 'vänster';
        addAimItem(aimList, 'Vind (sidovind)', `Sikta ${aimMeters} m till ${direction} om flaggan${clubLabel} (vind ${windSpeed.toFixed(1)} m/s)`);
    } else {
        addAimItem(aimList, 'Vind (sidovind)', 'Ingen sidovind – sikta rakt på flaggan');
    }

    // Höjdskillnad (uppförsbacke = slå längre = sikta kort)
    const elevM = Math.round(Math.abs(elevationAdj));
    if (elevM >= 1) {
        if (elevationAdj > 0) {
            addAimItem(aimList, 'Höjdskillnad', `Sikta ${elevM} m kort (uppförsbacke)`);
        } else {
            addAimItem(aimList, 'Höjdskillnad', `Sikta ${elevM} m längre (nedförsbacke)`);
        }
    } else {
        addAimItem(aimList, 'Höjdskillnad', 'Ingen höjdskillnad');
    }

    // Lufttryck
    const pressM = Math.round(Math.abs(pressureAdj));
    if (pressM >= 1) {
        if (pressureAdj > 0) {
            addAimItem(aimList, 'Lufttryck', `Sikta ${pressM} m längre (lägre tryck)`);
        } else {
            addAimItem(aimList, 'Lufttryck', `Sikta ${pressM} m kort (högre tryck)`);
        }
    } else {
        addAimItem(aimList, 'Lufttryck', 'Ingen påverkan');
    }

    // Totalt avstånd: förhållanden gör att bollen går totalAdj m längre (+) eller kortare (-).
    // Om bollen går kortare ska man ta en klubba som går längre än normalt, och tvärtom.
    const totalAdj = (tempAdj || 0) + (windAdj || 0) + (humidityAdj || 0) + (elevationAdj || 0) + (pressureAdj || 0);
    const totalM = Math.round(Math.abs(totalAdj));
    if (totalM >= 1) {
        if (totalAdj < 0) {
            addAimItem(aimList, 'Rekommendation', `Ta en klubba som går ${totalM} m längre än normalt (förhållanden gör att bollen går ${totalM} m kortare)`);
        } else {
            addAimItem(aimList, 'Rekommendation', `Ta en klubba som går ${totalM} m kortare än normalt (förhållanden gör att bollen går ${totalM} m längre)`);
        }
    } else {
        addAimItem(aimList, 'Rekommendation', 'Normalklubb räcker – sikta rakt på flaggan');
    }
}

function addAimItem(listEl, label, text) {
    if (!listEl) return;
    const li = document.createElement('li');
    li.className = 'aim-item';
    li.innerHTML = `<span class="aim-item-label">${label}:</span> <span class="aim-item-value">${text}</span>`;
    listEl.appendChild(li);
}

function updateImpactDetails(temp, wind, humidity, elevation, pressure) {
    const impactList = document.getElementById('impactList');
    impactList.innerHTML = '';
    const rawTemp = state.weatherData ? Math.round(state.weatherData.main.temp) : null;
    const rawWind = state.weatherData ? Math.round(state.weatherData.wind.speed * 10) / 10 : null;
    const rawHumidity = state.weatherData ? state.weatherData.main.humidity : null;
    const rawPressure = state.weatherData ? state.weatherData.main.pressure : null;

    const windType = getWindDistanceType();
    const windLabel = windType === 'medvind' ? 'Vind (medvind)' : windType === 'motvind' ? 'Vind (motvind)' : 'Vind';

    const entries = [];
    entries.push({ label: 'Temperatur', raw: rawTemp !== null ? `${rawTemp}°C` : '-', adj: temp });
    entries.push({ label: windLabel, raw: rawWind !== null ? `${rawWind} m/s` : '-', adj: wind });
    entries.push({ label: 'Luftfuktighet', raw: rawHumidity !== null ? `${rawHumidity}%` : '-', adj: humidity });
    entries.push({ label: 'Lufttryck', raw: rawPressure !== null ? `${rawPressure} hPa` : '-', adj: pressure });

    // Non-weather impacts (elevation) — show only if significant
    if (Math.abs(elevation) >= 0.5) entries.push({ label: 'Höjdskillnad', raw: '-', adj: elevation });

    entries.forEach(entry => {
        const item = document.createElement('div');
        item.className = 'impact-item';

        const valueClass = entry.adj > 0 ? 'positive' : (entry.adj < 0 ? 'negative' : 'neutral');
        const sign = entry.adj > 0 ? '+' : '';

        item.innerHTML = `
            <span class="impact-label">${entry.label}</span>
            <span class="impact-raw">${entry.raw}</span>
            <span class="impact-value ${valueClass}">${sign}${Math.round(entry.adj)} m</span>
        `;

        impactList.appendChild(item);
    });
}

// Service Worker Registration
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch(() => {});
    });
}
