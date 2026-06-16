// --- Carbon Calculation Factors (kg CO2e per unit) ---
const CALCULATION_FACTORS = {
  transport: {
    'sedan-gas': 0.17,      // per km
    'sedan-diesel': 0.16,   // per km
    'suv-gas': 0.25,        // per km
    'ev': 0.04,             // per km (dependent on grid electricity)
    'bus': 0.03,            // per km per passenger
    'subway': 0.02,         // per km per passenger
    'train': 0.025,         // per km per passenger
    'bicycle': 0.00         // zero carbon
  },
  diet: {
    'beef': 27.0,           // per kg
    'pork': 7.2,            // per kg
    'poultry': 5.7,         // per kg
    'cheese': 13.5,         // per kg
    'tofu': 2.0,            // per kg
    'rice': 4.0,            // per kg
    'vegetables': 0.5       // per kg
  },
  energy: {
    'elec-standard': 0.40,  // per kWh
    'elec-clean': 0.02,     // per kWh
    'gas-heating': 0.20     // per m³
  }
};

// --- Default Application State ---
const DEFAULT_STATE = {
  onboarded: false,
  userProfile: {
    email: "alex@carbon-aware.org"
  },
  baselineAnnual: 4500, // kg CO2e per year
  weeklyBudget: 69.2,   // kg CO2e per week
  points: 0,
  xp: 0,
  levelVal: 1,
  levelName: 'Sprout',
  streak: 5,
  ledger: [],           // Array of { id, date, category, subCategory, amount, unit, emissions, label }
  habitsChecked: {
    carfree: false,
    plantbased: false,
    coldcycle: false,
    noplastic: false
  }
};

// Application State Instance
let state = { ...DEFAULT_STATE };

// Chart Instances
let categoryChart = null;
let trendChart = null;

let token = localStorage.getItem('carbon_token') || null;

// Base API URL config
// If running locally, point to port 3000 where server.js runs. 
// If deployed, use relative paths (empty string) unless a specific backend domain is configured.
const API_BASE_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.protocol === 'file:')
  ? 'http://localhost:3000'
  : ''; 


function getAuthHeaders() {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };
}

// --- DOM References ---
const appContainer = document.getElementById('app');

// Views
const viewOnboarding = document.getElementById('view-onboarding');
const viewDashboard = document.getElementById('view-dashboard');

// Onboarding Controls
const btnObBack = document.getElementById('btn-ob-back');
const btnObNext = document.getElementById('btn-ob-next');
const onboardingSlides = document.querySelectorAll('.onboarding-slide');
const stepIndicators = document.querySelectorAll('.onboarding-step-indicator');
const rangeSliders = document.querySelectorAll('.input-range');
const targetRadios = document.querySelectorAll('input[name="ob-goal"]');
const customTargetGroup = document.getElementById('custom-target-group');
const obCalcBaselineText = document.getElementById('ob-calc-baseline');
const obCalcWeeklyBudgetText = document.getElementById('ob-calc-weekly-budget');

// Header Status Elements
const userStatusWidget = document.getElementById('user-status-widget');
const userLevelName = document.getElementById('user-level-name');
const userLevelVal = document.getElementById('user-level-val');
const xpBarFill = document.getElementById('xp-bar-fill');
const userXpCurrent = document.getElementById('user-xp-current');
const userXpNext = document.getElementById('user-xp-next');
const userPoints = document.getElementById('user-points');
const btnResetApp = document.getElementById('btn-reset-app');

// SPA Tabs
const tabButtons = document.querySelectorAll('.tab-button');
const tabPanels = document.querySelectorAll('.dashboard-tab-panel');

// Dashboard UI Widgets
const gaugeSpentText = document.getElementById('gauge-spent');
const gaugeBudgetText = document.getElementById('gauge-budget');
const gaugeRingFill = document.getElementById('progress-ring-fill');
const gaugeStatusBadge = document.getElementById('gauge-status-badge');
const equivTreesText = document.getElementById('equiv-trees');
const equivPhonesText = document.getElementById('equiv-phones');
const equivBulbsText = document.getElementById('equiv-bulbs');
const dashboardEncouragement = document.getElementById('dashboard-encouragement');

// Activity Loggers
const logTabBtns = document.querySelectorAll('.log-tab-btn');
const logForms = document.querySelectorAll('.logger-form-panel');

// Ledger Table
const ledgerRows = document.getElementById('ledger-rows');
const ledgerEmptyMsg = document.getElementById('ledger-empty-msg');
const btnClearLedger = document.getElementById('btn-clear-ledger');

// Habit Checklist
const habitCheckboxes = document.querySelectorAll('.habit-checkbox');
const habitStreakText = document.getElementById('habit-streak-count');
const leaderboardUserPoints = document.getElementById('leaderboard-user-points');
const leaderboardUserLevel = document.getElementById('leaderboard-user-level');

// Modal Elements
const rewardModal = document.getElementById('reward-modal');
const btnCloseModal = document.getElementById('btn-close-modal');
const btnModalOk = document.getElementById('btn-modal-ok');
const modalRewardName = document.getElementById('modal-reward-name');
const modalCouponCode = document.getElementById('modal-coupon-code');
const toastNotification = document.getElementById('toast-notification');

