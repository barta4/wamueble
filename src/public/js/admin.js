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
    loadHostelMode();
    initSockets();
    checkActiveHandoffs();

    // Soporte para navegar directamente por hash URL (ej: /admin#whatsapp)
    if (window.location.hash) {
        const hashTab = window.location.hash.replace('#tab-', '').replace('#', '');
        if (document.getElementById(`tab-${hashTab}`)) {
            switchTab(hashTab);
        }
    }
});

async function loadCategories() {
    try {
        const res = await fetch('/api/store');
        if (res.ok) {
            const store = await res.json();
            const select = document.getElementById('categoryOptions');
            if (select) {
                select.innerHTML = '';
                const cats = store.categories_parsed || ["Pizzas", "Empanadas", "Bebidas", "Postres", "General"];
                cats.forEach(c => {
                    const opt = document.createElement('option');
                    opt.value = c;
                    select.appendChild(opt);
                });
            }
        }
    } catch (e) {
        console.error("Error al cargar categorías", e);
    }
}

// ─── Navegación Moderna de Fila Única & Dropdowns Flotantes ───────────

const DROPDOWN_PARENT = {
    products: 'dropdownCatalog',
    services: 'dropdownCatalog',
    rooms: 'dropdownCatalog',
    bookings: 'dropdownCatalog',
    appointments: 'dropdownAppointments',
    doctors: 'dropdownAppointments',
    settings: 'dropdownSettings',
    drivers: 'dropdownSettings',
    whatsapp: 'dropdownSettings',
    sheets: 'dropdownSettings',
    excel: 'dropdownSettings',
    database: 'dropdownSettings',
    history: 'dropdownSettings'
};

/**
 * Abrir / Cerrar Dropdown específico.
 */
function toggleNavDropdown(dropdownId, event) {
    if (event) {
        event.stopPropagation();
    }
    const targetDropdown = document.getElementById(dropdownId);
    if (!targetDropdown) return;
    const isOpen = targetDropdown.classList.contains('open');

    // Cerrar cualquier otro dropdown abierto
    document.querySelectorAll('.nav-dropdown.open').forEach(d => {
        if (d !== targetDropdown) d.classList.remove('open');
    });

    if (isOpen) {
        targetDropdown.classList.remove('open');
    } else {
        targetDropdown.classList.add('open');
    }
}

/**
 * Seleccionar opción dentro de un dropdown y cerrarlo.
 */
function selectDropdownOption(tab, dropdownId) {
    const dropdown = document.getElementById(dropdownId);
    if (dropdown) dropdown.classList.remove('open');
    switchTab(tab);
}

// Cerrar dropdowns si se hace clic afuera
document.addEventListener('click', (e) => {
    if (!e.target.closest('.nav-dropdown')) {
        document.querySelectorAll('.nav-dropdown.open').forEach(d => d.classList.remove('open'));
    }
});

// Cerrar con Escape
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        document.querySelectorAll('.nav-dropdown.open').forEach(d => d.classList.remove('open'));
    }
});

/**
 * Cambiar de Pestaña / Sección.
 */
