/* ============================================
   VENDEDOR IA - QUIOSCO INTELIGENTE v2.0
   SaaS Ready | PWA | WhatsApp | Sugerencias
   ============================================ */

const SUPABASE_URL = 'https://tpdstpnvsyqcvsfminip.supabase.co';
const SUPABASE_KEY = 'sb_publishable_ZCntTGwCbMRC2A-pL0d8vQ_GwMiH1bt';
const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

/* ============================================
   VARIABLES GLOBALES
   ============================================ */
let currentModule = '';
let currentResponse = '';
let currentAudio = '';
let recognition = null;
let isListening = false;
let clientName = '';
let countdownInterval = null;
let cart = [];
let currentSaleNumber = '';
let currentSaleTotal = 0;
let productQuantities = {};
let modalQuantities = {};
let allProductsCache = [];
let negocioConfig = {};


/* ============================================
   RATE LIMITING Y DEBOUNCE (Seguridad)
   ============================================ */
const rateLimiters = {};

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function rateLimit(key, limitMs) {
    const now = Date.now();
    if (rateLimiters[key] && now - rateLimiters[key] < limitMs) {
        showToast('⏳ Por favor espera un momento...');
        return false;
    }
    rateLimiters[key] = now;
    return true;
}



let inactivityTimer = null;
const INACTIVITY_TIMEOUT = 120000;
let isProcessingPurchase = false;
const CART_STORAGE_KEY = 'vendedor_ia_cart';
const CLIENT_STORAGE_KEY = 'vendedor_ia_client';

/* ============================================
   REGISTRO PWA
   ============================================ */
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js')
        .then(reg => console.log('SW registrado'))
        .catch(err => console.log('SW error:', err));
}

/* ============================================
   UTILIDADES
   ============================================ */
function escapeHtml(text) {
    if (typeof text !== 'string') return text;
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function vibrate(duration = 50) {
    if ('vibrate' in navigator) navigator.vibrate(duration);
}

/* ============================================
   PERSISTENCIA DE CARRITO
   ============================================ */
function saveCart() {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
}

function loadCart() {
    try {
        const saved = localStorage.getItem(CART_STORAGE_KEY);
        if (saved) cart = JSON.parse(saved);
    } catch (e) { cart = []; }
}

function clearCartStorage() {
    localStorage.removeItem(CART_STORAGE_KEY);
    localStorage.removeItem(CLIENT_STORAGE_KEY);
}

/* ============================================
   RECONOCIMIENTO DE VOZ
   ============================================ */
if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();
    recognition.lang = 'es-ES';
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onresult = function(event) {
        const userInput = document.getElementById('userInput');
        if (userInput) userInput.value = event.results[0][0].transcript;
        stopListening();
    };

    recognition.onerror = function(event) {
        console.error('Error en reconocimiento de voz:', event.error);
        stopListening();
        alert('Error al escuchar. Intenta de nuevo.');
    };

    recognition.onend = function() {
        stopListening();
    };
} else {
    const voiceBtn = document.getElementById('voiceBtn');
    if (voiceBtn) voiceBtn.style.display = 'none';
}

/* ============================================
   CONTROL DE INACTIVIDAD
   ============================================ */
function resetInactivityTimer() {
    if (inactivityTimer) clearTimeout(inactivityTimer);

    const modal = document.getElementById('modal');
    const isModalOpen = modal && modal.classList.contains('active');
    const isWelcome = document.getElementById('screen-welcome')?.classList.contains('active');

    if (!isWelcome && !isModalOpen) {
        inactivityTimer = setTimeout(() => {
            resetToWelcome();
        }, INACTIVITY_TIMEOUT);
    }
}

function clearInactivityTimer() {
    if (inactivityTimer) clearTimeout(inactivityTimer);
}

/* ============================================
   EVENTOS DEL TECLADO + INICIALIZACIÓN
   ============================================ */
document.addEventListener('DOMContentLoaded', function() {
    const clientNameInput = document.getElementById('clientName');
    if (clientNameInput) {
        clientNameInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') startSession();
        });
    }

    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') searchProducts();
        });
    }

    const userInput = document.getElementById('userInput');
    if (userInput) {
        userInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') sendQuestion();
        });
    }


    const searchBtn = document.getElementById('searchBtn');
    if (searchBtn) {
        searchBtn.addEventListener('click', () => {
            vibrate(100);
            debouncedSearch();
        });
    }
   

    const modal = document.getElementById('modal');
    if (modal) {
        modal.addEventListener('click', function(e) {
            if (e.target === this) closeModal();
        });
    }

    // ============================================
    // EVENT LISTENERS SEGUROS PARA MÓDULOS (Anti-XSS)
    // ============================================
    document.querySelectorAll('.module-card').forEach(card => {
        card.addEventListener('click', () => {
            vibrate(100);
            const module = card.dataset.module;
            if (module === 'cotizar') openModal('cotizar');
            else if (module === 'precio') openModal('precio');
            else if (module === 'comprar') openBuyScreen();
            else if (module === 'asesor') openModal('asesor');
        });
    });
   

    cargarConfigDesdeQuiosco();

    const savedTheme = localStorage.getItem('theme');
    const themeToggle = document.getElementById('themeToggle');
    if (savedTheme === 'light') {
        document.body.classList.add('light-mode');
        if (themeToggle) themeToggle.textContent = '🌙';
    }

    // Pre-cargar voces
    if (window.speechSynthesis) {
        window.speechSynthesis.onvoiceschanged = () => {};
        window.speechSynthesis.getVoices();
    }
});

/* ============================================
   NAVEGACIÓN ENTRE PANTALLAS
   ============================================ */
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const screen = document.getElementById(screenId);
    if (screen) screen.classList.add('active');
    resetInactivityTimer();
}

/* ============================================
   INICIAR SESIÓN
   ============================================ */
