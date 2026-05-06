import os
import shutil
import tempfile
import uuid
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, BackgroundTasks
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv
from pydantic import BaseModel
import json
from datetime import datetime

from multi_agent import run_workflow

load_dotenv()

app = FastAPI(title="Intellectra AI API")

# Ensure static directory exists
os.makedirs("static", exist_ok=True)
app.mount("/static", StaticFiles(directory="static"), name="static")

tasks = {}

HISTORY_FILE = "history.json"

def load_history():
    if not os.path.exists(HISTORY_FILE):
        return {}
    with open(HISTORY_FILE, "r", encoding="utf-8") as f:
        try:
            return json.load(f)
        except json.JSONDecodeError:
            return {}

def save_history(history):
    with open(HISTORY_FILE, "w", encoding="utf-8") as f:
        json.dump(history, f, indent=4)

@app.get("/", response_class=HTMLResponse)
async def read_index():
    with open("static/index.html", "r", encoding="utf-8") as f:
        return f.read()

async def run_synthesis_task(task_id: str, api_key: str, topic: str, saved_files: list, temp_dir: str):
    try:
        state = await run_workflow(api_key, topic=topic or "", local_pdfs=saved_files)
        tasks[task_id] = {"status": "completed", "report": state.synthesis_report, "citations": state.citations, "task_id": task_id}
        
        history = load_history()
        history[task_id] = {
            "task_id": task_id,
            "topic": topic or "Local PDFs Analysis",
            "timestamp": datetime.now().isoformat(),
            "report": state.synthesis_report,
            "citations": state.citations,
            "counter_questions": []
        }
        save_history(history)
        
    except Exception as e:
        tasks[task_id] = {"status": "error", "detail": str(e)}
    finally:
        if temp_dir:
            shutil.rmtree(temp_dir, ignore_errors=True)

@app.post("/api/synthesize")
async def synthesize_papers(
    background_tasks: BackgroundTasks,
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
            
        task_id = str(uuid.uuid4())
        tasks[task_id] = {"status": "processing"}
        
        background_tasks.add_task(run_synthesis_task, task_id, api_key, topic, saved_files, temp_dir)
        
        return JSONResponse(content={"task_id": task_id})
        
    except ValueError as ve:
        if temp_dir:
            shutil.rmtree(temp_dir, ignore_errors=True)
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        if temp_dir:
            shutil.rmtree(temp_dir, ignore_errors=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/status/{task_id}")
async def get_task_status(task_id: str):
    if task_id not in tasks:
        raise HTTPException(status_code=404, detail="Task not found")
    return JSONResponse(content=tasks[task_id])

class CounterQuestionRequest(BaseModel):
    task_id: str
    question: str

@app.get("/api/history")
async def get_history():
    history = load_history()
    summaries = []
    for k, v in history.items():
        summaries.append({
            "task_id": k,
            "topic": v["topic"],
            "timestamp": v["timestamp"]
        })
    summaries.sort(key=lambda x: x["timestamp"], reverse=True)
    return JSONResponse(content=summaries)

@app.get("/api/history/{task_id}")
async def get_history_item(task_id: str):
    history = load_history()
    if task_id not in history:
        raise HTTPException(status_code=404, detail="History not found")
    return JSONResponse(content=history[task_id])

@app.post("/api/counter_question")
async def counter_question(req: CounterQuestionRequest):
    history = load_history()
    if req.task_id not in history:
        raise HTTPException(status_code=404, detail="History not found")
        
    item = history[req.task_id]
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY is not set.")
        
    try:
        from google import genai
        client = genai.Client(api_key=api_key)
        
        context = item["report"]
        prompt = f"Based on the following synthesis report:\n\n{context}\n\nAnswer the following counter-question concisely: {req.question}"
        
        response = await client.aio.models.generate_content(
            model='gemini-2.5-flash',
            contents=prompt,
        )
        
        answer = response.text
        
        cq = {"question": req.question, "answer": answer, "timestamp": datetime.now().isoformat()}
        item.setdefault("counter_questions", []).append(cq)
        save_history(history)
        
        return JSONResponse(content=cq)
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    # Rendering default port
    port = int(os.getenv("PORT", 8000))
    uvicorn.run("app:app", host="0.0.0.0", port=port)
