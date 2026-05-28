const API_URL = '/api';

document.addEventListener('DOMContentLoaded', function() {
    console.log('✅ App iniciada correctamente');
    
    const regCliente = document.getElementById('regCliente');
    const regCajero = document.getElementById('regCajero');
    const codigoEmpleadoDiv = document.getElementById('codigoEmpleadoDiv');
    
    if (regCliente && regCajero) {
        regCliente.addEventListener('change', function() {
            if (this.checked) {
                codigoEmpleadoDiv.style.display = 'none';
                document.getElementById('codigoEmpleado').required = false;
            }
        });
        regCajero.addEventListener('change', function() {
            if (this.checked) {
                codigoEmpleadoDiv.style.display = 'block';
                document.getElementById('codigoEmpleado').required = true;
            }
        });
    }
    
    // ============================================
    // LOGIN
    // ============================================
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const username = document.getElementById('loginUsername').value;
            const password = document.getElementById('loginPassword').value;
            const accessType = document.getElementById('accessCajero').checked ? 'cajero' : 'cliente';
            const errorDiv = document.getElementById('loginError');
            
            errorDiv.classList.add('d-none');
            
            if (!username || !password) {
                errorDiv.textContent = 'Ingrese usuario y contraseña';
                errorDiv.classList.remove('d-none');
                return;
            }
            
            try {
                const response = await fetch(`${API_URL}/auth/login`, {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ 
                        username: username, 
                        password: password, 
                        accessType: accessType 
                    })
                });
                
                const data = await response.json();
                
                if (response.ok) {
                    localStorage.setItem('token', data.token);
                    localStorage.setItem('user', JSON.stringify(data.user));
                    localStorage.setItem('accessType', accessType);
                    window.location.href = '/dashboard.html';
                } else {
                    errorDiv.textContent = data.error || 'Error al iniciar sesión';
                    errorDiv.classList.remove('d-none');
                }
            } catch (error) {
                console.error('Error en login:', error);
                errorDiv.textContent = 'Error de conexión al servidor';
                errorDiv.classList.remove('d-none');
            }
        });
    }
    
    // ============================================
    // REGISTRO
    // ============================================
    const registerForm = document.getElementById('registerForm');
    if (registerForm) {
        registerForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const nombre = document.getElementById('regNombre').value;
            const username = document.getElementById('regUsername').value;
            const email = document.getElementById('regEmail').value;
            const dpi = document.getElementById('regDpi').value;
            const password = document.getElementById('regPassword').value;
            const confirmPassword = document.getElementById('regConfirmPassword').value;
            const regType = document.getElementById('regCajero').checked ? 'cajero' : 'cliente';
            const codigoEmpleado = regType === 'cajero' ? document.getElementById('codigoEmpleado').value : null;
            
            const successDiv = document.getElementById('registerSuccess');
            const errorDiv = document.getElementById('registerError');
            
            successDiv.classList.add('d-none');
            errorDiv.classList.add('d-none');
            
            if (!nombre || !username || !email || !dpi || !password) {
                errorDiv.textContent = 'Todos los campos son requeridos';
                errorDiv.classList.remove('d-none');
                return;
            }
            
            if (password !== confirmPassword) {
                errorDiv.textContent = 'Las contraseñas no coinciden';
                errorDiv.classList.remove('d-none');
                return;
            }
            
            if (password.length < 6) {
                errorDiv.textContent = 'La contraseña debe tener al menos 6 caracteres';
                errorDiv.classList.remove('d-none');
                return;
            }
            
            if (regType === 'cajero' && !codigoEmpleado) {
                errorDiv.textContent = 'Ingrese el código de empleado';
                errorDiv.classList.remove('d-none');
                return;
            }
            
            try {
                const response = await fetch(`${API_URL}/auth/register`, {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ 
                        nombre_completo: nombre, 
                        username: username, 
                        email: email, 
                        dpi: dpi,
                        password: password,
                        regType: regType,
                        codigo_empleado: codigoEmpleado
                    })
                });
                
                const data = await response.json();
                
                if (response.ok) {
                    successDiv.textContent = data.message + ' - Ahora puedes iniciar sesión';
                    successDiv.classList.remove('d-none');
                    registerForm.reset();
                    
                    if (codigoEmpleadoDiv) {
                        codigoEmpleadoDiv.style.display = 'none';
                    }
                    
                    setTimeout(() => {
                        const loginTab = document.querySelector('#login-tab');
                        if (loginTab) {
                            new bootstrap.Tab(loginTab).show();
                        }
                        successDiv.classList.add('d-none');
                    }, 3000);
                } else {
                    errorDiv.textContent = data.error || 'Error en el registro';
                    errorDiv.classList.remove('d-none');
                }
            } catch (error) {
                console.error('Error en registro:', error);
                errorDiv.textContent = 'Error de conexión al servidor';
                errorDiv.classList.remove('d-none');
            }
        });
    }
    
    // ============================================
    // RECUPERAR CONTRASEÑA (OLVIDÉ MI CONTRASEÑA)
    // ============================================
    const forgotPasswordLink = document.getElementById('forgotPasswordLink');
    const forgotPasswordModalElement = document.getElementById('forgotPasswordModal');
    let forgotPasswordModal = null;
    
    if (forgotPasswordModalElement) {
        forgotPasswordModal = new bootstrap.Modal(forgotPasswordModalElement);
    }
    
    if (forgotPasswordLink) {
        forgotPasswordLink.addEventListener('click', function(e) {
            e.preventDefault();
            console.log('✅ Click en olvidé mi contraseña');
            if (forgotPasswordModal) {
                forgotPasswordModal.show();
            } else {
                console.log('❌ Modal no encontrado');
            }
            // Limpiar formulario y resultados
            const forgotForm = document.getElementById('forgotPasswordForm');
            const forgotResult = document.getElementById('forgotPasswordResult');
            if (forgotForm) forgotForm.reset();
            if (forgotResult) forgotResult.innerHTML = '';
        });
    }
    
    const forgotPasswordForm = document.getElementById('forgotPasswordForm');
    const forgotPasswordResult = document.getElementById('forgotPasswordResult');
    
    if (forgotPasswordForm) {
        forgotPasswordForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const username = document.getElementById('forgotUsername').value;
            const dpi = document.getElementById('forgotDpi').value;
            const nueva_password = document.getElementById('forgotNewPassword').value;
            const confirmar_password = document.getElementById('forgotConfirmPassword').value;
            
            if (forgotPasswordResult) forgotPasswordResult.innerHTML = '';
            
            if (!username || !dpi || !nueva_password || !confirmar_password) {
                if (forgotPasswordResult) forgotPasswordResult.innerHTML = '<div class="alert alert-danger">❌ Todos los campos son requeridos</div>';
                return;
            }
            
            if (nueva_password !== confirmar_password) {
                if (forgotPasswordResult) forgotPasswordResult.innerHTML = '<div class="alert alert-danger">❌ Las contraseñas no coinciden</div>';
                return;
            }
            
            if (nueva_password.length < 6) {
                if (forgotPasswordResult) forgotPasswordResult.innerHTML = '<div class="alert alert-danger">❌ La contraseña debe tener al menos 6 caracteres</div>';
                return;
            }
            
            if (forgotPasswordResult) forgotPasswordResult.innerHTML = '<div class="alert alert-info">⏳ Procesando...</div>';
            
            try {
                const response = await fetch(`${API_URL}/auth/cambiar-password`, {
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
                    if (forgotPasswordResult) {
                        forgotPasswordResult.innerHTML = `
                            <div class="alert alert-success">
                                <i class="fas fa-check-circle me-2"></i> ${result.message}<br><br>
                                <strong>✅ Contraseña cambiada exitosamente.</strong><br>
                                Ahora puedes iniciar sesión con tu nueva contraseña.
                            </div>
                        `;
                    }
                    forgotPasswordForm.reset();
                    
                    setTimeout(() => {
                        if (forgotPasswordModal) forgotPasswordModal.hide();
                        const loginTab = document.querySelector('#login-tab');
                        if (loginTab) new bootstrap.Tab(loginTab).show();
                    }, 2000);
                } else {
                    if (forgotPasswordResult) forgotPasswordResult.innerHTML = `<div class="alert alert-danger">❌ ${result.error}</div>`;
                }
            } catch (error) {
                console.error('Error:', error);
                if (forgotPasswordResult) forgotPasswordResult.innerHTML = '<div class="alert alert-danger">❌ Error de conexión al servidor</div>';
            }
        });
    }
    
    // ============================================
    // Redirigir si ya está logueado
    // ============================================
    const token = localStorage.getItem('token');
    const user = localStorage.getItem('user');
    if (token && user) {
        window.location.href = '/dashboard.html';
    }
});