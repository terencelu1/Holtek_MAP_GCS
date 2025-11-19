"""
UAV × UGV Control Center - Flask 應用主文件
總覽頁面（Overview）實現 - 整合 MAVLink 數據
"""
import os
import sys
import time
import logging
import threading
import math
import random
from pathlib import Path
from flask import Flask, render_template, jsonify, request

# 設定日誌
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# 添加 MAVLink 模組路徑
current_dir = Path(__file__).parent
sys.path.insert(0, str(current_dir))

# 導入配置和 MAVLink 模組
import config
from mavlink_module.connection import MAVLinkConnection
from mavlink_module.telemetry import MAVLinkTelemetry
from mavlink_module.rover_controller import RoverController

# 創建 Flask 應用
app = Flask(
    __name__,
    template_folder='templates',
    static_folder='static'
)
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'uav-ugv-control-center-2025')

# 全局 MAVLink 對象
mavlink_connection = None
mavlink_telemetry = None
rover_controller = None

# 載具狀態存儲
vehicle_states = {
    'UAV1': {
        'vehicleId': 'UAV1',
        'type': 'uav',
        'timestamp': time.time(),
        'armed': False,
        'mode': 'MANUAL',
        'gps': {'fix': 3, 'satellites': 14, 'hdop': 0.7},
        'battery': {'voltage': 15.4, 'percent': 78, 'remainingMin': 12, 'charging': False},
        'position': {'lat': 23.024087, 'lon': 120.224649, 'altitude': 13.2},
        'attitude': {'rollDeg': -2.3, 'pitchDeg': 1.1, 'yawDeg': 180.0},
        'rc': {'throttle': 0.55, 'roll': 0.02, 'pitch': -0.10, 'yaw': 0.00},
        'motion': {'groundSpeed': 3.2, 'verticalSpeed': -0.3},
        'linkHealth': {'heartbeatHz': 20, 'latencyMs': 80, 'packetLossPercent': 1.2, 'linkType': 'UDP'},
        'systemHealth': {'cpu': 35, 'memory': 40, 'temperature': 55},
        'chargeStatus': {'charging': False, 'chargeVoltage': None, 'chargeCurrent': None},
        'cameraUrl': '/static/images/uav_cam.jpg',
        'lastChargingState': False
    },
    'UGV1': {
        'vehicleId': 'UGV1',
        'type': 'ugv',
        'timestamp': time.time(),
        'armed': False,
        'mode': 'MANUAL',
        # 模擬數據（系統狀態、電池、位置等）
        'gps': {'fix': 3, 'satellites': 12, 'hdop': 0.9},
        'battery': {'voltage': 14.8, 'percent': 85, 'remainingMin': 45, 'charging': False},
        'position': {'lat': 23.023975, 'lon': 120.224334, 'altitude': 0.0},
        # 初始姿態（會被 MAVLink 真實數據覆蓋）
        'attitude': {'rollDeg': 0.0, 'pitchDeg': 0.0, 'yawDeg': 0.0},
        # 初始 RC（會被 MAVLink 真實數據覆蓋）
        'rc': {'throttle': 0.0, 'roll': 0.0, 'pitch': 0.0, 'yaw': 0.0},
        # 初始運動（會被 MAVLink 真實數據覆蓋）
        'motion': {'groundSpeed': 0.0, 'verticalSpeed': 0.0},
        'linkHealth': {'heartbeatHz': 20, 'latencyMs': 75, 'packetLossPercent': 0.8, 'linkType': 'Serial'},
        'systemHealth': {'cpu': 30, 'memory': 35, 'temperature': 50},
        'chargeStatus': {'charging': False, 'chargeVoltage': None, 'chargeCurrent': None},
        'cameraUrl': '/static/images/ugv_cam.jpg',
        'lastChargingState': False
    }
}

# 歷史數據存儲（用於圖表）
history_data = {
    'UAV1': {'attitude': [], 'rc': [], 'motion': [], 'altitude': []},
    'UGV1': {'attitude': [], 'rc': [], 'motion': [], 'altitude': []}
}

