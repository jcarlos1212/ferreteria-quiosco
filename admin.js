/* ============================================
VENDEDOR IA - PANEL ADMINISTRATIVO v2.0
SaaS Ready | CRUD Productos | WhatsApp
============================================ */
const SUPABASE_URL = 'https://tpdstpnvsyqcvsfminip.supabase.co';
const SUPABASE_KEY = 'sb_publishable_ZCntTGwCbMRC2A-pL0d8vQ_GwMiH1bt';
const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

/* ============================================
VARIABLES GLOBALES
============================================ */
let currentPeriod = 'hoy';
let currentVentaId = null;
let allVentas = [];
let allProducts = [];
let currentEditProductId = null;
let negocioConfig = {};
const PLANES = {
    basico: { nombre: 'Básico', max_productos: 50, label: '50 productos' },
    profesional: { nombre: 'Profesional', max_productos: 200, label: '200 productos' },
    empresarial: { nombre: 'Empresarial', max_productos: 9999, label: 'Ilimitado' }
};

/* ============================================
UTILIDADES
============================================ */
function escapeHtml(text) {
    if (typeof text !== 'string') return text;
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/* ============================================
INICIALIZACIÓN
============================================ */
document.addEventListener('DOMContentLoaded', function() {
    const passwordInput = document.getElementById('adminPassword');
    if (passwordInput) {
        passwordInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') login();
        });
    }
    
    // Cerrar modales al hacer click fuera
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', function(e) {
            if (e.target === this) {
                this.classList.remove('active');
                if (this.id === 'productModal') currentEditProductId = null;
            }
        });
    });
});

/* ============================================
LOGIN
============================================ */

async function login() {
    const emailInput = document.getElementById('adminEmail');
    const passwordInput = document.getElementById('adminPassword');
    const loginError = document.getElementById('loginError');
    
    if (!emailInput || !passwordInput) return;
    
    const email = emailInput.value.trim();
    const password = passwordInput.value.trim();
    
    if (!email || !password) {
        if (loginError) loginError.textContent = 'Ingresa correo y contraseña';
        return;
    }
    
    try {
        const { data, error } = await db.auth.signInWithPassword({
            email: email,
            password: password
        });
        
        if (error) {
            console.error('Error login:', error);
            if (loginError) loginError.textContent = 'Correo o contraseña incorrectos';
            passwordInput.value = '';
            passwordInput.focus();
            return;
        }
        
        if (data.session) {
            showScreen('admin-screen');
            loadDashboard();
        }
    } catch (error) {
        console.error('Error en login:', error);
        if (loginError) loginError.textContent = 'Error de conexión';
    }
}

function logout() {
    db.auth.signOut();
    const emailInput = document.getElementById('adminEmail');
    const passwordInput = document.getElementById('adminPassword');
    if (emailInput) emailInput.value = '';
    if (passwordInput) passwordInput.value = '';
    const loginError = document.getElementById('loginError');
    if (loginError) loginError.textContent = '';
    showScreen('login-screen');
}



function logout() {
    const passwordInput = document.getElementById('adminPassword');
    if (passwordInput) passwordInput.value = '';
    const loginError = document.getElementById('loginError');
    if (loginError) loginError.textContent = '';
    showScreen('login-screen');
}

/* ============================================
NAVEGACIÓN
============================================ */
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const screen = document.getElementById(screenId);
    if (screen) screen.classList.add('active');
}

/* ============================================
CARGAR DASHBOARD
============================================ */
async function loadDashboard() {
    await Promise.all([
        loadVentas(),
        loadStockBajo(),
        loadTopProductos(),
        cargarConfigNegocio(),
        cargarProductosAdmin()
    ]);
}

/* ============================================
FILTRAR POR PERÍODO
============================================ */
function filterPeriod(period) {
    currentPeriod = period;
    document.querySelectorAll('.btn-filter').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.period === period) btn.classList.add('active');
    });
    loadVentas();
    loadTopProductos();
}

function getDateRange(period) {
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    
    switch(period) {
        case 'hoy': return { start: today, end: today };
        case 'semana':
            const weekAgo = new Date(now); weekAgo.setDate(weekAgo.getDate() - 7);
            return { start: weekAgo.toISOString().split('T')[0], end: today };
        case 'mes':
            const monthAgo = new Date(now); monthAgo.setMonth(monthAgo.getMonth() - 1);
            return { start: monthAgo.toISOString().split('T')[0], end: today };
        case 'todo': return { start: '2020-01-01', end: today };
        default: return { start: today, end: today };
    }
}

