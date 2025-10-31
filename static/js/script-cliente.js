// script-cliente.js
document.addEventListener("DOMContentLoaded", () => {
  const track = document.getElementById("menu-carousel");  
  const prevBtn = document.getElementById("prev-btn");
  const nextBtn = document.getElementById("next-btn");
  const detalleNombre = document.getElementById("detalle-nombre");
  const detalleInfo = document.getElementById("detalle-info");
  const agregarBtn = document.getElementById("agregar-btn");

  const cartItems = document.getElementById("cart-items");
  const totalPriceElement = document.getElementById("total-price");
  const confirmOrderBtn = document.getElementById("confirm-order-btn");
  const modalidadEntrega = document.getElementById("modalidad-entrega");


  let carrito = [];
  let productos = [];
  let selectedIndex = 0;
  let cantidadSeleccionada = 1;


  // Cargar menú desde backend
  function cargarMenu() {
    fetch("/api/menu")
      .then((response) => response.json())
      .then((menu) => {
        productos = menu;
        renderCarousel();
      })
      .catch((error) => {
        console.error("Error cargando el menú:", error);
        track.innerHTML = "<p style='color:#888;padding:10px;'>No se pudo cargar el menú</p>";
      });
  }

// render del carrusel
function renderCarousel() {
  track.innerHTML = "";
  productos.forEach((p, idx) => {
    const item = document.createElement("div");
    item.className = "carousel-item";
    item.dataset.index = idx;
    item.innerHTML = `
      <img src="${p.imagen_url}" alt="${p.nombre}">
      <h4>${p.nombre}</h4>
      <p class="descripcion">${p.descripcion || ''}</p> 
    `;

    item.addEventListener("click", () => selectProduct(idx));
    track.appendChild(item);
  });
  if (productos.length) selectProduct(0);
}
  function scrollToProduct(index) {
    const item = document.querySelector(`.carousel-item[data-index="${index}"]`);
    if (item) {
      // Desplazar para que el item quede en el centro del viewport
      const container = document.getElementById("menu-carousel");
      const containerWidth = container.offsetWidth;
      const itemLeft = item.offsetLeft;
      const itemWidth = item.offsetWidth;
      const scrollPosition = itemLeft - (containerWidth - itemWidth) / 2;
      container.scrollTo({ left: scrollPosition, behavior: 'smooth' });
    }
  }


function selectProduct(index) {
  selectedIndex = index;
  const items = document.querySelectorAll(".carousel-item");
  items.forEach((el, i) => el.classList.toggle("selected", i === index));
  scrollToProduct(index);
  const p = productos[index];
  detalleNombre.textContent = p.nombre;
  detalleInfo.innerHTML = `
    ${p.descripcion || ""}<br>
    <small>$${p.precio.toFixed(2)}</small>
    <div class="cantidad-control">
      <button id="menos-btn">-</button>
      <span id="cantidad">${cantidadSeleccionada}</span>
      <button id="mas-btn">+</button>
    </div>
  `;
  cantidadSeleccionada = 1;
  actualizarCantidad();
  document.getElementById("menos-btn").addEventListener("click", () => cambiarCantidad(-1));
  document.getElementById("mas-btn").addEventListener("click", () => cambiarCantidad(1));
  agregarBtn.disabled = false;
  updateArrowButtons();

}

function updateArrowButtons() {
  prevBtn.disabled = selectedIndex === 0;
  nextBtn.disabled = selectedIndex === productos.length - 1;
}


function cambiarCantidad(delta) {
  cantidadSeleccionada = Math.max(1, cantidadSeleccionada + delta);
  actualizarCantidad();
}

function actualizarCantidad() {
  const el = document.getElementById("cantidad");
  if (el) el.textContent = cantidadSeleccionada;
}

// agregar al carrito desde el detalle
agregarBtn.addEventListener("click", () => {
  const producto = productos[selectedIndex]; // ✅ producto seleccionado
  if (!producto) return;

  carrito.push({
    id: producto.id,
    nombre: producto.nombre,
    precio: producto.precio,
    cantidad: cantidadSeleccionada
  });
  renderCarrito();
});


  // Mostrar opciones de mesa
  function cargarMesas() {
    mesaSelect.addEventListener("change", () => {
      if (mesaSelect.value === "mesa") {
        document.getElementById("reserva-boton-container").classList.remove("hidden");
      } else {
        document.getElementById("reserva-boton-container").classList.add("hidden");
      }
    });
  }

  // Carrito
  function agregarAlCarrito(producto) {
    carrito.push(producto);
    renderCarrito();
  }

  function renderCarrito() {
    cartItems.innerHTML = "";
    let total = 0;
    carrito.forEach((item, index) => {
      const subtotal = item.precio * item.cantidad;
      total += subtotal;
      const li = document.createElement("li");
      li.innerHTML = `
        ${item.nombre} x${item.cantidad} - $${subtotal.toFixed(2)}
        <button class="remove-btn">❌</button>
      `;
      li.querySelector(".remove-btn").addEventListener("click", () => {
        carrito.splice(index, 1);
        renderCarrito();
      });
      cartItems.appendChild(li);
    });
    totalPriceElement.textContent = "$" + total.toFixed(2);
  }


  function eliminarDelCarrito(index) {
    carrito.splice(index, 1);
    renderCarrito();
  }

  // Confirmar pedido
  confirmOrderBtn.addEventListener("click", () => {
    const clienteNombre = document.getElementById("cliente-nombre")?.value || null;
    const modalidadSeleccionada = modalidadEntrega ? modalidadEntrega.value : null;
    if (carrito.length === 0) {
    alert("Tu carrito está vacío 😅");
    return;
  }

  confirmOrderBtn.disabled = true; 
  confirmOrderBtn.textContent = "Procesando..."; // Feedback visual

    const pedido = {
      cliente: clienteNombre,
      modalidad: modalidadSeleccionada || null,
      items: carrito.map((p) => ({ id: parseInt(p.id), cantidad: p.cantidad })),
    };

    fetch("/api/pedidos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(pedido),
  })
    .then((response) => response.json())
    .then((data) => {
      if (data.id) {
        alert("✅ Pedido confirmado (ID: " + data.id + ")");
        carrito = []; // Vaciar carrito solo si el pedido es exitoso
        renderCarrito();
      } else {
        alert("⚠ Error: " + (data.error || "No se pudo crear el pedido"));
      }
    })
    .catch((error) => {
      console.error("Error al confirmar pedido:", error);
      alert("Hubo un error de red. Inténtalo de nuevo.");
    })
    .finally(() => {
      // --- INICIO DE LA SOLUCIÓN ---
      // 2. Volver a habilitar el botón al finalizar (ya sea con éxito o error)
      confirmOrderBtn.disabled = false;
      confirmOrderBtn.textContent = "Confirmar Pedido";
      // --- FIN DE LA SOLUCIÓN ---
    });
});
    prevBtn.addEventListener("click", () => {
      if (selectedIndex > 0) {
        selectProduct(selectedIndex - 1);
        scrollToProduct(selectedIndex - 1);
      }
    });
    nextBtn.addEventListener("click", () => {
      if (selectedIndex < productos.length - 1) {
        selectProduct(selectedIndex + 1);
        scrollToProduct(selectedIndex + 1);
      }
    });

  // Inicializar
  cargarMenu();
});
