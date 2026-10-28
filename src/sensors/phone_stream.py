"""
Phone sensor streaming via Phyphox Android app REST API.
Connects to the phone over any local Wi-Fi network or mobile hotspot to receive
accelerometer, gyroscope, and optional magnetometer data.

Key Features:
- Universal Configurable Base URL: Accepts full URLs (e.g. http://192.168.43.1:8080) or host/IP strings.
- Dynamic Sensor Buffer Discovery: Reads actual JSON from Phyphox to detect buffer names
  for both Accelerometer (accX, acc_x, lin_acc, etc.) and Gyroscope (gyrX, gyroX, wX, etc.).
- Dual Sensor Status: Separate connection and data-availability reporting for accelerometer & gyroscope.
- Robust URL Construction: Prevents duplicate paths, ports, or protocols.
- Incremental Buffer Sync: Efficient delta sample syncing.
- Hardware Disconnection Resilience: Surfaces clear network diagnostics (timeout, unreachable host,
  missing buffers, client isolation) without falling back to fake simulated data.
"""

import requests
import numpy as np
import time
import re
import urllib.parse
from dataclasses import dataclass, field
from typing import Optional, Tuple, Dict, Any, List

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))
import config


@dataclass
class SensorFrame:
    """
    Standardized multi-channel sensor frame.
    All data arrays represent synchronized time windows.
    """
    timestamp: float
    time_vector: np.ndarray       # Relative or absolute seconds
    # Accelerometer channels in m/s^2
    accel_x: np.ndarray
    accel_y: np.ndarray
    accel_z: np.ndarray
    # Gyroscope channels in rad/s (empty if not available in current experiment)
    gyro_x: np.ndarray
    gyro_y: np.ndarray
    gyro_z: np.ndarray
    # Optional Magnetometer channels in microteslas (empty if not available)
    mag_x: Optional[np.ndarray] = None
    mag_y: Optional[np.ndarray] = None
    mag_z: Optional[np.ndarray] = None
    # Acoustic samples (None if experiment does NOT provide real microphone data)
    audio_samples: Optional[np.ndarray] = None
    audio_sample_rate: int = 0
    audio_source_type: str = "none"   # "phyphox_audio", "none"
    # Metadata & Diagnostics
    activity_label: str = "live"
    true_br: float = 0.0          # Only non-zero in synthetic/controlled datasets
    is_synthetic: bool = False
    measured_sample_rate: float = 50.0
    raw_sensor_sample_rate: float = 50.0
    missing_samples_count: int = 0
    is_saturated: bool = False
    saturation_flags: Dict[str, bool] = field(default_factory=dict)
    has_gyro: bool = False
    has_mag: bool = False
    has_audio: bool = False


class ConnectionDiagnostic(dict):
    """
    Diagnostic dictionary supporting 2-tuple unpacking for backward compatibility.
    Allows:
        diag["success"], diag["latency_ms"], diag.get("has_accel")
    And:
        success, msg = stream.test_connection()
    """
    def __iter__(self):
        yield self.get("success", False)
        yield self.get("message", "")


