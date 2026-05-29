const API_BASE_URL = ['localhost', '127.0.0.1', ''].includes(window.location.hostname)
    ? ''
    : 'https://bancoerp-production.up.railway.app';
let authToken = null;
let currentUser = null;
let transaccionesChart = null;
let erpCharts = {};
let erpData = {
    resumen: {},
    cuentas: [],
    interbancarias: [],
    bancos: [],
    auditoria: [],
    auditoriaResumen: null
};
const ERP_ROLES = ['ADMIN', 'CAJERO', 'GERENTE'];
const AUDIT_ROLES = ['ADMIN', 'GERENTE'];

function canViewAdminERP() {
    return ERP_ROLES.includes(currentUser?.rol);
}

function canViewAuditoriaERP() {
    return AUDIT_ROLES.includes(currentUser?.rol);
}

document.addEventListener('DOMContentLoaded', function() {
    authToken = localStorage.getItem('token');
    currentUser = JSON.parse(localStorage.getItem('user'));
    const accessType = localStorage.getItem('accessType');
    
    if (!authToken || !currentUser) {
        window.location.href = '/';
        return;
    }
    const navCambiarPassword = document.getElementById('navCambiarPassword');
if (navCambiarPassword) {
    navCambiarPassword.addEventListener('click', (e) => {
        e.preventDefault();
        loadCambiarPassword();
        setActive('navCambiarPassword');
        document.getElementById('pageTitle').innerHTML = '<i class="fas fa-key me-2"></i>Cambiar Contraseña';
    });
}
    
    const roleBadge = document.getElementById('roleBadge');
    const clienteMenu = document.getElementById('clienteMenu');
    const cajeroMenu = document.getElementById('cajeroMenu');
    const erpMenu = document.getElementById('erpMenu');
    
    if (currentUser.rol === 'ADMIN') {
        roleBadge.innerHTML = '<i class="fas fa-crown me-1"></i>ADMINISTRADOR';
        roleBadge.classList.add('bg-warning', 'text-dark');
        if (cajeroMenu) cajeroMenu.style.display = 'block';
        if (clienteMenu) clienteMenu.style.display = 'none';
        if (erpMenu) erpMenu.style.display = 'block';
    } else if (currentUser.rol === 'CAJERO') {
        roleBadge.innerHTML = '<i class="fas fa-user-tie me-1"></i>CAJERO';
        roleBadge.classList.add('bg-info', 'text-white');
        if (cajeroMenu) cajeroMenu.style.display = 'block';
        if (clienteMenu) clienteMenu.style.display = 'none';
        if (erpMenu) erpMenu.style.display = 'block';
    } else if (currentUser.rol === 'GERENTE') {
        roleBadge.innerHTML = '<i class="fas fa-user-shield me-1"></i>GERENTE';
        roleBadge.classList.add('bg-success', 'text-white');
        if (cajeroMenu) cajeroMenu.style.display = 'none';
        if (clienteMenu) clienteMenu.style.display = 'none';
        if (erpMenu) erpMenu.style.display = 'block';
    } else {
        roleBadge.innerHTML = '<i class="fas fa-user me-1"></i>CLIENTE';
        roleBadge.classList.add('bg-secondary');
        if (cajeroMenu) cajeroMenu.style.display = 'none';
        if (clienteMenu) clienteMenu.style.display = 'block';
        if (erpMenu) erpMenu.style.display = 'none';
    }
    
    const userInfoText = document.getElementById('userInfoText');
    userInfoText.innerHTML = `Bienvenido, <strong>${currentUser.username}</strong> (${currentUser.rol})`;
    
    const accessBadge = document.createElement('span');
    if (accessType === 'cliente') {
        accessBadge.innerHTML = '<span class="badge bg-info ms-2">🔓 Acceso: Cliente</span>';
    } else {
        accessBadge.innerHTML = '<span class="badge bg-warning ms-2">🔐 Acceso: Cajero/Admin</span>';
    }
    userInfoText.appendChild(accessBadge);
    
    loadDashboard();
    
    // Navegación común
    document.getElementById('navDashboard').addEventListener('click', (e) => {
        e.preventDefault();
        loadDashboard();
        setActive('navDashboard');
        document.getElementById('pageTitle').innerHTML = '<i class="fas fa-tachometer-alt me-2"></i>Dashboard';
    });
    
    document.getElementById('navCuentas').addEventListener('click', (e) => {
        e.preventDefault();
        loadCuentas();
        setActive('navCuentas');
        document.getElementById('pageTitle').innerHTML = '<i class="fas fa-credit-card me-2"></i>Mis Cuentas';
    });
    
    document.getElementById('navTransferencias').addEventListener('click', (e) => {
        e.preventDefault();
        loadTransferencias();
        setActive('navTransferencias');
        document.getElementById('pageTitle').innerHTML = '<i class="fas fa-exchange-alt me-2"></i>Transferencias';
    });

    document.getElementById('navInterbancaria').addEventListener('click', (e) => {
        e.preventDefault();
        loadTransferenciasInterbancarias();
        setActive('navInterbancaria');
        document.getElementById('pageTitle').innerHTML = '<i class="fas fa-globe-americas me-2"></i>Transferencias Interbancarias';
    });
    
    document.getElementById('navHistorial').addEventListener('click', (e) => {
        e.preventDefault();
        loadHistorial();
        setActive('navHistorial');
        document.getElementById('pageTitle').innerHTML = '<i class="fas fa-history me-2"></i>Historial';
    });
    
    // Opciones de cliente
    const navVincularCuenta = document.getElementById('navVincularCuenta');
    const navCrearCuenta = document.getElementById('navCrearCuenta');
    
    if (navVincularCuenta) {
        navVincularCuenta.addEventListener('click', (e) => {
            e.preventDefault();
            loadVincularCuenta();
            setActive('navVincularCuenta');
            document.getElementById('pageTitle').innerHTML = '<i class="fas fa-link me-2"></i>Vincular Cuenta';
        });
    }
    
    if (navCrearCuenta) {
        navCrearCuenta.addEventListener('click', (e) => {
            e.preventDefault();
            loadCrearCuenta();
            setActive('navCrearCuenta');
            document.getElementById('pageTitle').innerHTML = '<i class="fas fa-plus-circle me-2"></i>Crear Nueva Cuenta';
        });
    }
    
    // Opciones de cajero/admin
    const navResumenDia = document.getElementById('navResumenDia');
    const navBuscarCuenta = document.getElementById('navBuscarCuenta');
    const navDeposito = document.getElementById('navDeposito');
    const navRetiro = document.getElementById('navRetiro');
    const navTransferenciaAsistida = document.getElementById('navTransferenciaAsistida');
    const navAperturaCuenta = document.getElementById('navAperturaCuenta');
    const navAdminERP = document.getElementById('navAdminERP');
    
    if (navResumenDia) {
        navResumenDia.addEventListener('click', (e) => {
            e.preventDefault();
            loadResumenDia();
            setActive('navResumenDia');
            document.getElementById('pageTitle').innerHTML = '<i class="fas fa-chart-line me-2"></i>Resumen del Día';
        });
    }
    
    if (navBuscarCuenta) {
        navBuscarCuenta.addEventListener('click', (e) => {
            e.preventDefault();
            loadBuscarCuenta();
            setActive('navBuscarCuenta');
            document.getElementById('pageTitle').innerHTML = '<i class="fas fa-search me-2"></i>Buscar Cuenta';
        });
    }
    
    if (navDeposito) {
        navDeposito.addEventListener('click', (e) => {
            e.preventDefault();
            loadDeposito();
            setActive('navDeposito');
            document.getElementById('pageTitle').innerHTML = '<i class="fas fa-plus-circle me-2"></i>Depósito';
        });
    }
    
    if (navRetiro) {
        navRetiro.addEventListener('click', (e) => {
            e.preventDefault();
            loadRetiro();
            setActive('navRetiro');
            document.getElementById('pageTitle').innerHTML = '<i class="fas fa-minus-circle me-2"></i>Retiro';
        });
    }
    
    if (navTransferenciaAsistida) {
        navTransferenciaAsistida.addEventListener('click', (e) => {
            e.preventDefault();
            loadTransferenciaAsistida();
            setActive('navTransferenciaAsistida');
            document.getElementById('pageTitle').innerHTML = '<i class="fas fa-hand-holding-usd me-2"></i>Transferencia Asistida';
        });
    }
    
    if (navAperturaCuenta) {
        navAperturaCuenta.addEventListener('click', (e) => {
            e.preventDefault();
            loadAperturaCuenta();
            setActive('navAperturaCuenta');
            document.getElementById('pageTitle').innerHTML = '<i class="fas fa-user-plus me-2"></i>Apertura de Cuenta';
        });
    }

    if (navAdminERP) {
        navAdminERP.addEventListener('click', (e) => {
            e.preventDefault();
            if (!canViewAdminERP()) {
                document.getElementById('dashboardContent').innerHTML = '<div class="alert alert-danger">No tienes permiso para ver Administracion ERP</div>';
                return;
            }
            loadAdminERP();
            setActive('navAdminERP');
            document.getElementById('pageTitle').innerHTML = '<i class="fas fa-briefcase me-2"></i>Administracion ERP';
        });
    }
    
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            localStorage.clear();
            window.location.href = '/';
        });
    }
});

function setActive(activeId) {
    const navs = ['navDashboard', 'navCuentas', 'navTransferencias', 'navInterbancaria', 'navHistorial', 
                  'navVincularCuenta', 'navCrearCuenta', 'navResumenDia', 'navBuscarCuenta', 
                  'navDeposito', 'navRetiro', 'navTransferenciaAsistida', 'navAperturaCuenta', 'navAdminERP',
                  'navCambiarPassword'];
    navs.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            if (id === activeId) el.classList.add('active');
            else el.classList.remove('active');
        }
    });
}
function loadCambiarPassword() {
    document.getElementById('dashboardContent').innerHTML = `
        <div class="card">
            <div class="card-header bg-primary text-white">
                <h5><i class="fas fa-key me-2"></i>Cambiar Contraseña</h5>
            </div>
            <div class="card-body">
                <div class="alert alert-info">
                    <i class="fas fa-info-circle me-2"></i>
                    Para cambiar tu contraseña, ingresa tu nombre de usuario y DPI.
                </div>
                <form id="cambiarPasswordForm">
                    <div class="mb-3">
                        <label>Nombre de Usuario *</label>
                        <input type="text" id="cambiarUsername" class="form-control" placeholder="Ej: admin" required>
                    </div>
                    <div class="mb-3">
                        <label>DPI *</label>
                        <input type="text" id="cambiarDpi" class="form-control" placeholder="Ej: 1234567890101" required>
                    </div>
                    <div class="mb-3">
                        <label>Nueva Contraseña *</label>
                        <input type="password" id="cambiarNuevaPassword" class="form-control" placeholder="Mínimo 6 caracteres" required>
                    </div>
                    <div class="mb-3">
                        <label>Confirmar Nueva Contraseña *</label>
                        <input type="password" id="cambiarConfirmarPassword" class="form-control" placeholder="Repite la nueva contraseña" required>
                    </div>
                    <button type="submit" class="btn btn-primary w-100">
                        <i class="fas fa-save me-2"></i>Cambiar Contraseña
                    </button>
                </form>
                <div id="resultadoCambiarPassword" class="mt-3"></div>
            </div>
        </div>`;
    
    document.getElementById('cambiarPasswordForm').addEventListener('submit', realizarCambioPassword);
}

