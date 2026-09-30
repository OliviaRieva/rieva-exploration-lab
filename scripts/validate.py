#!/usr/bin/env python3
"""Independent numerical validation for the Rievastra orbit simulator.

The script intentionally uses only the Python standard library and does not
import application code.  It integrates a planar Earth-centred state

    y = (x, y, vx, vy, propellant_mass)

with classical fourth-order Runge--Kutta (RK4).  Integration steps are split at
engine-interruption boundaries and at propellant exhaustion so a discontinuous
thrust command is never averaged across a step.

Run a human-readable report:

    python3 scripts/validate.py

Emit machine-readable JSON (the process still exits non-zero on failure):

    python3 scripts/validate.py --json
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Sequence, Tuple


# Model constants in SI units.
# NASA EGM96, section 11, equation 11.2-8:
# https://cddis.nasa.gov/926/egm96/doc/S11.HTML
MU_EARTH = 3.986004418e14  # m^3 s^-2
# NASA Earth Fact Sheet, volumetric mean radius:
# https://nssdc.gsfc.nasa.gov/planetary/factsheet/earthfact.html
EARTH_RADIUS = 6_371_000.0  # m
# NIST Guide to the SI, Appendix B.8 (exact standard gravity):
# https://www.nist.gov/pml/special-publication-811/
# nist-guide-si-appendix-b-conversion-factors/nist-guide-si-appendix-b8
G0 = 9.80665  # m s^-2

SOURCES = {
    "two_body_relations": (
        "https://ocw.mit.edu/courses/16-346-astrodynamics-fall-2008/"
        "dbce406df8d13e052f9229880ed96c02_lec_02.pdf"
    ),
    "electric_propulsion": (
        "https://descanso.jpl.nasa.gov/SciTechBook/series4/"
        "Electric_Propulsion_2nd_edition.pdf"
    ),
    "earth_gravitational_parameter": (
        "https://cddis.nasa.gov/926/egm96/doc/S11.HTML"
    ),
    "earth_mean_radius": (
        "https://nssdc.gsfc.nasa.gov/planetary/factsheet/earthfact.html"
    ),
    "standard_gravity": (
        "https://www.nist.gov/pml/special-publication-811/"
        "nist-guide-si-appendix-b-conversion-factors/"
        "nist-guide-si-appendix-b8"
    ),
}

State = Tuple[float, float, float, float, float]


@dataclass(frozen=True)
class SimulationConfig:
    """Physical inputs for one independent propagation."""

    dry_mass_kg: float
    initial_propellant_kg: float
    power_w: float
    isp_s: float
    efficiency: float
    interruption_start_s: Optional[float] = None
    interruption_duration_s: float = 0.0

    @property
    def exhaust_velocity_m_s(self) -> float:
        return self.isp_s * G0

    @property
    def nominal_thrust_n(self) -> float:
        if self.power_w <= 0.0 or self.efficiency <= 0.0:
            return 0.0
        return 2.0 * self.efficiency * self.power_w / self.exhaust_velocity_m_s

    @property
    def mass_flow_kg_s(self) -> float:
        return self.nominal_thrust_n / self.exhaust_velocity_m_s

    @property
    def interruption_end_s(self) -> Optional[float]:
        if self.interruption_start_s is None:
            return None
        return self.interruption_start_s + max(0.0, self.interruption_duration_s)


@dataclass(frozen=True)
class Sample:
    time_s: float
    state: State
    thrust_n: float


def circular_state(altitude_m: float, propellant_kg: float) -> State:
    """Return a +x position and +y velocity for an exact circular orbit."""

    radius_m = EARTH_RADIUS + altitude_m
    speed_m_s = math.sqrt(MU_EARTH / radius_m)
    return (radius_m, 0.0, 0.0, speed_m_s, propellant_kg)


def is_interrupted(config: SimulationConfig, time_s: float) -> bool:
    start = config.interruption_start_s
    end = config.interruption_end_s
    return start is not None and end is not None and start <= time_s < end


def thrust_is_commanded(
    config: SimulationConfig, time_s: float, propellant_kg: float
) -> bool:
    return (
        config.nominal_thrust_n > 0.0
        and propellant_kg > 0.0
        and not is_interrupted(config, time_s)
    )


def derivative(state: State, config: SimulationConfig, thrust_on: bool) -> State:
    """Evaluate the stated two-body and ideal electric-propulsion equations."""

    x_m, y_m, vx_m_s, vy_m_s, propellant_kg = state
    radius_m = math.hypot(x_m, y_m)
    if radius_m <= 0.0:
        raise ValueError("Position magnitude must be positive")

    gravity_factor = -MU_EARTH / (radius_m * radius_m * radius_m)
    ax_m_s2 = gravity_factor * x_m
    ay_m_s2 = gravity_factor * y_m
    dpropellant_kg_s = 0.0

    if thrust_on:
        speed_m_s = math.hypot(vx_m_s, vy_m_s)
        if speed_m_s <= 0.0:
            raise ValueError("Prograde guidance is undefined at zero speed")
        total_mass_kg = config.dry_mass_kg + max(0.0, propellant_kg)
        thrust_acceleration_m_s2 = config.nominal_thrust_n / total_mass_kg
        ax_m_s2 += thrust_acceleration_m_s2 * vx_m_s / speed_m_s
        ay_m_s2 += thrust_acceleration_m_s2 * vy_m_s / speed_m_s
        dpropellant_kg_s = -config.mass_flow_kg_s

    return (vx_m_s, vy_m_s, ax_m_s2, ay_m_s2, dpropellant_kg_s)


def add_scaled(state: State, slope: State, scale: float) -> State:
    return tuple(
        value + scale * derivative_value
        for value, derivative_value in zip(state, slope)
    )  # type: ignore[return-value]


def rk4_step(
    state: State, step_s: float, config: SimulationConfig, thrust_on: bool
) -> State:
    """Advance one smooth segment with classical fourth-order Runge--Kutta."""

    k1 = derivative(state, config, thrust_on)
    k2 = derivative(add_scaled(state, k1, 0.5 * step_s), config, thrust_on)
    k3 = derivative(add_scaled(state, k2, 0.5 * step_s), config, thrust_on)
    k4 = derivative(add_scaled(state, k3, step_s), config, thrust_on)
    result = tuple(
        value
        + (step_s / 6.0)
        * (slope1 + 2.0 * slope2 + 2.0 * slope3 + slope4)
        for value, slope1, slope2, slope3, slope4 in zip(state, k1, k2, k3, k4)
    )
    # An event-aligned exhaustion step can end a few ulps below zero.
    if result[4] < 0.0 and result[4] > -1.0e-11:
        result = result[:4] + (0.0,)
    return result  # type: ignore[return-value]


def event_boundaries(config: SimulationConfig) -> Tuple[float, ...]:
    boundaries: List[float] = []
    if config.interruption_start_s is not None:
        boundaries.append(config.interruption_start_s)
    if config.interruption_end_s is not None:
        boundaries.append(config.interruption_end_s)
    return tuple(sorted(boundary for boundary in boundaries if boundary >= 0.0))


def propagate(
    initial_state: State,
    config: SimulationConfig,
    duration_s: float,
    nominal_step_s: float,
) -> List[Sample]:
    """Propagate while aligning RK4 steps with every discontinuity."""

    if duration_s < 0.0:
        raise ValueError("Duration must be non-negative")
    if nominal_step_s <= 0.0:
        raise ValueError("Step size must be positive")
    if config.dry_mass_kg <= 0.0 or config.initial_propellant_kg < 0.0:
        raise ValueError("Masses must be physically valid")
    if config.isp_s <= 0.0:
        raise ValueError("Specific impulse must be positive")
    if not 0.0 <= config.efficiency <= 1.0:
        raise ValueError("Efficiency must lie in [0, 1]")

    state = initial_state
    time_s = 0.0
    initial_thrust_n = (
        config.nominal_thrust_n
        if thrust_is_commanded(config, time_s, state[4])
        else 0.0
    )
    samples = [Sample(time_s=time_s, state=state, thrust_n=initial_thrust_n)]
    boundaries = event_boundaries(config)
    time_epsilon_s = 1.0e-10

    while time_s < duration_s - time_epsilon_s:
        step_s = min(nominal_step_s, duration_s - time_s)

        # Split at interruption start/end.  The midpoint then selects a single
        # smooth right-hand side for all four RK stages in this segment.
        next_boundary: Optional[float] = None
        for boundary_s in boundaries:
            if time_s + time_epsilon_s < boundary_s < time_s + step_s - time_epsilon_s:
                next_boundary = boundary_s
                step_s = boundary_s - time_s
                break
            if abs((time_s + step_s) - boundary_s) <= time_epsilon_s:
                next_boundary = boundary_s
                step_s = boundary_s - time_s
                break

        probe_time_s = time_s + 0.5 * step_s
        thrust_on = thrust_is_commanded(config, probe_time_s, state[4])

        # Mass flow is constant while firing, so exhaustion time is analytic.
        # Split there too, keeping the final RK stage on the left-hand branch.
        exhausted_at_end = False
        if thrust_on and config.mass_flow_kg_s > 0.0:
            time_to_empty_s = state[4] / config.mass_flow_kg_s
            if time_to_empty_s <= time_epsilon_s:
                state = state[:4] + (0.0,)
                thrust_on = False
            elif time_to_empty_s < step_s - time_epsilon_s:
                step_s = time_to_empty_s
                exhausted_at_end = True
                next_boundary = None
            elif abs(time_to_empty_s - step_s) <= time_epsilon_s:
                exhausted_at_end = True

        state = rk4_step(state, step_s, config, thrust_on)
        time_s += step_s
        if next_boundary is not None and abs(time_s - next_boundary) <= time_epsilon_s:
            time_s = next_boundary
        if exhausted_at_end:
            state = state[:4] + (0.0,)

        radius_m = math.hypot(state[0], state[1])
        if radius_m <= EARTH_RADIUS:
            raise RuntimeError(
                f"Earth impact detected at t={time_s:.6f} s (r={radius_m:.3f} m)"
            )

        sample_thrust_n = (
            config.nominal_thrust_n
            if thrust_is_commanded(config, time_s, state[4])
            else 0.0
        )
        samples.append(
            Sample(time_s=time_s, state=state, thrust_n=sample_thrust_n)
        )

    return samples


def orbital_invariants(state: State) -> Tuple[float, float, float, float]:
    """Return radius, specific energy, specific angular momentum, eccentricity."""

    x_m, y_m, vx_m_s, vy_m_s, _ = state
    radius_m = math.hypot(x_m, y_m)
    speed_squared_m2_s2 = vx_m_s * vx_m_s + vy_m_s * vy_m_s
    specific_energy_j_kg = 0.5 * speed_squared_m2_s2 - MU_EARTH / radius_m
    specific_angular_momentum_m2_s = x_m * vy_m_s - y_m * vx_m_s

    # Planar form of e_vec = (v x h)/mu - r_hat.
    eccentricity_x = vy_m_s * specific_angular_momentum_m2_s / MU_EARTH - x_m / radius_m
    eccentricity_y = -vx_m_s * specific_angular_momentum_m2_s / MU_EARTH - y_m / radius_m
    eccentricity = math.hypot(eccentricity_x, eccentricity_y)
    return (
        radius_m,
        specific_energy_j_kg,
        specific_angular_momentum_m2_s,
        eccentricity,
    )


def relative_error(value: float, reference: float) -> float:
    if reference == 0.0:
        return abs(value - reference)
    return abs((value - reference) / reference)


def make_check(
    name: str,
    description: str,
    settings: Dict[str, Any],
    measured: Dict[str, Any],
    thresholds: Dict[str, Any],
    passed: bool,
) -> Dict[str, Any]:
    return {
        "name": name,
        "description": description,
        "passed": passed,
        "settings": settings,
        "measured": measured,
        "thresholds": thresholds,
    }


def check_unpowered_circular_orbit() -> Dict[str, Any]:
    altitude_m = 400_000.0
    duration_s = 86_400.0
    step_s = 10.0
    config = SimulationConfig(
        dry_mass_kg=700.0,
        initial_propellant_kg=0.0,
        power_w=0.0,
        isp_s=3_000.0,
        efficiency=0.65,
    )
    samples = propagate(
        circular_state(altitude_m, config.initial_propellant_kg),
        config,
        duration_s,
        step_s,
    )
    initial_radius, initial_energy, initial_h, _ = orbital_invariants(samples[0].state)

    max_radius_error_m = 0.0
    max_relative_energy_error = 0.0
    max_relative_h_error = 0.0
    max_eccentricity = 0.0
    for sample in samples:
        radius_m, energy, angular_momentum, eccentricity = orbital_invariants(sample.state)
        max_radius_error_m = max(max_radius_error_m, abs(radius_m - initial_radius))
        max_relative_energy_error = max(
            max_relative_energy_error, relative_error(energy, initial_energy)
        )
        max_relative_h_error = max(
            max_relative_h_error, relative_error(angular_momentum, initial_h)
        )
        max_eccentricity = max(max_eccentricity, eccentricity)

    thresholds = {
        "max_radius_error_m": 1.0,
        "max_relative_specific_energy_error": 1.0e-9,
        "max_relative_specific_angular_momentum_error": 1.0e-9,
        "max_eccentricity": 1.0e-7,
    }
    measured = {
        "max_radius_error_m": max_radius_error_m,
        "max_relative_specific_energy_error": max_relative_energy_error,
        "max_relative_specific_angular_momentum_error": max_relative_h_error,
        "max_eccentricity": max_eccentricity,
        "initial_radius_m": initial_radius,
        "initial_speed_m_s": samples[0].state[3],
    }
    passed = (
        max_radius_error_m <= thresholds["max_radius_error_m"]
        and max_relative_energy_error
        <= thresholds["max_relative_specific_energy_error"]
        and max_relative_h_error
        <= thresholds["max_relative_specific_angular_momentum_error"]
        and max_eccentricity <= thresholds["max_eccentricity"]
    )
    return make_check(
        "unpowered_circular_orbit",
        "An unpowered 400 km circular orbit preserves radius, energy, and angular momentum for 24 h.",
        {"altitude_m": altitude_m, "duration_s": duration_s, "rk4_step_s": step_s},
        measured,
        thresholds,
        passed,
    )


def check_analytical_propellant_use() -> Dict[str, Any]:
    duration_s = 21_600.0
    step_s = 10.0
    config = SimulationConfig(
        dry_mass_kg=600.0,
        initial_propellant_kg=40.0,
        power_w=5_000.0,
        isp_s=2_500.0,
        efficiency=0.65,
    )
    samples = propagate(
        circular_state(400_000.0, config.initial_propellant_kg),
        config,
        duration_s,
        step_s,
    )
    numerical_use_kg = config.initial_propellant_kg - samples[-1].state[4]
    analytical_use_kg = config.mass_flow_kg_s * duration_s
    absolute_error_kg = abs(numerical_use_kg - analytical_use_kg)
    relative_use_error = relative_error(numerical_use_kg, analytical_use_kg)

    thresholds = {
        "max_absolute_propellant_error_kg": 1.0e-9,
        "max_relative_propellant_error": 1.0e-9,
    }
    measured = {
        "nominal_thrust_n": config.nominal_thrust_n,
        "mass_flow_kg_s": config.mass_flow_kg_s,
        "analytical_propellant_use_kg": analytical_use_kg,
        "numerical_propellant_use_kg": numerical_use_kg,
        "absolute_propellant_error_kg": absolute_error_kg,
        "relative_propellant_error": relative_use_error,
    }
    passed = (
        absolute_error_kg <= thresholds["max_absolute_propellant_error_kg"]
        and relative_use_error <= thresholds["max_relative_propellant_error"]
    )
    return make_check(
        "analytical_propellant_use",
        "Constant-power burn agrees with m_used=(T/v_e)t.",
        {
            "duration_s": duration_s,
            "rk4_step_s": step_s,
            "power_w": config.power_w,
            "isp_s": config.isp_s,
            "efficiency": config.efficiency,
        },
        measured,
        thresholds,
        passed,
    )


def terminal_state_for_step(step_s: float) -> State:
    config = SimulationConfig(
        dry_mass_kg=600.0,
        initial_propellant_kg=40.0,
        power_w=5_000.0,
        isp_s=2_500.0,
        efficiency=0.65,
    )
    return propagate(
        circular_state(400_000.0, config.initial_propellant_kg),
        config,
        duration_s=36_000.0,
        nominal_step_s=step_s,
    )[-1].state


def terminal_deltas(first: State, second: State) -> Tuple[float, float, float]:
    position_delta_m = math.hypot(first[0] - second[0], first[1] - second[1])
    velocity_delta_m_s = math.hypot(first[2] - second[2], first[3] - second[3])
    propellant_delta_kg = abs(first[4] - second[4])
    return position_delta_m, velocity_delta_m_s, propellant_delta_kg


def finite_ratio(numerator: float, denominator: float) -> Optional[float]:
    if denominator == 0.0:
        return None
    return numerator / denominator


def observed_order(error_ratio: Optional[float]) -> Optional[float]:
    if error_ratio is None or error_ratio <= 0.0:
        return None
    return math.log(error_ratio, 2.0)


def ratio_passes(ratio: Optional[float], minimum: float, numerator: float) -> bool:
    # A zero finer-grid difference is exact convergence for this comparison.
    return ratio is None and numerator >= 0.0 or ratio is not None and ratio >= minimum


def check_step_convergence() -> Dict[str, Any]:
    coarse_step_s = 40.0
    medium_step_s = 20.0
    fine_step_s = 10.0
    coarse = terminal_state_for_step(coarse_step_s)
    medium = terminal_state_for_step(medium_step_s)
    fine = terminal_state_for_step(fine_step_s)

    coarse_medium = terminal_deltas(coarse, medium)
    medium_fine = terminal_deltas(medium, fine)
    position_ratio = finite_ratio(coarse_medium[0], medium_fine[0])
    velocity_ratio = finite_ratio(coarse_medium[1], medium_fine[1])

    thresholds = {
        "minimum_position_error_reduction_ratio": 8.0,
        "minimum_velocity_error_reduction_ratio": 8.0,
        "max_medium_to_fine_position_delta_m": 25.0,
        "max_medium_to_fine_velocity_delta_m_s": 0.03,
        "max_medium_to_fine_propellant_delta_kg": 1.0e-9,
    }
    measured = {
        "coarse_to_medium_position_delta_m": coarse_medium[0],
        "medium_to_fine_position_delta_m": medium_fine[0],
        "position_error_reduction_ratio": position_ratio,
        "observed_position_order": observed_order(position_ratio),
        "coarse_to_medium_velocity_delta_m_s": coarse_medium[1],
        "medium_to_fine_velocity_delta_m_s": medium_fine[1],
        "velocity_error_reduction_ratio": velocity_ratio,
        "observed_velocity_order": observed_order(velocity_ratio),
        "medium_to_fine_propellant_delta_kg": medium_fine[2],
    }
    passed = (
        ratio_passes(
            position_ratio,
            thresholds["minimum_position_error_reduction_ratio"],
            coarse_medium[0],
        )
        and ratio_passes(
            velocity_ratio,
            thresholds["minimum_velocity_error_reduction_ratio"],
            coarse_medium[1],
        )
        and medium_fine[0]
        <= thresholds["max_medium_to_fine_position_delta_m"]
        and medium_fine[1]
        <= thresholds["max_medium_to_fine_velocity_delta_m_s"]
        and medium_fine[2]
        <= thresholds["max_medium_to_fine_propellant_delta_kg"]
    )
    return make_check(
        "rk4_step_convergence",
        "A powered trajectory approaches a common terminal state as RK4 step size is halved.",
        {
            "duration_s": 36_000.0,
            "coarse_step_s": coarse_step_s,
            "medium_step_s": medium_step_s,
            "fine_step_s": fine_step_s,
        },
        measured,
        thresholds,
        passed,
    )


def find_sample(samples: Sequence[Sample], target_time_s: float) -> Sample:
    closest = min(samples, key=lambda sample: abs(sample.time_s - target_time_s))
    if abs(closest.time_s - target_time_s) > 1.0e-8:
        raise AssertionError(f"No event-aligned sample at t={target_time_s}")
    return closest


def check_interruption() -> Dict[str, Any]:
    duration_s = 14_400.0
    step_s = 30.0
    interruption_start_s = 5_432.5
    interruption_duration_s = 1_789.25
    interruption_end_s = interruption_start_s + interruption_duration_s
    config = SimulationConfig(
        dry_mass_kg=600.0,
        initial_propellant_kg=40.0,
        power_w=5_000.0,
        isp_s=2_500.0,
        efficiency=0.65,
        interruption_start_s=interruption_start_s,
        interruption_duration_s=interruption_duration_s,
    )
    samples = propagate(
        circular_state(400_000.0, config.initial_propellant_kg),
        config,
        duration_s,
        step_s,
    )

    at_start = find_sample(samples, interruption_start_s)
    at_end = find_sample(samples, interruption_end_s)
    outage_samples = [
        sample
        for sample in samples
        if interruption_start_s <= sample.time_s < interruption_end_s
    ]
    before_samples = [sample for sample in samples if sample.time_s < interruption_start_s]
    immediately_before = before_samples[-1]

    max_outage_thrust_n = max(sample.thrust_n for sample in outage_samples)
    propellant_change_during_outage_kg = abs(at_end.state[4] - at_start.state[4])
    propellant_span_during_outage_kg = max(
        sample.state[4] for sample in outage_samples
    ) - min(sample.state[4] for sample in outage_samples)
    expected_burn_s = duration_s - interruption_duration_s
    expected_use_kg = config.mass_flow_kg_s * expected_burn_s
    numerical_use_kg = config.initial_propellant_kg - samples[-1].state[4]
    propellant_use_error_kg = abs(numerical_use_kg - expected_use_kg)

    thresholds = {
        "max_outage_thrust_n": 0.0,
        "max_propellant_change_during_outage_kg": 1.0e-12,
        "max_propellant_span_during_outage_kg": 1.0e-12,
        "max_interrupted_burn_propellant_error_kg": 1.0e-9,
        "minimum_bracketing_thrust_n": 1.0e-12,
    }
    measured = {
        "interruption_start_sample_time_s": at_start.time_s,
        "interruption_end_sample_time_s": at_end.time_s,
        "outage_sample_count": len(outage_samples),
        "max_outage_thrust_n": max_outage_thrust_n,
        "propellant_change_during_outage_kg": propellant_change_during_outage_kg,
        "propellant_span_during_outage_kg": propellant_span_during_outage_kg,
        "thrust_immediately_before_outage_n": immediately_before.thrust_n,
        "thrust_at_outage_end_n": at_end.thrust_n,
        "expected_propellant_use_kg": expected_use_kg,
        "numerical_propellant_use_kg": numerical_use_kg,
        "interrupted_burn_propellant_error_kg": propellant_use_error_kg,
    }
    passed = (
        max_outage_thrust_n == thresholds["max_outage_thrust_n"]
        and propellant_change_during_outage_kg
        <= thresholds["max_propellant_change_during_outage_kg"]
        and propellant_span_during_outage_kg
        <= thresholds["max_propellant_span_during_outage_kg"]
        and propellant_use_error_kg
        <= thresholds["max_interrupted_burn_propellant_error_kg"]
        and immediately_before.thrust_n
        >= thresholds["minimum_bracketing_thrust_n"]
        and at_end.thrust_n >= thresholds["minimum_bracketing_thrust_n"]
    )
    return make_check(
        "engine_interruption",
        "The event-aligned interruption has exactly zero thrust and constant mass on [start, end).",
        {
            "duration_s": duration_s,
            "nominal_rk4_step_s": step_s,
            "interruption_start_s": interruption_start_s,
            "interruption_duration_s": interruption_duration_s,
            "interruption_end_s": interruption_end_s,
        },
        measured,
        thresholds,
        passed,
    )


def validation_report() -> Dict[str, Any]:
    checks = [
        check_unpowered_circular_orbit(),
        check_analytical_propellant_use(),
        check_step_convergence(),
        check_interruption(),
    ]
    return {
        "model": {
            "dimensions": "planar Earth-centred inertial, SI units",
            "state": ["x_m", "y_m", "vx_m_s", "vy_m_s", "propellant_kg"],
            "equations": {
                "gravity": "a_g = -mu r / |r|^3",
                "exhaust_velocity": "v_e = Isp g0",
                "thrust": "T = 2 eta P / v_e",
                "mass_flow": "dm_prop/dt = -T / v_e",
                "guidance": "a_T = (T/m) v/|v| while commanded",
            },
            "integrator": (
                "classical fixed-step RK4 with shorter event-alignment steps at "
                "interruption boundaries and propellant exhaustion"
            ),
            "constants": {
                "earth_mu_m3_s2": MU_EARTH,
                "earth_volumetric_mean_radius_m": EARTH_RADIUS,
                "standard_gravity_m_s2": G0,
            },
            "sources": SOURCES,
        },
        "checks": checks,
        "overall_passed": all(check["passed"] for check in checks),
    }


def printable_value(value: Any) -> str:
    if isinstance(value, bool):
        return "yes" if value else "no"
    if value is None:
        return "exact/undefined ratio"
    if isinstance(value, float):
        if value == 0.0:
            return "0"
        if abs(value) >= 1.0e4 or abs(value) < 1.0e-3:
            return f"{value:.6e}"
        return f"{value:.9f}"
    return str(value)


def print_human_report(report: Dict[str, Any]) -> None:
    print("Rievastra independent physics validation")
    print("=" * 42)
    for check in report["checks"]:
        status = "PASS" if check["passed"] else "FAIL"
        print(f"\n[{status}] {check['name']}")
        print(f"  {check['description']}")
        print("  measured:")
        for key, value in check["measured"].items():
            print(f"    {key}: {printable_value(value)}")
        print("  thresholds:")
        for key, value in check["thresholds"].items():
            print(f"    {key}: {printable_value(value)}")
    overall = "PASS" if report["overall_passed"] else "FAIL"
    print(f"\nOverall: {overall}")


def parse_args(argv: Optional[Sequence[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--json",
        action="store_true",
        help="emit the complete validation report as JSON",
    )
    return parser.parse_args(argv)


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = parse_args(argv)
    try:
        report = validation_report()
    except Exception as error:  # Make failures machine-visible without a traceback-only result.
        if args.json:
            print(
                json.dumps(
                    {
                        "overall_passed": False,
                        "error": f"{type(error).__name__}: {error}",
                    },
                    indent=2,
                    sort_keys=True,
                )
            )
        else:
            print(f"Validation error: {type(error).__name__}: {error}", file=sys.stderr)
        return 2

    if args.json:
        print(json.dumps(report, indent=2, sort_keys=True, allow_nan=False))
    else:
        print_human_report(report)
    return 0 if report["overall_passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
