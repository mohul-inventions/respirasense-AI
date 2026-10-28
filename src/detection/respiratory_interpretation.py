"""
RespiraSense AI — Activity-Aware Respiratory Interpretation Engine
Implements the 8-step decision logic defined in Part 11 of the biomedical specification.

Decision Sequence:
STEP 1: Freshness verification (detect stale data or disconnection).
STEP 2: Signal Quality Index (SQI) threshold gating (suppress estimates when signal is inadequate).
STEP 3: Activity classification confidence check.
STEP 4: Stable rest/low-motion evaluation against general adult reference range (12–20 bpm).
STEP 5: Dynamic physical exertion context (walking/running): resting threshold is NOT applied.
STEP 6: Post-exercise recovery tracking with timestamped observation window.
STEP 7: Multi-window persistence verification (cautious alert only if elevated across consecutive windows).
STEP 8: Output synthesis with transparent uncertainty reporting and strict disclaimer.
"""

from dataclasses import dataclass, field
from typing import Optional, List, Dict, Any
from collections import deque
import time


@dataclass
class InterpretationResult:
    status_code: str
    primary_flag: str
    message: str
    resting_threshold_applied: bool
    is_persistent_elevation: bool
    recovery_trend_observed: bool
    recovery_duration_sec: float
    confidence: float
    estimated_br_bpm: Optional[float]
    activity_context: str
    clinical_disclaimer: str = (
        "Software-derived contextual interpretation for engineering research only. "
        "Not a clinical diagnosis, certified medical monitoring, or replacement for professional medical assessment."
    )

    def to_dict(self) -> Dict[str, Any]:
        return {
            "status_code": self.status_code,
            "primary_flag": self.primary_flag,
            "message": self.message,
            "resting_threshold_applied": self.resting_threshold_applied,
            "is_persistent_elevation": self.is_persistent_elevation,
            "recovery_trend_observed": self.recovery_trend_observed,
            "recovery_duration_sec": round(self.recovery_duration_sec, 1),
            "confidence": round(self.confidence, 2),
            "estimated_br_bpm": round(self.estimated_br_bpm, 1) if self.estimated_br_bpm is not None else None,
            "activity_context": self.activity_context,
            "clinical_disclaimer": self.clinical_disclaimer,
        }


