FROM python:3.12-slim

ENV DEBIAN_FRONTEND=noninteractive

# System deps: LaTeX (resume PDF generation), poppler (PDF utils), libmagic (file sniffing)
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    texlive-full \
    poppler-utils \
    libmagic1 \
  && rm -rf /var/lib/apt/lists/*

# uv binary (pinned) from the official image
COPY --from=ghcr.io/astral-sh/uv:0.11.16 /uv /uvx /bin/

WORKDIR /app

# Reproducible installs: compile bytecode, copy into the image (no cross-layer hardlinks),
# and keep the env at /app/.venv.
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/app/.venv

# Install dependencies first — cached unless pyproject.toml / uv.lock change.
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

# App code
COPY . .

# Put the venv's tools (uvicorn) on PATH so the CMD doesn't need uv at runtime.
ENV PATH="/app/.venv/bin:$PATH"

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
