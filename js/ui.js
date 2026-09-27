// UI Rendering and DOM Interactions

function parseUTCTimestamp(timestampStr) {
    if (!timestampStr) return new Date();
    let cleanStr = timestampStr;
    if (typeof cleanStr === 'string') {
        cleanStr = cleanStr.replace(' ', 'T');
        if (!cleanStr.includes('Z') && !cleanStr.includes('+') && !/-\d{2}:\d{2}$/.test(cleanStr)) {
            cleanStr += 'Z';
        }
    }
    return new Date(cleanStr);
}
window.parseUTCTimestamp = parseUTCTimestamp;

// escapeHtml (XSS-safe HTML escaping) is defined once in js/ui/shared.js, which
// sistema/index.html loads before this file and exposes as a browser global.

/**
 * Switch view tabs in the header and toggle main sections
 * @param {string} view 'local' or 'cocina' or 'fiados'
 */
function switchView(view) {
    const btnAdminDashboard = document.getElementById('btn-admin-dashboard');
    const btnLocal = document.getElementById('btn-local');
    const btnClientes = document.getElementById('btn-clientes');
    const btnResumen = document.getElementById('btn-resumen');
    const btnCocina = document.getElementById('btn-cocina');
    const btnFiados = document.getElementById('btn-fiados');
    const btnCambio = document.getElementById('btn-cambio');
    const btnPedidos = document.getElementById('btn-pedidos');

    const viewAdminDashboard = document.getElementById('view-admin-dashboard');
    const viewLocal = document.getElementById('view-local');
    const viewClientes = document.getElementById('view-clientes');
    const viewResumen = document.getElementById('view-resumen');
    const viewCocina = document.getElementById('view-cocina');
    const viewFiados = document.getElementById('view-fiados');
    const viewCambio = document.getElementById('view-cambio');
    const viewPedidos = document.getElementById('view-pedidos');

    if (btnAdminDashboard) {
        btnAdminDashboard.classList.remove('active');
        btnAdminDashboard.classList.add('inactive');
        btnAdminDashboard.setAttribute('aria-selected', 'false');
    }

    btnLocal.classList.remove('active');
    btnLocal.classList.add('inactive');
    btnLocal.setAttribute('aria-selected', 'false');

    if (btnClientes) {
        btnClientes.classList.remove('active');
        btnClientes.classList.add('inactive');
        btnClientes.setAttribute('aria-selected', 'false');
    }

    if (btnResumen) {
        btnResumen.classList.remove('active');
        btnResumen.classList.add('inactive');
        btnResumen.setAttribute('aria-selected', 'false');
    }

    btnCocina.classList.remove('active');
    btnCocina.classList.add('inactive');
    btnCocina.setAttribute('aria-selected', 'false');

    btnFiados.classList.remove('active');
    btnFiados.classList.add('inactive');
    btnFiados.setAttribute('aria-selected', 'false');

    if (btnCambio) {
        btnCambio.classList.remove('active');
        btnCambio.classList.add('inactive');
        btnCambio.setAttribute('aria-selected', 'false');
    }

    if (btnPedidos) {
        btnPedidos.classList.remove('active');
        btnPedidos.classList.add('inactive');
        btnPedidos.setAttribute('aria-selected', 'false');
    }

    if (viewAdminDashboard) viewAdminDashboard.classList.add('hidden');
    viewLocal.classList.add('hidden');
    if (viewClientes) viewClientes.classList.add('hidden');
    if (viewResumen) viewResumen.classList.add('hidden');
    viewCocina.classList.add('hidden');
    viewFiados.classList.add('hidden');
    if (viewCambio) viewCambio.classList.add('hidden');
    if (viewPedidos) viewPedidos.classList.add('hidden');

    if (view === 'admin-dashboard') {
        if (btnAdminDashboard) {
            btnAdminDashboard.classList.add('active');
            btnAdminDashboard.classList.remove('inactive');
            btnAdminDashboard.setAttribute('aria-selected', 'true');
        }
        if (viewAdminDashboard) viewAdminDashboard.classList.remove('hidden');
    } else if (view === 'local') {
        btnLocal.classList.add('active');
        btnLocal.classList.remove('inactive');
        btnLocal.setAttribute('aria-selected', 'true');
        viewLocal.classList.remove('hidden');
    } else if (view === 'clientes') {
        if (btnClientes) {
            btnClientes.classList.add('active');
            btnClientes.classList.remove('inactive');
            btnClientes.setAttribute('aria-selected', 'true');
        }
        if (viewClientes) viewClientes.classList.remove('hidden');
    } else if (view === 'resumen') {
        if (btnResumen) {
            btnResumen.classList.add('active');
            btnResumen.classList.remove('inactive');
            btnResumen.setAttribute('aria-selected', 'true');
        }
        if (viewResumen) viewResumen.classList.remove('hidden');
    } else if (view === 'cocina') {
        btnCocina.classList.add('active');
        btnCocina.classList.remove('inactive');
        btnCocina.setAttribute('aria-selected', 'true');
        viewCocina.classList.remove('hidden');
    } else if (view === 'fiados') {
        btnFiados.classList.add('active');
        btnFiados.classList.remove('inactive');
        btnFiados.setAttribute('aria-selected', 'true');
        viewFiados.classList.remove('hidden');
    } else if (view === 'cambio') {
        if (btnCambio) {
            btnCambio.classList.add('active');
            btnCambio.classList.remove('inactive');
            btnCambio.setAttribute('aria-selected', 'true');
        }
        if (viewCambio) viewCambio.classList.remove('hidden');
    } else if (view === 'pedidos') {
        if (btnPedidos) {
            btnPedidos.classList.add('active');
            btnPedidos.classList.remove('inactive');
            btnPedidos.setAttribute('aria-selected', 'true');
        }
        if (viewPedidos) viewPedidos.classList.remove('hidden');
    }
}

/**
 * Render search input bar
 * @param {Function} onSearchChange Callback when search query changes
 */
function renderSearchBar(onSearchChange) {
    const container = document.getElementById('search-bar-container');
    if (!container) return;

    // Do not overwrite input if already rendered to prevent focus loss
    if (container.children.length > 0) return;

    container.innerHTML = `
        <div class="search-container">
            <i class="fa-solid fa-magnifying-glass search-icon"></i>
            <input type="text" id="search-input" class="search-input" placeholder="Buscar sabor (ej: mechada)...">
        </div>
    `;

    document.getElementById('search-input').addEventListener('input', (e) => {
        onSearchChange(e.target.value);
    });
}

/**
 * Render category selector filters
 * @param {string} activeCategory Selected category ID
 * @param {Function} onCategoryChange Callback when category changes
 */
function renderCategoryFilterBar(activeCategory, onCategoryChange) {
    const container = document.getElementById('category-filter-container');
    if (!container) return;

    const categories = [
        { id: 'todos', name: 'Todo' },
        { id: 'pastelitos', name: 'Pastelitos' },
        { id: 'bebidas', name: 'Bebidas' },
        { id: 'dulces', name: 'Dulces' }
    ];

    container.innerHTML = '';
    categories.forEach(cat => {
        const btn = document.createElement('button');
        btn.className = `category-pill${activeCategory === cat.id ? ' active' : ''}`;
        btn.innerText = cat.name;
        btn.addEventListener('click', () => onCategoryChange(cat.id));
        container.appendChild(btn);
    });
}

/**
 * Render pending dispatches (en camino) at the top of local display
 * @param {Array} replenishments Current replenishments list
 * @param {Function} onConfirm Callback when user clicks "Recibido"
 */
function renderPendingDispatches(replenishments, onConfirm) {
    const container = document.getElementById('dispatch-container');
    if (!container) return;

    const pending = replenishments.filter(r => r.status === 'en_camino');
    if (pending.length === 0) {
        container.innerHTML = '';
        container.classList.add('hidden');
        return;
    }

    container.classList.remove('hidden');
    container.innerHTML = `
        <div class="dispatch-card">
            <div class="dispatch-card-header">
                <span class="dispatch-card-title">
                    <i class="fa-solid fa-truck-ramp-box animate-pulse"></i> ¡Envío en camino desde la cocina!
                </span>
            </div>
            <ul class="dispatch-list">
                ${pending.map(p => `<li>${p.amount} ${p.unit} de <strong>${p.name}</strong></li>`).join('')}
            </ul>
            <button class="btn-confirm-receipt" id="btn-confirm-receipt">
                <i class="fa-solid fa-square-check"></i> ¡YA LLEGÓ! CONFIRMAR RECIBIDO
            </button>
        </div>
    `;

    const confirmBtn = document.getElementById('btn-confirm-receipt');
    confirmBtn.addEventListener('click', async () => {
        // One batch, one load. Lock the button for the whole round trip so an
        // impatient double tap cannot put the same mercancía in twice.
        if (confirmBtn.disabled) return;
        confirmBtn.disabled = true;
        confirmBtn.style.opacity = '0.6';
        confirmBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> CONFIRMANDO...';
        try {
            await onConfirm();
        } finally {
            // The list re-renders on success; only a failure leaves this node
            // on screen, and then it must be usable again.
            if (document.body.contains(confirmBtn)) {
                confirmBtn.disabled = false;
                confirmBtn.style.opacity = '';
                confirmBtn.innerHTML = '<i class="fa-solid fa-square-check"></i> ¡YA LLEGÓ! CONFIRMAR RECIBIDO';
            }
        }
    });
}

/**
 * Render vitrina list items in the store view, filtered by category and search query
 * @param {Array} products Current products list
 * @param {Function} adjustStock Callback to adjust stock levels (id, amount, clickEvent)
 * @param {string} activeCategory Filter category ID
 * @param {string} searchQuery Filter text query
 */
function renderLocal(products, adjustStock, activeCategory = 'todos', searchQuery = '') {
    const listContainer = document.getElementById('inventory-list');
    if (!listContainer) return;

    // Render POS Quick Access Bar (Productos Frecuentes)
    const quickBarContainer = document.getElementById('pos-quick-items-list');
    if (quickBarContainer && window.SalesManager && window.SalesManager.getQuickProductsList) {
        const quickProducts = window.SalesManager.getQuickProductsList(products);
        if (quickProducts && quickProducts.length > 0) {
            quickBarContainer.innerHTML = quickProducts.map(p => `
                <button class="btn-quick-pos-item" data-id="${p.id}" style="padding: 0.35rem 0.65rem; border-radius: 8px; border: 1px solid var(--color-gold); background: rgba(201, 162, 74, 0.15); color: #FFF; font-weight: 800; font-size: 11px; cursor: pointer; display: flex; align-items: center; gap: 0.35rem;">
                    <i class="fa-solid fa-plus-circle" style="color: var(--color-gold);"></i> ${escapeHtml(p.name)} ($${(p.price || 0).toFixed(2)})
                </button>
            `).join('');

            quickBarContainer.querySelectorAll('.btn-quick-pos-item').forEach(btn => {
                btn.addEventListener('click', () => {
                    const productId = btn.getAttribute('data-id');
                    const targetProduct = products.find(p => p.id === productId);
                    if (targetProduct) {
                        const activeAddToCart = window.handleAddToCart || ((product) => {
                            if (window.SalesManager && window.SalesManager.addToCart) {
                                window.currentCart = window.SalesManager.addToCart(window.currentCart || [], product);
                                window.UIManager.renderActiveCart(window.currentCart, window.handleAddToCart, window.handleRemoveFromCart, window.handleClearCart, window.handleCheckoutCart);
                            }
                        });
                        activeAddToCart(targetProduct);
                    }
                });
            });
        }
    }

    // Render vitrina header summary stats
    const statsContainer = document.getElementById('vitrina-summary-stats');
    if (statsContainer) {
        const pastelitoProducts = products.filter(p => p.category === 'pastelitos');
        const totalStock = pastelitoProducts.reduce((sum, p) => sum + (p.stock || 0), 0);
        const totalMax = pastelitoProducts.reduce((sum, p) => sum + (p.max || 0), 0);
        const totalCritical = pastelitoProducts.filter(p => p.stock <= p.min).length;

        statsContainer.innerHTML = `
            <div class="vitrina-stat-badge gold">
                <i class="fa-solid fa-cookie-bite"></i> 
                <span>Total Vitrina: <strong>${totalStock} / ${totalMax}</strong> piezas</span>
            </div>
            ${totalCritical > 0 ? `
                <div class="vitrina-stat-badge" style="border-color: rgba(239,68,68,0.4); color: var(--color-danger);">
                    <i class="fa-solid fa-triangle-exclamation"></i> 
                    <span>Críticos: <strong>${totalCritical}</strong></span>
                </div>
            ` : `
                <div class="vitrina-stat-badge success">
                    <i class="fa-solid fa-circle-check"></i> 
                    <span>Vitrina Llena</span>
                </div>
            `}
        `;
    }
    
    listContainer.innerHTML = '';

    // Apply category filter
    let filteredProducts = activeCategory === 'todos' 
        ? products 
        : products.filter(p => {
            const cat = (window.StorageManager && window.StorageManager.getProductCategory) 
                ? window.StorageManager.getProductCategory(p) 
                : (p.category || 'pastelitos');
            return cat === activeCategory;
        });

    // Apply search filter
    if (searchQuery.trim() !== '') {
        const query = searchQuery.toLowerCase().trim();
        filteredProducts = filteredProducts.filter(p => p.name.toLowerCase().includes(query));
    }

    if (filteredProducts.length === 0) {
        listContainer.innerHTML = `
            <div style="text-align: center; color: var(--color-text-muted); font-size: 0.875rem; padding: 2rem 0;">
                No se encontraron productos.
            </div>
        `;
        return;
    }

    filteredProducts.forEach(product => {
        const isCritical = product.stock <= product.min;
        const card = document.createElement('div');
        
        card.className = `product-card${isCritical ? ' critical' : ''}`;
        
        const alertBadge = isCritical 
            ? `<span class="badge-alert animate-pulse">¡Falta!</span>` 
            : '';
            
        const stockStyle = isCritical ? 'stock-value critical' : 'stock-value';
        // max=0 is used deliberately for items whose daily stock varies by flavor
        // (pastelería) -- there's no fixed cap to compare against, so just show the
        // count. For items with a real max, stock can still legitimately exceed it
        // (e.g. a delivery bigger than what fits on display) -- don't lose that real
        // count, just don't show a confusing "44 de 34" either.
        const hasMax = product.max > 0;
        const overMax = hasMax && product.stock > product.max;
        let stockOfMaxText;
        if (!hasMax) {
            stockOfMaxText = escapeHtml(product.unit);
        } else if (overMax) {
            stockOfMaxText = `${escapeHtml(product.unit)} <span style="opacity:.7;font-size:.85em;">(vitrina llena, máx. ${product.max})</span>`;
        } else {
            stockOfMaxText = `de ${product.max} ${escapeHtml(product.unit)}`;
        }

        // Find current quantity of this product in the active cart
        const cartItem = (window.currentCart || []).find(item => item.productId === product.id);
        const cartQty = cartItem ? cartItem.quantity : 0;
        const cartQtyDisplay = cartQty > 0 ? cartQty : '';

        card.innerHTML = `
            <div class="product-info">
                <div class="product-header-row">
                    <h3 class="product-name" title="${escapeHtml(product.name)}">${escapeHtml(product.name)}</h3>
                    ${alertBadge}
                </div>
                <p class="product-stock-desc">
                    Quedan: <span class="${stockStyle}">${product.stock}</span> ${stockOfMaxText}
                    <span style="color: var(--color-gold); margin-left: 0.5rem; font-weight: 600;">
                        $${(product.price || 0).toFixed(2)} 
                        <span style="font-size: 0.725rem; font-weight: 400; opacity: 0.8; margin-left: 0.25rem;">(Bs. ${((product.price || 0) * (window.bcvRate || 1)).toFixed(2)})</span>
                    </span>
                </p>
            </div>
            <div style="display: flex; align-items: center; gap: 0.35rem;">
                <input type="tel" data-id="${product.id}" class="cart-qty-input" min="0" value="${cartQtyDisplay}" placeholder="0" inputmode="numeric" pattern="[0-9]*">
                ${cartQty > 0 
                    ? `<button data-id="${product.id}" data-action="increase" class="btn-touch btn-success disabled" disabled title="Ya en cuenta">✓</button>`
                    : `<button data-id="${product.id}" data-action="increase" class="btn-touch btn-success" title="Agregar a la cuenta">+</button>`
                }
            </div>
        `;

        const btnIncrease = card.querySelector('[data-action="increase"]');
        if (btnIncrease && cartQty === 0) {
            btnIncrease.addEventListener('click', (e) => {
                adjustStock(product.id, -1, e);
            });
        }

        const qtyInput = card.querySelector('.cart-qty-input');
        if (qtyInput) {
            qtyInput.setAttribute('readonly', 'readonly');
            qtyInput.style.cursor = 'pointer';
            qtyInput.addEventListener('click', (e) => {
                e.preventDefault();
                e.target.blur();
                openQuantitySelectorModal(product, cartQty, (val) => {
                    if (window.handleCartQtyChange) {
                        window.handleCartQtyChange(product.id, val);
                    }
                });
            });
        }

        listContainer.appendChild(card);
    });

    updateKitchenBadge(products);
}

/**
 * Spawns a floating indicator anim element at the specified screen coordinates
 * @param {number} x clientX Coordinate
 * @param {number} y clientY Coordinate
 * @param {string} text Symbol to show (e.g. '-1', '+1')
 * @param {string} colorClass CSS color class (e.g. 'float-plus', 'float-minus')
 */
function spawnFloatingIndicator(x, y, text, colorClass) {
    if (x === undefined || y === undefined) return;

    const el = document.createElement('div');
    el.className = `floating-indicator ${colorClass}`;
    el.innerText = text;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;

    document.body.appendChild(el);

    // Remove element once CSS animation ends
    setTimeout(() => {
        el.remove();
    }, 800);
}

/**
 * Update the red circle indicator count on the Kitchen tab
 * @param {Array} products Current products list
 */
