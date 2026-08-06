/**
 * WaBot SaaS — Admin Panel (Client-side)
 * CRUD de productos y visualización de historial.
 */

// ─── Estado ────────────────────────────────────
// ─── Estado ────────────────────────────────────
let editingProductId = null;
let editingDriverId = null;
window.activeChatPhone = null; // Exposed for chat-pro
let socket = null;

// ─── Init ──────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    // Inicializar Tema Claro / Oscuro
    const currentTheme = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', currentTheme);
    const themeToggleBtn = document.getElementById('theme-toggle');
    if (themeToggleBtn) {
        themeToggleBtn.textContent = currentTheme === 'light' ? '🌙' : '☀️';
        themeToggleBtn.addEventListener('click', () => {
            let theme = document.documentElement.getAttribute('data-theme');
            let newTheme = theme === 'light' ? 'dark' : 'light';
            document.documentElement.setAttribute('data-theme', newTheme);
            localStorage.setItem('theme', newTheme);
            themeToggleBtn.textContent = newTheme === 'light' ? '🌙' : '☀️';
            
            if (calendar) {
                calendar.render();
            }
        });
    }

    loadCategories();
    loadProducts();
    loadClinicMode();
    initSockets();
    checkActiveHandoffs();
});

async function loadCategories() {
    try {
        const res = await fetch('/api/store');
        if (res.ok) {
            const store = await res.json();
            const select = document.getElementById('categoryOptions');
            select.innerHTML = '';
            const cats = store.categories_parsed || ["Pizzas", "Empanadas", "Bebidas", "Postres", "General"];
            cats.forEach(c => {
                const opt = document.createElement('option');
                opt.value = c;
                select.appendChild(opt);
            });
        }
    } catch (e) {
        console.error("Error al cargar categorías", e);
    }
}

// ─── Tabs ──────────────────────────────────────
function switchTab(tab) {
    // Desactivar todos los tabs
    document.querySelectorAll('.tab-btn, .dropdown-item').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

    // Activar el tab seleccionado
    const selectedTabBtn = document.querySelector(`[data-tab="${tab}"]`);
    if (selectedTabBtn) {
        selectedTabBtn.classList.add('active');
        
        // Si el tab seleccionado está dentro de un dropdown, iluminar también el botón padre
        const parentDropdown = selectedTabBtn.closest('.dropdown');
        if (parentDropdown) {
            const toggleBtn = parentDropdown.querySelector('.dropdown-toggle');
            if (toggleBtn) toggleBtn.classList.add('active');
        }
    }
    
    document.getElementById(`tab-${tab}`).classList.add('active');
    
    // Layout especial para chats
    const main = document.querySelector('.admin-main');
    if (tab === 'chats') {
        main.classList.add('chat-mode');
    } else {
        main.classList.remove('chat-mode');
    }

    // Cargar datos según el tab
    if (tab === 'products') loadProducts();
    if (tab === 'services') loadProducts();
    if (tab === 'doctors') loadDoctors();
    if (tab === 'appointments') loadAppointments();
    if (tab === 'rooms') loadRooms();
    if (tab === 'bookings') loadBookings();
    if (tab === 'drivers') loadDrivers();
    if (tab === 'chats') loadChats();
    if (tab === 'history') loadHistory();
    if (tab === 'customers') loadCustomers();
    if (tab === 'whatsapp') { loadWhatsAppConfig(); loadBotStatus(); }
    if (tab === 'settings') { loadStoreSettings(); loadClinicMode(); }
}

// ─── Productos CRUD ────────────────────────────

/**
 * Cargar lista de productos.
 */
async function loadProducts() {
    const productsContainer = document.getElementById('productsList');
    const servicesContainer = document.getElementById('servicesList');
    
    try {
        const res = await fetch('/api/products');
        if (!res.ok) throw new Error('Error al cargar');
        const allItems = await res.json();

        const products = allItems.filter(p => !p.is_service);
        const services = allItems.filter(p => p.is_service);

        const renderItem = (p, isService) => `
            <div class="product-row ${p.available ? '' : 'unavailable'}" id="${isService ? 'service' : 'product'}-${p.id}">
                <div class="product-info">
                    <div class="product-name">${p.image_path ? '🖼️ ' : ''}${escapeHtml(p.name)}</div>
                    <div class="product-desc">${escapeHtml(p.description || '')}</div>
                </div>
                <span class="product-category">${isService ? `⏱️ ${p.duration || 30} min` : escapeHtml(p.category || 'General')}</span>
                <span class="product-price">$${p.price}</span>
                <div class="product-actions">
                    <button class="btn-icon ${p.available ? 'toggle-on' : 'toggle-off'}" 
                            onclick="toggleProduct(${p.id})" title="${p.available ? 'Pausar' : 'Activar'}">
                        ${p.available ? '✅' : '⏸'}
                    </button>
                    <button class="btn-icon" onclick="editProduct(${p.id}, ${isService})" title="Editar">✏️</button>
                    <button class="btn-icon delete" onclick="deleteProduct(${p.id})" title="Eliminar">🗑</button>
                </div>
            </div>
        `;

        if (productsContainer) {
            if (products.length === 0) {
                productsContainer.innerHTML = '<div class="loading">No hay productos. ¡Agregá el primero!</div>';
            } else {
                productsContainer.innerHTML = products.map(p => renderItem(p, false)).join('');
            }
        }
        
        if (servicesContainer) {
            if (services.length === 0) {
                servicesContainer.innerHTML = '<div class="loading">No hay servicios. ¡Agregá el primero!</div>';
            } else {
                servicesContainer.innerHTML = services.map(p => renderItem(p, true)).join('');
            }
        }
    } catch (error) {
        if (productsContainer) productsContainer.innerHTML = '<div class="loading">Error al cargar</div>';
        if (servicesContainer) servicesContainer.innerHTML = '<div class="loading">Error al cargar</div>';
        console.error(error);
    }
}

/**
 * Guardar producto (crear o editar).
 */
async function saveProduct(event, isService = false) {
    event.preventDefault();

    const prefix = isService ? 'service' : 'product';
    const formData = new FormData();
    formData.append('name', document.getElementById(`${prefix}Name`).value);
    formData.append('description', document.getElementById(`${prefix}Description`).value);
    formData.append('price', parseFloat(document.getElementById(`${prefix}Price`).value));
    formData.append('is_service', isService);

    if (isService) {
        formData.append('duration', parseInt(document.getElementById(`${prefix}Duration`).value));
    } else {
        formData.append('category', document.getElementById(`${prefix}Category`).value);
        const fileInput = document.getElementById('productImage');
        if (fileInput && fileInput.files[0]) {
            formData.append('image', fileInput.files[0]);
        }
    }

    try {
        let res;
        if (editingProductId) {
            res = await fetch(`/api/products/${editingProductId}`, {
                method: 'PUT',
                body: formData
            });
        } else {
            res = await fetch('/api/products', {
                method: 'POST',
                body: formData
            });
        }

        if (!res.ok) throw new Error('Error al guardar');

        const itemName = isService ? 'Servicio' : 'Producto';
        showToast(editingProductId ? `✅ ${itemName} actualizado` : `✅ ${itemName} creado`, 'success');
        resetForm(isService);
        loadProducts();
    } catch (error) {
        showToast('❌ Error al guardar', 'error');
        console.error(error);
    }
}

/**
 * Editar producto existente (cargar datos en el formulario).
 */
async function editProduct(id, isService = false) {
    try {
        const res = await fetch(`/api/products/${id}`);
        const product = await res.json();
        
        const prefix = isService ? 'service' : 'product';

        document.getElementById(`${prefix}Id`).value = product.id;
        document.getElementById(`${prefix}Name`).value = product.name;
        document.getElementById(`${prefix}Description`).value = product.description || '';
        document.getElementById(`${prefix}Price`).value = product.price;
        
        if (isService) {
            document.getElementById(`${prefix}Duration`).value = product.duration || 30;
            document.getElementById(`formTitle-services`).textContent = '✏️ Editar Servicio';
            document.getElementById(`submitBtn-services`).textContent = 'Actualizar';
        } else {
            document.getElementById(`${prefix}Category`).value = product.category || 'General';
            document.getElementById(`formTitle-products`).textContent = '✏️ Editar Producto';
            document.getElementById(`submitBtn-products`).textContent = 'Actualizar';
        }

        editingProductId = id;

        // Scroll al formulario
        document.querySelector(isService ? '#tab-services .form-card' : '#tab-products .form-card').scrollIntoView({ behavior: 'smooth' });
    } catch (error) {
        showToast('❌ Error al cargar', 'error');
        console.error(error);
    }
}

/**
 * Toggle disponibilidad de producto.
 */
async function toggleProduct(id) {
    try {
        const res = await fetch(`/api/products/${id}/toggle`, { method: 'PATCH' });
        if (!res.ok) throw new Error('Error al cambiar estado');

        const product = await res.json();
        showToast(product.available ? '✅ Producto activado' : '⏸ Producto pausado', 'info');
        loadProducts();
    } catch (error) {
        showToast('❌ Error al cambiar estado', 'error');
        console.error(error);
    }
}

/**
 * Eliminar producto.
 */
