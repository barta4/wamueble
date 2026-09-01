/**
 * WaBot SaaS — Super Admin Panel (Client-side)
 * Modern, Dynamic & Responsive Controller
 */

// ─── State ───────────────────────────────────────────────────────────────────
let currentTab = 'dashboard';
let currentAuditPage = 1;
let tenantsData = [];
let usersData = [];
let plansData = [];

// ─── Init ────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    loadDashboard();
});

// ─── Tab Switching ───────────────────────────────────────────────────────────
function switchSuperAdminTab(tab) {
    currentTab = tab;

    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

    const activeBtn = document.querySelector(`[data-tab="${tab}"]`);
    if (activeBtn) activeBtn.classList.add('active');

    const activeContent = document.getElementById(`tab-${tab}`);
    if (activeContent) activeContent.classList.add('active');

    // Load data for tab
    switch (tab) {
        case 'dashboard': loadDashboard(); break;
        case 'tenants': loadTenants(); break;
        case 'users': loadUsers(); break;
        case 'plans': loadPlans(); break;
        case 'ai-agents': loadAiStatus(); break;
        case 'whatsapp': loadWhatsAppStatus(); break;
        case 'db-connections': loadDbConnections(); break;
        case 'audit': loadAuditLog(); break;
    }
}

// ─── Dashboard ───────────────────────────────────────────────────────────────
async function loadDashboard() {
    try {
        const res = await fetch('/superadmin/api/metrics');
        const m = await res.json();

        const planCards = (m.tenantsByPlan || []).map(p => `
            <div class="saas-plan-pill-item">
                <div class="saas-plan-pill-name">
                    <span class="saas-plan-tag saas-plan-${(p.plan || 'free').toLowerCase()}">${escapeHtml(p.plan)}</span>
                </div>
                <div class="saas-plan-pill-count">${p.count} <span style="font-size: 0.8rem; font-weight: 500; color: var(--saas-text-muted);">tenants</span></div>
            </div>
        `).join('');

        document.getElementById('dashboardContent').innerHTML = `
            <div class="saas-kpi-grid">
                <!-- Tenants Activos -->
                <div class="saas-kpi-card">
                    <div class="saas-kpi-top">
                        <div class="saas-kpi-icon-wrap saas-icon-emerald">🏪</div>
                        <span class="saas-kpi-trend saas-trend-up">● Activo</span>
                    </div>
                    <div class="saas-kpi-value">${m.totalTenants || 0}</div>
                    <div class="saas-kpi-label">Tenants Registrados</div>
                </div>

                <!-- Usuarios Globales -->
                <div class="saas-kpi-card">
                    <div class="saas-kpi-top">
                        <div class="saas-kpi-icon-wrap saas-icon-indigo">👥</div>
                        <span class="saas-kpi-trend saas-trend-neutral">Global</span>
                    </div>
                    <div class="saas-kpi-value">${m.totalUsers || 0}</div>
                    <div class="saas-kpi-label">Usuarios del Sistema</div>
                </div>

                <!-- Pedidos este Mes -->
                <div class="saas-kpi-card">
                    <div class="saas-kpi-top">
                        <div class="saas-kpi-icon-wrap saas-icon-blue">📦</div>
                        <span class="saas-kpi-trend saas-trend-up">+14.2%</span>
                    </div>
                    <div class="saas-kpi-value">${m.ordersThisMonth || 0}</div>
                    <div class="saas-kpi-label">Pedidos Procesados (Mes)</div>
                </div>

                <!-- Ingresos Estimados -->
                <div class="saas-kpi-card">
                    <div class="saas-kpi-top">
                        <div class="saas-kpi-icon-wrap saas-icon-emerald">💰</div>
                        <span class="saas-kpi-trend saas-trend-up">MRR</span>
                    </div>
                    <div class="saas-kpi-value">$${(m.revenueThisMonth || 0).toLocaleString()}</div>
                    <div class="saas-kpi-label">Volumen Transaccionado</div>
                </div>

                <!-- Suspendidos -->
                <div class="saas-kpi-card">
                    <div class="saas-kpi-top">
                        <div class="saas-kpi-icon-wrap saas-icon-rose">🚫</div>
                        <span class="saas-kpi-trend ${m.suspendedTenants > 0 ? 'saas-trend-down' : 'saas-trend-neutral'}">
                            ${m.suspendedTenants > 0 ? 'Atención' : 'Sin bloqueos'}
                        </span>
                    </div>
                    <div class="saas-kpi-value" style="color: ${m.suspendedTenants > 0 ? 'var(--saas-accent-rose)' : 'inherit'};">${m.suspendedTenants || 0}</div>
                    <div class="saas-kpi-label">Tenants Suspendidos</div>
                </div>

                <!-- Productos Totales -->
                <div class="saas-kpi-card">
                    <div class="saas-kpi-top">
                        <div class="saas-kpi-icon-wrap saas-icon-amber">🛒</div>
                        <span class="saas-kpi-trend saas-trend-neutral">Catálogo</span>
                    </div>
                    <div class="saas-kpi-value">${m.totalProducts || 0}</div>
                    <div class="saas-kpi-label">Ítems & Servicios Totales</div>
                </div>
            </div>

            <!-- Distribución por Plan -->
            <div class="saas-card" style="margin-top: 20px;">
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
                    <h4 style="margin: 0; font-size: 1.05rem; font-weight: 700;">Distribución de Suscripciones por Plan</h4>
                    <button class="saas-btn-secondary" onclick="switchSuperAdminTab('plans')" style="font-size: 0.8rem; padding: 4px 10px;">Gestionar Planes</button>
                </div>
                <div class="saas-plans-breakdown">
                    ${planCards || '<div style="color: var(--saas-text-muted); font-size: 0.9rem;">Sin datos de suscripción disponibles</div>'}
                </div>
            </div>
        `;
    } catch (error) {
        console.error('Error loading dashboard:', error);
        document.getElementById('dashboardContent').innerHTML = `
            <div style="text-align: center; padding: 40px; color: var(--saas-accent-rose);">
                <p>❌ Error al cargar métricas de la plataforma. Reintenta en unos instantes.</p>
                <button class="saas-btn-secondary" onclick="loadDashboard()">Reintentar</button>
            </div>
        `;
    }
}

