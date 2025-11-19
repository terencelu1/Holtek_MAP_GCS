"""
MAVLink遙測數據處理模組 - Rover專用版本
處理來自Pixhawk Rover的所有遙測數據，針對儀表板顯示優化
"""
import time
import threading
import logging
import math
from typing import Optional, Dict, Any, List, Callable
from dataclasses import dataclass, field
from collections import deque
import json

# 導入配置
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))
import config

from .connection import MAVLinkConnection

# 設定日誌
logger = logging.getLogger(__name__)

@dataclass
class AttitudeData:
    """姿態數據"""
    roll: float = 0.0          # 橫滾角（弧度）
    pitch: float = 0.0         # 俯仰角（弧度）
    yaw: float = 0.0           # 偏航角（弧度）
    roll_degrees: float = 0.0  # 橫滾角（度）
    pitch_degrees: float = 0.0 # 俯仰角（度）
    yaw_degrees: float = 0.0   # 偏航角（度）
    timestamp: float = field(default_factory=time.time)

@dataclass
class VelocityData:
    """速度數據"""
    ground_speed: float = 0.0    # 地面速度（m/s）
    air_speed: float = 0.0       # 空速（m/s）
    climb_rate: float = 0.0      # 爬升率（m/s）
    heading: float = 0.0         # 航向（度）
    timestamp: float = field(default_factory=time.time)

@dataclass
class PositionData:
    """位置數據"""
    latitude: float = 0.0        # 緯度（度）
    longitude: float = 0.0       # 經度（度）
    altitude: float = 0.0        # 高度（米）
    relative_altitude: float = 0.0 # 相對高度（米）
    timestamp: float = field(default_factory=time.time)

@dataclass
class BatteryData:
    """電池數據"""
    voltage: float = 0.0         # 電壓（伏）
    current: float = 0.0         # 電流（安）
    remaining: float = 0.0       # 剩餘容量（%）
    consumed: float = 0.0        # 已消耗容量（mAh）
    timestamp: float = field(default_factory=time.time)

@dataclass
class SystemStatus:
    """系統狀態"""
    armed: bool = False          # 武裝狀態
    flight_mode: str = "UNKNOWN" # 飛行模式
    system_status: str = "UNKNOWN" # 系統狀態
    gps_status: int = 0          # GPS狀態
    satellites_visible: int = 0   # 可見衛星數
    system_load: float = 0.0     # 系統負載（%）
    timestamp: float = field(default_factory=time.time)

@dataclass
class RCChannelsData:
    """RC通道數據"""
    channels: List[int] = field(default_factory=lambda: [1500] * 18)  # 18個通道
    rssi: int = 0                # 信號強度
    timestamp: float = field(default_factory=time.time)

@dataclass
class ServoOutputData:
    """舵機輸出數據"""
    outputs: List[int] = field(default_factory=lambda: [1500] * 16)   # 16個輸出
    timestamp: float = field(default_factory=time.time)

@dataclass
class EKFStatusData:
    """EKF狀態數據"""
    flags: int = 0               # EKF狀態標誌
    velocity_variance: float = 0.0
    pos_horiz_variance: float = 0.0
    pos_vert_variance: float = 0.0
    compass_variance: float = 0.0
    terrain_alt_variance: float = 0.0
    timestamp: float = field(default_factory=time.time)