# 訊息中心數據
messages = []

# 系統日誌（用於性能與紀錄頁面）
system_logs = []

# 充電歷史紀錄
charging_history = []

# Companion 系統初始運行時間（隨機生成，之後開始計時）
companion_start_time = time.time() - (
    random.randint(1, 5) * 86400 +  # 1-5天
    random.randint(1, 23) * 3600 +  # 1-23小時
    random.randint(1, 59) * 60 +    # 1-59分鐘
    random.randint(1, 59)            # 1-59秒
)

# 回放緩衝設定（秒）- 控制保留多少歷史數據用於回放
playback_buffer_seconds = 300  # 預設5分鐘

def add_log(vehicle_id, level, message):
    """添加系統日誌"""
    global system_logs
    system_logs.append({
        'timestamp': time.time(),
        'vehicleId': vehicle_id,
        'level': level,
        'message': message
    })
    # 限制日誌數量
    if len(system_logs) > 1000:
        system_logs = system_logs[-1000:]

def init_mavlink():
    """初始化 MAVLink 連接"""
    global mavlink_connection, mavlink_telemetry, rover_controller
    
    try:
        # 使用 config.py 中的配置
        connection_string = config.MAVLINK_CONNECTION_STRING
        baudrate = config.MAVLINK_BAUDRATE
        
        logger.info(f"正在連接到 MAVLink: {connection_string} @ {baudrate}")
        
        mavlink_connection = MAVLinkConnection(connection_string, baudrate)
        mavlink_telemetry = MAVLinkTelemetry(mavlink_connection)
        rover_controller = RoverController(mavlink_connection, mavlink_telemetry)
        
        # 嘗試連接
        if mavlink_connection.connect():
            logger.info("MAVLink 連接成功")
            # 配置數據流
            rover_controller.configure_data_streams()
        else:
            logger.warning("MAVLink 連接失敗，將持續重試")
            
    except Exception as e:
        logger.error(f"MAVLink 初始化錯誤: {e}")

