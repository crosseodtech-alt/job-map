p5.disableFriendlyErrors = true;


let colorMap;
let buildingMap;
let font;
let table;
let sdsuLogo;
let buildingImages = {};
let buildingData = {};
let selectedBuilding = null;

// Graphics buffers for highlight effects
let highlightLayer;
let darkeningLayer;

// sets up panning and zooming
let zoom = 1;
let offsetX = 0;
let offsetY = 0;
let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;

let currentZoom = 1;
let lastDist = 0;

// responsive to window size variables
let designWidth = 1200;
let designHeight = 1200;
let scaleFactor = 1;

// Instructions box
let showInstructions = true;
let instructionButton = 
    {
      x: 0,
      y: 0,
      width: 200,
      height: 50
    };



function preload() 
{
  
  buildingMap = loadImage('Buildings200dpi.png');
  colorMap = loadImage('Campus200dpi.png');
  sdsuLogo = loadImage('logo.png');
  font = loadFont('fonts/SourceSerif4-Medium.ttf');


//
//
//
//Load building thumbnails
//
//
//

  
for (let i = 1; i <= 100; i++)
  {loadImage('Thumbnails/' + i + '.jpg', (img) =>
             {
    buildingImages[i] = img;
        console.log('Loaded thumbnail', i);
             },
    () =>
    {
      
    }
  );
             }
    console.log('Preload started');
}


function setup() 
{
  loadTable('BuildingCodes.csv', 'csv', 'header', tableLoaded);
  
  
    let canvas = document.querySelector('canvas');
  if (canvas) 
  {
    canvas.style.touchAction = 'none';
  }
  
  
  let availableWidth = windowWidth - 100;
  let availableHeight = windowHeight - 100;
  
  scaleFactor = min(availableWidth / designWidth, availableHeight / designHeight);
  
  let canvasWidth = designWidth * scaleFactor;
  let canvasHeight = designHeight * scaleFactor;
  
  
    
  createCanvas(canvasWidth, canvasHeight); 
  
  // Create graphics buffers for highlight effects
  highlightLayer = createGraphics(1200, 900);
  darkeningLayer = createGraphics(1200, 900);
  
  
  //
  //
  //
  // Fetch info from CSV
  //
  //
  //
  
  
  function tableLoaded(loadedTable)
  {
    table = loadedTable;
  
  console.log('Table loaded with', table.getRowCount(), 'rows');
  
  for (let i = 0; i < table.getRowCount(); i++)
  {
      let grayValue = parseFloat(table.get(i, 'Gray Value'));
      let coffeeXVal = parseFloat(table.get(i, 'CoffeeX'));
      let coffeeYVal = parseFloat(table.get(i, 'CoffeeY'));
      
      buildingData[grayValue] = 
        {
        name: table.getString(i, 'Building Name'),
        coffee: table.getString(i, 'Closest Coffee Shop'),
        code: table.getString(i, 'Building Code'),
        order: table.getNum(i, 'ORDER'),
        coffeeX: isNaN(coffeeXVal) ? null : coffeeXVal,
        coffeeY: isNaN(coffeeYVal) ? null : coffeeYVal,
      };
    }
    buildingMap.loadPixels();
  }
  

  console.log ('Scale Factor:', scaleFactor.toFixed(1));
  console.log ('Canvas size:', canvasWidth.toFixed(0), 'x', canvasHeight.toFixed(0));
  console.log ('Images loaded:', Object.keys(buildingImages).length);
  }
  
  
//
//
//
// Scale window based on available window size
//
//
//


function windowResized()
  {
  let availableWidth = windowWidth - 100;
  let availableHeight = windowHeight - 100;
  
  scaleFactor = min(availableWidth / designWidth, availableHeight / designHeight);
  
  let canvasWidth = designWidth * scaleFactor;
  let canvasHeight = designHeight * scaleFactor;
    
  resizeCanvas(canvasWidth, canvasHeight); 
  
}


//
//
//
// Create highlight and darkening layers for selected building
//
//
//


