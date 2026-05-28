# Modulo Interbancario SWIFT

Este modulo agrega interoperabilidad bancaria sin cambiar la transferencia local existente.
La API nueva vive bajo `/api/interbancaria`.

## Configuracion requerida

Para una base nueva en PostgreSQL/Railway, ejecutar desde el backend:

```powershell
npm run db:init
```

Si la base principal ya existe y solo quiere agregar las tablas SWIFT,
ejecutar el SQL incremental con `psql`:

```powershell
psql "%DATABASE_URL%" -f C:/BancoGT/BancoGT/database/schema_interbancario.sql
```

Variables recomendadas:

```env
BANK_NAME=Banco Industrial
BANK_SWIFT=INDLGTGC
INTERBANK_REQUEST_TIMEOUT_MS=10000
INTERBANK_API_KEY=clave-compartida-para-salidas
INTERBANK_REQUIRE_API_KEY=false
```

`INTERBANK_API_KEY` se envia a otros bancos como `X-API-Key`.
`INTERBANK_REQUIRE_API_KEY=true` obliga a que `/api/interbancaria/entrante`
reciba una API key valida registrada en `api_keys_bancos`.

## Bancos externos

Tabla: `bancos_externos`.

Campos principales:

- `nombre`
- `swift`
- `base_url`
- `endpoint_validacion`
- `endpoint_transferencia`
- `activo`

Ejemplo:

```sql
INSERT INTO bancos_externos
(nombre, swift, base_url, endpoint_validacion, endpoint_transferencia, activo)
VALUES
('Banco Demo', 'DEMOGTGC', 'https://banco-demo.up.railway.app',
 '/api/transferencia/validar',
 '/api/transferencias/interbancaria/entrante',
 TRUE);
```

## Endpoints propios

### GET /api/interbancaria/bancos

Requiere JWT.

Respuesta:

```json
{
  "success": true,
  "bancos": [
    {
      "id": 1,
      "nombre": "Banco Demo",
      "swift": "DEMOGTGC",
      "baseUrl": "https://banco-demo.up.railway.app",
      "endpointValidacion": "/api/transferencia/validar",
      "endpointTransferencia": "/api/transferencias/interbancaria/entrante",
      "activo": true
    }
  ]
}
```

### POST /api/interbancaria/validar-cuenta

Requiere JWT. Valida una cuenta local si el SWIFT es el del banco local,
o consulta el endpoint de validacion del banco externo.

Request:

```json
{
  "swift": "DEMOGTGC",
  "numeroCuenta": "GT200000001"
}
```

Respuesta esperada:

```json
{
  "success": true,
  "valida": true,
  "banco": {
    "nombre": "Banco Demo",
    "swift": "DEMOGTGC"
  },
  "respuestaBanco": {
    "success": true,
    "valida": true
  }
}
```

### POST /api/interbancaria/transferir

Requiere JWT. Realiza una transferencia saliente por SWIFT.

Headers:

```http
Authorization: Bearer JWT
Idempotency-Key: swift-demo-0001
Content-Type: application/json
```

Request:

```json
{
  "cuentaOrigen": "GT100000001",
  "cuentaDestino": "GT200000001",
  "swiftDestino": "DEMOGTGC",
  "monto": 125.50,
  "moneda": "GTQ",
  "descripcion": "Pago interbancario"
}
```

Respuesta confirmada:

```json
{
  "success": true,
  "message": "Transferencia interbancaria enviada",
  "transferencia": {
    "duplicate": false,
    "id": 1,
    "estado": "CONFIRMADA",
    "referenciaInterna": "SWIFT-OUT-...",
    "referenciaExterna": "EXT-123",
    "saldoNuevo": 9874.5
  }
}
```

Si se repite el mismo `Idempotency-Key`, responde la transferencia ya registrada.

### POST /api/interbancaria/entrante

Endpoint para otros bancos. No usa JWT porque lo consumen sistemas externos.
Puede protegerse con `X-API-Key` si `INTERBANK_REQUIRE_API_KEY=true`.

Request:

```json
{
  "idempotencyKey": "banco-demo-abc-001",
  "cuentaOrigen": "GT200000001",
  "cuentaDestino": "GT100000001",
  "swiftOrigen": "DEMOGTGC",
  "monto": 125.50,
  "moneda": "GTQ",
  "descripcion": "Transferencia recibida",
  "referenciaExterna": "EXT-123"
}
```

Respuesta:

```json
{
  "success": true,
  "message": "Transferencia interbancaria recibida y acreditada",
  "transferencia": {
    "duplicate": false,
    "id": 2,
    "estado": "CONFIRMADA",
    "referenciaInterna": "SWIFT-IN-...",
    "saldoNuevo": 10125.5
  }
}
```

Si la cuenta destino no existe:

```json
{
  "success": false,
  "estado": "RECHAZADA",
  "referenciaInterna": "SWIFT-IN-...",
  "error": "Cuenta destino local no encontrada"
}
```

## Formato enviado a otros bancos

Para validacion:

```json
{
  "numeroCuenta": "GT200000001",
  "cuenta": "GT200000001",
  "cuentaDestino": "GT200000001",
  "swiftDestino": "DEMOGTGC",
  "bancoDestinoSwift": "DEMOGTGC",
  "swiftOrigen": "INDLGTGC",
  "bancoOrigenSwift": "INDLGTGC"
}
```

Para transferencia:

```json
{
  "idempotencyKey": "swift-demo-0001",
  "referencia": "SWIFT-OUT-...",
  "referenciaExterna": "SWIFT-OUT-...",
  "cuentaOrigen": "GT100000001",
  "numeroCuentaOrigen": "GT100000001",
  "cuentaDestino": "GT200000001",
  "numeroCuentaDestino": "GT200000001",
  "bancoOrigen": "Banco Industrial",
  "bancoOrigenSwift": "INDLGTGC",
  "swiftOrigen": "INDLGTGC",
  "bancoDestinoSwift": "DEMOGTGC",
  "swiftDestino": "DEMOGTGC",
  "monto": 125.5,
  "moneda": "GTQ",
  "descripcion": "Pago interbancario"
}
```

## Estados

- `PENDIENTE`: transferencia creada o aceptada por banco externo como pendiente.
- `CONFIRMADA`: transferencia enviada/acreditada correctamente.
- `RECHAZADA`: cuenta externa/local invalida o banco externo rechazo.
- `ERROR`: fallo local despues de iniciar el flujo.

## Compatibilidad Railway

El modulo no depende de rutas absolutas ni de XAMPP. Para Railway se deben
configurar variables de entorno, base PostgreSQL accesible, MongoDB si se usa
Telegram, y URLs publicas en `bancos_externos.base_url`.
