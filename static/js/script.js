// script.js (Admin / Gestión)
document.addEventListener('DOMContentLoaded', () => {

    // --- ELEMENTOS DEL DOM ---
    const loginForm = document.getElementById('login-form');
    const logoutBtn = document.getElementById('logout-btn');
    const navLinks = document.querySelectorAll('.nav-link');
    const moduleCards = document.querySelectorAll('.card');

    // Módulos (de dashboard.html)
    const contentModules = {
        'presentacion': document.getElementById('presentacion-module'),
        'menu': document.getElementById('menu-module'),
        'pedidos': document.getElementById('pedidos-module'),
        'mesas': document.getElementById('mesas-module'),
        'facturacion': document.getElementById('facturacion-module'),
        'reportes': document.getElementById('reportes-module'),
        'welcome': document.getElementById('welcome-message'),
        'pedidos-pagos': document.getElementById('pedidos-pagos-module') // <-- nuevo
    };


    // --- Elementos del módulo Pedidos ---
    const crearPedidoBtn = document.getElementById('crear-pedido-btn');
    const modalNuevoPedido = document.getElementById('modal-nuevo-pedido');
    const cerrarModalPedidoBtn = document.getElementById('cerrar-modal-pedido');
    const nuevoPedidoForm = document.getElementById('nuevo-pedido-form');
    const menuProductosSelect = document.getElementById('menu-productos');
    const addProductoPedidoBtn = document.getElementById('add-producto-pedido-btn');
    const pedidoItemsList = document.getElementById('pedido-items-list');
    const pedidoTotalSpan = document.getElementById('pedido-total');
    const tablaPedidosContainer = document.getElementById('tabla-pedidos-container');

    // --- Elementos del módulo Menú ---
    const tablaMenuContainer = document.getElementById('tabla-menu-container');
    const agregarProductoBtn = document.getElementById('agregar-producto-btn'); 

    // --- Elementos del módulo Mesas ---
    const mesasContainer = document.querySelector(".mesas-container");
    const modalReserva = document.getElementById("modal-reserva");
    const cerrarModalReserva = document.getElementById("cerrar-modal");
    const reservaForm = document.getElementById("reserva-form");
    const mesaNumeroSpan = document.getElementById("mesa-numero");

    // --- Estado local ---
    let menuItems = [];             // lista de productos (desde /api/menu)
    let currentPedidoItems = [];    // items que se están creando en el modal
    let mesasData = [];             // datos de mesas (sincronizados con backend si hay API)

    // -----------------------
    // --- FUNCIONES GENERALES
    // -----------------------
    function showModule(moduleId) {
        Object.values(contentModules).forEach(module => {
            if (module) module.classList.add('hidden');
        });
        const moduleToShow = contentModules[moduleId];
        if (moduleToShow) moduleToShow.classList.remove('hidden');
    }

    async function fetchJson(url, opts = {}) {
        const res = await fetch(url, opts);
        if (!res.ok) {
            const text = await res.text();
            let msg = text;
            try { msg = JSON.parse(text); } catch (e) {}
            throw new Error((msg && msg.error) ? msg.error : `HTTP ${res.status} - ${res.statusText}`);
        }
        return res.json().catch(() => ({}));
    }

    // --- LOGIN / LOGOUT
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = document.getElementById('username').value;
            const password = document.getElementById('password').value;
            try {
                const res = await fetch('/api/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password })
                });
                if (res.ok) {
                    window.location.href = '/dashboard';
                } else {
                    const body = await res.json().catch(() => ({}));
                    alert(body.message || 'Credenciales incorrectas.');
                }
            } catch (err) {
                console.error(err);
                alert('Error en login. Reintente.');
            }
        });
    }

    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            try {
                await fetch('/api/logout');
            } catch (e) {
                console.warn('Logout request failed', e);
            } finally {
                window.location.href = '/login';
            }
        });
    }

    // --- NAVEGACIÓN / UI
navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
        const moduleId = link.dataset.module; // Primero verificamos si es un enlace de módulo

        // Si SÍ tiene un 'data-module', manejamos todo con JavaScript
        if (moduleId) {
            e.preventDefault(); // <-- AHORA SÓLO SE EJECUTA AQUÍ

            navLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');

            showModule(moduleId);
            if (moduleId === 'menu') loadMenuModule();
            if (moduleId === 'pedidos') loadPedidosModule();
            if (moduleId === 'mesas') loadMesasModule();
        }
        // Si NO tiene 'data-module' (como tu enlace de estadísticas),
        // este código no hace nada y el navegador sigue el 'href' normalmente.
    });
});
    

    moduleCards.forEach(card => {
        card.addEventListener('click', () => {
            const moduleId = card.dataset.module;
            if (!moduleId) return;
            showModule(moduleId);
            navLinks.forEach(l => l.classList.toggle('active', l.dataset.module === moduleId));
            if (moduleId === 'menu') loadMenuModule();
            if (moduleId === 'pedidos') loadPedidosModule();
            if (moduleId === 'mesas') loadMesasModule();
            if (moduleId === 'reportes') loadReportesModule();
        });
    });

    // --- MÓDULO MENÚ
    async function loadMenuModule() {
        if (!tablaMenuContainer) return;
        try {
            const productos = await fetchJson('/api/menu');
            menuItems = productos;
            // Tabla simple
            let html = `<table>
                <thead>
                    <tr>
                        <th>Nombre</th>
                        <th>Categoría</th>
                        <th>Precio</th>
                        <th>Acciones</th>
                    </tr>
                </thead>
                <tbody>`;
            productos.forEach(p => {
                html += `
                <tr>
                    <td>${escapeHtml(p.nombre)}</td>
                    <td>${escapeHtml(p.categoria || '')}</td>
                    <td>$${(p.precio).toFixed(2)}</td>
                    <td>
                        <button class="btn btn-small btn-edit" data-id="${p.id}">Editar</button>
                        <button class="btn btn-small btn-delete" data-id="${p.id}">Eliminar</button>
                    </td>
                </tr>`;
            });
            html += `</tbody></table>`;
            tablaMenuContainer.innerHTML = html;
        } catch (error) {
            console.error('Error en loadMenuModule:', error);
            tablaMenuContainer.innerHTML = `<p>Error al cargar el menú.</p>`;
        }
    }
    
    // --- MÓDULO MENÚ: Crear / Editar / Eliminar ---