function updateKitchenBadge(products) {
    const neededCount = products.filter(p => p.stock < p.max).length;
    const badge = document.getElementById('kitchen-badge');
    const wsBtn = document.getElementById('btn-whatsapp-share');

    if (badge) {
        if (neededCount > 0) {
            badge.innerText = neededCount;
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
    }

    if (wsBtn) {
        if (neededCount > 0) {
            wsBtn.classList.remove('opacity-50');
            wsBtn.style.pointerEvents = 'auto';
        } else {
            wsBtn.classList.add('opacity-50');
            wsBtn.style.pointerEvents = 'none';
        }
    }
}

/**
 * Render the orders needed to be cooked in the kitchen view, including raw ingredients
 * @param {Array} products Current products list
 * @param {Function} deliverProduct Callback when product is filled (id)
 * @param {Array} replenishments Dispatches list to show pending
 */
function renderCocina(products, deliverProduct, replenishments = [], salesLog = []) {
    const container = document.getElementById('kitchen-orders-container');
    if (!container) return;

    const alertBanner = document.getElementById('kitchen-alert-banner');
    if (alertBanner) {
        const hasCritical = products.some(p => p.stock <= p.min);
        if (hasCritical) {
            alertBanner.classList.remove('hidden');
        } else {
            alertBanner.classList.add('hidden');
        }
    }

    // 1. Calculate sales per product for TODAY
    const startOfToday = new Date();
    startOfToday.setHours(0,0,0,0);

    const todaySales = salesLog.filter(s => {
        if (!s.timestamp) return true;
        const d = parseUTCTimestamp(s.timestamp);
        return d >= startOfToday;
    });

    const salesCountByProduct = {};
    todaySales.forEach(s => {
        const pId = s.productId;
        if (pId && pId !== 'abono') {
            salesCountByProduct[pId] = (salesCountByProduct[pId] || 0) + 1;
        }
    });

    // 2. Separate Pastelitos and Other products
    const getCat = (p) => (window.StorageManager && window.StorageManager.getProductCategory)
        ? window.StorageManager.getProductCategory(p)
        : (p.category || 'pastelitos');

    const pastelitoProducts = products.filter(p => getCat(p) === 'pastelitos');
    const otherProducts = products.filter(p => getCat(p) !== 'pastelitos');

    // Calculate Top 3 Most Sold Pastelitos
    const pastelitoSalesList = pastelitoProducts.map(p => ({
        ...p,
        soldCount: salesCountByProduct[p.id] || 0
    })).filter(p => p.soldCount > 0)
      .sort((a, b) => b.soldCount - a.soldCount);

    const top3Pastelitos = pastelitoSalesList.slice(0, 3);

    const pendingDispatches = replenishments.filter(r => r.status === 'en_camino');

    // Build Top 3 Minimalist Metric Banner
    let top3Html = '';
    if (top3Pastelitos.length > 0) {
        const medals = ['🥇', '🥈', '🥉'];
        top3Html = `
            <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(212,175,55,0.25); border-radius: 10px; padding: 0.6rem 0.8rem; margin-top: 1.25rem; font-size: 0.78rem;">
                <div style="font-size: 0.72rem; font-weight: 800; color: var(--color-gold); text-transform: uppercase; margin-bottom: 0.35rem; display: flex; align-items: center; gap: 0.35rem;">
                    <i class="fa-solid fa-trophy"></i> Top 3 Productos Más Vendidos Hoy
                </div>
                <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; justify-content: space-between;">
                    ${top3Pastelitos.map((p, idx) => `
                        <div style="display: flex; align-items: center; gap: 0.35rem; background: rgba(0,0,0,0.3); padding: 0.35rem 0.6rem; border-radius: 6px; border: 1px solid rgba(255,255,255,0.05); min-width: 120px;">
                            <span>${medals[idx]}</span>
                            <span style="font-weight: 800; color: var(--color-white); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100px;">${p.name}</span>
                            <span style="font-weight: 900; color: #34D399; margin-left: auto;">${p.soldCount} <span style="font-size: 0.65rem; font-weight: 700; color: var(--color-text-muted);">piezas</span></span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    let dispatchesHtml = '';
    if (pendingDispatches.length > 0) {
        dispatchesHtml = `
            <div class="recipe-container" style="border-color: var(--color-success-border); margin-bottom: 1rem;">
                <h4 class="recipe-title" style="color: var(--color-success);"><i class="fa-solid fa-truck-fast"></i> En Camino al Local:</h4>
                <div style="font-size: 0.75rem; color: #E2E8F0; line-height: 1.6;">
                    ${pendingDispatches.map(d => `• <strong>${d.amount}</strong> ${d.unit} de <strong>${d.name}</strong> (Esperando confirmación de caja)`).join('<br>')}
                </div>
            </div>
        `;
    }

    let pastelitosSectionHtml = '';
    if (pastelitoProducts.length > 0) {
        pastelitosSectionHtml = `
            <div style="margin-bottom: 1.5rem;">
                <h3 style="font-size: 0.95rem; font-weight: 900; color: var(--color-gold); margin-bottom: 0.5rem; display: flex; align-items: center; gap: 0.4rem;">
                    🥐 Monitoreo de Pastelitos por Sabor
                </h3>
                <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(290px, 1fr)); gap: 0.85rem;" id="kitchen-pastelitos-list"></div>
            </div>
        `;
    }

    if (pastelitoProducts.length === 0) {
        pastelitosSectionHtml = `
            <div class="empty-state">
                <div class="empty-state-icon"><i class="fa-solid fa-circle-check"></i></div>
                <h3 class="empty-state-title">No hay pastelitos registrados</h3>
            </div>
        `;
    }

    // Secondary Block for Bebidas & Dulces (Collapsible / Separate Card)
    let secondaryContentHtml = '';
    if (otherProducts.length > 0) {
        secondaryContentHtml = `
            <div style="margin-top: 1.5rem; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.08); border-radius: var(--radius-lg); padding: 1rem;">
                <details style="cursor: pointer;">
                    <summary style="font-size: 0.85rem; font-weight: 800; color: var(--color-gold); display: flex; align-items: center; gap: 0.5rem; outline: none; list-style: none;">
                        <i class="fa-solid fa-box-open"></i> Stock de Bebidas y Dulces en Vitrina (${otherProducts.length} ítems)
                        <span style="font-size: 0.7rem; color: var(--color-text-muted); font-weight: normal; margin-left: auto;">Toca para ver/ocultar ▾</span>
                    </summary>
                    <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 0.6rem; margin-top: 0.85rem;">
                        ${otherProducts.map(item => {
                            const sold = salesCountByProduct[item.id] || 0;
                            return `
                                <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(0,0,0,0.3); padding: 0.5rem 0.75rem; border-radius: 8px; border: 1px solid rgba(255,255,255,0.05); font-size: 0.78rem;">
                                    <div>
                                        <div style="font-weight: 800; color: var(--color-white);">${item.name}</div>
                                        <div style="font-size: 0.68rem; color: var(--color-text-muted);">Vendidos hoy: ${sold}</div>
                                    </div>
                                    <span style="font-weight: 900; color: ${item.stock <= item.min ? '#F87171' : 'var(--color-gold)'};">
                                        ${item.stock} ${item.unit}
                                    </span>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </details>
            </div>
        `;
    }

    container.innerHTML = `
        ${dispatchesHtml}
        ${pastelitosSectionHtml}
        ${secondaryContentHtml}
        ${top3Html}
    `;

    const renderProductionCards = (targetElementId, itemsList) => {
        const listEl = document.getElementById(targetElementId);
        if (!listEl) return;

        itemsList.forEach(item => {
            const soldCount = salesCountByProduct[item.id] || 0;
            const amountNeeded = Math.max(0, item.max - item.stock);
            const isDispatched = pendingDispatches.some(d => d.productId === item.id);
            const initialQty = amountNeeded > 0 ? amountNeeded : 5;

            const card = document.createElement('div');
            card.className = "kitchen-card";
            card.style.cssText = "display: flex; flex-direction: column; justify-content: space-between; gap: 0.75rem; padding: 0.85rem 1rem; border-radius: var(--radius-lg); background: rgba(10, 20, 38, 0.65); border: 1px solid rgba(255, 255, 255, 0.08); box-shadow: var(--shadow-sm);";

            card.innerHTML = `
                <div>
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 0.5rem; margin-bottom: 0.4rem;">
                        <h3 class="product-name" style="font-size: 1rem; font-weight: 800; color: var(--color-white); margin: 0;">${escapeHtml(item.name)}</h3>
                        <span style="font-size: 10px; font-weight: 800; padding: 0.15rem 0.4rem; border-radius: 4px; background: ${item.stock <= item.min ? 'rgba(248, 113, 113, 0.15)' : 'rgba(52, 211, 153, 0.12)'}; color: ${item.stock <= item.min ? '#F87171' : '#34D399'}; border: 1px solid ${item.stock <= item.min ? 'rgba(248, 113, 113, 0.3)' : 'rgba(52, 211, 153, 0.3)'};">
                            En Vitrina: ${item.stock} ${escapeHtml(item.unit)}
                        </span>
                    </div>

                    <!-- 3 Indicators Bar (En Vitrina, Vendidos Hoy, Falta Cocinar) -->
                    <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0.4rem; background: rgba(0, 0, 0, 0.3); padding: 0.4rem; border-radius: var(--radius-md); border: 1px solid rgba(255, 255, 255, 0.05); margin-top: 0.4rem; text-align: center; font-size: 0.7rem;">
                        <div>
                            <div style="color: var(--color-text-muted); font-size: 0.65rem; font-weight: 700;">VITRINA</div>
                            <div style="font-weight: 900; color: var(--color-white); font-size: 0.95rem;">${item.stock}</div>
                        </div>
                        <div style="border-left: 1px solid rgba(255,255,255,0.08); border-right: 1px solid rgba(255,255,255,0.08);">
                            <div style="color: var(--color-text-muted); font-size: 0.65rem; font-weight: 700;">VENDIDOS</div>
                            <div style="font-weight: 900; color: #34D399; font-size: 0.95rem;">${soldCount}</div>
                        </div>
                        <div>
                            <div style="color: var(--color-gold); font-size: 0.65rem; font-weight: 700;">FALTA</div>
                            <div style="font-weight: 900; color: ${amountNeeded > 0 ? '#F87171' : 'var(--color-text-muted)'}; font-size: 0.95rem;">${amountNeeded}</div>
                        </div>
                    </div>

                    <!-- Quantity Stepper Controls for Custom Dispatch -->
                    ${!isDispatched ? `
                        <div style="display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; margin-top: 0.5rem; background: rgba(0,0,0,0.25); padding: 0.35rem 0.6rem; border-radius: 8px; border: 1px solid rgba(255,255,255,0.05);">
                            <span style="font-size: 0.68rem; color: var(--color-text-muted); font-weight: 700;">CANTIDAD A ENVIAR:</span>
                            <div style="display: flex; align-items: center; gap: 0.3rem;">
                                <button type="button" class="btn-qty-minus" style="width: 26px; height: 26px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.15); background: rgba(255,255,255,0.08); color: #FFF; font-weight: 900; cursor: pointer; font-size: 0.85rem;">-</button>
                                <input type="number" class="input-send-qty" value="${initialQty}" min="1" max="500" style="width: 44px; height: 26px; text-align: center; font-weight: 900; font-size: 0.85rem; border: 1px solid rgba(212,175,55,0.4); border-radius: 6px; background: rgba(0,0,0,0.6); color: var(--color-gold); font-family: monospace;">
                                <button type="button" class="btn-qty-plus" style="width: 26px; height: 26px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.15); background: rgba(255,255,255,0.08); color: #FFF; font-weight: 900; cursor: pointer; font-size: 0.85rem;">+</button>
                            </div>
                        </div>
                    ` : ''}
                </div>

                <div>
                    ${isDispatched 
                        ? `<div style="text-align: center; font-size: 0.72rem; font-weight: 800; color: var(--color-gold); border: 1px dashed var(--color-gold); padding: 0.4rem; border-radius: var(--radius-md); background: rgba(212, 175, 55, 0.08);">
                             <i class="fa-solid fa-truck-fast"></i> En camino al local (Esperando confirmación)
                           </div>`
                        : `<button type="button" class="btn-touch btn-kitchen-deliver" title="Enviar al local" style="width: 100%; height: 36px; border-radius: var(--radius-md); border: none; background: linear-gradient(135deg, #10B981 0%, #059669 100%); color: #ffffff; font-weight: 800; font-size: 0.78rem; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 0.4rem; box-shadow: 0 2px 8px rgba(16, 185, 129, 0.25); transition: transform 0.15s;">
                             <i class="fa-solid fa-truck-ramp-box"></i>
                             <span class="btn-deliver-text">¡ENVIAR ${initialQty} AL LOCAL!</span>
                           </button>`
                    }
                </div>
            `;

            if (!isDispatched) {
                const qtyInput = card.querySelector('.input-send-qty');
                const btnMinus = card.querySelector('.btn-qty-minus');
                const btnPlus = card.querySelector('.btn-qty-plus');
                const btnDeliver = card.querySelector('.btn-kitchen-deliver');
                const deliverText = card.querySelector('.btn-deliver-text');

                const updateBtnText = () => {
                    let val = parseInt(qtyInput.value, 10);
                    if (isNaN(val) || val < 1) val = 1;
                    if (deliverText) {
                        deliverText.textContent = `¡ENVIAR ${val} AL LOCAL!`;
                    }
                };

                if (btnMinus && qtyInput) {
                    btnMinus.addEventListener('click', () => {
                        let cur = parseInt(qtyInput.value, 10) || 1;
                        if (cur > 1) {
                            qtyInput.value = cur - 1;
                            updateBtnText();
                        }
                    });
                }

                if (btnPlus && qtyInput) {
                    btnPlus.addEventListener('click', () => {
                        let cur = parseInt(qtyInput.value, 10) || 1;
                        qtyInput.value = cur + 1;
                        updateBtnText();
                    });
                }

                if (qtyInput) {
                    qtyInput.addEventListener('input', updateBtnText);
                }

                if (btnDeliver && qtyInput) {
                    btnDeliver.addEventListener('click', () => {
                        const sendQty = parseInt(qtyInput.value, 10) || 1;
                        deliverProduct(item.id, sendQty);
                    });
                }
            }

            listEl.appendChild(card);
        });
    };

    renderProductionCards('kitchen-pastelitos-list', pastelitoProducts);

    // Recipe calculator (optional at bottom)
    const neededPastelitosList = pastelitoProducts.filter(p => p.stock < p.max);
    if (window.RecipeCalculator && neededPastelitosList.length > 0) {
        const ingredients = window.RecipeCalculator.calculateIngredients(neededPastelitosList);
        if (ingredients.length > 0) {
            const recipeSection = document.createElement('div');
            recipeSection.className = 'recipe-container';
            recipeSection.style.cssText = 'margin-top: 1rem; padding: 0.85rem; border-radius: 10px; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.08);';
            recipeSection.innerHTML = `
                <h4 class="recipe-title" style="font-size: 0.8rem; font-weight: 800; color: var(--color-gold); margin-bottom: 0.5rem;"><i class="fa-solid fa-scale-balanced"></i> Ingredientes a preparar para esta Tanda:</h4>
                <div class="recipe-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 0.4rem; font-size: 0.72rem;">
                    ${ingredients.map(ing => `
                        <div class="recipe-item" style="background: rgba(0,0,0,0.3); padding: 0.35rem 0.5rem; border-radius: 6px; display: flex; justify-content: space-between;">
                            <span class="recipe-item-name">${ing.name}:</span>
                            <span class="recipe-item-val" style="font-weight: 800; color: var(--color-gold);">${ing.amount} ${ing.unit}</span>
                        </div>
                    `).join('')}
                </div>
            `;
            container.appendChild(recipeSection);
        }
    }
}

/**
 * Render the daily cash total card (calculates Net Cash: Sales - Expenses)
 * @param {Array} salesLog History of sales
 * @param {Array} expenses Daily expenses
 */
function renderCashRegister(salesLog, expenses = []) {
    const valueEl = document.getElementById('cash-value');
    const headerCashValEl = document.getElementById('header-cash-val');
    if (!valueEl && !headerCashValEl) return;

    // Filter sales and expenses to ONLY include today's records (or since last close)
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    let filterTime = startOfToday;

    if (window.StorageManager) {
        const lastCloseStr = window.StorageManager.loadLastCloseTime();
        if (lastCloseStr) {
            const lcDate = parseUTCTimestamp(lastCloseStr);
            if (lcDate > startOfToday) {
                filterTime = lcDate;
            }
        }
    }

    const isSalePaid = (sale) => {
        if (!sale || !sale.name) return true;
        const match = sale.name.match(/^(.*)\s+\[(.*)\](\s*\(Pagado(?: - .*?)?\))?$/);
        if (match) {
            return !!match[3];
        }
        if (/\[.*?\]/.test(sale.name) && !/\(Pagado/i.test(sale.name)) {
            return false;
        }
        return true;
    };

    const todaySales = salesLog.filter(s => {
        if (!s || !s.timestamp) return false;
        try {
            const d = parseUTCTimestamp(s.timestamp);
            return d >= filterTime && isSalePaid(s);
        } catch (e) {
            return false;
        }
    });

    const todayExpenses = expenses.filter(e => {
        if (!e || !e.timestamp) return false;
        try {
            const d = parseUTCTimestamp(e.timestamp);
            return d >= filterTime;
        } catch (err) {
            return false;
        }
    });

    const totalSales = todaySales.reduce((sum, sale) => sum + (sale.price || 0), 0);
    const totalExpenses = todayExpenses.reduce((sum, exp) => sum + (exp.amount || 0), 0);
    const netCash = totalSales - totalExpenses;

    const vesCash = netCash * (window.bcvRate || 1);
    if (valueEl) {
        valueEl.innerHTML = `$${netCash.toFixed(2)} <span style="font-size: 0.875rem; font-weight: normal; opacity: 0.8; margin-left: 0.5rem;">(Bs. ${vesCash.toFixed(2)})</span>`;
    }

    // Update header cash register badge
    if (headerCashValEl) {
        headerCashValEl.textContent = `$${netCash.toFixed(2)}`;
    }
}

/**
 * Render the sales transaction log list with undo buttons
 * @param {Array} salesLog History of sales
 * @param {Function} onUndo Callback to trigger undo action (uuid)
 */
function renderSalesHistory(salesLog, onUndo, onEdit) {
    const listContainer = document.getElementById('history-list');
    if (!listContainer) return;

    listContainer.innerHTML = '';

    // Filter salesLog for today (since 00:00:00 or since last close time, whichever is more recent)
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    let filterTime = startOfToday;

    if (window.StorageManager) {
        const lastCloseStr = window.StorageManager.loadLastCloseTime();
        if (lastCloseStr) {
            const lcDate = parseUTCTimestamp(lastCloseStr);
            if (lcDate > startOfToday) {
                filterTime = lcDate;
            }
        }
    }

    const todaySalesLog = salesLog.filter(s => {
        if (!s || !s.timestamp) return true;
        try {
            return parseUTCTimestamp(s.timestamp) >= filterTime;
        } catch (e) {
            return true;
        }
    });

    if (todaySalesLog.length === 0) {
        listContainer.innerHTML = `
            <div style="text-align: center; color: var(--color-text-muted); font-size: 0.75rem; padding: 1.25rem 0;">
                No hay ventas registradas hoy.
            </div>
        `;
        return;
    }

    // Group todaySalesLog by timestamp
    const groups = {};
    todaySalesLog.forEach(sale => {
        let productName = sale.name;
        let clientName;
        const match = sale.name.match(/^(.*)\s+\[(.*)\](\s*\(Pagado(?: - .*?)?\))?$/);
        if (match) {
            productName = match[1];
            clientName = match[2];
        } else {
            productName = sale.name;
            clientName = sale.productId === 'abono' ? 'Abono Deuda' : 'Cliente';
        }
        
        const key = sale.timestamp;
        if (!groups[key]) {
            groups[key] = {
                timestamp: sale.timestamp,
                clientName: clientName,
                items: [],
                total: 0
            };
        }
        
        const existingItem = groups[key].items.find(item => item.name === productName);
        if (existingItem) {
            existingItem.quantity += 1;
            existingItem.totalPrice += sale.price;
        } else {
            groups[key].items.push({
                name: productName,
                price: sale.price,
                quantity: 1,
                totalPrice: sale.price
            });
        }
        groups[key].total += sale.price;
    });

    const groupedList = Object.values(groups).sort((a, b) => parseUTCTimestamp(b.timestamp) - parseUTCTimestamp(a.timestamp));

    groupedList.forEach(group => {
        const item = document.createElement('div');
        item.className = 'history-item';

        let timeStr;
        try {
            const date = parseUTCTimestamp(group.timestamp);
            timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } catch(e) {
            timeStr = 'Ahora';
        }

        const itemsSummary = group.items.map(it => `${it.quantity}x ${it.name}`).join(', ');

        const activeEdit = onEdit || window.handleEditSale;

        item.innerHTML = `
            <div class="history-item-desc" style="flex: 1; min-width: 0;">
                <span class="history-item-title" style="font-weight: 800; color: var(--color-gold);">
                    ${escapeHtml(group.clientName)} <span style="font-weight: normal; color: var(--color-white); font-size: 0.75rem;">(${escapeHtml(itemsSummary)})</span>
                </span>
                <span class="history-item-time">
                    ${timeStr} &bull; Total: $${group.total.toFixed(2)} 
                    <span style="opacity: 0.8; font-size: 0.675rem; margin-left: 0.25rem;">(Bs. ${(group.total * (window.bcvRate || 1)).toFixed(2)})</span>
                </span>
            </div>
            <div style="display: flex; align-items: center;">
                ${activeEdit ? `<button class="btn-modify-sale">Modificar</button>` : ''}
                <button class="btn-undo">Deshacer</button>
            </div>
        `;

        if (activeEdit) {
            const btnModify = item.querySelector('.btn-modify-sale');
            if (btnModify) {
                btnModify.addEventListener('click', () => {
                    activeEdit(group.timestamp);
                });
            }
        }

        item.querySelector('.btn-undo').addEventListener('click', () => {
            onUndo(group.timestamp);
        });

        listContainer.appendChild(item);
    });
}


/**
 * Render daily expenses ledger list
 * @param {Array} expenses List of expenses
 * @param {Function} onRemove Callback to delete an expense item (uuid)
 */
function renderExpenses(expenses, onRemove) {
    const listContainer = document.getElementById('expense-list');
    const totalEl = document.getElementById('expense-total');
    if (!listContainer) return;

    listContainer.innerHTML = '';

    const total = expenses.reduce((sum, exp) => sum + (exp.amount || 0), 0);
    if (totalEl) totalEl.innerHTML = `$${total.toFixed(2)} <span style="font-size: 0.675rem; font-weight: normal; opacity: 0.8; margin-left: 0.25rem;">(Bs. ${(total * (window.bcvRate || 1)).toFixed(2)})</span>`;

    if (expenses.length === 0) {
        listContainer.innerHTML = `
            <div style="text-align: center; color: var(--color-text-muted); font-size: 0.7rem; padding: 0.5rem 0;">
                No hay gastos registrados hoy.
            </div>
        `;
        return;
    }

    expenses.forEach(exp => {
        const row = document.createElement('div');
        row.className = 'expense-item';
        row.innerHTML = `
            <span class="expense-desc">${escapeHtml(exp.description)}</span>
            <div style="display: flex; align-items: center; gap: 0.5rem;">
                <span class="expense-amount">-$${exp.amount.toFixed(2)} <span style="font-size: 0.625rem; opacity: 0.75; margin-left: 0.125rem;">(Bs. ${(exp.amount * (window.bcvRate || 1)).toFixed(2)})</span></span>
                <button class="btn-undo" style="padding: 0.125rem 0.25rem; font-size: 8px;" data-action="remove-expense">&times;</button>
            </div>
        `;

        row.querySelector('[data-action="remove-expense"]').addEventListener('click', () => {
            onRemove(exp.uuid);
        });

        listContainer.appendChild(row);
    });
}

/**
 * Lista de gastos del panel admin, filtrada por mes y categoría.
 * @param {Array} expenses Filas de expenses (con category, currency, bcv_rate)
 * @param {{month:string, category:string, bcvRate:number}} filter
 *   month: 'YYYY-MM' | '' (todos). category: '' (todas) | clave.
 * @param {Function} onDelete uuid => void
 */
function renderAdminExpenses(expenses = [], filter = {}, onDelete) {
    const container = document.getElementById('admin-expenses-container');
    if (!container) return;
    const { month = '', category = '', bcvRate = (window.bcvRate || 1) } = filter;

    const CAT_LABEL = { arriendo: 'Arriendo', sueldos: 'Sueldos', servicios: 'Servicios', otros: 'Otros' };
    const toUsd = (e) => {
        const amt = parseFloat(e.amount) || 0;
        if ((e.currency || 'USD').toUpperCase() === 'VES') {
            const r = parseFloat(e.bcv_rate) > 0 ? parseFloat(e.bcv_rate) : (bcvRate || 1);
            return amt / r;
        }
        return amt;
    };
    const catKey = (e) => (CAT_LABEL[(e.category || '').toLowerCase()] ? e.category.toLowerCase() : 'otros');

    // Local-day derivation (matches aggregatePnl's dateKey convention) so the
    // month filter / row date stay consistent with the server range fetch and
    // the P&L — a raw UTC .slice() would misbucket late-night rows.
    const localDay = (ts) => {
        const d = window.AnalyticsManager.parseTimestamp(ts);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    };
    const localMonth = (ts) => localDay(ts).slice(0, 7);

    let rows = (expenses || []).filter(e => {
        if (month) { if (localMonth(e.timestamp) !== month) return false; }
        if (category && catKey(e) !== category) return false;
        return true;
    }).sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));

    if (rows.length === 0) {
        container.innerHTML = `<div style="font-size:0.85rem; color:var(--color-text-muted); text-align:center; padding:1.5rem 0;">Sin gastos para este filtro.</div>`;
        return;
    }

    const fmtUsd = v => '$' + (v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const fmtVes = v => 'Bs. ' + (v || 0).toLocaleString('es-VE', { minimumFractionDigits: 2 });
    const total = rows.reduce((s, e) => s + toUsd(e), 0);

    container.innerHTML = rows.map(e => {
        const original = (e.currency || 'USD').toUpperCase() === 'VES' ? fmtVes(e.amount) : fmtUsd(e.amount);
        return `
        <div class="expense-row" style="display:flex; align-items:center; gap:0.5rem; padding:0.4rem 0; border-bottom:1px solid rgba(255,255,255,0.06); font-size:0.8rem;">
            <span style="flex:0 0 78px; color:var(--color-text-muted);">${localDay(e.timestamp)}</span>
            <span style="flex:0 0 80px; font-weight:700;">${CAT_LABEL[catKey(e)]}</span>
            <span style="flex:1 1 auto;">${escapeHtml(e.description)}</span>
            <span style="flex:0 0 auto;">${original}</span>
            <span style="flex:0 0 70px; text-align:right; color:var(--color-text-muted);">${fmtUsd(toUsd(e))}</span>
            <button class="btn-delete-expense" data-uuid="${escapeHtml(e.uuid)}" style="flex:0 0 auto; background:none; border:none; color:var(--color-danger); cursor:pointer;"><i class="fa-solid fa-trash"></i></button>
        </div>`;
    }).join('') + `
        <div style="display:flex; justify-content:space-between; font-weight:800; padding-top:0.6rem; font-size:0.85rem;">
            <span>Total del filtro</span><span>${fmtUsd(total)}</span>
        </div>`;

    container.querySelectorAll('.btn-delete-expense').forEach(btn => {
        btn.addEventListener('click', () => onDelete && onDelete(btn.dataset.uuid));
    });
}

/**
 * Pinta el resumen de Ganancias (cascada + gráfico diario + categorías + abonos).
 * @param {Object} pnl  Salida de AnalyticsManager.aggregatePnl
 * @param {{mode:string}} opts
 */
function renderPnl(pnl, opts = {}) {
    const c = document.getElementById('admin-pnl-container');
    if (!c || !pnl) return;
    const rate = (window.bcvRate || 1);
    const usd = v => '$' + (v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const ves = v => 'Bs. ' + ((v || 0) * rate).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const t = pnl.totals;

    if (t.ventasUsd === 0 && pnl.gastos.totalUsd === 0) {
        c.innerHTML = `<div style="font-size:0.9rem; color:var(--color-text-muted); text-align:center; padding:2rem 0;">Sin ventas ni gastos en este período.</div>`;
        return;
    }

    const estBanner = t.costoTerceros.estimatedDays > 0
        ? `<div style="background:rgba(245,158,11,0.12); border:1px solid #f59e0b; border-radius:8px; padding:0.5rem 0.75rem; font-size:0.75rem; margin-bottom:0.75rem;">
             Incluye ${t.costoTerceros.estimatedDays} día(s) con costo de producción estimado — antes del 22 ago no se registraba el costo real.
           </div>` : '';

    const neg = v => v < 0 ? ' style="color:var(--color-danger);"' : '';
    const cascade = `
        <table style="width:100%; font-size:0.85rem; border-collapse:collapse;">
          <tr><td style="padding:0.35rem 0;">Ventas de mercadería</td><td style="text-align:right;">${usd(t.ventasUsd)}</td><td style="text-align:right; color:var(--color-text-muted);">${ves(t.ventasUsd)}</td></tr>
          <tr><td style="padding:0.35rem 0;">− Costo de producción (terceros)${t.costoTerceros.isEstimated ? ' <em style="color:#f59e0b;">(est.)</em>' : ''}</td><td style="text-align:right;">−${usd(t.costoTerceros.usd)}</td><td style="text-align:right; color:var(--color-text-muted);">−${ves(t.costoTerceros.usd)}</td></tr>
          <tr id="pnl-gastos-row" style="cursor:pointer;"><td style="padding:0.35rem 0;">− Gastos del local <i class="fa-solid fa-chevron-down" style="font-size:0.7em;"></i></td><td style="text-align:right;">−${usd(t.gastosUsd)}</td><td style="text-align:right; color:var(--color-text-muted);">−${ves(t.gastosUsd)}</td></tr>
          ${pnl.gastos.porCategoria.map(g => `<tr class="pnl-gasto-detail" style="display:none;"><td style="padding:0.2rem 0 0.2rem 1rem; color:var(--color-text-muted);">· ${g.label}</td><td style="text-align:right; color:var(--color-text-muted);">−${usd(g.montoUsd)}</td><td></td></tr>`).join('')}
          <tr style="border-top:2px solid rgba(255,255,255,0.15); font-weight:800;"><td style="padding:0.5rem 0;">= Ganancia neta</td><td style="text-align:right;"${neg(t.gananciaNetaUsd)}>${usd(t.gananciaNetaUsd)}</td><td style="text-align:right;"${neg(t.gananciaNetaUsd)}>${ves(t.gananciaNetaUsd)}</td></tr>
        </table>`;

    const maxDay = Math.max(...pnl.dias.map(d => d.ventasUsd), 1);
    const chart = pnl.dias.map(d => {
        const pct = (d.ventasUsd / maxDay) * 100;
        return `<div class="chart-bar-row">
            <span class="chart-bar-label">${d.fecha.slice(5)}</span>
            <div class="chart-bar-track"><div class="chart-bar-fill" style="width:${pct}%"></div></div>
            <span class="chart-bar-val">${usd(d.ventasUsd)}</span>
        </div>`;
    }).join('');

    const cats = pnl.categorias.map((cat, i) => `
        <div class="category-stat-wrapper">
          <div class="category-stat-row pnl-cat-row" data-idx="${i}" style="cursor:pointer;">
            <div class="category-label">${cat.label}</div>
            <div class="category-values">
              <span class="category-qty-badge">${cat.unidades} u</span>
              <span class="category-price-usd">${usd(cat.ventasUsd)}</span>
              <span class="category-price-ves">margen ${usd(cat.margenUsd)}</span>
            </div>
          </div>
          <div class="category-stat-dropdown pnl-cat-dd" data-idx="${i}" style="display:none;">
            ${cat.productos.map(p => `<div style="display:flex; justify-content:space-between; font-size:0.75rem; padding:0.15rem 0.5rem;"><span>${escapeHtml(p.name)} ×${p.unidades}</span><span>${usd(p.ventasUsd)}</span></div>`).join('')}
          </div>
        </div>`).join('');

    const abonos = pnl.abonos.count > 0
        ? `<div style="font-size:0.75rem; color:var(--color-text-muted); margin-top:0.75rem; padding-top:0.5rem; border-top:1px dashed rgba(255,255,255,0.1);">
             Abonos cobrados en el período: ${pnl.abonos.count} operación(es) · ${usd(pnl.abonos.montoUsd)} (fuera del cálculo de ganancia)
           </div>` : '';

    c.innerHTML = estBanner + cascade
        + `<div style="margin:1rem 0 0.5rem; font-weight:700; font-size:0.8rem;">Ventas por día</div>` + chart
        + `<div style="margin:1rem 0 0.5rem; font-weight:700; font-size:0.8rem;">Por categoría</div>` + cats
        + abonos;

    const gastosRow = document.getElementById('pnl-gastos-row');
    if (gastosRow) gastosRow.addEventListener('click', () => {
        c.querySelectorAll('.pnl-gasto-detail').forEach(r => {
            r.style.display = r.style.display === 'none' ? 'table-row' : 'none';
        });
    });
    c.querySelectorAll('.pnl-cat-row').forEach(row => row.addEventListener('click', () => {
        const dd = c.querySelector(`.pnl-cat-dd[data-idx="${row.dataset.idx}"]`);
        if (dd) dd.style.display = dd.style.display === 'none' ? 'block' : 'none';
    }));
}

/**
 * Render the clients lists and balances in the Debts tab
 * @param {Array} debts List of customer debts
 * @param {Function} onRecordPayment Callback when a payment is processed (uuid)
 */
function renderDebts(debts, onRecordPayment) {
    const container = document.getElementById('debts-list');
    if (!container) return;

    container.innerHTML = '';

    if (debts.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; color: var(--color-text-muted); font-size: 0.875rem; padding: 3rem 0;">
                <i class="fa-solid fa-handshake-slash" style="font-size: 2rem; color: var(--color-text-muted); display: block; margin-bottom: 0.5rem;"></i>
                No hay créditos pendientes registrados en el sistema.
            </div>
        `;
        return;
    }

    debts.forEach(debt => {
        const isDebtor = debt.amount > 0;
        const card = document.createElement('div');
        card.className = `client-card${isDebtor ? ' debtor' : ''}`;
        card.style.cssText = "display: flex; flex-direction: column; gap: 0.75rem; padding: 1rem; border-radius: var(--radius-lg); background: rgba(10, 20, 38, 0.6); border: 1px solid rgba(255, 255, 255, 0.08); margin-bottom: 0.75rem;";
        
        let dateDisplay;
        let timeDisplay = '';
        try {
            const d = parseUTCTimestamp(debt.timestamp);
            dateDisplay = d.toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' });
            timeDisplay = d.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' });
        } catch(e) {
            dateDisplay = 'Reciente';
        }

        const itemsDetail = debt.description ? debt.description : 'Sin productos especificados';

        card.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 0.5rem;">
                <div>
                    <span class="client-name" style="font-size: 1.05rem; font-weight: 800; color: var(--color-white);">${escapeHtml(debt.clientName)}</span>
                    <div style="font-size: 11px; color: var(--color-text-muted); margin-top: 0.15rem; display: flex; align-items: center; gap: 0.35rem;">
                        <i class="fa-regular fa-clock" style="color: var(--color-gold);"></i>
                        <span>${dateDisplay} ${timeDisplay ? `&bull; ${timeDisplay}` : ''}</span>
                    </div>
                </div>
                <div style="text-align: right;">
                    <span class="client-balance" style="font-size: 1.25rem; font-weight: 900; color: ${isDebtor ? '#F87171' : 'var(--color-success)'}; font-family: monospace;">
                        ${isDebtor ? `$${debt.amount.toFixed(2)}` : '$0.00'}
                    </span>
                    ${isDebtor ? `<div style="font-size: 10px; color: var(--color-text-muted); font-family: monospace;">Bs. ${(debt.amount * (window.bcvRate || 1)).toFixed(2)}</div>` : ''}
                </div>
            </div>

            <div style="display: flex; justify-content: space-between; align-items: center; gap: 0.5rem;">
                <div style="font-size: 0.78rem; color: #E2E8F0; flex: 1; min-width: 0;">
                    <i class="fa-solid fa-cookie-bite" style="color: var(--color-gold); margin-right: 0.3rem;"></i>
                    <strong style="color: var(--color-gold);">Productos:</strong> ${escapeHtml(itemsDetail)}
                </div>
                <div>
                    ${isDebtor 
                        ? `<button class="btn-pay" style="height: 32px; padding: 0 0.85rem; font-size: 0.75rem; font-weight: 800; border-radius: var(--radius-md); border: none; background: linear-gradient(135deg, #10B981 0%, #059669 100%); color: #ffffff; cursor: pointer; display: flex; align-items: center; gap: 0.35rem; box-shadow: 0 2px 6px rgba(16, 185, 129, 0.2);">
                             <i class="fa-solid fa-handshake"></i> Abonar / Pagar
                           </button>` 
                        : '<span style="color: var(--color-success); font-size: 11px; font-weight: 800; background: rgba(52,211,153,0.1); padding: 0.2rem 0.5rem; border-radius: 4px; border: 1px solid rgba(52,211,153,0.2);">Al Día</span>'
                    }
                </div>
            </div>
        `;

        if (isDebtor) {
            card.querySelector('.btn-pay').addEventListener('click', () => {
                onRecordPayment(debt.uuid);
            });
        }

        container.appendChild(card);
    });
}

/**
 * Normalizes a Venezuelan local phone number (e.g. "0412-1234567") into the
 * digits-only, country-code-prefixed format WhatsApp's click-to-chat expects.
 */
function normalizeVePhoneForWhatsapp(phone) {
    const digits = String(phone || '').replace(/\D/g, '');
    if (digits.startsWith('58')) return digits;
    if (digits.startsWith('0')) return `58${digits.slice(1)}`;
    return `58${digits}`;
}

/**
 * Renders the staff-facing "Pedidos Online" queue: orders customers submitted
 * from the public landing page, awaiting manual payment confirmation.
 * @param {Array} pedidos Rows from the pedidos_online table
 * @param {Function} onConfirm Callback(id) when staff confirms an order
 * @param {Function} onRechazar Callback(id) when staff rejects an order
 */
function renderPedidosOnline(pedidos, onConfirm, onRechazar) {
    const container = document.getElementById('pedidos-online-list');
    if (!container) return;

    container.innerHTML = '';

    if (!pedidos || pedidos.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; color: var(--color-text-muted); font-size: 0.875rem; padding: 3rem 0;">
                <i class="fa-solid fa-bag-shopping" style="font-size: 2rem; color: var(--color-text-muted); display: block; margin-bottom: 0.5rem;"></i>
                No hay pedidos online todavía.
            </div>
        `;
        return;
    }

    const sorted = [...pedidos].sort((a, b) => {
        if (a.status === 'pendiente' && b.status !== 'pendiente') return -1;
        if (a.status !== 'pendiente' && b.status === 'pendiente') return 1;
        return new Date(b.created_at) - new Date(a.created_at);
    });

    const statusMeta = {
        pendiente: { label: 'Pendiente', bg: 'rgba(201, 162, 74, 0.14)', border: 'rgba(201, 162, 74, 0.35)', color: 'var(--color-gold)' },
        confirmado: { label: 'Confirmado', bg: 'rgba(52, 211, 153, 0.12)', border: 'rgba(52, 211, 153, 0.3)', color: 'var(--color-success)' },
        rechazado: { label: 'Rechazado', bg: 'rgba(248, 113, 113, 0.12)', border: 'rgba(248, 113, 113, 0.3)', color: '#F87171' }
    };

    sorted.forEach(pedido => {
        const meta = statusMeta[pedido.status] || statusMeta.pendiente;
        const isPending = pedido.status === 'pendiente';

        let dateDisplay;
        let timeDisplay = '';
        try {
            const d = parseUTCTimestamp(pedido.created_at);
            dateDisplay = d.toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' });
            timeDisplay = d.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' });
        } catch (e) {
            dateDisplay = 'Reciente';
        }

        const items = Array.isArray(pedido.items) ? pedido.items : [];
        const itemsHtml = items.map(it => `
            <div style="display: flex; justify-content: space-between; font-size: 0.8rem; color: #E2E8F0; padding: 0.2rem 0;">
                <span>${it.qty}&times; ${escapeHtml(it.name)}</span>
                <span style="font-family: monospace; color: var(--color-text-muted);">$${(it.qty * it.price).toFixed(2)}</span>
            </div>
        `).join('');

        const waPhone = normalizeVePhoneForWhatsapp(pedido.customer_phone);
        const waMsg = encodeURIComponent(`¡Hola ${pedido.customer_name}! Te escribimos de Casa Lucenzo sobre tu pedido por $${Number(pedido.total).toFixed(2)} (${pedido.payment_method}).`);

        const card = document.createElement('div');
        card.style.cssText = "display: flex; flex-direction: column; gap: 0.75rem; padding: 1rem; border-radius: var(--radius-lg); background: rgba(10, 20, 38, 0.6); border: 1px solid rgba(255, 255, 255, 0.08); margin-bottom: 0.75rem;";

        card.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 0.5rem;">
                <div>
                    <span style="font-size: 1.05rem; font-weight: 800; color: var(--color-white);">${escapeHtml(pedido.customer_name)}</span>
                    <div style="font-size: 11px; color: var(--color-text-muted); margin-top: 0.15rem; display: flex; align-items: center; gap: 0.35rem;">
                        <i class="fa-regular fa-clock" style="color: var(--color-gold);"></i>
                        <span>${dateDisplay} &bull; ${timeDisplay}</span>
                    </div>
                    <div style="font-size: 11px; color: var(--color-text-muted); margin-top: 0.1rem;">
                        <i class="fa-solid fa-phone" style="color: var(--color-gold);"></i> ${escapeHtml(pedido.customer_phone)}
                    </div>
                </div>
                <span style="font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.04em; padding: 0.25rem 0.55rem; border-radius: 999px; background: ${meta.bg}; border: 1px solid ${meta.border}; color: ${meta.color}; white-space: nowrap;">${meta.label}</span>
            </div>

            <div>${itemsHtml}</div>

            <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 0.5rem;">
                <span style="font-size: 11px; color: var(--color-text-muted);"><i class="fa-solid fa-money-check-dollar" style="color: var(--color-gold); margin-right: 0.25rem;"></i>${escapeHtml(pedido.payment_method)}</span>
                <span style="font-size: 1.05rem; font-weight: 900; color: var(--color-gold); font-family: monospace;">$${Number(pedido.total).toFixed(2)}</span>
            </div>

            <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                <a href="https://api.whatsapp.com/send?phone=${waPhone}&text=${waMsg}" target="_blank" rel="noopener" style="flex: 1; min-width: 120px; height: 34px; padding: 0 0.75rem; border-radius: var(--radius-md); border: 1px solid rgba(37, 211, 102, 0.3); background: rgba(37, 211, 102, 0.1); color: #25D366; font-weight: 700; font-size: 0.75rem; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 0.35rem; text-decoration: none;">
                    <i class="fa-brands fa-whatsapp"></i> Contactar
                </a>
                ${isPending ? `
                    <button class="btn-rechazar-pedido" style="flex: 1; min-width: 120px; height: 34px; padding: 0 0.75rem; border-radius: var(--radius-md); border: 1px solid rgba(248, 113, 113, 0.3); background: rgba(248, 113, 113, 0.1); color: #F87171; font-weight: 700; font-size: 0.75rem; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 0.35rem;">
                        <i class="fa-solid fa-xmark"></i> Rechazar
                    </button>
                    <button class="btn-confirmar-pedido" style="flex: 1; min-width: 120px; height: 34px; padding: 0 0.75rem; border-radius: var(--radius-md); border: none; background: linear-gradient(135deg, #10B981 0%, #059669 100%); color: #ffffff; font-weight: 800; font-size: 0.75rem; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 0.35rem; box-shadow: 0 2px 6px rgba(16, 185, 129, 0.2);">
                        <i class="fa-solid fa-check"></i> Confirmar
                    </button>
                ` : ''}
            </div>
        `;

        if (isPending) {
            card.querySelector('.btn-confirmar-pedido').addEventListener('click', () => onConfirm(pedido.id));
            card.querySelector('.btn-rechazar-pedido').addEventListener('click', () => onRechazar(pedido.id));
        }

        container.appendChild(card);
    });
}

/**
 * Updates the pending-order count badge on the Pedidos nav tab
 * @param {Array} pedidos Rows from the pedidos_online table
 */
function updatePedidosBadge(pedidos) {
    const badge = document.getElementById('pedidos-badge');
    if (!badge) return;
    const pendingCount = (pedidos || []).filter(p => p.status === 'pendiente').length;
    if (pendingCount > 0) {
        badge.innerText = pendingCount;
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }
}

/**
 * Renders financial breakdown inside the Day Close Modal
 * @param {Array} salesLog History of sales
 * @param {Array} expenses Daily expenses
 */
function renderDayCloseModal(salesLog, expenses, products = [], customDateLabel = '', customRate = null) {
    const modalBody = document.getElementById('day-close-modal-body');
    if (!modalBody) return;

    const rate = (customRate && !isNaN(parseFloat(customRate)) && parseFloat(customRate) > 0) 
        ? parseFloat(customRate) 
        : (window.bcvRate || 1);

    const reportDateText = customDateLabel || new Date().toLocaleDateString();

    const totalSales = salesLog.reduce((sum, sale) => sum + (sale.price || 0), 0);
    const totalExpenses = expenses.reduce((sum, exp) => sum + (exp.amount || 0), 0);
    const netCash = totalSales - totalExpenses;

    const categoryMap = {};

    salesLog.forEach(sale => {
        let cleanName = sale.name;
        if (sale.productId !== 'abono') {
            cleanName = sale.name.replace(/\s*\[.*\](\s*\(Pagado(?: - .*?)?\))?$/, '');
        }

        let catKey = 'otros';
        let catLabel = '📦 Otros / Varios';
        let sortOrder = 99;

        if (sale.productId !== 'abono') {
            const product = products.find(p => p.id === sale.productId);
            const rawCat = product ? product.category : 'otros';

            if (rawCat === 'pastelitos') {
                const unitPrice = sale.price || (product ? product.price : 0);
                catKey = `pastelitos_${unitPrice.toFixed(2)}`;
                catLabel = `🥐 Pastelitos ($${unitPrice.toFixed(2)})`;
                sortOrder = 10 + unitPrice;
            } else if (rawCat === 'bebidas') {
                catKey = 'bebidas';
                catLabel = '🥤 Bebidas';
                sortOrder = 50;
            } else if (rawCat === 'dulces') {
                catKey = 'dulces';
                catLabel = '🍬 Dulces';
                sortOrder = 60;
            } else {
                catKey = 'otros';
                catLabel = '📦 Otros / Varios';
                sortOrder = 90;
            }
        }

        if (!categoryMap[catKey]) {
            categoryMap[catKey] = { label: catLabel, sortOrder: sortOrder, sales: {} };
        }

        const catGroup = categoryMap[catKey].sales;
        if (!catGroup[cleanName]) {
            catGroup[cleanName] = { count: 0, price: sale.price || 0, total: 0 };
        }
        catGroup[cleanName].count++;
        catGroup[cleanName].total += sale.price || 0;
    });

    let salesHtml = '';
    const sortedCategories = Object.values(categoryMap).sort((a, b) => a.sortOrder - b.sortOrder);

    for (const catData of sortedCategories) {
        const items = Object.entries(catData.sales);
        if (items.length > 0) {
            salesHtml += `
                <div style="margin-top: 0.85rem; margin-bottom: 0.35rem; padding: 0.15rem 0.25rem; background: rgba(201, 162, 74, 0.07); border-left: 3.5px solid var(--color-gold); font-size: 10px; font-weight: 800; color: var(--color-gold); text-transform: uppercase; letter-spacing: 0.05em; display: flex; align-items: center; justify-content: space-between;">
                    <span>${catData.label}</span>
                    <span style="opacity: 0.8; font-size: 9px;">$${items.reduce((sum, [, d]) => sum + d.total, 0).toFixed(2)}</span>
                </div>
            `;
            for (const [name, data] of items) {
                salesHtml += `
                    <div class="summary-row" style="font-size: 0.8125rem; display: flex; justify-content: space-between; align-items: center; padding: 0.35rem 0; border-bottom: 1px solid rgba(255,255,255,0.03);">
                        <div>
                            <span style="font-weight: 700; color: var(--color-gold); margin-right: 0.25rem;">${data.count}x</span>
                            <span style="color: var(--color-white);">${name}</span>
                            <span style="font-size: 10px; color: var(--color-text-muted); margin-left: 0.35rem;">($${data.price.toFixed(2)} c/u)</span>
                        </div>
                        <div style="text-align: right;">
                            <span style="font-weight: 700; color: var(--color-white); font-family: monospace;">$${data.total.toFixed(2)}</span>
                            <div style="font-size: 9px; color: var(--color-text-muted); font-family: monospace;">Bs. ${(data.total * rate).toFixed(2)}</div>
                        </div>
                    </div>
                `;
            }
        }
    }

    // Build expenses detail HTML
    let expensesHtml = '';
    expenses.forEach(exp => {
        expensesHtml += `
            <div class="summary-row" style="font-size: 0.8125rem; display: flex; justify-content: space-between; align-items: center; padding: 0.35rem 0; border-bottom: 1px solid rgba(255,255,255,0.03);">
                <span style="color: var(--color-white);">${exp.description}</span>
                <div style="text-align: right;">
                    <span style="font-weight: 700; color: #FCA5A5; font-family: monospace;">-$${exp.amount.toFixed(2)}</span>
                    <div style="font-size: 9px; color: var(--color-text-muted); font-family: monospace;">Bs. ${(exp.amount * rate).toFixed(2)}</div>
                </div>
            </div>
        `;
    });

    // Total items sold count
    const totalItemsSold = salesLog.filter(s => s.productId !== 'abono').length;

    // Closed client accounts for this day, so an admin can pull up any
    // client's line items and reprint/share their invoice days after
    // checkout -- not just for today (see groupSalesByClientAccounts).
    const clientAccounts = groupSalesByClientAccounts(salesLog).filter(g => g.isPaid);
    let clientsHtml = '';
    clientAccounts.forEach((group, idx) => {
        let timeStr = '';
        try {
            timeStr = parseUTCTimestamp(group.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } catch (e) {}
        const itemsSummary = group.items.map(it => `${it.quantity}x ${escapeHtml(it.name)}`).join(', ');
        clientsHtml += `
            <div class="summary-row" style="flex-direction: column; align-items: stretch; gap: 0.35rem; padding: 0.5rem 0; border-bottom: 1px solid rgba(255,255,255,0.03);">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-size: 0.8125rem; font-weight: 800; color: var(--color-gold);">
                        <i class="fa-solid fa-user-tag" style="font-size: 11px; opacity: 0.8; margin-right: 0.25rem;"></i>${escapeHtml(group.clientName)}${group.clientRif ? ` <span style="color: var(--color-text-muted); font-weight: 700; font-size: 10px;">(${escapeHtml(group.clientRif)})</span>` : ''}
                    </span>
                    <span style="font-size: 10px; color: var(--color-text-muted);">${timeStr}</span>
                </div>
                <div style="font-size: 11px; color: var(--color-white); opacity: 0.85;"><strong>Lleva:</strong> ${itemsSummary}</div>
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-size: 0.8125rem; font-weight: 700; color: var(--color-white); font-family: monospace;">$${group.total.toFixed(2)} <span style="font-size: 9px; font-weight: 500; color: var(--color-text-muted);">(Bs. ${(group.total * rate).toFixed(2)})</span></span>
                    <div style="display: flex; gap: 0.35rem;">
                        <button class="btn-day-client-invoice" data-idx="${idx}" title="Ver / Imprimir Factura POS SENIAT" style="height: 30px; padding: 0 0.6rem; font-size: 0.7rem; background-color: rgba(212,175,55,0.18); color: var(--color-gold); border: 1px solid rgba(212,175,55,0.4); font-weight: 800; border-radius: 6px; cursor: pointer;">
                            <i class="fa-solid fa-receipt"></i> Factura
                        </button>
                        <button class="btn-day-client-whatsapp" data-idx="${idx}" title="Compartir Ticket" style="height: 30px; width: 32px; font-size: 0.75rem; border-radius: 6px; border: 1px solid rgba(255,255,255,0.1); background: transparent; color: var(--color-success); cursor: pointer;">
                            <i class="fa-brands fa-whatsapp"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;
    });

    modalBody.innerHTML = `
        <div style="background: rgba(201, 162, 74, 0.08); border: 1px solid rgba(201, 162, 74, 0.25); border-radius: var(--radius-md); padding: 0.6rem 0.85rem; margin-bottom: 1rem; display: flex; justify-content: space-between; align-items: center; font-size: 0.8125rem; flex-wrap: wrap; gap: 0.5rem;">
            <div>
                <span style="color: var(--color-white); font-weight: 700;"><i class="fa-solid fa-calendar-day" style="color: var(--color-gold); margin-right: 0.35rem;"></i> Fecha del Cierre:</span>
                <span style="color: var(--color-gold); font-weight: 900; font-family: monospace; margin-left: 0.25rem;">${reportDateText}</span>
            </div>
            <div style="display: flex; align-items: center; gap: 0.35rem; font-size: 0.75rem;">
                <span style="color: var(--color-text-muted); font-weight: 700;">💱 Tasa BCV:</span>
                <input type="number" id="modal-report-bcv-input" step="0.01" value="${rate.toFixed(2)}" class="form-input" style="width: 85px; height: 26px; font-size: 0.75rem; padding: 0 0.4rem; text-align: center; font-weight: 800; color: var(--color-gold); background: rgba(0,0,0,0.4); border: 1px solid var(--color-gold);">
                <span style="color: var(--color-text-muted); font-size: 0.7rem;">Bs.</span>
            </div>
        </div>

        <div style="margin-bottom: 1.25rem;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                <h4 style="font-size: 11px; color: var(--color-text-muted); text-transform: uppercase; font-weight: 900; letter-spacing: 0.05em; margin: 0;">Ventas por Producto</h4>
                <span style="font-size: 10px; color: var(--color-gold); font-weight: 700;">${totalItemsSold} unid. vendidas</span>
            </div>
            ${salesHtml || '<div style="font-size: 0.75rem; color: var(--color-text-muted); text-align: center; padding: 0.5rem 0;">No hubo ventas hoy.</div>'}
        </div>

        <div style="margin-bottom: 1.25rem;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                <h4 style="font-size: 11px; color: var(--color-text-muted); text-transform: uppercase; font-weight: 900; letter-spacing: 0.05em; margin: 0;">Ventas por Cliente</h4>
                <span style="font-size: 10px; color: var(--color-gold); font-weight: 700;">${clientAccounts.length} cuenta${clientAccounts.length === 1 ? '' : 's'} cerrada${clientAccounts.length === 1 ? '' : 's'}</span>
            </div>
            ${clientsHtml || '<div style="font-size: 0.75rem; color: var(--color-text-muted); text-align: center; padding: 0.5rem 0;">No hay cuentas de clientes cerradas ese día.</div>'}
        </div>

        <div style="margin-bottom: 1.25rem;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                <h4 style="font-size: 11px; color: var(--color-text-muted); text-transform: uppercase; font-weight: 900; letter-spacing: 0.05em; margin: 0;">Gastos del Local</h4>
                <span style="font-size: 10px; color: #FCA5A5; font-weight: 700;">${expenses.length} gastos</span>
            </div>
            ${expensesHtml || '<div style="font-size: 0.75rem; color: var(--color-text-muted); text-align: center; padding: 0.5rem 0;">Sin gastos registrados.</div>'}
        </div>

        <div style="border-top: 2px solid rgba(255,255,255,0.1); padding-top: 0.75rem;">
            <h4 style="font-size: 11px; color: var(--color-text-muted); text-transform: uppercase; margin-bottom: 0.5rem; font-weight: 900; letter-spacing: 0.05em;">Resultados Financieros</h4>
            <div class="summary-row">
                <span>Ingreso por Ventas:</span>
                <span style="color: var(--color-success); font-weight: 700;">+$${totalSales.toFixed(2)} <span style="font-size: 0.75rem; font-weight: normal; opacity: 0.8; margin-left: 0.25rem;">(Bs. ${(totalSales * rate).toFixed(2)})</span></span>
            </div>
            <div class="summary-row">
                <span>Total Gastos:</span>
                <span style="color: var(--color-danger); font-weight: 700;">-$${totalExpenses.toFixed(2)} <span style="font-size: 0.75rem; font-weight: normal; opacity: 0.8; margin-left: 0.25rem;">(Bs. ${(totalExpenses * rate).toFixed(2)})</span></span>
            </div>
            <div class="summary-row total">
                <span>Total en Caja:</span>
                <span>$${netCash.toFixed(2)} <span style="font-size: 0.825rem; font-weight: normal; opacity: 0.8; margin-left: 0.25rem;">(Bs. ${(netCash * rate).toFixed(2)})</span></span>
            </div>
        </div>
    `;

    // Bind real-time BCV rate input inside modal
    const rateInput = document.getElementById('modal-report-bcv-input');
    if (rateInput) {
        rateInput.addEventListener('change', (e) => {
            const newRate = parseFloat(e.target.value);
            if (!isNaN(newRate) && newRate > 0) {
                if (window.currentReportData) {
                    window.currentReportData.rate = newRate;
                }
                renderDayCloseModal(salesLog, expenses, products, customDateLabel, newRate);
            }
        });
    }

    // Bind per-client "Factura POS" / WhatsApp share buttons. These reuse
    // the same read-only receipt modal and message builder as the live
    // Clientes historial (see renderClientesView's btn-pos-ticket-client),
    // so a closed account from any past day prints/shares identically to
    // one closed today.
    modalBody.querySelectorAll('.btn-day-client-invoice').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const group = clientAccounts[parseInt(e.currentTarget.dataset.idx, 10)];
            if (!group) return;
            showPosReceiptModal({
                cart: group.items,
                clientName: group.clientName,
                clientRif: group.clientRif,
                timestamp: group.timestamp,
                facNo: (group.timestamp.replace(/\D/g, '') + '0000').substring(0, 16),
                isAlreadyPaid: true,
                payMethod: group.paymentMethod || 'Efectivo',
                rate: group.bcvRate || rate
            });
        });
    });

    modalBody.querySelectorAll('.btn-day-client-whatsapp').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const group = clientAccounts[parseInt(e.currentTarget.dataset.idx, 10)];
            if (!group) return;
            let msg = `*CASA LUCCENZO* 🥖\n`;
            msg += `*Ticket de Consumo* 🧾\n`;
            msg += group.clientRif ? `👤 *Cliente:* ${group.clientName} (${group.clientRif})\n` : `👤 *Cliente:* ${group.clientName}\n`;
            msg += `--------------------------------------\n`;
            group.items.forEach(it => {
                msg += `• ${it.quantity}x ${it.name} - $${(it.price * it.quantity).toFixed(2)}\n`;
            });
            msg += `--------------------------------------\n`;
            msg += `💵 *Total a Pagar:* *$${group.total.toFixed(2)} USD*\n`;
            msg += `💵 *Tasa BCV:* ${rate.toFixed(2)} Bs.\n`;
            msg += `🇻🇪 *Total en Bolívares:* *Bs. ${(group.total * rate).toFixed(2)} VES*\n`;
            msg += `--------------------------------------\n`;
            msg += `¡Muchas gracias por su compra! 🌟`;
            window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`, '_blank');
        });
    });
}

/**
 * Render list of products inside the admin settings modal
 * @param {Array} products Current products list
 * @param {Function} editProduct Callback to prompt editing a product (id)
 * @param {Function} deleteProduct Callback to delete a product (id)
 */
function renderSettingsProducts(products, editProduct, deleteProduct) {
    const container = document.getElementById('settings-products-list');
    if (!container) return;

    container.innerHTML = '';

    products.forEach(p => {
        const item = document.createElement('div');
        item.className = "settings-product-item";

        let catLabel = 'Pastelitos';
        if (p.category === 'bebidas') catLabel = 'Bebidas';
        if (p.category === 'dulces') catLabel = 'Dulces';

        item.innerHTML = `
            <div class="settings-product-info">
                <span class="settings-product-name" title="${escapeHtml(p.name)}">${escapeHtml(p.name)}</span>
                <span class="settings-product-details">
                    Precio: $${(p.price || 0).toFixed(2)} | ${catLabel} | Máx: ${p.max} | Alerta: &le;${p.min} | ${escapeHtml(p.unit)}
                </span>
            </div>
            <div class="settings-actions">
                <button class="btn-settings-action edit" data-action="edit" title="Editar">
                    <i class="fa-solid fa-pen" style="font-size: 10px;"></i>
                </button>
                <button class="btn-settings-action delete" data-action="delete" title="Eliminar">
                    <i class="fa-solid fa-trash-can" style="font-size: 10px;"></i>
                </button>
            </div>
        `;

        item.querySelector('[data-action="edit"]').addEventListener('click', () => {
            editProduct(p.id);
        });
        
        item.querySelector('[data-action="delete"]').addEventListener('click', () => {
            deleteProduct(p.id);
        });

        container.appendChild(item);
    });
}

/**
 * Toggle admin settings modal visibility
 * @param {boolean} show Open or close
 * @param {Array} products Optional products list to render if opening
 * @param {Function} editProduct Callback for editing a product
 * @param {Function} deleteProduct Callback for deleting a product
 */
function toggleSettingsModal(show, products, editProduct, deleteProduct) {
    if (show) {
        switchView('admin-dashboard');
        // Switch to settings sub-tab
        const tabPrefBtn = document.getElementById('admin-tab-btn-preferences');
        const panelPref = document.getElementById('admin-panel-preferences');
        if (tabPrefBtn && panelPref) {
            const tabBtns = document.querySelectorAll('.admin-tab-btn');
            const panels = document.querySelectorAll('.admin-panel');
            tabBtns.forEach(b => b.classList.remove('active'));
            panels.forEach(p => p.classList.remove('active'));
            tabPrefBtn.classList.add('active');
            panelPref.classList.add('active');
        }
        if (products) {
            renderSettingsProducts(products, editProduct, deleteProduct);
        }
    } else {
        // If they close, switch to dashboard summary
        const tabSummaryBtn = document.getElementById('admin-tab-btn-summary');
        const panelSummary = document.getElementById('admin-panel-summary');
        if (tabSummaryBtn && panelSummary) {
            const tabBtns = document.querySelectorAll('.admin-tab-btn');
            const panels = document.querySelectorAll('.admin-panel');
            tabBtns.forEach(b => b.classList.remove('active'));
            panels.forEach(p => p.classList.remove('active'));
            tabSummaryBtn.classList.add('active');
            panelSummary.classList.add('active');
        }
    }
}

/**
 * Show a sleek toast message at the bottom of the screen
 * @param {string} message Text to display
 * @param {string} iconClass FontAwesome class list (e.g. 'fa-solid fa-circle-check')
 */
function showToast(message, iconClass) {
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toast-message');
    const toastIcon = document.getElementById('toast-icon');

    if (!toast || !toastMessage || !toastIcon) return;

    toastMessage.innerText = message;
    toastIcon.innerHTML = `<i class="${iconClass}"></i>`;

    toast.classList.add('show');

    const hideTimeout = setTimeout(() => {
        toast.classList.remove('show');
    }, 3500);

    toast.onclick = () => {
        clearTimeout(hideTimeout);
        toast.classList.remove('show');
    };
}

// ================= NEW ACCESSIBILITY & SECURITY FUNCTIONS =================

/**
 * Binds the click handlers for the PIN keypad overlay
 * @param {Function} onPINValid Validation callback (returns true if valid)
 */
function initPinKeypad(onPINValid) {
    const input = document.getElementById('pin-input');
    if (!input) return;

    input.value = '';
    
    // Create clone and replace to clear old event listeners
    const newInput = input.cloneNode(true);
    input.parentNode.replaceChild(newInput, input);

    newInput.addEventListener('input', (e) => {
        const val = newInput.value.trim();
        
        if (val.length >= 4) {
            // Attempt instant match on typing
            const isValid = onPINValid(val, false);
            if (isValid) {
                newInput.value = '';
            } else if (val.length >= 8) {
                // Maximum 8 digits reached without match - trigger final submission failure
                const isFinalValid = onPINValid(val, true);
                if (!isFinalValid) {
                    newInput.value = '';
                }
            }
        }
    });

    newInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const val = newInput.value.trim();
            if (val.length >= 4) {
                const isValid = onPINValid(val, true);
                if (!isValid) {
                    newInput.value = '';
                }
            }
        }
    });

    // Tap overlay anywhere to focus
    const overlay = document.getElementById('pin-overlay');
    if (overlay) {
        overlay.onclick = () => {
            newInput.focus();
        };
    }

    // Auto-focus input
    setTimeout(() => {
        newInput.focus();
    }, 300);
}

/**
 * Update the connection status dot
 * @param {'online' | 'local' | 'offline'} status Status mode
 * @param {string} [source] Pass 'powersync' for calls from
 *   updateSyncStatusUI (js/app.js) -- see the Task 13 note below.
 */
function updateConnectionStatus(status, source) {
    const dot = document.getElementById('conn-status');
    if (!dot) return;

    if (window.SupabaseManager && window.SupabaseManager.isTestEnvironment && window.SupabaseManager.isTestEnvironment()) {
        dot.className = 'conn-status offline';
        dot.style.cssText = "display: inline-flex; align-items: center; justify-content: center; background: linear-gradient(135deg, #7C3AED 0%, #4C1D95 100%); color: #ffffff; padding: 2px 6px; border-radius: 4px; font-size: 9px; font-weight: 900; letter-spacing: 0.05em; border: 1px solid rgba(255,255,255,0.3); height: 16px; font-family: var(--font-sans);";
        dot.innerHTML = `<i class="fa-solid fa-flask" style="margin-right: 3px; font-size: 8px;"></i> MODO PRUEBAS`;
        dot.setAttribute('title', 'Entorno de Pruebas Aislado (No afecta la base de datos oficial)');
        return;
    }

    // Plan B, Task 13: once PowerSync has completed its first sync, its own
    // connected/disconnected signal is authoritative (js/app.js's
    // updateSyncStatusUI calls this with source:'powersync'). Without this
    // guard, the older Supabase-realtime-driven callers below
    // (autoSyncAndReconnect, subscribeToChanges' reconnect) kept fighting
    // over this same dot -- confirmed live, PowerSync set it to "offline"
    // and a realtime reconnect flipped it back to "online" moments later.
    if (source !== 'powersync' && window.PowerSyncManager && window.PowerSyncManager.getSyncStatus) {
        const psStatus = window.PowerSyncManager.getSyncStatus();
        if (psStatus && psStatus.hasSynced) return;
    }

    dot.className = `conn-status ${status}`;

    let title = 'Sincronizado con base de datos (En vivo)';
    if (status === 'local') title = 'Modo Local Activo (Sin Base de Datos)';
    if (status === 'offline') title = 'Sin Internet / Guardando cambios localmente';

    dot.setAttribute('title', title);
}

/**
 * Render ingredients pantry stock levels inside the kitchen view
 * @param {Array} ingredients Current ingredients stock
 * @param {Function} onAddStock Callback when clicked "Comprar" to add stock
 */
function renderIngredientsPantry(ingredients, onAddStock) {
    const pantry = document.getElementById('kitchen-pantry-card');
    if (pantry) {
        pantry.remove();
    }
}

/**
 * Render weekly statistics inside the Admin panel
 * @param {Array} salesLog History of sales
 * @param {Array} expenses Daily expenses list
 */
// Días en español, fijos a propósito: `toLocaleDateString` depende del locale
// del navegador y este texto es visible ("vs. viernes pasado").
const KPI_WEEKDAYS_ES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

/**
 * Suma un conjunto de filas para el MISMO día de la semana pasada, recortado
 * al mismo instante del día que ya transcurrió hoy.
 *
 * El recorte no es un detalle: comparar el día parcial de hoy (9am) contra el
 * viernes pasado COMPLETO daría un desplome falso cada mañana ("-85%") que se
 * iría corrigiendo solo con las horas. Recortando la ventana, la comparación
 * es real desde el primer minuto del día.
 *
 * @param {Array} rows Filas con `timestamp`
 * @param {string} amountKey Campo con el monto (`price` en ventas, `amount` en gastos)
 * @returns {number} Total del mismo tramo horario, hace 7 días
 */
function sumSameWeekdayLastWeek(rows, amountKey) {
    const now = new Date();

    const windowStart = new Date(now);
    windowStart.setDate(windowStart.getDate() - 7);
    windowStart.setHours(0, 0, 0, 0);

    const windowEnd = new Date(windowStart);
    windowEnd.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());

    return (rows || []).reduce((sum, row) => {
        const d = parseUTCTimestamp(row.timestamp);
        if (d >= windowStart && d <= windowEnd) {
            return sum + (row[amountKey] || 0);
        }
        return sum;
    }, 0);
}

/**
 * Pinta el chip de variación dentro de una tarjeta KPI.
 *
 * @param {HTMLElement} el Contenedor del chip
 * @param {number} current Valor de hoy
 * @param {number} previous Valor del mismo día la semana pasada
 * @param {boolean} lowerIsBetter `true` en gastos: subir es malo, y pintarlo
 *        de verde como si fuera un logro sería justo al revés de la realidad.
 */
function renderKpiDelta(el, current, previous, lowerIsBetter) {
    if (!el) return;

    const dayName = KPI_WEEKDAYS_ES[new Date().getDay()];
    let cls = 'flat';
    let icon = 'fa-minus';
    let head;

    if (previous <= 0) {
        // Sin base no se inventa un porcentaje (dividir entre cero da Infinity
        // y "+∞%" no le dice nada a nadie).
        head = 'sin registro';
    } else {
        const pct = ((current - previous) / previous) * 100;
        const improved = lowerIsBetter ? pct < 0 : pct > 0;

        if (Math.abs(pct) < 0.05) {
            head = 'igual';
        } else {
            cls = improved ? 'up' : 'down';
            icon = pct > 0 ? 'fa-arrow-trend-up' : 'fa-arrow-trend-down';
            head = `${Math.abs(pct).toFixed(1)}%`;
        }
    }

    el.className = `admin-kpi-delta ${cls}`;
    el.innerHTML = `<i class="fa-solid ${icon}"></i> ${head} <span class="admin-kpi-delta-ref">vs. ${dayName} pasado</span>`;
}

/**
 * Render historical sales charts and metrics inside admin stats panel
 * @param {Array} salesLog Sales history
 * @param {Array} expenses Expenses history
 * @param {Array} products Products list for favorites resolving
 * @param {Object} [opts] Opciones
 * @param {boolean} [opts.fullHistory=false] El dataset abarca los 7 días
 *        completos (lo que devuelve `fetchStatsData`). Solo entonces se
 *        calculan los deltas: la mayoría de las llamadas pasan el `salesLog`
 *        local, que se vacía en cada cierre de caja y solo tiene el turno
 *        actual -- comparar contra eso daría "-100%" todos los días.
 * @param {Array} [opts.deltaExpenses] Gastos de los 7 días, SOLO para el
 *        delta. Existe porque el handler de realtime pasa el `expenses` local
 *        (turno actual) como tercer argumento y cambiarlo alteraría los
 *        totales semanales que ya pinta esta función. Así el delta recibe el
 *        dataset correcto sin tocar nada de lo que ya funcionaba.
 */
function renderStats(salesLog, expenses = [], products = [], opts = {}) {
    const container = document.getElementById('stats-chart-content');
    if (!container) return;

    // 1. Calculate daily income for last 7 days
    const last7Days = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        d.setHours(0,0,0,0);
        last7Days.push({
            date: d,
            label: d.toLocaleDateString([], { weekday: 'short', day: 'numeric' }),
            income: 0
        });
    }

    salesLog.forEach(sale => {
        const saleDate = parseUTCTimestamp(sale.timestamp);
        last7Days.forEach(day => {
            const dayEnd = new Date(day.date);
            dayEnd.setHours(23,59,59,999);
            if (saleDate >= day.date && saleDate <= dayEnd) {
                day.income += sale.price || 0;
            }
        });
    });

    const maxIncome = Math.max(...last7Days.map(d => d.income), 1.0);

    let barsHtml = '';
    last7Days.forEach(day => {
        const pct = (day.income / maxIncome) * 100;
        barsHtml += `
            <div class="chart-bar-row">
                <span class="chart-bar-label">${day.label}</span>
                <div class="chart-bar-track">
                    <div class="chart-bar-fill" style="width: ${pct}%"></div>
                </div>
                <span class="chart-bar-val">$${day.income.toFixed(1)}</span>
            </div>
        `;
    });

    const totalIncome = salesLog.reduce((sum, s) => sum + (s.price || 0), 0);
    const totalExpenses = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);
    const netProfit = totalIncome - totalExpenses;
    // cost_at_sale queda congelado en Bs al momento de cada venta; se pasa a $
    // con la tasa actual solo para mostrarlo junto al resto de esta card (no
    // se recalcula históricamente, solo se convierte para la vista).
    const totalProductionCostBs = salesLog.reduce((sum, s) => sum + (s.cost_at_sale || 0), 0);
    const totalProductionCostUsd = totalProductionCostBs / (window.bcvRate || 1);
    const netMarginReal = netProfit - totalProductionCostUsd;

    container.innerHTML = `
        <div style="margin-bottom: 0.75rem;">
            ${barsHtml}
        </div>

        <div style="display: flex; justify-content: space-between; font-size: 0.75rem; font-weight: 700; border-top: 1px dashed rgba(255,255,255,0.1); padding-top: 0.5rem; margin-top: 0.5rem;">
            <span>Total Ventas (Semana):</span>
            <span style="color: var(--color-success);">+$${totalIncome.toFixed(2)}</span>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 0.75rem; font-weight: 700; margin-top: 0.25rem;">
            <span>Gastos (Semana):</span>
            <span style="color: var(--color-danger);">-$${totalExpenses.toFixed(2)}</span>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 0.75rem; font-weight: 700; margin-top: 0.25rem;">
            <span>Costo Producción (Semana):</span>
            <span style="color: var(--color-danger);">-$${totalProductionCostUsd.toFixed(2)} <span style="opacity:0.7;">(Bs. ${totalProductionCostBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })})</span></span>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 0.75rem; font-weight: 800; color: var(--color-gold); margin-top: 0.25rem; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 0.25rem;">
            <span>Margen Real (Semana):</span>
            <span>$${netMarginReal.toFixed(2)}</span>
        </div>
    `;

    // 2. Render KPIs for TODAY (Hoy)
    const today = new Date();
    today.setHours(0,0,0,0);

    const todaySales = salesLog.filter(s => {
        const d = parseUTCTimestamp(s.timestamp);
        return d >= today;
    });
    const todaySalesTotal = todaySales.reduce((sum, s) => sum + (s.price || 0), 0);

    const todayExpenses = expenses.filter(e => {
        const d = parseUTCTimestamp(e.timestamp);
        return d >= today;
    });
    const todayExpensesTotal = todayExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);

    const todayCaja = todaySalesTotal - todayExpensesTotal;

    const cajaKpiEl = document.getElementById('admin-kpi-caja');
    const ventasKpiEl = document.getElementById('admin-kpi-ventas');
    const gastosKpiEl = document.getElementById('admin-kpi-gastos');

    if (cajaKpiEl) cajaKpiEl.textContent = `$${todayCaja.toFixed(2)}`;
    if (ventasKpiEl) ventasKpiEl.textContent = `$${todaySalesTotal.toFixed(2)}`;
    if (gastosKpiEl) gastosKpiEl.textContent = `$${todayExpensesTotal.toFixed(2)}`;

    const ticketCardEl = document.getElementById('admin-kpi-card-ticket');
    const ticketKpiEl = document.getElementById('admin-kpi-ticket');
    const ticketCountEl = document.getElementById('admin-kpi-ticket-count');
    // Cada línea de `todaySales` es una unidad vendida, no una transacción --
    // varias líneas comparten el mismo timestamp cuando salen del mismo
    // checkout (ver js/app.js, newSales). Contamos timestamps distintos.
    const ticketCount = new Set(todaySales.map(s => s.timestamp)).size;
    // Sin operaciones hoy, la tarjeta entera se oculta en vez de mostrar un
    // "—" vacío -- un placeholder sin dato real es ruido visual, no info.
    if (ticketCardEl) ticketCardEl.classList.toggle('hidden', ticketCount === 0);
    if (ticketKpiEl && ticketCount > 0) {
        ticketKpiEl.textContent = `$${(todaySalesTotal / ticketCount).toFixed(2)}`;
    }
    if (ticketCountEl && ticketCount > 0) {
        ticketCountEl.textContent = `${ticketCount} operación${ticketCount === 1 ? '' : 'es'} hoy`;
    }

    // --- Segunda moneda (Bs) -------------------------------------------------
    // Segura en cualquier llamada: es una conversión del valor que ya se acaba
    // de pintar arriba, no un cálculo nuevo sobre el historial.
    const rate = window.bcvRate || 1;
    const bsTargets = [
        ['admin-kpi-caja-bs', todayCaja],
        ['admin-kpi-ventas-bs', todaySalesTotal],
        ['admin-kpi-gastos-bs', todayExpensesTotal]
    ];
    bsTargets.forEach(([id, usd]) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.textContent = `Bs. ${(usd * rate).toFixed(2)}`;
        el.classList.remove('hidden');
    });

    // --- Variación vs. el mismo día la semana pasada -------------------------
    // Solo con historial completo. Ver el jsdoc de `opts.fullHistory`.
    const ventasDeltaEl = document.getElementById('admin-kpi-ventas-delta');
    const gastosDeltaEl = document.getElementById('admin-kpi-gastos-delta');

    if (opts.fullHistory) {
        const expensesForDelta = Array.isArray(opts.deltaExpenses) ? opts.deltaExpenses : expenses;
        renderKpiDelta(ventasDeltaEl, todaySalesTotal, sumSameWeekdayLastWeek(salesLog, 'price'), false);
        renderKpiDelta(gastosDeltaEl, todayExpensesTotal, sumSameWeekdayLastWeek(expensesForDelta, 'amount'), true);
        if (ventasDeltaEl) ventasDeltaEl.classList.remove('hidden');
        if (gastosDeltaEl) gastosDeltaEl.classList.remove('hidden');
    } else {
        // Ocultar explícitamente: si una llamada con historial completo dejó un
        // delta pintado y luego entra una parcial (p. ej. el refresco tras una
        // venta), quedaría un dato viejo sin forma de saber que lo es.
        if (ventasDeltaEl) ventasDeltaEl.classList.add('hidden');
        if (gastosDeltaEl) gastosDeltaEl.classList.add('hidden');
    }

    // Update active summary time display
    const timeDisplayEl = document.getElementById('admin-summary-time-display');
    if (timeDisplayEl) {
        timeDisplayEl.innerHTML = `<i class="fa-solid fa-clock"></i> Actualizado: ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }

    // 3. Render Favorites (Daily & Weekly)
    // Daily Favorites
    const dailyCounts = {};
    todaySales.forEach(sale => {
        if (sale.productId !== 'abono') {
            dailyCounts[sale.productId] = (dailyCounts[sale.productId] || 0) + 1;
        }
    });

    const topDaily = Object.entries(dailyCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3);

    const dailyContainer = document.getElementById('admin-favorites-daily');
    if (dailyContainer) {
        if (topDaily.length === 0) {
            dailyContainer.innerHTML = `<div style="font-size: 10px; color: var(--color-text-muted); text-align: center; padding: 0.5rem 0;">No hay ventas hoy aún.</div>`;
        } else {
            const maxDailyCount = topDaily[0][1];
            dailyContainer.innerHTML = topDaily.map(([pId, count], index) => {
                const prod = products.find(p => p.id === pId);
                const prodName = prod ? prod.name : pId;
                const pct = (count / maxDailyCount) * 100;
                return `
                    <div class="admin-favorite-item">
                        <div class="admin-favorite-header">
                            <span class="admin-favorite-name">${index + 1}. ${prodName}</span>
                            <span class="admin-favorite-qty">${count} unid.</span>
                        </div>
                        <div class="admin-favorite-bar-bg">
                            <div class="admin-favorite-bar-fill" style="width: ${pct}%"></div>
                        </div>
                    </div>
                `;
            }).join('');
        }
    }

    // Weekly Favorites
    const weeklyCounts = {};
    salesLog.forEach(sale => {
        if (sale.productId !== 'abono') {
            weeklyCounts[sale.productId] = (weeklyCounts[sale.productId] || 0) + 1;
        }
    });

    const topWeekly = Object.entries(weeklyCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3);

    const weeklyContainer = document.getElementById('admin-favorites-weekly');
    if (weeklyContainer) {
        if (topWeekly.length === 0) {
            weeklyContainer.innerHTML = `<div style="font-size: 10px; color: var(--color-text-muted); text-align: center; padding: 0.5rem 0;">Sin ventas esta semana.</div>`;
        } else {
            const maxWeeklyCount = topWeekly[0][1];
            weeklyContainer.innerHTML = topWeekly.map(([pId, count], index) => {
                const prod = products.find(p => p.id === pId);
                const prodName = prod ? prod.name : pId;
                const pct = (count / maxWeeklyCount) * 100;
                return `
                    <div class="admin-favorite-item">
                        <div class="admin-favorite-header">
                            <span class="admin-favorite-name">${index + 1}. ${prodName}</span>
                            <span class="admin-favorite-qty">${count} unid.</span>
                        </div>
                        <div class="admin-favorite-bar-bg">
                            <div class="admin-favorite-bar-fill weekly" style="width: ${pct}%"></div>
                        </div>
                    </div>
                `;
            }).join('');
        }
    }
}