/* ============================================
CARGAR VENTAS
============================================ */
async function loadVentas() {
    const ventasList = document.getElementById('ventasList');
    if (!ventasList) return;
    
    ventasList.innerHTML = '<div class="empty-state">Cargando ventas...</div>';
    
    try {
        const { start, end } = getDateRange(currentPeriod);
        const { data, error } = await db
            .from('ventas')
            .select('*')
            .gte('fecha', start)
            .lte('fecha', end)
            .order('id', { ascending: false });
        
        if (error) throw error;
        allVentas = data || [];
        
        if (allVentas.length === 0) {
            ventasList.innerHTML = '<div class="empty-state">No hay ventas en este período</div>';
            updateStats();
            return;
        }
        
        ventasList.innerHTML = allVentas.map(venta => `
            <div class="venta-item">
                <div class="venta-info">
                    <div class="venta-number">${escapeHtml(venta.numero_venta)}</div>
                    <div class="venta-details">${venta.fecha} - ${venta.hora}</div>
                    <div class="venta-client">👤 ${escapeHtml(venta.cliente || 'Walk-In')}</div>
                </div>
                <div class="venta-right">
                    <div class="venta-total">S/ ${parseFloat(venta.total).toFixed(2)}</div>
                    <span class="venta-status ${venta.estado.toLowerCase()}">${venta.estado}</span>
                    ${venta.estado === 'Pendiente' ? `
                        <button class="btn-cobrar" onclick="openConfirmModal(${venta.id}, '${escapeHtml(venta.numero_venta)}', ${venta.total})">
                            💵 Cobrar
                        </button>
                    ` : ''}
                </div>
            </div>
        `).join('');
        
        updateStats();
    } catch (error) {
        console.error('Error cargando ventas:', error);
        ventasList.innerHTML = '<div class="empty-state">Error al cargar ventas</div>';
    }
}

/* ============================================
ESTADÍSTICAS
============================================ */
function updateStats() {
    const totalVentas = allVentas.reduce((sum, v) => sum + parseFloat(v.total || 0), 0);
    const numVentas = allVentas.length;
    const pagadas = allVentas.filter(v => v.estado === 'Pagado').length;
    const pendientes = allVentas.filter(v => v.estado === 'Pendiente').length;
    
    const elTotal = document.getElementById('totalVentas');
    const elNum = document.getElementById('numVentas');
    const elPag = document.getElementById('ventasPagadas');
    const elPen = document.getElementById('ventasPendientes');
    
    if (elTotal) elTotal.textContent = `S/ ${totalVentas.toFixed(2)}`;
    if (elNum) elNum.textContent = numVentas;
    if (elPag) elPag.textContent = pagadas;
    if (elPen) elPen.textContent = pendientes;
}

/* ============================================
STOCK BAJO
============================================ */
async function loadStockBajo() {
    const alertSection = document.getElementById('alertSection');
    const alertList = document.getElementById('alertList');
    
    if (!alertSection || !alertList) return;
    
    try {
        const { data, error } = await db
            .from('productos')
            .select('nombre, stock, unidad')
            .eq('estado', 'activo')
            .lte('stock', 10)
            .order('stock', { ascending: true });
        
        if (error) throw error;
        
        if (data && data.length > 0) {
            alertSection.style.display = 'block';
            alertList.innerHTML = data.map(p => `
                <div class="alert-item">
                    <span>${escapeHtml(p.nombre)}</span>
                    <span class="stock-value">${p.stock} ${escapeHtml(p.unidad)}</span>
                </div>
            `).join('');
        } else {
            alertSection.style.display = 'none';
        }
    } catch (error) {
        console.error('Error cargando stock bajo:', error);
        alertSection.style.display = 'none';
    }
}