async function deleteProduct(id) {
    if (!confirm('¿Eliminar este producto?')) return;

    try {
        const res = await fetch(`/api/products/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Error al eliminar');

        showToast('🗑 Producto eliminado', 'info');
        loadProducts();
    } catch (error) {
        showToast('❌ Error al eliminar', 'error');
        console.error(error);
    }
}

/**
 * Resetear formulario.
 */
function resetForm(isService = false) {
    const prefix = isService ? 'service' : 'product';
    document.getElementById(`${prefix}Form`).reset();
    document.getElementById(`${prefix}Id`).value = '';
    
    if (isService) {
        document.getElementById('formTitle-services').textContent = '➕ Nuevo Servicio';
        document.getElementById('submitBtn-services').textContent = 'Guardar';
    } else {
        document.getElementById('formTitle-products').textContent = '➕ Nuevo Producto';
        document.getElementById('submitBtn-products').textContent = 'Guardar';
    }
    
    editingProductId = null;
}

// ─── Repartidores CRUD ──────────────────────────

/**
 * Cargar lista de repartidores.
 */
async function loadDrivers() {
    const container = document.getElementById('driversList');
    
    try {
        const res = await fetch('/api/drivers');
        if (!res.ok) throw new Error('Error al cargar repartidores');
        const drivers = await res.json();

        if (drivers.length === 0) {
            container.innerHTML = '<div class="loading">No hay repartidores. ¡Agregá el primero!</div>';
            return;
        }

        container.innerHTML = drivers.map(d => `
            <div class="product-row ${d.active ? '' : 'unavailable'}" id="driver-row-${d.id}">
                <div class="product-info">
                    <div class="product-name">${escapeHtml(d.name)}</div>
                    <div class="product-desc">${escapeHtml(d.phone)}</div>
                </div>
                <div class="product-actions">
                    <button class="btn-icon ${d.active ? 'toggle-on' : 'toggle-off'}" 
                            onclick="toggleDriver(${d.id})" 
                            title="${d.active ? 'Desactivar' : 'Activar'}">
                        ${d.active ? '✅' : '⏸'}
                    </button>
                    <button class="btn-icon" onclick="editDriver(${d.id})" title="Editar">✏️</button>
                    <button class="btn-icon delete" onclick="deleteDriver(${d.id})" title="Eliminar">🗑</button>
                </div>
            </div>
        `).join('');
    } catch (error) {
        container.innerHTML = '<div class="loading">Error al cargar repartidores</div>';
        console.error(error);
    }
}

/**
 * Guardar repartidor (crear o editar).
 */
async function saveDriver(event) {
    event.preventDefault();

    const data = {
        name: document.getElementById('driverName').value,
        phone: document.getElementById('driverPhone').value
    };

    try {
        let res;
        if (editingDriverId) {
            res = await fetch(`/api/drivers/${editingDriverId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
        } else {
            res = await fetch('/api/drivers', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
        }

        if (!res.ok) throw new Error('Error al guardar');

        showToast(editingDriverId ? '✅ Repartidor actualizado' : '✅ Repartidor creado', 'success');
        resetDriverForm();
        loadDrivers();
    } catch (error) {
        showToast('❌ Error al guardar repartidor', 'error');
        console.error(error);
    }
}

/**
 * Editar repartidor existente (cargar datos en el formulario).
 */
async function editDriver(id) {
    try {
        const res = await fetch(`/api/drivers`);
        const drivers = await res.json();
        const driver = drivers.find(d => d.id === id);
        if (!driver) return showToast('❌ Repartidor no encontrado', 'error');

        document.getElementById('driverId').value = driver.id;
        document.getElementById('driverName').value = driver.name;
        document.getElementById('driverPhone').value = driver.phone;

        document.getElementById('driverFormTitle').textContent = '✏️ Editar Repartidor';
        document.getElementById('driverSubmitBtn').textContent = 'Actualizar';
        editingDriverId = id;

        // Scroll al formulario de repartidores
        document.getElementById('driverForm').scrollIntoView({ behavior: 'smooth' });
    } catch (error) {
        showToast('❌ Error al cargar repartidor', 'error');
        console.error(error);
    }
}

/**
 * Toggle disponibilidad/activación del repartidor.
 */
async function toggleDriver(id) {
    try {
        const res = await fetch(`/api/drivers/${id}/toggle`, { method: 'PATCH' });
        if (!res.ok) throw new Error('Error al cambiar estado');

        const driver = await res.json();
        showToast(driver.active ? '✅ Repartidor activado' : '⏸ Repartidor pausado', 'info');
        loadDrivers();
    } catch (error) {
        showToast('❌ Error al cambiar estado', 'error');
        console.error(error);
    }
}

/**
 * Eliminar repartidor.
 */
async function deleteDriver(id) {
    if (!confirm('¿Eliminar este repartidor?')) return;

    try {
        const res = await fetch(`/api/drivers/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Error al eliminar');

        showToast('🗑 Repartidor eliminado', 'info');
        loadDrivers();
    } catch (error) {
        showToast('❌ Error al eliminar', 'error');
        console.error(error);
    }
}

/**
 * Resetear formulario de repartidores.
 */
function resetDriverForm() {
    document.getElementById('driverForm').reset();
    document.getElementById('driverId').value = '';
    document.getElementById('driverFormTitle').textContent = '➕ Nuevo Repartidor';
    document.getElementById('driverSubmitBtn').textContent = 'Guardar';
    editingDriverId = null;
}

// ─── Historial ─────────────────────────────────

/**
 * Cargar historial de pedidos.
 */
async function loadHistory() {
    const historyContainer = document.getElementById('historyList');
    const reportContainer = document.getElementById('dailyReportContainer');

    // 1. Cargar Reporte Diario
    try {
        const reportRes = await fetch('/api/orders/daily-report');
        if (reportRes.ok) {
            const r = await reportRes.json();
            
            // Métodos de pago
            const paymentMethodsHtml = r.paymentMethods.length > 0
                ? r.paymentMethods.map(pm => `
                    <div class="report-stat-item">
                        <span>${escapeHtml(pm.payment_method)}:</span>
                        <strong>$${pm.total} (${pm.count} ${pm.count === 1 ? 'pedido' : 'pedidos'})</strong>
                    </div>
                `).join('')
                : '<div class="report-empty">Sin ventas registradas hoy.</div>';

            // Liquidación repartidores
            const driversHtml = r.driverDeliveries.length > 0
                ? r.driverDeliveries.map(d => `
                    <div class="report-stat-item">
                        <span>🛵 ${escapeHtml(d.driver_name)}:</span>
                        <strong>${d.count} ${d.count === 1 ? 'viaje' : 'viajes'} (Total: $${d.total})</strong>
                    </div>
                `).join('')
                : '<div class="report-empty">Sin repartos registrados hoy.</div>';

            reportContainer.innerHTML = `
                <div class="daily-report-card">
                    <div class="report-header">
                        <h3>📊 Reporte Diario (${r.date})</h3>
                        <span class="report-badge">Cuentas Clarificadas</span>
                    </div>
                    <div class="report-grid">
                        <div class="report-box main-box">
                            <div class="report-label">Facturación Entregada Hoy</div>
                            <div class="report-val">$${r.totalRevenue}</div>
                            <div class="report-sub">${r.totalOrders} ${r.totalOrders === 1 ? 'pedido entregado' : 'pedidos entregados'}</div>
                        </div>
                        <div class="report-box">
                            <div class="report-box-title">💳 Métodos de Pago</div>
                            <div class="report-stats-list">${paymentMethodsHtml}</div>
                        </div>
                        <div class="report-box">
                            <div class="report-box-title">🛵 Envíos por Repartidor</div>
                            <div class="report-stats-list">${driversHtml}</div>
                        </div>
                    </div>
                </div>
            `;
        } else {
            reportContainer.innerHTML = '<div class="loading">Error al cargar reporte diario</div>';
        }
    } catch (err) {
        console.error(err);
        reportContainer.innerHTML = '<div class="loading">Error al cargar reporte diario</div>';
    }

    // 2. Cargar Lista de Historial
    try {
        const res = await fetch('/api/orders/history');
        if (!res.ok) throw new Error('Error al cargar historial');
        const orders = await res.json();

        if (orders.length === 0) {
            historyContainer.innerHTML = '<div class="loading">Sin pedidos en el historial</div>';
            return;
        }

        historyContainer.innerHTML = orders.map(order => {
            const items = order.items.map(i => `${i.quantity}x ${i.product_name}`).join(', ');
            const date = new Date(order.created_at).toLocaleDateString('es-UY', {
                day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
            });

            return `
                <div class="history-row">
                    <span class="history-number">#${order.order_number}</span>
                    <span class="history-items">${escapeHtml(items)}</span>
                    <span class="history-status ${order.status}">${order.status}</span>
                    <span class="history-total">$${order.total}</span>
                    <span class="history-date">${date}</span>
                </div>
            `;
        }).join('');
    } catch (error) {
        historyContainer.innerHTML = '<div class="loading">Error al cargar historial</div>';
        console.error(error);
    }
}

// ─── Sockets y Notificaciones ──────────────────

function initSockets() {
    socket = io({ transports: ['websocket'] });

    socket.on('connect', () => {
        socket.emit('join-admin', { storeId: window.STORE_ID });
        if (window.STORE_ID) {
            socket.emit('join-store-room', { storeId: window.STORE_ID, role: 'admin' });
        }
        console.log('🔌 WebSocket conectado al canal admin');
    });

    socket.on('nueva-reserva-hostel', (booking) => {
        console.log('🏨 Nueva reserva de hostel:', booking);
        showToast(`🏨 Nueva reserva #${booking.booking_number} (${booking.room_name})`, 'info');
        if (typeof playBeepAlert === 'function') playBeepAlert();
        loadBookings();
    });

    socket.on('reserva-hostel-actualizada', () => {
        loadBookings();
    });

    socket.on('chat-handoff', (data) => {
        console.log('🚨 Handoff recibido:', data);
        showToast(`🚨 Cliente ${data.customer_phone} requiere atención humana`, 'error');
        document.getElementById('chatsHandoffBadge').style.display = 'inline-block';
        playBeepAlert();
        
        // Si estamos en la pestaña chats, recargar lista
        const activeTab = document.querySelector('.tab-btn.active').dataset.tab;
        if (activeTab === 'chats') {
            loadChats();
        }
    });

    socket.on('chat-update', (data) => {
        console.log('📩 Actualización de chat:', data);
        
        // Si la conversación actualmente abierta es del mismo cliente
        if (window.activeChatPhone === data.customer_phone) {
            appendMessage(data.message);
            scrollToBottom();
        }

        // Recargar sidebar si estamos en chats
        const activeTab = document.querySelector('.tab-btn.active').dataset.tab;
        if (activeTab === 'chats') {
            loadChats();
        }
    });

    socket.on('chat-resolved', (data) => {
        if (window.activeChatPhone === data.customer_phone) {
            openChat(data.customer_phone); // Recargar ventana
        }
        loadChats();
        checkActiveHandoffs();
    });

    socket.on('whatsapp-qr', (data) => {
        const activeConnId = window.currentActiveConnectionId;
        if (data && Number(activeConnId) === Number(data.connectionId)) {
            const qrArea = document.getElementById('qrCodeArea');
            const canvas = document.getElementById('qrCodeCanvas');
            if (qrArea && canvas && window.QRCode) {
                qrArea.style.display = 'block';
                const pairingArea = document.getElementById('pairingCodeArea');
                if (pairingArea) pairingArea.style.display = 'none';
                QRCode.toCanvas(canvas, data.qr, function (error) {
                    if (error) console.error(error);
                });
            }
        }
    });

    socket.on('whatsapp-status', (data) => {
        loadWhatsAppConfig();
        const activeConnId = window.currentActiveConnectionId;
        if (data && Number(activeConnId) === Number(data.connectionId)) {
            const el = document.getElementById('waConnectionStatus');
            if (el) {
                el.textContent = data.status === 'connected' ? 'Conectado ✅' : `Desconectado ❌ (${data.reason || ''})`;
                if (data.status === 'connected') {
                    const pairingArea = document.getElementById('pairingCodeArea');
                    if (pairingArea) pairingArea.style.display = 'none';
                    const qrArea = document.getElementById('qrCodeArea');
                    if (qrArea) qrArea.style.display = 'none';
                }
            }
        }
    });

    // Sincronizar el widget del bot en tiempo real
    socket.on('bot-status-changed', (data) => {
        _updateBotStatusUI(data.active);
    });

    socket.on('nueva-cita', (data) => {
        console.log('📅 Nueva cita recibida:', data);
        showToast(`📅 Nueva cita agendada: ${data.customer_name || 'Sin Nombre'} - ${data.service}`, 'success');
        if (calendar) {
            calendar.refetchEvents();
        }
    });
}

function playBeepAlert() {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();

        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(880, audioCtx.currentTime); // La5
        gainNode.gain.setValueAtTime(0.2, audioCtx.currentTime);

        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        oscillator.start();
        setTimeout(() => oscillator.stop(), 150);
        setTimeout(() => {
            const osc2 = audioCtx.createOscillator();
            osc2.type = 'sine';
            osc2.frequency.setValueAtTime(1000, audioCtx.currentTime);
            osc2.connect(gainNode);
            osc2.start();
            setTimeout(() => osc2.stop(), 200);
        }, 200);
    } catch (e) {
        console.error('Error generando sonido de alerta:', e);
    }
}

async function checkActiveHandoffs() {
    try {
        const res = await fetch('/api/chats');
        if (!res.ok) return;
        const chats = await res.json();
        const hasHandoff = chats.some(c => c.needs_human);
        document.getElementById('chatsHandoffBadge').style.display = hasHandoff ? 'inline-block' : 'none';
    } catch (e) {
        console.error(e);
    }
}

// ─── Chats / Handoff UI Lógica ─────────────────

window.formatPhone = function(phone) {
    if (!phone) return 'Desconocido';
    return phone.replace(/@s\.whatsapp\.net|@lid|@broadcast/g, '');
}

async function loadChats() {
    const container = document.getElementById('chatList');
    try {
        const filterStr = window.ChatProInstance ? window.ChatProInstance.currentFilter : 'all';
        const res = await fetch(`/api/chats?filter=${filterStr}`);
        if (!res.ok) throw new Error('Error al cargar chats');
        const chats = await res.json();
        
        // Si ChatPro está cargado, dejamos que se encargue del renderizado
        if (window.ChatProInstance) {
            window.ChatProInstance.chatData = chats;
            window._chatData = chats;
            window.ChatProInstance.renderSidebar();
            return;
        }

        if (chats.length === 0) {
            container.innerHTML = '<div class="loading">No hay conversaciones activas.</div>';
            return;
        }

        container.innerHTML = chats.map(c => {
            const badge = c.needs_human ? '<span class="badge-human-needs">⚠️ Soporte</span>' : '';
            const activeClass = window.activeChatPhone === c.customer_phone ? 'active' : '';
            const displayName = c.customer_name ? c.customer_name : window.formatPhone(c.customer_phone);
            return `
                <div class="chat-list-item ${activeClass} ${c.needs_human ? 'needs-human' : ''}" 
                     onclick="openChat('${c.customer_phone}', '${escapeHtml(displayName)}')">
                    <div class="chat-item-header">
                        <span class="chat-item-phone" data-phone="${escapeHtml(c.customer_phone)}">${escapeHtml(displayName)}</span>
                        ${badge}
                    </div>
                    <div class="chat-item-msg">${escapeHtml(c.last_message || 'Sin mensajes')}</div>
                </div>
            `;
        }).join('');
    } catch (error) {
        container.innerHTML = '<div class="loading">Error al cargar chats</div>';
        console.error(error);
    }
}

async function openChat(phone, displayName = '') {
    window.activeChatPhone = phone;
    const windowContainer = document.getElementById('chatWindow');
    windowContainer.innerHTML = '<div class="loading">Cargando conversación...</div>';
    const displayHeader = displayName || formatPhone(phone);

    // Marcar como activo en el sidebar
    document.querySelectorAll('.chat-list-item').forEach(item => {
        item.classList.remove('active');
        const phoneSpan = item.querySelector('.chat-item-phone');
        if (phoneSpan && (phoneSpan.dataset.phone === phone || phoneSpan.textContent === phone)) {
            item.classList.add('active');
        }
    });

    try {
        const res = await fetch(`/api/chats/${phone}/messages`);
        if (!res.ok) throw new Error('Error al cargar mensajes');
        const data = await res.json();

        const messagesHtml = data.messages.map(m => {
            const isNote = m.role === 'note';
            const isMe = !isNote && (m.role === 'ai' || m.role === 'assistant');
            const isOperator = !isNote && (m.operator || m.role === 'human');
            const bubbleClass = isNote ? 'private-note' : (isOperator ? 'operator' : (isMe ? 'me' : 'client'));
            
            let operatorTag = '';
            if (isNote) {
                operatorTag = `<span class="operator-tag" style="background:#fbbf24; color:#000; padding:2px 6px; border-radius:4px; font-size:0.75rem; font-weight:600; display:inline-block; margin-bottom:4px; user-select:none;">📌 Nota Privada (${m.operator || 'Admin'})</span>`;
            } else if (isOperator) {
                operatorTag = '<span class="operator-tag" style="margin-right:4px;">👤 Operador</span>';
            }
            
            return `
                <div class="chat-bubble ${bubbleClass}">
                    <div class="bubble-text">
                        ${operatorTag ? `<div>${operatorTag}</div>` : ''}
                        ${escapeHtml(m.content)}
                    </div>
                    <div class="bubble-meta">
                        <span class="bubble-time">${m.timestamp ? new Date(m.timestamp).toLocaleTimeString('es-UY', { hour: '2-digit', minute: '2-digit' }) : ''}</span>
                    </div>
                </div>
            `;
        }).join('');

        const headerActionHtml = data.needs_human ? `
            <button class="btn-resolve" onclick="resolveChat('${phone}')">
                ✅ Reactivar IA (Resolver)
            </button>
        ` : `
            <button class="btn-pause" onclick="pauseChat('${phone}')" style="background: var(--bg-surface); color: var(--accent-red); border: 1px solid var(--accent-red); padding: 8px 16px; border-radius: var(--radius-sm); cursor: pointer; font-weight: 600;">
                ⏸️ Desactivar Bot
            </button>
        `;
        
        const chatHeaderHtml = window.ChatProInstance ? `
            <div class="chat-header-profile" id="chatHeaderProfile">
                <div class="chat-header-avatar">${displayHeader.substring(0, 2).toUpperCase()}</div>
                <div class="chat-header-info-text">
                    <span class="chat-header-name">${window.escapeHtml(displayHeader)}</span>
                    <span class="chat-header-status">${window.formatPhone(phone)}</span>
                </div>
            </div>
            <div class="chat-header-actions">
                ${data.needs_human ? 
                    `<button class="btn-resolve-pro" onclick="resolveChat('${phone}')">✅ Resolver</button>` : 
                    `<button class="btn-pause-pro" onclick="pauseChat('${phone}')">⏸️ Pausar IA</button>`}
                <button class="btn-icon-chat" onclick="window.ChatProInstance.toggleInfoPanel()">⋮</button>
            </div>
        ` : `
            <div class="chat-header-info">
                <span class="chat-header-phone">${window.escapeHtml(displayHeader)}</span>
                <small style="color:var(--text-muted); margin-left:8px;">${window.escapeHtml(window.formatPhone(phone))}</small>
            </div>
            <div class="chat-header-actions">
                ${headerActionHtml}
            </div>
        `;

        windowContainer.innerHTML = `
            <div class="chat-window-header">
                ${chatHeaderHtml}
            </div>
            
            <div class="chat-window-messages" id="chatMessages">
                ${messagesHtml.length > 0 ? messagesHtml : '<p class="loading">Sin historial de mensajes</p>'}
            </div>

            <div class="chat-media-preview" id="chatMediaPreview" style="display:none;">
                <div class="media-preview-content">
                    <img id="mediaPreviewImg" src="" alt="Preview" style="display:none; max-height:80px; border-radius:6px;">
                    <audio id="mediaPreviewAudio" controls style="display:none; height:36px; max-width:200px;"></audio>
                    <div id="mediaPreviewDoc" style="display:none; padding:8px 12px; background:rgba(255,255,255,0.05); border-radius:6px; display:flex; align-items:center; gap:8px;">
                        <span style="font-size:1.5rem;">📄</span>
                        <span id="mediaPreviewDocName" style="font-size:0.85rem; color:var(--chat-text-primary);"></span>
                    </div>
                    <button class="media-preview-remove" onclick="removeMediaPreview()" title="Quitar archivo">✕</button>
                </div>
            </div>

            <div class="chat-window-input">
                <div class="composer-tabs">
                    <button type="button" class="composer-tab active" onclick="setComposerMode('public')">Responder</button>
                    <button type="button" class="composer-tab" onclick="setComposerMode('private')">Nota privada</button>
                </div>
                <form id="chatForm" onsubmit="sendManualMessage(event, '${phone}')" enctype="multipart/form-data">
                    <input type="file" id="mediaFileInput" style="display:none;" accept="image/*,.pdf,.doc,.docx,.txt" onchange="handleMediaSelect(event)">
                    <textarea id="chatInput" placeholder="Escribí un mensaje de respuesta... (Shift + Enter para salto de línea)"></textarea>
                    
                    <div class="chat-input-bottom">
                        <div class="chat-input-actions">
                            <button type="button" class="btn-chat-action" id="btnEmojiPicker" onclick="toggleEmojiPicker()" title="Insertar emoji">
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" x2="9.01" y1="9" y2="9"/><line x1="15" x2="15.01" y1="9" y2="9"/></svg>
                            </button>
                            <button type="button" class="btn-chat-action" onclick="triggerMediaUpload('document')" title="Adjuntar archivo">
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
                            </button>
                            <button type="button" class="btn-chat-action btn-record" id="btnRecordAudio" onclick="triggerMediaUpload('audio')" title="Grabar nota de voz">
                                <svg id="recordIcon" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v1a7 7 0 0 1-14 0v-1"/><line x1="12" x2="12" y1="19" y2="22"/></svg>
                                <span id="recordTimer" class="record-timer" style="display:none;">00:00</span>
                            </button>
                            <button type="button" class="btn-chat-action" onclick="insertStoreSignature()" title="Insertar firma comercial">
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21 17-2.93-2.93a2 2 0 1 0-2.83 2.83L18 19.75"/><path d="M17 12c-2.3 0-4.5 1-6.1 2.8C9.3 16.6 8 19 8 21.5"/><path d="M3 18c2.5-3.5 6-7 10-7h2"/></svg>
                            </button>
                        </div>
                        <button type="submit" class="btn-send" title="Enviar mensaje">
                            Enviar (Ctrl + ↵)
                        </button>
                    </div>
                </form>
            </div>
        `;

        scrollToBottom();
    } catch (error) {
        windowContainer.innerHTML = `<div class="loading">Error al abrir conversación: ${error.message}</div>`;
        console.error(error);
    }
}

function appendMessage(message) {
    const container = document.getElementById('chatMessages');
    if (!container) return;

    // Quitar placeholder de vacío si existe
    const emptyPlaceholder = container.querySelector('.loading');
    if (emptyPlaceholder) emptyPlaceholder.remove();

    const isMe = message.role === 'ai' || message.role === 'assistant';
    const isOperator = message.operator || message.role === 'human';
    const bubbleClass = isOperator ? 'operator' : (isMe ? 'me' : 'client');
    
    const div = document.createElement('div');
    div.className = `chat-bubble ${bubbleClass}`;
    div.innerHTML = `
        <div class="bubble-text">${escapeHtml(message.content)}</div>
        <div class="bubble-meta">
            <span class="bubble-time">${message.timestamp ? new Date(message.timestamp).toLocaleTimeString('es-UY', { hour: '2-digit', minute: '2-digit' }) : new Date().toLocaleTimeString('es-UY', { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
    `;
    container.appendChild(div);
}

async function sendManualMessage(event, phone) {
    event.preventDefault();
    const input = document.getElementById('chatInput');
    const message = input.value.trim();
    const fileInput = document.getElementById('mediaFileInput');
    const hasFile = fileInput.files.length > 0;

    if (!message && !hasFile) return;

    input.value = '';
    
    // Si es nota privada, no enviamos adjuntos por simplicidad, y usamos la ruta de notas
    if (window.currentComposerMode === 'private') {
        try {
            const res = await fetch(`/api/chats/${phone}/note`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message })
            });

            if (!res.ok) throw new Error('Error al guardar nota privada');
            
            if (!socket || !socket.connected) {
                appendMessage({ role: 'note', content: message, timestamp: new Date().toISOString(), operator: 'Tú' });
                scrollToBottom();
            }
            showToast('📌 Nota guardada', 'success');
            setComposerMode('public');
        } catch (error) {
            showToast('❌ Error al guardar nota', 'error');
            console.error(error);
        }
        return;
    }

    // Si hay archivo, enviar con media (público)
    if (hasFile) {
        const file = fileInput.files[0];
        const formData = new FormData();
        formData.append('media', file);
        formData.append('message', message || '');
        formData.append('mediaType', currentMediaType || 'document');

        try {
            const res = await fetch(`/api/chats/${phone}/send-media`, {
                method: 'POST',
                body: formData
            });

            if (!res.ok) throw new Error('Error al enviar media');
            
            removeMediaPreview();
            showToast('✅ Archivo enviado', 'success');
        } catch (error) {
            showToast('❌ Error al enviar archivo', 'error');
            console.error(error);
        }
    } else {
        // Solo texto (público)
        try {
            const res = await fetch(`/api/chats/${phone}/send`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message })
            });

            if (!res.ok) throw new Error('Error al enviar mensaje');
            
            if (!socket || !socket.connected) {
                appendMessage({ role: 'human', content: message, timestamp: new Date().toISOString() });
                scrollToBottom();
            }
        } catch (error) {
            showToast('❌ Error al enviar mensaje', 'error');
            console.error(error);
        }
    }

    input.focus();
}