// Current slide index (1-based)
let currentObSlide = 1;

// --- Init Application ---
document.addEventListener('DOMContentLoaded', () => {
  initAuthListeners();
  initLandingListeners();
  initOnboardingListeners();
  initDashboardTabs();
  initLoggerFormListeners();
  initHabitChecklistListeners();
  initMarketplaceListeners();
  initGlobalListeners();

  // Try loading state if token exists, otherwise redirect to auth screen
  if (token) {
    loadState();
  } else {
    showAuthView();
  }
});

// --- Authentication Flow Logic ---
let authMode = 'login'; // 'login' or 'signup'

function initAuthListeners() {
  const btnAuthToggle = document.getElementById('btn-auth-toggle');
  const authForm = document.getElementById('auth-form');
  const btnLogout = document.getElementById('btn-logout');

  if (btnAuthToggle) {
    btnAuthToggle.addEventListener('click', () => {
      const authTitle = document.querySelector('.auth-header h2');
      const authSubtitle = document.getElementById('auth-subtitle');
      const authToggleDesc = document.getElementById('auth-toggle-desc');
      const btnSubmitSpan = document.querySelector('#btn-auth-submit span');
      const btnSubmitIcon = document.querySelector('#btn-auth-submit i');
      
      document.getElementById('auth-error-msg').style.display = 'none';

      if (authMode === 'login') {
        authMode = 'signup';
        authTitle.innerText = 'Create Account';
        authSubtitle.innerText = 'Sign up to calculate your baseline footprint and join green leagues.';
        authToggleDesc.innerText = 'Already have an account?';
        btnAuthToggle.innerText = 'Log In';
        btnSubmitSpan.innerText = 'Sign Up';
        btnSubmitIcon.className = 'fa-solid fa-user-plus';
      } else {
        authMode = 'login';
        authTitle.innerText = 'Welcome to Carbon';
        authSubtitle.innerText = 'Log in or create a secure account to track emissions and earn real eco-rewards.';
        authToggleDesc.innerText = "Don't have an account yet?";
        btnAuthToggle.innerText = 'Sign Up';
        btnSubmitSpan.innerText = 'Log In';
        btnSubmitIcon.className = 'fa-solid fa-arrow-right-to-bracket';
      }
    });
  }

  if (authForm) {
    authForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('auth-email').value;
      const password = document.getElementById('auth-password').value;
      const errorMsgBanner = document.getElementById('auth-error-msg');
      const errorMsgText = document.getElementById('auth-error-text');

      errorMsgBanner.style.display = 'none';

      try {
        const endpoint = authMode === 'login' ? '/api/auth/login' : '/api/auth/register';
        const res = await fetch(API_BASE_URL + endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });

        const data = await res.json();
        if (!res.ok) {
          errorMsgText.innerText = data.error || 'Authentication failed';
          errorMsgBanner.style.display = 'flex';
          return;
        }

        // Save token
        token = data.token;
        localStorage.setItem('carbon_token', token);
        
        showToast(authMode === 'login' ? "Welcome back!" : "Account registered successfully!");
        
        // Clear inputs
        document.getElementById('auth-email').value = '';
        document.getElementById('auth-password').value = '';
        
        // Load state and redirect
        await loadState();
      } catch (err) {
        console.error(err);
        errorMsgText.innerText = 'Server connection failed';
        errorMsgBanner.style.display = 'flex';
      }
    });
  }

  if (btnLogout) {
    btnLogout.addEventListener('click', () => {
      logout();
    });
  }
}

function logout(isExpired = false) {
  token = null;
  localStorage.removeItem('carbon_token');
  state = { ...DEFAULT_STATE };
  
  showToast(isExpired ? "Session expired. Please log in again." : "Logged out successfully.");
  showAuthView();
}

function showAuthView() {
  // Hide all views except auth
  document.querySelectorAll('.view-section').forEach(view => {
    view.classList.remove('active-view');
  });
  document.getElementById('view-auth').classList.add('active-view');
  userStatusWidget.style.display = 'none';
}

// --- State Management ---
async function loadState() {
  if (!token) {
    showAuthView();
    return;
  }
  try {
    const res = await fetch(API_BASE_URL + '/api/user/state', {
      headers: getAuthHeaders()
    });
    
    if (res.status === 401 || res.status === 403) {
      logout(true); // Token expired
      return;
    }
    
    if (!res.ok) throw new Error('Failed to load state');
    state = await res.json();
    
    // Also fetch ledger records
    const ledgerRes = await fetch(API_BASE_URL + '/api/ledger', {
      headers: getAuthHeaders()
    });
    
    if (ledgerRes.ok) {
      state.ledger = await ledgerRes.json();
    }
    
    setupUI();
  } catch (e) {
    console.error(e);
    showToast("Error connecting to server. Please try again.");
    showAuthView();
  }
}

async function saveState() {
  if (!token) return;
  try {
    await fetch(API_BASE_URL + '/api/user/state', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(state)
    });
  } catch (e) {
    console.error('Failed to sync state to server:', e);
  }
}