class PhyphoxStream:
    """
    High-performance client for Phyphox remote access REST API.
    Designed for zero-lag real-time streaming over any Wi-Fi or mobile hotspot.
    """

    @staticmethod
    def parse_endpoint(raw_input: str, default_port: int = 8080) -> Tuple[str, int, str]:
        """
        Safely sanitizes any user-entered Phyphox endpoint string.
        Handles full URLs (http://192.168.43.1:8080/), host:port, IPv4, IPv6, or raw IPs.
        Guarantees NO duplicated ports, duplicate protocols, or dangling paths.
        
        Returns:
            Tuple[host, port, base_url]
        """
        if not raw_input or not str(raw_input).strip():
            return "", default_port, ""

        s = str(raw_input).strip()
        
        # Ensure scheme for urlparse if missing
        if not re.match(r'^[a-zA-Z]+://', s):
            s = f"http://{s}"
            
        try:
            parsed = urllib.parse.urlsplit(s)
            host = parsed.hostname or ""
            port = parsed.port or default_port
            
            # Clean up bracket notation for IPv6 if present
            clean_host = host.strip("[]")
            if not clean_host:
                return "", default_port, ""
                
            base_url = f"http://{clean_host}:{port}"
            return clean_host, port, base_url
        except Exception:
            # Fallback regex sanitization
            clean = re.sub(r'^https?://', '', s, flags=re.IGNORECASE)
            clean = clean.split('/')[0] # Remove path
            if ':' in clean:
                parts = clean.split(':')
                return parts[0], int(parts[1]) if parts[1].isdigit() else default_port, f"http://{parts[0]}:{parts[1]}"
            return clean, default_port, f"http://{clean}:{default_port}"

    @staticmethod
    def clean_ip_and_port(raw_ip: str, default_port: int = 8080) -> Tuple[str, int]:
        """Legacy helper maintained for backward compatibility."""
        host, port, _ = PhyphoxStream.parse_endpoint(raw_ip, default_port)
        return host, port

    def __init__(self, phone_ip: str = None, port: int = None, base_url: str = None, endpoint: str = None, timeout: float = None):
        target_input = endpoint or base_url or phone_ip or getattr(config, 'PHONE_IP', '')
        self.default_timeout = float(timeout) if timeout is not None else 3.0
        self.phone_ip, self.port, self.base_url = self.parse_endpoint(target_input, int(port or config.PHYPHOX_PORT))
        
        self.connected = False
        self.last_status_message = "Not connected"
        self.last_error = None
        self.last_success_time = None
        
        # Reusable HTTP session with short connection pooling
        self.session = requests.Session()
        
        # Incremental tracking pointers
        self.last_t: Optional[float] = None
        self.last_gyro_t: Optional[float] = None
        self.use_incremental = False
        
        # Target DSP sampling rate
        self.target_fs = float(config.SAMPLE_RATE_ACCEL)  # 50 Hz
        
        # Rolling raw buffers
        self.buf_t = np.array([], dtype=float)
        self.buf_x = np.array([], dtype=float)
        self.buf_y = np.array([], dtype=float)
        self.buf_z = np.array([], dtype=float)
        self.buf_gx = np.array([], dtype=float)
        self.buf_gy = np.array([], dtype=float)
        self.buf_gz = np.array([], dtype=float)
        self.buf_gt = np.array([], dtype=float)
        
        # Dynamic Sensor Buffer Mapping
        self.has_accel = False
        self.has_gyro = False
        self.has_mag = False
        self.has_audio = False
        self.measured_raw_fs = self.target_fs
        
        # Identified buffer names in current Phyphox experiment
        self.discovered_buffers: List[str] = []
        self.accel_keys: Dict[str, Optional[str]] = {"x": None, "y": None, "z": None, "t": None}
        self.gyro_keys: Dict[str, Optional[str]] = {"x": None, "y": None, "z": None, "t": None}

    def set_endpoint(self, endpoint_input: str, port: int = None):
        """Sets and re-normalizes the Phyphox endpoint."""
        self.phone_ip, self.port, self.base_url = self.parse_endpoint(endpoint_input, int(port or self.port or 8080))
        self.last_t = None
        self.last_gyro_t = None
        self.use_incremental = False
        self.discovered_buffers = []
        self.has_accel = False
        self.has_gyro = False
        self.buf_t = np.array([], dtype=float)
        self.buf_x = np.array([], dtype=float)
        self.buf_y = np.array([], dtype=float)
        self.buf_z = np.array([], dtype=float)
        self.buf_gx = np.array([], dtype=float)
        self.buf_gy = np.array([], dtype=float)
        self.buf_gz = np.array([], dtype=float)
        self.buf_gt = np.array([], dtype=float)

    def build_url(self, path: str, query: str = "") -> str:
        """Constructs an exact URL without path or port duplication."""
        clean_path = "/" + path.lstrip("/")
        base = self.base_url.rstrip("/")
        if query:
            clean_query = query.lstrip("?&")
            return f"{base}{clean_path}?{clean_query}"
        return f"{base}{clean_path}"

    def discover_sensor_buffers(self, buffer_dict: Dict[str, Any]) -> Dict[str, Any]:
        """
        Dynamically analyzes the active JSON buffer keys returned by Phyphox.
        Identifies actual names for Accelerometer and Gyroscope without hardcoded assumptions.
        """
        keys = list(buffer_dict.keys())
        self.discovered_buffers = keys
        
        lower_map = {k.lower(): k for k in keys}
        
        # 1. Identify Accelerometer Buffer Names
        accel_x = None
        for cand in ["accx", "acc_x", "lin_accx", "linear_accx", "accel_x", "acceleration_x"]:
            if cand in lower_map:
                accel_x = lower_map[cand]
                break
        if not accel_x:
            # Fallback: key contains acc and ends with x
            for lk, orig in lower_map.items():
                if "acc" in lk and (lk.endswith("x") or "_x" in lk):
                    accel_x = orig
                    break

        accel_y = None
        for cand in ["accy", "acc_y", "lin_accy", "linear_accy", "accel_y", "acceleration_y"]:
            if cand in lower_map:
                accel_y = lower_map[cand]
                break
        if not accel_y:
            for lk, orig in lower_map.items():
                if "acc" in lk and (lk.endswith("y") or "_y" in lk):
                    accel_y = orig
                    break

        accel_z = None
        for cand in ["accz", "acc_z", "lin_accz", "linear_accz", "accel_z", "acceleration_z"]:
            if cand in lower_map:
                accel_z = lower_map[cand]
                break
        if not accel_z:
            for lk, orig in lower_map.items():
                if "acc" in lk and (lk.endswith("z") or "_z" in lk):
                    accel_z = orig
                    break

        accel_t = None
        for cand in ["acc_time", "t", "time", "lin_acc_time", "timestamp"]:
            if cand in lower_map:
                accel_t = lower_map[cand]
                break

        self.accel_keys = {"x": accel_x, "y": accel_y, "z": accel_z, "t": accel_t}
        self.has_accel = bool(accel_z and (accel_x or accel_y))

        # 2. Identify Gyroscope Buffer Names Dynamically
        gyro_x = None
        for cand in ["gyrx", "gyr_x", "gyrox", "gyro_x", "wx", "w_x", "rotx", "rot_x", "angular_rate_x", "angular_velocity_x"]:
            if cand in lower_map:
                gyro_x = lower_map[cand]
                break
        if not gyro_x:
            for lk, orig in lower_map.items():
                if any(w in lk for w in ["gyr", "gyro", "rot"]) and (lk.endswith("x") or "_x" in lk):
                    gyro_x = orig
                    break

        gyro_y = None
        for cand in ["gyry", "gyr_y", "gyroy", "gyro_y", "wy", "w_y", "roty", "rot_y", "angular_rate_y", "angular_velocity_y"]:
            if cand in lower_map:
                gyro_y = lower_map[cand]
                break
        if not gyro_y:
            for lk, orig in lower_map.items():
                if any(w in lk for w in ["gyr", "gyro", "rot"]) and (lk.endswith("y") or "_y" in lk):
                    gyro_y = orig
                    break

        gyro_z = None
        for cand in ["gyrz", "gyr_z", "gyroz", "gyro_z", "wz", "w_z", "rotz", "rot_z", "angular_rate_z", "angular_velocity_z"]:
            if cand in lower_map:
                gyro_z = lower_map[cand]
                break
        if not gyro_z:
            for lk, orig in lower_map.items():
                if any(w in lk for w in ["gyr", "gyro", "rot"]) and (lk.endswith("z") or "_z" in lk):
                    gyro_z = orig
                    break

        gyro_t = None
        for cand in ["gyr_time", "gyro_time", "w_time", "time", "acc_time", "t"]:
            if cand in lower_map:
                gyro_t = lower_map[cand]
                break

        self.gyro_keys = {"x": gyro_x, "y": gyro_y, "z": gyro_z, "t": gyro_t}
        self.has_gyro = bool(gyro_x and gyro_y and gyro_z)

        # 3. Probe for Audio / Microphone Buffers in this experiment
        audio_buf = None
        for cand in ["audio", "mic", "microphone", "sound", "sound_level", "amplitude", "intensity", "db", "spl", "spectrum"]:
            if cand in lower_map:
                audio_buf = lower_map[cand]
                break
        self.audio_key = audio_buf
        self.has_audio = bool(audio_buf)

        return {
            "all_buffers": keys,
            "has_accel": self.has_accel,
            "accel_keys": self.accel_keys,
            "has_gyro": self.has_gyro,
            "gyro_keys": self.gyro_keys,
            "has_audio": self.has_audio,
            "audio_key": self.audio_key,
        }

    def test_connection(self, probe_timeout: float = None) -> ConnectionDiagnostic:
        """
        Check reachability of Phyphox phone server.
        Returns a ConnectionDiagnostic (which supports both dict indexing and 2-tuple unpacking).
        """
        timeout = float(probe_timeout) if probe_timeout is not None else getattr(self, "default_timeout", 3.0)
        if not self.base_url or not self.phone_ip:
            msg = "Phyphox Base URL is empty. Please enter the URL displayed on your phone in Phyphox."
            return ConnectionDiagnostic({
                "success": False,
                "message": msg,
                "error_type": "EMPTY_URL",
                "base_url": self.base_url,
                "has_accel": False,
                "has_gyro": False,
                "buffer_names": [],
                "accel_status": "DISCONNECTED",
                "gyro_status": "DISCONNECTED",
                "latency_ms": 0,
            })

        t0 = time.time()
        # 1. Probe /get with no parameters to obtain all active buffers
        try:
            target_url = self.build_url("/get")
            r = self.session.get(target_url, timeout=timeout)
            latency_ms = int((time.time() - t0) * 1000)

            if r.status_code == 200:
                self.connected = True
                self.last_success_time = time.time()
                self.last_error = None
                
                try:
                    data = r.json()
                    buf = data.get("buffer", {}) if isinstance(data, dict) else {}
                    discovery = self.discover_sensor_buffers(buf)
                    
                    has_accel = discovery["has_accel"]
                    has_gyro = discovery["has_gyro"]
                    all_buffers = discovery["all_buffers"]

                    # Start remote experiment automatically
                    self.start_experiment()

                    if len(all_buffers) == 0:
                        warn_msg = "Connected to Phyphox webserver, but no active sensor buffers found. Open 'Acceleration with g' or 'Raw Sensors' in Phyphox and press Play (▶)."
                        return ConnectionDiagnostic({
                            "success": False,
                            "message": warn_msg,
                            "error_type": "NO_SENSOR_BUFFERS",
                            "latency_ms": latency_ms,
                            "has_accel": False,
                            "has_gyro": False,
                            "accel_status": "NOT DETECTED",
                            "gyro_status": "NOT IN EXPERIMENT",
                            "buffer_names": [],
                            "endpoint": self.base_url,
                            "phone_ip": self.phone_ip,
                            "port": self.port,
                        })

                    if not has_accel:
                        warn_msg = f"Connected to Phyphox, but accelerometer buffers missing. Detected: {all_buffers}. Please open 'Acceleration with g' or 'Raw Sensors'."
                        return ConnectionDiagnostic({
                            "success": False,
                            "message": warn_msg,
                            "error_type": "NO_ACCEL_BUFFERS",
                            "latency_ms": latency_ms,
                            "has_accel": False,
                            "has_gyro": has_gyro,
                            "accel_status": "NOT DETECTED",
                            "gyro_status": "ACTIVE" if has_gyro else "NOT IN EXPERIMENT",
                            "buffer_names": all_buffers,
                            "endpoint": self.base_url,
                            "phone_ip": self.phone_ip,
                            "port": self.port,
                        })

                    accel_msg = "Accelerometer ACTIVE"
                    gyro_msg = "Gyroscope ACTIVE" if has_gyro else "Gyroscope not in active experiment (select 'Raw Sensors' in Phyphox to enable)"
                    success_msg = f"Connected to Phyphox at {self.base_url} ({latency_ms}ms latency). [{accel_msg} • {gyro_msg}]"
                    self.last_status_message = success_msg
                    
                    return ConnectionDiagnostic({
                        "success": True,
                        "message": success_msg,
                        "latency_ms": latency_ms,
                        "has_accel": has_accel,
                        "has_gyro": has_gyro,
                        "accel_status": "ACTIVE",
                        "gyro_status": "ACTIVE" if has_gyro else "NOT IN EXPERIMENT",
                        "buffer_names": all_buffers,
                        "endpoint": self.base_url,
                        "phone_ip": self.phone_ip,
                        "port": self.port,
                        "error_type": None,
                    })
                except Exception as json_err:
                    msg = f"Connected to {self.base_url}, but response was not valid Phyphox JSON: {str(json_err)}"
                    return ConnectionDiagnostic({
                        "success": False,
                        "message": msg,
                        "error_type": "MALFORMED_JSON",
                        "latency_ms": latency_ms,
                        "has_accel": False,
                        "has_gyro": False,
                        "buffer_names": [],
                    })
            else:
                msg = f"HTTP {r.status_code} returned by {self.base_url}. Verify Phyphox experiment is open."
                return ConnectionDiagnostic({
                    "success": False,
                    "message": msg,
                    "error_type": f"HTTP_{r.status_code}",
                    "latency_ms": latency_ms,
                    "has_accel": False,
                    "has_gyro": False,
                    "buffer_names": [],
                })

        except requests.exceptions.ConnectTimeout:
            msg = (
                f"Connection timed out reaching {self.base_url}. "
                "Ensure: (1) Phone and computer are on the same Wi-Fi or mobile hotspot; "
                "(2) 'Allow remote access' is ON in Phyphox; "
                "(3) Router Wi-Fi client isolation or firewall is not blocking port 8080."
            )
            self.connected = False
            self.last_error = msg
            return ConnectionDiagnostic({
                "success": False,
                "message": msg,
                "error_type": "TIMEOUT",
                "has_accel": False,
                "has_gyro": False,
                "buffer_names": [],
            })

        except requests.exceptions.ConnectionError as ce:
            msg = (
                f"Cannot reach or connect to {self.base_url} ({str(ce)}). "
                "Ensure: (1) You entered the exact IP shown in Phyphox on this network; "
                "(2) Phyphox is actively running with remote access enabled."
            )
            self.connected = False
            self.last_error = msg
            return ConnectionDiagnostic({
                "success": False,
                "message": msg,
                "error_type": "CONNECTION_REFUSED",
                "has_accel": False,
                "has_gyro": False,
                "buffer_names": [],
            })

        except Exception as e:
            msg = f"Cannot reach {self.base_url}: {str(e)}"
            self.connected = False
            self.last_error = msg
            return ConnectionDiagnostic({
                "success": False,
                "message": msg,
                "error_type": "UNKNOWN",
                "has_accel": False,
                "has_gyro": False,
                "buffer_names": [],
            })

    def start_experiment(self):
        """Start recording remotely on the phone."""
        try:
            self.session.get(self.build_url("/control", "cmd=start"), timeout=2.0)
        except requests.exceptions.RequestException:
            pass

    def stop_experiment(self):
        """Stop recording remotely on the phone."""
        try:
            self.session.get(self.build_url("/control", "cmd=stop"), timeout=2.0)
        except requests.exceptions.RequestException:
            pass

    def _extract_arr(self, buf: dict, candidates: list) -> np.ndarray:
        """Helper to extract numerical array from candidate buffer names."""
        for c in candidates:
            if not c:
                continue
            if c in buf:
                val = buf[c]
                if isinstance(val, dict):
                    arr = val.get("buffer", [])
                    if arr is not None and len(arr) > 0:
                        return np.array(arr, dtype=float)
                elif isinstance(val, list) and len(val) > 0:
                    return np.array(val, dtype=float)
        return np.array([], dtype=float)

    def get_frame(self, duration_sec: float = None) -> Optional[SensorFrame]:
        """
        Fetch sensor data with robust multi-sensor support.
        Dynamically acquires both accelerometer and gyroscope buffers when present.
        """
        duration_sec = float(duration_sec or config.WINDOW_DURATION)
        if not self.base_url:
            self.last_error = "No Phyphox URL configured"
            return None

        # Build dynamic query based on discovered buffer names
        query_parts = []
        if self.use_incremental and self.last_t is not None:
            t_val = f"{self.last_t:.4f}"
            t_key = self.accel_keys.get("t") or "acc_time"
            query_parts.append(f"{t_key}={t_val}")
            
            for k in ["x", "y", "z"]:
                buf_name = self.accel_keys.get(k)
                if buf_name:
                    query_parts.append(f"{buf_name}={t_val}|{t_key}")
                    
            if self.has_gyro:
                gyr_t_key = self.gyro_keys.get("t") or "gyr_time"
                gyr_t_val = f"{self.last_gyro_t:.4f}" if self.last_gyro_t is not None else t_val
                if gyr_t_key and gyr_t_key != t_key:
                    query_parts.append(f"{gyr_t_key}={gyr_t_val}")
                for k in ["x", "y", "z"]:
                    buf_name = self.gyro_keys.get(k)
                    if buf_name:
                        query_parts.append(f"{buf_name}={gyr_t_val}|{gyr_t_key}")
            query = "&".join(query_parts)
        else:
            # First sync or re-sync: request full buffers for accelerometer (and gyro candidates)
            full_parts = []
            t_key = self.accel_keys.get("t") or "acc_time"
            kx = self.accel_keys.get("x") or "accX"
            ky = self.accel_keys.get("y") or "accY"
            kz = self.accel_keys.get("z") or "accZ"
            for k in [t_key, kx, ky, kz]:
                entry = f"{k}=full"
                if entry not in full_parts:
                    full_parts.append(entry)
            # Ensure standard Phyphox buffer names are included as backup
            for std_name in ["acc_time", "accX", "accY", "accZ"]:
                entry = f"{std_name}=full"
                if entry not in full_parts:
                    full_parts.append(entry)
            # Always request candidate gyro buffers on full query so they are returned and discovered if present
            gyro_cands = []
            if self.has_gyro:
                for k in ["t", "x", "y", "z"]:
                    name = self.gyro_keys.get(k)
                    if name:
                        gyro_cands.append(name)
            gyro_cands.extend(["gyr_time", "gyrX", "gyrY", "gyrZ", "gyro_time", "gyroX", "gyroY", "gyroZ"])
            for gk in gyro_cands:
                entry = f"{gk}=full"
                if entry not in full_parts:
                    full_parts.append(entry)
            query = "&".join(full_parts)

        target_url = self.build_url("/get", query)

        try:
            r = self.session.get(target_url, timeout=3.0)
            if r.status_code != 200:
                self.connected = False
                self.last_error = f"HTTP {r.status_code} from Phyphox server"
                return None

            data = r.json()
            buf = data.get("buffer", {}) if isinstance(data, dict) else {}
            
            # If buffer is empty or not yet discovered, refresh buffer discovery
            if not self.discovered_buffers or len(buf) == 0:
                if len(buf) == 0:
                    # Experiment might be paused; send start command
                    self.start_experiment()
                # Query clean /get to refresh discovery
                try:
                    r2 = self.session.get(self.build_url("/get"), timeout=2.5)
                    if r2.status_code == 200:
                        buf2 = r2.json().get("buffer", {})
                        if buf2:
                            buf = buf2
                            self.discover_sensor_buffers(buf)
                except Exception:
                    pass

            if not isinstance(buf, dict) or len(buf) == 0:
                self.last_error = "Phyphox experiment returned empty sensor buffers. Ensure experiment is running."
                return None

            # Dynamically identify buffers if not yet cached
            if not self.has_accel:
                self.discover_sensor_buffers(buf)

            # 1. Extract Accelerometer & Time
            t_cand = [self.accel_keys.get("t"), "acc_time", "t", "time", "lin_acc_time", "timestamp"]
            x_cand = [self.accel_keys.get("x"), "accX", "acc_x", "lin_accX", "linear_accX", "accel_x"]
            y_cand = [self.accel_keys.get("y"), "accY", "acc_y", "lin_accY", "linear_accY", "accel_y"]
            z_cand = [self.accel_keys.get("z"), "accZ", "acc_z", "lin_accZ", "linear_accZ", "accel_z"]

            new_t = self._extract_arr(buf, t_cand)
            new_x = self._extract_arr(buf, x_cand)
            new_y = self._extract_arr(buf, y_cand)
            new_z = self._extract_arr(buf, z_cand)

            # 2. Extract Gyroscope if available in this experiment
            gt_cand = [self.gyro_keys.get("t"), "gyr_time", "gyro_time", "w_time", "time", "t"]
            gx_cand = [self.gyro_keys.get("x"), "gyrX", "gyr_x", "gyroX", "gyro_x", "wX", "rotX"]
            gy_cand = [self.gyro_keys.get("y"), "gyrY", "gyr_y", "gyroY", "gyro_y", "wY", "rotY"]
            gz_cand = [self.gyro_keys.get("z"), "gyrZ", "gyr_z", "gyroZ", "gyro_z", "wZ", "rotZ"]

            new_gt = self._extract_arr(buf, gt_cand)
            new_gx = self._extract_arr(buf, gx_cand)
            new_gy = self._extract_arr(buf, gy_cand)
            new_gz = self._extract_arr(buf, gz_cand)

            if len(new_gx) > 0 and len(new_gy) > 0 and len(new_gz) > 0:
                self.has_gyro = True

            # Check if experiment restarted or cleared on phone
            if len(new_t) > 0 and len(self.buf_t) > 0 and self.last_t is not None:
                if new_t[0] < self.last_t:
                    self.buf_t = np.array([])
                    self.buf_x = np.array([])
                    self.buf_y = np.array([])
                    self.buf_z = np.array([])
                    self.buf_gx = np.array([])
                    self.buf_gy = np.array([])
                    self.buf_gz = np.array([])
                    self.buf_gt = np.array([])
                    self.use_incremental = False
                    self.last_t = None
                    self.last_gyro_t = None

            if len(new_z) > 0:
                if len(new_t) > 0:
                    self.last_t = float(new_t[-1])
                    self.use_incremental = True
                else:
                    self.last_t = (self.last_t or 0.0) + len(new_z) / self.target_fs
                    new_t = np.arange(len(new_z)) / self.target_fs + (self.buf_t[-1] if len(self.buf_t) else 0)

                # Ensure array dimension alignment before concatenate
                min_n = min(len(new_t), len(new_x), len(new_y), len(new_z))
                new_t = new_t[:min_n]
                new_x = new_x[:min_n]
                new_y = new_y[:min_n]
                new_z = new_z[:min_n]

                self.buf_t = np.concatenate([self.buf_t, new_t]) if len(self.buf_t) else new_t
                self.buf_x = np.concatenate([self.buf_x, new_x]) if len(self.buf_x) else new_x
                self.buf_y = np.concatenate([self.buf_y, new_y]) if len(self.buf_y) else new_y
                self.buf_z = np.concatenate([self.buf_z, new_z]) if len(self.buf_z) else new_z

                # Gyro buffer alignment and accumulation
                if self.has_gyro and len(new_gx) > 0:
                    min_g = min(len(new_gx), len(new_gy), len(new_gz))
                    if len(new_gt) >= min_g:
                        use_gt = new_gt[:min_g]
                    elif len(new_t) >= min_g:
                        use_gt = new_t[:min_g]
                    else:
                        t_end = new_t[-1] if len(new_t) else (self.buf_t[-1] if len(self.buf_t) else 0.0)
                        use_gt = t_end - np.arange(min_g - 1, -1, -1) / self.target_fs

                    self.last_gyro_t = float(use_gt[-1])
                    new_gx = new_gx[:min_g]
                    new_gy = new_gy[:min_g]
                    new_gz = new_gz[:min_g]

                    self.buf_gt = np.concatenate([self.buf_gt, use_gt]) if len(self.buf_gt) else use_gt
                    self.buf_gx = np.concatenate([self.buf_gx, new_gx]) if len(self.buf_gx) else new_gx
                    self.buf_gy = np.concatenate([self.buf_gy, new_gy]) if len(self.buf_gy) else new_gy
                    self.buf_gz = np.concatenate([self.buf_gz, new_gz]) if len(self.buf_gz) else new_gz

            # Measure raw phone sampling rate from timestamp differentials
            measured_raw_fs = self.target_fs
            missing_count = 0
            if len(self.buf_t) > 5:
                dt = np.diff(self.buf_t)
                valid_dt = dt[dt > 0.0001]
                if len(valid_dt) > 0:
                    median_dt = float(np.median(valid_dt))
                    if median_dt > 0:
                        measured_raw_fs = 1.0 / median_dt
                    missing_count = int(np.sum(dt > (2.5 * median_dt)))

            self.measured_raw_fs = measured_raw_fs

            # Keep buffer bounded to at most 18 seconds of raw data
            max_raw_samples = int(18.0 * measured_raw_fs)
            if len(self.buf_z) > max_raw_samples:
                self.buf_t = self.buf_t[-max_raw_samples:]
                self.buf_x = self.buf_x[-max_raw_samples:]
                self.buf_y = self.buf_y[-max_raw_samples:]
                self.buf_z = self.buf_z[-max_raw_samples:]
                if len(self.buf_gx) > max_raw_samples:
                    self.buf_gt = self.buf_gt[-max_raw_samples:]
                    self.buf_gx = self.buf_gx[-max_raw_samples:]
                    self.buf_gy = self.buf_gy[-max_raw_samples:]
                    self.buf_gz = self.buf_gz[-max_raw_samples:]

            if len(self.buf_t) < 10:
                self.last_status_message = "Buffering sensor data..."
                return None

            latest_t = self.buf_t[-1]
            earliest_t = self.buf_t[0]
            elapsed_buffered_sec = latest_t - earliest_t

            if elapsed_buffered_sec < min(2.5, duration_sec * 0.4):
                self.last_status_message = f"Buffering... ({elapsed_buffered_sec:.1f}s / {duration_sec:.1f}s)"
                return None

            # ── Fast Temporal Window Extraction ─────────────────────────────
            t_cutoff = latest_t - duration_sec
            mask = self.buf_t >= t_cutoff

            raw_win_t = self.buf_t[mask]
            raw_win_x = self.buf_x[mask]
            raw_win_y = self.buf_y[mask]
            raw_win_z = self.buf_z[mask]

            # Fast Decimation to 50 Hz DSP rate
            step = max(1, int(round(measured_raw_fs / self.target_fs)))

            frame_t = raw_win_t[::step]
            frame_x = raw_win_x[::step]
            frame_y = raw_win_y[::step]
            frame_z = raw_win_z[::step]

            effective_fs = self.target_fs
            if len(frame_t) > 2 and (frame_t[-1] - frame_t[0]) > 0.1:
                effective_fs = (len(frame_t) - 1) / (frame_t[-1] - frame_t[0])

            # Decimate / interpolate Gyroscope data if genuinely available
            if self.has_gyro and len(self.buf_gx) >= 2 and len(self.buf_gt) == len(self.buf_gx):
                frame_gx = np.interp(frame_t, self.buf_gt, self.buf_gx)
                frame_gy = np.interp(frame_t, self.buf_gt, self.buf_gy)
                frame_gz = np.interp(frame_t, self.buf_gt, self.buf_gz)
            elif self.has_gyro and len(self.buf_gx) >= 2:
                g_indices = np.linspace(0, len(self.buf_gx) - 1, len(frame_t))
                frame_gx = np.interp(g_indices, np.arange(len(self.buf_gx)), self.buf_gx)
                frame_gy = np.interp(g_indices, np.arange(len(self.buf_gy)), self.buf_gy)
                frame_gz = np.interp(g_indices, np.arange(len(self.buf_gz)), self.buf_gz)
            else:
                frame_gx = np.zeros(len(frame_z))
                frame_gy = np.zeros(len(frame_z))
                frame_gz = np.zeros(len(frame_z))

            # Saturation check (threshold: 38 m/s^2)
            sat_threshold = 38.0
            sat_x = bool(np.any(np.abs(frame_x) >= sat_threshold))
            sat_y = bool(np.any(np.abs(frame_y) >= sat_threshold))
            sat_z = bool(np.any(np.abs(frame_z) >= sat_threshold))
            is_saturated = sat_x or sat_y or sat_z

            self.connected = True
            self.last_success_time = time.time()
            gyro_info = "Gyro: ACTIVE" if self.has_gyro else "Gyro: Inactive in Experiment"
            self.last_status_message = (
                f"Streaming ({len(frame_z)} samples, ~{measured_raw_fs:.1f} Hz Phone ➔ 50 Hz DSP • {gyro_info})"
            )
            self.last_error = None

            return SensorFrame(
                timestamp=self.last_success_time,
                time_vector=frame_t,
                accel_x=frame_x,
                accel_y=frame_y,
                accel_z=frame_z,
                gyro_x=frame_gx,
                gyro_y=frame_gy,
                gyro_z=frame_gz,
                mag_x=None,
                mag_y=None,
                mag_z=None,
                audio_samples=None,
                audio_sample_rate=0,
                audio_source_type="none",
                activity_label="live",
                true_br=0.0,
                is_synthetic=False,
                measured_sample_rate=effective_fs,
                raw_sensor_sample_rate=measured_raw_fs,
                missing_samples_count=missing_count,
                is_saturated=is_saturated,
                saturation_flags={"x": sat_x, "y": sat_y, "z": sat_z},
                has_gyro=self.has_gyro,
                has_mag=self.has_mag,
                has_audio=self.has_audio,
            )

        except requests.exceptions.RequestException as e:
            self.use_incremental = False
            self.last_t = None
            self.connected = False
            self.last_error = f"Network communication error: {str(e)}"
            self.last_status_message = self.last_error
            return None
        except Exception as e:
            self.use_incremental = False
            self.last_t = None
            self.connected = False
            self.last_error = f"Data parsing error: {str(e)}"
            self.last_status_message = self.last_error
            return None


