// System & Power Page Main JavaScript
class SystemPage {
    constructor() {
        this.vehicles = [];
        this.vehicleStates = {};
        this.settings = {
            updateRate: 10,
            highFreqData: false,
            playbackBuffer: 300
        };
        this.chargingHistory = [];
        this.companionStatus = {
            cpu: 0,
            memory: 0,
            temperature: 0,
            uptime: 0
        };
        
        this.init();
    }
    
    init() {
        this.initTimeDisplay();
        this.loadSettings();
        this.setupEventListeners();
        this.startDataUpdates();
    }
    
    initTimeDisplay() {
        const updateTime = () => {
            const now = new Date();
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
            }).replace(/\//g, '/');
            
            const timeEl = document.getElementById('currentTime');
            const dateEl = document.getElementById('currentDate');
            if (timeEl) timeEl.textContent = timeStr;
            if (dateEl) dateEl.textContent = dateStr;
        };
        
        updateTime();
        setInterval(updateTime, 1000);
    }
    
    loadSettings() {
        // 從 localStorage 載入設定
        const saved = localStorage.getItem('systemSettings');
        if (saved) {
            this.settings = { ...this.settings, ...JSON.parse(saved) };
        }
        
        // 更新 UI
        document.getElementById('updateRateSelect').value = this.settings.updateRate;
        document.getElementById('highFreqDataSwitch').checked = this.settings.highFreqData;
        document.getElementById('playbackBufferInput').value = this.settings.playbackBuffer;
    }
    
    async saveSettings() {
        this.settings.updateRate = parseInt(document.getElementById('updateRateSelect').value);
        this.settings.highFreqData = document.getElementById('highFreqDataSwitch').checked;
        this.settings.playbackBuffer = parseInt(document.getElementById('playbackBufferInput').value);
        
        // 儲存到 localStorage
        localStorage.setItem('systemSettings', JSON.stringify(this.settings));
        
        // 發送到後端更新回放緩衝設定
        try {
            const response = await fetch('/api/system/settings', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    playbackBuffer: this.settings.playbackBuffer
                })
            });
            
            const data = await response.json();
            if (data.success) {
                // 通知其他頁面設定已更新
                window.dispatchEvent(new CustomEvent('settingsUpdated', { detail: this.settings }));
                alert('設定已儲存');
            } else {
                alert('儲存失敗：' + (data.error || '未知錯誤'));
            }
        } catch (error) {
            console.error('Failed to save settings:', error);
            // 即使後端更新失敗，也保存到 localStorage
            alert('設定已儲存到本地，但後端更新失敗');
        }
    }
    
    setupEventListeners() {
        document.getElementById('saveSettingsBtn').addEventListener('click', () => {
            this.saveSettings();
        });
    }
    
    async startDataUpdates() {
        while (true) {
            try {
                // 獲取載具列表
                const vehiclesResponse = await fetch('/api/vehicles');
                const vehiclesData = await vehiclesResponse.json();
                if (vehiclesData.success) {
                    this.vehicles = vehiclesData.vehicles;
                }
                
                // 獲取載具狀態
                const statesResponse = await fetch('/api/vehicles/states');
                const statesData = await statesResponse.json();
                if (statesData.success) {
                    this.vehicleStates = statesData.data;
                    this.updateAllDisplays();
                }
                
                // 獲取充電歷史
                const historyResponse = await fetch('/api/charging/history');
                const historyData = await historyResponse.json();
                if (historyData.success) {
                    this.chargingHistory = historyData.history || [];
                    this.updateChargingHistory();
                }
                
                // 獲取 Companion 狀態
                const companionResponse = await fetch('/api/companion/status');
                const companionData = await companionResponse.json();
                if (companionData.success) {
                    this.companionStatus = companionData.status;
                    this.updateCompanionStatus();
                }
                
            } catch (error) {
                console.error('Failed to update data:', error);
            }
            
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
    
    updateAllDisplays() {
        this.updateLinkHealth();
        this.updateChargingStatus();
        this.updateHealthOverview();
    }
    
    updateLinkHealth() {
        const container = document.getElementById('linkHealthContent');
        if (!container) return;
        
        container.innerHTML = '';
        
        this.vehicles.forEach(vehicleId => {
            const state = this.vehicleStates[vehicleId];
            if (!state) return;
            
            const linkHealth = state.linkHealth || {};
            const linkType = linkHealth.linkType || 'Unknown';
            
            const item = document.createElement('div');
            item.className = 'link-health-item';
            
            const heartbeatStatus = this.getStatusClass(linkHealth.heartbeatHz, 10, 5);
            const latencyStatus = this.getStatusClass(linkHealth.latencyMs, 100, 200, true);
            const packetLossStatus = this.getStatusClass(linkHealth.packetLossPercent, 5, 10, true);
            
            item.innerHTML = `
                <h6>
                    <i class="fas fa-${state.type === 'uav' ? 'helicopter' : 'car'}"></i> 
                    ${vehicleId} (${state.type === 'uav' ? 'UAV' : 'UGV'})
                </h6>
                <div class="link-health-metric">
                    <span class="label">連線類型:</span>
                    <span class="value">${linkType}</span>
                </div>
                <div class="link-health-metric">
                    <span class="label">
                        <span class="status-indicator ${heartbeatStatus}"></span>
                        Heartbeat:
                    </span>
                    <span class="value">${(linkHealth.heartbeatHz || 0).toFixed(1)} Hz</span>
                </div>
                <div class="link-health-metric">
                    <span class="label">
                        <span class="status-indicator ${latencyStatus}"></span>
                        Latency:
                    </span>
                    <span class="value">${(linkHealth.latencyMs || 0).toFixed(0)} ms</span>
                </div>
                <div class="link-health-metric">
                    <span class="label">
                        <span class="status-indicator ${packetLossStatus}"></span>
                        Packet Loss:
                    </span>
                    <span class="value">${(linkHealth.packetLossPercent || 0).toFixed(2)} %</span>
                </div>
            `;
            
            container.appendChild(item);
        });
    }
    
    updateCompanionStatus() {
        const container = document.getElementById('companionStatusContent');
        if (!container) return;
        
        const cpuStatus = this.getStatusClass(this.companionStatus.cpu, 50, 80, true);
        const memoryStatus = this.getStatusClass(this.companionStatus.memory, 70, 90, true);
        const tempStatus = this.getStatusClass(this.companionStatus.temperature, 60, 80, true);
        
        const formatUptime = (seconds) => {
            const days = Math.floor(seconds / 86400);
            const hours = Math.floor((seconds % 86400) / 3600);
            const minutes = Math.floor((seconds % 3600) / 60);
            return `${days}天 ${hours}時 ${minutes}分`;
        };
        
        container.innerHTML = `
            <div class="companion-status-item">
                <span class="label">
                    <span class="status-indicator ${cpuStatus}"></span>
                    CPU 使用率:
                </span>
                <span class="value">${this.companionStatus.cpu.toFixed(1)}%</span>
            </div>
            <div class="companion-status-item">
                <span class="label">
                    <span class="status-indicator ${memoryStatus}"></span>
                    記憶體使用率:
                </span>
                <span class="value">${this.companionStatus.memory.toFixed(1)}%</span>
            </div>
            <div class="companion-status-item">
                <span class="label">
                    <span class="status-indicator ${tempStatus}"></span>
                    溫度:
                </span>
                <span class="value">${this.companionStatus.temperature.toFixed(1)}°C</span>
            </div>
            <div class="companion-status-item">
                <span class="label">運行時間:</span>
                <span class="value">${formatUptime(this.companionStatus.uptime)}</span>
            </div>
        `;
    }
    
    updateChargingStatus() {
        const container = document.getElementById('chargingStatusContent');
        if (!container) return;
        
        container.innerHTML = '';
        
        this.vehicles.forEach(vehicleId => {
            const state = this.vehicleStates[vehicleId];
            if (!state) return;
            
            const battery = state.battery || {};
            const chargeStatus = state.chargeStatus || {};
            const isCharging = chargeStatus.charging || battery.charging;
            
            const item = document.createElement('div');
            item.className = `charging-status-item ${isCharging ? 'charging' : ''}`;
            
            const estimateTime = isCharging && chargeStatus.chargeCurrent ? 
                this.calculateChargeTime(battery.percent, chargeStatus.chargeCurrent) : 
                null;
            
            item.innerHTML = `
                <h6>
                    <i class="fas fa-${state.type === 'uav' ? 'helicopter' : 'car'}"></i> 
                    ${vehicleId} (${state.type === 'uav' ? 'UAV' : 'UGV'})
                    ${isCharging ? '<span class="badge bg-success ms-2">充電中</span>' : ''}
                </h6>
                <div class="charging-metric">
                    <span class="label">電壓:</span>
                    <span class="value">${(battery.voltage || 0).toFixed(2)} V</span>
                </div>
                ${chargeStatus.chargeCurrent ? `
                <div class="charging-metric">
                    <span class="label">充電電流:</span>
                    <span class="value">${chargeStatus.chargeCurrent.toFixed(2)} A</span>
                </div>
                ` : ''}
                ${chargeStatus.chargeVoltage ? `
                <div class="charging-metric">
                    <span class="label">充電電壓:</span>
                    <span class="value">${chargeStatus.chargeVoltage.toFixed(2)} V</span>
                </div>
                ` : ''}
                <div class="charging-metric">
                    <span class="label">電池容量:</span>
                    <span class="value">${(battery.percent || 0).toFixed(1)}%</span>
                </div>
                ${estimateTime ? `
                <div class="charging-metric">
                    <span class="label">估計充飽時間:</span>
                    <span class="value">${estimateTime}</span>
                </div>
                ` : ''}
                <div class="charging-progress">
                    <div class="progress">
                        <div class="progress-bar ${this.getBatteryColorClass(battery.percent)}" 
                             role="progressbar" 
                             style="width: ${battery.percent || 0}%">
                            ${(battery.percent || 0).toFixed(0)}%
                        </div>
                    </div>
                </div>
            `;
            
            container.appendChild(item);
        });
    }
    
    updateChargingHistory() {
        const tbody = document.getElementById('chargingHistoryBody');
        if (!tbody) return;
        
        tbody.innerHTML = '';
        
        if (this.chargingHistory.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">暫無充電歷史紀錄</td></tr>';
            return;
        }
        
        this.chargingHistory.slice(-10).reverse().forEach(record => {
            const row = document.createElement('tr');
            const startTime = new Date(record.startTime * 1000).toLocaleString('zh-TW');
            const endTime = record.endTime ? 
                new Date(record.endTime * 1000).toLocaleString('zh-TW') : 
                '進行中';
            const duration = record.duration ? 
                this.formatDuration(record.duration) : 
                '進行中';
            
            row.innerHTML = `
                <td>${record.vehicleId}</td>
                <td>${startTime}</td>
                <td>${endTime}</td>
                <td>${record.startSOC.toFixed(1)}%</td>
                <td>${record.endSOC ? record.endSOC.toFixed(1) + '%' : '-'}</td>
                <td>${duration}</td>
            `;
            tbody.appendChild(row);
        });
    }
    
    updateHealthOverview() {
        const container = document.getElementById('healthOverviewContent');
        if (!container) return;
        
        container.innerHTML = '';
        
        this.vehicles.forEach(vehicleId => {
            const state = this.vehicleStates[vehicleId];
            if (!state) return;
            
            const healthScore = this.calculateHealthScore(state);
            const scoreDetails = this.getHealthScoreDetails(state);
            const gaugeContainer = document.createElement('div');
            gaugeContainer.className = 'col-md-6 health-gauge-container';
            
            const canvas = document.createElement('canvas');
            canvas.className = 'health-gauge-canvas';
            canvas.width = 200;
            canvas.height = 200;
            canvas.id = `healthGauge_${vehicleId}`;
            
            gaugeContainer.innerHTML = `
                <canvas class="health-gauge-canvas" id="healthGauge_${vehicleId}" width="200" height="200"></canvas>
                <div class="health-gauge-details">
                    <small class="text-muted">${scoreDetails}</small>
                </div>
            `;
            
            container.appendChild(gaugeContainer);
            
            // 繪製圓形儀表（包含文字）
            this.drawHealthGauge(`healthGauge_${vehicleId}`, healthScore, vehicleId);
        });
    }
    
    getHealthScoreDetails(state) {
        const linkHealth = state.linkHealth || {};
        const systemHealth = state.systemHealth || {};
        const battery = state.battery || {};
        const gps = state.gps || {};
        
        const issues = [];
        
        // 檢查連線健康
        if (linkHealth.heartbeatHz < 5) {
            issues.push('連線異常');
        } else if (linkHealth.heartbeatHz < 10) {
            issues.push('連線較慢');
        }
        
        if (linkHealth.latencyMs > 200) {
            issues.push('延遲過高');
        }
        
        if (linkHealth.packetLossPercent > 10) {
            issues.push('封包遺失');
        }
        
        // 檢查系統健康
        if (systemHealth.cpu > 80) {
            issues.push('CPU過載');
        }
        
        if (systemHealth.memory > 90) {
            issues.push('記憶體不足');
        }
        
        if (systemHealth.temperature > 80) {
            issues.push('溫度過高');
        }
        
        // 檢查電池
        if (battery.percent < 20) {
            issues.push('電量不足');
        }
        
        // 檢查GPS
        if (gps.fix < 2) {
            issues.push('GPS訊號弱');
        }
        
        if (issues.length === 0) {
            return '所有系統正常';
        } else {
            return issues.join(' • ');
        }
    }
    
    calculateHealthScore(state) {
        let score = 100;
        
        // Link Health (40%)
        const linkHealth = state.linkHealth || {};
        if (linkHealth.heartbeatHz < 5) score -= 20;
        else if (linkHealth.heartbeatHz < 10) score -= 10;
        
        if (linkHealth.latencyMs > 200) score -= 15;
        else if (linkHealth.latencyMs > 100) score -= 7;
        
        if (linkHealth.packetLossPercent > 10) score -= 15;
        else if (linkHealth.packetLossPercent > 5) score -= 7;
        
        // System Health (30%)
        const systemHealth = state.systemHealth || {};
        if (systemHealth.cpu > 80) score -= 10;
        else if (systemHealth.cpu > 50) score -= 5;
        
        if (systemHealth.memory > 90) score -= 10;
        else if (systemHealth.memory > 70) score -= 5;
        
        if (systemHealth.temperature > 80) score -= 10;
        else if (systemHealth.temperature > 60) score -= 5;
        
        // Battery (20%)
        const battery = state.battery || {};
        if (battery.percent < 20) score -= 10;
        else if (battery.percent < 50) score -= 5;
        
        // GPS (10%)
        const gps = state.gps || {};
        if (gps.fix < 2) score -= 10;
        else if (gps.fix < 3) score -= 5;
        
        return Math.max(0, Math.min(100, Math.round(score)));
    }
    
    drawHealthGauge(canvasId, score, vehicleId) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        const radius = 80;
        
        // 清除畫布
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // 繪製背景圓（完整圓）
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI, false);
        ctx.lineWidth = 20;
        ctx.strokeStyle = '#e0e0e0';
        ctx.stroke();
        
        // 繪製分數圓（完整圓，從頂部開始）
        const angle = (score / 100) * 2 * Math.PI;
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, -Math.PI / 2, -Math.PI / 2 + angle, false);
        ctx.lineWidth = 20;
        ctx.lineCap = 'round';
        ctx.strokeStyle = this.getHealthColor(score);
        ctx.stroke();
        
        // 在圓圈內繪製載具名稱
        ctx.fillStyle = '#333';
        ctx.font = 'bold 16px Arial, "Noto Sans TC", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(vehicleId, centerX, centerY - 15);
        
        // 在圓圈內繪製分數
        ctx.fillStyle = this.getHealthColor(score);
        ctx.font = 'bold 32px Arial, "Noto Sans TC", sans-serif';
        ctx.fillText(score.toString(), centerX, centerY + 15);
    }
    
    getHealthColor(score) {
        if (score >= 80) return '#28a745';
        if (score >= 60) return '#ffc107';
        return '#dc3545';
    }
    
    getStatusClass(value, warningThreshold, dangerThreshold, reverse = false) {
        if (reverse) {
            if (value >= dangerThreshold) return 'danger';
            if (value >= warningThreshold) return 'warning';
            return 'good';
        } else {
            if (value <= dangerThreshold) return 'danger';
            if (value <= warningThreshold) return 'warning';
            return 'good';
        }
    }
    
    getBatteryColorClass(percent) {
        if (percent > 50) return 'bg-success';
        if (percent > 20) return 'bg-warning';
        return 'bg-danger';
    }
    
    calculateChargeTime(currentPercent, chargeCurrent) {
        // 簡單估算：假設電池容量為 5000mAh，充電效率 80%
        const remainingPercent = 100 - currentPercent;
        const estimatedMinutes = Math.ceil((remainingPercent / 100) * 60 / (chargeCurrent / 5));
        
        if (estimatedMinutes < 60) {
            return `${estimatedMinutes} 分鐘`;
        } else {
            const hours = Math.floor(estimatedMinutes / 60);
            const minutes = estimatedMinutes % 60;
            return `${hours} 小時 ${minutes} 分鐘`;
        }
    }
    
    formatDuration(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        if (hours > 0) {
            return `${hours}時${minutes}分`;
        }
        return `${minutes}分`;
    }
}

// 初始化頁面
let systemPage;
document.addEventListener('DOMContentLoaded', () => {
    systemPage = new SystemPage();
});