function startSession() {
    const nameInput = document.getElementById('clientName');
    if (!nameInput) return;

    const nameValue = nameInput.value.trim();
    if (!nameValue) {
        alert('Por favor ingresa tu nombre');
        return;
    }

    clientName = nameValue;
    localStorage.setItem(CLIENT_STORAGE_KEY, clientName);

    const greetingText = document.getElementById('greetingText');
    if (greetingText) {
        greetingText.innerHTML = `¡Hola <strong>${escapeHtml(clientName)}</strong>! Soy tu asistente virtual.<br>Por favor elige una de las opciones y te ayudaré.`;
    }

    // Restaurar carrito si existe
    loadCart();
    updateCartCount();

    showScreen('screen-menu');
    resetInactivityTimer();

    setTimeout(() => {
        const saludo = `¡Hola ${clientName}! Soy tu asistente virtual. Por favor elige una de las opciones y te ayudaré.`;
        const utterance = new SpeechSynthesisUtterance(saludo);
        utterance.lang = 'es-ES';
        utterance.rate = 0.9;
        utterance.pitch = 1;

        const voces = window.speechSynthesis.getVoices();
        const vozEspanol = voces.find(v => v.lang.includes('es'));
        if (vozEspanol) utterance.voice = vozEspanol;

        window.speechSynthesis.speak(utterance);
    }, 500);
}

/* ============================================
   FINALIZAR SESIÓN
   ============================================ */
function endSession() {
    const farewellName = document.getElementById('farewellName');
    if (farewellName) farewellName.textContent = clientName;
    showScreen('screen-farewell');
    startCountdown();
}

/* ============================================
   CUENTA REGRESIVA
   ============================================ */
function startCountdown() {
    let count = 5;
    const countdownElement = document.getElementById('countdown');
    if (countdownElement) countdownElement.textContent = count;

    if (countdownInterval) clearInterval(countdownInterval);

    countdownInterval = setInterval(() => {
        count--;
        if (countdownElement) countdownElement.textContent = count;
        if (count <= 0) {
            clearInterval(countdownInterval);
            resetToWelcome();
        }
    }, 1000);
}

/* ============================================
   RESETEAR A BIENVENIDA
   ============================================ */
function resetToWelcome() {
    if (countdownInterval) clearInterval(countdownInterval);
    if (inactivityTimer) clearTimeout(inactivityTimer);

    clientName = '';
    cart = [];
    currentSaleNumber = '';
    currentSaleTotal = 0;
    productQuantities = {};
    clearCartStorage();

    const clientNameInput = document.getElementById('clientName');
    if (clientNameInput) clientNameInput.value = '';

    const cartCount = document.getElementById('cartCount');
    if (cartCount) cartCount.textContent = '0';

    showScreen('screen-welcome');

    setTimeout(() => {
        if (clientNameInput) clientNameInput.focus();
    }, 100);
}

/* ============================================
   ABRIR PANTALLA DE COMPRA
   ============================================ */
function openBuyScreen() {
    showScreen('screen-buy');

    const searchInput = document.getElementById('searchInput');
    if (searchInput) searchInput.value = '';

    const productList = document.getElementById('productList');
    if (productList) {
        productList.innerHTML = '<div class="empty-state">Busca productos para agregar a tu compra</div>';
    }

    productQuantities = {};
}

const debouncedSearch = debounce(searchProducts, 300);

/* ============================================
   BUSCAR PRODUCTOS
   ============================================ */
async function searchProducts() {
    const searchInput = document.getElementById('searchInput');
    if (!searchInput) return;

    const query = searchInput.value.trim();
    if (!query) return;

    const productList = document.getElementById('productList');
    if (!productList) return;

    productList.innerHTML = '<div class="loading">🔍 Buscando productos...</div>';
    productQuantities = {};

    try {
        const { data, error } = await db
            .from('productos')
            .select('*')
            .ilike('nombre', `%${query}%`)
            .eq('estado', 'activo');

        if (error) throw error;

        if (data && data.length > 0) {
            allProductsCache = data;
            const products = data.map(p => ({
                id: p.id,
                name: p.nombre,
                price: parseFloat(p.precio),
                stock: p.stock,
                unidad: p.unidad,
                categoria: p.categoria,
                imagen_url: p.imagen_url,
                qty: 1
            }));
            displayProducts(products);
        } else {
            productList.innerHTML = '<div class="empty-state">No se encontraron productos</div>';
        }
    } catch (error) {
        console.error('Error buscando productos:', error);
        productList.innerHTML = '<div class="empty-state">Error de conexión. Intenta de nuevo.</div>';
    }
}

/* ============================================
   MOSTRAR PRODUCTOS (VERSIÓN SEGURA - sin onclick inline)
   ============================================ */
function displayProducts(products) {
    const productList = document.getElementById('productList');
    if (!productList) return;

    if (!products || products.length === 0) {
        productList.innerHTML = '<div class="empty-state">No se encontraron productos</div>';
        return;
    }

    productList.innerHTML = '';
    
    products.forEach((prod) => {
        const nombre = prod.nombre || prod.name || 'Producto sin nombre';
        const precio = prod.precio || prod.price || 0;
        const stock = prod.stock || 0;
        const unidad = prod.unidad || prod.unit || 'unid.';
        const imagen_url = prod.imagen_url || prod.imagen || null;
        const prodId = prod.id || 0;
        const categoria = prod.categoria || 'General';

        const item = document.createElement('div');
        item.className = 'product-item';
        item.dataset.categoria = categoria;
        
        item.innerHTML = `
            <div class="product-image-small">
                ${imagen_url ?
                 `<img src="${escapeHtml(imagen_url)}" alt="${escapeHtml(nombre)}">` :
                 `<div class="no-image-small">📦</div>`
                 }
            </div>
            <div class="product-info">
                <div class="product-name">${escapeHtml(nombre)}</div>
                <div class="product-price">S/ ${parseFloat(precio).toFixed(2)}</div>
                <div class="product-stock">Stock: ${stock} ${stock > 0 ? 'disponible' : 'agotado'}</div>
                <div class="quantity-control">
                    <button class="qty-btn" data-action="decrease" data-id="${prodId}">-</button>
                    <span class="qty-display" id="qty-${prodId}">1</span>
                    <button class="qty-btn" data-action="increase" data-id="${prodId}">+</button>
                </div>
            </div>
            <button class="btn-add" data-action="add" data-id="${prodId}" ${stock === 0 ? 'disabled style="background:#999"' : ''}>
                Agregar
            </button>
        `;
        
        // Event listeners seguros (no inline)
        item.querySelectorAll('.qty-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                vibrate(50);
                const action = btn.dataset.action;
                const id = parseInt(btn.dataset.id);
                if (action === 'increase') increaseQty(id);
                else decreaseQty(id);
            });
        });
        
        const addBtn = item.querySelector('.btn-add');
        if (addBtn && stock > 0) {
            addBtn.addEventListener('click', () => {
                vibrate(100);
                addToCartWithQty(prodId, nombre, precio, stock, categoria);
            });
        }
        
        // Zoom de imagen
        const img = item.querySelector('.product-image-small img');
        if (img) {
            img.addEventListener('click', (e) => {
                openImageZoom(imagen_url, nombre, e);
            });
        }
        
        productList.appendChild(item);
    });
}