class RoverTelemetryProcessor:
    """
    Rover遙測數據處理器
    專門處理ArduPilot Rover系統的遙測數據
    """
    
    def __init__(self, connection: MAVLinkConnection):
        self.connection = connection
        self.lock = threading.RLock()
        
        # 數據存儲
        self.attitude = AttitudeData()
        self.velocity = VelocityData()
        self.position = PositionData()
        self.battery = BatteryData()
        self.system_status = SystemStatus()
        self.rc_channels = RCChannelsData()
        self.servo_output = ServoOutputData()
        self.ekf_status = EKFStatusData()
        
        # 歷史數據存儲（用於圖表）
        self.max_history_points = config.PERFORMANCE_CHARTS['max_data_points']
        self.attitude_history = deque(maxlen=self.max_history_points)
        self.velocity_history = deque(maxlen=self.max_history_points)
        self.battery_history = deque(maxlen=self.max_history_points)
        
        # 狀態文本
        self.status_messages = deque(maxlen=100)
        
        # 數據更新回調
        self.data_callbacks = {}
        
        # 連接狀態
        self.is_connected = False
        self.last_data_time = 0
        
        # 註冊消息處理器
        self._register_message_handlers()
        
        # 註冊連接狀態回調
        self.connection.register_connection_callback(self._on_connection_status_changed)
        
        logger.info("Rover遙測處理器初始化完成")
    
    def _register_message_handlers(self):
        """註冊MAVLink消息處理器"""
        handlers = {
            'HEARTBEAT': self._handle_heartbeat,
            'ATTITUDE': self._handle_attitude,
            'VFR_HUD': self._handle_vfr_hud,
            'GLOBAL_POSITION_INT': self._handle_global_position,
            'SYS_STATUS': self._handle_sys_status,
            'BATTERY_STATUS': self._handle_battery_status,
            'RC_CHANNELS': self._handle_rc_channels,
            'SERVO_OUTPUT_RAW': self._handle_servo_output,
            'GPS_RAW_INT': self._handle_gps_raw,
            'STATUSTEXT': self._handle_status_text,
            'EKF_STATUS_REPORT': self._handle_ekf_status,
            'NAV_CONTROLLER_OUTPUT': self._handle_nav_controller,
        }
        
        for msg_type, handler in handlers.items():
            self.connection.register_message_callback(msg_type, handler)
    
    def _handle_heartbeat(self, msg):
        """處理心跳包"""
        with self.lock:
            self.system_status.armed = bool(msg.base_mode & 128)  # MAV_MODE_FLAG_SAFETY_ARMED
            
            # 解析飛行模式（ArduRover專用）
            mode_mapping = {
                0: "MANUAL",
                1: "ACRO", 
                2: "LEARNING",
                3: "STEERING",
                4: "HOLD",
                5: "LOITER",
                6: "FOLLOW",
                7: "SIMPLE",
                8: "DOCK",
                9: "CIRCLE",
                10: "AUTO",
                11: "RTL",
                12: "SMART_RTL",
                15: "GUIDED",
                16: "INITIALISING"
            }
            
            self.system_status.flight_mode = mode_mapping.get(msg.custom_mode, f"UNKNOWN({msg.custom_mode})")
            self.system_status.timestamp = time.time()
            
            self._notify_data_update('system_status')
    
    def _handle_attitude(self, msg):
        """處理姿態數據"""
        with self.lock:
            self.attitude.roll = msg.roll
            self.attitude.pitch = msg.pitch
            self.attitude.yaw = msg.yaw
            self.attitude.roll_degrees = math.degrees(msg.roll)
            self.attitude.pitch_degrees = math.degrees(msg.pitch)
            self.attitude.yaw_degrees = math.degrees(msg.yaw)
            self.attitude.timestamp = time.time()
            
            # 添加到歷史數據
            attitude_point = {
                'timestamp': self.attitude.timestamp,
                'roll': self.attitude.roll_degrees,
                'pitch': self.attitude.pitch_degrees,
                'yaw': self.attitude.yaw_degrees
            }
            self.attitude_history.append(attitude_point)
            
            self._notify_data_update('attitude')
    
    def _handle_vfr_hud(self, msg):
        """處理VFR HUD數據"""
        with self.lock:
            self.velocity.ground_speed = msg.groundspeed
            self.velocity.air_speed = msg.airspeed
            self.velocity.climb_rate = msg.climb
            self.velocity.heading = msg.heading
            self.velocity.timestamp = time.time()
            
            # 添加到歷史數據
            velocity_point = {
                'timestamp': self.velocity.timestamp,
                'ground_speed': self.velocity.ground_speed,
                'heading': self.velocity.heading
            }
            self.velocity_history.append(velocity_point)
            
            self._notify_data_update('velocity')
    
    def _handle_global_position(self, msg):
        """處理全球位置數據"""
        with self.lock:
            self.position.latitude = msg.lat / 1e7
            self.position.longitude = msg.lon / 1e7
            self.position.altitude = msg.alt / 1000.0
            self.position.relative_altitude = msg.relative_alt / 1000.0
            self.position.timestamp = time.time()
            
            self._notify_data_update('position')
    
    def _handle_sys_status(self, msg):
        """處理系統狀態"""
        with self.lock:
            self.battery.voltage = msg.voltage_battery / 1000.0  # mV to V
            self.battery.current = msg.current_battery / 100.0   # cA to A
            self.battery.remaining = msg.battery_remaining       # %
            self.system_status.system_load = msg.load / 10.0     # %
            self.system_status.timestamp = time.time()
            
            self._notify_data_update('system_status')
    
    def _handle_battery_status(self, msg):
        """處理電池狀態"""
        with self.lock:
            if len(msg.voltages) > 0 and msg.voltages[0] != 65535:
                # 使用更精確的電池數據
                self.battery.voltage = msg.voltages[0] / 1000.0
            
            if msg.current_battery != -1:
                self.battery.current = msg.current_battery / 100.0
            
            if msg.battery_remaining != -1:
                self.battery.remaining = msg.battery_remaining
            
            if msg.current_consumed != -1:
                self.battery.consumed = msg.current_consumed
            
            self.battery.timestamp = time.time()
            
            # 添加到歷史數據
            battery_point = {
                'timestamp': self.battery.timestamp,
                'voltage': self.battery.voltage,
                'current': self.battery.current,
                'remaining': self.battery.remaining
            }
            self.battery_history.append(battery_point)
            
            self._notify_data_update('battery')
    
    def _handle_rc_channels(self, msg):
        """處理RC通道數據"""
        with self.lock:
            # 更新通道數據
            channels = [
                msg.chan1_raw, msg.chan2_raw, msg.chan3_raw, msg.chan4_raw,
                msg.chan5_raw, msg.chan6_raw, msg.chan7_raw, msg.chan8_raw,
                msg.chan9_raw, msg.chan10_raw, msg.chan11_raw, msg.chan12_raw,
                msg.chan13_raw, msg.chan14_raw, msg.chan15_raw, msg.chan16_raw,
                msg.chan17_raw, msg.chan18_raw
            ]
            
            self.rc_channels.channels = channels
            self.rc_channels.rssi = msg.rssi
            self.rc_channels.timestamp = time.time()
            
            self._notify_data_update('rc_channels')
    
    def _handle_servo_output(self, msg):
        """處理舵機輸出數據"""
        with self.lock:
            outputs = [
                msg.servo1_raw, msg.servo2_raw, msg.servo3_raw, msg.servo4_raw,
                msg.servo5_raw, msg.servo6_raw, msg.servo7_raw, msg.servo8_raw,
                msg.servo9_raw, msg.servo10_raw, msg.servo11_raw, msg.servo12_raw,
                msg.servo13_raw, msg.servo14_raw, msg.servo15_raw, msg.servo16_raw
            ]
            
            self.servo_output.outputs = outputs
            self.servo_output.timestamp = time.time()
            
            self._notify_data_update('servo_output')
    
    def _handle_gps_raw(self, msg):
        """處理GPS原始數據"""
        with self.lock:
            self.system_status.gps_status = msg.fix_type
            self.system_status.satellites_visible = msg.satellites_visible
            self.system_status.timestamp = time.time()
            
            self._notify_data_update('gps')
    
    def _handle_status_text(self, msg):
        """處理狀態文本"""
        with self.lock:
            # 檢查text是否已經是字符串，如果是bytes才需要decode
            text = msg.text
            if isinstance(text, bytes):
                text = text.decode('utf-8', errors='ignore').strip()
            elif isinstance(text, str):
                text = text.strip()
            else:
                text = str(text).strip()
            
            status_msg = {
                'timestamp': time.time(),
                'severity': msg.severity,
                'text': text
            }
            self.status_messages.append(status_msg)
            
            self._notify_data_update('status_text')
    
    def _handle_ekf_status(self, msg):
        """處理EKF狀態"""
        with self.lock:
            self.ekf_status.flags = msg.flags
            self.ekf_status.velocity_variance = msg.velocity_variance
            self.ekf_status.pos_horiz_variance = msg.pos_horiz_variance
            self.ekf_status.pos_vert_variance = msg.pos_vert_variance
            self.ekf_status.compass_variance = msg.compass_variance
            self.ekf_status.terrain_alt_variance = msg.terrain_alt_variance
            self.ekf_status.timestamp = time.time()
            
            self._notify_data_update('ekf_status')
    
    def _handle_nav_controller(self, msg):
        """處理導航控制器輸出（Rover專用）"""
        # 這是Rover特有的導航信息，可以用於顯示路徑跟踪狀態
        with self.lock:
            # 可以在這裡添加導航相關的數據處理
            pass
    
    def _on_connection_status_changed(self, connected: bool):
        """連接狀態變化回調"""
        self.is_connected = connected
        if connected:
            logger.info("遙測數據處理器已連接")
        else:
            logger.info("遙測數據處理器已斷開")
        
        self._notify_data_update('connection')
    
    def register_data_callback(self, data_type: str, callback: Callable):
        """註冊數據更新回調"""
        if data_type not in self.data_callbacks:
            self.data_callbacks[data_type] = []
        self.data_callbacks[data_type].append(callback)
    
    def _notify_data_update(self, data_type: str):
        """通知數據更新"""
        self.last_data_time = time.time()
        
        if data_type in self.data_callbacks:
            for callback in self.data_callbacks[data_type]:
                try:
                    callback(self)
                except Exception as e:
                    logger.error(f"數據回調錯誤 ({data_type}): {e}")
    
    def get_dashboard_data(self) -> Dict[str, Any]:
        """獲取儀表板所需的所有數據"""
        with self.lock:
            # 檢查連接狀態，如果未連接則返回基本資訊
            if not self.is_connected:
                return {
                    'timestamp': time.time(),
                    'connection_status': False,
                    'offline_mode': True,
                    'message': '未連接到飛控，顯示離線數據',
                    'attitude': {
                        'roll': 0,
                        'pitch': 0,
                        'yaw': 0,
                        'timestamp': time.time()
                    },
                    'velocity': {
                        'ground_speed': 0,
                        'heading': 0,
                        'climb_rate': 0,
                        'timestamp': time.time()
                    },
                    'position': {
                        'latitude': 0,
                        'longitude': 0,
                        'altitude': 0,
                        'timestamp': time.time()
                    },
                    'battery': {
                        'voltage': 0,
                        'current': 0,
                        'remaining': 0,
                        'consumed': 0,
                        'timestamp': time.time()
                    },
                    'system': {
                        'armed': False,
                        'flight_mode': 'OFFLINE',
                        'gps_status': 0,
                        'satellites': 0,
                        'load': 0,
                        'timestamp': time.time()
                    },
                    'rc_channels': {
                        'channels': [1500, 1500, 1500, 1500, 1500, 1500, 1500, 1500],
                        'rssi': 0,
                        'timestamp': time.time()
                    },
                    'servo_output': {
                        'outputs': [1500, 1500, 1500, 1500, 1500, 1500, 1500, 1500],
                        'timestamp': time.time()
                    }
                }
            
            # 正常連接情況下返回實際數據
            return {
                'timestamp': time.time(),
                'connection_status': self.is_connected,
                'attitude': {
                    'roll': self.attitude.roll_degrees,
                    'pitch': self.attitude.pitch_degrees,
                    'yaw': self.attitude.yaw_degrees,
                    'timestamp': self.attitude.timestamp
                },
                'velocity': {
                    'ground_speed': self.velocity.ground_speed,
                    'heading': self.velocity.heading,
                    'climb_rate': self.velocity.climb_rate,
                    'timestamp': self.velocity.timestamp
                },
                'position': {
                    'latitude': self.position.latitude,
                    'longitude': self.position.longitude,
                    'altitude': self.position.altitude,
                    'timestamp': self.position.timestamp
                },
                'battery': {
                    'voltage': round(self.battery.voltage, 2),
                    'current': round(self.battery.current, 2),
                    'remaining': round(self.battery.remaining, 1),
                    'consumed': round(self.battery.consumed, 0),
                    'timestamp': self.battery.timestamp
                },
                'system': {
                    'armed': self.system_status.armed,
                    'flight_mode': self.system_status.flight_mode,
                    'gps_status': self.system_status.gps_status,
                    'satellites': self.system_status.satellites_visible,
                    'load': round(self.system_status.system_load, 1),
                    'timestamp': self.system_status.timestamp
                },
                'rc_channels': {
                    'channels': self.rc_channels.channels[:8],  # 只返回前8個通道
                    'rssi': self.rc_channels.rssi,
                    'timestamp': self.rc_channels.timestamp
                },
                'servo_output': {
                    'outputs': self.servo_output.outputs[:8],   # 只返回前8個輸出
                    'timestamp': self.servo_output.timestamp
                }
            }
    
    def get_performance_chart_data(self, chart_type: str, points: int = 100) -> List[Dict]:
        """獲取性能圖表數據"""
        with self.lock:
            if chart_type == 'attitude':
                return list(self.attitude_history)[-points:]
            elif chart_type == 'velocity':
                return list(self.velocity_history)[-points:]
            elif chart_type == 'battery':
                return list(self.battery_history)[-points:]
            else:
                return []
    
    def get_status_messages(self, count: int = 20) -> List[Dict]:
        """獲取狀態消息"""
        with self.lock:
            return list(self.status_messages)[-count:]
    
    def is_connection_healthy(self) -> bool:
        """檢查連接是否健康"""
        if not self.is_connected:
            return False
        
        current_time = time.time()
        return (current_time - self.last_data_time) < 5.0  # 5秒內有數據更新

# 主遙測類（向後兼容）
class MAVLinkTelemetry(RoverTelemetryProcessor):
    """
    MAVLink遙測類 - 主接口
    """
    
    def __init__(self, connection: MAVLinkConnection):
        super().__init__(connection)
        logger.info("MAVLink遙測系統初始化完成") 