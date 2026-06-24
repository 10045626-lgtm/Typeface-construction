let glyphs = {}; 
let strokes = [], currentStroke = [];
let editingChar = 'A';
let cols = 10, rows = 16;
let canvas, previewCanvas, pctx;
let danceFactor = 2; // 抖動強度
let dancingPoints = {}; // 每個字符的重採樣點集
let displayAreaMouseDown = false; // 追蹤示例區域滑鼠狀態
let danceAnimationActive = false; // 跟踪舞動動畫是否活躍
let animationFrameId = null; // 用於存儲動畫幀ID

// Metaball 參數
let threshold = 0.5;      // 噪聲閾值
let moveScale = 50;       // 噪聲靈敏度 
let maxDistance = 60;     // 最大連接距離
let handleLenRate = 2.0;  // 連接粗細
let ballSize = 20;        // 圓大小
let noiseTimeScale = 0.5; // 時間因子
let gridDensity = 20;     // 網格密度
let pointLifespan = 0.4;  // 點生成閾值
let waveIntensity = 15;   // 波紋強度
let particleSpeed = 0.2;  // 粒子運動速率

// 默認字體設置
let fontSettings = {
  familyName: 'CustomFont',
  styleName: 'Regular',
  unitsPerEm: 1000,
  ascender: 800,
  descender: -200,
  charWidth: 600,
  letterSpacing: 0,
  fontSize: 48,
  lineHeight: 1.2
};

// 導出畫板為PNG的函數
window.exportDisplayAreaAsPNG = function() {
  // 獲取顯示區域元素
  const displayArea = document.getElementById('displayArea');
  if (!displayArea) return;
  
  // 判斷當前是否處於舞動狀態
  const isDancing = danceAnimationActive;
  
  // 如果未處於舞動狀態，先啟動舞動效果，然後在短暫延遲後截圖並停止舞動
  if (!isDancing) {
    // 暫時開始舞動以便導出動態效果
    startDancing();
  }
  
  // 創建一個加載指示器
  const loadingIndicator = document.createElement('div');
  loadingIndicator.style.position = 'fixed';
  loadingIndicator.style.top = '50%';
  loadingIndicator.style.left = '50%';
  loadingIndicator.style.transform = 'translate(-50%, -50%)';
  loadingIndicator.style.padding = '15px 20px';
  loadingIndicator.style.background = 'rgba(0, 0, 0, 0.7)';
  loadingIndicator.style.color = 'white';
  loadingIndicator.style.borderRadius = '5px';
  loadingIndicator.style.zIndex = '1000';
  loadingIndicator.textContent = '正在生成PNG圖像...';
  document.body.appendChild(loadingIndicator);
  
  // 給一點時間讓動畫更新
  setTimeout(() => {
    // 使用html2canvas庫將顯示區域轉換為畫布
    html2canvas(displayArea, {
      backgroundColor: '#ffffff',
      scale: 2, // 提高畫質
      useCORS: true
    }).then(canvas => {
      // 將畫布轉換為PNG並觸發下載
      const link = document.createElement('a');
      link.download = 'custom-font-display.png';
      link.href = canvas.toDataURL('image/png');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // 如果原本不是舞動狀態，恢復不舞動狀態
      if (!isDancing) {
        stopDancing();
      }
      
      // 移除加載指示器
      document.body.removeChild(loadingIndicator);
    }).catch(err => {
      console.error('導出PNG時出錯:', err);
      alert('導出PNG時出錯，請檢查控制台以獲取詳細信息。');
      
      // 確保在錯誤情況下也恢復原來的狀態
      if (!isDancing) {
        stopDancing();
      }
      
      // 移除加載指示器
      document.body.removeChild(loadingIndicator);
    });
  }, 300); // 給舞動效果300毫秒的時間更新
};

