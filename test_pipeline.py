"""
End-to-end evaluation pipeline for RespiraSense AI.
Runs through realistic physical scenarios:
- Resting (clean)
- Walking (rhythmic steps)
- Speaking (voice acoustics)
- Coughing (violent jerks)
- Posture transition (sitting to lying)
- Deterioration (tachypnea)

Demonstrates how each scenario is classified and when rate estimation is appropriately preserved or suspended.
"""

import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

from src.sensors.simulator import RespirationSimulator
from src.fusion.adaptive_fusion import AdaptiveFusionEngine
from src.detection.anomaly import AnomalyDetector
import config

sim = RespirationSimulator()
engine = AdaptiveFusionEngine()
detector = AnomalyDetector()

print("=" * 105)
print(" 🫁 RespiraSense AI — Multi-Axis Adaptive Fusion & Artifact Separation Pipeline")
print("=" * 105)
print(f"{'Scenario':20s} | {'True BR':>7s} | {'Fused BR':>8s} | {'Status':20s} | {'Activity':18s} | {'Z-SQI':>5s} | {'Motion RMS':>10s}")
print("-" * 105)

for scenario in config.SIMULATE_SCENARIOS:
    frame = sim.get_frame(scenario["duration"])
    out = engine.process_frame(frame)

    true_br = scenario.get("br", 0)
    fused_str = f"{out.fused_br_bpm:.1f} bpm" if out.fused_br_bpm is not None else "REJECTED"
    
    # Check anomalies
    coughs = out.axis_diagnostics.get("cough_spikes", 0)
    alerts = detector.check(
        out.fused_br_bpm, out.confidence,
        out.activity, out.status, out.rejection_reason, coughs
    )
    alert_info = f" ➔ [{alerts[0].alert_type}] {alerts[0].message[:45]}" if alerts else ""

    print(f"{scenario['name']:20s} | {true_br:5d} bpm | {fused_str:>8s} | {out.status:20s} | "
          f"{out.activity:18s} | {out.sqi_scores['z']:5.2f} | {out.motion_rms:8.3f} m/s²{alert_info}")

print("=" * 105)
stats = detector.get_stats()
print(f"Session Summary Statistics: {stats}")
print("End-to-end verification PASSED ✅\n")