def update_mavlink_data():
    """從 MAVLink 更新 UGV1 數據 - 僅更新姿態指示器和性能圖表所需的數據"""
    global mavlink_telemetry
    
    while True:
        try:
            if mavlink_telemetry and mavlink_connection.is_connected:
                # 獲取原始數據
                raw_data = mavlink_telemetry.get_dashboard_data()
                
                if raw_data['connection_status']:
                    # 映射到 UGV1 狀態
                    ugv_state = vehicle_states['UGV1']
                    current_time = time.time()
                    
                    # 只更新姿態指示器和性能圖表需要的數據
                    # 1. 姿態數據（用於姿態指示器）
                    ugv_state['attitude'] = {
                        'rollDeg': raw_data['attitude']['roll'],
                        'pitchDeg': raw_data['attitude']['pitch'],
                        'yawDeg': raw_data['attitude']['yaw']
                    }
                    
                    # 2. 運動數據（用於性能圖表）
                    ugv_state['motion'] = {
                        'groundSpeed': raw_data['velocity']['ground_speed'],
                        'verticalSpeed': raw_data['velocity']['climb_rate']
                    }
                    
                    # 3. RC 數據（用於性能圖表）
                    rc_channels = raw_data['rc_channels']['channels']
                    if len(rc_channels) >= 4:
                        # 簡單歸一化：PWM 1000-2000 轉換為 -1.0 到 1.0
                        def norm(pwm): 
                            return max(-1.0, min(1.0, (pwm - 1500) / 500.0))
                        def norm_thr(pwm): 
                            return max(0.0, min(1.0, (pwm - 1000) / 1000.0))  # 0-1 for throttle
                        
                        # 根據 Rover 配置：CH1=Throttle, CH2=Steering
                        # 但為了符合參考資料格式（throttle, roll, pitch, yaw），我們映射：
                        ugv_state['rc'] = {
                            'throttle': norm_thr(rc_channels[0]) if len(rc_channels) > 0 else 0,  # CH1: Throttle
                            'roll': norm(rc_channels[1]) if len(rc_channels) > 1 else 0,           # CH2: Steering (作為 Roll)
                            'pitch': norm(rc_channels[2]) if len(rc_channels) > 2 else 0,         # CH3: Mode (作為 Pitch)
                            'yaw': norm(rc_channels[3]) if len(rc_channels) > 3 else 0            # CH4: Aux (作為 Yaw)
                        }
                    else:
                        # 如果沒有 RC 數據，保持當前值或設為 0
                        if 'rc' not in ugv_state:
                            ugv_state['rc'] = {'throttle': 0.0, 'roll': 0.0, 'pitch': 0.0, 'yaw': 0.0}
                    
                    ugv_state['lastUpdateTime'] = current_time
                    ugv_state['timestamp'] = current_time
                    
                    # 更新歷史數據（用於性能圖表）
                    history = history_data['UGV1']
                    history['attitude'].append({
                        'timestamp': current_time,
                        'roll': ugv_state['attitude']['rollDeg'],
                        'pitch': ugv_state['attitude']['pitchDeg'],
                        'yaw': ugv_state['attitude']['yawDeg']
                    })
                    history['rc'].append({
                        'timestamp': current_time,
                        'throttle': ugv_state['rc']['throttle'],
                        'roll': ugv_state['rc']['roll'],
                        'pitch': ugv_state['rc']['pitch'],
                        'yaw': ugv_state['rc']['yaw']
                    })
                    history['motion'].append({
                        'timestamp': current_time,
                        'groundSpeed': ugv_state['motion']['groundSpeed'],
                        'throttle': ugv_state['rc']['throttle']
                    })
                    
                    # 高度數據（UGV 通常為 0）
                    history['altitude'].append({
                        'timestamp': current_time,
                        'altitude': ugv_state['position']['altitude']
                    })
                    
                    # 限制歷史數據長度（根據回放緩衝設定保留數據）
                    global playback_buffer_seconds
                    current_time = time.time()
                    cutoff_time = current_time - playback_buffer_seconds
                    
                    # 移除超過緩衝時間的舊數據
                    for key in history:
                        # 過濾掉超過緩衝時間的數據
                        history[key] = [d for d in history[key] if d.get('timestamp', 0) >= cutoff_time]
                        
                        # 同時限制最大數據點數（防止內存溢出）
                        if len(history[key]) > 5000:
                            history[key] = history[key][-5000:]
                    
                    # 添加日誌（MAVLink 數據更新）
                    import random
                    if random.random() < 0.005:  # 0.5% 機率
                        add_log('UGV1', 'info', f'MAVLink 數據更新: 速度 {ugv_state["motion"]["groundSpeed"]:.2f} m/s')
                            
            elif mavlink_connection and not mavlink_connection.is_connected:
                # 嘗試重連
                if time.time() % 5 < 0.1: # 每5秒嘗試一次
                    try:
                        mavlink_connection.connect()
                    except:
                        pass
                        
        except Exception as e:
            logger.error(f"數據更新錯誤: {e}")
        
        time.sleep(0.05) # 20Hz 更新

@app.route('/')
def index():
    """總覽頁面"""
    return render_template('overview.html')

@app.route('/map')
def map_page():
    """地圖與任務頁面"""
    return render_template('map.html')

@app.route('/overview')
def overview():
    """總覽頁面（別名）"""
    return render_template('overview.html')

@app.route('/performance')
def performance_page():
    """性能與紀錄頁面"""
    return render_template('performance.html')

@app.route('/system')
def system_page():
    """系統與電源頁面"""
    return render_template('system.html')

@app.route('/api/vehicles')
def get_vehicles():
    """獲取所有載具列表"""
    return jsonify({
        'success': True,
        'vehicles': list(vehicle_states.keys())
    })

