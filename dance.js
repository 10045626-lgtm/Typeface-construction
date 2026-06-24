// 啟動舞動模式
function startDancing() {
  displayAreaMouseDown = true;
  danceAnimationActive = true;
  // 預處理所有字形的舞動點集
  processAllDancingPoints();
  // 更新示例區域
  updateDisplayAreaWithDancing();
  
  // 開始動畫循環
  if (!animationFrameId) {
    animateDisplayArea();
  }
}

// 停止舞動模式
function stopDancing() {
  displayAreaMouseDown = false;
  danceAnimationActive = false;
  
  // 停止動畫循環
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
  
  // 恢復正常顯示
  updateDisplayArea();
}

// 預處理所有字符的舞動點集
function processAllDancingPoints() {
  dancingPoints = {};
  
  // 處理每個字形
  for (let ch in glyphs) {
    const strokes = glyphs[ch];
    const charPoints = [];
    
    strokes.forEach(s => {
      if (s.length) {
        // 將筆畫轉換為點陣列用於重採樣
        const allPoints = s.map(p => ({x: p.x, y: p.y}));
        // 重採樣點集 (使用更小的步長8以獲得更多點)
        const sampledPoints = resampleByLength(allPoints, 8);
        if (sampledPoints.length > 0) {
          charPoints.push(sampledPoints);
        }
      }
    });
    
    if (charPoints.length > 0) {
      dancingPoints[ch] = charPoints;
    }
  }
}

function updatePreview() {
  if (!previewCanvas) previewCanvas = document.getElementById('previewCanvas');
  if (!pctx) pctx = previewCanvas.getContext('2d');
  
  // 繪製靜態預覽
  pctx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
  pctx.strokeStyle = '#000';
  pctx.lineWidth = 2 * (fontSettings.charWidth / 600);
  const sx = previewCanvas.width / 296;
  const sy = previewCanvas.height / 296;
  
  strokes.forEach(s => {
    if (s.length) {
      drawStroke(pctx, s, sx, sy);
    }
  });
}

// 生成指定範圍內的隨機數
function randomRange(min, max) {
  return min + Math.random() * (max - min);
}


// 舞動效果動畫循環
function animateDisplayArea() {
  if (danceAnimationActive) {
    // 根據粒子速率調整更新頻率
    // 速率越慢，更新間隔越長；速率越快，更新越頻繁
    if (!animateDisplayArea.lastUpdate) {
      animateDisplayArea.lastUpdate = Date.now();
    }

    const now = Date.now();
    const updateInterval = Math.max(30, 200 - particleSpeed * 100); // 根據速率調整更新頻率
    
    if (now - animateDisplayArea.lastUpdate > updateInterval) {
      updateDisplayAreaWithDancing();
      animateDisplayArea.lastUpdate = now;
    }
    
    animationFrameId = requestAnimationFrame(animateDisplayArea);
  } else {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
    animateDisplayArea.lastUpdate = null;
  }
}