async function resetApp() {
  if (confirm("Are you sure you want to reset all your data, ledger logs, and level progress?")) {
    state = { ...DEFAULT_STATE, ledger: [] };
    state.onboarded = false;
    await saveState();

    if (token) {
      try {
        await fetch(API_BASE_URL + '/api/ledger/clear', {
          method: 'POST',
          headers: getAuthHeaders()
        });
      } catch (e) {
        console.error(e);
      }
    }
    location.reload();
  }
}

// --- Setup UI based on State ---
function setupUI() {
  const viewLanding = document.getElementById('view-landing');
  const viewAuth = document.getElementById('view-auth');

  if (viewAuth) viewAuth.classList.remove('active-view');

  if (state.onboarded) {
    viewOnboarding.classList.remove('active-view');
    if (viewLanding) viewLanding.classList.remove('active-view');
    viewDashboard.classList.add('active-view');
    userStatusWidget.style.display = 'flex';
    updateHeaderProgress();
    updateDashboardSummary();
    updateLedgerTable();
    updateHabitChecklistUI();
    initCharts();
  } else {
    viewDashboard.classList.remove('active-view');
    viewOnboarding.classList.remove('active-view');
    if (viewLanding) viewLanding.classList.add('active-view');
    userStatusWidget.style.display = 'none';
    currentObSlide = 1;
    showObSlide(currentObSlide);
    calculateOnboardingRealtime();
  }
}

// --- Landing Page Logic ---
function initLandingListeners() {
  const landingTabBtns = document.querySelectorAll('.landing-tab-btn');
  const landingPanels = document.querySelectorAll('.landing-panel');
  const btnEnterOnboarding = document.getElementById('btn-enter-onboarding');

  landingTabBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      landingTabBtns.forEach(b => b.classList.remove('active'));
      landingPanels.forEach(p => p.classList.remove('active'));

      e.currentTarget.classList.add('active');
      const targetPanel = document.getElementById(e.currentTarget.dataset.target);
      if (targetPanel) {
        targetPanel.classList.add('active');
      }
    });
  });

  if (btnEnterOnboarding) {
    btnEnterOnboarding.addEventListener('click', () => {
      const viewLanding = document.getElementById('view-landing');
      if (viewLanding) viewLanding.classList.remove('active-view');
      viewOnboarding.classList.add('active-view');
      currentObSlide = 1;
      showObSlide(currentObSlide);
    });
  }
}

// --- Onboarding Flow Logic ---
function initOnboardingListeners() {
  // Back & Next Buttons
  btnObBack.addEventListener('click', () => {
    if (currentObSlide > 1) {
      currentObSlide--;
      showObSlide(currentObSlide);
    }
  });

  btnObNext.addEventListener('click', () => {
    if (currentObSlide < 4) {
      currentObSlide++;
      showObSlide(currentObSlide);
    } else {
      // Complete Onboarding
      state.onboarded = true;
      const calcData = calculateOnboardingRealtime();
      state.baselineAnnual = calcData.baseline;
      state.weeklyBudget = calcData.budget;
      state.points = 50; // Give a starter bonus points
      state.xp = 50;
      saveState();
      
      showToast("Onboarding complete! You earned +50 XP starter bonus.");
      setupUI();
    }
  });

  // Slide Range Sliders Live Values
  rangeSliders.forEach(slider => {
    slider.addEventListener('input', (e) => {
      const valSpan = document.getElementById(`val-${e.target.id}`);
      if (valSpan) {
        valSpan.innerText = e.target.value;
      }
      calculateOnboardingRealtime();
    });
  });

  // Goal Radios
  targetRadios.forEach(radio => {
    radio.addEventListener('change', (e) => {
      if (e.target.value === 'custom') {
        customTargetGroup.style.display = 'block';
      } else {
        customTargetGroup.style.display = 'none';
      }
      calculateOnboardingRealtime();
    });
  });
}

function showObSlide(slideNum) {
  // Update slide view
  onboardingSlides.forEach((slide, index) => {
    slide.classList.toggle('active', index + 1 === slideNum);
  });

  // Update indicators
  stepIndicators.forEach((ind, index) => {
    ind.classList.toggle('active', index + 1 <= slideNum);
  });

  // Update Nav Buttons
  btnObBack.disabled = (slideNum === 1);
  if (slideNum === 4) {
    btnObNext.innerHTML = `Get Started <i class="fa-solid fa-flag-checkered"></i>`;
  } else {
    btnObNext.innerHTML = `Next <i class="fa-solid fa-chevron-right"></i>`;
  }
}

