const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const LOCAL_BANK_SWIFT = process.env.LOCAL_BANK_SWIFT || 'BIGT2026';
const LOCAL_BANK_NAME = process.env.BANK_NAME || 'Banco Industrial';

const swaggerSpec = swaggerJsdoc({
    definition: {
        openapi: '3.0.3',
        info: {
            title: 'BancoGT API',
            version: '1.0.0',
            description: [
                'Documentacion OpenAPI del backend BancoGT.',
                '',
                `Banco: ${LOCAL_BANK_NAME}`,
                `SWIFT: ${LOCAL_BANK_SWIFT}`,
                '',
                'El endpoint POST /api/interbancaria/entrante es publico para integraciones de otros bancos.',
                'Las rutas protegidas usan JWT BearerAuth.'
            ].join('\n')
        },
        servers: [
            {
                url: '/',
                description: 'Servidor actual'
            }
        ],
        tags: [
            { name: 'Salud', description: 'Estado del backend' },
            { name: 'Autenticacion', description: 'Login, registro y JWT' },
            { name: 'Operaciones', description: 'Operaciones de cuentas del usuario' },
            { name: 'Interbancaria', description: 'Transferencias interbancarias SWIFT' }
        ],
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT'
                }
            },
            schemas: {
                ErrorResponse: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean', example: false },
                        error: { type: 'string', example: 'Mensaje de error' },
                        details: { type: 'object', nullable: true }
                    }
                },
                HealthResponse: {
                    type: 'object',
                    properties: {
                        status: { type: 'string', example: 'OK' },
                        timestamp: { type: 'string', format: 'date-time' }
                    }
                },
                LoginRequest: {
                    type: 'object',
                    required: ['username', 'password'],
                    properties: {
                        username: { type: 'string', example: 'admin' },
                        password: { type: 'string', example: 'admin123' },
                        accessType: {
                            type: 'string',
                            enum: ['cliente', 'cajero'],
                            example: 'cliente'
                        }
                    }
                },
                LoginResponse: {
                    type: 'object',
                    properties: {
                        token: { type: 'string', example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' },
                        user: {
                            type: 'object',
                            properties: {
                                id: { type: 'integer', example: 1 },
                                username: { type: 'string', example: 'admin' },
                                email: { type: 'string', example: 'admin@bancogt.com' },
                                rol: { type: 'string', example: 'ADMIN' },
                                accessType: { type: 'string', example: 'cajero' },
                                codigo_empleado: { type: 'string', nullable: true, example: 'EMP001' },
                                dpi: { type: 'string', example: '1234567890101' }
                            }
                        }
                    }
                },
                RegisterRequest: {
                    type: 'object',
                    required: ['username', 'email', 'password', 'dpi'],
                    properties: {
                        username: { type: 'string', example: 'cliente1' },
                        email: { type: 'string', format: 'email', example: 'cliente1@email.com' },
                        password: { type: 'string', minLength: 6, example: 'secreto123' },
                        nombre_completo: { type: 'string', example: 'Juan Perez' },
                        dpi: { type: 'string', example: '1234567890101' },
                        regType: { type: 'string', enum: ['cliente', 'cajero'], example: 'cliente' },
                        codigo_empleado: { type: 'string', nullable: true, example: 'EMP009' }
                    }
                },
                RegisterResponse: {
                    type: 'object',
                    properties: {
                        message: { type: 'string', example: 'Usuario registrado exitosamente.' },
                        id_usuario: { type: 'integer', example: 12 }
                    }
                },
                Cuenta: {
                    type: 'object',
                    properties: {
                        id_cuenta: { type: 'integer', example: 3 },
                        numero_cuenta: { type: 'string', example: 'GT17798309563044741' },
                        id_cliente: { type: 'integer', example: 3 },
                        saldo: { type: 'string', example: '89500.00' },
                        estado: { type: 'string', example: 'ACTIVA' },
                        nombre_banco: { type: 'string', example: 'Banco Industrial' },
                        nombre_tipo: { type: 'string', example: 'Ahorro' },
                        moneda_codigo: { type: 'string', example: 'GTQ' }
                    }
                },
                BancoExterno: {
                    type: 'object',
                    properties: {
                        id: { type: 'integer', example: 1 },
                        nombre: { type: 'string', example: 'NovaBank' },
                        swift: { type: 'string', example: 'GTB666' },
                        baseUrl: { type: 'string', example: 'https://apibanca.onrender.com' },
                        endpointValidacion: { type: 'string', example: '/api/transferencia/validar' },
                        endpointTransferencia: { type: 'string', example: '/api/transferencias/interbancaria/entrante' },
                        activo: { type: 'boolean', example: true }
                    }
                },
                TransferenciaSalienteRequest: {
                    type: 'object',
                    required: ['cuentaOrigen', 'swiftDestino', 'cuentaDestino', 'monto'],
                    properties: {
                        cuentaOrigen: { type: 'string', example: 'GT17798309563044741' },
                        swiftDestino: { type: 'string', example: 'GTB666' },
                        cuentaDestino: { type: 'string', example: '128372706' },
                        monto: { type: 'number', example: 50.00 },
                        descripcion: { type: 'string', example: 'Pago interbancario' }
                    }
                },
                TransferenciaSalienteResponse: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean', example: true },
                        message: { type: 'string', example: 'Transferencia interbancaria enviada' },
                        transferencia: {
                            type: 'object',
                            properties: {
                                duplicate: { type: 'boolean', example: false },
                                id: { type: 'integer', example: 30 },
                                estado: { type: 'string', example: 'CONFIRMADA' },
                                referenciaInterna: { type: 'string', example: 'BIGT2026-20260528-143005-A1B2' },
                                transactionId: { type: 'string', example: 'BIGT2026-20260528-143005-A1B2' },
                                referenciaExterna: { type: 'string', nullable: true, example: 'EXT-9981' },
                                saldoNuevo: { type: 'number', example: 89450.00 }
                            }
                        }
                    }
                },
                TransferenciaEntranteEstandar: {
                    type: 'object',
                    required: ['TransactionID', 'cuentaOrigen', 'swiftOrigen', 'cuentaDestino', 'swiftDestino', 'NombreOrigen', 'monto'],
                    properties: {
                        TransactionID: { type: 'string', example: 'GTTBXXXX-20260528-143005-B7C9' },
                        cuentaOrigen: { type: 'string', example: 'TB-10001' },
                        swiftOrigen: { type: 'string', example: 'GTTBXXXX' },
                        cuentaDestino: { type: 'string', example: 'GT17798309563044741' },
                        swiftDestino: { type: 'string', example: 'BIGT2026' },
                        NombreOrigen: { type: 'string', example: 'Maria Lopez' },
                        monto: { type: 'number', example: 125.50 },
                        descripcion: { type: 'string', example: 'Transferencia recibida' }
                    }
                },
                TransferenciaEntranteResponse: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean', example: true },
                        estado: { type: 'string', example: 'CONFIRMADA' },
                        referenciaInterna: { type: 'string', example: 'GTTBXXXX-20260528-143005-B7C9' },
                        mensaje: { type: 'string', example: 'Transferencia recibida correctamente' }
                    }
                },
                HistorialInterbancarioItem: {
                    type: 'object',
                    properties: {
                        id: { type: 'integer', example: 30 },
                        fecha: { type: 'string', format: 'date-time' },
                        tipo: { type: 'string', enum: ['ENTRANTE', 'SALIENTE'], example: 'SALIENTE' },
                        bancoOrigen: { type: 'string', example: 'Banco Industrial (BIGT2026)' },
                        bancoDestino: { type: 'string', example: 'NovaBank (GTB666)' },
                        cuentaOrigen: { type: 'string', example: 'GT17798309563044741' },
                        cuentaDestino: { type: 'string', example: '128372706' },
                        monto: { type: 'string', example: '50.00' },
                        moneda: { type: 'string', example: 'GTQ' },
                        estado: { type: 'string', example: 'CONFIRMADA' },
                        referenciaInterna: { type: 'string', example: 'BIGT2026-20260528-143005-A1B2' },
                        referenciaExterna: { type: 'string', nullable: true, example: 'EXT-9981' },
                        errorMensaje: { type: 'string', nullable: true, example: null }
                    }
                }
            }
        },
        paths: {
            '/api/health': {
                get: {
                    tags: ['Salud'],
                    summary: 'Verifica que el backend este activo',
                    responses: {
                        200: {
                            description: 'Backend activo',
                            content: {
                                'application/json': {
                                    schema: { $ref: '#/components/schemas/HealthResponse' }
                                }
                            }
                        }
                    }
                }
            },
            '/api/auth/login': {
                post: {
                    tags: ['Autenticacion'],
                    summary: 'Inicia sesion y devuelve JWT',
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/LoginRequest' }
                            }
                        }
                    },
                    responses: {
                        200: {
                            description: 'Login correcto',
                            content: {
                                'application/json': {
                                    schema: { $ref: '#/components/schemas/LoginResponse' }
                                }
                            }
                        },
                        401: { description: 'Credenciales invalidas' },
                        403: { description: 'Rol no autorizado para el tipo de acceso' }
                    }
                }
            },
            '/api/auth/register': {
                post: {
                    tags: ['Autenticacion'],
                    summary: 'Registra usuario cliente o cajero',
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/RegisterRequest' }
                            }
                        }
                    },
                    responses: {
                        201: {
                            description: 'Usuario registrado',
                            content: {
                                'application/json': {
                                    schema: { $ref: '#/components/schemas/RegisterResponse' }
                                }
                            }
                        },
                        400: { description: 'Datos invalidos' },
                        500: { description: 'Error al crear usuario' }
                    }
                }
            },
            '/api/operaciones/mis-cuentas': {
                get: {
                    tags: ['Operaciones'],
                    summary: 'Lista cuentas activas del usuario autenticado',
                    security: [{ bearerAuth: [] }],
                    responses: {
                        200: {
                            description: 'Cuentas del usuario',
                            content: {
                                'application/json': {
                                    schema: {
                                        type: 'array',
                                        items: { $ref: '#/components/schemas/Cuenta' }
                                    }
                                }
                            }
                        },
                        401: { description: 'JWT requerido' },
                        403: { description: 'JWT invalido o expirado' }
                    }
                }
            },
            '/api/interbancaria/bancos': {
                get: {
                    tags: ['Interbancaria'],
                    summary: 'Lista bancos externos activos',
                    security: [{ bearerAuth: [] }],
                    responses: {
                        200: {
                            description: 'Bancos externos',
                            content: {
                                'application/json': {
                                    schema: {
                                        type: 'object',
                                        properties: {
                                            success: { type: 'boolean', example: true },
                                            bancos: {
                                                type: 'array',
                                                items: { $ref: '#/components/schemas/BancoExterno' }
                                            }
                                        }
                                    }
                                }
                            }
                        },
                        401: { description: 'JWT requerido' }
                    }
                }
            },
            '/api/interbancaria/transferir': {
                post: {
                    tags: ['Interbancaria'],
                    summary: 'Crea una transferencia interbancaria saliente',
                    description: 'El backend genera TransactionID con formato BIGT2026-YYYYMMDD-HHMMSS-XXXX y envia al banco externo el formato estandar acordado. TransactionID tambien se guarda como referencia interna e idempotencyKey.',
                    security: [{ bearerAuth: [] }],
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/TransferenciaSalienteRequest' },
                                examples: {
                                    transferenciaSaliente: {
                                        summary: 'Transferencia saliente',
                                        value: {
                                            cuentaOrigen: 'GT17798309563044741',
                                            swiftDestino: 'GTB666',
                                            cuentaDestino: '128372706',
                                            monto: 50.00,
                                            descripcion: 'Pago interbancario'
                                        }
                                    }
                                }
                            }
                        }
                    },
                    responses: {
                        201: {
                            description: 'Transferencia enviada',
                            content: {
                                'application/json': {
                                    schema: { $ref: '#/components/schemas/TransferenciaSalienteResponse' }
                                }
                            }
                        },
                        400: { description: 'Datos invalidos, cuenta rechazada o saldo insuficiente' },
                        401: { description: 'JWT requerido' },
                        502: { description: 'Banco externo no confirmo la transferencia' }
                    }
                }
            },
            '/api/interbancaria/entrante': {
                post: {
                    tags: ['Interbancaria'],
                    summary: 'Endpoint publico para transferencias entrantes de otros bancos',
                    description: 'Este endpoint no requiere JWT. Recibe el formato estandar acordado por los bancos. TransactionID se usa como referencia interna e idempotencyKey; la moneda se asume GTQ.',
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/TransferenciaEntranteEstandar' },
                                examples: {
                                    formatoEstandar: {
                                        summary: 'Formato estandar obligatorio',
                                        value: {
                                            TransactionID: 'GTTBXXXX-20260528-143005-B7C9',
                                            cuentaOrigen: 'TB-10001',
                                            swiftOrigen: 'GTTBXXXX',
                                            cuentaDestino: 'GT17798309563044741',
                                            swiftDestino: 'BIGT2026',
                                            NombreOrigen: 'Maria Lopez',
                                            monto: 125.50,
                                            descripcion: 'Transferencia recibida'
                                        }
                                    }
                                }
                            }
                        }
                    },
                    responses: {
                        201: {
                            description: 'Transferencia recibida',
                            content: {
                                'application/json': {
                                    schema: { $ref: '#/components/schemas/TransferenciaEntranteResponse' }
                                }
                            }
                        },
                        400: { description: 'Payload invalido o swiftDestino incorrecto' },
                        401: { description: 'API key interbancaria invalida si se exige' },
                        404: { description: 'Cuenta destino local no encontrada' }
                    }
                }
            },
            '/api/interbancaria/historial': {
                get: {
                    tags: ['Interbancaria'],
                    summary: 'Lista historial de transferencias interbancarias',
                    description: 'Clientes ven solo transferencias propias. Admin, cajero y gerente ven todas.',
                    security: [{ bearerAuth: [] }],
                    parameters: [
                        {
                            in: 'query',
                            name: 'limit',
                            required: false,
                            schema: { type: 'integer', minimum: 1, maximum: 500, default: 100 }
                        }
                    ],
                    responses: {
                        200: {
                            description: 'Historial interbancario',
                            content: {
                                'application/json': {
                                    schema: {
                                        type: 'object',
                                        properties: {
                                            success: { type: 'boolean', example: true },
                                            historial: {
                                                type: 'array',
                                                items: { $ref: '#/components/schemas/HistorialInterbancarioItem' }
                                            }
                                        }
                                    }
                                }
                            }
                        },
                        401: { description: 'JWT requerido' },
                        403: { description: 'JWT invalido o expirado' }
                    }
                }
            },
            '/api/interbancaria/comprobante/{referencia}': {
                get: {
                    tags: ['Interbancaria'],
                    summary: 'Descarga comprobante PDF de transferencia interbancaria confirmada',
                    security: [{ bearerAuth: [] }],
                    parameters: [
                        {
                            in: 'path',
                            name: 'referencia',
                            required: true,
                            schema: { type: 'string' },
                            example: 'BIGT2026-20260528-143005-A1B2'
                        }
                    ],
                    responses: {
                        200: {
                            description: 'Archivo PDF',
                            content: {
                                'application/pdf': {
                                    schema: {
                                        type: 'string',
                                        format: 'binary'
                                    }
                                }
                            }
                        },
                        400: { description: 'La transferencia no esta confirmada o referencia invalida' },
                        401: { description: 'JWT requerido' },
                        403: { description: 'El cliente no tiene permiso para este comprobante' },
                        404: { description: 'Comprobante no encontrado' }
                    }
                }
            }
        }
    },
    apis: []
});

function setupSwagger(app) {
    app.get('/api/docs.json', (req, res) => {
        res.json(swaggerSpec);
    });

    app.use('/api', (req, res, next) => {
        const assetPath = req.path.replace(/^\/+/, '');

        if (/^swagger-ui(?:-[\w-]+)?\.(?:js|css|map)$/.test(assetPath)
            || assetPath === 'swagger-ui-init.js'
            || /^favicon-\d+x\d+\.png$/.test(assetPath)) {
            return res.redirect(302, `/api/docs/${assetPath}`);
        }

        return next();
    });

    app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, { explorer: true }));
}

module.exports = {
    setupSwagger,
    swaggerSpec
};
