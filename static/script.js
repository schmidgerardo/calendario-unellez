// Estado global
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

// Estado para drag & drop mejorado
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
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Error ${response.status}`);
        }
        const data = await response.json();
        if (!Array.isArray(data)) {
            console.error('La respuesta no es un array:', data);
            return [];
        }
        actividades = data;
        if (mes !== null && año !== null) {
            const mesStr = String(mes + 1).padStart(2, '0');
            const añoStr = String(año);
            const patron = `${añoStr}-${mesStr}`;
            actividadesMes = data.filter(a => a.fecha && a.fecha.startsWith(patron));
        } else {
            actividadesMes = data;
        }
        actividadesFiltradas = [...actividadesMes];
        return data;
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
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Error ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error('Error creando actividad:', error);
        alert(`Error al crear actividad: ${error.message}`);
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
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Error ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error('Error actualizando actividad:', error);
        alert(`Error al actualizar actividad: ${error.message}`);
        return null;
    }
}

async function eliminarActividad(id) {
    try {
        const response = await fetch(`/api/actividades/${id}`, { method: 'DELETE' });
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Error ${response.status}`);
        }
        return true;
    } catch (error) {
        console.error('Error eliminando actividad:', error);
        alert(`Error al eliminar actividad: ${error.message}`);
        return false;
    }
}

// ========== RENDERIZAR CALENDARIO ==========
async function renderCalendario() {
    const grid = document.getElementById('calendarioGrid');
    
    // 🔴 IMPORTANTE: Limpiar completamente antes de renderizar
    grid.innerHTML = '';
    
    const diasSemana = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    diasSemana.forEach(d => {
        const div = document.createElement('div');
        div.className = 'dia-header';
        div.textContent = d;
        grid.appendChild(div);
    });

    await fetchActividades(null, mesActual, añoActual);
    if (!Array.isArray(actividadesMes)) actividadesMes = [];
    
    // Aplicar filtros a las actividades del mes
    const estado = document.getElementById('filtroEstado').value;
    const busqueda = document.getElementById('filtroBusqueda').value.toLowerCase().trim();
    
    actividadesFiltradas = actividadesMes.filter(act => {
        let mostrar = true;
        if (estado === 'pendientes' && act.cumplida) mostrar = false;
        if (estado === 'cumplidas' && !act.cumplida) mostrar = false;
        if (busqueda) {
            const titulo = (act.titulo || '').toLowerCase();
            const descripcion = (act.descripcion || '').toLowerCase();
            const direccion = (act.direccion || '').toLowerCase();
            const solucion = (act.solucion || '').toLowerCase();
            if (!titulo.includes(busqueda) && !descripcion.includes(busqueda) && 
                !direccion.includes(busqueda) && !solucion.includes(busqueda)) {
                mostrar = false;
            }
        }
        return mostrar;
    });
    
    const primerDia = new Date(añoActual, mesActual, 1).getDay();
    const diasEnMes = new Date(añoActual, mesActual + 1, 0).getDate();
    const hoy = new Date();

    for (let i = 0; i < primerDia; i++) {
        const div = document.createElement('div');
        div.className = 'dia otro-mes';
        grid.appendChild(div);
    }

    for (let d = 1; d <= diasEnMes; d++) {
        const fecha = new Date(añoActual, mesActual, d);
        const fechaStr = fecha.toISOString().split('T')[0];
        const div = document.createElement('div');
        div.className = 'dia';
        div.dataset.fecha = fechaStr;
        
        const actisDia = actividadesFiltradas.filter(a => a.fecha === fechaStr);
        const actisDiaTotal = actividadesMes.filter(a => a.fecha === fechaStr);
        const pendientes = actisDiaTotal.filter(a => !a.cumplida).length;
        const cumplidas = actisDiaTotal.filter(a => a.cumplida).length;
        
        if (actisDiaTotal.length > 0) {
            div.classList.add('tiene-actividades');
            if (pendientes === 0 && cumplidas > 0) {
                div.classList.add('todas-cumplidas');
            } else if (pendientes > 0) {
                div.classList.add('tiene-pendientes');
            }
        }

        const numSpan = document.createElement('span');
        numSpan.className = 'dia-numero';
        numSpan.textContent = d;
        div.appendChild(numSpan);

        if (actisDia.length > 0) {
            const badge = document.createElement('span');
            badge.className = 'dia-badge';
            badge.textContent = actisDia.length;
            div.appendChild(badge);
        }

        if (fecha.toDateString() === hoy.toDateString()) {
            div.classList.add('hoy');
        }

        div.addEventListener('click', (e) => {
            if (!isDragging) {
                abrirModalDia(fechaStr);
            }
        });

        div.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            div.style.border = '2px dashed #FFD700';
        });

        div.addEventListener('dragleave', () => {
            div.style.border = '2px solid transparent';
        });

        div.addEventListener('drop', async (e) => {
            e.preventDefault();
            div.style.border = '2px solid transparent';
            if (dragItemId) {
                const fechaDestino = div.dataset.fecha;
                if (fechaDestino) {
                    await actualizarActividad(dragItemId, { fecha: fechaDestino });
                    dragItemId = null;
                    await renderCalendario();
                    if (diaSeleccionado) await abrirModalDia(diaSeleccionado);
                    aplicarFiltrosModal();
                }
            }
        });

        grid.appendChild(div);
    }

    mostrarResultadosFiltro();

    const total = actividadesMes.length;
    const cumplidasTotal = actividadesMes.filter(a => a.cumplida).length;
    document.getElementById('totalActividades').textContent = total;
    document.getElementById('totalCumplidas').textContent = cumplidasTotal;

    document.getElementById('mesLabel').textContent = 
        new Date(añoActual, mesActual).toLocaleString('es', { month: 'long', year: 'numeric' });
}

