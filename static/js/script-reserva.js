// static/js/script-reserva.js
document.addEventListener('DOMContentLoaded', () => {
  const mesaSelect = document.getElementById('reserva-mesa-select');
  const form = document.getElementById('reserva-standalone-form');
  const sinMesas = document.getElementById('sin-mesas');
  const btnCancel = document.getElementById('reserva-cancel');

  // Cargar mesas libres y poblar el select
  async function cargarMesasLibres() {
    try {
      mesaSelect.innerHTML = '<option value="">Cargando mesas...</option>';
      const res = await fetch('/api/mesas');
      const mesas = await res.json();
      const libres = mesas.filter(m => (m.estado || '').toLowerCase() === 'libre' || (m.estado || '').toLowerCase() === 'libre');
      mesaSelect.innerHTML = '';
      if (libres.length === 0) {
        mesaSelect.disabled = true;
        sinMesas.classList.remove('hidden');
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = '-- No hay mesas libres --';
        mesaSelect.appendChild(opt);
        return;
      }
      mesaSelect.disabled = false;
      sinMesas.classList.add('hidden');
      const placeholder = document.createElement('option'); placeholder.value = ''; placeholder.textContent = '-- Elegí una mesa libre --';
      mesaSelect.appendChild(placeholder);
      libres.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m.id;
        opt.textContent = `Mesa ${m.numero} (${m.estado || 'Libre'})`;
        mesaSelect.appendChild(opt);
      });
    } catch (err) {
      console.error('Error cargando mesas libres:', err);
      mesaSelect.innerHTML = '<option value="">Error al cargar</option>';
    }
  }

  // Submit: crear reserva usando PUT /api/mesas/<id>
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const mesaId = mesaSelect.value;
    if (!mesaId) { alert('Seleccioná una mesa libre.'); return; }

    const cliente = document.getElementById('reserva-cliente').value || null;
    const personas = parseInt(document.getElementById('reserva-personas').value, 10) || 1;
    const fecha = document.getElementById('reserva-fecha').value;
    const hora = document.getElementById('reserva-hora').value;

    if (!fecha || !hora) { alert('Ingresá fecha y hora.'); return; }

    try {
      const body = {
        estado: "Reservada",
        cliente: cliente,
        personas: personas,
        fecha: fecha, // formato YYYY-MM-DD
        hora: hora    // formato HH:MM
      };
      const res = await fetch(`/api/mesas/${mesaId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      const resp = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert('No se pudo reservar: ' + (resp.error || 'error desconocido'));
        return;
      }

      alert('✅ Reserva confirmada');
      // refrescar la lista de mesas libres
      await cargarMesasLibres();
      form.reset();
    } catch (err) {
      console.error('Error reservando:', err);
      alert('Error al reservar. Revisá la consola.');
    }
  });

  // Cancel: volver a dashboard (o limpiar)
  btnCancel.addEventListener('click', (e) => {
    // simplemente resetear el form
    form.reset();
  });

  // Inicial
  cargarMesasLibres();
});