function createBuildingHighlight(grayValue) {
  console.log('=== Creating Building Highlight ===');
  console.log('Building map size:', buildingMap.width, 'x', buildingMap.height);
  console.log('Highlight layer size:', highlightLayer.width, 'x', highlightLayer.height);
  console.log('Pixel density:', pixelDensity());
  console.log('Looking for gray value:', grayValue);
  
  // Clear both layers
  highlightLayer.clear();
  darkeningLayer.clear();
  
  // Set pixel density to 1 for both layers to avoid scaling issues
  highlightLayer.pixelDensity(1);
  darkeningLayer.pixelDensity(1);
  
  // NOW fill darkening layer with semi-transparent black (after setting density)
  darkeningLayer.background(0, 0, 0, 120);
  
  // Load pixels
  buildingMap.loadPixels();
  darkeningLayer.loadPixels();
  
  let matchCount = 0;
  
  // Loop through and find matching building pixels
  for (let y = 0; y < buildingMap.height; y++) {
    for (let x = 0; x < buildingMap.width; x++) {
      let idx = (y * buildingMap.width + x) * 4;
      let r = buildingMap.pixels[idx];
      
      if (r === grayValue) {
        if (matchCount < 5) {
          console.log('Match at:', x, y);
        }
        matchCount++;
        
        // Cut hole in darkening layer
        let darkIdx = (y * darkeningLayer.width + x) * 4;
        darkeningLayer.pixels[darkIdx + 3] = 0;
        
        // Draw highlight pixel
        highlightLayer.stroke(255, 200, 0, 180);
        highlightLayer.strokeWeight(1);
        highlightLayer.point(x, y);
      }
    }
  }
  
  console.log('Total pixels matched:', matchCount);
  darkeningLayer.updatePixels();
}


//
//
//
// Selecting buildings and dragging
//
//
//


function mousePressed()
{
    if (showInstructions) 
    {
    let scaledButtonX = instructionButton.x * scaleFactor;
    let scaledButtonY = instructionButton.y * scaleFactor;
    let scaledButtonW = instructionButton.width * scaleFactor;
    let scaledButtonH = instructionButton.height * scaleFactor;
    
    if (mouseX >= scaledButtonX && mouseX <= scaledButtonX + scaledButtonW &&
        mouseY >= scaledButtonY && mouseY <= scaledButtonY + scaledButtonH) 
    {
      showInstructions = false;
      return;
    }
    return;
  }
  
  let designMouseX = mouseX / scaleFactor;
  let designMouseY = mouseY / scaleFactor;
  
  if (designMouseX >= 0 && designMouseX < 1200 && designMouseY >= 0 && designMouseY < 900)
    {
      
      isDragging = true;
      dragStartX = designMouseX - offsetX;
      dragStartY = designMouseY - offsetY;
      
      let mapX = (designMouseX - offsetX) / zoom;
      let mapY = (designMouseY - offsetY) / zoom;
      
      if (mapX >= 0 && mapX < 1200 && mapY >= 0 && mapY < 900)
        {
      let index = (floor(mapY) * buildingMap.width + floor(mapX)) * 4;
      let r = buildingMap.pixels[index];
      let g = buildingMap.pixels[index + 1];
      let b = buildingMap.pixels[index + 2];
      
      let grayValue = r;
      
      if (buildingData[grayValue])
        {
          selectedBuilding = buildingData[grayValue];
          selectedBuilding.clickX = mapX;
          selectedBuilding.clickY = mapY;
          selectedBuilding.grayValue = grayValue;
          
          // Create the highlight and darkening layers
          createBuildingHighlight(grayValue);
          
          print("Clicked on: " + selectedBuilding.name);
          print("Coffee shop at:", selectedBuilding.coffeeX, selectedBuilding.coffeeY);
        }
        else
          {
            selectedBuilding = null;
            highlightLayer.clear();
            darkeningLayer.clear();
            print("No building found for gray value: " + grayValue);
          } 
        }
    }
}


function mouseReleased()
{
  isDragging = false;
}


function mouseDragged()
{
  
  if (showInstructions) return;
  
  
  let designMouseX = mouseX / scaleFactor;
  let designMouseY = mouseY / scaleFactor;
  
  if (isDragging && designMouseX >= 0 && designMouseX < 1200 && designMouseY >= 0 && designMouseY < 900)
    {
      offsetX = designMouseX - dragStartX;
      offsetY = designMouseY - dragStartY;
      
      let scaledWidth = 1200 * zoom;
      let scaledHeight = 900 * zoom;
      
      let maxOffsetX = 0;
      let minOffsetX = 1200 - scaledWidth;
      
      let maxOffsetY = 0;
      let minOffsetY = 900 - scaledHeight;
      
      offsetX = constrain(offsetX, minOffsetX, maxOffsetX);
      offsetY = constrain(offsetY, minOffsetY, maxOffsetY);
    }
}


