FROM mcr.microsoft.com/playwright/python:v1.44.0-jammy
WORKDIR /app

# System deps for OCR and PDF-to-image conversion
RUN apt-get update && \
    apt-get install -y --no-install-recommends tesseract-ocr poppler-utils && \
    rm -rf /var/lib/apt/lists/*

# CPU-only PyTorch — must be installed before requirements.txt so that
# transformers resolves it instead of pulling the full CUDA build (~2 GB)
RUN pip install torch==2.3.1+cpu --index-url https://download.pytorch.org/whl/cpu

COPY requirements.txt .
# --prefer-binary: use pre-built wheels for heavy packages (umap-learn, hdbscan)
# to avoid native C compilation inside the container
RUN pip install --no-cache-dir --prefer-binary -r requirements.txt


COPY . .

EXPOSE 8001
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001", "--reload"]
