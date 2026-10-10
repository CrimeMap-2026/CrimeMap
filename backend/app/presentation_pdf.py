"""Create a multi-section, printable PDF from existing CrimeMap aggregates.

Programmatically draws charts and a schematic spatial grid with ReportLab;
never embeds OSM map tiles or individual incident locations/descriptions.
"""
from datetime import datetime, timezone
from html import escape
from io import BytesIO
from math import sqrt
from pathlib import Path

from reportlab.graphics.shapes import Drawing, Line, Rect, String
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    KeepTogether, LongTable, PageBreak, Paragraph, SimpleDocTemplate,
    Spacer, Table, TableStyle,
)

NAVY = colors.HexColor("#112840")
BLUE = colors.HexColor("#327CB5")
TEAL = colors.HexColor("#147F84")
GOLD = colors.HexColor("#BA8742")
PALE = colors.HexColor("#E9F2F7")
SLATE = colors.HexColor("#43566C")
LIGHT = colors.HexColor("#F5F8FC")
LINE = colors.HexColor("#CFDCE7")
PAGE_W, PAGE_H = A4
CONTENT_W = PAGE_W - 36 * mm

FONT = "Helvetica"
FONT_BOLD = "Helvetica-Bold"


def _register_fonts() -> None:
    """Use system DejaVu when available; standard PDF fonts are the fallback."""
    global FONT, FONT_BOLD
    candidates = [
        ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
         "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"),
        ("/usr/share/fonts/dejavu/DejaVuSans.ttf",
         "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf"),
    ]
    for regular, bold in candidates:
        if Path(regular).is_file() and Path(bold).is_file():
            if "CrimeMapSans" not in pdfmetrics.getRegisteredFontNames():
                pdfmetrics.registerFont(TTFont("CrimeMapSans", regular))
                pdfmetrics.registerFont(TTFont("CrimeMapSans-Bold", bold))
                from reportlab.pdfbase.pdfmetrics import registerFontFamily
                registerFontFamily(
                    "CrimeMapSans", normal="CrimeMapSans", bold="CrimeMapSans-Bold",
                    italic="CrimeMapSans", boldItalic="CrimeMapSans-Bold",
                )
            FONT, FONT_BOLD = "CrimeMapSans", "CrimeMapSans-Bold"
            break


def _text(value) -> str:
    """All database/user-supplied text is escaped before entering Paragraphs."""
    result = str(value if value is not None else "")
    if FONT == "Helvetica":
        result = result.encode("latin-1", errors="replace").decode("latin-1")
    return escape(result, quote=True)


def _styles():
    base = getSampleStyleSheet()
    return {
        "kicker": ParagraphStyle("ReportKicker", fontName=FONT_BOLD,
            fontSize=9, textColor=TEAL, spaceAfter=8, leading=13),
        "hero": ParagraphStyle("ReportHero", fontName=FONT_BOLD,
            fontSize=28, leading=34, textColor=NAVY, spaceAfter=13),
        "heading": ParagraphStyle("ReportHeading", fontName=FONT_BOLD,
            fontSize=17, leading=23, textColor=NAVY, spaceAfter=10),
        "subhead": ParagraphStyle("ReportSubhead", fontName=FONT_BOLD,
            fontSize=11, leading=16, textColor=NAVY, spaceBefore=9, spaceAfter=7),
        "body": ParagraphStyle("ReportBody", fontName=FONT,
            fontSize=9.4, leading=15, textColor=SLATE, spaceAfter=10),
        "small": ParagraphStyle("ReportSmall", fontName=FONT,
            fontSize=8, leading=12.7, textColor=SLATE, spaceAfter=7),
        "tiny": ParagraphStyle("ReportTiny", fontName=FONT,
            fontSize=7.4, leading=11, textColor=SLATE),
        "tableheader": ParagraphStyle("ReportTableHeader", fontName=FONT_BOLD,
            fontSize=8.1, leading=11, textColor=colors.white),
        "tablerow": ParagraphStyle("ReportTableCell", fontName=FONT,
            fontSize=8.2, leading=12, textColor=NAVY),
    }


def _p(text: str, style) -> Paragraph:
    return Paragraph(_text(text), style)