async function realizarCambioPassword(e) {
    e.preventDefault();
    
    const username = document.getElementById('cambiarUsername').value;
    const dpi = document.getElementById('cambiarDpi').value;
    const nueva_password = document.getElementById('cambiarNuevaPassword').value;
    const confirmar_password = document.getElementById('cambiarConfirmarPassword').value;
    
    const resultadoDiv = document.getElementById('resultadoCambiarPassword');
    
    // Validaciones básicas
    if (!username || !dpi || !nueva_password || !confirmar_password) {
        resultadoDiv.innerHTML = '<div class="alert alert-danger">❌ Todos los campos son requeridos</div>';
        return;
    }
    
    if (nueva_password !== confirmar_password) {
        resultadoDiv.innerHTML = '<div class="alert alert-danger">❌ Las contraseñas no coinciden</div>';
        return;
    }
    
    if (nueva_password.length < 6) {
        resultadoDiv.innerHTML = '<div class="alert alert-danger">❌ La contraseña debe tener al menos 6 caracteres</div>';
        return;
    }
    
    resultadoDiv.innerHTML = '<div class="alert alert-info">⏳ Procesando...</div>';
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/auth/cambiar-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: username,
                dpi: dpi,
                nueva_password: nueva_password,
                confirmar_password: confirmar_password
            })
        });
        
        const result = await response.json();
        
        if (response.ok) {
            resultadoDiv.innerHTML = `
                <div class="alert alert-success">
                    <i class="fas fa-check-circle me-2"></i> ${result.message}<br><br>
                    <strong>⚠️ Importante:</strong> La próxima vez que inicies sesión, usa tu nueva contraseña.
                </div>
            `;
            document.getElementById('cambiarPasswordForm').reset();
            
            // Opcional: Cerrar sesión después de 3 segundos
            setTimeout(() => {
                if (confirm('Contraseña cambiada exitosamente. ¿Deseas cerrar sesión para usar la nueva contraseña?')) {
                    localStorage.clear();
                    window.location.href = '/';
                }
            }, 2000);
        } else {
            resultadoDiv.innerHTML = `<div class="alert alert-danger">❌ ${result.error}</div>`;
        }
    } catch (error) {
        console.error('Error:', error);
        resultadoDiv.innerHTML = '<div class="alert alert-danger">❌ Error de conexión al servidor</div>';
    }
}
async function loadDashboard() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/operaciones/mis-cuentas`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const cuentas = await response.json();
        const totalSaldo = cuentas.reduce((sum, c) => sum + parseFloat(c.saldo), 0);
        
        const contentDiv = document.getElementById('dashboardContent');
        contentDiv.innerHTML = `
            <div class="row mb-4">
                <div class="col-12 col-sm-6 col-md-4 mb-3">
                    <div class="card bg-primary text-white card-stats">
                        <div class="card-body">
                            <h5>Total Cuentas</h5>
                            <h2>${cuentas.length}</h2>
                        </div>
                    </div>
                </div>
                <div class="col-12 col-sm-6 col-md-4 mb-3">
                    <div class="card bg-success text-white card-stats">
                        <div class="card-body">
                            <h5>Saldo Total</h5>
                            <h2>Q${totalSaldo.toFixed(2)}</h2>
                        </div>
                    </div>
                </div>
                <div class="col-12 col-sm-6 col-md-4 mb-3">
                    <div class="card bg-info text-white card-stats">
                        <div class="card-body">
                            <h5>Bienvenido</h5>
                            <h6>${currentUser.username}</h6>
                        </div>
                    </div>
                </div>
            </div>
            <div class="row">
                <div class="col-12">
                    <h4>Mis Cuentas</h4>
                    <hr>
                </div>
            </div>
            <div class="row">`;
        
        if (cuentas.length === 0) {
            contentDiv.innerHTML += `<div class="col-12"><div class="alert alert-warning">No tienes cuentas vinculadas.</div></div>`;
        } else {
            cuentas.forEach(c => {
                contentDiv.innerHTML += `
                    <div class="col-12 col-md-6 mb-3">
                        <div class="card">
                            <div class="card-body">
                                <h5>${c.nombre_banco} <span class="badge bg-secondary">${c.moneda_codigo}</span></h5>
                                <p><strong>Número:</strong> ${c.numero_cuenta}</p>
                                <p><strong>Saldo:</strong> <span class="text-success">Q${parseFloat(c.saldo).toFixed(2)}</span></p>
                                <button class="btn btn-sm btn-primary" onclick="window.verMovimientos(${c.id_cuenta})">Ver Movimientos</button>
                            </div>
                        </div>
                    </div>`;
            });
        }
        contentDiv.innerHTML += '</div>';
    } catch (error) {
        document.getElementById('dashboardContent').innerHTML = '<div class="alert alert-danger">Error al cargar dashboard</div>';
    }
}

async function loadCuentas() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/operaciones/mis-cuentas`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const cuentas = await response.json();
        let html = '<div class="row">';
        if (cuentas.length === 0) {
            html += '<div class="col-12"><div class="alert alert-warning">No tienes cuentas vinculadas.</div></div>';
        } else {
            cuentas.forEach(c => {
                html += `<div class="col-12 col-md-6 mb-3"><div class="card"><div class="card-body">
                    <h5>${c.nombre_banco}</h5>
                    <p><strong>Número:</strong> ${c.numero_cuenta}</p>
                    <p><strong>Tipo:</strong> ${c.nombre_tipo}</p>
                    <p><strong>Saldo:</strong> Q${parseFloat(c.saldo).toFixed(2)}</p>
                    <button class="btn btn-primary btn-mobile" onclick="window.verMovimientos(${c.id_cuenta})">Ver Movimientos</button>
                </div></div></div>`;
            });
        }
        html += '</div>';
        document.getElementById('dashboardContent').innerHTML = html;
    } catch (error) {
        document.getElementById('dashboardContent').innerHTML = '<div class="alert alert-danger">Error</div>';
    }
}

function loadVincularCuenta() {
    document.getElementById('dashboardContent').innerHTML = `
        <div class="card">
            <div class="card-header bg-primary text-white">
                <h5><i class="fas fa-link me-2"></i>Vincular Cuenta Existente</h5>
            </div>
            <div class="card-body">
                <p>Ingresa tu número de cuenta y DPI para vincularla a tu usuario.</p>
                <form id="vincularForm">
                    <div class="mb-3">
                        <label>Número de Cuenta</label>
                        <input type="text" id="numeroCuenta" class="form-control" placeholder="Ej: GT100000001" required>
                    </div>
                    <div class="mb-3">
                        <label>DPI</label>
                        <input type="text" id="dpiVinculacion" class="form-control" placeholder="Ej: 1234567890101" required>
                    </div>
                    <button type="submit" class="btn btn-primary w-100 w-md-auto">Vincular Cuenta</button>
                </form>
                <div id="resultadoVincular" class="mt-3"></div>
            </div>
        </div>`;
    
    document.getElementById('vincularForm').addEventListener('submit', vincularCuenta);
}

async function vincularCuenta(e) {
    e.preventDefault();
    const numero_cuenta = document.getElementById('numeroCuenta').value;
    const dpi = document.getElementById('dpiVinculacion').value;
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/operaciones/vincular-cuenta`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
            body: JSON.stringify({ numero_cuenta, dpi })
        });
        const result = await response.json();
        if (response.ok) {
            document.getElementById('resultadoVincular').innerHTML = `<div class="alert alert-success">✅ ${result.message}</div>`;
            setTimeout(() => loadDashboard(), 2000);
        } else {
            document.getElementById('resultadoVincular').innerHTML = `<div class="alert alert-danger">❌ ${result.error}</div>`;
        }
    } catch (error) {
        document.getElementById('resultadoVincular').innerHTML = '<div class="alert alert-danger">Error al vincular</div>';
    }
}

function loadCrearCuenta() {
    document.getElementById('dashboardContent').innerHTML = `
        <div class="card">
            <div class="card-header bg-success text-white">
                <h5><i class="fas fa-plus-circle me-2"></i>Crear Nueva Cuenta</h5>
            </div>
            <div class="card-body">
                <div class="alert alert-info">
                    <i class="fas fa-info-circle me-2"></i>Banco Industrial es la única opción disponible.
                </div>
                <form id="crearCuentaForm">
                    <div class="row">
                        <div class="col-12 col-md-4 mb-3">
                            <label>Banco</label>
                            <select id="bancoCuenta" class="form-control" disabled>
                                <option value="1">Banco Industrial</option>
                            </select>
                            <input type="hidden" id="bancoCuenta_hidden" value="1">
                        </div>
                        <div class="col-12 col-md-4 mb-3">
                            <label>Tipo de Cuenta</label>
                            <select id="tipoCuenta" class="form-control">
                                <option value="1">Ahorro</option>
                                <option value="2">Corriente</option>
                                <option value="3">Plazo Fijo</option>
                            </select>
                        </div>
                        <div class="col-12 col-md-4 mb-3">
                            <label>Moneda</label>
                            <select id="monedaCuenta" class="form-control">
                                <option value="1">GTQ - Quetzal</option>
                                <option value="2">USD - Dólar</option>
                            </select>
                        </div>
                    </div>
                    <div class="mb-3">
                        <label>Monto de Apertura (Q)</label>
                        <input type="number" id="montoApertura" class="form-control" step="0.01" min="0" value="100.00">
                    </div>
                    <button type="submit" class="btn btn-success w-100 w-md-auto">Crear Cuenta</button>
                </form>
                <div id="resultadoCrearCuenta" class="mt-3"></div>
            </div>
        </div>`;
    
    document.getElementById('crearCuentaForm').addEventListener('submit', crearCuentaUsuario);
}

async function crearCuentaUsuario(e) {
    e.preventDefault();
    const data = {
        id_banco: 1,
        id_tipo_cuenta: parseInt(document.getElementById('tipoCuenta').value),
        id_moneda: parseInt(document.getElementById('monedaCuenta').value),
        monto_apertura: parseFloat(document.getElementById('montoApertura').value)
    };
    try {
        const response = await fetch(`${API_BASE_URL}/api/operaciones/crear-cuenta-usuario`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
            body: JSON.stringify(data)
        });
        const result = await response.json();
        if (response.ok) {
            document.getElementById('resultadoCrearCuenta').innerHTML = `<div class="alert alert-success">✅ ${result.message}<br><strong>Número de cuenta:</strong> ${result.numero_cuenta}<br><strong>Saldo inicial:</strong> Q${result.saldo_inicial}</div>`;
            setTimeout(() => loadDashboard(), 2000);
        } else {
            document.getElementById('resultadoCrearCuenta').innerHTML = `<div class="alert alert-danger">❌ ${result.error}</div>`;
        }
    } catch (error) {
        document.getElementById('resultadoCrearCuenta').innerHTML = '<div class="alert alert-danger">Error al crear cuenta</div>';
    }
}

function loadTransferencias() {
    document.getElementById('dashboardContent').innerHTML = `
        <div class="card">
            <div class="card-header bg-primary text-white">
                <h5>Transferencia entre cuentas</h5>
            </div>
            <div class="card-body">
                <form id="transferForm">
                    <div class="mb-3">
                        <label>Cuenta Origen</label>
                        <select id="cuentaOrigen" class="form-control" required>
                            <option value="">Cargando cuentas...</option>
                        </select>
                    </div>
                    <div class="mb-3">
                        <label>Cuenta Destino</label>
                        <input type="text" id="cuentaDestino" class="form-control" placeholder="Número de cuenta" required>
                    </div>
                    <div class="mb-3">
                        <label>Monto (Q)</label>
                        <input type="number" id="monto" class="form-control" step="0.01" required>
                    </div>
                    <div class="mb-3">
                        <label>Referencia</label>
                        <input type="text" id="referencia" class="form-control">
                    </div>
                    <button type="submit" class="btn btn-primary w-100 w-md-auto">Transferir</button>
                </form>
                <div id="resultadoTransfer" class="mt-3"></div>
            </div>
        </div>`;
    
    cargarCuentasOrigen();
    document.getElementById('transferForm').addEventListener('submit', realizarTransferencia);
}

async function cargarCuentasOrigen() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/operaciones/mis-cuentas`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const cuentas = await response.json();
        const selector = document.getElementById('cuentaOrigen');
        if (cuentas.length === 0) {
            selector.innerHTML = '<option value="">No hay cuentas disponibles</option>';
        } else {
            selector.innerHTML = '<option value="">Seleccione una cuenta</option>';
            cuentas.forEach(c => {
                selector.innerHTML += `<option value="${c.numero_cuenta}">${c.numero_cuenta} - ${c.nombre_banco} (Q${parseFloat(c.saldo).toFixed(2)})</option>`;
            });
        }
    } catch (error) {
        console.error('Error cargando cuentas:', error);
        document.getElementById('cuentaOrigen').innerHTML = '<option value="">Error al cargar cuentas</option>';
    }
}