// ========== MOSTRAR RESULTADOS DEL FILTRO ==========
function mostrarResultadosFiltro() {
    const container = document.getElementById('filtroResultados');
    const lista = document.getElementById('filtroLista');
    const wrapper = document.querySelector('.calendario-wrapper');
    const estado = document.getElementById('filtroEstado').value;
    const busqueda = document.getElementById('filtroBusqueda').value.trim();
    
    const hayFiltro = (estado !== 'todas' || busqueda !== '');
    
    if (!hayFiltro) {
        wrapper.style.display = 'block';
        container.style.display = 'none';
        return;
    }
    
    wrapper.style.display = 'none';
    container.style.display = 'block';
    
    // Limpiar lista antes de agregar nuevos elementos
    lista.innerHTML = '';
    
    if (actividadesFiltradas.length === 0) {
        lista.innerHTML = `
            <div style="text-align:center;color:#95a5a6;padding:30px;">
                <i class="fas fa-search" style="font-size:32px;display:block;margin-bottom:10px;"></i>
                <p>No hay actividades que coincidan con el filtro</p>
                <small style="color:#bdc3c7;">Prueba con otros términos de búsqueda</small>
            </div>
        `;
        return;
    }
    
    actividadesFiltradas.forEach(act => {
        const div = document.createElement('div');
        div.className = 'actividad-item';
        div.style.cursor = 'pointer';
        div.style.marginBottom = '6px';
        
        const chk = document.createElement('input');
        chk.type = 'checkbox';
        chk.checked = act.cumplida;
        chk.style.width = '16px';
        chk.style.height = '16px';
        chk.style.cursor = 'pointer';
        chk.style.flexShrink = '0';
        chk.style.accentColor = '#003366';
        chk.onchange = async (e) => {
            e.stopPropagation();
            await actualizarActividad(act.id, { cumplida: chk.checked });
            await renderCalendario();
        };
        
        const info = document.createElement('div');
        info.className = 'actividad-info';
        info.style.flex = '1';
        
        const titulo = document.createElement('div');
        titulo.className = 'actividad-titulo';
        if (act.cumplida) titulo.style.textDecoration = 'line-through';
        titulo.style.fontWeight = '600';
        titulo.style.fontSize = '13px';
        titulo.textContent = act.titulo;
        
        const detalle = document.createElement('div');
        detalle.className = 'actividad-detalle';
        detalle.style.fontSize = '11px';
        detalle.style.color = '#7f8c8d';
        let detalles = [];
        if (act.hora) detalles.push(`🕐 ${act.hora}`);
        if (act.direccion) detalles.push(`📍 ${act.direccion}`);
        const fecha = new Date(act.fecha);
        detalle.innerHTML = `${fecha.toLocaleDateString('es')} • ${detalles.join(' • ') || 'Sin detalles'}`;
        
        info.appendChild(titulo);
        info.appendChild(detalle);
        
        div.appendChild(chk);
        div.appendChild(info);
        
        div.addEventListener('click', (e) => {
            if (!e.target.closest('input[type="checkbox"]')) {
                abrirModalDetalle(act.id);
            }
        });
        
        lista.appendChild(div);
    });
}