/**
 * Render recent audit activity logs in the admin panel
 * @param {Array} logs Activity logs list
 * @param {boolean} isFiltered Whether `logs` is a search result (changes the empty-state copy)
 */
function renderActivityLogs(logs, isFiltered = false) {
    const tbody = document.getElementById('admin-logs-tbody');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (!logs || logs.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="4" style="text-align: center; color: var(--color-text-muted); padding: 1.5rem 0;">
                    ${isFiltered ? 'Ningún registro coincide con la búsqueda.' : 'No hay registros de actividad en la bitácora.'}
                </td>
            </tr>
        `;
        return;
    }

    logs.forEach(log => {
        const tr = document.createElement('tr');
        
        let badgeClass = 'role-badge ';
        let badgeLabel = 'Venta';
        if (log.role === 'cocina') {
            badgeClass += 'cocina';
            badgeLabel = 'Cocina';
        } else if (log.role === 'admin') {
            badgeClass += 'admin';
            badgeLabel = 'Admin';
        } else {
            badgeClass += 'local';
        }

        const date = new Date(log.timestamp);
        const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' ' + date.toLocaleDateString([], { day: '2-digit', month: '2-digit' });

        tr.innerHTML = `
            <td><span class="${badgeClass}">${badgeLabel}</span></td>
            <td style="font-weight: 700; color: var(--color-white);">${escapeHtml(log.action)}${log.actor_name ? ' · ' + escapeHtml(log.actor_name) : ''}</td>
            <td style="color: var(--color-text-muted); max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(log.details || '')}">${escapeHtml(log.details || '')}</td>
            <td style="text-align: right; color: var(--color-text-muted); font-size: 10px;">${timeStr}</td>
        `;
        tbody.appendChild(tr);
    });
}

// Categoriza una entrada de activity_logs por su texto de `action` para
// elegir ícono y color en el riel compacto de Resumen. Es puramente
// cosmético: una acción que no matchea ningún patrón cae en el ícono
// genérico, nunca se oculta ni rompe el render.
const RECENT_ACTIVITY_ICON_RULES = [
    { test: /anulaci[oó]n|reversi[oó]n|descarte|eliminad|rechazad/i, icon: 'fa-ban', cls: 'danger' },
    { test: /alerta|fallido/i, icon: 'fa-triangle-exclamation', cls: 'danger' },
    { test: /venta|abono|pedido/i, icon: 'fa-receipt', cls: 'success' },
    { test: /sesi[oó]n|pin/i, icon: 'fa-key', cls: 'info' },
    { test: /producto|reposici[oó]n|despacho|recepci[oó]n|stock|insumo/i, icon: 'fa-boxes-stacked', cls: 'warning' },
    { test: /gasto|costo|precio/i, icon: 'fa-wallet', cls: 'danger' }
];

function getRecentActivityIcon(action) {
    const rule = RECENT_ACTIVITY_ICON_RULES.find(r => r.test.test(action || ''));
    return rule || { icon: 'fa-circle-info', cls: 'info' };
}

// "Hace 4 minutos" / "Hoy 6:02am" / "Ayer 9:14pm" / fecha corta si es más
// vieja. Deliberadamente simple: esto es un vistazo rápido en Resumen, la
// hora exacta con segundos ya vive en la tabla completa de "Registros".
function formatRecentActivityTime(date) {
    const now = new Date();
    const diffMs = now - date;
    const diffMin = Math.floor(diffMs / 60000);

    if (diffMin < 1) return 'Justo ahora';
    if (diffMin < 60) return `Hace ${diffMin} minuto${diffMin === 1 ? '' : 's'}`;

    const startOfToday = new Date(now); startOfToday.setHours(0, 0, 0, 0);
    const startOfYesterday = new Date(startOfToday); startOfYesterday.setDate(startOfYesterday.getDate() - 1);
    const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    if (date >= startOfToday) return `Hoy ${timeStr}`;
    if (date >= startOfYesterday) return `Ayer ${timeStr}`;
    return date.toLocaleDateString([], { day: '2-digit', month: '2-digit' }) + ' ' + timeStr;
}

/**
 * Render a compact preview (last 5) of activity_logs directly in the Resumen
 * tab, so the admin doesn't have to open "Registros" to see what just
 * happened. Same data source as renderActivityLogs (fetchActivityLogs),
 * just fewer rows and a denser layout.
 * @param {Array} logs Activity logs, most recent first (as returned by
 *        SupabaseManager.fetchActivityLogs)
 */
function renderRecentActivity(logs) {
    const container = document.getElementById('admin-recent-activity-content');
    if (!container) return;

    if (!logs || logs.length === 0) {
        container.innerHTML = `<div style="font-size: 10px; color: var(--color-text-muted); text-align: center; padding: 0.75rem 0;">Sin actividad registrada todavía.</div>`;
        return;
    }

    const recent = logs.slice(0, 5);

    container.innerHTML = recent.map(log => {
        const { icon, cls } = getRecentActivityIcon(log.action);
        const date = parseUTCTimestamp(log.timestamp);
        return `
            <div class="admin-activity-item">
                <div class="admin-activity-icon ${cls}"><i class="fa-solid ${icon}"></i></div>
                <div class="admin-activity-text">
                    <span class="admin-activity-action">${escapeHtml(log.action)}${log.actor_name ? ` · ${escapeHtml(log.actor_name)}` : ''}</span>
                    ${log.details ? `<span class="admin-activity-details" title="${escapeHtml(log.details)}">${escapeHtml(log.details)}</span>` : ''}
                    <span class="admin-activity-time">${formatRecentActivityTime(date)}</span>
                </div>
            </div>
        `;
    }).join('');
}

/**
 * Opens a new window with a printable one-page KPI snapshot of the admin
 * Dashboard and triggers the browser print dialog. Reads values already
 * rendered by renderStats() rather than recomputing them -- this is a
 * snapshot of what's on screen, not a fresh report.
 */
function exportDashboardSummaryToPDF() {
    const get = (id) => {
        const el = document.getElementById(id);
        return el ? el.textContent.trim() : '—';
    };

    const caja = get('admin-kpi-caja');
    const ventas = get('admin-kpi-ventas');
    const gastos = get('admin-kpi-gastos');
    const ticket = get('admin-kpi-ticket');
    const ticketCount = get('admin-kpi-ticket-count');
    const fecha = new Date().toLocaleDateString('es-VE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
        alert("Por favor, permite las ventanas emergentes para poder generar el PDF.");
        return;
    }

    const css = `
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800;900&family=Playfair+Display:wght@700;900&display=swap');
        body {
            font-family: 'Outfit', sans-serif;
            color: #0f172a;
            padding: 2.5rem;
            margin: 0;
            background-color: #ffffff;
            line-height: 1.5;
        }
        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 2px solid #e2e8f0;
            padding-bottom: 1.5rem;
            margin-bottom: 2rem;
        }
        .logo-area { display: flex; align-items: center; gap: 1rem; }
        .logo-circle {
            width: 60px; height: 60px; border-radius: 50%;
            background-image: url('/img/logo-192.png');
            background-size: 108% 108%; background-position: center; background-repeat: no-repeat;
            border: 2px solid #C9A24A;
        }
        .logo-text h1 { font-family: 'Playfair Display', serif; font-size: 1.8rem; margin: 0; color: #0b1329; font-weight: 900; }
        .logo-text p { font-size: 0.85rem; margin: 0; color: #64748b; text-transform: uppercase; letter-spacing: 0.1em; }
        .date { font-size: 0.9rem; color: #64748b; text-transform: capitalize; }
        .kpi-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; margin-bottom: 1.5rem; }
        .kpi-card { border: 1px solid #e2e8f0; border-radius: 10px; padding: 1rem; }
        .kpi-label { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; font-weight: 700; }
        .kpi-value { font-size: 1.4rem; font-weight: 900; color: #0b1329; margin-top: 0.25rem; }
        .kpi-sub { font-size: 0.75rem; color: #94a3b8; margin-top: 0.15rem; }
        .footer { margin-top: 2rem; font-size: 0.75rem; color: #94a3b8; text-align: center; }
    `;

    printWindow.document.write(`
        <html>
        <head>
            <title>Reporte Dashboard - Casa Lucenzo</title>
            <style>${css}</style>
        </head>
        <body>
            <div class="header">
                <div class="logo-area">
                    <div class="logo-circle"></div>
                    <div class="logo-text">
                        <h1>Casa Lucenzo</h1>
                        <p>Reporte de Dashboard Administrativo</p>
                    </div>
                </div>
                <div class="date">${fecha}</div>
            </div>
            <div class="kpi-grid">
                <div class="kpi-card">
                    <div class="kpi-label">Caja (Estimado)</div>
                    <div class="kpi-value">${caja}</div>
                </div>
                <div class="kpi-card">
                    <div class="kpi-label">Ventas Hoy</div>
                    <div class="kpi-value">${ventas}</div>
                </div>
                <div class="kpi-card">
                    <div class="kpi-label">Gastos Hoy</div>
                    <div class="kpi-value">${gastos}</div>
                </div>
                <div class="kpi-card">
                    <div class="kpi-label">Ticket Promedio</div>
                    <div class="kpi-value">${ticket}</div>
                    <div class="kpi-sub">${ticketCount}</div>
                </div>
            </div>
            <div class="footer">Generado por el Sistema Casa Lucenzo el ${new Date().toLocaleString('es-VE')}</div>
            <script>
                window.onload = function() {
                    setTimeout(function() { window.print(); }, 400);
                }
            </script>
        </body>
        </html>
    `);
    printWindow.document.close();
}

/**
 * Render quick conversion table for common bills
 */
function renderQuickConversionTable() {
    const container = document.getElementById('conversion-quick-table');
    if (!container) return;
    
    container.innerHTML = '';
    const bills = [1, 2, 5, 10, 20, 50, 100];
    
    bills.forEach(usd => {
        const ves = usd * (window.bcvRate || 1);
        const row = document.createElement('div');
        row.className = 'summary-row';
        row.style.padding = '0.375rem 0';
        row.style.borderBottom = '1px solid rgba(255,255,255,0.05)';
        row.innerHTML = `
            <span style="font-weight: 700; color: var(--color-white); font-size: 0.8125rem;">$${usd.toFixed(2)} USD</span>
            <span style="color: var(--color-gold); font-weight: 800; font-size: 0.8125rem;">Bs. ${ves.toFixed(2)} VES</span>
        `;
        container.appendChild(row);
    });
}

/**
 * Render active customer account / cart card
 * @param {Array} cart Current items in cart
 * @param {Function} onAdd Callback to add 1 quantity
 * @param {Function} onRemove Callback to remove 1 quantity
 * @param {Function} onClear Callback to empty the cart
 * @param {Function} onCheckout Callback to checkout
 */
function renderActiveCart(cart, onAdd, onRemove, onClear, onCheckout) {
    const container = document.getElementById('active-cart-container');
    if (!container) return;

    if (!cart || cart.length === 0) {
        container.innerHTML = '';
        container.classList.add('hidden');
        return;
    }

    container.classList.remove('hidden');

    const totalUSD = cart.reduce((sum, item) => sum + (item.price || 0) * item.quantity, 0);
    const totalVES = totalUSD * (window.bcvRate || 1);

    container.innerHTML = `
        <div class="active-cart-card">
            <div class="active-cart-header">
                <span class="active-cart-title">
                    <i class="fa-solid fa-cart-shopping animate-pulse"></i> Cuenta del Cliente Activa
                </span>
                <span style="font-size: 10px; color: var(--color-gold); font-weight: bold;">
                    ${cart.reduce((sum, item) => sum + item.quantity, 0)} artículos
                </span>
            </div>
            
            <div class="cart-items-list">
                ${cart.map(item => `
                    <div class="cart-item-row">
                        <div class="cart-item-details">
                            <span class="cart-item-title">${escapeHtml(item.name)}</span>
                            <span class="cart-item-sub">
                                $${(item.price || 0).toFixed(2)} &bull; Sub: $${((item.price || 0) * item.quantity).toFixed(2)}
                            </span>
                        </div>
                        <div class="cart-item-controls">
                            <button class="btn-cart-adjust-circle minus" data-id="${item.productId}" data-action="minus">-</button>
                            <span class="cart-qty-badge">${item.quantity}</span>
                            <button class="btn-cart-adjust-circle plus" data-id="${item.productId}" data-action="plus">+</button>
                        </div>
                    </div>
                `).join('')}
            </div>

            <div class="cart-totals-section">
                <div class="cart-total-row">
                    <span class="cart-total-lbl">Total a Cobrar:</span>
                    <span class="cart-total-val-usd">$${totalUSD.toFixed(2)}</span>
                </div>
                <div class="cart-total-row" style="justify-content: flex-end;">
                    <span class="cart-total-val-ves">Bs. ${totalVES.toFixed(2)} VES</span>
                </div>
            </div>

            <div class="cart-actions-grid">
                <button class="btn-cart-submit" id="btn-cart-checkout">
                    <i class="fa-solid fa-hand-holding-dollar text-lg"></i> COBRAR / REGISTRAR VENTA
                </button>
                <button class="btn-cart-secondary danger-outline" id="btn-cart-clear">
                    <i class="fa-solid fa-trash-can"></i> Vaciar
                </button>
                <button class="btn-cart-secondary whatsapp-outline" id="btn-cart-share">
                    <i class="fa-brands fa-whatsapp"></i> Ticket Cliente
                </button>
            </div>
        </div>
    `;

    // Bind event listeners
    container.querySelectorAll('[data-action="minus"]').forEach(btn => {
        btn.addEventListener('click', () => {
            onRemove(btn.getAttribute('data-id'));
        });
    });

    container.querySelectorAll('[data-action="plus"]').forEach(btn => {
        btn.addEventListener('click', () => {
            onAdd(btn.getAttribute('data-id'));
        });
    });

    document.getElementById('btn-cart-checkout').addEventListener('click', onCheckout);
    document.getElementById('btn-cart-clear').addEventListener('click', onClear);
    document.getElementById('btn-cart-share').addEventListener('click', () => {
        const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
        let msg = `🛒 *TICKET DE COMPRA - CASA LUCENZO*\n`;
        msg += `--------------------------------------\n`;
        cart.forEach(item => {
            msg += `• ${item.quantity}x ${item.name} - $${(item.price * item.quantity).toFixed(2)}\n`;
        });
        msg += `--------------------------------------\n`;
        msg += `💰 *TOTAL A PAGAR:* *$${total.toFixed(2)} USD*\n`;
        msg += `💵 *Tasa BCV:* ${(window.bcvRate || 1).toFixed(2)} Bs.\n`;
        msg += `🇻🇪 *Total en Bolívares:* *Bs. ${(total * (window.bcvRate || 1)).toFixed(2)} VES*\n`;
        msg += `--------------------------------------\n`;
        msg += `¡Muchas gracias por su compra! 🌟`;

        const encoded = encodeURIComponent(msg);
        window.open(`https://api.whatsapp.com/send?text=${encoded}`, '_blank');
    });
}

/**
 * Create and show a modal dialog with options for a specific table
 */
function showTableOptionsModal(tableName, salesLog, onUndo, onEdit, onPay, products) {
    // Find active sales for this table
    const tableSales = salesLog.filter(s => {
        const match = s.name.match(/^(.*)\s+\[(.*)\](\s*\(Pagado(?: - .*?)?\))?$/);
        if (match) {
            const client = match[2];
            const isPaid = !!match[3];
            return client === tableName && !isPaid;
        }
        return false;
    });

    const isOccupied = tableSales.length > 0;
    const totalConsumed = tableSales.reduce((sum, s) => sum + (s.price || 0), 0);
    const timestamp = isOccupied ? tableSales[0].timestamp : null;

    // Create modal backdrop overlay
    const overlay = document.createElement('div');
    overlay.className = 'modal-backdrop';
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100vw';
    overlay.style.height = '100vh';
    overlay.style.background = 'rgba(10, 15, 30, 0.8)';
    overlay.style.backdropFilter = 'blur(6px)';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.zIndex = '3000';
    overlay.style.padding = '1rem';
    overlay.style.boxSizing = 'border-box';
    
    // Group active items for display
    let itemsListHtml;
    const grouped = {};
    if (isOccupied) {
        tableSales.forEach(s => {
            const cleanName = s.name.replace(/\s*\[.*\](\s*\(Pagado(?: - .*?)?\))?$/, '');
            if (!grouped[cleanName]) {
                grouped[cleanName] = { count: 0, total: 0 };
            }
            grouped[cleanName].count++;
            grouped[cleanName].total += s.price;
        });
        
        itemsListHtml = `
            <div style="background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06); padding: 0.875rem; border-radius: 8px; margin: 1rem 0; font-size: 0.8rem; text-align: left; max-height: 150px; overflow-y: auto;">
                <strong style="color: var(--color-gold); display: block; margin-bottom: 0.5rem; font-size: 0.85rem; border-bottom: 1px solid rgba(212,175,55,0.2); padding-bottom: 0.25rem;">
                    <i class="fa-solid fa-receipt"></i> Consumo de la Mesa:
                </strong>
                <div style="display: flex; flex-direction: column; gap: 0.35rem; line-height: 1.4;">
                    ${Object.entries(grouped).map(([name, data]) => `
                        <div style="display: flex; justify-content: space-between;">
                            <span style="color: var(--color-white); opacity: 0.9;">${data.count}x ${name}</span>
                            <span style="font-weight: 700; color: var(--color-gold);">$${data.total.toFixed(2)}</span>
                        </div>
                    `).join('')}
                </div>
                <div style="margin-top: 0.75rem; border-top: 1px dashed rgba(255,255,255,0.1); padding-top: 0.5rem;">
                    <div style="display: flex; justify-content: space-between; font-weight: 800; font-size: 0.85rem; color: var(--color-white);">
                        <span>Total USD:</span>
                        <span style="color: var(--color-success); font-size: 0.95rem;">$${totalConsumed.toFixed(2)}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; font-weight: 700; font-size: 0.75rem; color: var(--color-text-muted); margin-top: 0.15rem;">
                        <span>Total Bs:</span>
                        <span>Bs. ${(totalConsumed * (window.bcvRate || 1)).toFixed(2)}</span>
                    </div>
                </div>
            </div>
        `;
    } else {
        itemsListHtml = `
            <div style="background: rgba(255,255,255,0.01); border: 1px dashed rgba(255,255,255,0.08); padding: 1.25rem; border-radius: 8px; margin: 1rem 0; font-size: 0.8rem; color: var(--color-text-muted);">
                <i class="fa-solid fa-circle-info" style="font-size: 1.25rem; color: var(--color-gold); display: block; margin-bottom: 0.5rem;"></i>
                Esta mesa no tiene consumos activos registrados.
            </div>
        `;
    }

    const modalBody = document.createElement('div');
    modalBody.className = 'card-pantry';
    modalBody.style.width = '100%';
    modalBody.style.maxWidth = '360px';
    modalBody.style.padding = '1.5rem';
    modalBody.style.borderRadius = '12px';
    modalBody.style.boxSizing = 'border-box';
    modalBody.style.border = '1px solid var(--color-gold)';
    modalBody.style.boxShadow = '0 10px 30px rgba(0,0,0,0.5), 0 0 20px rgba(212,175,55,0.15)';

    modalBody.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 0.75rem; margin-bottom: 0.5rem;">
            <h3 style="font-family: var(--font-serif); font-weight: 900; color: var(--color-gold); font-size: 1.25rem; margin: 0; display: flex; align-items: center; gap: 0.5rem;">
                <i class="fa-solid fa-utensils"></i> ${escapeHtml(tableName)}
            </h3>
            <span style="font-size: 9px; font-weight: 800; text-transform: uppercase; padding: 0.25rem 0.5rem; border-radius: 4px; ${isOccupied ? 'background: rgba(212,175,55,0.15); border: 1px solid var(--color-gold); color: var(--color-gold);' : 'background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: var(--color-text-muted);'}">
                ${isOccupied ? 'Ocupada' : 'Libre'}
            </span>
        </div>
        
        ${itemsListHtml}
        
        <div style="display: flex; flex-direction: column; gap: 0.6rem; margin-top: 1.25rem;">
            ${isOccupied ? `
                <button class="btn-modify-modal" style="height: 42px; display: flex; align-items: center; justify-content: center; gap: 0.5rem; font-size: 0.8rem; font-weight: 800; border-radius: 6px; border: none; cursor: pointer; transition: all 0.2s; background-color: var(--color-gold); color: #000000; width: 100%;">
                    <i class="fa-solid fa-cart-plus"></i> Comprar Más Cosas
                </button>
                <button class="btn-pay-modal" style="height: 42px; display: flex; align-items: center; justify-content: center; gap: 0.5rem; font-size: 0.8rem; font-weight: 800; border-radius: 6px; border: none; cursor: pointer; transition: all 0.2s; background-color: var(--color-success); color: #000000; width: 100%;">
                    <i class="fa-solid fa-circle-check"></i> Cerrar Venta (Pagar)
                </button>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; width: 100%;">
                    <button class="btn-share-modal" style="height: 38px; display: flex; align-items: center; justify-content: center; gap: 0.35rem; font-size: 0.75rem; font-weight: 700; border-radius: 6px; border: 1px solid rgba(16,185,129,0.3); cursor: pointer; transition: all 0.2s; background-color: rgba(16,185,129,0.05); color: #A7F3D0;">
                        <i class="fa-brands fa-whatsapp"></i> Compartir
                    </button>
                    <button class="btn-detail-modal" style="height: 38px; display: flex; align-items: center; justify-content: center; gap: 0.35rem; font-size: 0.75rem; font-weight: 700; border-radius: 6px; border: 1px solid rgba(255,255,255,0.1); cursor: pointer; transition: all 0.2s; background-color: rgba(255,255,255,0.02); color: var(--color-white);">
                        <i class="fa-solid fa-eye"></i> Ver Detalle
                    </button>
                </div>
            ` : `
                <button class="btn-open-modal" style="height: 42px; display: flex; align-items: center; justify-content: center; gap: 0.5rem; font-size: 0.8rem; font-weight: 800; border-radius: 6px; border: none; cursor: pointer; transition: all 0.2s; background-color: var(--color-gold); color: #000000; width: 100%;">
                    <i class="fa-solid fa-cart-plus"></i> Abrir Mesa (Consumir)
                </button>
            `}
            <button class="btn-close-modal" style="height: 38px; display: flex; align-items: center; justify-content: center; gap: 0.35rem; font-size: 0.75rem; font-weight: 700; border-radius: 6px; border: 1px solid rgba(255,255,255,0.08); cursor: pointer; transition: all 0.2s; background-color: transparent; color: var(--color-text-muted); width: 100%;">
                Cancelar
            </button>
        </div>
    `;

    overlay.appendChild(modalBody);
    document.body.appendChild(overlay);

    // Event listener setup
    const closeModal = () => {
        if (document.body.contains(overlay)) {
            document.body.removeChild(overlay);
        }
    };

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeModal();
    });

    modalBody.querySelector('.btn-close-modal').addEventListener('click', closeModal);

    if (isOccupied) {
        modalBody.querySelector('.btn-modify-modal').addEventListener('click', () => {
            closeModal();
            if (onEdit) onEdit(timestamp);
        });
        modalBody.querySelector('.btn-pay-modal').addEventListener('click', () => {
            closeModal();
            if (onPay) onPay(timestamp);
        });
        modalBody.querySelector('.btn-share-modal').addEventListener('click', () => {
            closeModal();
            let msg = `*CASA LUCCENZO* 🥖\n`;
            msg += `*Ticket de Consumo* 🧾\n`;
            msg += `--------------------------------------\n`;
            msg += `👤 *Cliente/Mesa:* ${tableName}\n`;
            msg += `📅 *Fecha/Hora:* ${parseUTCTimestamp(timestamp).toLocaleString()}\n`;
            msg += `--------------------------------------\n`;
            Object.entries(grouped).forEach(([name, data]) => {
                msg += `• ${data.count}x ${name} - $${data.total.toFixed(2)}\n`;
            });
            msg += `--------------------------------------\n`;
            msg += `💵 *Total a Pagar:* *$${totalConsumed.toFixed(2)} USD*\n`;
            msg += `💵 *Tasa BCV:* ${(window.bcvRate || 1).toFixed(2)} Bs.\n`;
            msg += `🇻🇪 *Total en Bolívares:* *Bs. ${(totalConsumed * (window.bcvRate || 1)).toFixed(2)} VES*\n`;
            msg += `--------------------------------------\n`;
            msg += `¡Muchas gracias por su compra! 🌟`;

            const encoded = encodeURIComponent(msg);
            window.open(`https://api.whatsapp.com/send?text=${encoded}`, '_blank');
        });
        modalBody.querySelector('.btn-detail-modal').addEventListener('click', () => {
            closeModal();
            // Switch to Cuentas tab and scroll
            const btnSubCuentas = document.getElementById('btn-sub-cuentas');
            if (btnSubCuentas) btnSubCuentas.click();
            
            setTimeout(() => {
                const element = document.querySelector(`[data-client-timestamp="${timestamp}"]`);
                if (element) {
                    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    element.style.background = 'rgba(212,175,55,0.12)';
                    setTimeout(() => {
                        element.style.background = '';
                    }, 1500);
                }
            }, 100);
        });
    } else {
        modalBody.querySelector('.btn-open-modal').addEventListener('click', () => {
            closeModal();
            sessionStorage.setItem('casa_lucenzo_editing_client_name', tableName);
            switchView('local');
            showToast(`📝 Cuenta iniciada para ${tableName}. ¡Agrega pastelitos!`, 'fa-solid fa-pen-to-square');
        });
    }
}

/**
 * Shows the full detail + actions modal for a single active (unpaid) client
 * account, opened by tapping its compact tile in Cuentas Activas. Mirrors
 * showTableOptionsModal's look and close-before-act pattern.
 * @param {Object} group Grouped sale {timestamp, clientName, clientRif, items, total}
 * @param {Function} onUndo Undo sale callback
 * @param {Function} onEdit Edit sale callback
 * @param {Function} onPay Pay/Close sale callback
 */
function showClientAccountModal(group, onUndo, onEdit, onPay) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-backdrop';
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100vw';
    overlay.style.height = '100vh';
    overlay.style.background = 'rgba(10, 15, 30, 0.8)';
    overlay.style.backdropFilter = 'blur(6px)';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.zIndex = '3000';
    overlay.style.padding = '1rem';
    overlay.style.boxSizing = 'border-box';

    const rate = window.bcvRate || 1;

    const itemsListHtml = `
        <div style="background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06); padding: 0.875rem; border-radius: 8px; margin: 1rem 0; font-size: 0.8rem; text-align: left; max-height: 150px; overflow-y: auto;">
            <strong style="color: var(--color-gold); display: block; margin-bottom: 0.5rem; font-size: 0.85rem; border-bottom: 1px solid rgba(212,175,55,0.2); padding-bottom: 0.25rem;">
                <i class="fa-solid fa-receipt"></i> Consumo:
            </strong>
            <div style="display: flex; flex-direction: column; gap: 0.35rem; line-height: 1.4;">
                ${group.items.map(it => `
                    <div style="display: flex; justify-content: space-between;">
                        <span style="color: var(--color-white); opacity: 0.9;">${it.quantity}x ${escapeHtml(it.name)}</span>
                        <span style="font-weight: 700; color: var(--color-gold);">$${getItemTotalUSD(it).toFixed(2)}</span>
                    </div>
                `).join('')}
            </div>
            <div style="margin-top: 0.75rem; border-top: 1px dashed rgba(255,255,255,0.1); padding-top: 0.5rem;">
                <div style="display: flex; justify-content: space-between; font-weight: 800; font-size: 0.85rem; color: var(--color-white);">
                    <span>Total USD:</span>
                    <span style="color: var(--color-success); font-size: 0.95rem;">$${group.total.toFixed(2)}</span>
                </div>
                <div style="display: flex; justify-content: space-between; font-weight: 700; font-size: 0.75rem; color: var(--color-text-muted); margin-top: 0.15rem;">
                    <span>Total Bs:</span>
                    <span>Bs. ${(group.total * rate).toFixed(2)}</span>
                </div>
            </div>
        </div>
    `;

    const modalBody = document.createElement('div');
    modalBody.className = 'card-pantry';
    modalBody.style.width = '100%';
    modalBody.style.maxWidth = '360px';
    modalBody.style.padding = '1.5rem';
    modalBody.style.borderRadius = '12px';
    modalBody.style.boxSizing = 'border-box';
    modalBody.style.border = '1px solid var(--color-gold)';
    modalBody.style.boxShadow = '0 10px 30px rgba(0,0,0,0.5), 0 0 20px rgba(212,175,55,0.15)';

    modalBody.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 0.75rem; margin-bottom: 0.5rem;">
            <h3 style="font-family: var(--font-serif); font-weight: 900; color: var(--color-gold); font-size: 1.15rem; margin: 0; display: flex; align-items: center; gap: 0.5rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                <i class="fa-solid fa-user-tag"></i> ${escapeHtml(group.clientName)}
            </h3>
            <span style="font-size: 9px; font-weight: 800; text-transform: uppercase; padding: 0.25rem 0.5rem; border-radius: 4px; background: rgba(212,175,55,0.15); border: 1px solid var(--color-gold); color: var(--color-gold); flex-shrink: 0;">
                Consumiendo
            </span>
        </div>
        ${group.clientRif ? `<div style="font-size: 11px; color: var(--color-text-muted); margin-top: -0.25rem;">Cédula/RIF: ${escapeHtml(group.clientRif)}</div>` : ''}

        ${itemsListHtml}

        <div style="display: flex; flex-direction: column; gap: 0.6rem;">
            <button class="btn-modal-pos" style="height: 40px; display: flex; align-items: center; justify-content: center; gap: 0.5rem; font-size: 0.78rem; font-weight: 800; border-radius: 6px; border: 1px solid rgba(212,175,55,0.4); cursor: pointer; background-color: rgba(212,175,55,0.15); color: var(--color-gold); width: 100%;">
                <i class="fa-solid fa-receipt"></i> Factura POS
            </button>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem;">
                <button class="btn-modal-modify" style="height: 40px; display: flex; align-items: center; justify-content: center; gap: 0.4rem; font-size: 0.78rem; font-weight: 800; border-radius: 6px; border: none; cursor: pointer; background-color: var(--color-gold); color: var(--color-bg-navy);">
                    <i class="fa-solid fa-pen-to-square"></i> Modificar
                </button>
                <button class="btn-modal-pay" style="height: 40px; display: flex; align-items: center; justify-content: center; gap: 0.4rem; font-size: 0.78rem; font-weight: 800; border-radius: 6px; border: none; cursor: pointer; background-color: var(--color-success); color: var(--color-bg-navy);">
                    <i class="fa-solid fa-circle-check"></i> Registrar Pago
                </button>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem;">
                <button class="btn-modal-share" style="height: 36px; display: flex; align-items: center; justify-content: center; gap: 0.4rem; font-size: 0.72rem; font-weight: 700; border-radius: 6px; border: 1px solid rgba(255,255,255,0.1); cursor: pointer; background-color: transparent; color: var(--color-text-muted);">
                    <i class="fa-brands fa-whatsapp"></i> Compartir
                </button>
                <button class="btn-modal-undo" style="height: 36px; display: flex; align-items: center; justify-content: center; gap: 0.4rem; font-size: 0.72rem; font-weight: 700; border-radius: 6px; border: none; cursor: pointer; background-color: var(--color-danger); color: var(--color-white);">
                    <i class="fa-solid fa-rotate-left"></i> Deshacer
                </button>
            </div>
            <button class="btn-modal-close" style="height: 36px; display: flex; align-items: center; justify-content: center; font-size: 0.75rem; font-weight: 700; border-radius: 6px; border: 1px solid rgba(255,255,255,0.08); cursor: pointer; background-color: transparent; color: var(--color-text-muted); width: 100%;">
                Cerrar
            </button>
        </div>
    `;

    overlay.appendChild(modalBody);
    document.body.appendChild(overlay);

    const closeModal = () => {
        if (document.body.contains(overlay)) {
            document.body.removeChild(overlay);
        }
    };

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeModal();
    });

    modalBody.querySelector('.btn-modal-close').addEventListener('click', closeModal);

    modalBody.querySelector('.btn-modal-pos').addEventListener('click', () => {
        closeModal();
        showPaymentMethodModal(group.clientName, group.clientRif, group.items, group.timestamp, (method, name, rif) => {
            if (onPay) onPay(group.timestamp, method, name, rif);
        });
    });

    modalBody.querySelector('.btn-modal-modify').addEventListener('click', () => {
        closeModal();
        if (onEdit) onEdit(group.timestamp);
    });

    modalBody.querySelector('.btn-modal-pay').addEventListener('click', () => {
        closeModal();
        showPaymentMethodModal(group.clientName, group.clientRif, group.items, group.timestamp, (method, name, rif) => {
            if (onPay) onPay(group.timestamp, method, name, rif);
        });
    });

    modalBody.querySelector('.btn-modal-share').addEventListener('click', () => {
        closeModal();
        let msg = `*CASA LUCCENZO* 🥖\n`;
        msg += `*Ticket de Consumo* 🧾\n`;
        msg += group.clientRif ? `👤 *Cliente:* ${group.clientName} (${group.clientRif})\n` : `👤 *Cliente:* ${group.clientName}\n`;
        msg += `--------------------------------------\n`;
        group.items.forEach(it => {
            msg += `• ${it.quantity}x ${it.name} - $${(it.price * it.quantity).toFixed(2)}\n`;
        });
        msg += `--------------------------------------\n`;
        msg += `💵 *Total a Pagar:* *$${group.total.toFixed(2)} USD*\n`;
        msg += `💵 *Tasa BCV:* ${rate.toFixed(2)} Bs.\n`;
        msg += `🇻🇪 *Total en Bolívares:* *Bs. ${(group.total * rate).toFixed(2)} VES*\n`;
        msg += `--------------------------------------\n`;
        msg += `¡Muchas gracias por su compra! 🌟`;

        const encoded = encodeURIComponent(msg);
        window.open(`https://api.whatsapp.com/send?text=${encoded}`, '_blank');
    });

    modalBody.querySelector('.btn-modal-undo').addEventListener('click', () => {
        closeModal();
        if (onUndo) onUndo(group.timestamp);
    });
}

