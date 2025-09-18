// script.js (Admin / Gestión)
// Reemplazar el archivo actual por este. Maneja: navegación, menú, pedidos, mesas, login/logout.

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
        'welcome': document.getElementById('welcome-message')
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
    const agregarProductoBtn = document.getElementById('agregar-producto-btn'); // por si lo quieres usar después

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

    // Safe helper: fetch JSON with error handling
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

    // -----------------------
    // --- LOGIN / LOGOUT
    // -----------------------
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

    // -----------------------
    // --- NAVEGACIÓN / UI
    // -----------------------
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            navLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');
            const moduleId = link.dataset.module;
            if (moduleId) {
                showModule(moduleId);
                if (moduleId === 'menu') loadMenuModule();
                if (moduleId === 'pedidos') loadPedidosModule();
                if (moduleId === 'mesas') loadMesasModule();
            } else {
                showModule('welcome');
            }
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
        });
    });

    // -----------------------
    // --- MÓDULO MENÚ
    // -----------------------
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
        const idInput = document.getElementById("producto-id");
        const nombreInput = document.getElementById("producto-nombre");
        const categoriaInput = document.getElementById("producto-categoria");
        const precioInput = document.getElementById("producto-precio");
        const form = document.getElementById("producto-form");

        if (producto) {
            titulo.textContent = "Editar Producto";
            idInput.value = producto.id;
            nombreInput.value = producto.nombre;
            categoriaInput.value = producto.categoria;
            precioInput.value = producto.precio;
        } else {
            titulo.textContent = "Nuevo Producto";
            idInput.value = "";
            nombreInput.value = "";
            categoriaInput.value = "";
            precioInput.value = "";
        }

        // 🚀 Limpia cualquier handler anterior y asegura que solo haya uno
        form.onsubmit = async (e) => {
            e.preventDefault();
            await handleSaveProducto(e);
        };

        modal.classList.remove("hidden");
    }


    async function handleSaveProducto(e) {
        e.preventDefault();
        const id = document.getElementById("producto-id").value;
        const nombre = document.getElementById("producto-nombre").value;
        const categoria = document.getElementById("producto-categoria").value;
        const precio = parseFloat(document.getElementById("producto-precio").value);

        const data = { nombre, categoria, precio };

        try {
            let res;
            if (id) {
                res = await fetch(`/api/menu/${id}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(data),
                });
            } else {
                res = await fetch(`/api/menu`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(data),
                });
            }

            if (!res.ok) throw new Error("Error al guardar producto");

            alert("✅ Producto guardado correctamente");
            document.getElementById("modal-producto").classList.add("hidden");
            loadMenuModule();
        } catch (err) {
            alert("⚠ " + err.message);
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

    // -----------------------
    // --- MÓDULO PEDIDOS
    // -----------------------
    async function loadPedidosModule() {
        if (!tablaPedidosContainer) return;
        try {
            const pedidos = await fetchJson('/api/pedidos');
            let html = `<table><thead><tr><th>ID</th><th>Cliente</th><th>Descripción</th><th>Total</th><th>Fecha</th><th>Acciones</th></tr></thead><tbody>`;
            pedidos.forEach(p => {
                const fechaFormateada = new Date(p.fecha).toLocaleString();
                const total = (typeof p.total === 'number') ? p.total.toFixed(2) : p.total;
                html += `
                    <tr>
                        <td>${p.id}</td>
                        <td>${escapeHtml(p.cliente || 'Consumidor Final')}</td>
                        <td>${escapeHtml(p.descripcion || 'Sin descripción')}</td>
                        <td>$${total}</td>
                        <td>${fechaFormateada}</td>
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

    // -----------------------
    // --- MÓDULO MESAS (sincronizado con API si existe)
    // -----------------------
    // Map server estado => class CSS (lowercase used in CSS)
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

            // click handler con nuevo flujo: Libre -> (Ocupar ahora | Reservar),
            // Reservada -> (Confirmar llegada / Cancelar), Ocupada -> (Liberar)
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

    // -----------------------
    // --- EVENT LISTENERS GLOBALES (Pedidos)
    // -----------------------
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


    // -----------------------
    // --- UTILIDADES
    // -----------------------
    // Escape simple para evitar inyección en tablas
    function escapeHtml(unsafe) {
        if (unsafe === null || unsafe === undefined) return '';
        return String(unsafe)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    // Iniciar mostrando bienvenida y cargando lo necesario
    showModule('welcome');
    // opcional: precargar algunos módulos para que la primera apertura sea rápida
    // loadPedidosModule();
    // loadMesasModule();
    loadMesasModule();
    // Botón abrir modal nuevo
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
if (tablaMenuContainer) {
    tablaMenuContainer.addEventListener("click", (e) => {
        if (e.target.classList.contains("btn-edit")) {
            const id = e.target.dataset.id;
            const producto = menuItems.find(p => p.id == id);
            openProductoModal(producto);
        }
        if (e.target.classList.contains("btn-delete")) {
            handleDeleteProducto(e.target.dataset.id);
        }
    });
}

    
    
}); // DOMContentLoaded end
