/**
 * WaBot SaaS — Dashboard de Pedidos (Client-side)
 * WebSocket + UI reactiva para la gestión de pedidos.
 */

// ─── Socket.io Connection ──────────────────────
const socket = io({ transports: ['websocket'] });

// ─── Connection Status ─────────────────────────
const statusDot = document.querySelector('.status-dot');
const statusText = document.querySelector('.status-text');

socket.on('connect', () => {
    statusDot.classList.add('connected');
    statusText.textContent = 'Conectado';
    console.log('🔌 Conectado al servidor');
    if (window.STORE_ID) {
        socket.emit('join-store-room', { storeId: window.STORE_ID, role: 'pedidos' });
    }
});

socket.on('disconnect', () => {
    statusDot.classList.remove('connected');
    statusText.textContent = 'Desconectado';
    console.log('🔌 Desconectado del servidor');
});

// ─── Estado ────────────────────────────────────
let currentPedidosTab = 'pedidos';

// ─── Nuevo Pedido ──────────────────────────────
socket.on('nuevo-pedido', (order) => {
    console.log('🆕 Nuevo pedido:', order);
    addOrderCard(order);
    playAlertSound();
    updatePendingCount(1);
});

// ─── Pedido Listo / Despachado ──────────────────
socket.on('pedido-listo', (order) => {
    console.log('🛵 Pedido listo / en camino:', order);
    removeOrderCard(order.id);
    addReadyOrderCard(order);
});

// ─── Pedido Entregado ──────────────────────────
socket.on('pedido-entregado', (data) => {
    console.log('✅ Pedido entregado:', data);
    removeOrderCard(data.id);
});

// ─── Pedido Cancelado ──────────────────────────
socket.on('pedido-cancelado', (data) => {
    console.log('🚫 Pedido cancelado:', data);
    removeOrderCard(data.id);
});

// ─── Funciones de UI ───────────────────────────

/**
 * Agregar una tarjeta de pedido al grid.
 */
function addOrderCard(order) {
    const grid = document.getElementById('ordersGrid');
    const empty = document.getElementById('emptyState');
    if (empty) empty.remove();

    const itemsHtml = order.items.map(item => {
        let details = item.details ? `<span class="item-details">(${escapeHtml(item.details)})</span>` : '';
        return `
            <div class="order-item">
                <span class="item-qty">${item.quantity}x</span>
                <span class="item-name">${escapeHtml(item.product_name)}</span>
                ${details}
            </div>
        `;
    }).join('');

    const time = new Date(order.created_at).toLocaleTimeString('es-UY', {
        hour: '2-digit', minute: '2-digit'
    });

    const card = document.createElement('div');
    card.className = 'order-card new';
    card.id = `order-${order.id}`;
    card.dataset.orderId = order.id;
    // Generar opciones de repartidores
    const driversHtml = (typeof DRIVERS !== 'undefined' ? DRIVERS : []).map(d =>
        `<option value="${d.id}">${escapeHtml(d.name)} (${escapeHtml(d.phone)})</option>`
    ).join('');

    const notesHtml = order.notes ? `
        <div class="order-notes-tag">
            📝 <strong>Nota:</strong> ${escapeHtml(order.notes)}
        </div>
    ` : '';

    card.innerHTML = `
        <div class="order-header-card">
            <span class="order-number">#${order.order_number}</span>
            <span class="order-time">${time}</span>
        </div>
        <div class="order-items">
            ${itemsHtml}
        </div>
        ${notesHtml}
        <div class="order-address">📍 ${escapeHtml(order.address)}</div>
        <div class="order-payment">💰 ${escapeHtml(order.payment_method)} — $${order.total}</div>
        <div class="order-driver">
            <label>🛵 Repartidor:</label>
            <select class="driver-select" id="driver-${order.id}">
                <option value="">— Seleccionar —</option>
                ${driversHtml}
            </select>
        </div>
        <div class="order-actions">
            <button class="btn-ready" onclick="markReady(${order.id})">🟢 PEDIDO LISTO</button>
            <button class="btn-print" onclick="printTicket(${order.id})" title="Imprimir Ticket">🖨️</button>
            <button class="btn-cancel" onclick="cancelOrder(${order.id})" title="Cancelar Pedido">✕</button>
        </div>
        <div class="order-timer" data-created="${order.created_at}">
            ⏱ <span class="timer-value">0:00</span>
        </div>
    `;

    // Insertar al inicio
    grid.insertBefore(card, grid.firstChild);

    // Remover clase 'new' después de la animación
    setTimeout(() => card.classList.remove('new'), 600);

    // Notificar recepción
    socket.emit('pedido-recibido', { orderId: order.id });
}