/* ============================================
TOP PRODUCTOS
============================================ */
async function loadTopProductos() {
    const topProducts = document.getElementById('topProducts');
    if (!topProducts) return;
    
    topProducts.innerHTML = '<div class="empty-state">Cargando...</div>';
    
    try {
        const { start, end } = getDateRange(currentPeriod);
        const { data, error } = await db
            .from('ventas')
            .select('productos')
            .gte('fecha', start)
            .lte('fecha', end)
            .eq('estado', 'Pagado');
        
        if (error) throw error;
        
        if (!data || data.length === 0) {
            topProducts.innerHTML = '<div class="empty-state">No hay productos vendidos aún</div>';
            return;
        }
        
        const productCount = {};
        data.forEach(venta => {
            if (!venta.productos) return;
            const items = venta.productos.split(',');
            items.forEach(item => {
                const match = item.match(/(\d+)\s*x\s*(.+?)\s*\(/);
                if (match) {
                    const qty = parseInt(match[1]);
                    const name = match[2].trim();
                    productCount[name] = (productCount[name] || 0) + qty;
                }
            });
        });
        
        const sorted = Object.entries(productCount)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);
        
        if (sorted.length === 0) {
            topProducts.innerHTML = '<div class="empty-state">No hay productos vendidos aún</div>';
            return;
        }
        
        topProducts.innerHTML = sorted.map((item, idx) => `
            <div class="top-product-item">
                <div class="top-product-rank">${idx + 1}</div>
                <div class="top-product-name">${escapeHtml(item[0])}</div>
                <div class="top-product-qty">${item[1]} unid.</div>
            </div>
        `).join('');
    } catch (error) {
        console.error('Error cargando top productos:', error);
        topProducts.innerHTML = '<div class="empty-state">Error al cargar</div>';
    }
}

/* ============================================
MODAL DE CONFIRMACIÓN DE PAGO
============================================ */
function openConfirmModal(ventaId, numeroVenta, total) {
    currentVentaId = ventaId;
    const confirmMessage = document.getElementById('confirmMessage');
    if (confirmMessage) {
        confirmMessage.innerHTML = `¿Confirmar el pago de la venta <strong>${escapeHtml(numeroVenta)}</strong><br> por un total de <strong>S/ ${parseFloat(total).toFixed(2)}</strong>?`;
    }
    const modal = document.getElementById('confirmModal');
    if (modal) modal.classList.add('active');
}

function closeConfirmModal() {
    currentVentaId = null;
    const modal = document.getElementById('confirmModal');
    if (modal) modal.classList.remove('active');
}

async function confirmarPago() {
    if (!currentVentaId) return;
    
    try {
        const { error: updateError } = await db
            .from('ventas')
            .update({ estado: 'Pagado' })
            .eq('id', currentVentaId);
        
        if (updateError) throw updateError;
        
        await db.from('ventas_estado_log').insert([{
            venta_id: currentVentaId,
            estado_anterior: 'Pendiente',
            estado_nuevo: 'Pagado',
            usuario: 'Admin'
        }]);
        
        closeConfirmModal();
        await loadVentas();
        showToast('✅ Pago confirmado exitosamente');
    } catch (error) {
        console.error('Error confirmando pago:', error);
        alert(' Error al confirmar el pago');
    }
}

/* ============================================
CONFIGURACIÓN DEL NEGOCIO
============================================ */
async function cargarConfigNegocio() {
    try {
        const { data, error } = await db
            .from('config_negocio')
            .select('*')
            .single();
        
        if (error) {
            console.error('Error cargando config:', error);
            return;
        }
        
        if (data) {
            negocioConfig = data;
            const elNombre = document.getElementById('configNombre');
            const elLogo = document.getElementById('configLogo');
            const elWhatsapp = document.getElementById('configWhatsapp');
            const elTelefono = document.getElementById('configTelefono');
            const elDireccion = document.getElementById('configDireccion');
            const elPlan = document.getElementById('configPlan');
            const elPreview = document.getElementById('logoPreviewImg');
            
            if (elNombre) elNombre.value = data.nombre_negocio || '';
            if (elLogo) elLogo.value = data.logo_url || '';
            if (elWhatsapp) elWhatsapp.value = data.whatsapp || '';
            if (elTelefono) elTelefono.value = data.telefono || '';
            if (elDireccion) elDireccion.value = data.direccion || '';
            if (elPlan) elPlan.value = data.plan || 'basico';
            
            if (elPreview) {
                if (data.logo_url) {
                    elPreview.src = data.logo_url;
                    elPreview.style.display = 'block';
                } else {
                    elPreview.style.display = 'none';
                }
            }
            
            actualizarLogoEnPanel(data.logo_url, data.nombre_negocio);
            mostrarInfoPlan(data.plan || 'basico');
        }
    } catch (error) {
        console.error('Error cargando configuración:', error);
    }
}