// ─── Tenants ─────────────────────────────────────────────────────────────────
async function loadTenants() {
    try {
        const res = await fetch('/superadmin/api/tenants');
        tenantsData = await res.json();
        renderTenantsTable(tenantsData);
    } catch (error) {
        console.error('Error loading tenants:', error);
        document.getElementById('tenantsList').innerHTML = '<p style="text-align: center; color: var(--saas-accent-rose);">Error al cargar tenants</p>';
    }
}

function filterTenantsList() {
    const query = (document.getElementById('tenantSearchInput')?.value || '').toLowerCase().trim();
    if (!query) {
        renderTenantsTable(tenantsData);
        return;
    }
    const filtered = tenantsData.filter(t => 
        (t.name && t.name.toLowerCase().includes(query)) ||
        (t.phone && t.phone.toLowerCase().includes(query)) ||
        (t.owner_email && t.owner_email.toLowerCase().includes(query)) ||
        (t.plan && t.plan.toLowerCase().includes(query))
    );
    renderTenantsTable(filtered);
}

function renderTenantsTable(list) {
    document.getElementById('tenantCount').textContent = `${list.length} de ${tenantsData.length} tenants`;

    if (!list || list.length === 0) {
        document.getElementById('tenantsList').innerHTML = `
            <div style="text-align: center; padding: 50px 20px; color: var(--saas-text-muted);">
                <div style="font-size: 2.5rem; margin-bottom: 10px;">🔍</div>
                <p style="font-size: 1rem; font-weight: 600; margin: 0;">No se encontraron tenants</p>
                <span style="font-size: 0.85rem;">Prueba con otro término de búsqueda.</span>
            </div>
        `;
        return;
    }

    const rows = list.map(t => {
        const initial = (t.name || 'T').charAt(0).toUpperCase();
        const planClass = `saas-plan-${(t.plan || 'free').toLowerCase()}`;
        return `
            <tr>
                <td>
                    <div class="saas-entity-cell">
                        <div class="saas-entity-avatar">${initial}</div>
                        <div class="saas-entity-info">
                            <h4>${escapeHtml(t.name)}</h4>
                            <p>${escapeHtml(t.phone || 'Sin teléfono configurado')}</p>
                        </div>
                    </div>
                </td>
                <td>
                    <span style="font-weight: 500;">${escapeHtml(t.owner_email || '—')}</span>
                </td>
                <td>
                    <span class="saas-plan-tag ${planClass}">${escapeHtml(t.plan || 'free')}</span>
                </td>
                <td style="text-align: center; font-weight: 600;">${t.total_orders || 0}</td>
                <td style="text-align: center; font-weight: 600;">${t.total_products || 0}</td>
                <td>
                    ${t.suspended
                        ? '<span class="saas-status-badge saas-status-suspended"><span class="saas-status-dot"></span> Suspendido</span>'
                        : '<span class="saas-status-badge saas-status-active"><span class="saas-status-dot"></span> Activo</span>'
                    }
                </td>
                <td>
                    <div class="saas-action-group">
                        <button class="saas-btn-secondary" style="padding: 5px 10px; font-size: 0.8rem;" onclick="editTenant(${t.id})" title="Editar Configuración">✏️ Editar</button>
                        ${t.suspended
                            ? `<button class="saas-btn-primary" style="padding: 5px 10px; font-size: 0.8rem;" onclick="activateTenant(${t.id})">✅ Activar</button>`
                            : `<button class="saas-btn-warning" style="padding: 5px 10px; font-size: 0.8rem;" onclick="suspendTenant(${t.id})">⏸️ Suspender</button>`
                        }
                        <button class="saas-btn-danger" style="padding: 5px 10px; font-size: 0.8rem;" onclick="deleteTenant(${t.id}, '${escapeHtml(t.name)}')" title="Eliminar Tenant">🗑️</button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    document.getElementById('tenantsList').innerHTML = `
        <div class="saas-table-responsive">
            <table class="saas-table">
                <thead>
                    <tr>
                        <th>Negocio / Tienda</th>
                        <th>Email Propietario</th>
                        <th>Plan</th>
                        <th style="text-align: center;">Pedidos</th>
                        <th style="text-align: center;">Productos</th>
                        <th>Estado</th>
                        <th>Acciones</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        </div>
    `;
}

async function editTenant(id) {
    const tenant = tenantsData.find(t => t.id === id);
    if (!tenant) return;

    const provider = tenant.ai_provider || 'openai';
    const currentModel = tenant.ai_model || 'gpt-4o';

    showModal(`
        <div class="modal-header">
            <h3>Editar Tenant: ${escapeHtml(tenant.name)}</h3>
            <button class="modal-close-btn" onclick="hideModal()">✖</button>
        </div>
        <form onsubmit="saveTenant(event, ${id})">
            <div class="form-group">
                <label>Nombre del Negocio</label>
                <input type="text" id="editTenantName" value="${escapeHtml(tenant.name)}" required>
            </div>
            <div class="form-group">
                <label>Teléfono Principal</label>
                <input type="text" id="editTenantPhone" value="${escapeHtml(tenant.phone || '')}">
            </div>
            <div class="form-group">
                <label>Plan de Suscripción</label>
                <select id="editTenantPlan">
                    <option value="free" ${tenant.plan === 'free' ? 'selected' : ''}>Free</option>
                    <option value="pro" ${tenant.plan === 'pro' ? 'selected' : ''}>Pro</option>
                    <option value="enterprise" ${tenant.plan === 'enterprise' ? 'selected' : ''}>Enterprise</option>
                </select>
            </div>
            <div class="form-group">
                <label>Proveedor de IA</label>
                <select id="editTenantAiProvider" onchange="updateTenantAiModels(${id})">
                    <option value="openai" ${tenant.ai_provider === 'openai' ? 'selected' : ''}>OpenAI</option>
                    <option value="gemini" ${tenant.ai_provider === 'gemini' ? 'selected' : ''}>Google Gemini</option>
                    <option value="anthropic" ${tenant.ai_provider === 'anthropic' ? 'selected' : ''}>Anthropic Claude</option>
                </select>
            </div>
            <div class="form-group">
                <label>Modelo de Inteligencia Artificial</label>
                <select id="editTenantAiModel">
                    <option value="${currentModel}">${currentModel}</option>
                </select>
            </div>
            <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 24px;">
                <button type="button" class="saas-btn-secondary" onclick="hideModal()">Cancelar</button>
                <button type="submit" class="saas-btn-primary">💾 Guardar Cambios</button>
            </div>
        </form>
    `);

    updateTenantAiModels(id, currentModel);
}

async function updateTenantAiModels(tenantId, currentModel = null) {
    const provider = document.getElementById('editTenantAiProvider').value;
    const modelSelect = document.getElementById('editTenantAiModel');
    
    modelSelect.innerHTML = '<option value="">Cargando modelos disponibles...</option>';
    modelSelect.disabled = true;

    try {
        const res = await fetch(`/superadmin/api/tenants/${tenantId}/models?provider=${provider}`);
        if (!res.ok) throw new Error('Failed to fetch models');
        
        const data = await res.json();
        const opts = data.models || [];
        
        modelSelect.innerHTML = opts.map(opt => `<option value="${opt}" ${opt === currentModel ? 'selected' : ''}>${opt}</option>`).join('');
    } catch (e) {
        console.error('Error fetching dynamic models:', e);
        let opts = [];
        if (provider === 'openai') opts = ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'];
        else if (provider === 'gemini') opts = ['gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-2.0-flash'];
        else if (provider === 'anthropic') opts = ['claude-3-5-sonnet-20240620', 'claude-3-haiku-20240307'];
        
        modelSelect.innerHTML = opts.map(opt => `<option value="${opt}" ${opt === currentModel ? 'selected' : ''}>${opt}</option>`).join('');
    } finally {
        modelSelect.disabled = false;
    }
}

async function saveTenant(e, id) {
    e.preventDefault();
    try {
        const res = await fetch(`/superadmin/api/tenants/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: document.getElementById('editTenantName').value,
                phone: document.getElementById('editTenantPhone').value,
                plan: document.getElementById('editTenantPlan').value,
                ai_provider: document.getElementById('editTenantAiProvider').value,
                ai_model: document.getElementById('editTenantAiModel').value
            })
        });
        if (res.ok) {
            hideModal();
            loadTenants();
            showToast('✅ Tenant actualizado exitosamente', 'success');
        }
    } catch (error) {
        showToast('❌ Error al guardar tenant', 'error');
    }
}