/**
 * Groups a raw sales log into per-account (per-client) transactions by
 * parsing the "[ClientName]" / "(Pagado - Method)" tags baked into the sale
 * name at checkout (see handleCheckoutCart / markTransactionAsPaid in
 * app.js -- there is no client_id column, this string tag is the only link
 * between a sale row and the account it belongs to). Shared by the live
 * Clientes historial and the day-close report's "Ventas por Cliente" view
 * so both read the same account boundaries from any day's raw sales.
 * @param {Array} salesLog Raw sale rows (any day, not just today)
 * @returns {Array} Account groups sorted newest-first
 */
function groupSalesByClientAccounts(salesLog) {
    const groups = {};
    salesLog.forEach(sale => {
        let productName = sale.name;
        let clientName;
        let isPaid = false;
        let paymentMethod = '';

        const match = sale.name.match(/^(.*)\s+\[(.*)\](\s*\(Pagado(?: - .*?)?\))?$/);
        if (match) {
            productName = match[1];
            clientName = match[2];
            isPaid = !!match[3];
            if (isPaid && match[3]) {
                const methodMatch = match[3].match(/\(Pagado\s*-\s*(.*?)\)/);
                paymentMethod = methodMatch ? methodMatch[1] : 'Efectivo';
            }
        } else {
            productName = sale.name;
            clientName = sale.productId === 'abono' ? 'Abono Deuda' : 'Cliente';
        }

        let clientRif = '';
        let rawClientStr = clientName;
        if (clientName.includes(' - ')) {
            const parts = clientName.split(/\s+-\s+/);
            rawClientStr = parts[0].trim();
            clientRif = parts[1].trim();
        }

        const key = sale.timestamp;
        if (!groups[key]) {
            groups[key] = {
                timestamp: sale.timestamp,
                clientName: rawClientStr,
                clientRif: clientRif,
                isPaid: isPaid,
                paymentMethod: paymentMethod,
                // The rate this account was actually charged at, so reprinting
                // its invoice later (any day) shows that rate, not today's --
                // see showPosReceiptModal.
                bcvRate: sale.bcvRate || null,
                items: [],
                total: 0
            };
        } else {
            if (isPaid) {
                groups[key].isPaid = true;
            }
            if (paymentMethod && !groups[key].paymentMethod) {
                groups[key].paymentMethod = paymentMethod;
            }
        }

        const existingItem = groups[key].items.find(item => item.name === productName);
        if (existingItem) {
            existingItem.quantity += 1;
            existingItem.totalPrice += sale.price;
        } else {
            groups[key].items.push({
                name: productName,
                price: sale.price,
                quantity: 1,
                totalPrice: sale.price
            });
        }
        groups[key].total += sale.price;
    });

    return Object.values(groups).sort((a, b) => parseUTCTimestamp(b.timestamp) - parseUTCTimestamp(a.timestamp));
}

/**
 * Render the dedicated Clientes view
 * @param {Array} salesLog Today's sales log
 * @param {Function} onUndo Undo sale callback
 * @param {Function} onEdit Edit sale callback
 * @param {Function} onPay Pay/Close sale callback
 * @param {Array} products All products list
 */