// ========== LIMPIAR FILTROS ==========
function limpiarFiltros() {
    document.getElementById('filtroEstado').value = 'todas';
    document.getElementById('filtroBusqueda').value = '';
    document.getElementById('filtroResultados').style.display = 'none';
    document.querySelector('.calendario-wrapper').style.display = 'block';
    renderCalendario();
}

// ========== APLICAR FILTROS EN CALENDARIO ==========
function aplicarFiltrosCalendario() {
    renderCalendario();
}

// ========== APLICAR FILTROS EN MODAL ==========
function aplicarFiltrosModal() {
    const estado = document.getElementById('filtroEstado').value;
    const busqueda = document.getElementById('filtroBusqueda').value.toLowerCase().trim();
    
    const items = document.querySelectorAll('#listaActividadesModal .actividad-item');
    items.forEach(item => {
        const titulo = item.querySelector('.actividad-titulo')?.textContent?.toLowerCase() || '';
        const detalle = item.querySelector('.actividad-detalle')?.textContent?.toLowerCase() || '';
        const checkbox = item.querySelector('input[type="checkbox"]');
        
        let mostrar = true;
        if (estado === 'pendientes' && checkbox.checked) mostrar = false;
        if (estado === 'cumplidas' && !checkbox.checked) mostrar = false;
        if (busqueda && !titulo.includes(busqueda) && !detalle.includes(busqueda)) {
            mostrar = false;
        }
        item.style.display = mostrar ? 'flex' : 'none';
    });
}

// ========== MODAL DÍA ==========
async function abrirModalDia(fechaStr) {
    diaSeleccionado = fechaStr;
    const fecha = new Date(fechaStr);
    
    document.getElementById('modalDiaTitulo').textContent = 'Actividades';
    document.getElementById('modalDiaFecha').textContent = 
        fecha.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    
    const todas = await fetchActividades(fechaStr);
    if (!Array.isArray(todas)) {
        renderActividadesModal([]);
        actualizarGrafico([]);
        document.getElementById('modalDiaOverlay').classList.add('active');
        return;
    }
    
    const actisDia = todas
        .filter(a => a.fecha === fechaStr)
        .sort((a, b) => {
            if (!a.hora && !b.hora) return 0;
            if (!a.hora) return 1;
            if (!b.hora) return -1;
            return a.hora.localeCompare(b.hora);
        });
    
    renderActividadesModal(actisDia);
    actualizarGrafico(actisDia);
    document.getElementById('modalDiaOverlay').classList.add('active');
}

function cerrarModalDia() {
    document.getElementById('modalDiaOverlay').classList.remove('active');
}