async function suspendTenant(id) {
    const reason = prompt('Indica el motivo de la suspensión:');
    if (reason === null) return;

    try {
        const res = await fetch(`/superadmin/api/tenants/${id}/suspend`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reason })
        });
        if (res.ok) {
            loadTenants();
            showToast('🚫 Tenant suspendido correctamente', 'info');
        }
    } catch (error) {
        showToast('❌ Error al suspender tenant', 'error');
    }
}

async function deleteTenant(id, name) {
    if (!confirm(`⚠️ ¿Estás SEGURO de eliminar el tenant "${name}" (ID: ${id})?\n\nEsta acción eliminará de forma irreversible todos los datos asociados.`)) {
        return;
    }

    try {
        const res = await fetch(`/superadmin/api/tenants/${id}`, { method: 'DELETE' });
        const data = await res.json();
        if (res.ok && data.success) {
            loadTenants();
            showToast('🗑️ Tenant eliminado definitivamente', 'success');
        } else {
            showToast(data.error || 'Error al eliminar tenant', 'error');
        }
    } catch (error) {
        showToast('❌ Error al procesar eliminación', 'error');
    }
}

async function activateTenant(id) {
    try {
        const res = await fetch(`/superadmin/api/tenants/${id}/activate`, { method: 'POST' });
        if (res.ok) {
            loadTenants();
            showToast('✅ Tenant reactivado correctamente', 'success');
        }
    } catch (error) {
        showToast('❌ Error al activar tenant', 'error');
    }
}

