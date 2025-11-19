"""
MAVLink模組 - Pixhawk2.4.8 Rover通訊模組
提供與ArduPilot Rover韌體的MAVLink通訊功能
"""

from .connection import MAVLinkConnection
from .telemetry import MAVLinkTelemetry  
from .rover_controller import RoverController

__all__ = [
    'MAVLinkConnection',
    'MAVLinkTelemetry',
    'RoverController'
]

__version__ = '1.0.0' 