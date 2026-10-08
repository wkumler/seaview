# Image for the daily tile job. Build from the repo root:
#   docker build -f server/Dockerfile -t seaview-daily .
FROM python:3.11-slim

RUN apt-get update && \
    apt-get install -y --no-install-recommends curl ca-certificates fontconfig && \
    rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://pixi.sh/install.sh | bash
ENV PATH="/root/.pixi/bin:$PATH"

WORKDIR /app
# Install the ~3 GB environment before copying the code, so this layer is only rebuilt when the
# dependency files change, not on every code edit. seaview itself is installed in editable mode,
# so an empty stub package is enough here; the real code is copied in afterwards.
COPY pixi.toml pixi.lock pyproject.toml ./
RUN mkdir -p src/seaview && touch src/seaview/__init__.py README.md && \
    pixi install --frozen && rm -rf /root/.cache
COPY README.md settings.toml ./
COPY src ./src

ENV SEAVIEW_BASE_TILE_DIR=/work/tiles \
    SEAVIEW_BASE_DATA_DIR=/work/data \
    MPLBACKEND=Agg

ENTRYPOINT ["pixi", "run", "--frozen", "sea"]
CMD ["daily"]
