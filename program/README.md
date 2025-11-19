# UAV × UGV Control Center - 總覽頁面

Flask 實現的 UAV 和 UGV 控制中心總覽頁面。

## 功能特色

### 已實現功能

1. **系統狀態卡片**
   - 顯示每台載具（UAV/UGV）的狀態
   - Arm/Disarm 控制按鈕
   - 飛行模式顯示
   - GPS 狀態和衛星數量
   - 數據更新頻率、延遲、封包遺失率
   - 數據新鮮度檢測（1000ms 未更新顯示 "No Data"）

2. **電池狀態**
   - 電壓和百分比顯示
   - 進度條可視化
   - 續航時間預估（UGV）
   - 充電狀態顯示

3. **姿態指示器**（使用真實資料）
   - 人工地平線顯示
   - Roll/Pitch/Yaw 角度可視化
   - 羅盤方位指示
   - 支援多載具切換
   - 數據過時顯示 "No Data"

4. **性能圖表**（使用真實資料）
   - 姿態角度圖表（Roll/Pitch/Yaw vs Time）
   - RC 輸入圖表（Throttle/Roll/Pitch/Yaw vs Time）
   - 速度圖表（Ground Speed vs Throttle）
   - 顯示最近 30 秒數據
   - 學術風格樣式

5. **位置資訊**
   - 經度、緯度顯示
   - 高度（UAV）
   - 地面速度

6. **鏡頭視圖**
   - 載具鏡頭顯示
   - 覆蓋資訊（Mode、Battery、Alt/Speed、Time）
   - 支援多載具切換

7. **訊息中心**
   - 顯示系統訊息
   - 按時間戳排序
   - 按級別分類（Info/Warning/Error）

## 安裝與啟動

### 1. 安裝依賴

```bash
cd program
pip install -r requirements.txt
```

### 2. 準備圖片資源

在 `static/images/` 目錄放置 `placeholder.jpg` 作為鏡頭視圖的占位圖片。

### 3. 啟動應用

```bash
python app.py
```

應用將在 `http://localhost:5000` 啟動。

## 項目結構

```
program/
├── app.py                 # Flask 應用主文件
├── requirements.txt       # Python 依賴
├── templates/
│   └── overview.html     # 總覽頁面模板
├── static/
│   ├── css/
│   │   └── overview.css  # 樣式文件
│   ├── js/
│   │   ├── attitude_indicator.js  # 姿態指示器
│   │   ├── charts.js              # 圖表管理器
│   │   └── overview.js            # 頁面主邏輯
│   └── images/
│       └── placeholder.jpg        # 占位圖片
└── README.md
```

## API 端點

### 獲取載具列表
```
GET /api/vehicles
```

### 獲取所有載具狀態
```
GET /api/vehicles/states
```

### 獲取單個載具狀態
```
GET /api/vehicle/<vehicle_id>/state
```

### 獲取載具歷史數據
```
GET /api/vehicle/<vehicle_id>/history
```

### 獲取訊息
```
GET /api/messages
```

### 武裝/解除武裝載具
```
POST /api/control/<vehicle_id>/arm
Body: { "arm": true/false }
```

### 切換載具模式
```
POST /api/control/<vehicle_id>/mode
Body: { "mode": "MANUAL" }
```

## 數據格式

載具狀態使用 `VehicleState` 格式：

```json
{
  "vehicleId": "UAV1",
  "type": "uav",
  "timestamp": 1732000000,
  "armed": true,
  "mode": "GUIDED",
  "gps": {
    "fix": 3,
    "satellites": 14,
    "hdop": 0.7
  },
  "battery": {
    "voltage": 15.4,
    "percent": 78,
    "remainingMin": 12,
    "charging": false
  },
  "position": {
    "lat": 22.999123,
    "lon": 120.222456,
    "altitude": 13.2
  },
  "attitude": {
    "rollDeg": -2.3,
    "pitchDeg": 1.1,
    "yawDeg": 180.0
  },
  "rc": {
    "throttle": 0.55,
    "roll": 0.02,
    "pitch": -0.10,
    "yaw": 0.00
  },
  "motion": {
    "groundSpeed": 3.2,
    "verticalSpeed": -0.3
  },
  "linkHealth": {
    "heartbeatHz": 20,
    "latencyMs": 80,
    "packetLossPercent": 1.2
  },
  "dataStale": false
}
```

## 注意事項

1. **數據新鮮度檢測**：如果 1000ms 內未收到新數據，會顯示 "No Data" 狀態
2. **模擬數據**：當前使用模擬數據進行測試，後續需要替換為真實的 MAVLink 數據源
3. **圖片資源**：請確保 `static/images/placeholder.jpg` 存在，否則鏡頭視圖可能無法顯示

## 後續開發

- [ ] 整合真實的 MAVLink 數據源
- [ ] 實現 WebSocket 實時數據推送（替代當前輪詢）
- [ ] 添加天氣資訊 API 整合
- [ ] 優化移動端響應式設計
- [ ] 添加數據持久化功能

## 授權

MIT License