// ─── Emoji and Signature Helpers ───────────────────────

window.currentComposerMode = 'public';

function setComposerMode(mode) {
    window.currentComposerMode = mode;
    
    const tabs = document.querySelectorAll('.composer-tab');
    tabs.forEach(tab => {
        if (tab.textContent.toLowerCase().includes(mode === 'private' ? 'privada' : 'responder')) {
            tab.classList.add('active');
        } else {
            tab.classList.remove('active');
        }
    });
    
    const chatForm = document.getElementById('chatForm');
    const input = document.getElementById('chatInput');
    const sendBtn = document.querySelector('.btn-send');
    
    if (mode === 'private') {
        if (chatForm) chatForm.classList.add('private-mode');
        if (input) input.placeholder = 'Escribí una nota privada... (Solo visible para operadores)';
        if (sendBtn) {
            sendBtn.innerHTML = 'Guardar Nota (Ctrl + ↵)';
            sendBtn.style.background = '#eab308';
        }
    } else {
        if (chatForm) chatForm.classList.remove('private-mode');
        if (input) input.placeholder = 'Escribí un mensaje de respuesta... (Shift + Enter para salto de línea)';
        if (sendBtn) {
            sendBtn.innerHTML = 'Enviar (Ctrl + ↵)';
            sendBtn.style.background = 'var(--chat-accent)';
        }
    }
}

function insertStoreSignature() {
    const input = document.getElementById('chatInput');
    if (!input) return;
    
    const headerTitle = document.querySelector('.store-name');
    let storeName = 'El Local';
    if (headerTitle) {
        storeName = headerTitle.innerText.split(' — ')[0].trim();
    }
    
    const signature = `\n\nAtentamente,\n*${storeName}*`;
    
    const startPos = input.selectionStart;
    const endPos = input.selectionEnd;
    const textVal = input.value;
    
    input.value = textVal.substring(0, startPos) + signature + textVal.substring(endPos, textVal.length);
    input.focus();
    input.selectionStart = startPos + signature.length;
    input.selectionEnd = startPos + signature.length;
}

function toggleEmojiPicker() {
    let picker = document.getElementById('emojiPickerPopover');
    if (picker) {
        picker.remove();
        return;
    }
    
    const btn = document.getElementById('btnEmojiPicker');
    if (!btn) return;
    
    picker = document.createElement('div');
    picker.id = 'emojiPickerPopover';
    picker.className = 'emoji-picker-popover';
    
    picker.innerHTML = `
        <div class="emoji-picker-header">Seleccionar Emoji</div>
        <div class="emoji-picker-grid">
            ${['😀','😃','😄','😁','😆','😅','😂','🤣','😊','😇','🙂','🙃','😉','😌','😍','🥰','😘','😗','😙','😚','😋','😛','😝','😜','🤪','🤨','🧐','🤓','😎','🤩','🥳','😏','😒','😞','😔','😟','😕','🙁','☹️','😣','😖','😫','😩','🥺','😢','😭','😤','😠','😡','🤬','🤯','😳','🥵','🥶','😱','😨','😰','😥','😓','🤗','🤔','🤭','🤫','🤥','😶','😐','😑','😬','🙄','😯','😦','😧','😮','😲','🥱','😴','🤤','😪','😵','🤐','🥴','🤢','🤮','🤧','😷','🤒','🤕','🤠','😈','👿','👹','👺','🤡','💩','👻','💀','👽','👾','🤖','👋','👌','✌️','👍','👎','👏','🙌','🙏','🔥','✨','⭐','💥','💯','✅','❌','⚠️','🔔','🔊','📞','💬','❤️','💔'].map(emoji => `
                <button type="button" class="emoji-btn" onclick="insertEmoji('${emoji}')">${emoji}</button>
            `).join('')}
        </div>
    `;
    
    btn.parentElement.appendChild(picker);
    
    const closePicker = (e) => {
        if (!picker.contains(e.target) && e.target !== btn && !btn.contains(e.target)) {
            picker.remove();
            document.removeEventListener('click', closePicker);
        }
    };
    setTimeout(() => document.addEventListener('click', closePicker), 50);
}

function insertEmoji(emoji) {
    const input = document.getElementById('chatInput');
    if (!input) return;
    
    const startPos = input.selectionStart;
    const endPos = input.selectionEnd;
    const textVal = input.value;
    
    input.value = textVal.substring(0, startPos) + emoji + textVal.substring(endPos, textVal.length);
    input.focus();
    input.selectionStart = startPos + emoji.length;
    input.selectionEnd = startPos + emoji.length;
}

// ─── Media Upload Functions ────────────────────────────

let currentMediaType = 'document';
let selectedFile = null;
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;

function triggerMediaUpload(type) {
    if (type === 'audio') {
        startAudioRecording();
        return;
    }
    
    currentMediaType = type;
    const fileInput = document.getElementById('mediaFileInput');
    
    switch(type) {
        case 'image':
            fileInput.accept = 'image/*';
            break;
        case 'document':
            fileInput.accept = '*/*';
            break;
    }
    
    fileInput.click();
}

// ─── Audio Recording Functions ─────────────────────────

async function startAudioRecording() {
    const btn = document.getElementById('btnRecordAudio');
    const recordIcon = document.getElementById('recordIcon');
    const recordTimer = document.getElementById('recordTimer');
    
    if (isRecording) {
        stopAudioRecording();
        return;
    }
    
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
        audioChunks = [];
        
        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                audioChunks.push(event.data);
            }
        };
        
        mediaRecorder.onstop = async () => {
            stream.getTracks().forEach(track => track.stop());
            
            if (audioChunks.length === 0) return;
            
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            await sendRecordedAudio(audioBlob);
        };
        
        mediaRecorder.start();
        isRecording = true;
        
        btn.classList.add('recording');
        recordIcon.innerHTML = '<rect x="6" y="6" width="12" height="12" rx="1"/>';
        recordTimer.style.display = 'block';
        
        // Timer
        let seconds = 0;
        window._recordInterval = setInterval(() => {
            seconds++;
            const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
            const secs = (seconds % 60).toString().padStart(2, '0');
            recordTimer.textContent = `${mins}:${secs}`;
        }, 1000);
        
        showToast('🎙️ Grabando audio... Haz clic en el botón para enviar', 'info');
        
    } catch (error) {
        showToast('❌ No se pudo acceder al micrófono', 'error');
        console.error('Microphone error:', error);
    }
}

function stopAudioRecording() {
    if (mediaRecorder && isRecording) {
        mediaRecorder.stop();
        isRecording = false;
        
        clearInterval(window._recordInterval);
        
        const btn = document.getElementById('btnRecordAudio');
        const recordIcon = document.getElementById('recordIcon');
        const recordTimer = document.getElementById('recordTimer');
        
        if (btn) btn.classList.remove('recording');
        if (recordIcon) recordIcon.innerHTML = '<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v1a7 7 0 0 1-14 0v-1"/><line x1="12" x2="12" y1="19" y2="22"/>';
        if (recordTimer) { recordTimer.style.display = 'none'; recordTimer.textContent = '00:00'; }
        
        showToast('📤 Enviando audio...', 'info');
    }
}

async function sendRecordedAudio(audioBlob) {
    const phone = window.activeChatPhone;
    if (!phone) {
        showToast('❌ No hay chat seleccionado', 'error');
        return;
    }
    
    const formData = new FormData();
    const audioFile = new File([audioBlob], `nota_voz_${Date.now()}.webm`, { type: 'audio/webm' });
    formData.append('media', audioFile);
    formData.append('message', '');
    formData.append('mediaType', 'audio');
    
    try {
        const res = await fetch(`/api/chats/${phone}/send-media`, {
            method: 'POST',
            body: formData
        });
        
        if (!res.ok) throw new Error('Error al enviar audio');
        
        showToast('✅ Audio enviado', 'success');
        
        // Agregar mensaje al chat
        if (!socket || !socket.connected) {
            appendMessage({ role: 'human', content: '🎤 [Nota de voz]', timestamp: new Date().toISOString() });
            scrollToBottom();
        }
    } catch (error) {
        showToast('❌ Error al enviar audio', 'error');
        console.error(error);
    }
}

function handleMediaSelect(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    selectedFile = file;
    const preview = document.getElementById('chatMediaPreview');
    const imgPreview = document.getElementById('mediaPreviewImg');
    const audioPreview = document.getElementById('mediaPreviewAudio');
    const docPreview = document.getElementById('mediaPreviewDoc');
    const docName = document.getElementById('mediaPreviewDocName');
    
    // Hide all previews first
    imgPreview.style.display = 'none';
    audioPreview.style.display = 'none';
    docPreview.style.display = 'none';
    
    // Show appropriate preview
    if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (e) => {
            imgPreview.src = e.target.result;
            imgPreview.style.display = 'block';
        };
        reader.readAsDataURL(file);
        currentMediaType = 'image';
    } else if (file.type.startsWith('audio/')) {
        const reader = new FileReader();
        reader.onload = (e) => {
            audioPreview.src = e.target.result;
            audioPreview.style.display = 'block';
        };
        reader.readAsDataURL(file);
        currentMediaType = 'audio';
    } else {
        docName.textContent = file.name;
        docPreview.style.display = 'flex';
        currentMediaType = 'document';
    }
    
    preview.style.display = 'block';
}

function removeMediaPreview() {
    const preview = document.getElementById('chatMediaPreview');
    const fileInput = document.getElementById('mediaFileInput');
    const imgPreview = document.getElementById('mediaPreviewImg');
    const audioPreview = document.getElementById('mediaPreviewAudio');
    const docPreview = document.getElementById('mediaPreviewDoc');
    
    preview.style.display = 'none';
    fileInput.value = '';
    imgPreview.src = '';
    imgPreview.style.display = 'none';
    audioPreview.src = '';
    audioPreview.style.display = 'none';
    docPreview.style.display = 'none';
    selectedFile = null;
}

