"""Render a parsed resume JSON object into a Jake Gutierrez-style LaTeX PDF.

Public API:
    escape_latex(text) -> str
    generate_tex(resume: dict) -> str
    compile_pdf(tex_content: str) -> bytes
    generate_resume_pdf(resume: dict) -> bytes

The parsed resume schema is the one produced by services/resume_structurer.py
(see prompts/parse_prompt.txt): name, email, phone, linkedin, github,
education[], experience[], projects[], skills{languages, frameworks, tools, platforms}.
"""

from __future__ import annotations

import logging
import os
import platform
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Iterable, Optional

from fastapi import HTTPException

logger = logging.getLogger(__name__)


_PDFLATEX_TIMEOUT_SECONDS = int(os.getenv("SCOUT_PDFLATEX_TIMEOUT", "180"))
_DEFAULT_WIN_BASE_DIR = r"C:\tmp\scout_pdf"


_LATEX_SPECIAL_CHARS = {
    "\\": r"\textbackslash{}",
    "&": r"\&",
    "%": r"\%",
    "$": r"\$",
    "#": r"\#",
    "_": r"\_",
    "{": r"\{",
    "}": r"\}",
    "~": r"\textasciitilde{}",
    "^": r"\textasciicircum{}",
}
_LATEX_ESCAPE_RE = re.compile("|".join(re.escape(k) for k in _LATEX_SPECIAL_CHARS))

_UNICODE_FALLBACKS = {
    "\u2013": "--",
    "\u2014": "---",
    "\u2018": "`",
    "\u2019": "'",
    "\u201c": "``",
    "\u201d": "''",
    "\u2022": "*",
    "\u2026": "...",
    "\u00a0": " ",
    "\u2009": " ",
    "\u200b": "",
    "\ufeff": "",
    "\u223c": r"$\sim$",
    "\u2248": r"$\approx$",
    "\u2264": r"$\leq$",
    "\u2265": r"$\geq$",
    "\u00b1": r"$\pm$",
    "\u00d7": r"$\times$",
    "\u00b0": r"$^{\circ}$",
}
_UNICODE_RE = re.compile("|".join(re.escape(k) for k in _UNICODE_FALLBACKS))


def escape_latex(text: object) -> str:
    """Escape LaTeX special characters and normalize common Unicode glyphs.

    Order is critical: do all replacements in a single regex pass so that
    substitutions don't get re-escaped (e.g. the ``{}`` we introduce for
    ``\\textbackslash{}`` must not be touched by the ``{`` rule).
    """
    if text is None:
        return ""
    s = str(text)
    s = _UNICODE_RE.sub(lambda m: _UNICODE_FALLBACKS[m.group(0)], s)
    s = _LATEX_ESCAPE_RE.sub(lambda m: _LATEX_SPECIAL_CHARS[m.group(0)], s)
    return s


