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

from langchain_community.vectorstores import FAISS
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain.docstore.document import Document

class State:
    """Shared Workspace for multi-agent interaction."""
    def __init__(self):
        self.topic = ""
        self.documents = []        # Raw text strings
        self.search_results = []   # Papers metadata
        self.vector_store = None
        
        # New Agent Outputs
        self.summary = ""
        self.cross_references = ""
        self.research_gaps = ""
        self.methodologies = ""
        self.citations = ""
        self.trends = ""
        self.contradictions = ""
        self.synthesis_report = ""

class VectorKnowledgeBase:
    def __init__(self, api_key: str):
        self.embeddings = GoogleGenerativeAIEmbeddings(model="models/embedding-001", google_api_key=api_key)
        self.text_splitter = RecursiveCharacterTextSplitter(chunk_size=1500, chunk_overlap=300)

    def build_index(self, documents: List[str]):
        if not documents:
            return None
        
        docs = [Document(page_content=doc) for doc in documents]
        split_docs = self.text_splitter.split_documents(docs)
        
        vector_store = FAISS.from_documents(split_docs, self.embeddings)
        return vector_store

class Agent:
    def __init__(self, name: str, client: genai.Client, event_callback=None):
        self.name = name
        self.client = client
        self.model_id = "gemini-2.5-flash"
        self.event_callback = event_callback
        
    def log(self, message: str):
        print(f"[{self.name}] {message}")
        if self.event_callback:
            self.event_callback({"agent": self.name, "type": "log", "message": message})

    async def query_llm(self, prompt: str) -> str:
        while True:
            try:
                response = await self.client.aio.models.generate_content(model=self.model_id, contents=prompt)
                return response.text.strip()
            except Exception as e:
                if "429" in repr(e) or "503" in repr(e) or "500" in repr(e):
                    self.log("Rate limited. Sleeping 15s...")
                    await asyncio.sleep(15)
                else:
                    raise e

    def get_context(self, state: State, query: str, k=8) -> str:
        if not state.vector_store:
            return ""
        docs = state.vector_store.similarity_search(query, k=k)
        return "\n\n---\n\n".join([f"Chunk Context:\n{d.page_content}" for d in docs])

class SearchAgent(Agent):
    """Hits external scholarly APIs (arXiv) or uses local PDFs to populate the State documents."""
    def __init__(self, client, event_callback=None):
        super().__init__("SearchAgent", client, event_callback)
        
    async def execute(self, state: State):
        if state.documents:
            self.log(f"Using {len(state.documents)} local documents.")
            return

        self.log(f"Searching for topic: {state.topic}")
        if state.topic:
            url = f"http://export.arxiv.org/api/query?search_query=all:{urllib.parse.quote(state.topic)}&start=0&max_results=5&sortBy=submittedDate&sortOrder=descending"
            
            max_retries = 3
            for attempt in range(max_retries):
                try:
                    response = requests.get(url, timeout=30)
                    response.raise_for_status()
                    break
                except requests.exceptions.RequestException as e:
                    self.log(f"arXiv API attempt {attempt + 1} failed: {e}")
                    if attempt == max_retries - 1:
                        raise Exception(f"Failed to fetch from arXiv: {e}")
                    await asyncio.sleep(2 * (attempt + 1))
            
            root = ET.fromstring(response.content)
            namespace = {'atom': 'http://www.w3.org/2005/Atom'}
            
            for entry in root.findall('atom:entry', namespace):
                title = entry.find('atom:title', namespace).text.strip().replace('\n', ' ')
                summary = entry.find('atom:summary', namespace).text.strip().replace('\n', ' ')
                authors = [author.find('atom:name', namespace).text for author in entry.findall('atom:author', namespace)]
                
                state.search_results.append({"title": title, "authors": authors, "abstract": summary})
                # Treat the paper abstract/title as a document for the KnowledgeBase
                state.documents.append(f"Title: {title}\nAuthors: {', '.join(authors)}\nAbstract:\n{summary}")
                
            self.log(f"Found {len(state.documents)} papers from arXiv.")
        else:
            self.log("No topic or documents provided. Halting.")