// 重採樣函數 - 將路徑按指定長度重採樣為點集
function resampleByLength(points, step) {
  if (!points.length) return [];
  
  const result = [points[0]]; // 始終包含第一個點
  let totalDist = 0;
  let lastPoint = points[0];
  
  for (let i = 1; i < points.length; i++) {
    const p = points[i];
    const dist = Math.sqrt(Math.pow(p.x - lastPoint.x, 2) + Math.pow(p.y - lastPoint.y, 2));
    totalDist += dist;
    
    // 如果距離達到或超過步長，添加一個點
    if (totalDist >= step) {
      result.push(p);
      totalDist = 0;
      lastPoint = p;
    }
  }
  
  // 確保最後一個點被添加
  if (result[result.length-1] !== points[points.length-1]) {
    result.push(points[points.length-1]);
  }
  
  return result;
}

// 計算路徑邊界框
function pathBounds(points) {
  if (!points.length) return { x: 0, y: 0, width: 0, height: 0 };
  
  let minX = Infinity, minY = Infinity;
  let maxX = -Infinity, maxY = -Infinity;
  
  points.forEach(p => {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  });
  
  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY
  };
}

window.handleEditCharInput = function(e) {
  const txt = e.target.textContent;
  if (txt) {
    const ch = txt[0];
    
    // 保存当前字符
    saveGlyph(editingChar);
    
    // 更新UI
    e.target.textContent = ch;
    placeCaretAtEnd(e.target);
    
    // 更新当前编辑字符并加载数据
    editingChar = ch;
    loadGlyph(editingChar);
    updatePreview();
  }
};

window.handleClear = function() {
  strokes = [];
  saveGlyph(editingChar);
  updatePreview();
  updateDisplayArea();
};

window.handleUpdateGrid = function() {
  cols = parseInt(document.getElementById('cols').value) || cols;
  rows = parseInt(document.getElementById('rows').value) || rows;
  redraw();
};

window.handlePreviewInput = function() {
  updateDisplayArea();
};

window.handlePreviewSettings = function() {
  fontSettings.fontSize = parseInt(document.getElementById('fontSize').value) || 48;
  fontSettings.lineHeight = parseFloat(document.getElementById('lineHeight').value) || 1.2;
  fontSettings.letterSpacing = parseInt(document.getElementById('letterSpacing').value) || 0;
  fontSettings.charWidth = parseInt(document.getElementById('charWidth').value) || 600;
  redraw();  // 重新繪製主畫布
  updatePreview();
  updateDisplayArea();
};

window.handleExportFont = function() {
  exportFont();
};

window.placeCaretAtEnd = function(el) {
  el.focus();
  document.execCommand('selectAll', false, null);
  document.getSelection().collapseToEnd();
};

function saveGlyph(ch) {
  glyphs[ch] = JSON.parse(JSON.stringify(strokes.map(s => s.map(p => ({x: p.x, y: p.y})))));
}

function loadGlyph(ch) {
  if (glyphs[ch]) {
    strokes = glyphs[ch].map(s => s.map(p => createVector(p.x, p.y)));
  } else {
    strokes = [];
  }
}

function exportFont() {

  // 首先保存当前正在编辑的字符
  saveGlyph(editingChar);

  
  const strokeWidth = 60; 
  const glyphList = [];

  for (let i = 32; i <= 126; i++) {
    const ch = String.fromCharCode(i);
    if (!glyphs[ch]) {
      glyphs[ch] = [];
    }
  }
  
  // 遍歷處理所有字符
  for (let ch in glyphs) {
    const strokes = glyphs[ch];
    const path = new opentype.Path();
    let hasValidPath = false;
    
    if (strokes && strokes.length > 0) {
      strokes.forEach(stk => {
        if (!stk || stk.length < 2) return;
        
        for (let i = 0; i < stk.length - 1; i++) {
          const p1 = { x: mapX(stk[i].x), y: mapY(stk[i].y) };
          const p2 = { x: mapX(stk[i+1].x), y: mapY(stk[i+1].y) };

          const dx = p2.x - p1.x;
          const dy = p2.y - p1.y;
          const len = Math.sqrt(dx*dx + dy*dy);
          if (len < 0.001) continue; // 防止除以零
          
          // 计算垂直方向向量，用于创建线段轮廓
          const nx = -dy/len * (strokeWidth/2);
          const ny = dx/len * (strokeWidth/2);
          
          // 使用更圆润的连接
          path.moveTo(p1.x + nx, p1.y + ny);
          path.lineTo(p2.x + nx, p2.y + ny);
          path.lineTo(p2.x - nx, p2.y - ny);
          path.lineTo(p1.x - nx, p1.y - ny);
          path.closePath();
          
          hasValidPath = true;
        }
      });
    }
    
    
    // 即使字符沒有筆畫，也創建一個空的字形
    glyphList.push(new opentype.Glyph({
      name: ch,
      unicode: ch.charCodeAt(0),
      advanceWidth: fontSettings.charWidth,
      path: path
    }));
  }
  
  
  // 创建字体对象
  const font = new opentype.Font({
    familyName: fontSettings.familyName,
    styleName: fontSettings.styleName,
    unitsPerEm: fontSettings.unitsPerEm,
    ascender: fontSettings.ascender,
    descender: fontSettings.descender,
    glyphs: glyphList
  });
  
  const date = new Date();
  const dateString = date.toISOString().replace(/:/g, '-').replace(/\..+/, '');
  const filename = `CustomFont_${dateString}.ttf`;
  
  font.download(filename);
}

