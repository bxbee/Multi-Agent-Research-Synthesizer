import os
import sys
import asyncio
from typing import List

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
from pypdf import PdfReader
from google import genai
from dotenv import load_dotenv

class PDFIngestor:
    """Handles the extraction of raw text from PDF documents."""
    @staticmethod
    def extract_text(file_path: str) -> str:
        try:
            reader = PdfReader(file_path)
            text = ""
            for page in reader.pages:
                page_text = page.extract_text()
                if page_text:
                    text += page_text + "\n"
            return text
        except Exception as e:
            print(f"Error parsing {file_path}: {e}")
            return ""

class PaperSynthesizer:
    """Uses Gemini to summarize individual papers and synthesize a final review."""
    def __init__(self, api_key: str):
        self.client = genai.Client(api_key=api_key)
        self.model_id = "gemini-2.5-flash"
        self.chunk_size = 50000 # Gemini 2.5 Flash has a huge context window so we can safely load big chunks!
        
    async def _summarize_chunk(self, chunk: str) -> str:
        response = await self.client.aio.models.generate_content(
            model=self.model_id,
            contents=f"Summarize the following text segment from an academic paper:\n\n{chunk}"
        )
        return response.text

    async def summarize_paper(self, text: str, paper_name: str) -> str:
        """Summarizes a single paper using an optimized map-reduce strategy."""
        chunks = [text[i:i+self.chunk_size] for i in range(0, len(text), self.chunk_size)]
        
        chunk_tasks = [self._summarize_chunk(chunk) for chunk in chunks]
        chunk_summaries = await asyncio.gather(*chunk_tasks)
        
        combined_chunks = "\n".join(chunk_summaries)
        
        final_response = await self.client.aio.models.generate_content(
            model=self.model_id,
            contents=f"Synthesize the following segment summaries into one cohesive summary for the paper '{paper_name}'.\n\n{combined_chunks}"
        )
        
        return f"### Summary of {paper_name}\n{final_response.text}\n"
        
    async def synthesize(self, summaries: List[str]) -> str:
        """Combines multiple summaries into one cohesive literature review."""
        combined_summaries = "\n".join(summaries)
        prompt = f"""
        You are an expert academic researcher. Below are the summaries of several research papers.
        Synthesize these summaries into a cohesive literature review. 
        Highlight common themes, methodologies, conflicting results, and potential gaps in the research.
        
        Summaries:
        {combined_summaries}
        
        Synthesized Review:
        """
        response = await self.client.aio.models.generate_content(
            model=self.model_id,
            contents=prompt
        )
        return response.text

async def main():
    load_dotenv()
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key or api_key == "your_gemini_api_key_here":
        print("ERROR: Please set your real GEMINI_API_KEY inside the .env file.")
        return
        
    pdf_dir = "papers"
    if not os.path.exists(pdf_dir):
        os.makedirs(pdf_dir)
        print(f"Created '{pdf_dir}' directory. Please place your PDF papers inside it and run again.")
        return
        
    pdf_files = [os.path.join(pdf_dir, f) for f in os.listdir(pdf_dir) if f.endswith('.pdf')]
    if not pdf_files:
        print(f"No PDFs found inside the '{pdf_dir}' directory.")
        return
        
    print(f"Found {len(pdf_files)} papers. Starting synthesis...")
    synthesizer = PaperSynthesizer(api_key=api_key)
    
    tasks = []
    print("Ingesting and summarizing PDFs in parallel...")
    for pdf in pdf_files:
        text = PDFIngestor.extract_text(pdf)
        if text:
            tasks.append(synthesizer.summarize_paper(text, pdf))
            
    if tasks:
        summaries = await asyncio.gather(*tasks)
        
        print("Synthesizing final literature review...")
        final_review = await synthesizer.synthesize(summaries)
        
        with open("synthesis_report.md", "w", encoding="utf-8") as f:
            f.write("# Research Paper Synthesis Report\n\n")
            f.write(final_review)
            f.write("\n\n## Individual Summaries\n\n")
            for summary in summaries:
                f.write(summary + "\n")
                
        print("Synthesis complete! Check 'synthesis_report.md'")

async def run_synthesis_on_files(api_key: str, pdf_files: list) -> str:
    synthesizer = PaperSynthesizer(api_key=api_key)
    
    tasks = []
    print(f"Ingesting and summarizing {len(pdf_files)} PDFs in parallel...")
    for pdf in pdf_files:
        text = PDFIngestor.extract_text(pdf)
        if text:
            paper_name = os.path.basename(pdf)
            tasks.append(synthesizer.summarize_paper(text, paper_name))
            
    if not tasks:
        raise ValueError("No text could be extracted from the provided PDFs.")
        
    summaries = await asyncio.gather(*tasks)
    
    print("Synthesizing final literature review...")
    final_review = await synthesizer.synthesize(summaries)
    
    report = "# Research Paper Synthesis Report\n\n"
    report += final_review + "\n\n## Individual Summaries\n\n"
    for summary in summaries:
        report += summary + "\n"
        
    return report

if __name__ == "__main__":
    asyncio.run(main())
