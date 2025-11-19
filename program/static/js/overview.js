// Overview Page Main JavaScript
class OverviewPage {
    constructor() {
        this.vehicles = [];
        this.vehicleStates = {};
        this.updateInterval = null;
        this.attitudeIndicator = null;
        this.chartManager = null;
        this.currentVehicle = 'UAV1';
        
        this.init();
    }
    
    init() {
        // 初始化組件
        this.initAttitudeIndicator();
        this.initChartManager();
        this.initTimeDisplay();
        this.initEventListeners();
        
        // 載入初始數據
        this.loadVehicles();
        this.startDataUpdates();
        
        console.log('Overview page initialized');
    }
    
    initAttitudeIndicator() {
        if (document.getElementById('attitudeCanvas')) {
            this.attitudeIndicator = new AttitudeIndicator('attitudeCanvas');
        }
    }
    
    initChartManager() {
        this.chartManager = new ChartManager();
    }
    
    initTimeDisplay() {
        // 更新時間顯示（使用合理的固定值）
        const updateTime = () => {
            const now = new Date();
            // 使用當前時間，但可以調整為固定值
            const timeStr = now.toLocaleTimeString('zh-TW', { 
                hour12: false,
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });
            const dateStr = now.toLocaleDateString('zh-TW', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit'
            });
            
            const timeEl = document.getElementById('currentTime');
            const dateEl = document.getElementById('currentDate');
            
            if (timeEl) timeEl.textContent = timeStr;
            if (dateEl) dateEl.textContent = dateStr;
        };
        
        // 立即更新一次
        updateTime();
        