function openProductoModal(producto = null) {
    const modal = document.getElementById("modal-producto");
    const titulo = document.getElementById("modal-producto-titulo");
    const form = document.getElementById("producto-form");
    const idInput = document.getElementById("producto-id");
    const nombreInput = document.getElementById("producto-nombre");
    const categoriaInput = document.getElementById("producto-categoria");
    const precioInput = document.getElementById("producto-precio");
    const descripcionInput = document.getElementById("producto-descripcion");

    if (producto) {
        titulo.textContent = "Editar Producto";
        idInput.value = producto.id;
        nombreInput.value = producto.nombre;
        categoriaInput.value = producto.categoria;
        precioInput.value = producto.precio;
        descripcionInput.value = producto.descripcion || '';
    } else {
        titulo.textContent = "Nuevo Producto";
        form.reset(); // Limpia todos los campos del formulario
        idInput.value = ""; // Asegura que el id esté vacío para un producto nuevo
    }

    modal.classList.remove("hidden");
}

const productoForm = document.getElementById("producto-form");

// ✅ Verificamos si el listener ya fue añadido antes de continuar
if (productoForm && !productoForm.dataset.listenerAttached) {
    
    // Asignamos el listener directamente (es más limpio)
    productoForm.addEventListener("submit", handleSaveProducto);
    
    // Marcamos el formulario para que este bloque no se vuelva a ejecutar
    productoForm.dataset.listenerAttached = "true";
}


async function handleSaveProducto(e) {
    e.preventDefault();

    // 1. Obtenemos los datos del formulario
    const formData = new FormData(document.getElementById('producto-form'));
    const id = formData.get("id"); // Asume que tu input tiene name="id"

    try {
        const url = id ? `/api/menu/${id}` : "/api/menu";
        const method = id ? "PUT" : "POST";

        // 2. Hacemos UNA SOLA petición fetch
        const response = await fetch(url, {
            method: method,
            body: formData, // El body es el FormData
            // NO establezcas el header 'Content-Type', el navegador lo hace solo.
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || "Error al guardar el producto");
        }

        alert("✅ Producto guardado correctamente");
        document.getElementById("modal-producto").classList.add("hidden");
        loadMenuModule(); // Recarga la lista de productos

    } catch (err) {
        console.error("Error en handleSaveProducto:", err);
        alert("⚠️ " + err.message);
    }
}
    async function handleDeleteProducto(id) {
        if (!confirm("¿Seguro que quieres eliminar este producto?")) return;
        try {
            const res = await fetch(`/api/menu/${id}`, { method: "DELETE" });
            if (!res.ok) throw new Error("Error al eliminar producto");
            alert("🗑 Producto eliminado correctamente");
            loadMenuModule();
        } catch (err) {
            alert("⚠ " + err.message);
        }
    }

    // --- MÓDULO PEDIDOS
