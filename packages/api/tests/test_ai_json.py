from core.ai_json import parse_ai_json_object


def test_strip_markdown_fence():
    out = parse_ai_json_object('```json\n{"a": 1, "b": 2}\n```')
    assert out == {"a": 1, "b": 2}


def test_trailing_comma_repair():
    out = parse_ai_json_object('{"a": 1, "b": [2, 3,],}')
    assert out == {"a": 1, "b": [2, 3]}


def test_extract_from_prose():
    raw = 'Here is the data:\n{"x": true}\nThanks.'
    assert parse_ai_json_object(raw) == {"x": True}
