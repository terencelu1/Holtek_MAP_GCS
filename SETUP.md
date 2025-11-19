# 安裝與啟動指南

## 環境需求

- **Python 3.9+**（建議 3.10 或 3.11）
- **Node.js 16+**
- **npm 或 yarn**

## 後端設定

1. 進入後端目錄：
```bash
cd program/backend
```

2. 建立虛擬環境（建議）：
```bash
python -m venv venv
venv\Scripts\activate  # Windows
# 或
source venv/bin/activate  # Linux/Mac
```

3. 升級 pip：
```bash
python -m pip install --upgrade pip
```

4. 安裝依賴：
```bash
pip install -r requirements.txt
```

5. 啟動後端：
```bash
python app.py
```

或使用 Windows 批次檔：
```bash
start.bat
```

後端將在 `http://localhost:8000` 運行

## 前端設定

1. 進入前端目錄：
```bash
cd program/frontend
```

2. 安裝依賴：
```bash
npm install
```

3. 啟動前端：
```bash
npm run dev
```

或使用 Windows 批次檔：
```bash
start.bat
```

前端將在 `http://localhost:5173` 運行

## 注意事項

1. 請先啟動後端，再啟動前端
2. 確保後端在 `http://localhost:8000` 運行
3. 前端會自動連接到後端 API
4. 照片檔案已複製到 `program/frontend/public/` 目錄

## API 文檔

後端啟動後，可以訪問：
- API 文檔：`http://localhost:8000/docs`
- 健康檢查：`http://localhost:8000/api/health`

