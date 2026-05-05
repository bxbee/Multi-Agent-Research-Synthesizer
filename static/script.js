document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const chatInput = document.getElementById('chat-input');
    const chatForm = document.getElementById('chat-form');
    const sendBtn = document.getElementById('send-btn');
    const chatMessages = document.getElementById('chat-messages');
    
    const fileUpload = document.getElementById('file-upload');
    const attachmentPreview = document.getElementById('attachment-preview');
    
    const loadingIndicator = document.getElementById('loading-indicator');
    
    const researchPanel = document.getElementById('research-panel');
    const reportContent = document.getElementById('report-content');
    const closePanelBtn = document.getElementById('close-panel-btn');
    const exportPdfBtn = document.getElementById('export-pdf-btn');
    
    const themeToggle = document.getElementById('theme-toggle');
    const newChatBtn = document.getElementById('new-chat-btn');
    const historyList = document.getElementById('history-list');

    let selectedFiles = [];
    let pollInterval = null;

    // --- History Dummy Data ---
    const dummyHistory = [
        "Quantum Error Correction",
        "RAG Architectures 2026",
        "Multi-Agent AI Ethics",
        "CRISPR-Cas9 Off-Target Effects"
    ];
    
    function renderHistory() {
        historyList.innerHTML = '';
        dummyHistory.forEach((topic, idx) => {
            const li = document.createElement('li');
            li.className = `history-item ${idx === 0 ? 'active' : ''}`;
            li.innerHTML = `<i class="fa-regular fa-message"></i> <span>${topic}</span>`;
            historyList.appendChild(li);
        });
    }
    renderHistory();

    // --- Theme Toggle ---
    themeToggle.addEventListener('click', () => {
        const html = document.documentElement;
        if (html.getAttribute('data-theme') === 'dark') {
            html.setAttribute('data-theme', 'light');
            themeToggle.innerHTML = '<i class="fa-solid fa-moon"></i> Dark Mode';
        } else {
            html.setAttribute('data-theme', 'dark');
            themeToggle.innerHTML = '<i class="fa-solid fa-sun"></i> Light Mode';
        }
    });

    // --- New Chat ---
    newChatBtn.addEventListener('click', () => {
        location.reload();
    });

    // --- Chat Input & Textarea Auto-Resize ---
    chatInput.addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = (this.scrollHeight) + 'px';
        validateInput();
    });

    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (!sendBtn.disabled) {
                chatForm.dispatchEvent(new Event('submit'));
            }
        }
    });

    // --- File Handling ---
    fileUpload.addEventListener('change', () => {
        const files = Array.from(fileUpload.files);
        files.forEach(file => {
            if (file.type === "application/pdf" && !selectedFiles.some(f => f.name === file.name)) {
                selectedFiles.push(file);
            }
        });
        renderAttachments();
        validateInput();
        fileUpload.value = ''; // reset
    });

    function renderAttachments() {
        attachmentPreview.innerHTML = '';
        if (selectedFiles.length > 0) {
            attachmentPreview.classList.remove('hidden');
            selectedFiles.forEach((file, index) => {
                const chip = document.createElement('div');
                chip.className = 'file-chip';
                chip.innerHTML = `<i class="fa-solid fa-file-pdf"></i> ${file.name} 
                                  <button type="button" data-idx="${index}"><i class="fa-solid fa-xmark"></i></button>`;
                attachmentPreview.appendChild(chip);
            });
            
            attachmentPreview.querySelectorAll('button').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const idx = e.currentTarget.getAttribute('data-idx');
                    selectedFiles.splice(idx, 1);
                    renderAttachments();
                    validateInput();
                });
            });
        } else {
            attachmentPreview.classList.add('hidden');
        }
    }

    function validateInput() {
        const text = chatInput.value.trim();
        if (text.length > 0 || selectedFiles.length > 0) {
            sendBtn.disabled = false;
        } else {
            sendBtn.disabled = true;
        }
    }

    // --- Chat DOM Manipulation ---
    function appendUserMessage(text, files) {
        let content = '';
        if (text) content += `<p>${text}</p>`;
        if (files && files.length > 0) {
            content += `<div style="margin-top: 8px; font-size: 0.9em; opacity: 0.9;">
                            <i class="fa-solid fa-paperclip"></i> Attached ${files.length} PDF(s)
                        </div>`;
        }

        const msgHTML = `
            <div class="message user-message">
                <div class="avatar user-avatar"><i class="fa-solid fa-user"></i></div>
                <div class="message-content">
                    ${content}
                </div>
            </div>
        `;
        chatMessages.insertAdjacentHTML('beforeend', msgHTML);
        scrollToBottom();
    }

    function appendAIMessage(htmlContent) {
        const msgHTML = `
            <div class="message ai-message">
                <div class="avatar ai-avatar"><i class="fa-solid fa-robot"></i></div>
                <div class="message-content bubble-glass">
                    ${htmlContent}
                </div>
            </div>
        `;
        chatMessages.insertAdjacentHTML('beforeend', msgHTML);
        scrollToBottom();
    }

    function scrollToBottom() {
        chatMessages.scrollTo({
            top: chatMessages.scrollHeight,
            behavior: 'smooth'
        });
    }

    // --- API & Synthesis Flow ---
    chatForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const topic = chatInput.value.trim();
        const filesToUpload = [...selectedFiles];
        
        if (!topic && filesToUpload.length === 0) return;

        // 1. UI Updates
        appendUserMessage(topic, filesToUpload);
        
        chatInput.value = '';
        chatInput.style.height = 'auto';
        selectedFiles = [];
        renderAttachments();
        validateInput();
        
        chatInput.disabled = true;
        fileUpload.disabled = true;
        
        loadingIndicator.classList.remove('hidden');
        scrollToBottom();

        // 2. Submit to API
        const formData = new FormData();
        if (topic) formData.append('topic', topic);
        filesToUpload.forEach(f => formData.append('files', f));

        try {
            const response = await fetch('/api/synthesize', {
                method: 'POST',
                body: formData
            });
            const data = await response.json();
            
            if (!response.ok) throw new Error(data.detail || "Failed to start synthesis.");
            
            const taskId = data.task_id;
            
            // 3. Poll Status
            pollInterval = setInterval(async () => {
                try {
                    const statusRes = await fetch(`/api/status/${taskId}`);
                    const statusData = await statusRes.json();
                    
                    if (statusData.status === "completed") {
                        clearInterval(pollInterval);
                        finishSynthesis(statusData.report);
                    } else if (statusData.status === "error") {
                        clearInterval(pollInterval);
                        handleError(statusData.detail);
                    }
                } catch(err) {
                    console.error("Polling error", err);
                }
            }, 3000);

        } catch (err) {
            handleError(err.message);
        }
    });

    function finishSynthesis(markdownReport) {
        loadingIndicator.classList.add('hidden');
        chatInput.disabled = false;
        fileUpload.disabled = false;
        
        // Chat Message
        appendAIMessage(`
            <p><i class="fa-solid fa-circle-check" style="color: #10b981;"></i> Synthesis Complete!</p>
            <p style="margin-top: 10px;">I've gathered the research, analyzed the documents, and compiled a comprehensive literature review. I've opened it in the Research Panel for you.</p>
        `);

        // Populate Right Panel
        reportContent.innerHTML = marked.parse(markdownReport);
        
        // Render Mermaid Diagrams
        const mermaidBlocks = reportContent.querySelectorAll('.language-mermaid');
        if (mermaidBlocks.length > 0) {
            mermaidBlocks.forEach((block) => {
                const tempDiv = document.createElement('div');
                tempDiv.className = 'mermaid';
                tempDiv.textContent = block.textContent;
                // Replace the parent <pre> with the new div
                block.parentNode.replaceWith(tempDiv);
            });
            // Initialize mermaid on the newly added divs
            try {
                mermaid.init(undefined, reportContent.querySelectorAll('.mermaid'));
            } catch (e) {
                console.error("Mermaid initialization error", e);
            }
        }
        
        researchPanel.classList.remove('collapsed');
    }

    function handleError(errorMsg) {
        loadingIndicator.classList.add('hidden');
        chatInput.disabled = false;
        fileUpload.disabled = false;
        
        appendAIMessage(`
            <p><i class="fa-solid fa-triangle-exclamation" style="color: #ef4444;"></i> An error occurred during synthesis:</p>
            <p style="margin-top: 10px; color: #ef4444;">${errorMsg}</p>
        `);
    }

    // --- Right Panel Actions ---
    closePanelBtn.addEventListener('click', () => {
        researchPanel.classList.add('collapsed');
    });

    exportPdfBtn.addEventListener('click', () => {
        const element = document.getElementById('report-content');
        if(element.querySelector('.empty-state')) return; // nothing to export
        
        // Apply temporary styling and footer for PDF export
        element.classList.add('pdf-export-mode');
        const footer = document.createElement('div');
        footer.id = 'pdf-temp-footer';
        footer.className = 'pdf-footer';
        footer.innerHTML = '&copy; Intellectra AI - Copyright Issues';
        element.appendChild(footer);

        const opt = {
            margin:       0.5,
            filename:     'Agentic_Research_Synthesis.pdf',
            image:        { type: 'jpeg', quality: 0.98 },
            html2canvas:  { scale: 2 },
            jsPDF:        { unit: 'in', format: 'letter', orientation: 'portrait' },
            pagebreak:    { mode: ['avoid-all', 'css', 'legacy'] }
        };
        
        html2pdf().set(opt).from(element).save().then(() => {
            // Remove temporary styling and footer after export
            element.classList.remove('pdf-export-mode');
            const f = document.getElementById('pdf-temp-footer');
            if (f) f.remove();
        });
    });
});