function switchTab(tab) {
    // Cerrar dropdowns abiertos
    document.querySelectorAll('.nav-dropdown.open').forEach(d => d.classList.remove('open'));

    const parentDropdownId = DROPDOWN_PARENT[tab] || null;

    // 1. Activar / Desactivar botones de la barra principal
    document.querySelectorAll('.modern-nav-btn').forEach(btn => btn.classList.remove('active'));

    if (parentDropdownId) {
        const trigger = document.querySelector(`#${parentDropdownId} .dropdown-trigger`);
        if (trigger) trigger.classList.add('active');
    } else {
        const directBtn = document.querySelector(`.modern-nav-btn[data-tab="${tab}"]`);
        if (directBtn) directBtn.classList.add('active');
    }

    // 2. Activar items dentro de los dropdowns, drawer y bottom nav
    document.querySelectorAll('.dropdown-item, .drawer-item, .b-nav-item').forEach(btn => {
        if (btn.getAttribute('data-tab') === tab) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    // 3. Activar contenido de la sección
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    const targetTabContent = document.getElementById(`tab-${tab}`);
    if (targetTabContent) {
        targetTabContent.classList.add('active');
    }

    // 4. Layout especial y ergonomía para chats
    const main = document.querySelector('.admin-main');
    const bottomNav = document.getElementById('adminBottomNav');
    if (main) {
        if (tab === 'chats') {
            main.classList.add('chat-mode');
            document.body.classList.add('chat-active-body');
            if (bottomNav) bottomNav.style.display = 'none';
        } else {
            main.classList.remove('chat-mode');
            document.body.classList.remove('chat-active-body');
            if (bottomNav) bottomNav.style.display = '';
        }
    }

    // 5. Cargar datos según el tab
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
    if (tab === 'sheets') loadGoogleSheetsConfig();
}

/**
 * Cambiar tab y cerrar el drawer móvil automáticamente.
 */
function switchTabAndCloseDrawer(tab) {
    switchTab(tab);
    closeAdminDrawer();
}

/**
 * Conmutar módulos principales (usado en vistas compactas / móviles).
 */
function switchModule(module) {
    if (module === 'catalog') switchTab('products');
    else if (module === 'settings') switchTab('settings');
    else switchTab(module);
}

/**
 * Abrir el Drawer Lateral Móvil.
 */
function openAdminDrawer() {
    const drawer = document.getElementById('adminDrawer');
    const overlay = document.getElementById('adminDrawerOverlay');
    if (drawer) drawer.classList.add('open');
    if (overlay) overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
}

/**
 * Cerrar el Drawer Lateral Móvil.
 */
function closeAdminDrawer() {
    const drawer = document.getElementById('adminDrawer');
    const overlay = document.getElementById('adminDrawerOverlay');
    if (drawer) drawer.classList.remove('open');
    if (overlay) overlay.classList.remove('open');
    document.body.style.overflow = '';
}

/**
 * Alternar apertura del Drawer.
 */
function toggleAdminDrawer() {
    const drawer = document.getElementById('adminDrawer');
    if (drawer && drawer.classList.contains('open')) {
        closeAdminDrawer();
    } else {
        openAdminDrawer();
    }
}

/**
 * Conmutar tema global y sincronizar icono del drawer.
 */
function toggleThemeGlobal() {
    const themeBtn = document.getElementById('themeToggleBtn');
    if (themeBtn) {
        themeBtn.click();
        const drawerThemeIcon = document.getElementById('drawerThemeIcon');
        if (drawerThemeIcon) {
            drawerThemeIcon.textContent = themeBtn.textContent || '🌙';
        }
    }
}

/**
 * Actualizar opacidad de indicadores de scroll en la barra horizontal.
 */
function updateTabsScrollFades() {
    const tabsBar = document.getElementById('adminTabsBar');
    const fadeLeft = document.querySelector('.tabs-scroll-fade.fade-left');
    const fadeRight = document.querySelector('.tabs-scroll-fade.fade-right');
    if (!tabsBar || !fadeLeft || !fadeRight) return;

    const scrollLeft = tabsBar.scrollLeft;
    const maxScroll = tabsBar.scrollWidth - tabsBar.clientWidth;

    fadeLeft.style.opacity = scrollLeft > 10 ? '0.9' : '0';
    fadeRight.style.opacity = scrollLeft < (maxScroll - 10) ? '0.9' : '0';
}

// Inicializar listener de scroll en la barra horizontal
document.addEventListener('DOMContentLoaded', () => {
    const tabsBar = document.getElementById('adminTabsBar');
    if (tabsBar) {
        tabsBar.addEventListener('scroll', updateTabsScrollFades, { passive: true });
        updateTabsScrollFades();
    }
});

/**
 * Sincronizar todos los badges de alerta de handoff humano (barra, drawer y bottom nav).
 */
function updateHandoffBadges(show) {
    const displayVal = show ? 'inline-block' : 'none';
    ['chatsHandoffBadge', 'chatsHandoffBadgeDrawer', 'chatsHandoffBadgeBottom'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = displayVal;
    });
}

// ─── Productos CRUD ────────────────────────────

/**
 * Cargar lista de productos.
 */
// ─── Variables de Catálogo & Fichas ────────────────────────────
let rawProductsCache = [];
let rawServicesCache = [];
let currentActiveFichaItem = null;
window._removeCurrentImage = false;

/**
 * Cargar catálogo completo de productos y servicios.
 */
async function loadProducts() {
    const productsContainer = document.getElementById('productsList');
    const servicesContainer = document.getElementById('servicesList');
    
    try {
        const res = await fetch('/api/products');
        if (!res.ok) throw new Error('Error al cargar catálogo');
        const allItems = await res.json();

        rawProductsCache = allItems.filter(p => !p.is_service);
        rawServicesCache = allItems.filter(p => p.is_service);

        // Actualizar select de categorías en el toolbar
        updateCatalogCategoryFilter();

        // Renderizar ambas vistas
        filterCatalogItems(false);
        filterCatalogItems(true);
    } catch (error) {
        if (productsContainer) productsContainer.innerHTML = '<div class="loading">Error al cargar productos</div>';
        if (servicesContainer) servicesContainer.innerHTML = '<div class="loading">Error al cargar servicios</div>';
        console.error("Error en loadProducts:", error);
    }
}

/**
 * Actualizar las opciones del filtro de categorías según los productos existentes.
 */
function updateCatalogCategoryFilter() {
    const catSelect = document.getElementById('productCategoryFilter');
    if (!catSelect) return;

    const currentVal = catSelect.value;
    const categories = new Set();
    rawProductsCache.forEach(p => {
        if (p.category && p.category.trim()) categories.add(p.category.trim());
    });

    const sortedCats = Array.from(categories).sort();
    catSelect.innerHTML = '<option value="">Todas las categorías</option>' + 
        sortedCats.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');

    if (categories.has(currentVal)) {
        catSelect.value = currentVal;
    }
}

/**
 * Renderizar una tarjeta Ficha moderna (Producto o Servicio).
 */
function renderProductCard(p, isService = false) {
    let variants = [];
    try {
        if (p.prices_json) {
            variants = typeof p.prices_json === 'string' ? JSON.parse(p.prices_json) : p.prices_json;
        }
    } catch (e) {
        variants = [];
    }

    const skuDisplay = p.sku ? `#${escapeHtml(p.sku)}` : `#${p.id}`;
    const avatarContent = p.image_path
        ? `<img src="${p.image_path}" alt="${escapeHtml(p.name)}" onerror="this.onerror=null; this.parentElement.innerHTML='${isService ? '🛠️' : '📦'}';">`
        : (isService ? '🛠️' : '📦');

    // Chips de precios adicionales / variantes
    let variantChipsHtml = '';
    if (Array.isArray(variants) && variants.length > 0) {
        const previewVariants = variants.slice(0, 2);
        variantChipsHtml = previewVariants.map(v => 
            `<span class="product-card-variant-chip">${escapeHtml(v.label)}: $${Number(v.price).toFixed(2)}</span>`
        ).join('');
        if (variants.length > 2) {
            variantChipsHtml += `<span class="product-card-variant-chip">+${variants.length - 2} más</span>`;
        }
    }

    return `
        <div class="product-card ${p.available ? '' : 'unavailable'}" id="${isService ? 'service' : 'product'}-${p.id}">
            <!-- Header de Tarjeta -->
            <div class="product-card-header">
                <div class="product-card-avatar" onclick="openProductFicha(${p.id})" style="cursor: pointer;" title="Ver ficha">
                    ${avatarContent}
                </div>
                <div class="product-card-title-col">
                    <h4 class="product-card-name" onclick="openProductFicha(${p.id})" style="cursor: pointer;" title="${escapeHtml(p.name)}">
                        ${escapeHtml(p.name)}
                    </h4>
                    <span class="product-card-sku">${skuDisplay}</span>
                </div>
                <span class="product-card-status ${p.available ? 'active' : 'inactive'}" 
                      onclick="event.stopPropagation(); toggleProduct(${p.id})" 
                      title="Click para cambiar disponibilidad">
                    ● ${p.available ? 'ACTIVO' : 'PAUSADO'}
                </span>
            </div>

            <!-- Cuerpo de Tarjeta -->
            <div class="product-card-body">
                <div class="product-card-desc">${escapeHtml(p.description || '')}</div>
                <div class="product-card-price-row">
                    <span class="product-card-price-main">$${Number(p.price).toFixed(2)}</span>
                    ${variantChipsHtml}
                </div>
                <div class="product-card-meta-row">
                    <span class="product-card-category-tag">
                        ${isService ? `⏱️ ${p.duration || 30} min` : `🏷️ ${escapeHtml(p.category || 'General')}`}
                    </span>
                </div>
            </div>

            <!-- Acciones Ficha: 3 Botones -->
            <div class="product-card-actions">
                <button type="button" class="btn-card-action" onclick="openProductFicha(${p.id})">
                    <span>👁️</span> VER FICHA
                </button>
                <button type="button" class="btn-card-action" onclick="openEditProductModal(${p.id}, ${isService ? 'true' : 'false'})">
                    <span>✏️</span> EDITAR
                </button>
                <button type="button" class="btn-card-action btn-card-delete" onclick="deleteProduct(${p.id})">
                    <span>🗑</span> ELIMINAR
                </button>
            </div>
        </div>
    `;
}

/**
 * Filtrar catálogo en tiempo real por búsqueda y categoría.
 */
function filterCatalogItems(isService = false) {
    if (isService) {
        const container = document.getElementById('servicesList');
        if (!container) return;
        const searchInput = document.getElementById('serviceSearchInput');
        const q = searchInput ? searchInput.value.toLowerCase().trim() : '';

        const filtered = rawServicesCache.filter(s => {
            if (!q) return true;
            return (s.name && s.name.toLowerCase().includes(q)) ||
                   (s.sku && s.sku.toLowerCase().includes(q)) ||
                   (s.description && s.description.toLowerCase().includes(q)) ||
                   (String(s.duration || '').includes(q));
        });

        if (filtered.length === 0) {
            container.innerHTML = `
                <div class="empty-state" style="grid-column: 1 / -1;">
                    <div class="empty-icon">🛠️</div>
                    <p>${q ? 'No se encontraron servicios' : 'No hay servicios registrados'}</p>
                    <span>${q ? 'Probá con otro término de búsqueda' : '¡Hacé clic en "+ Nuevo Servicio" para crear uno!'}</span>
                </div>
            `;
        } else {
            container.innerHTML = filtered.map(s => renderProductCard(s, true)).join('');
        }
    } else {
        const container = document.getElementById('productsList');
        if (!container) return;
        const searchInput = document.getElementById('productSearchInput');
        const catSelect = document.getElementById('productCategoryFilter');
        const q = searchInput ? searchInput.value.toLowerCase().trim() : '';
        const cat = catSelect ? catSelect.value.trim() : '';

        const filtered = rawProductsCache.filter(p => {
            const matchesCategory = !cat || (p.category && p.category.trim() === cat);
            if (!matchesCategory) return false;
            if (!q) return true;
            return (p.name && p.name.toLowerCase().includes(q)) ||
                   (p.sku && p.sku.toLowerCase().includes(q)) ||
                   (p.description && p.description.toLowerCase().includes(q)) ||
                   (p.category && p.category.toLowerCase().includes(q));
        });

        if (filtered.length === 0) {
            container.innerHTML = `
                <div class="empty-state" style="grid-column: 1 / -1;">
                    <div class="empty-icon">📦</div>
                    <p>${(q || cat) ? 'No se encontraron productos' : 'No hay productos registrados'}</p>
                    <span>${(q || cat) ? 'Probá con otra categoría o término de búsqueda' : '¡Hacé clic en "+ Nuevo Producto" para crear uno!'}</span>
                </div>
            `;
        } else {
            container.innerHTML = filtered.map(p => renderProductCard(p, false)).join('');
        }
    }
}

/**
 * Buscar un ítem en los caches locales por ID.
 */
function findItemById(id) {
    const numId = Number(id);
    return rawProductsCache.find(p => p.id === numId) || rawServicesCache.find(s => s.id === numId);
}

// ─── Modal Ficha: Apertura, Vista y Edición ────────────────────

/**
 * Abrir la Ficha Técnica del Producto/Servicio en MODO VISTA.
 */
async function openProductFicha(id) {
    let item = findItemById(id);
    if (!item) {
        try {
            const res = await fetch(`/api/products/${id}`);
            if (res.ok) item = await res.json();
        } catch (e) {
            console.error(e);
        }
    }
    if (!item) {
        showToast('❌ No se encontró la ficha del ítem', 'error');
        return;
    }

    currentActiveFichaItem = item;
    const isService = !!item.is_service;

    // Configuración de Cabecera Modal
    document.getElementById('fichaModalIcon').textContent = isService ? '🛠️' : '📦';
    document.getElementById('fichaModalTitle').textContent = isService ? 'Ficha del Servicio' : 'Ficha del Producto';
    document.getElementById('fichaModalSubtitle').textContent = 'Información técnica, precios y sincronización con el Asistente IA';

    // Rellenar Datos Modo Vista
    document.getElementById('fichaViewName').textContent = item.name;
    document.getElementById('fichaViewSku').textContent = item.sku ? `#${item.sku}` : `#${item.id}`;
    
    const statusBadge = document.getElementById('fichaViewStatusBadge');
    statusBadge.textContent = item.available ? '● ACTIVO' : '● PAUSADO';
    statusBadge.className = 'ficha-status-badge ' + (item.available ? 'active' : 'inactive');

    document.getElementById('fichaViewCategory').textContent = '🏷️ ' + (item.category || 'General');
    const durEl = document.getElementById('fichaViewDuration');
    if (isService) {
        durEl.style.display = 'inline-block';
        durEl.textContent = `⏱️ ${item.duration || 30} min`;
    } else {
        durEl.style.display = 'none';
    }

    document.getElementById('fichaViewPrice').textContent = `$${Number(item.price).toFixed(2)}`;
    document.getElementById('fichaViewDesc').textContent = item.description || 'Sin descripción registrada.';

    // Imagen en Vista
    const imgEl = document.getElementById('fichaViewImg');
    const fallbackEl = document.getElementById('fichaViewImgFallback');
    if (item.image_path) {
        imgEl.src = item.image_path;
        imgEl.style.display = 'block';
        fallbackEl.style.display = 'none';
    } else {
        imgEl.style.display = 'none';
        fallbackEl.style.display = 'flex';
        fallbackEl.textContent = isService ? '🛠️' : '📦';
    }

    // Variantes / Precios Múltiples
    let variants = [];
    try {
        if (item.prices_json) {
            variants = typeof item.prices_json === 'string' ? JSON.parse(item.prices_json) : item.prices_json;
        }
    } catch (e) {
        variants = [];
    }

    const variantsBox = document.getElementById('fichaViewVariantsContainer');
    const variantsChips = document.getElementById('fichaViewVariantsChips');
    if (Array.isArray(variants) && variants.length > 0) {
        variantsBox.style.display = 'flex';
        variantsChips.innerHTML = variants.map(v => 
            `<span class="variant-chip">${escapeHtml(v.label)}: <strong>$${Number(v.price).toFixed(2)}</strong></span>`
        ).join('');
    } else {
        variantsBox.style.display = 'none';
        variantsChips.innerHTML = '';
    }

    // Previsualización de Mensaje WhatsApp
    let botMsg = `• *${item.name}*`;
    if (item.sku) botMsg += ` (Cód: ${item.sku})`;
    botMsg += ` — $${Number(item.price).toFixed(2)}`;
    if (Array.isArray(variants) && variants.length > 0) {
        botMsg += `\n  Variantes: ` + variants.map(v => `${v.label}: $${v.price}`).join(' | ');
    }
    if (item.description) {
        botMsg += `\n  _${item.description}_`;
    }
    if (item.image_path) {
        botMsg += `\n  📷 [El bot enviará la imagen del producto]`;
    }
    document.getElementById('fichaBotPreviewText').textContent = botMsg;

    // Cambiar a pestaña vista y abrir modal
    switchFichaMode('view');
    document.getElementById('productFichaModal').classList.add('active');
}

/**
 * Abrir el modal directamente en MODO EDICIÓN para un producto existente.
 */
async function openEditProductModal(id, isService = false) {
    let item = findItemById(id);
    if (!item) {
        try {
            const res = await fetch(`/api/products/${id}`);
            if (res.ok) item = await res.json();
        } catch (e) {
            console.error(e);
        }
    }
    if (!item) {
        showToast('❌ No se encontró el ítem', 'error');
        return;
    }

    currentActiveFichaItem = item;
    window._removeCurrentImage = false;

    // Llenar formulario de edición
    document.getElementById('modalProductId').value = item.id;
    document.getElementById('modalIsService').value = isService ? '1' : '0';
    document.getElementById('modalProductName').value = item.name || '';
    document.getElementById('modalProductSku').value = item.sku || '';
    document.getElementById('modalProductCategory').value = item.category || '';
    document.getElementById('modalProductDuration').value = item.duration || 30;
    document.getElementById('modalProductAvailable').checked = item.available !== undefined ? !!item.available : true;
    document.getElementById('modalProductPrice').value = item.price;
    document.getElementById('modalProductDescription').value = item.description || '';

    // Visibilidad según sea servicio o producto
    document.getElementById('modalCategoryGroup').style.display = isService ? 'none' : 'block';
    document.getElementById('modalDurationGroup').style.display = isService ? 'block' : 'none';

    // Configurar encabezado y botón
    document.getElementById('fichaModalIcon').textContent = isService ? '🛠️' : '📦';
    document.getElementById('fichaModalTitle').textContent = isService ? 'Editar Servicio' : 'Editar Producto';
    document.getElementById('btnSaveModalProduct').textContent = 'Guardar Cambios';

    // Cargar variantes / multi-precios
    const rowsContainer = document.getElementById('modalVariantRowsContainer');
    rowsContainer.innerHTML = '';
    let variants = [];
    try {
        if (item.prices_json) {
            variants = typeof item.prices_json === 'string' ? JSON.parse(item.prices_json) : item.prices_json;
        }
    } catch (e) {
        variants = [];
    }
    if (Array.isArray(variants)) {
        variants.forEach(v => addPriceVariantRow(v.label, v.price));
    }

    // Limpiar inputs de imagen y mostrar preview si ya tiene
    document.getElementById('modalImageFile').value = '';
    document.getElementById('modalImageUrl').value = '';
    const previewBox = document.getElementById('modalImagePreviewBox');
    const previewThumb = document.getElementById('modalImagePreviewThumb');
    const previewName = document.getElementById('modalImagePreviewName');

    if (item.image_path) {
        previewBox.style.display = 'flex';
        previewThumb.src = item.image_path;
        previewName.textContent = item.image_path.split('/').pop();
    } else {
        previewBox.style.display = 'none';
    }

    // Cambiar a pestaña edición y abrir modal
    switchFichaMode('edit');
    document.getElementById('productFichaModal').classList.add('active');
}

/**
 * Abrir el modal para CREAR un NUEVO Producto o Servicio.
 */
function openNewProductModal(isService = false) {
    currentActiveFichaItem = null;
    window._removeCurrentImage = false;

    // Resetear valores de formulario
    document.getElementById('modalProductId').value = '';
    document.getElementById('modalIsService').value = isService ? '1' : '0';
    document.getElementById('modalProductName').value = '';
    document.getElementById('modalProductSku').value = '';
    document.getElementById('modalProductCategory').value = isService ? '' : 'General';
    document.getElementById('modalProductDuration').value = 30;
    document.getElementById('modalProductAvailable').checked = true;
    document.getElementById('modalProductPrice').value = '';
    document.getElementById('modalProductDescription').value = '';

    // Visibilidad según tipo
    document.getElementById('modalCategoryGroup').style.display = isService ? 'none' : 'block';
    document.getElementById('modalDurationGroup').style.display = isService ? 'block' : 'none';

    // Variantes
    document.getElementById('modalVariantRowsContainer').innerHTML = '';

    // Imagen
    document.getElementById('modalImageFile').value = '';
    document.getElementById('modalImageUrl').value = '';
    document.getElementById('modalImagePreviewBox').style.display = 'none';

    // Cabecera y Botón
    document.getElementById('fichaModalIcon').textContent = isService ? '🛠️' : '📦';
    document.getElementById('fichaModalTitle').textContent = isService ? 'Nuevo Servicio' : 'Nuevo Producto';
    document.getElementById('fichaModalSubtitle').textContent = 'Completá los datos para agregarlo al catálogo y al Asistente IA';
    document.getElementById('btnSaveModalProduct').textContent = isService ? 'Crear Servicio' : 'Crear Producto';

    // Conmutar a modo edición
    switchFichaMode('edit');
    document.getElementById('productFichaModal').classList.add('active');
}

/**
 * Cerrar el modal de ficha.
 */
function closeProductFichaModal() {
    const modal = document.getElementById('productFichaModal');
    if (modal) modal.classList.remove('active');
    currentActiveFichaItem = null;
    window._removeCurrentImage = false;
}

/**
 * Clic en el telón de fondo para cerrar.
 */
function handleFichaBackdropClick(event) {
    if (event.target && event.target.id === 'productFichaModal') {
        closeProductFichaModal();
    }
}

/**
 * Cambiar entre Pestaña "Ver Ficha" y Pestaña "Editar Ficha".
 */
function switchFichaMode(mode) {
    const viewSection = document.getElementById('fichaBodyView');
    const editSection = document.getElementById('fichaEditForm');
    const btnView = document.getElementById('fichaTabBtnView');
    const btnEdit = document.getElementById('fichaTabBtnEdit');

    if (mode === 'view') {
        if (!currentActiveFichaItem) {
            switchFichaMode('edit');
            return;
        }
        viewSection.style.display = 'flex';
        editSection.style.display = 'none';
        btnView.classList.add('active');
        btnEdit.classList.remove('active');
    } else {
        if (currentActiveFichaItem && document.getElementById('modalProductId').value !== String(currentActiveFichaItem.id)) {
            openEditProductModal(currentActiveFichaItem.id, !!currentActiveFichaItem.is_service);
        }
        viewSection.style.display = 'none';
        editSection.style.display = 'flex';
        btnView.classList.remove('active');
        btnEdit.classList.add('active');
    }
}

/**
 * Agregar fila de variante / precio adicional.
 */
function addPriceVariantRow(label = '', price = '') {
    const container = document.getElementById('modalVariantRowsContainer');
    if (!container) return;

    const row = document.createElement('div');
    row.className = 'variant-price-row';
    row.innerHTML = `
        <input type="text" class="form-control variant-input-label" placeholder="Nombre (ej: Grande, Kilo, Mayorista)" value="${escapeHtml(label)}">
        <input type="number" step="0.01" class="form-control variant-input-price" placeholder="Precio ($)" value="${price !== '' ? price : ''}">
        <button type="button" class="btn-remove-variant" onclick="removePriceVariantRow(this)" title="Quitar este precio">✕</button>
    `;
    container.appendChild(row);
}

/**
 * Eliminar fila de variante.
 */
function removePriceVariantRow(btn) {
    const row = btn.closest('.variant-price-row');
    if (row) row.remove();
}

/**
 * Manejador para carga de archivo de imagen desde disco.
 */
function handleModalFileChange(event) {
    const file = event.target.files[0];
    if (!file) return;

    window._removeCurrentImage = false;
    document.getElementById('modalImageUrl').value = '';

    const reader = new FileReader();
    reader.onload = function(e) {
        document.getElementById('modalImagePreviewThumb').src = e.target.result;
        document.getElementById('modalImagePreviewName').textContent = file.name;
        document.getElementById('modalImagePreviewBox').style.display = 'flex';
    };
    reader.readAsDataURL(file);
}

/**
 * Manejador para pegar URL de imagen o Google Drive.
 */
function handleModalUrlInput(val) {
    let trimmed = (val || '').trim();
    if (!trimmed) return;

    if (trimmed.includes('drive.google.com') || trimmed.includes('docs.google.com')) {
        const fileMatch = trimmed.match(/\/file\/d\/([a-zA-Z0-9_-]+)/i) || trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/i);
        if (fileMatch) {
            trimmed = `https://drive.google.com/thumbnail?id=${fileMatch[1]}&sz=w1000`;
        }
    } else if (trimmed.includes('dropbox.com') && trimmed.includes('dl=0')) {
        trimmed = trimmed.replace('dl=0', 'dl=1');
    }

    window._removeCurrentImage = false;
    document.getElementById('modalImageFile').value = '';

    document.getElementById('modalImagePreviewThumb').src = trimmed;
    document.getElementById('modalImagePreviewName').textContent = 'URL web vinculada';
    document.getElementById('modalImagePreviewBox').style.display = 'flex';
}