async function realizarTransferencia(e) {
    e.preventDefault();
    const data = {
        cuenta_origen: document.getElementById('cuentaOrigen').value,
        cuenta_destino: document.getElementById('cuentaDestino').value,
        monto: parseFloat(document.getElementById('monto').value),
        referencia: document.getElementById('referencia').value,
        descripcion: 'Transferencia realizada'
    };
    
    if (!data.cuenta_origen) {
        document.getElementById('resultadoTransfer').innerHTML = '<div class="alert alert-danger">❌ Seleccione una cuenta origen</div>';
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/transferencias`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
            body: JSON.stringify(data)
        });
        const result = await response.json();
        if (response.ok) {
            document.getElementById('resultadoTransfer').innerHTML = '<div class="alert alert-success">✅ Transferencia exitosa</div>';
            document.getElementById('transferForm').reset();
            cargarCuentasOrigen();
            loadDashboard();
        } else {
            document.getElementById('resultadoTransfer').innerHTML = `<div class="alert alert-danger">❌ ${result.error}</div>`;
        }
    } catch (error) {
        document.getElementById('resultadoTransfer').innerHTML = '<div class="alert alert-danger">Error en la transferencia</div>';
    }
}

function loadTransferenciasInterbancarias() {
    const publicApiBase = API_BASE_URL || window.location.origin;

    document.getElementById('dashboardContent').innerHTML = `
        <div class="card card-stats mb-3">
            <div class="card-body">
                <div class="row align-items-center">
                    <div class="col-md-3 mb-2 mb-md-0">
                        <small class="text-muted d-block">Banco</small>
                        <strong>Banco Industrial</strong>
                    </div>
                    <div class="col-md-3 mb-2 mb-md-0">
                        <small class="text-muted d-block">SWIFT</small>
                        <strong>BIGT2026</strong>
                    </div>
                    <div class="col-md-3 mb-2 mb-md-0">
                        <small class="text-muted d-block">Endpoint entrante</small>
                        <code>${publicApiBase}/api/interbancaria/entrante</code>
                    </div>
                    <div class="col-md-3">
                        <small class="text-muted d-block">Swagger</small>
                        <a href="${publicApiBase}/api/docs" target="_blank" rel="noopener noreferrer">/api/docs</a>
                    </div>
                </div>
            </div>
        </div>
        <div class="card">
            <div class="card-header bg-primary text-white">
                <h5><i class="fas fa-globe-americas me-2"></i>Transferencias Interbancarias</h5>
            </div>
            <div class="card-body">
                <form id="interbankForm">
                    <div class="row">
                        <div class="col-md-6 mb-3">
                            <label>Cuenta Origen</label>
                            <select id="interCuentaOrigen" class="form-control" required>
                                <option value="">Cargando cuentas...</option>
                            </select>
                        </div>
                        <div class="col-md-6 mb-3">
                            <label>Banco Destino</label>
                            <select id="interBancoDestino" class="form-control" required>
                                <option value="">Cargando bancos...</option>
                            </select>
                        </div>
                    </div>
                    <div class="row">
                        <div class="col-md-6 mb-3">
                            <label>Cuenta Destino</label>
                            <input type="text" id="interCuentaDestino" class="form-control" placeholder="Numero de cuenta destino" required>
                        </div>
                        <div class="col-md-6 mb-3">
                            <label>Monto (Q)</label>
                            <input type="number" id="interMonto" class="form-control" min="0.01" step="0.01" required>
                        </div>
                    </div>
                    <div class="mb-3">
                        <label>Descripcion</label>
                        <input type="text" id="interDescripcion" class="form-control" placeholder="Motivo de la transferencia">
                    </div>
                    <button type="submit" class="btn btn-primary w-100 w-md-auto" id="interSubmitBtn">
                        <i class="fas fa-paper-plane me-2"></i>Enviar Transferencia
                    </button>
                </form>
                <div id="resultadoInterbancaria" class="mt-3"></div>
            </div>
        </div>
        <div class="card mt-3">
            <div class="card-header bg-primary text-white d-flex justify-content-between align-items-center flex-wrap gap-2">
                <h5 class="mb-0"><i class="fas fa-history me-2"></i>Historial Interbancario</h5>
                <button type="button" class="btn btn-light btn-sm" id="btnActualizarHistorialInter">
                    <i class="fas fa-sync-alt me-1"></i>Actualizar historial
                </button>
            </div>
            <div class="card-body">
                <div id="historialInterbancarioContainer">
                    <div class="alert alert-info mb-0">Cargando historial...</div>
                </div>
            </div>
        </div>`;

    cargarDatosInterbancarios();
    cargarHistorialInterbancario();
    document.getElementById('interbankForm').addEventListener('submit', realizarTransferenciaInterbancaria);
    document.getElementById('btnActualizarHistorialInter').addEventListener('click', cargarHistorialInterbancario);
}

async function cargarDatosInterbancarios() {
    const selectorCuentas = document.getElementById('interCuentaOrigen');
    const selectorBancos = document.getElementById('interBancoDestino');

    try {
        const [cuentasResponse, bancosResponse] = await Promise.all([
            fetch(`${API_BASE_URL}/api/operaciones/mis-cuentas`, {
                headers: { 'Authorization': `Bearer ${authToken}` }
            }),
            fetch(`${API_BASE_URL}/api/interbancaria/bancos`, {
                headers: { 'Authorization': `Bearer ${authToken}` }
            })
        ]);

        const cuentasData = await cuentasResponse.json();
        const bancosData = await bancosResponse.json();

        if (!cuentasResponse.ok) {
            throw new Error(cuentasData.error || 'Error al cargar cuentas');
        }

        if (!bancosResponse.ok) {
            throw new Error(bancosData.error || 'Error al cargar bancos');
        }

        const cuentas = Array.isArray(cuentasData) ? cuentasData : (cuentasData.cuentas || []);
        const bancos = Array.isArray(bancosData) ? bancosData : (bancosData.bancos || []);

        if (cuentas.length === 0) {
            selectorCuentas.innerHTML = '<option value="">No hay cuentas disponibles</option>';
        } else {
            selectorCuentas.innerHTML = '<option value="">Seleccione una cuenta</option>';
            cuentas.forEach(c => {
                const numeroCuenta = c.numero_cuenta || c.numeroCuenta || c.id_cuenta;
                const nombreBanco = c.nombre_banco || c.nombreBanco || 'BancoGT';
                const saldo = Number(c.saldo || 0).toFixed(2);
                selectorCuentas.innerHTML += `<option value="${escapeHtmlInterbank(numeroCuenta)}">${escapeHtmlInterbank(numeroCuenta)} - ${escapeHtmlInterbank(nombreBanco)} (Q${saldo})</option>`;
            });
        }

        if (bancos.length === 0) {
            selectorBancos.innerHTML = '<option value="">No hay bancos externos activos</option>';
        } else {
            selectorBancos.innerHTML = '<option value="">Seleccione banco destino</option>';
            bancos.forEach(b => {
                const swift = b.swift || b.SWIFT || '';
                const nombre = b.nombre || b.name || 'Banco externo';
                selectorBancos.innerHTML += `<option value="${escapeHtmlInterbank(swift)}" data-nombre="${escapeHtmlInterbank(nombre)}">${escapeHtmlInterbank(nombre)} - ${escapeHtmlInterbank(swift)}</option>`;
            });
        }
    } catch (error) {
        console.error('Error cargando datos interbancarios:', error);
        selectorCuentas.innerHTML = '<option value="">Error al cargar cuentas</option>';
        selectorBancos.innerHTML = '<option value="">Error al cargar bancos</option>';
        document.getElementById('resultadoInterbancaria').innerHTML = `<div class="alert alert-danger">${escapeHtmlInterbank(error.message || 'Error al cargar datos interbancarios')}</div>`;
    }
}

async function realizarTransferenciaInterbancaria(e) {
    e.preventDefault();

    const resultadoDiv = document.getElementById('resultadoInterbancaria');
    const submitBtn = document.getElementById('interSubmitBtn');
    const bancoSelect = document.getElementById('interBancoDestino');
    const bancoDestino = {
        swift: bancoSelect.value,
        nombre: bancoSelect.options[bancoSelect.selectedIndex]?.dataset.nombre || bancoSelect.value
    };
    const idempotencyKey = `WEB-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const data = {
        cuentaOrigen: document.getElementById('interCuentaOrigen').value,
        swiftDestino: bancoDestino.swift,
        cuentaDestino: document.getElementById('interCuentaDestino').value.trim(),
        monto: Number(document.getElementById('interMonto').value),
        descripcion: document.getElementById('interDescripcion').value.trim() || 'Transferencia interbancaria',
        idempotencyKey
    };

    if (!data.cuentaOrigen) {
        resultadoDiv.innerHTML = '<div class="alert alert-danger">Seleccione una cuenta origen</div>';
        return;
    }

    if (!data.swiftDestino) {
        resultadoDiv.innerHTML = '<div class="alert alert-danger">Seleccione un banco destino</div>';
        return;
    }

    if (!data.cuentaDestino) {
        resultadoDiv.innerHTML = '<div class="alert alert-danger">Ingrese la cuenta destino</div>';
        return;
    }

    if (!data.monto || data.monto <= 0) {
        resultadoDiv.innerHTML = '<div class="alert alert-danger">Ingrese un monto valido</div>';
        return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Enviando...';
    resultadoDiv.innerHTML = '<div class="alert alert-info">Procesando transferencia interbancaria...</div>';

    try {
        const response = await fetch(`${API_BASE_URL}/api/interbancaria/transferir`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`,
                'Idempotency-Key': idempotencyKey
            },
            body: JSON.stringify(data)
        });
        const result = await response.json();

        if (response.ok && result.success !== false) {
            resultadoDiv.innerHTML = renderResultadoInterbancario(result, bancoDestino);
            prepararBotonComprobanteInterbancario();
            document.getElementById('interbankForm').reset();
            cargarDatosInterbancarios();
            cargarHistorialInterbancario();
        } else {
            resultadoDiv.innerHTML = renderErrorInterbancario(result, bancoDestino);
        }
    } catch (error) {
        console.error('Error transferencia interbancaria:', error);
        resultadoDiv.innerHTML = `<div class="alert alert-danger">No se pudo contactar el servicio interbancario: ${escapeHtmlInterbank(error.message || 'Error desconocido')}</div>`;
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fas fa-paper-plane me-2"></i>Enviar Transferencia';
    }
}

async function cargarHistorialInterbancario() {
    const container = document.getElementById('historialInterbancarioContainer');
    if (!container) return;

    container.innerHTML = '<div class="alert alert-info mb-0">Cargando historial...</div>';

    try {
        const response = await fetch(`${API_BASE_URL}/api/interbancaria/historial`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Error al cargar historial interbancario');
        }

        const historial = Array.isArray(data) ? data : (data.historial || []);
        container.innerHTML = renderHistorialInterbancario(historial);
    } catch (error) {
        console.error('Error cargando historial interbancario:', error);
        container.innerHTML = `<div class="alert alert-danger mb-0">${escapeHtmlInterbank(error.message || 'Error al cargar historial interbancario')}</div>`;
    }
}

function renderHistorialInterbancario(historial) {
    if (!historial.length) {
        return '<div class="alert alert-info mb-0">No hay transferencias interbancarias registradas</div>';
    }

    let html = `
        <div class="table-responsive-custom">
            <table class="table table-hover align-middle">
                <thead class="table-dark">
                    <tr>
                        <th>Fecha</th>
                        <th>Tipo</th>
                        <th>Banco origen</th>
                        <th>Banco destino</th>
                        <th>Cuenta origen</th>
                        <th>Cuenta destino</th>
                        <th>Monto</th>
                        <th>Estado</th>
                        <th>Referencia interna</th>
                    </tr>
                </thead>
                <tbody>`;

    historial.forEach(t => {
        html += `
            <tr>
                <td>${escapeHtmlInterbank(formatFechaInterbank(t.fecha || t.fecha_creacion))}</td>
                <td><span class="badge ${t.tipo === 'ENTRANTE' ? 'bg-info' : 'bg-primary'}">${escapeHtmlInterbank(t.tipo || '-')}</span></td>
                <td>${escapeHtmlInterbank(t.bancoOrigen || t.banco_origen || t.banco_origen_swift || '-')}</td>
                <td>${escapeHtmlInterbank(t.bancoDestino || t.banco_destino || t.banco_destino_swift || '-')}</td>
                <td>${escapeHtmlInterbank(t.cuentaOrigen || t.numero_cuenta_origen || '-')}</td>
                <td>${escapeHtmlInterbank(t.cuentaDestino || t.numero_cuenta_destino || '-')}</td>
                <td class="fw-bold">Q${Number(t.monto || 0).toFixed(2)}</td>
                <td><span class="badge ${getEstadoBadgeClassInterbank(t.estado)}">${escapeHtmlInterbank(t.estado || '-')}</span></td>
                <td><small>${escapeHtmlInterbank(t.referenciaInterna || t.referencia_interna || '-')}</small></td>
            </tr>`;
    });

    html += '</tbody></table></div>';
    return html;
}

function getEstadoBadgeClassInterbank(estado) {
    const value = String(estado || '').toUpperCase();

    if (value === 'CONFIRMADA') return 'bg-success';
    if (value === 'RECHAZADA') return 'bg-danger';
    if (value === 'PENDIENTE') return 'bg-warning text-dark';
    if (value === 'ERROR') return 'bg-secondary';

    return 'bg-secondary';
}

function formatFechaInterbank(value) {
    if (!value) return '-';

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return value;
    }

    return date.toLocaleString();
}

function sanitizeFileNameInterbank(value) {
    return String(value || 'comprobante').replace(/[^a-zA-Z0-9_-]/g, '_');
}

function renderResultadoInterbancario(result, bancoDestino) {
    const transferencia = result.transferencia || result;
    const estado = transferencia.estado || result.estado || 'CONFIRMADA';
    const referenciaInterna = transferencia.referenciaInterna
        || transferencia.referencia_interna
        || result.referenciaInterna
        || result.referencia_interna
        || '-';
    const referenciaExterna = transferencia.referenciaExterna
        || transferencia.referencia_externa
        || result.referenciaExterna
        || result.referencia_externa
        || '';
    const mensaje = result.message
        || result.mensaje
        || transferencia.mensaje
        || 'Transferencia interbancaria enviada';
    const respuestaBanco = getRespuestaBancoInterbank(transferencia.respuestaBanco
        || transferencia.responsePayload
        || result.respuestaBanco
        || result.details
        || null);

    return `
        <div class="alert alert-success">
            <h6 class="alert-heading mb-2"><i class="fas fa-check-circle me-2"></i>Transferencia interbancaria enviada</h6>
            <div><strong>Estado:</strong> ${escapeHtmlInterbank(estado)}</div>
            <div><strong>Referencia interna:</strong> ${escapeHtmlInterbank(referenciaInterna)}</div>
            ${referenciaExterna ? `<div><strong>Referencia externa:</strong> ${escapeHtmlInterbank(referenciaExterna)}</div>` : ''}
            <div><strong>Banco destino:</strong> ${escapeHtmlInterbank(bancoDestino.nombre)} (${escapeHtmlInterbank(bancoDestino.swift)})</div>
            <div><strong>Mensaje:</strong> ${escapeHtmlInterbank(mensaje)}</div>
            ${String(estado).toUpperCase() === 'CONFIRMADA' && referenciaInterna !== '-' ? `
                <button type="button" class="btn btn-success btn-sm mt-3" id="btnDescargarComprobanteInter" data-referencia="${escapeHtmlInterbank(referenciaInterna)}">
                    <i class="fas fa-file-pdf me-1"></i>Descargar comprobante
                </button>
                <div id="comprobanteInterMensaje" class="mt-2"></div>
            ` : ''}
        </div>
        ${respuestaBanco ? `<div class="border rounded p-3 bg-light">
            <strong>Respuesta del banco externo</strong>
            <pre class="small mb-0 mt-2 text-break">${formatJsonInterbank(respuestaBanco)}</pre>
        </div>` : ''}`;
}

function prepararBotonComprobanteInterbancario() {
    const button = document.getElementById('btnDescargarComprobanteInter');
    if (!button) return;

    button.addEventListener('click', () => {
        descargarComprobanteInterbancario(button.dataset.referencia, button);
    });
}

async function descargarComprobanteInterbancario(referencia, button) {
    const messageDiv = document.getElementById('comprobanteInterMensaje');
    const originalHtml = button ? button.innerHTML : '';

    if (!referencia) {
        if (messageDiv) {
            messageDiv.innerHTML = '<div class="alert alert-danger py-2 mb-0">Referencia interna no disponible</div>';
        }
        return;
    }

    try {
        if (button) {
            button.disabled = true;
            button.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Generando...';
        }
        if (messageDiv) messageDiv.innerHTML = '';

        const response = await fetch(`${API_BASE_URL}/api/interbancaria/comprobante/${encodeURIComponent(referencia)}`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        if (!response.ok) {
            let message = 'No se pudo descargar el comprobante';
            try {
                const error = await response.json();
                message = error.error || message;
            } catch (parseError) {
                message = response.statusText || message;
            }
            throw new Error(message);
        }

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `comprobante-${sanitizeFileNameInterbank(referencia)}.pdf`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);

        if (messageDiv) {
            messageDiv.innerHTML = '<div class="alert alert-success py-2 mb-0">Comprobante descargado</div>';
        }
    } catch (error) {
        console.error('Error descargando comprobante:', error);
        if (messageDiv) {
            messageDiv.innerHTML = `<div class="alert alert-danger py-2 mb-0">${escapeHtmlInterbank(error.message || 'Error al descargar comprobante')}</div>`;
        }
    } finally {
        if (button) {
            button.disabled = false;
            button.innerHTML = originalHtml || '<i class="fas fa-file-pdf me-1"></i>Descargar comprobante';
        }
    }
}

function renderErrorInterbancario(result, bancoDestino) {
    const mensaje = result.error || result.message || 'El banco externo rechazo la transferencia';
    const titulo = getTituloErrorInterbank(result);
    const detalle = getRespuestaBancoInterbank(result.details || result.respuestaBanco || result);

    return `
        <div class="alert alert-danger">
            <h6 class="alert-heading mb-2"><i class="fas fa-times-circle me-2"></i>${escapeHtmlInterbank(titulo)}</h6>
            <div>${escapeHtmlInterbank(mensaje)}</div>
            <div class="mt-2"><strong>Banco destino:</strong> ${escapeHtmlInterbank(bancoDestino.nombre)} (${escapeHtmlInterbank(bancoDestino.swift)})</div>
        </div>
        ${detalle ? `<div class="border rounded p-3 bg-light">
            <strong>Respuesta del banco externo</strong>
            <pre class="small mb-0 mt-2 text-break">${formatJsonInterbank(detalle)}</pre>
        </div>` : ''}`;
}

function getTituloErrorInterbank(result) {
    const texto = JSON.stringify(result || {}).toLowerCase();

    if (texto.includes('saldo insuficiente')) {
        return 'Saldo insuficiente';
    }

    if (texto.includes('autentic') || texto.includes('authorization') || texto.includes('bearer') || texto.includes('token')) {
        return 'Banco requiere autenticacion';
    }

    if (texto.includes('cuenta') && (texto.includes('rechaz') || texto.includes('no fue validada'))) {
        return 'Cuenta rechazada';
    }

    if (texto.includes('no disponible') || texto.includes('tiempo') || texto.includes('timeout') || texto.includes('no confirmo') || texto.includes('banco destino no encontrado')) {
        return 'Banco no disponible';
    }

    return 'Transferencia rechazada';
}

function getRespuestaBancoInterbank(value) {
    if (value === undefined || value === null || value === '') {
        return null;
    }

    if (typeof value === 'object' && Object.keys(value).length === 0) {
        return null;
    }

    return value;
}

function formatJsonInterbank(value) {
    try {
        if (value === undefined || value === null) {
            return 'Sin detalle adicional';
        }
        return escapeHtmlInterbank(JSON.stringify(value, null, 2));
    } catch (error) {
        return escapeHtmlInterbank(String(value));
    }
}

function escapeHtmlInterbank(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function loadAdminERP() {
    destroyERPCharts();
    document.getElementById('dashboardContent').innerHTML = `
        <div class="erp-dashboard">
            <section class="erp-toolbar">
                <div class="d-flex justify-content-between align-items-center flex-wrap gap-3">
                    <div>
                        <h4 class="mb-1"><i class="fas fa-briefcase me-2 text-success"></i>Administracion ERP</h4>
                        <p class="text-muted mb-0">Vista ejecutiva de clientes, cuentas, bancos conectados y operaciones interbancarias.</p>
                    </div>
                    <button type="button" class="btn btn-success btn-sm" id="btnActualizarERP">
                        <i class="fas fa-sync-alt me-1"></i>Actualizar panel
                    </button>
                </div>
            </section>
            <div id="adminERPContent">
                <div class="alert alert-info mb-0">Cargando panel administrativo...</div>
            </div>
        </div>`;

    document.getElementById('btnActualizarERP').addEventListener('click', cargarAdminERP);
    cargarAdminERP();
}

async function cargarAdminERP() {
    const container = document.getElementById('adminERPContent');
    if (!container) return;

    container.innerHTML = '<div class="alert alert-info mb-0">Cargando panel administrativo...</div>';
    destroyERPCharts();

    try {
        const auditoriaRequests = canViewAuditoriaERP()
            ? [fetchAdminERP('/admin/auditoria?limit=120'), fetchAdminERP('/admin/auditoria/resumen')]
            : [Promise.resolve({ eventos: [] }), Promise.resolve({ resumen: null })];

        const [resumen, cuentas, interbancarias, bancos, auditoria, auditoriaResumen] = await Promise.all([
            fetchAdminERP('/admin/resumen'),
            fetchAdminERP('/admin/cuentas?limit=100'),
            fetchAdminERP('/admin/interbancarias?limit=100'),
            fetchAdminERP('/admin/bancos-externos'),
            ...auditoriaRequests
        ]);

        erpData = {
            resumen: resumen.resumen || {},
            cuentas: cuentas.cuentas || [],
            interbancarias: interbancarias.transferencias || [],
            bancos: bancos.bancos || [],
            auditoria: auditoria.eventos || [],
            auditoriaResumen: auditoriaResumen.resumen || null
        };

        renderAdminERPContent();
    } catch (error) {
        console.error('Error cargando Administracion ERP:', error);
        container.innerHTML = `<div class="alert alert-danger mb-0">${escapeHtmlInterbank(error.message || 'Error al cargar Administracion ERP')}</div>`;
    }
}

async function fetchAdminERP(path) {
    const response = await fetch(`${API_BASE_URL}/api${path}`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
    });
    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error || 'Error al consultar Administracion ERP');
    }

    return data;
}

function renderAdminERPContent() {
    const container = document.getElementById('adminERPContent');
    if (!container) return;

    const filters = getERPFilters();
    const transferenciasFiltradas = filtrarInterbancariasERP(erpData.interbancarias, filters);
    const bancosFiltrados = filtrarBancosERP(erpData.bancos, filters);

    container.innerHTML = `
        ${renderFiltrosERP(filters)}
        ${renderResumenERP(erpData.resumen || {})}
        ${renderGraficosERP()}
        ${renderCuentasERP(erpData.cuentas || [])}
        ${renderInterbancariasERP(transferenciasFiltradas)}
        ${renderBancosExternosERP(bancosFiltrados)}
        ${canViewAuditoriaERP() ? renderAuditoriaERP(erpData.auditoria || [], erpData.auditoriaResumen) : ''}
    `;

    bindAdminERPControls();
    renderERPCharts(transferenciasFiltradas, erpData.cuentas || []);
    applyERPQuickSearch();
}

function getERPFilters() {
    return {
        fechaDesde: document.getElementById('erpFechaDesde')?.value || '',
        fechaHasta: document.getElementById('erpFechaHasta')?.value || '',
        estado: document.getElementById('erpEstadoFiltro')?.value || '',
        banco: document.getElementById('erpBancoFiltro')?.value || ''
    };
}

function renderFiltrosERP(filters) {
    const estados = [...new Set((erpData.interbancarias || [])
        .map(t => String(t.estado || '').trim())
        .filter(Boolean))]
        .sort();
    const bancos = (erpData.bancos || []).slice().sort((a, b) => String(a.nombre || '').localeCompare(String(b.nombre || '')));

    return `
        <section class="erp-section">
            <div class="erp-section-header">
                <div>
                    <h5 class="erp-section-title"><i class="fas fa-filter me-2"></i>Filtros operativos</h5>
                    <p class="erp-section-subtitle">Aplican a graficos, transferencias interbancarias y mapa de bancos.</p>
                </div>
                <button type="button" class="btn btn-outline-secondary btn-sm" id="erpResetFiltros">
                    <i class="fas fa-rotate-left me-1"></i>Limpiar filtros
                </button>
            </div>
            <div class="erp-filter-grid">
                <div>
                    <label class="form-label small fw-bold" for="erpFechaDesde">Fecha desde</label>
                    <input type="date" id="erpFechaDesde" class="form-control form-control-sm" value="${escapeHtmlInterbank(filters.fechaDesde)}">
                </div>
                <div>
                    <label class="form-label small fw-bold" for="erpFechaHasta">Fecha hasta</label>
                    <input type="date" id="erpFechaHasta" class="form-control form-control-sm" value="${escapeHtmlInterbank(filters.fechaHasta)}">
                </div>
                <div>
                    <label class="form-label small fw-bold" for="erpEstadoFiltro">Estado</label>
                    <select id="erpEstadoFiltro" class="form-select form-select-sm">
                        <option value="">Todos</option>
                        ${estados.map(estado => `<option value="${escapeHtmlInterbank(estado)}" ${filters.estado === estado ? 'selected' : ''}>${escapeHtmlInterbank(estado)}</option>`).join('')}
                    </select>
                </div>
                <div>
                    <label class="form-label small fw-bold" for="erpBancoFiltro">Banco</label>
                    <select id="erpBancoFiltro" class="form-select form-select-sm">
                        <option value="">Todos</option>
                        ${bancos.map(banco => `
                            <option value="${escapeHtmlInterbank(banco.swift)}" ${filters.banco === banco.swift ? 'selected' : ''}>
                                ${escapeHtmlInterbank(banco.nombre)} - ${escapeHtmlInterbank(banco.swift)}
                            </option>
                        `).join('')}
                    </select>
                </div>
                <div>
                    <label class="form-label small fw-bold" for="erpBuscarInter">Busqueda rapida</label>
                    <input type="search" id="erpBuscarInter" class="form-control form-control-sm" placeholder="Referencia, cuenta, banco">
                </div>
            </div>
        </section>`;
}

function bindAdminERPControls() {
    ['erpFechaDesde', 'erpFechaHasta', 'erpEstadoFiltro', 'erpBancoFiltro'].forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('change', renderAdminERPContent);
        }
    });

    const resetButton = document.getElementById('erpResetFiltros');
    if (resetButton) {
        resetButton.addEventListener('click', () => {
            ['erpFechaDesde', 'erpFechaHasta', 'erpEstadoFiltro', 'erpBancoFiltro'].forEach(id => {
                const element = document.getElementById(id);
                if (element) element.value = '';
            });
            renderAdminERPContent();
        });
    }

    ['erpBuscarCuenta', 'erpBuscarInter', 'erpBuscarBanco'].forEach(id => {
        const input = document.getElementById(id);
        if (input) {
            input.addEventListener('input', applyERPQuickSearch);
        }
    });

    const auditButton = document.getElementById('btnFiltrarAuditoriaERP');
    if (auditButton) {
        auditButton.addEventListener('click', cargarAuditoriaERP);
    }

    const auditClearButton = document.getElementById('btnLimpiarAuditoriaERP');
    if (auditClearButton) {
        auditClearButton.addEventListener('click', () => {
            ['auditUsuarioFiltro', 'auditModuloFiltro', 'auditAccionFiltro', 'auditEstadoFiltro', 'auditFechaDesde', 'auditFechaHasta'].forEach(id => {
                const element = document.getElementById(id);
                if (element) element.value = '';
            });
            cargarAuditoriaERP();
        });
    }
}

function renderResumenERP(resumen) {
    const cards = [
        { label: 'Clientes', value: resumen.totalClientes || 0, icon: 'fa-users', cls: 'kpi-blue' },
        { label: 'Cuentas', value: resumen.totalCuentas || 0, icon: 'fa-credit-card', cls: 'kpi-teal' },
        { label: 'Saldo administrado', value: formatCurrencyERP(resumen.saldoTotalAdministrado), icon: 'fa-wallet', cls: 'kpi-green' },
        { label: 'Transferencias locales', value: resumen.transferenciasLocalesDia || 0, icon: 'fa-right-left', cls: 'kpi-amber' },
        { label: 'Inter confirmadas', value: resumen.interbancariasConfirmadas || 0, icon: 'fa-circle-check', cls: 'kpi-purple' },
        { label: 'Inter rechazadas', value: resumen.interbancariasRechazadas || 0, icon: 'fa-circle-xmark', cls: 'kpi-red' }
    ];

    return `
        <section class="erp-section">
            <div class="erp-section-header">
                <div>
                    <h5 class="erp-section-title"><i class="fas fa-chart-pie me-2"></i>Indicadores ejecutivos</h5>
                    <p class="erp-section-subtitle">Resumen general para monitoreo operativo del ERP bancario.</p>
                </div>
            </div>
            <div class="row g-3">
            ${cards.map(card => `
                <div class="col-12 col-sm-6 col-xl-4">
                    <div class="erp-kpi-card">
                        <div class="d-flex justify-content-between align-items-start gap-3">
                            <div>
                                <div class="kpi-label">${escapeHtmlInterbank(card.label)}</div>
                                <div class="kpi-value mt-2">${escapeHtmlInterbank(card.value)}</div>
                            </div>
                            <span class="kpi-icon ${card.cls}">
                                <i class="fas ${card.icon}"></i>
                            </span>
                        </div>
                    </div>
                </div>
            `).join('')}
            </div>
        </section>`;
}

function renderGraficosERP() {
    return `
        <section class="erp-section">
            <div class="erp-section-header">
                <div>
                    <h5 class="erp-section-title"><i class="fas fa-chart-column me-2"></i>Analitica operacional</h5>
                    <p class="erp-section-subtitle">Distribucion de estados, saldos por producto y volumen por banco conectado.</p>
                </div>
            </div>
            <div class="row g-3">
                <div class="col-12 col-xl-4">
                    <div class="erp-chart-box">
                        <canvas id="erpEstadoChart"></canvas>
                    </div>
                </div>
                <div class="col-12 col-xl-4">
                    <div class="erp-chart-box">
                        <canvas id="erpSaldoTipoChart"></canvas>
                    </div>
                </div>
                <div class="col-12 col-xl-4">
                    <div class="erp-chart-box">
                        <canvas id="erpBancoChart"></canvas>
                    </div>
                </div>
            </div>
        </section>`;
}

function renderCuentasERP(cuentas) {
    return `
        <section class="erp-section">
            <div class="erp-section-header">
                <div>
                    <h5 class="erp-section-title"><i class="fas fa-credit-card me-2"></i>Cuentas administradas</h5>
                    <p class="erp-section-subtitle">Consulta rapida de productos bancarios y saldos vigentes.</p>
                </div>
                <div class="input-group input-group-sm" style="max-width: 320px;">
                    <span class="input-group-text"><i class="fas fa-search"></i></span>
                    <input type="search" id="erpBuscarCuenta" class="form-control" placeholder="Buscar cuenta o cliente">
                </div>
            </div>
            <div class="table-responsive-custom">
                <table class="table table-hover align-middle erp-table" id="erpTablaCuentas">
                    <thead>
                        <tr>
                            <th>Numero cuenta</th>
                            <th>Cliente</th>
                            <th>Tipo</th>
                            <th>Saldo</th>
                            <th>Estado</th>
                            <th class="text-end">Accion</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${cuentas.length ? cuentas.map(c => `
                            <tr data-erp-search="${escapeHtmlInterbank(`${c.numero_cuenta} ${c.cliente} ${c.tipo} ${c.estado}`.toLowerCase())}">
                                <td>${escapeHtmlInterbank(c.numero_cuenta)}</td>
                                <td>${escapeHtmlInterbank(c.cliente)}</td>
                                <td>${escapeHtmlInterbank(c.tipo)}</td>
                                <td class="fw-bold">${formatCurrencyERP(c.saldo)}</td>
                                <td><span class="badge erp-status-badge ${String(c.estado).toUpperCase() === 'ACTIVA' ? 'bg-success' : 'bg-secondary'}">${escapeHtmlInterbank(c.estado)}</span></td>
                                <td class="text-end">
                                    <button type="button" class="btn btn-outline-primary btn-sm" title="Copiar numero de cuenta" onclick="copiarTextoERP('${encodeURIComponent(c.numero_cuenta || '')}')">
                                        <i class="fas fa-copy"></i>
                                    </button>
                                </td>
                            </tr>
                        `).join('') : '<tr><td colspan="6" class="text-center">No hay cuentas registradas</td></tr>'}
                    </tbody>
                </table>
            </div>
        </section>`;
}

function renderInterbancariasERP(transferencias) {
    return `
        <section class="erp-section">
            <div class="erp-section-header">
                <div>
                    <h5 class="erp-section-title"><i class="fas fa-globe-americas me-2"></i>Transferencias interbancarias</h5>
                    <p class="erp-section-subtitle">Operaciones SWIFT filtradas por fecha, estado y banco conectado.</p>
                </div>
                <span class="badge bg-light text-dark border">${transferencias.length} registros</span>
            </div>
            <div class="table-responsive-custom">
                <table class="table table-hover align-middle erp-table" id="erpTablaInterbancarias">
                    <thead>
                        <tr>
                            <th>Fecha</th>
                            <th>Tipo</th>
                            <th>Banco origen/destino</th>
                            <th>Monto</th>
                            <th>Estado</th>
                            <th>Referencia</th>
                            <th class="text-end">Accion</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${transferencias.length ? transferencias.map(t => `
                            <tr data-erp-search="${escapeHtmlInterbank(`${t.fecha || t.fecha_creacion} ${t.tipo} ${t.banco_origen_swift} ${t.banco_destino_swift} ${t.banco_destino_nombre} ${t.estado} ${t.referencia_interna}`.toLowerCase())}">
                                <td>${escapeHtmlInterbank(formatFechaInterbank(t.fecha || t.fecha_creacion))}</td>
                                <td><span class="badge erp-type-badge ${t.tipo === 'ENTRANTE' ? 'bg-info' : 'bg-primary'}">${escapeHtmlInterbank(t.tipo)}</span></td>
                                <td>
                                    <small class="d-block"><strong>Origen:</strong> ${escapeHtmlInterbank(t.banco_origen_swift || '-')}</small>
                                    <small class="d-block"><strong>Destino:</strong> ${escapeHtmlInterbank(formatBancoDestinoERP(t))}</small>
                                </td>
                                <td class="fw-bold">${formatCurrencyERP(t.monto, t.moneda)}</td>
                                <td><span class="badge erp-status-badge ${getEstadoBadgeClassInterbank(t.estado)}">${escapeHtmlInterbank(t.estado)}</span></td>
                                <td><small>${escapeHtmlInterbank(t.referencia_interna)}</small></td>
                                <td class="text-end">
                                    <button type="button" class="btn btn-outline-primary btn-sm" title="Copiar referencia" onclick="copiarTextoERP('${encodeURIComponent(t.referencia_interna || '')}')">
                                        <i class="fas fa-copy"></i>
                                    </button>
                                </td>
                            </tr>
                        `).join('') : '<tr><td colspan="7" class="text-center">No hay transferencias interbancarias</td></tr>'}
                    </tbody>
                </table>
            </div>
        </section>`;
}

function renderBancosExternosERP(bancos) {
    return `
        <section class="erp-section">
            <div class="erp-section-header">
                <div>
                    <h5 class="erp-section-title"><i class="fas fa-network-wired me-2"></i>Mapa de bancos conectados</h5>
                    <p class="erp-section-subtitle">Bancos externos habilitados para interoperabilidad bancaria por SWIFT.</p>
                </div>
                <div class="input-group input-group-sm" style="max-width: 320px;">
                    <span class="input-group-text"><i class="fas fa-search"></i></span>
                    <input type="search" id="erpBuscarBanco" class="form-control" placeholder="Buscar banco o SWIFT">
                </div>
            </div>
            <div class="erp-bank-map mb-3">
                ${bancos.length ? bancos.map(b => `
                    <div class="erp-bank-card" data-erp-search="${escapeHtmlInterbank(`${b.nombre} ${b.swift} ${b.base_url} ${b.activo ? 'activo' : 'inactivo'}`.toLowerCase())}">
                        <div class="d-flex justify-content-between align-items-start gap-2">
                            <div>
                                <h6 class="mb-1">${escapeHtmlInterbank(b.nombre)}</h6>
                                <span class="badge bg-secondary">${escapeHtmlInterbank(b.swift)}</span>
                            </div>
                            <span class="badge erp-status-badge ${b.activo ? 'bg-success' : 'bg-danger'}">${b.activo ? 'Activo' : 'Inactivo'}</span>
                        </div>
                        <div class="erp-bank-url mt-3">${escapeHtmlInterbank(b.base_url || '-')}</div>
                        <div class="text-end mt-3">
                            <button type="button" class="btn btn-outline-secondary btn-sm" title="Abrir URL" onclick="abrirUrlERP('${encodeURIComponent(b.base_url || '')}')">
                                <i class="fas fa-arrow-up-right-from-square"></i>
                            </button>
                        </div>
                    </div>
                `).join('') : '<div class="alert alert-info mb-0">No hay bancos externos registrados</div>'}
            </div>
            <div class="table-responsive-custom">
                <table class="table table-hover align-middle erp-table" id="erpTablaBancos">
                    <thead>
                        <tr>
                            <th>Nombre</th>
                            <th>SWIFT</th>
                            <th>URL</th>
                            <th>Activo</th>
                            <th class="text-end">Accion</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${bancos.length ? bancos.map(b => `
                            <tr data-erp-search="${escapeHtmlInterbank(`${b.nombre} ${b.swift} ${b.base_url} ${b.activo ? 'activo' : 'inactivo'}`.toLowerCase())}">
                                <td>${escapeHtmlInterbank(b.nombre)}</td>
                                <td><span class="badge bg-secondary">${escapeHtmlInterbank(b.swift)}</span></td>
                                <td><small>${escapeHtmlInterbank(b.base_url)}</small></td>
                                <td><span class="badge erp-status-badge ${b.activo ? 'bg-success' : 'bg-danger'}">${b.activo ? 'Activo' : 'Inactivo'}</span></td>
                                <td class="text-end">
                                    <button type="button" class="btn btn-outline-secondary btn-sm" title="Abrir URL" onclick="abrirUrlERP('${encodeURIComponent(b.base_url || '')}')">
                                        <i class="fas fa-arrow-up-right-from-square"></i>
                                    </button>
                                </td>
                            </tr>
                        `).join('') : '<tr><td colspan="5" class="text-center">No hay bancos externos registrados</td></tr>'}
                    </tbody>
                </table>
            </div>
        </section>`;
}

function renderAuditoriaERP(eventos, resumen) {
    const modulos = [...new Set(eventos.map(e => e.modulo).filter(Boolean))].sort();
    const acciones = [...new Set(eventos.map(e => e.accion).filter(Boolean))].sort();
    const estados = [...new Set(eventos.map(e => e.estado).filter(Boolean))].sort();

    return `
        <section class="erp-section">
            <div class="erp-section-header">
                <div>
                    <h5 class="erp-section-title"><i class="fas fa-shield-halved me-2"></i>Auditoria y seguridad</h5>
                    <p class="erp-section-subtitle">Eventos sensibles del ERP bancario visibles solo para ADMIN y GERENTE.</p>
                </div>
                <span class="badge bg-light text-dark border">${eventos.length} eventos</span>
            </div>
            ${resumen ? `
                <div class="row g-3 mb-3">
                    <div class="col-6 col-lg-3"><div class="erp-kpi-card py-3"><div class="kpi-label">Eventos</div><div class="kpi-value">${resumen.total || 0}</div></div></div>
                    <div class="col-6 col-lg-3"><div class="erp-kpi-card py-3"><div class="kpi-label">Exitosos</div><div class="kpi-value text-success">${resumen.exitosos || 0}</div></div></div>
                    <div class="col-6 col-lg-3"><div class="erp-kpi-card py-3"><div class="kpi-label">Fallidos</div><div class="kpi-value text-danger">${resumen.fallidos || 0}</div></div></div>
                    <div class="col-6 col-lg-3"><div class="erp-kpi-card py-3"><div class="kpi-label">Denegados</div><div class="kpi-value text-warning">${resumen.denegados || 0}</div></div></div>
                </div>` : ''}
            <div class="erp-filter-grid mb-3">
                <div>
                    <label class="form-label small fw-bold" for="auditUsuarioFiltro">Usuario</label>
                    <input type="search" id="auditUsuarioFiltro" class="form-control form-control-sm" placeholder="admin, cliente...">
                </div>
                <div>
                    <label class="form-label small fw-bold" for="auditModuloFiltro">Modulo</label>
                    <select id="auditModuloFiltro" class="form-select form-select-sm">
                        <option value="">Todos</option>
                        ${modulos.map(modulo => `<option value="${escapeHtmlInterbank(modulo)}">${escapeHtmlInterbank(modulo)}</option>`).join('')}
                    </select>
                </div>
                <div>
                    <label class="form-label small fw-bold" for="auditAccionFiltro">Accion</label>
                    <select id="auditAccionFiltro" class="form-select form-select-sm">
                        <option value="">Todas</option>
                        ${acciones.map(accion => `<option value="${escapeHtmlInterbank(accion)}">${escapeHtmlInterbank(accion)}</option>`).join('')}
                    </select>
                </div>
                <div>
                    <label class="form-label small fw-bold" for="auditEstadoFiltro">Estado</label>
                    <select id="auditEstadoFiltro" class="form-select form-select-sm">
                        <option value="">Todos</option>
                        ${estados.map(estado => `<option value="${escapeHtmlInterbank(estado)}">${escapeHtmlInterbank(estado)}</option>`).join('')}
                    </select>
                </div>
                <div>
                    <label class="form-label small fw-bold" for="auditFechaDesde">Fecha desde</label>
                    <input type="date" id="auditFechaDesde" class="form-control form-control-sm">
                </div>
                <div>
                    <label class="form-label small fw-bold" for="auditFechaHasta">Fecha hasta</label>
                    <input type="date" id="auditFechaHasta" class="form-control form-control-sm">
                </div>
                <div class="d-flex align-items-end gap-2">
                    <button type="button" class="btn btn-success btn-sm w-100" id="btnFiltrarAuditoriaERP">
                        <i class="fas fa-filter me-1"></i>Filtrar
                    </button>
                    <button type="button" class="btn btn-outline-secondary btn-sm" id="btnLimpiarAuditoriaERP" title="Limpiar">
                        <i class="fas fa-rotate-left"></i>
                    </button>
                </div>
            </div>
            <div class="table-responsive-custom">
                <table class="table table-hover align-middle erp-table" id="erpTablaAuditoria">
                    <thead>
                        <tr>
                            <th>Fecha</th>
                            <th>Usuario</th>
                            <th>Rol</th>
                            <th>Modulo</th>
                            <th>Accion</th>
                            <th>Estado</th>
                            <th>Descripcion</th>
                            <th>IP</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${eventos.length ? eventos.map(evento => `
                            <tr>
                                <td>${escapeHtmlInterbank(formatFechaInterbank(evento.fecha))}</td>
                                <td>${escapeHtmlInterbank(evento.username || '-')}</td>
                                <td><span class="badge bg-secondary">${escapeHtmlInterbank(evento.rol || '-')}</span></td>
                                <td>${escapeHtmlInterbank(evento.modulo)}</td>
                                <td><small>${escapeHtmlInterbank(evento.accion)}</small></td>
                                <td><span class="badge erp-status-badge ${getAuditEstadoBadgeClass(evento.estado)}">${escapeHtmlInterbank(evento.estado)}</span></td>
                                <td><small>${escapeHtmlInterbank(evento.descripcion || '-')}</small></td>
                                <td><small>${escapeHtmlInterbank(evento.ip || '-')}</small></td>
                            </tr>
                        `).join('') : '<tr><td colspan="8" class="text-center">No hay eventos de auditoria con los filtros actuales</td></tr>'}
                    </tbody>
                </table>
            </div>
        </section>`;
}

async function cargarAuditoriaERP() {
    if (!canViewAuditoriaERP()) return;

    const params = new URLSearchParams();
    params.set('limit', '120');

    const filters = {
        username: document.getElementById('auditUsuarioFiltro')?.value || '',
        modulo: document.getElementById('auditModuloFiltro')?.value || '',
        accion: document.getElementById('auditAccionFiltro')?.value || '',
        estado: document.getElementById('auditEstadoFiltro')?.value || '',
        fechaDesde: document.getElementById('auditFechaDesde')?.value || '',
        fechaHasta: document.getElementById('auditFechaHasta')?.value || ''
    };

    Object.entries(filters).forEach(([key, value]) => {
        if (value) params.set(key, value);
    });

    try {
        const [auditoria, auditoriaResumen] = await Promise.all([
            fetchAdminERP(`/admin/auditoria?${params.toString()}`),
            fetchAdminERP(`/admin/auditoria/resumen?${params.toString()}`)
        ]);

        erpData.auditoria = auditoria.eventos || [];
        erpData.auditoriaResumen = auditoriaResumen.resumen || null;

        const oldFilters = { ...filters };
        renderAdminERPContent();

        Object.entries(oldFilters).forEach(([key, value]) => {
            const map = {
                username: 'auditUsuarioFiltro',
                modulo: 'auditModuloFiltro',
                accion: 'auditAccionFiltro',
                estado: 'auditEstadoFiltro',
                fechaDesde: 'auditFechaDesde',
                fechaHasta: 'auditFechaHasta'
            };
            const element = document.getElementById(map[key]);
            if (element) element.value = value;
        });
    } catch (error) {
        const table = document.querySelector('#erpTablaAuditoria tbody');
        if (table) {
            table.innerHTML = `<tr><td colspan="8" class="text-danger text-center">${escapeHtmlInterbank(error.message || 'Error al cargar auditoria')}</td></tr>`;
        }
    }
}

function getAuditEstadoBadgeClass(estado) {
    const value = String(estado || '').toUpperCase();
    if (value === 'OK' || value === 'CONFIRMADA') return 'bg-success';
    if (value === 'FALLIDO' || value === 'ERROR') return 'bg-danger';
    if (value === 'DENEGADO' || value === 'RECHAZADA') return 'bg-warning text-dark';
    return 'bg-secondary';
}

function formatCurrencyERP(value, moneda = 'GTQ') {
    const amount = Number(value || 0);
    const prefix = moneda === 'USD' ? '$' : 'Q';
    return `${prefix}${amount.toFixed(2)}`;
}

function formatBancoDestinoERP(transferencia) {
    if (transferencia.banco_destino_nombre) {
        return `${transferencia.banco_destino_nombre} (${transferencia.banco_destino_swift || '-'})`;
    }

    return transferencia.banco_destino_swift || '-';
}

function filtrarInterbancariasERP(transferencias, filters) {
    return (transferencias || []).filter(t => {
        const estado = String(t.estado || '');
        const bancoTexto = [
            t.banco_origen_swift,
            t.banco_destino_swift,
            t.banco_destino_nombre
        ].filter(Boolean).join(' ').toUpperCase();

        return dateMatchesERP(t.fecha || t.fecha_creacion, filters.fechaDesde, filters.fechaHasta)
            && (!filters.estado || estado === filters.estado)
            && (!filters.banco || bancoTexto.includes(String(filters.banco).toUpperCase()));
    });
}

function filtrarBancosERP(bancos, filters) {
    if (!filters.banco) {
        return bancos || [];
    }

    return (bancos || []).filter(banco => String(banco.swift || '').toUpperCase() === String(filters.banco).toUpperCase());
}

function dateMatchesERP(value, fechaDesde, fechaHasta) {
    if (!fechaDesde && !fechaHasta) {
        return true;
    }

    if (!value) {
        return false;
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return false;
    }

    const isoDate = date.toISOString().slice(0, 10);
    return (!fechaDesde || isoDate >= fechaDesde) && (!fechaHasta || isoDate <= fechaHasta);
}

function groupByERP(items, keyGetter, valueGetter = () => 1) {
    return (items || []).reduce((acc, item) => {
        const key = keyGetter(item) || 'Sin datos';
        acc[key] = (acc[key] || 0) + Number(valueGetter(item) || 0);
        return acc;
    }, {});
}

function chartDataFromMapERP(map, emptyLabel = 'Sin datos') {
    const entries = Object.entries(map || {}).filter(([, value]) => Number(value) !== 0);

    if (!entries.length) {
        return { labels: [emptyLabel], values: [1], empty: true };
    }

    return {
        labels: entries.map(([label]) => label),
        values: entries.map(([, value]) => value),
        empty: false
    };
}

function destroyERPCharts() {
    Object.values(erpCharts || {}).forEach(chart => {
        if (chart && typeof chart.destroy === 'function') {
            chart.destroy();
        }
    });
    erpCharts = {};
}

function renderERPCharts(transferencias, cuentas) {
    if (typeof Chart === 'undefined') {
        return;
    }

    destroyERPCharts();

    const estadoData = chartDataFromMapERP(groupByERP(transferencias, t => t.estado || 'Sin estado'));
    const saldoTipoData = chartDataFromMapERP(groupByERP(cuentas, c => c.tipo || 'Sin tipo', c => c.saldo), 'Sin saldos');
    const bancoData = chartDataFromMapERP(groupByERP(transferencias, t => {
        if (t.tipo === 'ENTRANTE') return t.banco_origen_swift || 'Banco externo';
        return t.banco_destino_nombre || t.banco_destino_swift || 'Banco externo';
    }), 'Sin bancos');

    const palette = ['#2563eb', '#15803d', '#d97706', '#dc2626', '#6d28d9', '#0f766e', '#64748b'];

    erpCharts.estados = createERPChart('erpEstadoChart', {
        type: 'doughnut',
        data: {
            labels: estadoData.labels,
            datasets: [{
                data: estadoData.values,
                backgroundColor: estadoData.empty ? ['#cbd5e1'] : palette
            }]
        },
        options: {
            plugins: {
                legend: { position: 'bottom' },
                title: { display: true, text: 'Transferencias por estado' }
            },
            maintainAspectRatio: false
        }
    });

    erpCharts.saldos = createERPChart('erpSaldoTipoChart', {
        type: 'bar',
        data: {
            labels: saldoTipoData.labels,
            datasets: [{
                label: 'Saldo',
                data: saldoTipoData.values,
                backgroundColor: saldoTipoData.empty ? '#cbd5e1' : '#15803d',
                borderRadius: 8
            }]
        },
        options: {
            plugins: {
                legend: { display: false },
                title: { display: true, text: 'Saldo por tipo de cuenta' }
            },
            scales: { y: { beginAtZero: true } },
            maintainAspectRatio: false
        }
    });

    erpCharts.bancos = createERPChart('erpBancoChart', {
        type: 'bar',
        data: {
            labels: bancoData.labels,
            datasets: [{
                label: 'Transferencias',
                data: bancoData.values,
                backgroundColor: bancoData.empty ? '#cbd5e1' : '#2563eb',
                borderRadius: 8
            }]
        },
        options: {
            indexAxis: 'y',
            plugins: {
                legend: { display: false },
                title: { display: true, text: 'Interbancarias por banco' }
            },
            scales: { x: { beginAtZero: true, ticks: { precision: 0 } } },
            maintainAspectRatio: false
        }
    });
}

function createERPChart(id, config) {
    const canvas = document.getElementById(id);
    if (!canvas) {
        return null;
    }

    return new Chart(canvas.getContext('2d'), config);
}

function applyERPQuickSearch() {
    applyERPTableSearch('erpBuscarCuenta', '#erpTablaCuentas tbody tr');
    applyERPTableSearch('erpBuscarInter', '#erpTablaInterbancarias tbody tr');
    applyERPTableSearch('erpBuscarBanco', '#adminERPContent .erp-bank-card, #erpTablaBancos tbody tr');
}

function applyERPTableSearch(inputId, selector) {
    const input = document.getElementById(inputId);
    if (!input) return;

    const term = input.value.trim().toLowerCase();
    document.querySelectorAll(selector).forEach(row => {
        const source = row.getAttribute('data-erp-search') || row.textContent.toLowerCase();
        row.style.display = !term || source.includes(term) ? '' : 'none';
    });
}

function copiarTextoERP(encodedValue) {
    const value = decodeURIComponent(encodedValue || '');
    if (!value) return;

    if (navigator.clipboard) {
        navigator.clipboard.writeText(value).catch(() => {});
    }
}

function abrirUrlERP(encodedUrl) {
    const url = decodeURIComponent(encodedUrl || '');
    if (!url) return;

    window.open(url, '_blank', 'noopener,noreferrer');
}

async function loadHistorial() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/operaciones/mis-cuentas`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const cuentas = await response.json();
        if (cuentas.length === 0) {
            document.getElementById('dashboardContent').innerHTML = '<div class="alert alert-info">No tienes cuentas vinculadas</div>';
            return;
        }
        const historial = await fetch(`${API_BASE_URL}/api/transferencias/cuenta/${cuentas[0].id_cuenta}/historial`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const trans = await historial.json();
        let html = '<div class="table-responsive-custom"><table class="table table-hover"><thead class="table-dark"><tr><th>Fecha</th><th>Origen</th><th>Destino</th><th>Monto</th><th>Estado</th></tr></thead><tbody>';
        if (trans.length === 0) {
            html += '<tr><td colspan="5" class="text-center">No hay transferencias registradas</td></tr>';
        } else {
            trans.forEach(t => {
                html += `<tr>
                            <td>${new Date(t.fecha_transferencia).toLocaleString()}</td>
                            <td>${t.cuenta_origen_num}</td>
                            <td>${t.cuenta_destino_num}</td>
                            <td class="text-danger fw-bold">Q${parseFloat(t.monto).toFixed(2)}</td>
                            <td><span class="badge bg-success">${t.estado_nombre}</span></td>
                        </tr>`;
            });
        }
        html += '</tbody></table></div>';
        document.getElementById('dashboardContent').innerHTML = html;
    } catch (error) {
        document.getElementById('dashboardContent').innerHTML = '<div class="alert alert-danger">Error al cargar historial</div>';
    }
}

async function loadResumenDia() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/operaciones/resumen-dia`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const data = await response.json();
        
        const contentDiv = document.getElementById('dashboardContent');
        contentDiv.innerHTML = `
            <div class="row mb-4">
                <div class="col-6 col-md-3 mb-3">
                    <div class="card bg-primary text-white card-stats">
                        <div class="card-body">
                            <h5>Transferencias</h5>
                            <h2>${data.total_transferencias || 0}</h2>
                            <small>Q${(data.monto_transferencias || 0).toFixed(2)}</small>
                        </div>
                    </div>
                </div>
                <div class="col-6 col-md-3 mb-3">
                    <div class="card bg-success text-white card-stats">
                        <div class="card-body">
                            <h5>Depósitos</h5>
                            <h2>${data.total_depositos || 0}</h2>
                            <small>Q${(data.monto_depositos || 0).toFixed(2)}</small>
                        </div>
                    </div>
                </div>
                <div class="col-6 col-md-3 mb-3">
                    <div class="card bg-warning text-dark card-stats">
                        <div class="card-body">
                            <h5>Retiros</h5>
                            <h2>${data.total_retiros || 0}</h2>
                            <small>Q${(data.monto_retiros || 0).toFixed(2)}</small>
                        </div>
                    </div>
                </div>
                <div class="col-6 col-md-3 mb-3">
                    <div class="card bg-info text-white card-stats">
                        <div class="card-body">
                            <h5>Cuentas Nuevas</h5>
                            <h2>${data.total_cuentas_nuevas || 0}</h2>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="row">
                <div class="col-12 col-md-6 mb-3">
                    <div class="chart-container">
                        <h6>Transacciones por Hora</h6>
                        <canvas id="horasChart"></canvas>
                    </div>
                </div>
                <div class="col-12 col-md-6 mb-3">
                    <div class="chart-container">
                        <h6>Monto Total por Tipo (Q)</h6>
                        <canvas id="montosChart"></canvas>
                    </div>
                </div>
            </div>
            
            <div class="row">
                <div class="col-12">
                    <div class="chart-container">
                        <h6>Transacciones por Usuario</h6>
                        <div class="table-responsive-custom">
                            <table class="table table-sm">
                                <thead class="table-dark">
                                    <tr><th>Usuario</th><th>Rol</th><th>Transacciones</th><th>Ingresos</th><th>Egresos</th></tr>
                                </thead>
                                <tbody>
                                    ${data.transacciones_por_usuario && data.transacciones_por_usuario.length > 0 ? 
                                        data.transacciones_por_usuario.map(u => `
                                            <tr>
                                                <td>${u.nombre_usuario || 'Sistema'}</td>
                                                <td>${u.rol_nombre || '-'}</td>
                                                <td>${u.total_transacciones}</td>
                                                <td class="text-success">Q${parseFloat(u.total_ingresos).toFixed(2)}</td>
                                                <td class="text-danger">Q${parseFloat(u.total_egresos).toFixed(2)}</td>
                                            </tr>
                                        `).join('') : 
                                        '<tr><td colspan="5" class="text-center">No hay transacciones hoy</td></tr>'
                                    }
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="row mt-3">
                <div class="col-12">
                    <div class="chart-container">
                        <h6>Movimientos Recientes</h6>
                        <div class="table-responsive-custom">
                            <table class="table table-sm">
                                <thead class="table-dark">
                                    <tr><th>Hora</th><th>Tipo</th><th>Cuenta</th><th>Monto</th><th>Usuario</th></tr>
                                </thead>
                                <tbody>
                                    ${data.movimientos_recientes && data.movimientos_recientes.length > 0 ? 
                                        data.movimientos_recientes.map(m => `
                                            <tr>
                                                <td>${new Date(m.fecha_movimiento).toLocaleTimeString()}</td>
                                                <td>${m.nombre_tipo}</td>
                                                <td>${m.numero_cuenta || '-'}</td>
                                                <td class="${m.signo === '+' ? 'text-success' : 'text-danger'}">${m.signo === '+' ? '+' : '-'} Q${parseFloat(m.monto).toFixed(2)}</td>
                                                <td>${m.usuario || '-'}</td>
                                            </tr>
                                        `).join('') : 
                                        '<tr><td colspan="5" class="text-center">No hay movimientos hoy</td></tr>'
                                    }
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        if (data.transacciones_por_hora && Object.keys(data.transacciones_por_hora).length > 0) {
            const ctx = document.getElementById('horasChart').getContext('2d');
            new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: Object.keys(data.transacciones_por_hora),
                    datasets: [{
                        label: 'Transacciones',
                        data: Object.values(data.transacciones_por_hora),
                        backgroundColor: '#1a472a',
                        borderColor: '#0d2818',
                        borderWidth: 1
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    scales: { y: { beginAtZero: true, stepSize: 1 } }
                }
            });
        }
        
        if (data.montos_por_tipo && Object.keys(data.montos_por_tipo).length > 0) {
            const ctx2 = document.getElementById('montosChart').getContext('2d');
            new Chart(ctx2, {
                type: 'doughnut',
                data: {
                    labels: Object.keys(data.montos_por_tipo),
                    datasets: [{
                        data: Object.values(data.montos_por_tipo),
                        backgroundColor: ['#1a472a', '#2d6a4f', '#ffd700', '#dc3545', '#17a2b8']
                    }]
                },
                options: { 
                    responsive: true,
                    maintainAspectRatio: true
                }
            });
        }
        
    } catch (error) {
        console.error('Error:', error);
        document.getElementById('dashboardContent').innerHTML = '<div class="alert alert-danger">Error al cargar resumen del día</div>';
    }
}

function loadBuscarCuenta() {
    document.getElementById('dashboardContent').innerHTML = `
        <div class="card">
            <div class="card-header bg-primary text-white">
                <h5><i class="fas fa-search me-2"></i>Buscar Cuenta</h5>
            </div>
            <div class="card-body">
                <div class="row">
                    <div class="col-12 col-md-8 mb-3 mb-md-0">
                        <label>Número de Cuenta o DPI</label>
                        <input type="text" id="buscarValor" class="form-control" placeholder="Ej: GT100000001 o 1234567890101">
                    </div>
                    <div class="col-12 col-md-4">
                        <label>&nbsp;</label>
                        <button class="btn btn-primary w-100" onclick="window.buscarCuenta()">Buscar</button>
                    </div>
                </div>
                <div id="resultadoBusqueda" class="mt-3"></div>
            </div>
        </div>`;
}

window.buscarCuenta = async function() {
    const valor = document.getElementById('buscarValor').value;
    if (!valor) return;
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/cuentas/buscar/${encodeURIComponent(valor)}`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const cuenta = await response.json();
        if (response.ok) {
            document.getElementById('resultadoBusqueda').innerHTML = `
                <div class="alert alert-success">
                    <div class="row">
                        <div class="col-12 col-md-8">
                            <h5>✅ Cuenta encontrada</h5>
                            <p><strong>Número:</strong> ${cuenta.numero_cuenta}</p>
                            <p><strong>Titular:</strong> ${cuenta.nombre} ${cuenta.apellido}</p>
                            <p><strong>DPI:</strong> ${cuenta.dpi}</p>
                            <p><strong>Banco:</strong> ${cuenta.nombre_banco}</p>
                            <p><strong>Tipo:</strong> ${cuenta.nombre_tipo}</p>
                            <p><strong>Saldo actual:</strong> <span class="fw-bold text-success">Q${parseFloat(cuenta.saldo).toFixed(2)}</span></p>
                        </div>
                        <div class="col-12 col-md-4 text-md-end mt-3 mt-md-0">
                            <button class="btn btn-info w-100 w-md-auto" onclick="window.verEstadoCuenta('${cuenta.numero_cuenta}')">
                                <i class="fas fa-chart-line me-1"></i>Ver Estado
                            </button>
                        </div>
                    </div>
                </div>`;
        } else {
            document.getElementById('resultadoBusqueda').innerHTML = `<div class="alert alert-danger">❌ ${cuenta.error}</div>`;
        }
    } catch (error) {
        document.getElementById('resultadoBusqueda').innerHTML = '<div class="alert alert-danger">Error al buscar</div>';
    }
};

window.verEstadoCuenta = async function(numeroCuenta) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/cuentas/estado/${numeroCuenta}`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const data = await response.json();
        if (response.ok) {
            let html = `
                <div class="modal fade" id="estadoModal" tabindex="-1">
                    <div class="modal-dialog modal-lg modal-dialog-scrollable">
                        <div class="modal-content">
                            <div class="modal-header bg-info text-white">
                                <h5><i class="fas fa-chart-line me-2"></i>Estado de Cuenta - ${numeroCuenta}</h5>
                                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                            </div>
                            <div class="modal-body">
                                <div class="row mb-3">
                                    <div class="col-12 col-md-6"><strong>Titular:</strong> ${data.titular}</div>
                                    <div class="col-12 col-md-6"><strong>Saldo Actual:</strong> Q${parseFloat(data.saldo).toFixed(2)}</div>
                                </div>
                                <h6>Resumen de Movimientos</h6>
                                <div class="table-responsive">
                                    <table class="table table-sm">
                                        <thead class="table-dark">
                                            <tr><th>Fecha</th><th>Tipo</th><th>Monto</th><th>Saldo Nuevo</th><th>Descripción</th></tr>
                                        </thead>
                                        <tbody>`;
            
            data.movimientos.forEach(m => {
                const montoColor = m.signo === '+' ? 'text-success' : 'text-danger';
                html += `<tr>
                            <td>${new Date(m.fecha_movimiento).toLocaleString()}</td>
                            <td>${m.nombre_tipo}</td>
                            <td class="${montoColor}">${m.signo === '+' ? '+' : '-'} Q${parseFloat(m.monto).toFixed(2)}</td>
                            <td>Q${parseFloat(m.saldo_nuevo).toFixed(2)}</td>
                            <td><small>${m.descripcion || '-'}</small></td>
                         </tr>`;
            });
            
            html += `</tbody>
                    </table>
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" data-bs-dismiss="modal">Cerrar</button>
            </div>
        </div>
    </div>
</div>`;
            
            const existingModal = document.getElementById('estadoModal');
            if (existingModal) existingModal.remove();
            document.body.insertAdjacentHTML('beforeend', html);
            new bootstrap.Modal(document.getElementById('estadoModal')).show();
        } else {
            alert('Error al cargar el estado de la cuenta');
        }
    } catch (error) {
        alert('Error al consultar el estado');
    }
};