//
//
//
// Add zooming
//
//
//


function mouseWheel(event)
{
  
  if (showInstructions) return false;
  
  
  let designMouseX = mouseX / scaleFactor;
  let designMouseY = mouseY / scaleFactor;
  
  if (designMouseX >= 0 && designMouseX <1200 && designMouseY >= 0 && designMouseY < 900)
  {
    // Get the mouse position in map space before zoom
    let mouseMapXBefore = (designMouseX - offsetX) / zoom;
    let mouseMapYBefore = (designMouseY - offsetY) / zoom;
    
    let zoomAmount = -event.delta * 0.001;
    let oldZoom = zoom;
    
    zoom += zoomAmount;
    zoom = constrain(zoom, 1, 3);
    
    // Calculate new offset to keep mouse position stable
    let mouseMapXAfter = (designMouseX - offsetX) / zoom;
    let mouseMapYAfter = (designMouseY - offsetY) / zoom;
    
    // Adjust offset to compensate for zoom change
    offsetX += (mouseMapXAfter - mouseMapXBefore) * zoom;
    offsetY += (mouseMapYAfter - mouseMapYBefore) * zoom;
    
    // Constrain to bounds
    let scaledWidth = 1200 * zoom;
    let scaledHeight = 900 * zoom;
    
    let maxOffsetX = 0;
    let minOffsetX = 1200 - scaledWidth;
    
    let maxOffsetY = 0;
    let minOffsetY = 900 - scaledHeight;
    
    offsetX = constrain(offsetX, minOffsetX, maxOffsetX);
    offsetY = constrain(offsetY, minOffsetY, maxOffsetY);
  
  console.log('zoom level:', zoom.toFixed(1));
  
  return false;
  }
}


//
//
//
// Add touch functionality and pinch to zoom / full disclosure, Claude did a lot to help me with this functionality
//
//
//


function touchStarted() 
{
  
   if (showInstructions) 
   {
    let scaledButtonX = instructionButton.x * scaleFactor;
    let scaledButtonY = instructionButton.y * scaleFactor;
    let scaledButtonW = instructionButton.width * scaleFactor;
    let scaledButtonH = instructionButton.height * scaleFactor;
    
    if (touches.length === 1) 
    {
      if (touches[0].x >= scaledButtonX && touches[0].x <= scaledButtonX + scaledButtonW &&
          touches[0].y >= scaledButtonY && touches[0].y <= scaledButtonY + scaledButtonH) 
      {
        showInstructions = false;
      }
    }
    return false;
  }
  
  
  if (touches.length === 2) 
  {
    
    isTouching = true;
    lastTouchDist = dist(touches[0].x, touches[0].y, touches[1].x, touches[1].y);
    return false;
  } 
  
  else if (touches.length === 1) 
  {
    
    let designTouchX = touches[0].x / scaleFactor;
    let designTouchY = touches[0].y / scaleFactor;
    
    if (designTouchX >= 0 && designTouchX < 1200 && designTouchY >= 0 && designTouchY < 900) 
    {
      isDragging = true;
      dragStartX = designTouchX - offsetX;
      dragStartY = designTouchY - offsetY;
      
      
      touchStartBuilding = {x: designTouchX, y: designTouchY};
    }
    return false;
  }
}


function touchMoved() 
{
  
  if (showInstructions) return false;
  
  if (touches.length === 2 && isTouching) 
  {
    
    let currentDist = dist(touches[0].x, touches[0].y, touches[1].x, touches[1].y);
    let delta = currentDist - lastTouchDist;
    
    
    let zoomAmount = delta * 0.003; 
    zoom += zoomAmount;
    zoom = constrain(zoom, 1, 3);
    
    lastTouchDist = currentDist;
    
    
    let scaledWidth = 1200 * zoom;
    let scaledHeight = 900 * zoom;
    
    let maxOffsetX = 0;
    let minOffsetX = 1200 - scaledWidth;
    let maxOffsetY = 0;
    let minOffsetY = 900 - scaledHeight;
    
    offsetX = constrain(offsetX, minOffsetX, maxOffsetX);
    offsetY = constrain(offsetY, minOffsetY, maxOffsetY);
    
    console.log('zoom level:', zoom.toFixed(1));
    
    return false;
  } 
  
  else if (touches.length === 1 && isDragging) 
  {
    
    let designTouchX = touches[0].x / scaleFactor;
    let designTouchY = touches[0].y / scaleFactor;
    
    if (designTouchX >= 0 && designTouchX < 1200 && designTouchY >= 0 && designTouchY < 900) 
    {
      offsetX = designTouchX - dragStartX;
      offsetY = designTouchY - dragStartY;
      
      let scaledWidth = 1200 * zoom;
      let scaledHeight = 900 * zoom;
      
      let maxOffsetX = 0;
      let minOffsetX = 1200 - scaledWidth;
      let maxOffsetY = 0;
      let minOffsetY = 900 - scaledHeight;
      
      offsetX = constrain(offsetX, minOffsetX, maxOffsetX);
      offsetY = constrain(offsetY, minOffsetY, maxOffsetY);
      
      
      touchStartBuilding = null;
    }
    return false;
  }
}