// ─── Users ───────────────────────────────────────────────────────────────────
async function loadUsers() {
    try {
        const res = await fetch('/superadmin/api/users');
        usersData = await res.json();
        renderUsersTable(usersData);
    } catch (error) {
        console.error('Error loading users:', error);
        document.getElementById('usersList').innerHTML = '<p style="text-align: center; color: var(--saas-accent-rose);">Error al cargar usuarios</p>';
    }
}

function filterUsersList() {
    const query = (document.getElementById('userSearchInput')?.value || '').toLowerCase().trim();
    if (!query) {
        renderUsersTable(usersData);
        return;
    }
    const filtered = usersData.filter(u => 
        (u.name && u.name.toLowerCase().includes(query)) ||
        (u.email && u.email.toLowerCase().includes(query)) ||
        (u.role && u.role.toLowerCase().includes(query))
    );
    renderUsersTable(filtered);
}

function renderUsersTable(list) {
    const counterEl = document.getElementById('userCount');
    if (counterEl) counterEl.textContent = `${list.length} de ${usersData.length} usuarios`;

    if (!list || list.length === 0) {
        document.getElementById('usersList').innerHTML = `
            <div style="text-align: center; padding: 50px 20px; color: var(--saas-text-muted);">
                <div style="font-size: 2.5rem; margin-bottom: 10px;">👥</div>
                <p style="font-size: 1rem; font-weight: 600; margin: 0;">No se encontraron usuarios</p>
            </div>
        `;
        return;
    }

    const rows = list.map(u => {
        const initial = (u.name || 'U').charAt(0).toUpperCase();
        return `
            <tr>
                <td>
                    <div class="saas-entity-cell">
                        <div class="saas-entity-avatar" style="background: linear-gradient(135deg, rgba(99, 102, 241, 0.15), rgba(168, 85, 247, 0.15)); color: var(--saas-accent-indigo);">
                            ${initial}
                        </div>
                        <div class="saas-entity-info">
                            <h4>${escapeHtml(u.name)}</h4>
                            <p>${escapeHtml(u.email)}</p>
                        </div>
                    </div>
                </td>
                <td>
                    <span class="saas-plan-tag ${u.role === 'superadmin' ? 'saas-plan-enterprise' : 'saas-plan-pro'}">
                        ${escapeHtml(u.role)}
                    </span>
                </td>
                <td>
                    <span style="font-weight: 600; color: var(--saas-text-muted);">${u.store_id ? '#' + u.store_id : '—'}</span>
                </td>
                <td>
                    <span class="saas-plan-tag saas-plan-${(u.plan || 'free').toLowerCase()}">${escapeHtml(u.plan || 'free')}</span>
                </td>
                <td>
                    <div class="saas-action-group">
                        <button class="saas-btn-secondary" style="padding: 5px 10px; font-size: 0.8rem;" onclick="editUser(${u.id})">✏️ Editar</button>
                        <button class="saas-btn-secondary" style="padding: 5px 10px; font-size: 0.8rem;" onclick="resetUserPassword(${u.id})">🔑 Pass</button>
                        ${u.role !== 'superadmin' ? `<button class="saas-btn-danger" style="padding: 5px 10px; font-size: 0.8rem;" onclick="deleteUser(${u.id})">🗑️</button>` : ''}
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    document.getElementById('usersList').innerHTML = `
        <div class="saas-table-responsive">
            <table class="saas-table">
                <thead>
                    <tr>
                        <th>Usuario</th>
                        <th>Rol</th>
                        <th>Tenant ID</th>
                        <th>Plan</th>
                        <th>Acciones</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        </div>
    `;
}

function showCreateUserModal() {
    showModal(`
        <div class="modal-header">
            <h3>Crear Nuevo Usuario</h3>
            <button class="modal-close-btn" onclick="hideModal()">✖</button>
        </div>
        <form onsubmit="createUser(event)">
            <div class="form-group">
                <label>Nombre Completo</label>
                <input type="text" id="newUserName" required placeholder="Ej: María Rodríguez">
            </div>
            <div class="form-group">
                <label>Correo Electrónico</label>
                <input type="email" id="newUserEmail" required placeholder="usuario@empresa.com">
            </div>
            <div class="form-group">
                <label>Contraseña</label>
                <input type="password" id="newUserPassword" required minlength="6" placeholder="Mínimo 6 caracteres">
            </div>
            <div class="form-group">
                <label>Rol en la Plataforma</label>
                <select id="newUserRole">
                    <option value="owner">Owner (Dueño de Local)</option>
                    <option value="admin">Admin (Administrador)</option>
                    <option value="superadmin">Super Admin (Acceso Total)</option>
                </select>
            </div>
            <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 24px;">
                <button type="button" class="saas-btn-secondary" onclick="hideModal()">Cancelar</button>
                <button type="submit" class="saas-btn-primary">➕ Crear Usuario</button>
            </div>
        </form>
    `);
}

async function createUser(e) {
    e.preventDefault();
    try {
        const res = await fetch('/superadmin/api/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: document.getElementById('newUserName').value,
                email: document.getElementById('newUserEmail').value,
                password: document.getElementById('newUserPassword').value,
                role: document.getElementById('newUserRole').value
            })
        });
        if (res.ok) {
            hideModal();
            loadUsers();
            showToast('✅ Usuario creado exitosamente', 'success');
        } else {
            const data = await res.json();
            showToast(`❌ ${data.error || 'Error al crear usuario'}`, 'error');
        }
    } catch (error) {
        showToast('❌ Error al procesar solicitud', 'error');
    }
}

function editUser(id) {
    const user = usersData.find(u => u.id === id);
    if (!user) return;

    showModal(`
        <div class="modal-header">
            <h3>Editar Usuario: ${escapeHtml(user.name)}</h3>
            <button class="modal-close-btn" onclick="hideModal()">✖</button>
        </div>
        <form onsubmit="saveUser(event, ${id})">
            <div class="form-group">
                <label>Nombre</label>
                <input type="text" id="editUserName" value="${escapeHtml(user.name)}" required>
            </div>
            <div class="form-group">
                <label>Email</label>
                <input type="email" id="editUserEmail" value="${escapeHtml(user.email)}" required>
            </div>
            <div class="form-group">
                <label>Rol</label>
                <select id="editUserRole">
                    <option value="owner" ${user.role === 'owner' ? 'selected' : ''}>Owner</option>
                    <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Admin</option>
                    <option value="superadmin" ${user.role === 'superadmin' ? 'selected' : ''}>Super Admin</option>
                </select>
            </div>
            <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 24px;">
                <button type="button" class="saas-btn-secondary" onclick="hideModal()">Cancelar</button>
                <button type="submit" class="saas-btn-primary">💾 Guardar Cambios</button>
            </div>
        </form>
    `);
}

async function saveUser(e, id) {
    e.preventDefault();
    try {
        const res = await fetch(`/superadmin/api/users/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: document.getElementById('editUserName').value,
                email: document.getElementById('editUserEmail').value,
                role: document.getElementById('editUserRole').value
            })
        });
        if (res.ok) {
            hideModal();
            loadUsers();
            showToast('✅ Usuario actualizado', 'success');
        }
    } catch (error) {
        showToast('❌ Error al guardar usuario', 'error');
    }
}

