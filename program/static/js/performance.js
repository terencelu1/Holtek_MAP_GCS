// Performance & Logs Page JavaScript
class PerformancePage {
    constructor() {
        this.charts = {};
        this.dataBuffers = {};
        this.logs = [];
        this.currentVehicle = 'UAV1';
        this.mode = 'realtime'; // 'realtime' or 'playback'
        this.timeRange = 60; // 預設1分鐘
        this.maxDataPoints = 1000;
        this.updateRate = 10; // 預設10Hz
        this.updateInterval = null;
        this.smoothingEnabled = true; // 平滑濾波開關
        this.smoothingWindow = 3; // 平滑窗口大小（移動平均）
        this.playbackState = {
            playing: false,
            speed: 2,
            currentTime: 0,
            startTime: null,
            endTime: null,
            duration: 0,
            playbackInterval: null,
            historyData: null,
            playbackStartTime: null,
            playbackStartPosition: 0,
            lastUpdateTime: 0
        };
        
        // 學術風格配置（與總覽頁面一致）
        this.academicStyle = {
            fontFamily: 'Arial, "Noto Sans TC", sans-serif',
            fontSize: 10,
            titleFontSize: 12,
            lineColors: ['#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd'],
            backgroundColor: '#ffffff',
            gridColor: '#e0e0e0',
            tickColor: '#888888',
            lineWidth: 1.5,
            enableGrid: true,
            padding: 5,
            pointRadius: 0,
            pointHoverRadius: 0,
            fillOpacity: 0.1
        };
        
        this.init();
    }
    
