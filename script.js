/* ============================================
   CONFIGURACIÓN DE SUPABASE
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

/* ============================================
   VIBRACIÓN AL TOCAR
   ============================================ */
function vibrate(duration = 50) {
    if ('vibrate' in navigator) {
        navigator.vibrate(duration);
    }
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
        document.getElementById('userInput').value = event.results[0][0].transcript;
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
    if (voiceBtn) {
        voiceBtn.style.display = 'none';
    }
}

/* ============================================
   EVENTOS DEL TECLADO
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
    
    const modal = document.getElementById('modal');
    if (modal) {
        modal.addEventListener('click', function(e) {
            if (e.target === this) closeModal();
        });
    }
});

/* ============================================
   NAVEGACIÓN ENTRE PANTALLAS
   ============================================ */
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
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
    const greetingText = document.getElementById('greetingText');
    if (greetingText) {
        greetingText.innerHTML = `¡Hola <strong>${clientName}</strong>! Soy tu asistente virtual.<br>Por favor elige una de las opciones y te ayudaré.`;
    }
    
    showScreen('screen-menu');
    
    // Saludo por voz automático
    setTimeout(() => {
        const saludo = `¡Hola ${clientName}! Soy tu asistente virtual. Por favor elige una de las opciones y te ayudaré.`;
        const utterance = new SpeechSynthesisUtterance(saludo);
        utterance.lang = 'es-ES';
        utterance.rate = 0.9;
        utterance.pitch = 1;
        
        const voces = window.speechSynthesis.getVoices();
        const vozEspanol = voces.find(v => v.lang.includes('es'));
        if (vozEspanol) {
            utterance.voice = vozEspanol;
        }
        
        window.speechSynthesis.speak(utterance);
    }, 500);
}

/* ============================================
   FINALIZAR SESIÓN
   ============================================ */
function endSession() {
    const farewellName = document.getElementById('farewellName');
    if (farewellName) {
        farewellName.textContent = clientName;
    }
    
    showScreen('screen-farewell');
    startCountdown();
}

/* ============================================
   CUENTA REGRESIVA
   ============================================ */