async function resetUserPassword(id) {
    const user = usersData.find(u => u.id === id);
    const newPassword = prompt(`Introduce la nueva contraseña para "${user?.name || 'este usuario'}":`);
    if (!newPassword || newPassword.length < 6) {
        if (newPassword !== null) showToast('❌ La contraseña debe tener al menos 6 caracteres', 'error');
        return;
    }

    try {
        const res = await fetch(`/superadmin/api/users/${id}/reset-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: newPassword })
        });
        if (res.ok) showToast('✅ Contraseña restablecida con éxito', 'success');
    } catch (error) {
        showToast('❌ Error al restablecer contraseña', 'error');
    }
}

async function deleteUser(id) {
    if (!confirm('¿Estás seguro de eliminar este usuario del sistema?')) return;

    try {
        const res = await fetch(`/superadmin/api/users/${id}`, { method: 'DELETE' });
        if (res.ok) {
            loadUsers();
            showToast('✅ Usuario eliminado correctamente', 'success');
        }
    } catch (error) {
        showToast('❌ Error al eliminar usuario', 'error');
    }
}

// ─── Plans ───────────────────────────────────────────────────────────────────
async function loadPlans() {
    try {
        const res = await fetch('/superadmin/api/plans');
        plansData = await res.json();

        if (plansData.length === 0) {
            document.getElementById('plansList').innerHTML = '<p style="text-align: center; color: var(--saas-text-muted);">No hay planes registrados</p>';
            return;
        }

        const cards = plansData.map(p => {
            const limits = typeof p.limits === 'string' ? JSON.parse(p.limits) : (p.limits || {});
            const features = typeof p.features === 'string' ? JSON.parse(p.features) : (p.features || []);

            return `
                <div class="saas-card" style="display: flex; flex-direction: column; justify-content: space-between;">
                    <div>
                        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
                            <div>
                                <h4 style="margin: 0; font-size: 1.2rem; font-weight: 700;">${escapeHtml(p.name)}</h4>
                                <span style="font-size: 0.75rem; color: var(--saas-text-muted); font-family: monospace;">ID: ${escapeHtml(p.id)}</span>
                            </div>
                            <span class="saas-status-badge ${p.active !== false ? 'saas-status-active' : 'saas-status-suspended'}">
                                <span class="saas-status-dot"></span>
                                ${p.active !== false ? 'Activo' : 'Inactivo'}
                            </span>
                        </div>
                        
                        <div style="display: flex; align-items: baseline; gap: 4px; margin-bottom: 12px;">
                            <span style="font-size: 2.2rem; font-weight: 800; color: var(--saas-primary);">$${p.price}</span>
                            <span style="color: var(--saas-text-muted); font-size: 0.85rem;">/ ${p.interval || 'mes'}</span>
                        </div>

                        <p style="font-size: 0.85rem; color: var(--saas-text-muted); margin-bottom: 16px; min-height: 38px;">${escapeHtml(p.description || 'Sin descripción')}</p>
                        
                        <div style="font-size: 0.82rem; margin-bottom: 16px; border-top: 1px solid var(--saas-border); padding-top: 12px;">
                            <div style="font-weight: 600; margin-bottom: 8px; color: var(--saas-text-main);">Características:</div>
                            ${features.map(f => `<div style="padding: 3px 0; color: var(--saas-text-muted);">✓ ${escapeHtml(f)}</div>`).join('')}
                        </div>
                    </div>

                    <div style="border-top: 1px solid var(--saas-border); padding-top: 14px; margin-top: 10px;">
                        <button class="saas-btn-secondary" style="width: 100%;" onclick="editPlan('${p.id}')">✏️ Configurar Plan</button>
                    </div>
                </div>
            `;
        }).join('');

        document.getElementById('plansList').innerHTML = `
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 18px;">
                ${cards}
            </div>
        `;
    } catch (error) {
        console.error('Error loading plans:', error);
    }
}

function showCreatePlanModal() {
    showModal(`
        <div class="modal-header">
            <h3>Crear Nuevo Plan SaaS</h3>
            <button class="modal-close-btn" onclick="hideModal()">✖</button>
        </div>
        <form onsubmit="createPlan(event)">
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                <div class="form-group">
                    <label>ID (Slug único)</label>
                    <input type="text" id="newPlanId" required pattern="[a-z0-9-]+" placeholder="ej: enterprise-plus">
                </div>
                <div class="form-group">
                    <label>Nombre del Plan</label>
                    <input type="text" id="newPlanName" required placeholder="Ej: Plan Enterprise">
                </div>
            </div>
            
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                <div class="form-group">
                    <label>Precio (USD / mes)</label>
                    <input type="number" id="newPlanPrice" required step="0.01" placeholder="99.00">
                </div>
                <div class="form-group">
                    <label>Descripción corta</label>
                    <input type="text" id="newPlanDescription" placeholder="Para empresas grandes">
                </div>
            </div>

            <div class="form-group">
                <label>Características (Una por línea)</label>
                <textarea id="newPlanFeatures" rows="3" placeholder="Mensajes ilimitados&#10;Agentes IA dedicados&#10;Soporte prioritario"></textarea>
            </div>

            <div style="border-top: 1px solid var(--saas-border); padding-top: 14px; margin-top: 8px;">
                <h4 style="margin: 0 0 10px 0; font-size: 0.9rem;">Límites de Uso (-1 = ilimitado)</h4>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                    <div class="form-group">
                        <label>Pedidos/Mes</label>
                        <input type="number" id="newPlanLimitOrders" value="-1">
                    </div>
                    <div class="form-group">
                        <label>Productos Catálogo</label>
                        <input type="number" id="newPlanLimitProducts" value="100">
                    </div>
                </div>
            </div>

            <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 24px;">
                <button type="button" class="saas-btn-secondary" onclick="hideModal()">Cancelar</button>
                <button type="submit" class="saas-btn-primary">➕ Crear Plan</button>
            </div>
        </form>
    `);
}

async function createPlan(e) {
    e.preventDefault();
    try {
        const featuresText = document.getElementById('newPlanFeatures').value;
        const features = featuresText.split('\n').map(f => f.trim()).filter(f => f.length > 0);
        
        const limits = {
            ordersPerMonth: parseInt(document.getElementById('newPlanLimitOrders').value),
            products: parseInt(document.getElementById('newPlanLimitProducts').value),
            drivers: 10,
            whatsappNumbers: 2,
            dbConnections: true,
            multiStore: true,
            apiAccess: true,
            customBranding: true,
            prioritySupport: true
        };

        const res = await fetch('/superadmin/api/plans', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id: document.getElementById('newPlanId').value,
                name: document.getElementById('newPlanName').value,
                price: parseFloat(document.getElementById('newPlanPrice').value),
                description: document.getElementById('newPlanDescription').value,
                features,
                limits
            })
        });
        if (res.ok) {
            hideModal();
            loadPlans();
            showToast('✅ Plan creado exitosamente', 'success');
        }
    } catch (error) {
        showToast('❌ Error al crear plan', 'error');
    }
}

function editPlan(id) {
    const plan = plansData.find(p => p.id === id);
    if (!plan) return;

    const limits = typeof plan.limits === 'string' ? JSON.parse(plan.limits) : (plan.limits || {});
    const features = typeof plan.features === 'string' ? JSON.parse(plan.features) : (plan.features || []);

    showModal(`
        <div class="modal-header">
            <h3>Editar Plan: ${escapeHtml(plan.name)}</h3>
            <button class="modal-close-btn" onclick="hideModal()">✖</button>
        </div>
        <form onsubmit="savePlan(event, '${plan.id}')">
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                <div class="form-group">
                    <label>Nombre del Plan</label>
                    <input type="text" id="editPlanName" value="${escapeHtml(plan.name)}" required>
                </div>
                <div class="form-group">
                    <label>Precio (USD)</label>
                    <input type="number" id="editPlanPrice" value="${plan.price}" step="0.01" required>
                </div>
            </div>
            
            <div class="form-group">
                <label>Descripción</label>
                <input type="text" id="editPlanDescription" value="${escapeHtml(plan.description || '')}">
            </div>

            <div class="form-group">
                <label>Características (Una por línea)</label>
                <textarea id="editPlanFeatures" rows="3">${escapeHtml(features.join('\n'))}</textarea>
            </div>

            <div style="border-top: 1px solid var(--saas-border); padding-top: 14px; margin-top: 8px;">
                <h4 style="margin: 0 0 10px 0; font-size: 0.9rem;">Límites de Uso (-1 = ilimitado)</h4>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                    <div class="form-group">
                        <label>Pedidos/Mes</label>
                        <input type="number" id="editPlanLimitOrders" value="${limits.ordersPerMonth || -1}">
                    </div>
                    <div class="form-group">
                        <label>Productos Catálogo</label>
                        <input type="number" id="editPlanLimitProducts" value="${limits.products || -1}">
                    </div>
                </div>
            </div>

            <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 24px;">
                <button type="button" class="saas-btn-secondary" onclick="hideModal()">Cancelar</button>
                <button type="submit" class="saas-btn-primary">💾 Guardar Cambios</button>
            </div>
        </form>
    `);
}

async function savePlan(e, id) {
    e.preventDefault();
    try {
        const featuresText = document.getElementById('editPlanFeatures').value;
        const features = featuresText.split('\n').map(f => f.trim()).filter(f => f.length > 0);
        
        const limits = {
            ordersPerMonth: parseInt(document.getElementById('editPlanLimitOrders').value),
            products: parseInt(document.getElementById('editPlanLimitProducts').value)
        };

        const res = await fetch(`/superadmin/api/plans/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: document.getElementById('editPlanName').value,
                price: parseFloat(document.getElementById('editPlanPrice').value),
                description: document.getElementById('editPlanDescription').value,
                features,
                limits
            })
        });
        if (res.ok) {
            hideModal();
            loadPlans();
            showToast('✅ Plan actualizado correctamente', 'success');
        }
    } catch (error) {
        showToast('❌ Error al guardar plan', 'error');
    }
}