function loadDeposito() {
    document.getElementById('dashboardContent').innerHTML = `
        <div class="card">
            <div class="card-header bg-success text-white">
                <h5><i class="fas fa-plus-circle me-2"></i>Depósito en Efectivo</h5>
            </div>
            <div class="card-body">
                <form id="depositoForm">
                    <div class="mb-3">
                        <label>Número de Cuenta</label>
                        <input type="text" id="depositoCuenta" class="form-control" required>
                    </div>
                    <div class="mb-3">
                        <label>Monto (Q)</label>
                        <input type="number" id="depositoMonto" class="form-control" step="0.01" required>
                    </div>
                    <div class="mb-3">
                        <label>Referencia</label>
                        <input type="text" id="depositoReferencia" class="form-control" placeholder="Depósito en ventanilla">
                    </div>
                    <button type="submit" class="btn btn-success">Realizar Depósito</button>
                </form>
                <div id="resultadoDeposito" class="mt-3"></div>
            </div>
        </div>`;
    document.getElementById('depositoForm').addEventListener('submit', realizarDeposito);
}

async function realizarDeposito(e) {
    e.preventDefault();
    const data = {
        numero_cuenta: document.getElementById('depositoCuenta').value,
        monto: parseFloat(document.getElementById('depositoMonto').value),
        referencia: document.getElementById('depositoReferencia').value
    };
    try {
        const response = await fetch(`${API_BASE_URL}/api/operaciones/deposito`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
            body: JSON.stringify(data)
        });
        const result = await response.json();
        if (response.ok) {
            document.getElementById('resultadoDeposito').innerHTML = `<div class="alert alert-success">✅ ${result.message}</div>`;
            document.getElementById('depositoForm').reset();
        } else {
            document.getElementById('resultadoDeposito').innerHTML = `<div class="alert alert-danger">❌ ${result.error}</div>`;
        }
    } catch (error) {
        document.getElementById('resultadoDeposito').innerHTML = '<div class="alert alert-danger">Error</div>';
    }
}