/**
 * Switch between Pedidos and Ready tabs.
 */
function switchPedidosTab(tab) {
    currentPedidosTab = tab;
    
    document.querySelectorAll('.k-tab-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`tab-btn-${tab}`).classList.add('active');

    if (tab === 'pedidos') {
        document.getElementById('ordersGrid').style.display = 'grid';
        document.getElementById('readyGrid').style.display = 'none';
    } else {
        document.getElementById('ordersGrid').style.display = 'none';
        document.getElementById('readyGrid').style.display = 'grid';
    }
}

/**
 * Update pending orders count badge.
 */
function updatePendingCount(delta) {
    const el = document.getElementById('pendingCount');
    if (!el) return;
    let count = parseInt(el.textContent) + delta;
    if (count < 0) count = 0;
    el.textContent = count;
}

/**
 * Update ready orders count badge.
 */
function updateReadyCount(delta) {
    const el = document.getElementById('readyCount');
    if (!el) return;
    let count = parseInt(el.textContent) + delta;
    if (count < 0) count = 0;
    el.textContent = count;
}

/**
 * Agregar tarjeta a la pestaña "En Camino" (Ready).
 */
function addReadyOrderCard(order) {
    const grid = document.getElementById('readyGrid');
    const empty = document.getElementById('emptyReadyState');
    if (empty) empty.remove();

    // Si ya existe en camino (para evitar duplicados por websocket + local), salir
    if (document.getElementById(`order-${order.id}`) && document.getElementById(`order-${order.id}`).parentElement.id === 'readyGrid') {
        return;
    }

    const itemsHtml = order.items.map(item => {
        let details = item.details ? `<span class="item-details">(${escapeHtml(item.details)})</span>` : '';
        return `
            <div class="order-item">
                <span class="item-qty">${item.quantity}x</span>
                <span class="item-name">${escapeHtml(item.product_name)}</span>
                ${details}
            </div>
        `;
    }).join('');

    const time = new Date(order.created_at).toLocaleTimeString('es-UY', {
        hour: '2-digit', minute: '2-digit'
    });

    const notesHtml = order.notes ? `
        <div class="order-notes-tag">
            📝 <strong>Nota:</strong> ${escapeHtml(order.notes)}
        </div>
    ` : '';

    const card = document.createElement('div');
    card.className = 'order-card ready-status new';
    card.id = `order-${order.id}`;
    card.dataset.orderId = order.id;
    card.innerHTML = `
        <div class="order-header-card">
            <span class="order-number">#${order.order_number}</span>
            <span class="order-time">${time}</span>
        </div>
        <div class="order-items">
            ${itemsHtml}
        </div>
        ${notesHtml}
        <div class="order-address">📍 ${escapeHtml(order.address)}</div>
        <div class="order-payment">💰 ${escapeHtml(order.payment_method)} — $${order.total}</div>
        <div class="order-actions">
            <button class="btn-ready btn-deliver" onclick="markDelivered(${order.id})">
                ✓ ENTREGADO
            </button>
            <button class="btn-print" onclick="printTicket(${order.id})" title="Imprimir Ticket">🖨️</button>
        </div>
        <div class="order-timer" data-created="${order.created_at}">
            ⏱ <span class="timer-value">0:00</span>
        </div>
    `;

    grid.insertBefore(card, grid.firstChild);
    updateReadyCount(1);

    setTimeout(() => card.classList.remove('new'), 600);
}

/**
 * Remover tarjeta del pedido con animación.
 */
function removeOrderCard(orderId) {
    const card = document.getElementById(`order-${orderId}`);
    if (!card) return;

    const isPending = card.parentElement.id === 'ordersGrid';

    card.classList.add('removing');
    setTimeout(() => {
        card.remove();
        if (isPending) {
            updatePendingCount(-1);
            checkEmpty('pedidos');
        } else {
            updateReadyCount(-1);
            checkEmpty('ready');
        }
    }, 400);
}

/**
 * Marcar pedido como listo — requiere seleccionar repartidor.
 */
async function markReady(orderId) {
    const driverSelect = document.getElementById(`driver-${orderId}`);
    const driverId = driverSelect ? driverSelect.value : '';

    if (!driverId) {
        showToast('⚠️ Seleccioná un repartidor primero', 'error');
        if (driverSelect) driverSelect.focus();
        return;
    }

    const btn = document.querySelector(`#order-${orderId} .btn-ready`);
    if (btn) {
        btn.disabled = true;
        btn.textContent = '⏳ Enviando...';
    }

    try {
        const res = await fetch(`/api/orders/${orderId}/ready`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ driverId: parseInt(driverId) })
        });

        if (res.ok) {
            showToast('✅ Pedido despachado — repartidor notificado', 'success');
            // La tarjeta se mueve al grid "ready" a través del evento WebSocket
        } else {
            const data = await res.json();
            throw new Error(data.error || 'Error al marcar como listo');
        }
    } catch (error) {
        console.error(error);
        showToast(`❌ ${error.message}`, 'error');
        if (btn) {
            btn.disabled = false;
            btn.textContent = '🟢 PEDIDO LISTO';
        }
    }
}