function renderClientesView(salesLog, onUndo, onEdit, onPay, products) {
    // 1. Update Live Statistics Card
    const liveVitrinaEl = document.getElementById('live-stat-vitrina');
    const liveVendidosEl = document.getElementById('live-stat-vendidos');
    const liveVentasEl = document.getElementById('live-stat-ventas');

    // Total in vitrina: sum of all product stock (only savory pastelitos)
    const pastelitoProducts = products.filter(p => p.category === 'pastelitos');
    const totalInVitrina = pastelitoProducts.reduce((sum, p) => sum + (p.stock || 0), 0);
    const totalMaxVitrina = pastelitoProducts.reduce((sum, p) => sum + (p.max || 0), 0);
    if (liveVitrinaEl) {
        liveVitrinaEl.textContent = `${totalInVitrina} / ${totalMaxVitrina}`;
    }

    // Filter salesLog for TODAY ONLY (current day starting at 00:00:00)
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);

    const todaySalesLog = salesLog.filter(s => {
        if (!s.timestamp) return false;
        try {
            const d = parseUTCTimestamp(s.timestamp);
            return d >= startOfToday;
        } catch (e) {
            return false;
        }
    });

    // Total sold today: count of all checked out sales today (except debt payments 'abono')
    const totalPiecesSold = todaySalesLog.filter(s => s.productId !== 'abono').length;
    if (liveVendidosEl) {
        liveVendidosEl.textContent = totalPiecesSold;
    }

    const rate = window.bcvRate || 1;

    // Total sales money today
    const totalSalesMoney = todaySalesLog.reduce((sum, s) => sum + (s.price || 0), 0);
    const totalSalesVES = totalSalesMoney * rate;
    if (liveVentasEl) {
        liveVentasEl.innerHTML = `
            <div style="font-size: 1.125rem; font-weight: 900; color: var(--color-success);">$${totalSalesMoney.toFixed(2)}</div>
            <div style="font-size: 9px; font-weight: 700; color: var(--color-text-muted); margin-top: 1px;">Bs. ${totalSalesVES.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
        `;
    }

    // Total Real Sold (based on physical difference in vitrina: initial_stock - stock)
    const expectedSalesValue = products.reduce((sum, p) => {
        if (p.id === 'abono') return sum;
        const initial = (p.initial_stock !== undefined && p.initial_stock !== null) ? p.initial_stock : (p.max || 0);
        const stock = p.stock || 0;
        const expectedQty = Math.max(0, initial - stock);
        return sum + (expectedQty * (p.price || 0));
    }, 0);

    // Add any manual abonos/other non-inventory transactions recorded today
    const abonosValue = todaySalesLog.filter(s => s.productId === 'abono').reduce((sum, s) => sum + (s.price || 0), 0);

    const totalRealMoney = expectedSalesValue + abonosValue;
    const totalRealVES = totalRealMoney * rate;
    const activeRole = sessionStorage.getItem('casa_lucenzo_active_role');
    const liveTotalRealCard = document.getElementById('live-stat-total-real-card');
    if (liveTotalRealCard) {
        if (activeRole === 'admin') {
            liveTotalRealCard.style.display = 'block';
        } else {
            liveTotalRealCard.style.display = 'none';
        }
    }

    const liveTotalRealEl = document.getElementById('live-stat-total-real');
    if (liveTotalRealEl) {
        liveTotalRealEl.innerHTML = `
            <div style="font-size: 1.125rem; font-weight: 900; color: #34D399;">$${totalRealMoney.toFixed(2)}</div>
            <div style="font-size: 9px; font-weight: 700; color: #A7F3D0; margin-top: 1px;">Bs. ${totalRealVES.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
        `;
    }

    // Group categories dynamically for TODAY's sales
    const activeProducts = (products && products.length > 0) ? products : (window.products || window.StorageManager.loadProducts() || []);
    const categoryStatsMap = {};

    todaySalesLog.forEach(s => {
        let catKey;
        let catLabel;
        let icon;
        let color;
        let unitLabel;
        let sortOrder;

        if (s.productId === 'abono') {
            catKey = 'otros';
            catLabel = 'Abonos / Créditos';
            icon = 'fa-money-bill-wave';
            color = '#D4A373';
            unitLabel = 'op.';
            sortOrder = 99;
        } else {
            const product = activeProducts.find(p => p.id === s.productId);
            let rawCat = product ? product.category : '';
            
            if (!rawCat || rawCat === 'otros') {
                const nameLower = (s.name || '').toLowerCase();
                if (nameLower.includes('malta') || nameLower.includes('refresco') || nameLower.includes('agua') || nameLower.includes('jugo')) {
                    rawCat = 'bebidas';
                } else {
                    rawCat = 'pastelitos';
                }
            }

            if (rawCat === 'pastelitos') {
                const unitPrice = s.price || (product ? product.price : 0);
                catKey = `pastelitos_${unitPrice.toFixed(2)}`;
                catLabel = `Pastelitos ($${unitPrice.toFixed(2)})`;
                icon = 'fa-cookie';
                color = '#FFB085';
                unitLabel = 'piezas';
                sortOrder = 10 + unitPrice;
            } else if (rawCat === 'bebidas') {
                catKey = 'bebidas';
                catLabel = 'Bebidas';
                icon = 'fa-bottle-water';
                color = '#8BE8CB';
                unitLabel = 'unid.';
                sortOrder = 50;
            } else if (rawCat === 'dulces') {
                catKey = 'dulces';
                catLabel = 'Dulces';
                icon = 'fa-candy-cane';
                color = '#C084FC';
                unitLabel = 'unid.';
                sortOrder = 60;
            } else {
                catKey = 'otros';
                catLabel = 'Otros / Varios';
                icon = 'fa-box';
                color = '#D4A373';
                unitLabel = 'op.';
                sortOrder = 90;
            }
        }

        if (!categoryStatsMap[catKey]) {
            categoryStatsMap[catKey] = {
                id: catKey,
                label: catLabel,
                icon: icon,
                color: color,
                unitLabel: unitLabel,
                sortOrder: sortOrder,
                qty: 0,
                usd: 0,
                flavors: {}
            };
        }

        const group = categoryStatsMap[catKey];
        group.qty++;
        group.usd += s.price || 0;

        const flavorId = s.productId === 'abono' ? 'abono' : (s.productId || s.name);
        let flavorName = s.name;
        if (s.productId !== 'abono') {
            flavorName = s.name.replace(/\s*\[.*\](\s*\(Pagado(?: - .*?)?\))?$/, '');
        }

        if (!group.flavors[flavorId]) {
            group.flavors[flavorId] = { name: flavorName, qty: 0, usd: 0 };
        }
        group.flavors[flavorId].qty++;
        group.flavors[flavorId].usd += s.price || 0;
    });

    const categoriesContainer = document.getElementById('live-stat-categories');
    if (categoriesContainer) {
        const rate = window.bcvRate || 1;
        const formatUSD = (val) => '$' + (val || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const formatVES = (val) => 'Bs. ' + (val || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

        const sortedStats = Object.values(categoryStatsMap).sort((a, b) => a.sortOrder - b.sortOrder);

        let html = '';
        sortedStats.forEach(cat => {
            const flavorsList = Object.values(cat.flavors).sort((a, b) => b.qty - a.qty);
            const badgeClass = cat.id.startsWith('pastelitos') ? 'pastelitos' : cat.id;

            html += `
                <div class="category-stat-wrapper">
                    <div class="category-stat-row" id="${cat.id}-stat-row" style="cursor: pointer; user-select: none;">
                        <div class="category-label">
                            <i class="fa-solid fa-chevron-down" style="color: var(--color-text-muted);"></i>
                            <i class="fa-solid ${cat.icon}" style="color: ${cat.color};"></i>
                            <span>${cat.label}</span>
                        </div>
                        <div class="category-values">
                            <span class="category-qty-badge ${badgeClass}">${cat.qty} ${cat.unitLabel}</span>
                            <span class="category-price-usd">${formatUSD(cat.usd)}</span>
                            <span class="category-price-ves">(${formatVES(cat.usd * rate)})</span>
                        </div>
                    </div>
                    <div class="category-stat-dropdown" id="${cat.id}-stat-dropdown">
                        ${flavorsList.length > 0
                            ? flavorsList.map(f => `
                                <div style="display: flex; justify-content: space-between; font-size: 0.75rem; color: #E2E8F0; padding: 0.35rem 0; border-bottom: 1px dashed rgba(255,255,255,0.03);">
                                    <span style="font-weight: 700; color: var(--color-white);">${f.name}</span>
                                    <div style="display: flex; gap: 0.5rem; align-items: center; font-family: monospace;">
                                        <span style="color: var(--color-gold); font-weight: 800;">${f.qty} ${cat.unitLabel}</span>
                                        <span style="color: var(--color-success); font-weight: 800;">${formatUSD(f.usd)}</span>
                                        <span style="color: var(--color-text-muted); font-size: 0.7rem;">(${formatVES(f.usd * rate)})</span>
                                    </div>
                                </div>
                            `).join('')
                            : `<div style="text-align: center; color: var(--color-text-muted); font-size: 11px; padding: 0.5rem 0;">No hay ventas registradas.</div>`
                        }
                    </div>
                </div>
            `;
        });

        if (sortedStats.length === 0) {
            html = `<div style="text-align: center; color: var(--color-text-muted); font-size: 0.8125rem; padding: 1rem 0;">No hay ventas registradas hoy.</div>`;
        }

        categoriesContainer.innerHTML = html;

        // Bind toggle click handlers for each dynamic category card
        sortedStats.forEach(cat => {
            const row = document.getElementById(`${cat.id}-stat-row`);
            const dropdown = document.getElementById(`${cat.id}-stat-dropdown`);
            if (row && dropdown) {
                row.addEventListener('click', () => {
                    row.classList.toggle('open');
                    dropdown.classList.toggle('open');
                });
            }
        });

        // 1b. Render Inventory Reconciliation (Match)
        const matchSection = document.getElementById('inventory-match-section');
        if (matchSection) {
            const activeRole = sessionStorage.getItem('casa_lucenzo_active_role');
            if (activeRole !== 'admin') {
                matchSection.classList.add('hidden');
                matchSection.innerHTML = '';
            } else {
                const auditedProducts = [];
            products.forEach(p => {
                if (p.id === 'abono') return;
                const initial = (p.initial_stock !== undefined && p.initial_stock !== null) ? p.initial_stock : (p.max || 0);
                if (initial === 0) return; // Ignore products that have no loaded capacity today
                
                const stock = p.stock || 0;
                const expectedSales = Math.max(0, initial - stock);
                const loggedSales = salesLog.filter(s => s.productId === p.id).length;
                const discrepancy = expectedSales - loggedSales;
                
                if (discrepancy !== 0) {
                    auditedProducts.push({
                        product: p,
                        max: initial,
                        stock: stock,
                        expected: expectedSales,
                        logged: loggedSales,
                        discrepancy: discrepancy,
                        value: discrepancy * (p.price || 0)
                    });
                }
            });

            if (auditedProducts.length === 0) {
                matchSection.classList.add('hidden');
                matchSection.innerHTML = '';
            } else {
                matchSection.classList.remove('hidden');
                
                const totalMissingQty = auditedProducts.reduce((sum, p) => sum + (p.discrepancy > 0 ? p.discrepancy : 0), 0);
                const totalMissingVal = auditedProducts.reduce((sum, p) => sum + (p.discrepancy > 0 ? p.value : 0), 0);
                
                let matchHtml = `
                    <h4 style="font-size: 11px; font-weight: 900; color: var(--color-success); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.5rem; display: flex; align-items: center; justify-content: space-between;">
                        <span><i class="fa-solid fa-scale-balanced"></i> Conciliación de Vitrina y Caja</span>
                        ${totalMissingQty > 0 ? `
                        <span style="font-size: 9px; padding: 2px 6px; border-radius: 4px; background: rgba(248, 113, 113, 0.15); color: #F87171; border: 1px solid rgba(248, 113, 113, 0.2); font-weight: 800;">
                            ${totalMissingQty} unids. sin registrar
                        </span>` : ''}
                    </h4>
                    <p style="font-size: 11px; color: var(--color-text-muted); margin-bottom: 0.75rem;">
                        Hay diferencias entre las piezas vendidas físicas y los registros del sistema.
                    </p>
                    
                    <div style="display: flex; flex-direction: column; gap: 0.4rem; margin-bottom: 1rem;">
                `;
                
                auditedProducts.forEach(item => {
                    const color = item.discrepancy > 0 ? '#F87171' : '#60A5FA';
                    const label = item.discrepancy > 0 ? `Faltan ${item.discrepancy} por registrar` : `Sobran ${Math.abs(item.discrepancy)} registradas`;
                    const pricePrefix = item.discrepancy > 0 ? '+' : '';
                    
                    matchHtml += `
                        <div style="background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.04); padding: 0.5rem 0.75rem; border-radius: 6px; display: flex; justify-content: space-between; align-items: center; font-size: 0.75rem;">
                            <div>
                                <div style="font-weight: bold; color: var(--color-white);">${item.product.name}</div>
                                <div style="font-size: 10px; color: var(--color-text-muted); margin-top: 2px;">
                                    Inicial: ${item.max} | Quedan: ${item.stock} | Registrado: ${item.logged}
                                </div>
                            </div>
                            <div style="text-align: right; font-family: monospace;">
                                <div style="color: ${color}; font-weight: 800; font-size: 10px;">${label}</div>
                                <div style="color: ${item.discrepancy > 0 ? 'var(--color-success)' : 'var(--color-danger)'}; font-weight: 800; font-size: 10px; margin-top: 1px;">
                                    ${pricePrefix}$${Math.abs(item.value).toFixed(2)}
                                </div>
                            </div>
                        </div>
                    `;
                });
                
                matchHtml += `
                    </div>
                    
                    <div style="display: flex; gap: 0.5rem; align-items: center; justify-content: space-between; background: rgba(16, 185, 129, 0.04); border: 1px solid rgba(16, 185, 129, 0.1); padding: 0.625rem; border-radius: 6px;">
                        <div>
                            <div style="font-size: 9px; color: var(--color-text-muted); text-transform: uppercase;">Caja por registrar:</div>
                            <div style="font-size: 1rem; font-weight: 900; color: var(--color-success); font-family: monospace; margin-top: 2px;">
                                +$${totalMissingVal.toFixed(2)}
                            </div>
                        </div>
                        ${totalMissingQty > 0 ? `
                        <button id="btn-reconcile-inventory" class="btn-action-small" style="background-color: var(--color-success); border-color: var(--color-success-border); color: #000000; font-weight: 900; padding: 0.4rem 0.75rem; font-size: 10px; height: auto;">
                            <i class="fa-solid fa-bolt"></i> Autocorregir Caja
                        </button>` : `
                        <span style="font-size: 10px; font-weight: 700; color: var(--color-gold);">Exceso de registros</span>`}
                    </div>
                `;
                
                matchSection.innerHTML = matchHtml;
                
                const btnReconcile = document.getElementById('btn-reconcile-inventory');
                if (btnReconcile) {
                    btnReconcile.addEventListener('click', () => {
                        if (confirm(`¿Estás seguro de registrar las ${totalMissingQty} ventas faltantes en la caja de hoy ($${totalMissingVal.toFixed(2)})?`)) {
                            if (typeof window.handleAutocorrectSales === 'function') {
                                window.handleAutocorrectSales(auditedProducts);
                            }
                        }
                    });
                }
            }
        }
    }
}

    // 2. Render 6 Tables Grid
    const tablesContainer = document.getElementById('tables-grid-container');
    if (tablesContainer) {
        let tablesHtml = `
            <h4 style="font-size: 11px; font-weight: 900; color: var(--color-gold); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.75rem; display: flex; align-items: center; gap: 0.35rem;">
                <i class="fa-solid fa-table-cells-large"></i> Mesas en el Local
            </h4>
            <div class="tables-grid" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.5rem;">
        `;

        for (let t = 1; t <= 6; t++) {
            const tableName = `Mesa ${t}`;
            
            // Find if this table has any active (unpaid) entries
            const tableSales = salesLog.filter(s => {
                const match = s.name.match(/^(.*)\s+\[(.*)\](\s*\(Pagado(?: - .*?)?\))?$/);
                if (match) {
                    const client = match[2];
                    const isPaid = !!match[3];
                    return client === tableName && !isPaid;
                }
                return false;
            });

            const isOccupied = tableSales.length > 0;
            const totalConsumed = tableSales.reduce((sum, s) => sum + (s.price || 0), 0);
            
            let statusText = 'Libre';
            let statusClass = 'status-free';
            let cardStyle = 'background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); padding: 0.75rem; border-radius: 6px; text-align: center; cursor: pointer; transition: all 0.2s;';
            
            if (isOccupied) {
                statusText = `Ocupada ($${totalConsumed.toFixed(2)})`;
                statusClass = 'status-occupied';
                cardStyle = 'background: rgba(212,175,55,0.05); border: 1px solid var(--color-gold); padding: 0.75rem; border-radius: 6px; text-align: center; cursor: pointer; transition: all 0.2s; box-shadow: 0 0 10px rgba(212,175,55,0.1);';
            }

            tablesHtml += `
                <div class="table-card" style="${cardStyle}" data-table="${tableName}">
                    <div style="font-size: 0.75rem; font-weight: 800; color: ${isOccupied ? 'var(--color-gold)' : 'var(--color-text-muted)'};">${tableName}</div>
                    <div style="font-size: 9px; margin-top: 0.25rem; font-weight: 700;" class="${statusClass}">${statusText}</div>
                </div>
            `;
        }

        tablesHtml += `</div>`;
        tablesContainer.innerHTML = tablesHtml;

        // Add event listeners to table cards to open options modal
        tablesContainer.querySelectorAll('.table-card').forEach(card => {
            card.addEventListener('click', () => {
                const tableName = card.getAttribute('data-table');
                showTableOptionsModal(tableName, salesLog, onUndo, onEdit, onPay, products);
            });
        });
    }

    // 3. Render Clients Lists (Active vs Closed)
    const activosContainer = document.getElementById('clientes-activos-container');
    const pagadosContainer = document.getElementById('clientes-pagados-container');
    if (!activosContainer || !pagadosContainer) return;

    activosContainer.innerHTML = '';
    pagadosContainer.innerHTML = '';
    activosContainer.style.display = 'grid';
    activosContainer.style.gridTemplateColumns = 'repeat(auto-fill, minmax(135px, 1fr))';
    activosContainer.style.gap = '0.5rem';




    // Group salesLog by client account (shared with the day-close report's
    // "Ventas por Cliente" view -- see groupSalesByClientAccounts).
    const groupedList = groupSalesByClientAccounts(salesLog);

    let activeCount = 0;
    let paidCount = 0;

    groupedList.forEach(group => {
        let timeStr;
        try {
            const date = parseUTCTimestamp(group.timestamp);
            timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } catch(e) {
            timeStr = 'Ahora';
        }

        // Active (unpaid) accounts: compact tile -- tap to open the full detail
        // + actions in showClientAccountModal, so several accounts fit on
        // screen at once instead of one full card each.
        if (!group.isPaid) {
            const tile = document.createElement('div');
            tile.className = 'client-tile';
            tile.setAttribute('data-client-timestamp', group.timestamp);
            tile.style.background = 'rgba(212,175,55,0.06)';
            tile.style.border = '1px solid var(--color-gold)';
            tile.style.borderRadius = '10px';
            tile.style.padding = '0.9rem 0.65rem';
            tile.style.textAlign = 'center';
            tile.style.cursor = 'pointer';

            const totalVES = group.total * (window.bcvRate || 1);
            tile.innerHTML = `
                <div style="font-size: 12px; font-weight: 800; color: var(--color-gold); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(group.clientName)}</div>
                <div style="font-size: 15px; font-weight: 900; color: var(--color-white); margin-top: 0.3rem;">$${group.total.toFixed(2)}</div>
                <div style="font-size: 10px; font-weight: 700; color: var(--color-text-muted); margin-top: 0.1rem;">Bs. ${totalVES.toFixed(2)}</div>
                <div style="font-size: 9px; color: var(--color-gold); margin-top: 0.25rem; font-weight: 800;">${timeStr}</div>
            `;

            tile.addEventListener('click', () => {
                showClientAccountModal(group, onUndo, onEdit, onPay);
            });

            activosContainer.appendChild(tile);
            activeCount++;
            return;
        }

        // Paid/closed accounts (Historial): unchanged full card
        const isTodayPaid = parseUTCTimestamp(group.timestamp) >= startOfToday;
        if (!isTodayPaid) return;

        const card = document.createElement('div');
        card.className = 'history-item';
        card.setAttribute('data-client-timestamp', group.timestamp);
        card.style.flexDirection = 'column';
        card.style.alignItems = 'stretch';
        card.style.gap = '0.5rem';
        card.style.padding = '0.75rem';

        const itemsSummary = group.items.map(it => `${it.quantity}x ${it.name}`).join(', ');

        const statusBadge = `<span class="client-status-badge paid">Pagado (${group.paymentMethod || 'Efectivo'})</span>`;

        card.innerHTML = `
            <!-- Header: Name, Status -->
            <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                <h4 style="font-size: 13px; font-weight: 800; color: var(--color-gold); margin: 0; display: flex; align-items: center; gap: 0.3rem;">
                    <i class="fa-solid fa-user-tag" style="font-size: 11px; opacity: 0.8;"></i> ${group.clientName}
                    ${group.clientRif ? `<span style="font-size: 10px; color: var(--color-text-muted); font-weight: bold;">(${group.clientRif})</span>` : ''}
                </h4>
                ${statusBadge}
            </div>
            
            <!-- Subtitle: Time and Total -->
            <div style="font-size: 11px; color: var(--color-text-muted); margin-top: -0.15rem; display: flex; justify-content: space-between; align-items: center; width: 100%;">
                <span>${timeStr}</span>
                <span style="font-weight: 700; color: var(--color-white);">Total: $${group.total.toFixed(2)} <span style="font-weight: 500; font-size: 10px; color: var(--color-text-muted);">(Bs. ${(group.total * (window.bcvRate || 1)).toFixed(2)})</span></span>
            </div>
            
            <!-- Items list -->
            <div style="font-size: 11px; color: var(--color-white); opacity: 0.85; padding-top: 0.35rem; border-top: 1px solid rgba(255,255,255,0.04); margin-bottom: 0.25rem;">
                <strong>Lleva:</strong> ${itemsSummary}
            </div>
            
            <!-- Action Buttons Row -->
            <div style="display: flex; gap: 0.4rem; width: 100%; border-top: 1px solid rgba(255,255,255,0.04); padding-top: 0.5rem; justify-content: flex-end; flex-wrap: wrap;">
                <button class="btn-action-small btn-pos-ticket-client" title="Ver / Imprimir Factura POS SENIAT" style="flex: 1.5; height: 36px; justify-content: center; font-size: 0.75rem; background-color: rgba(212,175,55,0.18); color: var(--color-gold); border: 1px solid rgba(212,175,55,0.4); font-weight: 800;">
                    <i class="fa-solid fa-receipt"></i> Factura POS
                </button>
                <button class="btn-action-small btn-share-client" title="Compartir Ticket" style="height: 36px; width: 38px; justify-content: center; font-size: 0.75rem;">
                    <i class="fa-brands fa-whatsapp"></i>
                </button>
                <button class="btn-action-small btn-modify-client" style="flex: 1.5; height: 36px; justify-content: center; background-color: ${group.isPaid ? 'var(--color-warning)' : 'var(--color-gold)'}; color: var(--color-bg-navy); font-size: 0.75rem;" title="${group.isPaid ? 'Corregir una venta ya cobrada (la cuenta vuelve a quedar pendiente de pago para registrar el cobro correcto)' : 'Agregar más cosas'}">
                    <i class="fa-solid fa-pen-to-square"></i> ${group.isPaid ? 'Corregir' : 'Modificar'}
                </button>
                ${!group.isPaid ? `
                    <button class="btn-action-small btn-pay-client" style="flex: 1.5; height: 36px; justify-content: center; background-color: var(--color-success); color: var(--color-bg-navy); font-size: 0.75rem; font-weight: 800;" title="Marcar como pagada y registrar cobro">
                        <i class="fa-solid fa-circle-check"></i> Registrar Pago
                    </button>
                ` : ''}
                <button class="btn-action-small btn-undo-client" style="height: 36px; justify-content: center; width: 38px; background-color: var(--color-danger); color: var(--color-white);" title="Deshacer y devolver stock">
                    <i class="fa-solid fa-rotate-left"></i>
                </button>
            </div>
        `;

        // Bind event listeners
        card.querySelector('.btn-pos-ticket-client').addEventListener('click', () => {
            if (group.isPaid) {
                // Already collected: just reprint the ticket, read-only. Routing this
                // through showPaymentMethodModal (below) would surface its "CONFIRMAR Y
                // REGISTRAR PAGO" button, which silently overwrites the recorded
                // payment method if a cashier taps it out of habit while just trying
                // to view/reprint a closed sale's receipt.
                showPosReceiptModal({
                    cart: group.items,
                    clientName: group.clientName,
                    clientRif: group.clientRif,
                    timestamp: group.timestamp,
                    facNo: (group.timestamp.replace(/\D/g, '') + '0000').substring(0, 16),
                    isAlreadyPaid: true,
                    payMethod: group.paymentMethod || 'Efectivo',
                    rate: group.bcvRate
                });
            } else {
                showPaymentMethodModal(group.clientName, group.clientRif, group.items, group.timestamp, (method, name, rif) => {
                    if (onPay) onPay(group.timestamp, method, name, rif);
                });
            }
        });

        card.querySelector('.btn-share-client').addEventListener('click', () => {
            let msg = `*CASA LUCCENZO* 🥖\n`;
            msg += `*Ticket de Consumo* 🧾\n`;
            msg += group.clientRif ? `👤 *Cliente:* ${group.clientName} (${group.clientRif})\n` : `👤 *Cliente:* ${group.clientName}\n`;
            msg += `--------------------------------------\n`;
            group.items.forEach(it => {
                msg += `• ${it.quantity}x ${it.name} - $${(it.price * it.quantity).toFixed(2)}\n`;
            });
            msg += `--------------------------------------\n`;
            msg += `💵 *Total a Pagar:* *$${group.total.toFixed(2)} USD*\n`;
            msg += `💵 *Tasa BCV:* ${(window.bcvRate || 1).toFixed(2)} Bs.\n`;
            msg += `🇻🇪 *Total en Bolívares:* *Bs. ${(group.total * (window.bcvRate || 1)).toFixed(2)} VES*\n`;
            msg += `--------------------------------------\n`;
            msg += `¡Muchas gracias por su compra! 🌟`;

            const encoded = encodeURIComponent(msg);
            window.open(`https://api.whatsapp.com/send?text=${encoded}`, '_blank');
        });

        card.querySelector('.btn-modify-client').addEventListener('click', () => {
            if (onEdit) onEdit(group.timestamp);
        });

        card.querySelector('.btn-undo-client').addEventListener('click', () => {
            if (onUndo) onUndo(group.timestamp);
        });

        pagadosContainer.appendChild(card);
        paidCount++;
    });

    if (activeCount === 0) {
        activosContainer.innerHTML = '<div style="font-size: 11px; color: var(--color-text-muted); padding: 0.5rem; text-align: center;">No hay cuentas activas abiertas consumiendo.</div>';
    }
    if (paidCount === 0) {
        pagadosContainer.innerHTML = '<div style="font-size: 11px; color: var(--color-text-muted); padding: 0.5rem; text-align: center;">No hay historial de cuentas pagadas hoy.</div>';
    }
}

function cleanProductName(name = '') {
    return name
        .replace(/\s*\[.*?\]/g, '')
        .replace(/\s*\((?:Pagado|Punto|Pago|Efectivo|Biopago).*?\)/gi, '')
        .trim();
}

function getItemTotalUSD(item) {
    if (!item) return 0;
    if (typeof item.totalPrice === 'number' && item.totalPrice > 0) {
        return item.totalPrice;
    }
    const qty = item.quantity || 1;
    const price = item.price || 0;
    return price * qty;
}

/**
 * Shows the dedicated Payment Method Selection Modal when registering payment for an open account card
 */
function showPaymentMethodModal(clientName, clientRif, items = [], timestamp = new Date().toISOString(), onSelect = null) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-backdrop';
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100vw';
    overlay.style.height = '100vh';
    overlay.style.backgroundColor = 'rgba(0,0,0,0.85)';
    overlay.style.backdropFilter = 'blur(8px)';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.zIndex = '3000';
    overlay.style.padding = '1rem';
    overlay.style.boxSizing = 'border-box';
    overlay.style.overflowY = 'auto';

    const rate = window.bcvRate || 1;
    const totalUSD = items.reduce((sum, it) => sum + getItemTotalUSD(it), 0);
    const totalVES = totalUSD * rate;

    const modalBody = document.createElement('div');
    modalBody.style.width = '100%';
    modalBody.style.maxWidth = '400px';
    modalBody.style.maxHeight = '90vh';
    modalBody.style.overflowY = 'auto';
    modalBody.style.backgroundColor = '#111827';
    modalBody.style.border = '1px solid rgba(212,175,55,0.4)';
    modalBody.style.borderRadius = '14px';
    modalBody.style.boxShadow = '0 20px 50px rgba(0,0,0,0.8)';
    modalBody.style.color = '#FFFFFF';
    modalBody.style.padding = '1.25rem';
    modalBody.style.boxSizing = 'border-box';

    const formatVES = (val) => 'Bs. ' + (val || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const safeClientName = clientName || 'Cliente';
    const safeClientRif = clientRif || '';
    let selectedMethod = 'Punto de Venta';

    const paymentOptions = [
        { id: 'Punto de Venta', label: '💳 Punto de Venta', icon: 'fa-credit-card', color: '#3B82F6' },
        { id: 'Pago Móvil', label: '📱 Pago Móvil', icon: 'fa-mobile-screen-button', color: '#10B981' },
        { id: 'Efectivo $', label: '💵 Efectivo Divisas ($)', icon: 'fa-money-bill-wave', color: '#F59E0B' },
        { id: 'Efectivo Bs.', label: '💵 Efectivo Bs.', icon: 'fa-money-bill-1', color: '#8B5CF6' },
        { id: 'Transferencia', label: '🏦 Transferencia', icon: 'fa-building-columns', color: '#06B6D4' },
        { id: 'Biopago', label: '👆 Biopago', icon: 'fa-fingerprint', color: '#EC4899' }
    ];

    modalBody.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 0.75rem; margin-bottom: 1rem;">
            <h3 style="font-family: var(--font-serif); font-size: 1.1rem; color: var(--color-gold); font-weight: 900; margin: 0; text-transform: uppercase; display: flex; align-items: center; gap: 0.5rem;">
                <i class="fa-solid fa-wallet"></i> Seleccionar Método de Pago
            </h3>
            <button class="btn-close-pay-modal" style="background: none; border: none; color: var(--color-text-muted); font-size: 1.25rem; cursor: pointer;">
                <i class="fa-solid fa-xmark"></i>
            </button>
        </div>

        <!-- Total Header Banner -->
        <div style="background: rgba(212,175,55,0.1); border: 1px solid rgba(212,175,55,0.3); border-radius: 10px; padding: 0.75rem; margin-bottom: 1rem; text-align: center;">
            <div style="font-size: 0.8rem; color: var(--color-text-muted); text-transform: uppercase; font-weight: 700;">
                Cliente: <strong style="color: var(--color-white);">${safeClientName}</strong> ${safeClientRif ? '('+safeClientRif+')' : ''}
            </div>
            <div style="font-size: 1.4rem; font-weight: 900; color: var(--color-gold); margin-top: 0.2rem;">
                $${totalUSD.toFixed(2)} USD
            </div>
            <div style="font-size: 0.85rem; color: #34D399; font-weight: 800; margin-top: 0.1rem;">
                ${formatVES(totalVES)} <span style="font-size: 0.7rem; color: var(--color-text-muted); font-weight: normal;">(Tasa: ${rate.toFixed(2)} Bs.)</span>
            </div>
        </div>

        <!-- Payment Method Selection Grid -->
        <div style="font-size: 0.8rem; font-weight: 800; color: var(--color-gold); margin-bottom: 0.5rem; text-transform: uppercase;">
            MÉTODO DE PAGO RECIBIDO:
        </div>

        <div id="payment-methods-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; margin-bottom: 1rem;">
            ${paymentOptions.map(opt => `
                <button class="btn-pay-option ${opt.id === selectedMethod ? 'active-pay-option' : ''}" data-method="${opt.id}" style="
                    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.3rem;
                    padding: 0.75rem 0.5rem; border-radius: 10px; cursor: pointer; text-align: center;
                    border: 2px solid ${opt.id === selectedMethod ? 'var(--color-gold)' : 'rgba(255,255,255,0.1)'};
                    background: ${opt.id === selectedMethod ? 'rgba(212,175,55,0.18)' : 'rgba(255,255,255,0.03)'};
                    color: ${opt.id === selectedMethod ? 'var(--color-gold)' : 'var(--color-white)'};
                    transition: all 0.2s; outline: none;
                ">
                    <i class="fa-solid ${opt.icon}" style="font-size: 1.25rem; color: ${opt.color};"></i>
                    <span style="font-size: 0.75rem; font-weight: 800;">${opt.label}</span>
                </button>
            `).join('')}
        </div>

        <!-- Client Info Inputs (Editable) -->
        <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; padding: 0.75rem; margin-bottom: 1rem; font-size: 0.75rem;">
            <div style="margin-bottom: 0.5rem;">
                <label style="display: block; color: var(--color-text-muted); font-weight: 700; margin-bottom: 0.2rem;">Nombre / Razón Social:</label>
                <input type="text" id="pay-client-name-input" value="${safeClientName}" style="width: 100%; box-sizing: border-box; background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; padding: 6px 8px; color: var(--color-white); font-weight: 700; font-size: 0.8rem;">
            </div>
            <div>
                <label style="display: block; color: var(--color-text-muted); font-weight: 700; margin-bottom: 0.2rem;">Cédula / RIF (Opcional):</label>
                <input type="text" id="pay-client-rif-input" value="${safeClientRif}" style="width: 100%; box-sizing: border-box; background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; padding: 6px 8px; color: var(--color-white); font-weight: 700; font-size: 0.8rem;">
            </div>
        </div>

        <!-- Action Controls -->
        <div style="display: flex; flex-direction: column; gap: 0.5rem;">
            <button class="btn-confirm-final-pay" style="height: 46px; display: flex; align-items: center; justify-content: center; gap: 0.5rem; font-size: 0.95rem; font-weight: 900; border-radius: 8px; border: none; cursor: pointer; background: var(--color-success); color: var(--color-bg-navy); width: 100%;">
                <i class="fa-solid fa-circle-check"></i> CONFIRMAR Y REGISTRAR PAGO
            </button>
            <button class="btn-view-pos-receipt" style="height: 38px; display: flex; align-items: center; justify-content: center; gap: 0.4rem; font-size: 0.78rem; font-weight: 800; border-radius: 8px; border: 1px solid rgba(212,175,55,0.3); cursor: pointer; background: rgba(212,175,55,0.1); color: var(--color-gold); width: 100%;">
                <i class="fa-solid fa-receipt"></i> VER / IMPRIMIR COMPROBANTE TÉRMICO
            </button>
        </div>
    `;

    overlay.appendChild(modalBody);
    document.body.appendChild(overlay);

    const closeModal = () => {
        overlay.style.opacity = '0';
        overlay.style.transition = 'opacity 0.2s ease-out';
        setTimeout(() => overlay.remove(), 200);
    };

    modalBody.querySelector('.btn-close-pay-modal').addEventListener('click', closeModal);

    // Option selection logic
    const optionBtns = modalBody.querySelectorAll('.btn-pay-option');
    optionBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            selectedMethod = btn.dataset.method;
            optionBtns.forEach(b => {
                const isActive = b.dataset.method === selectedMethod;
                b.style.border = isActive ? '2px solid var(--color-gold)' : '2px solid rgba(255,255,255,0.1)';
                b.style.background = isActive ? 'rgba(212,175,55,0.18)' : 'rgba(255,255,255,0.03)';
                b.style.color = isActive ? 'var(--color-gold)' : 'var(--color-white)';
            });
        });
    });

    modalBody.querySelector('.btn-view-pos-receipt').addEventListener('click', () => {
        const currentName = modalBody.querySelector('#pay-client-name-input').value.trim() || safeClientName;
        const currentRif = modalBody.querySelector('#pay-client-rif-input').value.trim() || safeClientRif;
        showPosReceiptModal({
            cart: items,
            clientName: currentName,
            clientRif: currentRif,
            timestamp: timestamp,
            facNo: (timestamp.replace(/\D/g, '') + '0000').substring(0, 16),
            isAlreadyPaid: false,
            payMethod: selectedMethod
        });
    });

    modalBody.querySelector('.btn-confirm-final-pay').addEventListener('click', () => {
        const updatedName = modalBody.querySelector('#pay-client-name-input').value.trim() || 'Cliente';
        const updatedRif = modalBody.querySelector('#pay-client-rif-input').value.trim() || '';
        closeModal();
        if (onSelect) onSelect(selectedMethod, updatedName, updatedRif);
    });
}

/**
 * Shows a POS Thermal Receipt preview modal for a client order
 */
function showPosReceiptModal({
    cart = [],
    clientName = 'Cliente',
    clientRif = '',
    timestamp = new Date().toISOString(),
    facNo = '',
    isAlreadyPaid = false,
    payMethod = '',
    rate: rateOverride = null
}) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-backdrop';
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100vw';
    overlay.style.height = '100vh';
    overlay.style.backgroundColor = 'rgba(0,0,0,0.85)';
    overlay.style.backdropFilter = 'blur(8px)';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.zIndex = '3000';
    overlay.style.padding = '1rem';
    overlay.style.boxSizing = 'border-box';
    overlay.style.overflowY = 'auto';

    // A closed sale already has the BCV rate it was actually charged at
    // (see groupSalesByClientAccounts) -- an invoice for a past day must keep
    // showing that rate, not whatever the dollar happens to be worth right
    // now, or the Bs. total on a reprinted "Factura POS SENIAT" stops
    // matching what the client actually paid. Only a not-yet-charged sale
    // (no rate passed in) falls back to the live rate.
    const rate = (rateOverride && !isNaN(parseFloat(rateOverride)) && parseFloat(rateOverride) > 0)
        ? parseFloat(rateOverride)
        : (window.bcvRate || 1);
    const totalUSD = cart.reduce((sum, item) => sum + getItemTotalUSD(item), 0);
    const totalVES = totalUSD * rate;

    // Optional 16% IVA surcharge for clients that request a factura.
    // Normal sales stay at totalVES/totalUSD; checking the toggle below
    // adds 16% on top to reach the invoiced total (SENIAT).
    const iva16VES = totalVES * 0.16;
    const totalConIvaVES = totalVES + iva16VES;
    const totalConIvaUSD = totalUSD * 1.16;

    let timeStr = 'Ahora';
    let dateStr = new Date().toLocaleDateString('es-VE');
    try {
        const d = parseUTCTimestamp(timestamp);
        timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        dateStr = d.toLocaleDateString('es-VE');
    } catch { /* unparseable timestamp -- keep the 'Ahora' / today defaults above */ }

    if (!facNo) {
        facNo = (timestamp.replace(/\D/g, '') + '0000').substring(0, 16);
    }

    const modalBody = document.createElement('div');
    modalBody.style.width = '100%';
    modalBody.style.maxWidth = '360px';
    modalBody.style.maxHeight = '90vh';
    modalBody.style.overflowY = 'auto';
    modalBody.style.backgroundColor = '#111827';
    modalBody.style.border = '1px solid rgba(212,175,55,0.4)';
    modalBody.style.borderRadius = '14px';
    modalBody.style.boxShadow = '0 20px 50px rgba(0,0,0,0.8)';
    modalBody.style.color = '#FFFFFF';
    modalBody.style.padding = '1.25rem';
    modalBody.style.boxSizing = 'border-box';

    const formatVES = (val) => 'Bs. ' + (val || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    modalBody.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 0.75rem; margin-bottom: 0.75rem;">
            <h3 style="font-family: var(--font-serif); font-size: 1rem; color: var(--color-gold); font-weight: 900; margin: 0; text-transform: uppercase; display: flex; align-items: center; gap: 0.4rem;">
                <i class="fa-solid fa-receipt"></i> Comprobante POS
            </h3>
            <button class="btn-close-pos-modal" style="background: none; border: none; color: var(--color-text-muted); font-size: 1.25rem; cursor: pointer;">
                <i class="fa-solid fa-xmark"></i>
            </button>
        </div>

        <!-- Optional Factura IVA Toggle Bar -->
        <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); padding: 0.4rem 0.6rem; border-radius: 8px; margin-bottom: 0.75rem; font-size: 0.75rem;">
            <span style="color: var(--color-text-muted); font-weight: 600;">¿Cliente pidió factura?</span>
            <label style="display: flex; align-items: center; gap: 0.3rem; cursor: pointer;">
                <input type="checkbox" id="toggle-pos-iva" style="cursor: pointer;">
                <span style="font-weight: 700; color: var(--color-gold);">Facturar con IVA (+16%)</span>
            </label>
        </div>

        <!-- Printable Receipt Paper -->
        <div id="pos-paper-container" style="background-color: #FFFFFF; color: #000000; font-family: 'Courier New', Courier, monospace; padding: 1.25rem 0.75rem; border-radius: 6px; box-shadow: 0 4px 15px rgba(0,0,0,0.3); font-size: 0.75rem; line-height: 1.35;">
            
            <!-- SENIAT Header -->
            <div style="text-align: center; font-weight: bold; margin-bottom: 0.4rem;">
                <div style="font-size: 1rem; letter-spacing: 0.05em;">SENIAT</div>
                <div style="font-size: 0.75rem;">RIF J-508183134</div>
                <div style="font-size: 0.75rem; margin-top: 0.15rem;">EMPRENDIMIENTO KAIRA BLANCO</div>
                <div style="font-size: 0.85rem; margin-top: 0.2rem; font-weight: 900;">CASA LUCENZO</div>
                <div style="font-size: 0.62rem; font-weight: normal; margin-top: 0.25rem; color: #333; line-height: 1.2;">
                    AV WINSTON CHURCHILL ENTRE 3ERA Y 4TA CARRERA SUR LOCAL NRO S/N SECTOR PUEBLO NUEVO SUR EL TIGRE ANZOATEGUI ZONA POSTAL 6050
                </div>
            </div>

            <div style="border-top: 1px dashed #000; margin: 0.35rem 0;"></div>

            <!-- Client & Order Info -->
            <div style="font-size: 0.72rem; margin-bottom: 0.35rem;">
                <div style="display: flex; justify-content: space-between;">
                    <span>RIF/C.I.:</span>
                    <span style="font-weight: bold;">${clientRif}</span>
                </div>
                <div style="display: flex; justify-content: space-between; margin-top: 0.1rem;">
                    <span>RAZON SOCIAL:</span>
                    <span style="font-weight: bold;">${clientName}</span>
                </div>
                <div style="display: flex; justify-content: space-between; margin-top: 0.1rem;">
                    <span>DIR.:</span>
                    <span>EL TIGRE, ANZOATEGUI</span>
                </div>
                <div style="display: flex; justify-content: space-between; margin-top: 0.1rem;">
                    <span>CAJA:</span>
                    <span>01 -Oper.: CAJA PRINCIPAL</span>
                </div>
                <div style="display: flex; justify-content: space-between; margin-top: 0.1rem;">
                    <span>PRODUCTOS: ${cart.length}</span>
                    <span>TOT. REF: $${totalUSD.toFixed(2)}</span>
                </div>
            </div>

            <div style="border-top: 1px dashed #000; margin: 0.35rem 0;"></div>

            <!-- Factura Bar & Date -->
            <div style="text-align: center; margin: 0.4rem 0 0.3rem 0;">
                <div style="font-size: 0.85rem; font-weight: 900; letter-spacing: 0.08em; text-transform: uppercase;">FACTURA</div>
                <div style="display: flex; justify-content: space-between; font-size: 0.72rem; margin-top: 0.15rem;">
                    <span>FACTURA: ${facNo}</span>
                    <span>HORA: ${timeStr}</span>
                </div>
                <div style="display: flex; justify-content: space-between; font-size: 0.72rem;">
                    <span>FECHA: ${dateStr}</span>
                </div>
            </div>

            <!-- Product Rows Table -->
            <div style="border-top: 1px dashed #000; border-bottom: 1px dashed #000; padding: 0.4rem 0; margin-bottom: 0.4rem;">
                <div style="display: flex; justify-content: space-between; font-weight: bold; border-bottom: 1px solid #000; padding-bottom: 0.2rem; margin-bottom: 0.3rem;">
                    <span>Cant x Producto</span>
                    <span>Total</span>
                </div>
                ${cart.map(item => {
                    const displayName = cleanProductName(item.name);
                    const qty = item.quantity || 1;
                    const itemTotalUSD = getItemTotalUSD(item);
                    const unitPrice = qty > 0 ? (itemTotalUSD / qty) : 0;
                    const itemTotalVES = itemTotalUSD * rate;
                    return `
                        <div style="margin-bottom: 0.35rem;">
                            <div style="display: flex; justify-content: space-between; font-weight: 800;">
                                <span>${qty}x ${displayName}</span>
                                <span>$${itemTotalUSD.toFixed(2)}</span>
                            </div>
                            <div style="display: flex; justify-content: space-between; font-size: 0.68rem; color: #444; margin-top: 0.05rem;">
                                <span>@ $${unitPrice.toFixed(2)} (${formatVES(unitPrice * rate)})</span>
                                <span>${formatVES(itemTotalVES)}</span>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>

            <!-- Totals Section -->
            <div style="font-size: 0.75rem;">
                <div style="display: flex; justify-content: space-between; font-weight: bold; margin-bottom: 0.15rem;">
                    <span>SUBTOTAL:</span>
                    <span id="pos-subtotal-value">${formatVES(totalVES)}</span>
                </div>
                <div id="pos-iva-rows" style="display: none;">
                    <div style="display: flex; justify-content: space-between; font-size: 0.72rem; color: #222; margin-bottom: 0.15rem; border-top: 1px dashed #aaa; padding-top: 0.2rem;">
                        <span>BASE IMPONIBLE:</span>
                        <span>${formatVES(totalVES)}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; font-size: 0.72rem; color: #222; margin-bottom: 0.2rem;">
                        <span>IVA (16%):</span>
                        <span>${formatVES(iva16VES)}</span>
                    </div>
                </div>
                <div style="display: flex; justify-content: space-between; font-weight: 900; font-size: 0.95rem; margin-top: 0.25rem; margin-bottom: 0.2rem; border-top: 1px solid #000; padding-top: 0.25rem;">
                    <span>TOTAL VES:</span>
                    <span id="pos-total-ves-value">${formatVES(totalVES)}</span>
                </div>
                <div style="display: flex; justify-content: space-between; font-weight: 900; font-size: 0.88rem; margin-bottom: 0.2rem;">
                    <span>TOTAL USD:</span>
                    <span id="pos-total-usd-value">$${totalUSD.toFixed(2)}</span>
                </div>
                <div style="display: flex; justify-content: space-between; font-size: 0.7rem; color: #444; margin-bottom: 0.3rem;">
                    <span>Tasa BCV:</span>
                    <span>${formatVES(rate)}</span>
                </div>
                ${isAlreadyPaid ? `
                    <div style="display: flex; justify-content: space-between; font-size: 0.72rem; font-weight: bold; color: #000; border-top: 1px dashed #000; padding-top: 0.2rem; margin-top: 0.2rem;">
                        <span>PAGO (${payMethod || 'Efectivo'}):</span>
                        <span id="pos-pago-value">${formatVES(totalVES)}</span>
                    </div>
                ` : ''}
            </div>

            <div style="border-top: 1px dashed #000; margin: 0.4rem 0 0.3rem 0;"></div>

            <!-- Footer Message -->
            <div style="text-align: center; font-size: 0.72rem; font-weight: bold; margin-top: 0.3rem;">
                ¡Gracias por su preferencia! 🥖✨
                <div style="font-size: 0.6rem; font-weight: normal; margin-top: 0.2rem; color: #555;">MH Z7C${Math.floor(10000000 + Math.random() * 90000000)}</div>
            </div>
        </div>

        <!-- Action Controls -->
        <div style="display: flex; flex-direction: column; gap: 0.5rem; margin-top: 1rem;">
            <button class="btn-print-pos-ticket" style="height: 42px; display: flex; align-items: center; justify-content: center; gap: 0.4rem; font-size: 0.85rem; font-weight: 900; border-radius: 8px; border: none; cursor: pointer; background: var(--color-gold); color: var(--color-bg-navy); width: 100%;">
                <i class="fa-solid fa-print"></i> IMPRIMIR TICKET (80MM/58MM)
            </button>
        </div>
    `;

    overlay.appendChild(modalBody);
    document.body.appendChild(overlay);

    const closeModal = () => {
        overlay.style.opacity = '0';
        overlay.style.transition = 'opacity 0.25s ease-out';
        setTimeout(() => {
            overlay.remove();
        }, 250);
    };

    modalBody.querySelector('.btn-close-pos-modal').addEventListener('click', closeModal);

    const ivaCheckbox = modalBody.querySelector('#toggle-pos-iva');
    const ivaRows = modalBody.querySelector('#pos-iva-rows');
    const totalVesEl = modalBody.querySelector('#pos-total-ves-value');
    const totalUsdEl = modalBody.querySelector('#pos-total-usd-value');
    const pagoEl = modalBody.querySelector('#pos-pago-value');
    if (ivaCheckbox) {
        ivaCheckbox.addEventListener('change', (e) => {
            const withIva = e.target.checked;
            if (ivaRows) ivaRows.style.display = withIva ? 'block' : 'none';
            const shownVES = withIva ? totalConIvaVES : totalVES;
            const shownUSD = withIva ? totalConIvaUSD : totalUSD;
            if (totalVesEl) totalVesEl.textContent = formatVES(shownVES);
            if (totalUsdEl) totalUsdEl.textContent = '$' + shownUSD.toFixed(2);
            if (pagoEl) pagoEl.textContent = formatVES(shownVES);
        });
    }

    modalBody.querySelector('.btn-print-pos-ticket').addEventListener('click', () => {
        window.print();
    });
}

/**
 * Display a full screen blur overlay when a PWA/ServiceWorker update is found/downloading
 */
function showUpdateOverlay() {
    if (document.getElementById('pwa-update-overlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'pwa-update-overlay';
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100vw';
    overlay.style.height = '100vh';
    overlay.style.backgroundColor = 'rgba(10, 15, 30, 0.9)';
    overlay.style.backdropFilter = 'blur(12px)';
    overlay.style.display = 'flex';
    overlay.style.flexDirection = 'column';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.zIndex = '999999';
    overlay.style.transition = 'opacity 0.3s ease-in-out';
    overlay.style.color = '#FFFFFF';
    overlay.style.textAlign = 'center';
    overlay.style.padding = '2rem';
    overlay.style.boxSizing = 'border-box';

    overlay.innerHTML = `
        <div style="background: rgba(255, 255, 255, 0.02); border: 1.5px solid var(--color-gold); box-shadow: 0 10px 40px rgba(0,0,0,0.5), 0 0 30px rgba(212,175,55,0.15); max-width: 380px; padding: 2.25rem; border-radius: 16px; display: flex; flex-direction: column; align-items: center; gap: 1.25rem; transform: scale(0.9); animation: scaleIn 0.3s forwards ease-out;">
            <div id="pwa-update-icon-container" style="position: relative; width: 64px; height: 64px; display: flex; align-items: center; justify-content: center; background: rgba(212, 175, 55, 0.1); border-radius: 100px; border: 1px solid rgba(212, 175, 55, 0.3);">
                <i class="fa-solid fa-arrows-rotate fa-spin" style="color: var(--color-gold); font-size: 1.75rem;"></i>
            </div>
            <div>
                <h3 id="pwa-update-title" style="font-family: var(--font-serif); font-size: 1.2rem; font-weight: 900; color: var(--color-gold); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.5rem; margin-top: 0;">Cargando Actualización</h3>
                <p id="pwa-update-desc" style="font-size: 0.8rem; color: #E2E8F0; line-height: 1.5; margin: 0;">
                    Estamos instalando la versión más reciente del sistema en producción. Espera un momento por favor...
                </p>
            </div>
            <div style="width: 100%; height: 6px; background: rgba(255,255,255,0.05); border-radius: 3px; overflow: hidden; position: relative;">
                <div style="height: 100%; background: var(--color-gold); border-radius: 3px; width: 35%; animation: loaderProgress 1.5s infinite linear; position: absolute; left: 0;"></div>
            </div>
        </div>
        
        <style>
            @keyframes loaderProgress {
                0% { left: -35%; width: 35%; }
                50% { left: 30%; width: 40%; }
                100% { left: 100%; width: 35%; }
            }
            @keyframes pulseSuccess {
                0% { transform: scale(0.7); opacity: 0; }
                50% { transform: scale(1.1); }
                100% { transform: scale(1); opacity: 1; }
            }
        </style>
    `;

    document.body.appendChild(overlay);
}

/**
 * Update the overlay UI state to indicate that the update has successfully completed
 */
function updateOverlayStatusSuccess() {
    const iconContainer = document.getElementById('pwa-update-icon-container');
    const title = document.getElementById('pwa-update-title');
    const desc = document.getElementById('pwa-update-desc');

    if (iconContainer) {
        iconContainer.style.background = 'rgba(16, 185, 129, 0.15)';
        iconContainer.style.borderColor = 'rgba(16, 185, 129, 0.4)';
        iconContainer.innerHTML = `<i class="fa-solid fa-circle-check" style="color: var(--color-success); font-size: 1.85rem; animation: pulseSuccess 0.5s;"></i>`;
    }

    if (title) {
        title.style.color = 'var(--color-success)';
        title.innerText = '¡Sistema Actualizado!';
    }

    if (desc) {
        desc.innerText = 'Actualización completada con éxito. Reiniciando el sistema ahora...';
    }
}

/**
 * Render connected devices inside settings modal
 * @param {Array} sessions List of active sessions
 * @param {string} currentDeviceId This device's UUID
 * @param {Function} onDisconnect Callback when clicking disconnect/expulsar
 * @param {Function} onTrust Callback when clicking trust/autorizar
 */
function renderActiveDevices(sessions, currentDeviceId, onDisconnect, onTrust) {
    const listDiv = document.getElementById('settings-devices-list');
    if (!listDiv) return;

    if (!sessions || sessions.length === 0) {
        listDiv.innerHTML = `
            <div style="text-align: center; padding: 1rem 0; color: var(--color-text-muted); font-size: 0.75rem;">
                No hay dispositivos registrados en el servidor.
            </div>
        `;
        return;
    }

    let html = '';
    sessions.forEach(sess => {
        const isMe = sess.device_id === currentDeviceId;
        const isTrusted = sess.is_trusted === true;
        const meBadge = isMe ? '<span style="font-size: 8px; background: rgba(201, 162, 74, 0.15); border: 1px solid var(--color-gold); color: var(--color-gold); padding: 1px 4px; border-radius: 4px; font-weight: 800; margin-left: 0.25rem;">ESTE DISPOSITIVO</span>' : '';
        const trustBadge = isTrusted ? '<span style="font-size: 8px; background: rgba(16, 185, 129, 0.15); border: 1px solid var(--color-success); color: #34D399; padding: 1px 4px; border-radius: 4px; font-weight: 800; margin-left: 0.25rem;">CONFIABLE</span>' : '';
        const roleName = sess.role === 'admin' ? 'Administrador' : sess.role === 'cocina' ? 'Cocina' : 'Ventas (Local)';
        const dateObj = new Date(sess.last_active_at);
        const timeStr = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const isOnline = (Date.now() - dateObj.getTime()) < 120000;
        const statusDot = isOnline 
            ? '<span style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background-color: var(--color-success); box-shadow: 0 0 6px var(--color-success); margin-left: 0.25rem;" title="En línea"></span>'
            : '<span style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background-color: var(--color-text-muted); margin-left: 0.25rem;" title="Desconectado"></span>';

        html += `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.625rem; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); border-radius: var(--radius-sm);">
                <div style="display: flex; align-items: center; gap: 0.5rem; min-width: 0; flex: 1;">
                    <div style="font-size: 1.15rem; color: ${isMe ? 'var(--color-gold)' : isTrusted ? '#34D399' : 'var(--color-text-muted)'};">
                        <i class="${sess.device_name.includes('Phone') || sess.device_name.includes('iPad') ? 'fa-solid fa-mobile-screen-button' : 'fa-solid fa-desktop'}"></i>
                    </div>
                    <div style="min-width: 0; flex: 1;">
                        <div style="font-size: 0.75rem; font-weight: 700; color: var(--color-white); display: flex; align-items: center; flex-wrap: wrap; gap: 0.25rem;">
                            <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 130px;">${sess.device_name}</span>
                            ${statusDot} ${meBadge} ${trustBadge}
                        </div>
                        <div style="font-size: 9px; color: var(--color-text-muted);">
                            Rol: <strong>${roleName}</strong> | Activo: ${timeStr}
                        </div>
                    </div>
                </div>
                <div style="display: flex; gap: 0.35rem; align-items: center;">
                    <!-- Botón de Autorización (Verde) -->
                    <button class="btn-trust-device" data-id="${sess.device_id}" data-trusted="${isTrusted}" style="width: 2rem; height: 2rem; border-radius: var(--radius-sm); border: 1px solid ${isTrusted ? 'var(--color-success)' : 'rgba(16, 185, 129, 0.3)'}; background: ${isTrusted ? 'rgba(16, 185, 129, 0.15)' : 'transparent'}; color: ${isTrusted ? '#34D399' : 'rgba(16, 185, 129, 0.7)'}; cursor: pointer; display: flex; align-items: center; justify-content: center; outline: none; transition: all 0.2s;">
                        <i class="${isTrusted ? 'fa-solid fa-shield-halved' : 'fa-solid fa-shield'}" style="font-size: 0.75rem;"></i>
                    </button>

                    <!-- Botón de Expulsión (Rojo) -->
                    ${!isMe ? `
                        <button class="btn-eject-device" data-id="${sess.device_id}" style="width: 2rem; height: 2rem; border-radius: var(--radius-sm); border: 1px solid var(--color-danger-border); background: var(--color-danger-bg); color: #FCA5A5; cursor: pointer; display: flex; align-items: center; justify-content: center; outline: none; transition: opacity 0.2s;">
                            <i class="fa-solid fa-right-from-bracket" style="font-size: 0.75rem;"></i>
                        </button>
                    ` : ''}
                </div>
            </div>
        `;
    });

    listDiv.innerHTML = html;

    // Bind eject button click events
    listDiv.querySelectorAll('.btn-eject-device').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const devId = e.currentTarget.dataset.id;
            onDisconnect(devId);
        });
    });

    // Bind trust button click events
    listDiv.querySelectorAll('.btn-trust-device').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const devId = e.currentTarget.dataset.id;
            const currentVal = e.currentTarget.dataset.trusted === 'true';
            onTrust(devId, !currentVal);
        });
    });
}

/**
 * Render hourly sales distribution histogram
 * @param {Array} salesLog Sales array
 * @param {string} mode 'today' or 'weekly'
 */
function renderHourlyStats(salesLog, mode = 'today') {
    const container = document.getElementById('hourly-chart-content');
    if (!container) return;

    // Active business operational hours (6 AM to 3 PM)
    const targetHours = [6, 7, 8, 9, 10, 11, 12, 13, 14];

    // Filter salesLog based on active mode
    let filteredSales;
    if (mode === 'today') {
        const startOfToday = new Date();
        startOfToday.setHours(0,0,0,0);
        filteredSales = salesLog.filter(s => {
            const d = parseUTCTimestamp(s.timestamp);
            return d >= startOfToday;
        });
    } else {
        filteredSales = salesLog; // salesLog represents the weekly sales
    }

    // Group sales into hourly buckets
    const hourlyData = {};
    let outsideCount = 0;
    let outsideRevenue = 0;

    targetHours.forEach(h => {
        hourlyData[h] = { count: 0, revenue: 0 };
    });

    filteredSales.forEach(s => {
        const d = parseUTCTimestamp(s.timestamp);
        const hr = d.getHours();
        if (hr >= 6 && hr <= 14) {
            hourlyData[hr].count++;
            hourlyData[hr].revenue += s.price || 0;
        } else {
            outsideCount++;
            outsideRevenue += s.price || 0;
        }
    });

    // Find the peak hour (highest revenue)
    let peakHour = -1;
    let maxRevenue = 0;
    targetHours.forEach(h => {
        if (hourlyData[h].revenue > maxRevenue) {
            maxRevenue = hourlyData[h].revenue;
            peakHour = h;
        }
    });

    const scaleMax = Math.max(...targetHours.map(h => hourlyData[h].revenue), outsideRevenue, 1.0);

    let colsHtml = '';
    targetHours.forEach(h => {
        const data = hourlyData[h];
        const isPeak = h === peakHour && data.revenue > 0;
        const pct = (data.revenue / scaleMax) * 100;
        
        // Format AM/PM labels
        const labelStr = h >= 12 ? (h === 12 ? '12 PM' : `${h - 12} PM`) : `${h} AM`;
        const peakClass = isPeak ? ' peak-hour' : '';

        colsHtml += `
            <div class="hourly-column${peakClass}">
                <div class="hourly-val">$${data.revenue.toFixed(1)}</div>
                <div class="hourly-bar-track">
                    <div class="hourly-bar-fill" style="height: ${pct}%"></div>
                </div>
                <div class="hourly-label" style="font-size: 8px;">${labelStr}</div>
            </div>
        `;
    });

    if (outsideCount > 0) {
        const outsidePct = (outsideRevenue / scaleMax) * 100;
        colsHtml += `
            <div class="hourly-column" style="border-left: 1px dashed rgba(255,255,255,0.15); padding-left: 4px;">
                <div class="hourly-val" style="color: var(--color-danger); font-weight: 800;">$${outsideRevenue.toFixed(1)}</div>
                <div class="hourly-bar-track" style="border-color: rgba(239, 68, 68, 0.2);">
                    <div class="hourly-bar-fill" style="height: ${outsidePct}%; background: linear-gradient(180deg, var(--color-danger), #991b1b);"></div>
                </div>
                <div class="hourly-label" style="color: var(--color-danger); font-size: 8px; font-weight: 800;">Fuera H.</div>
            </div>
        `;
    }

    let summaryText;
    if (peakHour !== -1 && hourlyData[peakHour].revenue > 0) {
        const peakLabel = peakHour >= 12 ? (peakHour === 12 ? '12:00 PM' : `${peakHour - 12}:00 PM`) : `${peakHour}:00 AM`;
        const totalVolume = hourlyData[peakHour].count;
        let outsideText = outsideCount > 0 ? ` | Fuera de Horario: <span style="color: var(--color-danger); font-weight: 800;">$${outsideRevenue.toFixed(2)}</span> (${outsideCount} ventas)` : '';
        summaryText = `
            <div style="font-size: 11px; color: var(--color-text-muted); margin-bottom: 0.5rem; font-weight: 700; display: flex; align-items: center; gap: 0.35rem; justify-content: space-between; flex-wrap: wrap;">
                <div>
                    <span style="color: var(--color-gold);"><i class="fa-solid fa-crown"></i> Hora Pico (6am-3pm):</span> 
                    <span style="color: var(--color-white); font-weight: 800;">${peakLabel}</span> con <strong style="color: var(--color-success); font-weight: 800;">$${hourlyData[peakHour].revenue.toFixed(2)}</strong> (${totalVolume} ventas)${outsideText}
                </div>
                <div style="font-size: 9px; color: var(--color-text-muted); font-style: italic;">
                    Mostrando ventas por hour (${mode === 'today' ? 'Hoy' : 'Semana'})
                </div>
            </div>
        `;
    } else {
        let outsideText = outsideCount > 0 ? ` (Ventas Fuera Horario: <span style="color: var(--color-danger); font-weight: 800;">$${outsideRevenue.toFixed(2)}</span> por ${outsideCount} ventas)` : '';
        summaryText = `
            <div style="display: flex; justify-content: space-between; align-items: center; font-size: 11px; color: var(--color-text-muted); margin-bottom: 0.5rem;">
                <span>No hay ventas en horario de reporte (6 AM - 3 PM)${outsideText}.</span>
                <span style="font-size: 9px; font-style: italic;">Mostrando ventas por hour (${mode === 'today' ? 'Hoy' : 'Semana'})</span>
            </div>
        `;
    }

    container.innerHTML = `
        ${summaryText}
        <div class="hourly-chart-wrapper">
            ${colsHtml}
        </div>
    `;
}


/**
 * Renders the "Stock Crítico" banner on the Admin Dashboard: every product at
 * or below its minimum, plus a quick "Reponer" action per item and a link to
 * the full Productos tab. Uses the same stock<=min criteria as the header
 * badge (InventoryManager.getLowStockItems) so the two never disagree.
 * @param {Array} products Full product list
 * @param {Function} requestReplenishmentCallback (productId, productName, unit) => void
 */
function renderCriticalStockAlerts(products = [], requestReplenishmentCallback) {
    const container = document.getElementById('admin-critical-stock-container');
    if (!container) return;

    const lowStock = (window.InventoryManager && window.InventoryManager.getLowStockItems)
        ? window.InventoryManager.getLowStockItems(products)
        : [];
    // getLowStockItems() usa stock<=min, y trata un mínimo sin configurar (0)
    // como si "0" fuera el umbral real -- así que cualquier producto agotado
    // que nunca tuvo mínimo asignado se cuela como "crítico" sin serlo. Ese
    // ruido queda para el header/cocina (no lo tocamos, otros consumidores
    // dependen de él); acá exigimos un mínimo real configurado.
    const critical = lowStock.filter(p => (parseInt(p.min || p.stock_min) || 0) > 0);

    if (critical.length === 0) {
        container.classList.add('hidden');
        container.innerHTML = '';
        return;
    }

    container.classList.remove('hidden');
    container.innerHTML = `
        <div class="admin-critical-stock-banner">
            <div class="admin-critical-stock-items">
                <i class="fa-solid fa-triangle-exclamation"></i>
                <span class="admin-critical-stock-label">Stock Crítico</span>
                ${critical.map(p => `
                    <span class="admin-critical-stock-chip">
                        ${escapeHtml(p.name)} · <b>${p.stock}</b>
                        <button type="button" class="admin-critical-stock-replenish" data-id="${p.id}" title="Solicitar reposición">
                            <i class="fa-solid fa-truck-fast"></i>
                        </button>
                    </span>
                `).join('')}
            </div>
            <button type="button" id="btn-critical-stock-goto-inventory" class="btn-action-small">Ir a Inventario</button>
        </div>
    `;

    if (typeof requestReplenishmentCallback === 'function') {
        container.querySelectorAll('.admin-critical-stock-replenish').forEach(btn => {
            const product = critical.find(p => String(p.id) === btn.dataset.id);
            if (!product) return;
            btn.addEventListener('click', () => {
                requestReplenishmentCallback(product.id, product.name, product.unit || 'unid.');
            });
        });
    }

    const gotoBtn = document.getElementById('btn-critical-stock-goto-inventory');
    if (gotoBtn) {
        gotoBtn.addEventListener('click', () => {
            const productsTab = document.getElementById('admin-tab-btn-products');
            if (productsTab) productsTab.click();
        });
    }
}

/**
 * Render payment methods & category performance widgets
 * @param {Array} salesLog 
 * @param {Array} products 
 */
/**
 * Render Payment Methods and Category Sales stats with independent Day / Week time filters
 * @param {Array} salesLog Sales array
 * @param {Array} products Products array
 * @param {string} paymentFilter 'day' or 'week'
 * @param {string} categoryFilter 'day' or 'week'
 */
function renderPaymentAndCategoryStats(salesLog = [], products = [], paymentFilter = 'day', categoryFilter = 'day') {
    const paymentContainer = document.getElementById('payment-methods-content');
    const categoryContainer = document.getElementById('category-performance-content');
    if (!paymentContainer || !categoryContainer) return;

    // Update toggle button styles
    const updateToggleBtnUI = (dayBtnId, weekBtnId, activeFilter) => {
        const dayBtn = document.getElementById(dayBtnId);
        const weekBtn = document.getElementById(weekBtnId);
        if (dayBtn && weekBtn) {
            dayBtn.classList.toggle('active', activeFilter !== 'week');
            weekBtn.classList.toggle('active', activeFilter === 'week');
        }
    };

    updateToggleBtnUI('btn-stats-payment-day', 'btn-stats-payment-week', paymentFilter);
    updateToggleBtnUI('btn-stats-cat-day', 'btn-stats-cat-week', categoryFilter);

    // Calculate dates for filtering
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    // Start of week (Monday at 00:00:00)
    const dayOfWeek = now.getDay();
    const diffToMonday = (dayOfWeek === 0 ? 6 : dayOfWeek - 1);
    const startOfWeek = new Date(startOfDay);
    startOfWeek.setDate(startOfDay.getDate() - diffToMonday);

    // Filter salesLog for Payment Methods
    const paymentSales = salesLog.filter(s => {
        if (!s.timestamp) return true;
        const d = window.parseUTCTimestamp ? window.parseUTCTimestamp(s.timestamp) : new Date(s.timestamp);
        return paymentFilter === 'week' ? (d >= startOfWeek) : (d >= startOfDay);
    });

    // Filter salesLog for Category Sales
    const categorySales = salesLog.filter(s => {
        if (!s.timestamp) return true;
        const d = window.parseUTCTimestamp ? window.parseUTCTimestamp(s.timestamp) : new Date(s.timestamp);
        return categoryFilter === 'week' ? (d >= startOfWeek) : (d >= startOfDay);
    });

    // 1. Process payment methods
    const methods = {
        'Efectivo $': { label: '💵 Efectivo Divisas ($)', count: 0, amount: 0, class: 'fill-usd' },
        'Pago Móvil': { label: '📱 Pago Móvil (Bs.)', count: 0, amount: 0, class: 'fill-pm' },
        'Punto de Venta': { label: '💳 Punto de Venta (Bs.)', count: 0, amount: 0, class: 'fill-card' },
        'Efectivo Bs.': { label: '💵 Efectivo Bolívares (Bs.)', count: 0, amount: 0, class: 'fill-ves' },
        'Deuda / Crédito': { label: '🤝 Cuentas por Cobrar', count: 0, amount: 0, class: 'fill-card' }
    };

    let totalSalesVal = 0;
    paymentSales.forEach(s => {
        let method = 'Efectivo $';
        const match = s.name ? s.name.match(/\(Pagado - (.*?)\)/) : null;
        if (match) {
            const parsed = match[1];
            if (methods[parsed]) method = parsed;
        } else if (s.name && s.name.includes('(Pendiente)')) {
            method = 'Deuda / Crédito';
        }
        
        if (methods[method]) {
            methods[method].count++;
            methods[method].amount += s.price || 0;
            totalSalesVal += s.price || 0;
        }
    });

    let paymentHtml = '';
    if (totalSalesVal > 0) {
        Object.entries(methods).forEach(([key, m]) => {
            const pct = totalSalesVal > 0 ? (m.amount / totalSalesVal) * 100 : 0;
            paymentHtml += `
                <div>
                    <div class="progress-widget-row">
                        <span class="progress-widget-label">${m.label}</span>
                        <span class="progress-widget-value">$${m.amount.toFixed(2)} (${pct.toFixed(0)}%)</span>
                    </div>
                    <div class="progress-widget-bar-bg">
                        <div class="progress-widget-bar-fill ${m.class}" style="width: ${pct}%;"></div>
                    </div>
                </div>
            `;
        });
    } else {
        const noSalesPeriodText = paymentFilter === 'week' ? 'esta semana' : 'hoy';
        paymentHtml = `<div style="font-size: 11px; color: var(--color-text-muted); text-align: center; padding: 1rem 0;">Sin ventas registradas ${noSalesPeriodText}.</div>`;
    }
    paymentContainer.innerHTML = paymentHtml;

    // 2. Process Categories
    const categories = {
        'pastelitos': { label: '🥐 Pastelitos', count: 0, amount: 0, class: 'fill-category-1' },
        'bebidas': { label: '🥤 Bebidas & Jugos', count: 0, amount: 0, class: 'fill-category-2' },
        'dulces': { label: '🍬 Dulces', count: 0, amount: 0, class: 'fill-category-5' },
        'otros': { label: '📦 Otros / Varios', count: 0, amount: 0, class: 'fill-category-2' }
    };

    let totalCatVal = 0;
    categorySales.forEach(s => {
        if (s.productId === 'abono') return;
        const product = products.find(p => p.id === s.productId);
        let cat = 'otros';
        if (product && categories[product.category]) {
            cat = product.category;
        }
        categories[cat].count++;
        categories[cat].amount += s.price || 0;
        totalCatVal += s.price || 0;
    });

    let catHtml = '';
    if (totalCatVal > 0) {
        Object.entries(categories).forEach(([key, c]) => {
            const pct = totalCatVal > 0 ? (c.amount / totalCatVal) * 100 : 0;
            catHtml += `
                <div>
                    <div class="progress-widget-row">
                        <span class="progress-widget-label">${c.label} (${c.count} uds)</span>
                        <span class="progress-widget-value">$${c.amount.toFixed(2)} (${pct.toFixed(0)}%)</span>
                    </div>
                    <div class="progress-widget-bar-bg">
                        <div class="progress-widget-bar-fill ${c.class}" style="width: ${pct}%;"></div>
                    </div>
                </div>
            `;
        });
    } else {
        const noCatPeriodText = categoryFilter === 'week' ? 'esta semana' : 'hoy';
        catHtml = `<div style="font-size: 11px; color: var(--color-text-muted); text-align: center; padding: 1rem 0;">Sin ventas de productos ${noCatPeriodText}.</div>`;
    }
    categoryContainer.innerHTML = catHtml;
}

const ANALYTICS_CATEGORY_FILL = {
    pastelitos: 'fill-category-1',
    bebidas: 'fill-category-2',
    dulces: 'fill-category-5'
};
const ANALYTICS_CATEGORY_LABELS = {
    pastelitos: '🥐 Pastelitos',
    bebidas: '🥤 Bebidas',
    dulces: '🍬 Dulces',
    otros: '📦 Otros'
};

/**
 * Render the "Análisis" admin tab: day-over-day comparison, recent-days
 * bar list, weekday sales pattern, flavor ranking, and the daily prep
 * recommendation. All calculations come from window.AnalyticsManager
 * (js/analytics.js); this function only turns that data into HTML using
 * the same .progress-widget-bar-bg/fill pattern as renderPaymentAndCategoryStats.
 * @param {Array} salesHistory Sales rows for the selected lookback range
 * @param {Array} products Product catalog (for names/categories/max stock)
 * @param {number} targetWeekday Day (0=Domingo..6=Sábado) to build the prep recommendation for
 * @param {string} targetLabel Human label for that day, e.g. "Hoy" or "Mañana"
 */
function renderSalesAnalytics(salesHistory = [], products = [], targetWeekday = new Date().getDay(), targetLabel = 'Hoy') {
    const container = document.getElementById('admin-analytics-container');
    if (!container) return;

    const AM = window.AnalyticsManager;
    if (!AM) {
        container.innerHTML = `<div style="font-size: 0.85rem; color: var(--color-text-muted); text-align: center; padding: 1rem 0;">No se pudo cargar el módulo de análisis.</div>`;
        return;
    }

    const dailyTotals = AM.aggregateSalesByDay(salesHistory);
    if (dailyTotals.length === 0) {
        container.innerHTML = `<div style="font-size: 0.85rem; color: var(--color-text-muted); text-align: center; padding: 1.5rem 0;">Todavía no hay suficiente historial de ventas para analizar. Volvé a mirar esta pestaña en unos días.</div>`;
        return;
    }

    const weekdayPattern = AM.getWeekdayPattern(salesHistory);
    const flavorRanking = AM.getFlavorRanking(salesHistory, products, { limit: 10 });
    const recommendation = AM.getDailyPrepRecommendation(salesHistory, products, targetWeekday);

    const now = new Date();
    const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const todayEntry = dailyTotals.find(d => d.dateStr === todayKey);
    const todayTotal = todayEntry ? todayEntry.total : 0;
    const comparison = AM.compareVsWeekdayAverage(todayTotal, weekdayPattern, now.getDay());
    const comparisonColor = comparison.pctChange === null ? 'var(--color-text-muted)' : (comparison.pctChange >= 0 ? '#34D399' : '#F87171');

    // Últimos días (más recientes primero)
    const recentDays = dailyTotals.slice(-14).reverse();
    const maxDayTotal = Math.max(...recentDays.map(d => d.total), 0.01);
    const dayListHtml = recentDays.map(d => {
        const pct = (d.total / maxDayTotal) * 100;
        const label = new Date(d.dateStr + 'T00:00:00').toLocaleDateString('es-VE', { weekday: 'short', day: 'numeric', month: 'short' });
        return `
            <div>
                <div class="progress-widget-row">
                    <span class="progress-widget-label">${escapeHtml(label)}</span>
                    <span class="progress-widget-value">$${d.total.toFixed(2)} (${d.count} vtas)</span>
                </div>
                <div class="progress-widget-bar-bg">
                    <div class="progress-widget-bar-fill fill-usd" style="width: ${pct}%;"></div>
                </div>
            </div>
        `;
    }).join('');

    // Patrón semanal, ordenado Lunes..Domingo
    const orderedWeekdays = [1, 2, 3, 4, 5, 6, 0].map(w => weekdayPattern[w]);
    const maxWeekdayAvg = Math.max(...orderedWeekdays.map(w => w.avgTotal), 0.01);
    const weekdayHtml = orderedWeekdays.map(w => {
        const pct = (w.avgTotal / maxWeekdayAvg) * 100;
        return `
            <div>
                <div class="progress-widget-row">
                    <span class="progress-widget-label">${w.label}</span>
                    <span class="progress-widget-value">$${w.avgTotal.toFixed(2)} prom. (${w.sampleSize} sem.)</span>
                </div>
                <div class="progress-widget-bar-bg">
                    <div class="progress-widget-bar-fill fill-pm" style="width: ${pct}%;"></div>
                </div>
            </div>
        `;
    }).join('');

    // Ranking de sabores
    const maxQty = Math.max(...flavorRanking.map(f => f.quantity), 1);
    const rankingHtml = flavorRanking.length > 0 ? flavorRanking.map((f, i) => {
        const pct = (f.quantity / maxQty) * 100;
        const fillClass = ANALYTICS_CATEGORY_FILL[f.category] || 'fill-usd';
        return `
            <div>
                <div class="progress-widget-row">
                    <span class="progress-widget-label">#${i + 1} ${escapeHtml(f.name)}</span>
                    <span class="progress-widget-value">${f.quantity} uds &bull; $${f.amount.toFixed(2)}</span>
                </div>
                <div class="progress-widget-bar-bg">
                    <div class="progress-widget-bar-fill ${fillClass}" style="width: ${pct}%;"></div>
                </div>
            </div>
        `;
    }).join('') : `<div style="font-size: 11px; color: var(--color-text-muted); text-align: center; padding: 1rem 0;">Sin ventas registradas en este rango.</div>`;

    // Recomendación de preparación, agrupada por categoría
    const groupedRec = {};
    recommendation.forEach(r => {
        if (!groupedRec[r.category]) groupedRec[r.category] = [];
        groupedRec[r.category].push(r);
    });
    const recHtml = Object.keys(groupedRec).length > 0 ? Object.entries(groupedRec).map(([cat, items]) => `
        <div style="margin-bottom: 0.75rem;">
            <div style="font-size: 10px; font-weight: 900; color: var(--color-gold); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.35rem;">
                ${ANALYTICS_CATEGORY_LABELS[cat] || cat}
            </div>
            ${items.map(r => `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.4rem 0.6rem; background: rgba(255,255,255,0.03); border-radius: 8px; margin-bottom: 0.3rem;">
                    <span style="font-size: 0.8rem; color: var(--color-white); font-weight: 700;">
                        ${escapeHtml(r.name)}${r.lowConfidence ? ' <span style="color: #FBBF24; font-size: 9px; font-weight: 800;">(dato preliminar)</span>' : ''}
                    </span>
                    <span style="font-family: monospace; font-weight: 900; color: var(--color-gold); font-size: 0.95rem;">${r.suggested} unid.</span>
                </div>
            `).join('')}
        </div>
    `).join('') : `<div style="font-size: 11px; color: var(--color-text-muted); text-align: center; padding: 1rem 0;">Sin historial suficiente para ese día todavía.</div>`;

    container.innerHTML = `
        <div style="background: rgba(10, 20, 38, 0.6); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 12px; padding: 1rem; margin-bottom: 0.75rem;">
            <div style="font-size: 10px; font-weight: 900; color: var(--color-gold); text-transform: uppercase; letter-spacing: 0.05em;">HOY VS. PROMEDIO HISTÓRICO</div>
            <div style="font-size: 1.6rem; font-weight: 900; color: #FFFFFF; font-family: monospace; margin-top: 0.25rem;">$${todayTotal.toFixed(2)}</div>
            <div style="font-size: 0.8rem; color: ${comparisonColor}; font-weight: 700; margin-top: 0.15rem;">${comparison.label}</div>
        </div>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 0.75rem;">
            <div style="background: rgba(10, 20, 38, 0.6); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 12px; padding: 1rem;">
                <div style="font-size: 10px; font-weight: 900; color: var(--color-gold); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.5rem;">📅 Últimos días</div>
                ${dayListHtml}
            </div>
            <div style="background: rgba(10, 20, 38, 0.6); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 12px; padding: 1rem;">
                <div style="font-size: 10px; font-weight: 900; color: var(--color-gold); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.5rem;">📈 Patrón semanal (promedio)</div>
                ${weekdayHtml}
            </div>
            <div style="background: rgba(10, 20, 38, 0.6); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 12px; padding: 1rem;">
                <div style="font-size: 10px; font-weight: 900; color: var(--color-gold); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.5rem;">🏆 Sabores más vendidos</div>
                ${rankingHtml}
            </div>
            <div style="background: rgba(10, 20, 38, 0.6); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 12px; padding: 1rem;">
                <div style="font-size: 10px; font-weight: 900; color: var(--color-gold); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.5rem;">👨‍🍳 Preparar para ${escapeHtml(targetLabel)}</div>
                ${recHtml}
            </div>
        </div>
    `;
}

/**
 * Export daily box close report to PDF
 * @param {Array} salesLog 
 * @param {Array} expenses 
 * @param {Array} products 
 */
function exportDayCloseToPDF(salesLog = [], expenses = [], products = [], customDateLabel = null, customRate = null) {
    const activeRole = sessionStorage.getItem('casa_lucenzo_active_role');
    if (activeRole !== 'admin') return;

    const totalSales = salesLog.reduce((sum, sale) => sum + (sale.price || 0), 0);
    const totalExpenses = expenses.reduce((sum, exp) => sum + (exp.amount || 0), 0);
    const netCash = totalSales - totalExpenses;
    const rate = (customRate && !isNaN(parseFloat(customRate)) && parseFloat(customRate) > 0) ? parseFloat(customRate) : (window.bcvRate || 1);
    // Costo de producción (tercero). Congelado en cost_at_sale por venta;
    // para días viejos sin ese dato se estima con el costo actual por
    // unidad -- misma lógica compartida con el resumen de Ganancias.
    const prodCost = window.AnalyticsManager.estimateProductionCost(salesLog, products, rate);
    const isEstimatedCost = prodCost.isEstimated;
    const productionCostBsForDisplay = prodCost.bs;
    const netMarginBs = (totalSales * rate) - productionCostBsForDisplay;

    // Group sales by category and product
    const categorySales = {
        'pasteles': { label: '🥐 Pasteles y Repostería', items: {} },
        'bebidas': { label: '🥤 Bebidas', items: {} },
        'dulces': { label: '🍬 Dulces', items: {} }
    };

    salesLog.forEach(sale => {
        if (sale.productId === 'abono') return;

        // Find product category
        const prod = products.find(p => p.id === sale.productId);
        let category = 'pasteles'; // fallback default
        if (prod && prod.category === 'bebidas') {
            category = 'bebidas';
        } else if (prod && prod.category === 'dulces') {
            category = 'dulces';
        } else if (prod && prod.category === 'pastelitos') {
            category = 'pasteles';
        } else {
            // Check if name suggests beverage
            const nameLower = sale.name.toLowerCase();
            if (nameLower.includes('malta') || nameLower.includes('refresco') || nameLower.includes('agua') || nameLower.includes('jugo')) {
                category = 'bebidas';
            }
        }
        
        let cleanName = sale.name.replace(/\s*\[.*\](\s*\(Pagado(?: - .*?)?\))?$/, '');
        if (!categorySales[category].items[cleanName]) {
            categorySales[category].items[cleanName] = { count: 0, price: sale.price || 0, total: 0 };
        }
        categorySales[category].items[cleanName].count++;
        categorySales[category].items[cleanName].total += sale.price || 0;
    });

    // Group payment methods
    const methods = {
        'Efectivo $': { label: 'Efectivo Divisas ($)', count: 0, amount: 0 },
        'Pago Móvil': { label: 'Pago Móvil (Bs.)', count: 0, amount: 0 },
        'Punto de Venta': { label: 'Punto de Venta (Bs.)', count: 0, amount: 0 },
        'Efectivo Bs.': { label: 'Efectivo Bolívares (Bs.)', count: 0, amount: 0 },
        'Deuda / Crédito': { label: 'Cuentas por Cobrar (Créditos)', count: 0, amount: 0 }
    };

    salesLog.forEach(s => {
        let method = 'Efectivo $';
        const match = s.name.match(/\(Pagado - (.*?)\)/);
        if (match) {
            const parsed = match[1];
            if (methods[parsed]) method = parsed;
        } else if (s.name.includes('(Pendiente)')) {
            method = 'Deuda / Crédito';
        }
        
        if (methods[method]) {
            methods[method].count++;
            methods[method].amount += s.price || 0;
        }
    });

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
        alert("Por favor, permite las ventanas emergentes para poder generar el PDF.");
        return;
    }

    const css = `
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800;900&family=Playfair+Display:wght@700;900&display=swap');
        body {
            font-family: 'Outfit', sans-serif;
            color: #0f172a;
            padding: 2.5rem;
            margin: 0;
            background-color: #ffffff;
            line-height: 1.5;
        }
        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 2px solid #e2e8f0;
            padding-bottom: 1.5rem;
            margin-bottom: 2rem;
        }
        .logo-area {
            display: flex;
            align-items: center;
            gap: 1rem;
        }
        .logo-circle {
            width: 60px;
            height: 60px;
            border-radius: 50%;
            background-image: url('img/logo-192.png');
            background-size: 108% 108%;
            background-position: center;
            background-repeat: no-repeat;
            border: 2px solid #C9A24A;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        }
        .logo-text h1 {
            font-family: 'Playfair Display', serif;
            font-size: 1.8rem;
            margin: 0;
            color: #0b1329;
            font-weight: 900;
            letter-spacing: -0.02em;
        }
        .logo-text p {
            font-size: 0.85rem;
            margin: 0;
            color: #64748b;
            text-transform: uppercase;
            letter-spacing: 0.1em;
            font-weight: 800;
        }
        .report-meta {
            text-align: right;
        }
        .report-meta h2 {
            font-size: 1.25rem;
            margin: 0;
            color: #d97706;
            text-transform: uppercase;
            letter-spacing: 0.08em;
            font-weight: 900;
        }
        .report-meta p {
            font-size: 0.85rem;
            margin: 0.25rem 0 0;
            color: #475569;
        }
        .kpi-row {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 1.25rem;
            margin-bottom: 2rem;
        }
        .kpi-card {
            background-color: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 10px;
            padding: 1.25rem;
            text-align: center;
            box-shadow: 0 1px 3px rgba(0,0,0,0.02);
        }
        .kpi-label {
            font-size: 0.8rem;
            color: #64748b;
            text-transform: uppercase;
            font-weight: 800;
            letter-spacing: 0.05em;
        }
        .kpi-val {
            font-size: 1.85rem;
            font-weight: 900;
            color: #0b1329;
            margin-top: 0.35rem;
        }
        .kpi-subval {
            font-size: 0.95rem;
            color: #475569;
            font-weight: 600;
            margin-top: 0.2rem;
        }
        .section-title {
            font-size: 1rem;
            text-transform: uppercase;
            font-weight: 900;
            color: #0b1329;
            margin-top: 2rem;
            margin-bottom: 1rem;
            letter-spacing: 0.08em;
            border-bottom: 2px solid #f1f5f9;
            padding-bottom: 0.5rem;
            display: flex;
            align-items: center;
            gap: 0.35rem;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 0.5rem;
        }
        th {
            background-color: #f8fafc;
            color: #475569;
            font-size: 0.9rem;
            text-transform: uppercase;
            font-weight: 800;
            text-align: left;
            padding: 0.95rem;
            border-bottom: 2px solid #cbd5e1;
            letter-spacing: 0.02em;
        }
        td {
            padding: 0.95rem;
            font-size: 0.9rem;
            border-bottom: 1px solid #f1f5f9;
            color: #334155;
        }
        tr:nth-child(even) {
            background-color: #fcfdfe;
        }
        .footer {
            margin-top: 3.5rem;
            border-top: 1px solid #e2e8f0;
            padding-top: 1.25rem;
            text-align: center;
            font-size: 0.7rem;
            color: #94a3b8;
        }
        .signature-row {
            display: flex;
            justify-content: space-around;
            margin-top: 4rem;
            margin-bottom: 2rem;
        }
        .signature-box {
            border-top: 1px solid #475569;
            width: 200px;
            text-align: center;
            padding-top: 0.5rem;
            font-size: 0.8rem;
            color: #475569;
            font-weight: bold;
        }
        .btn-print-action {
            background-color: #0b1329;
            color: #ffffff;
            border: 1px solid #C9A24A;
            padding: 0.6rem 1.75rem;
            font-size: 0.8rem;
            border-radius: 6px;
            cursor: pointer;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            box-shadow: 0 4px 6px rgba(0,0,0,0.15);
            transition: all 0.2s;
        }
        .btn-print-action:hover {
            background-color: #172242;
            color: #C9A24A;
        }
        @media print {
            body {
                padding: 0;
            }
            .no-print {
                display: none !important;
            }
            * {
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
            }
        }
    `;

    let productRowsHtml = '';
    
    // Render Pasteles
    const pastelesItems = Object.entries(categorySales['pasteles'].items);
    if (pastelesItems.length > 0) {
        productRowsHtml += `
            <tr style="background-color: rgba(11, 19, 41, 0.04); font-weight: 800;">
                <td colspan="4" style="color: #0b1329; border-bottom: 2px solid #0b1329; padding-top: 1.5rem; text-align: left;">🥐 PASTELES Y COMIDA</td>
            </tr>
        `;
        pastelesItems.forEach(([name, data]) => {
            productRowsHtml += `
                <tr>
                    <td style="padding-left: 1.5rem;">${name}</td>
                    <td>${data.count} uds.</td>
                    <td style="font-weight: 600;">$${data.total.toFixed(2)}</td>
                    <td style="color: #64748b;">Bs. ${(data.total * rate).toLocaleString('es-VE', { minimumFractionDigits: 2 })}</td>
                </tr>
            `;
        });
    }
    
    // Render Bebidas
    const bebidasItems = Object.entries(categorySales['bebidas'].items);
    if (bebidasItems.length > 0) {
        productRowsHtml += `
            <tr style="background-color: rgba(11, 19, 41, 0.04); font-weight: 800;">
                <td colspan="4" style="color: #0b1329; border-bottom: 2px solid #0b1329; padding-top: 1.5rem; text-align: left;">🥤 BEBIDAS</td>
            </tr>
        `;
        bebidasItems.forEach(([name, data]) => {
            productRowsHtml += `
                <tr>
                    <td style="padding-left: 1.5rem;">${name}</td>
                    <td>${data.count} uds.</td>
                    <td style="font-weight: 600;">$${data.total.toFixed(2)}</td>
                    <td style="color: #64748b;">Bs. ${(data.total * rate).toLocaleString('es-VE', { minimumFractionDigits: 2 })}</td>
                </tr>
            `;
        });
    }

    // Render Dulces
    const dulcesItems = Object.entries(categorySales['dulces'].items);
    if (dulcesItems.length > 0) {
        productRowsHtml += `
            <tr style="background-color: rgba(11, 19, 41, 0.04); font-weight: 800;">
                <td colspan="4" style="color: #0b1329; border-bottom: 2px solid #0b1329; padding-top: 1.5rem; text-align: left;">🍬 DULCES</td>
            </tr>
        `;
        dulcesItems.forEach(([name, data]) => {
            productRowsHtml += `
                <tr>
                    <td style="padding-left: 1.5rem;">${name}</td>
                    <td>${data.count} uds.</td>
                    <td style="font-weight: 600;">$${data.total.toFixed(2)}</td>
                    <td style="color: #64748b;">Bs. ${(data.total * rate).toLocaleString('es-VE', { minimumFractionDigits: 2 })}</td>
                </tr>
            `;
        });
    }

    if (pastelesItems.length === 0 && bebidasItems.length === 0 && dulcesItems.length === 0) {
        productRowsHtml = '<tr><td colspan="4" style="text-align: center; color: #64748b;">No hubo ventas registradas hoy.</td></tr>';
    }

    let methodRowsHtml = '';
    Object.entries(methods).forEach(([key, m]) => {
        if (m.count > 0) {
            methodRowsHtml += `
                <tr>
                    <td>${m.label}</td>
                    <td>${m.count} trans.</td>
                    <td style="font-weight: 600;">$${m.amount.toFixed(2)}</td>
                    <td style="color: #64748b;">Bs. ${(m.amount * rate).toLocaleString('es-VE', { minimumFractionDigits: 2 })}</td>
                </tr>
            `;
        }
    });
    if (methodRowsHtml === '') {
        methodRowsHtml = '<tr><td colspan="4" style="text-align: center; color: #64748b;">Sin transacciones.</td></tr>';
    }

    let expenseRowsHtml = '';
    expenses.forEach(exp => {
        expenseRowsHtml += `
            <tr>
                <td>${exp.description}</td>
                <td style="color: #ef4444; font-weight: 600;">-$${exp.amount.toFixed(2)}</td>
                <td style="color: #64748b;">Bs. ${(exp.amount * rate).toLocaleString('es-VE', { minimumFractionDigits: 2 })}</td>
            </tr>
        `;
    });
    if (expenseRowsHtml === '') {
        expenseRowsHtml = '<tr><td colspan="3" style="text-align: center; color: #64748b;">Sin gastos registrados hoy.</td></tr>';
    }

    const dateLabel = customDateLabel || new Date().toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    printWindow.document.write(`
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="UTF-8">
            <title>Reporte de Cierre de Caja - Casa Lucenzo</title>
            <style>${css}</style>
        </head>
        <body>
            <div class="header">
                <div class="logo-area">
                    <div class="logo-circle"></div>
                    <div class="logo-text">
                        <h1>CASA LUCENZO</h1>
                        <p>Pastelería & Bebidas</p>
                    </div>
                </div>
                <div class="report-meta">
                    <h2>Cierre de Jornada Diaria</h2>
                    <p><strong>Fecha de Cierre:</strong> ${dateLabel}</p>
                    <p><strong>Tasa BCV del Día:</strong> ${rate.toFixed(2)} Bs.</p>
                </div>
            </div>

            <div class="kpi-row">
                <div class="kpi-card" style="border-color: #10b981; background-color: rgba(16,185,129,0.01);">
                    <div class="kpi-label" style="color: #059669;">Total Facturado (Ingresos)</div>
                    <div class="kpi-val" style="color: #059669;">$${totalSales.toFixed(2)}</div>
                    <div class="kpi-subval" style="color: #059669;">Bs. ${(totalSales * rate).toLocaleString('es-VE', { minimumFractionDigits: 2 })}</div>
                </div>
                <div class="kpi-card" style="border-color: #ef4444; background-color: rgba(239,68,68,0.01);">
                    <div class="kpi-label" style="color: #dc2626;">Total Gastos (Egresos)</div>
                    <div class="kpi-val" style="color: #dc2626;">-$${totalExpenses.toFixed(2)}</div>
                    <div class="kpi-subval" style="color: #dc2626;">Bs. ${(totalExpenses * rate).toLocaleString('es-VE', { minimumFractionDigits: 2 })}</div>
                </div>
                <div class="kpi-card" style="border-color: #C9A24A; background-color: rgba(243,198,63,0.02);">
                    <div class="kpi-label" style="color: #b45309;">Balance Neto (Caja Estimado)</div>
                    <div class="kpi-val" style="color: #b45309;">$${netCash.toFixed(2)}</div>
                    <div class="kpi-subval" style="color: #b45309;">Bs. ${(netCash * rate).toLocaleString('es-VE', { minimumFractionDigits: 2 })}</div>
                </div>
            </div>

            <div class="kpi-row">
                <div class="kpi-card" style="border-color: #ef4444; background-color: rgba(239,68,68,0.01);">
                    <div class="kpi-label" style="color: #dc2626;">Costo de Producción (Terceros)${isEstimatedCost ? ' (Estimado)' : ''}</div>
                    <div class="kpi-val" style="color: #dc2626;">-Bs. ${productionCostBsForDisplay.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</div>
                    ${isEstimatedCost ? '<div style="font-size: 0.65rem; color: #94a3b8; margin-top: 0.2rem; font-style: italic;">Estimado con el costo actual por unidad -- no es el dato exacto de ese día</div>' : ''}
                    ${productionCostBsForDisplay === 0 && totalSales > 0 ? '<div style="font-size: 0.65rem; color: #94a3b8; margin-top: 0.2rem; font-style: italic;">Sin dato de costo para este día -- no es que haya costado $0</div>' : ''}
                </div>
                <div class="kpi-card" style="border-color: #10b981; background-color: rgba(16,185,129,0.01);">
                    <div class="kpi-label" style="color: #059669;">Margen Real (Ventas - Producción)</div>
                    <div class="kpi-val" style="color: #059669;">Bs. ${netMarginBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</div>
                    ${isEstimatedCost ? '<div style="font-size: 0.65rem; color: #94a3b8; margin-top: 0.2rem; font-style: italic;">Calculado con costo de producción estimado</div>' : ''}
                    ${productionCostBsForDisplay === 0 && totalSales > 0 ? '<div style="font-size: 0.65rem; color: #94a3b8; margin-top: 0.2rem; font-style: italic;">Estimado sin descontar producción (dato no disponible)</div>' : ''}
                </div>
            </div>

            <div class="section-title">
                <span>💰 Desglose por Métodos de Pago</span>
            </div>
            <table>
                <thead>
                    <tr>
                        <th>Método de Pago</th>
                        <th>Transacciones</th>
                        <th>Monto ($ USD)</th>
                        <th>Monto (Bs. VES)</th>
                    </tr>
                </thead>
                <tbody>
                    ${methodRowsHtml}
                </tbody>
            </table>

            <div class="section-title">
                <span>🥐 Detalle de Artículos Vendidos</span>
            </div>
            <table>
                <thead>
                    <tr>
                        <th>Producto</th>
                        <th>Cantidad Vendida</th>
                        <th>Subtotal ($ USD)</th>
                        <th>Subtotal (Bs. VES)</th>
                    </tr>
                </thead>
                <tbody>
                    ${productRowsHtml}
                </tbody>
            </table>

            <div class="section-title">
                <span>💸 Gastos del Día</span>
            </div>
            <table>
                <thead>
                    <tr>
                        <th>Descripción del Gasto</th>
                        <th>Monto ($ USD)</th>
                        <th>Monto (Bs. VES)</th>
                    </tr>
                </thead>
                <tbody>
                    ${expenseRowsHtml}
                </tbody>
            </table>

            <div class="signature-row">
                <div class="signature-box">Firma del Cajero / Local</div>
                <div class="signature-box">Firma del Administrador</div>
            </div>

            <div class="footer">
                <p>Cierre de caja oficial del día - Generado por el Sistema Casa Lucenzo.</p>
                <p class="no-print" style="margin-top: 1.75rem;">
                    <button class="btn-print-action" onclick="window.print()">
                        📥 Imprimir / Guardar PDF
                    </button>
                </p>
            </div>
            
            <script>
                window.onload = function() {
                    setTimeout(function() {
                        window.print();
                    }, 400);
                }
            </script>
        </body>
        </html>
    `);
    printWindow.document.close();
}

/**
 * Export hourly sales stats report to PDF using the print window method
 * @param {Array} salesLog Sales array
 * @param {string} mode 'today' or 'weekly'
 */
function exportHourlyStatsToPDF(salesLog, mode = 'today') {
    const targetHours = [6, 7, 8, 9, 10, 11, 12, 13, 14];

    // Filter salesLog based on active mode
    let filteredSales;
    if (mode === 'today') {
        const startOfToday = new Date();
        startOfToday.setHours(0,0,0,0);
        filteredSales = salesLog.filter(s => {
            const d = parseUTCTimestamp(s.timestamp);
            return d >= startOfToday;
        });
    } else {
        filteredSales = salesLog;
    }

    const hourlyData = {};
    let totalSalesVal = 0;
    let totalSalesQty = 0;
    let outsideCount = 0;
    let outsideRevenue = 0;

    targetHours.forEach(h => {
        hourlyData[h] = { count: 0, revenue: 0 };
    });

    filteredSales.forEach(s => {
        const d = parseUTCTimestamp(s.timestamp);
        const hr = d.getHours();
        if (hr >= 6 && hr <= 14) {
            hourlyData[hr].count++;
            hourlyData[hr].revenue += s.price || 0;
            totalSalesVal += s.price || 0;
            totalSalesQty++;
        } else {
            outsideCount++;
            outsideRevenue += s.price || 0;
            totalSalesVal += s.price || 0;
            totalSalesQty++;
        }
    });

    let peakHour = -1;
    let maxRevenue = 0;
    targetHours.forEach(h => {
        if (hourlyData[h].revenue > maxRevenue) {
            maxRevenue = hourlyData[h].revenue;
            peakHour = h;
        }
    });

    const scaleMax = Math.max(...targetHours.map(h => hourlyData[h].revenue), outsideRevenue, 1.0);
    const rate = window.bcvRate || 1;

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
        alert("Por favor, permite las ventanas emergentes para poder descargar el PDF.");
        return;
    }

    function getConsultantInsights(hourlyData, peakHour, totalSalesVal, outsideRevenue) {
        let mainInsight;
        let points;

        if (totalSalesVal === 0) {
            return `
                <div class="consultant-box">
                    <div class="consultant-title">
                        <span class="consultant-badge">ASESORÍA COMERCIAL</span>
                        <span>Análisis de Rendimiento Operativo</span>
                    </div>
                    <p class="consultant-text">
                        No se registran datos suficientes en este ciclo para formular un diagnóstico de ventas. Es indispensable iniciar el registro de transacciones para evaluar el comportamiento del consumidor y diseñar estrategias de menú eficientes.
                    </p>
                </div>
            `;
        }

        // Determine the peak window type
        if (peakHour >= 6 && peakHour <= 9) {
            mainInsight = "Su pico de facturación se concentra en las primeras horas de la mañana (Desayuno Temprano). Esto evidencia un perfil de cliente dinámico y de paso, compuesto por trabajadores, estudiantes y personas en tránsito hacia sus labores diarias.";
            points = [
                "<strong>Aseguramiento de Stock Crítico a Primera Hora:</strong> Toda la vitrina de pasteles debe estar al 100% de capacidad a las 6:30 AM. Los retrasos en reposición a esta hora significan ventas perdidas que no se recuperan durante el día.",
                "<strong>Estrategia de Ticket Promedio (Up-selling):</strong> Capacite al personal de caja para ofrecer de forma activa adiciones de bebidas calientes (café) o frías (malta/jugo) con frases sugestivas como: <em>¿Le provoca acompañarlo con una bebida fría por solo $1 adicional?</em>",
                "<strong>Combos de Desayuno Veloz:</strong> Cree empaques pre-armados de Pastel + Bebida para reducir el tiempo de espera en caja a menos de 45 segundos, maximizando la rotación en horas de alto tráfico."
            ];
        } else if (peakHour >= 10 && peakHour <= 12) {
            mainInsight = "Su volumen principal de ventas se registra en la media mañana. Este comportamiento indica una fuerte demanda de meriendas y desayunos tardíos, típicamente impulsados por clientes corporativos o visitas de descanso intermedio.";
            points = [
                "<strong>Ingeniería de Menú de Media Mañana:</strong> Introduzca variedades de pasteles especiales (como Primavera o 4 Estaciones) en su máxima disponibilidad durante este bloque, ya que el cliente de media mañana está más dispuesto a gastar un ticket más elevado por productos premium.",
                "<strong>Rotación Planificada de Vitrina:</strong> Realice una reposición de pasteles frescos exactamente a las 9:30 AM para mantener el atractivo visual de la vitrina justo antes del incremento de flujo.",
                "<strong>Promoción Cruzada Digital:</strong> Utilice estados de WhatsApp a las 9:00 AM mostrando pasteles recién horneados para motivar la compra de oficinas cercanas."
            ];
        } else if (peakHour >= 13 && peakHour <= 15) {
            mainInsight = "Su hora pico coincide con el rango de almuerzo y tarde temprana. Esto refleja que sus productos están siendo consumidos como opciones de almuerzo práctico o meriendas de mediodía.";
            points = [
                "<strong>Introducción de Combos de Almuerzo Express:</strong> Diseñe combos atractivos de 2 pasteles tradicionales + bebida refrescante con un precio psicológico cerrado (ej. Combos de $3 o $4) para capturar el mercado de almuerzos rápidos de oficinas locales.",
                "<strong>Monitoreo de Quiebres de Stock:</strong> La producción de cocina debe asegurar un último lote caliente a las 12:00 PM para responder con frescura durante todo el bloque del mediodía.",
                "<strong>Foco en Bebidas Frías:</strong> En las horas de mayor calor, el margen de ganancia de bebidas frías es crucial. Mantenga los exhibidores de bebidas a temperatura óptima y bien visibles."
            ];
        } else {
            mainInsight = "Se observa una distribución de ventas estable a lo largo del día. Esto representa un flujo continuo, ideal para sostener la frescura del producto sin saturar la capacidad de servicio.";
            points = [
                "<strong>Planificación de Hornada en Lotes Pequeños:</strong> En lugar de hornear todo al inicio, hornee lotes pequeños cada 2 horas para garantizar que el cliente siempre reciba un producto con textura y calor óptimos.",
                "<strong>Fidelización de Clientes Recurrentes:</strong> Implemente una tarjeta de cliente frecuente simple (ej. el décimo pastel es gratis) para asegurar que el flujo constante se mantenga leal a su marca.",
                "<strong>Optimización de Surtido:</strong> Mantenga un control de cuáles sabores rotan menos para reducir su producción y aumentar el espacio de exhibición para los sabores estrella (Carne Mechada y Pollo)."
            ];
        }

        // Add advice regarding outside hours if any
        if (outsideRevenue > 0) {
            const outsidePct = ((outsideRevenue / totalSalesVal) * 100).toFixed(1);
            points.push(
                `<strong>Análisis de Demanda Fuera de Horario (Representa el ${outsidePct}% de ventas):</strong> Ha facturado $${outsideRevenue.toFixed(2)} USD fuera del rango operativo de 6 AM a 3 PM. Esto demuestra un mercado desatendido por las tardes. Considere realizar ofertas tipo "Hora Feliz" a partir de las 2:30 PM para liquidar inventario remanente o evalúe la viabilidad de extender la jornada de venta 1 hora más.`
            );
        }

        // Generate HTML
        let pointsHtml = points.map(p => `<li>${p}</li>`).join('');
        return `
            <div class="consultant-box">
                <div class="consultant-title">
                    <span class="consultant-badge">ASESORÍA DE VENTAS PROFESIONAL</span>
                    <span>Análisis Estratégico y Diagnóstico Comercial</span>
                </div>
                <p class="consultant-text">
                    <strong>Diagnóstico del Flujo Comercial:</strong> ${mainInsight} A continuación, se detallan las recomendaciones estratégicas para incrementar la rentabilidad del negocio:
                </p>
                <ul class="consultant-points">
                    ${pointsHtml}
                </ul>
            </div>
        `;
    }

    const css = `
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800;900&family=Playfair+Display:wght@700;900&display=swap');
        body {
            font-family: 'Outfit', sans-serif;
            color: #0f172a;
            padding: 2.5rem;
            margin: 0;
            background-color: #ffffff;
            line-height: 1.5;
        }
        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 2px solid #e2e8f0;
            padding-bottom: 1.5rem;
            margin-bottom: 2rem;
        }
        .logo-area {
            display: flex;
            align-items: center;
            gap: 1rem;
        }
        .logo-circle {
            width: 60px;
            height: 60px;
            border-radius: 50%;
            background-image: url('img/logo-192.png');
            background-size: 108% 108%;
            background-position: center;
            background-repeat: no-repeat;
            border: 2px solid #C9A24A;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        }
        .logo-text h1 {
            font-family: 'Playfair Display', serif;
            font-size: 1.8rem;
            margin: 0;
            color: #0b1329;
            font-weight: 900;
            letter-spacing: -0.02em;
        }
        .logo-text p {
            font-size: 0.85rem;
            margin: 0;
            color: #64748b;
            text-transform: uppercase;
            letter-spacing: 0.1em;
            font-weight: 800;
        }
        .report-meta {
            text-align: right;
        }
        .report-meta h2 {
            font-size: 1.25rem;
            margin: 0;
            color: #d97706;
            text-transform: uppercase;
            letter-spacing: 0.08em;
            font-weight: 900;
        }
        .report-meta p {
            font-size: 0.85rem;
            margin: 0.25rem 0 0;
            color: #475569;
        }
        .kpi-row {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 1.25rem;
            margin-bottom: 2rem;
        }
        .kpi-card {
            background-color: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 10px;
            padding: 1.25rem;
            text-align: center;
            box-shadow: 0 1px 3px rgba(0,0,0,0.02);
        }
        .kpi-label {
            font-size: 0.8rem;
            color: #64748b;
            text-transform: uppercase;
            font-weight: 800;
            letter-spacing: 0.05em;
        }
        .kpi-val {
            font-size: 1.85rem;
            font-weight: 900;
            color: #0b1329;
            margin-top: 0.35rem;
        }
        .kpi-subval {
            font-size: 0.95rem;
            color: #475569;
            font-weight: 600;
            margin-top: 0.2rem;
        }
        .section-title {
            font-size: 1rem;
            text-transform: uppercase;
            font-weight: 900;
            color: #0b1329;
            margin-top: 2rem;
            margin-bottom: 1rem;
            letter-spacing: 0.08em;
            border-bottom: 2px solid #f1f5f9;
            padding-bottom: 0.5rem;
            display: flex;
            align-items: center;
            gap: 0.35rem;
        }
        .chart-container-print {
            display: flex;
            align-items: flex-end;
            justify-content: space-between;
            height: 190px;
            padding: 1.5rem;
            background-color: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 10px;
            margin-bottom: 2rem;
        }
        .chart-col {
            display: flex;
            flex-direction: column;
            align-items: center;
            flex: 1;
            height: 100%;
            justify-content: flex-end;
            gap: 0.35rem;
        }
        .chart-fill {
            width: 18px;
            background: linear-gradient(180deg, #10b981, #059669);
            border-radius: 4px 4px 0 0;
            min-height: 2px;
        }
        .chart-col.peak .chart-fill {
            background: linear-gradient(180deg, #C9A24A, #d97706) !important;
        }
        .chart-col-val {
            font-size: 9.5px;
            font-weight: 800;
            color: #475569;
        }
        .chart-col.peak .chart-col-val {
            color: #b45309;
            font-weight: 900;
        }
        .chart-col-label {
            font-size: 9.5px;
            color: #64748b;
            font-weight: 700;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 0.5rem;
        }
        th {
            background-color: #f8fafc;
            color: #475569;
            font-size: 0.9rem;
            text-transform: uppercase;
            font-weight: 800;
            text-align: left;
            padding: 0.95rem;
            border-bottom: 2px solid #cbd5e1;
            letter-spacing: 0.02em;
        }
        td {
            padding: 0.95rem;
            font-size: 0.9rem;
            border-bottom: 1px solid #f1f5f9;
            color: #334155;
        }
        tr:nth-child(even) {
            background-color: #fcfdfe;
        }
        .footer {
            margin-top: 3.5rem;
            border-top: 1px solid #e2e8f0;
            padding-top: 1.25rem;
            text-align: center;
            font-size: 0.7rem;
            color: #94a3b8;
        }
        .btn-print-action {
            background-color: #0b1329;
            color: #ffffff;
            border: 1px solid #C9A24A;
            padding: 0.6rem 1.75rem;
            font-size: 0.8rem;
            border-radius: 6px;
            cursor: pointer;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            box-shadow: 0 4px 6px rgba(0,0,0,0.15);
            transition: all 0.2s;
        }
        .btn-print-action:hover {
            background-color: #172242;
            color: #C9A24A;
        }
        .consultant-box {
            background-color: #fdfbf7;
            border: 1.5px solid #C9A24A;
            border-left: 5px solid #d97706;
            border-radius: 8px;
            padding: 1.5rem;
            margin-top: 2rem;
            margin-bottom: 2rem;
            box-shadow: 0 4px 6px rgba(0,0,0,0.02);
            page-break-inside: avoid;
        }
        .consultant-title {
            font-size: 1.05rem;
            font-weight: 900;
            color: #0b1329;
            margin-top: 0;
            margin-bottom: 0.75rem;
            display: flex;
            align-items: center;
            gap: 0.5rem;
            text-transform: uppercase;
            letter-spacing: 0.05em;
        }
        .consultant-badge {
            background-color: #C9A24A;
            color: #000;
            padding: 2px 8px;
            border-radius: 4px;
            font-size: 0.75rem;
            font-weight: 800;
        }
        .consultant-text {
            font-size: 0.85rem;
            color: #334155;
            margin: 0;
            text-align: justify;
        }
        .consultant-points {
            margin-top: 0.75rem;
            padding-left: 1.25rem;
            font-size: 0.85rem;
            color: #334155;
        }
        .consultant-points li {
            margin-bottom: 0.5rem;
        }
        @media print {
            body {
                padding: 0;
            }
            .no-print {
                display: none !important;
            }
            * {
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
            }
        }
    `;

    let chartColsHtml = '';
    targetHours.forEach(h => {
        const data = hourlyData[h];
        const isPeak = h === peakHour && data.revenue > 0;
        const pct = (data.revenue / scaleMax) * 100;
        const labelStr = h >= 12 ? (h === 12 ? '12 PM' : `${h - 12} PM`) : `${h} AM`;
        chartColsHtml += `
            <div class="chart-col ${isPeak ? 'peak' : ''}">
                <div class="chart-col-val">$${data.revenue.toFixed(1)}</div>
                <div class="chart-fill" style="height: ${pct}%;"></div>
                <div class="chart-col-label">${labelStr}</div>
            </div>
        `;
    });

    if (outsideCount > 0) {
        const outsidePct = (outsideRevenue / scaleMax) * 100;
        chartColsHtml += `
            <div class="chart-col" style="border-left: 1px dashed #cbd5e1; padding-left: 4px;">
                <div class="chart-col-val" style="color: #ef4444;">$${outsideRevenue.toFixed(1)}</div>
                <div class="chart-fill" style="height: ${outsidePct}%; background: linear-gradient(180deg, #ef4444, #991b1b);"></div>
                <div class="chart-col-label" style="color: #ef4444;">Fuera H.</div>
            </div>
        `;
    }

    let tableRowsHtml = '';
    targetHours.forEach(h => {
        const data = hourlyData[h];
        const isPeak = h === peakHour && data.revenue > 0;
        const labelStr = h >= 12 ? (h === 12 ? '12:00 PM' : `${h - 12}:00 PM`) : `${h}:00 AM`;
        const revenueVES = data.revenue * rate;
        
        tableRowsHtml += `
            <tr style="${isPeak ? 'background-color: rgba(243,198,63,0.05); font-weight: 700;' : ''}">
                <td style="${isPeak ? 'color: #b45309;' : ''}">${labelStr} ${isPeak ? '👑 (Hora Pico)' : ''}</td>
                <td>${data.count}</td>
                <td style="font-weight: 600;">$${data.revenue.toFixed(2)}</td>
                <td style="color: #64748b;">Bs. ${revenueVES.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            </tr>
        `;
    });

    if (outsideCount > 0) {
        const outsideRevenueVES = outsideRevenue * rate;
        tableRowsHtml += `
            <tr style="background-color: rgba(239, 68, 68, 0.02); font-style: italic;">
                <td style="color: #ef4444; font-weight: 600;">Ventas fuera del horario de registro (Antes 6 AM / Después 3 PM)</td>
                <td>${outsideCount}</td>
                <td style="font-weight: 600; color: #ef4444;">$${outsideRevenue.toFixed(2)}</td>
                <td style="color: #64748b;">Bs. ${outsideRevenueVES.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            </tr>
        `;
    }

    const dateLabel = new Date().toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const periodLabel = mode === 'today' ? 'Diario (Hoy)' : 'Semanal (Últimos 7 Días)';
    const peakHourLabel = peakHour !== -1 && hourlyData[peakHour].revenue > 0 
        ? `${peakHour >= 12 ? (peakHour === 12 ? '12:00 PM' : `${peakHour - 12}:00 PM`) : `${peakHour}:00 AM`}` 
        : 'N/D';

    printWindow.document.write(`
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="UTF-8">
            <title>Reporte de Ventas por Hora - Casa Lucenzo</title>
            <style>${css}</style>
        </head>
        <body>
            <div class="header">
                <div class="logo-area">
                    <div class="logo-circle"></div>
                    <div class="logo-text">
                        <h1>CASA LUCENZO</h1>
                        <p>Pastelería & Bebidas</p>
                    </div>
                </div>
                <div class="report-meta">
                    <h2>Reporte Horario de Ventas</h2>
                    <p><strong>Período:</strong> ${periodLabel}</p>
                    <p><strong>Fecha de Emisión:</strong> ${dateLabel}</p>
                </div>
            </div>

            <div class="kpi-row">
                <div class="kpi-card">
                    <div class="kpi-label">Ingresos Totales</div>
                    <div class="kpi-val">$${totalSalesVal.toFixed(2)}</div>
                    <div class="kpi-subval">Bs. ${(totalSalesVal * rate).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                </div>
                <div class="kpi-card">
                    <div class="kpi-label">Artículos Vendidos</div>
                    <div class="kpi-val">${totalSalesQty} unids.</div>
                    <div class="kpi-subval">Tasa Oficial: ${rate.toFixed(2)} Bs.</div>
                </div>
                <div class="kpi-card" style="border-color: #C9A24A; background-color: rgba(243,198,63,0.02);">
                    <div class="kpi-label" style="color: #b45309;">Hora Pico (6am-3pm)</div>
                    <div class="kpi-val" style="color: #b45309;">${peakHourLabel}</div>
                    <div class="kpi-subval" style="color: #b45309; font-weight: 700;">
                        ${peakHour !== -1 && hourlyData[peakHour].revenue > 0 ? `$${hourlyData[peakHour].revenue.toFixed(2)} (${hourlyData[peakHour].count} ventas)` : 'Sin Movimiento'}
                    </div>
                </div>
            </div>

            <div class="section-title">
                <span>📊 Gráfica de Distribución de Ingresos ($ USD)</span>
            </div>
            <div class="chart-container-print">
                ${chartColsHtml}
            </div>

            <div class="section-title">
                <span>📋 Tabla de Registro y Frecuencia Horaria</span>
            </div>
            <table>
                <thead>
                    <tr>
                        <th>Rango Horario</th>
                        <th>Ventas (Transacciones)</th>
                        <th>Total Facturado ($ USD)</th>
                        <th>Total Facturado (Bs. VES)</th>
                    </tr>
                </thead>
                <tbody>
                    ${tableRowsHtml}
                </tbody>
            </table>

            ${getConsultantInsights(hourlyData, peakHour, totalSalesVal, outsideRevenue)}

            <div class="footer">
                <p>Reporte de analítica automatizado - Sistema de Gestión Casa Lucenzo.</p>
                <p class="no-print" style="margin-top: 1.75rem;">
                    <button class="btn-print-action" onclick="window.print()">
                        📥 Imprimir / Guardar PDF
                    </button>
                </p>
            </div>
            
            <script>
                // Auto trigger print dialog on printWindow load
                window.onload = function() {
                    setTimeout(function() {
                        window.print();
                    }, 400);
                }
            </script>
        </body>
        </html>
    `);
    printWindow.document.close();
}

/**
 * Generates the detailed sales analytics report (print-to-PDF, same
 * pattern as exportDayCloseToPDF/exportHourlyStatsToPDF above): period
 * KPIs, the weekday sales pattern, the flavor ranking, a 7-day projection,
 * and a "reseñas" box with data-driven insight sentences. All the number
 * crunching comes from window.AnalyticsManager (js/analytics.js) -- this
 * function only lays it out as printable HTML.
 * @param {Array} salesHistory Sales rows for the analytics lookback range
 * @param {Array} products Product catalog
 * @param {string} rangeLabel Human label for the lookback range, e.g. "Últimos 60 días"
 */
function exportSalesAnalyticsToPDF(salesHistory = [], products = [], rangeLabel = '') {
    const AM = window.AnalyticsManager;
    if (!AM) {
        alert("No se pudo cargar el módulo de análisis.");
        return;
    }

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
        alert("Por favor, permite las ventanas emergentes para poder generar el PDF.");
        return;
    }

    const dailyTotals = AM.aggregateSalesByDay(salesHistory);
    const weekdayPattern = AM.getWeekdayPattern(salesHistory);
    const flavorRankingFull = AM.getFlavorRanking(salesHistory, products, { limit: null });
    const trend = AM.getRecentTrend(salesHistory, 2);
    const projection = AM.getUpcomingProjection(weekdayPattern, 7, new Date());

    const now = new Date();
    const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const todayEntry = dailyTotals.find(d => d.dateStr === todayKey);
    const todayComparison = AM.compareVsWeekdayAverage(todayEntry ? todayEntry.total : 0, weekdayPattern, now.getDay());

    const insights = AM.buildPerformanceInsights({ weekdayPattern, flavorRanking: flavorRankingFull, trend, todayComparison });

    const periodTotal = dailyTotals.reduce((sum, d) => sum + d.total, 0);
    const periodDays = dailyTotals.length;
    const avgDaily = periodDays > 0 ? periodTotal / periodDays : 0;
    const bestDay = periodDays > 0 ? dailyTotals.reduce((a, b) => (b.total > a.total ? b : a)) : null;
    const worstDay = periodDays > 0 ? dailyTotals.reduce((a, b) => (b.total < a.total ? b : a)) : null;
    const fmtDayLabel = dateStr => new Date(dateStr + 'T00:00:00').toLocaleDateString('es-VE', { weekday: 'long', day: 'numeric', month: 'short' });

    const css = `
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800;900&family=Playfair+Display:wght@700;900&display=swap');
        body { font-family: 'Outfit', sans-serif; color: #0f172a; padding: 2.5rem; margin: 0; background-color: #ffffff; line-height: 1.5; }
        .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #e2e8f0; padding-bottom: 1.5rem; margin-bottom: 2rem; }
        .logo-area { display: flex; align-items: center; gap: 1rem; }
        .logo-circle { width: 60px; height: 60px; border-radius: 50%; background-image: url('img/logo-192.png'); background-size: 108% 108%; background-position: center; background-repeat: no-repeat; border: 2px solid #C9A24A; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
        .logo-text h1 { font-family: 'Playfair Display', serif; font-size: 1.8rem; margin: 0; color: #0b1329; font-weight: 900; letter-spacing: -0.02em; }
        .logo-text p { font-size: 0.85rem; margin: 0; color: #64748b; text-transform: uppercase; letter-spacing: 0.1em; font-weight: 800; }
        .report-meta { text-align: right; }
        .report-meta h2 { font-size: 1.25rem; margin: 0; color: #d97706; text-transform: uppercase; letter-spacing: 0.08em; font-weight: 900; }
        .report-meta p { font-size: 0.85rem; margin: 0.25rem 0 0; color: #475569; }
        .kpi-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1.25rem; margin-bottom: 2rem; }
        .kpi-card { background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 1.25rem; text-align: center; box-shadow: 0 1px 3px rgba(0,0,0,0.02); }
        .kpi-label { font-size: 0.75rem; color: #64748b; text-transform: uppercase; font-weight: 800; letter-spacing: 0.05em; }
        .kpi-val { font-size: 1.5rem; font-weight: 900; color: #0b1329; margin-top: 0.35rem; }
        .kpi-subval { font-size: 0.8rem; color: #475569; font-weight: 600; margin-top: 0.2rem; }
        .section-title { font-size: 1rem; text-transform: uppercase; font-weight: 900; color: #0b1329; margin-top: 2rem; margin-bottom: 1rem; letter-spacing: 0.08em; border-bottom: 2px solid #f1f5f9; padding-bottom: 0.5rem; display: flex; align-items: center; gap: 0.35rem; }
        table { width: 100%; border-collapse: collapse; margin-top: 0.5rem; }
        th { background-color: #f8fafc; color: #475569; font-size: 0.85rem; text-transform: uppercase; font-weight: 800; text-align: left; padding: 0.85rem; border-bottom: 2px solid #cbd5e1; letter-spacing: 0.02em; }
        td { padding: 0.85rem; font-size: 0.88rem; border-bottom: 1px solid #f1f5f9; color: #334155; }
        tr:nth-child(even) { background-color: #fcfdfe; }
        .low-confidence { color: #b45309; font-size: 0.75rem; font-weight: 700; }
        .footer { margin-top: 3.5rem; border-top: 1px solid #e2e8f0; padding-top: 1.25rem; text-align: center; font-size: 0.7rem; color: #94a3b8; }
        .btn-print-action { background-color: #0b1329; color: #ffffff; border: 1px solid #C9A24A; padding: 0.6rem 1.75rem; font-size: 0.8rem; border-radius: 6px; cursor: pointer; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; box-shadow: 0 4px 6px rgba(0,0,0,0.15); transition: all 0.2s; }
        .btn-print-action:hover { background-color: #172242; color: #C9A24A; }
        .consultant-box { background-color: #fdfbf7; border: 1.5px solid #C9A24A; border-left: 5px solid #d97706; border-radius: 8px; padding: 1.5rem; margin-top: 2rem; margin-bottom: 2rem; box-shadow: 0 4px 6px rgba(0,0,0,0.02); page-break-inside: avoid; }
        .consultant-title { font-size: 1.05rem; font-weight: 900; color: #0b1329; margin-top: 0; margin-bottom: 0.75rem; display: flex; align-items: center; gap: 0.5rem; text-transform: uppercase; letter-spacing: 0.05em; }
        .consultant-badge { background-color: #C9A24A; color: #000; padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 800; }
        .consultant-points { margin-top: 0.75rem; padding-left: 1.25rem; font-size: 0.9rem; color: #334155; }
        .consultant-points li { margin-bottom: 0.6rem; }
        @media print {
            body { padding: 0; }
            .no-print { display: none !important; }
            * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        }
    `;

    const weekdayRowsHtml = [1, 2, 3, 4, 5, 6, 0].map(w => weekdayPattern[w]).map(b => `
        <tr>
            <td>${escapeHtml(b.label)}</td>
            <td>$${b.avgTotal.toFixed(2)}</td>
            <td>${b.avgCount} uds. prom.</td>
            <td>${b.sampleSize} semana(s) muestreadas</td>
        </tr>
    `).join('');

    const flavorTotalQty = flavorRankingFull.reduce((sum, f) => sum + f.quantity, 0);
    const flavorRowsHtml = flavorRankingFull.length > 0 ? flavorRankingFull.slice(0, 10).map((f, i) => {
        const pct = flavorTotalQty > 0 ? (f.quantity / flavorTotalQty) * 100 : 0;
        return `
            <tr>
                <td>#${i + 1} ${escapeHtml(f.name)}</td>
                <td>${escapeHtml(ANALYTICS_CATEGORY_LABELS[f.category] || f.category)}</td>
                <td>${f.quantity} uds. (${pct.toFixed(0)}%)</td>
                <td>$${f.amount.toFixed(2)}</td>
            </tr>
        `;
    }).join('') : '<tr><td colspan="4" style="text-align: center; color: #64748b;">Sin ventas registradas en este período.</td></tr>';

    const projectionRowsHtml = projection.map(p => `
        <tr>
            <td>${escapeHtml(fmtDayLabel(p.dateStr))}</td>
            <td>$${p.projectedTotal.toFixed(2)}</td>
            <td>${p.projectedCount} uds. prom.</td>
            <td>${p.lowConfidence ? '<span class="low-confidence">Dato preliminar</span>' : `${p.sampleSize} semana(s)`}</td>
        </tr>
    `).join('');

    const insightsHtml = insights.map(text => `<li>${escapeHtml(text)}</li>`).join('');

    printWindow.document.write(`
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="UTF-8">
            <title>Informe Detallado de Ventas - Casa Lucenzo</title>
            <style>${css}</style>
        </head>
        <body>
            <div class="header">
                <div class="logo-area">
                    <div class="logo-circle"></div>
                    <div class="logo-text">
                        <h1>CASA LUCENZO</h1>
                        <p>Pastelería & Bebidas</p>
                    </div>
                </div>
                <div class="report-meta">
                    <h2>Informe Detallado de Ventas</h2>
                    <p><strong>Período analizado:</strong> ${escapeHtml(rangeLabel || `${periodDays} día(s)`)}</p>
                    <p><strong>Generado:</strong> ${new Date().toLocaleDateString('es-VE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
                </div>
            </div>

            <div class="kpi-row">
                <div class="kpi-card">
                    <div class="kpi-label">Vendido en el período</div>
                    <div class="kpi-val">$${periodTotal.toFixed(2)}</div>
                    <div class="kpi-subval">${periodDays} día(s) con ventas</div>
                </div>
                <div class="kpi-card">
                    <div class="kpi-label">Promedio diario</div>
                    <div class="kpi-val">$${avgDaily.toFixed(2)}</div>
                    <div class="kpi-subval">por día con actividad</div>
                </div>
                <div class="kpi-card">
                    <div class="kpi-label">Mejor día</div>
                    <div class="kpi-val">$${bestDay ? bestDay.total.toFixed(2) : '0.00'}</div>
                    <div class="kpi-subval">${bestDay ? escapeHtml(fmtDayLabel(bestDay.dateStr)) : 'sin datos'}</div>
                </div>
                <div class="kpi-card">
                    <div class="kpi-label">Día más flojo</div>
                    <div class="kpi-val">$${worstDay ? worstDay.total.toFixed(2) : '0.00'}</div>
                    <div class="kpi-subval">${worstDay ? escapeHtml(fmtDayLabel(worstDay.dateStr)) : 'sin datos'}</div>
                </div>
            </div>

            <div class="section-title"><span>📅 Ventas por Día de la Semana</span></div>
            <table>
                <thead><tr><th>Día</th><th>Promedio ($)</th><th>Unidades</th><th>Muestras</th></tr></thead>
                <tbody>${weekdayRowsHtml}</tbody>
            </table>

            <div class="section-title"><span>🏆 Sabores Más Vendidos</span></div>
            <table>
                <thead><tr><th>Producto</th><th>Categoría</th><th>Unidades</th><th>Monto</th></tr></thead>
                <tbody>${flavorRowsHtml}</tbody>
            </table>

            <div class="section-title"><span>🔮 Proyección Próximos 7 Días</span></div>
            <table>
                <thead><tr><th>Día</th><th>Venta Estimada</th><th>Unidades Estimadas</th><th>Confianza</th></tr></thead>
                <tbody>${projectionRowsHtml}</tbody>
            </table>

            <div class="consultant-box">
                <div class="consultant-title">
                    <span class="consultant-badge">RESEÑAS</span>
                    <span>Lectura del Rendimiento</span>
                </div>
                <ul class="consultant-points">${insightsHtml}</ul>
            </div>

            <div class="footer">
                <p>Informe de análisis de ventas - Generado por el Sistema Casa Lucenzo.</p>
                <p class="no-print" style="margin-top: 1.75rem;">
                    <button class="btn-print-action" onclick="window.print()">
                        📥 Imprimir / Guardar PDF
                    </button>
                </p>
            </div>

            <script>
                window.onload = function() {
                    setTimeout(function() {
                        window.print();
                    }, 400);
                }
            </script>
        </body>
        </html>
    `);
    printWindow.document.close();
}

/**
 * PDF del resumen de Ganancias. Misma técnica que exportSalesAnalyticsToPDF:
 * ventana nueva + document.write + window.print().
 */
function exportPnlToPDF(pnl, opts = {}) {
    if (sessionStorage.getItem('casa_lucenzo_active_role') !== 'admin') return;
    const { mode = 'week', bcvRate = (window.bcvRate || 1) } = opts;
    const printWindow = window.open('', '_blank');
    if (!printWindow) { alert('Permite las ventanas emergentes para generar el PDF.'); return; }

    const usd = v => '$' + (v || 0).toLocaleString('en-US', { minimumFractionDigits: 2 });
    const t = pnl.totals;
    const title = `Resumen ${mode === 'month' ? 'Mensual' : 'Semanal'} — ${pnl.period.label}`;

    const catRows = pnl.categorias.map(c => `
        <tr><td>${c.label}</td><td style="text-align:right">${c.unidades}</td><td style="text-align:right">${usd(c.ventasUsd)}</td><td style="text-align:right">${usd(c.costoTercerosUsd)}</td><td style="text-align:right">${usd(c.margenUsd)}</td></tr>
        ${c.productos.map(p => `<tr class="sub"><td style="padding-left:1.5rem">${escapeHtml(p.name)}</td><td style="text-align:right">${p.unidades}</td><td style="text-align:right">${usd(p.ventasUsd)}</td><td></td><td></td></tr>`).join('')}
    `).join('');

    const gastoRows = pnl.gastos.porCategoria.map(g => `
        <tr><td>${g.label}</td><td style="text-align:right">${usd(g.montoUsd)}</td></tr>
        ${g.items.map(i => `<tr class="sub"><td style="padding-left:1.5rem">${i.fecha} · ${escapeHtml(i.description)}${i.currency === 'VES' ? ` (Bs. ${i.montoOriginal.toLocaleString('es-VE')})` : ''}</td><td style="text-align:right">${usd(i.montoUsd)}</td></tr>`).join('')}
    `).join('');

    const estNote = t.costoTerceros.estimatedDays > 0
        ? `<p class="note">Incluye ${t.costoTerceros.estimatedDays} día(s) con costo de producción estimado (antes del 22 ago no se registraba el costo real).</p>` : '';

    printWindow.document.write(`
      <html><head><title>${title} — Casa Lucenzo</title>
      <style>
        body{font-family:Arial,sans-serif;padding:2rem;color:#1e293b;}
        h1{font-size:1.3rem;margin:0 0 .25rem;} .meta{color:#64748b;font-size:.8rem;margin-bottom:1.5rem;}
        table{width:100%;border-collapse:collapse;margin-bottom:1.5rem;font-size:.85rem;}
        th,td{padding:.4rem .5rem;border-bottom:1px solid #e2e8f0;} th{text-align:left;background:#f1f5f9;}
        tr.sub td{color:#64748b;font-size:.8rem;border-bottom:1px dotted #e2e8f0;}
        .cascade td{font-size:.95rem;} .cascade .total td{font-weight:800;border-top:2px solid #334155;}
        .note{background:#fef3c7;border:1px solid #f59e0b;padding:.5rem .75rem;border-radius:6px;font-size:.8rem;}
        .neg{color:#dc2626;}
      </style></head><body>
      <h1>${title}</h1>
      <div class="meta">Casa Lucenzo · Generado ${new Date().toLocaleString('es-VE')} · Tasa BCV ${bcvRate.toLocaleString('es-VE')}</div>
      ${estNote}
      <table class="cascade">
        <tr><td>Ventas de mercadería</td><td style="text-align:right">${usd(t.ventasUsd)}</td></tr>
        <tr><td>− Costo de producción (terceros)${t.costoTerceros.isEstimated ? ' (est.)' : ''}</td><td style="text-align:right">−${usd(t.costoTerceros.usd)}</td></tr>
        <tr><td>− Gastos del local</td><td style="text-align:right">−${usd(t.gastosUsd)}</td></tr>
        <tr class="total"><td>= Ganancia neta</td><td style="text-align:right" class="${t.gananciaNetaUsd < 0 ? 'neg' : ''}">${usd(t.gananciaNetaUsd)}</td></tr>
      </table>
      <h3>Por categoría</h3>
      <table><tr><th>Categoría / Producto</th><th style="text-align:right">Unid.</th><th style="text-align:right">Ventas</th><th style="text-align:right">Terceros</th><th style="text-align:right">Margen</th></tr>${catRows}</table>
      <h3>Gastos</h3>
      <table><tr><th>Categoría / Detalle</th><th style="text-align:right">Monto</th></tr>${gastoRows}</table>
      ${pnl.abonos.count > 0 ? `<p class="meta">Abonos cobrados: ${pnl.abonos.count} · ${usd(pnl.abonos.montoUsd)} (fuera del cálculo de ganancia)</p>` : ''}
      <script>window.onload=function(){setTimeout(function(){window.print();},400);}</script>
      </body></html>`);
    printWindow.document.close();
}

// Expose to window namespace
/**
 * Opens a quick numeric quantity selector modal for Vitrina
 * @param {Object} product Selected product details
 * @param {number} currentQty Current quantity in active cart
 * @param {Function} onConfirm Callback when quantity is selected (newQty)
 */
function openQuantitySelectorModal(product, currentQty = 0, onConfirm) {
    const modal = document.getElementById('qty-selector-modal');
    if (!modal) return;

    const titleEl = document.getElementById('qty-modal-prod-name');
    const infoEl = document.getElementById('qty-modal-prod-info');
    const inputEl = document.getElementById('qty-modal-input');
    const gridEl = document.getElementById('qty-modal-quick-grid');
    const btnClose = document.getElementById('qty-modal-close');
    const btnCancel = document.getElementById('qty-modal-cancel');
    const btnConfirm = document.getElementById('qty-modal-confirm');
    const btnMinus = document.getElementById('qty-modal-minus');
    const btnPlus = document.getElementById('qty-modal-plus');

    if (titleEl) titleEl.textContent = product.name;
    if (infoEl) infoEl.textContent = `$${(product.price || 0).toFixed(2)} • (Bs. ${((product.price || 0) * (window.bcvRate || 1)).toFixed(2)}) • Vitrina: ${product.stock || 0} ${product.unit || 'unid.'}`;

    let selectedQty = currentQty > 0 ? currentQty : 1;
    if (inputEl) inputEl.value = selectedQty;

    // Fast selector numbers grid
    const quickNumbers = [1, 2, 3, 4, 5, 6, 8, 10];
    if (gridEl) {
        gridEl.innerHTML = '';
        quickNumbers.forEach(num => {
            const btn = document.createElement('button');
            const isSelected = num === selectedQty;
            btn.style.cssText = `height: 42px; border-radius: 8px; border: 1.5px solid ${isSelected ? 'var(--color-gold)' : 'rgba(255,255,255,0.12)'}; background: ${isSelected ? 'rgba(243,198,63,0.2)' : 'rgba(255,255,255,0.04)'}; color: ${isSelected ? 'var(--color-gold)' : 'var(--color-white)'}; font-size: 1.1rem; font-weight: 900; cursor: pointer; transition: all 0.15s; font-family: monospace;`;
            btn.textContent = num;

            btn.addEventListener('click', () => {
                selectedQty = num;
                if (inputEl) inputEl.value = selectedQty;
                if (onConfirm) onConfirm(selectedQty);
                closeModal();
            });

            gridEl.appendChild(btn);
        });
    }

    const updateValue = (newVal) => {
        selectedQty = Math.max(0, parseInt(newVal) || 0);
        if (inputEl) inputEl.value = selectedQty;
    };

    if (btnMinus) {
        btnMinus.onclick = () => updateValue(selectedQty - 1);
    }
    if (btnPlus) {
        btnPlus.onclick = () => updateValue(selectedQty + 1);
    }
    if (inputEl) {
        inputEl.oninput = (e) => updateValue(e.target.value);
    }

    const closeModal = () => {
        modal.classList.add('hidden');
    };

    if (btnClose) btnClose.onclick = closeModal;
    if (btnCancel) btnCancel.onclick = closeModal;

    if (btnConfirm) {
        btnConfirm.onclick = () => {
            if (onConfirm) onConfirm(selectedQty);
            closeModal();
        };
    }

    modal.classList.remove('hidden');
}

/**
 * Render the Admin Cost & Net Profit Calculator view
 * @param {Array} products Current menu products list
 * @param {Array} costInsumos List of raw insumos and purchase costs
 * @param {Function} onDeleteInsumo Callback to delete an insumo
 */
function renderCostCalculator(products, costInsumos, onDeleteInsumo) {
    // 1. Render Insumos List
    const insumosContainer = document.getElementById('cost-insumos-list-container');
    if (insumosContainer) {
        insumosContainer.innerHTML = '';
        if (!costInsumos || costInsumos.length === 0) {
            insumosContainer.innerHTML = `<div style="text-align: center; font-size: 11px; color: var(--color-text-muted); padding: 1rem;">No hay insumos registrados.</div>`;
        } else {
            costInsumos.forEach(item => {
                const card = document.createElement('div');
                card.style.cssText = "background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.06); border-radius: var(--radius-md); padding: 0.6rem 0.75rem; margin-bottom: 0.5rem; display: flex; align-items: center; justify-content: space-between; gap: 0.5rem;";
                
                const unitPrice = item.price / (item.qty || 1);
                let detailText;
                let typeBadge;

                if (item.type === 'solid') {
                    const pricePerGram = unitPrice / 1000;
                    typeBadge = `<span style="background: rgba(16, 185, 129, 0.15); color: #10B981; padding: 1px 5px; border-radius: 4px; font-size: 9px; font-weight: 800;">SÓLIDO</span>`;
                    detailText = `$${unitPrice.toFixed(2)} / kg • <b style="color: var(--color-gold);">$${pricePerGram.toFixed(4)} / gramo</b>`;
                } else if (item.type === 'liquid') {
                    const pricePerMl = unitPrice / 1000;
                    typeBadge = `<span style="background: rgba(59, 130, 246, 0.15); color: #60A5FA; padding: 1px 5px; border-radius: 4px; font-size: 9px; font-weight: 800;">LÍQUIDO</span>`;
                    detailText = `$${unitPrice.toFixed(2)} / L • <b style="color: var(--color-gold);">$${pricePerMl.toFixed(4)} / ml</b>`;
                } else {
                    typeBadge = `<span style="background: rgba(201, 162, 74, 0.15); color: var(--color-gold); padding: 1px 5px; border-radius: 4px; font-size: 9px; font-weight: 800;">UNIDAD</span>`;
                    detailText = `$${unitPrice.toFixed(2)} / unidad`;
                }

                card.innerHTML = `
                    <div>
                        <div style="display: flex; align-items: center; gap: 0.35rem; font-size: 0.8rem; font-weight: 800; color: var(--color-white);">
                            <span>${item.name}</span>
                            ${typeBadge}
                        </div>
                        <div style="font-size: 10px; color: var(--color-text-muted); margin-top: 2px;">
                            Compra: $${item.price.toFixed(2)} por ${item.qty} ${item.unit} | ${detailText}
                        </div>
                    </div>
                    <button class="btn-delete-insumo" style="background: rgba(239, 68, 68, 0.15); border: 1px solid var(--color-danger); color: #FCA5A5; width: 26px; height: 26px; border-radius: 6px; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 10px;" title="Eliminar insumo">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                `;

                card.querySelector('.btn-delete-insumo').addEventListener('click', () => {
                    if (onDeleteInsumo) onDeleteInsumo(item.id);
                });

                insumosContainer.appendChild(card);
            });
        }
    }

    // 2. Render Product Selector Dropdown
    const prodSelect = document.getElementById('cost-calc-product-select');
    if (prodSelect && products) {
        const currentSelectedId = prodSelect.value;
        prodSelect.innerHTML = '';
        products.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = `${p.name} ($${(p.price || 0).toFixed(2)})`;
            if (p.id === currentSelectedId) opt.selected = true;
            prodSelect.appendChild(opt);
        });
    }

    // 3. Render Financial Results Analysis
    renderCostFinancialResults(products, costInsumos);
}

/**
 * Calculates recipe cost, net profit, margin percentage and tray profit for selected product
 */
function renderCostFinancialResults(products, costInsumos) {
    const resultsContainer = document.getElementById('cost-financial-results-container');
    const prodSelect = document.getElementById('cost-calc-product-select');
    const sellPriceInput = document.getElementById('cost-calc-sell-price');
    if (!resultsContainer || !prodSelect) return;

    const selectedProdId = prodSelect.value || (products && products[0] ? products[0].id : null);
    const product = products.find(p => p.id === selectedProdId) || (products && products[0]);
    if (!product) return;

    // Update sell price input if switching product
    if (sellPriceInput && (!sellPriceInput.value || sellPriceInput.dataset.activeProdId !== product.id)) {
        sellPriceInput.value = (product.price || 1.50).toFixed(2);
        sellPriceInput.dataset.activeProdId = product.id;
    }

    const sellPrice = parseFloat(sellPriceInput ? sellPriceInput.value : 0) || (product.price || 1.50);
    const bcv = window.bcvRate || 1;

    // Calculate recipe production cost from insumos database
    const findInsumo = (key, defaultPricePerG) => {
        if (!costInsumos) return defaultPricePerG;
        const found = costInsumos.find(i => i.id === key || i.name.toLowerCase().includes(key));
        if (found) {
            const unitPrice = found.price / (found.qty || 1);
            return unitPrice / 1000; // price per gram or ml
        }
        return defaultPricePerG;
    };

    const priceHarinaG = findInsumo('harina', 22.00 / 25000); // 0.00088 / g
    const priceMargarinaG = findInsumo('margarina', 18.00 / 10000); // 0.0018 / g
    const priceAceiteMl = findInsumo('aceite', 20.00 / 10000); // 0.002 / ml

    let unitProductionCost;
    let ingredientBreakdownHtml;
    let costSourceHtml;

    if (product.cost > 0) {
        // Real cost the business actually pays (e.g. Bs.800/unit to the
        // third-party producer, set in Configurar Productos) beats any
        // ingredient-recipe guess -- using both at once is how this
        // calculator used to show a $0.26 "cost" and 753% margin on a
        // pastelito that really costs Bs.800 to have made.
        unitProductionCost = product.cost / bcv;
        ingredientBreakdownHtml = `
            <div style="font-size: 10px; color: var(--color-text-muted); margin-top: 0.5rem; background: rgba(0,0,0,0.2); padding: 0.5rem; border-radius: var(--radius-md);">
                • Costo real pagado al productor: Bs. ${product.cost.toFixed(2)} / unidad
            </div>
        `;
        costSourceHtml = `<span style="font-size: 9px; font-weight: 800; color: #34D399; text-transform: uppercase;"><i class="fa-solid fa-check-circle"></i> Costo real (Configurar Productos)</span>`;
    } else {

    // Standard dough cost for 1 pastelito (50g Harina + 5g Margarina + 15ml Fritura)
    const costHarina = 50 * priceHarinaG;
    const costMargarina = 5 * priceMargarinaG;
    const costAceite = 15 * priceAceiteMl;

    costSourceHtml = `<span style="font-size: 9px; font-weight: 800; color: #FBBF24; text-transform: uppercase;"><i class="fa-solid fa-triangle-exclamation"></i> Estimado por receta -- no es el costo real</span>`;

    if (product.category === 'pastelitos') {
        let fillingCost;
        let fillingName;
        let fillingGrams = 30;

        if (product.id.includes('mechada')) {
            fillingName = 'Carne Mechada';
            fillingCost = 30 * findInsumo('carne_mechada', 75.00 / 15000);
        } else if (product.id.includes('pollo')) {
            fillingName = 'Pollo Desmechado';
            fillingCost = 30 * findInsumo('pollo', 50.00 / 15000);
        } else if (product.id.includes('queso')) {
            fillingName = 'Queso Blanco';
            fillingCost = 30 * findInsumo('queso', 45.00 / 10000);
        } else if (product.id.includes('tocineta')) {
            fillingName = 'Tocineta y Queso';
            fillingCost = (15 * findInsumo('queso', 45.00 / 10000)) + (15 * findInsumo('tocineta', 30.00 / 5000));
        } else {
            fillingName = 'Relleno Especial';
            fillingCost = 35 * findInsumo('carne_mechada', 75.00 / 15000);
        }

        unitProductionCost = costHarina + costMargarina + costAceite + fillingCost;

        ingredientBreakdownHtml = `
            <div style="font-size: 10px; color: var(--color-text-muted); display: grid; grid-template-columns: 1fr 1fr; gap: 0.35rem; margin-top: 0.5rem; background: rgba(0,0,0,0.2); padding: 0.5rem; border-radius: var(--radius-md);">
                <div>• Harina (50g): $${costHarina.toFixed(3)}</div>
                <div>• Margarina (5g): $${costMargarina.toFixed(3)}</div>
                <div>• ${fillingName} (${fillingGrams}g): $${fillingCost.toFixed(3)}</div>
                <div>• Aceite de Fritura (15ml): $${costAceite.toFixed(3)}</div>
            </div>
        `;
    } else {
        // Fallback for non-pastelito items (drinks/cakes)
        unitProductionCost = sellPrice * 0.40; // 40% estimated cost basis
        ingredientBreakdownHtml = `
            <div style="font-size: 10px; color: var(--color-text-muted); margin-top: 0.5rem; background: rgba(0,0,0,0.2); padding: 0.5rem; border-radius: var(--radius-md);">
                • Costo estimado de adquisición/elaboración: $${unitProductionCost.toFixed(2)}
            </div>
        `;
    }

    } // end of the product.cost > 0 / recipe-estimate branch

    const netProfitPerUnit = Math.max(0, sellPrice - unitProductionCost);
    const netProfitBs = netProfitPerUnit * bcv;
    const profitMarginPct = unitProductionCost > 0 ? ((netProfitPerUnit / unitProductionCost) * 100) : 0;

    // Tray of 25 items calculation
    const trayProfitUsd = netProfitPerUnit * 25;
    const trayProfitBs = trayProfitUsd * bcv;
    const trayCostUsd = unitProductionCost * 25;
    const trayRevenueUsd = sellPrice * 25;

    resultsContainer.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 0.85rem;">

            <div style="text-align: center;">${costSourceHtml}</div>

            <!-- Main Metrics Cards Grid -->
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.6rem;">
                <!-- Cost Card -->
                <div style="background: rgba(239, 68, 68, 0.1); border: 1.5px solid rgba(239, 68, 68, 0.3); border-radius: var(--radius-lg); padding: 0.6rem; text-align: center;">
                    <div style="font-size: 9px; font-weight: 800; color: #FCA5A5; text-transform: uppercase;">Costo Producción</div>
                    <div style="font-size: 1.15rem; font-weight: 900; color: #F87171; margin-top: 2px; font-family: var(--font-mono);">$${unitProductionCost.toFixed(2)}</div>
                    <div style="font-size: 9px; color: var(--color-text-muted);">Bs. ${(unitProductionCost * bcv).toFixed(2)}</div>
                </div>

                <!-- Net Profit Card -->
                <div style="background: rgba(16, 185, 129, 0.1); border: 1.5px solid rgba(16, 185, 129, 0.35); border-radius: var(--radius-lg); padding: 0.6rem; text-align: center;">
                    <div style="font-size: 9px; font-weight: 800; color: #10B981; text-transform: uppercase;">Ganancia Neta / Unid</div>
                    <div style="font-size: 1.15rem; font-weight: 900; color: #34D399; margin-top: 2px; font-family: var(--font-mono);">$${netProfitPerUnit.toFixed(2)}</div>
                    <div style="font-size: 9px; color: #10B981; font-weight: 800;">Bs. ${netProfitBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                </div>

                <!-- Margin % Card -->
                <div style="background: rgba(201, 162, 74, 0.1); border: 1.5px solid rgba(201, 162, 74, 0.35); border-radius: var(--radius-lg); padding: 0.6rem; text-align: center;">
                    <div style="font-size: 9px; font-weight: 800; color: var(--color-gold); text-transform: uppercase;">Rendimiento</div>
                    <div style="font-size: 1.15rem; font-weight: 900; color: var(--color-gold); margin-top: 2px; font-family: var(--font-mono);">${profitMarginPct.toFixed(0)}%</div>
                    <div style="font-size: 9px; color: var(--color-text-muted);">Margen sobre costo</div>
                </div>
            </div>

            <!-- Tray of 25 units Summary Box -->
            <div style="background: linear-gradient(135deg, rgba(243,198,63,0.15) 0%, rgba(16,185,129,0.15) 100%); border: 1px solid var(--color-gold); border-radius: var(--radius-lg); padding: 0.75rem;">
                <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px dashed rgba(255,255,255,0.1); padding-bottom: 0.4rem; margin-bottom: 0.5rem;">
                    <span style="font-size: 11px; font-weight: 900; color: var(--color-gold); text-transform: uppercase; display: flex; align-items: center; gap: 0.35rem;">
                        <i class="fa-solid fa-layer-group"></i> Rendimiento por Lote (Bandeja 25 pzs)
                    </span>
                    <span style="font-size: 10px; font-weight: 900; color: #10B981;">+$${trayProfitUsd.toFixed(2)} Netos</span>
                </div>
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.5rem; text-align: center; font-size: 10px;">
                    <div>
                        <span style="color: var(--color-text-muted); display: block;">Venta Total (25)</span>
                        <b style="font-size: 11px; color: white;">$${trayRevenueUsd.toFixed(2)}</b>
                    </div>
                    <div>
                        <span style="color: var(--color-text-muted); display: block;">Inversión Costo</span>
                        <b style="font-size: 11px; color: #F87171;">$${trayCostUsd.toFixed(2)}</b>
                    </div>
                    <div>
                        <span style="color: var(--color-text-muted); display: block;">Ganancia Limpia</span>
                        <b style="font-size: 11px; color: #34D399;">Bs. ${trayProfitBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b>
                    </div>
                </div>
            </div>

            <!-- Ingredients Breakdown -->
            <div>
                <div style="font-size: 10px; font-weight: 800; color: var(--color-gold); text-transform: uppercase;">📋 Desglose de Receta por Pieza:</div>
                ${ingredientBreakdownHtml}
            </div>

        </div>
    `;
}

/**
 * Renders the users management list in the Admin section
 * @param {Array} users List of system users
 * @param {Function} onEdit Callback to edit user
 * @param {Function} onDelete Callback to delete user
 */
function renderUsersManagement(users, onEdit, onDelete) {
    const container = document.getElementById('users-management-list');
    if (!container) return;

    if (!users || users.length === 0) {
        container.innerHTML = `<div style="font-size: 11px; color: var(--color-text-muted); text-align: center; padding: 0.5rem;">No hay usuarios registrados.</div>`;
        return;
    }

    container.innerHTML = users.map(u => {
        const roleKey = (u.role || '').toLowerCase();
        const userKey = (u.username || '').toLowerCase();
        const isAdmin = roleKey === 'admin' || userKey.includes('admin');
        const isCocina = roleKey === 'cocina' || userKey.includes('cocina');
        const roleLabel = isAdmin ? '👑 Admin' : (isCocina ? '👨‍🍳 Cocina' : '🥖 Ventas');
        const roleColor = isAdmin ? 'var(--color-gold)' : (isCocina ? '#F97316' : '#3B82F6');
        const isActive = u.active !== false;

        return `
            <div style="display: flex; align-items: center; justify-content: space-between; padding: 0.4rem 0.6rem; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 6px; opacity: ${isActive ? '1' : '0.55'};">
                <div>
                    <div style="font-size: 0.78rem; font-weight: 800; color: #FFF; display: flex; align-items: center; gap: 0.3rem;">
                        <span>${escapeHtml(u.name || u.username)}</span>
                        <span style="font-size: 9px; font-weight: 900; padding: 1px 5px; border-radius: 10px; background: rgba(255,255,255,0.1); color: ${roleColor};">${roleLabel}</span>
                        ${!isActive ? `<span style="font-size: 9px; font-weight: 900; padding: 1px 5px; border-radius: 10px; background: rgba(239,68,68,0.2); color: #FCA5A5;">DESACTIVADO</span>` : ''}
                    </div>
                    <div style="font-size: 10px; color: var(--color-text-muted); font-family: monospace;">
                        Usuario: <strong style="color: var(--color-gold);">${escapeHtml(u.username)}</strong> | Autenticación: <span style="color: #34D399;">Supabase Auth (Protegido)</span>
                    </div>
                </div>
                <div style="display: flex; gap: 0.3rem;">
                    <button class="btn-edit-user" data-id="${u.id}" style="padding: 0.2rem 0.4rem; border-radius: 4px; border: none; background: rgba(59,130,246,0.2); color: #60A5FA; cursor: pointer; font-size: 0.7rem;">
                        <i class="fa-solid fa-pen-to-square"></i>
                    </button>
                    ${u.username !== 'admin' && isActive ? `
                    <button class="btn-delete-user" data-id="${u.id}" title="Desactivar usuario" style="padding: 0.2rem 0.4rem; border-radius: 4px; border: none; background: rgba(239,68,68,0.2); color: #FCA5A5; cursor: pointer; font-size: 0.7rem;">
                        <i class="fa-solid fa-user-slash"></i>
                    </button>` : ''}
                </div>
            </div>
        `;
    }).join('');

    container.querySelectorAll('.btn-edit-user').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-id');
            const user = users.find(u => u.id === id);
            if (user && typeof onEdit === 'function') onEdit(user);
        });
    });

    container.querySelectorAll('.btn-delete-user').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-id');
            if (typeof onDelete === 'function') onDelete(id);
        });
    });
}

window.UIManager = {
    switchView,
    renderSearchBar,
    renderCategoryFilterBar,
    renderPendingDispatches,
    renderLocal,
    openQuantitySelectorModal,
    spawnFloatingIndicator,
    updateKitchenBadge,
    renderCocina,
    renderCashRegister,
    renderSalesHistory,
    renderExpenses,
    renderAdminExpenses,
    renderPnl,
    renderDebts,
    renderPedidosOnline,
    updatePedidosBadge,
    renderDayCloseModal,
    renderSettingsProducts,
    toggleSettingsModal,
    showToast,
    initPinKeypad,
    updateConnectionStatus,
    renderIngredientsPantry,
    renderStats,
    renderQuickConversionTable,
    renderActiveCart,
    renderClientesView,
    showPaymentMethodModal,
    showPosReceiptModal,
    showUpdateOverlay,
    updateOverlayStatusSuccess,
    renderActiveDevices,
    renderActivityLogs,
    renderRecentActivity,
    exportDashboardSummaryToPDF,
    renderHourlyStats,
    exportHourlyStatsToPDF,
    renderCriticalStockAlerts,
    renderPaymentAndCategoryStats,
    renderSalesAnalytics,
    exportDayCloseToPDF,
    exportSalesAnalyticsToPDF,
    exportPnlToPDF,
    renderCostCalculator,
    renderCostFinancialResults,
    renderUsersManagement
};

