// PDF Manager Application
class PDFManager {
    constructor() {
        this.currentFolderId = 'root';
        this.selectedFileId = null;
        this.viewMode = 'grid';
        this.searchQuery = '';
        this.pdfDoc = null;
        this.currentPage = 1;
        this.scale = 1.0;
        this.maxFileSize = 50 * 1024 * 1024; // 50MB
        
        // Data structure
        this.folders = new Map();
        this.files = new Map();
        
        // Initialize PDF.js
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
        
        this.init();
    }
    
    init() {
        this.loadData();
        this.setupEventListeners();
        this.updateUI();
        this.updateStorageInfo();
        
        // Initialize root folder if not exists
        if (!this.folders.has('root')) {
            this.folders.set('root', {
                id: 'root',
                name: 'My Documents',
                parentId: null,
                createdAt: new Date().toISOString(),
                children: []
            });
        }
    }
    
    setupEventListeners() {
        // File upload
        const fileInput = document.getElementById('fileInput');
        const uploadArea = document.getElementById('uploadArea');
        
        fileInput.addEventListener('change', (e) => this.handleFileUpload(e.target.files));
        uploadArea.addEventListener('click', () => fileInput.click());
        
        // Drag and drop
        uploadArea.addEventListener('dragover', this.handleDragOver.bind(this));
        uploadArea.addEventListener('dragleave', this.handleDragLeave.bind(this));
        uploadArea.addEventListener('drop', this.handleDrop.bind(this));
        
        // Folder management
        document.getElementById('newFolderBtn').addEventListener('click', () => this.showModal('newFolderModal'));
        document.getElementById('createFolderBtn').addEventListener('click', () => this.createFolder());
        
        // View toggle
        document.getElementById('gridViewBtn').addEventListener('click', () => this.setViewMode('grid'));
        document.getElementById('listViewBtn').addEventListener('click', () => this.setViewMode('list'));
        
        // Search
        document.getElementById('searchInput').addEventListener('input', (e) => {
            this.searchQuery = e.target.value.toLowerCase();
            this.renderFiles();
        });
        
        // PDF viewer controls
        document.getElementById('prevPageBtn').addEventListener('click', () => this.prevPage());
        document.getElementById('nextPageBtn').addEventListener('click', () => this.nextPage());
        document.getElementById('zoomInBtn').addEventListener('click', () => this.zoomIn());
        document.getElementById('zoomOutBtn').addEventListener('click', () => this.zoomOut());
        document.getElementById('fullscreenBtn').addEventListener('click', () => this.toggleFullscreen());
        document.getElementById('downloadBtn').addEventListener('click', () => this.downloadCurrentPDF());
        
        // Modal controls
        document.getElementById('closeModal').addEventListener('click', () => this.closeModal('pdfModal'));
        document.getElementById('modalBackdrop').addEventListener('click', () => this.closeModal('pdfModal'));
        
        // Help button
        document.getElementById('helpBtn').addEventListener('click', () => this.showModal('helpModal'));
        
        // Data management
        document.getElementById('exportDataBtn').addEventListener('click', () => this.exportData());
        document.getElementById('importDataBtn').addEventListener('click', () => this.importData());
        document.getElementById('clearStorageBtn').addEventListener('click', () => this.clearStorage());
        
        // Import file input
        document.getElementById('importInput').addEventListener('change', (e) => this.handleImport(e.target.files[0]));
        
        // Context menu
        document.addEventListener('contextmenu', this.handleContextMenu.bind(this));
        document.addEventListener('click', () => this.hideContextMenu());
        
        // Keyboard shortcuts
        document.addEventListener('keydown', this.handleKeyboard.bind(this));
        
        // Folder name input enter key
        document.getElementById('folderNameInput').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this.createFolder();
        });
        
        // Prevent default drag behaviors on document
        document.addEventListener('dragover', (e) => e.preventDefault());
        document.addEventListener('drop', (e) => e.preventDefault());
    }
    
    // File Upload
    async handleFileUpload(files) {
        if (!files || files.length === 0) return;
        
        const validFiles = Array.from(files).filter(file => {
            if (file.type !== 'application/pdf') {
                this.showNotification('Only PDF files are allowed', 'error');
                return false;
            }
            if (file.size > this.maxFileSize) {
                this.showNotification(`File ${file.name} is too large (max 50MB)`, 'error');
                return false;
            }
            return true;
        });
        
        if (validFiles.length === 0) return;
        
        this.showProgress();
        
        for (let i = 0; i < validFiles.length; i++) {
            const file = validFiles[i];
            const progress = ((i + 1) / validFiles.length) * 100;
            this.updateProgress(progress, `Processing ${file.name}...`);
            
            try {
                await this.processFile(file);
            } catch (error) {
                console.error('Error processing file:', error);
                this.showNotification(`Error processing ${file.name}`, 'error');
            }
        }
        
        this.hideProgress();
        this.updateUI();
        this.updateStorageInfo();
        this.saveData();
    }
    
    async processFile(file) {
        const fileId = this.generateId();
        const arrayBuffer = await this.fileToArrayBuffer(file);
        const base64Data = this.arrayBufferToBase64(arrayBuffer);
        
        // Generate thumbnail
        let thumbnailData = null;
        try {
            thumbnailData = await this.generateThumbnail(arrayBuffer);
        } catch (error) {
            console.warn('Could not generate thumbnail:', error);
        }
        
        const fileData = {
            id: fileId,
            name: file.name,
            folderId: this.currentFolderId,
            size: file.size,
            type: file.type,
            uploadDate: new Date().toISOString(),
            base64Data: base64Data,
            thumbnailData: thumbnailData
        };
        
        this.files.set(fileId, fileData);
        
        // Update folder's children list
        const folder = this.folders.get(this.currentFolderId);
        if (folder && !folder.children.includes(fileId)) {
            folder.children.push(fileId);
        }
    }
    
    async generateThumbnail(arrayBuffer) {
        try {
            const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            const page = await pdf.getPage(1);
            
            const viewport = page.getViewport({ scale: 0.5 });
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            
            await page.render({
                canvasContext: context,
                viewport: viewport
            }).promise;
            
            return canvas.toDataURL('image/jpeg', 0.7);
        } catch (error) {
            throw new Error('Failed to generate thumbnail');
        }
    }
    
    // Drag and Drop
    handleDragOver(e) {
        e.preventDefault();
        e.currentTarget.classList.add('drag-over');
    }
    
    handleDragLeave(e) {
        e.currentTarget.classList.remove('drag-over');
    }
    
    handleDrop(e) {
        e.preventDefault();
        e.currentTarget.classList.remove('drag-over');
        const files = e.dataTransfer.files;
        this.handleFileUpload(files);
    }
    
    // Folder Management
    createFolder() {
        const nameInput = document.getElementById('folderNameInput');
        const name = nameInput.value.trim();
        
        if (!name) {
            this.showNotification('Please enter a folder name', 'error');
            return;
        }
        
        if (this.folderNameExists(name, this.currentFolderId)) {
            this.showNotification('A folder with this name already exists', 'error');
            return;
        }
        
        const folderId = this.generateId();
        const folder = {
            id: folderId,
            name: name,
            parentId: this.currentFolderId,
            createdAt: new Date().toISOString(),
            children: []
        };
        
        this.folders.set(folderId, folder);
        
        // Add to parent's children
        const parentFolder = this.folders.get(this.currentFolderId);
        if (parentFolder) {
            parentFolder.children.push(folderId);
        }
        
        nameInput.value = '';
        this.closeModal('newFolderModal');
        this.updateUI();
        this.saveData();
        this.showNotification('Folder created successfully', 'success');
    }
    
    folderNameExists(name, parentId) {
        const parentFolder = this.folders.get(parentId);
        if (!parentFolder) return false;
        
        return parentFolder.children.some(childId => {
            const child = this.folders.get(childId);
            return child && child.name.toLowerCase() === name.toLowerCase();
        });
    }
    
    navigateToFolder(folderId) {
        if (this.folders.has(folderId)) {
            this.currentFolderId = folderId;
            this.selectedFileId = null;
            this.updateUI();
        }
    }
    
    // File Operations
    openFile(fileId) {
        const file = this.files.get(fileId);
        if (!file) return;
        
        this.selectedFileId = fileId;
        this.showPDFViewer(file);
    }
    
    async showPDFViewer(file) {
        try {
            this.showLoadingOverlay();
            
            const binaryData = this.base64ToArrayBuffer(file.base64Data);
            this.pdfDoc = await pdfjsLib.getDocument({ data: binaryData }).promise;
            
            document.getElementById('pdfTitle').textContent = file.name;
            document.getElementById('totalPages').textContent = this.pdfDoc.numPages;
            
            this.currentPage = 1;
            this.scale = 1.0;
            
            await this.renderPDFPage();
            
            this.showModal('pdfModal');
            this.hideLoadingOverlay();
        } catch (error) {
            console.error('Error loading PDF:', error);
            this.showNotification('Error loading PDF file', 'error');
            this.hideLoadingOverlay();
        }
    }
    
    async renderPDFPage() {
        if (!this.pdfDoc) return;
        
        try {
            const page = await this.pdfDoc.getPage(this.currentPage);
            const viewport = page.getViewport({ scale: this.scale });
            
            const canvas = document.getElementById('pdfCanvas');
            const context = canvas.getContext('2d');
            
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            
            await page.render({
                canvasContext: context,
                viewport: viewport
            }).promise;
            
            document.getElementById('currentPage').textContent = this.currentPage;
            document.getElementById('zoomLevel').textContent = Math.round(this.scale * 100) + '%';
            
            // Update navigation buttons
            document.getElementById('prevPageBtn').disabled = this.currentPage <= 1;
            document.getElementById('nextPageBtn').disabled = this.currentPage >= this.pdfDoc.numPages;
        } catch (error) {
            console.error('Error rendering PDF page:', error);
        }
    }
    
    prevPage() {
        if (this.currentPage > 1) {
            this.currentPage--;
            this.renderPDFPage();
        }
    }
    
    nextPage() {
        if (this.currentPage < this.pdfDoc.numPages) {
            this.currentPage++;
            this.renderPDFPage();
        }
    }
    
    zoomIn() {
        this.scale = Math.min(this.scale + 0.25, 3.0);
        this.renderPDFPage();
    }
    
    zoomOut() {
        this.scale = Math.max(this.scale - 0.25, 0.25);
        this.renderPDFPage();
    }
    
    toggleFullscreen() {
        const modal = document.getElementById('pdfModal');
        if (!document.fullscreenElement) {
            modal.requestFullscreen().catch(err => {
                console.error('Error attempting to enable fullscreen:', err);
            });
        } else {
            document.exitFullscreen();
        }
    }
    
    downloadCurrentPDF() {
        if (!this.selectedFileId) return;
        
        const file = this.files.get(this.selectedFileId);
        if (!file) return;
        
        this.downloadFile(file);
    }
    
    downloadFile(file) {
        const binaryData = this.base64ToArrayBuffer(file.base64Data);
        const blob = new Blob([binaryData], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = file.name;
        a.click();
        
        URL.revokeObjectURL(url);
    }
    
    renameFile(fileId, newName) {
        const file = this.files.get(fileId);
        if (!file) return;
        
        if (!newName.trim()) {
            this.showNotification('Please enter a valid name', 'error');
            return;
        }
        
        if (!newName.toLowerCase().endsWith('.pdf')) {
            newName += '.pdf';
        }
        
        file.name = newName;
        this.saveData();
        this.updateUI();
        this.showNotification('File renamed successfully', 'success');
    }
    
    deleteFile(fileId) {
        if (!confirm('Are you sure you want to delete this file?')) return;
        
        const file = this.files.get(fileId);
        if (!file) return;
        
        // Remove from folder's children
        const folder = this.folders.get(file.folderId);
        if (folder) {
            folder.children = folder.children.filter(id => id !== fileId);
        }
        
        this.files.delete(fileId);
        this.saveData();
        this.updateUI();
        this.updateStorageInfo();
        this.showNotification('File deleted successfully', 'success');
    }
    
    // Context Menu
    handleContextMenu(e) {
        const fileItem = e.target.closest('.file-item');
        if (!fileItem) {
            this.hideContextMenu();
            return;
        }
        
        e.preventDefault();
        const fileId = fileItem.dataset.fileId;
        this.selectedFileId = fileId;
        
        const contextMenu = document.getElementById('contextMenu');
        contextMenu.style.left = e.pageX + 'px';
        contextMenu.style.top = e.pageY + 'px';
        contextMenu.classList.remove('hidden');
        
        // Add click handlers to context items
        contextMenu.querySelectorAll('.context-item').forEach(item => {
            item.onclick = () => this.handleContextAction(item.dataset.action, fileId);
        });
    }
    
    hideContextMenu() {
        document.getElementById('contextMenu').classList.add('hidden');
    }
    
    handleContextAction(action, fileId) {
        this.hideContextMenu();
        
        switch (action) {
            case 'open':
                this.openFile(fileId);
                break;
            case 'rename':
                this.promptRename(fileId);
                break;
            case 'move':
                this.promptMove(fileId);
                break;
            case 'download':
                const file = this.files.get(fileId);
                if (file) this.downloadFile(file);
                break;
            case 'delete':
                this.deleteFile(fileId);
                break;
        }
    }
    
    promptRename(fileId) {
        const file = this.files.get(fileId);
        if (!file) return;
        
        const newName = prompt('Enter new name:', file.name.replace('.pdf', ''));
        if (newName !== null) {
            this.renameFile(fileId, newName);
        }
    }
    
    promptMove(fileId) {
        // Simple implementation - could be enhanced with a folder selector modal
        const folders = Array.from(this.folders.values())
            .filter(f => f.id !== this.currentFolderId)
            .map(f => f.name);
        
        if (folders.length === 0) {
            this.showNotification('No other folders available', 'info');
            return;
        }
        
        // For now, just show an alert about the feature
        this.showNotification('Move to folder feature - use drag and drop between folders in sidebar', 'info');
    }
    
    // Keyboard Shortcuts
    handleKeyboard(e) {
        // Search shortcut
        if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
            e.preventDefault();
            document.getElementById('searchInput').focus();
        }
        
        // Delete file
        if (e.key === 'Delete' && this.selectedFileId) {
            this.deleteFile(this.selectedFileId);
        }
        
        // Rename file
        if (e.key === 'F2' && this.selectedFileId) {
            this.promptRename(this.selectedFileId);
        }
        
        // Close modal
        if (e.key === 'Escape') {
            if (!document.getElementById('pdfModal').classList.contains('hidden')) {
                this.closeModal('pdfModal');
            } else if (!document.getElementById('helpModal').classList.contains('hidden')) {
                this.closeModal('helpModal');
            } else if (!document.getElementById('newFolderModal').classList.contains('hidden')) {
                this.closeModal('newFolderModal');
            }
        }
        
        // PDF viewer shortcuts
        if (!document.getElementById('pdfModal').classList.contains('hidden')) {
            if (e.key === 'ArrowLeft') this.prevPage();
            if (e.key === 'ArrowRight') this.nextPage();
            if (e.key === '+' || e.key === '=') this.zoomIn();
            if (e.key === '-') this.zoomOut();
        }
    }
    
    // UI Updates
    updateUI() {
        this.renderFolderTree();
        this.renderBreadcrumb();
        this.renderFiles();
        this.updateFileCounts();
    }
    
    renderFolderTree() {
        const tree = document.getElementById('folderTree');
        tree.innerHTML = '';
        
        const rootFolder = this.folders.get('root');
        if (rootFolder) {
            tree.appendChild(this.createFolderElement(rootFolder, true));
        }
    }
    
    createFolderElement(folder, isRoot = false) {
        const div = document.createElement('div');
        div.className = `folder-item ${folder.id === this.currentFolderId ? 'active' : ''}`;
        div.dataset.folderId = folder.id;
        div.tabIndex = 0;
        
        const fileCount = this.getFileCountInFolder(folder.id);
        
        div.innerHTML = `
            <div class="folder-content">
                <span class="folder-icon">${isRoot ? '📁' : '📂'}</span>
                <span class="folder-name">${folder.name}</span>
                <div class="folder-actions">
                    <span class="file-count">${fileCount} files</span>
                </div>
            </div>
        `;
        
        div.addEventListener('click', () => this.navigateToFolder(folder.id));
        
        // Add subfolders
        const subfolders = folder.children
            .map(childId => this.folders.get(childId))
            .filter(child => child);
        
        if (subfolders.length > 0) {
            const childrenContainer = document.createElement('div');
            childrenContainer.className = 'folder-children';
            
            subfolders.forEach(subfolder => {
                childrenContainer.appendChild(this.createFolderElement(subfolder));
            });
            
            div.appendChild(childrenContainer);
        }
        
        return div;
    }
    
    renderBreadcrumb() {
        const breadcrumb = document.getElementById('breadcrumb');
        breadcrumb.innerHTML = '';
        
        const path = this.getFolderPath(this.currentFolderId);
        
        path.forEach((folder, index) => {
            const span = document.createElement('span');
            span.className = `breadcrumb-item ${index === path.length - 1 ? 'active' : ''}`;
            span.textContent = `📁 ${folder.name}`;
            span.addEventListener('click', () => this.navigateToFolder(folder.id));
            breadcrumb.appendChild(span);
        });
    }
    
    renderFiles() {
        const container = document.getElementById('filesGrid');
        const emptyState = document.getElementById('emptyState');
        
        // Get files in current folder
        const currentFolder = this.folders.get(this.currentFolderId);
        let filesInFolder = [];
        
        if (currentFolder) {
            filesInFolder = currentFolder.children
                .map(childId => this.files.get(childId))
                .filter(file => file);
        }
        
        // Apply search filter
        if (this.searchQuery) {
            filesInFolder = filesInFolder.filter(file =>
                file.name.toLowerCase().includes(this.searchQuery)
            );
        }
        
        // Clear container
        container.innerHTML = '';
        
        if (filesInFolder.length === 0) {
            container.appendChild(emptyState);
            return;
        }
        
        // Add view mode class
        container.className = `files-grid ${this.viewMode === 'list' ? 'list-view' : ''}`;
        
        filesInFolder.forEach(file => {
            container.appendChild(this.createFileElement(file));
        });
    }
    
    createFileElement(file) {
        const div = document.createElement('div');
        div.className = 'file-item';
        div.dataset.fileId = file.id;
        div.tabIndex = 0;
        
        const thumbnailContent = file.thumbnailData
            ? `<img src="${file.thumbnailData}" alt="PDF thumbnail" class="thumbnail-canvas">`
            : '<div class="pdf-icon">📄</div>';
        
        div.innerHTML = `
            <div class="file-thumbnail">
                ${thumbnailContent}
            </div>
            <div class="file-info">
                <div class="file-name">${file.name}</div>
                <div class="file-meta">
                    <span class="file-size">${this.formatFileSize(file.size)}</span>
                    <span class="file-date">${this.formatDate(file.uploadDate)}</span>
                </div>
            </div>
        `;
        
        div.addEventListener('click', () => this.openFile(file.id));
        div.addEventListener('dblclick', () => this.openFile(file.id));
        
        return div;
    }
    
    setViewMode(mode) {
        this.viewMode = mode;
        
        document.querySelectorAll('.view-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.view === mode);
        });
        
        this.renderFiles();
    }
    
    updateFileCounts() {
        this.folders.forEach(folder => {
            const count = this.getFileCountInFolder(folder.id);
            const element = document.querySelector(`[data-folder-id="${folder.id}"] .file-count`);
            if (element) {
                element.textContent = `${count} files`;
            }
        });
    }
    
    getFileCountInFolder(folderId) {
        const folder = this.folders.get(folderId);
        if (!folder) return 0;
        
        return folder.children.filter(childId => this.files.has(childId)).length;
    }
    
    getFolderPath(folderId) {
        const path = [];
        let currentId = folderId;
        
        while (currentId) {
            const folder = this.folders.get(currentId);
            if (!folder) break;
            
            path.unshift(folder);
            currentId = folder.parentId;
        }
        
        return path;
    }
    
    // Data Management
    saveData() {
        try {
            const data = {
                folders: Array.from(this.folders.entries()),
                files: Array.from(this.files.entries()),
                currentFolderId: this.currentFolderId,
                viewMode: this.viewMode
            };
            
            localStorage.setItem('pdfManager', JSON.stringify(data));
        } catch (error) {
            console.error('Error saving data:', error);
            this.showNotification('Error saving data - storage may be full', 'error');
        }
    }
    
    loadData() {
        try {
            const data = localStorage.getItem('pdfManager');
            if (!data) return;
            
            const parsed = JSON.parse(data);
            
            this.folders = new Map(parsed.folders || []);
            this.files = new Map(parsed.files || []);
            this.currentFolderId = parsed.currentFolderId || 'root';
            this.viewMode = parsed.viewMode || 'grid';
            
        } catch (error) {
            console.error('Error loading data:', error);
            this.showNotification('Error loading saved data', 'error');
        }
    }
    
    exportData() {
        try {
            const data = {
                folders: Array.from(this.folders.entries()),
                files: Array.from(this.files.entries()),
                exportDate: new Date().toISOString(),
                version: '1.0'
            };
            
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.href = url;
            a.download = `pdf-manager-backup-${new Date().toISOString().split('T')[0]}.json`;
            a.click();
            
            URL.revokeObjectURL(url);
            this.showNotification('Data exported successfully', 'success');
        } catch (error) {
            console.error('Error exporting data:', error);
            this.showNotification('Error exporting data', 'error');
        }
    }
    
    importData() {
        document.getElementById('importInput').click();
    }
    
    async handleImport(file) {
        if (!file) return;
        
        try {
            const text = await this.fileToText(file);
            const data = JSON.parse(text);
            
            if (!data.folders || !data.files) {
                throw new Error('Invalid backup file format');
            }
            
            if (confirm('This will replace all current data. Are you sure?')) {
                this.folders = new Map(data.folders);
                this.files = new Map(data.files);
                this.currentFolderId = 'root';
                
                this.saveData();
                this.updateUI();
                this.updateStorageInfo();
                this.showNotification('Data imported successfully', 'success');
            }
        } catch (error) {
            console.error('Error importing data:', error);
            this.showNotification('Error importing data - invalid file format', 'error');
        }
    }
    
    clearStorage() {
        if (!confirm('This will delete all your PDFs and folders. Are you sure?')) return;
        
        if (!confirm('This action cannot be undone. Really delete everything?')) return;
        
        this.folders.clear();
        this.files.clear();
        
        // Recreate root folder
        this.folders.set('root', {
            id: 'root',
            name: 'My Documents',
            parentId: null,
            createdAt: new Date().toISOString(),
            children: []
        });
        
        this.currentFolderId = 'root';
        this.selectedFileId = null;
        
        localStorage.removeItem('pdfManager');
        this.updateUI();
        this.updateStorageInfo();
        this.showNotification('All data cleared successfully', 'success');
    }
    
    updateStorageInfo() {
        const totalSize = Array.from(this.files.values())
            .reduce((sum, file) => sum + file.size, 0);
        
        const maxStorage = 10 * 1024 * 1024; // 10MB estimate for localStorage
        const percentage = Math.min((totalSize / maxStorage) * 100, 100);
        
        document.getElementById('storageBar').style.width = percentage + '%';
        document.getElementById('storageText').textContent = `${this.formatFileSize(totalSize)} used`;
        
        // Show warning if storage is getting full
        if (percentage > 80) {
            document.getElementById('storageText').style.color = 'var(--color-warning)';
        } else if (percentage > 95) {
            document.getElementById('storageText').style.color = 'var(--color-error)';
        } else {
            document.getElementById('storageText').style.color = '';
        }
    }
    
    // Modal Management
    showModal(modalId) {
        document.getElementById(modalId).classList.remove('hidden');
        document.body.style.overflow = 'hidden';
    }
    
    closeModal(modalId) {
        document.getElementById(modalId).classList.add('hidden');
        document.body.style.overflow = '';
        
        // Clear PDF viewer state
        if (modalId === 'pdfModal') {
            this.pdfDoc = null;
            this.selectedFileId = null;
        }
    }
    
    // Progress and Loading
    showProgress() {
        document.getElementById('uploadProgress').style.display = 'block';
    }
    
    hideProgress() {
        document.getElementById('uploadProgress').style.display = 'none';
    }
    
    updateProgress(percentage, text) {
        document.getElementById('progressFill').style.width = percentage + '%';
        document.getElementById('progressText').textContent = text;
    }
    
    showLoadingOverlay() {
        document.getElementById('loadingOverlay').classList.remove('hidden');
    }
    
    hideLoadingOverlay() {
        document.getElementById('loadingOverlay').classList.add('hidden');
    }
    
    // Notifications
    showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: var(--color-surface);
            border: 1px solid var(--color-border);
            border-radius: var(--radius-base);
            padding: var(--space-12) var(--space-16);
            box-shadow: var(--shadow-lg);
            z-index: 1003;
            max-width: 300px;
            opacity: 0;
            transform: translateX(100%);
            transition: all var(--duration-normal) var(--ease-standard);
        `;
        
        // Set border color based on type
        const colors = {
            success: 'var(--color-success)',
            error: 'var(--color-error)',
            warning: 'var(--color-warning)',
            info: 'var(--color-info)'
        };
        
        notification.style.borderLeftColor = colors[type] || colors.info;
        notification.style.borderLeftWidth = '4px';
        
        notification.innerHTML = `
            <div style="display: flex; align-items: center; gap: var(--space-8);">
                <span style="font-size: var(--font-size-lg);">
                    ${type === 'success' ? '✅' : type === 'error' ? '❌' : type === 'warning' ? '⚠️' : 'ℹ️'}
                </span>
                <span style="color: var(--color-text); font-size: var(--font-size-sm);">${message}</span>
            </div>
        `;
        
        document.body.appendChild(notification);
        
        // Animate in
        requestAnimationFrame(() => {
            notification.style.opacity = '1';
            notification.style.transform = 'translateX(0)';
        });
        
        // Auto-remove after 4 seconds
        setTimeout(() => {
            notification.style.opacity = '0';
            notification.style.transform = 'translateX(100%)';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 4000);
    }
    
    // Utility Functions
    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }
    
    formatFileSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
    
    formatDate(dateString) {
        const date = new Date(dateString);
        return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    
    fileToArrayBuffer(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsArrayBuffer(file);
        });
    }
    
    fileToText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsText(file);
        });
    }
    
    arrayBufferToBase64(buffer) {
        let binary = '';
        const bytes = new Uint8Array(buffer);
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }
    
    base64ToArrayBuffer(base64) {
        const binaryString = atob(base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes.buffer;
    }
}

// Global functions for modal management
function closeModal(modalId) {
    document.getElementById(modalId).classList.add('hidden');
    document.body.style.overflow = '';
}

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    window.pdfManager = new PDFManager();
    
    // Add service worker for PWA functionality if needed
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js').catch(() => {
            // Service worker registration failed, but that's okay
        });
    }
    
    console.log('📄 PDF Manager loaded successfully!');
});