function touchEnded() 
{
  if (touches.length < 2) 
  {
    isTouching = false;
  }
  
  
  if (touches.length === 0 && touchStartBuilding !== null) 
  {
    let designTouchX = touchStartBuilding.x;
    let designTouchY = touchStartBuilding.y;
    
    
    let mapX = (designTouchX - offsetX) / zoom;
    let mapY = (designTouchY - offsetY) / zoom;
    
    if (mapX >= 0 && mapX < 1200 && mapY >= 0 && mapY < 900) 
    {
      let index = (floor(mapY) * buildingMap.width + floor(mapX)) * 4;
      let r = buildingMap.pixels[index];
      let g = buildingMap.pixels[index + 1];
      let b = buildingMap.pixels[index + 2];
      
      let grayValue = r;
      
      if (buildingData[grayValue]) 
      {
        selectedBuilding = buildingData[grayValue];
        selectedBuilding.clickX = mapX;
        selectedBuilding.clickY = mapY;
        selectedBuilding.grayValue = grayValue;
        
        // Create the highlight and darkening layers
        createBuildingHighlight(grayValue);
        
        print("Clicked on: " + selectedBuilding.name);
        print("Coffee shop at:", selectedBuilding.coffeeX, selectedBuilding.coffeeY);
      } 
      else 
      {
        selectedBuilding = null;
        highlightLayer.clear();
        darkeningLayer.clear();
        print("No building found for gray value: " + grayValue);
      }
    }
    
    touchStartBuilding = null;
  }
  
  if (touches.length === 0) {
    isDragging = false;
  }
}


