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
