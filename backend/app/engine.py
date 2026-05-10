from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from .models import (
    AnalyzeProfileResponse,
    CareerMatchItem,
    ConfidenceBadge,
    ENJOYMENT_WEIGHTS,
    NormalizedCourseSignal,
    PrerequisiteResult,
    RecommendationItem,
    StudentProfileInput,
)


@dataclass
class Catalog:
    courses: list[dict[str, Any]]
    programs: list[dict[str, Any]]
    career_paths: list[dict[str, Any]]


def _clamp(value: float, minimum: float = 0.0, maximum: float = 1.0) -> float:
    return max(minimum, min(maximum, value))


def _subject_prefix(course_code: str) -> str:
    code = course_code.upper().strip()
    i = 0
    while i < len(code) and code[i].isalpha():
        i += 1
    return code[:i] if i else code


def _resolve_active_program(
    catalog: Catalog,
    program_id: str | None,
) -> tuple[dict[str, Any] | None, str, str]:
    programs = catalog.programs or []
    if not programs:
        return None, "pathwise-explore", "All disciplines (eligible next courses)"

    by_id = {p["program_id"]: p for p in programs}
    pid = (program_id or "pathwise-explore").strip()
    prog = by_id.get(pid) or by_id.get("pathwise-explore") or programs[0]
    return prog, prog["program_id"], prog["name"]


def _course_in_program_track(course_code: str, program: dict[str, Any] | None) -> bool:
    if program is None:
        return True
    prefixes = program.get("subject_prefixes") or []
    if not prefixes:
        return True
    return _subject_prefix(course_code) in prefixes


def _program_track_boost(program: dict[str, Any] | None, course_code: str) -> tuple[float, str | None]:
    """Raise scores slightly when a course appears on the selected program template lists."""
    if not program:
        return 0.0, None
    prefixes = program.get("subject_prefixes") or []
    if not prefixes:
        return 0.0, None

    boost = 0.0
    tags: list[str] = []
    core = set(program.get("required_core") or [])
    sup = set(program.get("recommended_supporting") or [])
    upper = set(program.get("sample_upper_year_options") or [])

    if course_code in core:
        boost += 0.09
        tags.append("program core")
    elif course_code in sup:
        boost += 0.05
        tags.append("recommended supporting")
    elif course_code in upper:
        boost += 0.04
        tags.append("upper-year sample")

    note = "; ".join(tags) if tags else None
    return min(boost, 0.14), note


def normalize_student_courses(profile: StudentProfileInput) -> tuple[list[NormalizedCourseSignal], list[str]]:
    by_code: dict[str, NormalizedCourseSignal] = {}
    unknown: list[str] = []

    for row in profile.completed_courses:
        code = row.counts_as if row.transfer and row.counts_as else row.code
        if row.transfer and not row.counts_as:
            unknown.append(row.code)
            continue

        enjoyment_weight = ENJOYMENT_WEIGHTS[row.enjoyment]
        # Significantly increase weight of confidence and enjoyment
        mastery = _clamp((row.grade / 100.0) * (0.5 + (row.confidence / 10.0)) + (enjoyment_weight * 0.15))
        signal = NormalizedCourseSignal(
            code=code,
            grade=float(row.grade),
            confidence=float(row.confidence),
            enjoyment=row.enjoyment,
            enjoyment_weight=enjoyment_weight,
            mastery=round(mastery, 4),
            notes=row.notes,
        )

        previous = by_code.get(code)
        if previous is None or signal.grade > previous.grade:
            by_code[code] = signal

    return list(by_code.values()), sorted(set(unknown))