async function resolveChat(phone) {
    try {
        const res = await fetch(`/api/chats/${phone}/resolve`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        if (res.ok) {
            showToast('🤖 IA reactivada para esta conversación', 'success');
            openChat(phone); // Actualizar UI de chat
            loadChats(); // Recargar sidebar
            checkActiveHandoffs();
        } else {
            showToast('❌ Error al reactivar IA', 'error');
        }
    } catch (error) {
        showToast('❌ Error al reactivar IA', 'error');
        console.error(error);
    }
}

async function pauseChat(phone) {
    try {
        const res = await fetch(`/api/chats/${phone}/pause`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        if (res.ok) {
            showToast('⏸️ Bot desactivado. Ahora controlas tú la charla.', 'info');
            openChat(phone); // Actualizar UI de chat
            loadChats(); // Recargar sidebar
            checkActiveHandoffs();
        } else {
            showToast('❌ Error al pausar IA', 'error');
        }
    } catch (error) {
        showToast('❌ Error al pausar IA', 'error');
        console.error(error);
    }
}

function scrollToBottom() {
    const container = document.getElementById('chatMessages');
    if (container) {
        container.scrollTop = container.scrollHeight;
    }
}

// ─── Utilidades ────────────────────────────────

window.escapeHtml = function(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

window.showToast = function(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// ─── Ajustes de Bot/Local Lógica ───────────────

async function loadStoreSettings() {
    try {
        const res = await fetch('/api/store');
        if (!res.ok) throw new Error('Error al cargar ajustes');
        const store = await res.json();

        document.getElementById('storeName').value = store.name || '';
        document.getElementById('storePhone').value = store.phone || '';
        document.getElementById('storeAddress').value = store.address || '';
        document.getElementById('storeBotName').value = store.bot_name || 'Wapit';
        document.getElementById('storeBusinessType').value = store.business_type || 'pizzería';
        document.getElementById('storeAiPrompt').value = store.ai_prompt || '';
        document.getElementById('storeCategories').value = (store.categories_parsed || []).join(', ');
        document.getElementById('notifyPhone').value = store.notify_phone || '';
        document.getElementById('notifyEmail').value = store.notify_email || '';
        let notifyEvents = store.notification_events;
        if (typeof notifyEvents === 'string') { try { notifyEvents = JSON.parse(notifyEvents); } catch(e) { notifyEvents = ['new','ready']; } }
        if (!Array.isArray(notifyEvents)) notifyEvents = ['new','ready'];
        document.getElementById('notifyEventNew').checked = notifyEvents.includes('new');
        document.getElementById('notifyEventReady').checked = notifyEvents.includes('ready');
    } catch (error) {
        showToast('❌ Error al cargar ajustes', 'error');
        console.error(error);
    }
}

async function saveStoreSettings(event) {
    event.preventDefault();

    const data = {
        name: document.getElementById('storeName').value,
        phone: document.getElementById('storePhone').value,
        address: document.getElementById('storeAddress').value,
        botName: document.getElementById('storeBotName').value,
        businessType: document.getElementById('storeBusinessType').value,
        aiPrompt: document.getElementById('storeAiPrompt').value,
        categories: document.getElementById('storeCategories').value.split(',').map(c => c.trim()).filter(c => c),
        notifyPhone: document.getElementById('notifyPhone').value.trim(),
        notifyEmail: document.getElementById('notifyEmail').value.trim(),
        notificationEvents: [
            ...(document.getElementById('notifyEventNew').checked ? ['new'] : []),
            ...(document.getElementById('notifyEventReady').checked ? ['ready'] : [])
        ]
    };

    try {
        const res = await fetch('/api/store', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        if (res.ok) {
            showToast('✅ Ajustes guardados correctamente', 'success');
            // Actualizar nombre de tienda en la cabecera si cambió
            document.querySelectorAll('.store-name').forEach(el => {
                el.textContent = data.name;
            });
            // Refrescar las categorías en el formulario de productos
            loadCategories();
        } else {
            const errData = await res.json();
            throw new Error(errData.error || 'Error al guardar');
        }
    } catch (error) {
        showToast(`❌ Error: ${error.message}`, 'error');
        console.error(error);
    }
}

// ─── WhatsApp Config Lógica (Multitenant) ───────────────

window.currentActiveConnectionId = null;

async function loadWhatsAppConfig() {
    try {
        const res = await fetch('/api/whatsapp/connections');
        const data = await res.json();
        
        const listDiv = document.getElementById('connectionsList');
        if (!listDiv) return;
        
        const planText = document.getElementById('planLimitsText');
        if (planText) {
            planText.textContent = `Límite de tu plan (${data.plan.toUpperCase()}): ${data.connections.length} de ${data.limit} números conectados.`;
        }
        
        // Deshabilitar botón de añadir si se alcanzó el límite
        const addBtn = document.getElementById('addConnBtn');
        if (addBtn) {
            if (data.connections.length >= data.limit) {
                addBtn.disabled = true;
                addBtn.style.opacity = '0.5';
                addBtn.title = 'Has alcanzado el límite de tu plan.';
            } else {
                addBtn.disabled = false;
                addBtn.style.opacity = '1';
                addBtn.title = '';
            }
        }
        
        if (data.connections.length === 0) {
            listDiv.innerHTML = `
                <div style="padding: 24px; text-align: center; color: var(--text-secondary); background: var(--bg-body); border-radius: 8px; border: 1px dashed var(--border-color);">
                    No hay cuentas de WhatsApp conectadas aún. Haz clic en "Conectar Nueva Cuenta".
                </div>
            `;
            return;
        }
        
        listDiv.innerHTML = data.connections.map(conn => {
            const isConnected = conn.status === 'connected';
            const statusColor = isConnected ? '#16a34a' : '#ef4444';
            const statusBg = isConnected ? '#dcfce7' : '#fee2e2';
            const statusLabel = isConnected ? 'Conectado' : 'Desconectado';
            
            return `
                <div style="display: flex; align-items: center; justify-content: space-between; padding: 16px; background: var(--bg-body); border: 1px solid var(--border-color); border-radius: 8px; margin-bottom: 8px;">
                    <div>
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <strong style="font-size: 1.05rem; color: var(--text-main);">${conn.phone ? formatPhone(conn.phone) : 'Sin número'}</strong>
                            <span style="font-size: 0.8rem; padding: 2px 6px; border-radius: 4px; background: var(--bg-card); color: var(--text-secondary); font-weight: 600; text-transform: uppercase;">
                                ${conn.mode === 'meta' ? '🌐 Cloud API' : '📱 Dispositivo'}
                            </span>
                        </div>
                        <div style="margin-top: 4px; display: flex; align-items: center; gap: 6px;">
                            <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: ${statusColor};"></span>
                            <span style="font-size: 0.9rem; color: var(--text-secondary); font-weight: 500;">${statusLabel}</span>
                        </div>
                    </div>
                    <div style="display: flex; gap: 8px;">
                        <button class="btn-secondary" onclick="showActiveConnectionConfig(${conn.id}, '${conn.mode}')" style="padding: 6px 12px; font-size: 0.85rem; border-radius: 6px; cursor: pointer;">
                            ⚙️ Configurar
                        </button>
                        <button class="btn-danger" onclick="deleteConnection(${conn.id})" style="padding: 6px 12px; font-size: 0.85rem; border-radius: 6px; background: #ef4444; color: white; border: none; cursor: pointer;">
                            🗑️ Eliminar
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    } catch (e) {
        console.error("Error cargando WhatsApp config:", e);
    }
}

function showAddConnectionModal() {
    const modal = document.getElementById('addConnModal');
    if (modal) {
        modal.style.display = 'flex';
        document.getElementById('newConnPhone').value = '';
        document.getElementById('newConnMetaToken').value = '';
        document.getElementById('newConnMetaPhoneId').value = '';
        document.getElementById('newConnMetaVerifyToken').value = '';
        toggleNewConnFields();
    }
}

function hideAddConnectionModal() {
    const modal = document.getElementById('addConnModal');
    if (modal) modal.style.display = 'none';
}

function toggleNewConnFields() {
    const mode = document.getElementById('newConnMode').value;
    const phoneGroup = document.getElementById('newConnPhoneGroup');
    const metaFields = document.getElementById('newConnMetaFields');
    
    if (mode === 'meta') {
        phoneGroup.style.display = 'none';
        document.getElementById('newConnPhone').required = false;
        metaFields.style.display = 'block';
    } else {
        phoneGroup.style.display = 'block';
        document.getElementById('newConnPhone').required = true;
        metaFields.style.display = 'none';
    }
}

async function createNewConnection(e) {
    e.preventDefault();
    const mode = document.getElementById('newConnMode').value;
    const phone = document.getElementById('newConnPhone').value;
    const token = document.getElementById('newConnMetaToken').value;
    const phoneId = document.getElementById('newConnMetaPhoneId').value;
    const verifyToken = document.getElementById('newConnMetaVerifyToken').value;
    
    const body = {
        mode,
        phone: mode === 'baileys' ? phone : '',
        meta_access_token: mode === 'meta' ? token : '',
        meta_phone_id: mode === 'meta' ? phoneId : '',
        meta_verify_token: mode === 'meta' ? verifyToken : ''
    };
    
    try {
        const res = await fetch('/api/whatsapp/connections', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const result = await res.json();
        if (res.ok) {
            showToast('✅ Cuenta agregada correctamente', 'success');
            hideAddConnectionModal();
            loadWhatsAppConfig();
            showActiveConnectionConfig(result.connection.id, mode);
        } else {
            showToast('❌ ' + result.error, 'error');
        }
    } catch (e) {
        showToast('❌ Error de conexión', 'error');
    }
}

async function showActiveConnectionConfig(connectionId, mode) {
    window.currentActiveConnectionId = connectionId;
    const area = document.getElementById('activeConnFormArea');
    if (!area) return;
    
    area.style.display = 'block';
    area.innerHTML = '<div style="text-align: center; padding: 20px;">Cargando configuración de conexión...</div>';
    
    try {
        const res = await fetch('/api/whatsapp/connections');
        const data = await res.json();
        const conn = data.connections.find(c => c.id === connectionId);
        if (!conn) {
            area.innerHTML = '<div style="color: red; text-align: center;">Error: Conexión no encontrada.</div>';
            return;
        }
        
        const isConnected = conn.status === 'connected';
        
        if (mode === 'meta') {
            area.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                    <h3 style="margin: 0; color: var(--text-main);">🌐 Configurar Meta Cloud API</h3>
                    <button class="btn-secondary" onclick="document.getElementById('activeConnFormArea').style.display='none'" style="padding: 4px 8px; font-size: 0.8rem; cursor: pointer;">Cerrar</button>
                </div>
                <form onsubmit="saveMetaConfigForConnection(event, ${connectionId})">
                    <div class="form-group" style="margin-bottom: 12px;">
                        <label style="display:block; margin-bottom:4px; font-weight:600;">Teléfono de la cuenta</label>
                        <input type="text" id="activeMetaPhone" value="${conn.phone || ''}" placeholder="Ej: 59899123456" required style="width:100%; padding:10px; border-radius:6px; border:1px solid var(--border-color); background:var(--bg-body); color:var(--text-main);">
                    </div>
                    <div class="form-group" style="margin-bottom: 12px;">
                        <label style="display:block; margin-bottom:4px; font-weight:600;">Access Token (Permanente)</label>
                        <input type="password" id="activeMetaToken" value="${conn.metaConfig?.accessToken || ''}" placeholder="EAAB..." required style="width:100%; padding:10px; border-radius:6px; border:1px solid var(--border-color); background:var(--bg-body); color:var(--text-main);">
                    </div>
                    <div class="form-group" style="margin-bottom: 12px;">
                        <label style="display:block; margin-bottom:4px; font-weight:600;">Phone Number ID</label>
                        <input type="text" id="activeMetaPhoneId" value="${conn.metaConfig?.phoneId || ''}" placeholder="104938..." required style="width:100%; padding:10px; border-radius:6px; border:1px solid var(--border-color); background:var(--bg-body); color:var(--text-main);">
                    </div>
                    <div class="form-group" style="margin-bottom: 12px;">
                        <label style="display:block; margin-bottom:4px; font-weight:600;">Verify Token (Para el Webhook)</label>
                        <input type="text" id="activeMetaVerifyToken" value="${conn.metaConfig?.verifyToken || ''}" placeholder="MiTokenSecreto" required style="width:100%; padding:10px; border-radius:6px; border:1px solid var(--border-color); background:var(--bg-body); color:var(--text-main);">
                    </div>
                    <div style="margin-top: 16px;">
                        <button type="submit" class="btn-primary" style="width: 100%; padding: 10px; font-weight:600; border-radius:8px;">Guardar y Activar Meta API</button>
                    </div>
                </form>
            `;
        } else {
            area.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                    <h3 style="margin: 0; color: var(--text-main);">📱 Configurar Dispositivo (QR / Código)</h3>
                    <button class="btn-secondary" onclick="document.getElementById('activeConnFormArea').style.display='none'" style="padding: 4px 8px; font-size: 0.8rem; cursor: pointer;">Cerrar</button>
                </div>
                
                <div id="baileysStatusArea" style="margin-bottom: 16px; padding: 12px; background: var(--bg-body); border-radius: 8px; text-align: center; border: 1px solid var(--border-color);">
                    <strong>Estado de Vinculación:</strong> <span id="waConnectionStatus" style="font-weight: 600; color: ${isConnected ? '#16a34a' : '#ef4444'};">${isConnected ? 'Conectado ✅' : 'Desconectado ❌'}</span>
                </div>

                <div id="qrCodeArea" style="display: none; margin-bottom: 16px; text-align: center; background: white; padding: 16px; border-radius: 8px; max-width: 250px; margin: 16px auto;">
                    <p style="color: black; margin-top: 0; font-weight:600;">Escanea este código QR con WhatsApp:</p>
                    <canvas id="qrCodeCanvas" style="margin: 12px auto; display: block;"></canvas>
                </div>

                <div id="pairingCodeArea" style="display: none; margin-bottom: 16px; text-align: center;">
                    <p>Ingresa este código en tu celular (Vincular con número):</p>
                    <h2 id="pairingCodeDisplay" style="letter-spacing: 4px; font-size: 2.2rem; color: var(--primary); margin: 12px 0; font-weight: 700;"></h2>
                </div>

                <form onsubmit="requestPairingCodeForConnection(event, ${connectionId})">
                    <div class="form-group" style="margin-bottom: 12px;">
                        <label style="display:block; margin-bottom:4px; font-weight:600;">Teléfono del bot (Ej: 59899123456)</label>
                        <input type="text" id="activeBaileysPhone" value="${conn.phone || ''}" placeholder="598..." required style="width:100%; padding:10px; border-radius:6px; border:1px solid var(--border-color); background:var(--bg-body); color:var(--text-main);">
                    </div>
                    <div style="margin-top: 16px; display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                        <button type="submit" class="btn-secondary" style="width: 100%; padding: 10px; border-radius:8px; font-weight:600;">Generar Código de 8 Dígitos</button>
                        <button type="button" class="btn-primary" style="width: 100%; background: var(--accent-blue); color: white; padding: 10px; border-radius:8px; font-weight:600; border:none; cursor:pointer;" onclick="connectBaileysQRForConnection(${connectionId})">Generar Código QR</button>
                    </div>
                </form>
                
                <div style="margin-top: 12px;">
                    <button type="button" class="btn-danger" style="width: 100%; background: #ef4444; color: white; padding: 10px; border-radius:8px; font-weight:600; border:none; cursor:pointer;" onclick="logoutBaileysForConnection(${connectionId})">Cerrar Sesión Baileys</button>
                </div>
            `;
        }
        
        area.scrollIntoView({ behavior: 'smooth' });
    } catch (e) {
        area.innerHTML = '<div style="color: red; text-align: center;">Error al cargar datos.</div>';
    }
}

async function saveMetaConfigForConnection(e, connectionId) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'Guardando...';

    const data = {
        phone: document.getElementById('activeMetaPhone').value,
        accessToken: document.getElementById('activeMetaToken').value,
        phoneId: document.getElementById('activeMetaPhoneId').value,
        verifyToken: document.getElementById('activeMetaVerifyToken').value,
    };

    try {
        const res = await fetch(`/api/whatsapp/connections/${connectionId}/save-meta`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        const result = await res.json();
        if (res.ok) {
            showToast(result.message, 'success');
            loadWhatsAppConfig();
            document.getElementById('activeConnFormArea').style.display = 'none';
        } else {
            showToast('❌ ' + result.error, 'error');
        }
    } catch (err) {
        showToast('❌ Error de conexión', 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Guardar y Activar Meta API';
    }
}

async function requestPairingCodeForConnection(e, connectionId) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'Generando...';

    const phone = document.getElementById('activeBaileysPhone').value;

    try {
        const res = await fetch(`/api/whatsapp/connections/${connectionId}/pairing-code`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone })
        });
        const result = await res.json();
        if (res.ok) {
            document.getElementById('pairingCodeArea').style.display = 'block';
            document.getElementById('pairingCodeDisplay').textContent = result.code;
            showToast('Ingresa el código en WhatsApp', 'info');
            loadWhatsAppConfig();
        } else {
            showToast('❌ ' + result.error, 'error');
        }
    } catch (err) {
        showToast('❌ Error de conexión', 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Generar Código de 8 Dígitos';
    }
}

async function connectBaileysQRForConnection(connectionId) {
    try {
        showToast('🔄 Solicitando QR para Baileys...', 'info');
        const res = await fetch(`/api/whatsapp/connections/${connectionId}/switch-baileys`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        
        if (res.ok) {
            showToast('📸 Generando código QR. Por favor espera...', 'success');
        } else {
            const err = await res.json();
            showToast('❌ Error: ' + err.error, 'error');
        }
    } catch (err) {
        showToast('❌ Error de conexión', 'error');
    }
}

async function logoutBaileysForConnection(connectionId) {
    if (!confirm('¿Seguro que deseas cerrar la sesión de Baileys? Tendrás que volver a vincular tu cuenta.')) return;
    try {
        const res = await fetch(`/api/whatsapp/connections/${connectionId}/logout-baileys`, { method: 'POST' });
        if (res.ok) {
            showToast('Sesión cerrada.', 'success');
            document.getElementById('pairingCodeArea').style.display = 'none';
            document.getElementById('qrCodeArea').style.display = 'none';
            document.getElementById('waConnectionStatus').textContent = 'Desconectado ❌';
            document.getElementById('waConnectionStatus').style.color = '#ef4444';
            loadWhatsAppConfig();
        }
    } catch (err) {
        showToast('❌ Error de conexión', 'error');
    }
}

async function deleteConnection(connectionId) {
    if (!confirm('¿Estás seguro de que deseas eliminar por completo esta conexión de WhatsApp? Se perderá la sesión actual.')) return;
    try {
        const res = await fetch(`/api/whatsapp/connections/${connectionId}`, { method: 'DELETE' });
        const data = await res.json();
        if (res.ok) {
            showToast('✅ Conexión eliminada correctamente', 'success');
            if (window.currentActiveConnectionId === connectionId) {
                document.getElementById('activeConnFormArea').style.display = 'none';
            }
            loadWhatsAppConfig();
        } else {
            showToast('❌ ' + data.error, 'error');
        }
    } catch (e) {
        showToast('❌ Error de conexión', 'error');
    }
}

// ─── Clientes CRM ──────────────────────────────────────

async function loadCustomers() {
    const list = document.getElementById('customersList');
    list.innerHTML = '<div class="loading">Cargando clientes...</div>';

    try {
        const res = await fetch('/api/customers');
        const customers = await res.json();

        if (customers.length === 0) {
            list.innerHTML = '<div style="padding: 20px; color: var(--text-muted); text-align: center;">No hay clientes registrados aún.</div>';
            return;
        }

        list.innerHTML = customers.map(c => `
            <div class="chat-list-item" onclick="openCustomerProfile('${c.phone}')" id="customer-row-${c.phone}">
                <div class="chat-item-header">
                    <span class="chat-item-phone">${escapeHtml(c.name || c.phone)}</span>
                    <span class="badge-human-needs" style="background: var(--bg-card); color: var(--text-secondary); border-color: var(--border-color);">${c.total_orders} pedidos</span>
                </div>
                <div class="chat-item-msg">
                    Gastado: $${c.total_spent.toFixed(2)} | Última nota: ${escapeHtml(c.bot_notes || 'Sin notas')}
                </div>
            </div>
        `).join('');
    } catch (error) {
        list.innerHTML = '<div class="loading">Error al cargar clientes</div>';
        console.error(error);
    }
}

let currentCustomerPhone = null;

async function openCustomerProfile(phone) {
    currentCustomerPhone = phone;
    
    // UI active state
    document.querySelectorAll('#customersList .chat-list-item').forEach(el => el.classList.remove('active'));
    const row = document.getElementById(`customer-row-${phone}`);
    if (row) row.classList.add('active');

    document.getElementById('customerPlaceholder').style.display = 'none';
    const detail = document.getElementById('customerDetail');
    detail.style.display = 'flex';

    detail.style.opacity = '0.5';

    try {
        // Obtenemos los clientes y filtramos (podríamos crear un endpoint GET /:phone, pero getAll es rápido)
        const res = await fetch('/api/customers');
        const customers = await res.json();
        const customer = customers.find(c => c.phone === phone);

        if (!customer) return;

        document.getElementById('cdName').textContent = customer.name || 'Cliente sin nombre';
        document.getElementById('cdPhone').textContent = customer.phone;
        document.getElementById('cdBotNotes').value = customer.bot_notes || '';

        // Cargar historial de pedidos
        const orderRes = await fetch(`/api/customers/${encodeURIComponent(phone)}/orders`);
        const orders = await orderRes.json();

        const ordersContainer = document.getElementById('cdOrdersList');
        if (!Array.isArray(orders) || orders.length === 0) {
            ordersContainer.innerHTML = '<p style="color: var(--text-muted);">Sin pedidos entregados.</p>';
        } else {
            ordersContainer.innerHTML = orders.map(o => {
                const date = new Date(o.created_at).toLocaleDateString('es-UY') + ' ' + new Date(o.created_at).toLocaleTimeString('es-UY', {hour:'2-digit', minute:'2-digit'});
                const itemsStr = (o.items || []).map(i => `${i.quantity}x ${i.product_name}`).join(', ');
                return `
                    <div style="background: var(--bg-surface); padding: 12px; border-radius: 8px; border: 1px solid var(--border-color);">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                            <strong>Pedido N° ${o.order_number}</strong>
                            <span style="color: var(--text-muted); font-size: 0.85rem;">${date}</span>
                        </div>
                        <div style="font-size: 0.9rem; margin-bottom: 5px;">${itemsStr}</div>
                        <div style="color: var(--accent-green); font-weight: 600;">$${o.total}</div>
                    </div>
                `;
            }).join('');
        }

        detail.style.opacity = '1';
    } catch (error) {
        console.error(error);
        showToast('Error al cargar perfil', 'error');
    }
}

async function saveCustomerNotes() {
    if (!currentCustomerPhone) return;

    const notes = document.getElementById('cdBotNotes').value;
    
    try {
        const res = await fetch(`/api/customers/${encodeURIComponent(currentCustomerPhone)}/notes`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ notes })
        });

        if (res.ok) {
            showToast('✅ Notas guardadas. La IA ya las conoce.', 'success');
            loadCustomers(); // Refrescar lista lateral
        } else {
            showToast('❌ Error al guardar', 'error');
        }
    } catch (error) {
        showToast('❌ Error al guardar', 'error');
        console.error(error);
    }
}

// connectBaileysQR fue reemplazado por la versión multitenant connectBaileysQRForConnection

// ─── Control ON/OFF del Bot ────────────────────────────────────────────────

/**
 * Actualiza visualmente el badge y los botones según el estado del bot.
 */
function _updateBotStatusUI(active) {
    const badge  = document.getElementById('botStatusBadge');
    const dot    = document.getElementById('botStatusDot');
    const text   = document.getElementById('botStatusText');
    const btnOff = document.getElementById('botToggleOffBtn');
    const btnOn  = document.getElementById('botToggleOnBtn');

    if (!badge) return;

    if (active) {
        badge.style.background = '#dcfce7';
        badge.style.color = '#16a34a';
        dot.style.background = '#16a34a';
        text.textContent = 'Encendido';
        btnOff.style.display = 'inline-flex';
        btnOn.style.display  = 'none';
    } else {
        badge.style.background = '#fee2e2';
        badge.style.color = '#dc2626';
        dot.style.background = '#dc2626';
        text.textContent = 'Apagado';
        btnOff.style.display = 'none';
        btnOn.style.display  = 'inline-flex';
    }
}

/**
 * Carga el estado actual del bot desde la API y actualiza la UI.
 */
async function loadBotStatus() {
    try {
        const res = await fetch('/api/whatsapp/bot-status');
        if (!res.ok) return;
        const { active } = await res.json();
        _updateBotStatusUI(active);
    } catch (e) {
        console.error('Error cargando estado del bot:', e);
    }
}

/**
 * Llama a la API para encender o apagar el bot.
 * @param {boolean} active
 */
async function toggleBot(active) {
    const btnOff = document.getElementById('botToggleOffBtn');
    const btnOn  = document.getElementById('botToggleOnBtn');
    if (btnOff) btnOff.disabled = true;
    if (btnOn)  btnOn.disabled  = true;

    try {
        const res = await fetch('/api/whatsapp/bot-toggle', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ active })
        });
        const result = await res.json();

        if (res.ok) {
            _updateBotStatusUI(result.active);
            showToast(result.active ? '✅ Bot encendido' : '🔕 Bot apagado', result.active ? 'success' : 'info');
        } else {
            showToast('❌ Error: ' + result.error, 'error');
        }
    } catch (e) {
        showToast('❌ Error de conexión', 'error');
        console.error(e);
    } finally {
        if (btnOff) btnOff.disabled = false;
        if (btnOn)  btnOn.disabled  = false;
    }
}

// ─── Base de Datos Externa ──────────────────────

let dbConnectionData = null;

/**
 * Probar conexión a base de datos externa.
 */
async function testDbConnection(e) {
    e.preventDefault();
    
    const btn = document.getElementById('btnTestDb');
    btn.disabled = true;
    btn.textContent = '⏳ Conectando...';
    
    const dbType = document.getElementById('dbType').value;
    const host = document.getElementById('dbHost').value;
    const port = document.getElementById('dbPort').value;
    const database = document.getElementById('dbDatabase').value;
    const username = document.getElementById('dbUsername').value;
    const password = document.getElementById('dbPassword').value;
    
    // Validar puerto por defecto según tipo
    let defaultPort = 3306;
    if (dbType === 'postgresql') defaultPort = 5432;
    
    dbConnectionData = {
        dbType,
        host: host || 'localhost',
        port: parseInt(port) || defaultPort,
        database,
        username: username || (dbType === 'sqlite' ? '' : 'root'),
        password
    };
    
    const resultDiv = document.getElementById('dbConnectionResult');
    
    try {
        const res = await fetch('/api/db-connect/test', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dbConnectionData)
        });
        
        const data = await res.json();
        
        if (res.ok && data.success) {
            resultDiv.style.display = 'block';
            resultDiv.style.background = '#dcfce7';
            resultDiv.style.color = '#16a34a';
            resultDiv.innerHTML = '✅ Conexión exitosa. Cargando tablas...';
            
            // Cargar tablas
            await loadDbTables();
            
            // Mostrar sección de importación
            document.getElementById('dbImportSection').style.display = 'block';
        } else {
            resultDiv.style.display = 'block';
            resultDiv.style.background = '#fee2e2';
            resultDiv.style.color = '#dc2626';
            resultDiv.innerHTML = '❌ Error: ' + (data.error || 'No se pudo conectar');
        }
    } catch (error) {
        resultDiv.style.display = 'block';
        resultDiv.style.background = '#fee2e2';
        resultDiv.style.color = '#dc2626';
        resultDiv.innerHTML = '❌ Error de conexión: ' + error.message;
    } finally {
        btn.disabled = false;
        btn.textContent = '🔌 Probar Conexión';
    }
}

/**
 * Cargar tablas de la BD externa.
 */
async function loadDbTables() {
    if (!dbConnectionData) return;
    
    const tableSelect = document.getElementById('dbTable');
    tableSelect.innerHTML = '<option value="">Cargando tablas...</option>';
    
    try {
        const params = new URLSearchParams(dbConnectionData);
        const res = await fetch(`/api/db-connect/tables?${params}`);
        const data = await res.json();
        
        tableSelect.innerHTML = '<option value="">Seleccionar tabla...</option>';
        
        if (data.tables && data.tables.length > 0) {
            data.tables.forEach(table => {
                const opt = document.createElement('option');
                opt.value = table;
                opt.textContent = table;
                tableSelect.appendChild(opt);
            });
            
            // Listener para cuando seleccione una tabla
            tableSelect.onchange = async () => {
                if (tableSelect.value) {
                    await loadDbColumns(tableSelect.value);
                }
            };
        } else {
            tableSelect.innerHTML = '<option value="">No se encontraron tablas</option>';
        }
    } catch (error) {
        tableSelect.innerHTML = '<option value="">Error al cargar tablas</option>';
        console.error('Error loading tables:', error);
    }
}

/**
 * Cargar columnas de una tabla.
 */
async function loadDbColumns(tableName) {
    if (!dbConnectionData || !tableName) return;
    
    const mappingDiv = document.getElementById('dbColumnsMapping');
    mappingDiv.style.display = 'none';
    
    try {
        const params = new URLSearchParams(dbConnectionData);
        const res = await fetch(`/api/db-connect/schema/${tableName}?${params}`);
        const data = await res.json();
        
        if (data.columns && data.columns.length > 0) {
            // Llenar todos los selects de mapeo
            const mapSelects = document.querySelectorAll('.column-map');
            mapSelects.forEach(select => {
                select.innerHTML = '<option value="">Ninguna</option>';
                data.columns.forEach(col => {
                    const opt = document.createElement('option');
                    opt.value = col.name;
                    opt.textContent = `${col.name} (${col.type})`;
                    select.appendChild(opt);
                });
            });
            
            // Auto-detectar columnas por nombre
            autoMapColumns(data.columns);
            
            mappingDiv.style.display = 'block';
        }
    } catch (error) {
        console.error('Error loading columns:', error);
        showToast('❌ Error al cargar columnas', 'error');
    }
}

/**
 * Auto-detectar mapeo de columnas por nombre.
 */
function autoMapColumns(columns) {
    const colNames = columns.map(c => c.name.toLowerCase());
    
    // Mapeos posibles para nombre
    const nameMappings = ['nombre', 'name', 'producto', 'product', 'descripcion', 'titulo', 'title'];
    // Mapeos posibles para precio
    const priceMappings = ['precio', 'price', 'costo', 'cost', 'valor', 'amount'];
    // Mapeos posibles para descripción
    const descMappings = ['descripcion', 'description', 'desc', 'detalle', 'detail', 'obs'];
    // Mapeos posibles para categoría
    const catMappings = ['categoria', 'category', 'cat', 'tipo', 'type', 'grupo', 'group'];
    
    const findMatch = (mappings) => {
        for (const m of mappings) {
            const idx = colNames.findIndex(c => c.includes(m));
            if (idx !== -1) return columns[idx].name;
        }
        return '';
    };
    
    document.getElementById('mapName').value = findMatch(nameMappings);
    document.getElementById('mapPrice').value = findMatch(priceMappings);
    document.getElementById('mapDescription').value = findMatch(descMappings);
    document.getElementById('mapCategory').value = findMatch(catMappings);
}

/**
 * Vista previa de datos de la tabla.
 */
async function previewDbData() {
    if (!dbConnectionData) return;
    
    const table = document.getElementById('dbTable').value;
    if (!table) {
        showToast('⚠️ Seleccioná una tabla primero', 'error');
        return;
    }
    
    try {
        const res = await fetch('/api/db-connect/preview', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...dbConnectionData, table, limit: 5 })
        });
        
        const data = await res.json();
        
        if (data.rows && data.rows.length > 0) {
            const previewDiv = document.getElementById('dbPreview');
            const tableEl = document.getElementById('dbPreviewTable');
            
            // Crear tabla HTML
            const headers = Object.keys(data.rows[0]);
            let html = '<thead><tr>';
            headers.forEach(h => {
                html += `<th style="padding: 8px; border-bottom: 2px solid var(--border-color); text-align: left;">${h}</th>`;
            });
            html += '</tr></thead><tbody>';
            
            data.rows.forEach(row => {
                html += '<tr>';
                headers.forEach(h => {
                    html += `<td style="padding: 8px; border-bottom: 1px solid var(--border-color);">${row[h] || ''}</td>`;
                });
                html += '</tr>';
            });
            html += '</tbody>';
            
            tableEl.innerHTML = html;
            previewDiv.style.display = 'block';
        } else {
            showToast('⚠️ No se encontraron datos', 'info');
        }
    } catch (error) {
        showToast('❌ Error al obtener preview', 'error');
        console.error('Preview error:', error);
    }
}

/**
 * Importar productos desde la BD externa.
 */
async function importDbProducts() {
    if (!dbConnectionData) return;
    
    const table = document.getElementById('dbTable').value;
    const nameCol = document.getElementById('mapName').value;
    const priceCol = document.getElementById('mapPrice').value;
    const descCol = document.getElementById('mapDescription').value;
    const catCol = document.getElementById('mapCategory').value;
    
    if (!table || !nameCol || !priceCol) {
        showToast('⚠️ Completá la tabla, nombre y precio', 'error');
        return;
    }
    
    if (!confirm('¿Importar productos desde esta tabla? Se agregarán a tu catálogo actual.')) {
        return;
    }
    
    try {
        const res = await fetch('/api/db-connect/import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ...dbConnectionData,
                table,
                columnMapping: {
                    nombre: nameCol,
                    precio: priceCol,
                    descripcion: descCol || null,
                    categoria: catCol || null
                }
            })
        });
        
        const data = await res.json();
        
        const resultDiv = document.getElementById('dbImportResult');
        resultDiv.style.display = 'block';
        
        if (res.ok && data.success) {
            resultDiv.style.background = '#dcfce7';
            resultDiv.style.color = '#16a34a';
            resultDiv.innerHTML = `✅ ${data.message}`;
            showToast(`✅ ${data.imported} productos importados`, 'success');
            
            // Recargar productos
            loadProducts();
        } else {
            resultDiv.style.background = '#fee2e2';
            resultDiv.style.color = '#dc2626';
            resultDiv.innerHTML = '❌ Error: ' + (data.error || 'Error al importar');
        }
    } catch (error) {
        showToast('❌ Error al importar', 'error');
        console.error('Import error:', error);
    }
}

// ─── Modo Clínica / Citas ────────────────────────────

let clinicModeEnabled = false;

/**
 * Cargar estado del modo clínica al iniciar.
 */
async function loadClinicMode() {
    try {
        const res = await fetch('/api/store');
        if (res.ok) {
            const store = await res.json();
            clinicModeEnabled = store.clinic_mode === 1;
            updateClinicModeUI();
            
            // Cargar configuración de horarios
            if (clinicModeEnabled) {
                document.getElementById('storeWorkingHours').value = store.working_hours || '08:00-20:00';
                document.getElementById('storeSlotDuration').value = store.slot_duration || 30;
            }
        }
    } catch (e) {
        console.error("Error al cargar modo clínica", e);
    }
}

/**
 * Actualizar UI según modo clínica.
 */
function updateClinicModeUI() {
    const badge = document.getElementById('clinicModeBadge');
    const dot = document.getElementById('clinicModeDot');
    const text = document.getElementById('clinicModeText');
    const onBtn = document.getElementById('clinicModeOnBtn');
    const offBtn = document.getElementById('clinicModeOffBtn');
    const clinicSettings = document.getElementById('clinicSettingsCard');
    const appointmentsTab = document.getElementById('tab-appointments-btn');

    if (clinicModeEnabled) {
        badge.style.background = '#dbeafe';
        badge.style.color = '#2563eb';
        dot.style.background = '#2563eb';
        text.textContent = 'Modo: Clínica';
        onBtn.style.display = 'none';
        offBtn.style.display = 'block';
        clinicSettings.style.display = 'block';
        appointmentsTab.style.display = 'block';
    } else {
        badge.style.background = '#dcfce7';
        badge.style.color = '#16a34a';
        dot.style.background = '#16a34a';
        text.textContent = 'Modo: Tienda';
        onBtn.style.display = 'block';
        offBtn.style.display = 'none';
        clinicSettings.style.display = 'none';
        appointmentsTab.style.display = 'none';
    }
}

/**
 * Alternar modo clínica.
 */
async function toggleClinicMode(enable) {
    try {
        const res = await fetch('/api/store/clinic-mode', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ clinic_mode: enable ? 1 : 0 })
        });

        if (res.ok) {
            clinicModeEnabled = enable;
            updateClinicModeUI();
            showToast(enable ? '🏥 Modo Clínica activado' : '🏪 Modo Tienda activado', 'success');
            
            if (enable) {
                loadAppointments();
            }
        }
    } catch (e) {
        showToast('❌ Error al cambiar modo', 'error');
    }
}

/**
 * Guardar configuración de horarios de clínica.
 */
async function saveClinicSettings() {
    try {
        const workingHours = document.getElementById('storeWorkingHours').value;
        const slotDuration = document.getElementById('storeSlotDuration').value;

        const res = await fetch('/api/store/clinic-settings', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ working_hours: workingHours, slot_duration: parseInt(slotDuration) })
        });

        if (res.ok) {
            showToast('✅ Configuración de horarios guardada', 'success');
        }
    } catch (e) {
        showToast('❌ Error al guardar configuración', 'error');
    }
}

// ─── CRUD de Citas ────────────────────────────────────

let allAppointments = [];

/**
 * Cargar citas del día.
 */
let calendar = null;

async function loadAppointments() {
    const calendarEl = document.getElementById('appointmentsCalendar');
    if (!calendarEl) return;

    if (!calendar) {
        calendar = new FullCalendar.Calendar(calendarEl, {
            initialView: 'timeGridWeek',
            headerToolbar: {
                left: 'prev,next today',
                center: 'title',
                right: 'dayGridMonth,timeGridWeek,timeGridDay,listWeek'
            },
            locale: 'es',
            buttonText: {
                today: 'Hoy',
                month: 'Mes',
                week: 'Semana',
                day: 'Día',
                list: 'Lista'
            },
            slotMinTime: '08:00:00',
            slotMaxTime: '22:00:00',
            expandRows: true,
            events: async function(info, successCallback, failureCallback) {
                try {
                    const res = await fetch('/api/appointments/calendar');
                    if (!res.ok) throw new Error('Error al cargar calendario');
                    const events = await res.json();
                    
                    const statusFilter = document.getElementById('appointmentStatusFilter').value;
                    const filteredEvents = statusFilter 
                        ? events.filter(e => e.extendedProps.status === statusFilter)
                        : events;
                        
                    successCallback(filteredEvents);
                } catch (e) {
                    console.error(e);
                    failureCallback(e);
                }
            },
            eventClick: function(info) {
                const props = info.event.extendedProps;
                
                // Mostrar formulario y prepoblar datos
                showNewAppointmentForm();
                document.getElementById('aptFormTitle').innerHTML = '✏️ Editar Cita';
                
                document.getElementById('appointmentId').value = info.event.id;
                document.getElementById('aptCustomerPhone').value = props.phone;
                document.getElementById('aptCustomerName').value = info.event.title.split(' - ')[0] || '';
                
                // Setear servicio
                const serviceSelect = document.getElementById('aptService');
                const serviceOption = Array.from(serviceSelect.options).find(opt => opt.value === props.service);
                if (serviceOption) serviceSelect.value = props.service;

                // Setear doctor
                if (props.doctor) {
                    const doctorSelect = document.getElementById('aptDoctor');
                    const docOption = Array.from(doctorSelect.options).find(opt => opt.value === props.doctor);
                    if (docOption) doctorSelect.value = props.doctor;
                }

                // Setear fecha y cargar slots, y luego setear hora
                const dateStr = info.event.startStr.split('T')[0];
                const timeStr = info.event.startStr.split('T')[1].substring(0, 5);
                
                document.getElementById('aptDate').value = dateStr;
                
                // Necesitamos cargar los slots disponibles primero, pero como estamos editando y ya tiene un slot tomado, 
                // agregamos la hora actual al select si no está para que pueda dejarla como estaba.
                const timeSelect = document.getElementById('aptTime');
                timeSelect.innerHTML = `<option value="${timeStr}">${timeStr} (Actual)</option>`;
                timeSelect.value = timeStr;
                
                // Disparar carga de slots (opcionalmente asincrono)
                loadAvailableSlots().then(() => {
                    // Después de cargar slots, nos aseguramos que su hora esté seleccionada si aún es válida,
                    // o la inyectamos si la API de slots dice que está ocupada (pero es de él mismo)
                    if (!Array.from(timeSelect.options).find(opt => opt.value === timeStr)) {
                        const opt = document.createElement('option');
                        opt.value = timeStr;
                        opt.textContent = `${timeStr} (Actual)`;
                        timeSelect.appendChild(opt);
                    }
                    timeSelect.value = timeStr;
                });

                document.getElementById('aptNotes').value = props.notes || '';
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
        });
        calendar.render();
    } else {
        calendar.refetchEvents();
    }
}

function renderAppointments(appointments) {
    // Obsoleto, FullCalendar lo maneja
}

/**
 * Filtrar citas.
 */
function filterAppointments() {
    const dateVal = document.getElementById('appointmentDateFilter').value;
    if (dateVal && calendar) {
        calendar.gotoDate(dateVal);
    }
    loadAppointments();
}

/**
 * Mostrar formulario de nueva cita.
 */
function showNewAppointmentForm() {
    document.getElementById('newAppointmentForm').style.display = 'block';
    document.getElementById('aptFormTitle').textContent = '➕ Nueva Cita';
    loadServicesForSelect();
}

/**
 * Ocultar formulario de cita.
 */
function resetAppointmentForm() {
    document.getElementById('newAppointmentForm').style.display = 'none';
    document.getElementById('appointmentForm').reset();
    document.getElementById('appointmentId').value = '';
}

/**
 * Cargar servicios y doctores en selects.
 */
async function loadServicesForSelect() {
    try {
        const [resServ, resDoc] = await Promise.all([
            fetch('/api/appointments/services'),
            fetch('/api/appointments/doctors')
        ]);
        const dataServ = await resServ.json();
        const dataDoc = await resDoc.json();
        
        const select = document.getElementById('aptService');
        select.innerHTML = '<option value="">Seleccionar servicio...</option>';
        if (dataServ.services && dataServ.services.length > 0) {
            dataServ.services.forEach(s => {
                const opt = document.createElement('option');
                opt.value = s.name;
                opt.textContent = `${s.name} - $${s.price || 0} (${s.duration || 30}min)`;
                opt.dataset.duration = s.duration || 30;
                opt.dataset.price = s.price || 0;
                select.appendChild(opt);
            });
        }

        const selectDoc = document.getElementById('aptDoctor');
        selectDoc.innerHTML = '<option value="">Sin preferencia / Cualquier doctor</option>';
        if (dataDoc.doctors && dataDoc.doctors.length > 0) {
            // Solo mostrar doctores activos
            dataDoc.doctors.filter(d => d.active).forEach(d => {
                const opt = document.createElement('option');
                opt.value = d.name;
                opt.textContent = `${d.name} ${d.specialty ? `(${d.specialty})` : ''}`;
                selectDoc.appendChild(opt);
            });
        }
    } catch (e) {
        console.error("Error al cargar servicios y doctores", e);
    }
}

/**
 * Cargar horarios disponibles para la fecha seleccionada.
 */
async function loadAvailableSlots() {
    const date = document.getElementById('aptDate').value;
    if (!date) return;

    try {
        const res = await fetch(`/api/appointments/available-slots?date=${date}`);
        const data = await res.json();
        
        const select = document.getElementById('aptTime');
        select.innerHTML = '<option value="">Seleccionar hora...</option>';
        
        if (data.slots) {
            data.slots.forEach(slot => {
                const opt = document.createElement('option');
                opt.value = slot.time;
                opt.textContent = slot.time;
                opt.disabled = !slot.available;
                if (!slot.available) {
                    opt.textContent += ' (Ocupado)';
                    opt.style.color = '#9ca3af';
                }
                select.appendChild(opt);
            });
        }
    } catch (e) {
        console.error("Error al cargar horarios", e);
    }
}

/**
 * Guardar cita (crear o actualizar).
 */
async function saveAppointment(event) {
    event.preventDefault();
    
    const appointmentId = document.getElementById('appointmentId').value;
    const serviceSelect = document.getElementById('aptService');
    const selectedOption = serviceSelect.options[serviceSelect.selectedIndex];
    
    const data = {
        customerPhone: document.getElementById('aptCustomerPhone').value,
        customerName: document.getElementById('aptCustomerName').value,
        service: serviceSelect.value,
        date: document.getElementById('aptDate').value,
        time: document.getElementById('aptTime').value,
        duration: parseInt(selectedOption?.dataset?.duration || 30),
        notes: document.getElementById('aptNotes').value,
        doctor: document.getElementById('aptDoctor').value
    };

    try {
        const url = appointmentId ? `/api/appointments/${appointmentId}` : '/api/appointments';
        const method = appointmentId ? 'PUT' : 'POST';
        
        const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        if (res.ok) {
            showToast(appointmentId ? '✅ Cita actualizada' : '✅ Cita creada', 'success');
            resetAppointmentForm();
            loadAppointments();
        } else {
            const err = await res.json();
            showToast(`❌ ${err.error || 'Error al guardar cita'}`, 'error');
        }
    } catch (e) {
        showToast('❌ Error al guardar cita', 'error');
    }
}

/**
 * Confirmar una cita.
 */
async function confirmAppointment(id) {
    try {
        const res = await fetch(`/api/appointments/${id}/confirm`, { method: 'PUT' });
        if (res.ok) {
            showToast('✅ Cita confirmada', 'success');
            loadAppointments();
        }
    } catch (e) {
        showToast('❌ Error al confirmar', 'error');
    }
}

/**
 * Completar una cita.
 */
async function completeAppointment(id) {
    try {
        const res = await fetch(`/api/appointments/${id}/complete`, { method: 'PUT' });
        if (res.ok) {
            showToast('✅ Cita completada', 'success');
            loadAppointments();
        }
    } catch (e) {
        showToast('❌ Error al completar', 'error');
    }
}

/**
 * Cancelar una cita.
 */
async function cancelAppointment(id) {
    if (!confirm('¿Estás seguro de cancelar esta cita?')) return;
    
    try {
        const res = await fetch(`/api/appointments/${id}/cancel`, { method: 'PUT' });
        if (res.ok) {
            showToast('❌ Cita cancelada', 'success');
            loadAppointments();
        }
    } catch (e) {
        showToast('❌ Error al cancelar', 'error');
    }
}

/**
 * Reagendar una cita.
 */
async function rescheduleAppointment(id, currentDate, currentTime) {
    const newDate = prompt('Nueva fecha (YYYY-MM-DD):', currentDate);
    if (!newDate) return;
    
    const newTime = prompt('Nueva hora (HH:MM):', currentTime);
    if (!newTime) return;

    try {
        const res = await fetch(`/api/appointments/${id}/reschedule`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ date: newDate, time: newTime })
        });
        
        if (res.ok) {
            showToast('📅 Cita reagendada', 'success');
            loadAppointments();
        } else {
            const err = await res.json();
            showToast(`❌ ${err.error || 'Error al reagendar'}`, 'error');
        }
    } catch (e) {
        showToast('❌ Error al reagendar', 'error');
    }
}

// ─── Excel Import/Export ────────────────────────────

let excelPreviewData = null;
let excelHeaders = [];

/**
 * Subir archivo Excel para previsualizar.
 */
async function uploadExcel(event) {
    event.preventDefault();
    
    const fileInput = document.getElementById('excelFileInput');
    if (!fileInput.files.length) {
        showToast('❌ Seleccioná un archivo', 'error');
        return;
    }

    const formData = new FormData();
    formData.append('excelFile', fileInput.files[0]);

    const btn = document.getElementById('btnUploadExcel');
    btn.disabled = true;
    btn.textContent = '📤 Procesando...';

    try {
        const res = await fetch('/api/excel/preview', {
            method: 'POST',
            body: formData
        });

        const data = await res.json();

        if (res.ok && data.success) {
            excelHeaders = data.headers;
            excelPreviewData = data.preview;
            
            // Mostrar sección de mapeo
            document.getElementById('excelPreviewSection').style.display = 'block';
            
            // Llenar selects de mapeo
            populateMappingSelects(data.headers);
            
            // Mostrar vista previa
            renderExcelPreview(data.preview, data.headers);
            
            showToast(`✅ Archivo cargado: ${data.totalRows} filas`, 'success');
        } else {
            showToast(`❌ ${data.error || 'Error al procesar archivo'}`, 'error');
        }
    } catch (e) {
        showToast('❌ Error al subir archivo', 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = '📤 Subir y Previsualizar';
    }
}

/**
 * Llenar selects de mapeo de columnas.
 */
function populateMappingSelects(headers) {
    const selects = ['excelMapName', 'excelMapPrice', 'excelMapDescription', 'excelMapCategory', 'excelMapIsService', 'excelMapDuration'];
    
    selects.forEach(selectId => {
        const select = document.getElementById(selectId);
        select.innerHTML = '<option value="">No mapear</option>';
        
        headers.forEach(header => {
            const opt = document.createElement('option');
            opt.value = header;
            opt.textContent = header;
            
            // Auto-seleccionar basado en nombre
            const lowerHeader = header.toLowerCase();
            if (selectId === 'excelMapName' && (lowerHeader.includes('nombre') || lowerHeader.includes('name') || lowerHeader.includes('producto'))) {
                opt.selected = true;
            } else if (selectId === 'excelMapPrice' && (lowerHeader.includes('precio') || lowerHeader.includes('price') || lowerHeader.includes('costo'))) {
                opt.selected = true;
            } else if (selectId === 'excelMapDescription' && (lowerHeader.includes('desc') || lowerHeader.includes('detalle'))) {
                opt.selected = true;
            } else if (selectId === 'excelMapCategory' && (lowerHeader.includes('categ') || lowerHeader.includes('tipo') || lowerHeader.includes('category'))) {
                opt.selected = true;
            } else if (selectId === 'excelMapIsService' && (lowerHeader.includes('servicio') || lowerHeader.includes('service') || lowerHeader.includes('es servicio'))) {
                opt.selected = true;
            } else if (selectId === 'excelMapDuration' && (lowerHeader.includes('durac') || lowerHeader.includes('tiempo') || lowerHeader.includes('minutos'))) {
                opt.selected = true;
            }
            
            select.appendChild(opt);
        });
    });
}

/**
 * Renderizar vista previa de datos Excel.
 */
function renderExcelPreview(rows, headers) {
    const container = document.getElementById('excelDataPreview');
    const table = document.getElementById('excelPreviewTable');
    
    container.style.display = 'block';
    
    let html = '<thead><tr>';
    headers.forEach(h => {
        html += `<th style="padding: 8px 12px; text-align: left; border-bottom: 1px solid var(--border-color); background: var(--bg-surface);">${escapeHtml(h)}</th>`;
    });
    html += '</tr></thead><tbody>';
    
    rows.forEach(row => {
        html += '<tr>';
        headers.forEach(h => {
            html += `<td style="padding: 8px 12px; border-bottom: 1px solid var(--border-color);">${escapeHtml(String(row[h] || ''))}</td>`;
        });
        html += '</tr>';
    });
    
    html += '</tbody>';
    table.innerHTML = html;
}

/**
 * Importar productos desde Excel.
 */
async function importExcelProducts() {
    const nameCol = document.getElementById('excelMapName').value;
    const priceCol = document.getElementById('excelMapPrice').value;
    const isServiceCol = document.getElementById('excelMapIsService').value;
    const durationCol = document.getElementById('excelMapDuration').value;
    
    if (!nameCol || !priceCol) {
        showToast('❌ Mapeá al menos Nombre y Precio', 'error');
        return;
    }

    const btn = document.getElementById('btnImportExcel');
    btn.disabled = true;
    btn.textContent = '📥 Importando...';

    try {
        const fileInput = document.getElementById('excelFileInput');
        const formData = new FormData();
        formData.append('excelFile', fileInput.files[0]);
        
        // Primero subir el archivo de nuevo para tenerlo
        const uploadRes = await fetch('/api/excel/preview', { method: 'POST', body: formData });
        const uploadData = await uploadRes.json();
        
        if (!uploadData.success) {
            throw new Error('Error al procesar archivo');
        }

        // Ahora importar
        const res = await fetch('/api/excel/import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                columnMapping: {
                    name: nameCol,
                    price: priceCol,
                    description: document.getElementById('excelMapDescription').value || null,
                    category: document.getElementById('excelMapCategory').value || null,
                    is_service: isServiceCol || null,
                    duration: durationCol || null
                },
                filename: uploadData.filename || 'temp'
            })
        });

        const data = await res.json();
        
        const resultDiv = document.getElementById('excelImportResult');
        resultDiv.style.display = 'block';
        
        if (res.ok && data.success) {
            resultDiv.style.background = '#dcfce7';
            resultDiv.style.color = '#16a34a';
            resultDiv.innerHTML = `✅ Importación completada: ${data.imported} productos importados, ${data.skipped} saltados`;
            showToast(`✅ ${data.imported} productos importados`, 'success');
            loadProducts();
        } else {
            resultDiv.style.background = '#fee2e2';
            resultDiv.style.color = '#dc2626';
            resultDiv.innerHTML = `❌ ${data.error || 'Error al importar'}`;
        }
    } catch (e) {
        showToast('❌ Error al importar', 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = '📥 Importar Productos';
    }
}

/**
 * Exportar productos a Excel/CSV.
 */
function exportExcel(format) {
    showToast('📥 Descargando archivo...', 'success');
    window.location.href = `/api/excel/export?format=${format}`;
}

// ─── DOCTORES CRUD ────────────────────────────

async function loadDoctors() {
    try {
        const res = await fetch('/api/appointments/doctors');
        const data = await res.json();
        
        const tbody = document.getElementById('doctorsTableBody');
        tbody.innerHTML = '';
        
        if (!data.doctors || data.doctors.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center">No hay profesionales registrados</td></tr>';
            return;
        }

        data.doctors.forEach(doc => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${doc.name}</strong></td>
                <td>${doc.specialty || '-'}</td>
                <td>
                    <label class="toggle-switch">
                        <input type="checkbox" onchange="toggleDoctor(${doc.id}, this.checked)" ${doc.active ? 'checked' : ''}>
                        <span class="slider"></span>
                    </label>
                </td>
                <td>
                    <button class="btn btn-sm btn-secondary" onclick="editDoctor(${doc.id}, '${doc.name.replace(/'/g, "\\'")}', '${(doc.specialty || '').replace(/'/g, "\\'")}', ${doc.active})">✏️ Editar</button>
                    <button class="btn btn-sm btn-danger" onclick="deleteDoctor(${doc.id})">🗑️ Borrar</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (error) {
        console.error('Error cargando doctores:', error);
    }
}

async function saveDoctor(event) {
    event.preventDefault();
    const id = document.getElementById('doctorId').value;
    const name = document.getElementById('docName').value;
    const specialty = document.getElementById('docSpecialty').value;

    const data = { name, specialty };

    try {
        const res = await fetch(id ? `/api/appointments/doctors/${id}` : '/api/appointments/doctors', {
            method: id ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        if (res.ok) {
            resetDoctorForm();
            loadDoctors();
        } else {
            alert('Error al guardar el profesional');
        }
    } catch (e) {
        console.error(e);
        alert('Error al guardar el profesional');
    }
}

function editDoctor(id, name, specialty, active) {
    document.getElementById('doctorId').value = id;
    document.getElementById('docName').value = name;
    document.getElementById('docSpecialty').value = specialty;
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function deleteDoctor(id) {
    if (!confirm('¿Seguro que quieres eliminar a este profesional?')) return;
    try {
        const res = await fetch(`/api/appointments/doctors/${id}`, { method: 'DELETE' });
        if (res.ok) {
            loadDoctors();
        } else {
            alert('Error al eliminar');
        }
    } catch (e) {
        console.error(e);
    }
}

async function toggleDoctor(id, active) {
    try {
        // Obtenemos los valores actuales
        const resGet = await fetch('/api/appointments/doctors');
        const dataGet = await resGet.json();
        const doc = dataGet.doctors.find(d => d.id === id);
        if (!doc) return;

        await fetch(`/api/appointments/doctors/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: doc.name, specialty: doc.specialty, active })
        });
    } catch (e) {
        console.error('Error al cambiar estado del doctor:', e);
    }
}

function resetDoctorForm() {
    document.getElementById('doctorForm').reset();
    document.getElementById('doctorId').value = '';
}

// ─── MODO HOSTEL ──────────────────────────────────────────

let hostelModeEnabled = false;

async function loadHostelMode() {
    try {
        const res = await fetch('/api/store');
        if (res.ok) {
            const store = await res.json();
            hostelModeEnabled = store.hostel_mode === 1;
            updateHostelModeUI();
        }
    } catch (e) {
        console.error("Error al cargar modo hostel", e);
    }
}

function updateHostelModeUI() {
    const badge = document.getElementById('hostelModeBadge');
    const dot = document.getElementById('hostelModeDot');
    const text = document.getElementById('hostelModeText');
    const onBtn = document.getElementById('hostelModeOnBtn');
    const offBtn = document.getElementById('hostelModeOffBtn');
    const bookingsTab = document.getElementById('tab-bookings-btn');

    if (hostelModeEnabled) {
        if (badge) {
            badge.style.background = '#fef3c7';
            badge.style.color = '#d97706';
            if (dot) dot.style.background = '#d97706';
            if (text) text.textContent = 'Modo: Hostel';
        }
        if (onBtn) onBtn.style.display = 'none';
        if (offBtn) offBtn.style.display = 'block';
        if (bookingsTab) bookingsTab.style.display = 'block';
    } else {
        if (badge) {
            badge.style.background = '#dcfce7';
            badge.style.color = '#16a34a';
            if (dot) dot.style.background = '#16a34a';
            if (text) text.textContent = 'Modo: Tienda';
        }
        if (onBtn) onBtn.style.display = 'block';
        if (offBtn) offBtn.style.display = 'none';
        if (bookingsTab) bookingsTab.style.display = 'none';
    }
}

async function toggleHostelMode(enable) {
    try {
        const res = await fetch('/api/store/hostel-mode', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ hostel_mode: enable ? 1 : 0 })
        });

        if (res.ok) {
            hostelModeEnabled = enable;
            updateHostelModeUI();
            showToast(enable ? '🏨 Modo Hostel activado' : '🏪 Modo Tienda activado', 'success');
            if (enable) {
                loadBookings();
            }
        }
    } catch (e) {
        showToast('❌ Error al cambiar modo hostel', 'error');
    }
}