function loadRetiro() {
    document.getElementById('dashboardContent').innerHTML = `
        <div class="card">
            <div class="card-header bg-warning text-dark">
                <h5><i class="fas fa-minus-circle me-2"></i>Retiro en Efectivo</h5>
            </div>
            <div class="card-body">
                <form id="retiroForm">
                    <div class="mb-3">
                        <label>Número de Cuenta</label>
                        <input type="text" id="retiroCuenta" class="form-control" required>
                    </div>
                    <div class="mb-3">
                        <label>Monto (Q)</label>
                        <input type="number" id="retiroMonto" class="form-control" step="0.01" required>
                    </div>
                    <div class="mb-3">
                        <label>Referencia</label>
                        <input type="text" id="retiroReferencia" class="form-control" placeholder="Retiro en ventanilla">
                    </div>
                    <button type="submit" class="btn btn-warning">Realizar Retiro</button>
                </form>
                <div id="resultadoRetiro" class="mt-3"></div>
            </div>
        </div>`;
    document.getElementById('retiroForm').addEventListener('submit', realizarRetiro);
}

async function realizarRetiro(e) {
    e.preventDefault();
    const data = {
        numero_cuenta: document.getElementById('retiroCuenta').value,
        monto: parseFloat(document.getElementById('retiroMonto').value),
        referencia: document.getElementById('retiroReferencia').value
    };
    try {
        const response = await fetch(`${API_BASE_URL}/api/operaciones/retiro`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
            body: JSON.stringify(data)
        });
        const result = await response.json();
        if (response.ok) {
            document.getElementById('resultadoRetiro').innerHTML = `<div class="alert alert-success">✅ ${result.message}</div>`;
            document.getElementById('retiroForm').reset();
        } else {
            document.getElementById('resultadoRetiro').innerHTML = `<div class="alert alert-danger">❌ ${result.error}</div>`;
        }
    } catch (error) {
        document.getElementById('resultadoRetiro').innerHTML = '<div class="alert alert-danger">Error</div>';
    }
}