@app.route('/api/vehicles/states')
def get_all_vehicle_states():
    """獲取所有載具的狀態"""
    states = {}
    current_time = time.time()
    
    for vehicle_id, state in vehicle_states.items():
        state_copy = state.copy()
        state_copy['timestamp'] = current_time
        
        # 檢查數據新鮮度
        time_since_update = current_time - state.get('lastUpdateTime', state['timestamp'])
        state_copy['dataStale'] = time_since_update > 2.0 # 放寬到2秒
        
        states[vehicle_id] = state_copy
    
    return jsonify({
        'success': True,
        'data': states,
        'timestamp': current_time
    })

@app.route('/api/logs')
def get_logs():
    """獲取系統日誌"""
    return jsonify({
        'success': True,
        'logs': system_logs[-500:],  # 返回最近500條
        'total': len(system_logs)
    })

@app.route('/api/vehicle/<vehicle_id>/history')
def get_vehicle_history(vehicle_id):
    """獲取載具的歷史數據（用於圖表）"""
    if vehicle_id not in history_data:
        return jsonify({
            'success': False,
            'error': f'Vehicle {vehicle_id} not found'
        }), 404
    
    # 返回最近30秒的數據
    current_time = time.time()
    cutoff_time = current_time - 30
    
    history = history_data[vehicle_id]
    filtered_history = {
        'attitude': [d for d in history['attitude'] if d['timestamp'] >= cutoff_time],
        'rc': [d for d in history['rc'] if d['timestamp'] >= cutoff_time],
        'motion': [d for d in history['motion'] if d['timestamp'] >= cutoff_time]
    }
    
    return jsonify({
        'success': True,
        'data': filtered_history
    })

@app.route('/api/vehicle/<vehicle_id>/history/full')
def get_vehicle_history_full(vehicle_id):
    """獲取載具的完整歷史數據（用於回放）"""
    if vehicle_id not in history_data:
        return jsonify({
            'success': False,
            'error': f'Vehicle {vehicle_id} not found'
        }), 404
    
    history = history_data[vehicle_id]
    
    # 計算時間範圍
    all_times = []
    for key in ['attitude', 'rc', 'motion', 'altitude']:
        if history[key]:
            all_times.extend([d['timestamp'] for d in history[key]])
    
    if not all_times:
        return jsonify({
            'success': True,
            'data': {
                'attitude': [],
                'rc': [],
                'motion': [],
                'altitude': []
            },
            'startTime': time.time(),
            'endTime': time.time(),
            'duration': 0
        })
    
    start_time = min(all_times)
    end_time = max(all_times)
    duration = end_time - start_time
    
    return jsonify({
        'success': True,
        'data': {
            'attitude': history['attitude'],
            'rc': history['rc'],
            'motion': history['motion'],
            'altitude': history['altitude']
        },
        'startTime': start_time,
        'endTime': end_time,
        'duration': duration
    })

@app.route('/api/messages')
def get_messages():
    """獲取訊息中心的訊息"""
    # 嘗試從 telemetry 獲取最新消息
    if mavlink_telemetry:
        status_msgs = mavlink_telemetry.get_status_messages(5)
        for msg in status_msgs:
            # 避免重複（簡單檢查時間戳）
            if not any(m['timestamp'] == msg['timestamp'] for m in messages):
                messages.append({
                    'timestamp': msg['timestamp'],
                    'vehicle': 'UGV1',
                    'level': 'info', # 可根據 severity 調整
                    'message': msg['text']
                })
                
    return jsonify({
        'success': True,
        'data': messages[-50:]
    })

@app.route('/api/charging/history')
def get_charging_history():
    """獲取充電歷史紀錄"""
    # 如果沒有歷史紀錄，返回一筆模擬數據
    if len(charging_history) == 0:
        import random
        mock_history = [{
            'vehicleId': 'UAV1',
            'startTime': time.time() - 3600 * 2,  # 2小時前
            'endTime': time.time() - 3600,  # 1小時前
            'startSOC': 20.0,
            'endSOC': 85.0,
            'duration': 3600  # 1小時
        }]
        return jsonify({
            'success': True,
            'history': mock_history
        })
    
    return jsonify({
        'success': True,
        'history': charging_history[-50:]  # 返回最近50條
    })