function mostrarInfoPlan(planKey) {
    const planInfo = document.getElementById('planInfo');
    const plan = PLANES[planKey] || PLANES.basico;
    if (planInfo) {
        planInfo.innerHTML = `<div class="plan-badge plan-${planKey}"> <strong>Plan ${plan.nombre}</strong> — Hasta ${plan.label} </div>`;
    }
}

async function guardarConfig() {
    const nombre = document.getElementById('configNombre').value.trim();
    const logoUrl = document.getElementById('configLogo').value.trim();
    const whatsapp = document.getElementById('configWhatsapp').value.trim();
    const telefono = document.getElementById('configTelefono').value.trim();
    const direccion = document.getElementById('configDireccion').value.trim();
    const plan = document.getElementById('configPlan').value;
    
    if (!nombre) {
        alert('Ingresa el nombre del negocio');
        return;
    }
    
    try {
        const { error } = await db
            .from('config_negocio')
            .update({
                nombre_negocio: nombre,
                logo_url: logoUrl,
                whatsapp: whatsapp,
                telefono: telefono,
                direccion: direccion,
                plan: plan,
                updated_at: new Date().toISOString()
            })
            .eq('id', 1);
        
        if (error) throw error;
        
        showToast('✅ Configuración guardada correctamente');
        actualizarLogoEnApp(logoUrl, nombre);
        mostrarInfoPlan(plan);
    } catch (error) {
        console.error('Error guardando configuración:', error);
        alert('❌ Error al guardar la configuración');
    }
}

function actualizarLogoEnApp(logoUrl, nombreNegocio) {
    const logos = document.querySelectorAll('.logo-3d img');
    logos.forEach(img => {
        if (logoUrl) {
            img.src = logoUrl;
            img.style.opacity = '1';
        }
        if (nombreNegocio) img.alt = nombreNegocio;
    });
    
    const titulos = document.querySelectorAll('.kiosk-title');
    titulos.forEach(titulo => {
        if (nombreNegocio && titulo.textContent.includes('BIENVENIDO')) {
            titulo.innerHTML = `BIENVENIDO A LA<br>${escapeHtml(nombreNegocio.toUpperCase())}`;
        }
    });
}

function actualizarLogoEnPanel(logoUrl, nombreNegocio) {
    const logos = document.querySelectorAll('.logo-3d img');
    logos.forEach(img => {
        if (logoUrl) img.src = logoUrl;
        if (nombreNegocio) img.alt = nombreNegocio;
    });
    
    const subtitle = document.querySelector('.subtitle');
    if (subtitle && nombreNegocio) subtitle.textContent = nombreNegocio;
}

/* ============================================
SUBIR IMAGEN DE PRODUCTO DESDE ARCHIVO
============================================ */
function handleProductImageUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    if (file.size > 5 * 1024 * 1024) {
        alert('La imagen debe ser menor a 5MB');
        return;
    }
    
    const reader = new FileReader();
    reader.onload = function(e) {
        const base64Url = e.target.result;
        document.getElementById('prodImagen').value = base64Url;
        const preview = document.getElementById('productPreviewImg');
        if (preview) {
            preview.src = base64Url;
            preview.style.display = 'block';
        }
        showToast('✅ Imagen cargada');
    };
    reader.onerror = function() {
        alert('❌ Error al leer la imagen');
    };
    reader.readAsDataURL(file);
}

function handleLogoUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    if (file.size > 5 * 1024 * 1024) {
        alert('El logo debe ser menor a 5MB');
        return;
    }
    
    const reader = new FileReader();
    reader.onload = function(e) {
        const base64Url = e.target.result;
        document.getElementById('configLogo').value = base64Url;
        const preview = document.getElementById('logoPreviewImg');
        if (preview) {
            preview.src = base64Url;
            preview.style.display = 'block';
        }
        showToast('✅ Logo cargado correctamente');
    };
    reader.readAsDataURL(file);
}

/* ============================================
CRUD DE PRODUCTOS
============================================ */
async function cargarProductosAdmin() {
    try {
        const { data, error } = await db
            .from('productos')
            .select('*')
            .order('nombre', { ascending: true });
        
        if (error) throw error;
        allProducts = data || [];
        renderProductosAdmin(allProducts);
        actualizarContadorProductos();
    } catch (error) {
        console.error('Error cargando productos:', error);
    }
}

function actualizarContadorProductos() {
    const activos = allProducts.filter(p => p.estado === 'activo').length;
    const inactivos = allProducts.filter(p => p.estado === 'inactivo').length;
    const el = document.getElementById('productsCounter');
    if (el) {
        el.innerHTML = `<span class="counter-activos">${activos} activos</span> | <span class="counter-inactivos">${inactivos} inactivos</span>`;
    }
}

