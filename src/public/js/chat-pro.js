/**
 * Chat Pro Logic - WaBot SaaS
 * Enhances the default chat interface with WhatsApp Desktop-like features.
 */

class ChatPro {
    constructor() {
        this.currentFilter = 'all'; // all, favorites, archived
        this.chatwootTab = 'all'; // all, mine, unassigned
        this.searchQuery = '';
        this.activePhone = null;
        this.activeChat = null;
        this.chatData = [];
        this.counts = { all: 0, favorites: 0, archived: 0, mine: 0, unassigned: 0 };
        this.operators = [];
        this.currentUser = window.CURRENT_USER || { id: null, name: 'Admin', role: 'owner' };
        this.searchTimeout = null;
        this.contextMenuTarget = null;
        
        this.init();
    }

    async init() {
        this.bindEvents();
        await this.loadOperators();

        // Override original loadChats behavior smoothly
        window.loadChats = async () => {
            await this.loadChatsData();
            this.renderSidebar();
        };
        
        // Override original appendMessage to handle media
        window.appendMessage = (message) => {
            this.appendMessagePro(message);
        };
        
        // Override original openChat to hook into it
        const originalOpenChat = window.openChat;
        window.openChat = async (phone, displayName) => {
            await originalOpenChat(phone, displayName);
            this.onChatOpened(phone);
        };

        // Escuchar sockets para sincronización en tiempo real
        this.setupSocketListeners();
    }

    setupSocketListeners() {
        const checkAndBind = () => {
            if (typeof socket !== 'undefined' && socket) {
                socket.on('chat-assign', (data) => {
                    const chat = this.chatData.find(c => c.customer_phone === data.customer_phone);
                    if (chat) {
                        chat.assigned_to = data.assigned_to;
                        chat.assigned_name = data.assigned_name;
                    }
                    if (this.activePhone === data.customer_phone) {
                        if (this.activeChat) {
                            this.activeChat.assigned_to = data.assigned_to;
                            this.activeChat.assigned_name = data.assigned_name;
                        }
                        const selectHeader = document.querySelector('#chatHeaderAssign select');
                        if (selectHeader) selectHeader.value = data.assigned_to || '';
                        const selectInfo = document.getElementById('infoAssignSelect');
                        if (selectInfo) selectInfo.value = data.assigned_to || '';
                    }
                    this.loadChatsData().then(() => this.renderSidebar());
                });

                socket.on('chat-meta', (data) => {
                    const chat = this.chatData.find(c => c.customer_phone === data.customer_phone);
                    if (chat) {
                        if (data.is_favorite !== undefined) chat.is_favorite = data.is_favorite;
                        if (data.is_archived !== undefined) chat.is_archived = data.is_archived;
                        if (data.is_blocked !== undefined) chat.is_blocked = data.is_blocked;
                    }
                    if (this.activePhone === data.customer_phone) {
                        this.updateHeaderActionButtons(data.customer_phone, data);
                        this.renderInfoPanel(data.customer_phone);
                    }
                    this.loadChatsData().then(() => this.renderSidebar());
                });
            } else {
                setTimeout(checkAndBind, 500);
            }
        };
        checkAndBind();
    }

