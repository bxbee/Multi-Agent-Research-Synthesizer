import os
import shutil
import tempfile
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv

from multi_agent import run_workflow

load_dotenv()

app = FastAPI(title="Research Paper Synthesizer API")

# Ensure static directory exists
os.makedirs("static", exist_ok=True)
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/", response_class=HTMLResponse)
async def read_index():
    with open("static/index.html", "r", encoding="utf-8") as f:
        return f.read()

@app.post("/api/synthesize")
async def synthesize_papers(
    topic: str = Form(None),
    files: list[UploadFile] = File(None)
):
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key or api_key == "your_gemini_api_key_here":
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY is not set in Server Environment.")
        
    saved_files = []
    temp_dir = None
    
    try:
        # Save uploaded files if they exist
        if files and len(files) > 0 and files[0].filename != '':
            temp_dir = tempfile.mkdtemp()
            for file in files:
                if not file.filename.lower().endswith('.pdf'):
                    continue
                file_path = os.path.join(temp_dir, file.filename)
                with open(file_path, "wb") as buffer:
                    shutil.copyfileobj(file.file, buffer)
                saved_files.append(file_path)
                
        if not topic and not saved_files:
            raise HTTPException(status_code=400, detail="Please provide either a Topic string or PDF files.")
            
        # Run deep agent synthesis
        state = await run_workflow(api_key, topic=topic or "", local_pdfs=saved_files)
        
        return JSONResponse(content={"report": state.synthesis_report})
        
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if temp_dir:
            shutil.rmtree(temp_dir, ignore_errors=True)

if __name__ == "__main__":
    import uvicorn
    # Rendering default port
    port = int(os.getenv("PORT", 8000))
    uvicorn.run("app:app", host="0.0.0.0", port=port)