function loadTransferenciaAsistida() {
    document.getElementById('dashboardContent').innerHTML = `
        <div class="card">
            <div class="card-header bg-info text-white">
                <h5><i class="fas fa-hand-holding-usd me-2"></i>Transferencia Asistida</h5>
            </div>
            <div class="card-body">
                <form id="transferAsistidaForm">
                    <div class="mb-3">
                        <label>Cuenta Origen</label>
                        <input type="text" id="asistidaOrigen" class="form-control" placeholder="Número de cuenta origen" required>
                    </div>
                    <div class="mb-3">
                        <label>Cuenta Destino</label>
                        <input type="text" id="asistidaDestino" class="form-control" placeholder="Número de cuenta destino" required>
                    </div>
                    <div class="mb-3">
                        <label>Monto (Q)</label>
                        <input type="number" id="asistidaMonto" class="form-control" step="0.01" required>
                    </div>
                    <div class="mb-3">
                        <label>Referencia</label>
                        <input type="text" id="asistidaReferencia" class="form-control">
                    </div>
                    <button type="submit" class="btn btn-info">Realizar Transferencia</button>
                </form>
                <div id="resultadoAsistida" class="mt-3"></div>
            </div>
        </div>`;
    document.getElementById('transferAsistidaForm').addEventListener('submit', realizarTransferenciaAsistida);
}

