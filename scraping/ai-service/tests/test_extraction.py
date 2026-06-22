"""
Unit tests for the pure helpers of the table-extraction and assistant pipelines.
They exercise parsing/coercion/chunking logic without the heavy ML stack or the
local LLM (which are mocked away by only testing the deterministic functions).

Run from the ai-service directory:  python -m pytest tests/
"""
from routers.nlp import (
    _coerce_tables,
    _parse_json_tables,
    _rows_from_objects,
    _table_chunks,
    _merge_freeform,
    _schema_for_columns,
    TABLE_MAX_CHUNKS,
)
from routers.assistant import _visible_prefix


# ── _coerce_tables ──────────────────────────────────────────────────────────

def test_coerce_pads_and_trims_rows():
    out = _coerce_tables([
        {"title": "T", "columns": ["a", "b"], "rows": [["1", "2"], ["3"], ["x", "y", "z"], []]}
    ])
    assert len(out) == 1
    assert out[0]["columns"] == ["a", "b"]
    # short row padded, long row trimmed, empty row dropped
    assert out[0]["rows"] == [["1", "2"], ["3", ""], ["x", "y"]]


def test_coerce_rejects_non_list_and_bad_tables():
    assert _coerce_tables("nope") == []
    assert _coerce_tables([{"columns": [], "rows": []}]) == []   # no columns
    assert _coerce_tables([{"columns": ["a"], "rows": []}]) == []  # no rows


def test_coerce_defaults_title():
    out = _coerce_tables([{"columns": ["a"], "rows": [["1"]]}])
    assert out[0]["title"] == "Extracted data"


# ── _parse_json_tables (fallback parser) ────────────────────────────────────

def test_parse_strips_code_fences():
    raw = '```json\n[{"title":"T","columns":["a"],"rows":[["1"]]}]\n```'
    out = _parse_json_tables(raw)
    assert out and out[0]["rows"] == [["1"]]


def test_parse_handles_garbage():
    assert _parse_json_tables("not json at all") == []
    assert _parse_json_tables("") == []


# ── _rows_from_objects (schema-guided) ──────────────────────────────────────

def test_rows_from_objects_orders_and_pads():
    content = '{"rows":[{"a":"1","b":"2"},{"a":"3"}]}'
    assert _rows_from_objects(content, ["a", "b"]) == [["1", "2"], ["3", ""]]


def test_rows_from_objects_drops_empty_and_bad():
    assert _rows_from_objects('{"rows":[{"a":"","b":""}]}', ["a", "b"]) == []
    assert _rows_from_objects("not json", ["a"]) == []
    assert _rows_from_objects(None, ["a"]) == []


# ── _table_chunks ───────────────────────────────────────────────────────────

def test_chunks_short_text_single_window():
    assert _table_chunks("one two three") == ["one two three"]
    assert _table_chunks("") == []


def test_chunks_long_text_capped():
    text = " ".join(["word"] * 6000)
    chunks = _table_chunks(text)
    assert 1 < len(chunks) <= TABLE_MAX_CHUNKS
    assert all(c.strip() for c in chunks)


# ── _merge_freeform ─────────────────────────────────────────────────────────

def test_merge_dedups_rows_by_signature():
    a = [{"title": "T", "columns": ["x", "y"], "rows": [["1", "2"]]}]
    b = [{"title": "T", "columns": ["x", "y"], "rows": [["1", "2"], ["3", "4"]]}]
    merged = _merge_freeform([a, b])
    assert len(merged) == 1                       # same column signature → one table
    assert merged[0]["rows"] == [["1", "2"], ["3", "4"]]


def test_merge_keeps_distinct_schemas_separate():
    a = [{"title": "A", "columns": ["x"], "rows": [["1"]]}]
    b = [{"title": "B", "columns": ["y"], "rows": [["2"]]}]
    merged = _merge_freeform([a, b])
    assert len(merged) == 2


# ── _schema_for_columns ─────────────────────────────────────────────────────

def test_schema_requires_exact_columns():
    schema = _schema_for_columns(["Coin", "Price"])
    props = schema["properties"]["rows"]["items"]["properties"]
    assert set(props.keys()) == {"Coin", "Price"}
    assert schema["properties"]["rows"]["items"]["required"] == ["Coin", "Price"]


# ── assistant _visible_prefix (think-strip) ─────────────────────────────────

def test_visible_prefix_removes_complete_think_block():
    assert _visible_prefix("<think>reasoning</think>The answer") == "The answer"


def test_visible_prefix_hides_unclosed_think():
    assert _visible_prefix("Hello <think>still reasoning") == "Hello "


def test_visible_prefix_passes_plain_text():
    assert _visible_prefix("Just an answer.") == "Just an answer."