// Dynamic Onboarding Carbon Footprint Calculation
function calculateOnboardingRealtime() {
  // 1. Diet
  const dietVal = document.querySelector('input[name="ob-diet"]:checked')?.value || 'flexitarian';
  let dietEmissions = 2200; // Flexitarian average
  if (dietVal === 'vegan') dietEmissions = 1000;
  if (dietVal === 'vegetarian') dietEmissions = 1500;
  if (dietVal === 'meat-heavy') dietEmissions = 3200;

  // 2. Transport
  const carKm = parseFloat(document.getElementById('ob-car').value) || 0;
  const transitKm = parseFloat(document.getElementById('ob-transit').value) || 0;
  const flightsHrs = parseFloat(document.getElementById('ob-flights').value) || 0;

  const carEmissions = carKm * 52 * 0.17; // Assuming average petrol sedan factor
  const transitEmissions = transitKm * 52 * 0.035; // Standard average
  const flightEmissions = flightsHrs * 90; // Average of 90 kg CO2 per short/medium flight hour

  // 3. Housing
  const houseVal = document.querySelector('input[name="ob-housing"]:checked')?.value || 'apartment';
  const elecSrc = document.getElementById('ob-electricity-src').value || 'grid-average';
  
  let houseEmissions = houseVal === 'apartment' ? 1400 : 3300;
  if (elecSrc === 'coal-gas') houseEmissions += 600;
  if (elecSrc === 'renewable') houseEmissions -= 400;

  // Total Baseline (annual kg CO2e)
  const totalBaseline = Math.round(dietEmissions + carEmissions + transitEmissions + flightEmissions + houseEmissions);
  
  // Weekly baseline
  const weeklyBaseline = totalBaseline / 52.14;

  // 4. Budget
  const goalVal = document.querySelector('input[name="ob-goal"]:checked')?.value || 'pace-setter';
  let reductionPercent = 0.20; // Pace-setter
  if (goalVal === 'warrior') reductionPercent = 0.50;
  if (goalVal === 'custom') {
    reductionPercent = (parseFloat(document.getElementById('ob-custom-goal').value) || 15) / 100;
  }

  const weeklyBudget = Math.round((weeklyBaseline * (1 - reductionPercent)) * 10) / 10;

  // Render values
  obCalcBaselineText.innerText = totalBaseline.toLocaleString();
  obCalcWeeklyBudgetText.innerText = weeklyBudget.toFixed(1);

  return {
    baseline: totalBaseline,
    budget: weeklyBudget
  };
}

// --- SPA Nav Tabs Switching ---
function initDashboardTabs() {
  tabButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      // Remove active from all tabs
      tabButtons.forEach(b => b.classList.remove('active'));
      tabPanels.forEach(p => p.classList.remove('active'));

      // Add active to current
      const currentBtn = e.currentTarget;
      currentBtn.classList.add('active');
      const targetPanel = document.getElementById(currentBtn.dataset.target);
      if (targetPanel) {
        targetPanel.classList.add('active');
      }

      // Re-trigger chart rendering if ledger tab selected
      if (currentBtn.dataset.target === 'dash-ledger') {
        setTimeout(initCharts, 50);
      }
    });
  });
}

// --- Header Stats & Levels Calculation ---
function updateHeaderProgress() {
  userLevelVal.innerText = state.levelVal;
  userLevelName.innerText = state.levelName;
  userPoints.innerText = state.points.toLocaleString();
  
  // Level caps: Lvl 1 (0-100 XP), Lvl 2 (100-300 XP), Lvl 3 (300-600 XP), Lvl 4 (600+ XP)
  let nextLevelXp = 100;
  let prevLevelXp = 0;
  
  if (state.levelVal === 1) {
    nextLevelXp = 100;
    prevLevelXp = 0;
  } else if (state.levelVal === 2) {
    nextLevelXp = 300;
    prevLevelXp = 100;
  } else if (state.levelVal === 3) {
    nextLevelXp = 600;
    prevLevelXp = 300;
  } else {
    nextLevelXp = 1000;
    prevLevelXp = 600;
  }
  
  userXpCurrent.innerText = state.xp;
  userXpNext.innerText = nextLevelXp;
  
  const xpInCurrentLevel = state.xp - prevLevelXp;
  const xpNeededForCurrentLevel = nextLevelXp - prevLevelXp;
  let fillPercent = (xpInCurrentLevel / xpNeededForCurrentLevel) * 100;
  if (fillPercent > 100) fillPercent = 100;
  if (fillPercent < 0) fillPercent = 0;
  
  xpBarFill.style.width = `${fillPercent}%`;

  // Sync with leaderboard too
  leaderboardUserPoints.innerText = state.points.toLocaleString();
  leaderboardUserLevel.innerText = `Level ${state.levelVal} ${state.levelName}`;
}

function addXP(amount) {
  state.xp += amount;
  state.points += amount; // points sync with XP gained

  // Level Up Check
  let oldLevel = state.levelVal;
  if (state.xp >= 600) {
    state.levelVal = 4;
    state.levelName = "Redwood";
  } else if (state.xp >= 300) {
    state.levelVal = 3;
    state.levelName = "Oak";
  } else if (state.xp >= 100) {
    state.levelVal = 2;
    state.levelName = "Sapling";
  } else {
    state.levelVal = 1;
    state.levelName = "Sprout";
  }

  if (state.levelVal > oldLevel) {
    showToast(`🎉 Level Up! You are now a Level ${state.levelVal} ${state.levelName}!`);
  }
  
  saveState();
  updateHeaderProgress();
}

