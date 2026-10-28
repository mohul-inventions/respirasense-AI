"""
Central configuration for the Respiration Monitoring System.
All thresholds, filter parameters, and sensor settings in one place.
"""

# ─── Sensor Sampling ────────────────────────────────────────────
SAMPLE_RATE_ACCEL = 50          # Hz – accelerometer sampling rate
SAMPLE_RATE_AUDIO = 8000        # Hz – microphone sampling rate (low for breath sounds)
WINDOW_DURATION = 10            # seconds – sliding analysis window
UPDATE_INTERVAL = 1.0           # seconds – how often dashboard refreshes

# ─── Phyphox / SensorLogger ─────────────────────────────────────
# Configurable Phyphox endpoint (set via UI per Wi-Fi/hotspot network)
PHONE_IP = ""                   # Populated dynamically via UI or request parameters
PHYPHOX_PORT = 8080
DEFAULT_PHYPHOX_BASE_URL = ""   # Full configurable URL e.g. "http://192.168.43.1:8080"
SENSOR_LOGGER_PORT = 8080

# ─── Bandpass Filter Parameters ─────────────────────────────────
# Respiratory motion band (accelerometer)
RESP_MOTION_LOW_HZ = 0.1       # Normal breathing ≥ 6 breaths/min
RESP_MOTION_HIGH_HZ = 0.7      # Normal breathing ≤ 42 breaths/min
RESP_FILTER_ORDER = 4

# Body movement detection (high-pass to isolate non-respiratory motion)
MOVEMENT_HIGH_PASS_HZ = 1.0    # Above respiratory frequencies
MOVEMENT_FILTER_ORDER = 2

# Audio envelope for breath sounds
AUDIO_ENVELOPE_LOW_HZ = 0.1
AUDIO_ENVELOPE_HIGH_HZ = 0.7
AUDIO_BANDPASS_LOW_HZ = 200     # Breath sounds frequency range
AUDIO_BANDPASS_HIGH_HZ = 2000

# ─── Signal Quality Index Thresholds ────────────────────────────
SQI_GOOD_THRESHOLD = 0.7       # Above this = reliable signal
SQI_POOR_THRESHOLD = 0.3       # Below this = unreliable
MIN_CONFIDENCE_THRESHOLD = 0.15 # Below this = flag as "no reliable data"

# ─── Breathing Rate Bounds ──────────────────────────────────────
BR_MIN_BPM = 6                 # Minimum plausible breathing rate
BR_MAX_BPM = 42                # Maximum plausible breathing rate
BR_NORMAL_LOW = 12             # Normal range lower bound
BR_NORMAL_HIGH = 20            # Normal range upper bound

# ─── Anomaly Detection ─────────────────────────────────────────
APNEA_DURATION_SEC = 10        # No breath detected for this long = apnea alert
TACHYPNEA_THRESHOLD = 25       # Breaths/min above this = tachypnea
BRADYPNEA_THRESHOLD = 8        # Breaths/min below this = bradypnea
BR_SUDDEN_CHANGE_BPM = 8       # Sudden change in BR by this much = alert

# ─── Cough Detection & Acoustic Classification ──────────────────
COUGH_FREQ_THRESHOLD_HZ = 255.0 # Frequency strictly > threshold qualifies (default strictly > 255 Hz)
COUGH_MIN_ENERGY_RMS = 0.10     # Minimum audio frame RMS energy
COUGH_EXPLOSIVE_RATIO = 3.2     # Peak-to-RMS transient ratio (explosive onset)
COUGH_SPECTRAL_FLATNESS = 0.20  # Flatness check: cough is turbulent noise; speech is harmonic formants
COUGH_COOLDOWN_SEC = 0.8        # Cooldown / event-merging window in seconds

# ─── Audio Noise Gate Fixed Defaults ───────────────────────────
AUDIO_GATE_DEFAULT_THRESHOLD_DBFS = -20.0  # Default prototype threshold: -20 dBFS
AUDIO_GATE_MIN_ALLOWED_DBFS = -25.0        # Allowed internal range: -25 to -12 dBFS
AUDIO_GATE_MAX_ALLOWED_DBFS = -12.0
AUDIO_GATE_DEFAULT_HYSTERESIS_DB = 4.0

# ─── Activity Classification ───────────────────────────────────
ACTIVITY_WINDOW_SEC = 3         # Window for activity classification
MOTION_RMS_REST = 0.15          # Below this = resting
MOTION_RMS_WALK = 1.0           # Above rest, below this = light movement
# Above MOTION_RMS_WALK = vigorous movement

# ─── Dashboard ──────────────────────────────────────────────────
TREND_HISTORY_MINUTES = 30      # How many minutes of history to show
MAX_ALERTS_DISPLAY = 20         # Max alerts to show in panel
CHART_HEIGHT = 300              # Pixel height for charts

# ─── Activity-Dependent Base Weights ────────────────────────────
# Format: (motion_weight, acoustic_weight)
ACTIVITY_BASE_WEIGHTS = {
    "resting":    (0.6, 0.4),
    "walking":    (0.25, 0.75),
    "speaking":   (0.9, 0.1),
    "coughing":   (0.85, 0.15),
    "vigorous":   (0.2, 0.8),
    "unknown":    (0.5, 0.5),
}

# ─── Simulator ──────────────────────────────────────────────────
SIMULATE_SCENARIOS = [
    {"name": "resting",            "duration": 60, "br": 15, "noise": 0.05},
    {"name": "speaking",           "duration": 30, "br": 16, "noise": 0.3},
    {"name": "coughing",           "duration": 15, "br": 18, "noise": 1.2},
    {"name": "posture_transition", "duration": 45, "br": 18, "noise": 0.8},
    {"name": "deterioration",      "duration": 45, "br": 30, "noise": 0.1},
]