function renderProductosAdmin(products) {
    const grid = document.getElementById('productsGrid');
    if (!grid) return;
    
    if (products.length === 0) {
        grid.innerHTML = '<div class="empty-state">No se encontraron productos</div>';
        return;
    }
    
    grid.innerHTML = products.map(prod => `
        <div class="product-card ${prod.estado === 'inactivo' ? 'product-inactive' : ''}">
            <div class="product-card-header">
                <div class="product-card-name">${escapeHtml(prod.nombre)}</div>
                <span class="product-badge ${prod.estado}">${prod.estado}</span>
            </div>
            <div class="product-card-meta">
                <span class="product-card-category">${escapeHtml(prod.categoria || 'General')}</span>
                <span class="product-card-price">S/ ${parseFloat(prod.precio).toFixed(2)}</span>
            </div>
            <div class="product-card-stock">Stock: ${prod.stock} ${escapeHtml(prod.unidad || 'unid.')}</div>
            <div class="product-image-container">
                ${prod.imagen_url ?
                    `<img src="${escapeHtml(prod.imagen_url)}" alt="${escapeHtml(prod.nombre)}">` :
                    `<div class="no-image">Sin imagen<br>📦</div>`
                }
            </div>
            <div class="product-card-actions">
                <button class="btn-action-card edit" onclick="openProductModal(${prod.id})">✏️ Editar</button>
                ${prod.estado === 'activo' ?
                    `<button class="btn-action-card delete" onclick="eliminarProducto(${prod.id})">🗑️ Desactivar</button>` :
                    `<button class="btn-action-card restore" onclick="restaurarProducto(${prod.id})">✅ Activar</button>`
                }
            </div>
        </div>
    `).join('');
}

function filtrarProductosAdmin() {
    const search = document.getElementById('searchProductAdmin').value.toLowerCase();
    const filtroEstado = document.getElementById('filterEstado').value;
    
    let filtered = allProducts;
    
    if (search) {
        filtered = filtered.filter(p => p.nombre.toLowerCase().includes(search));
    }
    
    if (filtroEstado !== 'todos') {
        filtered = filtered.filter(p => p.estado === filtroEstado);
    }
    
    renderProductosAdmin(filtered);
}

/* ============================================
MODAL PRODUCTO (CREAR / EDITAR)
============================================ */
function openProductModal(productId = null) {
    currentEditProductId = productId;
    const modal = document.getElementById('productModal');
    const title = document.getElementById('productModalTitle');
    const form = document.getElementById('productForm');
    
    if (title) title.textContent = productId ? '✏️ Editar Producto' : '➕ Nuevo Producto';
    
    if (productId) {
        const producto = allProducts.find(p => p.id === productId);
        if (producto) {
            document.getElementById('prodSku').value = producto.sku || '';
            document.getElementById('prodNombre').value = producto.nombre;
            document.getElementById('prodCategoria').value = producto.categoria || '';
            document.getElementById('prodPrecio').value = producto.precio;
            document.getElementById('prodStock').value = producto.stock;
            document.getElementById('prodUnidad').value = producto.unidad || 'unid.';
            document.getElementById('prodImagen').value = producto.imagen_url || '';
            document.getElementById('prodEstado').value = producto.estado || 'activo';
            
            const preview = document.getElementById('productPreviewImg');
            if (preview && producto.imagen_url) {
                preview.src = producto.imagen_url;
                preview.style.display = 'block';
            } else if (preview) {
                preview.style.display = 'none';
            }
        }
    } else {
        form.reset();
        document.getElementById('prodSku').value = '';
        document.getElementById('prodUnidad').value = 'unid.';
        document.getElementById('prodEstado').value = 'activo';
        document.getElementById('prodImagen').value = '';
        
        const preview = document.getElementById('productPreviewImg');
        if (preview) {
            preview.src = '';
            preview.style.display = 'none';
        }
        
        const fileInput = document.getElementById('prodImageFile');
        if (fileInput) fileInput.value = '';
    }
    
    if (modal) modal.classList.add('active');
}

function closeProductModal() {
    currentEditProductId = null;
    const modal = document.getElementById('productModal');
    if (modal) modal.classList.remove('active');
}

