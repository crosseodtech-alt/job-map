// ===== API URLS =====
const API_URL = 'https://sigacts-backend.onrender.com';
const AFG_API_URL = 'https://sigacts-backend.onrender.com';

// ===== CARTO BASEMAPS =====
// CARTO raster basemaps require an API key (restricted by domain in the CARTO dashboard)
const CARTO_KEY = 'cb1_43j6_1_27d8bd352526f68ac0fb3fb4';
const CARTO_LIGHT_URL = 'https://basemaps.cartocdn.com/rastertiles/light_all/{z}/{x}/{y}.png?key=' + CARTO_KEY;
const CARTO_DARK_URL  = 'https://basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}.png?key=' + CARTO_KEY;
const CARTO_ATTRIBUTION = '© OpenStreetMap contributors © CARTO';

// ===== MAIN VIEW SWITCHING =====
function switchMainView(view) {
  document.querySelectorAll('.view-container').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('button.main-tab-btn').forEach(b => b.classList.remove('active'));

  const viewMap = {
    'iraq-map':  'iraq-map-view',
    'iraq-dash': 'iraq-dash-view',
    'afg-map':   'afg-map-view',
    'afg-dash':  'afg-dash-view'
  };

  document.getElementById(viewMap[view]).classList.add('active');
  document.querySelectorAll('button.main-tab-btn')[
    ['iraq-map','iraq-dash','afg-map','afg-dash'].indexOf(view)
  ].classList.add('active');

  if (view === 'iraq-map') {
    if (myMap) setTimeout(() => myMap.invalidateSize(), 100);
  } else if (view === 'iraq-dash') {
    setTimeout(() => resizeIraqCharts(), 200);
  } else if (view === 'afg-map') {
    if (myAfgMap) setTimeout(() => myAfgMap.invalidateSize(), 100);
    // Lazy-init Afghanistan map the first time the tab is opened
    if (!afgMapInitialized) {
      afgMapInitialized = true;
      initAfgMap();
      loadAfgMetadata();
      loadAfgDates();
    }
  } else if (view === 'afg-dash') {
    setTimeout(() => resizeAfgCharts(), 200);
    // Lazy-init Afghanistan dashboard the first time the tab is opened
    if (!afgDashInitialized) {
      afgDashInitialized = true;
      loadAfgDashboardData();
    }
  }
}

// ===== IRAQ CHART RESIZING =====
function resizeIraqCharts() {
  if (treemapChart)      treemapChart.updateOptions({ chart: { height: '100%', width: '100%' } }, false, true);
  if (radarChartEnemy)   radarChartEnemy.updateOptions({ chart: { height: '100%', width: '100%' } }, false, true);
  if (radarChartExplosive) radarChartExplosive.updateOptions({ chart: { height: '100%', width: '100%' } }, false, true);
  if (barChart)          barChart.updateOptions({ chart: { height: '100%' } }, false, true);
}

// ===== AFGHANISTAN CHART RESIZING =====
function resizeAfgCharts() {
  if (afgTreemapChart)       afgTreemapChart.updateOptions({ chart: { height: '100%', width: '100%' } }, false, true);
  if (afgRadarChartEnemy)    afgRadarChartEnemy.updateOptions({ chart: { height: '100%', width: '100%' } }, false, true);
  if (afgRadarChartExplosive) afgRadarChartExplosive.updateOptions({ chart: { height: '100%', width: '100%' } }, false, true);
  if (afgBarChart)           afgBarChart.updateOptions({ chart: { height: '100%' } }, false, true);
}

// ===== DASHBOARD TAB SWITCHING =====
// theater = 'iraq' or 'afg'
function switchDashTab(theater, tabName) {
  const prefix = theater === 'afg' ? 'afg-' : '';

  // Deactivate all buttons and panes within this theater's dashboard
  const container = document.getElementById(
    theater === 'afg' ? 'afg-dash-view' : 'iraq-dash-view'
  );
  container.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));
  container.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));

  document.getElementById(`${prefix}${tabName}-tab-btn`).classList.add('active');
  document.getElementById(`${prefix}${tabName}-pane`).classList.add('active');

  setTimeout(() => {
    if (theater === 'afg') resizeAfgCharts();
    else resizeIraqCharts();
  }, 200);
}

// =============================================================
// ===== IRAQ MAP ===============================================
// =============================================================
let myMap, markerCluster, heatLayer, iraqBoundary;
let allDates = [], currentDateIndex = 0;
let dates = [], filteredIncidents = [], viewMode = 'markers';
let dateSlider, dateDisplay, typeFilter, categoryFilter, regionFilter, incidentCountDisplay;
let types = [], categories = [], regions = [];

// ===== IRAQ DASHBOARD =====
let treemapChart, radarChartEnemy, radarChartExplosive, barChart;

// Start once the page's HTML is ready (replaces the old p5.js setup())
document.addEventListener('DOMContentLoaded', async () => {
  initMap();
  const serverReady = await waitForServer();
  if (!serverReady) return;
  loadMetadata();
  loadDates();
  loadDashboardData();
});