// 确保这些函数定义在文件的早期位置
function mapX(x) { return x / 296 * 1000; }
function mapY(y) { return (296 - y) / 296 * 1000; }

function setup() {
  canvas = createCanvas(296, 296);
  canvas.parent('canvas-holder');
  previewCanvas = document.getElementById('previewCanvas');
  pctx = previewCanvas.getContext('2d');
  
  // 設置示例區域的事件處理
  setupDisplayAreaEvents();
  
  loadGlyph(editingChar);
  updatePreview();
  updateDisplayArea();
  
  // 添加Metaball控制滑塊
  addMetaballControls();
  
  // 确保初始化舞动点集
  if (typeof processAllDancingPoints === 'function') {
    processAllDancingPoints();
  }
}

// 添加Metaball控制滑塊
function addMetaballControls() {
  const toolbar = document.getElementById('toolbar');
  if (!toolbar) return;
  
  // 創建新的控制組
  const container = document.createElement('div');
  container.className = 'control-group';
  container.innerHTML = `
    <h3>Dynamic construction</h3>
    <div class="controls-row">
      <div class="control-item">
        <div class="slider-container">
          <label>Connect thickness: <span id="handleLenRateValue">${handleLenRate.toFixed(1)}</span></label>
          <input type="range" id="handleLenRate" min="0.1" max="5" value="${handleLenRate}" step="0.1" class="slider">
        </div>
      </div>
      <div class="control-item">
        <div class="slider-container">
          <label>Circle size: <span id="ballSizeValue">${ballSize}</span></label>
          <input type="range" id="ballSize" min="5" max="50" value="${ballSize}" step="1" class="slider">
        </div>
      </div>
    </div>
    
    <div class="controls-row">
      <div class="control-item">
        <div class="slider-container">
          <label>Grid density: <span id="gridDensityValue">${gridDensity}</span></label>
          <input type="range" id="gridDensity" min="10" max="100" value="${gridDensity}" step="1" class="slider">
        </div>
      </div>
      <div class="control-item">
        <div class="slider-container">
          <label>Thresholds: <span id="pointLifespanValue">${pointLifespan.toFixed(1)}</span></label>
          <input type="range" id="pointLifespan" min="0.2" max="0.8" value="${pointLifespan}" step="0.05" class="slider">
        </div>
      </div>
    </div>
    
    <div class="controls-row">
      <div class="control-item">
        <div class="slider-container">
          <label>connection gap: <span id="maxDistanceValue">${maxDistance}</span></label>
          <input type="range" id="maxDistance" min="10" max="100" value="${maxDistance}" step="5" class="slider">
        </div>
      </div>
      <div class="control-item">
        <div class="slider-container">
          <label>Circle speed: <span id="particleSpeedValue">${particleSpeed.toFixed(3)}</span></label>
          <input type="range" id="particleSpeed" min="0.001" max="2.0" value="${particleSpeed}" step="0.001" class="slider">
        </div>
      </div>
    </div>
    
    <div class="controls-row" style="margin-top: 10px;">
      <div class="control-item">
        <button id="toggleDanceEffect" style="background-color: #000000;">Start</button>
      </div>
      <div class="control-item">
        <button id="exportPNG" style="background-color: #000000;">Save as PNG</button>
      </div>
    </div>
  `;
  
  toolbar.appendChild(document.createElement('hr'));
  toolbar.appendChild(container);
  
  // 設置舞動效果開關
  const toggleButton = document.getElementById('toggleDanceEffect');
  toggleButton.addEventListener('click', function() {
    if (danceAnimationActive) {
      // 如果當前正在舞動，則停止
      stopDancing();
      this.textContent = 'Start';
      this.style.backgroundColor = '#000000';
    } else {
      // 否則開始舞動
      startDancing();
      this.textContent = 'Stop';
      this.style.backgroundColor = '#333333';
    }
  });
  
  // 設置導出PNG按鈕
  const exportPNGButton = document.getElementById('exportPNG');
  if (exportPNGButton) {
    exportPNGButton.addEventListener('click', function() {
      if (window.exportDisplayAreaAsPNG) window.exportDisplayAreaAsPNG();
    });
  }
  
  // 設置滑塊事件處理
  document.getElementById('handleLenRate').addEventListener('input', function() {
    handleLenRate = parseFloat(this.value);
    document.getElementById('handleLenRateValue').textContent = handleLenRate.toFixed(1);
    
    // 如果動畫正在運行，確保更新顯示
    if (danceAnimationActive) {
      updateDisplayAreaWithDancing();
    }
  });
  
  document.getElementById('ballSize').addEventListener('input', function() {
    ballSize = parseInt(this.value);
    document.getElementById('ballSizeValue').textContent = ballSize;
    
    // 如果動畫正在運行，確保更新顯示
    if (danceAnimationActive) {
      updateDisplayAreaWithDancing();
    }
  });
  
  document.getElementById('gridDensity').addEventListener('input', function() {
    gridDensity = parseInt(this.value);
    document.getElementById('gridDensityValue').textContent = gridDensity;
    
    // 如果動畫正在運行，確保更新顯示
    if (danceAnimationActive) {
      updateDisplayAreaWithDancing();
    }
  });
  
  document.getElementById('pointLifespan').addEventListener('input', function() {
    pointLifespan = parseFloat(this.value);
    document.getElementById('pointLifespanValue').textContent = pointLifespan.toFixed(1);
    
    // 如果動畫正在運行，確保更新顯示
    if (danceAnimationActive) {
      updateDisplayAreaWithDancing();
    }
  });
  
  // 已移除波紋強度控制項的事件監聽器
  
  document.getElementById('maxDistance').addEventListener('input', function() {
    maxDistance = parseInt(this.value);
    document.getElementById('maxDistanceValue').textContent = maxDistance;
    
    // 如果動畫正在運行，確保更新顯示
    if (danceAnimationActive) {
      updateDisplayAreaWithDancing();
    }
  });
  
  document.getElementById('particleSpeed').addEventListener('input', function() {
    particleSpeed = parseFloat(this.value);
    document.getElementById('particleSpeedValue').textContent = particleSpeed.toFixed(3);
    
    // 如果動畫正在運行，確保更新顯示
    if (danceAnimationActive) {
      updateDisplayAreaWithDancing();
    }
  });
}

