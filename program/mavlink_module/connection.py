"""
MAVLink連接管理模組 - 處理與Pixhawk Rover的連接
專門針對ArduPilot Rover系統韌體和儀表板應用優化
"""
import time
import threading
import logging
from typing import Optional, Dict, Any, Callable, List, Union
from pymavlink import mavutil
from pymavlink.dialects.v20 import ardupilotmega

# 導入配置
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))
import config

# 設定日誌
logger = logging.getLogger(__name__)

class MAVLinkConnection:
    """
    MAVLink連接管理類別 - Rover專用優化版本
    處理與Pixhawk Rover的連接、心跳檢測、斷線重連等功能
    針對儀表板應用進行數據流優化
    """
    
    def __init__(self, 
                 connection_string: Optional[str] = None, 
                 baudrate: Optional[int] = None,
                 source_system: Optional[int] = None,
                 source_component: Optional[int] = None):
        """
        初始化MAVLink連接
        
        參數:
            connection_string: MAVLink連接字串，例如 'COM22'
            baudrate: 鮑率 (串口連接時使用)
            source_system: MAVLink源系統ID
            source_component: MAVLink源組件ID
        """
        self.connection_string = connection_string or config.MAVLINK_CONNECTION_STRING
        self.baudrate = baudrate or config.MAVLINK_BAUDRATE
        self.source_system = source_system or config.MAVLINK_SOURCE_SYSTEM
        self.source_component = source_component or config.MAVLINK_SOURCE_COMPONENT
        
        # MAVLink配置
        self.buffer_size = config.MAVLINK_BUFFER_SIZE
        self.timeout = config.MAVLINK_TIMEOUT
        self.highspeed = config.MAVLINK_HIGHSPEED
        
        # 連接狀態
        self.connection = None
        self._is_connected = False  # 使用私有變數
        self.target_system = 0
        self.target_component = 0
        
        # 計時器
        self.heartbeat_timer = None
        self.reconnect_timer = None
        self.last_heartbeat = 0
        
        # 回調函數
        self.message_callbacks = {}
        self.connection_callbacks = []
        
        # 接收執行緒
        self.receive_thread = None
        self.running = False
        
        # 狀態標記
        self.stream_rates_requested = False
        self.rover_configured = False
        
        logger.info("MAVLink Rover連接管理器初始化完成")
    
    @property
    def is_connected(self) -> bool:
        """獲取連接狀態"""
        logger.debug(f"當前連接狀態: {self._is_connected}, 心跳時間: {time.time() - self.last_heartbeat:.1f}s")
        # 如果超過5秒沒有心跳，視為斷開連接
        if self._is_connected and (time.time() - self.last_heartbeat) > 5:
            logger.warning(f"心跳超時 ({time.time() - self.last_heartbeat:.1f}s)，連接可能已斷開")
            # 自動更新狀態
            if self._is_connected:
                self.is_connected = False
            return False
        return self._is_connected
    
    @is_connected.setter
    def is_connected(self, value: bool):
        """設置連接狀態"""
        if self._is_connected != value:
            logger.info(f"連接狀態變更: {self._is_connected} -> {value}")
            self._is_connected = value
            # 通知連接狀態變更
            self._notify_connection_status(value)
    
    def connect(self) -> bool:
        """
        建立與Pixhawk Rover的連接
        
        返回:
            bool: 是否成功連接
        """
        try:
            logger.info(f"嘗試連接到Rover飛控: {self.connection_string}")
            
            # 建立MAVLink連接
            self.connection = mavutil.mavlink_connection(
                self.connection_string,
                baud=self.baudrate,
                source_system=self.source_system,
                source_component=self.source_component,
                input_buffer=self.buffer_size,
                timeout=self.timeout,
                autoreconnect=False,
                force_connected=False,
                dialect=config.MAVLINK_DIALECT
            )
            
            # 串口高速模式
            if (self.highspeed and 
                self.connection_string.upper().startswith(('COM', '/DEV/TTY'))):
                logger.info("啟用串口高速模式")
            
            # 等待心跳
            logger.info("等待Rover心跳包...")
            heartbeat = self.connection.wait_heartbeat(timeout=8)
            
            if not heartbeat:
                logger.error("等待心跳超時")
                self.is_connected = False
                return False
            
            # 驗證Rover系統
            if heartbeat.type != mavutil.mavlink.MAV_TYPE_GROUND_ROVER:
                logger.warning(f"檢測到非Rover系統類型: {heartbeat.type}")
                # 仍然繼續連接，但發出警告
            
            # 設置目標系統
            self.target_system = self.connection.target_system
            self.target_component = self.connection.target_component
            
            logger.info(f"+ 成功連接到Rover系統 ID: {self.target_system}")
            
            # 更新狀態
            self.is_connected = True
            self.last_heartbeat = time.time()
            self.stream_rates_requested = False
            self.rover_configured = False
            
            # 配置Rover專用數據流
            self._configure_rover_data_streams()
            
            # 啟動心跳檢測
            self._start_heartbeat_timer()
            
            # 啟動接收執行緒
            self._start_receive_thread()
            
            # 通知連接狀態
            self._notify_connection_status(True)
            
            # 自動配置RC Override
            if config.RC_OVERRIDE_AUTO_CONFIGURE:
                self._configure_rc_override()
            
            return True
            
        except Exception as e:
            logger.error(f"連接失敗: {str(e)}")
            self.is_connected = False
            self._start_reconnect_timer()
            return False
    
    def _configure_rover_data_streams(self) -> bool:
        """
        配置Rover專用數據流，針對儀表板需求優化
        """
        if not self.is_connected or not self.connection:
            return False
        
        try:
            logger.info("配置Rover專用數據流...")
            
            # 使用MESSAGE_INTERVAL方式配置數據流
            rover_message_intervals = {
                # 姿態信息（高頻 - 儀表板核心）
                mavutil.mavlink.MAVLINK_MSG_ID_ATTITUDE: int(1000000 / 20),           # 20Hz
                
                # 位置和速度信息
                mavutil.mavlink.MAVLINK_MSG_ID_GLOBAL_POSITION_INT: int(1000000 / 10), # 10Hz
                mavutil.mavlink.MAVLINK_MSG_ID_VFR_HUD: int(1000000 / 10),             # 10Hz
                
                # Rover專用輸出
                mavutil.mavlink.MAVLINK_MSG_ID_SERVO_OUTPUT_RAW: int(1000000 / 10),    # 10Hz
                
                # RC通道（重要）
                mavutil.mavlink.MAVLINK_MSG_ID_RC_CHANNELS: int(1000000 / 10),         # 10Hz
                
                # 系統狀態
                mavutil.mavlink.MAVLINK_MSG_ID_SYS_STATUS: int(1000000 / 5),           # 5Hz
                mavutil.mavlink.MAVLINK_MSG_ID_HEARTBEAT: int(1000000 / 1),            # 1Hz
                
                # 電池狀態
                mavutil.mavlink.MAVLINK_MSG_ID_BATTERY_STATUS: int(1000000 / 2),       # 2Hz
                
                # GPS信息
                mavutil.mavlink.MAVLINK_MSG_ID_GPS_RAW_INT: int(1000000 / 5),          # 5Hz
                
                # 導航控制器輸出（Rover特有）
                mavutil.mavlink.MAVLINK_MSG_ID_NAV_CONTROLLER_OUTPUT: int(1000000 / 5), # 5Hz
                
                # EKF狀態報告
                mavutil.mavlink.MAVLINK_MSG_ID_EKF_STATUS_REPORT: int(1000000 / 2),    # 2Hz
                
                # 狀態文本
                mavutil.mavlink.MAVLINK_MSG_ID_STATUSTEXT: int(1000000 / 1),           # 1Hz
                
                # 任務狀態
                mavutil.mavlink.MAVLINK_MSG_ID_MISSION_CURRENT: int(1000000 / 1),      # 1Hz
            }
            
            success_count = 0
            for msg_id, interval in rover_message_intervals.items():
                try:
                    self.connection.mav.command_long_send(
                        self.target_system,
                        self.target_component,
                        mavutil.mavlink.MAV_CMD_SET_MESSAGE_INTERVAL,
                        0,  # confirmation
                        msg_id,     # param1: Message ID
                        interval,   # param2: Interval in microseconds
                        0, 0, 0, 0, 0  # param3-7: unused
                    )
                    success_count += 1
                    time.sleep(0.01)  # 小延遲避免發送過快
                except Exception as e:
                    logger.warning(f"設置消息間隔失敗 (ID: {msg_id}): {e}")
            
            logger.info(f"成功配置 {success_count}/{len(rover_message_intervals)} 個數據流")
            
            # 備用方法：使用舊版REQUEST_DATA_STREAM
            self._request_legacy_data_streams()
            
            self.stream_rates_requested = True
            return True
            
        except Exception as e:
            logger.error(f"配置Rover數據流失敗: {e}")
            return False
    
    def _request_legacy_data_streams(self):
        """
        使用舊版REQUEST_DATA_STREAM方式（向後兼容）
        """
        try:
            logger.debug("發送舊版數據流請求...")
            
            # Rover專用數據流配置
            stream_configs = [
                (mavutil.mavlink.MAV_DATA_STREAM_ALL, 1),           # 全部 1Hz
                (mavutil.mavlink.MAV_DATA_STREAM_RAW_SENSORS, 10),  # 原始感測器 10Hz
                (mavutil.mavlink.MAV_DATA_STREAM_EXTENDED_STATUS, 5), # 擴展狀態 5Hz
                (mavutil.mavlink.MAV_DATA_STREAM_RC_CHANNELS, 10),   # RC通道 10Hz
                (mavutil.mavlink.MAV_DATA_STREAM_POSITION, 10),     # 位置 10Hz
                (mavutil.mavlink.MAV_DATA_STREAM_EXTRA1, 20),       # 姿態 20Hz
                (mavutil.mavlink.MAV_DATA_STREAM_EXTRA2, 10),       # VFR_HUD 10Hz
                (mavutil.mavlink.MAV_DATA_STREAM_EXTRA3, 5),        # 其他 5Hz
            ]
            
            for stream_id, rate in stream_configs:
                self.connection.mav.request_data_stream_send(
                    self.target_system,
                    self.target_component,
                    stream_id,
                    rate,
                    1  # start_stop: 1=start, 0=stop
                )
                time.sleep(0.01)
                
        except Exception as e:
            logger.warning(f"舊版數據流請求失敗: {e}")
    
    def _configure_rc_override(self):
        """
        配置RC Override相關參數
        """
        try:
            logger.info("配置RC Override參數...")
            
            # 設置RC Override超時
            if config.RC_OVERRIDE_TIMEOUT != -1:
                self.send_parameter_set('RC_OVERRIDE_TIME', float(config.RC_OVERRIDE_TIMEOUT))
            
            # 確保RC Override未被禁用
            self.send_parameter_set('RC_OPTIONS', 0.0)  # 清除可能禁用RC Override的選項
            
            logger.info("RC Override配置完成")
            
        except Exception as e:
            logger.warning(f"RC Override配置失敗: {e}")
    
    def send_parameter_set(self, param_id: str, param_value: float) -> bool:
        """
        發送參數設置命令
        """
        if not self.is_connected or not self.connection:
            return False
        
        try:
            self.connection.mav.param_set_send(
                self.target_system,
                self.target_component,
                param_id.encode('ascii')[:16].ljust(16, b'\x00'),
                param_value,
                mavutil.mavlink.MAV_PARAM_TYPE_REAL32
            )
            logger.debug(f"發送參數設置: {param_id} = {param_value}")
            return True
        except Exception as e:
            logger.error(f"參數設置失敗: {e}")
            return False
    
    def send_heartbeat(self) -> bool:
        """發送心跳包"""
        if not self.is_connected or not self.connection:
            logger.debug("未連接時嘗試發送心跳包")
            return False
        
        try:
            self.connection.mav.heartbeat_send(
                self.source_system,
                self.source_component,
                mavutil.mavlink.MAV_TYPE_GCS,
                mavutil.mavlink.MAV_AUTOPILOT_INVALID,
                0, 0
            )
            return True
        except Exception as e:
            logger.error(f"發送心跳包失敗: {e}")
            return False
    
    def send_rc_override(self, channels: Dict[int, int]) -> bool:
        """
        發送RC Override命令
        
        參數:
            channels: 通道字典，格式為 {通道號: 值}
        
        返回:
            bool: 是否成功發送
        """
        if not self.is_connected or not self.connection:
            logger.warning("未連接時嘗試發送RC Override")
            return False
        
        try:
            # 創建16個通道的列表
            rc_channels = [0] * 18  # RC_CHANNELS_OVERRIDE 使用 18 個通道
            
            # 填充通道值
            for ch, value in channels.items():
                if 1 <= ch <= 18:
                    # 確保值在有效範圍內 (通常為1000-2000)
                    rc_channels[ch-1] = max(1000, min(int(value), 2000))
            
            # 發送RC_CHANNELS_OVERRIDE命令
            self.connection.mav.rc_channels_override_send(
                self.target_system,
                self.target_component,
                *rc_channels
            )
            
            logger.debug(f"已發送RC Override: {channels}")
            return True
            
        except Exception as e:
            logger.error(f"發送RC Override失敗: {e}")
            return False
    
    def clear_rc_override(self, channels: List[int] = None) -> bool:
        """
        清除RC Override
        
        參數:
            channels: 要清除的通道列表，如果為None則清除所有通道
        
        返回:
            bool: 是否成功清除
        """
        if not self.is_connected or not self.connection:
            logger.warning("未連接時嘗試清除RC Override")
            return False
        
        try:
            if channels is None:
                # 清除所有通道
                rc_channels = [0] * 18
                self.connection.mav.rc_channels_override_send(
                    self.target_system,
                    self.target_component,
                    *rc_channels
                )
                logger.debug("已清除所有RC Override通道")
            else:
                # 獲取當前RC通道值
                current_channels = {}
                
                # 清除指定通道
                for ch in channels:
                    current_channels[ch] = 0
                
                if current_channels:
                    return self.send_rc_override(current_channels)
            
            return True
            
        except Exception as e:
            logger.error(f"清除RC Override失敗: {e}")
            return False
    
    def set_message_interval(self, message_id: int, interval_us: int) -> bool:
        """
        設置消息間隔
        
        參數:
            message_id: MAVLink消息ID
            interval_us: 間隔時間 (微秒)，0表示禁用
        
        返回:
            bool: 是否成功設置
        """
        if not self.is_connected or not self.connection:
            logger.warning(f"未連接時嘗試設置消息 {message_id} 間隔")
            return False
        
        try:
            self.connection.mav.command_long_send(
                self.target_system,
                self.target_component,
                mavutil.mavlink.MAV_CMD_SET_MESSAGE_INTERVAL,
                0,  # confirmation
                message_id,     # param1: Message ID
                interval_us,    # param2: Interval in microseconds
                0, 0, 0, 0, 0   # param3-7: unused
            )
            return True
        except Exception as e:
            logger.error(f"設置消息間隔失敗: {e}")
            return False
    
    def request_data_stream(self, stream_id: int, rate_hz: int, start_stop: int = 1) -> bool:
        """
        請求數據流
        
        參數:
            stream_id: 數據流ID
            rate_hz: 頻率 (Hz)
            start_stop: 1表示開始，0表示停止
        
        返回:
            bool: 是否成功請求
        """
        if not self.is_connected or not self.connection:
            logger.warning(f"未連接時嘗試請求數據流 {stream_id}")
            return False
        
        try:
            self.connection.mav.request_data_stream_send(
                self.target_system,
                self.target_component,
                stream_id,
                rate_hz,
                start_stop
            )
            return True
        except Exception as e:
            logger.error(f"請求數據流失敗: {e}")
            return False
    
    def disconnect(self) -> None:
        """
        斷開連接
        """
        logger.info("正在斷開連接...")
        
        self.is_connected = False
        self.running = False
        
        # 停止計時器
        self._stop_heartbeat_timer()
        self._stop_reconnect_timer()
        
        # 停止接收執行緒
        self._stop_receive_thread()
        
        # 關閉連接
        if self.connection:
            try:
                self.connection.close()
            except:
                pass
            self.connection = None
        
        # 通知連接狀態
        self._notify_connection_status(False)
        
        logger.info("連接已斷開")
    
    def register_message_callback(self, message_type: str, callback: Callable) -> None:
        """
        註冊消息回調函數
        """
        if message_type not in self.message_callbacks:
            self.message_callbacks[message_type] = []
        self.message_callbacks[message_type].append(callback)
    
    def register_connection_callback(self, callback: Callable[[bool], None]) -> None:
        """
        註冊連接狀態回調函數
        """
        self.connection_callbacks.append(callback)
    
    def _start_receive_thread(self) -> None:
        """
        啟動消息接收執行緒
        """
        if self.receive_thread and self.receive_thread.is_alive():
            return
        
        self.running = True
        self.receive_thread = threading.Thread(target=self._receive_loop, daemon=True)
        self.receive_thread.start()
        logger.debug("消息接收執行緒已啟動")
    
    def _stop_receive_thread(self) -> None:
        """
        停止消息接收執行緒
        """
        self.running = False
        if self.receive_thread and self.receive_thread.is_alive():
            self.receive_thread.join(timeout=2)
        logger.debug("消息接收執行緒已停止")
    
    def _receive_loop(self) -> None:
        """
        消息接收循環
        """
        while self.running and self.is_connected:
            try:
                if not self.connection:
                    break
                
                # 接收消息
                msg = self.connection.recv_match(blocking=False, timeout=0.1)
                
                if msg:
                    self._process_message(msg)
                    
            except Exception as e:
                if self.running:
                    logger.error(f"消息接收錯誤: {e}")
                    time.sleep(0.1)
    
    def _process_message(self, msg) -> None:
        """處理接收到的MAVLink消息"""
        try:
            if not msg:
                return
                
            # 記錄心跳
            if msg.get_type() == 'HEARTBEAT':
                self.last_heartbeat = time.time()
                
                # 檢查連接狀態
                if not self._is_connected:
                    logger.info(f"收到心跳，重新設置連接狀態")
                    self.is_connected = True
                    
                # 如果是首次收到心跳，初始化系統配置
                if not self.rover_configured:
                    self._configure_rover_data_streams()
                    self.rover_configured = True
            
            # 調用對應消息類型的回調函數
            msg_type = msg.get_type()
            if msg_type in self.message_callbacks:
                for callback in self.message_callbacks[msg_type]:
                    try:
                        callback(msg)
                    except Exception as e:
                        logger.error(f"{msg_type} 消息回調處理錯誤: {e}")
        
        except Exception as e:
            logger.error(f"消息處理錯誤: {e}")
    
    def _start_heartbeat_timer(self) -> None:
        """
        啟動心跳檢測計時器
        """
        self.last_heartbeat = time.time()
        self._heartbeat_timer_callback()
    
    def _heartbeat_timer_callback(self) -> None:
        """定期發送心跳信號"""
        try:
            if self.connection and self.is_connected:
                # 發送心跳並檢查連接狀態
                self.connection.mav.heartbeat_send(
                    mavutil.mavlink.MAV_TYPE_GCS,
                    mavutil.mavlink.MAV_AUTOPILOT_INVALID,
                    0, 0, 0
                )
                
                # 檢查上次心跳的時間
                if (time.time() - self.last_heartbeat) > 5:
                    logger.warning(f"檢測到心跳丟失 ({time.time() - self.last_heartbeat:.1f}s)")
                    # 如果超過5秒無心跳，嘗試重連
                    self.is_connected = False
                    self._start_reconnect_timer()
                
        except Exception as e:
            logger.error(f"心跳包發送錯誤: {e}")
            self.is_connected = False
            self._start_reconnect_timer()
        finally:
            # 持續運行定時器
            self.heartbeat_timer = threading.Timer(1.0, self._heartbeat_timer_callback)
            self.heartbeat_timer.daemon = True
            self.heartbeat_timer.start()
    
    def _stop_heartbeat_timer(self) -> None:
        """
        停止心跳檢測計時器
        """
        if self.heartbeat_timer:
            self.heartbeat_timer.cancel()
            self.heartbeat_timer = None
    
    def _start_reconnect_timer(self) -> None:
        """
        啟動重連計時器
        """
        self._stop_reconnect_timer()
        self.reconnect_timer = threading.Timer(5.0, self._reconnect_timer_callback)
        self.reconnect_timer.start()
        logger.info("將在5秒後嘗試重連...")
    
    def _stop_reconnect_timer(self) -> None:
        """
        停止重連計時器
        """
        if self.reconnect_timer:
            self.reconnect_timer.cancel()
            self.reconnect_timer = None
    
    def _reconnect_timer_callback(self) -> None:
        """
        重連計時器回調
        """
        logger.info("嘗試重新連接...")
        if not self.connect():
            self._start_reconnect_timer()
    
    def _notify_connection_status(self, connected: bool) -> None:
        """
        通知連接狀態變化
        """
        for callback in self.connection_callbacks:
            try:
                callback(connected)
            except Exception as e:
                logger.error(f"連接狀態回調錯誤: {e}")
    
    @property
    def is_rover_configured(self) -> bool:
        """
        返回Rover是否已配置完成
        """
        return self.rover_configured and self.stream_rates_requested 