// ===== SERVER WAKE-UP =====
// The backend runs on Render's free tier, which sleeps when idle and can take
// up to a minute to wake. This checks the server's status endpoint and only
// shows a banner if the server hasn't answered within BANNER_DELAY_MS.
const BANNER_DELAY_MS  = 2000;   // don't show the banner if the server is already awake
const WAKE_TIMEOUT_MS  = 90000;  // give up and show an error after this long
const RETRY_EVERY_MS   = 3000;   // how often to re-check while waiting

async function waitForServer() {
  const banner = document.getElementById('server-status');
  const text   = document.getElementById('server-status-text');
  const start  = Date.now();
  const showTimer = setTimeout(() => banner.classList.add('visible'), BANNER_DELAY_MS);

  while (Date.now() - start < WAKE_TIMEOUT_MS) {
    try {
      const controller = new AbortController();
      const abortTimer = setTimeout(() => controller.abort(), 30000);
      const response = await fetch(`${API_URL}/`, { signal: controller.signal });
      clearTimeout(abortTimer);
      if (response.ok) {
        const status = await response.json();
        if (status.status && status.status.iraq === 'ready') {
          clearTimeout(showTimer);
          banner.classList.remove('visible');
          return true;
        }
        text.textContent = 'Server is awake, loading incident data…';
      }
    } catch (error) {
      // Server still asleep or starting; keep waiting
    }
    await new Promise(resolve => setTimeout(resolve, RETRY_EVERY_MS));
  }

  clearTimeout(showTimer);
  banner.classList.add('visible', 'error');
  text.innerHTML = 'The data server is not responding right now. ' +
    '<button type="button" onclick="location.reload()">Try again</button>';
  return false;
}

async function loadMetadata() {
  try {
    const response = await fetch(`${API_URL}/api/metadata`);
    const data = await response.json();
    types = data.types;
    categories = data.categories;
    regions = data.provinces;
    populateFilters();
  } catch (error) {
    console.error('Error loading Iraq metadata:', error);
  }
}

async function loadDates() {
  try {
    const response = await fetch(`${API_URL}/api/dates`);
    const data = await response.json();
    allDates = data.dates;
    dates = allDates;
    setupDateSlider();
    loadDate(0);
  } catch (error) {
    console.error('Error loading Iraq dates:', error);
  }
}

function initMap() {
  myMap = L.map('map').setView([33.3, 44.4], 6);
  let osmMap  = L.tileLayer(CARTO_LIGHT_URL, { attribution: CARTO_ATTRIBUTION, maxZoom: 19 });
  let darkMap = L.tileLayer(CARTO_DARK_URL,  { attribution: CARTO_ATTRIBUTION, maxZoom: 19 });
  let satMap  = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { attribution: '© Esri' });
  darkMap.addTo(myMap);

  // Apply contrast boost only to the dark tile layer, not light or satellite
  darkMap.on('add', function() {
    const el = this.getContainer();
    if (el) el.style.filter = 'brightness(1.15) contrast(1.25)';
  });

  L.control.layers({ 'Light': osmMap, 'Dark Matter': darkMap, 'Satellite View': satMap }).addTo(myMap);

  fetch(`${API_URL}/api/boundary`)
    .then(r => r.json())
    .then(geoJSON => {
      iraqBoundary = L.geoJSON(geoJSON, {
        style: { color: '#FFD700', weight: 2, fillOpacity: 0, opacity: 0.7 }
      }).addTo(myMap);
    })
    .catch(error => console.error('Error loading Iraq boundary:', error));

  markerCluster = L.markerClusterGroup({ maxClusterRadius: 50, spiderfyOnMaxZoom: true, showCoverageOnHover: false });
  myMap.addLayer(markerCluster);

  heatLayer = L.heatLayer([], { radius: 20, blur: 25, maxZoom: 18, max: 0.1, minOpacity: 0.8,
    gradient: { 0.2: 'blue', 0.4: 'cyan', 0.6: 'lime', 0.8: 'yellow', 1.0: 'red' }
  });

  dateSlider           = document.getElementById('date-slider');
  dateDisplay          = document.getElementById('current-date');
  typeFilter           = document.getElementById('type-filter');
  categoryFilter       = document.getElementById('category-filter');
  regionFilter         = document.getElementById('region-filter');
  incidentCountDisplay = document.getElementById('incident-count');

  dateSlider.addEventListener('input', onDateChange);
  document.getElementById('prev-date').addEventListener('click', previousDate);
  document.getElementById('next-date').addEventListener('click', nextDate);
  typeFilter.addEventListener('change', applyFilters);
  categoryFilter.addEventListener('change', applyFilters);
  regionFilter.addEventListener('change', applyFilters);
  document.getElementById('toggle-markers').addEventListener('click', () => switchViewMode('markers'));
  document.getElementById('toggle-heatmap').addEventListener('click',  () => switchViewMode('heatmap'));
}

function setupDateSlider() {
  dateSlider.max = dates.length - 1;
  dateSlider.disabled = false;
  document.getElementById('prev-date').disabled = false;
  document.getElementById('next-date').disabled = false;
}