def _footer(canvas, doc):
    canvas.saveState()
    canvas.setStrokeColor(LINE)
    canvas.line(18 * mm, 21 * mm, PAGE_W - 18 * mm, 21 * mm)
    canvas.setFont(FONT_BOLD, 7.4)
    canvas.setFillColor(TEAL)
    canvas.drawString(18 * mm, 15 * mm, "CRIMEMAP / SYNTHETIC DEMONSTRATION")
    canvas.setFillColor(SLATE)
    canvas.setFont(FONT, 7.4)
    canvas.drawRightString(PAGE_W - 18 * mm, 15 * mm, f"Page {doc.page}")
    canvas.restoreState()


def _bar_chart(items, *, width=CONTENT_W, bar_color=BLUE, limit=9):
    """Flowable, vector bars from aggregate counts; no image dependency."""
    shown = [(str(label), int(count)) for label, count in list(items)[:limit]]
    height = max(35, 27 * len(shown) + 12)
    drawing = Drawing(width, height)
    maximum = max([value for _, value in shown] + [1])
    label_width = 145
    chart_width = max(80, width - label_width - 52)
    for index, (label, value) in enumerate(shown):
        cy = height - 17 - index * 27
        drawing.add(Rect(label_width, cy - 3, chart_width, 13,
                         fillColor=PALE, strokeColor=None))
        drawing.add(Rect(label_width, cy - 3,
                         max(0, chart_width * value / maximum), 13,
                         fillColor=bar_color, strokeColor=None))
        short = label if len(label) <= 24 else label[:22] + ".."
        drawing.add(String(0, cy, short, fontName=FONT,
                           fontSize=8.4, fillColor=NAVY))
        drawing.add(String(width - 5, cy, str(value), textAnchor="end",
                           fontName=FONT_BOLD, fontSize=8.8, fillColor=NAVY))
    if not shown:
        drawing.add(String(0, 10, "No matching synthetic data",
                           fontName=FONT, fontSize=9, fillColor=SLATE))
    return drawing


def _grid_schematic(features, width=CONTENT_W):
    """Relative cell centers; not an official administrative or basemap image."""
    selected = list(features)[:20]
    height = 176
    drawing = Drawing(width, height)
    drawing.add(Rect(0, 0, width, height, fillColor=LIGHT,
                     strokeColor=LINE, strokeWidth=0.75))
    if not selected:
        drawing.add(String(width / 2, height / 2,
            "No geographic cells meet the selected threshold",
            textAnchor="middle", fontName=FONT, fontSize=9, fillColor=SLATE))
        return drawing
    centers = []
    for feature in selected:
        coordinates = feature.geometry.coordinates[0]
        longitude = sum(item[0] for item in coordinates[:4]) / 4
        latitude = sum(item[1] for item in coordinates[:4]) / 4
        centers.append((longitude, latitude, feature.properties.count))
    west, east = min(x for x, _, _ in centers), max(x for x, _, _ in centers)
    south, north = min(y for _, y, _ in centers), max(y for _, y, _ in centers)
    range_x, range_y = max(east - west, 0.0009), max(north - south, 0.0009)
    m = max(1, max(z for _, _, z in centers))
    for longitude, latitude, incident_count in centers:
        center_x = 24 + (longitude - west) / range_x * (width - 48)
        center_y = 22 + (latitude - south) / range_y * (height - 44)
        side = 8 + 9 * sqrt(incident_count / m)
        shade = TEAL if incident_count >= 5 else BLUE if incident_count >= 3 else GOLD
        drawing.add(Rect(center_x - side / 2, center_y - side / 2,
                         side, side, fillColor=shade, strokeColor=colors.white,
                         strokeWidth=0.8))
    return drawing


