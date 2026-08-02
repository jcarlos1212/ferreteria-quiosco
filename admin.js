/* ============================================
   CONFIGURACIÓN DE SUPABASE
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
});

/* ============================================
   LOGIN
   ============================================ */
async function login() {
    const passwordInput = document.getElementById('adminPassword');
    const loginError = document.getElementById('loginError');
    
    if (!passwordInput) return;
    
    const password = passwordInput.value.trim();
    
    if (!password) {
        if (loginError) loginError.textContent = 'Ingresa la contraseña';
        return;
    }
    
    try {
        // Verificar contraseña desde la base de datos
        const { data, error } = await db
            .from('config_admin')
            .select('valor')
            .eq('clave', 'admin_password')
            .single();
        
        if (error) {
            console.error('Error verificando contraseña:', error);
            if (loginError) loginError.textContent = 'Error de conexión';
            return;
        }
        
        if (data && data.valor === password) {
            // Contraseña correcta
            showScreen('admin-screen');
            loadDashboard();
        } else {
            // Contraseña incorrecta
            if (loginError) loginError.textContent = 'Contraseña incorrecta';
            passwordInput.value = '';
            passwordInput.focus();
        }
    } catch (error) {
        console.error('Error en login:', error);
        if (loginError) loginError.textContent = 'Error de conexión';
    }
}

/* ============================================
   LOGOUT
   ============================================ */
function logout() {
    const passwordInput = document.getElementById('adminPassword');
    if (passwordInput) passwordInput.value = '';
    
    const loginError = document.getElementById('loginError');
    if (loginError) loginError.textContent = '';
    
    showScreen('login-screen');
}

/* ============================================
   NAVEGACIÓN DE PANTALLAS
   ============================================ */
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
}

/* ============================================
   CARGAR DASHBOARD
   ============================================ */
async function loadDashboard() {
    await Promise.all([
        loadVentas(),
        loadStockBajo(),
        loadTopProductos()
    ]);
}

/* ============================================
   FILTRAR POR PERÍODO
   ============================================ */
function filterPeriod(period) {
    currentPeriod = period;
    
    // Actualizar botones activos
    document.querySelectorAll('.btn-filter').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.period === period) {
            btn.classList.add('active');
        }
    });
    
    loadVentas();
}

/* ============================================
   OBTENER RANGO DE FECHAS
   ============================================ */
function getDateRange(period) {
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    
    switch(period) {
        case 'hoy':
            return { start: today, end: today };
        case 'semana':
            const weekAgo = new Date(now);
            weekAgo.setDate(weekAgo.getDate() - 7);
            return { start: weekAgo.toISOString().split('T')[0], end: today };
        case 'mes':
            const monthAgo = new Date(now);
            monthAgo.setMonth(monthAgo.getMonth() - 1);
            return { start: monthAgo.toISOString().split('T')[0], end: today };
        case 'todo':
            return { start: '2020-01-01', end: today };
        default:
            return { start: today, end: today };
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
        
        // Renderizar lista de ventas
        ventasList.innerHTML = allVentas.map(venta => `
            <div class="venta-item">
                <div class="venta-info">
                    <div class="venta-number">${venta.numero_venta}</div>
                    <div class="venta-details">${venta.fecha} - ${venta.hora}</div>
                    <div class="venta-client">👤 ${venta.cliente || 'Walk-In'}</div>
                </div>
                <div class="venta-right">
                    <div class="venta-total">S/ ${parseFloat(venta.total).toFixed(2)}</div>
                    <span class="venta-status ${venta.estado.toLowerCase()}">${venta.estado}</span>
                    ${venta.estado === 'Pendiente' ? `
                        <button class="btn-cobrar" onclick="openConfirmModal(${venta.id}, '${venta.numero_venta}', ${venta.total})">
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
   ACTUALIZAR ESTADÍSTICAS
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
   CARGAR STOCK BAJO
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
                    <span>${p.nombre}</span>
                    <span class="stock-value">${p.stock} ${p.unidad}</span>
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
   CARGAR TOP PRODUCTOS
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
        
        // Procesar productos vendidos
        const productCount = {};
        
        data.forEach(venta => {
            if (!venta.productos) return;
            
            // Formato: "2 x Cemento Andino (S/ 100.00), 1 x Taladro (S/ 250.00)"
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
        
        // Ordenar por cantidad
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
                <div class="top-product-name">${item[0]}</div>
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
        confirmMessage.innerHTML = `
            ¿Confirmar el pago de la venta <strong>${numeroVenta}</strong><br>
            por un total de <strong>S/ ${parseFloat(total).toFixed(2)}</strong>?
        `;
    }
    
    const modal = document.getElementById('confirmModal');
    if (modal) modal.classList.add('active');
}

function closeConfirmModal() {
    currentVentaId = null;
    const modal = document.getElementById('confirmModal');
    if (modal) modal.classList.remove('active');
}

/* ============================================
   CONFIRMAR PAGO
   ============================================ */
async function confirmarPago() {
    if (!currentVentaId) return;
    
    try {
        // 1. Actualizar estado de la venta a "Pagado"
        const { error: updateError } = await db
            .from('ventas')
            .update({ estado: 'Pagado' })
            .eq('id', currentVentaId);
        
        if (updateError) throw updateError;
        
        // 2. Registrar el cambio en el log
        await db
            .from('ventas_estado_log')
            .insert([{
                venta_id: currentVentaId,
                estado_anterior: 'Pendiente',
                estado_nuevo: 'Pagado',
                usuario: 'Admin'
            }]);
        
        // 3. Cerrar modal y recargar
        closeConfirmModal();
        await loadVentas();
        
        // 4. Mostrar notificación
        showToast('Pago confirmado exitosamente');
        
    } catch (error) {
        console.error('Error confirmando pago:', error);
        alert('❌ Error al confirmar el pago');
    }
}

/* ============================================
   CERRAR MODAL AL HACER CLICK FUERA
   ============================================ */
document.addEventListener('DOMContentLoaded', function() {
    const modal = document.getElementById('confirmModal');
    if (modal) {
        modal.addEventListener('click', function(e) {
            if (e.target === this) closeConfirmModal();
        });
    }
});

/* ============================================
   MOSTRAR TOAST
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

/* ============================================
   CONFIGURACIÓN DEL NEGOCIO
   ============================================ */

// Cargar configuración al iniciar el dashboard
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
            const elNombre = document.getElementById('configNombre');
            const elLogo = document.getElementById('configLogo');
            const elPreview = document.getElementById('logoPreviewImg');
            
            if (elNombre) elNombre.value = data.nombre_negocio || '';
            if (elLogo) elLogo.value = data.logo_url || '';
            
            // LIMPIAR Y CARGAR LOGO CORRECTAMENTE
            if (elPreview) {
                if (data.logo_url) {
                    elPreview.src = data.logo_url;
                    elPreview.alt = data.nombre_negocio || 'Logo';
                    elPreview.style.display = 'block';
                } else {
                    elPreview.src = '';
                    elPreview.style.display = 'none';
                }
            }
            
            // Actualizar logo en el panel admin
            actualizarLogoEnPanel(data.logo_url, data.nombre_negocio);
        }
    } catch (error) {
        console.error('Error cargando configuración:', error);
    }
}
// Guardar configuración
async function guardarConfig() {
    const nombre = document.getElementById('configNombre').value.trim();
    const logoUrl = document.getElementById('configLogo').value.trim();
    
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
                updated_at: new Date().toISOString()
            })
            .eq('id', 1);
        
        if (error) throw error;
        
        showToast('✅ Configuración guardada correctamente');
        
        // Actualizar logo en toda la app
        actualizarLogoEnApp(logoUrl, nombre);
        
    } catch (error) {
        console.error('Error guardando configuración:', error);
        alert('❌ Error al guardar la configuración');
    }
}