class SummarizerAgent(Agent):
    def __init__(self, client, event_callback=None):
        super().__init__("SummarizerAgent", client, event_callback)

    async def execute(self, state: State):
        self.log("Creating unified summary across all documents...")
        context = self.get_context(state, "overall summary objective main findings conclusion", k=10)
        prompt = f"Based on the following retrieved excerpts from multiple research papers, provide a unified 300-word overview of the core topic and main findings across ALL papers.\n\nContext:\n{context}"
        state.summary = await self.query_llm(prompt)

class CrossReferenceAgent(Agent):
    def __init__(self, client, event_callback=None):
        super().__init__("CrossReferenceAgent", client, event_callback)

    async def execute(self, state: State):
        self.log("Finding relationships and thematic links between papers...")
        context = self.get_context(state, "relationship similarity thematic overlap comparison", k=10)
        prompt = f"Analyze the following excerpts and identify thematic links, overlapping concepts, and similarities between the different research papers. Synthesize how they relate to one another.\n\nContext:\n{context}"
        state.cross_references = await self.query_llm(prompt)

class MethodologyAnalyzer(Agent):
    def __init__(self, client, event_callback=None):
        super().__init__("MethodologyAnalyzer", client, event_callback)

    async def execute(self, state: State):
        self.log("Comparing research methods and datasets...")
        context = self.get_context(state, "methodology approach method dataset experiment setup", k=10)
        prompt = f"Analyze the methodologies, datasets, and experimental setups described in the following excerpts. Compare the different approaches used across the papers.\n\nContext:\n{context}"
        state.methodologies = await self.query_llm(prompt)

class ResearchGapFinder(Agent):
    def __init__(self, client, event_callback=None):
        super().__init__("ResearchGapFinder", client, event_callback)

    async def execute(self, state: State):
        self.log("Detecting missing areas and research gaps...")
        context = self.get_context(state, "future work limitation research gap open question challenge", k=10)
        prompt = f"Based on the following excerpts, identify the limitations, open challenges, and research gaps mentioned. What are the key areas for future research?\n\nContext:\n{context}"
        state.research_gaps = await self.query_llm(prompt)

class TrendAnalyzer(Agent):
    def __init__(self, client, event_callback=None):
        super().__init__("TrendAnalyzer", client, event_callback)

    async def execute(self, state: State):
        self.log("Detecting recurring patterns and industry trends...")
        context = self.get_context(state, "trend consensus growth direction adoption pattern", k=10)
        prompt = f"Review the following excerpts and identify the current industry or academic trends, recurring patterns, and areas of consensus.\n\nContext:\n{context}"
        state.trends = await self.query_llm(prompt)

class ContradictionDetector(Agent):
    def __init__(self, client, event_callback=None):
        super().__init__("ContradictionDetector", client, event_callback)

    async def execute(self, state: State):
        self.log("Finding conflicting statements and divergent results...")
        context = self.get_context(state, "conflict contradiction diverge disagree unlike however fail contrary", k=10)
        prompt = f"Analyze the following excerpts and strictly identify any conflicting statements, divergent findings, or disagreements between the research approaches. If none are found, state that the papers generally agree.\n\nContext:\n{context}"
        state.contradictions = await self.query_llm(prompt)

class CitationAgent(Agent):
    def __init__(self, client, event_callback=None):
        super().__init__("CitationAgent", client, event_callback)

    async def execute(self, state: State):
        self.log("Generating references and citations...")
        context = self.get_context(state, "title authors published abstract citation reference", k=5)
        prompt = f"Extract and format the metadata from the following text into standard APA citations. Provide ONLY a markdown list of citations.\n\nContext:\n{context}"
        state.citations = await self.query_llm(prompt)
        
        # Convert the markdown list into a python list for the frontend
        lines = [line.strip().lstrip("-*1234567890. ") for line in state.citations.split("\n") if line.strip()]
        state.citations_list = [line for line in lines if len(line) > 10]