function draw() 
{
  background(240);
  
  push();
  scale(scaleFactor);
  
  
  //
  //
  //
  // Zoom and pan transformations on main map
  //
  //
  //
  
  
  push();
  translate(offsetX, offsetY);
  scale(zoom);
  
  // color map of campus
  image(colorMap, 0, 0, 1200, 900);
  
  // Draw darkening layer (dims everything except selected building)
  image(darkeningLayer, 0, 0, 1200, 900);
  
  // Draw highlight layer (adds color to selected building)
  image(highlightLayer, 0, 0, 1200, 900);
  
  
  //
  //
  //
  // Blinking circle for coffee shop / selected building
  //
  //
  //
  
  
  if (selectedBuilding)
    {
      if (selectedBuilding.coffeeX && selectedBuilding.coffeeY && 
        !isNaN(selectedBuilding.coffeeX) && !isNaN(selectedBuilding.coffeeY))
        {
          let blink = abs(sin(frameCount * 0.1)) * 255;
          fill(0, blink, blink);
          noStroke();
          circle(selectedBuilding.coffeeX, selectedBuilding.coffeeY, 15 + 3 * sin(frameCount * 0.2));
          
        }
      
      if (selectedBuilding.clickX !== undefined && selectedBuilding.clickY !== undefined)
        {
          fill(255, 255, 0);
          noStroke();
          circle(selectedBuilding.clickX, selectedBuilding.clickY, 15);
          fill(255, 0, 0);
          circle(selectedBuilding.clickX, selectedBuilding.clickY, 5);
        }
    }
  
  pop();
  
  
  //
  //
  //
  // Inset map showing main map extent
  //
  //
  //
  
  
  image(colorMap, 0, 900, 400, 300);
  stroke(0);
  strokeWeight(5);
  noFill();
  rect(0, 900, 400, 300);
  
  let insetScale = 400 / 1200;
  
  let visibleWidth = 1200 / zoom;
  let visibleHeight = 900 / zoom;
  let visibleX = -offsetX / zoom;
  let visibleY = -offsetY / zoom;
  
  let extentX = visibleX * insetScale;
  let extentY = visibleY * insetScale;
  let extentWidth = visibleWidth * insetScale;
  let extentHeight = visibleHeight * insetScale;
  
  stroke(255, 0, 0);
  strokeWeight(4);
  noFill();
  rect(extentX, 900 + extentY, extentWidth, extentHeight);
  
  
  //
  //
  //
  // Tan toned rectangle for showing logo/thumbnails and building data
  //
  //
  //
  
  

  fill(220, 220, 210);
  noStroke();
  rect(400, 900, 900, 300);
  
  
  //
  //
  //
  //Logo or Building thumbnail
  //
  //
  //

  
  push();
  blendMode(MULTIPLY);
  if (selectedBuilding)
  {
    if (buildingImages[selectedBuilding.order])
    {
      image(buildingImages[selectedBuilding.order], 425, 950, 294, 200);
    }
  else
    {
  image(sdsuLogo, 400, 900, 350, 300);
    }
  }
  else
    {
      image(sdsuLogo, 400, 900, 350, 300);
    }
  pop();
  
  
  //
  //
  //
  //TEXT BOX
  //
  //
  //
  
  
  fill(0); 
  textFont(font);
  textSize(24);
  textAlign(LEFT, TOP);
  text("BUILDING INFORMATION", 850, 910);
  

  textSize(16);
  text("Building Name -", 750, 975);
  
  if (selectedBuilding)
    {
      textSize(13);
      text(selectedBuilding.name, 925, 975, 250);
    }

  textSize(16);
  text("Nearest Coffee Shop -", 750, 1025);
  
  if (selectedBuilding)
  {
    textSize(13);
    text(selectedBuilding.coffee, 925, 1025, 250);
  }
  
  textSize(16);
  text("Building Code -", 750, 1075);
  
  if (selectedBuilding)
  {
    textSize(13);
    text(selectedBuilding.code, 925, 1075, 250);
  }
  
    pop();
  
  if (showInstructions)
    {
      drawInstructions();
    }
}
  

//
//
//
// Instruction box which runs before you can start the map
//
//
//


function drawInstructions()
{
  push();
  scale(scaleFactor);
  
  fill(0, 0, 0, 180);
  noStroke();
  rect(0, 0, 1200, 1200);
  
  fill(255);
  noStroke(200, 0, 0);
  strokeWeight(2);
  rect(300, 350, 600, 500, 10);
  
  fill(0);
  textFont(font);
  textSize(32);
  textAlign(CENTER, TOP);
  text(" SDSU Campus Map", 600, 380);
  
  fill(0);
  textSize(19);
  textAlign(LEFT, TOP);
  let instructionText = 
    " Click on any building to see its information\n\n" +
    " Use mouse wheel or pinch to zoom in or out\n\n" +
    " Click and drag to pan around the map\n\n" +
    " A blinking cyan circle shows the nearest coffee shop to your selected building\n\n" +
    " Use the mini-map in the bottom left to navigate the campus";
  
  text(instructionText, 330, 450, 500);
  
  instructionButton.x = 460;
  instructionButton.y = 730;
  instructionButton.width = 300;
  instructionButton.height = 50;
  
  let designMouseX = mouseX / scaleFactor;
  let designMouseY = mouseY / scaleFactor;
  
  let isHovering = false;
  if (designMouseX >= instructionButton.x && 
      designMouseX <= instructionButton.x + instructionButton.width &&
      designMouseY >= instructionButton.y && 
      designMouseY <= instructionButton.y + instructionButton.height)
    {
      isHovering = true
    }
  
  if(isHovering)
    {
      fill(87, 170, 100);
    }
  else
    {
      fill(100, 100, 100);
    }
  stroke(0);
  strokeWeight(2);
  rect(instructionButton.x, instructionButton.y, instructionButton.width, instructionButton.height, 5);
  
  noStroke();
  fill(255);
  textSize(20);
  textAlign(CENTER, CENTER);
  text("I Understand, lets get started", instructionButton.x + instructionButton.width/2, instructionButton.y + instructionButton.height/2);
  
  pop();
  
}


  //
  //
  //
  // Credits
  //
  //
  //
  
  
  // Font: Source Serif 4 Medium (Adobe, SIL Open Font License), a free stand-in for Tiempos Headline,
  // the typeface used in SDSU's official logo. License in fonts/OFL-LICENSE.txt