function removeXP(amount) {
  state.xp -= amount;
  state.points -= amount;
  if (state.xp < 0) state.xp = 0;
  if (state.points < 0) state.points = 0;

  // Recalculate level
  if (state.xp >= 600) {
    state.levelVal = 4;
    state.levelName = "Redwood";
  } else if (state.xp >= 300) {
    state.levelVal = 3;
    state.levelName = "Oak";
  } else if (state.xp >= 100) {
    state.levelVal = 2;
    state.levelName = "Sapling";
  } else {
    state.levelVal = 1;
    state.levelName = "Sprout";
  }

  saveState();
  updateHeaderProgress();
}

// --- Dashboard Summary Calculations ---
function updateDashboardSummary() {
  // Sum up current week ledger emissions
  let totalSpent = 0;
  state.ledger.forEach(item => {
    // In production we would filter items logged in current week.
    // For this prototype MVP, we aggregate all items currently in ledger.
    totalSpent += parseFloat(item.emissions);
  });
  
  totalSpent = Math.max(0, totalSpent); // keep it non-negative
  
  gaugeSpentText.innerText = totalSpent.toFixed(1);
  gaugeBudgetText.innerText = state.weeklyBudget.toFixed(1);

  // Update Circular Progress Ring SVG Dash offset
  // Circumference = 2 * PI * r = 2 * 3.14159 * 80 = 502.65
  const circumference = 502.65;
  let fraction = totalSpent / state.weeklyBudget;
  if (fraction > 1.0) fraction = 1.0;
  if (fraction < 0.0) fraction = 0.0;
  const offset = circumference - (fraction * circumference);
  gaugeRingFill.style.strokeDashoffset = offset;

  // Change gauge ring color based on budget utilization
  if (totalSpent > state.weeklyBudget) {
    gaugeRingFill.style.stroke = "var(--color-coral)";
    gaugeStatusBadge.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> Over Budget`;
    gaugeStatusBadge.className = "status-marker status-over";
    dashboardEncouragement.innerText = `You are exceeding your weekly carbon budget by ${Math.round(((totalSpent/state.weeklyBudget) - 1)*100)}%. Avoid private transit or opt for vegetarian meals to reduce emissions.`;
  } else {
    gaugeRingFill.style.stroke = "var(--color-emerald)";
    gaugeStatusBadge.innerHTML = `<i class="fa-solid fa-circle-check"></i> Under Budget`;
    gaugeStatusBadge.className = "status-marker status-under";
    const percentBeating = Math.round((1 - (totalSpent / state.weeklyBudget)) * 100);
    dashboardEncouragement.innerText = percentBeating > 0 
      ? `Excellent work, Alex! You are beating your weekly budget by ${percentBeating}%.`
      : `Keep logging! You have full budget availability left.`;
  }

  // Update Eco-equivalents
  // Formula translation averages:
  // 1 mature tree absorbs 22kg CO2 per year.
  // 1 phone charge creates 0.0082kg CO2 (assuming standard grid). Or 1 kg CO2 = 122 phone charges.
  // 1 lightbulb running continuously for 1 year = 150 kg CO2.
  equivTreesText.innerText = (totalSpent / 22.0).toFixed(2);
  equivPhonesText.innerText = Math.round(totalSpent * 122).toLocaleString();
  equivBulbsText.innerText = (totalSpent / 150.0).toFixed(3);
}

// --- Activity Form Live Loggers & Math Calculations ---
function initLoggerFormListeners() {
  // Live previews
  // Transport Form
  const transTypeSelect = document.getElementById('trans-type');
  const transDistanceInput = document.getElementById('trans-distance');
  const previewTrans = document.getElementById('preview-transport-footprint');

  function updateTransPreview() {
    const type = transTypeSelect.value;
    const distance = parseFloat(transDistanceInput.value) || 0;
    const factor = CALCULATION_FACTORS.transport[type] || 0;
    const co2 = distance * factor;
    previewTrans.innerText = `${co2.toFixed(2)} kg CO₂e`;
  }
  transTypeSelect.addEventListener('change', updateTransPreview);
  transDistanceInput.addEventListener('input', updateTransPreview);

  // Diet Form
  const dietItemSelect = document.getElementById('diet-item');
  const dietQtyInput = document.getElementById('diet-quantity');
  const previewDiet = document.getElementById('preview-diet-footprint');

  function updateDietPreview() {
    const item = dietItemSelect.value;
    const mass = parseFloat(dietQtyInput.value) || 0;
    const factor = CALCULATION_FACTORS.diet[item] || 0;
    const co2 = mass * factor;
    previewDiet.innerText = `${co2.toFixed(2)} kg CO₂e`;
  }
  dietItemSelect.addEventListener('change', updateDietPreview);
  dietQtyInput.addEventListener('input', updateDietPreview);

  // Energy Form
  const energyUtilSelect = document.getElementById('energy-utility');
  const energyQtyInput = document.getElementById('energy-quantity');
  const previewEnergy = document.getElementById('preview-energy-footprint');

  function updateEnergyPreview() {
    const util = energyUtilSelect.value;
    const quantity = parseFloat(energyQtyInput.value) || 0;
    const factor = CALCULATION_FACTORS.energy[util] || 0;
    const co2 = quantity * factor;
    previewEnergy.innerText = `${co2.toFixed(2)} kg CO₂e`;
  }
  energyUtilSelect.addEventListener('change', updateEnergyPreview);
  energyQtyInput.addEventListener('input', updateEnergyPreview);

  // Form Tab toggling
  logTabBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      logTabBtns.forEach(b => b.classList.remove('active'));
      logForms.forEach(f => f.classList.remove('active'));

      e.currentTarget.classList.add('active');
      const targetPanel = document.getElementById(e.currentTarget.dataset.logger);
      if (targetPanel) {
        targetPanel.classList.add('active');
      }
    });
  });

  // Handle Log Submissions
  // Transport Form submit
  document.getElementById('log-transport').addEventListener('submit', (e) => {
    e.preventDefault();
    const type = transTypeSelect.value;
    const distance = parseFloat(transDistanceInput.value) || 0;
    const factor = CALCULATION_FACTORS.transport[type] || 0;
    const co2 = parseFloat((distance * factor).toFixed(3));

    const labelName = transTypeSelect.options[transTypeSelect.selectedIndex].text.split(' (')[0];

    addLedgerEntry('transport', type, distance, 'km', co2, `Commute via ${labelName}`);
    transDistanceInput.value = '';
    previewTrans.innerText = '0.00 kg CO₂e';
    showToast("Commute successfully logged into ledger! +10 XP");
    addXP(10);
  });

  // Diet Form submit
  document.getElementById('log-diet').addEventListener('submit', (e) => {
    e.preventDefault();
    const item = dietItemSelect.value;
    const mass = parseFloat(dietQtyInput.value) || 0;
    const factor = CALCULATION_FACTORS.diet[item] || 0;
    const co2 = parseFloat((mass * factor).toFixed(3));

    const labelName = dietItemSelect.options[dietItemSelect.selectedIndex].text.split(' (')[0];

    addLedgerEntry('diet', item, mass, 'kg', co2, `Diet meal: ${labelName}`);
    dietQtyInput.value = '';
    previewDiet.innerText = '0.00 kg CO₂e';
    showToast("Meal choice successfully logged into ledger! +10 XP");
    addXP(10);
  });

  // Energy Form submit
  document.getElementById('log-energy').addEventListener('submit', (e) => {
    e.preventDefault();
    const util = energyUtilSelect.value;
    const quantity = parseFloat(energyQtyInput.value) || 0;
    const factor = CALCULATION_FACTORS.energy[util] || 0;
    const co2 = parseFloat((quantity * factor).toFixed(3));

    const unit = util.startsWith('gas') ? 'm³' : 'kWh';
    const labelName = energyUtilSelect.options[energyUtilSelect.selectedIndex].text.split(' (')[0];

    addLedgerEntry('utilities', util, quantity, unit, co2, `Home Utilities: ${labelName}`);
    energyQtyInput.value = '';
    previewEnergy.innerText = '0.00 kg CO₂e';
    showToast("Utility usage successfully logged! +15 XP");
    addXP(15);
  });
}

// --- Ledger Actions & Visualizations ---
async function addLedgerEntry(category, subCategory, amount, unit, emissions, label) {
  const newEntry = {
    id: 'id_' + Math.random().toString(36).substring(2, 11),
    date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    category,
    subCategory,
    amount,
    unit,
    emissions,
    label
  };

  state.ledger.unshift(newEntry); // add to top
  updateDashboardSummary();
  updateLedgerTable();

  if (token) {
    try {
      await fetch(API_BASE_URL + '/api/ledger', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(newEntry)
      });
      saveState();
    } catch (e) {
      console.error('Failed to save entry to server:', e);
    }
  }
}

function updateLedgerTable() {
  if (!ledgerRows) return;
  ledgerRows.innerHTML = '';
  
  if (state.ledger.length === 0) {
    ledgerEmptyMsg.style.display = 'flex';
  } else {
    ledgerEmptyMsg.style.display = 'none';
    
    state.ledger.forEach(item => {
      const tr = document.createElement('tr');
      
      let badgeClass = 'bg-trans';
      let icon = 'fa-car';
      if (item.category === 'diet') { badgeClass = 'bg-diet'; icon = 'fa-utensils'; }
      if (item.category === 'utilities') { badgeClass = 'bg-energy'; icon = 'fa-bolt'; }
      if (item.category === 'offset') { badgeClass = 'bg-offset'; icon = 'fa-leaf'; }

      const isOffset = item.category === 'offset' || item.emissions < 0;
      const displayEmissions = isOffset ? `-${Math.abs(item.emissions).toFixed(2)}` : `+${item.emissions.toFixed(2)}`;
      
      tr.innerHTML = `
        <td data-label="Date">${item.date}</td>
        <td data-label="Category">
          <span class="category-badge-ui ${badgeClass}">
            <i class="fa-solid ${icon}"></i> ${item.category.toUpperCase()}
          </span>
        </td>
        <td data-label="Activity">${item.label}</td>
        <td data-label="Amount">${item.amount} ${item.unit}</td>
        <td data-label="Emissions" class="cell-emissions ${isOffset ? 'is-offset' : ''}">${displayEmissions} kg</td>
        <td data-label="Action">
          <button class="btn-delete-row" data-id="${item.id}" title="Remove entry">
            <i class="fa-solid fa-trash-can"></i>
          </button>
        </td>
      `;
      ledgerRows.appendChild(tr);
    });

    // Attach delete button click handlers
    document.querySelectorAll('.btn-delete-row').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.dataset.id;
        removeLedgerEntry(id);
      });
    });
  }
}

async function removeLedgerEntry(id) {
  // Check if we are deleting an offset created by a checkbox to uncheck it
  const deletedItem = state.ledger.find(item => item.id === id);
  
  state.ledger = state.ledger.filter(item => item.id !== id);
  updateDashboardSummary();
  updateLedgerTable();
  showToast("Record removed from ledger.");

  // If deleting offset item, refund XP and reset checklist checkmark
  if (deletedItem && deletedItem.category === 'offset') {
    if (deletedItem.subCategory === 'habit-carfree') {
      state.habitsChecked.carfree = false;
      removeXP(15);
    } else if (deletedItem.subCategory === 'habit-plantbased') {
      state.habitsChecked.plantbased = false;
      removeXP(10);
    } else if (deletedItem.subCategory === 'habit-coldcycle') {
      state.habitsChecked.coldcycle = false;
      removeXP(5);
    } else if (deletedItem.subCategory === 'habit-noplastic') {
      state.habitsChecked.noplastic = false;
      removeXP(5);
    }
    updateHabitChecklistUI();
  }

  if (token) {
    try {
      await fetch(API_BASE_URL + `/api/ledger/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });
      saveState();
    } catch (e) {
      console.error('Failed to delete entry on server:', e);
    }
  }
}