def create_sensor_source(use_simulator: bool = True, phone_ip: str = None, base_url: str = None):
    """Factory function for sensor source."""
    if use_simulator:
        from src.sensors.simulator import RespirationSimulator
        return RespirationSimulator()
    else:
        stream = PhyphoxStream(phone_ip=phone_ip, base_url=base_url)
        success, msg = stream.test_connection()
        if success:
            stream.start_experiment()
        return stream


def parse_endpoint(raw_input: str, default_port: int = 8080) -> Tuple[str, int, str]:
    """Module-level endpoint sanitizer for external consumers and test suites."""
    return PhyphoxStream.parse_endpoint(raw_input, default_port)


def discover_sensor_buffers(buffer_dict: Dict[str, Any]) -> Dict[str, Any]:
    """Module-level dynamic buffer analyzer for external consumers and test suites."""
    dummy = PhyphoxStream()
    res = dummy.discover_sensor_buffers(buffer_dict)
    return {
        "all_buffers": res["all_buffers"],
        "has_accel": res["has_accel"],
        "has_gyro": res["has_gyro"],
        "accel_status": "ACTIVE" if res["has_accel"] else "NOT DETECTED",
        "gyro_status": "ACTIVE" if res["has_gyro"] else "NOT IN EXPERIMENT",
        "buffer_names": res["all_buffers"],
        "accel_keys": res["accel_keys"],
        "gyro_keys": res["gyro_keys"],
    }

