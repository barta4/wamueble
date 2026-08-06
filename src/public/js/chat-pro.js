/**
 * Chat Pro Logic - WaBot SaaS
 * Enhances the default chat interface with WhatsApp Desktop-like features.
 */

class ChatPro {
    constructor() {
        this.currentFilter = 'all'; // all, favorites, archived
        this.searchQuery = '';
        this.activePhone = null;
        this.chatData = [];
        this.searchTimeout = null;
        this.contextMenuTarget = null;
        
        this.init();
    }

    init() {
        this.bindEvents();
        // Override original loadChats behavior smoothly
        const originalLoadChats = window.loadChats;
        window.loadChats = async () => {
            await this.loadChatsData();
            this.renderSidebar();
        };
        
        // Override original appendMessage to handle media
        const originalAppendMessage = window.appendMessage;
        window.appendMessage = (message) => {
            this.appendMessagePro(message);
        };
        
        // Override original openChat to hook into it
        const originalOpenChat = window.openChat;
        window.openChat = async (phone, displayName) => {
            await originalOpenChat(phone, displayName);
            this.onChatOpened(phone);
        };
    }

    bindEvents() {
        // Search
        const searchInput = document.getElementById('chatSearchInput');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                clearTimeout(this.searchTimeout);
                this.searchTimeout = setTimeout(() => {
                    this.searchQuery = e.target.value.toLowerCase();
                    this.renderSidebar();
                }, 300);
            });
        }

        // Filters
        document.querySelectorAll('.chat-filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.chat-filter-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.currentFilter = e.target.dataset.filter;
                window.loadChats(); // Reload from API with new filter
            });
        });

        // Context Menu outside click
        document.addEventListener('click', (e) => {
            const menu = document.getElementById('chatContextMenu');
            if (menu && menu.classList.contains('show') && !menu.contains(e.target)) {
                this.hideContextMenu();
            }
        });
        
        // Info Panel close
        const closeInfoBtn = document.getElementById('closeInfoPanel');
        if (closeInfoBtn) {
            closeInfoBtn.addEventListener('click', () => this.toggleInfoPanel(false));
        }
        
        // Header Profile click
        const headerProfile = document.getElementById('chatHeaderProfile');
        if (headerProfile) {
            headerProfile.addEventListener('click', () => this.toggleInfoPanel(true));
        }
    }

    async loadChatsData() {
        const container = document.getElementById('chatList');
        if (!container) return;
        
        try {
            const res = await fetch(`/api/chats?filter=${this.currentFilter}`);
            if (!res.ok) throw new Error('Error al cargar chats');
            this.chatData = await res.json();
            window._chatData = this.chatData; // Expose to global scope if needed
        } catch (error) {
            console.error(error);
            container.innerHTML = '<div class="loading">Error al cargar chats</div>';
        }
    }

    renderSidebar() {
        const container = document.getElementById('chatList');
        if (!container) return;

        let filtered = this.chatData;
        
        if (this.searchQuery) {
            filtered = filtered.filter(c => {
                const name = (c.customer_name || '').toLowerCase();
                const phone = (c.customer_phone || '').toLowerCase();
                return name.includes(this.searchQuery) || phone.includes(this.searchQuery);
            });
        }

        if (filtered.length === 0) {
            container.innerHTML = '<div class="loading" style="margin-top:20px;">No hay conversaciones.</div>';
            return;
        }

        const fragment = document.createDocumentFragment();

        filtered.forEach(c => {
            const displayName = c.customer_name ? c.customer_name : window.formatPhone(c.customer_phone);
            const initials = displayName.substring(0, 2).toUpperCase();
            
            const div = document.createElement('div');
            div.className = `chat-list-item ${window.activeChatPhone === c.customer_phone ? 'active' : ''} ${c.needs_human ? 'needs-human' : ''}`;
            div.onclick = () => window.openChat(c.customer_phone, displayName);
            div.oncontextmenu = (e) => this.showContextMenu(e, c);
            
            let timeStr = '';
            if (c.updated_at) {
                const date = new Date(c.updated_at);
                const now = new Date();
                if (date.toDateString() === now.toDateString()) {
                    timeStr = date.toLocaleTimeString('es-UY', { hour: '2-digit', minute: '2-digit' });
                } else {
                    timeStr = date.toLocaleDateString('es-UY', { day: '2-digit', month: '2-digit' });
                }
            }

            let indicators = '';
            if (c.is_favorite) indicators += '<span class="chat-indicator favorite" title="Favorito">⭐</span>';
            if (c.is_archived) indicators += '<span class="chat-indicator archived" title="Archivado">📥</span>';
            if (c.needs_human) indicators += '<span class="badge-human-needs" style="margin-left:4px;">Atención</span>';

            div.innerHTML = `
                <div class="chat-avatar ${c.is_blocked ? 'blocked' : ''}">${initials}</div>
                <div class="chat-item-content">
                    <div class="chat-item-header">
                        <span class="chat-item-name">${window.escapeHtml(displayName)}</span>
                        <span class="chat-item-time">${timeStr}</span>
                    </div>
                    <div class="chat-item-body">
                        <span class="chat-item-msg">${window.escapeHtml(c.last_message || 'Sin mensajes')}</span>
                        <div class="chat-item-indicators">${indicators}</div>
                    </div>
                </div>
            `;
            fragment.appendChild(div);
        });

        container.innerHTML = '';
        container.appendChild(fragment);
    }

    onChatOpened(phone) {
        this.activePhone = phone;
        this.renderSidebar(); // Update active state visually
        
        // Re-render info panel if open
        const panel = document.getElementById('chatInfoPanel');
        if (panel && panel.classList.contains('open')) {
            this.renderInfoPanel(phone);
        }
        
        // Reprocesar mensajes existentes para renderizar media
        setTimeout(() => {
            const container = document.getElementById('chatMessages');
            if (!container) return;
            
            // Buscar burbujas y procesarlas (esto es un hack porque original openChat las renderiza directo)
            // Lo ideal sería que openChat use appendMessagePro
            // Haremos un reemplazo simple aquí
            Array.from(container.querySelectorAll('.chat-bubble')).forEach(bubble => {
                const textDiv = bubble.querySelector('.bubble-text');
                if (textDiv) {
                    const originalText = textDiv.textContent;
                    const enhancedHtml = this.processMessageContent(originalText);
                    if (enhancedHtml !== window.escapeHtml(originalText)) {
                        textDiv.innerHTML = enhancedHtml;
                    }
                }
            });
            
            // Añadir separadores de fecha
            this.addDateSeparators(container);
            
            window.scrollToBottom();
        }, 50);
    }

    addDateSeparators(container) {
        const bubbles = Array.from(container.querySelectorAll('.chat-bubble'));
        let lastDate = null;
        
        bubbles.forEach(bubble => {
            const timeSpan = bubble.querySelector('.bubble-time');
            if (!timeSpan) return;
            
            // Tratamos de inferir la fecha (simplificado, asume hoy si solo hay HH:MM)
            const timeText = timeSpan.textContent;
            let dateStr = 'Hoy';
            
            if (dateStr !== lastDate) {
                const separator = document.createElement('div');
                separator.className = 'chat-date-separator';
                separator.innerHTML = `<span>${dateStr}</span>`;
                container.insertBefore(separator, bubble);
                lastDate = dateStr;
            }
        });
    }

    appendMessagePro(message) {
        const container = document.getElementById('chatMessages');
        if (!container) return;

        const emptyPlaceholder = container.querySelector('.loading');
        if (emptyPlaceholder) emptyPlaceholder.remove();

        const isNote = message.role === 'note';
        const isMe = !isNote && (message.role === 'ai' || message.role === 'assistant');
        const isOperator = !isNote && (message.operator || message.role === 'human');
        const bubbleClass = isNote ? 'private-note' : (isOperator ? 'operator' : (isMe ? 'me' : 'client'));
        
        const enhancedContent = this.processMessageContent(message.content);
        
        const div = document.createElement('div');
        div.className = `chat-bubble ${bubbleClass}`;
        
        let operatorTag = '';
        if (isNote) {
            operatorTag = `<span class="operator-tag" style="background:#fbbf24; color:#000; padding:2px 6px; border-radius:4px; font-size:0.75rem; font-weight:600; display:inline-block; margin-bottom:4px; user-select:none;">📌 Nota Privada (${message.operator || 'Admin'})</span>`;
        } else if (isOperator) {
            operatorTag = '<span class="operator-tag" style="margin-right:4px;">👤 Operador</span>';
        }
        
        div.innerHTML = `
            <div class="bubble-text">
                ${operatorTag ? `<div>${operatorTag}</div>` : ''}
                ${enhancedContent}
            </div>
            <div class="bubble-meta">
                <span class="bubble-time">${message.timestamp ? new Date(message.timestamp).toLocaleTimeString('es-UY', { hour: '2-digit', minute: '2-digit' }) : new Date().toLocaleTimeString('es-UY', { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
        `;
        
        container.appendChild(div);
    }

    processMessageContent(content) {
        let safeContent = window.escapeHtml(content);
        
        // Simple regex to detect URLs
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        
        return safeContent.replace(urlRegex, (url) => {
            const lowerUrl = url.toLowerCase();
            
            // Image
            if (lowerUrl.match(/\.(jpeg|jpg|gif|png|webp)$/)) {
                return `<div class="chat-media-container"><img src="${url}" class="chat-media-img" onclick="window.ChatProInstance.openLightbox('${url}')" loading="lazy"></div>`;
            }
            // Audio
            else if (lowerUrl.match(/\.(mp3|wav|ogg|aac)$/)) {
                return `<div class="chat-media-container"><audio src="${url}" controls class="chat-media-audio"></audio></div>`;
            }
            // Video
            else if (lowerUrl.match(/\.(mp4|webm|mov)$/)) {
                return `<div class="chat-media-container"><video src="${url}" controls class="chat-media-video"></video></div>`;
            }
            // PDF
            else if (lowerUrl.match(/\.pdf$/)) {
                return `
                    <a href="${url}" target="_blank" class="chat-media-link">
                        <div class="chat-media-icon">📄</div>
                        <div style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">Documento PDF</div>
                        <div>⬇️</div>
                    </a>`;
            }
            
            // Standard Link
            return `<a href="${url}" target="_blank" style="color:var(--chat-accent); text-decoration:underline;">${url}</a>`;
        });
    }

    openLightbox(url) {
        const lightbox = document.getElementById('chatLightbox');
        const img = document.getElementById('chatLightboxImg');
        if (lightbox && img) {
            img.src = url;
            lightbox.classList.add('show');
        }
    }

    closeLightbox() {
        const lightbox = document.getElementById('chatLightbox');
        if (lightbox) {
            lightbox.classList.remove('show');
            setTimeout(() => {
                const img = document.getElementById('chatLightboxImg');
                if (img) img.src = '';
            }, 300);
        }
    }

    showContextMenu(e, chatItem) {
        e.preventDefault();
        this.contextMenuTarget = chatItem;
        
        const menu = document.getElementById('chatContextMenu');
        if (!menu) return;

        // Update menu text based on current state
        document.getElementById('ctxFavText').textContent = chatItem.is_favorite ? 'Quitar de favoritos' : 'Marcar como favorito';
        document.getElementById('ctxArchText').textContent = chatItem.is_archived ? 'Desarchivar' : 'Archivar chat';
        document.getElementById('ctxBlockText').textContent = chatItem.is_blocked ? 'Desbloquear contacto' : 'Bloquear contacto';

        // Position
        menu.style.left = `${e.pageX}px`;
        menu.style.top = `${e.pageY}px`;
        
        // Adjust if it goes off screen
        const rect = menu.getBoundingClientRect();
        if (e.pageX + rect.width > window.innerWidth) {
            menu.style.left = `${window.innerWidth - rect.width - 10}px`;
        }
        if (e.pageY + rect.height > window.innerHeight) {
            menu.style.top = `${window.innerHeight - rect.height - 10}px`;
        }
        
        menu.classList.add('show');
    }

    hideContextMenu() {
        const menu = document.getElementById('chatContextMenu');
        if (menu) menu.classList.remove('show');
        this.contextMenuTarget = null;
    }

    toggleInfoPanel(forceState = null) {
        const panel = document.getElementById('chatInfoPanel');
        if (!panel) return;
        
        const isOpen = panel.classList.contains('open');
        const newState = forceState !== null ? forceState : !isOpen;
        
        if (newState) {
            if (this.activePhone) {
                this.renderInfoPanel(this.activePhone);
                panel.classList.add('open');
            }
        } else {
            panel.classList.remove('open');
        }
    }

    renderInfoPanel(phone) {
        const chat = this.chatData.find(c => c.customer_phone === phone);
        if (!chat) return;

        const displayName = chat.customer_name ? chat.customer_name : window.formatPhone(phone);
        const initials = displayName.substring(0, 2).toUpperCase();

        document.getElementById('infoAvatar').textContent = initials;
        document.getElementById('infoAvatar').className = `info-avatar-large ${chat.is_blocked ? 'blocked' : ''}`;
        document.getElementById('infoName').textContent = displayName;
        document.getElementById('infoPhone').textContent = window.formatPhone(phone);
        
        const btnFav = document.getElementById('infoBtnFav');
        const btnArch = document.getElementById('infoBtnArch');
        const btnBlock = document.getElementById('infoBtnBlock');
        
        btnFav.innerHTML = `${chat.is_favorite ? '⭐ Quitar de favoritos' : '⭐ Marcar como favorito'}`;
        btnArch.innerHTML = `${chat.is_archived ? '📥 Desarchivar chat' : '📥 Archivar chat'}`;
        btnBlock.innerHTML = `${chat.is_blocked ? '🔓 Desbloquear contacto' : '🚫 Bloquear contacto'}`;
    }

    // --- API Calls for Actions ---

    async toggleFavorite(phone) {
        try {
            const res = await fetch(`/api/chats/${encodeURIComponent(phone)}/favorite`, { method: 'PATCH' });
            if (res.ok) window.loadChats();
        } catch (e) { console.error(e); window.showToast('Error de conexión', 'error'); }
        this.hideContextMenu();
    }

    async toggleArchive(phone) {
        try {
            const res = await fetch(`/api/chats/${encodeURIComponent(phone)}/archive`, { method: 'PATCH' });
            if (res.ok) window.loadChats();
        } catch (e) { console.error(e); window.showToast('Error de conexión', 'error'); }
        this.hideContextMenu();
    }

    async toggleBlock(phone) {
        try {
            const res = await fetch(`/api/chats/${encodeURIComponent(phone)}/block`, { method: 'PATCH' });
            if (res.ok) {
                window.loadChats();
                if (this.activePhone === phone) this.renderInfoPanel(phone);
            }
        } catch (e) { console.error(e); window.showToast('Error de conexión', 'error'); }
        this.hideContextMenu();
    }

    // --- Modals for destructive actions ---

    showModal(title, text, confirmText, isDanger, onConfirm) {
        const overlay = document.getElementById('chatModalOverlay');
        if (!overlay) return;
        
        document.getElementById('chatModalTitle').textContent = title;
        document.getElementById('chatModalText').textContent = text;
        
        const btnConfirm = document.getElementById('chatModalConfirm');
        btnConfirm.textContent = confirmText;
        btnConfirm.className = `chat-modal-btn confirm ${isDanger ? 'danger' : ''}`;
        
        // Remove old listeners
        const newBtnConfirm = btnConfirm.cloneNode(true);
        btnConfirm.parentNode.replaceChild(newBtnConfirm, btnConfirm);
        
        newBtnConfirm.onclick = async () => {
            newBtnConfirm.disabled = true;
            newBtnConfirm.textContent = 'Procesando...';
            await onConfirm();
            this.closeModal();
        };
        
        overlay.classList.add('show');
    }

    closeModal() {
        const overlay = document.getElementById('chatModalOverlay');
        if (overlay) overlay.classList.remove('show');
    }

    promptClear(phone) {
        this.hideContextMenu();
        this.showModal(
            'Vaciar chat',
            '¿Estás seguro de que quieres vaciar los mensajes de este chat? Esta acción no se puede deshacer.',
            'Vaciar',
            true,
            async () => {
                try {
                    const res = await fetch(`/api/chats/${encodeURIComponent(phone)}/clear`, { method: 'POST' });
                    if (res.ok) {
                        window.showToast('Chat vaciado', 'success');
                        if (this.activePhone === phone) {
                            const container = document.getElementById('chatMessages');
                            if (container) container.innerHTML = '<p class="loading">Sin historial de mensajes</p>';
                        }
                        window.loadChats();
                    }
                } catch (e) { window.showToast('Error al vaciar chat', 'error'); }
            }
        );
    }

    promptDelete(phone) {
        this.hideContextMenu();
        this.showModal(
            'Eliminar chat',
            '¿Estás seguro de que quieres eliminar esta conversación de la lista? (Podrás volver a hablarle buscándolo en Clientes).',
            'Eliminar',
            true,
            async () => {
                try {
                    const res = await fetch(`/api/chats/${encodeURIComponent(phone)}`, { method: 'DELETE' });
                    if (res.ok) {
                        window.showToast('Chat eliminado de la lista', 'info');
                        if (this.activePhone === phone) {
                            document.getElementById('chatWindow').innerHTML = `
                                <div class="chat-window-placeholder">
                                    <div class="chat-placeholder-icon">💬</div>
                                    <p>Seleccioná una conversación para ver los mensajes.</p>
                                </div>
                            `;
                            this.activePhone = null;
                            this.toggleInfoPanel(false);
                        }
                        window.loadChats();
                    }
                } catch (e) { window.showToast('Error al eliminar chat', 'error'); }
            }
        );
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // We wait a bit to ensure admin.js has loaded and defined its globals
    setTimeout(() => {
        window.ChatProInstance = new ChatPro();
    }, 100);
});
