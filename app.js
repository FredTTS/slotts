// Golf course data – loaded from map.geojson at startup
let GOLF_COURSE_DATA = null;

// Constants
// I produktion: använd backend-proxy eller miljövariabel för API-nyckel
const WEATHER_API_KEY = '99d688898682ba4fc727529cd0fbd7ac';
const CLUBS = [
    'Driver', 'Trä 3', 'Trä 5', 'Hybrid 3', 'Järn 4', 'Järn 5', 
    'Järn 6', 'Järn 7', 'Järn 8', 'Järn 9', 'PW', 'SW', 'LW'
];

// Default distances (meters) so users have sensible starting values they can edit
const DEFAULT_CLUB_DATA = {
    'Driver': { totalDistance: 230, carryDistance: 220 },
    'Trä 3': { totalDistance: 210, carryDistance: 200 },
    'Trä 5': { totalDistance: 195, carryDistance: 185 },
    'Hybrid 3': { totalDistance: 185, carryDistance: 175 },
    'Järn 4': { totalDistance: 170, carryDistance: 160 },
    'Järn 5': { totalDistance: 160, carryDistance: 150 },
    'Järn 6': { totalDistance: 150, carryDistance: 140 },
    'Järn 7': { totalDistance: 140, carryDistance: 130 },
    'Järn 8': { totalDistance: 130, carryDistance: 120 },
    'Järn 9': { totalDistance: 120, carryDistance: 110 },
    'PW': { totalDistance: 110, carryDistance: 95 },
    'SW': { totalDistance: 85, carryDistance: 80 },
    'LW': { totalDistance: 75, carryDistance: 70 }
};
// App State
let state = {
    currentHole: null,
    userPosition: null,
    weatherData: null,
    pinOffset: { x: 0, y: 0 },
    clubs: loadClubData(),
    watchId: null,
    timerStartTime: null,
    timerRunning: false,
    timerIntervalId: null,
    deviceHeading: null,  // kompassriktning (grader), 0 = N, 90 = Ö
    notes: loadNotes()    // anteckningar per hål { 1: "...", 2: "...", ... }
};

// Layout persistence key
const LAYOUT_KEY = 'layoutOrder';
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
    setupBackToMainButton();
    setupBanguideImageZoom();
    updateBanguidePage();
    hideLoading();
}

// Club Data Management
function loadClubData() {
    const saved = localStorage.getItem('clubData');
    if (saved) {
        return JSON.parse(saved);
    }
    // Use predefined sensible defaults so users have values to edit from start
    const defaultClubs = {};
    CLUBS.forEach(club => {
        if (DEFAULT_CLUB_DATA[club]) {
            defaultClubs[club] = { 
                totalDistance: DEFAULT_CLUB_DATA[club].totalDistance,
                carryDistance: DEFAULT_CLUB_DATA[club].carryDistance
            };
        } else {
            defaultClubs[club] = { totalDistance: 0, carryDistance: 0 };
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
    container.innerHTML = '';
    
    CLUBS.forEach(clubName => {
        const clubData = state.clubs[clubName];
        const item = document.createElement('div');
        item.className = 'club-item';
        item.innerHTML = `
            <div class="club-item-header">${clubName}</div>
            <div class="club-inputs">
                <div class="input-group">
                    <label>Totallängd (m)</label>
                    <input type="number" 
                           data-club="${clubName}" 
                           data-field="totalDistance" 
                           value="${clubData.totalDistance}" 
                           placeholder="0">
                </div>
                <div class="input-group">
                    <label>Längd utan rull (m)</label>
                    <input type="number" 
                           data-club="${clubName}" 
                           data-field="carryDistance" 
                           value="${clubData.carryDistance}" 
                           placeholder="0">
                </div>
            </div>
        `;
        container.appendChild(item);
    });
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

    const pinOffsetX = document.getElementById('pinOffsetX');
    const pinOffsetY = document.getElementById('pinOffsetY');
    if (pinOffsetX) {
        pinOffsetX.addEventListener('input', (e) => {
            state.pinOffset.x = parseFloat(e.target.value);
            const v = document.getElementById('pinOffsetXValue');
            if (v) v.textContent = `${e.target.value} m`;
            updateDistances();
        });
    }
    if (pinOffsetY) {
        pinOffsetY.addEventListener('input', (e) => {
            state.pinOffset.y = parseFloat(e.target.value);
            const v = document.getElementById('pinOffsetYValue');
            if (v) v.textContent = `${e.target.value} m`;
            updateDistances();
        });
    }
    const resetPinBtn = document.getElementById('resetPin');
    if (resetPinBtn) resetPinBtn.addEventListener('click', resetPinPosition);

    const clubSelect = document.getElementById('clubSelect');
    if (clubSelect) clubSelect.addEventListener('change', () => updateClubDistanceDisplay());

    const editBtn = document.getElementById('editLayoutBtn');
    const resetLayoutBtn = document.getElementById('resetLayoutBtn');
    if (editBtn) {
        editBtn.addEventListener('click', () => {
            const enabled = document.body.classList.toggle('layout-edit');
            setDraggableState(enabled);
            if (enabled) setupDragHandlers();
        });
    }
    if (resetLayoutBtn) {
        resetLayoutBtn.addEventListener('click', () => {
            localStorage.removeItem(LAYOUT_KEY);
            location.reload();
        });
    }

    const updateAimBtn = document.getElementById('updateAimBtn');
    if (updateAimBtn) {
        updateAimBtn.addEventListener('click', refreshAimPosition);
    }

    const banguideStrip = document.getElementById('banguideStrip');
    const avstandStrip = document.getElementById('avstandStrip');
    const pages = document.getElementById('pages');
    if (banguideStrip && pages) {
        const openBanguide = () => {
            pages.classList.remove('show-distance');
            pages.classList.add('show-banguide');
        };
        banguideStrip.addEventListener('click', openBanguide);
        banguideStrip.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                openBanguide();
            }
        });
    }
    if (avstandStrip && pages) {
        const openDistance = () => {
            pages.classList.remove('show-banguide');
            pages.classList.add('show-distance');
            const holeEl = document.getElementById('distancePageHoleNumber');
            if (holeEl) holeEl.textContent = state.currentHole || 1;
        };
        avstandStrip.addEventListener('click', openDistance);
        avstandStrip.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                openDistance();
            }
        });
    }

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