def evaluate_prerequisites(
    course: dict[str, Any],
    completed_map: dict[str, NormalizedCourseSignal],
    allowed_restriction_groups: list[str],
) -> PrerequisiteResult:
    prereq = course.get("prerequisites", {})
    requires_all = prereq.get("requires_all", [])
    requires_one_of = prereq.get("requires_one_of", [])
    coreq = prereq.get("coreq", [])
    min_grade_by_course = prereq.get("min_grade_by_course", {})

    missing_all = [code for code in requires_all if code not in completed_map]
    missing_any_groups: list[list[str]] = []
    for group in requires_one_of:
        if not any(option in completed_map for option in group):
            missing_any_groups.append(group)

    missing_coreq = [code for code in coreq if code not in completed_map]

    for req_course, minimum_grade in min_grade_by_course.items():
        signal = completed_map.get(req_course)
        if signal is None or signal.grade < minimum_grade:
            if req_course not in missing_all:
                missing_all.append(req_course)

    restricted_to = course.get("restricted_to", [])
    restriction_blocked = False
    if restricted_to:
        allowed = set(allowed_restriction_groups or ["any"])
        if "any" not in allowed and not allowed.intersection(set(restricted_to)):
            restriction_blocked = True

    eligible = not missing_all and not missing_any_groups and not missing_coreq and not restriction_blocked
    reason: str | None = None
    if restriction_blocked:
        reason = "restriction_blocked"
    elif missing_all or missing_any_groups:
        reason = "missing_prerequisites"
    elif missing_coreq:
        reason = "missing_corequisites"

    return PrerequisiteResult(
        course_code=course["code"],
        eligible=eligible,
        missing_requires_all=missing_all,
        missing_requires_one_of=missing_any_groups,
        missing_coreq=missing_coreq,
        restriction_blocked=restriction_blocked,
        reason=reason,
    )


def _compute_cluster_strengths(
    normalized_courses: list[NormalizedCourseSignal],
    course_index: dict[str, dict[str, Any]],
) -> dict[str, float]:
    bucket_scores: dict[str, list[float]] = {}

    for signal in normalized_courses:
        course_meta = course_index.get(signal.code, {})
        clusters = course_meta.get("clusters", [])
        for cluster in clusters:
            bucket_scores.setdefault(cluster, []).append(signal.mastery)

    strengths: dict[str, float] = {}
    for cluster, values in bucket_scores.items():
        if values:
            strengths[cluster] = round(sum(values) / len(values), 4)
    return strengths


def _score_candidate(
    course: dict[str, Any],
    prereq_result: PrerequisiteResult,
    completed_map: dict[str, NormalizedCourseSignal],
    cluster_strengths: dict[str, float],
    sparse_history: bool,
    track_boost: float = 0.0,
    track_note: str | None = None,
) -> tuple[float, str, ConfidenceBadge, str]:
    clusters = course.get("clusters", [])
    cluster_component = 0.0
    if clusters:
        cluster_component = sum(cluster_strengths.get(cluster, 0.35) for cluster in clusters) / len(clusters)

    prereq = course.get("prerequisites", {})
    requires_all = prereq.get("requires_all", [])
    requires_one_of = prereq.get("requires_one_of", [])

    dependency_values: list[float] = []
    for req in requires_all:
        if req in completed_map:
            dependency_values.append(completed_map[req].mastery)
    for group in requires_one_of:
        best = max((completed_map[code].mastery for code in group if code in completed_map), default=0.0)
        if best > 0:
            dependency_values.append(best)

    dependency_component = sum(dependency_values) / len(dependency_values) if dependency_values else 0.3
    prereq_depth_penalty = 0.02 * (len(requires_all) + len(requires_one_of))

    base = _clamp((cluster_component * 0.65) + (dependency_component * 0.35) - prereq_depth_penalty)
    score = _clamp(base + track_boost)
    score = round(score, 4)

    if not prereq_result.eligible:
        label = "risky"
        score = min(score, 0.3)
    elif score >= 0.68:
        label = "safe"
    elif score >= 0.45:
        label = "stretch"
    else:
        label = "risky"

    if sparse_history:
        confidence_badge: ConfidenceBadge = "low"
    elif score >= 0.7:
        confidence_badge = "high"
    elif score >= 0.45:
        confidence_badge = "medium"
    else:
        confidence_badge = "low"

    rationale = f"Cluster fit={cluster_component:.2f}, dependency readiness={dependency_component:.2f}"
    if track_note:
        rationale += f", track={track_note}"
    if prereq_result.reason:
        rationale += f", status={prereq_result.reason}"

    return score, label, confidence_badge, rationale


def _cluster_badges(cluster_strengths: dict[str, float], sparse_history: bool) -> dict[str, ConfidenceBadge]:
    badges: dict[str, ConfidenceBadge] = {}
    for cluster, strength in cluster_strengths.items():
        if sparse_history:
            badges[cluster] = "low"
        elif strength >= 0.7:
            badges[cluster] = "high"
        elif strength >= 0.45:
            badges[cluster] = "medium"
        else:
            badges[cluster] = "low"
    return badges