async function loadPedidosModule() {
    if (!tablaPedidosContainer) return;
    try {
        const pedidos = await fetchJson('/api/pedidos');
        let html = `<table><thead><tr><th>ID</th><th>Cliente</th><th>Descripción</th><th>Total</th><th>Fecha</th><th>Acciones</th></tr></thead><tbody>`;

        pedidos.forEach(p => {
            const total = (typeof p.total === 'number') ? p.total.toFixed(2) : p.total;
            html += `
                <tr>
                    <td>${p.id}</td>
                    <td>${escapeHtml(p.cliente || 'Consumidor Final')}</td>
                    <td>${escapeHtml(p.descripcion || 'Sin descripción')}</td>
                    <td>$${total}</td>
                    
                    <td>${p.fecha}</td>
                    <td><button class="btn btn-delete" data-id="${p.id}">Eliminar</button></td>
                </tr>`;
        });

        html += `</tbody></table>`;
        tablaPedidosContainer.innerHTML = html;

    } catch (error) {
        console.error('Error en loadPedidosModule:', error);
        tablaPedidosContainer.innerHTML = `<p>Error al cargar los pedidos.</p>`;
    }
}

    // Abre modal nuevo pedido y carga menú para seleccionar productos
    async function openNuevoPedidoModal() {
        currentPedidoItems = [];
        if (nuevoPedidoForm) nuevoPedidoForm.reset();
        renderCurrentPedido();

        try {
            // Aseguramos menuItems actualizados
            const productos = await fetchJson('/api/menu');
            menuItems = productos;
            // llenar select
            if (menuProductosSelect) {
                menuProductosSelect.innerHTML = menuItems
                    .map(item => `<option value="${item.id}">${escapeHtml(item.nombre)} - $${(item.precio).toFixed(2)}</option>`)
                    .join('');
            }
            if (modalNuevoPedido) modalNuevoPedido.classList.remove('hidden');
        } catch (error) {
            console.error(error);
            alert('No se pudo abrir el modal: ' + error.message);
        }
    }

    function addProductoAlPedido() {
        const selectedId = parseInt(menuProductosSelect.value);
        const producto = menuItems.find(item => item.id === selectedId);
        if (producto) {
            currentPedidoItems.push({ ...producto, cantidad: 1 });
            renderCurrentPedido();
        }
    }

    function renderCurrentPedido() {
        if (!pedidoItemsList || !pedidoTotalSpan) return;
        pedidoItemsList.innerHTML = '';
        let total = 0;

        currentPedidoItems.forEach((item, index) => {
            const li = document.createElement('li');
            li.className = 'pedido-item';
            const subtotal = (item.precio * (item.cantidad || 1));
            total += subtotal;

            const txt = document.createElement('span');
            txt.textContent = `${item.nombre} - $${subtotal.toFixed(2)}`;

            // cantidad control simple
            const qty = document.createElement('input');
            qty.type = 'number';
            qty.min = 1;
            qty.value = item.cantidad || 1;
            qty.className = 'pedido-cantidad';
            qty.style.margin = '0 8px';
            qty.onchange = () => {
                const val = parseInt(qty.value) || 1;
                currentPedidoItems[index].cantidad = val;
                renderCurrentPedido();
            };

            const removeBtn = document.createElement('button');
            removeBtn.type = 'button';
            removeBtn.textContent = 'Quitar';
            removeBtn.classList.add('btn', 'btn-small', 'btn-remove-item');
            removeBtn.onclick = () => {
                currentPedidoItems.splice(index, 1);
                renderCurrentPedido();
            };

            li.appendChild(txt);
            li.appendChild(qty);
            li.appendChild(removeBtn);
            pedidoItemsList.appendChild(li);
        });

        pedidoTotalSpan.textContent = total.toFixed(2);
    }

    async function handleSavePedido(e) {
        if (e) e.preventDefault();
        if (!currentPedidoItems.length) {
            alert('Debes agregar al menos un producto al pedido.');
            return;
        }
        const cliente = document.getElementById('cliente-pedido') ? document.getElementById('cliente-pedido').value : '';
        const itemsToSend = currentPedidoItems.map(it => ({ id: it.id, cantidad: it.cantidad || 1 }));
        try {
            const res = await fetch('/api/pedidos', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cliente: cliente || null, items: itemsToSend })
            });
            if (res.ok) {
                alert('¡Pedido creado con éxito!');
                if (modalNuevoPedido) modalNuevoPedido.classList.add('hidden');
                await loadPedidosModule();
            } else {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.error || 'Error al crear el pedido');
            }
        } catch (error) {
            console.error('handleSavePedido error:', error);
            alert(error.message || 'Error al crear el pedido');
        }
    }

    async function handleDeletePedido(pedidoId) {
        if (!confirm(`¿Estás seguro que quieres eliminar el pedido #${pedidoId}?`)) return;
        try {
            const res = await fetch(`/api/pedidos/${pedidoId}`, { method: 'DELETE' });
            if (res.ok) {
                alert(`Pedido #${pedidoId} eliminado con éxito.`);
                await loadPedidosModule();
            } else {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.error || 'Error al eliminar pedido');
            }
        } catch (error) {
            console.error('handleDeletePedido error:', error);
            alert(error.message || 'Error al eliminar el pedido');
        }
    }

    // Delegación: botones eliminar en tabla pedidos (donde la tabla se carga dinámicamente)
    if (tablaPedidosContainer) {
        tablaPedidosContainer.addEventListener('click', (e) => {
            const target = e.target;
            if (target.matches('.btn-delete')) {
                const pedidoId = target.dataset.id;
                handleDeletePedido(pedidoId);
            }
        });
    }

    // Cerrar modal si se hace click fuera del contenido
    if (modalNuevoPedido) {
        modalNuevoPedido.addEventListener('click', (e) => {
            if (e.target === modalNuevoPedido) modalNuevoPedido.classList.add('hidden');
        });
    }

    // --- MÓDULO MESAS (sincronizado con API si existe)
    function estadoToClass(estado) {
    if (!estado) return 'libre';
    switch(estado.toLowerCase()) {
        case 'libre': return 'libre';
        case 'ocupada': return 'ocupada';
        case 'reservada': return 'reservada';
        default: return 'libre';
    }
}


    async function loadMesasModule() {
    if (!mesasContainer) return;
    try {
        const apiMesas = await fetchJson('/api/mesas');
        mesasData = apiMesas.map(m => ({
            id: m.id,
            numero: m.numero,
            estado: m.estado ? m.estado : 'Libre',
            reserva: m.reserva || null
        }));
        renderMesas();
    } catch (err) {
        console.warn('No se pudo obtener mesas desde API; usando local. Error:', err);
        if (!mesasData || !mesasData.length) {
            const cantidadMesas = 10;
            mesasData = Array.from({ length: cantidadMesas }, (_, i) => ({
                id: i + 1,
                numero: i + 1,
                estado: 'Libre',
                reserva: null
            }));
        }
        renderMesas();
    }
}


    function renderMesas() {
        if (!mesasContainer) return;
        mesasContainer.innerHTML = '';
        mesasData.forEach(data => {
            // normalizamos estado seguro
            const estadoRaw = (data.estado || 'Libre').toString().trim();
            const estadoClass = estadoToClass(estadoRaw);

            // crear elemento mesa
            const mesa = document.createElement('div');
            mesa.className = `mesa ${estadoClass}`;
            mesa.dataset.numero = data.numero;
            mesa.dataset.id = data.id;
            mesa.dataset.estado = estadoRaw;
            mesa.style.position = 'relative';
            
            // al final del bloque de creación de mesa (dentro renderMesas)
            const badgeText = data.reserva ? `${data.reserva.cliente || 'Sin nombre'} — ${data.reserva.fecha_hora || ''}` : (data.estado || '');
            mesa.setAttribute('title', `Mesa ${data.numero} · ${badgeText}`);


            // contenido principal: numero
            const numeroSpan = document.createElement('div');
            numeroSpan.className = 'mesa-number';
            numeroSpan.textContent = data.numero;
            numeroSpan.style.zIndex = '1';
            mesa.appendChild(numeroSpan);

            // badge de reserva (si existe)
            if (data.reserva) {
                const badge = document.createElement('div');
                badge.className = 'mesa-reserva-badge';
                badge.style.position = 'absolute';
                badge.style.top = '6px';
                badge.style.right = '6px';
                badge.style.background = 'rgba(0,0,0,0.12)';
                badge.style.padding = '4px 8px';
                badge.style.borderRadius = '8px';
                badge.style.fontSize = '0.75rem';
                badge.style.zIndex = '2';
                const clienteText = data.reserva.cliente || 'Sin nombre';
                const fh = data.reserva.fecha_hora || '';
                badge.textContent = `${clienteText}${fh ? ' · ' + fh : ''}`;
                mesa.appendChild(badge);
            }

            mesasContainer.appendChild(mesa);

            mesa.addEventListener('click', async () => {
                const current = mesasData.find(m => m.numero == data.numero);
                if (!current) return;
                const estado = (current.estado || 'Libre').toLowerCase();

                // LIBRE: preguntar si ocupar ahora o abrir modal de reserva
                if (estado === 'libre') {
                    const ocuparAhora = confirm(`Mesa ${current.numero} está LIBRE.\nOK = Ocupar ahora\nCancelar = Abrir formulario de reserva`);
                    if (ocuparAhora) {
                        await actualizarEstadoMesa(current.id, 'Ocupada');
                    } else {
                        // abrir modal reserva como antes
                        mesaNumeroSpan.textContent = current.numero;
                        if (modalReserva) modalReserva.classList.remove('hidden');
                    }

                // RESERVADA: mostrar info y permitir Confirmar llegada (ocupar) o Cancelar reserva
                } else if (estado === 'reservada') {
                    const r = current.reserva || {};
                    const txt = `Reserva para mesa ${current.numero}\nCliente: ${r.cliente || 'N/A'}\nPersonas: ${r.personas || 'N/A'}\nFecha/Hora: ${r.fecha_hora || 'N/A'}\n\nOK = Confirmar llegada (pasar a Ocupada)\nCancelar = Mostrar opciones (Cancelar reserva)`;
                    const confirmar = confirm(txt);
                    if (confirmar) {
                        await actualizarEstadoMesa(current.id, 'Ocupada');
                    } else {
                        // preguntar si desea cancelar la reserva
                        const cancelarRes = confirm('¿Deseás cancelar la reserva? OK = Sí, Cancel = No');
                        if (cancelarRes) {
                            await actualizarEstadoMesa(current.id, 'Libre');
                        }
                    }

                // OCUPADA: posibilidad de liberar
                } else if (estado === 'ocupada') {
                    const liberar = confirm(`Mesa ${current.numero} está OCUPADA. ¿Deseás liberarla?`);
                    if (liberar) {
                        await actualizarEstadoMesa(current.id, 'Libre');
                    }
                } else {
                    // fallback seguro
                    await actualizarEstadoMesa(current.id, 'Libre');
                }
            });
        });

            // actualizar panel de reservas (si existe)
         renderReservasPanel();
        }
            
        
        function renderReservasPanel() {
    const list = document.getElementById('reservas-list');
    if (!list) return;
    list.innerHTML = '';
    const reservas = mesasData.filter(m => (m.estado || '').toLowerCase() === 'reservada');

    if (reservas.length === 0) {
        const li = document.createElement('li');
        li.className = 'empty';
        li.textContent = 'No hay reservas activas';
        list.appendChild(li);
        return;
    }

    reservas.forEach(m => {
        const r = m.reserva || {};
        // contenedor
        const li = document.createElement('li');

        // info
        const info = document.createElement('div');
        info.className = 'res-info';
        const name = document.createElement('div');
        name.className = 'r-name';
        name.textContent = r.cliente ? `${r.cliente} — Mesa ${m.numero}` : `Mesa ${m.numero}`;
        const meta = document.createElement('div');
        meta.className = 'r-meta';
        meta.textContent = `${r.fecha_hora || ''} · ${r.personas ? r.personas + ' personas' : ''}`;

        info.appendChild(name);
        info.appendChild(meta);

        // acciones
        const actions = document.createElement('div');
        actions.className = 'res-actions';

        const btnConfirm = document.createElement('button');
        btnConfirm.className = 'confirm';
        btnConfirm.textContent = 'Confirmar';
        btnConfirm.title = 'Confirmar llegada y marcar como ocupada';
        btnConfirm.addEventListener('click', async (e) => {
            e.stopPropagation();
            await actualizarEstadoMesa(m.id, 'Ocupada');
        });

        const btnCancel = document.createElement('button');
        btnCancel.className = 'cancel';
        btnCancel.textContent = 'Cancelar';
        btnCancel.title = 'Cancelar reserva';
        btnCancel.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (!confirm(`Cancelar reserva de ${r.cliente || 'cliente'} en mesa ${m.numero}?`)) return;
            await actualizarEstadoMesa(m.id, 'Libre');
        });

        actions.appendChild(btnConfirm);
        actions.appendChild(btnCancel);

        li.appendChild(info);
        li.appendChild(actions);

        // tooltip / accesibilidad
        li.setAttribute('role', 'button');
        li.setAttribute('aria-label', `Reserva mesa ${m.numero} por ${r.cliente || 'sin nombre'} a las ${r.fecha_hora || 'sin hora'}`);

        list.appendChild(li);
    });
}



    // Envia actualización al backend si existe /api/mesas/<id> (PUT)
    async function actualizarEstadoMesa(mesaId, nuevoEstado, reservaData = null) {
        try {
            const body = { estado: nuevoEstado };
            if (reservaData) {
                body.cliente = reservaData.cliente;
                body.personas = reservaData.personas;
                body.fecha = reservaData.fecha;
                body.hora = reservaData.hora;
            }
            const res = await fetch(`/api/mesas/${mesaId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            if (!res.ok) {
                const txt = await res.json().catch(() => ({}));
                throw new Error(txt.error || 'No se pudo actualizar la mesa');
            }

            // recargar mesas desde servidor (o actualizar localmente)
            await loadMesasModule();
        } catch (err) {
            console.error('Error actualizarEstadoMesa:', err);
            alert('No se pudo actualizar la mesa: ' + (err.message || err));
        }
    }

    if (reservaForm && cerrarModalReserva) {
        reservaForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const mesaNumero = mesaNumeroSpan.textContent;
            const currentMesa = mesasData.find(m => m.numero == mesaNumero);
            if (!currentMesa) {
                alert('Mesa no encontrada');
                modalReserva.classList.add('hidden');
                return;
            }
            // preparar datos
            const reservaData = {
                cliente: reservaForm.cliente.value,
                personas: reservaForm.personas.value,
                fecha: reservaForm.fecha.value,
                hora: reservaForm.hora.value,
                mesa: currentMesa.numero
            };

            await actualizarEstadoMesa(currentMesa.id, 'Reservada', reservaData);
            reservaForm.reset();
            if (modalReserva) modalReserva.classList.add('hidden');
        });

        // cerrar modal - si se cancela, si no hay reserva la mesa permanece como antes
        cerrarModalReserva.addEventListener('click', () => {
            modalReserva.classList.add('hidden');
        });

        // cerrar modal al click fuera del content
        modalReserva.addEventListener('click', (e) => {
            if (e.target === modalReserva) modalReserva.classList.add('hidden');
        });
    }


    // --- EVENT LISTENERS GLOBALES (Pedidos)
    if (crearPedidoBtn) crearPedidoBtn.addEventListener('click', openNuevoPedidoModal);
    if (cerrarModalPedidoBtn) {
        cerrarModalPedidoBtn.addEventListener('click', () => {
            if (modalNuevoPedido) modalNuevoPedido.classList.add('hidden');
        });
    }
    if (addProductoPedidoBtn) addProductoPedidoBtn.addEventListener('click', addProductoAlPedido);
    if (nuevoPedidoForm && !nuevoPedidoForm.dataset.listenerAdded) {
        nuevoPedidoForm.addEventListener('submit', handleSavePedido);
        nuevoPedidoForm.dataset.listenerAdded = "true"; 
    }


    // --- UTILIDADES
    function escapeHtml(unsafe) {
        if (unsafe === null || unsafe === undefined) return '';
        return String(unsafe)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    // --- FACTURACIÓN ---
    const nuevaFacturaBtn = document.getElementById('nueva-factura-btn');
    const verFacturasBtn = document.getElementById('ver-facturas-btn');
    const modalCrearFactura = document.getElementById('modal-crear-factura');
    const modalFactura = document.getElementById('modal-factura');
    const modalEnviarFactura = document.getElementById('modal-enviar-factura');
    const crearFacturaForm = document.getElementById('crear-factura-form');
    const enviarFacturaForm = document.getElementById('enviar-factura-form');
    const tablaFacturasContainer = document.getElementById('tabla-facturas-container');
    const pedidoSelect = document.getElementById('pedido-select');
    const facturaContent = document.getElementById('factura-content');
    const facturaNumero = document.getElementById('factura-numero');
    const imprimirFacturaBtn = document.getElementById('imprimir-factura-btn');
    const enviarFacturaBtn = document.getElementById('enviar-factura-btn');
    
    let facturaActual = null;
    
    // Event listeners para facturación
    if (nuevaFacturaBtn) {
        nuevaFacturaBtn.addEventListener('click', () => {
            cargarPedidosParaFactura();
            modalCrearFactura.classList.remove('hidden');
        });
    }
    
    if (verFacturasBtn) {
        verFacturasBtn.addEventListener('click', cargarFacturas);
    }
    
    // Cerrar modales
    const cerrarModalCrearFactura = document.getElementById('cerrar-modal-crear-factura');
    const cerrarModalFactura = document.getElementById('cerrar-modal-factura');
    const cerrarModalEnviar = document.getElementById('cerrar-modal-enviar');
    
    if (cerrarModalCrearFactura) {
        cerrarModalCrearFactura.addEventListener('click', () => {
            modalCrearFactura.classList.add('hidden');
        });
    }
    
    if (cerrarModalFactura) {
        cerrarModalFactura.addEventListener('click', () => {
            modalFactura.classList.add('hidden');
        });
    }
    
    const cerrarModalFacturaBtn = document.getElementById('cerrar-modal-factura-btn');
    if (cerrarModalFacturaBtn) {
        cerrarModalFacturaBtn.addEventListener('click', () => {
            modalFactura.classList.add('hidden');
        });
    }
    
    if (cerrarModalEnviar) {
        cerrarModalEnviar.addEventListener('click', () => {
            modalEnviarFactura.classList.add('hidden');
        });
    }
    
    // Crear factura
    if (crearFacturaForm) {
        crearFacturaForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const pedidoId = pedidoSelect.value;
            const metodoPago = document.getElementById('metodo-pago').value;
            const submitBtn = e.target.querySelector('button[type="submit"]');
            
            if (!pedidoId) {
                alert('Por favor selecciona un pedido');
                return;
            }
            
            // Deshabilitar el botón para evitar múltiples envíos
            const originalText = submitBtn.textContent;
            submitBtn.disabled = true;
            submitBtn.textContent = 'Creando...';
            
            try {
                const response = await fetchJson('/api/facturas', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        pedido_id: parseInt(pedidoId),
                        metodo_pago: metodoPago
                    })
                });
                
                alert('Factura creada exitosamente');
                modalCrearFactura.classList.add('hidden');
                cargarFacturas();
                
            } catch (error) {
                alert('Error al crear factura: ' + error.message);
            } finally {
                // Rehabilitar el botón
                submitBtn.disabled = false;
                submitBtn.textContent = originalText;
            }
        });
    }
    
    // Imprimir factura
    if (imprimirFacturaBtn) {
        imprimirFacturaBtn.addEventListener('click', () => {
            if (facturaActual) {
                imprimirFactura(facturaActual);
            }
        });
    }
    
    // Enviar factura
    if (enviarFacturaBtn) {
        enviarFacturaBtn.addEventListener('click', () => {
            modalEnviarFactura.classList.remove('hidden');
        });
    }
    
    // Enviar factura por email
    if (enviarFacturaForm) {
        enviarFacturaForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const email = document.getElementById('email-destino').value;
            
            if (!email) {
                alert('Por favor ingresa un email válido');
                return;
            }
            
            try {
                const response = await fetchJson(`/api/facturas/${facturaActual.id}/enviar`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: email })
                });
                
                alert(response.message);
                modalEnviarFactura.classList.add('hidden');
                document.getElementById('email-destino').value = '';
                
            } catch (error) {
                alert('Error al enviar factura: ' + error.message);
            }
        });
    }

    // Iniciar mostrando bienvenida y cargando lo necesario
    showModule('welcome');
    loadMesasModule();
    
if (agregarProductoBtn) {
    agregarProductoBtn.addEventListener("click", () => openProductoModal());
}

// Cerrar modal
const cerrarModalProducto = document.getElementById("cerrar-modal-producto");
if (cerrarModalProducto) {
    cerrarModalProducto.addEventListener("click", () => {
        document.getElementById("modal-producto").classList.add("hidden");
    });
}

// Delegación eventos de editar/eliminar
if (tablaMenuContainer && !tablaMenuContainer.dataset.listenerAttached) {

    tablaMenuContainer.addEventListener("click", (e) => {
        // Lógica para el botón de editar
        if (e.target.classList.contains("btn-edit")) {
            const id = e.target.dataset.id;
            const producto = menuItems.find(p => p.id == id);
            if (producto) {
                openProductoModal(producto);
            }
        }

        // Lógica para el botón de eliminar
        if (e.target.classList.contains("btn-delete")) {
            handleDeleteProducto(e.target.dataset.id);
        }
    });

    // Marcamos el contenedor para que este bloque no se vuelva a ejecutar
    tablaMenuContainer.dataset.listenerAttached = "true";
}
    
    // Funciones de facturación
    async function cargarPedidosParaFactura() {
        try {
            const pedidos = await fetchJson('/api/pedidos');
            pedidoSelect.innerHTML = '<option value="">-- Selecciona un pedido --</option>';
            
            pedidos.forEach(pedido => {
                const option = document.createElement('option');
                option.value = pedido.id;
                option.textContent = `Pedido #${pedido.id} - ${pedido.cliente} - $${pedido.total}`;
                pedidoSelect.appendChild(option);
            });
            
        } catch (error) {
            console.error('Error cargando pedidos:', error);
            alert('Error al cargar pedidos');
        }
    }
    
    async function cargarFacturas() {
        try {
            const facturas = await fetchJson('/api/facturas');
            renderFacturas(facturas);
        } catch (error) {
            console.error('Error cargando facturas:', error);
            alert('Error al cargar facturas');
        }
    }
    
    function renderFacturas(facturas) {
        if (facturas.length === 0) {
            tablaFacturasContainer.innerHTML = '<p style="text-align: center; color: var(--text-light);">No hay facturas registradas</p>';
            return;
        }
        
        const table = document.createElement('table');
        table.className = 'facturas-table';
        
        table.innerHTML = `
            <thead>
                <tr>
                    <th>ID</th>
                    <th>Pedido</th>
                    <th>Cliente</th>
                    <th>Total</th>
                    <th>Método Pago</th>
                    <th>Fecha</th>
                    <th>Acciones</th>
                </tr>
            </thead>
            <tbody>
                ${facturas.map(factura => `
                    <tr>
                        <td>${factura.id}</td>
                        <td>#${factura.pedido_id}</td>
                        <td>${escapeHtml(factura.cliente)}</td>
                        <td>$${factura.total.toFixed(2)}</td>
                        <td>${escapeHtml(factura.metodo_pago)}</td>
                        <td>${new Date(factura.fecha).toLocaleDateString()}</td>
                        <td>
                            <button class="btn-ver-factura" data-id="${factura.id}">
                                Ver Factura
                            </button>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        `;
        
        tablaFacturasContainer.innerHTML = '';
        tablaFacturasContainer.appendChild(table);
        
        // Event listeners para botones de ver factura
        tablaFacturasContainer.addEventListener('click', async (e) => {
            if (e.target.classList.contains('btn-ver-factura')) {
                const facturaId = e.target.dataset.id;
                await mostrarFactura(facturaId);
            }
        });
    }
    
    async function mostrarFactura(facturaId) {
        try {
            const factura = await fetchJson(`/api/facturas/${facturaId}`);
            facturaActual = factura;
            
            facturaNumero.textContent = factura.id;
            
            const fecha = new Date(factura.fecha).toLocaleDateString('es-ES', {
                year: 'numeric',
                month: 'numeric',
                day: 'numeric'
            });
            
            facturaContent.innerHTML = `
                <div class="factura-branding">
                    <div class="factura-logo">
                        <div class="factura-logo-icon">☕</div>
                        <div class="factura-logo-text">CAFE TERRAZA</div>
                    </div>
                    <div class="factura-contact">
                        <h4>Café Terraza</h4>
                        <p>Calle Principal, Ciudad</p>
                        <p>Tel: (555) 123-4567</p>
                        <p>Email: info@cafeterraza.com</p>
                    </div>
                </div>
                
                <div class="factura-details">
                    <div class="factura-number-section">
                        <h2>FACTURA</h2>
                        <div class="factura-num">N°: ${factura.id}</div>
                        <div class="factura-date">Fecha: ${fecha}</div>
                    </div>
                    <div class="factura-billed-to">
                        <h4>Facturado a:</h4>
                        <p>${escapeHtml(factura.cliente)}</p>
                        <p>Método de Pago: ${escapeHtml(factura.metodo_pago)}</p>
                    </div>
                </div>
                
                <div class="factura-items">
                    <table class="factura-table">
                        <thead>
                            <tr>
                                <th>PRODUCTO</th>
                                <th>CANTIDAD</th>
                                <th>PRECIO UNITARIO</th>
                                <th>SUBTOTAL</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${factura.items.map(item => `
                                <tr>
                                    <td>${escapeHtml(item.producto)}</td>
                                    <td>${item.cantidad}</td>
                                    <td>$${item.precio_unitario.toFixed(2)}</td>
                                    <td>$${item.subtotal.toFixed(2)}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                    
                    <div class="factura-summary">
                        <div class="factura-summary-content">
                            <div class="factura-summary-row">
                                <span class="factura-summary-label">Subtotal: $</span>
                                <span class="factura-summary-value">${factura.subtotal.toFixed(2)}</span>
                            </div>
                            <div class="factura-summary-row">
                                <span class="factura-summary-label">IVA (16%): $</span>
                                <span class="factura-summary-value">${factura.iva_amount.toFixed(2)}</span>
                            </div>
                            <div class="factura-summary-row total">
                                <span class="factura-summary-label">Total: $</span>
                                <span class="factura-summary-value">${factura.total_con_iva.toFixed(2)}</span>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="factura-thanks">
                    ¡Gracias por tu compra! Esperamos verte pronto.
                </div>
            `;
            
            modalFactura.classList.remove('hidden');
            
        } catch (error) {
            console.error('Error cargando factura:', error);
            alert('Error al cargar la factura');
        }
    }
    
    function imprimirFactura(factura) {
        const ventanaImpresion = window.open('', '_blank');
        
        const fecha = new Date(factura.fecha).toLocaleDateString('es-ES', {
            year: 'numeric',
            month: 'numeric',
            day: 'numeric'
        });
        
        ventanaImpresion.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Factura #${factura.id}</title>
                <style>
                    body { font-family: Arial, sans-serif; margin: 20px; background: white; }
                    .factura-branding { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 30px; padding-bottom: 15px; border-bottom: 2px solid #e53935; }
                    .factura-logo { display: flex; align-items: center; gap: 15px; }
                    .factura-logo-icon { width: 50px; height: 50px; background: #e53935; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-size: 24px; }
                    .factura-logo-text { font-size: 32px; font-weight: 900; color: #e53935; letter-spacing: 2px; text-transform: uppercase; }
                    .factura-contact { text-align: right; color: #666; font-size: 14px; line-height: 1.4; }
                    .factura-contact h4 { color: #e53935; margin: 0 0 8px 0; font-size: 16px; font-weight: 700; }
                    .factura-contact p { margin: 3px 0; }
                    .factura-details { display: flex; justify-content: space-between; margin-bottom: 30px; }
                    .factura-number-section h2 { color: #e53935; font-size: 40px; font-weight: 900; margin: 0; text-transform: uppercase; letter-spacing: 1px; }
                    .factura-number-section .factura-num { font-size: 18px; font-weight: 600; color: #333; }
                    .factura-number-section .factura-date { font-size: 16px; color: #666; }
                    .factura-billed-to { text-align: right; color: #333; }
                    .factura-billed-to h4 { color: #e53935; margin: 0 0 8px 0; font-size: 16px; font-weight: 600; }
                    .factura-billed-to p { margin: 5px 0; font-weight: 500; }
                    .factura-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
                    .factura-table th { background: linear-gradient(135deg, #424242, #616161); color: white; padding: 15px; font-weight: 600; text-transform: uppercase; font-size: 14px; letter-spacing: 0.5px; text-align: left; }
                    .factura-table td { padding: 15px; border-bottom: 1px solid #e0e0e0; color: #333; font-weight: 500; background: white; }
                    .factura-table tr:last-child td { border-bottom: none; }
                    .factura-table tr:nth-child(even) td { background: white; }
                    .factura-summary { display: flex; justify-content: flex-end; margin-bottom: 20px; }
                    .factura-summary-content { width: 300px; text-align: right; }
                    .factura-summary-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e0e0e0; }
                    .factura-summary-row.total { border-top: 2px solid #e53935; border-bottom: none; margin-top: 8px; padding-top: 15px; font-weight: 700; font-size: 18px; color: #e53935; }
                    .factura-summary-label { color: #666; font-weight: 500; }
                    .factura-summary-value { color: #333; font-weight: 600; }
                    .factura-thanks { background: linear-gradient(135deg, #e3f2fd, #bbdefb); padding: 15px 20px; border-radius: 8px; border-left: 4px solid #e53935; margin-bottom: 20px; color: #1976d2; font-weight: 500; font-style: italic; }
                    @media print { body { margin: 0; } }
                </style>
            </head>
            <body>
                <div class="factura-branding">
                    <div class="factura-logo">
                        <div class="factura-logo-icon">☕</div>
                        <div class="factura-logo-text">CAFE TERRAZA</div>
                    </div>
                    <div class="factura-contact">
                        <h4>Café Terraza</h4>
                        <p>Calle Principal, Ciudad</p>
                        <p>Tel: (555) 123-4567</p>
                        <p>Email: info@cafeterraza.com</p>
                    </div>
                </div>
                
                <div class="factura-details">
                    <div class="factura-number-section">
                        <h2>FACTURA</h2>
                        <div class="factura-num">N°: ${factura.id}</div>
                        <div class="factura-date">Fecha: ${fecha}</div>
                    </div>
                    <div class="factura-billed-to">
                        <h4>Facturado a:</h4>
                        <p>${escapeHtml(factura.cliente)}</p>
                        <p>Método de Pago: ${escapeHtml(factura.metodo_pago)}</p>
                    </div>
                </div>
                
                <div class="factura-items">
                    <table class="factura-table">
                        <thead>
                            <tr>
                                <th>PRODUCTO</th>
                                <th>CANTIDAD</th>
                                <th>PRECIO UNITARIO</th>
                                <th>SUBTOTAL</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${factura.items.map(item => `
                                <tr>
                                    <td>${escapeHtml(item.producto)}</td>
                                    <td>${item.cantidad}</td>
                                    <td>$${item.precio_unitario.toFixed(2)}</td>
                                    <td>$${item.subtotal.toFixed(2)}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                    
                    <div class="factura-summary">
                        <div class="factura-summary-content">
                            <div class="factura-summary-row">
                                <span class="factura-summary-label">Subtotal: $</span>
                                <span class="factura-summary-value">${factura.subtotal.toFixed(2)}</span>
                            </div>
                            <div class="factura-summary-row">
                                <span class="factura-summary-label">IVA (16%): $</span>
                                <span class="factura-summary-value">${factura.iva_amount.toFixed(2)}</span>
                            </div>
                            <div class="factura-summary-row total">
                                <span class="factura-summary-label">Total: $</span>
                                <span class="factura-summary-value">${factura.total_con_iva.toFixed(2)}</span>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="factura-thanks">
                    ¡Gracias por tu compra! Esperamos verte pronto.
                </div>
                
                <script>
                    window.onload = function() {
                        window.print();
                        window.onafterprint = function() {
                            window.close();
                        };
                    };
                </script>
            </body>
            </html>
        `);
        
        ventanaImpresion.document.close();
    }
    
    
    // --- NUEVO PANEL "Pedidos y Pagos" ---
    const goPedidosBtn = document.getElementById('go-pedidos-btn');
    const goFacturacionBtn = document.getElementById('go-facturacion-btn');
    const backWelcomeBtn = document.getElementById('back-welcome-btn');

    if (goPedidosBtn) {
        goPedidosBtn.addEventListener('click', () => {
            showModule('pedidos');
            loadPedidosModule(); // usa la función que ya existe
        });
    }

    if (goFacturacionBtn) {
        goFacturacionBtn.addEventListener('click', () => {
            showModule('facturacion');
        });
    }

    if (backWelcomeBtn) {
        backWelcomeBtn.addEventListener('click', () => {
            showModule('welcome');
        });
    }

    // --- MÓDULO REPORTES ---
    const generarFacturaDiariaBtn = document.getElementById('generar-factura-diaria-btn');
    const generarReporteMensualBtn = document.getElementById('generar-reporte-mensual-btn');
    const modalFacturaDiaria = document.getElementById('modal-factura-diaria');
    const modalReporteMensual = document.getElementById('modal-reporte-mensual');
    const cerrarModalFacturaDiaria = document.getElementById('cerrar-modal-factura-diaria');
    const cerrarModalReporteMensual = document.getElementById('cerrar-modal-reporte-mensual');
    const imprimirFacturaDiariaBtn = document.getElementById('imprimir-factura-diaria-btn');
    const imprimirReporteMensualBtn = document.getElementById('imprimir-reporte-mensual-btn');

    // Función para cargar datos de reportes
    async function loadReportesModule() {
        try {
            // Cargar datos diarios
            const responseDiarios = await fetchJson('/api/reportes/diarios');
            document.getElementById('pedidos-hoy').textContent = responseDiarios.pedidos_hoy;
            document.getElementById('ingresos-hoy').textContent = `$${responseDiarios.ingresos_hoy.toFixed(2)}`;

            // Cargar datos mensuales
            const responseMensuales = await fetchJson('/api/reportes/mensuales');
            document.getElementById('pedidos-mes').textContent = responseMensuales.pedidos_mes;
            document.getElementById('ingresos-mes').textContent = `$${responseMensuales.ingresos_mes.toFixed(2)}`;
        } catch (error) {
            console.error('Error cargando reportes:', error);
            alert('Error al cargar los datos de reportes');
        }
    }

    // Generar factura diaria
    if (generarFacturaDiariaBtn) {
        generarFacturaDiariaBtn.addEventListener('click', async () => {
            try {
                const facturaData = await fetchJson('/api/reportes/factura-diaria');
                mostrarFacturaDiaria(facturaData);
            } catch (error) {
                console.error('Error generando factura diaria:', error);
                alert('Error al generar la factura diaria');
            }
        });
    }

    // Generar reporte mensual
    if (generarReporteMensualBtn) {
        generarReporteMensualBtn.addEventListener('click', async () => {
            try {
                const reporteData = await fetchJson('/api/reportes/reporte-mensual');
                mostrarReporteMensual(reporteData);
            } catch (error) {
                console.error('Error generando reporte mensual:', error);
                alert('Error al generar el reporte mensual');
            }
        });
    }

    // Función para mostrar factura diaria
    function mostrarFacturaDiaria(data) {
        const fechaElement = document.getElementById('fecha-factura-diaria');
        const contentElement = document.getElementById('factura-diaria-content');
        
        fechaElement.textContent = data.fecha;
        
        let productosHTML = '';
        if (data.productos_vendidos.length > 0) {
            productosHTML = `
                <div class="factura-section">
                    <h4>Productos Vendidos</h4>
                    <table class="factura-table">
                        <thead>
                            <tr>
                                <th>Producto</th>
                                <th>Cantidad</th>
                                <th>Ingresos</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${data.productos_vendidos.map(p => `
                                <tr>
                                    <td>${p.nombre}</td>
                                    <td>${p.cantidad}</td>
                                    <td>$${p.ingresos.toFixed(2)}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        }

        let facturasHTML = '';
        if (data.facturas.length > 0) {
            facturasHTML = `
                <div class="factura-section">
                    <h4>Facturas del Día</h4>
                    <table class="factura-table">
                        <thead>
                            <tr>
                                <th>ID</th>
                                <th>Cliente</th>
                                <th>Total</th>
                                <th>Método</th>
                                <th>Hora</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${data.facturas.map(f => `
                                <tr>
                                    <td>#${f.id}</td>
                                    <td>${f.cliente}</td>
                                    <td>$${f.total.toFixed(2)}</td>
                                    <td>${f.metodo_pago}</td>
                                    <td>${f.hora}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        }

        contentElement.innerHTML = `
            <div class="factura-header-info">
                <h2>Café Terraza</h2>
                <p>Factura Diaria</p>
                <p>Fecha: ${data.fecha}</p>
            </div>
            
            <div class="factura-resumen">
                <div class="factura-resumen-item">
                    <span>Total Pedidos:</span>
                    <span>${data.total_pedidos}</span>
                </div>
                <div class="factura-resumen-item">
                    <span>Total Ingresos:</span>
                    <span>$${data.total_ingresos.toFixed(2)}</span>
                </div>
            </div>
            
            ${productosHTML}
            ${facturasHTML}
        `;

        modalFacturaDiaria.classList.remove('hidden');
    }

    // Función para mostrar reporte mensual
    function mostrarReporteMensual(data) {
        const mesElement = document.getElementById('mes-reporte');
        const contentElement = document.getElementById('reporte-mensual-content');
        
        const meses = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 
                      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
        mesElement.textContent = `${meses[data.mes]} ${data.año}`;
        
        let productosHTML = '';
        if (data.productos_mas_vendidos.length > 0) {
            productosHTML = `
                <div class="factura-section">
                    <h4>Productos Más Vendidos</h4>
                    <table class="factura-table">
                        <thead>
                            <tr>
                                <th>Producto</th>
                                <th>Cantidad</th>
                                <th>Ingresos</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${data.productos_mas_vendidos.map(p => `
                                <tr>
                                    <td>${p.nombre}</td>
                                    <td>${p.cantidad}</td>
                                    <td>$${p.ingresos.toFixed(2)}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        }

        let mejoresDiasHTML = '';
        if (data.mejores_dias.length > 0) {
            mejoresDiasHTML = `
                <div class="factura-section">
                    <h4>Días con Mayores Ventas</h4>
                    <table class="factura-table">
                        <thead>
                            <tr>
                                <th>Fecha</th>
                                <th>Ingresos</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${data.mejores_dias.map(d => `
                                <tr>
                                    <td>${d.fecha}</td>
                                    <td>$${d.ingresos.toFixed(2)}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        }

        let metodosHTML = '';
        if (data.metodos_pago.length > 0) {
            metodosHTML = `
                <div class="factura-section">
                    <h4>Métodos de Pago</h4>
                    <table class="factura-table">
                        <thead>
                            <tr>
                                <th>Método</th>
                                <th>Cantidad</th>
                                <th>Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${data.metodos_pago.map(m => `
                                <tr>
                                    <td>${m.metodo}</td>
                                    <td>${m.cantidad}</td>
                                    <td>$${m.total.toFixed(2)}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        }

        contentElement.innerHTML = `
            <div class="factura-header-info">
                <h2>Café Terraza</h2>
                <p>Reporte Mensual</p>
                <p>Período: ${meses[data.mes]} ${data.año}</p>
            </div>
            
            <div class="factura-resumen">
                <div class="factura-resumen-item">
                    <span>Total Pedidos:</span>
                    <span>${data.total_pedidos}</span>
                </div>
                <div class="factura-resumen-item">
                    <span>Total Ingresos:</span>
                    <span>$${data.total_ingresos.toFixed(2)}</span>
                </div>
                <div class="factura-resumen-item">
                    <span>Promedio Diario:</span>
                    <span>$${data.promedio_diario.toFixed(2)}</span>
                </div>
            </div>
            
            ${productosHTML}
            ${mejoresDiasHTML}
            ${metodosHTML}
        `;

        modalReporteMensual.classList.remove('hidden');
    }

    // Cerrar modales
    if (cerrarModalFacturaDiaria) {
        cerrarModalFacturaDiaria.addEventListener('click', () => {
            modalFacturaDiaria.classList.add('hidden');
        });
    }

    if (cerrarModalReporteMensual) {
        cerrarModalReporteMensual.addEventListener('click', () => {
            modalReporteMensual.classList.add('hidden');
        });
    }

    // Imprimir facturas
    if (imprimirFacturaDiariaBtn) {
        imprimirFacturaDiariaBtn.addEventListener('click', () => {
            imprimirFactura('factura-diaria-content', 'Factura Diaria');
        });
    }

    if (imprimirReporteMensualBtn) {
        imprimirReporteMensualBtn.addEventListener('click', () => {
            imprimirFactura('reporte-mensual-content', 'Reporte Mensual');
        });
    }

    // Función para imprimir facturas
    function imprimirFactura(contentId, titulo) {
        const content = document.getElementById(contentId).innerHTML;
        const ventanaImpresion = window.open('', '_blank', 'width=800,height=600');
        
        ventanaImpresion.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>${titulo} - Café Terraza</title>
                <style>
                    body { font-family: Arial, sans-serif; margin: 20px; }
                    .factura-header-info { text-align: center; margin-bottom: 30px; }
                    .factura-header-info h2 { color: #7a4f32; margin-bottom: 10px; }
                    .factura-resumen { background: #f7efe6; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
                    .factura-resumen-item { display: flex; justify-content: space-between; margin-bottom: 10px; font-weight: bold; }
                    .factura-section { margin-bottom: 25px; }
                    .factura-section h4 { color: #7a4f32; margin-bottom: 15px; }
                    .factura-table { width: 100%; border-collapse: collapse; margin-bottom: 15px; }
                    .factura-table th, .factura-table td { border: 1px solid #ddd; padding: 8px; text-align: left; }
                    .factura-table th { background-color: #f7efe6; font-weight: bold; }
                    .factura-thanks { text-align: center; margin-top: 30px; font-style: italic; color: #7a4f32; }
                    @media print { body { margin: 0; } }
                </style>
            </head>
            <body>
                ${content}
                
                <div class="factura-thanks">
                    Reporte generado automáticamente por Café Terraza
                </div>
                
                <script>
                    window.onload = function() {
                        window.print();
                        window.onafterprint = function() {
                            window.close();
                        };
                    };
                </script>
            </body>
            </html>
        `);
        
        ventanaImpresion.document.close();
    }

});