async function realizarTransferenciaAsistida(e) {
    e.preventDefault();
    const data = {
        cuenta_origen: document.getElementById('asistidaOrigen').value,
        cuenta_destino: document.getElementById('asistidaDestino').value,
        monto: parseFloat(document.getElementById('asistidaMonto').value),
        referencia: document.getElementById('asistidaReferencia').value,
        descripcion: 'Transferencia realizada por cajero'
    };
    try {
        const response = await fetch(`${API_BASE_URL}/api/transferencias`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
            body: JSON.stringify(data)
        });
        const result = await response.json();
        if (response.ok) {
            document.getElementById('resultadoAsistida').innerHTML = '<div class="alert alert-success">✅ Transferencia realizada</div>';
            document.getElementById('transferAsistidaForm').reset();
        } else {
            document.getElementById('resultadoAsistida').innerHTML = `<div class="alert alert-danger">❌ ${result.error}</div>`;
        }
    } catch (error) {
        document.getElementById('resultadoAsistida').innerHTML = '<div class="alert alert-danger">Error</div>';
    }
}

function loadAperturaCuenta() {
    document.getElementById('dashboardContent').innerHTML = `
        <div class="card">
            <div class="card-header bg-success text-white">
                <h5><i class="fas fa-user-plus me-2"></i>Apertura de Cuenta</h5>
            </div>
            <div class="card-body">
                <div class="alert alert-info">
                    <i class="fas fa-info-circle me-2"></i>Banco Industrial es la única opción disponible.
                </div>
                <form id="aperturaForm">
                    <div class="row">
                        <div class="col-md-6 mb-3">
                            <label>DPI del Cliente *</label>
                            <input type="text" id="dpiCliente" class="form-control" placeholder="Ej: 1234567890101" required>
                        </div>
                        <div class="col-md-6 mb-3">
                            <label>Fecha de Nacimiento</label>
                            <input type="date" id="fechaNacimiento" class="form-control">
                        </div>
                    </div>
                    <div class="row">
                        <div class="col-md-6 mb-3">
                            <label>Nombre</label>
                            <input type="text" id="nombreCliente" class="form-control" placeholder="Ej: Jorge">
                        </div>
                        <div class="col-md-6 mb-3">
                            <label>Apellido</label>
                            <input type="text" id="apellidoCliente" class="form-control" placeholder="Ej: Campos">
                        </div>
                    </div>
                    <div class="row">
                        <div class="col-md-6 mb-3">
                            <label>Teléfono</label>
                            <input type="text" id="telefonoCliente" class="form-control" placeholder="Ej: 55512345">
                        </div>
                        <div class="col-md-6 mb-3">
                            <label>Correo Electrónico</label>
                            <input type="email" id="correoCliente" class="form-control" placeholder="Ej: jorge@email.com">
                        </div>
                    </div>
                    <div class="mb-3">
                        <label>Dirección</label>
                        <textarea id="direccionCliente" class="form-control" rows="2" placeholder="Dirección completa"></textarea>
                    </div>
                    <hr>
                    <h6>Datos de la Cuenta</h6>
                    <div class="row">
                        <div class="col-md-4 mb-3">
                            <label>Banco</label>
                            <select id="bancoCuentaApertura" class="form-control" disabled>
                                <option value="1">Banco Industrial</option>
                            </select>
                        </div>
                        <div class="col-md-4 mb-3">
                            <label>Tipo de Cuenta</label>
                            <select id="tipoCuentaApertura" class="form-control">
                                <option value="1">Ahorro</option>
                                <option value="2">Corriente</option>
                                <option value="3">Plazo Fijo</option>
                            </select>
                        </div>
                        <div class="col-md-4 mb-3">
                            <label>Moneda</label>
                            <select id="monedaCuentaApertura" class="form-control">
                                <option value="1">GTQ - Quetzal</option>
                                <option value="2">USD - Dólar</option>
                            </select>
                        </div>
                    </div>
                    <div class="mb-3">
                        <label>Monto de Apertura (Q)</label>
                        <input type="number" id="montoAperturaCajero" class="form-control" step="0.01" min="0" value="100.00">
                    </div>
                    <button type="submit" class="btn btn-success w-100">Crear Cuenta</button>
                </form>
                <div id="resultadoApertura" class="mt-3"></div>
            </div>
        </div>`;
    
    document.getElementById('dpiCliente').addEventListener('blur', buscarClientePorDpi);
    document.getElementById('aperturaForm').addEventListener('submit', realizarAperturaCuenta);
}