@app.route('/api/system/settings', methods=['POST'])
def update_system_settings():
    """更新系統設定（包括回放緩衝）"""
    global playback_buffer_seconds
    data = request.get_json() or {}
    
    if 'playbackBuffer' in data:
        playback_buffer_seconds = int(data['playbackBuffer'])
        if playback_buffer_seconds < 60:
            playback_buffer_seconds = 60
        elif playback_buffer_seconds > 3600:
            playback_buffer_seconds = 3600
    
    return jsonify({
        'success': True,
        'message': '設定已更新',
        'playbackBuffer': playback_buffer_seconds
    })

@app.route('/api/companion/status')
def get_companion_status():
    """獲取 Companion 系統狀態"""
    global companion_start_time
    
    try:
        import psutil
        
        # 獲取系統資源使用情況
        cpu_percent = psutil.cpu_percent(interval=0.1)
        memory = psutil.virtual_memory()
        memory_percent = memory.percent
        
        # 獲取溫度（如果可用）
        try:
            temps = psutil.sensors_temperatures()
            if temps:
                # 嘗試獲取 CPU 溫度
                cpu_temp = temps.get('cpu_thermal', temps.get('coretemp', {}))
                if cpu_temp and len(cpu_temp) > 0:
                    temperature = cpu_temp[0].current
                else:
                    temperature = 50.0  # 預設值
            else:
                temperature = 50.0
        except:
            temperature = 50.0
        
        # 計算運行時間：從初始隨機時間開始計時
        uptime = int(time.time() - companion_start_time)
        
        return jsonify({
            'success': True,
            'status': {
                'cpu': cpu_percent,
                'memory': memory_percent,
                'temperature': temperature,
                'uptime': uptime
            }
        })
    except ImportError:
        # 如果 psutil 不可用，返回模擬數據
        # 計算運行時間：從初始隨機時間開始計時
        uptime = int(time.time() - companion_start_time)
        
        return jsonify({
            'success': True,
            'status': {
                'cpu': 35.0,
                'memory': 40.0,
                'temperature': 50.0,
                'uptime': uptime
            }
        })
    except Exception as e:
        logger.error(f"Failed to get companion status: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/control/<vehicle_id>/arm', methods=['POST'])
def arm_vehicle(vehicle_id):
    """武裝載具"""
    data = request.get_json() or {}
    arm = data.get('arm', True)
    
    if vehicle_id == 'UGV1' and rover_controller:
        if arm:
            result = rover_controller.arm()
        else:
            result = rover_controller.disarm()
            
        if result:
             messages.append({
                'timestamp': time.time(),
                'vehicle': vehicle_id,
                'level': 'info',
                'message': f'載具已{"武裝" if arm else "解除武裝"}'
            })
        return jsonify({'success': result})
        
    elif vehicle_id == 'UAV1':
        # Mock UAV arming
        vehicle_states[vehicle_id]['armed'] = arm
        return jsonify({'success': True})
        
    return jsonify({'success': False, 'error': 'Unknown vehicle or controller not ready'})

@app.route('/api/control/<vehicle_id>/mode', methods=['POST'])
def change_mode(vehicle_id):
    """切換載具模式"""
    data = request.get_json() or {}
    mode = data.get('mode', 'MANUAL')
    
    if vehicle_id == 'UGV1' and rover_controller:
        result = rover_controller.set_mode(mode)
        return jsonify({'success': result})
        
    elif vehicle_id == 'UAV1':
        vehicle_states[vehicle_id]['mode'] = mode
        return jsonify({'success': True})
        
    return jsonify({'success': False})

# 模擬數據更新（用於 UAV1）
def update_mock_data():
    """更新 UAV1 模擬數據"""
    import random
    
    while True:
        try:
            current_time = time.time()
            state = vehicle_states['UAV1']
            
            # 更新姿態數據
            state['attitude']['rollDeg'] += random.uniform(-0.5, 0.5)
            state['attitude']['pitchDeg'] += random.uniform(-0.5, 0.5)
            state['attitude']['rollDeg'] = max(-45, min(45, state['attitude']['rollDeg']))
            
            # 更新位置
            state['position']['altitude'] += random.uniform(-0.1, 0.1)
            state['position']['altitude'] = max(0, state['position']['altitude'])
            
            # 追蹤充電狀態變化
            current_charging = state['battery'].get('charging', False) or state['chargeStatus'].get('charging', False)
            last_charging = state.get('lastChargingState', False)
            
            if current_charging != last_charging:
                if current_charging:
                    # 開始充電
                    charging_history.append({
                        'vehicleId': 'UAV1',
                        'startTime': current_time,
                        'endTime': None,
                        'startSOC': state['battery']['percent'],
                        'endSOC': None,
                        'duration': None
                    })
                else:
                    # 結束充電
                    for record in reversed(charging_history):
                        if record['vehicleId'] == 'UAV1' and record['endTime'] is None:
                            record['endTime'] = current_time
                            record['endSOC'] = state['battery']['percent']
                            record['duration'] = current_time - record['startTime']
                            break
                state['lastChargingState'] = current_charging
            
            state['lastUpdateTime'] = current_time
            state['timestamp'] = current_time
            
            # 偶爾添加日誌（模擬）
            if random.random() < 0.01:  # 1% 機率
                add_log('UAV1', 'info', f'位置更新: {state["position"]["lat"]:.6f}, {state["position"]["lon"]:.6f}')
            
            # 歷史數據
            history_data['UAV1']['attitude'].append({
                'timestamp': current_time,
                'roll': state['attitude']['rollDeg'],
                'pitch': state['attitude']['pitchDeg'],
                'yaw': state['attitude']['yawDeg']
            })
            
            history_data['UAV1']['rc'].append({
                'timestamp': current_time,
                'throttle': 0.5,
                'roll': 0,
                'pitch': 0,
                'yaw': 0
            })
            
            history_data['UAV1']['motion'].append({
                'timestamp': current_time,
                'groundSpeed': 5.0,
                'throttle': 0.5
            })
            
            # 高度數據（僅UAV）
            history_data['UAV1']['altitude'].append({
                'timestamp': current_time,
                'altitude': state['position']['altitude']
            })
            
            # 限制歷史數據長度（根據回放緩衝設定保留數據）
            global playback_buffer_seconds
            current_time = time.time()
            cutoff_time = current_time - playback_buffer_seconds
            
            # 移除超過緩衝時間的舊數據
            for key in history_data['UAV1']:
                # 過濾掉超過緩衝時間的數據
                history_data['UAV1'][key] = [d for d in history_data['UAV1'][key] if d.get('timestamp', 0) >= cutoff_time]
                
                # 同時限制最大數據點數（防止內存溢出）
                if len(history_data['UAV1'][key]) > 5000:
                    history_data['UAV1'][key] = history_data['UAV1'][key][-5000:]
            
            time.sleep(0.1)
        except:
            time.sleep(1)

if __name__ == '__main__':
    # 初始化 MAVLink
    init_mavlink()
    
    # 啟動數據更新線程
    mavlink_thread = threading.Thread(target=update_mavlink_data, daemon=True)
    mavlink_thread.start()
    
    # 啟動模擬數據線程（UAV）
    mock_thread = threading.Thread(target=update_mock_data, daemon=True)
    mock_thread.start()
    
    logger.info("啟動 UAV × UGV Control Center...")
    logger.info("總覽頁面: http://localhost:5000")
    
    app.run(
        host='0.0.0.0',
        port=5000,
        debug=True,
        threaded=True,
        use_reloader=False  # 避免重複啟動線程
    )
