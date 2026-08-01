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
            const products = data.map(p => ({
                id: p.id,
                name: p.nombre,
                price: parseFloat(p.precio),
                stock: p.stock,
                qty: 1
            }));
            displayProducts(products);
        } else {
            productList.innerHTML = '<div class="empty-state">No se encontraron productos</div>';
        }
    } catch (error) {
        console.error('Error:', error);
        productList.innerHTML = '<div class="empty-state">Error de conexión. Intenta de nuevo.</div>';
    }
}

/* ============================================
   MOSTRAR PRODUCTOS
   ============================================ */
function displayProducts(products) {
    const productList = document.getElementById('productList');
    if (!productList) return;
    
    if (!products || products.length === 0) {
        productList.innerHTML = '<div class="empty-state">No se encontraron productos</div>';
        return;
    }
    
    productList.innerHTML = products.map((prod, idx) => `
        <div class="product-item">
            <div class="product-info">
                <div class="product-name">${prod.name}</div>
                <div class="product-price">S/ ${prod.price.toFixed(2)}</div>
                <div class="product-stock">Stock: ${prod.stock} ${prod.stock > 0 ? 'disponible' : 'agotado'}</div>
                <div class="quantity-control">
                    <button class="qty-btn" onclick="vibrate(50); decreaseQty(${idx})">-</button>
                    <span class="qty-display" id="qty-${idx}">1</span>
                    <button class="qty-btn" onclick="vibrate(50); increaseQty(${idx})">+</button>
                </div>
            </div>
            <button class="btn-add" onclick="vibrate(100); addToCartWithQty(${idx}, '${prod.name.replace(/'/g, "\\'")}', ${prod.price})" ${prod.stock === 0 ? 'disabled style="background:#999"' : ''}>Agregar</button>
        </div>
    `).join('');
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
    alert(`${name} x${qty} agregado al carrito`);
    
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
            .select('nombre, categoria, precio, stock, unidad')
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
        
        if (responseContent) {
            responseContent.innerHTML = currentResponse.replace(/\n/g, '<br>');
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
    
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`<!DOCTYPE html><html><head><title>Cotización ${numeroCotizacion}</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Segoe UI',Tahoma,sans-serif;padding:40px;max-width:800px;margin:0 auto;background:white;color:#333}.header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #667eea;padding-bottom:20px;margin-bottom:30px}.logo-section{display:flex;align-items:center;gap:20px}.logo{width:80px;height:80px;background:#667eea;border-radius:50%;display:flex;align-items:center;justify-content:center;color:white;font-size:32px;font-weight:bold}.company-info h1{color:#667eea;font-size:28px;margin-bottom:5px}.company-info p{color:#666;font-size:14px}.quote-info{text-align:right}.quote-info h2{color:#667eea;font-size:28px;margin-bottom:10px;font-weight:bold}.quote-info p{color:#666;font-size:14px;margin-bottom:5px}.client-section{background:#f8f9fa;padding:15px 20px;border-radius:8px;margin-bottom:30px;border-left:4px solid #667eea}.client-section h3{color:#667eea;margin-bottom:8px;font-size:16px}.client-section p{color:#666;font-size:14px}.content{padding:20px;line-height:1.6}.footer{margin-top:40px;padding-top:20px;border-top:2px solid #667eea;display:flex;justify-content:space-between;align-items:flex-end}.contact-info{display:flex;flex-direction:column;gap:8px}.contact-info span{color:#666;font-size:14px}@media print{body{padding:20px}}</style></head><body><div class="header"><div class="logo-section"><div class="logo">FC</div><div class="company-info"><h1>Ferretería El Constructor</h1><p>Tu socio en construcción</p></div></div><div class="quote-info"><h2>COTIZACIÓN</h2><p><strong>N°:</strong> ${numeroCotizacion}</p><p><strong>Fecha:</strong> ${fecha}</p></div></div><div class="client-section"><h3>📋 Detalle de la Cotización</h3><p>Cliente: ${clientName || 'Walk-In (Quiosco)'}</p></div><div class="content">${currentResponse.replace(/\n/g, '<br>')}</div><div class="footer"><div class="contact-info"><span>📞 (01) 234-5678</span><span>✉️ ventas@ferreteriaelconstructor.com</span><span>📍 Av. Principal 123</span></div></div><div class="no-print" style="text-align:center;margin-top:30px"><button onclick="window.print()" style="padding:15px 30px;background:#667eea;color:white;border:none;border-radius:8px;cursor:pointer;font-size:16px;font-weight:600">🖨️ Imprimir Cotización</button></div><script>window.onload=function(){setTimeout(function(){window.print()},500)}<\/script></body></html>`);
    printWindow.document.close();
}