    init() {
        this.initTimeDisplay();
        this.initCharts();
        this.initEventListeners();
        this.startChartUpdater();
        this.startDataUpdates();
        console.log('Performance page initialized');
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
            });
            
            const timeEl = document.getElementById('currentTime');
            const dateEl = document.getElementById('currentDate');
            
            if (timeEl) timeEl.textContent = timeStr;
            if (dateEl) dateEl.textContent = dateStr;
        };
        
        updateTime();
        setInterval(updateTime, 1000);
    }
    
    initCharts() {
        // 初始化所有圖表
        this.charts.attitude = this.createAttitudeChart();
        this.charts.rc = this.createRCChart();
        this.charts.motion = this.createMotionChart();
        this.charts.altitude = this.createAltitudeChart();
        
        // 根據載具類型顯示/隱藏高度圖表
        this.updateAltitudeTabVisibility();
        
        // 啟動定時更新
        this.startChartUpdater();
    }
    
    initEventListeners() {
        // 載具選擇器
        document.getElementById('vehicleSelect').addEventListener('change', (e) => {
            this.currentVehicle = e.target.value;
            this.updateAltitudeTabVisibility();
            this.clearCharts();
            this.dataBuffers[this.currentVehicle] = {
                attitude: { roll: [], pitch: [], yaw: [], time: [] },
                rc: { throttle: [], roll: [], pitch: [], yaw: [], time: [] },
                motion: { groundSpeed: [], throttle: [], time: [] },
                altitude: { altitude: [], time: [] }
            };
        });
        
        // 時間範圍選擇器
        const timeRangeSelect = document.getElementById('chartTimeRange');
        if (timeRangeSelect) {
            timeRangeSelect.addEventListener('change', (e) => {
                this.setTimeRange(parseInt(e.target.value));
            });
        }
        
        // 更新頻率選擇器
        const updateRateSelect = document.getElementById('chartUpdateRate');
        if (updateRateSelect) {
            updateRateSelect.addEventListener('change', (e) => {
                this.setUpdateRate(parseInt(e.target.value));
            });
        }
        
        // 模式切換
        document.querySelectorAll('input[name="mode"]').forEach(radio => {
            radio.addEventListener('change', async (e) => {
                this.mode = e.target.value;
                this.togglePlaybackControls();
                if (this.mode === 'realtime') {
                    this.stopPlayback();
                } else if (this.mode === 'playback') {
                    // 切換到回放模式時，載入歷史數據
                    await this.loadPlaybackData();
                }
            });
        });
        
        // 回放控制
        document.getElementById('playBtn').addEventListener('click', () => {
            this.startPlayback();
        });
        
        document.getElementById('pauseBtn').addEventListener('click', () => {
            this.pausePlayback();
        });
        
        document.getElementById('stopBtn').addEventListener('click', () => {
            this.stopPlayback();
        });
        
        document.getElementById('playbackSpeed').addEventListener('change', (e) => {
            this.playbackState.speed = parseInt(e.target.value);
        });
        
        document.getElementById('playbackSlider').addEventListener('input', (e) => {
            if (!this.playbackState.playing) {
                this.seekPlayback(parseInt(e.target.value));
            }
        });
        
        // 匯出日誌
        document.getElementById('exportLogsBtn').addEventListener('click', () => {
            this.exportLogs();
        });
    }
    
    setUpdateRate(rate) {
        this.updateRate = rate;
        console.log(`圖表更新頻率更新為 ${rate} Hz`);
        
        // 重新啟動更新器
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
        }
        this.startChartUpdater();
    }
    
    setTimeRange(seconds) {
        this.timeRange = seconds;
        console.log(`時間範圍更新為 ${seconds} 秒`);
        
        // 更新所有圖表的時間軸
        this.updateAllCharts();
    }
    
    startChartUpdater() {
        // 根據更新頻率計算更新間隔
        const interval = 1000 / this.updateRate; // 毫秒
        
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
        }
        
        this.updateInterval = setInterval(() => {
            this.updateAllCharts();
        }, interval);
    }
    
    createAttitudeChart() {
        const ctx = document.getElementById('attitudeChart');
        if (!ctx) return null;
        
        const context = ctx.getContext('2d');
        const style = this.academicStyle;
        
        return new Chart(context, {
            type: 'line',
            data: {
                datasets: [
                    {
                        label: 'Roll',
                        data: [],
                        borderColor: style.lineColors[0],
                        backgroundColor: this.createGradient(context, style.lineColors[0], style.fillOpacity),
                        borderWidth: style.lineWidth,
                        tension: 0.4,
                        fill: false,
                        yAxisID: 'y',
                        pointRadius: 0,
                        pointHoverRadius: 0
                    },
                    {
                        label: 'Pitch',
                        data: [],
                        borderColor: style.lineColors[1],
                        backgroundColor: this.createGradient(context, style.lineColors[1], style.fillOpacity),
                        borderWidth: style.lineWidth,
                        tension: 0.4,
                        fill: false,
                        yAxisID: 'y',
                        pointRadius: 0,
                        pointHoverRadius: 0
                    },
                    {
                        label: 'Yaw',
                        data: [],
                        borderColor: style.lineColors[2],
                        backgroundColor: this.createGradient(context, style.lineColors[2], style.fillOpacity),
                        borderWidth: style.lineWidth,
                        tension: 0.4,
                        fill: false,
                        yAxisID: 'y1',
                        pointRadius: 0,
                        pointHoverRadius: 0
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: { duration: 0 },
                plugins: {
                    legend: {
                        position: 'top',
                        labels: {
                            font: { size: style.fontSize },
                            padding: 8,
                            usePointStyle: true,
                            boxWidth: 6
                        }
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false
                    }
                },
                scales: {
                    x: {
                        type: 'linear',
                        min: Date.now() - this.timeRange * 1000,
                        max: Date.now(),
                        ticks: {
                            font: { size: style.fontSize - 1 },
                            color: style.tickColor,
                            maxTicksLimit: 10,
                            stepSize: 10000, // 最低間隔10秒
                            callback: (value) => {
                                const now = Date.now();
                                const diff = (now - value) / 1000;
                                const minutes = Math.floor(diff / 60);
                                const seconds = Math.floor(diff % 60);
                                
                                if (minutes > 0) {
                                    return `${minutes}分${seconds}秒`;
                                } else {
                                    return `${seconds}秒`;
                                }
                            }
                        },
                        grid: { color: style.gridColor }
                    },
                    y: {
                        type: 'linear',
                        position: 'left',
                        min: -45,
                        max: 45,
                        ticks: {
                            font: { size: style.fontSize - 1 },
                            color: style.tickColor,
                            stepSize: 15
                        },
                        grid: { color: style.gridColor }
                    },
                    y1: {
                        type: 'linear',
                        position: 'right',
                        min: -180,
                        max: 180,
                        ticks: {
                            font: { size: style.fontSize - 1 },
                            color: style.tickColor,
                            stepSize: 60
                        },
                        grid: { drawOnChartArea: false }
                    }
                },
                layout: { padding: style.padding }
            }
        });
    }
    
    createRCChart() {
        const ctx = document.getElementById('rcChart');
        if (!ctx) return null;
        
        const context = ctx.getContext('2d');
        const style = this.academicStyle;
        
        return new Chart(context, {
            type: 'line',
            data: {
                datasets: [
                    {
                        label: 'Throttle',
                        data: [],
                        borderColor: style.lineColors[0],
                        borderWidth: style.lineWidth,
                        tension: 0.4,
                        fill: false,
                        yAxisID: 'y',
                        pointRadius: 0,
                        pointHoverRadius: 0
                    },
                    {
                        label: 'Roll',
                        data: [],
                        borderColor: style.lineColors[1],
                        borderWidth: style.lineWidth,
                        tension: 0.4,
                        fill: false,
                        yAxisID: 'y',
                        pointRadius: 0,
                        pointHoverRadius: 0
                    },
                    {
                        label: 'Pitch',
                        data: [],
                        borderColor: style.lineColors[2],
                        borderWidth: style.lineWidth,
                        tension: 0.4,
                        fill: false,
                        yAxisID: 'y',
                        pointRadius: 0,
                        pointHoverRadius: 0
                    },
                    {
                        label: 'Yaw',
                        data: [],
                        borderColor: style.lineColors[3],
                        borderWidth: style.lineWidth,
                        tension: 0.4,
                        fill: false,
                        yAxisID: 'y',
                        pointRadius: 0,
                        pointHoverRadius: 0
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: { duration: 0 },
                plugins: {
                    legend: {
                        position: 'top',
                        labels: {
                            font: { size: style.fontSize },
                            padding: 8,
                            usePointStyle: true,
                            boxWidth: 6
                        }
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false
                    }
                },
                scales: {
                    x: {
                        type: 'linear',
                        min: Date.now() - this.timeRange * 1000,
                        max: Date.now(),
                        ticks: {
                            font: { size: style.fontSize - 1 },
                            color: style.tickColor,
                            maxTicksLimit: 10,
                            stepSize: 10000, // 最低間隔10秒
                            callback: (value) => {
                                const now = Date.now();
                                const diff = (now - value) / 1000;
                                const minutes = Math.floor(diff / 60);
                                const seconds = Math.floor(diff % 60);
                                
                                if (minutes > 0) {
                                    return `${minutes}分${seconds}秒`;
                                } else {
                                    return `${seconds}秒`;
                                }
                            }
                        },
                        grid: { color: style.gridColor }
                    },
                    y: {
                        type: 'linear',
                        position: 'left',
                        min: -1,
                        max: 1,
                        ticks: {
                            font: { size: style.fontSize - 1 },
                            color: style.tickColor,
                            stepSize: 0.2
                        },
                        grid: { color: style.gridColor }
                    }
                },
                layout: { padding: style.padding }
            }
        });
    }
    
    createMotionChart() {
        const ctx = document.getElementById('motionChart');
        if (!ctx) return null;
        
        const context = ctx.getContext('2d');
        const style = this.academicStyle;
        
        return new Chart(context, {
            type: 'line',
            data: {
                datasets: [
                    {
                        label: 'Ground Speed',
                        data: [],
                        borderColor: style.lineColors[0],
                        borderWidth: style.lineWidth,
                        tension: 0.4,
                        fill: false,
                        yAxisID: 'y',
                        pointRadius: 0,
                        pointHoverRadius: 0
                    },
                    {
                        label: 'Throttle',
                        data: [],
                        borderColor: style.lineColors[1],
                        borderWidth: style.lineWidth,
                        tension: 0.4,
                        fill: false,
                        yAxisID: 'y1',
                        pointRadius: 0,
                        pointHoverRadius: 0
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: { duration: 0 },
                plugins: {
                    legend: {
                        position: 'top',
                        labels: {
                            font: { size: style.fontSize },
                            padding: 8,
                            usePointStyle: true,
                            boxWidth: 6
                        }
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false
                    }
                },
                scales: {
                    x: {
                        type: 'linear',
                        min: Date.now() - this.timeRange * 1000,
                        max: Date.now(),
                        ticks: {
                            font: { size: style.fontSize - 1 },
                            color: style.tickColor,
                            maxTicksLimit: 10,
                            stepSize: 10000, // 最低間隔10秒
                            callback: (value) => {
                                const now = Date.now();
                                const diff = (now - value) / 1000;
                                const minutes = Math.floor(diff / 60);
                                const seconds = Math.floor(diff % 60);
                                
                                if (minutes > 0) {
                                    return `${minutes}分${seconds}秒`;
                                } else {
                                    return `${seconds}秒`;
                                }
                            }
                        },
                        grid: { color: style.gridColor }
                    },
                    y: {
                        type: 'linear',
                        position: 'left',
                        min: 0,
                        ticks: {
                            font: { size: style.fontSize - 1 },
                            color: style.tickColor
                        },
                        grid: { color: style.gridColor }
                    },
                    y1: {
                        type: 'linear',
                        position: 'right',
                        min: 0,
                        max: 1,
                        ticks: {
                            font: { size: style.fontSize - 1 },
                            color: style.tickColor,
                            stepSize: 0.2
                        },
                        grid: { drawOnChartArea: false }
                    }
                },
                layout: { padding: style.padding }
            }
        });
    }
    
    createAltitudeChart() {
        const ctx = document.getElementById('altitudeChart');
        if (!ctx) return null;
        
        const context = ctx.getContext('2d');
        const style = this.academicStyle;
        
        return new Chart(context, {
            type: 'line',
            data: {
                datasets: [
                    {
                        label: 'Altitude',
                        data: [],
                        borderColor: style.lineColors[0],
                        backgroundColor: this.createGradient(context, style.lineColors[0], style.fillOpacity),
                        borderWidth: style.lineWidth,
                        tension: 0.4,
                        fill: true,
                        pointRadius: 0,
                        pointHoverRadius: 0
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: { duration: 0 },
                plugins: {
                    legend: {
                        position: 'top',
                        labels: {
                            font: { size: style.fontSize },
                            padding: 8,
                            usePointStyle: true,
                            boxWidth: 6
                        }
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false
                    }
                },
                scales: {
                    x: {
                        type: 'linear',
                        min: Date.now() - this.timeRange * 1000,
                        max: Date.now(),
                        ticks: {
                            font: { size: style.fontSize - 1 },
                            color: style.tickColor,
                            maxTicksLimit: 10,
                            stepSize: 10000, // 最低間隔10秒
                            callback: (value) => {
                                const now = Date.now();
                                const diff = (now - value) / 1000;
                                const minutes = Math.floor(diff / 60);
                                const seconds = Math.floor(diff % 60);
                                
                                if (minutes > 0) {
                                    return `${minutes}分${seconds}秒`;
                                } else {
                                    return `${seconds}秒`;
                                }
                            }
                        },
                        grid: { color: style.gridColor }
                    },
                    y: {
                        min: 0,
                        ticks: {
                            font: { size: style.fontSize - 1 },
                            color: style.tickColor
                        },
                        grid: { color: style.gridColor }
                    }
                },
                layout: { padding: style.padding }
            }
        });
    }
    
    createGradient(ctx, color, opacity) {
        try {
            const gradient = ctx.createLinearGradient(0, 0, 0, 400);
            const rgbColor = this.hexToRgb(color);
            gradient.addColorStop(0, `rgba(${rgbColor.r}, ${rgbColor.g}, ${rgbColor.b}, ${opacity})`);
            gradient.addColorStop(1, `rgba(${rgbColor.r}, ${rgbColor.g}, ${rgbColor.b}, 0)`);
            return gradient;
        } catch (e) {
            return this.hexToRgba(color, opacity);
        }
    }
    
    hexToRgb(hex) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return { r, g, b };
    }
    
    hexToRgba(hex, alpha) {
        const rgb = this.hexToRgb(hex);
        return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
    }
    
    // 平滑濾波函數（移動平均）
    applySmoothingFilter(dataArray, windowSize = 3) {
        if (!this.smoothingEnabled || dataArray.length < windowSize) {
            return dataArray;
        }
        
        const smoothed = [];
        const halfWindow = Math.floor(windowSize / 2);
        
        for (let i = 0; i < dataArray.length; i++) {
            let sum = 0;
            let count = 0;
            
            const start = Math.max(0, i - halfWindow);
            const end = Math.min(dataArray.length - 1, i + halfWindow);
            
            for (let j = start; j <= end; j++) {
                sum += dataArray[j];
                count++;
            }
            
            smoothed.push(sum / count);
        }
        
        return smoothed;
    }
    
    // 對圖表數據點應用平滑濾波
    smoothChartData(dataPoints) {
        if (!this.smoothingEnabled || dataPoints.length < this.smoothingWindow) {
            return dataPoints;
        }
        
        const times = dataPoints.map(p => p.x);
        const values = dataPoints.map(p => p.y);
        
        const smoothedValues = this.applySmoothingFilter(values, this.smoothingWindow);
        
        return times.map((time, i) => ({
            x: time,
            y: smoothedValues[i]
        }));
    }
    
    updateChartData(vehicleId, data) {
        if (!data || !data.attitude || !data.rc || !data.motion) return;
        
        const now = Date.now();
        
        // 初始化數據緩衝區（如果不存在）
        if (!this.dataBuffers[vehicleId]) {
            this.dataBuffers[vehicleId] = {
                attitude: { roll: [], pitch: [], yaw: [], time: [] },
                rc: { throttle: [], roll: [], pitch: [], yaw: [], time: [] },
                motion: { groundSpeed: [], throttle: [], time: [] },
                altitude: { altitude: [], time: [] }
            };
        }
        
        const buffer = this.dataBuffers[vehicleId];
        
        // 更新原始數據緩衝區（不應用平滑）
        buffer.attitude.time.push(now);
        buffer.attitude.roll.push(data.attitude.rollDeg || 0);
        buffer.attitude.pitch.push(data.attitude.pitchDeg || 0);
        buffer.attitude.yaw.push(data.attitude.yawDeg || 0);
        
        buffer.rc.time.push(now);
        buffer.rc.throttle.push(data.rc.throttle || 0);
        buffer.rc.roll.push(data.rc.roll || 0);
        buffer.rc.pitch.push(data.rc.pitch || 0);
        buffer.rc.yaw.push(data.rc.yaw || 0);
        
        buffer.motion.time.push(now);
        buffer.motion.groundSpeed.push(data.motion.groundSpeed || 0);
        buffer.motion.throttle.push(data.rc.throttle || 0);
        
        // 高度數據（僅UAV）
        if (data.position && vehicleId === 'UAV1') {
            buffer.altitude.time.push(now);
            buffer.altitude.altitude.push(data.position.altitude || 0);
        }
        
        // 限制緩衝區大小
        const maxLen = this.maxDataPoints;
        Object.keys(buffer).forEach(key => {
            Object.keys(buffer[key]).forEach(subKey => {
                if (buffer[key][subKey].length > maxLen) {
                    buffer[key][subKey] = buffer[key][subKey].slice(-maxLen);
                }
            });
        });
    }
    
    updateAllCharts() {
        // 如果是回放模式，完全停止即時更新（由回放控制函數處理）
        if (this.mode === 'playback') {
            return;
        }
        
        const now = Date.now();
        const cutoffTime = now - this.timeRange * 1000;
        
        const vehicleId = this.currentVehicle;
        const buffer = this.dataBuffers[vehicleId];
        
        if (!buffer) return;
        
        // 更新姿態圖表
        if (this.charts.attitude && buffer.attitude) {
            const indices = buffer.attitude.time
                .map((time, idx) => ({ time, idx }))
                .filter(item => item.time >= cutoffTime)
                .map(item => item.idx);
            
            if (indices.length > 0) {
                const rollData = indices.map(idx => ({
                    x: buffer.attitude.time[idx],
                    y: buffer.attitude.roll[idx]
                }));
                const pitchData = indices.map(idx => ({
                    x: buffer.attitude.time[idx],
                    y: buffer.attitude.pitch[idx]
                }));
                const yawData = indices.map(idx => ({
                    x: buffer.attitude.time[idx],
                    y: buffer.attitude.yaw[idx]
                }));
                
                this.charts.attitude.data.datasets[0].data = this.smoothChartData(rollData);
                this.charts.attitude.data.datasets[1].data = this.smoothChartData(pitchData);
                this.charts.attitude.data.datasets[2].data = this.smoothChartData(yawData);
            }
            
            this.charts.attitude.options.scales.x.min = cutoffTime;
            this.charts.attitude.options.scales.x.max = now;
            this.charts.attitude.update('none');
        }
        
        // 更新RC圖表
        if (this.charts.rc && buffer.rc) {
            const indices = buffer.rc.time
                .map((time, idx) => ({ time, idx }))
                .filter(item => item.time >= cutoffTime)
                .map(item => item.idx);
            
            if (indices.length > 0) {
                const throttleData = indices.map(idx => ({
                    x: buffer.rc.time[idx],
                    y: buffer.rc.throttle[idx]
                }));
                const rollData = indices.map(idx => ({
                    x: buffer.rc.time[idx],
                    y: buffer.rc.roll[idx]
                }));
                const pitchData = indices.map(idx => ({
                    x: buffer.rc.time[idx],
                    y: buffer.rc.pitch[idx]
                }));
                const yawData = indices.map(idx => ({
                    x: buffer.rc.time[idx],
                    y: buffer.rc.yaw[idx]
                }));
                
                this.charts.rc.data.datasets[0].data = this.smoothChartData(throttleData);
                this.charts.rc.data.datasets[1].data = this.smoothChartData(rollData);
                this.charts.rc.data.datasets[2].data = this.smoothChartData(pitchData);
                this.charts.rc.data.datasets[3].data = this.smoothChartData(yawData);
            }
            
            this.charts.rc.options.scales.x.min = cutoffTime;
            this.charts.rc.options.scales.x.max = now;
            this.charts.rc.update('none');
        }
        
        // 更新運動圖表
        if (this.charts.motion && buffer.motion) {
            const indices = buffer.motion.time
                .map((time, idx) => ({ time, idx }))
                .filter(item => item.time >= cutoffTime)
                .map(item => item.idx);
            
            if (indices.length > 0) {
                const speedData = indices.map(idx => ({
                    x: buffer.motion.time[idx],
                    y: buffer.motion.groundSpeed[idx]
                }));
                const throttleData = indices.map(idx => ({
                    x: buffer.motion.time[idx],
                    y: buffer.motion.throttle[idx]
                }));
                
                this.charts.motion.data.datasets[0].data = this.smoothChartData(speedData);
                this.charts.motion.data.datasets[1].data = this.smoothChartData(throttleData);
            }
            
            this.charts.motion.options.scales.x.min = cutoffTime;
            this.charts.motion.options.scales.x.max = now;
            this.charts.motion.update('none');
        }
        
        // 更新高度圖表（僅UAV）
        if (this.charts.altitude && buffer.altitude && vehicleId === 'UAV1') {
            const indices = buffer.altitude.time
                .map((time, idx) => ({ time, idx }))
                .filter(item => item.time >= cutoffTime)
                .map(item => item.idx);
            
            if (indices.length > 0) {
                const altitudeData = indices.map(idx => ({
                    x: buffer.altitude.time[idx],
                    y: buffer.altitude.altitude[idx]
                }));
                
                this.charts.altitude.data.datasets[0].data = this.smoothChartData(altitudeData);
            }
            
            this.charts.altitude.options.scales.x.min = cutoffTime;
            this.charts.altitude.options.scales.x.max = now;
            this.charts.altitude.update('none');
        }
    }
    
    clearCharts() {
        Object.values(this.charts).forEach(chart => {
            if (chart) {
                chart.data.datasets.forEach(dataset => {
                    dataset.data = [];
                });
                chart.update();
            }
        });
    }
    
    updateAltitudeTabVisibility() {
        const altitudeTab = document.getElementById('altitudeTabItem');
        if (this.currentVehicle === 'UAV1') {
            altitudeTab.style.display = 'block';
        } else {
            altitudeTab.style.display = 'none';
            // 如果當前在高度標籤，切換到姿態標籤
            const activeTab = document.querySelector('#altitude-tab.active');
            if (activeTab) {
                document.getElementById('attitude-tab').click();
            }
        }
    }
    
    togglePlaybackControls() {
        const controls = document.getElementById('playbackControls');
        if (this.mode === 'playback') {
            controls.style.display = 'flex';
        } else {
            controls.style.display = 'none';
        }
    }
    
    updateLogs(logs) {
        const tbody = document.getElementById('logTableBody');
        if (!tbody) return;
        
        // 只保留最新的100條
        const recentLogs = logs.slice(-100).reverse();
        
        tbody.innerHTML = '';
        recentLogs.forEach(log => {
            const row = document.createElement('tr');
            const time = new Date(log.timestamp * 1000).toLocaleTimeString('zh-TW');
            const levelClass = log.level === 'error' ? 'error' : log.level === 'warning' ? 'warning' : 'info';
            
            row.innerHTML = `
                <td>${time}</td>
                <td>${log.vehicleId || 'N/A'}</td>
                <td><span class="log-level ${levelClass}">${log.level.toUpperCase()}</span></td>
                <td>${log.message || ''}</td>
            `;
            tbody.appendChild(row);
        });
    }
    
    async loadPlaybackData() {
        // 載入回放數據
        try {
            const response = await fetch(`/api/vehicle/${this.currentVehicle}/history/full`);
            const data = await response.json();
            
            if (data.success && data.data) {
                this.playbackState.historyData = data.data;
                this.playbackState.startTime = data.startTime * 1000; // 轉換為毫秒
                this.playbackState.endTime = data.endTime * 1000;
                this.playbackState.duration = data.duration * 1000;
                
                // 設置滑桿範圍
                const slider = document.getElementById('playbackSlider');
                slider.max = 100;
                slider.value = 0;
                
                // 更新時間顯示
                this.updatePlaybackTimeDisplay();
                
                return true;
            }
        } catch (error) {
            console.error('Failed to load playback data:', error);
        }
        return false;
    }
    
    async startPlayback() {
        // 如果沒有數據，先載入
        if (!this.playbackState.historyData) {
            const loaded = await this.loadPlaybackData();
            if (!loaded) {
                alert('沒有可用的回放數據');
                return;
            }
        }
        
        this.playbackState.playing = true;
        document.getElementById('playBtn').style.display = 'none';
        document.getElementById('pauseBtn').style.display = 'inline-block';
        
        // 開始回放
        this.playbackState.playbackStartTime = Date.now();
        this.playbackState.playbackStartPosition = this.playbackState.currentTime;
        
        // 使用 requestAnimationFrame 實現平滑回放
        const playbackLoop = () => {
            if (this.playbackState.playing) {
                this.updatePlayback();
                requestAnimationFrame(playbackLoop);
            }
        };
        playbackLoop();
        
        console.log('Playback started');
    }
    
    pausePlayback() {
        this.playbackState.playing = false;
        if (this.playbackState.playbackInterval) {
            clearInterval(this.playbackState.playbackInterval);
            this.playbackState.playbackInterval = null;
        }
        document.getElementById('playBtn').style.display = 'inline-block';
        document.getElementById('pauseBtn').style.display = 'none';
    }
    
    stopPlayback() {
        this.playbackState.playing = false;
        this.playbackState.currentTime = 0;
        this.playbackState.lastUpdateTime = 0; // 重置更新時間
        document.getElementById('playBtn').style.display = 'inline-block';
        document.getElementById('pauseBtn').style.display = 'none';
        document.getElementById('playbackSlider').value = 0;
        this.updatePlaybackTimeDisplay();
        this.updateChartsAtTime(0);
    }
    
    seekPlayback(value) {
        if (this.playbackState.playing) return; // 播放時不允許手動調整
        
        const percentage = value / 100;
        this.playbackState.currentTime = percentage * (this.playbackState.duration || 0);
        
        // 更新圖表到指定時間點
        this.updateChartsAtTime(this.playbackState.currentTime);
        this.updatePlaybackTimeDisplay();
    }
    
    updatePlayback() {
        if (!this.playbackState.playing || !this.playbackState.historyData) return;
        
        // 計算當前回放時間
        const elapsed = (Date.now() - this.playbackState.playbackStartTime) * this.playbackState.speed;
        this.playbackState.currentTime = this.playbackState.playbackStartPosition + elapsed;
        
        // 檢查是否到達結尾
        if (this.playbackState.currentTime >= this.playbackState.duration) {
            this.playbackState.currentTime = this.playbackState.duration;
            this.stopPlayback();
            return;
        }
        
        // 限制更新頻率，避免過於頻繁的更新導致閃爍
        const now = Date.now();
        if (this.playbackState.lastUpdateTime && (now - this.playbackState.lastUpdateTime) < 50) {
            // 至少間隔50ms才更新一次
            return;
        }
        this.playbackState.lastUpdateTime = now;
        
        // 更新滑桿位置
        const percentage = (this.playbackState.currentTime / this.playbackState.duration) * 100;
        const slider = document.getElementById('playbackSlider');
        if (slider) {
            slider.value = percentage;
        }
        
        // 更新圖表
        this.updateChartsAtTime(this.playbackState.currentTime);
        this.updatePlaybackTimeDisplay();
    }
    
    updateChartsAtTime(playbackTimeMs) {
        if (!this.playbackState.historyData) return;
        
        const playbackTime = (this.playbackState.startTime + playbackTimeMs) / 1000; // 轉換為秒
        const buffer = this.playbackState.historyData;
        const playbackTimeMsValue = playbackTime * 1000;
        
        // 批量更新所有圖表，減少重繪次數
        const updates = [];
        
        // 更新姿態圖表
        if (this.charts.attitude && buffer.attitude) {
            const rollData = buffer.attitude
                .filter(d => d.timestamp * 1000 <= playbackTimeMsValue)
                .map(d => ({ x: d.timestamp * 1000, y: d.roll }));
            const pitchData = buffer.attitude
                .filter(d => d.timestamp * 1000 <= playbackTimeMsValue)
                .map(d => ({ x: d.timestamp * 1000, y: d.pitch }));
            const yawData = buffer.attitude
                .filter(d => d.timestamp * 1000 <= playbackTimeMsValue)
                .map(d => ({ x: d.timestamp * 1000, y: d.yaw }));
            
            this.charts.attitude.data.datasets[0].data = this.smoothChartData(rollData);
            this.charts.attitude.data.datasets[1].data = this.smoothChartData(pitchData);
            this.charts.attitude.data.datasets[2].data = this.smoothChartData(yawData);
            
            const timeWindow = this.timeRange * 1000;
            this.charts.attitude.options.scales.x.min = playbackTimeMsValue - timeWindow;
            this.charts.attitude.options.scales.x.max = playbackTimeMsValue;
            updates.push(() => this.charts.attitude.update('none'));
        }
        
        // 更新RC圖表
        if (this.charts.rc && buffer.rc) {
            const throttleData = buffer.rc
                .filter(d => d.timestamp * 1000 <= playbackTimeMsValue)
                .map(d => ({ x: d.timestamp * 1000, y: d.throttle }));
            const rollData = buffer.rc
                .filter(d => d.timestamp * 1000 <= playbackTimeMsValue)
                .map(d => ({ x: d.timestamp * 1000, y: d.roll }));
            const pitchData = buffer.rc
                .filter(d => d.timestamp * 1000 <= playbackTimeMsValue)
                .map(d => ({ x: d.timestamp * 1000, y: d.pitch }));
            const yawData = buffer.rc
                .filter(d => d.timestamp * 1000 <= playbackTimeMsValue)
                .map(d => ({ x: d.timestamp * 1000, y: d.yaw }));
            
            this.charts.rc.data.datasets[0].data = this.smoothChartData(throttleData);
            this.charts.rc.data.datasets[1].data = this.smoothChartData(rollData);
            this.charts.rc.data.datasets[2].data = this.smoothChartData(pitchData);
            this.charts.rc.data.datasets[3].data = this.smoothChartData(yawData);
            
            const timeWindow = this.timeRange * 1000;
            this.charts.rc.options.scales.x.min = playbackTimeMsValue - timeWindow;
            this.charts.rc.options.scales.x.max = playbackTimeMsValue;
            updates.push(() => this.charts.rc.update('none'));
        }
        
        // 更新運動圖表
        if (this.charts.motion && buffer.motion) {
            const speedData = buffer.motion
                .filter(d => d.timestamp * 1000 <= playbackTimeMsValue)
                .map(d => ({ x: d.timestamp * 1000, y: d.groundSpeed }));
            const throttleData = buffer.motion
                .filter(d => d.timestamp * 1000 <= playbackTimeMsValue)
                .map(d => ({ x: d.timestamp * 1000, y: d.throttle }));
            
            this.charts.motion.data.datasets[0].data = this.smoothChartData(speedData);
            this.charts.motion.data.datasets[1].data = this.smoothChartData(throttleData);
            
            const timeWindow = this.timeRange * 1000;
            this.charts.motion.options.scales.x.min = playbackTimeMsValue - timeWindow;
            this.charts.motion.options.scales.x.max = playbackTimeMsValue;
            updates.push(() => this.charts.motion.update('none'));
        }
        
        // 更新高度圖表（僅UAV）
        if (this.charts.altitude && buffer.altitude && this.currentVehicle === 'UAV1') {
            const altitudeData = buffer.altitude
                .filter(d => d.timestamp * 1000 <= playbackTimeMsValue)
                .map(d => ({ x: d.timestamp * 1000, y: d.altitude }));
            
            this.charts.altitude.data.datasets[0].data = this.smoothChartData(altitudeData);
            
            const timeWindow = this.timeRange * 1000;
            this.charts.altitude.options.scales.x.min = playbackTimeMsValue - timeWindow;
            this.charts.altitude.options.scales.x.max = playbackTimeMsValue;
            updates.push(() => this.charts.altitude.update('none'));
        }
        
        // 批量執行更新，減少重繪次數
        if (updates.length > 0) {
            // 使用 requestAnimationFrame 確保在下一幀更新，避免閃爍
            requestAnimationFrame(() => {
                updates.forEach(update => update());
            });
        }
    }
    
    updatePlaybackTimeDisplay() {
        const timeEl = document.getElementById('playbackTime');
        if (!timeEl) return;
        
        const current = this.playbackState.currentTime || 0;
        const total = this.playbackState.duration || 0;
        
        const formatTime = (ms) => {
            const seconds = Math.floor(ms / 1000);
            const minutes = Math.floor(seconds / 60);
            const secs = seconds % 60;
            return `${minutes}:${secs.toString().padStart(2, '0')}`;
        };
        
        timeEl.textContent = `${formatTime(current)} / ${formatTime(total)}`;
    }
    
    exportLogs() {
        // 匯出日誌為CSV
        const headers = ['時間', '載具', '級別', '訊息'];
        const rows = this.logs.map(log => [
            new Date(log.timestamp * 1000).toLocaleString('zh-TW'),
            log.vehicleId || '',
            log.level || '',
            log.message || ''
        ]);
        
        const csv = [
            headers.join(','),
            ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
        ].join('\n');
        
        const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `logs_${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
    }
    
    async startDataUpdates() {
        while (true) {
            try {
                if (this.mode === 'realtime') {
                    // 即時模式：獲取當前數據
                    const response = await fetch('/api/vehicles/states');
                    const data = await response.json();
                    
                    if (data.success) {
                        const state = data.data[this.currentVehicle];
                        if (state) {
                            this.updateChartData(this.currentVehicle, state);
                        }
                    }
                    
                    // 獲取日誌
                    const logResponse = await fetch('/api/logs');
                    const logData = await logResponse.json();
                    if (logData.success) {
                        this.logs = logData.logs;
                        this.updateLogs(this.logs);
                    }
                } else {
                    // 回放模式：不需要持續更新數據，由回放控制函數處理
                    // 只更新日誌
                    const logResponse = await fetch('/api/logs');
                    const logData = await logResponse.json();
                    if (logData.success) {
                        this.logs = logData.logs;
                        this.updateLogs(this.logs);
                    }
                }
            } catch (error) {
                console.error('Failed to update data:', error);
            }
            
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }
}

// 初始化頁面
let performancePage;
document.addEventListener('DOMContentLoaded', () => {
    performancePage = new PerformancePage();
});
