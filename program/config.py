"""
配置文件 - Pixhawk2.4.8 Rover WebUI控制系統
基於ArduPilot Rover系統韌體，集成pymavlink和Web儀表板功能
"""
import os
import sys
from pathlib import Path

# =================== 系統基本配置 ===================
SYSTEM_NAME = os.environ.get('SYSTEM_NAME', 'Pixhawk Rover WebUI Control System')
SYSTEM_VERSION = os.environ.get('SYSTEM_VERSION', '1.0.0')
FIRMWARE_TYPE = os.environ.get('FIRMWARE_TYPE', 'ArduRover')  # 專用於ArduRover

# =================== MAVLink連接配置 ===================
MAVLINK_CONNECTION_STRING = os.environ.get('MAVLINK_CONNECTION_STRING', 'COM6')
MAVLINK_BAUDRATE = int(os.environ.get('MAVLINK_BAUDRATE', '9600'))
MAVLINK_SOURCE_SYSTEM = int(os.environ.get('MAVLINK_SOURCE_SYSTEM', '255'))  # 標準GCS系統ID
MAVLINK_SOURCE_COMPONENT = int(os.environ.get('MAVLINK_SOURCE_COMPONENT', '0'))  # 標準GCS組件ID
MAVLINK_DIALECT = os.environ.get('MAVLINK_DIALECT', 'ardupilotmega')

# MAVLink串流配置（針對Rover優化）
MAVLINK_STREAM_RATES = {
    'RAW_SENSORS': int(os.environ.get('MAVLINK_STREAM_RATE_RAW_SENSORS', '10')),  # 姿態數據
    'EXTENDED_STATUS': int(os.environ.get('MAVLINK_STREAM_RATE_EXTENDED_STATUS', '5')),
    'RC_CHANNELS': int(os.environ.get('MAVLINK_STREAM_RATE_RC_CHANNELS', '10')),  # RC通道數據
    'RAW_CONTROLLER': int(os.environ.get('MAVLINK_STREAM_RATE_RAW_CONTROLLER', '5')),
    'POSITION': int(os.environ.get('MAVLINK_STREAM_RATE_POSITION', '10')),  # 位置數據
    'EXTRA1': int(os.environ.get('MAVLINK_STREAM_RATE_EXTRA1', '20')),  # 姿態數據（高頻）
    'EXTRA2': int(os.environ.get('MAVLINK_STREAM_RATE_EXTRA2', '10')),  # VFR_HUD數據
    'EXTRA3': int(os.environ.get('MAVLINK_STREAM_RATE_EXTRA3', '5')),
}

# MAVLink緩衝區配置
MAVLINK_BUFFER_SIZE = int(os.environ.get('MAVLINK_BUFFER_SIZE', '8192'))
MAVLINK_TIMEOUT = float(os.environ.get('MAVLINK_TIMEOUT', '1.0'))
MAVLINK_HIGHSPEED = os.environ.get('MAVLINK_HIGHSPEED', 'True').lower() in ('true', '1', 't')

# =================== RC Override配置 ===================
RC_OVERRIDE_ENABLED = os.environ.get('RC_OVERRIDE_ENABLED', 'True').lower() in ('true', '1', 't')
RC_AUTHORIZED_SYSID = int(os.environ.get('RC_AUTHORIZED_SYSID', '255'))
RC_OVERRIDE_TIMEOUT = int(os.environ.get('RC_OVERRIDE_TIMEOUT', '-1'))
RC_OVERRIDE_SAFETY_TIMEOUT = float(os.environ.get('RC_OVERRIDE_SAFETY_TIMEOUT', '5.0'))
RC_OVERRIDE_AUTO_CONFIGURE = os.environ.get('RC_OVERRIDE_AUTO_CONFIGURE', 'True').lower() in ('true', '1', 't')

# RC通道配置（Rover專用）
RC_CHANNELS = {
    'THROTTLE': 1,    # CH1 - 油門/前進後退
    'STEERING': 2,    # CH2 - 轉向
    'MODE_SWITCH': 3, # CH3 - 模式切換
    'AUX1': 4,        # CH4 - 輔助功能
}

# RC Override數值範圍
RC_OVERRIDE_MIN = 1000
RC_OVERRIDE_MAX = 2000
RC_OVERRIDE_MID = 1500

# =================== Web伺服器配置 ===================
WEB_HOST = os.environ.get('WEB_HOST', '0.0.0.0')
WEB_PORT = int(os.environ.get('WEB_PORT', '5000'))
WEB_DEBUG = os.environ.get('WEB_DEBUG', 'False').lower() in ('true', '1', 't')
WEB_SECRET_KEY = os.environ.get('WEB_SECRET_KEY', 'pixhawk-rover-control-2024')

# =================== 儀表板配置 ===================
# 更新頻率配置
DASHBOARD_UPDATE_INTERVAL = int(os.environ.get('DASHBOARD_UPDATE_INTERVAL', '200'))  # 儀表板更新間隔（毫秒）
TELEMETRY_UPDATE_RATE = int(os.environ.get('TELEMETRY_UPDATE_RATE', '20'))  # 遙測更新頻率（Hz）