let currentRoomTypes = [];

async function loadRoomTypes() {
    try {
        const res = await fetch('/api/rooms/types');
        if (!res.ok) return;
        currentRoomTypes = await res.json();

        // Popular el select de tipo de habitación en el formulario
        const roomTypeSelect = document.getElementById('roomType');
        if (roomTypeSelect) {
            const currentVal = roomTypeSelect.value;
            roomTypeSelect.innerHTML = currentRoomTypes.map(t => 
                `<option value="${t.id}">${escapeHtml(t.name)}</option>`
            ).join('');
            if (currentVal) roomTypeSelect.value = currentVal;
        }

        // Renderizar la lista en el modal
        renderRoomTypesModalList();
    } catch (e) {
        console.error('Error cargando tipos de habitación:', e);
    }
}

function openRoomTypesModal() {
    const modal = document.getElementById('roomTypesModal');
    if (modal) {
        modal.style.display = 'flex';
        loadRoomTypes();
    }
}

function closeRoomTypesModal() {
    const modal = document.getElementById('roomTypesModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

function renderRoomTypesModalList() {
    const container = document.getElementById('roomTypesList');
    if (!container) return;

    if (currentRoomTypes.length === 0) {
        container.innerHTML = '<div style="color:var(--text-secondary); text-align:center; padding:10px;">No hay tipos configurados.</div>';
        return;
    }

    container.innerHTML = currentRoomTypes.map(t => `
        <div style="display:flex; justify-content:space-between; align-items:center; background:var(--bg-input); padding:8px 12px; border-radius:8px; border:1px solid var(--border-color);">
            <span style="font-weight:600; color:var(--text-primary);">${escapeHtml(t.name)}</span>
            <div style="display:flex; gap:6px;">
                <button type="button" class="btn-sm btn-secondary" onclick="editRoomType('${t.id}', '${escapeHtml(t.name.replace(/'/g, "\\'"))}')">✏️ Editar</button>
                <button type="button" class="btn-sm btn-danger" onclick="deleteRoomType('${t.id}')">🗑️ Eliminar</button>
            </div>
        </div>
    `).join('');
}

async function addRoomType() {
    const input = document.getElementById('newRoomTypeName');
    const name = input ? input.value.trim() : '';
    if (!name) {
        showToast('Ingresá el nombre del nuevo tipo de habitación', 'error');
        return;
    }

    try {
        const res = await fetch('/api/rooms/types', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
        });

        if (res.ok) {
            showToast('Tipo de habitación agregado', 'success');
            if (input) input.value = '';
            await loadRoomTypes();
            loadRooms();
        } else {
            const err = await res.json();
            showToast(err.error || 'Error al guardar', 'error');
        }
    } catch (e) {
        showToast('Error de red', 'error');
    }
}

async function editRoomType(typeId, currentName) {
    const newName = prompt('Editar nombre del tipo de habitación:', currentName);
    if (!newName || !newName.trim() || newName.trim() === currentName) return;

    try {
        const res = await fetch(`/api/rooms/types/${typeId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: newName.trim() })
        });

        if (res.ok) {
            showToast('Tipo de habitación actualizado', 'success');
            await loadRoomTypes();
            loadRooms();
        } else {
            const err = await res.json();
            showToast(err.error || 'Error al actualizar', 'error');
        }
    } catch (e) {
        showToast('Error de red', 'error');
    }
}

async function deleteRoomType(typeId) {
    if (!confirm('¿Deseas eliminar este tipo de habitación?')) return;

    try {
        const res = await fetch(`/api/rooms/types/${typeId}`, { method: 'DELETE' });
        if (res.ok) {
            showToast('Tipo de habitación eliminado', 'success');
            await loadRoomTypes();
            loadRooms();
        } else {
            const err = await res.json();
            showToast(err.error || 'Error al eliminar', 'error');
        }
    } catch (e) {
        showToast('Error de red', 'error');
    }
}

async function loadRooms() {
    const tbody = document.getElementById('roomsTableBody');
    if (!tbody) return;

    await loadRoomTypes();

    try {
        const res = await fetch('/api/rooms');
        if (!res.ok) throw new Error('Error al cargar habitaciones');
        const rooms = await res.json();

        // Popular select para reserva manual
        const bRoomSelect = document.getElementById('bRoomId');
        if (bRoomSelect) {
            bRoomSelect.innerHTML = '<option value="">Seleccionar habitación...</option>' + 
                rooms.filter(r => r.active === 1).map(r => `<option value="${r.id}">${escapeHtml(r.name)} ($${r.price_per_night}/noche)</option>`).join('');
        }

        if (rooms.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px; color:var(--text-secondary);">No hay habitaciones registradas.</td></tr>';
            return;
        }

        const typesMap = {};
        currentRoomTypes.forEach(t => { typesMap[t.id] = t.name; });

        tbody.innerHTML = rooms.map(r => `
            <tr style="${r.active === 0 ? 'opacity: 0.5;' : ''}">
                <td><strong>${escapeHtml(r.name)}</strong></td>
                <td><span class="badge" style="background:var(--bg-input); color:var(--text-primary); border:1px solid var(--border-color);">${escapeHtml(typesMap[r.room_type] || r.room_type)}</span></td>
                <td><strong>$${r.price_per_night}</strong></td>
                <td>${r.capacity} pax</td>
                <td>${r.total_units} unidad(es)</td>
                <td>
                    <button class="btn-sm btn-primary" onclick="editRoom(${r.id})">✏️ Editar</button>
                    ${r.active === 1 ? `<button class="btn-sm btn-danger" onclick="deleteRoom(${r.id})">🗑️ Desactivar</button>` : ''}
                </td>
            </tr>
        `).join('');
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:red;">${e.message}</td></tr>`;
    }
}

async function saveRoom(event) {
    event.preventDefault();
    const id = document.getElementById('roomId').value;
    const name = document.getElementById('roomName').value;
    const room_type = document.getElementById('roomType').value;
    const price_per_night = parseFloat(document.getElementById('roomPrice').value);
    const capacity = parseInt(document.getElementById('roomCapacity').value) || 1;
    const total_units = parseInt(document.getElementById('roomTotalUnits').value) || 1;
    const description = document.getElementById('roomDescription').value;

    const body = { name, room_type, price_per_night, capacity, total_units, description };
    const url = id ? `/api/rooms/${id}` : '/api/rooms';
    const method = id ? 'PUT' : 'POST';

    try {
        const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        if (res.ok) {
            showToast(id ? 'Habitación actualizada' : 'Habitación creada', 'success');
            resetRoomForm();
            loadRooms();
        } else {
            const err = await res.json();
            showToast(err.error || 'Error al guardar', 'error');
        }
    } catch (e) {
        showToast('Error de red', 'error');
    }
}

async function editRoom(id) {
    try {
        const res = await fetch(`/api/rooms/${id}`);
        if (res.ok) {
            const room = await res.json();
            document.getElementById('roomId').value = room.id;
            document.getElementById('roomName').value = room.name;
            document.getElementById('roomType').value = room.room_type;
            document.getElementById('roomPrice').value = room.price_per_night;
            document.getElementById('roomCapacity').value = room.capacity;
            document.getElementById('roomTotalUnits').value = room.total_units;
            document.getElementById('roomDescription').value = room.description || '';
            document.getElementById('formTitle-rooms').textContent = '✏️ Editar Habitación';
            document.getElementById('btnSaveRoom').textContent = 'Actualizar Habitación';
        }
    } catch (e) {
        showToast('Error cargando habitación', 'error');
    }
}

async function deleteRoom(id) {
    if (!confirm('¿Deseas desactivar esta habitación?')) return;
    try {
        const res = await fetch(`/api/rooms/${id}`, { method: 'DELETE' });
        if (res.ok) {
            showToast('Habitación desactivada', 'success');
            loadRooms();
        }
    } catch (e) {
        showToast('Error desactivando habitación', 'error');
    }
}

function resetRoomForm() {
    document.getElementById('roomForm').reset();
    document.getElementById('roomId').value = '';
    document.getElementById('formTitle-rooms').textContent = '➕ Nueva Habitación / Dormitorio';
    document.getElementById('btnSaveRoom').textContent = 'Guardar Habitación';
}

async function loadBookings() {
    const tbody = document.getElementById('bookingsTableBody');
    if (!tbody) return;
    const status = document.getElementById('bookingStatusFilter')?.value || '';
    try {
        const res = await fetch(`/api/bookings${status ? `?status=${status}` : ''}`);
        if (!res.ok) throw new Error('Error cargando reservas');
        const bookings = await res.json();
        if (bookings.length === 0) {
            tbody.innerHTML = '<tr><td colspan="10" style="text-align:center; padding:20px; color:var(--text-secondary);">No hay reservas registradas.</td></tr>';
            return;
        }

        const getStatusBadge = (s) => {
            switch(s) {
                case 'confirmed': return '<span class="badge" style="background:#dbeafe; color:#2563eb; padding:4px 8px; border-radius:6px; font-weight:600;">Confirmada</span>';
                case 'checked_in': return '<span class="badge" style="background:#dcfce7; color:#16a34a; padding:4px 8px; border-radius:6px; font-weight:600;">Checked-In</span>';
                case 'checked_out': return '<span class="badge" style="background:#f3f4f6; color:#6b7280; padding:4px 8px; border-radius:6px; font-weight:600;">Checked-Out</span>';
                case 'cancelled': return '<span class="badge" style="background:#fee2e2; color:#dc2626; padding:4px 8px; border-radius:6px; font-weight:600;">Cancelada</span>';
                default: return '<span class="badge" style="background:#fef3c7; color:#d97706; padding:4px 8px; border-radius:6px; font-weight:600;">Pendiente</span>';
            }
        };

        tbody.innerHTML = bookings.map(b => `
            <tr>
                <td><strong>${b.booking_number}</strong></td>
                <td>${escapeHtml(b.customer_name || 'Huésped')}</td>
                <td><a href="https://wa.me/${b.customer_phone.replace('+','')}" target="_blank" style="color:var(--primary-color); font-weight:600;">${b.customer_phone}</a></td>
                <td>${escapeHtml(b.room_name)}</td>
                <td>${b.check_in_date}</td>
                <td>${b.check_out_date}</td>
                <td>${b.guests_count} pax</td>
                <td><strong>$${b.total_price}</strong></td>
                <td>${getStatusBadge(b.status)}</td>
                <td>
                    <div style="display:flex; gap:4px; flex-wrap:wrap;">
                        ${b.status === 'pending' ? `<button class="btn-sm btn-primary" onclick="updateBookingStatus(${b.id}, 'confirmed')">✅ Confirmar</button>` : ''}
                        ${b.status === 'confirmed' ? `<button class="btn-sm" style="background:#16a34a; color:white; border:none; padding:4px 8px; border-radius:4px; cursor:pointer;" onclick="updateBookingStatus(${b.id}, 'checked_in')">🔑 Check-In</button>` : ''}
                        ${b.status === 'checked_in' ? `<button class="btn-sm" style="background:#6b7280; color:white; border:none; padding:4px 8px; border-radius:4px; cursor:pointer;" onclick="updateBookingStatus(${b.id}, 'checked_out')">🚪 Check-Out</button>` : ''}
                        ${b.status !== 'cancelled' && b.status !== 'checked_out' ? `<button class="btn-sm btn-danger" onclick="updateBookingStatus(${b.id}, 'cancelled')">❌ Cancelar</button>` : ''}
                    </div>
                </td>
            </tr>
        `).join('');
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; color:red;">${e.message}</td></tr>`;
    }
}

async function updateBookingStatus(id, status) {
    try {
        const res = await fetch(`/api/bookings/${id}/status`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status })
        });
        if (res.ok) {
            showToast(`Reserva actualizada a ${status}`, 'success');
            loadBookings();
        }
    } catch (e) {
        showToast('Error actualizando reserva', 'error');
    }
}