function populateFilters() {
  types.forEach(type => {
    let opt = document.createElement('option');
    opt.value = type; opt.textContent = type;
    typeFilter.appendChild(opt);
  });
  categories.forEach(cat => {
    let opt = document.createElement('option');
    opt.value = cat; opt.textContent = cat;
    categoryFilter.appendChild(opt);
  });
  regions.forEach(region => {
    let opt = document.createElement('option');
    opt.value = region; opt.textContent = region;
    regionFilter.appendChild(opt);
  });
}

function onDateChange() {
  currentDateIndex = parseInt(dateSlider.value);
  loadDate(currentDateIndex);
}

function previousDate() {
  if (currentDateIndex > 0) {
    currentDateIndex--;
    dateSlider.value = currentDateIndex;
    loadDate(currentDateIndex);
  }
}

function nextDate() {
  if (currentDateIndex < dates.length - 1) {
    currentDateIndex++;
    dateSlider.value = currentDateIndex;
    loadDate(currentDateIndex);
  }
}

async function loadDate(index) {
  let selectedDate = dates[index];
  dateDisplay.textContent = selectedDate;

  const typeValue     = typeFilter.value;
  const categoryValue = categoryFilter.value;
  const regionValue   = regionFilter.value;

  let url = `${API_URL}/api/incidents/${selectedDate}`;
  const params = new URLSearchParams();
  if (typeValue     && typeValue     !== 'all') params.append('type',     typeValue);
  if (categoryValue && categoryValue !== 'all') params.append('category', categoryValue);
  if (regionValue   && regionValue   !== 'all') params.append('province', regionValue);
  if (params.toString()) url += '?' + params.toString();

  try {
    const response = await fetch(url);
    const data = await response.json();
    filteredIncidents = data.incidents;
    incidentCountDisplay.textContent = data.count;
    drawIncidents();
  } catch (error) {
    console.error('Error loading Iraq incidents:', error);
  }
}

function applyFilters() { loadDate(currentDateIndex); }

function drawIncidents() {
  if (viewMode === 'markers') {
    markerCluster.clearLayers();
    filteredIncidents.forEach(incident => markerCluster.addLayer(createIncidentMarker(incident)));
  } else if (viewMode === 'heatmap') {
    updateHeatmap();
  }
}

function createIncidentMarker(incident) {
  let color = getIncidentColor(incident.type);
  let icon = L.divIcon({
    className: 'custom-marker',
    html: `<div style="background-color:${color};width:12px;height:12px;border-radius:50%;border:2px solid white;"></div>`,
    iconSize: [12, 12]
  });
  let marker = L.marker([incident.lat, incident.lng], { icon });
  let popupContent = `<div style="min-width:250px;">
    <h3 style="margin:0 0 10px 0;font-size:14px;color:${color};">${incident.type}</h3>
    <p style="margin:5px 0;"><strong>Category:</strong> ${incident.category}</p>
    <p style="margin:5px 0;"><strong>Target Category:</strong> ${incident.targetCategory}</p>
    <p style="margin:5px 0;"><strong>Target:</strong> ${incident.target}</p>
    <p style="margin:5px 0;"><strong>Force Type:</strong> ${incident.forceType}</p>
    <p style="margin:5px 0;"><strong>Time:</strong> ${incident.time || 'N/A'}</p>
    <p style="margin:5px 0;"><strong>City:</strong> ${incident.city}</p>
    <p style="margin:5px 0;"><strong>Province:</strong> ${incident.province}</p>
  </div>`;
  marker.bindPopup(popupContent);
  return marker;
}

function getIncidentColor(type) {
  switch (type) {
    case 'Enemy Action':    return '#e74c3c';
    case 'Explosive Hazard': return '#f39c12';
    case 'Friendly Fire':   return '#3498db';
    default:                return '#95a5a6';
  }
}

function switchViewMode(mode) {
  viewMode = mode;
  document.getElementById('toggle-markers').classList.remove('active');
  document.getElementById('toggle-heatmap').classList.remove('active');
  if (mode === 'markers') {
    document.getElementById('toggle-markers').classList.add('active');
    if (heatLayer) myMap.removeLayer(heatLayer);
    myMap.addLayer(markerCluster);
  } else {
    document.getElementById('toggle-heatmap').classList.add('active');
    if (!heatLayer) return;
    myMap.removeLayer(markerCluster);
    myMap.addLayer(heatLayer);
    setTimeout(() => heatLayer.redraw(), 100);
  }
  drawIncidents();
}

function updateHeatmap() {
  let heatData = filteredIncidents.map(incident => {
    let intensity = incident.type === 'Enemy Action' ? 1.0 : incident.type === 'Explosive Hazard' ? 0.8 : 0.6;
    return [incident.lat, incident.lng, intensity];
  });
  heatLayer.setLatLngs(heatData);
  heatLayer.redraw();
}

// ===== IRAQ DASHBOARD =====
async function loadDashboardData() {
  loadTreemapData();
  loadRadarData();
  loadHeatmapData();
}

async function loadTreemapData() {
  try {
    const response = await fetch(`${API_URL}/api/dashboard/treemap`);
    const data = await response.json();
    initTreemapChart(data.series);
  } catch (error) { console.error('Error loading Iraq treemap data:', error); }
}