/* ============================================
   AUMENTAR / DISMINUIR CANTIDAD
   ============================================ */
function increaseQty(productId) {
    if (!productQuantities[productId]) productQuantities[productId] = 1;
    productQuantities[productId]++;

    const qtyDisplay = document.getElementById(`qty-${productId}`);
    if (qtyDisplay) qtyDisplay.textContent = productQuantities[productId];
}

function decreaseQty(productId) {
    if (!productQuantities[productId]) productQuantities[productId] = 1;

    if (productQuantities[productId] > 1) {
        productQuantities[productId]--;
        const qtyDisplay = document.getElementById(`qty-${productId}`);
        if (qtyDisplay) qtyDisplay.textContent = productQuantities[productId];
    }
}


/* ============================================
   CANTIDADES PARA MODAL (COTIZACIÓN)
   ============================================ */
function increaseModalQty(safeId) {
    if (!modalQuantities[safeId]) modalQuantities[safeId] = 1;
    modalQuantities[safeId]++;
    const qtyDisplay = document.getElementById(`qty-${safeId}`);
    if (qtyDisplay) qtyDisplay.textContent = modalQuantities[safeId];
}

function decreaseModalQty(safeId) {
    if (!modalQuantities[safeId]) modalQuantities[safeId] = 1;
    if (modalQuantities[safeId] > 1) {
        modalQuantities[safeId]--;
        const qtyDisplay = document.getElementById(`qty-${safeId}`);
        if (qtyDisplay) qtyDisplay.textContent = modalQuantities[safeId];
    }
}

function addToCartModal(safeId, productId, name, price, stock, categoria) {
    const qty = modalQuantities[safeId] || 1;

    const existing = cart.find(item => item.name === name);
    const qtyEnCarrito = existing ? existing.qty : 0;

    if (stock !== undefined && qty + qtyEnCarrito > stock) {
        showToast(`❌ Stock insuficiente. Solo hay ${stock} disponible(s).`);
        return;
    }

    if (existing) {
        existing.qty += qty;
    } else {
        cart.push({ name, price, qty: qty, categoria: categoria || 'General' });
    }

    updateCartCount();
    saveCart();
    resetInactivityTimer();

    showToast(`${escapeHtml(name)} x${qty} agregado al carrito`);
    mostrarSugerencias(categoria, name);

    modalQuantities[safeId] = 1;
    const qtyDisplay = document.getElementById(`qty-${safeId}`);
    if (qtyDisplay) qtyDisplay.textContent = '1';
}

/* ============================================
   AGREGAR AL CARRITO CON CANTIDAD
   ============================================ */
function addToCartWithQty(productId, name, price, stock, categoria) {
    const qty = productQuantities[productId] || 1;

    const existing = cart.find(item => item.name === name);
    const qtyEnCarrito = existing ? existing.qty : 0;

    if (stock !== undefined && qty + qtyEnCarrito > stock) {
        showToast(`❌ Stock insuficiente. Solo hay ${stock} disponible(s).`);
        return;
    }

    if (existing) {
        existing.qty += qty;
    } else {
        cart.push({ name, price, qty: qty, categoria: categoria || 'General' });
    }

    updateCartCount();
    saveCart();
    resetInactivityTimer();

    showToast(`${escapeHtml(name)} x${qty} agregado al carrito`);

    // Mostrar sugerencias
    mostrarSugerencias(categoria, name);

    productQuantities[productId] = 1;
    const qtyDisplay = document.getElementById(`qty-${productId}`);
    if (qtyDisplay) qtyDisplay.textContent = '1';
}

/* ============================================
   SUGERENCIAS INTELIGENTES
   ============================================ */
function mostrarSugerencias(categoria, nombreActual) {
    if (!allProductsCache || allProductsCache.length === 0) return;

    const sugerencias = allProductsCache.filter(p =>
        p.categoria === categoria &&
        p.nombre !== nombreActual &&
        p.estado === 'activo' &&
        p.stock > 0 &&
        !cart.find(c => c.name === p.nombre)
    ).slice(0, 2);

    if (sugerencias.length === 0) return;

    const nombres = sugerencias.map(s => s.nombre).join(' y ');
    setTimeout(() => {
        showToast(`💡 ¿También necesitas ${escapeHtml(nombres)}?`);
    }, 800);
}

/* ============================================
   ACTUALIZAR CONTADOR DEL CARRITO
   ============================================ */
function updateCartCount() {
    const count = cart.reduce((sum, item) => sum + item.qty, 0);
    const cartCount = document.getElementById('cartCount');
    if (cartCount) cartCount.textContent = count;
}

/* ============================================
   MOSTRAR CARRITO
   ============================================ */
