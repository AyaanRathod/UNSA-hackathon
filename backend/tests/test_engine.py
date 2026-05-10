from app.engine import Catalog, analyze_profile, evaluate_prerequisites
from app.models import StudentProfileInput


def _catalog() -> Catalog:
    courses = [
        {
            "code": "COSC1P02",
            "title": "Intro I",
            "clusters": ["programming"],
            "prerequisites": {"requires_all": [], "requires_one_of": [], "coreq": []},
        },
        {
            "code": "COSC1P03",
            "title": "Intro II",
            "clusters": ["programming"],
            "prerequisites": {"requires_all": ["COSC1P02"], "requires_one_of": [], "coreq": []},
        },
        {
            "code": "COSC2P03",
            "title": "Data Structures",
            "clusters": ["programming", "theory"],
            "prerequisites": {"requires_all": ["COSC1P03"], "requires_one_of": [], "coreq": []},
        },
        {
            "code": "COSC4P76",
            "title": "Machine Learning",
            "clusters": ["ai", "math"],
            "prerequisites": {
                "requires_all": ["COSC2P03"],
                "requires_one_of": [["STAT1P98", "MATH1P98"]],
                "coreq": [],
            },
            "restricted_to": ["cs_major"],
        },
        {
            "code": "STAT1P98",
            "title": "Stats",
            "clusters": ["data", "math"],
            "prerequisites": {"requires_all": [], "requires_one_of": [], "coreq": []},
        },
    ]
    career_paths = [
        {
            "career_id": "software-engineer",
            "title": "Software Engineer",
            "cluster_weights": {"programming": 0.5, "project": 0.3, "systems": 0.2},
            "recommended_courses": ["COSC2P90"],
        },
        {
            "career_id": "ml-engineer",
            "title": "ML Engineer",
            "cluster_weights": {"ai": 0.5, "math": 0.3, "data": 0.2},
            "recommended_courses": ["COSC4P76"],
        },
    ]
    return Catalog(courses=courses, programs=[], career_paths=career_paths)


def test_prerequisite_requires_all_and_one_of():
    catalog = _catalog()
    completed_map = {
        "COSC2P03": type("Signal", (), {"grade": 85, "mastery": 0.82})(),
    }

    result = evaluate_prerequisites(
        course=catalog.courses[3],
        completed_map=completed_map,
        allowed_restriction_groups=["cs_major"],
    )
    assert not result.eligible
    assert result.missing_requires_one_of == [["STAT1P98", "MATH1P98"]]


def test_prerequisite_restriction_blocks_course():
    catalog = _catalog()
    completed_map = {
        "COSC2P03": type("Signal", (), {"grade": 85, "mastery": 0.82})(),
        "STAT1P98": type("Signal", (), {"grade": 80, "mastery": 0.77})(),
    }

    result = evaluate_prerequisites(
        course=catalog.courses[3],
        completed_map=completed_map,
        allowed_restriction_groups=["open_studies"],
    )
    assert not result.eligible
    assert result.restriction_blocked is True


def test_scoring_generates_safe_label_for_strong_fit():
    profile = StudentProfileInput(
        student_id="s1",
        allowed_restriction_groups=["cs_major"],
        completed_courses=[
            {"code": "COSC1P02", "grade": 90, "confidence": 5, "enjoyment": "liked"},
            {"code": "COSC1P03", "grade": 88, "confidence": 8, "enjoyment": "liked"},
        ],
    )
    response = analyze_profile(profile, _catalog())
    course_labels = {row.course_code: row.label for row in response.recommendations}
    assert course_labels["COSC2P03"] == "safe"


def test_scoring_generates_stretch_or_risky_for_sparse_history():
    profile = StudentProfileInput(
        student_id="s2",
        completed_courses=[
            {"code": "COSC1P02", "grade": "62", "confidence": 2, "enjoyment": "neutral"},
        ],
        allowed_restriction_groups=["cs_major"],
    )
    response = analyze_profile(profile, _catalog())
    assert response.cluster_confidence_badges["programming"] == "low"


def test_missing_coreq_is_not_eligible():
    course = {
        "code": "COSC4P90",
        "title": "Capstone",
        "clusters": ["project"],
        "prerequisites": {
            "requires_all": ["COSC2P91"],
            "requires_one_of": [],
            "coreq": ["COSC4P14"],
        },
    }
    completed_map = {
        "COSC2P91": type("Signal", (), {"grade": 80, "mastery": 0.78})(),
    }
    result = evaluate_prerequisites(
        course=course,
        completed_map=completed_map,
        allowed_restriction_groups=["cs_major"],
    )
    assert not result.eligible
    assert result.reason == "missing_corequisites"


def test_program_track_filters_to_subject_prefixes():
    """When catalog includes program definitions, only matching subjects are recommended."""
    courses = [
        {
            "code": "COSC1P03",
            "title": "Intro II",
            "credits": 0.5,
            "clusters": ["programming"],
            "prerequisites": {"requires_all": [], "requires_one_of": [], "coreq": []},
        },
        {
            "code": "FNCE2P91",
            "title": "Corporate Finance I",
            "credits": 0.5,
            "clusters": ["business", "finance"],
            "prerequisites": {"requires_all": [], "requires_one_of": [], "coreq": []},
        },
    ]
    programs = [
        {
            "program_id": "brock-cs-bsc",
            "name": "CS",
            "subject_prefixes": ["COSC", "MATH"],
            "required_core": [],
            "recommended_supporting": [],
            "sample_upper_year_options": [],
        }
    ]
    catalog = Catalog(courses=courses, programs=programs, career_paths=[])
    profile = StudentProfileInput(
        student_id="t4",
        completed_courses=[],
        goals=[],
        program_id="brock-cs-bsc",
    )
    response = analyze_profile(profile, catalog)
    codes = {r.course_code for r in response.recommendations}
    assert "COSC1P03" in codes
    assert "FNCE2P91" not in codes


def test_career_matches_return_ranked_items():
    profile = StudentProfileInput(
        student_id="s3",
        allowed_restriction_groups=["cs_major"],
        completed_courses=[
            {"code": "COSC1P02", "grade": 92, "confidence": 5, "enjoyment": "liked"},
            {"code": "COSC1P03", "grade": 90, "confidence": 9, "enjoyment": "liked"},
            {"code": "COSC2P03", "grade": 88, "confidence": 9, "enjoyment": "liked"},
        ],
    )
    response = analyze_profile(profile, _catalog())
    assert response.career_matches
    assert response.career_matches[0].score >= response.career_matches[-1].score
