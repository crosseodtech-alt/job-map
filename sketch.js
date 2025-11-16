let leafletMap;
let edjoinJobs = [];
let adzunaJobs = [];
let cityCoords = [];
let edjoinIcon;
let adzunaIcon;
let adzunaCluster;
let edjoinCluster;

function preload() {
  cityCoords = loadTable("CA City coords.csv", "csv", "header");
}

function setup() {
  noCanvas();
  leafletMap = L.map("map").setView([37.0, -119.4], 6);
  

  let osmMap = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {attribution: '© OpenStreetMap'});
  
  let darkMap = L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png", {attribution: '© CartoDB'});
  
  let satMap = L.tileLayer ("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}");
  

  osmMap.addTo(leafletMap);
  

  let baseLayers = {
    "OpenStreetMap": osmMap,
    "Dark Matter": darkMap,
    "Satellite View": satMap
  };
  
  L.control.layers(baseLayers).addTo(leafletMap);

  
  addLegend();
  
  edjoinCluster = L.markerClusterGroup();
  adzunaCluster = L.markerClusterGroup();
  
  leafletMap.addLayer(edjoinCluster);
  leafletMap.addLayer(adzunaCluster);
  
  
  edjoinIcon = L.icon({
    iconUrl: "apple.svg",
    iconSize: [30, 30],
  });

  adzunaIcon = L.icon({
    iconUrl: "globe.svg",
    iconSize: [30, 30],
  });

  loadJSON("https://job-map-backend.onrender.com/api/jobs", (data) => {
    edjoinJobs = data.filter((job) => job.source === "edjoin");
    console.log("EDJoin jobs found:", edjoinJobs.length);
    drawEDJoinJobs();
  });

  let adzunaUrl =
    "https://api.adzuna.com/v1/api/jobs/us/search/1?app_id=86a92f0b&app_key=82634077a4fdd6927ce754ca3c9aaa08&what=GIS%20analyst&where=california&results_per_page=50";
  loadJSON(adzunaUrl, (data) => {
    adzunaJobs = data.results;
    console.log("Adzuna jobs found:", adzunaJobs.length);
    drawAdzunaJobs();
  });
  
  let searchButton = document.getElementById('search-button');
  let searchInput = document.getElementById('search-input');
  
  searchButton.addEventListener('click', function() {
    let searchTerm = searchInput.value;
    if (searchTerm) {
        searchAdzunaJobs(searchTerm);
        }
  });
}

function drawAdzunaJobs() {
  for (let job of adzunaJobs) {
    if (job.latitude && job.longitude) {
      let popupContent = `
        <div style="width: 300px;">
          <h3 style="margin: 0 0 10px 0; font-size: 14px;">${job.title || "No title"}</h3>
          <p style="margin: 5px 0;"><strong>City:</strong> ${job.location?.display_name || "N/A"}</p>
          <p style="margin: 5px 0;"><strong>Salary:</strong> ${formatSalary(job)}</p>
          <p style="margin: 5px 0; font-size: 12px; line-height: 1.3;display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical;overflow: hidden;">${stripHTML(job.description) || "No description"}</p>
        </div>`;

      L.marker([job.latitude, job.longitude], { icon: adzunaIcon })
        .bindPopup(popupContent)
        .addTo(adzunaCluster);
    }
  }
}

function drawEDJoinJobs() 
{
  for (let job of edjoinJobs) 
  {
    let cityRow = findCityCoords(job.city);
    if (cityRow) 
    {
      let lat = cityRow.getNum("Latitude");
      let lng = cityRow.getNum("Longitude");
      
      let popupContent = `
        <div style="width: 300px;">
          <h3 style="margin: 0 0 10px 0; font-size: 14px;">${job.title || "No title"}</h3>
          <p style="margin: 5px 0;"><strong>City:</strong> ${job.city || "N/A"}</p>
          <p style="margin: 5px 0;"><strong>District:</strong> ${job.district || "N/A"}</p>
          <p style="margin: 5px 0;"><strong>Salary:</strong> ${job.salary || "Not specified"}</p>
          <p style="margin: 5px 0;"><a href="${job.url}" target="_blank">View Job Posting</a></p>
        </div>
      `;

      L.marker([lat, lng], { icon: edjoinIcon })
      .bindPopup(popupContent)
      .addTo(edjoinCluster);
    }
  }
}

function findCityCoords(cityName) {
  for (let i = 0; i < cityCoords.getRowCount(); i++) {
    if (cityCoords.getString(i, "City").toLowerCase() === cityName.toLowerCase()) {
      return cityCoords.getRow(i);
    }
  }
  return null;
}

function formatSalary(job) {
  if (job.salary_min && job.salary_max) {
    return `$${Math.round(job.salary_min).toLocaleString()} - $${Math.round(job.salary_max).toLocaleString()}`;
  } else if (job.salary_min) {
    return `$${Math.round(job.salary_min).toLocaleString()}+`;
  } else {
    return "Not specified";
  }
}

function stripHTML(html) {
  if (!html) return "";
  let text = html.replace(/<[^>]*>/g, "");
  let temp = document.createElement("div");
  temp.innerHTML = text;
  return temp.textContent || temp.innerText || "";
}

function searchAdzunaJobs(keyword) {
  
  adzunaCluster.clearLayers();
  
  let url = `https://api.adzuna.com/v1/api/jobs/us/search/1?app_id=86a92f0b&app_key=82634077a4fdd6927ce754ca3c9aaa08&what=${encodeURIComponent(keyword)}&where=california&results_per_page=50`;
  
  loadJSON(url, (data) => {
    adzunaJobs = data.results;
    drawAdzunaJobs();
  });
}


function addLegend() {
  let legend = L.control({ position: 'topright' });
  
  legend.onAdd = function(map) {
    let div = L.DomUtil.create("div", "legend");
    div.innerHTML = `
      <h3 style="margin: 0 0 10px 0;">Job Sources</h3>
      <div style="margin: 5px 0;"><img src="apple.svg" style="width: 20px; height: 20px; vertical-align: middle;"><span style="margin-left: 5px;">EDJoin Teacher Jobs</span></div>
      <div style="margin: 5px 0;"><img src="globe.svg" style="width: 20px; height: 20px; vertical-align: middle;"><span style="margin-left: 5px;">Adzuna GIS Jobs</span></div>`;
    return div;
  };
  
  legend.addTo(leafletMap);
}