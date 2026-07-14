// ========== ESTADO GLOBAL ==========
let actividades = [];
let actividadesMes = [];
let actividadesFiltradas = [];
let mesActual = new Date().getMonth();
let añoActual = new Date().getFullYear();
let diaSeleccionado = null;
let chartInstance = null;
let chartEstadisticasInstance = null;
let actividadEnEdicion = null;
let modalConfirmCallback = null;
let actividadDetalleId = null;

// Estado para drag & drop
let dragTimeout = null;
let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;
let dragItemId = null;

// ========== FUNCIONES DE API ==========
async function fetchActividades(fecha = null, mes = null, año = null) {
    try {
        let url = '/api/actividades';
        const params = new URLSearchParams();
        if (fecha) params.append('fecha', fecha);
        if (mes !== null && año !== null) {
            params.append('mes', mes + 1);
            params.append('año', año);
        }
        if (params.toString()) url += '?' + params.toString();
        
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Error ${response.status}`);
        const data = await response.json();
        
        if (mes !== null && año !== null) {
            actividadesMes = Array.isArray(data) ? data : [];
        }
        actividades = Array.isArray(data) ? data : [];
        return actividades;
    } catch (error) {
        console.error('Error fetching actividades:', error);
        return [];
    }
}

async function crearActividad(data) {
    try {
        const response = await fetch('/api/actividades', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        return await response.json();
    } catch (error) {
        return null;
    }
}

async function actualizarActividad(id, data) {
    try {
        const response = await fetch(`/api/actividades/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        return await response.json();
    } catch (error) {
        return null;
    }
}

async function eliminarActividad(id) {
    try {
        await fetch(`/api/actividades/${id}`, { method: 'DELETE' });
        return true;
    } catch (error) {
        return false;
    }
}