def _normalize_url(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    v = str(value).strip()
    if not v:
        return None
    if v.startswith(("http://", "https://")):
        return v
    return f"https://{v}"


def _join_dates(start: Optional[str], end: Optional[str]) -> str:
    s = (start or "").strip()
    e = (end or "").strip()
    if s and e:
        return f"{escape_latex(s)} -- {escape_latex(e)}"
    if s:
        return escape_latex(s)
    if e:
        return escape_latex(e)
    return ""


def _clean_list(values: Optional[Iterable[object]]) -> list[str]:
    if not values:
        return []
    out: list[str] = []
    for v in values:
        if v is None:
            continue
        text = str(v).strip()
        if text:
            out.append(text)
    return out


# ---------------------------------------------------------------------------
# Template
# ---------------------------------------------------------------------------


_PREAMBLE = r"""\documentclass[letterpaper,11pt]{article}

\usepackage{latexsym}
\usepackage[empty]{fullpage}
\usepackage{titlesec}
\usepackage{marvosym}
\usepackage[usenames,dvipsnames]{color}
\usepackage{enumitem}
\usepackage[hidelinks]{hyperref}
\usepackage{fancyhdr}
\usepackage[english]{babel}
\usepackage{tabularx}
\usepackage[utf8]{inputenc}
\usepackage[T1]{fontenc}

\pagestyle{fancy}
\fancyhf{}
\fancyfoot{}
\renewcommand{\headrulewidth}{0pt}
\renewcommand{\footrulewidth}{0pt}

\addtolength{\oddsidemargin}{-0.5in}
\addtolength{\evensidemargin}{-0.5in}
\addtolength{\textwidth}{1in}
\addtolength{\topmargin}{-.5in}
\addtolength{\textheight}{1.0in}

\urlstyle{same}
\raggedbottom
\raggedright
\setlength{\tabcolsep}{0in}

\titleformat{\section}{
  \vspace{-4pt}\scshape\raggedright\large
}{}{0em}{}[\color{black}\titlerule \vspace{-5pt}]

\newcommand{\resumeItem}[1]{
  \item\small{#1 \vspace{-2pt}}
}

\newcommand{\resumeSubheading}[4]{
  \vspace{-2pt}\item
    \begin{tabular*}{0.97\textwidth}[t]{l@{\extracolsep{\fill}}r}
      \textbf{#1} & #2 \\
      \textit{\small#3} & \textit{\small #4} \\
    \end{tabular*}\vspace{-7pt}
}

\newcommand{\resumeProjectHeading}[2]{
    \item
    \begin{tabular*}{0.97\textwidth}{l@{\extracolsep{\fill}}r}
      \small#1 & #2 \\
    \end{tabular*}\vspace{-7pt}
}

\newcommand{\resumeSubHeadingListStart}{\begin{itemize}[leftmargin=0.15in, label={}]}
\newcommand{\resumeSubHeadingListEnd}{\end{itemize}}
\newcommand{\resumeItemListStart}{\begin{itemize}}
\newcommand{\resumeItemListEnd}{\end{itemize}\vspace{-5pt}}
"""


def _render_header(resume: dict) -> str:
    name = escape_latex(resume.get("name") or "")
    email = escape_latex(resume.get("email") or "")
    phone = escape_latex(resume.get("phone") or "")
    linkedin_raw = resume.get("linkedin")
    github_raw = resume.get("github")

    contact_parts: list[str] = []
    if email:
        contact_parts.append(f"\\small {email}")
    if phone:
        contact_parts.append(f"\\small {phone}")
    if linkedin_raw:
        url = _normalize_url(linkedin_raw)
        display = escape_latex(linkedin_raw)
        if url:
            contact_parts.append(
                f"\\href{{{url}}}{{\\underline{{{display}}}}}"
            )
    if github_raw:
        url = _normalize_url(github_raw)
        display = escape_latex(github_raw)
        if url:
            contact_parts.append(
                f"\\href{{{url}}}{{\\underline{{{display}}}}}"
            )

    contact_line = " $|$ ".join(contact_parts)

    return (
        "\\begin{center}\n"
        f"    \\textbf{{\\Huge \\scshape {name}}} \\\\ \\vspace{{1pt}}\n"
        f"    {contact_line}\n"
        "\\end{center}\n"
    )


def _render_education(items: list[dict]) -> str:
    if not items:
        return ""
    lines = ["\\section{Education}", "  \\resumeSubHeadingListStart"]
    for ed in items:
        if not isinstance(ed, dict):
            continue
        school = escape_latex(ed.get("school") or "")
        degree_parts: list[str] = []
        deg = (ed.get("degree") or "").strip()
        field = (ed.get("field") or "").strip()
        if deg and field:
            degree_parts.append(f"{deg} in {field}")
        elif deg:
            degree_parts.append(deg)
        elif field:
            degree_parts.append(field)
        gpa = ed.get("gpa")
        if isinstance(gpa, (int, float)):
            degree_parts.append(f"GPA: {gpa}")
        elif isinstance(gpa, str) and gpa.strip():
            degree_parts.append(f"GPA: {gpa.strip()}")
        degree_line = escape_latex(", ".join(degree_parts))
        date_line = _join_dates(ed.get("start_date"), ed.get("end_date"))

        lines.append(
            "    \\resumeSubheading"
            f"{{{school}}}{{{date_line}}}"
            f"{{{degree_line}}}{{}}"
        )

        coursework = _clean_list(ed.get("relevant_coursework"))
        if coursework:
            joined = escape_latex(", ".join(coursework))
            lines.append("      \\resumeItemListStart")
            lines.append(
                f"        \\resumeItem{{\\textbf{{Relevant Coursework:}} {joined}}}"
            )
            lines.append("      \\resumeItemListEnd")

    lines.append("  \\resumeSubHeadingListEnd")
    return "\n".join(lines) + "\n"


def _render_experience(items: list[dict]) -> str:
    if not items:
        return ""
    lines = ["\\section{Experience}", "  \\resumeSubHeadingListStart"]
    for exp in items:
        if not isinstance(exp, dict):
            continue
        company = escape_latex(exp.get("company") or "")
        title = escape_latex(exp.get("title") or "")
        date_line = _join_dates(exp.get("start_date"), exp.get("end_date"))

        lines.append(
            "    \\resumeSubheading"
            f"{{{company}}}{{{date_line}}}"
            f"{{{title}}}{{}}"
        )

        bullets = _clean_list(exp.get("bullets"))
        if bullets:
            lines.append("      \\resumeItemListStart")
            for b in bullets:
                lines.append(f"        \\resumeItem{{{escape_latex(b)}}}")
            lines.append("      \\resumeItemListEnd")

    lines.append("  \\resumeSubHeadingListEnd")
    return "\n".join(lines) + "\n"


def _render_projects(items: list[dict]) -> str:
    if not items:
        return ""
    lines = ["\\section{Projects}", "    \\resumeSubHeadingListStart"]
    for proj in items:
        if not isinstance(proj, dict):
            continue
        name = escape_latex(proj.get("name") or "")
        tech = _clean_list(proj.get("tech_stack"))
        tech_line = escape_latex(", ".join(tech)) if tech else ""
        date_line = _join_dates(proj.get("start_date"), proj.get("end_date"))

        if tech_line:
            heading_left = f"\\textbf{{{name}}} $|$ \\emph{{{tech_line}}}"
        else:
            heading_left = f"\\textbf{{{name}}}"

        lines.append(
            f"      \\resumeProjectHeading{{{heading_left}}}{{{date_line}}}"
        )

        bullets = _clean_list(proj.get("bullets"))
        if bullets:
            lines.append("        \\resumeItemListStart")
            for b in bullets:
                lines.append(f"          \\resumeItem{{{escape_latex(b)}}}")
            lines.append("        \\resumeItemListEnd")

    lines.append("    \\resumeSubHeadingListEnd")
    return "\n".join(lines) + "\n"


def _render_skills(skills: object) -> str:
    if not isinstance(skills, dict):
        return ""
    groups = [
        ("Languages", _clean_list(skills.get("languages"))),
        ("Frameworks", _clean_list(skills.get("frameworks"))),
        ("Tools", _clean_list(skills.get("tools"))),
        ("Platforms", _clean_list(skills.get("platforms"))),
    ]
    rendered_rows = [
        f"     \\textbf{{{label}}}{{: {escape_latex(', '.join(values))}}} \\\\"
        for label, values in groups
        if values
    ]
    if not rendered_rows:
        return ""

    return (
        "\\section{Technical Skills}\n"
        " \\begin{itemize}[leftmargin=0.15in, label={}]\n"
        "    \\small{\\item{\n"
        + "\n".join(rendered_rows)
        + "\n    }}\n"
        " \\end{itemize}\n"
    )


def generate_tex(resume: dict) -> str:
    """Build a complete Jake-format .tex string from parsed resume JSON."""
    if not isinstance(resume, dict):
        raise HTTPException(
            status_code=422, detail="resume must be a JSON object"
        )

    body_sections = [
        _render_header(resume),
        _render_education(resume.get("education") or []),
        _render_experience(resume.get("experience") or []),
        _render_projects(resume.get("projects") or []),
        _render_skills(resume.get("skills")),
    ]

    body = "\n".join(section for section in body_sections if section).rstrip()

    return (
        _PREAMBLE
        + "\n\\begin{document}\n\n"
        + body
        + "\n\n\\end{document}\n"
    )


# ---------------------------------------------------------------------------
# Compilation
# ---------------------------------------------------------------------------


def _resolve_base_dir() -> Path:
    override = os.getenv("SCOUT_PDF_TMP_DIR")
    if override:
        return Path(override)
    if platform.system() == "Windows":
        return Path(_DEFAULT_WIN_BASE_DIR)
    return Path(tempfile.gettempdir()) / "scout_pdf"


def _resolve_pdflatex() -> str:
    override = os.getenv("PDFLATEX_PATH")
    if override:
        return override
    found = shutil.which("pdflatex")
    if found:
        return found
    raise HTTPException(
        status_code=500,
        detail=(
            "pdflatex not found on PATH. Install MiKTeX or TeX Live and ensure "
            "pdflatex is on the system PATH, or set PDFLATEX_PATH."
        ),
    )


def _tail(text: str, lines: int = 60) -> str:
    if not text:
        return ""
    parts = text.splitlines()
    return "\n".join(parts[-lines:])


def compile_pdf(tex_content: str) -> bytes:
    """Compile a .tex string to PDF bytes using pdflatex.

    Writes to a fresh subdirectory under ``C:\\tmp\\scout_pdf\\`` (Windows) or
    ``$TMP/scout_pdf`` elsewhere, runs pdflatex in non-stop mode, returns the
    PDF bytes, and cleans up on success.
    """
    if not isinstance(tex_content, str) or not tex_content.strip():
        raise HTTPException(
            status_code=422, detail="tex_content must be a non-empty string"
        )

    pdflatex = _resolve_pdflatex()
    base_dir = _resolve_base_dir()
    try:
        base_dir.mkdir(parents=True, exist_ok=True)
    except OSError as e:
        raise HTTPException(
            status_code=500,
            detail=f"Could not create temp directory '{base_dir}': {e}",
        ) from e

    job_dir = Path(tempfile.mkdtemp(prefix="job_", dir=str(base_dir)))
    tex_path = job_dir / "resume.tex"
    pdf_path = job_dir / "resume.pdf"

    try:
        tex_path.write_text(tex_content, encoding="utf-8")

        creationflags = 0
        if sys.platform == "win32":
            creationflags = getattr(subprocess, "CREATE_NO_WINDOW", 0)

        cmd = [pdflatex]
        if "miktex" in pdflatex.lower():
            cmd.append("--enable-installer")
        cmd += [
            "-interaction=nonstopmode",
            "-halt-on-error",
            "-file-line-error",
            "resume.tex",
        ]

        try:
            result = subprocess.run(
                cmd,
                cwd=str(job_dir),
                capture_output=True,
                text=True,
                timeout=_PDFLATEX_TIMEOUT_SECONDS,
                creationflags=creationflags,
            )
        except subprocess.TimeoutExpired as e:
            raise HTTPException(
                status_code=500,
                detail=f"pdflatex timed out after {_PDFLATEX_TIMEOUT_SECONDS}s",
            ) from e
        except FileNotFoundError as e:
            raise HTTPException(
                status_code=500,
                detail=f"pdflatex executable not runnable: {e}",
            ) from e

        if result.returncode != 0 or not pdf_path.exists():
            log_path = job_dir / "resume.log"
            log_excerpt = ""
            if log_path.exists():
                try:
                    log_excerpt = log_path.read_text(
                        encoding="utf-8", errors="replace"
                    )
                except OSError:
                    log_excerpt = ""
            logger.error(
                "pdflatex failed rc=%s stdout_tail=%r log_tail=%r",
                result.returncode,
                _tail(result.stdout),
                _tail(log_excerpt),
            )
            raise HTTPException(
                status_code=500,
                detail=(
                    "Failed to compile resume PDF. "
                    f"pdflatex exit={result.returncode}. "
                    f"Last output:\n{_tail(result.stdout, 25)}"
                ),
            )

        return pdf_path.read_bytes()
    finally:
        shutil.rmtree(job_dir, ignore_errors=True)


def generate_resume_pdf(resume: dict) -> bytes:
    """End-to-end: parsed resume JSON -> .tex -> compiled PDF bytes."""
    tex_content = generate_tex(resume)
    return compile_pdf(tex_content)


class LatexGenerator:
    """Thin async wrapper so callers using ``await`` keep working."""

    async def render_pdf(self, tex_source: str) -> bytes:
        return compile_pdf(tex_source)

    async def render_resume(self, resume: dict) -> bytes:
        return generate_resume_pdf(resume)


latex_generator = LatexGenerator()