function loadLayoutOrder() {
    try {
        const saved = localStorage.getItem(LAYOUT_KEY);
        if (!saved) return;
        const order = JSON.parse(saved);
        const container = document.querySelector('.main-content');
        if (!container) return;
        order.forEach(id => {
            const el = document.querySelector(`[data-layout-id="${id}"], #${id}`);
            if (el) container.appendChild(el);
        });
    } catch (e) {
        console.warn('Could not load layout order', e);
    }
}

function saveLayoutOrder() {
    const container = document.querySelector('.main-content');
    if (!container) return;
    const sections = Array.from(container.querySelectorAll('.card'));
    const order = sections.map(s => s.dataset.layoutId || s.id).filter(Boolean);
    localStorage.setItem(LAYOUT_KEY, JSON.stringify(order));
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

// Drag & drop handlers
let draggedEl = null;
function setupDragHandlers() {
    const container = document.querySelector('.main-content');
    if (!container) return;

    container.addEventListener('dragstart', (e) => {
        const el = e.target.closest('.card');
        if (!el) return;
        draggedEl = el;
        e.dataTransfer.effectAllowed = 'move';
        try { e.dataTransfer.setData('text/plain', el.dataset.layoutId || el.id); } catch (err) {}
        el.classList.add('dragging');
    });

    container.addEventListener('dragend', () => {
        if (draggedEl) draggedEl.classList.remove('dragging');
        draggedEl = null;
        saveLayoutOrder();
    });

    container.addEventListener('dragover', (e) => {
        e.preventDefault();
        const afterEl = getDragAfterElement(container, e.clientY);
        if (!draggedEl) return;
        if (afterEl == null) {
            container.appendChild(draggedEl);
        } else {
            container.insertBefore(draggedEl, afterEl);
        }
    });

    container.addEventListener('drop', (e) => {
        e.preventDefault();
        saveLayoutOrder();
    });
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
        state.clubs[club][field] = parseFloat(input.value) || 0;
    });
    saveClubData();
    closeSettings();
    if (state.currentHole) {
        updateDistances();
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

    // Uppdatera green-formen direkt (från GeoJSON) så den syns även utan GPS
    const holeDataForGreen = getHoleData(holeNumber);
    drawGreenShape(getGreenPolygon(holeDataForGreen));
    
    // Uppdatera anteckningsrutan till det nya hålet
    const notesCard = document.getElementById('holeNotesCard');
    const holeNotesNumber = document.getElementById('holeNotesHoleNumber');
    if (notesCard) notesCard.style.display = 'block';
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
    
    // Show relevant sections (varje del är eget draggbart kort)
    const clubRec = document.getElementById('clubRecommendation');
    const clubDistCard = document.getElementById('clubDistanceCard');
    const windArrowCard = document.getElementById('windArrowCard');
    const windAdjCard = document.getElementById('windAdjustmentCard');
    const conditionsCard = document.getElementById('conditionsImpactCard');
    const timerSec = document.getElementById('timerSection');
    if (clubRec) clubRec.style.display = 'block';
    if (clubDistCard) clubDistCard.style.display = 'block';
    if (windArrowCard) windArrowCard.style.display = 'block';
    if (windAdjCard) windAdjCard.style.display = 'block';
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
}