async function guardarProducto() {
    const sku = document.getElementById('prodSku').value.trim();
    const nombre = document.getElementById('prodNombre').value.trim();
    const categoria = document.getElementById('prodCategoria').value.trim();
    const precio = parseFloat(document.getElementById('prodPrecio').value);
    const stock = parseInt(document.getElementById('prodStock').value);
    const unidad = document.getElementById('prodUnidad').value.trim();
    const imagen_url = document.getElementById('prodImagen').value.trim();
    const estado = document.getElementById('prodEstado').value;
    
    if (!sku || !nombre || isNaN(precio) || isNaN(stock)) {
        alert('Completa todos los campos obligatorios correctamente (SKU, nombre, precio, stock)');
        return;
    }
    
    try {
        if (currentEditProductId) {
            // EDITAR
            const { error } = await db
                .from('productos')
                .update({
                    sku,
                    nombre,
                    categoria,
                    precio,
                    stock,
                    unidad,
                    imagen_url: imagen_url || null,
                    estado,
                    updated_at: new Date().toISOString()
                })
                .eq('id', currentEditProductId);
            
            if (error) throw error;
            showToast('✅ Producto actualizado');
        } else {
            // CREAR — Validar límite del plan
            const plan = negocioConfig.plan || 'basico';
            const maxProd = PLANES[plan].max_productos;
            const activos = allProducts.filter(p => p.estado === 'activo').length;
            
            if (activos >= maxProd) {
                alert(`❌ Has alcanzado el límite de ${maxProd} productos del plan ${PLANES[plan].nombre}. Upgradea tu plan.`);
                return;
            }
            
            const { error } = await db
                .from('productos')
                .insert([{
                    sku,
                    nombre,
                    categoria,
                    precio,
                    stock,
                    unidad,
                    imagen_url: imagen_url || null,
                    estado,
                    created_at: new Date().toISOString()
                }]);
            
            if (error) throw error;
            showToast('✅ Producto creado exitosamente');
        }
        
        closeProductModal();
        await cargarProductosAdmin();
    } catch (error) {
        console.error('Error guardando producto:', error);
        alert('❌ Error: ' + error.message);
    }
}

async function eliminarProducto(productId) {
    if (!confirm('¿Desactivar este producto? Ya no aparecerá en el quiosco.')) return;
    
    try {
        const { error } = await db
            .from('productos')
            .update({ estado: 'inactivo' })
            .eq('id', productId);
        
        if (error) throw error;
        showToast('✅ Producto desactivado');
        await cargarProductosAdmin();
    } catch (error) {
        console.error('Error desactivando producto:', error);
        alert('❌ Error al desactivar');
    }
}

async function restaurarProducto(productId) {
    try {
        const { error } = await db
            .from('productos')
            .update({ estado: 'activo' })
            .eq('id', productId);
        
        if (error) throw error;
        showToast('✅ Producto activado');
        await cargarProductosAdmin();
    } catch (error) {
        console.error('Error activando producto:', error);
        alert('❌ Error al activar');
    }
}

/* ============================================
SUBIR IMAGEN DE PRODUCTO (STORAGE)
============================================ */
async function subirImagenProducto(event, productoId) {
    const file = event.target.files[0];
    if (!file) return;
    
    if (file.size > 5 * 1024 * 1024) {
        alert('La imagen debe ser menor a 5MB');
        return;
    }
    
    const producto = allProducts.find(p => p.id === productoId);
    if (!producto) return;
    
    const fileName = `producto_${productoId}_${Date.now()}.${file.name.split('.').pop()}`;
    
    try {
        const { data, error } = await db.storage
            .from('productos')
            .upload(fileName, file, { cacheControl: '3600', upsert: false });
        
        if (error) throw error;
        
        const { data: urlData } = db.storage
            .from('productos')
            .getPublicUrl(fileName);
        
        const imageUrl = urlData.publicUrl;
        
        const { error: updateError } = await db
            .from('productos')
            .update({ imagen_url: imageUrl })
            .eq('id', productoId);
        
        if (updateError) throw updateError;
        
        showToast('✅ Imagen subida correctamente');
        await cargarProductosAdmin();
    } catch (error) {
        console.error('Error subiendo imagen:', error);
        alert('❌ Error al subir la imagen: ' + error.message);
    }
}

/* ============================================
TOAST
============================================ */
function showToast(message) {
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toastMessage');
    
    if (!toast || !toastMessage) return;
    
    toastMessage.textContent = message;
    toast.classList.add('show');
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}
