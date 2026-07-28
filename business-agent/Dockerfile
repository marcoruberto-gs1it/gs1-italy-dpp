FROM python:3.13-slim

WORKDIR /app

RUN pip install uv

COPY pyproject.toml uv.lock README.md ./
COPY src/ ./src/

RUN uv sync --no-dev --frozen

EXPOSE 10999

CMD ["uv", "run", "business_agent", "--host", "0.0.0.0", "--port", "10999"]
