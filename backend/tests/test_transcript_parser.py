from app.transcript_parser import parse_transcript_text


def test_parse_transcript_text_extracts_course_rows():
    raw = """
    COSC 1P02 Intro to Computer Science 84
    MATH1P66 Calculus I B+
    STAT 1P98 Statistics 76
    """
    parsed = parse_transcript_text(raw)
    codes = [row.code for row in parsed.courses]
    assert "COSC1P02" in codes
    assert "MATH1P66" in codes
    assert "STAT1P98" in codes
    assert len(parsed.courses) == 3


def test_parse_transcript_text_tracks_unparsed_course_lines():
    raw = "COSC2P03 Data Structures Final Grade: pending"
    parsed = parse_transcript_text(raw)
    assert not parsed.courses
    assert parsed.unparsed_lines


def test_extract_grade_prefers_percent_letter_pair():
    from app.transcript_parser import _extract_grade

    assert _extract_grade("COSC 1P50 Integrity 0.50 83 A trailing") == 83
    assert _extract_grade("foo 70 B- bar") == 70


def test_parse_transcript_flattened_single_line_extracts_every_row():
    """Simulates pypdf + _clean_text: one line, many course codes (common for table PDFs)."""
    raw = (
        "CODE DESCRIPTION WEIGHT GRADE COSC 1P50 Integrity 0.50 83 A "
        "COSC 3P32 Introduction to Database Systems 0.50 70 B "
        "COSC 1P02 Introduction to Computer Science 0.50 60 C"
    )
    parsed = parse_transcript_text(raw)
    codes = [row.code for row in parsed.courses]
    assert len(parsed.courses) == 3
    assert "COSC1P50" in codes
    assert "COSC3P32" in codes
    assert "COSC1P02" in codes
