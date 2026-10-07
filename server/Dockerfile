# Image for the daily tile job. Build from the repo root:
#   docker build -f server/Dockerfile -t seaview-daily .
FROM python:3.11-slim

RUN apt-get update && \
    apt-get install -y --no-install-recommends curl ca-certificates fontconfig && \
    rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://pixi.sh/install.sh | bash
ENV PATH="/root/.pixi/bin:$PATH"

WORKDIR /app
COPY pixi.toml pixi.lock pyproject.toml README.md ./
COPY src ./src
RUN pixi install --frozen && rm -rf /root/.cache
COPY settings.toml ./

ENV SEAVIEW_BASE_TILE_DIR=/work/tiles \
    SEAVIEW_BASE_DATA_DIR=/work/data \
    MPLBACKEND=Agg

ENTRYPOINT ["pixi", "run", "--frozen", "sea"]
CMD ["daily"]