// --- Habit Tracker Checklist ---
function initHabitChecklistListeners() {
  habitCheckboxes.forEach(cb => {
    cb.addEventListener('change', (e) => {
      const id = e.target.id;
      const checked = e.target.checked;
      
      if (id === 'habit-carfree') {
        state.habitsChecked.carfree = checked;
        if (checked) {
          addLedgerEntry('offset', 'habit-carfree', 1, 'day', -3.2, "Habit: Commuted Car-free");
          addXP(15);
          showToast("Awesome! Saved 3.2 kg CO₂e and gained +15 XP.");
        } else {
          removeHabitLedgerEntry('habit-carfree');
          removeXP(15);
        }
      }
      else if (id === 'habit-plantbased') {
        state.habitsChecked.plantbased = checked;
        if (checked) {
          addLedgerEntry('offset', 'habit-plantbased', 1, 'meal', -5.0, "Habit: Plant-based Meal");
          addXP(10);
          showToast("Yum! Saved 5.0 kg CO₂e and gained +10 XP.");
        } else {
          removeHabitLedgerEntry('habit-plantbased');
          removeXP(10);
        }
      }
      else if (id === 'habit-coldcycle') {
        state.habitsChecked.coldcycle = checked;
        if (checked) {
          addLedgerEntry('offset', 'habit-coldcycle', 1, 'load', -0.8, "Habit: Cold Wash Cycle");
          addXP(5);
          showToast("Cool! Saved 0.8 kg CO₂e and gained +5 XP.");
        } else {
          removeHabitLedgerEntry('habit-coldcycle');
          removeXP(5);
        }
      }
      else if (id === 'habit-noplastic') {
        state.habitsChecked.noplastic = checked;
        if (checked) {
          addLedgerEntry('offset', 'habit-noplastic', 1, 'day', -0.2, "Habit: No Single-use Plastic");
          addXP(5);
          showToast("Greener Oceans! Saved 0.2 kg CO₂e and gained +5 XP.");
        } else {
          removeHabitLedgerEntry('habit-noplastic');
          removeXP(5);
        }
      }

      saveState();
      updateDashboardSummary();
    });
  });
}