function startCountdown() {
    let count = 5;
    const countdownElement = document.getElementById('countdown');
    if (countdownElement) {
        countdownElement.textContent = count;
    }
    
    if (countdownInterval) clearInterval(countdownInterval);
    
    countdownInterval = setInterval(() => {
        count--;
        if (countdownElement) {
            countdownElement.textContent = count;
        }
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
    
    clientName = '';
    cart = [];
    currentSaleNumber = '';
    currentSaleTotal = 0;
    productQuantities = {};
    
    const clientNameInput = document.getElementById('clientName');
    if (clientNameInput) {
        clientNameInput.value = '';
    }
    
    const cartCount = document.getElementById('cartCount');
    if (cartCount) {
        cartCount.textContent = '0';
    }
    
    showScreen('screen-welcome');
    
    setTimeout(() => {
        if (clientNameInput) {
            clientNameInput.focus();
        }
    }, 100);
}

/* ============================================
   ABRIR PANTALLA DE COMPRA
   ============================================ */
function openBuyScreen() {
    showScreen('screen-buy');
    
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.value = '';
    }
    
    const productList = document.getElementById('productList');
    if (productList) {
        productList.innerHTML = '<div class="empty-state">Busca productos para agregar a tu compra</div>';
    }
    
    productQuantities = {};
}

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
    
    productList.innerHTML = '<div class="loading"> Buscando productos...</div>';
    productQuantities = {};
    
    try {
        const { data, error } = await db
            .from('productos')
            .select('*')
            .ilike('nombre', `%${query}%`)
            .eq('estado', 'activo');
        
        if (error) throw error;
        
        if (data && data.length > 0) {
            const products = data.map(p => ({
                id: p.id,
                name: p.nombre,
                price: parseFloat(p.precio),
                stock: p.stock,
                unidad: p.unidad,
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
   MOSTRAR PRODUCTOS
   ============================================ */
function displayProducts(products) {
    const productList = document.getElementById('productList');
    if (!productList) return;
   console.log('Productos en displayProducts:', products);
   if (products && products.length > 0) {
      console.log('Primer producto:', products[0]);
   }
    
    if (!products || products.length === 0) {
        productList.innerHTML = '<div class="empty-state">No se encontraron productos</div>';
        return;
    }
    
    productList.innerHTML = products.map((prod, idx) => {
        // Verificar que existan los campos
        const nombre = prod.nombre || prod.name || 'Producto sin nombre';
        const precio = prod.precio || prod.price || 0;
        const stock = prod.stock || 0;
        const unidad = prod.unidad || prod.unit || 'unid.';
        const imagen_url = prod.imagen_url || prod.imagen || null;
        
        return `
        <div class="product-item">
            <div class="product-image-small">
                ${imagen_url ? 
                 `<img src="${imagen_url}" alt="${nombre}" onclick="openImageZoom('${imagen_url}', '${nombre.replace(/'/g, "\\'")}')">` : 
                 `<div class="no-image-small"></div>`
                 }
            </div>
            <div class="product-info">
                <div class="product-name">${nombre}</div>
                <div class="product-price">S/ ${parseFloat(precio).toFixed(2)}</div>
                <div class="product-stock">Stock: ${stock} ${stock > 0 ? 'disponible' : 'agotado'}</div>
                <div class="quantity-control">
                    <button class="qty-btn" onclick="vibrate(50); decreaseQty(${idx})">-</button>
                    <span class="qty-display" id="qty-${idx}">1</span>
                    <button class="qty-btn" onclick="vibrate(50); increaseQty(${idx})">+</button>
                </div>
            </div>
            <button class="btn-add" onclick="vibrate(100); addToCartWithQty(${idx}, '${nombre.replace(/'/g, "\\'")}', ${precio})" ${stock === 0 ? 'disabled style="background:#999"' : ''}>
                Agregar
            </button>
        </div>
    `}).join('');
}


/* ============================================
   AUMENTAR CANTIDAD
   ============================================ */
function increaseQty(idx) {
    if (!productQuantities[idx]) productQuantities[idx] = 1;
    productQuantities[idx]++;
    
    const qtyDisplay = document.getElementById(`qty-${idx}`);
    if (qtyDisplay) {
        qtyDisplay.textContent = productQuantities[idx];
    }
}

/* ============================================
   DISMINUIR CANTIDAD
   ============================================ */
function decreaseQty(idx) {
    if (!productQuantities[idx]) productQuantities[idx] = 1;
    
    if (productQuantities[idx] > 1) {
        productQuantities[idx]--;
        
        const qtyDisplay = document.getElementById(`qty-${idx}`);
        if (qtyDisplay) {
            qtyDisplay.textContent = productQuantities[idx];
        }
    }
}

/* ============================================
   AGREGAR AL CARRITO CON CANTIDAD
   ============================================ */
function addToCartWithQty(idx, name, price) {
    const qty = productQuantities[idx] || 1;
    const existing = cart.find(item => item.name === name);
    
    if (existing) {
        existing.qty += qty;
    } else {
        cart.push({ name, price, qty: qty });
    }
    
    updateCartCount();
    
    // Mostrar notificación toast en lugar de alert
    showToast(`${name} x${qty} agregado al carrito`);
    
    productQuantities[idx] = 1;
    const qtyDisplay = document.getElementById(`qty-${idx}`);
    if (qtyDisplay) {
        qtyDisplay.textContent = '1';
    }
}
/* ============================================
   ACTUALIZAR CONTADOR DEL CARRITO
   ============================================ */
function updateCartCount() {
    const count = cart.reduce((sum, item) => sum + item.qty, 0);
    const cartCount = document.getElementById('cartCount');
    if (cartCount) {
        cartCount.textContent = count;
    }
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
    cartSummary.innerHTML = cart.map((item, idx) => {
        const itemTotal = item.price * item.qty;
        total += itemTotal;
        return `
            <div class="cart-item">
                <div class="cart-item-info">
                    <div class="cart-item-name">${item.name}</div>
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
   CONFIRMAR COMPRA
   ============================================ */
async function confirmPurchase() {
    if (cart.length === 0) return;
    
    const saleNumber = 'VTA-' + Date.now().toString().slice(-6);
    const total = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
    const productsList = cart.map(item => `${item.qty} x ${item.name} (S/ ${(item.price * item.qty).toFixed(2)})`).join(', ');
    
    currentSaleNumber = saleNumber;
    currentSaleTotal = total;
    
    const saleNumberDisplay = document.getElementById('saleNumber');
    if (saleNumberDisplay) {
        saleNumberDisplay.textContent = saleNumber;
    }
    
    const confirmationDetails = document.getElementById('confirmationDetails');
    if (confirmationDetails) {
        confirmationDetails.innerHTML = `
            <strong>Cliente:</strong> ${clientName}<br>
            <strong>Productos:</strong> ${productsList}<br>
            <strong>Total a pagar:</strong> S/ ${total.toFixed(2)}
        `;
    }
    
    showScreen('screen-confirmation');
    
    try {
        // Guardar venta en Supabase
        const { data: ventaData, error: ventaError } = await db
            .from('ventas')
            .insert([{
                numero_venta: saleNumber,
                fecha: new Date().toISOString().split('T')[0],
                hora: new Date().toTimeString().split(' ')[0],
                cliente: clientName,
                productos: productsList,
                total: total,
                estado: 'Pendiente'
            }]);
        
        if (ventaError) throw ventaError;
        
        // Actualizar stock de productos
        for (const item of cart) {
            const { data: productoData, error: productoError } = await db
                .from('productos')
                .select('stock')
                .eq('nombre', item.name)
                .single();
            
            if (productoError) continue;
            
            const nuevoStock = productoData.stock - item.qty;
            
            const { error: updateError } = await db
                .from('productos')
                .update({ stock: nuevoStock })
                .eq('nombre', item.name);
            
            if (!updateError) {
                console.log(`Stock actualizado: ${item.name} → ${nuevoStock}`);
            }
        }
    } catch (error) {
        console.error('Error guardando venta:', error);
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
    
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`<!DOCTYPE html><html><head><title>Comprobante ${currentSaleNumber}</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Courier New',monospace;padding:20px;max-width:300px;margin:0 auto;background:white;color:#000}.header{text-align:center;border-bottom:2px dashed #000;padding-bottom:15px;margin-bottom:15px}.header h1{font-size:18px;margin-bottom:5px}.header h2{font-size:14px;font-weight:normal}.header p{font-size:12px;margin-top:5px}.info{font-size:12px;margin-bottom:15px;border-bottom:2px dashed #000;padding-bottom:10px}.info p{margin-bottom:3px}.products{font-size:12px;margin-bottom:15px;border-bottom:2px dashed #000;padding-bottom:10px}.product-row{display:flex;justify-content:space-between;margin-bottom:5px}.product-name{flex:1}.product-qty{width:40px;text-align:center}.product-price{width:70px;text-align:right}.totals{font-size:14px;margin-bottom:15px}.total-row{display:flex;justify-content:space-between;margin-bottom:5px}.total-final{font-size:18px;font-weight:bold;border-top:2px solid #000;padding-top:10px;margin-top:10px}.footer{text-align:center;font-size:11px;border-top:2px dashed #000;padding-top:15px}.footer p{margin-bottom:5px}@media print{body{padding:10px}}</style></head><body><div class="header"><h1>FERRETERÍA EL CONSTRUCTOR</h1><h2>Tu socio en construcción</h2><p>RUC: 20100100100</p><p>Av. Principal 123</p><p>Tel: (01) 234-5678</p></div><div class="info"><p><strong>COMPROBANTE DE COMPRA</strong></p><p>N°: ${currentSaleNumber}</p><p>Fecha: ${fecha}</p><p>Hora: ${hora}</p><p>Cliente: ${clientName || 'Walk-In'}</p><p>Estado: PENDIENTE DE PAGO</p></div><div class="products"><div class="product-row" style="font-weight:bold;border-bottom:1px solid #000;padding-bottom:5px;margin-bottom:5px"><span class="product-name">Producto</span><span class="product-qty">Cant</span><span class="product-price">Total</span></div>${productsList.map(item => `<div class="product-row"><span class="product-name">${item.name}</span><span class="product-qty">${item.qty}</span><span class="product-price">S/ ${(item.price * item.qty).toFixed(2)}</span></div>`).join('')}</div><div class="totals"><div class="total-row"><span>Sub Total:</span><span>S/ ${(currentSaleTotal / 1.18).toFixed(2)}</span></div><div class="total-row"><span>IGV (18%):</span><span>S/ ${(currentSaleTotal - currentSaleTotal / 1.18).toFixed(2)}</span></div><div class="total-row total-final"><span>TOTAL:</span><span>S/ ${currentSaleTotal.toFixed(2)}</span></div></div><div class="footer"><p>Presente este comprobante en caja</p><p>para completar su compra</p><p style="margin-top:10px">¡Gracias por su compra!</p></div><script>window.onload=function(){setTimeout(function(){window.print()},500)}<\/script></body></html>`);
    printWindow.document.close();
}

/* ============================================
   ABRIR MODAL
   ============================================ */
function openModal(module) {
    currentModule = module;
    
    const modal = document.getElementById('modal');
    if (modal) {
        modal.classList.add('active');
    }
    
    const response = document.getElementById('response');
    if (response) {
        response.style.display = 'none';
    }
    
    const userInput = document.getElementById('userInput');
    if (userInput) {
        userInput.value = '';
    }
    
    const sendBtn = document.getElementById('sendBtn');
    if (sendBtn) {
        sendBtn.disabled = false;
    }
    
    const titles = {
        'cotizar': 'Cotizar Productos',
        'precio': 'Consultar Precio',
        'asesor': 'Asesoría IA'
    };
    
    const modalTitle = document.getElementById('modalTitle');
    if (modalTitle) {
        modalTitle.textContent = titles[module];
    }
}

/* ============================================
   CERRAR MODAL
   ============================================ */
function closeModal() {
    const modal = document.getElementById('modal');
    if (modal) {
        modal.classList.remove('active');
    }
    
    if (recognition && isListening) {
        recognition.stop();
    }
}

/* ============================================
   ACTIVAR/DESACTIVAR VOZ
   ============================================ */
function toggleVoice() {
    if (!recognition) {
        alert('Tu navegador no soporta reconocimiento de voz. Usa Chrome o Edge.');
        return;
    }
    
    if (isListening) {
        stopListening();
    } else {
        startListening();
    }
}

/* ============================================
   INICIAR ESCUCHA
   ============================================ */
function startListening() {
    if (recognition) {
        recognition.start();
    }
    isListening = true;
    
    const voiceBtn = document.getElementById('voiceBtn');
    if (voiceBtn) {
        voiceBtn.classList.add('listening');
    }
    
    const userInput = document.getElementById('userInput');
    if (userInput) {
        userInput.placeholder = 'Escuchando...';
    }
}

/* ============================================
   DETENER ESCUCHA
   ============================================ */
function stopListening() {
    if (recognition) {
        recognition.stop();
    }
    isListening = false;
    
    const voiceBtn = document.getElementById('voiceBtn');
    if (voiceBtn) {
        voiceBtn.classList.remove('listening');
    }
    
    const userInput = document.getElementById('userInput');
    if (userInput) {
        userInput.placeholder = 'Escribe o usa el micrófono...';
    }
}

/* ============================================
   ENVIAR PREGUNTA A LA IA
   ============================================ */
async function sendQuestion() {
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
        // Obtener contexto de productos disponibles
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
        
        // Llamar a la Edge Function de IA
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
        
        // Mostrar respuesta de texto
        if (responseContent) {
            responseContent.innerHTML = currentResponse.replace(/\n/g, '<br>');
        }
        
        // MOSTRAR PRODUCTOS VISUALES

       // Búsqueda inteligente: extraer palabras clave
const query = question.toLowerCase();
const palabras = query.split(/\s+/).filter(p => p.length > 2); // Palabras de más de 2 letras

const productosFiltrados = productos.filter(p => {
    const nombre = p.nombre.toLowerCase();
    const categoria = (p.categoria || '').toLowerCase();
    
    // Si hay palabras clave, buscar que TODAS estén presentes
    if (palabras.length > 0) {
        const todasCoinciden = palabras.every(palabra => 
            nombre.includes(palabra) || categoria.includes(palabra)
        );
        return todasCoinciden;
    }
    
    // Si no hay palabras clave útiles, mostrar todos
    return nombre.includes(query) || categoria.includes(query);
}).sort((a, b) => {
    // Ordenar por relevancia: coincidencia exacta primero
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
        responseProducts.innerHTML = productosFiltrados.map((prod, idx) => `
          
            <div class="product-item">
                <div class="product-image-small">
                    ${prod.imagen_url ? 
                        `<img src="${prod.imagen_url}" alt="${prod.nombre}" onclick="openImageZoom('${prod.imagen_url}', '${prod.nombre.replace(/'/g, "\\'")}')">` : 
                        `<div class="no-image-small">📦</div>`
                    }
                </div>
                <div class="product-info">
                    <div class="product-name">${prod.nombre}</div>
                    <div class="product-price">S/ ${parseFloat(prod.precio).toFixed(2)}</div>
                    <div class="product-stock">Stock: ${prod.stock} ${prod.stock > 0 ? 'disponible' : 'agotado'}</div>
                    <div class="quantity-control">
                        <button class="qty-btn" onclick="vibrate(50); decreaseQty(${idx})">-</button>
                        <span class="qty-display" id="qty-${idx}">1</span>
                        <button class="qty-btn" onclick="vibrate(50); increaseQty(${idx})">+</button>
                    </div>
                </div>
                <button class="btn-add" onclick="vibrate(100); addToCartWithQty(${idx}, '${prod.nombre.replace(/'/g, "\\'")}', ${prod.precio})" ${prod.stock === 0 ? 'disabled' : ''}>
                    Agregar
                </button>
            </div>
        `).join('');
        
        // Scroll automático DESPUÉS de generar los productos
        setTimeout(() => {
            const chatContainer = document.querySelector('.chat-container');
            if (chatContainer) {
                chatContainer.scrollTo({
                    top: chatContainer.scrollHeight,
                    behavior: 'smooth'
                });
            }
        }, 600);
        
    } else {
        responseProducts.style.display = 'none';
    }
}
       
        if (responseActions) {
            responseActions.style.display = 'flex';
        }
        
        if (currentAudio) {
            playElevenLabsAudio(currentAudio);
        }
        
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
   REPRODUCIR AUDIO DE ELEVENLABS
   ============================================ */
function playElevenLabsAudio(audioBase64) {
    if (!audioBase64) return;
    
    const audio = new Audio(audioBase64);
    
    const speakingIndicator = document.getElementById('speakingIndicator');
    if (speakingIndicator) {
        speakingIndicator.classList.add('active');
    }
    
    audio.onended = () => {
        if (speakingIndicator) {
            speakingIndicator.classList.remove('active');
        }
    };
    
    audio.play().catch(error => {
        console.error('Error reproduciendo audio:', error);
        if (speakingIndicator) {
            speakingIndicator.classList.remove('active');
        }
    });
}

/* ============================================
   HABLAR RESPUESTA
   ============================================ */
function speakResponse() {
    if (!currentResponse) return;
    
    // Si tenemos audio de ElevenLabs, usarlo
    if (currentAudio) {
        playElevenLabsAudio(currentAudio);
        return;
    }
    
    // Si no, usar la voz del navegador (fallback)
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
    
    // Obtener nombre del negocio desde config
    const negocioNombre = document.querySelector('.kiosk-title')?.textContent?.replace('BIENVENIDO A LA\n', '') || 'Ferretería El Constructor';
    
    const cartItems = cart.map(item => ({
        name: item.name,
        price: item.price,
        qty: item.qty,
        subtotal: item.price * item.qty
    }));
    
    const total = cartItems.reduce((sum, item) => sum + item.subtotal, 0);
    
    // Crear iframe oculto para impresión
    const printFrame = document.createElement('iframe');
    printFrame.style.position = 'fixed';
    printFrame.style.right = '0';
    printFrame.style.bottom = '0';
    printFrame.style.width = '0';
    printFrame.style.height = '0';
    printFrame.style.border = '0';
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
                <div class="client-name">${clientName || 'Cliente General'}</div>
            </div>
            
            ${cartItems.length > 0 ? `
            <div class="products-table">
                <div class="products-title"> Productos Cotizados</div>
                <table>
                    <thead>
                        <tr>
                            <th>Producto</th>
                            <th class="text-right">Cantidad</th>
                            <th class="text-right">Precio Unit.</th>
                            <th class="text-right">Subtotal</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${cartItems.map(item => `
                            <tr>
                                <td>${item.name}</td>
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
                <div class="phone"> (01) 234-5678</div>
                <div style="margin-top: 10px; font-size: 12px;">Esta cotización tiene una validez de 7 días</div>
            </div>
            
            <script>
                window.onload = function() {
                    setTimeout(function() {
                        window.print();
                        window.parent.document.body.removeChild(window.parent.document.querySelector('iframe'));
                    }, 500);
                };
            </script>
        </body>
        </html>
    `);
    printFrame.contentDocument.close();
}

/* ============================================
   MOSTRAR NOTIFICACIÓN TOAST
   ============================================ */
function showToast(message) {
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toastMessage');
    
    if (!toast || !toastMessage) return;
    
    // Actualizar mensaje
    toastMessage.textContent = message;
    
    // Mostrar toast
    toast.classList.remove('hide');
    toast.classList.add('show');
    
    // Vibrar si es móvil
    vibrate(100);
    
    // Ocultar después de 3 segundos
    setTimeout(() => {
        toast.classList.remove('show');
        toast.classList.add('hide');
    }, 3000);
}

/* ============================================
   ACCESO SECRETO AL PANEL ADMIN
   ============================================ */
function openAdminPanel() {
    const password = prompt('🔐 Acceso Administrativo\n\nIngresa la contraseña:');
    
    if (password === 'admin2026') {
        // Usar window.location.href en lugar de window.open
        window.location.href = 'admin.html';
    } else if (password !== null) {
        alert('❌ Contraseña incorrecta');
    }
}
// Atajo de teclado secreto: Ctrl + Shift + A
document.addEventListener('keydown', function(e) {
    if (e.ctrlKey && e.shiftKey && e.key === 'A') {
        e.preventDefault();
        openAdminPanel();
    }
});

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

// Cargar tema guardado al iniciar
document.addEventListener('DOMContentLoaded', function() {
     // Cargar configuración del negocio
    cargarConfigDesdeQuiosco();
    const savedTheme = localStorage.getItem('theme');
    const themeToggle = document.getElementById('themeToggle');
     
    if (savedTheme === 'light') {
        document.body.classList.add('light-mode');
        if (themeToggle) themeToggle.textContent = '';
    }
});

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
            // Actualizar logo
            if (data.logo_url) {
                const logos = document.querySelectorAll('.logo-3d img');
                logos.forEach(img => {
                    img.src = data.logo_url;
                    img.style.opacity = '1';
                });
            }
            
            // Actualizar nombre
            if (data.nombre_negocio) {
                const titulos = document.querySelectorAll('.kiosk-title');
                titulos.forEach(titulo => {
                    if (titulo.textContent.includes('BIENVENIDO')) {
                        titulo.innerHTML = `BIENVENIDO A LA<br>${data.nombre_negocio.toUpperCase()}`;
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
function openImageZoom(imageUrl, productName) {
    if (event) event.stopPropagation();
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

// Cerrar modal al hacer click fuera
document.addEventListener('click', function(e) {
    const modal = document.getElementById('imageZoomModal');
    if (modal && e.target === modal) {
        closeImageZoom();
    }
});

// Cerrar con tecla ESC
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        closeImageZoom();
    }
});



// ============================================
// INICIALIZACIÓN
// ============================================

// Cargar configuración del negocio al iniciar
document.addEventListener('DOMContentLoaded', function() {
    cargarConfigDesdeQuiosco();
});
