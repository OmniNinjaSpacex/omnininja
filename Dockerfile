FROM python:3.11-slim

# System tools (igual ao ambiente do Manus AI)
RUN apt-get update && apt-get install -y \
    curl wget git nano vim \
    build-essential gcc g++ \
    nodejs npm \
    chromium chromium-driver \
    fonts-liberation libatk-bridge2.0-0 \
    libgbm1 libgtk-3-0 libnss3 libxss1 \
    libasound2 libdrm2 \
    python3-pip python3-venv \
    ffmpeg imagemagick \
    jq zip unzip \
    && rm -rf /var/lib/apt/lists/*

# Python packages (tudo que o Manus tem)
COPY backend/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

# Playwright (browser automation)
RUN pip install playwright && playwright install chromium --with-deps

# Data science
RUN pip install --no-cache-dir \
    numpy pandas matplotlib seaborn plotly \
    scikit-learn scipy statsmodels \
    pillow opencv-python-headless \
    requests aiohttp \
    openpyxl xlrd xlwt \
    pdfplumber PyPDF2 \
    python-docx python-pptx \
    bs4 lxml selenium \
    langchain openai anthropic \
    faiss-cpu sentence-transformers

WORKDIR /app
COPY . /app

# Build frontend
RUN npm install --prefix /app/frontend && \
    npm run build --prefix /app/frontend

# Create workspace dir
RUN mkdir -p /app/workspace

EXPOSE 8000

CMD ["python", "-m", "uvicorn", "backend.api.server:app", \
     "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