function removeHabitLedgerEntry(subCategory) {
  state.ledger = state.ledger.filter(item => item.subCategory !== subCategory);
  saveState();
  updateLedgerTable();
}

function updateHabitChecklistUI() {
  document.getElementById('habit-carfree').checked = state.habitsChecked.carfree;
  document.getElementById('habit-plantbased').checked = state.habitsChecked.plantbased;
  document.getElementById('habit-coldcycle').checked = state.habitsChecked.coldcycle;
  document.getElementById('habit-noplastic').checked = state.habitsChecked.noplastic;
  habitStreakText.innerText = state.streak;
}

// --- Reward Shop Marketplace ---
function initMarketplaceListeners() {
  document.querySelectorAll('.btn-redeem').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const cost = parseInt(e.target.dataset.cost) || 0;
      const rewardId = e.target.dataset.rewardId;
      const rewardName = e.target.closest('.reward-card-body').querySelector('h4').innerText;

      if (state.points < cost) {
        alert("Insufficient XP points to claim this reward. Build more green habits and log carbon logs to acquire points.");
        return;
      }

      // Deduct points
      state.points -= cost;
      saveState();
      updateHeaderProgress();

      // Show Voucher Coupon Modal
      const randomCoupon = "CARB-" + Math.floor(1000 + Math.random() * 9000) + "-ECO";
      modalRewardName.innerText = rewardName;
      modalCouponCode.innerText = randomCoupon;

      rewardModal.classList.add('show');
    });
  });

  // Modal Close buttons
  btnCloseModal.addEventListener('click', () => {
    rewardModal.classList.remove('show');
  });
  btnModalOk.addEventListener('click', () => {
    rewardModal.classList.remove('show');
  });
}