// ========== RENDER ACTIVIDADES EN MODAL ==========
function renderActividadesModal(actividadesDia) {
    const lista = document.getElementById('listaActividadesModal');
    const cumplidas = actividadesDia.filter(a => a.cumplida).length;
    
    document.getElementById('modalResumenDia').innerHTML = 
        `<i class="fas fa-chart-pie"></i> ${cumplidas}/${actividadesDia.length}`;

    const chartContainer = document.getElementById('chartContainer');
    if (actividadesDia.length === 0) {
        chartContainer.classList.add('hidden');
    } else {
        chartContainer.classList.remove('hidden');
    }

    if (actividadesDia.length === 0) {
        lista.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-inbox"></i>
                <p>No hay actividades</p>
                <small>Haz clic en <i class="fas fa-plus"></i> para agregar</small>
            </div>
        `;
        return;
    }

    lista.innerHTML = '';
    actividadesDia.forEach((act) => {
        const div = document.createElement('div');
        div.className = 'actividad-item';
        div.draggable = true;
        div.dataset.id = act.id;
        
        div.addEventListener('click', (e) => {
            if (!e.target.closest('input[type="checkbox"]') && !e.target.closest('.btn-eliminar')) {
                abrirModalDetalle(act.id);
            }
        });
        
        div.addEventListener('mousedown', (e) => {
            if (e.button === 0 && !e.target.closest('input[type="checkbox"]') && !e.target.closest('.btn-eliminar')) {
                dragStartX = e.clientX;
                dragStartY = e.clientY;
                dragItemId = act.id;
                dragTimeout = setTimeout(() => {
                    isDragging = true;
                    cerrarModalDia();
                    div.style.opacity = '0.4';
                    div.style.transform = 'scale(0.95)';
                }, 800);
            }
        });

        div.addEventListener('mousemove', (e) => {
            if (dragTimeout) {
                const dx = e.clientX - dragStartX;
                const dy = e.clientY - dragStartY;
                if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
                    clearTimeout(dragTimeout);
                    dragTimeout = null;
                    isDragging = false;
                    dragItemId = null;
                }
            }
        });

        div.addEventListener('mouseup', () => {
            if (dragTimeout) {
                clearTimeout(dragTimeout);
                dragTimeout = null;
            }
            if (isDragging) {
                isDragging = false;
                div.style.opacity = '1';
                div.style.transform = 'scale(1)';
            }
            dragItemId = null;
        });

        div.addEventListener('mouseleave', () => {
            if (dragTimeout) {
                clearTimeout(dragTimeout);
                dragTimeout = null;
            }
            if (isDragging) {
                isDragging = false;
                div.style.opacity = '1';
                div.style.transform = 'scale(1)';
            }
        });

        const chk = document.createElement('input');
        chk.type = 'checkbox';
        chk.checked = act.cumplida;
        chk.onchange = async (e) => {
            e.stopPropagation();
            await actualizarActividad(act.id, { cumplida: chk.checked });
            await abrirModalDia(diaSeleccionado);
            renderCalendario();
            aplicarFiltrosModal();
        };

        const info = document.createElement('div');
        info.className = 'actividad-info';
        
        const titulo = document.createElement('div');
        titulo.className = 'actividad-titulo';
        if (act.cumplida) titulo.classList.add('cumplida');
        titulo.textContent = act.titulo;
        
        const detalle = document.createElement('div');
        detalle.className = 'actividad-detalle';
        let detalles = [];
        if (act.hora) detalles.push(`<i class="fas fa-clock"></i> ${act.hora}`);
        if (act.direccion) detalles.push(`<i class="fas fa-map-marker-alt"></i> ${act.direccion}`);
        if (act.solucion) detalles.push(`<i class="fas fa-check-circle"></i> ${act.solucion.substring(0, 20)}${act.solucion.length > 20 ? '...' : ''}`);
        detalle.innerHTML = detalles.join(' • ') || 'Sin detalles';
        
        info.appendChild(titulo);
        info.appendChild(detalle);

        const actions = document.createElement('div');
        actions.className = 'actividad-actions';
        
        const btnEliminar = document.createElement('button');
        btnEliminar.className = 'btn-eliminar';
        btnEliminar.innerHTML = '<i class="fas fa-trash"></i>';
        btnEliminar.onclick = (e) => {
            e.stopPropagation();
            mostrarModalConfirm(
                'Eliminar Actividad',
                `¿Eliminar "${act.titulo}"?`,
                async () => {
                    await eliminarActividad(act.id);
                    await abrirModalDia(diaSeleccionado);
                    renderCalendario();
                    aplicarFiltrosModal();
                }
            );
        };

        actions.appendChild(btnEliminar);
        
        div.appendChild(chk);
        div.appendChild(info);
        div.appendChild(actions);

        lista.appendChild(div);
    });
    
    aplicarFiltrosModal();
}

// ========== MODAL ESTADÍSTICAS ==========
function abrirModalEstadisticas() {
    const total = actividadesMes.length;
    const cumplidas = actividadesMes.filter(a => a.cumplida).length;
    const pendientes = total - cumplidas;
    
    document.getElementById('estTotal').textContent = total;
    document.getElementById('estCumplidas').textContent = cumplidas;
    document.getElementById('estPendientes').textContent = pendientes;
    
    document.getElementById('estadisticasTitulo').textContent = 
        `Estadísticas - ${new Date(añoActual, mesActual).toLocaleString('es', { month: 'long', year: 'numeric' })}`;
    
    const ctx = document.getElementById('chartEstadisticas').getContext('2d');
    if (chartEstadisticasInstance) {
        chartEstadisticasInstance.destroy();
    }
    chartEstadisticasInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Cumplidas', 'Pendientes'],
            datasets: [{
                data: [cumplidas, pendientes],
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
                        padding: 10,
                        usePointStyle: true,
                        pointStyle: 'circle',
                        font: { size: 12 }
                    }
                }
            },
            cutout: '60%'
        }
    });
    
    const lista = document.getElementById('estadisticasActividades');
    lista.innerHTML = '';
    actividadesMes.forEach(act => {
        const div = document.createElement('div');
        div.className = 'actividad-item';
        div.style.cursor = 'pointer';
        div.style.padding = '6px 10px';
        div.style.marginBottom = '4px';
        
        const info = document.createElement('div');
        info.className = 'actividad-info';
        
        const titulo = document.createElement('div');
        titulo.className = 'actividad-titulo';
        titulo.textContent = act.titulo;
        if (act.cumplida) titulo.style.textDecoration = 'line-through';
        
        const fecha = new Date(act.fecha);
        info.appendChild(titulo);
        
        const fechaEl = document.createElement('span');
        fechaEl.style.fontSize = '11px';
        fechaEl.style.color = '#7f8c8d';
        fechaEl.textContent = fecha.toLocaleDateString('es');
        
        div.appendChild(info);
        div.appendChild(fechaEl);
        
        div.addEventListener('click', () => {
            cerrarModalEstadisticas();
            abrirModalDetalle(act.id);
        });
        
        lista.appendChild(div);
    });
    
    document.getElementById('modalEstadisticasOverlay').classList.add('active');
}

function cerrarModalEstadisticas() {
    document.getElementById('modalEstadisticasOverlay').classList.remove('active');
    if (chartEstadisticasInstance) {
        chartEstadisticasInstance.destroy();
        chartEstadisticasInstance = null;
    }
}

// ========== MODAL DETALLE ==========
function abrirModalDetalle(id) {
    const act = actividades.find(a => a.id === id);
    if (!act) {
        alert('Actividad no encontrada');
        return;
    }
    actividadDetalleId = id;
    
    document.getElementById('detalleTitulo').textContent = act.titulo;
    document.getElementById('detalleDescripcion').textContent = act.descripcion || 'Sin descripción';
    document.getElementById('detalleSolucion').textContent = act.solucion || 'Sin solución registrada';
    document.getElementById('detalleDireccion').textContent = act.direccion || 'No especificada';
    document.getElementById('detalleHora').textContent = act.hora || 'No especificada';
    
    const fecha = new Date(act.fecha);
    document.getElementById('detalleFecha').textContent = 
        fecha.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    
    const estadoEl = document.getElementById('detalleEstado');
    if (act.cumplida) {
        estadoEl.innerHTML = '<span class="detalle-estado-badge cumplida"><i class="fas fa-check-circle"></i> Cumplida</span>';
    } else {
        estadoEl.innerHTML = '<span class="detalle-estado-badge pendiente"><i class="fas fa-clock"></i> Pendiente</span>';
    }
    
    document.getElementById('modalActividadDetalleOverlay').classList.add('active');
}

function cerrarModalDetalle() {
    document.getElementById('modalActividadDetalleOverlay').classList.remove('active');
    actividadDetalleId = null;
}

function editarDesdeDetalle() {
    if (actividadDetalleId) {
        const act = actividades.find(a => a.id === actividadDetalleId);
        if (act) {
            cerrarModalDetalle();
            abrirModalActividad(act);
        }
    }
}

// ========== GRÁFICO ==========
function actualizarGrafico(actividadesDia) {
    const ctx = document.getElementById('chartDia').getContext('2d');
    if (chartInstance) {
        chartInstance.destroy();
        chartInstance = null;
    }
    if (!actividadesDia || actividadesDia.length === 0) return;
    
    const cumplidas = actividadesDia.filter(a => a.cumplida).length;
    const pendientes = actividadesDia.length - cumplidas;
    
    chartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Cumplidas', 'Pendientes'],
            datasets: [{
                data: [cumplidas, pendientes],
                backgroundColor: ['#003366', '#CC0000'],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        padding: 8,
                        usePointStyle: true,
                        pointStyle: 'circle',
                        font: { size: 10 }
                    }
                }
            },
            cutout: '60%'
        }
    });
}

// ========== MODAL CONFIRMACIÓN ==========
function mostrarModalConfirm(titulo, mensaje, onConfirm) {
    document.getElementById('modalConfirmTitulo').textContent = titulo;
    document.getElementById('modalConfirmMensaje').textContent = mensaje;
    document.getElementById('modalConfirmOverlay').classList.add('active');
    modalConfirmCallback = onConfirm;
}

function cerrarModalConfirm() {
    document.getElementById('modalConfirmOverlay').classList.remove('active');
    modalConfirmCallback = null;
}

// ========== MODAL ACTIVIDAD ==========
function abrirModalActividad(actividad = null) {
    const modal = document.getElementById('modalActividadOverlay');
    const titulo = document.getElementById('modalActividadTitulo');
    const inputTitulo = document.getElementById('inputTitulo');
    const inputDescripcion = document.getElementById('inputDescripcion');
    const inputSolucion = document.getElementById('inputSolucion');
    const inputDireccion = document.getElementById('inputDireccion');
    const inputHora = document.getElementById('inputHora');
    const inputFecha = document.getElementById('inputFecha');
    
    if (actividad) {
        titulo.textContent = 'Editar Actividad';
        inputTitulo.value = actividad.titulo;
        inputDescripcion.value = actividad.descripcion || '';
        inputSolucion.value = actividad.solucion || '';
        inputDireccion.value = actividad.direccion || '';
        inputHora.value = actividad.hora || '';
        inputFecha.value = actividad.fecha;
        actividadEnEdicion = actividad;
    } else {
        titulo.textContent = 'Nueva Actividad';
        inputTitulo.value = '';
        inputDescripcion.value = '';
        inputSolucion.value = '';
        inputDireccion.value = '';
        inputHora.value = '';
        inputFecha.value = diaSeleccionado || new Date().toISOString().split('T')[0];
        actividadEnEdicion = null;
    }
    modal.classList.add('active');
}

function cerrarModalActividad() {
    document.getElementById('modalActividadOverlay').classList.remove('active');
    actividadEnEdicion = null;
}

async function guardarActividadForm(e) {
    e.preventDefault();
    
    const titulo = document.getElementById('inputTitulo').value.trim();
    const descripcion = document.getElementById('inputDescripcion').value.trim();
    const solucion = document.getElementById('inputSolucion').value.trim();
    const direccion = document.getElementById('inputDireccion').value.trim();
    const hora = document.getElementById('inputHora').value;
    const fecha = document.getElementById('inputFecha').value;
    
    if (!titulo) {
        alert('El título es obligatorio');
        return;
    }
    
    const data = { titulo, fecha };
    if (descripcion) data.descripcion = descripcion;
    if (solucion) data.solucion = solucion;
    if (direccion) data.direccion = direccion;
    if (hora) data.hora = hora;
    
    if (actividadEnEdicion) {
        await actualizarActividad(actividadEnEdicion.id, data);
    } else {
        await crearActividad(data);
    }
    
    cerrarModalActividad();
    await abrirModalDia(fecha);
    renderCalendario();
    aplicarFiltrosModal();
}

// ========== NAVEGACIÓN ==========
function cambiarMes(delta) {
    mesActual += delta;
    if (mesActual > 11) { mesActual = 0; añoActual++; }
    if (mesActual < 0) { mesActual = 11; añoActual--; }
    renderCalendario();
    document.getElementById('filtroBusqueda').value = '';
    document.getElementById('filtroEstado').value = 'todas';
    document.getElementById('filtroResultados').style.display = 'none';
    document.querySelector('.calendario-wrapper').style.display = 'block';
}

function irHoy() {
    const hoy = new Date();
    mesActual = hoy.getMonth();
    añoActual = hoy.getFullYear();
    renderCalendario();
    document.getElementById('filtroBusqueda').value = '';
    document.getElementById('filtroEstado').value = 'todas';
    document.getElementById('filtroResultados').style.display = 'none';
    document.querySelector('.calendario-wrapper').style.display = 'block';
}

// ========== INICIALIZAR ==========
document.addEventListener('DOMContentLoaded', async () => {
    await renderCalendario();
    
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            cerrarModalDia();
            cerrarModalActividad();
            cerrarModalConfirm();
            cerrarModalDetalle();
            cerrarModalEstadisticas();
        }
    });

    document.getElementById('modalDiaOverlay').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) cerrarModalDia();
    });
    document.getElementById('modalActividadOverlay').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) cerrarModalActividad();
    });
    document.getElementById('modalConfirmOverlay').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) cerrarModalConfirm();
    });
    document.getElementById('modalActividadDetalleOverlay').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) cerrarModalDetalle();
    });
    document.getElementById('modalEstadisticasOverlay').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) cerrarModalEstadisticas();
    });

    document.getElementById('modalConfirmBtn').addEventListener('click', () => {
        if (modalConfirmCallback) {
            modalConfirmCallback();
        }
        cerrarModalConfirm();
    });
});
