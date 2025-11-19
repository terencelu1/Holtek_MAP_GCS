// Map & Mission Page JavaScript
class MapPage {
    constructor() {
        this.map = null;
        this.vehicleMarkers = {};
        this.vehicleTrails = {};
        this.waypoints = [];
        this.missions = [];
        this.homePoint = null;
        this.distanceLine = null;
        this.addWaypointMode = false;
        this.currentEditingWaypoint = null;
        this.vehicleStates = {};
        this.statusPanels = {}; // 狀態視窗
        this.missionPreview = null; // 任務預覽軌跡
        this.missionMarkers = []; // 任務預覽標記（起點、終點）
        this.vehicleAnimations = {}; // 載具移動動畫
        
        // 圖標配置
        this.iconConfig = {
            uav: {
                iconUrl: '/static/images/icons/uav.png',
                iconSize: [40, 40],
                iconAnchor: [20, 20]
            },
            ugv: {
                iconUrl: '/static/images/icons/UGV.png',
                iconSize: [40, 40],
                iconAnchor: [20, 20]
            }
        };
        
        this.init();
    }
    
    init() {
        this.initMap();
        this.initTimeDisplay();
        this.initEventListeners();
        this.startDataUpdates();
        console.log('Map page initialized');
    }
    
    initMap() {
        // 初始化地圖（使用載具位置的中心點，預設放到最大）
        this.map = L.map('map').setView([23.024031, 120.224492], 19);
        
        // 添加 OpenStreetMap 圖層
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors',
            maxZoom: 19
        }).addTo(this.map);
        
        // 地圖點擊事件（添加航點模式）
        this.map.on('click', (e) => {
            if (this.addWaypointMode) {
                this.addWaypointFromMap(e.latlng);
            }
        });
        
        // 地圖縮放和移動時更新重疊檢測和狀態視窗位置
        this.map.on('zoomend moveend', () => {
            this.checkOverlapAndUpdatePanels();
            // 更新所有狀態視窗位置（因為縮放會改變像素距離）
            Object.keys(this.statusPanels).forEach(vehicleId => {
                const state = this.vehicleStates[vehicleId];
                if (state && state.position) {
                    const panel = this.statusPanels[vehicleId];
                    const panelLatLng = this.calculatePanelPositionWithOverlapCheck(vehicleId, state.position);
                    panel.setLatLng(panelLatLng);
                }
            });
        });
        
        // 初始化載具標記
        this.initVehicleMarkers();
        
        // 初始化 Home 點
        this.initHomePoint();
    }
    
    initVehicleMarkers() {
        // 創建 UAV 圖標
        const uavIcon = L.icon({
            iconUrl: this.iconConfig.uav.iconUrl,
            iconSize: this.iconConfig.uav.iconSize,
            iconAnchor: this.iconConfig.uav.iconAnchor,
            className: 'vehicle-icon uav normal'
        });
        
        // 創建 UGV 圖標
        const ugvIcon = L.icon({
            iconUrl: this.iconConfig.ugv.iconUrl,
            iconSize: this.iconConfig.ugv.iconSize,
            iconAnchor: this.iconConfig.ugv.iconAnchor,
            className: 'vehicle-icon ugv'
        });
        
        // 初始化 UAV1 標記（使用初始位置）
        this.vehicleMarkers['UAV1'] = L.marker([23.024087, 120.224649], { icon: uavIcon })
            .addTo(this.map)
            .bindPopup('UAV1')
            .on('click', () => this.showVehicleInfo('UAV1'));
        
        // 初始化 UGV1 標記（使用初始位置）
        this.vehicleMarkers['UGV1'] = L.marker([23.023975, 120.224334], { icon: ugvIcon })
            .addTo(this.map)
            .bindPopup('UGV1')
            .on('click', () => this.showVehicleInfo('UGV1'));
        
        // 初始化軌跡線
        this.vehicleTrails['UAV1'] = [];
        this.vehicleTrails['UGV1'] = [];
    }
    
    initHomePoint() {
        // 設置 Home 點
        this.homePoint = L.marker([23.024221, 120.224447], {
            icon: L.divIcon({
                className: 'home-marker',
                html: '<i class="fas fa-home" style="color: #fff; font-size: 12px; line-height: 16px; text-align: center; display: block;"></i>',
                iconSize: [20, 20],
                iconAnchor: [10, 10]
            })
        }).addTo(this.map).bindPopup('Home Point');
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
    
    initEventListeners() {
        // 航點管理
        document.getElementById('addWaypointBtn').addEventListener('click', () => {
            this.toggleAddWaypointMode();
        });
        
        document.getElementById('saveWaypointBtn').addEventListener('click', () => {
            this.saveWaypoint();
        });
        
        // 任務管理
        document.getElementById('startMissionBtn').addEventListener('click', () => {
            this.startMission();
        });
        
        // 地圖控制
        document.getElementById('clearTrailsBtn').addEventListener('click', () => {
            this.clearTrails();
        });
        
        document.getElementById('centerMapBtn').addEventListener('click', () => {
            this.centerMap();
        });
        
        // 航點載具選擇器
        document.getElementById('waypointVehicleSelect').addEventListener('change', (e) => {
            this.updateWaypointList();
        });
    }
    
    toggleAddWaypointMode() {
        this.addWaypointMode = !this.addWaypointMode;
        const btn = document.getElementById('addWaypointBtn');
        if (this.addWaypointMode) {
            btn.classList.add('btn-warning');
            btn.innerHTML = '<i class="fas fa-times"></i> 取消添加';
            this.map.getContainer().style.cursor = 'crosshair';
        } else {
            btn.classList.remove('btn-warning');
            btn.innerHTML = '<i class="fas fa-plus"></i> 新增航點（點擊地圖）';
            this.map.getContainer().style.cursor = '';
        }
    }
    
    addWaypointFromMap(latlng) {
        if (!this.addWaypointMode) return;
        
        const vehicleId = document.getElementById('waypointVehicleSelect').value;
        const waypoint = {
            id: Date.now(),
            vehicleId: vehicleId,
            lat: latlng.lat,
            lon: latlng.lng,
            alt: 10.0,
            order: this.waypoints.filter(w => w.vehicleId === vehicleId).length + 1
        };
        
        this.waypoints.push(waypoint);
        this.addWaypointMode = false;
        this.toggleAddWaypointMode();
        this.updateWaypointList();
        this.updateWaypointMarkers();
    }
    
    updateWaypointList() {
        const vehicleId = document.getElementById('waypointVehicleSelect').value;
        const container = document.getElementById('waypointList');
        container.innerHTML = '';
        
        const vehicleWaypoints = this.waypoints
            .filter(w => w.vehicleId === vehicleId)
            .sort((a, b) => a.order - b.order);
        
        vehicleWaypoints.forEach((wp, index) => {
            const item = document.createElement('div');
            item.className = 'waypoint-item';
            item.innerHTML = `
                <div class="waypoint-item-header">
                    <div>
                        <strong>航點 ${wp.order}</strong>
                        <small class="text-muted d-block">${wp.lat.toFixed(6)}, ${wp.lon.toFixed(6)}</small>
                        <small class="text-muted">高度: ${wp.alt}m</small>
                    </div>
                    <div class="waypoint-item-actions">
                        <button class="btn btn-sm btn-outline-primary" onclick="mapPage.editWaypoint(${wp.id})">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn btn-sm btn-outline-danger" onclick="mapPage.deleteWaypoint(${wp.id})">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            `;
            container.appendChild(item);
        });
        
        if (vehicleWaypoints.length === 0) {
            container.innerHTML = '<p class="text-muted text-center small">尚無航點</p>';
        }
    }
    
    updateWaypointMarkers() {
        // 清除現有航點標記
        if (this.waypointMarkers) {
            this.waypointMarkers.forEach(marker => this.map.removeLayer(marker));
        }
        
        this.waypointMarkers = [];
        const vehicleId = document.getElementById('waypointVehicleSelect').value;
        const vehicleWaypoints = this.waypoints
            .filter(w => w.vehicleId === vehicleId)
            .sort((a, b) => a.order - b.order);
        
        // 添加航點標記和路線
        const waypointPositions = vehicleWaypoints.map(wp => [wp.lat, wp.lon]);
        
        vehicleWaypoints.forEach((wp, index) => {
            const marker = L.marker([wp.lat, wp.lon], {
                icon: L.divIcon({
                    className: 'waypoint-marker',
                    html: `<div style="background-color: #007bff; color: white; border-radius: 50%; width: 24px; height: 24px; line-height: 24px; text-align: center; font-weight: bold; font-size: 12px;">${index + 1}</div>`,
                    iconSize: [24, 24],
                    iconAnchor: [12, 12]
                })
            }).addTo(this.map).bindPopup(`航點 ${index + 1}<br>高度: ${wp.alt}m`);
            
            this.waypointMarkers.push(marker);
        });
        
        // 繪製航點路線
        if (this.waypointRoute) {
            this.map.removeLayer(this.waypointRoute);
        }
        
        if (waypointPositions.length > 1) {
            this.waypointRoute = L.polyline(waypointPositions, {
                color: '#007bff',
                weight: 2,
                dashArray: '5, 5',
                opacity: 0.7
            }).addTo(this.map);
        }
    }
    
    editWaypoint(id) {
        const waypoint = this.waypoints.find(w => w.id === id);
        if (!waypoint) return;
        
        this.currentEditingWaypoint = waypoint;
        document.getElementById('waypointLat').value = waypoint.lat;
        document.getElementById('waypointLon').value = waypoint.lon;
        document.getElementById('waypointAlt').value = waypoint.alt;
        
        const modal = new bootstrap.Modal(document.getElementById('waypointModal'));
        modal.show();
    }
    
    saveWaypoint() {
        if (!this.currentEditingWaypoint) return;
        
        this.currentEditingWaypoint.lat = parseFloat(document.getElementById('waypointLat').value);
        this.currentEditingWaypoint.lon = parseFloat(document.getElementById('waypointLon').value);
        this.currentEditingWaypoint.alt = parseFloat(document.getElementById('waypointAlt').value);
        
        const modal = bootstrap.Modal.getInstance(document.getElementById('waypointModal'));
        modal.hide();
        
        this.updateWaypointList();
        this.updateWaypointMarkers();
        this.currentEditingWaypoint = null;
    }
    
    deleteWaypoint(id) {
        if (confirm('確定要刪除此航點嗎？')) {
            this.waypoints = this.waypoints.filter(w => w.id !== id);
            this.updateWaypointList();
            this.updateWaypointMarkers();
        }
    }
    
    startMission() {
        const vehicleId = document.getElementById('missionVehicleSelect').value;
        const missionType = document.getElementById('missionTypeSelect').value;
        
        const mission = {
            id: Date.now(),
            vehicleId: vehicleId,
            type: missionType,
            status: 'running',
            startTime: new Date().toISOString(),
            endTime: null
        };
        
        this.missions.push(mission);
        this.updateMissionList();
        
        // 顯示任務預覽軌跡
        this.showMissionPreview(vehicleId, missionType);
        
        // 這裡可以發送任務到後端
        console.log('Starting mission:', mission);
    }
    
    showMissionPreview(vehicleId, missionType) {
        // 清除舊的預覽
        if (this.missionPreview) {
            this.map.removeLayer(this.missionPreview);
            this.missionPreview = null;
        }
        
        // 清除舊的標記
        this.missionMarkers.forEach(marker => {
            this.map.removeLayer(marker);
        });
        this.missionMarkers = [];
        
        const state = this.vehicleStates[vehicleId];
        if (!state || !state.position) return;
        
        const startPos = [state.position.lat, state.position.lon];
        let previewPath = [];
        
        // 根據任務類型生成預覽路徑
        switch (missionType) {
            case 'follow_ugv':
                // UAV 追 UGV：從 UAV 位置到 UGV 位置
                if (vehicleId === 'UAV1' && this.vehicleStates['UGV1']) {
                    const ugvPos = [
                        this.vehicleStates['UGV1'].position.lat,
                        this.vehicleStates['UGV1'].position.lon
                    ];
                    previewPath = [startPos, ugvPos];
                }
                break;
                
            case 'follow_uav':
                // UGV 追 UAV：從 UGV 位置到 UAV 位置
                if (vehicleId === 'UGV1' && this.vehicleStates['UAV1']) {
                    const uavPos = [
                        this.vehicleStates['UAV1'].position.lat,
                        this.vehicleStates['UAV1'].position.lon
                    ];
                    previewPath = [startPos, uavPos];
                }
                break;
                
            case 'rtl':
            case 'land':
                // 返回 Home 點
                if (this.homePoint) {
                    const homePos = this.homePoint.getLatLng();
                    previewPath = [startPos, [homePos.lat, homePos.lng]];
                }
                break;
                
            case 'patrol':
            case 'patrol_ugv':
                // 巡邏路線：使用航點
                const vehicleWaypoints = this.waypoints
                    .filter(w => w.vehicleId === vehicleId)
                    .sort((a, b) => a.order - b.order);
                
                if (vehicleWaypoints.length > 0) {
                    previewPath = [startPos];
                    vehicleWaypoints.forEach(wp => {
                        previewPath.push([wp.lat, wp.lon]);
                    });
                    // 返回起點形成閉合路線
                    previewPath.push(startPos);
                }
                break;
                
            case 'charge_station':
                // 前往充電站（假設在 Home 點附近）
                if (this.homePoint) {
                    const homePos = this.homePoint.getLatLng();
                    previewPath = [startPos, [homePos.lat, homePos.lng]];
                }
                break;
        }
        
        // 繪製預覽軌跡
        if (previewPath.length > 1) {
            this.missionPreview = L.polyline(previewPath, {
                color: '#ffc107',
                weight: 3,
                dashArray: '10, 5',
                opacity: 0.8,
                className: 'mission-preview'
            }).addTo(this.map);
            
            // 添加起點和終點標記
            const startMarker = L.marker(previewPath[0], {
                icon: L.divIcon({
                    className: 'mission-marker start',
                    html: '<div style="background-color: #28a745; color: white; border-radius: 50%; width: 20px; height: 20px; line-height: 20px; text-align: center; font-weight: bold; font-size: 10px;">S</div>',
                    iconSize: [20, 20],
                    iconAnchor: [10, 10]
                })
            }).addTo(this.map);
            this.missionMarkers.push(startMarker);
            
            if (previewPath.length > 1) {
                const endMarker = L.marker(previewPath[previewPath.length - 1], {
                    icon: L.divIcon({
                        className: 'mission-marker end',
                        html: '<div style="background-color: #dc3545; color: white; border-radius: 50%; width: 20px; height: 20px; line-height: 20px; text-align: center; font-weight: bold; font-size: 10px;">E</div>',
                        iconSize: [20, 20],
                        iconAnchor: [10, 10]
                    })
                }).addTo(this.map);
                this.missionMarkers.push(endMarker);
            }
        }
    }
    
    updateMissionList() {
        const container = document.getElementById('missionList');
        container.innerHTML = '';
        
        this.missions.slice().reverse().forEach(mission => {
            const item = document.createElement('div');
            item.className = `mission-item ${mission.status}`;
            item.innerHTML = `
                <div class="mission-item-header">
                    <div>
                        <strong>${this.getMissionTypeName(mission.type)}</strong>
                        <span class="mission-status ${mission.status}">${this.getStatusText(mission.status)}</span>
                    </div>
                </div>
                <small class="text-muted">載具: ${mission.vehicleId}</small><br>
                <small class="text-muted">開始時間: ${new Date(mission.startTime).toLocaleString('zh-TW')}</small>
            `;
            container.appendChild(item);
        });
        
        if (this.missions.length === 0) {
            container.innerHTML = '<p class="text-muted text-center small">尚無任務</p>';
        }
    }
    
    getMissionTypeName(type) {
        const names = {
            'follow_ugv': 'Follow UGV',
            'auto_land': 'Auto Land on UGV',
            'land': 'Land',
            'patrol': 'Patrol Route',
            'rtl': 'Return to Home',
            'follow_uav': 'Follow UAV',
            'charge_station': 'Go to Charge Station',
            'patrol_ugv': '巡邏路線'
        };
        return names[type] || type;
    }
    
    getStatusText(status) {
        const texts = {
            'pending': '等待中',
            'running': '執行中',
            'completed': '已完成',
            'error': '錯誤'
        };
        return texts[status] || status;
    }
    
    updateVehiclePositions(states) {
        this.vehicleStates = states;
        
        Object.keys(states).forEach(vehicleId => {
            const state = states[vehicleId];
            const marker = this.vehicleMarkers[vehicleId];
            
            if (!marker || !state.position) return;
            
            // 更新位置（使用平滑移動）
            const targetLatLng = [state.position.lat, state.position.lon];
            this.smoothMoveVehicle(vehicleId, targetLatLng);
            
            // 更新旋轉角度（根據 yaw）
            if (state.attitude && state.attitude.yawDeg !== undefined) {
                const rotation = state.attitude.yawDeg;
                this.updateMarkerRotation(marker, rotation);
                
                // 如果狀態改變，更新圖標
                const statusClass = this.getUAVStatusClass(state);
                const currentClass = marker.options.icon.options.className || '';
                if (!currentClass.includes(statusClass)) {
                    marker.setIcon(this.createRotatedIcon(vehicleId, state.type, rotation, state));
                    this.updateMarkerRotation(marker, rotation);
                }
            }
            
            // 更新軌跡
            this.updateTrail(vehicleId, latlng);
            
            // 更新 UAV 狀態顏色
            if (state.type === 'uav') {
                this.updateUAVStatus(marker, state);
            }
            
            // 更新狀態視窗
            this.updateStatusPanel(vehicleId, state);
        });
        
        // 更新距離線
        this.updateDistanceLine();
        
        // 檢查重疊並調整狀態視窗顯示
        this.checkOverlapAndUpdatePanels();
    }
    
    createRotatedIcon(vehicleId, type, rotation, state) {
        const config = type === 'uav' ? this.iconConfig.uav : this.iconConfig.ugv;
        const statusClass = this.getUAVStatusClass(state);
        
        // 創建帶旋轉的圖標（使用 CSS transform）
        const icon = L.icon({
            iconUrl: config.iconUrl,
            iconSize: config.iconSize,
            iconAnchor: config.iconAnchor,
            className: `vehicle-icon ${type} ${statusClass}`
        });
        
        // 使用 Leaflet 的 setRotation 方法（如果支持）或自定義實現
        return icon;
    }
    
    updateMarkerRotation(marker, rotation) {
        // 更新標記的旋轉角度
        try {
            const element = marker.getElement();
            if (element) {
                const img = element.querySelector('img');
                if (img) {
                    img.style.transform = `rotate(${rotation}deg)`;
                    img.style.transition = 'transform 0.3s';
                    img.style.transformOrigin = 'center center';
                }
            }
        } catch (e) {
            console.warn('Failed to update marker rotation:', e);
        }
    }
    
    getUAVStatusClass(state) {
        if (state.type !== 'uav') return '';
        
        // 根據狀態返回顏色類別
        if (state.mode === 'LAND') return 'landing';
        // 這裡可以添加更多邏輯判斷接近 UGV、對準等狀態
        return 'normal';
    }
    
    updateUAVStatus(marker, state) {
        // 更新 UAV 圖標的狀態顏色
        const statusClass = this.getUAVStatusClass(state);
        try {
            const currentIcon = marker.options.icon;
            const currentClass = currentIcon.options ? currentIcon.options.className : '';
            if (!currentClass.includes(statusClass)) {
                const rotation = state.attitude ? state.attitude.yawDeg : 0;
                marker.setIcon(this.createRotatedIcon('UAV1', 'uav', rotation, state));
                this.updateMarkerRotation(marker, rotation);
            }
        } catch (e) {
            console.warn('Failed to update UAV status:', e);
        }
    }
    
    updateTrail(vehicleId, latlng) {
        if (!this.vehicleTrails[vehicleId]) {
            this.vehicleTrails[vehicleId] = [];
        }
        
        this.vehicleTrails[vehicleId].push(latlng);
        
        // 限制軌跡長度
        if (this.vehicleTrails[vehicleId].length > 100) {
            this.vehicleTrails[vehicleId].shift();
        }
        
        // 更新軌跡線
        this.drawTrail(vehicleId);
    }
    
    drawTrail(vehicleId) {
        const trail = this.vehicleTrails[vehicleId];
        if (trail.length < 2) return;
        
        // 移除舊的軌跡線
        if (this.trailLayers && this.trailLayers[vehicleId]) {
            this.map.removeLayer(this.trailLayers[vehicleId]);
        }
        
        if (!this.trailLayers) this.trailLayers = {};
        
        const type = vehicleId.startsWith('UAV') ? 'uav' : 'ugv';
        this.trailLayers[vehicleId] = L.polyline(trail, {
            color: type === 'uav' ? '#007bff' : '#28a745',
            weight: 2,
            opacity: 0.6,
            className: `trail-path ${type}`
        }).addTo(this.map);
    }
    
    updateDistanceLine() {
        const uavState = this.vehicleStates['UAV1'];
        const ugvState = this.vehicleStates['UGV1'];
        
        if (!uavState || !ugvState || !uavState.position || !ugvState.position) {
            if (this.distanceLine) {
                this.map.removeLayer(this.distanceLine);
                this.distanceLine = null;
            }
            return;
        }
        
        const uavPos = [uavState.position.lat, uavState.position.lon];
        const ugvPos = [ugvState.position.lat, ugvState.position.lon];
        
        // 計算距離
        const distance = this.calculateDistance(uavPos[0], uavPos[1], ugvPos[0], ugvPos[1]);
        
        // 更新或創建距離線
        if (this.distanceLine) {
            this.distanceLine.setLatLngs([uavPos, ugvPos]);
        } else {
            this.distanceLine = L.polyline([uavPos, ugvPos], {
                color: '#6c757d',
                weight: 2,
                dashArray: '5, 5',
                opacity: 0.7,
                className: 'distance-line'
            }).addTo(this.map);
        }
        
        // 在中點顯示距離標籤
        const midLat = (uavPos[0] + ugvPos[0]) / 2;
        const midLon = (uavPos[1] + ugvPos[1]) / 2;
        
        if (this.distanceLabel) {
            this.distanceLabel.setLatLng([midLat, midLon]);
            this.distanceLabel.setContent(`${distance.toFixed(1)} m`);
        } else {
            this.distanceLabel = L.marker([midLat, midLon], {
                icon: L.divIcon({
                    className: 'distance-label',
                    html: `<div style="background-color: rgba(255,255,255,0.9); padding: 2px 6px; border-radius: 3px; font-size: 11px; font-weight: bold;">${distance.toFixed(1)} m</div>`,
                    iconSize: [60, 20],
                    iconAnchor: [30, 10]
                })
            }).addTo(this.map);
        }
    }
    
    calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371000; // 地球半徑（米）
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c;
    }
    
    showVehicleInfo(vehicleId) {
        const state = this.vehicleStates[vehicleId];
        if (!state) return;
        
        const modal = new bootstrap.Modal(document.getElementById('vehicleInfoModal'));
        document.getElementById('vehicleInfoTitle').textContent = `${vehicleId} 資訊`;
        
        const info = `
            <div class="row">
                <div class="col-6"><strong>模式:</strong></div>
                <div class="col-6">${state.mode || 'N/A'}</div>
            </div>
            <hr>
            <div class="row">
                <div class="col-6"><strong>電量:</strong></div>
                <div class="col-6">${state.battery ? state.battery.percent + '%' : 'N/A'}</div>
            </div>
            <hr>
            <div class="row">
                <div class="col-6"><strong>GPS:</strong></div>
                <div class="col-6">${state.gps ? `Fix ${state.gps.fix} (${state.gps.satellites} 衛星)` : 'N/A'}</div>
            </div>
            <hr>
            <div class="row">
                <div class="col-6"><strong>速度:</strong></div>
                <div class="col-6">${state.motion ? state.motion.groundSpeed.toFixed(1) + ' m/s' : 'N/A'}</div>
            </div>
            <hr>
            <div class="row">
                <div class="col-6"><strong>高度:</strong></div>
                <div class="col-6">${state.position ? state.position.altitude.toFixed(1) + ' m' : 'N/A'}</div>
            </div>
            <hr>
            <div class="row">
                <div class="col-6"><strong>位置:</strong></div>
                <div class="col-6">${state.position ? `${state.position.lat.toFixed(6)}, ${state.position.lon.toFixed(6)}` : 'N/A'}</div>
            </div>
        `;
        
        document.getElementById('vehicleInfoBody').innerHTML = info;
        modal.show();
    }
    
    clearTrails() {
        if (this.trailLayers) {
            Object.values(this.trailLayers).forEach(layer => {
                this.map.removeLayer(layer);
            });
            this.trailLayers = {};
        }
        
        this.vehicleTrails['UAV1'] = [];
        this.vehicleTrails['UGV1'] = [];
    }
    
    centerMap() {
        const bounds = [];
        Object.values(this.vehicleMarkers).forEach(marker => {
            bounds.push(marker.getLatLng());
        });
        
        if (bounds.length > 0) {
            this.map.fitBounds(bounds, { padding: [50, 50] });
        }
    }
    
    createStatusPanel(vehicleId, state) {
        // 創建狀態視窗
        if (this.statusPanels[vehicleId]) {
            return this.statusPanels[vehicleId];
        }
        
        // 使用固定大小的圖標，但實際位置通過計算偏移來控制
        const panel = L.divIcon({
            className: 'vehicle-status-panel',
            html: this.generateStatusPanelHTML(vehicleId, state),
            iconSize: [150, 80],
            iconAnchor: [0, 0] // 使用左上角作為錨點，位置通過計算控制
        });
        
        // 計算視窗的實際位置（相對於載具圖標）
        const panelLatLng = this.calculatePanelPosition(vehicleId, state.position);
        
        const panelMarker = L.marker(panelLatLng, {
            icon: panel,
            interactive: false,
            zIndexOffset: 1000
        }).addTo(this.map);
        
        this.statusPanels[vehicleId] = panelMarker;
        return panelMarker;
    }
    
    calculatePanelPosition(vehicleId, position) {
        // 將載具位置轉換為像素座標
        const vehiclePoint = this.map.latLngToContainerPoint([position.lat, position.lon]);
        
        // 根據載具類型決定偏移：UGV 在左邊，UAV 在右邊
        const isUGV = vehicleId === 'UGV1';
        const offsetX = isUGV ? -160 : 50; // UGV 左邊（負值），UAV 右邊（正值）
        const offsetY = -40; // 在圖標上方一點
        
        // 計算視窗的像素位置
        const panelPoint = L.point(vehiclePoint.x + offsetX, vehiclePoint.y + offsetY);
        
        // 轉換回地理座標
        return this.map.containerPointToLatLng(panelPoint);
    }
    
    generateStatusPanelHTML(vehicleId, state) {
        const batteryPercent = state.battery ? state.battery.percent : 0;
        const batteryColor = batteryPercent > 50 ? '#28a745' : batteryPercent > 20 ? '#ffc107' : '#dc3545';
        const mode = state.mode || 'N/A';
        const speed = state.motion ? state.motion.groundSpeed.toFixed(1) : '0.0';
        const alt = state.position ? state.position.altitude.toFixed(1) : '0.0';
        
        return `
            <div class="status-panel-content">
                <div class="status-panel-header">
                    <strong>${vehicleId}</strong>
                    <span class="status-badge ${state.armed ? 'armed' : 'disarmed'}">${state.armed ? 'ARMED' : 'DISARM'}</span>
                </div>
                <div class="status-panel-body">
                    <div class="status-row">
                        <span class="status-label">模式:</span>
                        <span class="status-value">${mode}</span>
                    </div>
                    <div class="status-row">
                        <span class="status-label">電量:</span>
                        <span class="status-value" style="color: ${batteryColor}">${batteryPercent}%</span>
                    </div>
                    <div class="status-row">
                        <span class="status-label">速度:</span>
                        <span class="status-value">${speed} m/s</span>
                    </div>
                    <div class="status-row">
                        <span class="status-label">${state.type === 'uav' ? '高度' : 'GPS'}:</span>
                        <span class="status-value">${alt} ${state.type === 'uav' ? 'm' : 'Fix ' + (state.gps ? state.gps.fix : '0')}</span>
                    </div>
                </div>
            </div>
        `;
    }
    
    updateStatusPanel(vehicleId, state) {
        if (!state.position) return;
        
        let panel = this.statusPanels[vehicleId];
        
        if (!panel) {
            panel = this.createStatusPanel(vehicleId, state);
        } else {
            // 計算並更新位置（避免重疊）
            const panelLatLng = this.calculatePanelPositionWithOverlapCheck(vehicleId, state.position);
            panel.setLatLng(panelLatLng);
            
            // 更新內容
            const element = panel.getElement();
            if (element) {
                element.innerHTML = this.generateStatusPanelHTML(vehicleId, state);
            }
        }
    }
    
    calculatePanelPositionWithOverlapCheck(vehicleId, position) {
        // 先計算基本位置
        let panelLatLng = this.calculatePanelPosition(vehicleId, position);
        
        // 檢查是否與另一個視窗重疊
        const otherVehicleId = vehicleId === 'UAV1' ? 'UGV1' : 'UAV1';
        const otherPanel = this.statusPanels[otherVehicleId];
        
        if (otherPanel) {
            const otherLatLng = otherPanel.getLatLng();
            
            // 轉換為像素座標進行重疊檢測
            const thisPoint = this.map.latLngToContainerPoint(panelLatLng);
            const otherPoint = this.map.latLngToContainerPoint(otherLatLng);
            
            // 視窗大小約 150x80 像素
            const panelWidth = 150;
            const panelHeight = 80;
            
            // 檢查是否重疊
            const overlapX = Math.abs(thisPoint.x - otherPoint.x) < panelWidth;
            const overlapY = Math.abs(thisPoint.y - otherPoint.y) < panelHeight;
            
            if (overlapX && overlapY) {
                // 如果重疊，調整位置
                const isUGV = vehicleId === 'UGV1';
                const vehiclePoint = this.map.latLngToContainerPoint([position.lat, position.lon]);
                
                // 調整策略：UGV 視窗向上移動，UAV 視窗向下移動
                const adjustY = isUGV ? -90 : 90;
                const adjustedPoint = L.point(thisPoint.x, thisPoint.y + adjustY);
                panelLatLng = this.map.containerPointToLatLng(adjustedPoint);
            }
        }
        
        return panelLatLng;
    }
    
    checkOverlapAndUpdatePanels() {
        // 檢查兩個載具是否重疊
        const uavState = this.vehicleStates['UAV1'];
        const ugvState = this.vehicleStates['UGV1'];
        
        if (!uavState || !ugvState || !uavState.position || !ugvState.position) {
            // 如果沒有數據，顯示所有視窗
            Object.keys(this.statusPanels).forEach(vehicleId => {
                const panel = this.statusPanels[vehicleId];
                if (panel) {
                    const element = panel.getElement();
                    if (element) {
                        element.style.display = 'block';
                    }
                }
            });
            return;
        }
        
        // 計算像素距離（在地圖上的顯示距離）
        const uavMarker = this.vehicleMarkers['UAV1'];
        const ugvMarker = this.vehicleMarkers['UGV1'];
        
        if (!uavMarker || !ugvMarker) return;
        
        const uavPoint = this.map.latLngToContainerPoint(uavMarker.getLatLng());
        const ugvPoint = this.map.latLngToContainerPoint(ugvMarker.getLatLng());
        
        const pixelDistance = Math.sqrt(
            Math.pow(uavPoint.x - ugvPoint.x, 2) + 
            Math.pow(uavPoint.y - ugvPoint.y, 2)
        );
        
        // 如果像素距離小於 100 像素，認為是重疊
        const isOverlapping = pixelDistance < 100;
        
        // 更新視窗顯示和位置
        Object.keys(this.statusPanels).forEach(vehicleId => {
            const panel = this.statusPanels[vehicleId];
            if (panel) {
                const element = panel.getElement();
                if (element) {
                    if (isOverlapping) {
                        // 重疊時隱藏視窗
                        element.style.display = 'none';
                    } else {
                        // 不重疊時顯示視窗，並更新位置以避免視窗之間重疊
                        element.style.display = 'block';
                        const state = this.vehicleStates[vehicleId];
                        if (state && state.position) {
                            const panelLatLng = this.calculatePanelPositionWithOverlapCheck(vehicleId, state.position);
                            panel.setLatLng(panelLatLng);
                        }
                    }
                }
            }
        });
    }
    
    smoothMoveVehicle(vehicleId, targetLatLng) {
        const marker = this.vehicleMarkers[vehicleId];
        if (!marker) return;
        
        const currentLatLng = marker.getLatLng();
        const targetLat = targetLatLng[0];
        const targetLon = targetLatLng[1];
        
        // 如果已經在目標位置，不需要移動
        const distance = this.calculateDistance(
            currentLatLng.lat, currentLatLng.lng,
            targetLat, targetLon
        );
        
        if (distance < 0.1) { // 小於 0.1 米，認為已到達
            marker.setLatLng([targetLat, targetLon]);
            return;
        }
        
        // 如果已經有動畫在進行，停止它
        if (this.vehicleAnimations[vehicleId]) {
            clearInterval(this.vehicleAnimations[vehicleId]);
        }
        
        // 計算移動參數
        const startLat = currentLatLng.lat;
        const startLon = currentLatLng.lng;
        const deltaLat = targetLat - startLat;
        const deltaLon = targetLon - startLon;
        
        // 動畫持續時間（根據距離計算，最小 500ms，最大 3000ms）
        const duration = Math.min(3000, Math.max(500, distance * 200));
        const steps = Math.ceil(duration / 50); // 每 50ms 更新一次
        let currentStep = 0;
        
        // 開始動畫
        this.vehicleAnimations[vehicleId] = setInterval(() => {
            currentStep++;
            
            if (currentStep >= steps) {
                // 動畫完成
                marker.setLatLng([targetLat, targetLon]);
                clearInterval(this.vehicleAnimations[vehicleId]);
                delete this.vehicleAnimations[vehicleId];
                
                // 更新相關元素
                this.updateTrail(vehicleId, [targetLat, targetLon]);
                const state = this.vehicleStates[vehicleId];
                if (state) {
                    this.updateStatusPanel(vehicleId, state);
                }
                return;
            }
            
            // 使用緩動函數（ease-out）
            const progress = currentStep / steps;
            const easeProgress = 1 - Math.pow(1 - progress, 3);
            
            // 計算當前位置
            const currentLat = startLat + deltaLat * easeProgress;
            const currentLon = startLon + deltaLon * easeProgress;
            
            // 更新標記位置
            marker.setLatLng([currentLat, currentLon]);
            
            // 更新軌跡
            this.updateTrail(vehicleId, [currentLat, currentLon]);
            
            // 更新狀態視窗位置
            const state = this.vehicleStates[vehicleId];
            if (state) {
                // 臨時更新位置用於計算視窗位置
                const tempState = { ...state, position: { lat: currentLat, lon: currentLon, altitude: state.position.altitude } };
                this.updateStatusPanel(vehicleId, tempState);
            }
        }, 50);
    }
    
    async startDataUpdates() {
        while (true) {
            try {
                const response = await fetch('/api/vehicles/states');
                const data = await response.json();
                
                if (data.success) {
                    this.updateVehiclePositions(data.data);
                }
            } catch (error) {
                console.error('Failed to update vehicle positions:', error);
            }
            
            await new Promise(resolve => setTimeout(resolve, 500)); // 每 500ms 更新一次
        }
    }
}

// 初始化頁面
let mapPage;
document.addEventListener('DOMContentLoaded', () => {
    mapPage = new MapPage();
});

