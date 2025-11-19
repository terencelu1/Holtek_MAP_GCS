"""
Rover控制器模組 - 專門處理ArduPilot Rover的控制功能
包含RC Override、模式切換、安全功能等
"""
import time
import threading
import logging
from typing import Optional, Dict, Any, List, Callable
from enum import Enum

# 導入配置
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))
import config

from .connection import MAVLinkConnection
from .telemetry import MAVLinkTelemetry

# 設定日誌
logger = logging.getLogger(__name__)

class RoverMode(Enum):
    """Rover飛行模式枚舉"""
    MANUAL = 0
    ACRO = 1
    LEARNING = 2
    STEERING = 3
    HOLD = 4
    LOITER = 5
    FOLLOW = 6
    SIMPLE = 7
    DOCK = 8
    CIRCLE = 9
    AUTO = 10
    RTL = 11
    SMART_RTL = 12
    GUIDED = 15
    INITIALISING = 16

class RoverController:
    """
    ArduPilot Rover控制器
    提供Rover專用的控制功能，包含RC Override和模式切換
    """
    
    def __init__(self, connection: MAVLinkConnection, telemetry: MAVLinkTelemetry):
        self.connection = connection
        self.telemetry = telemetry
        self.lock = threading.RLock()
        
        # RC Override狀態
        self.rc_override_active = False
        self.rc_override_channels = {}
        self.rc_override_timer = None
        self.last_rc_override_time = 0
        
        # 安全狀態
        self.emergency_stop_active = False
        self.safety_limits_enabled = True
        
        # 控制回調
        self.control_callbacks = {}
        
        # Rover專用參數
        self.rover_parameters = {
            'WP_SPEED': 2.0,           # 航點速度 (m/s)
            'TURN_MAX_G': 0.2,         # 最大轉彎G力
            'SPEED_TURN_GAIN': 50,     # 轉彎速度增益
            'SPEED_TURN_DIST': 2.0,    # 轉彎距離
        }
        
        logger.info("Rover控制器初始化完成")
    
    def configure_data_streams(self) -> bool:
        """
        配置Rover專用數據流
        """
        try:
            logger.info("配置Rover專用數據流...")
            
            # 調用連接器的配置方法
            if hasattr(self.connection, '_configure_rover_data_streams'):
                return self.connection._configure_rover_data_streams()
            
            return True
            
        except Exception as e:
            logger.error(f"配置數據流失敗: {e}")
            return False
    
    def enable_rc_override(self) -> bool:
        """
        啟用RC Override功能
        """
        try:
            logger.info("啟用RC Override功能")
            # 這裡可以添加特定的啟用邏輯，如設置參數等
            return True
        except Exception as e:
            logger.error(f"啟用RC Override失敗: {e}")
            return False
    
    def disable_rc_override(self) -> bool:
        """
        停用RC Override功能
        """
        try:
            logger.info("停用RC Override功能")
            # 清除所有RC Override
            self.clear_rc_override()
            return True
        except Exception as e:
            logger.error(f"停用RC Override失敗: {e}")
            return False
    
    def set_rc_override(self, channels: Dict[int, int], timeout: float = None) -> bool:
        """
        設置RC Override
        
        參數:
            channels: {通道號: PWM值} 字典
            timeout: 超時時間（秒），None表示使用默認值
        """
        if not self.connection.is_connected:
            logger.error("RC Override失敗: 未連接")
            return False
        
        with self.lock:
            try:
                # 安全檢查
                if not self._check_rc_override_safety(channels):
                    return False
                
                # 應用安全限制
                safe_channels = self._apply_safety_limits(channels)
                
                # 發送RC Override命令
                if self.connection.send_rc_override(safe_channels):
                    self.rc_override_channels.update(safe_channels)
                    self.rc_override_active = True
                    self.last_rc_override_time = time.time()
                    
                    # 設置或重置安全計時器
                    self._reset_rc_override_timer(timeout)
                    
                    logger.debug(f"RC Override設置成功: {safe_channels}")
                    self._notify_control_update('rc_override', safe_channels)
                    return True
                else:
                    logger.error("RC Override命令發送失敗")
                    return False
                
            except Exception as e:
                logger.error(f"RC Override設置失敗: {e}")
                return False
    
    def clear_rc_override(self, channels: List[int] = None) -> bool:
        """
        清除RC Override
        
        參數:
            channels: 要清除的通道列表，None表示清除所有
        """
        with self.lock:
            try:
                if channels is None:
                    # 清除所有通道
                    clear_channels = {i: 65535 for i in range(1, 9)}
                    self.rc_override_channels.clear()
                else:
                    # 清除指定通道
                    clear_channels = {ch: 65535 for ch in channels if 1 <= ch <= 8}
                    for ch in channels:
                        self.rc_override_channels.pop(ch, None)
                
                # 發送清除命令
                if self.connection.send_rc_override(clear_channels):
                    if not self.rc_override_channels:
                        self.rc_override_active = False
                        self._stop_rc_override_timer()
                    
                    logger.debug(f"RC Override清除成功: {list(clear_channels.keys())}")
                    self._notify_control_update('rc_override_clear', clear_channels)
                    return True
                else:
                    logger.error("RC Override清除命令發送失敗")
                    return False
                
            except Exception as e:
                logger.error(f"RC Override清除失敗: {e}")
                return False
    
    def set_rover_throttle(self, throttle_percent: float) -> bool:
        """
        設置Rover油門
        
        參數:
            throttle_percent: 油門百分比 (-100 到 100)
        """
        # 限制範圍
        throttle_percent = max(-100, min(100, throttle_percent))
        
        # 轉換為PWM值 (1000-2000, 中心點1500)
        pwm_value = int(1500 + throttle_percent * 5)
        
        return self.set_rc_override({config.RC_CHANNELS['THROTTLE']: pwm_value})
    
    def set_rover_steering(self, steering_percent: float) -> bool:
        """
        設置Rover轉向
        
        參數:
            steering_percent: 轉向百分比 (-100 到 100)
        """
        # 限制範圍
        steering_percent = max(-100, min(100, steering_percent))
        
        # 轉換為PWM值
        pwm_value = int(1500 + steering_percent * 5)
        
        return self.set_rc_override({config.RC_CHANNELS['STEERING']: pwm_value})
    
    def set_rover_movement(self, throttle_percent: float, steering_percent: float) -> bool:
        """
        設置Rover運動（油門+轉向）
        
        參數:
            throttle_percent: 油門百分比 (-100 到 100)
            steering_percent: 轉向百分比 (-100 到 100)
        """
        # 限制範圍
        throttle_percent = max(-100, min(100, throttle_percent))
        steering_percent = max(-100, min(100, steering_percent))
        
        # 轉換為PWM值
        throttle_pwm = int(1500 + throttle_percent * 5)
        steering_pwm = int(1500 + steering_percent * 5)
        
        channels = {
            config.RC_CHANNELS['THROTTLE']: throttle_pwm,
            config.RC_CHANNELS['STEERING']: steering_pwm
        }
        
        return self.set_rc_override(channels)
    
    def emergency_stop(self) -> bool:
        """
        緊急停止
        """
        try:
            logger.warning("執行緊急停止")
            
            # 設置緊急停止狀態
            self.emergency_stop_active = True
            
            # 立即停止所有運動
            self.clear_rc_override()
            
            # 切換到HOLD模式
            self.set_flight_mode(RoverMode.HOLD)
            
            logger.info("緊急停止執行成功")
            self._notify_control_update('emergency_stop', True)
            return True
            
        except Exception as e:
            logger.error(f"緊急停止失敗: {e}")
            return False
    
    def release_emergency_stop(self) -> bool:
        """
        解除緊急停止
        """
        try:
            self.emergency_stop_active = False
            logger.info("緊急停止狀態已解除")
            self._notify_control_update('emergency_stop', False)
            return True
        except Exception as e:
            logger.error(f"解除緊急停止失敗: {e}")
            return False
    
    def set_flight_mode(self, mode) -> bool:
        """
        設置飛行模式
        
        參數:
            mode: RoverMode枚舉值或整數
        """
        if not self.connection.is_connected:
            logger.error("模式切換失敗: 未連接")
            return False
        
        try:
            # 處理輸入參數類型
            if isinstance(mode, RoverMode):
                mode_value = mode.value
                mode_name = mode.name
            elif isinstance(mode, int):
                mode_value = mode
                # 從枚舉中查找名稱
                try:
                    mode_name = RoverMode(mode).name
                except ValueError:
                    mode_name = f"UNKNOWN({mode})"
            else:
                logger.error(f"無效的模式類型: {type(mode)}")
                return False
            
            # 發送模式切換命令
            self.connection.connection.mav.set_mode_send(
                self.connection.target_system,
                1,  # base_mode (MAV_MODE_FLAG_CUSTOM_MODE_ENABLED)
                mode_value  # custom_mode
            )
            
            logger.info(f"切換到模式: {mode_name}")
            self._notify_control_update('flight_mode', mode_name)
            return True
            
        except Exception as e:
            logger.error(f"模式切換失敗: {e}")
            return False
    
    def arm_vehicle(self) -> bool:
        """
        武裝載具
        """
        try:
            self.connection.connection.mav.command_long_send(
                self.connection.target_system,
                self.connection.target_component,
                400,  # MAV_CMD_COMPONENT_ARM_DISARM
                0,    # confirmation
                1,    # arm
                0, 0, 0, 0, 0, 0
            )
            
            logger.info("發送武裝命令")
            self._notify_control_update('arm', True)
            return True
            
        except Exception as e:
            logger.error(f"武裝失敗: {e}")
            return False
    
    def disarm_vehicle(self) -> bool:
        """
        解除武裝
        """
        try:
            self.connection.connection.mav.command_long_send(
                self.connection.target_system,
                self.connection.target_component,
                400,  # MAV_CMD_COMPONENT_ARM_DISARM
                0,    # confirmation
                0,    # disarm
                0, 0, 0, 0, 0, 0
            )
            
            logger.info("發送解除武裝命令")
            self._notify_control_update('arm', False)
            return True
            
        except Exception as e:
            logger.error(f"解除武裝失敗: {e}")
            return False
    
    def _check_rc_override_safety(self, channels: Dict[int, int]) -> bool:
        """
        檢查RC Override安全性
        """
        if self.emergency_stop_active:
            logger.warning("緊急停止狀態下禁止RC Override")
            return False
        
        # 檢查系統是否武裝（可選）
        if hasattr(self.telemetry, 'system_status') and not self.telemetry.system_status.armed:
            logger.debug("載具未武裝，允許RC Override")
        
        return True
    
    def _apply_safety_limits(self, channels: Dict[int, int]) -> Dict[int, int]:
        """
        應用安全限制
        """
        if not self.safety_limits_enabled:
            return channels
        
        safe_channels = {}
        
        for channel, value in channels.items():
            if channel == config.RC_CHANNELS['THROTTLE']:
                # 油門限制
                max_throttle = config.SAFETY_LIMITS['max_throttle_override']
                min_throttle = 2000 - max_throttle + 1000  # 對稱限制
                value = max(min_throttle, min(max_throttle, value))
            
            elif channel == config.RC_CHANNELS['STEERING']:
                # 轉向限制
                max_steering = config.SAFETY_LIMITS['max_steering_override']
                min_steering = 2000 - max_steering + 1000  # 對稱限制
                value = max(min_steering, min(max_steering, value))
            
            # 通用PWM範圍限制
            value = max(config.RC_OVERRIDE_MIN, min(config.RC_OVERRIDE_MAX, value))
            safe_channels[channel] = value
        
        return safe_channels
    
    def _reset_rc_override_timer(self, timeout: float = None):
        """
        重置RC Override安全計時器
        """
        self._stop_rc_override_timer()
        
        timeout = timeout or config.RC_OVERRIDE_SAFETY_TIMEOUT
        if timeout > 0:
            self.rc_override_timer = threading.Timer(timeout, self._rc_override_timeout)
            self.rc_override_timer.start()
    
    def _stop_rc_override_timer(self):
        """
        停止RC Override計時器
        """
        if self.rc_override_timer:
            self.rc_override_timer.cancel()
            self.rc_override_timer = None
    
    def _rc_override_timeout(self):
        """
        RC Override超時處理
        """
        with self.lock:
            logger.warning("RC Override安全超時，自動清除")
            self.clear_rc_override()
    
    def register_control_callback(self, event_type: str, callback: Callable):
        """
        註冊控制事件回調
        """
        if event_type not in self.control_callbacks:
            self.control_callbacks[event_type] = []
        self.control_callbacks[event_type].append(callback)
    
    def _notify_control_update(self, event_type: str, data: Any):
        """
        通知控制事件更新
        """
        if event_type in self.control_callbacks:
            for callback in self.control_callbacks[event_type]:
                try:
                    callback(event_type, data)
                except Exception as e:
                    logger.error(f"控制回調錯誤 ({event_type}): {e}")
    
    def get_control_status(self) -> Dict[str, Any]:
        """
        獲取控制狀態
        """
        with self.lock:
            return {
                'rc_override_active': self.rc_override_active,
                'rc_override_channels': dict(self.rc_override_channels),
                'emergency_stop_active': self.emergency_stop_active,
                'safety_limits_enabled': self.safety_limits_enabled,
                'last_rc_override_time': self.last_rc_override_time,
                'timestamp': time.time()
            }
    
    def get_rover_status(self) -> Dict[str, Any]:
        """
        獲取Rover狀態信息
        """
        status = {
            'connection_status': self.connection.is_connected,
            'control_status': self.get_control_status(),
            'timestamp': time.time()
        }
        
        # 添加遙測數據
        if hasattr(self.telemetry, 'get_dashboard_data'):
            status.update(self.telemetry.get_dashboard_data())
        
        return status
    
    def enable_safety_limits(self, enable: bool = True):
        """
        啟用/禁用安全限制
        """
        self.safety_limits_enabled = enable
        logger.info(f"安全限制 {'啟用' if enable else '禁用'}")
    
    def __del__(self):
        """
        析構函數，清理資源
        """
        try:
            self._stop_rc_override_timer()
            self.clear_rc_override()
        except:
            pass 