async function loadRadarData() {
  try {
    const response = await fetch(`${API_URL}/api/dashboard/radar`);
    const data = await response.json();
    initRadarChartEnemy(data.enemy);
    initRadarChartExplosive(data.explosive);
  } catch (error) { console.error('Error loading Iraq radar data:', error); }
}

async function loadHeatmapData() {
  try {
    const response = await fetch(`${API_URL}/api/dashboard/heatmap`);
    const data = await response.json();
    initBarChart(data);
  } catch (error) { console.error('Error loading Iraq heatmap data:', error); }
}

function initTreemapChart(series) {
  let options = {
    series,
    chart: { type: 'treemap', height: '100%', background: 'transparent',
      toolbar: { show: true, tools: { download: true, zoom: false, zoomin: false, zoomout: false, pan: false, reset: false } },
      animations: { enabled: true, speed: 800 } },
    theme: { mode: 'dark', palette: 'palette2' },
    legend: { show: false },
    plotOptions: { treemap: { distributed: true, enableShades: true, shadeIntensity: 0.4 } },
    dataLabels: { enabled: true, style: { fontSize: '12px', fontWeight: 'bold' }, offsetY: -4,
      formatter: (text, op) => [text, op.value] },
    tooltip: { theme: 'dark', y: { formatter: v => v + ' incidents' } }
  };
  treemapChart = new ApexCharts(document.querySelector('#treemap-chart'), options);
  treemapChart.render();
}

function initRadarChartEnemy(data) {
  let options = {
    series: [{ name: 'Incident Count', data: data.values }],
    chart: { type: 'radar', height: '100%', width: '100%', background: 'transparent', toolbar: { show: false }, animations: { enabled: true, speed: 800 } },
    theme: { mode: 'dark' },
    title: { text: 'Enemy Action - Time Distribution', align: 'center', style: { fontSize: '16px', color: '#ff6b6b', fontWeight: 'bold' } },
    xaxis: { categories: data.categories, labels: { show: true, style: { colors: Array(data.categories.length).fill('#fff'), fontSize: '11px' } } },
    yaxis: { show: false },
    fill: { opacity: 0.3, colors: ['#ff6b6b'] },
    stroke: { show: true, width: 3, colors: ['#ff6b6b'] },
    markers: { size: 5, colors: ['#ff6b6b'], strokeColors: '#fff', strokeWidth: 2, hover: { size: 8 } },
    plotOptions: { radar: { polygons: { strokeColors: '#3a3f5c', strokeWidth: 1, connectorColors: '#3a3f5c', fill: { colors: ['#1e1e2e', '#252536'] } } } },
    tooltip: { theme: 'dark', y: { formatter: v => v + ' incidents' } },
    legend: { show: false }
  };
  options.chart.height = '100%';
  options.chart.width = '100%';
  options.responsive = [{ breakpoint: 10000, options: { chart: { height: '100%', width: '100%' } } }];
  radarChartEnemy = new ApexCharts(document.querySelector('#radar-chart-enemy'), options);
  radarChartEnemy.render();
}

function initRadarChartExplosive(data) {
  let options = {
    series: [{ name: 'Incident Count', data: data.values }],
    chart: { type: 'radar', height: '100%', width: '100%', background: 'transparent', toolbar: { show: false }, animations: { enabled: true, speed: 800 } },
    theme: { mode: 'dark' },
    title: { text: 'Explosive Hazard - Time Distribution', align: 'center', style: { fontSize: '16px', color: '#ffd93d', fontWeight: 'bold' } },
    xaxis: { categories: data.categories, labels: { show: true, style: { colors: Array(data.categories.length).fill('#fff'), fontSize: '11px' } } },
    yaxis: { show: false },
    fill: { opacity: 0.3, colors: ['#ffd93d'] },
    stroke: { show: true, width: 3, colors: ['#ffd93d'] },
    markers: { size: 5, colors: ['#ffd93d'], strokeColors: '#fff', strokeWidth: 2, hover: { size: 8 } },
    plotOptions: { radar: { polygons: { strokeColors: '#3a3f5c', strokeWidth: 1, connectorColors: '#3a3f5c', fill: { colors: ['#1e1e2e', '#252536'] } } } },
    tooltip: { theme: 'dark', y: { formatter: v => v + ' incidents' } },
    legend: { show: false }
  };
  options.chart.height = '100%';
  options.chart.width = '100%';
  options.responsive = [{ breakpoint: 10000, options: { chart: { height: '100%', width: '100%' } } }];
  radarChartExplosive = new ApexCharts(document.querySelector('#radar-chart-explosive'), options);
  radarChartExplosive.render();
}

function initBarChart(data) {
  let yearlyData = {};
  let dates = data.dates;
  let counts = data.counts;
  for (let i = 0; i < dates.length; i++) {
    let year = dates[i].split('-')[0];
    if (!yearlyData[year]) yearlyData[year] = [];
    yearlyData[year].push(counts[i]);
  }
  let years = Object.keys(yearlyData).sort();
  let series = years.map(year => ({
    name: year,
    data: yearlyData[year].map((count, index) => ({ x: index + 1, y: count }))
  }));
  renderHeatmapChart('#bar-chart', series, '2003-2011', barChart, chart => { barChart = chart; });
}