/**
 * Marcar pedido como entregado.
 */
async function markDelivered(orderId) {
    const btn = document.querySelector(`#order-${orderId} .btn-deliver`);
    if (btn) {
        btn.disabled = true;
        btn.textContent = '⏳ Actualizando...';
    }

    try {
        const res = await fetch(`/api/orders/${orderId}/deliver`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        if (res.ok) {
            showToast('✅ Pedido marcado como entregado', 'success');
            // La tarjeta se remueve a través del evento WebSocket 'pedido-entregado'
        } else {
            const data = await res.json();
            throw new Error(data.error || 'Error al entregar');
        }
    } catch (error) {
        console.error(error);
        showToast(`❌ ${error.message}`, 'error');
        if (btn) {
            btn.disabled = false;
            btn.textContent = '✓ ENTREGADO';
        }
    }
}

/**
 * Cancelar pedido.
 */
async function cancelOrder(orderId) {
    if (!confirm('¿Cancelar este pedido?')) return;

    try {
        const res = await fetch(`/api/orders/${orderId}/cancel`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        if (res.ok) {
            showToast('🚫 Pedido cancelado', 'info');
            // Remoción manejada por WebSocket 'pedido-cancelado'
        }
    } catch (error) {
        console.error(error);
        showToast('❌ Error al cancelar', 'error');
    }
}

/**
 * Imprimir ticket de pedido
 */
function printTicket(orderId) {
    const card = document.getElementById(`order-${orderId}`);
    if (!card) return;
    
    const printWindow = window.open('', '_blank', 'width=400,height=600');
    if (!printWindow) {
        showToast('⚠️ Permite las ventanas emergentes (pop-ups) para imprimir.', 'error');
        return;
    }
    
    const orderNumber = card.querySelector('.order-number').textContent;
    const time = card.querySelector('.order-time').textContent;
    const items = card.querySelector('.order-items').innerHTML;
    const notesEl = card.querySelector('.order-notes-tag');
    const address = card.querySelector('.order-address').textContent;
    const payment = card.querySelector('.order-payment').textContent;
    
    // Obtener nombre del local (si existe en el DOM, si no, uno genérico)
    const storeNameEl = document.querySelector('.store-name');
    const storeName = storeNameEl ? storeNameEl.textContent : 'WaBot SaaS';
    
    let notesHtml = '';
    if (notesEl) {
        notesHtml = `<div style="margin: 10px 0; border: 1px dashed #000; padding: 5px;">${notesEl.innerHTML}</div>`;
    }

    const html = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
        <meta charset="UTF-8">
        <title>Ticket ${orderNumber}</title>
        <style>
            body { 
                font-family: 'Courier New', Courier, monospace; 
                padding: 10px; 
                width: 300px; 
                margin: 0 auto; 
                color: #000; 
                background: #fff;
            }
            h2 { text-align: center; margin: 0 0 10px 0; font-size: 1.2rem; text-transform: uppercase; }
            .header { text-align: center; border-bottom: 1px dashed #000; padding-bottom: 10px; margin-bottom: 10px; }
            .items { margin-bottom: 10px; border-bottom: 1px dashed #000; padding-bottom: 10px; }
            .order-item { margin-bottom: 5px; display: flex; flex-direction: column; }
            .item-qty { font-weight: bold; margin-right: 5px; }
            .item-name { font-weight: bold; }
            .item-details { font-size: 0.9em; font-style: italic; display: block; margin-left: 20px; }
            .footer { margin-top: 10px; font-size: 0.9em; }
            .order-address, .order-payment { margin-bottom: 5px; }
            @media print {
                body { width: 100%; margin: 0; padding: 0; }
            }
        </style>
    </head>
    <body>
        <h2>${storeName}</h2>
        <div class="header">
            <div>Pedido <b>${orderNumber}</b></div>
            <div>Hora: ${time}</div>
        </div>
        <div class="items">
            ${items}
        </div>
        ${notesHtml}
        <div class="footer">
            <div class="order-address">${address}</div>
            <div class="order-payment">${payment}</div>
        </div>
        <script>
            window.onload = function() { 
                setTimeout(() => {
                    window.print();
                    window.close();
                }, 250); 
            }
        </script>
    </body>
    </html>
    `;
    
    printWindow.document.write(html);
    printWindow.document.close();
}

/**
 * Verificar si no quedan pedidos y mostrar estado vacío.
 */
function checkEmpty(type = 'pedidos') {
    if (type === 'pedidos') {
        const grid = document.getElementById('ordersGrid');
        const cards = grid.querySelectorAll('.order-card');
        if (cards.length === 0) {
            grid.innerHTML = `
                <div class="empty-state" id="emptyState">
                    <div class="empty-icon">📦</div>
                    <p>Sin pedidos pendientes</p>
                    <span>Los nuevos pedidos aparecerán aquí automáticamente</span>
                </div>
            `;
        }
    } else {
        const grid = document.getElementById('readyGrid');
        const cards = grid.querySelectorAll('.order-card');
        if (cards.length === 0) {
            grid.innerHTML = `
                <div class="empty-state" id="emptyReadyState">
                    <div class="empty-icon">🛵</div>
                    <p>No hay pedidos en camino</p>
                    <span>Los pedidos listos para despachar aparecerán aquí</span>
                </div>
            `;
        }
    }
}

/**
 * Reproducir sonido de alerta.
 */
function playAlertSound() {
    try {
        const audio = document.getElementById('alertSound');
        if (audio) {
            audio.currentTime = 0;
            audio.play().catch(() => {
                // Si falla (ej: archivo no existe o falta interacción), usar sonido sintético
                playFallbackSynth();
            });
        } else {
            playFallbackSynth();
        }
    } catch (e) {
        playFallbackSynth();
    }
}

function playFallbackSynth() {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();

        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5 (Re5)
        gainNode.gain.setValueAtTime(0.15, audioCtx.currentTime);

        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        oscillator.start();
        setTimeout(() => oscillator.stop(), 150);
        
        setTimeout(() => {
            const osc2 = audioCtx.createOscillator();
            osc2.type = 'sine';
            osc2.frequency.setValueAtTime(659.25, audioCtx.currentTime); // E5 (Mi5)
            osc2.connect(gainNode);
            osc2.start();
            setTimeout(() => osc2.stop(), 250);
        }, 200);
    } catch (e) {
        console.error('Fallback sound failed:', e);
    }
}

/**
 * Mostrar notificación toast.
 */
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// ─── Reloj ─────────────────────────────────────
function updateClock() {
    const clock = document.getElementById('clock');
    if (clock) {
        const now = new Date();
        clock.textContent = now.toLocaleTimeString('es-UY', {
            hour: '2-digit', minute: '2-digit', second: '2-digit'
        });
    }
}
setInterval(updateClock, 1000);
updateClock();

// ─── Timers de pedidos ─────────────────────────
function updateTimers() {
    const timers = document.querySelectorAll('.order-timer');
    const now = new Date();

    timers.forEach(timer => {
        const created = new Date(timer.dataset.created);
        const diff = Math.floor((now - created) / 1000);
        const minutes = Math.floor(diff / 60);
        const seconds = diff % 60;

        const timerValue = timer.querySelector('.timer-value');
        timerValue.textContent = `${minutes}:${String(seconds).padStart(2, '0')}`;

        // Marcar como urgente si pasa de 15 minutos
        if (minutes >= 15) {
            timerValue.classList.add('urgent');
        }
    });
}
setInterval(updateTimers, 1000);
updateTimers();

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
