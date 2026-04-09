# Research Paper Synthesizer 🧠

<p align="center">
  <img src="assets/logo.png" alt="Research Paper Synthesizer Logo" width="400"/>
</p>

An intelligent, multi-agent AI pipeline that ingests, summarizes, and synthesizes multiple academic research papers in parallel using **Gemini 2.5 Flash** and `google-genai`.
Research Paper Synthesizer is a Python application that reads academic PDF papers, summarizes them with Gemini, and combines the results into one literature review.

## What The Project Includes

- `app.py`: FastAPI backend for the browser-based app
- `synthesizer.py`: PDF extraction and Gemini synthesis logic
- `static/`: frontend HTML, CSS, and JavaScript
- `papers/`: optional input folder for CLI mode
- `synthesis_report.md`: generated output file for CLI mode

## Requirements

Before running the project, make sure you have:

- Python 3.10 or newer
- a valid Gemini API key
- internet access for Gemini API calls

## Step By Step To Run It Live Locally

## 🚀 Features
- **Parallel Chunking:** Processes massive PDF documents utilizing asynchronous concurrent evaluation.
- **Zero-Dependency NLP:** Stripped of heavy frameworks (like LangChain) to guarantee high reliability using pure native `asyncio`.
- **System Optimized:** Automatically overrides standard Windows Event Loop crashes.
- **Context Synthesis:** Employs an optimized cross-document final synthesis module.
These steps are written for Windows PowerShell.

### 1. Open the project folder

## 📐 Architecture
```mermaid
graph TD
    A[Raw PDFs in /papers/] -->|extract_text| B(Parallel Ingestor Node)
    B --> C{Map: Extract & Summarize Chunk}
    C -->|Concurrent Call 1| D[Gemini 2.5 Flash]
    C -->|Concurrent Call 2| D
    C -->|Concurrent Call N| D
    D --> E[Per-Paper Summary]
    E --> F{Reduce: Global Synthesis}
    F --> G((synthesis_report.md))
```powershell
cd D:\ResearchPaperSynthezier
```

## 🛠 Setup
Why:
You should run all commands from the project root so the app can find the Python files, the `static/` folder, and the `.env` file.

**1. Clone and Enter Repository**
```bash
git clone https://github.com/your-username/ResearchPaperSynthesizer.git
cd ResearchPaperSynthesizer
### 2. Create a virtual environment

```powershell
python -m venv .venv
```

**2. Configure Environment**
Create a `.env` file in the root directory and add your Google Gemini API key:
Why:
This keeps the project's dependencies isolated from other Python projects on your computer.

### 3. Activate the virtual environment

```powershell
.\.venv\Scripts\Activate.ps1
```

Why:
After activation, `python` and `pip` will use the environment created for this project.

If PowerShell blocks activation, run:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\.venv\Scripts\Activate.ps1
```

### 4. Install dependencies

```powershell
pip install -r requirements.txt
```

Why:
This installs everything the app needs, including FastAPI, Uvicorn, `pypdf`, `python-dotenv`, and `google-genai`.

### 5. Add your Gemini API key

Create a `.env` file in the project root with:

```env
GEMINI_API_KEY=your_actual_key_here
```

**3. Install Dependencies**
We recommend using a Virtual Environment (`venv`):
```bash
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt
Why:
The app needs this key to send summarization and synthesis requests to Gemini.

### 6. Start the web app

```powershell
python -m uvicorn app:app --host 127.0.0.1 --port 8000
```

Why:
This starts the FastAPI server that serves both the frontend and the `/api/synthesize` endpoint.

### 7. Open the app in your browser

Open:

```text
http://127.0.0.1:8000/
```

Why:
This is the local address where the project runs after the server starts.

### 8. Upload PDFs and generate the report

In the browser:

1. Upload one or more PDF research papers.
2. Click `Synthesize Papers`.
3. Wait for the app to process the files.
4. Review the generated report.
5. Optionally download the result as a PDF.



Cancel
Comment
Why:
This is the main user flow of the project.

## Quick Start

If your environment is already set up, these are the only commands you need:

```powershell
cd D:\ResearchPaperSynthezier
.\.venv\Scripts\Activate.ps1
python -m uvicorn app:app --host 127.0.0.1 --port 8000
```

Then open:

```text
http://127.0.0.1:8000/
```

## CLI Mode

If you want to run the project without the web UI:

### 1. Put PDF files into the `papers/` folder

Example:

```text
papers/
  paper1.pdf
  paper2.pdf
```

**4. Execute Pipeline**
Drop your academic PDFs into the `papers/` directory and run:
```bash
### 2. Run the script

```powershell
python synthesizer.py
```

Generated exclusively by Antigravity Multi-Agent Architecture.
### 3. Check the output

The generated report will be written to:

```text
synthesis_report.md
```

## How The App Works

1. The app reads uploaded PDF files using `pypdf`.
2. Each paper is split into chunks if needed.
3. Gemini summarizes each paper.
4. Gemini combines all summaries into one final literature review.
5. The result is shown in the UI or saved to a Markdown report.

## Common Problems

### `GEMINI_API_KEY is not set`

Cause:
The `.env` file is missing, empty, or contains a placeholder value.

Fix:
Add a real Gemini API key to `.env`.

### The server starts but synthesis fails

Cause:
Possible reasons include:

- invalid API key
- no internet connection
- PDF text extraction failed

Fix:
Check the terminal logs and test with another PDF.

### Port `8000` is already in use

Run the app on another port:

```powershell
python -m uvicorn app:app --host 127.0.0.1 --port 8001
```

Then open:

```text
http://127.0.0.1:8001/
```

## Development Notes

- `app.py` serves the web UI and API.
- `synthesizer.py` contains the PDF and Gemini logic.
- On Windows, the synthesizer sets a selector event loop policy to avoid async issues.