// ─── AI Status ───────────────────────────────────────────────────────────────
async function loadAiStatus() {
    try {
        const res = await fetch('/superadmin/api/ai-status');
        const data = await res.json();

        if (data.length === 0) {
            document.getElementById('aiStatusList').innerHTML = '<p style="text-align: center; color: var(--saas-text-muted);">No hay agentes registrados</p>';
            return;
        }

        const rows = data.map(a => `
            <tr>
                <td>
                    <div class="saas-entity-cell">
                        <div class="saas-entity-avatar" style="background: rgba(6, 182, 212, 0.12); color: var(--saas-accent-cyan);">🧠</div>
                        <div class="saas-entity-info">
                            <h4>${escapeHtml(a.name)}</h4>
                            <p>${escapeHtml(a.business_type || 'general')}</p>
                        </div>
                    </div>
                </td>
                <td>
                    <span class="saas-plan-tag saas-plan-pro">${escapeHtml(a.ai_provider || 'openai')}</span>
                </td>
                <td>
                    <span style="font-family: monospace; font-weight: 600;">${escapeHtml(a.ai_model || 'gpt-4o')}</span>
                </td>
                <td>${a.has_api_key ? '<span class="saas-status-badge saas-status-active"><span class="saas-status-dot"></span> Configurada</span>' : '<span class="saas-status-badge saas-status-suspended"><span class="saas-status-dot"></span> Sin Key</span>'}</td>
                <td style="text-align: center; font-weight: 600;">${a.active_conversations || 0}</td>
                <td style="text-align: center; font-weight: 600;">${a.orders_today || 0}</td>
            </tr>
        `).join('');

        document.getElementById('aiStatusList').innerHTML = `
            <div class="saas-table-responsive">
                <table class="saas-table">
                    <thead>
                        <tr>
                            <th>Tenant / Negocio</th>
                            <th>Proveedor IA</th>
                            <th>Modelo Cognitivo</th>
                            <th>API Key</th>
                            <th style="text-align: center;">Conversaciones Activas</th>
                            <th style="text-align: center;">Pedidos Hoy</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        `;
    } catch (error) {
        console.error('Error loading AI status:', error);
    }
}

