/**
 * WaBot SaaS — Super Admin Panel (Client-side)
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

    document.querySelector(`[data-tab="${tab}"]`).classList.add('active');
    document.getElementById(`tab-${tab}`).classList.add('active');

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

        const planBadges = (m.tenantsByPlan || []).map(p =>
            `<span style="background: var(--bg-body); padding: 4px 12px; border-radius: 999px; font-size: 0.85rem;">${p.plan}: ${p.count}</span>`
        ).join(' ');

        document.getElementById('dashboardContent').innerHTML = `
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 24px;">
                <div class="form-card" style="text-align: center;">
                    <div style="font-size: 2rem; margin-bottom: 8px;">🏪</div>
                    <div style="font-size: 2rem; font-weight: 700; color: var(--primary);">${m.totalTenants}</div>
                    <div style="color: var(--text-secondary); font-size: 0.9rem;">Tenants Activos</div>
                </div>
                <div class="form-card" style="text-align: center;">
                    <div style="font-size: 2rem; margin-bottom: 8px;">👥</div>
                    <div style="font-size: 2rem; font-weight: 700; color: var(--primary);">${m.totalUsers}</div>
                    <div style="color: var(--text-secondary); font-size: 0.9rem;">Usuarios</div>
                </div>
                <div class="form-card" style="text-align: center;">
                    <div style="font-size: 2rem; margin-bottom: 8px;">📦</div>
                    <div style="font-size: 2rem; font-weight: 700; color: var(--primary);">${m.ordersThisMonth}</div>
                    <div style="color: var(--text-secondary); font-size: 0.9rem;">Pedidos este Mes</div>
                </div>
                <div class="form-card" style="text-align: center;">
                    <div style="font-size: 2rem; margin-bottom: 8px;">💰</div>
                    <div style="font-size: 2rem; font-weight: 700; color: var(--primary);">$${(m.revenueThisMonth || 0).toLocaleString()}</div>
                    <div style="color: var(--text-secondary); font-size: 0.9rem;">Ingresos este Mes</div>
                </div>
                <div class="form-card" style="text-align: center;">
                    <div style="font-size: 2rem; margin-bottom: 8px;">🚫</div>
                    <div style="font-size: 2rem; font-weight: 700; color: #ef4444;">${m.suspendedTenants}</div>
                    <div style="color: var(--text-secondary); font-size: 0.9rem;">Suspendidos</div>
                </div>
                <div class="form-card" style="text-align: center;">
                    <div style="font-size: 2rem; margin-bottom: 8px;">🛒</div>
                    <div style="font-size: 2rem; font-weight: 700; color: var(--primary);">${m.totalProducts}</div>
                    <div style="color: var(--text-secondary); font-size: 0.9rem;">Productos Total</div>
                </div>
            </div>
            <div class="form-card">
                <h4 style="margin: 0 0 12px 0;">Distribución por Plan</h4>
                <div style="display: flex; gap: 8px; flex-wrap: wrap;">${planBadges || '<span style="color: var(--text-secondary);">Sin datos</span>'}</div>
            </div>
        `;
    } catch (error) {
        console.error('Error loading dashboard:', error);
    }
}

// ─── Tenants ─────────────────────────────────────────────────────────────────
async function loadTenants() {
    try {
        const res = await fetch('/superadmin/api/tenants');
        tenantsData = await res.json();

        document.getElementById('tenantCount').textContent = `${tenantsData.length} tenants`;

        if (tenantsData.length === 0) {
            document.getElementById('tenantsList').innerHTML = '<p style="text-align: center; color: var(--text-secondary);">No hay tenants registrados</p>';
            return;
        }

        const rows = tenantsData.map(t => `
            <tr style="border-bottom: 1px solid var(--border-color);">
                <td style="padding: 12px;">
                    <div style="font-weight: 600;">${escapeHtml(t.name)}</div>
                    <div style="font-size: 0.8rem; color: var(--text-secondary);">${escapeHtml(t.phone || 'Sin teléfono')}</div>
                </td>
                <td style="padding: 12px;">${escapeHtml(t.owner_email || '—')}</td>
                <td style="padding: 12px;">
                    <span style="background: ${t.plan === 'enterprise' ? '#fef3c7' : t.plan === 'pro' ? '#dbeafe' : '#f3f4f6'}; padding: 4px 10px; border-radius: 999px; font-size: 0.8rem; font-weight: 600;">
                        ${t.plan || 'free'}
                    </span>
                </td>
                <td style="padding: 12px; text-align: center;">${t.total_orders || 0}</td>
                <td style="padding: 12px; text-align: center;">${t.total_products || 0}</td>
                <td style="padding: 12px;">
                    ${t.suspended
                        ? '<span style="color: #ef4444; font-weight: 600;">Suspendido</span>'
                        : '<span style="color: #16a34a; font-weight: 600;">Activo</span>'
                    }
                </td>
                <td style="padding: 12px;">
                    <button class="btn-secondary" style="padding: 4px 10px; font-size: 0.8rem;" onclick="editTenant(${t.id})">Editar</button>
                    ${t.suspended
                        ? `<button class="btn-primary" style="padding: 4px 10px; font-size: 0.8rem;" onclick="activateTenant(${t.id})">Activar</button>`
                        : `<button class="btn-danger" style="padding: 4px 10px; font-size: 0.8rem; background: #eab308; color: white;" onclick="suspendTenant(${t.id})">Suspender</button>`
                    }
                    <button class="btn-danger" style="padding: 4px 10px; font-size: 0.8rem; background: #ef4444; color: white; margin-left: 4px;" onclick="deleteTenant(${t.id}, '${escapeHtml(t.name)}')">Eliminar</button>
                </td>
            </tr>
        `).join('');

        document.getElementById('tenantsList').innerHTML = `
            <div style="overflow-x: auto;">
                <table style="width: 100%; border-collapse: collapse; font-size: 0.9rem;">
                    <thead>
                        <tr style="border-bottom: 2px solid var(--border-color); text-align: left;">
                            <th style="padding: 12px;">Tienda</th>
                            <th style="padding: 12px;">Email Owner</th>
                            <th style="padding: 12px;">Plan</th>
                            <th style="padding: 12px; text-align: center;">Pedidos</th>
                            <th style="padding: 12px; text-align: center;">Productos</th>
                            <th style="padding: 12px;">Estado</th>
                            <th style="padding: 12px;">Acciones</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        `;
    } catch (error) {
        console.error('Error loading tenants:', error);
    }
}

async function editTenant(id) {
    const tenant = tenantsData.find(t => t.id === id);
    if (!tenant) return;

    const provider = tenant.ai_provider || 'openai';
    const currentModel = tenant.ai_model || 'gpt-4o';

    showModal(`
        <h3 style="margin: 0 0 16px 0;">Editar Tenant: ${escapeHtml(tenant.name)}</h3>
        <form onsubmit="saveTenant(event, ${id})">
            <div class="form-group">
                <label>Nombre</label>
                <input type="text" id="editTenantName" value="${escapeHtml(tenant.name)}" required style="width: 100%; padding: 10px; border: 1px solid var(--border-color); border-radius: 8px;">
            </div>
            <div class="form-group" style="margin-top: 12px;">
                <label>Teléfono</label>
                <input type="text" id="editTenantPhone" value="${escapeHtml(tenant.phone || '')}" style="width: 100%; padding: 10px; border: 1px solid var(--border-color); border-radius: 8px;">
            </div>
            <div class="form-group" style="margin-top: 12px;">
                <label>Plan</label>
                <select id="editTenantPlan" style="width: 100%; padding: 10px; border: 1px solid var(--border-color); border-radius: 8px;">
                    <option value="free" ${tenant.plan === 'free' ? 'selected' : ''}>Free</option>
                    <option value="pro" ${tenant.plan === 'pro' ? 'selected' : ''}>Pro</option>
                    <option value="enterprise" ${tenant.plan === 'enterprise' ? 'selected' : ''}>Enterprise</option>
                </select>
            </div>
            <div class="form-group" style="margin-top: 12px;">
                <label>Proveedor IA</label>
                <select id="editTenantAiProvider" onchange="updateTenantAiModels(${id})" style="width: 100%; padding: 10px; border: 1px solid var(--border-color); border-radius: 8px;">
                    <option value="openai" ${tenant.ai_provider === 'openai' ? 'selected' : ''}>OpenAI</option>
                    <option value="gemini" ${tenant.ai_provider === 'gemini' ? 'selected' : ''}>Google Gemini</option>
                    <option value="anthropic" ${tenant.ai_provider === 'anthropic' ? 'selected' : ''}>Anthropic</option>
                </select>
            </div>
            <div class="form-group" style="margin-top: 12px;">
                <label>Modelo IA</label>
                <select id="editTenantAiModel" style="width: 100%; padding: 10px; border: 1px solid var(--border-color); border-radius: 8px;">
                    <option value="${currentModel}">${currentModel}</option>
                </select>
            </div>
            <div class="form-actions" style="margin-top: 20px; display: flex; gap: 8px;">
                <button type="submit" class="btn-primary">Guardar</button>
                <button type="button" class="btn-secondary" onclick="hideModal()">Cancelar</button>
            </div>
        </form>
    `);

    // Fetch live models once modal is open
    updateTenantAiModels(id, currentModel);
}

async function updateTenantAiModels(tenantId, currentModel = null) {
    const provider = document.getElementById('editTenantAiProvider').value;
    const modelSelect = document.getElementById('editTenantAiModel');
    
    modelSelect.innerHTML = '<option value="">Cargando modelos...</option>';
    modelSelect.disabled = true;

    try {
        const res = await fetch(`/superadmin/api/tenants/${tenantId}/models?provider=${provider}`);
        if (!res.ok) throw new Error('Failed to fetch models');
        
        const data = await res.json();
        const opts = data.models || [];
        
        modelSelect.innerHTML = opts.map(opt => `<option value="${opt}" ${opt === currentModel ? 'selected' : ''}>${opt}</option>`).join('');
    } catch (e) {
        console.error('Error fetching dynamic models:', e);
        // Fallback
        let opts = [];
        if (provider === 'openai') {
            opts = ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'];
        } else if (provider === 'gemini') {
            opts = ['gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-1.0-pro'];
        } else if (provider === 'anthropic') {
            opts = ['claude-3-5-sonnet-20240620', 'claude-3-opus-20240229', 'claude-3-haiku-20240307'];
        }
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
            showToast('✅ Tenant actualizado', 'success');
        }
    } catch (error) {
        showToast('❌ Error al guardar', 'error');
    }
}

async function suspendTenant(id) {
    const reason = prompt('Motivo de suspensión:');
    if (reason === null) return;

    try {
        const res = await fetch(`/superadmin/api/tenants/${id}/suspend`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reason })
        });
        if (res.ok) {
            loadTenants();
            showToast('🚫 Tenant suspendido', 'info');
        }
    } catch (error) {
        showToast('❌ Error al suspender tenant', 'error');
    }
}

async function deleteTenant(id, name) {
    if (!confirm(`⚠️ ¿Estás SEGURO de eliminar el tenant "${name}" (ID: ${id})?\n\nEsta acción eliminará todos los productos, pedidos, citas y datos asociados. No se puede deshacer.`)) {
        return;
    }

    try {
        const res = await fetch(`/superadmin/api/tenants/${id}`, {
            method: 'DELETE'
        });
        const data = await res.json();
        if (res.ok && data.success) {
            loadTenants();
            showToast('🗑️ Tenant eliminado correctamente', 'success');
        } else {
            showToast(data.error || 'Error al eliminar tenant', 'error');
        }
    } catch (error) {
        showToast('❌ Error al eliminar tenant', 'error');
    }
}

async function activateTenant(id) {
    try {
        const res = await fetch(`/superadmin/api/tenants/${id}/activate`, { method: 'POST' });
        if (res.ok) {
            loadTenants();
            showToast('✅ Tenant activado', 'success');
        }
    } catch (error) {
        showToast('❌ Error al activar', 'error');
    }
}

// ─── Users ───────────────────────────────────────────────────────────────────
async function loadUsers() {
    try {
        const res = await fetch('/superadmin/api/users');
        usersData = await res.json();

        if (usersData.length === 0) {
            document.getElementById('usersList').innerHTML = '<p style="text-align: center; color: var(--text-secondary);">No hay usuarios</p>';
            return;
        }

        const rows = usersData.map(u => `
            <tr style="border-bottom: 1px solid var(--border-color);">
                <td style="padding: 12px;">
                    <div style="font-weight: 600;">${escapeHtml(u.name)}</div>
                    <div style="font-size: 0.8rem; color: var(--text-secondary);">${escapeHtml(u.email)}</div>
                </td>
                <td style="padding: 12px;">
                    <span style="background: ${u.role === 'superadmin' ? '#fef3c7' : '#f3f4f6'}; padding: 4px 10px; border-radius: 999px; font-size: 0.8rem; font-weight: 600;">
                        ${u.role}
                    </span>
                </td>
                <td style="padding: 12px;">${u.store_id || '—'}</td>
                <td style="padding: 12px;">${u.plan || 'free'}</td>
                <td style="padding: 12px;">
                    <button class="btn-secondary" style="padding: 4px 10px; font-size: 0.8rem;" onclick="editUser(${u.id})">Editar</button>
                    <button class="btn-secondary" style="padding: 4px 10px; font-size: 0.8rem;" onclick="resetUserPassword(${u.id})">Reset Pass</button>
                    ${u.role !== 'superadmin' ? `<button class="btn-danger" style="padding: 4px 10px; font-size: 0.8rem; background: #ef4444; color: white;" onclick="deleteUser(${u.id})">Eliminar</button>` : ''}
                </td>
            </tr>
        `).join('');

        document.getElementById('usersList').innerHTML = `
            <div style="overflow-x: auto;">
                <table style="width: 100%; border-collapse: collapse; font-size: 0.9rem;">
                    <thead>
                        <tr style="border-bottom: 2px solid var(--border-color); text-align: left;">
                            <th style="padding: 12px;">Usuario</th>
                            <th style="padding: 12px;">Rol</th>
                            <th style="padding: 12px;">Store ID</th>
                            <th style="padding: 12px;">Plan</th>
                            <th style="padding: 12px;">Acciones</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        `;
    } catch (error) {
        console.error('Error loading users:', error);
    }
}

function showCreateUserModal() {
    showModal(`
        <h3 style="margin: 0 0 16px 0;">Crear Usuario</h3>
        <form onsubmit="createUser(event)">
            <div class="form-group">
                <label>Nombre</label>
                <input type="text" id="newUserName" required style="width: 100%; padding: 10px; border: 1px solid var(--border-color); border-radius: 8px;">
            </div>
            <div class="form-group" style="margin-top: 12px;">
                <label>Email</label>
                <input type="email" id="newUserEmail" required style="width: 100%; padding: 10px; border: 1px solid var(--border-color); border-radius: 8px;">
            </div>
            <div class="form-group" style="margin-top: 12px;">
                <label>Contraseña</label>
                <input type="password" id="newUserPassword" required minlength="6" style="width: 100%; padding: 10px; border: 1px solid var(--border-color); border-radius: 8px;">
            </div>
            <div class="form-group" style="margin-top: 12px;">
                <label>Rol</label>
                <select id="newUserRole" style="width: 100%; padding: 10px; border: 1px solid var(--border-color); border-radius: 8px;">
                    <option value="owner">Owner</option>
                    <option value="admin">Admin</option>
                    <option value="superadmin">Super Admin</option>
                </select>
            </div>
            <div class="form-actions" style="margin-top: 20px; display: flex; gap: 8px;">
                <button type="submit" class="btn-primary">Crear</button>
                <button type="button" class="btn-secondary" onclick="hideModal()">Cancelar</button>
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
            showToast('✅ Usuario creado', 'success');
        } else {
            const data = await res.json();
            showToast(`❌ ${data.error}`, 'error');
        }
    } catch (error) {
        showToast('❌ Error al crear', 'error');
    }
}

function editUser(id) {
    const user = usersData.find(u => u.id === id);
    if (!user) return;

    showModal(`
        <h3 style="margin: 0 0 16px 0;">Editar Usuario: ${escapeHtml(user.name)}</h3>
        <form onsubmit="saveUser(event, ${id})">
            <div class="form-group">
                <label>Nombre</label>
                <input type="text" id="editUserName" value="${escapeHtml(user.name)}" required style="width: 100%; padding: 10px; border: 1px solid var(--border-color); border-radius: 8px;">
            </div>
            <div class="form-group" style="margin-top: 12px;">
                <label>Email</label>
                <input type="email" id="editUserEmail" value="${escapeHtml(user.email)}" required style="width: 100%; padding: 10px; border: 1px solid var(--border-color); border-radius: 8px;">
            </div>
            <div class="form-group" style="margin-top: 12px;">
                <label>Rol</label>
                <select id="editUserRole" style="width: 100%; padding: 10px; border: 1px solid var(--border-color); border-radius: 8px;">
                    <option value="owner" ${user.role === 'owner' ? 'selected' : ''}>Owner</option>
                    <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Admin</option>
                    <option value="superadmin" ${user.role === 'superadmin' ? 'selected' : ''}>Super Admin</option>
                </select>
            </div>
            <div class="form-actions" style="margin-top: 20px; display: flex; gap: 8px;">
                <button type="submit" class="btn-primary">Guardar</button>
                <button type="button" class="btn-secondary" onclick="hideModal()">Cancelar</button>
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
        showToast('❌ Error al guardar', 'error');
    }
}

async function resetUserPassword(id) {
    const user = usersData.find(u => u.id === id);
    const newPassword = prompt(`Nueva contraseña para ${user?.name || 'este usuario'}:`);
    if (!newPassword || newPassword.length < 6) {
        if (newPassword !== null) showToast('❌ Mínimo 6 caracteres', 'error');
        return;
    }

    try {
        const res = await fetch(`/superadmin/api/users/${id}/reset-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: newPassword })
        });
        if (res.ok) showToast('✅ Contraseña actualizada', 'success');
    } catch (error) {
        showToast('❌ Error', 'error');
    }
}

async function deleteUser(id) {
    if (!confirm('¿Eliminar este usuario?')) return;

    try {
        const res = await fetch(`/superadmin/api/users/${id}`, { method: 'DELETE' });
        if (res.ok) {
            loadUsers();
            showToast('✅ Usuario eliminado', 'success');
        }
    } catch (error) {
        showToast('❌ Error al eliminar', 'error');
    }
}

// ─── Plans ───────────────────────────────────────────────────────────────────
async function loadPlans() {
    try {
        const res = await fetch('/superadmin/api/plans');
        plansData = await res.json();

        if (plansData.length === 0) {
            document.getElementById('plansList').innerHTML = '<p style="text-align: center; color: var(--text-secondary);">No hay planes</p>';
            return;
        }

        const cards = plansData.map(p => {
            const limits = typeof p.limits === 'string' ? JSON.parse(p.limits) : (p.limits || {});
            const features = typeof p.features === 'string' ? JSON.parse(p.features) : (p.features || []);

            return `
                <div style="border: 1px solid var(--border-color); border-radius: 12px; padding: 20px; min-width: 250px;">
                    <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 12px;">
                        <div>
                            <h4 style="margin: 0;">${escapeHtml(p.name)}</h4>
                            <div style="font-size: 2rem; font-weight: 700; color: var(--primary);">$${p.price}</div>
                            <div style="color: var(--text-secondary); font-size: 0.85rem;">/${p.interval || 'mes'}</div>
                        </div>
                        <span style="background: ${p.active !== false ? '#dcfce7' : '#fee2e2'}; color: ${p.active !== false ? '#16a34a' : '#dc2626'}; padding: 4px 10px; border-radius: 999px; font-size: 0.8rem;">
                            ${p.active !== false ? 'Activo' : 'Inactivo'}
                        </span>
                    </div>
                    <div style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 12px;">${escapeHtml(p.description || '')}</div>
                    <div style="font-size: 0.85rem; margin-bottom: 12px;">
                        ${features.map(f => `<div style="padding: 2px 0;">✓ ${escapeHtml(f)}</div>`).join('')}
                    </div>
                    <div style="display: flex; gap: 8px;">
                        <button class="btn-secondary" style="flex: 1; padding: 6px; font-size: 0.8rem;" onclick="editPlan('${p.id}')">Editar</button>
                    </div>
                </div>
            `;
        }).join('');

        document.getElementById('plansList').innerHTML = `
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px;">
                ${cards}
            </div>
        `;
    } catch (error) {
        console.error('Error loading plans:', error);
    }
}

function showCreatePlanModal() {
    showModal(`
        <h3 style="margin: 0 0 16px 0;">Crear Plan</h3>
        <form onsubmit="createPlan(event)" style="display: grid; gap: 16px;">
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                <div class="form-group">
                    <label>ID (slug único)</label>
                    <input type="text" id="newPlanId" required pattern="[a-z0-9-]+" style="width: 100%; padding: 10px; border: 1px solid var(--border-color); border-radius: 8px;">
                </div>
                <div class="form-group">
                    <label>Nombre</label>
                    <input type="text" id="newPlanName" required style="width: 100%; padding: 10px; border: 1px solid var(--border-color); border-radius: 8px;">
                </div>
            </div>
            
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                <div class="form-group">
                    <label>Precio (USD)</label>
                    <input type="number" id="newPlanPrice" required step="0.01" style="width: 100%; padding: 10px; border: 1px solid var(--border-color); border-radius: 8px;">
                </div>
                <div class="form-group">
                    <label>Descripción</label>
                    <input type="text" id="newPlanDescription" style="width: 100%; padding: 10px; border: 1px solid var(--border-color); border-radius: 8px;">
                </div>
            </div>

            <div class="form-group">
                <label>Características (Una por línea)</label>
                <textarea id="newPlanFeatures" rows="4" style="width: 100%; padding: 10px; border: 1px solid var(--border-color); border-radius: 8px;"></textarea>
            </div>

            <div style="border-top: 1px solid var(--border-color); padding-top: 16px;">
                <h4 style="margin: 0 0 12px 0;">Límites</h4>
                <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px;">
                    <div class="form-group">
                        <label>Pedidos/Mes (-1=inf)</label>
                        <input type="number" id="newPlanLimitOrders" value="-1" style="width: 100%; padding: 8px; border: 1px solid var(--border-color); border-radius: 8px;">
                    </div>
                    <div class="form-group">
                        <label>Productos</label>
                        <input type="number" id="newPlanLimitProducts" value="100" style="width: 100%; padding: 8px; border: 1px solid var(--border-color); border-radius: 8px;">
                    </div>
                    <div class="form-group">
                        <label>Repartidores</label>
                        <input type="number" id="newPlanLimitDrivers" value="1" style="width: 100%; padding: 8px; border: 1px solid var(--border-color); border-radius: 8px;">
                    </div>
                    <div class="form-group">
                        <label>Nº WhatsApp</label>
                        <input type="number" id="newPlanLimitWA" value="1" style="width: 100%; padding: 8px; border: 1px solid var(--border-color); border-radius: 8px;">
                    </div>
                </div>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                <label style="display: flex; align-items: center; gap: 8px; color: var(--text-primary); cursor: pointer;">
                    <input type="checkbox" id="newPlanLimitDB"> Conexión BD Externa
                </label>
                <label style="display: flex; align-items: center; gap: 8px; color: var(--text-primary); cursor: pointer;">
                    <input type="checkbox" id="newPlanLimitMulti"> Multi-sucursal
                </label>
                <label style="display: flex; align-items: center; gap: 8px; color: var(--text-primary); cursor: pointer;">
                    <input type="checkbox" id="newPlanLimitApi"> Acceso API
                </label>
                <label style="display: flex; align-items: center; gap: 8px; color: var(--text-primary); cursor: pointer;">
                    <input type="checkbox" id="newPlanLimitBranding"> Custom Branding
                </label>
            </div>

            <div class="form-actions" style="margin-top: 10px; display: flex; gap: 8px;">
                <button type="submit" class="btn-primary">Crear</button>
                <button type="button" class="btn-secondary" onclick="hideModal()">Cancelar</button>
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
            drivers: parseInt(document.getElementById('newPlanLimitDrivers').value),
            whatsappNumbers: parseInt(document.getElementById('newPlanLimitWA').value),
            dbConnections: document.getElementById('newPlanLimitDB').checked,
            multiStore: document.getElementById('newPlanLimitMulti').checked,
            apiAccess: document.getElementById('newPlanLimitApi').checked,
            customBranding: document.getElementById('newPlanLimitBranding').checked,
            prioritySupport: false
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
            showToast('✅ Plan creado', 'success');
        }
    } catch (error) {
        showToast('❌ Error al crear', 'error');
    }
}

function editPlan(id) {
    const plan = plansData.find(p => p.id === id);
    if (!plan) return;

    const limits = typeof plan.limits === 'string' ? JSON.parse(plan.limits) : (plan.limits || {});
    const features = typeof plan.features === 'string' ? JSON.parse(plan.features) : (plan.features || []);

    showModal(`
        <h3 style="margin: 0 0 16px 0;">Editar Plan: ${escapeHtml(plan.name)}</h3>
        <form onsubmit="savePlan(event, '${plan.id}')" style="display: grid; gap: 16px;">
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                <div class="form-group">
                    <label>Nombre</label>
                    <input type="text" id="editPlanName" value="${escapeHtml(plan.name)}" required style="width: 100%; padding: 10px; border: 1px solid var(--border-color); border-radius: 8px;">
                </div>
                <div class="form-group">
                    <label>Precio (USD)</label>
                    <input type="number" id="editPlanPrice" value="${plan.price}" step="0.01" style="width: 100%; padding: 10px; border: 1px solid var(--border-color); border-radius: 8px;">
                </div>
            </div>
            
            <div class="form-group">
                <label>Descripción</label>
                <input type="text" id="editPlanDescription" value="${escapeHtml(plan.description || '')}" style="width: 100%; padding: 10px; border: 1px solid var(--border-color); border-radius: 8px;">
            </div>

            <div class="form-group">
                <label>Características (Una por línea)</label>
                <textarea id="editPlanFeatures" rows="4" style="width: 100%; padding: 10px; border: 1px solid var(--border-color); border-radius: 8px;">${escapeHtml(features.join('\n'))}</textarea>
            </div>

            <div style="border-top: 1px solid var(--border-color); padding-top: 16px;">
                <h4 style="margin: 0 0 12px 0;">Límites</h4>
                <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px;">
                    <div class="form-group">
                        <label>Pedidos/Mes (-1=inf)</label>
                        <input type="number" id="editPlanLimitOrders" value="${limits.ordersPerMonth || -1}" style="width: 100%; padding: 8px; border: 1px solid var(--border-color); border-radius: 8px;">
                    </div>
                    <div class="form-group">
                        <label>Productos</label>
                        <input type="number" id="editPlanLimitProducts" value="${limits.products || -1}" style="width: 100%; padding: 8px; border: 1px solid var(--border-color); border-radius: 8px;">
                    </div>
                    <div class="form-group">
                        <label>Repartidores</label>
                        <input type="number" id="editPlanLimitDrivers" value="${limits.drivers || -1}" style="width: 100%; padding: 8px; border: 1px solid var(--border-color); border-radius: 8px;">
                    </div>
                    <div class="form-group">
                        <label>Nº WhatsApp</label>
                        <input type="number" id="editPlanLimitWA" value="${limits.whatsappNumbers || 1}" style="width: 100%; padding: 8px; border: 1px solid var(--border-color); border-radius: 8px;">
                    </div>
                </div>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                <label style="display: flex; align-items: center; gap: 8px; color: var(--text-primary); cursor: pointer;">
                    <input type="checkbox" id="editPlanLimitDB" ${limits.dbConnections ? 'checked' : ''}> Conexión BD Externa
                </label>
                <label style="display: flex; align-items: center; gap: 8px; color: var(--text-primary); cursor: pointer;">
                    <input type="checkbox" id="editPlanLimitMulti" ${limits.multiStore ? 'checked' : ''}> Multi-sucursal
                </label>
                <label style="display: flex; align-items: center; gap: 8px; color: var(--text-primary); cursor: pointer;">
                    <input type="checkbox" id="editPlanLimitApi" ${limits.apiAccess ? 'checked' : ''}> Acceso API
                </label>
                <label style="display: flex; align-items: center; gap: 8px; color: var(--text-primary); cursor: pointer;">
                    <input type="checkbox" id="editPlanLimitBranding" ${limits.customBranding ? 'checked' : ''}> Custom Branding
                </label>
            </div>

            <div class="form-actions" style="margin-top: 10px; display: flex; gap: 8px;">
                <button type="submit" class="btn-primary">Guardar</button>
                <button type="button" class="btn-secondary" onclick="hideModal()">Cancelar</button>
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
            products: parseInt(document.getElementById('editPlanLimitProducts').value),
            drivers: parseInt(document.getElementById('editPlanLimitDrivers').value),
            whatsappNumbers: parseInt(document.getElementById('editPlanLimitWA').value),
            dbConnections: document.getElementById('editPlanLimitDB').checked,
            multiStore: document.getElementById('editPlanLimitMulti').checked,
            apiAccess: document.getElementById('editPlanLimitApi').checked,
            customBranding: document.getElementById('editPlanLimitBranding').checked,
            prioritySupport: false
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
            showToast('✅ Plan actualizado', 'success');
        }
    } catch (error) {
        showToast('❌ Error al guardar', 'error');
    }
}

// ─── AI Status ───────────────────────────────────────────────────────────────
async function loadAiStatus() {
    try {
        const res = await fetch('/superadmin/api/ai-status');
        const data = await res.json();

        if (data.length === 0) {
            document.getElementById('aiStatusList').innerHTML = '<p style="text-align: center; color: var(--text-secondary);">No hay tenants configurados</p>';
            return;
        }

        const rows = data.map(a => `
            <tr style="border-bottom: 1px solid var(--border-color);">
                <td style="padding: 12px;">
                    <div style="font-weight: 600;">${escapeHtml(a.name)}</div>
                    <div style="font-size: 0.8rem; color: var(--text-secondary);">${escapeHtml(a.business_type || 'general')}</div>
                </td>
                <td style="padding: 12px;">
                    <span style="background: #dbeafe; padding: 4px 10px; border-radius: 999px; font-size: 0.8rem; font-weight: 600;">
                        ${escapeHtml(a.ai_provider || 'openai')}
                    </span>
                </td>
                <td style="padding: 12px;">${escapeHtml(a.ai_model || 'gpt-4o')}</td>
                <td style="padding: 12px;">${a.has_api_key ? '✅ Configurado' : '⚠️ Sin API Key'}</td>
                <td style="padding: 12px; text-align: center;">${a.active_conversations || 0}</td>
                <td style="padding: 12px; text-align: center;">${a.orders_today || 0}</td>
            </tr>
        `).join('');

        document.getElementById('aiStatusList').innerHTML = `
            <div style="overflow-x: auto;">
                <table style="width: 100%; border-collapse: collapse; font-size: 0.9rem;">
                    <thead>
                        <tr style="border-bottom: 2px solid var(--border-color); text-align: left;">
                            <th style="padding: 12px;">Tenant</th>
                            <th style="padding: 12px;">Proveedor</th>
                            <th style="padding: 12px;">Modelo</th>
                            <th style="padding: 12px;">API Key</th>
                            <th style="padding: 12px; text-align: center;">Conversaciones</th>
                            <th style="padding: 12px; text-align: center;">Pedidos Hoy</th>
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
            document.getElementById('whatsappStatusList').innerHTML = '<p style="text-align: center; color: var(--text-secondary);">No hay tenants configurados</p>';
            return;
        }

        const rows = data.map(w => `
            <tr style="border-bottom: 1px solid var(--border-color);">
                <td style="padding: 12px;">
                    <div style="font-weight: 600;">${escapeHtml(w.name)}</div>
                </td>
                <td style="padding: 12px;">${escapeHtml(w.phone || '—')}</td>
                <td style="padding: 12px;">
                    <span style="background: #dbeafe; padding: 4px 10px; border-radius: 999px; font-size: 0.8rem; font-weight: 600;">
                        ${escapeHtml(w.whatsapp_provider || 'baileys')}
                    </span>
                </td>
                <td style="padding: 12px;">
                    <span style="color: ${w.whatsapp_status === 'connected' ? '#16a34a' : '#dc2626'}; font-weight: 600;">
                        ${w.whatsapp_status === 'connected' ? '🟢 Conectado' : '🔴 Desconectado'}
                    </span>
                </td>
            </tr>
        `).join('');

        document.getElementById('whatsappStatusList').innerHTML = `
            <div style="overflow-x: auto;">
                <table style="width: 100%; border-collapse: collapse; font-size: 0.9rem;">
                    <thead>
                        <tr style="border-bottom: 2px solid var(--border-color); text-align: left;">
                            <th style="padding: 12px;">Tenant</th>
                            <th style="padding: 12px;">Teléfono</th>
                            <th style="padding: 12px;">Proveedor</th>
                            <th style="padding: 12px;">Estado</th>
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
            document.getElementById('dbConnectionsList').innerHTML = '<p style="text-align: center; color: var(--text-secondary);">No hay conexiones de BD externas configuradas</p>';
            return;
        }

        const rows = data.map(c => `
            <tr style="border-bottom: 1px solid var(--border-color);">
                <td style="padding: 12px;">
                    <div style="font-weight: 600;">${escapeHtml(c.store_name)}</div>
                </td>
                <td style="padding: 12px;">
                    <span style="background: #dbeafe; padding: 4px 10px; border-radius: 999px; font-size: 0.8rem; font-weight: 600;">
                        ${escapeHtml(c.db_type)}
                    </span>
                </td>
                <td style="padding: 12px;">${escapeHtml(c.host || '—')}:${c.port || '—'}</td>
                <td style="padding: 12px;">${escapeHtml(c.database_name || '—')}</td>
                <td style="padding: 12px;">${escapeHtml(c.table_name || '—')}</td>
                <td style="padding: 12px;">${c.last_sync ? new Date(c.last_sync).toLocaleString() : 'Nunca'}</td>
            </tr>
        `).join('');

        document.getElementById('dbConnectionsList').innerHTML = `
            <div style="overflow-x: auto;">
                <table style="width: 100%; border-collapse: collapse; font-size: 0.9rem;">
                    <thead>
                        <tr style="border-bottom: 2px solid var(--border-color); text-align: left;">
                            <th style="padding: 12px;">Tenant</th>
                            <th style="padding: 12px;">Tipo</th>
                            <th style="padding: 12px;">Host:Port</th>
                            <th style="padding: 12px;">Base de Datos</th>
                            <th style="padding: 12px;">Tabla</th>
                            <th style="padding: 12px;">Última Sync</th>
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
            document.getElementById('auditLogList').innerHTML = '<p style="text-align: center; color: var(--text-secondary);">No hay registros de auditoría</p>';
            return;
        }

        const rows = data.logs.map(l => `
            <tr style="border-bottom: 1px solid var(--border-color);">
                <td style="padding: 10px; font-size: 0.85rem;">${new Date(l.created_at).toLocaleString()}</td>
                <td style="padding: 10px; font-size: 0.85rem;">${escapeHtml(l.admin_name || '—')}</td>
                <td style="padding: 10px;">
                    <span style="background: #dbeafe; padding: 2px 8px; border-radius: 999px; font-size: 0.75rem; font-weight: 600;">
                        ${escapeHtml(l.action)}
                    </span>
                </td>
                <td style="padding: 10px; font-size: 0.85rem;">${escapeHtml(l.target_type || '—')} #${l.target_id || '—'}</td>
                <td style="padding: 10px; font-size: 0.8rem; color: var(--text-secondary); max-width: 200px; overflow: hidden; text-overflow: ellipsis;">
                    ${l.details ? escapeHtml(l.details).substring(0, 80) + '...' : '—'}
                </td>
            </tr>
        `).join('');

        document.getElementById('auditLogList').innerHTML = `
            <div style="overflow-x: auto;">
                <table style="width: 100%; border-collapse: collapse; font-size: 0.9rem;">
                    <thead>
                        <tr style="border-bottom: 2px solid var(--border-color); text-align: left;">
                            <th style="padding: 10px;">Fecha</th>
                            <th style="padding: 10px;">Admin</th>
                            <th style="padding: 10px;">Acción</th>
                            <th style="padding: 10px;">Destino</th>
                            <th style="padding: 10px;">Detalles</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        `;

        // Pagination
        let paginationHtml = '';
        if (data.totalPages > 1) {
            for (let i = 1; i <= data.totalPages; i++) {
                paginationHtml += `<button class="btn-secondary" style="padding: 6px 12px; font-size: 0.85rem; ${i === currentAuditPage ? 'background: var(--primary); color: white;' : ''}" onclick="loadAuditLog(${i})">${i}</button>`;
            }
        }
        document.getElementById('auditPagination').innerHTML = paginationHtml;
    } catch (error) {
        console.error('Error loading audit log:', error);
    }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function showModal(html) {
    const overlay = document.getElementById('modalOverlay');
    const content = document.getElementById('modalContent');
    content.innerHTML = html;
    overlay.style.display = 'flex';
}

function hideModal() {
    document.getElementById('modalOverlay').style.display = 'none';
}

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    toast.style.cssText = 'position: fixed; bottom: 24px; right: 24px; padding: 12px 20px; border-radius: 8px; color: white; font-weight: 600; z-index: 9999; animation: slideIn 0.3s ease;';
    if (type === 'success') toast.style.background = '#16a34a';
    else if (type === 'error') toast.style.background = '#dc2626';
    else toast.style.background = '#2563eb';
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Close modal on overlay click
document.getElementById('modalOverlay')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) hideModal();
});