def _summary_table(pairs, styles):
    rows = [[_p(label, styles["tablerow"]), _p(str(value), styles["tablerow"])]
            for label, value in pairs]
    if not rows:
        return Spacer(1, 1)
    table = Table(rows, colWidths=[CONTENT_W * 0.45, CONTENT_W * 0.55])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), LIGHT),
        ("ROWBACKGROUNDS", (0, 0), (-1, -1), [LIGHT, colors.white]),
        ("LINEBELOW", (0, 0), (-1, -1), 0.45, LINE),
        ("LEFTPADDING", (0, 0), (-1, -1), 12),
        ("RIGHTPADDING", (0, 0), (-1, -1), 12),
        ("TOPPADDING", (0, 0), (-1, -1), 9),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 9),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    return table


def _plan_table(plans, styles):
    headers = ["Measure and demonstration zone", "Status", "At creation"]
    rows = [[_p(text, styles["tableheader"]) for text in headers]]
    for item in plans:
        zone = "Unspecified zone" if item.zone == "__unspecified__" else item.zone
        rows.append([
            _p(f"{item.title} / {zone} / {item.category}", styles["tablerow"]),
            _p(item.status.replace("_", " "), styles["tablerow"]),
            _p(f"{item.evidence_count} incidents", styles["tablerow"]),
        ])
    table = LongTable(rows, colWidths=[CONTENT_W * .60, CONTENT_W * .17, CONTENT_W * .23],
                      repeatRows=1, hAlign="LEFT")
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [LIGHT, colors.white]),
        ("LINEBELOW", (0, 1), (-1, -1), 0.4, LINE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 9),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 9),
    ]))
    return table