class RespiratoryInterpretationEngine:
    """
    Transparent, configurable biomedical decision engine.
    Applies physiological context to avoid false alarms during physical exertion.
    """

    def __init__(
        self,
        adult_rest_min_bpm: float = 12.0,
        adult_rest_max_bpm: float = 20.0,
        min_sqi_threshold: float = 0.40,
        persistent_windows_required: int = 3,
        freshness_timeout_sec: float = 4.0,
    ):
        self.adult_rest_min_bpm = adult_rest_min_bpm
        self.adult_rest_max_bpm = adult_rest_max_bpm
        self.min_sqi_threshold = min_sqi_threshold
        self.persistent_windows_required = persistent_windows_required
        self.freshness_timeout_sec = freshness_timeout_sec

        # State tracking
        self.valid_resting_history = deque(maxlen=20)
        self.consecutive_elevated_count = 0
        self.last_high_motion_time = 0.0
        self.in_recovery_mode = False
        self.recovery_start_time = 0.0
        self.last_update_time = time.time()

    def interpret(
        self,
        estimated_br: Optional[float],
        signal_quality: float,
        activity: str,
        activity_confidence: float = 0.8,
        data_freshness_sec: float = 0.5,
        motion_rms: float = 0.05,
        is_transition: bool = False,
        now: Optional[float] = None,
    ) -> InterpretationResult:
        if now is None:
            now = time.time()
        self.last_update_time = now

        activity_clean = activity.lower().strip() if activity else "unknown"

        # Track motion state for recovery transition detection
        is_high_motion = (
            activity_clean in ["walking", "running", "vigorous", "high_motion", "exercise"]
            or motion_rms > 0.45
        )

        if is_high_motion:
            self.last_high_motion_time = now
            self.in_recovery_mode = False
            self.consecutive_elevated_count = 0
        elif self.last_high_motion_time > 0 and (now - self.last_high_motion_time) < 180.0:
            # Within 3 minutes of previous high motion -> post-exercise recovery
            if not self.in_recovery_mode:
                self.in_recovery_mode = True
                self.recovery_start_time = self.last_high_motion_time
        else:
            self.in_recovery_mode = False

        recovery_duration = (now - self.recovery_start_time) if self.in_recovery_mode else 0.0

        # ─── STEP 1: Freshness verification ───
        if data_freshness_sec > self.freshness_timeout_sec:
            return InterpretationResult(
                status_code="STALE_DATA",
                primary_flag="DATA FRESHNESS WARNING",
                message=f"Sensor readings delayed by {data_freshness_sec:.1f}s. Estimation suspended.",
                resting_threshold_applied=False,
                is_persistent_elevation=False,
                recovery_trend_observed=False,
                recovery_duration_sec=0.0,
                confidence=0.0,
                estimated_br_bpm=None,
                activity_context=activity,
            )

        # ─── STEP 2: Signal Quality Index gating ───
        if signal_quality < self.min_sqi_threshold or estimated_br is None or is_transition:
            reason = "Motion interference or unstable sensor orientation" if is_transition else "SQI below acceptable threshold"
            return InterpretationResult(
                status_code="INSUFFICIENT_QUALITY",
                primary_flag="SIGNAL QUALITY INSUFFICIENT",
                message=f"{reason} (SQI: {signal_quality:.2f}). Respiratory rate estimate suspended to preserve scientific integrity.",
                resting_threshold_applied=False,
                is_persistent_elevation=False,
                recovery_trend_observed=self.in_recovery_mode,
                recovery_duration_sec=recovery_duration,
                confidence=signal_quality,
                estimated_br_bpm=None,
                activity_context=activity,
            )

        # ─── STEP 3: Activity classification certainty check ───
        if activity_clean in ["unknown", "unclassified"] or activity_confidence < 0.40:
            return InterpretationResult(
                status_code="UNCERTAIN_ACTIVITY",
                primary_flag="ACTIVITY CLASSIFICATION UNCERTAIN",
                message=f"Observed rate of {estimated_br:.1f} bpm. Activity context uncertain; resting reference thresholds withheld.",
                resting_threshold_applied=False,
                is_persistent_elevation=False,
                recovery_trend_observed=self.in_recovery_mode,
                recovery_duration_sec=recovery_duration,
                confidence=signal_quality * 0.7,
                estimated_br_bpm=estimated_br,
                activity_context=activity,
            )

        # ─── STEP 5: Dynamic physical exertion context (Walking / Running) ───
        if is_high_motion or activity_clean in ["walking", "running", "jogging"]:
            self.consecutive_elevated_count = 0
            return InterpretationResult(
                status_code="EXERCISE_CONTEXT",
                primary_flag="EXERCISE CONTEXT — RESTING THRESHOLD NOT APPLIED",
                message=(
                    f"Breathing rate {estimated_br:.1f} bpm observed during physical motion ({activity}). "
                    "Resting reference boundaries (12–20 bpm) are not applicable during active ambulation."
                ),
                resting_threshold_applied=False,
                is_persistent_elevation=False,
                recovery_trend_observed=False,
                recovery_duration_sec=0.0,
                confidence=signal_quality,
                estimated_br_bpm=estimated_br,
                activity_context=activity,
            )

        # ─── STEP 6: Post-exercise recovery tracking ───
        if self.in_recovery_mode:
            return InterpretationResult(
                status_code="RECOVERY_OBSERVATION",
                primary_flag="OBSERVATION REQUIRED",
                message=(
                    f"Rate is {estimated_br:.1f} bpm during post-movement recovery ({recovery_duration:.0f}s elapsed). "
                    "Rate expected to gradually return to baseline; observing trend."
                ),
                resting_threshold_applied=False,
                is_persistent_elevation=False,
                recovery_trend_observed=True,
                recovery_duration_sec=recovery_duration,
                confidence=signal_quality,
                estimated_br_bpm=estimated_br,
                activity_context="post_exercise_recovery",
            )

        # ─── STEP 4 & 7: Stable Rest / Low-Motion Evaluation ───
        self.valid_resting_history.append(estimated_br)

        if estimated_br < self.adult_rest_min_bpm:
            self.consecutive_elevated_count = 0
            return InterpretationResult(
                status_code="BELOW_RESTING_RANGE",
                primary_flag="BELOW COMMON ADULT RESTING REFERENCE RANGE",
                message=(
                    f"Measured rate of {estimated_br:.1f} bpm is below the common adult resting reference lower boundary "
                    f"({self.adult_rest_min_bpm:.0f} bpm). Review physiological context."
                ),
                resting_threshold_applied=True,
                is_persistent_elevation=False,
                recovery_trend_observed=False,
                recovery_duration_sec=0.0,
                confidence=signal_quality,
                estimated_br_bpm=estimated_br,
                activity_context="resting",
            )

        elif estimated_br > self.adult_rest_max_bpm:
            self.consecutive_elevated_count += 1
            is_persistent = self.consecutive_elevated_count >= self.persistent_windows_required
            
            flag_suffix = " — PERSISTENT PATTERN" if is_persistent else " — REVIEW CONTEXT"
            return InterpretationResult(
                status_code="POSSIBLE_ELEVATED_RESTING",
                primary_flag="POSSIBLE ELEVATED RESTING RESPIRATORY RATE",
                message=(
                    f"Measured rate of {estimated_br:.1f} bpm exceeds the common adult resting reference threshold "
                    f"({self.adult_rest_max_bpm:.0f} bpm) across {self.consecutive_elevated_count} consecutive window(s){flag_suffix}. "
                    "Note: This is a contextual indicator, not a clinical diagnosis of tachypnea."
                ),
                resting_threshold_applied=True,
                is_persistent_elevation=is_persistent,
                recovery_trend_observed=False,
                recovery_duration_sec=0.0,
                confidence=signal_quality,
                estimated_br_bpm=estimated_br,
                activity_context="resting",
            )

        else:
            self.consecutive_elevated_count = 0
            return InterpretationResult(
                status_code="WITHIN_RESTING_RANGE",
                primary_flag="WITHIN COMMON ADULT RESTING REFERENCE RANGE",
                message=(
                    f"Measured rate of {estimated_br:.1f} bpm is within the normal adult resting baseline "
                    f"({self.adult_rest_min_bpm:.0f}–{self.adult_rest_max_bpm:.0f} bpm) with adequate signal quality."
                ),
                resting_threshold_applied=True,
                is_persistent_elevation=False,
                recovery_trend_observed=False,
                recovery_duration_sec=0.0,
                confidence=signal_quality,
                estimated_br_bpm=estimated_br,
                activity_context="resting",
            )
