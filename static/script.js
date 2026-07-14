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
let isProcessing = false; // Para evitar doble clic
let toastTimeout = null;

// Estado para drag & drop
let dragTimeout = null;
let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;
let dragItemId = null;

// ========== TOAST NOTIFICATIONS ==========
function showToast(message, type = 'success', duration = 3000) {
    const container = document.getElementById('toastContainer');
    if (!container) {
        // Crear container si no existe
        const newContainer = document.createElement('div');
        newContainer.id = 'toastContainer';
        newContainer.className = 'toast-container';
        document.body.appendChild(newContainer);
    }
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const iconMap = {
        success: 'fa-check-circle',
        error: 'fa-exclamation-circle',
        info: 'fa-info-circle'
    };
    toast.innerHTML = `<i class="fas ${iconMap[type] || 'fa-info-circle'}"></i> ${message}`;
    
    const containerEl = document.getElementById('toastContainer');
    containerEl.appendChild(toast);
    
    // Auto-eliminar después de duration
    setTimeout(() => {
        toast.classList.add('removing');
        setTimeout(() => {
            toast.remove();
            if (containerEl.children.length === 0) {
                containerEl.remove();
            }
        }, 300);
    }, duration);
}

// ========== FUNCIONES DE API CON CONTROL DE DOBLE CLIC ==========
async function fetchActividades(fecha = null, mes = null, año = null) {
    if (isProcessing) return [];
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
    if (isProcessing) return null;
    isProcessing = true;
    try {
        const response = await fetch('/api/actividades', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        const result = await response.json();
        if (response.ok) {
            showToast('✅ Actividad creada exitosamente', 'success');
            return result;
        } else {
            showToast(result.error || '❌ Error al crear actividad', 'error');
            return null;
        }
    } catch (error) {
        showToast('❌ Error de conexión', 'error');
        return null;
    } finally {
        isProcessing = false;
    }
}

async function actualizarActividad(id, data) {
    if (isProcessing) return null;
    isProcessing = true;
    try {
        const response = await fetch(`/api/actividades/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        const result = await response.json();
        if (response.ok) {
            showToast('✅ Actividad actualizada', 'success');
            return result;
        } else {
            showToast(result.error || '❌ Error al actualizar', 'error');
            return null;
        }
    } catch (error) {
        showToast('❌ Error de conexión', 'error');
        return null;
    } finally {
        isProcessing = false;
    }
}

async function eliminarActividad(id) {
    if (isProcessing) return false;
    isProcessing = true;
    try {
        const response = await fetch(`/api/actividades/${id}`, { method: 'DELETE' });
        if (response.ok) {
            showToast('🗑️ Actividad eliminada', 'success');
            return true;
        } else {
            showToast('❌ Error al eliminar', 'error');
            return false;
        }
    } catch (error) {
        showToast('❌ Error de conexión', 'error');
        return false;
    } finally {
        isProcessing = false;
    }
}

// ========== FUNCIONES DE SIN ACTIVIDADES ==========
async function marcarSinActividades(fechaStr) {
    if (isProcessing) return;
    if (!fechaStr) {
        showToast('❌ No hay fecha seleccionada', 'error');
        return;
    }
    
    // Verificar si ya tiene actividades reales
    const actisDia = actividadesMes.filter(a => a.fecha === fechaStr);
    const tieneActividadesReales = actisDia.some(a => !a.sin_actividades);
    
    if (tieneActividadesReales) {
        showToast('⚠️ Este día ya tiene actividades programadas', 'error');
        return;
    }
    
    // Verificar si ya está marcado
    const yaMarcado = actisDia.some(a => a.sin_actividades);
    if (yaMarcado) {
        showToast('ℹ️ Este día ya está marcado como libre', 'info');
        return;
    }
    
    isProcessing = true;
    try {
        const data = {
            fecha: fechaStr,
            titulo: '📅 Día Libre',
            descripcion: 'Día sin actividades programadas',
            solucion: '',
            direccion: '',
            hora: null,
            sin_actividades: true
        };
        const result = await crearActividad(data);
        if (result) {
            showToast('✅ Día marcado como libre', 'success');
            await renderCalendario(true);
            // Forzar actualización del modal
            if (diaSeleccionado === fechaStr) {
                await abrirModalDia(fechaStr);
            }
        }
    } catch (error) {
        showToast('❌ Error al marcar día', 'error');
        console.error('Error en marcarSinActividades:', error);
    } finally {
        isProcessing = false;
    }
}

async function eliminarSinActividades(fechaStr) {
    if (isProcessing) return;
    const actis = actividadesMes.filter(a => a.fecha === fechaStr && a.sin_actividades);
    if (actis.length === 0) {
        showToast('ℹ️ No hay marcador para eliminar', 'info');
        return;
    }
    
    isProcessing = true;
    try {
        for (const act of actis) {
            await eliminarActividad(act.id);
        }
        await renderCalendario(true);
        // Forzar actualización del modal
        if (diaSeleccionado === fechaStr) {
            await abrirModalDia(fechaStr);
        }
        showToast('✅ Día desmarcado como libre', 'info');
    } catch (error) {
        showToast('❌ Error al desmarcar día', 'error');
        console.error('Error en eliminarSinActividades:', error);
    } finally {
        isProcessing = false;
    }
}

// ========== FUNCIONES DE CIERRE DE MODALES ==========
function cerrarModalDia() {
    document.getElementById('modalDiaOverlay').classList.remove('active');
    // Limpiar el chart al cerrar
    if (chartInstance) {
        chartInstance.destroy();
        chartInstance = null;
    }
}

function cerrarModalEstadisticas() {
    document.getElementById('modalEstadisticasOverlay').classList.remove('active');
    if (chartEstadisticasInstance) {
        chartEstadisticasInstance.destroy();
        chartEstadisticasInstance = null;
    }
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

// ========== RENDERIZAR CALENDARIO ==========
async function renderCalendario(recargarDatos = true) {
    const grid = document.getElementById('calendarioGrid');
    const wrapper = document.querySelector('.calendario-wrapper');
    const containerResultados = document.getElementById('filtroResultados');
    const listaFiltro = document.getElementById('filtroLista');

    // LIMPIEZA TOTAL PARA EVITAR DUPLICADOS
    grid.innerHTML = '';
    
    if (recargarDatos) {
        await fetchActividades(null, mesActual, añoActual);
    }

    const estado = document.getElementById('filtroEstado').value;
    const busqueda = document.getElementById('filtroBusqueda').value.trim().toLowerCase();
    const hayFiltro = (estado !== 'todas' || busqueda !== '');

    actividadesFiltradas = actividadesMes.filter(act => {
        // Excluir actividades de "sin_actividades" de los filtros normales
        if (act.sin_actividades) return false;
        
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

        // Cabecera de días
        ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'].forEach(d => {
            const div = document.createElement('div');
            div.className = 'dia-header';
            div.textContent = d;
            grid.appendChild(div);
        });

        const primerDia = new Date(añoActual, mesActual, 1).getDay();
        const diasEnMes = new Date(añoActual, mesActual + 1, 0).getDate();
        const hoyStr = new Date().toISOString().split('T')[0];

        // Días vacíos antes del primer día
        for (let i = 0; i < primerDia; i++) {
            const div = document.createElement('div');
            div.className = 'dia otro-mes';
            grid.appendChild(div);
        }

        // Días del mes
        for (let d = 1; d <= diasEnMes; d++) {
            const fechaStr = `${añoActual}-${String(mesActual + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const div = document.createElement('div');
            div.className = 'dia';
            div.dataset.fecha = fechaStr;
            
            const actisDia = actividadesMes.filter(a => a.fecha === fechaStr);
            const actividadesReales = actisDia.filter(a => !a.sin_actividades);
            const tieneSinActividades = actisDia.some(a => a.sin_actividades);
            const pendientes = actividadesReales.filter(a => !a.cumplida).length;
            
            // Determinar clase del día
            if (tieneSinActividades && actividadesReales.length === 0) {
                // Día marcado como "Sin Actividades Previstas" - AZUL
                div.classList.add('sin-actividades-previstas');
                const badge = document.createElement('span');
                badge.className = 'dia-badge';
                badge.textContent = '✓';
                div.appendChild(badge);
            } else if (actividadesReales.length > 0) {
                div.classList.add('tiene-actividades');
                div.classList.add(pendientes === 0 ? 'todas-cumplidas' : 'tiene-pendientes');
                const badge = document.createElement('span');
                badge.className = 'dia-badge';
                badge.textContent = actividadesReales.length;
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
                    const act = actividades.find(a => a.id == dragItemId);
                    if (act && act.sin_actividades) {
                        showToast('⚠️ No se puede mover el marcador de "Día Libre"', 'error');
                        return;
                    }
                    await actualizarActividad(dragItemId, { fecha: fechaStr });
                    dragItemId = null;
                    await renderCalendario(true);
                }
            };
            grid.appendChild(div);
        }
    }

    // Actualizar contadores
    const actividadesReales = actividadesMes.filter(a => !a.sin_actividades);
    document.getElementById('totalActividades').textContent = actividadesReales.length;
    document.getElementById('totalCumplidas').textContent = actividadesReales.filter(a => a.cumplida).length;
    document.getElementById('mesLabel').textContent = 
        new Date(añoActual, mesActual).toLocaleString('es', { month: 'long', year: 'numeric' });
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
    if (isProcessing) return;
    await actualizarActividad(id, { cumplida: e.target.checked });
    await renderCalendario(true);
}

// ========== MODAL DIA ==========
async function abrirModalDia(fechaStr) {
    if (isProcessing) return;
    diaSeleccionado = fechaStr;
    const fecha = new Date(fechaStr + "T00:00:00");
    document.getElementById('modalDiaFecha').textContent = 
        fecha.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    
    const actisDia = actividadesMes.filter(a => a.fecha === fechaStr);
    const tieneSinActividades = actisDia.some(a => a.sin_actividades);
    const actividadesReales = actisDia.filter(a => !a.sin_actividades);
    
    renderActividadesModal(actividadesReales, tieneSinActividades);
    actualizarGrafico(actividadesReales);
    
    // Actualizar botón "Sin Actividades Previstas"
    const btnSinAct = document.getElementById('btnSinActividades');
    console.log('Debug - tieneSinActividades:', tieneSinActividades, 'actividadesReales.length:', actividadesReales.length);
    
    if (tieneSinActividades && actividadesReales.length === 0) {
        // Ya está marcado como sin actividades
        btnSinAct.classList.add('activo');
        btnSinAct.innerHTML = '<i class="fas fa-check-circle"></i> Quitar marcador';
        btnSinAct.onclick = function() { 
            console.log('Eliminando marcador para:', fechaStr);
            eliminarSinActividades(fechaStr); 
        };
        btnSinAct.style.display = 'flex';
    } else if (actividadesReales.length === 0 && !tieneSinActividades) {
        // No hay actividades y no está marcado
        btnSinAct.classList.remove('activo');
        btnSinAct.innerHTML = '<i class="fas fa-calendar-times"></i> Marcar como libre';
        btnSinAct.onclick = function() { 
            console.log('Marcando como libre:', fechaStr);
            marcarSinActividades(fechaStr); 
        };
        btnSinAct.style.display = 'flex';
    } else {
        // Tiene actividades reales
        btnSinAct.style.display = 'none';
    }
    
    document.getElementById('modalDiaOverlay').classList.add('active');
}

function renderActividadesModal(actis, tieneSinActividades) {
    const lista = document.getElementById('listaActividadesModal');
    lista.innerHTML = '';
    document.getElementById('modalResumenDia').innerHTML = 
        `<i class="fas fa-chart-pie"></i> ${actis.filter(a => a.cumplida).length}/${actis.length}`;

    if (tieneSinActividades && actis.length === 0) {
        lista.innerHTML = `<div class="empty-state" style="background: #d4e8fc; border-radius: 10px; padding: 20px; border: 2px solid #003366;">
            <i class="fas fa-calendar-check" style="color: #003366;"></i>
            <p style="color: #003366; font-weight: 600;">📅 Día libre</p>
            <small style="color: #003366;">Sin actividades programadas</small>
        </div>`;
        return;
    }

    if (actis.length === 0) {
        lista.innerHTML = `<div class="empty-state"><i class="fas fa-inbox"></i><p>No hay actividades</p>
            <small>Haz clic en <i class="fas fa-plus"></i> para agregar</small></div>`;
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
                <div class="actividad-detalle">${act.hora ? '<i class="fas fa-clock"></i> ' + act.hora : ''} ${act.direccion ? '<i class="fas fa-map-marker-alt"></i> ' + act.direccion : ''}</div>
            </div>
            <button class="btn-eliminar" onclick="borrarAct('${act.id}', '${act.titulo}')"><i class="fas fa-trash"></i></button>
        `;
        div.ondragstart = () => { dragItemId = act.id; };
        div.ondragend = () => { dragItemId = null; };
        lista.appendChild(div);
    });
}

async function toggleCheck(id, valor) {
    if (isProcessing) return;
    await actualizarActividad(id, { cumplida: valor });
    await renderCalendario(true);
    if (diaSeleccionado) abrirModalDia(diaSeleccionado);
}

// ========== DETALLE Y EDITAR ==========
function abrirModalDetalle(id) {
    if (isProcessing) return;
    const act = actividades.find(a => a.id == id);
    if (!act) {
        showToast('⚠️ Actividad no encontrada', 'error');
        return;
    }
    actividadDetalleId = id;
    document.getElementById('detalleTitulo').textContent = act.titulo;
    document.getElementById('detalleDescripcion').textContent = act.descripcion || 'Sin descripción';
    document.getElementById('detalleSolucion').textContent = act.solucion || 'Sin solución registrada';
    document.getElementById('detalleDireccion').textContent = act.direccion || '-';
    document.getElementById('detalleHora').textContent = act.hora || '-';
    document.getElementById('detalleFecha').textContent = act.fecha;
    const estadoHtml = act.cumplida ? 
        '<span style="color:#28a745;font-weight:700;">✅ Cumplida</span>' : 
        '<span style="color:#dc3545;font-weight:700;">⏳ Pendiente</span>';
    document.getElementById('detalleEstado').innerHTML = estadoHtml;
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
    if (isProcessing) return;
    actividadEnEdicion = act;
    document.getElementById('modalActividadTitulo').textContent = act ? '✏️ Editar Actividad' : '➕ Nueva Actividad';
    document.getElementById('inputTitulo').value = act ? act.titulo : '';
    document.getElementById('inputDescripcion').value = act ? act.descripcion || '' : '';
    document.getElementById('inputSolucion').value = act ? act.solucion || '' : '';
    document.getElementById('inputDireccion').value = act ? act.direccion || '' : '';
    document.getElementById('inputHora').value = act ? act.hora || '' : '';
    document.getElementById('inputFecha').value = act ? act.fecha : (diaSeleccionado || new Date().toISOString().split('T')[0]);
    document.getElementById('modalActividadOverlay').classList.add('active');
}

// ========== GUARDAR ACTIVIDAD (CON HORA OPCIONAL) ==========
async function guardarActividadForm(e) {
    e.preventDefault();
    if (isProcessing) return;
    
    const horaVal = document.getElementById('inputHora').value;
    const fechaVal = document.getElementById('inputFecha').value;
    const tituloVal = document.getElementById('inputTitulo').value.trim();
    
    if (!tituloVal) {
        showToast('⚠️ El título es obligatorio', 'error');
        return;
    }
    
    if (!fechaVal) {
        showToast('⚠️ La fecha es obligatoria', 'error');
        return;
    }
    
    const data = {
        titulo: tituloVal,
        descripcion: document.getElementById('inputDescripcion').value,
        solucion: document.getElementById('inputSolucion').value,
        direccion: document.getElementById('inputDireccion').value,
        hora: horaVal || null,  // Permitir null
        fecha: fechaVal,
        sin_actividades: false
    };
    
    let result = null;
    if (actividadEnEdicion) {
        result = await actualizarActividad(actividadEnEdicion.id, data);
    } else {
        result = await crearActividad(data);
    }
    
    if (result) {
        cerrarModalActividad();
        await renderCalendario(true);
        if (diaSeleccionado) abrirModalDia(data.fecha);
    }
}

// ========== BORRAR ACTIVIDAD ==========
function borrarAct(id, titulo) {
    if (isProcessing) return;
    // Verificar si es una actividad de "sin_actividades"
    const act = actividades.find(a => a.id == id);
    if (act && act.sin_actividades) {
        eliminarSinActividades(act.fecha);
        return;
    }
    mostrarModalConfirm("Eliminar", `¿Borrar "${titulo}"?`, async () => {
        await eliminarActividad(id);
        await renderCalendario(true);
        if (diaSeleccionado) abrirModalDia(diaSeleccionado);
    });
}

// ========== NAVEGACION ==========
function cambiarMes(delta) {
    if (isProcessing) return;
    mesActual += delta;
    if (mesActual > 11) { mesActual = 0; añoActual++; }
    else if (mesActual < 0) { mesActual = 11; añoActual--; }
    renderCalendario(true);
}

function irHoy() {
    if (isProcessing) return;
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

// ========== ESTADISTICAS ==========
function abrirModalEstadisticas() {
    if (isProcessing) return;
    const actividadesReales = actividadesMes.filter(a => !a.sin_actividades);
    const total = actividadesReales.length;
    const cumplidas = actividadesReales.filter(a => a.cumplida).length;
    document.getElementById('estTotal').textContent = total;
    document.getElementById('estCumplidas').textContent = cumplidas;
    document.getElementById('estPendientes').textContent = total - cumplidas;

    const ctx = document.getElementById('chartEstadisticas').getContext('2d');
    if (chartEstadisticasInstance) {
        chartEstadisticasInstance.destroy();
        chartEstadisticasInstance = null;
    }
    chartEstadisticasInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Cumplidas', 'Pendientes'],
            datasets: [{ 
                data: [cumplidas, total - cumplidas], 
                backgroundColor: ['#003366', '#CC0000'],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        padding: 15,
                        usePointStyle: true,
                        pointStyle: 'circle'
                    }
                }
            },
            cutout: '65%'
        }
    });
    
    // Lista de actividades del mes
    const lista = document.getElementById('estadisticasActividades');
    lista.innerHTML = '';
    if (actividadesReales.length === 0) {
        lista.innerHTML = '<div style="text-align:center;padding:10px;color:#95a5a6;">No hay actividades este mes</div>';
    } else {
        actividadesReales.slice(0, 10).forEach(act => {
            const div = document.createElement('div');
            div.className = 'actividad-item';
            div.innerHTML = `
                <div class="actividad-info">
                    <div class="actividad-titulo" style="${act.cumplida ? 'text-decoration:line-through;color:#95a5a6;' : ''}">${act.titulo}</div>
                    <div class="actividad-detalle">${act.fecha} ${act.hora ? '⏰ ' + act.hora : ''}</div>
                </div>
                <span style="font-size:11px;font-weight:600;color:${act.cumplida ? '#28a745' : '#dc3545'};">${act.cumplida ? '✅' : '⏳'}</span>
            `;
            lista.appendChild(div);
        });
        if (actividadesReales.length > 10) {
            const div = document.createElement('div');
            div.style.cssText = 'text-align:center;padding:10px;color:#95a5a6;font-size:12px;';
            div.textContent = `Y ${actividadesReales.length - 10} más...`;
            lista.appendChild(div);
        }
    }
    
    document.getElementById('modalEstadisticasOverlay').classList.add('active');
}

// ========== MODAL DE CONFIRMACIÓN ==========
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

// ========== GRÁFICO DEL DÍA ==========
function actualizarGrafico(actis) {
    const ctx = document.getElementById('chartDia').getContext('2d');
    if (chartInstance) {
        chartInstance.destroy();
        chartInstance = null;
    }
    if (actis.length === 0) {
        document.getElementById('chartContainer').classList.add('hidden');
        return;
    }
    document.getElementById('chartContainer').classList.remove('hidden');
    const c = actis.filter(a => a.cumplida).length;
    chartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: { 
            datasets: [{ 
                data: [c, actis.length - c], 
                backgroundColor: ['#003366', '#CC0000'],
                borderWidth: 0
            }] 
        },
        options: { 
            cutout: '70%',
            plugins: {
                legend: {
                    display: false
                }
            }
        }
    });
}

// ========== FUNCIONES DE DRAG & DROP PARA ACTIVIDADES ==========
function iniciarDrag(e, id) {
    dragItemId = id;
    // No hacer nada más, el drag lo maneja el navegador
}

function terminarDrag() {
    dragItemId = null;
}

// ========== PREVENIR DOBLE CLIC EN BOTONES ==========
function prevenirDobleClic() {
    // Esta función se usa para prevenir doble clic en elementos críticos
}

// ========== INIT ==========
document.addEventListener('DOMContentLoaded', () => {
    renderCalendario(true);
    
    // Cerrar al hacer clic fuera del modal
    document.querySelectorAll('.modal-overlay').forEach(ov => {
        ov.onclick = (e) => { if(e.target === ov) cerrarTodosModales(); };
    });

    // Cerrar con tecla ESC
    document.addEventListener('keydown', e => { 
        if(e.key === 'Escape') cerrarTodosModales(); 
    });
    
    // Prevenir doble clic en botones
    document.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', function(e) {
            if (isProcessing && !this.classList.contains('btn-cancel') && !this.classList.contains('modal-close')) {
                e.preventDefault();
                showToast('⏳ Procesando... espera un momento', 'info');
                return false;
            }
        });
    });
    
    // Configurar drag & drop para actividades
    document.addEventListener('dragstart', (e) => {
        const item = e.target.closest('.actividad-item');
        if (item) {
            const id = item.querySelector('.btn-eliminar')?.onclick?.toString().match(/'(\d+)'/)?.[1];
            if (id) {
                dragItemId = parseInt(id);
                e.dataTransfer.effectAllowed = 'move';
            }
        }
    });
    
    document.addEventListener('dragend', () => {
        dragItemId = null;
    });
});

// ========== EXPORTAR PARA USO GLOBAL ==========
// Todas las funciones ya están en el scope global
console.log('✅ Calendario UNELLEZ cargado correctamente');