// ========== RENDERIZAR CALENDARIO (EVITA DUPLICADOS) ==========
async function renderCalendario(recargarDatos = true) {
    const grid = document.getElementById('calendarioGrid');
    const wrapper = document.querySelector('.calendario-wrapper');
    const containerResultados = document.getElementById('filtroResultados');
    const listaFiltro = document.getElementById('filtroLista');

    // 1. LIMPIEZA TOTAL PARA EVITAR DUPLICADOS
    grid.innerHTML = '';
    
    if (recargarDatos) {
        await fetchActividades(null, mesActual, añoActual);
    }

    const estado = document.getElementById('filtroEstado').value;
    const busqueda = document.getElementById('filtroBusqueda').value.trim().toLowerCase();
    const hayFiltro = (estado !== 'todas' || busqueda !== '');

    actividadesFiltradas = actividadesMes.filter(act => {
        let coincideEstado = (estado === 'todas') || 
                             (estado === 'pendientes' && !act.cumplida) || 
                             (estado === 'cumplidas' && act.cumplida);
        
        let coincideBusqueda = true;
        if (busqueda) {
            const contenido = `${act.titulo} ${act.descripcion || ''} ${act.direccion || ''} ${act.solucion || ''}`.toLowerCase();
            coincideBusqueda = contenido.includes(busqueda);
        }
        return coincideEstado && coincideBusqueda;
    });

    if (hayFiltro) {
        wrapper.style.display = 'none';
        containerResultados.style.display = 'block';
        mostrarResultadosFiltro();
    } else {
        wrapper.style.display = 'block';
        containerResultados.style.display = 'none';
        listaFiltro.innerHTML = '';

        // Cabecera
        ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'].forEach(d => {
            const div = document.createElement('div');
            div.className = 'dia-header';
            div.textContent = d;
            grid.appendChild(div);
        });

        const primerDia = new Date(añoActual, mesActual, 1).getDay();
        const diasEnMes = new Date(añoActual, mesActual + 1, 0).getDate();
        const hoyStr = new Date().toISOString().split('T')[0];

        for (let i = 0; i < primerDia; i++) {
            const div = document.createElement('div');
            div.className = 'dia otro-mes';
            grid.appendChild(div);
        }

        for (let d = 1; d <= diasEnMes; d++) {
            const fechaStr = `${añoActual}-${String(mesActual + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const div = document.createElement('div');
            div.className = 'dia';
            div.dataset.fecha = fechaStr;
            
            const actisDia = actividadesMes.filter(a => a.fecha === fechaStr);
            const pendientes = actisDia.filter(a => !a.cumplida).length;
            
            if (actisDia.length > 0) {
                div.classList.add('tiene-actividades');
                div.classList.add(pendientes === 0 ? 'todas-cumplidas' : 'tiene-pendientes');
                const badge = document.createElement('span');
                badge.className = 'dia-badge';
                badge.textContent = actisDia.length;
                div.appendChild(badge);
            }

            const numSpan = document.createElement('span');
            numSpan.className = 'dia-numero';
            numSpan.textContent = d;
            div.appendChild(numSpan);

            if (fechaStr === hoyStr) div.classList.add('hoy');
            div.onclick = () => { if(!isDragging) abrirModalDia(fechaStr); };

            // Drag & Drop
            div.ondragover = (e) => e.preventDefault();
            div.ondrop = async (e) => {
                e.preventDefault();
                if (dragItemId) {
                    await actualizarActividad(dragItemId, { fecha: fechaStr });
                    dragItemId = null;
                    await renderCalendario(true);
                }
            };
            grid.appendChild(div);
        }
    }

    document.getElementById('totalActividades').textContent = actividadesMes.length;
    document.getElementById('totalCumplidas').textContent = actividadesMes.filter(a => a.cumplida).length;
    document.getElementById('mesLabel').textContent = 
        new Date(añoActual, mesActual).toLocaleString('es', { month: 'long', year: 'numeric' });
}

// ========== FUNCIONES DE CIERRE DE MODALES (FIX BUGS) ==========
function cerrarModalDia() {
    document.getElementById('modalDiaOverlay').classList.remove('active');
}

function cerrarModalEstadisticas() {
    document.getElementById('modalEstadisticasOverlay').classList.remove('active');
}

function cerrarModalDetalle() {
    document.getElementById('modalActividadDetalleOverlay').classList.remove('active');
}

function cerrarModalActividad() {
    document.getElementById('modalActividadOverlay').classList.remove('active');
    actividadEnEdicion = null;
}

function cerrarModalConfirm() {
    document.getElementById('modalConfirmOverlay').classList.remove('active');
    modalConfirmCallback = null;
}

function cerrarTodosModales() {
    cerrarModalDia();
    cerrarModalEstadisticas();
    cerrarModalDetalle();
    cerrarModalActividad();
    cerrarModalConfirm();
}

// ========== RESULTADOS FILTRO ==========
function mostrarResultadosFiltro() {
    const lista = document.getElementById('filtroLista');
    lista.innerHTML = '';
    if (actividadesFiltradas.length === 0) {
        lista.innerHTML = `<div style="text-align:center;padding:20px;color:#95a5a6;">Sin resultados</div>`;
        return;
    }
    actividadesFiltradas.forEach(act => {
        const div = document.createElement('div');
        div.className = 'actividad-item';
        div.innerHTML = `
            <input type="checkbox" ${act.cumplida ? 'checked' : ''} onchange="cambiarEstadoFiltro(event, '${act.id}')">
            <div class="actividad-info" onclick="abrirModalDetalle('${act.id}')">
                <div class="actividad-titulo" style="${act.cumplida ? 'text-decoration:line-through' : ''}">${act.titulo}</div>
                <div class="actividad-detalle">${act.fecha}</div>
            </div>
        `;
        lista.appendChild(div);
    });
}

async function cambiarEstadoFiltro(e, id) {
    await actualizarActividad(id, { cumplida: e.target.checked });
    await renderCalendario(true);
}

// ========== MODAL DIA ==========
async function abrirModalDia(fechaStr) {
    diaSeleccionado = fechaStr;
    const fecha = new Date(fechaStr + "T00:00:00");
    document.getElementById('modalDiaFecha').textContent = 
        fecha.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    
    const actisDia = actividadesMes.filter(a => a.fecha === fechaStr);
    renderActividadesModal(actisDia);
    actualizarGrafico(actisDia);
    document.getElementById('modalDiaOverlay').classList.add('active');
}

function renderActividadesModal(actis) {
    const lista = document.getElementById('listaActividadesModal');
    lista.innerHTML = '';
    document.getElementById('modalResumenDia').innerHTML = `<i class="fas fa-chart-pie"></i> ${actis.filter(a => a.cumplida).length}/${actis.length}`;

    if (actis.length === 0) {
        lista.innerHTML = `<div class="empty-state"><p>No hay actividades</p></div>`;
        return;
    }
    actis.forEach(act => {
        const div = document.createElement('div');
        div.className = 'actividad-item';
        div.draggable = true;
        div.innerHTML = `
            <input type="checkbox" ${act.cumplida ? 'checked' : ''} onchange="toggleCheck('${act.id}', this.checked)">
            <div class="actividad-info" onclick="abrirModalDetalle('${act.id}')">
                <div class="actividad-titulo ${act.cumplida ? 'cumplida' : ''}">${act.titulo}</div>
                <div class="actividad-detalle">${act.hora || ''} ${act.direccion || ''}</div>
            </div>
            <button class="btn-eliminar" onclick="borrarAct('${act.id}', '${act.titulo}')"><i class="fas fa-trash"></i></button>
        `;
        div.ondragstart = () => { dragItemId = act.id; };
        lista.appendChild(div);
    });
}

async function toggleCheck(id, valor) {
    await actualizarActividad(id, { cumplida: valor });
    await renderCalendario(true);
    abrirModalDia(diaSeleccionado);
}

// ========== DETALLE Y EDITAR ==========
function abrirModalDetalle(id) {
    const act = actividades.find(a => a.id == id);
    if (!act) return;
    actividadDetalleId = id;
    document.getElementById('detalleTitulo').textContent = act.titulo;
    document.getElementById('detalleDescripcion').textContent = act.descripcion || 'Sin descripción';
    document.getElementById('detalleSolucion').textContent = act.solucion || 'Sin solución';
    document.getElementById('detalleDireccion').textContent = act.direccion || '-';
    document.getElementById('detalleHora').textContent = act.hora || '-';
    document.getElementById('detalleFecha').textContent = act.fecha;
    document.getElementById('detalleEstado').innerHTML = act.cumplida ? 'Cumplida' : 'Pendiente';
    document.getElementById('modalActividadDetalleOverlay').classList.add('active');
}

function editarDesdeDetalle() {
    const act = actividades.find(a => a.id == actividadDetalleId);
    if(act) {
        cerrarModalDetalle();
        abrirModalActividad(act);
    }
}

function abrirModalActividad(act = null) {
    actividadEnEdicion = act;
    document.getElementById('modalActividadTitulo').textContent = act ? 'Editar' : 'Nueva';
    document.getElementById('inputTitulo').value = act ? act.titulo : '';
    document.getElementById('inputDescripcion').value = act ? act.descripcion || '' : '';
    document.getElementById('inputSolucion').value = act ? act.solucion || '' : '';
    document.getElementById('inputDireccion').value = act ? act.direccion || '' : '';
    document.getElementById('inputHora').value = act ? act.hora || '' : '';
    document.getElementById('inputFecha').value = act ? act.fecha : (diaSeleccionado || new Date().toISOString().split('T')[0]);
    document.getElementById('modalActividadOverlay').classList.add('active');
}

async function guardarActividadForm(e) {
    e.preventDefault();
    const data = {
        titulo: document.getElementById('inputTitulo').value,
        descripcion: document.getElementById('inputDescripcion').value,
        solucion: document.getElementById('inputSolucion').value,
        direccion: document.getElementById('inputDireccion').value,
        hora: document.getElementById('inputHora').value,
        fecha: document.getElementById('inputFecha').value
    };
    if (actividadEnEdicion) await actualizarActividad(actividadEnEdicion.id, data);
    else await crearActividad(data);
    cerrarModalActividad();
    await renderCalendario(true);
    if (diaSeleccionado) abrirModalDia(data.fecha);
}

// ========== ESTADISTICAS ==========
function abrirModalEstadisticas() {
    const total = actividadesMes.length;
    const cumplidas = actividadesMes.filter(a => a.cumplida).length;
    document.getElementById('estTotal').textContent = total;
    document.getElementById('estCumplidas').textContent = cumplidas;
    document.getElementById('estPendientes').textContent = total - cumplidas;

    const ctx = document.getElementById('chartEstadisticas').getContext('2d');
    if (chartEstadisticasInstance) chartEstadisticasInstance.destroy();
    chartEstadisticasInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Cumplidas', 'Pendientes'],
            datasets: [{ data: [cumplidas, total - cumplidas], backgroundColor: ['#003366', '#CC0000'] }]
        }
    });
    document.getElementById('modalEstadisticasOverlay').classList.add('active');
}

// ========== NAVEGACION ==========
function cambiarMes(delta) {
    mesActual += delta;
    if (mesActual > 11) { mesActual = 0; añoActual++; }
    else if (mesActual < 0) { mesActual = 11; añoActual--; }
    renderCalendario(true);
}

function irHoy() {
    const hoy = new Date();
    mesActual = hoy.getMonth();
    añoActual = hoy.getFullYear();
    renderCalendario(true);
}

function aplicarFiltrosCalendario() {
    renderCalendario(false);
}

function limpiarFiltros() {
    document.getElementById('filtroEstado').value = 'todas';
    document.getElementById('filtroBusqueda').value = '';
    renderCalendario(false);
}

function borrarAct(id, titulo) {
    mostrarModalConfirm("Eliminar", `¿Borrar "${titulo}"?`, async () => {
        await eliminarActividad(id);
        await renderCalendario(true);
        if (diaSeleccionado) abrirModalDia(diaSeleccionado);
    });
}

function mostrarModalConfirm(titulo, msj, cb) {
    document.getElementById('modalConfirmTitulo').textContent = titulo;
    document.getElementById('modalConfirmMensaje').textContent = msj;
    modalConfirmCallback = cb;
    document.getElementById('modalConfirmOverlay').classList.add('active');
}

document.getElementById('modalConfirmBtn').onclick = () => {
    if(modalConfirmCallback) modalConfirmCallback();
    cerrarModalConfirm();
};

function actualizarGrafico(actis) {
    const ctx = document.getElementById('chartDia').getContext('2d');
    if (chartInstance) chartInstance.destroy();
    if (actis.length === 0) return;
    const c = actis.filter(a => a.cumplida).length;
    chartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: { datasets: [{ data: [c, actis.length - c], backgroundColor: ['#003366', '#CC0000'] }] },
        options: { cutout: '70%' }
    });
}

// ========== INIT ==========
document.addEventListener('DOMContentLoaded', () => {
    renderCalendario(true);
    
    // Cerrar al hacer clic fuera del modal
    document.querySelectorAll('.modal-overlay').forEach(ov => {
        ov.onclick = (e) => { if(e.target === ov) cerrarTodosModales(); };
    });

    document.addEventListener('keydown', e => { if(e.key === 'Escape') cerrarTodosModales(); });
});