// 為示例區域設置事件處理 - 移除所有交互
function setupDisplayAreaEvents() {
  const displayArea = document.getElementById('displayArea');
  if (!displayArea) return;
  
  // 將鼠標指針改為默認
  displayArea.style.cursor = 'default';
  
  // 已移除所有鼠標事件監聽器
  // 現在只能通過工具欄中的按鈕控制舞動效果
}


function draw() {
  background(255);
  drawGrid();
  stroke(0);
  strokeWeight(5 * (fontSettings.charWidth / 600)); 
  noFill();
  
  // 繪製已完成的筆畫
  strokes.forEach(s => {
    if (s.length >= 2) {
      beginShape();
      s.forEach(p => vertex(p.x, p.y));
      endShape();
    }
  });
  
  // 繪製當前正在繪製的筆畫
  if (currentStroke.length >= 2) {
    beginShape();
    currentStroke.forEach(p => vertex(p.x, p.y));
    endShape();
  }
}

function drawGrid() {
  stroke(220);
  strokeWeight(1);
  const w = width / cols, h = height / rows;
  fill(220);
  
  // 繪製更小、更淡的網格點
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      ellipse((i + 0.5) * w, (j + 0.5) * h, 10, 10);
    }
  }
}

function mouseDragged() {
  if (mouseX >= 0 && mouseX <= width && mouseY >= 0 && mouseY <= height) {
    const x = snap(mouseX, width / cols);
    const y = snap(mouseY, height / rows);
    if (!currentStroke.length || 
        (currentStroke[currentStroke.length-1].x !== x || 
         currentStroke[currentStroke.length-1].y !== y)) {
      currentStroke.push(createVector(x, y));
      redraw();
    }
    return false;
  }
}

