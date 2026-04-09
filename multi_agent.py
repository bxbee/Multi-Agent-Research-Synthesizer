import os
import sys
import asyncio
import urllib.request
import urllib.parse
from xml.etree import ElementTree as ET
from typing import List, Dict, Any

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

from pypdf import PdfReader
from google import genai
from dotenv import load_dotenv
import requests

class State:
    """Shared Workspace for multi-agent interaction."""
    def __init__(self):
        self.topic = ""
        self.documents = []        # Raw text if from PDFs
        self.search_results = []   # Papers metadata from external query
        self.summaries = []        # Summarized texts
        self.citations = []        # Formatted citations
        self.similar_papers = ""   # Suggested further reading
        self.synthesis_report = "" # Final compiled text

class Agent:
    def __init__(self, name: str, client: genai.Client):
        self.name = name
        self.client = client
        self.model_id = "gemini-2.5-flash"
        
    def log(self, message: str):
        print(f"[{self.name}] {message}")

class SearchAgent(Agent):
    """Hits external scholarly APIs (arXiv) to retrieve research papers."""
    def __init__(self, client):
        super().__init__("SearchAgent", client)
        
    async def execute(self, state: State):
        self.log(f"Searching for topic: {state.topic}")
        if state.topic:
            # Query arXiv API
            url = f"http://export.arxiv.org/api/query?search_query=all:{urllib.parse.quote(state.topic)}&start=0&max_results=3&sortBy=submittedDate&sortOrder=descending"
            response = requests.get(url)
            root = ET.fromstring(response.content)
            namespace = {'atom': 'http://www.w3.org/2005/Atom'}
            
            for entry in root.findall('atom:entry', namespace):
                title = entry.find('atom:title', namespace).text.strip().replace('\n', ' ')
                summary = entry.find('atom:summary', namespace).text.strip().replace('\n', ' ')
                authors = [author.find('atom:name', namespace).text for author in entry.findall('atom:author', namespace)]
                
                published_elem = entry.find('atom:published', namespace)
                year = published_elem.text[:4] if published_elem is not None else "n.d."
                
                link = entry.find('atom:id', namespace).text
                
                state.search_results.append({
                    "title": title,
                    "authors": authors,
                    "year": year,
                    "abstract": summary,
                    "link": link
                })
            self.log(f"Found {len(state.search_results)} papers from arXiv.")
        elif state.documents:
            self.log(f"Topic is empty. Using {len(state.documents)} local documents.")
        else:
            self.log("No topic or documents provided. Halting.")

class SummarizationAgent(Agent):
    """Produces succinct academic summaries of raw texts or abstracts."""
    def __init__(self, client):
        super().__init__("SummarizationAgent", client)
        
    async def _summarize_text(self, text: str) -> str:
        prompt = f"Provide a 200-300 word summary highlighting contributions and methods for the following:\n\n{text[:50000]}"
        response = await self.client.aio.models.generate_content(model=self.model_id, contents=prompt)
        return response.text

    async def execute(self, state: State):
        self.log("Starting summarization phase...")
        
        async def process_with_retry(text):
            while True:
                try:
                    return await self._summarize_text(text)
                except Exception as e:
                    if "429" in repr(e) or "503" in repr(e) or "500" in repr(e):
                        self.log("Rate limited. Sleeping 15s...")
                        await asyncio.sleep(15)
                    else:
                        raise e

        # Instead of grouping tasks un-started, we execute them safely one by one.
        if state.search_results:
            for paper in state.search_results:
                sum_text = await process_with_retry(f"Title: {paper['title']}\nAbstract: {paper['abstract']}")
                state.summaries.append(sum_text)
        elif state.documents:
            for doc in state.documents:
                sum_text = await process_with_retry(doc)
                state.summaries.append(sum_text)
                
        self.log(f"Generated {len(state.summaries)} individual summaries.")

class CitationAgent(Agent):
    """Generates accurate citations based on paper metadata."""
    def __init__(self, client):
        super().__init__("CitationAgent", client)
        
    async def _cite(self, paper: dict) -> str:
        prompt = f"Generate an APA format citation for the following paper. Provide ONLY the citation, nothing else:\nTitle: {paper.get('title')}\nAuthors: {', '.join(paper.get('authors', []))}\nYear: {paper.get('year')}\nLink: {paper.get('link')}"
        response = await self.client.aio.models.generate_content(model=self.model_id, contents=prompt)
        return response.text.strip()

    async def execute(self, state: State):
        self.log("Formatting citations for the papers...")
        
        async def process_with_retry(paper):
            while True:
                try:
                    return await self._cite(paper)
                except Exception as e:
                    if "429" in repr(e) or "503" in repr(e) or "500" in repr(e):
                        self.log("Rate limited. Sleeping 15s...")
                        await asyncio.sleep(15)
                    else:
                        raise e
                        
        if state.search_results:
            for paper in state.search_results:
                cite_text = await process_with_retry(paper)
                state.citations.append(cite_text)
                
        self.log(f"Generated {len(state.citations)} formatted citations.")