// =============================================================
// ===== AFGHANISTAN MAP =======================================
// =============================================================
let myAfgMap, afgMarkerCluster, afgHeatLayer, afgBoundary;
let afgAllDates = [], afgCurrentDateIndex = 0;
let afgDates = [], afgFilteredIncidents = [], afgViewMode = 'markers';
let afgDateSlider, afgDateDisplay, afgTypeFilter, afgCategoryFilter, afgIncidentCountDisplay;
let afgTypes = [], afgCategories = [];

// Lazy-init flags: prevents double-initialization if user clicks tabs fast
let afgMapInitialized  = false;
let afgDashInitialized = false;

// ===== AFGHANISTAN DASHBOARD =====
let afgTreemapChart, afgRadarChartEnemy, afgRadarChartExplosive, afgBarChart;

async function loadAfgMetadata() {
  try {
    const response = await fetch(`${AFG_API_URL}/api/afg/metadata`);
    const data = await response.json();
    afgTypes      = data.types;
    afgCategories = data.categories;
    populateAfgFilters();
  } catch (error) { console.error('Error loading Afghanistan metadata:', error); }
}

async function loadAfgDates() {
  try {
    const response = await fetch(`${AFG_API_URL}/api/afg/dates`);
    const data = await response.json();
    afgAllDates = data.dates;
    afgDates    = afgAllDates;
    setupAfgDateSlider();
    loadAfgDate(0);
  } catch (error) { console.error('Error loading Afghanistan dates:', error); }
}

function initAfgMap() {
  myAfgMap = L.map('afg-map').setView([33.9, 67.7], 6);
  let osmMap  = L.tileLayer(CARTO_LIGHT_URL, { attribution: CARTO_ATTRIBUTION, maxZoom: 19 });
  let darkMap = L.tileLayer(CARTO_DARK_URL,  { attribution: CARTO_ATTRIBUTION, maxZoom: 19 });
  let satMap  = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { attribution: '© Esri' });
  darkMap.addTo(myAfgMap);

  // Apply contrast boost only to the dark tile layer, not light or satellite
  darkMap.on('add', function() {
    const el = this.getContainer();
    if (el) el.style.filter = 'brightness(1.15) contrast(1.25)';
  });

  L.control.layers({ 'Light': osmMap, 'Dark Matter': darkMap, 'Satellite View': satMap }).addTo(myAfgMap);

  fetch(`${AFG_API_URL}/api/afg/boundary`)
    .then(r => r.json())
    .then(geoJSON => {
      afgBoundary = L.geoJSON(geoJSON, {
        style: { color: '#FFD700', weight: 2, fillOpacity: 0, opacity: 0.7 }
      }).addTo(myAfgMap);
    })
    .catch(error => console.error('Error loading Afghanistan boundary:', error));

  afgMarkerCluster = L.markerClusterGroup({ maxClusterRadius: 50, spiderfyOnMaxZoom: true, showCoverageOnHover: false });
  myAfgMap.addLayer(afgMarkerCluster);

  afgHeatLayer = L.heatLayer([], { radius: 20, blur: 25, maxZoom: 18, max: 0.1, minOpacity: 0.8,
    gradient: { 0.2: 'blue', 0.4: 'cyan', 0.6: 'lime', 0.8: 'yellow', 1.0: 'red' }
  });

  afgDateSlider           = document.getElementById('afg-date-slider');
  afgDateDisplay          = document.getElementById('afg-current-date');
  afgTypeFilter           = document.getElementById('afg-type-filter');
  afgCategoryFilter       = document.getElementById('afg-category-filter');
  afgIncidentCountDisplay = document.getElementById('afg-incident-count');

  afgDateSlider.addEventListener('input', onAfgDateChange);
  document.getElementById('afg-prev-date').addEventListener('click', previousAfgDate);
  document.getElementById('afg-next-date').addEventListener('click', nextAfgDate);
  afgTypeFilter.addEventListener('change', applyAfgFilters);
  afgCategoryFilter.addEventListener('change', applyAfgFilters);
  document.getElementById('afg-toggle-markers').addEventListener('click', () => switchAfgViewMode('markers'));
  document.getElementById('afg-toggle-heatmap').addEventListener('click',  () => switchAfgViewMode('heatmap'));
}

function setupAfgDateSlider() {
  afgDateSlider.max = afgDates.length - 1;
  afgDateSlider.disabled = false;
  document.getElementById('afg-prev-date').disabled = false;
  document.getElementById('afg-next-date').disabled = false;
}

function populateAfgFilters() {
  afgTypes.forEach(type => {
    let opt = document.createElement('option');
    opt.value = type; opt.textContent = type;
    afgTypeFilter.appendChild(opt);
  });
  afgCategories.forEach(cat => {
    let opt = document.createElement('option');
    opt.value = cat; opt.textContent = cat;
    afgCategoryFilter.appendChild(opt);
  });
}

function onAfgDateChange() {
  afgCurrentDateIndex = parseInt(afgDateSlider.value);
  loadAfgDate(afgCurrentDateIndex);
}