/**
 * Quitar la imagen del producto.
 */
function clearModalImage() {
    document.getElementById('modalImageFile').value = '';
    document.getElementById('modalImageUrl').value = '';
    document.getElementById('modalImagePreviewThumb').src = '';
    document.getElementById('modalImagePreviewBox').style.display = 'none';
    window._removeCurrentImage = true;
}

/**
 * Guardar Cambios o Crear Producto/Servicio desde el Modal de Ficha.
 */
async function saveProductFromModal(event) {
    event.preventDefault();

    const saveBtn = document.getElementById('btnSaveModalProduct');
    const origText = saveBtn.textContent;
    saveBtn.disabled = true;
    saveBtn.textContent = 'Guardando...';

    const id = document.getElementById('modalProductId').value;
    const isService = document.getElementById('modalIsService').value === '1';
    const name = document.getElementById('modalProductName').value.trim();
    const sku = document.getElementById('modalProductSku').value.trim();
    const category = document.getElementById('modalProductCategory').value.trim();
    const duration = document.getElementById('modalProductDuration').value;
    const available = document.getElementById('modalProductAvailable').checked ? 1 : 0;
    const price = parseFloat(document.getElementById('modalProductPrice').value);
    const description = document.getElementById('modalProductDescription').value.trim();

    // Recolectar variantes de precios
    const variantRows = document.querySelectorAll('#modalVariantRowsContainer .variant-price-row');
    const variants = [];
    variantRows.forEach(row => {
        const vLabel = row.querySelector('.variant-input-label')?.value.trim();
        const vPrice = parseFloat(row.querySelector('.variant-input-price')?.value);
        if (vLabel && !isNaN(vPrice)) {
            variants.push({ label: vLabel, price: vPrice });
        }
    });

    const formData = new FormData();
    formData.append('name', name);
    formData.append('price', price);
    formData.append('sku', sku);
    formData.append('available', available);
    formData.append('description', description);
    formData.append('is_service', isService);
    formData.append('prices_json', JSON.stringify(variants));

    if (isService) {
        formData.append('duration', parseInt(duration) || 30);
    } else {
        formData.append('category', category || 'General');
    }

    // Adjuntar archivo o url o flag de borrado
    const fileInput = document.getElementById('modalImageFile');
    const urlInput = document.getElementById('modalImageUrl');

    if (fileInput.files && fileInput.files[0]) {
        formData.append('image', fileInput.files[0]);
    } else if (urlInput.value && urlInput.value.trim()) {
        formData.append('image_url', urlInput.value.trim());
    } else if (window._removeCurrentImage) {
        formData.append('remove_image', '1');
    }

    try {
        let res;
        if (id) {
            res = await fetch(`/api/products/${id}`, {
                method: 'PUT',
                body: formData
            });
        } else {
            res = await fetch('/api/products', {
                method: 'POST',
                body: formData
            });
        }

        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.error || 'Error al guardar');
        }

        const savedItem = await res.json();
        showToast(`✅ ${isService ? 'Servicio' : 'Producto'} guardado correctamente`, 'success');
        
        closeProductFichaModal();
        await loadProducts();
        
        // Si estábamos editando, abrir la ficha actualizada
        if (savedItem && savedItem.id) {
            openProductFicha(savedItem.id);
        }
    } catch (error) {
        showToast(`❌ Error: ${error.message}`, 'error');
        console.error("Error saving product from modal:", error);
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = origText;
    }
}

