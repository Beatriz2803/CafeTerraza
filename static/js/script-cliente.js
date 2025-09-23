// script-cliente.js
document.addEventListener("DOMContentLoaded", () => {
  const menuContainer = document.getElementById("menu-container");
  const cartItems = document.getElementById("cart-items");
  const totalPriceElement = document.getElementById("total-price");
  const confirmOrderBtn = document.getElementById("confirm-order-btn");
  const mesaSelect = document.getElementById("mesa-select");

  let carrito = [];
  let productos = [];

  // Cargar menú desde backend
  function cargarMenu() {
    fetch("/api/menu")
      .then((response) => response.json())
      .then((menu) => {
        menuContainer.innerHTML = "";
        menu.forEach((item) => {
          const card = document.createElement("div");
          card.classList.add("menu-card");
          card.innerHTML = `
            <img src="${item.imagen_url}" alt="${item.nombre}" class="product-image">
            <h4>${item.nombre}</h4>
            <p>$${item.precio.toFixed(2)}</p>
            <button class="add-to-cart" data-id="${item.id}" data-nombre="${item.nombre}" data-precio="${item.precio}">
              Agregar
            </button>
          `;
          menuContainer.appendChild(card);
        });

        document.querySelectorAll(".add-to-cart").forEach((btn) => {
          btn.addEventListener("click", () => {
            agregarAlCarrito({
              id: btn.dataset.id,
              nombre: btn.dataset.nombre,
              precio: parseFloat(btn.dataset.precio),
            });
          });
        });
      })
      .catch((error) => console.error("Error cargando el menú:", error));
  }

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
      total += item.precio;
      const li = document.createElement("li");
      li.textContent = `${item.nombre} - $${item.precio.toFixed(2)}`;
      const eliminarBtn = document.createElement("button");
      eliminarBtn.textContent = "❌";
      eliminarBtn.style.marginLeft = "10px";
      eliminarBtn.addEventListener("click", () => {
        eliminarDelCarrito(index);
      });
      li.appendChild(eliminarBtn);
      cartItems.appendChild(li);
    });
    totalPriceElement.textContent = total.toFixed(2);
  }

  function eliminarDelCarrito(index) {
    carrito.splice(index, 1);
    renderCarrito();
  }

  // Confirmar pedido
  confirmOrderBtn.addEventListener("click", () => {
    const mesaSeleccionada = mesaSelect.value;
    const clienteNombre = document.getElementById("cliente-nombre")?.value || null;

    if (carrito.length === 0) {
      alert("Tu carrito está vacío 😅");
      return;
    }

    const pedido = {
      cliente: clienteNombre,
      mesa: mesaSeleccionada || null,
      items: carrito.map((p) => ({ id: parseInt(p.id), cantidad: 1 })),
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
        } else {
          alert("⚠ Error: " + (data.error || "No se pudo crear el pedido"));
        }
        carrito = [];
        renderCarrito();
        mesaSelect.value = "";
      })
      .catch((error) => console.error("Error al confirmar pedido:", error));
  });

  // Inicializar
  cargarMenu();
  cargarMesas();
});