function resetPinPosition() {
    state.pinOffset = { x: 0, y: 0 };
    const xEl = document.getElementById('pinOffsetX');
    const yEl = document.getElementById('pinOffsetY');
    const xVal = document.getElementById('pinOffsetXValue');
    const yVal = document.getElementById('pinOffsetYValue');
    if (xEl) xEl.value = 0;
    if (yEl) yEl.value = 0;
    if (xVal) xVal.textContent = '0 m';
    if (yVal) yVal.textContent = '0 m';
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
    if (elapsedEl) elapsedEl.textContent = timeString;
}

// Weather API
async function fetchWeather() {
    if (!state.userPosition) return;
    
    try {
        const response = await fetch(
            `https://api.openweathermap.org/data/2.5/weather?lat=${state.userPosition.lat}&lon=${state.userPosition.lng}&appid=${WEATHER_API_KEY}&units=metric`
        );
        state.weatherData = await response.json();
        updateWeatherDisplay();
    } catch (error) {
        console.error('Weather fetch error:', error);
    }
}

function updateWeatherDisplay() {
    if (!state.weatherData) return;
    
    const temp = Math.round(state.weatherData.main.temp);
    const windSpeed = Math.round(state.weatherData.wind.speed * 10) / 10; // m/s
    const windDir = getWindDirection(state.weatherData.wind.deg);
    const humidity = state.weatherData.main.humidity;
    // Update any weather elements if they exist (we removed the dedicated weather card)
    const tempEl = document.getElementById('temperature'); if (tempEl) tempEl.textContent = `${temp}°C`;
    const windEl = document.getElementById('windSpeed'); if (windEl) windEl.textContent = `${windSpeed} m/s`;
    const windDirEl = document.getElementById('windDirection'); if (windDirEl) windDirEl.textContent = windDir;
    const humEl = document.getElementById('humidity'); if (humEl) humEl.textContent = `${humidity}%`;

    updateWindArrow();

    // Also refresh the impact list so weather metrics appear under Påverkan på avstånd
    updateImpactDetails(
        calculateTemperatureAdjustment(state.weatherData.main.temp),
        calculateWindAdjustment(0),
        calculateHumidityAdjustment(state.weatherData.main.humidity),
        calculateElevationAdjustment(0),
        calculatePressureAdjustment(state.weatherData.main.pressure)
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

// Banguide-sida: uppdatera hålnummer och bild när hål byts (återställ zoom och pan)
function updateBanguidePage() {
    const hole = state.currentHole || 1;
    const numEl = document.getElementById('banguideHoleNumber');
    const imgEl = document.getElementById('banguideImage');
    if (numEl) numEl.textContent = hole;
    if (imgEl) {
        imgEl.src = `img/s${hole}.jpeg`;
        imgEl.alt = `Hål ${hole}`;
        banguideImageScale = 1;
        banguideImageTranslate = { x: 0, y: 0 };
        imgEl.style.transform = '';
    }
}

function setupBackToMainButton() {
    const btn = document.getElementById('backToMainBtn');
    const pages = document.getElementById('pages');
    if (!btn || !pages) return;
    btn.addEventListener('click', () => pages.classList.remove('show-banguide'));

    const backFromDistanceBtn = document.getElementById('backFromDistanceBtn');
    if (backFromDistanceBtn && pages) {
        backFromDistanceBtn.addEventListener('click', () => pages.classList.remove('show-distance'));
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

    const pinPosition = getPinPosition(holeData);
    const greenPolygon = getGreenPolygon(holeData);
    if (!pinPosition) return;

    // Calculate distances
    const distanceToPin = calculateDistance(state.userPosition, pinPosition);
    const distanceToFront = calculateDistanceToFrontEdge(state.userPosition, greenPolygon);
    const distanceToBack = calculateDistanceToBackEdge(state.userPosition, greenPolygon);
    const midDistance = (distanceToFront + distanceToBack) / 2;
    const greenArea = greenPolygon ? calculatePolygonArea(greenPolygon) : 0;
    
    // Update UI
    const distEl = document.getElementById('distanceToGreen');
    const frontEl = document.getElementById('frontEdge');
    const backEl = document.getElementById('backEdge');
    if (distEl) distEl.innerHTML = `<span style="font-size: 3rem;">${Math.round(distanceToPin)}</span> <span style="font-size: 1.5rem;">m</span>`;
    if (frontEl) frontEl.textContent = `${Math.round(distanceToFront)} m`;
    if (backEl) backEl.textContent = `${Math.round(distanceToBack)} m`;

    drawGreenShape(greenPolygon);
    
    // Calculate elevation
    const elevation = calculateElevation(holeData, state.userPosition);
    
    // Recommend club
    recommendClub(distanceToPin, elevation);
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
    
    // Apply offset
    const offsetLat = lat + (state.pinOffset.y / 111320); // ~111.32km per degree
    const offsetLng = lng + (state.pinOffset.x / (111320 * Math.cos(lat * Math.PI / 180)));
    
    return { lat: offsetLat, lng: offsetLng };
}

function getGreenPolygon(holeData) {
    const green = holeData.find(f => f.properties.type === 'green');
    if (!green) return null;
    
    return green.geometry.coordinates[0].map(coord => ({
        lng: coord[0],
        lat: coord[1]
    }));
}

// Rita greenens form från GeoJSON-polygon i SVG (ersätter Mitten/Area)
function drawGreenShape(greenPolygon) {
    const svg = document.getElementById('greenShapeSvg');
    const wrap = document.getElementById('greenShapeWrap');
    if (!svg || !wrap) return;

    if (!greenPolygon || greenPolygon.length < 3) {
        svg.innerHTML = '';
        wrap.classList.remove('has-shape');
        return;
    }

    const lngs = greenPolygon.map(p => p.lng);
    const lats = greenPolygon.map(p => p.lat);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const rangeLng = maxLng - minLng || 1e-6;
    const rangeLat = maxLat - minLat || 1e-6;

    const pad = 4;
    const w = 100 - 2 * pad;
    const h = 60 - 2 * pad;

    const points = greenPolygon.map(p => {
        const x = pad + ((p.lng - minLng) / rangeLng) * w;
        const y = pad + ((maxLat - p.lat) / rangeLat) * h;
        return `${x.toFixed(2)},${y.toFixed(2)}`;
    }).join(' ');

    svg.innerHTML = `<polygon class="green-shape-polygon" points="${points}" fill="var(--primary-light)" stroke="var(--primary-dark)" stroke-width="1.5" />`;
    wrap.classList.add('has-shape');
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
        document.querySelector('.club-name').textContent = bestClub.name;
        document.querySelector('.club-distance').textContent = 
            `Normalt: ${Math.round(bestClub.totalDistance)} m (${Math.round(bestClub.carryDistance)} m carry)`;
        const adjEl = document.getElementById('clubRecommendedAdjusted');
        if (adjEl) {
            const todayM = Math.round(bestClub.totalDistance + totalAdjustment);
            adjEl.textContent = `Idag (väder + höjd): ${todayM} m`;
            adjEl.style.display = '';
        }
    } else {
        document.querySelector('.club-name').textContent = 'Ställ in klubbor';
        document.querySelector('.club-distance').textContent = 'Gå till inställningar';
        const adjEl = document.getElementById('clubRecommendedAdjusted');
        if (adjEl) adjEl.style.display = 'none';
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
    sel.innerHTML = '';
    CLUBS.forEach(name => {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        sel.appendChild(opt);
    });
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
    normEl.textContent = `Normalt: ${normal} m`;
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

    // Sidovind – hur mycket man ska sikta åt sidan beror på vindriktning, styrka och avstånd (längre slag = mer drift)
    const crossWind = Math.sin((windDeg - bearing) * Math.PI / 180) * windSpeed; // m/s sidovind
    const distanceFactor = 2 * (1 + Math.min(distanceToPin, 250) / 100); // längre slag = mer meters att sikta
    const aimMeters = Math.round(Math.abs(crossWind) * distanceFactor);
    if (aimMeters >= 1) {
        const direction = crossWind > 0 ? 'höger' : 'vänster';
        addAimItem(aimList, 'Vind (sidovind)', `Sikta ${aimMeters} m till ${direction} om flaggan (vind ${windSpeed.toFixed(1)} m/s)`);
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

    // Totalt avstånd (temperatur + vind fram/bak + luftfuktighet + höjd + tryck)
    const totalAdj = (tempAdj || 0) + (windAdj || 0) + (humidityAdj || 0) + (elevationAdj || 0) + (pressureAdj || 0);
    const totalM = Math.round(Math.abs(totalAdj));
    if (totalM >= 1) {
        if (totalAdj > 0) {
            addAimItem(aimList, 'Totalt', `Slå ${totalM} m längre pga förhållanden`);
        } else {
            addAimItem(aimList, 'Totalt', `Slå ${totalM} m kort pga förhållanden`);
        }
    } else {
        addAimItem(aimList, 'Totalt', 'Rakt på flaggan');
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
        navigator.serviceWorker.register('sw.js')
            .then(reg => console.log('Service Worker registered'))
            .catch(err => console.log('Service Worker registration failed:', err));
    });
}