function showNewBookingModal() {
    loadRooms();
    document.getElementById('newBookingModal').style.display = 'flex';
}

function hideNewBookingModal() {
    document.getElementById('newBookingModal').style.display = 'none';
    document.getElementById('bookingForm').reset();
}

async function saveManualBooking(event) {
    event.preventDefault();
    const customer_phone = document.getElementById('bCustomerPhone').value;
    const customer_name = document.getElementById('bCustomerName').value;
    const room_id = document.getElementById('bRoomId').value;
    const roomSelect = document.getElementById('bRoomId');
    const room_name = roomSelect.options[roomSelect.selectedIndex]?.text || '';
    const guests_count = document.getElementById('bGuestsCount').value;
    const check_in_date = document.getElementById('bCheckIn').value;
    const check_out_date = document.getElementById('bCheckOut').value;
    const total_price = document.getElementById('bTotalPrice').value;
    const payment_method = document.getElementById('bPaymentMethod').value;
    const notes = document.getElementById('bNotes').value;

    try {
        const res = await fetch('/api/bookings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                customer_phone, customer_name, room_id, room_name,
                guests_count, check_in_date, check_out_date,
                total_price, payment_method, notes
            })
        });
        if (res.ok) {
            showToast('Reserva manual creada', 'success');
            hideNewBookingModal();
            loadBookings();
        } else {
            const err = await res.json();
            showToast(err.error || 'Error al guardar', 'error');
        }
    } catch (e) {
        showToast('Error de red', 'error');
    }
}