function previousAfgDate() {
  if (afgCurrentDateIndex > 0) {
    afgCurrentDateIndex--;
    afgDateSlider.value = afgCurrentDateIndex;
    loadAfgDate(afgCurrentDateIndex);
  }
}

function nextAfgDate() {
  if (afgCurrentDateIndex < afgDates.length - 1) {
    afgCurrentDateIndex++;
    afgDateSlider.value = afgCurrentDateIndex;
    loadAfgDate(afgCurrentDateIndex);
  }
}

async function loadAfgDate(index) {
  let selectedDate = afgDates[index];
  afgDateDisplay.textContent = selectedDate;

  const typeValue     = afgTypeFilter.value;
  const categoryValue = afgCategoryFilter.value;

  let url = `${AFG_API_URL}/api/afg/incidents/${selectedDate}`;
  const params = new URLSearchParams();
  if (typeValue     && typeValue     !== 'all') params.append('type',     typeValue);
  if (categoryValue && categoryValue !== 'all') params.append('category', categoryValue);
  if (params.toString()) url += '?' + params.toString();

  try {
    const response = await fetch(url);
    const data = await response.json();
    afgFilteredIncidents = data.incidents;
    afgIncidentCountDisplay.textContent = data.count;
    drawAfgIncidents();
  } catch (error) { console.error('Error loading Afghanistan incidents:', error); }
}

function applyAfgFilters() { loadAfgDate(afgCurrentDateIndex); }

function drawAfgIncidents() {
  if (afgViewMode === 'markers') {
    afgMarkerCluster.clearLayers();
    afgFilteredIncidents.forEach(incident => afgMarkerCluster.addLayer(createAfgIncidentMarker(incident)));
  } else if (afgViewMode === 'heatmap') {
    updateAfgHeatmap();
  }
}

function createAfgIncidentMarker(incident) {
  let color = getIncidentColor(incident.type);
  let icon = L.divIcon({
    className: 'custom-marker',
    html: `<div style="background-color:${color};width:12px;height:12px;border-radius:50%;border:2px solid white;"></div>`,
    iconSize: [12, 12]
  });
  let marker = L.marker([incident.lat, incident.lng], { icon });
  let popupContent = `<div style="min-width:200px;">
    <h3 style="margin:0 0 10px 0;font-size:14px;color:${color};">${incident.type}</h3>
    <p style="margin:5px 0;"><strong>Category:</strong> ${incident.category}</p>
    <p style="margin:5px 0;"><strong>Date:</strong> ${incident.date}</p>
    <p style="margin:5px 0;"><strong>Time:</strong> ${incident.time || 'N/A'}</p>
  </div>`;
  marker.bindPopup(popupContent);
  return marker;
}

function switchAfgViewMode(mode) {
  afgViewMode = mode;
  document.getElementById('afg-toggle-markers').classList.remove('active');
  document.getElementById('afg-toggle-heatmap').classList.remove('active');
  if (mode === 'markers') {
    document.getElementById('afg-toggle-markers').classList.add('active');
    if (afgHeatLayer) myAfgMap.removeLayer(afgHeatLayer);
    myAfgMap.addLayer(afgMarkerCluster);
  } else {
    document.getElementById('afg-toggle-heatmap').classList.add('active');
    if (!afgHeatLayer) return;
    myAfgMap.removeLayer(afgMarkerCluster);
    myAfgMap.addLayer(afgHeatLayer);
    setTimeout(() => afgHeatLayer.redraw(), 100);
  }
  drawAfgIncidents();
}

function updateAfgHeatmap() {
  let heatData = afgFilteredIncidents.map(incident => {
    let intensity = incident.type === 'Enemy Action' ? 1.0 : incident.type === 'Explosive Hazard' ? 0.8 : 0.6;
    return [incident.lat, incident.lng, intensity];
  });
  afgHeatLayer.setLatLngs(heatData);
  afgHeatLayer.redraw();
}

// ===== AFGHANISTAN DASHBOARD =====
async function loadAfgDashboardData() {
  loadAfgTreemapData();
  loadAfgRadarData();
  loadAfgHeatmapData();
}

async function loadAfgTreemapData() {
  try {
    const response = await fetch(`${AFG_API_URL}/api/afg/dashboard/treemap`);
    const data = await response.json();
    initAfgTreemapChart(data.series);
  } catch (error) { console.error('Error loading Afghanistan treemap data:', error); }
}

async function loadAfgRadarData() {
  try {
    const response = await fetch(`${AFG_API_URL}/api/afg/dashboard/radar`);
    const data = await response.json();
    initAfgRadarChartEnemy(data.enemy);
    initAfgRadarChartExplosive(data.explosive);
  } catch (error) { console.error('Error loading Afghanistan radar data:', error); }
}

async function loadAfgHeatmapData() {
  try {
    const response = await fetch(`${AFG_API_URL}/api/afg/dashboard/heatmap`);
    const data = await response.json();
    initAfgBarChart(data);
  } catch (error) { console.error('Error loading Afghanistan heatmap data:', error); }
}