function showCart() {
    if (cart.length === 0) {
        alert('Tu carrito está vacío');
        return;
    }

    const cartSummary = document.getElementById('cartSummary');
    if (!cartSummary) return;

    let total = 0;
    cartSummary.innerHTML = cart.map((item) => {
        const itemTotal = item.price * item.qty;
        total += itemTotal;
        return `
            <div class="cart-item">
                <div class="cart-item-info">
                    <div class="cart-item-name">${escapeHtml(item.name)}</div>
                    <div class="cart-item-qty">Cantidad: ${item.qty}</div>
                </div>
                <div class="cart-item-price">S/ ${itemTotal.toFixed(2)}</div>
            </div>
        `;
    }).join('');

    cartSummary.innerHTML += `
        <div class="cart-total">
            <span>TOTAL:</span>
            <span>S/ ${total.toFixed(2)}</span>
        </div>
    `;

    showScreen('screen-cart');
}

/* ============================================
   CONFIRMAR COMPRA (TRANSACCIÓN ATÓMICA)
   ============================================ */
async function confirmPurchase() {
    if (cart.length === 0) return;
    if (isProcessingPurchase) return;
    if (!rateLimit('confirm_purchase', 3000)) return; // Anti-spam
    isProcessingPurchase = true;

    const confirmBtn = document.querySelector('#screen-cart .btn-metal.primary');
    const originalText = confirmBtn ? confirmBtn.innerHTML : 'Confirmar compra';

    if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.innerHTML = '⏳ Procesando...';
    }

    const saleNumber = 'VTA-' + Date.now().toString().slice(-6);
    const total = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
    const productsList = cart.map(item => `${item.qty} x ${item.name} (S/ ${(item.price * item.qty).toFixed(2)})`).join(', ');
    
    const itemsJson = cart.map(item => ({
        nombre: item.name,
        cantidad: item.qty
    }));

    currentSaleNumber = saleNumber;
    currentSaleTotal = total;

    try {
        const { data, error } = await db.rpc('registrar_venta_con_stock', {
            p_numero_venta: saleNumber,
            p_fecha: new Date().toISOString().split('T')[0],
            p_hora: new Date().toTimeString().split(' ')[0],
            p_cliente: clientName,
            p_productos: productsList,
            p_total: total,
            p_items: itemsJson
        });

        if (error) throw error;
        
        if (data && data.success) {
            const saleNumberDisplay = document.getElementById('saleNumber');
            if (saleNumberDisplay) saleNumberDisplay.textContent = saleNumber;

            const confirmationDetails = document.getElementById('confirmationDetails');
            if (confirmationDetails) {
                confirmationDetails.innerHTML = `
                    <strong>Cliente:</strong> ${escapeHtml(clientName)}<br>
                    <strong>Productos:</strong> ${escapeHtml(productsList)}<br>
                    <strong>Total a pagar:</strong> S/ ${total.toFixed(2)}
                `;
            }

            showScreen('screen-confirmation');
            enviarNotificacionWhatsApp(saleNumber, total);
        } else {
            throw new Error(data?.error || 'Error en la transacción');
        }

    } catch (error) {
        console.error('Error:', error);
        showToast('⚠️ Error al procesar: ' + error.message);
    } finally {
        if (confirmBtn) {
            confirmBtn.disabled = false;
            confirmBtn.innerHTML = originalText;
        }
        isProcessingPurchase = false;
        clearCartStorage();
    }
}


/* ============================================
   WHATSAPP - NOTIFICACIÓN AL ADMIN
   ============================================ */
function enviarNotificacionWhatsApp(numeroVenta, total) {
    if (!negocioConfig.whatsapp) return;

    const mensaje = `🔔 *Nueva Venta en Quiosco*%0A%0A` +
        `📋 N°: ${numeroVenta}%0A` +
        `👤 Cliente: ${clientName || 'Walk-In'}%0A` +
        `💰 Total: S/ ${total.toFixed(2)}%0A` +
        `⏰ ${new Date().toLocaleString('es-PE')}%0A%0A` +
        `Estado: PENDIENTE DE PAGO`;

    // En un entorno real esto se haría desde backend.
    // Por ahora, si el dispositivo lo permite, abrimos wa.me en background
    const waLink = `https://wa.me/${limpiarNumeroWhatsApp(negocioConfig.whatsapp)}?text=${mensaje}`;

    // Solo notificar si es un dispositivo que puede manejarlo (no ideal en quiosco público)
    // Mejor: guardar en BD y que el admin tenga un botón para ver notificaciones
    console.log('Notificación WhatsApp lista:', waLink);
}

function limpiarNumeroWhatsApp(numero) {
    return numero.toString().replace(/\D/g, '');
}

/* ============================================
WHATSAPP - COMPARTIR COMPROBANTE (MEJORADO)
============================================ */
function compartirWhatsAppComprobante() {
    if (!currentSaleNumber) {
        showToast('❌ No hay comprobante para compartir');
        return;
    }
    
    // Abrir modal personalizado en lugar de prompt
    const modalWa = document.getElementById('whatsappModal');
    const inputWa = document.getElementById('whatsappNumberInput');
    
    if (modalWa) {
        modalWa.classList.add('active');
        if (inputWa) {
            inputWa.value = '51'; // Código de Perú por defecto
            inputWa.focus();
        }
    } else {
        // Fallback si no existe el modal
        const numeroDestino = prompt('Ingresa tu número de WhatsApp (ej: 51999123456):');
        if (!numeroDestino) return;
        enviarWhatsApp(numeroDestino);
    }
}