# 姿態角可視化配置
ATTITUDE_VISUALIZATION = {
    'enable_3d_model': True,
    'enable_horizon': True,
    'enable_compass': True,
    'pitch_limit': 90,  # Rover一般不會有大幅度俯仰
    'roll_limit': 45,   # Rover側傾限制
    'update_rate_hz': 20,
}

# 性能圖表配置
PERFORMANCE_CHARTS = {
    'enable_ekf_attitude': True,        # EKF濾波姿態角圖表
    'enable_ground_speed': True,        # 地面速度圖表
    'enable_motor_output': True,        # 電機輸出圖表
    'enable_battery_trend': True,       # 電池趨勢圖表
    'default_update_rate_hz': 10,       # 默認更新頻率
    'max_data_points': 300,             # 最大數據點數
    'time_window_seconds': 30,          # 時間窗口（秒）
}

# 系統狀態監控項目
SYSTEM_STATUS_ITEMS = [
    'armed_status',      # 解鎖狀態
    'flight_mode',       # 飛行模式
    'battery_voltage',   # 電池電壓
    'battery_current',   # 電池電流
    'battery_remaining', # 電池剩餘容量
    'gps_status',        # GPS狀態
    'ekf_status',        # EKF狀態
    'system_load',       # 系統負載
]

# =================== 數據存儲配置 ===================
DATA_STORE_TYPE = os.environ.get('DATA_STORE_TYPE', 'memory')
DATA_STORE_PATH = os.environ.get('DATA_STORE_PATH', './logs/data')
DATA_RETENTION_DAYS = int(os.environ.get('DATA_RETENTION_DAYS', '7'))

# =================== 日誌配置 ===================
LOG_LEVEL = os.environ.get('LOG_LEVEL', 'INFO')
LOG_FILE = os.environ.get('LOG_FILE', './logs/rover_control.log')
LOG_FORMAT = os.environ.get('LOG_FORMAT', '%(asctime)s - %(name)s - %(levelname)s - %(message)s')

# =================== 監控參數列表 ===================
MONITORED_PARAMETERS = [
    'ATTITUDE',            # 姿態數據（roll, pitch, yaw）
    'VFR_HUD',             # 基本飛行數據（速度、高度等）
    'GPS_RAW_INT',         # GPS原始數據
    'GLOBAL_POSITION_INT', # 全球位置
    'SYS_STATUS',          # 系統狀態
    'HEARTBEAT',           # 心跳包
    'BATTERY_STATUS',      # 電池狀態
    'RC_CHANNELS',         # 遙控器通道
    'SERVO_OUTPUT_RAW',    # 舵機輸出
    'STATUSTEXT',          # 狀態文本
    'NAV_CONTROLLER_OUTPUT', # 導航控制器輸出
    'MISSION_CURRENT',     # 當前任務
    'EKF_STATUS_REPORT',   # EKF狀態報告
]

# =================== 學術風格圖表配置 ===================
ACADEMIC_CHART_STYLE = {
    'background_color': '#ffffff',
    'grid_color': '#e0e0e0',
    'line_colors': ['#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd'], # 學術出版常用配色
    'font_family': 'Arial, "Noto Sans TC", sans-serif',
    'font_size': 12,
    'title_font_size': 14,
    'enable_legend': True,
    'enable_grid': True,
    'line_width': 2,
    'aspect_ratio': 1.618, # 黃金比例
    'y_axis_symmetric': True, # 姿態圖表Y軸對稱
    'enable_point_markers': False, # 不顯示數據點標記，減少視覺干擾
    'animation_duration': 0, # 禁用動畫以提高性能
    'text_color': '#333333', # 文字顏色
    'axis_padding': 10, # 軸標籤內邊距
    'tick_color': '#888888', # 刻度線顏色
}

# =================== 安全配置 ===================
SAFETY_LIMITS = {
    'max_throttle_override': 1800,  # 最大油門覆蓋值
    'max_steering_override': 1800,  # 最大轉向覆蓋值
    'emergency_stop_enabled': True,
    'auto_disarm_timeout': 300,     # 自動解除武裝超時（秒）
}

# =================== UI配置 ===================
UI_CONFIG = {
    'theme': 'modern',              # UI主題
    'language': 'zh-TW',            # 界面語言
    'enable_fullscreen': True,      # 允許全屏
    'enable_mobile_view': True,     # 移動端視圖
    'dashboard_layout': 'rover',    # 儀表板布局類型
}

# =================== 調試配置 ===================
DEBUG_CONFIG = {
    'enable_mavlink_debug': False,  # MAVLink調試
    'enable_telemetry_debug': False, # 遙測調試
    'enable_rc_debug': False,       # RC調試
    'log_raw_messages': False,      # 記錄原始消息
} 