function initAfgTreemapChart(series) {
  let options = {
    series,
    chart: { type: 'treemap', height: '100%', background: 'transparent',
      toolbar: { show: true, tools: { download: true, zoom: false, zoomin: false, zoomout: false, pan: false, reset: false } },
      animations: { enabled: true, speed: 800 } },
    theme: { mode: 'dark', palette: 'palette2' },
    legend: { show: false },
    plotOptions: { treemap: { distributed: true, enableShades: true, shadeIntensity: 0.4 } },
    dataLabels: { enabled: true, style: { fontSize: '12px', fontWeight: 'bold' }, offsetY: -4,
      formatter: (text, op) => [text, op.value] },
    tooltip: { theme: 'dark', y: { formatter: v => v + ' incidents' } }
  };
  afgTreemapChart = new ApexCharts(document.querySelector('#afg-treemap-chart'), options);
  afgTreemapChart.render();
}

function initAfgRadarChartEnemy(data) {
  let options = {
    series: [{ name: 'Incident Count', data: data.values }],
    chart: { type: 'radar', height: '100%', width: '100%', background: 'transparent', toolbar: { show: false }, animations: { enabled: true, speed: 800 } },
    theme: { mode: 'dark' },
    title: { text: 'Enemy Action - Time Distribution', align: 'center', style: { fontSize: '16px', color: '#ff6b6b', fontWeight: 'bold' } },
    xaxis: { categories: data.categories, labels: { show: true, style: { colors: Array(data.categories.length).fill('#fff'), fontSize: '11px' } } },
    yaxis: { show: false },
    fill: { opacity: 0.3, colors: ['#ff6b6b'] },
    stroke: { show: true, width: 3, colors: ['#ff6b6b'] },
    markers: { size: 5, colors: ['#ff6b6b'], strokeColors: '#fff', strokeWidth: 2, hover: { size: 8 } },
    plotOptions: { radar: { polygons: { strokeColors: '#3a3f5c', strokeWidth: 1, connectorColors: '#3a3f5c', fill: { colors: ['#1e1e2e', '#252536'] } } } },
    tooltip: { theme: 'dark', y: { formatter: v => v + ' incidents' } },
    legend: { show: false }
  };
  options.chart.height = '100%';
  options.chart.width = '100%';
  options.responsive = [{ breakpoint: 10000, options: { chart: { height: '100%', width: '100%' } } }];
  afgRadarChartEnemy = new ApexCharts(document.querySelector('#afg-radar-chart-enemy'), options);
  afgRadarChartEnemy.render();
}

function initAfgRadarChartExplosive(data) {
  let options = {
    series: [{ name: 'Incident Count', data: data.values }],
    chart: { type: 'radar', height: '100%', width: '100%', background: 'transparent', toolbar: { show: false }, animations: { enabled: true, speed: 800 } },
    theme: { mode: 'dark' },
    title: { text: 'Explosive Hazard - Time Distribution', align: 'center', style: { fontSize: '16px', color: '#ffd93d', fontWeight: 'bold' } },
    xaxis: { categories: data.categories, labels: { show: true, style: { colors: Array(data.categories.length).fill('#fff'), fontSize: '11px' } } },
    yaxis: { show: false },
    fill: { opacity: 0.3, colors: ['#ffd93d'] },
    stroke: { show: true, width: 3, colors: ['#ffd93d'] },
    markers: { size: 5, colors: ['#ffd93d'], strokeColors: '#fff', strokeWidth: 2, hover: { size: 8 } },
    plotOptions: { radar: { polygons: { strokeColors: '#3a3f5c', strokeWidth: 1, connectorColors: '#3a3f5c', fill: { colors: ['#1e1e2e', '#252536'] } } } },
    tooltip: { theme: 'dark', y: { formatter: v => v + ' incidents' } },
    legend: { show: false }
  };
  options.chart.height = '100%';
  options.chart.width = '100%';
  options.responsive = [{ breakpoint: 10000, options: { chart: { height: '100%', width: '100%' } } }];
  afgRadarChartExplosive = new ApexCharts(document.querySelector('#afg-radar-chart-explosive'), options);
  afgRadarChartExplosive.render();
}

function initAfgBarChart(data) {
  let yearlyData = {};
  let dates = data.dates;
  let counts = data.counts;
  for (let i = 0; i < dates.length; i++) {
    let year = dates[i].split('-')[0];
    if (!yearlyData[year]) yearlyData[year] = [];
    yearlyData[year].push(counts[i]);
  }
  let years = Object.keys(yearlyData).sort();
  let series = years.map(year => ({
    name: year,
    data: yearlyData[year].map((count, index) => ({ x: index + 1, y: count }))
  }));
  renderHeatmapChart('#afg-bar-chart', series, '2008-2014', afgBarChart, chart => { afgBarChart = chart; });
}