function enviarWhatsApp(numeroDestino) {
    const numeroLimpio = limpiarNumeroWhatsApp(numeroDestino);
    
    // Validar número (mínimo 11 dígitos: 51 + 9 dígitos)
    if (numeroLimpio.length < 11) {
        showToast('❌ Número inválido. Debe tener 11 dígitos (51 + 9 dígitos)');
        return;
    }
    
    // Agregar código de país si no lo tiene
    let numeroFinal = numeroLimpio;
    if (!numeroLimpio.startsWith('51') && numeroLimpio.length === 9) {
        numeroFinal = '51' + numeroLimpio;
    }
    
    // Construir el mensaje
    const fecha = new Date().toLocaleDateString('es-PE');
    const hora = new Date().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
    const negocioNombre = negocioConfig.nombre_negocio || 'Ferretería';
    
    let mensaje = `🧾 *COMPROBANTE DE COMPRA*\n\n`;
    mensaje += `🏪 *${negocioNombre}*\n`;
    mensaje += `📋 N°: ${currentSaleNumber}\n`;
    mensaje += `📅 Fecha: ${fecha} ${hora}\n`;
    mensaje += `👤 Cliente: ${clientName || 'Walk-In'}\n\n`;
    mensaje += `*Productos:*\n`;
    
    cart.forEach(item => {
        mensaje += `• ${item.name} x${item.qty} = S/ ${(item.price * item.qty).toFixed(2)}\n`;
    });
    
    mensaje += `\n💰 *TOTAL: S/ ${currentSaleTotal.toFixed(2)}*\n\n`;
    mensaje += `Presente este mensaje en caja para completar su compra.`;
    
    // Codificar el mensaje para URL
    const mensajeCodificado = encodeURIComponent(mensaje);
    const waLink = `https://wa.me/${numeroFinal}?text=${mensajeCodificado}`;
    
    // Cerrar modal si existe
    const modalWa = document.getElementById('whatsappModal');
    if (modalWa) modalWa.classList.remove('active');
    
    // Intentar abrir WhatsApp directamente
    try {
        // Método 1: window.location (más confiable)
        window.location.href = waLink;
        
        // Método 2: setTimeout como respaldo
        setTimeout(() => {
            // Si después de 2 segundos no se abrió, copiar al portapapeles
            navigator.clipboard.writeText(mensaje).then(() => {
                showToast('📋 Si WhatsApp no se abrió, el mensaje fue copiado. Pégalo en WhatsApp.');
            }).catch(() => {
                showToast('⚠️ Copia el mensaje manualmente y pégalo en WhatsApp');
            });
        }, 2000);
    } catch (error) {
        console.error('Error abriendo WhatsApp:', error);
        // Fallback: copiar al portapapeles
        navigator.clipboard.writeText(mensaje).then(() => {
            showToast('📋 Mensaje copiado. Abre WhatsApp y pégalo.');
        }).catch(() => {
            showToast('⚠️ No se pudo copiar. Abre WhatsApp manualmente.');
        });
    }
}

function cerrarModalWhatsApp() {
    const modalWa = document.getElementById('whatsappModal');
    if (modalWa) modalWa.classList.remove('active');
}

/* ============================================
   WHATSAPP - LLAMAR VENDEDOR
   ============================================ */
function llamarVendedor() {
    const numero = negocioConfig.whatsapp || negocioConfig.telefono;
    if (!numero) {
        showToast('⚠️ Número de contacto no configurado. Acércate a caja.');
        return;
    }

    const numeroLimpio = limpiarNumeroWhatsApp(numero);
    const mensaje = `Hola, soy *${clientName || 'un cliente'}* y necesito ayuda en el quiosco virtual.`;
    const waLink = `https://wa.me/${numeroLimpio}?text=${encodeURIComponent(mensaje)}`;

    const newWindow = window.open(waLink, '_blank');
    if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
        showToast('📋 Abriendo WhatsApp... Si no funciona, acércate a caja.');
    }
}

/* ============================================
   IMPRIMIR COMPROBANTE
   ============================================ */
function printTicket() {
    if (!currentSaleNumber) return;

    const fecha = new Date().toLocaleDateString('es-PE');
    const hora = new Date().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
    const productsList = cart.length > 0 ? cart : [];
    const negocioNombre = escapeHtml(negocioConfig.nombre_negocio || 'FERRETERÍA EL CONSTRUCTOR');

    const printWindow = window.open('', '_blank');
    printWindow.document.write(`<!DOCTYPE html><html><head><title>Comprobante ${currentSaleNumber}</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Courier New',monospace;padding:20px;max-width:300px;margin:0 auto;background:white;color:#000}.header{text-align:center;border-bottom:2px dashed #000;padding-bottom:15px;margin-bottom:15px}.header h1{font-size:16px;margin-bottom:5px}.header h2{font-size:12px;font-weight:normal}.header p{font-size:11px;margin-top:5px}.info{font-size:11px;margin-bottom:15px;border-bottom:2px dashed #000;padding-bottom:10px}.info p{margin-bottom:3px}.products{font-size:11px;margin-bottom:15px;border-bottom:2px dashed #000;padding-bottom:10px}.product-row{display:flex;justify-content:space-between;margin-bottom:5px}.product-name{flex:1}.product-qty{width:40px;text-align:center}.product-price{width:70px;text-align:right}.totals{font-size:13px;margin-bottom:15px}.total-row{display:flex;justify-content:space-between;margin-bottom:5px}.total-final{font-size:16px;font-weight:bold;border-top:2px solid #000;padding-top:10px;margin-top:10px}.footer{text-align:center;font-size:10px;border-top:2px dashed #000;padding-top:15px}.footer p{margin-bottom:5px}@media print{body{padding:10px}}</style></head><body><div class="header"><h1>${negocioNombre}</h1><p>${escapeHtml(negocioConfig.direccion || 'Av. Principal 123')}</p><p>Tel: ${escapeHtml(negocioConfig.telefono || '(01) 234-5678')}</p></div><div class="info"><p><strong>COMPROBANTE DE COMPRA</strong></p><p>N°: ${currentSaleNumber}</p><p>Fecha: ${fecha}</p><p>Hora: ${hora}</p><p>Cliente: ${escapeHtml(clientName || 'Walk-In')}</p><p>Estado: PENDIENTE DE PAGO</p></div><div class="products"><div class="product-row" style="font-weight:bold;border-bottom:1px solid #000;padding-bottom:5px;margin-bottom:5px"><span class="product-name">Producto</span><span class="product-qty">Cant</span><span class="product-price">Total</span></div>${productsList.map(item => `<div class="product-row"><span class="product-name">${escapeHtml(item.name)}</span><span class="product-qty">${item.qty}</span><span class="product-price">S/ ${(item.price * item.qty).toFixed(2)}</span></div>`).join('')}</div><div class="totals"><div class="total-row"><span>Sub Total:</span><span>S/ ${(currentSaleTotal / 1.18).toFixed(2)}</span></div><div class="total-row"><span>IGV (18%):</span><span>S/ ${(currentSaleTotal - currentSaleTotal / 1.18).toFixed(2)}</span></div><div class="total-row total-final"><span>TOTAL:</span><span>S/ ${currentSaleTotal.toFixed(2)}</span></div></div><div class="footer"><p>Presente este comprobante en caja</p><p>para completar su compra</p><p style="margin-top:10px">¡Gracias por su compra!</p></div><script>window.onload=function(){setTimeout(function(){window.print();setTimeout(function(){window.close();},500);},500)}</script></body></html>`);
    printWindow.document.close();
}