// ─── WhatsApp Status ─────────────────────────────────────────────────────────
async function loadWhatsAppStatus() {
    try {
        const res = await fetch('/superadmin/api/whatsapp-status');
        const data = await res.json();

        if (data.length === 0) {
            document.getElementById('whatsappStatusList').innerHTML = '<p style="text-align: center; color: var(--saas-text-muted);">No hay instancias de WhatsApp registradas</p>';
            return;
        }

        const rows = data.map(w => `
            <tr>
                <td>
                    <div class="saas-entity-cell">
                        <div class="saas-entity-avatar" style="background: rgba(16, 185, 129, 0.12); color: var(--saas-primary);">📱</div>
                        <div class="saas-entity-info">
                            <h4>${escapeHtml(w.name)}</h4>
                        </div>
                    </div>
                </td>
                <td style="font-family: monospace; font-weight: 600;">${escapeHtml(w.phone || '—')}</td>
                <td>
                    <span class="saas-plan-tag saas-plan-pro">${escapeHtml(w.whatsapp_provider || 'baileys')}</span>
                </td>
                <td>
                    ${w.whatsapp_status === 'connected'
                        ? '<span class="saas-status-badge saas-status-active"><span class="saas-status-dot"></span> En Línea</span>'
                        : '<span class="saas-status-badge saas-status-suspended"><span class="saas-status-dot"></span> Desconectado</span>'
                    }
                </td>
            </tr>
        `).join('');

        document.getElementById('whatsappStatusList').innerHTML = `
            <div class="saas-table-responsive">
                <table class="saas-table">
                    <thead>
                        <tr>
                            <th>Tenant</th>
                            <th>Teléfono Vinculado</th>
                            <th>Motor / Proveedor</th>
                            <th>Estado de Conexión</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        `;
    } catch (error) {
        console.error('Error loading WhatsApp status:', error);
    }
}