class SimilarityAgent(Agent):
    """Identifies related research connections between the papers."""
    def __init__(self, client):
        super().__init__("SimilarityAgent", client)

    async def execute(self, state: State):
        self.log("Identifying related research fields and connections...")
        if not state.summaries:
            return
            
        # Group first 5 to avoid overly large contexts, just as representative context
        summaries_text = "\n\n".join(state.summaries[:5]) 
        prompt = f"Based on the following paper summaries, identify related research fields and suggest 5 related high-level conceptual directions or seminal works for further reading. Highlight thematic or methodological connections. Format as a markdown list:\n\n{summaries_text}"
        
        while True:
            try:
                response = await self.client.aio.models.generate_content(model=self.model_id, contents=prompt)
                state.similar_papers = response.text
                break
            except Exception as e:
                if "429" in repr(e) or "503" in repr(e) or "500" in repr(e):
                    self.log("Rate limited. Sleeping 15s...")
                    await asyncio.sleep(15)
                else:
                    raise e
                    
        self.log("Generated similarity and further reading suggestions.")

class SynthesisAgent(Agent):
    """Synthesizes all gathered data into a cohesive Literature Review."""
    def __init__(self, client):
        super().__init__("SynthesisAgent", client)

    async def execute(self, state: State):
        self.log("Drafting the final structured literature review...")
        
        # We merge all context together
        context_data = []
        for i, (summ, cite) in enumerate(zip(state.summaries, state.citations + [''] * len(state.summaries))):
            context_data.append(f"--- Paper {i+1} ---\nCitation: {cite}\nSummary:\n{summ}")
            
        context_str = "\n\n".join(context_data)
        
        prompt = f"""
        You are an expert academic researcher tasked with writing a structured 5-page literature review (~2500 words).
        Topic: {state.topic if state.topic else 'Uploaded Documents Analysis'}
        
        Use the following structured summaries and citations below to compile your review. Follow an academic tone.
        Maintain neutrality and synthesize themes rather than listing papers sequentially. Ensure reproducibility, transparency, and academic rigor.
        Embed inline citations where appropriate (e.g., Author, Year).

        Structure your review with the following main sections:
        # Title
        # Abstract
        # Background
        # Methods and Approaches
        # Core Results and Agreements
        # Conflicts and Divergent Findings
        # Open Questions and Future Directions
        # Conclusion
        
        Context data:
        {context_str}
        """
        while True:
            try:
                response = await self.client.aio.models.generate_content(model=self.model_id, contents=prompt)
                report = response.text
                break
            except Exception as e:
                if "429" in repr(e) or "503" in repr(e) or "500" in repr(e):
                    self.log("Rate limited. Sleeping 15s...")
                    await asyncio.sleep(15)
                else:
                    raise e
        
        if state.citations:
            report += "\n\n## References\n\n"
            for cite in state.citations:
                report += f"- {cite}\n"
                
        if state.similar_papers:
            report += "\n\n## Related Works & Further Reading\n\n"
            report += state.similar_papers
            
        state.synthesis_report = report
        self.log("Completed compilation of the final report.")

async def run_workflow(api_key: str, topic: str = "", local_pdfs: List[str] = []) -> State:
    client = genai.Client(api_key=api_key)
    state = State()
    state.topic = topic
    
    if local_pdfs:
        for pdf in local_pdfs:
            # Reusing the pypdf extraction logic
            try:
                reader = PdfReader(pdf)
                text = ""
                for page in reader.pages:
                    pt = page.extract_text()
                    if pt:
                        text += pt + "\n"
                if text:
                    state.documents.append(text)
            except Exception as e:
                print(f"Error reading {pdf}: {e}")
            
    agents = [
        SearchAgent(client),
        SummarizationAgent(client),
        CitationAgent(client),
        SimilarityAgent(client),
        SynthesisAgent(client)
    ]
    
    for agent in agents:
        await agent.execute(state)
        
    return state

async def main():
    load_dotenv()
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key or api_key == "your_gemini_api_key_here":
        print("GEMINI_API_KEY is not set.")
        return
        
    # As an example run
    print("Select Mode:")
    print("1: Topic Mode")
    print("2: Document Mode (from /papers dir)")
    # For automated execution here, we'll default to Topic mode.
    mode = "1" 
    
    if mode == "1":
        topic = "Retrieval Augmented Generation and Agentic AI"
        print(f"--- Starting Multi-Agent Workflow ---\nTopic: {topic}")
        state = await run_workflow(api_key, topic=topic)
    else:
        pdf_dir = "papers"
        if not os.path.exists(pdf_dir):
            print(f"Directory {pdf_dir} does not exist.")
            return
        pdfs = [os.path.join(pdf_dir, f) for f in os.listdir(pdf_dir) if f.endswith('.pdf')]
        print(f"--- Starting Multi-Agent Workflow ---\nDocuments: {len(pdfs)} loaded from {pdf_dir}")
        state = await run_workflow(api_key, local_pdfs=pdfs)

    with open("multi_agent_report.md", "w", encoding="utf-8") as f:
        f.write(state.synthesis_report)
        
    print(f"Workflow Complete. Result saved to 'multi_agent_report.md'.")
    
if __name__ == "__main__":
    asyncio.run(main())