// Actualizar logo en toda la aplicación
function actualizarLogoEnApp(logoUrl, nombreNegocio) {
    // Actualizar en el quiosco (index.html)
    const logosQuiosco = document.querySelectorAll('.logo-3d img');
    logosQuiosco.forEach(img => {
        if (logoUrl) img.src = logoUrl;
        if (nombreNegocio) img.alt = nombreNegocio;
    });
    
    // Actualizar títulos
    const titulos = document.querySelectorAll('.kiosk-title');
    titulos.forEach(titulo => {
        if (nombreNegocio && titulo.textContent.includes('BIENVENIDO')) {
            titulo.innerHTML = `BIENVENIDO A LA<br>${nombreNegocio.toUpperCase()}`;
        }
    });
}

// Mostrar modal para subir logo
function mostrarSubirLogo() {
    const url = prompt('Ingresa la URL de tu logo:\n\nPuedes subir tu logo a:\n- https://imgbb.com/\n- https://postimages.org/\n\nY pegar el enlace aquí:');
    
    if (url) {
        document.getElementById('configLogo').value = url;
        document.getElementById('logoPreviewImg').src = url;
    }
}

// Modificar loadDashboard para cargar config
const originalLoadDashboard = loadDashboard;
loadDashboard = async function() {
    await originalLoadDashboard();
    await cargarConfigNegocio();
};

/* ============================================
   SUBIR LOGO DESDE ARCHIVO LOCAL
   ============================================ */
async function handleLogoUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    // Verificar tamaño (máx 5MB)
    if (file.size > 5 * 1024 * 1024) {
        alert('El logo debe ser menor a 5MB');
        return;
    }
    
    // Mostrar loading
    const btn = event.target;
    const originalText = btn.textContent;
    btn.textContent = ' Subiendo...';
    btn.disabled = true;
    
    try {
        // Opción 1: Usar ImgBB (gratis, requiere API key)
        // Opción 2: Usar Cloudinary (gratis, más profesional)
        // Opción 3: Guardar en Supabase Storage (recomendado)
        
        // Por ahora, usaremos una solución simple:
        // Convertir a base64 y mostrar preview
        const reader = new FileReader();
        reader.onload = function(e) {
            const base64Url = e.target.result;
            
            // Actualizar input y preview
            document.getElementById('configLogo').value = base64Url;
            document.getElementById('logoPreviewImg').src = base64Url;
            
            showToast('✅ Logo cargado correctamente');
            
            btn.textContent = originalText;
            btn.disabled = false;
        };
        reader.readAsDataURL(file);
        
    } catch (error) {
        console.error('Error subiendo logo:', error);
        alert('❌ Error al subir el logo');
        btn.textContent = originalText;
        btn.disabled = false;
    }
}