    async loadOperators() {
        try {
            const res = await fetch('/api/chats/operators');
            if (res.ok) {
                this.operators = await res.json();
            }
        } catch (e) {
            console.warn('Error al cargar operadores:', e);
        }
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

    async setFilter(filter) {
        this.currentFilter = filter; // 'all', 'favorites', 'archived'

        // Actualizar active class en items del menú izquierdo
        document.querySelectorAll('.inbox-nav-item[data-filter]').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.filter === filter);
        });

        // Actualizar título del sidebar en Columna 2
        const headerTitle = document.querySelector('.chat-sidebar-header h3');
        if (headerTitle) {
            if (filter === 'favorites') {
                headerTitle.textContent = '⭐ Favoritos';
            } else if (filter === 'archived') {
                headerTitle.textContent = '🗄️ Archivados';
            } else {
                headerTitle.textContent = 'Bandeja de entrada';
            }
        }

        await this.loadChatsData();
        this.renderSidebar();
    }

    setChatwootTab(tab) {
        this.chatwootTab = tab;
        document.querySelectorAll('#chatwootFilterTabs .cw-tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tab);
        });
        this.renderSidebar();
    }

    async loadChatsData() {
        const container = document.getElementById('chatList');
        if (!container) return;
        
        try {
            const [chatsRes, countsRes] = await Promise.all([
                fetch(`/api/chats?filter=${this.currentFilter}`),
                fetch('/api/chats/counts').catch(() => null)
            ]);

            if (!chatsRes.ok) throw new Error('Error al cargar chats');
            this.chatData = await chatsRes.json();
            window._chatData = this.chatData;

            if (countsRes && countsRes.ok) {
                this.counts = await countsRes.json();
            } else {
                this.counts = {
                    all: this.chatData.filter(c => !c.is_archived).length,
                    favorites: this.chatData.filter(c => c.is_favorite && !c.is_archived).length,
                    archived: this.chatData.filter(c => c.is_archived).length,
                    mine: this.chatData.filter(c => c.assigned_to === this.currentUser.id && !c.is_archived).length,
                    unassigned: this.chatData.filter(c => (!c.assigned_to || c.assigned_to === 0) && !c.is_archived).length
                };
            }

            this.updateBadges();
        } catch (error) {
            console.error(error);
            container.innerHTML = '<div class="loading">Error al cargar chats</div>';
        }
    }

    updateBadges() {
        const navAll = document.getElementById('navBadgeAll');
        const navFav = document.getElementById('navBadgeFav');
        const navArch = document.getElementById('navBadgeArch');
        if (navAll) navAll.textContent = this.counts.all || 0;
        if (navFav) navFav.textContent = this.counts.favorites || 0;
        if (navArch) navArch.textContent = this.counts.archived || 0;

        const bAll = document.getElementById('cwBadgeAll');
        const bMine = document.getElementById('cwBadgeMine');
        const bUnassigned = document.getElementById('cwBadgeUnassigned');
        if (bAll) bAll.textContent = this.counts.all || 0;
        if (bMine) bMine.textContent = this.counts.mine || 0;
        if (bUnassigned) bUnassigned.textContent = this.counts.unassigned || 0;
    }

    renderSidebar() {
        const container = document.getElementById('chatList');
        if (!container) return;

        let filtered = this.chatData;

        // Filtro por pestañas Chatwoot (Mías, Sin Asignar, Todos)
        if (this.chatwootTab === 'mine') {
            filtered = filtered.filter(c => 
                (this.currentUser.id && Number(c.assigned_to) === Number(this.currentUser.id)) || 
                (this.currentUser.name && c.assigned_name && c.assigned_name.toLowerCase() === this.currentUser.name.toLowerCase())
            );
        } else if (this.chatwootTab === 'unassigned') {
            filtered = filtered.filter(c => !c.assigned_to || Number(c.assigned_to) === 0);
        }
        
        if (this.searchQuery) {
            filtered = filtered.filter(c => {
                const name = (c.customer_name || '').toLowerCase();
                const phone = (c.customer_phone || '').toLowerCase();
                const assigned = (c.assigned_name || '').toLowerCase();
                return name.includes(this.searchQuery) || phone.includes(this.searchQuery) || assigned.includes(this.searchQuery);
            });
        }

        if (filtered.length === 0) {
            let emptyMsg = 'No hay conversaciones en esta bandeja.';
            if (this.currentFilter === 'archived') emptyMsg = 'No hay chats archivados.';
            else if (this.currentFilter === 'favorites') emptyMsg = 'No tienes chats marcados como favoritos.';
            else if (this.chatwootTab === 'mine') emptyMsg = 'No tienes conversaciones asignadas a ti.';
            else if (this.chatwootTab === 'unassigned') emptyMsg = 'No hay conversaciones sin asignar.';
            container.innerHTML = `<div class="loading" style="margin-top:20px;">${emptyMsg}</div>`;
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
            if (c.is_archived) indicators += '<span class="chat-indicator archived" title="Archivado">🗄️</span>';
            if (c.assigned_name) {
                indicators += `<span class="chat-indicator assigned" title="Asignado a ${window.escapeHtml(c.assigned_name)}">👤 ${window.escapeHtml(c.assigned_name.split(' ')[0])}</span>`;
            }
            if (c.needs_human) indicators += '<span class="badge-human-needs" style="margin-left:4px;">Atención</span>';

            let previewText = c.last_message || 'Sin mensajes';
            let msgIcon = '';
            if (previewText.toLowerCase().includes('audio') || previewText.includes('.mp3') || previewText.includes('.ogg')) {
                previewText = 'Mensaje de audio';
                msgIcon = '🎤 ';
            } else if (previewText && previewText !== 'Sin mensajes') {
                msgIcon = '↩ ';
            }

            div.innerHTML = `
                <div class="chat-avatar ${c.is_blocked ? 'blocked' : ''}">${initials}</div>
                <div class="chat-item-content">
                    <div class="chat-item-header">
                        <span class="chat-item-name">${window.escapeHtml(displayName)}</span>
                        <span class="chat-item-time">${timeStr}</span>
                    </div>
                    <div class="chat-item-body">
                        <span class="chat-item-msg">
                            <span class="chat-channel-badge">WA</span>
                            <span class="chat-direction-arrow">${msgIcon}</span>${window.escapeHtml(previewText)}
                        </span>
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
        this.activeChat = this.chatData.find(c => c.customer_phone === phone) || null;
        this.renderSidebar(); // Update active state visually
        
        // Re-render info panel if open
        const panel = document.getElementById('chatInfoPanel');
        if (panel && panel.classList.contains('open')) {
            this.renderInfoPanel(phone);
        }
        
        setTimeout(() => {
            const container = document.getElementById('chatMessages');
            if (!container) return;
            
            // Re-procesar burbujas para media y eventos JSON
            Array.from(container.querySelectorAll('.chat-bubble')).forEach(bubble => {
                const textDiv = bubble.querySelector('.bubble-text');
                if (textDiv && !textDiv.dataset.processed) {
                    textDiv.dataset.processed = '1';
                    const originalText = textDiv.textContent;
                    const enhancedHtml = this.processMessageContent(originalText);
                    if (enhancedHtml !== window.escapeHtml(originalText)) {
                        textDiv.innerHTML = enhancedHtml;
                    }
                }
            });
            
            // Añadir separadores de fecha
            this.addDateSeparators(container);
            
            // Scroll interno del contenedor de mensajes
            container.scrollTop = container.scrollHeight;

            // Foco directo en el input para poder escribir inmediatamente sin scroll
            const input = document.getElementById('chatInput');
            if (input) {
                input.focus();
            }
        }, 50);
    }

    addDateSeparators(container) {
        const bubbles = Array.from(container.querySelectorAll('.chat-bubble'));
        let lastDate = null;
        
        bubbles.forEach(bubble => {
            const timeSpan = bubble.querySelector('.bubble-time');
            if (!timeSpan) return;
            
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
        const isClient = !isNote && (message.role === 'human' || message.role === 'user' || message.role === 'client');
        const isOperator = !isNote && !isClient && (Boolean(message.operator) || message.role === 'operator');
        const isMe = !isNote && !isClient && !isOperator;
        const bubbleClass = isNote ? 'private-note' : (isOperator ? 'operator' : (isMe ? 'me' : 'client'));
        
        const enhancedContent = this.processMessageContent(message.content);
        
        const div = document.createElement('div');
        div.className = `chat-bubble ${bubbleClass}`;
        
        let senderTag = '';
        if (isNote) {
            senderTag = `<span class="sender-tag-badge" style="background:#fbbf24; color:#000;">📌 Nota Privada (${window.escapeHtml(message.operator || 'Admin')})</span>`;
        } else if (isOperator) {
            senderTag = `<span class="sender-tag-badge operator">👤 ${window.escapeHtml(message.operator || 'Operador')}</span>`;
        } else if (isMe) {
            senderTag = `<span class="sender-tag-badge ai">🤖 Asistente IA</span>`;
        }
        
        div.innerHTML = `
            ${senderTag ? `<div>${senderTag}</div>` : ''}
            <div class="bubble-text" data-processed="1">${enhancedContent}</div>
            <div class="bubble-meta">
                <span class="bubble-time">${message.timestamp ? new Date(message.timestamp).toLocaleTimeString('es-UY', { hour: '2-digit', minute: '2-digit' }) : new Date().toLocaleTimeString('es-UY', { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
        `;
        
        container.appendChild(div);
        container.scrollTop = container.scrollHeight;
    }

    processMessageContent(content) {
        if (!content) return '';
        let raw = content;
        let eventCardHtml = '';

        // 1. Detección y renderizado elegante de bloques JSON (Citas y Pedidos)
        const jsonMatch = raw.match(/(?:```json\s*|```\s*)?(\{[\s\S]*?"(?:cita_completa|pedido_completo)"[\s\S]*?\})(?:\s*```)?/i);
        if (jsonMatch) {
            try {
                const parsed = JSON.parse(jsonMatch[1]);
                raw = raw.replace(jsonMatch[0], '').trim();

                if (parsed.cita_completa) {
                    eventCardHtml = `
                        <div class="chat-event-card">
                            <div class="chat-event-card-header">
                                <span>📅</span> Cita Médica / Servicio Confirmado
                            </div>
                            <div class="chat-event-card-grid">
                                ${parsed.servicio ? `<div class="chat-event-row"><span class="chat-event-label">Servicio:</span><span class="chat-event-value">${window.escapeHtml(parsed.servicio)}</span></div>` : ''}
                                ${parsed.doctor ? `<div class="chat-event-row"><span class="chat-event-label">Especialista:</span><span class="chat-event-value">${window.escapeHtml(parsed.doctor)}</span></div>` : ''}
                                ${parsed.fecha ? `<div class="chat-event-row"><span class="chat-event-label">Fecha y Hora:</span><span class="chat-event-value">${window.escapeHtml(parsed.fecha)} ${parsed.hora || ''}</span></div>` : ''}
                                ${parsed.precio ? `<div class="chat-event-row"><span class="chat-event-label">Precio:</span><span class="chat-event-value">$${window.escapeHtml(String(parsed.precio))}</span></div>` : ''}
                            </div>
                        </div>
                    `;
                } else if (parsed.pedido_completo) {
                    eventCardHtml = `
                        <div class="chat-event-card">
                            <div class="chat-event-card-header">
                                <span>🛍️</span> Pedido Confirmado
                            </div>
                            <div class="chat-event-card-grid">
                                ${parsed.total ? `<div class="chat-event-row"><span class="chat-event-label">Total:</span><span class="chat-event-value">$${window.escapeHtml(String(parsed.total))}</span></div>` : ''}
                                ${parsed.direccion ? `<div class="chat-event-row"><span class="chat-event-label">Entrega:</span><span class="chat-event-value">${window.escapeHtml(parsed.direccion)}</span></div>` : ''}
                            </div>
                        </div>
                    `;
                }
            } catch (e) {
                // Si el JSON falla al parsear se deja el texto intacto
            }
        }

        let safeContent = window.escapeHtml(raw);
        
        // 2. Detección de URLs de Multimedia
        const urlRegex = /(https?:\/\/[^\s]+|\/uploads\/[^\s]+)/g;
        safeContent = safeContent.replace(urlRegex, (url) => {
            const lowerUrl = url.toLowerCase();
            
            // Imágenes
            if (lowerUrl.match(/\.(jpeg|jpg|gif|png|webp)($|\?)/)) {
                return `<div class="chat-media-container"><img src="${url}" class="chat-media-img" onclick="window.ChatProInstance && window.ChatProInstance.openLightbox('${url}')" loading="lazy"></div>`;
            }
            // Audios / Notas de voz (Estilo Chatwoot)
            else if (lowerUrl.match(/\.(mp3|wav|ogg|aac|m4a)($|\?)/) || lowerUrl.includes('/audio')) {
                return this.renderAudioPlayerHtml(url);
            }
            // Videos
            else if (lowerUrl.match(/\.(mp4|webm|mov)($|\?)/)) {
                return `<div class="chat-media-container"><video src="${url}" controls class="chat-media-video"></video></div>`;
            }
            // PDF
            else if (lowerUrl.match(/\.pdf($|\?)/)) {
                return `
                    <a href="${url}" target="_blank" class="chat-media-link">
                        <div class="chat-media-icon">📄</div>
                        <div style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">Documento PDF</div>
                        <div>⬇️</div>
                    </a>`;
            }
            
            // Enlace general
            return `<a href="${url}" target="_blank" rel="noopener noreferrer" style="color:var(--chat-accent); text-decoration:underline;">${url}</a>`;
        });

        return (eventCardHtml ? eventCardHtml : '') + safeContent;
    }

    renderAudioPlayerHtml(url) {
        return `
            <div class="chatwoot-audio-player" data-src="${url}">
                <button type="button" class="cw-audio-play-btn" onclick="window.ChatProInstance && window.ChatProInstance.toggleAudioPlay(this)" title="Reproducir audio">
                    <svg class="icon-play" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                    <svg class="icon-pause" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style="display:none;"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
                </button>
                <span class="cw-audio-time">00:00</span>
                <div class="cw-audio-track" onclick="window.ChatProInstance && window.ChatProInstance.seekAudio(event, this)">
                    <div class="cw-audio-progress"></div>
                </div>
                <button type="button" class="cw-audio-speed" onclick="window.ChatProInstance && window.ChatProInstance.cycleAudioSpeed(this)">1x</button>
                <a href="${url}" download class="cw-audio-download" title="Descargar nota de voz">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                </a>
                <audio src="${url}" preload="metadata" style="display:none;"></audio>
            </div>
        `;
    }

    toggleAudioPlay(btn) {
        const player = btn.closest('.chatwoot-audio-player');
        if (!player) return;
        const audio = player.querySelector('audio');
        if (!audio) return;
        const iconPlay = btn.querySelector('.icon-play');
        const iconPause = btn.querySelector('.icon-pause');
        const timeSpan = player.querySelector('.cw-audio-time');
        const progress = player.querySelector('.cw-audio-progress');

        // Pausar otros audios activos
        document.querySelectorAll('.chatwoot-audio-player audio').forEach(a => {
            if (a !== audio && !a.paused) {
                a.pause();
                const otherBtn = a.closest('.chatwoot-audio-player')?.querySelector('.cw-audio-play-btn');
                if (otherBtn) {
                    otherBtn.querySelector('.icon-play').style.display = 'block';
                    otherBtn.querySelector('.icon-pause').style.display = 'none';
                }
            }
        });

        if (audio.paused) {
            audio.play().then(() => {
                if (iconPlay) iconPlay.style.display = 'none';
                if (iconPause) iconPause.style.display = 'block';
            }).catch(err => console.error('Audio playback error:', err));
        } else {
            audio.pause();
            if (iconPlay) iconPlay.style.display = 'block';
            if (iconPause) iconPause.style.display = 'none';
        }

        if (!audio._listenersAttached) {
            audio._listenersAttached = true;
            audio.addEventListener('timeupdate', () => {
                const current = audio.currentTime || 0;
                const duration = audio.duration || 0;
                const pct = duration > 0 ? (current / duration) * 100 : 0;
                if (progress) progress.style.width = `${pct}%`;
                
                const curM = Math.floor(current / 60);
                const curS = Math.floor(current % 60).toString().padStart(2, '0');
                const durM = Math.floor(duration / 60) || 0;
                const durS = Math.floor(duration % 60).toString().padStart(2, '0') || '00';
                if (timeSpan) timeSpan.textContent = duration > 0 ? `${curM}:${curS} / ${durM}:${durS}` : `${curM}:${curS}`;
            });
            audio.addEventListener('ended', () => {
                if (iconPlay) iconPlay.style.display = 'block';
                if (iconPause) iconPause.style.display = 'none';
                if (progress) progress.style.width = '0%';
            });
        }
    }

    seekAudio(event, track) {
        const player = track.closest('.chatwoot-audio-player');
        const audio = player?.querySelector('audio');
        if (!audio || !audio.duration) return;
        const rect = track.getBoundingClientRect();
        const pos = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
        audio.currentTime = pos * audio.duration;
    }

    cycleAudioSpeed(btn) {
        const player = btn.closest('.chatwoot-audio-player');
        const audio = player?.querySelector('audio');
        if (!audio) return;
        const speeds = [1, 1.5, 2];
        let currentIdx = speeds.indexOf(audio.playbackRate);
        let nextIdx = (currentIdx + 1) % speeds.length;
        audio.playbackRate = speeds[nextIdx];
        btn.textContent = `${speeds[nextIdx]}x`;
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

        // Actualizar textos según estado actual
        const ctxFav = document.getElementById('ctxFavText');
        if (ctxFav) ctxFav.textContent = chatItem.is_favorite ? 'Quitar de favoritos' : 'Marcar como favorito';

        const ctxArch = document.getElementById('ctxArchText');
        if (ctxArch) ctxArch.textContent = chatItem.is_archived ? 'Desarchivar chat' : 'Archivar chat';

        const ctxBlock = document.getElementById('ctxBlockText');
        if (ctxBlock) ctxBlock.textContent = chatItem.is_blocked ? 'Desbloquear contacto' : 'Bloquear contacto';

        const ctxAssignMe = document.getElementById('ctxAssignMeText');
        if (ctxAssignMe) {
            const isMine = this.currentUser.id && Number(chatItem.assigned_to) === Number(this.currentUser.id);
            ctxAssignMe.textContent = isMine ? 'Asignado a mí (✓)' : 'Asignarme a mí';
        }

        const ctxUnassign = document.getElementById('ctxUnassignItem');
        if (ctxUnassign) {
            ctxUnassign.style.display = (chatItem.assigned_to && Number(chatItem.assigned_to) > 0) ? 'flex' : 'none';
        }

        // Posicionamiento
        menu.style.left = `${e.pageX}px`;
        menu.style.top = `${e.pageY}px`;
        
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
        const chat = (this.chatData.find(c => c.customer_phone === phone)) || this.activeChat;
        if (!chat) return;

        const displayName = chat.customer_name ? chat.customer_name : window.formatPhone(phone);
        const initials = displayName.substring(0, 2).toUpperCase();

        const avatarEl = document.getElementById('infoAvatar');
        if (avatarEl) {
            avatarEl.textContent = initials;
            avatarEl.className = `info-avatar-large ${chat.is_blocked ? 'blocked' : ''}`;
        }
        const nameEl = document.getElementById('infoName');
        if (nameEl) nameEl.textContent = displayName;
        const phoneEl = document.getElementById('infoPhone');
        if (phoneEl) phoneEl.textContent = window.formatPhone(phone);
        
        // Poblar selector de asignación de operadores
        const selectAssign = document.getElementById('infoAssignSelect');
        if (selectAssign) {
            let options = '<option value="">-- Sin asignar --</option>';
            this.operators.forEach(op => {
                const isSelected = (chat.assigned_to && Number(chat.assigned_to) === Number(op.id)) ? 'selected' : '';
                options += `<option value="${op.id}" ${isSelected}>👤 ${window.escapeHtml(op.name)}</option>`;
            });
            selectAssign.innerHTML = options;
        }

        const btnFav = document.getElementById('infoBtnFav');
        const btnArch = document.getElementById('infoBtnArch');
        const btnBlock = document.getElementById('infoBtnBlock');
        
        if (btnFav) btnFav.innerHTML = `${chat.is_favorite ? '⭐ Quitar de favoritos' : '⭐ Marcar como favorito'}`;
        if (btnArch) btnArch.innerHTML = `${chat.is_archived ? '🗄️ Desarchivar chat' : '📥 Archivar chat'}`;
        if (btnBlock) btnBlock.innerHTML = `${chat.is_blocked ? '🔓 Desbloquear contacto' : '🚫 Bloquear contacto'}`;
    }

    renderAssignSelectHtml(phone, currentAssignedId) {
        let options = '<option value="">-- Sin asignar --</option>';
        this.operators.forEach(op => {
            const isSelected = (currentAssignedId && Number(currentAssignedId) === Number(op.id)) ? 'selected' : '';
            options += `<option value="${op.id}" ${isSelected}>👤 ${window.escapeHtml(op.name)}</option>`;
        });
        return `
            <span class="chat-assign-label" title="Agente asignado">👤</span>
            <select class="chat-header-assign-select" onchange="window.ChatProInstance.assignChat('${phone}', this.value)" title="Asignar conversación a un agente">
                ${options}
            </select>
        `;
    }

    updateHeaderActionButtons(phone, updates = {}) {
        const btnFav = document.getElementById('headerBtnFav');
        const btnArch = document.getElementById('headerBtnArch');
        const archBadge = document.getElementById('chatHeaderArchBadge');
        const assignSelect = document.querySelector('#chatHeaderAssign select');

        if (updates.is_favorite !== undefined && btnFav) {
            btnFav.classList.toggle('active', Boolean(updates.is_favorite));
            btnFav.title = updates.is_favorite ? 'Quitar de favoritos' : 'Marcar como favorito';
        }
        if (updates.is_archived !== undefined) {
            if (btnArch) {
                btnArch.classList.toggle('active', Boolean(updates.is_archived));
                btnArch.innerHTML = updates.is_archived ? '🗄️ Desarchivar' : '📥 Archivar';
                btnArch.title = updates.is_archived ? 'Desarchivar chat' : 'Archivar chat';
            }
            if (archBadge) {
                archBadge.style.display = updates.is_archived ? 'inline-flex' : 'none';
            }
        }
        if (updates.assigned_to !== undefined && assignSelect) {
            assignSelect.value = updates.assigned_to || '';
        }
    }

    // --- API Calls for Actions ---

    async assignChat(phone, userId) {
        try {
            const targetId = userId === 'me' ? (this.currentUser.id || null) : (userId ? Number(userId) : null);
            const res = await fetch(`/api/chats/${encodeURIComponent(phone)}/assign`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: targetId })
            });
            if (!res.ok) throw new Error('Error al asignar chat');
            const data = await res.json();
            
            window.showToast(data.assigned_name ? `👤 Chat asignado a ${data.assigned_name}` : '👤 Chat desasignado', 'success');

            // Actualizar estado en memoria
            const chat = this.chatData.find(c => c.customer_phone === phone);
            if (chat) {
                chat.assigned_to = data.assigned_to;
                chat.assigned_name = data.assigned_name;
            }
            if (this.activePhone === phone) {
                if (this.activeChat) {
                    this.activeChat.assigned_to = data.assigned_to;
                    this.activeChat.assigned_name = data.assigned_name;
                }
                this.updateHeaderActionButtons(phone, { assigned_to: data.assigned_to });
                this.renderInfoPanel(phone);
            }
            
            await this.loadChatsData();
            this.renderSidebar();
        } catch (e) {
            console.error(e);
            window.showToast('Error al asignar agente', 'error');
        }
        this.hideContextMenu();
    }

    assignToMe(phone) {
        if (!phone) return;
        this.assignChat(phone, this.currentUser.id || 'me');
    }

    unassignChat(phone) {
        if (!phone) return;
        this.assignChat(phone, null);
    }

    async toggleFavorite(phone) {
        try {
            const res = await fetch(`/api/chats/${encodeURIComponent(phone)}/favorite`, { method: 'PATCH' });
            if (res.ok) {
                const data = await res.json();
                const isFav = Boolean(data.is_favorite);
                window.showToast(isFav ? '⭐ Marcado como favorito' : 'Quitado de favoritos', 'info');

                const chat = this.chatData.find(c => c.customer_phone === phone);
                if (chat) chat.is_favorite = isFav ? 1 : 0;

                if (this.activePhone === phone) {
                    if (this.activeChat) this.activeChat.is_favorite = isFav ? 1 : 0;
                    this.updateHeaderActionButtons(phone, { is_favorite: isFav });
                    this.renderInfoPanel(phone);
                }

                await this.loadChatsData();
                this.renderSidebar();
            }
        } catch (e) { console.error(e); window.showToast('Error de conexión', 'error'); }
        this.hideContextMenu();
    }

    async toggleArchive(phone) {
        try {
            const res = await fetch(`/api/chats/${encodeURIComponent(phone)}/archive`, { method: 'PATCH' });
            if (res.ok) {
                const data = await res.json();
                const isArch = Boolean(data.is_archived);
                window.showToast(isArch ? '🗄️ Chat archivado' : '📬 Chat desarchivado', 'info');

                const chat = this.chatData.find(c => c.customer_phone === phone);
                if (chat) chat.is_archived = isArch ? 1 : 0;

                if (this.activePhone === phone) {
                    if (this.activeChat) this.activeChat.is_archived = isArch ? 1 : 0;
                    this.updateHeaderActionButtons(phone, { is_archived: isArch });
                    this.renderInfoPanel(phone);
                }

                await this.loadChatsData();
                this.renderSidebar();
            }
        } catch (e) { console.error(e); window.showToast('Error de conexión', 'error'); }
        this.hideContextMenu();
    }

    async toggleBlock(phone) {
        try {
            const res = await fetch(`/api/chats/${encodeURIComponent(phone)}/block`, { method: 'PATCH' });
            if (res.ok) {
                const data = await res.json();
                const isBlocked = Boolean(data.is_blocked);
                window.showToast(isBlocked ? '🚫 Contacto bloqueado' : '🔓 Contacto desbloqueado', 'info');

                const chat = this.chatData.find(c => c.customer_phone === phone);
                if (chat) chat.is_blocked = isBlocked ? 1 : 0;

                if (this.activePhone === phone) {
                    if (this.activeChat) this.activeChat.is_blocked = isBlocked ? 1 : 0;
                    this.renderInfoPanel(phone);
                }

                await this.loadChatsData();
                this.renderSidebar();
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