def _career_matches(
    cluster_strengths: dict[str, float],
    career_paths: list[dict[str, Any]],
    sparse_history: bool,
) -> list[CareerMatchItem]:
    matches: list[CareerMatchItem] = []

    for path in career_paths:
        cluster_weights = path.get("cluster_weights", {})
        weighted_sum = 0.0
        total_weight = 0.0
        for cluster, weight in cluster_weights.items():
            weighted_sum += cluster_strengths.get(cluster, 0.25) * weight
            total_weight += weight

        score = round(_clamp(weighted_sum / total_weight if total_weight > 0 else 0.0), 4)
        if sparse_history:
            badge: ConfidenceBadge = "low"
        elif score >= 0.72:
            badge = "high"
        elif score >= 0.5:
            badge = "medium"
        else:
            badge = "low"

        strongest_clusters = sorted(
            cluster_weights.keys(),
            key=lambda cluster: cluster_strengths.get(cluster, 0.0),
            reverse=True,
        )[:2]
        cluster_text = ", ".join(strongest_clusters) if strongest_clusters else "limited evidence"
        why = f"Weighted cluster fit={score:.2f}; strongest signals in {cluster_text}"

        matches.append(
            CareerMatchItem(
                career_id=path["career_id"],
                title=path["title"],
                score=score,
                confidence_badge=badge,
                why=why,
                recommended_courses=path.get("recommended_courses", []),
            )
        )

    matches.sort(key=lambda item: item.score, reverse=True)
    return matches[:5]


def analyze_profile(
    profile: StudentProfileInput,
    catalog: Catalog,
    *,
    recommendation_limit: int = 10,
) -> AnalyzeProfileResponse:
    course_index = {course["code"]: course for course in catalog.courses}
    normalized_courses, transfer_unknowns = normalize_student_courses(profile)
    completed_map = {row.code: row for row in normalized_courses}

    unknown_codes = [row.code for row in profile.completed_courses if row.code not in course_index and not row.transfer]
    unknown_codes.extend(transfer_unknowns)
    unknown_codes = sorted(set(unknown_codes))

    total_credits_completed = 0.0
    for row in normalized_courses:
        course_meta = course_index.get(row.code, {})
        credits = float(course_meta.get("credits") or 0.5)
        total_credits_completed += credits

    cluster_strengths = _compute_cluster_strengths(normalized_courses, course_index)
    sparse_history = len(normalized_courses) < 3

    active_program, active_program_id, active_program_name = _resolve_active_program(
        catalog,
        profile.program_id,
    )

    recommendations: list[RecommendationItem] = []
    completed_codes = set(completed_map.keys())

    for course in catalog.courses:
        if course["code"] in completed_codes:
            continue

        if not _course_in_program_track(course["code"], active_program):
            continue

        prereq_result = evaluate_prerequisites(
            course=course,
            completed_map=completed_map,
            allowed_restriction_groups=profile.allowed_restriction_groups,
        )

        t_boost, t_note = _program_track_boost(active_program, course["code"])
        score, label, confidence_badge, why = _score_candidate(
            course=course,
            prereq_result=prereq_result,
            completed_map=completed_map,
            cluster_strengths=cluster_strengths,
            sparse_history=sparse_history,
            track_boost=t_boost,
            track_note=t_note,
        )

        if not prereq_result.eligible:
            continue

        credits = float(course.get("credits") or 0.5)
        recommendations.append(
            RecommendationItem(
                course_code=course["code"],
                title=course["title"],
                score=score,
                label=label,
                confidence_badge=confidence_badge,
                why=why,
                unmet_details=prereq_result.model_dump(exclude={"course_code", "eligible"}),
                credits=credits,
                clusters=list(course.get("clusters") or []),
                tags=list(course.get("tags") or []),
                track_note=t_note,
            )
        )

    recommendations.sort(key=lambda item: item.score, reverse=True)
    career_matches = _career_matches(
        cluster_strengths=cluster_strengths,
        career_paths=catalog.career_paths,
        sparse_history=sparse_history,
    )

    cap = max(1, recommendation_limit)
    return AnalyzeProfileResponse(
        student_id=profile.student_id,
        unknown_courses=unknown_codes,
        cluster_strengths=cluster_strengths,
        cluster_confidence_badges=_cluster_badges(cluster_strengths, sparse_history),
        recommendations=recommendations[:cap],
        career_matches=career_matches,
        disclaimer="",
        active_program_id=active_program_id,
        active_program_name=active_program_name,
        total_credits_completed=total_credits_completed,
        total_credits_required=20.0,
        ranking_source="deterministic",
    )
