document.addEventListener('DOMContentLoaded', () => {

    const t = (key, params) => I18N.t(key, params);

    function applyI18nToDOM() {
        document.querySelectorAll('[data-i18n]').forEach(el => el.textContent = t(el.dataset.i18n));
        document.querySelectorAll('[data-i18n-placeholder]').forEach(el => el.placeholder = t(el.dataset.i18nPlaceholder));
        document.title = t('app.title').replace('✦ ', '');
    }

    // =====================================================================
    //  State
    // =====================================================================
    const GALLERY_KEY = 'styleExplorer_gallery';
    const INSPO_KEY   = 'styleExplorer_inspo';

    let galleryEntries = [];   // { id, name, tag1, tags[], image, clicks, createdAt, prompt }
    let inspoEntries   = [];   // { id, image, clicks, createdAt, prompt }
    let currentView    = 'gallery'; // 'gallery' | 'inspiration'
    let currentSort    = 'clicks';
    let searchTerm     = '';
    let gridColumns    = 5;
    let dataLoaded     = false;  // 数据是否已从云端加载完成

    // =====================================================================
    //  DOM
    // =====================================================================
    const gallery         = document.getElementById('gallery');
    const inspiration     = document.getElementById('inspiration');
    const emptyState      = document.getElementById('empty-state');
    const searchInput     = document.getElementById('search-input');
    const gridSlider      = document.getElementById('grid-slider');
    const gridValue       = document.getElementById('grid-value');
    const gridLabel       = document.querySelector('.grid-label');
    const totalCount      = document.getElementById('total-count');
    const toastEl         = document.getElementById('toast');
    const langToggle      = document.getElementById('lang-toggle');
    const dropOverlay     = document.getElementById('drop-overlay');
    const uploadModal     = document.getElementById('upload-modal');
    const modalCloseBtn   = document.getElementById('modal-close-btn');
    const uploadPreview   = document.getElementById('upload-preview-img');
    const entryTag1Input  = document.getElementById('entry-tag1');
    const entryNameInput  = document.getElementById('entry-name');
    const entryTagsInput  = document.getElementById('entry-tags');
    const entryPromptArea = document.getElementById('entry-prompt');
    const uploadSubmitBtn = document.getElementById('upload-submit-btn');
    const formGalleryFields = document.getElementById('form-gallery-fields');
    const lightbox        = document.getElementById('lightbox');
    const lightboxImg     = document.getElementById('lightbox-img');
    const lightboxName    = document.getElementById('lightbox-name');
    const lightboxClicks  = document.getElementById('lightbox-clicks');
    const lightboxClose   = document.querySelector('.lightbox-close');
    const contextMenu     = document.getElementById('context-menu');
    const editModal       = document.getElementById('edit-modal');
    const editModalClose  = document.getElementById('edit-modal-close-btn');
    const editTag1        = document.getElementById('edit-tag1');
    const editName        = document.getElementById('edit-name');
    const editTags        = document.getElementById('edit-tags');
    const editPrompt      = document.getElementById('edit-prompt');
    const editSaveBtn     = document.getElementById('edit-save-btn');
    const editGalleryFields = document.getElementById('edit-gallery-fields');
    const sortBtns        = document.querySelectorAll('.sort-btn');

    let pendingFile = null;
    let contextTarget = null; // entry being right-clicked
    let showNsfw = false;     // R18 显示开关
    const nsfwToggleWrap = document.getElementById('nsfw-toggle-wrap');
    const nsfwToggle     = document.getElementById('nsfw-toggle');

    // =====================================================================
    //  PNG Metadata
    // =====================================================================
    function readPngTextChunks(buf) {
        const view = new DataView(buf);
        const dec = new TextDecoder('latin1');
        const r = {};
        let off = 8;
        while (off < view.byteLength - 8) {
            const len = view.getUint32(off); off += 4;
            const type = String.fromCharCode(...new Uint8Array(buf, off, 4)); off += 4;
            const data = new Uint8Array(buf, off, len); off += len; off += 4;
            if (type === 'tEXt') {
                let n = data.indexOf(0); if (n === -1) n = data.length;
                r[dec.decode(data.slice(0, n))] = dec.decode(data.slice(n + 1));
            }
            if (type === 'IEND') break;
        }
        return r;
    }

    function extractPositivePrompt(json) {
        try {
            const d = JSON.parse(json);
            for (const id of Object.keys(d)) {
                const n = d[id];
                if (n?.class_type === 'CLIPTextEncode' && (n._meta?.title || '').toLowerCase().includes('positive'))
                    return n.inputs?.text || '';
            }
            for (const id of Object.keys(d)) {
                const n = d[id];
                if (n?.class_type === 'CLIPTextEncode' && !(n._meta?.title || '').toLowerCase().includes('negative'))
                    return n.inputs?.text || '';
            }
        } catch (e) {}
        return '';
    }

    function extractArtists(text) {
        if (!text) return [];
        const r = []; let m;
        const re = /@[^,\n]+/g;
        while ((m = re.exec(text)) !== null) r.push(m[0].trim());
        return r;
    }

    async function processImageFile(file) {
        const r = { prompt: '', artists: [] };
        if (file.type !== 'image/png') return r;
        try {
            const buf = await file.arrayBuffer();
            const chunks = readPngTextChunks(buf);
            if (chunks.prompt) {
                r.prompt = extractPositivePrompt(chunks.prompt);
                r.artists = extractArtists(r.prompt);
            }
        } catch (e) {}
        return r;
    }

    // =====================================================================
    //  Persistence
    // =====================================================================

    // --- Cloud API helpers ---
    async function apiRequest(path, options = {}) {
        const url = CONFIG.API_BASE + path;
        const headers = { 'X-API-Key': CONFIG.API_KEY, ...(options.headers || {}) };
        const res = await fetch(url, { ...options, headers });
        return res;
    }

    async function uploadImageToR2(file) {
        const form = new FormData();
        form.append('file', file);
        const res = await apiRequest('/api/upload', { method: 'POST', body: form });
        const data = await res.json();
        if (!data.success) throw new Error(data.error || 'Upload failed');
        // Return full URL to access the image
        return CONFIG.API_BASE + data.url;
    }

    async function deleteImageFromR2(imageUrl) {
        if (!imageUrl || !imageUrl.includes('/api/image/')) return;
        const path = '/api/image/' + imageUrl.split('/api/image/')[1];
        await apiRequest(path, { method: 'DELETE' });
    }

    async function saveCloud(type = 'gallery') {
        const data = type === 'gallery' ? galleryEntries : inspoEntries;
        await apiRequest('/api/data?type=' + type, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
    }

    async function loadCloud(type = 'gallery') {
        const res = await apiRequest('/api/data?type=' + type);
        return await res.json();
    }

    // --- Unified save/load ---
    async function save() {
        if (CONFIG.USE_CLOUD && !dataLoaded) {
            console.warn('Save blocked: data not yet loaded from cloud');
            return;
        }
        if (CONFIG.USE_CLOUD) {
            try {
                await saveCloud('gallery');
                await saveCloud('inspiration');
            } catch (e) { console.error('Cloud save failed:', e); }
        } else {
            try {
                localStorage.setItem(GALLERY_KEY, JSON.stringify(galleryEntries));
                localStorage.setItem(INSPO_KEY, JSON.stringify(inspoEntries));
            } catch (e) { console.warn('Storage full', e); }
        }
    }

    async function load() {
        if (CONFIG.USE_CLOUD) {
            try {
                galleryEntries = await loadCloud('gallery');
                inspoEntries = await loadCloud('inspiration');
                if (!Array.isArray(galleryEntries)) galleryEntries = [];
                if (!Array.isArray(inspoEntries)) inspoEntries = [];
                dataLoaded = true;
            } catch (e) {
                console.error('Cloud load failed:', e);
                // 不清空！保留空数组但不标记为已加载，防止 save 覆盖云端数据
                showToast('Failed to load data from cloud');
            }
        } else {
            try {
                const g = localStorage.getItem(GALLERY_KEY);
                const i = localStorage.getItem(INSPO_KEY);
                if (g) galleryEntries = JSON.parse(g);
                if (i) inspoEntries = JSON.parse(i);
                dataLoaded = true;
            } catch (e) { galleryEntries = []; inspoEntries = []; }
        }
    }

    // =====================================================================
    //  Toast
    // =====================================================================
    let toastTO;
    function showToast(msg) {
        clearTimeout(toastTO);
        toastEl.textContent = msg;
        toastEl.classList.add('show');
        toastTO = setTimeout(() => toastEl.classList.remove('show'), 2200);
    }

    // =====================================================================
    //  Helpers
    // =====================================================================
    function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
    function genId() { return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8); }

    function getEntries() { return currentView === 'gallery' ? galleryEntries : inspoEntries; }

    function getSorted(entries) {
        let filtered = entries;
        if (searchTerm) {
            const q = searchTerm;
            if (currentView === 'gallery') {
                filtered = filtered.filter(e =>
                    e.name.toLowerCase().includes(q) ||
                    (e.tag1 || '').toLowerCase().includes(q) ||
                    (e.tags || []).some(t => t.toLowerCase().includes(q))
                );
            } else {
                filtered = filtered.filter(e => (e.prompt || '').toLowerCase().includes(q));
            }
        }
        let sorted = [...filtered];
        switch (currentSort) {
            case 'clicks': sorted.sort((a, b) => b.clicks - a.clicks || b.createdAt - a.createdAt); break;
            case 'newest': sorted.sort((a, b) => b.createdAt - a.createdAt); break;
            case 'name':   sorted.sort((a, b) => (a.name || '').localeCompare(b.name || '')); break;
            case 'random': for (let i = sorted.length - 1; i > 0; i--) { const j = Math.floor(Math.random()*(i+1)); [sorted[i],sorted[j]]=[sorted[j],sorted[i]]; } break;
        }
        return sorted;
    }

    // =====================================================================
    //  Render
    // =====================================================================
    function render() {
        const entries = getEntries();
        const sorted = getSorted(entries);
        totalCount.textContent = entries.length;

        // R18 开关只在灵感界面显示
        if (nsfwToggleWrap) nsfwToggleWrap.style.display = currentView === 'inspiration' ? '' : 'none';

        if (entries.length === 0) {
            emptyState.classList.add('visible');
            return;
        }
        emptyState.classList.remove('visible');

        const container = currentView === 'gallery' ? gallery : inspiration;
        container.innerHTML = '';

        if (sorted.length === 0) {
            container.innerHTML = `<p style="grid-column:1/-1;column-span:all;text-align:center;color:var(--text-tertiary);padding:40px 0">${t('toast.noresults')}</p>`;
            return;
        }

        sorted.forEach(entry => {
            const el = currentView === 'gallery' ? createGalleryCard(entry) : createInspoCard(entry);
            container.appendChild(el);
        });
    }

    // ---- Gallery Card ----
    function createGalleryCard(entry) {
        const card = document.createElement('div');
        card.className = 'card';
        card.dataset.id = entry.id;

        const tagsStr = (entry.tags && entry.tags.length > 0)
            ? entry.tags.slice(0, 3).map(tag => esc(tag)).join(' · ')
            : t('card.notags');

        card.innerHTML = `
            <div class="card__image-wrapper">
                <img class="card__image" src="${entry.image}" alt="${esc(entry.name)}" loading="lazy">
                ${entry.clicks > 0 ? `<div class="card__badge">${entry.clicks}</div>` : ''}
            </div>
            <div class="card__info">
                <div class="card__name" title="${esc(entry.name)}">${esc(entry.name)}</div>
                ${entry.tag1 ? `<div class="card__tag1" title="${esc(entry.tag1)}">${esc(entry.tag1)}</div>` : ''}
                <div class="card__meta">${tagsStr}</div>
            </div>
        `;

        // Click → copy tag1, increment clicks
        card.addEventListener('click', (e) => {
            const copyText = entry.tag1 || entry.name;
            entry.clicks++;
            save();
            navigator.clipboard.writeText(copyText).then(() => {
                showToast(t('toast.copied', { name: copyText }));
            }).catch(() => showToast(copyText));
            // Update badge
            let badge = card.querySelector('.card__badge');
            if (badge) { badge.textContent = entry.clicks; }
            else { const w = card.querySelector('.card__image-wrapper'); badge = document.createElement('div'); badge.className='card__badge'; badge.textContent=entry.clicks; w.appendChild(badge); }
        });

        // Double click → lightbox
        card.addEventListener('dblclick', () => openLightbox(entry));

        // Right click → context menu
        card.addEventListener('contextmenu', (e) => { e.preventDefault(); openContextMenu(e, entry); });

        return card;
    }

    // ---- Inspiration Card ----
    function createInspoCard(entry) {
        const card = document.createElement('div');
        card.className = 'inspo-card' + (entry.nsfw ? ' nsfw' : '') + (entry.nsfw && showNsfw ? ' nsfw-visible' : '');
        card.dataset.id = entry.id;

        card.innerHTML = `<img class="inspo-card__image" src="${entry.image}" alt="inspiration" loading="lazy">`;

        // Click → copy full prompt
        card.addEventListener('click', () => {
            entry.clicks++;
            save();
            if (entry.prompt) {
                navigator.clipboard.writeText(entry.prompt).then(() => {
                    showToast(t('toast.copiedPrompt'));
                }).catch(() => showToast(t('toast.copiedPrompt')));
            } else {
                showToast(t('toast.noPrompt'));
            }
        });

        // Double click → lightbox
        card.addEventListener('dblclick', () => openLightbox(entry));

        // Right click
        card.addEventListener('contextmenu', (e) => { e.preventDefault(); openContextMenu(e, entry); });

        return card;
    }

    // =====================================================================
    //  Lightbox
    // =====================================================================
    function openLightbox(entry) {
        lightboxImg.src = entry.image;
        lightboxName.textContent = entry.name || '';
        const n = entry.clicks || 0;
        lightboxClicks.textContent = t(n === 1 ? 'lightbox.click' : 'lightbox.clicks', { n });
        lightbox.classList.add('visible');
    }
    function closeLightbox() { lightbox.classList.remove('visible'); }
    lightboxClose.addEventListener('click', closeLightbox);
    lightbox.addEventListener('click', (e) => { if (e.target === lightbox) closeLightbox(); });

    // =====================================================================
    //  Context Menu (右键菜单)
    // =====================================================================
    function openContextMenu(e, entry) {
        contextTarget = entry;

        // Show/hide tag-related items based on view
        const copyTagItem = contextMenu.querySelector('[data-action="copyTag"]');
        if (copyTagItem) copyTagItem.style.display = currentView === 'gallery' ? '' : 'none';

        // Show/hide R18 toggle — only in inspiration view
        const nsfwItem = contextMenu.querySelector('[data-action="toggleNsfw"]');
        if (nsfwItem) {
            nsfwItem.style.display = currentView === 'inspiration' ? '' : 'none';
            const nsfwTextEl = document.getElementById('nsfw-menu-text');
            if (nsfwTextEl) nsfwTextEl.textContent = entry.nsfw ? t('ctx.unNsfw') : t('ctx.toggleNsfw');
        }

        contextMenu.style.left = e.clientX + 'px';
        contextMenu.style.top = e.clientY + 'px';
        contextMenu.classList.add('visible');

        // Adjust if overflowing
        requestAnimationFrame(() => {
            const rect = contextMenu.getBoundingClientRect();
            if (rect.right > window.innerWidth) contextMenu.style.left = (e.clientX - rect.width) + 'px';
            if (rect.bottom > window.innerHeight) contextMenu.style.top = (e.clientY - rect.height) + 'px';
        });
    }

    function closeContextMenu() {
        contextMenu.classList.remove('visible');
        contextTarget = null;
    }

    document.addEventListener('click', closeContextMenu);
    document.addEventListener('contextmenu', (e) => {
        if (!e.target.closest('.card') && !e.target.closest('.inspo-card')) closeContextMenu();
    });

    contextMenu.querySelectorAll('.context-menu-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!contextTarget) return;
            const action = item.dataset.action;

            switch (action) {
                case 'edit':
                    openEditModal(contextTarget);
                    break;
                case 'copyTag':
                    const tag = contextTarget.tag1 || contextTarget.name || '';
                    navigator.clipboard.writeText(tag).then(() => showToast(t('toast.copied', { name: tag })));
                    break;
                case 'copyPrompt':
                    if (contextTarget.prompt) {
                        navigator.clipboard.writeText(contextTarget.prompt).then(() => showToast(t('toast.copiedPrompt')));
                    } else { showToast(t('toast.noPrompt')); }
                    break;
                case 'delete':
                    if (confirm(t('confirm.delete', { name: contextTarget.name || contextTarget.id }))) {
                        const imgUrl = contextTarget.image;
                        if (currentView === 'gallery') galleryEntries = galleryEntries.filter(e => e.id !== contextTarget.id);
                        else inspoEntries = inspoEntries.filter(e => e.id !== contextTarget.id);
                        if (CONFIG.USE_CLOUD) deleteImageFromR2(imgUrl).catch(e => console.warn('R2 delete failed:', e));
                        save(); render(); showToast(t('toast.deleted'));
                    }
                    break;
                case 'toggleNsfw':
                    if (currentView === 'inspiration') {
                        contextTarget.nsfw = !contextTarget.nsfw;
                        save();
                        render();
                        showToast(contextTarget.nsfw ? t('ctx.toggleNsfw') : t('ctx.unNsfw'));
                    }
                    break;
            }
            closeContextMenu();
        });
    });

    // =====================================================================
    //  Edit Modal
    // =====================================================================
    let editingEntry = null;

    function openEditModal(entry) {
        editingEntry = entry;
        editGalleryFields.style.display = currentView === 'gallery' ? '' : 'none';

        if (currentView === 'gallery') {
            editTag1.value = entry.tag1 || '';
            editName.value = entry.name || '';
            editTags.value = (entry.tags || []).join(', ');
        }
        editPrompt.value = entry.prompt || '';

        editModal.classList.add('visible');
    }

    function closeEditModal() {
        editModal.classList.remove('visible');
        editingEntry = null;
    }

    editModalClose.addEventListener('click', closeEditModal);
    editModal.addEventListener('click', (e) => { if (e.target === editModal) closeEditModal(); });

    editSaveBtn.addEventListener('click', () => {
        if (!editingEntry) return;

        if (currentView === 'gallery') {
            editingEntry.tag1 = editTag1.value.trim();
            editingEntry.name = editName.value.trim() || editingEntry.tag1;
            editingEntry.tags = editTags.value.trim() ? editTags.value.split(',').map(s => s.trim()).filter(Boolean) : [];
        }
        editingEntry.prompt = editPrompt.value.trim();

        save();
        render();
        closeEditModal();
        showToast(t('toast.saved'));
    });

    // =====================================================================
    //  Drag & Drop
    // =====================================================================
    let dragCounter = 0;
    document.addEventListener('dragenter', (e) => { e.preventDefault(); if (window.DragSort && DragSort.isDragging) return; if (++dragCounter === 1) dropOverlay.classList.add('visible'); });
    document.addEventListener('dragleave', (e) => { e.preventDefault(); if (--dragCounter === 0) dropOverlay.classList.remove('visible'); });
    document.addEventListener('dragover', (e) => e.preventDefault());
    document.addEventListener('drop', (e) => {
        e.preventDefault(); dragCounter = 0; dropOverlay.classList.remove('visible');
        if (window.DragSort && DragSort.isDragging) return;
        const file = e.dataTransfer.files[0];
        if (!file || !file.type.startsWith('image/')) { showToast(t('toast.dropImage')); return; }
        pendingFile = file;
        handleNewImage(file);
    });

    // =====================================================================
    //  Upload Modal
    // =====================================================================
    async function handleNewImage(file) {
        // 灵感界面：直接上传，不弹窗
        if (currentView === 'inspiration') {
            await quickUploadInspo(file);
            pendingFile = null;
            return;
        }

        const badge = document.getElementById('auto-detect-badge');
        const reader = new FileReader();
        reader.onload = (ev) => { uploadPreview.src = ev.target.result; };
        reader.readAsDataURL(file);

        const meta = await processImageFile(file);

        // Show/hide gallery-specific fields
        formGalleryFields.style.display = currentView === 'gallery' ? '' : 'none';

        if (currentView === 'gallery') {
            if (meta.artists.length > 0) {
                entryTag1Input.value = meta.artists[0];
                entryNameInput.value = meta.artists[0]; // default name = artist tag
                if (badge) badge.style.display = 'inline-block';
                // Other artists → tags
                entryTagsInput.value = meta.artists.length > 1 ? meta.artists.slice(1).join(', ') : '';
            } else {
                entryTag1Input.value = '';
                entryNameInput.value = file.name.replace(/\.[^/.]+$/, '').replace(/[_\-]+/g, ' ').trim();
                if (badge) badge.style.display = 'none';
                entryTagsInput.value = '';
            }
        }

        entryPromptArea.value = meta.prompt || '';
        uploadModal.classList.add('visible');
        setTimeout(() => (currentView === 'gallery' ? entryTag1Input : entryPromptArea).focus(), 100);
    }

    function closeUploadModal() {
        uploadModal.classList.remove('visible');
        pendingFile = null;
    }

    modalCloseBtn.addEventListener('click', closeUploadModal);
    uploadModal.addEventListener('click', (e) => { if (e.target === uploadModal) closeUploadModal(); });
    uploadSubmitBtn.addEventListener('click', handleUploadSubmit);
    [entryTag1Input, entryNameInput, entryTagsInput].forEach(el => {
        el.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleUploadSubmit(); });
    });

    async function handleUploadSubmit() {
        if (!pendingFile) { showToast(t('toast.noImage')); return; }

        if (currentView === 'gallery') {
            const tag1 = entryTag1Input.value.trim();
            const name = entryNameInput.value.trim() || tag1;
            if (!name && !tag1) { showToast(t('toast.needName')); return; }
        }

        uploadSubmitBtn.disabled = true;
        uploadSubmitBtn.textContent = t('upload.submitting');

        try {
            let imageUrl;

            if (CONFIG.USE_CLOUD) {
                // Upload image to R2
                imageUrl = await uploadImageToR2(pendingFile);
            } else {
                // Local: convert to data URL
                imageUrl = await new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onload = (ev) => resolve(ev.target.result);
                    reader.readAsDataURL(pendingFile);
                });
            }

            const prompt = entryPromptArea.value.trim();

            if (currentView === 'gallery') {
                const tag1 = entryTag1Input.value.trim();
                const name = entryNameInput.value.trim() || tag1;
                const rawTags = entryTagsInput.value.trim();
                const tags = rawTags ? rawTags.split(',').map(s => s.trim()).filter(Boolean) : [];

                galleryEntries.push({
                    id: genId(), name, tag1, tags, image: imageUrl,
                    clicks: 0, createdAt: Date.now(), prompt
                });
            } else {
                inspoEntries.push({
                    id: genId(), image: imageUrl,
                    clicks: 0, createdAt: Date.now(), prompt
                });
            }

            await save(); render(); closeUploadModal();
            const displayName = currentView === 'gallery' ? (entryNameInput.value.trim() || entryTag1Input.value.trim()) : 'Inspiration';
            showToast(t('toast.added', { name: displayName }));
        } catch (err) {
            console.error('Upload failed:', err);
            showToast('Upload failed: ' + err.message);
        } finally {
            uploadSubmitBtn.disabled = false;
            uploadSubmitBtn.textContent = t('upload.submit');
        }
    }

    /**
     * 灵感界面快速上传：跳过弹窗，直接上传到 R2 并添加条目
     */
    async function quickUploadInspo(file) {
        try {
            showToast('Uploading...');
            const meta = await processImageFile(file);

            let imageUrl;
            if (CONFIG.USE_CLOUD) {
                imageUrl = await uploadImageToR2(file);
            } else {
                imageUrl = await new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onload = (ev) => resolve(ev.target.result);
                    reader.readAsDataURL(file);
                });
            }

            inspoEntries.push({
                id: genId(), image: imageUrl,
                clicks: 0, createdAt: Date.now(),
                prompt: meta.prompt || ''
            });

            await save();
            render();
            showToast(t('toast.added', { name: 'Inspiration' }));
        } catch (err) {
            console.error('Quick upload failed:', err);
            showToast('Upload failed: ' + err.message);
        }
    }

    // =====================================================================
    //  Floating Switcher Ball
    // =====================================================================
    const switcherBall  = document.getElementById('switcher-ball');
    const switcherIcon  = document.getElementById('switcher-icon');
    const switcherTrack = document.getElementById('switcher-track');
    const viewSlider    = document.getElementById('view-slider');
    const SWITCH_THRESHOLD = 40;

    function rubberBand(x, limit) {
        if (x === 0) return 0;
        const sign = x > 0 ? 1 : -1;
        return sign * limit * (1 - Math.exp(-Math.abs(x) / limit));
    }

    function switchView(view) {
        if (currentView === view) return;
        currentView = view;
        searchInput.value = ''; searchTerm = '';
        switcherIcon.textContent = view === 'gallery' ? '⊞' : '✦';
        // Slide animation
        viewSlider.classList.toggle('at-gallery', view === 'gallery');
        viewSlider.classList.toggle('at-inspiration', view === 'inspiration');
        syncSliderToView();
        render();
    }

    function startBallDrag(startX, startY) {
        let dragX = 0, dragY = 0;
        switcherBall.classList.add('dragging');
        switcherBall.style.transition = 'none';
        function onMove(cx, cy) {
            dragX = rubberBand(cx - startX, 150);
            dragY = rubberBand(cy - startY, 200);
            switcherBall.style.transform = `translate(calc(-50% + ${dragX}px), ${dragY}px)`;
            switcherBall.classList.toggle('drag-left', dragX < -SWITCH_THRESHOLD);
            switcherBall.classList.toggle('drag-right', dragX > SWITCH_THRESHOLD);
        }
        function onEnd() {
            switcherBall.classList.remove('dragging', 'drag-left', 'drag-right');
            switcherBall.style.transition = 'transform .5s cubic-bezier(0.34, 1.56, 0.64, 1)';
            switcherBall.style.transform = 'translateX(-50%)';
            setTimeout(() => { switcherBall.style.transition = ''; }, 520);
            if (dragX < -SWITCH_THRESHOLD) switchView('gallery');
            else if (dragX > SWITCH_THRESHOLD) switchView('inspiration');
        }
        return { onMove, onEnd };
    }

    if (switcherBall) {
        switcherBall.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            e.preventDefault();
            const { onMove, onEnd } = startBallDrag(e.clientX, e.clientY);
            const mm = (ev) => onMove(ev.clientX, ev.clientY);
            const mu = () => { document.removeEventListener('mousemove', mm); document.removeEventListener('mouseup', mu); onEnd(); };
            document.addEventListener('mousemove', mm);
            document.addEventListener('mouseup', mu);
        });
        switcherBall.addEventListener('touchstart', (e) => {
            if (e.touches.length !== 1) return;
            const t0 = e.touches[0];
            const { onMove, onEnd } = startBallDrag(t0.clientX, t0.clientY);
            const tm = (ev) => { ev.preventDefault(); const tc = ev.touches[0]; onMove(tc.clientX, tc.clientY); };
            const te = () => { document.removeEventListener('touchmove', tm); document.removeEventListener('touchend', te); document.removeEventListener('touchcancel', te); onEnd(); };
            document.addEventListener('touchmove', tm, { passive: false });
            document.addEventListener('touchend', te);
            document.addEventListener('touchcancel', te);
        });
    }

    // =====================================================================
    //  Search
    // =====================================================================
    let ballIsSearchMode = false;
    let ballDragDist = 0;

    function openSearchMode() {
        if (ballIsSearchMode) return;
        ballIsSearchMode = true;
        switcherBall.classList.add('search-mode');
        setTimeout(() => {
            searchInput.focus();
        }, 100);
    }

    function closeSearchMode() {
        if (!ballIsSearchMode) return;
        ballIsSearchMode = false;
        switcherBall.classList.remove('search-mode');
        searchInput.blur();
        if (searchInput.value) {
            searchInput.value = '';
            searchTerm = '';
            render();
        }
    }

    // 点击球（非拖拽）打开搜索
    if (switcherBall) {
        switcherBall.addEventListener('mousedown', () => { ballDragDist = 0; });
        switcherBall.addEventListener('mousemove', () => { ballDragDist++; });
        switcherBall.addEventListener('click', (e) => {
            if (ballDragDist > 3) return; // 拖拽过就不触发
            if (ballIsSearchMode) return;
            e.stopPropagation();
            openSearchMode();
        });
    }

    // 点外面关闭搜索
    document.addEventListener('click', (e) => {
        if (ballIsSearchMode && !switcherBall.contains(e.target)) {
            closeSearchMode();
        }
    });

    // Esc 关闭搜索
    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeSearchMode();
    });

    searchInput.addEventListener('input', (e) => { searchTerm = e.target.value.trim().toLowerCase(); render(); });

    // =====================================================================
    //  Sort
    // =====================================================================
    sortBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            sortBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentSort = btn.dataset.sort;
            render();
        });
    });

    // =====================================================================
    //  Grid
    // =====================================================================
    let inspoHeight = parseInt(localStorage.getItem('inspoHeight') || '1000', 10);

    function updateGrid(val) {
        document.documentElement.style.setProperty('--grid-columns', val);
        gridValue.textContent = val;
    }

    function updateInspoHeight(val) {
        inspoHeight = val;
        // FLIP animation for smooth card repositioning
        flipAnimateInspo(() => {
            document.documentElement.style.setProperty('--inspo-height', val + 'px');
        });
        gridValue.textContent = val;
    }

    /**
     * FLIP 动画：记录卡片位置 → 执行变化 → 动画移动到新位置
     */
    function flipAnimateInspo(changeFn) {
        const cards = inspiration.querySelectorAll('.inspo-card');
        if (cards.length === 0) { changeFn(); return; }

        // First: 记录当前位置和尺寸
        const firstRects = new Map();
        cards.forEach(card => {
            firstRects.set(card, card.getBoundingClientRect());
        });

        // 禁用 transition，执行变化
        cards.forEach(card => { card.style.transition = 'none'; });
        changeFn();

        // 强制 reflow，让浏览器计算新布局
        void inspiration.offsetHeight;

        // Last: 获取新位置
        cards.forEach(card => {
            const first = firstRects.get(card);
            const last = card.getBoundingClientRect();
            const dx = first.left - last.left;
            const dy = first.top - last.top;
            const sw = first.width !== 0 ? first.width / last.width : 1;
            const sh = first.height !== 0 ? first.height / last.height : 1;
            const needsAnim = Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5 || Math.abs(sw - 1) > 0.01 || Math.abs(sh - 1) > 0.01;
            if (!needsAnim) { card.style.transition = ''; return; }

            // Invert: 把卡片视觉上放回旧位置
            card.style.transformOrigin = 'top left';
            card.style.transform = `translate(${dx}px, ${dy}px) scale(${sw}, ${sh})`;
        });

        // Play: 下一帧开启 transition 动画到新位置
        requestAnimationFrame(() => {
            cards.forEach(card => {
                if (!card.style.transform) return;
                card.style.transition = 'transform .3s cubic-bezier(0.2, 0, 0, 1)';
                card.style.transform = '';
            });
            setTimeout(() => {
                cards.forEach(card => {
                    card.style.transition = '';
                    card.style.transform = '';
                    card.style.transformOrigin = '';
                });
            }, 320);
        });
    }

    /** 根据当前视图切换滑条模式 */
    function syncSliderToView() {
        if (currentView === 'inspiration') {
            gridSlider.min = 200;
            gridSlider.max = 1200;
            gridSlider.step = 50;
            gridSlider.value = inspoHeight;
            gridLabel.textContent = t('grid.height') || 'Height';
            updateInspoHeight(inspoHeight);
        } else {
            gridSlider.min = 3;
            gridSlider.max = 8;
            gridSlider.step = 1;
            gridSlider.value = parseInt(localStorage.getItem('gridColumns') || '5', 10);
            gridLabel.textContent = t('grid.label');
            updateGrid(gridSlider.value);
        }
    }

    let sliderRAF = null;
    gridSlider.addEventListener('input', (e) => {
        if (currentView === 'inspiration') {
            // Throttle with rAF to avoid animation stacking
            if (sliderRAF) cancelAnimationFrame(sliderRAF);
            sliderRAF = requestAnimationFrame(() => {
                updateInspoHeight(e.target.value);
                sliderRAF = null;
            });
        } else {
            updateGrid(e.target.value);
        }
    });
    gridSlider.addEventListener('change', () => {
        if (currentView === 'inspiration') localStorage.setItem('inspoHeight', gridSlider.value);
        else localStorage.setItem('gridColumns', gridSlider.value);
    });

    document.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        if (e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return;
        const n = parseInt(e.key, 10);
        if (currentView !== 'inspiration' && n >= 3 && n <= 8) { gridSlider.value = n; updateGrid(n); }
        if (e.key === 'Escape') { closeLightbox(); closeUploadModal(); closeEditModal(); closeContextMenu(); }
    });

    // =====================================================================
    //  NSFW Toggle
    // =====================================================================
    if (nsfwToggle) {
        nsfwToggle.addEventListener('change', () => {
            showNsfw = nsfwToggle.checked;
            // 切换所有 nsfw 卡片的可见状态
            inspiration.querySelectorAll('.inspo-card.nsfw').forEach(card => {
                card.classList.toggle('nsfw-visible', showNsfw);
            });
        });
    }

    // =====================================================================
    //  Language
    // =====================================================================
    if (langToggle) langToggle.addEventListener('click', () => { I18N.toggle(); applyI18nToDOM(); render(); });
    I18N.onChange(() => { applyI18nToDOM(); render(); });

    // =====================================================================
    //  Init
    // =====================================================================
    syncSliderToView();

    applyI18nToDOM();
    // 初始化 slider 位置
    if (viewSlider) viewSlider.classList.add('at-gallery');

    load().then(() => {
        render();

        // 初始化拖拽排序
        if (window.DragSort) {
            // 画廊拖拽排序
            DragSort.init('.gallery-grid', '.card', (from, to) => {
                const item = galleryEntries.splice(from, 1)[0];
                galleryEntries.splice(to, 0, item);
                save();
            });
            // 灵感拖拽排序
            DragSort.init('.inspiration-grid', '.inspo-card', (from, to) => {
                const item = inspoEntries.splice(from, 1)[0];
                inspoEntries.splice(to, 0, item);
                save();
            });
        }

        console.log(`✦ Style Explorer — locale: ${I18N.locale}, cloud: ${CONFIG.USE_CLOUD}`);
    }).catch(err => {
        console.error('Failed to load data:', err);
        render();
    });
});