"""
Clinical anomaly detector adapted for multi-axis fusion outputs.
Accounts for exercise/walking state to avoid false alarms during normal exertion.
"""

import numpy as np
from dataclasses import dataclass
from typing import List, Optional
from collections import deque
import time

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))
import config


@dataclass
class Alert:
    timestamp: float
    time_str: str
    alert_type: str        # "TACHYPNEA", "BRADYPNEA", "APNEA", "SUDDEN_CHANGE", "DETERIORATION", "QUALITY_REJECT"
    severity: str          # "INFO", "WARNING", "CRITICAL"
    message: str
    br_bpm: Optional[float]
    confidence: float

    def to_dict(self) -> dict:
        return {
            "timestamp": self.timestamp,
            "time_str": self.time_str,
            "alert_type": self.alert_type,
            "severity": self.severity,
            "message": self.message,
            "br_bpm": self.br_bpm,
            "confidence": self.confidence,
        }


class AnomalyDetector:
    """
    Monitors respiratory trends with context-aware physiological rules.
    """

    def __init__(self):
        self.br_history = deque(maxlen=300)
        self.confidence_history = deque(maxlen=300)
        self.alert_history: List[Alert] = []
        self.last_alert_time = {}
        self.alert_cooldown_sec = 12
        self.consecutive_no_breath = 0
        self.cough_count = 0

    def check(self, fused_br: Optional[float], confidence: float,
              activity: str, status: str, rejection_reason: Optional[str] = None,
              cough_spikes: int = 0) -> List[Alert]:
        now = time.time()
        time_str = time.strftime("%H:%M:%S", time.localtime(now))
        alerts = []

        if cough_spikes > 0:
            self.cough_count += cough_spikes
            if cough_spikes >= 2 and self._can_alert("COUGH", now):
                alerts.append(Alert(
                    timestamp=now, time_str=time_str, alert_type="COUGH", severity="INFO",
                    message=f"🤧 Cough-like transient event ({cough_spikes} spikes)",
                    br_bpm=fused_br, confidence=confidence
                ))

        # Check for quality rejection notification
        if status == "INSUFFICIENT_QUALITY":
            if rejection_reason and self._can_alert("QUALITY_REJECT", now):
                alerts.append(Alert(
                    timestamp=now, time_str=time_str, alert_type="QUALITY_REJECT", severity="INFO",
                    message=f"⚠️ {rejection_reason}", br_bpm=None, confidence=confidence
                ))

        if fused_br is None:
            # Only count as potential apnea if person is RESTING and not moving
            if activity == "resting" and status != "INSUFFICIENT_QUALITY":
                self.consecutive_no_breath += 1
                if self.consecutive_no_breath >= config.APNEA_DURATION_SEC:
                    if self._can_alert("APNEA", now):
                        alerts.append(Alert(
                            timestamp=now, time_str=time_str, alert_type="APNEA", severity="CRITICAL",
                            message=f"🚨 Breath cessation detected for {self.consecutive_no_breath}s during rest (potential apnea)",
                            br_bpm=0.0, confidence=confidence
                        ))
            else:
                self.consecutive_no_breath = 0
            return alerts

        self.consecutive_no_breath = 0
        self.br_history.append(fused_br)
        self.confidence_history.append(confidence)

        # Context-aware Tachypnea:
        # Breathing normally accelerates during walking or recovery.
        # Do NOT flag as deterioration or tachypnea solely because it exceeds resting threshold while moving!
        dynamic_tachypnea_thresh = config.TACHYPNEA_THRESHOLD
        if activity in ["walking", "general_movement", "recovery"]:
            dynamic_tachypnea_thresh = 34.0  # Elevated threshold for physical activity

        if fused_br > dynamic_tachypnea_thresh and confidence > 0.4:
            if self._can_alert("TACHYPNEA", now):
                sev = "CRITICAL" if fused_br > (dynamic_tachypnea_thresh + 6) else "WARNING"
                alerts.append(Alert(
                    timestamp=now, time_str=time_str, alert_type="TACHYPNEA", severity=sev,
                    message=f"🔴 Elevated respiration ({fused_br:.0f} bpm) exceeding {activity} threshold ({dynamic_tachypnea_thresh:.0f} bpm)",
                    br_bpm=fused_br, confidence=confidence
                ))

        elif fused_br < config.BRADYPNEA_THRESHOLD and activity == "resting" and confidence > 0.4:
            if self._can_alert("BRADYPNEA", now):
                alerts.append(Alert(
                    timestamp=now, time_str=time_str, alert_type="BRADYPNEA", severity="WARNING",
                    message=f"🟡 Bradypnea detected at rest ({fused_br:.0f} bpm < {config.BRADYPNEA_THRESHOLD})",
                    br_bpm=fused_br, confidence=confidence
                ))

        # Deterioration trend (progressive increase at REST)
        if len(self.br_history) >= 20 and activity == "resting":
            hist = list(self.br_history)[-20:]
            first_half = np.mean(hist[:10])
            second_half = np.mean(hist[10:])
            if (second_half - first_half >= 6.0) and second_half > config.BR_NORMAL_HIGH:
                if self._can_alert("DETERIORATION", now):
                    alerts.append(Alert(
                        timestamp=now, time_str=time_str, alert_type="DETERIORATION", severity="CRITICAL",
                        message=f"📈 Sustained resting rate increase ({first_half:.0f} ➔ {second_half:.0f} bpm)",
                        br_bpm=fused_br, confidence=confidence
                    ))

        self.alert_history.extend(alerts)
        return alerts

    def _can_alert(self, alert_type: str, now: float) -> bool:
        last = self.last_alert_time.get(alert_type, 0.0)
        if now - last >= self.alert_cooldown_sec:
            self.last_alert_time[alert_type] = now
            return True
        return False

    def get_stats(self) -> dict:
        if not self.br_history:
            return {"mean_br": None, "min_br": None, "max_br": None, "total_alerts": len(self.alert_history)}
        brs = list(self.br_history)
        return {
            "mean_br": round(float(np.mean(brs)), 1),
            "min_br": round(float(np.min(brs)), 1),
            "max_br": round(float(np.max(brs)), 1),
            "total_alerts": len(self.alert_history),
            "total_coughs": self.cough_count,
            "data_points": len(brs),
        }