// ─── DB Connections ──────────────────────────────────────────────────────────
async function loadDbConnections() {
    try {
        const res = await fetch('/superadmin/api/db-connections');
        const data = await res.json();

        if (data.length === 0) {
            document.getElementById('dbConnectionsList').innerHTML = '<p style="text-align: center; color: var(--saas-text-muted);">No hay conexiones de BD externas configuradas</p>';
            return;
        }

        const rows = data.map(c => `
            <tr>
                <td>
                    <div class="saas-entity-cell">
                        <div class="saas-entity-avatar" style="background: rgba(245, 158, 11, 0.12); color: var(--saas-accent-amber);">🗄️</div>
                        <div class="saas-entity-info">
                            <h4>${escapeHtml(c.store_name)}</h4>
                        </div>
                    </div>
                </td>
                <td>
                    <span class="saas-plan-tag saas-plan-enterprise">${escapeHtml(c.db_type)}</span>
                </td>
                <td style="font-family: monospace;">${escapeHtml(c.host || '—')}:${c.port || '—'}</td>
                <td style="font-weight: 600;">${escapeHtml(c.database_name || '—')}</td>
                <td>${escapeHtml(c.table_name || '—')}</td>
                <td style="font-size: 0.8rem; color: var(--saas-text-muted);">${c.last_sync ? new Date(c.last_sync).toLocaleString() : 'Nunca'}</td>
            </tr>
        `).join('');

        document.getElementById('dbConnectionsList').innerHTML = `
            <div class="saas-table-responsive">
                <table class="saas-table">
                    <thead>
                        <tr>
                            <th>Tenant</th>
                            <th>Motor BD</th>
                            <th>Host : Puerto</th>
                            <th>Base de Datos</th>
                            <th>Tabla Vinculada</th>
                            <th>Última Sincronización</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        `;
    } catch (error) {
        console.error('Error loading DB connections:', error);
    }
}

// ─── Audit Log ───────────────────────────────────────────────────────────────
async function loadAuditLog(page = 1) {
    currentAuditPage = page;
    try {
        const res = await fetch(`/superadmin/api/audit?page=${page}&limit=20`);
        const data = await res.json();

        if (data.logs.length === 0) {
            document.getElementById('auditLogList').innerHTML = '<p style="text-align: center; color: var(--saas-text-muted);">No hay registros de auditoría recientes</p>';
            return;
        }

        const rows = data.logs.map(l => `
            <tr>
                <td style="font-size: 0.82rem; color: var(--saas-text-muted); white-space: nowrap;">${new Date(l.created_at).toLocaleString()}</td>
                <td style="font-weight: 600;">${escapeHtml(l.admin_name || '—')}</td>
                <td>
                    <span class="saas-plan-tag saas-plan-pro">${escapeHtml(l.action)}</span>
                </td>
                <td>${escapeHtml(l.target_type || '—')} #${l.target_id || '—'}</td>
                <td style="font-size: 0.8rem; color: var(--saas-text-muted); max-width: 250px; overflow: hidden; text-overflow: ellipsis;">
                    ${l.details ? escapeHtml(l.details).substring(0, 80) + '...' : '—'}
                </td>
            </tr>
        `).join('');

        document.getElementById('auditLogList').innerHTML = `
            <div class="saas-table-responsive">
                <table class="saas-table">
                    <thead>
                        <tr>
                            <th>Fecha & Hora</th>
                            <th>Administrador</th>
                            <th>Acción</th>
                            <th>Destino</th>
                            <th>Detalles</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        `;

        let paginationHtml = '';
        if (data.totalPages > 1) {
            for (let i = 1; i <= data.totalPages; i++) {
                paginationHtml += `<button class="saas-btn-secondary" style="padding: 6px 12px; font-size: 0.85rem; ${i === currentAuditPage ? 'background: var(--saas-primary); color: white;' : ''}" onclick="loadAuditLog(${i})">${i}</button>`;
            }
        }
        document.getElementById('auditPagination').innerHTML = paginationHtml;
    } catch (error) {
        console.error('Error loading audit log:', error);
    }
}

// ─── Modal & Helpers ─────────────────────────────────────────────────────────
function showModal(html) {
    const overlay = document.getElementById('modalOverlay');
    const content = document.getElementById('modalContent');
    content.innerHTML = html;
    overlay.style.display = 'flex';
}

function hideModal() {
    const overlay = document.getElementById('modalOverlay');
    if (overlay) overlay.style.display = 'none';
}

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `saas-toast ${type}`;
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed;
        bottom: 24px;
        right: 24px;
        padding: 12px 20px;
        border-radius: 12px;
        color: white;
        font-weight: 600;
        font-size: 0.9rem;
        z-index: 9999;
        box-shadow: 0 8px 24px rgba(0,0,0,0.25);
        animation: saasModalScaleUp 0.25s ease;
        backdrop-filter: blur(10px);
    `;
    if (type === 'success') toast.style.background = 'linear-gradient(135deg, #10b981, #059669)';
    else if (type === 'error') toast.style.background = 'linear-gradient(135deg, #f43f5e, #e11d48)';
    else toast.style.background = 'linear-gradient(135deg, #0284c7, #0369a1)';
    
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3200);
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Global modal close on Escape key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hideModal();
});