/**
 * Toggle disponibilidad de producto directamente desde la tarjeta.
 */
async function toggleProduct(id) {
    try {
        const res = await fetch(`/api/products/${id}/toggle`, { method: 'PATCH' });
        if (!res.ok) throw new Error('Error al cambiar estado');

        const product = await res.json();
        showToast(product.available ? '✅ Activado' : '⏸ Pausado', 'info');
        loadProducts();
    } catch (error) {
        showToast('❌ Error al cambiar estado', 'error');
        console.error(error);
    }
}

/**
 * Eliminar producto o servicio.
 */
async function deleteProduct(id) {
    if (!confirm('¿Estás seguro de eliminar este ítem del catálogo?')) return;

    try {
        const res = await fetch(`/api/products/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Error al eliminar');

        showToast('🗑 Eliminado correctamente', 'info');
        if (currentActiveFichaItem && currentActiveFichaItem.id === Number(id)) {
            closeProductFichaModal();
        }
        loadProducts();
    } catch (error) {
        showToast('❌ Error al eliminar', 'error');
        console.error(error);
    }
}

// ─── Compatibilidad con funciones legadas ────────────────────
function editProduct(id, isService = false) {
    openEditProductModal(id, isService);
}

function resetForm(isService = false) {
    openNewProductModal(isService);
}

async function saveProduct(event, isService = false) {
    saveProductFromModal(event);
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
        updateHandoffBadges(true);
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
        updateHandoffBadges(hasHandoff);
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
            const isClient = !isNote && (m.role === 'human' || m.role === 'user' || m.role === 'client');
            const isOperator = !isNote && !isClient && (Boolean(m.operator) || m.role === 'operator');
            const isMe = !isNote && !isClient && !isOperator;
            const bubbleClass = isNote ? 'private-note' : (isOperator ? 'operator' : (isMe ? 'me' : 'client'));
            
            let senderTag = '';
            if (isNote) {
                senderTag = `<span class="sender-tag-badge" style="background:#fbbf24; color:#000;">📌 Nota Privada (${escapeHtml(m.operator || 'Admin')})</span>`;
            } else if (isOperator) {
                senderTag = `<span class="sender-tag-badge operator">👤 ${escapeHtml(m.operator || 'Operador')}</span>`;
            } else if (isMe) {
                senderTag = `<span class="sender-tag-badge ai">🤖 Asistente IA</span>`;
            }
            
            const processedText = window.ChatProInstance ? window.ChatProInstance.processMessageContent(m.content) : escapeHtml(m.content);

            return `
                <div class="chat-bubble ${bubbleClass}">
                    ${senderTag ? `<div>${senderTag}</div>` : ''}
                    <div class="bubble-text" data-processed="1">${processedText}</div>
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
        
        const isFav = Boolean(data.is_favorite);
        const isArch = Boolean(data.is_archived);
        const archBadge = isArch ? `<span class="chat-archived-banner-badge" id="chatHeaderArchBadge">🗄️ Archivado</span>` : `<span class="chat-archived-banner-badge" id="chatHeaderArchBadge" style="display:none;">🗄️ Archivado</span>`;

        const chatHeaderHtml = window.ChatProInstance ? `
            <div class="chat-header-profile" id="chatHeaderProfile">
                <div class="chat-header-avatar">${displayHeader.substring(0, 2).toUpperCase()}</div>
                <div class="chat-header-info-text">
                    <div style="display:flex; align-items:center; gap:8px;">
                        <span class="chat-header-name">${window.escapeHtml(displayHeader)}</span>
                        ${archBadge}
                    </div>
                    <span class="chat-header-status">${window.formatPhone(phone)}</span>
                </div>
            </div>
            <div class="chat-header-actions" id="chatHeaderActions">
                <div class="chat-header-assign" id="chatHeaderAssign">
                    ${window.ChatProInstance.renderAssignSelectHtml ? window.ChatProInstance.renderAssignSelectHtml(phone, data.assigned_to) : ''}
                </div>
                <button type="button" class="btn-chat-header-action ${isFav ? 'active' : ''}" id="headerBtnFav" onclick="window.ChatProInstance.toggleFavorite('${phone}')" title="${isFav ? 'Quitar de favoritos' : 'Marcar como favorito'}">
                    ⭐
                </button>
                <button type="button" class="btn-chat-header-action ${isArch ? 'active' : ''}" id="headerBtnArch" onclick="window.ChatProInstance.toggleArchive('${phone}')" title="${isArch ? 'Desarchivar chat' : 'Archivar chat'}">
                    ${isArch ? '🗄️ Desarchivar' : '📥 Archivar'}
                </button>
                ${data.needs_human ? 
                    `<button class="btn-resolve-pro" onclick="resolveChat('${phone}')">✅ Resolver</button>` : 
                    `<button class="btn-pause-pro" onclick="pauseChat('${phone}')">⏸️ Pausar IA</button>`}
                <button class="btn-icon-chat" onclick="window.ChatProInstance.toggleInfoPanel()" title="Info del contacto">⋮</button>
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
                                <svg id="recordIcon" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v1a7 7 0 0 1-14 0v-1"/><line x1="12" y1="19" y2="22"/></svg>
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
        // Ergonomía Chatwoot: enfocar automáticamente el input de texto sin scroll
        setTimeout(() => {
            const input = document.getElementById('chatInput');
            if (input) {
                input.focus();
            }
        }, 50);
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

    const isNote = message.role === 'note';
    const isClient = !isNote && (message.role === 'human' || message.role === 'user' || message.role === 'client');
    const isOperator = !isNote && !isClient && (Boolean(message.operator) || message.role === 'operator');
    const isMe = !isNote && !isClient && !isOperator;
    const bubbleClass = isNote ? 'private-note' : (isOperator ? 'operator' : (isMe ? 'me' : 'client'));
    
    let senderTag = '';
    if (isNote) {
        senderTag = `<span class="sender-tag-badge" style="background:#fbbf24; color:#000;">📌 Nota Privada (${escapeHtml(message.operator || 'Admin')})</span>`;
    } else if (isOperator) {
        senderTag = `<span class="sender-tag-badge operator">👤 ${escapeHtml(message.operator || 'Operador')}</span>`;
    } else if (isMe) {
        senderTag = `<span class="sender-tag-badge ai">🤖 Asistente IA</span>`;
    }

    const processedText = window.ChatProInstance ? window.ChatProInstance.processMessageContent(message.content) : escapeHtml(message.content);

    const div = document.createElement('div');
    div.className = `chat-bubble ${bubbleClass}`;
    div.innerHTML = `
        ${senderTag ? `<div>${senderTag}</div>` : ''}
        <div class="bubble-text" data-processed="1">${processedText}</div>
        <div class="bubble-meta">
            <span class="bubble-time">${message.timestamp ? new Date(message.timestamp).toLocaleTimeString('es-UY', { hour: '2-digit', minute: '2-digit' }) : new Date().toLocaleTimeString('es-UY', { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
    `;
    container.appendChild(div);
    scrollToBottom();
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
                const wh = document.getElementById('storeWorkingHours');
                if (wh) wh.value = store.working_hours || '08:00-20:00';
                const sd = document.getElementById('storeSlotDuration');
                if (sd) sd.value = store.slot_duration || 30;
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
    const servicesTab = document.getElementById('tab-services-btn');
    const doctorsTab = document.getElementById('tab-doctors-btn');
    const drawerApt = document.getElementById('drawer-tab-appointments');
    const drawerSrv = document.getElementById('drawer-tab-services');
    const drawerDoc = document.getElementById('drawer-tab-doctors');
    const dropdownAppointments = document.getElementById('dropdownAppointments');
    const drawerGroupClinic = document.getElementById('drawerGroupClinic');

    if (clinicModeEnabled) {
        if (badge) { badge.style.background = '#dbeafe'; badge.style.color = '#2563eb'; }
        if (dot) dot.style.background = '#2563eb';
        if (text) text.textContent = 'Modo: Clínica';
        if (onBtn) onBtn.style.display = 'none';
        if (offBtn) offBtn.style.display = 'inline-flex';
        if (clinicSettings) clinicSettings.style.display = 'block';
        if (dropdownAppointments) dropdownAppointments.style.display = 'inline-block';
        if (drawerGroupClinic) drawerGroupClinic.style.display = 'block';
        if (appointmentsTab) appointmentsTab.style.display = 'flex';
        if (servicesTab) servicesTab.style.display = 'flex';
        if (doctorsTab) doctorsTab.style.display = 'flex';
        if (drawerApt) drawerApt.style.display = 'flex';
        if (drawerSrv) drawerSrv.style.display = 'flex';
        if (drawerDoc) drawerDoc.style.display = 'flex';
    } else {
        if (badge) { badge.style.background = '#dcfce7'; badge.style.color = '#16a34a'; }
        if (dot) dot.style.background = '#16a34a';
        if (text) text.textContent = 'Modo: Tienda';
        if (onBtn) onBtn.style.display = 'inline-flex';
        if (offBtn) offBtn.style.display = 'none';
        if (clinicSettings) clinicSettings.style.display = 'none';
        if (dropdownAppointments) dropdownAppointments.style.display = 'none';
        if (drawerGroupClinic) drawerGroupClinic.style.display = 'none';
        if (appointmentsTab) appointmentsTab.style.display = 'none';
        if (servicesTab) servicesTab.style.display = 'none';
        if (doctorsTab) doctorsTab.style.display = 'none';
        if (drawerApt) drawerApt.style.display = 'none';
        if (drawerSrv) drawerSrv.style.display = 'none';
        if (drawerDoc) drawerDoc.style.display = 'none';
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

// ─── Google Sheets Connector ────────────────────────────

let lastSheetsPreviewData = null;

/**
 * Cargar configuración guardada de Google Sheets.
 */
async function loadGoogleSheetsConfig() {
    try {
        const res = await fetch('/api/sheets/config');
        if (!res.ok) return;
        const data = await res.json();
        
        if (data.success && data.sheetUrl) {
            const urlInput = document.getElementById('googleSheetUrl');
            if (urlInput) urlInput.value = data.sheetUrl;

            const quickSyncCard = document.getElementById('sheetsQuickSyncCard');
            const currentUrlLink = document.getElementById('sheetsCurrentUrlLink');
            const lastSyncText = document.getElementById('sheetsLastSyncText');

            if (quickSyncCard) quickSyncCard.style.display = 'block';
            if (currentUrlLink) currentUrlLink.href = data.sheetUrl;
            if (lastSyncText) {
                if (data.lastSync) {
                    const d = new Date(data.lastSync);
                    lastSyncText.textContent = `Última sincronización: ${d.toLocaleDateString()} a las ${d.toLocaleTimeString()}`;
                } else {
                    lastSyncText.textContent = 'Última sincronización: Pendiente';
                }
            }

            if (data.syncMode) {
                const radio = document.querySelector(`input[name="sheetsSyncMode"][value="${data.syncMode}"]`);
                if (radio) radio.checked = true;
            }

            // Si aún no se ha previsualizado, disparar previsualización silenciosa
            if (!lastSheetsPreviewData) {
                previewGoogleSheetSilent(data.sheetUrl, data.mapping);
            }
        }
    } catch (e) {
        console.error('Error al cargar configuración de Google Sheets:', e);
    }
}

/**
 * Previsualización silenciosa al cargar la configuración existente.
 */
async function previewGoogleSheetSilent(sheetUrl, savedMapping) {
    try {
        const res = await fetch('/api/sheets/preview', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sheetUrl })
        });
        if (!res.ok) return;
        const data = await res.json();
        if (data.success) {
            lastSheetsPreviewData = data;
            renderSheetsMappingAndPreview(data, savedMapping || data.suggestedMapping);
        }
    } catch (e) {
        // Silencioso
    }
}

/**
 * Previsualizar hoja de cálculo de Google Sheets.
 */
async function previewGoogleSheet(e) {
    if (e && e.preventDefault) e.preventDefault();

    const urlInput = document.getElementById('googleSheetUrl');
    const sheetUrl = urlInput ? urlInput.value.trim() : '';

    if (!sheetUrl) {
        showToast('⚠️ Ingresá el enlace de tu Google Sheet', 'error');
        return;
    }

    const btn = document.getElementById('btnPreviewSheets');
    const statusDiv = document.getElementById('sheetsPreviewStatus');
    const mappingSection = document.getElementById('sheetsMappingSection');

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span>⏳</span> Conectando...';
    }

    if (statusDiv) {
        statusDiv.style.display = 'block';
        statusDiv.style.background = 'rgba(59, 130, 246, 0.1)';
        statusDiv.style.color = '#2563eb';
        statusDiv.style.border = '1px solid rgba(59, 130, 246, 0.2)';
        statusDiv.innerHTML = '🔄 Descargando y leyendo datos de la planilla...';
    }

    try {
        const res = await fetch('/api/sheets/preview', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sheetUrl })
        });

        const data = await res.json();

        if (res.ok && data.success) {
            lastSheetsPreviewData = data;

            if (statusDiv) {
                statusDiv.style.background = '#dcfce7';
                statusDiv.style.color = '#16a34a';
                statusDiv.style.border = '1px solid #bbf7d0';
                statusDiv.innerHTML = `✅ <strong>Conexión exitosa:</strong> Se detectaron ${data.totalRows} filas y ${data.headers.length} columnas en la planilla.`;
            }

            renderSheetsMappingAndPreview(data, data.suggestedMapping);
            showToast(`✅ Planilla conectada (${data.totalRows} filas)`, 'success');
        } else {
            if (statusDiv) {
                statusDiv.style.background = '#fee2e2';
                statusDiv.style.color = '#dc2626';
                statusDiv.style.border = '1px solid #fecaca';
                statusDiv.innerHTML = `❌ <strong>Error al conectar:</strong> ${data.error || 'No se pudo leer la planilla'}`;
            }
            if (mappingSection) mappingSection.style.display = 'none';
            showToast(data.error || 'Error al conectar Google Sheet', 'error');
        }
    } catch (err) {
        if (statusDiv) {
            statusDiv.style.background = '#fee2e2';
            statusDiv.style.color = '#dc2626';
            statusDiv.style.border = '1px solid #fecaca';
            statusDiv.innerHTML = `❌ <strong>Error de conexión:</strong> ${err.message}`;
        }
        showToast('Error al conectar con Google Sheets', 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<span>🔍</span> Conectar y Previsualizar';
        }
    }
}

/**
 * Renderiza los selectores de mapeo de columnas y la tabla de previsualización.
 */
function renderSheetsMappingAndPreview(data, selectedMapping = {}) {
    const mappingSection = document.getElementById('sheetsMappingSection');
    const totalRowsBadge = document.getElementById('sheetsTotalRowsBadge');
    if (mappingSection) mappingSection.style.display = 'block';
    if (totalRowsBadge) totalRowsBadge.textContent = `${data.totalRows} filas detectadas`;

    const fields = [
        { id: 'sheetsMapName', key: 'name', required: true },
        { id: 'sheetsMapPrice', key: 'price', required: true },
        { id: 'sheetsMapCategory', key: 'category', required: false },
        { id: 'sheetsMapDescription', key: 'description', required: false },
        { id: 'sheetsMapIsService', key: 'is_service', required: false },
        { id: 'sheetsMapDuration', key: 'duration', required: false },
        { id: 'sheetsMapAvailable', key: 'available', required: false },
        { id: 'sheetsMapImage', key: 'image_path', required: false }
    ];

    fields.forEach(f => {
        const select = document.getElementById(f.id);
        if (!select) return;

        select.innerHTML = '';
        if (!f.required) {
            const optNone = document.createElement('option');
            optNone.value = '';
            optNone.textContent = '-- No asignar / Opcional --';
            select.appendChild(optNone);
        } else {
            const optPrompt = document.createElement('option');
            optPrompt.value = '';
            optPrompt.textContent = '-- Seleccionar columna obligatoria --';
            select.appendChild(optPrompt);
        }

        data.headers.forEach(h => {
            const opt = document.createElement('option');
            opt.value = h;
            opt.textContent = h;
            select.appendChild(opt);
        });

        // Preseleccionar si hay valor
        const targetVal = selectedMapping ? selectedMapping[f.key] : null;
        if (targetVal && data.headers.includes(targetVal)) {
            select.value = targetVal;
        }
    });

    // Renderizar tabla de muestra
    const table = document.getElementById('sheetsPreviewTable');
    if (table && data.sampleRows && data.sampleRows.length > 0) {
        let html = '<thead><tr>';
        data.headers.forEach(h => {
            html += `<th style="padding: 8px 12px; text-align: left; border-bottom: 1px solid var(--border-color); background: var(--bg-surface); white-space: nowrap;">${escapeHtml(h)}</th>`;
        });
        html += '</tr></thead><tbody>';

        data.sampleRows.forEach(row => {
            html += '<tr>';
            data.headers.forEach(h => {
                html += `<td style="padding: 8px 12px; border-bottom: 1px solid var(--border-color); white-space: nowrap;">${escapeHtml(String(row[h] !== undefined ? row[h] : ''))}</td>`;
            });
            html += '</tr>';
        });

        html += '</tbody>';
        table.innerHTML = html;
    }
}

/**
 * Importar productos desde Google Sheets con mapeo confirmado.
 */
async function importGoogleSheetProducts() {
    const urlInput = document.getElementById('googleSheetUrl');
    const sheetUrl = urlInput ? urlInput.value.trim() : '';

    const nameCol = document.getElementById('sheetsMapName') ? document.getElementById('sheetsMapName').value : '';
    const priceCol = document.getElementById('sheetsMapPrice') ? document.getElementById('sheetsMapPrice').value : '';

    if (!sheetUrl) {
        showToast('⚠️ Ingresá el enlace de la planilla', 'error');
        return;
    }

    if (!nameCol || !priceCol) {
        showToast('❌ Mapeá al menos las columnas de Nombre y Precio', 'error');
        return;
    }

    const syncModeRadio = document.querySelector('input[name="sheetsSyncMode"]:checked');
    const syncMode = syncModeRadio ? syncModeRadio.value : 'upsert';

    const columnMapping = {
        name: nameCol,
        price: priceCol,
        category: document.getElementById('sheetsMapCategory') ? document.getElementById('sheetsMapCategory').value : '',
        description: document.getElementById('sheetsMapDescription') ? document.getElementById('sheetsMapDescription').value : '',
        is_service: document.getElementById('sheetsMapIsService') ? document.getElementById('sheetsMapIsService').value : '',
        duration: document.getElementById('sheetsMapDuration') ? document.getElementById('sheetsMapDuration').value : '',
        available: document.getElementById('sheetsMapAvailable') ? document.getElementById('sheetsMapAvailable').value : '',
        image_path: document.getElementById('sheetsMapImage') ? document.getElementById('sheetsMapImage').value : ''
    };

    const btn = document.getElementById('btnImportSheets');
    const resultDiv = document.getElementById('sheetsImportResult');

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span>⏳</span> Sincronizando catálogo...';
    }

    if (resultDiv) {
        resultDiv.style.display = 'block';
        resultDiv.style.background = 'rgba(59, 130, 246, 0.1)';
        resultDiv.style.color = '#2563eb';
        resultDiv.innerHTML = '🔄 Procesando filas y guardando en la base de datos...';
    }

    try {
        const res = await fetch('/api/sheets/import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sheetUrl,
                columnMapping,
                syncMode
            })
        });

        const data = await res.json();

        if (res.ok && data.success) {
            if (resultDiv) {
                resultDiv.style.background = '#dcfce7';
                resultDiv.style.color = '#16a34a';
                resultDiv.innerHTML = `
                    <div style="font-weight: 700; margin-bottom: 4px;">✅ Sincronización exitosa</div>
                    <div>${data.inserted} productos nuevos agregados, ${data.updated} productos existentes actualizados.</div>
                    ${data.errors && data.errors.length > 0 ? `<div style="font-size: 0.8rem; color: #b45309; margin-top: 6px;">⚠️ ${data.errors.length} observaciones registradas.</div>` : ''}
                `;
            }

            showToast(`✅ Catálogo sincronizado (${data.inserted + data.updated} items)`, 'success');
            loadProducts();
            loadGoogleSheetsConfig();
        } else {
            if (resultDiv) {
                resultDiv.style.background = '#fee2e2';
                resultDiv.style.color = '#dc2626';
                resultDiv.innerHTML = `❌ <strong>Error:</strong> ${data.error || 'No se pudo sincronizar el catálogo'}`;
            }
            showToast(data.error || 'Error en sincronización', 'error');
        }
    } catch (err) {
        if (resultDiv) {
            resultDiv.style.background = '#fee2e2';
            resultDiv.style.color = '#dc2626';
            resultDiv.innerHTML = `❌ <strong>Error:</strong> ${err.message}`;
        }
        showToast('Error al sincronizar con Google Sheets', 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<span>📥</span> Sincronizar Catálogo con Google Sheets';
        }
    }
}

/**
 * Sincronización rápida en 1 clic utilizando configuración guardada.
 */
async function quickSyncGoogleSheet() {
    const btn = document.getElementById('btnQuickSyncSheets');
    const resultDiv = document.getElementById('sheetsQuickSyncResult');

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span>⏳</span> Sincronizando...';
    }

    if (resultDiv) {
        resultDiv.style.display = 'block';
        resultDiv.style.background = 'rgba(59, 130, 246, 0.1)';
        resultDiv.style.color = '#2563eb';
        resultDiv.innerHTML = '🔄 Leyendo últimos cambios de la planilla de Google Sheets...';
    }

    try {
        const res = await fetch('/api/sheets/quick-sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        const data = await res.json();

        if (res.ok && data.success) {
            if (resultDiv) {
                resultDiv.style.background = '#dcfce7';
                resultDiv.style.color = '#16a34a';
                resultDiv.innerHTML = `✅ <strong>Sincronizado al instante:</strong> ${data.inserted} agregados, ${data.updated} actualizados.`;
            }

            showToast(`⚡ Catálogo actualizado (${data.inserted + data.updated} cambios)`, 'success');
            loadProducts();
            loadGoogleSheetsConfig();
        } else {
            if (resultDiv) {
                resultDiv.style.background = '#fee2e2';
                resultDiv.style.color = '#dc2626';
                resultDiv.innerHTML = `❌ ${data.error || 'Error en sincronización rápida'}`;
            }
            showToast(data.error || 'Error en sincronización rápida', 'error');
        }
    } catch (err) {
        if (resultDiv) {
            resultDiv.style.background = '#fee2e2';
            resultDiv.style.color = '#dc2626';
            resultDiv.innerHTML = `❌ ${err.message}`;
        }
        showToast('Error al conectar con Google Sheets', 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<span>⚡</span> Sincronizar Ahora (1 Clic)';
        }
    }
}

/**
 * Modales de ayuda de Google Sheets.
 */
function showSheetsHelpModal() {
    const modal = document.getElementById('sheetsHelpModal');
    if (modal) modal.style.display = 'flex';
}

function closeSheetsHelpModal() {
    const modal = document.getElementById('sheetsHelpModal');
    if (modal) modal.style.display = 'none';
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
    const roomsTab = document.getElementById('tab-rooms-btn');
    const drawerBookings = document.getElementById('drawer-tab-bookings');
    const drawerRooms = document.getElementById('drawer-tab-rooms');

    if (hostelModeEnabled) {
        if (badge) {
            badge.style.background = '#fef3c7';
            badge.style.color = '#d97706';
        }
        if (dot) dot.style.background = '#d97706';
        if (text) text.textContent = 'Modo: Hostel';
        if (onBtn) onBtn.style.display = 'none';
        if (offBtn) offBtn.style.display = 'inline-flex';
        if (bookingsTab) bookingsTab.style.display = 'inline-flex';
        if (roomsTab) roomsTab.style.display = 'inline-flex';
        if (drawerBookings) drawerBookings.style.display = 'flex';
        if (drawerRooms) drawerRooms.style.display = 'flex';
    } else {
        if (badge) {
            badge.style.background = '#dcfce7';
            badge.style.color = '#16a34a';
        }
        if (dot) dot.style.background = '#16a34a';
        if (text) text.textContent = 'Modo: Tienda';
        if (onBtn) onBtn.style.display = 'inline-flex';
        if (offBtn) offBtn.style.display = 'none';
        if (bookingsTab) bookingsTab.style.display = 'none';
        if (roomsTab) roomsTab.style.display = 'none';
        if (drawerBookings) drawerBookings.style.display = 'none';
        if (drawerRooms) drawerRooms.style.display = 'none';
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