        // 每秒更新
        setInterval(updateTime, 1000);
    }
    
    initEventListeners() {
        // 載具選擇器
        const attitudeSelect = document.getElementById('attitudeVehicleSelect');
        const chartSelect = document.getElementById('chartVehicleSelect');
        const cameraSelect = document.getElementById('cameraVehicleSelect');
        
        if (attitudeSelect) {
            attitudeSelect.addEventListener('change', (e) => {
                this.currentVehicle = e.target.value;
                this.updateAttitudeDisplay();
            });
        }
        
        if (chartSelect) {
            chartSelect.addEventListener('change', (e) => {
                this.currentVehicle = e.target.value;
                this.chartManager.clearChartData();
            });
        }
        
        if (cameraSelect) {
            cameraSelect.addEventListener('change', (e) => {
                this.updateCameraDisplay(e.target.value);
            });
        }
        
        // 清除訊息
        const clearBtn = document.getElementById('clearMessages');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                this.clearMessages();
            });
        }
    }
    
    async loadVehicles() {
        try {
            const response = await fetch('/api/vehicles');
            const data = await response.json();
            
            if (data.success) {
                this.vehicles = data.vehicles;
                this.renderSystemStatusCards();
            }
        } catch (error) {
            console.error('Failed to load vehicles:', error);
        }
    }
    
    async loadVehicleStates() {
        try {
            const response = await fetch('/api/vehicles/states');
            const data = await response.json();
            
            if (data.success) {
                this.vehicleStates = data.data;
                this.updateAllDisplays();
            }
        } catch (error) {
            console.error('Failed to load vehicle states:', error);
        }
    }
    
    renderSystemStatusCards() {
        const container = document.getElementById('systemStatusCards');
        if (!container) return;
        
        // 這裡我們不每次重繪，避免閃爍，除非數量變了
        if (container.children.length === this.vehicles.length) {
            this.updateSystemStatusCardsValues();
            return;
        }
        
        container.innerHTML = '';
        
        this.vehicles.forEach(vehicleId => {
            const card = this.createSystemStatusCard(vehicleId);
            container.appendChild(card);
        });
    }
    
    createSystemStatusCard(vehicleId) {
        const col = document.createElement('div');
        col.className = 'col-md-6 col-lg-4';
        
        const card = document.createElement('div');
        card.className = 'card system-status-card';
        card.id = `statusCard-${vehicleId}`;
        
        // 初始內容
        card.innerHTML = this.getSystemStatusCardHTML(vehicleId, {});
        
        col.appendChild(card);
        return col;
    }
    
    getSystemStatusCardHTML(vehicleId, state) {
        return `
            <div class="card-header">
                <div class="vehicle-header">
                    <span class="vehicle-name">${vehicleId}</span>
                    <span class="badge vehicle-type-badge ${state.type === 'uav' ? 'bg-primary' : 'bg-success'}">
                        ${state.type === 'uav' ? 'UAV' : 'UGV'}
                    </span>
                </div>
            </div>
            <div class="card-body">
                <div class="status-grid">
                    <div class="status-item">
                        <label>Arm 狀態:</label>
                        <div class="value">
                            <button class="btn btn-sm ${state.armed ? 'btn-success' : 'btn-secondary'}" 
                                    onclick="overviewPage.toggleArm('${vehicleId}')">
                                ${state.armed ? 'ARMED' : 'DISARMED'}
                            </button>
                        </div>
                    </div>
                    <div class="status-item">
                        <label>Mode:</label>
                        <div class="value">
                            <span class="badge bg-info">${state.mode || 'UNKNOWN'}</span>
                        </div>
                    </div>
                    <div class="status-item">
                        <label>GPS:</label>
                        <div class="value">
                            <span class="badge ${state.gps?.fix >= 3 ? 'bg-success' : 'bg-warning'}">
                                ${state.gps?.fix || 0}D | ${state.gps?.satellites || 0} 衛星
                            </span>
                        </div>
                    </div>
                    <div class="status-item">
                        <label>更新頻率:</label>
                        <div class="value">${state.linkHealth?.heartbeatHz || 0} Hz</div>
                    </div>
                    <div class="status-item">
                        <label>延遲:</label>
                        <div class="value">${state.linkHealth?.latencyMs || 0} ms</div>
                    </div>
                    <div class="status-item">
                        <label>封包遺失:</label>
                        <div class="value">${(state.linkHealth?.packetLossPercent || 0).toFixed(1)}%</div>
                    </div>
                </div>
                <div class="data-update-info ${state.dataStale ? 'data-stale' : ''}">
                    ${state.dataStale ? '⚠ No Data (超過1000ms未更新)' : '數據正常'}
                </div>
            </div>
        `;
    }

    updateSystemStatusCardsValues() {
        this.vehicles.forEach(vehicleId => {
            const card = document.getElementById(`statusCard-${vehicleId}`);
            if (card) {
                const state = this.vehicleStates[vehicleId] || {};
                card.innerHTML = this.getSystemStatusCardHTML(vehicleId, state);
                
                const isConnected = !state.dataStale;
                if (isConnected) {
                    card.classList.add('connected');
                    card.classList.remove('disconnected');
                } else {
                    card.classList.add('disconnected');
                    card.classList.remove('connected');
                }
            }
        });
    }
    
    updateAllDisplays() {
        // 更新系統狀態卡片
        this.renderSystemStatusCards();
        
        // 更新電池狀態
        this.updateBatteryDisplay();
        
        // 更新位置資訊
        this.updatePositionDisplay();
        
        // 更新姿態指示器
        this.updateAttitudeDisplay();
        
        // 更新圖表
        this.updateCharts();
        
        // 更新鏡頭
        this.updateCameraDisplay();
        
        // 更新訊息中心
        this.updateMessageCenter();
    }
    
    updateBatteryDisplay() {
        const container = document.getElementById('batteryStatusContent');
        if (!container) return;
        
        container.innerHTML = '';
        
        this.vehicles.forEach(vehicleId => {
            const state = this.vehicleStates[vehicleId];
            if (!state) return;
            
            const battery = state.battery || {};
            const batteryItem = document.createElement('div');
            batteryItem.className = 'battery-item';
            
            const percent = battery.percent || 0;
            const progressClass = percent > 50 ? 'bg-success' : 
                                 percent > 20 ? 'bg-warning' : 'bg-danger';
            
            batteryItem.innerHTML = `
                <label>${vehicleId} (${state.type === 'uav' ? 'UAV' : 'UGV'})</label>
                <div class="battery-value">${(battery.voltage || 0).toFixed(1)}V | ${percent.toFixed(0)}%</div>
                <div class="progress battery-progress">
                    <div class="progress-bar ${progressClass}" role="progressbar" 
                         style="width: ${percent}%">${percent.toFixed(0)}%</div>
                </div>
                ${state.type === 'ugv' && battery.charging ? 
                    `<small class="text-info"><i class="fas fa-bolt"></i> 充電中</small>` : ''}
                ${state.type === 'ugv' ? 
                    `<small class="text-muted">續航: ${battery.remainingMin || 0} 分鐘</small>` : ''}
            `;
            
            container.appendChild(batteryItem);
        });
    }
    
    updatePositionDisplay() {
        const container = document.getElementById('positionInfoContent');
        if (!container) return;
        
        container.innerHTML = '';
        
        this.vehicles.forEach(vehicleId => {
            const state = this.vehicleStates[vehicleId];
            if (!state) return;
            
            const position = state.position || {};
            const motion = state.motion || {};
            
            const positionItem = document.createElement('div');
            positionItem.className = 'position-item';
            positionItem.innerHTML = `
                <label>${vehicleId}</label>
                <div class="position-value">
                    緯度: ${position.lat?.toFixed(6) || '0.000000'}<br>
                    經度: ${position.lon?.toFixed(6) || '0.000000'}<br>
                    ${state.type === 'uav' ? `高度: ${(position.altitude || 0).toFixed(1)} m<br>` : ''}
                    速度: ${(motion.groundSpeed || 0).toFixed(1)} m/s
                </div>
            `;
            
            container.appendChild(positionItem);
        });
    }
    
    updateAttitudeDisplay() {
        const state = this.vehicleStates[this.currentVehicle];
        if (!state || !this.attitudeIndicator) return;
        
        const attitude = state.attitude || {};
        
        // 更新姿態指示器
        this.attitudeIndicator.update({
            rollDeg: attitude.rollDeg || 0,
            pitchDeg: attitude.pitchDeg || 0,
            yawDeg: attitude.yawDeg || 0,
            dataStale: state.dataStale || false
        });
        
        // 更新數值顯示
        const rollEl = document.getElementById('rollValue');
        const pitchEl = document.getElementById('pitchValue');
        const yawEl = document.getElementById('yawValue');
        
        if(rollEl) rollEl.textContent = `${(attitude.rollDeg || 0).toFixed(1)}°`;
        if(pitchEl) pitchEl.textContent = `${(attitude.pitchDeg || 0).toFixed(1)}°`;
        if(yawEl) yawEl.textContent = `${(attitude.yawDeg || 0).toFixed(1)}°`;
    }
    
    updateCharts() {
        const state = this.vehicleStates[this.currentVehicle];
        if (!state || !this.chartManager) return;
        
        this.chartManager.updateChartData(this.currentVehicle, state);
    }
    
    updateCameraDisplay(vehicleId = null) {
        // 優先使用傳入的 vehicleId，其次讀取鏡頭卡片下拉選單的值，最後才用全域 currentVehicle
        let targetVehicle = vehicleId;
        
        if (!targetVehicle) {
            const select = document.getElementById('cameraVehicleSelect');
            if (select) {
                targetVehicle = select.value;
            }
        }
        
        targetVehicle = targetVehicle || this.currentVehicle;
        
        const state = this.vehicleStates[targetVehicle];
        if (!state) return;
        
        // 更新圖片路徑（如果後端有提供）
        const img = document.getElementById('cameraImage');
        if (img && state.cameraUrl) {
            // 僅當路徑改變時更新，避免閃爍
            const currentSrc = img.getAttribute('src');
            if (currentSrc !== state.cameraUrl) {
                img.src = state.cameraUrl;
            }
        }
        
        // 更新鏡頭覆蓋資訊
        document.getElementById('cameraMode').textContent = state.mode || '--';
        document.getElementById('cameraBattery').textContent = 
            `${(state.battery?.percent || 0).toFixed(0)}%`;
        
        if (state.type === 'uav') {
            document.getElementById('cameraAltSpeed').textContent = 
                `${(state.position?.altitude || 0).toFixed(1)} m / ${(state.motion?.groundSpeed || 0).toFixed(1)} m/s`;
        } else {
            document.getElementById('cameraAltSpeed').textContent = 
                `0.0 m / ${(state.motion?.groundSpeed || 0).toFixed(1)} m/s`;
        }
        
        const now = new Date();
        const timeEl = document.getElementById('cameraTime');
        if (timeEl) {
            timeEl.textContent = now.toLocaleTimeString('zh-TW', { hour12: false });
        }
    }
    
    async updateMessageCenter() {
        try {
            const response = await fetch('/api/messages');
            const data = await response.json();
            
            if (data.success) {
                this.renderMessages(data.data);
            }
        } catch (error) {
            console.error('Failed to load messages:', error);
        }
    }
    
    renderMessages(messages) {
        const container = document.getElementById('messageCenter');
        if (!container) return;
        
        container.innerHTML = '';
        
        if (messages.length === 0) {
            container.innerHTML = '<div class="text-center text-muted p-3">暫無訊息</div>';
            return;
        }
        
        messages.slice(-20).reverse().forEach(msg => {
            const messageItem = document.createElement('div');
            messageItem.className = `message-item ${msg.level || 'info'}`;
            
            const time = new Date(msg.timestamp * 1000);
            messageItem.innerHTML = `
                <div class="message-header">
                    <span class="message-vehicle">${msg.vehicle || 'System'}</span>
                    <span class="message-time">${time.toLocaleTimeString('zh-TW')}</span>
                </div>
                <div class="message-text">${msg.message || ''}</div>
            `;
            
            container.appendChild(messageItem);
        });
    }
    
    clearMessages() {
        const container = document.getElementById('messageCenter');
        if (container) {
            container.innerHTML = '<div class="text-center text-muted p-3">暫無訊息</div>';
        }
    }
    
    async toggleArm(vehicleId) {
        const state = this.vehicleStates[vehicleId];
        if (!state) return;
        
        const newArmState = !state.armed;
        
        try {
            const response = await fetch(`/api/control/${vehicleId}/arm`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ arm: newArmState })
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.loadVehicleStates();
            } else {
                alert('武裝/解除武裝失敗: ' + (data.error || '未知錯誤'));
            }
        } catch (error) {
            console.error('Failed to toggle arm:', error);
            alert('請求失敗');
        }
    }
    
    startDataUpdates() {
        // 立即載入一次
        this.loadVehicleStates();
        
        // 每200ms更新一次（5Hz，提高平滑度）
        this.updateInterval = setInterval(() => {
            this.loadVehicleStates();
        }, 200);
    }
    
    stopDataUpdates() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
    }
}

// 初始化頁面
let overviewPage;

document.addEventListener('DOMContentLoaded', () => {
    overviewPage = new OverviewPage();
    window.overviewPage = overviewPage; // 供全局訪問
});
