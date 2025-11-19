// Chart Manager for Overview Page - Mini Performance Charts
class ChartManager {
    constructor() {
        this.charts = {};
        this.dataBuffers = {};
        this.timeRange = 60; // 預設1分鐘
        this.maxDataPoints = 300;
        this.updateRate = 10; // 預設10Hz
        this.updateInterval = null;
        this.smoothingEnabled = true; // 平滑濾波開關
        this.smoothingWindow = 3; // 平滑窗口大小（移動平均）
        
        // 學術風格配置
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
            pointRadius: 0, // 不顯示數據點
            pointHoverRadius: 0, // 懸停時也不顯示
            fillOpacity: 0.1
        };
        
        this.initCharts();
    }
    
    initCharts() {
        // 初始化姿態圖表
        this.charts.attitude = this.createAttitudeChart();
        
        // 初始化RC輸入圖表
        this.charts.rc = this.createRCChart();
        
        // 初始化速度圖表
        this.charts.speed = this.createSpeedChart();
        
        // 啟動定時更新
        this.startChartUpdater();
        
        // 監聽時間範圍選擇器
        const timeRangeSelect = document.getElementById('chartTimeRange');
        if (timeRangeSelect) {
            timeRangeSelect.addEventListener('change', (e) => {
                this.setTimeRange(parseInt(e.target.value));
            });
        }
        
        // 監聽更新頻率選擇器
        const updateRateSelect = document.getElementById('chartUpdateRate');
        if (updateRateSelect) {
            updateRateSelect.addEventListener('change', (e) => {
                this.setUpdateRate(parseInt(e.target.value));
            });
        }
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
                        tension: 0.4, // 增加平滑度
                        fill: false,
                        yAxisID: 'y',
                        pointRadius: 0, // 不顯示數據點
                        pointHoverRadius: 0
                    },
                    {
                        label: 'Pitch',
                        data: [],
                        borderColor: style.lineColors[1],
                        backgroundColor: this.createGradient(context, style.lineColors[1], style.fillOpacity),
                        borderWidth: style.lineWidth,
                        tension: 0.4, // 增加平滑度
                        fill: false,
                        yAxisID: 'y',
                        pointRadius: 0, // 不顯示數據點
                        pointHoverRadius: 0
                    },
                    {
                        label: 'Yaw',
                        data: [],
                        borderColor: style.lineColors[2],
                        backgroundColor: this.createGradient(context, style.lineColors[2], style.fillOpacity),
                        borderWidth: style.lineWidth,
                        tension: 0.4, // 增加平滑度
                        fill: false,
                        yAxisID: 'y1',
                        pointRadius: 0, // 不顯示數據點
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
                            stepSize: 10000, // 最低間隔10秒（10000毫秒）
                            callback: (value) => {
                                // 將時間戳轉換為相對時間（幾分幾秒）
                                const now = Date.now();
                                const diff = (now - value) / 1000; // 秒數差
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
                        tension: 0.4, // 增加平滑度
                        fill: false,
                        yAxisID: 'y',
                        pointRadius: 0, // 不顯示數據點
                        pointHoverRadius: 0
                    },
                    {
                        label: 'Roll',
                        data: [],
                        borderColor: style.lineColors[1],
                        borderWidth: style.lineWidth,
                        tension: 0.4, // 增加平滑度
                        fill: false,
                        yAxisID: 'y',
                        pointRadius: 0, // 不顯示數據點
                        pointHoverRadius: 0
                    },
                    {
                        label: 'Pitch',
                        data: [],
                        borderColor: style.lineColors[2],
                        borderWidth: style.lineWidth,
                        tension: 0.4, // 增加平滑度
                        fill: false,
                        yAxisID: 'y',
                        pointRadius: 0, // 不顯示數據點
                        pointHoverRadius: 0
                    },
                    {
                        label: 'Yaw',
                        data: [],
                        borderColor: style.lineColors[3],
                        borderWidth: style.lineWidth,
                        tension: 0.4, // 增加平滑度
                        fill: false,
                        yAxisID: 'y',
                        pointRadius: 0, // 不顯示數據點
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
                            stepSize: 10000, // 最低間隔10秒（10000毫秒）
                            callback: (value) => {
                                // 將時間戳轉換為相對時間（幾分幾秒）
                                const now = Date.now();
                                const diff = (now - value) / 1000; // 秒數差
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
                        min: -1,
                        max: 1,
                        ticks: {
                            font: { size: style.fontSize - 1 },
                            color: style.tickColor,
                            stepSize: 0.5
                        },
                        grid: { color: style.gridColor }
                    }
                },
                layout: { padding: style.padding }
            }
        });
    }
    
    createSpeedChart() {
        const ctx = document.getElementById('speedChart');
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
                        tension: 0.4, // 增加平滑度
                        fill: false,
                        yAxisID: 'y',
                        pointRadius: 0, // 不顯示數據點
                        pointHoverRadius: 0
                    },
                    {
                        label: 'Throttle',
                        data: [],
                        borderColor: style.lineColors[1],
                        borderWidth: style.lineWidth,
                        tension: 0.4, // 增加平滑度
                        fill: false,
                        yAxisID: 'y1',
                        pointRadius: 0, // 不顯示數據點
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
                            stepSize: 10000, // 最低間隔10秒（10000毫秒）
                            callback: (value) => {
                                // 將時間戳轉換為相對時間（幾分幾秒）
                                const now = Date.now();
                                const diff = (now - value) / 1000; // 秒數差
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
    
    createGradient(ctx, color, opacity) {
        try {
            const gradient = ctx.createLinearGradient(0, 0, 0, 250);
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
    
    updateChartData(vehicleId, data) {
        if (!data || !data.attitude || !data.rc || !data.motion) return;
        
        const now = Date.now();
        
        // 初始化數據緩衝區（如果不存在）
        if (!this.dataBuffers[vehicleId]) {
            this.dataBuffers[vehicleId] = {
                attitude: { roll: [], pitch: [], yaw: [], time: [] },
                rc: { throttle: [], roll: [], pitch: [], yaw: [], time: [] },
                motion: { groundSpeed: [], throttle: [], time: [] }
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
            
            // 計算窗口內的平均值
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
        
        // 分離時間和數值
        const times = dataPoints.map(p => p.x);
        const values = dataPoints.map(p => p.y);
        
        // 對數值應用平滑濾波
        const smoothedValues = this.applySmoothingFilter(values, this.smoothingWindow);
        
        // 重新組合
        return times.map((time, i) => ({
            x: time,
            y: smoothedValues[i]
        }));
    }
    
    updateAllCharts() {
        const now = Date.now();
        const cutoffTime = now - this.timeRange * 1000;
        
        // 更新姿態圖表
        if (this.charts.attitude) {
            // 從緩衝區獲取數據並應用平滑濾波
            const vehicleId = document.getElementById('chartVehicleSelect')?.value || 'UGV1';
            const buffer = this.dataBuffers[vehicleId];
            
            if (buffer && buffer.attitude) {
                // 過濾時間範圍內的數據
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
                    
                    // 應用平滑濾波
                    this.charts.attitude.data.datasets[0].data = this.smoothChartData(rollData);
                    this.charts.attitude.data.datasets[1].data = this.smoothChartData(pitchData);
                    this.charts.attitude.data.datasets[2].data = this.smoothChartData(yawData);
                }
            }
            
            this.charts.attitude.options.scales.x.min = cutoffTime;
            this.charts.attitude.options.scales.x.max = now;
            this.charts.attitude.update('none');
        }
        
        // 更新RC圖表
        if (this.charts.rc) {
            const vehicleId = document.getElementById('chartVehicleSelect')?.value || 'UGV1';
            const buffer = this.dataBuffers[vehicleId];
            
            if (buffer && buffer.rc) {
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
            }
            
            this.charts.rc.options.scales.x.min = cutoffTime;
            this.charts.rc.options.scales.x.max = now;
            this.charts.rc.update('none');
        }
        
        // 更新速度圖表
        if (this.charts.speed) {
            const vehicleId = document.getElementById('chartVehicleSelect')?.value || 'UGV1';
            const buffer = this.dataBuffers[vehicleId];
            
            if (buffer && buffer.motion) {
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
                    
                    this.charts.speed.data.datasets[0].data = this.smoothChartData(speedData);
                    this.charts.speed.data.datasets[1].data = this.smoothChartData(throttleData);
                }
            }
            
            this.charts.speed.options.scales.x.min = cutoffTime;
            this.charts.speed.options.scales.x.max = now;
            this.charts.speed.update('none');
        }
    }
    
    clearChartData() {
        Object.values(this.charts).forEach(chart => {
            if (chart) {
                chart.data.datasets.forEach(dataset => {
                    dataset.data = [];
                });
                chart.update();
            }
        });
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ChartManager;
}