def make_report_pdf(*, analytics, spatial, plans, total_plan_count: int,
                    filters: dict, sections: list[str], cell_size_m: int,
                    min_count: int) -> bytes:
    """Render the supplied aggregate data to PDF; never queries/writes the DB."""
    _register_fonts()
    st = _styles()
    output = BytesIO()
    doc = SimpleDocTemplate(
        output, pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm,
        topMargin=23 * mm, bottomMargin=27 * mm,
        title="CrimeMap - Synthetic Intelligence Presentation",
        author="CrimeMap demonstration platform",
        subject="Fictional incident trends, geographic grid counts and prevention plan summaries",
    )
    story = []
    now = datetime.now(timezone.utc).strftime("%d %b %Y, %H:%M UTC")
    selection = [
        ("Local incident range", f"{filters.get('start_date') or 'All dates'} to {filters.get('end_date') or 'All dates'}"),
        ("Crime category", filters.get("category") or "All categories"),
        ("Incident status", filters.get("status") or "All statuses"),
        ("Demonstration zone", filters.get("zone_label") or "All zones"),
        ("Included sections", ", ".join(section.title() for section in sections)),
    ]

    story.extend([
        Spacer(1, 35),
        _p("CRIMEMAP / PRESENTATION BRIEF", st["kicker"]),
        _p("Geospatial Crime Intelligence", st["hero"]),
        _p("A compact presentation of descriptive findings, visual summaries, "
           "and human-reviewed preventive action planning.", st["body"]),
        Spacer(1, 13),
        _summary_table(selection, st),
        Spacer(1, 21),
        _p("SYNTHETIC DATA - FOR DEMONSTRATION ONLY", st["subhead"]),
        _p("This report contains fictional incidents and demonstration zones, not verified "
           "Puducherry Police records. Count patterns are not predictive risk estimates, "
           "official hotspots or evidence that an action prevented a crime.", st["body"]),
        _p(f"Generated: {now}. All incident date filters use Asia/Kolkata (IST). "
           "Content is read-only and reflects the configured database when exported.", st["small"]),
    ])

    if analytics is not None:
        story.extend([
            PageBreak(),
            _p("01 / Descriptive analytics", st["kicker"]),
            _p("Incident patterns", st["heading"]),
            _p("Computed from every matching fictional incident, not only the registry page.", st["small"]),
            _summary_table([
                ("Matching incidents", str(analytics.summary.total_incidents)),
                ("Categories represented", str(analytics.summary.category_count)),
                ("Top category", str(analytics.summary.most_frequent_category or "None")),
                ("Named zones represented", str(analytics.summary.zone_count)),
            ], st),
            Spacer(1, 16),
            _p("Crime-category distribution", st["subhead"]),
            _bar_chart([(item.key, item.count) for item in analytics.by_category],
                       bar_color=BLUE),
            Spacer(1, 12),
            _p("Investigation statuses", st["subhead"]),
            _bar_chart([(item.key.replace("_", " ").title(), item.count)
                        for item in analytics.by_status], bar_color=TEAL),
            Spacer(1, 12),
            _p("Timeline - selected incident counts", st["subhead"]),
        ])
        trend = analytics.by_date
        display_trend = trend if len(trend) <= 12 else trend[-12:]
        story.append(_bar_chart([(item.key, item.count) for item in display_trend],
                                bar_color=GOLD, limit=12))
        if len(trend) > 12:
            story.append(_p(f"Displaying the latest 12 of {len(trend)} "
                f"{analytics.trend_interval} buckets to keep this brief legible.", st["small"]))
        story.append(_p("These totals do not account for reporting variation, population, "
                        "exposure or other factors.", st["small"]))

    if spatial is not None:
        meta = spatial.meta
        story.extend([
            PageBreak(),
            _p("02 / Geospatial intelligence", st["kicker"]),
            _p("Fixed-grid geographic concentrations", st["heading"]),
            _p("The schematic below is drawn from the same aligned grid-cell aggregates "
               "used in Geospatial Intelligence. It is not a street map or official boundary.", st["small"]),
            _grid_schematic(spatial.features),
            Spacer(1, 12),
            _summary_table([
                ("Grid settings", f"{cell_size_m} metre cells / minimum {min_count} incidents"),
                ("Records inside study extent", str(meta.analyzed_incidents)),
                ("Matching records outside extent", str(meta.excluded_incidents)),
                ("Cells meeting threshold", str(meta.qualifying_cells)),
                ("Largest cell count", str(meta.max_cell_count)),
            ], st),
            Spacer(1, 17),
            _p("Highest-count qualifying cells", st["subhead"]),
            _bar_chart([(feature.properties.cell_id, feature.properties.count)
                        for feature in spatial.features], bar_color=TEAL, limit=8),
            Spacer(1, 13),
            _p("Spatial interpretation", st["subhead"]),
            _p("Cell positions use an approximate fixed projection. Grid widths, alignment, "
               "thresholds and the rectangular demonstration extent shape the resulting counts. "
               "The diagram shows relative locations of up to 20 qualifying cells only. "
               "It does not depict official police jurisdictions, predicted future incidents "
               "or population-adjusted crime rates.", st["small"]),
        ])

    if plans is not None:
        story.extend([
            PageBreak(),
            _p("03 / Prevention planning", st["kicker"]),
            _p("Saved human-reviewed action plans", st["heading"]),
            _p("General safeguarding proposals, not automated police assignments. "
               "The plan list is restricted to the selected category and zone where supplied. "
               "Incident date and status filters do not apply to saved plans.", st["small"]),
            _summary_table([
                ("Matching saved plans", str(total_plan_count)),
                ("Plans listed in this brief", str(len(plans))),
                ("Completed plans shown", str(sum(p.status == "completed" for p in plans))),
                ("Plans in progress shown", str(sum(p.status == "in_progress" for p in plans))),
            ], st),
            Spacer(1, 17),
        ])
        if plans:
            story.append(_plan_table(plans, st))
        else:
            story.append(_p("No saved prevention plans match this selection. "
                            "Plans can be created and tracked within Prevention Planner.", st["body"]))
        story.extend([
            Spacer(1, 16),
            _p("Actions do not establish prevention effectiveness", st["subhead"]),
            _p("A plan status marked completed documents that it was marked complete, "
               "not that incident counts changed because of it. Plan creation snapshots and "
               "later observation reviews do not constitute causal or scientific evaluation. "
               "Coordinator names, progress notes and individual incident descriptions "
               "are intentionally omitted from this report.", st["small"]),
        ])
    story.extend([
        Spacer(1, 22),
        _p("Reporting and privacy limitations", st["subhead"]),
        _p("No individual-level incident coordinates or descriptions are printed. "
           "No live patrol, CCTV or police operational data appears in this brief. "
           "Use only as a hackathon demonstration with fictional records.", st["small"]),
    ])
    doc.build(story, onFirstPage=_footer, onLaterPages=_footer)
    return output.getvalue()