function mousePressed() {
  if (mouseX >= 0 && mouseX <= width && mouseY >= 0 && mouseY <= height) {
    currentStroke = [];
    return false;
  }
}

function mouseReleased() {
  if (mouseX >= 0 && mouseX <= width && mouseY >= 0 && mouseY <= height && currentStroke.length) {
    strokes.push(currentStroke);
    currentStroke = [];
    
    saveGlyph(editingChar);
    updatePreview();
    updateDisplayArea();
    redraw();
    return false; 
  }
}

function snap(v, step) {
  return (floor(v / step) + 0.5) * step;
}


function drawStroke(ctx, points, sx, sy, offsetX = 0, offsetY = 0) {
  if (!points.length) return;
  
  ctx.beginPath();
  ctx.moveTo(points[0].x * sx + offsetX, points[0].y * sy + offsetY);
  
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x * sx + offsetX, points[i].y * sy + offsetY);
  }
  
  ctx.stroke();
}

// 標準顯示區域更新（無舞動效果）
window.updateDisplayArea = function() {
  const text = document.getElementById('previewInput').value;
  const display = document.getElementById('displayArea');
  display.innerHTML = '';
  display.style.fontSize = fontSettings.fontSize + 'px';
  display.style.lineHeight = '1';
  
  const lines = text.split('\n');
  for (let line of lines) {
    const lineDiv = document.createElement('div');
    lineDiv.style.whiteSpace = 'nowrap';
    lineDiv.style.height = fontSettings.fontSize + 'px';
    lineDiv.style.position = 'relative';
    
    // 計算行間距
    let marginValue = 0;
    if (fontSettings.lineHeight > 0) {
      marginValue = fontSettings.fontSize * (fontSettings.lineHeight - 1);
    } else {
      marginValue = fontSettings.fontSize * fontSettings.lineHeight;
    }
    lineDiv.style.marginBottom = marginValue + 'px';
    
    for (let ch of line) {
      if (glyphs[ch]) {
        const charContainer = document.createElement('div');
        charContainer.style.display = 'inline-block';
        charContainer.style.marginRight = fontSettings.letterSpacing + 'px';
        charContainer.style.position = 'relative';
        charContainer.style.verticalAlign = 'top';
        
        const charCanvas = document.createElement('canvas');
        charCanvas.width = fontSettings.fontSize;
        charCanvas.height = fontSettings.fontSize;
        
        const ctx = charCanvas.getContext('2d');
        ctx.strokeStyle = '#000';
        ctx.lineWidth = Math.max(2, (fontSettings.fontSize / 24) * (fontSettings.charWidth / 600));
        ctx.clearRect(0, 0, fontSettings.fontSize, fontSettings.fontSize);
        
        const sx = (fontSettings.fontSize * 0.8) / 296;
        const sy = (fontSettings.fontSize * 0.8) / 296;
        const offsetX = fontSettings.fontSize * 0.1;
        const offsetY = fontSettings.fontSize * 0.1;
        
        glyphs[ch].forEach(s => {
          if (s.length) {
            drawStroke(ctx, s, sx, sy, offsetX, offsetY);
          }
        });
        
        charContainer.appendChild(charCanvas);
        lineDiv.appendChild(charContainer);
      } else {
        const span = document.createElement('span');
        span.textContent = ch;
        span.style.display = 'inline-block';
        span.style.marginRight = fontSettings.letterSpacing + 'px';
        span.style.verticalAlign = 'top';
        lineDiv.appendChild(span);
      }
    }
    display.appendChild(lineDiv);
  }
};