// --- Global / Misc Listeners ---
function initGlobalListeners() {
  btnResetApp.addEventListener('click', resetApp);
  
  btnClearLedger.addEventListener('click', async () => {
    if (confirm("Are you sure you want to clear your current activity ledger? This will reset your weekly score, but keep your level profile XP intact.")) {
      state.ledger = [];
      // reset habit checkmarks since they are linked to ledger entries
      state.habitsChecked = {
        carfree: false,
        plantbased: false,
        coldcycle: false,
        noplastic: false
      };
      updateDashboardSummary();
      updateLedgerTable();
      updateHabitChecklistUI();
      initCharts();
      showToast("Ledger entries cleared.");

      if (token) {
        try {
          await fetch(API_BASE_URL + '/api/ledger/clear', {
            method: 'POST',
            headers: getAuthHeaders()
          });
          saveState();
        } catch (e) {
          console.error('Failed to clear ledger on server:', e);
        }
      }
    }
  });
}

// --- Custom Toast Popup Alert ---
let toastTimer = null;
function showToast(msg) {
  if (toastTimer) clearTimeout(toastTimer);
  
  toastNotification.querySelector('.toast-msg').innerText = msg;
  toastNotification.classList.add('show');
  
  toastTimer = setTimeout(() => {
    toastNotification.classList.remove('show');
  }, 4000);
}

// --- Visual Analytics Chart Drawing (Chart.js) ---
function initCharts() {
  const canvasCat = document.getElementById('chart-categories');
  const canvasTrend = document.getElementById('chart-trends');
  
  if (!canvasCat || !canvasTrend) return;

  // Cleanup old instances
  if (categoryChart) categoryChart.destroy();
  if (trendChart) trendChart.destroy();

  // Aggregate Category Data
  let transportSum = 0;
  let dietSum = 0;
  let energySum = 0;
  let offsetSum = 0;

  state.ledger.forEach(item => {
    const val = parseFloat(item.emissions);
    if (item.category === 'transport') transportSum += val;
    else if (item.category === 'diet') dietSum += val;
    else if (item.category === 'utilities') energySum += val;
    else if (item.category === 'offset') offsetSum += Math.abs(val);
  });

  // Default display values if empty
  const hasData = (transportSum + dietSum + energySum + offsetSum) > 0;
  const chartLabels = ['Transport', 'Diet', 'Home Utilities', 'Habit Offsets'];
  const chartData = hasData 
    ? [transportSum, dietSum, energySum, offsetSum]
    : [30, 25, 45, 10]; // Mock demo distribution

  // Style customization variables
  Chart.defaults.color = '#94a3b8';
  Chart.defaults.font.family = 'Inter';

  // 1. Donut Chart - Categories
  categoryChart = new Chart(canvasCat, {
    type: 'doughnut',
    data: {
      labels: chartLabels,
      datasets: [{
        data: chartData,
        backgroundColor: [
          '#38bdf8', // Blue
          '#fca5a5', // Rose/Red
          '#fde047', // Yellow
          '#2ECC71'  // Accent
        ],
        borderWidth: 1,
        borderColor: '#1e293b'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right',
          labels: {
            boxWidth: 12,
            font: { size: 11 }
          }
        }
      },
      cutout: '70%'
    }
  });

  // 2. Trend Bar Chart - Daily usage vs budget limit
  // Parse emissions by day for demonstration. In a full system we would map by day of week.
  // For MVP prototype demo: mock past 7 days based on ledger entries
  const dailyEmissions = [0, 0, 0, 0, 0, 0, 0];
  state.ledger.forEach((item, idx) => {
    // Distribute entries mockingly to construct trend curves
    const dayIndex = idx % 7;
    dailyEmissions[dayIndex] += Math.max(0, item.emissions);
  });

  // If empty ledger, show static demo curve
  const hasTrendData = state.ledger.length > 0;
  const trendDataValues = hasTrendData 
    ? dailyEmissions
    : [12, 8, 15, 6, 11, 4, 2];

  trendChart = new Chart(canvasTrend, {
    type: 'bar',
    data: {
      labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
      datasets: [
        {
          label: 'Daily Footprint (kg CO2e)',
          data: trendDataValues,
          backgroundColor: 'rgba(46, 125, 50, 0.45)',
          borderColor: 'var(--color-emerald)',
          borderWidth: 1.5,
          borderRadius: 4
        },
        {
          label: 'Daily Budget Limit',
          data: Array(7).fill(state.weeklyBudget / 7),
          type: 'line',
          borderColor: '#f97316',
          borderWidth: 2,
          borderDash: [5, 5],
          pointStyle: 'none',
          pointRadius: 0,
          fill: false
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          grid: { color: 'rgba(255, 255, 255, 0.05)' }
        },
        x: {
          grid: { display: false }
        }
      },
      plugins: {
        legend: {
          position: 'top',
          labels: { boxWidth: 12, font: { size: 10 } }
        }
      }
    }
  });
}
