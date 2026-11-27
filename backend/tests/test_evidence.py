from app.evidence import compare, figure, margin_plain, period_relation, verify


def fig(value, period="Q2 FY27", basis="Consolidated", unit="₹ crore", metric="Net profit", definition=None):
    return figure(metric, value, unit, period, basis, definition=definition)


def row(value, period="Q2 FY27", basis="Consolidated", unit="₹ crore", metric="Net profit", rounded=False):
    return {"metric": metric, "period": period, "basis": basis, "unit": unit, "value": value, "rounded": rounded}


def test_period_relation():
    assert period_relation("Q2 FY26", "Q2 FY27") == "yoy"
    assert period_relation("Q1 FY27", "Q2 FY27") == "qoq"
    assert period_relation("Q4 FY26", "Q1 FY27") == "qoq"
    assert period_relation("Q3 FY26", "Q2 FY27") is None


def test_percent_change_when_valid():
    c = compare(fig(100, "Q2 FY26"), fig(115, "Q2 FY27"), "yoy")
    assert c["comparable"] and c["kind"] == "pct" and c["value"] == 15.0


def test_margin_uses_percentage_points():
    c = compare(fig(34.32, "Q2 FY26", unit="%"), fig(27.85, "Q2 FY27", unit="%"), "yoy", percent_metric=True)
    assert c["kind"] == "pp" and c["value"] == -6.5


def test_mismatched_basis_is_not_comparable():
    c = compare(fig(100, "Q2 FY26", basis="Standalone"), fig(110, "Q2 FY27"), "yoy")
    assert not c["comparable"] and "basis" in c["reason"]


def test_wrong_period_pair_is_not_comparable():
    c = compare(fig(100, "Q1 FY27"), fig(110, "Q2 FY27"), "yoy")
    assert not c["comparable"] and "year-on-year" in c["reason"]


def test_definition_change_is_not_comparable():
    c = compare(fig(100, "Q2 FY26", definition="incl. old excise"), fig(140, "Q2 FY27", definition="incl. new excise"), "yoy")
    assert not c["comparable"] and "defined differently" in c["reason"]


def test_negative_base_is_not_comparable():
    c = compare(fig(-20, "Q2 FY26"), fig(10, "Q2 FY27"), "yoy")
    assert not c["comparable"] and c["value"] is None


def test_caveat_keeps_change_but_flags_not_like_for_like():
    c = compare(fig(100, "Q2 FY26"), fig(90, "Q2 FY27"), "yoy", caveat="Acquisition in period")
    assert c["comparable"] and not c["like_for_like"]


def test_verify_requires_all_fields():
    assert verify(fig(4229.33), row(4229.33))[0]
    ok, why = verify(fig(4229.33, period="Q1 FY27"), row(4229.33))
    assert not ok and "period" in why
    ok, why = verify(fig(4229.33, basis="Standalone"), row(4229.33))
    assert not ok and "basis" in why
    ok, why = verify(fig(4229.33, metric="Profit before tax"), row(4229.33))
    assert not ok and "metric" in why
    ok, why = verify(fig(4230.0), row(4229.33))
    assert not ok and "value" in why


def test_verify_converts_lakh_to_crore():
    assert verify(fig(422933, unit="₹ lakh"), row(4229.33))[0]
    assert not verify(fig(4229.33, unit="₹ lakh"), row(4229.33))[0]


def test_verify_unknown_unit_fails():
    ok, why = verify(fig(4229.33, unit="$ million"), row(4229.33))
    assert not ok and "units" in why


def test_rounded_third_party_value_within_half_crore():
    assert verify(fig(5645), row(5644.83, rounded=True))[0]
    assert not verify(fig(5646), row(5644.83, rounded=True))[0]


def test_margin_plain():
    assert margin_plain(27.85) == "₹28 of operating profit for every ₹100 of sales"