async function buscarClientePorDpi() {
    const dpi = document.getElementById('dpiCliente').value;
    if (!dpi || dpi.length < 8) return;
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/cuentas/cliente/buscar/${dpi}`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const cliente = await response.json();
        if (response.ok && cliente) {
            document.getElementById('nombreCliente').value = cliente.nombre || '';
            document.getElementById('apellidoCliente').value = cliente.apellido || '';
            document.getElementById('fechaNacimiento').value = cliente.fecha_nacimiento || '';
            document.getElementById('telefonoCliente').value = cliente.telefono || '';
            document.getElementById('correoCliente').value = cliente.correo || '';
            document.getElementById('direccionCliente').value = cliente.direccion || '';
        }
    } catch (error) {
        console.log('Cliente no encontrado, ingrese datos manualmente');
    }
}

async function realizarAperturaCuenta(e) {
    e.preventDefault();
    
    const data = {
        dpi: document.getElementById('dpiCliente').value,
        nombre: document.getElementById('nombreCliente').value,
        apellido: document.getElementById('apellidoCliente').value,
        fecha_nacimiento: document.getElementById('fechaNacimiento').value || null,
        telefono: document.getElementById('telefonoCliente').value || null,
        correo: document.getElementById('correoCliente').value || null,
        direccion: document.getElementById('direccionCliente').value || null,
        id_banco: 1,
        id_tipo_cuenta: parseInt(document.getElementById('tipoCuentaApertura').value),
        id_moneda: parseInt(document.getElementById('monedaCuentaApertura').value),
        monto_apertura: parseFloat(document.getElementById('montoAperturaCajero').value)
    };
    
    if (!data.dpi) {
        document.getElementById('resultadoApertura').innerHTML = '<div class="alert alert-danger">❌ El DPI es requerido</div>';
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/operaciones/apertura-cuenta`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
            body: JSON.stringify(data)
        });
        
        const result = await response.json();
        
        if (response.ok) {
            // Mostrar mensaje con DPI y todos los datos
            let mensajeHTML = `
                <div class="alert alert-success">
                    <i class="fas fa-check-circle me-2"></i> ${result.message}<br><br>
                    <strong>📌 DATOS DEL CLIENTE:</strong><br>
                    • DPI: <strong>${result.cliente?.dpi || data.dpi}</strong><br>
                    • Nombre: ${result.cliente?.nombre || data.nombre} ${result.cliente?.apellido || data.apellido}<br>
                    • Teléfono: ${result.cliente?.telefono || data.telefono || 'No registrado'}<br>
                    • Correo: ${result.cliente?.correo || data.correo || 'No registrado'}<br>
                    • Dirección: ${result.cliente?.direccion || data.direccion || 'No registrada'}<br><br>
                    <strong>🏦 DATOS DE LA CUENTA:</strong><br>
                    • Número de cuenta: <strong class="fs-5">${result.numero_cuenta}</strong><br>
                    • Saldo inicial: Q${result.saldo_inicial}<br><br>
                    <strong>⚠️ IMPORTANTE:</strong> Entregue estos datos al cliente.
                </div>
            `;
            document.getElementById('resultadoApertura').innerHTML = mensajeHTML;
            document.getElementById('aperturaForm').reset();
        } else if (result.cuenta_existente) {
            // Cliente ya tiene cuenta
            document.getElementById('resultadoApertura').innerHTML = `
                <div class="alert alert-warning">
                    <i class="fas fa-exclamation-triangle me-2"></i> ${result.error}<br><br>
                    <strong>📌 CUENTA EXISTENTE:</strong><br>
                    • Número de cuenta: ${result.cuenta_existente.numero_cuenta}<br>
                    • Titular: ${result.cuenta_existente.titular}<br>
                    • Saldo: Q${result.cuenta_existente.saldo}<br>
                    • Fecha apertura: ${result.cuenta_existente.fecha_apertura}
                </div>
            `;
        } else {
            document.getElementById('resultadoApertura').innerHTML = `<div class="alert alert-danger">❌ ${result.error}</div>`;
        }
    } catch (error) {
        console.error('Error:', error);
        document.getElementById('resultadoApertura').innerHTML = '<div class="alert alert-danger">❌ Error al crear cuenta</div>';
    }
}

window.verMovimientos = async function(idCuenta) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/cuentas/${idCuenta}/movimientos`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const movimientos = await response.json();
        
        let html = `
            <div class="modal fade" id="movModal" tabindex="-1">
                <div class="modal-dialog modal-lg modal-dialog-scrollable">
                    <div class="modal-content">
                        <div class="modal-header bg-primary text-white">
                            <h5>Movimientos de Cuenta</h5>
                            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <div class="table-responsive">
                                <table class="table table-sm">
                                    <thead class="table-dark">
                                        <tr><th>Fecha</th><th>Tipo</th><th>Monto</th><th>Saldo Nuevo</th><th>Descripción</th></tr>
                                    </thead>
                                    <tbody>`;
        
        if (movimientos.length === 0) {
            html += '<tr><td colspan="5" class="text-center">No hay movimientos registrados</td></tr>';
        } else {
            movimientos.forEach(m => {
                const montoColor = m.signo === '+' ? 'text-success' : 'text-danger';
                html += `<tr>
                             <td>${new Date(m.fecha_movimiento).toLocaleString()}</td>
                             <td>${m.nombre_tipo}</td>
                            <td class="${montoColor}">${m.signo === '+' ? '+' : '-'} Q${parseFloat(m.monto).toFixed(2)}</td>
                             <td>Q${parseFloat(m.saldo_nuevo).toFixed(2)}</td>
                             <td><small>${m.descripcion || '-'}</small></td>
                         </tr>`;
            });
        }
        
        html += `</tbody>
                    </table>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button class="btn btn-secondary" data-bs-dismiss="modal">Cerrar</button>
                        </div>
                    </div>
                </div>
            </div>`;
        
        const existingModal = document.getElementById('movModal');
        if (existingModal) existingModal.remove();
        document.body.insertAdjacentHTML('beforeend', html);
        new bootstrap.Modal(document.getElementById('movModal')).show();
        
    } catch (error) {
        console.error('Error:', error);
        alert('Error al cargar movimientos');
    }
};