/* ============================================
   ABRIR / CERRAR MODAL
   ============================================ */
function openModal(module) {
    currentModule = module;
    clearInactivityTimer();

    const modal = document.getElementById('modal');
    if (modal) modal.classList.add('active');

    const response = document.getElementById('response');
    if (response) response.style.display = 'none';

    const userInput = document.getElementById('userInput');
    if (userInput) userInput.value = '';

    const sendBtn = document.getElementById('sendBtn');
    if (sendBtn) sendBtn.disabled = false;

    const titles = {
        'cotizar': 'Cotizar Productos',
        'precio': 'Consultar Precio',
        'asesor': 'Asesoría IA'
    };

    const modalTitle = document.getElementById('modalTitle');
    if (modalTitle) modalTitle.textContent = titles[module] || 'Asistente IA';
}

function closeModal() {
    const modal = document.getElementById('modal');
    if (modal) modal.classList.remove('active');

    if (recognition && isListening) recognition.stop();

    resetInactivityTimer();
}

/* ============================================
   VOZ
   ============================================ */
function toggleVoice() {
    if (!recognition) {
        alert('Tu navegador no soporta reconocimiento de voz. Usa Chrome o Edge.');
        return;
    }
    if (isListening) stopListening(); else startListening();
}

function startListening() {
    if (recognition) recognition.start();
    isListening = true;
    const voiceBtn = document.getElementById('voiceBtn');
    if (voiceBtn) voiceBtn.classList.add('listening');
    const userInput = document.getElementById('userInput');
    if (userInput) userInput.placeholder = 'Escuchando...';
}

function stopListening() {
    if (recognition) recognition.stop();
    isListening = false;
    const voiceBtn = document.getElementById('voiceBtn');
    if (voiceBtn) voiceBtn.classList.remove('listening');
    const userInput = document.getElementById('userInput');
    if (userInput) userInput.placeholder = 'Escribe o usa el micrófono...';
}

/* ============================================
   ENVIAR PREGUNTA A LA IA
   ============================================ */