// =============================================================
// ===== SHARED HEATMAP CHART RENDERER =========================
// =============================================================
// Both Iraq and Afghanistan use identical heatmap chart config.
// selector  = CSS selector string for the chart container div
// series    = pre-built ApexCharts series array
// yearRange = label string shown in no-data state (unused visually)
// chartRef  = existing chart instance (unused, kept for signature parity)
// setter    = callback to assign the new chart instance to the caller's variable
function renderHeatmapChart(selector, series, yearRange, chartRef, setter) {
  const monthStart      = [1,32,60,91,121,152,182,213,244,274,305,335];
  const monthNamesFull  = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const monthEnd        = monthStart.map((s, i) => i < monthStart.length - 1 ? monthStart[i+1] - 1 : 365);
  const monthCenters    = monthStart.map((s, i) => (s + monthEnd[i]) / 2);
  const monthBoundaryAnnotations = monthStart.map(s => ({
    x: s, borderColor: '#2f3348', strokeDashArray: 2, borderWidth: 1, label: { text: '' }
  }));

  let options = {
    series,
    chart: { type: 'heatmap', height: '100%', background: 'transparent',
      toolbar: { show: true, tools: { download: true, zoom: false, zoomin: false, zoomout: false, pan: false, reset: false } } },
    theme: { mode: 'dark' },
    dataLabels: { enabled: false },
    stroke: { show: false, width: 0 },
    colors: ['#4fc3f7'],
    xaxis: {
      type: 'category',
      categories: Array.from({ length: 365 }, (_, i) => i + 1),
      tickAmount: 12,
      tickPlacement: 'on',
      position: 'bottom',
      labels: {
        show: true, rotate: 0, offsetY: 10,
        style: { colors: '#ffffff', fontSize: '13px', fontWeight: 600 },
        formatter: function(val) {
          const day = parseInt(val);
          for (let i = 0; i < monthStart.length; i++) {
            if (day <= (i < monthEnd.length - 1 ? monthStart[i+1] - 1 : 365)) {
              if (Math.abs(day - monthCenters[i]) < 20) return monthNamesFull[i];
            }
          }
          return '';
        }
      },
      axisBorder: { show: false },
      axisTicks: { show: true }
    },
    annotations: { xaxis: monthBoundaryAnnotations },
    plotOptions: {
      heatmap: {
        radius: 0, enableShades: true, shadeIntensity: 0.8, distributed: false, useFillColorAsStroke: false,
        colorScale: {
          ranges: [
            { from: 0,   to: 10,  color: '#000814', name: '0 - 10'   },
            { from: 11,  to: 30,  color: '#001d3d', name: '11 - 30'  },
            { from: 31,  to: 60,  color: '#003566', name: '31 - 60'  },
            { from: 61,  to: 90,  color: '#0466c8', name: '61 - 90'  },
            { from: 91,  to: 120, color: '#0096c7', name: '91 - 120' },
            { from: 121, to: 150, color: '#48cae4', name: '121 - 150'},
            { from: 151, to: 180, color: '#ffd60a', name: '151 - 180'},
            { from: 181, to: 220, color: '#faa307', name: '181 - 220'},
            { from: 221, to: 270, color: '#f48c06', name: '221 - 270'},
            { from: 271, to: 320, color: '#dc2f02', name: '271 - 320'},
            { from: 321, to: 400, color: '#9d0208', name: '321 +'    }
          ]
        }
      }
    },
    tooltip: {
      theme: 'dark',
      custom: function({ series, seriesIndex, dataPointIndex, w }) {
        let xVal = (w.globals && w.globals.seriesX && w.globals.seriesX[seriesIndex] && w.globals.seriesX[seriesIndex][dataPointIndex])
          ? w.globals.seriesX[seriesIndex][dataPointIndex] : (dataPointIndex + 1);
        let dayOfYear  = Math.round(xVal);
        let monthIdx   = 0;
        for (let i = 0; i < monthEnd.length; i++) { if (dayOfYear <= monthEnd[i]) { monthIdx = i; break; } }
        let dayOfMonth = dayOfYear - monthStart[monthIdx] + 1;
        if (dayOfMonth < 1) dayOfMonth = 1;
        let year  = w.globals.seriesNames && w.globals.seriesNames[seriesIndex] ? w.globals.seriesNames[seriesIndex] : '';
        let count = (series && series[seriesIndex] && series[seriesIndex][dataPointIndex] !== undefined) ? series[seriesIndex][dataPointIndex] : 0;
        return `<div style="padding:10px;background:rgba(10,14,39,0.95);border:1px solid rgba(79,195,247,0.3);">
          <div style="color:#4fc3f7;font-weight:700;margin-bottom:6px;">${year}</div>
          <div style="color:#fff;margin-bottom:6px;">${monthNamesFull[monthIdx]} ${dayOfMonth}</div>
          <div style="color:#fff;">${count} incidents</div>
        </div>`;
      }
    },
    legend: { show: true, position: 'right', labels: { colors: '#fff' }, markers: { width: 20, height: 20 } }
  };

  const chart = new ApexCharts(document.querySelector(selector), options);
  chart.render();
  setter(chart);
}

// ===== WINDOW RESIZE HANDLER =====
window.addEventListener('resize', function() {
  if (document.getElementById('iraq-map-view').classList.contains('active'))  { if (myMap)    myMap.invalidateSize(); }
  if (document.getElementById('afg-map-view').classList.contains('active'))   { if (myAfgMap) myAfgMap.invalidateSize(); }
  if (document.getElementById('iraq-dash-view').classList.contains('active')) { resizeIraqCharts(); }
  if (document.getElementById('afg-dash-view').classList.contains('active'))  { resizeAfgCharts(); }
});