// ─── Generador Mágico de Prompts IA ─────────────────────

function openPromptGeneratorModal() {
    const modal = document.getElementById('promptGeneratorModal');
    if (modal) {
        // Pre-llenar descripción si ya existe tipo de negocio
        const bType = document.getElementById('storeBusinessType');
        if (bType && bType.value && !document.getElementById('genPromptDescription').value) {
            document.getElementById('genPromptDescription').value = `Negocio de ${bType.value}`;
        }
        modal.style.display = 'flex';
    }
}

function closePromptGeneratorModal() {
    const modal = document.getElementById('promptGeneratorModal');
    if (modal) modal.style.display = 'none';
}

async function generateAiPromptSubmit() {
    const description = document.getElementById('genPromptDescription').value.trim();
    const tone = document.getElementById('genPromptTone').value;
    const rules = document.getElementById('genPromptRules').value.trim();
    const businessType = (document.getElementById('storeBusinessType') || {}).value || 'general';

    if (!description) {
        showToast('⚠️ Por favor indica qué vende tu negocio', 'warning');
        return;
    }

    const btn = document.getElementById('btnGeneratePromptSubmit');
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = '⏳ Generando prompt con IA...';

    try {
        const res = await fetch('/api/ai/generate-prompt', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ description, tone, rules, businessType })
        });

        const data = await res.json();
        if (!res.ok || !data.success) {
            throw new Error(data.error || 'Error al generar el prompt');
        }

        const promptTextarea = document.getElementById('storeAiPrompt');
        if (promptTextarea) {
            promptTextarea.value = data.generatedPrompt;
            showToast('✨ ¡Prompt generado e inyectado con éxito!', 'success');
            closePromptGeneratorModal();
            // Scroll hacia la caja del prompt
            promptTextarea.scrollIntoView({ behavior: 'smooth' });
        }
    } catch (error) {
        showToast(`❌ ${error.message}`, 'error');
        console.error(error);
    } finally {
        btn.disabled = false;
        btn.textContent = originalText;
    }
}