async function sendQuestion() {
    if (!rateLimit('ia_question', 5000)) return; // 5 segundos entre preguntas
    const userInput = document.getElementById('userInput');
    if (!userInput) return;

    const question = userInput.value.trim();
    if (!question) return;

    const responseDiv = document.getElementById('response');
    const responseContent = document.getElementById('responseContent');
    const responseActions = document.getElementById('responseActions');
    const sendBtn = document.getElementById('sendBtn');

    if (responseDiv) responseDiv.style.display = 'block';
    if (responseContent) responseContent.innerHTML = '<div class="loading">🤖 La IA está pensando...</div>';
    if (responseActions) responseActions.style.display = 'none';
    if (sendBtn) sendBtn.disabled = true;

    try {
        const { data: productos, error: productosError } = await db
            .from('productos')
            .select('id, nombre, categoria, precio, stock, unidad, imagen_url')
            .eq('estado', 'activo');

        let contextoInventario = '';
        if (productos && productos.length > 0) {
            contextoInventario = productos.map(p =>
                `- ${p.nombre} (${p.categoria}): S/ ${p.precio} por ${p.unidad} - Stock: ${p.stock}`
            ).join('\n');
        }

        const response = await fetch('https://tpdstpnvsyqcvsfminip.supabase.co/functions/v1/asesor-ia', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer sb_publishable_ZCntTGwCbMRC2A-pL0d8vQ_GwMiH1bt'
            },
            body: JSON.stringify({
                pregunta: question,
                contexto: contextoInventario
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Error en la respuesta de la IA');
        }

        currentResponse = data.respuesta;
        currentAudio = data.audio;

        if (responseContent) {
            responseContent.innerHTML = escapeHtml(currentResponse).replace(/\n/g, '<br>');
        }

        const query = question.toLowerCase();
        const palabras = query.split(/\s+/).filter(p => p.length > 2);

        const productosFiltrados = productos.filter(p => {
            const nombre = p.nombre.toLowerCase();
            const categoria = (p.categoria || '').toLowerCase();

            if (palabras.length > 0) {
                const todasCoinciden = palabras.every(palabra =>
                    nombre.includes(palabra) || categoria.includes(palabra)
                );
                return todasCoinciden;
            }

            return nombre.includes(query) || categoria.includes(query);
        }).sort((a, b) => {
            const aNombre = a.nombre.toLowerCase();
            const bNombre = b.nombre.toLowerCase();
            if (aNombre.includes(query) && !bNombre.includes(query)) return -1;
            if (!aNombre.includes(query) && bNombre.includes(query)) return 1;
            return 0;
        });

        const responseProducts = document.getElementById('responseProducts');
        if (responseProducts) {
            if (productosFiltrados.length > 0) {
                responseProducts.style.display = 'block';

                // Resetear cantidades del modal
                modalQuantities = {};

                responseProducts.innerHTML = productosFiltrados.map((prod) => {
                    const safeId = 'modal_' + prod.id;
                    modalQuantities[safeId] = 1;
                    return `
                    <div class="product-item">
                        <div class="product-image-small">
                            ${prod.imagen_url ?
                           `<img src="${escapeHtml(prod.imagen_url)}" alt="${escapeHtml(prod.nombre)}" onclick="openImageZoom('${escapeHtml(prod.imagen_url)}', '${escapeHtml(prod.nombre).replace(/'/g, "\\'")}', event)">` :
                           `<div class="no-image-small">📦</div>`
                             }
                        </div>
                        <div class="product-info">
                            <div class="product-name">${escapeHtml(prod.nombre)}</div>
                            <div class="product-price">S/ ${parseFloat(prod.precio).toFixed(2)}</div>
                            <div class="product-stock">Stock: ${prod.stock} ${prod.stock > 0 ? 'disponible' : 'agotado'}</div>
                            <div class="quantity-control">
                                <button class="qty-btn" onclick="vibrate(50); decreaseModalQty('${safeId}')">-</button>
                                <span class="qty-display" id="qty-${safeId}">1</span>
                                <button class="qty-btn" onclick="vibrate(50); increaseModalQty('${safeId}')">+</button>
                            </div>
                        </div>
                        <button class="btn-add" onclick="vibrate(100); addToCartModal('${safeId}', ${prod.id}, '${escapeHtml(prod.nombre).replace(/'/g, "\\'")}', ${prod.precio}, ${prod.stock}, '${escapeHtml(prod.categoria || 'General').replace(/'/g, "\\'")}')" ${prod.stock === 0 ? 'disabled' : ''}>
                            Agregar
                        </button>
                    </div>
                `}).join('');

                setTimeout(() => {
                    const chatContainer = document.querySelector('.chat-container');
                    if (chatContainer) {
                        chatContainer.scrollTo({ top: chatContainer.scrollHeight, behavior: 'smooth' });
                    }
                }, 600);

            } else {
                responseProducts.style.display = 'none';
            }
        }

        if (responseActions) responseActions.style.display = 'flex';

        if (currentAudio) playElevenLabsAudio(currentAudio);

    } catch (error) {
        console.error('Error:', error);
        if (responseContent) {
            responseContent.innerHTML = '<div class="error">❌ Error de conexión con la IA. Intenta de nuevo.</div>';
        }
    } finally {
        if (sendBtn) sendBtn.disabled = false;
    }
}

/* ============================================
   AUDIO / VOZ
   ============================================ */
function playElevenLabsAudio(audioBase64) {
    if (!audioBase64) return;
    const audio = new Audio(audioBase64);
    const speakingIndicator = document.getElementById('speakingIndicator');
    if (speakingIndicator) speakingIndicator.classList.add('active');

    audio.onended = () => {
        if (speakingIndicator) speakingIndicator.classList.remove('active');
    };

    audio.play().catch(error => {
        console.error('Error reproduciendo audio:', error);
        if (speakingIndicator) speakingIndicator.classList.remove('active');
    });
}

function speakResponse() {
    if (!currentResponse) return;
    if (currentAudio) { playElevenLabsAudio(currentAudio); return; }

    window.speechSynthesis.cancel();
    let cleanText = currentResponse
        .replace(/\*\*/g, '').replace(/\*/g, '').replace(/__/g, '').replace(/_/g, '')
        .replace(/#{1,6}\s/g, '').replace(/`/g, '').replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1');

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = 'es-ES';
    utterance.rate = 0.9;

    utterance.onstart = () => {
        const speakingIndicator = document.getElementById('speakingIndicator');
        if (speakingIndicator) speakingIndicator.classList.add('active');
    };
    utterance.onend = () => {
        const speakingIndicator = document.getElementById('speakingIndicator');
        if (speakingIndicator) speakingIndicator.classList.remove('active');
    };
    utterance.onerror = () => {
        const speakingIndicator = document.getElementById('speakingIndicator');
        if (speakingIndicator) speakingIndicator.classList.remove('active');
    };

    window.speechSynthesis.speak(utterance);
}

/* ============================================
   IMPRIMIR COTIZACIÓN
   ============================================ */
function printQuote() {
    if (!currentResponse) return;

    const fecha = new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' });
    const numeroCotizacion = 'COT-' + Date.now().toString().slice(-6);
    const negocioNombre = escapeHtml(negocioConfig.nombre_negocio || 'Ferretería El Constructor');

    const cartItems = cart.map(item => ({
        name: item.name,
        price: item.price,
        qty: item.qty,
        subtotal: item.price * item.qty
    }));

    const total = cartItems.reduce((sum, item) => sum + item.subtotal, 0);

    const printFrame = document.createElement('iframe');
    printFrame.id = 'quotePrintFrame';
    printFrame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
    document.body.appendChild(printFrame);

    printFrame.contentDocument.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Cotización ${numeroCotizacion}</title>
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; font-family: Arial, sans-serif; }
                body { padding: 40px; background: white; color: #333; }
                .header { display: flex; justify-content: space-between; margin-bottom: 30px; border-bottom: 3px solid #4a5568; padding-bottom: 20px; }
                .logo { font-size: 32px; font-weight: bold; color: #4a5568; }
                .company-name { font-size: 24px; color: #2d3748; }
                .tagline { font-size: 14px; color: #718096; }
                .quote-info { text-align: right; }
                .quote-number { font-size: 18px; font-weight: bold; color: #4a5568; }
                .date { font-size: 14px; color: #718096; margin-top: 5px; }
                .client-info { margin-bottom: 30px; padding: 15px; background: #f7fafc; border-left: 4px solid #4a5568; border-radius: 5px; }
                .client-label { font-size: 12px; color: #718096; text-transform: uppercase; }
                .client-name { font-size: 16px; color: #2d3748; font-weight: 600; margin-top: 5px; }
                .products-table { margin: 30px 0; }
                .products-title { font-size: 18px; color: #2d3748; margin-bottom: 15px; font-weight: 600; }
                table { width: 100%; border-collapse: collapse; }
                th { background: #4a5568; color: white; padding: 12px; text-align: left; font-weight: 600; }
                td { padding: 12px; border-bottom: 1px solid #e2e8f0; }
                tr:nth-child(even) { background: #f7fafc; }
                .text-right { text-align: right; }
                .total-row { font-weight: bold; font-size: 18px; background: #edf2f7 !important; }
                .footer { margin-top: 50px; padding-top: 20px; border-top: 2px solid #e2e8f0; font-size: 14px; color: #718096; }
                .phone { margin-top: 10px; }
            </style>
        </head>
        <body>
            <div class="header">
                <div>
                    <div class="logo">FC</div>
                    <div class="company-name">${negocioNombre}</div>
                    <div class="tagline">Tu socio en construcción</div>
                </div>
                <div class="quote-info">
                    <div class="quote-number">N°: ${numeroCotizacion}</div>
                    <div class="date">Fecha: ${fecha}</div>
                </div>
            </div>
            <div class="client-info">
                <div class="client-label">Cliente</div>
                <div class="client-name">${escapeHtml(clientName || 'Cliente General')}</div>
            </div>
            ${cartItems.length > 0 ? `
            <div class="products-table">
                <div class="products-title">📋 Productos Cotizados</div>
                <table>
                    <thead>
                        <tr><th>Producto</th><th class="text-right">Cantidad</th><th class="text-right">Precio Unit.</th><th class="text-right">Subtotal</th></tr>
                    </thead>
                    <tbody>
                        ${cartItems.map(item => `
                            <tr>
                                <td>${escapeHtml(item.name)}</td>
                                <td class="text-right">${item.qty}</td>
                                <td class="text-right">S/ ${item.price.toFixed(2)}</td>
                                <td class="text-right">S/ ${item.subtotal.toFixed(2)}</td>
                            </tr>
                        `).join('')}
                        <tr class="total-row">
                            <td colspan="3" class="text-right">TOTAL:</td>
                            <td class="text-right">S/ ${total.toFixed(2)}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
            ` : '<div style="margin: 20px 0; padding: 15px; background: #fff5f5; border-left: 4px solid #fc8181; border-radius: 5px; color: #c53030;">No hay productos agregados al carrito</div>'}
            <div class="footer">
                <div>Gracias por preferirnos</div>
                <div class="phone">📞 ${escapeHtml(negocioConfig.telefono || '(01) 234-5678')}</div>
                <div style="margin-top: 10px; font-size: 12px;">Esta cotización tiene una validez de 7 días</div>
            </div>
            <script>
                window.onload = function() {
                    setTimeout(function() {
                        window.print();
                        setTimeout(function() {
                            var frame = window.parent.document.getElementById('quotePrintFrame');
                            if (frame) window.parent.document.body.removeChild(frame);
                        }, 1000);
                    }, 500);
                };
            <\/script>
        </body>
        </html>
    `);
    printFrame.contentDocument.close();
}

/* ============================================
   TOAST
   ============================================ */
function showToast(message) {
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toastMessage');
    if (!toast || !toastMessage) return;

    toastMessage.textContent = message;
    toast.classList.remove('hide');
    toast.classList.add('show');
    vibrate(100);

    setTimeout(() => {
        toast.classList.remove('show');
        toast.classList.add('hide');
    }, 3000);
}

/* ============================================
   MODO OSCURO / CLARO
   ============================================ */
function toggleTheme() {
    const body = document.body;
    const themeToggle = document.getElementById('themeToggle');

    if (body.classList.contains('light-mode')) {
        body.classList.remove('light-mode');
        localStorage.setItem('theme', 'dark');
        if (themeToggle) themeToggle.textContent = '🌓';
    } else {
        body.classList.add('light-mode');
        localStorage.setItem('theme', 'light');
        if (themeToggle) themeToggle.textContent = '🌙';
    }
}

/* ============================================
   CARGAR CONFIGURACIÓN DEL NEGOCIO
   ============================================ */
async function cargarConfigDesdeQuiosco() {
    try {
        const { data, error } = await db
            .from('config_negocio')
            .select('*')
            .single();

        if (error) {
            console.log('No hay configuración personalizada');
            return;
        }

        if (data) {
            negocioConfig = data;

            if (data.logo_url) {
                const logos = document.querySelectorAll('.logo-3d img');
                logos.forEach(img => {
                    img.src = data.logo_url;
                    img.style.opacity = '1';
                });
            }

            if (data.nombre_negocio) {
                const titulos = document.querySelectorAll('.kiosk-title');
                titulos.forEach(titulo => {
                    if (titulo.textContent.includes('BIENVENIDO')) {
                        titulo.innerHTML = `BIENVENIDO A LA<br>${escapeHtml(data.nombre_negocio.toUpperCase())}`;
                    }
                });
            }
        }
    } catch (error) {
        console.log('Error cargando config:', error.message);
    }
}

/* ============================================
   ZOOM DE IMAGEN
   ============================================ */
function openImageZoom(imageUrl, productName, evt) {
    if (evt) evt.stopPropagation();
    const modal = document.getElementById('imageZoomModal');
    const zoomedImage = document.getElementById('zoomedImage');
    const zoomedName = document.getElementById('zoomedImageName');

    if (modal && zoomedImage) {
        zoomedImage.src = imageUrl;
        zoomedName.textContent = productName || '';
        modal.style.display = 'flex';
        modal.classList.add('active');
    }
}

function closeImageZoom() {
    const modal = document.getElementById('imageZoomModal');
    if (modal) {
        modal.style.display = 'none';
        modal.classList.remove('active');
    }
}

document.addEventListener('click', function(e) {
    const modal = document.getElementById('imageZoomModal');
    if (modal && e.target === modal) closeImageZoom();
});

document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') closeImageZoom();
});