class LiteratureReviewAgent(Agent):
    def __init__(self, client, event_callback=None):
        super().__init__("LiteratureReviewAgent", client, event_callback)

    async def execute(self, state: State):
        self.log("Synthesizing final literature review from all agents...")
        
        prompt = f"""
        You are an expert academic researcher. Compile a comprehensive, highly-structured literature review using the specialized analyses provided below.
        Topic: {state.topic if state.topic else 'Multi-Document Research Synthesis'}
        
        Use the exact insights below. Do not hallucinate outside of this context.
        
        [UNIFIED SUMMARY]: {state.summary}
        [METHODOLOGIES]: {state.methodologies}
        [CROSS-REFERENCES]: {state.cross_references}
        [TRENDS]: {state.trends}
        [CONTRADICTIONS]: {state.contradictions}
        [RESEARCH GAPS]: {state.research_gaps}
        
        CRITICAL INSTRUCTION: Include 2-5 visual figures using Mermaid.js syntax (enclosed in ```mermaid code blocks). 
        These should summarize frameworks, trends, or models (such as conceptual diagrams, comparison charts, and timelines).
        To prevent Mermaid syntax errors, you MUST:
        1. Quote node labels containing special characters like parentheses, brackets, colons, or quotes (e.g., `id["Label (Extra Info)"]`).
        2. Avoid using any HTML tags in labels.

        Structure your review with the following markdown sections:
        # Title
        # Abstract & Unified Topic Overview
        # Methodological Comparison
        # Key Findings & Similarities
        # Divergent Findings & Contradictions
        # Current Trends
        # Research Gaps & Future Directions
        # Conclusion
        """
        
        report = await self.query_llm(prompt)
        
        if hasattr(state, 'citations_list') and state.citations_list:
            report += "\n\n## References\n\n"
            for cite in state.citations_list:
                report += f"- {cite}\n"
                
        state.synthesis_report = report
        self.log("Completed compilation of the final report.")

async def run_workflow(api_key: str, topic: str = "", local_pdfs: List[str] = [], event_callback=None) -> State:
    client = genai.Client(api_key=api_key)
    state = State()
    state.topic = topic
    
    # 1. Parse PDFs
    if local_pdfs:
        if event_callback: event_callback({"agent": "System", "type": "log", "message": f"Extracting text from {len(local_pdfs)} PDFs..."})
        for pdf in local_pdfs:
            try:
                reader = PdfReader(pdf)
                text = ""
                for page in reader.pages:
                    pt = page.extract_text()
                    if pt: text += pt + "\n"
                if text: state.documents.append(text)
            except Exception as e:
                print(f"Error reading {pdf}: {e}")
                
    # 2. Search Agent (if needed)
    search_agent = SearchAgent(client, event_callback)
    if event_callback: event_callback({"agent": search_agent.name, "type": "start"})
    await search_agent.execute(state)
    if event_callback: event_callback({"agent": search_agent.name, "type": "end"})

    # 3. Build Vector Knowledge Base
    if event_callback: event_callback({"agent": "System", "type": "log", "message": "Building FAISS Vector Knowledge Base..."})
    kb = VectorKnowledgeBase(api_key=api_key)
    state.vector_store = kb.build_index(state.documents)

    if not state.vector_store:
        if event_callback: event_callback({"agent": "System", "type": "log", "message": "No documents could be processed. Halting."})
        return state

    # 4. Execute Specialized Agents
    agents = [
        SummarizerAgent(client, event_callback),
        MethodologyAnalyzer(client, event_callback),
        CrossReferenceAgent(client, event_callback),
        TrendAnalyzer(client, event_callback),
        ContradictionDetector(client, event_callback),
        ResearchGapFinder(client, event_callback),
        CitationAgent(client, event_callback),
        LiteratureReviewAgent(client, event_callback)
    ]
    
    for agent in agents:
        if event_callback:
            event_callback({"agent": agent.name, "type": "start"})
        await agent.execute(state)
        if event_callback:
            event_callback({"agent": agent.name, "type": "end"})
        
    # App.py expects state.citations to be a list
    if hasattr(state, 'citations_list'):
        state.citations = state.citations_list
    else:
        state.citations = []

    return state

if __name__ == "__main__":
    async def test():
        load_dotenv()
        api_key = os.getenv("GEMINI_API_KEY")
        state = await run_workflow(api_key, topic="Multi-Agent Systems in AI")
        print(state.synthesis_report)
    asyncio.run(test())