// 使用網絡連線樣式繪製舞動字符
function drawMetaballChar(ctx, char, size) {
  if (!dancingPoints[char]) return;
  
  const scale = (size * 0.8) / 296;
  const offsetX = size * 0.1;
  const offsetY = size * 0.1;
  
  // 基於時間生成噪聲偏移 - 使用粒子速率參數
  const t = millis() / 1000;
  
  // 獲取畫布尺寸
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;
  
  // 清空畫布
  ctx.clearRect(0, 0, width, height);
  
  // 儲存輸入點位
  const basePoints = [];
  let strokeIndex = 0;
  
  // 收集原始字形點
  dancingPoints[char].forEach(stroke => {
    if (stroke.length < 2) {
      strokeIndex++;
      return;
    }
    
    for (let i = 0; i < stroke.length; i++) {
      const p = stroke[i];
      
      // 縮放到畫布大小並添加偏移
      const x = p.x * scale + offsetX;
      const y = p.y * scale + offsetY;
      
      // 記錄基礎點
      basePoints.push({
        x, y,
        strokeIndex,
        pointIndex: i
      });
    }
    
    strokeIndex++;
  });
  
  // 動態生成網格結構
  const gridPoints = [];
  const connections = [];
  // 修改計算公式以適應更高的網格密度值
  const cellSize = Math.max(1, (100 - gridDensity) * 0.2) * scale; // 網格大小，確保即使在高密度值時也有足夠小的網格
  
  // 準備字體輪廓區域
  let hasGlyphHeatmap = false;
  let glyphHeatmap = Array(Math.ceil(width / 5)).fill().map(() => Array(Math.ceil(height / 5)).fill(0));
  
  // 創建字形熱圖，標識字體形狀所在區域
  if (basePoints.length > 0) {
    hasGlyphHeatmap = true;
    basePoints.forEach(basePoint => {
      const x = Math.floor(basePoint.x / 5);
      const y = Math.floor(basePoint.y / 5);
      if (x >= 0 && x < glyphHeatmap.length && y >= 0 && y < glyphHeatmap[0].length) {
        // 將基礎點及其附近區域標記為字形區域
        const radius = 3;
        for (let i = Math.max(0, x - radius); i <= Math.min(glyphHeatmap.length - 1, x + radius); i++) {
          for (let j = Math.max(0, y - radius); j <= Math.min(glyphHeatmap[0].length - 1, y + radius); j++) {
            const dist = Math.sqrt(Math.pow(i - x, 2) + Math.pow(j - y, 2));
            if (dist <= radius) {
              glyphHeatmap[i][j] = Math.max(glyphHeatmap[i][j], 1 - dist / radius);
            }
          }
        }
      }
    });
  }
  
  // 創建網格結構，優先在字體區域生成更多點
  for (let x = 0; x < width; x += cellSize) {
    for (let y = 0; y < height; y += cellSize) {
      // 檢查當前位置是否在字形區域內
      const gridX = Math.floor(x / 5);
      const gridY = Math.floor(y / 5);
      let inGlyphArea = false;
      let areaFactor = 1;
      
      if (hasGlyphHeatmap && gridX >= 0 && gridX < glyphHeatmap.length && 
          gridY >= 0 && gridY < glyphHeatmap[0].length) {
        inGlyphArea = glyphHeatmap[gridX][gridY] > 0;
        areaFactor = 1 + glyphHeatmap[gridX][gridY] * 3; // 字形區域生成更多點
      }
      
      // 在字形區域內和周圍增加點的生成概率
      const generateProbability = inGlyphArea ? 0.8 : 0.3;
      
      // 添加更大的隨機偏移使點分佈更加隨機 - 應用粒子速率
      const jitterScale = inGlyphArea ? 0.7 : 1.0; // 字形區域內抖動減少，保持形狀
      const jitterX = noise(x * 0.1, y * 0.1, t * particleSpeed) * 20 * scale * jitterScale + 
                      (Math.random() - 0.5) * 30 * scale * particleSpeed * jitterScale;
      const jitterY = noise(y * 0.1, x * 0.1, t * particleSpeed) * 20 * scale * jitterScale + 
                      (Math.random() - 0.5) * 30 * scale * particleSpeed * jitterScale;
      
      // 網格點的活躍度，用於控制點的顯示/隱藏 - 應用粒子速率
      const activity = (noise(x * 0.02, y * 0.02, t * particleSpeed * 1.5) * 0.7 + Math.random() * 0.3) * areaFactor;
      
      // 增加隨機性，不是所有點都顯示
      // 根據網格密度調整點的顯示概率，避免高密度時點過多
      const densityFactor = Math.min(1, 40 / gridDensity); // 密度越高，顯示概率越低
      
      // 根據是否在字形區域內調整點的生成概率
      if (activity > pointLifespan - 0.1 && 
          Math.random() < generateProbability * densityFactor) {
        const gridPoint = {
          x: x + jitterX,
          y: y + jitterY,
          size: activity * ballSize * 0.15 * scale * (0.7 + Math.random() * 0.6), // 點大小增加隨機性
          activity,
          inGlyphArea
        };
        gridPoints.push(gridPoint);
      }
    }
  }
  
  // 為字體形狀創建影響區域
  const influenceMap = Array(Math.ceil(width / 5)).fill().map(() => Array(Math.ceil(height / 5)).fill(0));
  
  // 為每個基礎點創建影響區域
  basePoints.forEach(basePoint => {
    const influenceRadius = 50 * scale;
    const centerX = Math.floor(basePoint.x / 5);
    const centerY = Math.floor(basePoint.y / 5);
    const radiusGrids = Math.ceil(influenceRadius / 5);
    
    // 填充影響圖
    for (let i = Math.max(0, centerX - radiusGrids); i < Math.min(influenceMap.length, centerX + radiusGrids); i++) {
      for (let j = Math.max(0, centerY - radiusGrids); j < Math.min(influenceMap[0].length, centerY + radiusGrids); j++) {
        const dx = (i * 5) - basePoint.x;
        const dy = (j * 5) - basePoint.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance < influenceRadius) {
          // 使用二次衰減函數計算影響
          const influence = 1 - Math.pow(distance / influenceRadius, 2);
          influenceMap[i][j] = Math.max(influenceMap[i][j], influence);
        }
      }
    }
  });
  
  // 為每個網格點應用影響
  gridPoints.forEach(gridPoint => {
    const gridX = Math.floor(gridPoint.x / 5);
    const gridY = Math.floor(gridPoint.y / 5);
    
    // 確保網格點在影響圖範圍內
    if (gridX >= 0 && gridX < influenceMap.length && gridY >= 0 && gridY < influenceMap[0].length) {
      const influence = influenceMap[gridX][gridY];
      
      // 調整活躍度和大小基於字形影響
      gridPoint.activity = Math.min(1, gridPoint.activity + influence * 0.7);
      gridPoint.size = gridPoint.activity * ballSize * 0.15 * scale;
      
      // 添加字體形狀相關的屬性
      gridPoint.isNearGlyph = influence > 0.1;
    }
  });
  
  // 創建點之間的連接
  for (let i = 0; i < gridPoints.length; i++) {
    const p1 = gridPoints[i];
    
    for (let j = i + 1; j < gridPoints.length; j++) {
      const p2 = gridPoints[j];
      
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      // 基於距離和活躍度決定是否連接
      const connectionDistance = maxDistance * scale;
      
      // 如果兩個點都在字形區域內，增加連接距離
      if (p1.inGlyphArea && p2.inGlyphArea) {
        // 在字形區域內的點有更大的連接範圍，以保持字形形狀
        if (distance < connectionDistance * 1.5) {
          // 連接強度基於距離和兩點的活躍度，在字形區域內有更高權重
          const strength = (1 - distance / (connectionDistance * 1.5)) * Math.min(p1.activity, p2.activity) * 1.3;
          
          if (strength > 0.12) {
            connections.push({
              p1, p2, strength,
              inGlyph: true // 標記為字形內連接
            });
          }
        }
      } 
      // 至少一個點在字形區域內
      else if (p1.inGlyphArea || p2.inGlyphArea) {
        if (distance < connectionDistance * 1.2) {
          const strength = (1 - distance / (connectionDistance * 1.2)) * Math.min(p1.activity, p2.activity) * 1.1;
          
          if (strength > 0.1) {
            connections.push({
              p1, p2, strength,
              inGlyph: false
            });
          }
        }
      }
      // 兩個點都在字形區域外
      else if (distance < connectionDistance) {
        // 連接強度基於距離和兩點的活躍度
        const strength = (1 - distance / connectionDistance) * Math.min(p1.activity, p2.activity) * 0.8;
        
        if (strength > 0.08) {
          connections.push({
            p1, p2, strength,
            inGlyph: false
          });
        }
      }
    }
  }
  
  // 已移除波紋效果
  
  // 繪製連接線
  ctx.save();
  
  // 先繪製非字形區域的連接，再繪製字形區域的連接，以確保字形區域的連接在上層
  
  // 繪製非字形區域連接
  connections.filter(conn => !conn.inGlyph).forEach(connection => {
    const {p1, p2, strength} = connection;
    
    // 線的透明度基於連接強度
    ctx.strokeStyle = `rgba(0, 0, 0, ${strength * 0.6})`;
    ctx.lineWidth = handleLenRate * scale * 0.25;
    
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
  });
  
  // 繪製字形區域內的連接
  connections.filter(conn => conn.inGlyph).forEach(connection => {
    const {p1, p2, strength} = connection;
    
    // 字形區域內連接線更粗更明顯
    ctx.strokeStyle = `rgba(0, 0, 0, ${strength * 0.85})`;
    ctx.lineWidth = handleLenRate * scale * 0.4;
    
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
  });
  
  ctx.restore();
  
  // 繪製網格點
  ctx.save();
  gridPoints.forEach(point => {
    const { x, y, size, activity } = point;
    
    // 基於活躍度調整點的不透明度
    ctx.fillStyle = `rgba(0, 0, 0, ${activity})`;
    
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();
  
  // 繪製重要的基礎字形點 (作為視覺錨點)
  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
  
  basePoints.forEach(point => {
    ctx.beginPath();
    ctx.arc(point.x, point.y, 1.5 * scale, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();
}

// 帶舞動效果的顯示區域更新
function updateDisplayAreaWithDancing() {
  const text = document.getElementById('previewInput').value;
  const display = document.getElementById('displayArea');
  display.innerHTML = '';
  display.style.fontSize = fontSettings.fontSize + 'px';
  display.style.lineHeight = '1';
  
  const lines = text.split('\n');
  for (let line of lines) {
    const lineDiv = document.createElement('div');
    lineDiv.style.whiteSpace = 'nowrap';
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
      if (dancingPoints[ch]) {
        const charContainer = document.createElement('div');
        charContainer.style.display = 'inline-block';
        charContainer.style.marginRight = fontSettings.letterSpacing + 'px';
        charContainer.style.position = 'relative';
        charContainer.style.verticalAlign = 'top';
        
        const charCanvas = document.createElement('canvas');
        charCanvas.width = fontSettings.fontSize;
        charCanvas.height = fontSettings.fontSize;
        
        const ctx = charCanvas.getContext('2d');
        ctx.clearRect(0, 0, fontSettings.fontSize, fontSettings.fontSize);
        
        // 使用網絡連線樣式繪製舞動字符
        drawMetaballChar(ctx, ch, fontSettings.fontSize);
        
        charContainer.appendChild(charCanvas);
        lineDiv.appendChild(charContainer);
      } else if (glyphs[ch]) {
        // 如果有字形但沒有舞動點集（這應該不會發生，但以防萬一）
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
}


